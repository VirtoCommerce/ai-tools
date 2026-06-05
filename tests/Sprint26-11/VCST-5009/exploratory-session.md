# Exploratory Session — VCST-5009 Skyflow AllowCartPayment (cart-embedded form)

- **Charter:** Explore cart-embedded Skyflow payment form + integration boundaries (cart mutations, processor switching, navigation/state persistence, guest/auth boundary) for risks NOT in the scripted checklist.
- **Type:** Feature · **Heuristic:** SFDPOT · **Timebox:** ~20 min (used ~19 min active)
- **Env:** vcst-qa @ https://vcst-qa-storefront.govirto.com · Build **2.51.0-pr-2308-219c** · Skyflow JS v2.7.7
- **Browser:** playwright-chrome (deliberate; firefox /cart-dropdown quirk) · Date: 2026-06-04 · Tester: qa-testing-expert
- **Card (QA canonical only):** MC 5424000000000015 / 02/29 / CVV from env

## Known constraints (facts, not findings)
- QA Skyflow vault accepts ONLY canonical MC; else declines.
- Cart-resolver appends payment/shipment rows on processor switch → started from fresh carts.
- "DOMWindow target origin mismatch" Skyflow warnings = known noise.
- On decline → routed to order-context /checkout/payment retry (already logged).

## Vectors explored
1. Setup / form-mount mechanics (auth B2B user)
2. **Structure/State** — line-item qty mutation (1→2) with Skyflow iframe pre-filled
3. **Structure/State** — coupon apply ("super", $30-off → clamp) with form mounted → $0 total
4. **Function** — delivery-method add (Fixed Rate Ground) → totals + Place Order enable
5. **Function/Time** — full Place Order through cart-embedded Skyflow with fully-mutated cart; GA4 `add_payment_info` payload captured; order-detail second-source
6. **Platform** — refresh /cart with Skyflow selected (selection + form persistence)
7. **Platform** — mobile 375px form layout
8. **Operations** — guest/anonymous boundary (Skyflow availability, card-form gating, saved-cards)

## Findings count
- Bug: 0
- Risk: 1
- Question: 1
- Observation: 6 (5 positive resilience, 1 neutral)

## Findings log

| # | Vector | Class | 1-line |
|---|--------|-------|--------|
| F1 | Setup | Observation | Auth user: selecting "Bank card (Skyflow)" adds a "Payment card" section (Saved cards dropdown: 2 saved cards + "Add new card"); "Add new card" mounts Skyflow iframe (card#/name/expiry/CVV) + "Save card" checkbox + agreement links. |
| F2 | Qty mutation w/ form filled | Observation (+) | Increased line qty 1→2 with iframe fully filled (canonical card+name+expiry+CVV). iframe stayed MOUNTED and RETAINED all 4 values; subtotal $7→$14, tax $1.40→$2.80, total $8.40→$16.80 tracked correctly (BL-CHK-006 holds). Same iframe `name`/group id — no re-create. |
| F3 | Coupon "super" w/ form mounted | Observation (+) | Discount clamped to -$14.00 (not -$30), tax→$0, **total $0.00**. iframe survived (DOM-confirmed, same group id). No clear/re-init, no console error. |
| F4 | $0-total + delivery method | Question | After coupon ($14 sub, -$14 disc) + Fixed Rate (Ground): **Tax = +$30.00** and Shipping +$150.00 → total $180. $30 tax on $0 net merchandise + $150 shipping looks high (tax appears to ignore the cart discount and/or tax shipping). NOT Skyflow-specific — tax-engine question; flagged for tax owner, out of this charter's defect scope. |
| F5 | Place Order through embedded Skyflow (mutated cart) | Observation (+) | Order **CO260604-00008** created, Skyflow vault POST 200, redirect /checkout/completed. Order detail = Subtotal $14 / Discount -$14 / Tax +$30 / Shipping +$150 / **Total $180.00**, status Processing, method Bank card (Skyflow). Server authorized the CORRECT mutated amount. |
| F6 | GA4 add_payment_info value under mutation | Risk | At Place Order the GA4 `add_payment_info` event fired with **`epn.value=8.4` & `items_count=1`** — the PRE-mutation snapshot — while the actual order was **$180 / qty 2**. Order total (F5) is the second source confirming divergence. Analytics-layer only; money/order are correct. The scripted no-mutation happy-path would not surface this. See evidence below. |
| F7 | Refresh /cart, Skyflow selected | Observation (+) | After full page reload, Payment method = "Bank card (Skyflow)" PERSISTED; Saved-cards dropdown reset to "Select credit card" and the iframe did NOT auto-remount (card data never persisted across reload — correct/secure). User re-picks "Add new card". |
| F8 | Mobile 375px | Observation (+) | Form stacks cleanly: full-width Card number; Expiration + Security code side-by-side; sticky "PLACE ORDER" footer with live total. No overflow/clipping. |
| F9 | Guest / anonymous boundary | Observation (neutral) | Skyflow IS offered to guests. With Skyflow selected but no billing address, the **"Payment card" section + iframe do NOT render** — gated on a billing address (guest billing shows "Please select a shipping address"; unchecking "Same as shipping" reveals "Select a billing address"). This is ADDRESS-gating, not guest-gating (auth user's form appeared only because they had a default address). Saved-cards-for-guest not separately reachable (whole section gated); guests cannot have saved cards by definition. |

## Evidence

### F6 (Risk) — stale GA4 add_payment_info value
Captured live during real-user Place Order (not API). GA4 `g/collect` request:
`en=add_payment_info … ep.payment_type=SkyflowPaymentMethod … epn.value=8.4 … epn.items_count=1`
Actual order at that moment: 2 × Gravity Car Phone Holder, total **$180.00** (order CO260604-00008).
Two GA4 hits, both value 8.4 / items_count 1. Cross-layer: GA4 stale; cart total ($180) and order detail ($180) correct. Pre-existing covered "GA4 purchase event" passed for the no-mutation path; this is the mutation path on the `add_payment_info` step specifically. Recommend dev confirm whether the cart-embedded Skyflow component recomputes the GA4 payload on cart change or snapshots it at form-init.

### F4 (Question) — tax/discount interaction
$14 subtotal − $14 coupon = $0 net merchandise, + $150 shipping → Tax shown +$30.00 (carried into order CO260604-00008). Hand to tax-config owner; verify against tax rules (taxable base, shipping taxability, discount application order).

### Screenshots
(MCP output dir — referenced, not inlined)
- `VCST-5009-coupon-zero-total-skyflow.png` — F3 $0 total, iframe mounted
- `VCST-5009-skyflow-mobile-375.png` — F8 mobile layout
- `VCST-5009-guest-skyflow-no-cardform.png` — F9 guest, Skyflow selected, no card form (address-gated)

### Console
Whole-session error log = benign only: `electro2.json` 404 (theme preset noise) + a few catalog image 404s. NO JS errors, NO Skyflow/payment errors. Skyflow "DOMWindow origin mismatch" warnings = known noise.

## Overall risk read
**LOW risk to ship.** The cart-embedded Skyflow form is robust across the boundaries that the scripted suite doesn't stress: it survives line-item qty changes, large coupon swings ($0 total), delivery-method changes, and page refresh without re-init or data loss; the server authorizes the correct mutated amount (order $180 verified end-to-end); mobile layout is clean; guest behavior is consistent (address-gated, by design); console is clean. The only feature-attributable issue is **F6 (Risk): the GA4 `add_payment_info` event reports a stale pre-mutation value/items_count** — analytics inaccuracy under cart mutation, no money/order impact, fixable post-ship; recommend a dev confirm + a follow-up GA4 test for the mutate-then-pay path. **F4 (tax on discounted+shipping cart)** is a separate, non-Skyflow tax-engine Question to route to the tax owner. No P0/P1 blockers found.
