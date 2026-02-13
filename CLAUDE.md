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
npm run ci:frontend      # Run all frontend suites (01-13)
npm run ci:backend       # Run all backend suites (14-17)
npm run ci:full          # Run full regression (all 17 suites, $80 budget)
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
├── .claude/agents/          # Claude Code agent configurations (7 agents)
├── .mcp.json                # MCP server configuration
├── config/                  # Playwright MCP browser configs + test-suites.json manifest
├── docs/prompts/            # LLM prompt templates for QA automation
├── docs/guides/             # Testing guides (e.g., Storybook testing)
├── storybook/               # Visual regression baselines (Atomic Design: atoms/molecules/organisms)
├── regression/suites/       # Regression test suites (Frontend + Backend, CSV format)
├── test-data/               # Test data (organizations, search queries, uploads)
├── tests/                   # Test cases organized by sprint and JIRA ticket
├── reports/                 # Bug reports and regression test reports
├── archive/sprints/         # Historical sprint test cases
├── ci/                      # CI regression testing (Docker + Claude Agent SDK)
├── config.js                # Environment configuration (loads .env)
└── sitemap.md               # Site structure reference
```

**Gitignored (not in repo):** `.claude/`, `settings.json`, `.env`, `test-results/`, `.serena/`, `.playwright-mcp/`

**Tracked but local-specific:** `.mcp.json` and `config/` are tracked in git. After cloning, verify MCP configs match your local setup (Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly).

## Architecture: Two Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK
`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/Frontend/` and `regression/suites/Backend/`, injects them into prompts with agent instructions from `ci/agents/`, and runs them in parallel batches (up to 3 concurrent) against headless Chrome MCP server. Results are tracked in `reports/regression/history.json` for trend analysis. Teams notifications are sent via `ci/notify-teams.ts`.

**Regression Orchestration Pipeline (interactive mode):**
1. `regression-orchestrator` agent reads `config/test-suites.json` manifest
2. Resolves suite selection (`smoke`, `critical`, `sprint`, `full`, or comma-separated IDs)
3. Assigns suites to browser pool slots (3 slots: chrome, firefox, edge)
4. Spawns sub-agents using `docs/prompts/test-runner-agent.md` template with substituted parameters
5. Each sub-agent gets an isolated browser context, executes all test cases from its CSV, writes JSON results
6. Orchestrator collects results, handles retries with browser fallback chain, produces consolidated report

### Test Suite Manifest: `config/test-suites.json`
Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: id, name, CSV file path, priority, test count, assigned agent type, tags (17 suites: 13 frontend + 4 backend)
- **Selection groups**: `smoke` (01), `critical` (01,06,08,14), `sprint` (01-06,08,14,16), `full` (all 17), `frontend` (01-13), `backend` (14-17)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Config File |
|--------|---------|-------------|
| **playwright-chrome** | Browser automation with Chromium | `config/mcp-playwright-chrome.config.json` |
| **playwright-firefox** | Browser automation with Firefox | `config/mcp-playwright-firefox.config.json` |
| **playwright-edge** | Browser automation with Edge | `config/mcp-playwright-edge.config.json` |
| **postman** | API testing - collections, environments, monitors | N/A (uses `--minimal` flag) |

**Postman MCP** tools: `searchPostmanElements`, `getCollection`, `runCollection`, `getEnvironment`, `createCollection`

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

Seven agents in `.claude/agents/` for QA tasks:

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead** (orchestrator) | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, makes go/no-go decisions |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression execution - reads test-suites.json, spawns sub-agents, manages retries, consolidates reports |

Usage: `"Use the qa-frontend-expert to verify the checkout flow"` or `@qa-lead`

**Agent Teams mode** is enabled via `settings.json` (`teammateMode: "in-process"`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). The `settings.json` also configures a `post_edit` hook that runs TypeScript type-checking after edits.

**Parallel execution:** When running multiple agents in parallel, each agent MUST use its own separate browser session via a different Playwright MCP server. Agents sharing a browser will interfere with each other (navigation, cookies, state). Assign one MCP server per agent:

| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | |
| **ui-ux-expert** | `Chrome DevTools MCP` | (no webkit on Windows) |
| **test-management-specialist** | `playwright-chrome` (sequential, not parallel with frontend) | |

If more than 3 agents need browsers simultaneously, run them in sequential batches.

## Agent Delegation

- When delegating to sub-agents/specialist agents, verify the agent has the required tool permissions BEFORE dispatching.
- If a delegated agent fails with an internal error (e.g., classifyHandoffIfNeeded), immediately fall back to working directly rather than retrying the same broken delegation.
- For multi-suite regression runs, plan for rate limits: batch in groups of 3 (matching browser pool slots) rather than launching all simultaneously.

## Prompt Templates

Key prompt templates in `docs/prompts/`:
- `full-regression-qa-agent.md` - Complete Admin + Frontend regression
- `test-runner-agent.md` - Suite execution template with parameterized placeholders (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, etc.) for regression orchestrator
- `storybook-testing.md` - Component testing
- `platform-tests.md` - Backend/API testing
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `setup.xml` - XML-structured regression prompt with execution steps
- `story-testing.txt` - Story-level testing prompt

## Regression Test Suites

### Frontend Suites (regression/suites/Frontend/)

14 CSV files in TestRail CSV format:

| Suite | Tests | Priority | Use Case |
|-------|-------|----------|----------|
| 00-full-regression-release | 90 | P0 | Composite suite for full release regression |
| 01-smoke-tests | 12 | P0 | Daily validation before deployment |
| 02-authentication-tests | 28 | P1 | Login, SSO, password management |
| 03-catalog-search-tests | 23 | P1 | Browsing, filters, search |
| 04-cart-checkout-tests | 31 | P1 | Cart ops, checkout flow |
| 05-bopis-pickup-tests | 27 | P1 | Buy Online Pickup In Store |
| 06-payment-tests | 28 | P0 | All payment processors |
| 07-google-analytics-tests | 24 | P2 | GA4 event tracking |
| 08-security-tests | 18 | P0 | PCI compliance, auth security |
| 09-accessibility-tests | 23 | P1 | WCAG 2.1 AA compliance |
| 10-localization-tests | 21 | P2 | 13 languages |
| 11-performance-tests | 20 | P2 | Load times, Core Web Vitals |
| 12-browser-compatibility-tests | 21 | P1 | Cross-browser matrix |
| 13-b2c-features-tests | 49 | P1 | B2C variations, wishlists, compare, reviews |

### Backend Suites (regression/suites/Backend/)

4 CSV files covering platform APIs, GraphQL, Admin SPA, and module configuration:

| Suite | Tests | Priority | Use Case |
|-------|-------|----------|----------|
| 14-platform-api-tests | 25 | P0 | REST API: Catalog, Pricing, Inventory, Orders, Customer CRUD |
| 15-graphql-xapi-tests | 20 | P1 | GraphQL xAPI: xCart, xCatalog, xOrder, xCMS queries/mutations |
| 16-admin-spa-tests | 25 | P1 | Admin SPA: Login, Catalog CRUD, Order management, Settings |
| 17-module-config-tests | 15 | P2 | Module management, Cache, Search index, Import/Export |

**Execution strategies:** Daily smoke (suite 01, ~30min), Critical P0 (01+06+08+14, ~2hrs), Sprint (01-06+08+14+16, ~4hrs), Full regression (all 17 suites, ~8hrs with parallelism)

## CI Regression Testing

The `ci/` directory provides Docker-based CI regression using the Claude Agent SDK:

```bash
# Build and run locally
docker build -t vc-regression -f ci/Dockerfile .
docker run --rm --shm-size=2gb --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  vc-regression
```

Suite selection: `smoke` (01), `critical` (01,06,08,14), `sprint` (01-06,08,14,16), `full` (all 17), `frontend` (01-13), `backend` (14-17), or comma-separated IDs (`01,04,06`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports are written to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary). Result history tracked in `reports/regression/history.json` (90-day rolling window).

**Scheduled Pipeline (GitHub Actions):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 01 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all 17 suites ($80 budget)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook with pass/fail summary, cost, duration, and a link to the GitHub Actions run. Requires `TEAMS_WEBHOOK_URL` secret.

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

Theme presets: Default, Coffee

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

Context7 library ID: `/virtocommerce/vc-docs` (6,033 code snippets, High reputation)

Use `resolve-library-id` then `query-docs` to fetch up-to-date Virto Commerce documentation during testing and development tasks.

### Platform Architecture
- **Framework:** Enterprise-level, open-source, .NET-based e-commerce platform
- **Architecture:** Modular, headless commerce — business logic exposed via APIs
- **Capabilities:** Multi-store, multi-currency, multi-language deployments

### API Layers
| API | Purpose | Used By |
|-----|---------|---------|
| **REST API** | CRUD operations, integrations, admin tools | Backend agents, Postman collections |
| **GraphQL xAPI** | Frontend-optimized storefront queries (xCart, xCatalog, xOrder, xCMS) | Storefront, frontend agents |

The xAPI architecture was revamped in July 2024 — the monolithic `ExperienceApi` module was replaced with specialized modules (archived for Stable 8/9).

### Tech Stack
- **Database:** SQL Server, PostgreSQL, MySQL
- **Search:** Elasticsearch, Azure Cognitive Search, Algolia
- **Frontend:** Vue.js storefront (themes), VC-Shell admin SPA (Angular)
- **Deployment:** On-prem (Windows/Linux), Docker, Azure App Services, Virto Cloud

### Documentation Areas
- **Platform** — backend admin, developer guides, cloud deployment
- **Storefront** — Vue.js frontend, theme customization
- **Marketplace** — multi-vendor operator & vendor portals

### Common Context7 Queries
```
# Resolve the library first
resolve-library-id("VirtoCommerce", "Virto Commerce platform docs")
# Then query specific topics
query-docs("/virtocommerce/vc-docs", "GraphQL xAPI cart mutations addItem removeItem")
query-docs("/virtocommerce/vc-docs", "custom module development tutorial")
query-docs("/virtocommerce/vc-docs", "payment provider integration")
query-docs("/virtocommerce/vc-docs", "VC-Shell admin SPA blade system")
query-docs("/virtocommerce/vc-docs", "Elasticsearch search indexing configuration")
```

## Key Testing Domains

- **B2B features:** Multi-org support, quotes, quick order, approval workflows, contract pricing
- **BOPIS:** Buy Online Pickup In Store (map, filters, location selection)
- **Multilingual:** 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)
- **Payment:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **Browser Matrix Desktop (last 2 versions):** Chrome, Edge, Firefox. **Mobile:** iPhone 16/17/18 (Safari), Android last 3 models (Chrome)
