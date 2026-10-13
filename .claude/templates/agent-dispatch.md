# Agent Dispatch Template

Shared conventions for all commands that delegate to sub-agents. Reference this template when dispatching agents — do not duplicate these rules in each command.

## Agent Prompt Structure

Every agent dispatch MUST include these sections in the prompt:

```
You are executing {TASK_DESCRIPTION} for run {RUN_ID}.

**Context:** {BRIEF_DESCRIPTION_OF_WHAT_TO_DO}

**Scope:**
- Ticket/Suite/Feature: {SCOPE}
- Environment: Frontend: {FRONT_URL} | Backend: {BACK_URL}

**Browser:** {BROWSER_SERVER} (fallback: {FALLBACK_BROWSER})

**References:**
- {LIST_OF_KNOWLEDGE_FILES_AND_SKILLS}

**Output:** {OUTPUT_PATH}

**Observed behaviour:** before your first live check of each page path / GraphQL operation / endpoint
in scope, ask the base yourself — `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`).
Then close each list by its handle (`kb_show`/`kb_none`).
On a scripted suite run, ask instead on each deviation (FAIL, BLOCKED, unexpected result, incidental
observation) and before every capture.
At close-out, for each platform behaviour you report: matched ⇒ `kb_confirm`, contradicted ⇒
`kb_dispute`, nothing held ⇒ `kb_capture` (anchor = the route or request, never a label; contract: `.claude/knowledge/execution/kb-capture-contract.md`). List the entry ids in your output.

**Evidence policy:** Follow `skills/qa-evidence/evidence-capture-policy.md`
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

{TASK_SPECIFIC_INSTRUCTIONS}
```

**The `Observed behaviour` line is not optional** and is never replaced by packed answers — the
recipient asks for its own surface ([`../skills/qa-test/dispatch-pack.md`](../skills/qa-test/dispatch-pack.md)).
Omit it only for a Mechanic dispatch (release plumbing, diff review) per
[`../knowledge/agents/authoring-standard.md`](../knowledge/agents/authoring-standard.md) §5.2.

## Browser Assignment & Fallback Chain

Each agent MUST be assigned an explicit browser server. If the primary browser fails (launch error, user data dir conflict, timeout), retry with the next browser in the fallback chain. Max 1 retry.

### Default Assignments (per `.claude/rules/agents.md`)

| Agent | Primary Browser | Fallback |
|-------|----------------|----------|
| `qa-frontend-expert` | `playwright-chrome` | `playwright-firefox` |
| `qa-backend-expert` | `playwright-edge` | `playwright-chrome` |
| `qa-testing-expert` | `playwright-firefox` | `playwright-edge` |
| `ui-ux-expert` | Chrome DevTools MCP | `playwright-edge` |
| `test-management-specialist` | `playwright-chrome` (sequential only) | `playwright-firefox` |
| `ba-system-analyzer` | `playwright-firefox` | `playwright-edge` |
| `ba-api-specialist` | `playwright-edge` | `playwright-firefox` |

### Fallback Protocol

1. Agent attempts primary browser
2. If launch fails → log error, switch to fallback browser
3. If fallback also fails → mark task as BLOCKED, return error to orchestrator
4. Orchestrator reports BLOCKED status to user with browser error details
5. **Never retry the same browser twice** in one dispatch

### Parallel Constraints

- Max 3 concurrent browser agents (QA + BA combined)
- Never assign two agents to the same browser server simultaneously
- Never use WebKit on Windows — skip to next in chain

## Context7 Pre-Flight

Superseded by [`/preflight`](../skills/preflight/SKILL.md) step 3: **kb first, VirtoOZ second, Context7
only as VirtoOZ's fallback** ([`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*).
Querying Context7 first contradicted that order.

## Duplicate Detection Guard

Before starting a run, check for recent duplicate runs to avoid waste:

| Command Type | Check | Timeframe | Action |
|-------------|-------|-----------|--------|
| Smoke test | Same-day smoke run exists | 24h | Warn user, ask to proceed |
| Regression | Same suite selection running | Active | Block — wait for current run |
| Bug report | Same title/component filed | 48h | Warn user, show existing bug |
| Verify fix | Same ticket verified | 4h | Warn user, show previous result |
| Coverage gen | Same scope generated | 7d | Warn user, show previous report |

`/qa-test`, `/qa-test-fast`, `/qa-exploratory` and `/qa-test-lifecycle` run the duplicate check through
[`/preflight`](../skills/preflight/SKILL.md), whose windows live in `scripts/preflight/policy.ts`.

**How to check:** Read `reports/` directory for recent `{RUN_ID}` files matching the scope. For JIRA-based checks, query Atlassian MCP for recent comments on the ticket.

**Action on duplicate:** Always warn. Never silently skip. User may have a valid reason to re-run.

## Error Handling

| Error | Action |
|-------|--------|
| Agent internal error (classifyHandoffIfNeeded, etc.) | Fall back to working directly — do NOT retry same delegation |
| Browser launch failure | Switch to fallback browser (see Fallback Protocol) |
| Agent timeout (no response in 10min) | Mark task as BLOCKED, report to user |
| MCP server unavailable | Skip browser-dependent steps, run static analysis only, warn user |
| Atlassian MCP unavailable | Skip JIRA transitions, ask user for ticket details manually |
| Context7 unavailable | Proceed without doc enrichment, warn user that results may be less accurate |

## Environment URLs

Always read from `config.js` / `.env`. Never hardcode.

```
Frontend: FRONT_URL (storefront)
Backend:  BACK_URL (platform API)
Storybook: STORYBOOK_URL / STORYBOOK_DEV_URL
```

## JIRA Transition Protocol

Commands that transition JIRA tickets (`/qa-test`, `/qa-verify-fix`, `/qa-bug`) follow the same workflow:

1. **Always ask user before transitioning** — never auto-transition
2. If Atlassian MCP unavailable → skip transitions, inform user
3. Add structured comment with: verdict, pass/fail counts, business rules verified, bugs found, artifact paths
4. Transition map:
   - PASS → `Finish test` → TESTED
   - FAIL → `Need fixes` → REOPEN (with failure details)
   - BLOCKED → no transition, add comment explaining blocker

## Pre-Flight Checklist

Run [`/preflight`](../skills/preflight/SKILL.md) — env health, `declared`/`deployed`/released-through,
duplicate, MCP availability, one output form and the remediation loop. `/qa-regression` and
`/qa-smoke` use its build-scoped entry (`regression:plan --preflight`), which adds module gating,
the baseline Δ and the active-run lock.

## Build Verification

Commands that test the QA environment SHOULD verify what build is deployed before running tests. This prevents testing against stale deployments, undeployed PRs, or unexpected module versions.

### How to fetch and record it

`/preflight` does it: `declared` from `vc-deploy-dev` (branch per `TEST_ENV`), `deployed` from
`GET {{BACK_URL}}/api/platform/modules`, the storefront-visible modules from the anonymous
`InitializeApplication` probe, and the ledger Δ — code in `scripts/lib/env-facts.ts`. **A failed
probe is `UNKNOWN`, never `declared`.** The Platform version is not in the modules API and
`/api/platform/version` is 404; its live source is the anonymous Admin root page
(`ng-init="platformVersion ='…'"`, kb `KB-B858E12A`), which `/preflight` reads as `deployed.platform`.
When that page gives no version, `deployed.platform` is `UNKNOWN` and a report labels `declared` as declared. The sections below — which source answers
which question, and what a disagreement means — are unchanged and still normative.

### Precedence — four sources, routed by QUESTION not by rank

```
documented — VirtoOZ MCP                           -> what the docs say behaviour IS
                                                      (evergreen; ~9 months stale on releases)
released   — .claude/knowledge/domain/release-ledger.md -> what EXISTS in the product line
                                                      (fresh to its last refresh; a DIGEST, non-exhaustive)
declared   — vc-deploy-dev backend/packages.json   -> what SHOULD be on this env (git)
deployed   — GET {{BACK_URL}}/api/platform/modules -> what IS RUNNING here      <- GROUND TRUTH
```

| The question | Winner | Never |
|---|---|---|
| What is correct behaviour here? | `documented`, then `{OBSERVED}` live | the ledger — it carries no behaviour |
| Does this capability exist in the product at all? | `released` | `documented` (nine months blind) |
| Can I test it **on this env**? | `deployed` | `declared`, `released` |
| Does a recent change explain what I'm seeing? | `released`, as a **hypothesis** | as a verdict |
| Which version goes in the report? | `deployed`, with the probe timestamp | `declared`, unlabelled |

**The one hard rule.** A capability the ledger records but the deployed probe does not carry is
**`NOT_DEPLOYED`** — never `FAIL`, never a bug, never "missing feature". The verdict is BLOCKED-on-deploy
and the next step is `/qa-deploy-pr` or waiting. Filing a bug against a feature that was never deployed,
and signing off a fix that never landed, are the two worst outcomes available here; they are the same
mistake in opposite directions.

**When they disagree:**

| Disagreement | Reading | Action |
|---|---|---|
| `deployed` < `released` | Env is **behind**. This is the normal, default state. | Feature exists, is not testable here → `NOT_DEPLOYED`. Do not design cases against it; note the Δ in the report header. |
| `deployed` > `released` | The **ledger** is stale, not the env. | Trust `deployed`. Never conclude "that module doesn't exist" from ledger silence; flag it for `npm run releases:refresh`. |
| `declared` ≠ `deployed` | Deploy in flight, failed, or partially applied. | `deployed` wins, always. The gap is a finding about the **environment**, not the product. |
| `documented` ≠ `deployed`, **and** the ledger names a change in that component | Docs are stale **and** the ledger says why. | Docs are invalidated for that component → drop to the `{OBSERVED}` axis. Do **not** file on the doc/behaviour mismatch alone. |
| `documented` ≠ `deployed`, ledger records nothing | **Unknown** — a real candidate defect. | Run the normal source-verify path before filing. |

**Presence is evidence; absence is not.** The ledger is an editorial monthly digest that declares itself
`exhaustive: false`. "The ledger doesn't mention it" never licenses "nothing changed".

### When to Verify PRs

PRs in `vc-frontend` and `vc-module-*` are deployed to QA **while still open** (not merged). Testing happens before merge.

For `/qa-test PR #NNN` and `/qa-verify-fix`:

1. Get PR details: `gh pr view <number> --json title,state,headRefName,labels` — note the branch and any CI build artifact version (often in PR description or CI checks)
2. Identify which module/theme the PR belongs to (from the repo name)
3. Cross-reference the module/theme version in `backend/packages.json` or `theme/artifact.json` — look for the PR's **build artifact version** (e.g., alpha/preview version like `2.44.0-alpha.2262`)
4. If the deploy repo doesn't contain the PR's build version → the PR build is **not yet deployed** to QA. Offer to run **`/qa-deploy-pr <ticket-key>`** — it gathers ALL of the change's fresh CI prerelease artifacts (across modules + platform + storefront) and prepares one gated cross-fork deploy PR onto the env branch (dry-run by default, **ask before `--apply`**, never auto-merges). Use `/qa-deploy-pr <ticket-key> --verify` for a quick "is it deployed yet?" check. If the user declines, warn and ask whether to wait
5. Record the confirmed deployed version in the test report

### Scope-Based Verification

| Command | Verification Level |
|---------|-------------------|
| `/qa-test PR #NNN` | Full — confirm PR is deployed (module version matches) |
| `/qa-verify-fix` | Full — confirm fix PR is deployed before testing |
| `/qa-test VCST-XXXX` | Standard — record platform + relevant module versions |
| `/qa-smoke` | Standard — record platform + theme versions in report |
| `/qa-regression` | Standard — record full deploy state (platform + theme + all modules) |
| `/qa-exploratory` | Light — record platform + theme versions |
| `/qa-bug` | Light — include platform + theme versions in bug report |

### Caching

The per-env comparison point is `reports/regression/baseline.<env>.json`, written by `regression:close`
for a completed run (`scripts/regression/baseline.ts`); `reports/deploy-state-cache.json` is retired.
The `released-through` row is a local file read (no API), so it is cheap to refresh — the ledger's own
`generated:` date is what bounds its freshness.
