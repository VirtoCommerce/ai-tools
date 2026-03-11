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

### Authentication

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Get token | POST | `/connect/token` | `grant_type=password&username={{admin}}&password={{adminPassword}}&scope=openid offline_access` (form-urlencoded) |

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
| Create virtual catalog | POST | `/api/catalog/catalogs` | `name`, `isVirtual: true`, `links[]` (physical catalog IDs) |
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
| Set inventory | PUT | `/api/inventory/products/{{productId}}` | `fulfillmentCenterId`, `inStockQuantity`, `reservedQuantity` (no `/inventories` suffix) |
| Get inventory | GET | `/api/inventory/products/{{productId}}` | |
| List FFCs | POST | `/api/inventory/fulfillmentcenters/search` | `{ "take": 50 }` |

**Inventory body:**
```json
[
  {
    "fulfillmentCenterId": "{{ffcId}}",
    "productId": "{{productId}}",
    "inStockQuantity": 100,
    "reservedQuantity": 0
  }
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

## Naming Convention

All test entities use a `AGENT-TEST-` prefix + date stamp for easy identification and cleanup:

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

## Postman Collection Structure

### Seed Collection

```
📁 VC Test Data Seed
├── 📁 00-Auth
│   └── Get OAuth2 Token (test: pm.collectionVariables.set("authToken", ...))
├── 📁 01-Infrastructure (verify existing)
│   ├── Get Store Config (verify store exists, extract storeId, catalogId)
│   └── List Fulfillment Centers (extract ffcId)
├── 📁 02-Catalog
│   ├── Create Physical Catalog (test: set {{catalogId}})
│   ├── Assign Catalog to Store (GET store → PUT with catalog={{catalogId}} — required for pricing)
│   ├── Create Virtual Catalog (test: set {{virtualCatalogId}})
│   ├── Create Root Category (test: set {{rootCategoryId}})
│   └── Create Subcategory (test: set {{subCategoryId}})
├── 📁 03-Products
│   ├── Create Physical Product - Full Fields (test: set {{productId1}})
│   ├── Create Digital Product (test: set {{productId2}})
│   ├── Create Configurable Product Parent (test: set {{configurableId}})
│   ├── Create Variation - Color Black (test: set {{variationId1}})
│   ├── Create Variation - Color White (test: set {{variationId2}})
│   ├── Create Variation - Size Large (test: set {{variationId3}})
│   └── Upload Product Image + Link (uses {{productId1}})
├── 📁 04-Pricing
│   ├── Create Price List USD (test: set {{priceListId}})
│   ├── Create Price List EUR (test: set {{priceListIdEUR}})
│   ├── Assign PL to Store (uses {{priceListId}}, {{catalogId}})
│   ├── Set Prices - Standard Product (tiered: qty 1/5/10)
│   ├── Set Prices - Digital Product
│   └── Set Prices - All Variations
├── 📁 05-Inventory
│   ├── Set Stock - Standard Product (inStockQuantity: 100)
│   ├── Set Stock - Low Stock Product (inStockQuantity: 2)
│   ├── Set Stock - Out of Stock Product (inStockQuantity: 0)
│   └── Set Stock - All Variations
├── 📁 06-Organizations & Users
│   ├── Create Organization (test: set {{orgId}})
│   ├── Create Contact - Org Admin (test: set {{contactId1}})
│   ├── Create Contact - Buyer (test: set {{contactId2}})
│   ├── Create User Account - Org Admin (test: set {{userId1}})
│   ├── Create User Account - Buyer (test: set {{userId2}})
│   ├── Create Custom Test Role (test: set {{roleId}})
│   ├── Assign Role to Buyer
│   └── Add Addresses to Contacts
├── 📁 07-Search Reindex
│   ├── Trigger Product Index Rebuild
│   ├── Trigger Member Index Rebuild
│   └── Poll Index Status Until Complete
└── 📁 08-Verify
    ├── Verify Product via REST (GET, assert 200 + all fields)
    ├── Verify Product via xCatalog GraphQL (storefront visibility)
    ├── Verify Prices Applied (xCatalog product price)
    ├── Verify Inventory (availabilityData)
    ├── Verify Organization via REST
    └── Verify User Login (obtain token with test user credentials)
```

### Teardown Collection

Delete in **reverse dependency order**. Run even if tests fail.

```
📁 VC Test Data Teardown
├── 📁 00-Auth
│   └── Get OAuth2 Token
├── 📁 01-Users & Roles
│   ├── Delete User Account - Buyer
│   ├── Delete User Account - Org Admin
│   ├── Delete Custom Role
│   ├── Delete Contact - Buyer
│   └── Delete Contact - Org Admin
├── 📁 02-Organizations
│   └── Delete Organization
├── 📁 03-Inventory
│   └── Clear Inventory (set inStockQuantity: 0 for all test products)
├── 📁 04-Pricing
│   ├── Delete Prices
│   ├── Delete Price List Assignments
│   ├── Delete Price List USD
│   └── Delete Price List EUR
├── 📁 05-Products
│   ├── Delete Variations (all {{variationId*}})
│   ├── Delete Products (all {{productId*}})
├── 📁 06-Catalog
│   ├── Restore Store Catalog (PUT store with original catalogId saved during seed)
│   ├── Delete Subcategory
│   ├── Delete Root Category
│   ├── Delete Virtual Catalog
│   └── Delete Physical Catalog
├── 📁 07-Search Reindex
│   └── Trigger Reindex (clear deleted entities from index)
└── 📁 08-Verify Cleanup
    ├── GET Product → assert 404
    ├── GET Organization → assert 404
    └── Search xCatalog → assert product not found
```

**Teardown rules:**
- Store all created entity IDs in collection variables during seed phase
- After each DELETE, GET the entity and assert 404
- If a DELETE returns 500, log orphaned ID in test results for manual cleanup
- Never skip teardown — use `postman.setNextRequest("teardown-folder")` on failure if needed
- Trigger search reindex after cleanup to clear storefront

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

## Seed Profiles

Different test scenarios need different data subsets:

| Profile | What Gets Created | Use Case |
|---------|-------------------|----------|
| `minimal` | 1 catalog + 1 category + 1 product + price + inventory | Quick smoke, single-entity CRUD |
| `catalog` | Catalog + 3 categories (tree) + 5 products (3 types) + prices + inventory | Catalog/search testing |
| `b2b` | Organization + 3 users (admin/buyer/viewer) + roles + contacts + addresses | B2B, RBAC, org management |
| `pricing` | Price list (USD + EUR) + tiered prices + quantity breaks | Pricing module testing |
| `full` | All of the above combined | Full regression, integration testing |
| `teardown` | Nothing created — only deletes entities matching `AGENT-TEST-*` pattern | Post-test cleanup |

---

## Seeded B2B Test Data (Ready to Use)

The `b2b` seed profile was executed on **2026-03-10** and entities are **live on the platform**. Agents should use this data instead of creating new B2B entities.

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
