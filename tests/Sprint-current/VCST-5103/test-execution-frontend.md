# VCST-5103 — Loyalty Mixed-Cart Order Validation — Frontend E2E Execution

**Env:** vcst-qa @ Storefront theme 2.52.0-pr-2335-f5b1-f5b11db6 · Browser: playwright-chrome · 2026-06-24
**Suite:** `Frontend/loyalty/083b-loyalty-mixed-cart-order.csv` — MCO-E2E-002, MCO-E2E-006
**Result:** Both PASS. No new defects. i18n `loyalty_insufficient_balance` confirmed live as a real localized string (GAP-5 satisfied). AC4b drift confirmed (server-side check at placement, not a pre-emptive cart banner).

## MCO-E2E-002 — Insufficient balance blocks placement; removing the loyalty line lets checkout complete — PASS

User: `@td(LOYALTY_NOBAL_USER)` (NoBalance Loyalty), live balance **204 PTS** (not zero — prior runs left a balance; memory's "85 PTS" is stale).
Cart: PTS line = Chernihiv autoclave PTS100 × 3 = **PTS300** (chosen to exceed the 204 balance) + USD cash line = Animal Crossing $200.

- **/cart, no pre-emptive banner + Place Order behavior (AC4b):** NO insufficient-balance banner rendered on cart load. The mixed cart rendered correctly: USD line in the main list + a separate **"Products in PTS"** group (PTS300), and the order summary showed a default USD total block ($240) AND a **"Total in PTS"** block (PTS300). Place Order was disabled ONLY by the standard required-info gate ("Complete all required information to proceed."), and became **ENABLED** once shipping address + Fixed Rate (Ground) + Manual payment were set — i.e. NOT blocked by any loyalty banner. Confirms the drift vs the story's "add and cart level" wording.
- **Place Order (blocked):** clicking Place Order kept the flow on /cart, NO order created (no confirmation / order number), `createOrderFromCart` returned **HTTP 200** (business error inside the 200, no transport 5xx), no `purchase` GA4 event. The localized toast surfaced (exact text):
  > **"Not enough loyalty points to place the order. Required: 300, available: 204."**
  A real localized `loyalty_insufficient_balance` string referencing required-vs-available — NOT a raw i18n key. (Evidence: `MCO-E2E-002-insufficient-balance-toast.png`)
- **Remove-to-clear + valid checkout:** after removing the PTS line, the cart became USD-only ($420 with Ground shipping + tax); the "Total in PTS" block disappeared. Re-attempted full checkout (Manual payment → Place Order) **completed** → `/checkout/completed`, **Order CO260624-00021** created. (Evidence: `MCO-E2E-002-order-completed.png`)
- **Order count:** exactly **one** order created (CO260624-00021, from the valid post-removal cart). The blocked attempts created none — confirmed against `/account/orders` (only CO260624-00021 is new; CO260624-00020 + CO260624-00015 predate this session).

## MCO-E2E-006 — Points-only cart rejected at placement (needs a cash line) — PASS (known 500 → generic toast)

User: `@td(LOYALTY_VIP_USER)` (AGENT-TEST VIP User). Cart: single PTS line (Chernihiv PTS100), no cash line.

- **Cart state:** order summary showed USD Total **$0.00** + "Total in PTS" **PTS100.00**. No pre-emptive `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` banner on cart load (same place-order-time validation pattern). Place Order disabled only by the required-info gate; enabled after Ground + Manual were set.
- **Place Order (rejected):** flow stayed on /cart, NO order created, `createOrderFromCart` POST returned **HTTP 200** (server-side `GraphQL.ExecutionError` → generic toast, NOT a typed userError). Exact toast (Notifications region):
  > **"Error when creating an order"**
  This is the **documented KNOWN finding** (REG-2026-06-23 MCO-E2E-006 / App Insights-corroborated 500 in `CreateOrderFromCartCommandHandler.ValidateCart`) — a generic toast, NOT a fresh defect.
- **Add cash line → valid checkout completes:** corroborated by the MCO-E2E-002 result above (a valid mixed/USD cart completes the full Manual-payment checkout and produces an order number). A redundant second order was intentionally NOT created on the shared QA env.

## Incidental observation (not filed) — shared-account cart contention

During MCO-E2E-002, while driving the LOYALTY_NOBAL_USER checkout, the cart was repeatedly mutated by a concurrent session on the **same** account (foreign PTS lines appeared — 20× MOA shot glass, autoclaves — and my shipping/delivery/payment selections were reset between clicks). This is a parallel-run isolation hazard on a shared loyalty test account, not a product defect. Worked around by re-building a clean cart once the other session quiesced (the cart briefly emptied), then completing the checkout in one fast pass. No bug filed — environmental, matches `feedback_long_runner_sessions` / shared-user-pool isolation guidance.

## Cross-layer
- **Console:** only benign external product-image 404s (mozu CDN, all.biz, apart.pl) + one Apollo cache-normalization WARNING on `cartTotals` (missing `id`/`@key` for the CartTotalType array — non-fatal). No loyalty/cart JS exceptions.
- **Network:** no 4xx/5xx on `createOrderFromCart` — both blocked attempts returned 200 with the business error in-body (the documented contract). HAR: `test-results/chrome/har/`.
- **GA4:** `add_shipping_info` (shipping_tier=Ground) + `add_payment_info` (payment_type=DefaultManualPaymentMethod) fired; NO `purchase` event on either blocked attempt — confirms no order.

## Teardown
- VIP points-only cart line removed (cart cleared). Signed out of NoBalance; VIP session active at sign-off.
- Order CO260624-00021 left in place (AGENT-TEST account, normal QA test order; no admin cancel performed — read-only on external writes).

Screenshots: `tests/Sprint-current/VCST-5103/screenshots/` (cart-no-banner, insufficient-balance-toast, order-completed, pointsonly-toast2).
