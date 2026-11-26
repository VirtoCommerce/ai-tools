# Regression REG-2026-11-26-0425-W3 — Sprint 26-23 W3 Catalog, search & BOPIS

Env vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S3 · `--no-promote` · triage deferred to the owner.

## Frontend Suites
| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 036 BOPIS Store Selector | 31 | 2 | 8 | 12 |
| 002 Product Detail | 14 | 2 | 16 | 1 |
| 005 Search Filters & Advanced | 11 | 1 | 8 | 28 |
| 003 Catalog Filters | 6 | 0 | 0 | 24 |
| 004 Search Core | 37 | 2 | 19 | 6 |
| 001 Catalog Navigation | 15 | 1 | 6 | 8 |
| **Total (258)** | **114** | **8** | **57** | **79** |

No retries, no shared-cause halt. `[EXCLUSIVE]` cases recorded BLOCKED for WX.

## Bugs found (preliminary, for triage)
- BOPIS-096/100 — pickup map adds no markers after "Load more" (KB-50A4CB1D).
- SRCH-NEW-104 — "Reset search" keeps the facet (VCST-6607); SRCH-NEW-004 — search Clear (X) closes the dropdown (VCST-6613).
- CAT-083/084 — Backspace in quantity sends a half-deleted value (VCST-6768); CAT-054 — no EUR price shows €0.00 (VCST-6605).
- SRCH-008 — no clear control for search history (stale assertion or missing feature).
- Incidental: billing last name with a digit → "Some of the addresses are not valid" yet order CO261126-00006 created (KB-EDFA4DBF); pickup-address edit button unnamed; two "English" items in the language list.

## NOT_DEPLOYED / environment
14 compare cases in 002 (CAT-030..034, CAT-COMP-001..009): VirtoCommerce.ProductComparison not installed (KB-08ABB6B1). Runner forbids `evaluate`/route (004 SRCH-011/012/024–027/029–031/033, 001 CAT-040/041/049). Lane limits (BOPIS-013/018; BOPIS-108 needs 151 locations, stand has 115). Fixtures: two-store wishlist account cannot sign in (CAT-079/080), no configurable/variation product (CAT-045/082), HOODIE fixture images 404 (SRCH-NEW-040).

## Promotion
Skipped — `--no-promote`.
