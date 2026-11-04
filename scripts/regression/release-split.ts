/**
 * release-split — record a regression run in the waves of a release, case by case.
 *
 *   npm run release:split -- sprint-26-21 --run-id REG-2026-10-29-0900                 # show what each wave got
 *   npm run release:split -- sprint-26-21 --run-id REG-2026-10-29-0900 --write         # record it
 *   npm run release:split -- sprint-26-21 --run-id REG-…  --wave W3 --final --write    # one wave's own run, closed
 *   npm run release:split -- sprint-26-21 --run-id REG-…  --final --waves W1,W2,W3 --write   # stop mid-`all`
 *
 * WHY. A wave is recorded from one or more runs — its own, a `--continue` that runs what was left, three priority
 * passes, or the one shared run `/qa-run <release> all` makes over several waves. Totals added run by run count a
 * re-run case twice and can never be triaged down (the `untriaged` floor counts distinct cases), so this keeps the
 * LATEST result of every case in `waves/<W>/cases.json` and derives everything from it: `totals`, `untriaged`
 * (FAIL/BLOCKED cases without a ledger row), and `notRun` (per suite, its size minus the cases recorded). A later run
 * replaces a case's result; recording the same run twice changes nothing. The file is in git, so the next owner
 * keeps what ran even though the raw run output stays on the previous owner's machine.
 *
 * Which wave a suite's cases go to: `--wave <W>` for a wave's own run; otherwise the one wave that lists the suite —
 * a suite also listed as `exclusive` in WX goes to the other wave, since WX runs alone and names itself with --wave.
 *
 * When a wave closes (`RUN_DONE`): every suite of the wave has finished (in this run, or fully recorded before) —
 * or `--final` (the run is over; whatever did not run goes to `notRun`). `--final --waves W1,…` also closes listed
 * waves that got nothing from the run. Until then the wave is `RUNNING` and only its cases.json moves.
 * A TRIAGED or DONE wave that gets new FAIL/BLOCKED cases without a ledger row goes back to RUN_DONE: its triage is
 * no longer complete.
 *
 * Results are read with the HTML report's own loader (`loadAllSuites`), minus its `_suite` row (screenshots not
 * matched to a case), which is not a case.
 *
 * A wave recorded by hand before cases.json existed (earlier run ids and totals, no cases.json) is left alone and
 * reported: its earlier runs cannot be merged case by case.
 *
 * Exit codes: 0 ok · 1 bad usage, a suite of the run has no single wave to go to, or a wave was left alone (above)
 * · 2 the release or the run is missing.
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { loadAllSuites, type NormSuite } from "./generate-regression-html-report.ts";

const REPO_ROOT = resolve(process.env.QA_RUN_HOME || process.cwd());

interface Wave { id: string; title?: string; suites: string[]; exclusive?: string[] }
interface Totals { planned: number; executed: number; pass: number; fail: number; blocked: number; skipped: number; ambiguous: number }
interface NotRun { suites: string[]; cases: number; reason: string }
interface State { wave: string; status: string; runIds: string[]; totals?: Totals; untriaged?: number; notRun?: NotRun[]; updatedAt?: string; [k: string]: unknown }
/** waves/<W>/cases.json — `suites`: each suite's size (all priorities); `cases`: "suite|case" → its latest result. */
interface CaseStore { suites: Record<string, number>; cases: Record<string, { status: string; run: string }> }

function fail(msg: string, code = 1): never {
  console.error(`release:split: ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const valueOf = (flag: string) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] ?? "" : "");
const release = argv.find((a, i) => !a.startsWith("--") && !["--run-id", "--waves", "--wave"].includes(argv[i - 1]));
const runId = valueOf("--run-id");
const onlyWave = valueOf("--wave");
const write = argv.includes("--write");
const final = argv.includes("--final");
const closeEmpty = new Set(valueOf("--waves").split(",").map((w) => w.trim()).filter(Boolean));
if (!release || !runId) fail("usage: release:split -- <release> --run-id <RUN_ID> [--wave <W>] [--final [--waves W1,W2,…]] [--write]");
if (closeEmpty.size && !final) fail("--waves closes waves the run never reached, so it needs --final");

const relDir = join(REPO_ROOT, "regression/releases", release);
const runDir = join(REPO_ROOT, "reports/regression", runId);
if (!existsSync(join(relDir, "release.json"))) fail(`no release folder regression/releases/${release}/`, 2);
if (!existsSync(runDir)) fail(`no run folder reports/regression/${runId}/`, 2);

const plan = JSON.parse(readFileSync(join(relDir, "release.json"), "utf-8")) as { waves: Wave[] };
const waveIds = new Set(plan.waves.map((w) => w.id));
for (const id of [...closeEmpty, ...(onlyWave ? [onlyWave] : [])]) if (!waveIds.has(id)) fail(`wave ${id} is not in ${release}`);
const suites = new Map(loadAllSuites(runDir).map((s) => [s.suiteId, s]));
if (suites.size === 0 && !closeEmpty.size) fail(`no suite results in reports/regression/${runId}/`, 2);

// Attribute every suite of the run to exactly one wave.
const target = new Map<string, string>();
for (const s of suites.keys()) {
  let cands = plan.waves.filter((w) => w.suites.includes(s));
  if (onlyWave) cands = cands.filter((w) => w.id === onlyWave);
  else if (cands.length > 1) cands = cands.filter((w) => !(w.exclusive ?? []).includes(s));
  if (cands.length === 1) target.set(s, cands[0].id);
  else if (cands.length > 1) fail(`suite ${s} sits in ${cands.map((w) => w.id).join(", ")} — name the wave this run belongs to with --wave`);
  else console.warn(`release:split: suite ${s} is in no wave${onlyWave ? ` (or not in ${onlyWave})` : ""} of ${release} — left out`);
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "config/test-suites.json"), "utf-8")) as { suites: { id: string; testCount?: number }[] };
const manifestSize = (id: string) => manifest.suites.find((m) => m.id === id)?.testCount ?? 0;
/** The suite's full size: a run narrowed by priority or ids reports the unfiltered count beside its own. */
function runSize(id: string, s: NormSuite): number {
  const p = join(runDir, `suite-${id}-results.json`);
  let unfiltered = 0;
  if (existsSync(p)) {
    try { unfiltered = Number(JSON.parse(readFileSync(p, "utf-8")).unfilteredTotal) || 0; } catch { /* torn file: fall back */ }
  }
  return Math.max(unfiltered, s.totalCases);
}
function ledgerKeys(wave: string): Set<string> {
  const p = join(relDir, "waves", wave, "ledger.csv");
  if (!existsSync(p)) return new Set();
  const rows = parse(readFileSync(p, "utf-8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return new Set(rows.filter((r) => r.status === "FAIL" || r.status === "BLOCKED").map((r) => `${r.suite}|${r.case_id}`));
}

const GENERATED = /^not (run yet|in the shared run|finished in) /;
const today = new Date().toLocaleDateString("sv-SE"); // local YYYY-MM-DD
const out: string[] = [];
let refused = false;
for (const w of plan.waves) {
  const mine = [...target].filter(([, wid]) => wid === w.id).map(([s]) => s);
  if (!mine.length && !closeEmpty.has(w.id)) continue;

  const dir = join(relDir, "waves", w.id);
  const storePath = join(dir, "cases.json");
  const store: CaseStore = existsSync(storePath) ? JSON.parse(readFileSync(storePath, "utf-8")) : { suites: {}, cases: {} };
  const before = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")) as State;
  if (!existsSync(storePath) && before.totals && (before.runIds ?? []).some((r) => r !== runId)) {
    // Recorded by hand before cases.json existed: its totals cannot be merged case by case, and replacing them with
    // this run alone would lose the earlier runs. Leave the wave as it is.
    console.error(`release:split: ${w.id} was recorded before cases.json existed (runs ${before.runIds.join(", ")}) — record ${runId} in it by hand`);
    refused = true;
    continue;
  }
  for (const s of mine) {
    const r = suites.get(s)!;
    store.suites[s] = Math.max(store.suites[s] ?? 0, runSize(s, r));
    for (const c of r.cases) {
      if (c.id === "_suite" || c.status === "PENDING") continue;
      store.cases[`${s}|${c.id}`] = { status: c.status, run: runId };
    }
  }

  const recorded = (s: string) => Object.keys(store.cases).filter((k) => k.startsWith(`${s}|`)).length;
  const size = (s: string) => Math.max(store.suites[s] ?? manifestSize(s), recorded(s));
  const finishedHere = (s: string) => { const r = suites.get(s); return !!r && target.get(s) === w.id && r.completedAt.trim() !== "" && r.pending === 0; };
  const complete = final || w.suites.every((s) => finishedHere(s) || recorded(s) >= size(s));

  const t: Totals = { planned: 0, executed: 0, pass: 0, fail: 0, blocked: 0, skipped: 0, ambiguous: 0 };
  for (const s of w.suites) t.planned += size(s);
  const failing: string[] = [];
  for (const [key, c] of Object.entries(store.cases)) {
    if (!w.suites.includes(key.split("|")[0])) continue;
    t.executed++;
    if (c.status === "PASS") t.pass++;
    else if (c.status === "FAIL") { t.fail++; failing.push(key); }
    else if (c.status === "BLOCKED") { t.blocked++; failing.push(key); }
    else if (c.status === "SKIPPED") t.skipped++;
    else t.ambiguous++;
  }
  const rowed = ledgerKeys(w.id);
  const untriaged = failing.filter((k) => !rowed.has(k)).length;
  const left = w.suites.map((s) => [s, size(s) - recorded(s)] as const).filter(([, n]) => n > 0);

  out.push(`  ${w.id.padEnd(4)} ${complete ? "closed " : "running"}  executed ${t.executed}/${t.planned} · PASS ${t.pass} · FAIL ${t.fail} · BLOCKED ${t.blocked}` +
    ` · untriaged ${untriaged}${left.length ? ` · not run yet: ${left.map(([s, n]) => `${s}(${n})`).join(" ")}` : ""}`);
  if (!write) continue;

  writeFileSync(storePath, JSON.stringify(store, null, 1) + "\n");
  const statePath = join(dir, "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf-8")) as State;
  if (complete) {
    // Every run that left a result in the wave — a split made while the wave was still open records no run id.
    const runs = Object.entries(store.cases).filter(([k]) => w.suites.includes(k.split("|")[0])).map(([, c]) => c.run);
    state.runIds = [...new Set([...(state.runIds ?? []), ...runs, runId])];
    state.totals = t;
    state.untriaged = untriaged;
    const manual = (state.notRun ?? []).filter((n) => !GENERATED.test(n.reason));
    state.notRun = [...manual, ...(left.length ? [{ suites: left.map(([s]) => s), cases: left.reduce((n, [, k]) => n + k, 0), reason: `not run yet (as of ${runId})` }] : [])];
    if (!state.notRun.length) delete state.notRun;
    if (["NOT_STARTED", "CLAIMED", "RUNNING"].includes(state.status)) state.status = "RUN_DONE";
    else if (["TRIAGED", "DONE"].includes(state.status) && untriaged > 0) state.status = "RUN_DONE";
  } else if (["NOT_STARTED", "CLAIMED"].includes(state.status)) state.status = "RUNNING";
  state.updatedAt = today;
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

console.log(`release:split ${release} ← ${runId}${write ? " (written)" : ""}`);
console.log(out.join("\n") || "  no wave of this release has a suite in the run");
if (write) console.log(`next: npm run release:status -- ${release} --write && npm run release:check -- ${release}`);
process.exit(refused ? 1 : 0);
