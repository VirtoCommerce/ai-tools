#!/usr/bin/env -S npx tsx
/**
 * `npm run release:delivery -- <release> [--json] [--out <file>] [--accept delivery:KEY,…] [--theme <zip name>] [--write]` — is everything the
 * release is about to test actually on its stand? Run by the planner after Step 8 (sprint-mode.md), by the W0 owner
 * before W0 and by every wave owner before their wave (waves.md Step 0). Read-only.
 *
 * Tickets: the sprint's Done tickets (Jira, `release.json` `sprint.label`) plus every ticket a component of the stand
 * picked up since `sprint.startDate` (commits between the vc-deploy-dev manifest then and the stand now). Per ticket,
 * every PR in the org that names it is checked against the build the stand runs for that repo (scripts/preflight/delivery.ts).
 *
 * Exit: 0 nothing blocks · 2 a ticket is PARTIAL, or a sprint ticket is NOT_DELIVERED and not accepted · 1 usage · 3 could not run.
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getEnvFacts, isUnknown } from "../lib/env-facts.ts";
import { fetchFile, makeHttp } from "../deploy/lib/github.ts";
import { resolveEnvCoords } from "../deploy/lib/env.ts";
import { blobBase } from "../deploy/lib/pins.ts";
import { buildFingerprint, DELIVERY_FILE, deliveryChecks, deliveryOfTicket, standBuild, standChangeTickets, standPlatform, type TicketDelivery } from "../preflight/delivery.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const VALUED = new Set(["--out", "--accept", "--theme"]);
const release = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUED.has(argv[i - 1])))[0];
if (!release) { console.error("usage: npm run release:delivery -- <release> [--json] [--out <file>] [--accept delivery:KEY,…]"); process.exit(1); }
const accepted = (flag("accept") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (accepted.some((a) => !a.startsWith("delivery:"))) { console.error("--accept takes delivery:<KEY> ids only"); process.exit(1); }

const root = process.env.QA_RUN_HOME || process.cwd();
const relFile = join(root, "regression", "releases", release, "release.json");
if (!existsSync(relFile)) { console.error(`no ${relFile}`); process.exit(1); }
const rel = JSON.parse(readFileSync(relFile, "utf8"));
const env: string = rel.env?.testEnv ?? "vcst";
const project = typeof rel.ticket === "string" ? rel.ticket.split("-")[0] : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sprintDoneTickets(label: string): Promise<string[]> {
  const base = (process.env.JIRA_BASE_URL ?? process.env.JIRA_BASE ?? "").replace(/\/+$/, "");
  if (!base || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) throw new Error("JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN are not set (.env.local)");
  const auth = "Basic " + Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  // release.json keeps the plan's label (Sprint26-22); the tracker's sprint is named "VCST Sprint 26-22". A wrong name
  // answers 0 issues or 400, never an error worth stopping on — so try the spellings in turn, and say which matched.
  const nn = /(\d{2}-\d{2})/.exec(label)?.[1];
  const names = [...new Set([label, ...(nn ? [`${project ?? ""} Sprint ${nn}`.trim(), `Sprint ${nn}`, `Sprint${nn}`] : [])])];
  for (const name of names) {
    const jql = `${project ? `project = ${project} AND ` : ""}sprint = "${name}" AND statusCategory = Done AND status != Cancelled`;
    const keys: string[] = [];
    let ok = true;
    for (let token: string | undefined, i = 0; i < 20; i++) {
      const res = await fetch(`${base}/rest/api/3/search/jql`, { method: "POST", headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ jql, fields: ["key"], maxResults: 100, ...(token ? { nextPageToken: token } : {}) }) });
      if (!res.ok) { ok = false; break; }
      const j: any = await res.json();
      keys.push(...(j.issues ?? []).map((x: any) => x.key));
      token = j.nextPageToken; if (!token) break;
    }
    if (ok && keys.length) { console.error(`release:delivery: sprint "${name}" — ${keys.length} Done ticket(s)`); return keys; }
  }
  return []; // deliveryChecks reports "no sprint Done ticket was read" as UNKNOWN
}

try {
  const facts = await getEnvFacts({ env, storefront: true }); // loads the env layers + the GitHub token
  if (isUnknown(facts.declared) || isUnknown(facts.deployed)) throw new Error(`stand build unknown: declared ${JSON.stringify(facts.declared).slice(0, 80)}, deployed ${JSON.stringify(facts.deployed).slice(0, 80)}`);
  // A run makes a few hundred GitHub calls: retry a dropped connection, never a rate limit or a 4xx.
  const raw = makeHttp();
  const retry = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    for (let i = 0; ; i++) {
      try { return await f(...a); } catch (e) {
        if (i >= 5 || /rate-limited|API error 4/.test((e as Error).message)) throw e;
        await sleep(3000 * 2 ** i); // 3, 6, 12, 24, 48 s: GitHub 5xx bursts last a while
      }
    }
  };
  // The search API allows 30 calls a minute, so a second run within the hour reuses the first one's answers
  // (which PRs name a ticket changes rarely; whether a PR is IN the build is always asked again).
  const cacheFile = join(tmpdir(), "vc-release-delivery-search.json");
  let cache: Record<string, { at: number; body: unknown }> = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { cache = {}; }
  let searches = 0;
  const gh = retry(raw.gh);
  const http = { ...raw, ghAll: retry(raw.ghAll), getText: retry(raw.getText), getJson: retry(raw.getJson), head: retry(raw.head),
    gh: async (p: string) => {
      if (!p.startsWith("/search/")) return gh(p);
      const hit = cache[p];
      if (hit && Date.now() - hit.at < 3_600_000) return hit.body;
      if (searches++) await sleep(2100);
      const body = await gh(p);
      cache[p] = { at: Date.now(), body };
      try { writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* a cache is optional */ }
      return body;
    } };
  const c = resolveEnvCoords(env);
  const base = blobBase((await fetchFile(c, c.packagesPath)).json); // the manifest's AzureBlob source, never a typed URL
  const platform = standPlatform(facts.declared.platform, isUnknown(facts.deployed.platform) ? null : facts.deployed.platform);
  // --theme: "what if the stand ran this theme zip" — checks a candidate before it is deployed.
  const build = await standBuild(http, flag("theme") ?? facts.declared.theme, facts.deployed.modules, platform, base);
  const notes: string[] = [];
  if (!isUnknown(facts.deployedTheme) && facts.declared.theme && !facts.declared.theme.includes(facts.deployedTheme))
    notes.push(`storefront serves ${facts.deployedTheme}, the manifest pins ${facts.declared.theme} — the deploy has not rolled over yet`);
  if (build.theme.note) notes.push(`theme ${build.theme.label}: ${build.theme.note}`);

  const sources = new Map<string, string[]>();
  const add = (k: string, s: string) => sources.set(k, [...(sources.get(k) ?? []), s]);
  if (rel.sprint?.label) for (const k of await sprintDoneTickets(rel.sprint.label)) add(k, "sprint");
  if (rel.sprint?.startDate) {
    const ch = await standChangeTickets(http, { deployRepo: `${c.deployOwner}/${c.deployRepo}`, branch: c.branch, packagesPath: c.packagesPath, themePath: c.themePath, since: `${rel.sprint.startDate}T00:00:00Z`, build, project, blobBase: base });
    for (const [k, srcs] of ch.keys) for (const s of srcs) add(k, s);
    notes.push(...ch.notes);
  }

  const rows: TicketDelivery[] = [];
  for (const [key, srcs] of sources) {
    rows.push(await deliveryOfTicket(http, key, srcs, build));
  }
  const checks = deliveryChecks(rows, accepted, notes);
  const blocking = checks.some((c) => c.status === "BLOCK");
  const fingerprint = flag("theme") ? null : buildFingerprint(facts.declared.theme, platform, facts.deployed.modules);
  const out = { release, env, observedAt: facts.observedAt, fingerprint, notes, theme: { file: build.theme.label, commit: build.theme.ref, note: build.theme.note ?? null }, tickets: rows, checks, verdict: blocking ? "NOT READY" : "READY" };
  if (flag("out")) writeFileSync(flag("out")!, JSON.stringify(out, null, 2) + "\n");
  // --write: the release folder's copy, which every wave's pre-flight reads (regression:plan --preflight --release).
  if (argv.includes("--write")) {
    if (!fingerprint) { console.error("--write is refused with --theme: the result does not describe the stand"); process.exit(1); }
    writeFileSync(join(root, "regression", "releases", release, DELIVERY_FILE), JSON.stringify(out, null, 2) + "\n");
  }
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`release:delivery ${release} on ${env} — theme ${build.theme.label} (${build.theme.ref?.slice(0, 8) ?? "commit unknown"}), ${rows.length} ticket(s)`);
    for (const v of ["PARTIAL", "NOT_DELIVERED", "INCOMPLETE", "UNKNOWN"] as const) {
      const list = rows.filter((r) => r.verdict === v && (v === "PARTIAL" || v === "UNKNOWN" || r.sources.includes("sprint")));
      if (!list.length) continue;
      console.log(`\n${v} (${list.length})`);
      for (const r of list) console.log(`  ${r.key} [${r.sources.join("; ")}]: ${r.prs.filter((p) => p.state !== "NOT_ON_STAND" && p.state !== "OTHER_LINE").map((p) => `${p.repo.replace("VirtoCommerce/", "")}#${p.number} ${p.state}`).join(", ")}`);
    }
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    console.log(`\n${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
    for (const n of notes) console.log(`note: ${n}`);
    console.log(`\nverdict: ${out.verdict}${blocking ? " — tell the W0 owner and the release ticket before any wave starts (waves.md Step 0)" : ""}`);
  }
  process.exit(blocking ? 2 : 0);
} catch (e) {
  console.error(`release:delivery could not run: ${(e as Error).message}`);
  process.exit(3);
}
