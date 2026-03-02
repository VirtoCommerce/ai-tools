# ISTQB Test Process Lifecycle — Reference

The ISTQB Foundation-level test process defines 7 sequential phases. Each phase has formal entry/exit criteria and produces specific deliverables. Phases are sequential but iterative — findings in later phases can trigger revisiting earlier phases.

---

## Process Overview

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  PLAN   │───>│ ANALYZE │───>│ DESIGN  │───>│ IMPLEMENT │───>│ EXECUTE │───>│ REPORT  │───>│  CLOSE  │
│         │    │         │    │         │    │           │    │         │    │         │    │         │
│ scope   │    │ test    │    │ test    │    │ test data │    │ run     │    │ metrics │    │ retro   │
│ approach│    │ condi-  │    │ cases   │    │ environ-  │    │ tests   │    │ gates   │    │ archive │
│ risk    │    │ tions   │    │ tech-   │    │ ment      │    │ log     │    │ verdict │    │ lessons │
│ schedule│    │ trace-  │    │ niques  │    │ readiness │    │ defects │    │ GO/     │    │ loop    │
│ criteria│    │ ability │    │ data    │    │ checklist │    │ evidence│    │ NO-GO   │    │ back    │
└─────────┘    └─────────┘    └─────────┘    └───────────┘    └─────────┘    └─────────┘    └─────────┘
     ^                                                              │                            │
     │                         FEEDBACK LOOPS                       │                            │
     │    ┌─────────────────────────────────────────────────────────┘                            │
     │    │  Defects found during Execute may trigger re-Analysis or re-Design                   │
     │    v                                                                                      │
     └───────────────────────────────────────────────────────────────────────────────────────────┘
         Close phase feeds improvements and lessons learned back into the next cycle's Plan
```

**Key Principle:** The process is not strictly waterfall. Feedback loops are expected:
- A defect found in Execute may reveal a missing test condition (loop back to Analyze)
- A blocked test in Execute may reveal missing test data (loop back to Implement)
- Close insights always feed forward into the next cycle's Plan phase

---

## Phase-to-Asset Mapping

The navigation hub — shows which skill, command, or agent to use for each phase.

| Phase | Skill(s) | Command(s) | Primary Agent(s) | Key Deliverable |
|-------|----------|------------|-------------------|-----------------|
| **Plan** | `/qa-plan`, `/qa-risk` | — | test-management-specialist, qa-lead-orchestrator | Test plan, risk register, schedule |
| **Analyze** | `/qa-process` (this file) | — | test-management-specialist, qa-lead-orchestrator | Numbered test conditions list with traceability |
| **Design** | `/qa-test-design`, `/qa-sbtm` | — | test-management-specialist | Test cases (CSV/MD), exploratory charters, test data requirements |
| **Implement** | `/qa-process` (this file) | `/qa-env-check` | qa-lead-orchestrator | Readiness checklist (all green), test data created, environment verified |
| **Execute** | `/qa-investigate`, `/qa-evidence` | `/qa-test`, `/qa-smoke`, `/qa-regression` | qa-testing-expert, qa-frontend-expert, qa-backend-expert | Test results, defect reports, evidence artifacts |
| **Report** | `/qa-metrics` | `/qa-status` | qa-lead-orchestrator, regression-orchestrator | Quality report, gate verdict (APPROVED/CONDITIONS/BLOCKED) |
| **Close** | `/qa-process` (this file) | — | test-management-specialist, qa-lead-orchestrator | Retrospective, archived artifacts, updated risk register |

---

## Phase 1: Plan

**Purpose:** Define the scope, approach, resources, schedule, risk assessment, and entry/exit criteria for the testing effort.

### Entry Criteria
- Requirements or user stories are available (JIRA tickets with acceptance criteria)
- Test scope is identified (feature, sprint, release)
- Stakeholders are identified

### Activities
1. Define test scope — what is in scope, what is out of scope
2. Select test approach — manual, automated, exploratory, or hybrid
3. Assess risks using `/qa-risk` — 5x5 matrix, test depth allocation
4. Estimate effort and schedule
5. Identify required resources (environments, test data, tools, personnel)
6. Define entry/exit criteria for the overall test effort
7. Create test plan document using `test-management-specialist`

### Exit Criteria
- Test plan reviewed and approved
- Risk register created with risk scores and test depth allocation
- Schedule agreed with stakeholders
- Entry criteria for Analyze phase are defined

### Deliverables
- Test plan (scope, approach, schedule, risks, responsibilities)
- Risk register (from `/qa-risk`)
- Resource allocation

### VC Adaptation
- **Sprint planning:** 2-week cadence, focus on JIRA sprint backlog, use `/qa-plan` to map ACs to test conditions
- **Release planning:** Cross-sprint scope, include regression suite selection from `test-suites.json`, full risk assessment across all 36 suites

---

## Phase 2: Analyze ★

**Purpose:** Decompose requirements into atomic, testable conditions. This is the bridge between "what needs to be tested" (requirements) and "how to test it" (test cases).

### Entry Criteria
- Test plan approved (Phase 1 complete)
- Requirements / acceptance criteria available and stable
- Access to test basis documents (JIRA, Figma, Swagger, user stories)

### What Is a Test Basis?

The source material from which test conditions are derived:

| Test Basis Type | Source | Example |
|----------------|--------|---------|
| Acceptance Criteria | JIRA ticket | "User can add up to 100 items to cart" |
| UI Design | Figma spec | "Cart badge shows item count, max 99+" |
| API Contract | Swagger / OpenAPI | `POST /api/cart/items` accepts `quantity: integer, min: 1, max: 999` |
| User Story | JIRA epic/story | "As a B2B buyer, I want to reorder from order history" |
| Business Rule | Requirements doc | "Discount codes cannot stack — only one per order" |
| Existing Behavior | Production system | "Search autocomplete appears after 3 characters" |

### What Is a Test Condition?

A test condition is a **single, atomic, testable aspect** of a requirement. It is:
- **Numbered** — for traceability (e.g., COND-001)
- **Atomic** — tests one thing only
- **Traceable** — linked back to its source (AC, spec, or rule)
- **Technique-hinted** — suggests which test design technique to apply

A test condition is NOT a test case. It identifies WHAT to test. The test case (Phase 3: Design) defines HOW to test it.

### Derivation Process

**Step 1: Identify the test basis**
Gather all relevant sources for the feature under test.

**Step 2: Extract testable aspects**
For each AC or requirement, ask: "What distinct behaviors, rules, or states need verification?"

**Step 3: Number and classify conditions**
Assign IDs, link to source, estimate priority, hint at technique.

**Step 4: Review for completeness**
Check: Are all ACs covered? Are negative cases included? Are boundary conditions identified?

### Worked Example — VC Checkout

**Test Basis (JIRA AC):**
> "As a registered user, I can complete checkout with a valid credit card. The system should validate the card, process the payment, create an order, and send a confirmation email."

**Derived Test Conditions:**

| ID | Condition | Source | Priority | Technique Hint |
|----|-----------|--------|----------|----------------|
| COND-001 | Checkout completes successfully with valid Visa card | AC-1 | P0 | Happy path |
| COND-002 | Checkout completes successfully with valid Mastercard | AC-1 | P0 | EP (card type partition) |
| COND-003 | Checkout rejects expired credit card | AC-1 (implied) | P0 | BVA (expiry boundary) |
| COND-004 | Checkout rejects invalid CVV | AC-1 (implied) | P1 | EP (invalid partition) |
| COND-005 | Checkout rejects card with insufficient funds | AC-1 (implied) | P1 | Error guessing |
| COND-006 | Order is created in system after successful payment | AC-1 | P0 | State transition |
| COND-007 | Order appears in user's order history | AC-1 | P1 | Integration |
| COND-008 | Confirmation email is sent to user's registered email | AC-1 | P1 | Integration |
| COND-009 | Checkout handles payment gateway timeout gracefully | Implied | P1 | Error guessing |
| COND-010 | Checkout prevents double-submission | Implied | P0 | Error guessing |

**Note:** 1 acceptance criterion produced 10 test conditions. This is typical — ACs describe desired outcomes, conditions enumerate all the testable aspects including negative cases and edge cases.

### Output Template

```markdown
# Test Conditions — [Feature / VCST-XXXX]

**Test Basis:** [List sources: JIRA ticket, Figma URL, Swagger endpoint]
**Derived By:** [Agent / Person]
**Date:** [YYYY-MM-DD]

| ID | Condition | Source | Priority | Technique Hint |
|----|-----------|--------|----------|----------------|
| COND-001 | [atomic testable statement] | [AC-X / Figma / API] | P0-P3 | [EP/BVA/DT/ST/EG] |
| COND-002 | ... | ... | ... | ... |

**Coverage Summary:**
- Total conditions: X
- From ACs: X | From implied/negative: X | From edge cases: X
- P0: X | P1: X | P2: X | P3: X
```

### Exit Criteria
- Every AC has at least 1 test condition mapped
- Negative / error conditions identified for critical flows
- Test conditions reviewed (no duplicates, no gaps)
- Traceability matrix: condition → source is complete

---

## Phase 3: Design

**Purpose:** Write test cases with preconditions, steps, and expected results using formal test design techniques.

### Entry Criteria
- Test conditions list complete and reviewed (Phase 2 complete)
- Feature scope is stable (no major requirement changes pending)

### Activities
1. Select test design techniques using `/qa-test-design` selection guide:
   - EP + BVA as baseline for all features
   - Decision tables for features with 3+ business rule conditions
   - State transitions for lifecycle features (orders, quotes, returns)
   - Pairwise for high-combination features (browser × viewport × role)
   - Error guessing for mature features and edge cases
2. Derive test cases from test conditions using selected techniques
3. Define test data requirements for each test case
4. Build traceability: test conditions → test cases (many-to-many)
5. Design exploratory charters using `/qa-sbtm` for areas not well covered by scripted tests

### Exit Criteria
- All P0/P1 test conditions have at least 1 test case
- Test cases follow the standard format (ID, Title, Preconditions, Steps, Expected Result)
- Test data requirements documented
- Traceability matrix: conditions → cases is complete
- Exploratory charters drafted for risk-identified areas

### Deliverables
- Test cases (CSV or Markdown, compatible with TestRail import format)
- Exploratory testing charters
- Test data requirements list
- Traceability matrix

### VC Note
Always design negative test cases for payment flows (Skyflow, CyberSource, Authorize.Net, Datatrance). Card rejection, timeout, and double-submission are where revenue-critical bugs hide.

---

## Phase 4: Implement ★

**Purpose:** Prepare everything needed for test execution — test data, environments, tools, and automation readiness.

### Entry Criteria
- Test cases designed and reviewed (Phase 3 complete)
- Test environment is provisioned

### Pre-Execution Readiness Checklist

Run through these 12 items before starting any test execution. Flag any item that is not ready as a **blocker**.

| # | Check | How to Verify | Skill / Command |
|---|-------|---------------|-----------------|
| 1 | Environment health — all endpoints responding | Run `/qa-env-check vars` + `/qa-env-check endpoints` | `/qa-env-check` |
| 2 | MCP servers — all configured and responding | Run `/qa-env-check mcp` | `/qa-env-check` |
| 3 | Test accounts — provisioned with correct roles | Verify login for ADMIN, USER_EMAIL, USER2_*, USER_VIRTO_* | Manual / Playwright |
| 4 | Test data — products, categories, orgs exist in system | Check catalog has test products, orgs have members | Manual / API |
| 5 | Payment test cards — valid and not expired | Verify SKYFLOW_VISA, SKYFLOW_MASTERCARD, CyberSource, AuthNet, Datatrance cards in `.env` | `npm run env:check` |
| 6 | Browser configs — viewport, HAR, video settings correct | Review `config/mcp-playwright-*.config.json` | File check |
| 7 | HAR capture — enabled in browser configs | Confirm `recordHar` is set in browser configs | File check |
| 8 | Baseline screenshots — current for visual regression | Verify baselines exist for target components via `/qa-storybook` | `/qa-storybook` |
| 9 | Regression suite CSVs — up to date with latest test cases | Verify `regression/suites/` CSVs match test case inventory | File check |
| 10 | Preconditions — specific test preconditions are met | Review test case preconditions, create required state (e.g., orders, cart items) | Manual / API |
| 11 | Smoke passing — basic functionality confirmed | Run `/qa-smoke` or verify latest smoke result | `/qa-smoke` |
| 12 | Team notified — testing session start communicated | Post in Teams channel | Manual |

### Exit Criteria
- All 12 checklist items are green (or blockers documented with workarounds)
- Test data is created and verified in the target environment
- Browser sessions are configured and isolated per agent

### VC Adaptation
- For regression runs: verify `test-suites.json` manifest is current and suite selection is correct
- For parallel execution: confirm 3 browser slots are available (chrome, firefox, edge) with no conflicts
- For CI runs: verify Docker image builds and `ANTHROPIC_API_KEY` is set

---

## Phase 5: Execute

**Purpose:** Run tests, log actual results, compare against expected results, report defects, and update test status.

### Entry Criteria
- Readiness checklist passed (Phase 4 complete)
- Test environment is stable and accessible
- Test team is available

### Activities
1. Execute test cases methodically — use `/qa-test`, `/qa-smoke`, or `/qa-regression`
2. For each test case: compare actual vs expected, mark PASS/FAIL/BLOCKED/SKIPPED
3. Capture evidence per `/qa-evidence` policy — failures mandatory, passes selective
4. For failures: investigate using `/qa-investigate` (5-phase bug investigation)
5. File defect reports in `reports/bugs/` and optionally create JIRA tickets
6. Track execution progress in real-time (regression: `test-run-status.json`)

### Exit Criteria
- All planned test cases executed (or blocked with documented reason)
- All failures investigated and bugs filed
- Evidence captured for all failures and critical flow states
- Test execution report generated

### VC Adaptation
- Parallel execution: max 3 concurrent browser agents, each with isolated MCP server
- Regression pipeline: `regression-orchestrator` manages dispatch, retries, and browser fallback
- Smoke mode: 2-track parallel (storefront + admin/backend) for ~15 min GO/NO-GO

---

## Phase 6: Report

**Purpose:** Summarize test results, calculate quality metrics, evaluate quality gates, and provide a GO/NO-GO recommendation.

### Entry Criteria
- All planned test cases executed (Phase 5 complete)
- All bugs filed and triaged
- Evidence artifacts collected

### Activities
1. Calculate quality metrics using `/qa-metrics`:
   - Pass rate, fail rate, blocked rate, skip rate
   - Defect density, defect detection rate
   - Coverage metrics (requirement coverage, risk coverage)
2. Evaluate quality gates from `/qa-metrics gates`:
   - Smoke gate (daily): 100% P0 pass, 0 P0 bugs
   - Sprint gate: >=95% critical pass rate, 0 P0/P1 open
   - Release gate: >=98% overall, 0 P0, <3 P1 with workarounds
3. Render verdict: **APPROVED** / **APPROVED WITH CONDITIONS** / **BLOCKED**
4. Generate stakeholder report using appropriate verbosity tier from `/qa-evidence`:
   - Compact (smoke/regression pass), Detailed (sprint), Sign-Off (release)
5. Communicate results via Teams notification

### Exit Criteria
- Quality report published with metrics and verdict
- Stakeholders notified of GO/NO-GO decision
- All P0/P1 bugs escalated appropriately
- Report archived in `reports/regression/` or `reports/`

---

## Phase 7: Close ★

**Purpose:** Conduct retrospective, archive artifacts, update test assets for future cycles, and feed lessons learned back into the next cycle's Plan phase.

### Entry Criteria
- Quality report published and verdict communicated (Phase 6 complete)
- All test execution is complete (no in-progress tests)
- Stakeholder sign-off on the verdict

### Sprint / Release Close Checklist

| # | Action | Details | Output |
|---|--------|---------|--------|
| 1 | Archive test artifacts | Move sprint test docs from `tests/SprintXX/` to `archive/sprints/` | Archived folder |
| 2 | Archive regression report | Ensure `reports/regression/` has the final report with run ID | Archived report |
| 3 | Update regression suite CSVs | Add new test cases discovered during this cycle to `regression/suites/` | Updated CSVs |
| 4 | Update risk register | Adjust risk scores based on bugs found — increase risk for areas with escaped defects | Updated risk scores (via `/qa-risk`) |
| 5 | Identify new test conditions | From escaped defects or production bugs, derive new test conditions for next cycle | New COND-XXX entries |
| 6 | Update `test-suites.json` | If new testing areas were discovered, add suites or adjust test counts | Updated manifest |
| 7 | Update `history.json` | Ensure regression history has the latest run data for trend analysis | Updated history |
| 8 | Close JIRA test tasks | Transition all test-related JIRA tickets to Done/Closed | JIRA updated |
| 9 | Write retrospective notes | Document what worked, what didn't, and action items | Retrospective document |
| 10 | Notify stakeholders | Post close summary to Teams — cycle is complete | Teams notification |
| 11 | Clean test environment | Remove test data created during execution (orders, accounts, cart items) | Clean environment |
| 12 | Document lessons learned | Specific technical or process insights that should persist | Lessons in retrospective |
| 13 | Identify process improvements | What should change in the next cycle's Plan phase | Action items list |
| 14 | Update Storybook baselines | If visual changes were approved, update baseline screenshots | Updated baselines |
| 15 | Feed forward to next Plan | Hand off action items, updated risk register, new conditions to next cycle | Plan inputs |

### Retrospective Template

```markdown
# QA Retrospective — [Sprint XX / Release X.X]

**Date:** [YYYY-MM-DD]
**Participants:** [Agent names / team members]
**Scope:** [What was tested this cycle]

## Metrics Summary
| Metric | Value | Target | Delta |
|--------|-------|--------|-------|
| Overall pass rate | X% | >=95% | +/-X% |
| P0/P1 bugs found | X | 0 | — |
| Escaped defects | X | 0 | — |
| Test execution time | Xh | Xh | +/-Xh |
| Flaky tests identified | X | 0 | — |

## What Worked Well
- [Specific things that went well — tools, processes, communication]

## What Didn't Work
- [Specific problems encountered — blockers, gaps, inefficiencies]

## Action Items for Next Cycle
| # | Action | Owner | Target Phase |
|---|--------|-------|-------------|
| 1 | [specific improvement] | [who] | Plan / Analyze / Design / ... |
| 2 | ... | ... | ... |

## Risk Register Updates
| Area | Previous Risk | Updated Risk | Reason |
|------|-------------|-------------|--------|
| [module/feature] | Medium (8) | High (12) | [2 bugs escaped to production] |

## New Test Conditions Identified
| ID | Condition | Source | Priority |
|----|-----------|--------|----------|
| COND-XXX | [from escaped defect or new finding] | [bug ID / incident] | P0-P3 |
```

### Close Report Template

```markdown
# Test Cycle Close Report — [Sprint XX / Release X.X]

## 1. Outcomes
- **Verdict:** [APPROVED / CONDITIONS / BLOCKED]
- **Pass rate:** X% (target: X%)
- **Bugs found:** X total (X P0, X P1, X P2, X P3)
- **Escaped defects from previous cycle:** X
- **Regression suites run:** X of 36

## 2. Improvements Made This Cycle
- [What process/tool/coverage improvements were implemented]

## 3. Inputs for Next Cycle
- **Updated risk register:** [areas with changed risk scores]
- **New test conditions:** X conditions derived from this cycle's findings
- **Suite updates:** [new tests added to regression/suites/]
- **Open action items:** [from retrospective]
```

### Exit Criteria
- Retrospective completed and documented
- All artifacts archived
- Risk register updated
- Regression suites updated with new test cases
- Action items assigned with owners
- Close report published
- Next cycle's Plan phase has its inputs ready

---

## Phase Transition Gates

Each transition has criteria that must be met before moving to the next phase.

| Transition | Gate Criteria |
|------------|--------------|
| **Plan → Analyze** | Test plan approved, risk register created, scope defined, resources allocated |
| **Analyze → Design** | All ACs have >=1 test condition, negative conditions identified for critical flows, traceability complete |
| **Design → Implement** | All P0/P1 conditions have test cases, test data requirements documented, techniques applied and traced |
| **Implement → Execute** | All 12 readiness checklist items green (or blockers documented), test data created, environment stable |
| **Execute → Report** | All planned tests executed (or blocked with reason), all failures investigated, evidence captured |
| **Report → Close** | Quality report published, verdict communicated, stakeholders notified, P0/P1 bugs escalated |
| **Close → (next) Plan** | Retrospective completed, artifacts archived, risk register updated, action items assigned, suite CSVs updated |

**Important:** Gates are checkpoints, not barriers. If a gate criterion cannot be met, document the gap and get explicit approval to proceed. Never silently skip a gate.

---

## VC Lifecycle Adaptations

Not every testing effort needs all 7 phases. The ISTQB process scales to fit the context.

### Three Lifecycle Variants

| Variant | When | Phases Used | Time Budget | Cadence |
|---------|------|-------------|-------------|---------|
| **Daily Smoke** | Pre-deployment validation | Plan → Execute → Report | ~15 minutes | Daily (Mon-Fri) |
| **Sprint Cycle** | Sprint release testing | All 7 phases | 2-3 days | Every 2 weeks |
| **Major Release** | Production release | All 7 phases + extended Close | 5-7 days | As needed |

### Daily Smoke (Abbreviated)

| Phase | Activity | Time |
|-------|----------|------|
| Plan | Select smoke suite (Suite 01), confirm environment URL | 1 min |
| Execute | Run `/qa-smoke` — 12 P0 tests, 2-track parallel | 12 min |
| Report | GO / CONDITIONAL GO / NO-GO verdict | 2 min |

Phases skipped: Analyze, Design, Implement (pre-defined suite), Close (no retrospective for daily smoke).

### Sprint Cycle (Full)

| Phase | Activity | Time |
|-------|----------|------|
| Plan | Review sprint backlog, create test plan, assess risks | 2-4 hours |
| Analyze | Derive test conditions from new JIRA tickets | 2-3 hours |
| Design | Write test cases, design charters | 3-5 hours |
| Implement | Prepare test data, verify environment, run readiness checklist | 1-2 hours |
| Execute | Run sprint regression (`/qa-regression sprint`), test new features (`/qa-test`) | 8-16 hours |
| Report | Calculate metrics, evaluate sprint gate, publish report | 1-2 hours |
| Close | Retrospective, archive, update suites, feed forward | 1-2 hours |

### Major Release (Extended)

Same as Sprint Cycle but with:
- **Plan:** Full risk assessment across all 36 suites, cross-browser matrix planning
- **Execute:** Full regression (`/qa-regression full`), all 36 suites
- **Report:** Release gate (>=98% overall), security audit, performance baselines
- **Close:** Full retrospective with all stakeholders, comprehensive lessons learned, major suite updates

---

## Learning Loop Integration

The ISTQB process is cyclical. Each cycle's Close phase feeds into the next cycle's Plan phase through concrete artifacts:

```
Close (Cycle N)                          Plan (Cycle N+1)
─────────────────                        ─────────────────
Updated risk register        ──────>     Risk-based test selection
New test conditions          ──────>     Test scope expansion
Retrospective action items   ──────>     Process improvements
Escaped defect analysis      ──────>     Coverage gap identification
Suite CSV updates            ──────>     Regression suite composition
Flaky test list              ──────>     Test maintenance priorities
```

This connects to the broader learning loop across methodology skills:
1. **Bug found** (Execute, via `/qa-investigate`) →
2. **Risk updated** (Close, via `/qa-risk`) →
3. **New charter created** (next Analyze, via `/qa-sbtm`) →
4. **Coverage measured** (next Report, via `/qa-metrics`) →
5. **Process improved** (next Plan, via this skill's Close checklist)
