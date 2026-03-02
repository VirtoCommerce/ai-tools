# Defect Lifecycle Workflow

> Reference file for the `/qa-defect` skill. Covers the full defect management lifecycle: JIRA Bug Workflow (16 statuses), QA-owned transitions, triage process, report validation, defect classification, fix verification protocol, defect metrics, and escalation rules.
>
> For **bug investigation** (reproducing, isolating, root cause analysis), see `bug-investigation-flow.md` in the `/qa-investigate` skill.
> For **severity/priority classification**, see `risk-prioritization-framework.md` in the `/qa-risk` skill.
> For **bug report templates**, see `defect-report-templates.md` in this skill folder.
> For **evidence capture standards**, see `evidence-capture-policy.md` in the `/qa-evidence` skill.

---

## 1. Defect Lifecycle Overview

```
DETECT ──► TRIAGE ──► ASSIGN ──► FIX ──► VERIFY ──► CLOSE
  │           │                            │
  │           └─ Send back (incomplete)    └─ REOPEN (verification fails)
  │                                              │
  └── QA owns: Detect, Triage, Verify ──────────┘
```

**Three paths through the JIRA Bug Workflow:**

```
HAPPY PATH (most bugs):
  DRAFT → REFINEMENT → TO DO → IN PROGRESS → IN REVIEW → READY FOR TEST → TESTING → TESTED → DONE

REOPEN LOOP (fix failed verification):
  TESTED → REOPEN → IN PROGRESS → IN REVIEW → READY FOR TEST → TESTING → TESTED → ...

HOTFIX BRANCH (critical production bugs):
  REOPEN → WAIT HOTFIXES → HOTFIX READY → TESTING ON STABLE → DONE
```

**QA Actions by Lifecycle Phase:**

| Phase | QA Action | JIRA Transition |
|-------|-----------|----------------|
| Detect | Reproduce bug, gather evidence | — (create ticket) |
| Triage | Validate report, classify, set severity/priority, assign | DRAFT → REFINEMENT |
| Assign | Route to correct owner via triage matrix | REFINEMENT → TO DO |
| Fix | *(Dev owns)* — QA monitors aging, answers questions | — |
| Verify | Re-run STR, regression check, verify fix | TESTING → TESTED or REOPEN |
| Close | Confirm done, update metrics | TESTED → DONE |

---

## 2. JIRA Bug Workflow — Complete Status Map

**16 statuses** across 3 categories (verified via JIRA API + Bug Workflow diagram):

| # | Status | Category | Color | Description |
|---|--------|----------|-------|-------------|
| 1 | DRAFT | To Do | blue-gray | Initial bug report created, not yet refined |
| 2 | REFINEMENT | To Do | blue-gray | Under triage: validating, classifying, assigning |
| 3 | TO DO | To Do | blue-gray | Refined and ready for developer to pick up |
| 4 | ON HOLD | To Do | blue-gray | Blocked or deferred (global — any status can transition here) |
| 5 | IN PROGRESS | In Progress | yellow | Developer actively working on fix |
| 6 | IN REVIEW | In Progress | yellow | Code review in progress (PR submitted) |
| 7 | READY FOR TEST | In Progress | blue | Fix deployed to test environment, awaiting QA |
| 8 | TESTING | In Progress | blue | QA actively testing the fix |
| 9 | TESTED | In Progress | yellow | QA completed testing |
| 10 | VERIFY BY BA/PO | In Progress | green | Business/Product verification step |
| 11 | REOPEN | In Progress | yellow | Fix failed verification — needs rework |
| 12 | WAIT HOTFIXES | In Progress | green | Awaiting hotfix build for critical bugs |
| 13 | HOTFIX READY | In Progress | green | Hotfix build available for testing |
| 14 | TESTING ON STABLE | In Progress | green | Testing hotfix on stable branch |
| 15 | DONE | Done | green | Bug verified fixed and closed |
| 16 | CANCELLED | Done | green | Bug invalid, duplicate, or won't fix |

### Complete Transition Table

| From | Transition Name | To | Who Triggers | When |
|------|----------------|-----|-------------|------|
| *(start)* | Create | DRAFT | QA / Anyone | New bug filed |
| DRAFT | Ready for refinement | REFINEMENT | QA Lead | Bug needs triage |
| REFINEMENT | Refined | TO DO | QA Lead | Triage complete, ready for dev |
| TO DO | Take to development | IN PROGRESS | Developer | Dev picks up the bug |
| IN PROGRESS | Go to review | IN REVIEW | Developer | PR submitted for code review |
| IN REVIEW | Ready to test | READY FOR TEST | Developer / Reviewer | Code review approved, deployed |
| IN REVIEW | Request changes | REOPEN | Reviewer | Code review rejected |
| READY FOR TEST | On QA | TESTING | **QA** | QA starts testing the fix |
| READY FOR TEST | go to inprogress | IN PROGRESS | QA / Dev | Fix not actually deployed or wrong build |
| TESTING | Finish test | TESTED | **QA** | All verification checks pass |
| TESTING | *(Need fixes)* | REOPEN | **QA** | Verification fails |
| TESTED | Verify by BA/PO | VERIFY BY BA/PO | **QA** | Business verification needed |
| TESTED | Move to Done | DONE | **QA** | Simple bug, no BA/PO verification needed |
| TESTED | need to recheck | REOPEN | **QA** | Issues found post-testing |
| VERIFY BY BA/PO | Move to Done | DONE | BA/PO | Business verification passed |
| REOPEN | take to development | IN PROGRESS | Developer | Dev picks up reopened bug |
| REOPEN | go to todo | TO DO | QA Lead | Reassign to different developer |
| REOPEN | go to inprogress | IN PROGRESS | Developer | Same dev continues |
| REOPEN | Need hotfix | WAIT HOTFIXES | QA Lead / Dev Lead | Critical bug needs hotfix |
| WAIT HOTFIXES | Hotfix released | HOTFIX READY | Dev / CI | Hotfix build published |
| HOTFIX READY | check hotfix | TESTING ON STABLE | **QA** | QA tests hotfix on stable |
| TESTING ON STABLE | *(pass/fail)* | DONE / CANCELLED | **QA** | Hotfix verified or rejected |
| **Any** | Cancelled | CANCELLED | QA Lead / PM | Bug invalid, duplicate, or won't fix |
| **Any** | On hold | ON HOLD | Anyone | Bug blocked or deferred |

---

## 3. QA-Owned Transitions — Detailed Guide

QA directly controls these 5 transitions. Each requires a JIRA comment and evidence.

### 3.1 Ready for Test → TESTING (On QA)

**Precondition:** Fix deployed to test environment, build version matches PR.
**Required comment:**
```
Starting QA verification.
Build: [version/commit]
Environment: [URL]
Test scope: [STR + regression checks]
```

### 3.2 TESTING → TESTED (Finish test)

**Precondition:** Original STR passes 3 consecutive times, no regressions found.
**Required comment:**
```
QA PASSED — Fix verified.
STR: Passed 3/3 runs
Regression: [X adjacent checks] — all passed
Console: No new errors
Evidence: [screenshot/HAR path]
```

### 3.3 TESTING → REOPEN (Need fixes)

**Precondition:** STR still fails OR new issue introduced by fix.
**Required comment:**
```
QA FAILED — Reopening.
Issue: [what still fails or what new issue was found]
STR: [updated steps if different from original]
Evidence: [screenshot/HAR path]
Build: [version/commit tested]
```

### 3.4 TESTED → DONE (Move to done)

**Precondition:** Fix verified, no BA/PO verification needed.
**Required comment:**
```
Bug verified fixed. Moving to Done.
Verified in: [environment URL]
Build: [version/commit]
```

### 3.5 TESTED → REOPEN (need to recheck)

**Precondition:** Post-testing review reveals missed scenario or regression.
**Required comment:**
```
Reopening — additional issue found during post-testing review.
Issue: [description]
This was NOT caught during initial verification because: [reason]
Evidence: [screenshot/HAR path]
```

---

## 4. Defect Triage Process

Six-step workflow for triaging incoming bugs:

### Step 1: Validate Report Completeness
Use the 12-item checklist (section 5 below). If score < 10/12, send back to reporter with specific items to complete.

### Step 2: Check for Duplicates
Run JQL search before creating or refining any bug:
```
project = VCST AND issuetype = Bug AND status != Cancelled
AND (summary ~ "keyword1" OR summary ~ "keyword2")
ORDER BY created DESC
```
If duplicate found: link to existing ticket, add comment with new reproduction info, set current ticket to CANCELLED.

### Step 3: Classify Defect Type
Use the taxonomy in section 6. Set the `Labels` field accordingly (e.g., `functional`, `security`, `performance`).

### Step 4: Assess Severity + Priority
Reference `/qa-risk` skill's `risk-prioritization-framework.md` for definitions.
- **Severity** = technical impact (Critical > High > Medium > Low)
- **Priority** = business urgency (P0 > P1 > P2 > P3)
- These are **independent** — a Critical/P3 is valid (severe but not urgent), as is a Low/P0 (cosmetic but blocking a release).

### Step 5: Route to Owner

| Bug Domain | Assign To | Indicators |
|-----------|----------|------------|
| Storefront UI, checkout, cart, mobile | qa-frontend-expert | Page/flow bugs, CSS issues, responsive failures |
| Platform API, GraphQL, Admin SPA, modules | qa-backend-expert | API errors (4xx/5xx), data integrity, background jobs |
| Storybook components, accessibility, design system | ui-ux-expert | Component rendering, WCAG violations, design drift |
| Cross-module, workflow spanning frontend+backend | qa-lead-orchestrator | Payment flows, BOPIS end-to-end, multi-org |
| Security vulnerabilities | qa-lead-orchestrator | XSS, CSRF, auth bypass, injection — always escalate |

### Step 6: Set JIRA Fields + Transition
Set: Summary, Description (with STR), Severity, Priority, Labels, Component, Assignee.
Transition: DRAFT → REFINEMENT (Ready for refinement) → TO DO (Refined).

---

## 5. Bug Report Validation Checklist

Score each item pass/fail. Minimum **10/12** to proceed with triage.

| # | Item | Pass/Fail |
|---|------|-----------|
| 1 | **STR present** — numbered, deterministic steps (not vague descriptions) | |
| 2 | **Expected vs Actual** — both explicitly stated, not just "it's broken" | |
| 3 | **Environment specified** — URL + browser + version + date | |
| 4 | **Evidence attached** — at minimum 1 screenshot; HAR/console preferred | |
| 5 | **Reproduction rate** — stated (100%, intermittent, specific conditions) | |
| 6 | **Severity set** — Critical/High/Medium/Low with justification | |
| 7 | **Priority set** — P0/P1/P2/P3 (independent from severity) | |
| 8 | **Labels applied** — at least domain label (frontend/backend/security/etc.) | |
| 9 | **Component set** — which module or feature area | |
| 10 | **No duplicate exists** — JQL search performed, no match found | |
| 11 | **Root cause hypothesis** — if known, noted; "unknown" is acceptable | |
| 12 | **Impact scope** — who is affected (all users, specific role, specific browser, etc.) | |

**If score < 10:** Return to reporter with specific missing items. Do not triage incomplete reports.

---

## 6. Defect Classification

### Type Taxonomy (8 types)

| Type | Description | VC Example |
|------|------------|------------|
| **Functional** | Feature doesn't work as specified | Checkout flow skips payment step |
| **UI/Visual** | Layout, styling, rendering issues | Button overlaps on mobile viewport |
| **Performance** | Slow response, memory leaks, resource waste | Catalog page LCP > 4s with 100+ products |
| **Security** | Vulnerability enabling unauthorized access or data exposure | XSS via organization name field |
| **Accessibility** | WCAG 2.1 AA violation | Missing aria-label on search input |
| **Data/Integration** | Data corruption, sync failures, API contract mismatch | Price discrepancy between GraphQL and REST API |
| **Configuration** | Settings, permissions, environment-specific issues | Store currency not applying to new products |
| **Regression** | Previously working feature broken by recent change | Saved-for-later returns 403 after auth module update |

### Root Cause Categories (6 categories)

| Category | Description | VC Example |
|----------|------------|------------|
| **Code logic error** | Incorrect algorithm, wrong condition, off-by-one | BOPIS pagination skips locations beyond first 50 |
| **Missing validation** | Input not validated, edge case not handled | CatalogVideo description truncation causes HTTP 500 |
| **Race condition/timing** | Concurrent operations, async timing issues | Duplicate cart requests when double-clicking add-to-cart |
| **Environment/config** | Wrong setting, missing env var, config drift | Skyflow payment fails only on QA (wrong merchant ID) |
| **Data migration/sync** | Stale data, index lag, migration incomplete | Search returns deleted products (ES index not refreshed) |
| **Third-party dependency** | External service change, library update side effect | CyberSource API response format changed after update |

---

## 7. Fix Verification Protocol

Four-step process for verifying a bug fix. All steps must pass.

### Step 1: Confirm Deployment
- Verify the fix is deployed to the test environment
- Check build version matches the PR/commit that contains the fix
- If environment uses cache: clear cache or wait for invalidation

### Step 2: Execute Original STR
- Run the exact steps from the bug report verbatim
- Must pass **3 consecutive times** (catches intermittent issues)
- If STR was updated in the bug ticket, use the latest version
- Record evidence: screenshot at the previously-failing step

### Step 3: Adjacent Regression Checks
Run 2-3 related checks in the same feature area:

| Bug Domain | Adjacent Checks |
|-----------|----------------|
| Checkout | Payment processing, order confirmation, cart persistence |
| Catalog | Search results, filter application, product detail page |
| Cart | Quantity update, saved-for-later, pickup/delivery toggle |
| Payment | Different payment methods, refund flow, order history |
| Auth | Login, logout, password reset, session persistence |
| BOPIS | Map loading, location selection, filter application |
| Admin API | Related CRUD endpoints, permissions, background jobs |

### Step 4: Side Effect Check
- Open browser DevTools console — **no new errors** introduced
- Check network tab — **no new failed requests** (4xx/5xx)
- Quick visual scan — **no layout shifts or visual regressions** on the affected page

### Decision Matrix

| STR Result | Regression | Side Effects | Decision | JIRA Transition |
|-----------|-----------|-------------|----------|----------------|
| Pass 3/3 | All pass | None | **VERIFIED** | TESTED → DONE |
| Pass 3/3 | All pass | None | **VERIFIED (BA/PO)** | TESTED → VERIFY BY BA/PO |
| Pass 3/3 | 1+ fail | — | **REOPEN** | TESTED → REOPEN (new regression) |
| Fail any | — | — | **REOPEN** | TESTED → REOPEN (fix incomplete) |
| Pass 2/3 | — | — | **REOPEN** | TESTED → REOPEN (intermittent) |

---

## 8. Defect Metrics

Six process-health metrics. These are distinct from test execution metrics in `/qa-metrics` — these measure the defect pipeline, not test pass rates.

### 8.1 Defect Aging (days open)

**Formula:** `today - created_date` for each open bug
**Targets:**

| Priority | Max Aging | Escalation |
|----------|----------|-----------|
| P0 | < 1 day | Escalate immediately if > 2 hours |
| P1 | < 5 days | Escalate if > 1 sprint |
| P2 | < 1 sprint | Review if > 2 sprints |
| P3 | No hard limit | Review quarterly |

**JQL:** `project = VCST AND issuetype = Bug AND status NOT IN (Done, Cancelled) ORDER BY priority ASC, created ASC`

### 8.2 Mean Time to Resolve (MTTR)

**Formula:** `average(resolved_date - created_date)` for closed bugs in the period
**Target:** Trending downward sprint-over-sprint
**Segment by:** Priority (P0 MTTR should be < 1 day), Component, Severity

### 8.3 Reopen Rate

**Formula:** `bugs_reopened / total_bugs_closed × 100` in the period
**Target:** < 10%
**High reopen rate indicates:** Incomplete fixes, insufficient code review, or verification gaps
**JQL for reopened:** `project = VCST AND issuetype = Bug AND status CHANGED TO "Reopen"`

### 8.4 Defect Escape Rate

**Formula:** `production_bugs / total_bugs_found × 100` in the period
**Target:** < 5%
**Measures:** QA effectiveness at catching bugs before release
**High escape rate indicates:** Insufficient test coverage, missing edge cases, or environment parity issues

### 8.5 Defect Density

**Formula:** `bugs_found / feature_area` (per module, per sprint, per release)
**Purpose:** Identifies hot spots — modules with disproportionate bug counts
**Use for:** Risk-based test prioritization (high-density modules get more testing)

### 8.6 Fix Verification Pass Rate

**Formula:** `first_time_verification_pass / total_verifications × 100`
**Target:** > 85%
**Low pass rate indicates:** Developers not testing fixes locally, or STR not clear enough

---

## 9. Escalation Rules

### When to Escalate

| Condition | Escalation Path | Action |
|-----------|----------------|--------|
| P0 bug not picked up within 2 hours | QA Lead → Tech Lead | Direct message + JIRA comment |
| P1 bug not assigned within 1 business day | QA Lead → Tech Lead | Sprint standup flag |
| Bug reopened 3+ times | QA Lead → Tech Lead → PO | Root cause review meeting |
| Severity/Priority dispute | QA Lead ↔ PO | Alignment meeting, PO has final call on priority |
| Cross-module bug with no clear owner | QA Lead → Tech Lead | Architecture discussion to determine ownership |
| Security vulnerability (any severity) | QA Lead → Security Lead → CTO | Immediate triage, may require embargo |
| Production bug affecting revenue flows | QA Lead → PO → CTO | Hotfix branch, all-hands on deck |

### Escalation Path
```
QA Tester → QA Lead (qa-lead-orchestrator)
         → Tech Lead (for development assignment)
         → Product Owner (for priority disputes)
         → CTO/Security Lead (for security/production issues)
```
