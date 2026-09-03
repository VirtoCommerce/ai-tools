# Compare v2 — the compare list survives sign-out and is readable by the next user of the browser — P3

## Status: CONFIRMED
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-015, CMP-028) · IN-SCOPE
**Archetype:** `SCOPE`

**Severity:** Low/P3 · **Type:** Client state scope · **BELOW the 5d severity floor — not filed**

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (PR #2452, open), Platform `3.1063.0`.

## Summary
A compare list built while signed in **survives sign-out**. After logging out, `/compare` still renders
the same products, prices and rows, and the list carries forward anonymous → signed-in unchanged. Nothing
clears `localStorage["compareProducts"]` on either transition.

## Steps to Reproduce
1. Sign in, add 2+ products to compare, open `/compare`.
2. Sign out (in this tab or another — cross-tab sync is live).
3. Reload `/compare`.

**Expected:** stated behaviour either way. **Actual:** the previous user's selection is fully readable.

## Why this is Low
Compare is anonymous-capable by design and holds only **public catalog data** — no prices private to an
org, no personal data. On a shared machine the next user sees what the previous one was considering,
which is a privacy wrinkle rather than a leak. Graded P3, therefore not filed.

## The related case that is NOT low, and is filed separately
The same mechanism means the list does not swap on an **organization** switch, where prices *are*
org-specific — that is `BL-CROSS-008` territory and is covered by CMP-015. This report is only the
sign-out half.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront · **repoKind:** frontend · **Repo:** `VirtoCommerce/vc-frontend`
- **Component:** `client-app/shared/compare/composables/useCompareProducts.ts`
- **RCA anchor:** `useLocalStorage(COMPARE_PRODUCTS_LOCAL_STORAGE)` with no sign-out/org-change subscriber
- **Routing confidence:** MEDIUM — whether it *should* clear is a product decision, not a defect call
