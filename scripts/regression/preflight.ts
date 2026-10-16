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
import { SECRETS_FILE, classifySecretNames, readSecretsFile, suiteSecretCases } from "../lib/browser-secrets.mjs";
import { requirementChecks } from "./requirements.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.js";

export type BuildFor = "regression" | "smoke";

/**
 * The browser-lane passwords the selected suites type, against `.env.playwright.local` (the playwright-*
 * MCP `--secrets` file). A name the file lacks is typed as a literal and the case BLOCKs on sign-in
 * mid-run, so it is decided here. `gated`: suites EVERY case of which needs an undeclared name.
 */
export interface SecretsGate {
  names: string[];
  file: { exists: boolean; env: string | null };
  unsynced: string[];
  undeclared: { name: string; cases: Record<string, string[]> }[];
  gated: { suite: string; names: string[] }[];
}

export function computeSecretsGate(root: string, browserSuites: string[], env: string, processEnv: Record<string, string | undefined> = process.env): SecretsGate {
  const perSuite = suiteSecretCases(root, browserSuites) as Record<string, { cases: number; byName: Record<string, string[]> }>;
  const names = [...new Set(Object.values(perSuite).flatMap((s) => Object.keys(s.byName)))].sort();
  const file = readSecretsFile(root);
  const cls = classifySecretNames(names, file, processEnv);
  // A file generated for another TEST_ENV holds another stand's values: every env-backed name is unsynced.
  const otherEnv = file.exists && file.env !== null && file.env !== env;
  const unsynced = otherEnv ? names.filter((n) => processEnv[n]) : cls.unsynced;
  const undeclared = cls.undeclared.map((name) => ({
    name, cases: Object.fromEntries(Object.entries(perSuite).filter(([, s]) => s.byName[name]).map(([id, s]) => [id, s.byName[name]])),
  }));
  const gated: SecretsGate["gated"] = [];
  for (const [suite, s] of Object.entries(perSuite)) {
    const missing = cls.undeclared.filter((n) => s.byName[n]);
    const hit = new Set(missing.flatMap((n) => s.byName[n]));
    if (missing.length && s.cases > 0 && hit.size >= s.cases) gated.push({ suite, names: missing });
  }
  return { names, file: { exists: file.exists, env: file.env }, unsynced, undeclared, gated };
}

export function secretsChecks(s: SecretsGate, env: string): Check[] {
  if (s.names.length === 0) return [];
  const checks: Check[] = [];
  const fix = "npm run secrets:sync, then reconnect playwright-chrome / -firefox / -edge in /mcp before any browser suite starts";
  if (!s.file.exists)
    checks.push({ id: "secrets:sync", status: "BLOCK", found: `${SECRETS_FILE} absent — ${s.names.length} password name(s) the selected browser suites type cannot be substituted`, who: "me", do: fix, diagnose: ["npm run secrets:check"] });
  else if (s.unsynced.length)
    checks.push({ id: "secrets:sync", status: "BLOCK",
      found: `${s.unsynced.join(", ")} missing from or different in ${SECRETS_FILE}${s.file.env && s.file.env !== env ? ` (generated for TEST_ENV=${s.file.env})` : ""} — those cases would sign in with the literal name`,
      who: "me", do: fix, diagnose: ["npm run secrets:check (names only, never values)"] });
  const gated = new Set(s.gated.map((g) => g.suite));
  for (const u of s.undeclared) {
    const parts = Object.entries(u.cases).map(([suite, ids]) => gated.has(suite) ? `${suite} (all cases — leaves the plan)` : `${suite}: ${ids.join(", ")}`);
    checks.push({ id: `secret:${u.name}`, status: "WARN", found: `${u.name} has no value in .env.local or ${SECRETS_FILE} — report BLOCKED, no sign-in attempt: ${parts.join("; ")}`,
      who: "you", do: `add ${u.name} to .env.local (team secret store), then ${fix}`, diagnose: [],
      cases: Object.entries(u.cases).filter(([suite]) => !gated.has(suite)).flatMap(([suite, ids]) => ids.map((id) => `${suite}/${id}`)) });
  }
  if (s.file.exists && !s.unsynced.length && !s.undeclared.length)
    checks.push(ok("secrets", `${s.names.length} password name(s) the selected browser suites type are registered`));
  return checks;
}
type Mcp = PolicyInput["mcp"];
export interface RegressionPolicyInput {
  for: BuildFor; facts: EnvFacts; mcp: Mcp;
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  lock: Classification | null; gating: GatingResult; suiteIds: string[];
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null;
  secrets?: SecretsGate;
  smokeGates: { ok: boolean; output: string; spawnError?: string } | null; smokeDuplicate: string | null;
  /** The status file describes THIS run (`--run-id`): it is the run's own envelope, not a lock. */
  ownRunId?: string | null;
  /** `drift:*` ids the user chose to "proceed as is" on (D9): BLOCK → WARN. */
  accepted?: string[];
}
export interface RegressionPreflight {
  for: BuildFor; selection: string; facts: EnvFacts; mcp: Mcp; gating: GatingResult; secrets: SecretsGate;
  changedSince: ModuleChange[] | Unknown; baselineRunId: string | null; falseFailureRisk: string[];
  accepted: string[]; checks: Check[]; verdict: "READY" | "NOT READY";
  /**
   * suite → case → reason: the cases a WARN/BLOCK row predicts will BLOCK. `suites:lanes` reads this from the run
   * folder's preflight.json and plans them in the `preflight` lane, which nothing executes; `suites:merge` records
   * them BLOCKED with this reason. A run then spends no browser time and no model tokens on a case whose outcome is
   * already known — and the counts stay whole, because the case is still in the suite's total. Empty when the
   * caller passed `--run-blocked` (`skipDisabled`).
   */
  skip: Record<string, Record<string, string>>;
  skipDisabled?: boolean;
}

/**
 * The rows' predicted BLOCKs, per suite and case. When several rows name one case, the most upstream cause gives
 * the reason: a setting (`req:`) explains why a fixture could not be seeded, a persona why its fixtures are absent.
 */
const CAUSE_RANK = ["req:", "persona:", "secret:", "fixture:"];
const rank = (id: string) => { const i = CAUSE_RANK.findIndex((p) => id.startsWith(p)); return i < 0 ? CAUSE_RANK.length : i; };
export function skipMap(checks: Check[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const c of [...checks].sort((a, b) => rank(a.id) - rank(b.id))) {
    if ((c.status !== "WARN" && c.status !== "BLOCK") || !c.cases?.length) continue;
    const reason = `pre-flight ${c.id}: ${c.found.split(" — ")[0]}`.slice(0, 240);
    for (const key of c.cases) {
      const i = key.indexOf("/");
      if (i < 1) continue;
      const suite = key.slice(0, i), id = key.slice(i + 1);
      (out[suite] ??= {})[id] ??= reason;
    }
  }
  return out;
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

  if (i.ownRunId)
    checks.push(ok("active-run", `this run's own status file (${i.ownRunId})`));
  else if (i.lock?.liveness === "active")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is running: ${i.lock.reason}`, who: "me", do: `wait for ${i.lock.runId} to finish, then re-run`, diagnose: ["npm run regression:reap"] });
  else if (i.lock?.liveness === "stalled")
    checks.push({ id: "active-run", status: "BLOCK", found: `${i.lock.runId} is stalled: ${i.lock.reason}`, who: "me, with OK", do: "npm run regression:reap:apply (marks it stalled), then re-run", diagnose: ["npm run regression:reap"] });
  else checks.push(ok("active-run", i.lock ? i.lock.reason : "no run status"));

  // D9: drift on a module a selected suite needs (or the platform) is a BLOCK; elsewhere a WARN.
  if (!isUnknown(f.drift)) {
    const accepted = new Set(i.accepted ?? []);
    const required = new Set(Object.values(i.gating.requiredBySuite).flat());
    const outside: string[] = [];
    for (const d of f.drift) {
      if (d.id === "platform" || required.has(d.id)) {
        const yes = accepted.has(`drift:${d.id}`);
        checks.push({ id: `drift:${d.id}`, status: yes ? "WARN" : "BLOCK", found: `${d.id} declared ${d.declared ?? "—"}, deployed ${d.deployed ?? "—"}${yes ? " (accepted)" : ""}`, who: "me",
          do: "wait for the deploy to settle and re-run, or proceed as is", diagnose: [`gh run list on vc-deploy-dev for the ${f.env} branch`] });
      } else outside.push(`${d.id} ${d.declared ?? "—"}→${d.deployed ?? "—"}`);
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
  const gatedSuites = new Set([...i.gating.gated, ...(i.secrets?.gated ?? [])].map((g) => g.suite));
  if (i.suiteIds.length > 0 && i.suiteIds.every((s) => gatedSuites.has(s)))
    checks.push({ id: "gating:all", status: "BLOCK", found: `every suite of the selection is gated (${i.suiteIds.length}) — nothing left to run`, who: "you", do: "pick another selection, deploy the missing modules, or add the missing passwords", diagnose: [] });
  if (i.secrets) checks.push(...secretsChecks(i.secrets, f.env));
  if (i.gating.gatingOff)
    checks.push({ id: "gating", status: "WARN", found: `no suite gated: ${i.gating.gatingOff}`, who: "me", do: "every suite runs; resolve the deployed check to gate", diagnose: [] });
  for (const u of i.gating.unmapped)
    checks.push({ id: `unmapped-requires:${u.entry}`, status: "UNKNOWN", who: "me, with OK", diagnose: [],
      found: `${u.module} (by rule): not deployed, not declared on ${f.env}, not in the ledger — a typo cannot be told from an absent module (suites ${u.suites.join(", ")} run ungated)`,
      do: `check the id; if the module is absent on purpose, expect suites ${u.suites.join(", ")} to fail on this stand` });

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

/** The active-run lock, unless the status file is this run's own envelope (`runId` = `--run-id`). */
export function readLock(regRoot: string, runId: string | undefined, now: Date): { lock: Classification | null; ownRunId: string | null } {
  const status = loadStatus(regRoot);
  if (runId && status?.runId && String(status.runId) === runId) return { lock: null, ownRunId: runId };
  const lock = status?.runId ? classifyRun(status, gatherActivity(regRoot, String(status.runId)), now.getTime()) : classifyRun(status, { newestActivityMs: null }, now.getTime());
  return { lock, ownRunId: null };
}

export async function runRegressionPreflight(o: {
  for: BuildFor; selection: string; suites: SuiteRef[];
  manifestProblems: { suiteId: string; kind: string; detail: string }[];
  root: string; now?: Date; env?: string; runId?: string; accept?: string[];
  /** Suites a browser agent types into — the only ones the secrets file matters for. Default: all. */
  browserSuites?: string[];
  /** Case-level checks (personas, fixtures, declared settings — requirements.ts). Default on; off only for an offline plan. */
  requirements?: boolean;
  /** false = `--run-blocked`: run the predicted-BLOCKED cases anyway (the `skip` map stays empty). Default true. */
  skipBlocked?: boolean;
}): Promise<RegressionPreflight> {
  const now = o.now ?? new Date();
  const required = [...new Set(o.suites.flatMap((s) => (s.requiresModules ?? []).map((e) => resolveRequiredModule(e).pascal)))];
  const facts = await getEnvFacts({ env: o.env, components: required, storefront: o.suites.some((s) => s.layer === "frontend"), now });
  const mcpJson = readMcpJson(o.root);   // { json, error } — same construction as scripts/preflight/cli.ts
  const mcp = { ...checkMcpStatic(o.for, loadMcpRequirements(o.root), mcpJson.json), jsonError: mcpJson.error };
  const { lock, ownRunId } = readLock(join(o.root, "reports", "regression"), o.runId, now);
  let ledger = null;
  try { ledger = readLedger(o.root); } catch { ledger = null; }
  const gating = gateSuites(o.suites, facts, ledger);
  const baseline = readBaseline(o.root, facts.env);
  const changedSince = baselineDelta(baseline, facts);
  // After getEnvFacts: process.env is the layered, suffix-promoted env the values are compared against.
  const secrets = computeSecretsGate(o.root, o.browserSuites ?? o.suites.map((s) => s.id), facts.env);
  const checks = buildRegressionChecks({
    for: o.for, facts, mcp, manifestProblems: o.manifestProblems, lock, gating, suiteIds: o.suites.map((s) => s.id),
    changedSince, baselineRunId: baseline?.runId ?? null, ownRunId, accepted: o.accept ?? [], secrets,
    smokeGates: o.for === "smoke" ? runSmokeGates(o.root) : null,
    smokeDuplicate: o.for === "smoke" ? smokeDuplicateToday(o.root, now) : null,
  });
  // What THESE cases need from the stand — only for suites that will actually run (gated ones are already out).
  if (o.requirements !== false) {
    const gated = new Set(gating.gated.map((g) => g.suite));
    let files = new Map<string, string>();
    try { files = new Map(loadManifest().suites.map((s) => [s.id, s.file])); } catch { /* manifest problems are reported above */ }
    const run = o.suites.filter((s) => !gated.has(s.id) && files.has(s.id)).map((s) => ({ id: s.id, file: files.get(s.id)! }));
    checks.push(...await requirementChecks({ root: o.root, env: facts.env, suites: run }));
  }
  const predicted = skipMap(checks);
  const nCases = Object.values(predicted).reduce((n, m) => n + Object.keys(m).length, 0);
  const skipBlocked = o.skipBlocked !== false;
  if (nCases) checks.push(skipBlocked
    ? { id: "skip", status: "WARN", found: `${nCases} case(s) in ${Object.keys(predicted).length} suite(s) are recorded BLOCKED without running — each with the reason of its row above`,
        who: "me", do: "fix those rows and re-run the pre-flight before the run; --run-blocked runs them anyway", diagnose: [] }
    : { id: "skip", status: "WARN", found: `--run-blocked: ${nCases} case(s) the rows above predict will BLOCK are run anyway`, who: null, do: null, diagnose: [] });
  return {
    skip: skipBlocked ? predicted : {}, ...(skipBlocked ? {} : { skipDisabled: true }),
    for: o.for, selection: o.selection, facts, mcp, gating, secrets, changedSince, baselineRunId: baseline?.runId ?? null,
    falseFailureRisk: falseFailureRisk(changedSince, gating), accepted: o.accept ?? [], checks, verdict: isBlocking(checks) ? "NOT READY" : "READY",
  };
}
