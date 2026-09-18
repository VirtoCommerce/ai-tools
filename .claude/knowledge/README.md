# Agent Knowledge Base

Shared reference files agents consult during testing, authoring and fixing, grouped by **what an
agent reaches for the file to answer**. These are knowledge bases, not per-task notes — anything
produced by one run belongs in `reports/`, never here.

**`ls` a folder for its roster.** This README names each folder's job and the entry points a
filename does not reveal; it carries no file count and no exhaustive listing, because the last two
written here were stale within weeks (`.claude/rules/test-data.md` GOLDEN RULE). The
**read-before-you-write rules per file** — which file must be consulted before which action, and the
traps in each — live in [`.claude/ROUTING.md`](../ROUTING.md) §Knowledge bases.

Paths here are cited throughout `.claude/`, `ci/`, `scripts/` and the validators, so moving a file
means updating its references plus `scripts/maintenance/audit-agents-knowledge.ts`,
`scripts/maintenance/detect-vcst-isms.ts` and `scripts/maintenance/mirror-check.mjs`.

## Folders

| Folder | Answers | Start at |
|--------|---------|----------|
| [`oracles/`](./oracles) | "Is this behaviour correct? Has it failed before?" — the HICCUPPS-F "Familiar Problems" set | `business-logic.md` (BL-*) · `e-commerce-edge-cases-library.md` (ECL-*) · `vc-bug-catalog.md` (VC-* historical failures) · `critical-ui-scope.md` (BL-UI matrix). **Slice, never hand over the whole file** — `npm run bl:extract` / `ecl:extract` |
| [`domain/`](./domain) | "What IS this feature and where are its surfaces?" | Two classes. **Domain maps** — slug-keyed frontmatter (`domain_slug:`), built by `/qa-domain-map <slug>`, freshness-ratcheted by `npm run domain:check`; the shape is `domain-map.md` (deliberately slug-less, so consumers skip it). **Reference files** — storefront/platform facts that are not feature-scoped (`catalog.md`, `products.md`, `store-settings.md`, `sitemap.md`, `release-ledger.md`, …) |
| [`api/`](./api) | REST + GraphQL surface, schema and authoring contracts | `graphql-schema.md` (consult before writing or reviewing any GraphQL) · `graphql-test-cases-runner.md` (the canonical runner authoring contract) · `api-auth.md` |
| [`automation/`](./automation) | How to drive the live UI as a real user | `storefront-selectors.md` · `storefront-config-flags.md` · `browser-quirks.md` (the Firefox lane prerequisites + rollback) |
| [`execution/`](./execution) | Running a flow end to end: routing, gates, data, evidence, regression mechanics, tracker ops | The single-source-of-truth files the always-loaded `.claude/rules/` tier cites instead of restating: `ticket-routing.md`, `ticket-status-transitions.md`, `quality-gates.md`, `reports-policy.md`, `test-data-authoring.md`, `when-to-write-a-test.md`, `browser-lanes.md`, plus the `regression-*.md` set moved out of `rules/regression.md` on 2026-09-08 |
| [`architecture/`](./architecture) | Repo anatomy for the developers team (auto-fix) | `vc-frontend-architecture.md` · `vc-module-architecture.md` |
| [`agents/`](./agents) | Team framework — what every agent on a team is told, before its own definition | `README.md` (roster, teams, the four-layer prompt architecture) · `qa/`, `ba/`, `developers/` `shared-instructions.md`. A plain reference dir, **not** scanned as components: agent definitions are flat files in `.claude/agents/` |
| [`ba/`](./ba) | BA documentation craft | `virto-doc-style.md` — the four audience styles (Customer / Admin / Developer / Sales) |
| [`diagnostics/`](./diagnostics) | Self-diagnostics oracle: per-skill expected phases/gates + the S0–S3 rubric `/vc-self-check` judges against | `skill-expectations.md` |

## Conventions

- **Reference, don't inline.** Agents cite an ID (`BL-AUTH-005`, `ECL-03`, `VC-CART-*`) or a path,
  never paste the body into a report. See [`.claude/rules/reports.md`](../rules/reports.md).
- **`oracles/` is the correctness backbone.** Exploratory and review flows use it as the
  "Familiar Problems" oracle and to seed Bad Neighborhood tours.
- **Generated — never hand-edit; run the script:**

  | File | Refresh / verify |
  |---|---|
  | `api/graphql-schema.md` | `npm run schema:refresh` · `schema:check` |
  | `domain/release-ledger.md` + `release-ledger-snapshot.json` | `npm run releases:refresh` · `releases:check` |
  | `domain/sitemap.md` + `sitemap-snapshot.<env>.json` | `npm run sitemap:refresh` · `sitemap:check` (diff-gated — only the sections that actually changed are rewritten) |

- **Gated — hand-written, but diffed against the source of truth:**
  `automation/storefront-selectors.md` (`npm run selectors:check`),
  `oracles/critical-ui-scope.md`'s machine-readable coverage matrix (`npm run scope:validate`),
  `oracles/business-logic.md` and `e-commerce-edge-cases-library.md` (`npm run bl:lint` / `ecl:lint`;
  ranked by `npm run oracles:rank`). A drift failure means re-grounding the file, not relaxing the gate.
- **`release-ledger.md` is the only answer to "what shipped recently"** — VirtoOZ's release corpus
  stops at Platform 3.917.1 while production is past 3.1050. Two rules travel with it: it **declares
  itself non-exhaustive**, so a miss is never proof a feature does not exist; and it says what is
  **released upstream**, never what is **deployed on the env under test** (that is a live
  `/api/platform/modules` probe — see `.claude/templates/agent-dispatch.md` §Build Verification). Its
  `stale_after_days: 45` contract is enforced by `scripts/unit/release-ledger.test.mjs`.
- **`applicability:` frontmatter** classifies each file for cross-deployment reuse —
  `universal` / `reference` / `vcst-specific`, hand-assigned in
  `scripts/maintenance/audit-agents-knowledge.ts` (which is a WRITER: it edits frontmatter in place).
- **Cross-file links use relative paths** (e.g. an `oracles/` file links a selector as
  `../automation/storefront-selectors.md`).
- **`plugins/vc-fix/knowledge/` is a separate, plugin-scoped copy**, not a symlink. `npm run
  mirror:check` enforces byte-parity for shared paths and lists the declared forks — this README is
  one of them (`plugin-scope`: the plugin ships no suites, seeders or `qa-*` roster), so the two
  differ on purpose. Editing a file that exists in both trees means editing both unless
  `scripts/maintenance/mirror-check.mjs` `FORKS` says otherwise.
