# Tier Classification — Architectural Map for Multi-Project Expansion

Companion to `~/.claude/plans/functional-singing-cosmos.md` (the strategic plan). This file is the authoritative per-file tier assignment used to decide what becomes a shared org-wide standard, what becomes a parameterized template, and what stays project-local when expanding from the vcst-qa storefront to other VirtoCommerce products (Admin SPA, marketplace, modules, mobile, customer projects).

## Tier Definitions

| Tier | Meaning | Lives in | Distribution |
|------|---------|----------|--------------|
| **A — Methodology** | Pure QA discipline. Product-agnostic. The standardization backbone. | Future `vc-qa-core/methodology/` + `vc-qa-core/standards/` | Org-wide, frozen v1.0 contract |
| **B — Capability** | Generic mechanism (orchestration, runners, browsers, env, resolvers). Storefront-flavored but conceptually portable. | Future `vc-qa-core/capability/` + `vc-qa-core/templates/` | Org-wide template + per-project parameters |
| **C — Domain** | Storefront-specific knowledge (BLs, products, sitemap, edge cases, suites, test data). | Stays per-project as `knowledge-pack/` + `regression/suites/` + `test-data/` | Project-local; never leaves consumer repo |
| **D — Missing** | Required for multi-project use but doesn't exist yet. | To be created. | Org-wide. |

---

## `.claude/agents/`

### QA Team (`.claude/agents/qa/`)

| File | Tier | Notes |
|------|------|-------|
| `shared-instructions.md` | **A** | Four-layer architecture, PASS/FAIL/AMBIGUOUS classifier, evidence rules. Promote to `vc-qa-core/methodology/shared-instructions.md` as v1.0 contract. |
| `qa-lead-orchestrator.md` | **A** | Orchestration role is product-agnostic. Examples are storefront — sanitize. |
| `regression-orchestrator.md` | **B** | Already template-shaped with `{{SUITE_ID}}`, `{{BROWSER_SERVER}}` substitution. |
| `autonomous-regression-orchestrator.md` | **B** | Agent Teams token-bucket logic is generic. |
| `test-runner-agent.md` | **B** | Parameterized template; the canonical example of how Tier B should look. |
| `autonomous-test-runner.md` | **B** | Same. |
| `test-management-specialist.md` | **B** | Test planning skill set is generic; examples are storefront. |
| `qa-frontend-expert.md` | **C** | LAYER 1 hardcodes BL-CHK-003, BL-PRICE-001, BL-CROSS-002. LAYER 2 is Vue.js + storefront payment iframes. **Becomes the template** for per-product `qa-{product}-expert.md`. |
| `qa-backend-expert.md` | **C** | Same coupling pattern. Storefront xAPI, Admin SPA hardcoded. |
| `qa-testing-expert.md` | **C** | Storefront-heavy interactive testing. |
| `ui-ux-expert.md` | **C** | Storybook (vc-frontend), critical-ui-scope (storefront pages). |

### BA Team (`.claude/agents/ba/`)

| File | Tier | Notes |
|------|------|-------|
| `ba-system-analyzer.md` | **B** | Already generic VC-module-oriented. Minor sanitization. |
| `ba-api-specialist.md` | **B** | Same. Postman/Swagger/Github-MCP workflow is universal. |
| `ba-story-writer.md` | **A** | Pure BDD/Agile story craft. Zero product coupling. Promote. |
| `ba-doc-writer.md` | **A** | Pure documentation craft. Promote. |
| `README.md` | **A** | Agent system documentation. Sanitize storefront refs. |

### Knowledge (`.claude/agents/knowledge/`)

| File | Tier | Notes |
|------|------|-------|
| `business-logic.md` | **C** | 76 storefront BLs. **Becomes template** `business-logic.{product}.md`. BL IDs need namespacing (`BL-STOREFRONT-PRICE-001`). |
| `e-commerce-edge-cases-library.md` | **C** | 13 generic ECL + 7 VC-specific. **The 13 generic are Tier A candidates** — split this file. |
| `module-suite-map.md` | **C** | Maps storefront modules → suites. Per-product. |
| `products.md` | **C** | Storefront product types, configurable sections. |
| `catalog.md` | **C** | Storefront catalog. |
| `sitemap.md` | **C** | Storefront URL map. |
| `store-settings.md` | **C** | Storefront store config. |
| `white-labeling.md` | **C** | Storefront white-label feature. |
| `storefront-config-flags.md` | **C** | Storefront `$cfg.*` flag inventory. |
| `storefront-selectors.md` | **C** | DOM selectors for storefront. |
| `critical-ui-scope.md` | **C** | 7 components + 8 pages — storefront critical scope. |
| `order-creation-matrix.md` | **C** | Storefront checkout/payment/shipping matrix. |
| `graphql-schema.md` | **C** | xAPI schema reference — storefront-flavored. Admin SPA would have its own. |
| `graphql-test-cases-runner.md` | **B** | Tag grammar + `@td()` resolver contract. Generic. The xAPI examples are C; the grammar is B. |
| `graphiql-interaction.md` | **A** | GraphiQL UI interaction guide — generic. |
| `test-runner-tags.md` | **B** | CSV tag reference — generic format. |
| `test-execution-preflight.md` | **A** | Pre-run readiness — generic. |
| `live-discovery.md` | **B** | Decision tree + JS recipes. Recipes hit xAPI (C), pattern is B. |
| `api-auth.md` | **B** | OAuth2 token endpoint pattern. Endpoint values are env-vars. |
| `platform-patterns.md` | **B** | Platform architecture patterns — VC-wide, not storefront-only. |
| `browser-quirks.md` | **A** | Per-browser rendering differences — universal. |
| `debugging-signals.md` | **A** | Console/network debugging heuristics — universal. |
| `performance-thresholds.md` | **A** | LCP/CLS/TTI budgets — universal Web Vitals. |

---

## `.claude/skills/`

### Methodology (`.claude/skills/qa-methodology/`) — Tier A (the standardization backbone)

| File | Tier | Notes |
|------|------|-------|
| `qa-process/` | **A** | ISTQB 7-phase lifecycle. |
| `qa-test-design/` | **A** | EP, BVA, decision tables, state, pairwise. |
| `qa-risk/` | **A** | 5×5 risk matrix. |
| `qa-defect/` | **A** | Defect lifecycle + JIRA workflow. |
| `qa-metrics/` | **A** | DRE, pass-rate, defect-density, gates. |
| `qa-evidence/` | **A** | Evidence policy, output paths, sign-off templates. |
| `qa-investigate/` | **A** | Bug investigation 5-phase flow. |
| `qa-sbtm/` | **A** | Session-based exploratory testing. |
| `qa-test-cases-generator/` | **A** | Enriched CSV format. **The 15-column format is the org-wide test-case standard.** |

### Testing (`.claude/skills/testing/`) — Tier B (parameterizable capability)

| File | Tier | Notes |
|------|------|-------|
| `qa-postman/` | **B** | Postman MCP authoring — generic. Examples reference VC backend. |
| `qa-api/` | **B** | REST/GraphQL test patterns — generic; examples are xAPI. |
| `qa-accessibility/` | **A** | WCAG 2.1 AA — universal. |
| `qa-storybook/` | **B** | Storybook visual regression — Storybook is the constant, examples are vc-frontend. |
| `qa-checklist/` | **B** | Per-domain checklists — domains C, structure B. **Becomes template + project pack.** |
| `qa-review-tests/` | **B** | 8-dimension quality review — generic dimensions, examples C. |
| `qa-coverage-gap/` | **B** | Coverage gap analysis pipeline — generic methodology, domain map is C. |
| `qa-design/` | **B** | Design system + UX heuristics — generic; matrix is storefront. |
| `qa-plan/` | **B** | E2E scenario catalog — scenarios are C, the planning skill is B. |
| `qa-seed-data/` | **C** | Storefront data seeding (catalogs, orgs, products). Per-project. |

### VC Knowledge (`.claude/skills/vc-knowledge/`)

| File | Tier | Notes |
|------|------|-------|
| `vc-docs/` | **A** | VirtoOZ MCP wrapper — VC-wide doc lookup. |

---

## `.claude/commands/`

| File | Tier | Notes |
|------|------|-------|
| `qa-status.md` | **A** | Read-only dashboard. Generic. |
| `qa-env-check.md` | **A** | Env validation. Generic — driven by `.env` schema. |
| `qa-bug.md` | **A** | Bug reproduction + JIRA. Generic. |
| `qa-verify-fix.md` | **A** | Fix verification workflow. Generic. |
| `qa-exploratory.md` | **B** | SBTM session entry. Examples are storefront domains. |
| `qa-test.md` | **B** | Generic test entry for JIRA/feature/PR. |
| `qa-test-lifecycle.md` | **B** | Unified pipeline — generic stages. |
| `qa-regression.md` | **B** | Generic regression runner — argument hints are storefront groups. |
| `qa-coverage-generation.md` | **B** | Generic pipeline; domains are storefront. |
| `qa-test-plan.md` | **B** | Sprint test plan — generic shape, storefront sprint plans. |
| `qa-sync-tests.md` | **B** | Deprecated — redirects to qa-test-lifecycle. |
| `qa-smoke.md` | **C** | Hardcoded 12 P0 tests for storefront/admin. **Becomes template.** |
| `qa-design.md` | **C** | Storefront component/page audit. |
| `qa-seed-data.md` | **C** | Storefront seed presets. |
| `ba-analyze.md` | **B** | Generic BA analysis entry. |
| `ba-stories.md` | **B** | Generic user-story authoring. |

---

## `.claude/rules/`

| File | Tier | Notes |
|------|------|-------|
| `agents.md` | **A** | Agent system reference. Some examples storefront. |
| `regression.md` | **B** | Regression architecture — the four-mode framework is generic. |
| `skills-commands.md` | **A** | Skills/commands reference. |
| `mcp-browsers.md` | **A** | MCP server + browser config — generic infrastructure. |
| `reports.md` | **A** | **THE single source of truth for report categories + size caps. Org-wide standard.** |
| `test-data.md` | **A** | `@td()` resolver + no-hardcode policy — generic discipline. |

---

## Infrastructure

| Area | Tier | Notes |
|------|------|-------|
| `.env.defaults` | **B** | Layered loader is generic. Payment-card constants are storefront — split out. |
| `.env.vcst` / `.env.vcptcore` / `.env.virtostart` | **C** | Storefront environment profiles. |
| `config.js` env loader | **B** | Generic loader. |
| `config/test-suites.json` | **B** schema / **C** content | Schema, browser pool, selections logic = B. 97 suite entries = C. |
| `config/test-suites.schema.json` | **B** | Generic. |
| `config/mcp-playwright-{chrome,firefox,edge}.config.json` | **B** | Generic browser automation. |
| `scripts/lib/test-data-resolver.ts` | **B** | `@td()` resolver — generic. |
| `scripts/lib/live-discover.ts` | **B** | xAPI discovery primitives — xAPI is storefront, pattern is B. |
| `scripts/lib/random-data.ts` | **B** | Zero-dep random generators — generic. |
| `scripts/validate-td-refs.ts` | **B** | Generic validator. |
| `scripts/graphql-runner.ts` | **B** | Runner-native GraphQL execution — generic for any GraphQL endpoint. |
| `ci/run-regression.ts` | **B** | Orchestration shape generic; agent definitions in `ci/agents/` are C. |
| `ci/run-full-cycle.ts` | **B** | Generic phased pipeline. |
| `ci/notify-teams.ts` | **A** | Generic Teams webhook adapter. |
| `regression/suites/Frontend/` | **C** | 40 storefront suites. |
| `regression/suites/Backend/` | **C** | 38 admin/platform suites. |
| `regression/suites/_release/080-full-regression-release.csv` | **C** | Storefront release suite. |
| `test-data/aliases.json` | **B** schema / **C** content | Registry shape = B. Entries are storefront. |
| `test-data/orgs/`, `products/`, `addresses/`, etc. | **C** | All storefront-domain. |
| `tests/SprintXX-XX/` | **C** | Per-ticket evidence — project-local. |
| `reports/` | **C** | Per-project output. |
| `docs/prompts/` | **B**/**C** | `story-testing.md` = B, `How to test Builder.io.md` = C. |
| `docs/Sprint plans/` | **C** | Storefront sprint plans. |

---

## Tier D — What's Missing

These don't exist yet and must be created for multi-project use:

| Artifact | Description | Where it lives |
|----------|-------------|----------------|
| `.vc-qa.json` | Project manifest declaring product type, knowledge-pack path, suite dir, env profile, core version. | Each consumer project root |
| `config/vc-qa.schema.json` | Schema for `.vc-qa.json`. | `vc-qa-core` |
| Knowledge namespacing convention | `BL-{PRODUCT}-{DOMAIN}-NNN` for all per-product BLs. Shared rules use `BL-VC-*`. | `vc-qa-core/methodology/` (the convention) |
| Lint script | Rejects untagged BL IDs in CI. | `vc-qa-core/scripts/lint-bl-ids.ts` |
| `vc-qa-core/bootstrap/init.ts` | `npx vc-qa init <product-type>` scaffolder. | `vc-qa-core` |
| Specialist agent template | `qa-{product}-expert.md` that extends shared base — only LAYER 1 (BL refs) and LAYER 2 (domain knowledge) filled in. | `vc-qa-core/templates/` |
| Knowledge pack template | Empty `business-logic.{product}.md`, `domain-knowledge.{product}.md`, etc. | `vc-qa-core/templates/knowledge-pack/` |
| Distribution mechanism | Claude Code plugin (agents/skills/commands) + npm package (scripts/ci) — to be chosen in Phase 2. | `vc-qa-core/README.md` |
| Cross-project regression dashboard | Aggregated `history.json` view across all consumers. | `vc-qa-core` ops tooling |
| Per-product agent prefix | `AGENT-TEST-{PRODUCT}-` (extends current `AGENT-TEST-` from `live-discovery.md`). | Convention documented in `vc-qa-core/standards/test-data.md` |

---

## Migration Status

Phase 1 deliverables — track here as work lands:

- [x] Tier classification document (this file)
- [ ] Frontmatter `tier: A|B|C` added to each agent/skill/command file
- [ ] `CLAUDE.md` updated with pointer to this file
- [ ] `npm run audit:tiers` validator script
- [ ] Tier A files frozen as v1.0 (no breaking changes during migration)

Phases 2–4: See `~/.claude/plans/functional-singing-cosmos.md`.

---

## How to use this file

- **Adding a new agent/skill/command?** Decide its tier *first*. If it's A, propose it as an org-wide standard. If it's B, design with substitution points. If it's C, scope it to the storefront knowledge pack.
- **Reviewing a PR that touches a Tier A file?** Higher bar — it's about to ship to N teams.
- **Refactoring a Tier B file?** Look for storefront examples that should become `{{}}` placeholders.
- **Adding storefront-specific behavior to a Tier A/B file?** Stop. Push it down to Tier C.

The single design rule: **dependencies point upward** — Tier C may reference Tier A and B; Tier A and B must never reference Tier C.
