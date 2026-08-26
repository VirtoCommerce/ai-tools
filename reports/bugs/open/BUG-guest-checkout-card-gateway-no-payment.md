# Guest completes an order through a bank-card gateway with ZERO card data (payment guard skipped for guests) `[P0-revenue]`

**Env:** vcst-qa storefront @ Theme 2.54.0-pr-2382 (Edge/Chromium)

## Summary
An unauthenticated **guest** can place a completed order using an `allowCartPayment` bank-card method (Authorize.Net) with **no card form ever rendered and no card data entered**. The client-side card-validation gate that keeps "Place order" disabled is wrapped in `isAuthenticated.value &&`, so it is entirely skipped for guests — the button enables and the order is created with no processor authorization. Violates **BL-PAY-001**.

## Steps to Reproduce
1. As a **guest** (not signed in), open a buyable product PDP and add it to cart (`@td(BUYABLE_PRICED_PRODUCT)`, SKU ALCE0128, $59.99).
2. Go to `/cart`. Complete the required non-payment fields: add a new shipping address, select Delivery option = Shipping → "Fixed Rate (Ground)"; billing = same as shipping.
3. Open **Payment method** → select **"Bank card (Authorize.Net)"** (an `allowCartPayment` gateway).
4. Observe: **no card form renders** anywhere in the Payment details section (only Billing address + the method selector). Yet the **"Place order" button becomes enabled** and the "Complete all required information to proceed" helper text disappears.
5. Click **Place order** without entering any card data.

## Expected vs Actual
- **Expected (per BL-PAY-001):** With a bank-card method selected and no/invalid card data, "Place order" stays **disabled**; no order is created; the card form must be completed and valid first (this is the documented authenticated behavior).
- **Actual:** Order **CO260722-00003** (`415920a1-47a9-4b56-bc85-e69310036704`) is created and the guest lands on `/checkout/completed` — with zero card data and **no request to any Authorize.Net processor host**. The order is effectively an unpaid / "Payment required" order created from empty card input.

## Evidence
- Guest cart, Authorize.Net selected, **no card form**, "Place order" enabled: `reports/bugs/screenshots/guest-cart-authnet-no-cardform.png`
- Completed guest order confirmation (CO260722-00003): `reports/bugs/screenshots/guest-order-completed-CO260722-00003.png`
- **Network trace (Place order):** all order ops went through storefront `POST /graphql` (createOrder) → 200; **zero requests to `api.authorize.net` / `api2.authorize.net`** or any card-tokenization endpoint. GA4 `add_payment_info` fired with `payment_type=AuthorizeNetPaymentMethod` and `place_order` fired with `transaction_id=415920a1-47a9-4b56-bc85-e69310036704` — confirming an order was booked against the card method with no card ever collected.
- Payment state could not be read via the guest UI (`/account/orders/*` redirects to `/sign-in`); the absent processor authorization in the network trace is conclusive that no payment was captured. Confirm as unpaid/PaymentRequired in Admin if needed.

## Root Cause
`vc-frontend` `client-app/shared/checkout/components/place-order.vue` — the `isDisabled` computed:
```
hasOnlyUnselectedLineItems.value ||
!isValidCheckout.value ||
(isAuthenticated.value && canPayFromCart.value && !isCanFinalizePayment.value)
```
The card-form-valid gate (`!isCanFinalizePayment.value`) is guarded by `isAuthenticated.value &&`, so for a guest that entire branch short-circuits to `false` and never contributes to `isDisabled`. Fix: the `canPayFromCart && !isCanFinalizePayment` payment-validity gate must apply regardless of auth state (drop the `isAuthenticated.value &&` prefix, or gate on `canPayFromCart` alone). Server side, `createOrderFromCart` also does not reject the missing payment authorization for the guest path.

## Control (authenticated)
The authenticated path keeps "Place order" gated until the bank-card form is valid — this is the established, regression-covered baseline (BL-PAY-001; suite 040b PAY-AN-012/013/018–020). In `isDisabled` the ONLY difference between guest and authenticated is the `isAuthenticated.value &&` prefix, so source is the definitive contrast; a live authenticated re-run was not repeated here (already baselined).

## Refs
- BL: **BL-PAY-001** (client-side card validation gates order submission — P0-revenue)
- Prior batch-2 triangulation finding: same `isAuthenticated &&`-wrapped guard.

## Cleanup note
Guest order **CO260722-00003** remains on vcst-qa (guest email `agent-test-guest-5100@test.com`); no account/org/contact created. Cancel/delete via Admin SPA if desired.

---

## Re-verification 2026-08-26 — STILL REPRODUCES (source axis; root cause enlarged)

Re-checked against `vc-frontend@dev` (env has moved to Theme `2.56.0-pr-2451`, Platform `3.1061.0` since the draft). **Both halves of the defect are byte-unchanged.** No live re-run was performed — deliberately: proving it live requires clicking "Place order", which creates a second unpaid ghost order, and the source contrast is conclusive.

**The draft named only half the root cause.** There are *two* symmetric `isAuthenticated.value &&` prefixes, and the bug lives in the gap between them:

1. `client-app/shared/checkout/components/billing-details-section.vue` — `paymentCardVisible`:
   ```
   return isAuthenticated.value && props.cart && canPayFromCart.value && currentPaymentMethod.value;
   ```
   → the card form is **never rendered** for a guest, so `registerPaymentProcessor()` is never called.

2. `client-app/shared/checkout/components/place-order.vue` — `isDisabled` (as drafted, unchanged):
   ```
   (isAuthenticated.value && canPayFromCart.value && !isCanFinalizePayment.value)
   ```
   → the card-valid gate is **skipped** for a guest, so the button enables anyway.

Confirmed in `usePayment.ts` (unchanged): `isCanFinalizePayment = isValidCardData && paymentProcessorInternal !== null`. With no form mounted the processor stays `null`, so `isCanFinalizePayment` is `false` — the gate would fire correctly, if only it were reachable. `finalizePayment` then uses optional chaining (`paymentProcessorInternal.value?.(order)`), so it **silently no-ops** instead of throwing — which is exactly why the original network trace showed zero requests to any Authorize.Net host rather than an error.

**Why this is a hole, not a policy:** hiding the cart card form from guests looks intentional (guests would normally be routed to the post-order `/checkout/payment` step). But `canPayFromCart` is true for an `allowCartPayment` method, so no redirect step is scheduled either. The guest therefore gets **neither** payment surface and lands straight on `/checkout/completed`. The method selector still offers `allowCartPayment` gateways to guests, which is the upstream decision that opens the gap.

**Fix shape (both must be considered together — fixing only `place-order.vue` leaves guests with an unreachable-but-enabled state):** either render the card form for guests too (drop prefix 1) *and* apply the gate to guests (drop prefix 2); or exclude `allowCartPayment` methods from the guest method selector so guests take the redirect/post-order path. Do not fix one prefix alone.

Server-side rejection was **not** re-verified (would require creating the order). Treat "`createOrderFromCart` does not reject the missing authorization" as carried over from the original run, not re-confirmed.

**Verdict: still open, still P0.** No tracker item found.
