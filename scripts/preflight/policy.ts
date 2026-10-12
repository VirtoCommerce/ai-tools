// scripts/preflight/policy.ts — the CHANGE-SCOPED policy and the remedy catalog (spec §5, §8a, §8b).
// The single statement of which fact is OK/WARN/BLOCK for which consumer, and of who can fix it.
// Facts come from scripts/lib/env-facts.ts, which carries no policy.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { McpStatic } from "./mcp-static.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";

export type ChangeFor = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba";
export const CHANGE_FOR: readonly ChangeFor[] = ["ticket", "ticket-fast", "exploratory", "lifecycle", "domain-map", "ba"];
export type Status = "OK" | "WARN" | "BLOCK" | "UNKNOWN";
export type Who = "me" | "me, with OK" | "you";
export interface Check { id: string; status: Status; found: string; who: Who | null; do: string | null; diagnose: string[] }
export interface Duplicate { path: string; ageMinutes: number; verdict: string | null; priorBuild: string | null }
export interface PolicyInput {
  for: ChangeFor; ticket?: string; domain?: string; expect?: { module: string; version: string };
  facts: EnvFacts; mcp: { servers: McpStatic[]; liveLanes: number; lanes: { min: number; want: number } };
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

function priorBuildOf(json: any): string | null {
  const p = json?.preflight?.deployed;
  if (p && !p.unknown && p.modules) return `deployed modules @ ${json.preflight.observedAt ?? "?"}`;
  const legacy = json?.build?.deployed?.platform ?? json?.build?.platform;
  return typeof legacy === "string" && !/UNKNOWN/i.test(legacy) ? legacy : null;
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
  } else if (!isTicket(f) && opts.domain) {
    const [dir, prefix] = f === "exploratory" ? ["reports/exploratory", "SBTM-"] : ["reports/test-lifecycle", "TLC-"];
    const base = join(root, dir);
    if (existsSync(base)) {
      try {
        for (const n of readdirSync(base))
          if (n.startsWith(prefix) && n.toLowerCase().includes(opts.domain.toLowerCase())) candidates.push(join(base, n));
      } catch { /* unreadable dir ⇒ skip */ }
    }
  }
  let best: Duplicate | null = null;
  for (const p of candidates) {
    try {
      const ageMinutes = Math.round((opts.now.getTime() - statSync(p).mtimeMs) / 60_000);
      if (ageMinutes > windowMin) continue;
      let verdict: string | null = null, priorBuild: string | null = null;
      if (p.endsWith(".json")) {
        try { const j = JSON.parse(readFileSync(p, "utf8")); verdict = typeof j.verdict === "string" ? j.verdict : null; priorBuild = priorBuildOf(j); } catch { /* unreadable ⇒ nulls */ }
      }
      if (!best || ageMinutes < best.ageMinutes) best = { path: p.replace(root, "").replace(/^[\\/]/, "").replace(/\\/g, "/"), ageMinutes, verdict, priorBuild };
    } catch { /* file deleted or unreadable ⇒ skip */ }
  }
  return best;
}

export function buildChecks(i: PolicyInput): Check[] {
  const f = i.facts;
  const checks: Check[] = [];

  // config — a missing CORE var blocks every consumer
  for (const v of f.config.missing) {
    const secret = SECRET.test(v);
    checks.push({ id: `config:${v}`, status: "BLOCK", found: `${v} is not set in any .env layer`,
      who: secret ? "you" : "me, with OK",
      do: secret ? `add ${v} to .env.local (value from the team secret store)` : `add ${v} to .env.${f.env}`,
      diagnose: [`which layer: .env.defaults → .env.${f.env} → .env.local (value never printed)`] });
  }

  // health
  if (isUnknown(f.health)) checks.push({ id: "health", status: "UNKNOWN", found: `not probed: ${f.health.unknown}`, who: "you", do: `set BACK_URL in .env.${f.env}`, diagnose: [] });
  else if (f.health === "DOWN") checks.push({ id: "health", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${f.backUrl}/health is not 200`, who: "me",
    do: "wait for the deploy and re-run, or switch TEST_ENV", diagnose: ["/health detail", `gh run list on vc-deploy-dev for the ${f.env} branch`] });
  else checks.push(ok("health", "UP"));

  // declared
  if (isUnknown(f.declared)) checks.push({ id: "declared", status: "UNKNOWN", found: f.declared.unknown, who: "you", do: "gh auth login, or set GIT_TOKEN in .env.local", diagnose: ["gh auth status"] });
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
      // Controller ruling 1: treat ANY 4xx on token call as credentials problem; name the actual call in found
      const isTokenFailure = /^token: 4\d\d$/.test(f.deployed.unknown) || /^token: \d\d\d$/.test(f.deployed.unknown);
      const auth = /^token: 4\d\d$/.test(f.deployed.unknown) || /\b40[13]\b/.test(f.deployed.unknown);
      deployedUnknownWho = auth ? "you" : "me";
      deployedUnknownDo = auth ? "check ADMIN / ADMIN_PASSWORD in .env.local" : "wait and re-run";
      if (isTokenFailure) {
        deployedUnknownFound = `POST /connect/token → ${f.deployed.unknown}`;
      } else if (/^modules: /.test(f.deployed.unknown)) {
        deployedUnknownFound = `/api/platform/modules → ${f.deployed.unknown}`;
      } else {
        deployedUnknownFound = `/api/platform/modules → ${f.deployed.unknown}`;
      }
      checks.push({ id: "deployed", status: "UNKNOWN", found: deployedUnknownFound, who: deployedUnknownWho, do: deployedUnknownDo,
        diagnose: ["which .env layer ADMIN_PASSWORD resolves from (value never printed)", "status of POST /connect/token"] });
    }
  } else checks.push(ok("deployed", `${Object.keys(f.deployed.modules).length} modules probed`));

  // drift
  if (!isUnknown(f.drift) && f.drift.length > 0)
    checks.push({ id: "drift", status: "WARN", found: `${f.drift.length} module(s) differ: ${f.drift.slice(0, 3).map((d) => `${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`).join(", ")}`,
      who: "me", do: "wait for the deploy to settle and re-run", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });

  // ledger
  if (!isUnknown(f.ledger)) {
    if (f.ledger.stale) checks.push({ id: "ledger", status: "WARN", found: `release-ledger generated ${f.ledger.generated}, past stale_after_days`, who: "me, with OK", do: "npm run releases:refresh, then commit", diagnose: [] });
    for (const b of f.ledger.breaking)
      checks.push({ id: `breaking:${b.repo}`, status: "WARN", found: `⚠ BREAKING ${b.component} ${b.version} (${b.month})`, who: "me",
        do: "consumer rule applies (/qa-test: run FULL); name it in the report header", diagnose: [] });
    // Controller ruling 3: emit not-deployed only when deployed is known; collapse to one row per repo with latest version
    if (!isUnknown(f.deployed)) {
      const byRepo = new Map<string, typeof f.ledger.releasedNotDeployed[0]>();
      for (const r of f.ledger.releasedNotDeployed) {
        const existing = byRepo.get(r.repo);
        if (!existing || cmpSemver(r.released, existing.released) > 0) byRepo.set(r.repo, r);
      }
      for (const r of byRepo.values())
        checks.push({ id: `not-deployed:${r.repo}`, status: "WARN", found: `${r.component} ${r.released} released, deployed ${r.deployed ?? "UNKNOWN"}`, who: "me",
          do: "treat as NOT_DEPLOYED (BLOCKED-on-deploy), never FAIL", diagnose: [] });
    }
  }

  // expect — is the change under test on the stand; when deployed is UNKNOWN, inherit its who/do but change status for tickets
  if (i.expect) {
    const id = i.expect.module.toLowerCase();
    const live = isUnknown(f.deployed) ? null : f.deployed.modules[id]?.version ?? null;
    if (isUnknown(f.deployed)) checks.push({ id: "expect", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${i.expect.module} — deployed state unknown`, who: deployedUnknownWho, do: deployedUnknownDo, diagnose: [] });
    else if (live !== null && cmpSemver(live, i.expect.version) >= 0) checks.push(ok("expect", `${i.expect.module} ${live}`));
    else checks.push({ id: "expect", status: isTicket(i.for) ? "BLOCK" : "WARN", found: `${i.expect.module} ${i.expect.version} not deployed (has ${live ?? "none"})`,
      who: "me, with OK", do: `/qa-deploy-pr ${i.ticket ?? "<KEY>"}, or wait`, diagnose: ["is the PR artifact built", "is it in vc-deploy-dev backend/packages.json"] });
  }

  // sprint (ticket only)
  if (isTicket(i.for)) checks.push(i.sprint ? ok("sprint", i.sprint)
    : { id: "sprint", status: "UNKNOWN", found: "no reports/tickets/SprintXX-XX folder", who: "you", do: "name the sprint folder to create", diagnose: [] });

  // duplicate
  if (i.duplicate) checks.push({ id: "duplicate", status: "WARN",
    found: `ran ${i.duplicate.ageMinutes} min ago${i.duplicate.verdict ? `, verdict ${i.duplicate.verdict}` : ""}${i.duplicate.priorBuild ? `, build ${i.duplicate.priorBuild}` : ""}`,
    who: "you", do: `re-run overwrites ${i.duplicate.path} — commit it first if uncommitted`, diagnose: [] });

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
