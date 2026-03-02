# .claude/skills/ — Skill Directory

> 16 skills organized in 3 category groups. Each skill has a `SKILL.md` with YAML frontmatter and optional supporting reference files.

## Directory Structure

```
.claude/skills/
├── vc-knowledge/                    # VC Knowledge (3) — auto-invocable, read-only
│   ├── vc-docs/
│   │   └── SKILL.md                 # Documentation lookup via Context7
│   ├── vc-module/
│   │   ├── SKILL.md                 # Module analysis and test suite mapping
│   │   └── module-suite-map.md
│   └── vc-api/
│       ├── SKILL.md                 # xAPI & REST API reference
│       └── xapi-query-ref.md
│
├── testing/                         # Testing (5) — manual invocation
│   ├── qa-storybook/
│   │   ├── SKILL.md                 # Storybook visual regression
│   │   ├── visual-regression-testing.md
│   │   └── responsive-component-testing.md
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
│   └── qa-api/
│       ├── SKILL.md                 # REST API & GraphQL xAPI testing
│       └── test-cases-api-graphql.md
│
├── qa-methodology/                  # QA Methodology (8) — cross-team practices
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
│   ├── qa-exploratory-method/
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
└── README.md                        # This file
```

## VC Knowledge (3) — `vc-knowledge/`

Auto-invocable, read-only reference skills. No side effects.

| Skill | Purpose | Supporting Files |
|-------|---------|-----------------|
| `/vc-docs` | Documentation lookup via Context7 | -- (Context7 MCP) |
| `/vc-module` | Module -> test suite mapping, dependencies, API surface | module-suite-map.md |
| `/vc-api` | xAPI & REST API query/mutation reference | xapi-query-ref.md |

## Testing (5) — `testing/`

Manual invocation, delegates to specialist agents.

| Skill | Delegates To | Supporting Files |
|-------|-------------|-----------------|
| `/qa-storybook` | ui-ux-expert | visual-regression-testing.md, responsive-component-testing.md |
| `/qa-accessibility` | ui-ux-expert | wcag-accessibility-checklist.md |
| `/qa-design` | ui-ux-expert | design-system-consistency.md, ux-heuristic-evaluation.md |
| `/qa-plan` | test-management-specialist | e2e-scenario-catalog.md |
| `/qa-api` | qa-backend-expert | test-cases-api-graphql.md |

## QA Methodology (8) — `qa-methodology/`

Manual invocation, cross-team best practices. Process framework, reactive (post-bug), and proactive (pre-testing) methodology.

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
| `/qa-exploratory-method` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT heuristics, tours, debrief | session-based-testing.md |

## Dependency Graph

```
vc-module, vc-api --> supplement with vc-docs (Context7)
qa-process --> orchestrates all qa-methodology skills (the umbrella lifecycle)
qa-process (Analyze) --> feeds into qa-test-design (test condition → test case)
qa-process (Close) --> feeds back into qa-process (Plan) via retrospective loop
qa-investigate --> references qa-evidence (capture policy)
qa-investigate --> feeds into qa-defect (triage, classification)
qa-defect --> references qa-risk (severity/priority classification)
qa-defect --> references qa-evidence (report validation, sign-off)
qa-defect --> feeds into qa-metrics (defect counts, escape rates, reopen rates)
qa-test-design --> feeds into qa-plan (test suite composition)
qa-risk --> informs qa-test-design (technique selection by risk level)
qa-risk --> informs qa-exploratory-method (charter prioritization)
qa-metrics --> enforced by regression-orchestrator (gate evaluation)
qa-exploratory-method --> references qa-risk (high-risk areas), qa-test-design (error guessing)
qa-storybook, qa-accessibility, qa-design --> delegate to ui-ux-expert agent
qa-plan --> delegates to test-management-specialist agent
qa-api --> delegates to qa-backend-expert agent
Learning loop: qa-investigate (bug) --> qa-defect (triage) --> qa-risk (update) --> qa-exploratory-method (charter) --> qa-metrics (coverage)
```

## Agent -> Skill Map

| Agent | Skills Referenced |
|-------|-----------------|
| qa-lead-orchestrator | qa-risk, qa-metrics, qa-process |
| qa-frontend-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-exploratory-method |
| qa-backend-expert | qa-api, qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-risk, qa-exploratory-method |
| qa-testing-expert | qa-evidence, qa-investigate, qa-defect, qa-test-design, qa-exploratory-method |
| ui-ux-expert | qa-storybook, qa-accessibility, qa-design, qa-evidence, qa-investigate |
| test-management-specialist | qa-plan, qa-evidence, qa-test-design, qa-risk, qa-process |
| regression-orchestrator | qa-metrics (gate enforcement after runs) |

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
