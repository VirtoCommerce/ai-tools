/**
 * Schema-safe appender for enriched-CSV regression suites.
 *
 * Skills (`/qa-test-cases-generator`, `/qa-coverage-gap`, `/qa-api`, `/qa-plan`)
 * GENERATE test-case rows but must never hand-roll the file append - a missing
 * boundary newline silently merges two 15-col rows into one ~29-field record
 * (see memory `feedback_csv_append_newline_corruption` /
 * `feedback_runner_planner_no_suite_authoring`). This script is the single
 * deterministic writer they call instead:
 *   - validates new rows against the 15-column `test-case-template.md` schema
 *   - enforces ID format + uniqueness, Priority/Automation_Status enums, and
 *     References-required-for-Critical/High
 *   - blocks exact Title+Section duplicates against the target suite (best
 *     effort - skipped with a warning if the existing file is not field-parsable)
 *   - serialises with csv-stringify (correct quoting/escaping of commas &
 *     newlines inside Steps/Assertions) and guarantees exactly one boundary
 *     newline between the existing rows and the appended block
 *   - round-trip verifies the appended block: re-parses it and asserts every
 *     record has 15 fields and every new ID is present
 *
 * Content judgment (what the cases SAY) stays with the LLM; this guarantees the
 * FORMAT cannot be corrupted. Deeper content linting is `scripts/lint-test-cases.ts`.
 *
 * The script intentionally does NOT re-validate pre-existing rows: some UI
 * suites carry unescaped inner double-quotes that strict CSV parsing rejects,
 * and `relax_quotes` mis-parses them. Existing IDs are therefore harvested by a
 * line-start scan that is immune to inner-field quoting.
 *
 * Usage:
 *   npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> --rows <new-rows.csv> [--dry-run] [--check-global-ids [root]]
 *   cat new-rows.csv | npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> --stdin [--dry-run]
 *
 * `--check-global-ids` additionally rejects an incoming ID that already exists in
 * ANY suite under <root> (default `regression/suites`), not just the target — the
 * collision that silently overwrites another suite's per-case evidence. Opt-in,
 * because the committed corpus still carries legacy cross-suite duplicates.
 * /qa-test-lifecycle Phase 6P (gate G12) passes it when promoting.
 *
 * Exit code 0 = appended (or dry-run clean); 1 = validation/verify failure (nothing written).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

export const COLUMNS = [
  "ID",
  "Title",
  "Section",
  "Priority",
  "Business_Rule",
  "Edge_Case_Refs",
  "Preconditions",
  "Test_Data",
  "Steps",
  "Assertions",
  "Cross_Layer_Checks",
  "Failure_Signals",
  "Cleanup",
  "References",
  "Automation_Status",
] as const;

export type Column = (typeof COLUMNS)[number];
export type Row = Record<Column, string>;

// Template canon is Critical|High|Medium|Low; real suites also use P0-P3
// (e.g. 050a). Accept both so a correct append is never blocked on style -
// style inconsistency is the linter's job, not the writer's.
const PRIORITIES = new Set(["Critical", "High", "Medium", "Low", "P0", "P1", "P2", "P3"]);
const HIGH_PRIORITIES = new Set(["Critical", "High", "P0", "P1"]);
const AUTOMATION_STATUSES = new Set([
  "Draft",
  "Reviewed",
  "Automated",
  "Manual",
  "Semi-Automated",
]);
// ID = uppercase alnum segments joined by '-', ending in digits or a single
// variant letter, and containing at least one digit. Matches SMK-001,
// CART-014, SRCH-NEW-012, PAY-GUEST-001, BL-B2B-010, CFG-GQL-VCST4961-A.
const ID_RE = /^(?=.*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*-(?:\d+[A-Z]?|[A-Z])$/;
// References must cite a real source of demand for Critical/High cases.
const REFERENCE_RE = /(VCST-\d+|REQ-[A-Z0-9-]+|smoke-baseline|https?:\/\/\S+)/i;
// A data row begins at column 0 of a physical line with its ID; continuation
// lines of a multi-line quoted field do not.
const ROW_START_ID_RE = /^\s*"?([A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)"?\s*,/;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function toRow(fields: string[]): Row {
  const row = {} as Row;
  COLUMNS.forEach((col, idx) => {
    row[col] = (fields[idx] ?? "").trim();
  });
  return row;
}

/**
 * Strict-parse CSV text into objects keyed by the canonical 15 columns.
 *
 * `bom: true` is load-bearing, not cosmetic. 12 of the 120 committed suite CSVs
 * start with a UTF-8 BOM, and without this csv-parse throws
 * `Invalid Opening Quote: a quote is found on field 0 at line 1 … (utf8 bom)`.
 * Every caller that wraps this in a try/catch then silently loses the whole file:
 * `lint-bl.ts buildCoverage()` dropped those 12 suites from the BL coverage map,
 * which made 3 of its 6 reported BLC-004 "uncovered" findings false (BL-CART-009,
 * and BL-SRCH-002 which actually has 16 citing cases) and suppressed BLC-002
 * dangling-reference detection in the same files. `headerFields()` below already
 * stripped the BOM by hand; this closes the same gap for the field parse.
 */
export function parseSuite(text: string): { header: string[]; rows: Row[] } {
  const records = parseCsv(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (records.length === 0) return { header: [...COLUMNS], rows: [] };
  const [header, ...dataRows] = records;
  return { header, rows: dataRows.map(toRow) };
}

/**
 * Harvest existing IDs without a full CSV parse, so a pre-existing inner-quote
 * irregularity in an unrelated field can't stop ID-uniqueness enforcement.
 */
export function extractExistingIds(rawText: string): Set<string> {
  const ids = new Set<string>();
  for (const line of rawText.split(/\r?\n/)) {
    const m = line.match(ROW_START_ID_RE);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** Best-effort Title+Section dedup set; null if the suite won't field-parse. */
export function tryExtractTitleSections(rawText: string): Set<string> | null {
  try {
    const { rows } = parseSuite(rawText);
    return new Set(rows.map((r) => `${r.Title}\u0000${r.Section}`));
  } catch {
    return null;
  }
}

/**
 * Parse just the first physical line into header fields. Tolerates both the
 * quoted (`"ID","Title",...`) and unquoted (`ID,Title,...`) header styles that
 * coexist across the suites.
 */
export function headerFields(rawText: string): string[] {
  const firstLine = (rawText.split(/\r?\n/, 1)[0] ?? "").replace(/^﻿/, "");
  const recs = parseCsv(firstLine, { relax_column_count: true }) as string[][];
  return (recs[0] ?? []).map((s) => s.trim());
}

/**
 * Is this file's header the canonical 15-column enriched format?
 *
 * WHY EVERY CONSUMER MUST ASK. `parseSuite` maps fields POSITIONALLY, so on one of the 11
 * surviving legacy 11-column suites the legacy `Steps` lands in `Test_Data` and
 * `Expected Result` lands in `Steps`. A consumer that reads a column by name then scores
 * confidently derived nonsense — and nothing downstream can tell.
 *
 * A PREDICATE, NOT AN ASSERT. Six call sites need three different reactions to a
 * non-canonical header: skip the file (`continue` / `return null`), count its rows as
 * unroutable, or refuse loudly (`fail` / exit 2). What is duplicated is the COMPARISON, not
 * the reaction, so the shared piece stops here and the caller keeps its own behaviour. A
 * throwing `assertCanonicalHeader` would be unusable by four of the six.
 *
 * BOM is stripped inside (`headerFields` handles the first line), so callers must not do it
 * again — two of the six used to and two did not, which reads like a meaningful difference.
 */
export function isCanonicalHeader(rawText: string): boolean {
  return headerFields(rawText).join(",") === COLUMNS.join(",");
}

/**
 * `null` when the header is canonical; otherwise a printable reason naming both shapes, for
 * the call sites that report rather than skip.
 */
export function describeHeaderMismatch(rawText: string): string | null {
  const header = headerFields(rawText);
  if (header.join(",") === COLUMNS.join(",")) return null;
  return (
    `header is not the canonical 15-column enriched format (found ${header.length} column(s)).\n` +
    `  expected: ${COLUMNS.join(",")}\n` +
    `  found:    ${header.join(",")}`
  );
}

/**
 * Validate new rows for structure and against the existing suite. Pure (no I/O)
 * so it is unit-testable and reusable by the linter.
 *
 * @param existingIds           IDs already present in the target suite.
 * @param existingTitleSection  Title+Section keys for dedup, or null when the
 *   target couldn't be field-parsed (dedup skipped; ID-uniqueness still holds).
 */
export function validateRows(
  newRows: Row[],
  existingIds: Set<string>,
  existingTitleSection: Set<string> | null,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  newRows.forEach((row, i) => {
    const where = `new row ${i + 1} (${row.ID || "<no ID>"})`;

    if (!row.ID) errors.push(`${where}: missing ID`);
    else if (!ID_RE.test(row.ID))
      errors.push(`${where}: ID "${row.ID}" not in PREFIX-NNN format`);
    else if (existingIds.has(row.ID))
      errors.push(`${where}: ID collides with an existing case in the suite`);
    else if (seenIds.has(row.ID))
      errors.push(`${where}: duplicate ID within the appended batch`);
    if (row.ID) seenIds.add(row.ID);

    if (!row.Title) errors.push(`${where}: missing Title`);
    if (!row.Section) errors.push(`${where}: missing Section`);

    if (!PRIORITIES.has(row.Priority))
      errors.push(`${where}: Priority "${row.Priority}" not Critical|High|Medium|Low (or P0-P3)`);

    if (!AUTOMATION_STATUSES.has(row.Automation_Status))
      errors.push(`${where}: Automation_Status "${row.Automation_Status}" invalid`);

    if (HIGH_PRIORITIES.has(row.Priority)) {
      if (!row.References)
        errors.push(`${where}: ${row.Priority} case must cite a References value`);
      else if (!REFERENCE_RE.test(row.References))
        warnings.push(
          `${where}: References "${row.References}" has no VCST-/REQ-/URL/smoke-baseline token`,
        );
    }

    if (existingTitleSection && row.Title && row.Section) {
      const key = `${row.Title}\u0000${row.Section}`;
      if (existingTitleSection.has(key))
        errors.push(
          `${where}: Title+Section duplicates an existing case ("${row.Title}" / "${row.Section}")`,
        );
    }
  });

  return { errors, warnings };
}

/** Serialise rows to a CSV body (no header), correctly quoted. */
export function serialiseRows(rows: Row[]): string {
  const matrix = rows.map((r) => COLUMNS.map((c) => r[c] ?? ""));
  // csv-stringify quotes any field containing comma/quote/newline automatically.
  return stringifyCsv(matrix, { record_delimiter: "\n" });
}

/** The dominant line ending of the target, so the append doesn't mix EOLs. */
export function detectEol(text: string): "\r\n" | "\n" {
  return /\r\n/.test(text) ? "\r\n" : "\n";
}

/** Rewrite every line ending to `eol`. */
export function normaliseEol(text: string, eol: "\r\n" | "\n"): string {
  return text.replace(/\r?\n/g, eol);
}

/** Ensure text ends with exactly one trailing `eol`. */
export function withSingleTrailingNewline(text: string, eol: "\r\n" | "\n" = "\n"): string {
  return text.replace(/(?:\r?\n)+$/, "") + eol;
}

/**
 * Harvest every case ID in the suite corpus, mapped to the file(s) holding it.
 * Used by `--check-global-ids`: the in-suite `existingIds` check cannot see a
 * collision with a DIFFERENT suite, and a cross-suite duplicate ID silently
 * overwrites the other suite's per-case results/failure evidence at run time
 * (memory `reference_case_ids_must_be_globally_unique`).
 *
 * Deliberately OPT-IN, and it validates only the INCOMING ids: the committed
 * corpus already carries ~224 IDs that appear in more than one suite (legacy
 * debt, e.g. `CAT-001` in both 051-catalog-admin-products and
 * 001-catalog-navigation). Checking the corpus against itself, or enabling this
 * by default, would fail unrelated appends on that pre-existing debt instead of
 * on the caller's own rows.
 */
export function collectCorpusIds(root: string, excludeFile?: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const exclude = excludeFile ? resolve(excludeFile) : null;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        if (exclude && resolve(p) === exclude) continue;
        for (const id of extractExistingIds(readFileSync(p, "utf-8"))) {
          const arr = out.get(id) ?? [];
          arr.push(p);
          out.set(id, arr);
        }
      }
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

interface CliArgs {
  target: string;
  rowsPath?: string;
  stdin: boolean;
  dryRun: boolean;
  /** Root to scan for cross-suite ID collisions; undefined = check disabled. */
  globalIdRoot?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { target: "", stdin: false, dryRun: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rows") args.rowsPath = argv[++i];
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check-global-ids") {
      // Optional value: `--check-global-ids` or `--check-global-ids <root>`.
      const next = argv[i + 1];
      args.globalIdRoot = next && !next.startsWith("--") ? argv[++i] : "regression/suites";
    } else positional.push(a);
  }
  args.target = positional[0] ?? "";
  return args;
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target || (!args.rowsPath && !args.stdin)) {
    console.error(
      "Usage: append-test-cases-to-suite.ts <target-suite.csv> (--rows <new.csv> | --stdin) [--dry-run]",
    );
    process.exit(1);
  }

  const targetText = readFileSync(args.target, "utf-8");

  const mismatch = describeHeaderMismatch(targetText);
  if (mismatch) fail(`Target suite ${mismatch}`);

  const existingIds = extractExistingIds(targetText);
  const existingTitleSection = tryExtractTitleSections(targetText);

  // New rows may or may not carry a header; parseSuite drops the first record,
  // so prepend the canonical header when the input lacks one.
  const rowsText = args.stdin ? readStdin() : readFileSync(args.rowsPath!, "utf-8");
  // Cheap header sniff: a full parse of the first physical line is unsafe
  // because the row's Steps field may open a multi-line quote. The header, if
  // present, begins with `ID,` or `"ID",`.
  const rowsFirst = (rowsText.split(/\r?\n/, 1)[0] ?? "").replace(/^﻿/, "");
  const hasHeader = /^\s*"?ID"?\s*,/.test(rowsFirst);
  const normalised = hasHeader ? rowsText : `${COLUMNS.join(",")}\n${rowsText}`;

  let newRows: Row[];
  try {
    newRows = parseSuite(normalised).rows;
  } catch (e) {
    fail(`Could not parse the new rows as CSV: ${(e as Error).message}`);
  }
  if (newRows!.length === 0) fail("No rows to append (input parsed to 0 data rows).");

  if (existingTitleSection === null)
    console.warn(
      "⚠ Target suite is not strictly field-parsable; Title+Section dedup skipped (ID-uniqueness still enforced).",
    );

  const { errors, warnings } = validateRows(newRows!, existingIds, existingTitleSection);

  // Cross-suite ID collision check (opt-in): the in-suite check above cannot see
  // an ID that already lives in a DIFFERENT suite, which is the collision that
  // destroys the other suite's evidence. Required by /qa-test-lifecycle Phase 6P
  // (gate G12) when promoting a /qa-test run's cases into regression/suites/.
  if (args.globalIdRoot) {
    const corpus = collectCorpusIds(args.globalIdRoot, args.target);
    for (const row of newRows!) {
      const hits = row.ID ? corpus.get(row.ID) : undefined;
      if (hits?.length)
        errors.push(
          `ID "${row.ID}": collides with a case in another suite — ${hits.join(", ")}. ` +
            `Re-ID the incoming case (never renumber the existing one).`,
        );
    }
  }

  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    fail(`${errors.length} validation error(s) - nothing written.`);
  }

  const eol = detectEol(targetText);
  const block = normaliseEol(serialiseRows(newRows!), eol);
  const finalText = withSingleTrailingNewline(
    withSingleTrailingNewline(targetText, eol) + block,
    eol,
  );

  // Round-trip verify the appended block (which we own and serialised strictly).
  // This is exactly the corruption guard: a clean block of N records, each 15
  // fields wide, all IDs present.
  const blockWithHeader = `${COLUMNS.join(",")}\n${block}`;
  const verify = parseCsv(blockWithHeader, {
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  const dataRecords = verify.slice(1);
  const badWidth = dataRecords.findIndex((rec) => rec.length !== COLUMNS.length);
  if (badWidth !== -1)
    fail(
      `Round-trip verify failed: appended record ${badWidth + 1} has ${dataRecords[badWidth].length} fields, expected ${COLUMNS.length}.`,
    );
  if (dataRecords.length !== newRows!.length)
    fail(
      `Round-trip verify failed: serialised ${dataRecords.length} records but expected ${newRows!.length}.`,
    );
  const verifiedIds = new Set(dataRecords.map((rec) => rec[0]?.trim()));
  const missing = newRows!.filter((r) => !verifiedIds.has(r.ID)).map((r) => r.ID);
  if (missing.length > 0)
    fail(`Round-trip verify failed: appended IDs missing after serialise: ${missing.join(", ")}`);

  // Confirm a single clean boundary EOL (no merged-row corruption).
  const boundary = withSingleTrailingNewline(targetText, eol);
  if (!boundary.endsWith(eol) || boundary.endsWith(eol + eol))
    fail("Boundary newline check failed (unexpected internal error).");

  if (args.dryRun) {
    console.log(
      `✓ Dry run OK - ${newRows!.length} row(s) would append to ${args.target}; ` +
        `all 15-col, all IDs present${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`,
    );
    return;
  }

  writeFileSync(args.target, finalText, "utf-8");
  console.log(
    `✓ Appended ${newRows!.length} case(s) to ${args.target}` +
      `${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`,
  );
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
