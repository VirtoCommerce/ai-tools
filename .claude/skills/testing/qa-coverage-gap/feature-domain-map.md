# Feature Domain Map — Expected Test Coverage

This file maps every known application feature to its expected test coverage. Used by the gap analysis to identify missing areas.

> **Test counts live in `config/test-suites.json`** — never duplicate them here. This file tracks *what* is covered and *where*, not *how many*.

## Original Source: TestRail Exports

The `test-suites ( export from Test-rail )/` directory contains the **canonical test case inventory** exported from TestRail. These are the authoritative original test cases that the regression suites were derived from. During gap analysis, compare regression suites against these exports to detect:
- Test cases present in TestRail but missing from regression suites
- Test intent or coverage depth lost during migration to agent-native CSV format
- Section/domain mappings that may have shifted

| Export Directory | Content |
|-----------------|---------|
| `Frontend/Frontend26-02.csv.csv` | Latest frontend export (Sprint 26-02) — registration, catalog, cart, checkout, orders, BOPIS, payment, B2B |
| `Frontend/frontend-26-01.csv` | Previous frontend baseline (Sprint 26-01) |
| `Frontend/suites/` | 12 categorized suites: auth, catalog, product details, cart, checkout, BOPIS, orders, lists, B2B, analytics, UI/UX, l10n |
| `Backend (admin site)/` | 20 module exports: Catalog, Store, Pricing, Inventory, Marketing, Notifications, Orders, Customer, Platform, Shipping, Search, Assets, CMS, SEO, WhiteLabeling, Push Messages, Image Tools, CSV Import/Export, Elastic Search |
| `E2E/configurable-products/` | E2E configurable product import |
| `Frontend/ga4-test-data.csv` | GA4 analytics test data |

## Feature → Manifest Domain Mapping

Feature domains in this file map to `domain` field values in `config/test-suites.json`:

| Feature Domain(s) | Manifest Domain | Selection Group | Suites |
|-------------------|----------------|-----------------|--------|
| AUTH, SESSION, RBAC | auth-security | `auth` | 031-033, 044, 049 |
| CATALOG, SEARCH, FILTERS, COMPARE | catalog-search | `catalog`, `search`, `configurable-products` | 001-005, 051-053, 061, 072/b/c/d |
| CART, CHECKOUT, PAYMENT, ORDERS, BOPIS, PRICING, INVENTORY, SHIPPING, RETURNS | purchase-flow | `purchase-flow`, `payment`, `bopis`, `orders` | 011-015, 017-019, 028-030, 036-041, 054-056, 065, 073 |
| B2B-ORG, B2B-MEMBERS, LISTS, DASHBOARD, CONTRACTS, LOYALTY | customer-b2b | `b2c` | 006-010, 026-027, 074-075 |
| PROMOTIONS, COUPONS, CONTENT | marketing | `marketing` | 023-025, 077, 079 |
| NOTIFICATIONS, PUSH MESSAGES | communication | — | 057-058, 068 |
| CMS, ASSETS, IMAGE TOOLS | content-cms | — | 059-060, 062, 069 |
| USERS, STORE CONFIG, DYNAMIC PROPERTIES, CHANNELS, IMPORT/EXPORT, GRAPHQL | platform-config | `platform` | 020-021, 034-035, 050, 063-064, 076 |
| WHITE LABELING, SEO | branding | `whitelabeling` | 066-067, 070-071 |
| SMOKE, GA4, SECURITY, A11Y, I18N, PERFORMANCE, BROWSER COMPAT | cross-cutting | `smoke`, `critical` | 042-048, 078, 080 |

## Coverage Thresholds

| Priority | Minimum Cases | Must Include |
|----------|---------------|--------------|
| P0 | 5+ per feature | Happy path + top 3 error paths + 1 integration |
| P1 | 3+ per feature | Happy path + top error path |
| P2 | 1+ per feature | Happy path |

## Domain → Feature → Expected Coverage

### AUTH — Authentication & Registration
**Domain:** `auth-security` | **Selection:** `auth` | **Suites:** 031, 032, 033, 044, 049

| Feature | Suites | Status |
|---------|--------|--------|
| Personal registration | 031 | Covered |
| Org registration | 031 | Covered |
| Sign in / Sign out | 031 | Covered |
| Password reset | 031 | Covered |
| SSO (Azure/Google) | 031 | Covered |
| Account menu navigation | 033 | Covered |
| Session management (concurrent, expiry) | 032 | Covered |
| Email verification flows | 031 | Covered |
| RBAC & permissions | 032, 033 | Covered |
| Company account menu | 033 | Covered |
| Security (PCI, CSRF, XSS) | 044 | Covered |
| Platform API auth | 049 | Covered |

### CATALOG — Catalog & Product Discovery
**Domain:** `catalog-search` | **Selection:** `catalog` | **Suites:** 001, 002, 003, 051, 053

| Feature | Suites | Status |
|---------|--------|--------|
| Category navigation | 001 | Covered |
| Faceted filtering | 003 | Covered |
| Product detail page | 002 | Covered |
| Sorting & pagination | 001 | Covered |
| Product comparison | 002 | Partial — embedded in PDP, no dedicated compare page suite |
| Brands page | 001 | Covered |
| Virtual catalogs (B2B) | 001 | Covered |
| Catalog admin (products) | 051 | Covered |
| Catalog admin (categories) | 053 | Covered |

### SEARCH — Search
**Domain:** `catalog-search` | **Selection:** `search` | **Suites:** 004, 005, 061

| Feature | Suites | Status |
|---------|--------|--------|
| Global search | 004 | Covered |
| Autocomplete/suggestions | 004 | Covered |
| Search history | 004 | Covered |
| No results handling | 004 | Covered |
| Advanced search filters | 005 | Covered |
| Search indexing admin | 061 | Covered |

### CART — Cart Operations
**Domain:** `purchase-flow` | **Selection:** `purchase-flow` | **Suites:** 028, 029, 030

| Feature | Suites | Status |
|---------|--------|--------|
| Add to cart (all product types) | 028 | Covered |
| Quantity management | 028 | Covered |
| Remove / Clear cart | 028 | Covered |
| Save for later | 028 | Partial |
| Coupon codes | 028 | Covered |
| Cart persistence (sign out/in) | 029 | Covered |
| Cart validation errors block checkout | 029 | Covered |
| Cart merge (anonymous → signed in) | 030 | Covered |
| Mixed cart (pickup + delivery) | 037 | Covered |
| Price change during session | 029 | Partial — price validation exists, but real-time mid-session price change scenario is limited |

### CHECKOUT — Checkout Flows
**Domain:** `purchase-flow` | **Selection:** `purchase-flow` | **Suites:** 011, 012, 013

| Feature | Suites | Status |
|---------|--------|--------|
| Standard delivery checkout | 011 | Covered |
| Guest checkout | 012 | Covered |
| B2B checkout (PO number, approval) | 013 | Covered |
| New address at checkout | 011 | Covered |
| Saved address selection | 011 | Covered |
| Billing != shipping | 011 | Covered |
| Checkout field validation | 011 | Covered |
| Subscription/recurring orders | None | **GAP** — not active in current QA environment |

### PAYMENT — Payment Processing
**Domain:** `purchase-flow` | **Selection:** `payment` | **Suites:** 039, 040, 041

| Feature | Suites | Status |
|---------|--------|--------|
| CyberSource | 039 | Covered |
| Skyflow | 040 | Covered |
| Authorize.Net | 040 | Covered |
| Datatrance | 040 | Covered |
| Payment cross-cutting (UX, form, tabs) | 041 | Covered |
| PCI compliance | 044 | Covered |
| Declined card recovery | 039, 040 | Partial — basic error paths exist, no full recovery flow |

### ORDERS — Order Management
**Domain:** `purchase-flow` | **Selection:** `orders` | **Suites:** 014, 015, 017, 018, 019

| Feature | Suites | Status |
|---------|--------|--------|
| Order history (list) | 014 | Covered |
| Order detail page | 014 | Covered |
| Order status tracking | 014 | Covered |
| Reorder flow | 014 | Partial — limited scenarios |
| Quotes (RFQ, negotiation, conversion) | 015 | Covered |
| Quote history & status | 015 | Covered |
| Orders admin management | 017 | Covered |
| Orders admin payments | 018 | Covered |
| Orders admin shipments | 019 | Covered |
| Returns / RMA | 073 | Covered |
| Invoice/PDF download | 014 | Partial — order details tested, PDF download not isolated |

### BOPIS — Buy Online Pickup In Store
**Domain:** `purchase-flow` | **Selection:** `bopis` | **Suites:** 036, 037, 038

| Feature | Suites | Status |
|---------|--------|--------|
| Location selector | 036 | Covered |
| Map interactions | 036 | Covered |
| Search/filter locations | 036 | Covered |
| BOPIS cart integration | 037 | Covered |
| BOPIS checkout | 038 | Covered |

### B2B-ORG — Multi-Organization
**Domain:** `customer-b2b` | **Selection:** `b2c` | **Suites:** 006, 027

| Feature | Suites | Status |
|---------|--------|--------|
| Org switcher | 006 | Covered |
| Cart isolation between orgs | 006 | Covered |
| Org-specific pricing | 006, 054 | Covered |
| Ship-to per company | 010 | Covered |
| Default org on sign-in | 006 | Covered |
| Org admin (create, manage) | 027 | Covered |

### B2B-MEMBERS — Company Members & Roles
**Domain:** `customer-b2b` | **Selection:** `b2c` | **Suites:** 008, 026, 027

| Feature | Suites | Status |
|---------|--------|--------|
| Invite member | 027 | Covered |
| Edit member role | 008, 026 | Covered |
| Block/unblock member | 026 | Covered |
| Contact management (admin) | 026 | Covered |
| Delegated purchasing (approval) | 013 | Partial — B2B checkout covers some approval, no dedicated delegation flow |

### LISTS — Lists & Quick Order
**Domain:** `customer-b2b` | **Selection:** `b2c` | **Suites:** 007, 010

| Feature | Suites | Status |
|---------|--------|--------|
| Wishlist CRUD | 007 | Covered |
| Shared lists | 007 | Covered |
| Add list to cart | 007 | Covered |
| Bulk order page | 010 | Covered |
| Quick order by SKU | 010 | Partial — covered implicitly in bulk order, not isolated |

### DASHBOARD — Account Dashboard
**Domain:** `customer-b2b` | **Selection:** `b2c` | **Suites:** 010

| Feature | Suites | Status |
|---------|--------|--------|
| Dashboard page content | 010 | Covered |
| Recent orders widget | 010 | Covered |
| Monthly spend display | 010 | Partial — dashboard tested but spend widget not isolated |

### CONFIGURABLE PRODUCTS
**Domain:** `catalog-search` | **Selection:** `configurable-products` | **Suites:** 072, 072b, 072c, 072d, 052

| Feature | Suites | Status |
|---------|--------|--------|
| Configuration widget UI | 072 | Covered |
| E2E config scenarios | 072b | Covered |
| Cross-cutting (a11y, responsive) | 072c | Covered |
| File & text section configs | 072d | Covered |
| Configurable products admin | 052 | Covered |

### PRICING & INVENTORY (Backend)
**Domain:** `purchase-flow` | **Suites:** 054, 055, 056

| Feature | Suites | Status |
|---------|--------|--------|
| Pricing logic | 054 | Covered |
| Pricing management (admin) | 055 | Covered |
| Fulfillment centers | 056 | Covered |
| Stock management | 056 | Covered |

### MARKETING — Promotions & Coupons
**Domain:** `marketing` | **Selection:** `marketing` | **Suites:** 023, 024, 025, 077, 079

| Feature | Suites | Status |
|---------|--------|--------|
| Promotions management (admin) | 023 | Covered |
| Marketing content (admin) | 024 | Covered |
| Coupons & API (admin) | 025 | Covered |
| Coupons & promotions (storefront) | 077 | Covered |
| xMarketing (extended) | 079 | Covered |

### WHITE LABELING & BRANDING
**Domain:** `branding` | **Selection:** `whitelabeling` | **Suites:** 066, 067, 070, 071

| Feature | Suites | Status |
|---------|--------|--------|
| White labeling admin | 067 | Covered |
| Storefront theming | 070 | Covered |
| Branding (logos, colors) | 071 | Covered |
| SEO management | 066 | Covered |

### NOTIFICATIONS & MESSAGING
**Domain:** `communication` | **Suites:** 057, 058, 068

| Feature | Suites | Status |
|---------|--------|--------|
| Notification templates (admin) | 057 | Covered |
| Notification triggers (admin) | 058 | Covered |
| Push messages | 068 | Covered |
| Storefront notification dropdown | None | **GAP** — no frontend notification UI tests |
| Back-in-stock alerts (storefront) | None | **GAP** — depends on push message + inventory integration |

### CMS & CONTENT
**Domain:** `content-cms` | **Suites:** 059, 060, 062, 069

| Feature | Suites | Status |
|---------|--------|--------|
| CMS page management | 059 | Covered |
| CMS design & content | 060 | Covered |
| Page Builder designer — block library (15 types) | 060 | Covered (COV-2026-03-25-1630: +18 cases) |
| Page Builder designer — core features (viewport, search, save, preview) | 060 | Covered (COV-2026-03-25-1630: +18 cases) |
| Asset management | 062 | Covered |
| Image tools | 069 | Covered |

### PLATFORM & CONFIGURATION
**Domain:** `platform-config` | **Selection:** `platform` | **Suites:** 020, 021, 034, 035, 050, 063, 064, 076

| Feature | Suites | Status |
|---------|--------|--------|
| Users, roles & settings | 020 | Covered |
| Dynamic properties | 021 | Covered |
| Core platform settings | 063 | Covered |
| Store management | 034 | Covered |
| Store rounding & email | 035 | Covered |
| GraphQL xAPI | 050 | Covered |
| Channels | 076 | Covered |
| CSV import/export | 064 | Covered |

### ADDITIONAL MODULES
**Suites:** 065, 073, 074, 075

| Feature | Suites | Status |
|---------|--------|--------|
| Shipping management | 065 | Covered |
| Returns / RMA | 073 | Covered |
| Contracts | 074 | Covered |
| Loyalty program | 075 | Covered |

### CROSS-CUTTING — Non-Functional
**Domain:** `cross-cutting` | **Selection:** `smoke`, `critical` | **Suites:** 042-048, 078, 080

| Feature | Suites | Status |
|---------|--------|--------|
| Smoke tests (frontend) | 042 | Covered |
| Backend smoke tests | 078 | Covered |
| Google Analytics 4 | 043 | Covered |
| Security & PCI | 044 | Covered |
| Accessibility (WCAG 2.1 AA) | 045 | Covered |
| Localization / i18n | 046 | Covered |
| Performance | 047 | Covered |
| Browser compatibility | 048 | Covered |
| Full regression release | 080 | Covered |
| Admin impersonation ("login on behalf") | 020 | Partial — basic impersonation in platform admin, no cross-company or stop-impersonation tests |

## Gap Summary

| Gap | Domain | Risk | Suggested Action |
|-----|--------|------|------------------|
| Subscription/recurring orders | CHECKOUT | P2 | Low priority — not active in current QA environment |
| Storefront notification dropdown | NOTIFICATIONS | P2 | Add frontend notification UI cases to a future sprint suite |
| Back-in-stock alerts (storefront) | NOTIFICATIONS | P2 | Depends on push message + inventory integration |
| Admin impersonation depth | CROSS-CUTTING | P2 | Expand 020 or create dedicated impersonation suite |
| Product comparison page | CATALOG | P2 | Compare tests exist in PDP (002); dedicated compare-page suite would improve coverage |
| Quick order by SKU (isolated) | LISTS | P3 | Covered implicitly in bulk order (010); low risk |

**Previous gaps now resolved:** Cart persistence (029), Cart validation (029), Guest checkout (012), B2B checkout (013), Billing != shipping (011), Checkout field validation (011), Quotes (015), B2B-ORG (006, 027), B2B-MEMBERS (008, 026, 027), Lists/shared (007), Dashboard (010), Reorder (014), Returns (073), Order status (014).
