# BUG-Order-History-Date-Picker — Inverted date range (Start > End) silently accepted; End boundary dropped from GraphQL filter

## Status: CONFIRMED

**Severity:** P1 — Defensive-validation gap with silent data loss; no user feedback
**Env:** vcst-qa @ Storefront `2.50.0-pr-2291-fed4-fed4fe16`
**Reported:** 2026-05-26 by ORD-054 regression in run `REG-2026-05-26-1530`
**Reproduced:** Chrome + Firefox (cross-browser, single build)

## Resolution
_(none yet — awaiting engineering fix and re-verification)_

---

## Summary

When a buyer enters a **Custom date range with Start > End** on `/account/orders` (e.g., Start = today, End = 30 days ago) in the Filters popover, the Apply button is enabled and the filter commits. The GraphQL `GetOrders` request is sent with **only the lower bound**: `createddate:["startISO" TO]` — the End value is silently dropped at apply-time. The filter chip displays "Start: ..." only; no End indicator, no error toast, no validation that would disable Apply. The buyer sees an empty result list (because no orders exist after today) with no explanation that their End date was ignored.

**Distinction from earlier closed bug:** This is **not** the previously-claimed "End dropped from *valid* Custom ranges" issue — that claim was a false positive from an automated exploration and was closed (see `reports/bugs/closed/BUG-Order-History-Date-Picker-End-Dropped-CANNOT-REPRODUCE.md`). Valid ranges (Start ≤ End) correctly send both bounds — confirmed today on both Chrome (ORD-062 regression) and Firefox (manual repro). Only **inverted** ranges trigger the End-drop. Different scenario, different code path.

---

## Steps to Reproduce

Starting state: signed in as `{{USER_EMAIL}}` on `/account/orders`; orders list rendered.

1. Click the `Filters` button at the top of the orders list → Filters popover opens.
2. Confirm the `Created date` combobox shows `Custom date` (default).
3. Type into `aria-label="Start date"` → `05/26/2026` (today, or any current/future date).
4. Type into `aria-label="End date"` → `04/26/2026` (deliberately earlier than Start — inverted range).
5. Observe: `Apply` button is **enabled** despite the inverted range.
6. (Firefox only) Observe the inline validation hint under the End input: *"Date must be on or after 2026-05-26"* — present, but not wired to Apply.
7. Click `Apply`.
8. Inspect the `POST /graphql` request for operation `GetOrders` in DevTools Network tab.

---

## Expected vs Actual

**Expected** — one of three defensive behaviors:
- (a) Apply button stays disabled when Start > End, OR
- (b) Apply triggers an inline error / toast clearly stating the range is invalid and no GQL fires, OR
- (c) The UI auto-swaps Start and End and sends a valid closed range to the backend.

Per the existing inline-validation message on Firefox ("Date must be on or after ..."), option (a) or (b) is likely the intended product behavior — the validator exists but isn't gating the submit.

**Actual** — the inverted range commits silently:
```
createddate:["2026-05-25T22:00:00.000Z" TO]
```
- End value is dropped from the request payload entirely (open-ended range, no upper bound).
- Filter chip shows "Start: 5/26/2026" only — no End chip, no warning.
- Result list: 0 rows (because no orders dated after 05/26/2026 exist).
- No error toast, no console error, no network error. HTTP 200.
- On Firefox: an inline validation hint appears under End input but does **not** disable Apply.

---

## Evidence

- **Chrome capture (ORD-054 regression):** `reports/regression/REG-2026-05-26-1530/screenshots/ORD-054-FAIL-inverted-range-end-dropped.png`
- **Firefox capture (second-source repro):** `reports/regression/REG-2026-05-26-1530/screenshots/ORD-054-FF-typed-inverted.png`, `ORD-054-FF-after-apply.png`
- **GQL payload (Chrome):** `filter: "createddate:[\"2026-05-25T22:00:00.000Z\" TO]"` — End dropped
- **GQL payload (Firefox):** `filter: "createddate:[\"2026-05-25T22:00:00.000Z\" TO]"` — byte-identical to Chrome
- **Repro report (Firefox second-source):** `reports/bugs/screenshots/dp-inverted-range-ff-repro-2026-05-26.md`
- **Regression report (Chrome):** `reports/regression/REG-2026-05-26-1530/regression-report.md`
- **Console / Network errors:** None on either browser. Silent failure.

---

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | Validator exists (Firefox inline message) but does not gate Apply. End value is dropped before payload assembly. |
| 2. Backend Admin | N/A | Bug is in the storefront component; admin not exercised. |
| 3. GraphQL xAPI | PASS | Server correctly handles whatever payload arrives — when only `[startISO TO]` is sent, it returns all orders after that date, which is the formally-correct behavior for an open-ended range query. The defect is that the frontend should never send an open-ended range when the user typed an explicit End. |
| 4. Platform REST API | N/A | Not exercised by storefront orders flow. |

**Owning layer:** **Storefront Frontend (`vc-frontend`).** Defensive-validation gap at the Apply-button gating level plus a silent-drop side effect in the filter-payload builder.

---

## Module Versions

- **Storefront theme:** `2.50.0-pr-2291-fed4-fed4fe16` (footer)
- **Affected repo:** `VirtoCommerce/vc-frontend`
- **Affected files** (from source-code research earlier today):
  - `client-app/shared/account/composables/useUserOrders.ts:80-93` — `getFilterExpression()` builds the Lucene `createddate:[…]` string. The code conditionally appends `endDateFilterValue` only if truthy:
    ```ts
    const startDateFilterValue = toStartDateFilterValue(filterData.startDate);
    const endDateFilterValue = toEndDateFilterValue(filterData.endDate);
    if (startDateFilterValue || endDateFilterValue) {
      let createdDateFilterValue = "";
      if (startDateFilterValue) createdDateFilterValue += `"${startDateFilterValue}" `;
      createdDateFilterValue += "TO";
      if (endDateFilterValue) createdDateFilterValue += ` "${endDateFilterValue}"`;
      filterExpression += `createddate:[${createdDateFilterValue}]`;
    }
    ```
  - `client-app/shared/account/components/date-filter-select.vue` — emits `change` per VcDateSelector update
  - `client-app/shared/account/composables/useUserOrdersFilter.ts` — manages applied vs draft filter state

---

## Root Cause Analysis

Two compounding issues:

**1. `toEndDateFilterValue(filterData.endDate)` likely returns `undefined` when `endDate` is before `startDate`.** This is the silent-drop mechanism — the function appears to invalidate End rather than refuse the filter. The check `if (endDateFilterValue) createdDateFilterValue += \` "${endDateFilterValue}"\`` then skips the upper bound entirely. The buyer's typed End is reflected nowhere in the final query.

(The function body was not read in this investigation — recommend the engineer verify `toEndDateFilterValue` returns `undefined` for End < Start and re-think the contract: validation should be at the Apply gate, not silently inside the formatter.)

**2. The Apply button is dirty-state-gated, not validity-gated.** Firefox surfaces an inline error message under End ("Date must be on or after 2026-05-26"), which proves a validator exists somewhere — but that validator is not bound to Apply's `disabled` attribute. The buyer can submit any combination including invalid ones.

The Firefox-only inline message is itself a Chrome/Firefox inconsistency worth a separate UX note: Chrome shows no validation hint at all.

**Suggested fix paths** (for engineering — non-binding):
- Bind the existing Firefox-style validation to a Vue computed `applyDisabled`: `applyDisabled = startDate && endDate && new Date(endDate) < new Date(startDate)`.
- OR remove the silent-drop in `toEndDateFilterValue` and instead surface an inline error + keep Apply disabled.
- OR auto-swap Start/End on Apply if inverted (less preferable — violates principle of least surprise).
- Normalize validation across Chrome/Firefox so both surface the same inline hint.

---

## Affected Test Case (regression trip-wire)

- **ORD-054** (`Orders > Filtering`, High, BL-ORD-001, ECL-3.2) — "Order List - Date Range Filter Rejects Start Date After End Date" in `regression/suites/Frontend/orders/014-orders-frontend.csv`. Currently FAILing as designed; once fixed, the case should PASS on whichever defensive behavior the team chooses (validation error, Apply disabled, or auto-swap — the case Steps cover all three branches with `[COND:]` gates).

After the fix lands, update `Automation_Status` from `Generated` to `Automated` and re-run the case on both Chrome and Firefox to confirm.

---

## Impact

Any buyer who accidentally types Start > End (e.g., picks two dates in the wrong fields, types a typo, or doesn't realize the order convention) gets:
- A filter that visually claims to be applied (chip shown)
- A result list that appears to contain "no matching orders" — because the open-ended `[startISO TO]` returns orders *after* their Start, but Start was a recent/future date, so nothing matches
- No error message
- No guidance to fix the date order

For most users this is recoverable (they'll suspect their dates were wrong and retry), but it's a silent UX hole that erodes trust in the orders filter. The same defensive-validation gap could mask data-correctness issues if combined with other quirks (e.g., a user who legitimately wants "orders before 04/26 but mistakenly typed today's date in Start gets zero results instead of an obvious error).

---

## References

- Chrome regression: `reports/regression/REG-2026-05-26-1530/regression-report.md`
- Firefox second-source: `reports/bugs/screenshots/dp-inverted-range-ff-repro-2026-05-26.md`
- Closed false-positive bug (different scenario): `reports/bugs/closed/BUG-Order-History-Date-Picker-End-Dropped-CANNOT-REPRODUCE.md`
- Source files (vc-frontend `dev` branch): `useUserOrders.ts:80-93`, `date-filter-select.vue`, `useUserOrdersFilter.ts`
- Memory: `feedback_verify_payload_bugs_second_source` (confirmed protocol that prevented a previous false positive)
