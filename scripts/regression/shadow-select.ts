/**
 * shadow-select — measure whether `regression:select` would have missed a failure, without acting on it.
 *
 *   npm run regression:shadow -- record  --label VCST-1234 --repo vc-module-order --diff main..HEAD
 *   npm run regression:shadow -- compare --label VCST-1234 --run REG-2026-11-24-1024
 *   npm run regression:shadow -- report
 *
 * WHY. `select-suites.ts` is not the default for any pipeline because nobody knows whether a scoped
 * selection catches what `full` catches. This answers that from evidence: `record` stores what the
 * selector WOULD have run for a change (it runs nothing, changes nothing); `compare` checks a real
 * run of that change against it — a failed suite the selector did not pick is a MISS. Enough
 * entries with no MISS is the case for switching; one MISS is the case for fixing the selector.
 *
 * `record` takes the selector's own arguments verbatim (everything after `record`, minus --label),
 * so there is no second way to describe a change. The log is append-only JSONL under
 * `reports/regression/` (gitignored by that folder's rule — local to one machine until un-ignored).
 */
import { execFileSync } from "child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const LOG = process.env.SHADOW_LOG ?? "reports/regression/shadow-log.jsonl";
const RUNS = "reports/regression";
// tsx's CLI run by this Node, with no shell: on Windows a shell (`npx` is a .cmd) hands the selector's
// arguments to cmd.exe unescaped, which eats the `^` of `--diff HEAD^..HEAD` and runs whatever follows
// an `&` — the guarantee `select-suites.ts` keeps by calling git without one.
const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const SELECT = fileURLToPath(new URL("./select-suites.ts", import.meta.url));

interface RecordRow { kind: "record"; label: string; ts: string; repo: string; selected: string[]; predictedMin: number; fullMin: number }
interface CompareRow { kind: "compare"; label: string; run: string; ts: string; failed: string[]; missed: string[]; ranSuites: number; passedNotSelected: string[] }
type Row = RecordRow | CompareRow;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
function readLog(): Row[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf-8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Row);
}
function append(row: Row): void {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify(row) + "\n");
}

function record(argv: string[]): number {
  const label = flag(argv, "--label");
  if (!label) return fail("--label is required (a PR or ticket key, to find the entry again)");
  const rest = argv.filter((_, i) => argv[i] !== "--label" && argv[i - 1] !== "--label");
  const out = execFileSync(process.execPath, [TSX_CLI, SELECT, ...rest, "--json"], { encoding: "utf-8" });
  const j = JSON.parse(out.slice(out.indexOf("{"))) as { repo: string; selected: { id: string }[]; predictedMakespanMinutes: number; fullMakespanMinutes: number };
  const row: RecordRow = { kind: "record", label, ts: new Date().toISOString(), repo: j.repo, selected: j.selected.map((s) => s.id), predictedMin: j.predictedMakespanMinutes, fullMin: j.fullMakespanMinutes };
  append(row);
  console.log(`recorded ${label}: ${row.selected.length} suite(s) selected, ~${row.predictedMin} min vs ${row.fullMin} min full`);
  return 0;
}

function compare(argv: string[]): number {
  const label = flag(argv, "--label");
  const run = flag(argv, "--run");
  if (!label || !run) return fail("--label and --run <RUN_ID> are required");
  const rec = [...readLog()].reverse().find((r): r is RecordRow => r.kind === "record" && r.label === label);
  if (!rec) return fail(`no recorded selection for '${label}' — run \`record\` first, before the run`);
  const dir = join(RUNS, run);
  if (!existsSync(dir)) return fail(`run folder not found: ${dir}`);
  const failed: string[] = [];
  const passedNotSelected: string[] = [];
  let ran = 0;
  for (const f of readdirSync(dir).filter((n) => /^suite-.+-results\.json$/.test(n))) {
    const r = JSON.parse(readFileSync(join(dir, f), "utf-8")) as { suiteId: string; failed: number };
    ran++;
    if (r.failed > 0) failed.push(r.suiteId);
    else if (!rec.selected.includes(r.suiteId)) passedNotSelected.push(r.suiteId);
  }
  const missed = failed.filter((id) => !rec.selected.includes(id));
  append({ kind: "compare", label, run, ts: new Date().toISOString(), failed, missed, ranSuites: ran, passedNotSelected });
  console.log(`${label} vs ${run}: ${ran} suite(s) run, ${failed.length} failed, ${missed.length} MISSED${missed.length ? " → " + missed.join(", ") : ""}`);
  console.log(`${passedNotSelected.length} passing suite(s) the selector would have skipped.`);
  return missed.length ? 3 : 0;
}

function report(): number {
  const rows = readLog();
  const recs = rows.filter((r): r is RecordRow => r.kind === "record");
  const cmps = rows.filter((r): r is CompareRow => r.kind === "compare");
  const misses = cmps.filter((c) => c.missed.length);
  console.log(`${recs.length} recorded · ${cmps.length} compared · ${misses.length} with a MISS`);
  for (const c of cmps) console.log(`  ${c.missed.length ? "MISS" : "ok  "}  ${c.label}  ${c.run}  failed:${c.failed.length}${c.missed.length ? "  missed:" + c.missed.join(",") : ""}`);
  console.log(cmps.length < 5 ? "Too few comparisons to trust the selector yet (aim for 5–10 changes with at least one failure among them)." : misses.length ? "The selector missed a failure — fix it before it replaces `full`." : "No misses so far.");
  return 0;
}

function fail(msg: string): number {
  console.error(`[shadow-select] ${msg}`);
  return 1;
}

const [cmd, ...rest] = process.argv.slice(2);
process.exit(cmd === "record" ? record(rest) : cmd === "compare" ? compare(rest) : cmd === "report" ? report() : fail("usage: record | compare | report"));
