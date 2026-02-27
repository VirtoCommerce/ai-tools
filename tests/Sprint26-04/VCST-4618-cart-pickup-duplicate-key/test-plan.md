# Test Plan: VCST-4618
# GetCartPickupLocations Fails with Duplicate Key Error (Configurable Products)

**Ticket:** [VCST-4618](https://virtocommerce.atlassian.net/browse/VCST-4618)
**Type:** Bug Verification
**Priority:** Critical / P0
**Status:** Testing
**Assignee (dev):** Oleg Zhuk (oleg@virtoworks.com)
**QA Lead:** QA Lead Orchestrator
**Sprint:** Sprint 26-04
**Date:** 2026-02-26

---

## 1. Summary

A critical bug in the `vc-module-x-pickup` module causes the `cartPickupLocations` GraphQL query to throw `System.ArgumentException: An item with the same key has already been added` whenever a cart contains two or more configurable product line items that share the same base `ProductId` but have different configuration options.

The fix replaces the raw `.ToDictionary()` call at `SearchCartPickupLocationsQueryHandler.cs:line 36` with a `.GroupBy().Select().ToDictionary()` pattern that deduplicates by `ProductId` and sums quantities.

This test plan verifies:
1. The bug is resolved — the `cartPickupLocations` query no longer throws when a cart contains duplicate-ProductId configurable items.
2. No regression in adjacent BOPIS flows (product page widget, existing cart pickup modal, delivery switching).
3. The fix correctly aggregates quantities when multiple configurable variants of the same base product are in the cart.

---

## 2. Scope

### In Scope

| Area | Coverage |
|------|----------|
| GraphQL `cartPickupLocations` query with multi-variant configurable cart | Primary bug fix verification |
| GraphQL `cartPickupLocations` query with single-variant cart | Regression check |
| GraphQL `cartPickupLocations` quantity aggregation logic | Fix correctness |
| GraphQL `productPickupLocations` query | Regression — adjacent query must not be affected |
| Cart page BOPIS modal open/close from pencil icon | Frontend bug fix verification |
| Cart page BOPIS faceted filters (Country, State, City) | Frontend functional verification |
| Cart page pickup location selection and confirmation | Frontend flow verification |
| Delivery method switching (Pickup to Delivery and back) | Regression |
| Product page BOPIS view-only modal | Regression |
| Empty cart edge case | Edge case |
| Single-item cart (regular product) | Edge case / regression |
| Single-item cart (configurable product) | Edge case |
| Cart with max items, all same base ProductId | Stress edge case |

### Out of Scope

- Payment processing
- Non-BOPIS checkout flows
- Admin module configuration
- Module installation/upgrade procedures

---

## 3. Test Environment

| Resource | Value |
|----------|-------|
| Frontend URL | https://vcst-qa-storefront.govirto.com |
| Backend / GraphQL | https://vcst-qa.govirto.com |
| GraphQL Playground | https://vcst-qa.govirto.com/ui/graphiql |
| Store ID | B2B-store |
| Test user | mutykovaelena@gmail.com / Password2! |
| Admin | admin / Password1! |
| Repro user | Alice May, BMW-Group organization |
| Module | vc-module-x-pickup |
| Handler | SearchCartPickupLocationsQueryHandler.cs:36 |

---

## 4. Test Data Requirements

### Configurable Product Setup
- A configurable product (e.g., "Bike with options") that has at least two selectable option variants
- Both variants must map to the same base `ProductId` in the cart
- Pickup (fulfillment center) locations must be configured for the store

### User Accounts
- Authenticated B2B user with an active cart (mutykovaelena@gmail.com)
- Alternative: Alice May in BMW-Group organization (original repro account)

### Cart States Needed
| State ID | Description |
|----------|-------------|
| CART-A | Empty cart |
| CART-B | 1x single regular (non-configurable) product, Pickup selected |
| CART-C | 1x configurable product (Option A only) |
| CART-D | 2x same configurable product with different options (Option A + Option B) — primary repro |
| CART-E | 3+ configurable items all with the same base ProductId |
| CART-F | Mixed cart: regular products + configurable duplicates |

---

## 5. Test Strategy

### Backend Testing (qa-backend-expert — playwright-edge)
Direct GraphQL query execution via the GraphQL Playground at `https://vcst-qa.govirto.com/ui/graphiql`. Verify query responses, error absence, and data correctness for all cart states.

### Frontend Testing (qa-frontend-expert — playwright-chrome)
Storefront browser automation. Test the cart page BOPIS UI flow from the user perspective — open the modal, use filters, select and confirm a pickup location.

### Execution Order
1. Backend tests first (TC-BE-001 through TC-BE-010) to confirm the API layer is clean.
2. Frontend tests second (TC-FE-001 through TC-FE-012) to confirm UI behavior is correct end-to-end.
3. Edge case tests last (TC-EC-001 through TC-EC-005).

---

## 6. Team Assignment

| Agent | Browser / Tool | Scope |
|-------|---------------|-------|
| qa-backend-expert | playwright-edge + GraphQL Playground | TC-BE-001 to TC-BE-010 |
| qa-frontend-expert | playwright-chrome | TC-FE-001 to TC-FE-012 |
| qa-backend-expert | playwright-edge | TC-EC-001 to TC-EC-005 (edge cases via GraphQL) |

---

## 7. Entry Criteria

- [ ] Fix deployed to QA environment (`https://vcst-qa.govirto.com`)
- [ ] `vc-module-x-pickup` module version updated on QA
- [ ] Configurable products with shared base ProductId available in the catalog
- [ ] Pickup locations configured for B2B-store
- [ ] Test accounts accessible

---

## 8. Exit Criteria

### Pass Criteria (ALL must be true to mark TESTED)
- All Critical and High priority test cases pass
- `cartPickupLocations` query returns valid data (no exception) for a cart with two configurable variants of the same product
- Quantity aggregation is correct (sum of quantities across variants with same ProductId)
- Cart BOPIS modal opens without error toast
- Pickup location can be selected and confirmed from cart
- No regressions in `productPickupLocations` query
- Product page BOPIS view-only modal unaffected

### Fail Criteria (any of these triggers REOPEN)
- `cartPickupLocations` still throws `ArgumentException` for multi-variant configurable cart
- Quantity is wrong (not summed, or missing items)
- Cart BOPIS modal still shows error toast
- `productPickupLocations` query broken
- Delivery method switch breaks after fix

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fix deployed to wrong module version on QA | Medium | High | Verify module version in admin before testing |
| Configurable products not available in QA catalog | Medium | High | Check catalog before starting; use Alice May / BMW-Group repro setup |
| Quantity aggregation off-by-one error | Low | Medium | Verify sum explicitly with known quantities in TC-BE-005 |
| `productPickupLocations` handler also uses `.ToDictionary()` and is affected | Low | High | Included in regression scope (TC-BE-007) |
| Map rendering fails due to unrelated infrastructure issue | Low | Medium | Isolate to GraphQL layer; verify API independently before blaming fix |

---

## 10. Defect Reporting

All bugs found during this testing cycle are reported to:
- **Bug reports directory:** `reports/bugs/`
- **Jira project:** VCST
- **Bug severity baseline:** BOPIS modal blocked = Critical, Data incorrect = High, UI cosmetic = Low

---

## 11. Sign-off

| Role | Name | Status |
|------|------|--------|
| QA Lead | QA Lead Orchestrator | Approved |
| qa-backend-expert | (pending execution) | — |
| qa-frontend-expert | (pending execution) | — |
