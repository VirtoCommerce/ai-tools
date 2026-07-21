import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  checkoutForFix,
  contributionPlan,
  isAllowedRepo,
  repoOwnership,
  repoProfile,
  resolveOwningSubApp,
  routingReference,
  suggestRepo,
  REPO_ORG,
} from "./lib/repo-router.js";
import { dependenciesOf, dependentsOf } from "./lib/module-registry.js";
import { getTracker } from "./lib/trackers/index.js";
import { getVcs, getUpstreamVcs } from "./lib/vcs/index.js";
import { loadProjectProfile } from "../scripts/lib/project-profile.mjs";

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

/** Comma-separated tracker keys/ids (manual mode): Jira `ABC-123`, Azure `12345`. */
const FIX_TICKETS = (process.env.FIX_TICKETS || "").trim();
const FIX_LABEL = process.env.FIX_LABEL || "qa-autofix";
// Explicit discovery-query override in the tracker's OWN language (Jira JQL /
// Azure WIQL). When unset, the resolved tracker supplies its default via
// tracker.defaultQuery(FIX_LABEL) — project key / team project come from the
// profile, so a client's non-VCST prefix (or Azure's numeric ids) just work.
// FIX_JQL is kept as a back-compat alias for FIX_QUERY.
const FIX_QUERY = process.env.FIX_QUERY || process.env.FIX_JQL || "";

const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "30.0");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "150", 10);
const MAX_TICKETS = parseInt(process.env.MAX_TICKETS || "5", 10);
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";
const DRY_RUN = process.env.DRY_RUN === "true";
const PHASE_TIMEOUT_MS = parseInt(process.env.PHASE_TIMEOUT_MS || "1800000", 10); // 30 min

// Tracker transition/state applied after a PR opens. For Jira this is a
// transition name ("In Review"); for Azure Boards the adapter maps it to a
// System.State via the profile stateMap. TRACKER_TRANSITION wins; JIRA_TRANSITION
// is kept for back-compat.
const TRACKER_TRANSITION =
  process.env.TRACKER_TRANSITION || process.env.JIRA_TRANSITION || "In Review";

const WORKSPACE_DIR = process.env.FIX_WORKSPACE || ".fix-workspace";

const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 16).replace(":", "");
const RUN_ID = `FIX-${date}-${time}`;
const outputDir = join("reports", "fixes", RUN_ID);

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Bug tracker (Jira | Azure Boards) — resolved from the deployment profile via
// ci/lib/trackers. Defaults to Jira, so existing VirtoCommerce-internal runs are
// unchanged. The four ops used below (getIssue / search / comment / transition)
// behave identically to the former inline JIRA REST helpers.
// ---------------------------------------------------------------------------

const tracker = getTracker({ dryRun: DRY_RUN, log });

// ---------------------------------------------------------------------------
// Code host (GitHub | Azure Repos) + upstream-issue policy — resolved from the
// deployment profile via ci/lib/vcs. getVcs(ownership) picks where a fix-PR is
// opened (client repo, possibly on Azure Repos; or the GitHub platform repo with
// fork/direct mode); getUpstreamVcs() is always GitHub for filing issues.
//
// Issue-filing is a CLIENT-deployment feature: when a real platform bug is NOT
// auto-fixable (too complex / multi-repo), the client can't fix it, so we open a
// GitHub Issue on the VirtoCommerce upstream instead. A native-platform checkout
// (no profile, projectType "platform") NEVER files issues ⇒ identical to before:
// the ticket is just commented and left for a human.
// ---------------------------------------------------------------------------

const PROFILE = loadProjectProfile();
const vcsDeps = { dryRun: DRY_RUN, log };
const FILE_UPSTREAM_ISSUES =
  PROFILE.projectType === "client" && PROFILE.upstream.fileIssues;

// ---------------------------------------------------------------------------
// Bug-report lookup (links the tracker key to a local reports/bugs/*.md file)
// ---------------------------------------------------------------------------

// Escape a string for safe literal use inside a RegExp.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Does a report's text reference this ticket key? The match is key-format-aware,
// so a bare Azure Boards numeric id never false-matches a longer number:
//   - Jira-style (`ABC-123`): whole-token match — `VCST-5404` won't match `VCST-54040`.
//   - Azure Boards bare numeric (`521`): only the cross-link forms `AB#521` / `#521`
//     (a bare `521` substring would false-match `VCST-5218`, `521px`, etc.).
//   - anything else: word-boundary-anchored match.
function reportReferencesKey(text: string, key: string): boolean {
  if (/^\d+$/.test(key)) {
    return new RegExp("#" + key + "(?![0-9])").test(text);
  }
  return new RegExp("\\b" + escapeRegExp(key) + "\\b").test(text);
}

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
        if (reportReferencesKey(readFileSync(file, "utf-8"), key)) return file;
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
  | "issue_filed"
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
  const ticket = await tracker.getIssue(key);
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
  // BAIL_CLASS (not-a-bug | too-complex | multi-repo) decides whether a BAIL on a
  // real-but-unfixable PLATFORM bug warrants an upstream GitHub Issue. Defaults to
  // not-a-bug, which never files (preserves the old comment-and-leave behaviour).
  const bailClass = (marker(triage.result, "BAIL_CLASS") || "not-a-bug").toLowerCase();
  // RCA_ANCHOR (optional): the file/path the triage agent points at as the root-cause
  // location. Consumed below by resolveOwningSubApp() to detect a bug routed to a
  // module repo whose RCA anchor actually falls under a declared embedded frontend
  // sub-app (e.g. vc-module-pagebuilder's Vue 3 shell) — see quality-gates.md §1 G1.
  const rcaAnchor = marker(triage.result, "RCA_ANCHOR") || "";

  if (verdict !== "GO") {
    // A real-but-unfixable platform bug → file a GitHub Issue upstream so a human
    // picks it up (client deployments only; gated by FILE_UPSTREAM_ISSUES). Any
    // other BAIL (not-a-bug, no routable platform repo, native-platform checkout)
    // → just comment and leave the ticket, exactly as before.
    const issuable =
      FILE_UPSTREAM_ISSUES &&
      (bailClass === "too-complex" || bailClass === "multi-repo") &&
      routeRepo &&
      isAllowedRepo(routeRepo) &&
      repoOwnership(routeRepo) === "platform";

    if (issuable) {
      const issueBodyPath = join(ticketDir, "ISSUE_BODY.md");
      writeFileSync(
        issueBodyPath,
        `Reported by the QA auto-fix pipeline as a real defect that is **not auto-fixable** ` +
          `(${bailClass}). Filed for human triage.\n\n` +
          `- **Tracker key:** ${key}\n- **Summary:** ${ticket?.summary || "(see tracker)"}\n` +
          `- **Reason not auto-fixed:** ${bailReason}\n\n` +
          (bugReport ? `## Bug report\n\n${bugReport}\n` : `${ticket?.description || ""}\n`),
      );
      try {
        const issueUrl = await getUpstreamVcs(vcsDeps, routeRepo).fileIssue({
          repo: routeRepo,
          title: `[QA] ${ticket?.summary || key} (${key})`,
          bodyFile: issueBodyPath,
          labels: [FIX_LABEL],
        });
        await tracker.comment(
          key,
          `[auto-fix] Not auto-fixable (${bailClass}): ${bailReason}. Filed upstream issue: ${issueUrl} (run ${RUN_ID})`,
        );
        return { key, outcome: "issue_filed", repo: routeRepo, prUrl: issueUrl, reason: bailReason, costUsd: spent };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[${key}] upstream issue filing failed: ${msg}`);
        // Fall through to the plain bail comment below.
      }
    }

    await tracker.comment(
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
  const baseProfile = repoProfile(routeRepo);
  // A `module`-kind repo may declare an embedded frontend sub-app on a different stack
  // (ci/config/fix-repos.json moduleFrontendSubApps, e.g. vc-module-pagebuilder's Vue 3
  // shell). If the RCA anchor falls under one, override the toolchain profile + developer
  // agent for THIS bug only — repoOwnership/isAllowedRepo/repoKind stay untouched.
  const subAppOverride =
    baseProfile.kind === "module" && rcaAnchor ? resolveOwningSubApp(routeRepo, rcaAnchor) : null;
  const profile = subAppOverride ? subAppOverride.profile : baseProfile;
  const prBodyPath = join(ticketDir, "PR_BODY.md");

  // --- Dependency context (best-effort; from module.manifest) ---
  // Backend modules resolve dependencies as NuGet packages, so the checkout
  // still builds. But the graph tells the agent where the root cause *could*
  // live (a dependency) and which modules a base-module fix would impact.
  // Skipped for a matched sub-app override too — a module's embedded frontend
  // sub-app (npm/yarn deps) has nothing to do with the module's own NuGet graph.
  let depBlock = "";
  if (profile.kind !== "frontend" && !subAppOverride) {
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
  // A matched sub-app override always routes to fix-frontend-agent (it knows Vue 3),
  // even though `profile.kind` stays "module" (repoKind/ownership are untouched).
  const devAgent = profile.kind === "frontend" || subAppOverride ? "fix-frontend-agent" : "fix-backend-agent";
  const fixPrompt = `${readAgent(devAgent)}

## Fix Assignment
- **JIRA key:** ${key}
- **Target repo:** ${routeRepo} (${profile.kind})
- **Checkout path (your working directory):** ${checkout.path}
- **Work branch (already created & checked out):** ${checkout.workBranch}
- **Base branch:** ${checkout.baseBranch}
- **Ticket JSON:** ${join(ticketDir, "ticket.json")}
- **Bug report:** ${bugReportPath || "(none — use ticket description)"}
${
  subAppOverride
    ? `
## Module-embedded frontend sub-app
This bug is routed to a **declared embedded frontend sub-app** inside the module repo — NOT the
module's own C#/legacy-AngularJS code. \`${routeRepo}\` stays kind \`module\` for ownership purposes;
only the toolchain + developer agent for this bug changed.
- **Sub-app path (within the checkout):** \`${subAppOverride.subApp.path}\`
- **Stack:** ${subAppOverride.subApp.stack}
- Run every Toolchain command below with cwd = \`${checkout.path}/${subAppOverride.subApp.path}\`.
  \`git diff\`/\`add\`/\`commit\`/\`push\` still operate at the checkout root — one repo, one commit.
- **Component-test harness:** ${subAppOverride.subApp.hasComponentTestHarness ? "present — use it directly." : "NONE shipped (no `@vue/test-utils`/jsdom). A state/logic bug (composable/store/service) proves red→green directly with the Test command below — Vue 3 reactivity runs standalone in Node, no stub needed. A mounted-component/DOM bug needs an EPHEMERAL, NEVER-COMMITTED vitest+`@vue/test-utils`+jsdom harness reusing this sub-app's own vite config — strip it completely before pushing (verify `git status`/`git diff` in the sub-app dir shows nothing but the product fix). See `.claude/skills/vc-shell-fix/SKILL.md` + `vc-shell-scratch-harness-patterns.md` for the full recipe (read them with the Read tool — they are not preloaded here)."}
- **Never touch:** the module's \`Web/Scripts/\` (legacy AngularJS Admin UI), the module's C# projects,
  or any OTHER sub-app in the same repo (declared or not) — stay within the path above.
`
    : ""
}${depBlock}
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
4. Commit (Conventional Commits, reference ${key}) and \`git push -u origin ${checkout.workBranch}\`. **Author the commit as the human who owns the write token (\`gh api user\` → \`user.name\`/\`user.email\` = \`<id>+<login>@users.noreply.github.com\`), with \`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>\` as a trailer — NEVER a bot author, or the org's CLA Assistant blocks the PR (overrides \`FIX_COMMIT_NAME\`/\`FIX_COMMIT_EMAIL\` win when set).
5. Write the PR description to: ${prBodyPath}
6. End your reply with these markers on their own lines:
   - \`FIX_STATUS: SUCCESS\` | \`PARTIAL\` | \`FAILED\`
   - \`PR_TITLE: fix(${key}): <imperative summary of the bug>\`  (Conventional Commits, JIRA key in the scope slot)
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
  const prTitle = marker(fix.result, "PR_TITLE") || `fix(${key}): ${ticket?.summary || key}`;
  const rootCause = marker(fix.result, "ROOT_CAUSE") || "";

  if (fixStatus !== "SUCCESS" || confidence === "LOW") {
    await tracker.comment(
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

  // --- Open DRAFT PR (deterministic, via the profile-routed VCS) ---
  // getVcs(ownership) selects GitHub (platform, or a GitHub client repo) or Azure
  // Repos (a client repo on Azure DevOps). For a platform fork-mode contribution
  // the head ref is `<forkOwner>:<branch>`. With no profile this is the original
  // `gh pr create --draft --head <branch>` on the platform repo, unchanged.
  if (!existsSync(prBodyPath)) {
    writeFileSync(prBodyPath, `Automated fix for ${key}.\n\nRoot cause: ${rootCause}\n`);
  }
  const plan = contributionPlan(routeRepo);
  let prUrl = "";
  try {
    prUrl = await getVcs(plan.host, vcsDeps).openPullRequest({
      targetRepo: routeRepo,
      baseBranch: checkout.baseBranch,
      workBranch: checkout.workBranch,
      forkOwner: plan.mode === "fork" ? plan.forkOwner : undefined,
      title: prTitle,
      bodyFile: prBodyPath,
      draft: true,
      labels: [FIX_LABEL],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[${key}] PR creation failed: ${msg}`);
    await tracker.comment(
      key,
      `[auto-fix] Fix pushed to branch ${checkout.workBranch} on ${routeRepo}, but PR creation failed: ${msg}. (run ${RUN_ID})`,
    );
    return { key, outcome: "error", repo: routeRepo, reason: `PR creation failed: ${msg}`, costUsd: spent };
  }

  // --- Update JIRA ---
  await tracker.comment(
    key,
    `[auto-fix] Draft PR opened: ${prUrl}\nRoot cause: ${rootCause}\nConfidence: ${confidence}. Please review & merge. (run ${RUN_ID})`,
  );
  await tracker.transition(key, TRACKER_TRANSITION);

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
  if (!tracker.enabled) {
    console.warn(
      `Warning: tracker (${tracker.kind}) not configured. ` +
        "Ticket discovery requires FIX_TICKETS; tracker comments/transitions will be skipped.",
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
    const query = FIX_QUERY || tracker.defaultQuery(FIX_LABEL);
    log(`Discovering tickets via ${tracker.kind} query: ${query}`);
    tickets = await tracker.search(query, MAX_TICKETS);
  }
  tickets = tickets.slice(0, MAX_TICKETS);

  if (tickets.length === 0) {
    log("No tickets to process. Set FIX_TICKETS=<key/id,...> or configure the tracker + label.");
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
  const issues = results.filter((r) => r.outcome === "issue_filed");
  let report = `# Auto-Fix Cycle Report — ${RUN_ID}

- **Date:** ${date}
- **Model:** ${MODEL}
- **Tickets processed:** ${results.length}
- **Draft PRs opened:** ${prs.length}
- **Upstream issues filed:** ${issues.length}
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
  log(`PRs opened: ${prs.length}/${results.length} | Issues filed: ${issues.length} | Cost: $${totalCost.toFixed(2)}`);

  // Exit codes: 0 = at least one PR/issue or clean bail; 1 = hard errors; 2 = none actionable
  const hadError = results.some((r) => r.outcome === "error");
  const anyProgress = results.some(
    (r) =>
      r.outcome === "pr_opened" ||
      r.outcome === "issue_filed" ||
      r.outcome === "bailed_by_design",
  );
  process.exit(hadError && !anyProgress ? 1 : anyProgress ? 0 : 2);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
