# Test Plan: Configurable Products Feature

## Test Plan Identifier
- **ID:** TP_CONFIGURABLE_PRODUCTS_001
- **Version:** 1.0
- **Date:** 2026-02-23
- **Author:** test-management-specialist
- **Environment:** QA

---

## 1. Introduction

### 1.1 Purpose

This test plan covers the Virto Commerce Configurable Products feature, which allows merchants to create products with selectable options (configuration sections containing multiple option products) and allows customers to build customized product configurations on the storefront.

### 1.2 Scope

**In Scope:**

**Admin SPA (Backend):**
- Creating configurable products in the Admin catalog
- Adding and managing configuration sections (groups)
- Adding option products to configuration sections
- Setting option prices, quantities, and required/optional flags
- Publishing and activating configurable products
- Editing existing product configurations
- Deleting options, sections, and configurable products
- Validation and error handling in Admin CRUD operations

**Storefront (Frontend):**
- Viewing configurable product detail page (PDP)
- "Configure the parameters" widget rendering
- Accordion section expand/collapse behavior
- Radio button option selection
- Price display per option (listPrice, salePrice, extendedPrice)
- Total price update as options are selected
- Quantity stepper behavior (starts at 0, must increase before add to cart)
- Adding configured product to cart
- Cart display showing selected configuration options
- Checkout flow with configured product in cart
- Order confirmation showing configuration details
- Order history and order detail page showing configuration
- "Create your own configuration" button behavior
- "Customers bought together" section
- Edge cases: required options, out-of-stock, price calculations with multiple options

**Out of Scope:**
- Non-configurable product types (simple, variation-based)
- Quote creation from configurable products (separate feature)
- Payment gateway configuration
- Inventory management beyond stock status display
- B2B approval workflows triggered by configurable product orders

### 1.3 References

| Reference | Description |
|-----------|-------------|
| Storefront URL | `${FRONT_URL}` (from `.env`) |
| Admin URL | `${BACK_URL}` (from `.env`) |
| Existing Regression | `regression/suites/Frontend/13-b2c-features-tests.csv` (CONFIG-001 to CONFIG-008) |
| Sitemap Reference | `sitemap.md` |

### 1.4 Test Environment Details

| Resource | Value |
|----------|-------|
| Storefront | `${FRONT_URL}` |
| Admin | `${BACK_URL}` |
| Store Version Explored | 2.42.0-alpha.2241 |
| Test Product URL | `${FRONT_URL}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options` |
| Product SKU | CVQ-54616437 |
| Category Path | Products with Options > Configurations > Build the bike of your dreams |

---

## 2. Test Items

| Item | Layer | Owner |
|------|-------|-------|
| Admin Catalog - Configurable Product CRUD | Backend | qa-backend-expert |
| Admin Configuration Section Management | Backend | qa-backend-expert |
| Admin Option Product Management | Backend | qa-backend-expert |
| Storefront Configurable Product PDP | Frontend | qa-frontend-expert |
| Storefront Configuration Widget | Frontend | qa-frontend-expert |
| Storefront Cart with Configured Items | Frontend | qa-frontend-expert |
| Storefront Checkout with Configured Items | Frontend | qa-frontend-expert |
| Order Management - Configured Orders | Frontend + Backend | qa-frontend-expert + qa-backend-expert |
| Price Calculation (salePrice and listPrice display) | Frontend | qa-frontend-expert |
| No-scroll behavior on radio button click (VCST-4612 regression) | Frontend | qa-frontend-expert |

---

## 3. Features to Be Tested

### 3.1 High Priority (P0/P1)

1. **Storefront: Configure and Add to Cart (Happy Path)**
   - Open "Bike with options" PDP
   - Widget renders with "Configure the parameters" header and "Select one" accordion
   - Select each radio option (Rear wheel, Engine, Seat, Pedals, None)
   - Price updates reflect selected option's extendedPrice
   - Set quantity > 0 using quantity stepper
   - Add configured product to cart successfully

2. **Storefront: Price Display per Option**
   - Each option row displays price and extended price
   - salePrice shown as primary price when discount exists, listPrice shown with strikethrough
   - extendedPrice = optionPrice x optionQuantity

3. **Storefront: Required vs Optional Configuration**
   - Accordion labeled "optional" - customer can proceed without selecting an option
   - Cart add works with "None" selected (default)
   - Cart add works with any radio option selected

4. **Storefront: Cart Contents with Configuration**
   - Cart shows configured product with selected option details
   - Total price is correct

5. **Admin: Create Configurable Product**
   - Create product with configurations in Admin SPA
   - Add configuration section with option products
   - Set prices and quantities per option
   - Publish product

6. **Admin: Edit Configuration**
   - Edit existing configurable product configuration
   - Add/remove sections and options
   - Save and verify changes on storefront

### 3.2 Medium Priority (P2)

1. **Storefront: Accordion Expand/Collapse**
2. **Storefront: No auto-scroll on radio click (VCST-4612 regression)**
3. **Storefront: Long option name display**
4. **Storefront: "Create your own configuration" button**
5. **Storefront: "Customers bought together" section**
6. **Storefront: Quantity stepper validation (starts at 0)**
7. **Admin: Validation errors on required fields**
8. **Admin: Delete option from configuration**

### 3.3 Low Priority (P3)

1. **Storefront: Wishlist button behavior for unauthenticated user**
2. **Storefront: Breadcrumb navigation from configurable product PDP**
3. **Storefront: "None" option as default selection state**
4. **Admin: Configuration section order/sorting**

---

## 4. Features Not to Be Tested

- Payment gateway processing (covered by suite 06-payment-tests)
- Authentication and login flows (covered by suite 02-authentication-tests)
- SEO/sitemap for configurable product URLs
- Bulk import of configurable products
- Multi-language configurable product names (covered by suite 10-localization-tests)
- Mobile-specific layout (covered by suite 12-browser-compatibility-tests)

---

## 5. Approach

### 5.1 Test Levels

| Level | Description | Owner |
|-------|-------------|-------|
| Functional UI Testing | Storefront PDP, widget, cart, checkout | qa-frontend-expert |
| Admin CRUD Testing | Admin SPA product and configuration management | qa-backend-expert |
| Integration Testing | Admin create -> Storefront verify | qa-backend-expert + qa-frontend-expert |
| Regression Testing | Existing CONFIG-001 to CONFIG-008 | qa-frontend-expert |

### 5.2 Test Types

- Functional Testing (primary focus)
- Integration Testing (Admin to Storefront round-trip)
- Regression Testing (validate existing CONFIG-001 to CONFIG-008 still pass)
- Exploratory Testing (discover edge cases not covered by scripted tests)

### 5.3 Test Techniques

- **Happy Path First:** Complete the core configured-product-to-order flow before testing edge cases
- **Boundary Value Analysis:** Quantity stepper (0, 1, max), price calculations
- **Error Guessing:** Add to cart at qty 0, skip required selections, invalid option combinations
- **State Transition Testing:** accordion closed -> open -> option selected -> option changed -> none selected

### 5.4 UI Exploration Findings (from live snapshot)

Explored `${FRONT_URL}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options` (v2.42.0-alpha.2241):

- Widget header: "Configure the parameters"
- Accordion button label: "Select one Personalize your selection further (optional)"
- Radio group: 5 options under "Select one"
  - "Rear wheel, 26\", double-wall rim, motorized" — $88.00 / $126.00 (qty 2, extended $176.00)
  - "200CC 250CC 4-Stroke Engine Motor..." (very long name) — $225.00 (qty 1, extended $225.00)
  - "Seat" — $15.00 (qty 1, extended $15.00)
  - "Pedals" — $14.00 (qty 1, extended $14.00)
  - "None" — checked by default
- Base product price: $350.00
- Quantity stepper: starts at 0 (add to cart button disabled until qty > 0)
- "In stock" badge: 7567 units
- "Create your own configuration" button present
- "Customers bought together" section: Off-Road Bike, Vintage Wedding Cake, Entertainment set, Hoodie Base

---

## 6. Test Deliverables

| Deliverable | Location | Status |
|-------------|----------|--------|
| Test Plan (this document) | `tests/configurable-products/test-plan.md` | Done |
| Test Cases (detailed) | `tests/configurable-products/test-cases.md` | Done |
| TestRail Import CSV | `tests/configurable-products/testrail-import.csv` | Done |
| E2E Test Cases (Admin→Frontend) | `tests/configurable-products/test-cases-e2e.md` | Done |
| E2E TestRail Import CSV | `tests/configurable-products/testrail-import-e2e.csv` | Done |
| Screenshots (execution) | `tests/configurable-products/screenshots/desktop/` | Pending (execution phase) |

---

## 7. Test Environment

### 7.1 Prerequisites

- QA environment accessible
- Admin account with catalog edit permissions (`${ADMIN}` / `${ADMIN_PASSWORD}`)
- Storefront user account for authenticated tests (`${USER_EMAIL}` / `${USER_PASSWORD}`)
- "Bike with options" product (SKU: CVQ-54616437) available at configurable products category
- At least one configurable product exists at `/products-with-options/configurations/`
- Storefront in English (default locale)

### 7.2 Test Data

| Data Item | Value |
|-----------|-------|
| Configurable Product URL | `${FRONT_URL}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options` |
| Product SKU | CVQ-54616437 |
| Base Price | $350.00 |
| Option: Rear wheel | $88.00 sale / $126.00 list, qty 2, extended $176.00 |
| Option: Engine | $225.00, qty 1, extended $225.00 |
| Option: Seat | $15.00, qty 1, extended $15.00 |
| Option: Pedals | $14.00, qty 1, extended $14.00 |
| Option: None | Default selected |
| Admin URL | `${BACK_URL}` |
| Admin Credentials | `${ADMIN}` / `${ADMIN_PASSWORD}` |

---

## 8. Responsibilities

| Role | Responsibility |
|------|----------------|
| **test-management-specialist** | Test plan, test case design, coverage tracking |
| **qa-frontend-expert** | Execute storefront test cases (TC-CF-001 to TC-CF-020) |
| **qa-backend-expert** | Execute Admin SPA test cases (TC-CA-001 to TC-CA-015) |
| **qa-lead-orchestrator** | Test plan approval, go/no-go decision |

---

## 9. Schedule

| Phase | Duration | Owner |
|-------|----------|-------|
| Test Planning & Case Writing | 1 day | test-management-specialist |
| Admin CRUD Execution | 1 day | qa-backend-expert |
| Storefront Execution | 1.5 days | qa-frontend-expert |
| Regression Verification | 0.5 days | QA team |
| Sign-off | 0.5 days | qa-lead-orchestrator |
| **Total** | **4.5 days** | |

---

## 10. Entry Criteria

- [ ] QA environment is stable and accessible
- [ ] "Bike with options" configurable product exists in QA catalog
- [ ] Test plan reviewed and approved by qa-lead-orchestrator
- [ ] Test cases written and reviewed
- [ ] Admin credentials available and working

---

## 11. Exit Criteria

- [ ] All P0 test cases executed and passing
- [ ] All P1 test cases executed (pass rate >= 90%)
- [ ] No new critical or high-severity bugs open
- [ ] Existing CONFIG-001 to CONFIG-008 regression tests verified
- [ ] qa-lead-orchestrator sign-off obtained

---

## 12. Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Vue.js dynamic rendering causes empty snapshots | Medium | Low | Use `browser_wait_for` with text="Configure" before snapshot |
| Admin UI changes between versions | Low | Medium | Verify admin navigation path before running admin test cases |
| Configurable product not available in QA | Low | High | Verify product URL before execution; create new product if missing |

---

## 13. Existing Regression Coverage Reference

The following test cases from `regression/suites/Frontend/13-b2c-features-tests.csv` already cover configurable products at a smoke level and must not regress:

| ID | Title | Section |
|----|-------|---------|
| CONFIG-001 | Verify configurable options are displayed on product page | B2C Features > Configurations |
| CONFIG-002 | Verify required option prevents add to cart | B2C Features > Configurations |
| CONFIG-003 | Verify optional add-on can be skipped | B2C Features > Configurations |
| CONFIG-004 | Verify text input configuration option | B2C Features > Configurations |
| CONFIG-005 | Verify image upload configuration option | B2C Features > Configurations |
| CONFIG-006 | Verify dependent options show/hide correctly | B2C Features > Configurations |
| CONFIG-007 | Verify bundle/kit builder configuration | B2C Features > Configurations |
| CONFIG-008 | Verify price calculation accuracy with multiple options | B2C Features > Configurations |

New test cases in this plan extend this coverage significantly.

---

## 14. Approval

| Role | Status | Date |
|------|--------|------|
| test-management-specialist | Completed | 2026-02-23 |
| qa-lead-orchestrator | Pending | — |

---

*Test Plan Version 1.0 — Generated 2026-02-23 by test-management-specialist*
