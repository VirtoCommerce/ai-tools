# Live-Verification Policy — detail

Part of the QA team framework. The always-loaded core is [`shared-instructions.md`](shared-instructions.md); this file holds detail read before you author or review a case, validate GraphQL, rely on a selector, or file a bug.

## Live-Verification Policy

Test data, schema, and design intent are verified against **live state**, not against assumptions or stale references. Apply these checks in order before authoring, executing, or filing a bug.

### 1. Resolve test data at runtime — never hardcode

Pick the right layer for each data role:

| Layer | Use for | Source |
|---|---|---|
| `{{VAR}}` | Per-env URLs, credentials, store/culture/currency | `.env` (loaded by `config.js`) |
| `@td(ALIAS.field)` | Specific entities you **assert against by name** (CFG_LAPTOP, ORG_TECHFLOW, COUPON_10OFF) | `test-data/aliases.json` → CSV in `test-data/` |
| `live-discover` | **Any** entity, or one whose ID drifts (virtual-catalog root, first product, first address, any active coupon) | `scripts/lib/live-discover.ts` (JS) or `[GQL-OP]+[GQL-CAPTURE]` (CSV runner) |
| `random-data` | **Unique inputs** you never assert exact values on (emails, org names, BVA quantities, comments) | `scripts/lib/random-data.ts` (defaults use `AGENT-TEST-` prefix) |

**Cardinal rule:** random + live-discover are for inputs and navigation; `@td()` is for assertion targets. Never assert exact prices, titles, IDs, or URL path segments on a discovered or random value — assert shape/range invariants (`isNumber`, `> 0`, currency-formatted).

Full decision tree, JS recipes, and CSV-runner recipes: `knowledge/execution/live-discovery.md`. Cross-skill rule: `.claude/rules/test-data.md`.

### 2. Validate GraphQL against the live schema

Before authoring or reviewing any query/mutation:
- Consult `knowledge/api/graphql-schema.md` — the live introspection snapshot. **Read its own header for the rev and the counts; do not trust a count written here.** This line used to transcribe "86 queries / 134 mutations / 36 types"; the live schema reads **108 / 140 / 54** (probed 2026-09-02), so the transcription was wrong by 22 queries, 6 mutations and 18 types — the `.claude/rules/test-data.md` §GOLDEN RULE failure in its purest form, and a working demonstration of exactly the drift this section is about.
- For ad-hoc inline checks: `npx tsx scripts/graphql/graphql-runner.ts --query "<inline>"`.
- **Two artifacts go stale independently, and one command does not refresh both.** `npm run schema:refresh` rewrites `knowledge/api/graphql-schema.md` (what YOU read) and nothing else. `npm run graphql:fixtures:validate:refresh` re-introspects, rewrites `scripts/.graphql-schema.cache.json` (what the RUNNER reads) and validates the fixtures, exiting non-zero on drift. Fixtures are bumped/renamed via `npm run graphql:fixtures:update`.
- **`npm run graphql:fixtures:validate` without `--refresh` is not a freshness check.** `loadSchemaCache` has no age check, so it passes clean against an arbitrarily old cache — and the cache is a single shared file, not one per env, so it may hold a different environment's contract (`test-data/graphql/index.json` records the `backUrl` + `lastValidated` it was built from — read them). `npm run schema:check` is a liveness check, never a drift gate.
- **Never judge the snapshot's staleness from the snapshot.** A caller that refreshed it hands you the rev; with no rev, treat it as UNKNOWN age. Spec: `.claude/skills/qa-test/contract-refresh.md`.
- The canonical runner is `scripts/graphql/graphql-runner.ts` — **never write custom JS to execute CSV-defined GraphQL cases.**

### 3. Verify selectors & state against the live UI

Storefront selectors, sign-in flow, cart-reset macros, and org-switch primitives are documented in `knowledge/execution/test-execution-preflight.md` and `knowledge/automation/storefront-selectors.md`. Both were verified live on vcst-qa; re-verify (DOM probe + snapshot) before relying on a selector older than the most recent regression run.

### 4. Verify source data and design intent before filing a bug

For any "wrong field mapping" / "missing UI control" / "disabled element" / "readonly field" symptom:
1. **Source first** — find the binding in the upstream source (vc-frontend repo for storefront, module repo for admin) BEFORE dispatching a browser session. A disabled state often reflects a config flag, role gate, or business rule, not a defect.
2. **Verify the underlying record** — for field-mapping bugs, confirm the entity's field value via the platform REST API or `getByPath` capture, not just from rendered text.
3. **Check feature flags & roles** — `$cfg.*` flags (`knowledge/automation/storefront-config-flags.md`), permission grants on Roles (not users), org-vs-personal account differences.

 Embedded in the `/qa-bug` skill — when invoked standalone, agents must still run these checks.

### 5. Ground new-feature assertions live — never assert what you can't source

When authoring test cases, **every behavioral assertion must trace to a source of truth** and carries a
provenance tag (`test-case-template.md` → Assertions column): `{SPEC}` (tracker AC — Jira or Azure
Boards), `{BL}` (a real invariant), `{DOC}` (docs/source/i18n), or `{OBSERVED}` (seen live). An
untagged / `{HYPOTHESIS}` assertion is a guess and MUST be phrased as a question ("verify whether…"),
never a fact.

For a **brand-new feature** the source-first leg of check #4 is unavailable — there is no VirtoOZ doc
and often no source snapshot yet — so the **live DOM snapshot / behavior on the deployed build becomes
the primary ground truth.** Such assertions must be confirmed live (upgraded to `{OBSERVED}` via the
mandatory `/qa-review-tests --verify` pass) before the suite can be promoted `Draft → Reviewed`. Do not
invent literal message/validation strings — assert the semantic unless the exact string is grounded by
`{DOC}` or `{OBSERVED}`. This is the Dimension 10 (Assertion Grounding / GRD-*) gate.
