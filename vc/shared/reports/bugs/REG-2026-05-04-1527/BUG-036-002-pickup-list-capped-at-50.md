# BUG-036-002 — Pickup location list capped at 50 entries with no Load More — 52 of 102 configured locations unreachable

**Severity:** High
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-087 (also blocks BOPIS-092, BOPIS-093)
**Business Rule:** BL-BOPIS-007
**Edge Case:** ECL-14.2
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**Status:** confirmed: false (preliminary)

## Summary

The cart Pick points modal renders only the first 50 pickup locations and provides no mechanism (Load More button, infinite scroll, or pagination control) to fetch additional locations. According to `test-data/aliases.json` BOPIS entry, the system has 102 pickup locations configured. Locations at indices 50–101 are completely unreachable through the current UI.

## Steps to Reproduce

1. Login as B2B user (slot 2 / Firefox / TechFlow org)
2. Add product to cart, navigate to `/cart`
3. Click `Pickup`, click pencil icon to open Pick points modal
4. Count visible location entries in the list (`.select-address-map-list__list` children)
5. Scroll list (`.vc-scrollbar.select-address-map-list`) to bottom
6. Wait 2+ seconds for any load trigger
7. Repeat scroll-to-bottom 3+ times
8. Look for any `Load more`, `Show more`, pagination button, or infinite-scroll spinner

## Expected

Per BL-BOPIS-007 and BOPIS-087:
- All 102 configured locations reachable via `Load more` button OR infinite scroll
- Network request fires when scrolling near bottom or clicking Load More
- Subsequent batches append to the list
- Total accessible count matches expected configured count (≥10, up to 102)

## Actual

- Initial render: exactly **50 location entries**
- Repeated scroll-to-bottom: list count remains 50 (no growth)
- No `Load more` / `Show more` / pagination button found anywhere in modal
- No infinite-scroll trigger or spinner observed
- 52 locations (indices 50–101) are completely unreachable through the cart Pick points UI

## Evidence

- Test result data:
  - `initialCount: 50`
  - `afterScrollCount: 50` (after first scroll-to-bottom)
  - `final: 50` (after 3 additional scroll-to-bottom cycles)
  - `loadMoreBtnTexts: []` (zero matching buttons)
  - `sidebarScrollHeight: 4880` (50 items × ~98px each — list is fully rendered, no paging controls)

- Test data reference (`test-data/aliases.json`):
  - `BOPIS.locationCount: 102`
  - `BOPIS.lastPageIndex: 102`
  - `BOPIS.testProductCatalogId: 9238c387-d779-40cb-b27d-5496a670a924`
  - `BOPIS.storeId: B2B-store`

## Console / Network

- Console errors: 0
- Network errors: 0
- No new `/graphql` requests fired during scroll-to-bottom attempts (back-end paging is not being requested by client)

## Impact

- Users selecting pickup near indices 50+ cannot see those locations at all
- Limits B2B customers using regional warehouses, delivery hubs, or alternate pickup options that fall outside the first 50 alphabetically
- Blocks BVA testing of pagination boundaries (BOPIS-091 partially, BOPIS-092 fully, BOPIS-093 fully)
- Hides 51% of the configured pickup network from end users

## Suggested Investigation

1. Inspect the `cartPickupLocations` GraphQL query: is `take` hardcoded to 50? Is paging supported in the schema?
2. Check vc-frontend `SelectAddressMapDesktop` / `SelectAddressMapMobile` components for paging logic
3. Verify whether load-more was intentionally disabled or is missing — compare against `vc-module-x-pickup` admin/spec
4. Confirm whether 50 is a UX limit or an unintentional cap

## Workaround for QA

Use COUNTRY/STATE/CITY filter dropdowns to narrow results so target location falls within first 50 of the filtered set.

## Cross-Suite Impact

- BOPIS-092 (BVA #50 boundary) — BLOCKED
- BOPIS-093 (BVA #51 boundary, page-2) — BLOCKED
- Affects BL-BOPIS-008-PROPOSED validation (cannot exercise the pagination case it covers)
