#!/usr/bin/env node
// resolve-task.mjs — turn a JIRA task key into gen-manifest flags, deterministically.
//
// WHAT IT DOES (Phase 2 — the automated "resolve" step of /qa-local-env)
//   Given VCST-XXXX it queries JIRA + GitHub over REST and finds the per-PR pre-release module
//   builds the task needs, then emits `--prerelease Id=Version` flags for gen-manifest.mjs.
//   This replaces the agent reading the ticket by hand.
//
//   1. JIRA: fetch the issue (description + comments) and its GitHub "development" links.
//      Collect candidate PR URLs from (a) the dev-status API and (b) a regex over the
//      description + every comment.
//   2. GitHub: for each PR, fetch the body and extract the CI pre-release `Artifact URL`
//      (https://vc3prerelease.blob.core.windows.net/<container>/<Id>_<Version>.zip). The file
//      name IS the answer — {Id}_{Version} — no repo→module map needed.
//   3. Emit `--prerelease <Id>=<Version>` per artifact (PRs without an artifact are skipped).
//
//   Prose prerequisites ("Catalog 3.1028.0+", "Platform 3.1034.0+") are intentionally NOT parsed
//   from free text — the vcptcore-demo baseline almost always already satisfies them. Pass any
//   genuine extra bump explicitly with --require / --platform; they are forwarded to gen-manifest.
//
// USAGE
//   node resolve-task.mjs VCST-5173                       # print resolved flags + summary
//   node resolve-task.mjs VCST-5173 --json               # machine-readable resolution
//   node resolve-task.mjs VCST-5173 --gen --print        # also run gen-manifest with the flags
//   node resolve-task.mjs --pr VirtoCommerce/vc-module-x-cart#122   # debug: skip JIRA, test one PR
//
//   --gen                 after resolving, invoke gen-manifest.mjs with the flags (writes the manifest)
//   --print               (with --gen) pass --print to gen-manifest
//   --json                print the resolution as JSON (key, prs[], prereleases[], flags)
//   --pr <owner/repo#N>   debug: resolve directly from these PR(s), no JIRA (repeatable)
//   --require <Id>=<Ver>  forwarded to gen-manifest (released min-version bump)
//   --platform <Ver>      forwarded to gen-manifest (platform bump)
//   --branch <deploy>     forwarded to gen-manifest (baseline deploy branch)
//   --out <path>          forwarded to gen-manifest (manifest output path)
//
// ENV (loaded from .env.local / .env.<env> / .env.defaults):
//   JIRA_EMAIL, JIRA_API_TOKEN         JIRA REST Basic auth (token: id.atlassian.com/manage-profile/security/api-tokens)
//   JIRA_BASE_URL                      default https://virtocommerce.atlassian.net
//   GIT_TOKEN (or GITHUB_PERSONAL_ACCESS_TOKEN / GITHUB_TOKEN)   GitHub REST auth
//
// Zero runtime deps beyond dotenv (already a project dep) + Node 18+ global fetch.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL_DIR, "..", "..", "..", "..");

// Layered env load (best-effort; later overrides earlier), mirroring config.js order.
try {
  const require = createRequire(import.meta.url);
  const dotenv = require("dotenv");
  const TEST_ENV = process.env.TEST_ENV || "localhost";
  // NOTE: do NOT pull .env.vcst here — JIRA_EMAIL must be the token owner's account, which lives in
  // .env.local (loaded last). Other envs' JIRA_EMAIL (e.g. .env.vcst) would mismatch the token → 401.
  for (const f of [".env.defaults", `.env.${TEST_ENV}`, ".env.local"]) {
    dotenv.config({ path: resolve(REPO, f), override: true, quiet: true });
  }
} catch { /* dotenv missing — rely on process.env */ }

const ARTIFACT_RE = /https?:\/\/vc3prerelease\.blob\.core\.windows\.net\/[^\s)"'<>]+?\.zip/gi;
const PR_URL_RE = /github\.com\/(VirtoCommerce)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/gi;

function parseArgs(argv) {
  const o = { key: null, gen: false, print: false, json: false, prs: [], passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--gen") o.gen = true;
    else if (a === "--print") o.print = true;
    else if (a === "--json") o.json = true;
    else if (a === "--pr") o.prs.push(next());
    else if (a === "--require" || a === "--platform" || a === "--branch" || a === "--out") { o.passthrough.push(a, next()); }
    else if (a === "-h" || a === "--help") { printBanner(); process.exit(0); }
    else if (!a.startsWith("--") && !o.key) o.key = a;
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  if (!o.key && o.prs.length === 0) { console.error("Provide a task key (e.g. VCST-5173) or --pr <owner/repo#N>."); process.exit(2); }
  return o;
}
function printBanner() {
  console.log("resolve-task.mjs — JIRA task → gen-manifest --prerelease flags. See file header for usage.");
}

function ghHeaders() {
  const tok = process.env.GIT_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
  if (!tok) { console.error("No GitHub token (GIT_TOKEN). Cannot read PR bodies."); process.exit(1); }
  return { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "User-Agent": "vc-qa-local-env" };
}
function jiraAuth() {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) {
    console.error("JIRA creds missing. Set BOTH JIRA_EMAIL and JIRA_API_TOKEN in .env.local — and");
    console.error("they MUST belong to the SAME Atlassian account (the one that created the token),");
    console.error("else JIRA returns 401. Token: https://id.atlassian.com/manage-profile/security/api-tokens");
    process.exit(1);
  }
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}
const jiraBase = () => (process.env.JIRA_BASE_URL || "https://virtocommerce.atlassian.net").replace(/\/$/, "");

async function jiraGet(path) {
  const res = await fetch(`${jiraBase()}${path}`, { headers: { Authorization: jiraAuth(), Accept: "application/json" } });
  if (!res.ok) throw new Error(`JIRA ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

// Collect candidate PRs for a JIRA key from dev-status + a regex over description/comments.
async function prsFromJira(key) {
  const issue = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,comment`);
  const found = new Map(); // "owner/repo#n" → {owner,repo,number,source}
  const add = (owner, repo, number, source) => {
    const id = `${owner}/${repo}#${number}`;
    if (!found.has(id)) found.set(id, { owner, repo, number: Number(number), source });
  };
  // (a) dev-status API (the "Development" panel) — most authoritative when GitHub is linked.
  try {
    const ds = await jiraGet(`/rest/dev-status/latest/issue/detail?issueId=${issue.id}&applicationType=GitHub&dataType=pullrequest`);
    for (const d of ds.detail || []) for (const pr of d.pullRequests || []) {
      const m = PR_URL_RE.exec(pr.url || ""); PR_URL_RE.lastIndex = 0;
      if (m) add(m[1], m[2], m[3], "dev-status");
    }
  } catch (e) { /* dev-status may be unavailable; fall back to text scan */ }
  // (b) regex over the whole issue payload (description ADF + comments) for PR URLs.
  const blob = JSON.stringify(issue);
  let m; PR_URL_RE.lastIndex = 0;
  while ((m = PR_URL_RE.exec(blob)) !== null) add(m[1], m[2], m[3], "text");
  return { summary: issue.fields?.summary, prs: [...found.values()] };
}

async function artifactFromPr({ owner, repo, number }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { headers: ghHeaders() });
  if (!res.ok) return { owner, repo, number, kind: "error", error: `GitHub ${res.status}` };
  const pr = await res.json();
  const urls = (pr.body || "").match(ARTIFACT_RE) || [];
  if (urls.length === 0) return { owner, repo, number, state: pr.state, kind: "none" };
  // Last artifact URL wins (PR bodies sometimes list older then newer).
  const url = urls[urls.length - 1];
  const file = decodeURIComponent(url.split("/").pop());
  // Frontend storefront theme build (vc-frontend repo or a vc-theme-*.zip) → goes to provision
  // -FrontendUrl, NOT the backend manifest.
  if (repo.toLowerCase() === "vc-frontend" || /^vc-theme/i.test(file)) {
    return { owner, repo, number, state: pr.state, kind: "frontend", url, file };
  }
  // Backend module pre-release: file name is {VirtoCommerce.Module}_{Version}.zip.
  const fm = file.replace(/\.zip$/i, "").match(/^(VirtoCommerce\.[A-Za-z0-9.]+)_(\d.*)$/);
  if (fm) return { owner, repo, number, state: pr.state, kind: "module", url, id: fm[1], version: fm[2] };
  return { owner, repo, number, state: pr.state, kind: "unknown", url, file };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let summary = null, prRefs;
  if (o.prs.length) {
    prRefs = o.prs.map((s) => { const m = s.match(/^([^/]+)\/([^#]+)#(\d+)$/); if (!m) { console.error(`Bad --pr "${s}" (want owner/repo#N)`); process.exit(2); } return { owner: m[1], repo: m[2], number: Number(m[3]), source: "--pr" }; });
  } else {
    const r = await prsFromJira(o.key); summary = r.summary; prRefs = r.prs;
  }

  const resolved = [];
  for (const ref of prRefs) resolved.push(await artifactFromPr(ref));
  const prereleases = resolved.filter((r) => r.kind === "module").map((r) => ({ id: r.id, version: r.version, pr: `${r.owner}/${r.repo}#${r.number}` }));
  const frontends = resolved.filter((r) => r.kind === "frontend");
  const frontendUrl = frontends.length ? frontends[frontends.length - 1].url : null;

  // Backend flags go to gen-manifest; the frontend theme build goes to provision -FrontendUrl.
  const flags = [];
  for (const p of prereleases) flags.push("--prerelease", `${p.id}=${p.version}`);
  flags.push(...o.passthrough);

  // Verification: assert each pinned pre-release is ACTUALLY loaded (not silently the released
  // module). Version may collide (the artifact filename's -pr suffix is often absent from the
  // module.manifest), so this is a loud advisory — pair it with a behaviour/schema --graphql probe.
  const verifyFlags = prereleases.flatMap((p) => ["--expect-module", `${p.id}=${p.version}`]);

  if (o.json) {
    console.log(JSON.stringify({ key: o.key, summary, prs: resolved, prereleases, frontendUrl, flags, verifyFlags }, null, 2));
  } else {
    console.log(`resolve-task :: ${o.key || "(--pr mode)"}${summary ? ` — ${summary}` : ""}`);
    if (resolved.length === 0) console.log("  no linked PRs found");
    for (const r of resolved) {
      const ref = `${r.owner}/${r.repo}#${r.number}`;
      if (r.kind === "module") console.log(`  ✓ ${ref} [${r.state}] → ${r.id}=${r.version}  (backend module)`);
      else if (r.kind === "frontend") console.log(`  ⎙ ${ref} [${r.state}] → frontend build ${r.file}`);
      else if (r.kind === "error") console.log(`  ! ${ref} → ${r.error}`);
      else if (r.kind === "unknown") console.log(`  ? ${ref} [${r.state}] → artifact not recognised: ${r.file}`);
      else console.log(`  · ${ref} [${r.state}] → no pre-release Artifact URL (skipped)`);
    }
    if (frontends.length > 1) console.log(`  (note: ${frontends.length} frontend builds found — using the last)`);
    console.log(`\n  gen-manifest flags : ${flags.length ? flags.join(" ") : "(none — pure baseline)"}`);
    console.log(`  provision frontend : ${frontendUrl ? `-FrontendUrl "${frontendUrl}"` : "(none — latest release)"}`);
    if (verifyFlags.length) {
      console.log(`  verify loaded      : node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --password 'Password1!' ${verifyFlags.join(" ")}`);
      console.log(`  ⚠ pre-release versions can collide with the release — also confirm the PR by behaviour:`);
      console.log(`     …/healthcheck.mjs --graphql '{ __type(name: "<TaskType>") { fields { name } } }'`);
    }
  }

  if (o.gen) {
    const genArgs = [resolve(SKILL_DIR, "gen-manifest.mjs"), ...flags];
    if (o.print) genArgs.push("--print");
    console.log(`\n▶ node gen-manifest.mjs ${flags.join(" ")}${o.print ? " --print" : ""}\n`);
    const r = spawnSync("node", genArgs, { cwd: REPO, stdio: "inherit" });
    if (r.status) process.exit(r.status);
    if (frontendUrl) console.log(`\nNext (provision with the task's frontend build):\n  pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action up \`\n    -Manifest .local-env/packages.custom.json -FrontendUrl "${frontendUrl}"`);
    if (verifyFlags.length) console.log(`\nAfter it is up, VERIFY the pinned pre-release is actually loaded:\n  node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --password 'Password1!' ${verifyFlags.join(" ")}\n  (version may collide with the release — also probe the PR's new field via --graphql)`);
    process.exit(0);
  }
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
