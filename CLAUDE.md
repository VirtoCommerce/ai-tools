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
npm test                 # Run Playwright tests
npm run test:headed      # With visible browser
npm run test:debug       # Debug mode
npm run test:chrome      # Chrome only (--project=chromium)
npm run test:report      # View HTML report
```

## Environment Setup

Create a `.env` file with required variables (29 total). Run `npm run env:check` to validate. Key groups:
- **URLs:** `FRONT_URL`, `BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK`
- **Credentials:** `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO`, `USER_VIRTO_PASSWORD`
- **Store:** `STORE_ID`
- **Payment processors:** Skyflow (`SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV`), CyberSource, Authorize.Net, Datatrance (card/expiry/cvv + `DATATRANCE_OTP`)
- **APIs:** `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`
- **Builder.io (optional):** `BUILDER_IO_URL`, `BUILDER_IO_EMAIL`, `BUILDER_IO_PASSWORD`, `BUILDER_IO_SPACE`

Access via `config.js`: `import { env } from './config.js'`

## Repository Structure

```
vc-mcp-testing-module/
├── .claude/agents/          # Claude Code agent configurations (6 agents)
├── .mcp.json                # MCP server configuration
├── config/                  # Playwright MCP browser configs (chrome, webkit, firefox, edge)
├── docs/
│   ├── prompts/             # LLM prompt templates for QA automation
│   └── guides/              # Testing guides (e.g., Storybook testing)
├── storybook/               # Visual regression baselines (Atomic Design: atoms/molecules/organisms)
├── regression/
│   └── suites/              # 12 regression test suites (283 test cases, CSV)
├── test-data/               # Test data (organizations, search queries, uploads)
├── tests/VCST-XXXX-*/       # Test cases organized by JIRA ticket
├── reports/
│   ├── bugs/                # Bug reports with evidence
│   └── regression/          # Regression test reports
├── archive/sprints/         # Historical sprint test cases
├── config.js                # Environment configuration
└── sitemap.md               # Site structure reference
```

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Config File |
|--------|---------|-------------|
| **playwright-chrome** | Browser automation with Chrome | `config/mcp-playwright-chrome.config.json` |
| **playwright-webkit** | Browser automation with WebKit (Safari) | `config/mcp-playwright-webkit.config.json` |
| **playwright-firefox** | Browser automation with Firefox | `config/mcp-playwright-firefox.config.json` |
| **playwright-edge** | Browser automation with Edge | `config/mcp-playwright-edge.config.json` |
| **postman** | API testing - collections, environments, monitors | N/A (uses `--minimal` flag) |

**Postman MCP** tools: `searchPostmanElements`, `getCollection`, `runCollection`, `getEnvironment`, `createCollection`

Additional MCP servers (configured at user level):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** - Visual comparison testing against design specs
- **Serena** - Semantic code navigation and symbol-level editing

**Note:** `.mcp.json`, `config/`, `.claude/`, and `CLAUDE.md` are gitignored. New clones must set up MCP configs and agent definitions locally.

## Claude Code Specialized Agents

Six agents in `.claude/agents/` for QA tasks:

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |

Usage: `"Use the qa-frontend-expert to verify the checkout flow"` or `@qa-lead`

**Parallel execution:** When running multiple agents in parallel, each agent MUST use its own separate browser session via a different Playwright MCP server. Agents sharing a browser will interfere with each other (navigation, cookies, state). Assign one MCP server per agent:

| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | |
| **ui-ux-expert** | `playwright-webkit` | or `Chrome DevTools MCP` |
| **test-management-specialist** | `playwright-chrome` (sequential, not parallel with frontend) | |

If more than 4 agents need browsers simultaneously, run them in sequential batches.

## Testing Environments (from .env)

| Resource | Environment Variable |
|----------|---------------------|
| **Frontend** | `FRONT_URL` |
| **Backend** | `BACK_URL` |
| **Storybook QA** | `STORYBOOK_URL` |
| **Storybook Dev** | `STORYBOOK_DEV_URL` |

Theme presets: Default, Coffee

## Regression Test Suites

12 test suites in `regression/suites/` (283 total test cases, TestRail CSV format):

| Suite | Tests | Priority | Use Case |
|-------|-------|----------|----------|
| 01-smoke-tests | 12 | P0 | Daily validation before deployment |
| 02-authentication-tests | 28 | P1 | Login, SSO, password management |
| 03-catalog-search-tests | 23 | P1 | Browsing, filters, search |
| 04-cart-checkout-tests | 26 | P1 | Cart ops, checkout flow |
| 05-bopis-pickup-tests | 27 | P1 | Buy Online Pickup In Store |
| 06-payment-tests | 32 | P0 | All payment processors |
| 07-google-analytics-tests | 24 | P2 | GA4 event tracking |
| 08-security-tests | 21 | P0 | PCI compliance, auth security |
| 09-accessibility-tests | 27 | P1 | WCAG 2.1 AA compliance |
| 10-localization-tests | 21 | P2 | 13 languages |
| 11-performance-tests | 20 | P2 | Load times, Core Web Vitals |
| 12-browser-compatibility-tests | 22 | P1 | Cross-browser matrix |

**Execution strategies:** Daily (P0 only ~30min), Sprint Release (P0+P1 critical ~3-4hrs), Major Release (all suites ~24hrs)

## LLM-Driven Testing Workflow

1. Load prompt template from `docs/prompts/` (e.g., `full-regression-qa-agent.md`)
2. Execute via MCP browser tools with DevTools monitoring enabled
3. After each flow: export HAR, capture console logs, take screenshots
4. Generate bug reports in `reports/bugs/` with evidence

Key prompt templates:
- `full-regression-qa-agent.md` - Complete Admin + Frontend regression
- `storybook-testing.md` - Component testing
- `platform-tests.md` - Backend/API testing
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing

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

## Storybook Visual Regression

The `storybook/` directory stores visual regression baselines organized by Atomic Design tier:
- **atoms/** - VcBadge, VcCheckbox, VcCheckboxGroup, VcDialog, VcIcon, VcInputDetails, VcLabel, VcRadioButton, VcSwitch, VcTypography
- **molecules/** - VcAlert, VcButton, VcChip, VcInput, VcMenuItem, VcNavButton, VcRating, VcSelect, VcVariantPicker, VcWidget
- **organisms/** - VcAddToCart, VcPagination, VcProductButton, VcProductCard, VcProductImage, VcQuantityStepper, VcTable
- **design-system/** - Theme comparison (default vs coffee)

Each component folder has a `baselines/` directory for screenshots. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`).

## Key Testing Domains

- **Cart & Checkout:** Cart operations, shipping, checkout flow, order completion
- **Catalog:** Category navigation, product listings, facets/filters, sorting
- **Search:** Product search, suggestions, filters, special characters, history
- **Payment:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **BOPIS:** Buy Online Pickup In Store (map, filters, location selection)
- **B2B features:** Multi-org support, quotes, quick order, approval workflows, contract pricing
- **Multilingual:** 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)

## Browser Matrix

**Desktop (last 2 versions):** Chrome, Edge, WebKit, Firefox

**Mobile:** iPhone 16/17/18 (Safari), Android last 3 models (Chrome)

## Critical Revenue Flows

Must always pass before deployment:
1. Registration / Sign-in / Password reset
2. Catalog browsing with facets and filters
3. Add to cart (variations, configurations)
4. Search (global, category, history)
5. Ship-to selector and address management
6. Cart (quantity, save for later, pickup/delivery)
7. Checkout and payment processing
8. Order management and history
9. Company members and multi-organization
10. Google Analytics event tracking
