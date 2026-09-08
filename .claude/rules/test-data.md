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

## DISPOSABLE FIXTURES — the four rules (detail on demand)

A per-run fixture is correct design, but **an observation must outlive the fixture it was made on**, and *"isolated"* is per SUITE, not per seed. Rules: (1) capture an observation with the run handle + entity ids + order numbers, or it is a memory, not evidence; (2) never re-seed between producing an observation and its being consumed; (3) qualify the word *isolated* — *per seed / per run / per suite*, never bare; (4) two suites consuming one disposable fixture set are serialised with a re-seed between them, or get their own accounts. The measured incidents (2026-09-01, `075d`/`083d`, `MSN-026`) and the pre-flight liveness rule: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §DISPOSABLE FIXTURES.

## Four data layers

| Layer | Source | Use for |
|-------|--------|---------|
| `{{VAR}}` | [`.env`](../../.env) (33 vars; `npm run env:check`) | URLs, credentials, store/culture/currency context — anything whose value is per-environment, not per-test |
| `@td(ALIAS.field)` | [`test-data/aliases.json`](../../test-data/aliases.json) → a CSV row **or a JSON fixture** in [`test-data/`](../../test-data/) | Specific entities you **assert against by name**: the configurable laptop the test was designed for, a known coupon, the canonical Skyflow card, a fixed org, a Completed order. Aliases come in three shapes — inline (`_inline`), CSV-backed (`file`+`filter`+`fields`), and **JSON-fixture** (`json`+`fields`→dotted path, for Swagger-shaped nested entities like orders/quotes) |
| `live-discover` | [`scripts/lib/live-discover.ts`](../../scripts/lib/live-discover.ts) (xAPI at runtime) or CSV-runner `[GQL-OP]+[GQL-CAPTURE]` | **Any** entity, or one whose ID drifts between seeds: "first available product", "current virtual-catalog root", "first saved address", "any active coupon". Assert shape, not exact values. |
| `random-data` | [`scripts/lib/random-data.ts`](../../scripts/lib/random-data.ts) (zero-dep) | **Unique inputs** you never assert exact values on: registration emails, org names, comments, BVA quantities. Defaults use `AGENT-TEST-` prefix so `/qa-seed-data teardown` sweeps them. |

The decision tree, JS recipes, and CSV-runner recipes live in [`knowledge/execution/live-discovery.md`](../knowledge/execution/live-discovery.md) — agents authoring or reviewing test cases consult that file first.

**Passwords are never literals in committed test-data.** Seed-CSV password columns (`test-data/b2b/users.csv`, `test-data/b2b/organization-memberships.csv`, `test-data/users/test-users.csv`, `test-data/users/agent-user-pool.csv`) carry a `{{VAR}}` token (e.g. `{{B2B_USER_PASSWORD}}`, `{{TEST_USER_PASSWORD}}`, `{{DEFAULT_TEST_PASSWORD}}`), resolved at seed time from `.env.local` by [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs) `resolvePassword()` (per-env via the `_${TEST_ENV}` suffix). Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in [`templates/.env.local.template`](../../templates/.env.local.template). `td:reconcile` secret-hygiene fails any bare password literal; a `{{VAR}}` token is clean (VCST-5406).

## Seed writeback + seeder authoring rules (on demand)

Runtime platform GUIDs land in `test-data/aliases.{TEST_ENV}.json` (every env, `vcst` included); business keys stay in the committed CSV; a new seeder MUST follow the four-point multi-env rule. Full model, per-domain source-of-truth notes and the mandatory authoring rule: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §Seed writeback + §Authoring rule.

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

## Where this rule is enforced (on demand)

Every skill, agent, script and per-domain `td:validate:<domain>` guard that enforces this file — 28 rows — is listed in [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §Where this rule is enforced. Adding a seeder means adding a row there.

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
