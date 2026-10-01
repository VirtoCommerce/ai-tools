# Search results `view_item_list` is sent as `Category "undefined" (page 1)` on `/search` `[Low]`

## Status: READY_TO_SUBMIT

**Tracker:** VCST-6099 (Bug, relates to VCST-2945; labels vc-fix + qa-autofix)

**Severity:** Low (P3) · **Type:** Functional / analytics payload · **Archetype:** `SILENT`
**Found by:** /qa-test-fast VCST-2945 (2026-09-28) · **PRE-EXISTING** — outside VCST-2945 (same code on `master`)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` · Platform `3.1073.0-pr-3121-9965` · store `B2B-store` · Firefox 1920 px · anonymous

## Summary

On the search results page there is no current category, but the results grid still builds its analytics list
from one. Every `view_item_list` pushed for `/search?q=…` (and `/search?barcode=…`) carries
`item_list_name: 'Category "undefined" (page 1)'` and `item_list_id: 'category_undefined_page_1'`. Search
result impressions are therefore reported as a category called "undefined", indistinguishable across searches.
Non-visual claim: the evidence is the page's analytics data layer, not a screenshot.

## Steps to Reproduce

1. Open `{{FRONT_URL}}/search?q=tablet`.
2. In DevTools, inspect `window.dataLayer` (or the GA network hits) for the `view_item_list` event of the results grid.

## Expected vs Actual

- **Expected:** a search-results list name/id (e.g. naming the search, not a category), with no `undefined`.
- **Actual:** `item_list_name 'Category "undefined" (page 1)'`, `item_list_id 'category_undefined_page_1'` — both for `?q=` and `?barcode=`.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | dataLayer read 18:11–18:12Z; HAR `test-results/firefox/har/session.har` |
| 2. Admin | N/A | — |
| 3. xAPI | N/A | the payload is built client-side |
| 4. REST | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

`client-app/shared/catalog/components/category.vue` (master) l.418–419:
`item_list_id: \`category_${currentCategory.value?.slug}_page_${currentPage.value}\`` and
`item_list_name: \`Category "${currentCategory.value?.name}" (page ${currentPage.value})\`` — on `/search`
`currentCategory` is null, so both interpolate `undefined`.

**Suggested fix:** branch on the search route (no category) and use a search list name/id.

## Evidence

- Session `reports/exploratory/SBTM-VCST-2945-2026-09-28-2.md` (candidate X1).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** catalog results page analytics (`category.vue`)
- **RCA anchor:** `client-app/shared/catalog/components/category.vue` l.419 (`item_list_name: \`Category "${currentCategory.value?.name}"…`)
- **Routing confidence:** HIGH

Found by: /qa-test-fast VCST-2945 (2026-09-28)
