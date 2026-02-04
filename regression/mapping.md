# Regression Suite to Test Case Mapping

This document maps regression test suites to their related test implementations in the `tests/` directory.

## Suite Mappings

### 01 - Smoke Tests (12 cases)
**File:** [01-smoke-tests.csv](suites/01-smoke-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Login/Authentication | - |
| Catalog browsing | - |
| Add to cart | [B2C-Variations](../tests/B2C-Variations/), [VCST-4373](../tests/VCST-4373/) |
| Checkout flow | [VCST-3387-credit-card-checkout](../tests/VCST-3387-credit-card-checkout/) |
| Search | [VCST-4357-org-search](../tests/VCST-4357-org-search/) |

---

### 02 - Authentication Tests (28 cases)
**File:** [02-authentication-tests.csv](suites/02-authentication-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Login flows | - |
| SSO integration | - |
| Password management | - |

---

### 03 - Catalog & Search Tests (23 cases)
**File:** [03-catalog-search-tests.csv](suites/03-catalog-search-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Category navigation | - |
| Product filters | [VCST-4514-filter-badge-disappears](../tests/VCST-4514-filter-badge-disappears/) |
| Search functionality | [VCST-4357-org-search](../tests/VCST-4357-org-search/) |
| Product variations | [B2C-Variations](../tests/B2C-Variations/), [VCST-4373](../tests/VCST-4373/) |

---

### 04 - Cart & Checkout Tests (26 cases)
**File:** [04-cart-checkout-tests.csv](suites/04-cart-checkout-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Cart operations | [VCST-3928-save4later-delay-fix](../tests/VCST-3928-save4later-delay-fix/) |
| Checkout flow | [VCST-3387-credit-card-checkout](../tests/VCST-3387-credit-card-checkout/) |
| Order management | - |

---

### 05 - BOPIS Pickup Tests (27 cases)
**File:** [05-bopis-pickup-tests.csv](suites/05-bopis-pickup-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Pickup location map | [VCST-4518-pickup-map-width](../tests/VCST-4518-pickup-map-width/) |
| Location filters | [VCST-3865-pickup-filters](../tests/VCST-3865-pickup-filters/), [VCST-4447-pickup-filters-search](../tests/VCST-4447-pickup-filters-search/) |
| BOPIS flow | [VCST-4499-BOPIS](../tests/VCST-4499-BOPIS/) |
| Search clear | [VCST-4578-bopis-search-clear](../tests/VCST-4578-bopis-search-clear/) |
| iOS Safari zoom | [VCST-4579-ios-safari-zoom-fix](../tests/VCST-4579-ios-safari-zoom-fix/) |

---

### 06 - Payment Tests (32 cases)
**File:** [06-payment-tests.csv](suites/06-payment-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| CyberSource | [VCST-3387-credit-card-checkout](../tests/VCST-3387-credit-card-checkout/) |
| Authorize.Net | - |
| Datatrans | - |
| Skyflow | - |

---

### 07 - Google Analytics Tests (24 cases)
**File:** [07-google-analytics-tests.csv](suites/07-google-analytics-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| GA4 event tracking | [google-analytics](../tests/google-analytics/) |

---

### 08 - Security Tests (21 cases)
**File:** [08-security-tests.csv](suites/08-security-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| PCI compliance | - |
| Auth security | - |
| Input validation | - |

---

### 09 - Accessibility Tests (27 cases)
**File:** [09-accessibility-tests.csv](suites/09-accessibility-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| WCAG 2.1 AA | [VCST-4351](../tests/VCST-4351/) (Storybook components) |

---

### 10 - Localization Tests (21 cases)
**File:** [10-localization-tests.csv](suites/10-localization-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| 13 languages | - |

---

### 11 - Performance Tests (20 cases)
**File:** [11-performance-tests.csv](suites/11-performance-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Load times | - |
| Core Web Vitals | - |

---

### 12 - Browser Compatibility Tests (22 cases)
**File:** [12-browser-compatibility-tests.csv](suites/12-browser-compatibility-tests.csv)

| Coverage Area | Related Tests |
|---------------|---------------|
| Cross-browser | [VCST-4579-ios-safari-zoom-fix](../tests/VCST-4579-ios-safari-zoom-fix/) |

---

## Coverage Summary

| Suite | Test Cases | Implementations | Coverage |
|-------|------------|-----------------|----------|
| 01-smoke-tests | 12 | 3 | Partial |
| 02-authentication-tests | 28 | 0 | None |
| 03-catalog-search-tests | 23 | 4 | Partial |
| 04-cart-checkout-tests | 26 | 2 | Partial |
| 05-bopis-pickup-tests | 27 | 6 | Good |
| 06-payment-tests | 32 | 1 | Low |
| 07-google-analytics-tests | 24 | 1 | Partial |
| 08-security-tests | 21 | 0 | None |
| 09-accessibility-tests | 27 | 1 | Low |
| 10-localization-tests | 21 | 0 | None |
| 11-performance-tests | 20 | 0 | None |
| 12-browser-compatibility-tests | 22 | 1 | Low |

**Total:** 283 test cases across 12 suites

## Notes

- "-" indicates no specific test implementation exists yet
- Tests in `tests/` are organized by JIRA ticket (VCST-XXXX)
- Suite coverage is based on active ticket work, not full automation
- This mapping should be updated as new tests are added
