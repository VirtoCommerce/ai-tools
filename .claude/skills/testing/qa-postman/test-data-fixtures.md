# Postman MCP — Test Data Library and `@td()` Resolver

How to source values for Postman collections and environments from the project's test data library instead of hardcoding them. **The golden rule: no hardcoded IDs/SKUs/emails/prices/order-numbers/paths in collections** — resolve at runtime or assert structural invariants.

---

## 1. Why Use the Test Data Library

Hardcoded values rot. Catalogs get re-seeded, orgs get re-created, prices change. A collection with `"productId": "P-12345"` will silently start failing or drift away from real coverage.

The project ships a centralized fixture system at [`test-data/`](../../../../test-data/) with a registry of named aliases. Collections should source values from this registry — directly when seeding via the Postman MCP, indirectly via env vars or pre-request scripts otherwise.

**Memory entries to consult:**
- `feedback_no_test_data.md` — Use `test-data/` for test data; avoid hardcoding in CSV `Test_Data` columns
- `feedback_flexible_test_cases.md` — No hardcoded IDs/SKUs/emails/prices/order-numbers/paths; resolve at runtime
- `feedback_env_resilience.md` — Never assert exact prices, section titles, or URL path segments tied to catalog data
- `reference_test_data_resolver.md` — `@td(ALIAS.field)` resolver is real: `scripts/lib/test-data-resolver.ts` + registry `test-data/aliases.json`
- `reference_address_data_conventions.md` — Address data conventions (ISO-3 country codes, region rules)

---

## 2. The `@td()` Resolver

The runtime resolver at [`scripts/lib/test-data-resolver.ts`](../../../../scripts/lib/test-data-resolver.ts) reads CSV-backed fixtures and a JSON alias registry. It is consumed by `scripts/graphql-runner.ts` and the regression suite parsers. **Postman collections themselves don't run the resolver** — but you should resolve `@td()` references **at authoring time** when building the collection (read the file, look up the alias, paste the actual value or pass it through an env variable).

### Syntax

```
# Alias form (recommended — uses aliases.json registry)
@td(CYBERSOURCE_VISA.number)     → 4622943127013705
@td(COUPON_10PCT.code)           → QA10OFF
@td(STORE_PRIMARY.id)            → B2B-store
@td(ADDR_LA.city)                → Los Angeles
@td(ACME_ADMIN.email)            → test-john.mitchell-20260310@test-agent.com

# Direct form (one-off lookup, no alias)
@td(payment/test-cards, processor=CyberSource&card_type=Visa, card_number)
```

### How It Resolves

1. Look up the alias in [`test-data/aliases.json`](../../../../test-data/aliases.json):
   ```json
   "CFG_LAPTOP": {
     "file": "products/configurable-products",
     "filter": { "product_id": "CFG-013" },
     "fields": {
       "id": "product_id_guid",
       "name": "product_name",
       "price": "base_price"
     }
   }
   ```
2. Open `test-data/products/configurable-products.csv`, find the row where `product_id === "CFG-013"`.
3. Resolve the requested field: `@td(CFG_LAPTOP.id)` returns the value of that row's `product_id_guid` column.

### Validation

```bash
npx tsx scripts/validate-td-refs.ts
```
Verifies every `@td()` reference across all suites resolves cleanly.

---

## 3. Test Data Directory Layout

Top-level structure (see [`test-data/README.md`](../../../../test-data/README.md) for full detail):

| Directory | Purpose | Notable files |
|-----------|---------|---------------|
| [`test-data/users/`](../../../../test-data/users/) | Personal user accounts | `agent-user-pool.csv` (3 dedicated agents — `TestAgent1!`/`2!`/`3!`), `test-users.csv` |
| [`test-data/b2b/`](../../../../test-data/b2b/) | B2B orgs/contacts/users (seeded) | `organizations.csv`, `contacts.csv`, `_seed-results-orgs.json` (live IDs) |
| [`test-data/organizations/`](../../../../test-data/organizations/) | Special-character org cases | `sample-organizations.csv` |
| [`test-data/catalogs/`](../../../../test-data/catalogs/) | Catalog seed data | `catalogs.csv`, `categories.csv`, `properties.csv` |
| [`test-data/products/`](../../../../test-data/products/) | Product fixtures | `test-products.csv`, `configurable-products.csv` |
| [`test-data/pricing/`](../../../../test-data/pricing/) | Price lists & prices | `price-lists.csv`, `prices.csv` |
| [`test-data/inventory/`](../../../../test-data/inventory/) | Stock fixtures | |
| [`test-data/payment/`](../../../../test-data/payment/) | Test cards per processor | `test-cards.csv` |
| [`test-data/promotions/`](../../../../test-data/promotions/) | Coupons & promo codes | |
| [`test-data/addresses/`](../../../../test-data/addresses/) | Address fixtures | TechFlow snapshot at `techflow-org-addresses-state-20260423.json` |
| [`test-data/bopis/`](../../../../test-data/bopis/) | BOPIS test data | Includes `testProductCatalogId` for B2B virtual catalog root |
| [`test-data/graphql/`](../../../../test-data/graphql/) | GraphQL queries/mutations + index | `index.json` |
| [`test-data/search-queries/`](../../../../test-data/search-queries/) | Search test queries | |
| [`test-data/security/`](../../../../test-data/security/) | RBAC/security cases | |
| [`test-data/stores/`](../../../../test-data/stores/) | Store fixtures | |
| [`test-data/localization/`](../../../../test-data/localization/) | i18n test strings | |
| [`test-data/uploads/`](../../../../test-data/uploads/) | Upload sample files | |

---

## 4. Wiring Test Data into a Postman Collection

### Pattern A — Inline at authoring time

When building the collection JSON, resolve `@td()` references **once** and paste the literal values into request bodies:

```json
// Before (do NOT do this)
"rawModeData": "{ \"productId\": \"P-12345\", \"price\": 999.99 }"

// After — resolve @td(CFG_LAPTOP.id) to actual GUID and @td(CFG_LAPTOP.price) to actual price
"rawModeData": "{ \"productId\": \"3a2c9d8e-...\", \"price\": 1099 }"
```

This is fine for short-lived demo collections. For repeatable test cases, prefer Pattern B.

### Pattern B — Pre-request script seeds collection variables

Embed fixture lookup in a pre-request script at the folder or collection level. Then every request just uses `{{productId}}`, `{{cardNumber}}`, etc.

```javascript
// Collection-level pre-request script (runs once per request)
// Loads fixtures from a static block — read the values once, then paste into the script.
if (!pm.collectionVariables.get('cfgLaptopId')) {
    pm.collectionVariables.set('cfgLaptopId', '3a2c9d8e-...');  // @td(CFG_LAPTOP.id)
    pm.collectionVariables.set('cfgLaptopPrice', '1099');        // @td(CFG_LAPTOP.price)
}
```

### Pattern C — Seed via the API, then chain

Most resilient — use the seeding helpers (e.g., `/qa-seed-data` skill) to create entities at runtime and capture their IDs into collection variables via test scripts. See [collections-and-requests.md](collections-and-requests.md) §4 for chaining patterns.

---

## 5. Catalog & Product IDs

Two facts about VC catalog data that bite collection authors:

1. **Storefront search/PDP requires the B2B virtual catalog root.** Direct GraphQL `products` queries must filter by `category.subtree:<B2B_VIRTUAL_CATALOG_ID>`. The active root ID **moves over time** — re-verify before hardcoding.
   - As of 2026-04-30 the active ID is `9238c387-d779-40cb-b27d-5496a670a924`.
   - Cross-check via `test-data/aliases.json` BOPIS entry's `testProductCatalogId` field, or live `categories(storeId:"B2B-store", first:1)` query.
2. **Products seeded into the physical catalog return 404 on storefront** until linked into the B2B virtual catalog. Symptom looks like an indexer issue but it isn't — the product just hasn't been linked yet.

Memory: `feedback_storefront_virtual_catalog_link.md`, `feedback_graphql_products_filter.md`.

---

## 6. Address Data Conventions

When writing address request bodies (checkout, account, B2B):

- `countryCode` is **ISO-3** (`USA`, `CAN`, `GBR`) — not ISO-2.
- UK addresses have `regionId: null` (no states/provinces).
- `isFavorite` is a **storefront xAPI** field — does not exist on the platform REST API address payload.
- State/Province facet only appears for USA/Canada — empty `term: []` for UK by design.

Use [`test-data/addresses/`](../../../../test-data/addresses/) fixtures rather than authoring address bodies from scratch.

---

## 7. Test Account Credentials

**Never hardcode passwords in agent prompts or collection JSON.** Read from `.env` at execution time:

| Account class | Source | Password |
|---------------|--------|----------|
| Admin | `.env` `ADMIN` / `ADMIN_PASSWORD` | `Password1!` |
| Main storefront user | `.env` `USER_EMAIL` / `USER_PASSWORD` | `Password1!` |
| Per-agent slot 1/2/3 | [`test-data/users/agent-user-pool.csv`](../../../../test-data/users/agent-user-pool.csv) | `TestAgent1!` / `TestAgent2!` / `TestAgent3!` |

Memory: `user_test_accounts.md`, `feedback_agents_read_env_creds.md`.
