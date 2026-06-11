# BUG — Loyalty Mixed Cart: Apollo `currencyCode` MissingFieldError on every cart write → console-error storm + stale Order Summary total `[Medium / cart cache integrity]`

## Status: CONFIRMED — filed as VCST-5238

**JIRA:** VCST-5238 (Bug, Medium, project VCST; filed 2026-06-10, Relates to VCST-5101)
**Env:** vcst-qa storefront @ theme `2.51.0-pr-2310-eb35` · Platform 3.1035.0 · XCart 3.1018.0-pr-120 · store B2B-store · loyalty mode "Mixed Cart" (PTS) · user `@td(LOYALTY_VIP_USER)` · Browser: Edge (playwright-edge)
**Feature:** VCST-5101 Loyalty Mixed Cart (new mixed-currency cart UI)
**Layer:** Frontend — vc-frontend (Apollo cache). Backend xAPI is correct.

## Summary
With the store in loyalty **"Mixed Cart"** mode, **every** cart line-item write throws an Apollo `MissingFieldError` (code 13) — *"Can't find field 'currencyCode' on object {LineItemType…}"* — on **add-to-cart** (loyalty PTS **and** regular USD products) and on **select/unselect**. The server returns `currencyCode` correctly (HTTP 200, no `errors[]`); the failure is purely client-side Apollo cache normalization. The user-visible consequence: after unselecting all items in a mixed cart, the USD Order Summary keeps a **stale Total = $180.00 / Tax = +$30.00** while Subtotal, Discount and Shipping rows correctly read $0.00 — because the broken cache write prevents the cart from reconciling with the server's zeroed totals.

## STR
**A — Console error on every add (broadest symptom):**
1. Sign in as `@td(LOYALTY_VIP_USER)`; loyalty mode = "Mixed Cart". Start from a clean cart; open DevTools console.
2. From `/loyalty-catalog`, add a PTS product via "+". → console emits the `currencyCode` code-13 error immediately; item still lands in cart.
3. From `/catalog`, add a regular USD product via "+". → **same** code-13 error fires (for both line items). Not PTS-specific.

**B — User-visible stale total:**
4. With a mixed cart (USD + PTS) on `/cart`, select a delivery method (e.g. Fixed Rate, +$150 → Total $328.80).
5. Unselect **all** line items → console error repeats; Order Summary keeps **Total $180.00 / Tax +$30.00** while line rows read $0.00.

## Expected vs Actual
- **Expected:** cart line-item writes complete without cache errors; with zero items selected every Order Summary value (incl. Total + Tax) reads 0.00.
- **Actual:** `MissingFieldError` code 13 on every add/select/unselect; grand Total stays $180.00 / Tax +$30.00 after unselect-all, contradicting its own $0.00 rows.

| Order Summary row | Before unselect | After unselect | Expected |
|---|---|---|---|
| Subtotal / Discount / Shipping (USD) | $155 / −$31 / +$150 | $0.00 ✓ | 0.00 |
| Tax (USD) | +$54.80 | **+$30.00** ✗ | 0.00 |
| **Total (USD)** | $328.80 | **$180.00** ✗ | 0.00 |
| PTS Subtotal / Total | PTS80 | PTS0.00 ✓ | 0.00 |

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | code-13 `currencyCode` error on every cart write; stale $180/$30 Order Summary |
| 2. Backend Admin | N/A | not exercised |
| 3. GraphQL xAPI | **PASS** | `addItem`/`updateCartQuantity`/`unSelectCartItems` all HTTP 200, **no `errors[]`**, responses carry `currencyCode` (USD + PTS) and zeroed totals after unselect |
| 4. Platform REST API | N/A | xAPI already correct |

**Owning layer:** Layer 1 — Storefront frontend (vc-frontend). Backend is correct; the client cannot normalize/read its own cache.

## Evidence
- `tests/Sprint26-11/VCST-5101/screenshots/mixed-cart-unselect-all-shipping-leak.png` (stale Total $180 / Tax +$30, rows $0.00)
- `tests/Sprint26-11/VCST-5101/screenshots/mixed-cart-before-unselect-shipping-selected.png` (context)
- **Console (load-bearing):** Apollo Client `3.14.1`, **`message: 13` MissingFieldError**, source `assets/vendor-*.js`. Decoded payload at add-to-cart:
  `["currencyCode", { "__typename":"LineItemType", "id":"…", "productId":"a41f9ec1-…", "quantity":1, "sku":"" }]`
  — identical signature on PTS add, USD add, and unselect.
- Two-source confirmed: UI repro + GraphQL network capture.

## Root Cause (CONFIRMED in source — vc-frontend)
Classic Apollo "field added to the read selection but not to the optimistic writes." The deployed VCST-5101 Mixed Cart build **selects `currencyCode` on cart line items** (needed to bucket USD vs PTS for the "Total in PTS" block — the live code-13 error proves this read is active, and the wire response carries the field). But the two client-side cache **writers** still emit `LineItemType` objects **without** `currencyCode`:

1. **Add / update-quantity path** — `client-app/core/api/graphql/config/links/utils.ts` → `handleOptimisticResponseUpdateCartQuantity()` builds each optimistic line item as exactly `{ __typename:"LineItemType", id, productId, quantity, sku }` (its `ItemResultType`). This shape **matches the console error payload byte-for-byte** → fires on every add-to-cart.
2. **Select / unselect path** — `client-app/shared/cart/composables/useCart.ts` → `updateSelectionCache()` rewrites items through the minimal `CartItemsSelectionFragment` (`items { id selectedForCheckout }`) → fires on unselect.

With `CartType.items` configured `{ merge: false }` (`client-app/core/api/graphql/config/cache.ts`), these partial writes leave the normalized `LineItemType` without the `currencyCode` the active read requires, so the next cache read throws `MissingFieldError`, the cart read aborts, and the reactive `cart` never picks up the server's zeroed totals → stale Order Summary.

> The original "backend shipping not gated by selection" hypothesis is **disproved** by Layer 3: the xAPI returns all totals = $0.00 after unselect. Purely client-side.

## Suggested Fix (single repo: vc-frontend)
Add `currencyCode` to **both** optimistic writers so they match the read selection: the `ItemResultType` / line-item objects built in `handleOptimisticResponseUpdateCartQuantity` (utils.ts), and the `CartItemsSelectionFragment` in useCart.ts. Keep all cart line-item selections + optimistic writes in sync on `currencyCode` (the canonical fragment, the optimistic builders, and the selection fragment). Add a test that adds a line item with loyalty Mixed Cart mode on and asserts no Apollo `MissingFieldError` + that totals reconcile after unselect-all.

## Severity rationale
Medium — pervasive cart **cache** defect: a console error on **every** add/select/unselect for any store in loyalty Mixed Cart mode, plus a visibly wrong, internally-inconsistent grand Total after unselect-all. Not order-capture risk: backend totals are correct and `hasOnlyUnselectedLineItems` disables checkout when nothing is selected. The error frequency + trust impact on a brand-new feature argue for prompt fix; the single missing field makes it cheap.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront (vc-frontend)
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** `frontend`
- **Component / module:** Apollo cart cache — optimistic line-item writers vs. `currencyCode` read selection (loyalty Mixed Cart)
- **RCA anchors:** `client-app/core/api/graphql/config/links/utils.ts` → `handleOptimisticResponseUpdateCartQuantity` (`ItemResultType` omits `currencyCode`); `client-app/shared/cart/composables/useCart.ts` → `updateSelectionCache` / `CartItemsSelectionFragment`; `client-app/core/api/graphql/config/cache.ts` → `CartType.items { merge: false }`. Console: Apollo code 13 `"Can't find field 'currencyCode'"`.
- **Routing confidence:** HIGH — layer proven by Layer-3 capture; the add-path optimistic builder's object shape matches the error payload exactly. (Source read against `dev`; deployed `pr-2310` adds the `currencyCode` read selection that surfaces it — the fix must align all three write/read sites.)
