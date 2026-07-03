# Test Data — Resolver, Registry, and No-Hardcode Policy

Cross-skill rule for any test artifact authored in this repo (test cases, Postman collections, regression CSVs, GraphQL runner cases, agent prompts, bug-repro snippets). **Test data is resolved at runtime, never hardcoded.**

## Four data layers

| Layer | Source | Use for |
|-------|--------|---------|
| `{{VAR}}` | [`.env`](../../.env) (33 vars; `npm run env:check`) | URLs, credentials, store/culture/currency context — anything whose value is per-environment, not per-test |
| `@td(ALIAS.field)` | [`test-data/aliases.json`](../../test-data/aliases.json) → CSV row in [`test-data/`](../../test-data/) | Specific entities you **assert against by name**: the configurable laptop the test was designed for, a known coupon, the canonical Skyflow card, a fixed org |
| `live-discover` | [`scripts/lib/live-discover.ts`](../../scripts/lib/live-discover.ts) (xAPI at runtime) or CSV-runner `[GQL-OP]+[GQL-CAPTURE]` | **Any** entity, or one whose ID drifts between seeds: "first available product", "current virtual-catalog root", "first saved address", "any active coupon". Assert shape, not exact values. |
| `random-data` | [`scripts/lib/random-data.ts`](../../scripts/lib/random-data.ts) (zero-dep) | **Unique inputs** you never assert exact values on: registration emails, org names, comments, BVA quantities. Defaults use `AGENT-TEST-` prefix so `/qa-seed-data teardown` sweeps them. |

The decision tree, JS recipes, and CSV-runner recipes live in [`.claude/agents/knowledge/execution/live-discovery.md`](../agents/knowledge/execution/live-discovery.md) — agents authoring or reviewing test cases consult that file first.

**Passwords are never literals in committed test-data.** Seed-CSV password columns (`test-data/b2b/users.csv`, `test-data/b2b/organization-memberships.csv`, `test-data/users/test-users.csv`, `test-data/users/agent-user-pool.csv`) carry a `{{VAR}}` token (e.g. `{{B2B_USER_PASSWORD}}`, `{{TEST_USER_PASSWORD}}`, `{{DEFAULT_TEST_PASSWORD}}`), resolved at seed time from `.env.local` by [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs) `resolvePassword()` (per-env via the `_${TEST_ENV}` suffix). Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in [`templates/.env.local.template`](../../templates/.env.local.template). `td:reconcile` secret-hygiene fails any bare password literal; a `{{VAR}}` token is clean (VCST-5406).

## Seed writeback — where runtime GUIDs land after a seed

Seeders resolve/create entities at runtime, then persist the **drifting platform GUIDs** so `@td()` keeps resolving. The split:

- **Business keys / SKUs / codes / names** stay in the **committed CSV** (they don't drift; they're the seed *input*). SKU-, code-, and business-key-backed aliases (`PROD_*`, `COUPON_*`, `STORE_*`, `FC_*`, `PRICELIST_*`, `USER_*`, `WL_*`, `ORG_*.id`, `BOPIS_*.id`) need **no writeback** — their id columns already hold stable keys.
- **Runtime platform GUIDs** are written to **`test-data/aliases.{TEST_ENV}.json`** by [`scripts/lib/seed-common.mjs`](../../scripts/lib/seed-common.mjs) — `writeEnvAliasOverride(updates)` (inline aliases) and `syncEnvAliases(fileKey, byBusinessKey)` (CSV-backed: matches aliases by `file`+`filter`, writes only the id fields they declare). The resolver ([`test-data-resolver.ts`](../../scripts/lib/test-data-resolver.ts)) layers this env file **field-by-field** over `aliases.json`, so the override supplies only the GUID while `code`/`name`/`sku` fall back to the base CSV.
- **Primary env `vcst` is never auto-written** — its canonical GUIDs stay curated in `aliases.json` (b2b user `platform_id` refreshes the committed `users.csv`). Every other env (`localhost`, `vcptcore`, `virtostart`, customer envs) gets `aliases.{env}.json`; `localhost` is gitignored (drifts each fresh-DB provision), the rest are committed so a team shares them.
- **Wired today:** configurable-products (`product_id_guid` + `configuration_id`), b2b organizations + users (`platform_id`), virtual-catalog root. **Not seeder-written** (captured out-of-band): the `BOPIS`/loyalty inline snapshots and the live-discovered `products/standard` pool (resolved by `code:`).
- Seeders **no longer write `_seed-results-*.json` reports** — runtime GUIDs live in `aliases.{env}.json`, business keys in the CSVs.

## Canonical references (single sources of truth)

- **[`.claude/agents/knowledge/execution/live-discovery.md`](../agents/knowledge/execution/live-discovery.md)** — decision tree, JS + CSV-runner recipes, anti-patterns, parallel-run isolation (the agent-facing summary of this rule)
- **[`.claude/skills/testing/qa-postman/test-data-fixtures.md`](../skills/testing/qa-postman/test-data-fixtures.md)** — `@td()` resolver contract, fixture directory layout, account/catalog/address conventions, integration patterns
- **[`test-data/aliases.json`](../../test-data/aliases.json)** — alias registry (`_meta.version` is the contract version)
- **[`test-data/README.md`](../../test-data/README.md)** — directory layout and seed-results index
- **[`scripts/lib/test-data-resolver.ts`](../../scripts/lib/test-data-resolver.ts)** — `@td()` resolver implementation (CSV-backed + inline aliases)
- **[`scripts/lib/live-discover.ts`](../../scripts/lib/live-discover.ts)** — typed xAPI discovery primitives (catalog root, products, addresses, cart, coupons)
- **[`scripts/lib/random-data.ts`](../../scripts/lib/random-data.ts)** — zero-dep random generators (emails, org names, SKUs, quantities, comments)
- **[`scripts/validate-td-refs.ts`](../../scripts/validate-td-refs.ts)** — STATIC validation (`npm run td:validate` — verifies every `@td()` reference resolves + flags hardcoded GUIDs)
- **[`scripts/seed-data/reconcile-test-data.mjs`](../../scripts/seed-data/reconcile-test-data.mjs)** — LIVE reconciliation (`TEST_ENV=<env> npm run td:reconcile` — probes the platform: catalog root exists, `.env.{ENV}` user roles have accounts, B2B users are org-scoped with no global roles, no password literals in committed CSVs)
- **[`scripts/lib/user-roles.mjs`](../../scripts/lib/user-roles.mjs)** — canonical test-user ROLE → `.env.{ENV}` var registry (identity from `.env.{ENV}`, secrets from `.env.local`); consumed by the user seeders + `td:reconcile`
- **[`.claude/agents/knowledge/api/graphql-test-cases-runner.md`](../agents/knowledge/api/graphql-test-cases-runner.md)** — runner-native CSV grammar where `@td()` and `[GQL-CAPTURE]` are consumed natively
- **[`.claude/agents/knowledge/api/graphql-schema.md`](../agents/knowledge/api/graphql-schema.md)** — schema reference; verify field names before authoring queries that consume `@td()` values or `live-discover` recipes

## Why hardcoded fixtures rot

- Catalogs are re-seeded → product IDs change → tests silently fail or skip
- B2B orgs are re-created → contact/user/role IDs change
- Virtual-catalog root IDs migrate (the active root moved on 2026-04-30; see `feedback_storefront_virtual_catalog_link` memory)
- Prices, coupon codes, and addresses get reseeded with each sprint

`@td()` indirection means the alias is stable; the CSV row gets updated when the underlying data changes, and every consumer follows automatically.

## Where this rule is enforced

| Skill / Agent / File | How it enforces |
|----------------------|-----------------|
| [`/qa-test-cases-generator`](../skills/qa-methodology/qa-test-cases-generator/SKILL.md) | "Always resolve test data, never hardcode" rule + Step 5 self-review check |
| [`/qa-checklist`](../skills/testing/qa-checklist/SKILL.md) | Cross-Skill References section + checklist items resolve entities via `@td()` |
| [`/qa-postman`](../skills/testing/qa-postman/SKILL.md) | [`test-data-fixtures.md`](../skills/testing/qa-postman/test-data-fixtures.md) + Mistake #14 in [`common-mistakes.md`](../skills/testing/qa-postman/common-mistakes.md) |
| [`/qa-api`](../skills/testing/qa-api/SKILL.md) | "Test Data — Resolve via `@td()`, Don't Hardcode" section |
| [`/qa-seed-data`](../skills/testing/qa-seed-data/SKILL.md) | Seed runs write IDs back into `test-data/` so downstream `@td()` references resolve; `td:validate` (static) + `td:reconcile` (live, per env) are the post-seed gates |
| [`/qa-generate-data`](../skills/testing/qa-generate-data/SKILL.md) | Authors fixtures from scratch with no system GUIDs (blank `*_guid`/`platform_id`, `seeded=false`), business-key aliases, `AGENT-TEST-` prefix; ends on a mandatory `validate-td-refs.ts` green gate |
| Regression suite CSVs | `Test_Data` columns use `{{VAR}}` and `@td()` exclusively |
| `scripts/graphql-runner.ts` | Resolves `@td()` natively before sending GraphQL ops; rejects unresolved tokens at lint time |

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
3. Run `npx tsx scripts/validate-td-refs.ts` to confirm resolution
4. If neither works, the value is environmental — promote it to `.env` and reference as `{{VAR}}`

A literal in a Steps/Test_Data column without one of these resolvers is a review failure (see `/qa-review-tests` Dimension 6 — Data Validity).
