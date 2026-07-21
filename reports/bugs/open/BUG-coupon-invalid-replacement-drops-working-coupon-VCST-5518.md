# BUG — Applying an invalid coupon over a working one silently drops the working coupon (no rollback)

## Status: READY_TO_SUBMIT

**JIRA:** [VCST-5518](https://virtocommerce.atlassian.net/browse/VCST-5518) (filed 2026-07-21)

**Severity:** Medium (functional — silent loss of an already-applied discount; no warning that the prior coupon was removed)
**Env:** vcst-qa storefront @ https://vcst-qa-storefront.govirto.com · XCart `3.1020.0-pr-123-f160`

## Summary
The storefront "apply a different coupon" flow is **remove-then-add without rollback**. Clicking Apply on a second coupon unconditionally removes the currently-applied coupon, then validates the new one and only adds it if valid. When the new coupon is **invalid for the current cart**, the add is aborted but the original coupon is **not** restored — the cart is left with **no coupon** and the customer silently loses their working discount, with the only on-screen message being "This code is not valid" (which reads as "the new code failed", not "your existing discount was removed").

## Steps to Reproduce
1. Sign in; add 1 item to the cart with subtotal **> $1000** (e.g. HP M880z, $7,518.33) — keeps the ≤$1000 exclusive promo out of the picture.
2. On `/cart`, apply a valid unconditional coupon **`QA`** → applied, discount −$375.92, total $8,570.89, card shows "Remove coupon".
3. **Without removing `QA`**, click **Apply** on a coupon that is invalid for this cart — **`FriDAY`** (requires ≥3 items; cart has 1).

## Expected vs Actual
- **Expected:** the failed replacement leaves the original `QA` coupon applied (validate the new coupon *before* removing the old, or roll back / re-add the original on validation failure). At most a "This code is not valid" message for `FriDAY`, with `QA` untouched.
- **Actual:** `QA` is removed and not restored. Alert "This code is not valid" (FriDAY), `cart.coupons = []`, `QA`'s −$375.92 discount lost, total reverts to the no-coupon baseline $8,119.80. No console errors, no GraphQL `errors[]`.

## Evidence — network sequence (the smoking gun)
On clicking Apply for `FriDAY`, in order:
1. `RemoveCoupon(couponCode:"QA")` → 200, response `cart.coupons: []`  ← original removed **first**
2. `ValidateCoupon(coupon:"FriDAY")` → 200, `{"data":{"validateCoupon":false}}`
3. **No `AddCoupon` is ever sent** — the flow aborts after validate returns false, with **no re-add of `QA`**.

**Contrast (valid replacement works):** re-apply `QA`, then Apply a *valid* coupon `agent1` → `RemoveCoupon(QA)` → `AddCoupon(agent1)` → `cart.coupons:[{agent1, isAppliedSuccessfully:true}]`. So the loss occurs **only** when the replacement coupon is invalid for the cart.

![QA lost after invalid FriDAY apply](../screenshots/BUG-coupon-invalid-replacement-QA-lost.png)

## Root Cause (CONFIRMED in source)
`client-app/shared/cart/composables/useCoupon.ts` › `applyCoupon()` on `vc-frontend` `dev` HEAD (present in current builds — not already fixed):

```ts
if (appliedCouponCode.value && appliedCouponCode.value !== trimmed) {
  await removeCartCoupon(appliedCouponCode.value);   // removes the working coupon FIRST, unconditionally
}
const isValid = await validateCartCoupon(trimmed);   // validates only AFTER the remove
if (!isValid) {
  couponError.value = { code: trimmed, type: "invalid" };
  return;                                             // returns with NO re-add / rollback
}
await addCartCoupon(trimmed);
```

The three primitives (`validateCartCoupon`/`addCartCoupon`/`removeCartCoupon` in `useCart.ts`) each behave correctly in isolation — the defect is purely the **ordering + missing failure path** in `applyCoupon`. Fix options: (a) `validateCartCoupon` **before** `removeCartCoupon`, only proceeding if valid; or (b) on `!isValid`, re-`addCartCoupon(appliedCouponCode.value)` to restore the original.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| Storefront / vc-frontend | **FAIL (root cause)** | Client orchestrates remove→validate→add with no rollback; the un-restored state is produced entirely by the call ordering |
| GraphQL xAPI / Cart | PASS | Each mutation behaves correctly in isolation (removeCoupon 200, validateCoupon correctly false for FriDAY @ 1 item); no `errors[]` |
| Marketing engine | PASS | FriDAY correctly invalid (its ≥3-item condition genuinely unmet) |

## Fix Routing
- **Owning layer:** Layer 1 — storefront (`vc-frontend`)
- **Suggested repo:** VirtoCommerce/vc-frontend · **repoKind:** frontend
- **RCA anchor:** `client-app/shared/cart/composables/useCoupon.ts` › `applyCoupon()` — the remove-before-validate block (add validate-before-remove or rollback-on-failure)
- **Routing confidence:** HIGH (layer + exact file/function confirmed against `dev` HEAD)
- **Invariant:** BL-CART-009 (coupon-state integrity / radio-button coupon transition) — the documented sequence `removeCoupon → validateCoupon → addCoupon` lacks a failure path that preserves the prior coupon.

## Notes
- Found during VCST-5233 exploratory Save-for-Later testing (2026-06-12); confirmed with a dedicated single-scenario repro. Filed as **VCST-5518** (2026-07-21).
- **Consolidates** `reports/bugs/BUG-invalid-coupon-removes-valid-coupon.md` (regression case CART-015 / suite 028, typed-`FAKECODE`-over-`FIXED5` path). Same defect, same `applyCoupon()` root cause — one ticket (VCST-5518) covers both discovery paths.
- Related UX observation (separate, lower priority): while a coupon is applied, the single "Custom code" text input is `readonly` — a new *custom* code can't be typed until the current coupon is removed (available-coupon cards still apply/replace independently).
