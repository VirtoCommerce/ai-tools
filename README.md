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
- [Step 6: Verify Your Setup](#step-6-verify-your-setup)
- [Available Commands](#available-commands)
- [Slash Commands & Skills](#slash-commands--skills)
- [Repository Structure](#repository-structure)
- [How Testing Works](#how-testing-works)
- [Claude Code Agents](#claude-code-agents)
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
- `tsx` - TypeScript execution for CI scripts

---

## Step 3: Environment Variables (.env)

Create a `.env` file in the project root. **Ask your team lead for the actual values** - never commit this file to Git.

```env
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
POSTMAN_API_KEY=your_postman_api_key

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

This runs `get_variables_env.js` which checks that all 33 required variables are set. If any are missing, the script will print the missing variable names.

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
2. MCP configuration will be read from `.mcp.json` (tracked in git, verify it matches your OS - see next step)
3. Agent definitions in `.claude/agents/` and skills in `.claude/skills/` are tracked in git and available automatically

---

## Step 5: MCP Server Configuration

MCP servers provide browser automation, API testing, and more. The `.mcp.json` file is **tracked in git** but may need OS-specific adjustments.

### 5.1 Verify `.mcp.json` in the project root

The repository includes a `.mcp.json` with 3 Playwright browsers + Postman:

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

> **macOS/Linux users:** Replace `"command": "cmd"` and `"args": ["/c", "npx", ...]` with `"command": "npx"` and `"args": ["@playwright/mcp@latest", "--config", "config/..."]`.

> **Note:** WebKit is NOT supported on Windows. The repository uses Chromium, Firefox, and Edge (Chromium channel).

### 5.2 Browser config files in `config/`

The `config/` directory is tracked in git and contains 3 browser configuration files:

| File | Browser | Engine |
|------|---------|--------|
| `mcp-playwright-chrome.config.json` | Chrome/Chromium | Chromium |
| `mcp-playwright-firefox.config.json` | Firefox | Gecko |
| `mcp-playwright-edge.config.json` | Edge | Chromium (msedge channel) |

All configs set:
- Viewport: 1920x1080
- HAR capture: enabled
- Video: on failure
- Isolated browser contexts

### 5.3 Additional MCP Servers (User-Level Configuration)

These are configured at the user/IDE level, not in the project `.mcp.json`:

| Server | Purpose | Setup |
|--------|---------|-------|
| **Chrome DevTools MCP** | Console logs, network requests, performance tracing, HAR export | Follow [Chrome DevTools MCP docs](https://github.com/nicholasadamou/chrome-devtools-mcp) |
| **Atlassian MCP** | JIRA integration - ticket management, bug reporting | Follow [Atlassian MCP docs](https://github.com/sooperset/mcp-atlassian) - requires Atlassian API token |
| **Figma MCP** | Visual comparison against design specs | Requires `FIGMA_API_KEY` from `.env` |
| **GitHub MCP** | PR review, code search, issue management | Requires GitHub personal access token |
| **Context7** | Up-to-date library documentation lookup | See [Context7 docs](https://github.com/context7/context7) |

---

## Step 6: Verify Your Setup

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

All 33 variables should print their values (no missing variable errors).

### 4. Install Playwright browsers

```bash
npx playwright install chromium firefox
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
- [ ] `.env` file created with all 33 variables
- [ ] `npm run env:check` passes
- [ ] `.mcp.json` verified for your OS (Windows uses `cmd /c npx`, macOS/Linux uses `npx` directly)
- [ ] `config/` directory has 3 browser config JSONs (chrome, firefox, edge)
- [ ] Playwright browsers installed (`npx playwright install chromium firefox`)
- [ ] IDE installed with Claude Code extension
- [ ] Atlassian MCP configured (for JIRA access)
- [ ] Chrome DevTools MCP configured (optional but recommended)
- [ ] First test run successful (browser opens, navigates, takes screenshot)

---

## Available Commands

```bash
npm install              # Install dependencies
npm run env:check        # Validate all 33 environment variables
npm run ci:regression    # Run CI regression via Claude Agent SDK
npm run ci:smoke         # Run smoke tests only (suite 01)
npm run ci:critical      # Run critical P0 suites (01, 06, 08, 14)
npm run ci:frontend      # Run all frontend suites (01-13, 35-36)
npm run ci:backend       # Run all backend suites (14-34)
npm run ci:full          # Run full regression (all 36 suites, $80 budget)
npm run ci:notify        # Send Teams notification (requires TEAMS_WEBHOOK_URL)
```

---

## Slash Commands & Skills

### Slash Commands (9)

Available via `/command-name` in Claude Code chat:

| Command | Arguments | Purpose |
|---------|-----------|---------|
| `/qa-smoke` | `[storefront\|admin]` | Daily smoke test (12 P0 tests, ~15 min, GO/NO-GO verdict) |
| `/qa-test` | `VCST-XXXX \| feature \| PR #N` | Test a JIRA ticket, feature, or PR |
| `/qa-regression` | `[smoke\|critical\|sprint\|full\|frontend\|backend\|IDs]` | Run regression suites in parallel |
| `/qa-status` | `[run\|jira\|env]` | Dashboard: run status, JIRA queue, env health, recent bugs |
| `/qa-bug` | `description \| VCST-XXXX \| screenshot` | Reproduce, document, and optionally file a JIRA bug |
| `/qa-exploratory` | `[checkout\|catalog\|B2B\|mobile\|new]` | Guided exploratory testing session with heuristics |
| `/qa-env-check` | `[vars\|endpoints\|mcp]` | Validate env vars, endpoints, MCP servers, test infra |
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|module <name>]` | Business analysis (full/flows/api/docs/stories/module) |
| `/ba-stories` | `feature name \| VCST-XXXX` | Generate Agile user stories with BDD acceptance criteria |

### Skills (16)

Organized in 3 categories under `.claude/skills/`:

**Virto Commerce Knowledge (auto-invocable):**

| Skill | Purpose |
|-------|---------|
| `/vc-docs` | Documentation lookup via Context7 |
| `/vc-module` | Module analysis and test suite mapping |
| `/vc-api` | xAPI & REST API query reference |

**Testing (manual invocation):**

| Skill | Purpose |
|-------|---------|
| `/qa-storybook` | Storybook visual regression, responsive breakpoints |
| `/qa-accessibility` | WCAG 2.1 AA accessibility audit |
| `/qa-design` | Design system consistency & UX heuristics |
| `/qa-plan` | Test plans from E2E scenario catalog (105 scenarios) |
| `/qa-api` | REST API & GraphQL xAPI testing |

**QA Methodology (manual invocation):**

| Skill | Purpose |
|-------|---------|
| `/qa-process` | ISTQB 7-phase test lifecycle |
| `/qa-investigate` | Bug investigation and root cause analysis |
| `/qa-evidence` | Evidence capture & report formatting |
| `/qa-defect` | Defect management lifecycle & JIRA workflow |
| `/qa-test-design` | Test case derivation techniques (EP, BVA, decision tables) |
| `/qa-risk` | Risk-based test prioritization (5x5 matrix) |
| `/qa-metrics` | Quality metrics & gates |
| `/qa-sbtm` | Session-based exploratory testing |

---

## Repository Structure

```
vc-mcp-testing-module/
├── INDEX.md                 # Top-level repo navigation hub
├── CLAUDE.md                # Claude Code project instructions (tracked)
├── .claude/
│   ├── agents/              # Claude Code agent definitions (11 agents, tracked)
│   │   └── knowledge/       # Shared agent reference files
│   ├── skills/              # Skills grouped by category (16 skills, tracked)
│   │   ├── vc-knowledge/    # VC docs, module analysis, API reference
│   │   ├── testing/         # Storybook, accessibility, design, plan, API
│   │   └── qa-methodology/  # Process, investigation, evidence, test design, etc.
│   ├── commands/            # Slash commands (9 commands, tracked)
│   └── ROUTING.md           # Decision tree: when to use which command/skill/agent
├── .mcp.json                # MCP server configuration (tracked, OS-specific)
├── config/                  # Playwright MCP browser configs + test-suites.json (tracked)
│   ├── mcp-playwright-chrome.config.json
│   ├── mcp-playwright-edge.config.json
│   ├── mcp-playwright-firefox.config.json
│   └── test-suites.json     # Suite manifest (36 suites, selection groups)
├── ci/                      # CI regression infrastructure (gitignored)
│   ├── agents/              # CI-specific agent definitions
│   ├── config/              # Headless browser config
│   ├── run-regression.ts    # Orchestrator script
│   └── notify-teams.ts      # Teams webhook notifications
├── docs/
│   ├── prompts/             # LLM prompt templates for QA automation
│   └── workshop/            # Team onboarding workshop
├── regression/
│   └── suites/              # 36 regression test suites (1,274 test cases, CSV)
│       ├── Frontend/        # 15 suites (01-13, 35-36)
│       └── Backend/         # 21 suites (14-34)
├── test-data/               # Centralized test data
├── tests/                   # Test cases organized by sprint & JIRA ticket
├── reports/
│   ├── bugs/                # Bug reports with evidence
│   └── regression/          # Regression test execution reports
├── archive/sprints/         # Historical sprint test cases
├── Test suites & Cases/     # Original TestRail export (source-of-truth reference)
├── config.js                # Environment variable configuration
├── get_variables_env.js     # Environment validation script (33 vars)
├── package.json             # Project dependencies and scripts
```

**Tracked in git:** `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.mcp.json`, `config/`, `CLAUDE.md`

**Gitignored:** `settings.json`, `.env`, `test-results/`, `.serena/`, `.playwright-mcp/`, `ci/`, `.github/`

---

## How Testing Works

This project uses an **LLM-driven testing workflow** instead of traditional `.spec.js` test files.

### Two Testing Modes

#### 1. Interactive MCP-Driven Testing (Primary)

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

#### 2. CI Regression via Claude Agent SDK

`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/`, runs suites in parallel batches (up to 3 concurrent), and produces consolidated reports. Results tracked in `reports/regression/history.json` (90-day rolling window).

### Prompt Templates

| Template | Purpose |
|----------|---------|
| `test-runner-agent.md` | Suite execution template with parameterized placeholders |
| `How to test Builder.io.md` | Builder.io, Virto Pages & vc-frontend testing |
| `story-testing.md` | Story-level testing prompt |

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

## Claude Code Agents

11 specialized agents in `.claude/agents/` (tracked in git) across two teams.

### QA Team (7 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, go/no-go decisions |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression, retries, browser fallback, consolidated reports |

### BA Team (4 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, module inventory, user flows, pain points |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | User docs, admin guides, API quick-start, UX improvement specs |

### Using Agents

In Claude Code chat, reference agents with natural language:

```
"Use the qa-frontend-expert to verify the checkout flow"
"Use the qa-testing-expert to run smoke tests on the QA environment"
"Use the ba-story-writer to create stories for VCST-1234"
```

### Parallel Agent Execution

When running multiple agents simultaneously, each agent **MUST use its own browser**:

| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| qa-frontend-expert | `playwright-chrome` | |
| qa-backend-expert | `playwright-edge` | Chrome DevTools MCP for Admin SPA |
| qa-testing-expert | `playwright-firefox` | |
| ui-ux-expert | `Chrome DevTools MCP` | |

Max 3 concurrent browser agents. BA agents do not require browsers.

---

## Regression Test Suites

36 test suites (15 frontend + 21 backend) in `regression/suites/` with **1,274 total test cases** (492 frontend + 782 backend) in TestRail-compatible CSV format. Authoritative suite definitions live in `config/test-suites.json`.

### Frontend Suites (01-13, 35-36)

| # | Suite | Tests | Priority |
|---|-------|-------|----------|
| 01 | Smoke Tests | 12 | P0 Critical |
| 02 | Authentication Tests | 34 | P1 High |
| 03 | Catalog & Search Tests | 39 | P1 High |
| 04 | Cart & Checkout Tests | 31 | P1 Critical |
| 05 | BOPIS Pickup Tests | 36 | P1 Critical |
| 06 | Payment Tests | 28 | P0 Critical |
| 07 | Google Analytics Tests | 24 | P2 High |
| 08 | Security Tests | 18 | P0 Critical |
| 09 | Accessibility Tests | 23 | P1 High |
| 10 | Localization Tests | 21 | P2 Medium |
| 11 | Performance Tests | 20 | P2 Medium |
| 12 | Browser Compatibility Tests | 21 | P1 High |
| 13 | B2C Features Tests | 55 | P1 Critical |
| 35 | Frontend White Labeling Tests | 68 | P1 High |
| 36 | Configurable Products Tests | 62 | P1 High |

### Backend Suites (14-34)

| # | Suite | Tests | Priority |
|---|-------|-------|----------|
| 14 | Platform API Tests | 25 | P0 Critical |
| 15 | GraphQL xAPI Tests | 20 | P1 High |
| 16 | Catalog Admin Tests | 48 | P1 High |
| 17 | Platform Core Tests | 65 | P1 High |
| 18 | Store Admin Tests | 65 | P1 High |
| 19 | Pricing Admin Tests | 58 | P1 High |
| 20 | Orders Admin Tests | 66 | P1 High |
| 21 | Customer Admin Tests | 52 | P1 High |
| 22 | Inventory Admin Tests | 43 | P1 High |
| 23 | Marketing Admin Tests | 51 | P1 High |
| 24 | Notifications Admin Tests | 52 | P1 High |
| 25 | CMS & Page Builder Tests | 55 | P1 High |
| 26 | Search & Indexing Tests | 40 | P1 High |
| 27 | Assets Module Tests | 24 | P1 High |
| 28 | Core Settings Tests | 14 | P2 Medium |
| 29 | CSV Export Import Tests | 18 | P1 High |
| 30 | Shipping Module Tests | 15 | P1 High |
| 31 | SEO Module Tests | 20 | P1 High |
| 32 | White Labeling Tests | 15 | P2 Medium |
| 33 | Push Messages Tests | 16 | P2 Medium |
| 34 | Image Tools Tests | 20 | P2 Medium |

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily validation before deployment |
| `critical` | 01, 06, 08, 14 | P0 suites only |
| `sprint` | 26 suites | Before sprint release |
| `full` | All 36 | Before production release |
| `frontend` | 01-13, 35-36 | Frontend-only regression |
| `backend` | 14-34 | Backend-only regression |

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
| Suite selection | `smoke`, `full`, `critical`, `sprint`, `frontend`, `backend`, or comma-separated IDs | `smoke` |
| Environment | `dev`, `qa`, `staging` | `qa` |
| Max budget (USD) | Any number | `10.0` |
| Max turns | Agent turns per suite | `100` |
| Model | `claude-sonnet-4-6`, `claude-opus-4-6` | Sonnet |

### Scheduled Pipeline

- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 01 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all 36 suites ($80 budget)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

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
| `critical` | 01, 06, 08, 14 | ~$10-15 | ~2 hrs |
| `sprint` | 26 suites | ~$30-50 | ~4-6 hrs |
| `full` | All 36 | ~$50-80 | ~8-12 hrs |

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
| `TEAMS_WEBHOOK_URL` | Optional | Teams notification webhook |

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

Visual regression baselines are captured on-demand by the `/qa-storybook` skill (delegated to `ui-ux-expert` agent). Components tested across Atomic Design tiers:

| Tier | Components |
|------|-----------|
| **Atoms** | VcBadge, VcCheckbox, VcCheckboxGroup, VcDialog, VcIcon, VcInputDetails, VcLabel, VcRadioButton, VcSwitch, VcTypography |
| **Molecules** | VcAlert, VcButton, VcChip, VcInput, VcMenuItem, VcNavButton, VcRating, VcSelect, VcVariantPicker, VcWidget |
| **Organisms** | VcAddToCart, VcPagination, VcProductButton, VcProductCard, VcProductImage, VcQuantityStepper, VcTable |
| **Design System** | Theme comparison (Default vs Coffee) |

Screenshot naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`).

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
| Firefox | Gecko | `playwright-firefox` | High |

> **Note:** WebKit/Safari is NOT supported on Windows. For Safari testing, use BrowserStack.

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

Run `npm run env:check` and add the missing variables to your `.env` file. All 33 variables listed in `get_variables_env.js` are required.

### Playwright MCP server not connecting

1. Make sure `.mcp.json` exists in the project root
2. Check that `config/` directory has all 3 browser config files (chrome, firefox, edge)
3. Run `npx playwright install chromium firefox` to install browser binaries
4. Restart your IDE after modifying `.mcp.json`

### Browser not launching

1. Verify `headless: false` in the browser config JSON
2. On CI, use `headless: true` instead
3. On Windows, ensure `"command": "cmd"` and `"args": ["/c", "npx", ...]`
4. On macOS/Linux, use `"command": "npx"` directly
5. Do NOT attempt to install WebKit on Windows - use Edge or Chrome instead

### "Cannot find module './config.js'"

The project uses ES modules (`"type": "module"` in `package.json`). Make sure you're importing with `.js` extension:
```javascript
import { env } from './config.js';
```

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
- `FRONT_URL` / `BACK_URL` - QA environment
- `VIRTO_START_FRONT` / `VIRTO_START_BACK` - Virtostart demo store
- `STORYBOOK_URL` / `STORYBOOK_DEV_URL` - Storybook instances

---

## Resources

- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [Virto Commerce Documentation](https://docs.virtocommerce.org/)
- [Storefront User Guide](https://docs.virtocommerce.org/storefront/user-guide/2.0/)
- [Project Issues](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues)
