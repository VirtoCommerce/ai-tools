/**
 * Close out a regression run — ONE command that does BOTH halves.
 *
 * WHY THIS EXISTS. Closing a run has always required two writes, and they were two
 * separate manual actions:
 *
 *   1. flip `reports/regression/test-run-status.json` to `completed` (the orchestrator,
 *      by hand — `.claude/agents/regression-orchestrator.md` Step 6 says so out loud:
 *      "You are the only writer of that flip — nothing deterministic does it for you.")
 *   2. append the per-suite rows to `history.json` (`npm run triage:history`, also by hand)
 *
 * Doing half of it was therefore the DEFAULT outcome, and measured on 2026-09-07 it was
 * the ACTUAL outcome: eight September runs existed on disk with zero rows in `history.json`,
 * which had not been appended since 2026-08-27. That one gap starves `duration_minutes`,
 * `compute-metrics` trends and gates, `regression:recalibrate`, and defect density — i.e.
 * every number anyone tries to manage this suite with.
 *
 * This is the same class of defect as the competing-cart guard: a mandatory step
 * implemented as "something an agent remembers" instead of a gate the pipeline enforces.
 * The fix for both is the same shape — make it one call that cannot be half-done.
 *
 * ORDER IS LOAD-BEARING: history FIRST, status flip SECOND.
 *   - append fails after the flip  -> the run LOOKS finished, so nothing ever prompts a
 *     repair. That is precisely the bug being fixed, reintroduced.
 *   - flip fails after the append  -> re-running fixes it, because `mergeHistoryRows` is
 *     idempotent per (runId, suiteId).
 * So the recoverable failure is the one we choose to risk.
 *
 * Usage:
 *   npx tsx scripts/regression/close-run.ts --run-id <RUN_ID|latest> [--env <env>]
 *                                           [--status completed|stalled] [--json] [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import { fileURLToPath } from "url";
import { REG_ROOT, appendSuiteHistory, resolveRunDir } from "../lib/regression-triage.js";

const STATUS_PATH = join(REG_ROOT, "test-run-status.json");

/** Terminal statuses this tool may write. `stalled` is reserved for `regression:reap`. */
export type CloseStatus = "completed" | "stalled";

export interface StatusFile {
  runId?: string;
  status?: string;
  finishedAt?: string | null;
  [k: string]: unknown;
}

export interface CloseResult {
  runId: string;
  runDir: string;
  /** Per-suite rows written to history.json. 0 is a WARNING, never a clean close. */
  historyRows: number;
  /** True only when test-run-status.json was actually rewritten. */
  statusWritten: boolean;
  /** Why the status was not written, when it wasn't. */
  statusSkippedReason?: string;
  warnings: string[];
}

export function loadStatus(path = STATUS_PATH): StatusFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StatusFile;
  } catch {
    return null;
  }
}

function isOpen(s: StatusFile | null): boolean {
  const v = String(s?.status ?? "").toLowerCase();
  return v === "in_progress" || v === "running";
}

/**
 * Flip the run to a terminal status. Re-reads immediately before writing and bails if the
 * file no longer describes THIS open run — same concurrency guard `markRunStalled` uses,
 * and the same reason: several sessions share this tree, and clobbering another session's
 * run envelope is unrecoverable for them.
 */
export function markRunClosed(
  runId: string,
  status: CloseStatus,
  nowIso: string,
  path = STATUS_PATH,
): { written: boolean; reason?: string } {
  const fresh = loadStatus(path);
  if (!fresh) return { written: false, reason: `no ${path} on disk` };
  if (String(fresh.runId ?? "") !== runId) {
    return { written: false, reason: `status file describes ${fresh.runId ?? "(no runId)"}, not ${runId} — refusing to overwrite another run` };
  }
  if (!isOpen(fresh)) {
    return { written: false, reason: `already terminal (status: ${fresh.status ?? "?"}) — left as-is` };
  }
  const updated: StatusFile = { ...fresh, status, finishedAt: fresh.finishedAt ?? nowIso };
  writeFileSync(path, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return { written: true };
}

/**
 * Suites the status envelope still reports as unfinished. `running` means a lane is
 * live; `pending` means one is queued. Either way the run is not over, and appending
 * its partial results to history would feed half-measurements into calibration.
 */
export function openSuites(path = STATUS_PATH): Array<{ id: string; state: string }> {
  const s = loadStatus(path);
  const suites = (s?.suites ?? {}) as Record<string, { status?: string }>;
  return Object.entries(suites)
    .map(([id, v]) => ({ id, state: String(v?.status ?? "").toLowerCase() }))
    .filter((x) => x.state === "running" || x.state === "pending");
}

export function closeRun(
  runArg: string,
  env: string,
  status: CloseStatus,
  opts: { dryRun?: boolean; nowIso?: string; force?: boolean } = {},
): CloseResult {
  const runDir = resolveRunDir(runArg);
  // basename() rather than a hand-rolled separator regex: this must handle the BACKSLASH
  // paths resolveRunDir returns on Windows, and node:path already knows how.
  const runId = basename(runDir) || runArg;
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const warnings: string[] = [];

  // Completeness FIRST, before BOTH halves. A run with lanes still live is not over:
  // flipping its status kills the live dashboard, and appending its partial suites
  // feeds half-measurements into estimate calibration.
  const open = openSuites();
  if (open.length && !opts.force && !opts.dryRun) {
    const states = [...new Set(open.map((o) => o.state))].join("/");
    return {
      runId,
      runDir,
      historyRows: 0,
      statusWritten: false,
      statusSkippedReason: `run is not finished — ${open.length} suite(s) still ${states} (${open.map((o) => o.id).join(", ")}); use --force only when the orchestrator is provably gone`,
      warnings,
    };
  }

  // --- half 1: history (idempotent per runId::suiteId, so safe to re-run) ---
  let historyRows = 0;
  if (opts.dryRun) {
    warnings.push("dry run: history not appended, status not flipped");
  } else {
    historyRows = appendSuiteHistory(runId, env, runDir);
    if (historyRows === 0) {
      // Never report this as a clean close. Zero rows means readRunSuites found no
      // suite-*-results.json, so the run produced no per-case record at all — the
      // dashboard, the triage collector and the metrics gate all have nothing to read.
      warnings.push(`no suite results found under ${runDir} — history gained 0 rows; the run recorded no per-case evidence`);
    }
  }

  // --- half 2: status flip ---
  if (opts.dryRun) {
    return { runId, runDir, historyRows, statusWritten: false, statusSkippedReason: "dry run", warnings };
  }
  const flip = markRunClosed(runId, status, nowIso);
  return { runId, runDir, historyRows, statusWritten: flip.written, statusSkippedReason: flip.reason, warnings };
}

// --- CLI -------------------------------------------------------------------

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  // Look ahead for a VALUE, not just an index: `--run-id` as the final token must not
  // silently resolve to `undefined` and then act on the wrong run.
  if (i === -1) return undefined;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

function main(): void {
  const argv = process.argv.slice(2);
  const runArg = argValue(argv, "run-id");
  if (!runArg) {
    // Deliberately NO "latest" default. Measured 2026-09-07: with a bare `--run-id`
    // the fallback resolved to the newest run dir, which was the run then EXECUTING,
    // and this tool closed it out. A terminal write must name its target explicitly.
    console.error("--run-id <RUN_ID> is required (there is no 'latest' default: closing the newest run is how a LIVE run gets closed by mistake)");
    process.exit(2);
  }
  const env = argValue(argv, "env") ?? process.env.TEST_ENV ?? "vcst";
  const statusArg = (argValue(argv, "status") ?? "completed") as CloseStatus;
  if (statusArg !== "completed" && statusArg !== "stalled") {
    console.error(`--status must be "completed" or "stalled" (got "${statusArg}")`);
    process.exit(2);
  }
  const json = argv.includes("--json");
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");

  const r = closeRun(runArg, env, statusArg, { dryRun, force });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Run ${r.runId}`);
    console.log(`  history.json  : +${r.historyRows} per-suite row(s)`);
    console.log(`  status        : ${r.statusWritten ? statusArg : `NOT written — ${r.statusSkippedReason}`}`);
    for (const w of r.warnings) console.log(`  WARNING       : ${w}`);
  }

  // Exit non-zero when the close-out is incomplete, so a caller (or CI) cannot read a
  // half-close as success — the failure mode this script exists to remove.
  if (!dryRun && (!r.statusWritten || r.historyRows === 0)) process.exit(1);
}

const isCli = (() => {
  try {
    return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isCli) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
