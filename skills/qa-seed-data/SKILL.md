---
name: qa-seed-data
description: "[Testing] Seed/teardown ALL test data — catalogs, products, pricing, inventory, B2B orgs/users, configurable products, loyalty, promotions, BOPIS — on ANY environment (TEST_ENV) via repo seed scripts (npm run seed) or Postman MCP; verify with td:reconcile"
argument-hint: "[bootstrap|minimal|catalog|b2b|pricing|inventory|loyalty|promotions|bopis|configurable|users|full|teardown]"
disable-model-invocation: true
---

# /qa-seed-data — Test Data Generation & Teardown

Single entry point for seeding **every** kind of test data this repo needs — and for tearing it down — on **any** environment (fresh `/qa-local-env` localhost, vcst, vcptcore, virtostart, a customer env; selected by `TEST_ENV`). Covers two execution paths (script-based and Postman MCP), the full `test-data/` fixture surface, and the specialized one-purpose seeders.

**Environment-agnostic + self-verifying (VCST-5406):** `npm run seed:bootstrap` warms the member index + ensures one bridge fulfillment center, then runs every phase — each its own common script — in an **explicit priority order** (`STEPS[].priority` in `seed-bootstrap.mjs`, sorted, not array-position): **Catalog(10) → Categories(20) → Properties(30) → Products(40) → Configurable(50) → Prices(60) → Inventory(70) → Store(80) → BOPIS(90) → Company-users(100) → Promotions(110) → Loyalty(120) → White-labeling(130)**. Prices run *after* both products and configurable so everything is priced; the store is finalized *after* inventory so its FFC roles resolve. The same command works on an empty DB or a populated env. Seeders read the entity back after create (`verifyCreated`) and each teardown asserts zero residue (`verifyRemoved`). Confirm any env with `npm run td:validate` (static `@td()` gate) + `npm run td:reconcile` (live: catalog root, `.env.{ENV}` user roles, B2B org-scoped memberships with **no global roles**, secret hygiene).

**One tear-down-for-all:** `npm run seed:bootstrap:teardown` sweeps every domain in **reverse** dependency order (mirror of the seed chain). **Teardown safety — deletes ONLY `AGENT-TEST` entities:** every seeder scopes deletion to its own fixtures (by `AGENT-TEST` name prefix, exact seed email, own catalog, or bookkeeping id) and every product delete uses the non-empty `objectIds` field (an empty `ObjectIds` on `POST /api/catalog/listentries/delete` wipes the whole catalog — never do that). All seed **catalogs/categories** carry **stable `AGENT-TEST-SEED-` names** (no date stamp) so separate phase processes resolve the same entities and re-runs don't sprawl orphan catalogs. Entities seeded before a name change (e.g. a rename to add the prefix) are treated as real data and NOT swept — flush them on a fresh-DB re-provision.

## Seeding Tooling — Two Execution Paths

Pick the path by what you're seeding. Both end with the same obligation: write seeded IDs back into `test-data/` so `@td()` resolves (Step 6 below).

### Path A — Repo seed scripts (direct REST/xAPI) — the practical default

Node seeders in [`scripts/seed-data/`](../../scripts/seed-data/) read CSVs from [`test-data/`](../../test-data/), call the platform API directly, are **idempotent** (look-up-then-create), respect `TEST_ENV` (via `config.js` / `seed-common.mjs`, with per-env `_${ENV}` secret-suffix promotion), are gated by **`ENV_RISK`** (config, not hostname — blocks `production`, runs on any dev/test/staging/localhost/customer env), and — where an entity's runtime GUID is consumed by `@td()` — write those ids to `test-data/aliases.{env}.json` (per-env override; everything else resolves by static business key from the committed CSVs). **No `_seed-results-*.json` reports** (VCST-5406) — the legacy `seed-test-data.js` orchestrator is the sole exception. No Postman/Newman needed.

| Script | Seeds | Invoke | Write-back |
|--------|-------|--------|-----------|
| [`seed-bootstrap.mjs`](../../scripts/seed-data/seed-bootstrap.mjs) | ⭐ **Any-env orchestrator.** Preflight (member index + one bridge FFC) then every phase as its own common script in explicit `priority` order (catalog → categories → properties → products → configurable → pricing → inventory → store → bopis → company-users → promotions → loyalty → white-labeling). Required steps abort on failure; optional steps warn (e.g. loyalty module absent). **`--teardown`** = reverse-order tear-down-for-all. | `npm run seed:bootstrap` (`[--dry-run] [--verbose] [--skip-optional]`) · `npm run seed:bootstrap:teardown` | (child seeders write their own) |
| [`seed-catalog.mjs`](../../scripts/seed-data/seed-catalog.mjs) | Catalog phase (priority 10). Thin wrapper over shared `ensureCatalogs()` in `seed-common.mjs`: creates the physical + virtual catalogs from `test-data/catalogs/catalogs.csv` with **stable `AGENT-TEST-SEED-` names**, links virtuals to their physical sources, binds the store to its virtual catalog. Idempotent. | `npm run seed:catalog-structure` (`[--dry-run]`) | `aliases.<env>.json` (`CATALOG_*` + `VIRTUAL_CATALOG_B2B`) |
| [`seed-catalog-categories.mjs`](../../scripts/seed-data/seed-catalog-categories.mjs) | Categories phase (priority 20). Thin wrapper over shared `seedCategoryTree()`: builds the category hierarchy from `test-data/catalogs/categories.csv` (stable codes, parents first), links each catalog's root categories into the store virtual catalog. Self-resolves catalogs; idempotent. | `npm run seed:categories` (`[--dry-run]`) | — |
| [`seed-store.mjs`](../../scripts/seed-data/seed-store.mjs) | Store phase (priority 80). Thin wrapper over shared `ensureStore()` (extracted from `seed-test-data.js` so both paths build ONE store from `test-data/stores/stores.csv` — currencies + languages + settings + url + catalog binding + FFC roles). Run after inventory so FFC roles resolve. Idempotent. | `npm run seed:store` (`[--dry-run]`) | — (store is not `@td`-id-referenced) |
| [`seed-test-data.js`](../../scripts/seed-data/seed-test-data.js) | **Legacy relational seeder — no longer the default seed path.** `seed` / `seed:minimal` / `seed:catalog` / `seed:full` now route to the unified `seed-bootstrap.mjs` + phase scripts (see below). This file is retained for its **family-sweep teardown** (`seed:teardown` — deletes every `AGENT-TEST-SEED-*` catalog + cascade; used by `seed:bootstrap:teardown`) and `seed:dry-run`. | `npm run seed:teardown` · `seed:dry-run` | `_seed-results-{date}.json` (legacy — sole `_seed-results` writer) |
| [`seed-standard-products.mjs`](../../scripts/seed-data/seed-standard-products.mjs) | 12 standard products — the `test-products.csv` rows flagged `seeded=true` (`PROD_HEADPHONES`, `PROD_LAPTOP`, `PROD_OOS`, `PROD_LOW_STOCK`, `PROD_PACK_SIZE`, `PROD_TIER_PRICED` + 6 loyalty ProductPoints SKUs); also discovers imported `standard.csv` STD-* fixtures. Config in `standard-specs.mjs`. **Not** the relational catalog (that's `seed-test-data.js`). | `node scripts/seed-data/seed-standard-products.mjs [--dry-run] [--only PROD-001] [--teardown]` | `PROD_*` resolve by SKU; STD-* runtime ids → `aliases.<env>.json` |
| [`seed-configurable.mjs`](../../scripts/seed-data/seed-configurable.mjs) | ⭐ **ONE consolidated seeder for every script-created configurable** (CFG-012..032 + CFG-FILE) + child-option products. Full feature union in one spec table: Product/Text/File sections · per-option price/salePrice/stock(OOS)/quantity/isDefault · `dependsOnSectionId` cascades · parent base/sale price. Families: `base` (012–021,017,019,FILE), `conditional` (022–029), `default` (030–031), `bike` (032). | `node scripts/seed-data/seed-configurable.mjs [--dry-run] [--only CFG-013] [--group base\|conditional\|default\|bike] [--teardown]` | `aliases.{env}.json` (product_id_guid + configuration_id) |
| [`seed-promotions.mjs`](../../scripts/seed-data/seed-promotions.mjs) | Marketing promotions + rewards + coupons from `test-data/promotions/*.csv` | `npm run seed:promotions` (`[--dry-run] [--only P01] [--teardown]`) | — (`COUPON_*` static keys) |
| [`seed-bopis.mjs`](../../scripts/seed-data/seed-bopis.mjs) | BOPIS pickup locations from `test-data/stores/bopis-locations.csv` (vc-module-shipping; linked to an existing FFC) | `npm run seed:bopis` (`[--only LOC-001] [--teardown]`) | — (static location keys) |
| [`seed-catalog-properties.mjs`](../../scripts/seed-data/seed-catalog-properties.mjs) | Catalog/variation property definitions + dictionary values from `test-data/catalogs/properties.csv` | `npm run seed:properties` (`[--only PROP-001] [--teardown]`) | — (not `@td`-referenced) |
| [`seed-white-labeling.mjs`](../../scripts/seed-data/seed-white-labeling.mjs) | Menu link lists + white-labeling org config from `test-data/white-labeling/*.csv`. **Logo/secondary/favicon bytes are uploaded too** — a row's `*_source` path (under `test-data/`, e.g. `white-labeling/assets/electronics/logo.png`) is POSTed to `api/assets?folderUrl=customization[/favicons]` (same endpoint as the admin blades) with its sibling `{stem}_<size>.<ext>` thumbnails (admin tile 64x64 + WL xAPI favicon set 16/32/96/128/196), so both surfaces render with zero 404s; idempotent (reuses an already-serving URL unless `--reupload-assets`). Orgs/users are NOT provisioned here — it delegates to `seedWhiteLabelingUsers()` in [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs) (the SAME function `seed-company-users.mjs`'s `wl` kind calls), reusing its `orgMap` for the WL config step so orgs are only ever seeded once per run. | `npm run seed:white-labeling` (`[--skip-users] [--reupload-assets] [--teardown]`) | `aliases.{env}.json` |
| [`seed-company-users.mjs`](../../scripts/seed-data/seed-company-users.mjs) | **ONE script for every company user** (VCST-5406 — replaces the old `seed-b2b-fixtures` / `seed-users` / `seed-impersonation-targets` / `seed-loyalty-users`). CSV/env-driven over [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs). Kinds: `all` (default) · `b2b` (orgs parent-child + contacts + org-scoped logins + cross-org memberships) · `imp` (ORG-009…019 + blocked/invited targets, status-driven) · `cross-org` (organization-memberships.csv) · `personal` (env customer roles + agent-pool + test-users) · `loyalty` (VIP/Wholesale group) · `wl` (white-labeling orgs + users from `test-data/white-labeling/*.csv`, same org-scoped-role model — VCST-5028 — as b2b, incl. one user with a DIFFERENT role per org). Account status (Approved/Locked/EmailUnconfirmed) is data-driven from the users.csv `status` column. **One unified `--teardown`** sweeps ALL sources, including white-labeling, (no orphan gap). | `npm run seed:company-users` (`b2b` / `personal` / `imp` / `wl` via `seed:b2b` / `seed:users` / `seed:impersonation` / `seed:wl`; `--teardown` / `--dry-run`) | `aliases.{env}.json` (platform_id) |

The `seed` / `seed:minimal` / `seed:catalog` / `seed:full` entry points now route to the unified `seed-bootstrap.mjs` + phase scripts (not the legacy `seed-test-data.js` monolith). **All company users (B2B orgs/contacts/logins/memberships + personal + impersonation + loyalty + white-labeling) are `seed-company-users.mjs`.** All configurable products are seeded by the single `seed-configurable.mjs` (families `base`/`conditional`/`default`/`bike` via `--group`); it imports `seed-common.mjs` and keeps each family's catalog/category/pricelist names for idempotency.

The newer seeders (`seed-configurable`, `seed-promotions`, `seed-bopis`, `seed-catalog-properties`, `seed-white-labeling`) share [`scripts/lib/seed-common.mjs`](../../scripts/lib/seed-common.mjs) — the common env-load / host-allowlist / auth / `api()` / CSV / write-back helper — and all support `--dry-run` (reads only, never writes), `--verbose`, `--only <id>`, and `--teardown` (deletes exactly the rows they seed). **Reference-only `test-data/` (payment cards, search queries, security payloads, uploads, GraphQL query library) and discovered/pre-existing infra (FFCs, stores, languages) intentionally have no seeder.** All company-user account creation (B2B logins, cross-org members, personal accounts, impersonation targets, loyalty group users) is now covered by the single `seed-company-users.mjs` over `scripts/lib/user-provision.mjs`. `test-data/b2b/roles.csv` needs no seeder — it now mirrors the real storefront roles (vc-frontend `core/constants/security.ts` `ALL_ROLES` + real `permissions.enum.ts` keys; the 3 `member_dropdown=yes` rows are `B2B_ROLES`, the Company-Members "Change role" options). Those role IDs (`org-maintainer`/`org-employee`/`purchasing-agent`/`store-admin`/`store-manager`) are platform built-ins that already exist — the `memberships` seeder references them by id.

### Path B — Postman MCP (collection-driven)

The 6-step workflow below builds a reusable Postman collection via MCP and executes it via Newman / Postman CLI. Use when you want a **shareable, reusable seed collection** or are already in a Postman-centric flow. **The MCP cannot execute collections** — execution is out-of-band (see `/qa-postman/execution.md`). Read `/qa-postman` first for auth, variable scoping, collection structure, and tool signatures.

> **Prefixes & teardown scope.** All seeders share the `AGENT-TEST-*` family. Each seeder owns a
> matching teardown that **verifies zero residue** (`verifyRemoved` in `seed-common.mjs`):
> `seed:teardown` (catalog/product/pricing family — sweeps every prior `AGENT-TEST-SEED-*` run + legacy `SEED-*`),
> `seed:company-users:teardown` (**unified** — every company user: B2B orgs/contacts/logins/memberships +
> personal + impersonation + loyalty + white-labeling across all sources; `seed:b2b:teardown` /
> `seed:users:teardown` are back-compat aliases of it), `seed:pricing:teardown`, `seed:inventory:teardown`,
> `seed:loyalty:teardown`, `seed:bopis:teardown`, `seed:products:teardown`, `seed:configurable:teardown`.
> `seed:teardown` is scoped to its own family, so it does **not** delete the specialized `.mjs` fixtures
> (`AGENT-TEST-CFG-*`, B2B orgs, etc.) that carry pinned `@td()` IDs — run those domains' teardowns for that.
> **Promotions are persistent** (not swept by default; use `seed:promotions --teardown`). The Postman
> `teardown` profile sweeps the broader `AGENT-TEST-*` ephemeral set. Deleting a seed catalog cascades to
> its categories/products; price lists are swept by keyword.

## Reference

Read **before** executing:
1. `skills/qa-postman/SKILL.md` — Postman MCP entry point (index of all sub-guides: `mcp-tools.md`, `variables-and-environments.md`, `collections-and-requests.md`, `graphql-authoring.md`, `test-data-fixtures.md`, `execution.md`, `common-mistakes.md`, `examples.md`)
2. `skills/qa-seed-data/test-data-generation.md` — Entity graph, API endpoints, request bodies, batch patterns, naming

## Arguments

| Argument | Description | Fastest backing tool |
|----------|-------------|----------------------|
| `bootstrap` | ⭐ **Any-env, from-scratch.** Preflight (member index + bridge FFC) then all 13 phases as common scripts in explicit `priority` order; required steps abort on failure, optional steps warn. Use on a fresh `/qa-local-env` DB or to fully (re)seed any env. **Tear down everything:** `npm run seed:bootstrap:teardown` (reverse order, AGENT-TEST-only). | `npm run seed:bootstrap` (`[--skip-optional]`) · `seed:bootstrap:teardown` |
| `catalog-structure` / `categories` / `store` | Individual phase scripts (priority 10/20/80) — build the stable `AGENT-TEST-SEED-` catalog structure, category tree (roots linked into the virtual catalog), and the full store from `stores.csv`. All idempotent; normally run via `bootstrap`. | `npm run seed:catalog-structure` · `seed:categories` · `seed:store` |
| `minimal` | Unified **required-only** chain (`seed:bootstrap --skip-optional`) — catalog → categories → properties → products → pricing → inventory → store → company-users, skipping optional domains. | `npm run seed:minimal` |
| `catalog` | Unified **catalog subset** — the new phase scripts chained: catalog-structure → categories → products → pricing → inventory (stable `AGENT-TEST-SEED-` names). | `npm run seed:catalog` |
| `b2b` | Organizations (parent-child) + contacts + addresses, plus storefront logins + org-scoped role memberships (VCST-5028) + cross-org members | `npm run seed:b2b` (= `seed-company-users.mjs b2b`; cross-org only: `npm run seed:b2b:memberships`) |
| `pricing` | Price lists (USD + EUR), tiered prices, quantity breaks, multi-currency | `npm run seed:pricing` (`seed-pricing.mjs`; also folded into `seed:catalog` / `seed:full`) |
| `inventory` | Fulfillment centers + stock levels from `test-data/inventory/*.csv` (creates a default FFC on a fresh DB) | `npm run seed:inventory` (`seed-inventory.mjs`) |
| `configurable` | All configurable products (CFG-012..032 + CFG-FILE) via one consolidated seeder; `:conditional`, `:default`, `:bike` are `--group` filters of it | `npm run seed:configurable` (`seed-configurable.mjs`) |
| `users` | Personal storefront accounts from `test-data/users/*.csv` **and** the `.env.{ENV}` customer role identities (USER/USER2/EUR_USER/LOYALTY_*), created with the per-env password and read back to verify | `npm run seed:users` (= `seed-company-users.mjs personal`) |
| `imp` | Impersonation targets for IMP-048/049 (suite 082): ORG-009…019 + many-orgs/blocked/invited users, blocked & invited states data-driven from the users.csv `status` column | `npm run seed:impersonation` (= `seed-company-users.mjs imp`) |
| `loyalty` | Loyalty programs (Product Points + others) built from the platform's `new/{programType}` skeleton, with per-program **product factors** (a ProductPoints program earns nothing without them) and the VIP/Wholesale eligibility user groups + users | `npm run seed:loyalty` (`seed-loyalty.mjs`; VIP/Wholesale logins via `npm run seed:loyalty:users` = `seed-company-users.mjs loyalty`) |
| `promotions` | Marketing promotions + reward trees + coupons from `test-data/promotions/*.csv` | `npm run seed:promotions` (`seed-promotions.mjs`) |
| `bopis` | BOPIS pickup locations (vc-module-shipping) from `test-data/stores/bopis-locations.csv`, linked to an existing FFC | `npm run seed:bopis` (`seed-bopis.mjs`) |
| `full` | **Seed every seedable fixture defined in `test-data/`** so every `@td()` reference across all suites resolves against live data. Now an alias for the unified `seed:bootstrap` (all 13 phases in priority order — catalogs, categories, properties, products, configurable, pricing, inventory, store, B2B orgs/contacts/users/roles, promotions/coupons, loyalty, white-labeling, BOPIS). | `npm run seed:full` (= `seed:bootstrap`) |
| `teardown` | Delete ephemeral seeded entities (each teardown verifies zero residue). `npm run seed:teardown` sweeps all prior `AGENT-TEST-SEED-*` runs (+ legacy `SEED-*`); run the per-domain teardowns for the specialized fixtures (`seed:company-users:teardown` — all company users; `seed:products:teardown`, `seed:configurable:teardown`, `seed:bopis:teardown`, `seed:pricing:teardown`, `seed:inventory:teardown`, `seed:loyalty:teardown`). See the prefix note above. | `npm run seed:teardown` (+ per-domain) |
| _verify_ | **Not a seed profile — the check after seeding.** `td:validate` (static: every `@td()` resolves, no hardcoded GUIDs) + `td:reconcile` (live, per `TEST_ENV`: catalog root exists, `.env.{ENV}` user roles have accounts, B2B users are org-scoped with **no global roles**, no password literals in CSVs). | `npm run td:validate` · `npm run td:reconcile` |

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

After the run, capture the seeded entity IDs from the Newman/Postman result JSON and write them back into [`test-data/`](../../test-data/) so downstream suites can resolve them via `@td()` — see Step 6 and [`qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md).

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
| `loyalty` | n/a (script) | — | ~15-25s | n/a | **~20-30s** |
| `promotions` | n/a (script) | — | ~10-20s | n/a | **~15-25s** |
| `bopis` | n/a (script) | — | ~5-10s | n/a | **~10-15s** |
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
B2B organization with user hierarchy (`seed-company-users.mjs b2b`):
- Base orgs (AcmeCorp/TechFlow/BuildRight/AcmeWest) + the imp orgs + contacts + addresses from `test-data/b2b/*.csv`
- Contacts re-linked to surviving platform users; org-scoped logins provisioned with status from the users.csv `status` column

**`cross-org` kind (VCST-5028)** — org-scoped roles & per-org access, from `test-data/b2b/organization-memberships.csv`:
- Ensures a contact + storefront login (security account) per `user_email`
- Creates one `OrganizationMembership` per (user, org) with its `role_id` → seeds **cross-org members** (same user in N orgs with distinct roles, e.g. TechFlow=maintainer + BuildRight=employee)
- Idempotent (reuses existing user/memberships); included in `b2b`/`all`; the unified teardown removes the seeded logins + memberships
- API contract: REST body uses `userId` + `roles:[{roleId,roleName}]` (NOT `memberId`/`roleIds`) — see `reference_organization_membership_api_contract` memory

### `pricing`
Pricing module deep test:
- 2 price lists (USD, EUR)
- Assignments to catalog + store with priority
- Tiered prices: qty 1 (list + sale), qty 5, qty 10, qty 50
- Products reused from `catalog` profile (or created if run standalone)

### `loyalty`
Loyalty programs for earn/redeem testing (`seed-loyalty.mjs`, VCST-5104/5135):
- Builds each program in `test-data/loyalty/programs.csv` from the platform's `GET /api/loyalty-programs/new/{programType}` skeleton (guaranteed-valid empty program), then applies per-row overrides: name, localized name, `isActive`, priority, store, start/end window, and the eligibility user group (all / VIP / Wholesaler via the `dynamicExpression` condition tree)
- Populates each program's **product factors** from `test-data/loyalty/program-factors.csv` (a ProductPoints program earns nothing without factors). Factors are resolved SKU→productId at runtime — no hardcoded GUIDs — via `PUT /api/loyalty-program-product-factors/factors`
- VIP/Wholesale storefront logins seeded by `npm run seed:loyalty:users` (= `seed-company-users.mjs loyalty`)
- **Idempotent** — a program whose name already exists is reused; factors are re-applied (PUT replaces the set, repairing factors without duplicating programs)
- Earning model: single highest-priority eligible+active+in-window program wins globally (no stacking) — see `project_loyalty_productpoints_resolution_model` memory. Balances cannot be reset via API (`project_loyalty_balance_cannot_be_reset`)
- Teardown: `npm run seed:loyalty:teardown` deletes `AGENT-TEST-*` loyalty programs

### `promotions`
Marketing promotions for cart/coupon testing (`seed-promotions.mjs`):
- Promotions + reward trees + coupons from `test-data/promotions/*.csv`
- Reward set via GET-merge-PUT of `dynamicExpression`; relative date tokens resolved to ISO; coupons added via the separate `POST /api/marketing/promotions/coupons/add` (inline `coupons[]` is silently ignored — see `reference_marketing_coupons_api_contract`)
- Supports `--only P01`, `--dry-run`, `--teardown`

### `bopis`
BOPIS (Buy Online, Pick up In Store) pickup locations (`seed-bopis.mjs`, vc-module-shipping):
- Pickup locations from `test-data/stores/bopis-locations.csv`, each linked to an existing fulfillment center (FFC discovered at runtime, not hardcoded)
- Covers store-selector / cart / checkout pickup suites (036–038)
- Supports `--only LOC-001`, `--teardown`

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
- After every successful seed, write the new entity IDs back into [`test-data/`](../../test-data/) (CSV files referenced by `aliases.json`) so downstream regression suites resolve them via `@td()` — see [`qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md) for the resolver contract
- **Never hardcode environment GUIDs** (catalog roots, store IDs, FFC IDs, virtual-catalog IDs) inside the seed collection or any helper script — read them from `test-data/aliases.json` (e.g. `@td(VIRTUAL_CATALOG_B2B.id)`, `@td(B2B_STORE.id)`) or via the `01-Infrastructure` discovery folder. See `.claude/rules/test-data.md` and `feedback_no_hardcoded_guids_in_scripts.md`.
- **Inventory status matters.** New products MUST be seeded with `inventoryStatus: "Enabled"` — xAPI `addItem` silently returns `itemsCount=0` (no error) when status is `Disabled`, masquerading as a cart-layer bug. See `test-data-generation.md` §Inventory.
- **Storefront visibility requires the B2B virtual catalog.** A product in a fresh physical catalog returns 404 on the B2B storefront until it is linked into `@td(VIRTUAL_CATALOG_B2B.id)`. Include the link step in `02-Catalog` or `03-Products`.
- **Passwords come from `.env`, not the skill.** The example bodies show `TestPassword123!`/`TestPass123!` for readability only — actual seed runs must read credentials from `.env` (`ADMIN_PASSWORD`, `USER_PASSWORD`) or `test-data/users/agent-user-pool.csv` for agent slots. See `feedback_agents_read_env_creds.md` + `user_test_accounts.md`.
