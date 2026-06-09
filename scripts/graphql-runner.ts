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
import { resolveTestEnv } from "./lib/resolve-test-env.js";
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
  RestStep,
  RestOpStep,
} from "./lib/graphql-case-parser.js";
import {
  parseAssertions,
  evaluateAssertion,
  AssertionResult,
  InfoAssertion,
  getByPath,
} from "./lib/graphql-assertions.js";
import { GraphQLSchema } from "graphql";

// Layered, TEST_ENV-aware env load (later files override earlier; no legacy root `.env`).
// Mirrors scripts/lib/seed-common.mjs — a bare loadDotenv() reads only `.env`, which
// does not exist in this repo, so live `--case` runs would see no BACK_URL / @td() creds.
// Intentionally does NOT import config.js: the runner only needs BACK_URL + OAuth creds
// and must not be blocked by config.js's strict CORE validation of storefront-test vars.
const _TEST_ENV = resolveTestEnv("vcst");
loadDotenv({ path: ".env.defaults" });
loadDotenv({ path: `.env.${_TEST_ENV}`, override: true });
loadDotenv({ path: ".env.local", override: true });

// Per-env override promotion: any key ending in `_${TEST_ENV.toUpperCase()}` is
// promoted to its base name, so `.env.local` can carry per-env credential variants.
const _ENV_SUFFIX = `_${_TEST_ENV.toUpperCase()}`;
for (const [key, value] of Object.entries(process.env)) {
  if (key.endsWith(_ENV_SUFFIX) && value) {
    process.env[key.slice(0, -_ENV_SUFFIX.length)] = value;
  }
}

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

type CleanupResult =
  | { kind: "AUTH"; role: string; ok: true }
  | { kind: "REST"; method: string; path: string; status: number; ok: boolean }
  | { kind: string; ok: false; error: string };

interface RestResult {
  status: number;
  ok: boolean;
}

async function executeRest(
  block: RestStep,
  backUrl: string,
  token: string | undefined
): Promise<RestResult> {
  const path = block.path;
  const url = path.startsWith("http")
    ? path
    : `${backUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (block.body) headers["Content-Type"] = "application/json";

  const init: RequestInit = { method: block.method, headers };
  if (block.body && ["POST", "PUT", "PATCH", "DELETE"].includes(block.method)) {
    init.body = block.body;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  init.signal = controller.signal;
  try {
    const res = await fetch(url, init);
    return { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

interface RestOpResponse {
  status: number;
  ok: boolean;
  body: unknown;
  rawBody: string;
  elapsed_ms: number;
  errors: Array<{ message: string }>;
}

interface ParsedRestOp {
  method: string;
  url: string;
  contentType?: string;
  filePath?: string;
  fileFieldName?: string;
  fileMimeType?: string;
  fileName?: string;
  jsonBody?: string;
}

/**
 * Parse a free-form REST-OP body into method, url, headers, and body. Supports
 * the patterns used in 050i:
 *   POST {{BACK_URL}}/api/files/product-configuration
 *   Content-Type: multipart/form-data
 *   Body: file=@<local-path> (mimeType: <type>; filename: <name>)
 * The local-path may include @td() tokens which the caller has already resolved
 * before parseRestOp is called.
 */
function parseRestOp(body: string): ParsedRestOp {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
  let method = "GET";
  let url = "";
  let contentType: string | undefined;
  let filePath: string | undefined;
  let fileFieldName: string | undefined;
  let fileMimeType: string | undefined;
  let fileName: string | undefined;
  let jsonBody: string | undefined;

  for (const line of lines) {
    const requestMatch = line.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
    if (requestMatch) {
      method = requestMatch[1].toUpperCase();
      url = requestMatch[2].trim();
      continue;
    }
    const ctMatch = line.match(/^Content-Type:\s*(.+)$/i);
    if (ctMatch) {
      contentType = ctMatch[1].trim();
      continue;
    }
    if (/^Body:\s*/i.test(line)) {
      const rest = line.replace(/^Body:\s*/i, "");
      const fileMatch = rest.match(/^(\w+)=@(\S+?)(?:\s*\((.+)\))?\s*$/);
      if (fileMatch) {
        fileFieldName = fileMatch[1];
        filePath = fileMatch[2];
        const meta = fileMatch[3] || "";
        const mimeMatch = meta.match(/mimeType:\s*([^;)\s]+)/i);
        if (mimeMatch) fileMimeType = mimeMatch[1];
        const nameMatch = meta.match(/filename:\s*([^;)\s]+)/i);
        if (nameMatch) fileName = nameMatch[1];
        continue;
      }
      // Otherwise treat as JSON body
      jsonBody = rest;
    }
  }
  return {
    method,
    url,
    contentType,
    filePath,
    fileFieldName,
    fileMimeType,
    fileName,
    jsonBody,
  };
}

/**
 * Execute a REST-OP block. Supports JSON bodies and `multipart/form-data` file
 * uploads (single field). Returns a structured response object similar to the
 * GraphQL response so downstream assertion paths like `label.body.[0].url`
 * resolve correctly.
 */
async function executeRestOp(
  block: RestOpStep,
  backUrl: string,
  token: string | undefined,
  resolver: TestDataResolver,
  variables: Record<string, string>
): Promise<RestOpResponse> {
  // Resolve {{VAR}} → variables, @td() → aliases inside the body BEFORE parsing,
  // so file paths and URLs work.
  const resolvedBody = resolver.resolve(
    substituteEnv(substituteVars(block.body, variables))
  );
  const parsed = parseRestOp(resolvedBody);

  const url = parsed.url.startsWith("http")
    ? parsed.url
    : `${backUrl.replace(/\/$/, "")}${parsed.url.startsWith("/") ? parsed.url : `/${parsed.url}`}`;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let bodyInit: BodyInit | undefined;
  if (parsed.filePath) {
    const absPath = resolve(parsed.filePath);
    if (!existsSync(absPath)) {
      throw new Error(`[REST-OP ${block.label}] file not found: ${absPath}`);
    }
    const fileBytes = readFileSync(absPath);
    const blob = new Blob([new Uint8Array(fileBytes)], {
      type: parsed.fileMimeType || "application/octet-stream",
    });
    const form = new FormData();
    form.append(
      parsed.fileFieldName || "file",
      blob,
      parsed.fileName || basename(absPath)
    );
    bodyInit = form;
    // Don't set Content-Type — fetch will populate the correct multipart boundary
  } else if (parsed.jsonBody) {
    headers["Content-Type"] = parsed.contentType || "application/json";
    bodyInit = parsed.jsonBody;
  } else if (parsed.contentType) {
    headers["Content-Type"] = parsed.contentType;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: parsed.method,
      headers,
      body: bodyInit,
      signal: controller.signal,
    });
    const rawBody = await res.text();
    const elapsed_ms = Date.now() - t0;
    let body: unknown = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }
    return {
      status: res.status,
      ok: res.ok,
      body,
      rawBody,
      elapsed_ms,
      errors: res.ok ? [] : [{ message: `HTTP ${res.status}: ${rawBody.slice(0, 200)}` }],
    };
  } finally {
    clearTimeout(timer);
  }
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
  const restOpBodies = new Map<string, string>();
  const restResponses = new Map<string, RestOpResponse>();
  const evidenceOps: OpEvidence[] = [];
  const nullCaptures: string[] = [];
  const schemaRef: SchemaRef = { current: schema, refreshAttempted: false, refreshed: false };
  let currentToken: string | undefined;

  for (const block of blocks) {
    try {
      await executeBlock(
        block,
        {
          args,
          backUrl,
          schemaRef,
          tokenCache,
          variables,
          operations,
          responses,
          restOpBodies,
          restResponses,
          resolver,
          evidenceOps,
          nullCaptures,
        },
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

  if (nullCaptures.length > 0) {
    console.log(`\nNull captures (${nullCaptures.length}, downstream substitutions will be empty):`);
    for (const c of nullCaptures) console.log(`  ⚠ ${c}`);
  }

  // 6. Verdict (computed BEFORE cleanup so cleanup outcome cannot mask it)
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const verdict = failed === 0 && results.length > 0 ? "PASS" : failed > 0 ? "FAIL" : "EMPTY";
  const summary = `\n=== Verdict: ${verdict} (${passed}/${results.length} assertions passed) ===`;
  console.log(summary);

  // 7. Cleanup — best-effort runner-native [REST]/[AUTH] execution.
  // Failures are recorded in evidence but never alter the verdict.
  const cleanupRaw = resolver.resolve(row.Cleanup);
  const cleanupSubstituted = substituteEnv(substituteVars(cleanupRaw, variables));
  const cleanupBlocks =
    cleanupSubstituted && cleanupSubstituted.trim().toLowerCase() !== "none"
      ? parseSteps(cleanupSubstituted)
      : [];
  const cleanupResults: CleanupResult[] = [];
  if (cleanupBlocks.length > 0) {
    console.log(`\nCleanup (${cleanupBlocks.length} block(s), best-effort):`);
    let cleanupToken: string | undefined;
    for (const block of cleanupBlocks) {
      try {
        if (block.kind === "AUTH") {
          if (!block.role) {
            throw new Error("[AUTH] missing role");
          }
          cleanupToken = await tokenCache.getToken(block.role);
          cleanupResults.push({ kind: "AUTH", role: block.role, ok: true });
          console.log(`  • [AUTH role=${block.role}] token acquired`);
        } else if (block.kind === "REST") {
          const result = await executeRest(block, backUrl, cleanupToken);
          cleanupResults.push({
            kind: "REST",
            method: block.method,
            path: block.path,
            status: result.status,
            ok: result.ok,
          });
          console.log(
            `  • [REST ${block.method} ${block.path}] → ${result.status} ${result.ok ? "OK" : "ERR"}`
          );
        } else {
          // Skip GQL-* / UNKNOWN inside Cleanup — out of scope for best-effort cleanup
          console.log(`  • (skipped non-cleanup block: [${block.kind}])`);
        }
      } catch (err) {
        const message = (err as Error).message;
        cleanupResults.push({ kind: block.kind, ok: false, error: message });
        console.log(`  • cleanup block [${block.kind}] failed (suppressed): ${message}`);
      }
    }
  }

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
    nullCaptures,
    schemaRefreshed: schemaRef.refreshed,
    operations: evidenceOps,
    assertions: results,
    infoAssertions: info,
    crossLayerChecks: crossInfo.map((c) => ({
      ...c,
      resolved: substituteVars(c.note, variables),
    })),
    cleanup: {
      raw: cleanupRaw,
      blocks: cleanupResults,
    },
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

interface SchemaRef {
  current: GraphQLSchema;
  refreshAttempted: boolean;
  refreshed: boolean;
}

const SCHEMA_MISMATCH_CODES = new Set(["DV-006", "DV-008", "DV-009", "DV-010"]);

async function executeBlock(
  block: StepBlock,
  ctx: {
    args: CliArgs;
    backUrl: string;
    schemaRef: SchemaRef;
    tokenCache: TokenCache;
    variables: Record<string, string>;
    operations: Map<string, { query: string; variables: Record<string, unknown> }>;
    responses: Map<string, GraphQLResponse>;
    restOpBodies: Map<string, string>;
    restResponses: Map<string, RestOpResponse>;
    resolver: TestDataResolver;
    evidenceOps: OpEvidence[];
    nullCaptures: string[];
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

      // Validate against schema before send.
      // If validation fails with schema-mismatch codes and we haven't yet
      // tried, refresh the introspection cache and re-validate once. This
      // catches stale-cache symptoms after a backend deploy without forcing
      // every run to refresh.
      let v = validateQuery(ctx.schemaRef.current, op.query);
      if (
        !v.valid &&
        !ctx.schemaRef.refreshAttempted &&
        v.errors.some((e) => SCHEMA_MISMATCH_CODES.has(e.code))
      ) {
        ctx.schemaRef.refreshAttempted = true;
        console.log(
          `  ! schema-mismatch detected (${v.errors[0].code}); refreshing introspection cache once`
        );
        try {
          const intro = await introspect({ backUrl: ctx.backUrl });
          saveSchemaCache(intro, ctx.args.schemaCache);
          ctx.schemaRef.current = buildSchema(intro);
          ctx.schemaRef.refreshed = true;
          v = validateQuery(ctx.schemaRef.current, op.query);
          if (v.valid) {
            console.log(`  ✓ revalidated against fresh schema — proceeding`);
          }
        } catch (refreshErr) {
          console.log(
            `  ! schema refresh failed (${(refreshErr as Error).message}); using cached schema verdict`
          );
        }
      }
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
      // Substitute {{VAR}} placeholders in the path so chained captures like
      // items[?id={{LINE_ITEM_ID_B}}].listPrice.amount resolve correctly.
      const resolvedPath = substituteEnv(substituteVars(block.path, ctx.variables));
      // Unified getByPath strips a leading "data." and walks from response.data.
      // It also supports JSONPath-style filters: foo[?key=value]
      const value = getByPath(response.data, resolvedPath);
      const isMissing = value === null || value === undefined;
      const stringVal = isMissing ? "" : String(value);
      ctx.variables[block.variable] = stringVal;
      if (isMissing) {
        const reason = value === null ? "null" : "undefined";
        ctx.nullCaptures.push(
          `${block.label}.${block.path} → ${block.variable} (${reason})`
        );
        console.log(
          `⚠ [GQL-CAPTURE ${block.label}.${block.path} → ${block.variable}] = ${reason} (stored as empty string; downstream {{${block.variable}}} substitutions will be empty)`
        );
      } else {
        console.log(
          `• [GQL-CAPTURE ${block.label}.${block.path} → ${block.variable}] = ${stringVal.length > 60 ? stringVal.slice(0, 57) + "..." : stringVal}`
        );
      }
      return;
    }

    case "REST-OP": {
      // Defer body resolution + execution until matching [REST-EXEC <label>]
      ctx.restOpBodies.set(block.label, block.body);
      return;
    }

    case "REST-EXEC": {
      const body = ctx.restOpBodies.get(block.label);
      if (body === undefined) {
        throw new Error(
          `[REST-EXEC ${block.label}] has no matching [REST-OP ${block.label}]`
        );
      }
      console.log(`\n• [REST-EXEC ${block.label}] firing REST request`);
      const token = getToken();
      const restResp = await executeRestOp(
        { kind: "REST-OP", label: block.label, body, raw: "" },
        ctx.backUrl,
        token,
        ctx.resolver,
        ctx.variables
      );
      ctx.restResponses.set(block.label, restResp);
      // Also expose under the GraphQL-response Map so existing assertion machinery
      // (parseAssertions kind=ERRORS/DATA with label=<rest_label>) can read it.
      // Shape: GraphQLResponse-compatible — `data` is unused, `errors` mirrors REST-derived errors,
      // and authors reference `<label>.body.…` paths via getByPath against this object's data.body.
      ctx.responses.set(block.label, {
        status: restResp.status,
        ok: restResp.ok,
        data: { body: restResp.body, status: restResp.status },
        errors: restResp.errors,
        rawBody: restResp.rawBody,
        elapsed_ms: restResp.elapsed_ms,
      });
      console.log(`  ${restResp.status} ${restResp.ok ? "OK" : "ERR"} — ${restResp.elapsed_ms}ms`);
      return;
    }

    case "REST-CAPTURE": {
      const restResp = ctx.restResponses.get(block.label);
      if (!restResp) {
        throw new Error(
          `[REST-CAPTURE ${block.label}.${block.path}] no REST response recorded for label`
        );
      }
      // Normalize the path: strip a leading "body." if present so authors can
      // write either "body.[0].url" or "[0].url" — getByPath operates on body.
      // Also substitute {{VAR}} placeholders so chained captures work.
      const resolvedRestPath = substituteEnv(substituteVars(block.path, ctx.variables));
      const stripped = resolvedRestPath.startsWith("body.") ? resolvedRestPath.slice(5) : resolvedRestPath;
      const value = getByPath(restResp.body, stripped);
      const isMissing = value === null || value === undefined;
      const stringVal = isMissing ? "" : String(value);
      ctx.variables[block.variable] = stringVal;
      if (isMissing) {
        const reason = value === null ? "null" : "undefined";
        ctx.nullCaptures.push(
          `${block.label}.${block.path} → ${block.variable} (${reason}, REST)`
        );
        console.log(
          `⚠ [REST-CAPTURE ${block.label}.${block.path} → ${block.variable}] = ${reason}`
        );
      } else {
        console.log(
          `• [REST-CAPTURE ${block.label}.${block.path} → ${block.variable}] = ${stringVal.length > 60 ? stringVal.slice(0, 57) + "..." : stringVal}`
        );
      }
      return;
    }

    case "REST": {
      const path = substituteEnv(substituteVars(block.path, ctx.variables));
      const body = block.body
        ? substituteEnv(substituteVars(block.body, ctx.variables))
        : undefined;
      const resolvedBlock: RestStep = { ...block, path, body };
      const token = getToken();
      console.log(`\n• [REST ${block.method} ${path}]`);
      const result = await executeRest(resolvedBlock, ctx.backUrl, token);
      console.log(`  ${result.status} ${result.ok ? "OK" : "ERR"}`);
      if (!result.ok) {
        throw new Error(
          `[REST ${block.method} ${path}] returned HTTP ${result.status}`
        );
      }
      return;
    }

    case "UNKNOWN":
      console.log(`• (skipped unknown tag: [${block.tag}])`);
      return;
  }
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
