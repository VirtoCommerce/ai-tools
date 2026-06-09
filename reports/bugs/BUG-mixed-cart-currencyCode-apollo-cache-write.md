# BUG — Apollo "Missing field 'currencyCode'" warning on every add-to-cart (Mixed Cart) `[Low / cosmetic]`

**Env:** vcst-qa @ storefront theme `2.51.0-pr-2310-6b00d69d` (vc-frontend PR #2310) · XCart `3.1018.0-pr-120` · Cart `3.1005.0-pr-188` · Platform 3.1035.0
**Component:** vc-frontend (storefront client) — cart mutation cache write
**Related:** VCST-5101 (Loyalty Mixed Cart) · PR `VirtoCommerce/vc-frontend#2310` (author to fix)

## Summary
Every add-to-cart logs a client-side Apollo cache error #13 — `Missing field 'currencyCode' while writing result` — for the `LineItemType` being written. It is **non-fatal**: the cart, line items, and split-by-currency totals render and persist correctly. Root cause is entirely client-side in PR #2310 (cache write missing a newly-required field); the xAPI response is complete.

## STR
1. Sign in (any user; reproduces on USD-only adds too, not just Mixed Cart).
2. Open browser devtools console.
3. On a catalog page or PDP, click **Add to cart** on any product (product-card `AddToCartSimple` path).
4. Observe the console.

## Expected vs Actual
- **Expected:** add-to-cart writes the cart mutation result to the Apollo cache with no missing-field warnings.
- **Actual:** console logs, per added line item:
  `Invariant Violation: Missing field 'currencyCode' while writing result {…}` (Apollo error #13), e.g. for productIds `8b7282ad…` (USD) and `438dadc6…` (PTS). Cart still updates correctly.

## Root cause (verified — client-side, not backend)
- **xAPI is clean.** Live replay of the exact `updateCartQuantity` mutation (the `AddToCartSimple` path) on vcst-qa returns `currencyCode` **present, non-null, correct** for every item (`errors: null`):
  - `item 438dadc6 currencyCode="PTS"`, `item 0b6297e8 currencyCode="USD"`.
  - Apollo error #13 fires only when a *selected* field is `undefined` in the **object being written** — which cannot happen on a normal GraphQL network response (a selected scalar is always present, value or `null`). So the offending write is client-constructed, not the server payload.
- **Client cause.** PR #2310 added `currencyCode` to the shared fragments `core/api/graphql/cart/fragments/shortLineItem.graphql` and `fullCart.graphql`, so every normalized `LineItemType` cache entity now expects `currencyCode`. The add-to-cart path writes line items through the **client-side mutation batcher** (`useShortCart().updateItemCartQuantity` → `useMutationBatcher` + `getMergeStrategyUniqueBy`, in `shared/cart/composables/useCart.ts`); that interim/merged write builds LineItem objects **without** `currencyCode`. Apollo warns, then reconciles against the authoritative server response (which has the field) → harmless.

## Suggested fix (vc-frontend PR #2310)
Include `currencyCode` in the batcher's merged/optimistic `LineItemType` write so it mirrors the shared `shortLineItem` selection — or relax the cache field policy for `LineItemType.currencyCode` (mark optional). No backend/xAPI change needed.

## Telemetry (App Insights, vcst-qa, last 48h)
- **vcst-qa-storefront:** zero exceptions/traces matching `currencyCode` / "Missing field" / "writing result" / `cartTotals` — confirms the warning is console-only (Apollo dev `console.error`), not captured as a tracked exception → no user-facing impact. Telemetry is flowing (TypeError×29, ApolloError×8, etc. in window). The 8 `ApolloError`s are unrelated (6× `Failed to fetch` on `Matcher`, 1× 500 on `Matcher`, 1× `Failed to fetch` on `ListDetails`).
- **vcst-qa (backend):** zero exceptions matching `CartTotal` / `cartTotals` / `XCart` / `TotalsCalculator` — the per-currency totals calculator (Cart #188 / XCart #120) is running clean server-side.

## Severity rationale
Low / cosmetic — console noise only; no functional, data, or display impact (cart, line items, and per-currency totals all correct). Worth folding into PR #2310 before merge to keep the console clean and avoid masking real cache warnings.
