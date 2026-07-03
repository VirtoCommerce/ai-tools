---
description: "Seed/teardown all test data via repo seed scripts (npm run seed) or Postman MCP: catalogs, products, pricing, inventory, B2B orgs/users, configurable products, loyalty, promotions, BOPIS. Environment-agnostic (any TEST_ENV); verify with td:reconcile."
argument-hint: "bootstrap | minimal | catalog | company-users | pricing | inventory | loyalty | promotions | bopis | configurable | users | full | teardown"
disable-model-invocation: true
---

# /qa-seed-data — Test Data Generation & Teardown

Seed a complete test environment on **any** environment (fresh `/qa-local-env` localhost, vcst, vcptcore, virtostart, a customer env — selected by `TEST_ENV`), or tear down previously created test data. Two execution paths: **repo seed scripts** (`npm run seed*` + specialized `.mjs` seeders — direct REST/xAPI, the practical default) or **Postman MCP** (reusable collections). The skill's "Seeding Tooling — Two Execution Paths" section is the canonical map of every seeder.

## Usage
```
/qa-seed-data bootstrap   # ⭐ ONE command, any env: preflight (member index + bridge FFC) then all 13 phases (common scripts) in explicit priority order → npm run seed:bootstrap  (tear down all: npm run seed:bootstrap:teardown)
/qa-seed-data minimal     # Unified required-only chain → npm run seed:minimal (= seed:bootstrap --skip-optional)
/qa-seed-data catalog     # Unified catalog subset (structure→categories→products→pricing→inventory) → npm run seed:catalog
/qa-seed-data company-users  # Orgs + contacts + org-scoped role memberships (VCST-5028) → npm run seed:b2b (memberships-only: npm run seed:b2b:memberships)
/qa-seed-data pricing     # Price lists, tiers, multi-currency → npm run seed:pricing
/qa-seed-data inventory   # Fulfillment centers + stock → npm run seed:inventory
/qa-seed-data loyalty     # Loyalty programs + product factors + VIP/Wholesale users → npm run seed:loyalty
/qa-seed-data promotions  # Marketing promotions + rewards + coupons → npm run seed:promotions
/qa-seed-data bopis       # BOPIS pickup locations (linked to an existing FFC) → npm run seed:bopis
/qa-seed-data configurable# All configurable products (CFG-012..032 + CFG-FILE) → npm run seed:configurable (--group base|conditional|default|bike filters)
/qa-seed-data users       # Personal storefront accounts + .env.{ENV} role identities (USER/EUR_USER/LOYALTY_*) → npm run seed:users
/qa-seed-data full        # Seed the ENTIRE test-data/ directory so every @td() resolves → npm run seed:full + CFG/B2B + seed:users
/qa-seed-data teardown    # Delete ephemeral seeded entities (match teardown to the path that seeded)
```

**Tear down everything:** `npm run seed:bootstrap:teardown` (reverse-order sweep of all domains). **Per domain** (each verifies zero residue): `seed:teardown` · `seed:b2b:teardown` · `seed:users:teardown` · `seed:pricing:teardown` · `seed:inventory:teardown` · `seed:loyalty:teardown` · `seed:promotions:teardown` · `seed:bopis:teardown` · `seed:products:teardown` · `seed:configurable:teardown` · `seed:properties:teardown` · `seed:white-labeling:teardown`. **All teardowns delete ONLY `AGENT-TEST` entities** (name prefix / exact seed email / own catalog / bookkeeping id — never a broad match).

## Verify (any env)
After seeding, confirm the data is really there for this `TEST_ENV`:
```
npm run td:validate      # static: every @td() resolves + no hardcoded GUIDs (CI gate)
npm run td:validate:b2b  # static: B2B CSVs consistent — every org has a valid address; every seeded user → contact → org → role → membership
npm run td:reconcile     # live: catalog root, user roles, B2B org-scoped memberships (no global roles), secret hygiene
```

---

## Execution

Read the skill definition and its references, then choose the path:

1. Read `.claude/skills/testing/qa-seed-data/SKILL.md` — start with **Seeding Tooling — Two Execution Paths** to pick a script vs Postman.
2. **Path A (script — fastest):** for a fresh/arbitrary env start with `npm run seed:bootstrap`; otherwise run the relevant `npm run seed*` / `node scripts/seed-*.mjs` from the tooling table. Then write IDs back to `test-data/`, run `npm run td:validate` (static gate) and `npm run td:reconcile` (live gate) to confirm the data exists on this env.
3. **Path B (Postman MCP):** read `.claude/skills/testing/qa-seed-data/test-data-generation.md`, then `.claude/skills/testing/qa-postman/SKILL.md` (index) + sub-guides (`mcp-tools.md`, `collections-and-requests.md`, `test-data-fixtures.md`), and execute the 6-step workflow (Read → Reuse check → Environment → Build → Execute → Report).

## Test Data Directory

Seeded entity data, CSVs, and `@td()` alias references live in `test-data/`. See `test-data/README.md` for:
- `aliases.json` — `@td()` token registry used by regression suite CSVs
- `b2b/` — seeded orgs, contacts, users (business keys in CSVs; platform GUIDs via `@td()`)
- `users/agent-user-pool.csv` — 3 dedicated users for parallel agent browser slots
- `payment/test-cards.csv` — processor-specific test cards

After seeding, runtime platform IDs resolve via `@td()`: on `vcst` from `aliases.json` + the CSVs; on other envs the seeders write them to `aliases.{env}.json` (see `.claude/rules/test-data.md` §Seed writeback).

## Safety

- **Prod is blocked by config, not hostname** — seeders refuse to run when `ENV_RISK=production` (override `--allow-admin-writes-on-prod`); they run freely on dev/test/staging/localhost. Set `ENV_RISK` per env in `.env.{TEST_ENV}`.
- **Environment is `TEST_ENV`** — `TEST_ENV=localhost npm run seed:bootstrap`, `TEST_ENV=vcst …`, etc. Credentials resolve from `.env.{ENV}` + `.env.local` (per-env password variants via the `_${ENV}` suffix). Never hardcode passwords — see `scripts/lib/user-roles.mjs`.
- **Always use `AGENT-TEST-` prefix** — enables safe teardown (each `*:teardown` verifies zero residue).
- **After seeding, wait for reindex** (~30-60s) then run `npm run td:reconcile` before storefront tests.

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary — authors Postman seed collections via MCP, then executes them via Newman / Postman CLI; writes seeded IDs back into `test-data/` |
| `qa-frontend-expert` | Verifies seeded data on storefront |
