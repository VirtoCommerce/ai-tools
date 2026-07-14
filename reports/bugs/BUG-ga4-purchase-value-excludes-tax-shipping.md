# GA4 `purchase.value` excludes tax + shipping and `transaction_id` is an internal GUID `[P2]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / PAY-AN-016

## Summary
On a placed Authorize.Net order (CO260714-00020, Total **$1,414.79** = subtotal $1,028.99 + tax $235.80 + shipping $150.00), the GA4 `purchase` event fires exactly once (no double-fire) but reports `value = 1028.99` — subtotal only, omitting tax and shipping — and `transaction_id = "e37f28ff-…"` (internal order GUID) instead of the human order number CO260714-00020. This under-reports revenue and breaks transaction reconciliation.

## STR
1. Place an Authorize.Net order with taxable + shipped items (order CO260714-00020, Total $1,414.79).
2. On the confirmation page, capture the GA4 `purchase` dataLayer/event payload.
3. Compare `value` to the order total and `transaction_id` to the order number.

## Expected vs Actual
- **Expected:** `purchase.value` = order grand total **1414.79** (subtotal + tax + shipping); `transaction_id` = order number `CO260714-00020`.
- **Actual:** `value = 1028.99` (subtotal only); `transaction_id = "e37f28ff-…"` (internal GUID). Single fire is correct.

![Order completed CO260714-00020](screenshots/PAY-AN-016-order-completed-CO260714-00020.png)

## Root Cause (suspected)
The GA4 purchase mapping in `useCheckout.ts` sends the cart subtotal as `value` (should be the grand total incl. tax + shipping) and the order id GUID as `transaction_id` (should be the order `number`).

## Fix Routing
- **Repo:** vc-frontend (`useCheckout.ts` GA4 `purchase` event mapping)
- **Kind:** frontend
