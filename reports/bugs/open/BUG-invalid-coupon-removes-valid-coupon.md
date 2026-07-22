# Entering an invalid coupon removes the already-applied valid coupon `[P1]` `[BL-CART-003]`

> **CONSOLIDATED → [VCST-5518](https://virtocommerce.atlassian.net/browse/VCST-5518)** (filed 2026-07-21). Same defect as `reports/bugs/open/BUG-coupon-invalid-replacement-drops-working-coupon-VCST-5518.md` — both discovery paths (typed `FAKECODE`/CART-015 here; available-coupon card there) funnel through the same `useCoupon.ts › applyCoupon()` remove-before-validate root cause. Do not re-file; kept for CART-015 regression reference.

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Case:** CART-015 (suite 028)

## Summary
With a valid coupon `FIXED5` applied (Discount −$5.00), typing an invalid code (`FAKECODE`) and submitting **removes** the valid coupon: the storefront fires `RemoveCoupon(FIXED5)` *before* validating the new code, and never restores it when validation fails. The Discount reverts to $0.00 and only "This code is not valid" is shown. Applying an invalid coupon must not mutate existing cart discounts.

## Steps to Reproduce
1. Sign in and open `/cart` with a line item eligible for `FIXED5` (`@td` a known fixed-amount coupon).
2. Apply `FIXED5` → confirm the cart shows **Discount −$5.00**.
3. In the coupon field enter `FAKECODE` (an invalid code) and submit.
4. Watch the network panel and the cart totals.

## Expected vs Actual
- **Expected:** Validate the new code **first**; only replace/remove the existing coupon on success. An invalid code leaves `FIXED5` applied and the Discount at −$5.00, with an inline "not valid" message for the rejected code. (Validate-first, replace-on-success — BL-CART-003: applying a coupon must not silently drop existing valid discounts.)
- **Actual:** Network shows `RemoveCoupon(FIXED5)` (req 131) fired **before** `ValidateCoupon(FAKECODE)` (req 132). `FIXED5` is dropped and never re-applied; Discount reverts to **$0.00**; "This code is not valid" is displayed. The user silently loses a valid discount by mistyping one code.

![Valid coupon removed by an invalid coupon attempt](screenshots/CART-015-FAIL-coupon-removed-by-invalid-attempt.png)

## Impact
Revenue / customer-trust defect: a shopper who fat-fingers a second code loses the discount they had, with no indication it was removed. Confirmed at both the UI and the network layer. P1 per BL-CART-003 (`[P0-revenue]`).

## Root cause (hypothesis)
The storefront coupon-apply flow is implemented as remove-then-add: it optimistically removes the current coupon and then validates/adds the new one, with no rollback on validation failure. It should validate the incoming code first and only mutate the cart (remove old / add new) once the new code is confirmed valid.

## Fix Routing
- **Repo:** `vc-frontend` — storefront coupon apply flow (cart coupon composable/component that sequences `RemoveCoupon`/`ValidateCoupon`/`AddCoupon`).
- **Layer:** frontend. Reproduce as a vitest test on the coupon-apply logic (validate-first ordering; no removal on invalid); a green fix keeps the prior coupon applied when the new code is invalid. Preserve BL-CART-003.
