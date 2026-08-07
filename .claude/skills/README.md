# skills/ — Skill Directory

> **40 skills**, each a `skills/<name>/SKILL.md` with YAML frontmatter and optional supporting
> reference files. Discovery is **one level, flat — there are no category subfolders**; the four
> categories below (VC Knowledge · Testing · QA Methodology · Development) are `[Category]` **tags in
> each skill's `description`**, not directories. Breakdown: **1 VC Knowledge + 12 Testing +
> 17 QA Methodology + 6 Development + 3 root-level** (uncategorized: `project-init`,
> `run-vc-mcp-testing-module`, `vc-self-check`; `qa-local-env` is grouped under Testing but carries no
> tag of its own). Note both `[QA Method]` and `[QA Methodology]` spellings exist in the wild — they are
> the same category.

## Directory Layout (flat)

```
skills/
├── vc-docs/                         # [VC Knowledge] Documentation lookup (VirtoOZ primary, Context7 fallback)
│
├── qa-storybook/                    # [Testing]  Storybook visual regression
├── qa-accessibility/                # [Testing]  WCAG 2.2 AA accessibility audit
├── qa-design/                       # [Testing]  Design system & UX heuristics
├── qa-plan/                         # [Testing]  Test plans from E2E catalog
├── qa-checklist/                    # [Testing]  Test-case writing checklists
├── qa-api/                          # [Testing]  REST API & GraphQL xAPI testing
├── qa-coverage-gap/                 # [Testing]  Autonomous coverage gap analysis
├── qa-postman/                      # [Testing]  Postman MCP collection builder
├── qa-seed-data/                    # [Testing]  Seed / tear down test data
├── qa-generate-data/                # [Testing]  Design + author test-data combinations (offline)
├── qa-review-tests/                 # [Testing]  11-dimension test-case quality review
├── qa-local-env/                    # [Testing]  Local VC stack via start-local (fresh DB per run)
│
├── qa-process/                      # [QA Methodology]  ISTQB 7-phase lifecycle
├── qa-investigate/                  # [QA Methodology]  Bug investigation (5 phases)
├── qa-evidence/                     # [QA Methodology]  Evidence capture & report formatting
├── qa-defect/                       # [QA Methodology]  Defect management lifecycle
├── qa-test-design/                  # [QA Methodology]  Test case derivation techniques
├── qa-risk/                         # [QA Methodology]  Risk-based prioritization
├── qa-metrics/                      # [QA Methodology]  Quality metrics & gates
├── qa-sbtm/                         # [QA Methodology]  Session-based exploratory testing
├── qa-monitoring/                   # [QA Methodology]  Online bug monitoring (App Insights)
├── qa-perf-measure/                 # [QA Method]  Deployed-env backend-work measurement (dependency counts, N+1)
├── qa-test-cases-generator/         # [QA Methodology]  Generate agent-native CSV test cases
├── qa-triage-results/               # [QA Methodology]  Triage a completed regression run's FAILs
├── qa-hotfix/                       # [QA Methodology]  Release a hotfix into stable bundles
├── qa-hotfix-check/                 # [QA Methodology]  Deliver a released hotfix onto deployed envs
├── qa-bundle-check/                 # [QA Methodology]  Audit a stable bundle for available hotfixes
│
├── dotnet-unit-test/                # [Development]  Reproduce a backend bug as a failing xUnit test
├── dotnet-fix/                      # [Development]  Minimal .NET 10 fix → green
├── angular-admin/                   # [Development]  Fix a module's Admin SPA (AngularJS) UI
├── vue-unit-test/                   # [Development]  Reproduce a vc-frontend bug as a failing vitest test
├── vue-fix/                         # [Development]  Minimal Vue 3 / TS fix → green
├── vc-shell-fix/                    # [Development]  Fix a module-embedded Vue 3 shell sub-app
│
├── project-init/                    # (root-level) Onboard the toolset onto a deployment
├── run-vc-mcp-testing-module/       # (root-level) Build / launch / smoke-test / health-check this repo
├── vc-self-check/                   # (root-level) Self-diagnostician (Tier B) → local DIAG-*.md
│
└── README.md                        # This file
```

## VC Knowledge (1)

Auto-invocable, read-only reference. No side effects.

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/vc-docs` | Documentation lookup — **primary: VirtoOZ MCP** (12 topic-scoped tools); Context7 (`/virtocommerce/vc-docs`) is the fallback | — (VirtoOZ + Context7 MCP) |

> **Note:** Module suite mapping (`module-suite-map.md`), storefront sitemap (`sitemap.md`), and product-type reference (`products.md`) live in `knowledge/` and are accessed directly by agents. xAPI & REST API reference (`xapi-query-ref.md`) lives in `qa-api/` — use `/qa-api ref <module>`.

## Testing (12)

Manual invocation, delegates to specialist agents.

| Skill | Delegates To | Supporting Files |
|-------|-------------|-----------------|
| `/qa-storybook` | ui-ux-expert | visual-regression-testing.md, responsive-component-testing.md, how-to-test-storybook.md |
| `/qa-accessibility` | ui-ux-expert | wcag-accessibility-checklist.md |
| `/qa-design` | ui-ux-expert | design-system-consistency.md, ux-heuristic-evaluation.md |
| `/qa-plan` | test-management-specialist | e2e-scenario-catalog.md |
| `/qa-checklist` | test-management-specialist | domain-checklists.md, backend-admin-checklists.md, graphql-checklist.md, checklist-creation-guide.md |
| `/qa-api` | qa-backend-expert | xapi-query-ref.md, test-cases-api-graphql.md, api-test-case-patterns.md |
| `/qa-coverage-gap` | test-management-specialist | coverage-gap-methodology.md, feature-domain-map.md |
| `/qa-postman` | qa-backend-expert | mcp-tools.md, variables-and-environments.md, collections-and-requests.md, graphql-authoring.md, test-data-fixtures.md, execution.md, common-mistakes.md, examples.md |
| `/qa-seed-data` | test-data-engineer | test-data-generation.md (knowledge file) |
| `/qa-generate-data` | test-data-engineer | SKILL.md (combination-design flow + no-hardcode rules) |
| `/qa-review-tests` | test-management-specialist + qa-testing-expert | review-criteria.md |
| `/qa-local-env` | (deterministic scripts) | resolve-task.mjs, resolve-theme.mjs, gen-manifest.mjs, provision.ps1, healthcheck.mjs, init-admin.mjs |

## QA Methodology (14)

Manual invocation (except `/qa-evidence` and `/qa-sbtm`, which are auto-invocable reference-only), cross-team best practices.

### Process Framework

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-process` | ISTQB 7-phase lifecycle: Plan, Analyze, Design, Implement, Execute, Report, Close | test-process-lifecycle.md |

### Reactive (post-bug)

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-investigate` | 5-phase bug investigation + evidence-to-claim root-cause worksheet (gated by `scripts/regression/bundle-evidence.ts`) | bug-investigation-flow.md, evidence-and-root-cause.md |
| `/qa-evidence` | Evidence capture policy, 3-tier report verbosity, output paths | evidence-capture-policy.md, output-paths.md, sign-off-templates.md |
| `/qa-defect` | Defect management lifecycle: JIRA Bug Workflow, triage, classification, verification, metrics | defect-lifecycle-workflow.md, defect-report-templates.md |
| `/qa-triage-results` | Triage a completed regression run's FAILs: classify real-bug vs test-defect vs flaky, live-verify, route fixes (never files a ticket) | triage-taxonomy.md, routing-and-fix.md |

### Proactive (pre-testing)

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-test-design` | EP, BVA, decision tables, state transitions, pairwise, error guessing | test-design-techniques.md |
| `/qa-risk` | Risk-based prioritization: 5x5 matrix, severity/priority, test depth | risk-prioritization-framework.md |
| `/qa-metrics` | Quality metrics & gates: pass rate, defect density, DRE, coverage | quality-metrics-catalog.md, quality-gates.md |
| `/qa-sbtm` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT | session-based-testing.md |

### Monitoring & Generation

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-monitoring` | Online bug monitoring from App Insights: query → dedup → triage → live repro → report (detect-and-report only; twin of `ci/run-monitor.ts`) | SKILL.md (KQL probes + triage taxonomy + dedup) |
| `/qa-perf-measure` | Measure backend work per request on a **deployed** env and prove whether a change moved it: dependency calls by type via the App Insights `operation_Id` join, N+1 detection by input-size scaling, paired positive/negative controls so a null result is trustworthy. Counts transfer cross-env; latency does not. Measure-and-report only | SKILL.md + `knowledge/execution/es-call-ab-method.md` (KQL + gotchas, fixture filter, confounds, control pairing, worked examples) |
| `/qa-test-cases-generator` | Generate agent-native CSV test cases from JIRA tickets, features, checklists, or legacy suites | test-case-template.md, test-case-examples.md |

### Hotfix / Release

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/qa-bundle-check` | Audit a stable bundle for module/Platform/Theme hotfixes available on the same major.minor line | SKILL.md (bundle resolution + same-line hotfix detection + PR/JIRA tracing) |
| `/qa-hotfix` | Release a hotfix of a merged+released fix into the current latest-stable bundles (gated writes, never auto-merges) | SKILL.md (ask-bundles step + hotfix mechanics + gate ladder) |
| `/qa-hotfix-check` | Deliver an already-released hotfix onto the deployed stable + regression envs; verify live, transition tickets, bump bundles | SKILL.md (env wiring + deploy-poll + verification + transition) |

## Development (6)

Manual invocation, used by the **developers/** team in `/qa-fix` (the only write-capable team). One
test-skill + one fix-skill per repo kind; backend adds the Admin-SPA path; frontend adds the
module-embedded Vue 3 sub-app path.

| Skill | Invoked by | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/dotnet-unit-test` | fullstack-backend | Reproduce a VC backend bug as a failing xUnit test (red) | xunit-patterns.md |
| `/dotnet-fix` | fullstack-backend | Minimal, idiomatic .NET 10 fix → green; build+test gate | fix-patterns.md, dotnet10-best-practices.md |
| `/angular-admin` | fullstack-backend | Fix a module's Admin SPA (AngularJS) UI in-repo; logic red→green via Node scratch harness, layout/CSS via platform class catalog + visual render harness | admin-spa-ui-conventions.md, css-layout-patterns.md, visual-render-harness.md, angular-patterns.md, scratch-harness-patterns.md |
| `/vue-unit-test` | fullstack-frontend | Reproduce a vc-frontend storefront bug as a failing vitest test (red); `@vue/test-utils` + `effectScope` | vitest-patterns.md |
| `/vue-fix` | fullstack-frontend | Minimal, idiomatic Vue 3 / TS fix → green; vue-tsc + lint + vitest + build gate | vue-fix-patterns.md, vue3-best-practices.md |
| `/vc-shell-fix` | fullstack-frontend | Fix a module-embedded Vue 3 "shell" sub-app (`@vc-shell/framework`); state/logic red→green via the sub-app's own real `tsx --test` runner, mounted-component/DOM via an ephemeral never-committed harness | vc-shell-scratch-harness-patterns.md |

> `/storybook-test` (UI-kit Storybook play-function interaction tests) is planned/optional — `fullstack-frontend` degrades to a `/vue-unit-test` component test when it's absent.

## Root-level (3)

Outside the four QA categories.

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/project-init` | Onboard the toolset onto a deployment — native-platform vs client; tracker + VCS host; write `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json`; verify access. The profile is what routes each `/qa-fix` to the right repo + tracker | scaffold-env.mjs, scaffold-secrets.mjs, write-env.mjs, gen-profile.mjs, discover-repos.mjs, gen-mcp.mjs, verify-access.mjs |
| `/run-vc-mcp-testing-module` | Build / launch / smoke-test / health-check this tooling repo (env:check, `@td()` resolution, suite-manifest sync, GraphQL fixture validation, seed dry-run) | SKILL.md |
| `/vc-self-check` | Tier-B self-diagnostician — reads the passive session-telemetry jsonl + transcript + skill-expectations oracle → per-skill verdict into a local `DIAG-*.md`; the consent-gated `deliver` sub-step contributes a scrubbed quality report to VirtoCommerce. Never modifies the install | SKILL.md, deliver.mjs |

## Agent → Skill Map

> All QA agents also reference the auto-invocable `/vc-docs` and may read `knowledge/` files directly. Omitted below for brevity.

| Agent | Skills Referenced |
|-------|-----------------|
| qa-lead-orchestrator | qa-risk, qa-metrics, qa-process, qa-defect, qa-evidence, qa-investigate, qa-checklist |
| qa-frontend-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm, qa-design, qa-plan |
| qa-backend-expert | qa-api, qa-postman, qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm |
| qa-testing-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-sbtm, qa-design, qa-plan, qa-api, qa-postman |
| ui-ux-expert | qa-storybook, qa-accessibility, qa-design, qa-evidence, qa-investigate, qa-defect |
| test-management-specialist | qa-plan, qa-checklist, qa-evidence, qa-test-design, qa-test-cases-generator, qa-risk, qa-process, qa-sbtm, qa-metrics, qa-review-tests, qa-coverage-gap |
| test-data-engineer | qa-generate-data, qa-seed-data |
| fullstack-backend | dotnet-unit-test, dotnet-fix, angular-admin |
| fullstack-frontend | vue-unit-test, vue-fix, vc-shell-fix |
| regression-orchestrator | qa-metrics (gate enforcement after runs) |
| autonomous-regression-orchestrator | — (orchestration only) |

## Frontmatter Reference

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Shown in `/` menu. Prefix with `[Category]` tag. |
| `argument-hint` | Yes | Autocomplete hint for arguments. |
| `disable-model-invocation` | No | Set `true` to prevent auto-triggering. Omit for read-only skills. |

## File Structure Convention

```
skill-name/
  SKILL.md                  # Main instructions (required)
  supporting-file-1.md      # Reference docs read on demand
  supporting-file-2.md      # Additional reference material
```
