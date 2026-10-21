# BUG: [GA4][Catalog] Category infinite scroll: each page's view_item_list repeats every product already shown — Medium

## Status: FIXED
**Found by:** agent — testing VCST-6398

## Resolution
- **Fixed in:** VirtoCommerce/vc-frontend#2594 (head 5ab19015, open at verification; vc-frontend-next picks it up through the release merge)
- **Tracker:** VCST-6453 (Tested)
- **Verified:** 2026-10-21, pre-merge on the PR build `2.61.0-pr-2594-5ab1-5ab19015` (local frontend-only stand, API -> vcst-qa); RED baseline on vcst-qa `2.61.0-pr-2570-5cc5`
- **Verification method:** /qa-verify-fix VCST-6453 (STR 3/3) - `reports/tickets/Sprint26-21/VCST-6453/verification-summary.json`
- **Open notes:** `index` restarts at 0 per page event (product decision); re-check on a shared stand after deploy
**Found by:** agent — testing VCST-6398
**Tracker:** [VCST-6453](https://virtocommerce.atlassian.net/browse/VCST-6453) (standalone Bug, relates to VCST-6398; labels found-by-agent, found-in-testing; auto-fix labels withheld — vc-frontend-next is not in the /qa-fix allowed repo set)

**Severity:** Medium (P2) · **Type:** Functional / analytics payload · **Relationship:** found while testing VCST-6398; not introduced by it
**Env:** vcst (`{{FRONT_URL}}`), guest, playwright-firefox 1920x1080, 2026-10-20
**Build:** theme vc-frontend-next `3.1.0-pr-11-d67b-d67b0e0a` · platform 3.1086.0-pr-3139-5d63
**Oracle:** VirtoOZ StorefrontDeveloperGuide "Google Analytics events" (`view_item_list` = the products in the list); BL-GA4-001 (item schema — holds) · **Relates:** VCST-6099, VCST-6100 (other GA list defects, different paths)

## Summary
On a category page, each infinite-scroll load sends `view_item_list` with `item_list_id category_<slug>_page_<N>` whose `items[]` is the whole accumulated grid (pages 1..N, `index` restarting at 0), not the products that page added. Page-1 impressions are reported again on every later page, so impression counts and positions are wrong.

## Preconditions
Guest; a category with more than one page of products (e.g. /printers, /accessories); GA4 tracking enabled on the store.

## Steps to reproduce
1. Open `/printers` and note the `view_item_list` `category_printers_page_1` in `window.dataLayer`.
2. Scroll to the bottom (End key) until page 2 loads.
3. Read the `category_printers_page_2` event's `items`.
4. Repeat on `/accessories` to page 3.

## Expected
Each page event carries only the products that page added, with positions continuing the list.

## Actual
- /printers: page_1 has 15 items; page_2 has 21 — the same 15 page-1 ids at index 0–14, then the 6 new items (3/3 attempts).
- /accessories: page 1 = 18, page 2 = 36, page 3 = 54 items; each event starts with the previous event's full list.
- The page-2 `SearchProducts` response holds only the new page — the duplication is in the storefront.

![Printers page 2 loaded](../../screenshots/GA4-Category-Infinite-Scroll-View-Item-List-Repeats-Previous-Pages/X4-printers-page2-loaded.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | `reports/tickets/Sprint26-21/VCST-6398/evidence-X4/network/datalayer-view_item_list-attempt*.json`; HAR `results/VCST-6398/har/X4-investigate-firefox.har` |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | PASS | page-2 `SearchProducts` returns only the next page (`evidence-X4/network/page2-searchProducts-response.json`) |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
- `client-app/shared/catalog/components/category.vue:628`, `changeProductsPage()`: `analytics("viewItemList", products.value, categoryListProperties.value)`.
- `products.value` is the whole grid: `useProducts.ts` `fetchMoreProducts()` (L492) does `products.value.concat(items)`.
- Not the dom-analytics engine (vc-frontend #2543): the category grid has no `data-vc-track="product-list"` container.
- Same call on vc-frontend-next `dev` and PR #11 head (L628) and upstream vc-frontend 2.40.0–2.60.0.
- Incidental (not investigated): page-2 `SearchProducts` repeated one page-1 product and `totalCount` moved 21 → 24 with `sort:""`.
- kb: KB-CCFCAEEB (confirmed), KB-19E3F96A (source).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend-next (same code upstream in VirtoCommerce/vc-frontend)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** `client-app/shared/catalog/components/category.vue` + `client-app/shared/catalog/composables/useProducts.ts`
- **RCA anchor:** `category.vue:628` `analytics("viewItemList", products.value, categoryListProperties.value)`
- **Routing confidence:** HIGH — send only the items `fetchMoreProducts` added (return them, or slice by the pre-fetch length), index offset as the product decides
