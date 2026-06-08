import { query } from "@anthropic-ai/claude-agent-sdk";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  isLayerConfigured,
  portalSearchLink,
  queryAppInsights,
  type Layer,
} from "./lib/appinsights.js";
import {
  classify,
  loadStore,
  recordRun,
  saveStore,
  setStatus,
  signalFromRow,
  type Signal,
} from "./lib/fingerprint-store.js";
import { isAllowedRepo, routingReference, suggestRepo } from "./lib/repo-router.js";

// Layered env preload (gap-fill only — override:false, so CI `-e` values always
// win). Lets `npm run ci:monitor` work locally without exporting vars by hand,
// mirroring config.js load order. Secrets stay in .env.local. Runs before the
// config constants below read process.env.
loadEnv({ path: ".env.defaults" });
loadEnv({ path: `.env.${process.env.TEST_ENV || "vcst"}` });
loadEnv({ path: ".env.local" });
// Per-env secret promotion (e.g. APPINSIGHTS_API_KEY_BACKEND_VCST → ..._BACKEND),
// matching config.js so .env.local can carry per-env key variants.
{
  const sfx = `_${(process.env.TEST_ENV || "vcst").toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(sfx) && v && !process.env[k.slice(0, -sfx.length)]) {
      process.env[k.slice(0, -sfx.length)] = v;
    }
  }
}

/**
 * Online Monitoring CI Pipeline
 * -----------------------------
 * Headless twin of the interactive `/qa-monitoring` command. Polls Application
 * Insights for both layers, deduplicates errors via the fingerprint store,
 * triages each NEW or SPIKING signature, reproduces high-confidence REAL_BUGs
 * live, drafts bug reports (with a `## Fix Routing` block so `/qa-fix` can pick
 * them up), and writes a monitoring report. It STOPS there — no JIRA filing, no
 * auto-fix. A human reviews the report and decides.
 *
 * Safety model: read-only on App Insights + GitHub; never files JIRA; never
 * opens PRs; in DRY_RUN it triages but skips live repro and bug drafts.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MONITOR_SINCE_MIN = parseInt(process.env.MONITOR_SINCE_MIN || "35", 10);
const MONITOR_LAYERS = (process.env.MONITOR_LAYERS || "both").toLowerCase(); // both|frontend|backend
const MONITOR_MAX_SIGNALS = parseInt(process.env.MONITOR_MAX_SIGNALS || "15", 10);
const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "15.0");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "80", 10);
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";
const DRY_RUN = process.env.DRY_RUN === "true";
// Query-only: hit App Insights + fingerprint-dedup + write a report, but run NO
// triage/repro agents (so it needs no ANTHROPIC_API_KEY). A connectivity/probe smoke.
const QUERY_ONLY = process.env.MONITOR_QUERY_ONLY === "true";
const PHASE_TIMEOUT_MS = parseInt(process.env.PHASE_TIMEOUT_MS || "900000", 10); // 15 min
const SPIKE_FACTOR = parseFloat(process.env.MONITOR_SPIKE_FACTOR || "3");
const SPIKE_MIN_DELTA = parseInt(process.env.MONITOR_SPIKE_MIN_DELTA || "20", 10);
const STORE_PATH = process.env.MONITOR_STORE || "reports/monitoring/.seen-fingerprints.json";
// The store is shared across envs; the env is part of each fingerprint so vcst
// and vcptcore signatures stay separate inside the one file.
const MONITOR_ENV = process.env.TEST_ENV || "vcst";

const FRONT_URL = process.env.FRONT_URL || "";
const BACK_URL = process.env.BACK_URL || "";

const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 16).replace(":", "");
const RUN_ID = `MONITOR-${date}-${time}`;
const outputDir = join("reports", "monitoring", RUN_ID);

const TIMESPAN = `PT${MONITOR_SINCE_MIN}M`;

/** probe file (under ci/monitoring/queries) → layer it runs against. */
const PROBES: Record<Layer, string[]> = {
  backend: ["backend-exceptions", "backend-failed-requests", "backend-failed-dependencies"],
  frontend: ["frontend-exceptions", "frontend-browser-failures"],
};

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Agent phase runner (mirrors ci/run-fix-cycle.ts)
// ---------------------------------------------------------------------------

interface PhaseResult {
  costUsd: number;
  result: string;
  status: "success" | "error";
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms),
    ),
  ]);
}

const PLAYWRIGHT_MCP = {
  "playwright-chrome": {
    command: "npx",
    args: ["@playwright/mcp@latest", "--config", "ci/config/mcp-playwright-chrome.ci.json"],
  },
};

async function runPhase(
  name: string,
  prompt: string,
  budget: number,
  allowedTools: string[],
  withBrowser = false,
): Promise<PhaseResult> {
  log(`--- ${name} (budget: $${budget.toFixed(2)}) ---`);
  let costUsd = 0;
  let text = "";
  let status: "success" | "error" = "error";

  const run = async () => {
    for await (const message of query({
      prompt,
      options: {
        model: MODEL,
        maxTurns: MAX_TURNS,
        maxBudgetUsd: budget,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools,
        ...(withBrowser ? { mcpServers: PLAYWRIGHT_MCP } : {}),
      },
    })) {
      if (message.type === "result") {
        costUsd = message.total_cost_usd;
        if (message.subtype === "success") {
          text = message.result;
          status = "success";
        }
      }
    }
  };

  try {
    await withTimeout(run(), PHASE_TIMEOUT_MS, name);
  } catch (err) {
    log(`${name} error: ${err instanceof Error ? err.message : err}`);
  }
  log(`${name} done — $${costUsd.toFixed(2)} (${status})`);
  return { costUsd, result: text, status };
}

function readAgent(name: string): string {
  const p = join("ci", "agents", `${name}.md`);
  if (!existsSync(p)) throw new Error(`Agent definition not found: ${p}`);
  return readFileSync(p, "utf-8");
}

function readQuery(probe: string): string {
  return readFileSync(join("ci", "monitoring", "queries", `${probe}.kql`), "utf-8");
}

/** Extract a `MARKER: value` line from agent output (last match wins). */
function marker(text: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, "gim");
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) last = m[1].trim();
  return last;
}

// ---------------------------------------------------------------------------
// Per-signal triage + (optional) live repro
// ---------------------------------------------------------------------------

interface SignalOutcome {
  fingerprint: string;
  layer: Layer;
  probe: string;
  signature: string;
  count: number;
  class: string;
  severity: string;
  confidence: string;
  routeRepo: string;
  reproResult: string; // CONFIRMED | NOT_REPRODUCED | n/a
  bugDraftPath: string;
  rootCause: string;
  oracleMatch: string;
  portalLink: string;
  stack: string; // formatted top stack frames (exceptions only; "" otherwise)
  costUsd: number;
}

const ORACLES = [
  ".claude/agents/knowledge/vc-bug-catalog.md",
  ".claude/agents/knowledge/debugging-signals.md",
  ".claude/agents/knowledge/business-logic.md",
  ".claude/agents/knowledge/platform-patterns.md",
];

async function processSignal(sig: Signal, budget: number): Promise<SignalOutcome> {
  // Pull the (verbose) raw stack out of the sample, format it, and present it
  // separately so the prompt JSON stays readable.
  const stack = formatStack(sig.sample.sampleStack, 40);
  const { sampleStack: _rawStack, ...sampleForPrompt } = sig.sample;
  const sampleJson = JSON.stringify({ signature: sig.signature, count: sig.count, ...sampleForPrompt }, null, 2);
  const stackBlock = stack ? `\n- **Stack trace (top frames):**\n\`\`\`\n${stack}\n\`\`\`` : "";
  const guess = suggestRepo(`${sig.signature} ${JSON.stringify(sampleForPrompt)}`);
  const operationId = String(sig.sample.sampleOperationId || "");
  const portalLink = operationId ? portalSearchLink(sig.layer, operationId) : "";

  const outcome: SignalOutcome = {
    fingerprint: sig.fingerprint,
    layer: sig.layer,
    probe: sig.probe,
    signature: sig.signature,
    count: sig.count,
    class: "UNKNOWN",
    severity: "",
    confidence: "LOW",
    routeRepo: "",
    reproResult: "n/a",
    bugDraftPath: "",
    rootCause: "",
    oracleMatch: "none",
    portalLink,
    stack,
    costUsd: 0,
  };

  // --- Triage ---
  const triagePrompt = `${readAgent("monitor-triage-agent")}

## Signal Under Triage
- **Layer:** ${sig.layer}
- **Probe:** ${sig.probe}
- **Occurrences in window (${MONITOR_SINCE_MIN} min):** ${sig.count}
- **Signature:** ${sig.signature}
- **Sample row:**
\`\`\`json
${sampleJson}
\`\`\`${stackBlock}
- **Heuristic repo guess:** ${guess || "(none)"}
- **Portal link (sample telemetry):** ${portalLink || "(no operation id)"}

## Oracle files (read the relevant ones)
${ORACLES.map((o) => `- ${o}`).join("\n")}

## Allowed Target Repos (for ROUTE_REPO when REAL_BUG)
${routingReference()}

Classify this signature and output your verdict markers as instructed.`;

  const triage = await runPhase(
    `[${sig.fingerprint}] Triage`,
    triagePrompt,
    Math.min(budget * 0.3, 2.0),
    ["Read", "Glob", "Grep"],
  );
  outcome.costUsd += triage.costUsd;

  outcome.class = (marker(triage.result, "CLASS") || "UNKNOWN").toUpperCase();
  outcome.severity = marker(triage.result, "SEVERITY") || "";
  outcome.confidence = (marker(triage.result, "CONFIDENCE") || "LOW").toUpperCase();
  outcome.routeRepo = marker(triage.result, "ROUTE_REPO") || guess || "";
  outcome.rootCause = marker(triage.result, "ROOT_CAUSE") || "";
  outcome.oracleMatch = marker(triage.result, "ORACLE_MATCH") || "none";
  const reproLayer = (marker(triage.result, "REPRO_LAYER") || "none").toLowerCase();

  // --- Repro gate: only HIGH-confidence REAL_BUG with a code-fixable repo ---
  const eligible =
    outcome.class === "REAL_BUG" &&
    outcome.confidence === "HIGH" &&
    reproLayer !== "none";

  if (!eligible) return outcome;
  if (DRY_RUN) {
    outcome.reproResult = "skipped (dry-run)";
    return outcome;
  }

  // Choose the layer-appropriate QA expert + surface for live repro.
  const expert = reproLayer === "frontend" ? "qa-frontend-expert" : "qa-backend-expert";
  const surface = reproLayer === "frontend" ? FRONT_URL : BACK_URL;
  const routeOk = isAllowedRepo(outcome.routeRepo);
  const draftPath = join("reports", "bugs", "open", `BUG-AI-${sig.fingerprint}-${date}.md`);

  const reproPrompt = `${readAgent(expert)}

## Online-Monitoring Repro Task (run ${RUN_ID})

An Application Insights signature was triaged as a REAL_BUG (HIGH confidence). Your
job is to **reproduce it live as a real user** on the QA environment and, only if
you genuinely reproduce it, draft a bug report.

- **Layer:** ${sig.layer}  | **Repro surface:** ${surface}
- **Signature:** ${sig.signature}
- **Triage root-cause hypothesis:** ${outcome.rootCause}
- **Suggested repo:** ${outcome.routeRepo}${routeOk ? "" : " (NOT in allowlist — set ROUTE_REPO: ambiguous)"}
- **Sample telemetry:**
\`\`\`json
${sampleJson}
\`\`\`${stackBlock}

## Rules
- Use the browser like a real user (navigate, click, type) — never force disabled
  controls, never bypass the UI with scripts. Backend signals may be confirmed via
  a real API/Admin interaction.
- Do NOT write to JIRA or GitHub. Do NOT open PRs. This step only reproduces + drafts.
- If you CANNOT reproduce it, say so — do not invent steps.

## If (and only if) you reproduce it
Write a bug report to: \`${draftPath}\`
Follow the standard bug-report structure (Title + severity, Env 1 line, Summary ≤3
sentences, numbered STR from the nearest relevant state, Expected vs Actual, 1–2
inline screenshots). Include the App Insights stack trace (top frames, shown above)
in an Evidence/Root-cause section — it usually points straight at the failing code.
ALSO include this handoff block verbatim so /qa-fix can pick it up:

\`\`\`
## Fix Routing (→ /qa-fix)
- **Owning layer:** ${reproLayer === "frontend" ? "Layer 1 — Storefront" : "Layer 3/4 — xAPI/REST"}
- **Suggested repo:** ${outcome.routeRepo}
- **Component / module:** <fill in>
- **RCA anchor:** ${outcome.rootCause}
- **Routing confidence:** ${routeOk ? "MEDIUM" : "LOW"}
- **Source:** App Insights ${sig.layer} ${sig.probe} — ${RUN_ID}
\`\`\`

## End your reply with these markers on their own lines
- \`REPRO_RESULT: CONFIRMED\` | \`NOT_REPRODUCED\`
- \`BUG_DRAFT_PATH: ${draftPath}\` (only if CONFIRMED; else "n/a")`;

  const repro = await runPhase(
    `[${sig.fingerprint}] Repro (${expert})`,
    reproPrompt,
    Math.min(budget * 0.7, 6.0),
    ["Read", "Glob", "Grep", "Write", "Bash"],
    true, // browser
  );
  outcome.costUsd += repro.costUsd;

  outcome.reproResult = (marker(repro.result, "REPRO_RESULT") || "NOT_REPRODUCED").toUpperCase();
  if (outcome.reproResult === "CONFIRMED") {
    const path = marker(repro.result, "BUG_DRAFT_PATH") || draftPath;
    outcome.bugDraftPath = existsSync(path) ? path : "";
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function buildReport(
  outcomes: SignalOutcome[],
  totals: { queried: number; fresh: number; spiking: number; triaged: number; capped: number },
  totalCost: number,
): string {
  const confirmed = outcomes.filter((o) => o.reproResult === "CONFIRMED");
  const needsReview = outcomes.filter(
    (o) => o.class === "REAL_BUG" && o.reproResult !== "CONFIRMED",
  );
  const dismissed = outcomes.filter((o) => o.class !== "REAL_BUG");

  let md = `# Monitoring Report — ${RUN_ID}

- **Env:** ${BACK_URL} (backend) · ${FRONT_URL} (storefront)
- **Window:** last ${MONITOR_SINCE_MIN} min · **Layers:** ${MONITOR_LAYERS} · **Model:** ${MODEL}${DRY_RUN ? " · DRY_RUN" : ""}
- **Signatures:** ${totals.queried} seen · ${totals.fresh} new · ${totals.spiking} spiking · ${totals.triaged} triaged${totals.capped ? ` · ${totals.capped} over cap (not triaged)` : ""}
- **Confirmed bugs:** ${confirmed.length} · **Needs review:** ${needsReview.length} · **Cost:** $${totalCost.toFixed(2)}

`;

  if (confirmed.length) {
    md += `## Confirmed bugs (live-reproduced — review & file)\n\n`;
    md += `| Severity | Layer | Signature | Repo | Draft | Telemetry |\n|---|---|---|---|---|---|\n`;
    for (const o of confirmed) {
      md += `| ${o.severity || "?"} | ${o.layer} | ${trunc(o.signature, 60)} | ${o.routeRepo || "-"} | ${o.bugDraftPath ? `\`${o.bugDraftPath}\`` : "(not written)"} | ${o.portalLink ? `[open](${o.portalLink})` : "-"} |\n`;
    }
    md += `\n`;
    md += stackBlocks(confirmed);
  }

  if (needsReview.length) {
    md += `## Needs human review (REAL_BUG, not auto-reproduced)\n\n`;
    md += `| Conf. | Layer | Signature | Hypothesis | Telemetry |\n|---|---|---|---|---|\n`;
    for (const o of needsReview) {
      md += `| ${o.confidence} | ${o.layer} | ${trunc(o.signature, 60)} | ${trunc(o.rootCause, 50)} | ${o.portalLink ? `[open](${o.portalLink})` : "-"} |\n`;
    }
    md += `\n`;
    md += stackBlocks(needsReview);
  }

  if (dismissed.length) {
    md += `## Dismissed (noise / known / config / third-party / transient)\n\n`;
    md += `| Class | Layer | Signature | Oracle |\n|---|---|---|---|\n`;
    for (const o of dismissed) {
      md += `| ${o.class} | ${o.layer} | ${trunc(o.signature, 60)} | ${o.oracleMatch} |\n`;
    }
    md += `\n`;
  }

  md += `_No JIRA tickets filed and no fixes attempted — this run only detects and reports. Use \`/qa-bug\` / \`/qa-fix\` on the confirmed drafts above._\n`;
  return md;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Turn the App Insights `details` JSON (an array of exception details, each with a
 * `parsedStack`) into a readable `  at Method:line` stack, capped at maxFrames.
 * Returns "" for non-exception signals (requests/dependencies have no stack).
 */
/** Render compact "top frames" stack blocks (≤6 lines each) for report items. */
function stackBlocks(items: SignalOutcome[]): string {
  const withStack = items.filter((o) => o.stack);
  if (!withStack.length) return "";
  return (
    withStack
      .map((o) => `_Stack — ${trunc(o.signature, 70)}:_\n\`\`\`\n${o.stack.split("\n").slice(0, 6).join("\n")}\n\`\`\``)
      .join("\n\n") + "\n\n"
  );
}

function formatStack(raw: unknown, maxFrames = 12): string {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const details = JSON.parse(raw) as Array<{
      message?: string;
      parsedStack?: Array<{ method?: string; line?: number; fileName?: string }>;
    }>;
    const lines: string[] = [];
    for (const d of details) {
      for (const f of d.parsedStack || []) {
        const loc = f.line ? `:${f.line}` : "";
        lines.push(`  at ${f.method ?? "?"}${loc}`);
        if (lines.length >= maxFrames) return lines.join("\n");
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/** Report for MONITOR_QUERY_ONLY: connectivity/probe smoke, no triage. */
function buildQueryOnlyReport(
  layers: Layer[],
  candidates: Signal[],
  counts: { queried: number; fresh: number; spiking: number },
): string {
  let md = `# Monitoring Report (query-only) — ${RUN_ID}

- **Env:** ${BACK_URL} (backend) · ${FRONT_URL} (storefront)
- **Window:** last ${MONITOR_SINCE_MIN} min · **Layers:** ${layers.join(", ")} · **Mode:** query-only (no triage)
- **Signatures:** ${counts.queried} seen · ${counts.fresh} new · ${counts.spiking} spiking

`;
  if (candidates.length) {
    md += `## New / spiking signatures (would be triaged in a full run)\n\n`;
    md += `| Layer | Probe | Count | Signature |\n|---|---|---|---|\n`;
    for (const s of candidates) {
      md += `| ${s.layer} | ${s.probe} | ${s.count} | ${trunc(s.signature, 70)} |\n`;
    }
    md += `\n`;
  } else {
    md += `_No new or spiking signatures in this window._\n\n`;
  }
  md += `_Query-only smoke: App Insights auth + queries + fingerprint dedup verified. Run without MONITOR_QUERY_ONLY to triage + reproduce._\n`;
  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function resolveLayers(): Layer[] {
  if (MONITOR_LAYERS === "frontend") return ["frontend"];
  if (MONITOR_LAYERS === "backend") return ["backend"];
  return ["backend", "frontend"];
}

function validateEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing required environment variable: ANTHROPIC_API_KEY");
    process.exit(1);
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true });

  log(`=== Online Monitoring: ${RUN_ID} ===`);
  log(`Window: ${TIMESPAN} | Layers: ${MONITOR_LAYERS} | Budget: $${MAX_BUDGET_USD} | DryRun: ${DRY_RUN}`);

  const layers = resolveLayers().filter((l) => {
    if (!isLayerConfigured(l)) {
      log(`Layer "${l}" not configured (missing App ID / API key) — skipping.`);
      return false;
    }
    return true;
  });

  // No App Insights configured → nothing to monitor. No agent work, so we don't
  // even need ANTHROPIC_API_KEY here — exit cleanly so the dry-run smoke passes.
  if (layers.length === 0) {
    log("No App Insights layers configured. Set APPINSIGHTS_APP_ID_* + APPINSIGHTS_API_KEY_* to enable monitoring.");
    writeFileSync(
      join(outputDir, "summary.json"),
      JSON.stringify({ runId: RUN_ID, date, configured: false, layers: [], confirmed: 0 }, null, 2),
    );
    process.exit(0);
  }

  // --- Query App Insights → signals ---
  const allSignals: Signal[] = [];
  for (const layer of layers) {
    for (const probe of PROBES[layer]) {
      const res = await queryAppInsights(layer, readQuery(probe), TIMESPAN);
      if (!res.ok) {
        log(`Query ${layer}/${probe} failed: ${res.error}`);
        continue;
      }
      const sigs = res.rows.map((r) => signalFromRow(MONITOR_ENV, layer, probe, r)).filter((s): s is Signal => s !== null);
      log(`Query ${layer}/${probe}: ${sigs.length} signatures (${res.elapsed_ms}ms)`);
      allSignals.push(...sigs);
    }
  }

  // --- Dedup / classify against the store ---
  const store = loadStore(STORE_PATH);
  const { fresh, spiking, stable } = classify(store, allSignals, {
    spikeFactor: SPIKE_FACTOR,
    spikeMinDelta: SPIKE_MIN_DELTA,
  });
  log(`Classified: ${fresh.length} new, ${spiking.length} spiking, ${stable.length} stable (skipped)`);

  let candidates = [...fresh, ...spiking].sort((a, b) => b.count - a.count);
  let capped = 0;
  if (candidates.length > MONITOR_MAX_SIGNALS) {
    capped = candidates.length - MONITOR_MAX_SIGNALS;
    log(`Capping triage at ${MONITOR_MAX_SIGNALS} signals — ${capped} lower-volume signatures deferred to next run.`);
    candidates = candidates.slice(0, MONITOR_MAX_SIGNALS);
  }

  // --- Query-only smoke: report signatures, persist baseline, no triage ---
  if (QUERY_ONLY) {
    recordRun(store, allSignals, RUN_ID);
    saveStore(store, STORE_PATH);
    writeFileSync(
      join(outputDir, "monitoring-report.md"),
      buildQueryOnlyReport(layers, candidates, { queried: allSignals.length, fresh: fresh.length, spiking: spiking.length }),
    );
    writeFileSync(
      join(outputDir, "summary.json"),
      JSON.stringify(
        { runId: RUN_ID, date, configured: true, mode: "query-only", layers, window: TIMESPAN, signaturesSeen: allSignals.length, new: fresh.length, spiking: spiking.length, candidates: candidates.length },
        null,
        2,
      ),
    );
    log(`\n=== Query-only done. Report: ${join(outputDir, "monitoring-report.md")} ===`);
    log(`Signatures: ${allSignals.length} seen, ${fresh.length} new, ${spiking.length} spiking.`);
    process.exit(0);
  }

  // Triage/repro need the SDK — require the key only once there's real agent work.
  validateEnv();

  // --- Triage (+ repro) each candidate within budget ---
  const outcomes: SignalOutcome[] = [];
  let budgetLeft = MAX_BUDGET_USD;
  let budgetHit = false;

  for (let i = 0; i < candidates.length; i++) {
    if (budgetLeft <= 1.0) {
      budgetHit = true;
      log(`Budget exhausted after ${i}/${candidates.length} signals.`);
      break;
    }
    const remaining = candidates.length - i;
    const perSignal = Math.max(budgetLeft / remaining, 1.5);
    const out = await processSignal(candidates[i], Math.min(perSignal, budgetLeft));
    outcomes.push(out);
    budgetLeft -= out.costUsd;

    // Persist the triage outcome into the store.
    const status =
      out.reproResult === "CONFIRMED"
        ? "confirmed"
        : out.class === "REAL_BUG"
          ? "triaged"
          : out.class === "NOISE" || out.class === "THIRD_PARTY" || out.class === "TRANSIENT"
            ? "noise"
            : "triaged";
    setStatus(store, out.fingerprint, status, { class: out.class, severity: out.severity });
  }

  // --- Update baselines for everything seen this run, then persist ---
  recordRun(store, allSignals, RUN_ID);
  saveStore(store, STORE_PATH);

  // --- Report + summary ---
  const totalCost = outcomes.reduce((s, o) => s + o.costUsd, 0);
  const confirmed = outcomes.filter((o) => o.reproResult === "CONFIRMED");
  const report = buildReport(
    outcomes,
    {
      queried: allSignals.length,
      fresh: fresh.length,
      spiking: spiking.length,
      triaged: outcomes.length,
      capped,
    },
    totalCost,
  );
  writeFileSync(join(outputDir, "monitoring-report.md"), report);
  writeFileSync(
    join(outputDir, "summary.json"),
    JSON.stringify(
      {
        runId: RUN_ID,
        date,
        configured: true,
        layers,
        window: TIMESPAN,
        model: MODEL,
        dryRun: DRY_RUN,
        signaturesSeen: allSignals.length,
        new: fresh.length,
        spiking: spiking.length,
        triaged: outcomes.length,
        capped,
        confirmed: confirmed.length,
        needsReview: outcomes.filter((o) => o.class === "REAL_BUG" && o.reproResult !== "CONFIRMED").length,
        totalCostUsd: totalCost,
        outcomes,
      },
      null,
      2,
    ),
  );

  log(`\n=== Done. Report: ${join(outputDir, "monitoring-report.md")} ===`);
  log(`Confirmed: ${confirmed.length} | Triaged: ${outcomes.length} | Cost: $${totalCost.toFixed(2)}`);

  // Exit codes: 1 = confirmed bug(s) drafted, 2 = budget/limit only, 0 = clean.
  if (confirmed.length > 0) process.exit(1);
  if (budgetHit) process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
