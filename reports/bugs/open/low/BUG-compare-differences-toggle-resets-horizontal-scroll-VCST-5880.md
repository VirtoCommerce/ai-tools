# Compare — switching All ↔ Differences resets the table's horizontal scroll to 0 (Chromium) — P3

## Status: OBSERVED, reproduction conditions being characterised
**Found by:** agent — testing VCST-5880 (4a lane) · **IN-SCOPE** (vc-frontend PR #2518) · **Archetype:** `RENDER`
**Severity:** Low/P3 · **BELOW the 5-file severity floor — not filed**, named in the VCST-5880 QA comment

**Env:** PR build `2.60.0-pr-2518-ee98-ee98adbd` (local nginx, API → vcst-qa) vs baseline `2.60.0-pr-2511`. Chromium, 800×900, 4–5 Group-A products.

## What was seen
- 4a (Chromium): scrolled sideways to 273/273, clicked Differences → thead/tbody **0/0**. The baseline kept the position (160/160).
- Gecko (5t) kept the position on the PR build.
- The evidence recapture **did not reproduce it** on Chromium: 201/201 was kept when the table was scrolled by clicking a body cell plus ArrowRight. So the trigger likely depends on the scroll method (wheel or drag vs keyboard), or on which control holds focus.

## Likely mechanism (classifier, MEDIUM confidence)
- PR #2518 moved the All/Differences `VcTabSwitch` into `td.compare-table__controls` (`sticky start-0 w-60`), inside `thead.compare-table__header-row` (`overflow-x-auto scroll-ps-60`).
- Focusing a control in that corner lets Blink's scroll-into-view clamp the thead to 0, and `useHorizontalScrollSync` copies 0 to the tbody.

## Why Low
Header and body stay in step, so no value appears under the wrong product. The user only loses their sideways position.

**Fix direction (PR review feedback):** scope the scroll padding to the product controls (scroll-margin on `.compare-table__product` descendants), or give the corner's focusables a negative `scroll-margin-inline-start`.

Evidence: `reports/tickets/Sprint26-20/VCST-5880/screenshots/inv-c33-*`, `ev-pr-800-*-differences.png`; the checklist row 33.
