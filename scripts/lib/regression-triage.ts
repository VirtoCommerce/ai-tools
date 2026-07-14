/**
 * Regression-results triage — the DETERMINISTIC core of `/qa-triage-results`.
 * -------------------------------------------------------------------------
 * This is the "collect + dedup + feed-history" mechanics only. It reads a
 * completed regression run, extracts every real FAIL with its failure trace
 * and the failing CSV row, fingerprints each failure, flags cross-run FLAKY
 * oscillation, and (separately) writes correctly-shaped per-suite history rows
 * so the flakiness engine (`scripts/compute-metrics.ts`) actually gets fed.
 *
 * It contains NO classification judgment — deciding whether a FAIL is a real
 * product bug vs a stale assertion vs bad test data is the job of the LLM
 * classifier (`ci/agents/regression-triage-agent.md`), grounded in the oracle
 * knowledge files and a live repro. This split mirrors the repo convention:
 * deterministic formulas live in scripts (compute-metrics.ts, lint-test-cases.ts),
 * judgment lives in the agent prompt.
 *
 * Fingerprint/flaky store: reports/regression/.triage-fingerprints.json
 * (gitignored local working state, like ci/lib/fingerprint-store.ts).
 *
 * CLI:
 *   npx tsx scripts/lib/regression-triage.ts collect <RUN_ID|runDir|latest> [--record]
 *       → prints a JSON triage input packet (failures + traces + CSV rows + flaky flags)
 *   npx tsx scripts/lib/regression-triage.ts history <RUN_ID|runDir|latest> [--env <env>]
 *       → backfills per-suite RunEntry rows into reports/regression/history.json
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";

export const REG_ROOT = join("reports", "regression");
export const TRIAGE_STORE_PATH = join(REG_ROOT, ".triage-fingerprints.json");
export const HISTORY_PATH = join(REG_ROOT, "history.json");
const MANIFEST_PATH = join("config", "test-suites.json");
const HISTORY_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "PENDING" | "UNKNOWN";

/**
 * One non-passing test case (an "issue"), assembled from the run's results +
 * trace + CSV. Covers FAIL, BLOCKED, and SKIPPED — a BLOCKED case has a
 * triage-worthy cause (env down, missing precondition/seed data, or a real bug
 * blocking the flow) and a SKIPPED case can mean a stale/removed feature, so all
 * three are classified. Only PASS and PENDING are excluded.
 */
export interface IssueInput {
  fingerprint: string;
  /** The runner verdict that made this a triage issue: FAIL | BLOCKED | SKIPPED. */
  status: Verdict;
  suiteId: string;
  suiteName: string;
  environment: string;
  caseId: string;
  title: string;
  /** Free-text actual/notes captured by the runner. */
  evidence: string;
  consoleErrors: string[];
  /** Run-dir-relative path to the per-FAIL trace JSON, or null. */
  tracePath: string | null;
  /** Parsed trace (networkFailures + consoleErrors w/ stack frames), or null. */
  trace: TraceJson | null;
  /** Run-dir-relative screenshot paths for this case — the classifier READS these
   * (vision) to tell a renamed/moved control (STALE_TEST) from a broken one (REAL_BUG). */
  screenshots: string[];
  /** Per-browser-lane HAR path (reference only — never inline; the trace's
   * networkFailures[] is the isolated per-failure network slice). */
  harPath: string | null;
  /** The failing test case's authored CSV row (Steps/Assertions/Test_Data/…), or null. */
  csvRow: Record<string, string> | null;
  /** Cross-run flaky flag (seen both PASS and FAIL in history). */
  flaky: boolean;
  /** How many prior runs this fingerprint appeared in (0 = first sighting). */
  priorRuns: number;
}

export interface TraceJson {
  caseId?: string;
  suiteId?: string;
  runId?: string;
  failedAssertion?: string;
  networkFailures?: Array<Record<string, unknown>>;
  consoleErrors?: Array<{ level?: string; message?: string; stack?: string[] }>;
  [k: string]: unknown;
}

/** compute-metrics.ts RunEntry shape — the flakiness engine's expected input. */
export interface RunEntry {
  runId: string;
  date: string;
  suiteId: string;
  suiteName?: string;
  environment?: string;
  browser?: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  duration_minutes?: number;
  bugs_found?: number;
  pass_rate?: number;
  /** Row granularity: "interactive" = case-level counts (REG-* runs); "ci" = coarse
   * 1-unit-per-suite (SDK CI runner). compute-metrics drops "ci" rows from a suite's
   * trend when richer rows exist, so binary CI rows don't create false crossings. */
  mode?: "ci" | "interactive";
}

interface TriageEntry {
  /** Per-CASE identity `env|suiteId|caseId` — signature-independent, so a PASS and
   * a FAIL of the same case land in ONE entry and oscillation is detectable. */
  caseKey: string;
  environment: string;
  suiteId: string;
  caseId: string;
  signature: string; // most recent FAIL signature (reference only)
  firstSeen: string;
  lastSeen: string;
  runs: string[]; // runIds this case appeared in as a FAIL
  outcomes: Record<string, Verdict>; // runId -> PASS|FAIL (both statuses recorded)
}

interface TriageStore {
  version: number;
  updatedAt: string;
  entries: Record<string, TriageEntry>;
}

// v2: outcome store re-keyed from the signature-based fingerprint to a per-case
// key (env|suiteId|caseId). v1 entries keyed by fingerprint never collided a
// case's PASS with its FAIL, so flaky oscillation never fired — drop them.
const STORE_VERSION = 2;

// ---------------------------------------------------------------------------
// Normalization + fingerprinting
// ---------------------------------------------------------------------------

export function normalizeStatus(s: unknown): Verdict {
  const u = String(s ?? "").trim().toUpperCase();
  if (u === "FAIL" || u === "FAILED") return "FAIL";
  if (u === "PASS" || u === "PASSED" || u === "OK") return "PASS";
  if (u === "BLOCKED") return "BLOCKED";
  if (u === "SKIP" || u === "SKIPPED") return "SKIPPED";
  if (u === "PENDING") return "PENDING";
  return "UNKNOWN";
}

/**
 * Collapse a raw assertion / stack frame into a stable signature so data-driven
 * variance (GUIDs, numbers, URLs, quoted values) doesn't perturb the fingerprint.
 */
export function normalizeSignature(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<guid>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/["'`].*?["'`]/g, "<v>")
    .replace(/\s+/g, " ")
    .trim();
}

/** The most-specific failure locus: the failed assertion, else the top stack frame. */
function failureSignatureOf(f: { trace: TraceJson | null; evidence: string }): string {
  const assertion = f.trace?.failedAssertion?.trim();
  if (assertion) return normalizeSignature(assertion);
  const topFrame = f.trace?.consoleErrors?.[0]?.stack?.[0];
  if (topFrame) return normalizeSignature(topFrame);
  const msg = f.trace?.consoleErrors?.[0]?.message;
  if (msg) return normalizeSignature(msg);
  return normalizeSignature(f.evidence).slice(0, 120);
}

/**
 * Stable 12-char fingerprint for a failure within (env, suite, case, locus).
 * Used to DEDUP identical failures (same case failing the same way) — the
 * signature is part of the key on purpose.
 */
export function fingerprintFailure(env: string, suiteId: string, caseId: string, signature: string): string {
  const norm = `${env}|${suiteId}|${caseId}|${signature}`;
  return createHash("md5").update(norm).digest("hex").slice(0, 12);
}

/**
 * Per-CASE identity — deliberately signature-FREE. This is what tracks pass↔fail
 * oscillation across runs: a case's PASS run and its FAIL run must map to the
 * SAME key (they have different failure signatures, so a signature-based key
 * would never collide them and flaky would never fire).
 */
export function caseKeyOf(env: string, suiteId: string, caseId: string): string {
  return `${env}|${suiteId}|${caseId}`;
}

// ---------------------------------------------------------------------------
// Run + manifest resolution
// ---------------------------------------------------------------------------

/** Resolve "latest" | a bare RUN_ID | a full path into an absolute run directory. */
export function resolveRunDir(arg: string): string {
  if (!arg || arg === "latest") {
    const runs = listRunDirs();
    if (!runs.length) throw new Error(`No regression run directories under ${REG_ROOT}/`);
    return runs[0]; // newest first
  }
  if (isAbsolute(arg) && existsSync(arg)) return arg;
  const asPath = existsSync(arg) ? arg : join(REG_ROOT, arg);
  if (!existsSync(asPath)) throw new Error(`Run directory not found: ${asPath}`);
  return asPath;
}

/** Run dirs (REG-, SMOKE-, AREG- prefixes) newest-first by mtime. */
function listRunDirs(): string[] {
  if (!existsSync(REG_ROOT)) return [];
  return readdirSync(REG_ROOT)
    .filter((d) => /^(REG|SMOKE|AREG)-/.test(d))
    .map((d) => join(REG_ROOT, d))
    .filter((p) => existsSync(p) && statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function loadManifestSuite(suiteId: string): { file?: string; name?: string; layer?: string } | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    const suites = m.suites ?? m.testSuites ?? [];
    // Exact id first; else fall back to the id with a trailing browser/variant
    // suffix stripped (a result file's suiteId "072b" maps to manifest id "072").
    const base = suiteId.replace(/[a-z]+$/i, "");
    return suites.find((s: any) => String(s.id) === suiteId) ?? (base !== suiteId ? suites.find((s: any) => String(s.id) === base) : null) ?? null;
  } catch {
    return null;
  }
}

// Parse each suite CSV at most once per process — a run can have hundreds of
// issues spread over a few dozen suites, so re-reading the same CSV per case is
// wasteful. Keyed by the resolved suiteId; null = no CSV / parse failure.
const csvRowCache = new Map<string, Record<string, string>[] | null>();

/** Load the test case's authored CSV row from its suite CSV (best-effort, cached). */
function loadCsvRow(suiteId: string, caseId: string): Record<string, string> | null {
  let rows = csvRowCache.get(suiteId);
  if (rows === undefined) {
    rows = null;
    const suite = loadManifestSuite(suiteId);
    if (suite?.file && existsSync(suite.file)) {
      try {
        rows = parseCsv(readFileSync(suite.file, "utf-8"), { columns: true, skip_empty_lines: true, relax_quotes: true }) as Record<string, string>[];
      } catch {
        rows = null;
      }
    }
    csvRowCache.set(suiteId, rows);
  }
  if (!rows) return null;
  return rows.find((r) => String(r.ID ?? r.id ?? "").trim() === caseId) ?? null;
}

// ---------------------------------------------------------------------------
// Reading a completed run
// ---------------------------------------------------------------------------

interface RawCase {
  id: string;
  title: string;
  status: Verdict;
  evidence: string;
  consoleErrors: string[];
  trace: string | null;
}

interface RawSuite {
  suiteId: string;
  suiteName: string;
  environment: string;
  browser: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  cases: RawCase[];
}

function normalizeSuiteRaw(raw: any): RawSuite {
  const cases: RawCase[] = [];
  const list = Array.isArray(raw.cases) ? raw.cases : Array.isArray(raw.testCases) ? raw.testCases : [];
  for (const c of list) {
    const parts: string[] = [];
    if (c.actual) parts.push(String(c.actual));
    if (c.expected) parts.push(`Expected: ${String(c.expected)}`);
    if (c.notes && !/\.json$/i.test(String(c.notes))) parts.push(`Note: ${String(c.notes)}`);
    if (c.evidence) parts.push(String(c.evidence));
    cases.push({
      id: String(c.id ?? ""),
      title: String(c.title ?? ""),
      status: normalizeStatus(c.verdict ?? c.status),
      evidence: parts.join(" — "),
      consoleErrors: Array.isArray(c.consoleErrors) ? c.consoleErrors.map(String) : [],
      trace: typeof c.trace === "string" && c.trace.trim() ? c.trace : null,
    });
  }
  const tally = { pass: 0, fail: 0, blocked: 0, skipped: 0 };
  for (const c of cases) {
    if (c.status === "PASS") tally.pass++;
    else if (c.status === "FAIL") tally.fail++;
    else if (c.status === "BLOCKED") tally.blocked++;
    else if (c.status === "SKIPPED") tally.skipped++;
  }
  const recorded = tally.pass + tally.fail + tally.blocked + tally.skipped;
  return {
    suiteId: String(raw.suiteId ?? "??"),
    suiteName: String(raw.suiteName ?? ""),
    environment: String(raw.environment ?? process.env.TEST_ENV ?? "vcst"),
    browser: String(raw.browser ?? ""),
    total: Math.max(Number(raw.totalCases ?? 0), recorded),
    passed: recorded > 0 ? tally.pass : Number(raw.passed ?? 0),
    failed: recorded > 0 ? tally.fail : Number(raw.failed ?? 0),
    blocked: recorded > 0 ? tally.blocked : Number(raw.blocked ?? 0),
    skipped: recorded > 0 ? tally.skipped : Number(raw.skipped ?? 0),
    cases,
  };
}

/** Read + de-duplicate the suite result files in a run dir (keep the richest per suite). */
export function readRunSuites(runDir: string): RawSuite[] {
  if (!existsSync(runDir)) return [];
  const files = readdirSync(runDir).filter((f) => /suite-.*results.*\.json$/i.test(f));
  const bySuite = new Map<string, { suite: RawSuite; cases: number; mtime: number }>();
  for (const f of files) {
    const full = join(runDir, f);
    let raw: any;
    try {
      raw = JSON.parse(readFileSync(full, "utf-8"));
    } catch {
      continue;
    }
    const suite = normalizeSuiteRaw(raw);
    const cases = suite.cases.length;
    const mtime = statSync(full).mtimeMs;
    const prev = bySuite.get(suite.suiteId);
    if (!prev || cases > prev.cases || (cases === prev.cases && mtime > prev.mtime)) {
      bySuite.set(suite.suiteId, { suite, cases, mtime });
    }
  }
  return [...bySuite.values()].map((v) => v.suite);
}

/** All run-dir-relative image paths under screenshots/ + evidence/ (recursive-1). */
function collectRunShots(runDir: string): string[] {
  const out: string[] = [];
  for (const sub of ["screenshots", "evidence"]) {
    const dir = join(runDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (/\.(png|jpe?g|webp)$/i.test(f)) out.push(`${sub}/${f}`);
    }
  }
  return out;
}

/** Screenshots for a case = files whose basename contains the case id (deduped). */
function shotsForCase(caseId: string, allShots: string[]): string[] {
  if (!caseId) return [];
  const needle = caseId.toLowerCase();
  return allShots.filter((rel) => (rel.split("/").pop() ?? "").toLowerCase().includes(needle));
}

/** The per-browser-lane HAR path for a suite's browser (reference only). */
function harPathForBrowser(browser: string): string | null {
  const b = (browser || "").toLowerCase();
  const lane = b.includes("firefox") ? "firefox" : b.includes("edge") ? "edge" : b.includes("chrom") ? "chrome" : "";
  if (!lane) return null;
  return join("test-results", lane, "har");
}

function loadTrace(runDir: string, tracePath: string | null): TraceJson | null {
  if (!tracePath) return null;
  // Trace paths may be recorded run-dir-relative or repo-root-relative.
  const candidates = [join(runDir, tracePath), tracePath, join(runDir, "traces", tracePath.split(/[\\/]/).pop() || "")];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Assemble the triage input for a run: every non-passing case (FAIL, BLOCKED,
 * SKIPPED) with its trace, CSV row, fingerprint, and cross-run flaky flag. A
 * BLOCKED case is triaged for WHY it was blocked (env / precondition / data /
 * real bug); a SKIPPED case for whether the feature was removed (stale test).
 * Only PASS and PENDING (not-yet-executed) are excluded.
 */
export function readRunIssues(runDir: string, store?: TriageStore): IssueInput[] {
  const suites = readRunSuites(runDir);
  const allShots = collectRunShots(runDir);
  const out: IssueInput[] = [];
  for (const s of suites) {
    for (const c of s.cases) {
      if (c.status !== "FAIL" && c.status !== "BLOCKED" && c.status !== "SKIPPED") continue;
      const trace = loadTrace(runDir, c.trace);
      const signature = failureSignatureOf({ trace, evidence: c.evidence });
      const fingerprint = fingerprintFailure(s.environment, s.suiteId, c.id, signature); // dedup identical failures
      const entry = store?.entries[caseKeyOf(s.environment, s.suiteId, c.id)]; // per-case oscillation history
      const priorRuns = entry ? entry.runs.length : 0;
      const flaky = entry ? hasOscillated(entry) : false;
      out.push({
        fingerprint,
        status: c.status,
        suiteId: s.suiteId,
        suiteName: s.suiteName,
        environment: s.environment,
        caseId: c.id,
        title: c.title,
        evidence: c.evidence,
        consoleErrors: c.consoleErrors,
        tracePath: c.trace,
        trace,
        screenshots: shotsForCase(c.id, allShots),
        harPath: harPathForBrowser(s.browser),
        csvRow: loadCsvRow(s.suiteId, c.id),
        flaky,
        priorRuns,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batching for triage
// ---------------------------------------------------------------------------

/** A batch of issues from the same suite + status — one classifier call each. */
export interface IssueBatch {
  key: string; // `${suiteId}::${status}#${chunkIndex}`
  suiteId: string;
  suiteName: string;
  status: Verdict;
  count: number;
  issues: IssueInput[];
}

export const DEFAULT_MAX_BATCH = 25;

/**
 * Group issues into classifier batches by (suiteId, status): cases from the same
 * suite that came back the same way usually share a root cause (a whole suite
 * blocked by one env outage, a set of skips from one removed feature), so one
 * classifier call can cover them in shared context instead of N calls. Each
 * group is chunked to at most `maxPerBatch` so a huge group (e.g. 300 BLOCKED)
 * never produces an unbounded prompt. Batches are sorted largest-first. The
 * classifier still emits a per-CASE verdict — batching is about shared context /
 * fewer calls, not forcing one shared class.
 */
export function groupIssues(issues: IssueInput[], maxPerBatch = DEFAULT_MAX_BATCH): IssueBatch[] {
  const byGroup = new Map<string, IssueInput[]>();
  for (const i of issues) {
    const g = `${i.suiteId}::${i.status}`;
    const arr = byGroup.get(g) ?? [];
    arr.push(i);
    byGroup.set(g, arr);
  }
  const batches: IssueBatch[] = [];
  for (const [g, arr] of byGroup) {
    const [suiteId, status] = g.split("::");
    for (let start = 0, chunk = 0; start < arr.length; start += maxPerBatch, chunk++) {
      const slice = arr.slice(start, start + maxPerBatch);
      batches.push({
        key: `${g}#${chunk}`,
        suiteId,
        suiteName: slice[0]?.suiteName ?? "",
        status: status as Verdict,
        count: slice.length,
        issues: slice,
      });
    }
  }
  return batches.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Fingerprint / flaky store
// ---------------------------------------------------------------------------

export function loadTriageStore(path = TRIAGE_STORE_PATH): TriageStore {
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as TriageStore;
      // Drop a stale-schema store (e.g. v1 keyed by fingerprint) — its keys no
      // longer match caseKeyOf(), so it would never resolve again.
      if (parsed && parsed.entries && (parsed.version ?? 1) === STORE_VERSION) return parsed;
    } catch {
      /* corrupt — start fresh */
    }
  }
  return { version: STORE_VERSION, updatedAt: new Date().toISOString(), entries: {} };
}

export function saveTriageStore(store: TriageStore, path = TRIAGE_STORE_PATH): void {
  store.version = STORE_VERSION;
  store.updatedAt = new Date().toISOString();
  mkdirSync(REG_ROOT, { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

/** A fingerprint is flaky when it has been observed both PASSing and FAILing. */
function hasOscillated(entry: TriageEntry): boolean {
  const vals = Object.values(entry.outcomes);
  return vals.includes("PASS") && vals.includes("FAIL");
}

/**
 * Record this run's per-case outcomes (both PASS and FAIL) into the store so the
 * next run's readRunIssues can flag flaky oscillation. Call AFTER readRunIssues
 * (which reads the *previous* state).
 */
export function recordRunOutcomes(store: TriageStore, runDir: string, runId: string): void {
  const now = new Date().toISOString();
  const suites = readRunSuites(runDir);
  for (const s of suites) {
    for (const c of s.cases) {
      const status = c.status;
      if (status !== "PASS" && status !== "FAIL") continue;
      const key = caseKeyOf(s.environment, s.suiteId, c.id);
      const existing = store.entries[key];
      // Signature is reference-only, captured from a FAIL (a PASS has no trace).
      const failSignature =
        status === "FAIL"
          ? failureSignatureOf({ trace: loadTrace(runDir, c.trace), evidence: c.evidence })
          : existing?.signature ?? "";
      if (!existing) {
        store.entries[key] = {
          caseKey: key,
          environment: s.environment,
          suiteId: s.suiteId,
          caseId: c.id,
          signature: failSignature,
          firstSeen: now,
          lastSeen: now,
          runs: status === "FAIL" ? [runId] : [],
          outcomes: { [runId]: status },
        };
      } else {
        existing.lastSeen = now;
        existing.outcomes[runId] = status;
        if (status === "FAIL") {
          existing.signature = failSignature;
          if (!existing.runs.includes(runId)) existing.runs.push(runId);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// History feed (the flakiness-feed fix)
// ---------------------------------------------------------------------------

/** Extract YYYY-MM-DD from a RUN_ID like REG-2026-07-14-0018 / SMOKE-2026-07-06-1845. */
function dateFromRunId(runId: string): string | null {
  const m = runId.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function loadHistory(): RunEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
    // Legacy shape was one entry per RUN (no top-level suiteId). Keep only the
    // per-suite RunEntry rows compute-metrics.ts understands; drop legacy rows.
    return Array.isArray(parsed) ? parsed.filter((e: any) => e && typeof e.suiteId === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Merge per-suite RunEntry rows into history.json — the exact shape
 * compute-metrics.ts trends()/flaky detection expects. Idempotent per
 * (runId, suiteId); drops legacy run-level rows; prunes to the 90-day window.
 * Shared by the triage flow (accurate case-level rows) and ci/run-regression.ts
 * (coarse suite-level rows).
 */
export function mergeHistoryRows(rows: RunEntry[]): number {
  let history = loadHistory();
  const dropped = new Set(rows.map((r) => `${r.runId}::${r.suiteId}`));
  history = history.filter((e) => !dropped.has(`${e.runId}::${e.suiteId}`));
  history.push(...rows);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  history = history.filter((e) => e.date >= cutoffStr);

  mkdirSync(REG_ROOT, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
  return rows.length;
}

/**
 * Append ONE per-suite RunEntry per suite in this run to history.json, derived
 * from the run's suite-*-results.json (accurate case-level counts). Idempotent
 * per (runId, suiteId).
 */
export function appendSuiteHistory(runId: string, env: string, runDir: string): number {
  const suites = readRunSuites(runDir);
  // Date from the run id (REG-YYYY-MM-DD-HHMM) so trend ordering is chronological;
  // fall back to the run dir mtime, then today.
  const date = dateFromRunId(runId) ?? new Date(statSync(runDir).mtimeMs).toISOString().slice(0, 10);
  const rows: RunEntry[] = suites.map((s) => {
    const executed = s.passed + s.failed;
    return {
      runId,
      date,
      suiteId: s.suiteId,
      suiteName: s.suiteName || undefined,
      environment: env || s.environment,
      browser: s.browser || undefined,
      total: s.total,
      passed: s.passed,
      failed: s.failed,
      blocked: s.blocked,
      skipped: s.skipped,
      pass_rate: executed ? Math.round((s.passed / executed) * 10000) / 100 : 0,
      mode: "interactive",
    };
  });
  return mergeHistoryRows(rows);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
  const [cmd, runArg, ...rest] = process.argv.slice(2);
  if (!cmd || (cmd !== "collect" && cmd !== "history")) {
    console.error("Usage:\n  regression-triage.ts collect <RUN_ID|latest> [--record]\n  regression-triage.ts history <RUN_ID|latest> [--env <env>]");
    process.exit(2);
  }
  const runDir = resolveRunDir(runArg);
  const runId = runDir.split(/[\\/]/).pop() || runArg;

  if (cmd === "collect") {
    const store = loadTriageStore();
    const issues = readRunIssues(runDir, store);
    if (rest.includes("--record")) {
      recordRunOutcomes(store, runDir, runId);
      saveTriageStore(store);
    }
    const maxIdx = rest.indexOf("--max-batch");
    const maxPerBatch = maxIdx !== -1 ? Math.max(1, Number(rest[maxIdx + 1]) || DEFAULT_MAX_BATCH) : DEFAULT_MAX_BATCH;
    const batches = groupIssues(issues, maxPerBatch);
    const packet = {
      runId,
      runDir,
      environment: issues[0]?.environment ?? process.env.TEST_ENV ?? "vcst",
      issueCount: issues.length,
      byStatus: {
        FAIL: issues.filter((i) => i.status === "FAIL").length,
        BLOCKED: issues.filter((i) => i.status === "BLOCKED").length,
        SKIPPED: issues.filter((i) => i.status === "SKIPPED").length,
      },
      flakyCount: issues.filter((i) => i.flaky).length,
      // Issues are nested inside batches (each issue appears once) — one classifier
      // call per batch. Grouped by (suiteId, status), largest first, chunked to
      // maxPerBatch. Flatten batches[].issues if you need the flat list.
      batchCount: batches.length,
      maxPerBatch,
      batches,
    };
    console.log(JSON.stringify(packet, null, 2));
    return;
  }

  // history
  const envIdx = rest.indexOf("--env");
  const env = envIdx !== -1 ? rest[envIdx + 1] : process.env.TEST_ENV ?? "vcst";
  const n = appendSuiteHistory(runId, env, runDir);
  console.log(`History updated: ${HISTORY_PATH} (+${n} per-suite rows for ${runId})`);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
