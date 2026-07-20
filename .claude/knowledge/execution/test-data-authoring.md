# Test-Data Authoring — Seeder / Fixture / Validator How-To

The **how** of writing a test-data script for this repo. The **what/why/policy** is canonical in
[`.claude/rules/test-data.md`](../../rules/test-data.md) — this file points at it, never restates it.
Primary consumer: the **`test-data-engineer`** agent (and `/qa-generate-data` → `/qa-seed-data`). Read
this before authoring any new seeder, fixture, or validator.

> Non-negotiables live in the rule, not here: the four data layers (`{{VAR}}` / `@td()` /
> `live-discover` / `random-data`), the writeback rule, and **"Authoring rule for ANY new seeder
> (multi-env — MANDATORY)"**. If anything below appears to conflict with `test-data.md`, the rule wins.

---

## 1. Seeder skeleton (build on `seed-common.mjs`)

Every REST seeder imports the shared foundation — do not re-inline env load, auth, or prod-guard:

```js
import {
  assertSafeTarget, auth, api, log, verbose,
  ROOT, DRY_RUN, TEARDOWN, ONLY, writeEnvAliasOverride, syncEnvAliases, verifyRemoved,
} from '../lib/seed-common.mjs';

async function main() {
  assertSafeTarget();          // ENV_RISK=production → abort (prod guard, not a host allowlist)
  await auth();                // OAuth against BACK_URL
  if (TEARDOWN) { await teardown(); return; }
  // ...idempotent find-or-create per fixture...
  writeEnvAliasOverride(writeback);   // runtime GUIDs → aliases.<env>.json
  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
```

- **Idempotent find-or-create**: search by a deterministic business key (e.g. an `AGENT-TEST-…`
  number/code/name); reuse if present, create if missing, rebuild if drifted. Never blind-create.
- **Flags**: `--dry-run` (reads only — `api()` skips writes), `--verbose`, `--teardown`, `--only <key>`.
- **Naming**: prefix every created entity `AGENT-TEST-` so teardown sweeps exactly what you made.
- **`main()` must run only when executed, not on import** — put pure/importable logic in a separate
  `*-specs.mjs` so unit tests can import it without triggering a seed.

## 2. Writeback — runtime GUIDs go to the overlay, never the committed fixture

Per `test-data.md` §"Seed writeback": after creating an entity, persist its **runtime GUID** to
`test-data/aliases.<env>.json` (for **every** env, including `vcst`) — never into a committed CSV/JSON:

- `writeEnvAliasOverride({ ALIAS: { id, ... } })` — inline aliases.
- `syncEnvAliases(fileKey, byBusinessKey)` — CSV-backed aliases (matches by `file`+`filter`, writes
  only the id fields the alias declares).
- The resolver layers the overlay **field-by-field** over `aliases.json`, so the overlay supplies only
  the drifting id while business keys (code/sku/name/number/status) fall back to the committed source.
- An unseeded env resolves the id to `""` (a clear miss) — never another env's value.

## 3. Single source of truth — a side-effect-free `*-specs.mjs`

Drive the seeder from the committed CSV/JSON **or** from a side-effect-free `*-specs.mjs` — never a
second hand-maintained mirror. Importing the spec module must have **no side effects** (no env load,
no network, no `main()`), so both the seeder AND the validator AND the unit tests import it.
Reference impls: `configurable-specs.mjs`, `standard-specs.mjs`, and `orders-specs.mjs` (VCST-5482).

## 4. Fixture format — JSON-shaped-to-Swagger for nested, CSV for flat

The VCST-5482 convention:

| Entity shape | Format | Why |
|--------------|--------|-----|
| **Nested** — API body has arrays/objects (orders, quotes, configurable products, promotion reward trees) | **JSON shaped to the API request body** (`test-data/<domain>/*.json`) | seeder is a thin resolve-tokens → `POST`; no flattening/spec gymnastics; validate against the OpenAPI schema |
| **Flat** — one row = one entity (users, prices, stock, addresses, catalogs) | **CSV** (`test-data/<domain>/*.csv`) | human-editable in Excel; already wired through the `@td()` resolver and seeders |

Rule of thumb: nested API body → JSON; flat row → CSV.

**JSON fixtures + `@td()`**: register a **`json`-backed alias** in `aliases.json` so static fields
resolve from the fixture while the runtime id resolves from the overlay:

```json
"COMPLETED_ORDER": {
  "json": "orders/completed-order",
  "fields": { "number": "number", "status": "status", "id": "id" },
  "notes": "static fields from the fixture; runtime id from aliases.<env>.json (npm run seed:orders)"
}
```

The resolver (`scripts/lib/test-data-resolver.ts`) handles three alias kinds: **inline** (`_inline:true`),
**CSV-backed** (`file`+`filter`+`fields`), and **JSON-fixture** (`json`+`fields`→dotted JSON path).
The env overlay wins field-by-field for all three, which is how the runtime `id` overrides the fixture.

Fixtures carry **`{{VAR}}`** tokens for per-env values (STORE_ID, USER_EMAIL) — resolved at seed time.
They do **not** use `@td()` (that's for suite CSVs). To point line items at **real catalog products**
that exist on the target env, live-discover them at seed time and overlay their id/sku/name onto the
fixture items (see `discoverCatalogProducts` in `seed-common.mjs` + `applyCatalogItems` in
`orders-specs.mjs`) — env-resilient, never hardcoded.

## 5. Drift-guard validator (`td:validate:<domain>`)

Every new seeder ships a STATIC validator (no network) that fails CI on drift. Pattern:
`validate-loyalty-data.mjs`, `validate-orders-data.mjs`. It asserts:

- the committed fixture matches the `*-specs.mjs` source (business fields, status/number),
- **no runtime GUID leaked into the committed CSV/JSON** (the `GUID_RE` scan),
- (informational) the `vcst` overlay carries the ids so `@td()` resolves today.

For JSON fixtures, validate the body against the module's **OpenAPI schema** (reuse the
`validate-graphql-fixtures.ts` + `zod` precedent). Wire it as `td:validate:<domain>` in `package.json`.

## 6. Teardown symmetry

A reverse `--teardown` deletes **only** `AGENT-TEST-` entities and ends with a `verifyRemoved`
zero-residue assert. Delete bottom-up (children before parents; orders/quotes before the products/users
they reference). Register the seeder in `seed-bootstrap.mjs` — both the forward `STEPS` (by `priority`)
and the reverse `TEARDOWN_STEPS`.

## 7. Unit tests (`scripts/unit/<name>.test.mjs`)

Test the **pure** logic from `*-specs.mjs` (body/row mapping, token resolution, transition/status
rules, the validator's shape check) with the node test runner via `tsx` — no env, no network. Mock the
HTTP layer if you must test a seeder function (see `scripts/unit/seed-b2b-fixtures.test.mjs` `__setApi`
pattern). Run by `npm test`. Green is a gate.

## 8. npm wiring + bootstrap

```jsonc
"seed:<domain>": "node scripts/seed-data/seed-<domain>.mjs",
"seed:<domain>:teardown": "node scripts/seed-data/seed-<domain>.mjs --teardown",
"td:validate:<domain>": "node scripts/seed-data/validate-<domain>-data.mjs"
```

Add the seeder to `seed-bootstrap.mjs` `STEPS` (with a `priority` reflecting the dependency graph) and
`TEARDOWN_STEPS` (reverse). Mark `required: false` when it depends on an optional module (e.g. quotes
need the Quote module deployed + `Stores.EnableQuotes`).

## 9. Gate before hand-off

`npm test` · `npm run td:validate` · `npm run td:validate:<domain>` · a `--dry-run` seed — all green.
Then delegate the **live** run (real seed + suite verification) to `qa-backend-expert` /
`qa-frontend-expert`; the `test-data-engineer` agent has no browser.

## Worked example — VCST-5482 order/quote states

`orders-specs.mjs` (spec: states, status/shipment targets, `finalizeOrderBody`/`finalizeQuoteBody`,
`applyCatalogItems`, `validateFixtureShape` — all pure) ← imported by `seed-order-states.mjs` /
`seed-quotes.mjs` (thin POST) + `validate-orders-data.mjs` (drift-guard) + `scripts/unit/*.test.mjs`.
Fixtures `test-data/orders/*.json` + `test-data/quotes/*.json` (Swagger-shaped, no GUIDs). Aliases
`COMPLETED_ORDER` / `SHIPPED_ORDER` / `PROCESSING_ORDER` / `QUOTE_WITH_ADMIN_RESPONSE` / `ACCEPTED_QUOTE`
(`json`-backed). npm: `seed:orders` / `seed:quotes` / `td:validate:orders`.
