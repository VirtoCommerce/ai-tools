# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **QA testing documentation and MCP-driven testing repository** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools, Figma, Atlassian) enabling LLM-powered browser automation.

**Important:** This is NOT a traditional test automation codebase with `.spec.js` files. The primary workflow is LLM-driven test execution using prompt templates in `docs/prompts/`.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: Version 18 or higher
- **MCP Servers**: Configured in `.mcp.json`

> **New here?** See [`.claude/ROUTING.md`](.claude/ROUTING.md) for a quick decision tree on when to use which command, skill, or agent.

## Commands

```bash
npm install              # Install dependencies
npm run env:check        # Verify all required env vars (33 total) via get_variables_env.js
npm run ci:regression    # Run CI regression via Claude Agent SDK (npx tsx ci/run-regression.ts)
npm run ci:smoke         # Run smoke tests only (suite 01)
npm run ci:critical      # Run critical P0 suites (01, 06, 08, 14)
npm run ci:frontend      # Run all frontend suites (01-13, 35-36)
npm run ci:backend       # Run all backend suites (14-34)
npm run ci:full          # Run full regression (all 36 suites, $80 budget)
npm run ci:coverage      # Run coverage generation pipeline (npx tsx ci/run-coverage.ts)
npm run ci:notify        # Send Teams notification (requires TEAMS_WEBHOOK_URL)
```

## Environment Setup

Create a `.env` file with required variables (33 total). Run `npm run env:check` to validate. Key groups:
- **URLs:** `FRONT_URL`, `BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK`, `STORYBOOK_URL`, `STORYBOOK_DEV_URL`
- **Credentials:** `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO`, `USER_VIRTO_PASSWORD`
- **Store:** `STORE_ID`
- **Payment processors:** Skyflow (`SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV`), CyberSource, Authorize.Net, Datatrance (card/expiry/cvv + `DATATRANCE_OTP`)
- **APIs:** `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `POSTMAN_API_KEY`
- **Builder.io (optional):** `BUILDER_IO_URL`, `BUILDER_IO_EMAIL`, `BUILDER_IO_PASSWORD`, `BUILDER_IO_SPACE`

Access via `config.js`: `import { env } from './config.js'`

**Note:** This project uses ES modules (`"type": "module"` in `package.json`). Always use `.js` extensions in imports.

## Environment Configuration

- QA environment URLs must come from environment variables, never hardcoded. When referencing environments (QA, Stage, Prod), always check env config files for the correct URL mapping.
- Default testing environment is QA unless explicitly specified otherwise.

## Repository Structure

```
vc-mcp-testing-module/
├── INDEX.md                 # Top-level repo navigation hub (quick links to all directories)
├── .claude/agents/          # Claude Code agent configurations (11 agents, tracked in git)
│   └── knowledge/           # Shared agent reference files (9 files: business-logic, platform-patterns, browser-quirks, debugging-signals, performance-thresholds, catalog, store-settings, white-labeling, test-data-generation)
├── .claude/skills/          # Skills grouped by category (20 skills in 3 groups, tracked in git)
│   ├── vc-knowledge/        # VC docs, module analysis, API reference, storefront reference (4 skills)
│   ├── testing/             # Storybook, accessibility, design, plan, API, seed data (6 skills)
│   └── qa-methodology/      # Process, investigation, evidence, test design, risk, metrics, SBTM, defect (8 skills)
├── .claude/commands/        # Slash commands (9 commands, tracked in git)
├── .mcp.json                # MCP server configuration (gitignored, local-only)
├── config/                  # Playwright MCP browser configs + test-suites.json manifest
├── ci/                      # CI regression (Docker + Claude Agent SDK, gitignored)
│   ├── agents/              # CI-specific agent definitions (3 agents)
│   ├── config/              # Headless browser config for CI
│   ├── run-regression.ts    # Orchestrator script
│   └── notify-teams.ts      # Teams webhook notifications
├── docs/prompts/            # LLM prompt templates for QA automation
├── docs/workshop/           # Team onboarding workshop (plan, setup, presentation)
├── .claude/ROUTING.md       # Decision tree: when to use which command/skill/agent
├── regression/suites/       # Regression test suites (Frontend/ + Backend/ subdirs, CSV format)
├── test-data/               # Test data (organizations, search queries, uploads)
├── tests/                   # Test cases organized by sprint (Sprint26-02/, Sprint26-03/) then JIRA ticket
│   └── INDEX.md             # Entry point: active test cases grouped by domain
├── reports/                 # Bug reports and regression test reports
├── archive/sprints/         # Historical sprint test cases                
├── Test suites & Cases/     # Original TestRail export (source-of-truth reference: Backend, E2E, Frontend)
├── scripts/                 # Utility scripts (reporting.ts, skill-usage, presentation generator)
├── results/                 # Autonomous regression run outputs (gitignored, transient)
├── config.js                # Environment configuration (loads .env)
```

**Gitignored:** `settings.json`, `.env`, `.mcp.json`, `test-results/`, `results/`, `.serena/`, `.playwright-mcp/`, `ci/`, `.github/`, `.claude/settings.local.json`

**Tracked in git:** `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/hooks.json`, `.claude/playwright-baseline.json`, `config/` — agent definitions, skills, slash commands, hooks, and browser configs are version-controlled.

**Note on `ci/`:** The `ci/` directory is gitignored and will not exist after a fresh clone. It must be created locally. See the CI Regression section for required structure. The `npm run ci:*` scripts will fail without it.

**Note on `.mcp.json`:** This file is gitignored. After cloning, create it locally. Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly. See the MCP Servers section for required server configuration.

## Architecture: Three Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK
`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/`, injects them into prompts with agent instructions from `ci/agents/` (3 CI-specific agent definitions: `qa-frontend-expert.md`, `qa-backend-expert.md`, `qa-testing-expert.md`), and runs suites in parallel batches (up to 3 concurrent, configurable via `MAX_PARALLEL`). Results are tracked in `reports/regression/history.json` (90-day rolling window). Teams notifications via `ci/notify-teams.ts`.

**Note:** CI mode uses only `playwright-chrome` (single headless Chromium) for all suites, regardless of agent type. The 3-browser pool (chrome/firefox/edge) applies only to interactive mode. CI environment mapping: `qa` → `FRONT_URL`/`BACK_URL`, `staging` → `VIRTO_START_FRONT`/`VIRTO_START_BACK`.

**Regression Orchestration Pipeline (interactive mode):**
1. `regression-orchestrator` agent reads `config/test-suites.json` manifest
2. Resolves suite selection (`smoke`, `critical`, `sprint`, `full`, or comma-separated IDs)
3. Assigns suites to browser pool slots (3 slots: chrome, firefox, edge)
4. Spawns sub-agents using `docs/prompts/test-runner-agent.md` template with substituted parameters (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.)
5. Each sub-agent gets an isolated browser context, executes all test cases from its CSV, writes JSON results
6. Orchestrator collects results, handles retries with browser fallback chain, produces consolidated report

### 3. Autonomous Interactive Regression (Agent Teams)
`autonomous-regression-orchestrator` creates a team of child agents using Agent Teams API (TeamCreate, SendMessage, TaskCreate). Each child gets an isolated browser context, fresh authentication, and exponential backoff (30s→60s→120s). The orchestrator manages a 3+1 token bucket (3 browser + 1 reporting agent), tracks failures in `results/{RUN_ID}/failures.json`, retries failed suites with browser fallback chain (max 3 attempts), and produces a consolidated report with quality gate evaluation and optional JIRA ticket creation via Atlassian MCP.

**Invoke:** `/qa-regression critical --autonomous` or use `autonomous-regression-orchestrator` agent directly.
**Results:** `results/{RUN_ID}/` (regression-report.md, summary.json, failures.json, per-suite results)
**Reporting module:** `scripts/reporting.ts` (generate reports, JIRA payloads, status updates)

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
| **github** | PR review, code search, issue management | N/A (uses `GITHUB_PERSONAL_ACCESS_TOKEN` via `GIT_TOKEN`) |
| **context7** | Up-to-date library documentation lookup | N/A (HTTP MCP at `mcp.context7.com`, uses `CONTEXT7_API_KEY`) |

Additional MCP servers (configured at user level or in IDE settings, not in `.mcp.json`):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** - Visual comparison testing against design specs

All 6 servers in the table above are configured in `.mcp.json` (project-level). The 3 additional servers above are typically configured at the user/IDE level.

## Browser Automation

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, HAR capture enabled, video on failure, isolated contexts.

## Claude Code Specialized Agents

12 agents in `.claude/agents/` across two teams (QA + BA). See `.claude/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints). Shared reference files in `.claude/agents/knowledge/`: `business-logic.md`, `platform-patterns.md`, `browser-quirks.md`, `debugging-signals.md`, `performance-thresholds.md`, `catalog.md`, `store-settings.md`, `white-labeling.md` (8 files) — these are cross-agent knowledge bases that agents should consult during testing. `business-logic.md` — testable business invariants: pricing, cart, checkout, orders, auth, B2B, catalog, cross-domain.

### QA Team (8 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, makes go/no-go decisions |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression + smoke mode, retries, browser fallback, consolidated reports |
| **autonomous-regression-orchestrator** | sonnet | Agent Teams regression: token bucket, exponential backoff, failure recovery, JIRA integration |

### BA Team (4 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, module inventory, user flows, pain points |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | User docs, admin guides, API quick-start, UX improvement specs |

### Slash Commands (10) — `.claude/commands/`

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
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|module <name>]` | No | Business analysis (full/flows/api/docs/stories/module) |
| `/ba-stories` | `feature name \| VCST-XXXX` | No | Generate Agile user stories with BDD acceptance criteria |

### Skills (20) — `.claude/skills/` (grouped by category)

Skills are slash commands with supporting reference files, organized into 3 category directories. Each skill has a `SKILL.md` with `[Category]` tag in the description. See `.claude/skills/README.md` for full reference.

**`vc-knowledge/` — Virto Commerce Knowledge (4) — auto-invocable:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/vc-docs` | `topic \| module \| concept` | Documentation lookup via Context7 | — (uses Context7 MCP) |
| `/vc-module` | `module name \| suite ID` | Module analysis and test suite mapping | `module-suite-map.md` |
| `/vc-api` | `xCart \| xCatalog \| REST` | xAPI & REST API query reference | `xapi-query-ref.md` |
| `/vc-frontend` | `page \| URL \| product type \| account \| menu \| sitemap` | Storefront reference: page URLs, navigation, product types, account structure, test data | `sitemap.md` |

**`testing/` — Testing (8) — manual invocation:**

| Skill | Arguments | Purpose | Supporting Files |
|-------|-----------|---------|-----------------|
| `/qa-storybook` | `component \| atoms \| all` | Storybook visual regression, responsive breakpoints | `visual-regression-testing.md`, `responsive-component-testing.md` |
| `/qa-accessibility` | `page URL \| component \| full` | WCAG 2.1 AA accessibility audit (POUR principles) | `wcag-accessibility-checklist.md` |
| `/qa-design` | `component \| page \| flow` | Design system consistency & UX heuristics | `design-system-consistency.md`, `ux-heuristic-evaluation.md` |
| `/qa-plan` | `feature \| domain \| VCST-XXXX` | Test plans from E2E scenario catalog (105 scenarios) | `e2e-scenario-catalog.md` |
| `/qa-checklist` | `domain \| feature \| VCST-XXXX \| new <domain>` | Test case writing checklists (18 domains + Bug Fix Verification, 158 items) | `domain-checklists.md`, `checklist-creation-guide.md` |
| `/qa-api` | `endpoint \| module \| graphql` | REST API & GraphQL xAPI testing | `test-cases-api-graphql.md` |
| `/qa-coverage-gap` | `analyze \| generate \| validate \| full \| domain <name> \| suite <ID>` | Autonomous test coverage gap analysis and generation (4-cycle pipeline) | `coverage-gap-methodology.md`, `feature-domain-map.md` |
| `/qa-seed-data` | `minimal \| catalog \| b2b \| pricing \| full \| teardown` | Generate test data via Postman MCP: catalogs, products, pricing, inventory, users, orgs | `test-data-generation.md` (knowledge file) |

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
| `/qa-sbtm` | `domain \| charter type \| heuristic` | Session-based exploratory testing: SBTM charters, CRISP/SFDPOT, tours, debrief | `session-based-testing.md` |

Usage: `/qa-smoke`, `/qa-test VCST-1234`, `/qa-storybook Button`, `/vc-docs dynamic properties`, or use agents directly: `"Use qa-frontend-expert to test checkout"`

**Frontmatter fields:** `description` (shown in `/` menu with `[Category]` tag), `argument-hint` (autocomplete hint), `disable-model-invocation: true` (prevents Claude from auto-triggering). Only read-only commands/skills (`/qa-status`, `/qa-env-check`, `/vc-docs`, `/vc-module`, `/vc-api`, `/vc-frontend`) allow model invocation.

**Agent Teams mode** is enabled via `settings.json` (`teammateMode: "in-process"`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). A `post_edit` hook in `.claude/hooks/hooks.json` runs TypeScript type-checking (`npx tsc --noEmit`) after edits.

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
- `test-runner-agent.md` - Suite execution template with parameterized placeholders (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.) for regression orchestrator
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

## Regression Test Suites

36 modular suites + 1 master suite in `regression/suites/` (organized in `Frontend/` and `Backend/` subdirectories) in TestRail CSV format (`ID, Title, Section, Type, Priority, Estimate, Preconditions, Steps, Expected Result, References, Automation Status`). Full definitions in `config/test-suites.json`. **Total: ~1,546 test cases** (~643 frontend + 903 backend). Always refer to `config/test-suites.json` for authoritative counts — CSV suites evolve.

- **Suite 00** (`Frontend/00-full-regression-release.csv`): Master suite — 90 consolidated P0/P1 test cases for major releases
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

**Note:** The CI `run-regression.ts` dynamically loads suite definitions from `config/test-suites.json` at startup, so adding new suites to the manifest automatically makes them available to CI. Selection groups (`smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`) are also defined in the manifest's `selections` block.

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
tests/SprintXX-XX/VCST-XXXX-feature/
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

Visual regression baselines are captured on-demand by the `/qa-storybook` skill (delegated to `ui-ux-expert` agent). No persistent `storybook/` directory is needed — baselines are stored in test evidence directories per ticket. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`). See `.claude/skills/testing/qa-storybook/` for methodology and guides.

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
