# Agents + Knowledge Files — Customer Applicability Audit — 2026-06-02

> Companion to the suite applicability audit (`suite-applicability-2026-06-02.md`). Auto-tags every agent prompt and knowledge file with `applicability: universal | reference | vcst-specific` in YAML frontmatter. Re-run with `npx tsx scripts/audit-agents-knowledge.ts`.

## Summary

| Classification | Count | % |
|----------------|-------|---|
| **universal** | 21 | 53.8% |
| **reference** | 18 | 46.2% |
| **vcst-specific** | 0 | 0.0% |
| **Total** | 39 | 100% |

## By category

| Category | Universal | Reference | Vcst-specific |
|----------|-----------|-----------|--------------|
| QA agents | 7 | 3 | 0 |
| BA agents | 4 | 0 | 0 |
| Shared instructions | 0 | 1 | 0 |
| Knowledge files | 10 | 14 | 0 |

## Universal artifacts (work for any VC deployment without modification)

| File | Category | Rationale |
|------|---------|-----------|
| `.claude/agents/qa/qa-lead-orchestrator.md` | agent-qa | Orchestration role — delegates to specialists, manages JIRA workflow, gates decisions. No VC-specific assumptions in the role itself. |
| `.claude/agents/qa/qa-testing-expert.md` | agent-qa | Interactive testing methodology — exploratory, Figma comparison, console/network debug. Cross-surface, universal QA discipline. |
| `.claude/agents/qa/test-management-specialist.md` | agent-qa | Test planning craft (BA → test conditions → cases). Universal QA discipline; examples are storefront but pattern is general. |
| `.claude/agents/qa/regression-orchestrator.md` | agent-qa | Parallel execution + retry logic + browser fallback. Pure orchestration mechanism. |
| `.claude/agents/qa/autonomous-regression-orchestrator.md` | agent-qa | Agent Teams variant of regression-orchestrator. Token-bucket + failure recovery. Mechanism, not domain. |
| `.claude/agents/qa/test-runner-agent.md` | agent-qa | Parameterized template ({{SUITE_ID}}, {{BROWSER_SERVER}}, etc.). Template is itself the contract; customer-runnable. |
| `.claude/agents/qa/autonomous-test-runner.md` | agent-qa | Autonomous variant of test-runner-agent. Same parameterized template pattern. |
| `.claude/agents/ba/ba-system-analyzer.md` | agent-ba | VC module + system analysis. Uses GitHub MCP to search vc-module-* repos. Universal for any VC customer with module access. |
| `.claude/agents/ba/ba-api-specialist.md` | agent-ba | Postman / Swagger / GitHub MCP for VC API analysis. Universal. |
| `.claude/agents/ba/ba-story-writer.md` | agent-ba | Agile user stories + BDD acceptance criteria. Pure craft, no VC-specific assumptions. |
| `.claude/agents/ba/ba-doc-writer.md` | agent-ba | User-facing docs + admin guides. Pure docs craft. |
| `.claude/agents/knowledge/api-auth.md` | knowledge | VC platform OAuth2 token endpoint pattern. Same for every VC deployment. |
| `.claude/agents/knowledge/browser-quirks.md` | knowledge | Per-browser rendering differences. Cross-VC universal. |
| `.claude/agents/knowledge/debugging-signals.md` | knowledge | Console + network debugging heuristics. Cross-VC universal. |
| `.claude/agents/knowledge/graphiql-interaction.md` | knowledge | GraphiQL UI interaction guide — CodeMirror editor steps. Universal across VC deployments. |
| `.claude/agents/knowledge/graphql-test-cases-runner.md` | knowledge | Runner contract grammar (tag syntax, predicate shapes, @td()/{{VAR}} forms). Format spec, universal. |
| `.claude/agents/knowledge/live-discovery.md` | knowledge | Decision tree + xAPI discovery patterns + AGENT-TEST- prefix conventions. Pattern is universal; xAPI examples cross-VC. |
| `.claude/agents/knowledge/performance-thresholds.md` | knowledge | Web Vitals + LCP/CLS/TTI budgets. Cross-app universal. |
| `.claude/agents/knowledge/platform-patterns.md` | knowledge | VC platform architecture patterns. Same for every VC deployment. |
| `.claude/agents/knowledge/test-execution-preflight.md` | knowledge | Pre-run readiness checklist (env health, fixture seed, MCP status). Universal. |
| `.claude/agents/knowledge/test-runner-tags.md` | knowledge | CSV column / step / assertion tag reference. Format spec, universal. |

## Reference artifacts (universal patterns, vcst-specific examples; customer adapts)

| File | Category | Rationale |
|------|---------|-----------|
| `.claude/agents/qa/qa-frontend-expert.md` | agent-qa | LAYER 1 hardcodes BL-CHK-003 / BL-PRICE-001 / BL-CROSS-002. LAYER 2 is vc-frontend (Vue.js) patterns. Customer adapts for their storefront tech + BL refs to match their business invariants. |
| `.claude/agents/qa/qa-backend-expert.md` | agent-qa | Same pattern as qa-frontend-expert — LAYER 1 has VC BL refs, LAYER 2 is admin SPA + xAPI patterns. Reference for customers. |
| `.claude/agents/qa/ui-ux-expert.md` | agent-qa | Storybook (vc-frontend specific) + critical-ui-scope (vcst coverage matrix). Customer with a different storefront codebase clones for their Storybook. |
| `.claude/agents/qa/shared-instructions.md` | agent-shared | Four-layer agent architecture template — universal pattern. But agent-pool table at line 210 (slot 1/2/3 with @td(AGENT_POOL_SLOT_N.*) refs) shows vcst values as 'reference'. Customer fills agent-user-pool.csv. |
| `.claude/agents/knowledge/business-logic.md` | knowledge | 76 storefront BLs covering pricing, cart, checkout, B2B, etc. Universal as a STARTING POINT (most BLs are platform-level invariants). Customer adapts: some BLs encode vcst-specific assumptions (specific currency, specific tier rules, specific role names). Customer's own BL-{CUSTOMER}-* IDs namespace alongside. |
| `.claude/agents/knowledge/catalog.md` | knowledge | Storefront catalog reference — assumes vcst's catalog structure. Customer adapts. |
| `.claude/agents/knowledge/critical-ui-scope.md` | knowledge | vcst's 7 components × 8 pages coverage matrix. Customer adapts to their components/pages. |
| `.claude/agents/knowledge/e-commerce-edge-cases-library.md` | knowledge | 13 generic ECL (universal) + 7 VC-specific (reference). File-level classification is reference because the VC-specific ones are intermixed; future refactor: split into universal + VC-specific files. |
| `.claude/agents/knowledge/graphql-schema.md` | knowledge | xAPI GraphQL schema reference. The schema SHAPE is universal across VC, but field availability varies by module set + customer modifications. Customer regenerates from their live introspection. |
| `.claude/agents/knowledge/module-suite-map.md` | knowledge | vcst's module → suite mapping. Customer's mapping differs by module set + custom suites. |
| `.claude/agents/knowledge/order-creation-matrix.md` | knowledge | vcst's payment + shipping combinations matrix. Customer's processor + shipping set differs. |
| `.claude/agents/knowledge/products.md` | knowledge | Storefront product types + xAPI fields. Customer's products differ; pattern reusable. |
| `.claude/agents/knowledge/sitemap.md` | knowledge | Full storefront URL map. Customer's sitemap differs by storefront customizations. @td(VIRTUAL_CATALOG_B2B.id) already used in some entries. |
| `.claude/agents/knowledge/store-settings.md` | knowledge | Storefront store config patterns. Customer's settings differ. |
| `.claude/agents/knowledge/storefront-config-flags.md` | knowledge | vc-frontend $cfg.* flag inventory. Customer with stock vc-frontend = applicable; customer with custom storefront = adapt. |
| `.claude/agents/knowledge/storefront-selectors.md` | knowledge | vc-frontend stable selectors (data-test-id / role / aria-label). Customer with custom theme adapts selector strategy. |
| `.claude/agents/knowledge/vc-bug-catalog.md` | knowledge | Historical VC bug patterns indexed by domain. Customer reads as 'Familiar Problems' oracle but VC-specific entries (VCST-NNNN refs) are vcst's history. Useful learning artifact, adapt for customer's. |
| `.claude/agents/knowledge/white-labeling.md` | knowledge | Storefront white-labeling feature reference. Customer's branding differs. |

## Vcst-specific artifacts

None. Like the suite audit, the @td() discipline and the agent-architecture separation (Tier A/B/C) kept hard vcst-isms out of the agent + knowledge files. The vcst-specifics live in test-data + reports + sprint plans (Layer 2) instead.


## Run results

- **Files processed:** 39
- **Frontmatter prepended (file had none):** 25
- **Frontmatter merged into existing:** 14
- **Already up-to-date:** 0
- **Not found (script bug):** 0

## Implications for Phase 1 / v0.3

Combined with the suite audit:

| Layer | Universal | Reference | Vcst-specific |
|-------|-----------|-----------|--------------|
| Suites (99) | 48 | 51 | 0 |
| Agents + knowledge + shared (39) | 21 | 18 | 0 |
| **Grand total (138)** | **69** | **69** | **0** |

**50.0% of the customer-facing surface is universal**, **50.0% is reference**, **0% is vcst-only**. Strong result for customer adoption — every shipped artifact is at least adaptable.

## Next workstreams unlocked

- **#6 (repo split)**: now has classification data across all customer-facing assets. Layer 1 ships everything tagged universal or reference (the entire shipped surface). Layer 2 keeps test-data + reports + sprint plans + agent-user-pool CSV + the parts of aliases.json that are vcst-only.
- **#9 (test-data audit)**: the actual vcst-isms live in test-data/. That audit is the last big classification work.
