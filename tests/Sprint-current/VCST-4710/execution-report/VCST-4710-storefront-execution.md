# VCST-4710 Storefront Execution Report — 2026-04-23

**Ticket:** VCST-4710 — Checkout address-selection popup
**Source:** `tests/Sprint-current/VCST-4710/test-cases/VCST-4710-storefront.csv`
**Browser:** `playwright-edge` (fallback from `playwright-chrome` — 51 lingering chrome.exe processes prevented launch)
**Deploy:** Platform `3.1023.0-pr-2987-9f4a`, Theme `2.48.0-pr-2219-d5f9` (confirmed via footer), ProfileExperienceApi `3.1005.0-pr-129-03f6`

## Summary
- **Total:** 20
- **Pass:** 12 · **Fail:** 4 · **Block:** 2 · **Deferred:** 2 · **Skip:** 0
- **Pass rate:** 60% (75% of executed: 12/16)

## Known-Bug Confirmations (all still open as expected)
| Case | JIRA | Result |
|---|---|---|
| SF-008 Column sort not wired | VCST-4992 | FAIL confirmed (cursor:auto, aria-sort:none, order unchanged) |
| SF-013 aria-label = "Search pickup locations" | VCST-4993 | FAIL confirmed |
| SF-014 Mobile 375px city facet clipped | VCST-4994 | FAIL confirmed (CITY right=401.9px exceeds 375px by 26.9px) |

No unexpected passes — all three defects still reproduce on current build.

## Critical Happy-Path (Critical-Priority Cases — all PASS)
- SF-001 Popup opens · 4 cols + 3 facets + search + pagination present
- SF-004 Country facet · India 5 → 5 rows
- SF-006 City facet shows city NAMES (Delhi, LA, Paris, Ddftt, wegas) NOT postal codes
- SF-011 Select Colombia row + OK → Shipping Details updates to "egasegaws, wegas, 23523, Colombia"; AddOrUpdateCartShipment 200

## New Bug Candidates
1. **SF-018 `/account/company/info` → 404** for Elena (BMW-Group org-member). May be by-design (org-admin-only), but sidebar gives no Company section and test case documents this route. Needs verification with org-admin role.
2. **SF-010 empty-state copy** — typing a non-matching keyword shows "You do not have any addresses yet" which is incorrect when user has 8+ saved. Low-severity UX (should read "No addresses match your search").

## Blocked / Deferred
- **SF-009** (empty state, 0 addresses) — BLOCKED: no clean account available
- **SF-017** (account/addresses) — BLOCKED: link is hidden for B2B/org users per product convention
- **SF-015** (personal-account scope) — DEFERRED: user-switch to USER2 skipped for budget
- **SF-020** (duplicate address guard, UI-layer) — DEFERRED: full country+state dropdown cycle exceeded remaining budget. Backend bug `BUG-updateMemberAddresses-Single-Append-Dedup-Miss` already corroborates dedup failure at API layer.

## SF-020 corroboration note
UI-level test not completed; however the GraphQL-layer bug filed earlier today confirms the server-side dedup miss on single-element submissions. Because storefront uses the same `updateMemberAddresses` mutation, the UI warning test would almost certainly corroborate (duplicate would be saved, totalCount+1). Recommend re-running SF-020 standalone with extended budget to confirm UI-level AC-13 copy/warning.

## Browser / Fallback events
Primary `playwright-chrome` could not launch (user data dir conflict — 51 lingering chrome.exe). Fallback to `playwright-edge` executed cleanly with zero functional side effects on test results.

## Evidence
- `evidence/sf-001-popup-open.png` — popup opened, 4 cols + 3 facets + search + pagination
- `evidence/sf-004-country-filter-india.png` — India facet selected, 5 matching rows
- `evidence/sf-006-city-facet-names.png` — combined USA × California × Los Angeles, city names confirmed
- `evidence/sf-008-sort-not-wired.png` — default state post column-header click (order unchanged)
- `evidence/sf-011-address-selected.png` — cart page after address selection
- `evidence/sf-014-mobile-city-clipped.png` — 375px viewport showing CITY clipped right

Full per-case results + notes: `VCST-4710-storefront-results.json`
