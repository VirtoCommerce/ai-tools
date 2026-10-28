/**
 * release-split — lay one shared regression run out over the waves of a release.
 *
 *   npm run release:split -- sprint-26-21 --run-id REG-2026-10-29-0900            # show what each wave got
 *   npm run release:split -- sprint-26-21 --run-id REG-2026-10-29-0900 --write    # write it into the waves' state.json
 *
 * WHY. `/qa-run <release> all` runs W1…Wn as ONE run, because three browser slots kept busy across waves finish
 * the release about a third sooner than running the waves one after another. The release folder still keeps one
 * record per wave — its totals, what was not run, what is left to triage — so the shared run has to be split back.
 * Every suite belongs to exactly one wave, so the split is mechanical; counting it by hand is what this replaces.
 *
 * What it writes, per wave whose suites are in the run (`--write`):
 *   - every suite of the wave finished → `RUN_DONE`, the run id appended, `totals` from its suites' results,
 *     `untriaged` = FAIL/BLOCKED cases without a row in the wave's ledger, `notRun` for suites the run did not reach;
 *   - otherwise → `RUNNING` only; the run id and the totals go in together once the wave is complete.
 * `--final` (after `regression:close`): the run is over, so a suite left with PENDING cases is finished too and those
 * cases go to `notRun` — without it, a run cut short would keep its waves RUNNING for ever.
 * A wave that already has OTHER run ids (a `--continue` that ran only what was left) gets this run's totals ADDED;
 * a run id already recorded next to others is refused, so a second split cannot count a run twice.
 *
 * Results are read with the HTML report's own loader (`loadAllSuites`): the per-case JSONL overlay of a suite
 * still running and the browser-suffixed duplicates are folded the same way the dashboard folds them.
 *
 * Exit codes: 0 ok · 1 bad usage, or a suite of the run sits in more than one wave · 2 the release or the run is missing.
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { loadAllSuites, type NormSuite } from "./generate-regression-html-report.ts";

const REPO_ROOT = resolve(process.env.QA_RUN_HOME || process.cwd());

interface Wave { id: string; title?: string; suites: string[] }
interface Totals { planned: number; executed: number; pass: number; fail: number; blocked: number; skipped: number; ambiguous: number }
interface State { wave: string; status: string; runIds: string[]; totals?: Totals; untriaged?: number; notRun?: { suites: string[]; cases: number; reason: string }[]; updatedAt?: string; [k: string]: unknown }

function fail(msg: string, code = 1): never {
  console.error(`release:split: ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const release = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--run-id");
const runId = argv[argv.indexOf("--run-id") + 1];
const write = argv.includes("--write");
const final = argv.includes("--final");
if (!release || argv.indexOf("--run-id") < 0 || !runId) fail("usage: release:split -- <release> --run-id <RUN_ID> [--final] [--write]");

const relDir = join(REPO_ROOT, "regression/releases", release);
const runDir = join(REPO_ROOT, "reports/regression", runId);
if (!existsSync(join(relDir, "release.json"))) fail(`no release folder regression/releases/${release}/`, 2);
if (!existsSync(runDir)) fail(`no run folder reports/regression/${runId}/`, 2);

const plan = JSON.parse(readFileSync(join(relDir, "release.json"), "utf-8")) as { waves: Wave[] };
const suites = new Map(loadAllSuites(runDir).map((s) => [s.suiteId, s]));
if (suites.size === 0) fail(`no suite results in reports/regression/${runId}/`, 2);

// Every suite of the run must map to exactly one wave, or its cases would be counted twice (or nowhere).
const owner = new Map<string, string[]>();
for (const w of plan.waves) for (const s of w.suites) owner.set(s, [...(owner.get(s) ?? []), w.id]);
const shared = [...suites.keys()].filter((s) => (owner.get(s) ?? []).length > 1);
if (shared.length) fail(`suite(s) ${shared.map((s) => `${s} (${owner.get(s)!.join(", ")})`).join("; ")} sit in more than one wave — a shared run cannot be split by suite`);
const orphan = [...suites.keys()].filter((s) => !owner.has(s));
if (orphan.length) console.warn(`release:split: suite(s) ${orphan.join(", ")} are in no wave of ${release} — left out`);

function ledgerCases(wave: string): Set<string> {
  const p = join(relDir, "waves", wave, "ledger.csv");
  if (!existsSync(p)) return new Set();
  const rows = parse(readFileSync(p, "utf-8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return new Set(rows.map((r) => r.case_id));
}

function count(list: NormSuite[]) {
  const t: Totals = { planned: 0, executed: 0, pass: 0, fail: 0, blocked: 0, skipped: 0, ambiguous: 0 };
  const failing = new Set<string>();
  for (const s of list) {
    t.planned += s.totalCases;
    for (const c of s.cases) {
      if (c.status === "PENDING") continue;
      t.executed++;
      if (c.status === "PASS") t.pass++;
      else if (c.status === "FAIL") { t.fail++; failing.add(c.id); }
      else if (c.status === "BLOCKED") { t.blocked++; failing.add(c.id); }
      else if (c.status === "SKIPPED") t.skipped++;
      else t.ambiguous++;
    }
  }
  return { t, failing };
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "config/test-suites.json"), "utf-8")) as { suites: { id: string; testCount?: number }[] };
const caseCount = (ids: string[]) => ids.reduce((n, id) => n + (manifest.suites.find((m) => m.id === id)?.testCount ?? 0), 0);
const today = new Date().toISOString().slice(0, 10);
const rows: string[] = [];
let refused = false;
for (const w of plan.waves) {
  const inRun = w.suites.filter((s) => suites.has(s));
  if (!inRun.length) continue;
  const runSuites = inRun.map((s) => suites.get(s)!);
  // --final: the run is closed, so a suite with PENDING cases will not get them — it is finished, and those
  // cases go to notRun. Without it, such a suite is still running.
  const done = runSuites.filter((s) => final || (s.completedAt.trim() !== "" && s.pending === 0));
  const complete = done.length === inRun.length;
  const missing = w.suites.filter((s) => !suites.has(s));
  const unfinished = runSuites.filter((s) => s.cases.some((c) => c.status === "PENDING"));
  const pendingCases = unfinished.reduce((n, s) => n + s.cases.filter((c) => c.status === "PENDING").length, 0);
  const { t, failing } = count(runSuites);
  const known = ledgerCases(w.id);
  const untriaged = [...failing].filter((c) => !known.has(c)).length;
  rows.push(`  ${w.id.padEnd(4)} ${complete ? "complete " : `running ${done.length}/${inRun.length}`}  executed ${t.executed}/${t.planned} · PASS ${t.pass} · FAIL ${t.fail} · BLOCKED ${t.blocked}` +
    ` · untriaged ${untriaged}${missing.length ? ` · not in this run: ${missing.join(",")}` : ""}${final && pendingCases ? ` · ${pendingCases} case(s) never ran` : ""}`);
  if (!write) continue;

  const statePath = join(relDir, "waves", w.id, "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as State;
  if (!complete) {
    // The run id goes in only with the totals it stands for — appending it early would make the final split
    // look like a second count of the same run and refuse it.
    if (["CLAIMED", "NOT_STARTED"].includes(state.status)) state.status = "RUNNING";
  } else {
    const others = (state.runIds ?? []).filter((r) => r !== runId);
    if (others.length && (state.runIds ?? []).includes(runId)) {
      console.error(`release:split: ${w.id} already records ${runId} next to ${others.join(", ")} — its totals hold this run already; not added twice`);
      refused = true;
      continue;
    }
    const base = others.length && state.totals ? state.totals : null;
    state.runIds = [...others, runId];
    state.totals = base ? (Object.fromEntries(Object.keys(t).map((k) => [k, (base as any)[k] + (t as any)[k]])) as unknown as Totals) : t;
    state.untriaged = untriaged + (base ? Math.max(0, (state.untriaged ?? 0)) : 0);
    // Entries an earlier split wrote stop being true once this run covers their suites.
    const covered = new Set(inRun);
    const prior = (state.notRun ?? [])
      .map((n) => (/^not (in the shared run|finished in) /.test(n.reason) ? { ...n, suites: n.suites.filter((s) => !covered.has(s)) } : n))
      .filter((n) => n.suites.length && !n.reason.includes(runId));
    const fresh = [
      ...(missing.length ? [{ suites: missing, cases: caseCount(missing), reason: `not in the shared run ${runId}` }] : []),
      ...(final && pendingCases ? [{ suites: unfinished.map((s) => s.suiteId), cases: pendingCases, reason: `not finished in ${runId}` }] : []),
    ];
    // An entry whose suites were all covered is gone; recount the cases of a trimmed one from the manifest.
    state.notRun = [...prior.map((n) => (/^not in the shared run /.test(n.reason) ? { ...n, cases: caseCount(n.suites) } : n)), ...fresh];
    if (!state.notRun.length) delete state.notRun;
    if (["CLAIMED", "RUNNING", "NOT_STARTED"].includes(state.status)) state.status = "RUN_DONE";
  }
  state.updatedAt = today;
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

console.log(`release:split ${release} ← ${runId}${write ? " (written)" : ""}`);
console.log(rows.join("\n") || "  no wave of this release has a suite in the run");
if (write) console.log(`next: npm run release:status -- ${release} --write && npm run release:check -- ${release}`);
process.exit(refused ? 1 : 0);
