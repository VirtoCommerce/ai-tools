# Routing Guide — When to Use What

Quick decision tree for commands, skills, and agents.

## By Action

| I want to... | Use | Type |
|--------------|-----|------|
| **Run smoke tests** | `/qa-smoke` | Command |
| **Run regression suites** | `/qa-regression [smoke\|critical\|sprint\|full\|IDs]` | Command |
| **Run autonomous regression** | `/qa-regression [scope] --autonomous` | Command |
| **Test a JIRA ticket/feature/PR** | `/qa-test VCST-XXXX` | Command |
| **Run exploratory testing session** | `/qa-exploratory [checkout\|catalog\|B2B\|mobile]` | Command |
| **Get a test checklist for a domain** | `/qa-checklist domain` | Skill |
| **Analyze test coverage gaps** | `/qa-coverage-gap analyze` | Skill |
| **File or investigate a bug** | `/qa-bug description` | Command |
| **Check environment health** | `/qa-env-check` | Command |
| **See QA dashboard** | `/qa-status` | Command |
| **Run business analysis** | `/ba-analyze [full\|flows\|api\|docs]` | Command |
| **Generate user stories** | `/ba-stories feature-name` | Command |

## By Category

### Run Tests (Commands — execute immediately)
- `/qa-smoke` — Daily smoke (12 P0 tests, GO/NO-GO)
- `/qa-test` — Test a ticket, feature, or PR
- `/qa-regression` — Run regression suites in parallel (add `--autonomous` for Agent Teams mode with failure recovery + JIRA)
- `/qa-exploratory` — Guided exploratory session
- `/qa-bug` — Reproduce and document bugs

### Plan Tests (Skills — methodology reference)
- `/qa-plan` — Test plans from E2E scenario catalog
- `/qa-checklist` — Test case writing checklists (18 domains, 158 items)
- `/qa-test-design` — Test case derivation (EP, BVA, decision tables)
- `/qa-risk` — Risk-based prioritization (5x5 matrix)
- `/qa-sbtm` — SBTM charters, heuristics, tours, debrief
- `/qa-coverage-gap` — Autonomous coverage gap analysis and test case generation

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
- `/vc-module` — Module analysis and suite mapping
- `/vc-api` — xAPI & REST API query reference
- `/vc-frontend` — Storefront reference: URLs, navigation, product types, account structure, test data

### Agents (use directly for complex multi-step work)
- `qa-lead-orchestrator` — Coordinates testing, go/no-go decisions
- `qa-frontend-expert` — Storefront, checkout, mobile, cross-browser
- `qa-backend-expert` — APIs, Admin SPA, background jobs
- `qa-testing-expert` — Interactive testing, Figma comparison, debugging
- `test-management-specialist` — Test planning, case writing, coverage
- `ui-ux-expert` — Storybook, accessibility, design system
- `regression-orchestrator` — Parallel regression, retries, consolidated reports
- `autonomous-regression-orchestrator` — Agent Teams regression: token bucket, failure recovery, JIRA

## Cross-References

| Command | Related Skill | Notes |
|---------|--------------|-------|
| `/qa-exploratory` | `/qa-sbtm` | Command runs sessions; skill provides methodology |
| `/qa-smoke` | `/qa-plan` | Smoke uses E2E scenario catalog for P0 selection |
| `/qa-regression` | `/qa-metrics` | Regression results feed into quality gates |
| `/qa-bug` | `/qa-investigate`, `/qa-defect` | Bug command uses investigation flow + defect templates |
| `/qa-test` | `/qa-test-design`, `/qa-checklist`, `/qa-risk` | Test derives cases, applies domain checklists, and prioritizes based on risk |
| `/qa-regression` | `/qa-coverage-gap` | Coverage gap analysis validates suite completeness before regression runs |
