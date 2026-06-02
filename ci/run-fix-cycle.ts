import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  checkoutForFix,
  isAllowedRepo,
  repoProfile,
  routingReference,
  suggestRepo,
  REPO_ORG,
} from "./lib/repo-router.js";
import { dependenciesOf, dependentsOf } from "./lib/module-registry.js";

/**
 * Auto-Fix CI Pipeline
 * --------------------
 * Reads JIRA bug tickets, and for each one: triages (is this a real, code-fixable
 * defect?), checks out the relevant *product* repo (vc-frontend / vc-module-* /
 * vc-platform), reproduces the bug as a failing test, fixes it, verifies
 * (build + lint + type-check + red→green test), and opens a DRAFT pull request
 * with evidence. A human reviews and merges; the existing regression pipeline
 * re-verifies after deploy.
 *
 * Safety model: draft PRs only, never auto-merge; repo allowlist; by-design gate;
 * low-confidence fixes are skipped (JIRA comment) rather than PR'd.
 *
 * GitHub ops use the `gh` CLI (needs a token with repo write on the product
 * repos). JIRA ops use the REST API (optional — skipped if creds absent).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Comma-separated VCST keys (manual mode). If empty, discover via FIX_JQL. */
const FIX_TICKETS = (process.env.FIX_TICKETS || "").trim();
const FIX_LABEL = process.env.FIX_LABEL || "qa-autofix";
const FIX_JQL =
  process.env.FIX_JQL ||
  `project = VCST AND issuetype = Bug AND statusCategory != Done AND labels = "${FIX_LABEL}" ORDER BY priority DESC`;

const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "30.0");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "150", 10);
const MAX_TICKETS = parseInt(process.env.MAX_TICKETS || "5", 10);
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";
const DRY_RUN = process.env.DRY_RUN === "true";
const PHASE_TIMEOUT_MS = parseInt(process.env.PHASE_TIMEOUT_MS || "1800000", 10); // 30 min

// JIRA REST (optional)
const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
const JIRA_EMAIL = process.env.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";
const JIRA_TRANSITION = process.env.JIRA_TRANSITION || "In Review";
const jiraEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);

const WORKSPACE_DIR = process.env.FIX_WORKSPACE || ".fix-workspace";

const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 16).replace(":", "");
const RUN_ID = `FIX-${date}-${time}`;
const outputDir = join("reports", "fixes", RUN_ID);

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// JIRA REST helpers (guarded — no-op when creds are absent)
// ---------------------------------------------------------------------------

function jiraAuthHeader(): string {
  return "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
}

interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  components: string[];
  labels: string[];
  assignee: string | null;
  raw: unknown;
}

/** Flatten Atlassian Document Format (ADF) to plain text (best-effort). */
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[]; type?: string };
  if (typeof n.text === "string") return n.text;
  let out = "";
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += adfToText(child);
    if (["paragraph", "heading", "listItem", "blockquote"].includes(n.type || "")) out += "\n";
  }
  return out;
}

async function jiraGetIssue(key: string): Promise<JiraTicket | null> {
  if (!jiraEnabled) return null;
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${key}`, {
    headers: { Authorization: jiraAuthHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    log(`JIRA: failed to fetch ${key} — ${res.status}`);
    return null;
  }
  const data = (await res.json()) as any;
  const f = data.fields || {};
  return {
    key: data.key,
    summary: f.summary || "",
    description: adfToText(f.description).trim(),
    status: f.status?.name || "",
    priority: f.priority?.name || "",
    components: (f.components || []).map((c: any) => c.name),
    labels: f.labels || [],
    assignee: f.assignee?.displayName || null,
    raw: data,
  };
}

async function jiraSearch(jql: string, max: number): Promise<string[]> {
  if (!jiraEnabled) return [];
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search`, {
    method: "POST",
    headers: {
      Authorization: jiraAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ jql, maxResults: max, fields: ["key"] }),
  });
  if (!res.ok) {
    log(`JIRA: search failed — ${res.status}`);
    return [];
  }
  const data = (await res.json()) as any;
  return (data.issues || []).map((i: any) => i.key);
}

async function jiraComment(key: string, text: string): Promise<void> {
  if (!jiraEnabled || DRY_RUN) {
    log(`JIRA: (skipped${DRY_RUN ? " dry-run" : ""}) comment on ${key}`);
    return;
  }
  const body = {
    body: {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
  const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: {
      Authorization: jiraAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) log(`JIRA: comment on ${key} failed — ${res.status}`);
}

async function jiraTransition(key: string, transitionName: string): Promise<void> {
  if (!jiraEnabled || DRY_RUN) {
    log(`JIRA: (skipped${DRY_RUN ? " dry-run" : ""}) transition ${key} → ${transitionName}`);
    return;
  }
  const tRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: jiraAuthHeader(), Accept: "application/json" },
  });
  if (!tRes.ok) return;
  const tData = (await tRes.json()) as any;
  const match = (tData.transitions || []).find(
    (t: any) => t.name.toLowerCase() === transitionName.toLowerCase(),
  );
  if (!match) {
    log(`JIRA: no transition "${transitionName}" available for ${key}`);
    return;
  }
  await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    headers: {
      Authorization: jiraAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

// ---------------------------------------------------------------------------
// Bug-report lookup (links the JIRA key to a local reports/bugs/*.md file)
// ---------------------------------------------------------------------------

function findBugReport(key: string): string | null {
  const root = join("reports", "bugs");
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = join(dir, d.name);
        if (d.isDirectory()) {
          stack.push(p);
          return [];
        }
        return d.name.endsWith(".md") ? [p] : [];
      });
    } catch {
      continue;
    }
    for (const file of entries) {
      try {
        if (readFileSync(file, "utf-8").includes(key)) return file;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Agent phase runner
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

async function runPhase(
  name: string,
  prompt: string,
  budget: number,
  allowedTools: string[],
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

/** Extract a `MARKER: value` line from agent output (last match wins). */
function marker(text: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, "gim");
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) last = m[1].trim();
  return last;
}

// ---------------------------------------------------------------------------
// Per-ticket pipeline
// ---------------------------------------------------------------------------

type TicketOutcome =
  | "pr_opened"
  | "bailed_by_design"
  | "fix_failed"
  | "low_confidence"
  | "error";

interface TicketResult {
  key: string;
  outcome: TicketOutcome;
  repo?: string;
  prUrl?: string;
  reason?: string;
  costUsd: number;
}

async function processTicket(
  key: string,
  ticketBudget: number,
  ticketDir: string,
): Promise<TicketResult> {
  mkdirSync(ticketDir, { recursive: true });
  let spent = 0;

  // --- Gather context: JIRA ticket + linked bug report ---
  const ticket = await jiraGetIssue(key);
  const bugReportPath = findBugReport(key);
  const bugReport = bugReportPath ? readFileSync(bugReportPath, "utf-8") : "";

  if (!ticket && !bugReport) {
    return {
      key,
      outcome: "error",
      reason: "No JIRA access and no local bug report found",
      costUsd: 0,
    };
  }

  const ticketJson = {
    key,
    summary: ticket?.summary || "",
    description: ticket?.description || "",
    components: ticket?.components || [],
    priority: ticket?.priority || "",
    labels: ticket?.labels || [],
    assignee: ticket?.assignee || null,
    bugReportPath,
  };
  writeFileSync(join(ticketDir, "ticket.json"), JSON.stringify(ticketJson, null, 2));
  if (bugReport) writeFileSync(join(ticketDir, "bug-report.md"), bugReport);

  const contextText = `${ticket?.summary || ""}\n${ticket?.description || ""}\n${ticket?.components?.join(" ") || ""}\n${bugReport}`;
  const guess = suggestRepo(contextText);

  // --- Phase 0: Triage gate ---
  const triagePrompt = `${readAgent("fix-triage-agent")}

## Ticket Under Triage
- **Key:** ${key}
- **Ticket JSON:** ${join(ticketDir, "ticket.json")}
- **Linked bug report:** ${bugReportPath || "(none found)"}
- **Heuristic repo guess:** ${guess || "(none)"}

## Allowed Target Repos (you MUST pick one of these for ROUTE_REPO)
${routingReference()}

Read the ticket JSON and bug report, then output your verdict markers as instructed.`;

  const triage = await runPhase(
    `[${key}] Phase 0: Triage`,
    triagePrompt,
    ticketBudget * 0.15,
    ["Read", "Glob", "Grep", "Bash"],
  );
  spent += triage.costUsd;
  writeFileSync(join(ticketDir, "phase0-triage.txt"), triage.result);

  const verdict = (marker(triage.result, "VERDICT") || "").toUpperCase();
  const routeRepo = marker(triage.result, "ROUTE_REPO") || guess || "";
  const bailReason = marker(triage.result, "BAIL_REASON") || "Triage declined (no reason given)";

  if (verdict !== "GO") {
    await jiraComment(
      key,
      `[auto-fix] Skipped: ${bailReason} — left for human review. (run ${RUN_ID})`,
    );
    return { key, outcome: "bailed_by_design", reason: bailReason, costUsd: spent };
  }
  if (!isAllowedRepo(routeRepo)) {
    return {
      key,
      outcome: "error",
      reason: `Triage chose repo not in allowlist: "${routeRepo}"`,
      costUsd: spent,
    };
  }

  // --- Checkout product source (deterministic) ---
  let checkout;
  try {
    checkout = checkoutForFix(routeRepo, key, WORKSPACE_DIR);
  } catch (err) {
    return {
      key,
      outcome: "error",
      repo: routeRepo,
      reason: `Checkout failed: ${err instanceof Error ? err.message : err}`,
      costUsd: spent,
    };
  }
  const profile = repoProfile(routeRepo);
  const prBodyPath = join(ticketDir, "PR_BODY.md");

  // --- Dependency context (best-effort; from module.manifest) ---
  // Backend modules resolve dependencies as NuGet packages, so the checkout
  // still builds. But the graph tells the agent where the root cause *could*
  // live (a dependency) and which modules a base-module fix would impact.
  let depBlock = "";
  if (profile.kind !== "frontend") {
    try {
      const fmt = (d: { moduleId: string; repo: string | null }) =>
        `  - ${d.moduleId}${d.repo ? ` → ${REPO_ORG}/${d.repo}` : " (repo unresolved)"}`;
      const deps = await dependenciesOf(routeRepo);
      if (deps.length) {
        depBlock = `\n## Module dependencies of ${routeRepo}\nThis module depends on (resolved as NuGet packages at build time):\n${deps
          .map(fmt)
          .join("\n")}\n`;
      }
      if (process.env.FIX_IMPACT_ANALYSIS === "true") {
        const dependents = await dependentsOf(routeRepo);
        if (dependents.length) {
          depBlock += `\n## Modules that depend ON ${routeRepo} (impacted by a fix here)\n${dependents
            .map(fmt)
            .join("\n")}\nA change here only reaches these after a new package version is published.\n`;
        }
      }
    } catch (err) {
      log(`[${key}] dependency lookup skipped: ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- Phase 1: Reproduce → Fix → Verify ---
  const devAgent = profile.kind === "frontend" ? "fix-frontend-agent" : "fix-backend-agent";
  const fixPrompt = `${readAgent(devAgent)}

## Fix Assignment
- **JIRA key:** ${key}
- **Target repo:** ${routeRepo} (${profile.kind})
- **Checkout path (your working directory):** ${checkout.path}
- **Work branch (already created & checked out):** ${checkout.workBranch}
- **Base branch:** ${checkout.baseBranch}
- **Ticket JSON:** ${join(ticketDir, "ticket.json")}
- **Bug report:** ${bugReportPath || "(none — use ticket description)"}
${depBlock}
## Cross-module rule
If the root cause is **not** in this repo but in one of its dependencies above,
do **NOT** patch around it here. Stop and report \`FIX_STATUS: FAILED\` with
\`ROOT_CAUSE: belongs in <dependency module/repo>\` — cross-module fixes need a
human to coordinate the dependency change, version bump, and package publish.

## Toolchain (run inside the checkout path)
- Install: \`${profile.installCmd}\`
- Build: \`${profile.buildCmd}\`
${profile.typecheckCmd ? `- Type-check: \`${profile.typecheckCmd}\`\n` : ""}${profile.lintCmd ? `- Lint: \`${profile.lintCmd}\`\n` : ""}- Test: \`${profile.testCmd}\`

## Required Outputs
1. Implement the fix on the work branch with a minimal diff.
2. Add a test that fails before your fix and passes after (red→green).
3. Run build${profile.typecheckCmd ? " + type-check" : ""}${profile.lintCmd ? " + lint" : ""} + test — all must pass.
4. Commit (Conventional Commits, reference ${key}) and \`git push -u origin ${checkout.workBranch}\`.
5. Write the PR description to: ${prBodyPath}
6. End your reply with these markers on their own lines:
   - \`FIX_STATUS: SUCCESS\` | \`PARTIAL\` | \`FAILED\`
   - \`PR_TITLE: <conventional-commit-style title>\`
   - \`CONFIDENCE: HIGH\` | \`MEDIUM\` | \`LOW\`
   - \`ROOT_CAUSE: <one sentence>\`

If you cannot produce a confident fix, set FIX_STATUS: FAILED and explain why — do NOT push speculative changes.`;

  const fix = await runPhase(
    `[${key}] Phase 1: Fix (${profile.kind})`,
    fixPrompt,
    ticketBudget * 0.7,
    ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
  );
  spent += fix.costUsd;
  writeFileSync(join(ticketDir, "phase1-fix.txt"), fix.result);

  const fixStatus = (marker(fix.result, "FIX_STATUS") || "FAILED").toUpperCase();
  const confidence = (marker(fix.result, "CONFIDENCE") || "LOW").toUpperCase();
  const prTitle = marker(fix.result, "PR_TITLE") || `fix: ${ticket?.summary || key} (${key})`;
  const rootCause = marker(fix.result, "ROOT_CAUSE") || "";

  if (fixStatus !== "SUCCESS" || confidence === "LOW") {
    await jiraComment(
      key,
      `[auto-fix] Could not produce a confident fix (status=${fixStatus}, confidence=${confidence}). ${rootCause} Left for a human. (run ${RUN_ID})`,
    );
    return {
      key,
      outcome: fixStatus !== "SUCCESS" ? "fix_failed" : "low_confidence",
      repo: routeRepo,
      reason: rootCause,
      costUsd: spent,
    };
  }

  // --- Open DRAFT PR (deterministic, via gh) ---
  let prUrl = "";
  const prBody = existsSync(prBodyPath)
    ? readFileSync(prBodyPath, "utf-8")
    : `Automated fix for ${key}.\n\nRoot cause: ${rootCause}\n`;

  if (DRY_RUN) {
    log(`[${key}] (dry-run) would open draft PR on ${routeRepo}: ${prTitle}`);
    prUrl = "(dry-run — no PR created)";
  } else {
    try {
      prUrl = execSync(
        `gh pr create --repo ${routeRepo} --draft --base ${checkout.baseBranch} ` +
          `--head ${checkout.workBranch} --title ${JSON.stringify(prTitle)} ` +
          `--body-file ${JSON.stringify(prBodyPath)} --label ${JSON.stringify(FIX_LABEL)}`,
        { encoding: "utf-8" },
      ).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[${key}] gh pr create failed: ${msg}`);
      await jiraComment(
        key,
        `[auto-fix] Fix pushed to branch ${checkout.workBranch} on ${routeRepo}, but draft PR creation failed: ${msg}. (run ${RUN_ID})`,
      );
      return { key, outcome: "error", repo: routeRepo, reason: `PR creation failed: ${msg}`, costUsd: spent };
    }
  }

  // --- Update JIRA ---
  await jiraComment(
    key,
    `[auto-fix] Draft PR opened: ${prUrl}\nRoot cause: ${rootCause}\nConfidence: ${confidence}. Please review & merge. (run ${RUN_ID})`,
  );
  await jiraTransition(key, JIRA_TRANSITION);

  writeFileSync(
    join(ticketDir, "result.json"),
    JSON.stringify({ key, repo: routeRepo, prUrl, prTitle, confidence, rootCause, costUsd: spent }, null, 2),
  );

  return { key, outcome: "pr_opened", repo: routeRepo, prUrl, reason: rootCause, costUsd: spent };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function validateEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing required environment variable: ANTHROPIC_API_KEY");
    process.exit(1);
  }
  // gh must be present & authenticated for checkout + PR (unless dry-run discovery only)
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch {
    console.error("GitHub CLI (gh) not found on PATH — required to clone repos and open PRs.");
    process.exit(1);
  }
  if (!DRY_RUN) {
    try {
      execSync("gh auth setup-git", { stdio: "ignore" });
    } catch {
      console.warn("Warning: `gh auth setup-git` failed — git push may not authenticate.");
    }
  }
  if (!jiraEnabled) {
    console.warn(
      "Warning: JIRA REST not configured (JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN). " +
        "Ticket discovery requires FIX_TICKETS; JIRA comments/transitions will be skipped.",
    );
  }
}

async function main() {
  validateEnv();
  mkdirSync(outputDir, { recursive: true });

  log(`=== Auto-Fix Cycle: ${RUN_ID} ===`);
  log(`Model: ${MODEL} | Budget: $${MAX_BUDGET_USD} | DryRun: ${DRY_RUN}`);

  // Resolve ticket list
  let tickets: string[] = [];
  if (FIX_TICKETS) {
    tickets = FIX_TICKETS.split(",").map((t) => t.trim()).filter(Boolean);
  } else {
    log(`Discovering tickets via JQL: ${FIX_JQL}`);
    tickets = await jiraSearch(FIX_JQL, MAX_TICKETS);
  }
  tickets = tickets.slice(0, MAX_TICKETS);

  if (tickets.length === 0) {
    log("No tickets to process. Set FIX_TICKETS=VCST-XXXX or configure JIRA + label.");
    process.exit(0);
  }
  log(`Tickets: ${tickets.join(", ")}`);

  const results: TicketResult[] = [];
  let budgetLeft = MAX_BUDGET_USD;

  for (let i = 0; i < tickets.length; i++) {
    const key = tickets[i];
    const ticketsLeft = tickets.length - i;
    const ticketBudget = Math.max(budgetLeft / ticketsLeft, 3.0);

    if (budgetLeft <= 1.0) {
      results.push({ key, outcome: "error", reason: "Global budget exhausted", costUsd: 0 });
      continue;
    }

    log(`\n${"=".repeat(60)}\nTicket ${i + 1}/${tickets.length}: ${key} (budget $${ticketBudget.toFixed(2)})\n${"=".repeat(60)}`);

    let res: TicketResult;
    try {
      res = await processTicket(key, ticketBudget, join(outputDir, key));
    } catch (err) {
      res = { key, outcome: "error", reason: err instanceof Error ? err.message : String(err), costUsd: 0 };
    }
    results.push(res);
    budgetLeft -= res.costUsd;
    log(`Ticket ${key}: ${res.outcome}${res.prUrl ? ` → ${res.prUrl}` : ""} ($${res.costUsd.toFixed(2)})`);
  }

  // --- Consolidated report ---
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const prs = results.filter((r) => r.outcome === "pr_opened");
  let report = `# Auto-Fix Cycle Report — ${RUN_ID}

- **Date:** ${date}
- **Model:** ${MODEL}
- **Tickets processed:** ${results.length}
- **Draft PRs opened:** ${prs.length}
- **Total cost:** $${totalCost.toFixed(2)}
- **Dry run:** ${DRY_RUN}

| Ticket | Outcome | Repo | PR / Reason |
|--------|---------|------|-------------|
`;
  for (const r of results) {
    const detail = r.prUrl || r.reason || "";
    report += `| ${r.key} | ${r.outcome} | ${r.repo || "-"} | ${detail.replace(/\|/g, "\\|").slice(0, 120)} |\n`;
  }
  writeFileSync(join(outputDir, "fix-report.md"), report);
  writeFileSync(
    join(outputDir, "summary.json"),
    JSON.stringify({ runId: RUN_ID, date, model: MODEL, totalCost, results }, null, 2),
  );

  log(`\n=== Done. Report: ${join(outputDir, "fix-report.md")} ===`);
  log(`PRs opened: ${prs.length}/${results.length} | Cost: $${totalCost.toFixed(2)}`);

  // Exit codes: 0 = at least one PR or clean bail; 1 = hard errors; 2 = none actionable
  const hadError = results.some((r) => r.outcome === "error");
  const anyProgress = results.some(
    (r) => r.outcome === "pr_opened" || r.outcome === "bailed_by_design",
  );
  process.exit(hadError && !anyProgress ? 1 : anyProgress ? 0 : 2);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
