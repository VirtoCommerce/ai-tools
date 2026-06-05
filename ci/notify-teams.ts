import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// --- Configuration ---

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
const RUN_STATUS = process.env.RUN_STATUS || "unknown";
const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || "";
const SUITE_SELECTION = process.env.SUITE_SELECTION || "unknown";
const TEST_ENVIRONMENT = process.env.TEST_ENVIRONMENT || "qa";
const TRIGGER = process.env.TRIGGER || "manual";

// Mode: "monitor" sends an Application Insights monitoring card; default is the
// regression card. The monitor twin (ci/run-monitor.ts) sets MONITOR_RUN_ID.
const NOTIFY_MODE =
  process.env.NOTIFY_MODE || (process.env.MONITOR_RUN_ID ? "monitor" : "regression");

// --- Find the latest summary.json ---

interface SuiteResultSummary {
  suiteId: string;
  description: string;
  status: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  errors?: string[];
}

interface RunSummary {
  date: string;
  environment: string;
  model: string;
  suiteSelection: string;
  maxParallel: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalSuites: number;
  passed: number;
  failed: number;
  results: SuiteResultSummary[];
}

function findSummary(): RunSummary | null {
  // Try explicit RUN_ID first (set by full-cycle pipeline)
  const runId = process.env.REGRESSION_RUN_ID;
  if (runId) {
    const explicitPath = join("reports", "regression", runId, "summary.json");
    if (existsSync(explicitPath)) {
      try { return JSON.parse(readFileSync(explicitPath, "utf-8")); } catch { /* fall through */ }
    }
  }

  // Fall back to today's date
  const date = new Date().toISOString().slice(0, 10);
  const summaryPath = join("reports", "regression", `ci-${date}`, "summary.json");
  if (existsSync(summaryPath)) {
    try { return JSON.parse(readFileSync(summaryPath, "utf-8")); } catch { /* fall through */ }
  }

  // Try yesterday (for runs that span midnight)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayPath = join("reports", "regression", `ci-${yesterday.toISOString().slice(0, 10)}`, "summary.json");
  if (existsSync(yesterdayPath)) {
    try { return JSON.parse(readFileSync(yesterdayPath, "utf-8")); } catch { /* fall through */ }
  }

  return null;
}

// --- Build Adaptive Card payload ---

function buildAdaptiveCard(summary: RunSummary | null): object {
  const isSuccess = RUN_STATUS === "success" && (!summary || summary.failed === 0);
  const isPartial = summary && summary.failed > 0 && summary.passed > 0;
  const themeColor = isSuccess ? "Good" : isPartial ? "Warning" : "Attention";
  const statusEmoji = isSuccess ? "✅" : isPartial ? "⚠️" : "❌";
  const statusText = isSuccess ? "PASSED" : isPartial ? "PARTIAL" : "FAILED";

  const triggerLabel = TRIGGER === "schedule" ? "Scheduled" : TRIGGER === "workflow_dispatch" ? "Manual" : TRIGGER;

  const facts: Array<{ title: string; value: string }> = [
    { title: "Status", value: `${statusEmoji} ${statusText}` },
    { title: "Selection", value: SUITE_SELECTION },
    { title: "Environment", value: TEST_ENVIRONMENT },
    { title: "Trigger", value: triggerLabel },
  ];

  if (summary) {
    facts.push(
      { title: "Suites", value: `${summary.passed}/${summary.totalSuites} passed` },
      { title: "Cost", value: `$${summary.totalCostUsd.toFixed(2)}` },
      { title: "Duration", value: `${(summary.totalDurationMs / 1000 / 60).toFixed(1)} min` },
      { title: "Model", value: summary.model },
    );
  }

  const body: object[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: `${statusEmoji} Regression Tests — ${statusText}`,
    },
    {
      type: "FactSet",
      facts,
    },
  ];

  // Add suite breakdown table if we have results
  if (summary && summary.results.length > 0) {
    const suiteLines = summary.results.map((r) => {
      const icon = r.status === "success" ? "✅" : "❌";
      return `${icon} **${r.suiteId}** ${r.description} — ${r.status}`;
    });

    body.push({
      type: "TextBlock",
      text: suiteLines.join("  \n"),
      wrap: true,
      size: "Small",
    });
  }

  // Add link to GitHub Actions run
  if (GITHUB_RUN_URL) {
    body.push({
      type: "ActionSet",
      actions: [
        {
          type: "Action.OpenUrl",
          title: "View Run Details",
          url: GITHUB_RUN_URL,
        },
      ],
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: {
            width: "Full",
          },
          body,
        },
      },
    ],
  };
}

// --- Monitoring (App Insights) card ---

interface MonitorSummary {
  runId: string;
  configured: boolean;
  layers: string[];
  window?: string;
  dryRun?: boolean;
  signaturesSeen?: number;
  new?: number;
  spiking?: number;
  triaged?: number;
  confirmed?: number;
  needsReview?: number;
  totalCostUsd?: number;
}

function findMonitorSummary(): MonitorSummary | null {
  const root = join("reports", "monitoring");
  const runId = process.env.MONITOR_RUN_ID;
  if (runId) {
    const p = join(root, runId, "summary.json");
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, "utf-8")); } catch { /* fall through */ }
    }
  }
  // Fall back to the most recent MONITOR-* run directory.
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("MONITOR-"))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const d of dirs) {
    const p = join(root, d, "summary.json");
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, "utf-8")); } catch { /* try next */ }
    }
  }
  return null;
}

function buildMonitorCard(summary: MonitorSummary | null): object {
  const confirmed = summary?.confirmed ?? 0;
  const needsReview = summary?.needsReview ?? 0;
  const hasFindings = confirmed > 0 || needsReview > 0;
  const statusEmoji = confirmed > 0 ? "❌" : needsReview > 0 ? "⚠️" : "✅";
  const statusText = confirmed > 0 ? "CONFIRMED BUGS" : needsReview > 0 ? "NEEDS REVIEW" : "CLEAN";

  const facts: Array<{ title: string; value: string }> = [
    { title: "Status", value: `${statusEmoji} ${statusText}` },
    { title: "Environment", value: TEST_ENVIRONMENT },
    { title: "Layers", value: (summary?.layers || []).join(", ") || "none configured" },
  ];
  if (summary) {
    facts.push(
      { title: "Window", value: summary.window || "-" },
      { title: "Signatures", value: `${summary.signaturesSeen ?? 0} seen · ${summary.new ?? 0} new · ${summary.spiking ?? 0} spiking` },
      { title: "Findings", value: `${confirmed} confirmed · ${needsReview} needs review` },
      { title: "Cost", value: `$${(summary.totalCostUsd ?? 0).toFixed(2)}${summary.dryRun ? " (dry-run)" : ""}` },
    );
  }

  const body: object[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: `${statusEmoji} App Insights Monitoring — ${statusText}`,
    },
    { type: "FactSet", facts },
  ];
  if (hasFindings) {
    body.push({
      type: "TextBlock",
      wrap: true,
      size: "Small",
      text: "Review the monitoring report under `reports/monitoring/` — no JIRA filed, no fixes attempted.",
    });
  }
  if (GITHUB_RUN_URL) {
    body.push({
      type: "ActionSet",
      actions: [{ type: "Action.OpenUrl", title: "View Run Details", url: GITHUB_RUN_URL }],
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body,
        },
      },
    ],
  };
}

// --- Send notification ---

async function sendNotification(): Promise<void> {
  if (!TEAMS_WEBHOOK_URL) {
    console.log("TEAMS_WEBHOOK_URL not set, skipping notification.");
    return;
  }

  const card =
    NOTIFY_MODE === "monitor"
      ? buildMonitorCard(findMonitorSummary())
      : buildAdaptiveCard(findSummary());

  try {
    const response = await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (response.ok) {
      console.log("Teams notification sent successfully.");
    } else {
      console.error(`Teams notification failed: ${response.status} ${response.statusText}`);
      const body = await response.text();
      console.error(`Response: ${body}`);
    }
  } catch (error) {
    console.error("Failed to send Teams notification:", error);
  }
}

sendNotification().catch((error) => {
  console.error("Notification error:", error);
  // Don't fail the pipeline for notification errors
  process.exit(0);
});
