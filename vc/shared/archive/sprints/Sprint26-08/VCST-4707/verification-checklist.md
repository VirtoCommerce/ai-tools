# Verification Checklist — VCST-4707

**Bug:** [BOPIS] Pre-selection fails for pickup locations outside first 50 results (pagination bug)
**Fix:** PR `vc-module-x-pickup#8` — backend `IncludeLocationIds` field on `MultipleProductsPickupLocationSearchCriteria`; `SearchCartPickupLocationsQueryHandler` populates from cart.Shipments[].PickupLocationId; `ProductPickupLocationService.SearchPickupLocations` prepends missing-but-confirmed locations to result set.
**Build:** Platform 3.1025.0 / VirtoCommerce.XPickup 3.1001.0-pr-8-3380 (head SHA `3380304`) / Theme 2.48.0-pr-2269 (unrelated)
**Canonical invariant:** `BL-BOPIS-008` (promoted 2026-04-28) — confirmed cart pickup locations always appear at items[0] of `cartPickupLocations`, regardless of paging/keyword/filter.

## Frontend (qa-frontend-expert / playwright-chrome) — 6 items

### Fix Confirmation
- [ ] **F1.** Reproduce the original STR scenario (Step 5–10 from ticket): select a location at pagination index 51+ → confirm → reopen modal → location MUST be pre-checked, visible without scrolling, map centered. Run **3 consecutive times** with cart reset between runs. (BL-BOPIS-008)
- [ ] **F2.** `cartPickupLocations` GraphQL response on modal reopen has `items[0].id == confirmed location id` (verified via `browser_network_requests`). errors[] is empty.
- [ ] **F3.** Root cause addressed — backend response prepends the confirmed location regardless of pagination position; frontend pre-selection now succeeds without any client-side change.

### Regression — Adjacent Cart/BOPIS behaviors
- [ ] **F4.** Within-first-50 selection still works: pick a location early in the list (e.g., index 0–10), reopen modal → still pre-selected, no duplicate entries (BL-BOPIS-008 idempotence).
- [ ] **F5.** Modal reopen shows: search field empty, no facet chips applied, no console errors.
- [ ] **F6.** Cart total / shipping section displays the chosen pickup location's name + $0 shipping (BL-BOPIS-002). Cart-level Pickup toggle keeps a single shipment (BL-BOPIS-001).

## Backend GraphQL (qa-backend-expert / playwright-edge) — 4 items

- [ ] **B1.** Query `cartPickupLocations` with `first: 1` after confirming a far-page location → response `items[0].id` matches the confirmed location ID (BL-BOPIS-008 + VCST-4707 fix).
- [ ] **B2.** Query with a `keyword` that matches zero other locations → confirmed location still returned at items[0] (no false-empty result; IncludeLocationIds prepend semantic).
- [ ] **B3.** Schema-coverage probe: `pickupLocations` (non-cart) query unaffected by the change — still respects pagination/keyword without prepending (no leak of cart-only logic to product-level query).
- [ ] **B4.** No GraphQL `errors[]` for any cartPickupLocations request; pageInfo shape intact.

**Total: 10 items (3x STR + 7 regression/cross-layer/schema).**

## Out-of-scope (not retested here)
- BOPIS-checkout flow (suite 038) — backend change is constrained to the search/list response; checkout cart-shipment write path unchanged.
- Inventory-availability label mapping (BL-BOPIS-003) — orthogonal to IncludeLocationIds.
- BOPIS PDP modal (BL-BOPIS-004) — different code path.
