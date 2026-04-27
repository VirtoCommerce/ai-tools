#!/usr/bin/env tsx
/**
 * GraphQL test runner.
 *
 * Two modes:
 *   1. Validate-only:
 *        npx tsx scripts/graphql-runner.ts --query-file <path>
 *        npx tsx scripts/graphql-runner.ts --query "<inline>"
 *        npx tsx scripts/graphql-runner.ts --all-fixtures
 *      Parses + validates a query against the introspected schema.
 *      NO HTTP sent. Catches DV-006…DV-011 at lint time.
 *
 *   2. End-to-end case execution (runner-native CSV row):
 *        npx tsx scripts/graphql-runner.ts --case <csv-path>:<CASE_ID>
 *      Resolves {{VAR}} / @td() tokens, acquires OAuth tokens per [AUTH role=…],
 *      validates + executes each [GQL-OP]/[GQL-EXEC] block, captures values,
 *      evaluates assertions, writes JSON evidence, prints verdict.
 *
 * Options:
 *   --schema-cache <path>   reuse saved introspection (default: scripts/.graphql-schema.cache.json)
 *   --refresh-schema        force fresh introspection
 *   --back-url <url>        override BACK_URL from .env
 *   --evidence-dir <path>   evidence output dir (default: reports/regression/graphql-evidence)
 *   --dry-run               validate + parse but don't POST to /graphql
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { resolve, join, basename, dirname } from "path";
import { config as loadDotenv } from "dotenv";
import { parse as parseCsv } from "csv-parse/sync";
import {
  introspect,
  buildSchema,
  validateQuery,
  saveSchemaCache,
  loadSchemaCache,
  ValidationResult,
} from "./lib/graphql-validator.js";
import { TestDataResolver } from "./lib/test-data-resolver.js";
import { TokenCache } from "./lib/graphql-auth.js";
import { executeOperation, GraphQLResponse } from "./lib/graphql-executor.js";
import {
  parseSteps,
  parseTestData,
  validateStepBlocks,
  StepBlock,
} from "./lib/graphql-case-parser.js";
import {
  parseAssertions,
  evaluateAssertion,
  AssertionResult,
  InfoAssertion,
} from "./lib/graphql-assertions.js";
import { GraphQLSchema } from "graphql";

loadDotenv();

const ROOT = resolve(process.cwd());
const DEFAULT_CACHE = join(ROOT, "scripts", ".graphql-schema.cache.json");
const DEFAULT_FIXTURES = join(ROOT, "scripts", "fixtures", "graphql");
const DEFAULT_EVIDENCE = join(ROOT, "reports", "regression", "graphql-evidence");
const TEST_DATA_DIR = join(ROOT, "test-data");

interface CliArgs {
  queryFile?: string;
  queryInline?: string;
  allFixtures?: boolean;
  caseRef?: string; // csv:ID
  schemaCache: string;
  refreshSchema: boolean;
  backUrl?: string;
  evidenceDir: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const out: CliArgs = {
    schemaCache: DEFAULT_CACHE,
    refreshSchema: false,
    evidenceDir: DEFAULT_EVIDENCE,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--query-file":
        out.queryFile = argv[++i];
        break;
      case "--query":
        out.queryInline = argv[++i];
        break;
      case "--all-fixtures":
        out.allFixtures = true;
        break;
      case "--case":
        out.caseRef = argv[++i];
        break;
      case "--schema-cache":
        out.schemaCache = argv[++i];
        break;
      case "--refresh-schema":
        out.refreshSchema = true;
        break;
      case "--back-url":
        out.backUrl = argv[++i];
        break;
      case "--evidence-dir":
        out.evidenceDir = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        if (!out.queryFile && !out.queryInline && !out.allFixtures && !out.caseRef) {
          out.queryFile = a;
        }
    }
  }

  return out;
}

function printHelp() {
  console.log(`GraphQL test runner

Validate a single query:
  npx tsx scripts/graphql-runner.ts <query-file>
  npx tsx scripts/graphql-runner.ts --query "{ me { id } }"
  npx tsx scripts/graphql-runner.ts --all-fixtures

Execute an end-to-end runner-native case from a suite CSV:
  npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050d-graphql-xprofile.csv:GQL-030

Options:
  --schema-cache <path>   reuse saved introspection (default: scripts/.graphql-schema.cache.json)
  --refresh-schema        force fresh introspection
  --back-url <url>        override BACK_URL from .env
  --evidence-dir <path>   output dir (default: reports/regression/graphql-evidence)
  --dry-run               validate + parse but don't POST to /graphql (schema check only)
`);
}

async function loadOrIntrospect(args: CliArgs) {
  if (!args.refreshSchema && existsSync(args.schemaCache)) {
    process.stderr.write(`Using cached schema: ${args.schemaCache}\n`);
    return loadSchemaCache(args.schemaCache);
  }

  const backUrl = args.backUrl || process.env.BACK_URL;
  if (!backUrl) {
    throw new Error(
      "BACK_URL not set in .env and --back-url not provided — cannot introspect"
    );
  }

  process.stderr.write(`Introspecting ${backUrl}/graphql ...\n`);
  const t0 = Date.now();
  const intro = await introspect({ backUrl });
  const elapsed = Date.now() - t0;
  process.stderr.write(`Introspected in ${elapsed}ms\n`);

  saveSchemaCache(intro, args.schemaCache);
  process.stderr.write(`Cached to ${args.schemaCache}\n`);
  return intro;
}

function readQueryFile(path: string): string {
  if (!existsSync(path)) throw new Error(`Query file not found: ${path}`);
  return readFileSync(path, "utf-8");
}

function formatResult(label: string, result: ValidationResult): void {
  const op = result.operationType
    ? `${result.operationType}${result.operationName ? ` ${result.operationName}` : ""}`
    : "(anonymous)";

  if (result.valid) {
    console.log(`✅ ${label}`);
    console.log(`   Valid against schema — operation: ${op}`);
    console.log(`   (HTTP send stubbed — schema-validate-before-send PROVEN)`);
  } else {
    console.log(`❌ ${label}`);
    console.log(`   Invalid — ${result.errors.length} error(s), NO HTTP sent:`);
    for (const err of result.errors) {
      const loc = err.line ? ` [line ${err.line}${err.column ? `:${err.column}` : ""}]` : "";
      console.log(`   · ${err.code}${loc}: ${err.message}`);
    }
  }
  console.log();
}

// ─── End-to-end case execution ──────────────────────────────────────────

interface CaseRow {
  ID: string;
  Title: string;
  Section: string;
  Priority: string;
  Business_Rule: string;
  Edge_Case_Refs: string;
  Preconditions: string;
  Test_Data: string;
  Steps: string;
  Assertions: string;
  Cross_Layer_Checks: string;
  Failure_Signals: string;
  Cleanup: string;
  References: string;
  Automation_Status: string;
}

function loadCase(caseRef: string): { csvPath: string; row: CaseRow } {
  const [csvPath, caseId] = caseRef.split(":");
  if (!csvPath || !caseId) {
    throw new Error(`--case must be <csv-path>:<ID>, got "${caseRef}"`);
  }
  const abs = resolve(csvPath);
  if (!existsSync(abs)) throw new Error(`Suite CSV not found: ${abs}`);
  const raw = readFileSync(abs, "utf-8");
  const rows = parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as CaseRow[];
  const row = rows.find((r) => r.ID === caseId);
  if (!row) throw new Error(`Case ${caseId} not found in ${csvPath}`);
  return { csvPath: abs, row };
}

function substituteVars(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{{${name}}}`
  );
}

function substituteEnv(s: string): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, name) => process.env[name] ?? `{{${name}}}`);
}

interface OpEvidence {
  label: string;
  query: string;
  variables: Record<string, unknown>;
  response: {
    status: number;
    ok: boolean;
    data: unknown;
    errors: unknown[];
    elapsed_ms: number;
  };
  schemaValid: boolean;
  schemaErrors: Array<{ code: string; message: string }>;
}

async function runCase(
  args: CliArgs,
  schema: GraphQLSchema,
  resolver: TestDataResolver,
  tokenCache: TokenCache,
  caseRef: string
): Promise<number> {
  const { csvPath, row } = loadCase(caseRef);
  const backUrl = args.backUrl || process.env.BACK_URL!;

  console.log(`\n=== Case: ${row.ID} ===`);
  console.log(`Title:  ${row.Title}`);
  console.log(`Source: ${csvPath}`);
  console.log(`Status: ${row.Automation_Status}\n`);

  // 1. Initial variables bag from Test_Data column, with @td() resolved
  const rawTestData = resolver.resolve(row.Test_Data);
  const variables: Record<string, string> = parseTestData(rawTestData);
  // also allow env fallback
  for (const key of Object.keys(process.env)) {
    if (variables[key] === undefined && process.env[key] !== undefined) {
      // only surface env vars on-demand via substituteEnv; don't pollute bag
    }
  }

  console.log(`Variables (initial ${Object.keys(variables).length}):`);
  for (const [k, v] of Object.entries(variables)) {
    console.log(`  ${k} = ${v.length > 80 ? v.slice(0, 77) + "..." : v}`);
  }

  // 2. Parse Steps
  const resolvedSteps = resolver.resolve(row.Steps);
  const blocks = parseSteps(resolvedSteps);
  const structuralErrors = validateStepBlocks(blocks);
  if (structuralErrors.length > 0) {
    console.log("\n❌ Step structure invalid:");
    for (const e of structuralErrors) console.log(`  · ${e}`);
    return 2;
  }
  console.log(`\nSteps parsed: ${blocks.length} blocks`);

  // 3. Execute blocks
  const operations = new Map<string, { query: string; variables: Record<string, unknown> }>();
  const responses = new Map<string, GraphQLResponse>();
  const evidenceOps: OpEvidence[] = [];
  let currentToken: string | undefined;

  for (const block of blocks) {
    try {
      await executeBlock(
        block,
        { args, backUrl, schema, tokenCache, variables, operations, responses, evidenceOps },
        (token) => (currentToken = token),
        () => currentToken
      );
    } catch (err) {
      console.log(`\n❌ Step failed: [${block.kind}] — ${(err as Error).message}`);
      return 3;
    }
  }

  // 4. Evaluate Assertions
  const resolvedAssertions = resolver.resolve(row.Assertions);
  const { assertions, info } = parseAssertions(resolvedAssertions);
  const results: AssertionResult[] = assertions.map((a) =>
    evaluateAssertion(a, responses, variables)
  );

  console.log(`\nAssertions (${results.length}):`);
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const labelPart = r.label ? `[${r.kind} label=${r.label}]` : `[${r.kind}]`;
    console.log(`  ${icon} ${labelPart}`);
    console.log(`       expected: ${r.expected}`);
    console.log(`       actual:   ${r.actual}`);
    if (r.message) console.log(`       note:     ${r.message}`);
  }

  if (info.length > 0) {
    console.log(`\nInfo-only tags (${info.length}, not evaluated in GraphQL layer):`);
    for (const i of info) console.log(`  · [${i.layer}] ${i.note}`);
  }

  // 5. Cross_Layer_Checks as informational
  const resolvedCrossLayer = resolver.resolve(row.Cross_Layer_Checks);
  const { info: crossInfo } = parseAssertions(resolvedCrossLayer);
  if (crossInfo.length > 0) {
    console.log(`\nCross_Layer_Checks (${crossInfo.length}, runner-manual for now):`);
    for (const c of crossInfo) {
      const substituted = substituteVars(c.note, variables);
      console.log(`  · [${c.layer}] ${substituted}`);
    }
  }

  // 6. Cleanup — informational for MVP (user runs the admin REST call)
  const cleanup = substituteVars(resolver.resolve(row.Cleanup), variables);
  if (cleanup && cleanup.toLowerCase() !== "none") {
    console.log(`\nCleanup (NOT automatically executed in MVP):`);
    console.log(`  ${cleanup}`);
  }

  // 7. Verdict
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const verdict = failed === 0 && results.length > 0 ? "PASS" : failed > 0 ? "FAIL" : "EMPTY";
  const summary = `\n=== Verdict: ${verdict} (${passed}/${results.length} assertions passed) ===`;
  console.log(summary);

  // 8. Write evidence
  const evidence = {
    caseId: row.ID,
    title: row.Title,
    source: csvPath,
    verdict,
    executedAt: new Date().toISOString(),
    backUrl,
    tokens: tokenCache.summary().map((t) => ({
      role: t.role,
      acquiredAt: new Date(t.acquiredAt).toISOString(),
      expiresAt: new Date(t.expiresAt).toISOString(),
    })),
    variables,
    operations: evidenceOps,
    assertions: results,
    infoAssertions: info,
    crossLayerChecks: crossInfo.map((c) => ({
      ...c,
      resolved: substituteVars(c.note, variables),
    })),
    cleanup,
  };

  if (!existsSync(args.evidenceDir)) mkdirSync(args.evidenceDir, { recursive: true });
  const evidencePath = join(
    args.evidenceDir,
    `${row.ID}-${Date.now()}.json`
  );
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");
  console.log(`\nEvidence: ${evidencePath}`);

  return verdict === "PASS" ? 0 : 1;
}

async function executeBlock(
  block: StepBlock,
  ctx: {
    args: CliArgs;
    backUrl: string;
    schema: GraphQLSchema;
    tokenCache: TokenCache;
    variables: Record<string, string>;
    operations: Map<string, { query: string; variables: Record<string, unknown> }>;
    responses: Map<string, GraphQLResponse>;
    evidenceOps: OpEvidence[];
  },
  setToken: (t: string) => void,
  getToken: () => string | undefined
): Promise<void> {
  switch (block.kind) {
    case "AUTH": {
      if (!block.role) {
        throw new Error(`[AUTH] missing role — expected [AUTH role=<alias>]`);
      }
      console.log(`\n• [AUTH role=${block.role}] acquiring token...`);
      const t0 = Date.now();
      const token = await ctx.tokenCache.getToken(block.role);
      console.log(`  token acquired (${Date.now() - t0}ms)`);
      setToken(token);
      return;
    }

    case "GQL-OP": {
      const resolvedQuery = substituteEnv(substituteVars(block.query, ctx.variables));
      const existing = ctx.operations.get(block.label);
      ctx.operations.set(block.label, {
        query: resolvedQuery,
        variables: existing?.variables ?? {},
      });
      return;
    }

    case "GQL-VARS": {
      const resolvedJson = substituteEnv(substituteVars(block.variablesJson, ctx.variables));
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(resolvedJson);
      } catch (e) {
        throw new Error(
          `[GQL-VARS ${block.label}] body is not valid JSON: ${(e as Error).message}`
        );
      }
      const existing = ctx.operations.get(block.label);
      ctx.operations.set(block.label, {
        query: existing?.query ?? "",
        variables: parsed,
      });
      return;
    }

    case "GQL-EXEC": {
      const op = ctx.operations.get(block.label);
      if (!op) {
        throw new Error(`[GQL-EXEC ${block.label}] has no matching [GQL-OP ${block.label}]`);
      }
      if (!op.query) {
        throw new Error(
          `[GQL-EXEC ${block.label}] OP block has empty query body — ` +
          `is the query/mutation body present between [GQL-OP ${block.label}] and [GQL-EXEC ${block.label}]? ` +
          `If [GQL-VARS ${block.label}] precedes the body, ensure parser back-fill is in effect (graphql-case-parser.ts).`
        );
      }

      // Validate against schema before send
      const v = validateQuery(ctx.schema, op.query);
      const schemaErrors = v.errors.map((e) => ({ code: e.code, message: e.message }));

      if (!v.valid) {
        console.log(`\n• [GQL-EXEC ${block.label}] SCHEMA INVALID — ${v.errors.length} error(s), NOT SENDING:`);
        for (const e of v.errors) console.log(`  · ${e.code}: ${e.message}`);
        ctx.evidenceOps.push({
          label: block.label,
          query: op.query,
          variables: op.variables,
          response: {
            status: 0,
            ok: false,
            data: null,
            errors: schemaErrors,
            elapsed_ms: 0,
          },
          schemaValid: false,
          schemaErrors,
        });
        // still record a synthetic response so assertions fail loudly
        ctx.responses.set(block.label, {
          status: 0,
          ok: false,
          data: null,
          errors: schemaErrors.map((e) => ({ message: `[schema] ${e.message}` })),
          rawBody: "",
          elapsed_ms: 0,
        });
        return;
      }

      if (ctx.args.dryRun) {
        console.log(`• [GQL-EXEC ${block.label}] --dry-run — skipping HTTP send`);
        ctx.evidenceOps.push({
          label: block.label,
          query: op.query,
          variables: op.variables,
          response: { status: 0, ok: true, data: null, errors: [], elapsed_ms: 0 },
          schemaValid: true,
          schemaErrors: [],
        });
        return;
      }

      console.log(`\n• [GQL-EXEC ${block.label}] POST /graphql`);
      const token = getToken();
      const response = await executeOperation(op.query, op.variables, {
        backUrl: ctx.backUrl,
        token,
      });
      console.log(
        `  ${response.status} ${response.ok ? "OK" : "ERR"} — ${response.elapsed_ms}ms — ${response.errors.length} errors`
      );
      ctx.responses.set(block.label, response);
      ctx.evidenceOps.push({
        label: block.label,
        query: op.query,
        variables: op.variables,
        response: {
          status: response.status,
          ok: response.ok,
          data: response.data,
          errors: response.errors,
          elapsed_ms: response.elapsed_ms,
        },
        schemaValid: true,
        schemaErrors: [],
      });
      return;
    }

    case "GQL-CAPTURE": {
      const response = ctx.responses.get(block.label);
      if (!response) {
        throw new Error(
          `[GQL-CAPTURE ${block.label}.${block.path}] no response recorded for label`
        );
      }
      const value = getByPath(response, block.path) ?? getByPath({ data: response.data }, block.path);
      const stringVal =
        value === null || value === undefined ? "" : String(value);
      ctx.variables[block.variable] = stringVal;
      console.log(
        `• [GQL-CAPTURE ${block.label}.${block.path} → ${block.variable}] = ${stringVal.length > 60 ? stringVal.slice(0, 57) + "..." : stringVal}`
      );
      return;
    }

    case "UNKNOWN":
      console.log(`• (skipped unknown tag: [${block.tag}])`);
      return;
  }
}

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[Number(p)];
    } else if (typeof cur === "object" && cur !== null) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.queryFile && !args.queryInline && !args.allFixtures && !args.caseRef) {
    printHelp();
    process.exit(2);
  }

  const intro = await loadOrIntrospect(args);
  const schema = buildSchema(intro);

  if (args.caseRef) {
    const backUrl = args.backUrl || process.env.BACK_URL!;
    const resolver = new TestDataResolver(TEST_DATA_DIR);
    const tokenCache = new TokenCache(TEST_DATA_DIR, { backUrl });
    const code = await runCase(args, schema, resolver, tokenCache, args.caseRef);
    process.exit(code);
  }

  let exitCode = 0;

  if (args.allFixtures) {
    const files = readdirSync(DEFAULT_FIXTURES)
      .filter((f) => f.endsWith(".graphql"))
      .sort();
    if (files.length === 0) {
      console.error(`No .graphql fixtures found under ${DEFAULT_FIXTURES}`);
      process.exit(2);
    }
    console.log(`\n=== Validating ${files.length} fixtures ===\n`);
    for (const f of files) {
      const q = readQueryFile(join(DEFAULT_FIXTURES, f));
      const r = validateQuery(schema, q);
      formatResult(basename(f), r);
      if (!r.valid) exitCode = 1;
    }
  } else {
    const query = args.queryFile
      ? readQueryFile(args.queryFile)
      : args.queryInline!;
    const label = args.queryFile ? basename(args.queryFile) : "inline query";
    const r = validateQuery(schema, query);
    formatResult(label, r);
    if (!r.valid) exitCode = 1;
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`\nFATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(3);
});
