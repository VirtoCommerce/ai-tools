# Test Suite Files Index

**Location:** `regression/suites/`
**Updated:** 2026-03-21
**Format:** Enriched Agent-Native CSV (15-column)
**Manifest:** [`config/test-suites.json`](../../config/test-suites.json) — single source of truth for orchestration

---

## Suites by Domain

Domains group related suites across Frontend and Backend layers. Use `domain:<name>` selections for domain-scoped regression runs.

### purchase-flow (10 suites, ~628 cases)
Revenue-critical path: cart → checkout → payment → orders → shipping → inventory → returns.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 04a | [Cart Tests](Frontend/04a-cart-tests.csv) | frontend | functional | 77 | P1 |
| 04b | [Checkout Tests](Frontend/04b-checkout-tests.csv) | frontend | functional | 80 | P1 |
| 04c | [Orders & Quotes Tests](Frontend/04c-orders-quotes-tests.csv) | frontend | functional | 81 | P1 |
| 05 | [BOPIS Pickup Tests](Frontend/05-bopis-pickup-tests.csv) | frontend | functional | 88 | P1 |
| 06 | [Payment Tests](Frontend/06-payment-tests.csv) | frontend | functional | 65 | P0 |
| 19 | [Pricing Admin Tests](Backend/19-pricing-tests.csv) | backend | admin | 62 | P1 |
| 20 | [Orders Admin Tests](Backend/20-orders-tests.csv) | backend | admin | 90 | P1 |
| 22 | [Inventory Admin Tests](Backend/22-inventory-tests.csv) | backend | admin | 43 | P1 |
| 30 | [Shipping Module Tests](Backend/30-shipping-tests.csv) | backend | admin | 20 | P1 |
| 37 | [Returns Admin Tests](Backend/37-returns-tests.csv) | backend | admin | 22 | P1 |

### catalog-search (5 suites, ~405 cases)
Product discovery: catalog, search, configurable products, indexing, import/export.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 03 | [Catalog & Search Tests](Frontend/03-catalog-search-tests.csv) | frontend | functional | 130 | P1 |
| 36 | [Configurable Products Tests](Frontend/36-configurable-products-tests.csv) | frontend | functional | 133 | P1 |
| 16 | [Catalog Admin Tests](Backend/16-catalog-tests.csv) | backend | admin | 78 | P1 |
| 26 | [Search & Indexing Tests](Backend/26-search-indexing-tests.csv) | backend | admin | 46 | P1 |
| 29 | [CSV Export Import Tests](Backend/29-csv-export-import-tests.csv) | backend | admin | 18 | P1 |

### auth-security (4 suites, ~213 cases)
Authentication, authorization, platform API, and security.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 02 | [Authentication Tests](Frontend/02-authentication-tests.csv) | frontend | functional | 68 | P1 |
| 08 | [Security Tests](Frontend/08-security-tests.csv) | frontend | functional | 32 | P0 |
| 14 | [Platform API Tests](Backend/14-platform-api-tests.csv) | backend | api | 33 | P0 |
| 17 | [Platform Core Tests](Backend/17-platform-core-tests.csv) | backend | admin | 80 | P1 |

### marketing (3 suites, ~181 cases)
Promotions, coupons, dynamic content, xMarketing.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 41 | [Coupons & Promotions Tests](Frontend/41-coupons-promotions-tests.csv) | frontend | functional | 54 | P1 |
| 23 | [Marketing Admin Tests](Backend/23-marketing-tests.csv) | backend | admin | 89 | P1 |
| 42 | [xMarketing Module Tests](Backend/42-xmarketing-tests.csv) | backend | admin | 38 | P1 |

### customer-b2b (4 suites, ~286 cases)
Customer management, B2C features, contracts, loyalty.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 13 | [B2C Features Tests](Frontend/13-b2c-features-tests.csv) | frontend | functional | 166 | P1 |
| 21 | [Customer Admin Tests](Backend/21-customer-tests.csv) | backend | admin | 84 | P1 |
| 38 | [Contracts Admin Tests](Backend/38-contracts-tests.csv) | backend | admin | 18 | P1 |
| 39 | [Loyalty Admin Tests](Backend/39-loyalty-tests.csv) | backend | admin | 18 | P1 |

### platform-config (4 suites, ~127 cases)
GraphQL xAPI, store configuration, core settings, channels.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 15 | [GraphQL xAPI Tests](Backend/15-graphql-xapi-tests.csv) | backend | api | 33 | P1 |
| 18 | [Store Admin Tests](Backend/18-store-tests.csv) | backend | admin | 65 | P1 |
| 28 | [Core Settings Tests](Backend/28-core-settings-tests.csv) | backend | admin | 14 | P2 |
| 40 | [Channels & Data Quality Tests](Backend/40-channels-tests.csv) | backend | admin | 15 | P2 |

### content-cms (3 suites, ~127 cases)
CMS, page builder, assets, image tools.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 25 | [CMS & Page Builder Tests](Backend/25-cms-pagebuilder-tests.csv) | backend | admin | 75 | P1 |
| 27 | [Assets Module Tests](Backend/27-assets-tests.csv) | backend | admin | 24 | P1 |
| 34 | [Image Tools Tests](Backend/34-image-tools-tests.csv) | backend | admin | 28 | P2 |

### branding (3 suites, ~128 cases)
SEO, white labeling (backend + frontend).

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 35 | [Frontend White Labeling Tests](Frontend/35-frontend-whitelabeling-tests.csv) | frontend | functional | 68 | P1 |
| 31 | [SEO Module Tests](Backend/31-seo-tests.csv) | backend | admin | 20 | P1 |
| 32 | [White Labeling Tests](Backend/32-whitelabeling-tests.csv) | backend | admin | 40 | P2 |

### communication (2 suites, ~89 cases)
Notifications and push messages.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 24 | [Notifications Admin Tests](Backend/24-notifications-tests.csv) | backend | admin | 64 | P1 |
| 33 | [Push Messages Tests](Backend/33-push-messages-tests.csv) | backend | admin | 25 | P2 |

### cross-cutting (7 suites, ~233 cases)
Smoke, analytics, accessibility, localization, performance, browser compatibility, master suite.

| # | Suite | Layer | Concern | Cases | Priority |
|---|-------|-------|---------|-------|----------|
| 00 | [Full Regression Release](Frontend/00-full-regression-release.csv) | frontend | functional | 100 | P0 |
| 01 | [Smoke Tests](Frontend/01-smoke-tests.csv) | frontend | functional | 19 | P0 |
| 07 | [Google Analytics Tests](Frontend/07-google-analytics-tests.csv) | frontend | non-functional | 24 | P2 |
| 09 | [Accessibility Tests](Frontend/09-accessibility-tests.csv) | frontend | non-functional | 23 | P1 |
| 10 | [Localization Tests](Frontend/10-localization-tests.csv) | frontend | non-functional | 26 | P2 |
| 11 | [Performance Tests](Frontend/11-performance-tests.csv) | frontend | non-functional | 20 | P2 |
| 12 | [Browser Compatibility Tests](Frontend/12-browser-compatibility-tests.csv) | frontend | non-functional | 21 | P1 |

---

## Suites by Layer

### Frontend (19 suites)

| # | File | Cases | Priority | Domain |
|---|------|-------|----------|--------|
| 00 | [00-full-regression-release.csv](Frontend/00-full-regression-release.csv) | 100 | P0 | cross-cutting |
| 01 | [01-smoke-tests.csv](Frontend/01-smoke-tests.csv) | 19 | P0 | cross-cutting |
| 02 | [02-authentication-tests.csv](Frontend/02-authentication-tests.csv) | 68 | P1 | auth-security |
| 03 | [03-catalog-search-tests.csv](Frontend/03-catalog-search-tests.csv) | 130 | P1 | catalog-search |
| 04a | [04a-cart-tests.csv](Frontend/04a-cart-tests.csv) | 77 | P1 | purchase-flow |
| 04b | [04b-checkout-tests.csv](Frontend/04b-checkout-tests.csv) | 80 | P1 | purchase-flow |
| 04c | [04c-orders-quotes-tests.csv](Frontend/04c-orders-quotes-tests.csv) | 81 | P1 | purchase-flow |
| 05 | [05-bopis-pickup-tests.csv](Frontend/05-bopis-pickup-tests.csv) | 88 | P1 | purchase-flow |
| 06 | [06-payment-tests.csv](Frontend/06-payment-tests.csv) | 65 | P0 | purchase-flow |
| 07 | [07-google-analytics-tests.csv](Frontend/07-google-analytics-tests.csv) | 24 | P2 | cross-cutting |
| 08 | [08-security-tests.csv](Frontend/08-security-tests.csv) | 32 | P0 | auth-security |
| 09 | [09-accessibility-tests.csv](Frontend/09-accessibility-tests.csv) | 23 | P1 | cross-cutting |
| 10 | [10-localization-tests.csv](Frontend/10-localization-tests.csv) | 26 | P2 | cross-cutting |
| 11 | [11-performance-tests.csv](Frontend/11-performance-tests.csv) | 20 | P2 | cross-cutting |
| 12 | [12-browser-compatibility-tests.csv](Frontend/12-browser-compatibility-tests.csv) | 21 | P1 | cross-cutting |
| 13 | [13-b2c-features-tests.csv](Frontend/13-b2c-features-tests.csv) | 166 | P1 | customer-b2b |
| 35 | [35-frontend-whitelabeling-tests.csv](Frontend/35-frontend-whitelabeling-tests.csv) | 68 | P1 | branding |
| 36 | [36-configurable-products-tests.csv](Frontend/36-configurable-products-tests.csv) | 133 | P1 | catalog-search |
| 41 | [41-coupons-promotions-tests.csv](Frontend/41-coupons-promotions-tests.csv) | 54 | P1 | marketing |

### Backend (26 suites)

| # | File | Cases | Priority | Domain |
|---|------|-------|----------|--------|
| 14 | [14-platform-api-tests.csv](Backend/14-platform-api-tests.csv) | 33 | P0 | auth-security |
| 15 | [15-graphql-xapi-tests.csv](Backend/15-graphql-xapi-tests.csv) | 33 | P1 | platform-config |
| 16 | [16-catalog-tests.csv](Backend/16-catalog-tests.csv) | 78 | P1 | catalog-search |
| 17 | [17-platform-core-tests.csv](Backend/17-platform-core-tests.csv) | 80 | P1 | auth-security |
| 18 | [18-store-tests.csv](Backend/18-store-tests.csv) | 65 | P1 | platform-config |
| 19 | [19-pricing-tests.csv](Backend/19-pricing-tests.csv) | 62 | P1 | purchase-flow |
| 20 | [20-orders-tests.csv](Backend/20-orders-tests.csv) | 90 | P1 | purchase-flow |
| 21 | [21-customer-tests.csv](Backend/21-customer-tests.csv) | 84 | P1 | customer-b2b |
| 22 | [22-inventory-tests.csv](Backend/22-inventory-tests.csv) | 43 | P1 | purchase-flow |
| 23 | [23-marketing-tests.csv](Backend/23-marketing-tests.csv) | 89 | P1 | marketing |
| 24 | [24-notifications-tests.csv](Backend/24-notifications-tests.csv) | 64 | P1 | communication |
| 25 | [25-cms-pagebuilder-tests.csv](Backend/25-cms-pagebuilder-tests.csv) | 75 | P1 | content-cms |
| 26 | [26-search-indexing-tests.csv](Backend/26-search-indexing-tests.csv) | 46 | P1 | catalog-search |
| 27 | [27-assets-tests.csv](Backend/27-assets-tests.csv) | 24 | P1 | content-cms |
| 28 | [28-core-settings-tests.csv](Backend/28-core-settings-tests.csv) | 14 | P2 | platform-config |
| 29 | [29-csv-export-import-tests.csv](Backend/29-csv-export-import-tests.csv) | 18 | P1 | catalog-search |
| 30 | [30-shipping-tests.csv](Backend/30-shipping-tests.csv) | 20 | P1 | purchase-flow |
| 31 | [31-seo-tests.csv](Backend/31-seo-tests.csv) | 20 | P1 | branding |
| 32 | [32-whitelabeling-tests.csv](Backend/32-whitelabeling-tests.csv) | 40 | P2 | branding |
| 33 | [33-push-messages-tests.csv](Backend/33-push-messages-tests.csv) | 25 | P2 | communication |
| 34 | [34-image-tools-tests.csv](Backend/34-image-tools-tests.csv) | 28 | P2 | content-cms |
| 37 | [37-returns-tests.csv](Backend/37-returns-tests.csv) | 22 | P1 | purchase-flow |
| 38 | [38-contracts-tests.csv](Backend/38-contracts-tests.csv) | 18 | P1 | customer-b2b |
| 39 | [39-loyalty-tests.csv](Backend/39-loyalty-tests.csv) | 18 | P1 | customer-b2b |
| 40 | [40-channels-tests.csv](Backend/40-channels-tests.csv) | 15 | P2 | platform-config |
| 42 | [42-xmarketing-tests.csv](Backend/42-xmarketing-tests.csv) | 38 | P1 | marketing |

---

## Legacy

| File | Status | Replaced By |
|------|--------|-------------|
| [04-cart-checkout-tests.csv](_legacy/04-cart-checkout-tests.csv) | Deprecated | Suites 04a, 04b, 04c |

---

## Selection Groups

### By Priority
| Selection | Suites | CI Command |
|-----------|--------|------------|
| `smoke` | 01 | `npm run ci:smoke` |
| `critical` | 01, 06, 08, 14 | `npm run ci:critical` |
| `release` | 00 | — |
| `sprint` | 33 suites | — |
| `full` | All 45 | `npm run ci:full` |

### By Layer
| Selection | Suites | CI Command |
|-----------|--------|------------|
| `frontend` | 01-13, 35, 36, 41 (19 suites) | `npm run ci:frontend` |
| `backend` | 14-34, 37-40, 42 (26 suites) | `npm run ci:backend` |

### By Domain
| Selection | Suites | Use Case |
|-----------|--------|----------|
| `domain:purchase-flow` | 04a, 04b, 04c, 05, 06, 19, 20, 22, 30, 37 | Revenue path changes |
| `domain:catalog-search` | 03, 16, 26, 29, 36 | Catalog/search module updates |
| `domain:auth-security` | 02, 08, 14, 17 | Auth or security changes |
| `domain:marketing` | 23, 41, 42 | Promotions/coupons changes |
| `domain:content-cms` | 25, 27, 34 | CMS or asset module updates |
| `domain:customer-b2b` | 13, 21, 38, 39 | Customer/B2B module changes |
| `domain:platform-config` | 15, 18, 28, 40 | Platform configuration changes |
| `domain:communication` | 24, 33 | Notification module updates |
| `domain:branding` | 31, 32, 35 | SEO/white-labeling changes |
| `domain:cross-cutting` | 00, 01, 07, 09, 10, 11, 12 | Non-functional & smoke |

### By Concern
| Selection | Description |
|-----------|-------------|
| `concern:functional` | Storefront user-facing functional tests |
| `concern:non-functional` | GA4, a11y, i18n, performance, browser compat |
| `concern:api` | REST API + GraphQL xAPI |
| `concern:admin` | Admin SPA module testing |

---

## CSV Column Format

All CSV files use the enriched agent-native format (15 columns):

```
ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status
```

---

## Related Documentation

- [test-suites.json](../../config/test-suites.json) — Regression orchestration manifest (single source of truth)
- [CLAUDE.md](../../CLAUDE.md) — Project testing overview
- [module-suite-map.md](../../.claude/agents/knowledge/module-suite-map.md) — Module-to-suite mapping
- [feature-domain-map.md](../../.claude/skills/testing/qa-coverage-gap/feature-domain-map.md) — Feature coverage tracking
- [Bug Reports](../../reports/bugs/) — Bug documentation
