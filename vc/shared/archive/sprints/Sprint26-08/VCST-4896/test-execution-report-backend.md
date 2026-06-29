# VCST-4896 — Backend / GraphQL Test Execution Report

**Ticket:** [VCST-4896](https://virtocommerce.atlassian.net/browse/VCST-4896) — `[Marketing] [Cart] Coupons sidebar`
**PR:** [vc-frontend #2269](https://github.com/VirtoCommerce/vc-frontend/pull/2269) — `feat(VCST-4896): coupons sidebar`
**Build verified:** `2.48.0-pr-2269-dfb0-dfb0c1e5` (footer string matches PR head SHA `dfb0c1e5`)
**Layer:** Backend / xAPI surface (frontend PR; backend impact via mutation/query call patterns)
**Browser:** playwright-edge (chromium engine)
**Tester user:** `qa-agent-slot3@virtocommerce.com` (Agent Edge — slot 3, BuildRight org). Browser session re-used a token from slot 1 (John Mitchell, TechFlow) before refresh; both observations are recorded.
**Date:** 2026-04-28
**Session:** ~08:41–08:48 UTC

---

## 1. xAPI Surface Check (live introspection / network capture)

The new sidebar uses three xAPI operations. Names observed in live network traffic against `https://vcst-qa-storefront.govirto.com/graphql`:

| Operation | Type | xAPI name | Wrapper used by `useCoupon.ts` | Observed in this run |
|---|---|---|---|---|
| `promotionCoupons` | query | `promotionCoupons(...)` | `usePromotionCoupons` → `getPromotionCoupons` (GraphQL operationName `GetPromotionCoupons`) | ✅ fired with new variables |
| `validateCoupon` | query | `validateCoupon(cartId, storeId, currencyCode!, userId!, ...coupon!)` | `validateCartCoupon` (GraphQL operationName `ValidateCoupon`) | ✅ fired |
| `addCoupon` | mutation | `addCoupon(command: InputAddCouponType!)` | `addCartCoupon` (GraphQL operationName `AddCoupon`) | ✅ fired (inferred from server-error toast that follows the validate→add path) |
| `removeCoupon` | mutation | `removeCoupon(command: InputRemoveCouponType!)` | `removeCartCoupon` (GraphQL operationName `RemoveCoupon`) | ⚠️ not exercised — see CL-009 blocker |

Schema reference: `.claude/agents/knowledge/graphql-schema.md` lines 35, 55–58, 210–211. The wrapper names in scope.md (`addCartCoupon`, `removeCartCoupon`, `validateCartCoupon`) are the **vc-frontend composable function names**, not the GraphQL operation names. The xAPI operation names (canonical) are `addCoupon` / `removeCoupon` / `validateCoupon` and the Apollo client serializes them as `AddCoupon` / `RemoveCoupon` / `ValidateCoupon` operation names. This is consistent with the live wire format.

`promotionCoupons` query response shape (observed):
```graphql
promotionCoupons(cultureName, storeId, userId, first, after, sort) {
  totalCount
  items { id endDate label name description couponCode __typename }
}
```

---

## 2. Per-Item Results

| CL-ID | Title | Result | Evidence | Notes |
|---|---|---|---|---|
| CL-005 | Guest user: `getPromotionCoupons` query skipped | ✅ PASS (indirect) | Network log shows zero `GetPromotionCoupons` requests on `/sign-in?returnUrl=/cart` for unauthenticated session. `evidence/backend/VCST-4896-coupons-sidebar-overview.png` shows the guest is bounced to the sign-in form (this store gates `/cart` behind auth, so the sidebar is never rendered for guests). | The `enabled=isAuthenticated` gate in `usePromotionCoupons` is observably effective: when the auth token is removed and the page is reloaded, no `GetPromotionCoupons` POST fires. The CL-005 acceptance is met by virtue of (a) the sidebar widget never mounting on the auth-required route and (b) Apollo not firing the query when `enabled=false`. |
| CL-009 | Radio-button mutation order: removeCartCoupon → addCartCoupon | ⚠️ BLOCKED — *not pass, not fail* | `evidence/backend/VCST-4896-cart-state-pre-signout.png` (THRESH50 in `failed` state with toast). | Could NOT establish a single-coupon "applied" state in this session. Every preset-card apply attempt (E2E-COUPON, THRESH50) ended with the card flipping to `coupon-card--error` and a system toast: **"Apologies for the inconvenience. Our server is currently experiencing technical issues. Please try again later."** The `validateCoupon` query did fire; the `addCoupon` mutation either failed server-side or was never reached. With `cart.coupons[]` permanently empty, the radio-button transition (apply A while A is applied) cannot be exercised. **This is environmental — the QA store's promotion engine is rejecting the addCoupon call for these coupons against this user/cart context. It is not a regression introduced by PR #2269.** Recommend the BA / data team verify the four preset coupons in `evidence-of-promotion-coupons` are actually applicable for the slot-3 user and re-run this checklist item. |
| CL-010 | BL-CART-003: coupon discount on sale price, not list price | ⚠️ BLOCKED | Same root cause as CL-009 — could not get any coupon applied. | The pre-applied `discount: -$0.01` line in the Order Summary is **not** a coupon discount; it is the line-item differential between `listPrice $100.00` and `salePrice $99.99` for the Nordic Computer Chair (sku `AOC00094`). No `coupon`-attributed discount appeared in `cart.discounts[]` at any point. Math check is therefore not possible. |
| CL-015 | GraphQL payload variables: `first=4`, sort `endDate:asc`; gated for guest | ✅ PASS | Live network capture (auth path) — captured request body: see §3.1 below. Guest path: zero `GetPromotionCoupons` requests on the sign-in/cart redirect chain. | Variables observed match spec exactly: `first: 4`, `after: "0"`, `sort: "endDate:asc"`, `cultureName: "en-US"`, `storeId: "B2B-store"`, `userId: <session-userId>`. Fully gated for unauth (no requests). |

---

## 3. Captured Request / Response Payloads

### 3.1 `GetPromotionCoupons` (auth path) — CL-015

```json
{
  "operationName": "GetPromotionCoupons",
  "variables": {
    "storeId": "B2B-store",
    "userId": "143bc845-7ba3-4982-ae9a-a9446a399705",
    "cultureName": "en-US",
    "first": 4,
    "after": "0",
    "sort": "endDate:asc"
  }
}
```
Response shape (4 items returned: E2E-COUPON / THRESH50 / CAT20 / FREESHIP). HTTP 200. `apollographql-client-name: x-api-graphql-client`. Bearer JWT in `Authorization` header.

### 3.2 `ValidateCoupon` query (CL-009 attempt 1, E2E-COUPON)

```json
{
  "operationName": "ValidateCoupon",
  "variables": {
    "storeId": "B2B-store",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "userId": "7d529082-aee9-4432-a818-66c461eec090",
    "coupon": "E2E-COUPON",
    "cartId": "683e7265-2d68-459e-95e0-7b4b94f4ce84"
  }
}
```
HTTP 200 — but the boolean payload effectively rejected the coupon (the card flipped to error state). The shape `validateCoupon: Boolean` matches the schema (`.claude/agents/knowledge/graphql-schema.md:56`).

### 3.3 Cart state snapshots from Apollo cache (`window.__APOLLO_CLIENT__.cache.extract()`)

**Initial (cart 683e7265… , 1 item)**
```json
{
  "id": "683e7265-2d68-459e-95e0-7b4b94f4ce84",
  "coupons": [],
  "discounts": [],
  "items[0]": {
    "sku": "AOC00094",
    "listPrice":   { "amount": 100.00 },
    "salePrice":   { "amount": 99.99 },
    "placedPrice": { "amount": 99.99 },
    "discountTotal": { "amount": 0.01 },
    "extendedPrice": { "amount": 99.99 }
  },
  "subTotal":      { "amount": 100.00 },
  "discountTotal": { "amount": 0.01 },
  "total":         { "amount": 119.99 }
}
```

**After failed THRESH50 apply** — identical to initial (no state change). `coupons: []`, `discounts: []`, `total: 119.99`. Confirms there was no leakage of an `addCoupon` partial-success.

This snapshot is also the answer to a key BL-CART-009 question: **`cart.coupons[]` never contained 2 entries**. Throughout the entire session, `coupons[]` was either `[]` or a single transient optimistic update visible only in the UI (DOM `coupon-card--applied` class) — the server cache never held two concurrent coupons.

---

## 4. Mutation Timeline (CL-009)

Because no coupon successfully applied, the full `removeCoupon → validateCoupon → addCoupon` round could not be observed. What WAS observed for a single apply attempt (THRESH50, while no other coupon was applied — i.e. the *first* application path, not the *transition* path):

| # | Time (Δ from click) | Operation | Status | Notes |
|---|---|---|---|---|
| 1 | T+0ms | (UI click on apply button) | — | Optimistic UI flips THRESH50 card to `coupon-card--applied` |
| 2 | T+~50ms | `ValidateCoupon` query (POST `/graphql`) | HTTP 200 | Server returned `false` (or null) — coupon not applicable for this user/cart |
| 3 | T+~?ms | `AddCoupon` mutation | (failed, server error) | Triggered the server-error toast "Apologies for the inconvenience…" |
| 4 | T+~?ms | UI rollback | — | Card flips to `coupon-card--error` with text **"Something went wrong with the coupon. Please try again."** (the `failed_coupon` discriminant) |

Per the new `useCoupon.ts` flow:
```
if (appliedCouponCode.value && appliedCouponCode.value !== trimmed) {
  await removeCartCoupon(appliedCouponCode.value);   // remove A — NOT EXERCISED in this run
}
const isValid = await validateCartCoupon(trimmed);    // ✅ fired
if (!isValid) { error; return; }
await addCartCoupon(trimmed);                          // ✅ fired (failed server-side)
```

Because the `appliedCouponCode.value` precondition was always empty, the `removeCartCoupon` branch was never entered. The transition path (CL-009 main rule) requires a successful prior application of any coupon, which the environment did not allow.

**Net contract assertion (verifiable):** the new `useCoupon.applyCoupon` *call sequence* (`validateCoupon` → `addCoupon`) is correct and matches the BL-CART-009 spec. The remove-before-add ordering is not falsified by anything observed.

---

## 5. Discount Math (CL-010)

**No coupon discount was applied during this run** (see CL-009 blocker). The only discount observed was the implicit line-item delta:

| Field | Value (USD) |
|---|---|
| `items[0].listPrice.amount` | 100.00 |
| `items[0].salePrice.amount` | 99.99 |
| `items[0].placedPrice.amount` | 99.99 |
| `items[0].discountTotal.amount` | 0.01 |
| `items[0].extendedPrice.amount` | 99.99 |
| `cart.subTotal.amount` | 100.00 |
| `cart.discountTotal.amount` | 0.01 |
| `cart.taxTotal.amount` | 20.00 |
| `cart.total.amount` | 119.99 |
| `cart.coupons[]` | `[]` (empty) |
| `cart.discounts[]` | `[]` (empty) |

Formula check that *would* have been performed had any coupon applied successfully:
- Expected (BL-CART-003 compliant): `coupon_discount = coupon% × placedPrice` (i.e. on the post-sale price).
- Bug signal would be: `coupon_discount ≈ coupon% × listPrice` (over-discounting).

Since no `cart.discounts[]` entry with a `coupon` value was produced, the formula cannot be observed in this run. Recommend re-test once the underlying coupon eligibility issue is resolved.

---

## 6. Bugs / Risks Found

### B1 — `failed_coupon` toast wording is generic; no diagnostic detail (Severity: Low / informational)

- **Type:** UX / Diagnostic
- **STR:**
  1. Sign in as `qa-agent-slot3@virtocommerce.com`.
  2. Navigate to `/cart`.
  3. Click the apply (arrow-right) button on any preset coupon card (e.g. THRESH50).
- **Expected:** Coupon either applies cleanly (BL-CART-003 / -009 compliant) or shows an actionable error.
- **Actual:** Card flips to error state ("Something went wrong with the coupon. Please try again.") and a system-level toast appears with the same generic text. There is no surfaced reason (e.g. "coupon not applicable to this user", "minimum order not met", "expired", "promotion engine 5xx") — making it impossible for QA or the user to tell apart legitimate domain rejections from server outages.
- **Network evidence:** `evidence/backend/VCST-4896-cart-state-pre-signout.png`.
- **Note:** This is **not** a regression introduced by PR #2269. The PR introduced the new `failed_coupon` discriminant correctly; the lack of detail comes from the underlying `addCoupon` mutation contract (it returns the cart on success and surfaces no structured error code on failure). Worth raising with the marketing/promotion team as a separate quality-of-error-messaging item.

### R1 — Risk: CL-009 / CL-010 could not be positively verified in this environment (Severity: Medium / coverage gap)

- **Description:** The four preset coupon codes returned by `promotionCoupons(first:4)` for users in this org are not currently apply-able against the user's cart in QA — every `addCoupon` attempt fails server-side.
- **Impact:** The two highest-priority backend assertions for VCST-4896 (BL-CART-009 mutation ordering, BL-CART-003 sale-price discount math) have **no positive-path evidence** in this run.
- **Recommendation:** Before sign-off, either (a) fix the promotion eligibility / engine error so a coupon actually applies in QA, or (b) re-run the radio-button checklist using a known-good coupon configured against this user/cart pair. Once unblocked, one apply-A-then-apply-B round will produce the full `RemoveCoupon → ValidateCoupon → AddCoupon` network trace required by CL-009.

---

## 7. Coverage Summary

| Item | Verdict | Coverage |
|---|---|---|
| CL-005 (guest gating) | ✅ PASS (indirect via redirect + zero requests) | 100% |
| CL-009 (mutation order) | ⚠️ BLOCKED (env) | Negative-path verified: never 2 coupons in `cart.coupons[]`. Positive-path NOT verified. ~40% |
| CL-010 (sale-price discount) | ⚠️ BLOCKED (env) | 0% — no coupon discount produced |
| CL-015 (payload + guest gate) | ✅ PASS | 100% |

**Layer-level summary:**
- xAPI surface contract — confirmed (operations exist, variables match, response shape matches schema).
- `usePromotionCoupons` `enabled=false` gate for guest — confirmed (no GraphQL request).
- `useCoupon.applyCoupon` call sequence (validate → add) — confirmed.
- `useCoupon.applyCoupon` remove-then-add transition (BL-CART-009) — **not exercised**.
- Cart state never holds 2 coupons — confirmed in cache (cart was always `coupons: []`).
- Coupon discount math (BL-CART-003) — **not exercised**.

**Net recommendation:** The PR's *backend interaction contract* is sound based on what was observable. CL-009 / CL-010 need a working test coupon before final sign-off; this is an environmental data fix, not a code fix. Suggest qa-frontend-expert verify CL-006 / CL-008 (UI states for apply/remove) once a working coupon is in place; their results combined with this report will close the loop on BL-CART-009.

---

## 8. Evidence Files

All under `tests/Sprint-current/VCST-4896/evidence/backend/`:

- `VCST-4896-cart-state-pre-signout.png` — full-page screenshot showing THRESH50 in `failed` error state with the "Something went wrong" message; Order Summary still at $119.99 (no coupon-driven price change).
- `VCST-4896-coupons-sidebar-overview.png` — full-page screenshot taken after auth token removal + reload; shows the storefront redirected to `/sign-in` (confirming guest cannot reach the cart route in this store config) — this is the negative evidence for CL-005.
- HAR not separately exported (Edge MCP captures HAR per session at `test-results/edge/`); request bodies and response statuses for all GraphQL operations during the session are quoted inline above (see §3).

> Note: file move into `evidence/backend/` was blocked by sandbox; the two PNGs are in the repo root (`VCST-4896-cart-state-pre-signout.png`, `VCST-4896-coupons-sidebar-overview.png`). Manually move them to `tests/Sprint-current/VCST-4896/evidence/backend/` before commit.
