# Routing Guide — When to Use What

Quick decision tree for commands, skills, and agents. New here? Start with `/qa-onboarding`, then `/qa-env-check`, then `/qa-smoke`.

## By Action

| I want to... | Use | Type |
|--------------|-----|------|
| **Onboard as a new user** | `/qa-onboarding [env\|smoke\|tour\|troubleshoot]` | Command |
| **Check environment health** | `/qa-env-check [vars\|endpoints\|mcp]` | Command |
| **See QA dashboard** | `/qa-status [run\|jira\|env]` | Command |
| **Run smoke tests** | `/qa-smoke [storefront\|admin]` | Command |
| **Run regression suites** | `/qa-regression [smoke\|critical\|sprint\|full\|IDs] [--no-plan]` | Command |
| **Run autonomous regression** | `/qa-regression [scope] --autonomous` | Command |
| **Test a JIRA ticket/feature/PR** | `/qa-test VCST-XXXX \| feature \| PR #N` | Command |
| **Run exploratory testing session** | `/qa-exploratory [checkout\|catalog\|B2B\|mobile\|new]` | Command |
| **File or investigate a bug** | `/qa-bug description \| VCST-XXXX \| screenshot` | Command |
| **Autonomously fix a filed bug** | `/qa-fix VCST-XXXX` | Command |
| **Verify a bug fix** | `/qa-verify-fix VCST-XXXX` | Command |
| **Release a hotfix into stable bundles** | `/qa-hotfix VCST-XXXX [bundles] [--dry-run]` | Command |
| **Check a stable bundle for missed hotfixes** | `/qa-bundle-check vN \| <package.json-url>` | Command |
| **Monitor live errors (App Insights)** | `/qa-monitoring [frontend\|backend\|both] [--since=MIN] [--dry-run]` | Command |
| **Audit component/page design + UX** | `/qa-design component \| page \| flow` | Command |
| **Spin up a local VC stack** | `/qa-local-env [VCST-XXXX] [postgres\|mysql\|sqlserver]` | Command |
| **Full test case lifecycle** | `/qa-test-lifecycle suite <ID> \| domain <name> \| PR #NNN \| module <name> \| diff` | Command |
| **Build a sprint test plan** | `/qa-test-plan Sprint26-08 \| current \| last` | Command |
| **Generate a coverage report** | `/qa-coverage-generation [p0\|p1\|full\|domain\|ci-dry-run]` | Command |
| **Seed / teardown test data** | `/qa-seed-data [minimal\|catalog\|b2b\|pricing\|loyalty\|promotions\|bopis\|full\|teardown]` | Command |
| **Get a test checklist for a domain** | `/qa-checklist domain \| feature \| new <domain> \| admin <module>` | Skill |
| **Generate test cases** | `/qa-test-cases-generator VCST-XXXX \| domain \| suite ID \| migrate <suite>` | Skill |
| **Design test-data combinations a feature needs** | `/qa-generate-data <feature \| flow \| VCST-XXXX>` | Skill |
| **Analyze test coverage gaps** | `/qa-coverage-gap analyze \| generate \| validate \| full` | Skill |
| **Review test case quality** | `/qa-review-tests suite <ID> \| file <path> \| diff \| --fix` | Skill |
| **Create Postman collections** | `/qa-postman create <purpose> \| env <profile> \| verify <collection>` | Skill |
| **Look up VC documentation** | `/vc-docs topic \| module \| concept` | Skill |
| **Run business analysis** | `/ba-analyze [full\|flows\|api\|docs\|stories\|ui\|module]` | Command |
| **Generate user stories** | `/ba-stories feature-name \| VCST-XXXX` | Command |

> `/qa-sync-tests` was **removed** — the command file is deleted and there is no redirect or alias. Use `/qa-test-lifecycle PR #NNN \| module <name> \| diff` instead.

## By Category

### Run Tests (Commands — execute immediately)
- `/qa-smoke` — Daily smoke (12 P0 tests, GO/NO-GO)
- `/qa-test` — Test a ticket, feature, or PR
- `/qa-regression` — Run regression suites in parallel (add `--autonomous` for Agent Teams mode with failure recovery + JIRA). `sprint` resolves the most recent sprint plan → `suitesActivated[]`
- `/qa-exploratory` — Guided exploratory session
- `/qa-bug` — Reproduce and document bugs
- `/qa-fix` — Autonomous fix of an already-filed bug: triage (G0) → single-repo route (G1) → reproduce-as-test → minimal fix → self-review → PR → STOP for human review (never auto-merges). Interactive twin of `ci/run-fix-cycle.ts`; delegates to the `developers/` team by repo kind. Gate ladder: `.claude/rules/quality-gates.md`
- `/qa-verify-fix` — Verify a bug fix: reproduce original bug, confirm fix, regression checks, transition JIRA
- `/qa-hotfix` — Release an already-merged-and-shipped fix into the current latest-stable bundles (cherry-pick onto `support/<X.Y>` + trigger "Release hotfix"); never auto-merges
- `/qa-bundle-check` — Compare a frozen bundle's pinned versions against the latest same-line hotfix on GitHub; traces each to PR + JIRA
- `/qa-monitoring` — Online bug monitoring from Application Insights: query → dedup by fingerprint → triage → live repro → report. Detect-and-report only (never files JIRA / auto-fixes). Interactive twin of `ci/run-monitor.ts`
- `/qa-local-env` — Bring up a local VC stack (start-local + Docker) pinned to the deployed manifest; fresh DB every run; optional `VCST-XXXX` augments with the modules/PR builds the task needs

### Plan & Manage Test Cases (Commands + Skills)
- `/qa-test-lifecycle` — Unified test case pipeline: scope → sync stale → analyze gaps → generate → review → fix → verify → approve. Handles change-driven sync (PR, module, diff, changelog) and direct scope (suite, domain, VCST-XXXX)
- `/qa-test-plan` — Build a sprint test plan from JIRA Done + merged vc-frontend PRs; risk-scores per domain, maps to suites
- `/qa-coverage-generation` — Orchestrated parallel coverage generation across domain batches with CI support
- `/qa-plan` — Test plans from E2E scenario catalog (105 scenarios)
- `/qa-checklist` — Test case writing checklists (63 domains: 33 storefront + 29 backend/admin + 1 GraphQL, 738 items)
- `/qa-test-design` — Test case derivation (EP, BVA, decision tables, state transitions, pairwise)
- `/qa-test-cases-generator` — Generate agent-native test cases in enriched CSV from JIRA tickets, features, checklists, or legacy suites
- `/qa-risk` — Risk-based prioritization (5×5 matrix)
- `/qa-sbtm` — SBTM charters, heuristics, tours, debrief
- `/qa-coverage-gap` — Autonomous coverage gap analysis and test case generation (4-cycle pipeline)
- `/qa-review-tests` — Review test cases: 11-dimension quality analysis (structure, determinism, completeness, testability, data validity, BL/ECL coverage, duplication, env verification, technique coverage, assertion grounding, behavioral triangulation)

### Test Data (Skills)
- `/qa-seed-data` — Seed / teardown test data via repo seed scripts (`npm run seed*`) or Postman MCP
- `/qa-generate-data` — Author realistic test-data fixtures from scratch into `test-data/` (offline); wires `@td()` aliases + validates resolution
- `/qa-postman` — Postman MCP collections: create, configure, verify, export (Newman/Postman CLI executes, not MCP)

### QA Methodology (Skills — process frameworks)
- `/qa-process` — ISTQB 7-phase lifecycle
- `/qa-investigate` — Bug investigation (5 phases) + evidence-to-claim root-cause worksheet
- `/qa-defect` — Defect lifecycle, JIRA Bug Workflow
- `/qa-evidence` — Evidence capture & report formatting, output paths
- `/qa-metrics` — Quality metrics & gate enforcement

### Specialized Testing (Skills — domain expertise)
- `/qa-storybook` — Visual regression, responsive testing
- `/qa-accessibility` — WCAG 2.1 AA audits (POUR principles)
- `/qa-design` — Dual Storybook + Storefront BL-UI audit, design system consistency, UX heuristics
- `/qa-api` — REST API & GraphQL xAPI: reference lookup, test execution, test case generation

### Development (Skills — used by the `developers/` team in `/qa-fix`)
- `/dotnet-unit-test` — Reproduce a backend bug as a failing xUnit test (red → green)
- `/dotnet-fix` — Minimal, idiomatic .NET 10 fix in one VC module
- `/angular-admin` — Fix a module's Admin SPA (AngularJS) UI; scratch-harness for logic, visual render harness for layout/CSS
- `/vue-unit-test` — Reproduce a vc-frontend bug as a failing vitest test (red → green)
- `/vue-fix` — Minimal, idiomatic Vue 3 / TS fix in vc-frontend

### VC Knowledge (Skill — auto-invocable)
- `/vc-docs` — Documentation lookup. **Primary: VirtoOZ MCP** (12 topic-scoped tools); Context7 `/virtocommerce/vc-docs` is the fallback

### Agents (use directly for complex multi-step work)

**QA Team (10 agents + shared-instructions):**
- `qa-lead-orchestrator` — Coordinates testing, go/no-go decisions
- `qa-frontend-expert` — Storefront, checkout, mobile, cross-browser
- `qa-backend-expert` — APIs, GraphQL xAPI, Admin SPA, background jobs
- `qa-testing-expert` — Interactive testing, Figma comparison, debugging
- `test-management-specialist` — Test planning, case writing, coverage
- `ui-ux-expert` — Storybook, accessibility, design system
- `regression-orchestrator` — Parallel regression, retries, consolidated reports
- `autonomous-regression-orchestrator` — Agent Teams regression: token bucket, failure recovery, JIRA
- `autonomous-test-runner` — Parameterized suite runner for Agent Teams mode
- `test-runner-agent` — Parameterized suite runner (used by regression-orchestrator)

**BA Team (4 agents + shared-instructions):**
- `ba-system-analyzer` — Repo structure, module inventory, user flows, pain points
- `ba-api-specialist` — API surface via Postman/Swagger, health assessment
- `ba-story-writer` — Agile user stories with BDD acceptance criteria
- `ba-doc-writer` — Audience-targeted docs (Customer / Admin / Developer / Sales)

**Developers Team (4 agents — only write-capable team, used by `/qa-fix`; one dev + one reviewer per repo kind):**
- `fullstack-backend` — Fixes one `vc-module-*` / `vc-platform` repo (.NET 10 + module Admin Angular); reproduce-as-test → minimal fix → PR
- `backend-reviewer` — Gate-4 reviewer of the C#/Angular diff before the PR (single-repo, no test edits, no breaking changes, BL-* preserved)
- `fullstack-frontend` — Fixes the `vc-frontend` storefront (Vue 3 / TS + in-repo UI kit + Storybook); reproduce-as-vitest-test → minimal fix → PR
- `frontend-reviewer` — Gate-4 reviewer of the Vue/TS diff before the PR (single-repo, no test/story edits, no breaking prop/event/slot or GraphQL contract, BL-UI preserved)

### Knowledge Base (shared agent references in `knowledge/`, grouped by subfolder)
- **`api/`** — `api-auth.md`, `platform-patterns.md`, `graphiql-interaction.md`, `graphql-schema.md`, `graphql-test-cases-runner.md`, `order-creation-matrix.md`
- **`architecture/`** — `vc-module-architecture.md`, `vc-frontend-architecture.md`
- **`automation/`** — `browser-quirks.md`, `storefront-selectors.md`, `storefront-config-flags.md`
- **`ba/`** — `virto-doc-style.md`
- **`domain/`** — `catalog.md`, `products.md`, `store-settings.md`, `white-labeling.md`, `sitemap.md`
- **`execution/`** — `debugging-signals.md`, `performance-thresholds.md`, `es-call-ab-method.md`, `module-suite-map.md`, `live-discovery.md`, `test-execution-preflight.md`, `test-runner-tags.md`
- **`oracles/`** — `business-logic.md` (BL-*), `e-commerce-edge-cases-library.md` (ECL-*), `vc-bug-catalog.md` (VC-* patterns), `critical-ui-scope.md`

## Cross-References

| Command | Related Skill | Notes |
|---------|--------------|-------|
| `/qa-exploratory` | `/qa-sbtm` | Command runs sessions; skill provides methodology |
| `/qa-smoke` | `/qa-plan` | Smoke uses E2E scenario catalog for P0 selection |
| `/qa-regression` | `/qa-metrics` | Regression results feed into quality gates |
| `/qa-regression` | `/qa-coverage-gap` | Coverage gap analysis validates suite completeness before regression runs |
| `/qa-bug` | `/qa-investigate`, `/qa-defect` | Bug command uses investigation flow + defect templates |
| `/qa-fix` | `/qa-bug` (upstream), `/qa-verify-fix` (downstream), `/qa-defect`, `/qa-risk` | Chain: `/qa-bug` files the ticket → `/qa-fix` triages + fixes + opens PR (STOP for human review) → after merge, `/qa-verify-fix` closes the loop. Gate ladder: `.claude/rules/quality-gates.md` |
| `/qa-fix` | `/qa-hotfix`, `/qa-bundle-check` | After a fix ships to master, `/qa-bundle-check` flags which stable bundles lack it → `/qa-hotfix` cherry-picks it in |
| `/qa-monitoring` | `/qa-bug`, `/qa-fix` | Monitoring drafts confirmed bugs → human picks up via `/qa-bug` → `/qa-fix` (monitoring never files JIRA or auto-fixes) |
| `/qa-test` | `/qa-test-design`, `/qa-checklist`, `/qa-risk` | Test derives cases, applies domain checklists, and prioritizes based on risk |
| `/qa-test` | `/qa-test-cases-generator` | Test command can use generator for new test cases |
| `/qa-test-lifecycle` | `/qa-coverage-gap`, `/qa-review-tests`, `/qa-sync-tests` (merged) | Unified pipeline: sync + gap analysis + quality review |
| `/qa-test-plan` | `/qa-regression`, `/qa-risk` | Test plan maps risk-scored domains to regression suites (`sprint` selection) |
| `/qa-verify-fix` | `/qa-investigate`, `/qa-checklist` | Fix verification uses investigation flow + Bug Fix Verification checklist |
| `/qa-coverage-generation` | `/qa-coverage-gap`, `/qa-test-cases-generator` | Coverage generation uses gap analysis + test case generator |
| `/qa-seed-data` | `/qa-generate-data`, `/qa-test`, `/qa-regression` | Author fixtures with `/qa-generate-data` → seed with `/qa-seed-data` → prepares prerequisites for test runs |
