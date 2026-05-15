#!/usr/bin/env tsx
/**
 * Validate that every covered cell in `.claude/agents/knowledge/critical-ui-scope.md`
 * points at a test ID that actually exists in a regression suite CSV.
 *
 * Cell value contract (per critical-ui-scope.md):
 *   - Test ID like `LAYOUT-CLS-001` or `LAYOUT-COMP-VCTABLE-001` → resolves to the
 *     `ID` column of some row in some `regression/suites/**\/*.csv` file
 *   - `n/a` → invariant does not apply to this component/page; skipped by validator
 *   - Multiple IDs joined with ` + ` (literal `+` with spaces) → each validated independently
 *   - Anything else (empty, "GAP", "none", "TODO") → uncovered, validator fails
 *
 * Two HTML-comment markers delimit each machine-readable matrix:
 *   <!-- COVERAGE-MATRIX-START --> ... <!-- COVERAGE-MATRIX-END -->        (components)
 *   <!-- PAGE-COVERAGE-MATRIX-START --> ... <!-- PAGE-COVERAGE-MATRIX-END --> (pages)
 *
 * Usage:
 *   npx tsx scripts/validate-critical-ui-scope.ts          # validate
 *   npm run scope:validate                                  # alias of above
 *
 * Exit codes:
 *   0  — every covered cell resolves to an existing test ID
 *   1  — at least one cell is uncovered or its ID does not exist in any suite
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SCOPE_FILE = join(".claude", "agents", "knowledge", "critical-ui-scope.md");
const SUITES_DIR = join("regression", "suites");

interface Cell {
  matrix: "components" | "pages";
  rowLabel: string;     // e.g. "VcTable" or "/account/orders"
  colHeader: string;    // e.g. "BL-UI-002"
  rawValue: string;     // unparsed cell text
}

interface ParseResult {
  cells: Cell[];
  errors: string[];
}

/** Extract a markdown table block delimited by START/END HTML comments. */
function extractMatrix(source: string, startMarker: string, endMarker: string): string | null {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start + startMarker.length, end);
}

/** Parse a single markdown table block into rows of cell strings. Returns header + body rows. */
function parseMarkdownTable(block: string): { header: string[]; rows: string[][] } {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) return { header: [], rows: [] };

  const splitRow = (line: string): string[] =>
    line
      .split("|")
      .slice(1, -1) // drop leading/trailing empty splits from outer |
      .map((c) => c.trim());

  const header = splitRow(lines[0]);
  // lines[1] is the markdown separator (`|---|---|...`); skip it
  const rows = lines.slice(2).map(splitRow);
  return { header, rows };
}

function parseScopeFile(source: string): ParseResult {
  const cells: Cell[] = [];
  const errors: string[] = [];

  // Components matrix
  const compBlock = extractMatrix(source, "<!-- COVERAGE-MATRIX-START -->", "<!-- COVERAGE-MATRIX-END -->");
  if (!compBlock) {
    errors.push("Components matrix markers not found (<!-- COVERAGE-MATRIX-START --> ... END)");
  } else {
    const { header, rows } = parseMarkdownTable(compBlock);
    if (header.length < 2) {
      errors.push("Components matrix header could not be parsed");
    } else {
      // header[0] is "Component"; header[1..] are invariants
      for (const row of rows) {
        if (row.length !== header.length) {
          errors.push(`Components matrix row has ${row.length} cells, header has ${header.length}: ${row[0]}`);
          continue;
        }
        const rowLabel = row[0].replace(/\*\*/g, "").trim();
        for (let i = 1; i < row.length; i++) {
          cells.push({ matrix: "components", rowLabel, colHeader: header[i], rawValue: row[i] });
        }
      }
    }
  }

  // Pages matrix
  const pageBlock = extractMatrix(source, "<!-- PAGE-COVERAGE-MATRIX-START -->", "<!-- PAGE-COVERAGE-MATRIX-END -->");
  if (!pageBlock) {
    errors.push("Pages matrix markers not found (<!-- PAGE-COVERAGE-MATRIX-START --> ... END)");
  } else {
    const { header, rows } = parseMarkdownTable(pageBlock);
    if (header.length < 2) {
      errors.push("Pages matrix header could not be parsed");
    } else {
      for (const row of rows) {
        if (row.length !== header.length) {
          errors.push(`Pages matrix row has ${row.length} cells, header has ${header.length}: ${row[0]}`);
          continue;
        }
        const rowLabel = row[0].replace(/\*\*/g, "").trim();
        for (let i = 1; i < row.length; i++) {
          cells.push({ matrix: "pages", rowLabel, colHeader: header[i], rawValue: row[i] });
        }
      }
    }
  }

  return { cells, errors };
}

/** Recursively walk a directory and return all .csv file paths. */
function walkCsv(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkCsv(full));
    } else if (entry.endsWith(".csv")) {
      out.push(full);
    }
  }
  return out;
}

/** Extract the `ID` column value from every row in a CSV. Assumes ID is the FIRST column. */
function extractIds(csv: string): Set<string> {
  const ids = new Set<string>();
  // Reuse CSV parser logic: respect quoted strings, only split on top-level commas/newlines.
  let inQuote = false;
  let cellIndex = 0;
  let buffer = "";
  let rowIndex = 0;
  const flushCell = () => {
    if (rowIndex > 0 && cellIndex === 0) {
      // Strip surrounding quotes
      const id = buffer.replace(/^"|"$/g, "").trim();
      if (id) ids.add(id);
    }
    cellIndex++;
    buffer = "";
  };
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      // Doubled "" inside a quoted field is an escape, not a state flip.
      if (inQuote && csv[i + 1] === '"') {
        buffer += '"';
        i++;
        continue;
      }
      inQuote = !inQuote;
      buffer += ch;
    } else if (ch === "," && !inQuote) {
      flushCell();
    } else if (ch === "\n" && !inQuote) {
      flushCell();
      rowIndex++;
      cellIndex = 0;
    } else if (ch === "\r" && !inQuote) {
      // skip — handle as part of \n
    } else {
      buffer += ch;
    }
  }
  if (buffer.length > 0) flushCell();
  return ids;
}

function main(): void {
  let source: string;
  try {
    source = readFileSync(SCOPE_FILE, "utf8");
  } catch (err) {
    console.error(`[scope:validate] FAIL: cannot read ${SCOPE_FILE} (${(err as Error).message})`);
    process.exit(1);
  }

  const { cells, errors: parseErrors } = parseScopeFile(source);
  if (parseErrors.length > 0) {
    console.error("[scope:validate] FAIL: matrix parse errors:");
    for (const e of parseErrors) console.error("  - " + e);
    process.exit(1);
  }

  // Collect every test ID across all regression suite CSVs.
  const allIds = new Set<string>();
  const csvFiles = walkCsv(SUITES_DIR);
  for (const file of csvFiles) {
    const ids = extractIds(readFileSync(file, "utf8"));
    for (const id of ids) allIds.add(id);
  }

  // Categorize cells
  const failures: { cell: Cell; reason: string }[] = [];
  let covered = 0;
  let notApplicable = 0;

  for (const cell of cells) {
    const value = cell.rawValue.trim();
    if (value === "n/a" || value === "N/A") {
      notApplicable++;
      continue;
    }
    if (value === "" || value === "GAP" || value === "none" || value === "TODO" || value === "-" || value === "—") {
      failures.push({ cell, reason: `uncovered (cell value: "${value}")` });
      continue;
    }
    // Multiple IDs separated by " + "
    const ids = value.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      failures.push({ cell, reason: "no parseable test IDs in cell" });
      continue;
    }
    const missing = ids.filter((id) => !allIds.has(id));
    if (missing.length > 0) {
      failures.push({ cell, reason: `test ID(s) not found in any suite CSV: ${missing.join(", ")}` });
      continue;
    }
    covered++;
  }

  const total = cells.length;
  console.log(
    `[scope:validate] ${covered} covered · ${notApplicable} n/a · ${failures.length} failures (total ${total} cells)`,
  );

  if (failures.length === 0) {
    console.log(`[scope:validate] OK — every covered cell resolves to an existing test ID`);
    console.log(`[scope:validate] Source: ${SCOPE_FILE}`);
    console.log(`[scope:validate] Suites scanned: ${csvFiles.length} CSV file(s) under ${SUITES_DIR}/`);
    process.exit(0);
  }

  console.error(`[scope:validate] FAIL — ${failures.length} uncovered or invalid cell(s):`);
  for (const { cell, reason } of failures) {
    console.error(`  - [${cell.matrix}] ${cell.rowLabel} × ${cell.colHeader} → ${reason}`);
  }
  process.exit(1);
}

main();
