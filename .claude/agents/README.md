# Agent System — Virto Commerce QA & BA

Three agent teams for the Virto Commerce platform: **QA** (quality assurance), **BA** (business analysis), and **Developers** (the only write-capable team — bug auto-fix via `/qa-fix`).

## Quick Start

```
/qa-smoke                    # Daily smoke test (12 P0 tests, ~15 min)
/qa-test VCST-1234           # Test a specific JIRA ticket
/qa-regression critical      # Run P0 regression suites
/qa-regression full          # Full 104-suite regression
/ba-analyze                  # Full business analysis
/ba-analyze flows            # User flow analysis only
```

---

## Agent Inventory (18 agents + per-team shared instructions)

### QA Team (10 agents + shared-instructions)

| Agent | Model | Color | Purpose |
|-------|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | red | Orchestrates testing, JIRA workflow, go/no-go decisions |
| **qa-frontend-expert** | opus | orange | Storefront, checkout, mobile, cross-browser |
| **qa-backend-expert** | opus | blue | REST APIs, GraphQL, Admin SPA, modules |
| **qa-testing-expert** | opus | green | Interactive testing, Figma comparison, debugging |
| **ui-ux-expert** | sonnet | pink | Storybook, WCAG 2.1 AA, design system |
| **test-management-specialist** | sonnet | purple | Test planning, case writing, coverage tracking |
| **regression-orchestrator** | sonnet | orange | Parallel regression + smoke mode, retries, reports |
| **autonomous-regression-orchestrator** | sonnet | orange | Agent Teams regression: token bucket, failure recovery, JIRA integration |
| **autonomous-test-runner** | sonnet | orange | Standalone autonomous test execution agent |
| **test-runner-agent** | sonnet | orange | Parameterized suite runner (used by regression orchestrator) |

### BA Team (4 agents + shared-instructions)

Team framework: `.claude/agents/ba/shared-instructions.md`.

| Agent | Model | Color | Purpose |
|-------|-------|-------|---------|
| **ba-system-analyzer** | sonnet | teal | Repo structure, modules, user flows, pain points |
| **ba-api-specialist** | sonnet | cyan | API surface via Postman/Swagger, health assessment |
| **ba-story-writer** | sonnet | yellow | Agile user stories with BDD acceptance criteria |
| **ba-doc-writer** | sonnet | indigo | Audience-targeted docs — Customer / Admin / Developer / Sales (per `knowledge/virto-doc-style.md`) |

### Developers Team (4 agents + shared-instructions)

The **only write-capable team** (clone / branch / commit / push / open PR via local `git`/`gh`). The QA
team stays read-only on GitHub. Driven by `/qa-fix` (interactive twin of `ci/run-fix-cycle.ts`); reuses
`ci/config/fix-repos.json` + `ci/lib/repo-router.ts` + `ci/lib/module-registry.ts`. **One developer +
one reviewer per repo kind**, picked by the routed repo's `kind`. Gate ladder:
`.claude/rules/quality-gates.md`. **Never auto-merges.** No browser.

| Agent | Model | Color | Purpose |
|-------|-------|-------|---------|
| **fullstack-backend** | opus | green | Fixes a single `vc-module-*` / `vc-platform` repo — .NET 10 / C# + the module's Admin SPA (Angular). Reproduce-as-test → minimal fix → PR. Interactive twin of `ci/agents/fix-backend-agent.md`. Skills: `/dotnet-unit-test`, `/dotnet-fix`, `/angular-admin`. |
| **backend-reviewer** | opus | blue | Reviews the C#/Angular local diff before the PR (Gate 4): single-repo, no test edits, no breaking changes, BL-* preserved, minimal & idiomatic. |
| **fullstack-frontend** | opus | cyan | Fixes the `vc-frontend` storefront — Vue 3 / TS / Vite + the in-repo UI kit + Storybook. Reproduce-as-vitest-test → minimal fix → PR. Interactive twin of `ci/agents/fix-frontend-agent.md`. Skills: `/vue-unit-test`, `/vue-fix` (`/storybook-test` optional). |
| **frontend-reviewer** | opus | blue | Reviews the Vue/TS local diff before the PR (Gate 4): single-repo, no test/story edits, no breaking prop/event/slot or GraphQL contract, BL-UI preserved, minimal & idiomatic. |

---

## Slash Commands (19)

Full argument reference: [`.claude/rules/skills-commands.md`](../rules/skills-commands.md).

### QA Commands

| Command | Purpose | Speed |
|---------|---------|-------|
| `/qa-smoke` | Daily pre-deploy smoke (12 P0 tests, GO/NO-GO) | ~15 min |
| `/qa-test VCST-XXXX` | Test a JIRA ticket, feature, or PR | varies |
| `/qa-regression [scope]` | Run regression suites (smoke/critical/sprint/full) | varies |
| `/qa-coverage-generation [scope]` | Orchestrated parallel coverage generation with CI support | varies |
| `/qa-test-lifecycle` | Unified pipeline: sync stale cases + analyze gaps + generate + review + verify (PR, module, diff, suite, domain) | varies |
| `/qa-test-plan [sprint]` | Build a sprint test plan from JIRA + merged PRs in the sprint window | varies |
| `/qa-verify-fix VCST-XXXX` | Verify a bug fix with regression checks | varies |
| `/qa-status` | Dashboard: run status, JIRA queue, env health | < 30 sec |
| `/qa-bug [description]` | Reproduce, document, and optionally file a JIRA bug | ~5 min |
| `/qa-fix VCST-XXXX` | Autonomous fix of an already-filed bug: triage → reproduce-as-test → minimal single-repo fix → PR → STOP for human review (never auto-merges) | varies |
| `/qa-monitoring [layer]` | Online bug monitoring from App Insights: query → dedup → triage → live repro → report (detect-and-report only) | varies |
| `/qa-design [target]` | Dual Storybook + Storefront BL-UI audit | varies |
| `/qa-exploratory [area]` | Guided exploratory testing session with heuristics | ~20 min |
| `/qa-seed-data [profile]` | Seed / tear down test data (Postman MCP + seed scripts) | varies |
| `/qa-env-check` | Validate env vars, endpoints, MCP servers, test infra | < 30 sec |
| `/qa-onboarding [env]` | Customer onboarding flow: install → first green smoke run + first bug filed | varies |
| `/qa-sync-tests` | _(deprecated — redirects to `/qa-test-lifecycle`)_ | — |

### BA Commands

| Command | Purpose | Speed |
|---------|---------|-------|
| `/ba-analyze [scope]` | Full business analysis (flows/api/docs/stories) | varies |
| `/ba-stories [feature]` | Generate Agile user stories with BDD criteria | ~5 min |

---

## Workflow Architecture

```
                        USER
                    ┌────┴─────┐
              /qa-* commands    /ba-analyze
                    │                │
         ┌─────────┴──────┐    BA Orchestrator
         │                │         │
    qa-lead          regression-   ├── ba-system-analyzer  ┐
   (orchestrator)    orchestrator  ├── ba-api-specialist    ┘ parallel
         │                │        ├── ba-story-writer (sequential)
    ┌────┼────┐      spawns 3      └── ba-doc-writer (last)
    │    │    │      sub-agents
  front back test   per batch        Output → docs/ba-output/
  expert expert expert
    │    │    │
  chrome edge firefox
    │    │    │
    └────┼────┘
    reports/regression/
```

### Browser Isolation

Each parallel agent MUST use its own Playwright MCP server:

| Agent | Primary Browser | Fallback |
|-------|----------------|----------|
| qa-frontend-expert | playwright-chrome | — |
| qa-backend-expert | playwright-edge | Chrome DevTools |
| qa-testing-expert | playwright-firefox | — |
| ui-ux-expert | Chrome DevTools | — |
| test-management-specialist | Sequential only (shares chrome) | — |

Max 3 concurrent browser agents. Never use WebKit on Windows.

---

## QA Workflows

### 1. Smoke Test (`/qa-smoke`)
Splits into 2 parallel tracks: storefront (chrome) + admin (edge). Delivers GO/NO-GO verdict in ~15 min.

### 2. Ticket Testing (`/qa-test VCST-XXXX`)
Reads JIRA ticket, maps to affected components, dispatches specialists, reports with pass/fail per AC.

### 3. Regression (`/qa-regression [scope]`)
Reads `config/test-suites.json`, dispatches sub-agents in batches of 3, retries with browser fallback chain.

**Autonomous mode** (`/qa-regression [scope] --autonomous`): Uses `autonomous-regression-orchestrator` with Agent Teams for enhanced orchestration — 3+1 token bucket, exponential backoff (30s→60s→120s), persistent failure tracking, consolidated reporting via `scripts/reporting.ts`, and auto-JIRA ticket creation. Results in `results/{RUN_ID}/`.

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 042, 078 | Daily pre-deploy |
| `critical` | 042, 078, 039, 044, 049 | P0 gate |
| `sprint` | Plan-driven (sprint-*-summary.json) | Sprint release |
| `full` | All 104 | Production release |
| `frontend` | All Frontend/ suites | Frontend only |
| `backend` | All Backend/ suites | Backend only |

### 4. Ad-hoc Testing
Use specialists directly via Agent tool:
```
"Use qa-frontend-expert to test the checkout flow"
"Use qa-backend-expert to verify the GraphQL catalog queries"
"Use ui-ux-expert to audit accessibility on the product page"
```

---

## BA Workflows

### Full Analysis (`/ba-analyze`)
Runs all 4 agents in pipeline: analyzer+api in parallel, then story-writer, then doc-writer.

### Targeted Analysis
```
/ba-analyze flows            # User flow analysis + improvements
/ba-analyze api              # API inventory and health check
/ba-analyze docs             # Generate user documentation
/ba-analyze stories          # User stories for all pain points
/ba-analyze stories checkout # Stories for a specific flow
/ba-analyze module Catalog   # Focus on one VC module
```

**Output directory:** `docs/ba-output/`

---

## Prompt Architecture (QA Agents)

QA agents use a **four-layer prompt architecture**:

1. **Business Logic** (invariants) — what the correct business outcome is → `knowledge/business-logic.md`
2. **Domain Knowledge** (judgment) — what good implementation looks like
3. **Skill Set** (technique) — how to find what's broken
4. **Design Decisions** (constraints) — tools and boundaries

Shared knowledge files in `knowledge/` (27 files) — full annotated list in `.claude/rules/agents.md`. Includes `business-logic.md`, `graphql-schema.md`, `graphql-test-cases-runner.md`, `live-discovery.md`, `vc-module-architecture.md`, and the BA documentation style guide `virto-doc-style.md` (four audience skeletons: Customer / Admin / Developer / Sales).

---

## Customizing Agents

Agents are organized in subfolders: `.claude/agents/qa/` (10 QA agents + `shared-instructions.md`), `.claude/agents/ba/` (4 BA agents + `shared-instructions.md`), and `.claude/agents/developers/` (4 agents + `shared-instructions.md`). Shared knowledge files are in `.claude/agents/knowledge/` (27 files). Each agent is a Markdown file with YAML frontmatter (name, description, model, color). Edit the `.md` file to customize behavior.

---

## Documentation Sources (all agents)

For any Virto Commerce platform / module / API / storefront / deployment / B2B question, **all agents must query VirtoOZ MCP first** via the `/vc-docs` skill. VirtoOZ exposes 12 topic-scoped retrieval tools — pick the narrowest one (e.g. `PlatformDeveloperGuide` for backend API questions, `StorefrontDeveloperGuide` for vc-frontend, `B2BExperts` for B2B-specific guidance, `*SourceCode` tools for code-level questions). Context7 (`/virtocommerce/vc-docs`) is the fallback when VirtoOZ returns thin results or for non-VC libraries. Full tool list and routing rules in `.claude/skills/vc-knowledge/vc-docs/SKILL.md` and `.claude/rules/mcp-browsers.md`.

## Requirements

- Claude Code with subagent/Task tool support
- Agent Teams mode enabled in `.claude/settings.json`
- MCP servers configured in `.mcp.json` (Playwright chrome/firefox/edge)
- User/IDE-level MCPs configured: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ**
- `.env` with environment URLs and credentials (run `npm run env:check`)
