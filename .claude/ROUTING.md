# Routing Guide — When to Use What

Quick decision tree for commands, skills, and agents.

## By Action

| I want to... | Use | Type |
|--------------|-----|------|
| **Run smoke tests** | `/qa-smoke` | Command |
| **Run regression suites** | `/qa-regression [smoke\|critical\|sprint\|full\|IDs]` | Command |
| **Run autonomous regression** | `/qa-regression [scope] --autonomous` | Command |
| **Generate coverage report** | `/qa-coverage-generation [p0\|p1\|full\|domain\|ci-dry-run]` | Command |
| **Test a JIRA ticket/feature/PR** | `/qa-test VCST-XXXX` | Command |
| **Run exploratory testing session** | `/qa-exploratory [checkout\|catalog\|B2B\|mobile]` | Command |
| **Full test case lifecycle** | `/qa-test-lifecycle suite <ID> \| domain <name> \| PR #NNN \| module <name> \| diff` | Command |
| **Verify a bug fix** | `/qa-verify-fix VCST-XXXX` | Command |
| **Autonomously fix a filed bug** | `/qa-fix VCST-XXXX` | Command |
| **Get a test checklist for a domain** | `/qa-checklist domain` | Skill |
| **Generate test cases** | `/qa-test-cases-generator VCST-XXXX \| domain \| suite ID` | Skill |
| **Generate test seed data** | `/qa-seed-data [minimal\|catalog\|b2b\|pricing\|full\|teardown]` | Skill |
| **Analyze test coverage gaps** | `/qa-coverage-gap analyze` | Skill |
| **Review test case quality** | `/qa-review-tests suite <ID> \| file <path> \| diff` | Skill |
| **Create Postman collections** | `/qa-postman create <purpose> \| run <collection>` | Skill |
| **Sync tests with code changes** | `/qa-test-lifecycle PR #NNN \| module <name> \| diff \| changelog <ver>` | Command |
| **File or investigate a bug** | `/qa-bug description` | Command |
| **Check environment health** | `/qa-env-check` | Command |
| **See QA dashboard** | `/qa-status` | Command |
| **Run business analysis** | `/ba-analyze [full\|flows\|api\|docs\|stories\|ui\|module]` | Command |
| **Generate user stories** | `/ba-stories feature-name` | Command |

## By Category

### Run Tests (Commands — execute immediately)
- `/qa-smoke` — Daily smoke (12 P0 tests, GO/NO-GO)
- `/qa-test` — Test a ticket, feature, or PR
- `/qa-regression` — Run regression suites in parallel (add `--autonomous` for Agent Teams mode with failure recovery + JIRA)
- `/qa-exploratory` — Guided exploratory session
- `/qa-bug` — Reproduce and document bugs
- `/qa-fix` — Autonomous fix of an already-filed bug: triage → reproduce-as-test → minimal single-repo fix → PR → STOP for human review (never auto-merges). Interactive twin of `ci/run-fix-cycle.ts`; delegates to the `developers/` team
- `/qa-verify-fix` — Verify a bug fix: reproduce original bug, confirm fix, run regression checks, transition JIRA
- `/qa-test-lifecycle` — Unified test case pipeline: scope → sync stale → analyze gaps → generate → review → fix → verify → approve. Handles both change-driven sync (PR, module, diff, changelog) and direct scope (suite, domain, VCST-XXXX)
- `/qa-coverage-generation` — Orchestrated parallel coverage generation across domain batches with CI support

### Plan Tests (Skills — methodology reference)
- `/qa-plan` — Test plans from E2E scenario catalog
- `/qa-checklist` — Test case writing checklists (23 domains + Bug Fix Verification, 279 items)
- `/qa-test-design` — Test case derivation (EP, BVA, decision tables)
- `/qa-test-cases-generator` — Generate agent-native test cases in enriched CSV format from JIRA tickets, features, checklists, or legacy suites
- `/qa-risk` — Risk-based prioritization (5x5 matrix)
- `/qa-sbtm` — SBTM charters, heuristics, tours, debrief
- `/qa-coverage-gap` — Autonomous coverage gap analysis and test case generation
- `/qa-seed-data` — Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs
- `/qa-review-tests` — Review test cases: 8-dimension quality analysis (structure, determinism, completeness, testability, data validity, BL/ECL coverage, duplication, env verification)
- `/qa-postman` — Postman MCP collections: create, configure, and run with proper variables, auth, and endpoints

### QA Methodology (Skills — process frameworks)
- `/qa-process` — ISTQB 7-phase lifecycle
- `/qa-investigate` — Bug investigation (5 phases)
- `/qa-defect` — Defect lifecycle, JIRA workflow
- `/qa-evidence` — Evidence capture & report formatting
- `/qa-metrics` — Quality metrics & gate enforcement

### Specialized Testing (Skills — domain expertise)
- `/qa-storybook` — Visual regression, responsive testing
- `/qa-accessibility` — WCAG 2.1 AA audits
- `/qa-design` — Design system consistency, UX heuristics
- `/qa-api` — REST API & GraphQL xAPI testing

### VC Knowledge (Skills — auto-invocable)
- `/vc-docs` — Documentation lookup via Context7

### Agents (use directly for complex multi-step work)

**QA Team (11 agents):**
- `qa-lead-orchestrator` — Coordinates testing, go/no-go decisions
- `qa-frontend-expert` — Storefront, checkout, mobile, cross-browser
- `qa-backend-expert` — APIs, Admin SPA, background jobs
- `qa-testing-expert` — Interactive testing, Figma comparison, debugging
- `test-management-specialist` — Test planning, case writing, coverage
- `ui-ux-expert` — Storybook, accessibility, design system
- `regression-orchestrator` — Parallel regression, retries, consolidated reports
- `autonomous-regression-orchestrator` — Agent Teams regression: token bucket, failure recovery, JIRA
- `autonomous-test-runner` — Standalone autonomous test execution agent
- `test-runner-agent` — Parameterized suite runner (used by regression orchestrator)
- `shared-instructions` — Common instructions inherited by all QA agents

**BA Team (4 agents):**
- `ba-system-analyzer` — Repo structure, module inventory, user flows, pain points
- `ba-api-specialist` — API surface via Postman/Swagger, health assessment
- `ba-story-writer` — Agile user stories with BDD acceptance criteria
- `ba-doc-writer` — User docs, admin guides, API quick-start

**Developers Team (4 agents — only write-capable team, used by `/qa-fix`; one dev + one reviewer per repo kind):**
- `fullstack-backend` — Fixes one `vc-module-*` / `vc-platform` repo (.NET 10 + module Admin Angular); reproduce-as-test → minimal fix → PR
- `backend-reviewer` — Gate-4 reviewer of the C#/Angular diff before the PR (single-repo, no test edits, no breaking changes, BL-* preserved)
- `fullstack-frontend` — Fixes the `vc-frontend` storefront (Vue 3 / TS + in-repo UI kit + Storybook); reproduce-as-vitest-test → minimal fix → PR
- `frontend-reviewer` — Gate-4 reviewer of the Vue/TS diff before the PR (single-repo, no test/story edits, no breaking prop/event/slot or GraphQL contract, BL-UI preserved)

### Knowledge Base (shared agent references in `agents/knowledge/`)
- `api-auth.md` — Platform API OAuth2 authentication (token endpoint, credentials, headers)
- `business-logic.md` — Testable business invariants: pricing, cart, checkout, orders, auth, B2B, catalog
- `e-commerce-edge-cases-library.md` — 13 generic + 7 VC-specific edge case categories (ECL-* IDs)
- `platform-patterns.md` — Platform architecture patterns and conventions
- `catalog.md` — Catalog structure, product types, variations
- `store-settings.md` — Store configuration reference
- `white-labeling.md` — White labeling and theming reference
- `browser-quirks.md` — Browser-specific workarounds and known issues
- `debugging-signals.md` — Error patterns, log signals, diagnostic hints
- `performance-thresholds.md` — Response time and performance benchmarks
- `module-suite-map.md` — Module-to-suite mapping and dependencies
- `sitemap.md` — Full storefront sitemap (March 2026)
- `products.md` — Product types, xAPI fields, configurable sections, test data
- `graphiql-interaction.md` — Step-by-step CodeMirror editor interaction guide for GraphiQL UI

## Cross-References

| Command | Related Skill | Notes |
|---------|--------------|-------|
| `/qa-exploratory` | `/qa-sbtm` | Command runs sessions; skill provides methodology |
| `/qa-smoke` | `/qa-plan` | Smoke uses E2E scenario catalog for P0 selection |
| `/qa-regression` | `/qa-metrics` | Regression results feed into quality gates |
| `/qa-regression` | `/qa-coverage-gap` | Coverage gap analysis validates suite completeness before regression runs |
| `/qa-bug` | `/qa-investigate`, `/qa-defect` | Bug command uses investigation flow + defect templates |
| `/qa-fix` | `/qa-bug` (upstream), `/qa-verify-fix` (downstream), `/qa-defect`, `/qa-risk` | Chain: `/qa-bug` files the ticket → `/qa-fix` triages + fixes + opens PR (STOP for human review) → after merge, `/qa-verify-fix` closes the loop. Gate ladder: `.claude/rules/quality-gates.md` |
| `/qa-test` | `/qa-test-design`, `/qa-checklist`, `/qa-risk` | Test derives cases, applies domain checklists, and prioritizes based on risk |
| `/qa-test` | `/qa-test-cases-generator` | Test command can use generator for new test cases |
| `/qa-test-lifecycle` | `/qa-coverage-gap`, `/qa-review-tests`, `/qa-sync-tests` (merged) | Unified pipeline: sync + gap analysis + quality review |
| `/qa-verify-fix` | `/qa-investigate`, `/qa-checklist` | Fix verification uses investigation flow + Bug Fix Verification checklist |
| `/qa-coverage-generation` | `/qa-coverage-gap`, `/qa-test-cases-generator` | Coverage generation uses gap analysis + test case generator |
| `/qa-seed-data` | `/qa-test`, `/qa-regression` | Seed data prepares test prerequisites for test runs |
