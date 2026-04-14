# vc-mcp-testing-module

Agentic QA system for the **Virto Commerce B2B e-commerce platform**.

> **This is NOT a traditional test automation codebase** with `.spec.js` files. Tests are executed through natural language prompts via MCP (Model Context Protocol) servers — LLM-powered browser automation with AI agents that navigate, test, and report.

---

## Quick Start

For experienced developers who want to get running fast:

```bash
git clone https://github.com/VirtoCommerce/vc-mcp-testing-module.git
cd vc-mcp-testing-module
npm install
npx playwright install chromium firefox
# Create .env (get values from team lead) → npm run env:check
# Create .mcp.json (see Step 5 below) → restart IDE
# Open Claude Code → type: /qa-smoke storefront
```

Need details? Follow the full setup below.

---

## Table of Contents

**Setup (start here)**
- [Prerequisites](#prerequisites)
- [Step 1: Clone & Install](#step-1-clone--install)
- [Step 2: Environment Variables](#step-2-environment-variables-env)
- [Step 3: IDE Setup](#step-3-ide-setup)
- [Step 4: MCP Server Configuration](#step-4-mcp-server-configuration)
- [Step 5: Verify Your Setup](#step-5-verify-your-setup)
- [Troubleshooting](#troubleshooting)

**Usage**
- [How Testing Works](#how-testing-works)
- [Commands, Skills & Agents](#commands-skills--agents)
- [Available npm Commands](#available-npm-commands)

**Reference**
- [Repository Structure](#repository-structure)
- [Regression Test Suites](#regression-test-suites)
- [CI/CD Pipeline](#cicd-pipeline)
- [Testing Domains & Browser Matrix](#testing-domains--browser-matrix)
- [Resources](#resources)

---

## Prerequisites

| Requirement | Version | How to Check | Install |
|-------------|---------|--------------|---------|
| **Node.js** | 18+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| **Git** | Latest | `git --version` | [git-scm.com](https://git-scm.com/) |
| **IDE** | Latest | — | VS Code (recommended), Cursor, or Windsurf |

**VS Code users:** Install the [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code).
**Cursor / Windsurf users:** MCP support is built-in, no extra extension needed.

### Required Accounts & Access

Ask your team lead for:

- **Anthropic API key** — for Claude Code and CI regression
- **QA environment credentials** — frontend + backend URLs, admin and test user accounts
- **GitHub personal access token** — for GitHub MCP (code search, PR review)
- **JIRA (Atlassian)** access — VCST project board
- **Postman API key** — for API test collections
- **Payment processor test cards** — Skyflow, CyberSource, Authorize.Net, Datatrance
- **Figma API key** — for design comparison testing (optional)
- **BrowserStack credentials** — for real device / Safari testing (optional)

---

## Step 1: Clone & Install

```bash
git clone https://github.com/VirtoCommerce/vc-mcp-testing-module.git
cd vc-mcp-testing-module
npm install
npx playwright install chromium firefox
```

> Edge uses the system-installed `msedge` — no separate install needed.

---

## Step 2: Environment Variables (.env)

Create a `.env` file in the project root. **Get actual values from your team lead** — never commit this file.

```env
# ===== Claude / AI =====
ANTHROPIC_API_KEY=sk-ant-your-key-here

# ===== Application URLs =====
FRONT_URL=https://your-frontend-url.govirto.com/
BACK_URL=https://your-backend-url.govirto.com
VIRTO_START_FRONT=https://virtostart-demo-store.govirto.com/
VIRTO_START_BACK=https://your-virtostart-backend-url.com
STORYBOOK_URL=https://your-storybook-url.com
STORYBOOK_DEV_URL=https://your-storybook-dev-url.com

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
# These are standard test card numbers (not real cards).
# Expiry/CVV values below work for sandbox environments.

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
GIT_TOKEN=ghp_your_github_personal_access_token
FIGMA_API_KEY=your_figma_api_key
BROWSERSTACK_USERNAME=your_browserstack_username
BROWSERSTACK_ACCESS_KEY=your_browserstack_access_key
POSTMAN_API_KEY=your_postman_api_key
```

Validate your setup:

```bash
npm run env:check    # Checks all 33 required variables
```

### Accessing env vars in code

```javascript
import { env } from './config.js';  // ES modules — always use .js extension
console.log(env.FRONT_URL);
```

---

## Step 3: IDE Setup

### VS Code with Claude Code

1. Install the **Claude Code** extension from the VS Code marketplace
2. Open the project folder in VS Code
3. Set your Anthropic API key when prompted (or via `ANTHROPIC_API_KEY` in `.env`)
4. Claude Code automatically reads `CLAUDE.md` for project context

### Cursor / Windsurf

1. Open the project folder
2. `.mcp.json` (created in the next step) configures MCP servers automatically
3. Agents (`.claude/agents/`) and skills (`.claude/skills/`) are tracked in git and load automatically

---

## Step 4: MCP Server Configuration

The `.mcp.json` file is **gitignored** — you must create it locally after cloning.

### Create `.mcp.json` in the project root

**Windows:**

```json
{
  "mcpServers": {
    "playwright-chrome": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"]
    },
    "playwright-firefox": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-firefox.config.json"]
    },
    "playwright-edge": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-edge.config.json"]
    },
    "postman": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "@postman/postman-mcp-server@latest", "--minimal"],
      "env": { "POSTMAN_API_KEY": "%POSTMAN_API_KEY%" }
    }
  }
}
```

**macOS / Linux:**

```json
{
  "mcpServers": {
    "playwright-chrome": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"]
    },
    "playwright-firefox": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-firefox.config.json"]
    },
    "playwright-edge": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-edge.config.json"]
    },
    "postman": {
      "type": "stdio",
      "command": "npx",
      "args": ["@postman/postman-mcp-server@latest", "--minimal"],
      "env": { "POSTMAN_API_KEY": "$POSTMAN_API_KEY" }
    }
  }
}
```

> **WebKit is NOT supported on Windows.** The repository uses Chromium, Firefox, and Edge.

Browser config files in `config/` are tracked in git (viewport 1920x1080, HAR capture enabled, video on failure, isolated contexts).

### Additional MCP Servers (user-level, optional)

These are configured in your IDE settings, not in the project `.mcp.json`:

| Server | Purpose |
|--------|---------|
| **Chrome DevTools MCP** | Console logs, network requests, performance tracing, HAR export |
| **Azure MCP** | Application Insights, resource health, monitoring |
| **Atlassian MCP** | JIRA integration — ticket management, bug reporting (requires Atlassian API token) |
| **Figma MCP** | Visual comparison against design specs |
| **GitHub MCP** | PR review, code search, issue management (uses `GIT_TOKEN` from `.env`) |
| **Context7** | Up-to-date library documentation lookup |

---

## Step 5: Verify Your Setup

```bash
node --version          # Should be 18+
npm run env:check       # All 33 variables should pass
```

Then open Claude Code in your IDE and type:

```
Navigate to the storefront URL and take a screenshot
```

If a browser opens and navigates to the site — you're all set.

### Setup Checklist

- [ ] `npm install` completed
- [ ] `.env` created with all 33 variables, `npm run env:check` passes
- [ ] `.mcp.json` created for your OS (Windows: `cmd /c npx`, macOS/Linux: `npx`)
- [ ] Playwright browsers installed (`npx playwright install chromium firefox`)
- [ ] IDE installed with Claude Code extension
- [ ] First test run: browser opens, navigates, takes screenshot

---

## Troubleshooting

### "Missing required environment variables"

Run `npm run env:check`. Add missing variables to `.env`. All 33 variables listed in `get_variables_env.js` are required.

### Playwright MCP server not connecting

1. Verify `.mcp.json` exists in the project root (it's gitignored — you must create it)
2. Check `config/` has all 3 browser config JSONs (chrome, firefox, edge)
3. Run `npx playwright install chromium firefox`
4. **Restart your IDE** after any `.mcp.json` change

### Browser not launching

1. Close all Chrome windows before using `playwright-chrome` (user data directory conflict)
2. On Windows: ensure `"command": "cmd"` and `"args": ["/c", "npx", ...]`
3. On macOS/Linux: use `"command": "npx"` directly
4. Do NOT attempt WebKit on Windows — use Edge or Chrome instead

### "Cannot find module './config.js'"

This project uses ES modules (`"type": "module"`). Always use `.js` extensions in imports:
```javascript
import { env } from './config.js';
```

### JIRA/Atlassian MCP not working

1. Atlassian MCP is configured at the user/IDE level, not in `.mcp.json`
2. Verify your Atlassian API token is set
3. Check that you have access to the VCST JIRA project

---

## How Testing Works

### Three Testing Modes

#### 1. Interactive MCP-Driven Testing (Primary)

The everyday workflow — you tell Claude Code what to test in natural language:

```
/qa-smoke storefront
/qa-test VCST-1234
Use the qa-frontend-expert to verify the checkout flow
```

Claude Code opens a real browser via Playwright MCP, navigates the site, performs actions, captures HAR files / screenshots / console logs, and generates reports.

#### 2. CI Regression via Claude Agent SDK

`ci/run-regression.ts` runs headless regression in Docker. It reads CSV suites from `regression/suites/`, runs up to 3 in parallel, and produces consolidated reports.

> **Note:** The `ci/` directory is gitignored. It's available in the CI environment and for team members with CI access. Contact your team lead if you need local CI setup.

#### 3. Autonomous Interactive Regression (Agent Teams)

`autonomous-regression-orchestrator` creates a team of child agents, each with isolated browsers and exponential backoff. Invoke with `/qa-regression critical --autonomous`.

### Prompt Templates

Located in `docs/prompts/`:

| Template | Purpose |
|----------|---------|
| `How to test Builder.io.md` | Builder.io, Virto Pages & vc-frontend testing |
| `story-testing.md` | Story-level testing prompt |

> **Note:** `test-runner-agent.md` is an agent definition at `.claude/agents/qa/test-runner-agent.md`, not a prompt template.

---

## Commands, Skills & Agents

### Slash Commands (13)

Type `/command-name` in Claude Code chat. See `.claude/rules/skills-commands.md` for full argument reference.

| Command | Purpose |
|---------|---------|
| `/qa-smoke` | Daily smoke test (~15 min, GO/NO-GO verdict) |
| `/qa-test` | Test a JIRA ticket, feature, or PR |
| `/qa-regression` | Run regression suites in parallel |
| `/qa-status` | Dashboard: run status, JIRA queue, env health |
| `/qa-bug` | Reproduce, document, and file a JIRA bug |
| `/qa-exploratory` | Guided exploratory testing session |
| `/qa-env-check` | Validate env vars, endpoints, MCP servers |
| `/qa-coverage-generation` | Parallel coverage generation pipeline |
| `/qa-test-lifecycle` | Unified pipeline: sync stale cases + analyze gaps + generate + review + verify (PR, module, diff, suite, domain) |
| `/qa-sync-tests` | _(deprecated — redirects to `/qa-test-lifecycle`)_ |
| `/qa-verify-fix` | Verify a bug fix with regression checks |
| `/ba-analyze` | Business analysis with GitHub search + live UI |
| `/ba-stories` | Generate Agile user stories with BDD criteria |

### Skills (20)

Type `/skill-name` in Claude Code chat. Organized in `.claude/skills/` across 3 categories:

**VC Knowledge (1):** `/vc-docs` — documentation lookup via Context7

**Testing (10):** `/qa-storybook`, `/qa-accessibility`, `/qa-design`, `/qa-plan`, `/qa-checklist`, `/qa-api`, `/qa-coverage-gap`, `/qa-postman`, `/qa-seed-data`, `/qa-review-tests`

**QA Methodology (9):** `/qa-process`, `/qa-investigate`, `/qa-evidence`, `/qa-defect`, `/qa-test-design`, `/qa-test-cases-generator`, `/qa-risk`, `/qa-metrics`, `/qa-sbtm`

### Agents (14)

14 specialized agents in `.claude/agents/` across two teams. Use them by name in chat:

```
"Use the qa-frontend-expert to verify the checkout flow"
"Use the qa-backend-expert to test the Platform API"
"Use the ba-story-writer to create stories for VCST-1234"
```

**QA Team (10):** `qa-lead-orchestrator` (sonnet), `qa-frontend-expert` (opus), `qa-backend-expert` (opus), `qa-testing-expert` (opus), `test-management-specialist` (sonnet), `ui-ux-expert` (sonnet), `regression-orchestrator` (sonnet), `autonomous-regression-orchestrator` (sonnet), `autonomous-test-runner` (sonnet), `test-runner-agent` (sonnet)

**BA Team (4):** `ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, `ba-doc-writer` (all sonnet)

Each parallel agent uses its own browser — see `.claude/rules/agents.md` for browser assignments. Max 3 concurrent browser agents.

---

## Available npm Commands

```bash
npm install              # Install dependencies
npm run env:check        # Validate all 33 environment variables
npm run ci:smoke         # Smoke tests only (suite 01)
npm run ci:critical      # P0 suites (01, 06, 08, 14)
npm run ci:frontend      # Frontend suites (01-13, 35-36, 41)
npm run ci:backend       # Backend suites (14-34, 37-40, 42)
npm run ci:full          # Full regression (all 45 suites)
npm run ci:regression    # Run CI regression via Claude Agent SDK
npm run ci:coverage      # Coverage generation pipeline
npm run ci:notify        # Teams notification (requires TEAMS_WEBHOOK_URL)
```

---

## Repository Structure

```
vc-mcp-testing-module/
├── CLAUDE.md                # Claude Code project instructions
├── .claude/
│   ├── agents/              # 14 agent definitions (qa/ + ba/) + knowledge/ (14 reference files)
│   ├── skills/              # 20 skills across 3 categories
│   ├── commands/            # 13 slash commands
│   └── rules/               # Reference docs (agents, regression, skills, MCP)
├── config/                  # Playwright browser configs + test-suites.json manifest
├── ci/                      # CI regression infrastructure (gitignored)
├── docs/prompts/            # LLM prompt templates
├── regression/suites/       # 45 CSV suites (~2,271 test cases)
│   ├── Frontend/            # 19 suites (00-13, 35-36, 41)
│   └── Backend/             # 26 suites (14-34, 37-40, 42)
├── tests/                   # Test cases by sprint/JIRA ticket
├── test-data/               # Orgs, search queries, uploads
├── reports/                 # Bug reports + regression reports
├── config.js                # Environment variable configuration
└── get_variables_env.js     # Environment validation script
```

**Tracked in git:** `.claude/`, `config/`, `regression/`, `tests/`, `docs/`, `CLAUDE.md`

**Gitignored:** `.env`, `.mcp.json`, `settings.json`, `results/`, `ci/`, `.github/`

---

## Regression Test Suites

45 suites (19 frontend + 26 backend) with **~2,271 test cases** in enriched agent-native CSV format. Authoritative definitions in `config/test-suites.json`.

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily validation before deployment |
| `critical` | 01, 06, 08, 14 | P0 suites only |
| `release` | 00 | Master suite (90 cases) for major releases |
| `sprint` | 33 suites | Before sprint release |
| `full` | All 45 | Before production release |
| `frontend` | 18 suites (01-13, 35-36, 41) | Frontend-only regression |
| `backend` | 26 suites (14-34, 37-40, 42) | Backend-only regression |

### P0 Critical Suites

| Suite | Tests | Domain |
|-------|-------|--------|
| 01 — Smoke Tests | 19 | Core flows end-to-end |
| 06 — Payment Tests | 65 | Skyflow, CyberSource, Authorize.Net, Datatrance |
| 08 — Security Tests | 32 | PCI compliance, input validation |
| 14 — Platform API Tests | 33 | REST API health |

### CSV Column Format

```
ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions,
Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup,
References, Automation_Status
```

<details>
<summary><b>Full suite list (45 suites)</b></summary>

#### Frontend (19 suites)

| # | Suite | Tests | Priority |
|---|-------|-------|----------|
| 00 | Full Regression Release (Master) | 100 | P0 |
| 01 | Smoke Tests | 19 | P0 |
| 02 | Authentication Tests | 68 | P1 |
| 03 | Catalog & Search Tests | 130 | P1 |
| 04a | Cart Tests | 77 | P1 |
| 04b | Checkout Tests | 80 | P1 |
| 04c | Orders & Quotes Tests | 81 | P1 |
| 05 | BOPIS Pickup Tests | 88 | P1 |
| 06 | Payment Tests | 65 | P0 |
| 07 | Google Analytics Tests | 24 | P2 |
| 08 | Security Tests | 32 | P0 |
| 09 | Accessibility Tests | 23 | P1 |
| 10 | Localization Tests | 26 | P2 |
| 11 | Performance Tests | 20 | P2 |
| 12 | Browser Compatibility Tests | 21 | P1 |
| 13 | B2C Features Tests | 166 | P1 |
| 35 | Frontend White Labeling Tests | 68 | P1 |
| 36 | Configurable Products Tests | 133 | P1 |
| 41 | Coupons & Promotions Tests | 54 | P1 |

#### Backend (26 suites)

| # | Suite | Tests | Priority |
|---|-------|-------|----------|
| 14 | Platform API Tests | 33 | P0 |
| 15 | GraphQL xAPI Tests | 33 | P1 |
| 16 | Catalog Admin Tests | 78 | P1 |
| 17 | Platform Core Tests | 80 | P1 |
| 18 | Store Admin Tests | 65 | P1 |
| 19 | Pricing Admin Tests | 62 | P1 |
| 20 | Orders Admin Tests | 90 | P1 |
| 21 | Customer Admin Tests | 84 | P1 |
| 22 | Inventory Admin Tests | 43 | P1 |
| 23 | Marketing Admin Tests | 89 | P1 |
| 24 | Notifications Admin Tests | 64 | P1 |
| 25 | CMS & Page Builder Tests | 75 | P1 |
| 26 | Search & Indexing Tests | 46 | P1 |
| 27 | Assets Module Tests | 24 | P1 |
| 28 | Core Settings Tests | 14 | P2 |
| 29 | CSV Export Import Tests | 18 | P1 |
| 30 | Shipping Module Tests | 20 | P1 |
| 31 | SEO Module Tests | 20 | P1 |
| 32 | White Labeling Tests | 40 | P2 |
| 33 | Push Messages Tests | 25 | P2 |
| 34 | Image Tools Tests | 28 | P2 |
| 37 | Returns Admin Tests | 22 | P1 |
| 38 | Contracts Admin Tests | 18 | P1 |
| 39 | Loyalty Admin Tests | 18 | P1 |
| 40 | Channels & Data Quality Tests | 15 | P2 |
| 42 | xMarketing Module Tests | 38 | P1 |

</details>

---

## CI/CD Pipeline

> **Note:** The `ci/` directory is gitignored. CI infrastructure is available in the GitHub Actions environment. Contact your team lead for local Docker CI setup.

### GitHub Actions

Go to **Actions** > **Regression Tests** > **Run workflow**:

| Parameter | Options | Default |
|-----------|---------|---------|
| Suite selection | `smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`, or IDs | `smoke` |
| Environment | `dev`, `qa`, `staging` | `qa` |
| Max budget (USD) | Any number | `10.0` |

### Scheduled Runs

- **Daily smoke**: Mon-Fri 6:00 AM UTC — suite 01, $5 budget
- **Weekly full**: Sunday 2:00 AM UTC — all 45 suites, $80 budget

### Cost Estimates

| Selection | Suites | Est. Cost | Est. Time |
|-----------|--------|-----------|-----------|
| `smoke` | 1 | ~$2-5 | ~30 min |
| `critical` | 4 | ~$10-15 | ~2 hrs |
| `sprint` | 33 | ~$40-60 | ~5-8 hrs |
| `full` | 45 | ~$60-100 | ~10-14 hrs |

### Required GitHub Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `VCST_FRONT_URL` / `VCST_BACK_URL` | Yes | Environment URLs |
| `ADMIN` / `ADMIN_PASSWORD` | Yes | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Yes | Test user credentials |
| `USER2_EMAIL` / `USER2_PASSWORD` | Yes | Second test user |
| `USER_VIRTO` / `USER_VIRTO_PASSWORD` | Yes | Virtostart user |
| `STORE_ID` | Yes | Store identifier |
| `VIRTO_START_FRONT` / `VIRTO_START_BACK` | Yes | Virtostart URLs |
| `SKYFLOW_*`, `CYBERSOURCE_*`, `AUTHORIZNET_*`, `DATATRANCE_*` | For suite 06 | Payment test cards |
| `TEAMS_WEBHOOK_URL` | Optional | Teams notification webhook |

---

## Testing Domains & Browser Matrix

### Critical Revenue Flows (must pass before deployment)

Registration/Auth, Catalog/Facets, Cart (variations, BOPIS), Search, Addresses, Checkout/Payment, Orders, B2B Multi-org, GA4 tracking.

**Payment flow:** CyberSource shows the payment form on the cart page. All other processors (Skyflow, Authorize.Net, Datatrance) require clicking "Place Order" first → redirects to `/checkout/payment`.

### Browser Matrix

| Browser | Engine | MCP Server | Priority |
|---------|--------|------------|----------|
| Chrome | Chromium | `playwright-chrome` | Primary |
| Edge | Chromium (msedge) | `playwright-edge` | High |
| Firefox | Gecko | `playwright-firefox` | High |

> WebKit/Safari is NOT supported on Windows. For Safari testing, use BrowserStack.

Mobile testing via BrowserStack (`BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY`).

---

## Resources

- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [Virto Commerce Documentation](https://docs.virtocommerce.org/)
- [Storefront User Guide](https://docs.virtocommerce.org/storefront/user-guide/2.0/)
- [Project Issues](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues)
- Detailed internal reference: `.claude/rules/` (agents, regression, skills, MCP)
