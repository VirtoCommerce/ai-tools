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

**Evidence policy:** Follow `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`
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
2. **Build & version verification** — fetch deployed versions (see Build Verification below)
3. **Context7 query** — for the target domain(s), verify current module behavior
4. **Duplicate check** — scan reports/ for recent runs matching scope
5. If any pre-flight fails → warn user with specific failure, ask whether to proceed

## Build Verification

Commands that test the QA environment SHOULD verify what build is deployed before running tests. This prevents testing against stale deployments, undeployed PRs, or unexpected module versions.

### How to Fetch Deployed Versions

Use **GitHub MCP** (`get_file_contents`) against the deploy repo:

```
owner: "VirtoCommerce"
repo: "vc-deploy-dev"
branch: "vcst-qa"
```

| File | Contains |
|------|----------|
| `backend/packages.json` | `PlatformVersion` + all module IDs with versions |
| `theme/artifact.json` | Theme package URL with version (e.g., `vc-theme-b2b-vue-2.44.0-alpha.2262`) |

### What to Record

Extract and include in reports/agent prompts:

```
Platform: {PlatformVersion from packages.json}
Theme: {version from artifact.json URL}
Key modules: {list modules relevant to the test scope with their versions}
```

### When to Verify PRs

PRs in `vc-frontend` and `vc-module-*` are deployed to QA **while still open** (not merged). Testing happens before merge.

For `/qa-test PR #NNN` and `/qa-verify-fix`:

1. Get PR details: `gh pr view <number> --json title,state,headRefName,labels` — note the branch and any CI build artifact version (often in PR description or CI checks)
2. Identify which module/theme the PR belongs to (from the repo name)
3. Cross-reference the module/theme version in `backend/packages.json` or `theme/artifact.json` — look for the PR's **build artifact version** (e.g., alpha/preview version like `2.44.0-alpha.2262`)
4. If the deploy repo doesn't contain the PR's build version → the PR build is **not yet deployed** to QA. Warn user and ask whether to wait
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

Store the fetched deploy state in `reports/deploy-state-cache.json` with a timestamp. Reuse within the same hour to avoid redundant GitHub API calls. Invalidate if the user says a new deployment happened.
