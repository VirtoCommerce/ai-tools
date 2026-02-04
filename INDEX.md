# VC MCP Testing Module - Repository Index

This repository contains QA testing documentation and MCP-driven testing for the Virto Commerce B2B e-commerce platform.

## Quick Navigation

| Directory | Purpose |
|-----------|---------|
| [tests/](tests/) | Active test cases organized by VCST ticket |
| [regression/](regression/) | Regression test suites (12 suites, 283 test cases) |
| [test-data/](test-data/) | Test fixtures and sample data |
| [reports/](reports/) | Bug reports and test execution results |
| [docs/](docs/) | Testing documentation and LLM prompts |
| [config/](config/) | MCP and Playwright configuration files |
| [archive/](archive/) | Historical sprint test documentation |

## Directory Structure

```
vc-mcp-testing-module/
├── config/                    # MCP browser configurations
│   ├── mcp-playwright-chrome.config.json
│   ├── mcp-playwright-edge.config.json
│   ├── mcp-playwright-firefox.config.json
│   └── mcp-playwright-webkit.config.json
│
├── docs/
│   ├── prompts/              # LLM testing prompt templates
│   └── guides/               # How-to guides
│
├── tests/                    # Active test cases by ticket
│   └── VCST-XXXX-*/          # Individual test directories
│
├── regression/
│   └── suites/               # 12 CSV test suites (TestRail format)
│
├── test-data/
│   ├── inventory/            # Product inventory data
│   ├── organizations/        # Organization test data
│   ├── search-queries/       # Search test queries
│   └── uploads/              # File upload test assets
│
├── reports/
│   ├── bugs/                 # Bug reports with evidence
│   └── regression/           # Regression test results
│
├── test-results/             # Playwright execution artifacts
│
└── archive/sprints/          # Historical sprint documentation
```

## Testing Environments

| Environment | Frontend | Backend |
|-------------|----------|---------|
| **Dev** | https://vcst-dev-storefront.govirto.com | https://vcst-dev.govirto.com |
| **QA** | https://vcst-qa-storefront.govirto.com | https://vcst-qa.govirto.com |
| **Staging** | https://virtostart-demo-store.govirto.com | https://virtostart-demo-admin.govirto.com |

**Storybook:** https://vcst-qa-storybook.govirto.com (theme: `coffee`)

## Test Domains

| Domain | Description | Related Tests |
|--------|-------------|---------------|
| **Authentication** | Login, SSO, password management | [02-authentication-tests](regression/suites/02-authentication-tests.csv) |
| **Catalog & Search** | Browsing, filters, product search | [03-catalog-search-tests](regression/suites/03-catalog-search-tests.csv) |
| **Cart & Checkout** | Cart operations, checkout flow | [04-cart-checkout-tests](regression/suites/04-cart-checkout-tests.csv) |
| **BOPIS** | Buy Online Pickup In Store | [05-bopis-pickup-tests](regression/suites/05-bopis-pickup-tests.csv) |
| **Payment** | Skyflow, CyberSource, Authorize.Net, Datatrance | [06-payment-tests](regression/suites/06-payment-tests.csv) |
| **Analytics** | GA4 event tracking | [07-google-analytics-tests](regression/suites/07-google-analytics-tests.csv) |
| **Security** | PCI compliance, auth security | [08-security-tests](regression/suites/08-security-tests.csv) |
| **Accessibility** | WCAG 2.1 AA compliance | [09-accessibility-tests](regression/suites/09-accessibility-tests.csv) |
| **Localization** | 13 languages support | [10-localization-tests](regression/suites/10-localization-tests.csv) |
| **Performance** | Load times, Core Web Vitals | [11-performance-tests](regression/suites/11-performance-tests.csv) |
| **Browser Compatibility** | Cross-browser testing | [12-browser-compatibility-tests](regression/suites/12-browser-compatibility-tests.csv) |

## Commands

```bash
npm run env:check      # Verify environment variables
npm test               # Run Playwright tests
npm run test:headed    # With visible browser
npm run test:chrome    # Chrome only
npm run test:report    # View HTML report
```

## Claude Code Agents

| Agent | Purpose |
|-------|---------|
| **qa-lead** | Orchestrates testing, delegates to specialists |
| **qa-backend-expert** | Platform APIs, GraphQL, Admin SPA |
| **qa-frontend-expert** | Customer storefront, checkout, mobile |
| **qa-testing-expert** | Interactive UI testing, debugging |
| **test-management-specialist** | Test planning, coverage tracking |
| **ui-ux-expert** | Storybook, accessibility, design system |

## Key Files

- [CLAUDE.md](CLAUDE.md) - Project guidance for Claude Code
- [README.md](README.md) - Quick start guide
- [sitemap.md](sitemap.md) - B2B storefront structure
- [tests/INDEX.md](tests/INDEX.md) - Test directory index
- [regression/mapping.md](regression/mapping.md) - Suite to test mapping
