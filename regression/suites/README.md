# Test Suite Files Index

**Location:** `test-data/regression/suites/`
**Created:** 2026-02-03
**Format:** CSV (TestRail compatible)

---

## Suite Files

| # | File | Test Cases | Priority | Est. Time |
|---|------|------------|----------|-----------|
| 01 | [01-smoke-tests.csv](01-smoke-tests.csv) | 12 | P0 Critical | 30 min |
| 02 | [02-authentication-tests.csv](02-authentication-tests.csv) | 28 | P1 High | 1.5 hrs |
| 03 | [03-catalog-search-tests.csv](03-catalog-search-tests.csv) | 23 | P1 High | 1.5 hrs |
| 04 | [04-cart-checkout-tests.csv](04-cart-checkout-tests.csv) | 26 | P1 Critical | 2 hrs |
| 05 | [05-bopis-pickup-tests.csv](05-bopis-pickup-tests.csv) | 27 | P1 Critical | 2.5 hrs |
| 06 | [06-payment-tests.csv](06-payment-tests.csv) | 32 | P0 Critical | 2 hrs |
| 07 | [07-google-analytics-tests.csv](07-google-analytics-tests.csv) | 24 | P2 High | 2 hrs |
| 08 | [08-security-tests.csv](08-security-tests.csv) | 21 | P0 Critical | 2 hrs |
| 09 | [09-accessibility-tests.csv](09-accessibility-tests.csv) | 27 | P1 High | 3 hrs |
| 10 | [10-localization-tests.csv](10-localization-tests.csv) | 21 | P2 Medium | 4 hrs |
| 11 | [11-performance-tests.csv](11-performance-tests.csv) | 20 | P2 Medium | 2 hrs |
| 12 | [12-browser-compatibility-tests.csv](12-browser-compatibility-tests.csv) | 22 | P1 High | 4 hrs |

**Total Test Cases:** 283

---

## CSV Column Format

All CSV files use the following columns for TestRail compatibility:

```
ID,Title,Section,Type,Priority,Estimate,Preconditions,Steps,Expected Result,References,Automation Status
```

| Column | Description |
|--------|-------------|
| ID | Unique test case identifier (e.g., SMK-001) |
| Title | Test case title |
| Section | Hierarchical section (Suite > Category) |
| Type | Test type (Functional, Negative, Security, etc.) |
| Priority | Critical, High, Medium, Low |
| Estimate | Estimated execution time |
| Preconditions | Required setup before test |
| Steps | Numbered test steps |
| Expected Result | Expected outcomes |
| References | Source tickets, documents |
| Automation Status | Automated, Manual, Other |

---

## Execution Recommendations

### Daily Development (P0 Only)
```
01-smoke-tests.csv
```
**Time:** ~30 minutes

### Sprint Release (P0 + P1)
```
01-smoke-tests.csv
04-cart-checkout-tests.csv (critical sections)
05-bopis-pickup-tests.csv (affected areas)
08-security-tests.csv (payment security)
```
**Time:** ~3-4 hours

### Major Release (Full Regression)
```
All 12 suites
```
**Time:** ~24+ hours (can be parallelized)

### Quarterly (Specialized)
```
09-accessibility-tests.csv (WCAG audit)
10-localization-tests.csv (all 13 languages)
12-browser-compatibility-tests.csv (full matrix)
```
**Time:** ~11 hours

---

## TestRail Import Instructions

1. Navigate to TestRail > Test Cases
2. Click "Import" button
3. Select CSV format
4. Upload desired suite file
5. Map columns:
   - Title → Name
   - Section → Section
   - Steps → Steps
   - Expected Result → Expected
   - Preconditions → Preconditions
6. Import and verify

---

## Suite Descriptions

### 01 - Smoke Tests
Quick validation of critical user flows. Must pass before any deployment.

### 02 - Authentication Tests
User registration, login, SSO, password management, and security.

### 03 - Catalog & Search Tests
Product browsing, category navigation, search functionality, and filters.

### 04 - Cart & Checkout Tests
Shopping cart operations, checkout flow, and order management.

### 05 - BOPIS (Pickup) Tests
Buy Online Pickup In Store functionality - map, search, filters, location selection.

### 06 - Payment Tests
Credit card processing (CyberSource, Authorize.Net, Datatrans, Skyflow) and PCI compliance.

### 07 - Google Analytics Tests
GA4 e-commerce event tracking verification.

### 08 - Security Tests
PCI compliance, authentication security, input validation, and data protection.

### 09 - Accessibility Tests
WCAG 2.1 AA compliance - keyboard navigation, screen readers, color contrast.

### 10 - Localization Tests
Multi-language support (13 languages) - translation, character display, layout.

### 11 - Performance Tests
Load times, memory usage, API response times, and Core Web Vitals.

### 12 - Browser Compatibility Tests
Cross-browser testing - Chrome, Safari, Firefox, Edge on desktop and mobile.

---

## Related Documentation

- [Test Suite Organization](../../../docs/test-suite-organization.md) - High-level test strategy
- [CLAUDE.md](../../../CLAUDE.md) - Project testing overview
- [Bug Report Template](../../../reports/bugs/) - Bug documentation
