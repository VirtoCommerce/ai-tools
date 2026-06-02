---
applicability: reference
applicability_rationale: "vcst's module → suite mapping. Customer's mapping differs by module set + custom suites."
---

# Virto Commerce Module → Test Suite Mapping

> Quick reference for mapping VC modules to regression test suites, admin UI sections, and API endpoints.
> Suites are organized under `regression/suites/Frontend/` (user flows) and `Backend/` (admin UI, modules, APIs).

## Module Map

| Module | Frontend Suites | Backend Suites | Admin UI Sections | REST API Path | xAPI Module |
|--------|----------------|----------------|-------------------|---------------|-------------|
| **Catalog** | 001, 002, 003 | 051, 053 | Catalog → Categories, Products, Properties | `/api/catalog/` | xCatalog |
| **Search** | 004, 005 | 061 | Search → Indexing, Configuration | `/api/search/` | — |
| **Cart** | 028, 029, 030 | — | — (storefront-only) | — | xCart |
| **Checkout** | 011, 012, 013 | — | — (storefront-only) | — | xCart |
| **Orders** | 014, 015 | 017, 018, 019 | Orders → All Orders, Payment Requests | `/api/order/` | xOrder |
| **Payment** | 039, 040, 041 | — | Orders → Payments | `/api/payments/` | — |
| **BOPIS/Shipping** | 036, 037, 038 | 065 | Shipping → Methods, BOPIS | `/api/shipping/` | — |
| **Authentication** | 031, 032, 033 | — | Settings → Security, OAuth | `/connect/token` | — |
| **B2C Features** | 006-010 | — | — (wishlists, variations, orgs) | — | — |
| **Configurable Products** | 072, 072b, 072c | 052 | Catalog → Configurable Products | — | — |
| **White Labeling** | 070, 071 | 067 | Settings → Branding, Themes | — | — |
| **Marketing** | 077 | 023, 024, 025 | Marketing → Promotions, Coupons, Content | `/api/marketing/` | — |
| **Pricing** | — | 054, 055 | Pricing → Price Lists, Assignments | `/api/pricing/` | — |
| **Customers** | — | 026, 027 | Contacts → Organizations, Members | `/api/contacts/`, `/api/members/` | xProfile |
| **Inventory** | — | 056 | Inventory → Fulfillment Centers, Stock | `/api/inventory/` | — |
| **Notifications** | — | 057, 058 | Notifications → Templates, Layouts | `/api/notifications/` | — |
| **Push Messages** | — | 068 | Notifications → Push | `/api/notifications/` | — |
| **CMS / Page Builder** | — | 059, 060 | Content → Pages, Menus, Blog | `/api/content/` | xCMS |
| **Platform Core** | — | 020, 021, 063 | Settings → Users, Roles, Permissions | `/api/platform/` | — |
| **Platform API** | — | 049 | — | `/api/*` | — |
| **GraphQL xAPI** | — | 050 | — | `/graphql` | xCart, xCatalog, xOrder, xCMS, xProfile|
| **Store** | — | 034, 035 | Stores → Configuration, Rounding | `/api/stores/` | — |
| **Assets** | — | 062 | Assets → Blob Storage | `/api/assets/` | — |
| **Import/Export** | — | 064 | Data Import/Export pages | `/api/bulk/` | — |
| **SEO** | — | 066 | Marketing → SEO, Redirects | `/api/seo/` | — |
| **Image Tools** | — | 069 | Assets → Thumbnails | `/api/image-tools/` | — |
| **Returns** | — | 073 | Orders → Returns, RMA | `/api/returns/` | — |
| **Contracts** | — | 074 | Customers → Contracts | `/api/contracts/` | — |
| **Loyalty** | — | 075 | Customers → Loyalty | `/api/loyalty/` | — |
| **Channels** | — | 076 | Catalog → Publishing, Data Quality | `/api/channels/` | — |
| **xMarketing** | — | 079 | Marketing → xAPI Dynamic Content | — | xMarketing |
| **Cross-cutting** | 042-048 | — | — | — | — |

## Selection Groups (module-based)

Use these in `/qa-regression <group>` or CI `SUITE_SELECTION`:

| Group | Suites | Description |
|-------|--------|-------------|
| `smoke` | 042 | Daily go/no-go (19 P0 tests) |
| `critical` | 042, 039, 044, 049 | P0 suites only |
| `release` | 080 | Master release suite |
| `purchase-flow` | 028-030, 011-013, 014-015, 039-041 | Revenue path: cart → checkout → payment → orders |
| `catalog` | 001-003, 051, 053 | Catalog frontend + admin |
| `search` | 004-005, 061 | Search frontend + admin |
| `orders` | 014-019 | Orders frontend + admin |
| `auth` | 031-033 | Authentication |
| `b2c` | 006-010 | B2C features |
| `marketing` | 023-025, 077 | Marketing admin + storefront |
| `platform` | 020-021, 049, 063 | Platform core + API |
| `bopis` | 036-038 | BOPIS/pickup |
| `payment` | 039-041 | Payment processors |
| `configurable-products` | 052, 072, 072b, 072c | Config products admin + storefront |
| `whitelabeling` | 067, 070-071 | White labeling admin + storefront |
| `frontend` | All Frontend/ suites | Frontend-only regression |
| `backend` | All Backend/ suites | Backend-only regression |
| `sprint` | All P0 + P1 suites | Before sprint release |
| `full` | All 99 suites | Before production release |

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
| Catalog | 001-003, 051, 053 | 042, 050, 061, 064 |
| Orders | 017-019 | 042, 014-015, 039-041, 050, 065 |
| Cart (xAPI) | 028-030 | 042, 011-013, 036-038, 050, 077 |
| Payment | 039-041 | 042, 011, 017-018 |
| Platform Core | 049, 020-021, 063 | 042, 031-033, 044 |
| Search | 061 | 042, 004-005, 051 |
| Authentication | 031-033, 044 | 042, 049 |
| Marketing | 023-025, 077 | 042, 028, 079 |
| Configurable Products | 052, 072, 072b, 072c | 042, 001-003, 051 |
