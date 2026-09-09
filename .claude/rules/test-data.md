# Test Data — Resolver, Registry, and No-Hardcode Policy

Cross-skill rule for any test artifact authored in this repo (test cases, Postman collections, regression CSVs, GraphQL runner cases, agent prompts, bug-repro snippets). **Test data is resolved at runtime, never hardcoded.**

## GOLDEN RULE — never hardcode in scripts (applies beyond test data)

**If a value has a source of truth, read it from there. Never transcribe it into our code.** This covers test data (the rest of this file) *and* every other constant a script measures against: design tokens, spacing scales, breakpoints, component sizes, library defaults, version numbers.

A transcribed constant is correct exactly once. It goes stale at the next change and it fails **silently**, manufacturing false positives rather than erroring — which is why the cost lands on whoever triages the phantom failures, not on whoever transcribed the number.

The five-step pattern that replaces a transcribed constant (generator → up the chain → drift gate → fail loud → docs point at the constant), and the measured incident behind it — a hardcoded 14-value spacing grid against a real 39-value scale, ~7 phantom `BL-UI-002` failures and a "site-wide design-token issue" that did not exist: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §GOLDEN RULE — the pattern and the incident.

## SECOND RULE — a fixture is designed from the CHAIN'S QUESTION, not from the screen

The GOLDEN RULE governs *where a value comes from*. This one governs *which values exist at all*, and its absence is expensive in a way no validator detects: a fixture can satisfy every `@td()`, every drift guard and every secret-hygiene check and still make the feature's central question **undecidable**.

**The test is falsifiability, per link.** For each link of the feature's value chain (`/qa-test-design` `test-design-techniques.md` §1a), ask: *if this link were implemented wrong, would THIS data make the case fail?* If the right and the wrong implementation produce the same observation, the fixture is not a fixture — it is a coincidence, and the case built on it is a vacuous pass.

**Divergence is the property that makes a fixture discriminating.** Two quantities that must not be confused have to be *different* in the data; two rankings that must not collapse have to *disagree*; a variant that must behave differently from its sibling has to be seeded as a real pair. **Equal values on both sides of a distinction under test are a data defect, not a neutral choice.**

The other three clauses — state the fixture's own limits, constrain `live-discover` on every dimension the feature is sensitive to, seed through the mechanism where the mechanism is under test — and the worked example of a 2 042-line fixture set that was immaculate by every existing guard and still answered nothing: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §SECOND RULE — designing from the chain.

## Resolving a variable: through `process.env`, never off a layer or the curated export

A role's identity and its secret routinely live in **different layers** — the loader is `.env.defaults` → `.env.${TEST_ENV}` → `.env.local`, so grepping `.env.${TEST_ENV}` can find nothing and still look conclusive, because it is the file named after the environment. The second half of the trap is worse: `config.js` exports a **curated** `env` object, and a key it does not carry comes back `undefined` — indistinguishable from a variable that is genuinely unset, which is the conclusion it will be mistaken for. Measured 2026-08-28: a working fixture account was reported as having empty credentials on exactly this basis, and the suite that authenticates as that role was very nearly filed as broken.

**Resolve through `process.env` after importing `config.js`** (the import runs the layered loader); use the curated `env` export only for keys you have confirmed it carries. Never conclude a variable is unset from a single layer or from the curated object.

## DISPOSABLE FIXTURES — the four rules (detail on demand)

A per-run fixture is correct design, but **an observation must outlive the fixture it was made on**, and *"isolated"* is per SUITE, not per seed. Rules: (1) capture an observation with the run handle + entity ids + order numbers, or it is a memory, not evidence; (2) never re-seed between producing an observation and its being consumed; (3) qualify the word *isolated* — *per seed / per run / per suite*, never bare; (4) two suites consuming one disposable fixture set are serialised with a re-seed between them, or get their own accounts. The measured incidents (2026-09-01, `075d`/`083d`, `MSN-026`) and the pre-flight liveness rule: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §DISPOSABLE FIXTURES.

## Four data layers

| Layer | Resolve with | Use for |
|-------|--------------|---------|
| `{{VAR}}` | the layered `.env` loader (`npm run env:check`) | URLs, credentials, store/culture/currency — per-environment, not per-test |
| `@td(ALIAS.field)` | `test-data/aliases.json` → a CSV row or JSON fixture | entities you **assert against by name**: a known coupon, the canonical card, a fixed org, a Completed order |
| `live-discover` | `scripts/lib/live-discover.ts`, or `[GQL-OP]`+`[GQL-CAPTURE]` in the CSV runner | any entity, or one whose ID drifts between seeds. Assert shape, not exact values |
| `random-data` | `scripts/lib/random-data.ts` | unique inputs you never assert on: emails, org names, comments, BVA quantities. `AGENT-TEST-` prefix so teardown sweeps them |

The decision tree, the three alias shapes, JS and CSV-runner recipes, and the anti-patterns: [`knowledge/execution/live-discovery.md`](../knowledge/execution/live-discovery.md) — consult it before authoring or reviewing a case.

**Passwords are never literals in committed test-data.** Seed-CSV password columns carry a `{{VAR}}` token (`{{B2B_USER_PASSWORD}}`, `{{TEST_USER_PASSWORD}}`, `{{DEFAULT_TEST_PASSWORD}}`), resolved at seed time from `.env.local` by [`scripts/lib/user-provision.mjs`](../../scripts/lib/user-provision.mjs) `resolvePassword()` (per-env via the `_${TEST_ENV}` suffix). Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in [`templates/.env.local.template`](../../templates/.env.local.template). `td:reconcile` secret-hygiene fails any bare password literal; a `{{VAR}}` token is clean (VCST-5406).

## Seed writeback + seeder authoring rules (on demand)

Runtime platform GUIDs land in `test-data/aliases.{TEST_ENV}.json` (every env, `vcst` included); business keys stay in the committed CSV; a new seeder MUST follow the four-point multi-env rule. Full model, per-domain source-of-truth notes and the mandatory authoring rule: [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §Seed writeback + §Authoring rule.

## Where this rule is enforced (on demand)

Every skill, agent, script and per-domain `td:validate:<domain>` guard that enforces this file — 28 rows — is listed in [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §Where this rule is enforced. Adding a seeder means adding a row there.

## Canonical references (on demand)

The full index — the resolver and discovery implementations, the alias registry, the static (`td:validate`) and live (`td:reconcile`) guards, the user-role registry, the runner grammar and the schema reference — is [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) §Canonical references. The two files an author reaches for first are [`knowledge/execution/live-discovery.md`](../knowledge/execution/live-discovery.md) (choosing a layer) and [`knowledge/execution/test-data-authoring.md`](../knowledge/execution/test-data-authoring.md) (writing the seeder).

**You should never need a hardcoded value**, and the escape hatch when you think you do — add an alias, use the inline `@td(file, filter, column)` form, verify with `npm run td:validate`, or promote it to `.env` as `{{VAR}}` — is in that same file, §When you must add a hardcoded value. A literal in a Steps/Test_Data column without one of these resolvers is a review failure (`/qa-review-tests` Dimension 5 — Data Validity).
