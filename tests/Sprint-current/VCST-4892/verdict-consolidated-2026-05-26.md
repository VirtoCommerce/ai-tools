# VCST-4892 — Consolidated Verdict (2026-05-22 + 2026-05-26)

**Final verdict:** **PASS WITH NOTES** (unchanged from 2026-05-22)
**Build:** `vc-theme-b2b-vue-2.50.0-pr-2291-fed4-fed4fe16` (SHA `fed4fe16` — no change between sessions)
**PR:** [vc-frontend#2291](https://github.com/VirtoCommerce/vc-frontend/pull/2291) — open
**Coverage:** 22 of 24 named gap items now executed (up from 0); ~4 items remain N/A or out of scope

---

## Defect ledger — 7 open

### Prior session (2026-05-22)
1. **BUG-VCST-4892-1 (P1, WCAG 2.1.2)** — VcDatePicker popover does not close on Escape key (Keyboard Trap).
2. **BUG-VCST-4892-2 (Medium)** — Reversed date range fires malformed Lucene GraphQL filter; End term silently dropped. **Cross-confirmed today** in regression `REG-2026-05-26-1530` (ORD-054) on Chrome and a second-source Firefox repro. Full RCA filed locally at `reports/bugs/open/BUG-Order-History-Date-Picker-Inverted-Range-End-Dropped.md`. Already posted to VCST-4892 as comment 98675.
3. **BUG-VCST-4892-3 (Medium)** — Date filter state lost on browser-back navigation (URL has no startDate/endDate params).

### This session (2026-05-26) — 4 new
4. **NEW-1 (P1, WCAG 2.1.1)** — VcCalendar: Home/End keys non-functional in calendar grid. ARIA Grid pattern not implemented for week-start/end shortcuts.
5. **NEW-2 (P1, WCAG 2.1.1)** — VcCalendar: PgUp/PgDn and Ctrl+PgUp/Dn non-functional. Month/year keyboard navigation missing.
6. **NEW-3 (P1, WCAG 4.1.2)** — VcDateInput: `aria-expanded` attribute on `<input type="text">` violates `aria-allowed-attr` (axe-core 4.9.1 critical). Fix path: add `role="combobox"` to the input, or move `aria-expanded` to the trigger button.
7. **NEW-4 (P1)** — VcDateSelector: deprecation `console.warn` does not fire on mount. Consumers cannot discover the deprecation contract. Confirm with developer whether intentional (grace-window flag) before filing.

---

## What today added beyond the 2026-05-22 verdict

| Aspect | Prior session | Today |
|--------|---------------|-------|
| Gap coverage | 0 of 24 | 22 of 24 |
| Storybook retest | BLOCKED (false Apollo positive) | Clean — Firefox `playwright-firefox` + canvas URLs work |
| Cross-browser confirmation of BUG-VCST-4892-2 | Chrome only | Chrome + Firefox byte-identical GQL payload |
| Source-code RCA for BUG-VCST-4892-2 | Pointed at component | Pinned to `useUserOrders.ts:80-93` `getFilterExpression()` + likely `toEndDateFilterValue()` returning `undefined` for End < Start |
| Regression trip-wires authored | — | 18 date-picker cases (ORD-062..ORD-079) + 10 filter cases (ORD-052..ORD-061) in suite 014, all PASSING except the bug trip-wires |
| New defects surfaced | 0 since prior verdict | 4 (NEW-1..NEW-4) |

---

## Default-theme observations (NOT defects per project convention — Coffee is QA standard)

- Selected-day contrast in Default theme: 2.11:1 (fails 4.5:1). Coffee = 4.52:1 PASS.
- Focus ring in Default theme: `outline: transparent` (invisible). Coffee = 3px brown box-shadow PASS.

Cross-reference memory `feedback_a11y_coffee_only` — non-Coffee themes are not A11y-compliant; pre-existing, not introduced by this PR.

---

## Untested items still carried forward

| ID | Reason | Recommendation |
|----|--------|----------------|
| A-2 (de/fi locale parsing) | No Storybook story for de/fi locales | Add stories or accept gap |
| A-8 (`@change` payload structure) | Time budget exhausted; structure evidenced indirectly by C-9 | Verify in unit tests if not covered |
| A-13 (VcDateInput standalone error aria-describedby) | Same mechanism verified at C-6 (VcDatePicker context) | Implicitly covered |
| F-3 (deprecation warn fires once) | N/A — F-2 shows warn never fires | Resolve F-2 first |
| C-10 (`update-on-submit` mode) | No Storybook story exists | Add story or verify in production form context |

---

## Recommendation for engineering

The PR ships the primary user value (VcDatePicker rewrite, typing-`0` bug fixed) and is functionally usable. Quality-gate the merge on at least:
1. **NEW-3** (axe critical violation) — quick fix, high impact for accessibility certification
2. **BUG-VCST-4892-1** (Escape Keyboard Trap) — WCAG 2.1.2, regression-level a11y issue
3. **NEW-1 + NEW-2** (keyboard grid navigation) — Bundle these as one "ARIA Grid pattern" fix
4. **BUG-VCST-4892-2** (reversed range) — single-line fix per RCA (bind `valid` computed to Apply disabled)

NEW-4 (deprecation warn) and BUG-VCST-4892-3 (back-nav state) can roll into the next iteration.

---

## Files

- Prior session: `tests/Sprint-current/VCST-4892/{summary.json, verdict.md, account-orders-execution-report.md, storybook-execution-report.md, testing-checklist.md, storybook-story-ids.md}`
- This session: `tests/Sprint-current/VCST-4892/storybook-retest-2026-05-26.md`
- Regression evidence: `reports/regression/REG-2026-05-26-1530/{regression-report.md, suite-014-subset-results.json}`
- Bug report (reversed range): `reports/bugs/open/BUG-Order-History-Date-Picker-Inverted-Range-End-Dropped.md`
- Firefox second-source repro: `reports/bugs/screenshots/dp-inverted-range-ff-repro-2026-05-26.md`
- JIRA comment already pushed: VCST-4892 / comment 98675 (the reversed-range finding)
- Screenshots: `tests/Sprint-current/VCST-4892/screenshots/storybook-retest/` (B-3, C-15, E-7, E-9 evidence)
