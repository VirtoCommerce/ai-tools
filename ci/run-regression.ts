import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { TestDataResolver } from "../scripts/lib/test-data-resolver.js";
import { resolveTestEnv } from "../scripts/lib/resolve-test-env.js";
import { mergeHistoryRows, type RunEntry } from "../scripts/lib/regression-triage.js";
import { extractExistingIds } from "../scripts/test-cases/append-test-cases-to-suite.ts";
import {
  budgetFor,
  exitCodeFor,
  globalBudgetFor,
  isNotAttempted,
  isTruncated,
  maxTurnsFor,
  minutesOf,
  statusFromSdkSubtype,
  timeoutMsFor,
  type SuiteStatus,
} from "./lib/suite-caps.ts";
import {
  BudgetLedger,
  runLanePool,
  type LaneKind,
  type PoolSlot,
  type SchedulableSuite,
} from "./lib/scheduler.ts";
import { materializeLaneMcp } from "./lib/lane-mcp.ts";
import { formatPreflightProblems, preflightManifest, type PreflightSuite } from "./lib/manifest-preflight.ts";
import { runDeterministicSuite } from "./lib/deterministic-lane.ts";
import { classifyLane, type LaneClassifiable } from "./lib/lane-classifier.ts";
import { buildRunPlan, formatRunPlan } from "./lib/run-plan.ts";
import { loadManifest, resolveSelection, selectionNames } from "./lib/suite-manifest.ts";

// --- Configuration from environment variables ---
//
// MAX_BUDGET_USD / MAX_TURNS / SUITE_TIMEOUT_MS are now OVERRIDES, not defaults. Left unset
// (the new workflow default), each is derived per suite from manifest data by
// `ci/lib/suite-caps.ts`. The old globals were arithmetically unable to run the corpus:
// 100 turns against suite 078's 115 cases, a 10-minute timeout against its 83-minute
// estimate, and $80 against `full`'s ~$111 need.

const SUITE_SELECTION = process.env.SUITE_SELECTION || "smoke";
/** Override for the derived global budget. Unset => derived from the selection's estimates. */
const MAX_BUDGET_USD_OVERRIDE = process.env.MAX_BUDGET_USD ? parseFloat(process.env.MAX_BUDGET_USD) : null;
/** Override for the derived per-suite turn cap. Unset => derived from testCount. */
const MAX_TURNS_OVERRIDE = process.env.MAX_TURNS ? parseInt(process.env.MAX_TURNS, 10) : null;
const TEST_ENVIRONMENT = process.env.TEST_ENVIRONMENT || "qa";
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";

/**
 * Run identifier and directory, in the SAME shape the interactive path uses
 * (`reports/regression/{RUN_ID}/`). CI previously wrote `reports/regression/ci-{date}/` with a
 * different layout entirely, so `resolveRunDir`, `readRunSuites`, the HTML reporter and the
 * triage collector could none of them read a CI run. Minute precision so two runs on one day
 * do not collide.
 */
const RUN_ID = `CI-${new Date().toISOString().slice(0, 10)}-${new Date()
  .toISOString()
  .slice(11, 16)
  .replace(":", "")}`;
const RUN_DIR = join("reports", "regression", RUN_ID);

// --- Environment URLs ---
//
// URLs are env-driven — config.js loads FRONT_URL/BACK_URL from .env.${TEST_ENV}.
// NEVER hardcode a specific customer environment (e.g. vcst-qa) here: TEST_ENVIRONMENT
// only selects WHICH env-var pair to read; the values always come from the target
// TEST_ENV's config. Missing vars are caught by validateEnv() below.
// Resolves process.env.TEST_ENV > .env.test-env (team/per-dev default) > 'vcst'.
const TEST_ENV = resolveTestEnv("vcst");

const ENV_URLS: Record<string, { front: string; back: string }> = {
  qa: {
    front: process.env.FRONT_URL || "",
    back: process.env.BACK_URL || "",
  },
  staging: {
    front: process.env.VIRTO_START_FRONT || process.env.FRONT_URL || "",
    back: process.env.VIRTO_START_BACK || process.env.BACK_URL || "",
  },
};

// --- Suite configuration (loaded from config/test-suites.json) ---
//
// The manifest types, selection expansion and multi-env filters now live in
// `ci/lib/suite-manifest.ts`, shared with `scripts/regression/plan-run.ts`. They used to be a
// local copy here, which meant the plan an operator was shown and the selection a run actually
// executed were computed by two different pieces of code — and a plan that disagrees with its own
// run is worse than no plan.

/**
 * What the runner needs to know about a suite. Previously this carried only
 * `file`/`agent`/`description` — everything else the manifest already knew (testCount,
 * estimatedMinutes, concern, runner, ...) was thrown away at SUITE_MAP build time, which is
 * precisely WHY every cap had to be a global constant. Carrying the manifest data through is
 * what makes per-suite derivation possible.
 */
export interface SuiteConfig {
  file: string;
  agent: string;
  description: string;
  testCount: number;
  estimatedMinutes: number;
  concern: string;
  layer: string;
  priority: string;
  tags: string[];
  runner?: string;
  runnerCommand?: string;
  preferredBrowser?: string;
  /** Derived at manifest-sync time: the suite clicks, so it must never land on firefox. */
  clickDriven?: boolean;
}

const manifest = loadManifest();

// Test data resolver — resolves @td() references in suite CSVs
const testDataResolver = new TestDataResolver(join(process.cwd(), "test-data"));

// Build SUITE_MAP dynamically from manifest
const SUITE_MAP: Record<string, SuiteConfig> = {};
for (const suite of manifest.suites) {
  SUITE_MAP[suite.id] = {
    file: suite.file.replace(/^regression\/suites\//, ""),
    agent: suite.agent,
    description: suite.name,
    testCount: suite.testCount,
    estimatedMinutes: suite.estimatedMinutes,
    concern: suite.concern,
    layer: suite.layer,
    priority: suite.priority,
    tags: suite.tags ?? [],
    runner: suite.runner,
    runnerCommand: suite.runnerCommand,
    preferredBrowser: suite.preferredBrowser,
    clickDriven: suite.clickDriven,
  };
}

// --- MCP server configuration ---
//
// There is deliberately NO shared `mcpServers` const any more. One config for every
// concurrent suite meant three writers on `./test-results/chrome/trace.har` and one output
// directory, so HAR archives and failure screenshots could belong to the wrong suite.
// `materializeLaneMcp(laneId)` (ci/lib/lane-mcp.ts) writes a lane-scoped copy of the
// committed template instead. Raising MAX_PARALLEL depends on this.

// --- Validate required environment variables ---
function validateEnv(): void {
  const required = ["ANTHROPIC_API_KEY"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  // URLs are mandatory now that there is no hardcoded env fallback — resolve the
  // pair for the selected TEST_ENVIRONMENT and fail loudly if the target env's
  // config (.env.${TEST_ENV}) didn't supply them.
  const urls = ENV_URLS[TEST_ENVIRONMENT] || ENV_URLS.qa;
  if (!urls.front || !urls.back) {
    console.error(
      `Missing URLs for TEST_ENV="${TEST_ENV}" (TEST_ENVIRONMENT="${TEST_ENVIRONMENT}"): ` +
        `set FRONT_URL and BACK_URL in .env.${TEST_ENV} (or VIRTO_START_FRONT/VIRTO_START_BACK for staging). ` +
        `These are no longer defaulted to any specific environment.`
    );
    process.exit(1);
  }

  const recommended = ["USER_EMAIL", "USER_PASSWORD", "ADMIN", "ADMIN_PASSWORD", "STORE_ID"];
  const missingRec = recommended.filter((v) => !process.env[v]);
  if (missingRec.length > 0) {
    console.warn(`Warning: Missing recommended env vars (tests may fail): ${missingRec.join(", ")}`);
  }
}


// --- Resolve suites from selection string ---

/**
 * Thin wrapper over the shared resolver: it reports problems, this decides to die on them.
 * Identical selection semantics to `npm run regression:plan`, by construction.
 */
function resolveSuites(selection: string): string[] {
  const resolved = resolveSelection(manifest, selection);

  if (resolved.unknownIds.length > 0) {
    console.error(`Unknown suite ID(s): ${resolved.unknownIds.join(", ")}`);
    console.error(`Valid selections: ${selectionNames(manifest).join(", ")}`);
    console.error(`Valid suite IDs: ${Object.keys(SUITE_MAP).join(", ")}`);
    process.exit(1);
  }

  if (resolved.skipped.length > 0) {
    console.log(`[multi-env-filter] Skipped ${resolved.skipped.length} suite(s):`);
    for (const s of resolved.skipped) console.log(`  - ${s.id}: ${s.reason}`);
  }
  console.log(`[multi-env-filter] ${resolved.filterSummary}`);

  return resolved.ids;
}

// --- Build the prompt for a suite ---

function buildPrompt(opts: {
  suiteId: string;
  suiteCsvPath: string;
  caseCount: number;
  outputFile: string;
  casesJsonl: string;
  laneId: string;
  agentInstructions: string;
}): string {
  const { suiteId, suiteCsvPath, caseCount, outputFile, casesJsonl, laneId, agentInstructions } = opts;
  const urls = ENV_URLS[TEST_ENVIRONMENT] || ENV_URLS.qa;
  const date = new Date().toISOString().slice(0, 10);

  return `# CI Regression Test Execution

## Run Configuration
- **Run ID:** ${RUN_ID}
- **Suite:** ${suiteId}
- **Lane:** ${laneId}
- **Date:** ${date}
- **Environment:** ${TEST_ENVIRONMENT}
- **Frontend URL:** ${urls.front}
- **Backend URL:** ${urls.back}

## Credentials (from environment)
- **ADMIN:** ${process.env.ADMIN || "(not set)"}
- **ADMIN_PASSWORD:** ${process.env.ADMIN_PASSWORD || "(not set)"}
- **USER_EMAIL:** ${process.env.USER_EMAIL || "(not set)"}
- **USER_PASSWORD:** ${process.env.USER_PASSWORD || "(not set)"}
- **USER2_EMAIL:** ${process.env.USER2_EMAIL || "(not set)"}
- **USER2_PASSWORD:** ${process.env.USER2_PASSWORD || "(not set)"}
- **STORE_ID:** ${process.env.STORE_ID || "(not set)"}

## Payment Test Data (from environment)
- **SKYFLOW_VISA:** ${process.env.SKYFLOW_VISA || "(not set)"}
- **SKYFLOW_MASTERCARD:** ${process.env.SKYFLOW_MASTERCARD || "(not set)"}
- **SKYFLOW_EXPIRY:** ${process.env.SKYFLOW_EXPIRY || "(not set)"}
- **SKYFLOW_CVV:** ${process.env.SKYFLOW_CVV || "(not set)"}
- **CYBERSOURCE_CARD:** ${process.env.CYBERSOURCE_CARD || "(not set)"}
- **CYBERSOURCE_EXPIRY:** ${process.env.CYBERSOURCE_EXPIRY || "(not set)"}
- **CYBERSOURCE_CVV:** ${process.env.CYBERSOURCE_CVV || "(not set)"}
- **AUTHORIZNET_CARD:** ${process.env.AUTHORIZNET_CARD || "(not set)"}
- **AUTHORIZNET_EXPIRY:** ${process.env.AUTHORIZNET_EXPIRY || "(not set)"}
- **AUTHORIZNET_CVV:** ${process.env.AUTHORIZNET_CVV || "(not set)"}
- **DATATRANCE_MASTERCARD:** ${process.env.DATATRANCE_MASTERCARD || "(not set)"}
- **DATATRANCE_EXPIRY:** ${process.env.DATATRANCE_EXPIRY || "(not set)"}
- **DATATRANCE_CVV:** ${process.env.DATATRANCE_CVV || "(not set)"}
- **DATATRANCE_OTP:** ${process.env.DATATRANCE_OTP || "(not set)"}

## Agent Instructions
${agentInstructions}

## Test Cases to Execute

The suite CSV has ALREADY been resolved (every \`@td()\` token substituted) and written to disk:

- **Suite CSV:** \`${suiteCsvPath}\`
- **Cases:** ${caseCount}

**Read that file ONCE with the \`Read\` tool, then execute its cases in order.** Do not ask for
the CSV to be pasted; do not re-read it between cases. For a large suite, read it in windows
with \`offset\`/\`limit\` rather than loading the whole file — the accessibility snapshots you
take during execution are what your context is for.

## Preflight — MANDATORY before each case

Each row's \`Preconditions\` cell may carry \`[PRE:*]\` tags. Execute them, in the order written,
before the case's steps. They are the mechanism that stops one case contaminating the next —
a run that skips them produces BLOCKED cascades that look like product failures. The seven
primitives and their live-verified selectors are defined in
\`.claude/knowledge/execution/test-execution-preflight.md\`; read it on demand when a tag is
unfamiliar. A \`[PRE:*]\` failure makes the case **BLOCKED** (except \`[PRE:RESET_CART]\`, which
warns), never FAIL and never PASS.

## Results contract — you MUST write these files

1. **Per-case, append-only** — after finishing each case, append ONE line of JSON to
   \`${casesJsonl}\`:

   \`\`\`
   {"id":"CART-002","status":"PASS","durationMs":41230,"notes":"","evidence":[]}
   \`\`\`

   \`status\` is one of \`PASS\` / \`FAIL\` / \`BLOCKED\` / \`SKIPPED\`. \`durationMs\` is that case's own
   elapsed time. Append — never rewrite the file, never buffer to the end.

2. **Once, at the end** — write the envelope to \`${outputFile}\`:

   \`\`\`json
   {
     "runId": "${RUN_ID}",
     "suiteId": "${suiteId}",
     "lane": "${laneId}",
     "startedAt": "<ISO>",
     "completedAt": "<ISO>",
     "total": ${caseCount},
     "passed": 0, "failed": 0, "blocked": 0, "skipped": 0,
     "testCases": [ { "id": "...", "status": "PASS", "durationMs": 0, "notes": "", "evidence": [] } ]
   }
   \`\`\`

   Counts must be recomputed from \`testCases\`, not tallied as you go.

## Execution Rules
1. Navigate to the Frontend URL above using the Playwright MCP browser
2. For each test case: run its \`[PRE:*]\` preflight, execute the steps, verify the assertions,
   screenshot on failure, append the JSONL line
3. **BLOCKED is not FAIL.** BLOCKED = the case could not be executed (unmet precondition, env
   or data problem). FAIL = it executed and the assertion did not hold. Never report a case
   you did not actually run as PASS
4. Write the envelope, then reply with ONLY the envelope path and a one-line status

## Important
- Use \`browser_navigate\` to open pages
- Use \`browser_snapshot\` to inspect page structure
- Use \`browser_click\` and \`browser_fill\` for interactions
- Use \`browser_take_screenshot\` to capture evidence on failures
- Use \`browser_console_messages\` to check for JavaScript errors
- This is a headless CI environment - no human interaction available
- Keep your final reply short: the detail belongs in the results files, not the transcript
`;
}

// --- Suite result type ---

interface SuiteCaseCounts {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
}

interface SuiteResult {
  suiteId: string;
  description: string;
  status: SuiteStatus;
  lane: LaneKind;
  result?: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  errors?: string[];
  /** Read back from the agent's own envelope when it wrote one; absent otherwise. */
  cases?: SuiteCaseCounts;
}

// --- Timeout ---
//
// `SUITE_TIMEOUT_MS` is now an OVERRIDE; unset, each suite's timeout is derived from its
// manifest estimate (`timeoutMsFor`). The old fixed 10 minutes killed suite 078 at 12% of
// its expected duration.
//
// The old `withTimeout` only rejected a `Promise.race` — it never cancelled the underlying
// `query()`, so the MCP browser subprocess and the API stream kept running and kept
// spending after the "timeout", and the catch branch reported `costUsd: 0`. That made
// `totalCost` under-count every timed-out suite, so the global budget guard was reading a
// number it knew was wrong. Cancellation now goes through the SDK's own
// `Options.abortController`.

const SUITE_TIMEOUT_MS_OVERRIDE = process.env.SUITE_TIMEOUT_MS
  ? parseInt(process.env.SUITE_TIMEOUT_MS, 10)
  : null;

/** Race a promise against a timeout, aborting the controller when the timeout wins. */
async function withCancellableTimeout<T>(
  work: Promise<T>,
  ms: number,
  controller: AbortController,
  label: string,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;

  // Swallow a rejection that arrives AFTER the race has already settled. Aborting the
  // controller makes the in-flight `query()` generator reject, and by then nobody is awaiting
  // `work` any more — an unhandled rejection would take the whole runner down and lose every
  // other lane's results. Rejections that arrive BEFORE the timeout still propagate.
  const guarded = work.then(
    (value) => ({ timedOut: false as const, value }),
    (error: unknown) => {
      if (timedOut) return { timedOut: true as const };
      throw error;
    },
  );

  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      console.warn(`  ${label}: timeout after ${Math.round(ms / 1000)}s — aborting the query`);
      controller.abort();
      resolve({ timedOut: true });
    }, ms);
  });

  try {
    return await Promise.race([guarded, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// --- Run a single suite ---

/** Case count without a strict CSV parse — reuses the canonical parser-independent scanner,
 *  so a pre-existing quoting irregularity in an unrelated field cannot break the count. */
function countCaseRows(csv: string): number {
  return extractExistingIds(csv).size;
}

/** Resolve @td() once and write the suite CSV where the agent can Read it. */
function writeResolvedSuiteCsv(suiteId: string, rawCSV: string): { path: string; caseCount: number } {
  const resolved = testDataResolver.resolveCSV(rawCSV);
  mkdirSync(RUN_DIR, { recursive: true });
  const path = join(RUN_DIR, `suite-${suiteId}-resolved.csv`);
  writeFileSync(path, resolved, "utf-8");
  return { path, caseCount: countCaseRows(resolved) };
}

/**
 * Read back the envelope the agent was asked to write. Falls back to folding the append-only
 * JSONL when the envelope is missing or unparseable — a suite that ran but died before its
 * final write still yields real per-case counts instead of nothing.
 */
function readCaseCounts(suiteId: string): SuiteCaseCounts | undefined {
  const tally = (statuses: readonly string[]): SuiteCaseCounts => ({
    total: statuses.length,
    passed: statuses.filter((s) => s === "PASS").length,
    failed: statuses.filter((s) => s === "FAIL").length,
    blocked: statuses.filter((s) => s === "BLOCKED").length,
    skipped: statuses.filter((s) => s === "SKIPPED").length,
  });

  const envelopePath = join(RUN_DIR, `suite-${suiteId}-results.json`);
  if (existsSync(envelopePath)) {
    try {
      const parsed = JSON.parse(readFileSync(envelopePath, "utf-8")) as {
        testCases?: Array<{ status?: string }>;
      };
      if (Array.isArray(parsed.testCases)) {
        // Recompute from the rows: the agent's own counts are not trusted.
        return tally(parsed.testCases.map((c) => String(c.status ?? "")));
      }
    } catch {
      /* fall through to the JSONL */
    }
  }

  const jsonlPath = join(RUN_DIR, `suite-${suiteId}-cases.jsonl`);
  if (existsSync(jsonlPath)) {
    const statuses: string[] = [];
    for (const line of readFileSync(jsonlPath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        statuses.push(String((JSON.parse(line) as { status?: string }).status ?? ""));
      } catch {
        /* a torn last line is expected on a hard kill; skip it */
      }
    }
    if (statuses.length > 0) return tally(statuses);
  }

  return undefined;
}

/** The deterministic lane: a manifest-declared runner, no agent, no browser slot, no budget. */
async function runDeterministic(suiteId: string, config: SuiteConfig): Promise<SuiteResult> {
  const timeoutMs = SUITE_TIMEOUT_MS_OVERRIDE ?? timeoutMsFor(config);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Starting Suite ${suiteId} (deterministic): ${config.description}`);
  console.log(`Runner: ${config.runner} | Command: ${config.runnerCommand} | Timeout: ${Math.round(timeoutMs / 60000)}m`);
  console.log(`${"=".repeat(60)}\n`);

  const outcome = await runDeterministicSuite({
    suiteId,
    runnerCommand: config.runnerCommand ?? "",
    timeoutMs,
    env: { RUN_ID },
    onLine: (line) => console.log(`  [${suiteId}] ${line}`),
  });

  const status: SuiteStatus = outcome.status === "timeout" ? "timeout" : outcome.status;
  console.log(`\n  Suite ${suiteId} finished: ${status} (exit ${outcome.exitCode ?? "n/a"})`);

  return {
    suiteId,
    description: config.description,
    status,
    lane: "deterministic",
    result: outcome.outputTail || undefined,
    costUsd: 0,
    durationMs: outcome.durationMs,
    numTurns: 0,
    errors: outcome.errors,
    cases: readCaseCounts(suiteId),
  };
}

/** The agent lane: an LLM drives the browser through the suite. */
async function runAgentSuite(
  suiteId: string,
  config: SuiteConfig,
  lane: LaneKind,
  slot: PoolSlot,
  budgetUsd: number,
): Promise<SuiteResult> {
  const startTime = Date.now();

  const suitePath = join("regression", "suites", config.file);
  const rawCSV = readFileSync(suitePath, "utf-8");
  const { path: resolvedPath, caseCount } = writeResolvedSuiteCsv(suiteId, rawCSV);

  const agentInstructions = readFileSync(join("ci", "agents", `${config.agent}.md`), "utf-8");

  const outputFile = join(RUN_DIR, `suite-${suiteId}-results.json`);
  const casesJsonl = join(RUN_DIR, `suite-${suiteId}-cases.jsonl`);
  const laneId = slot.id;

  const prompt = buildPrompt({
    suiteId,
    suiteCsvPath: resolvedPath,
    caseCount,
    outputFile,
    casesJsonl,
    laneId,
    agentInstructions,
  });

  const maxTurns = MAX_TURNS_OVERRIDE ?? maxTurnsFor(config);
  const timeoutMs = SUITE_TIMEOUT_MS_OVERRIDE ?? timeoutMsFor(config);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Starting Suite ${suiteId}: ${config.description}`);
  console.log(`Agent: ${config.agent} | Lane: ${laneId} | Model: ${MODEL}`);
  console.log(
    `Cases: ${caseCount} | Turns: ${maxTurns} | Timeout: ${Math.round(timeoutMs / 60000)}m | Budget: $${budgetUsd.toFixed(2)}`,
  );
  console.log(`CSV: ${resolvedPath} (path handed to the agent, NOT inlined)`);
  console.log(`${"=".repeat(60)}\n`);

  // Accrued cost lives OUTSIDE the try, so an abort or a throw still reports what was
  // actually spent instead of 0.
  let accruedCostUsd = 0;
  let numTurns = 0;
  const controller = new AbortController();
  const mcpServers = materializeLaneMcp(laneId);

  try {
    const runQuery = async (): Promise<SuiteResult | null> => {
      let resultMessage: SuiteResult | null = null;

      for await (const message of query({
        prompt,
        options: {
          model: MODEL,
          mcpServers,
          abortController: controller,
          allowedTools: [
            "mcp__playwright-chrome__browser_navigate",
            "mcp__playwright-chrome__browser_click",
            "mcp__playwright-chrome__browser_fill",
            "mcp__playwright-chrome__browser_type",
            "mcp__playwright-chrome__browser_take_screenshot",
            "mcp__playwright-chrome__browser_snapshot",
            "mcp__playwright-chrome__browser_console_messages",
            "mcp__playwright-chrome__browser_network_requests",
            "mcp__playwright-chrome__browser_evaluate",
            "mcp__playwright-chrome__browser_wait_for",
            "mcp__playwright-chrome__browser_hover",
            "mcp__playwright-chrome__browser_select_option",
            "mcp__playwright-chrome__browser_press_key",
            "mcp__playwright-chrome__browser_close",
            "mcp__playwright-chrome__browser_tabs",
            "mcp__playwright-chrome__browser_fill_form",
            "mcp__playwright-chrome__browser_navigate_back",
            "mcp__playwright-chrome__browser_handle_dialog",
            "mcp__playwright-chrome__browser_resize",
            "mcp__playwright-chrome__browser_drag",
            "Read",
            "Glob",
            "Grep",
            // Write is REQUIRED for the per-case results contract. Without it the sub-agent
            // has no tool that can create suite-*-results.json, which is why CI mode could
            // only ever report a suite-level status — the dashboard, readRunSuites,
            // appendSuiteHistory and the triage collector all had nothing to read.
            "Write",
          ],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns,
          maxBudgetUsd: budgetUsd,
        },
      })) {
        if (message.type === "system" && message.subtype === "init") {
          console.log(`  Session: ${message.session_id}`);
          console.log(`  Model: ${message.model}`);
          console.log(`  MCP Servers: ${message.mcp_servers.map((s) => `${s.name}(${s.status})`).join(", ")}`);
        }

        if (message.type === "result") {
          accruedCostUsd = message.total_cost_usd;
          numTurns = message.num_turns;
          const duration = Date.now() - startTime;
          resultMessage = {
            suiteId,
            description: config.description,
            status: statusFromSdkSubtype(message.subtype),
            lane,
            result: message.subtype === "success" ? message.result : undefined,
            costUsd: message.total_cost_usd,
            durationMs: duration,
            numTurns: message.num_turns,
            errors: "errors" in message ? (message.errors as string[] | undefined) : undefined,
          };
        }
      }

      return resultMessage;
    };

    const raced = await withCancellableTimeout(runQuery(), timeoutMs, controller, `Suite ${suiteId}`);

    if (raced.timedOut) {
      return {
        suiteId,
        description: config.description,
        status: "timeout",
        lane,
        costUsd: accruedCostUsd,
        durationMs: Date.now() - startTime,
        numTurns,
        errors: [`Timed out after ${Math.round(timeoutMs / 1000)}s (query aborted)`],
        cases: readCaseCounts(suiteId),
      };
    }

    if (raced.value) {
      const result = { ...raced.value, cases: readCaseCounts(suiteId) };
      console.log(`\n  Suite ${suiteId} finished: ${result.status}`);
      console.log(
        `  Cost: $${result.costUsd.toFixed(4)} | Turns: ${result.numTurns}/${maxTurns} | Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
      );
      if (result.cases) {
        console.log(
          `  Cases: ${result.cases.passed}P / ${result.cases.failed}F / ${result.cases.blocked}B / ${result.cases.skipped}S of ${result.cases.total}`,
        );
      } else {
        console.warn(`  WARNING: suite ${suiteId} wrote no per-case results — counts unavailable`);
      }
      return result;
    }

    return {
      suiteId,
      description: config.description,
      status: "error",
      lane,
      costUsd: accruedCostUsd,
      durationMs: Date.now() - startTime,
      numTurns,
      errors: ["No result message received"],
      cases: readCaseCounts(suiteId),
    };
  } catch (error) {
    return {
      suiteId,
      description: config.description,
      status: "error",
      lane,
      costUsd: accruedCostUsd,
      durationMs: Date.now() - startTime,
      numTurns,
      errors: [error instanceof Error ? error.message : String(error)],
      cases: readCaseCounts(suiteId),
    };
  }
}

/** Dispatch a suite to whichever lane owns it. */
async function runSuite(
  suiteId: string,
  config: SuiteConfig,
  lane: LaneKind,
  slot: PoolSlot,
  budgetUsd: number,
): Promise<SuiteResult> {
  if (lane === "deterministic") return runDeterministic(suiteId, config);
  return runAgentSuite(suiteId, config, lane, slot, budgetUsd);
}

// --- Generate markdown report ---

function generateReport(results: SuiteResult[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  const passed = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "fail" || r.status === "error").length;
  const truncated = results.filter((r) => isTruncated(r.status)).length;
  const deferred = results.filter((r) => isNotAttempted(r.status)).length;
  const blocked = results.filter((r) => r.status === "blocked").length;

  const caseTotals = results.reduce(
    (acc, r) => {
      if (!r.cases) return acc;
      acc.total += r.cases.total;
      acc.passed += r.cases.passed;
      acc.failed += r.cases.failed;
      acc.blocked += r.cases.blocked;
      acc.skipped += r.cases.skipped;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 },
  );

  let report = `# CI Regression Test Report

## Run Summary
- **Run ID:** ${RUN_ID}
- **Date:** ${date}
- **Environment:** ${TEST_ENVIRONMENT}
- **Model:** ${MODEL}
- **Suite Selection:** ${SUITE_SELECTION}
- **Total Cost:** $${totalCost.toFixed(4)}
- **Total Duration:** ${(totalDuration / 1000 / 60).toFixed(1)} minutes
- **Suites:** ${passed} passed / ${failed} failed / ${blocked} blocked / ${truncated} truncated / ${deferred} deferred (of ${results.length})
`;

  if (caseTotals.total > 0) {
    report += `- **Cases:** ${caseTotals.passed} PASS / ${caseTotals.failed} FAIL / ${caseTotals.blocked} BLOCKED / ${caseTotals.skipped} SKIPPED (of ${caseTotals.total})\n`;
  } else {
    report += `- **Cases:** not reported — no suite wrote per-case results\n`;
  }

  if (truncated > 0 || deferred > 0) {
    report += `
> **Coverage is incomplete.** ${truncated} suite(s) were cut off by a turn/budget/timeout cap and
> ${deferred} were never attempted. A truncated suite has NOT been tested; treat this run as
> partial regardless of how few failures it reports.
`;
  }

  report += `
## Suite Results

| Suite | Description | Lane | Status | Cases (P/F/B/S) | Cost | Turns | Duration |
|-------|-------------|------|--------|-----------------|------|-------|----------|
`;

  for (const r of results) {
    const cases = r.cases
      ? `${r.cases.passed}/${r.cases.failed}/${r.cases.blocked}/${r.cases.skipped}`
      : "—";
    report += `| ${r.suiteId} | ${r.description} | ${r.lane} | ${r.status} | ${cases} | $${r.costUsd.toFixed(4)} | ${r.numTurns} | ${(r.durationMs / 1000).toFixed(1)}s |\n`;
  }

  // Detail only where there is something to say. The agent's own prose used to be pasted
  // in full for every suite; per-case detail now lives in suite-*-results.json, so this
  // section is for errors and truncation, not for a transcript dump.
  for (const r of results) {
    if (r.status === "success" && !r.errors?.length) continue;
    report += `\n---\n\n## Suite ${r.suiteId}: ${r.description}\n\n`;
    report += `**Status:** ${r.status} (lane: ${r.lane})\n\n`;
    if (r.cases) {
      report += `**Cases:** ${r.cases.passed} PASS / ${r.cases.failed} FAIL / ${r.cases.blocked} BLOCKED / ${r.cases.skipped} SKIPPED of ${r.cases.total}\n\n`;
    }
    report += `**Results file:** \`${join(RUN_DIR, `suite-${r.suiteId}-results.json`)}\`\n\n`;
    if (r.errors && r.errors.length > 0) {
      report += `### Errors\n\n`;
      for (const err of r.errors) report += `- ${err}\n`;
      report += "\n";
    }
  }

  return report;
}

// --- Parallel execution configuration ---
//
// MAX_PARALLEL stays at 3 for now, deliberately. Per-lane MCP output isolation is in place
// (ci/lib/lane-mcp.ts), but `test-data/users/agent-user-pool.csv` still only has credential
// slots for three lanes — raising concurrency before those extra accounts are actually seeded
// puts two lanes on one account, which is the contested-account BLOCKED class
// `scripts/seed-data/validate-credentials.mjs` exists to catch. The scheduler already
// supports more; the accounts are the gate.
const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL || "3", 10);
/** Concurrency for runner-native GraphQL suites: compute + network only, no browser slot. */
const MAX_PARALLEL_FASTPATH = parseInt(process.env.MAX_PARALLEL_FASTPATH || "4", 10);
/** Concurrency for deterministic `runner` suites (they drive their own browser). */
const MAX_PARALLEL_DETERMINISTIC = parseInt(process.env.MAX_PARALLEL_DETERMINISTIC || "2", 10);

const RUN_STARTED_AT = Date.now();
/** Set in main() once the queue is known; logged and recorded so the model can be scored. */
let PREDICTED_MAKESPAN_MINUTES = 0;

// --- Result history tracking ---

interface HistoryEntry {
  date: string;
  runId: string;
  selection: string;
  environment: string;
  model: string;
  totalSuites: number;
  passed: number;
  failed: number;
  totalCostUsd: number;
  totalDurationMs: number;
  /** What the LPT + continuous-refill model predicted before dispatch. */
  predictedMakespanMinutes: number;
  /** What the run actually took, wall-clock. Predicted-vs-actual is how the model earns trust. */
  actualWallClockMinutes: number;
  suites: Array<{ id: string; status: string; costUsd: number; durationMs: number }>;
}

function appendToHistory(results: SuiteResult[]): void {
  const date = new Date().toISOString().slice(0, 10);

  // Feed the flakiness engine (scripts/regression/compute-metrics.ts). This used to be
  // deliberately COARSE — one 1-unit pass/fail data point per suite — because CI had no
  // per-case results to report. It now does (the agent writes suite-*-results.json), so a CI
  // row is as good as an interactive one and `mode` is no longer downgraded to "ci".
  //
  // NOTE: none of this reaches git unless `.gitignore` un-ignores history.json AND the
  // workflow restores/commits it across runs — the CI container is ephemeral. Both land in
  // the same change; without them compute-metrics' flaky rule (n >= 4 && crossings >= 3)
  // can never fire.
  const rows: RunEntry[] = results
    .filter((r) => r.suiteId && r.suiteId !== "Unknown")
    .filter((r) => !isNotAttempted(r.status)) // never attempted => not a data point
    .map((r) => {
      const cases = r.cases;
      if (cases && cases.total > 0) {
        const executed = cases.passed + cases.failed;
        return {
          runId: RUN_ID,
          date,
          suiteId: r.suiteId,
          suiteName: r.description,
          environment: TEST_ENVIRONMENT,
          total: cases.total,
          passed: cases.passed,
          failed: cases.failed,
          blocked: cases.blocked,
          skipped: cases.skipped,
          duration_minutes: Math.round((r.durationMs / 60000) * 100) / 100,
          pass_rate: executed > 0 ? Math.round((cases.passed / executed) * 10000) / 100 : 0,
          mode: "ci",
        };
      }
      // No per-case results: fall back to the old 1-unit shape rather than dropping the
      // suite. A truncated or errored suite counts as blocked, never as a pass.
      const pass = r.status === "success" ? 1 : 0;
      const fail = r.status === "fail" || r.status === "error" ? 1 : 0;
      const blocked = pass === 0 && fail === 0 ? 1 : 0;
      return {
        runId: RUN_ID,
        date,
        suiteId: r.suiteId,
        suiteName: r.description,
        environment: TEST_ENVIRONMENT,
        total: 1,
        passed: pass,
        failed: fail,
        blocked,
        skipped: 0,
        duration_minutes: Math.round((r.durationMs / 60000) * 100) / 100,
        pass_rate: pass * 100,
        mode: "ci",
      };
    });
  const n = mergeHistoryRows(rows);
  console.log(`History updated: reports/regression/history.json (+${n} per-suite rows for ${RUN_ID})`);

  // Run-level cost/duration log in its OWN file (not the per-suite shape compute-metrics
  // reads). Kept for cost tracking, plus the scheduler's predicted-vs-actual makespan so the
  // planning model can be scored against reality instead of trusted.
  const runLogPath = join("reports", "regression", "history-ci-runs.json");
  let runLog: HistoryEntry[] = [];
  if (existsSync(runLogPath)) {
    try {
      runLog = JSON.parse(readFileSync(runLogPath, "utf-8"));
    } catch {
      runLog = [];
    }
  }
  runLog.push({
    date,
    runId: RUN_ID,
    selection: SUITE_SELECTION,
    environment: TEST_ENVIRONMENT,
    model: MODEL,
    totalSuites: results.length,
    passed: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status !== "success").length,
    totalCostUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    predictedMakespanMinutes: PREDICTED_MAKESPAN_MINUTES,
    actualWallClockMinutes: Math.round(((Date.now() - RUN_STARTED_AT) / 60000) * 100) / 100,
    suites: results.map((r) => ({ id: r.suiteId, status: r.status, costUsd: r.costUsd, durationMs: r.durationMs })),
  });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  runLog = runLog.filter((h) => h.date >= cutoffStr);
  mkdirSync(join("reports", "regression"), { recursive: true });
  writeFileSync(runLogPath, JSON.stringify(runLog, null, 2), "utf-8");
}

/** Browser servers a suite must not be scheduled on. */
function browserDenyListFor(config: SuiteConfig): string[] {
  // playwright-firefox cannot click on this storefront or the AngularJS Admin SPA:
  // browser_click resolves the element then times out on Playwright's actionability gate.
  // Confirmed 6x independently; root cause is in the @playwright/mcp layer. A firefox
  // placement on a click-driven suite costs a whole wasted attempt, so the scheduler queues
  // instead of downgrading. CI is single-Chromium today, so this is forward-looking — but it
  // belongs in data, not in three separate prose files.
  return config.clickDriven ? ["playwright-firefox"] : [];
}

/** Slots for a lane. Browser slots carry a server name; the other lanes just need capacity. */
function slotsFor(lane: LaneKind, count: number): PoolSlot[] {
  const slots: PoolSlot[] = [];
  for (let i = 1; i <= Math.max(0, count); i++) {
    slots.push(lane === "browser" ? { id: String(i), server: "playwright-chrome" } : { id: `${lane}-${i}` });
  }
  return slots;
}

// --- Main entry point ---

async function main() {
  validateEnv();

  const suiteIds = resolveSuites(SUITE_SELECTION);

  // Validate suite IDs and prepare the run queue.
  const validSuites: Array<{ id: string; config: SuiteConfig }> = [];
  const results: SuiteResult[] = [];

  for (const suiteId of suiteIds) {
    const config = SUITE_MAP[suiteId];
    if (!config) {
      console.error(`Unknown suite ID: ${suiteId}, skipping`);
      results.push({
        suiteId,
        description: "Unknown",
        status: "error",
        lane: "browser",
        costUsd: 0,
        durationMs: 0,
        numTurns: 0,
        errors: [`Unknown suite ID: ${suiteId}`],
      });
    } else {
      validSuites.push({ id: suiteId, config });
    }
  }

  // --- Preflight: fail on a broken manifest BEFORE spending anything ---------------
  //
  // Previously a missing agent definition surfaced one suite at a time, mid-run, as a REAL
  // failure. Suite 048c (`agent: "none"`, no ci/agents/none.md) made every `full` and
  // `frontend` CI run fail this way.
  const preflight: PreflightSuite[] = validSuites.map(({ id, config }) => ({
    id,
    csvPath: join("regression", "suites", config.file),
    agent: config.agent,
    runner: config.runner,
    agentPath: join("ci", "agents", `${config.agent}.md`),
  }));
  const problems = preflightManifest(preflight, { fileExists: existsSync });
  if (problems.length > 0) {
    console.error(formatPreflightProblems(problems));
    console.error("\nNothing was dispatched. Fix the manifest (or add the missing files) and re-run.");
    process.exit(1);
  }

  // --- Derived budget + lane assignment -------------------------------------------

  const globalBudget = MAX_BUDGET_USD_OVERRIDE ?? globalBudgetFor(validSuites.map((s) => s.config));
  const ledger = new BudgetLedger(globalBudget);

  const schedulable: Array<SchedulableSuite & { config: SuiteConfig }> = validSuites.map(({ id, config }) => ({
    id,
    lane: classifyLane(config),
    testCount: config.testCount,
    estimatedMinutes: config.estimatedMinutes,
    preferredBrowser: config.preferredBrowser,
    browserDenyList: browserDenyListFor(config),
    config,
  }));

  const byLane = {
    browser: schedulable.filter((s) => s.lane === "browser"),
    fastpath: schedulable.filter((s) => s.lane === "fastpath"),
    deterministic: schedulable.filter((s) => s.lane === "deterministic"),
  };

  // ONE plan renderer, shared with `npm run regression:plan` (ci/lib/run-plan.ts). Keeping a
  // second copy of the makespan math here is how the printed plan and the executed run drift.
  const plan = buildRunPlan(
    schedulable.map((s) => ({ ...s, description: s.config.description })),
    { browser: MAX_PARALLEL, fastpath: MAX_PARALLEL_FASTPATH, deterministic: MAX_PARALLEL_DETERMINISTIC },
    MAX_BUDGET_USD_OVERRIDE,
  );
  PREDICTED_MAKESPAN_MINUTES = plan.makespanMinutes;

  console.log("=== Virto Commerce CI Regression Runner ===");
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Selection: ${SUITE_SELECTION} | Environment: ${TEST_ENVIRONMENT} | Model: ${MODEL}`);
  console.log(
    `Caps: budget ${MAX_BUDGET_USD_OVERRIDE === null ? "derived" : "forced"}, ` +
      `turns ${MAX_TURNS_OVERRIDE === null ? "derived per suite" : `forced ${MAX_TURNS_OVERRIDE}`}, ` +
      `timeout ${SUITE_TIMEOUT_MS_OVERRIDE === null ? "derived per suite" : `forced ${Math.round(SUITE_TIMEOUT_MS_OVERRIDE / 60000)}m`}`,
  );
  console.log("");
  console.log(formatRunPlan(plan));
  console.log("");

  // A cap that cannot let a suite finish is the defect the derived caps replaced. Refusing to
  // dispatch is the point — the alternative is discovering it hours in, as a "failure".
  if (plan.capAnomalies.length > 0) {
    console.error("Refusing to dispatch: the caps above would guarantee truncation.");
    process.exit(1);
  }

  console.log(`Run dir: ${RUN_DIR}`);
  console.log("");

  mkdirSync(RUN_DIR, { recursive: true });

  // --- Dispatch: one continuous-refill pool per lane, all three concurrently -------

  const runLane = async (lane: LaneKind, concurrency: number) => {
    const suites = byLane[lane];
    if (suites.length === 0) return;

    const byId = new Map(suites.map((s) => [s.id, s]));
    /** Budget actually reserved at dispatch, read back by `run`. Keyed by suite id. */
    const granted = new Map<string, number>();
    /** Estimated minutes not yet dispatched — the denominator of the proportional share. */
    let pendingMinutes = suites.reduce((sum, s) => sum + minutesOf(s), 0);
    // The deterministic lane spends no tokens, so it never touches the ledger.
    const metered = lane !== "deterministic";

    const outcomes = await runLanePool<SuiteResult>({
      suites,
      slots: slotsFor(lane, concurrency),
      canDispatch: (suite) => {
        if (!metered) return { ok: true };
        const entry = byId.get(suite.id);
        if (!entry) return { ok: true };
        const want = budgetFor(entry, ledger.available, pendingMinutes);
        const reserved = ledger.reserve(suite.id, want);
        if (reserved === null) {
          // Not enough left even for this suite: stop dispatching and defer the rest.
          // `deferred` is deliberately distinct from a failure — nothing was attempted.
          return {
            ok: false,
            stopAll: true,
            reason: `global budget exhausted ($${ledger.totalSpent.toFixed(2)} spent of $${globalBudget.toFixed(2)})`,
          };
        }
        granted.set(suite.id, reserved);
        pendingMinutes = Math.max(0, pendingMinutes - minutesOf(entry));
        return { ok: true };
      },
      onDispatch: (suite, slot) => {
        const budget = granted.get(suite.id);
        console.log(
          `>>> dispatch ${suite.id} -> ${lane} slot ${slot.id} ` +
            `(${minutesOf(suite)} min est.${budget === undefined ? "" : `, $${budget.toFixed(2)} reserved`})`,
        );
      },
      run: async (suite, slot) => {
        const entry = byId.get(suite.id)!;
        const result = await runSuite(suite.id, entry.config, lane, slot, granted.get(suite.id) ?? 0);
        // Settle releases the reservation and books what was ACTUALLY spent, so an
        // under-spending suite hands its head-room back to the queue.
        if (metered) ledger.settle(suite.id, result.costUsd);
        return result;
      },
    });

    for (const outcome of outcomes) {
      if (outcome.result) {
        results.push(outcome.result);
      } else {
        const entry = suites.find((s) => s.id === outcome.suite.id)!;
        results.push({
          suiteId: outcome.suite.id,
          description: entry.config.description,
          status: "deferred",
          lane,
          costUsd: 0,
          durationMs: 0,
          numTurns: 0,
          errors: [outcome.deferredReason ?? "never attempted"],
        });
      }
    }
  };

  await Promise.all([
    runLane("browser", MAX_PARALLEL),
    runLane("fastpath", MAX_PARALLEL_FASTPATH),
    runLane("deterministic", MAX_PARALLEL_DETERMINISTIC),
  ]);

  // Pools resolve in completion order across three concurrent lanes, so sort for a stable
  // report and a stable diff between runs.
  results.sort((a, b) => a.suiteId.localeCompare(b.suiteId));

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);

  // --- Report ----------------------------------------------------------------------

  const report = generateReport(results);
  const reportPath = join(RUN_DIR, "regression-report.md");
  writeFileSync(reportPath, report, "utf-8");
  console.log(`\nReport saved to: ${reportPath}`);

  const passedCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "fail" || r.status === "error").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  const truncatedCount = results.filter((r) => isTruncated(r.status)).length;
  const deferredCount = results.filter((r) => isNotAttempted(r.status)).length;
  const passRate = results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0;

  const summary = {
    runId: RUN_ID,
    date: new Date().toISOString().slice(0, 10),
    environment: TEST_ENVIRONMENT,
    model: MODEL,
    suiteSelection: SUITE_SELECTION,
    maxParallel: MAX_PARALLEL,
    globalBudgetUsd: globalBudget,
    totalCostUsd: totalCost,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    predictedMakespanMinutes: PREDICTED_MAKESPAN_MINUTES,
    actualWallClockMinutes: Math.round(((Date.now() - RUN_STARTED_AT) / 60000) * 100) / 100,
    totalSuites: results.length,
    passed: passedCount,
    failed: failedCount,
    blocked: blockedCount,
    truncated: truncatedCount,
    deferred: deferredCount,
    passRate,
    /** True when every suite ran to completion. A `false` here means the run is partial. */
    coverageComplete: truncatedCount === 0 && deferredCount === 0,
    results: results.map((r) => ({
      suiteId: r.suiteId,
      description: r.description,
      lane: r.lane,
      status: r.status,
      cases: r.cases,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      numTurns: r.numTurns,
      errors: r.errors,
    })),
  };
  const jsonPath = join(RUN_DIR, "summary.json");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`JSON summary saved to: ${jsonPath}`);

  appendToHistory(results);

  console.log("\n=== Final Summary ===");
  console.log(`Total Cost: $${totalCost.toFixed(4)} of $${globalBudget.toFixed(2)}`);
  console.log(
    `Wall clock: ${summary.actualWallClockMinutes} min (predicted ${PREDICTED_MAKESPAN_MINUTES} min)`,
  );
  console.log(`Suites: ${passedCount} passed / ${failedCount} failed / ${blockedCount} blocked / ${truncatedCount} truncated / ${deferredCount} deferred`);
  if (!summary.coverageComplete) {
    console.warn(
      "COVERAGE INCOMPLETE: some suites were cut off or never attempted — this run does NOT clear a green gate.",
    );
  }

  // Exit code. `exitCodeFor` guarantees a truncated or deferred suite can never yield 0:
  //   0 = everything ran and passed   1 = real failure   2 = truncated/deferred   3 = blocked
  // The old code folded budget/turn truncation into "not real failures" and exited 2 with a
  // reassuring annotation, so a suite that covered 14% of its cases read as fine.
  process.exit(exitCodeFor(results.map((r) => r.status)));
}

// CLI guard, matching the convention in scripts/test-cases/sync-test-suites.ts. Without it,
// merely IMPORTING this module (a unit test, a tool reading its exports) launches a regression
// run — and `validateEnv()` would `process.exit(1)` on the way, which reads as a broken test
// rather than a misplaced side effect.
const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(2);
  });
}
