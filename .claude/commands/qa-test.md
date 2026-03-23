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

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record: platform version, theme version, and modules relevant to the ticket scope
   - **For PR testing:** PRs are deployed to QA while still open. Confirm the PR's build artifact version appears in `packages.json` (modules) or `artifact.json` (theme). If not deployed → warn user and ask whether to wait
   - Include version info in agent dispatch prompts and the final summary
3. **Duplicate check** — scan `tests/{SPRINT}/` for the same ticket tested in the last 2 hours. If found, warn user and show previous results.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected feature's domain (e.g., `"cart xAPI mutations"`, `"order processing workflow"`) with `tokens: 8000`. Pass findings to agents in Step 3.

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

### Step 4 — Exploratory Testing (SBTM)

After all scripted agents return, run a **targeted exploratory session** using `/qa-sbtm` methodology to find issues that scripted tests miss. This step is mandatory for P0/P1 tickets and critical revenue flows; optional (but recommended) for P2/P3.

1. **Create a charter** scoped to the ticket/feature:
   - Mission: explore the changed area and its integration boundaries
   - Charter type: **Risk** (for bug fixes) or **Feature** (for new functionality)
   - Heuristic: **SFDPOT** for UI changes, **CRISP** for API/backend changes
   - Time box: 20 minutes (10 min explore + 5 min adjacent areas + 5 min document)

2. **Dispatch `qa-testing-expert`** (if not already dispatched in Step 3) on `playwright-firefox`:
   ```
   Exploratory session for VCST-XXXX.

   Charter: [mission statement]
   Heuristic: [SFDPOT or CRISP]
   Focus areas:
   - Interaction with adjacent features (e.g., cart ↔ checkout boundary)
   - Data edge cases not covered by ACs (empty states, max lengths, special chars)
   - Error recovery paths (network failures, validation errors, back-button)
   - State persistence across navigation (refresh, deep link, browser back)

   Environment: {FRONT_URL} / {BACK_URL}
   Browser: playwright-firefox
   Output: tests/{SPRINT}/VCST-XXXX/exploratory-session.md

   Log findings in real-time. Classify each as: Bug | Question | Observation | Risk.
   Follow evidence capture policy for any bugs found.
   ```

3. **If `qa-testing-expert` was already dispatched** in Step 3 for cross-browser verification, include the exploratory charter as an additional task in the same agent prompt instead of dispatching twice.

4. **Merge findings** into the overall results before proceeding to Step 5.

---

### Step 5 — Collect & Decide

After all agents return (including the exploratory session), **validate evidence quality first:**

| Check | Action if Missing |
|---|---|
| Agent claims PASS but provided no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Request evidence before filing bug |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| Bugs found but no JIRA tickets mentioned | Ask user if bugs should be filed via `/qa-bug` |
| Business rule `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |
| Exploratory session skipped for P0/P1 ticket | Flag as incomplete — exploratory coverage required |

Then evaluate against decision matrix:

| Decision | Criteria |
|---|---|
| **PASS** | All ACs met, all `BL-*` rules verified, no P0/P1 bugs, exploratory session clean |
| **PASS WITH NOTES** | ACs met, minor P2/P3 issues tracked in JIRA, exploratory observations logged |
| **FAIL** | Any AC not met, any `BL-*` rule violated, or P0/P1 bug found |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

---

### Step 6 — JIRA Transition (with confirmation)

Ask the user before transitioning JIRA status. Skip this step if Atlassian MCP is not configured.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures |

Add a JIRA comment with:
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
Exploratory: [N] findings ([bugs/observations/risks]).
Business rules verified: [BL-* list].
Bugs: [list or None]. Decision: [verdict].
Artifacts: tests/{SPRINT}/VCST-XXXX/
```

---

### Step 7 — Deliver Summary

Write `tests/{SPRINT}/VCST-XXXX/summary.json`:
```json
{
  "ticket": "VCST-XXXX",
  "verdict": "PASS|PASS_WITH_NOTES|FAIL|BLOCKED",
  "date": "YYYY-MM-DD",
  "environment": "{FRONT_URL}",
  "build": {
    "platform": "{PlatformVersion}",
    "theme": "{theme version}",
    "relevant_modules": {"module-name": "version"}
  },
  "agents_dispatched": ["qa-frontend-expert", "qa-backend-expert"],
  "total_cases": 0,
  "passed": 0,
  "failed": 0,
  "blocked": 0,
  "bugs_filed": [],
  "business_rules_verified": ["BL-CART-001"],
  "exploratory": {
    "charter": "Risk charter for VCST-XXXX",
    "heuristic": "SFDPOT|CRISP",
    "findings": { "bugs": 0, "questions": 0, "observations": 0, "risks": 0 }
  },
  "artifacts": "tests/{SPRINT}/VCST-XXXX/"
}
```

Output to the user: verdict, coverage summary, business rules verified, exploratory findings, bugs found, and artifact paths.

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, error handling, and JIRA transitions
- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server simultaneously
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- Browser fallback: chrome→firefox, edge→chrome, firefox→edge (max 1 retry)
- If an agent fails with an internal error, fall back to working directly rather than retrying the same delegation
- If Atlassian MCP is unavailable, skip JIRA transitions and ask user for ticket details manually
- Always load `business-logic.md` for the affected domains — agents must know what rules to verify
- Always query Context7 in Step 0 — pass findings to agents so they test against current module behavior
- Exploratory session (Step 4) is mandatory for P0/P1 tickets and critical revenue flows — skip only for P2/P3 if user explicitly opts out
- If `qa-testing-expert` is already dispatched in Step 3, combine exploratory charter into that agent's prompt rather than spawning a second instance
