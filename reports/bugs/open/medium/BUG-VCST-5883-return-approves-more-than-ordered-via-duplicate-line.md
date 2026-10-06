# Repeated lines for the same order line bypass the quantity check (REST API) — 9 of 5 approved

- **Severity:** Medium (REST API only — not reachable from the Admin UI or the storefront; every other API path is guarded)
- **Provenance:** IN-SCOPE — VCST-5883 (vc-module-return PR #27 @`51fc4cc`: edit guards on `PUT /api/return` + `POST /api/return/{id}/authorize`)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc` · Platform `3.1072.0`
- **Found by:** `/qa-test VCST-5883` — discovery lane (RET260928-00011) and checklist A10 (RET260928-00019), reproduced twice
- **Evidence:** `reports/tickets/Sprint26-19/VCST-5883/screenshots/3x-02-over-approval-6-of-5-buyer-view.png`

## Steps to reproduce

1. Take an order line of **5** units that is fully requested by a buyer's return in status **Requested** (5 of 5).
2. As an admin, `PUT /api/return` with the same return, keeping its line (qty 5) and adding a **second line for the same `orderLineItemId`** with quantity 1 → **200**.
3. Repeat with a third line of quantity 3 → **200** — the return now holds 5 + 1 + 3 = **9 of 5** (re-checked 2026-09-29 on RET260929-00012, then restored).
4. `POST /api/return/{id}/authorize` approving every line → **200**, approved.

Controls, all refused with `400 … has incorrect quantity`: raising the single line to 6; a line from another order; an orderless line; an unknown `orderLineItemId`.

## Expected

The ticket's rules: `1 ≤ Quantity ≤ AvailableQuantity` and "Availability re-validated at Authorize". The
edit adding a 6th unit, or at the latest the authorize, is refused (`RETURN_QUANTITY_UNAVAILABLE`), and the
total approved quantity for the order line never exceeds the ordered quantity.

## Actual

**6 units approved on a 5-unit order line.** The buyer's storefront shows the return as approved for 6.
Separate returns on the same line ARE guarded (a PUT raising one return to 6 of 5 is refused with 400) —
only lines inside one return are not summed.

## Why it happens (for the implementers to judge)

Availability is checked per line, not per `orderLineItemId` summed across the return's own lines, and
`ReturnFlowService.Authorize()` does not re-check availability at all (it validates the decision against
the line's own requested quantity only).

## Impact

A back-office user can authorize the return of more goods than the customer bought — a credit/refund-in-kind
exposure with no error, no warning, and no trace in the buyer's registered-return email.
