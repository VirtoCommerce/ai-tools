# Root cause — VCST-6398 X5

**Verdict:** REPRODUCED 3/3 (guest) · classification **needs-review (PO/contract question), not a confirmed defect** · owning layer **storefront category/search grid** · repoKind `frontend` · repo **VirtoCommerce/vc-frontend-next** (code at PR #11 head d67b0e0a) · confidence on code path **HIGH**, on "is it a defect" **LOW–MEDIUM** · NEW_WITH_MERGE **no** (same unguarded call in vc-frontend 2.40.0 and `dev`).

## Symptom
When the category grid or /search returns 0 products (search-within-category with a term that matches nothing, or a 0-result /search), the storefront pushes `view_item_list` with `items: []`, `items_count: 0` (on /search with `item_list_id category_undefined_page_1`), between `search` (items_count 0) and `view_search_results` (results_count 0). Evidence: `network/datalayer-attempt{1,2,3}-*.json`.

## Lowest failing layer — proven
API correct: `SearchProducts` → `totalCount 0, items []` (`network/req213-response.json`). The event is assembled client-side from the empty `products.value`.

## Code path (gh, read-only, vc-frontend-next @ d67b0e0a)
- `client-app/shared/catalog/components/category.vue` `fetchProducts()` L656: `analytics("viewItemList", products.value, categoryListProperties.value)` — unconditional (the only skip is the single-barcode-hit redirect, L649). `/search` reuses this component (`pages/search.vue` L3/L8). Same unguarded call in `changeProductsPage()` L628.
- `client-app/modules/google-analytics/events.ts` `viewItemList` L15–35: maps whatever it gets and sends — no empty guard; `useAnalytics` (`core/composables/useAnalytics/index.ts`) forwards without filtering.
- **Theme-internal convention says "don't report an empty list":** every other manual caller guards on length — `pages/shared-list.vue` L193, `pages/account/list-details.vue` L466, `pages/account/saved-for-later-details.vue` L395, `header/_internal/search-dropdown.vue` L305 (comment: *"impression is only for products the shopper actually sees"*), `compare/composables/useCompareProductsPage.ts` L483; and the declarative dom-analytics engine (used by related / recommended / recently-browsed / variations) returns `undefined` for an empty `collect` (`core/plugins/dom-analytics/engine.ts` L62/L70) so the required arg is missing and the event is skipped (L76–79). `category.vue` is the lone exception.
- Upstream vc-frontend: identical unguarded calls at `2.40.0` (L497/L510) and `dev` (L605/L633) — long-standing, not introduced by the merge.

## Contract
| Source | Says |
|---|---|
| VirtoOZ StorefrontDeveloperGuide → Google Analytics Events → `view_item_list` payload | "Pushed when a product list renders … reports the list and the products in it"; `items` = "The products in the list". **Silent on an empty list.** |
| Google GA4 event reference, `view_item_list` | "Log this event when the user has been presented with a list of items"; `items` **Required: Yes**. **Silent on an empty array.** |
| `BL-GA4-001` (ga4.yaml, SUSPECT) | Schema of `items[]` (array, not CSV; item fields). Not violated — `[]` is an array; no rule on emptiness. |

Nothing human-authored forbids an empty push. Arguments it is wrong: no list was "presented", `items` is required by GA4 and an empty array carries no impression, and the theme's own other callers + the engine deliberately suppress it. Argument it is acceptable: `view_search_results` / `search` are also sent with 0, so a consumer can count zero-result views — though those events already carry that signal.

## Alternatives ruled out
| Alternative | Ruled out by |
|---|---|
| Data drift / backend | API returns 0 legitimately (nonsense term); event built client-side |
| Role-dependent | Reproduced as guest (KB-CCFCAEEB was a B2B member) |
| Engine double-fire | Category grid has no `data-vc-track="product-list"`; the empty push is the manual `category.vue` call; engine would have skipped it |
| By design (documented) | **Not ruled out** — docs silent; hence needs-review, not REAL_BUG |

## Severity if accepted
**Low / P3** — analytics noise (empty impression events; on /search also `category_undefined`), no customer-facing impact.

## Fix shape (if PO accepts; not applied)
In `category.vue` guard both calls with `if (products.value.length)` (matching shared-list / search-dropdown), single repo vc-frontend-next; optional same guard upstream in vc-frontend. Or guard centrally in `events.ts viewItemList`.

## PO question
"Should `view_item_list` be suppressed when a catalog/search grid renders zero products (as the theme already does for lists, saved-for-later, compare, the search dropdown and the dom-analytics widgets), or is an empty `view_item_list` intended?"
