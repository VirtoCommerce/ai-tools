/**
 * Autonomous Regression Reporting Module
 *
 * CLI utility for generating consolidated regression reports, managing
 * run status, and constructing JIRA ticket payloads.
 *
 * Usage:
 *   npx tsx scripts/reporting.ts generate --run-id <ID> --results-dir <path>
 *   npx tsx scripts/reporting.ts jira-payloads --run-id <ID> --results-dir <path>
 *   npx tsx scripts/reporting.ts update-status --run-id <ID> --results-dir <path> --suite-id <ID> --status <status>
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";

// --- Interfaces ---

interface TestCaseResult {
  id: string;
  title: string;
  section: string;
  priority: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  notes: string;
  screenshot: string | null;
  consoleErrors: string[];
}

interface BugEntry {
  id: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  testCaseId: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  consoleErrors: string[];
}

interface SelfRecovery {
  testCaseId: string;
  errorType: string;
  action: string;
  waitMs: number;
  success: boolean;
}

interface SuiteResult {
  suiteId: string;
  suiteName: string;
  runId: string;
  browser: string;
  environment: string;
  attempt: number;
  startedAt: string;
  completedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: string;
  testCases: TestCaseResult[];
  bugs: BugEntry[];
  errors: string[];
  selfRecoveries: SelfRecovery[];
  rateLimitHits: number;
}

interface FailureEntry {
  suiteId: string;
  attempt: number;
  browser: string;
  error: string;
  timestamp: string;
  agentName: string;
}

interface SuiteStatus {
  id: string;
  name: string;
  status: string;
  browser: string | null;
  attempt: number;
  maxAttempts: number;
  startedAt: string | null;
  completedAt: string | null;
  result: string | null;
  error: string | null;
}

interface RunStatus {
  runId: string;
  startedAt: string;
  completedAt?: string;
  environment: { frontend: string; backend: string };
  selection: string;
  totalSuites: number;
  completedSuites: number;
  status: string;
  tokenBucket: { browserSlots: number; reportingSlots: number; inUse: number };
  suites: SuiteStatus[];
  failures: FailureEntry[];
}

interface JiraPayload {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: string;
    priority: { name: string };
    labels: string[];
  };
  meta: {
    bugId: string;
    suiteId: string;
    testCaseId: string;
    runId: string;
  };
}

interface Summary {
  runId: string;
  startedAt: string;
  completedAt: string;
  environment: string;
  selection: string;
  totalSuites: number;
  suitesCompleted: number;
  suitesPassed: number;
  suitesFailed: number;
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  totalBlocked: number;
  totalSkipped: number;
  overallPassRate: string;
  totalBugs: number;
  bugsBySeverity: Record<string, number>;
  totalRetries: number;
  totalRateLimitHits: number;
  qualityGate: { verdict: string; passRate: number; threshold: number };
}

// --- CLI Argument Parsing ---

function parseArgs(): { command: string; args: Record<string, string> } {
  const argv = process.argv.slice(2);
  const command = argv[0] || "help";
  const args: Record<string, string> = {};

  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].replace(/^--/, "");
      args[key] = argv[i + 1];
      i++;
    }
  }

  return { command, args };
}

// --- File I/O Helpers ---

function readJsonFile<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function readSuiteResults(resultsDir: string): SuiteResult[] {
  const files = readdirSync(resultsDir).filter(
    (f) => f.startsWith("suite-") && f.endsWith("-results.json")
  );
  return files.map((f) => readJsonFile<SuiteResult>(join(resultsDir, f)));
}

function readFailures(resultsDir: string): FailureEntry[] {
  const failuresPath = join(resultsDir, "failures.json");
  if (!existsSync(failuresPath)) return [];
  return readJsonFile<FailureEntry[]>(failuresPath);
}

// --- Quality Gate Evaluation ---

function evaluateQualityGate(
  selection: string,
  passRate: number
): { verdict: string; threshold: number } {
  let threshold: number;

  if (selection === "smoke") {
    threshold = 100;
  } else if (selection === "full") {
    threshold = 98;
  } else {
    // critical, sprint, frontend, backend, custom
    threshold = 95;
  }

  let verdict: string;
  if (passRate >= threshold) {
    verdict = "APPROVED";
  } else if (passRate >= threshold - 5) {
    verdict = "APPROVED WITH CONDITIONS";
  } else {
    verdict = "BLOCKED";
  }

  return { verdict, threshold };
}

// --- Report Generation ---

function generateReport(runId: string, resultsDir: string): void {
  const suiteResults = readSuiteResults(resultsDir);
  const failures = readFailures(resultsDir);
  const statusPath = join(resultsDir, "run-status.json");
  const runStatus = existsSync(statusPath)
    ? readJsonFile<RunStatus>(statusPath)
    : null;

  if (suiteResults.length === 0) {
    console.error("No suite result files found in", resultsDir);
    process.exit(1);
  }

  // Aggregate metrics
  const totals = {
    suites: suiteResults.length,
    suitesPassed: 0,
    suitesFailed: 0,
    cases: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    bugs: [] as BugEntry[],
    rateLimitHits: 0,
    selfRecoveries: 0,
  };

  for (const sr of suiteResults) {
    totals.cases += sr.totalCases ?? 0;
    totals.passed += sr.passed ?? 0;
    totals.failed += sr.failed ?? 0;
    totals.blocked += sr.blocked ?? 0;
    totals.skipped += sr.skipped ?? 0;
    totals.bugs.push(...(sr.bugs ?? []));
    totals.rateLimitHits += sr.rateLimitHits ?? 0;
    totals.selfRecoveries += (sr.selfRecoveries ?? []).length;

    if ((sr.errors ?? []).length === 0 && (sr.failed ?? 0) === 0 && (sr.blocked ?? 0) === 0) {
      totals.suitesPassed++;
    } else {
      totals.suitesFailed++;
    }
  }

  const overallPassRate =
    totals.cases > 0
      ? ((totals.passed / totals.cases) * 100).toFixed(1)
      : "0.0";

  const selection = runStatus?.selection || "unknown";
  const gate = evaluateQualityGate(selection, parseFloat(overallPassRate));

  // Bug counts by severity
  const bugsBySeverity: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  for (const bug of totals.bugs) {
    bugsBySeverity[bug.severity] = (bugsBySeverity[bug.severity] || 0) + 1;
  }

  const environment =
    suiteResults[0]?.environment || runStatus?.environment?.frontend || "N/A";
  const startedAt =
    runStatus?.startedAt ||
    suiteResults.reduce(
      (min, sr) => (sr.startedAt < min ? sr.startedAt : min),
      suiteResults[0].startedAt
    );
  const completedAt = new Date().toISOString();
  const browsers = [...new Set(suiteResults.map((sr) => sr.browser))].join(
    ", "
  );

  // --- Build Markdown Report ---

  let md = `# Regression Test Report — ${runId}\n\n`;

  // Executive Summary
  md += `## Executive Summary\n\n`;
  md += `| Field | Value |\n|-------|-------|\n`;
  md += `| **Run ID** | ${runId} |\n`;
  md += `| **Date** | ${new Date().toISOString().split("T")[0]} |\n`;
  md += `| **Environment** | ${environment} |\n`;
  md += `| **Selection** | ${selection} |\n`;
  md += `| **Browsers Used** | ${browsers} |\n`;
  md += `| **Total Suites** | ${totals.suites} |\n`;
  md += `| **Suites Passed** | ${totals.suitesPassed} |\n`;
  md += `| **Suites Failed** | ${totals.suitesFailed} |\n`;
  md += `| **Total Test Cases** | ${totals.cases} |\n`;
  md += `| **Total Passed** | ${totals.passed} |\n`;
  md += `| **Total Failed** | ${totals.failed} |\n`;
  md += `| **Total Blocked** | ${totals.blocked} |\n`;
  md += `| **Total Skipped** | ${totals.skipped} |\n`;
  md += `| **Overall Pass Rate** | ${overallPassRate}% |\n`;
  md += `| **Bugs Found** | ${totals.bugs.length} (Critical: ${bugsBySeverity.Critical}, High: ${bugsBySeverity.High}, Medium: ${bugsBySeverity.Medium}, Low: ${bugsBySeverity.Low}) |\n`;
  md += `| **Rate Limit Hits** | ${totals.rateLimitHits} |\n`;
  md += `| **Self-Recoveries** | ${totals.selfRecoveries} |\n`;
  md += `| **Total Retries** | ${failures.length} |\n\n`;

  // Quality Gate
  md += `## Quality Gate\n\n`;
  md += `| Criterion | Threshold | Actual | Verdict |\n|-----------|-----------|--------|---------|\n`;
  md += `| Pass Rate | >= ${gate.threshold}% | ${overallPassRate}% | **${gate.verdict}** |\n\n`;

  if (gate.verdict === "BLOCKED") {
    md += `> **BLOCKED**: Pass rate ${overallPassRate}% is below the ${gate.threshold}% threshold for "${selection}" selection. Deployment is NOT recommended.\n\n`;
  } else if (gate.verdict === "APPROVED WITH CONDITIONS") {
    md += `> **CONDITIONAL**: Pass rate ${overallPassRate}% is within 5% of the ${gate.threshold}% threshold. Deploy with monitoring and a hotfix plan.\n\n`;
  }

  // Suite Results Table
  md += `## Suite Results\n\n`;
  md += `| Suite | Name | Browser | Tests | Pass | Fail | Blocked | Skip | Rate | Attempts |\n`;
  md += `|-------|------|---------|-------|------|------|---------|------|------|----------|\n`;

  for (const sr of suiteResults.sort((a, b) =>
    a.suiteId.localeCompare(b.suiteId)
  )) {
    md += `| ${sr.suiteId} | ${sr.suiteName} | ${sr.browser.replace("playwright-", "")} | ${sr.totalCases} | ${sr.passed} | ${sr.failed} | ${sr.blocked} | ${sr.skipped} | ${sr.passRate} | ${sr.attempt} |\n`;
  }
  md += "\n";

  // Bugs Found
  if (totals.bugs.length > 0) {
    md += `## Bugs Found (${totals.bugs.length})\n\n`;
    md += `| Bug ID | Suite | Severity | Title | Test Case |\n`;
    md += `|--------|-------|----------|-------|-----------|\n`;

    for (const bug of totals.bugs) {
      const suite = suiteResults.find((sr) =>
        (sr.bugs ?? []).some((b) => b.id === bug.id)
      );
      md += `| ${bug.id} | ${suite?.suiteId || "?"} | ${bug.severity} | ${bug.title} | ${bug.testCaseId} |\n`;
    }
    md += "\n";

    // Bug Details
    md += `### Bug Details\n\n`;
    for (const bug of totals.bugs) {
      md += `#### ${bug.id}: ${bug.title}\n\n`;
      md += `- **Severity:** ${bug.severity}\n`;
      md += `- **Test Case:** ${bug.testCaseId}\n`;
      md += `- **Steps to Reproduce:**\n${bug.stepsToReproduce}\n`;
      md += `- **Expected:** ${bug.expected}\n`;
      md += `- **Actual:** ${bug.actual}\n`;
      if ((bug.consoleErrors ?? []).length > 0) {
        md += `- **Console Errors:** ${bug.consoleErrors.join("; ")}\n`;
      }
      md += "\n";
    }
  }

  // Retry Log
  if (failures.length > 0) {
    md += `## Retry Log (${failures.length} retries)\n\n`;
    md += `| Suite | Attempt | Browser | Error | Timestamp |\n`;
    md += `|-------|---------|---------|-------|-----------|\n`;

    for (const f of failures) {
      md += `| ${f.suiteId} | ${f.attempt} | ${f.browser.replace("playwright-", "")} | ${f.error} | ${f.timestamp} |\n`;
    }
    md += "\n";
  }

  // Suite Details
  md += `## Suite Details\n\n`;
  for (const sr of suiteResults.sort((a, b) =>
    a.suiteId.localeCompare(b.suiteId)
  )) {
    md += `### Suite ${sr.suiteId}: ${sr.suiteName}\n\n`;
    md += `- **Browser:** ${sr.browser}\n`;
    md += `- **Attempt:** ${sr.attempt}\n`;
    md += `- **Duration:** ${sr.startedAt} — ${sr.completedAt}\n`;
    md += `- **Pass Rate:** ${sr.passRate}\n\n`;

    if ((sr.testCases ?? []).length > 0) {
      md += `| ID | Title | Priority | Status | Notes |\n`;
      md += `|----|-------|----------|--------|-------|\n`;
      for (const tc of sr.testCases) {
        const notes = tc.notes
          ? tc.notes.replace(/\n/g, " ").substring(0, 80)
          : "";
        md += `| ${tc.id} | ${tc.title} | ${tc.priority} | ${tc.status} | ${notes} |\n`;
      }
      md += "\n";
    }

    if ((sr.errors ?? []).length > 0) {
      md += `**Errors:** ${sr.errors.join("; ")}\n\n`;
    }
  }

  md += `---\n\nGenerated by autonomous-regression-orchestrator | ${runId} | ${completedAt}\n`;

  // Write report
  const reportPath = join(resultsDir, "regression-report.md");
  writeFileSync(reportPath, md, "utf-8");
  console.log(`Report written to: ${reportPath}`);

  // Write summary JSON
  const summary: Summary = {
    runId,
    startedAt,
    completedAt,
    environment,
    selection,
    totalSuites: totals.suites,
    suitesCompleted: totals.suites,
    suitesPassed: totals.suitesPassed,
    suitesFailed: totals.suitesFailed,
    totalCases: totals.cases,
    totalPassed: totals.passed,
    totalFailed: totals.failed,
    totalBlocked: totals.blocked,
    totalSkipped: totals.skipped,
    overallPassRate: `${overallPassRate}%`,
    totalBugs: totals.bugs.length,
    bugsBySeverity,
    totalRetries: failures.length,
    totalRateLimitHits: totals.rateLimitHits,
    qualityGate: {
      verdict: gate.verdict,
      passRate: parseFloat(overallPassRate),
      threshold: gate.threshold,
    },
  };

  const summaryPath = join(resultsDir, "summary.json");
  writeJsonFile(summaryPath, summary);
  console.log(`Summary written to: ${summaryPath}`);
}

// --- JIRA Payload Generation ---

function generateJiraPayloads(runId: string, resultsDir: string): void {
  const suiteResults = readSuiteResults(resultsDir);
  const payloads: JiraPayload[] = [];

  for (const sr of suiteResults) {
    for (const bug of (sr.bugs ?? [])) {
      // Only auto-create tickets for Critical and High severity
      if (bug.severity !== "Critical" && bug.severity !== "High") continue;

      const jiraPriority =
        bug.severity === "Critical" ? "Highest" : "High";

      const description = [
        `h2. Bug Report — ${bug.id}`,
        "",
        `*Found during:* Regression run ${runId}, Suite ${sr.suiteId} (${sr.suiteName})`,
        `*Test Case:* ${bug.testCaseId}`,
        `*Browser:* ${sr.browser}`,
        `*Environment:* ${sr.environment}`,
        "",
        "h3. Steps to Reproduce",
        bug.stepsToReproduce,
        "",
        "h3. Expected Result",
        bug.expected,
        "",
        "h3. Actual Result",
        bug.actual,
        "",
      ];

      if ((bug.consoleErrors ?? []).length > 0) {
        description.push("h3. Console Errors");
        description.push("{code}");
        description.push(...bug.consoleErrors);
        description.push("{code}");
        description.push("");
      }

      description.push(
        `_Auto-generated by autonomous-regression-orchestrator | ${runId}_`
      );

      payloads.push({
        fields: {
          project: { key: "VCST" },
          issuetype: { name: "Bug" },
          summary: `[Regression] ${bug.title}`,
          description: description.join("\n"),
          priority: { name: jiraPriority },
          labels: [
            "regression",
            "auto-filed",
            `suite-${sr.suiteId}`,
            `run-${runId}`,
          ],
        },
        meta: {
          bugId: bug.id,
          suiteId: sr.suiteId,
          testCaseId: bug.testCaseId,
          runId,
        },
      });
    }
  }

  const outputPath = join(resultsDir, "jira-payloads.json");
  writeJsonFile(outputPath, payloads);
  console.log(
    `JIRA payloads written to: ${outputPath} (${payloads.length} tickets)`
  );
}

// --- Status Update ---

function updateStatus(
  runId: string,
  resultsDir: string,
  suiteId: string,
  status: string
): void {
  const statusPath = join(resultsDir, "run-status.json");
  const runStatus = readJsonFile<RunStatus>(statusPath);

  const suite = runStatus.suites.find((s) => s.id === suiteId);
  if (!suite) {
    console.error(`Suite ${suiteId} not found in run-status.json`);
    process.exit(1);
  }

  suite.status = status;

  if (status === "running" && !suite.startedAt) {
    suite.startedAt = new Date().toISOString();
  }

  if (status === "completed" || status === "failed") {
    suite.completedAt = new Date().toISOString();
    suite.result = status;
    runStatus.completedSuites = runStatus.suites.filter(
      (s) => s.status === "completed" || s.status === "failed"
    ).length;
  }

  // Update overall status
  const allDone = runStatus.suites.every(
    (s) => s.status === "completed" || s.status === "failed" || s.status === "blocked"
  );
  if (allDone) {
    runStatus.status = "completed";
    runStatus.completedAt = new Date().toISOString();
  }

  writeJsonFile(statusPath, runStatus);
  console.log(`Updated suite ${suiteId} to status: ${status}`);
}

// --- Main ---

function main(): void {
  const { command, args } = parseArgs();

  switch (command) {
    case "generate": {
      const runId = args["run-id"];
      const resultsDir = args["results-dir"];
      if (!runId || !resultsDir) {
        console.error(
          "Usage: npx tsx scripts/reporting.ts generate --run-id <ID> --results-dir <path>"
        );
        process.exit(1);
      }
      generateReport(runId, resultsDir);
      break;
    }

    case "jira-payloads": {
      const runId = args["run-id"];
      const resultsDir = args["results-dir"];
      if (!runId || !resultsDir) {
        console.error(
          "Usage: npx tsx scripts/reporting.ts jira-payloads --run-id <ID> --results-dir <path>"
        );
        process.exit(1);
      }
      generateJiraPayloads(runId, resultsDir);
      break;
    }

    case "update-status": {
      const runId = args["run-id"];
      const resultsDir = args["results-dir"];
      const suiteId = args["suite-id"];
      const status = args["status"];
      if (!runId || !resultsDir || !suiteId || !status) {
        console.error(
          "Usage: npx tsx scripts/reporting.ts update-status --run-id <ID> --results-dir <path> --suite-id <ID> --status <status>"
        );
        process.exit(1);
      }
      updateStatus(runId, resultsDir, suiteId, status);
      break;
    }

    default:
      console.log(`Autonomous Regression Reporting Module

Commands:
  generate       Generate consolidated markdown report and summary.json
  jira-payloads  Generate JIRA ticket payloads for Critical/High bugs
  update-status  Update a suite's status in run-status.json

Options:
  --run-id <ID>         Run identifier (e.g., AREG-2026-03-05-1430)
  --results-dir <path>  Path to results directory
  --suite-id <ID>       Suite identifier (for update-status)
  --status <status>     New status (for update-status): pending|running|completed|failed|blocked
`);
  }
}

main();
