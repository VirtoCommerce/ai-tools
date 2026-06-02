# BUG-036-001 — VCST-4707 Regression: Confirmed pickup location NOT prepended to top of list on modal reopen

**Severity:** Critical
**Suite:** 036 — BOPIS Store Selector
**Test Case:** BOPIS-091 (also affects BOPIS-092, BOPIS-093 — blocked)
**Business Rule:** BL-BOPIS-007 / BL-BOPIS-008 (proposed)
**Edge Case:** ECL-14.2
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** Frontend Ver. 2.48.0
**JIRA Refs:** VCST-4707; PR vc-module-x-pickup#8
**Status:** confirmed: false (preliminary — needs qa-testing-expert verification)

## Summary

The `IncludeLocationIds` prepend logic that VCST-4707 was supposed to introduce for the cart Pick points modal is **not visually applied**. When a user confirms a pickup location from the middle/bottom of the list and reopens the modal, the radio button correctly remains checked, but the location stays at its original list index — it is **not** prepended to position 0. The user must scroll to find their selected location instead of seeing it at the top.

## Steps to Reproduce

1. Login as B2B user `test-emily.johnson-20260310@test-agent.com` (slot 2 / playwright-firefox / TechFlow org)
2. Add product to cart (UNTUCKit eGift Card — `bee0d93a-cd70-4313-bc6c-716cb415b43a`)
3. Navigate to `/cart`
4. Click `Pickup` radio button (delivery option)
5. Click pencil icon (`[data-test-id="select-address-button"]`) to open Pick points modal
6. Scroll list to index 30, click the radio next to `DPD - Sanghaj` (or any location at index ≥ 5)
7. Click `PICK UP HERE` button — modal closes
8. Verify cart shipping section shows the confirmed location (`2853 Longhua Rd, Sanghaj, 200232, China`)
9. Click pencil icon again to reopen Pick points modal
10. Inspect first 5 entries in the location list

## Expected

Per BL-BOPIS-008 (proposed) and VCST-4707 fix:
- Confirmed location appears at **index 0** (top of list) — prepended via `IncludeLocationIds` GraphQL query parameter
- Radio button next to the confirmed location is in checked state
- User does NOT need to scroll to see their previously-selected location
- Map is panned/zoomed to that location's marker

## Actual

- Radio button next to `DPD - Sanghaj` IS correctly checked (pre-selection state preserved — partial credit)
- BUT `DPD - Sanghaj` remains at **index 30** (its original alphabetical position in the unfiltered list)
- Top 5 entries on reopen are unchanged from initial load: Brooklyn Academy of Music, Queens Crossing, Staten Island Children's Museum, Tramsheds, 9/11 Memorial
- User must scroll past 29 entries to confirm their selection visually
- Map IS panned to DPD-Sanghaj marker (Shanghai), so map-side logic works

## Verified Variants

| Selected Index | Location Name | Reopen Index | Prepend Applied? |
|---|---|---|---|
| 1 | Queens Crossing | 1 | NO |
| 30 | DPD - Sanghaj | 30 | NO |

Both confirmed locations stay at their original list positions on reopen.

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/036-evidence/BOPIS-091-DPD-not-prepended.jpg`
  - Shows: Cart shipping section displays `2853 Longhua Rd, Sanghaj` (Sanghaj location confirmed). Modal reopen shows Brooklyn Academy of Music, Queens Crossing, Staten Island, Tramsheds, 9/11 Memorial in the list — DPD-Sanghaj is NOT in the visible top portion. Info card center panel shows DPD-Sanghaj details. Map is centered on Shanghai (so map prepend works).

## Console / Network

- Console errors: 0
- Network errors: 0 (all `/graphql` POST requests = 200)
- The `cartPickupLocations` GraphQL query was called on modal reopen — request body was not inspected for `IncludeLocationIds` argument; recommended for follow-up triage

## Impact

- Users who confirm pickup at non-top locations will believe their selection was lost on reopen until they scroll
- Increased cognitive load and time-on-task for users in B2B workflows
- Regression of VCST-4707 scope; user-visible defect in production-bound build 2.48.0

## Suggested Investigation

1. Verify `cartPickupLocations` GraphQL request payload includes `IncludeLocationIds: [<lastConfirmedLocationId>]`
2. Verify backend xPickup module returns the prepended location at `items[0]` when `IncludeLocationIds` is supplied
3. Check vc-frontend `select-address-map-list` component for the merge/prepend logic — it may be receiving correct API data but rendering by sort order
4. Verify against PR vc-module-x-pickup#8 — was the fix released to QA build 2.48.0?

## Cross-Suite Impact

- BOPIS-092 (BVA index 50) and BOPIS-093 (BVA index 51) are BLOCKED by this regression
- BOPIS-087 (pagination): cannot fully test load-more boundary because list is capped at 50 (separate bug — see BUG-036-002)
