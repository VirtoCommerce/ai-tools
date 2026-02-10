import { readFileSync, existsSync } from "fs";
import { join } from "path";

// --- Configuration ---

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
const RUN_STATUS = process.env.RUN_STATUS || "unknown";
const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || "";
const SUITE_SELECTION = process.env.SUITE_SELECTION || "unknown";
const TEST_ENVIRONMENT = process.env.TEST_ENVIRONMENT || "qa";
const TRIGGER = process.env.TRIGGER || "manual";

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
  const date = new Date().toISOString().slice(0, 10);
  const summaryPath = join("reports", "regression", `ci-${date}`, "summary.json");

  if (existsSync(summaryPath)) {
    try {
      return JSON.parse(readFileSync(summaryPath, "utf-8"));
    } catch {
      return null;
    }
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

// --- Send notification ---

async function sendNotification(): Promise<void> {
  if (!TEAMS_WEBHOOK_URL) {
    console.log("TEAMS_WEBHOOK_URL not set, skipping notification.");
    return;
  }

  const summary = findSummary();
  const card = buildAdaptiveCard(summary);

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
