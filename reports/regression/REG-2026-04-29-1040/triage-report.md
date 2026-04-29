# Triage Report — Suite 050k GraphQL xPickup
**Run:** REG-2026-04-29-1040 | **Date:** 2026-04-29 | **Module:** VirtoCommerce.XPickup 3.1001.0-pr-8-3380
**Delta from:** REG-2026-04-29-1015 (1 PASS / 5 FAIL) → REG-2026-04-29-1040 (2 PASS / 4 FAIL)

---

## GQL-094 — FAIL (new failure mode; BUG-050k-001 fix INSUFFICIENT)

**Previous failure:** LAST_LOCATION_ID captured as empty string (`items.last.id` syntax unsupported).
**Current failure:** LAST_LOCATION_ID is now captured correctly (`3e77a4dc` = "Colinborough") — capture fix WORKS. However `addOrUpdateCartShipment` now fails with `JSON_READER` server error.

**Hypothesis:** Product bug in PR#8 or pre-existing schema mismatch — NOT a test-case defect.

The mutation `addOrUpdateCartShipment(pickupLocationId: "3e77a4dc...", price: 0)` is sent with valid field values and the schema reports `schemaValid: true`. The server returns HTTP 200 with `extensions.code: "JSON_READER"` — a HotChocolate/GraphQL.NET deserialization error that fires when a field value cannot be coerced to the expected .NET type. Likely candidates: (a) `price: 0` being an integer literal where a Float/Decimal is expected, or (b) `InputShipmentType.pickupLocationId` serialization change in PR#8.

**VCST-4707 observability:**
- `query_keyword_exclude` returns `totalCount=0, items=[]` — correct behavior for a cart with NO confirmed shipment. The VCST-4707 prepend semantic cannot fire without a confirmed pickup.
- `query_paged_small` with `sort: "name:asc", first: 1` returns "Colinborough" (`3e77a4dc`) — this equals LAST_LOCATION_ID. The runner marks this assertion FAIL as a **false negative**: the assertion text includes a note in parentheses and the runner's equality comparison includes the full text, causing a mismatch despite actual=expected values. The raw assertion result in evidence shows `actual: ...id = 3e77a4dc-46af-41f5-bac5-012a6fec19a7` matching `expected: ...id = 3e77a4dc-46af-41f5-bac5-012a6fec19a7`. This is a runner CSV quality issue.
- Whether "Colinborough" appearing at items[0] in the asc-sorted result is genuine IncludeLocationIds prepend behavior or coincidence (it is alphabetically first among all 102 location names) is indeterminate because the shipment was never confirmed. The test design is valid but blocked by the JSON_READER mutation failure.

**Conclusion:** BUG-050k-001 fix INSUFFICIENT. The capture-path defect is resolved, but a new product-level blocker (`addOrUpdateCartShipment` JSON_READER) prevents VCST-4707 evaluation. File as BUG_050k_001_v2 (JSON_READER on addOrUpdateCartShipment).

**Evidence:** `reports/regression/REG-2026-04-29-1040/graphql-evidence/GQL-094-1777452148150.json`

---

## GQL-127 — FAIL (runner limitation only; no change from REG-2026-04-29-1015)

**Hypothesis:** Test infrastructure limitation — unchanged.

7/8 functional assertions pass. The single failure is the cross-OP COUNT comparison `totalCount <= list_locations.totalCount` which the runner does not support. Product behavior is correct: 102 locations, keyword "Main" returns 2 results ("Times Square - Main_2 FFC", "Wall Street - Main_3 FFC"), pageInfo intact, all `isActive=true`. No product defect. No new information.

**Evidence:** `reports/regression/REG-2026-04-29-1040/graphql-evidence/GQL-127-1777452155451.json`

---

## GQL-129 — PASS (BUG-050k-002 fix VALIDATED)

**Previous failure:** Dynamic products filter returned product `8e0eaa82` (min_qty=10), addItem(qty:1) silently rejected, SEED_CITY never captured.

**This run:** `@td(BUYABLE_NO_MIN_QTY.id)` resolves to `b3f5bd0c` (Canvas Pencil Case). `addItem(qty:1)` succeeds with `validationErrors=[]`. `CART_ID` captured. `probe_baseline` returns `totalCount=102`. `SEED_CITY=New York` captured (non-empty). `probe_keyword_match` with keyword "New York" returns `totalCount=71`. All 7 assertions PASS.

**Conclusion:** BUG-050k-002 fix VALIDATED.

---

## GQL-130 — FAIL (product gap: facet aggregation not implemented — GAP-XPICKUP-001 confirmed)

**Hypothesis:** Product gap — no change from REG-2026-04-29-1015.

`probe_facets` returns `term_facets=[]` with 102 locations spanning multiple countries (USA, AUS confirmed in probe_all_locations data). The facet argument is accepted without error but produces no aggregation. Two additional assertion failures are runner predicate issues (`is non-empty` not supported, null index on empty array), but the core product gap is confirmed. The cart setup is correct: addItem succeeded (PRODUCT_ID=60a67fe6), totalCount=102.

**Conclusion:** GAP-XPICKUP-001 reaffirmed. Facet aggregation is not implemented for `cartPickupLocations` in PR#8. This is likely out of scope for the IncludeLocationIds fix.

**Evidence:** `reports/regression/REG-2026-04-29-1040/graphql-evidence/GQL-130-1777452184437.json`

---

## GQL-131 — FAIL (product gap: filter argument broken — GAP-XPICKUP-002 confirmed)

**Hypothesis:** Product gap — no change from REG-2026-04-29-1015.

`probe_baseline` returns `totalCount=102` with `SEED_COUNTRY=USA`. `probe_filter_match` with `filter: "address.countryCode:USA"` returns `totalCount=0` — all 102 USA locations are excluded by a filter matching their own country code. This behavior (0 results when filtering for a country that accounts for the majority of locations) confirms the filter is either not applied or inverted. Two cross-OP COUNT assertions fail due to runner limitations (not product issues). Core finding: `cartPickupLocations` filter is non-functional.

**Conclusion:** GAP-XPICKUP-002 reaffirmed. Filter aggregation not implemented for `cartPickupLocations` in PR#8.

**Evidence:** `reports/regression/REG-2026-04-29-1040/graphql-evidence/GQL-131-1777452193893.json`

---

## Action Items

| Priority | Action | Reason |
|----------|--------|--------|
| P0 | Investigate `addOrUpdateCartShipment` JSON_READER error with `pickupLocationId + price:0` | Blocks VCST-4707 verification |
| P1 | Fix runner false-negative: assertion equality check should strip parenthetical note text | GQL-094 query_paged_small marked FAIL despite actual=expected |
| P1 | Fix runner: support cross-OP COUNT comparisons (`totalCount <= op2.totalCount`) | GQL-127 and GQL-131 affected |
| P2 | Confirm GAP-XPICKUP-001/002 (facet+filter) are out of scope for PR#8 | If in scope → product bug; if not → separate ticket |
