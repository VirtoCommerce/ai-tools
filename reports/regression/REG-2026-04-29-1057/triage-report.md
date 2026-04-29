# Triage Report — Suite 050k GraphQL xPickup
**Run:** REG-2026-04-29-1057 | **Date:** 2026-04-29 | **Module:** VirtoCommerce.XPickup 3.1001.0-pr-8-3380
**Delta from:** REG-2026-04-29-1040 (2 PASS / 4 FAIL) → REG-2026-04-29-1057 (3 PASS / 3 FAIL)

---

## GQL-094 — FAIL (runner false-negative; BUG-050k-001-v2 VALIDATED)

**Previous failure:** `addOrUpdateCartShipment` returned JSON_READER because `shipmentMethodCode` was missing.

**This run:** The BuyOnlinePickupInStore/Pickup binding fix works. `addOrUpdateCartShipment` returns HTTP 200 with 0 errors. `shipmentMethodCode=BuyOnlinePickupInStore`, `shipmentMethodOption=Pickup`, and `pickupLocation.id=3e77a4dc` all confirmed in response. The runner then executed `query_keyword_exclude` (exclusion keyword) and `query_paged_small` (first:1 paging) — both returned `items.0.id=3e77a4dc`, matching `LAST_LOCATION_ID` exactly.

**Why runner reports FAIL:** Assertion equality comparison includes the full parenthetical annotation text in the expected string (`... (confirmed location at index 0 despite keyword exclusion — VCST-4707 fix assertion)`) but compares against the raw data path result which contains only the value. String mismatch despite `actual = expected` at the data level. This is a runner parser bug (BUG_050k_001_v3).

**VCST-4707 IncludeLocationIds verdict: NOW VERIFIED.** Confirmed location `3e77a4dc` (Colinborough) appears at `items[0]` in both keyword-exclusion query and first:1 paged query — IncludeLocationIds prepend is functioning in PR#8.

**Evidence:** `reports/regression/REG-2026-04-29-1057/graphql-evidence/GQL-094-1777465796802.json`

---

## GQL-127 — FAIL (runner limitation only; no change)

7/8 functional assertions pass. The single failure is the cross-OP COUNT comparison `totalCount <= list_locations.totalCount` which the runner does not support (unrecognized COUNT predicate). Product behavior is correct and unchanged. No new information.

**Evidence:** `reports/regression/REG-2026-04-29-1057/graphql-evidence/GQL-127-1777465821431.json`

---

## GQL-130 — FAIL (product gap GAP-XPICKUP-001; no change)

`term_facets=[]` despite facet argument and 102 locations. Facet aggregation not implemented in PR#8 for `cartPickupLocations`. Unchanged from REG-2026-04-29-1040.

---

## GQL-131 — FAIL (product gap GAP-XPICKUP-002 + min_qty regression; same root cause as GQL-094 before fix)

`probe_baseline.totalCount=0` because GQL-131's `setup_prod` dynamic filter returns product `8e0eaa82` (min_qty=10) and `addItem(qty:1)` is silently rejected. `SEED_COUNTRY` captured as empty string; all downstream assertions cascade. Fix: apply `@td(BUYABLE_NO_MIN_QTY.id)` alias in GQL-131 `add_item` step (same fix applied to GQL-094 and GQL-129). The underlying filter gap (GAP-XPICKUP-002) remains unverifiable until this is fixed.

**Evidence:** `reports/regression/REG-2026-04-29-1057/graphql-evidence/GQL-131-1777465862627.json`

---

## Action Items

| Priority | Action |
|----------|--------|
| P0 | Fix runner: strip parenthetical annotation from assertion expected-value before equality check (BUG_050k_001_v3) — blocks GQL-094 from reporting clean PASS |
| P1 | Fix GQL-131 setup: replace dynamic setup_prod with `@td(BUYABLE_NO_MIN_QTY.id)` so probe_baseline gets a non-empty cart |
| P1 | Fix runner: support cross-OP COUNT comparisons (`totalCount <= op2.totalCount`) — GQL-127 and GQL-131 affected |
| P2 | Confirm GAP-XPICKUP-001/002 (facet+filter) scope relative to PR#8 — separate ticket if not in scope |
