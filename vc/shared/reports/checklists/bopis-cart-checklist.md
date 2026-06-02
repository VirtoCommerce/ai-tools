# BOPIS in Cart — Test Case Writing Checklist

> Focused checklist for Buy Online, Pick Up In Store (BOPIS) scenarios **within the Cart context**.
> Scope: cart page pickup flow, PickPoints modal, availability labels, mixed-cart behavior, cart totals, and quantity revalidation.
> Out of scope: product detail page BOPIS widget (covered in BOPIS > Product Page suite), post-cart checkout steps (covered in CHK-* suite), map UI internals (covered in BOPIS-001..025).

**Domains covered:** #8 Cart/Checkout (pickup variant) + #15 BOPIS (Pickup) + BL-SHIP-002, BL-CART-001, BL-CART-002, BL-CROSS-*
**Related suites:** 04-cart-checkout-tests.csv, 05-bopis-pickup-tests.csv
**Related checklists:** #8 Cart/Checkout, #15 BOPIS (Pickup), #9 Payment
**Created:** 2026-03-06

---

## Summary

| # | Category | Items | Priority |
|---|----------|-------|----------|
| A | Pickup Toggle & Entry Point | 4 | P0/P1 |
| B | PickPoints Modal — Render & Content | 5 | P0/P1 |
| C | Availability Labels per Fulfillment Path | 6 | P0/P1 |
| D | Mixed Cart (Delivery + Pickup) | 4 | P1 |
| E | Pickup Location Selection & Confirmation | 4 | P0/P1 |
| F | Cart Totals with Pickup (No Shipping Cost) | 4 | P0 |
| G | Switching Between Delivery and Pickup | 4 | P1 |
| H | Quantity Changes Revalidating Pickup Availability | 4 | P1 |
| I | PickPoints Modal — Filters & Search | 26 | P1/P2 |
| J | Edge Cases & Error States | 6 | P1/P2 |
| K | Cross-Layer Verification | 3 | P0/P1 |
| | **Total** | **70** | |

---

## A. Pickup Toggle & Entry Point

> Covers: the delivery method toggle in cart, BOPIS feature flag, and the entry point into the PickPoints modal.
> Business rule: BL-SHIP-002 — BOPIS is only shown when at least one active pickup location is configured.

- [ ] Pickup/Delivery toggle visible in cart: "Shipping" and "Pickup" options displayed side by side; "Pickup" selectable when BOPIS module is active and at least one pickup location exists (C410934, C410937)
- [ ] Pickup feature flag disabled: when BOPIS is deactivated in store settings, the "Pickup" option does not appear in cart delivery options at all — no trace in DOM (C410938)
- [ ] "Select pickup location" link/button appears immediately after choosing "Pickup" delivery option; clicking it opens the PickPoints modal (BOPIS-026, C412683)
- [ ] No shipping address form is shown when "Pickup" is selected — the shipping address step is skipped; billing address requirement is unaffected (BL-SHIP-002, C410936)

---

## B. PickPoints Modal — Render & Content

> Covers: the PickPoints modal opened from the cart context. Cart modal must show the "Select" button (contrast with product page view-only modal, BOPIS-029/034).

- [ ] PickPoints modal opens from cart with map rendered, location list populated, and no JavaScript errors in browser console (C412683, BOPIS-026)
- [ ] Each location entry in the list shows: location name, address, distance (if geolocation available), and an availability label chip (Today / Transfer / Global Transfer / Not available) (BOPIS-014, C412683)
- [ ] "Select" button is present inside the location info card when the modal is opened from cart — this is the functional cart modal, NOT the view-only product page modal (BOPIS-034)
- [ ] Map and location list are synchronized: clicking a location in the list highlights the corresponding map marker and pans to it; clicking a marker opens its info window and highlights the list entry (BOPIS-002, BOPIS-012)
- [ ] Modal dimensions are stable: no layout shifts or map width collapse during search interactions, list scrolling, or info card transitions; map never shrinks below 40% width (BOPIS-022 bug regression)

---

## C. Availability Labels per Fulfillment Path

> Covers: the six availability states produced by the Main FC / Transfer FC / Global Transfer matrix.
> These labels appear both in the PickPoints modal and on individual location cards.
> Test data setup: configure products and locations as described in TestRail cases C412653–C412692.

- [ ] Main FC match — "Today" label: product assigned to Main_1 FFC, location L1 has Main FC = Main_1 → both PDP and cart PickPoints modal show label "Today"; no "Transfer" or "Global" label present (C412653)
- [ ] Transfer FC match — "Transfer (2-3 days)" label: product assigned to Transfer_1 FFC, location L3 has Transfer FC = Transfer_1, EnableGlobalTransfer = FALSE → label shows transfer duration text (e.g., "Transfer (2–3 days)"); location is selectable (C412656)
- [ ] Global Transfer — "Global Transfer (1 week)" label: product assigned to Main_1 FFC, location L2 has no Main FC and Transfer FC = Transfer_1, EnableGlobalTransfer = TRUE → label shows global transfer duration text; location remains selectable (C412655, C412658)
- [ ] No match, Global OFF — "Not available" state: product assigned to Transfer_1 FFC, location L4 has Main FC = Main_1 and no Transfer FCs, EnableGlobalTransfer = FALSE → location displayed as "Not available" (greyed/disabled) and cannot be selected for pickup (C412654, C412657)
- [ ] Pickup blocked — no valid locations: product P5 with EnableGlobalTransfer = FALSE has no compatible locations → PickPoints modal shows message "There are no available pickup points for these products. Select another shipping method"; pickup radio option blocked (C412691)
- [ ] Inactive location excluded: a location deactivated in Admin (Store > Shipping methods > Buy Online Pickup in Store > toggle Active = OFF) does not appear in the cart PickPoints location list; active locations remain unaffected (C410939)

---

## D. Mixed Cart (Delivery + Pickup)

> Covers: a cart containing products with different delivery eligibility. Not all products in a cart may be BOPIS-eligible.
> Business rule: BL-CART-002 applies — if any item's stock or availability changes, the cart must reflect it.

- [ ] Mixed cart render: BOPIS-eligible product shows "Pickup" option in delivery toggle; delivery-only product shows only "Shipping" (no "Pickup" toggle for that line); each item's delivery selection is independent (BOPIS-027, domain-checklists.md #15)
- [ ] Pickup location selected for one item does not cascade to delivery-only items: the cart correctly maintains separate fulfillment modes per eligible item; totals reflect the split (no shipping cost on pickup item, shipping cost on delivery item)
- [ ] Selecting items in cart for checkout: when a mixed cart proceeds to checkout, each item carries its own fulfillment method; the order summary at checkout shows pickup location for pickup items and shipping address for delivery items
- [ ] "Select one item with Main FFC" map filter: when a single item with a Main FFC assignment is selected in the cart, the PickPoints modal map updates markers to reflect only locations compatible with that item's FFC assignment (C412692, C412693)

---

## E. Pickup Location Selection & Confirmation

> Covers: the full selection flow from opening the modal to confirming the location and seeing it reflected in the cart.
> Business rule: BL-SHIP-002 — order must not proceed without a confirmed pickup location when BOPIS is chosen.

- [ ] Full selection flow: open PickPoints modal → click location in list → info card opens → click "Select" → info card shows selected location details → click "Confirm" → modal closes → selected pickup location name and address displayed in cart under the item or in the shipping section (BOPIS-016, BOPIS-026, C413534)
- [ ] Single pickup point radio selection: radio button fills on selection; "SAVE" button becomes enabled (transitions from disabled state); previously selected location deselects (C413531)
- [ ] Cancel from info card: clicking "Cancel" on the location info card closes the card and returns to the map+list modal without changing the previously confirmed pickup location (BOPIS-015, C413533)
- [ ] Change pickup location: with a location already confirmed in cart, re-opening the PickPoints modal, selecting a different location, and confirming updates the cart's displayed pickup location to the new selection; old location is no longer shown (BOPIS-027)

---

## F. Cart Totals with Pickup (No Shipping Cost)

> Covers: the financial impact of selecting BOPIS. Pickup orders must not incur a shipping fee.
> Business rules: BL-PRICE-001 (discount stacking), BL-PRICE-002 (tax after discounts), BL-PRICE-008 (no floating-point errors).

- [ ] Shipping cost is $0.00 (zero) when BOPIS pickup is selected: the cart order summary shows no shipping line or an explicit "$0.00 / Free" shipping line; total = subtotal + tax only (C413982, BOPIS-026, BL-SHIP-002)
- [ ] Switching from delivery to pickup removes shipping cost: a cart that previously showed a shipping fee updates the total immediately when "Pickup" is selected and a location is confirmed; no stale shipping amount remains in the total (BL-SHIP-004)
- [ ] Tax still calculated correctly for pickup: tax is applied on the post-discount subtotal even when shipping cost is $0; tax amount matches the expected rate × (subtotal - discount); tax line remains visible (BL-PRICE-002)
- [ ] Cart math accuracy with pickup: subtotal = sum of all line totals (qty × unit price); grand total = subtotal + tax + $0 shipping; no cent discrepancy between summed line totals and displayed subtotal (BL-PRICE-008)

---

## G. Switching Between Delivery and Pickup

> Covers: toggling the delivery method back and forth, verifying state is cleaned up correctly each time.
> Business rule: BL-SHIP-004 — method selection must persist; switching away should clear incompatible state.

- [ ] Switch from Pickup to Delivery: selecting "Shipping" after a pickup location was confirmed clears the pickup location selection; the shipping address form or ship-to selector reappears; shipping cost is re-applied when a shipping method is selected (BOPIS-027, C410934)
- [ ] Switch from Delivery to Pickup: selecting "Pickup" after a delivery address and shipping method were filled clears the shipping method selection; the "Select pickup location" prompt appears; the previously entered delivery address is not shown (BOPIS-027)
- [ ] Switch Delivery → Pickup → Delivery → Pickup: after multiple toggles, each switch correctly resets to the appropriate state; no ghost data from a previous mode persists in the cart state; rapid toggling does not cause UI freeze or console errors (BOPIS-027, error-guessing)
- [ ] Selecting ShipTo address in header while Pickup is active: changing the ship-to address via the header address selector when Pickup delivery is selected should switch the delivery method back to Shipping — the pickup selection is cleared and the new address is applied (C410850)

---

## H. Quantity Changes Revalidating Pickup Availability

> Covers: how changing item quantity in the cart affects pickup availability, especially for transfer paths where stock at the pickup branch matters.
> Business rules: BL-CART-001 (max qty enforcement), BL-CART-002 (out-of-stock mid-session).

- [ ] Increase quantity beyond pickup branch stock: when a pickup location is selected and the user increases item quantity beyond what is available at that branch, the system must flag the item (error state, "Not available at this pickup location for requested quantity") or prompt location re-selection; the order cannot proceed silently (BL-CART-001, BL-CART-002)
- [ ] Decrease quantity below minimum order quantity (MOQ): if a product has an MOQ or pack size, the cart stepper in pickup mode enforces the same pack size rules as in delivery mode; direct input of a non-multiple quantity is rejected or auto-rounded (BL-CART-006)
- [ ] Quantity change triggers availability re-check: after changing quantity, the availability label for the selected pickup location refreshes to reflect the new requested quantity; a location that was "Today" at qty 1 may become "Transfer" or "Not available" at qty 10 if branch stock is insufficient
- [ ] Add same SKU again (qty aggregation): adding the same product to cart again (from PDP or listing) increments the existing cart line rather than creating a duplicate line; the aggregated quantity is then validated against pickup branch stock for the selected location (BL-CART-007)

---

## I. PickPoints Modal — Filters & Search (Cart Context)

> Covers: facet filters (Country, State, City), keyword search, multi-filter combinations, and filter management inside the PickPoints modal when opened from the cart.
> These filters must work identically whether the modal is opened from PDP or cart. Test from cart context specifically.
> TestRail source: C413538–C413536 (BOPIS Pickup Points — Basic Filters, Search, Multi-Filter Search, Multiple Choice, Filter Management)

### I-1. Facet Filters

- [ ] Country facet filter: select a country (e.g., USA) → only locations from that country displayed in list; map updates to show filtered markers; store count updates; filter state visually indicated with chip (C413538)
- [ ] Country filter — single result: select a country with only 1 location (e.g., Denmark) → system handles single-item filter correctly; 1 result displayed (C413539)
- [ ] State/Province facet filter: select a state (e.g., NY) → only locations from that state displayed; map zooms to the region; list updates (C413540)
- [ ] State filter disabled for non-US/CA countries: select a country other than USA or Canada (e.g., China, Denmark) → State/Province filter is disabled; system prevents invalid filter combinations (C413543)
- [ ] City facet filter: select a city (e.g., New York) → only locations from that city displayed; map shows all selected city markers (C413541)

### I-2. Keyword Search

- [ ] Search by pickup location name: enter full or partial location name (e.g., "Downtown") → matching locations displayed on map and in list; search is case-insensitive (C413544)
- [ ] Search by partial name: enter "Empire" → Empire State Building and related results display; partial matching works correctly (C413549)
- [ ] Search by city name: enter "New York" → all locations in that city displayed; map centers on searched city (C413545)
- [ ] Search by ZIP code: enter ZIP (e.g., "10001") → matching locations displayed with correct map markers (C413546)
- [ ] Search by address: enter "34th St" → all locations on that street displayed (C413550)
- [ ] Search by complete name: enter "Empire State Building" → exact match found; case-insensitive (C413548)
- [ ] Search by email or contact: enter email or phone → relevant pickup locations displayed (C413547)
- [ ] Search with special characters — apostrophe: enter "St. Patrick's" → location found; apostrophes handled (C413551)
- [ ] Search with special characters — ampersand: enter "5th Ave & 50th" → location found; special characters processed (C413552)
- [ ] Search with whitespace only: enter spaces → all pickup points restored; whitespace trimmed automatically (C413553)
- [ ] Search with non-existent term: enter "NonexistentLocation" → "Pickup points not found" message; "RESET SEARCH" button available (C413554)

### I-3. Multi-Filter Combinations

- [ ] Country + State + Search (3 levels): select USA → New York → search "Empire" → only Empire State Building displays; all three filter levels applied correctly (C413521)
- [ ] Country + State + City + Search (4 levels): select USA + NY + New York City + search "Building" → most specific results shown (C413522)
- [ ] No results at multiple filter levels: USA + NY + NYC + search "NonExistent" → "Pickup points not found" at most specific level; all filters still visible and removable (C413523)
- [ ] Apply filters after search: search "Building" first → then select USA country filter → combined results show only USA locations matching "Building" (C413526)

### I-4. Multiple Selection & Filter Management

- [ ] Multiple countries selection: select USA + Canada simultaneously → both chips shown; results from both countries returned (C413527)
- [ ] Multiple states selection: select USA → open State dropdown → select multiple states → multiple chips appear; all relevant results returned (C413528)
- [ ] Multiple cities selection: select multiple cities → multiple chips appear; combined results returned (C413529)
- [ ] Deselect one of multiple choices: with multiple countries selected, click one checkbox again → that selection removed; results update to remaining selection (C413530)
- [ ] Breadcrumb filter removal: apply USA + NY + NYC + Search → click X on State filter chip → state removed; results update intelligently to remaining filters (C413524)
- [ ] Reset all filters: apply multiple filters and search → click "Reset filters" → all chips removed; full pickup points list restored; search bar cleared; map shows all locations (C413525, C413536)

---

## J. Edge Cases & Error States

> Covers: boundary conditions, unexpected user actions, and system error handling in the BOPIS cart flow.
> (Formerly section I)

- [ ] No pickup locations configured at all: when BOPIS module is active but no pickup locations exist in the system, the "Pickup" delivery option is either hidden or shown as disabled with a message "No pickup locations available"; selecting it does not open an empty modal (BL-SHIP-002)
- [ ] Pickup location deactivated while it is the confirmed selection: if an admin deactivates a location between the user selecting it and proceeding to checkout, the checkout must detect the now-invalid pickup selection and prompt the user to re-select; the order is not placed with a deactivated location (C410939, BL-CART-002 analog)
- [ ] Invalid search in PickPoints modal from cart: entering a non-existent search term (e.g., "xyzabc123") shows "Pickup points not found" message with a "RESET SEARCH" button; the map does not crash; map dimensions remain stable (BOPIS-006, BOPIS-022 regression, C413421)
- [ ] Prefill pickup address for logged-in user: on returning to checkout with Pickup selected, the previously used pickup location is pre-filled / last-used location is remembered; user does not need to re-select from scratch (C411021, C411024)
- [ ] Org user pickup address isolation: switching organizations resets the pickup location selection to the new org's context; a pickup location confirmed under Org A is not shown under Org B's cart (C411028, BL-CART-005)
- [ ] Billing address required for BOPIS order: even with Pickup selected and no shipping address form shown, the checkout must not allow order placement without a billing address; "Billing address cannot be the same as shipping address" constraint applies when pickup is selected (C410943, BL-SHIP-002)

---

## K. Cross-Layer Verification

> Every P0/P1 BOPIS cart scenario must be verified across storefront, API, and Admin layers.
> These items apply to the end-to-end flows in categories A–I above.

- [ ] Storefront → xAPI → Admin round-trip: after confirming a pickup location in cart and placing the order, verify via xAPI `order` query that `shipments[].fulfillmentCenterId` references the selected pickup location; verify Admin order detail shows the correct pickup location name, address, and hours (BOPIS-026, BL-SHIP-002)
- [ ] No shipping cost in API response: for a BOPIS order, verify xAPI `cart` query shows `shipments[].price = 0` (or no shipment cost) and `total` = `subtotal + taxTotal`; no shipping amount is included in the stored order (BL-PRICE-008, C413982)
- [ ] Console and network clean: during the full cart BOPIS flow (toggle → modal open → location select → confirm → proceed), no JavaScript errors appear in the browser console and no 4xx/5xx API calls occur in the network tab; map tile requests are the only expected third-party calls (BOPIS-001, BOPIS-022)

---

## Coverage Map

| Business Invariant | Covered By |
|--------------------|-----------|
| BL-SHIP-001: Ship-to address determines available methods | G: Switch Delivery to Pickup |
| BL-SHIP-002: BOPIS requires store pickup location | A, E, I |
| BL-SHIP-004: Shipping method persists through checkout edits | F, G |
| BL-CART-001: Max quantity enforcement | H |
| BL-CART-002: Out-of-stock mid-session | H, I |
| BL-CART-005: Cart isolation per organization | I |
| BL-CART-006: Pack size enforcement | H |
| BL-CART-007: Same product adds quantity, not duplicate line | H |
| BL-PRICE-002: Tax after discounts | F |
| BL-PRICE-008: No floating-point money arithmetic | F, J |

---

## Delegation

| Category | Assign To | Notes |
|----------|-----------|-------|
| A, B, E, F, G (cart UI flows) | `qa-frontend-expert` | Storefront; Chrome primary |
| C (availability label matrix) | `qa-frontend-expert` | Requires test data setup with FFC config |
| D (mixed cart) | `qa-frontend-expert` | Multi-item cart scenario |
| H (qty revalidation) | `qa-frontend-expert` | Stepper + stock boundary |
| I (filters & search) | `qa-frontend-expert` | PickPoints modal filter/search combos; 26 items |
| J (edge cases) | `qa-testing-expert` | Mid-session state changes, org isolation |
| K (cross-layer) | `qa-backend-expert` | xAPI cart/order queries + Admin SPA |

---

## Preconditions (Shared)

The following must be true before executing any checklist item:

1. BOPIS module is active in store settings (`STORE_ID` from `.env`)
2. At least 4 pickup locations are configured with varying FFC assignments (Main FC, Transfer FC, both, neither) and varying active/inactive states
3. EnableGlobalTransfer setting has known state (tested both ON and OFF per category C)
4. Test products are configured: at minimum one product assigned to Main FFC, one assigned to Transfer FFC only, one with no FFC assignment (for "Not available" scenarios)
5. User logged in with `USER_EMAIL` / `USER_PASSWORD` from `.env` (org user for category I org-isolation items)
6. Cart is empty at the start of each test (clear cart or use a fresh session)
7. Browser: `playwright-chrome` at 1920x1080 (desktop); for mobile items in category B, use 375x667 viewport

## Test Data Requirements

| Data | Source | Notes |
|------|--------|-------|
| BOPIS-eligible product SKU | Catalog | Must have FFC assignment |
| Delivery-only product SKU | Catalog | No FFC assignment or BOPIS disabled per product |
| Pickup location L1 (Main FC only) | Admin > Shipping > BOPIS locations | Active |
| Pickup location L2 (Transfer FC, Global OFF) | Admin | Active |
| Pickup location L3 (Transfer FC, Global ON) | Admin | Active |
| Inactive pickup location | Admin | Deactivated for edge-case test |
| Payment card for E2E | `.env` SKYFLOW_VISA / SKYFLOW_EXPIRY / SKYFLOW_CVV | For J cross-layer order placement |
| Org 1 and Org 2 accounts | `.env` USER2_* | For I org-isolation scenario |
