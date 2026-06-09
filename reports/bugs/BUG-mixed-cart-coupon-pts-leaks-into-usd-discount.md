# BUG — Mixed-cart cart-% coupon folds the PTS loyalty line into the USD discount base `[High / revenue]`

**Env:** vcst-qa @ Platform 3.1035.0 · theme 2.51.0-pr-2310 · XCart 3.1018.0-pr-120 · Cart 3.1005.0-pr-188 · store B2B-store · loyalty `PTS`, mode "Mixed Cart"
**Ticket:** VCST-5101 (Loyalty Mixed Cart) — violates Task-1 AC "Tax and Promotion is computed only on primary-currency lines"
**Layer:** Backend — mixed-cart promotion/coupon discount-base (Cart/XCart totals calc or Marketing reward application)

## Summary
In a mixed-currency cart (USD primary + a PTS loyalty line), applying a **cart-subtotal percentage coupon** (`QA10OFF`, 10% off cart) computes the discount over **USD subtotal + the PTS line's value treated 1:1 as USD**, then applies the whole inflated discount to the USD bucket. The PTS line should be excluded from promotion entirely. Result: USD is over-discounted in proportion to the PTS quantity. The automatic −20% promotion is **not** affected — only the cart-% coupon.

## STR
1. Sign in as the VIP user (`@td(LOYALTY_VIP_USER)`); ensure loyalty mode = "Mixed Cart".
2. Add 1 USD catalog product (USD subtotal $124) to the cart.
3. From `/loyalty-catalog`, add 1 PTS loyalty product (PTS80) → mixed cart.
4. Apply coupon `QA10OFF` (`@td(COUPONS.percentageCode)`).
5. Step the PTS line quantity 1 → 2 → 3, keeping the USD line unchanged. Observe the USD discount in the order summary / cart GraphQL `discounts[]`.

## Expected vs Actual
- **Expected:** coupon discount = 10% × $124 (USD primary-currency lines only) = **−$12.40**, independent of PTS quantity. PTS block carries no USD-derived discount.
- **Actual:** USD discount grows **+$8.00 per +PTS80**: −$51.40 (1× PTS) → −$59.40 (2×) → −$67.40 (3×). API `data.cart.discounts[]` coupon amount = **$36.40 = 10% × ($124 + 240)** where 240 = 3 × PTS80 counted as USD. PTS "Total in PTS" block shows PTS0.00 discount — so the PTS value is excluded from the PTS block yet leaked into the USD discount base.

## Evidence
- `tests/Sprint26-11/VCST-5101/screenshots/VCST-5101-BUG-pts-qty-leaks-usd-discount.png`
- `tests/Sprint26-11/VCST-5101/screenshots/cart-resp-coupon-pts-leak.json` (API payload — discount base proof)
- Two-source confirmed: UI quantity-step repro + GraphQL `cart` `discounts[]` capture (per the network-payload second-source rule).

## Root cause (refined via code grounding — BA-2026-06-09)
Initial hypothesis ("the discount base sums all line `ListTotal`s across currencies") is **partially refuted by the PR #120 source**: the per-line promotion mapping IS currency-filtered. `CartMappingProfile.cs` maps `CartAggregate → PromotionEvaluationContext` by iterating `cartAggr.CartCurrencySelectedLineItems` (explicit comment: *"Tax and Promotion are computed only on primary-currency lines"*), and the tax mapper uses the same filter — which is why the **automatic −20% promotion scopes correctly** (PTS per-line discount = 0).

The leak is narrower: the same mapping sets `promoEvalcontext.CartTotal = cartAggr.Cart.SubTotal` (the scalar), and a **cart-subtotal percentage coupon** is evaluated against that scalar rather than against the filtered `CartPromoEntries`. If `Cart.SubTotal` is still summed across currencies upstream (via the Cart #188 totals calculator's `selectedItemsWithoutGifts` / the aggregate's `SelectedLineItems`, which were not confirmed currency-filtered), the % coupon applies to the inflated cross-currency base ($364) even though per-line entries are filtered. The captured API payload (`discounts[0].amount = $36.40`, a server response) confirms the defect is **server-side**, not an Apollo cache artifact.

**Fix:** make the cart-subtotal coupon base use primary-currency lines only — derive `CartTotal` from `CartCurrencySelectedLineItems.Sum(x => x.ListTotal)` (or guarantee `Cart.SubTotal` is currency-filtered upstream), mirroring the per-line `CartPromoEntries` loop and `extendedPriceTotal`'s `CartCurrencySelectedLineItems` usage.

**To confirm before the fix:** whether `SelectedLineItems` / `selectedItemsWithoutGifts` feeding `Cart.SubTotal` already filters by currency (open question #2 in `reports/ba/ba-report-2026-06-09.md`).

## Severity rationale
High / revenue — real monetary miscalculation that **over-discounts** every mixed cart with a cart-% coupon (grows with PTS quantity); directly contradicts an explicit Task-1 acceptance criterion. Not gated at checkout (place-order enables), so it would reach order capture.

## Notes
- Scope: cart-subtotal **% coupon** path. Automatic % promotion scopes correctly (PTS discount = 0) — so the gap is specifically in the coupon/promotion discount-base summation, not the per-currency totals.
- Coverage gap: no regression case covered promotion/coupon on a mixed cart — recommend adding one alongside the fix.
