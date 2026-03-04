# VC MCP Testing Module - Repository Index

This repository contains QA testing documentation and MCP-driven testing for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools, Atlassian) enabling LLM-powered browser automation.

## Quick Navigation

| Directory | Purpose |
|-----------|---------|
| [tests/](tests/) | Active test cases organized by sprint and VCST ticket |
| [regression/](regression/) | Regression test suites (15 frontend + 21 backend CSV files) |
| [test-data/](test-data/) | Test fixtures, sample data, and test cards |
| [reports/](reports/) | Bug reports and regression test results |
| [docs/](docs/) | LLM prompt templates and testing guides |
| [config/](config/) | MCP browser configs and test-suites.json manifest |
| [ci/](ci/) | CI regression via Claude Agent SDK (Docker + GitHub Actions) |
| [Test suites & Cases/](Test%20suites%20%26%20Cases/) | Original TestRail export (source-of-truth reference) |
| [scripts/](scripts/) | Utility scripts (Katalon test extraction) |
| [archive/](archive/) | Historical sprint test documentation |

## Directory Structure

```
vc-mcp-testing-module/
├── .claude/agents/            # Claude Code agent configurations (11 agents: 7 QA + 4 BA)
├── .github/workflows/         # GitHub Actions (regression.yml)
│
├── config/                    # MCP browser configurations + suite manifest
│   ├── mcp-playwright-chrome.config.json
│   ├── mcp-playwright-edge.config.json
│   ├── mcp-playwright-firefox.config.json
│   └── test-suites.json       # Regression orchestration manifest
│
├── ci/                        # CI regression via Claude Agent SDK
│   ├── agents/                # CI-specific agent prompts
│   ├── Dockerfile
│   ├── run-regression.ts      # Orchestrator entry point
│   └── notify-teams.ts        # Teams webhook notifications
│
├── docs/
│   ├── prompts/               # LLM testing prompt templates
│   ├── guides/                # How-to guides
│   └── workshop/              # Team onboarding workshop
│
├── tests/                     # Active test cases by sprint
│   ├── Sprint26-02/           # Sprint directories with VCST-XXXX tickets
│   ├── Sprint26-03/
│   └── Sprint26-04/
│
├── regression/
│   └── suites/
│       ├── Frontend/          # 16 CSV suites (00-13, 35-36)
│       └── Backend/           # 21 CSV suites (14-34)
│
├── Test suites & Cases/       # Original TestRail export (reference data)
│
├── test-data/
│   ├── addresses/             # US address test data
│   ├── bopis/                 # Pickup location data
│   ├── localization/          # Language test data
│   ├── organizations/         # Organization test data
│   ├── payment/               # Payment processor configs and test cards
│   ├── products/              # Product test data (configurable, standard)
│   ├── search-queries/        # Search test queries
│   ├── uploads/               # File upload test assets
│   └── users/                 # Test user accounts
│
├── reports/
│   ├── bugs/                  # Bug reports with evidence
│   └── regression/            # Regression test results + history.json
│
├── scripts/                   # Utility scripts
│
└── archive/sprints/           # Historical sprint documentation
```

## Testing Environments

Configured via environment variables in `.env` (run `npm run env:check` to validate):

| Resource | Environment Variable |
|----------|---------------------|
| **Frontend** | `FRONT_URL` |
| **Backend** | `BACK_URL` |
| **Storybook QA** | `STORYBOOK_URL` |
| **Storybook Dev** | `STORYBOOK_DEV_URL` |

Default environment is **QA**. Theme presets: Default, Coffee.

## Test Domains

### Frontend Suites (regression/suites/Frontend/)

| Domain | Description | Suite |
|--------|-------------|-------|
| **Full Regression** | Composite suite for release regression | [00-full-regression-release](regression/suites/Frontend/00-full-regression-release.csv) |
| **Smoke** | Daily validation before deployment | [01-smoke-tests](regression/suites/Frontend/01-smoke-tests.csv) |
| **Authentication** | Login, SSO, password management | [02-authentication-tests](regression/suites/Frontend/02-authentication-tests.csv) |
| **Catalog & Search** | Browsing, filters, product search | [03-catalog-search-tests](regression/suites/Frontend/03-catalog-search-tests.csv) |
| **Cart & Checkout** | Cart operations, checkout flow | [04-cart-checkout-tests](regression/suites/Frontend/04-cart-checkout-tests.csv) |
| **BOPIS** | Buy Online Pickup In Store | [05-bopis-pickup-tests](regression/suites/Frontend/05-bopis-pickup-tests.csv) |
| **Payment** | Skyflow, CyberSource, Authorize.Net, Datatrance | [06-payment-tests](regression/suites/Frontend/06-payment-tests.csv) |
| **Analytics** | GA4 event tracking | [07-google-analytics-tests](regression/suites/Frontend/07-google-analytics-tests.csv) |
| **Security** | PCI compliance, auth security | [08-security-tests](regression/suites/Frontend/08-security-tests.csv) |
| **Accessibility** | WCAG 2.1 AA compliance | [09-accessibility-tests](regression/suites/Frontend/09-accessibility-tests.csv) |
| **Localization** | 13 languages support | [10-localization-tests](regression/suites/Frontend/10-localization-tests.csv) |
| **Performance** | Load times, Core Web Vitals | [11-performance-tests](regression/suites/Frontend/11-performance-tests.csv) |
| **Browser Compatibility** | Cross-browser testing | [12-browser-compatibility-tests](regression/suites/Frontend/12-browser-compatibility-tests.csv) |
| **B2C Features** | Wishlists, compare, reviews, variations | [13-b2c-features-tests](regression/suites/Frontend/13-b2c-features-tests.csv) |
| **White Labeling** | Frontend white labeling and branding | [35-frontend-whitelabeling-tests](regression/suites/Frontend/35-frontend-whitelabeling-tests.csv) |
| **Configurable Products** | Product configurations and variations | [36-configurable-products-tests](regression/suites/Frontend/36-configurable-products-tests.csv) |

### Backend Suites (regression/suites/Backend/)

| Domain | Description | Suite |
|--------|-------------|-------|
| **Platform API** | REST API: Catalog, Pricing, Inventory, Orders | [14-platform-api-tests](regression/suites/Backend/14-platform-api-tests.csv) |
| **GraphQL xAPI** | xCart, xCatalog, xOrder, xCMS queries/mutations | [15-graphql-xapi-tests](regression/suites/Backend/15-graphql-xapi-tests.csv) |
| **Catalog** | Catalog management CRUD | [16-catalog-tests](regression/suites/Backend/16-catalog-tests.csv) |
| **Platform Core** | Core platform operations | [17-platform-core-tests](regression/suites/Backend/17-platform-core-tests.csv) |
| **Store** | Store configuration and management | [18-store-tests](regression/suites/Backend/18-store-tests.csv) |
| **Pricing** | Pricing rules and price lists | [19-pricing-tests](regression/suites/Backend/19-pricing-tests.csv) |
| **Orders** | Order processing and management | [20-orders-tests](regression/suites/Backend/20-orders-tests.csv) |
| **Customer** | Customer accounts and profiles | [21-customer-tests](regression/suites/Backend/21-customer-tests.csv) |
| **Inventory** | Inventory and fulfillment centers | [22-inventory-tests](regression/suites/Backend/22-inventory-tests.csv) |
| **Marketing** | Promotions, coupons, dynamic content | [23-marketing-tests](regression/suites/Backend/23-marketing-tests.csv) |
| **Notifications** | Notification templates and delivery | [24-notifications-tests](regression/suites/Backend/24-notifications-tests.csv) |
| **CMS / Page Builder** | Content management and page builder | [25-cms-pagebuilder-tests](regression/suites/Backend/25-cms-pagebuilder-tests.csv) |
| **Search & Indexing** | Search index configuration | [26-search-indexing-tests](regression/suites/Backend/26-search-indexing-tests.csv) |
| **Assets** | Digital asset management | [27-assets-tests](regression/suites/Backend/27-assets-tests.csv) |
| **Core Settings** | Platform settings and configuration | [28-core-settings-tests](regression/suites/Backend/28-core-settings-tests.csv) |
| **CSV Export/Import** | Bulk data operations | [29-csv-export-import-tests](regression/suites/Backend/29-csv-export-import-tests.csv) |
| **Shipping** | Shipping methods and rates | [30-shipping-tests](regression/suites/Backend/30-shipping-tests.csv) |
| **SEO** | SEO settings and metadata | [31-seo-tests](regression/suites/Backend/31-seo-tests.csv) |
| **Whitelabeling** | Theme and branding customization | [32-whitelabeling-tests](regression/suites/Backend/32-whitelabeling-tests.csv) |
| **Push Messages** | Push notification management | [33-push-messages-tests](regression/suites/Backend/33-push-messages-tests.csv) |
| **Image Tools** | Image processing and optimization | [34-image-tools-tests](regression/suites/Backend/34-image-tools-tests.csv) |

## Commands

```bash
npm install              # Install dependencies
npm run env:check        # Verify all required env vars (33 total)
npm run ci:regression    # Run CI regression via Claude Agent SDK
npm run ci:smoke         # Run smoke tests only (suite 01)
npm run ci:critical      # Run critical P0 suites (01, 06, 08, 14)
npm run ci:frontend      # Run all frontend suites (01-13, 35-36)
npm run ci:backend       # Run all backend suites (14+)
npm run ci:full          # Run full regression (all suites)
npm run ci:notify        # Send Teams notification
```

## Claude Code Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead** | sonnet | Orchestrates testing, delegates to specialists, JIRA workflow |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Admin SPA, background jobs |
| **qa-frontend-expert** | opus | Customer storefront, checkout, mobile |
| **qa-testing-expert** | opus | Interactive UI testing, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression execution, retries, consolidated reports |
| **ba-system-analyzer** | sonnet | BA: Repo structure, module inventory, user flows |
| **ba-api-specialist** | sonnet | BA: API surface analysis via Postman/Swagger |
| **ba-story-writer** | sonnet | BA: Agile user stories with BDD acceptance criteria |
| **ba-doc-writer** | sonnet | BA: User docs, admin guides, API quick-start |

## MCP Servers

| Server | Purpose |
|--------|---------|
| **playwright-chrome** | Browser automation with Chromium |
| **playwright-firefox** | Browser automation with Firefox |
| **playwright-edge** | Browser automation with Edge |
| **postman** | API testing - collections, environments, monitors |
| **Chrome DevTools** | Console logs, network requests, HAR export |
| **Atlassian** | JIRA integration for test/bug management |

## Key Files

- [CLAUDE.md](CLAUDE.md) - Project guidance for Claude Code
- [README.md](README.md) - Quick start guide
- [.claude/skills/vc-knowledge/vc-frontend/sitemap.md](.claude/skills/vc-knowledge/vc-frontend/sitemap.md) - B2B storefront structure (URLs, navigation, categories)
- [.claude/skills/vc-knowledge/vc-frontend/products.md](.claude/skills/vc-knowledge/vc-frontend/products.md) - Product types, xAPI fields, properties, configurable sections, sample test data
- [config/test-suites.json](config/test-suites.json) - Regression orchestration manifest
- [tests/INDEX.md](tests/INDEX.md) - Test directory index
- [ci/README.md](ci/README.md) - CI regression documentation
- [test-data/README.md](test-data/README.md) - Test data catalog
