# .claude/skills/ — Skill Directory

> 26 skills organized in 4 category groups (vc-knowledge, testing, qa-methodology, development). Each skill has a `SKILL.md` with YAML frontmatter and optional supporting reference files.

## Directory Structure

```
.claude/skills/
├── vc-knowledge/                    # VC Knowledge (1) — auto-invocable, read-only
│   └── vc-docs/
│       └── SKILL.md                 # Documentation lookup via Context7
│
├── testing/                         # Testing (10) — manual invocation
│   ├── qa-storybook/
│   │   ├── SKILL.md                 # Storybook visual regression
│   │   ├── visual-regression-testing.md
│   │   ├── responsive-component-testing.md
│   │   └── how-to-test-storybook.md # Storybook testing reference guide
│   ├── qa-accessibility/
│   │   ├── SKILL.md                 # WCAG 2.1 AA accessibility audit
│   │   └── wcag-accessibility-checklist.md
│   ├── qa-design/
│   │   ├── SKILL.md                 # Design system & UX heuristics
│   │   ├── design-system-consistency.md
│   │   └── ux-heuristic-evaluation.md
│   ├── qa-plan/
│   │   ├── SKILL.md                 # Test plans from E2E catalog
│   │   └── e2e-scenario-catalog.md
│   ├── qa-checklist/
│   │   ├── SKILL.md                 # Test case writing checklist creation
│   │   ├── domain-checklists.md     # 23 domain checklists + Bug Fix Verification (279 items)
│   │   ├── graphql-checklist.md     # GraphQL-specific test checklist
│   │   └── checklist-creation-guide.md
│   ├── qa-api/
│   │   ├── SKILL.md                 # REST API & GraphQL xAPI testing
│   │   ├── xapi-query-ref.md        # Ready-to-use GraphQL queries, mutations, and REST request templates
│   │   ├── test-cases-api-graphql.md
│   │   └── api-test-case-patterns.md # Coverage checklists and writing guide for generating new test cases
│   ├── qa-coverage-gap/
│   │   ├── SKILL.md                 # Autonomous test coverage gap analysis
│   │   ├── coverage-gap-methodology.md
│   │   └── feature-domain-map.md
│   ├── qa-postman/
│   │   ├── SKILL.md                          # Postman MCP collection builder (entry point + index)
│   │   ├── mcp-tools.md                      # Tool inventory, workspace, ID formats
│   │   ├── variables-and-environments.md     # Variable scoping, .env mapping, env creation
│   │   ├── collections-and-requests.md       # Collection schema, requests, auth, chaining
│   │   ├── graphql-authoring.md              # GraphQL bodies + xrefs to graphql-schema.md
│   │   ├── test-data-fixtures.md             # @td() resolver, aliases.json, fixture conventions
│   │   ├── execution.md                      # Verify checklist, Newman/Postman CLI, endpoints
│   │   ├── common-mistakes.md                # 15-item mistake catalog
│   │   └── examples.md                       # Auth-only, CRUD, env quick-copy examples
│   ├── qa-seed-data/
│   │   ├── SKILL.md                 # Test data generation via Postman MCP
│   │   └── test-data-generation.md  # Data generation methodology and Postman collection reference
│   └── qa-review-tests/
│       ├── SKILL.md                 # Test case quality review (8-dimension analysis)
│       └── review-criteria.md       # 8-dimension review criteria reference
│
├── qa-methodology/                  # QA Methodology (10) — cross-team practices
│   ├── qa-monitoring/
│   │   └── SKILL.md                 # Online bug monitoring from App Insights (KQL probes + triage taxonomy + dedup)
│   ├── qa-test-cases-generator/
│   │   ├── SKILL.md                 # Generate agent-native test cases in enriched CSV format
│   │   ├── test-case-template.md    # Enriched CSV column spec with step type tags
│   │   └── test-case-examples.md    # Concrete examples per layer (companion to template)
│   ├── qa-investigate/
│   │   ├── SKILL.md                 # Bug investigation (5 phases)
│   │   └── bug-investigation-flow.md
│   ├── qa-evidence/
│   │   ├── SKILL.md                 # Evidence capture & report formatting
│   │   ├── evidence-capture-policy.md
│   │   ├── output-paths.md
│   │   └── sign-off-templates.md    # Frontend + backend sign-off tables
│   ├── qa-test-design/
│   │   ├── SKILL.md                 # Systematic test case derivation
│   │   └── test-design-techniques.md
│   ├── qa-risk/
│   │   ├── SKILL.md                 # Risk-based test prioritization
│   │   └── risk-prioritization-framework.md
│   ├── qa-metrics/
│   │   ├── SKILL.md                 # Quality metrics & gate enforcement
│   │   ├── quality-metrics-catalog.md
│   │   └── quality-gates.md
│   ├── qa-sbtm/
│   │   ├── SKILL.md                 # Session-based exploratory testing
│   │   └── session-based-testing.md
│   ├── qa-process/
│   │   ├── SKILL.md                 # ISTQB test process lifecycle (7 phases)
│   │   └── test-process-lifecycle.md
│   └── qa-defect/
│       ├── SKILL.md                 # Defect management lifecycle
│       ├── defect-lifecycle-workflow.md
│       └── defect-report-templates.md
│
├── development/                     # Development (5) — used by the developers/ team in /qa-fix
│   ├── dotnet-unit-test/            # Reproduce a backend bug as a failing xUnit test (red)
│   ├── dotnet-fix/                  # Minimal .NET 10 fix → green
│   ├── angular-admin/               # Fix a module's Admin SPA (AngularJS) UI (scratch-harness red→green)
│   ├── vue-unit-test/               # Reproduce a vc-frontend bug as a failing vitest test (red)
│   └── vue-fix/                     # Minimal Vue 3 / TS fix → green
│
├── run-vc-mcp-testing-module/       # Repo tooling (not a QA category): build / launch / smoke-test / health-check this repo
│   └── SKILL.md
│
└── README.md                        # This file
```

> Plus one repo-tooling skill at the root — `/run-vc-mcp-testing-module` (env:check, @td() resolution, suite-manifest sync, GraphQL fixture validation, seed dry-run) — outside the 4 QA category groups (27 `SKILL.md` files total).

## VC Knowledge (1) — `vc-knowledge/`

Auto-invocable, read-only reference skills. No side effects.

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/vc-docs` | Documentation lookup via Context7 | -- (Context7 MCP) |

> **Note:** Module suite mapping (`module-suite-map.md`), storefront sitemap (`sitemap.md`), and product type reference (`products.md`) are now in `.claude/agents/knowledge/` and accessed directly by agents. xAPI & REST API reference (`xapi-query-ref.md`) is now in `testing/qa-api/` — use `/qa-api ref <module>` to look up queries.

## Testing (10) — `testing/`

Manual invocation, delegates to specialist agents.

| Skill | Delegates To | Supporting Files |
|-------|-------------|-----------------|
| `/qa-storybook` | ui-ux-expert | visual-regression-testing.md, responsive-component-testing.md, how-to-test-storybook.md |
| `/qa-accessibility` | ui-ux-expert | wcag-accessibility-checklist.md |
| `/qa-design` | ui-ux-expert | design-system-consistency.md, ux-heuristic-evaluation.md |
| `/qa-plan` | test-management-specialist | e2e-scenario-catalog.md |
| `/qa-checklist` | test-management-specialist | domain-checklists.md, graphql-checklist.md, checklist-creation-guide.md |
| `/qa-api` | qa-backend-expert | xapi-query-ref.md, test-cases-api-graphql.md, api-test-case-patterns.md |
| `/qa-postman` | qa-backend-expert | mcp-tools.md, variables-and-environments.md, collections-and-requests.md, graphql-authoring.md, test-data-fixtures.md, execution.md, common-mistakes.md, examples.md |
| `/qa-coverage-gap` | test-management-specialist | coverage-gap-methodology.md, feature-domain-map.md |
| `/qa-seed-data` | qa-backend-expert | `knowledge/test-data-generation.md` (agent knowledge file) |
| `/qa-review-tests` | test-management-specialist + qa-testing-expert | review-criteria.md |

## QA Methodology (10) — `qa-methodology/`

Manual invocation, cross-team best practices. Process framework, reactive (post-bug), proactive (pre-testing), monitoring, and generation methodology.

### Process Framework

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-process` | ISTQB 7-phase lifecycle: Plan, Analyze, Design, Implement, Execute, Report, Close — entry/exit criteria, phase-to-skill mapping, Analyze & Close deep dives | test-process-lifecycle.md |

### Reactive (post-bug)

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-investigate` | 5-phase bug investigation, common VC patterns (P1-P8) | bug-investigation-flow.md |
| `/qa-evidence` | Evidence capture policy, 3-tier report verbosity, output paths | evidence-capture-policy.md, output-paths.md, sign-off-templates.md |
| `/qa-defect` | Defect management lifecycle: JIRA Bug Workflow (16 statuses), triage, classification, verification, metrics | defect-lifecycle-workflow.md, defect-report-templates.md |

### Proactive (pre-testing)

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-test-design` | Systematic test case derivation: EP, BVA, decision tables, state transitions, pairwise, error guessing | test-design-techniques.md |
| `/qa-risk` | Risk-based test prioritization: 5x5 matrix, severity/priority classification, test depth allocation | risk-prioritization-framework.md |
| `/qa-metrics` | Quality metrics & gates: pass rate, defect density, DRE, coverage, gate enforcement | quality-metrics-catalog.md, quality-gates.md |
| `/qa-sbtm` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT heuristics, tours, debrief | session-based-testing.md |

### Monitoring (online)

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-monitoring` | Online bug monitoring from Application Insights: query both layers → dedup by fingerprint → triage new/spiking signatures → reproduce HIGH-confidence bugs live → draft reports + Teams alert. Detect-and-report only (twin of `ci/run-monitor.ts`) | SKILL.md (KQL probe library + triage taxonomy + dedup model) |

### Generation

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-test-cases-generator` | Generate agent-native test cases in enriched CSV format from JIRA tickets, features, checklists, or legacy suites | test-case-template.md, test-case-examples.md |

## Development (5) — `development/`

Manual invocation, used by the **developers/** team in `/qa-fix` (the only write-capable team). One
test-skill + one fix-skill per repo kind; backend adds the Admin-SPA path.

| Skill | Invoked by | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/dotnet-unit-test` | fullstack-backend | Reproduce a VC backend bug as a failing xUnit test (red) | xunit-patterns.md |
| `/dotnet-fix` | fullstack-backend | Minimal, idiomatic .NET 10 fix → green; build+test gate | fix-patterns.md, dotnet10-best-practices.md |
| `/angular-admin` | fullstack-backend | Fix a module's Admin SPA (AngularJS) UI in-repo; red→green via uncommitted Node scratch harness | angular-patterns.md, scratch-harness-patterns.md |
| `/vue-unit-test` | fullstack-frontend | Reproduce a vc-frontend storefront bug as a failing vitest test (red); `@vue/test-utils` + `effectScope` | vitest-patterns.md |
| `/vue-fix` | fullstack-frontend | Minimal, idiomatic Vue 3 / TS fix → green; vue-tsc + lint + vitest + build gate | vue-fix-patterns.md, vue3-best-practices.md |

> `/storybook-test` (UI-kit Storybook play-function interaction tests) is planned/optional — `fullstack-frontend` degrades to a `/vue-unit-test` component test when it's absent.

## Dependency Graph

```
qa-api (ref mode) --> supplement with vc-docs (Context7)
qa-postman --> prerequisite for qa-api (test mode) and qa-seed-data (collection building)
qa-seed-data --> references qa-postman (collection/environment creation patterns)
qa-process --> orchestrates all qa-methodology skills (the umbrella lifecycle)
qa-process (Analyze) --> feeds into qa-test-design (test condition → test case)
qa-process (Close) --> feeds back into qa-process (Plan) via retrospective loop
qa-investigate --> references qa-evidence (capture policy)
qa-investigate --> feeds into qa-defect (triage, classification)
qa-defect --> references qa-risk (severity/priority classification)
qa-defect --> references qa-evidence (report validation, sign-off)
qa-defect --> feeds into qa-metrics (defect counts, escape rates, reopen rates)
qa-test-design --> feeds into qa-plan (test suite composition)
qa-checklist --> feeds into qa-plan (ensures domain coverage)
qa-checklist --> references qa-test-design (expand items into test cases)
qa-risk --> informs qa-test-design (technique selection by risk level)
qa-risk --> informs qa-sbtm (charter prioritization)
qa-metrics --> enforced by regression-orchestrator (gate evaluation)
qa-sbtm --> references qa-risk (high-risk areas), qa-test-design (error guessing)
qa-coverage-gap --> references qa-plan (E2E catalog), qa-checklist (domain coverage)
qa-test-cases-generator --> references qa-test-design (derivation techniques), qa-checklist (domain items)
qa-coverage-gap --> feeds into qa-test-cases-generator (generates missing cases)
qa-storybook, qa-accessibility, qa-design --> delegate to ui-ux-expert agent
qa-plan --> delegates to test-management-specialist agent
qa-api --> delegates to qa-backend-expert agent
qa-coverage-gap --> delegates to test-management-specialist agent
Learning loop: qa-investigate (bug) --> qa-defect (triage) --> qa-risk (update) --> qa-sbtm (charter) --> qa-metrics (coverage)
```

## Agent -> Skill Map

> **Note:** All QA agents also reference the auto-invocable `vc-knowledge` skill (`/vc-docs`) and may access knowledge files in `agents/knowledge/` directly. These are omitted from the map below for brevity.

| Agent | Skills Referenced |
|-------|-----------------|
| qa-lead-orchestrator | qa-risk, qa-metrics, qa-process, qa-defect, qa-evidence, qa-investigate, qa-checklist |
| qa-frontend-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm, qa-design, qa-plan |
| qa-backend-expert | qa-api, qa-postman, qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm |
| qa-testing-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm, qa-design, qa-plan, qa-api, qa-postman |
| ui-ux-expert | qa-storybook, qa-accessibility, qa-design, qa-evidence, qa-investigate, qa-defect |
| test-management-specialist | qa-plan, qa-checklist, qa-evidence, qa-test-design, qa-test-cases-generator, qa-risk, qa-process, qa-sbtm, qa-metrics |
| regression-orchestrator | qa-metrics (gate enforcement after runs) |
| autonomous-regression-orchestrator | — (orchestration only, no skill references) |

## Frontmatter Reference

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Shown in `/` menu. Prefix with `[Category]` tag. |
| `argument-hint` | Yes | Autocomplete hint for arguments. |
| `disable-model-invocation` | No | Set `true` to prevent auto-triggering. Omit for read-only skills. |

## File Structure Convention

```
group-name/                   # Category group (vc-knowledge, testing, qa-methodology)
  skill-name/
    SKILL.md                  # Main instructions (required)
    supporting-file-1.md      # Reference docs read on demand
    supporting-file-2.md      # Additional reference material
```
