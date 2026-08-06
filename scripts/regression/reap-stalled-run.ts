/**
 * Reclaim an orphaned regression run.
 *
 * `reports/regression/test-run-status.json` is written only by the orchestrator
 * (an LLM step) — nothing deterministic ever closes it out. If the orchestrator
 * dies between Step 3 (write `in_progress`) and Step 6 (flip `completed`), the
 * file stays `in_progress` forever, and two things never recover on their own:
 *
 *   1. the live dashboard watcher never reaches its settle branch, and
 *   2. `/qa-regression` Step 0's duplicate check blocks every future run.
 *
 * This module is the deterministic backstop. It classifies a run from FILE
 * EVIDENCE (newest mtime across the run's own results/screenshots) rather than
 * from anyone's say-so, and — only when it can prove the run has been silent
 * past the idle limit — marks it `stalled`.
 *
 * `stalled` is deliberately NOT `completed`: the run did not finish, and saying
 * it did would put a phantom green run into history.json. It is an observation
 * ("nobody has touched this for N minutes"), so a still-alive orchestrator that
 * later writes `completed` simply wins.
 *
 * Usage:
 *   npx tsx scripts/regression/reap-stalled-run.ts              # dry-run classification
 *   npx tsx scripts/regression/reap-stalled-run.ts --apply      # mark a proven-stalled run
 *   npx tsx scripts/regression/reap-stalled-run.ts --json       # machine-readable
 *   npx tsx scripts/regression/reap-stalled-run.ts --idle-min 20 --apply
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Default silence window before a run is considered orphaned. Matches the
 *  dashboard watcher's own idle valve so the two agree on what "stalled" means. */
export const DEFAULT_IDLE_LIMIT_MS = 45 * 60 * 1000;

/**
 * Files inside a run directory that the REPORTER writes, not the run.
 * `regression-report.html` is rewritten by the watcher on every tick, so
 * counting it as activity would make any run with a live watcher look busy
 * forever — the exact opposite of what this check is for.
 */
export const NON_EVIDENCE_BASENAMES = new Set(["regression-report.html"]);

export type RunLiveness = "no-status" | "settled" | "active" | "stalled";

export interface RunActivity {
  /** Newest mtime (epoch ms) across the run's own evidence, or null if none could be read. */
  newestActivityMs: number | null;
  /** Where that timestamp came from — for the operator-facing reason string. */
  newestActivitySource?: string;
}

export interface RunStatusFile {
  runId?: string;
  status?: string;
  [k: string]: unknown;
}

export interface Classification {
  liveness: RunLiveness;
  runId: string | null;
  idleMs: number | null;
  reason: string;
}

function isInProgress(status: RunStatusFile | null): boolean {
  const s = String(status?.status ?? "").toLowerCase();
  return s === "in_progress" || s === "running";
}

function minutes(ms: number): string {
  return `${Math.floor(ms / 60000)} min`;
}

/**
 * Decide whether a run is orphaned. Pure — all I/O is the caller's.
 *
 * Containment rule: absence of evidence is NOT evidence of a stall. Anything
 * this function cannot prove idle stays `active`, because a false reap frees the
 * duplicate-check interlock and lets a second regression run start on top of a
 * live one (they would fight over the same three browser lanes).
 */
export function classifyRun(
  status: RunStatusFile | null,
  activity: RunActivity,
  nowMs: number,
  idleLimitMs: number = DEFAULT_IDLE_LIMIT_MS
): Classification {
  const runId = status?.runId ? String(status.runId) : null;

  if (!status || !runId) {
    return { liveness: "no-status", runId, idleMs: null, reason: "no run-status file (or no runId in it)" };
  }
  if (!isInProgress(status)) {
    return { liveness: "settled", runId, idleMs: null, reason: `run-level status is "${status.status}" — nothing to reclaim` };
  }
  if (activity.newestActivityMs === null) {
    return { liveness: "active", runId, idleMs: null, reason: "no activity evidence readable — refusing to reap on a guess" };
  }

  const idleMs = Math.max(0, nowMs - activity.newestActivityMs);
  const src = activity.newestActivitySource ? ` (newest: ${activity.newestActivitySource})` : "";
  if (idleMs > idleLimitMs) {
    return {
      liveness: "stalled",
      runId,
      idleMs,
      reason: `in_progress but silent for ${minutes(idleMs)} > ${minutes(idleLimitMs)} limit${src}`,
    };
  }
  return { liveness: "active", runId, idleMs, reason: `progressed ${minutes(idleMs)} ago${src}` };
}

/** Newest mtime across a run's own artifacts, ignoring reporter-written files. */
export function gatherActivity(reportsRoot: string, runId: string): RunActivity {
  let newest: number | null = null;
  let source = "";

  const consider = (path: string, label: string): void => {
    try {
      const m = statSync(path).mtimeMs;
      if (newest === null || m > newest) {
        newest = m;
        source = label;
      }
    } catch {
      /* unreadable file contributes nothing */
    }
  };

  // The status file itself counts: writing it IS orchestrator progress.
  const statusPath = join(reportsRoot, "test-run-status.json");
  if (existsSync(statusPath)) consider(statusPath, "test-run-status.json");

  const runDir = join(reportsRoot, runId);
  const walk = (dir: string, rel: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as never;
    } catch {
      return;
    }
    for (const e of entries as unknown as Array<{ name: string; isDirectory(): boolean }>) {
      const label = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), label);
      else if (!NON_EVIDENCE_BASENAMES.has(e.name)) consider(join(dir, e.name), label);
    }
  };
  if (existsSync(runDir)) walk(runDir, "");

  return { newestActivityMs: newest, newestActivitySource: source || undefined };
}

export function loadStatus(reportsRoot: string): RunStatusFile | null {
  const p = join(reportsRoot, "test-run-status.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RunStatusFile;
  } catch {
    return null;
  }
}

/**
 * Flip a proven-orphaned run to `stalled`. Re-reads the status file immediately
 * before writing and bails if the run changed underneath us (the orchestrator
 * may have woken up and written `completed` in the meantime) — its verdict wins.
 * Returns true only if the file was actually rewritten.
 */
export function markRunStalled(reportsRoot: string, runId: string, reason: string, nowIso: string): boolean {
  const fresh = loadStatus(reportsRoot);
  if (!fresh || String(fresh.runId ?? "") !== runId || !isInProgress(fresh)) return false;

  const updated: RunStatusFile = {
    ...fresh,
    status: "stalled",
    stalledAt: nowIso,
    stalledReason: reason,
    finishedAt: (fresh.finishedAt as string | null | undefined) ?? nowIso,
  };
  writeFileSync(join(reportsRoot, "test-run-status.json"), JSON.stringify(updated, null, 2) + "\n", "utf-8");
  return true;
}

// --- CLI -------------------------------------------------------------------

interface CliArgs {
  reportsRoot: string;
  idleLimitMs: number;
  apply: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { reportsRoot: "reports/regression", idleLimitMs: DEFAULT_IDLE_LIMIT_MS, apply: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reports-root") args.reportsRoot = argv[++i] ?? args.reportsRoot;
    else if (a === "--apply") args.apply = true;
    else if (a === "--json") args.json = true;
    else if (a === "--idle-min" || a.startsWith("--idle-min=")) {
      const raw = a.includes("=") ? a.slice("--idle-min=".length) : argv[++i];
      const n = parseInt(raw ?? "", 10);
      if (!Number.isNaN(n) && n > 0) args.idleLimitMs = n * 60 * 1000;
    } else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage: npx tsx scripts/regression/reap-stalled-run.ts [options]",
          "  --apply             Mark a proven-stalled run as `stalled` (default: dry-run)",
          "  --idle-min <N>      Silence window in minutes (default: 45)",
          "  --reports-root <p>  Reports root (default: reports/regression)",
          "  --json              Machine-readable output",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reportsRoot = resolve(args.reportsRoot);
  const status = loadStatus(reportsRoot);
  const runId = status?.runId ? String(status.runId) : null;
  const activity = runId ? gatherActivity(reportsRoot, runId) : { newestActivityMs: null };
  const c = classifyRun(status, activity, Date.now(), args.idleLimitMs);

  let applied = false;
  if (c.liveness === "stalled" && args.apply && c.runId) {
    applied = markRunStalled(reportsRoot, c.runId, c.reason, new Date().toISOString());
  }

  if (args.json) {
    console.log(JSON.stringify({ ...c, applied, apply: args.apply }, null, 2));
    return;
  }

  console.log(`Run: ${c.runId ?? "(none)"}  →  ${c.liveness.toUpperCase()}`);
  console.log(`  ${c.reason}`);
  if (c.liveness === "stalled") {
    if (applied) console.log(`  Marked "stalled" — the dashboard watcher can settle and a new run is no longer blocked.`);
    else if (args.apply) console.log(`  Not marked — the run changed while being reclaimed (the orchestrator's own verdict wins).`);
    else console.log(`  Dry run. Re-run with --apply to reclaim it.`);
  }
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
