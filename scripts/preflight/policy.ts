// scripts/preflight/policy.ts — the CHANGE-SCOPED policy and the remedy catalog (spec §5, §8a, §8b).
// The single statement of which fact is OK/WARN/BLOCK for which consumer, and of who can fix it.
// Facts come from scripts/lib/env-facts.ts, which carries no policy.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { baseOf, isUnknown, type EnvFacts, type ReleasedNotDeployed } from "../lib/env-facts.ts";
import type { McpStatic } from "./mcp-static.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";

export type ChangeFor = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba";
export const CHANGE_FOR: readonly ChangeFor[] = ["ticket", "ticket-fast", "exploratory", "lifecycle", "domain-map", "ba"];
export type Status = "OK" | "WARN" | "BLOCK" | "UNKNOWN";
export type Who = "me" | "me, with OK" | "you";
export interface Check { id: string; status: Status; found: string; who: Who | null; do: string | null; diagnose: string[] }
export interface Duplicate { path: string; ageMinutes: number; verdict: string | null; priorBuild: string | null; priorPlatform: string | null }
export interface PolicyInput {
  for: ChangeFor; ticket?: string; domain?: string; expect?: { module: string; version: string };
  facts: EnvFacts; mcp: { servers: McpStatic[]; liveLanes: number; lanes: { min: number; want: number }; jsonError?: string | null };
  sprint: string | null; duplicate: Duplicate | null;
}

const isTicket = (f: ChangeFor) => f === "ticket" || f === "ticket-fast";
const DUP_WINDOW_MIN: Record<ChangeFor, number | null> = { "ticket": 120, "ticket-fast": 120, "exploratory": 1440, "lifecycle": 1440, "domain-map": null, "ba": null };
const SECRET = /PASSWORD|TOKEN|SECRET|KEY/;

const ok = (id: string, found: string): Check => ({ id, status: "OK", found, who: null, do: null, diagnose: [] });

export function resolveSprint(root: string): string | null {
  const dir = join(root, "reports/tickets");
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  if (names.includes("Sprint-current")) return "Sprint-current";
  const sprints = names.filter((n) => /^Sprint\d{2}-\d{2}$/.test(n)).sort();
  return sprints.at(-1) ?? null;
}

/**
 * A comparable id for the deployed MODULE set: `modules:<12 hex of sha1 over the sorted "id@version" lines>`.
 * The platform version is compared beside it (`priorPlatformOf`), not hashed in, so a summary written
 * before the platform was probed still compares by modules alone.
 */
export function buildFingerprint(modules: Record<string, { version: string } | string>): string {
  const lines = Object.entries(modules).map(([id, m]) => `${id.toLowerCase()}@${typeof m === "string" ? m : m?.version}`).sort();
  return `modules:${createHash("sha1").update(lines.join("\n")).digest("hex").slice(0, 12)}`;
}

/** The prior run's build: the fingerprint of its stored `preflight` block (the CLI JSON), else a legacy string. */
function priorBuildOf(json: any): string | null {
  const mods = json?.preflight?.facts?.deployed?.modules ?? json?.preflight?.deployed?.modules;
  if (mods && typeof mods === "object") return buildFingerprint(mods);
  const legacy = json?.build?.deployed?.platform ?? json?.build?.platform;
  return typeof legacy === "string" && !/UNKNOWN/i.test(legacy) ? legacy : null;
}

/** The prior run's live platform version, when its stored pre-flight had one; else null (unknown). */
function priorPlatformOf(json: any): string | null {
  const p = json?.preflight?.facts?.deployed?.platform;
  return typeof p === "string" ? p : null;
}

/** A prerelease `--expect` (a PR build) must be exactly that build; a release is met by any build of that base or later. */
function expectMet(live: string, want: string): boolean {
  return want.includes("-") ? live.toLowerCase() === want.toLowerCase() : cmpSemver(baseOf(live), want) >= 0;
}

/** Remedy for a requested storefront probe that could not run, by reason. */
function storefrontRemedy(reason: string, env: string): { who: Who; do: string } {
  if (reason === "no-back-or-front-url") return { who: "you", do: `set FRONT_URL and BACK_URL in .env.${env}` };
  if (reason === "front-url-unparsable") return { who: "you", do: `fix FRONT_URL in .env.${env} (a full https:// URL)` };
  if (reason === "no-store-for-domain") return { who: "you", do: `point FRONT_URL in .env.${env} at a host a store lists as its domain` };
  return { who: "me", do: "wait and re-run" };
}

export function findDuplicate(root: string, f: ChangeFor, opts: { ticket?: string; domain?: string; now: Date }): Duplicate | null {
  const windowMin = DUP_WINDOW_MIN[f];
  if (windowMin === null) return null;
  const candidates: string[] = [];
  if (isTicket(f) && opts.ticket) {
    const base = join(root, "reports/tickets");
    if (existsSync(base)) {
      try {
        for (const sprint of readdirSync(base)) {
          const p = join(base, sprint, opts.ticket, "summary.json");
          if (existsSync(p)) candidates.push(p);
        }
      } catch { /* unreadable dir ⇒ skip */ }
    }
  } else if (!isTicket(f) && (opts.domain || opts.ticket)) {
    const [dir, prefix] = f === "exploratory" ? ["reports/exploratory", "SBTM-"] : ["reports/test-lifecycle", "TLC-"];
    const base = join(root, dir);
    // Session files are named by ticket (SBTM-VCST-5317-…) as often as by domain: match either.
    const keys = [opts.domain, opts.ticket].filter((k): k is string => !!k).map((k) => k.toLowerCase());
    if (existsSync(base)) {
      try {
        for (const n of readdirSync(base))
          if (n.startsWith(prefix) && keys.some((k) => n.toLowerCase().includes(k))) candidates.push(join(base, n));
      } catch { /* unreadable dir ⇒ skip */ }
    }
  }
  let best: Duplicate | null = null;
  for (const p of candidates) {
    try {
      const ageMinutes = Math.round((opts.now.getTime() - statSync(p).mtimeMs) / 60_000);
      if (ageMinutes > windowMin) continue;
      let verdict: string | null = null, priorBuild: string | null = null, priorPlatform: string | null = null;
      if (p.endsWith(".json")) {
        try { const j = JSON.parse(readFileSync(p, "utf8")); verdict = typeof j.verdict === "string" ? j.verdict : null; priorBuild = priorBuildOf(j); priorPlatform = priorPlatformOf(j); } catch { /* unreadable ⇒ nulls */ }
        // No verdict ⇒ a run still in progress (e.g. the current one, which may already have written
        // its 1a status hop) — not a completed prior run.
        if (verdict === null) continue;
      }
      if (!best || ageMinutes < best.ageMinutes) best = { path: p.replace(root, "").replace(/^[\\/]/, "").replace(/\\/g, "/"), ageMinutes, verdict, priorBuild, priorPlatform };
    } catch { /* file deleted or unreadable ⇒ skip */ }
  }
  return best;
}

export function buildChecks(i: PolicyInput): Check[] {
  const f = i.facts;
  const checks: Check[] = [];

  // config — a missing CORE var blocks every consumer. Only a URL has a source Claude can read
  // (the env's own deploy); an account name or store id is the user's to supply.
  for (const v of f.config.missing) {
    const secret = SECRET.test(v), url = /_URL$/.test(v);
    checks.push({ id: `config:${v}`, status: "BLOCK", found: `${v} is not set in any .env layer`,
      who: url ? "me, with OK" : "you",
      do: secret ? `add ${v} to .env.local (value from the team secret store)` : url ? `add ${v} to .env.${f.env}` : `add ${v} to .env.${f.env} or .env.local (the value for this environment)`,
      diagnose: [`which layer: .env.defaults → .env.${f.env} → .env.local (value never printed)`] });
  }

  // health
  if (isUnknown(f.health)) checks.push({ id: "health", status: "UNKNOWN", found: `not probed: ${f.health.unknown}`, who: "you", do: `set BACK_URL in .env.${f.env}`, diagnose: [] });
  else if (f.health === "DOWN") checks.push({ id: "health", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${f.backUrl}/health is not 200`, who: "me",
    do: "wait for the deploy and re-run, or switch TEST_ENV", diagnose: ["/health detail", `gh run list on vc-deploy-dev for the ${f.env} branch`] });
  else checks.push(ok("health", "UP"));

  // declared
  // read over GitHub REST with GIT_TOKEN / GITHUB_TOKEN only — `gh` auth is not consulted
  if (isUnknown(f.declared)) checks.push({ id: "declared", status: "UNKNOWN", found: f.declared.unknown, who: "you", do: "set GIT_TOKEN in .env.local",
    diagnose: ["which .env layer GIT_TOKEN resolves from (value never printed)"] });
  else checks.push(ok("declared", `Platform ${f.declared.platform ?? "?"} · Theme ${f.declared.theme ?? "?"}`));

  // deployed — UNKNOWN is never upgraded; compute who/do for reuse by expect
  let deployedUnknownWho: Who | null = null, deployedUnknownDo: string | null = null, deployedUnknownFound: string | null = null;
  if (isUnknown(f.deployed)) {
    // Controller ruling 2: handle no-back-url specially
    if (f.deployed.unknown === "no-back-url") {
      deployedUnknownWho = "you";
      deployedUnknownDo = `set BACK_URL in .env.${f.env}`;
      deployedUnknownFound = "not probed: no-back-url";
      checks.push({ id: "deployed", status: "UNKNOWN", found: deployedUnknownFound, who: deployedUnknownWho, do: deployedUnknownDo, diagnose: [] });
    } else {
      // Controller ruling 1: ANY 4xx on the token call is a credentials problem; name the actual call in found
      const auth = /^token: 4\d\d$/.test(f.deployed.unknown) || /\b40[13]\b/.test(f.deployed.unknown);
      deployedUnknownWho = auth ? "you" : "me";
      deployedUnknownDo = auth ? "check ADMIN / ADMIN_PASSWORD in .env.local" : "wait and re-run";
      deployedUnknownFound = `${/^token: /.test(f.deployed.unknown) ? "POST /connect/token" : "/api/platform/modules"} → ${f.deployed.unknown}`;
      checks.push({ id: "deployed", status: "UNKNOWN", found: deployedUnknownFound, who: deployedUnknownWho, do: deployedUnknownDo,
        diagnose: ["which .env layer ADMIN_PASSWORD resolves from (value never printed)", "status of POST /connect/token"] });
    }
  } else checks.push(ok("deployed", `${Object.keys(f.deployed.modules).length} modules probed`));

  // drift
  if (!isUnknown(f.drift) && f.drift.length > 0)
    checks.push({ id: "drift", status: "WARN", found: `${f.drift.length} module(s) differ: ${f.drift.slice(0, 3).map((d) => `${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`).join(", ")}`,
      who: "me", do: "wait for the deploy to settle and re-run", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });

  // ledger — UNKNOWN (absent, unreadable, unparsed, or freshness undecidable) is a row, never silence
  const ledgerUnknown = isUnknown(f.ledger) ? f.ledger.unknown : f.ledger.stale === null ? `freshness undecidable (generated ${f.ledger.generated ?? "absent"})` : null;
  if (ledgerUnknown !== null) checks.push({ id: "ledger", status: "UNKNOWN", found: `release-ledger: ${ledgerUnknown}`, who: "me, with OK", do: "npm run releases:refresh, then commit",
    diagnose: ["npm run releases:check"] });
  if (!isUnknown(f.ledger)) {
    if (f.ledger.stale) checks.push({ id: "ledger", status: "WARN", found: `release-ledger generated ${f.ledger.generated}, past stale_after_days`, who: "me, with OK", do: "npm run releases:refresh, then commit", diagnose: [] });
    for (const b of f.ledger.breaking)
      checks.push({ id: `breaking:${b.repo}`, status: "WARN", found: `⚠ BREAKING ${b.component} ${b.version} (${b.month})`, who: "me",
        do: "name it in the report header; the consumer's rule for BREAKING applies", diagnose: [] });
    // Controller ruling 3: no not-deployed rows when deployed is unknown; one row per repo with its latest version
    if (!isUnknown(f.ledger.releasedNotDeployed)) {
      const byRepo = new Map<string, ReleasedNotDeployed>();
      for (const r of f.ledger.releasedNotDeployed) {
        const existing = byRepo.get(r.repo);
        if (!existing || cmpSemver(r.released, existing.released) > 0) byRepo.set(r.repo, r);
      }
      for (const r of byRepo.values())
        checks.push({ id: `not-deployed:${r.repo}`, status: "WARN", found: `${r.component} ${r.released} released, deployed ${r.deployed ?? "none"}`, who: "me",
          do: "do not test it on this stand; report it as not deployed", diagnose: [] });
    }
    // Its own id: "the deployed version cannot be read" is not "it is not deployed", and consumers
    // treat not-deployed:* as BLOCKED-on-deploy — an UNKNOWN must never be filtered in with it.
    for (const r of f.ledger.noLiveSource ?? [])
      checks.push({ id: `unknown-deployed:${r.repo}`, status: "UNKNOWN", found: `${r.component} ${r.released} released; no live source reports the deployed ${r.repo} version`, who: "you",
        do: `confirm the deployed ${r.component} version on the stand before testing what ${r.released} ships`, diagnose: [] });
  }

  // components — an input with no repo silently drops out of breaking / not-deployed, so say so
  for (const c of f.components) if (!c.repo)
    checks.push({ id: `component:${c.input}`, status: "UNKNOWN", found: "not mapped to a repo", who: "you",
      do: "pass its vc-module-* repo or VirtoCommerce.* id in --components", diagnose: [] });

  // storefront — only when requested (null = not requested)
  if (f.storefrontVisible !== null && isUnknown(f.storefrontVisible)) {
    const r = storefrontRemedy(f.storefrontVisible.unknown, f.env);
    checks.push({ id: "storefront", status: "UNKNOWN", found: `InitializeApplication not probed: ${f.storefrontVisible.unknown.slice(0, 120)}`, who: r.who, do: r.do, diagnose: [] });
  }

  // expect — is the change under test on the stand; when deployed is UNKNOWN, inherit its who/do but change status for tickets
  if (i.expect) {
    const id = i.expect.module.toLowerCase();
    const live = isUnknown(f.deployed) ? null : f.deployed.modules[id]?.version ?? null;
    if (isUnknown(f.deployed)) checks.push({ id: "expect", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${i.expect.module} — deployed state unknown`, who: deployedUnknownWho, do: deployedUnknownDo, diagnose: [] });
    else if (live !== null && expectMet(live, i.expect.version)) checks.push(ok("expect", `${i.expect.module} ${live}`));
    else checks.push({ id: "expect", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${i.expect.module} ${i.expect.version} not deployed (has ${live ?? "none"})`,
      who: "me, with OK", do: `/qa-deploy-pr ${i.ticket ?? "<KEY>"}, or wait`, diagnose: ["is the PR artifact built", "is it in vc-deploy-dev backend/packages.json"] });
  }

  // sprint (ticket only)
  if (isTicket(i.for)) checks.push(i.sprint ? ok("sprint", i.sprint)
    : { id: "sprint", status: "UNKNOWN", found: "no reports/tickets/SprintXX-XX folder", who: "you", do: "name the sprint folder to create", diagnose: [] });

  // duplicate
  if (i.duplicate) {
    const prior = i.duplicate.priorBuild;
    const current = isUnknown(f.deployed) ? null : buildFingerprint(f.deployed.modules);
    // The platform counts only when both runs read it live; an older summary compares by modules alone.
    const nowPlatform = !isUnknown(f.deployed) && typeof f.deployed.platform === "string" ? f.deployed.platform : null;
    const platformMoved = !!i.duplicate.priorPlatform && !!nowPlatform && i.duplicate.priorPlatform !== nowPlatform;
    const build = !prior ? "" : prior.startsWith("modules:") && current
      ? (prior === current && !platformMoved ? ", same build" : `, different build${platformMoved ? ` (platform ${i.duplicate.priorPlatform}→${nowPlatform})` : ""}`)
      : `, build ${prior}`;
    checks.push({ id: "duplicate", status: "WARN",
      found: `ran ${i.duplicate.ageMinutes} min ago${build}${i.duplicate.verdict ? `, verdict ${i.duplicate.verdict}` : ""}`,
      who: "you", do: `re-run overwrites ${i.duplicate.path} — commit it first if uncommitted`, diagnose: [] });
  }

  // .mcp.json that does not parse — its servers count as unconfigured below
  if (i.mcp.jsonError) checks.push({ id: "mcp:.mcp.json", status: "UNKNOWN", found: `malformed .mcp.json: ${i.mcp.jsonError}`, who: "you",
    do: "fix the JSON in .mcp.json, then restart the session", diagnose: [] });

  // MCP levels 1–2 (user-scope servers are the skill's)
  for (const s of i.mcp.servers) {
    if (s.level === "READY" || s.level === "NOT_VISIBLE" || s.class === "OPT") continue;
    const id = `mcp:${s.server}`;
    if (s.class === "REQ") checks.push({ id, status: "BLOCK", found: `${s.level}${s.problem ? `: ${s.problem}` : ""}`, who: "you", do: "configure it in .mcp.json, then restart the session", diagnose: [] });
    else checks.push({ id, status: "WARN", found: `${s.level}${s.problem ? `: ${s.problem}` : ""} — working via ${s.fallback}`, who: "you",
      do: s.problem ? "fix the entry in .mcp.json, then restart the session" : "add it to .mcp.json and restart, or keep the fallback", diagnose: [] });
  }
  if (i.mcp.liveLanes < i.mcp.lanes.min) checks.push({ id: "lanes", status: "BLOCK", found: `${i.mcp.liveLanes} Playwright lane(s) ready, ${i.mcp.lanes.min} required`, who: "you", do: "configure a pinned playwright-* server in .mcp.json and restart", diagnose: [] });
  else if (i.mcp.liveLanes < i.mcp.lanes.want) checks.push({ id: "lanes", status: "WARN", found: `${i.mcp.liveLanes} of ${i.mcp.lanes.want} lanes ready — the run serialises`, who: "you", do: "proceed serially, or configure the missing lanes", diagnose: [] });

  return checks;
}

export const isBlocking = (checks: Check[]) => checks.some((c) => c.status === "BLOCK");
