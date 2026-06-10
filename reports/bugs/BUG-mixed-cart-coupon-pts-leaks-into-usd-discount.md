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

## Root cause (CONFIRMED in source — 2026-06-10, supersedes the BA hypothesis)
The defect is NOT in `promoEvalcontext.CartTotal = Cart.SubTotal` (BA hypothesis): the Cart #188 calculator (`DefaultShoppingCartTotalsCalculator.cs`) currency-filters `Cart.SubTotal` (`selectedItemsWithoutGifts.Where(x => x.Currency == currencyCode)`), and the eval-context scalar only feeds promotion *conditions*, not the reward amount.

The actual defect is in the **reward application** — `vc-module-x-cart` `feat/VCST-5101` (PR #120), `src/VirtoCommerce.XCart.Core/Extensions/RewardExtensions.cs:201`:

```csharp
var subTotalExcludeDiscount = shoppingCart.Items.Where(li => li.SelectedForCheckout)
    .Sum(li => (li.ListPrice - li.DiscountAmount) * li.Quantity);   // ← NO currency filter
...
discount.DiscountAmount = reward.GetTotalAmount(subTotalExcludeDiscount, 1, aggregate.Currency); // booked as USD
```

`CartSubtotalReward` (% coupon) is computed over **all `SelectedForCheckout` lines across currencies** (extendedPrice base) and booked in the cart currency. This explains every observation exactly: extendedPrice-based amounts (10%×$160=16 / 10%×$240=24), selection-driven leak (S6), fixed-$ coupons immune (S1 — absolute `GetTotalAmount` ignores the base), per-line auto promo correct (different reward type, mapped via the currency-filtered `CartCurrencySelectedLineItems`).

**Fix:** add the primary-currency filter to the `subTotalExcludeDiscount` sum, mirroring `CartAggregate.CartCurrencySelectedLineItems` (`CartAggregate.cs:140`): `li.Currency.EqualsIgnoreCase(shoppingCart.Currency) || li.Currency.IsNullOrEmpty()`.

## Fix Routing
- **Repo:** `VirtoCommerce/vc-module-x-cart` (branch `feat/VCST-5101`, PR #120 — fold into the open PR)
- **File/line:** `src/VirtoCommerce.XCart.Core/Extensions/RewardExtensions.cs:201` (`ApplyRewards` / `CartSubtotalReward` block)
- **Layer:** xAPI (L3) · single-repo, single-line filter change · repro tests: `tests/Sprint26-11/VCST-5101/repro-coupon-product-types.csv` R1–R5, S4–S7

## Scope confirmation — 2026-06-10 xAPI matrix (11 cases, `tests/Sprint26-11/VCST-5101/repro-coupon-product-types.csv`)

- **Product-type-agnostic (R1–R4):** leak reproduces identically with simple physical, sale-priced variation parent, variation child, and configurable USD lines (+10% × PTS value in every case). Configurable + mixed cart is accepted by the platform, no rejection.
- **Selection-scoped — root cause confirmed (S6):** unselect the PTS line → coupon drops to exactly 10% × USD-only ($24 → $16); select only the PTS line → `discounts[]` empty ($0.00); re-select all → leak returns. The PTS value enters the base **iff the PTS line is selected** → the buggy base is `Cart.SubTotal` over **`SelectedLineItems` summed across currencies** (answers open question #2; fix = scope to selected primary-currency lines).
- **%-coupon path only (S1):** fixed-$ coupon `FIXED5` does NOT leak — flat $5 in USD, invariant to PTS presence/qty. Auto −20% promo scopes correctly (S2: PTS line discount 0). Per-bucket totals arithmetic is otherwise sound (S5: USD `total = subTotal − discount + tax` holds; only the embedded coupon value is inflated). `mergeCart` is currency-safe (S3).
- **Additive offset (S4/R5):** USD qty steps scale the coupon correctly (+10% × USD per step) while the leak stays a constant +10% × PTS value; PTS qty steps grow it linearly. Buckets remain independent.
- **Deletion recalculates the USD total (S7):** removing the PTS line from a coupon'd mixed cart drops the coupon $31 → $16 (−10% × PTS150) and moves the USD bucket total $154.80 → $172.80 (+$15 phantom discount + $3 tax echo at 20%). Per the AC, deleting a PTS line must not move USD totals at all — deletion is the membership-side mirror of the S6 unselect probe.
- Evidence: `reports/regression/graphql-evidence/R1…R5,S1…S7-*.json`. Repro suite: 12 runner-native cases.

## Severity rationale
High / revenue — real monetary miscalculation that **over-discounts** every mixed cart with a cart-% coupon (grows with PTS quantity); directly contradicts an explicit Task-1 acceptance criterion. Not gated at checkout (place-order enables), so it would reach order capture.

## Notes
- Scope: cart-subtotal **% coupon** path. Automatic % promotion scopes correctly (PTS discount = 0) — so the gap is specifically in the coupon/promotion discount-base summation, not the per-currency totals.
- Coverage gap: no regression case covered promotion/coupon on a mixed cart — recommend adding one alongside the fix.
