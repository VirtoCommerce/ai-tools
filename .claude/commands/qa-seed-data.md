---
description: "Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs — full or by profile"
argument-hint: "minimal | catalog | b2b | pricing | full | teardown"
disable-model-invocation: true
---

# /qa-seed-data — Test Data Generation & Teardown

Seed a complete test environment via REST API using Postman MCP, or tear down previously created test data.

## Usage
```
/qa-seed-data minimal     # 1 product + price + inventory (fastest)
/qa-seed-data catalog     # Rich catalog: 5 products, categories, multi-currency
/qa-seed-data b2b         # Organization + 3 users with roles
/qa-seed-data pricing     # Price lists, tiers, multi-currency
/qa-seed-data full        # All profiles combined
/qa-seed-data teardown    # Delete all AGENT-TEST-* entities
```

---

## Execution

Read the skill definition and its references, then follow the workflow exactly:

1. Read `.claude/skills/testing/qa-seed-data/SKILL.md`
2. Read `.claude/skills/testing/qa-seed-data/test-data-generation.md`
3. Read `.claude/skills/testing/qa-postman/postman-collection-guide.md`
4. Execute the 6-step workflow from the skill (Read → Reuse check → Environment → Build → Execute → Report)

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
| `qa-backend-expert` | Primary — builds and runs Postman collections |
| `qa-frontend-expert` | Verifies seeded data on storefront |
