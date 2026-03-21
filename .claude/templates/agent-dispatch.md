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
2. **Context7 query** — for the target domain(s), verify current module behavior
3. **Duplicate check** — scan reports/ for recent runs matching scope
4. If any pre-flight fails → warn user with specific failure, ask whether to proceed
