import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Full Test Cycle CI Pipeline
 *
 * Simply calls existing commands in sequence:
 *   1. /qa-test-lifecycle {CHANGE_SOURCE} --ci --skip-generate --skip-verify   (change-driven)
 *   2. /qa-test-lifecycle suite {suites} --ci --skip-sync --skip-generate --skip-verify  (review-only)
 *   3. /qa-regression {affected suites}
 *
 * Each phase is a single Agent SDK query() that tells Claude
 * to execute the command. The command files define all the logic.
 *
 * NOTE — `/qa-sync-tests` is GONE, not merely deprecated: the command file was deleted when
 * sync was merged into the unified `/qa-test-lifecycle` pipeline. Phase 1 used to invoke it,
 * which meant the SDK agent was handed a slash command that does not resolve and would
 * improvise. Both phases now invoke `/qa-test-lifecycle`, differing only in scope.
 *
 * Phases 1 and 2 are MUTUALLY EXCLUSIVE, because in the unified command Phase 4 (Review)
 * ALWAYS runs — a change-driven run therefore already reviews the suites it synced, and
 * running the review again would just pay for it twice:
 *   - SKIP_SYNC unset → Phase 1 (scope + sync + review of the affected suites)
 *   - SKIP_SYNC=true  → Phase 2 (review only, over SUITE_SELECTION — no change detection)
 * Consequence: SKIP_LIFECYCLE now skips only the STANDALONE review pass (Phase 2). There is
 * no flag that syncs without reviewing, because the command has no such mode.
 */

const CHANGE_SOURCE = process.env.CHANGE_SOURCE || "diff";
const SKIP_SYNC = process.env.SKIP_SYNC === "true";
const SKIP_LIFECYCLE = process.env.SKIP_LIFECYCLE === "true";
const SKIP_REGRESSION = process.env.SKIP_REGRESSION === "true";
const SUITE_SELECTION = process.env.SUITE_SELECTION || "";
const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "20.0");
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";

const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 16).replace(":", "");
const RUN_ID = `CYCLE-${date}-${time}`;
const outputDir = join("reports", "full-cycle", RUN_ID);

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function runPhase(
  name: string,
  prompt: string,
  budget: number,
  tools: string[],
): Promise<{ costUsd: number; result: string }> {
  log(`--- ${name} (budget: $${budget.toFixed(2)}) ---`);

  let costUsd = 0;
  let text = "";

  for await (const message of query({
    prompt,
    options: {
      model: MODEL,
      maxTurns: 120,
      maxBudgetUsd: budget,
      permissionMode: "acceptEdits" as const,
      allowDangerouslySkipPermissions: true,
      allowedTools: tools,
    },
  })) {
    if (message.type === "result") {
      costUsd = message.total_cost_usd;
      if (message.subtype === "success") {
        text = message.result;
      }
    }
  }

  log(`${name} done — $${costUsd.toFixed(2)}`);
  return { costUsd, result: text };
}

async function main() {
  mkdirSync(outputDir, { recursive: true });

  log(`=== Full Cycle: ${RUN_ID} ===`);
  log(`Change: ${CHANGE_SOURCE} | Budget: $${MAX_BUDGET_USD}`);

  let budgetLeft = MAX_BUDGET_USD;
  let affectedSuites = SUITE_SELECTION;

  // --- Phase 1: /qa-test-lifecycle (change-driven: scope + sync + review) ---
  if (!SKIP_SYNC) {
    const sync = await runPhase(
      "Phase 1: Scope + Sync",
      `Execute /qa-test-lifecycle ${CHANGE_SOURCE} --ci --skip-generate --skip-verify

This is a CI run. Apply all updates without asking for confirmation.
Skip browser verification. Output affected suite IDs at the end.

Write scope is NARROWER than an interactive run, not wider (see the command's "CI mode
behavior"): apply only what the deterministic linters proved. Never promote
Automation_Status out of Draft, never set Deprecated, never delete a case.

After completing, output exactly this line:
AFFECTED_SUITES: <comma-separated suite IDs or "none">`,
      budgetLeft * 0.5,
      ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
    );

    budgetLeft -= sync.costUsd;
    writeFileSync(join(outputDir, "phase1-sync.txt"), sync.result);

    // Parse affected suites from output
    const match = sync.result.match(/AFFECTED_SUITES:\s*(.+)/);
    if (match && match[1].trim() !== "none") {
      affectedSuites = match[1].trim();
    }
    log(`Affected suites: ${affectedSuites || "none"}`);
  }

  // --- Phase 2: /qa-test-lifecycle (review-only — ONLY when Phase 1 didn't run) ---
  // Phase 1 already reviews everything it synced (the command's Phase 4 always runs), so this
  // standalone pass exists for the SKIP_SYNC=true path: review a given SUITE_SELECTION with no
  // change detection. Running it after Phase 1 would review the same suites a second time.
  if (SKIP_SYNC && !SKIP_LIFECYCLE && affectedSuites) {
    const lifecycle = await runPhase(
      "Phase 2: Review",
      `Execute /qa-test-lifecycle suite ${affectedSuites} --ci --skip-sync --skip-generate --skip-verify

This is a CI run. Auto-fix structural issues without asking.
Report the quality gate verdict at the end.

Write scope is NARROWER than an interactive run: apply only what the deterministic linters
proved. Never promote Automation_Status out of Draft, never set Deprecated, never delete a case.`,
      budgetLeft * 0.5,
      ["Read", "Glob", "Grep", "Edit", "Bash"],
    );

    budgetLeft -= lifecycle.costUsd;
    writeFileSync(join(outputDir, "phase2-lifecycle.txt"), lifecycle.result);
  }

  // --- Phase 3: /qa-regression ---
  if (!SKIP_REGRESSION && affectedSuites) {
    // Phase 3 delegates to run-regression.ts which needs Docker + Playwright
    // In CI workflow, this is handled by a separate Docker job
    // When running locally, call it as subprocess
    const { execSync } = await import("child_process");

    log(`Phase 3: Regression — suites: ${affectedSuites}`);
    try {
      execSync(`npx tsx ci/run-regression.ts`, {
        env: {
          ...process.env,
          SUITE_SELECTION: affectedSuites,
          MAX_BUDGET_USD: String(budgetLeft),
        },
        stdio: "inherit",
        timeout: 30 * 60 * 1000,
      });
    } catch (err) {
      log(`Regression exited with error: ${err instanceof Error ? err.message : err}`);
    }
  }

  log(`=== Cycle complete: ${RUN_ID} ===`);
  log(`Reports: ${outputDir}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
