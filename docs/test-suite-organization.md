# Virto Commerce Test Suite Organization

**Document Version:** 1.0
**Created:** 2026-02-03
**Last Updated:** 2026-02-03

---

## Overview

This document organizes all test cases from the `vc-mcp-testing-module` repository into logical test suites for efficient test execution and coverage tracking.

### Test Case Sources

| Location | Count | Description |
|----------|-------|-------------|
| `tests/` | 15 features | Active feature test cases |
| `test-data/regression/` | 1 file | Full regression suite (263KB) |
| `archive/sprints/` | 94 files | Historical sprint test cases (4 sprints) |

---

## Test Suite Structure

### 1. SMOKE TEST SUITE (Critical Path)

**Purpose:** Quick validation of critical revenue-impacting flows
**Execution Time:** ~30 minutes
**Priority:** P0 - Must pass before any release

| ID | Test Area | Source | Priority |
|----|-----------|--------|----------|
| SMK-001 | User Registration (Personal) | regression-qa-theme-26.csv | Critical |
| SMK-002 | User Registration (Organization) | regression-qa-theme-26.csv | Critical |
| SMK-003 | Sign In (Personal) | regression-qa-theme-26.csv | Critical |
| SMK-004 | Sign In (Organization) | regression-qa-theme-26.csv | Critical |
| SMK-005 | Catalog Browsing | regression-qa-theme-26.csv | Critical |
| SMK-006 | Product Search | regression-qa-theme-26.csv | Critical |
| SMK-007 | Add to Cart | regression-qa-theme-26.csv | Critical |
| SMK-008 | Cart Operations | VCST-4499 REG-002 | Critical |
| SMK-009 | Checkout - Delivery | VCST-4499 REG-001 | Critical |
| SMK-010 | Checkout - Pickup (BOPIS) | VCST-4499 TC-002 | Critical |
| SMK-011 | Payment Processing | VCST-4499 REG-005 | Critical |
| SMK-012 | Order Confirmation | VCST-4499 REG-004 | Critical |

---

### 2. REGRESSION TEST SUITE (Full Coverage)

**Purpose:** Complete regression coverage for release validation
**Execution Time:** ~4-6 hours
**Priority:** P1 - Required for major releases

#### 2.1 Authentication & User Management

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-AUTH-001 | Registration - Personal user | regression-qa-theme-26.csv | High |
| REG-AUTH-002 | Registration - Organization user | regression-qa-theme-26.csv | High |
| REG-AUTH-003 | Registration - Validation (required fields) | regression-qa-theme-26.csv | Medium |
| REG-AUTH-004 | Registration - Validation (max chars) | regression-qa-theme-26.csv | Medium |
| REG-AUTH-005 | Registration - Unique email/username | regression-qa-theme-26.csv | High |
| REG-AUTH-006 | Registration - Password policy | regression-qa-theme-26.csv | High |
| REG-AUTH-007 | Email verification - Without | regression-qa-theme-26.csv | Medium |
| REG-AUTH-008 | Email verification - Optional | regression-qa-theme-26.csv | Medium |
| REG-AUTH-009 | Email verification - Mandatory | regression-qa-theme-26.csv | Medium |
| REG-AUTH-010 | Login - Valid credentials | regression-qa-theme-26.csv | Critical |
| REG-AUTH-011 | Login - Invalid credentials | regression-qa-theme-26.csv | High |
| REG-AUTH-012 | Login - Account lockout | regression-qa-theme-26.csv | Medium |
| REG-AUTH-013 | Login - Token management | regression-qa-theme-26.csv | High |
| REG-AUTH-014 | SSO - Entra ID | regression-qa-theme-26.csv | Medium |
| REG-AUTH-015 | SSO - Google | regression-qa-theme-26.csv | Medium |

#### 2.2 Catalog & Product Browsing

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-CAT-001 | Category navigation | regression-qa-theme-26.csv | High |
| REG-CAT-002 | Product listing - Grid view | regression-qa-theme-26.csv | High |
| REG-CAT-003 | Product listing - List view | regression-qa-theme-26.csv | High |
| REG-CAT-004 | Facets and filters | regression-qa-theme-26.csv | High |
| REG-CAT-005 | Sorting options | regression-qa-theme-26.csv | Medium |
| REG-CAT-006 | Pagination | regression-qa-theme-26.csv | Medium |
| REG-CAT-007 | Product variations (B2C) | tests/B2C-Variations | High |

#### 2.3 Search

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-SRCH-001 | Global search | regression-qa-theme-26.csv | High |
| REG-SRCH-002 | Search suggestions | regression-qa-theme-26.csv | Medium |
| REG-SRCH-003 | Search within category | regression-qa-theme-26.csv | Medium |
| REG-SRCH-004 | Search filters | regression-qa-theme-26.csv | Medium |
| REG-SRCH-005 | Search history | regression-qa-theme-26.csv | Low |
| REG-SRCH-006 | Organization search | tests/VCST-4357-org-search | Medium |

#### 2.4 Cart Operations

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-CART-001 | Add to cart | VCST-4499 REG-002 | Critical |
| REG-CART-002 | Update quantity | VCST-4499 REG-002 | High |
| REG-CART-003 | Remove from cart | VCST-4499 REG-002 | High |
| REG-CART-004 | Clear cart | google-analytics | Medium |
| REG-CART-005 | Save for later | tests/VCST-3928-save4later-delay-fix | Medium |
| REG-CART-006 | Apply coupon | VCST-4499 REG-002 | Medium |
| REG-CART-007 | Cart total calculations | VCST-4499 REG-002 | Critical |

#### 2.5 Checkout & Delivery

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-CHK-001 | Standard delivery flow | VCST-4499 REG-001 | Critical |
| REG-CHK-002 | Shipping address entry | VCST-4499 REG-001 | High |
| REG-CHK-003 | Address validation | VCST-4499 REG-001 | High |
| REG-CHK-004 | Checkout completion | VCST-4499 REG-004 | Critical |

#### 2.6 BOPIS (Buy Online Pickup In Store)

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-BOPIS-001 | Map stability (bug fix) | VCST-4499 TC-001 | Critical |
| REG-BOPIS-002 | Desktop - Location selection | VCST-4499 TC-002 | Critical |
| REG-BOPIS-003 | Mobile - List/Map toggle | VCST-4499 TC-003 | Critical |
| REG-BOPIS-004 | Search functionality | VCST-4499 TC-004 | High |
| REG-BOPIS-005 | Filter operations | VCST-4499 TC-005 | High |
| REG-BOPIS-006 | Map interactions | VCST-4499 TC-006 | High |
| REG-BOPIS-007 | Pickup location card | VCST-4499 TC-007 | High |
| REG-BOPIS-008 | Scroll behavior | VCST-4499 TC-008 | Medium |
| REG-BOPIS-009 | Pickup filters (city/state) | tests/VCST-3865-pickup-filters | High |
| REG-BOPIS-010 | Pickup filters search | tests/VCST-4447-pickup-filters-search | High |
| REG-BOPIS-011 | Map width after search | VCST-4499 BUG-001 (VCST-4518) | Critical |

#### 2.7 Payment Processing

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-PAY-001 | CyberSource - Valid submission | tests/VCST-3387 TC-POS-001 | Critical |
| REG-PAY-002 | CyberSource - Card validation | tests/VCST-3387 TC-NEG-001 | Critical |
| REG-PAY-003 | CyberSource - Required fields | tests/VCST-3387 TC-NEG-002 to NEG-008 | High |
| REG-PAY-004 | CyberSource - Security (PCI) | tests/VCST-3387 TC-SEC-001 to SEC-006 | Critical |
| REG-PAY-005 | Authorize.Net | google-analytics (purchase event) | High |
| REG-PAY-006 | Datatrans | google-analytics (add_payment_info) | High |
| REG-PAY-007 | Skyflow | config.js (credentials) | High |

#### 2.8 Orders

| ID | Test Case | Source | Priority |
|----|-----------|--------|----------|
| REG-ORD-001 | Order history display | VCST-4499 REG-006 | High |
| REG-ORD-002 | Order details - Pickup | VCST-4499 REG-006 | High |
| REG-ORD-003 | Order details - Delivery | VCST-4499 REG-006 | High |

---

### 3. FEATURE TEST SUITES

#### 3.1 Google Analytics Events (17 events)

**Source:** `tests/google-analytics/`

| ID | Event | Status | Priority |
|----|-------|--------|----------|
| GA-001 | login | Partial | Medium |
| GA-002 | view_item_list | Passed | High |
| GA-003 | view_item | Passed | High |
| GA-004 | view_cart | Passed | High |
| GA-005 | begin_checkout | Passed | Critical |
| GA-006 | add_to_cart | Passed | Critical |
| GA-007 | view_search_results | Passed | High |
| GA-008 | add_shipping_info | Passed | High |
| GA-009 | add_payment_info | Passed | High |
| GA-010 | update_cart_item | Passed | Medium |
| GA-011 | remove_from_cart | Passed | Medium |
| GA-012 | add_to_wishlist | Passed | Medium |
| GA-013 | search | Partial | Medium |
| GA-014 | select_item | Passed | Medium |
| GA-015 | purchase | Passed | Critical |
| GA-016 | place_order | Passed | Critical |
| GA-017 | clear_cart | Passed | Low |

#### 3.2 Page Builder Admin

**Source:** `tests/VCST-4256-improve-page-builder-admin/`

| ID | Test Case | Source File | Priority |
|----|-----------|-------------|----------|
| PB-001 to PB-XXX | Page Builder E2E | Page-Builder-E2E-Test-Cases.csv | Medium |

#### 3.3 UI Components (Storybook)

**Source:** `tests/VCST-4351/` and `tests/VCST-4373/`

| ID | Component | Test Type | Priority |
|----|-----------|-----------|----------|
| UI-001 | VcDialogContent | Responsive preview | Medium |
| UI-002 | VcDialogContent | Size presets | Medium |
| UI-003 | VcVariantPicker | Visual states | High |
| UI-004 | VcVariantPicker | Accessibility | High |
| UI-005 | VcVariantPicker | Keyboard navigation | High |
| UI-006 | VcVariantPicker | Multi-color rendering | Medium |

---

### 4. INTEGRATION TEST SUITE

**Purpose:** End-to-end flow validation
**Source:** VCST-4499 TC-015

| ID | Flow | Priority |
|----|------|----------|
| INT-001 | Cart -> Pickup Location -> Checkout -> Order | Critical |
| INT-002 | Cart -> Delivery -> Checkout -> Payment -> Order | Critical |
| INT-003 | User Registration -> Login -> Order | High |
| INT-004 | Search -> Add to Cart -> Checkout | High |

---

### 5. SECURITY TEST SUITE (PCI Compliance)

**Source:** `tests/VCST-3387-credit-card-checkout/`

| ID | Test Case | Priority |
|----|-----------|----------|
| SEC-001 | Card number iframe isolation | Critical |
| SEC-002 | CVV iframe isolation | Critical |
| SEC-003 | CVV masking verification | Critical |
| SEC-004 | No sensitive data in network requests | Critical |
| SEC-005 | No sensitive data in browser storage | Critical |
| SEC-006 | HTTPS enforcement | Critical |

---

### 6. ACCESSIBILITY TEST SUITE (WCAG 2.1 AA)

**Source:** VCST-4499 TC-014, VCST-4373

| ID | Test Case | Priority |
|----|-----------|----------|
| A11Y-001 | Keyboard navigation | High |
| A11Y-002 | Focus indicators | High |
| A11Y-003 | Screen reader compatibility | High |
| A11Y-004 | ARIA labels | High |
| A11Y-005 | Color contrast (4.5:1) | High |
| A11Y-006 | axe DevTools scan | High |

---

### 7. PERFORMANCE TEST SUITE

**Source:** VCST-4499 TC-011

| ID | Test Case | Threshold |
|----|-----------|-----------|
| PERF-001 | Modal open time (1-5 locations) | Instant |
| PERF-002 | Modal open time (10-50 locations) | <1s |
| PERF-003 | Modal open time (50-100 locations) | <2s |
| PERF-004 | Search/filter response | <500ms |
| PERF-005 | 60fps interactions | Smooth |
| PERF-006 | Memory leak detection | None |

---

### 8. LOCALIZATION TEST SUITE

**Source:** VCST-4499 TC-010

**Languages (13):** de, en, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh

| ID | Test Case | Priority |
|----|-----------|----------|
| L10N-001 | UI element translation | High |
| L10N-002 | Text container fit | High |
| L10N-003 | Button/label sizing | High |
| L10N-004 | Character set display | High |
| L10N-005 | RTL support (if applicable) | Medium |
| L10N-006 | Complete flow in each language | High |

---

### 9. BROWSER COMPATIBILITY TEST SUITE

**Source:** VCST-4499 TC-013

| Browser | Desktop | Mobile | Priority |
|---------|---------|--------|----------|
| Chrome | Latest 2 | Android | Critical |
| Safari | Latest 2 | iOS (iPhone 16/17/18) | Critical |
| Firefox | Latest 2 | - | High |
| Edge | Latest 2 | - | High |

---

## Test Execution Recommendations

### Daily Development
- Run **Smoke Test Suite** after each deployment

### Sprint Release
1. **Smoke Test Suite** (30 min)
2. **Affected Feature Suite(s)** (varies)
3. **Integration Test Suite** (1-2 hours)

### Major Release
1. **Full Regression Test Suite** (4-6 hours)
2. **Security Test Suite** (1 hour)
3. **Accessibility Test Suite** (2 hours)
4. **Browser Compatibility** (3-4 hours)
5. **Performance Test Suite** (1 hour)

### Quarterly
- **Full Localization Test Suite** (4-6 hours)

---

## Test Data Dependencies

| Suite | Required Test Data |
|-------|-------------------|
| Authentication | `test-data/organizations/` |
| Search | `test-data/search-queries/` |
| Inventory | `test-data/inventory/` |
| File Upload | `test-data/uploads/` |
| BOPIS | `tests/VCST-3865/pickupIndex.csv` |

---

## Related Documentation

- [Test Plan Template](../tests/VCST-4499-BOPIS/VCST-4499-PR2138-Analysis-And-TestPlan.md)
- [Bug Report Template](../reports/bugs/)
- [Full Regression Data](../test-data/regression/regression-qa-theme-26.csv)
- [Prompt Templates](../docs/prompts/)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-03 | Test Management Specialist | Initial organization |
