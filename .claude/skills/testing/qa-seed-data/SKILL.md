---
description: "[Testing] Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs — full or by profile"
argument-hint: "[minimal|catalog|b2b|pricing|full|teardown]"
---

# /qa-seed-data — Test Data Generation & Teardown

Generate a complete test environment by creating Postman collections that seed all required entities via REST API, or tear down previously created test data.

## Reference

Read **before** executing: `./claude/skills/testing/qa-seed-data/test-data-generation.md`
- Entity dependency graph (creation order)
- REST API endpoints with full request bodies
- Naming conventions (`AGENT-TEST-` prefix + date)
- Postman collection folder structure
- Seed profiles (minimal/catalog/b2b/pricing/full)
- Teardown rules and reverse deletion order

## Arguments

| Argument | Description |
|----------|-------------|
| `minimal` | 1 catalog + 1 category + 1 product + price + inventory |
| `catalog` | Full catalog tree: 3 categories, 5 products (physical/digital/configurable), variations, prices, inventory |
| `b2b` | Organization + 3 users (admin/buyer/viewer) + roles + contacts + addresses |
| `pricing` | Price lists (USD + EUR), tiered prices, quantity breaks, multi-currency |
| `full` | All profiles combined — complete test environment |
| `teardown` | Delete all entities matching `AGENT-TEST-*` naming convention |

## Workflow

### Step 1 — Read Reference
Read `./claude/skills/testing/qa-seed-data/test-data-generation.md` for API endpoints and entity schemas.

### Step 2 — Check Existing Collections
Use `getCollections` (Postman MCP) to check if a seed/teardown collection already exists for the requested profile. If it exists, ask the user: reuse, update, or recreate.

### Step 3 — Create Environment
Use `createEnvironment` (Postman MCP) to set up variables:

| Variable | Source |
|----------|--------|
| `baseUrl` | `BACK_URL` from `.env` |
| `storeId` | `STORE_ID` from `.env` |
| `admin` | `ADMIN` from `.env` |
| `adminPassword` | `ADMIN_PASSWORD` from `.env` |
| `authToken` | (set by first request's test script) |
| `catalogId`, `categoryId`, `productId`, etc. | (set by seed requests' test scripts) |

### Step 4 — Build Seed Collection
Use `createCollection` + `createCollectionRequest` (Postman MCP) to build the collection incrementally:

1. **Auth folder** — OAuth2 token request with test script to extract and store token
2. **Infrastructure folder** — GET store, GET fulfillment centers (verify + extract IDs)
3. **Entity folders** — one folder per entity group, ordered by dependency graph
4. **Verify folder** — GET requests to confirm all entities exist and are accessible

Each request must include:
- **Pre-request script:** set Authorization header from `{{authToken}}`
- **Test script:** assert status code (200/201), extract and store entity IDs in collection variables
- **GraphQL requests:** use `graphql` dataMode with proper query + variables

### Step 5 — Build Teardown Collection
Separate collection that deletes in reverse dependency order:
1. Users & roles
2. Contacts & organizations
3. Inventory (set to 0)
4. Prices, assignments, price lists
5. Variations, products
6. Categories, catalogs
7. Search reindex
8. Verify deletion (assert 404)

### Step 6 — Execute
Run the seed collection using `runCollection` with the created environment. Report results.

### Step 7 — Report
Output a summary:

```
## Test Data Seed Report

**Profile:** {profile}
**Environment:** {BACK_URL}
**Timestamp:** {ISO timestamp}

### Created Entities
| Entity | ID | Name |
|--------|-----|------|
| Catalog | {id} | AGENT-TEST-Catalog-{date} |
| Category | {id} | AGENT-TEST-Cat-{name}-{date} |
| Product | {id} | AGENT-TEST-{name}-{date} |
| ... | ... | ... |

### Postman Collections
- Seed: {collection name} (ID: {id})
- Teardown: {collection name} (ID: {id})

### Verification
- [ ] Products visible via REST API
- [ ] Products visible via xCatalog GraphQL
- [ ] Prices applied correctly
- [ ] Inventory levels set
- [ ] Users can authenticate
- [ ] Search index updated
```

## Profile Details

### `minimal`
Fastest seed — single product with price and stock. Good for:
- Smoke testing a single CRUD workflow
- Verifying API connectivity
- Quick checkout flow (needs product + price + inventory)

**Creates:** 1 catalog, 1 category, 1 product (physical, full fields), 1 price list + prices, inventory at 1 FFC

### `catalog`
Rich catalog for search/filter/browse testing:
- 1 physical catalog, 1 virtual catalog linked to store
- 3-level category tree (root → 2 subcategories)
- 5 products: 2 physical, 1 digital, 1 configurable (with 3 variations), 1 out-of-stock
- All products have full properties, SEO, descriptions
- Multi-currency prices (USD + EUR), tiered quantity breaks
- Inventory across 2 FFCs (varied stock levels)

### `b2b`
B2B organization with user hierarchy:
- 1 organization with addresses, phones, emails
- 3 contacts: org admin, buyer, viewer
- 3 user accounts linked to contacts
- 1 custom role (read-only for RBAC testing)
- Role assignments per user
- Addresses on each contact (shipping + billing)

### `pricing`
Pricing module deep test:
- 2 price lists (USD, EUR)
- Assignments to catalog + store with priority
- Tiered prices: qty 1 (list + sale), qty 5, qty 10, qty 50
- Products reused from `catalog` profile (or created if run standalone)

### `full`
Everything combined. Use before full regression runs.

### `teardown`
Scans for entities matching `TEST-*` naming convention and deletes them in safe order. Also:
- Triggers search reindex after deletion
- Verifies cleanup (GET → assert 404)
- Reports any orphaned entities that failed to delete

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary executor — builds and runs Postman collections |
| `qa-frontend-expert` | Verifies seeded data appears on storefront |
| `test-management-specialist` | References profiles when planning test coverage |

## Notes

- Never seed data into production — check `BACK_URL` against known production URLs before executing
- Always use `AGENT-TEST-` prefix — enables safe teardown without affecting real data
- Store entity IDs in Postman collection variables, not environment variables (collection-scoped = isolated)
- After `full` seed, wait for search reindex before running storefront tests (~30-60s)
- If seed fails mid-execution, run teardown for the partial data before retrying
