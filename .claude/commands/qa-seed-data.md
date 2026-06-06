---
description: "Seed/teardown all test data via repo seed scripts (npm run seed) or Postman MCP: catalogs, products, pricing, inventory, B2B orgs/users, configurable products"
argument-hint: "minimal | catalog | b2b | pricing | full | teardown"
disable-model-invocation: true
---

# /qa-seed-data — Test Data Generation & Teardown

Seed a complete test environment, or tear down previously created test data. Two execution paths: **repo seed scripts** (`npm run seed*` + specialized `.mjs` seeders — direct REST/xAPI, the practical default) or **Postman MCP** (reusable collections). The skill's "Seeding Tooling — Two Execution Paths" section is the canonical map of every seeder.

## Usage
```
/qa-seed-data minimal     # 1 product + price + inventory (fastest)  → npm run seed:minimal
/qa-seed-data catalog     # Rich catalog: 5 products, categories, multi-currency → npm run seed:catalog
/qa-seed-data b2b         # Organization + users with roles → node scripts/seed-b2b-fixtures.mjs
/qa-seed-data pricing     # Price lists, tiers, multi-currency
/qa-seed-data full        # Seed the ENTIRE test-data/ directory so every @td() resolves → npm run seed:full + CFG/B2B seeders
/qa-seed-data teardown    # Delete ephemeral seeded entities (match teardown to the path that seeded)
```

---

## Execution

Read the skill definition and its references, then choose the path:

1. Read `.claude/skills/testing/qa-seed-data/SKILL.md` — start with **Seeding Tooling — Two Execution Paths** to pick a script vs Postman.
2. **Path A (script — fastest):** run the relevant `npm run seed*` / `node scripts/seed-*.mjs` from the tooling table, then write IDs back to `test-data/` and run `npx tsx scripts/validate-td-refs.ts`.
3. **Path B (Postman MCP):** read `.claude/skills/testing/qa-seed-data/test-data-generation.md`, then `.claude/skills/testing/qa-postman/SKILL.md` (index) + sub-guides (`mcp-tools.md`, `collections-and-requests.md`, `test-data-fixtures.md`), and execute the 6-step workflow (Read → Reuse check → Environment → Build → Execute → Report).

## Test Data Directory

Seeded entity data, CSVs, and `@td()` alias references live in `test-data/`. See `test-data/README.md` for:
- `aliases.json` — `@td()` token registry used by regression suite CSVs
- `b2b/` — seeded orgs, contacts, users with live platform IDs (`_seed-results-orgs.json`)
- `users/agent-user-pool.csv` — 3 dedicated users for parallel agent browser slots
- `payment/test-cards.csv` — processor-specific test cards
- `test-data/b2b/load-test-data.js` — JS loader module for scripts

After seeding, update the relevant CSVs in `test-data/` with new platform IDs so downstream suites can reference them via `@td()`.

## Safety

- **Never seed into production** — verify `BACK_URL` before executing
- **Always use `AGENT-TEST-` prefix** — enables safe teardown
- **After seeding, wait for reindex** (~30-60s) before running storefront tests

## Agents

| Agent | Role |
|-------|------|
| `qa-backend-expert` | Primary — authors Postman seed collections via MCP, then executes them via Newman / Postman CLI; writes seeded IDs back into `test-data/` |
| `qa-frontend-expert` | Verifies seeded data on storefront |
