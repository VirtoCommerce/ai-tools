---
description: "Test a JIRA ticket, feature area, or PR. Analyzes scope, dispatches specialist agents, and produces a verdict."
argument-hint: "VCST-XXXX | feature name | PR #NNN"
disable-model-invocation: true
---

# /qa-test — Test a JIRA Ticket or Feature

Analyze scope, dispatch specialist agents, collect results, and produce a verdict. You run this orchestration inline — do NOT delegate to another orchestrator agent.

## Usage
```
/qa-test VCST-1234              # Test a specific JIRA ticket
/qa-test VCST-1234 VCST-1235    # Test multiple tickets
/qa-test checkout flow           # Test a feature area by name
/qa-test PR #789                 # Test changes in a GitHub PR
```

---

## Execution

### Step 1 — Analyze Scope

**Resolve current sprint** — check if `tests/Sprint-current` exists → use it. Otherwise list `tests/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths. Create the folder if it doesn't exist.

**For JIRA tickets** — try Atlassian MCP (`getJiraIssue`) first. If Atlassian MCP is not configured, ask the user to paste the ticket details (summary, ACs, components, linked PR):
- Summary, Type, Priority, Status, Components, Acceptance Criteria
- Linked PR: run `gh pr view <number>` and `gh pr diff <number> --name-only` to see changed files
- Confirm ticket is in a testable status

**For a PR** — use `gh pr view <number>` + `gh pr diff <number> --name-only`:
- Map file extensions to areas: `.cs` / `.csproj` → Backend, `.vue` / `.tsx` / `.jsx` → Frontend, `.css` / `.scss` → Styling

**For a feature name** — use the name to determine which areas are affected.

**Identify applicable domain(s)** — map the ticket/feature to one or more of the 18 domains in `/qa-checklist` (Auth, Catalog, Cart/Checkout, Payment, Orders, etc.). This drives knowledge loading in Step 2.

**Scope output** (produce before dispatching):
```
Ticket: VCST-XXXX | Priority: P0/P1/P2 | Changed: Backend / Frontend / Both
Domains: [Cart, Payment, ...]
Acceptance Criteria: X identified
Business Rules: [BL-CART-001, BL-PAY-003, ...]
Agents to dispatch: [list]
```

---

### Step 2 — Load Context & Route Agents

**Load knowledge files** relevant to the identified domains (read from `.claude/agents/knowledge/`):
- **business-logic.md** — find all `BL-*` invariants for the affected domains. These become mandatory verification points.
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns for the domains. Include relevant ones in agent prompts.
- **domain-checklists.md** (via `/qa-checklist`) — identify checklist items for the domains to ensure nothing is missed.

**Check for existing test cases** — look in `regression/suites/` for suites that cover the affected domains. If no test cases exist for the feature:
- Add `test-management-specialist` to generate test cases first (sequential, before execution agents)
- The specialist should use the `/qa-test-cases-generator` methodology

**Agent routing table:**

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, exploratory, Figma comparison, debugging | `qa-testing-expert` | `playwright-firefox` |
| New feature needing test cases | `test-management-specialist` | `playwright-chrome` (sequential, never parallel with frontend) |

**Minimum dispatch rules:**
- Backend-only change → `qa-backend-expert` only
- Frontend-only change → `qa-frontend-expert` only
- Both layers → `qa-backend-expert` + `qa-frontend-expert` in parallel
- UI/component change → add `ui-ux-expert`
- New feature with no test cases → `test-management-specialist` first (sequential), then dispatch execution agents
- P0 ticket or critical revenue flow → add `qa-testing-expert` for cross-browser verification

---

### Step 3 — Dispatch Agents

Read environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`).

Launch all applicable agents **simultaneously** in a single message using the Agent tool. Each agent prompt must include:
- The ticket ID(s) or feature being tested
- Specific tasks derived from the acceptance criteria
- **Business rules to verify** — list the `BL-*` invariant IDs and their rule text from Step 2
- **Edge cases to cover** — list relevant `ECL-*` patterns from Step 2
- The browser server to use (from routing table above)
- Environment URLs
- Output path: `tests/{SPRINT}/VCST-XXXX/` or `tests/{SPRINT}/feature-name/`
- Instruction to follow the evidence capture policy in `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

Example prompt structure:
```
Test VCST-XXXX on the [backend/frontend].

Context: [brief description of what changed]
Environment: {FRONT_URL} / {BACK_URL}
Browser: {BROWSER_SERVER}
Output: tests/{SPRINT}/VCST-XXXX/

Acceptance Criteria to verify:
1. [AC 1]
2. [AC 2]

Business Rules (must verify):
- BL-CART-001: [rule text]
- BL-PAY-003: [rule text]

Edge Cases to cover:
- ECL-1.1: [pattern description]

Tasks:
- [Specific test actions]

Evidence policy: follow .claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

Write a test execution report to tests/{SPRINT}/VCST-XXXX/test-execution-report.md.
```

---

### Step 4 — Collect & Decide

After all agents return, **validate evidence quality first:**

| Check | Action if Missing |
|---|---|
| Agent claims PASS but provided no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Request evidence before filing bug |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| Bugs found but no JIRA tickets mentioned | Ask user if bugs should be filed via `/qa-bug` |
| Business rule `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |

Then evaluate against decision matrix:

| Decision | Criteria |
|---|---|
| **PASS** | All ACs met, all `BL-*` rules verified, no P0/P1 bugs |
| **PASS WITH NOTES** | ACs met, minor P2/P3 issues tracked in JIRA |
| **FAIL** | Any AC not met, any `BL-*` rule violated, or P0/P1 bug found |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

---

### Step 5 — JIRA Transition (with confirmation)

Ask the user before transitioning JIRA status. Skip this step if Atlassian MCP is not configured.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures |

Add a JIRA comment with:
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
Business rules verified: [BL-* list].
Bugs: [list or None]. Decision: [verdict].
Artifacts: tests/{SPRINT}/VCST-XXXX/
```

---

### Step 6 — Deliver Summary

Write `tests/{SPRINT}/VCST-XXXX/summary.json`:
```json
{
  "ticket": "VCST-XXXX",
  "verdict": "PASS|PASS_WITH_NOTES|FAIL|BLOCKED",
  "date": "YYYY-MM-DD",
  "environment": "{FRONT_URL}",
  "agents_dispatched": ["qa-frontend-expert", "qa-backend-expert"],
  "total_cases": 0,
  "passed": 0,
  "failed": 0,
  "blocked": 0,
  "bugs_filed": [],
  "business_rules_verified": ["BL-CART-001"],
  "artifacts": "tests/{SPRINT}/VCST-XXXX/"
}
```

Output to the user: verdict, coverage summary, business rules verified, bugs found, and artifact paths.

---

## Rules

- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- If an agent fails with an internal error, fall back to working directly rather than retrying the same delegation
- If Atlassian MCP is unavailable, skip JIRA transitions and ask user for ticket details manually
- Always load `business-logic.md` for the affected domains — agents must know what rules to verify
