# W3 — Catalog, search & BOPIS · REG-2026-11-26-0425-W3

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S3.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 036 BOPIS Store Selector | 53 | 31 | 2 | 8 | 12 |
| 002 Product Detail | 33 | 14 | 2 | 16 | 1 |
| 005 Search Filters & Advanced | 48 | 11 | 1 | 8 | 28 |
| 003 Catalog Filters | 30 | 6 | 0 | 0 | 24 |
| 004 Search Core | 64 | 37 | 2 | 19 | 6 |
| 001 Catalog Navigation | 30 | 15 | 1 | 6 | 8 |

## Before morning triage (owner) — 65 FAIL/BLOCKED without a ledger row
- **Likely real (all in the kb):** BOPIS-096/100 pickup map adds no markers after "Load more" (KB-50A4CB1D); SRCH-NEW-104 "Reset search" keeps the facet (VCST-6607); SRCH-NEW-004 Clear (X) closes the dropdown (VCST-6613); CAT-083/084 Backspace sends a half-deleted quantity (VCST-6768); CAT-054 no EUR price shows €0.00 (VCST-6605).
- **Bug or stale:** SRCH-008 expects a clearable search history — the Hints list has no clear control (KB-B64698E8).
- **Incidental, unconfirmed:** during BOPIS-026 a billing last name with a digit was accepted, checkout said "Some of the addresses are not valid", yet order CO261126-00006 was created (KB-EDFA4DBF, High?); pickup-address edit button has no accessible name; mobile search overlay raw key `common.labels.close` (KB-F3B1E987); language list shows "English" twice (en-GB / en-US).
- **Probably stale cases:** BOPIS-008/009/010 (dialog has no availability/distance filter, KB-B66D0EE4); 036 wording (cart shows address, not location name; page-1 location not moved to top); CAT-081 "same set as API" (sidebar hides empty roots); SRCH-009 needs >10 orgs.
- **Not deployed:** 14 compare cases in 002 (CAT-030..034, CAT-COMP-001..009) — ProductComparison module missing on vcst (KB-08ABB6B1, PLAN.md §Not delivered).
- **Environment / runner:** `[EXCLUSIVE]` → WX (BOPIS-104..107, SRCH-014/016..023, SRCH-FSORT-001..004/006, CAT-AURL-001); no `evaluate`/route (004 SRCH-011/012/024..027/029..031/033, 001 CAT-040/041/049); lane limits (BOPIS-013/018; BOPIS-108 needs 151 locations, stand has 115); fixtures — `agent-test-wish-twostore` cannot sign in and has no vcst entry in `test-accounts.local.json` (CAT-079/080), no configurable/variation product (CAT-045/082), HOODIE fixture images 404 (SRCH-NEW-040), BOPIS-006 persona always has a pinned location.
- **Runner note:** the lanes hold `AGENT_SLOT<N>_PASSWORD_VCST`, not `AGENT_POOL_SLOT_<N>_…`.
- **Cleanup left:** order CO261126-00006 (BOPIS-026) not cancelled — the chrome lane has no Admin access.

## Re-run REG-2026-11-26-1200-RC (002 compare, after `VirtoCommerce.ProductComparison` 3.1000.0 was installed)
14/14 pass (CAT-030..034, CAT-COMP-001..009). Compare works on vcst. Case text updated to the live UI: no compare bar (header "Compare" link), "Add to Compare" buttons on cards, "Clear all" + OK, list saved server-side, "Restore products" after a signed-in clear (KB-47A4FE64). AGENT-TEST-CMP-* product images 404 (seed images missing).
