# Coverage Generation Report — COV-2026-03-20-1545

## Summary
- **Run date:** 2026-03-20 15:45
- **Scope:** domain: BOPIS / Pickup (Suite 05)
- **Gaps analyzed:** 6
- **Test cases generated:** 9 (Critical: 0, High: 4, Medium: 5)
- **Test cases validated:** 0 / 9 (CI dry-run — no browser validation)
- **Suites modified:** [05]
- **Suite test count:** 79 → 88 (+9)

## Layer Coverage Matrix
| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| Storefront UI | 9 | 05 | [NAV]/[ACT]/[DOM]/[STATE]/[MATH] |
| GraphQL xAPI | 2 (cross-layer) | 05 | [NETWORK]/[API] in Cross_Layer_Checks |

## Gap Results

| Gap ID | Feature | Cases | IDs | Priority |
|--------|---------|-------|-----|----------|
| GAP-BP-01 | Guest checkout with BOPIS | 2 | BOPIS-080, BOPIS-081 | High |
| GAP-BP-02 | Change pickup location mid-checkout | 2 | BOPIS-082, BOPIS-083 | High |
| GAP-BP-03 | BOPIS with coupon/discount | 2 | BOPIS-084, BOPIS-085 | Medium |
| GAP-BP-04 | Multiple items, different pickup locations | 1 | BOPIS-086 | Medium |
| GAP-BP-05 | Location load-more / pagination (10+) | 1 | BOPIS-087 | Medium |
| GAP-BP-06 | BOPIS order in order history display | 1 | BOPIS-088 | Medium |

## Business Logic Coverage Improvement

| Business Rule | Before | After |
|---------------|--------|-------|
| BL-BOPIS-002 (Pickup order = $0 shipping) | Covered (BOPIS-047/048) | +3 cases (coupon interaction BOPIS-084/085, guest BOPIS-080) |
| BL-BOPIS-004 (Location selection) | Covered (15+ cases) | +2 cases (mid-checkout change BOPIS-082/083) |
| BL-CHK-005 (Guest checkout) | Covered in Suite 04b | +2 BOPIS-specific guest cases (BOPIS-080/081) |
| BL-BOPIS-001 (Per-item fulfillment) | Covered (BOPIS-045/046 mixed cart) | +1 case (multi-location BOPIS-086) |
| BL-BOPIS-003 (Availability filtering) | Covered (12+ cases) | +1 case (load-more pagination BOPIS-087) |
| BL-BOPIS-006 (Pickup order details) | Covered (BOPIS-026 integration) | +1 case (order history display BOPIS-088) |

## E2E Scenario Coverage Improvement

| E2E Scenario | Before | After |
|-------------|--------|-------|
| E2E-BOPIS-004 (Change pickup location during checkout) | Not covered | 2 cases (BOPIS-082, BOPIS-083) |

## Note on Manifest Correction
Suite 05 manifest `testCount` was previously 36 but actual CSV contained 79 cases (BOPIS-001 to BOPIS-079). Updated to reflect true count: 88 (79 existing + 9 new).

## Remaining Gaps (not addressed)
- **BOPIS admin configuration**: Admin-side BOPIS setup and fulfillment center management belongs in Suite 30 (BOPIS Admin)
- **BOPIS notification/email**: Pickup ready notification to buyer — requires notification testing infrastructure
- **BOPIS time-window scheduling**: If pickup time slots are supported, needs dedicated test data setup

## Files Modified
- `regression/suites/Frontend/05-bopis-pickup-tests.csv` — 9 test cases appended (BOPIS-080 to BOPIS-088)
- `config/test-suites.json` — testCount updated: 05: 36 → 88 (corrected + new)
- `reports/coverage/gap-inventory-bopis-2026-03-20.json` — gap inventory created
