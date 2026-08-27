/**
 * Deterministic `Draft → Automated` promoter, driven by a completed regression run.
 *
 * THE GAP THIS CLOSES. The promotion rule was written down in three places
 * (`/qa-test` 5g, `/qa-test-lifecycle` 6P, `test-case-template.md` §Automation_Status) and
 * performed by hand: an agent re-read a run report, decided which cases "ran green", and
 * edited the `Automation_Status` cell. Nothing verified that decision against the run's own
 * evidence, so a case could be promoted on a PASS it never earned — and once at `Automated`
 * a case is regression-eligible forever, which makes a wrong promotion permanent coverage
 * built on a verdict nobody can re-derive. `suites:lint` only ever checked the VOCABULARY
 * (S-006): `Automated` was a legal word, never a justified one.
 *
 * So this script derives the flip from the artefacts instead of trusting a narrative: the
 * run's canonical `suite-*-results.json` says PASS, the lane says it actually executed, the
 * fingerprint store says it has never oscillated, and the linter — run against the row AS IT
 * WOULD BE AFTER the flip — says its assertions are grounded.
 *
 * FAIL-CLOSED, IN ONE DIRECTION ONLY. Every doubt leaves the case at `Draft`, which is the
 * status quo: a missed promotion costs one more run, a wrong one puts an ungrounded case into
 * permanent coverage. Nothing here ever demotes, never touches a row that is not exactly
 * `Draft`, and never invents a verdict for a case the run did not report.
 *
 * WHY THE ROW IS LINTED AT ITS TARGET STATUS, NOT ITS CURRENT ONE. `lint-test-cases.ts`
 * GRD-001 escalates a `{HYPOTHESIS}` assertion to Blocker only in a PROMOTED (past-`Draft`)
 * case — that IS the rule "a hypothesis may not survive promotion", and asking it of the row
 * as it stands (`Draft`) would always answer yes. We therefore lint the row with
 * `Automation_Status` already set to the target, reusing the ONE declared rule instead of
 * restating it here. Two copies of a gate is how two enforcers come to disagree.
 *
 * WHY THE CSV IS EDITED SURGICALLY, NOT REWRITTEN. Re-serialising a whole suite would
 * renormalise the quoting of every untouched row (an unreviewable diff), and several suites
 * carry inner-quote irregularities that a strict re-write mangles. Instead each edited record
 * is located by its own raw source text and only the bytes of the changed FIELDS are
 * replaced; every other byte in the file is preserved. The result is then re-parsed and
 * compared field-by-field against the original — a row that differs anywhere it was not meant
 * to aborts the whole write.
 *
 * Usage:
 *   npx tsx scripts/test-cases/promote-cases.ts [RUN_ID|latest] [options]
 *
 *     --apply                write the CSVs (default is a dry run that writes nothing)
 *     --suite <ID>           restrict to one suite (repeatable)
 *     --min-green-runs <N>   require N trailing green runs in the fingerprint store (default 1)
 *     --stamp <label>        References stamp label (default: the RUN_ID)
 *     --no-stamp             do not touch References
 *     --strict-mtime         refuse a suite whose CSV changed after the run finished
 *     --allow-incomplete     promote from a run that is not `completed`
 *     --json                 machine-readable report on stdout
 *
 * Exit 0 = at least one case promotable (dry run) or promoted; 1 = run usable but nothing
 * promotable; 2 = refused (run unusable / a suite unreadable / a write verification failed).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import {
  COLUMNS,
  describeHeaderMismatch,
  isCanonicalHeader,
  type Row,
} from "./append-test-cases-to-suite.js";
import { lintRow, type Finding } from "./lint-test-cases.js";
import {
  REG_ROOT,
  loadTriageStore,
  readRunSuites,
  resolveRunDir,
  type TriageStore,
} from "../lib/regression-triage.js";

const MANIFEST_PATH = join("config", "test-suites.json");

/** The only status this promoter writes. Everything else stays a human/skill decision. */
export const PROMOTION_TARGET = "Automated";
/** The only status it reads from. Never a demotion, never a re-promotion. */
export const PROMOTION_SOURCE = "Draft";

/**
 * Lanes whose PASS proves "an agent can run this unattended" — the definition of `Automated`
 * in `test-case-template.md` §Automation_Status ("Reviewed + MCP-executable by an agent").
 * The browser lane counts: it is an LLM agent driving Playwright MCP, not a human. `manual`
 * and `deprecated` never execute, so a PASS on either is INCOHERENT evidence rather than weak
 * evidence — refused, not discounted.
 */
export const EXECUTING_LANES = new Set(["machine", "browser"]);

/** Closed reason vocabulary. A refusal must be attributable, not narrated. */
export const REASONS = {
  PR002_ABSENT_FROM_RUN: "PR-002 case absent from the run",
  PR003_NOT_PASS: "PR-003 run verdict is not PASS",
  PR004_NON_EXECUTING_LANE: "PR-004 lane never executed the case",
  PR005_FLAKY: "PR-005 flaky — has oscillated PASS/FAIL",
  PR006_TOO_FEW_GREEN: "PR-006 fewer trailing green runs than required",
  PR007_UNGROUNDED: "PR-007 GRD-001 at the target status — assertions not grounded",
  PR008_BLOCKING_FINDING: "PR-008 blocking lint finding at the target status",
  PR009_AMBIGUOUS_EVIDENCE: "PR-009 the run reports this id more than once",
  PR010_ROW_UNPARSABLE: "PR-010 row is not a parsable 15-field record",
  PR011_HEADER_NOT_CANONICAL: "PR-011 suite header is not the canonical 15 columns",
  PR012_SUITE_UNPARSABLE: "PR-012 suite CSV does not field-parse",
  PR013_RUN_NOT_COMPLETED: "PR-013 run is not completed",
  PR014_CSV_NEWER_THAN_RUN: "PR-014 suite CSV changed after the run finished",
} as const;

// ---------------------------------------------------------------------------
// Raw-record field surgery
// ---------------------------------------------------------------------------

/**
 * Byte spans of every field in ONE raw CSV record (record delimiter already stripped).
 *
 * Deliberately a scanner and not a second parser: its ONLY job is to say where csv-parse's
 * fields live in the source text, and `spansAgreeWith` proves that claim against csv-parse's
 * own output before a single byte is replaced. A disagreement refuses the row.
 */
export function fieldSpans(body: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const n = body.length;
  let i = 0;
  for (;;) {
    const start = i;
    if (body[i] === '"') {
      i++;
      while (i < n) {
        if (body[i] === '"') {
          if (body[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      while (i < n && body[i] !== ",") i++;
    } else {
      while (i < n && body[i] !== ",") i++;
    }
    spans.push([start, i]);
    if (i >= n) break;
    i++; // the separator
    if (i >= n) {
      spans.push([i, i]); // a record ending in a comma has a trailing empty field
      break;
    }
  }
  return spans;
}

/** Undo CSV quoting for one raw field slice. */
function unquoteField(slice: string): string {
  if (slice.length >= 2 && slice.startsWith('"') && slice.endsWith('"')) {
    return slice.slice(1, -1).replace(/""/g, '"');
  }
  return slice;
}

/** Quote one value exactly the way the repo's single CSV writer does. */
export function quoteField(value: string): string {
  return stringifyCsv([[value]]).replace(/\r?\n$/, "");
}

/** Do the scanner's spans reproduce csv-parse's fields exactly? */
export function spansAgreeWith(body: string, fields: readonly string[]): boolean {
  const spans = fieldSpans(body);
  if (spans.length !== fields.length) return false;
  for (let k = 0; k < spans.length; k++) {
    if (unquoteField(body.slice(spans[k][0], spans[k][1])) !== fields[k]) return false;
  }
  return true;
}

/** Replace whole fields inside one raw record, preserving every other byte. */
export function replaceFields(
  raw: string,
  fields: readonly string[],
  edits: ReadonlyMap<number, string>,
): string | null {
  // csv-parse hands back the record delimiter it consumed, and NOT uniformly: an LF file
  // yields a trailing "\n" while a CRLF file yields a trailing "\r". Matching only one of
  // them left the other inside the last field, so `spansAgreeWith` refused every edit in an
  // LF suite — fail-closed, so nothing was corrupted, but nothing was promotable either.
  // Strip whichever delimiter is present and put it back verbatim.
  const eol = /(\r\n|\n|\r)$/.exec(raw)?.[1] ?? "";
  const body = eol ? raw.slice(0, -eol.length) : raw;
  if (!spansAgreeWith(body, fields)) return null;
  const spans = fieldSpans(body);
  let out = "";
  let cursor = 0;
  for (const k of [...edits.keys()].sort((a, b) => a - b)) {
    if (k < 0 || k >= spans.length) return null;
    out += body.slice(cursor, spans[k][0]) + quoteField(edits.get(k)!);
    cursor = spans[k][1];
  }
  return out + body.slice(cursor) + eol;
}

// ---------------------------------------------------------------------------
// Whole-file edit + round-trip verification
// ---------------------------------------------------------------------------

/** Column name → new value, for one case row. */
export type CellEdit = Record<string, string>;

export interface ApplyResult {
  text: string;
  applied: string[];
  errors: string[];
}

interface RawRecord {
  raw: string;
  record: string[];
}

function parseRaw(text: string): RawRecord[] {
  return parseCsv(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    raw: true,
  }) as unknown as RawRecord[];
}

/**
 * Apply per-case cell edits to a suite CSV, byte-preserving everywhere else, then re-parse
 * and prove nothing but the intended cells moved. A non-empty `errors` means DO NOT WRITE —
 * and `text` is returned unchanged, so a caller that ignores `errors` still cannot corrupt
 * the file.
 */
export function applyCellEdits(text: string, edits: ReadonlyMap<string, CellEdit>): ApplyResult {
  const errors: string[] = [];
  const applied: string[] = [];
  if (!isCanonicalHeader(text)) {
    return { text, applied, errors: [describeHeaderMismatch(text) ?? "non-canonical header"] };
  }
  let records: RawRecord[];
  try {
    records = parseRaw(text);
  } catch (e) {
    return { text, applied, errors: [`CSV does not parse: ${(e as Error).message}`] };
  }

  let out = text;
  let cursor = 0;
  for (let r = 1; r < records.length; r++) {
    const { raw, record } = records[r];
    const at = out.indexOf(raw, cursor);
    if (at < 0) {
      errors.push(`record ${r + 1} (${record[0] ?? "?"}) not locatable in the source text`);
      continue;
    }
    const edit = edits.get(record[0]);
    if (!edit) {
      cursor = at + raw.length;
      continue;
    }
    if (record.length !== COLUMNS.length) {
      errors.push(`${record[0]}: ${record.length} field(s), expected ${COLUMNS.length}`);
      cursor = at + raw.length;
      continue;
    }
    const byIndex = new Map<number, string>();
    for (const [column, value] of Object.entries(edit)) {
      const k = (COLUMNS as readonly string[]).indexOf(column);
      if (k < 0) {
        errors.push(`${record[0]}: unknown column "${column}"`);
        continue;
      }
      byIndex.set(k, value);
    }
    const rewritten = replaceFields(raw, record, byIndex);
    if (rewritten === null) {
      errors.push(`${record[0]}: field boundaries could not be resolved — row left untouched`);
      cursor = at + raw.length;
      continue;
    }
    out = out.slice(0, at) + rewritten + out.slice(at + raw.length);
    cursor = at + rewritten.length;
    applied.push(record[0]);
  }
  if (errors.length) return { text, applied: [], errors };

  // Round trip: the ONLY differences may be the cells we asked for.
  const before = parseRaw(text).map((r) => r.record);
  let after: string[][];
  try {
    after = parseRaw(out).map((r) => r.record);
  } catch (e) {
    return { text, applied: [], errors: [`rewritten CSV no longer parses: ${(e as Error).message}`] };
  }
  if (before.length !== after.length) {
    return { text, applied: [], errors: [`record count changed: ${before.length} → ${after.length}`] };
  }
  for (let r = 0; r < before.length; r++) {
    const edit = r === 0 ? undefined : edits.get(before[r][0]);
    for (let k = 0; k < Math.max(before[r].length, after[r].length); k++) {
      const want = edit?.[COLUMNS[k] as string] ?? before[r][k];
      if (after[r][k] !== want) {
        return {
          text,
          applied: [],
          errors: [
            `verification failed at record ${r + 1} field ${k + 1} (${before[r][0]}): ` +
              `expected ${JSON.stringify(want)}, got ${JSON.stringify(after[r][k])}`,
          ],
        };
      }
    }
  }
  return { text: out, applied, errors: [] };
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export interface RunCase {
  status: string;
  lane?: string;
}

export interface SuitePlanInput {
  suiteId: string;
  file: string;
  rawText: string;
  /** Canonical run verdicts for this suite, by case id. */
  runCases: ReadonlyMap<string, RunCase>;
  /** Ids the run reported more than once — ambiguous evidence, never promoted. */
  ambiguousIds: ReadonlySet<string>;
  isFlaky(caseId: string): boolean;
  greenRuns(caseId: string): number;
  minGreenRuns: number;
  csvNewerThanRun: boolean;
  /** Makes PR-014 fatal for this suite rather than a warning. */
  strictMtime: boolean;
}

export interface CaseDecision {
  suiteId: string;
  file: string;
  caseId: string;
  from: string;
  to: string | null;
  promote: boolean;
  lane?: string;
  runStatus?: string;
  reasons: string[];
}

export interface SuiteDecision {
  suiteId: string;
  file: string;
  /** Set when the whole file is refused; `cases` is then empty. */
  refusal: string | null;
  warnings: string[];
  cases: CaseDecision[];
}

const BLOCKING_SEVERITIES = new Set(["Blocker", "Critical"]);

/** Would this row be legal at the target status? Re-derives G10 from the CSV itself. */
export function groundingReasons(row: Row, target: string): string[] {
  const findings: Finding[] = lintRow({ ...row, Automation_Status: target }, 0, new Map());
  const reasons: string[] = [];
  const grd = findings.filter(
    (f) => f.rule === "GRD-001" && (f.severity === "Blocker" || f.severity === "High"),
  );
  if (grd.length) reasons.push(`${REASONS.PR007_UNGROUNDED}: ${grd[0].message}`);
  const blocking = findings.filter(
    (f) => f.rule !== "GRD-001" && BLOCKING_SEVERITIES.has(f.severity),
  );
  if (blocking.length)
    reasons.push(`${REASONS.PR008_BLOCKING_FINDING}: ${blocking[0].rule} ${blocking[0].message}`);
  return reasons;
}

export function planSuite(input: SuitePlanInput): SuiteDecision {
  const out: SuiteDecision = {
    suiteId: input.suiteId,
    file: input.file,
    refusal: null,
    warnings: [],
    cases: [],
  };
  if (!isCanonicalHeader(input.rawText)) {
    out.refusal = REASONS.PR011_HEADER_NOT_CANONICAL;
    return out;
  }
  if (input.csvNewerThanRun) {
    if (input.strictMtime) {
      out.refusal = REASONS.PR014_CSV_NEWER_THAN_RUN;
      return out;
    }
    out.warnings.push(REASONS.PR014_CSV_NEWER_THAN_RUN);
  }
  let records: RawRecord[];
  try {
    records = parseRaw(input.rawText);
  } catch (e) {
    out.refusal = `${REASONS.PR012_SUITE_UNPARSABLE}: ${(e as Error).message}`;
    return out;
  }

  for (let r = 1; r < records.length; r++) {
    const fields = records[r].record;
    const caseId = fields[0] ?? "";
    if (!caseId) continue;
    const row = Object.fromEntries(COLUMNS.map((c, k) => [c, fields[k] ?? ""])) as Row;
    // Anything not exactly `Draft` is out of SCOPE, not held back: reporting it as a refusal
    // would bury the handful of real decisions under thousands of rows nobody asked about.
    if (row.Automation_Status.trim() !== PROMOTION_SOURCE) continue;

    const decision: CaseDecision = {
      suiteId: input.suiteId,
      file: input.file,
      caseId,
      from: row.Automation_Status.trim(),
      to: null,
      promote: false,
      reasons: [],
    };
    out.cases.push(decision);

    if (fields.length !== COLUMNS.length) {
      decision.reasons.push(`${REASONS.PR010_ROW_UNPARSABLE}: ${fields.length} field(s)`);
      continue;
    }
    if (input.ambiguousIds.has(caseId)) {
      decision.reasons.push(REASONS.PR009_AMBIGUOUS_EVIDENCE);
      continue;
    }
    const ran = input.runCases.get(caseId);
    if (!ran) {
      decision.reasons.push(REASONS.PR002_ABSENT_FROM_RUN);
      continue;
    }
    decision.runStatus = ran.status;
    decision.lane = ran.lane;
    if (ran.status !== "PASS") {
      decision.reasons.push(`${REASONS.PR003_NOT_PASS}: ${ran.status}`);
      continue;
    }
    if (ran.lane && !EXECUTING_LANES.has(ran.lane)) {
      decision.reasons.push(`${REASONS.PR004_NON_EXECUTING_LANE}: ${ran.lane}`);
      continue;
    }
    if (input.isFlaky(caseId)) {
      decision.reasons.push(REASONS.PR005_FLAKY);
      continue;
    }
    const green = input.greenRuns(caseId);
    if (green < input.minGreenRuns) {
      decision.reasons.push(`${REASONS.PR006_TOO_FEW_GREEN}: ${green}/${input.minGreenRuns}`);
      continue;
    }
    const ungrounded = groundingReasons(row, PROMOTION_TARGET);
    if (ungrounded.length) {
      decision.reasons.push(...ungrounded);
      continue;
    }
    decision.to = PROMOTION_TARGET;
    decision.promote = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// References stamp
// ---------------------------------------------------------------------------

/**
 * Append `Promoted: <label> (<date>)`, never clobbering the sibling `Synced:` / `Audited:`
 * stamps the same free-text cell already carries.
 */
export function stampReferences(references: string, label: string, date: string): string {
  const stamp = `Promoted: ${label} (${date})`;
  if (references.includes(stamp)) return references;
  const trimmed = references.trim();
  return trimmed ? `${trimmed} | ${stamp}` : stamp;
}

// ---------------------------------------------------------------------------
// Run evidence
// ---------------------------------------------------------------------------

export interface RunEvidence {
  runId: string;
  runDir: string;
  completed: boolean;
  finishedAtMs: number | null;
  suites: Map<string, { runCases: Map<string, RunCase>; ambiguousIds: Set<string> }>;
}

/** Verdicts + lanes for every suite in the run, keyed by suite id. */
export function readRunEvidence(runDir: string): RunEvidence {
  const runId = runDir.split(/[\\/]/).filter(Boolean).pop() ?? runDir;
  const runSuites = readRunSuites(runDir);
  const suites = new Map<string, { runCases: Map<string, RunCase>; ambiguousIds: Set<string> }>();
  for (const suite of runSuites) {
    const runCases = new Map<string, RunCase>();
    const ambiguousIds = new Set<string>();
    for (const c of suite.cases) {
      if (!c.id) continue;
      if (runCases.has(c.id)) {
        // Two verdicts for one id: the lane split leaked, or two suites share the id. Either
        // way the evidence no longer identifies a single case — refuse it.
        ambiguousIds.add(c.id);
        continue;
      }
      runCases.set(c.id, { status: c.status, lane: c.lane });
    }
    suites.set(suite.suiteId, { runCases, ambiguousIds });
  }

  let completed = false;
  let finishedAtMs: number | null = null;
  // The status file lives at REG_ROOT and describes only the LATEST run, so it is authority
  // for THIS run only when it names it. Otherwise fall back to the suite envelopes, each of
  // which is written by the lane that owns it.
  const statusPath = join(REG_ROOT, "test-run-status.json");
  if (existsSync(statusPath)) {
    try {
      const st = JSON.parse(readFileSync(statusPath, "utf-8"));
      if (String(st.runId) === runId) {
        completed = st.status === "completed";
        const t = Date.parse(String(st.finishedAt ?? ""));
        if (Number.isFinite(t)) finishedAtMs = t;
      }
    } catch {
      /* unreadable — fall through to the envelopes */
    }
  }
  if (finishedAtMs === null || !completed) {
    let latest = 0;
    let allClosed = runSuites.length > 0;
    for (const suite of runSuites) {
      const t = Date.parse(String(suite.completedAt ?? ""));
      if (Number.isFinite(t)) latest = Math.max(latest, t);
      else allClosed = false;
    }
    if (finishedAtMs === null && latest) finishedAtMs = latest;
    if (!completed) completed = allClosed;
  }
  return { runId, runDir, completed, finishedAtMs, suites };
}

// ---------------------------------------------------------------------------
// Flakiness, read from the fingerprint store the triage flow already maintains
// ---------------------------------------------------------------------------

export interface Flakiness {
  isFlaky(suiteId: string, caseId: string): boolean;
  greenRuns(suiteId: string, caseId: string): number;
}

/**
 * Chronological sort key for a RUN_ID. `REG-`, `SMOKE-` and `AREG-` runs share one store, so
 * sorting the raw ids would order them by PREFIX and interleave three timelines — the trailing
 * streak would then be computed over a sequence that never happened. The embedded
 * `YYYY-MM-DD[-HHMM]` is the only ordering the ids actually carry.
 */
export function runOrderKey(runId: string): string {
  return /(\d{4}-\d{2}-\d{2}(?:-\d{4})?)/.exec(runId)?.[1] ?? runId;
}

/**
 * A case is flaky when the store has seen it both PASS and FAIL — the same definition
 * `regression-triage.ts` uses, read off the same store, so the two can never disagree about
 * which cases are trustworthy.
 *
 * ENVIRONMENTS ARE DELIBERATELY NOT SEPARATED. The store keys by (env, suite, case); this
 * folds them together, so a case that is green on `vcst` and red on `vcptcore` counts as
 * flaky. That is the intended reading: `Automated` is a claim about the CASE, and one that
 * holds on a single environment is exactly the kind that later reads as a product failure.
 *
 * `currentRunId` is the run being promoted from, and its verdict is injected as PASS.
 * `planSuite` only ever asks about a case it has ALREADY confirmed PASS in the canonical
 * results file, and that file outranks the store — which is populated by a separate
 * `triage:collect --record` that may not have run yet. Without this injection the default
 * `--min-green-runs 1` held every case in an unrecorded run: a green run counted as zero
 * green runs (observed on REG-2026-08-26-1631 / SR-GQL-056).
 */
export function flakinessFrom(store: TriageStore, currentRunId?: string): Flakiness {
  const byCase = new Map<string, Map<string, string>>();
  for (const entry of Object.values(store.entries ?? {})) {
    const key = `${entry.suiteId} ${entry.caseId}`;
    let outcomes = byCase.get(key);
    if (!outcomes) byCase.set(key, (outcomes = new Map()));
    for (const [runId, verdict] of Object.entries(entry.outcomes ?? {})) {
      outcomes.set(runId, String(verdict));
    }
  }
  const outcomesFor = (key: string, assumeCurrentPass: boolean): string[] => {
    const merged = new Map(byCase.get(key) ?? []);
    if (assumeCurrentPass && currentRunId) merged.set(currentRunId, "PASS");
    return [...merged.entries()]
      .sort((a, b) => {
        const ka = runOrderKey(a[0]);
        const kb = runOrderKey(b[0]);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      })
      .map(([, v]) => v);
  };
  return {
    isFlaky: (suiteId, caseId) => {
      const seen = outcomesFor(`${suiteId} ${caseId}`, false);
      return seen.includes("PASS") && seen.includes("FAIL");
    },
    greenRuns: (suiteId, caseId) => {
      const seen = outcomesFor(`${suiteId} ${caseId}`, true);
      let n = 0;
      for (let i = seen.length - 1; i >= 0 && seen[i] === "PASS"; i--) n++;
      return n;
    },
  };
}

// ---------------------------------------------------------------------------
// Manifest lookup
// ---------------------------------------------------------------------------

function manifestFiles(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(MANIFEST_PATH)) return out;
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const s of m.suites ?? m.testSuites ?? []) {
      if (s && typeof s.id === "string" && typeof s.file === "string") out.set(s.id, s.file);
    }
  } catch {
    /* a broken manifest is suites:lint's finding, not this script's */
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  runArg: string;
  apply: boolean;
  suites: Set<string>;
  minGreenRuns: number;
  stamp: string | null;
  noStamp: boolean;
  strictMtime: boolean;
  allowIncomplete: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): Options {
  const o: Options = {
    runArg: "latest",
    apply: false,
    suites: new Set(),
    minGreenRuns: 1,
    stamp: null,
    noStamp: false,
    strictMtime: false,
    allowIncomplete: false,
    json: false,
  };
  let positional = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-stamp") o.noStamp = true;
    else if (a === "--strict-mtime") o.strictMtime = true;
    else if (a === "--allow-incomplete") o.allowIncomplete = true;
    else if (a === "--suite") o.suites.add(argv[++i]);
    else if (a === "--stamp") o.stamp = argv[++i];
    else if (a === "--min-green-runs") o.minGreenRuns = Math.max(1, Number(argv[++i]) || 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else if (positional++ === 0) o.runArg = a;
  }
  return o;
}

function main(): void {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[tc:promote] ${(e as Error).message}`);
    return process.exit(2);
  }

  let runDir: string;
  try {
    runDir = resolveRunDir(opts.runArg);
  } catch (e) {
    console.error(`[tc:promote] ${(e as Error).message}`);
    return process.exit(2);
  }
  const evidence = readRunEvidence(runDir);
  if (!evidence.completed && !opts.allowIncomplete) {
    console.error(
      `[tc:promote] REFUSED — ${REASONS.PR013_RUN_NOT_COMPLETED} (${evidence.runId}).\n` +
        `  A run still in flight has not decided its own verdicts. Re-run once it closes, or\n` +
        `  pass --allow-incomplete if you know why this one will never close.`,
    );
    return process.exit(2);
  }

  const files = manifestFiles();
  const flakiness = flakinessFrom(loadTriageStore(), evidence.runId);
  const label = opts.stamp ?? evidence.runId;
  const date = new Date().toISOString().slice(0, 10);

  const decisions: SuiteDecision[] = [];
  let refusals = 0;
  for (const [suiteId, run] of evidence.suites) {
    if (opts.suites.size && !opts.suites.has(suiteId)) continue;
    const file = files.get(suiteId);
    if (!file || !existsSync(file)) {
      decisions.push({
        suiteId,
        file: file ?? "<unmapped>",
        refusal: `suite ${suiteId} has no readable CSV in ${MANIFEST_PATH}`,
        warnings: [],
        cases: [],
      });
      refusals++;
      continue;
    }
    const rawText = readFileSync(file, "utf-8");
    const csvNewerThanRun =
      evidence.finishedAtMs !== null && statSync(file).mtimeMs > evidence.finishedAtMs;
    const decision = planSuite({
      suiteId,
      file,
      rawText,
      runCases: run.runCases,
      ambiguousIds: run.ambiguousIds,
      isFlaky: (id) => flakiness.isFlaky(suiteId, id),
      greenRuns: (id) => flakiness.greenRuns(suiteId, id),
      minGreenRuns: opts.minGreenRuns,
      csvNewerThanRun,
      strictMtime: opts.strictMtime,
    });
    if (decision.refusal) refusals++;
    decisions.push(decision);
  }

  const written: string[] = [];
  const writeErrors: string[] = [];
  if (opts.apply) {
    for (const d of decisions) {
      const promotable = d.cases.filter((c) => c.promote);
      if (!promotable.length) continue;
      const text = readFileSync(d.file, "utf-8");
      const byId = new Map(
        parseRaw(text)
          .slice(1)
          .map((r) => [r.record[0], r.record] as const),
      );
      const edits = new Map<string, CellEdit>();
      for (const c of promotable) {
        const edit: CellEdit = { Automation_Status: PROMOTION_TARGET };
        if (!opts.noStamp) {
          const refs = byId.get(c.caseId)?.[COLUMNS.indexOf("References")] ?? "";
          edit.References = stampReferences(refs, label, date);
        }
        edits.set(c.caseId, edit);
      }
      const result = applyCellEdits(text, edits);
      if (result.errors.length) {
        writeErrors.push(`${d.file}: ${result.errors.join("; ")}`);
        for (const c of promotable) {
          c.promote = false;
          c.to = null;
          c.reasons.push("write verification failed — nothing written for this suite");
        }
        continue;
      }
      writeFileSync(d.file, result.text, "utf-8");
      written.push(`${d.file} (${result.applied.length})`);
    }
  }

  const all = decisions.flatMap((d) => d.cases);
  const promoted = all.filter((c) => c.promote);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          runId: evidence.runId,
          apply: opts.apply,
          target: PROMOTION_TARGET,
          minGreenRuns: opts.minGreenRuns,
          stamp: opts.noStamp ? null : `Promoted: ${label} (${date})`,
          counts: {
            draftConsidered: all.length,
            promoted: promoted.length,
            held: all.length - promoted.length,
            suiteRefusals: refusals,
          },
          suites: decisions,
          written,
          writeErrors,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`[tc:promote] run ${evidence.runId} — ${opts.apply ? "APPLY" : "dry run"}`);
    for (const d of decisions) {
      if (d.refusal) {
        console.log(`  ! ${d.suiteId}  REFUSED — ${d.refusal}`);
        continue;
      }
      for (const w of d.warnings) console.log(`  ~ ${d.suiteId}  ${w}`);
      if (!d.cases.length) continue;
      console.log(`  ${d.suiteId}  ${d.file}`);
      for (const c of d.cases) {
        if (c.promote) console.log(`    + ${c.caseId}  Draft → ${c.to}  [${c.lane ?? "?"}]`);
        else console.log(`    · ${c.caseId}  held — ${c.reasons[0] ?? "no reason recorded"}`);
      }
    }
    console.log(
      `\n  ${promoted.length} promotable of ${all.length} Draft case(s) considered` +
        (refusals ? `, ${refusals} suite(s) refused` : ""),
    );
    if (opts.apply && written.length) console.log(`  written: ${written.join(", ")}`);
    for (const e of writeErrors) console.error(`  ! ${e}`);
    if (!opts.apply && promoted.length)
      console.log(`  re-run with --apply to write, then: npm run suites:sync && npm run suites:lint`);
  }

  if (writeErrors.length || refusals) return process.exit(2);
  process.exit(promoted.length ? 0 : 1);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
