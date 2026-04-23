# Evidence Capture & Report Verbosity Policy

> Shared reference for all QA agents. Read before any test execution session.
> Goal: Capture what proves bugs and key states. Skip what just proves you clicked buttons.

---

## 1. Screenshot Capture Rules

### ALWAYS Capture (mandatory)

| When | What | Naming |
|------|------|--------|
| Test case FAILS | The failure state — what's wrong on screen | `{TC-ID}-FAIL-{description}.png` |
| Bug found | The bug — annotate or crop to the issue | `BUG-{name}-evidence.png` |
| Visual regression | Before/after comparison (if baseline exists) | `{component}-{state}-{viewport}.png` |
| Final state of critical flow | Checkout confirmation, order created, payment success | `{flow}-final-state.png` |
| Design comparison | Side-by-side with Figma when deviations found | `{component}-figma-vs-actual.png` |
| Error state | Console error panel, network 500, error toast/modal | `{TC-ID}-error-{type}.png` |

### SKIP Capturing (noise)

| Skip This | Why |
|-----------|-----|
| Every navigation step in a passing test | Adds 5-10 screenshots per test with zero signal |
| Loading spinners / skeleton screens | Transient states, not bugs |
| Login page (unless testing auth) | Same every time, proves nothing |
| Successful form fills mid-flow | The final state captures success |
| Same page in multiple browsers (if all pass) | Only screenshot cross-browser when there's a DIFFERENCE |
| Redundant confirmation of same bug | 1-2 screenshots per bug is enough, not 5 |

### Budget Per Test Scope

| Scope | Screenshot Target | Max |
|-------|------------------|-----|
| Single test case (pass) | 0-1 (final state only if critical flow) | 2 |
| Single test case (fail) | 1-3 (failure + context) | 4 |
| Bug report | 1-3 (bug state + reproduction evidence) | 5 |
| Full regression suite (20+ tests) | Failures + 1 summary per area | 15-20 |
| Exploratory session | Anomalies only | 10 |

### Retention

- Regression, test-lifecycle, and coverage run screenshots (under `reports/regression/REG-*/`, `reports/test-lifecycle/TLC-*/`, `reports/coverage/COV-*/`) are **gitignored** — treat them as ephemeral raw artifacts. The markdown report is the permanent record; PNGs referenced from it are disposable.
- Bug evidence (`reports/bugs/screenshots/`, `reports/bugs/api-traces/`) and per-ticket evidence (`tests/SprintXX-XX/VCST-XXXX/screenshots/`, `reports/tickets/VCST-XXXX/screenshots/`) remain tracked — they are long-lived reference material linked from JIRA.
- Budgets (table above) are enforced at review, not at write time — reviewers reject reports that exceed the per-scope max.

---

## 2. Console & Network Evidence Rules

### Console Logs

**Capture:** Specific error messages that relate to the test or bug being investigated.
**Skip:** Full console dumps. Agents should filter by `error` and quote only the relevant lines.

**Good example:**
```
Console Error: "Unhandled promise rejection: TypeError: Cannot read property 'price' of undefined at ProductCard.vue:47"
```

**Bad example:**
```
[paste of 200 console lines including benign Vue warnings, favicon 404, analytics events]
```

### Network Requests

**Capture:** Failed requests (4xx, 5xx), requests with `errors[]` in response body, requests >2s.
**Skip:** Listing every successful 200 request. Don't dump full HAR contents into reports.

**In reports, format as:**
```
Failed: POST /graphql (SearchProducts) → 500 Internal Server Error
Failed: GET /api/pricing/pricelists → 403 Forbidden
Slow: POST /graphql (GetCart) → 200 OK (3.2s)
```

### HAR Files

- Capture HAR for regression suites (automated, always-on in browser config)
- Store in `test-results/{browser}/har/` (gitignored — raw artifacts only)
- Reference HAR in reports by filename, don't inline the data
- HAR is for post-mortem analysis, not for report content

---

## 3. Report Verbosity Tiers

### Tier 1: Compact Report (DEFAULT for regression & smoke)

Use for: Regression suites, smoke tests, pass-heavy results.

**Rule: Detail failures. Summarize passes.**

```markdown
# [Suite Name] — Test Execution Report

**Date:** [Date] | **Env:** [URL] | **Browser:** [Browser]
**Results:** [X] passed, [X] failed, [X] blocked / [X] total — **[X%] pass rate**

## Failures
### TC-XXX: [Test Name] — FAIL
**Steps:** [only the steps that diverge from expected]
**Expected:** [what should happen]
**Actual:** [what happened]
**Evidence:** `screenshots/TC-XXX-FAIL-description.png`
**Bug:** BUG-XXX filed

## Passing Tests
TC-001, TC-002, TC-003, TC-004, TC-005 — all passed.

## Observations
- [Only items that need attention — anomalies, slow responses, minor UX concerns]
```

**What this eliminates:** Per-test "Steps tested / Findings / Screenshots" blocks for passing tests. A 20-test suite where 18 pass should NOT be 500+ lines. Target: **~50-100 lines** for a clean suite, **+30-50 lines per failure**.

### Tier 2: Detailed Report (for investigation & bug reproduction)

Use for: Bug investigation reports, complex failures, new feature deep-dive.

Includes full reproduction steps, API request/response bodies, root cause analysis, cross-layer traces. These reports can be longer (150-300 lines) because they document something that's broken.

### Tier 3: Sign-Off Only (for passing suites with no issues)

Use for: Re-test after fix, confirmation runs, clean smoke.

```markdown
# [Suite Name] — PASS

**Date:** [Date] | **Env:** [URL] | **Browser:** [Browser]
**Results:** [X/X] passed — **100% pass rate**
**Decision:** APPROVED
No failures, no bugs, no observations.
```

**Total: 5 lines.** Don't write 300 lines to say "everything works."

---

## 4. Bug Report Verbosity

Target: **under 150 lines** per bug report.

### Avoid These Bloat Patterns

| Pattern | Why It's Wasteful | Do This Instead |
|---------|------------------|-----------------|
| Full API response body (50+ lines of JSON) | Only 2-3 fields matter for the bug | Quote only the relevant fields/error |
| 5+ screenshots for one bug | 1-2 prove the bug, rest are noise | Keep 1 bug state + 1 context screenshot |
| Listing every step from homepage to bug | Reader needs reproduction, not a travelogue | Start STR from the nearest relevant state |
| "Investigation log" in the bug report | Merge investigation into concise root cause | Separate investigation reports if needed |
| Duplicate bug reports for same root cause | Skyflow had 4 separate reports | One bug report + reference in related tickets |

### Bug Report Size Guide

| Bug Complexity | Target Lines | Sections |
|----------------|-------------|----------|
| Simple UI bug | 40-60 | Summary, STR, Expected/Actual, 1 screenshot |
| Functional bug | 60-100 | + Root cause, affected area, test data |
| Complex cross-layer bug | 100-150 | + API traces, cross-layer analysis |
| Investigation report (separate file) | 150-300 | Full deep-dive, only if root cause is complex |

---

## 5. Naming Conventions

### Screenshots
```
{TC-ID}-FAIL-{description}.png          → TC-004-FAIL-cart-total-wrong.png
{TC-ID}-{description}.png               → TC-001-checkout-confirmation.png
BUG-{short-name}-{detail}.png           → BUG-price-display-configurable.png
{component}-{state}-{viewport}.png      → product-card-hover-mobile.png
```

### Reports
```
Bug reports:     BUG-{Short-Description}.md
Execution:       test-execution-report.md  (inside ticket folder)
Regression:      {suite-name}-report.md  or  regression-YYYY-MM-DD.md
Investigation:   {topic}-investigation-YYYY-MM-DD.md  (separate from bug report)
```

---

## Quick Decision: Should I Capture This?

```
Is the test FAILING or is there a BUG?
  → YES: Capture screenshot, console error, failed network request
  → NO: Is this the FINAL STATE of a critical flow?
    → YES: Capture one screenshot
    → NO: Skip it
```

For console/network:
```
Is there an ERROR (4xx, 5xx, JS exception)?
  → YES: Quote the specific error line
  → NO: Don't mention it in the report
```
