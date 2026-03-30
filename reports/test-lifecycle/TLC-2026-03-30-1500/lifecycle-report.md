# Test Case Lifecycle Report — TLC-2026-03-30-1500

## Summary
- **Scope:** 7 Full-Field Schema Coverage Cases (GQL-113, GQL-114, GQL-096, GQL-097, GQL-013, GQL-046, GQL-047)
- **Date:** 2026-03-30
- **Platform:** 3.1010.0
- **Theme:** 2.45.0-pr-2216-dc3c
- **Module Versions:** Xapi 3.1005.0, XCatalog 3.1002.0, XCart 3.1004.0, XOrder 3.1001.0, ProfileExperienceApi 3.1004.0, Catalog 3.1013.0, Cart 3.1002.0, Orders 3.1002.0, Customer 3.1002.0
- **Verdict:** APPROVED WITH WARNINGS

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Analyze | — | Skipped | Cases already generated (--skip-generate) |
| 2. Generate | — | Skipped | Cases already generated (--skip-generate) |
| 3. Review | test-management-specialist | Done | 24 findings (B:0, C:4, H:9, M:11) across 7 dimensions |
| 4. Fix | test-management-specialist + orchestrator | Done | 11 auto-fixed, 13 deferred to Phase 5 |
| 5. Verify | qa-testing-expert (playwright-firefox) | Done | 6 introspection tasks, all fields VERIFIED, 0 BROKEN |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates: 7/8 PASS, 1 WARN |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1: Structure | PASS | 15-column format correct, unique IDs, no misalignment |
| G2: Determinism | PASS | All steps tagged, specific element refs, no ambiguity |
| G3: Completeness | PASS | After fix: all cases independently executable with [AUTH]+[NAV] |
| G4: Testability | PASS | All assertions falsifiable (types, non-null, numeric ranges) |
| G5: Data Validity | PASS | All fields verified via live introspection. MoneyType correct. @td() refs |
| G6: BL/ECL Coverage | WARN | BL-GQL-* IDs used but not formally defined in business-logic.md |
| G7: Duplication | PASS | No overlap with existing behavioral cases |
| G8: Environment | PASS | All types introspected, all fields exist, env healthy |

## Auto-Fixes Applied (Phase 4)

| Case | Fix | Type |
|------|-----|------|
| GQL-113 | Test_Data: `@td(PROD_DEFAULT.sku)` → `@td(PROD_DEFAULT.id)` | DV-001 |
| GQL-114 | Added `filter_facets` field to ProductConnection query | DV-009 |
| GQL-096 | Replaced hardcoded `AAW-59914334` with `@td(PROD_DEFAULT.id)` in SETUP step | DV-002 |
| GQL-097 | Added [AUTH]+[NAV]+[WAIT]+Headers steps for independent execution | C-001 |
| GQL-097 | Test_Data: replaced `AAW-59914334` with `@td()` refs; added `productOuterId` to query | DV-002, DV-009 |
| GQL-013 | Added [AUTH]+[NAV]+[WAIT]+Headers+[SETUP] order number lookup | C-001, D-001 |
| GQL-013 | Test_Data: replaced narrative with structured var bindings | D-001 |
| GQL-047 | Added [AUTH]+[NAV]+[WAIT]+Headers+[SETUP] org ID lookup via `me { contact { organizationId } }` | C-001 |

## Live Schema Introspection Results (Phase 5)

| Type | Fields Checked | Result |
|------|---------------|--------|
| Organization | contacts, seoObjectType, businessCategory, ownerId, outerId, description, status | ALL EXIST |
| ContactType | birthDate, organizationsIds, defaultBillingAddress, defaultShippingAddress, securityAccounts | ALL EXIST |
| UserType | passwordExpiryInDays, lockedState, permissions | ALL EXIST |
| DiscountType | coupon | EXISTS |
| OrderLineItemType | price, extendedPrice, discountAmount, taxTotal, placedPrice | ALL EXIST (MoneyType) |

**Note:** `SecurityAccountType` does not exist as a named type — `securityAccounts` on ContactType returns `[UserType]` directly. Our queries use the correct field sub-selection.

## Remaining Items

### Should Fix (improves quality, does not block regression)

| Cases | Issue | Dimension | Suggested Fix |
|-------|-------|-----------|---------------|
| All 7 | BL-GQL-* invariants not formally defined in business-logic.md | D6 | Add BL-GQL-001 through BL-GQL-004 definitions to business-logic.md |
| GQL-097 | Could add `note` field (omitted from LineItemType query) | D5 | Low priority — already added `productOuterId` |

## Files Modified
- `regression/suites/Backend/graphql/050a-graphql-xcatalog.csv` — GQL-113 test data fix, GQL-114 filter_facets added
- `regression/suites/Backend/graphql/050b-graphql-xcart.csv` — GQL-096 hardcoded ID fix, GQL-097 auth/nav/fields added
- `regression/suites/Backend/graphql/050c-graphql-xorder.csv` — GQL-013 auth/nav/setup added
- `regression/suites/Backend/graphql/050d-graphql-xprofile.csv` — GQL-047 auth/nav/setup added
- `config/test-suites.json` — Updated test counts (050a:29, 050b:63, 050c:3, 050d:14)

## Next Steps
- [ ] Run `/qa-regression 050a,050b,050c,050d` to execute the updated suites
- [ ] Optionally: add BL-GQL-* invariant definitions to `.claude/agents/knowledge/business-logic.md`
