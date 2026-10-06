# PUT /api/return edge cases: 500 on a malformed body, 200 that discards changes, duplicate Canceled/Cancelled statuses

- **Severity:** Low (three small defects on one endpoint family — below the filing floor, kept as one draft)
- **Provenance:** IN-SCOPE — VCST-5883 (PR #27: `ReturnController.UpdateReturn` guards + `available-statuses`)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc`
- **Found by:** `/qa-test VCST-5883` — checklist A12/A14, C1 run `REG-2026-09-28-2251` (RET-AUTH-019/020/021)

## 1. A malformed or partial body returns 500 instead of 400

`PUT /api/return` with `{"id":"", "items":[…]}`, with `{id, items}` only (no storeId/customerId), or with
`{orderId, items}` → **HTTP 500**. Also a PUT whose new line copies another line's attachment ids → 500
(EF tracking error). Expected: 400 with a validation message.

## 2. Changing a decided line returns 200 and silently keeps the old decision

A full-body PUT changing `approvedQuantity` / `itemState` / `quantity` / reject reasons on a decided return
→ **200**, nothing changes (`KeepDecisions`). The decision staying is correct; answering 200 tells the caller
the correction was saved. Expected: 400 naming the locked fields.

## 3. The status dropdown lists `Canceled` and `Cancelled` as two choices, and reopens Completed

`available-statuses`: Cancelled → `[Canceled, Cancelled]`; New and legacy Completed →
`[New, Completed, Canceled, Processing, Cancelled]` (a Completed return can be moved back to New). Expected:
one cancelled spelling; no move back to New.
