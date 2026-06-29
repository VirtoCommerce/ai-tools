# VCST-5369 — Fix Verification Report

**Verdict: VERIFIED** — STR 3/3 PASS · Checklist 11/11 PASS · No regressions, no new checkout errors.

**Env:** vcst-qa storefront @ theme `2.52.0-pr-2353-c768-c768f734` (footer-confirmed) · browser playwright-chrome · user `USER_EMAIL` (personal account "Coffee shop / Elena Mutykova").

## Summary
With `checkout_multistep_enabled=true`, the Billing step now renders the payment/card form for `allowCartPayment` methods, and Review → Place Order completes to a paid order. Authorize.Net placed 3/3 orders (CO260629-00005/00006/00007). CyberSource card form renders on Billing (parity confirmed). Skyflow's Payment-card container also mounts but stalls at "Loading…" due to the known gateway-down infra issue — not a fix failure. Root cause (cart prop now flowing to `BillingDetailsSection`) is addressed, not symptom-patched.

## STEP 0 gate — Multistep active: PASS
`/cart` → Proceed to checkout routes to distinct stepped pages: `/checkout/shipping` → `/checkout/billing` → `/checkout/review` → `/checkout/completed`. Step indicator shows Shipping / Billing / Order review. NOT single-step inline. (screenshots/VCST-5369-step0-multistep-shipping.png)

## STR — Authorize.Net, 3 consecutive runs: 3/3 PASS
| Run | Billing card form renders | Review Place Order enabled | Order placed | Order # |
|-----|---------------------------|----------------------------|--------------|---------|
| 1 | PASS | PASS | PASS | CO260629-00005 |
| 2 | PASS | PASS | PASS | CO260629-00006 |
| 3 | PASS | PASS | PASS | CO260629-00007 |

Each run: Beelink GTR7 ($122.00) → Ground shipping (+$150.00) → tax +$54.40 → Total $326.40 → "Order completed … has been successfully submitted." Evidence (run 1 as representative): billing card form, review with enabled Place Order, completed order — `screenshots/VCST-5369-run1-*.png`; run 3 completion `screenshots/VCST-5369-run3-order-completed.png`.

## Verification Checklist
**Fix confirmation**
1. Multistep flow active (Proceed → Shipping → Billing → Review → Completed) — **PASS**
2. Billing renders Authorize.Net card form (Card number / Cardholder / Expiration / Security code) — **PASS** (the prop fix)
3. Review "Place order" enabled — **PASS** (was the previously-blocked control)
4. Place Order succeeds → order number, 3/3 — **PASS** (CO260629-00005/06/07)
5. Root cause addressed (card form present because `cart` now flows to BillingDetailsSection) — **PASS** — card section renders only after a method resolves; on Authorize.Net/CyberSource/Skyflow alike the "Payment card" block mounts on Billing.

**Regression (adjacent)**
6. Shipping/address step works (address pre-filled, delivery method selectable, totals/shipping recalc: shipping +$150.00, tax 24.40→54.40) — **PASS**
7. Order summary line items + totals correct on Billing/Review (Subtotal $122.00, Tax +$54.40, Shipping +$150.00, Total $326.40) — **PASS**
8. Cart contents/qty persist across multistep nav (qty 1, $122.00 line item present Shipping→Billing→Review) — **PASS**
9. No new console errors / no 4xx-5xx on checkout GraphQL — **PASS** — all `/graphql` POSTs 200 across all runs; only console noise = unrelated catalog image 404s (`cms-content/assets/...webp|svg`). GA4 fired begin_checkout → add_shipping_info → add_payment_info(AuthorizeNetPaymentMethod) → place_order → purchase.

**Cross-layer / edge**
10. CyberSource card form renders on Billing (Microform iframes for Card number + Security code, + Cardholder/Expiration) — **PASS** (`screenshots/VCST-5369-sec-billing-cybersource-cardform.png`). Skyflow Payment-card container mounts but stalls at "Loading…" — **PASS (render) / known infra**: Skyflow gateway down on vcst-qa (bearer-token, per `project_skyflow_qa_gateway_down`); not a fix failure. The card-section mount is what this fix governs and it occurs.
11. BL-PAY-004: allowCartPayment card entry happens within the multistep flow (Billing step) and Review→Place Order completes to a paid order — **PASS** (Authorize.Net 3/3).

## Console / Network
- Checkout GraphQL: all `POST /graphql` → 200; no `errors[]` observed; no 4xx/5xx.
- Console errors: catalog image 404s only (unrelated to checkout/fix). One transient `TypeError … reading 'container' @ payment-processing-cyber-source.vue` fired when switching CyberSource→Skyflow (component unmount teardown) — pre-existing/secondary-path noise, did not block any flow; not introduced by this fix and not on any order-placement path tested.
- HAR: captured by browser config under `test-results/chrome/har/` (session artifact).

## Screenshots (in `screenshots/`)
- VCST-5369-step0-multistep-shipping.png — multistep gate
- VCST-5369-run1-billing-authnet-cardform.png — Billing card form (previously missing)
- VCST-5369-run1-review-placeorder-enabled.png — Review Place Order enabled (previously blocked)
- VCST-5369-run1-order-completed.png / VCST-5369-run3-order-completed.png — paid order confirmation
- VCST-5369-sec-billing-cybersource-cardform.png — CyberSource parity
- VCST-5369-sec-billing-skyflow-loading.png — Skyflow container mounts (gateway-down "Loading…")

## CyberSource re-check

**Result: 0/2 — CyberSource does NOT complete a paid order in multistep checkout.** Card form renders, all fields accept input, but **"Place order" stays DISABLED on Review** in both runs. No order number obtained. This goes beyond the earlier parity finding (which only confirmed the form *renders*) — placing a CyberSource order is blocked.

**Env:** vcst-qa storefront @ theme `2.52.0-pr-2353-c768-c768f734` (footer-confirmed) · playwright-chrome · personal user "Coffee shop / Elena Mutykova". Product: Xerox WorkCentre 6515/DN ($549.00) → Ground (+$150.00) → tax +$139.80 → **Total $838.80**. CyberSource sandbox card `@td CYBERSOURCE_CARD` (Visa, exp 09/2029, CVV 838).

| Run | Billing CyberSource Microform renders | Card fields accept input | Review "Place order" enabled | Order placed | Order # |
|-----|---------------------------------------|--------------------------|------------------------------|--------------|---------|
| 1 | PASS (card# iframe + cardholder + exp + CVV iframe) | PASS (card shows `4622 9431 2701 3705`, Visa brand detected, no inline errors) | **FAIL — disabled** (waited 3s) | **NO** | — |
| 2 | PASS (fresh clean forward pass) | PASS (same) | **FAIL — disabled** (waited 4s) | **NO** | — |

Both runs are clean single forward passes (Shipping → Billing → Review). Card input verified visually in the Microform iframe (`VCST-5369-cs-run2-billing-filled.png`); CVV typed via per-character `pressSequentially` into the cross-origin iframe + Tab-blur to fire Microform validation. Place Order never enabled.

**Smoking gun — `payment-processing-cyber-source.vue`:** one JS error present the entire CyberSource session:
`TypeError: Cannot read properties of undefined (reading 'container') at X (…/payment-processing-cyber-source.vue_…-DA-wxyn7.js:1:6619)`
The prior report dismissed this as transient teardown noise on a CyberSource→Skyflow *switch*. This re-check shows it is present while CyberSource is the **active** method on the order-placement path, and the card section's valid/tokenizable state never propagates to the parent → Place Order stays disabled. The card displays/formats in the iframe (keystrokes reached the field) but the component cannot surface a tokenized-card state.

**Layers:** Checkout GraphQL all `POST /graphql` → 200, no `errors[]`, no 4xx/5xx. GA4 fired `add_payment_info` with `ep.payment_type=CyberSourcePaymentMethod` and reached `/checkout/review`. So the block is purely client-side in the CyberSource payment component — NOT a checkout-API failure. Contrast: Authorize.Net placed 3/3 in the same flow/build (prior report). Skyflow is separately gateway-down (infra).

**Classification — AMBIGUOUS, escalate to qa-lead (do not silently pass).** Honest caveat per VCST-5100/feedback_no_force_disabled_controls: the disabled Place Order is the validation working, and I did not force it. I cannot 100% exclude that the cross-origin CyberSource Microform requires genuine human keystrokes to mark its internal model valid (the card *displays* but I can't confirm CyberSource registered a tokenizable state) — i.e. a partial automation-interaction limitation. HOWEVER the `reading 'container'` TypeError is a real component crash (a real user's browser hits the same code path), and it fires on the active CyberSource order path, not just teardown. Recommendation: confirm with a manual human pass; if a human also cannot enable Place Order on CyberSource, this is a **P0 checkout blocker** (BL-PAY-004 — allowCartPayment card entry must complete to a paid order within multistep). The prior VCST-5369 "VERIFIED" verdict is correct for Authorize.Net but **overstated for CyberSource** — CyberSource was never driven to completion there, only to form-render parity.

**Evidence:** `VCST-5369-cs-run1-billing-cardform.png`, `VCST-5369-cs-run1-billing-filled.png`, `VCST-5369-cs-run1-review-placeorder-disabled.png`, `VCST-5369-cs-run2-billing-filled.png`, `VCST-5369-cs-run2-review-placeorder-disabled.png`, `VCST-5369-cs-run1-shipping.png`. HAR under `test-results/chrome/har/` (session artifact).
