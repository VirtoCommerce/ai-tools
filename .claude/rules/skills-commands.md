# Skills & Commands Reference

## Slash Commands (12) — `.claude/commands/`

All commands have YAML frontmatter with `description`, `argument-hint`, and invocation control. Commands with side effects use `disable-model-invocation: true` to prevent accidental auto-triggering.

| Command | Arguments | Auto-invoke | Purpose |
|---------|-----------|-------------|---------|
| `/qa-smoke` | `[storefront\|admin]` | No | Daily smoke test (12 P0 tests, ~15 min, GO/NO-GO verdict) |
| `/qa-test` | `VCST-XXXX \| feature \| PR #N` | No | Test a JIRA ticket, feature, or PR |
| `/qa-regression` | `[smoke\|critical\|sprint\|full\|frontend\|backend\|IDs]` | No | Run regression suites in parallel |
| `/qa-status` | `[run\|jira\|env]` | **Yes** | Dashboard: run status, JIRA queue, env health, recent bugs |
| `/qa-bug` | `description \| VCST-XXXX \| screenshot` | No | Reproduce, document, and optionally file a JIRA bug |
| `/qa-exploratory` | `[checkout\|catalog\|B2B\|mobile\|new]` | No | Guided exploratory testing session with heuristics |
| `/qa-env-check` | `[vars\|endpoints\|mcp]` | **Yes** | Validate env vars, endpoints, MCP servers, test infra |
| `/qa-coverage-generation` | `[p0\|p1\|full\|domain <name>\|ci-dry-run]` | No | Orchestrated parallel coverage generation across domain batches with CI support |
| `/qa-test-lifecycle` | `suite <ID> \| domain <name> \| VCST-XXXX \| diff \| --skip-generate \| --skip-verify` | No | Full test case lifecycle: analyze → generate → review → fix → verify → approve. Delegates to test-management-specialist + qa-testing-expert |
| `/qa-verify-fix` | `VCST-XXXX` | No | Verify a bug fix: fetch ticket, reproduce STR, confirm fix, regression checks, transition JIRA |
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|ui\|module <name>]` | No | Business analysis with GitHub search + live UI (full/flows/api/docs/stories/ui/module) |
| `/ba-stories` | `feature name \| VCST-XXXX` | No | Generate Agile user stories with BDD acceptance criteria |

## Skills (20) — `.claude/skills/` (grouped by category)

Skills are slash commands with supporting reference files, organized into 3 category directories. Each skill has a `SKILL.md` with `[Category]` tag in the description. See `.claude/skills/README.md` for full reference.

**`vc-knowledge/` — Virto Commerce Knowledge (1) — auto-invocable:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/vc-docs` | `topic \| module \| concept` | Documentation lookup via Context7 | — (uses Context7 MCP) |

**`testing/` — Testing (10) — manual invocation:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/qa-storybook` | `component \| atoms \| all` | Storybook visual regression, responsive breakpoints | `visual-regression-testing.md`, `responsive-component-testing.md` |
| `/qa-accessibility` | `page URL \| component \| full` | WCAG 2.1 AA accessibility audit (POUR principles) | `wcag-accessibility-checklist.md` |
| `/qa-design` | `component \| page \| flow` | Design system consistency & UX heuristics | `design-system-consistency.md`, `ux-heuristic-evaluation.md` |
| `/qa-plan` | `feature \| domain \| VCST-XXXX` | Test plans from E2E scenario catalog (105 scenarios) | `e2e-scenario-catalog.md` |
| `/qa-checklist` | `domain \| feature \| VCST-XXXX \| new <domain>` | Test case writing checklists (23 domains + Bug Fix Verification, 279 items) | `domain-checklists.md`, `graphql-checklist.md`, `checklist-creation-guide.md` |
| `/qa-api` | `ref <module> \| test <scope> \| cases <scope>` | REST API & GraphQL xAPI — reference lookup, test execution, and test case generation | `xapi-query-ref.md`, `test-cases-api-graphql.md`, `api-test-case-patterns.md` |
| `/qa-coverage-gap` | `analyze \| generate \| validate \| full \| domain <name> \| suite <ID>` | Autonomous test coverage gap analysis and generation (4-cycle pipeline) | `coverage-gap-methodology.md`, `feature-domain-map.md` |
| `/qa-postman` | `create <purpose> \| env <profile> \| run <collection> \| list \| examples` | Postman MCP collections — create, configure, and run with proper variables, auth, and endpoints | `postman-collection-guide.md` |
| `/qa-seed-data` | `minimal \| catalog \| b2b \| pricing \| full \| teardown` | Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs | `test-data-generation.md` (knowledge file) |
| `/qa-review-tests` | `suite <ID> \| file <path> \| diff \| all \| domain <name> \| --verify \| --fix` | Review test cases: 8-dimension quality analysis (structure, determinism, completeness, testability, data validity, BL/ECL coverage, duplication, env verification). Delegates live verification to qa-testing-expert | `review-criteria.md` |

**`qa-methodology/` — QA Methodology (9) — manual invocation:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/qa-process` | `[phase name \| analyze VCST-XXXX \| close sprint-XX \| gates]` | ISTQB 7-phase lifecycle | `test-process-lifecycle.md` |
| `/qa-investigate` | `bug description \| VCST-XXXX` | Bug investigation (5 phases) and root cause analysis | `bug-investigation-flow.md` |
| `/qa-evidence` | `[compact\|detailed\|signoff]` | Evidence capture & report formatting, output paths | `evidence-capture-policy.md`, `output-paths.md`, `sign-off-templates.md` |
| `/qa-defect` | `triage VCST-XXXX \| verify VCST-XXXX \| classify \| workflow \| metrics` | Defect management lifecycle: JIRA Bug Workflow | `defect-lifecycle-workflow.md`, `defect-report-templates.md` |
| `/qa-test-design` | `feature name \| technique \| VCST-XXXX` | Test case derivation: EP, BVA, decision tables, state transitions, pairwise | `test-design-techniques.md` |
| `/qa-test-cases-generator` | `VCST-XXXX \| domain \| suite ID \| migrate <suite> \| from-checklist <domain>` | Generate agent-native test cases in enriched CSV format from JIRA tickets, features, checklists, or legacy suites | `test-case-template.md` |
| `/qa-risk` | `feature \| sprint \| release \| VCST-XXXX` | Risk-based test prioritization: 5x5 matrix | `risk-prioritization-framework.md` |
| `/qa-metrics` | `[metrics\|gates\|report\|trends]` | Quality metrics & gates: pass rate, defect density, DRE, coverage | `quality-metrics-catalog.md`, `quality-gates.md` |
| `/qa-sbtm` | `domain \| charter type \| heuristic` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT | `session-based-testing.md` |

## Usage

`/qa-smoke`, `/qa-test VCST-1234`, `/qa-storybook Button`, `/vc-docs dynamic properties`, or use agents directly: `"Use qa-frontend-expert to test checkout"`

**Frontmatter fields:** `description` (shown in `/` menu with `[Category]` tag), `argument-hint` (autocomplete hint), `disable-model-invocation: true` (prevents Claude from auto-triggering). Only read-only commands/skills (`/qa-status`, `/qa-env-check`, `/vc-docs`) allow model invocation.
