# Agent Knowledge Base

Cross-agent reference files (30) grouped by **what an agent reaches for the file to answer**.
These are shared knowledge bases agents consult during testing, authoring, and fixing — not
per-task notes. Paths are referenced throughout `agents/`, `commands/`, `skills/`, and
`.claude/`; move a file → update its references.

## Folders

| Folder | Answers | Files |
|--------|---------|-------|
| [`oracles/`](oracles/) | "Is this behavior correct? Has it failed before?" — the HICCUPPS-F "Familiar Problems" set | `business-logic.md` (BL-*), `e-commerce-edge-cases-library.md` (ECL-*), `vc-bug-catalog.md` (VC-* historical failures), `critical-ui-scope.md` (BL-UI matrix) |
| [`domain/`](domain/) | VC storefront/platform domain facts & judgment | `catalog.md`, `products.md`, `store-settings.md`, `sitemap.md` |
| [`api/`](api/) | REST + GraphQL surface, schema & authoring contracts | `api-auth.md`, `platform-patterns.md`, `graphql-schema.md`, `graphiql-interaction.md`, `graphql-test-cases-runner.md`, `order-creation-matrix.md` |
| [`automation/`](automation/) | How to drive the live UI as a real user | `storefront-selectors.md`, `storefront-config-flags.md`, `browser-quirks.md` |
| [`execution/`](execution/) | Test-data resolution, dedup/triage signals, module mapping, tracker ops, deploy/verify recipes | `live-discovery.md`, `module-suite-map.md`, `debugging-signals.md`, `performance-thresholds.md`, `tracker-ops.md`, `azure-html-format.md`, `frontend-local-verify.md`, `plugin-root.md` |
| [`architecture/`](architecture/) | Repo anatomy for the developers team (auto-fix) | `vc-frontend-architecture.md`, `vc-module-architecture.md` |
| [`diagnostics/`](diagnostics/) | Self-diagnostics oracle: per-skill expected phases/gates + S0–S3 rubric, and the **completion-signal authoring contract** (every skill/command must emit `session-telemetry.mjs complete --skill "<name>"` as its terminal step), plus the upstream default-deny spec + ADR | `skill-expectations.md`, `upstream-schema.md`, `adr-upstream-default-deny.md` |

## Conventions

- **Reference, don't inline.** Agents cite an ID (`BL-AUTH-005`, `ECL-03`, `VC-CART-*`) or a path,
  never paste the body into a report. See [`.claude/rules/reports.md`](../.claude/rules/reports.md).
- **`oracles/` is the correctness backbone.** Exploratory and review flows use it as the
  "Familiar Problems" oracle and to seed Bad Neighborhood tours.
- **`graphql-schema.md` is a live-introspection snapshot** — verify field names there before
  authoring GraphQL (the refresh script that generates it is full `vc-qa` plugin only, not shipped
  here; introspect `{{BACK_URL}}/graphql` directly to check for drift).
- **Cross-file links use relative paths** (e.g. an `oracles/` file links a selector as
  `../automation/storefront-selectors.md`).
