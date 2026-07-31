/**
 * Scheduled test-case staleness audit — one suite per run, one PR per suite.
 *
 * Headless twin of `/qa-review-tests suite <ID> --triangulate --fix --ci`
 * (the same interactive↔CI twin relationship as /qa-regression ↔ run-regression.ts
 * and /qa-fix ↔ run-fix-cycle.ts).
 *
 * WHY THIS EXISTS. Regression suites go stale silently: `lint-test-cases.ts`
 * GRD-001 verifies an assertion CARRIES a grounded provenance tag, never that the
 * tag is TRUE. A `{DOC}` whose doc changed, an `{OBSERVED}` from a six-month-old
 * build, a `{BL}` citing a retired invariant — all lint green. Dimension 11
 * triangulates each assertion against docs + live + source and rewrites what three
 * agreeing axes prove is stale. This runner drives that on a schedule so the
 * ~3,960-case corpus gets worked through instead of rotting.
 *
 * WHY ONE SUITE PER RUN. A per-suite PR is reviewable; a 120-suite PR is not. The
 * PR is also the human gate that replaces `--fix`'s interactive confirmation — so
 * the unit of work and the unit of review are deliberately the same thing.
 *
 * WRITE SCOPE (enforced by the prompt + the post-apply gate, and narrower than
 * interactive `--fix`):
 *   CONFIRMED → refresh the `Audited:` stamp only
 *   DRIFT     → rewrite ONLY the drifted assertion + stamp
 *   MISSING / CONTRADICTORY / UNGROUNDED / RETIRE → PR body proposal, never a CSV write
 * Never auto-merges (mirrors the G7 hard stop in .claude/rules/quality-gates.md §2).
 *
 * Env:
 *   AUDIT_SUITE        explicit suite id (else the queue picks the most overdue)
 *   MAX_BUDGET_USD     default 12
 *   MAX_TURNS          default 150
 *   MODEL              default sonnet
 *   STALE_DAYS         re-audit window, default from lint-test-cases DEFAULT_STALE_DAYS
 *   DRY_RUN            "true" → pick + report, no branch/commit/PR
 *   PHASE_TIMEOUT_MS   default 1_800_000
 *   BASE_BRANCH        default the repo's default branch
 *   GH_TOKEN           write token for `gh pr create` (a PAT, not GITHUB_TOKEN —
 *                      a GITHUB_TOKEN-authored PR does not trigger checks)
 *
 * Exit: 0 progress (incl. "nothing due"), 1 hard error, 2 nothing actionable.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const AUDIT_SUITE = process.env.AUDIT_SUITE?.trim() || "";
const MAX_BUDGET_USD = parseFloat(process.env.MAX_BUDGET_USD || "12.0");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "150", 10);
const MODEL = process.env.MODEL || "claude-sonnet-4-5-20250929";
const STALE_DAYS = process.env.STALE_DAYS?.trim() || "";
const DRY_RUN = process.env.DRY_RUN === "true";
const PHASE_TIMEOUT_MS = parseInt(process.env.PHASE_TIMEOUT_MS || String(30 * 60 * 1000), 10);

const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 16).replace(":", "");
const RUN_ID = `TCA-${date}-${time}`;
const outputDir = join("reports", "suite-audit", RUN_ID);

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/**
 * The LIVE axis. CI has exactly ONE browser lane (the same single headless
 * Chromium run-regression.ts and run-monitor.ts use) — not the 3-slot pool the
 * interactive skill fans out across. The prompt says so explicitly, because
 * blindly following SKILL.md Step 8b here would launch three agents onto one
 * lane and they would fight over the profile.
 */
const PLAYWRIGHT_MCP = {
  "playwright-chrome": {
    command: "npx",
    args: ["@playwright/mcp@latest", "--config", "ci/config/mcp-playwright-chrome.ci.json"],
  },
};

const BROWSER_TOOLS = [
  "mcp__playwright-chrome__browser_navigate",
  "mcp__playwright-chrome__browser_click",
  "mcp__playwright-chrome__browser_type",
  "mcp__playwright-chrome__browser_fill_form",
  "mcp__playwright-chrome__browser_take_screenshot",
  "mcp__playwright-chrome__browser_snapshot",
  "mcp__playwright-chrome__browser_console_messages",
  "mcp__playwright-chrome__browser_network_requests",
  "mcp__playwright-chrome__browser_wait_for",
  "mcp__playwright-chrome__browser_hover",
  "mcp__playwright-chrome__browser_select_option",
  "mcp__playwright-chrome__browser_press_key",
  "mcp__playwright-chrome__browser_close",
];

function sh(cmd: string, opts: { allowFail?: boolean } = {}): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (opts.allowFail) return "";
    throw e;
  }
}

/** Last `^KEY: value$` line — the structured handoff idiom from run-fix-cycle.ts. */
function marker(text: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}:\\s*(.+)$`, "gim");
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) last = m[1].trim();
  return last;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

interface QueueEntry {
  id: string;
  name: string;
  file: string;
  domain: string;
  priority: string;
  dueCases: number;
  testCount: number;
  oldestStamp: string | null;
  source: { modules: string[]; repos: string[]; via: string; restPaths: string[]; xapiModules: string[] };
  caveats: string[];
}

type Pick =
  | { kind: "ok"; suite: QueueEntry }
  | { kind: "not-found"; requested: string }
  | { kind: "nothing-due" };

/** Pick today's suite from the deterministic rotation (risk tier → oldest stamp). */
function pickSuite(): Pick {
  const staleFlag = STALE_DAYS ? ` --stale-days=${STALE_DAYS}` : "";
  const raw = sh(`npx tsx scripts/test-cases/audit-queue.ts --json${staleFlag}`);
  const parsed = JSON.parse(raw) as { queue?: QueueEntry[]; picked?: QueueEntry[] };
  const queue = parsed.queue ?? parsed.picked ?? [];

  if (AUDIT_SUITE) {
    const hit = queue.find((q) => q.id === AUDIT_SUITE);
    // Never fall back to the rotation on a bad id — an operator who named a suite
    // wants THAT suite, and silently auditing a different one would be worse than
    // failing. (Also never derive the CSV path from the id: manifest id `092` is
    // carried by two files.)
    return hit ? { kind: "ok", suite: hit } : { kind: "not-found", requested: AUDIT_SUITE };
  }
  // The queue is already sorted; take the most overdue suite with work to do.
  const next = queue.find((q) => q.dueCases > 0);
  return next ? { kind: "ok", suite: next } : { kind: "nothing-due" };
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

  const run = (async () => {
    for await (const message of query({
      prompt,
      options: {
        model: MODEL,
        maxTurns: MAX_TURNS,
        maxBudgetUsd: budget,
        permissionMode: "acceptEdits" as const,
        allowDangerouslySkipPermissions: true,
        mcpServers: PLAYWRIGHT_MCP,
        allowedTools: [...tools, ...BROWSER_TOOLS],
      },
    })) {
      if (message.type === "result") {
        costUsd = message.total_cost_usd;
        if (message.subtype === "success") text = message.result;
      }
    }
  })();

  await withTimeout(run, PHASE_TIMEOUT_MS, name);
  log(`${name} done — $${costUsd.toFixed(2)}`);
  return { costUsd, result: text };
}

/**
 * The deterministic gate. Runs the same checks a human reviewer would demand
 * before trusting an auto-applied CSV edit. A NEW Blocker/Critical means the
 * auto-fix made things worse, so the branch is discarded rather than PR'd.
 */
function gate(csvPath: string): { ok: boolean; detail: string } {
  const out: string[] = [];
  let ok = true;

  const checks: Array<[string, string]> = [
    ["suites:review", `npx tsx scripts/test-cases/lint-test-cases.ts "${csvPath}" --fail-on=High`],
    ["suites:lint", `npx tsx scripts/test-cases/sync-test-suites.ts --check`],
    ["td:validate", `npx tsx scripts/test-data/validate-td-refs.ts`],
  ];
  if (csvPath.includes("/graphql/") || csvPath.includes("\\graphql\\"))
    checks.push(["graphql:lint-labels", `npx tsx scripts/graphql/review-graphql-labels.ts "${csvPath}"`]);

  for (const [label, cmd] of checks) {
    try {
      execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      out.push(`- ${label}: PASS`);
    } catch (e) {
      ok = false;
      const msg = ((e as { stdout?: string }).stdout ?? (e as Error).message ?? "").toString();
      out.push(`- ${label}: **FAIL**\n\n\`\`\`\n${msg.slice(-1500).trim()}\n\`\`\``);
    }
  }
  return { ok, detail: out.join("\n") };
}

function auditPrompt(s: QueueEntry): string {
  const sourceHint = s.source.repos.length
    ? `Candidate repo(s) from the router: ${s.source.repos.join(", ")}.`
    : s.source.modules.length
      ? `Module(s): ${s.source.modules.join(", ")}. No router repo match — find the repo by searching org:VirtoCommerce for the module name. Do NOT guess a repo name.`
      : `SOURCE AXIS UNRESOLVED. Do NOT guess a repo. Score every assertion UNGROUNDED and write nothing.`;

  return `Execute /qa-review-tests suite ${s.id} --triangulate --fix --ci

This is an unattended CI run (RUN_ID ${RUN_ID}). There is no human to answer prompts —
do not ask for confirmation. The pull request this run opens IS the human gate.

Suite: ${s.id} — ${s.name}
File: ${s.file}
Domain: ${s.domain} | Priority: ${s.priority} | ${s.dueCases}/${s.testCount} cases due
Last audited: ${s.oldestStamp ?? "never"}
${sourceHint}
${s.source.restPaths.length ? `REST: ${s.source.restPaths.join(", ")}` : ""}
${s.source.xapiModules.length ? `xAPI: ${s.source.xapiModules.join(", ")}` : ""}
${s.caveats.length ? `\nCaveats (apply the matching waiver from triangulation-criteria.md §1a/§1b):\n${s.caveats.map((c) => `- ${c}`).join("\n")}` : ""}

Read .claude/skills/qa-review-tests/triangulation-criteria.md before starting. Follow
Step 8 of the SKILL exactly, WITH ONE CI DEVIATION:

  SKILL Step 8b fans out to 3 \`ba-system-analyzer\` agents on 3 browser slots. This
  CI environment has exactly ONE browser lane (\`playwright-chrome\`, the single
  headless Chromium). Do NOT launch parallel browser agents here — they would
  contend for the same profile. Gather the docs and source axes (no browser) with
  whatever parallelism you like; take the LIVE axis SEQUENTIALLY on the one lane,
  within the Dim-8 budget (max 20 unique pages, max 5 flow walkthroughs, 5 min).

Non-negotiable constraints:

1. Run \`npm run suites:review -- ${s.file} --json\` FIRST and spend agent effort only on
   what it cannot decide. It is free; you are not.
2. WRITE ONLY these two verdicts:
   - CONFIRMED → refresh the row's \`Audited:\` stamp in the References column only.
   - DRIFT → rewrite ONLY the drifted assertion (not the whole cell) + stamp.
   MISSING, CONTRADICTORY, UNGROUNDED and RETIRE are report-only. Never write them to
   the CSV. Never set Automation_Status: Deprecated. Never author a new case.
3. Stamp format, appended to References (replace any prior \`Audited:\` token, never
   accumulate):
   Audited: ${date} (${RUN_ID}); Source: <repo>/<path>:<line>; Docs: <topic §section | N/A — <reason>>
4. A DRIFT rewrite MUST preserve {{VAR}} / @td() resolution and assert the structural
   invariant, never a literal price/SKU/URL/count observed live (DV-016). Grounding in
   source code may quote an i18n KEY, never a guessed rendering of it (GRD-002).
5. Deploy lag (source shows a merged fix, live shows the old behavior) is CONTRADICTORY,
   NOT DRIFT. Do not rewrite a case to match a build that is about to change.
6. When in doubt about a missing axis: UNGROUNDED, not \`docs: N/A\`. A lone surviving
   axis never confirms anything.
7. Do not touch any file other than ${s.file} and (if testCount changed)
   config/test-suites.json. No new report files — .claude/rules/reports.md has no
   category for test-case reviews; your narrative goes in the output below.

When finished, output these lines verbatim (they are parsed):
AUDIT_STATUS: APPLIED | NO_CHANGES | FAILED
CONFIRMED_COUNT: <n>
DRIFT_APPLIED: <n>
PROPOSALS: <n>
NA_DOCS: <n>
SUMMARY_MD_START
<the PR body: the Dim-11 verdict table, an Applied section with one line per changed
row, and a Proposals section for MISSING/CONTRADICTORY/UNGROUNDED/RETIRE. Target
15-40 lines, hard cap 100 — the size discipline in .claude/rules/reports.md.>
SUMMARY_MD_END`;
}

function prBody(s: QueueEntry, summary: string, gateDetail: string, cost: number): string {
  return `## Test-case staleness audit — suite ${s.id} (${s.name})

Automated Dimension-11 behavioral triangulation (\`/qa-review-tests suite ${s.id} --triangulate --fix --ci\`).
Each assertion was checked against **docs + live + source**; only CONFIRMED (stamp refresh) and
DRIFT (evidence-backed assertion rewrite) were applied. **This PR is the human gate — do not merge
without review.**

- Run: \`${RUN_ID}\` · Suite file: \`${s.file}\`
- Scope: ${s.dueCases}/${s.testCount} cases due · last audited **${s.oldestStamp ?? "never"}**
- Source axis: ${s.source.repos.join(", ") || s.source.modules.join(", ") || "UNRESOLVED"} (via ${s.source.via})
- Agent cost: $${cost.toFixed(2)}

${summary}

### Deterministic gate

${gateDetail}

---

Verdicts other than CONFIRMED/DRIFT are **proposals only** and were deliberately not applied:
CONTRADICTORY (usually deploy lag — re-audit after the next deploy), UNGROUNDED (an axis produced
no evidence), RETIRE (removing coverage is always human), MISSING (authoring belongs to
\`/qa-test-lifecycle\` Phase 3).

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
}

async function main(): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  log(`=== Suite audit: ${RUN_ID} ===`);

  // The Agent SDK resolves credentials in order: ANTHROPIC_API_KEY →
  // ANTHROPIC_AUTH_TOKEN → an `ant auth login` profile → Workload Identity
  // Federation. An unset ANTHROPIC_API_KEY therefore does NOT mean there are no
  // credentials, so this preflight accepts any env-supplied source rather than
  // hard-requiring the key (which is what the other ci/run-*.ts entrypoints do).
  // WIF is the documented choice for CI: GitHub Actions can supply the identity
  // token via `permissions: id-token: write`, so no long-lived secret is needed.
  const wif = !!(
    process.env.ANTHROPIC_FEDERATION_RULE_ID &&
    process.env.ANTHROPIC_ORGANIZATION_ID &&
    process.env.ANTHROPIC_SERVICE_ACCOUNT_ID &&
    (process.env.ANTHROPIC_IDENTITY_TOKEN || process.env.ANTHROPIC_IDENTITY_TOKEN_FILE)
  );
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !wif) {
    log("No Anthropic credentials in the environment.");
    log("Set ANTHROPIC_API_KEY, or configure Workload Identity Federation");
    log("(ANTHROPIC_FEDERATION_RULE_ID + ANTHROPIC_ORGANIZATION_ID +");
    log(" ANTHROPIC_SERVICE_ACCOUNT_ID + ANTHROPIC_IDENTITY_TOKEN[_FILE]).");
    log("An `ant auth login` profile also works locally but is not a CI credential.");
    process.exit(1);
  }

  const picked = pickSuite();
  if (picked.kind === "not-found") {
    log(`AUDIT_SUITE=${picked.requested} is not in config/test-suites.json — refusing to guess a file path.`);
    process.exit(1);
  }
  if (picked.kind === "nothing-due") {
    log("Nothing due — every suite is inside the staleness window. Exiting 0.");
    process.exit(0);
  }
  const suite = picked.suite;
  log(`Picked suite ${suite.id} (${suite.name}) — ${suite.dueCases}/${suite.testCount} due, last audited ${suite.oldestStamp ?? "never"}`);
  for (const c of suite.caveats) log(`  caveat: ${c}`);

  if (DRY_RUN) {
    log("DRY_RUN — no branch, no agent, no PR.");
    writeFileSync(join(outputDir, "picked.json"), JSON.stringify(suite, null, 2) + "\n");
    log(`Would run: /qa-review-tests suite ${suite.id} --triangulate --fix --ci`);
    log(`Would branch: claude/qa-suite-audit/${suite.id}-${date}`);
    process.exit(0);
  }

  // `claude/`-prefixed so a scheduled run can push it without "allow unrestricted
  // branch pushes" (the convention ci/lib/repo-router.ts documents for autofix).
  const branch = `claude/qa-suite-audit/${suite.id}-${date}`;
  const baseBranch = process.env.BASE_BRANCH
    || sh("git symbolic-ref refs/remotes/origin/HEAD", { allowFail: true }).trim().split("/").pop()
    || "main";

  sh(`git checkout -b ${branch}`);
  log(`Branch: ${branch} (base ${baseBranch})`);

  const audit = await runPhase(
    `Audit ${suite.id}`,
    auditPrompt(suite),
    MAX_BUDGET_USD,
    ["Read", "Glob", "Grep", "Edit", "Write", "Bash", "Task", "WebFetch"],
  ).catch((e) => {
    log(`Audit phase failed: ${(e as Error).message}`);
    return { costUsd: 0, result: "" };
  });

  writeFileSync(join(outputDir, "audit.txt"), audit.result);

  const status = marker(audit.result, "AUDIT_STATUS") ?? "FAILED";
  const summary = audit.result.includes("SUMMARY_MD_START")
    ? audit.result.split("SUMMARY_MD_START")[1].split("SUMMARY_MD_END")[0].trim()
    : "_(the audit produced no structured summary — see the run log)_";

  const changed = sh(`git status --porcelain regression/suites config/test-suites.json`, { allowFail: true }).trim();
  if (!changed) {
    log(`No CSV changes (AUDIT_STATUS: ${status}). Nothing to PR — leaving the branch unpushed.`);
    writeFileSync(join(outputDir, "summary.json"), JSON.stringify({ RUN_ID, suite: suite.id, status, applied: false }, null, 2) + "\n");
    process.exit(status === "FAILED" ? 2 : 0);
  }

  const g = gate(suite.file);
  if (!g.ok) {
    // An auto-fix that introduces a new Blocker/Critical is reverted, not shipped.
    log("Deterministic gate FAILED — reverting the applied edits, no PR.");
    console.log(g.detail);
    sh(`git checkout -- regression/suites config/test-suites.json`, { allowFail: true });
    writeFileSync(join(outputDir, "summary.json"), JSON.stringify({ RUN_ID, suite: suite.id, status: "GATE_FAILED", applied: false }, null, 2) + "\n");
    process.exit(2);
  }

  sh(`git add regression/suites config/test-suites.json`);
  const title = `test(qa): triangulate suite ${suite.id} — ${suite.name}`;
  const msgFile = join(outputDir, "commit-msg.txt");
  writeFileSync(
    msgFile,
    `${title}\n\nDimension-11 behavioral triangulation (docs + live + source) via ${RUN_ID}.\n` +
      `Applied CONFIRMED stamp refreshes and evidence-backed DRIFT rewrites only.\n\n` +
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n`,
  );
  sh(`git commit -F "${msgFile}"`);
  sh(`git push -u origin ${branch}`);

  const bodyFile = join(outputDir, "pr-body.md");
  writeFileSync(bodyFile, prBody(suite, summary, g.detail, audit.costUsd));

  let prUrl = "";
  try {
    prUrl = sh(
      `gh pr create --draft --base ${baseBranch} --head ${branch} ` +
        `--title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" --label qa-suite-audit`,
    ).trim();
    log(`PR opened: ${prUrl}`);
  } catch (e) {
    // Same fallback shape as run-fix-cycle.ts: the work is pushed and recoverable.
    log(`PR creation failed — the audit is pushed to ${branch} and a PR can be opened by hand.`);
    log(String((e as Error).message).slice(0, 400));
  }

  writeFileSync(
    join(outputDir, "summary.json"),
    JSON.stringify({
      RUN_ID, suite: suite.id, file: suite.file, status, branch, prUrl,
      confirmed: Number(marker(audit.result, "CONFIRMED_COUNT") ?? 0),
      driftApplied: Number(marker(audit.result, "DRIFT_APPLIED") ?? 0),
      proposals: Number(marker(audit.result, "PROPOSALS") ?? 0),
      naDocs: Number(marker(audit.result, "NA_DOCS") ?? 0),
      costUsd: audit.costUsd, applied: true,
    }, null, 2) + "\n",
  );

  log(`=== Audit complete: ${RUN_ID} (${suite.id}) ===`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
