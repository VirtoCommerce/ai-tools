// scripts/regression/preflight.ts — the BUILD-SCOPED pre-flight (spec §6, §14 D9–D11): one policy for
// /qa-regression and /qa-smoke over the same fact core as the change-scoped one. Read-only.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getEnvFacts, isUnknown, type EnvFacts, type Unknown } from "../lib/env-facts.ts";
import { readLedger } from "../lib/release-ledger-read.ts";
import { envChecks, mcpChecks, isBlocking, type Check, type PolicyInput } from "../preflight/policy.ts";
import { checkMcpStatic, loadMcpRequirements, readMcpJson } from "../preflight/mcp-static.ts";
import { classifyRun, gatherActivity, loadStatus, type Classification } from "./reap-stalled-run.ts";
import { gateSuites, resolveRequiredModule, type GatingResult, type SuiteRef } from "./requires.ts";
import { baselineDelta, readBaseline, type ModuleChange } from "./baseline.ts";

export type BuildFor = "regression" | "smoke";
type Mcp = PolicyInput["mcp"];
export interface RegressionPolicyInput {
  for: BuildFor; facts: EnvFacts; mcp: Mcp;
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  lock: Classification | null; gating: GatingResult; suiteIds: string[];
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null;
  smokeGates: { ok: boolean; output: string; spawnError?: string } | null; smokeDuplicate: string | null;
}
export interface RegressionPreflight {
  for: BuildFor; selection: string; facts: EnvFacts; mcp: Mcp; gating: GatingResult;
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null; falseFailureRisk: string[];
  checks: Check[]; verdict: "READY" | "NOT READY";
}

const ok = (id: string, found: string): Check => ({ id, status: "OK", found, who: null, do: null, diagnose: [] });

export function falseFailureRisk(changes: ModuleChange[] | Unknown, gating: GatingResult): string[] {
  if (isUnknown(changes) || changes.length === 0) return [];
  const all = Object.keys(gating.requiredBySuite).sort();
  if (changes.some((c) => c.id === "platform")) return all;
  const changed = new Set(changes.map((c) => c.id));
  return all.filter((s) => gating.requiredBySuite[s].some((m) => changed.has(m)));
}

export function buildRegressionChecks(i: RegressionPolicyInput): Check[] {
  const f = i.facts;
  const checks: Check[] = [...envChecks(f, { healthDown: "BLOCK", drift: null }).checks];

  for (const p of i.manifestProblems)
    checks.push({ id: `manifest:${p.suiteId}`, status: "BLOCK", found: `${p.kind}: ${p.detail}`, who: "me, with OK", do: "fix the suite's entry in config/test-suites.json", diagnose: [] });

  if (i.lock?.liveness === "active")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is running: ${i.lock.reason}`, who: "me", do: `wait for ${i.lock.runId} to finish, then re-run`, diagnose: ["npm run regression:reap"] });
  else if (i.lock?.liveness === "stalled")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is stalled: ${i.lock.reason}`, who: "me, with OK", do: "npm run regression:reap:apply (marks it stalled), then re-run", diagnose: ["npm run regression:reap"] });
  else checks.push(ok("active-run", i.lock ? i.lock.reason : "no run status"));

  // D9: drift on a module a selected suite needs (or the platform) is a BLOCK; elsewhere a WARN.
  if (!isUnknown(f.drift)) {
    const required = new Set(Object.values(i.gating.requiredBySuite).flat());
    const outside: string[] = [];
    for (const d of f.drift) {
      if (d.id === "platform" || required.has(d.id))
        checks.push({ id: `drift:${d.id}`, status: "BLOCK", found: `${d.id} declared ${d.declared ?? "—"}, deployed ${d.deployed ?? "—"}`, who: "me",
          do: "wait for the deploy to settle and re-run, or proceed as is", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });
      else outside.push(`${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`);
    }
    if (outside.length) checks.push({ id: "drift", status: "WARN", found: `${outside.length} module(s) no selected suite requires differ: ${outside.slice(0, 3).join(", ")}`, who: "me", do: "name it in the report header", diagnose: [] });
  }

  const byModule = new Map<string, { state: string; suites: string[] }>();
  for (const g of i.gating.gated) {
    const e = byModule.get(g.module) ?? { state: g.state, suites: [] };
    e.suites.push(g.suite);
    byModule.set(g.module, e);
  }
  for (const [mod, e] of byModule)
    checks.push({ id: `gated:${mod}`, status: "WARN", found: `${mod} ${e.state} — suites ${e.suites.join(", ")} leave the plan`, who: "me",
      do: "report them as NOT_DEPLOYED (BLOCKED-on-deploy), never FAIL", diagnose: [] });
  const gatedSuites = new Set(i.gating.gated.map((g) => g.suite));
  if (i.suiteIds.length > 0 && i.suiteIds.every((s) => gatedSuites.has(s)))
    checks.push({ id: "gating:all", status: "BLOCK", found: `every suite of the selection is gated (${i.suiteIds.length}) — nothing left to run`, who: "you", do: "pick another selection, or deploy the missing modules", diagnose: [] });
  if (i.gating.gatingOff)
    checks.push({ id: "gating", status: "WARN", found: `no suite gated: ${i.gating.gatingOff}`, who: "me", do: "every suite runs; resolve the deployed check to gate", diagnose: [] });
  for (const u of i.gating.unmapped)
    checks.push({ id: `unmapped-requires:${u.entry}`, status: "UNKNOWN", found: `resolves to no module (suites ${u.suites.join(", ")} run ungated)`, who: "me, with OK",
      do: "write the full module id in the suites' requiresModules", diagnose: [] });

  if (isUnknown(i.changedSince))
    checks.push({ id: "baseline", status: "UNKNOWN", found: i.changedSince.unknown === "no-baseline" ? "no baseline yet for this env" : `baseline Δ: ${i.changedSince.unknown}`, who: "me",
      do: "written when a completed run is closed with npm run regression:close", diagnose: [] });
  else if (i.changedSince.length > 0) {
    const risk = falseFailureRisk(i.changedSince, i.gating);
    checks.push({ id: "baseline", status: "WARN", found: `${i.changedSince.length} change(s) since ${i.baselineRunId}: ${i.changedSince.slice(0, 3).map((c) => `${c.id} ${c.from ?? "—"}→${c.to ?? "—"}`).join(", ")}; false-failure risk: ${risk.join(", ") || "none selected"}`,
      who: "me", do: "name the risk suites in the report header; a failure there is checked against the change first", diagnose: [] });
  } else checks.push(ok("baseline", `no change since ${i.baselineRunId}`));

  if (i.for === "smoke" && i.smokeGates?.spawnError)
    checks.push({ id: "smoke-gates", status: "UNKNOWN", found: `could not run the checker: ${(i.smokeGates.spawnError.split(/\r?\n/)[0] ?? "").slice(0, 120)}`, who: "me",
      do: "run npm run suites:gates yourself and read its result", diagnose: ["npm run suites:gates"] });
  else if (i.for === "smoke" && i.smokeGates && !i.smokeGates.ok)
    checks.push({ id: "smoke-gates", status: "WARN", found: `suites:gates failed: ${i.smokeGates.output.split(/\r?\n/).find((l) => l.trim()) ?? "see output"}`, who: "me, with OK",
      do: "reconcile the checklist with the CSV, or report the verdict as provisional", diagnose: ["npm run suites:gates"] });
  if (i.for === "smoke" && i.smokeDuplicate)
    checks.push({ id: "duplicate", status: "WARN", found: `${i.smokeDuplicate} ran today`, who: "you", do: "re-run, or read that run's verdict", diagnose: [] });

  checks.push(...mcpChecks(i.mcp));
  return checks;
}

function smokeDuplicateToday(root: string, now: Date): string | null {
  const dir = join(root, "reports", "regression");
  if (!existsSync(dir)) return null;
  const day = now.toISOString().slice(0, 10);
  return readdirSync(dir).filter((n) => n.startsWith(`SMOKE-${day}`)).sort().at(-1) ?? null;
}

function runSmokeGates(root: string): { ok: boolean; output: string; spawnError?: string } {
  const r = spawnSync("npx", ["tsx", "scripts/test-cases/check-smoke-gates.ts"], { cwd: root, encoding: "utf8", shell: true, timeout: 60_000 });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const spawnError = r.error ? String(r.error.message ?? r.error)
    : r.status === null ? `checker killed or timed out (${r.signal ?? "no signal"})`
    : r.status === 127 ? "command not found (exit 127)"
    : /is not recognized|command not found|Cannot find module/i.test(output) ? (output.split(/\r?\n/).find((l) => l.trim()) ?? "checker could not start")
    : undefined;
  return { ok: r.status === 0 && !spawnError, output, ...(spawnError ? { spawnError } : {}) };
}

export async function runRegressionPreflight(o: {
  for: BuildFor; selection: string; suites: SuiteRef[];
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  root: string; now?: Date; env?: string;
}): Promise<RegressionPreflight> {
  const now = o.now ?? new Date();
  const required = [...new Set(o.suites.flatMap((s) => (s.requiresModules ?? []).map((e) => resolveRequiredModule(e).pascal)))];
  const facts = await getEnvFacts({ env: o.env, components: required, storefront: o.suites.some((s) => s.layer === "frontend"), now });
  const mcpJson = readMcpJson(o.root);   // { json, error } — same construction as scripts/preflight/cli.ts
  const mcp = { ...checkMcpStatic(o.for, loadMcpRequirements(o.root), mcpJson.json), jsonError: mcpJson.error };
  const regRoot = join(o.root, "reports", "regression");
  const status = loadStatus(regRoot);
  const lock = status?.runId ? classifyRun(status, gatherActivity(regRoot, String(status.runId)), now.getTime()) : classifyRun(status, { newestActivityMs: null }, now.getTime());
  let ledger = null;
  try { ledger = readLedger(o.root); } catch { ledger = null; }
  const gating = gateSuites(o.suites, facts, ledger);
  const baseline = readBaseline(o.root, facts.env);
  const changedSince = baselineDelta(baseline, facts);
  const checks = buildRegressionChecks({
    for: o.for, facts, mcp, manifestProblems: o.manifestProblems, lock, gating, suiteIds: o.suites.map((s) => s.id),
    changedSince, baselineRunId: baseline?.runId ?? null,
    smokeGates: o.for === "smoke" ? runSmokeGates(o.root) : null,
    smokeDuplicate: o.for === "smoke" ? smokeDuplicateToday(o.root, now) : null,
  });
  return {
    for: o.for, selection: o.selection, facts, mcp, gating, changedSince, baselineRunId: baseline?.runId ?? null,
    falseFailureRisk: falseFailureRisk(changedSince, gating), checks, verdict: isBlocking(checks) ? "NOT READY" : "READY",
  };
}
