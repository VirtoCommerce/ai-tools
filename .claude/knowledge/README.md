# Agent Knowledge Base

Cross-agent reference files (32) grouped by **what an agent reaches for the file to answer**.
These are shared knowledge bases agents consult during testing, authoring, and fixing — not
per-task notes. Paths are referenced throughout `.claude/`, `ci/`, and the validator scripts;
move a file → update its references (and `scripts/maintenance/audit-agents-knowledge.ts` /
`scripts/maintenance/detect-vcst-isms.ts`).

## Folders

| Folder | Answers | Files |
|--------|---------|-------|
| [`oracles/`](./oracles) | "Is this behavior correct? Has it failed before?" — the HICCUPPS-F "Familiar Problems" set | `business-logic.md` (BL-*), `e-commerce-edge-cases-library.md` (ECL-*), `vc-bug-catalog.md` (VC-* historical failures), `critical-ui-scope.md` (BL-UI matrix) |
| [`domain/`](./domain) | VC storefront/platform domain facts & judgment | `catalog.md`, `products.md`, `store-settings.md`, `white-labeling.md`, `sitemap.md`, `release-ledger.md` ("what shipped upstream, when") |
| [`api/`](./api) | REST + GraphQL surface, schema & authoring contracts | `api-auth.md`, `platform-patterns.md`, `graphql-schema.md`, `graphiql-interaction.md`, `graphql-test-cases-runner.md`, `order-creation-matrix.md` |
| [`automation/`](./automation) | How to drive the live UI as a real user | `storefront-selectors.md`, `storefront-config-flags.md`, `browser-quirks.md` |
| [`execution/`](./execution) | Running the suite: preflight, tags, data resolution, signals, thresholds, routing | `test-execution-preflight.md`, `test-runner-tags.md`, `live-discovery.md`, `module-suite-map.md`, `debugging-signals.md`, `performance-thresholds.md`, `es-call-ab-method.md`, `tracker-ops.md`, `ticket-routing.md`, `test-data-authoring.md` |
| [`architecture/`](./architecture) | Repo anatomy for the developers team (auto-fix) | `vc-frontend-architecture.md`, `vc-module-architecture.md` |
| [`ba/`](./ba) | BA documentation craft | `virto-doc-style.md` |
| [`diagnostics/`](./diagnostics) | Self-diagnostics oracle: per-skill expected phases/gates + S0–S3 rubric | `skill-expectations.md` |

## Conventions

- **Reference, don't inline.** Agents cite an ID (`BL-AUTH-005`, `ECL-03`, `VC-CART-*`) or a path,
  never paste the body into a report. See [`.claude/rules/reports.md`](../rules/reports.md).
- **`oracles/` is the correctness backbone.** Exploratory and review flows use it as the
  "Familiar Problems" oracle and to seed Bad Neighborhood tours.
- **`graphql-schema.md` is generated** from live introspection via
  `scripts/graphql/refresh-graphql-schema.mjs` — verify field names there before authoring GraphQL.
- **`release-ledger.md` is generated** from the monthly community release digests via
  `scripts/maintenance/refresh-release-ledger.mjs` (`npm run releases:refresh`). Read it — not
  VirtoOZ — for "what shipped / which version introduced X"; VirtoOZ's release corpus stops at
  Platform 3.917.1 while production is past 3.1050. Two rules travel with it: it **declares itself
  non-exhaustive**, so a miss is never proof a feature does not exist; and it says what is
  **released upstream**, never what is **deployed on the env under test** (that is a live
  `/api/platform/modules` probe — see `.claude/templates/agent-dispatch.md` § Build Verification).
  It carries a `stale_after_days: 45` contract that `scripts/unit/release-ledger.test.mjs` enforces.
- **Cross-file links use relative paths** (e.g. an `oracles/` file links a selector as
  `../automation/storefront-selectors.md`).
