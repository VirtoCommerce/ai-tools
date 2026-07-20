# Test Data — Resolver, Registry, and No-Hardcode Policy

Cross-skill rule for any test artifact authored in this repo (test cases, Postman collections, regression CSVs, GraphQL runner cases, agent prompts, bug-repro snippets). **Test data is resolved at runtime, never hardcoded.**

## Four data layers

| Layer | Source | Use for |
|-------|--------|---------|
| `{{VAR}}` | [`.env`](../../.env) (33 vars; `npm run env:check`) | URLs, credentials, store/culture/currency context — anything whose value is per-environment, not per-test |
| `@td(ALIAS.field)` | [`test-data/aliases.json`](../../test-data/aliases.json) → a CSV row **or a JSON fixture** in [`test-data/`](../../test-data/) | Specific entities you **assert against by name**: the configurable laptop the test was designed for, a known coupon, the canonical Skyflow card, a fixed org, a Completed order. Aliases come in three shapes — inline (`_inline`), CSV-backed (`file`+`filter`+`fields`), and **JSON-fixture** (`json`+`fields`→dotted path, for Swagger-shaped nested entities like orders/quotes) |
| `live-discover` | [`scripts/lib/live-discover.ts`](../../scripts/lib/live-discover.ts) (xAPI at runtime) or CSV-runner `[GQL-OP]+[GQL-CAPTURE]` | **Any** entity, or one whose ID drifts between seeds: "first available product", "current virtual-catalog root", "first saved address", "any active coupon". Assert shape, not exact values. |
| `random-data` | [`scripts/lib/random-data.ts`](../../scripts/lib/random-data.ts) (zero-dep) | **Unique inputs** you never assert exact values on: registration emails, org names, comments, BVA quantities. Defaults use `AGENT-TEST-` prefix so `/qa-seed-data teardown` sweeps them. |

The decision tree, JS recipes, and CSV-runner recipes live in [`knowledge/execution/live-discovery.md`](../knowledge/execution/live-discovery.md) — agents authoring or reviewing test cases consult that file first.

**Passwords are never literals in committed test-data.** Seed-CSV password columns (`test-data/b2b/users.csv`, `test-data/b2b/organization-memberships.csv`, `test-data/users/test-users.csv`, `test-data/users/agent-user-pool.csv`) carry a `{{VAR}}` token (e.g. `{{B2B_USER_PASSWORD}}`, `{{TEST_USER_PASSWORD}}`, `{{DEFAULT_TEST_PASSWORD}}`), resolved at seed time from `.env.local` by [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs) `resolvePassword()` (per-env via the `_${TEST_ENV}` suffix). Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in [`templates/.env.local.template`](../../templates/.env.local.template). `td:reconcile` secret-hygiene fails any bare password literal; a `{{VAR}}` token is clean (VCST-5406).

## Seed writeback — where runtime GUIDs land after a seed

Seeders resolve/create entities at runtime, then persist the **drifting platform GUIDs** so `@td()` keeps resolving. The split:

- **Business keys / SKUs / codes / names** stay in the **committed CSV** (they don't drift; they're the seed *input*). SKU-, code-, and business-key-backed aliases (`PROD_*`, `COUPON_*`, `STORE_*`, `FC_*`, `PRICELIST_*`, `USER_*`, `WL_*`, `ORG_*.id`, `BOPIS_*.id`) need **no writeback** — their id columns already hold stable keys.
- **Runtime platform GUIDs** are written to **`test-data/aliases.{TEST_ENV}.json`** by [`scripts/lib/seed-common.mjs`](../../scripts/lib/seed-common.mjs) — `writeEnvAliasOverride(updates)` (inline aliases) and `syncEnvAliases(fileKey, byBusinessKey)` (CSV-backed: matches aliases by `file`+`filter`, writes only the id fields they declare). The resolver ([`test-data-resolver.ts`](../../scripts/lib/test-data-resolver.ts)) layers this env file **field-by-field** over `aliases.json`, so the override supplies only the GUID while `code`/`name`/`sku` fall back to the base CSV.
- **Every env — including `vcst` — writes its own `aliases.{env}.json`.** vcst is no longer special-cased: the committed CSVs carry **no runtime platform GUIDs** (e.g. `b2b/users.csv` `platform_id` is blank), so a suite run against one env can never resolve another env's ids — an unseeded env resolves the id to `""` (a clear miss) instead of silently leaking a wrong-env GUID. Each env's ids live only in its overlay: `aliases.vcst.json` / `aliases.vcptcore.json` / `aliases.virtostart.json` are committed (shared by the team); `aliases.localhost.json` is gitignored (drifts each fresh-DB provision). To populate a new env, seed it (`TEST_ENV=<env> npm run seed:* ...`).
- **Wired today (→ `aliases.{env}.json` overlay):** configurable-products (all runtime GUIDs — `product_id_guid`, `configuration_id`, section/default-option ids — for every env; the seeder does NOT rewrite the CSV), b2b **users** (`platform_id`, all envs incl. vcst), virtual-catalog root, **standard imported fixtures** (`products/standard.csv` STD-001/002 `product_id_guid` + `catalog_id`, written by `seed-standard-products.mjs`'s `captureDiscoveredFixtures()` — discovered by `code`, per env). **Pinned in the committed CSV (env-invariant, NOT overlaid):** b2b **organizations** `platform_id` — `seedOrgs` forces `body.id = row.platform_id` on create so the org GUID is identical on every env. **Blank in the CSV (no consumer):** b2b **contacts** `platform_id` — no `@td` alias resolves it; the seeder links accounts by the runtime contact id, never the CSV. **Not seeder-written** (captured out-of-band): the `BOPIS`/loyalty inline snapshots.
- **configurable-products source model:** the seeder's `SPECS` (`scripts/seed-data/products/configurable-specs.mjs`, a side-effect-free module) is the single source of truth for structure + business fields; `test-data/products/configurable-products.csv` mirrors the business columns (name/slug/price/section_types) for `@td` **plus hand-authored prose** (`section_details`/`test_purpose`/`notes`) and carries NO GUIDs. The CSV is NOT regenerated from `SPECS` (that would lose the prose) — instead `npm run td:validate:cfg` (`validate-configurable-data.mjs`) drift-guards: asserts CSV business fields match `SPECS` and that no GUID leaked back in. (CFG-001…011 are legacy CSV rows with no `SPECS` entry — flagged as warnings, not seeder-managed.)
- **standard-products source model:** `seed-standard-products.mjs` has ONE CSV source of truth — `test-data/products/test-products.csv` — and creates every row flagged **`seeded=true`** (the flat checkout fixtures incl. the loyalty ProductPoints SKUs; other rows are `@td`-only references to live/manual products). `scripts/seed-data/products/standard-specs.mjs` (side-effect-free) declares the column→field mapping (`CSV_SOURCE`), create-time overlays a flat row can't express (`SPEC_OVERLAYS` — MOQ/pack/tier), and the imported fixtures to discover (`DISCOVERED_FIXTURES` — `standard.csv` STD-*, captured to the overlay by `code`, never created). The CSV carries NO GUIDs; `npm run td:validate:standard` (`validate-standard-data.mjs`) drift-guards both `standard.csv` and `test-products.csv` (no GUID leak, discovered/overlay coherence). **Separate system, NOT this seeder:** the normalized relational catalog (`test-data/catalogs/*.csv` + `products/products-full.csv` + `pricing/*.csv` + `inventory/stock-levels.csv`) driven by the legacy `seed-test-data.js` — foreign-keyed, do not fold in.
- Seeders **no longer write `_seed-results-*.json` reports** — runtime GUIDs live in `aliases.{env}.json`, business keys in the CSVs.

### Authoring rule for ANY new seeder / test-data script (multi-env — MANDATORY)

Regression runs the same suites against many envs (`vcst`, `vcptcore`, `virtostart`, `localhost`, customer envs) from ONE checkout. A runtime GUID committed to a shared file resolves to the wrong (or a nonexistent) entity on every other env. So every new seeder MUST:

1. **Never write a runtime (server-generated) platform GUID into a committed CSV.** After creating an entity, persist its id to `aliases.<env>.json` via `syncEnvAliases(fileKey, byBusinessKey)` (CSV-backed aliases) or `writeEnvAliasOverride({alias:{field:id}})` (inline) — **for every env, including `vcst`** (no `PRIMARY_ENV` special-case). The committed CSV keeps only env-invariant data: business keys (SKU/code/email/name), human-authored fields, and **deterministic pinned ids** (an id you force via `body.id = <fixed guid>` so it's identical on every env — e.g. `seedOrgs`).
2. **One source of truth.** Drive the seeder from the CSV (read it as input) OR from a side-effect-free `*-specs.mjs` module — not both. Never hand-maintain a second mirror. Importing the source must have no side effects (guard any `main()`), so a validator can import it.
3. **Don't regenerate a file that holds hand-authored prose.** If the CSV carries human docs (`test_purpose`/`notes`/descriptions), add a **drift-guard validator** (`td:validate:<domain>`) that asserts the derivable business columns match the source and that **no GUID leaked into the CSV** — rather than overwriting the file.
4. **Resolution is empty, not wrong, on an unseeded env.** With ids only in overlays, an env that hasn't been seeded resolves the id to `""` (a clear miss) — never another env's value. Seed the env (`TEST_ENV=<env> npm run seed:* …`) to populate its overlay.

Reference implementations: b2b users (`user-provision.mjs` → `syncEnvAliases('b2b/users', …)`, `validate-b2b-data.mjs`), configurable-products (`seed-configurable.mjs` + `configurable-specs.mjs` + `validate-configurable-data.mjs`).

## Canonical references (single sources of truth)

- **[`knowledge/execution/live-discovery.md`](../knowledge/execution/live-discovery.md)** — decision tree, JS + CSV-runner recipes, anti-patterns, parallel-run isolation (the agent-facing summary of this rule)
- **[`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md)** — how-to for **writing** a seeder / fixture / validator: seeder skeleton on `seed-common.mjs`, writeback rule, the JSON-shaped-to-Swagger-vs-CSV fixture-format decision, drift-guard + teardown + unit-test checklist. Owned by the **`test-data-engineer`** agent. (`scripts/seed-data/` is organized into per-domain subfolders — `catalog/`, `products/`, `b2b/`, `orders/`, `loyalty/`, …; the orchestrator `seed-bootstrap.mjs` + `reconcile-test-data.mjs` + legacy `seed-test-data.js` stay at the `seed-data/` root.)
- **[`skills/qa-postman/test-data-fixtures.md`](../skills/qa-postman/test-data-fixtures.md)** — `@td()` resolver contract, fixture directory layout, account/catalog/address conventions, integration patterns
- **[`test-data/aliases.json`](../../test-data/aliases.json)** — alias registry (`_meta.version` is the contract version)
- **[`test-data/README.md`](../../test-data/README.md)** — directory layout and seed-results index
- **[`scripts/lib/test-data-resolver.ts`](../../scripts/lib/test-data-resolver.ts)** — `@td()` resolver implementation (CSV-backed + inline aliases)
- **[`scripts/lib/live-discover.ts`](../../scripts/lib/live-discover.ts)** — typed xAPI discovery primitives (catalog root, products, addresses, cart, coupons)
- **[`scripts/lib/random-data.ts`](../../scripts/lib/random-data.ts)** — zero-dep random generators (emails, org names, SKUs, quantities, comments)
- **[`scripts/test-data/validate-td-refs.ts`](../../scripts/test-data/validate-td-refs.ts)** — STATIC validation (`npm run td:validate` — verifies every `@td()` reference resolves + flags hardcoded GUIDs)
- **[`scripts/seed-data/reconcile-test-data.mjs`](../../scripts/seed-data/reconcile-test-data.mjs)** — LIVE reconciliation (`TEST_ENV=<env> npm run td:reconcile` — probes the platform: catalog root exists, `.env.{ENV}` user roles have accounts, B2B users are org-scoped with no global roles, no password literals in committed CSVs)
- **[`scripts/lib/user-roles.mjs`](../../scripts/lib/user-roles.mjs)** — canonical test-user ROLE → `.env.{ENV}` var registry (identity from `.env.{ENV}`, secrets from `.env.local`); consumed by the user seeders + `td:reconcile`
- **[`knowledge/api/graphql-test-cases-runner.md`](../knowledge/api/graphql-test-cases-runner.md)** — runner-native CSV grammar where `@td()` and `[GQL-CAPTURE]` are consumed natively
- **[`knowledge/api/graphql-schema.md`](../knowledge/api/graphql-schema.md)** — schema reference; verify field names before authoring queries that consume `@td()` values or `live-discover` recipes

## Why hardcoded fixtures rot

- Catalogs are re-seeded → product IDs change → tests silently fail or skip
- B2B orgs are re-created → contact/user/role IDs change
- Virtual-catalog root IDs migrate (the active root moved on 2026-04-30; see `feedback_storefront_virtual_catalog_link` memory)
- Prices, coupon codes, and addresses get reseeded with each sprint

`@td()` indirection means the alias is stable; the CSV row gets updated when the underlying data changes, and every consumer follows automatically.

## Where this rule is enforced

| Skill / Agent / File | How it enforces |
|----------------------|-----------------|
| [`/qa-test-cases-generator`](../skills/qa-test-cases-generator/SKILL.md) | "Always resolve test data, never hardcode" rule + Step 5 self-review check |
| [`/qa-checklist`](../skills/qa-checklist/SKILL.md) | Cross-Skill References section + checklist items resolve entities via `@td()` |
| [`/qa-postman`](../skills/qa-postman/SKILL.md) | [`test-data-fixtures.md`](../skills/qa-postman/test-data-fixtures.md) + Mistake #14 in [`common-mistakes.md`](../skills/qa-postman/common-mistakes.md) |
| [`/qa-api`](../skills/qa-api/SKILL.md) | "Test Data — Resolve via `@td()`, Don't Hardcode" section |
| [`/qa-seed-data`](../skills/qa-seed-data/SKILL.md) | Seed runs write runtime GUIDs to `aliases.<env>.json` (all envs); `td:validate` (static) + `td:reconcile` (live, per env) are the post-seed gates |
| Per-domain drift guards | `npm run td:validate:b2b` (`validate-b2b-data.mjs`) + `td:validate:cfg` (`validate-configurable-data.mjs`) + `td:validate:standard` (`validate-standard-data.mjs`) — fail if a runtime GUID sits in a committed CSV, and (cfg) if CSV business fields drift from `SPECS`, and (standard) if a discovered fixture / `SPEC_OVERLAYS` key is incoherent with the CSVs. New seeders SHOULD add a matching `td:validate:<domain>` guard (see the "Authoring rule for ANY new seeder" above). |
| [`/qa-generate-data`](../skills/qa-generate-data/SKILL.md) | Authors fixtures from scratch with no system GUIDs (blank `*_guid`/`platform_id`, `seeded=false`), business-key aliases, `AGENT-TEST-` prefix; ends on a mandatory `validate-td-refs.ts` green gate |
| [`test-data-engineer`](../agents/test-data-engineer.md) agent | The canonical author of seeders/fixtures/validators. Its mandatory process + self-review Judge enforce: no runtime GUID in a committed fixture, writeback to `aliases.<env>.json`, a matching `td:validate:<domain>` guard, teardown symmetry, and `scripts/unit/` tests green — before hand-off to live verification |
| Regression suite CSVs | `Test_Data` columns use `{{VAR}}` and `@td()` exclusively |
| `scripts/graphql/graphql-runner.ts` | Resolves `@td()` natively before sending GraphQL ops; rejects unresolved tokens at lint time |

## Memory entries that codify this rule

- `feedback_no_test_data` — Use `test-data/` for test data; avoid hardcoding in CSV `Test_Data` columns
- `feedback_flexible_test_cases` — GOLDEN RULE: no hardcoded IDs/SKUs/emails/prices/order-numbers/paths
- `feedback_env_resilience` — Never assert exact prices, section titles, or URL path segments tied to catalog data
- `reference_test_data_resolver` — `@td()` is real; `scripts/lib/test-data-resolver.ts` + `test-data/aliases.json`
- `feedback_verify_source_data_before_bug` — Verify the underlying record's field value before filing a "wrong field mapping" bug
- `feedback_agents_read_env_creds` — Never hardcode passwords in agent prompts; agents read `.env` at runtime

## When you must add a hardcoded value

You should not. If you genuinely cannot resolve via `{{VAR}}` or `@td()`:

1. Add a new alias entry to [`test-data/aliases.json`](../../test-data/aliases.json) pointing to a CSV row that holds the value
2. Or use the inline `@td(file, filter, column)` form for one-off lookups (see [`test-data/README.md`](../../test-data/README.md) §Direct form)
3. Run `npx tsx scripts/test-data/validate-td-refs.ts` to confirm resolution
4. If neither works, the value is environmental — promote it to `.env` and reference as `{{VAR}}`

A literal in a Steps/Test_Data column without one of these resolvers is a review failure (see `/qa-review-tests` Dimension 6 — Data Validity).
