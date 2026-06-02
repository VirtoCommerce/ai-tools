# BUG-Order-History-Date-Picker — Custom-Date End boundary silently dropped from GraphQL filter

## Status: CLOSED — Cannot Reproduce (false positive from exploration agent)

**Severity:** N/A (originally provisional P0 — refuted)
**Env:** vcst-qa @ Storefront `2.50.0-pr-2291-fed4-fed4fe16`
**Reported:** 2026-05-26 by automated date-picker exploration (run `COV-2026-05-26-1430`)
**Initial reproduction (refuted):** 3/3 claimed by exploration agent on `playwright-firefox` — finding was incorrect
**User manual attempt:** Could not reproduce (Firefox, did not capture network payload)
**Second-source manual repro (definitive):** 2026-05-26 by qa-testing-expert on Firefox, real-user protocol, both typed and calendar paths, GraphQL payload captured for each.

## Resolution
- **Outcome:** Bug refuted — the original "End-date dropped" claim is a **false positive** from the exploration agent.
- **Evidence:** Path A (typed 03/04 → 03/08) and Path B (calendar clicks Wed Mar 4 / Sun Mar 8) both produced byte-identical, correct GraphQL filter: `createddate:["2026-03-03T23:00:00.000Z" TO "2026-03-08T22:59:59.999Z"]`. Result list correctly excluded the newest order. Confidence HIGH.
- **Repro report:** `reports/bugs/screenshots/dp-repro-2026-05-26.md`
- **GQL payload captures:** `test-results/firefox/path-A-getorders-request.json`, `test-results/firefox/path-B-getorders-request.json`
- **Verified:** 2026-05-26
- **Verification method:** Real-user protocol on `playwright-firefox` (same browser as the original exploration).

## Process lesson
The exploration agent reported `createddate:["...Z" TO]` (no upper bound) three times. The second-source manual repro proves both bounds were actually being sent. Likely failure mode: the exploration agent read an unrelated/stale network entry, mis-quoted the filter string, or examined a transient pre-apply request. **Going forward:** any "network payload bug" finding from an automated exploration MUST be confirmed by a separate manual real-user repro with payload capture before being escalated to a bug report or JIRA. The original CONFIRMED status was premature.

---

### Below: original report kept for audit trail.

---

## Summary

When a buyer applies a **Custom date range** on `/account/orders` using both a Start and End date, only the Start date reaches the GraphQL `GetOrders` operation. The End boundary is silently dropped, producing an open-ended `createddate:["startISO" TO]` filter with no upper bound. All orders after the specified End date are returned, making the Custom-date filter functionally broken for any bounded range. Preset filters (`Last day` / `Last week` / `Last month` / `Last year`) are NOT affected — they correctly send both bounds.

A2 (related): Reopening the Filters panel after Apply shows the End input blank while Start is retained — confirming the End value is dropped at apply-time (component state), not only at serialization.

---

## Steps to Reproduce

Starting state: signed in as `{{USER_EMAIL}}` on `/account/orders`; account has orders spanning more than 30 days.

1. Click the `Filters` button — Filters popover opens.
2. Confirm the `Created date` combobox shows `Custom date` (default).
3. Fill `aria-label="Start date"` with `03/01/2026`.
4. Fill `aria-label="End date"` with `03/22/2026`.
5. Click `Apply`.
6. Inspect the `POST /graphql` request for operation `GetOrders` (DevTools Network tab).

---

## Expected vs Actual

**Expected** — request variable `filter` contains a **closed** range:
```
createddate:["2026-02-28T23:00:00.000Z" TO "2026-03-21T23:00:00.000Z"]
```
Orders dated after 03/22/2026 are excluded from the response.

**Actual** — request variable `filter` contains an **open-ended** range with End dropped:
```
createddate:["2026-02-28T23:00:00.000Z" TO]
```
All 10 orders (including 05/04/2026 orders) are returned. The list is identical to the unfiltered baseline despite the buyer specifying an End date.

---

## Evidence

- **Screenshot:** `reports/coverage/COV-2026-05-26-1430/screenshots/dp-06-anomaly-end-ignored.png` — result list after applying 03/01–03/22 range; 05/04/2026 orders visible (should have been excluded).
- **Network capture:** GQL request body during exploration — `filter` value = `"createddate:[\"2026-02-28T23:00:00.000Z\" TO]"` (no upper bound). HTTP 200, `errors[]` empty, `items[]` contained 10 orders spanning the full account history.
- **Comparison — Preset (working):** `Last day` preset → `createddate:["2026-05-23T22:00:00.000Z" TO "2026-05-25T21:59:59.999Z"]` — both bounds present. Regression is isolated to the Custom-date pathway.
- **Exploration report (full context):** `reports/coverage/COV-2026-05-26-1430/date-picker-exploration.md` (behavior matrix B3, B4, B5, B11; anomaly A1).

---

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | Custom-date path drops End before request payload assembly. Screenshot `dp-06-anomaly-end-ignored.png`. |
| 2. Backend Admin | N/A | Bug is in the storefront component; admin not exercised. |
| 3. GraphQL xAPI | PASS | Same `GetOrders` endpoint correctly applies the End bound when the **preset** path sends a complete `TO "...Z"` clause (verified via `Last day` preset). xAPI is not the owning layer. |
| 4. Platform REST API | N/A | Not exercised by storefront orders flow. |

**Owning layer:** **Storefront Frontend (`vc-frontend`).** The Layer-3 GraphQL endpoint and Lucene-range parser both handle the closed range correctly when the request payload includes both bounds — the failure is on the request-construction side.

---

## Module Versions

- **Storefront theme:** `2.50.0-pr-2291-fed4-fed4fe16` (from `/account/orders` footer)
- **Affected repo:** `VirtoCommerce/vc-frontend` (dev branch at time of capture)
- **Affected files:**
  - `client-app/shared/account/composables/useUserOrdersFilter.ts` — date filter state composable (suspect: CUSTOM entry initialized without `startDate`/`endDate` keys)
  - `client-app/shared/account/components/date-filter-select.vue` — date picker UI; emits `change` with `selectedDateFilter` on each `VcDateSelector` update
  - `client-app/shared/account/composables/useUserOrders.ts:73-93` — `getFilterExpression()` builds the Lucene `createddate:[…]` string; correctly handles both bounds IF they reach it

---

## Root Cause Analysis

The Lucene filter builder at `useUserOrders.ts` is correct:

```ts
// useUserOrders.ts:80-93 (dev branch)
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

It explicitly checks `endDateFilterValue` and appends ` "endIso"` when present. The observed output `... TO]` (with no upper bound) therefore means **`filterData.endDate` is `undefined` when this function runs** for the Custom-date pathway — the End value is never persisting into `appliedFilterData`.

**Suspect zone — `date-filter-select.vue` + `useUserOrdersFilter.ts`:**

`useUserOrdersFilter.ts:58-61` initializes the `CUSTOM` preset entry with only `id` and `label`:
```ts
{ id: DateFilterId.CUSTOM, label: t("common.labels.custom_date") }
// note: no startDate / endDate keys
```

`date-filter-select.vue:23-27` then v-models the End input directly into a property that does not yet exist on the object:
```vue
<VcDateSelector
  v-model="selectedDateFilter.endDate"
  @update:model-value="$emit('change', selectedDateFilter)"
/>
```

With reactivity proxies, writing to a non-existent property *should* add it — but the suspect ordering is: `@update:model-value` fires the emit with `selectedDateFilter` **before** Vue's reactivity has committed the new End property to the proxied object. The parent's `change` handler then reads `selectedDateFilter.endDate` as `undefined`.

Behavior A2 (panel reopens with End blank but Start retained) reinforces this: Start is persisted because the user types Start first and the next interaction allows the reactive write to settle; End is the *last* edit before Apply, so the emit reads it pre-commit.

**Suggested fix path** (for engineering — not a binding prescription):
- Initialize the CUSTOM entry with explicit `startDate: undefined, endDate: undefined` keys so the reactive object has the shape upfront, OR
- Change the emit to fire on input `blur` / Apply click rather than per-`update:model-value`, OR
- Use a local watcher on `selectedDateFilter.endDate` to defer the emit to the next microtask.

The component already mutates these keys to `undefined` in `handleChangeType` (line 60–63), which proves the keys are intended — they're just absent at init.

---

## Affected Test Cases (regression trip-wires already authored)

- `ORD-062` (Critical, `Orders > Filtering`) — Custom Date filter correctness: asserts GraphQL filter payload contains BOTH lower and upper bound. **Currently FAILS** (intentional trip-wire).
- `ORD-069` (High, `Orders > Filtering`) — Persistence: asserts End input still populated when Filters panel is reopened after Apply. **Currently FAILS** (covers A2).

Both cases are in `regression/suites/Frontend/orders/014-orders-frontend.csv` with `Automation_Status` annotated to point at this bug. Promote to `Automated` after fix verification.

---

## Impact

Any buyer who uses the Custom date range to **exclude** orders outside a window (e.g., "show me only Q1 orders" / "show me orders from a specific week for an expense report") receives unfiltered results. The UI shows the filter chip as active, providing false confirmation that the filter was applied. Customer trust impact is high; expense-reporting / accounting workflows that depend on this filter return incorrect data with no user-visible error signal.

Preset paths (`Last day` / week / month / year) remain functional, so users who only need rolling-window queries are unaffected. The bug is specifically the **typed Custom range**.

---

## References

- Coverage run: `reports/coverage/COV-2026-05-26-1430/`
- Exploration report: `reports/coverage/COV-2026-05-26-1430/date-picker-exploration.md` (anomalies A1, A2)
- Coverage report: `reports/coverage/COV-2026-05-26-1430/coverage-generation-report.md`
- Test cases: `regression/suites/Frontend/orders/014-orders-frontend.csv` rows ORD-062, ORD-069
- Source files: `useUserOrders.ts`, `useUserOrdersFilter.ts`, `date-filter-select.vue` (vc-frontend `dev` branch)
