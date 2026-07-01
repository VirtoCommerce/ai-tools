# BUG: Multistep checkout keeps the cart-inline payment form and blocks "Place Order" (should redirect to the payment page) `[High / P0-revenue path]`

## Status: FIXED
**JIRA:** VCST-5369

## Resolution
- **Fixed in:** vc-frontend PR #2353, final commit `6f3cf213` "disable cart payment in multistep checkout". `useCheckout.ts` now computes `allowCartPayment = !checkout_multistep_enabled && paymentMethod.allowCartPayment`, so in multistep the cart-inline card form is disabled for ALL processors; "Place Order" is no longer gated on inline finalize; payment is **deferred to the dedicated `/checkout/payment` step after the order is placed** (matches the original design intent). (`place-order.vue`, `billing-details-section.vue` updated to the same `allowCartPayment` flag.) Supersedes the earlier `:cart`-prop approach (commit `802c2b75`).
- **Verified on:** 2026-06-29, vcst-qa theme `vc-theme-b2b-vue-2.52.0-pr-2353-6f3c` (deploy vc-deploy-dev #6076). Verdict VERIFIED_WITH_NOTES via `/qa-verify-fix` full re-test.
- **Authorize.Net:** STR 3/3 PASS — paid orders CO260629-00014/00015/00016. Multistep is now a 5-step stepper (Shipping → Billing → Order review → Payment → Completed).
- **CyberSource (previously broken):** FIXED — Place Order enabled on Review (original block gone), order placed (CO260629-00017), routed to `/checkout/payment`, and the `'container'` TypeError is GONE on Billing/Review. Gateway declined the automated card at the payment page (sandbox/cross-origin-Microform automation limit, not a fix issue).
- **Skyflow:** flow correct (CO260629-00018, routed to payment); card stalls = known gateway-down infra. Datatrans (non-allowCartPayment) works (CO260629-00019). Checklist 10/10.
- **Follow-up (out of scope):** `'container'` TypeError now appears on the Skyflow payment page when its down gateway stalls (never on the CyberSource path).
- **Verification history:** the first c768-build pass (Authorize.Net 3/3) over-credited CyberSource as parity-only; the CyberSource block was caught on re-check, reopened, and resolved by commit `6f3cf213`.

## v1 (superseded) note
The original report below described the symptom + an early `:cart`-prop RCA. The shipped fix instead disables cart payment in multistep (deferred-payment model). Kept for history.

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
