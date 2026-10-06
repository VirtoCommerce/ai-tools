# An admin edit silently changes the quantity a buyer requested, with no notification

- **Severity:** Medium
- **Provenance:** IN-SCOPE — VCST-5883 (PR #27: `PUT /api/return` edit guards on flow returns)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc`
- **Found by:** `/qa-test VCST-5883` — discovery lane (RET260928-00011: 2 → 5) and checklist A11 (RET260928-00015: 7 → 8)

## Steps to reproduce

1. A buyer submits a return requesting 7 units → Registered email ("7").
2. Admin `PUT /api/return` on that **Requested** return raising the line quantity to 8 → **200**.
3. Agent declines it → Rejected email.

## Expected

`Quantity` is "the quantity the buyer requested" (ticket, Quantity model). Staff either cannot change it on a
buyer's Requested return, or the change is announced to the buyer.

## Actual

The change is saved with no notification. The buyer's Registered email says **7**, the Rejected email and the
storefront "Requested" column say **8** — a quantity the buyer never asked for.

## Impact

The buyer's own request is rewritten without their knowledge, and the two emails they hold contradict each
other — a dispute starter the ticket explicitly calls out.
