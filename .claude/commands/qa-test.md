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

**Resolve current sprint first** — list the `tests/` directory and pick the latest `SprintXX-XX` folder (alphabetically last). This becomes `{SPRINT}` for all output paths in this run.

**For JIRA tickets** — fetch via Atlassian MCP (`getJiraIssue`):
- Summary, Type, Priority, Status, Components, Acceptance Criteria
- Linked PR: run `gh pr view <number>` and `gh pr diff <number> --name-only` to see changed files
- Confirm ticket is in a testable status

**For a PR** — use `gh pr view <number>` + `gh pr diff <number> --name-only`:
- Map file extensions to areas: `.cs` / `.csproj` → Backend, `.vue` / `.tsx` / `.jsx` → Frontend, `.css` / `.scss` → Styling

**For a feature name** — use the name to determine which areas are affected.

**Scope output** (produce before dispatching):
```
Ticket: VCST-XXXX | Priority: P0/P1/P2 | Changed: Backend / Frontend / Both
Acceptance Criteria: X identified
Agents to dispatch: [list]
```

---

### Step 2 — Agent Routing

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, exploratory, Figma comparison, debugging | `qa-testing-expert` | `playwright-firefox` |
| New feature needing test documentation | `test-management-specialist` | (no browser) |

**Minimum dispatch rules:**
- Backend-only change → `qa-backend-expert` only
- Frontend-only change → `qa-frontend-expert` only
- Both layers → `qa-backend-expert` + `qa-frontend-expert` in parallel
- UI/component change → add `ui-ux-expert`
- New feature with no test cases → add `test-management-specialist` first (sequential), then execute

---

### Step 3 — Dispatch Agents

Read environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`).

Launch all applicable agents **simultaneously** in a single message using the Agent tool. Each agent prompt must include:
- The ticket ID(s) or feature being tested
- Specific tasks derived from the acceptance criteria
- The browser server to use (from routing table above)
- Environment URLs
- Output path: `tests/{SPRINT}/VCST-XXXX/` or `tests/{SPRINT}/feature-name/` where `{SPRINT}` is the latest folder resolved in Step 1
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

Tasks:
- [Specific test actions]

Capture screenshots on failures, console errors, and HAR traffic.
Write a test execution report to tests/{SPRINT}/VCST-XXXX/test-execution-report.md.
```

---

### Step 4 — Collect & Decide

After all agents return, evaluate results against:

| Decision | Criteria |
|---|---|
| **PASS** | All ACs met, no P0/P1 bugs, CI green |
| **PASS WITH NOTES** | ACs met, minor P2/P3 issues tracked in JIRA |
| **FAIL** | Any AC not met, or P0/P1 bug found |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

**Red flags requiring follow-up:**
- "All passed" with no evidence → request verification
- Critical flow not tested → incomplete coverage
- Bugs found but no JIRA tickets filed → request filing

---

### Step 5 — JIRA Transition (with confirmation)

Ask the user before transitioning JIRA status:

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures |

Add a JIRA comment with:
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
Bugs: [list or None]. Decision: [verdict].
Artifacts: tests/{SPRINT}/VCST-XXXX/
```

---

### Step 6 — Deliver Summary

Output verdict, coverage summary, bugs found, and artifact paths to the user.

---

## Rules

- Never use WebKit — not supported on Windows
- Never assign two agents to the same browser server
- Read all URLs from config.js / .env — never hardcode
- Max 3 concurrent browser agents
- If an agent fails with an internal error, fall back to working directly rather than retrying the same delegation
