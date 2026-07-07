/**
 * Teams notification for /qa-monitoring — Application Insights monitoring card.
 * ------------------------------------------------------------------------------
 * Self-contained for the `vc-fix` plugin: extracted from the full `vc-qa`
 * plugin's `ci/notify-teams.ts`, which also sends a regression-run card — that
 * mode is dropped here since `vc-fix` ships no regression pipeline. Loads the
 * layered `.env.defaults` / `.env.${TEST_ENV}` / `.env.local` files directly
 * (the same precedence `config.js` uses) rather than importing `config.js`
 * itself — this script only needs `TEAMS_WEBHOOK_URL` + `TEST_ENV`, and
 * `config.js`'s `coreRequiredVars` check would `process.exit(1)` if unrelated
 * vars like `FRONT_URL`/`ADMIN_PASSWORD` are unset, even though a monitoring
 * notification doesn't touch them.
 *
 * No-ops with a clear message when `TEAMS_WEBHOOK_URL` is unset — Teams
 * notification is optional; `/qa-monitoring` still runs and reports without it.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "../../scripts/lib/resolve-test-env.js";

const TEST_ENV = resolveTestEnv("vcst");
dotenv({ path: ".env.defaults", quiet: true });
dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
dotenv({ path: ".env.local", override: true, quiet: true });
const ENV_SUFFIX = `_${TEST_ENV.toUpperCase()}`;
for (const [key, value] of Object.entries(process.env)) {
  if (key.endsWith(ENV_SUFFIX) && value) process.env[key.slice(0, -ENV_SUFFIX.length)] = value;
}

const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || "";

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

/** Find the summary.json for a specific run, or fall back to the most recent MONITOR-* dir. */
function findMonitorSummary(): MonitorSummary | null {
  const root = join("reports", "monitoring");
  const runId = process.env.MONITOR_RUN_ID;
  if (runId) {
    const p = join(root, runId, "summary.json");
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        /* fall through */
      }
    }
  }
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("MONITOR-"))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const d of dirs) {
    const p = join(root, d, "summary.json");
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf-8"));
      } catch {
        /* try next */
      }
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
    { title: "Environment", value: TEST_ENV || "qa" },
    { title: "Layers", value: (summary?.layers || []).join(", ") || "none configured" },
  ];
  if (summary) {
    facts.push(
      { title: "Window", value: summary.window || "-" },
      {
        title: "Signatures",
        value: `${summary.signaturesSeen ?? 0} seen · ${summary.new ?? 0} new · ${summary.spiking ?? 0} spiking`,
      },
      { title: "Findings", value: `${confirmed} confirmed · ${needsReview} needs review` },
      {
        title: "Cost",
        value: `$${(summary.totalCostUsd ?? 0).toFixed(2)}${summary.dryRun ? " (dry-run)" : ""}`,
      },
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
      text: "Review the monitoring report under `reports/monitoring/` — no ticket filed, no fixes attempted.",
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

async function sendNotification(): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("TEAMS_WEBHOOK_URL not set, skipping notification.");
    return;
  }

  const card = buildMonitorCard(findMonitorSummary());

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (response.ok) {
      console.log("Teams notification sent successfully.");
    } else {
      console.error(`Teams notification failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${await response.text()}`);
    }
  } catch (error) {
    console.error("Failed to send Teams notification:", error);
  }
}

sendNotification().catch((error) => {
  console.error("Notification error:", error);
  // Don't fail the /qa-monitoring run for a notification error.
  process.exit(0);
});
