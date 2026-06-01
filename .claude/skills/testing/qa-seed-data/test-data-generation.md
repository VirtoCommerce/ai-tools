# Test Data Generation — Agent Reference

API endpoints, entity schemas, and dependency order for creating a complete test environment via REST API / Postman MCP.

**Consumers:** `qa-backend-expert` (primary), `qa-frontend-expert` (verify storefront), `test-management-specialist` (test planning).

---

## Entity Dependency Graph

Create top-down, delete bottom-up. Numbers indicate execution order.

```
 1. Store (usually pre-exists — verify, don't create)
 2. Catalog (physical)
    ├── 2a. Assign Catalog to Store (PUT store with catalog in `catalog` field — REQUIRED before price list assignment works)
    └── 3. Virtual Catalog (links to physical, assigned to store)
        └── 4. Category (tree structure, requires catalogId)
            └── 5. Product (requires catalogId + categoryId)
                ├── 6. Properties (set on product)
                ├── 7. Variations (child products, linked to parent)
                ├── 8. Images (upload via Assets, link to product)
                └── 9. SEO (slugs per language)
10. Price List (independent)
    ├── 11. Price List Assignment (links to catalog + store — catalog MUST be assigned to store first, or returns 500)
    └── 12. Prices (per product/SKU, tiered by quantity)
13. Fulfillment Center (usually pre-exists — verify)
    └── 14. Inventory (per product per FFC)
15. Organization (B2B company)
    ├── 16. Contact (person record)
    │   └── 17. User Account (login, linked to contact)
    └── 18. Role + Permissions (assigned to user within org)
19. Addresses (on contact or organization)
20. Search Reindex (trigger after all data created)
```

---

## REST API Endpoints

All endpoints require `Authorization: Bearer {{authToken}}`.
Base: `{{baseUrl}}` = `BACK_URL` env variable.

**Verify before using:** Check Swagger UI at `{{baseUrl}}/docs/index.html` for current endpoint signatures. For GraphQL verification requests (08-Verify folder), run introspection first — see [`../qa-postman/graphql-authoring.md`](../qa-postman/graphql-authoring.md) §3 (Schema Introspection) and the canonical `.claude/agents/knowledge/graphql-schema.md`.

### Authentication

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Get token | POST | `/connect/token` | `grant_type=password&username={{admin}}&password={{adminPassword}}&scope=offline_access` (form-urlencoded) |

Response: `{ "access_token": "...", "expires_in": 3600 }`

### Store (verify, rarely create)

| Action | Method | Endpoint |
|--------|--------|----------|
| Get store | GET | `/api/stores/{{storeId}}` |
| List stores | POST | `/api/stores/search` |
| Get store settings | GET | `/api/stores/{{storeId}}/settings` |
| Update store (assign catalog) | PUT | `/api/stores` | Full store object with `catalog` field set |

**Assign catalog to store:** GET the store first, then PUT it back with the test catalog added to the `catalog` field. This is a **prerequisite** for price list assignments — without it, `POST /api/pricing/assignments` returns 500.

```json
// GET /api/stores/{{storeId}} → extract full store object, then PUT with catalog linked:
{
  "id": "{{storeId}}",
  "catalog": "{{catalogId}}",
  // ... (preserve all other existing store fields)
}
```

### Catalog

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create physical catalog | POST | `/api/catalog/catalogs` | `name`, `languages[]` (e.g. `["en-US","de-DE"]`), `isVirtual: false` |
| Create virtual catalog | POST | `/api/catalog/catalogs` | `name`, `isVirtual: true`, `virtualCatalogProductsHierarchy` with `links[]` (physical catalog IDs). **Storefront visibility requires linking products into the active B2B virtual catalog `@td(VIRTUAL_CATALOG_B2B.id)`** — products only in a physical catalog return 404 on storefront. See `feedback_storefront_virtual_catalog_link.md`. |
| Get catalog | GET | `/api/catalog/catalogs/{{catalogId}}` | |
| Delete catalog | DELETE | `/api/catalog/catalogs/{{catalogId}}` | Path-based, not query param |

**Full catalog body:**
```json
{
  "name": "AGENT-TEST-Catalog-20260306",
  "languages": [
    { "languageCode": "en-US", "isDefault": true },
    { "languageCode": "de-DE", "isDefault": false }
  ],
  "isVirtual": false
}
```

### Category

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create category | POST | `/api/catalog/categories` | `catalogId`, `name`, `code`, `isActive`, `priority`, `parentId` (optional for subcategory) |
| Update category | PUT | `/api/catalog/categories` | Full category object |
| Search categories | POST | `/api/catalog/search/categories` | `{ "catalogId": "...", "keyword": "..." }` |
| Delete category | POST | `/api/catalog/listentries/delete` | `{ "listEntryIds": ["{{categoryId}}"], "objectType": "Category" }` |

**Full category body:**
```json
{
  "catalogId": "{{catalogId}}",
  "parentId": null,
  "name": "AGENT-TEST-Cat-Electronics",
  "code": "AGENT-TEST-CAT-ELEC-20260306",
  "isActive": true,
  "priority": 1,
  "seoInfos": [
    { "languageCode": "en-US", "semanticUrl": "test-electronics", "pageTitle": "Test Electronics", "metaDescription": "Test category" }
  ]
}
```

### Product

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create product | POST | `/api/catalog/products` | `catalogId`, `categoryId`, `name`, `code` (SKU), `productType`, `isActive`, `isBuyable` |
| Update product | PUT | `/api/catalog/products` | Full product object (use for adding properties, images, SEO) |
| Get product | GET | `/api/catalog/products/{{productId}}?responseGroup=Full` | |
| Delete product | POST | `/api/catalog/listentries/delete` | `{ "listEntryIds": ["{{productId}}"], "objectType": "CatalogProduct" }` |
| Search products | POST | `/api/catalog/search/products` | `{ "keyword": "", "catalogId": "..." }` |

**Product types:**

| productType | Use Case |
|-------------|----------|
| `Physical` | Standard shippable product |
| `Digital` | Downloadable / service product |
| `BillOfMaterials` | Bundle / kit |

**Full product body (Physical with all fields):**
```json
{
  "catalogId": "{{catalogId}}",
  "categoryId": "{{categoryId}}",
  "name": "AGENT-TEST-Wireless-Headphones",
  "code": "AGENT-TEST-WH-20260306",
  "productType": "Physical",
  "isActive": true,
  "isBuyable": true,
  "trackInventory": true,
  "minQuantity": 1,
  "maxQuantity": 100,
  "vendor": "Test Vendor Inc",
  "gtin": "0123456789012",
  "manufacturerPartNumber": "WH-MPN-001",
  "taxType": "Taxable",
  "weight": 0.35,
  "weightUnit": "kg",
  "height": 20,
  "width": 18,
  "length": 8,
  "measureUnit": "cm",
  "packageType": "Box",
  "descriptions": [
    { "content": "<p>Premium wireless headphones with active noise cancellation.</p>", "descriptionType": "FullReview", "languageCode": "en-US" },
    { "content": "<p>Short description for listing.</p>", "descriptionType": "QuickReview", "languageCode": "en-US" }
  ],
  "properties": [
    { "name": "Brand", "values": [{ "value": "TestBrand", "valueType": "ShortText" }] },
    { "name": "Color", "values": [{ "value": "Black", "valueType": "ShortText" }] },
    { "name": "Connectivity", "values": [{ "value": "Bluetooth 5.3", "valueType": "ShortText" }] },
    { "name": "Battery Life (hours)", "values": [{ "value": "30", "valueType": "Number" }] },
    { "name": "Noise Cancellation", "values": [{ "value": "true", "valueType": "Boolean" }] }
  ],
  "seoInfos": [
    { "languageCode": "en-US", "semanticUrl": "test-wireless-headphones", "pageTitle": "Test Wireless Headphones", "metaDescription": "Test product for QA" }
  ]
}
```

**Property value types:** `ShortText`, `LongText`, `Number`, `DateTime`, `Boolean`, `Integer`, `DecimalNumber`

**Multi-value property example:**
```json
{ "name": "Compatible Devices", "multivalue": true, "values": [
  { "value": "iPhone", "valueType": "ShortText" },
  { "value": "Android", "valueType": "ShortText" },
  { "value": "PC", "valueType": "ShortText" }
]}
```

### Variations (child products)

Create as a product with `mainProductId` pointing to parent:

```json
{
  "catalogId": "{{catalogId}}",
  "categoryId": "{{categoryId}}",
  "mainProductId": "{{parentProductId}}",
  "name": "AGENT-TEST-Wireless-Headphones-White",
  "code": "AGENT-TEST-WH-WHITE-20260306",
  "productType": "Physical",
  "isActive": true,
  "isBuyable": true,
  "properties": [
    { "name": "Color", "values": [{ "value": "White", "valueType": "ShortText" }] },
    { "name": "Size", "values": [{ "value": "Standard", "valueType": "ShortText" }] }
  ]
}
```

### Images / Assets

| Action | Method | Endpoint |
|--------|--------|----------|
| Upload asset | POST | `/api/assets?folderUrl=/catalog/{{catalogId}}` (multipart/form-data) |
| Link to product | PUT | `/api/catalog/products` (update product with `images[]`) |

**Image array on product:**
```json
{
  "images": [
    { "url": "{{uploadedImageUrl}}", "name": "primary.jpg", "group": "primary", "sortOrder": 0 },
    { "url": "{{uploadedImageUrl2}}", "name": "gallery-1.jpg", "group": "gallery", "sortOrder": 1 }
  ]
}
```

### Pricing

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create price list | POST | `/api/pricing/pricelists` | `name`, `currency`, `description` |
| Create assignment | POST | `/api/pricing/assignments` | `pricelistId`, `catalogId`, `storeId`, `priority`. **Prerequisite:** catalog must be assigned to store first (see Store section) |
| Set prices | PUT | `/api/products/prices` | Array of ProductPrice objects with nested `prices[]` |
| Get prices | GET | `/api/pricing/pricelists?keyword=...` | Query param search (not POST) |
| Delete price list | DELETE | `/api/pricing/pricelists?ids={{priceListId}}` | |

**Full price list + prices:**
```json
// Price list
{
  "name": "AGENT-TEST-PL-USD-20260306",
  "currency": "USD",
  "description": "QA test price list"
}

// Assignment
{
  "pricelistId": "{{priceListId}}",
  "catalogId": "{{catalogId}}",
  "storeId": "{{storeId}}",
  "priority": 100
}

// Prices (tiered)
[
  { "pricelistId": "{{priceListId}}", "productId": "{{productId}}", "list": 99.99, "sale": 89.99, "minQuantity": 1, "currency": "USD" },
  { "pricelistId": "{{priceListId}}", "productId": "{{productId}}", "list": 84.99, "sale": null, "minQuantity": 5, "currency": "USD" },
  { "pricelistId": "{{priceListId}}", "productId": "{{productId}}", "list": 74.99, "sale": null, "minQuantity": 10, "currency": "USD" }
]
```

### Inventory

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Set inventory (create) | PUT | `/api/inventory/products/{{productId}}` | Array of inventory entries. Returns 200 on create; **500s on some envs when updating** existing rows — fall back to PATCH |
| Update inventory (preferred for edits) | PATCH | `/api/inventory/{{inventoryId}}` | JsonPatch document. Reliable for status / quantity edits on existing rows. See `reference_inventory_admin_api.md` |
| Get inventory | GET | `/api/inventory/products/{{productId}}` | |
| List FFCs | POST | `/api/inventory/fulfillmentcenters/search` | `{ "take": 50 }` |

**`inventoryStatus` enum:** `Enabled` | `Disabled` | `Ignored` (NOT `InStock`). **MUST set `Enabled` for storefront purchase** — xAPI `addItem` silently no-ops (`itemsCount=0`, no error) when status is `Disabled`. See `feedback_xapi_additem_silent_disabled.md`.

**Inventory body:**
```json
[
  {
    "fulfillmentCenterId": "{{ffcId}}",
    "productId": "{{productId}}",
    "inStockQuantity": 100,
    "reservedQuantity": 0,
    "inventoryStatus": "Enabled"
  }
]
```

**JsonPatch update (PATCH) — set status:**
```json
[
  { "op": "replace", "path": "/inventoryStatus", "value": "Enabled" },
  { "op": "replace", "path": "/inStockQuantity", "value": 100 }
]
```

### Organizations (B2B)

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create organization | POST | `/api/members` | `memberType: "Organization"`, `name`, `emails[]`, `phones[]`, `addresses[]` |
| Get organization | GET | `/api/members/{{orgId}}` | |
| Search organizations | POST | `/api/members/search` | `{ "memberType": "Organization" }` |
| Delete organization | DELETE | `/api/members?ids={{orgId}}` | |

**Full organization body:**
```json
{
  "memberType": "Organization",
  "name": "AGENT-TEST-Org-AcmeCorp-20260306",
  "emails": ["test-org@example.com"],
  "phones": ["+1-555-AGENT-TEST-001"],
  "addresses": [
    {
      "addressType": "BillingAndShipping",
      "firstName": "Test",
      "lastName": "Admin",
      "organization": "AGENT-TEST-Org-AcmeCorp-20260306",
      "line1": "123 Test Street",
      "city": "New York",
      "regionId": "NY",
      "regionName": "New York",
      "postalCode": "10001",
      "countryCode": "US",
      "countryName": "United States",
      "phone": "+1-555-AGENT-TEST-001",
      "email": "test-org@example.com"
    }
  ],
  "dynamicProperties": [],
  "groups": [],
  "description": "QA test organization"
}
```

### Contacts

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create contact | POST | `/api/members` | `memberType: "Contact"`, `firstName`, `lastName`, `emails[]`, `organizations[]` |
| Get contact | GET | `/api/members/{{contactId}}` | |
| Delete contact | DELETE | `/api/members?ids={{contactId}}` | |

**Full contact body:**
```json
{
  "memberType": "Contact",
  "firstName": "Test",
  "lastName": "User-20260306",
  "fullName": "Test User-20260306",
  "emails": ["test-user-20260306@example.com"],
  "phones": ["+1-555-AGENT-TEST-002"],
  "organizations": ["{{orgId}}"],
  "addresses": [
    {
      "addressType": "Shipping",
      "firstName": "Test",
      "lastName": "User",
      "line1": "456 QA Avenue",
      "city": "Los Angeles",
      "regionId": "CA",
      "regionName": "California",
      "postalCode": "90001",
      "countryCode": "US",
      "countryName": "United States"
    }
  ],
  "timeZone": "America/New_York",
  "defaultLanguage": "en-US",
  "currencyCode": "USD"
}
```

### User Accounts

| Action | Method | Endpoint | Key Fields |
|--------|--------|----------|------------|
| Create user | POST | `/api/platform/security/users/create` | `userName`, `email`, `password`, `storeId`, `memberId` (contactId) |
| Assign role | POST | `/api/platform/security/users/{{userId}}/roles` | Role object |
| Get user | GET | `/api/platform/security/users/{{userName}}` | |
| Delete user | DELETE | `/api/platform/security/users/{{userName}}` | |

**Full user body:**
```json
{
  "userName": "test-user-20260306@example.com",
  "email": "test-user-20260306@example.com",
  "password": "TestPassword123!",
  "storeId": "{{storeId}}",
  "memberId": "{{contactId}}",
  "isAdministrator": false,
  "userType": "Customer",
  "emailConfirmed": true
}
```

**User types:** `Administrator`, `Customer`, `Manager`

### Roles & Permissions

| Action | Method | Endpoint |
|--------|--------|----------|
| List roles | POST | `/api/platform/security/roles/search` |
| Get role | GET | `/api/platform/security/roles/{{roleId}}` |
| Create role | POST | `/api/platform/security/roles` |

**Common test roles:**

| Role | Use |
|------|-----|
| `Administrator` | Full access (pre-exists) |
| `Store manager` | Limited admin (pre-exists, verify permissions) |
| `Purchasing agent` | B2B buyer role |
| `Organization maintainer` | Manage org members |
| Custom `AGENT-TEST-Role-ReadOnly` | Create for RBAC testing — specific permission subset |

**Custom role body:**
```json
{
  "name": "AGENT-TEST-Role-ReadOnly-20260306",
  "description": "QA test role — catalog read only",
  "permissions": [
    { "name": "catalog:access" },
    { "name": "catalog:read" }
  ]
}
```

### Search Reindex

| Action | Method | Endpoint |
|--------|--------|----------|
| Rebuild index | POST | `/api/search/indexes/index` | Body: `[{ "documentType": "CatalogProduct", "rebuild": true }]` |
| Index status | GET | `/api/search/indexes/tasks` | Poll until completion |

Document types: `CatalogProduct`, `Category`, `MemberDocument`, `OrderDocument`

**Usage:** Send an array of `IndexingOptions` objects. Each has `documentType` (string) and `rebuild` (boolean). Multiple document types can be reindexed in a single call.

After triggering reindex, poll `/api/search/indexes/tasks` until completion before verifying storefront visibility.

---

## Batch API Patterns (Performance)

Use these batch patterns to reduce the number of API calls. A `full` seed with batch calls uses ~15-20 requests instead of ~35+.

### Batch Prices — Single Request for All Products

`PUT /api/products/prices` accepts an **array** of ProductPrice objects. Set prices for ALL products in one call instead of per-product:

```json
// PUT /api/products/prices — ALL prices in one request
[
  {
    "productId": "{{productId1}}",
    "prices": [
      { "pricelistId": "{{priceListId}}", "list": 99.99, "sale": 89.99, "minQuantity": 1, "currency": "USD" },
      { "pricelistId": "{{priceListId}}", "list": 84.99, "minQuantity": 5, "currency": "USD" },
      { "pricelistId": "{{priceListId}}", "list": 74.99, "minQuantity": 10, "currency": "USD" }
    ]
  },
  {
    "productId": "{{productId2}}",
    "prices": [
      { "pricelistId": "{{priceListId}}", "list": 49.99, "minQuantity": 1, "currency": "USD" }
    ]
  },
  {
    "productId": "{{variationId1}}",
    "prices": [
      { "pricelistId": "{{priceListId}}", "list": 109.99, "minQuantity": 1, "currency": "USD" }
    ]
  }
]
```

**Test script:**
```javascript
pm.test('All prices set', () => pm.response.to.have.status(200));
```

### Batch Inventory — Multiple FFCs per Product

`PUT /api/inventory/products/{{productId}}` accepts an **array** of inventory entries. Set stock across multiple fulfillment centers in one call per product:

```json
// PUT /api/inventory/products/{{productId1}}
[
  { "fulfillmentCenterId": "{{ffcId1}}", "productId": "{{productId1}}", "inStockQuantity": 100, "reservedQuantity": 0 },
  { "fulfillmentCenterId": "{{ffcId2}}", "productId": "{{productId1}}", "inStockQuantity": 50, "reservedQuantity": 0 }
]
```

For multiple products, you still need one call per product — but each call handles all FFCs for that product.

### Batch Reindex — All Document Types at Once

```json
// POST /api/search/indexes/index — single call for all types
[
  { "documentType": "CatalogProduct", "rebuild": true },
  { "documentType": "Category", "rebuild": true },
  { "documentType": "MemberDocument", "rebuild": true }
]
```

### Request Count Comparison

| Profile | Without batching | With batching | Savings |
|---------|-----------------|---------------|---------|
| `minimal` | ~12 requests | ~8 requests | 33% |
| `catalog` | ~25 requests | ~14 requests | 44% |
| `full` | ~38 requests | ~20 requests | 47% |

---

## Naming Convention

All test entities use a `AGENT-TEST-` prefix + date stamp for easy identification and cleanup. **`{YYYYMMDD}` in the examples below is a placeholder — substitute the current run date at seed time, not the literal `20260306` shown in bodies above.**

| Entity | Pattern | Example |
|--------|---------|---------|
| Catalog | `AGENT-TEST-Catalog-{YYYYMMDD}` | `AGENT-TEST-Catalog-20260306` |
| Category | `AGENT-TEST-Cat-{Name}-{YYYYMMDD}` | `AGENT-TEST-Cat-Electronics-20260306` |
| Product | `AGENT-TEST-{Name}-{YYYYMMDD}` | `AGENT-TEST-Wireless-Headphones-20260306` |
| SKU/Code | `AGENT-TEST-{CODE}-{YYYYMMDD}` | `AGENT-TEST-WH-20260306` |
| Price List | `AGENT-TEST-PL-{Currency}-{YYYYMMDD}` | `AGENT-TEST-PL-USD-20260306` |
| Organization | `AGENT-TEST-Org-{Name}-{YYYYMMDD}` | `AGENT-TEST-Org-AcmeCorp-20260306` |
| User | `test-{role}-{YYYYMMDD}@example.com` | `test-buyer-20260306@example.com` |
| Role | `AGENT-TEST-Role-{Name}-{YYYYMMDD}` | `AGENT-TEST-Role-ReadOnly-20260306` |

---

## Seed Request Manifest (Full Profile)

Exact requests per folder. Each request chains its output ID to subsequent requests via collection variables (see [`../qa-postman/collections-and-requests.md`](../qa-postman/collections-and-requests.md) §4 for chaining patterns).

### Seed — Creation Order

```
00-Auth           → Get OAuth2 Token → sets authToken
01-Infrastructure → Get Store Config → extracts storeId, original catalogId
                  → List Fulfillment Centers → extracts ffcId
02-Catalog        → Create Physical Catalog → catalogId
                  → Assign Catalog to Store (GET store → PUT with catalog — required for pricing)
                  → Create Virtual Catalog → virtualCatalogId
                  → Create Root Category → rootCategoryId
                  → Create Subcategory → subCategoryId
03-Products       → Create Physical Product (full fields) → productId1
                  → Create Digital Product → productId2
                  → Create Configurable Product → configurableId
                  → Create Variation (Black) → variationId1
                  → Create Variation (White) → variationId2
                  → Create Variation (Large) → variationId3
                  → Upload Product Image + Link (uses productId1)
04-Pricing        → Create Price List USD → priceListId
                  → Create Price List EUR → priceListIdEUR
                  → Assign PL to Store (uses priceListId + catalogId)
                  → Batch Set All Prices (single request — see §Batch API Patterns)
05-Inventory      → Batch Set Stock per product (see §Batch API Patterns)
                    - Standard: inStockQuantity 100
                    - Low stock: inStockQuantity 2
                    - Out of stock: inStockQuantity 0
                    - All variations
06-Orgs-Users     → Create Organization → orgId
                  → Create Contact (Org Admin) → contactId1
                  → Create Contact (Buyer) → contactId2
                  → Create User Account (Org Admin) → userId1
                  → Create User Account (Buyer) → userId2
                  → Create Custom Test Role → roleId
                  → Assign Role to Buyer
                  → Add Addresses to Contacts
07-Reindex        → Trigger All Document Types (single request — see §Batch API Patterns)
                  → Poll Status Until Complete (5s interval)
08-Verify         → GET Product (assert 200 + fields)
                  → GET Organization (assert 200)
                  → Verify User Login (obtain token with test creds)
```

### Teardown — Reverse Deletion Order

Delete in **reverse dependency order**. Run even if seed tests fail.

```
00-Auth           → Get OAuth2 Token
01-Users & Roles  → Delete User Buyer → Delete User Org Admin
                  → Delete Custom Role
                  → Delete Contact Buyer → Delete Contact Org Admin
02-Organizations  → Delete Organization
03-Inventory      → Clear Stock (set inStockQuantity: 0 for all test products)
04-Pricing        → Delete Prices → Delete Assignments
                  → Delete Price List USD → Delete Price List EUR
05-Products       → Delete Variations (all) → Delete Products (all)
06-Catalog        → Restore Store Catalog (PUT with original catalogId from seed)
                  → Delete Subcategory → Delete Root Category
                  → Delete Virtual Catalog → Delete Physical Catalog
07-Reindex        → Trigger Reindex (clear deleted entities from index)
08-Verify         → GET Product → assert 404
                  → GET Organization → assert 404
```

**Teardown rules:**
- Store all created entity IDs in collection variables during seed phase
- After each DELETE, GET the entity and assert 404
- If a DELETE returns 500, log orphaned ID in test results for manual cleanup
- Trigger search reindex after cleanup to clear storefront

---

## Full Profile — Seed All `test-data/` Fixtures

The `full` profile is **not** "the other profiles combined with synthetic `AGENT-TEST-*` entities." It means: **provision the platform from the actual fixtures committed under `test-data/`** so that every `@td()` reference across all 99 regression suites resolves against live data. The §Seed Request Manifest above (synthetic `AGENT-TEST-*` entities) is used by `minimal`/`catalog`/`b2b`/`pricing`; `full` instead walks the CSV-backed fixtures below.

**Guiding rules for `full`:**
- **Preserve pinned identity.** Where a CSV row or `aliases.json` already pins a `platform_id` / `code` / `slug` / GUID, create the entity with that identity (or update the existing one). Never mint a fresh random ID for a fixture that suites resolve by a pinned value — that breaks `@td()`.
- **Idempotent.** Look up each fixture first (by pinned ID, then by code/name); create only if missing, else update in place. A `full` re-run must not duplicate fixtures.
- **Write-back.** When a pinned entity is missing and gets re-provisioned with a new ID, write the new ID back into the source CSV **and** `aliases.json`, then re-run `npx tsx scripts/validate-td-refs.ts` (Step 6 of the skill).
- **Read GUIDs, never hardcode.** Catalog roots, store IDs, FFC IDs, virtual-catalog IDs come from `aliases.json` (`@td(VIRTUAL_CATALOG_B2B.id)`, `@td(STORE_PRIMARY.id)`, …) or the `01-Infrastructure` discovery folder — see `feedback_no_hardcoded_guids_in_scripts.md`.
- **Respect the dependency order** (§Entity Dependency Graph). Seed in the order of the table below; reindex last.

### Seed order — each `test-data/` source → platform entity → endpoint

| # | `test-data/` source | Platform entity | Endpoint(s) | Pinned by | Notes |
|---|---------------------|-----------------|-------------|-----------|-------|
| 1 | `stores/stores.csv` | Store config | GET/PUT `/api/stores` | `STORE_*` aliases | **Verify, rarely create.** Ensure each store's `catalog`, languages, currencies, and feature flags (`quotes_enabled`, `email_verification_*`, etc.) match the CSV before seeding catalog data. |
| 2 | `localization/languages.csv` | Store languages | PUT `/api/stores` (languages[]) | — | Apply `supported=true` languages to the store's `languages` list. |
| 3 | `catalogs/catalogs.csv` | Physical + virtual catalogs | POST/GET `/api/catalog/catalogs` | `STORE_PRIMARY.catalog`, `VIRTUAL_CATALOG_B2B.id` | Assign physical catalog to store (prereq for pricing). Link products into the **active B2B virtual catalog** so they're storefront-visible. |
| 4 | `catalogs/properties.csv` | Catalog/category properties | POST `/api/catalog/properties` (or via catalog/category PUT) | — | Create dictionary + scalar properties referenced by products. |
| 5 | `catalogs/categories.csv` | Category tree | POST/PUT `/api/catalog/categories` | — | Honor `parent_id`/`level` ordering (roots first). Preserve `code` + `seo_slug`. |
| 6 | `products/products-full.csv` | Products (+ variations via `main_product_id`) | POST/PUT `/api/catalog/products` | product aliases | Preserve `sku`/`product_id`. Parents before variations. Attach `properties`, descriptions, SEO. |
| 6b | `products/configurable-products.csv` | Configurable products + sections/options | POST `/api/catalog/products` + POST `/api/catalog/products/configurations` (body field is `sections`, `isActive:true`) | `CFG_*` aliases + `CFG_*_SECTIONS` inline aliases | Preserve parent GUIDs + section/option IDs that aliases pin. See `reference_configurations_post_body.md`. |
| 6c | `products/standard.csv` | Standard products | POST/PUT `/api/catalog/products` | `BUYABLE_NO_MIN_QTY`, `PROD_VARIATION_PARENT_SALE`, … | Preserve pinned SKUs/GUIDs. |
| 7 | `pricing/price-lists.csv` | Price lists + assignments | POST `/api/pricing/pricelists`, POST `/api/pricing/assignments` | — | Catalog MUST be assigned to store first (else assignment 500s). |
| 8 | `pricing/prices.csv` | Prices (tiered) | PUT `/api/products/prices` (batch — one array call) | tier aliases | Honor `min_quantity` tiers + `currency`. |
| 9 | `inventory/fulfillment-centers.csv` | Fulfillment centers | POST/GET `/api/inventory/fulfillmentcenters` | FFC IDs | Verify pre-existing FFCs before creating. |
| 10 | `inventory/stock-levels.csv` | Inventory per product/FFC | PUT `/api/inventory/products/{id}` (PATCH fallback) | `PROD_OOS`, `PROD_LOW_STOCK`, … | **`inventoryStatus: "Enabled"`** for buyable stock (Disabled silently no-ops `addItem`). Honor OOS=0 / low-stock fixtures exactly. |
| 11 | `b2b/organizations.csv` | B2B organizations | POST/GET `/api/members` (Organization) | `ORG_*` aliases (`platform_id`) | Seed only rows where `seeded=true` need (re)provisioning; preserve hierarchy (AcmeWest → AcmeCorp). |
| 12 | `b2b/contacts.csv` | Contacts | POST `/api/members` (Contact) | contact `platform_id` | Link to organizations. |
| 13 | `b2b/roles.csv` | Roles + permissions | POST `/api/platform/security/roles` | role names | Include `CanImpersonate` where the role requires it (see `reference_impersonation_permission_naming.md`). |
| 14 | `b2b/users.csv` | User accounts (+ role assignment) | POST `/api/platform/security/users/create` | `ACME_*`/`TECHFLOW_*`/… (`platform_id`) | Passwords from `.env`/`agent-user-pool.csv`, NOT literals. `userType=Customer`, `storeId` per CSV, `status=Approved`. |
| 15 | `b2b/addresses.csv` | Org + contact addresses | PUT member with `addresses[]` | `ADDR_*` (also `addresses/us-addresses.csv`) | Attach to the org/contact rows from steps 11–12. |
| 16 | `organizations/sample-organizations.csv` | Special-char orgs | POST `/api/members` (Organization) | — | Edge-case org names for search testing. |
| 17 | `users/test-users.csv` + `users/agent-user-pool.csv` | Personal + agent-pool users | POST `/api/platform/security/users/create` | per-slot creds | Agent-pool users (1 per browser slot) use per-slot passwords from `agent-user-pool.csv`. |
| 18 | `promotions/promotions.csv` + `conditions.csv` + `rewards.csv` | Promotions | POST `/api/marketing/promotions` | — | Honor reward type, conditions, exclusivity, `start/end_date`. |
| 19 | `promotions/coupons.csv` + `qa-bulk-coupons.csv` + `edge-cases.csv` | Coupons | POST coupons under their promotion | `COUPON_*` aliases (`code`, `gql_id`) | Preserve `code` + `gql_id` exactly — suites assert by these. Include expired/edge-case coupons. |
| 20 | `bopis/pickup-locations.csv` + `stores/bopis-locations.csv` | Pickup locations | inventory/FFC `pickup_available=true` + store BOPIS config | BOPIS catalog id | Link pickup locations to fulfillment centers. |
| 21 | `white-labeling/organizations.csv` + `link-lists.csv` + `users.csv` | WL orgs, menu/footer link lists, WL users | `/api/members`, link-list/menu API, security users | WL aliases | Per-org branding (logo, theme preset, link lists). |
| 22 | `cms/pagebuilder-pages.md` | CMS / PageBuilder pages | PageBuilder UI / Builder.io | — | **UI-only** — designer blocks must be added via the library click-through, never REST (see `feedback_designer_block_workflow.md`). Seed via `qa-frontend-expert` browser flow, not Postman. |
| 23 | Loyalty settings (`LOYALTY_SETTINGS`, `USER_GROUP_VIP`, `LOYALTY_VIP_USER` aliases) | Loyalty store setting + VIP user/group | PUT `/api/loyalty-setting`, POST members/users | loyalty aliases | `currency=PTS`, `mode=Mixed Cart`. Provision VIP customer-group user. |
| 24 | All of the above | Search index | POST `/api/search/indexes/index` (batch all doc types) | — | Reindex once at the end; poll `/api/search/indexes/tasks` to completion. |

### Reference-only `test-data/` sources — consumed in place, NOT seeded

These have no platform entity to create — agents read them at test time:

| Source | Why not seeded |
|--------|----------------|
| `payment/test-cards.csv`, `payment/*.png`, `payment-scenarios.csv`, `payment-processor-config.md` | Processor test cards — used during checkout, nothing to provision. |
| `search-queries/*.csv` | Search input terms — read by search tests. |
| `uploads/*` (images, PDFs, video, xlsx, …) | Upload fixtures — referenced by file-upload tests. |
| `graphql/queries/*.graphql`, `graphql/mutations/*.graphql`, `graphql/index.json` | xAPI query/mutation library — sent at runtime. |
| `security/xss-payloads.csv` | Injection payloads — supplied as inputs. |
| `*/_seed-results-*.json`, `*-snapshot*.json`, `aliases.json`, `*/README.md`, `*/setup-guide.md` | Metadata / write-back targets / docs — not entities. |

### Order- and quote-state fixtures (admin-driven, see `test-data/README.md`)

Many suite-014 (orders) and suite-015 (quotes) fixtures (`SHIPPED_ORDER`, `COMPLETED_ORDER`, `QUOTE_WITH_ADMIN_RESPONSE`, …) require placing an order/quote and then transitioning its admin status — they cannot be created by a single POST. A `full` seed should **place + transition** these via the order-creation matrix (`order-creation-matrix.md`) and admin status changes, or explicitly report them as `SEED REQUIRED` in the Step 6 report when the status vocabulary is `DEFERRED` (see README §Orders Suite Seed Requirements). Do not silently skip them.

---

## Reference Data (read-only, pre-existing)

These exist in the environment — read them, don't recreate:

| Data | Source | When to Use |
|------|--------|-------------|
| Static products (100) | `test-data/products/test-products.csv` | Read-only tests: search, browse, filter |
| Configurable products | `test-data/products/configurable-products.csv` | Variation testing |
| Test users/credentials | `.env` (ADMIN, USER_EMAIL, USER_VIRTO) | Auth, login flows |
| Payment cards | `test-data/payment/test-cards.csv` | Checkout, payment |
| US addresses | `test-data/addresses/us-addresses.csv` | Shipping |
| Search queries | `test-data/search-queries/*.csv` | Search testing |
| Orgs (special chars) | `test-data/organizations/sample-organizations.csv` | Edge case org names |
| White labeling | `test-data/white-labeling/` | WL-specific testing |

**Rule:** Use reference data for read-only tests. Use API-generated seed data for CRUD, mutation, and destructive tests.

---

---

## Performance Rules

### Build Once, Run Many
The single biggest optimization: **don't rebuild Postman collections every time.** Use `getCollections` to find existing `VC Seed — {Profile}` collections, then execute them via Newman (`newman run <collection.json> -e <env.json>`) or the Postman CLI (`postman collection run <uid> --environment <uid>`). The Postman MCP itself does not run collections — see [`../qa-postman/execution.md`](../qa-postman/execution.md). Only build when the collection doesn't exist or needs structural changes.

### One `createCollection` Call, Not N `createCollectionRequest` Calls
When building a new collection, include ALL folders and requests inline in a single `createCollection` call — see [`../qa-postman/collections-and-requests.md`](../qa-postman/collections-and-requests.md). This is 1 MCP round-trip instead of 20-30+. Never use `createCollectionRequest` for seed collections.

### Use Batch APIs
See §Batch API Patterns above. Key wins:
- **Prices:** 1 call for all products (not N calls)
- **Reindex:** 1 call for all document types (not 3 separate calls)

### Minimize Verification Requests
For `minimal` profile, skip GraphQL storefront verification — REST API check is sufficient. Full verification is only needed for `catalog` and `full` profiles where storefront visibility matters.

### Reindex Polling
Poll `/api/search/indexes/tasks` every 5 seconds (not faster). Typical reindex times:
- After `minimal` seed: ~10-15s
- After `catalog` seed: ~20-30s
- After `full` seed: ~30-45s

---

## Seeded B2B Test Data (Ready to Use)

The `b2b` seed profile was originally executed on **2026-03-10**, **partially wiped by the vcst-qa catalog restore on 2026-05-15** ([project_vcstqa_restore_2026_05_15.md]), and **reseeded 2026-05-19** (see `test-data/b2b/_seed-results-suite-009-restore.json`). Org/contact/user `platform_id` values in `test-data/b2b/*.csv` reflect the post-restore state. Agents should use this data instead of creating new B2B entities; if a lookup 404s, treat the row as stale and re-run `/qa-seed-data b2b` against the affected entity.

### Source of Truth

| File | Purpose |
|------|---------|
| `test-data/b2b/_seed-results-orgs.json` | Live platform IDs (primary source) |
| `test-data/b2b/organizations.csv` | Orgs with `platform_id` and `seeded` flag |
| `test-data/b2b/contacts.csv` | Contacts with `platform_id` and `seeded` flag |
| `test-data/b2b/users.csv` | Users with `platform_id` and `seeded` flag |
| `test-data/b2b/load-test-data.js` | JS loader module with lookup helpers |

### Seeded Entities Summary

- **4 organizations** (AcmeCorp, TechFlow, BuildRight, AcmeWest) — AcmeWest is child of AcmeCorp
- **10 contacts** — all `status: Approved`, with live `platform_id`
- **10 users** — all `status: Approved`, password `TestPass123!`
- **4 template orgs** + **3 template contacts/users** — `seeded=false`, need `/qa-seed-data` to create

### How Agents Should Use Seeded Data

**Option 1 — JS Loader (recommended for scripts):**
```js
import { b2b } from './test-data/b2b/load-test-data.js';

const admin = b2b.credentials('Org Admin');
// → { userName, email, password, contactName, orgKey, platformRoles }

const rbac = b2b.rbacTestSet();
// → { admin, buyer, viewer, password }

const multiOrg = b2b.multiOrgTestSet();
// → { acmeCorp, techFlow, buildRight, acmeWest, password }
```

**Option 2 — Read CSVs directly (for LLM agents):**
Read `test-data/b2b/users.csv` and filter by `seeded=true`. Key columns:
- `platform_id` — live entity ID
- `user_name` / `email` — login credentials
- `password` — `TestPass123!` for all seeded users
- `roles` — platform role name (`Organization maintainer`, `Purchasing agent`, `Organization employee`)

### Available Test Scenarios

| Scenario | Users | Orgs | Loader Helper |
|----------|-------|------|---------------|
| RBAC (admin/buyer/viewer) | John, Sarah, Mike | AcmeCorp | `b2b.rbacTestSet()` |
| Multi-buyer approval | Sarah + Lisa | AcmeCorp | `b2b.multiBuyerTestSet()` |
| Multi-org switching | John vs Emily | AcmeCorp vs TechFlow | `b2b.multiOrgTestSet()` |
| Parent-child hierarchy | John → Robert | AcmeCorp → AcmeWest | `b2b.orgHierarchy()` |
| Multi-language/currency | Hans (de-DE, EUR) | AcmeCorp | `b2b.userByName('Hans')` |
| Cross-org order isolation | Sarah vs David | AcmeCorp vs TechFlow | `b2b.usersForOrg()` |

### B2B Auth Note

B2B store uses `trustedGroups: ["store-acme"]`. Customer users **cannot** use direct `/connect/token` password-grant login. Agents must either:
1. Use storefront SSO login flow (Playwright browser automation)
2. Use admin API token with `memberId` context for API-level testing

### Postman Collection

**"VC B2B Test Data — Orgs, Contacts, Users"** in VirtoPlatform workspace — 22 requests covering full CRUD + teardown. All create templates include `status: Approved`.
