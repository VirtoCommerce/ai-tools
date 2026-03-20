# Coverage Generation Report — COV-2026-03-20-1515

## Summary
- **Run date:** 2026-03-20 15:15
- **Scope:** domain: Orders & Quotes (Suite 04c)
- **Gaps analyzed:** 10
- **Test cases generated:** 14 (Critical: 0, High: 8, Medium: 6)
- **Test cases validated:** 0 / 14 (CI dry-run — no browser validation)
- **Suites modified:** [04c]
- **Suite test count:** 21 → 35 (+14)

## Layer Coverage Matrix
| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| Storefront UI | 14 | 04c | [NAV]/[ACT]/[DOM]/[STATE]/[MATH] |
| GraphQL xAPI | 5 (cross-layer) | 04c | [NETWORK]/[API] in Cross_Layer_Checks |
| Admin (cross-layer) | 2 | 04c | [ADMIN] steps in ORD-011, ORD-018 |

## Gap Results

| Gap ID | Feature | Cases | IDs | Priority |
|--------|---------|-------|-----|----------|
| GAP-OQ-01 | Reorder with existing cart items (merge) | 2 | ORD-007, ORD-008 | High |
| GAP-OQ-02 | Return/RMA request (full + partial) | 2 | ORD-009, ORD-010 | High |
| GAP-OQ-03 | Order cancellation by buyer | 2 | ORD-011, ORD-012 | High |
| GAP-OQ-04 | Order confirmation page details | 1 | ORD-013 | High |
| GAP-OQ-05 | Invoice/PDF download | 1 | ORD-014 | Medium |
| GAP-OQ-06 | Order search + pagination | 2 | ORD-015, ORD-016 | Medium |
| GAP-OQ-07 | Order date range filter | 1 | ORD-017 | Medium |
| GAP-OQ-08 | Quote RFQ quantity editing | 1 | QUOTE-016 | Medium |
| GAP-OQ-09 | Quote search by ID | 1 | QUOTE-017 | Medium |
| GAP-OQ-10 | Order status - Processing state | 1 | ORD-018 | High |

## Business Logic Coverage Improvement

| Business Rule | Before | After |
|---------------|--------|-------|
| BL-CART-008 (Cart persistence / merge) | Covered for sign-in merge | +2 cases for reorder merge (ORD-007/008) |
| BL-ORD-001 (Order state machine) | Partial (New, Shipped) | +2 cases (Processing ORD-018, confirmation ORD-013) |
| BL-ORD-002 (Cancellation restores inventory) | 0 storefront cases | 2 cases (ORD-011 cancel New, ORD-012 block Shipped cancel) |
| BL-ORD-003 (Partial fulfillment) | Partial (filter by Shipped) | +3 cases (search, pagination, date filter, Processing status) |
| BL-QUOTE-001 (Create RFQ) | Covered (5 cases) | +1 case (QUOTE-016 qty editing) |
| BL-QUOTE-004 (Quote lifecycle/status) | Covered (6 cases) | +1 case (QUOTE-017 search) |

## E2E Scenario Coverage Improvement

| E2E Scenario | Before | After |
|-------------|--------|-------|
| E2E-ORD-002 (Order history filter/search/pagination) | Partial (status filter only) | +3 cases (search, pagination, date range) |
| E2E-ORD-004 (Order status lifecycle) | Partial (New, Shipped) | +1 case (Processing intermediate state) |
| E2E-ORD-005 (Return/RMA request) | 0 cases | 2 cases (full + partial return) |
| E2E-ORD-006 (Invoice download) | 0 cases | 1 case (PDF download verification) |

## Remaining Gaps (not addressed — requires separate suites or features)
- **Order payment state machine (BL-ORD-006)**: Admin-side, belongs in Suite 22 (Orders Admin)
- **Order shipment state machine (BL-ORD-007)**: Admin-side, belongs in Suite 22 (Orders Admin)
- **Order audit trail (BL-ORD-008)**: Admin-side, belongs in Suite 22 (Orders Admin)
- **Refund conditions (BL-ORD-004)**: Admin-side payment operations, belongs in Suite 22
- **Order number uniqueness (BL-ORD-005)**: Partially covered by ORD-004/ORD-013; deeper verification is backend scope
- **Quote admin workflow (RFQ processing in Admin SPA)**: Belongs in Suite 20 (Admin Quotes/Orders)

## Files Modified
- `regression/suites/Frontend/04c-orders-quotes-tests.csv` — 14 test cases appended (ORD-007 to ORD-018, QUOTE-016, QUOTE-017)
- `config/test-suites.json` — testCount updated: 04c: 21 → 35
- `reports/coverage/gap-inventory-orders-quotes-2026-03-20.json` — gap inventory created
