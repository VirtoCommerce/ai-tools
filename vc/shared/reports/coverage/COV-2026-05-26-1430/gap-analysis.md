# Coverage Gap Analysis — Order History Page Filter

- **Run:** COV-2026-05-26-1430
- **Scope:** Custom narrow — `/account/orders` filter / search / sort interactions
- **Layer:** Storefront UI only
- **Target suite:** `regression/suites/Frontend/orders/014-orders-frontend.csv` (domain: purchase-flow, currently 67 cases)

## Existing Coverage (12 cases)

| ID | Title | Concern |
|----|-------|---------|
| ORD-006 | Status filter (Shipped) | Single-status filter |
| ORD-015 | Search by order number | Exact-match search |
| ORD-016 | Pagination | Page navigation |
| ORD-017 | Date range filter | Valid range |
| ORD-019 | Multi-status filter | OR-style multi-select |
| ORD-020 | Sort by date asc/desc | Sort direction |
| ORD-021 | Sort by total | Numeric sort |
| ORD-022 | Clear / Reset filters | Global reset |
| ORD-023 | Sort by status column | Column-header sort |
| ORD-024 | Empty state — no filter match | Zero-result UX |
| ORD-025 | Empty state — search no results | Zero-result UX |
| ORD-027 | Mobile filters collapsed | Responsive |

## Gaps Identified (10)

| Gap | Priority | Category | Hook |
|-----|----------|----------|------|
| GAP-OHF-001 Filter persistence across nav | P1 | MISSING_NEGATIVE | ECL-3.2 "Filter persists incorrectly" |
| GAP-OHF-002 Filter + sort combination | **P0** | SHALLOW_HAPPY | ECL-3.2 "Sort resets on filter" |
| GAP-OHF-003 Date range start > end validation | P1 | MISSING_NEGATIVE | Negative path |
| GAP-OHF-004 Date range single-day BVA | P1 | MISSING_NEGATIVE | Boundary |
| GAP-OHF-005 Filter + search combination | P1 | SHALLOW_HAPPY | Intersection logic |
| GAP-OHF-006 Pagination + filter combination | P1 | SHALLOW_HAPPY | Filter preservation across pages |
| GAP-OHF-007 URL deep-link / refresh | P1 | MISSING_NEGATIVE | State serialization |
| GAP-OHF-008 Partial / prefix order-number search | P1 | MISSING_NEGATIVE | Common buyer flow |
| GAP-OHF-009 B2B org-scoped filter | P1 | MIGRATION_GAP | B2B variant |
| GAP-OHF-010 Active filter chip removal | P2 | SHALLOW_HAPPY | Chip-level UX |

## Out-of-Scope Findings (not addressed this run)

- Many existing ORD-* filter cases reference **BL-ORD-003** as the business rule. BL-ORD-003 is semantically about **partial fulfillment** (shipments), not list filtering. A dedicated BL entry for orders-list query behavior would be appropriate. Documented for follow-up.

## Plan

Dispatch a single `qa-frontend-expert` sub-agent (browser slot: `playwright-chrome`) to generate 10 cases appending to suite 014. The 1-domain narrow scope does not warrant the 3-batch parallel pipeline.
