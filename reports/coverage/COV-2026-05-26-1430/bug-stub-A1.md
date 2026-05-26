# BUG-Order-History-Date-Picker — Custom-Date End boundary silently dropped from GraphQL filter

**Severity:** P0 — Data correctness (buyer sees orders they explicitly tried to exclude)
**Env:** vcst-qa @ Storefront 2.50.0-pr-2291-fed4-fed4fe16
**Reproduced:** 3/3 attempts (03/01–03/22/2026, 03/01–05/31/2026, 05/04–05/04/2026 ranges)

---

## Summary

When a buyer applies a Custom date range on `/account/orders` using both a Start and End date, only the Start date is sent to the GraphQL `GetOrders` operation. The End boundary is silently dropped, producing an open-ended `createddate:[\"startISO\" TO]` filter instead of the expected two-bound range. All orders after the specified End date are returned, making the Custom date filter functionally broken for any bounded range query. Preset filters (Last day / week / month / year) are NOT affected — they correctly send both bounds.

---

## Steps to Reproduce

Starting state: signed in as `{{USER_EMAIL}}` on `/account/orders`, account has orders spanning more than 30 days.

1. Click the `Filters` button — Filters popover opens.
2. Confirm the `Created date` combobox shows `Custom date` (default).
3. Fill `aria-label="Start date"` with `03/01/2026`.
4. Fill `aria-label="End date"` with `03/22/2026`.
5. Click `Apply`.
6. Open browser Network tab; inspect the `POST /graphql` request body for operation `GetOrders`.

---

## Expected

Request variable `filter` contains a closed range:
```
createddate:["2026-02-28T23:00:00.000Z" TO "2026-03-21T23:00:00.000Z"]
```
Orders after 03/22/2026 are excluded from the result list.

## Actual

Request variable `filter` contains an open-ended range with End dropped:
```
createddate:["2026-02-28T23:00:00.000Z" TO]
```
All 10 orders (including those from 05/04/2026) are returned. The order list is identical to the unfiltered state despite the buyer having specified an End date.

---

## Evidence

- `screenshots/dp-06-anomaly-end-ignored.png` — result list after applying 03/01–03/22 range; 05/04/2026 orders visible (should have been excluded).
- Network request body captured during exploration: `filter` value was `"createddate:[\"2026-02-28T23:00:00.000Z\" TO]"` (no upper bound).
- GQL request/response pair: HTTP 200, `errors[]` empty, `items[]` contains 10 orders spanning the full account history — confirming the filter had no upper bound effect.

---

## Additional Observations

- **A2 (related):** After Apply, reopening the Filters panel shows the End input blank (Start is retained). This confirms the End value is dropped at apply-time in the component state, not only at serialization.
- **A3 (compounding):** No client-side validation prevents Start > End entry. Combined with this bug, an inverted range also silently drops End and fires a Start-only filter.
- **Presets unaffected:** `Last day` preset correctly produces `createddate:["2026-05-23T22:00:00.000Z" TO "2026-05-25T21:59:59.999Z"]` — the regression is isolated to the Custom-date pathway.

---

## Root Cause Hypothesis

The `apply` handler in the date-filter component reads the Start date value but does not read or serialize the End date value before constructing the Lucene filter string. The End input's reactive state is either not bound to the serialized payload or is reset before the payload is built.

---

## Regression Tests

`ORD-062` (Critical) and `ORD-069` (High) in `regression/suites/Frontend/orders/014-orders-frontend.csv` are authored to catch this bug. Both are marked `Generated — currently FAILS due to A1`. Promote to `Automated` after fix verification.

---

## Impact

Any buyer who uses the Custom date range to exclude recent orders (e.g., "show me only orders from Q1") receives unfiltered results. The feature communicates a visual confirmation of the filter being applied (filter chip visible) while silently ignoring the End boundary — a data-correctness defect with no user-visible error.
