# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **QA testing documentation and MCP-driven testing repository** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools, Figma, Atlassian) enabling LLM-powered browser automation.

**Important:** This is NOT a traditional test automation codebase with `.spec.js` files. The primary workflow is LLM-driven test execution using prompt templates in `docs/prompts/`.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: Version 18 or higher
- **MCP Servers**: Configured in `.mcp.json`

## Commands

```bash
npm install              # Install dependencies
npm run env:check        # Verify all required env vars (29 total) via get_variables_env.js
npm run ci:regression    # Run CI regression via Claude Agent SDK (npx tsx ci/run-regression.ts)
npm run ci:smoke         # Run smoke tests only (suite 01)
npm run ci:critical      # Run critical P0 suites (01, 06, 08, 14)
npm run ci:frontend      # Run all frontend suites (01-13, 35-36)
npm run ci:backend       # Run all backend suites (14-34)
npm run ci:full          # Run full regression (all 36 suites, $80 budget)
npm run ci:notify        # Send Teams notification (requires TEAMS_WEBHOOK_URL)
```

## Environment Setup

Create a `.env` file with required variables (29 total). Run `npm run env:check` to validate. Key groups:
- **URLs:** `FRONT_URL`, `BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK`
- **Credentials:** `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO`, `USER_VIRTO_PASSWORD`
- **Store:** `STORE_ID`
- **Payment processors:** Skyflow (`SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV`), CyberSource, Authorize.Net, Datatrance (card/expiry/cvv + `DATATRANCE_OTP`)
- **APIs:** `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `POSTMAN_API_KEY`
- **Builder.io (optional):** `BUILDER_IO_URL`, `BUILDER_IO_EMAIL`, `BUILDER_IO_PASSWORD`, `BUILDER_IO_SPACE`

Access via `config.js`: `import { env } from './config.js'`

## Environment Configuration

- QA environment URLs must come from environment variables, never hardcoded. When referencing environments (QA, Stage, Prod), always check env config files for the correct URL mapping.
- Default testing environment is QA unless explicitly specified otherwise.

## Repository Structure

```
vc-mcp-testing-module/
├── .claude/agents/          # Claude Code agent configurations (13 agents, gitignored)
├── .claude/skills/          # Skills grouped by category (16 skills in 3 groups, gitignored)
│   ├── vc-knowledge/        # VC docs, module analysis, API reference (3 skills)
│   ├── testing/             # Storybook, accessibility, design, plan, API (5 skills)
│   └── qa-methodology/      # Process, investigation, evidence, test design, risk, metrics, exploratory, defect (8 skills)
├── .claude/commands/        # Slash commands (9 commands, gitignored)
├── .mcp.json                # MCP server configuration (tracked but OS-specific)
├── config/                  # Playwright MCP browser configs + test-suites.json manifest
├── ci/                      # CI regression (Docker + Claude Agent SDK, gitignored)
│   ├── agents/              # CI-specific agent definitions (3 agents)
│   ├── config/              # Headless browser config for CI
│   ├── run-regression.ts    # Orchestrator script
│   └── notify-teams.ts      # Teams webhook notifications
├── docs/prompts/            # LLM prompt templates for QA automation
├── docs/guides/             # Testing guides (e.g., Storybook testing)
├── docs/references/         # Agent reference files (read on demand to reduce context)
│   ├── frontend-testing/    # 5 files: test cases (catalog, checkout, account-b2b, responsive), visual checklist
│   └── backend-testing/     # 4 files: admin CRUD, modules/jobs, import/export, integrations
├── storybook/               # Visual regression baselines (Atomic Design: atoms/molecules/organisms)
├── regression/suites/       # Regression test suites (Frontend + Backend, CSV format)
├── test-data/               # Test data (organizations, search queries, uploads)
├── tests/                   # Test cases organized by sprint and JIRA ticket
├── reports/                 # Bug reports and regression test reports
├── archive/sprints/         # Historical sprint test cases
├── config.js                # Environment configuration (loads .env)
└── sitemap.md               # Site structure reference
```

**Gitignored:** `.claude/` (agents, skills, commands), `settings.json`, `.env`, `test-results/`, `.serena/`, `.playwright-mcp/`, `ci/`, `.github/`

**Tracked but local-specific:** `.mcp.json` and `config/` are tracked in git. After cloning, verify MCP configs match your local setup (Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly).

## Architecture: Two Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK
`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/`, injects them into prompts with agent instructions from `ci/agents/` (3 CI-specific agent definitions: `qa-frontend-expert.md`, `qa-backend-expert.md`, `qa-testing-expert.md`), and runs suites in parallel batches (up to 3 concurrent, configurable via `MAX_PARALLEL`). Results are tracked in `reports/regression/history.json` (90-day rolling window). Teams notifications via `ci/notify-teams.ts`.

**Regression Orchestration Pipeline (interactive mode):**
1. `regression-orchestrator` agent reads `config/test-suites.json` manifest
2. Resolves suite selection (`smoke`, `critical`, `sprint`, `full`, or comma-separated IDs)
3. Assigns suites to browser pool slots (3 slots: chrome, firefox, edge)
4. Spawns sub-agents using `docs/prompts/test-runner-agent.md` template with substituted parameters (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.)
5. Each sub-agent gets an isolated browser context, executes all test cases from its CSV, writes JSON results
6. Orchestrator collects results, handles retries with browser fallback chain, produces consolidated report

### Test Suite Manifest: `config/test-suites.json`
Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: 36 suites (15 frontend + 21 backend) with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: `smoke` (01), `critical` (01,06,08,14), `sprint` (26 suites), `full` (all 36), `frontend` (01-13,35-36), `backend` (14-34)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Config File |
|--------|---------|-------------|
| **playwright-chrome** | Browser automation with Chromium | `config/mcp-playwright-chrome.config.json` |
| **playwright-firefox** | Browser automation with Firefox | `config/mcp-playwright-firefox.config.json` |
| **playwright-edge** | Browser automation with Edge | `config/mcp-playwright-edge.config.json` |
| **postman** | API testing - collections, environments, monitors | N/A (uses `--minimal` flag) |

Additional MCP servers (configured at user level, not in `.mcp.json`):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** - Visual comparison testing against design specs
- **Context7** - Up-to-date library documentation lookup (resolve-library-id, query-docs)

## Browser Automation

- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, HAR capture enabled, video on failure, isolated contexts.

## Claude Code Specialized Agents

13 agents in `.claude/agents/` across two teams (QA + BA). See `.claude/agents/README.md` for full documentation.

### QA Team (7 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, makes go/no-go decisions |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression + smoke mode, retries, browser fallback, consolidated reports |

### BA Team (4 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, module inventory, user flows, pain points |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | User docs, admin guides, API quick-start, UX improvement specs |

### Slash Commands (9) — `.claude/commands/`

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
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|module <name>]` | No | Business analysis (full/flows/api/docs/stories/module) |
| `/ba-stories` | `feature name \| VCST-XXXX` | No | Generate Agile user stories with BDD acceptance criteria |

### Skills (16) — `.claude/skills/` (grouped by category)

Skills are slash commands with supporting reference files, organized into 3 category directories. Each skill has a `SKILL.md` with `[Category]` tag in the description. See `.claude/skills/README.md` for full reference.

**`vc-knowledge/` — Virto Commerce Knowledge (3) — auto-invocable:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/vc-docs` | `topic \| module \| concept` | Documentation lookup via Context7 | — (uses Context7 MCP) |
| `/vc-module` | `module name \| suite ID` | Module analysis and test suite mapping | `module-suite-map.md` |
| `/vc-api` | `xCart \| xCatalog \| REST` | xAPI & REST API query reference | `xapi-query-ref.md` |

**`testing/` — Testing (5) — manual invocation:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/qa-storybook` | `component \| atoms \| all` | Storybook visual regression, responsive breakpoints | `visual-regression-testing.md`, `responsive-component-testing.md` |
| `/qa-accessibility` | `page URL \| component \| full` | WCAG 2.1 AA accessibility audit (POUR principles) | `wcag-accessibility-checklist.md` |
| `/qa-design` | `component \| page \| flow` | Design system consistency & UX heuristics | `design-system-consistency.md`, `ux-heuristic-evaluation.md` |
| `/qa-plan` | `feature \| domain \| VCST-XXXX` | Test plans from E2E scenario catalog (105 scenarios) | `e2e-scenario-catalog.md` |
| `/qa-api` | `endpoint \| module \| graphql` | REST API & GraphQL xAPI testing | `test-cases-api-graphql.md` |

**`qa-methodology/` — QA Methodology (8) — manual invocation:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/qa-process` | `[phase name \| analyze VCST-XXXX \| close sprint-XX \| gates]` | ISTQB 7-phase lifecycle: Plan, Analyze, Design, Implement, Execute, Report, Close with entry/exit criteria | `test-process-lifecycle.md` |
| `/qa-investigate` | `bug description \| VCST-XXXX` | Bug investigation (5 phases) and root cause analysis | `bug-investigation-flow.md` |
| `/qa-evidence` | `[compact\|detailed\|signoff]` | Evidence capture & report formatting, output paths | `evidence-capture-policy.md`, `output-paths.md`, `sign-off-templates.md` |
| `/qa-defect` | `triage VCST-XXXX \| verify VCST-XXXX \| classify \| workflow \| metrics` | Defect management lifecycle: JIRA Bug Workflow (16 statuses), triage, classification, verification, metrics | `defect-lifecycle-workflow.md`, `defect-report-templates.md` |
| `/qa-test-design` | `feature name \| technique \| VCST-XXXX` | Test case derivation: EP, BVA, decision tables, state transitions, pairwise, error guessing | `test-design-techniques.md` |
| `/qa-risk` | `feature \| sprint \| release \| VCST-XXXX` | Risk-based test prioritization: 5x5 matrix, severity/priority, test depth allocation | `risk-prioritization-framework.md` |
| `/qa-metrics` | `[metrics\|gates\|report\|trends]` | Quality metrics & gates: pass rate, defect density, DRE, coverage, gate enforcement | `quality-metrics-catalog.md`, `quality-gates.md` |
| `/qa-exploratory-method` | `domain \| charter type \| heuristic` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT, tours, debrief | `session-based-testing.md` |

Usage: `/qa-smoke`, `/qa-test VCST-1234`, `/qa-storybook Button`, `/vc-docs dynamic properties`, or use agents directly: `"Use qa-frontend-expert to test checkout"`

**Frontmatter fields:** `description` (shown in `/` menu with `[Category]` tag), `argument-hint` (autocomplete hint), `disable-model-invocation: true` (prevents Claude from auto-triggering). Only read-only commands/skills (`/qa-status`, `/qa-env-check`, `/vc-docs`, `/vc-module`, `/vc-api`) allow model invocation.

**Agent Teams mode** is enabled via `settings.json` (`teammateMode: "in-process"`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The `settings.json` also configures a `post_edit` hook that runs TypeScript type-checking after edits.

**Parallel execution:** When running multiple agents in parallel, each agent MUST use its own separate browser session via a different Playwright MCP server. Agents sharing a browser will interfere with each other (navigation, cookies, state). Assign one MCP server per agent:

| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | |
| **ui-ux-expert** | `Chrome DevTools MCP` | (no webkit on Windows) |
| **test-management-specialist** | `playwright-chrome` (sequential, not parallel with frontend) | |

BA agents do not require browsers. Max 3 concurrent browser agents. Never use WebKit on Windows.

## Agent Delegation

- When delegating to sub-agents/specialist agents, verify the agent has the required tool permissions BEFORE dispatching.
- If a delegated agent fails with an internal error (e.g., classifyHandoffIfNeeded), immediately fall back to working directly rather than retrying the same broken delegation.
- For multi-suite regression runs, plan for rate limits: batch in groups of 3 (matching browser pool slots) rather than launching all simultaneously.

## Prompt Templates

Key prompt templates in `docs/prompts/`:
- `full-regression-qa-agent.md` - Complete Admin + Frontend regression
- `test-runner-agent.md` - Suite execution template with parameterized placeholders (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.) for regression orchestrator
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.txt` - Story-level testing prompt

## Regression Test Suites

36 suites in `regression/suites/` (15 frontend + 21 backend) in TestRail CSV format (`ID, Title, Section, Type, Priority, Estimate, Preconditions, Steps, Expected Result, References, Automation Status`). Full definitions in `config/test-suites.json`.

- **Frontend** (suites 01-13, 35-36): Smoke, Auth, Catalog, Cart, BOPIS, Payment, GA4, Security, A11y, i18n, Perf, Browser Compat, B2C, White Labeling, Configurable Products
- **Backend** (suites 14-34): Platform API, GraphQL xAPI, Catalog/Store/Pricing/Orders/Customer/Inventory/Marketing/Notifications/CMS/Search/Assets/Settings Admin, CSV Import/Export, Shipping, SEO, White Labeling, Push Messages, Image Tools
- **P0 suites**: 01 (Smoke), 06 (Payment), 08 (Security), 14 (Platform API)

### Selection Groups (from test-suites.json)

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily validation before deployment |
| `critical` | 01, 06, 08, 14 | P0 suites only |
| `sprint` | 26 suites (01-06, 08, 14-27, 29-31, 35-36) | Before sprint release |
| `full` | All 36 | Before production release |
| `frontend` | 01-13, 35-36 | Frontend-only regression |
| `backend` | 14-34 | Backend-only regression |

## CI Regression Testing

The `ci/` directory provides Docker-based CI regression using the Claude Agent SDK:

```bash
docker build -t vc-regression -f ci/Dockerfile .
docker run --rm --shm-size=2gb --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  vc-regression
```

Suite selection accepts the same group names as above, or comma-separated IDs (`01,04,06`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports go to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary).

**Note:** The CI `run-regression.ts` has its own `SUITE_MAP` (suites 00-17) that is a subset of the full `test-suites.json` manifest (36 suites). The CI script needs updating to cover the newer backend suites (18-34) and frontend suites (35-36).

**Scheduled Pipeline (GitHub Actions - `.github/workflows/regression.yml`):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 01 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all suites ($80 budget)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## Testing Approach

- For regression testing, NEVER use parallel agents sharing a single browser session. Each agent must have its own isolated browser context.
- Always run deep/comprehensive tests unless explicitly told to run smoke tests. Do not default to smoke testing.
- Always capture HAR files during browser test sessions as required by project guidelines.

## Testing Environments (from .env)

| Resource | Environment Variable |
|----------|---------------------|
| **Frontend** | `FRONT_URL` |
| **Backend** | `BACK_URL` |
| **Storybook QA** | `STORYBOOK_URL` |
| **Storybook Dev** | `STORYBOOK_DEV_URL` |

Theme presets: Coffee

## Test Documentation Pattern

```
tests/VCST-XXXX-feature/
├── test-plan.md              # Test strategy and scope
├── test-cases.md             # Detailed test specifications (or .csv)
├── test-execution-report.md  # Results with pass/fail status
├── testrail-import.csv       # TestRail import format
└── screenshots/
    ├── desktop/
    └── mobile/
```

## Bug Report Format

Reports in `reports/bugs/`:
- **Severity:** Critical/High/Medium/Low
- **Environment:** URL, Browser, Store Version, Date
- **STR:** Numbered, deterministic steps to reproduce
- **Expected vs Actual:** Explicit comparison
- **Evidence:** Screenshots, HAR files, console logs, API traces
- **References:** VCST-XXXX ticket link

## Team Communication

- The team uses Microsoft Teams. All sign-off templates and notification references should use Teams.

## Storybook Visual Regression

The `storybook/` directory stores visual regression baselines organized by Atomic Design tier: `atoms/`, `molecules/`, `organisms/`, `design-system/`. Each component folder has a `baselines/` directory for screenshots. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`).

## Critical Revenue Flows

Must always pass before deployment:
1. Registration / Sign-in / Password reset
2. Catalog browsing with facets and filters
3. Add to cart (variations, configurations)
4. Search (global, category, history)
5. Ship-to selector and address management
6. Cart (quantity, save for later, pickup/delivery)
7. Checkout and payment processing (Skyflow, CyberSource, Authorize.Net, Datatrance)
8. Order management and history
9. Company members and multi-organization
10. Google Analytics event tracking

## Virto Commerce Platform Reference (via Context7)

Context7 library ID: `/virtocommerce/vc-docs`

Use `resolve-library-id` then `query-docs` to fetch up-to-date Virto Commerce documentation during testing and development tasks.

- **Architecture:** Modular, headless, .NET-based e-commerce platform with multi-store/multi-currency/multi-language
- **REST API:** CRUD operations, integrations, admin tools (used by backend agents, Postman)
- **GraphQL xAPI:** Frontend-optimized storefront queries — xCart, xCatalog, xOrder, xCMS (used by storefront, frontend agents). The xAPI was revamped July 2024 from monolithic `ExperienceApi` to specialized modules.
- **Frontend:** Vue.js storefront (themes), VC-Shell admin SPA (Angular)
- **Search:** Elasticsearch, Azure Cognitive Search, Algolia
- **Deployment:** On-prem (Windows/Linux), Docker, Azure App Services, Virto Cloud

## Key Testing Domains

- **B2B features:** Multi-org support, quotes, quick order, approval workflows, contract pricing
- **BOPIS:** Buy Online Pickup In Store (map, filters, location selection)
- **Multilingual:** 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)
- **Payment:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **Browser Matrix Desktop (last 2 versions):** Chrome, Edge, Firefox. **Mobile:** iPhone 16/17/18 (Safari), Android last 3 models (Chrome)
