# Test Suite Files Index

**Location:** `regression/suites/`
**Updated:** 2026-02-11
**Format:** CSV (TestRail compatible)

---

## Frontend Suites (Frontend/)

| # | File | Test Cases | Priority | Est. Time |
|---|------|------------|----------|-----------|
| **00** | **[00-full-regression-release.csv](Frontend/00-full-regression-release.csv)** | **90** | **P0/P1 Critical** | **~12 hrs** |
| 01 | [01-smoke-tests.csv](Frontend/01-smoke-tests.csv) | 12 | P0 Critical | 30 min |
| 02 | [02-authentication-tests.csv](Frontend/02-authentication-tests.csv) | 28 | P1 High | 1.5 hrs |
| 03 | [03-catalog-search-tests.csv](Frontend/03-catalog-search-tests.csv) | 35 | P1 High | 2 hrs |
| 04 | [04-cart-checkout-tests.csv](Frontend/04-cart-checkout-tests.csv) | 31 | P1 Critical | 2 hrs |
| 05 | [05-bopis-pickup-tests.csv](Frontend/05-bopis-pickup-tests.csv) | 27 | P1 Critical | 2.5 hrs |
| 06 | [06-payment-tests.csv](Frontend/06-payment-tests.csv) | 28 | P0 Critical | 2 hrs |
| 07 | [07-google-analytics-tests.csv](Frontend/07-google-analytics-tests.csv) | 24 | P2 High | 2 hrs |
| 08 | [08-security-tests.csv](Frontend/08-security-tests.csv) | 18 | P0 Critical | 1.5 hrs |
| 09 | [09-accessibility-tests.csv](Frontend/09-accessibility-tests.csv) | 23 | P1 High | 2.5 hrs |
| 10 | [10-localization-tests.csv](Frontend/10-localization-tests.csv) | 21 | P2 Medium | 4 hrs |
| 11 | [11-performance-tests.csv](Frontend/11-performance-tests.csv) | 20 | P2 Medium | 2 hrs |
| 12 | [12-browser-compatibility-tests.csv](Frontend/12-browser-compatibility-tests.csv) | 21 | P1 High | 4 hrs |
| 13 | [13-b2c-features-tests.csv](Frontend/13-b2c-features-tests.csv) | 49 | P1 Critical | 4 hrs |

**Frontend modular total (01-13):** 337 test cases
**Frontend with full regression (00):** 427 test cases

## Backend Suites (Backend/)

| # | File | Test Cases | Priority | Est. Time |
|---|------|------------|----------|-----------|
| 14 | [14-platform-api-tests.csv](Backend/14-platform-api-tests.csv) | 25 | P0 Critical | 30 min |
| 15 | [15-graphql-xapi-tests.csv](Backend/15-graphql-xapi-tests.csv) | 20 | P1 High | 25 min |
| 16 | [16-catalog-tests.csv](Backend/16-catalog-tests.csv) | 33 | P1 High | 1 hr |
| 17 | [17-platform-core-tests.csv](Backend/17-platform-core-tests.csv) | 65 | P1 High | 2 hrs |
| 18 | [18-store-tests.csv](Backend/18-store-tests.csv) | 65 | P1 High | 2 hrs |
| 19 | [19-pricing-tests.csv](Backend/19-pricing-tests.csv) | 58 | P1 High | 1.5 hrs |
| 20 | [20-orders-tests.csv](Backend/20-orders-tests.csv) | 66 | P1 High | 2 hrs |
| 21 | [21-customer-tests.csv](Backend/21-customer-tests.csv) | 52 | P1 High | 1.5 hrs |
| 22 | [22-inventory-tests.csv](Backend/22-inventory-tests.csv) | 43 | P1 High | 1.5 hrs |
| 23 | [23-marketing-tests.csv](Backend/23-marketing-tests.csv) | 51 | P1 High | 1.5 hrs |
| 24 | [24-notifications-tests.csv](Backend/24-notifications-tests.csv) | 52 | P1 High | 1.5 hrs |
| 25 | [25-cms-pagebuilder-tests.csv](Backend/25-cms-pagebuilder-tests.csv) | 55 | P1 High | 1.5 hrs |
| 26 | [26-search-indexing-tests.csv](Backend/26-search-indexing-tests.csv) | 40 | P1 High | 1 hr |
| 27 | [27-assets-tests.csv](Backend/27-assets-tests.csv) | 24 | P1 High | 45 min |
| 28 | [28-core-settings-tests.csv](Backend/28-core-settings-tests.csv) | 14 | P2 Medium | 25 min |
| 29 | [29-csv-export-import-tests.csv](Backend/29-csv-export-import-tests.csv) | 18 | P2 Medium | 30 min |
| 30 | [30-shipping-tests.csv](Backend/30-shipping-tests.csv) | 15 | P2 Medium | 25 min |
| 31 | [31-seo-tests.csv](Backend/31-seo-tests.csv) | 20 | P2 Medium | 30 min |
| 32 | [32-whitelabeling-tests.csv](Backend/32-whitelabeling-tests.csv) | 15 | P2 Medium | 25 min |
| 33 | [33-push-messages-tests.csv](Backend/33-push-messages-tests.csv) | 16 | P2 Medium | 25 min |
| 34 | [34-image-tools-tests.csv](Backend/34-image-tools-tests.csv) | 20 | P2 Medium | 30 min |

**Backend total:** 767 test cases

---

**Grand total:** 1,194 test cases (427 frontend + 767 backend)

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
14-platform-api-tests.csv
```
**Time:** ~1 hour
**Purpose:** Quick validation after deployment (frontend + backend API health)
**CI command:** `npm run ci:smoke`

### Critical P0 Suites
```
01-smoke-tests.csv
06-payment-tests.csv
08-security-tests.csv
14-platform-api-tests.csv
```
**Time:** ~4.5 hours
**Purpose:** Validate critical revenue flows and security
**CI command:** `npm run ci:critical`

### Sprint Release Validation
```
01-smoke-tests.csv through 06-payment-tests.csv
08-security-tests.csv
14-platform-api-tests.csv
16-catalog-tests.csv
```
**Time:** ~12 hours (can be parallelized to ~4 hours with 3 agents)
**Purpose:** Validate sprint deliverables

### Major Release - Full Regression Suite
```
00-full-regression-release.csv
```
**Time:** ~12 hours (single tester) or ~4-5 hours (3-4 testers parallelized)
**Purpose:** Complete end-to-end validation before production release
**When:** Before any production release, quarterly, before major sales events

### Major Release - Modular Approach (Alternative)
```
All 14 frontend modular suites (01-13)
All 21 backend suites (14-34)
```
**Time:** ~40+ hours (parallelized to ~8 hours with 3 agents)
**Purpose:** Granular coverage with specialized focus areas
**CI command:** `npm run ci:full`

### Frontend Only
```
All frontend suites (01-13)
```
**Time:** ~25 hours sequential, ~8 hours parallelized
**CI command:** `npm run ci:frontend`

### Backend Only
```
All backend suites (14-34)
```
**Time:** ~20 hours sequential, ~7 hours parallelized
**CI command:** `npm run ci:backend`

### Quarterly Specialized Testing
```
09-accessibility-tests.csv (WCAG audit)
10-localization-tests.csv (all 13 languages)
12-browser-compatibility-tests.csv (full matrix)
```
**Time:** ~10.5 hours
**Purpose:** Compliance and compatibility audits

---

## TestRail Import Instructions

1. Navigate to TestRail > Test Cases
2. Click "Import" button
3. Select CSV format
4. Upload desired suite file
5. Map columns:
   - Title > Name
   - Section > Section
   - Steps > Steps
   - Expected Result > Expected
   - Preconditions > Preconditions
6. Import and verify

---

## Suite Descriptions

### 00 - Full Regression Release Suite
Comprehensive end-to-end regression suite for major releases. Consolidates critical test cases from all functional areas into a single master suite. Covers all 10 Critical Revenue Flows with 90 test cases organized by priority.

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
Cross-browser testing - Chrome, Firefox, Edge on desktop and mobile.

### 13 - B2C Features Tests
B2C-specific features - Product Variations (size, color), Wishlists/Lists (create, share, manage), Ship To address management, and Product Configurations (custom options, bundles, text input).

### 14 - Platform API Tests
REST API regression for core platform endpoints - Catalog, Pricing, Inventory, Orders, Customer CRUD, Authentication, and error handling.

### 15 - GraphQL xAPI Tests
GraphQL experience API testing - xCatalog (product search, detail, categories), xCart (create, add, checkout), xOrder (list, detail, create), xCMS, authentication, and query performance.

### 16 - Catalog Tests
Admin catalog management - Products, Categories, and Common Catalogs CRUD operations.

### 17 - Platform Core Tests
Core platform administration - User Management, Roles & Permissions, Contacts, Orders, Store, Settings, Marketing, Content, Contracts, API Keys, and Healthcheck.

### 18 - Store Tests
Store configuration and management - General settings, Payment & Shipping, SEO, SPA, Fulfillment Centers, Dynamic Properties, Attributes & Filters, URL management, Tax Calculation, Email Verification, and Permissions.

### 19 - Pricing Tests
Pricing module - Pricelist Management, Price Logic, Assignments, Min Quantity rules, Lowest/Recommended Price, Search & Filter, Settings, and Permissions.

### 20 - Orders Tests
Order management - Order Management, Payment/Shipment Documents, Capture, Refund, Configurable Products, Employee Assignment, Inventory Adjustment, Notifications, Number Generation, Validation, and API.

### 21 - Customer Tests
Customer management - Contact/Account/Address Management, Organization Details, Dynamic Properties, Email Verification, Filters & Search, Status Management, Profile Photo, and Permissions.

### 22 - Inventory Tests
Inventory module - Fulfillment Centers, Stock Management, Store Configuration, Track Inventory, Dynamic Properties, FFC Address, and API.

### 23 - Marketing Tests
Marketing and promotions - Promotions, Coupons, Content Items/Folders, Placeholders, Publishing, Cart/Catalog Conditions, Effects, Gifts, Multi-Store, Visitor Targeting, and xAPI Dynamic Content.

### 24 - Notifications Tests
Notification system - Order/Account/Status Notifications, Abandoned Cart, Template Management, Recipients, Notification Feed/Layout/List, SMS Notifications, Preview, Extensions, and Settings.

### 25 - CMS / Page Builder Tests
Content management - Page Management/Configuration, Content Blocks, Designer Sections, Design Presets, Field Types, Grid View, Search, Status Filters/Transitions, Admin Integration, Authentication, and Storefront Verification.

### 26 - Search & Indexing Tests
Search infrastructure - Elastic Search, Lucene Search, Index Management, Scalable Indexation, Search Filters API, and Settings.

### 27 - Assets Tests
Digital asset management - File Upload/Download, Folder Management, Asset Assignment, and Blob Storage.

### 28 - Core Settings Tests
Platform core settings - Languages, Length Units, Mass Units, and Permissions.

### 29 - CSV Export/Import Tests
Bulk data operations - CSV Export and CSV Import workflows.

### 30 - Shipping Tests
Shipping configuration - Shipping Methods, Shipping Rates, Tax Configuration, BOPIS, and BOPIS Storefront integration.

### 31 - SEO Tests
SEO management - Redirect Management, Status Management, Grid Display/Operations, Analytics, Broken Pages, Storefront Verification, and Workflow.

### 32 - Whitelabeling Tests
Branding customization - Logo, Favicon, Theme, Widget, Organization Branding, Store Settings, Background Jobs, and Settings.

### 33 - Push Messages Tests
Push notification management - Draft Management, Message List, Publishing, Push Messages API, and Recipient Tracking.

### 34 - Image Tools Tests
Image processing - Resize Methods, Thumbnail Settings, Task Configuration/Management, Processing, Background Jobs, UI Operations, Permissions, and Settings.

---

## Related Documentation

- [Test Suite Organization](../../docs/test-suite-organization.md) - High-level test strategy
- [CLAUDE.md](../../CLAUDE.md) - Project testing overview
- [Bug Reports](../../reports/bugs/) - Bug documentation
- [test-suites.json](../../config/test-suites.json) - Regression orchestration manifest
