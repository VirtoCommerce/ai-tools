# Coverage Generation Report — COV-2026-03-20-1430

## Summary
- **Run date:** 2026-03-20 14:30
- **Scope:** domain: Cart & Checkout (Suites 04a, 04b)
- **Gaps analyzed:** 12
- **Test cases generated:** 22 (Critical: 5, High: 13, Medium: 4)
- **Test cases validated:** 0 / 22 (CI dry-run — no browser validation)
- **Suites modified:** [04a, 04b]
- **Suite test counts:** 04a: 48 → 56 (+8), 04b: 49 → 63 (+14)

## Layer Coverage Matrix
| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| Storefront UI | 22 | 04a, 04b | [NAV]/[ACT]/[DOM]/[STATE]/[MATH] |
| GraphQL xAPI | 6 (cross-layer) | 04a, 04b | [NETWORK]/[API] in Cross_Layer_Checks |

## Gap Results

| Gap ID | Feature | Cases | IDs | Priority |
|--------|---------|-------|-----|----------|
| GAP-CC-01 | Currency switching recalculates cart | 3 | CART-049, CART-050, CART-051 | Critical |
| GAP-CC-02 | Cart isolation per organization | 2 | CART-052, CART-053 | High |
| GAP-CC-03 | Pack size / MOQ enforcement | 2 | CART-054, CART-055 | Medium |
| GAP-CC-09 | Select/unselect items for partial checkout | 1 | CART-056 | Medium |
| GAP-CC-04 | Double-submit prevention (Place Order) | 2 | CHK-050, CHK-051 | Critical |
| GAP-CC-05 | Payment retry after decline | 2 | CHK-052, CHK-053 | High |
| GAP-CC-06 | Minimum order amount enforcement | 2 | CHK-054, CHK-055 | High |
| GAP-CC-07 | Saved credit cards (reuse/delete) | 2 | CHK-056, CHK-057 | High |
| GAP-CC-08 | Ship-to address selector | 3 | CHK-058, CHK-059, CHK-060 | High |
| GAP-CC-10 | Session timeout during checkout | 1 | CHK-061 | Medium |
| GAP-CC-11 | Browser back button during payment | 1 | CHK-062 | High |
| GAP-CC-12 | Billing field-level validation | 1 | CHK-063 | Medium |

## Business Logic Coverage Improvement

| Business Rule | Before | After |
|---------------|--------|-------|
| BL-CART-004 (Currency switching recalculates cart) | 0 cases | 3 cases (CART-049/050/051) |
| BL-CART-005 (Cart isolation per organization) | 0 cases | 2 cases (CART-052/053) |
| BL-CART-006 (Pack size enforcement) | 0 cases | 2 cases (CART-054/055) |
| BL-CHK-002 (Double-submit prevention) | 0 cases | 3 cases (CHK-050/051 + CHK-062) |
| BL-CHK-003 (Address validation by country) | Partial (CHK-026-030) | +1 case (CHK-063 billing field-level) |
| BL-CHK-004 (Payment retry after decline) | 0 cases | 2 cases (CHK-052/053) |
| BL-CHK-005 (Shipping depends on address) | Partial (CHK-003) | +3 cases (CHK-058/059/060 ship-to selector) |
| BL-CHK-007 (Minimum order amount) | 0 cases | 2 cases (CHK-054/055) |

## Remaining Gaps (not addressed — requires separate suites or features)
- **Subscription/recurring orders**: Listed in feature-domain-map as GAP; requires dedicated suite or feature enablement verification
- **Admin-side order management workflows**: Belongs in Suite 22 (Orders Admin)
- **Payment gateway-specific tests (Skyflow, AuthorizeNet, DataTrance)**: Partially covered by Suite 06 (Payment); gateway-specific edge cases may need expansion there
- **Quote-to-order pricing lock**: Suite 04c covers quote flow (QUOTE-001 to QUOTE-015) — adequate for current scope

## Note on Manifest Correction
Suite 04b manifest `testCount` was previously 74 but actual CSV contained 49 cases (CHK-001 to CHK-049). Updated to reflect true count: 63 (49 existing + 14 new).

## Files Modified
- `regression/suites/Frontend/04a-cart-tests.csv` — 8 test cases appended (CART-049 to CART-056)
- `regression/suites/Frontend/04b-checkout-tests.csv` — 14 test cases appended (CHK-050 to CHK-063)
- `config/test-suites.json` — testCount updated: 04a: 48 → 56, 04b: 74 → 63 (corrected + new)
- `reports/coverage/gap-inventory-cart-checkout-2026-03-20.json` — gap inventory created
