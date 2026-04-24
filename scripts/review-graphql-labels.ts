#!/usr/bin/env tsx
/**
 * Lint rule DV-019 — Runner-native GraphQL step-structure check.
 *
 * Scans a CSV file (or directory of CSVs) for runner-native GraphQL cases
 * and reports any [GQL-OP]/[GQL-EXEC]/[GQL-VARS]/[GQL-CAPTURE] label-pairing
 * violations without sending any HTTP or touching a live environment.
 *
 * A row is considered "runner-native" when its Steps column contains at
 * least one [GQL-OP <label>] or [GQL-EXEC <label>] tag. Legacy GraphiQL-UI
 * cases are skipped (exempt per review-criteria.md DV-019 scope).
 *
 * Usage:
 *   npx tsx scripts/review-graphql-labels.ts <csv-path>
 *   npx tsx scripts/review-graphql-labels.ts <dir>              # recurses on *.csv
 *   npm run graphql:lint-labels -- regression/suites/Backend/graphql/050d-graphql-xprofile.csv
 *
 * Exit codes:
 *   0 = no findings
 *   1 = one or more rows had DV-019 findings
 *   2 = usage / IO error
 */

import { readFileSync, statSync, readdirSync, existsSync } from "fs";
import { resolve, join, relative } from "path";
import { parse as parseCsv } from "csv-parse/sync";
import { parseSteps, validateStepBlocks } from "./lib/graphql-case-parser.js";

interface Finding {
  file: string;
  caseId: string;
  title: string;
  code: string; // DV-019 | S-007
  error: string;
}

function collectCsvFiles(target: string): string[] {
  const abs = resolve(target);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${target}`);
  }
  const stat = statSync(abs);
  if (stat.isFile()) {
    if (!abs.toLowerCase().endsWith(".csv")) {
      throw new Error(`Not a CSV file: ${target}`);
    }
    return [abs];
  }
  if (stat.isDirectory()) {
    const out: string[] = [];
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry);
      const s = statSync(p);
      if (s.isDirectory()) out.push(...collectCsvFiles(p));
      else if (s.isFile() && p.toLowerCase().endsWith(".csv")) out.push(p);
    }
    return out;
  }
  throw new Error(`Unsupported path: ${target}`);
}

function isRunnerNative(steps: string): boolean {
  return /\[GQL-(OP|EXEC|VARS|CAPTURE)\b/i.test(steps);
}

function lintFile(csvPath: string): {
  runnerNativeRows: number;
  totalRows: number;
  findings: Finding[];
} {
  const raw = readFileSync(csvPath, "utf-8");
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
    });
  } catch (e) {
    return {
      runnerNativeRows: 0,
      totalRows: 0,
      findings: [
        {
          file: csvPath,
          caseId: "(file-level)",
          title: "",
          code: "S-007",
          error: `CSV parse error: ${(e as Error).message}`,
        },
      ],
    };
  }

  const findings: Finding[] = [];
  let runnerNative = 0;
  const relPath = relative(process.cwd(), csvPath);

  for (const row of rows) {
    const steps = row.Steps || "";
    if (!isRunnerNative(steps)) continue;
    runnerNative++;

    const blocks = parseSteps(steps);
    const errors = validateStepBlocks(blocks);
    for (const e of errors) {
      findings.push({
        file: relPath,
        caseId: row.ID || "(no-ID)",
        title: row.Title || "",
        code: "DV-019",
        error: e,
      });
    }
  }

  return { runnerNativeRows: runnerNative, totalRows: rows.length, findings };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`Lint runner-native GraphQL step-structure (DV-019)

Usage:
  npx tsx scripts/review-graphql-labels.ts <csv-or-dir> [<csv-or-dir>...]

Exit codes:
  0 = clean  |  1 = findings  |  2 = usage/IO error`);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const targets = args.filter((a) => !a.startsWith("-"));
  let csvs: string[] = [];
  try {
    for (const t of targets) csvs.push(...collectCsvFiles(t));
  } catch (e) {
    console.error(`ERROR: ${(e as Error).message}`);
    process.exit(2);
  }

  if (csvs.length === 0) {
    console.error(`No CSV files found under: ${targets.join(", ")}`);
    process.exit(2);
  }

  const allFindings: Finding[] = [];
  let totalRunnerNative = 0;
  let totalRows = 0;

  for (const csvPath of csvs) {
    const { runnerNativeRows, totalRows: rt, findings } = lintFile(csvPath);
    totalRunnerNative += runnerNativeRows;
    totalRows += rt;
    allFindings.push(...findings);
  }

  console.log(
    `\nScanned ${csvs.length} file(s), ${totalRows} rows, ${totalRunnerNative} runner-native case(s)\n`
  );

  if (allFindings.length === 0) {
    console.log(`✅ No findings — all runner-native cases have balanced labels.`);
    process.exit(0);
  }

  const dv019 = allFindings.filter((f) => f.code === "DV-019").length;
  const s007 = allFindings.filter((f) => f.code === "S-007").length;
  const parts: string[] = [];
  if (dv019 > 0) parts.push(`${dv019} DV-019`);
  if (s007 > 0) parts.push(`${s007} S-007`);
  console.log(`❌ Findings: ${parts.join(", ")}\n`);

  const byFile = new Map<string, Finding[]>();
  for (const f of allFindings) {
    const arr = byFile.get(f.file) || [];
    arr.push(f);
    byFile.set(f.file, arr);
  }

  for (const [file, list] of byFile) {
    console.log(`  ${file}`);
    for (const f of list) {
      console.log(`    · [${f.caseId}] ${f.title}`);
      console.log(`      ${f.code}: ${f.error}`);
    }
  }

  process.exit(1);
}

main();
