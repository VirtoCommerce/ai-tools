---
description: "[Testing] Seed/teardown ALL test data — catalogs, products, pricing, inventory, B2B orgs/users, configurable products — via repo seed scripts (npm run seed) or Postman MCP"
argument-hint: "[minimal|catalog|b2b|pricing|full|teardown]"
disable-model-invocation: true
---

# /qa-seed-data — Test Data Generation & Teardown

Single entry point for seeding **every** kind of test data this repo needs — and for tearing it down. Covers two execution paths (script-based and Postman MCP), the full `test-data/` fixture surface, and the specialized one-purpose seeders.

## Seeding Tooling — Two Execution Paths

Pick the path by what you're seeding. Both end with the same obligation: write seeded IDs back into `test-data/` so `@td()` resolves (Step 6 below).

### Path A — Repo seed scripts (direct REST/xAPI) — the practical default

Node seeders in [`scripts/`](../../../../scripts/) read CSVs from [`test-data/`](../../../../test-data/), call the platform API directly, are **idempotent** (look-up-then-create), respect `TEST_ENV` (via `config.js`), enforce a **host allowlist** (vcst-qa / vcptcore-qa — can't hit prod), and write results to `test-data/_seed-results-*.json`. No Postman/Newman needed.

| Script | Seeds | Invoke | Write-back |
|--------|-------|--------|-----------|
| [`seed-test-data.js`](../../../../scripts/seed-test-data.js) | Catalog → category → product → pricing → inventory from `test-data/` CSVs. Profiles: `minimal`/`catalog`/`full`/`teardown` | `npm run seed` · `seed:minimal` · `seed:catalog` · `seed:full` · `seed:teardown` · `seed:dry-run` | `_seed-results-{date}.json` |
| [`seed-standard-products.mjs`](../../../../scripts/seed-standard-products.mjs) | 6 standard products (`PROD_HEADPHONES`, `PROD_LAPTOP`, `PROD_OOS`, `PROD_LOW_STOCK`, `PROD_PACK_SIZE`, `PROD_TIER_PRICED`) | `node scripts/seed-standard-products.mjs [--dry-run] [--only PROD-001]` | `_seed-results-std-{date}.json` |
| [`seed-configurable-products.mjs`](../../../../scripts/seed-configurable-products.mjs) | Single-section configurable products (CFG-012/014/015/016/018) + child-option products | `node scripts/seed-configurable-products.mjs [--dry-run] [--only CFG-012]` | `_seed-results-cfg-{date}.json` |
| [`seed-conditional-sections-extended.mjs`](../../../../scripts/seed-conditional-sections-extended.mjs) | Conditional-cascade CFGs (CFG-022..029, `dependsOnSectionId`) | `node scripts/seed-conditional-sections-extended.mjs [--dry-run]` | `_seed-results-cfg-cond-{date}.json` |
| [`seed-default-option-cfg.mjs`](../../../../scripts/seed-default-option-cfg.mjs) | Default-option CFGs (VCST-4715: CFG-030/031, `option.isDefault`) | `node scripts/seed-default-option-cfg.mjs [--only CFG-030]` | `_seed-results-cfg-default-{date}.json` |
| [`seed-bike-flat-cfg.mjs`](../../../../scripts/seed-bike-flat-cfg.mjs) | Flat Bike CFG-032 for suite 072 (CFG-PDP-*) | `node scripts/seed-bike-flat-cfg.mjs` | `_seed-results-bike-flat-{date}.json` |
| [`seed-promotions.mjs`](../../../../scripts/seed-promotions.mjs) | Marketing promotions + rewards + coupons from `test-data/promotions/*.csv` | `npm run seed:promotions` (`[--dry-run] [--only P01] [--teardown]`) | `_seed-results-promotions-{date}.json` |
| [`seed-bopis.mjs`](../../../../scripts/seed-bopis.mjs) | BOPIS pickup locations from `test-data/stores/bopis-locations.csv` (vc-module-shipping; linked to an existing FFC) | `npm run seed:bopis` (`[--only LOC-001] [--teardown]`) | `_seed-results-bopis-{date}.json` |
| [`seed-catalog-properties.mjs`](../../../../scripts/seed-catalog-properties.mjs) | Catalog/variation property definitions + dictionary values from `test-data/catalogs/properties.csv` | `npm run seed:properties` (`[--only PROP-001] [--teardown]`) | `_seed-results-properties-{date}.json` |
| [`seed-white-labeling.mjs`](../../../../scripts/seed-white-labeling.mjs) | Menu link lists + white-labeling org config + users from `test-data/white-labeling/*.csv` | `npm run seed:white-labeling` (`[--skip-users] [--teardown]`) | `_seed-results-wl-{date}.json` |
| [`seed-b2b-fixtures.mjs`](../../../../scripts/seed-b2b-fixtures.mjs) | B2B orgs + contacts + addresses from `test-data/b2b/*.csv` (this is the real `b2b` seeder) | `node scripts/seed-b2b-fixtures.mjs` | `_seed-results-orgs-{date}.json` |
| [`seed-impersonation-targets.mjs`](../../../../scripts/seed-impersonation-targets.mjs) | 11 orgs + users for IMP-048/049 (suite 082) | `node scripts/seed-impersonation-targets.mjs` | `reports/seed/seed-impersonation-targets-{date}.json` |
| [`refresh-product-guids.mjs`](../../../../scripts/refresh-product-guids.mjs) | Refreshes product GUIDs in `test-data/` after a reseed | `npm run refresh-product-guids` | updates `test-data/` CSVs + `aliases.json` |

`seed-test-data.js` covers only `minimal/catalog/full/teardown` — **B2B is `seed-b2b-fixtures.mjs`**, and pricing is folded into the `catalog`/`full` profiles. The CFG `.mjs` seeders are phased (Phase 1+2 → conditional → default-option → bike) and share catalog/category/pricelist/ffc/virtual-catalog wiring.

The newer seeders (`seed-promotions`, `seed-bopis`, `seed-catalog-properties`, `seed-white-labeling`) share [`scripts/lib/seed-common.mjs`](../../../../scripts/lib/seed-common.mjs) — the common env-load / host-allowlist / auth / `api()` / CSV / write-back helper — and all support `--dry-run` (reads only, never writes), `--verbose`, `--only <id>`, and `--teardown` (deletes exactly the rows they seed). **Reference-only `test-data/` (payment cards, search queries, security payloads, uploads, GraphQL query library) and discovered/pre-existing infra (FFCs, stores, languages) intentionally have no seeder.** Known remaining gaps with no script: `test-data/b2b/roles.csv` (its permission strings are abstract and don't map to real VC permission keys — would create empty roles) and standalone B2B user-account creation (partially covered by `seed-impersonation-targets.mjs`).

### Path B — Postman MCP (collection-driven)

The 6-step workflow below builds a reusable Postman collection via MCP and executes it via Newman / Postman CLI. Use when you want a **shareable, reusable seed collection** or are already in a Postman-centric flow. **The MCP cannot execute collections** — execution is out-of-band (see `/qa-postman/execution.md`). Read `/qa-postman` first for auth, variable scoping, collection structure, and tool signatures.

> **Prefixes & teardown scope.** All seeders now share the `AGENT-TEST-*` family. `seed-test-data.js` tags entities `AGENT-TEST-SEED-{date}` (date for traceability, stable base for matching), and `npm run seed:teardown` sweeps **every prior run** of that script — matching the date-independent `AGENT-TEST-SEED-*` family plus legacy `SEED-*` (back-compat). It is intentionally scoped to its own family, so it does **not** delete the specialized `.mjs`/Postman fixtures (`AGENT-TEST-CFG-*`, B2B orgs, etc.) that carry pinned `@td()` IDs. The Postman `teardown` profile sweeps the broader `AGENT-TEST-*` ephemeral set. Deleting a seed catalog cascades to its categories/products; price lists are swept by keyword.

## Reference

Read **before** executing:
1. `.claude/skills/testing/qa-postman/SKILL.md` — Postman MCP entry point (index of all sub-guides: `mcp-tools.md`, `variables-and-environments.md`, `collections-and-requests.md`, `graphql-authoring.md`, `test-data-fixtures.md`, `execution.md`, `common-mistakes.md`, `examples.md`)
2. `.claude/skills/testing/qa-seed-data/test-data-generation.md` — Entity graph, API endpoints, request bodies, batch patterns, naming

## Arguments

| Argument | Description | Fastest backing tool |
|----------|-------------|----------------------|
| `minimal` | 1 catalog + 1 category + 1 product + price + inventory | `npm run seed:minimal` |
| `catalog` | Full catalog tree: 3 categories, 5 products (physical/digital/configurable), variations, prices, inventory | `npm run seed:catalog` |
| `b2b` | Organization + users + roles + contacts + addresses | `node scripts/seed-b2b-fixtures.mjs` |
| `pricing` | Price lists (USD + EUR), tiered prices, quantity breaks, multi-currency | folded into `seed:catalog` / `seed:full` (Postman path for standalone) |
| `full` | **Seed every seedable fixture defined in `test-data/`** — all CSV-backed entities (catalogs, categories, properties, products, pricing, inventory, B2B orgs/contacts/users/roles, promotions/coupons, white-labeling, BOPIS locations, CMS pages, loyalty settings) so that every `@td()` reference across all suites resolves against live data. NOT just the synthetic `AGENT-TEST-*` entities from the other profiles. See `test-data-generation.md` §Full Profile — Seed All `test-data/` Fixtures. | `npm run seed:full` + the specialized CFG/B2B `.mjs` seeders |
| `teardown` | Delete ephemeral seeded entities. Script path: `npm run seed:teardown` sweeps all prior `AGENT-TEST-SEED-*` runs (+ legacy `SEED-*`). Postman path: sweeps the broader `AGENT-TEST-*` set. See the prefix note above. | `npm run seed:teardown` (script) |

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

**For `full`:** the folders above seed synthetic `AGENT-TEST-*` entities. To seed the entire `test-data/` directory instead, follow `test-data-generation.md` §Full Profile — Seed All `test-data/` Fixtures — its seed-order table maps every CSV-backed source to its entity + endpoint, flags reference-only sources, and requires idempotent look-up-then-create so pinned `@td()` IDs survive. CMS pages (UI-only) and order/quote-state fixtures (admin-transition) are seeded outside Postman by `qa-frontend-expert`/`qa-backend-expert`.

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
| `full` | ~30s | 0s | ~2-4 min | ~45-60s | **~4-6 min** (seeds the entire `test-data/` directory; far heavier than the legacy "all profiles" full) |

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
**Seeds the entire `test-data/` directory** — not just the synthetic entities created by the other profiles. The goal is a platform state where **every `@td()` reference in every regression suite resolves against live data**. Use before full regression runs.

Seed each CSV-backed fixture in `test-data/`, in dependency order, preserving the IDs/codes/names the CSVs and `aliases.json` already pin (so existing `@td()` rows resolve without rewrites). Sources that are **reference-only** (payment cards, search queries, upload files, GraphQL query library, security payloads) are NOT seeded — they are consumed in place. The full mapping of each `test-data/` source → platform entity → endpoint (and which are reference-only) lives in `test-data-generation.md` §Full Profile — Seed All `test-data/` Fixtures.

**Idempotency:** the `full` seed must be re-runnable. For each fixture, look it up first (by pinned `platform_id`/code/name); create only if missing, otherwise update in place. A `full` run that 404s on a pinned entity should re-provision that row and write the new ID back into the CSV + `aliases.json` (see Step 6). It must NOT create duplicate copies of fixtures that already exist.

### `teardown`
Scans for entities matching `AGENT-TEST-*` naming convention and deletes them in safe order. **Does not** remove the persistent `test-data/` fixtures provisioned by `full` (catalogs, products, B2B orgs/users, promotions/coupons, etc.) — those keep their pinned IDs so `@td()` references stay resolvable across runs; teardown only sweeps the ephemeral `AGENT-TEST-*` entities created by individual tests. Also:
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
- **Never hardcode environment GUIDs** (catalog roots, store IDs, FFC IDs, virtual-catalog IDs) inside the seed collection or any helper script — read them from `test-data/aliases.json` (e.g. `@td(VIRTUAL_CATALOG_B2B.id)`, `@td(B2B_STORE.id)`) or via the `01-Infrastructure` discovery folder. See `.claude/rules/test-data.md` and `feedback_no_hardcoded_guids_in_scripts.md`.
- **Inventory status matters.** New products MUST be seeded with `inventoryStatus: "Enabled"` — xAPI `addItem` silently returns `itemsCount=0` (no error) when status is `Disabled`, masquerading as a cart-layer bug. See `test-data-generation.md` §Inventory.
- **Storefront visibility requires the B2B virtual catalog.** A product in a fresh physical catalog returns 404 on the B2B storefront until it is linked into `@td(VIRTUAL_CATALOG_B2B.id)`. Include the link step in `02-Catalog` or `03-Products`.
- **Passwords come from `.env`, not the skill.** The example bodies show `TestPassword123!`/`TestPass123!` for readability only — actual seed runs must read credentials from `.env` (`ADMIN_PASSWORD`, `USER_PASSWORD`) or `test-data/users/agent-user-pool.csv` for agent slots. See `feedback_agents_read_env_creds.md` + `user_test_accounts.md`.
