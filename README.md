# vc-mcp-testing-module

QA testing documentation and MCP-driven testing repository for the Virto Commerce B2B e-commerce platform.

## Overview

This project uses **LLM-powered browser automation** through MCP (Model Context Protocol) servers for test execution. Tests are executed through natural language prompts, enabling AI-driven testing workflows.

**Important:** This is NOT a traditional test automation codebase with `.spec.js` files. The primary workflow is LLM-driven test execution using prompt templates in `docs/prompts/`.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: Version 18 or higher
- **MCP Servers**: Playwright MCP, Chrome DevTools MCP (see configuration below)

## Quick Start

```bash
# Install dependencies
npm install

# Verify environment variables
npm run env:check

# Run Playwright tests
npm test
npm run test:headed    # With visible browser
npm run test:debug     # Debug mode
npm run test:chrome    # Chrome only
npm run test:report    # View HTML report
```

## Environment Configuration

Create a `.env` file in the project root. Run `npm run env:check` to validate all 28 required variables.

### Required Environment Variables

```env
# Application URLs
VCST_FRONT_URL=https://vcst-qa-storefront.govirto.com/
VCST_BACK_URL=https://your-backend-url.com
VIRTO_START_FRONT=https://virtostart-demo-store.govirto.com/
VIRTO_START_BACK=https://your-virtostart-backend-url.com

# Admin Credentials
ADMIN=your_admin_username
ADMIN_PASSWORD=your_admin_password

# User Credentials
USER_EMAIL=test_user@example.com
USER_PASSWORD=test_password
USER2_EMAIL=second_user@example.com
USER2_PASSWORD=second_user_password
USER_VIRTO_EMAIL=virtostart_user@example.com
USER_VIRTO_PASSWORD=virtostart_password

# Payment Processors (Skyflow, CyberSource, Authorize.Net, Datatrance)
# Each requires: card number, expiry, CVV
SKYFLOW_CARD=...
CYBERSOURCE_CARD=...
AUTHORIZENET_CARD=...
DATATRANCE_CARD=...

# External APIs
FIGMA_API_KEY=your_figma_api_key
BROWSERSTACK_USERNAME=your_browserstack_username
BROWSERSTACK_ACCESS_KEY=your_browserstack_access_key
```

Access environment variables via `config.js`:
```javascript
import { env } from './config.js'
```

## MCP Server Configuration

### Playwright MCP (Browser Automation)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chrome"]
    }
  }
}
```

### Chrome DevTools MCP

Used for console logs, network requests, and performance tracing (HAR export for regression testing).

### Atlassian MCP

JIRA integration for test case management and bug reporting.

### Figma MCP

Visual comparison testing against design specifications.

## Claude Code Specialized Agents

### Adding Custom Agents

1. Open terminal and run `claude`
2. Type `/agents`
3. Select **Create new agent**
4. Follow the prompts to configure your agent

Agents are stored in `.claude/agents/` as markdown files with YAML frontmatter.

**Usage example:**
```
"Use the qa-testing-expert to verify the checkout flow"
"Use test-case-architect to write test cases for VCST-1234"
```

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
│   └── regression/             # Regression test reports
├── archive/                    # Historical sprint test cases
├── test-results/               # Playwright test results
├── config.js                   # Environment configuration
└── sitemap.md                  # Site structure reference
```

## Test Documentation Pattern

Each feature test follows this structure:

```
tests/VCST-XXXX-feature/
├── test-plan.md              # Test strategy
├── test-cases.md             # Detailed test specifications
├── test-execution-report.md  # Results
├── testrail-import.csv       # TestRail import format
└── screenshots/
    ├── desktop/              # Desktop screenshots
    └── mobile/               # Mobile screenshots
```

## Bug Report Format

Reports in `reports/bugs/` include:
- Title with ticket reference (e.g., `BUG-CSS-Pickup-Map-Too-Narrow-VCST-QA.md`)
- STR (Steps to Reproduce) with numbered steps
- Expected vs Actual behavior
- Evidence: screenshots, console logs, network requests
- Severity/Priority assessment
- Environment details

## Testing Targets

| Environment | URL |
|-------------|-----|
| **VCST QA** | https://vcst-qa-storefront.govirto.com/ |
| **Virtostart** | https://virtostart-demo-store.govirto.com/

## Key Testing Domains

- **Cart & Checkout** - Cart operations, shipping, checkout flow, order completion
- **Catalog Browsing** - Category navigation, product listings, filters, sorting
- **Search** - Product search, suggestions, filters, special characters
- **Payment Processing** - Skyflow, CyberSource, Authorize.Net, Datatrance
- **BOPIS** - Buy Online Pickup In Store flows
- **Organization Search** - Special character handling (ampersands, brackets)
- **Multilingual** - 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)

## Browser Matrix

**Desktop (last 2 versions):**
- Chrome
- Edge
- WebKit
- Firefox

**Mobile:**
- iPhone 16, 17, 18 (Safari)
- Android last 3 models (Chrome)

## Resources

- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Virto Commerce Documentation](https://docs.virtocommerce.org/)
- [Storefront User Guide](https://docs.virtocommerce.org/storefront/user-guide/2.0/)
