# BUG-036-005 — Pickup modal: invalid search query shows no "No results" empty state message

**Severity:** Low
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-006
**Business Rule:** BL-BOPIS-007
**Edge Case:** ECL-14.2
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**Status:** confirmed: false (preliminary)

## Summary

When a user submits an invalid / no-match search query (e.g., `xyzabc123`) in the cart Pick points modal, the location list collapses to show only the previously-confirmed pickup location with no explanatory "No results found" empty-state message. The user has no signal that their search returned 0 actual matches and that the single visible item is just their prior selection prepended/preserved.

## Steps to Reproduce

1. Login as B2B user, add product to cart, navigate to `/cart`
2. Click `Pickup`, open Pick points modal
3. Type `xyzabc123` in the main `Search ` input (placeholder "Search ")
4. Press Enter or click magnifier button to submit

## Expected

- Empty state message: e.g., "No locations match your search. Try clearing the search or adjusting filters."
- Or a clear visual cue that the list is filtered with no matches
- Reset/clear search action visible

## Actual

- List shows ONLY the pre-selected pickup location (e.g., Queens Crossing) — no explanatory text
- User cannot distinguish between "no matches" and "Queens Crossing matches my search"
- The `X` clear-search icon is present in the search input but no empty-state is shown
- App does NOT crash (PASS for non-crash assertion)

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/036-evidence/BOPIS-006-empty-search.jpg`
  - Shows: search field contains `xyzabc123`, list shows only "Queens Crossing" entry, map remains rendered, no "no results" text anywhere

## Console / Network

- Console errors: 0
- Network errors: 0

## Impact

- UX confusion — user may think their query matched the visible item
- Poor discoverability of the "clear search" action

## Suggested Fix

- Add "No locations found for '<query>'. Try adjusting filters." empty state when search returns 0 matches (excluding the prepended pre-selection)
- Distinguish "single result" from "single result is pre-selection echo"
