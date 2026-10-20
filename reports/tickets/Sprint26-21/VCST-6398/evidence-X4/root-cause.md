# Root cause — VCST-6398 X4

**Verdict:** REPRODUCED 3/3 · owning layer **storefront (vc-frontend category page)** · repoKind `frontend` · repo **VirtoCommerce/vc-frontend-next** (code read at PR #11 head d67b0e0a / next `dev` L628; same defect upstream in vc-frontend ≥2.40.0) — routing corrected by the triage orchestrator: vc-frontend-next is a separate redesigned theme · confidence **HIGH** · NEW_WITH_MERGE **no** (pre-existing since ≤ vc-frontend 2.40.0).

## Symptom
On a category page, each infinite-scroll load pushes `view_item_list` with `item_list_id category_<slug>_page_<N>` whose `items[]` is the entire accumulated grid (pages 1..N, `index` from 0), not the cards that page added. Page-1 impressions are reported again on every later page (N pages ⇒ page 1 counted N times). Evidence: `network/datalayer-view_item_list-attempt*.json`.

## Lowest failing layer — proven
- API is correct: page-2 `SearchProducts` (`first:18, after:"18"`) returns 6 items (`network/page2-searchProducts-response.json`); the dataLayer page-2 event has 21 = 15 + 6.
- So the payload is assembled client-side from the accumulated list.

## Source (gh, read-only)
- `client-app/shared/catalog/components/category.vue` @ vc-frontend-next `d67b0e0a` L613–634, `changeProductsPage()`: after `await fetchMoreProducts(...)` it calls (L628) `analytics("viewItemList", products.value, categoryListProperties.value)` — comment: *"Send Google Analytics event for products on next page."*
- `client-app/shared/catalog/composables/useProducts.ts` @ same head, `fetchMoreProducts()` (L469+): L492 `products.value = products.value.concat(items)` (L489 `[...items, ...products.value]` for a backward page) — `products.value` is the whole grid.
- `categoryListProperties` (L462) builds `category_${slug}_page_${currentPage}` — the id is page-scoped, the items are not.
- Not the dom-analytics engine (vc-frontend #2543, VCST-6017): the category grid has no `data-vc-track="product-list"` container (0 hits in `category.vue` / `category-products.vue`), the `viewItemList` appear rule requires one (`core/plugins/dom-analytics/rules.ts` L3–14), and exactly one event per page was pushed. (The engine's `collect` source would also send the whole bound array — `engine.ts` L58–63 — a latent risk if the grid is ever moved onto markup roles.)

## When (regression archaeology)
Identical call in vc-frontend `2.40.0` (L497), `2.50.0` (L553), `2.59.0` (L605), `2.60.0` (L605) and vc-frontend-next `dev` (L628). Not introduced by the 2.60.0 merge or by #2543 — it is long-standing upstream behaviour first surfaced by this ticket's exploratory pass.

## Alternatives ruled out
| Alternative | Ruled out by |
|---|---|
| By design (docs) | VirtoOZ `ga-events` says view_item_list is "pushed when a product list renders … the products in it" and `index` is "the position of the product in the list"; it does not specify infinite scroll. The code comment ("products on next page") and the page-scoped `item_list_id`/`item_list_name` show the intent was the new page. Accumulating also breaks GA4 impression counts. Doc silence on pagination = doc gap, not a licence. |
| Data drift / backend | API returns the correct page; the duplication is the client concatenation. Reproduced on two categories. |
| Engine double-fire (R11 "sent twice") | One event per page; the duplication is inside one payload. |
| Auth/role | Reproduced as guest (KB-CCFCAEEB was a B2B member). |

## Severity (per /qa-defect)
**Medium / P2** — analytics data integrity (inflated `view_item_list` impressions, wrong `index`), no customer-facing or revenue-path breakage. Oracle: `BL-GA4-001` (schema) holds; the defect is in list scoping, which the oracle does not cover.

## Fix shape (for /qa-fix, not applied)
In `changeProductsPage`, send only the items `fetchMoreProducts` added (have it return the page's `items`, or slice `products.value` by the pre-fetch length) with `index` offset as the product decides. Single repo, vc-frontend-next (matching fix possible upstream in vc-frontend).
