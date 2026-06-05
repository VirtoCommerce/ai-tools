# BUG: GA4 `add_payment_info` carries stale value/items when cart is mutated after the payment form mounts `[Low / P3-analytics]`

## Status: READY_TO_SUBMIT
**JIRA:** VCST-5198 (filed 2026-06-04)

**Env:** vcst-qa @ Platform 3.1032.0, theme 2.51.0-pr-2308 (Skyflow 3.1002.0-pr-23, cart-embedded AllowCartPayment flow / VCST-5009)

## Summary
`add_payment_info` is emitted via `gtag()` exactly once, at payment-method selection (form mount), and is never re-emitted when the cart changes afterwards. Any qty change / item add-remove / coupon applied after the payment section mounts makes the funnel event misreport value and quantities. Money/order path is unaffected — analytics-only. Observed with Skyflow; the emit happens on method select generically, so all cart-payment processors (incl. CyberSource) are likely affected.

## STR (from /cart with 1 item, signed in)
1. Open `/cart` with one item (Total **$8.40**, qty 1)
2. Select payment method `Bank card (Skyflow)` → payment section mounts → `add_payment_info` fires
3. Increase line-item quantity to 2 via the stepper → Total updates to **$16.80** (`update_cart_item` fires)
4. Inspect `window.dataLayer` (gtag arguments-style entries — event name at index `[1]`, no `.event` key)

## Expected vs Actual
- **Expected:** `add_payment_info` reflects the cart state at/near payment submission — `value: 16.80, items[0].quantity: 2` (or the event re-emits on cart mutation while the payment step is active)
- **Actual:** `value: 8.4, items: [{ item_id: "PA882471", price: 7, quantity: 1 }]` — the pre-mutation state. `update_cart_item` (dataLayer idx 9) fires after `add_payment_info` (idx 8) and does not refresh it.

## Evidence (live second-source manual repro with payload capture, 2026-06-04)
```json
{ "event": "add_payment_info", "value": 8.4, "currency": "USD",
  "payment_type": "SkyflowPaymentMethod",
  "items": [ { "item_id": "PA882471", "price": 7, "quantity": 1 } ] }
```
Actual cart at capture: $16.80 / qty 2. Screenshot: `tests/Sprint26-11/VCST-5009/screenshots/F6-add_payment_info-stale-datalayer-cart.png`. First observed during VCST-5009 exploratory (order CO260604-00008: event 8.4/qty 1 vs actual order $180/qty 2 — same root cause at larger scale).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | dataLayer payload above — client-side gtag emit, stale vs rendered cart |
| 2. Backend Admin | N/A | analytics event not admin-visible; order totals in admin are correct |
| 3. GraphQL xAPI | PASS | cart query returned correct post-mutation total ($16.80 / qty 2) |
| 4. Platform REST API | N/A | money/order path verified correct during VCST-5009 testing |

**Owning layer:** Layer 1 — Storefront (pure client-side analytics emission)

## Root Cause Analysis
One-shot emit with no invalidation: the cart page calls the analytics `addPaymentInfo` event when the payment method is selected and never re-fires it on subsequent cart mutations.
- Emitter: `client-app/modules/google-analytics/events.ts` (`add_payment_info` gtag event)
- Caller in cart flow: `client-app/pages/cart.vue` (fires on payment-method selection / section mount)
- Related: `begin_checkout` follows the same no-refresh pattern, but fires at an earlier funnel stage where the captured state was still correct — `add_payment_info` is the user-facing defect since it sits on the active payment step.
- Note: GA4 `value` here equals cart **total** (8.40), not subtotal — analytics spec owner should confirm intended field so the fix asserts the right one.

## Regression coverage
Suite `043-google-analytics.csv` → **GA-033** asserts correct post-mutation values; it stays red until this is fixed.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** google-analytics module (`client-app/modules/google-analytics/events.ts`) + cart page payment-section mount logic (`client-app/pages/cart.vue`)
- **RCA anchor:** `cart.vue` payment watcher — `watch([isValidPayment, paymentGatewayCode], …)` guarded by `analyticsLastSentPaymentCode`; watch sources omit `cart.total`/`selectedLineItems`, so cart mutations never re-trigger, and the code-only dedup short-circuits re-emits (see VCST-5198 comment for the snippet). Emitter `events.ts → addPaymentInfo` reads cart at call-time — correct; the defect is purely *when* it's called. `addShippingInfo`/`begin_checkout` share the pattern.
- **Routing confidence:** HIGH
