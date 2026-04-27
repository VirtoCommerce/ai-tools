import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { TestDataResolver } from "../lib/test-data-resolver.js";

// --- Configuration from environment variables ---

const SUITE_SELECTION = process.env.SUITE_SELECTION || "smoke";
const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "10.0");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "100", 10);
const TEST_ENVIRONMENT = process.env.TEST_ENVIRONMENT || "qa";
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";

// --- Environment URLs ---

const ENV_URLS: Record<string, { front: string; back: string }> = {
  qa: {
    front: process.env.FRONT_URL || "https://vcst-qa-storefront.govirto.com",
    back: process.env.BACK_URL || "https://vcst-qa.govirto.com",
  },
  staging: {
    front: process.env.VIRTO_START_FRONT || "https://virtostart-demo-store.govirto.com",
    back: process.env.VIRTO_START_BACK || "https://virtostart-demo-admin.govirto.com",
  },
};

// --- Suite configuration (loaded from config/test-suites.json) ---

interface SuiteConfig {
  file: string;
  agent: string;
  description: string;
}

interface ManifestSuite {
  id: string;
  name: string;
  file: string;
  domain: string;
  layer: string;
  concern: string;
  priority: string;
  testCount: number;
  estimatedMinutes: number;
  agent: string;
  tags: string[];
}

type WhereFilter = {
  domain?: string;
  layer?: string;
  concern?: string;
  priority?: string;
  tag?: string;
  tagAny?: string[];
};

type SelectionRule =
  | { include: string[]; exclude?: string[] }
  | { all: true; exclude?: string[] }
  | { where: WhereFilter; include?: string[]; exclude?: string[] };

interface Manifest {
  _meta: { version: string; description: string; generated: string; totalSuites: number };
  defaults: Record<string, unknown>;
  browserPool: unknown[];
  suites: ManifestSuite[];
  selections: Record<string, SelectionRule>;
}

function loadManifest(): Manifest {
  const manifestPath = join("config", "test-suites.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Suite manifest not found: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
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
  };
}

// --- MCP server configuration (Linux/Docker compatible) ---

const mcpServers = {
  "playwright-chrome": {
    command: "npx",
    args: [
      "@playwright/mcp@latest",
      "--config",
      "ci/config/mcp-playwright-chrome.ci.json",
    ],
  },
};

// --- Validate required environment variables ---

function validateEnv(): void {
  const required = ["ANTHROPIC_API_KEY"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const recommended = ["FRONT_URL", "BACK_URL", "USER_EMAIL", "USER_PASSWORD", "ADMIN", "ADMIN_PASSWORD", "STORE_ID"];
  const missingRec = recommended.filter((v) => !process.env[v]);
  if (missingRec.length > 0) {
    console.warn(`Warning: Missing recommended env vars (tests may fail): ${missingRec.join(", ")}`);
  }
}

// --- Resolve suites from selection string ---

function matchesWhere(suite: ManifestSuite, where: WhereFilter): boolean {
  if (where.domain && suite.domain !== where.domain) return false;
  if (where.layer && suite.layer !== where.layer) return false;
  if (where.concern && suite.concern !== where.concern) return false;
  if (where.priority && suite.priority !== where.priority) return false;
  if (where.tag && !suite.tags.includes(where.tag)) return false;
  if (where.tagAny && !where.tagAny.some((t) => suite.tags.includes(t))) return false;
  return true;
}

function expandSelection(rule: SelectionRule): string[] {
  // Order policy: include preserves author order; where/all use sorted suite order.
  let ids: string[];
  if ("include" in rule && !("where" in rule) && !("all" in rule)) {
    ids = [...rule.include];
  } else if ("all" in rule) {
    ids = manifest.suites.map((s) => s.id);
  } else if ("where" in rule) {
    ids = manifest.suites.filter((s) => matchesWhere(s, rule.where)).map((s) => s.id);
    if (rule.include) {
      for (const id of rule.include) if (!ids.includes(id)) ids.push(id);
    }
  } else {
    throw new Error(`Invalid selection rule: ${JSON.stringify(rule)}`);
  }
  if ("exclude" in rule && rule.exclude) {
    const ex = new Set(rule.exclude);
    ids = ids.filter((id) => !ex.has(id));
  }
  return ids;
}

function resolveSuites(selection: string): string[] {
  const rule = manifest.selections[selection];
  if (rule) {
    return expandSelection(rule);
  }
  // Comma-separated IDs like "01,02,03"
  const ids = selection.split(",").map((s) => s.trim().padStart(2, "0"));

  const invalidIds = ids.filter((id) => !SUITE_MAP[id]);
  if (invalidIds.length > 0) {
    const validGroups = Object.keys(manifest.selections).filter((k) => !k.startsWith("_")).join(", ");
    const validIds = Object.keys(SUITE_MAP).join(", ");
    console.error(`Unknown suite ID(s): ${invalidIds.join(", ")}`);
    console.error(`Valid selections: ${validGroups}`);
    console.error(`Valid suite IDs: ${validIds}`);
    process.exit(1);
  }

  return ids;
}

// --- Build the prompt for a suite ---

function buildPrompt(suiteId: string, suiteCSV: string, agentInstructions: string): string {
  const urls = ENV_URLS[TEST_ENVIRONMENT] || ENV_URLS.qa;
  const date = new Date().toISOString().slice(0, 10);

  return `# CI Regression Test Execution

## Run Configuration
- **Run ID:** CI-${date}-suite-${suiteId}
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
The following CSV contains the test cases. Execute each one sequentially.

\`\`\`csv
${suiteCSV}
\`\`\`

## Execution Rules
1. Navigate to the Frontend URL above using the Playwright MCP browser
2. For each test case in the CSV:
   - Execute the steps described
   - Verify the expected result
   - Take a screenshot on any failure
   - Record PASS, FAIL, BLOCKED, or SKIPPED
3. After all test cases, provide a summary with pass/fail counts
4. List any bugs found with steps to reproduce

## Important
- Use \`browser_navigate\` to open pages
- Use \`browser_snapshot\` to inspect page structure
- Use \`browser_click\` and \`browser_fill\` for interactions
- Use \`browser_take_screenshot\` to capture evidence on failures
- Use \`browser_console_messages\` to check for JavaScript errors
- This is a headless CI environment - no human interaction available
`;
}

// --- Suite result type ---

interface SuiteResult {
  suiteId: string;
  description: string;
  status: "success" | "error" | "budget_exceeded" | "max_turns";
  result?: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  errors?: string[];
}

// --- Timeout helper ---

const SUITE_TIMEOUT_MS = parseInt(process.env.SUITE_TIMEOUT_MS || "600000", 10); // 10 min default

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms),
    ),
  ]);
}

// --- Run a single suite ---

async function runSuite(suiteId: string, config: SuiteConfig, remainingBudget: number): Promise<SuiteResult> {
  const startTime = Date.now();

  // Read suite CSV
  const suitePath = join("regression", "suites", config.file);
  if (!existsSync(suitePath)) {
    return {
      suiteId,
      description: config.description,
      status: "error",
      costUsd: 0,
      durationMs: 0,
      numTurns: 0,
      errors: [`Suite file not found: ${suitePath}`],
    };
  }
  const rawCSV = readFileSync(suitePath, "utf-8");
  const suiteCSV = testDataResolver.resolveCSV(rawCSV);

  // Read agent definition
  const agentPath = join("ci", "agents", `${config.agent}.md`);
  if (!existsSync(agentPath)) {
    return {
      suiteId,
      description: config.description,
      status: "error",
      costUsd: 0,
      durationMs: 0,
      numTurns: 0,
      errors: [`Agent definition not found: ${agentPath}`],
    };
  }
  const agentInstructions = readFileSync(agentPath, "utf-8");

  // Build prompt
  const prompt = buildPrompt(suiteId, suiteCSV, agentInstructions);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Starting Suite ${suiteId}: ${config.description}`);
  console.log(`Agent: ${config.agent} | Model: ${MODEL} | Budget: $${remainingBudget.toFixed(2)}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    const runQuery = async (): Promise<SuiteResult | null> => {
      let resultMessage: SuiteResult | null = null;

      for await (const message of query({
        prompt,
        options: {
          model: MODEL,
          mcpServers,
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
          ],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: MAX_TURNS,
          maxBudgetUsd: Math.min(remainingBudget, MAX_BUDGET_USD),
        },
      })) {
        // Log system init
        if (message.type === "system" && message.subtype === "init") {
          console.log(`  Session: ${message.session_id}`);
          console.log(`  Model: ${message.model}`);
          console.log(`  MCP Servers: ${message.mcp_servers.map((s) => `${s.name}(${s.status})`).join(", ")}`);
        }

        // Capture result
        if (message.type === "result") {
          const duration = Date.now() - startTime;

          if (message.subtype === "success") {
            resultMessage = {
              suiteId,
              description: config.description,
              status: "success",
              result: message.result,
              costUsd: message.total_cost_usd,
              durationMs: duration,
              numTurns: message.num_turns,
            };
          } else {
            resultMessage = {
              suiteId,
              description: config.description,
              status: message.subtype === "error_max_turns" ? "max_turns" :
                      message.subtype === "error_max_budget_usd" ? "budget_exceeded" : "error",
              costUsd: message.total_cost_usd,
              durationMs: duration,
              numTurns: message.num_turns,
              errors: "errors" in message ? message.errors : undefined,
            };
          }
        }
      }

      return resultMessage;
    };

    const resultMessage = await withTimeout(runQuery(), SUITE_TIMEOUT_MS, `Suite ${suiteId}`);

    if (resultMessage) {
      console.log(`\n  Suite ${suiteId} finished: ${resultMessage.status}`);
      console.log(`  Cost: $${resultMessage.costUsd.toFixed(4)} | Turns: ${resultMessage.numTurns} | Duration: ${(resultMessage.durationMs / 1000).toFixed(1)}s`);
      return resultMessage;
    }

    return {
      suiteId,
      description: config.description,
      status: "error",
      costUsd: 0,
      durationMs: Date.now() - startTime,
      numTurns: 0,
      errors: ["No result message received"],
    };
  } catch (error) {
    return {
      suiteId,
      description: config.description,
      status: "error",
      costUsd: 0,
      durationMs: Date.now() - startTime,
      numTurns: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// --- Generate markdown report ---

function generateReport(results: SuiteResult[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  const passed = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status !== "success").length;

  let report = `# CI Regression Test Report

## Run Summary
- **Date:** ${date}
- **Environment:** ${TEST_ENVIRONMENT}
- **Model:** ${MODEL}
- **Suite Selection:** ${SUITE_SELECTION}
- **Total Cost:** $${totalCost.toFixed(4)}
- **Total Duration:** ${(totalDuration / 1000 / 60).toFixed(1)} minutes
- **Suites Passed:** ${passed}/${results.length}
- **Suites Failed:** ${failed}/${results.length}

## Suite Results

| Suite | Description | Status | Cost | Turns | Duration |
|-------|-------------|--------|------|-------|----------|
`;

  for (const r of results) {
    const statusIcon = r.status === "success" ? "PASS" : "FAIL";
    report += `| ${r.suiteId} | ${r.description} | ${statusIcon} | $${r.costUsd.toFixed(4)} | ${r.numTurns} | ${(r.durationMs / 1000).toFixed(1)}s |\n`;
  }

  // Add detailed results
  for (const r of results) {
    report += `\n---\n\n## Suite ${r.suiteId}: ${r.description}\n\n`;
    report += `**Status:** ${r.status}\n\n`;

    if (r.result) {
      report += `### Agent Output\n\n${r.result}\n\n`;
    }

    if (r.errors && r.errors.length > 0) {
      report += `### Errors\n\n`;
      for (const err of r.errors) {
        report += `- ${err}\n`;
      }
      report += "\n";
    }
  }

  return report;
}

// --- Parallel execution configuration ---

const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL || "3", 10);

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
  suites: Array<{ id: string; status: string; costUsd: number; durationMs: number }>;
}

function appendToHistory(results: SuiteResult[]): void {
  const historyPath = join("reports", "regression", "history.json");
  const date = new Date().toISOString().slice(0, 10);

  let history: HistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, "utf-8"));
    } catch {
      history = [];
    }
  }

  const entry: HistoryEntry = {
    date,
    runId: `CI-${date}-${SUITE_SELECTION}`,
    selection: SUITE_SELECTION,
    environment: TEST_ENVIRONMENT,
    model: MODEL,
    totalSuites: results.length,
    passed: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status !== "success").length,
    totalCostUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    suites: results.map((r) => ({
      id: r.suiteId,
      status: r.status,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
    })),
  };

  history.push(entry);

  // Keep last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  history = history.filter((h) => h.date >= cutoffStr);

  mkdirSync(join("reports", "regression"), { recursive: true });
  writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
  console.log(`History updated: ${historyPath} (${history.length} entries)`);
}

// --- Batch helper for parallel execution ---

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// --- Main entry point ---

async function main() {
  validateEnv();

  console.log("=== Virto Commerce CI Regression Runner ===");
  console.log(`Suite Selection: ${SUITE_SELECTION}`);
  console.log(`Environment: ${TEST_ENVIRONMENT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Max Budget: $${MAX_BUDGET_USD}`);
  console.log(`Max Turns/Suite: ${MAX_TURNS}`);
  console.log(`Max Parallel: ${MAX_PARALLEL}`);
  console.log("");

  const suiteIds = resolveSuites(SUITE_SELECTION);
  console.log(`Resolved suites: ${suiteIds.join(", ")}`);

  // Validate suite IDs and prepare run queue
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
        costUsd: 0,
        durationMs: 0,
        numTurns: 0,
        errors: [`Unknown suite ID: ${suiteId}`],
      });
    } else {
      validSuites.push({ id: suiteId, config });
    }
  }

  // Execute in parallel batches
  const batches = chunkArray(validSuites, MAX_PARALLEL);
  let totalCost = 0;
  let budgetExhausted = false;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    if (budgetExhausted) {
      // Mark remaining suites as budget_exceeded
      for (const suite of batch) {
        results.push({
          suiteId: suite.id,
          description: suite.config.description,
          status: "budget_exceeded",
          costUsd: 0,
          durationMs: 0,
          numTurns: 0,
          errors: ["Global budget exhausted"],
        });
      }
      continue;
    }

    const remainingBudget = MAX_BUDGET_USD - totalCost;
    if (remainingBudget <= 0.5) {
      console.log(`\nBudget nearly exhausted ($${totalCost.toFixed(2)}/$${MAX_BUDGET_USD}). Stopping.`);
      budgetExhausted = true;
      for (const suite of batch) {
        results.push({
          suiteId: suite.id,
          description: suite.config.description,
          status: "budget_exceeded",
          costUsd: 0,
          durationMs: 0,
          numTurns: 0,
          errors: ["Global budget exhausted"],
        });
      }
      continue;
    }

    console.log(`\n>>> Batch ${batchIdx + 1}/${batches.length}: Running ${batch.map((s) => s.id).join(", ")} in parallel`);

    // Per-suite budget = remaining / suites left (with minimum floor)
    const suitesRemaining = validSuites.length - results.filter((r) => r.suiteId !== "Unknown").length;
    const perSuiteBudget = Math.max(remainingBudget / Math.max(suitesRemaining, 1), 2.0);

    const batchPromises = batch.map((suite) =>
      runSuite(suite.id, suite.config, perSuiteBudget),
    );

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      results.push(result);
      totalCost += result.costUsd;
    }

    console.log(`\n<<< Batch ${batchIdx + 1} complete. Running cost: $${totalCost.toFixed(4)}`);
  }

  // Generate and save report
  const report = generateReport(results);
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = join("reports", "regression", `ci-${date}`);
  mkdirSync(reportDir, { recursive: true });

  const reportPath = join(reportDir, "regression-report.md");
  writeFileSync(reportPath, report, "utf-8");
  console.log(`\nReport saved to: ${reportPath}`);

  // Write JSON summary for programmatic consumption
  const jsonPath = join(reportDir, "summary.json");
  const passedCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "error").length;
  const blockedCount = results.filter((r) => r.status === "budget_exceeded" || r.status === "max_turns").length;
  const passRate = results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0;
  const summary = {
    date,
    environment: TEST_ENVIRONMENT,
    model: MODEL,
    suiteSelection: SUITE_SELECTION,
    maxParallel: MAX_PARALLEL,
    totalCostUsd: totalCost,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    totalSuites: results.length,
    passed: passedCount,
    failed: failedCount,
    blocked: blockedCount,
    passRate,
    results: results.map((r) => ({
      suiteId: r.suiteId,
      description: r.description,
      status: r.status,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      numTurns: r.numTurns,
      errors: r.errors,
    })),
  };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`JSON summary saved to: ${jsonPath}`);

  // Append to result history
  appendToHistory(results);

  // Print final summary
  console.log("\n=== Final Summary ===");
  console.log(`Total Cost: $${totalCost.toFixed(4)}`);
  console.log(`Suites Run: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.status === "success").length}`);
  console.log(`Failed: ${results.filter((r) => r.status !== "success").length}`);

  // Exit with appropriate code
  // 0 = all passed, 1 = real failures, 2 = only budget/turn limits (not real failures)
  const hasRealFailures = results.some((r) => r.status === "error");
  const hasOnlyBudgetIssues = !hasRealFailures && results.some((r) => r.status === "budget_exceeded" || r.status === "max_turns");
  process.exit(hasRealFailures ? 1 : hasOnlyBudgetIssues ? 2 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(2);
});
