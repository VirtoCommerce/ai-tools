# Virto Commerce Module → Test Suite Mapping

> Quick reference for mapping VC modules to regression test suites, admin UI sections, and API endpoints.

## Module Map

| Module | Regression Suites | Admin UI Sections | REST API Path | xAPI Module |
|--------|------------------|-------------------|---------------|-------------|
| **Catalog** | 03, 16, 36 | Catalog → Categories, Products, Properties | `/api/catalog/` | xCatalog |
| **Pricing** | 19 | Pricing → Price Lists, Assignments | `/api/pricing/` | — |
| **Orders** | 20 | Orders → All Orders, Payment Requests | `/api/order/` | xOrder |
| **Customers** | 21 | Contacts → Organizations, Members | `/api/contacts/`, `/api/members/` | xProfile |
| **Inventory** | 22 | Inventory → Fulfillment Centers, Stock | `/api/inventory/` | — |
| **Marketing** | 23 | Marketing → Promotions, Coupons, Content | `/api/marketing/` | — |
| **Notifications** | 24, 33 | Notifications → Templates, Layouts, Push | `/api/notifications/` | — |
| **CMS / Page Builder** | 25 | Content → Pages, Menus, Blog | `/api/content/` | xCMS |
| **Search** | 03, 26 | Search → Indexing, Configuration | `/api/search/` | — |
| **Assets** | 27 | Assets → Blob Storage | `/api/assets/` | — |
| **Platform Core** | 14, 17, 28 | Settings → Users, Roles, Permissions, Languages | `/api/platform/` | — |
| **Import/Export** | 29 | Data Import/Export pages | `/api/bulk/` | — |
| **Shipping** | 05, 30 | Shipping → Methods, BOPIS | `/api/shipping/` | — |
| **SEO** | 31 | Marketing → SEO, Redirects | `/api/seo/` | — |
| **White Labeling** | 32, 35 | Settings → Branding, Themes | — | — |
| **Image Tools** | 34 | Assets → Thumbnails | `/api/image-tools/` | — |
| **Cart** | 04a, 04b, 04c | — (storefront-only) | — | xCart |
| **Authentication** | 02, 08 | Settings → Security, OAuth | `/connect/token` | — |
| **Payment** | 06 | Orders → Payments | `/api/payments/` | — |
| **Analytics** | 07 | — (GA4 tracking) | — | — |
| **Accessibility** | 09 | — (storefront-only) | — | — |
| **Localization** | 10 | Settings → Languages | — | — |
| **Performance** | 11 | — (Core Web Vitals) | — | — |
| **Browser Compat** | 12 | — (cross-browser) | — | — |
| **B2C Features** | 13 | — (wishlists, variations) | — | — |

## Suite → Module Reverse Lookup

| Suite | Module(s) Covered |
|-------|-------------------|
| 01 (Smoke) | Cross-module: Auth, Catalog, Cart, Checkout, Payment |
| 02 (Auth) | Authentication, Platform Core |
| 03 (Catalog & Search) | Catalog, Search |
| 04a (Cart) | Cart, Marketing (coupons) |
| 04b (Checkout) | Cart, Orders, Shipping, Payment |
| 04c (Orders & Quotes) | Orders, Quotes |
| 05 (BOPIS) | Shipping, Inventory |
| 06 (Payment) | Payment (Skyflow, CyberSource, Authorize.Net, Datatrance) |
| 07 (Analytics) | Analytics (GA4) |
| 08 (Security) | Authentication, Platform Core |
| 09 (Accessibility) | Accessibility (WCAG 2.1 AA) |
| 10 (Localization) | Localization (13 languages) |
| 11 (Performance) | Performance (Core Web Vitals) |
| 12 (Browser Compat) | Browser Compatibility |
| 13 (B2C Features) | B2C (wishlists, variations) |
| 14 (Platform API) | Platform Core |
| 15 (GraphQL xAPI) | xCart, xCatalog, xOrder, xCMS, xProfile |
| 16 (Catalog Admin) | Catalog |
| 17 (Platform Core) | Platform Core (users, roles, dynamic props) |
| 18 (Store Admin) | Store Configuration |
| 19 (Pricing Admin) | Pricing |
| 20 (Orders Admin) | Orders |
| 21 (Customer Admin) | Customers |
| 22 (Inventory Admin) | Inventory |
| 23 (Marketing Admin) | Marketing |
| 24 (Notifications) | Notifications |
| 25 (CMS) | CMS / Page Builder |
| 26 (Search & Index) | Search |
| 27 (Assets) | Assets |
| 28 (Core Settings) | Platform Core |
| 29 (Import/Export) | Import/Export |
| 30 (Shipping) | Shipping |
| 31 (SEO) | SEO |
| 32 (White Labeling) | White Labeling |
| 33 (Push Messages) | Notifications (push) |
| 34 (Image Tools) | Image Tools |
| 35 (Frontend WL) | White Labeling (frontend) |
| 36 (Config Products) | Catalog (configurable products) |
| 37 (Returns) | Orders (returns, RMA) |
| 38 (Contracts) | Customers, Pricing (B2B contracts) |
| 39 (Loyalty) | Customers (loyalty rewards) |
| 40 (Channels) | Catalog (publishing, data quality) |
| 41 (Coupons & Promos) | Marketing (storefront coupons, promotions) |
| 42 (xMarketing) | Marketing (xAPI dynamic content, GraphQL) |

## Domain Groups

Suites are grouped into 10 business domains in `config/test-suites.json`. Use `domain:<name>` selections for domain-scoped regression runs.

| Domain | Suites | Description |
|--------|--------|-------------|
| `purchase-flow` | 04a, 04b, 04c, 05, 06, 19, 20, 22, 30, 37 | Revenue path: cart → checkout → payment → orders → shipping → inventory → returns |
| `catalog-search` | 03, 16, 26, 29, 36 | Product discovery: catalog, search, configurable products, indexing, import/export |
| `auth-security` | 02, 08, 14, 17 | Authentication, authorization, platform API, security |
| `marketing` | 23, 41, 42 | Promotions, coupons, dynamic content, xMarketing |
| `content-cms` | 25, 27, 34 | CMS, page builder, assets, image tools |
| `customer-b2b` | 13, 21, 38, 39 | Customer management, B2C features, contracts, loyalty |
| `platform-config` | 15, 18, 28, 40 | GraphQL xAPI, store config, core settings, channels |
| `communication` | 24, 33 | Notifications and push messages |
| `branding` | 31, 32, 35 | SEO, white labeling (backend + frontend) |
| `cross-cutting` | 00, 01, 07, 09, 10, 11, 12 | Smoke, analytics, a11y, i18n, performance, browser compat |

## Module Dependencies

```
Platform Core ──► All modules depend on Platform Core
Catalog ──► Pricing, Marketing, Search, SEO, Import/Export
Orders ──► Payment, Shipping, Inventory, Notifications
Cart (xAPI) ──► Catalog, Pricing, Shipping, Marketing
Authentication ──► Platform Core
```

## Impact Analysis Guide

When a module changes, test these suites:

| Changed Module | Must Run | Should Run |
|---------------|----------|------------|
| Catalog | 03, 16, 36 | 01, 15, 26, 29 |
| Orders | 20 | 01, 04a, 04b, 04c, 06, 15, 30, 37 |
| Cart (xAPI) | 04a | 01, 04b, 05, 06, 15, 23, 41 |
| Payment | 06 | 01, 04b, 20 |
| Platform Core | 14, 17, 28 | 01, 02, 08 |
| Search | 26 | 01, 03, 16 |
| Authentication | 02, 08 | 01, 14 |
