# A New return can be set to Completed without any decision, and its units stay locked forever

- **Severity:** Medium
- **Provenance:** IN-SCOPE — VCST-5883 (PR #27: `GET /api/return/{id}/available-statuses` + `PUT /api/return` status guards)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc`
- **Found by:** `/qa-test VCST-5883` — checklist A14/A15, reproduced by the orchestrator on return `43bec76a-6c0e-439f-a8c0-67f2e8927ae0`
- **Evidence:** `reports/tickets/Sprint26-19/VCST-5883/screenshots/4a-be-A14-A15-new-status-dropdown.png`

## Steps to reproduce

1. Admin creates a return for an order line (legacy `PUT /api/return`, no id) → status **New**, 1 unit.
2. Admin → Returns → the return: the Status dropdown (and `available-statuses`) offers
   `New, Completed, Canceled, Processing, Cancelled`.
3. Pick **Completed** and save (a full-body `PUT /api/return`) → **200**.

## Expected

Per the ticket's status table, a `New`/`Requested` return reaches an outcome only through authorize
(Approved / PartiallyApproved / Rejected); fulfilment statuses follow a decision. A New return is not offered
Completed/Processing, or saving it is refused.

## Actual

- Status **Completed**, line `itemState = Requested`, `approvedQuantity = 0` — never decided.
- The line keeps holding its unit: available quantity for the order line went **1 → 0** and stays 0.
- No notification is sent (journal empty for the return), so the buyer is never told.

## Impact

A staff-created return can be closed without anyone deciding what was accepted; the customer cannot return
those units again and receives nothing. The same dropdown also lists both `Canceled` and `Cancelled`
(filed separately as Low).
