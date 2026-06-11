---
description: "Test a JIRA ticket, feature area, or PR. Analyzes scope, dispatches specialist agents, correlates App Insights logs for the test window, and produces a verdict."
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

## Pipeline: Analyze → Plan → Write → Execute → Explore → Report

### Step 1 — Analyze

Gather all inputs and determine scope. Combines pre-flight checks with scope analysis.

**Pre-flight (per `.claude/templates/agent-dispatch.md`):**
1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — use GitHub MCP `get_file_contents` to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs):
   - Record: platform version (`PlatformVersion`), theme version (from `artifact.json` URL), and modules relevant to the ticket scope
   - **For PR testing:** PRs are deployed to QA while still open. Confirm the PR's build artifact version appears in `packages.json` (modules) or `artifact.json` (theme). If not deployed → warn user and ask whether to wait
3. **Duplicate check** — scan `tests/{SPRINT}/` for the same ticket tested in the last 2 hours. If found, warn user and show previous results.

**Resolve current sprint** — check if `tests/Sprint-current` exists → use it. Otherwise list `tests/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths. Create the folder if it doesn't exist.

**Scope analysis:**

**For JIRA tickets** — try Atlassian MCP (`getJiraIssue`) first. If Atlassian MCP is not configured, ask the user to paste the ticket details (summary, ACs, components, linked PR):
- Summary, Type, Priority, Status, Components, Acceptance Criteria
- Linked PR: use GitHub MCP `get_pull_request` (owner, repo, pull_number) for PR details and `get_pull_request_files` to see changed files
- Confirm ticket is in a testable status

**For a PR** — use GitHub MCP `get_pull_request` (owner, repo, pull_number) for details + `get_pull_request_files` for changed files:
- Map file extensions to areas: `.cs` / `.csproj` → Backend, `.vue` / `.ts` / `.tsx` / `.jsx` → Frontend, `.css` / `.scss` → Styling

**For a feature name** — use the name to determine which areas are affected.

**Identify applicable domain(s)** — map the ticket/feature to one or more of the 63 domains in `/qa-checklist` (33 storefront + 29 backend/admin + 1 GraphQL).

**Scope output** (produce before proceeding):
```
Ticket: VCST-XXXX | Priority: P0/P1/P2 | Changed: Backend / Frontend / Both
Domains: [Cart, Payment, ...]
Acceptance Criteria: X identified
Business Rules: [BL-CART-001, BL-PAY-003, ...]
Agents to dispatch: [list]
```

---

### Step 2 — Plan

Determine testing strategy: load knowledge, query docs, and route agents.

**Load knowledge files** relevant to the identified domains (read from `.claude/agents/knowledge/`):
- **business-logic.md** — find all `BL-*` invariants for the affected domains. These become mandatory verification points.
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns for the domains.
- **domain-checklists.md** / **backend-admin-checklists.md** / **graphql-checklist.md** (via `/qa-checklist`) — identify checklist items for the domains.

**Context7 query** — resolve `/virtocommerce/vc-docs`, query the affected feature's domain (e.g., `"cart xAPI mutations"`, `"order processing workflow"`) with `tokens: 8000`. Pass findings to agents in Step 4.

**Agent routing table:**

| Affected Area | Agent | Browser |
|---|---|---|
| Storefront UI, checkout, cart, search, mobile | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA, APIs, modules, GraphQL, backend | `qa-backend-expert` | `playwright-edge` |
| Storybook components, accessibility, design system | `ui-ux-expert` | Chrome DevTools MCP |
| Cross-browser, exploratory, Figma comparison, debugging | `qa-testing-expert` | `playwright-firefox` |

**Minimum dispatch rules:**
- Backend-only change → `qa-backend-expert` only
- Frontend-only change → `qa-frontend-expert` only
- Both layers → `qa-backend-expert` + `qa-frontend-expert` in parallel
- UI/component change → add `ui-ux-expert`
- P0 ticket or critical revenue flow → add `qa-testing-expert` for cross-browser verification

---

### Step 3 — Write (test-management-specialist)

**Always** dispatch `test-management-specialist` to produce a testing checklist or test cases before execution. This step must complete before Step 4.

1. **Check for existing test cases** — look in `regression/suites/` for suites that cover the affected domains.
2. **If test cases exist** → generate a **testing checklist** scoped to the ticket/PR:
   - Map ACs to existing suite test cases
   - Add checklist items for `BL-*` rules and `ECL-*` edge cases not covered by existing suites
   - Flag gaps where no existing test case covers an AC
3. **If no test cases exist** → generate **new test cases** using `/qa-test-cases-generator` methodology:
   - Derive cases from ACs, `BL-*` invariants, `ECL-*` patterns, and domain checklists
   - Write cases to `tests/{SPRINT}/VCST-XXXX/test-cases.csv`
4. **Output:** `tests/{SPRINT}/VCST-XXXX/testing-checklist.md` — used by execution agents in Step 4 as their test plan.

---

### Step 4 — Execute

Read environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`).

**Record the test window start** — note the current timestamp before dispatching. The interval from here until execution agents return defines the App Insights correlation window used in Step 6a.

Launch all applicable agents **simultaneously** in a single message using the Agent tool. Each agent prompt must include:
- The ticket ID(s) or feature being tested
- **Testing checklist or test cases** — include the output from Step 3
- **Business rules to verify** — `BL-*` invariant IDs and rule text from Step 2
- **Edge cases to cover** — `ECL-*` patterns from Step 2
- The browser server to use (from routing table in Step 2)
- Environment URLs
- Output path: `tests/{SPRINT}/VCST-XXXX/` or `tests/{SPRINT}/feature-name/`
- Evidence capture policy: `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

Example prompt structure:
```
Test VCST-XXXX on the [backend/frontend].

Context: [brief description of what changed]
Environment: {FRONT_URL} / {BACK_URL}
Browser: {BROWSER_SERVER}
Output: tests/{SPRINT}/VCST-XXXX/

Testing checklist: [from Step 3 output]

Business Rules (must verify):
- BL-CART-001: [rule text]
- BL-PAY-003: [rule text]

Edge Cases to cover:
- ECL-1.1: [pattern description]

Evidence policy: follow .claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

Always-on bug detection (shared-instructions §Always-On Bug Detection): the checklist is the floor, not the ceiling. While executing, hunt across EVERY layer (UI/visual, functional, console, network, GraphQL errors[] inside 200, a11y, perf) and file any incidental defect you see — even one unrelated to this ticket (out-of-scope-bug rule). Pursue every "huh." Verify before filing (disabled control / API-only / by-design are not bugs).

Write a test execution report to tests/{SPRINT}/VCST-XXXX/test-execution-report.md.
```

---

### Step 5 — Explore (SBTM)

After all execution agents return, run a **targeted exploratory session** using `/qa-sbtm` methodology. Mandatory for P0/P1 tickets and critical revenue flows; optional (but recommended) for P2/P3.

1. **Create a charter** scoped to the ticket/feature:
   - Mission: explore the changed area and its integration boundaries
   - Charter type: **Risk** (for bug fixes) or **Feature** (for new functionality)
   - Heuristic: **SFDPOT** for UI changes, **CRISP** for API/backend changes
   - Time box: 20 minutes (10 min explore + 5 min adjacent areas + 5 min document)

2. **Dispatch `qa-testing-expert`** (if not already dispatched in Step 4) on `playwright-firefox`:
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

3. **If `qa-testing-expert` was already dispatched** in Step 4 for cross-browser verification, include the exploratory charter as an additional task in the same agent prompt instead of dispatching twice.

---

### Step 6 — Report

Collect results, decide verdict, transition JIRA, and deliver summary.

**6a. Correlate App Insights logs (test window):**

Catch backend errors the UI test *triggered but didn't surface* — 5xx, failed dependencies, server exceptions, and GraphQL `errors[]` returned inside a 200. This is the `/qa-monitoring` machinery scoped to the test window: **query → dedup → triage**, no separate live-repro phase (the execution agents were already live — an error that fired during their window *is* the repro).

1. **Pre-flight.** Confirm App Insights access the same way `/qa-monitoring` Phase 0 does (Azure MCP `applicationinsights`, **or** `APPINSIGHTS_APP_ID_*` + `APPINSIGHTS_API_KEY_*` set). If neither is configured → **skip this sub-step with a one-line note** ("App Insights not configured — log correlation skipped"); never block the verdict on it.
2. **Query the window.** For each affected layer (frontend → storefront resource, backend → platform resource; resolve from `APPINSIGHTS_*` env vars, never hardcode), run the probe queries from `ci/monitoring/queries/` scoped to the Step 4 window — a relative `ago()` window covering execution start through now, +2 min buffer.
3. **Dedup + triage.** Classify signatures against `reports/monitoring/.seen-fingerprints.json` (read-only here — do not persist; a narrow test window must still surface SEEN-stable errors if they fired during it). Delegate interpretation to `qa-backend-expert` using `ci/agents/monitor-triage-agent.md`: each signal → `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY | TRANSIENT` + severity + confidence. When ambiguous, prefer NEEDS_REVIEW over REAL_BUG.
4. **Fold into the verdict.** A HIGH-confidence `REAL_BUG` correlated to the test window is failing evidence (see 6c) — the error fired while the agents exercised this feature, so it is already reproduced. Attach the signature + telemetry portal link as evidence; do NOT draft a separate `BUG-AI-*` monitoring report (the test's own bug filing in 6d owns it). NEEDS_REVIEW / NOISE / KNOWN_ISSUE → note in the report, don't fail on them.

**6b. Validate evidence quality:**

| Check | Action if Missing |
|---|---|
| Agent claims PASS but provided no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Request evidence before filing bug |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| Bugs found but no JIRA tickets mentioned | Ask user if bugs should be filed via `/qa-bug` |
| Business rule `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |
| Exploratory session skipped for P0/P1 ticket | Flag as incomplete — exploratory coverage required |
| HIGH-confidence `REAL_BUG` in the App Insights window (6a) but not reflected in agent results | Surface it — the UI test missed a backend error; fold into verdict |

**6c. Decide verdict:**

| Decision | Criteria |
|---|---|
| **PASS** | All ACs met, all `BL-*` rules verified, no P0/P1 bugs, exploratory session clean, no correlated HIGH-confidence `REAL_BUG` in the test window (6a) |
| **PASS WITH NOTES** | ACs met, minor P2/P3 issues tracked in JIRA, exploratory observations logged, only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC not met, any `BL-*` rule violated, P0/P1 bug found, or a HIGH-confidence `REAL_BUG` correlated to the test window (6a) |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

**6d. JIRA transition (with confirmation):**

Ask the user before transitioning. Skip if Atlassian MCP is not configured.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures |

Add a JIRA comment with:
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
Exploratory: [N] findings ([bugs/observations/risks]).
App Insights (test window): [N] correlated signals — [confirmed/needs-review/none].
Business rules verified: [BL-* list].
Bugs: [list or None]. Decision: [verdict].
Artifacts: tests/{SPRINT}/VCST-XXXX/
```

**6e. Deliver summary:**

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
  "appinsights": {
    "checked": true,
    "layers": ["frontend", "backend"],
    "window_minutes": 0,
    "signals": { "real_bug": 0, "needs_review": 0, "dismissed": 0 },
    "correlated_failures": []
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
- Always query Context7 in Step 2 — pass findings to agents so they test against current module behavior
- `test-management-specialist` (Step 3) must complete before dispatching execution agents (Step 4)
- Exploratory session (Step 5) is mandatory for P0/P1 tickets and critical revenue flows — skip only for P2/P3 if user explicitly opts out
- If `qa-testing-expert` is already dispatched in Step 4, combine exploratory charter into that agent's prompt rather than spawning a second instance
- App Insights correlation (Step 6a) reuses `/qa-monitoring`'s query + dedup + triage machinery (`ci/monitoring/queries/*.kql`, `reports/monitoring/.seen-fingerprints.json` read-only, `ci/agents/monitor-triage-agent.md`) scoped to the test window — **no separate live-repro phase** (the execution agents already exercised the feature). Resolve resources from `APPINSIGHTS_*`, never hardcode; skip gracefully (don't block the verdict) when App Insights is unconfigured
- A correlated error does NOT get its own `BUG-AI-*` monitoring draft — the test's own bug filing (`/qa-bug` in 6d) owns it, to avoid duplicate reports
