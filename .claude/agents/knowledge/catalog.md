# Catalog — Agent Reference

Platform knowledge for testing the Virto Commerce Catalog module.
Covers both the **Admin SPA** (Backend Suite 16) and **Storefront xCatalog GraphQL API** (Frontend Suite 03).

## Architecture

Two surfaces:
- **Admin SPA** — manage catalogs, categories, products, properties (Suite 16, agent: `qa-backend-expert`)
- **Storefront xCatalog** — GraphQL API serving products/categories to frontend (Suite 03, agent: `qa-frontend-expert`)

Catalog browsing with facets and filters is a **Critical Revenue Flow** — must pass before every deployment.

---

## B2B Virtual Catalog — Storefront Catalog

### What Is Used on the Frontend

The **B2B-store** storefront uses a **virtual catalog named `B2B-mixed`**.

Confirmed from Admin smoke test (2026-02-13):
> *B2B-store detail: **Catalog B2B-mixed**, State Open, 14 languages (en-US default), 8 currencies (USD default)*

Confirmed from Suite 36 test data:
> *Set Category to `Configurable Products [YYYYMMDD]` in **B2B-mixed catalog***

### Physical vs Virtual Catalog

| Type | Description |
|------|-------------|
| **Physical catalog** | Online inventory of actual products/services. Only **one physical catalog can be assigned to a store**. Contains the master product data. |
| **Virtual catalog** | Created from one or more physical catalogs. A curated subset/combination of items. Used to present products without duplicating them. |

### How Virtual Catalogs Work

- Virtual catalog = a **view** over physical catalog data — no product duplication
- Changes in a physical catalog **immediately reflect** in all linked virtual catalogs
- Cannot include products from one virtual catalog into another virtual catalog
- Every virtual catalog requires a **unique name** (no sharing with physical or other virtual catalogs)
- Products and categories in a virtual catalog originate from physical catalogs

### B2B-mixed Catalog Setup

- **Type:** Virtual catalog
- **Linked to:** B2B-store (`STORE_ID` env var)
- **Languages:** 14 (default: `en-US`)
- **Currencies:** 8 (default: `USD`)
- **Store state:** Open

### Admin Navigation

`Catalog module → B2B-mixed` (virtual catalog, right-click → Manage to edit)

Products added to the storefront must be placed in a category within **B2B-mixed** (or its linked physical catalog). Example from Suite 36:
- Go to `Catalog > Products > Add new product`
- Set Category to the desired category **in B2B-mixed catalog**
- Product then appears on the storefront

### Categories Query (xCatalog)

```graphql
{
  categories(
    storeId: "B2B-store"
    userId: "d97ee2c7-e29d-440a-a43a-388eb5586087"
    cultureName: "en-US"
    currencyCode: "USD"
    first: 10
    after: "0"
  ) {
    items {
      id
      name
      hasParent
    }
    pageInfo {
      hasNextPage
      startCursor
    }
  }
}
```

---

## xCatalog GraphQL API (Storefront)

**Endpoint:** `/graphql` (xAPI)
Context7 library: `/virtocommerce/vc-docs`

### Key Queries

| Query | Purpose |
|-------|---------|
| `products(...)` | Search/filter products with pagination, sorting, facets |
| `properties(...)` | Retrieve catalog property metadata |
| `categories` | Browse category tree |

### Product Query — Full Parameters

```graphql
query {
  products(
    storeId: "B2B-store"
    userId: "d97ee2c7-e29d-440a-a43a-388eb5586087"
    cultureName: "en-US"
    currencyCode: "USD"
    query: "search term"
    filter: "brand:X price.usd:[100 TO 200) category.path:id1/id2 status:hidden,visible"
    first: 20
    after: "0"
    sort: "name:asc"
    facet: "brand category price"
  ) {
    totalCount
    items {
      id
      code
      name
      isPurchased
      price {
        actual { amount formattedAmount }
      }
    }
    pageInfo { hasNextPage startCursor endCursor }
  }
}
```

### Filter Syntax

| Filter | Example |
|--------|---------|
| By category path | `category.path:<id>/<subid>` |
| By status | `status:hidden,visible` |
| By price range | `price.usd:[100 TO 200)` — `[` inclusive, `)` exclusive |
| By property | `color:Black,Blue` |
| By name pattern | `name:"ASUS ZenFone 2*"` |
| By product family | `productfamilyid:<id>` |

### Properties Query

```graphql
{
  properties(
    storeId: "B2B-Store"
    cultureName: "en-EN"
    types: [PRODUCT, VARIATION]
  ) {
    items {
      name
      type
      id
      multivalue
      propertyDictItems { totalCount items { value } }
    }
  }
}
```

Property types: `PRODUCT`, `VARIATION`, `CATALOG`

### REST API

```http
GET /api/catalog/products?responseGroup=WithProperties
```

`responseGroup` values: `WithProperties`, `WithImages`, `Full` — controls detail level.

---

## Admin SPA — Catalog Management

### Catalog Sections

| Section | Description |
|---------|-------------|
| **Common Catalogs** | Create/edit/delete physical & virtual catalogs, multi-language |
| **Categories** | Tree structure — name + code required, visible toggle, priority |
| **Products** | CRUD, images, descriptions, SEO, properties |
| **Properties** | Types: PRODUCT, VARIATION, CATALOG; supports multivalue, dictionary items |
| **Import/Export** | CSV format (see Suite 29) |

### Catalog CRUD Rules

- Catalog name is **required**; code is auto-generated or manual
- Delete requires typing `'Yes'` in confirmation dialog
- Multi-language: one default + multiple additional languages per catalog
- Virtual catalogs link to physical catalogs

### Category CRUD Rules

- **Name** and **Code** are both required
- Categories form a tree; subcategories inherit parent visibility
- Visible toggle controls storefront display

---

## Test Suites

### Frontend — Suite 03: Catalog & Search Tests
File: `regression/suites/Frontend/03-catalog-search-tests.csv`
Tags: `catalog`, `search`, `sprint`

| ID | Title | Section | Priority |
|----|-------|---------|----------|
| CAT-001 | Category Navigation - Main Menu | Catalog > Navigation | High |
| CAT-002 | Category Page - Product Grid View | Catalog > Display | High |
| CAT-003 | Category Page - Product List View | Catalog > Display | High |
| CAT-004 | Category - Facet Filtering | Catalog > Filters | High |
| CAT-005 | Category - Price Range Filter | Catalog > Filters | High |
| CAT-006 | Category - Clear Filters | Catalog > Filters | Medium |
| CAT-007 | Category - Sorting Options | Catalog > Sorting | Medium |
| CAT-008 | Category - Pagination | Catalog > Pagination | Medium |
| CAT-009 | Category - Products Per Page | Catalog > Pagination | Low |
| CAT-010 | Product Detail - Basic Info | Catalog > Product | High |
| CAT-011 | Product Detail - Image Gallery | Catalog > Product | Medium |
| CAT-012 | Product Variations - B2C Style | Catalog > Variations | High |
| CAT-013 | Product - Related Products | Catalog > Product | Low |

### Backend — Suite 16: Catalog Admin Tests
File: `regression/suites/Backend/16-catalog-tests.csv`
Tags: `catalog`, `admin`, `crud`, `configurable-products`

| ID | Title | Section | Priority |
|----|-------|---------|----------|
| CAT-001 | Add New Catalog | Catalog > Common Catalogs | Critical |
| CAT-002 | Edit Existing Catalog | Catalog > Common Catalogs | High |
| CAT-003 | Delete Catalog - Cancel | Catalog > Common Catalogs | High |
| CAT-004 | Delete Catalog - Confirm | Catalog > Common Catalogs | High |
| CAT-005 | Add Catalog with Multiple Languages | Catalog > Common Catalogs | Medium |
| CAT-006 | Add New Language Value to Catalog | Catalog > Common Catalogs | High |
| CAT-007 | Delete Language Value from Catalog | Catalog > Common Catalogs | Medium |
| CAT-008 | Add New Category | Catalog > Categories | Critical |
| CAT-009 | Edit Existing Category | Catalog > Categories | High |

### Related Suites

| Suite | Relevance |
|-------|-----------|
| Suite 15 — GraphQL xAPI | xCatalog product/property queries |
| Suite 19 — Pricing | Price lists linked to catalog products |
| Suite 22 — Inventory | Stock linked to catalog SKUs |
| Suite 29 — CSV Import/Export | Catalog product data import |
| Suite 36 — Configurable Products | Configurable product variations |

---

## Testing Notes

- Always use `storeId` from `STORE_ID` env var in xCatalog GraphQL queries
- Facets to validate: `brand`, `category`, `price` — check `totalCount` updates after filter
- Verify `pageInfo.hasNextPage` for pagination correctness
- Admin agent: `qa-backend-expert` on `playwright-edge` or Chrome DevTools MCP
- Frontend agent: `qa-frontend-expert` on `playwright-chrome`
- Catalog browsing is in **Critical Revenue Flow** — block deployment if failing
