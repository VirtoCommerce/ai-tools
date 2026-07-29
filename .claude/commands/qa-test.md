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

## Pipeline: Analyze → Analyze Story (BA) → Plan → Write → Execute → Explore → Report

### Step 1 — Analyze

Gather all inputs and determine scope. Combines pre-flight checks with scope analysis.

**Pre-flight (per `.claude/templates/agent-dispatch.md`):**
1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, warn user.
2. **Build & version verification** — use GitHub MCP `get_file_contents` to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa` by default; use the branch matching `TEST_ENV` for other envs):
   - Record: platform version (`PlatformVersion`), theme version (from `artifact.json` URL), and modules relevant to the ticket scope
   - **For PR testing:** PRs are deployed to QA while still open. Confirm the PR's build artifact version appears in `packages.json` (modules) or `artifact.json` (theme). If any of the change's artifacts are not deployed → offer to run [`/qa-deploy-pr`](qa-deploy-pr.md) `<ticket-key>` (gathers all the change's fresh artifacts and prepares one gated deploy PR; **ask first**); otherwise warn user and ask whether to wait
3. **Duplicate check** — glob `reports/tickets/{SPRINT}/*/summary.json` for the same ticket with a `date` in the last 2 hours (per `.claude/rules/reports.md` §1, `summary.json` is the only narrative-adjacent artifact `/qa-test` still persists — this is what the duplicate scan reads). If found, warn user and show the previous verdict.

**Resolve current sprint** — check if `reports/tickets/Sprint-current` exists → use it. Otherwise list `reports/tickets/` and pick the latest `SprintXX-XX` folder. This becomes `{SPRINT}` for all output paths (rooted at `reports/tickets/{SPRINT}/`). Create the folder if it doesn't exist.

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

### Step 1b — Analyze the Story (BA gap & implementation review)

A strong test run starts from strong ACs. Before writing a single test case, the story under test gets critiqued — and its ACs compared against what was actually built. **Advisory, never blocking.**

Runs when scope is a JIRA ticket/story **with acceptance criteria**. Skip (with a one-line note) for a bare feature name or a PR with no governing story.

Dispatch **`ba-story-writer` in review mode (Mode B)** — analyze only, do NOT write a new story, do NOT touch JIRA. Pass:
- `existing_story` — the summary + description + ACs fetched in Step 1
- `jira_ref` + `domains` (from Step 1)
- `implementation: { pr_diff }` — the linked PR's changed files + diff already fetched in Step 1 (`get_pull_request_files`). This is the **static** AC↔code comparison; the **live** comparison happens later in Step 6b.

The BA returns (see `ba-story-writer` Mode B):
- **AC Quality Scorecard** — each existing AC: testable? / clarity / smells / KEEP·REWRITE·SPLIT (+ rewrite for each weak one)
- **Weak sides** — concrete rewrites for ambiguous / non-falsifiable / happy-path-only ACs
- **AC ↔ Implementation coverage** — per AC: SATISFIED / DRIFT / NOT-FOUND / CONTRADICTS against the diff, plus **unspecified implementation** (code changes no AC governs)
- **Gap analysis** — missing ACs (error paths, boundaries, guest/B2B variants, NFRs, integration boundaries), each mapped to a `BL-*`/`ECL-*` and phrased as a gap-AC
- **AC → Test traceability seed** — the merged table of atomic testable conditions (story ACs + gap-ACs), each carrying its `Impl verdict`

**Surface to the user inline:** the weak ACs, the DRIFT/CONTRADICTS/scope-creep findings, and the gap-ACs. Then **proceed** — fold the **gap-ACs into the test scope** alongside the story's own ACs, and carry every DRIFT/NOT-FOUND/CONTRADICTS into execution as a thing to verify **live** (a static-diff finding is a suspicion, not a defect).

**Output:** keep the AC traceability table in your working context (per `.claude/rules/reports.md` §1, this is a terminal-only artifact — no `ac-analysis.md` file). It is the spine for Step 3 (test cases) and Step 6 (verdict + live reconciliation), and gets folded into the single Step 6 chat report.

---

### Step 2 — Plan

Determine testing strategy: load knowledge, query docs, and route agents.

**Load knowledge files** relevant to the identified domains (read from `knowledge/`):
- **business-logic.md** — find all `BL-*` invariants for the affected domains. These become mandatory verification points.
- **e-commerce-edge-cases-library.md** — find `ECL-*` patterns for the domains.
- **domain-checklists.md** / **backend-admin-checklists.md** / **graphql-checklist.md** (via `/qa-checklist`) — identify checklist items for the domains.
- **`skills/qa-plan/e2e-scenario-catalog.md`** — map the ticket/feature to its `E2E-*` scenario(s) (105 scenarios across 18 domains). Record the matching scenario IDs and their pre-mapped regression suites — this is the suite-traceability backbone the Write step (Step 3) folds into the checklist.

**VirtoOZ docs query** (via the `/vc-docs` skill) — query the affected feature's domain against the topic-scoped VirtoOZ MCP tool that fits (e.g., `StorefrontDeveloperGuide` for `"cart xAPI mutations"`, `PlatformDeveloperGuide` for `"order processing workflow"`). VirtoOZ is the primary Virto Commerce documentation source; fall back to Context7 (`/virtocommerce/vc-docs`, `tokens: 8000`) only if VirtoOZ returns nothing. Pass findings to agents in Step 4.

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

The specialist follows the **`/qa-plan` methodology scoped to this ticket** — consult `e2e-scenario-catalog.md` for the `E2E-*` scenarios identified in Step 2 and inherit their regression-suite mappings — but the **output is the lightweight scoped `testing-checklist.md` below, NOT a full `/qa-plan` test plan / RTM / TestRail CSV.** Use the catalog for scenario coverage and suite traceability; do not run the full test-planning ceremony (SBTM/test-design/peer-review/Draft→Reviewed promotion) here — Step 5 owns exploratory, and full case authoring belongs to a standalone `/qa-plan` run.

**Consume the Step 1b AC traceability table** (`ac-analysis.md`) as the coverage spine — one row per atomic condition, covering both the story's own ACs and the BA-discovered gap-ACs. Conditions flagged DRIFT / NOT-FOUND / CONTRADICTS get an explicit checklist item to verify them live.

1. **Check for existing test cases** — look in `regression/suites/` for suites that cover the affected domains (start from the `E2E-*` → suite mappings recorded in Step 2).
2. **If test cases exist** → generate a **testing checklist** scoped to the ticket/PR:
   - Map **each atomic condition** from the Step 1b AC table (story ACs + gap-ACs) to existing suite test cases
   - Fold in the matching `E2E-*` scenario(s) from the catalog so cross-screen/journey coverage isn't missed
   - Add checklist items for `BL-*` rules and `ECL-*` edge cases not covered by existing suites
   - Flag gaps where no existing test case covers a condition
3. **If no test cases exist** → generate **new test cases** using `/qa-test-cases-generator` methodology:
   - Derive cases from the Step 1b AC conditions (story + gap-ACs), `E2E-*` scenarios, `BL-*` invariants, `ECL-*` patterns, and domain checklists
   - Write cases to `reports/tickets/{SPRINT}/VCST-XXXX/test-cases.csv` — this is category 2 (Test cases), the one file this step still writes to disk
4. **Output:** keep the testing checklist in your working context and pass it directly into the Step 4 agent prompts — per `.claude/rules/reports.md` §1 it is terminal-only (no `testing-checklist.md` file); it has no reader beyond this same run.

---

### Step 4 — Execute

Read environment URLs from `config.js` (`FRONT_URL`, `BACK_URL`).

**Record the test window start** — note the current timestamp before dispatching. The interval from here until execution agents return defines the App Insights correlation window used in Step 6a.

**Move the ticket to the in-testing status (JIRA only, no confirmation needed).** Before dispatching,
transition the ticket from its ready-to-test state into the **in-testing** status, so the board shows it is
actively under test rather than still queued. Status-only — no comment, no assignee change, no side effect
outside the tracker.

**Applies only when `tracker.kind = jira`** (`project-profile.json`; absent profile ⇒ Jira, the
VC-internal default). Jira gates status changes behind a **transition graph**, which is what makes this
step load-bearing:

- **Discover the transition live** — never hardcode a name or id (`knowledge/execution/tracker-ops.md`
  §live transition discovery). On the VC-internal VCST workflow the transition out of *Ready for test* is
  named **`On QA`** and lands on status **`Testing`** — the transition name does NOT match the target
  status, so match on the transition's `to.name` (in-testing), never on its own `name`. A client's Jira
  will use different labels.
- **This is a precondition for Step 6e, not a nicety:** on VCST, *Ready for test* offers only `On QA`,
  `go to inprogress`, `On hold`, `Cancelled` — **`Finish test` / `Need fixes` are not reachable until the
  ticket is in the in-testing status.** Skip this and the closing transition fails at the end of the run.
- Skip (with a one-line note) when: the tracker MCP isn't configured, the ticket is already in the
  in-testing status, or no in-testing transition is available from the current status. Never force a path
  through an unrelated status to reach it, and never transition to `Cancelled`/`On hold`.
- Testing a bare feature name or a PR with no ticket → nothing to transition; skip silently.

**`tracker.kind = azure` (Azure Boards): skip this step.** There is no transition graph — state is set
directly (`PATCH …/wit/workitems/<n>`, `/fields/System.State` via `tracker.azure.stateMap`), so the Step 6e
update has **no reachability precondition** and needs no in-testing hop. Set an in-testing state at Step 4
only if the deployment's `stateMap` actually declares one.

Launch all applicable agents **simultaneously** in a single message using the Agent tool. Each agent prompt must include:
- The ticket ID(s) or feature being tested
- **Testing checklist or test cases** — include the output from Step 3
- **Business rules to verify** — `BL-*` invariant IDs and rule text from Step 2
- **Edge cases to cover** — `ECL-*` patterns from Step 2
- The browser server to use (from routing table in Step 2)
- Environment URLs
- Screenshot output path: `reports/tickets/{SPRINT}/VCST-XXXX/screenshots/` (evidence only — no report file, see below)
- Evidence capture policy: `skills/qa-evidence/evidence-capture-policy.md`

Example prompt structure:
```
Test VCST-XXXX on the [backend/frontend].

Context: [brief description of what changed]
Environment: {FRONT_URL} / {BACK_URL}
Browser: {BROWSER_SERVER}
Screenshot output: reports/tickets/{SPRINT}/VCST-XXXX/screenshots/

Testing checklist: [from Step 3 output]

Business Rules (must verify):
- BL-CART-001: [rule text]
- BL-PAY-003: [rule text]

Edge Cases to cover:
- ECL-1.1: [pattern description]

Evidence policy: follow skills/qa-evidence/evidence-capture-policy.md
- Screenshots: failures + final state of critical flows only
- Console: capture errors, skip noise
- Network: capture 4xx/5xx and slow requests (>2s)
- HAR: always capture

Always-on bug detection (shared-instructions §Always-On Bug Detection): the checklist is the floor, not the ceiling. While executing, hunt across EVERY layer (UI/visual, functional, console, network, GraphQL errors[] inside 200, a11y, perf) and file any incidental defect you see — even one unrelated to this ticket (out-of-scope-bug rule). Pursue every "huh." Verify before filing (disabled control / API-only / by-design are not bugs).

Return your results (pass/fail per case, evidence refs, bugs found) directly in your final response —
per .claude/rules/reports.md §1 do NOT write a test-execution-report.md file; the orchestrator folds
your results into the single Step 6 report.
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
   Screenshot output (evidence only): reports/tickets/{SPRINT}/VCST-XXXX/screenshots/

   Log findings in real-time. Classify each as: Bug | Question | Observation | Risk.
   Follow evidence capture policy for any bugs found.
   Return your findings directly in your final response — per .claude/rules/reports.md §1 do NOT write
   an exploratory-session.md file (this is /qa-test's own ticket-scoped charter, not a standalone
   /qa-exploratory or /qa-sbtm domain session — those still write to reports/exploratory/).
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
4. **Fold into the verdict.** A HIGH-confidence `REAL_BUG` correlated to the test window is failing evidence (see 6d) — the error fired while the agents exercised this feature, so it is already reproduced. Attach the signature + telemetry portal link as evidence; do NOT draft a separate `BUG-AI-*` monitoring report (the test's own bug filing in 6e owns it). NEEDS_REVIEW / NOISE / KNOWN_ISSUE → note in the report, don't fail on them.

**6b. Reconcile ACs against live behavior (AC ↔ implementation):**

Step 1b compared each AC against the PR *diff* — a hypothesis. Now close it against what the execution agents actually observed **live**; this is the authoritative AC↔implementation check. For each condition in `ac-analysis.md`:

- **SATISFIED live** — agents confirmed the feature does what the AC says.
- **DRIFT / CONTRADICTS confirmed live** — filing-grade: the implementation diverges from the AC. Fold into the verdict (6d) as a failure; file via 6e. CONTRADICTS-live is the highest-priority finding — surface it explicitly.
- **NOT-FOUND** — agents observed no such behavior → the AC is unbuilt or the path went untested; mark untested and flag.
- **Static suspicion cleared** — a Step 1b DRIFT/NOT-FOUND that agents observed working correctly → resolved; note it (the diff was stale, not the behavior).

Carry the reconciled `Impl verdict` forward in your working context (no `ac-analysis.md` file — terminal-only per §1) for the Step 6d verdict decision and the final chat report. A diff-only finding never becomes a verdict input until confirmed (or cleared) here.

**6c. Validate evidence quality:**

| Check | Action if Missing |
|---|---|
| Agent claims PASS but provided no screenshots for critical flows | Request re-verification with evidence |
| Agent claims FAIL but no screenshot/console evidence | Request evidence before filing bug |
| Critical revenue flow (checkout, payment, cart) not explicitly tested | Flag as incomplete coverage |
| Bugs found but no JIRA tickets mentioned | Ask user if bugs should be filed via `/qa-bug` |
| Business rule `BL-*` listed in prompt but not mentioned in results | Flag as untested — request verification |
| **AC condition in the Step 1b table (story AC or gap-AC) has no PASS/FAIL evidence** | Flag as untested — verdict cannot be PASS until covered or explicitly waived |
| **AC marked DRIFT/CONTRADICTS at Step 1b but not reconciled live (6b)** | Flag — resolve the AC↔implementation status before verdict |
| Exploratory session skipped for P0/P1 ticket | Flag as incomplete — exploratory coverage required |
| HIGH-confidence `REAL_BUG` in the App Insights window (6a) but not reflected in agent results | Surface it — the UI test missed a backend error; fold into verdict |

**6d. Decide verdict:**

| Decision | Criteria |
|---|---|
| **PASS** | **Every atomic condition in the Step 1b AC table (story ACs + folded gap-ACs) carries PASS evidence**, all conditions reconciled SATISFIED-live (6b), all `BL-*` rules verified, no P0/P1 bugs, exploratory session clean, no correlated HIGH-confidence `REAL_BUG` in the test window (6a) |
| **PASS WITH NOTES** | All conditions met & reconciled, minor P2/P3 issues tracked in JIRA, exploratory observations logged, only NEEDS_REVIEW/NOISE/KNOWN_ISSUE in the log window |
| **FAIL** | Any AC condition not met, any AC confirmed DRIFT/CONTRADICTS live (6b), any `BL-*` rule violated, P0/P1 bug found, or a HIGH-confidence `REAL_BUG` correlated to the test window (6a) |
| **BLOCKED** | Environment down, missing test data, unresolved dependency |

**6e. JIRA transition (with confirmation):**

Ask the user before transitioning. Skip if Atlassian MCP is not configured.

| Outcome | Transition |
|---|---|
| PASS / PASS WITH NOTES | `Finish test` → TESTED |
| FAIL | `Need fixes` → REOPEN with comment listing failures |

**On Jira**, both closing transitions require the ticket to already be in the **in-testing** status — that's
the Step 4 move. If it was skipped there (or the run started from a ticket still at *Ready for test*),
discover the transitions live and do the in-testing move first, then the closing one. **On Azure Boards**
there is no transition graph: set the mapped `System.State` directly (`tracker.azure.stateMap`) — no
in-testing hop required. Either way **TESTED is the terminal state this command may reach — never
transition to Done or Cancelled.**

Add a JIRA comment with (Markdown, never Jira wiki markup; clear, brief, outcome-first, evidence
referenced not inlined — `knowledge/execution/tracker-ops.md` §5a **Comment & body style**; the block
below is illustrative content, not a literal wire format):
```
QA Complete — [X] cases, [Y] passed, [Z] failed.
AC review: [N] story ACs ([weak]/[ok]), [M] gap-ACs added; AC↔impl: [satisfied]/[drift]/[contradicts]/[not-found].
Exploratory: [N] findings ([bugs/observations/risks]).
App Insights (test window): [N] correlated signals — [confirmed/needs-review/none].
Business rules verified: [BL-* list].
Bugs: [list or None]. Decision: [verdict].
Evidence: reports/tickets/{SPRINT}/VCST-XXXX/screenshots/
```

**6f. Deliver summary:**

Per `.claude/rules/reports.md` §1, `summary.json` and evidence screenshots are the only artifacts this
command persists to disk — everything else (AC table, checklist, execution/exploratory findings) was
carried in-context and goes out in this same Step 6 chat report, not a separate file.

Write `reports/tickets/{SPRINT}/VCST-XXXX/summary.json`:
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
  "agents_dispatched": ["ba-story-writer", "qa-frontend-expert", "qa-backend-expert"],
  "ac_analysis": {
    "story_acs": 0,
    "weak_acs": 0,
    "gap_acs_added": 0,
    "impl_coverage": { "satisfied": 0, "drift": 0, "contradicts": 0, "not_found": 0 },
    "conditions_total": 0,
    "conditions_with_evidence": 0
  },
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
  "screenshots": "reports/tickets/{SPRINT}/VCST-XXXX/screenshots/"
}
```

Output to the user (chat, in full — this IS the report): verdict, the reconciled AC table, testing-checklist
results, exploratory findings, business rules verified, bugs found, and the screenshot folder path.

---

## Rules

- Follow `skills/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, error handling, and JIRA transitions
- Ticket status tracks the run: Step 4 moves it into the in-testing status (status-only, no confirmation), Step 6e closes it to TESTED / REOPEN (with confirmation). **Step 4's hop is JIRA-only** (`tracker.kind = jira`) — Jira's transition graph makes the closing transitions unreachable until it happens; Azure Boards sets `System.State` directly via `stateMap`, so it has no such precondition and Step 4 is skipped. Discover Jira transitions live; the transition name need not match the target status (VC-internal VCST: `On QA` → `Testing`)
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
- Step 1b BA story review (`ba-story-writer` Mode B) runs for any JIRA ticket with ACs — it is **advisory, never blocking**: surface weak ACs / gaps / implementation drift, fold gap-ACs into scope, and keep testing. Skip with a note for a bare feature name or PR with no governing story
- A Step 1b AC↔implementation finding from the PR diff is a **suspicion to verify live** (Step 6b), never a confirmed defect on its own — only a live-confirmed CONTRADICTS/DRIFT fails the verdict (mirrors the no-diff-only-bug rule)
- The Step 1b AC traceability table (kept in-context, not a file) is the verdict spine: a PASS requires PASS evidence for **every** atomic condition (story ACs + folded gap-ACs), all reconciled SATISFIED-live in Step 6b
- `ba-story-writer` in review mode must not write to JIRA/GitHub or author a replacement story — it returns the review only
- Steps 2–3 reuse the `/qa-plan` scenario catalog (`skills/qa-plan/e2e-scenario-catalog.md`) for `E2E-*` scenario coverage + regression-suite traceability, but produce a scoped in-context testing checklist — **not** a full `/qa-plan` test plan / RTM / TestRail CSV. Full case authoring + peer-review promotion belongs to a standalone `/qa-plan` run, not `/qa-test`
- **Terminal-only by design** (`.claude/rules/reports.md` §1): Steps 1b/3/4/5 never write `ac-analysis.md` / `testing-checklist.md` / `test-execution-report.md` / `exploratory-session.md`. Only `reports/tickets/{SPRINT}/VCST-XXXX/summary.json`, evidence screenshots, and (if Step 3 generates new cases) `test-cases.csv` persist to disk; every other finding is carried in-context and delivered once, in the Step 6 chat report
- Exploratory session (Step 5) is mandatory for P0/P1 tickets and critical revenue flows — skip only for P2/P3 if user explicitly opts out
- If `qa-testing-expert` is already dispatched in Step 4, combine exploratory charter into that agent's prompt rather than spawning a second instance
- App Insights correlation (Step 6a) reuses `/qa-monitoring`'s query + dedup + triage machinery (`ci/monitoring/queries/*.kql`, `reports/monitoring/.seen-fingerprints.json` read-only, `ci/agents/monitor-triage-agent.md`) scoped to the test window — **no separate live-repro phase** (the execution agents already exercised the feature). Resolve resources from `APPINSIGHTS_*`, never hardcode; skip gracefully (don't block the verdict) when App Insights is unconfigured
- A correlated error does NOT get its own `BUG-AI-*` monitoring draft — the test's own bug filing (`/qa-bug` in 6e) owns it, to avoid duplicate reports
