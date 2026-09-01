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

**Evidence policy:** Follow `skills/qa-evidence/evidence-capture-policy.md`
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

{TASK_SPECIFIC_INSTRUCTIONS}
```

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

Commands that test or analyze VC behavior SHOULD query Context7 before dispatching agents:

```
1. Resolve library: mcp__context7__resolve-library-id with libraryName: "virtocommerce"
   → canonical ID: /virtocommerce/vc-docs
2. Query: mcp__context7__query-docs with libraryId: "/virtocommerce/vc-docs",
   query: "{domain-relevant topic}", tokens: 8000
3. Pass findings to sub-agents as part of their prompt context
```

### Sample Queries by Domain

| Domain | Sample Queries |
|--------|---------------|
| Cart / Checkout | `"cart mutations xAPI"`, `"checkout workflow order creation"` |
| Orders | `"order processing workflow"`, `"order status transitions"` |
| Payment | `"payment gateway integration"`, `"CyberSource Skyflow configuration"` |
| Catalog | `"catalog properties categories"`, `"product variations configurable"` |
| Search | `"search indexing elasticsearch"`, `"search suggestions autocomplete"` |
| Auth / Security | `"authentication OAuth2 tokens"`, `"security roles permissions"` |
| B2B / Customers | `"B2B organizations members"`, `"company roles purchasing"` |
| Marketing | `"promotions coupons pricing"`, `"dynamic content marketing"` |
| CMS | `"content pages builder menus"`, `"blog articles publishing"` |
| Platform | `"platform modules configuration"`, `"dynamic properties settings"` |
| GraphQL xAPI | `"xAPI storefront queries mutations"`, `"GraphQL schema extensions"` |
| Inventory | `"inventory fulfillment centers"`, `"stock availability tracking"` |

## Duplicate Detection Guard

Before starting a run, check for recent duplicate runs to avoid waste:

| Command Type | Check | Timeframe | Action |
|-------------|-------|-----------|--------|
| Smoke test | Same-day smoke run exists | 24h | Warn user, ask to proceed |
| Ticket test | Same ticket tested recently | 2h | Warn user, show previous results |
| Regression | Same suite selection running | Active | Block — wait for current run |
| Bug report | Same title/component filed | 48h | Warn user, show existing bug |
| Exploratory | Same domain explored | 24h | Warn user, ask to proceed |
| Verify fix | Same ticket verified | 4h | Warn user, show previous result |
| Coverage gen | Same scope generated | 7d | Warn user, show previous report |
| Sync tests | Same source synced | 24h | Warn user, show previous sync |

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

Every command that uses a browser SHOULD run these checks before dispatching agents:

1. **Environment health** — invoke `/qa-env-check endpoints` (or inline: `curl -sk {BACK_URL}/health`)
2. **Build & version verification** — fetch the `declared`, `deployed` **and** `released-through` state (see Build Verification below)
3. **Recent-release check** — read `.claude/knowledge/domain/release-ledger.md` §1–§2 for the components in scope and record the Δ vs `deployed`. This is the step that turns "a test failed" into "a test failed on a surface that changed three weeks ago". Fall back to a Context7 query for module behaviour only where the ledger is silent or >45 days stale
4. **Duplicate check** — scan reports/ for recent runs matching scope
5. If any pre-flight fails → warn user with specific failure, ask whether to proceed

## Build Verification

Commands that test the QA environment SHOULD verify what build is deployed before running tests. This prevents testing against stale deployments, undeployed PRs, or unexpected module versions.

### How to Fetch Deployed Versions

Use **GitHub MCP** (`get_file_contents`) against the deploy repo:

```
owner: "VirtoCommerce"
repo: "vc-deploy-dev"
branch: "vcst-qa"   # default for TEST_ENV=vcst; use the branch matching TEST_ENV (e.g. vcptcore, virtostart) for other envs
```

> The deploy branch is env-specific: it tracks the active `TEST_ENV`. Never hardcode `vcst-qa` for runs against another environment — read the branch matching `TEST_ENV`.

| File | Contains |
|------|----------|
| `backend/packages.json` | `PlatformVersion` + all module IDs with versions |
| `theme/artifact.json` | Theme package URL with version (e.g., `vc-theme-b2b-vue-2.45.0-pr-2204-de06-de06c786`) |

**That is the `declared` state — what git says SHOULD be on the env, not what is running.** Also probe
the live platform:

```
GET {{BACK_URL}}/api/platform/modules      (bearer token; the same call scripts/maintenance/refresh-sitemap.mjs makes)
```

It returns every installed module with its `id` and `version` — the `deployed` state, and the only
ground truth. The two disagree routinely: a deploy in flight, a failed deploy, or a partially applied
one. That gap is exactly what `/qa-hotfix-check` exists to wait on.

**If the probe fails, record `deployed: UNKNOWN` and say so. NEVER fall back to `declared`.** A null
`deployed` leg collapses the released-vs-deployed distinction this section exists to preserve, and the
tempting fallback is the wrong value.

### What to Record

Extract and include in reports/agent prompts — four rows, not one:

```
declared (git)      : Platform {PlatformVersion}, Theme {version}, {scope-relevant modules}
deployed (probed)   : Platform {live version}, {scope-relevant modules}   | or UNKNOWN + reason
released-through    : Platform {ledger §1}, {scope-relevant components}   | .claude/knowledge/domain/release-ledger.md
Δ behind upstream   : {components where deployed < released, with both versions}
```

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

Store the fetched deploy state in `reports/deploy-state-cache.json` with a timestamp — all four rows
(`declared`, `deployed`, `released-through`, `Δ`) in the same file, since a consumer that reads one
without the others is exactly how the released-vs-deployed distinction gets lost. Reuse within the same
hour to avoid redundant GitHub API calls and platform probes. Invalidate if the user says a new
deployment happened. The `released-through` row is a local file read (no API), so it is cheap to
refresh — but the ledger's own `generated:` date is what bounds its freshness, not this cache's
timestamp.
