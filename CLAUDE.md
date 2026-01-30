# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **QA testing documentation and MCP-driven testing repository** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools, Figma) enabling LLM-powered browser automation.

**Important:** This is NOT a traditional test automation codebase with `.spec.js` files. The primary workflow is LLM-driven test execution using prompt templates in `docs/prompts/`.

## Commands

```bash
npm run env:check      # Verify all 28 required env vars
npm test               # Run Playwright tests
npm run test:headed    # With visible browser
npm run test:debug     # Debug mode
npm run test:chrome    # Chrome only
npm run test:report    # View HTML report
```

## Environment Setup

Create a `.env` file with required variables. Run `npm run env:check` to validate. Key groups:
- **URLs:** `VCST_FRONT_URL`, `VCST_BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK`
- **Credentials:** `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO_*`
- **Payment processors:** Skyflow, CyberSource, Authorize.Net, Datatrance (card/expiry/cvv for each)
- **APIs:** `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`

Access via `config.js`: `import { env } from './config.js'`

## MCP Servers

This project uses multiple MCP servers for testing:

**Playwright MCP** - Browser automation:
```json
{"mcpServers": {"playwright": {"command": "npx", "args": ["@playwright/mcp@latest", "--browser", "chrome"]}}}
```

**Chrome DevTools MCP** - Console logs, network requests, performance tracing (used for regression testing with HAR export)

**Atlassian MCP** - JIRA integration for test case management and bug reporting

**Figma MCP** - Visual comparison testing against design specs

## Claude Code Specialized Agents

Three agents are available for QA tasks in this repository:

**qa-testing-expert** - Interactive testing agent for:
- UI testing and Figma design verification
- API testing and debugging
- Console log and network request analysis
- Test failure investigation
- Uses Playwright MCP and Chrome DevTools for browser automation

**test-case-architect** - Test case creation agent for:
- Writing new test cases from requirements or JIRA tickets
- Converting user stories into test specifications
- Reviewing and improving existing test coverage
- Outputs follow the `tests/VCST-XXXX-*/` structure

**test-plan-writer** - Test planning agent for:
- Creating test plan documents for features
- Documenting testing strategy and approach
- Organizing test scope and coverage
- Outputs `*-test-plan.md` files

Usage: Ask Claude Code to use these agents, e.g., "Use the qa-testing-expert to verify the checkout flow" or "Use test-case-architect to write test cases for VCST-1234"

## LLM-Driven Testing Workflow

1. Use prompt templates from `docs/prompts/` (e.g., `full-regression-qa-agent.md`)
2. Execute via MCP browser tools with DevTools monitoring
3. Capture evidence: screenshots, console logs, HAR files, network requests
4. Generate bug reports in `reports/bugs/` following the established format

## Repository Structure

```
vc-mcp-testing-module/
├── .claude/                    # Claude Code agent configurations
├── docs/
│   ├── prompts/                # LLM prompt templates for QA automation
│   └── guides/                 # Testing guides (e.g., Storybook testing)
├── test-data/
│   ├── regression/             # Regression test suites and data
│   ├── organizations/          # Organization test data
│   ├── search-queries/         # Search test data
│   ├── inventory/              # Inventory test data
│   └── uploads/                # Test files for upload testing
├── tests/                      # Test cases organized by JIRA ticket
│   └── VCST-XXXX-feature/
│       ├── test-plan.md
│       ├── test-cases.md
│       ├── test-execution-report.md
│       ├── testrail-import.csv
│       └── screenshots/
├── reports/
│   ├── bugs/                   # Bug reports with screenshots
│   │   └── screenshots/
│   └── regression/             # Regression test reports
├── archive/                    # Historical sprint test cases
│   └── sprints/
├── test-results/               # Playwright test results
├── config.js                   # Environment configuration
└── sitemap.md                  # Site structure reference
```

## Test Documentation Pattern

```
tests/VCST-XXXX-feature/
├── test-plan.md              # Test strategy
├── test-cases.md             # Detailed test specifications (or .csv)
├── test-execution-report.md  # Results
├── testrail-import.csv       # TestRail import format (optional)
└── screenshots/
    ├── desktop/              # Desktop screenshots
    └── mobile/               # Mobile screenshots
```

## Bug Report Format

Reports in `reports/bugs/` follow this structure:
- Title with ticket reference (e.g., `BUG-CSS-Pickup-Map-Too-Narrow-VCST-QA.md`)
- STR (Steps to Reproduce) with numbered steps
- Expected vs Actual behavior
- Evidence: screenshots, console logs, network requests
- Severity/Priority assessment
- Environment details

## Testing Targets

- **VCST QA:** `https://vcst-qa-storefront.govirto.com/`
- **Virtostart:** `https://virtostart-demo-store.govirto.com/` (reference implementation for comparison testing)
- **Documentation:** https://docs.virtocommerce.org/
- **Documentation Frontend:** https://docs.virtocommerce.org/storefront/user-guide/2.0/

## Key Testing Domains

- **Cart & Checkout:** Cart operations, shipping address, checkout flow, order completion
- **Catalog browsing:** Category navigation, product listings, filters, sorting
- **Add to cart:** Product selection, quantity updates, cart validation
- **Search:** Product search, search suggestions, filters, special characters
- **Payment processing:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **BOPIS:** Buy Online Pickup In Store flows
- **Organization search:** Special character handling (ampersands, brackets)
- **Multilingual:** 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)


## Browser Matrix

**Desktop (last 2 versions):**
- Chrome
- Edge
- WebKit
- Firefox

**Mobile:**
- iPhone 16, 17, 18 (Safari)
- Android last 3 models (Chrome)