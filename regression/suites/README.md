# Test Suite Files Index

**Location:** `test-data/regression/suites/`
**Created:** 2026-02-03
**Format:** CSV (TestRail compatible)

---

## Suite Files

| # | File | Test Cases | Priority | Est. Time |
|---|------|------------|----------|-----------|
| **00** | **[00-full-regression-release.csv](00-full-regression-release.csv)** | **108** | **P0/P1 Critical** | **13.5 hrs** |
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
| 13 | [13-b2c-features-tests.csv](13-b2c-features-tests.csv) | 64 | P1 Critical | 5 hrs |

### Backend Suites

| # | File | Test Cases | Priority | Est. Time |
|---|------|------------|----------|-----------|
| 14 | [14-platform-api-tests.csv](Backend/14-platform-api-tests.csv) | 25 | P0 Critical | 30 min |
| 15 | [15-graphql-xapi-tests.csv](Backend/15-graphql-xapi-tests.csv) | 20 | P1 High | 25 min |
| 16 | [16-admin-spa-tests.csv](Backend/16-admin-spa-tests.csv) | 25 | P1 High | 35 min |
| 17 | [17-module-config-tests.csv](Backend/17-module-config-tests.csv) | 15 | P2 Medium | 20 min |

**Total Test Cases:** 540 (347 frontend modular + 108 full regression + 85 backend)

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

### Daily Smoke Test (P0 Only)
```
01-smoke-tests.csv
```
**Time:** ~30 minutes
**Purpose:** Quick validation after deployment

### Sprint Release Validation
```
01-smoke-tests.csv
04-cart-checkout-tests.csv (critical sections)
05-bopis-pickup-tests.csv (affected areas)
08-security-tests.csv (payment security)
```
**Time:** ~3-4 hours
**Purpose:** Validate sprint deliverables

### Major Release (Full Regression) - **RECOMMENDED**
```
00-full-regression-release.csv (NEW - comprehensive E2E suite)
```
**Time:** ~13.5 hours (single tester) or ~4-5 hours (3-4 testers parallelized)
**Purpose:** Complete end-to-end validation before production release
**When:** Before any production release, quarterly, before major sales events

### Major Release (Modular Approach) - Alternative
```
All 12 modular suites (01-12)
```
**Time:** ~24+ hours (can be parallelized)
**Purpose:** Granular coverage with specialized focus areas
**When:** Deep-dive testing, specialized area validation

### Backend Daily Smoke
```
14-platform-api-tests.csv
```
**Time:** ~30 minutes
**Purpose:** Validate REST API health alongside frontend smoke

### Backend Full Regression
```
14-platform-api-tests.csv
15-graphql-xapi-tests.csv
16-admin-spa-tests.csv
17-module-config-tests.csv
```
**Time:** ~2 hours
**CI command:** `npm run ci:backend` or `SUITE_SELECTION=backend`

### Quarterly Specialized Testing
```
09-accessibility-tests.csv (WCAG audit)
10-localization-tests.csv (all 13 languages)
12-browser-compatibility-tests.csv (full matrix)
```
**Time:** ~11 hours
**Purpose:** Compliance and compatibility audits

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

### 00 - Full Regression Release Suite (NEW)
**Comprehensive end-to-end regression suite for major releases.** Consolidates critical test cases from all functional areas into a single master suite. Covers all 10 Critical Revenue Flows with 108 test cases organized by priority. Designed for pre-production release validation with clear entry/exit criteria and execution strategies.

**See:** [00-FULL-REGRESSION-README.md](00-FULL-REGRESSION-README.md) for detailed documentation.

**Key Features:**
- 108 test cases covering entire platform end-to-end
- 38 Critical (P0) + 50 High (P1) + 20 Medium (P2)
- Covers Authentication, Catalog, Cart, Checkout, Payment, Orders, BOPIS, Multi-Org, B2B, Security, Performance, Accessibility, Analytics
- Parallelizable execution plan (3-4 testers, 1-2 days)
- TestRail-compatible CSV format

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

### 13 - B2C Features Tests
B2C-specific features - Product Variations (size, color), Wishlists/Lists (create, share, manage), Ship To address management, and Product Configurations (custom options, bundles, text input).

### 14 - Platform API Tests
REST API regression for core platform endpoints - Catalog, Pricing, Inventory, Orders, Customer CRUD, Authentication, and error handling.

### 15 - GraphQL xAPI Tests
GraphQL experience API testing - xCatalog (product search, detail, categories), xCart (create, add, checkout), xOrder (list, detail, create), xCMS, authentication, and query performance.

### 16 - Admin SPA Tests
Admin panel functional testing - Login, Dashboard, Catalog CRUD, Order management, Customer management, Marketing/Promotions, Settings, blade navigation, and console error monitoring.

### 17 - Module & Config Tests
Platform module configuration testing - Module list, Catalog/Pricing/Order/Payment module settings, cache management, search index rebuild, data import/export, and system health diagnostics.

---

## Related Documentation

- [Test Suite Organization](../../../docs/test-suite-organization.md) - High-level test strategy
- [CLAUDE.md](../../../CLAUDE.md) - Project testing overview
- [Bug Report Template](../../../reports/bugs/) - Bug documentation
