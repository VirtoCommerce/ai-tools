# BUG: `/account/coupons` copies coupon code force-uppercased → rejected as invalid on `/cart`

## Status: FIXED

## Resolution
- **Fixed in:** vc-module-x-cart PR #123 (`CartAggregate.cs` — `ValidateCouponAsync` + `Coupons` getter now compare entered-vs-stored coupon codes via `EqualsIgnoreCase`). Deployed build **VirtoCommerce.XCart 3.1020.0-pr-123-f160**.
- **JIRA:** VCST-5233.
- **Verified:** 2026-06-12 via `/qa-verify-fix` (live, G6) — STR 3/3, coupon `QA` entered `qa`/`Qa`/`qA`/`QA` all apply the identical discount; `validateCoupon`→true & `isAppliedSuccessfully`→true for all casings; invalid code still rejected. Evidence: `tests/Sprint26-11/VCST-5233/`.
- **Note:** verified via the equivalent `QA` coupon (not the original `agent` coupon) — an exclusive sub-$1000 store promotion (`[E2E Test] Cart subtotal specific discount`) suppresses all coupons on small carts; verification used a >$1000 cart. PR #123 remains open/unmerged pending human review.

**JIRA:** [VCST-5233](https://virtocommerce.atlassian.net/browse/VCST-5233)
**Severity:** Medium (functional — customers cannot redeem their own coupons via the copy flow)
**Env:** vcst-qa storefront @ vc-frontend `2.51.0-pr-2310-eb35aebf` (PR #2310)

## Summary
On `/account/coupons` every coupon code is rendered and copied **force-uppercased** (`coupon.couponCode?.toUpperCase()`). The xAPI `validateCoupon` query is **case-sensitive**, so when a coupon is stored in lowercase/mixed case (e.g. `agent`), the "Click to copy" button puts `AGENT` on the clipboard, and pasting + applying it on `/cart` is rejected with **"This code is not valid"**. Only coupons whose stored code is already all-uppercase are unaffected.

## Steps to Reproduce
1. Admin: a promotion exists with coupon stored lowercase `agent` (25% off cart) — *(precondition, "Agent Case Test")*.
2. Storefront: sign in, add items to cart.
3. Go to `/account/coupons`, find **Agent Case Test** → the code shows as `AGENT`. Click **Click to copy**.
4. Go to `/cart` → **Custom code** field → Ctrl+V (pastes `AGENT`) → **Apply**.

## Expected vs Actual
- **Expected:** The copied code matches the stored coupon and applies the 25% discount.
- **Actual:** Field receives `AGENT`; Apply → alert **"This code is not valid"**, Apply button disabled, no discount.

**Control test (proves it's case, not a broken coupon):** applying the lowercase `agent` (the cart's own prefilled value) succeeds — Discount −$66.00 → −$132.00 (the +$66 = 25% × $264 subtotal), Total $316.80 → $237.60.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `coupon-item.vue` displays + copies `couponCode.toUpperCase()`; pasted `AGENT` → "This code is not valid". Screenshot: `BUG-coupon-uppercase-account-coupons.png` |
| 2. Backend Admin | PASS | Coupon stored correctly as `agent` (lowercase) |
| 3. GraphQL xAPI | PASS (deterministic) | `ValidateCoupon coupon:"AGENT"` → `{"validateCoupon":false}`; `coupon:"agent"` → `{"validateCoupon":true}` — case-sensitive, consistent |
| 4. Platform REST API | N/A | Not exercised |

**Owning layer:** Layer 1 — vc-frontend. The data is stored and matched correctly; only the storefront mangles the code on display/copy.

## Root Cause
`client-app/shared/account/components/coupon-item.vue` applies `.toUpperCase()` to the coupon code in **both** the copy handler and the displayed value:

```vue
<button ... @click="copyCoupon(coupon.couponCode?.toUpperCase())">
  <span class="coupon-item__code-value">{{ coupon.couponCode?.toUpperCase() }}</span>
```
(plus `&__code-value { @apply ... uppercase; }` in `<style>`).

Coupon codes are case-sensitive end-to-end (`validateCoupon`), so uppercasing the copied value guarantees a mismatch for any non-uppercase stored code. Minimal fix: copy/display `coupon.couponCode` verbatim (drop `.toUpperCase()` in both places and the `uppercase` utility class). *(Alternative: make `validateCoupon`/coupon matching case-insensitive in the backend — larger blast radius, not preferred.)*

Note: the `/cart` "Discount & coupons" prefilled suggestions render the true stored case (`agent`, `wine-gift`, `code`) and apply correctly — confirming the defect is isolated to the coupons-list component, not the cart.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Component / module:** `client-app/shared/account/components/coupon-item.vue` (account coupons list / "Coupons & promotions")
- **RCA anchor:** `coupon-item.vue` — `copyCoupon(coupon.couponCode?.toUpperCase())` and `{{ coupon.couponCode?.toUpperCase() }}`; `.coupon-item__code-value { @apply ... uppercase }`
- **Routing confidence:** HIGH
