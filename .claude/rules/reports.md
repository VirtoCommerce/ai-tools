# Reports — Single Source of Truth

**This file is the only place the report policy lives.** All other files (`shared-instructions.md`, `evidence-capture-policy.md`, skill SKILLs, agent definitions) point here. Reports are read by humans on a deadline — long reports get skimmed and bugs get missed. Long-form reasoning, investigation logs, and progress updates belong in SendMessage to the orchestrator, never on disk.

## 1. Only Four Report Categories Allowed

| # | Category | Path | When |
|---|----------|------|------|
| 1 | Bug report | `reports/bugs/` | A confirmed defect with reproducible STR |
| 2 | Test cases | `regression/suites/` (CSV) | Adding/updating test coverage |
| 3 | BA report | `reports/ba/` | `/ba-analyze` deliverables |
| 4 | Regression summary | `reports/regression/REG-*/` | One consolidated report per run |

**Do NOT create files for:** per-suite intermediate JSON, coverage working files, standalone screenshot dumps, progress/status markdown, debug logs, investigation notes, per-step screenshots, side-by-side comparisons against prior runs, or anything labeled "draft"/"WIP"/"context". Return those via SendMessage. Evidence screenshots go **inline** in the bug report (not as separate `.md`).

## 2. Hard Size Caps (lines)

| Report type | Target | Hard cap |
|-------------|--------|----------|
| Clean regression (no failures) | **5–15** | 30 |
| Regression with failures | 40 + 15/failure | 200 |
| Simple UI/copy bug | **30–50** | 80 |
| Functional bug | 50–80 | 120 |
| Cross-layer bug | 80–120 | 150 |
| BA report | 80–150 | 250 (exec summary ≤5 sentences; diagram OR prose, not both) |

Over the hard cap is a review failure — trim before merge. If content genuinely doesn't fit, split it: keep the bug at <150 lines and link a separate investigation file.

## 3. Required Sections (everything else is optional)

**Bug report:** Title + severity tag · Env (1 line: env name + build) · Summary (≤3 sentences) · STR (numbered, start from nearest relevant state) · Expected vs Actual · 1–2 inline screenshots · optional BL/ECL refs, root cause.

**Regression summary:** Run ID/date/env/browser/selection · Counts table · Failures section (TC-ID, expected, actual, evidence ref, bug link) · Passes as one comma-separated line · Bugs Found (links only) · Quality Gate verdict.

**BA report:** Title + scope + env · Executive summary (≤5 sentences) · One of: architecture diagram OR prose · Findings table (issue, severity, recommendation) · Open questions/follow-ups.

## 4. Cut These Bloat Patterns

Real examples from recent reports (BUG-IMP-049 at 315 lines vs 150 target; BA-VCST-4642 at 237):

| Pattern | Fix |
|---------|-----|
| Build/env table with 6+ rows | One line: `Env: vcst-qa @ Platform 3.1026.0, Theme 2.49.0-pr-2280` |
| Mermaid diagram + paragraph saying the same thing | Pick one |
| Executive summary > 5 sentences | ≤5 sentences, lead with the finding |
| Full API JSON response (50+ lines) | Quote the 2–3 fields that matter |
| 5+ screenshots for one bug | 1 bug state + 1 context max |
| STR starting from "Open homepage" for a checkout bug | Start from `/cart` with seeded data |
| Investigation log inside the bug report | Drop it; root cause in 2 sentences |
| "Comparison vs previous run" table | One sentence: "Same blocker as REG-X, different root cause." |
| Layer-validation table that restates the Summary | Delete the table |
| Glossary / "context" / "background" sections | Delete |
| Duplicate operator/credentials table | Reference the alias: "Operator: `@td(SUPPORT_AGENT)`" |

## 5. Screenshot Rules

**Always capture:** test FAILs, confirmed bugs (annotated), visual regressions (before/after), final state of critical flows (checkout confirmation, order created), Figma deviations, error states (console error, 500 toast).

**Skip:** every navigation step in a passing test, loading spinners, login page (unless testing auth), successful form fills mid-flow, same page across browsers when all pass, redundant confirmations of the same bug.

**Per-scope budget:**

| Scope | Target | Max |
|-------|--------|-----|
| Test case (pass) | 0–1 (final state if critical) | 2 |
| Test case (fail) | 1–3 | 4 |
| Bug report | 1–3 | 5 |
| Regression suite (20+ tests) | failures + 1 summary per area | 15–20 |
| Exploratory session | anomalies only | 10 |

**Retention:** Regression/test-lifecycle/coverage screenshots under `reports/regression/REG-*/`, `reports/test-lifecycle/TLC-*/`, `reports/coverage/COV-*/` are gitignored — disposable artifacts referenced from the permanent markdown. Bug evidence (`reports/bugs/screenshots/`) and per-ticket evidence (`tests/SprintXX-XX/VCST-XXXX/screenshots/`, `reports/tickets/VCST-XXXX/screenshots/`) stay tracked.

## 6. Console & Network Evidence

**Console — capture:** specific error messages tied to the test/bug. **Skip:** full console dumps, benign Vue warnings, favicon 404s, analytics events.
Example good: `Console Error: "Unhandled promise rejection: TypeError: Cannot read property 'price' of undefined at ProductCard.vue:47"`

**Network — capture:** 4xx/5xx, requests with `errors[]` in response, requests >2s. **Skip:** every successful 200, full HAR contents.
Format: `Failed: POST /graphql (SearchProducts) → 500 Internal Server Error`

**HAR files:** captured automatically by browser config, stored in `test-results/{browser}/har/` (gitignored). Reference by filename — never inline the data.

## 7. Naming Conventions

```
Screenshots:
  {TC-ID}-FAIL-{description}.png      → TC-004-FAIL-cart-total-wrong.png
  {TC-ID}-{description}.png           → TC-001-checkout-confirmation.png
  BUG-{short-name}-{detail}.png       → BUG-price-display-configurable.png
  {component}-{state}-{viewport}.png  → product-card-hover-mobile.png

Reports:
  Bug:           BUG-{Short-Description}.md
  Execution:     test-execution-report.md  (inside ticket folder)
  Regression:    {suite-name}-report.md  or  regression-YYYY-MM-DD.md
  Investigation: {topic}-investigation-YYYY-MM-DD.md  (separate from bug)
```

## 8. Reference, Don't Inline

| Artifact | Lives at | Cite as |
|----------|----------|---------|
| HAR files | `test-results/{browser}/har/` | "HAR: `checkout-2026-05-21.har`" |
| Full screenshot set | `reports/bugs/screenshots/` | Link 1–2 inline; reference the folder |
| Test data | `test-data/aliases.json` | `@td(ALIAS.field)` — don't paste rows |
| BL/ECL invariants | `.claude/agents/knowledge/business-logic.md` | Cite the ID (`BL-AUTH-005`), not the body |
| Prior runs | `reports/regression/REG-*` | Link by run ID, don't recap |
