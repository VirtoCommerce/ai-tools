---
description: "[Testing] Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs — full or by profile"
argument-hint: "[minimal|catalog|b2b|pricing|full|teardown]"
---

# /qa-seed-data — Test Data Generation & Teardown

Generate a complete test environment by seeding all required entities via REST API, or tear down previously created test data.

**Postman mechanics:** This skill uses Postman MCP for collection building. **The MCP cannot execute collections** — execution happens out-of-band via Newman or the Postman CLI (see `/qa-postman/execution.md`). For auth patterns, variable scoping, collection structure, common mistakes, and tool signatures — read `/qa-postman` first. This skill only covers **what** to seed and **in what order**, not how Postman MCP works.

## Reference

Read **before** executing:
1. `.claude/skills/testing/qa-postman/SKILL.md` — Postman MCP entry point (index of all sub-guides: `mcp-tools.md`, `variables-and-environments.md`, `collections-and-requests.md`, `graphql-authoring.md`, `test-data-fixtures.md`, `execution.md`, `common-mistakes.md`, `examples.md`)
2. `.claude/skills/testing/qa-seed-data/test-data-generation.md` — Entity graph, API endpoints, request bodies, batch patterns, naming

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
Read `test-data-generation.md` for entity dependency graph, API endpoints, request bodies, and batch patterns.

### Step 2 — Fast Path: Reuse Existing Collection
Use `getCollections` to check if a seed collection already exists for the requested profile.

**Collection naming:** `VC Seed — {Profile}` (e.g., `VC Seed — Minimal`, `VC Seed — Full`)

| Exists? | Action |
|---------|--------|
| **Yes** | Skip to Step 5 — execute via Newman/Postman CLI immediately. No rebuild needed. |
| **Yes, but outdated** | Use `putCollection` to update in-place (1 call; needs the **owner-qualified** `<OWNER>-<UUID>`). |
| **No** | Continue to Step 3. |

**This is the #1 speed optimization.** Building should only happen once per profile.

### Step 3 — Environment
Reuse existing `VC QA Environment` or create one per [`../qa-postman/variables-and-environments.md`](../qa-postman/variables-and-environments.md). Entity IDs go in **collection variables** (not environment).

### Step 4 — Build Collection (Single Call)
**Use one `createCollection` call with ALL requests inline** (per [`../qa-postman/collections-and-requests.md`](../qa-postman/collections-and-requests.md) §1). Never use `createCollectionRequest` for seed collections — that's N MCP round-trips instead of 1.

**Seed collection folder structure** (entity order from `test-data-generation.md` §Entity Dependency Graph):

```
00-Auth           → OAuth2 token (per ../qa-postman/collections-and-requests.md §3)
01-Infrastructure → GET store, GET FFCs (verify + extract IDs)
02-Catalog        → Physical catalog, virtual catalog, categories
03-Products       → Products by type, variations, images
04-Pricing        → Price list + batch prices (single request — see §Batch API Patterns)
05-Inventory      → Batch inventory per product (see §Batch API Patterns)
06-Orgs-Users     → Organization, contacts, users, roles (if profile includes B2B)
07-Reindex        → Trigger all document types in 1 call + poll status
08-Verify         → GET assertions to confirm entities exist
```

**Teardown collection:** same single-call approach, reverse dependency order (see `test-data-generation.md` §Teardown Collection).

### Step 5 — Execute (out-of-band)
The Postman MCP cannot execute collections. Pick a runner — see [`qa-postman/execution.md`](../qa-postman/execution.md) for full details. Quickest path:

```bash
# Export collection + environment from Postman UI (or fetch via getCollection model=full + getEnvironment, then save)
npx newman run <seed-collection.json> -e <env.json> --reporters cli,json --reporter-json-export results.json
```

Or for an immediate run that surfaces in the Postman UI:

```bash
postman collection run <collection-uid> --environment <environment-uid>
```

After the run, capture the seeded entity IDs from the Newman/Postman result JSON and write them back into [`test-data/`](../../../../test-data/) so downstream suites can resolve them via `@td()` — see Step 6 and [`qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md).

### Step 6 — Report

```
## Test Data Seed Report

**Profile:** {profile}
**Environment:** {BACK_URL}
**Timestamp:** {ISO timestamp}
**Build:** {new | reused existing}
**Duration:** ~{X}s

### Created Entities
| Entity | ID | Name |
|--------|-----|------|
| Catalog | {id} | AGENT-TEST-Catalog-{date} |
| ... | ... | ... |

### Postman Collections
- Seed: {collection name} (ID: {id})
- Teardown: {collection name} (ID: {id})

### Verification
- [ ] Products visible via REST API
- [ ] Prices applied correctly
- [ ] Inventory levels set
- [ ] Search index updated
```

## Expected Timing

| Profile | Build (first run) | Build (reuse) | Execute | Reindex | Total |
|---------|-------------------|---------------|---------|---------|-------|
| `minimal` | ~10s | 0s | ~5s | ~15s | **~20-30s** |
| `catalog` | ~15s | 0s | ~15s | ~30s | **~30-60s** |
| `b2b` | ~10s | 0s | ~10s | ~15s | **~25-35s** |
| `full` | ~20s | 0s | ~30s | ~45s | **~50-95s** |

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
Scans for entities matching `AGENT-TEST-*` naming convention and deletes them in safe order. Also:
- Triggers search reindex after deletion
- Verifies cleanup (GET → assert 404)
- Reports any orphaned entities that failed to delete

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary executor — authors Postman seed collections (via MCP), then executes them via Newman or the Postman CLI; writes seeded IDs back into `test-data/` |
| `qa-frontend-expert` | Verifies seeded data appears on storefront |
| `test-management-specialist` | References profiles when planning test coverage |

## Notes

- Never seed data into production — check `BACK_URL` against known production URLs before executing
- Always use `AGENT-TEST-` prefix — enables safe teardown without affecting real data
- After `full` seed, wait for search reindex before running storefront tests (~30-60s)
- If seed fails mid-execution, run teardown for the partial data before retrying
- For Postman troubleshooting (auth errors, variable resolution, ID format) — see [`qa-postman/common-mistakes.md`](../qa-postman/common-mistakes.md)
- After every successful seed, write the new entity IDs back into [`test-data/`](../../../../test-data/) (CSV files referenced by `aliases.json`) so downstream regression suites resolve them via `@td()` — see [`qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md) for the resolver contract
