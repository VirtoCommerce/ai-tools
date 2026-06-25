# BUG: Multistep checkout keeps the cart-inline payment form and blocks "Place Order" (should redirect to the payment page) `[High / P0-revenue path]`

## Status: CONFIRMED
**JIRA:** VCST-5369

**Env:** Local vc-frontend dev build — `https://localhost:3000` (backend `http://localhost:8090`, `STORE_ID=B2B-store`), `checkout_multistep_enabled = true`. (Default QA `vcst-qa-storefront` has multistep **OFF**, which is why this is not seen there.)

## Summary
In **multistep** checkout, selecting a payment method with `allowCartPayment=true` (Authorize.Net, CyberSource, Skyflow) keeps the **cart-inline** payment path — the card form is bound to `/cart` instead of routing the user to the dedicated payment page. As a result, the **"Place Order" button on the Review step is blocked/disabled** and the customer cannot complete the order. Per design, the inline-on-`/cart` form is for **single-step checkout only**; multistep must **redirect to `/checkout/payment`** for card entry.

## Steps to Reproduce
1. On an environment with `checkout_multistep_enabled = true`, sign in as a storefront user.
2. Add an in-stock, priced product to the cart; go to `/cart`.
3. Select a payment method that has `allowCartPayment=true` — **Authorize.Net** (also reproducible with **CyberSource** and **Skyflow**).
4. Proceed through the multistep flow: **Proceed → Billing → Review**.
5. On the **Review** step, attempt to place the order.

## Expected vs Actual
- **Expected (per BL-PAY-004, corrected 2026-06-25):** In multistep checkout the inline-on-`/cart` form does **not** apply. Selecting an `allowCartPayment` method routes the flow to **`/checkout/payment`**, the card is entered there, and **Review → Place Order succeeds** → paid order.
- **Actual:** The cart-inline path leaks into multistep — the card form stays bound to `/cart`, there is **no redirect to `/checkout/payment`**, and the **"Place Order" button on Review is blocked/disabled**, so the order cannot be placed.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | Multistep payment-routing branch keeps the cart-inline form; Place Order on Review blocked. |
| 2. Backend Admin | N/A | Pure storefront flow/routing — no admin entity involved. |
| 3. GraphQL xAPI | N/A | `initializeCartPayment` / `createOrderFromCart` are correct contracts; the defect is which path/page the storefront chooses, not the API response. |
| 4. Platform REST API | N/A | Not exercised by the routing defect. |

**Owning layer:** Layer 1 — Storefront Frontend (`vc-frontend`).

## Root Cause Analysis (suspected)
The `allowCartPayment` cart-inline branch is **not gated by `checkout_multistep_enabled`**. The storefront renders/initializes the cart-context payment form on `/cart` regardless of checkout mode, but in multistep the payment component is **not part of the Review step**, so the processor / `isCanFinalizePayment` state required by `finalizePayment` never exists on the multistep path → Review's "Place Order" guard never becomes satisfiable. The correct behavior is to **skip the cart-inline branch when multistep is enabled** and route the user to `/checkout/payment`.

Code anchors (from BL-PAY-004 source set): `payment.vue` (cart-inline render branch), `payment-processing-authorize-net.vue` (`isActive` guard / register-after-init), `useCheckout.ts` (`allowCartPayment` finalize guard), and the multistep gate `<ProceedTo v-if="$cfg.checkout_multistep_enabled" />`. The `allowCartPayment` branch needs the same `checkout_multistep_enabled` gating the `<ProceedTo>` control already uses.

## Evidence (reproduced live on localhost:3000, multistep ON)
Screenshots in `reports/bugs/screenshots/VCST-5369/`:
- `01-cart-multistep.png` — cart in multistep mode.
- `03-billing-no-card-form.png` / `04-billing-authnet-no-form-fullpage.png` — Billing step shows **no card form** after selecting Authorize.Net (the inline form is bound to /cart, not surfaced in the multistep flow).
- `02-review-placeorder-disabled-authnet.png` / `05-review-placeorder-disabled.png` — **Review step: "Place Order" disabled** (Authorize.Net).
- `06-review-skyflow-placeorder-disabled.png` — same block with **Skyflow**.
- `07-B2B-review-placeorder-disabled-authnet.png` — same block in the **B2B** store flow.
- `08-cart-no-payment-multistep.png` / `09-review-blocked-payment-step-inert.png` — no payment entry in multistep; the payment/review step is inert.

Confirms the block reproduces across **Authorize.Net, CyberSource, and Skyflow** and in both personal and B2B flows.

## Notes / Evidence basis
- Filed on the **QA-lead-confirmed design intent** (multistep → redirect to payment page; cart-inline is single-step only), confirmed by the live evidence above.
- Oracle: **BL-PAY-004** (corrected 2026-06-25 — this report is the cited bug; the prior "inline state survives the Billing-step unmount into Review" wording was superseded).
- Related: VCST-5162 (Authorize.Net `allowCartPayment`, PR vc-frontend#2309), VCST-5009 (Skyflow). Suites 040a/040b cover single-step `allowCartPayment`; no suite covers the **multistep** path (multistep is OFF in QA).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** Checkout — `payment.vue` cart-inline branch / `useCheckout.ts` finalize guard; multistep gate `checkout_multistep_enabled`
- **RCA anchor:** `allowCartPayment` cart-inline render/init branch not gated by `checkout_multistep_enabled` (see `payment.vue`, `useCheckout.ts`); mirror the `<ProceedTo v-if="$cfg.checkout_multistep_enabled">` gating to redirect to `/checkout/payment` in multistep.
- **Routing confidence:** MEDIUM — repo (vc-frontend) is HIGH-confidence; exact line/branch to gate needs dev confirmation against current `dev`.
