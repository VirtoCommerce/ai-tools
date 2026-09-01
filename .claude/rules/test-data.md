# Test Data — Resolver, Registry, and No-Hardcode Policy

Cross-skill rule for any test artifact authored in this repo (test cases, Postman collections, regression CSVs, GraphQL runner cases, agent prompts, bug-repro snippets). **Test data is resolved at runtime, never hardcoded.**

## GOLDEN RULE — never hardcode in scripts (applies beyond test data)

**If a value has a source of truth, read it from there. Never transcribe it into our code.** This covers test data (the rest of this file) *and* every other constant a script measures against: design tokens, spacing scales, breakpoints, component sizes, library defaults, version numbers.

A transcribed constant is correct exactly once — it goes stale at the next redesign, and it fails *silently* by manufacturing false positives rather than erroring. Worked example: `scripts/lib/measure-layout.ts` hardcoded a 14-value spacing grid `{0,4,8,…,96}` while vc-frontend's real scale had **39** values. The UI kit's own `vc-button.vue` uses 10 px / 14 px padding, so the canonical button "violated" our grid — run REG-2026-07-24-2121 emitted ~7 phantom BL-UI-002 failures and the runner concluded there was a "site-wide design-token issue" that did not exist.

The pattern to follow:

| Step | What | Example |
|------|------|---------|
| 1 | **Generator** reads the real source, emits a committed `*.generated.ts` | `scripts/maintenance/sync-design-tokens.mjs` → `scripts/lib/design-tokens.generated.ts` (`npm run tokens:sync`) |
| 2 | **Go all the way up the chain** — even a library's own defaults come from the pinned version, not from memory | Tailwind's default spacing is fetched from the exact `tailwindcss` version vc-frontend's `package.json` declares |
| 3 | **Drift guard as a CI gate** — re-derive and fail on mismatch | `npm run tokens:check` (same ratchet as `td:validate` / `scope:validate`) |
| 4 | **Never pass on an unreachable source** — exit non-zero, don't silently succeed | `tokens:check` exits `2` on network/checkout failure |
| 5 | **Docs must point at the constant, not restate it** — a number copied into an agent/skill/oracle file rots identically | `business-logic.md` BL-UI-002 and `qa-design` reference `SPACING_GRID`, they don't list values |

Net effect: a redesign surfaces as **one loud gate failure** instead of a wave of phantom test failures.

## SECOND RULE — a fixture is designed from the CHAIN'S QUESTION, not from the screen

The GOLDEN RULE above governs *where a value comes from*. This one governs *which values exist at
all*, and it is the rule whose absence is expensive in a way no validator currently detects: a
fixture can satisfy every `@td()`, every drift guard and every secret-hygiene check, and still make
the feature's central question **undecidable**.

**The test is falsifiability, per link.** For each link of the feature's value chain
(`/qa-test-design` `test-design-techniques.md` §1a), ask: *if this link were implemented wrong, would
THIS data make the case fail?* If both the right and the wrong implementation produce the same
observation, the fixture is not a fixture — it is a coincidence, and the case built on it is a
vacuous pass.

- **Design the fixture from the question, then check the question is decidable.** "Is the goal
  measured against the order's TOTAL or against its merchandise value?" is only answerable if the
  seeded order has shipping, tax or a discount. An order of exactly $30.00 with none of them answers
  nothing — both readings predict `$30.00`.
- **Divergence is the property that makes a fixture discriminating.** Two quantities that must not be
  confused have to be *different* in the data; two rankings that must not collapse have to *disagree*;
  a variant that must behave differently from its sibling has to be seeded as a real pair. This is
  already the reasoning behind `td:validate:variation-stock` (quantities must DIVERGE), the
  `by-units`/`by-revenue` rankings in `td:validate:sales-rep-stats` (they must not agree), and the
  `PerSku ALL` / `ANY` pair. Generalise it: **equal values on both sides of a distinction under test
  are a data defect, not a neutral choice.**
- **State the fixture's own limits where they exist.** If a link's question is not decidable from the
  seeded state, say so at the fixture — in the spec module's rationale and in the case's
  `Preconditions` — rather than letting a green case imply an answer it cannot give.
- **Constrain live-discovery on every dimension the feature is sensitive to.** `live-discover` is the
  right default for identity (`knowledge/execution/live-discovery.md`), but it selects on
  availability, not on suitability. Discovering "any two buyable products" for a money-summing surface
  will eventually hand you one priced in EUR and one in USD. Pin currency, price shape, stock and
  catalog scope when the feature reads them; leave them free when it does not.
- **Seed through the mechanism where the mechanism is what is under test.** An entity written straight
  into storage bypasses the very handler the chain depends on. An API-shaped seed is correct for
  *arranging* a precondition and wrong for *proving* the link that arranges it — the journey case
  places a real order.

**Worked example — Loyalty Missions (VCST-5320/5346).** The fixture set was large, carefully
documented and correct against every existing guard: 2 042 lines of spec module, no committed GUIDs,
overlay write-back per env, its own `td:validate:cfg`-style drift guard and unit tests. It was
designed from the **screens** — fixtures that render a partial card, a completed card, a zero-target
card, a zero-reward card. Two consequences followed directly:

1. Its seeded orders were flat $30 with no shipping, tax or discount, so the central mechanism
   question — *does an `OrderValueGoal` accrue `order.Total` or merchandise value?* — was **not
   decidable from the data**. The exploratory report had to record it in as many words: *"the only
   in-window orders were API-seeded at exactly $30 … `$30.00 spent` is consistent with both
   readings."* The defect was ultimately found by reading source, not by any of 127 cases.
2. Its featured-SKU targets were live-discovered with no currency constraint, so the modal was seeded
   with a €455 row and a $25 row. That produced a mixed-currency subtotal finding which was filed and
   then **rejected** — reviewer time spent on an artefact of the fixture rather than on the feature.

A fixture set can be immaculate by every rule in this file and still test nothing. Design it from the
chain.

## Resolving a variable: through `process.env`, never off a layer or the curated export

A role's identity and its secret routinely live in **different layers** — the loader is
`.env.defaults` → `.env.${TEST_ENV}` → `.env.local`, and e.g. `LOYALTY_VIP_USER_EMAIL` sits in
`.env.defaults` while `LOYALTY_VIP_USER_PASSWORD` sits in `.env.local`, with nothing in the
environment-named file between them. So **grepping `.env.${TEST_ENV}` finds nothing and looks
conclusive** — it is the file named after the environment, which is exactly why it reads as
authoritative.

The second half of the trap is worse: `config.js` exports a **curated** `env` object, not the whole
environment. A key it does not carry comes back `undefined` — **indistinguishable from a variable
that is genuinely unset**, which is the conclusion it will be mistaken for. Measured 2026-08-28: a
working fixture account was reported as having empty credentials on exactly this basis, and the
suite that authenticates as that role was very nearly filed as broken.

**Resolve through `process.env` after importing `config.js`** (the import runs the layered loader);
use the curated `env` export only for keys you have confirmed it carries. Never conclude a variable
is unset from a single layer or from the curated object.

## DISPOSABLE FIXTURES — an observation must outlive the fixture it was made on

Per-run fixtures are the right design: a terminal state (a completed mission, a consumed coupon,
a shipped order) stops accruing, so a case that must observe an ADVANCE needs its own freshly-minted
entity or it passes once and never again. But the same property has a second consequence that is
easy to miss, because **nothing about it fails**.

**A re-seed between the measurement and the audit destroys the evidence silently.** Nothing errors,
every guard stays green, the validator still reports a healthy fixture set — and the observation
simply stops being checkable, because the entity it was made on no longer exists. This is not a
value that misleads (the family of hazards in `qa-test-cases-generator` §Rules); it is a **fact that
quietly ceases to exist**, which is why no check catches it.

Measured 2026-09-01: three `P0-revenue` oracle candidates were reported grounded on live
observations — real order numbers, coherent balances — taken on fixture generation
`…134918-9421`. By the time they were audited the overlay named `…153647-7b25`, and every account
read clean: zero balance, zero ledger rows, missions at `InProgress 0%`. The report the observations
came from *said* the fixture had been re-seeded; the sentence was relayed along with the numbers and
read past. The contradiction was caught only by re-reading the state and finding the seed-time
baselines (`balance_at_seed 30850`, `progress_status_at_seed InProgress`) matched the *pre*-order
figures.

Two rules follow:

- **An observation on a disposable fixture must be captured with enough identifying detail to be
  re-derived — the run handle, the account and entity ids, the order numbers — or captured again by
  whoever will cite it.** A number without its generation is not evidence, it is a memory.
- **Do not re-seed between producing an observation and its being consumed.** Leave the fixture
  consumed so the post-state can be read directly; whoever needs fresh fixtures re-seeds *after*,
  in that order. A run that writes durable artifacts (a `REG-*` run id with per-case results and
  traces) is the strongest form, because the evidence is then tied to the generation by construction.

### The scope of "isolated" is per SUITE, not per seed — say which one you mean

A fixture created fresh **every seed** is still shared by **every suite that runs after that seed**.
Those are different guarantees, and the word *isolated* on its own will be read as the stronger one.

Measured 2026-09-01: `075d` (loyalty missions, backend) lost 5 of 34 cases
(`MSN-019/026/027/029/033`) to fixtures another suite had already eaten. The overlay recorded
`MSN_E2E_USER_001` at `balance_at_seed 0` and `MSN_E2E_ORDERCOUNT` at `progress_status_at_seed
InProgress`, seeded 18:48. A live probe at 20:44 read **balance 7561**, that mission
`Completed / currentValue 2 / completedDate 19:04:40Z`, and **18 of 35** missions already complete.
19:04 falls inside suite **083d**'s window (18:53–19:32) — a different suite, in a different run,
placing real orders on the same accounts. `MSN-027`'s own preconditions call that account "a per-run
isolated account", and it is: isolated from its siblings *inside 075d*. Nothing made it isolated from
`083d`, and nobody reading the sentence asked which scope was meant.

`MSN-026` is the terminal form: it reads the **shared** `LOYALTY_VIP_USER`, whose `MSN_PERSKU_ALL`
mission carries `completedDate 2026-08-28`. Mission progress is monotonic with no reset path, so that
case is a permanent false red on that account — not a stale one, an unfixable one.

Four rules:

- **Qualify the word.** A fixture comment says *per seed*, *per run*, or *per suite* — never bare
  "isolated". The unqualified form is what let this ship.
- **Two suites consuming one disposable fixture set must be serialised with a re-seed between them**
  (`seed → 075d → seed → 083d`), or each given its own accounts. Order-of-execution is not a plan.
- **Verify the recorded baseline against live in pre-flight.** The `*_at_seed` fields are already
  written into `aliases.<env>.json` and **nothing reads them back**. The sibling gate already exists
  in shape — `td:reconcile` check **[11]** probes overlay *GUID* liveness ("does the entity still
  exist?"); the missing one is *state* liveness ("is it still in the state we recorded?"). One
  pre-flight line replaces N false reds.
- **This collision is invisible to every existing guard.** `td:validate` passes, the overlay is
  well-formed, the GUIDs all resolve — the entity exists, it is merely in the wrong state. Only
  comparing recorded state to live catches it, which is why nothing did.

When triaging a suite failure, check fixture generation and consumption timestamps **before**
reaching for a product explanation; here that ordering settled 5 of 11 failures in a single query.

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
- **standard-products source model:** `seed-standard-products.mjs` has ONE CSV source of truth — `test-data/products/test-products.csv` — and creates every row flagged **`seeded=true`** (the flat checkout fixtures incl. the loyalty ProductPoints SKUs; other rows are `@td`-only references to live/manual products). `scripts/seed-data/products/standard-specs.mjs` (side-effect-free) declares the column→field mapping (`CSV_SOURCE`), create-time overlays a flat row can't express (`SPEC_OVERLAYS` — MOQ/pack/tier), and the imported fixtures to discover (`DISCOVERED_FIXTURES` — `standard.csv` STD-*, captured to the overlay by `code`, never created). It also owns the **multi-currency** model (`buildCurrencyPriceSets` / `priceListName` — a row's optional `price_eur` column drives a SECOND, EUR-currency pricelist `SEED-<date>-Standards-EUR` alongside the USD one, because a pricelist is single-currency platform-side; without it a storefront currency switch collapses every AGENT-TEST line to `0.00` with a disabled qty stepper) and the **slug/URL** rules (`productSlug` / `storefrontPathForAdHoc` — the committed `product_slug` / `storefront_url` columns are the store-RELATIVE path the seeder actually puts the product on, so a case navigates `{{FRONT_URL}}@td(ALIAS.url)` instead of hand-composing `/product/<sku>`, which renders a client-side 404 — HTTP 200 SPA soft-404). Both are **derived, not hand-maintained**: the guard recomputes them from the same rules the seeder applies. The CSV carries NO GUIDs; `npm run td:validate:standard` (`validate-standard-data.mjs`) drift-guards both `standard.csv` and `test-products.csv` — no GUID leak, discovered/overlay coherence, sale/`price_eur` price coherence, derived slug/url equality + store-relativity, no stale `"Template only — NOT seeded"` note on a `seeded=true` row, and **`.env.*` ↔ CSV SKU reconciliation** (see below). **Separate system, NOT this seeder:** the normalized relational catalog (`test-data/catalogs/*.csv` + `products/products-full.csv` + `pricing/*.csv` + `inventory/stock-levels.csv`) driven by the legacy `seed-test-data.js` — foreign-keyed, do not fold in.
- Seeders **no longer write `_seed-results-*.json` reports** — runtime GUIDs live in `aliases.{env}.json`, business keys in the CSVs.
- **A business key belongs to `@td()`, not to `.env.<env>`.** A SKU / code / name is env-INVARIANT: the seeder creates the same one on every env. Where a legacy `{{VAR}}` mirror of a fixture SKU still exists (`OOS_SKU`, `LOW_STOCK_SKU`, `PACK_SIZE_SKU`, `TIER_PRICED_SKU`), the CSV row is the single source of truth and `@td(PROD_*.sku)` is the canonical reference — prefer it in new cases. The only legal per-env variation is **present** (seeded here) vs **empty** (not provisioned here — the signal cases branch on: *"if `{{OOS_SKU}}` is not provisioned, skip this case"*). A **non-empty** value that disagrees with the CSV fails `npm run td:validate:standard` (check [7]), which scans every committed `.env.*` layer. This closes the 2026-07-25 drift where `.env.vcst` pointed three of them at one-off products that no longer existed on the env while three other env layers already used the canonical keys.
- **A fixture's PDP URL is data, not something a case composes.** `/product/<sku>` does NOT resolve on the storefront (client-side 404 behind HTTP 200 — an SPA soft-404, so a naive status check passes). Seeded fixtures expose a `url` (and `slug`) alias field carrying the store-relative SEO path; a case writes `{{FRONT_URL}}@td(ALIAS.url)`. Hand-building a PDP path is a `feedback_never_invent_storefront_routes` violation.

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
| Per-domain drift guards | `npm run td:validate:b2b` (`validate-b2b-data.mjs`) + `td:validate:cfg` (`validate-configurable-data.mjs`) + `td:validate:standard` (`validate-standard-data.mjs`) — fail if a runtime GUID sits in a committed CSV, and (cfg) if CSV business fields drift from `SPECS`, and (standard) if a discovered fixture / `SPEC_OVERLAYS` key is incoherent with the CSVs, if a committed `product_slug`/`storefront_url` no longer matches the seeder's own slug rules or stops being store-relative, if a `price_eur` would be silently dropped at seed time, if a `seeded=true` row still carries a stale `"Template only — NOT seeded"` recipe, if any committed `.env.*` layer's non-empty fixture `*_SKU` disagrees with its CSV row, or if a `DISCOUNT_RATIO_FIXTURES` row stops yielding its EXACT raw discount ratio / stops sitting on the 4-decimal rounding midpoint (VCST-5691: a one-cent price edit silently turns PRICE-065/PRICE-066 into vacuous passes, and the ratio must be re-derived in integer cents because float subtraction makes 200.00 - 175.31 = 24.689999999999998 and rounds the wrong way). New seeders SHOULD add a matching `td:validate:<domain>` guard (see the "Authoring rule for ANY new seeder" above). Also `npm run td:validate:sales-rep-stats` (`sales-rep/validate-sales-rep-stats-data.mjs`) — guards the Sales Rep **statistics** fixtures: the shaped top-seller order's line arithmetic and that its `by-units`/`by-revenue` rankings still DIVERGE (BL-SR-008), that each owned alias is registered with an empty `id` + the spec's business key, no GUID leak, that every spec'd org is pinned in `b2b/organizations.csv`, and that the `buildStatisticsWindows()` model (Monday-start week; `prevMonth`/`lastYear` = the same **day-span**) has not drifted. And `npm run td:validate:sales-rep` (`sales-rep/validate-sales-rep-data.mjs`) — guards the Sales Rep **rep** fixtures (`sales-rep/sales-reps.csv`): the exact column contract, no runtime GUID / password literal in the committed CSV (the three id columns must be EMPTY), one CSV-backed alias per row wired `id`→`contact_id`, unique keys + the `agent-test-*@example.com` sweep convention + `full_name == "first last"` (the seeder looks reps up BY full name), every served org pinned in `b2b/organizations.csv`, and the VCST-5367 saved-layout invariants: `SR_REP_LAYOUT` exists/seeded/serves ≥2 distinct orgs, and the **disposable-layout allowlist stays exactly `[SR_REP_LAYOUT]`** so a seeder can never wipe `SR_REP_PRIMARY`'s never-saved layout baseline (plus the `SalesRepLayout.{scope}[.{storeId}]` preference-name model). And two guards whose job is specifically to stop a fixture becoming VACUOUS — able to pass while testing nothing: `npm run td:validate:wishlists` (`wishlists/validate-wishlist-data.mjs`, VCST-5705) asserts the two-store wishlist fixture still names TWO different stores, TWO different products and TWO differently-named lists, keeps its password as a `{{VAR}}`, derives both storefront urls, and leaves `store_a_id`/`store_b_id`/the contact/user/wishlist ids BLANK in the CSV (a store id is per-env, so committing one is the same class of bug as committing a GUID) — plus it FAILS if the seeded overlay ever shows both wishlists in one store; and `npm run td:validate:variation-stock` (`inventory/validate-variation-stock-data.mjs`, VCST-5546) asserts the variation SKU is distinct from its master, that the two stock quantities DIVERGE (equal quantities make "its own record, not the master's aggregate" unfalsifiable), and that the fixture stocks the `store_role=main` fulfillment center rather than an arbitrary one. |
| Credential-declaration guard | `npm run td:validate:credentials` (`scripts/seed-data/validate-credentials.mjs` + the side-effect-free `credential-specs.mjs`) — STATIC, no network. Fails when a **destructive** fixture (a lockout/abuse role, `DESTRUCTIVE_ROLE_KEYS`) shares its account with a shared happy-path fixture, and warns when one account is declared with **two different password vars** across the credential registries (a committed CSV `{{VAR}}` cell vs a `user-roles.mjs` `passwordVar`). Both classes silently BLOCK whole suites: the account can only hold one password, and a lockout run locks every other consumer out. A contested account additionally has its password reconciliation **disabled** by the seeders (`user-provision.mjs` `contestedPasswordEmails`) so two seeders can't overwrite each other. Live companion: `td:reconcile` [10] Auth drift. |
| Overlay GUID liveness | `TEST_ENV=<env> npm run td:reconcile` check **[11]** (+ the side-effect-free `scripts/seed-data/overlay-specs.mjs`) — the committed `aliases.<env>.json` overlay is probed against `GET /api/members/{id}`, so a fixture that was torn down and re-seeded (new GUID) can no longer leave `@td(ALIAS.id)` pointing at a **deleted** entity. That failure mode is silent: the assertion just never matches and the case reads as a product bug. Scope is an explicit **member-only allowlist** — security-account ids are excluded because this platform has no reliable by-GUID account lookup (`GET /users/{guid}` → 200 + `null`; the users search ignores an `ids` filter), and probing products/pricelists/config-sections with the member endpoint would manufacture ~90% phantom failures. |
| Store required defaults | `TEST_ENV=<env> npm run td:reconcile` check **[13]**, and the cheap standalone pre-flight **`npm run td:reconcile:store`** — both call the side-effect-free `scripts/seed-data/store/store-defaults-specs.mjs`. A store missing `defaultCurrency` / `defaultLanguage` / `url` is a **broken storefront**, not a feature bug (memory `reference_store_required_defaults_null_breaks_frontend`). It lives in `td:reconcile` rather than a `td:validate:store` because that family is STATIC (committed fixtures, no network) and a null on a live store is ENV STATE. Created after 2026-08-27, when suite `075d`'s store-toggle cases sent a PARTIAL `PUT /api/stores` — which **replaces** the entity — twice on vcst-qa (14:29:56Z, 16:48:29Z), nulling `defaultCurrency`/`defaultLanguage`/`url`/`secureUrl` on `B2B-store`; the second took the storefront down and nothing in the repo could see it, because every other check probes the entities the fixtures POINT AT, never the store they live in. It **names the store and the null fields**, gates only the store under test (`STORE_ID` + live `stores.csv` rows) so a dormant legacy store is not permanent noise, and also flags a default that is set but absent from its own `currencies[]`/`languages[]` (populated-but-unusable passes a null check). Repair values are **derived from live evidence** — the store's own recent orders' `currency`/`languageCode`, a single-entry list field, `FRONT_URL` for the env's own store — and are reported as **null with a reason** when the evidence is ambiguous; peer-store consensus is corroboration only and is NEVER promoted to a value (this env carries a live EUR store, so a modal value would confidently overwrite a correct one). Nothing is ever written. Safe companion: **`npm run store:set -- --name <Setting> --value <v>`** does the GET-merge-PUT of the FULL body (generalising the one implementation that always had it right — `setMissionsEnabled()` in `seed-loyalty-missions.mjs`) and refuses via `fieldsLostByWrite()` any body that would blank a required default. |
| Alias base guard (DV-021) | `npm run td:validate` — the **DV-021** scan in `scripts/test-data/validate-td-refs.ts` fails if the **committed base** `test-data/aliases.json` carries a runtime platform GUID baked into an `_inline` alias (they must live in the per-env `aliases.<env>.json` overlay). Allowlist = deterministic sentinel pins + pinned org `platform_id`s (derived live from `b2b/organizations.csv`) + a short documented env-constant list (the virtual-catalog root). Migrate offenders with `node scripts/test-data/migrate-inline-guids.mjs --apply`. |
| Fixture-shape guard (DV-022) | `npm run td:validate` — the **DV-022** scan in `scripts/test-data/validate-td-refs.ts` fails when a suite case binds `{{MULTI_ORG_USER_EMAIL/PASSWORD}}` **and** performs a per-org membership operation (`lockOrganizationContact`, `unlockOrganizationContact`, `changeOrganizationContactRole`, `organization-memberships/{id}/lock|unlock`, or the UI actions `Block user`/`Unblock user`/`Edit role`). Two multi-org fixtures look interchangeable but are not: `{{MULTI_ORG_USER_EMAIL}}` is an Approved contact with **many `contact.organizations` associations and ZERO `OrganizationMembership` rows** — correct for org-switcher and global-contact-status cases, but a lock/unlock/role-change has no membership row to act on, so the case silently tests nothing. Those need `@td(MULTI_ORG_TF_BR.email/.password)` (real membership rows in TechFlow + BuildRight). Deliberately keyed on membership **mutations**, not on any mention of `organization-memberships`, so a case that asserts the *absence* of a membership row (e.g. `027` `CUST-091`) is not flagged. Reviewed exception: add `DV-022-OK` to the row. |
| [`/qa-generate-data`](../skills/qa-generate-data/SKILL.md) | Authors fixtures from scratch with no system GUIDs (blank `*_guid`/`platform_id`, `seeded=false`), business-key aliases, `AGENT-TEST-` prefix; ends on a mandatory `validate-td-refs.ts` green gate |
| [`test-data-engineer`](../agents/test-data-engineer.md) agent | The canonical author **and live runner** of seeders/fixtures/validators. Its mandatory process + self-review Judge enforce: no runtime GUID in a committed fixture, writeback to `aliases.<env>.json`, a matching `td:validate:<domain>` guard, teardown symmetry, and `scripts/unit/` tests green — then it **runs the real seed + `td:reconcile`** on a non-prod env (Node + Platform-API, no browser), delegating only browser-based storefront/suite verification |
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

A literal in a Steps/Test_Data column without one of these resolvers is a review failure (see `/qa-review-tests` Dimension 5 — Data Validity; Dimension 6 is BL/ECL Coverage + Requirement Traceability).
