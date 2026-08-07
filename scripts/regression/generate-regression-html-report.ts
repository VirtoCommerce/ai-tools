/**
 * Regression HTML Report Generator (all suites)
 *
 * Reads every suite-*-results.json under a regression run directory, normalizes
 * the three known shapes (browser / GraphQL / smoke), pairs each case with
 * matching screenshots in evidence/ and screenshots/, and renders a single
 * self-contained HTML file (inline CSS + JS, no external assets).
 *
 * Usage:
 *   npx tsx scripts/generate-regression-html-report.ts                    # latest run
 *   npx tsx scripts/generate-regression-html-report.ts --run-id REG-...
 *   npx tsx scripts/generate-regression-html-report.ts --run-id REG-... --open
 *   npx tsx scripts/generate-regression-html-report.ts --embed-images     # base64-inline screenshots (portable)
 *   npx tsx scripts/generate-regression-html-report.ts --watch --open     # live dashboard: auto-refresh until the run completes
 *
 * Live mode (--watch) reads the shared reports/regression/test-run-status.json to show
 * pending/running suites before they write results, injects a <meta refresh> while the run
 * is in progress, and exits with a final static render once the run is marked completed.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";
import { markRunStalled, DEFAULT_IDLE_LIMIT_MS } from "./reap-stalled-run.ts";

type Verdict = "PASS" | "FAIL" | "SKIPPED" | "BLOCKED" | "PENDING" | "EMPTY" | "UNKNOWN";

interface NormCase {
  id: string;
  title: string;
  status: Verdict;
  evidenceText: string;
  evidenceFile: string | null;
  screenshots: string[];
  consoleErrors: string[];
  /** Run-dir-relative path to the per-FAIL failure trace JSON (network + parsed
   * stack traces), or null. Written by the runner for real FAILs only. */
  trace: string | null;
}

interface NormSuite {
  suiteId: string;
  suiteName: string;
  category: "GraphQL" | "Frontend" | "Backend" | "Other";
  browser: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  pending: number;
  casesRecorded: number;
  passRate: number;
  bugs: BugLike[];
  cases: NormCase[];
  liveStatus?: "pending" | "running" | "done";
  isPlaceholder?: boolean;
}

type LiveState = "pending" | "running" | "done";

interface RunStatusSuite {
  id: string;
  name?: string;
  status?: string; // pending | running | done | ...
  browser?: string;
  agent?: string;
  testCount?: number;
  pass?: number | null;
  fail?: number | null;
  blocked?: number | null;
  lane?: string;
}

interface RunStatus {
  runId?: string;
  selection?: string;
  startedAt?: string;
  windowStartUtc?: string;
  finishedAt?: string | null;
  env?: string;
  build?: Record<string, string>;
  // in_progress | running | completed | stalled (reclaimed by reap-stalled-run.ts —
  // an orphaned run the orchestrator never closed out; NOT a completed run)
  status?: string;
  mode?: string;
  outputDir?: string;
  suites?: RunStatusSuite[];
}

interface BugLike {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  testCaseId: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  /**
   * Triage state as the RUNNER recorded it. Optional because minimal rows omit it —
   * absent means "not triaged yet", which the report shows as UNTRIAGED rather than
   * quietly implying the bug is real.
   */
  confirmed?: boolean;
  /** Set when the runner matched this against an already-filed ticket. */
  duplicateOf?: string;
  /** Set when the runner linked (rather than deduped) an existing ticket. */
  relatedTicket?: string;
  /** True for a defect found opportunistically, outside the case's own assertion. */
  incidental?: boolean;
}

/** A case that cannot pass for a non-product reason — see config/known-false-positives.json. */
interface KnownFalsePositive {
  caseId: string;
  suiteId?: string;
  reason: string;
  source: string;
  addedOn?: string;
  recheckWhen?: string;
}

interface Args {
  runId?: string;
  out?: string;
  openInBrowser: boolean;
  reportsRoot: string;
  embedImages: boolean;
  watch: boolean;
  intervalSec: number;
}

/** parseInt with a fallback that only kicks in on an actual parse failure — a
 *  legitimate 0 (or any other falsy-but-valid number) must not be discarded. */
function parseIntArg(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    openInBrowser: false,
    reportsRoot: "reports/regression",
    embedImages: false,
    watch: false,
    intervalSec: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--reports-root") args.reportsRoot = argv[++i];
    else if (a === "--open") args.openInBrowser = true;
    else if (a === "--embed-images") args.embedImages = true;
    else if (a === "--watch") args.watch = true;
    else if (a === "--interval") args.intervalSec = Math.max(2, parseIntArg(argv[++i], 10));
    else if (a.startsWith("--interval=")) args.intervalSec = Math.max(2, parseIntArg(a.slice("--interval=".length), 10));
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage: npx tsx scripts/generate-regression-html-report.ts [options]",
          "  --run-id <ID>        Specific run (default: latest REG-*/SMOKE-* or the in-progress run)",
          "  --out <path>         Output file (default: <run>/regression-report.html)",
          "  --reports-root <p>   Reports root (default: reports/regression)",
          "  --embed-images       Inline screenshots as base64 (single-file portable)",
          "  --watch              Live mode: regenerate on an interval until the run completes",
          "  --interval <sec>     Watch refresh interval in seconds (default: 10)",
          "  --open               Open generated file in default browser",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  return args;
}

function findLatestRun(root: string): string {
  if (!existsSync(root)) throw new Error(`Reports root not found: ${root}`);
  const runs = readdirSync(root)
    .filter((d) => (d.startsWith("REG-") || d.startsWith("SMOKE-")) && statSync(join(root, d)).isDirectory())
    .map((d) => ({ name: d, mtime: statSync(join(root, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (runs.length === 0) throw new Error(`No REG-*/SMOKE-* runs found in ${root}`);
  return runs[0].name;
}

function loadRunStatus(root: string): RunStatus | null {
  const p = join(root, "test-run-status.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as RunStatus;
  } catch {
    return null;
  }
}

/** A run is "live" (still executing) when the shared status says so. */
function statusIsInProgress(status: RunStatus | null): boolean {
  const s = (status?.status ?? "").toLowerCase();
  return s === "in_progress" || s === "running";
}

function normalizeLiveState(s: unknown): LiveState {
  const u = String(s ?? "").toLowerCase();
  if (u === "running") return "running";
  if (u === "done" || u === "completed" || u === "passed" || u === "failed") return "done";
  return "pending";
}

/**
 * Resolve which run to render.
 *  - explicit --run-id wins
 *  - else, if a run is in progress per test-run-status.json, use its runId
 *  - else, newest REG- or SMOKE- dir by mtime
 */
function resolveRunId(root: string, explicit: string | undefined, status: RunStatus | null): string {
  if (explicit) return explicit;
  if (statusIsInProgress(status) && status?.runId) return status.runId;
  return findLatestRun(root);
}

function normalizeStatus(s: unknown): Verdict {
  if (typeof s !== "string") return "UNKNOWN";
  const u = s.toUpperCase();
  if (u === "PASS" || u === "PASSED") return "PASS";
  if (u === "FAIL" || u === "FAILED") return "FAIL";
  if (u === "SKIP" || u === "SKIPPED") return "SKIPPED";
  if (u === "BLOCK" || u === "BLOCKED") return "BLOCKED";
  if (u === "PENDING" || u === "TODO" || u === "NOT RUN" || u === "NOT_RUN" || u === "DEFERRED" || u === "RUNNING" || u === "IN_PROGRESS")
    return "PENDING";
  if (u === "EMPTY") return "EMPTY";
  return "UNKNOWN";
}

function categorize(suiteId: string): NormSuite["category"] {
  if (/^050/.test(suiteId)) return "GraphQL";
  const n = parseInt(suiteId, 10);
  if (Number.isFinite(n)) {
    // Frontend suite IDs: 001-016, 028-048, 070-080
    if ((n >= 1 && n <= 16) || (n >= 28 && n <= 48) || (n >= 70 && n <= 80)) return "Frontend";
    if ((n >= 17 && n <= 27) || (n >= 49 && n <= 67)) return "Backend";
  }
  return "Other";
}

// --- Case-title backfill from the source suite CSVs -------------------------
// Runner result files omit the title on minimal (e.g. PASS) rows to stay small,
// so titles are recovered from the suite's authoring CSV (keyed by case ID via
// the test-suites.json manifest). Retroactive: works on already-written runs.

function findManifest(): string | null {
  const candidates = [
    resolve(process.cwd(), "config/test-suites.json"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../config/test-suites.json"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

let _suiteFileMap: Map<string, string> | null = null;
function suiteFileMap(): Map<string, string> {
  if (_suiteFileMap) return _suiteFileMap;
  _suiteFileMap = new Map();
  const mp = findManifest();
  if (mp) {
    try {
      const m = JSON.parse(readFileSync(mp, "utf-8"));
      const repoRoot = resolve(dirname(mp), "..");
      for (const s of m.suites ?? []) {
        if (s?.id && s?.file) _suiteFileMap.set(String(s.id), resolve(repoRoot, String(s.file)));
      }
    } catch {
      /* manifest missing/unreadable → no backfill */
    }
  }
  return _suiteFileMap;
}

const _titleCache = new Map<string, Map<string, string>>();
function loadCaseTitles(suiteId: string): Map<string, string> {
  const cached = _titleCache.get(suiteId);
  if (cached) return cached;
  const map = new Map<string, string>();
  const file = suiteFileMap().get(suiteId);
  if (file && existsSync(file)) {
    try {
      const records = parseCsv(readFileSync(file, "utf-8"), {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      }) as Record<string, string>[];
      for (const rec of records) {
        const id = (rec.id ?? "").trim();
        const title = (rec.title ?? "").trim();
        if (id) map.set(id, title);
      }
    } catch {
      /* CSV unreadable → leave titles blank */
    }
  }
  _titleCache.set(suiteId, map);
  return map;
}

const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;

/** Every image under the run's evidence/ and screenshots/ dirs, as run-dir-relative paths. */
function listAllShots(runDir: string): string[] {
  const shots: string[] = [];
  for (const dir of ["evidence", "screenshots"]) {
    const dirPath = join(runDir, dir);
    if (!existsSync(dirPath)) continue;
    for (const f of readdirSync(dirPath)) {
      if (IMG_RE.test(f)) shots.push(`${dir}/${f}`);
    }
  }
  return shots;
}

function shotBasename(rel: string): string {
  return (rel.split("/").pop() ?? rel).replace(IMG_RE, "");
}

/**
 * Screenshots whose filename is the case ID or is prefixed by "<caseId>-".
 * The runner names evidence by CASE id (CART-036-FAIL-…, PAY-CS-004-…), and a
 * file may embed a leading suite id too (039-PAY-CS-001-…) — both are matched.
 * The "<caseId>-" boundary keeps CART-036 from claiming CART-0361's shots.
 */
function shotsForCase(caseId: string, allShots: string[]): string[] {
  const cid = caseId.trim().toUpperCase();
  if (!cid) return [];
  return allShots.filter((rel) => {
    const b = shotBasename(rel).toUpperCase();
    return b === cid || b.startsWith(`${cid}-`) || b.includes(`-${cid}-`) || b.endsWith(`-${cid}`);
  });
}

/** Screenshots keyed by leading numeric suite id (e.g. "039-…"), used for the suite-level catch-all. */
function shotsForSuite(suiteId: string, allShots: string[]): string[] {
  const sid = suiteId.trim().toLowerCase();
  if (!sid) return [];
  return allShots.filter((rel) => shotBasename(rel).toLowerCase().startsWith(`${sid}-`));
}

/**
 * Normalize a stored screenshot path (which the runner writes repo-root-relative,
 * e.g. "reports/regression/REG-…/screenshots/foo.png") to a path relative to the
 * run dir, so it resolves against the HTML report sitting inside that dir.
 *
 * `byBase` maps the basename of every image physically present under the run's
 * evidence/screenshots dirs to its run-dir-relative path. It is the authority:
 * some runners violate the "never a bare filename" rule and record a loose name
 * (e.g. "MBR-008-FAIL-….png") whose PNG landed in the repo-root CWD — reconciling
 * by basename rewrites such a reference to the real in-run file when one exists.
 * A bare/unlocatable reference with no matching file is dropped (returns "") so it
 * renders as "no evidence captured" instead of a dead link.
 */
function toRunRelPath(p: string, runId: string, byBase?: Map<string, string>): string {
  let s = String(p).replace(/\\/g, "/").trim();
  // Basename reconciliation first — an in-run file always wins over the recorded path.
  const base = (s.split("/").pop() ?? s).toLowerCase();
  if (byBase && byBase.has(base)) return byBase.get(base)!;
  const marker = `${runId}/`;
  const i = s.indexOf(marker);
  if (i >= 0) return s.slice(i + marker.length);
  // Fallback: keep only the last evidence/screenshots/traces segment onward.
  const m = s.match(/(?:^|\/)((?:evidence|screenshots|traces)\/.+)$/i);
  if (m) return m[1];
  // A bare filename (no directory) that matched no in-run file is unresolvable
  // (misplaced/never-captured) — drop it rather than emit a broken link.
  if (byBase && !s.includes("/")) return "";
  return s;
}

/** Pull explicit per-case screenshot paths from any of the shapes the runner emits. */
function explicitCaseShots(c: any, runId: string, byBase?: Map<string, string>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) { const r = toRunRelPath(v, runId, byBase); if (r) out.push(r); }
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) { const r = toRunRelPath(x, runId, byBase); if (r) out.push(r); }
  };
  push(c?.screenshot);
  push(c?.screenshots);
  push(c?.evidenceScreenshots);
  return out;
}

/** Tally verdicts from the recorded case list (excludes the synthetic _suite row). */
function countByVerdict(cases: NormCase[]) {
  const c = { pass: 0, fail: 0, blocked: 0, skipped: 0, pending: 0, recorded: 0 };
  for (const x of cases) {
    if (x.id === "_suite") continue;
    c.recorded++;
    switch (x.status) {
      case "PASS": c.pass++; break;
      case "FAIL": c.fail++; break;
      case "BLOCKED": c.blocked++; break;
      case "SKIPPED": c.skipped++; break;
      case "PENDING": c.pending++; break;
    }
  }
  return c;
}

/**
 * Resolve a case's GraphQL evidence JSON to a link relative to the run dir (where
 * the HTML report lives). Accepts, in priority order: a dedicated `evidenceFile`
 * field, an `evidence`/`notes` value that is itself a bare `.json` filename
 * (legacy shape — prose lived elsewhere), and a value already carrying a
 * `graphql-evidence/` prefix. The file is located on disk in two places:
 *   - run-scoped   <runDir>/graphql-evidence/<name>        → "graphql-evidence/<name>"
 *   - shared root  reports/regression/graphql-evidence/<name> → "../graphql-evidence/<name>"
 * `graphql-runner.ts` now always writes run-scoped (via --run-id/RUN_ID); run-less
 * ad-hoc runs go to scripts/.graphql-evidence, not under reports/. The shared-root
 * branch is a legacy fallback for pre-existing reports that named a file there — it
 * no longer receives new evidence. Returns null when no candidate exists or the file
 * can't be located (renders as no evidence, not a dead link).
 */
function isJsonName(v: unknown): v is string {
  return typeof v === "string" && /\.json$/i.test(v.trim());
}
function resolveGqlEvidence(c: any, runDir: string): string | null {
  // `graphqlEvidence` is the field the runner-native agent records (a full run-relative
  // path); `evidenceFile`/`evidence`/`notes` cover the dedicated + legacy shapes.
  const candidate = [c?.graphqlEvidence, c?.evidenceFile, c?.evidence, c?.notes].find(isJsonName);
  if (candidate) {
    const norm = String(candidate).replace(/\\/g, "/").trim();
    const bare = norm.split("/").pop()!;
    if (bare) {
      if (existsSync(join(runDir, "graphql-evidence", bare))) return `graphql-evidence/${bare}`;
      if (existsSync(join(dirname(runDir), "graphql-evidence", bare))) return `../graphql-evidence/${bare}`;
      // Recorded with an explicit graphql-evidence/ path but not found on disk — keep
      // the best-effort link rather than silently dropping a deliberately-recorded ref.
      if (/graphql-evidence\//i.test(norm)) return norm;
    }
  }
  // No usable recorded reference — fall back to matching a file named after the case id
  // (`<CASE_ID>-<ts>.json`, the runner's naming). RUN-SCOPED ONLY: a run dir holds a
  // single run's files, so this is unambiguous; the shared root mixes runs and is skipped.
  const cid = String(c?.id ?? "").trim().toUpperCase();
  if (cid) {
    const gqlDir = join(runDir, "graphql-evidence");
    if (existsSync(gqlDir)) {
      const hit = readdirSync(gqlDir).find((f) => {
        if (!/\.json$/i.test(f)) return false;
        const b = f.toUpperCase();
        return b === `${cid}.JSON` || b.startsWith(`${cid}-`);
      });
      if (hit) return `graphql-evidence/${hit}`;
    }
  }
  return null;
}

function normalizeSuite(raw: any, allShots: string[], runId: string, runDir: string): NormSuite {
  const suiteId = String(raw.suiteId ?? "??");
  const cases: NormCase[] = [];
  const suiteShots = shotsForSuite(suiteId, allShots);

  // basename (lowercased) -> run-dir-relative path, for reconciling loose
  // filenames the runner may have recorded (see toRunRelPath).
  const byBase = new Map<string, string>();
  for (const rel of allShots) byBase.set((rel.split("/").pop() ?? rel).toLowerCase(), rel);

  // Screenshots for a case = its explicitly recorded paths + any file named after
  // the case id (deduped). The explicit field is authoritative; the name match
  // catches evidence the runner captured but didn't record on the case row.
  const caseShots = (c: any): string[] =>
    [...new Set([...explicitCaseShots(c, runId, byBase), ...shotsForCase(String(c.id ?? ""), allShots)])];

  // Per-FAIL failure trace (network + parsed stack traces). Runner records it as
  // a repo-root-relative path; normalize to run-dir-relative, or null if absent.
  const caseTrace = (c: any): string | null => {
    const v = c?.trace;
    if (typeof v !== "string" || !v.trim()) return null;
    return toRunRelPath(v, runId, byBase) || null;
  };

  if (Array.isArray(raw.cases)) {
    // Smoke shape: cases[{id, title, status|verdict, expected?, actual?, evidence?, notes?}]
    for (const c of raw.cases) {
      const parts: string[] = [];
      if (c.actual) parts.push(String(c.actual));
      if (c.notes) parts.push(`Note: ${String(c.notes)}`);
      cases.push({
        id: String(c.id ?? ""),
        title: String(c.title ?? ""),
        status: normalizeStatus(c.verdict ?? c.status),
        evidenceText: parts.join(" — "),
        evidenceFile: null,
        screenshots: caseShots(c),
        consoleErrors: Array.isArray(c.consoleErrors) ? c.consoleErrors : [],
        trace: caseTrace(c),
      });
    }
  } else if (Array.isArray(raw.testCases)) {
    for (const c of raw.testCases) {
      const evidenceFile = resolveGqlEvidence(c, runDir);
      // Prose = the first non-filename value among evidence/notes; when a field
      // was consumed as the evidence filename it is not repeated as text.
      const evidenceText = String(
        [c.evidence, c.notes].find((v) => typeof v === "string" && v.trim() && !isJsonName(v)) ?? ""
      );
      cases.push({
        id: String(c.id ?? ""),
        title: String(c.title ?? ""),
        status: normalizeStatus(c.status),
        evidenceText,
        evidenceFile,
        screenshots: caseShots(c),
        consoleErrors: Array.isArray(c.consoleErrors) ? c.consoleErrors : [],
        trace: caseTrace(c),
      });
    }
  }

  const bugs: BugLike[] = Array.isArray(raw.bugs)
    ? raw.bugs.map((b: any) => ({
        id: String(b.id ?? ""),
        title: String(b.title ?? ""),
        severity: (b.severity ?? "Medium") as BugLike["severity"],
        testCaseId: String(b.testCaseId ?? ""),
        stepsToReproduce: String(b.stepsToReproduce ?? ""),
        expected: String(b.expected ?? ""),
        actual: String(b.actual ?? ""),
        // Triage state must survive normalization: bugStatus() reads these four, so
        // dropping them here made every row render UNTRIAGED regardless of what the
        // runner recorded — silently defeating the Status column.
        confirmed: typeof b.confirmed === "boolean" ? b.confirmed : undefined,
        duplicateOf: b.duplicateOf ? String(b.duplicateOf) : undefined,
        relatedTicket: b.relatedTicket ? String(b.relatedTicket) : undefined,
        incidental: typeof b.incidental === "boolean" ? b.incidental : undefined,
      }))
    : [];

  // Append suite-level screenshots that weren't matched to a specific case
  if (suiteShots.length > 0 && cases.length > 0) {
    const matchedSet = new Set(cases.flatMap((c) => c.screenshots));
    const unmatched = suiteShots.filter((s) => !matchedSet.has(s));
    if (unmatched.length > 0) {
      cases.push({
        id: "_suite",
        title: "Suite-level evidence",
        status: "UNKNOWN",
        evidenceText: "",
        evidenceFile: null,
        screenshots: unmatched,
        consoleErrors: [],
        trace: null,
      });
    }
  }

  // Counts are derived from the recorded case list when present (authoritative for
  // both partial/live and completed suites); the raw summary fields are only a
  // fallback for shapes that ship totals without a per-case list.
  const tally = countByVerdict(cases);
  const casesRecorded = tally.recorded;
  const totalCases = Math.max(Number(raw.totalCases ?? 0), casesRecorded, casesRecorded === 0 ? Number(raw.totalCases ?? cases.length) : 0);
  const passed = casesRecorded > 0 ? tally.pass : Number(raw.passed ?? 0);
  const failed = casesRecorded > 0 ? tally.fail : Number(raw.failed ?? 0);
  const blocked = casesRecorded > 0 ? tally.blocked : Number(raw.blocked ?? 0);
  const skipped = casesRecorded > 0 ? tally.skipped : Number(raw.skipped ?? 0);
  // Pending = explicitly-pending cases plus any planned-but-not-yet-recorded cases.
  const pending = tally.pending + Math.max(0, totalCases - casesRecorded);
  // Pass rate is against *decided* cases (excludes pending/skipped/blocked) so a
  // live suite's rate reflects what's actually been evaluated so far.
  const decided = passed + failed;
  const passRate = decided > 0 ? (passed / decided) * 100 : 0;

  return {
    suiteId,
    suiteName: String(raw.suiteName ?? suiteId),
    category: categorize(suiteId),
    browser: String(raw.browser ?? ""),
    environment: String(raw.environment ?? ""),
    startedAt: String(raw.startedAt ?? raw.executedAt ?? ""),
    completedAt: String(raw.completedAt ?? ""),
    totalCases,
    passed,
    failed,
    blocked,
    skipped,
    pending,
    casesRecorded,
    passRate: casesRecorded > 0
      ? parseFloat(passRate.toFixed(1))
      : (typeof raw.passRate === "number" ? raw.passRate : parseFloat(String(raw.passRate ?? passRate.toFixed(1)))),
    bugs,
    cases,
  };
}

function loadAllSuites(runDir: string): NormSuite[] {
  const allShots = listAllShots(runDir);
  const runId = runDir.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  // Broadened to catch browser-suffixed files (suite-072b-…-results-chrome.json)
  // as well as the canonical suite-{ID}-results.json.
  const files = readdirSync(runDir).filter((f) => /^suite-.*results.*\.json$/.test(f));

  // Dedupe by suiteId: a run may hold both `…-results.json` and `…-results-chrome.json`.
  // Keep the record with the most test cases; tie-break on newest mtime.
  const bySuite = new Map<string, { suite: NormSuite; cases: number; mtime: number }>();
  for (const f of files) {
    const full = join(runDir, f);
    const suite = normalizeSuite(JSON.parse(readFileSync(full, "utf-8")), allShots, runId, runDir);
    const cases = suite.cases.length;
    const mtime = statSync(full).mtimeMs;
    const prev = bySuite.get(suite.suiteId);
    if (!prev || cases > prev.cases || (cases === prev.cases && mtime > prev.mtime)) {
      bySuite.set(suite.suiteId, { suite, cases, mtime });
    }
  }
  // liveStatus is left unset here — mergeStatus() stamps running/done from the
  // shared run-status file so a partial (still-executing) results file is shown
  // as RUNNING rather than prematurely DONE.
  return [...bySuite.values()]
    .map((v) => {
      // Backfill case titles the results file omitted (e.g. minimal PASS rows).
      const titles = loadCaseTitles(v.suite.suiteId);
      if (titles.size > 0) {
        for (const c of v.suite.cases) {
          if (!c.title && c.id && titles.has(c.id)) c.title = titles.get(c.id)!;
        }
      }
      return v.suite;
    })
    .sort((a, b) => a.suiteId.localeCompare(b.suiteId));
}

/**
 * Merge the shared run-status file into the loaded suites so a live/early run
 * shows pending/running suites that have not yet written a results JSON.
 * Real results always win — status only supplies placeholders for missing suites.
 */
function mergeStatus(suites: NormSuite[], status: RunStatus | null, runId: string): NormSuite[] {
  // Only treat suites as live when the shared status file belongs to THIS run —
  // otherwise an older completed run rendered while a different run is in progress
  // would mis-flag its suites as "running" (and pre-expand them).
  const runInProgress = statusIsInProgress(status) && status?.runId === runId;
  // Stamp liveStatus onto suites that DID write (partial or full) results.
  // A suite whose run-status entry still says "running" keeps its case rows but
  // is presented as live; anything else settles to "done".
  const stateById = new Map<string, LiveState>();
  if (status && status.runId === runId && Array.isArray(status.suites)) {
    for (const st of status.suites) {
      const id = String(st.id ?? "");
      if (id) stateById.set(id, normalizeLiveState(st.status));
    }
  }
  for (const s of suites) {
    const st = stateById.get(s.suiteId);
    // If the run is live and this suite is flagged running (or has cases still
    // pending), treat it as running; otherwise it's done.
    const looksUnfinished = runInProgress && (st === "running" || (st !== "done" && s.pending > 0 && s.casesRecorded > 0 && s.casesRecorded < s.totalCases));
    s.liveStatus = looksUnfinished ? "running" : "done";
  }

  if (!status || status.runId !== runId || !Array.isArray(status.suites)) return suites;
  const have = new Set(suites.map((s) => s.suiteId));
  const placeholders: NormSuite[] = [];
  for (const st of status.suites) {
    const id = String(st.id ?? "");
    if (!id || have.has(id)) continue;
    const state = normalizeLiveState(st.status);
    const totalCases = Number(st.testCount ?? 0);
    const passed = Number(st.pass ?? 0);
    const failed = Number(st.fail ?? 0);
    const blocked = Number(st.blocked ?? 0);
    const recorded = passed + failed + blocked;
    placeholders.push({
      suiteId: id,
      suiteName: String(st.name ?? id),
      category: categorize(id),
      browser: String(st.browser ?? ""),
      environment: String(status.env ?? ""),
      startedAt: "",
      completedAt: "",
      totalCases,
      passed,
      failed,
      blocked,
      skipped: 0,
      pending: Math.max(0, totalCases - recorded),
      casesRecorded: recorded,
      passRate: 0,
      bugs: [],
      cases: [],
      liveStatus: state,
      isPlaceholder: true,
    });
  }
  return [...suites, ...placeholders].sort((a, b) => a.suiteId.localeCompare(b.suiteId));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatDuration(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "n/a";
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  if (!Number.isFinite(ms) || ms === 0) return "n/a";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function imgSrc(rel: string, runDir: string, embed: boolean): string {
  if (!embed) return rel;
  const full = join(runDir, rel);
  if (!existsSync(full)) return rel;
  const ext = extname(rel).toLowerCase().replace(".", "") || "png";
  const mime = ext === "jpg" ? "jpeg" : ext;
  const b64 = readFileSync(full).toString("base64");
  return `data:image/${mime};base64,${b64}`;
}

function statusBadge(v: Verdict): string {
  return `<span class="badge b-${v.toLowerCase()}">${v}</span>`;
}

function liveBadge(state: LiveState): string {
  const label = state === "running" ? "● RUNNING" : state === "done" ? "DONE" : "PENDING";
  return `<span class="badge live-${state}">${label}</span>`;
}

function severityBadge(sev: BugLike["severity"]): string {
  return `<span class="badge sev-${sev.toLowerCase()}">${sev}</span>`;
}

function progressBar(p: number, f: number, s: number, b: number, total: number, pending = 0, live = false): string {
  if (total === 0) return `<div class="bar"><div class="bar-empty">no data</div></div>`;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const pendCls = live ? "bar-pending live" : "bar-pending";
  return `<div class="bar" title="${p}P / ${f}F / ${s}S / ${b}B${pending ? ` / ${pending} pending` : ""}">
      ${p ? `<div class="bar-pass" style="width:${pct(p)}"></div>` : ""}
      ${f ? `<div class="bar-fail" style="width:${pct(f)}"></div>` : ""}
      ${b ? `<div class="bar-blocked" style="width:${pct(b)}"></div>` : ""}
      ${s ? `<div class="bar-skip" style="width:${pct(s)}"></div>` : ""}
      ${pending ? `<div class="${pendCls}" style="width:${pct(pending)}"></div>` : ""}
    </div>`;
}

function renderDonut(p: number, f: number, s: number, b: number, pending = 0): string {
  const total = p + f + s + b + pending;
  if (total === 0) return "";
  const r = 60;
  const c = 2 * Math.PI * r;
  const segs = [
    { val: p, color: "var(--pass)" },
    { val: f, color: "var(--fail)" },
    { val: s, color: "var(--skip)" },
    { val: b, color: "var(--blocked)" },
    { val: pending, color: "var(--pending)" },
  ];
  let offset = 0;
  const circles = segs
    .filter((x) => x.val > 0)
    .map((x) => {
      const len = (x.val / total) * c;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${x.color}" stroke-width="18"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
      offset += len;
      return el;
    })
    .join("");
  // Pass rate is against decided cases (pending excluded) so a live run's centre
  // figure reflects what's actually been evaluated.
  const decided = total - pending;
  const pct = decided > 0 ? ((p / decided) * 100).toFixed(0) : "0";
  return `<svg class="donut" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="18"/>
    ${circles}
    <text x="70" y="68" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="700">${pct}%</text>
    <text x="70" y="86" text-anchor="middle" fill="var(--text-dim)" font-size="10">PASS RATE</text>
  </svg>`;
}

function renderCaseRow(c: NormCase, runDir: string, embed: boolean): string {
  const evidenceCell: string[] = [];
  if (c.evidenceText) evidenceCell.push(`<div class="ev-text">${escapeHtml(c.evidenceText)}</div>`);
  if (c.evidenceFile) {
    evidenceCell.push(
      `<div class="ev-link"><a href="${escapeHtml(c.evidenceFile)}" target="_blank">${escapeHtml(c.evidenceFile)}</a></div>`
    );
  }
  if (c.trace) {
    evidenceCell.push(
      `<div class="ev-link ev-trace"><a href="${escapeHtml(c.trace)}" target="_blank" title="Failure trace: network + parsed stack traces">🩺 failure trace</a></div>`
    );
  }
  if (c.screenshots.length > 0) {
    evidenceCell.push(
      `<div class="ev-shots">${c.screenshots
        .map(
          (s) =>
            `<a href="${escapeHtml(s)}" target="_blank" class="shot"><img loading="lazy" src="${imgSrc(s, runDir, embed)}" alt="${escapeHtml(s)}"></a>`
        )
        .join("")}</div>`
    );
  }
  if (c.consoleErrors && c.consoleErrors.length > 0) {
    evidenceCell.push(
      `<details class="ce"><summary>${c.consoleErrors.length} console error(s)</summary><pre>${escapeHtml(c.consoleErrors.join("\n"))}</pre></details>`
    );
  }
  return `<tr class="tc-row" data-status="${c.status}">
    <td class="mono small">${escapeHtml(c.id)}</td>
    <td>${escapeHtml(c.title)}</td>
    <td>${statusBadge(c.status)}</td>
    <td class="ev">${evidenceCell.join("") || '<span class="muted">—</span>'}</td>
  </tr>`;
}

function suiteAttachmentCounts(s: NormSuite): { shots: number; ev: number } {
  let shots = 0;
  let ev = 0;
  for (const c of s.cases) {
    shots += c.screenshots.length;
    if (c.evidenceFile) ev += 1;
  }
  return { shots, ev };
}

function renderSuiteRow(s: NormSuite, runDir: string, embed: boolean): string {
  const isRunning = s.liveStatus === "running";
  // Placeholder row for a suite that has not yet written ANY case records
  // (pending, or running but no results file yet).
  if (s.isPlaceholder && s.cases.length === 0) {
    const state = s.liveStatus ?? "pending";
    const doneCount = s.passed + s.failed + s.blocked;
    const progressNote =
      state === "running" && s.totalCases > 0
        ? `<span class="live-count">${doneCount}/${s.totalCases} cases</span>`
        : "";
    return `
    <tr class="suite-row placeholder${isRunning ? " running" : ""}" data-suite="${s.suiteId}" data-category="${s.category}" data-rate="-1" data-fail="${s.failed}" data-blocked="${s.blocked}">
      <td></td>
      <td class="mono">${s.suiteId}</td>
      <td><span class="cat-pill cat-${s.category.toLowerCase()}">${s.category}</span></td>
      <td>${escapeHtml(s.suiteName)}</td>
      <td class="mono small">${escapeHtml(s.browser)}</td>
      <td class="num">${s.totalCases || ""}</td>
      <td class="num" colspan="5">${liveBadge(state)} ${progressNote}</td>
      <td class="num muted">—</td>
    </tr>`;
  }
  const rate = s.passRate;
  const rateClass = rate >= 90 ? "rate-good" : rate >= 70 ? "rate-warn" : "rate-bad";
  const att = suiteAttachmentCounts(s);
  const attBadge =
    att.shots + att.ev > 0
      ? `<span class="att-badge" title="${att.shots} screenshot(s), ${att.ev} evidence file(s)">📎 ${att.shots + att.ev}</span>`
      : "";
  // Only a live, currently-running suite is pre-expanded (so you can watch cases
  // flip). In a completed run every suite renders collapsed — click a row, or use
  // "Expand all", to open it.
  const open = isRunning;
  const openCls = open ? " open" : "";
  const hiddenCls = open ? "" : " hidden";
  const decided = s.passed + s.failed;
  const doneCount = decided + s.blocked + s.skipped;
  // Rate column: live progress for a running suite, final pass-rate otherwise.
  const rateCell = isRunning
    ? `<td class="num live-rate">${liveBadge("running")}<span class="live-count">${doneCount}/${s.totalCases}</span></td>`
    : `<td class="num ${rateClass}"><strong>${rate.toFixed(1)}%</strong></td>`;
  return `
    <tr class="suite-row${isRunning ? " running" : ""}" data-suite="${s.suiteId}" data-category="${s.category}" data-rate="${isRunning ? -1 : rate}" data-fail="${s.failed}" data-blocked="${s.blocked}">
      <td><button class="toggle${openCls}" aria-label="Expand">▶</button></td>
      <td class="mono">${s.suiteId}</td>
      <td><span class="cat-pill cat-${s.category.toLowerCase()}">${s.category}</span></td>
      <td>${escapeHtml(s.suiteName)} ${attBadge}</td>
      <td class="mono small">${escapeHtml(s.browser)}</td>
      <td class="num">${s.totalCases}</td>
      <td class="num pass">${s.passed}</td>
      <td class="num fail">${s.failed || ""}</td>
      <td class="num skip">${s.skipped || ""}</td>
      <td class="num blocked">${s.blocked || ""}</td>
      <td>${progressBar(s.passed, s.failed, s.skipped, s.blocked, s.totalCases, s.pending, isRunning)}</td>
      ${rateCell}
    </tr>
    <tr class="suite-detail${hiddenCls}" data-detail-for="${s.suiteId}">
      <td colspan="12">
        <div class="detail-wrap">
          ${s.cases.length === 0 ? '<div class="muted">No case records yet.</div>' : `
          <table class="cases">
            <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>${s.cases.map((c) => renderCaseRow(c, runDir, embed)).join("")}</tbody>
          </table>`}
        </div>
      </td>
    </tr>`;
}

interface AttachmentItem {
  suiteId: string;
  suiteName: string;
  caseId: string;
  caseTitle: string;
  caseStatus: Verdict;
  path: string;
}

function collectAttachments(suites: NormSuite[]): AttachmentItem[] {
  const items: AttachmentItem[] = [];
  for (const s of suites) {
    for (const c of s.cases) {
      for (const p of c.screenshots) {
        items.push({
          suiteId: s.suiteId,
          suiteName: s.suiteName,
          caseId: c.id,
          caseTitle: c.title,
          caseStatus: c.status,
          path: p,
        });
      }
    }
  }
  return items;
}

function renderGallery(items: AttachmentItem[], runDir: string, embed: boolean): string {
  if (items.length === 0) {
    return `<div class="empty-gallery">No screenshot attachments captured for this run. GraphQL evidence (JSON payloads) is linked inside each suite's case rows below.</div>`;
  }
  return `<div class="gallery">${items
    .map(
      (it) => `<figure class="g-card" data-suite="${it.suiteId}" data-status="${it.caseStatus}">
        <a href="${escapeHtml(it.path)}" target="_blank" class="shot"><img loading="lazy" src="${imgSrc(it.path, runDir, embed)}" alt="${escapeHtml(it.path)}"></a>
        <figcaption>
          <div class="g-line1"><span class="mono">${escapeHtml(it.suiteId)}</span> · ${statusBadge(it.caseStatus)}</div>
          <div class="g-line2">${escapeHtml(it.caseId === "_suite" ? it.suiteName : it.caseTitle)}</div>
          <div class="g-line3 mono small">${escapeHtml(it.path)}</div>
        </figcaption>
      </figure>`
    )
    .join("")}</div>`;
}

interface RenderOpts {
  status: RunStatus | null;
  live: boolean;
  intervalSec: number;
}

let _knownFps: Map<string, KnownFalsePositive> | null = null;
/**
 * Known false positives, keyed by case ID. Read from config/known-false-positives.json;
 * a missing or malformed file yields an EMPTY map — the report must degrade to showing
 * everything rather than silently trusting a file it could not parse.
 *
 * Entries missing `reason` or `source` are dropped: the policy is that an exclusion
 * without a verifiable justification is not admissible, and enforcing that here means a
 * hand-edited file cannot weaken the report by omission.
 */
function knownFalsePositives(): Map<string, KnownFalsePositive> {
  if (_knownFps) return _knownFps;
  const map = new Map<string, KnownFalsePositive>();
  const candidates = [
    resolve(process.cwd(), "config/known-false-positives.json"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../config/known-false-positives.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as { entries?: KnownFalsePositive[] };
      for (const e of raw.entries ?? []) {
        if (!e?.caseId || !e?.reason || !e?.source) continue;
        map.set(e.caseId.trim().toUpperCase(), e);
      }
    } catch {
      // Unparsable registry → behave as if it were empty (fail loud by showing more, not less).
    }
    break;
  }
  _knownFps = map;
  return map;
}

type BugStatus = { label: string; cls: string; title: string; excluded: boolean };

/**
 * Derive a bug's triage status from what the runner actually recorded — never invented.
 * `excluded: true` marks a row as non-actionable (a known false positive or a duplicate of
 * an already-filed ticket); such rows are grouped and counted separately, never removed.
 */
function bugStatus(b: BugLike & { suiteId: string }): BugStatus {
  const fp = knownFalsePositives().get(String(b.testCaseId ?? "").trim().toUpperCase());
  if (fp) {
    return {
      label: "KNOWN FP",
      cls: "bs-fp",
      title: `Known false positive — ${fp.reason} (source: ${fp.source}${fp.recheckWhen ? `; recheck when: ${fp.recheckWhen}` : ""})`,
      excluded: true,
    };
  }
  if (b.duplicateOf) {
    return { label: `DUPLICATE`, cls: "bs-dup", title: `Already filed as ${b.duplicateOf} — linked, not re-filed`, excluded: true };
  }
  const incidental = b.incidental ? " · incidental" : "";
  if (b.relatedTicket) {
    return { label: `LINKED${incidental}`, cls: "bs-linked", title: `Related to ${b.relatedTicket}`, excluded: false };
  }
  if (b.confirmed === true) {
    return { label: `CONFIRMED${incidental}`, cls: "bs-confirmed", title: "Reproduced by the runner", excluded: false };
  }
  if (b.confirmed === false) {
    return { label: `UNCONFIRMED${incidental}`, cls: "bs-unconfirmed", title: "Recorded but not reproduced — needs live verification before filing", excluded: false };
  }
  return { label: `UNTRIAGED${incidental}`, cls: "bs-untriaged", title: "No triage state recorded by the runner", excluded: false };
}

type EtaEstimate = {
  /** Aggregate observed throughput across the running suites, cases/minute. */
  ratePerMin: number | null;
  /** Projected time to decide the IN-FLIGHT undecided cases, in ms. Excludes queued suites. */
  runRemainingMs: number | null;
  /** Per-suite projection (running suites only), keyed by suiteId. */
  perSuiteMs: Map<string, number>;
  /** Running suites that contributed a measurable rate. */
  lanes: number;
  /** Running suites in total — `lanes < runningTotal` means the projection is on partial evidence. */
  runningTotal: number;
  /** Cases in suites that have not started at all; deliberately NOT in `runRemainingMs`. */
  queuedCases: number;
  /** Set when a running suite had an unusable `startedAt` (clock skew / future timestamp). */
  skewWarning: boolean;
};

/**
 * Live ETA for a run still in flight.
 *
 * **Measured, never assumed.** Throughput comes from the suites that are ACTUALLY
 * running — each one's own `startedAt` against the cases it has already decided — so a
 * slow lane (a batched 115-case backend suite, or edge vs chrome) is reflected instead
 * of being averaged away by a run-level guess. A run-level rate would also be wrong
 * whenever `test-run-status.json` is missing or its `startedAt` predates the first
 * suite by a wide margin.
 *
 * The run projection divides every still-undecided case — running AND queued — by the
 * observed aggregate throughput. That implicitly assumes queued suites inherit the
 * lanes the running ones occupy, which is how this harness behaves (a fixed browser
 * pool hands a freed lane to the next suite). It is an approximation, hence the "~",
 * and it will read long while lanes sit idle and short if a queued suite is cheaper
 * than the ones currently measured.
 *
 * Returns `null` rather than a number whenever the evidence is insufficient: a
 * fabricated ETA is worse than none, because an operator plans around it.
 */
function estimateEta(allSuites: NormSuite[], nowMs: number): EtaEstimate {
  const perSuiteMs = new Map<string, number>();
  const undecidedOf = (s: NormSuite) =>
    Math.max(0, s.totalCases - (s.passed + s.failed + s.blocked + s.skipped));

  // Queued work is counted SEPARATELY, never folded into the projection: a suite that has
  // not started has no measured rate of its own, and pricing its cases at a running suite's
  // rate produced a 685-minute "ETA" from a single 8-case admin suite on 2026-08-06.
  const started = allSuites.filter((s) => s.liveStatus === "running" || s.liveStatus === "done");
  const queuedCases = allSuites
    .filter((s) => !started.includes(s))
    .reduce((a, s) => a + s.totalCases, 0);

  const running = allSuites.filter((s) => s.liveStatus === "running");
  const none: EtaEstimate = {
    ratePerMin: null, runRemainingMs: null, perSuiteMs, lanes: 0,
    runningTotal: running.length, queuedCases, skewWarning: false,
  };

  let ratePerMin = 0;
  let lanes = 0;
  let skewWarning = false;

  for (const s of running) {
    const startMs = s.startedAt ? Date.parse(s.startedAt) : NaN;
    if (!Number.isFinite(startMs)) continue;
    const elapsedMin = (nowMs - startMs) / 60000;
    // A negative or absurd window means the writer's clock disagrees with ours — a runner
    // stamping LOCAL time with a `Z` suffix yields a future `startedAt` (observed
    // 2026-08-06: -92 min at UTC+2). Flag it: dropping the lane silently makes the
    // projection worse while looking equally confident.
    if (elapsedMin < 0) { skewWarning = true; continue; }
    const decided = s.passed + s.failed + s.blocked + s.skipped;
    // Require a real sample: with <1 decided case or a sub-minute window the first case's
    // own setup latency dominates and the projection swings by hours.
    if (decided < 1 || elapsedMin < 1) continue;
    const rate = decided / elapsedMin;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    lanes += 1;
    ratePerMin += rate;
    perSuiteMs.set(s.suiteId, (Math.max(0, s.totalCases - decided) / rate) * 60000);
  }

  if (lanes === 0 || ratePerMin <= 0) return { ...none, skewWarning };

  // Only in-flight work is projected. When fewer lanes are measurable than are actually
  // running, scale the observed throughput up to the real lane count — otherwise the
  // unmeasured lanes' work is charged to the measured ones and the ETA reads long.
  const inflightUndecided = started.reduce((a, s) => a + undecidedOf(s), 0);
  const effectiveRate = running.length > lanes ? ratePerMin * (running.length / lanes) : ratePerMin;
  return {
    ratePerMin: effectiveRate,
    runRemainingMs: (inflightUndecided / effectiveRate) * 60000,
    perSuiteMs, lanes, runningTotal: running.length, queuedCases, skewWarning,
  };
}

/** Coarse human duration for a projection — minutes below an hour, `1h 45m` above. */
function formatEta(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Local wall-clock label for a projected finish, so the operator can plan against a clock. */
function formatFinishClock(nowMs: number, remainingMs: number): string {
  const d = new Date(nowMs + remainingMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderHtml(runId: string, allSuites: NormSuite[], runDir: string, embed: boolean, opts: RenderOpts): string {
  // Numeric aggregates come from suites that actually produced results;
  // placeholders (pending/running) only appear as live rows in the table.
  const suites = allSuites.filter((s) => !s.isPlaceholder);
  const inProgress = statusIsInProgress(opts.status) && opts.status?.runId === runId;
  const refreshMeta = opts.live && inProgress ? `\n<meta http-equiv="refresh" content="${opts.intervalSec}">` : "";
  const total = suites.reduce(
    (a, s) => ({
      cases: a.cases + s.totalCases,
      pass: a.pass + s.passed,
      fail: a.fail + s.failed,
      blocked: a.blocked + s.blocked,
      skip: a.skip + s.skipped,
      pending: a.pending + s.pending,
      bugs: a.bugs + s.bugs.length,
    }),
    { cases: 0, pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, bugs: 0 }
  );
  const executed = total.cases - total.skip - total.blocked;
  const overallRate = executed > 0 ? (total.pass / executed) * 100 : 0;
  const inclusiveRate = total.cases > 0 ? (total.pass / total.cases) * 100 : 0;
  const cleanSuites = suites.filter((s) => s.failed === 0 && s.totalCases > 0).length;
  const failingSuites = suites.length - cleanSuites;
  const gateThreshold = 95;
  const gateVerdict = overallRate >= gateThreshold ? "PASSED" : "BLOCKED";
  const env = suites[0]?.environment ?? opts.status?.env ?? "unknown";
  const browsers = [...new Set(suites.map((s) => s.browser).filter(Boolean))].join(", ");

  // Live run header (shown whenever the shared status file describes THIS run).
  const statusMatches = opts.status?.runId === runId;
  const suitesTotal = allSuites.length;
  const suitesDone = allSuites.filter((s) => s.liveStatus === "done" && !s.isPlaceholder).length;
  const runningCount = allSuites.filter((s) => s.liveStatus === "running").length;
  const pendingCount = Math.max(0, suitesTotal - suitesDone - runningCount);
  // Live case-level tallies across ALL suites (running placeholders included) so
  // the banner reflects per-case progress, not just whole-suite completion.
  const liveCases = allSuites.reduce(
    (a, s) => ({
      total: a.total + s.totalCases,
      pass: a.pass + s.passed,
      fail: a.fail + s.failed,
      blocked: a.blocked + s.blocked,
      skip: a.skip + s.skipped,
    }),
    { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0 }
  );
  const casesDecided = liveCases.pass + liveCases.fail + liveCases.blocked + liveCases.skip;
  const elapsed = statusMatches
    ? formatDuration(opts.status?.startedAt ?? "", opts.status?.finishedAt || new Date().toISOString())
    : "";
  const donePct = liveCases.total > 0 ? ((casesDecided / liveCases.total) * 100).toFixed(0) : "0";
  const nowMs = Date.now();
  const nowLabel = new Date(nowMs).toISOString().replace("T", " ").slice(0, 19) + "Z";
  // ETA is only meaningful while the run is live; a finished run has an elapsed time.
  const eta = inProgress ? estimateEta(allSuites, nowMs) : null;
  const etaLabel = !inProgress
    ? ""
    : eta && eta.runRemainingMs !== null && eta.ratePerMin !== null
      ? `<span class="live-eta" title="Covers IN-FLIGHT suites only, at ${eta.ratePerMin.toFixed(2)} cases/min measured from ${eta.lanes} of ${eta.runningTotal} running suite${eta.runningTotal === 1 ? "" : "s"}${eta.lanes < eta.runningTotal ? " (throughput scaled to the real lane count)" : ""}.${eta.queuedCases ? ` ${eta.queuedCases} case${eta.queuedCases === 1 ? "" : "s"} in not-yet-started suites are EXCLUDED — they have no measured rate.` : ""}${eta.skewWarning ? " ⚠ A running suite reported a future startedAt (clock skew in the runner) and was excluded from the measurement." : ""}">ETA ~${formatEta(eta.runRemainingMs)} left · done ~${formatFinishClock(nowMs, eta.runRemainingMs)} · ${eta.ratePerMin.toFixed(2)} c/min × ${eta.lanes}${eta.lanes < eta.runningTotal ? `/${eta.runningTotal}` : ""} lane${eta.runningTotal === 1 ? "" : "s"}${eta.queuedCases ? ` · +${eta.queuedCases} queued` : ""}${eta.skewWarning ? " ⚠" : ""}</span>`
      : `<span class="live-eta dim" title="No suite has yet produced a measurable rate (needs at least one decided case and a 1-minute window). Deliberately blank rather than guessed.">ETA —</span>`;
  const liveBanner = statusMatches
    ? `<div class="live-banner ${inProgress ? "running" : "done"}">
        <span class="live-state">${inProgress ? "● RUNNING" : "✓ COMPLETED"}</span>
        <span class="live-progress">${suitesDone}/${suitesTotal} suites
          ${runningCount ? `· <span class="lp-run">${runningCount} running</span>` : ""}${pendingCount ? ` · ${pendingCount} pending` : ""}</span>
        <div class="bar live-bar" title="${casesDecided}/${liveCases.total} cases evaluated">
          ${liveCases.pass ? `<div class="bar-pass" style="width:${((liveCases.pass / Math.max(1, liveCases.total)) * 100).toFixed(1)}%"></div>` : ""}
          ${liveCases.fail ? `<div class="bar-fail" style="width:${((liveCases.fail / Math.max(1, liveCases.total)) * 100).toFixed(1)}%"></div>` : ""}
          ${liveCases.blocked ? `<div class="bar-blocked" style="width:${((liveCases.blocked / Math.max(1, liveCases.total)) * 100).toFixed(1)}%"></div>` : ""}
          ${liveCases.skip ? `<div class="bar-skip" style="width:${((liveCases.skip / Math.max(1, liveCases.total)) * 100).toFixed(1)}%"></div>` : ""}
        </div>
        <span class="live-cases">${casesDecided}/${liveCases.total} cases · <span class="lc-pass">${liveCases.pass}✓</span>${liveCases.fail ? ` <span class="lc-fail">${liveCases.fail}✗</span>` : ""}${liveCases.blocked ? ` <span class="lc-blocked">${liveCases.blocked}⊘</span>` : ""}</span>
        ${etaLabel}
        <span class="live-elapsed">${elapsed}${inProgress ? ` · updated ${nowLabel} · auto-refresh ${opts.intervalSec}s` : ""}</span>
      </div>`
    : "";
  const earliest = suites.reduce((m, s) => (s.startedAt && (!m || s.startedAt < m) ? s.startedAt : m), "");
  const latest = suites.reduce((m, s) => (s.completedAt && (!m || s.completedAt > m) ? s.completedAt : m), "");

  const byCategory: Record<string, NormSuite[]> = { Frontend: [], Backend: [], GraphQL: [], Other: [] };
  for (const s of suites) byCategory[s.category].push(s);
  const catCounts = Object.entries(byCategory).map(([k, v]) => ({
    name: k,
    count: v.length,
    cases: v.reduce((a, s) => a + s.totalCases, 0),
    pass: v.reduce((a, s) => a + s.passed, 0),
    fail: v.reduce((a, s) => a + s.failed, 0),
    skip: v.reduce((a, s) => a + s.skipped, 0),
  }));

  const allBugs = suites.flatMap((s) => s.bugs.map((b) => ({ ...b, suiteId: s.suiteId })));

  const attachments = collectAttachments(suites);
  const graphqlEvidenceCount = suites.reduce(
    (a, s) => a + s.cases.filter((c) => c.evidenceFile).length,
    0
  );
  const suiteRows = allSuites
    .map((s) => renderSuiteRow(s, runDir, embed))
    .join("\n");

  // Status is derived per bug; excluded rows (known false positives, duplicates of an
  // already-filed ticket) are sorted last and visually de-emphasised, but STILL RENDERED
  // and counted — a hidden failure is how a red run reads green.
  const bugsWithStatus = allBugs.map((b) => ({ bug: b, st: bugStatus(b) }));
  const actionableBugs = bugsWithStatus.filter((x) => !x.st.excluded);
  const excludedBugs = bugsWithStatus.filter((x) => x.st.excluded);
  const bugRows = [...actionableBugs, ...excludedBugs]
    .map(
      ({ bug: b, st }) => `<tr class="${st.excluded ? "bug-excluded" : ""}">
        <td class="mono small">${escapeHtml(b.id)}</td>
        <td class="mono small">${escapeHtml(b.suiteId)}</td>
        <td>${severityBadge(b.severity)}</td>
        <td><span class="bug-status ${st.cls}" title="${escapeHtml(st.title)}">${escapeHtml(st.label)}</span></td>
        <td class="mono small">${escapeHtml(b.testCaseId)}</td>
        <td>${escapeHtml(b.title)}</td>
      </tr>`
    )
    .join("\n");
  const bugDisclosure = excludedBugs.length
    ? `<p class="bug-disclosure">${actionableBugs.length} actionable · <strong>${excludedBugs.length} excluded as non-actionable</strong>
       (${excludedBugs.filter((x) => x.st.cls === "bs-fp").length} known false positive${excludedBugs.filter((x) => x.st.cls === "bs-fp").length === 1 ? "" : "s"},
        ${excludedBugs.filter((x) => x.st.cls === "bs-dup").length} duplicate of an already-filed ticket) —
       listed below, greyed, never removed. Hover a status for its justification.</p>`
    : `<p class="bug-disclosure">${actionableBugs.length} actionable · 0 excluded.</p>`;

  const catBars = catCounts
    .filter((c) => c.count > 0)
    .map((c) => {
      const tot = c.pass + c.fail + c.skip;
      const rate = tot > 0 ? ((c.pass / tot) * 100).toFixed(1) : "0.0";
      return `<div class="cat-card">
        <div class="cat-head"><span class="cat-pill cat-${c.name.toLowerCase()}">${c.name}</span>
          <span class="cat-count">${c.count} suites · ${c.cases} cases</span></div>
        <div class="cat-rate">${rate}%</div>
        ${progressBar(c.pass, c.fail, c.skip, 0, tot)}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">${refreshMeta}
<title>Regression Report — ${escapeHtml(runId)}</title>
<style>
  :root {
    --bg: #f6f8fa;
    --surface: #ffffff;
    --surface-2: #eef1f5;
    --border: #d8dee6;
    --text: #1b2733;
    --text-dim: #5e6c7c;
    --muted: #94a3b8;
    --pass: #16a34a;
    --fail: #dc2626;
    --skip: #d97706;
    --blocked: #9333ea;
    --pending: #64748b;
    --info: #2563eb;
    --accent: #0284c7;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px; line-height: 1.5; }
  .container { max-width: 1440px; margin: 0 auto; padding: 32px 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
    border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 32px 0 12px; font-weight: 600; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
  .gate { display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px;
    letter-spacing: 0.05em; text-transform: uppercase; }
  .gate.ok { background: rgba(22, 163, 74, 0.12); color: var(--pass); border: 1px solid rgba(22, 163, 74, 0.4); }
  .gate.bad { background: rgba(220, 38, 38, 0.10); color: var(--fail); border: 1px solid rgba(220, 38, 38, 0.4); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; box-shadow: var(--shadow); }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin-bottom: 6px; }
  .card-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .card-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
  .card.pass .card-value { color: var(--pass); }
  .card.fail .card-value { color: var(--fail); }
  .card.skip .card-value { color: var(--skip); }
  .card.info .card-value { color: var(--info); }
  .donut-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: var(--shadow); }
  .donut { width: 140px; height: 140px; flex-shrink: 0; }
  .legend { display: flex; gap: 16px; font-size: 12px; color: var(--text-dim); flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  .cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .cat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; box-shadow: var(--shadow); }
  .cat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .cat-count { color: var(--text-dim); font-size: 11px; }
  .cat-rate { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
  .cat-pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
  .cat-frontend { background: rgba(37, 99, 235, 0.12); color: var(--info); }
  .cat-backend { background: rgba(147, 51, 234, 0.12); color: var(--blocked); }
  .cat-graphql { background: rgba(2, 132, 199, 0.12); color: var(--accent); }
  .cat-other { background: var(--surface-2); color: var(--text-dim); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); box-shadow: var(--shadow); }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--surface-2); font-weight: 600; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-dim); }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.pass { color: var(--pass); }
  td.fail { color: var(--fail); font-weight: 600; }
  td.skip { color: var(--skip); }
  td.blocked { color: var(--blocked); }
  td.mono, .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; }
  .small { font-size: 12px; }
  .muted { color: var(--muted); font-style: italic; }
  .rate-good { color: var(--pass); }
  .rate-warn { color: var(--skip); }
  .rate-bad { color: var(--fail); }
  .bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-2); min-width: 120px; }
  .bar > div { height: 100%; }
  .bar-pass { background: var(--pass); }
  .bar-fail { background: var(--fail); }
  .bar-skip { background: var(--skip); }
  .bar-blocked { background: var(--blocked); }
  .bar-pending { background: var(--surface-2); }
  .bar-pending.live { background-image: repeating-linear-gradient(45deg,
      rgba(2,132,199,0.10), rgba(2,132,199,0.10) 6px, rgba(2,132,199,0.24) 6px, rgba(2,132,199,0.24) 12px);
    background-size: 24px 24px; animation: barstripe 0.9s linear infinite; }
  @keyframes barstripe { from { background-position: 0 0; } to { background-position: 24px 0; } }
  .bar-empty { color: var(--text-dim); font-size: 11px; padding: 0 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px;
    font-weight: 600; letter-spacing: 0.03em; }
  .b-pass { background: rgba(22, 163, 74, 0.12); color: var(--pass); }
  .b-fail { background: rgba(220, 38, 38, 0.10); color: var(--fail); }
  .b-skipped { background: rgba(217, 119, 6, 0.12); color: var(--skip); }
  .b-blocked { background: rgba(147, 51, 234, 0.12); color: var(--blocked); }
  .b-pending { background: rgba(100, 116, 139, 0.14); color: var(--pending); }
  .b-empty, .b-unknown { background: var(--surface-2); color: var(--text-dim); }
  .live-pending { background: var(--surface-2); color: var(--text-dim); }
  .live-running { background: rgba(2, 132, 199, 0.14); color: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  .live-done { background: rgba(22, 163, 74, 0.12); color: var(--pass); }
  tr.placeholder td { color: var(--text-dim); }
  tr.suite-row.running { background: rgba(2, 132, 199, 0.045); }
  tr.suite-row.running:hover { background: rgba(2, 132, 199, 0.08); }
  .live-count { font-size: 11px; color: var(--text-dim); margin-left: 6px; font-variant-numeric: tabular-nums; }
  .live-rate { white-space: nowrap; }
  .live-cases { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .lc-pass { color: var(--pass); font-weight: 600; }
  .lc-fail { color: var(--fail); font-weight: 600; }
  .lc-blocked { color: var(--blocked); font-weight: 600; }
  .lp-run { color: var(--accent); font-weight: 600; }
  tr.tc-row[data-status="PENDING"] td { color: var(--text-dim); }
  .live-banner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 16px; margin-bottom: 24px; box-shadow: var(--shadow); }
  .live-banner.running { border-color: rgba(2, 132, 199, 0.45); }
  .live-banner.done { border-color: rgba(22, 163, 74, 0.4); }
  .live-state { font-weight: 700; font-size: 13px; letter-spacing: 0.04em; }
  .live-banner.running .live-state { color: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  .live-banner.done .live-state { color: var(--pass); }
  .live-progress { font-size: 13px; color: var(--text-dim); }
  .live-bar { flex: 1; min-width: 160px; height: 10px; }
  .live-elapsed { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .live-eta { font-size: 12px; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums;
    white-space: nowrap; cursor: help; }
  .live-eta.dim { color: var(--text-dim); font-weight: 400; }
  .bug-status { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 10px;
    font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; cursor: help; }
  .bs-confirmed { background: rgba(220, 38, 38, 0.12); color: var(--fail); }
  .bs-unconfirmed { background: rgba(217, 119, 6, 0.14); color: var(--skip); }
  .bs-untriaged { background: rgba(100, 116, 139, 0.14); color: var(--text-dim); }
  .bs-linked { background: rgba(37, 99, 235, 0.12); color: var(--info); }
  .bs-dup { background: rgba(100, 116, 139, 0.12); color: var(--text-dim); }
  .bs-fp { background: rgba(120, 113, 108, 0.16); color: var(--text-dim); }
  tr.bug-excluded { opacity: 0.55; }
  tr.bug-excluded td:last-child { text-decoration: line-through; text-decoration-thickness: 1px; }
  .bug-disclosure { font-size: 12px; color: var(--text-dim); margin: 8px 0 0; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
  .sev-critical { background: rgba(185, 28, 28, 0.14); color: #b91c1c; }
  .sev-high { background: rgba(220, 38, 38, 0.10); color: var(--fail); }
  .sev-medium { background: rgba(217, 119, 6, 0.12); color: var(--skip); }
  .sev-low { background: rgba(37, 99, 235, 0.10); color: var(--info); }
  .toggle { background: transparent; border: none; color: var(--text-dim); cursor: pointer;
    font-size: 10px; padding: 0; width: 18px; transition: transform 0.15s; }
  .toggle.open { transform: rotate(90deg); color: var(--accent); }
  .suite-detail.hidden { display: none; }
  .detail-wrap { padding: 8px 24px 20px; background: var(--bg); }
  .cases { background: transparent; table-layout: fixed; }
  .cases th { background: transparent; border-bottom: 1px solid var(--border); }
  .cases th, .cases td { vertical-align: top; }
  /* Fixed column widths so ID/Status/Title line up across every row. */
  .cases th:nth-child(1), .cases td:nth-child(1) { width: 116px; overflow-wrap: anywhere; word-break: break-word; }
  .cases th:nth-child(2), .cases td:nth-child(2) { width: 30%; }
  .cases th:nth-child(3), .cases td:nth-child(3) { width: 96px; white-space: nowrap; }
  .cases td:nth-child(2) { overflow-wrap: anywhere; }
  .cases td:nth-child(1) { padding-right: 12px; }
  .ev { max-width: 600px; }
  .ev-text { color: var(--text-dim); font-size: 12px; margin-bottom: 6px; line-height: 1.45; }
  .ev-link { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; margin-bottom: 6px; }
  .ev-shots { display: flex; flex-wrap: wrap; gap: 6px; }
  .shot { display: block; }
  .shot img { width: 120px; height: 80px; object-fit: cover; border-radius: 4px;
    border: 1px solid var(--border); cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
  .shot:hover img { border-color: var(--accent); transform: scale(1.02); }
  .ce { margin-top: 6px; font-size: 12px; }
  .ce pre { background: var(--bg); padding: 8px; border-radius: 4px; overflow-x: auto; color: var(--fail); }
  .controls { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
  .controls input, .controls select { background: var(--surface); border: 1px solid var(--border);
    color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; font-family: inherit; }
  .controls input { min-width: 240px; }
  .controls label { font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
  .controls button { background: var(--surface); border: 1px solid var(--border); color: var(--text);
    padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .controls button:hover { background: var(--surface-2); }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
    color: var(--text-dim); font-size: 12px; text-align: center; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); display: none;
    align-items: center; justify-content: center; z-index: 1000; cursor: zoom-out; padding: 24px; }
  .lightbox.on { display: flex; }
  .lightbox img { max-width: 95%; max-height: 95%; border-radius: 4px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .h2-sub { font-size: 12px; font-weight: 400; color: var(--text-dim); margin-left: 12px; letter-spacing: 0; text-transform: none; }
  .att-badge { display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 10px;
    background: rgba(2, 132, 199, 0.12); color: var(--accent); font-size: 11px; font-weight: 600; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .g-card { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden; display: flex; flex-direction: column; }
  .g-card .shot img { width: 100%; height: 140px; object-fit: cover; border: none; border-radius: 0;
    border-bottom: 1px solid var(--border); display: block; }
  .g-card figcaption { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
  .g-line1 { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
  .g-line2 { font-size: 13px; color: var(--text); line-height: 1.35; }
  .g-line3 { color: var(--muted); word-break: break-all; }
  .empty-gallery { background: var(--surface); border: 1px dashed var(--border); border-radius: 8px;
    padding: 24px; text-align: center; color: var(--text-dim); margin-bottom: 24px; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>Regression Test Report</h1>
      <div class="subtitle">Run <span class="mono">${escapeHtml(runId)}</span> &middot; ${escapeHtml(env)} &middot; ${escapeHtml(browsers || "n/a")}
        &middot; Duration: ${formatDuration(earliest, latest)}</div>
    </div>
    <div class="gate ${gateVerdict === "PASSED" ? "ok" : "bad"}">Gate: ${gateVerdict}</div>
  </header>

  ${liveBanner}

  <div class="cards">
    <div class="card">
      <div class="card-label">Suites</div>
      <div class="card-value">${suites.length}</div>
      <div class="card-sub">${cleanSuites} clean &middot; ${failingSuites} with failures</div>
    </div>
    <div class="card info">
      <div class="card-label">Test Cases</div>
      <div class="card-value">${total.cases}</div>
      <div class="card-sub">${executed} executed &middot; ${total.skip} skipped</div>
    </div>
    <div class="card pass">
      <div class="card-label">Passed</div>
      <div class="card-value">${total.pass}</div>
      <div class="card-sub">${overallRate.toFixed(1)}% of executed</div>
    </div>
    <div class="card fail">
      <div class="card-label">Failed</div>
      <div class="card-value">${total.fail}</div>
      <div class="card-sub">${total.bugs} bugs filed</div>
    </div>
    <div class="card skip">
      <div class="card-label">Skipped</div>
      <div class="card-value">${total.skip}</div>
      <div class="card-sub">Blocked: ${total.blocked}${total.pending ? ` &middot; Pending: ${total.pending}` : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">Inclusive Rate</div>
      <div class="card-value">${inclusiveRate.toFixed(1)}%</div>
      <div class="card-sub">Gate threshold: ${gateThreshold}%</div>
    </div>
  </div>

  <div class="donut-wrap">
    ${renderDonut(total.pass, total.fail, total.skip, total.blocked, total.pending)}
    <div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background: var(--pass)"></span>Pass (${total.pass})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--fail)"></span>Fail (${total.fail})</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--skip)"></span>Skip (${total.skip})</div>
        ${total.blocked ? `<div class="legend-item"><span class="legend-dot" style="background: var(--blocked)"></span>Blocked (${total.blocked})</div>` : ""}
        ${total.pending ? `<div class="legend-item"><span class="legend-dot" style="background: var(--pending)"></span>Pending (${total.pending})</div>` : ""}
      </div>
      <div class="subtitle" style="margin-top: 8px;">Pass rate excludes skipped, blocked &amp; pending cases.</div>
    </div>
  </div>

  <h2>By Category</h2>
  <div class="cat-grid">${catBars}</div>

  <h2>Attachments &amp; Evidence
    <span class="h2-sub">${attachments.length} screenshot(s) · ${graphqlEvidenceCount} GraphQL evidence JSON file(s)</span>
  </h2>
  ${renderGallery(attachments, runDir, embed)}

  <h2>Suite Results
    <span class="h2-sub">${inProgress ? "Running suites are pre-expanded — watch cases flip live" : "Click a row, or “Expand all”, to open a suite"}</span>
  </h2>
  <div class="controls">
    <input type="text" id="filter" placeholder="Filter by suite name or ID..."/>
    <select id="cat-filter">
      <option value="">All categories</option>
      <option value="Frontend">Frontend</option>
      <option value="Backend">Backend</option>
      <option value="GraphQL">GraphQL</option>
      <option value="Other">Other</option>
    </select>
    <label><input type="checkbox" id="failed-only"/> Failed only</label>
    <button id="expand-all">Expand all</button>
    <button id="collapse-all">Collapse all</button>
  </div>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>Suite</th>
        <th>Category</th>
        <th>Name</th>
        <th>Browser</th>
        <th class="num">Total</th>
        <th class="num">Pass</th>
        <th class="num">Fail</th>
        <th class="num">Skip</th>
        <th class="num">Blocked</th>
        <th>Distribution</th>
        <th class="num">Rate</th>
      </tr>
    </thead>
    <tbody>${suiteRows}</tbody>
  </table>

  ${
    allBugs.length > 0
      ? `<h2>Bugs (${allBugs.length})</h2>
  <table>
    <thead><tr><th>Bug ID</th><th>Suite</th><th>Severity</th><th>Status</th><th>Test Case</th><th>Title</th></tr></thead>
    <tbody>${bugRows}</tbody>
  </table>
  ${bugDisclosure}`
      : ""
  }

  <footer>
    Generated ${new Date().toISOString()} &middot;
    Source: <span class="mono">reports/regression/${escapeHtml(runId)}/</span> &middot;
    ${embed ? "Images embedded (portable)" : "Images linked (relative paths)"}
  </footer>
</div>

<div class="lightbox" id="lightbox"><img alt=""/></div>

<script>
  document.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      const row = e.target.closest('tr');
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + row.dataset.suite + '"]');
      detail.classList.toggle('hidden');
      btn.classList.toggle('open');
    });
  });

  document.getElementById('expand-all').addEventListener('click', () => {
    document.querySelectorAll('.suite-detail').forEach(d => d.classList.remove('hidden'));
    document.querySelectorAll('.toggle').forEach(b => b.classList.add('open'));
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    document.querySelectorAll('.suite-detail').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.toggle').forEach(b => b.classList.remove('open'));
  });

  const filterInput = document.getElementById('filter');
  const catFilter = document.getElementById('cat-filter');
  const failedOnly = document.getElementById('failed-only');
  function applyFilters() {
    const q = filterInput.value.toLowerCase();
    const cat = catFilter.value;
    const onlyFailed = failedOnly.checked;
    document.querySelectorAll('tr.suite-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      const rate = parseFloat(row.dataset.rate);
      const fail = parseInt(row.dataset.fail || '0', 10);
      const blocked = parseInt(row.dataset.blocked || '0', 10);
      const matchQ = !q || text.includes(q);
      const matchCat = !cat || row.dataset.category === cat;
      // passRate is computed against decided (pass+fail) cases only, so a suite
      // that is all-blocked/all-pending can read 100% — check fail/blocked counts
      // directly rather than relying on rate alone.
      const matchFail = !onlyFailed || rate < 100 || fail > 0 || blocked > 0;
      const show = matchQ && matchCat && matchFail;
      row.style.display = show ? '' : 'none';
      const detail = document.querySelector('tr.suite-detail[data-detail-for="' + row.dataset.suite + '"]');
      if (detail) detail.style.display = show && !detail.classList.contains('hidden') ? '' : 'none';
    });
  }
  filterInput.addEventListener('input', applyFilters);
  catFilter.addEventListener('change', applyFilters);
  failedOnly.addEventListener('change', applyFilters);

  // Lightbox for screenshots
  const lb = document.getElementById('lightbox');
  const lbImg = lb.querySelector('img');
  document.querySelectorAll('.shot').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      lbImg.src = a.querySelector('img').src;
      lb.classList.add('on');
    });
  });
  lb.addEventListener('click', () => lb.classList.remove('on'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('on'); });
</script>
</body>
</html>`;
}

function openInBrowser(path: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", path] : [path];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Self-heal misplaced evidence. A runner that ignores the "never a bare filename"
 * rule (agents/test-runner-agent.md §7) drops its PNG in the MCP-server CWD (repo
 * root) instead of the run's screenshots/ dir, and records a bare name — which then
 * renders as a dead link. Before rendering, sweep every screenshot basename the
 * suite JSONs reference but that is missing from the run dir out of the known
 * fallback locations (repo root, the manual orphan folder, test-results/) into
 * screenshots/, so toRunRelPath can reconcile it. Bounded to referenced basenames.
 */
function reconcileLooseScreenshots(runDir: string, reportsRoot: string): void {
  if (!existsSync(runDir)) return;
  const IMG = /\.(png|jpe?g|gif|webp)$/i;

  // Referenced basenames across this run's suite JSONs — ONLY from the screenshot
  // evidence fields, not arbitrary image URLs quoted in note/actual prose.
  const referenced = new Set<string>();
  const addPath = (v: unknown) => {
    if (typeof v !== "string") return;
    const s = v.replace(/\\/g, "/").trim();
    if (!IMG.test(s)) return;
    referenced.add((s.split("/").pop() ?? s).toLowerCase());
  };
  const walk = (node: any) => {
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (node && typeof node === "object") {
      for (const [k, val] of Object.entries(node)) {
        if (/^(screenshot|screenshots|evidenceScreenshots)$/i.test(k)) {
          Array.isArray(val) ? val.forEach(addPath) : addPath(val);
        } else {
          walk(val);
        }
      }
    }
  };
  for (const f of readdirSync(runDir)) {
    if (!/^suite-.*results.*\.json$/.test(f)) continue;
    try { walk(JSON.parse(readFileSync(join(runDir, f), "utf-8"))); } catch { /* skip malformed */ }
  }
  if (referenced.size === 0) return;

  // Already present in the run dir (screenshots/ or evidence/)?
  const present = new Set<string>();
  for (const dir of ["screenshots", "evidence"]) {
    const p = join(runDir, dir);
    if (existsSync(p)) for (const f of readdirSync(p)) present.add(f.toLowerCase());
  }
  const missing = [...referenced].filter((b) => !present.has(b));
  if (missing.length === 0) return;

  // Fallback locations, in priority order (non-recursive scan of each).
  const repoRoot = resolve(reportsRoot, "..", "..");
  const fallbackDirs = [
    join(repoRoot, "test-results", "_orphaned-root-screenshots"),
    repoRoot,
    join(repoRoot, "test-results"),
  ].filter((d) => existsSync(d));

  const destDir = join(runDir, "screenshots");
  const recovered: string[] = [];
  for (const base of missing) {
    for (const dir of fallbackDirs) {
      const hit = readdirSync(dir).find((f) => IMG.test(f) && f.toLowerCase() === base);
      if (!hit) continue;
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      try { copyFileSync(join(dir, hit), join(destDir, hit)); recovered.push(hit); } catch { /* skip */ }
      break;
    }
  }
  const stillMissing = missing.filter((b) => !recovered.some((r) => r.toLowerCase() === b));
  if (recovered.length) console.log(`  Recovered ${recovered.length} misplaced screenshot(s) into ${destDir}`);
  if (stillMissing.length) console.warn(`  ⚠ ${stillMissing.length} referenced screenshot(s) not found anywhere (never captured): ${stillMissing.slice(0, 8).join(", ")}${stillMissing.length > 8 ? " …" : ""}`);
}

/** What the --watch loop measures "progress" against between ticks. */
export interface WatchProgress {
  runId: string;
  /** Run-level status string from test-run-status.json ("in_progress"/"completed"/…). */
  statusLabel: string;
  /** Suites that have written a results file. */
  suitesWithResults: number;
  /** Case rows present across those results files (pre-seeded PENDING rows included). */
  casesRecorded: number;
  /** Case rows that have reached a verdict (PASS/FAIL/BLOCKED/SKIPPED). */
  evaluatedCases: number;
}

/**
 * Stall-detection signature for the --watch loop: the watcher stops when this
 * string has not changed for `idleLimitMs`.
 *
 * Progress on a live run is per-CASE, not per-suite. The runner pre-seeds every
 * case as PENDING when a suite starts and rewrites its results file after each
 * case, so `suitesWithResults` goes constant on the very first tick of a
 * single-suite run — a signature built from run/status/suite-count alone then
 * reports "no progress" and kills a perfectly healthy watcher after 45 min.
 * (Multi-suite runs masked it: the suite count kept incrementing.) Folding the
 * case counts in is what makes the signature track actual work.
 */
export function watchProgressSignature(p: WatchProgress): string {
  return [p.runId, p.statusLabel || "?", p.suitesWithResults, p.casesRecorded, p.evaluatedCases].join(":");
}

/** The subset of a suite's counters that describes how far it has actually got. */
type SuiteCaseCounters = Pick<NormSuite, "casesRecorded" | "passed" | "failed" | "blocked" | "skipped">;

/** Sum the per-case progress counters across the suites that wrote results. */
export function tallyCaseProgress(suites: SuiteCaseCounters[]): { casesRecorded: number; evaluatedCases: number } {
  return suites.reduce(
    (a, s) => ({
      casesRecorded: a.casesRecorded + s.casesRecorded,
      evaluatedCases: a.evaluatedCases + s.passed + s.failed + s.blocked + s.skipped,
    }),
    { casesRecorded: 0, evaluatedCases: 0 }
  );
}

/**
 * Render one snapshot. Returns the run-level status ("in_progress"/"completed"/absent)
 * so the watch loop knows when to stop. Never exits the process itself.
 */
function renderOnce(
  args: Args,
  reportsRoot: string
): { status: RunStatus | null; runId: string; outPath: string; suitesWithResults: number; casesRecorded: number; evaluatedCases: number } {
  const status = loadRunStatus(reportsRoot);
  const runId = resolveRunId(reportsRoot, args.runId, status);
  const runDir = join(reportsRoot, runId);
  const dirExists = existsSync(runDir);

  if (dirExists) reconcileLooseScreenshots(runDir, reportsRoot);
  const resultSuites = dirExists ? loadAllSuites(runDir) : [];
  const suites = mergeStatus(resultSuites, status, runId);

  // In one-shot mode with nothing to show, fail loudly (unchanged behavior).
  // In watch mode, an empty/early run is fine — the status placeholders carry the view.
  if (suites.length === 0) {
    if (args.watch) {
      console.log(`[watch] ${runId}: no suite results yet — waiting…`);
      return { status, runId, outPath: "", suitesWithResults: 0, casesRecorded: 0, evaluatedCases: 0 };
    }
    if (!dirExists) throw new Error(`Run directory not found: ${runDir}`);
    console.error(`No suite results (suite-*-results.json) found in ${runDir}`);
    process.exit(1);
  }

  const outPath = args.out ? resolve(args.out) : join(runDir, "regression-report.html");
  const live = args.watch && statusIsInProgress(status) && status?.runId === runId;
  const html = renderHtml(runId, suites, runDir, args.embedImages, {
    status,
    live,
    intervalSec: args.intervalSec,
  });
  writeFileSync(outPath, html, "utf-8");

  return { status, runId, outPath, suitesWithResults: resultSuites.length, ...tallyCaseProgress(resultSuites) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reportsRoot = resolve(args.reportsRoot);

  if (!args.watch) {
    const { runId, outPath } = renderOnce(args, reportsRoot);
    const runDir = join(reportsRoot, runId);
    const suites = loadAllSuites(runDir);
    const totals = suites.reduce(
      (a, s) => ({ c: a.c + s.totalCases, p: a.p + s.passed, f: a.f + s.failed, s: a.s + s.skipped }),
      { c: 0, p: 0, f: 0, s: 0 }
    );
    const shotCount = suites.reduce((a, s) => a + s.cases.reduce((b, c) => b + c.screenshots.length, 0), 0);
    console.log(`Regression HTML report written: ${outPath}`);
    console.log(`  Suites: ${suites.length}  Cases: ${totals.c}  Pass: ${totals.p}  Fail: ${totals.f}  Skip: ${totals.s}  Screenshots: ${shotCount}`);
    if (args.openInBrowser) openInBrowser(outPath);
    return;
  }

  // Watch mode: regenerate on an interval until the run completes.
  // Safety valve: stop after a long idle with no status/results so a stray watcher can't run forever.
  // Shared with the reaper CLI so the two can't drift on what "stalled" means.
  const idleLimitMs = DEFAULT_IDLE_LIMIT_MS;
  let opened = false;
  let lastProgressAt = Date.now();
  let lastSignature = "";
  console.log(`[watch] live dashboard, refresh ${args.intervalSec}s — Ctrl+C to stop`);

  for (;;) {
    let result: ReturnType<typeof renderOnce>;
    try {
      result = renderOnce(args, reportsRoot);
    } catch (e) {
      console.error(`[watch] ${(e as Error).message}`);
      await sleep(args.intervalSec * 1000);
      continue;
    }

    if (result.outPath && args.openInBrowser && !opened) {
      openInBrowser(result.outPath);
      opened = true;
    }

    const inProgress = statusIsInProgress(result.status) && result.status?.runId === result.runId;
    const signature = watchProgressSignature({
      runId: result.runId,
      statusLabel: result.status?.status ?? "?",
      suitesWithResults: result.suitesWithResults,
      casesRecorded: result.casesRecorded,
      evaluatedCases: result.evaluatedCases,
    });
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = Date.now();
    }

    if (result.suitesWithResults > 0 && !inProgress) {
      // Not in progress + results present → nothing left to watch. renderOnce already
      // emitted the final static render (live=false → no refresh meta).
      console.log(`[watch] ${result.runId} settled — final report: ${result.outPath}`);
      return;
    }

    if (Date.now() - lastProgressAt > idleLimitMs) {
      const reason = `no progress for ${idleLimitMs / 60000} min (${signature})`;
      console.log(`[watch] ${reason} — stopping.`);
      // The orchestrator writes `completed`; nothing else does. If it died mid-run
      // the status file would stay `in_progress` forever — the watcher could never
      // settle and Step 0's duplicate check would block every future run. This
      // watcher has just proven the silence, so it closes the run out as `stalled`
      // (an observation, never `completed`) rather than leaving the orphan behind.
      if (inProgress) {
        try {
          if (markRunStalled(reportsRoot, result.runId, reason, new Date().toISOString())) {
            console.log(`[watch] ${result.runId} marked "stalled" — a new run is no longer blocked.`);
            renderOnce(args, reportsRoot); // one final static render, refresh meta dropped
          }
        } catch (e) {
          console.error(`[watch] could not mark ${result.runId} stalled: ${(e as Error).message}`);
        }
      }
      return;
    }

    await sleep(args.intervalSec * 1000);
  }
}

// Only run as a CLI — importing this module (unit tests) must not start a render.
const isCli = (() => {
  try {
    return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
