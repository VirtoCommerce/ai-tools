# vc-mcp-testing-module

QA testing documentation and MCP-driven testing repository for the **Virto Commerce B2B e-commerce platform**.

> **Important:** This is NOT a traditional test automation codebase with `.spec.js` files. The primary workflow is **LLM-driven test execution** using natural language prompts via MCP (Model Context Protocol) servers, enabling AI-powered browser automation.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Clone the Repository](#step-1-clone-the-repository)
- [Step 2: Install Dependencies](#step-2-install-dependencies)
- [Step 3: Environment Variables (.env)](#step-3-environment-variables-env)
- [Step 4: IDE Setup](#step-4-ide-setup)
- [Step 5: MCP Server Configuration](#step-5-mcp-server-configuration)
- [Step 6: Claude Code Agent Setup](#step-6-claude-code-agent-setup)
- [Step 7: Verify Your Setup](#step-7-verify-your-setup)
- [Available Commands](#available-commands)
- [Repository Structure](#repository-structure)
- [How Testing Works](#how-testing-works)
- [Regression Test Suites](#regression-test-suites)
- [CI/CD Pipeline](#cicd-pipeline)
- [Test Documentation Patterns](#test-documentation-patterns)
- [Bug Report Format](#bug-report-format)
- [Storybook Visual Regression](#storybook-visual-regression)
- [Key Testing Domains](#key-testing-domains)
- [Browser Matrix](#browser-matrix)
- [Troubleshooting](#troubleshooting)
- [Resources](#resources)

---

## Prerequisites

Before starting, make sure you have the following installed on your machine:

| Requirement | Version | How to Check | Install Link |
|-------------|---------|--------------|--------------|
| **Node.js** | 18 or higher | `node --version` | [nodejs.org](https://nodejs.org/) |
| **npm** | Comes with Node.js | `npm --version` | Included with Node.js |
| **Git** | Latest | `git --version` | [git-scm.com](https://git-scm.com/) |
| **IDE** | Latest | See below | See IDE Setup section |

### Supported IDEs

You need one of the following IDEs with AI assistant integration:

| IDE | Required Extension | Notes |
|-----|-------------------|-------|
| **VS Code** | [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) | Recommended |
| **Cursor** | Built-in AI | MCP support built-in |
| **Windsurf** | Built-in AI | MCP support built-in |

### Required Accounts & Access

Ask your team lead to provide access to:

- **Anthropic API key** (for Claude Code / Claude Agent SDK)
- **Virto Commerce QA environment** credentials (frontend + backend)
- **JIRA (Atlassian)** project access for the VCST board
- **GitHub** repository access
- **Figma** API key (for design comparison testing)
- **BrowserStack** credentials (for real device testing, optional)
- **Postman** API key (for API test collections)
- **Payment processor test cards** (Skyflow, CyberSource, Authorize.Net, Datatrance)

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/VirtoCommerce/vc-mcp-testing-module.git
cd vc-mcp-testing-module
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs:
- `@playwright/mcp` - Playwright MCP server for browser automation
- `@playwright/test` - Playwright test runner
- `dotenv` - Environment variable management
- `csv-parse` - CSV test data parsing
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK for CI regression runs

---

## Step 3: Environment Variables (.env)

Create a `.env` file in the project root. **Ask your team lead for the actual values** - never commit this file to Git.

```env
# ===== Application URLs =====
FRONT_URL=https://your-frontend-url.govirto.com/
BACK_URL=https://your-backend-url.govirto.com
VIRTO_START_FRONT=https://virtostart-demo-store.govirto.com/
VIRTO_START_BACK=https://your-virtostart-backend-url.com

# ===== Admin Credentials =====
ADMIN=your_admin_username
ADMIN_PASSWORD=your_admin_password

# ===== Test User Credentials =====
USER_EMAIL=test_user@example.com
USER_PASSWORD=test_password
USER2_EMAIL=second_user@example.com
USER2_PASSWORD=second_user_password
USER_VIRTO=virtostart_user@example.com
USER_VIRTO_PASSWORD=virtostart_password

# ===== Store Configuration =====
STORE_ID=your_store_id

# ===== Payment Processors =====

# Skyflow
SKYFLOW_VISA=4111111111111111
SKYFLOW_MASTERCARD=5111111111111118
SKYFLOW_EXPIRY=12/30
SKYFLOW_CVV=123

# CyberSource
CYBERSOURCE_CARD=4111111111111111
CYBERSOURCE_EXPIRY=12/30
CYBERSOURCE_CVV=123

# Authorize.Net
AUTHORIZNET_CARD=4111111111111111
AUTHORIZNET_EXPIRY=12/30
AUTHORIZNET_CVV=123

# Datatrance
DATATRANCE_MASTERCARD=5111111111111118
DATATRANCE_EXPIRY=12/30
DATATRANCE_CVV=123
DATATRANCE_OTP=123456

# ===== External APIs =====
FIGMA_API_KEY=your_figma_api_key
BROWSERSTACK_USERNAME=your_browserstack_username
BROWSERSTACK_ACCESS_KEY=your_browserstack_access_key

# ===== Builder.io (Optional) =====
# BUILDER_IO_URL=https://builder.io/content
# BUILDER_IO_EMAIL=your_email
# BUILDER_IO_PASSWORD=your_password
# BUILDER_IO_SPACE=VCST QA
```

After creating the `.env` file, validate it:

```bash
npm run env:check
```

This runs `get_variables_env.js` which checks that all 29 required variables are set. If any are missing, the script will print the missing variable names.

### Accessing Environment Variables in Code

```javascript
import { env } from './config.js';

// Examples:
console.log(env.FRONT_URL);
console.log(env.USER_EMAIL);
console.log(env.SKYFLOW_VISA);
```

---

## Step 4: IDE Setup

### VS Code with Claude Code

1. Install the **Claude Code** extension from the VS Code marketplace
2. Open the project folder in VS Code
3. Set your Anthropic API key when prompted (or set `ANTHROPIC_API_KEY` environment variable)
4. Claude Code will automatically read the `CLAUDE.md` file for project context

### Cursor / Windsurf

1. Open the project folder
2. MCP configuration will be read from `.mcp.json` (you need to create this - see next step)
3. Agent definitions will be read from `.claude/agents/`

---

## Step 5: MCP Server Configuration

MCP servers provide browser automation, API testing, JIRA integration, and more. These config files are **gitignored** so you must set them up locally.

### 5.1 Create `.mcp.json` in the project root

This configures the Playwright MCP servers for multi-browser testing:

```json
{
  "mcpServers": {
    "playwright-chrome": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-chrome.config.json"
      ]
    },
    "playwright-webkit": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-webkit.config.json"
      ]
    },
    "playwright-firefox": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-firefox.config.json"
      ]
    },
    "playwright-edge": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-edge.config.json"
      ]
    },
    "postman": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@postman/postman-mcp-server@latest",
        "--minimal"
      ],
      "env": {
        "POSTMAN_API_KEY": "your-postman-api-key"
      }
    }
  }
}
```

> **macOS/Linux users:** Replace `"command": "cmd"` and `"args": ["/c", "npx", ...]` with `"command": "npx"` and `"args": ["@playwright/mcp@latest", "--config", "config/..."]`.

### 5.2 Create browser config files in `config/`

Create the `config/` directory and add these 4 JSON files:

**`config/mcp-playwright-chrome.config.json`**
```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/chrome/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/chrome/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/chrome",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-edge.config.json`**
```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "headless": false, "channel": "msedge" },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/edge/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/edge/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/edge",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-firefox.config.json`**
```json
{
  "browser": {
    "browserName": "firefox",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/firefox/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/firefox/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/firefox",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-webkit.config.json`**
```json
{
  "browser": {
    "browserName": "webkit",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/webkit/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/webkit/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/webkit",
  "screenshot": "only-on-failure"
}
```

### 5.3 Additional MCP Servers (User-Level Configuration)

These are configured at the user/IDE level, not in the project `.mcp.json`:

| Server | Purpose | Setup |
|--------|---------|-------|
| **Chrome DevTools MCP** | Console logs, network requests, performance tracing, HAR export | Follow [Chrome DevTools MCP docs](https://github.com/nicholasadamou/chrome-devtools-mcp) |
| **Atlassian MCP** | JIRA integration - ticket management, bug reporting | Follow [Atlassian MCP docs](https://github.com/sooperset/mcp-atlassian) - requires Atlassian API token |
| **Figma MCP** | Visual comparison against design specs | Requires `FIGMA_API_KEY` from `.env` |
| **Serena** | Semantic code navigation and symbol-level editing | Follow [Serena docs](https://github.com/serena-ai/serena) |
| **GitHub MCP** | PR review, code search, issue management | Requires GitHub personal access token |

---

## Step 6: Claude Code Agent Setup

The project uses 6 specialized QA agents defined in `.claude/agents/`. Since this directory is gitignored, you need to set them up locally.

### Creating Agents via Claude Code CLI

1. Open your terminal and run `claude`
2. Type `/agents`
3. Select **Create new agent**
4. Follow the prompts to name and configure each agent

### Agent Definitions

Create these 6 agent files in `.claude/agents/`:

| File | Agent Name | Model | Purpose |
|------|-----------|-------|---------|
| `qa-lead.md` | qa-lead-orchestrator | sonnet | Coordinates QA team, manages testing strategy, JIRA workflow, go/no-go decisions |
| `qa-backend-expert.md` | qa-backend-expert | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| `qa-frontend-expert.md` | qa-frontend-expert | opus | Customer-facing storefront, user journeys, checkout flows, mobile testing |
| `qa-testing-expert.md` | qa-testing-expert | opus | Interactive testing - UI verification, Figma comparison, debugging, evidence capture |
| `test-management-specialist.md` | test-management-specialist | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| `ui-ux-expert.md` | ui-ux-expert | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system consistency |

> Ask your team lead for the agent definition files or copy them from a colleague's setup.

### Using Agents

In Claude Code chat, reference agents with natural language:

```
"Use the qa-frontend-expert to verify the checkout flow"
"Use the qa-testing-expert to run smoke tests on the QA environment"
"@qa-lead analyze JIRA ticket VCST-1234"
```

### Parallel Agent Execution

When running multiple agents simultaneously, each agent **MUST use its own browser**:

| Agent | Playwright MCP Server |
|-------|----------------------|
| qa-frontend-expert | `playwright-chrome` |
| qa-backend-expert | `playwright-edge` |
| qa-testing-expert | `playwright-firefox` |
| ui-ux-expert | `playwright-webkit` |

If more than 4 agents need browsers, run them in sequential batches.

---

## Step 7: Verify Your Setup

Run through this checklist to confirm everything is working:

### 1. Check Node.js and npm

```bash
node --version   # Should be 18+
npm --version
```

### 2. Install dependencies

```bash
npm install
```

### 3. Validate environment variables

```bash
npm run env:check
```

All 29 variables should print their values (no "Missing required environment variables" error).

### 4. Test Playwright browser launch

```bash
npx playwright install
npm run test:chrome
```

### 5. Verify MCP servers connect

Open your IDE and start a Claude Code session. Try:

```
Navigate to the storefront URL and take a screenshot
```

If Playwright MCP is configured correctly, a browser window will open and navigate to the site.

### Setup Checklist

- [ ] Repository cloned
- [ ] `npm install` completed
- [ ] `.env` file created with all 29 variables
- [ ] `npm run env:check` passes
- [ ] `.mcp.json` created in project root
- [ ] `config/` directory with 4 browser config JSONs
- [ ] Playwright browsers installed (`npx playwright install`)
- [ ] IDE installed with Claude Code extension
- [ ] `.claude/agents/` directory with 6 agent definitions
- [ ] Atlassian MCP configured (for JIRA access)
- [ ] Chrome DevTools MCP configured (optional but recommended)
- [ ] First test run successful (browser opens, navigates, takes screenshot)

---

## Available Commands

```bash
npm install              # Install dependencies
npm run env:check        # Validate all 29 environment variables
npm test                 # Run Playwright tests
npm run test:headed      # Run tests with visible browser
npm run test:debug       # Run tests in debug mode
npm run test:chrome      # Run tests in Chrome only (--project=chromium)
npm run test:report      # Open Playwright HTML report
npm run ci:regression    # Run CI regression via Claude Agent SDK
```

---

## Repository Structure

```
vc-mcp-testing-module/
├── .claude/agents/              # Claude Code agent definitions (6 agents, gitignored)
├── .github/workflows/           # GitHub Actions CI pipelines
│   └── regression.yml           # Automated regression via Claude Agent SDK
├── .mcp.json                    # MCP server configuration (gitignored)
├── ci/                          # CI regression testing infrastructure
│   ├── Dockerfile               # Docker image for CI runs
│   ├── run-regression.ts        # Orchestrator script
│   └── README.md                # CI setup documentation
├── config/                      # Playwright MCP browser configs (gitignored)
│   ├── mcp-playwright-chrome.config.json
│   ├── mcp-playwright-edge.config.json
│   ├── mcp-playwright-firefox.config.json
│   └── mcp-playwright-webkit.config.json
├── docs/
│   ├── prompts/                 # LLM prompt templates for QA automation
│   │   ├── full-regression-qa-agent.md
│   │   ├── platform-tests.md
│   │   ├── storybook-testing.md
│   │   ├── How to test Builder.io.md
│   │   └── setup.xml
│   └── guides/                  # Testing guides
│       └── how-to-test-storybook.md
├── storybook/                   # Visual regression baselines (Atomic Design)
│   ├── atoms/                   # VcBadge, VcCheckbox, VcDialog, VcIcon, ...
│   ├── molecules/               # VcAlert, VcButton, VcChip, VcInput, ...
│   ├── organisms/               # VcAddToCart, VcPagination, VcProductCard, ...
│   └── design-system/           # Theme comparison (default vs coffee)
├── regression/
│   └── suites/                  # 14 regression test suites (455 test cases, CSV)
├── test-data/                   # Centralized test data
│   ├── users/                   # User accounts and credentials
│   ├── organizations/           # B2B organization data
│   ├── products/                # Product catalog test data
│   ├── addresses/               # Shipping/billing addresses
│   ├── payment/                 # Payment test cards
│   ├── search-queries/          # Search test terms
│   ├── bopis/                   # Pickup locations
│   ├── localization/            # Multi-language data (13 languages)
│   └── security/                # Injection payloads, XSS vectors
├── tests/VCST-XXXX-*/           # Test cases organized by JIRA ticket
├── reports/
│   ├── bugs/                    # Bug reports with evidence
│   └── regression/              # Regression test execution reports
├── archive/sprints/             # Historical sprint test cases
├── test-results/                # Playwright test output (gitignored)
├── config.js                    # Environment variable configuration
├── get_variables_env.js         # Environment validation script
├── package.json                 # Project dependencies and scripts
├── CLAUDE.md                    # Claude Code project instructions (gitignored)
└── sitemap.md                   # Site structure reference
```

---

## How Testing Works

This project uses an **LLM-driven testing workflow** instead of traditional `.spec.js` test files.

### Workflow Overview

```
1. Load a prompt template from docs/prompts/
       ↓
2. Execute via MCP browser tools (Playwright opens a real browser)
       ↓
3. AI agent navigates the site, performs actions, captures evidence
       ↓
4. Export HAR files, capture console logs, take screenshots
       ↓
5. Generate bug reports in reports/bugs/ with evidence
       ↓
6. Update JIRA tickets with test results
```

### Prompt Templates

| Template | Purpose |
|----------|---------|
| `full-regression-qa-agent.md` | Complete Admin + Frontend regression testing |
| `platform-tests.md` | Backend/API platform testing |
| `storybook-testing.md` | UI component visual regression testing |
| `How to test Builder.io.md` | Builder.io, Virto Pages & vc-frontend testing |

### Example: Running a Test Session

In your IDE with Claude Code, type:

```
Run the smoke tests for the QA environment. Navigate to the storefront,
verify login works, add a product to cart, and take a screenshot at each step.
```

Claude Code will:
1. Use the Playwright MCP server to open a browser
2. Navigate to the storefront URL from `.env`
3. Execute each step, capturing screenshots and console logs
4. Report results with pass/fail status

---

## Regression Test Suites

14 test suites in `regression/suites/` with 455 total test cases in TestRail-compatible CSV format.

| # | Suite | Tests | Priority | Est. Time |
|---|-------|-------|----------|-----------|
| 00 | Full Regression Release | 108 | P0/P1 Critical | 13.5 hrs |
| 01 | Smoke Tests | 12 | P0 Critical | 30 min |
| 02 | Authentication Tests | 28 | P1 High | 1.5 hrs |
| 03 | Catalog & Search Tests | 23 | P1 High | 1.5 hrs |
| 04 | Cart & Checkout Tests | 26 | P1 Critical | 2 hrs |
| 05 | BOPIS Pickup Tests | 27 | P1 Critical | 2.5 hrs |
| 06 | Payment Tests | 32 | P0 Critical | 2 hrs |
| 07 | Google Analytics Tests | 24 | P2 High | 2 hrs |
| 08 | Security Tests | 21 | P0 Critical | 2 hrs |
| 09 | Accessibility Tests | 27 | P1 High | 3 hrs |
| 10 | Localization Tests | 21 | P2 Medium | 4 hrs |
| 11 | Performance Tests | 20 | P2 Medium | 2 hrs |
| 12 | Browser Compatibility Tests | 22 | P1 High | 4 hrs |
| 13 | B2C Features Tests | 64 | P1 Critical | 5 hrs |

### Execution Strategies

| Strategy | Suites | When | Duration |
|----------|--------|------|----------|
| **Daily Smoke** | 01 only | After every deployment | ~30 min |
| **Sprint Release** | 01, 04, 05, 06, 08 | Before sprint release | ~3-4 hrs |
| **Full Regression** | 00 (comprehensive) | Before production release | ~13.5 hrs (or ~4-5 hrs parallelized) |
| **Modular Deep Dive** | All 01-13 | Quarterly or specialized testing | ~24+ hrs |
| **Quarterly Audit** | 09, 10, 12 | WCAG + localization + browser compat | ~11 hrs |

### CSV Column Format

All CSV files follow TestRail-compatible format:

```
ID,Title,Section,Type,Priority,Estimate,Preconditions,Steps,Expected Result,References,Automation Status
```

---

## CI/CD Pipeline

Regression tests can run automatically via GitHub Actions using Docker and the Claude Agent SDK.

### Running via GitHub Actions

1. Go to **Actions** tab in GitHub
2. Select **Regression Tests** workflow
3. Click **Run workflow**
4. Configure parameters:

| Parameter | Options | Default |
|-----------|---------|---------|
| Suite selection | `smoke`, `full`, `critical`, `sprint`, or comma-separated IDs | `smoke` |
| Environment | `dev`, `qa`, `staging` | `qa` |
| Max budget (USD) | Any number | `10.0` |
| Max turns | Agent turns per suite | `100` |
| Model | `claude-sonnet-4-5-20250929`, `claude-opus-4-6` | Sonnet |

### Running Locally with Docker

```bash
# Build the Docker image
docker build -t vc-regression -f ci/Dockerfile .

# Run smoke tests
docker run --rm \
  --shm-size=2gb \
  --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  -v $(pwd)/test-results:/app/test-results \
  -v $(pwd)/reports:/app/reports \
  vc-regression
```

### Cost Estimates

| Selection | Suites | Est. Cost | Est. Time |
|-----------|--------|-----------|-----------|
| `smoke` | 01 | ~$2-5 | ~30 min |
| `critical` | 01, 06, 08 | ~$10-15 | ~2 hrs |
| `sprint` | 01-06, 08 | ~$20-35 | ~4 hrs |
| `full` | All 14 | ~$40-80 | ~8 hrs |

### Required GitHub Secrets

Add these to your repository **Settings > Secrets and variables > Actions**:

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `VCST_FRONT_URL` | Yes | Frontend URL |
| `VCST_BACK_URL` | Yes | Backend URL |
| `ADMIN` / `ADMIN_PASSWORD` | Yes | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Yes | Test user credentials |
| `USER2_EMAIL` / `USER2_PASSWORD` | Yes | Second test user |
| `USER_VIRTO` / `USER_VIRTO_PASSWORD` | Yes | Virtostart user |
| `STORE_ID` | Yes | Store identifier |
| `VIRTO_START_FRONT` / `VIRTO_START_BACK` | Yes | Virtostart URLs |
| `SKYFLOW_*` | For suite 06 | Skyflow payment cards |
| `CYBERSOURCE_*` | For suite 06 | CyberSource payment cards |
| `AUTHORIZNET_*` | For suite 06 | Authorize.Net payment cards |
| `DATATRANCE_*` | For suite 06 | Datatrance payment cards |

---

## Test Documentation Patterns

Each feature test follows this structure inside `tests/`:

```
tests/VCST-XXXX-feature/
├── test-plan.md              # Test strategy and scope
├── test-cases.md             # Detailed test specifications (or .csv)
├── test-execution-report.md  # Results with pass/fail status
├── testrail-import.csv       # TestRail import format
└── screenshots/
    ├── desktop/              # Desktop screenshots
    └── mobile/               # Mobile screenshots
```

---

## Bug Report Format

Bug reports go in `reports/bugs/` with this format:

```markdown
# BUG: [Clear Title] - [Ticket Reference]

## Bug ID: BUG_[Feature]_[Number]
## Severity: Critical/High/Medium/Low
## Priority: P0/P1/P2/P3

## Environment
- URL: [tested URL]
- Browser: [browser/version]
- Date: [date]
- Store Version: [version]

## Steps to Reproduce
1. [Precise step]
2. [Precise step]
3. [Precise step]

## Expected Result
[What should happen]

## Actual Result
[What actually happened]

## Evidence
- Screenshot: [path]
- Console Log: [relevant errors]
- Network: [failed requests]
- HAR: [path to HAR file]

## References
- JIRA: VCST-XXXX
```

### Severity Levels

| Level | Description | Examples |
|-------|-------------|---------|
| **Critical** | System crash, data loss, security breach | Payment failure, checkout crash |
| **High** | Major feature broken, blocking user workflow | Can't add to cart, login broken |
| **Medium** | Feature partially broken, workaround exists | Filter not clearing, wrong sort order |
| **Low** | Minor cosmetic issues | Typo, wrong icon, slight misalignment |

---

## Storybook Visual Regression

The `storybook/` directory stores visual regression baselines organized by Atomic Design:

| Tier | Components |
|------|-----------|
| **Atoms** | VcBadge, VcCheckbox, VcCheckboxGroup, VcDialog, VcIcon, VcInputDetails, VcLabel, VcRadioButton, VcSwitch, VcTypography |
| **Molecules** | VcAlert, VcButton, VcChip, VcInput, VcMenuItem, VcNavButton, VcRating, VcSelect, VcVariantPicker, VcWidget |
| **Organisms** | VcAddToCart, VcPagination, VcProductButton, VcProductCard, VcProductImage, VcQuantityStepper, VcTable |
| **Design System** | Theme comparison (Default vs Coffee) |

Screenshot naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`).

See `docs/guides/how-to-test-storybook.md` for the complete Storybook testing guide.

---

## Key Testing Domains

### Critical Revenue Flows (must always pass before deployment)

1. Registration / Sign-in / Password reset
2. Catalog browsing with facets and filters
3. Add to cart (variations, configurations)
4. Search (global, category, history)
5. Ship-to selector and address management
6. Cart operations (quantity, save for later, pickup/delivery)
7. Checkout and payment processing (Skyflow, CyberSource, Authorize.Net, Datatrance)
8. Order management and history
9. Company members and multi-organization
10. Google Analytics event tracking

### B2B-Specific Features

- Organization hierarchies and multi-org support
- Quote management
- Contract pricing
- Approval workflows
- Quick order / Bulk ordering
- Shared/private lists

### Additional Domains

- **BOPIS** - Buy Online Pickup In Store (map, filters, location selection)
- **Multilingual** - 13 languages (EN, DE, FR, ES, NO, SV, PL, IT, PT, JA, ZH, FI, RU)
- **Accessibility** - WCAG 2.1 AA compliance
- **Performance** - Core Web Vitals, load times
- **Security** - PCI compliance, input validation, XSS/SQL injection

---

## Browser Matrix

### Desktop (last 2 versions)

| Browser | Engine | MCP Server | Priority |
|---------|--------|------------|----------|
| Chrome | Chromium | `playwright-chrome` | Primary |
| Edge | Chromium | `playwright-edge` | High |
| Safari/WebKit | WebKit | `playwright-webkit` | Critical |
| Firefox | Gecko | `playwright-firefox` | High |

### Mobile

| Device | Browser | Priority |
|--------|---------|----------|
| iPhone 16/17/18 | Safari iOS | Critical |
| iPhone (older) | Safari iOS | High |
| Android last 3 models | Chrome | High |

Mobile testing is done via BrowserStack (`BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY`).

---

## Troubleshooting

### "Missing required environment variables"

Run `npm run env:check` and add the missing variables to your `.env` file. All 29 variables listed in `config.js` are required.

### Playwright MCP server not connecting

1. Make sure `.mcp.json` exists in the project root
2. Check that `config/` directory has all 4 browser config files
3. Run `npx playwright install` to install browser binaries
4. Restart your IDE after creating/modifying `.mcp.json`

### Browser not launching

1. Verify `headless: false` in the browser config JSON
2. On CI, use `headless: true` instead
3. On Windows, ensure `"command": "cmd"` and `"args": ["/c", "npx", ...]`
4. On macOS/Linux, use `"command": "npx"` directly

### "Cannot find module './config.js'"

The project uses ES modules (`"type": "module"` in `package.json`). Make sure you're importing with `.js` extension:
```javascript
import { env } from './config.js';
```

### Agent definitions not loading

The `.claude/agents/` directory is gitignored. You need to create agent files locally. Ask your team lead for copies of the agent definitions.

### JIRA/Atlassian MCP not working

1. Ensure the Atlassian MCP server is configured at the user/IDE level
2. Verify your Atlassian API token is set
3. Check that you have access to the VCST JIRA project

---

## Testing Environments

| Environment | Purpose | When to Use |
|-------------|---------|-------------|
| **Dev** | Latest code | Testing new features, breaking changes |
| **QA** | Stable testing | Full regression, integration, Storybook |
| **Staging** | Pre-production | Final validation, smoke tests before release |

Environment URLs are configured via `.env` variables:
- `FRONT_URL` - Frontend storefront
- `BACK_URL` - Backend/Admin
- `VIRTO_START_FRONT` / `VIRTO_START_BACK` - Virtostart demo store

---

## Resources

- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [Virto Commerce Documentation](https://docs.virtocommerce.org/)
- [Storefront User Guide](https://docs.virtocommerce.org/storefront/user-guide/2.0/)
- [Project Issues](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues)
