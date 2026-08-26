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

## Verification 2026-08-05 — FIX_INCOMPLETE (reopened)

Full RED→GREEN run completed. **The reported defect is fixed; the ticket is reopened for a second defect the fix leaves behind.**

**The reported defect: FIXED, 3/3 deterministic.**
- Phase A RED: 4/4 on the pre-fix build (Theme `2.55.0-pr-2412`) — `RemoveCoupon` fired first, `coupons:[]`, discount lost.
- Phase B GREEN: theme `2.55.0-pr-2422` confirmed live (footer version + entry bundle `index-ByEnEQVD.js`, deploy Action success 11:06:53Z). The working coupon survives: `coupons:[{ZUR10,isAppliedSuccessfully:true}]`, `discountTotal $50.00`, verified by an independent post-reload `GetFullCart`.
- **Strong fix variant** — `RemoveCoupon` is *absent from the wire*, not issued-and-undone. `vc-frontend#2422` moves `validateCartCoupon` ahead of the removal.
- Checklist 10/10, zero regressions, BL-CHK-006 verified on every response. Valid replacement still works in the new `Validate → Remove → Add` order, no stacking.

**Why reopened — the stale error never clears `[P3-ux]`.**
After the invalid apply, "This code is not valid" stays on screen permanently while the cart is perfectly healthy. `couponError` is a **module-scope** `ref` declared outside `useCoupon()`, so it outlives the component; its only reset is `clearError()` at the top of `applyCoupon`/`removeCoupon`, and **no component destructures or calls the exported `clearError`**. It therefore survives typing, blur, cart updates, and navigating away and back — clearing only on a later apply/remove or a page reload.
Byte-identical on `dev` and the fix branch, so **pre-existing** — but newly load-bearing: pre-fix the invalid apply also mutated the cart, so the error accompanied a real state change; post-fix a stale error is the *only* outcome the interaction produces. Established from source (operator accepted source evidence; no live re-run).
**Suggested minimal fix:** wire the exported `clearError` into the custom-code input's `@input` and clear on unmount, or move `couponError`/`loadingCouponCode` inside `useCoupon()`.

**Evidence:** `reports/tickets/Sprint26-15/VCST-5518/` — `evidence.html`, `verification-report.md`, `phase-a-baseline.md`, `verification-summary.json`.

**Two corrections to this report's own text below:**
- The STR's `QA`/`FriDAY` codes are not reachable on the environment — all 4 rendered presets validate `true` for a single-item >$1000 cart, so the invalid coupon must be a nonexistent code.
- The Notes claim that the "Custom code" input is `readonly` while a coupon is applied is **false** on this build. Triangulated as oracle drift, not a defect — BL-CART-009 corrected 2026-08-05 (`reports/knowledge/BL-AUDIT-2026-08-05.md`); the real binding locks that input only when its own value equals the applied code.

**Deploy note:** the environment is temporarily repinned to the `pr-2422` prerelease (`vc-deploy-dev#6295`, merged). Revert once a normal build carries the fix.

## Notes
- Found during VCST-5233 exploratory Save-for-Later testing (2026-06-12); confirmed with a dedicated single-scenario repro. Filed as **VCST-5518** (2026-07-21).
- **Consolidates** `reports/bugs/BUG-invalid-coupon-removes-valid-coupon.md` (regression case CART-015 / suite 028, typed-`FAKECODE`-over-`FIXED5` path). Same defect, same `applyCoupon()` root cause — one ticket (VCST-5518) covers both discovery paths.
- Related UX observation (separate, lower priority): while a coupon is applied, the single "Custom code" text input is `readonly` — a new *custom* code can't be typed until the current coupon is removed (available-coupon cards still apply/replace independently).

## Resolution
- **Fixed in:** `vc-frontend` — `client-app/shared/cart/composables/useCoupon.ts` › `applyCoupon()` was re-ordered to **validate-first** (fix option (a) proposed in this draft). Live on vcst-qa at Theme **`2.56.0-pr-2451-8ba8-8ba8bd04`** (draft reproduced on XCart `3.1020.0-pr-123-f160` / Theme `2.53.0`). Tracker **VCST-5518 → Done** (2026-08-12).
- **Source confirmation** (`vc-frontend@dev`, same file the RCA named), now carrying an explicit regression comment:

  ```ts
  // The new coupon is validated BEFORE the applied one is removed, so an invalid code can't
  // silently drop a working coupon (VCST-5518).
  const isValid = await validateCartCoupon(trimmed);
  if (!isValid) { setError({ code: trimmed, type: "invalid" }); return false; }
  if (appliedCouponCode.value && !isSameCouponCode(appliedCouponCode.value, trimmed)) {
    await removeCartCoupon(appliedCouponCode.value);
  }
  await addCartCoupon(trimmed);
  ```

- **Verified live:** 2026-08-26, backlog triage, playwright-chrome, signed in as `USER_EMAIL` on `/cart`.
  1. Cart with 1 × Coca Cola Cherry Can — subtotal **$45.00**.
  2. Applied valid coupon `@td(COUPON_LC_CASEFIDELITY.code)` (`agenttestlc062`, 5% off) → **Discount −$2.25**, Total **$51.30**, card flips to "Remove coupon".
  3. **Without removing it**, applied a never-before-tried invalid code `FAKECODE99`.
  - **Result:** `agenttestlc062` **still applied**, Discount **still −$2.25**, Total **still $51.30**; `FAKECODE99` shows inline "This code is not valid".
- **Network — the smoking gun is gone.** The draft's evidence was `RemoveCoupon` firing *before* `ValidateCoupon`. The invalid apply now fires **exactly one request** — `ValidateCoupon(coupon:"FAKECODE99")` — and **no `RemoveCoupon` at all**. The preceding valid apply fired `ValidateCoupon(agenttestlc062)` → `addCoupon(...)` → `coupons:[{code:"agenttestlc062", isAppliedSuccessfully:true}]`, i.e. validate-then-mutate in both paths.
- **Note:** confirmed at the UI **and** network layers, but this was a targeted re-verification, not a full `/qa-verify-fix` (no evidence.html, no tracker transition — VCST-5518 was already Done).
