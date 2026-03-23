# Agent System — Virto Commerce QA & BA

Two agent teams for the Virto Commerce platform: **QA** (quality assurance) and **BA** (business analysis).

## Quick Start

```
/qa-smoke                    # Daily smoke test (12 P0 tests, ~15 min)
/qa-test VCST-1234           # Test a specific JIRA ticket
/qa-regression critical      # Run P0 regression suites
/qa-regression full          # Full 45-suite regression
/ba-analyze                  # Full business analysis
/ba-analyze flows            # User flow analysis only
```

---

## Agent Inventory (14 agents + shared instructions)

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

### BA Team (4 agents)

| Agent | Model | Color | Purpose |
|-------|-------|-------|---------|
| **ba-system-analyzer** | sonnet | teal | Repo structure, modules, user flows, pain points |
| **ba-api-specialist** | sonnet | cyan | API surface via Postman/Swagger, health assessment |
| **ba-story-writer** | sonnet | yellow | Agile user stories with BDD acceptance criteria |
| **ba-doc-writer** | sonnet | indigo | User docs, admin guides, API quick-start |

---

## Slash Commands (13)

### QA Commands

| Command | Purpose | Speed |
|---------|---------|-------|
| `/qa-smoke` | Daily pre-deploy smoke (12 P0 tests, GO/NO-GO) | ~15 min |
| `/qa-test VCST-XXXX` | Test a JIRA ticket, feature, or PR | varies |
| `/qa-regression [scope]` | Run regression suites (smoke/critical/sprint/full) | varies |
| `/qa-coverage-generation [scope]` | Orchestrated parallel coverage generation with CI support | varies |
| `/qa-test-lifecycle` | Full test case lifecycle: analyze → generate → review → verify | varies |
| `/qa-sync-tests` | Sync test cases with code changes (PR, ticket, module, diff) | varies |
| `/qa-verify-fix VCST-XXXX` | Verify a bug fix with regression checks | varies |
| `/qa-status` | Dashboard: run status, JIRA queue, env health | < 30 sec |
| `/qa-bug [description]` | Reproduce, document, and optionally file a JIRA bug | ~5 min |
| `/qa-exploratory [area]` | Guided exploratory testing session with heuristics | ~20 min |
| `/qa-env-check` | Validate env vars, endpoints, MCP servers, test infra | < 30 sec |

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
| `smoke` | 01 | Daily pre-deploy |
| `critical` | 01, 06, 08, 14 | P0 gate |
| `sprint` | 33 suites | Sprint release |
| `full` | All 45 | Production release |
| `frontend` | 01-13, 35-36, 41 | Frontend only |
| `backend` | 14-34, 37-40, 42 | Backend only |

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

Shared knowledge files in `knowledge/` (15 files): `api-auth.md`, `business-logic.md`, `platform-patterns.md`, `browser-quirks.md`, `debugging-signals.md`, `performance-thresholds.md`, `catalog.md`, `store-settings.md`, `white-labeling.md`, `e-commerce-edge-cases-library.md`, `module-suite-map.md`, `sitemap.md`, `products.md`, `graphiql-interaction.md`, `order-creation-matrix.md`.

---

## Customizing Agents

Agents are organized in subfolders: `.claude/agents/qa/` (10 QA agents + `shared-instructions.md`) and `.claude/agents/ba/` (4 BA agents). Shared knowledge files are in `.claude/agents/knowledge/` (15 files). Each agent is a Markdown file with YAML frontmatter (name, description, model, color). Edit the `.md` file to customize behavior.

---

## Requirements

- Claude Code with subagent/Task tool support
- Agent Teams mode enabled in `.claude/settings.json`
- MCP servers configured in `.mcp.json` (Playwright chrome/firefox/edge)
- `.env` with environment URLs and credentials (run `npm run env:check`)
