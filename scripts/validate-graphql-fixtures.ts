#!/usr/bin/env tsx
/**
 * Validate every .graphql fixture in test-data/graphql/{queries,mutations}/
 * against the live xAPI schema.
 *
 * Each fixture has a leading comment header:
 *   # name: <fixture-name>
 *   # category: <domain>
 *   # role: <auth role>
 *   # purpose: <one-line description>
 *   # required-vars: VAR1 (Type), VAR2 (Type)
 *   # optional-vars: (or "(none)")
 *   # last-validated: YYYY-MM-DD
 *   # known-issues:
 *   #   - text
 *
 * Blank line, then GraphQL body.
 *
 * This script:
 *   1. Parses every fixture (header + body)
 *   2. Schema-validates the body via validateQuery() from lib/graphql-validator
 *   3. Reports drift in reports/graphql-fixtures-validation.md
 *   4. Exits non-zero if any fixture fails validation
 *
 * Usage:
 *   npx tsx scripts/validate-graphql-fixtures.ts           # validate with cached schema
 *   npx tsx scripts/validate-graphql-fixtures.ts --refresh # refresh schema from live
 *   npx tsx scripts/validate-graphql-fixtures.ts --json    # emit JSON instead of markdown
 */

import { config as loadDotenv } from "dotenv";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import {
  buildSchema,
  introspect,
  loadSchemaCache,
  saveSchemaCache,
  validateQuery,
} from "./lib/graphql-validator.js";

loadDotenv();

const ROOT = resolve(process.cwd());
const FIXTURES_DIR = join(ROOT, "test-data", "graphql");
const SCHEMA_CACHE = join(ROOT, "scripts", ".graphql-schema.cache.json");
const REPORT_PATH = join(ROOT, "reports", "graphql-fixtures-validation.md");

interface FixtureHeader {
  name: string;
  category: string;
  role: string;
  purpose: string;
  requiredVars: string;
  optionalVars: string;
  lastValidated: string;
  knownIssues: string[];
  usedBy?: string;
  cleanupRequired?: string;
}

interface Fixture {
  path: string;
  relPath: string;
  kind: "query" | "mutation";
  header: FixtureHeader;
  body: string;
  rawHeaderText: string;
}

interface ValidationResult {
  fixture: Fixture;
  schemaValid: boolean;
  errors: Array<{ code: string; message: string; line?: number; column?: number }>;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    refresh: argv.includes("--refresh"),
    json: argv.includes("--json"),
    dryRun: argv.includes("--dry-run"),
  };
}

function listFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const kind of ["queries", "mutations"] as const) {
    const dir = join(FIXTURES_DIR, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".graphql")) continue;
      const full = join(dir, f);
      const raw = readFileSync(full, "utf-8");
      const parsed = parseFixture(raw, full);
      fixtures.push({
        path: full,
        relPath: `test-data/graphql/${kind}/${f}`,
        kind: kind === "queries" ? "query" : "mutation",
        header: parsed.header,
        body: parsed.body,
        rawHeaderText: parsed.rawHeaderText,
      });
    }
  }
  return fixtures.sort((a, b) => a.header.name.localeCompare(b.header.name));
}

function parseFixture(raw: string, path: string): { header: FixtureHeader; body: string; rawHeaderText: string } {
  const lines = raw.split(/\r?\n/);
  const headerLines: string[] = [];
  const bodyLines: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith("#")) {
        headerLines.push(line);
      } else if (line.trim() === "") {
        if (headerLines.length === 0) continue; // leading blank before header
        inHeader = false;
      } else {
        inHeader = false;
        bodyLines.push(line);
      }
    } else {
      bodyLines.push(line);
    }
  }

  const header = extractHeader(headerLines, path);
  return {
    header,
    body: bodyLines.join("\n").trim(),
    rawHeaderText: headerLines.join("\n"),
  };
}

function extractHeader(lines: string[], path: string): FixtureHeader {
  const kv: Record<string, string> = {};
  const knownIssues: string[] = [];
  let currentKey: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/^#\s?/, "");
    if (line.startsWith("  -") || line.startsWith("- ")) {
      const item = line.replace(/^[\s-]+/, "").trim();
      if (currentKey === "known-issues") knownIssues.push(item);
      continue;
    }
    const m = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (m) {
      currentKey = m[1].toLowerCase();
      kv[currentKey] = m[2].trim();
    }
  }

  return {
    name: kv.name || basename(path, ".graphql"),
    category: kv.category || "",
    role: kv.role || "",
    purpose: kv.purpose || "",
    requiredVars: kv["required-vars"] || "(none)",
    optionalVars: kv["optional-vars"] || "(none)",
    lastValidated: kv["last-validated"] || "",
    knownIssues: knownIssues.length > 0 ? knownIssues : kv["known-issues"] ? [kv["known-issues"]] : [],
    usedBy: kv["used-by"],
    cleanupRequired: kv["cleanup-required"],
  };
}

async function main() {
  const args = parseArgs();
  const backUrl = process.env.BACK_URL;

  // Schema load / refresh
  let schema;
  if (args.refresh) {
    if (!backUrl) {
      console.error("--refresh requires BACK_URL in .env");
      process.exit(2);
    }
    console.log(`Refreshing schema from ${backUrl}/graphql...`);
    const intro = await introspect({ backUrl });
    saveSchemaCache(intro, SCHEMA_CACHE);
    schema = buildSchema(intro);
    console.log(`Cached at ${SCHEMA_CACHE}\n`);
  } else {
    if (!existsSync(SCHEMA_CACHE)) {
      console.error(`Schema cache missing at ${SCHEMA_CACHE}. Run with --refresh first.`);
      process.exit(2);
    }
    const intro = loadSchemaCache(SCHEMA_CACHE);
    schema = buildSchema(intro);
  }

  const fixtures = listFixtures();
  console.log(`Found ${fixtures.length} fixture(s):\n`);

  const results: ValidationResult[] = [];
  for (const f of fixtures) {
    const v = validateQuery(schema, f.body);
    const passed = v.valid;
    const icon = passed ? "✅" : "❌";
    console.log(
      `${icon} ${f.relPath}  (${f.header.name} — ${f.kind}, role=${f.header.role})${
        passed ? "" : ` — ${v.errors.length} error(s)`
      }`
    );
    if (!passed) {
      for (const e of v.errors) console.log(`    · ${e.code}: ${e.message}`);
    }
    results.push({
      fixture: f,
      schemaValid: passed,
      errors: v.errors,
    });
  }

  const passed = results.filter((r) => r.schemaValid).length;
  const failed = results.length - passed;
  console.log(`\nTotal: ${passed} passed / ${failed} failed / ${results.length} fixtures`);

  // Report
  if (!existsSync(join(ROOT, "reports"))) mkdirSync(join(ROOT, "reports"), { recursive: true });

  if (args.json) {
    const jsonPath = REPORT_PATH.replace(/\.md$/, ".json");
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          validatedAt: new Date().toISOString(),
          backUrl,
          total: results.length,
          passed,
          failed,
          fixtures: results.map((r) => ({
            name: r.fixture.header.name,
            path: r.fixture.relPath,
            kind: r.fixture.kind,
            role: r.fixture.header.role,
            schemaValid: r.schemaValid,
            errors: r.errors,
            knownIssues: r.fixture.header.knownIssues,
            lastValidated: r.fixture.header.lastValidated,
          })),
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`\nJSON report: ${jsonPath}`);
  } else {
    const md = renderMarkdownReport(results, backUrl ?? "(not set)");
    writeFileSync(REPORT_PATH, md, "utf-8");
    console.log(`\nMarkdown report: ${REPORT_PATH}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

function renderMarkdownReport(results: ValidationResult[], backUrl: string): string {
  const passed = results.filter((r) => r.schemaValid).length;
  const failed = results.length - passed;
  const now = new Date().toISOString();

  let md = `# GraphQL Fixtures Validation\n\n`;
  md += `**Validated at:** ${now}\n`;
  md += `**Schema source:** ${backUrl}/graphql\n`;
  md += `**Total:** ${results.length} fixtures — ${passed} passed, ${failed} failed\n\n`;

  if (failed > 0) {
    md += `## ❌ Failed Fixtures (${failed})\n\n`;
    for (const r of results.filter((x) => !x.schemaValid)) {
      md += `### ${r.fixture.header.name} (${r.fixture.kind})\n\n`;
      md += `- **Path:** \`${r.fixture.relPath}\`\n`;
      md += `- **Role:** ${r.fixture.header.role}\n`;
      md += `- **Purpose:** ${r.fixture.header.purpose}\n`;
      md += `- **Errors:**\n`;
      for (const e of r.errors) md += `  - \`${e.code}\`: ${e.message}\n`;
      md += `\n`;
    }
  }

  md += `## ✅ Passed Fixtures (${passed})\n\n`;
  md += `| Name | Kind | Role | Category | Required Vars | Last Validated | Known Issues |\n`;
  md += `|------|------|------|----------|---------------|----------------|--------------|\n`;
  for (const r of results.filter((x) => x.schemaValid)) {
    const ki = r.fixture.header.knownIssues.length > 0 ? `${r.fixture.header.knownIssues.length} noted` : "—";
    md += `| ${r.fixture.header.name} | ${r.fixture.kind} | ${r.fixture.header.role} | ${r.fixture.header.category} | ${r.fixture.header.requiredVars} | ${r.fixture.header.lastValidated} | ${ki} |\n`;
  }
  md += `\n`;

  const withIssues = results.filter((r) => r.fixture.header.knownIssues.length > 0);
  if (withIssues.length > 0) {
    md += `## Known-Issues Summary\n\n`;
    for (const r of withIssues) {
      md += `**${r.fixture.header.name}**:\n`;
      for (const i of r.fixture.header.knownIssues) md += `- ${i}\n`;
      md += `\n`;
    }
  }

  return md;
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(3);
});
