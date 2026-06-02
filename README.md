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
# Create .env.local (secrets) → npm run env:check
# Create .mcp.json (see Step 4 below) → restart IDE
# Open Claude Code → type: /qa-smoke storefront
```

Default `TEST_ENV` is `vcst`. Switch with `TEST_ENV=vcptcore npm run env:check` or `TEST_ENV=virtostart …`.

Need details? Follow the full setup below.

---

## Table of Contents

**Setup (start here)**
- [Prerequisites](#prerequisites)
- [Step 1: Clone & Install](#step-1-clone--install)
- [Step 2: Environment Variables](#step-2-environment-variables-layered-loader)
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
- **QA environment credentials** — frontend + backend URLs, admin and test user accounts (per environment)
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

## Step 2: Environment Variables (Layered Loader)

The project uses a **layered env loader** keyed by `TEST_ENV` (default `vcst`). Files load in order; later files override earlier ones:

| File | Tracked | Purpose |
|------|---------|---------|
| `.env.defaults` | git | Cross-env constants (sandbox cards, Builder.io URL) |
| `.env.${TEST_ENV}` | git | Per-env URLs/identifiers — e.g. `.env.vcst`, `.env.vcptcore`, `.env.virtostart` (no secrets) |
| `.env.local` | **gitignored** | Secrets: passwords, API tokens — create this locally |
| `.env` | **gitignored** | Legacy fallback (backwards-compat); migrate to `.env.local` |

Variable *names* are stable across environments — only values differ. Agents read via `process.env.X`; they don't care which file the value came from.

### Switching environments

```bash
TEST_ENV=vcptcore npm run env:check      # Second QA environment
TEST_ENV=virtostart npm run env:check    # Staging
npm run env:check                        # Default = vcst (current QA)
```

### Required variables

Validate with `npm run env:check`. 42 variables total; 26 are required (URLs, admin/user credentials, base payment cards, Figma + Postman keys). Optional variables (BrowserStack, 3DS cards, lockout accounts, EUR/multi-org users) fail fast at runtime only for suites that need them.

Create `.env.local` for secrets:

```env
# ===== Claude / AI =====
ANTHROPIC_API_KEY=sk-ant-your-key-here

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

# ===== Per-env password variants (optional) =====
# Any KEY_${TEST_ENV.toUpperCase()} gets promoted to KEY at runtime.
# Example: lets one .env.local serve all three environments.
USER_PASSWORD_VCPTCORE=different_password_for_vcptcore
USER_PASSWORD_VIRTOSTART=different_password_for_virtostart

# ===== External APIs =====
GIT_TOKEN=ghp_your_github_personal_access_token
FIGMA_API_KEY=your_figma_api_key
POSTMAN_API_KEY=your_postman_api_key
BROWSERSTACK_USERNAME=your_browserstack_username   # optional
BROWSERSTACK_ACCESS_KEY=your_browserstack_access_key  # optional
```

Per-env URLs, store IDs, and sandbox payment cards live in committed files (`.env.defaults`, `.env.vcst`, `.env.vcptcore`, `.env.virtostart`) — no setup needed for those.

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
3. Set your Anthropic API key when prompted (or via `ANTHROPIC_API_KEY` in `.env.local`)
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

Browser config files in `config/` are tracked in git (viewport 1920x1080, locale `en-US`, HAR capture enabled, video on failure, isolated contexts).

### Additional MCP Servers (user-level, optional)

These are configured in your IDE settings, not in the project `.mcp.json`:

| Server | Purpose |
|--------|---------|
| **Chrome DevTools MCP** | Console logs, network requests, performance tracing, HAR export |
| **Azure MCP** | Application Insights, resource health, monitoring |
| **Atlassian MCP** | JIRA integration — ticket management, bug reporting (requires Atlassian API token) |
| **Figma MCP** | Visual comparison against design specs |
| **GitHub MCP** | PR review, code search, issue management (uses `GIT_TOKEN` from `.env.local`) |
| **Context7** | Up-to-date library documentation lookup |

---

## Step 5: Verify Your Setup

```bash
node --version          # Should be 18+
npm run env:check       # Reports SET/EMPTY for all variables — fails if required ones missing
```

Then open Claude Code in your IDE and type:

```
Navigate to the storefront URL and take a screenshot
```

If a browser opens and navigates to the site — you're all set.

### Setup Checklist

- [ ] `npm install` completed
- [ ] `.env.local` created with secrets, `npm run env:check` passes
- [ ] `.mcp.json` created for your OS (Windows: `cmd /c npx`, macOS/Linux: `npx`)
- [ ] Playwright browsers installed (`npx playwright install chromium firefox`)
- [ ] IDE installed with Claude Code extension
- [ ] First test run: browser opens, navigates, takes screenshot

---

## Troubleshooting

### "Missing required environment variables"

Run `npm run env:check`. Verify `.env.local` exists with secrets; per-env URLs come from the committed `.env.${TEST_ENV}` file. Check `TEST_ENV` is set correctly (default `vcst`).

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

### `Browser "chromium" is not installed` from playwright-chrome MCP

Revision mismatch between Playwright versions. Run `cli.js install` from inside the MCP's bundled `playwright-core` (no Claude Code restart needed).

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

### Four Testing Modes

#### 1. Interactive MCP-Driven Testing (Primary)

The everyday workflow — you tell Claude Code what to test in natural language:

```
/qa-smoke storefront
/qa-test VCST-1234
Use the qa-frontend-expert to verify the checkout flow
```

Claude Code opens a real browser via Playwright MCP, navigates the site, performs actions, captures HAR files / screenshots / console logs, and generates reports.

#### 2. CI Regression via Claude Agent SDK

`ci/run-regression.ts` runs headless regression in Docker. It reads CSV suites from `regression/suites/`, runs up to 3 in parallel (configurable via `MAX_PARALLEL`), and produces consolidated reports in `reports/regression/ci-YYYY-MM-DD/`.

> **Note:** The `ci/` directory is gitignored. It's available in the CI environment and for team members with CI access. Contact your team lead if you need local CI setup.

#### 3. Autonomous Interactive Regression (Agent Teams)

`autonomous-regression-orchestrator` creates a team of child agents using the Agent Teams API. Each child gets an isolated browser, fresh auth, and exponential backoff (30s→60s→120s). The orchestrator manages a 3+1 token bucket (3 browser + 1 reporting), tracks failures with retry + browser fallback chain, and produces a consolidated report with quality gate + optional JIRA tickets.

Invoke: `/qa-regression critical --autonomous`. Results land in `results/{RUN_ID}/`.

#### 4. Full Test Cycle CI Pipeline

`ci/run-full-cycle.ts` chains three phases: **sync** stale test cases (PR / module / diff driven) → **review** (7-dimension quality analysis) → **regression** (affected suites). Each phase has independent skip flags. Triggered on PR merge, daily schedule, or manual dispatch.

Invoke: `CHANGE_SOURCE="PR #123" npm run ci:cycle`.

### Prompt Templates

Located in `docs/prompts/`:

| Template | Purpose |
|----------|---------|
| `How to test Builder.io.md` | Builder.io, Virto Pages & vc-frontend testing |
| `story-testing.md` | Story-level testing prompt |

---

## Commands, Skills & Agents

### Slash Commands (16)

Type `/command-name` in Claude Code chat. See [`.claude/rules/skills-commands.md`](.claude/rules/skills-commands.md) for full argument reference.

| Command | Purpose |
|---------|---------|
| `/qa-smoke` | Daily smoke test (~15 min, GO/NO-GO verdict) |
| `/qa-test` | Test a JIRA ticket, feature, or PR |
| `/qa-regression` | Run regression suites in parallel (plan-driven `sprint`, or any selection group / IDs) |
| `/qa-status` | Dashboard: run status, JIRA queue, env health, recent bugs |
| `/qa-bug` | Reproduce, document, and file a JIRA bug |
| `/qa-design` | Dual Storybook + Storefront BL-UI audit for components; storefront-only for pages/flows |
| `/qa-exploratory` | Guided exploratory testing session with heuristics |
| `/qa-env-check` | Validate env vars, endpoints, MCP servers, test infra |
| `/qa-coverage-generation` | Orchestrated parallel coverage generation pipeline |
| `/qa-test-lifecycle` | Unified pipeline: sync stale cases + analyze gaps + generate + review + verify (PR, module, diff, suite, domain) |
| `/qa-test-plan` | Build a sprint test plan from JIRA + merged PRs in the sprint window |
| `/qa-sync-tests` | _(deprecated — redirects to `/qa-test-lifecycle`)_ |
| `/qa-verify-fix` | Verify a bug fix with regression checks + JIRA transition |
| `/qa-seed-data` | Generate test data via Postman MCP / tear down AGENT-TEST-* entities |
| `/ba-analyze` | Business analysis with GitHub search + live UI |
| `/ba-stories` | Generate Agile user stories with BDD criteria |

### Skills (20)

Type `/skill-name` in Claude Code chat. Organized in [`.claude/skills/`](.claude/skills/) across 3 categories:

**VC Knowledge (1):** `/vc-docs` — documentation lookup via Context7

**Testing (10):** `/qa-storybook`, `/qa-accessibility`, `/qa-design`, `/qa-plan`, `/qa-checklist`, `/qa-api`, `/qa-coverage-gap`, `/qa-postman`, `/qa-seed-data`, `/qa-review-tests`

**QA Methodology (9):** `/qa-process`, `/qa-investigate`, `/qa-evidence`, `/qa-defect`, `/qa-test-design`, `/qa-test-cases-generator`, `/qa-risk`, `/qa-metrics`, `/qa-sbtm`

### Agents (14)

14 specialized agents in [`.claude/agents/`](.claude/agents/) across two teams (plus a shared `shared-instructions.md` include). Use them by name in chat:

```
"Use the qa-frontend-expert to verify the checkout flow"
"Use the qa-backend-expert to test the Platform API"
"Use the ba-story-writer to create stories for VCST-1234"
```

**QA Team (10):** `qa-lead-orchestrator` (sonnet), `qa-frontend-expert` (opus), `qa-backend-expert` (opus), `qa-testing-expert` (opus), `test-management-specialist` (sonnet), `ui-ux-expert` (sonnet), `regression-orchestrator` (sonnet), `autonomous-regression-orchestrator` (sonnet), `autonomous-test-runner` (sonnet), `test-runner-agent` (sonnet), plus `shared-instructions`

**BA Team (4):** `ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, `ba-doc-writer` (all sonnet)

QA agents use a four-layer prompt architecture — business logic, domain knowledge, skill set, design decisions. 24 shared knowledge files in [`.claude/agents/knowledge/`](.claude/agents/knowledge/) cover API auth, business logic, browser quirks, GraphQL schema, products, sitemap, etc.

Each parallel agent uses its own browser — see [`.claude/rules/agents.md`](.claude/rules/agents.md) for browser assignments. Max 3 concurrent browser agents.

---

## Available npm Commands

```bash
# Setup & validation
npm install                       # Install dependencies
npm run env:check                 # Validate environment variables (active TEST_ENV layer)

# CI regression (Claude Agent SDK)
npm run ci:smoke                  # Smoke selection (suites 042, 078)
npm run ci:critical               # P0 selection (042, 078, 039, 044, 049)
npm run ci:frontend               # All Frontend/* suites
npm run ci:backend                # All Backend/* suites
npm run ci:full                   # Full regression (all suites, $80 budget)
npm run ci:regression             # Run with SUITE_SELECTION env var
npm run ci:notify                 # Teams notification (requires TEAMS_WEBHOOK_URL)

# Full cycle pipeline (sync → review → regression)
npm run ci:cycle                  # Full 3-phase cycle
npm run ci:cycle:pr               # PR-driven (uses $PR_NUMBER)
npm run ci:cycle:sync-only        # Phase 1 only (sync stale cases)
npm run ci:cycle:no-sync          # Skip Phase 1

# Test data seeding (Postman MCP)
npm run seed                      # All profiles
npm run seed:minimal              # Minimal accounts only
npm run seed:catalog              # Catalogs + products + pricing
npm run seed:full                 # Everything
npm run seed:teardown             # Sweep AGENT-TEST-* entities
npm run seed:dry-run              # Catalog dry-run with verbose output

# GraphQL runner + schema management
npm run schema:refresh            # Refresh introspection snapshot
npm run schema:check              # Drift check (CI gate)
npm run graphql:validate          # Run all GraphQL fixtures
npm run graphql:fixtures:validate # Lint fixtures against current schema
npm run graphql:fixtures:update   # Sync fixtures to schema
npm run graphql:lint-labels       # Lint runner case labels
npm run graphql:cleanup-leaked    # Sweep leaked test orgs

# Suite manifest + reports
npm run suites:sync               # Regenerate `selections` from `_doc` rules
npm run suites:lint               # Check selections are in sync
npm run scope:validate            # Validate critical-ui-scope coverage
npm run report:regression         # Generate HTML regression report
npm run report:graphql            # Generate HTML GraphQL report
npm run refresh-product-guids     # Refresh product GUID fixtures
```

---

## Repository Structure

```
vc-mcp-testing-module/
├── CLAUDE.md                # Claude Code project instructions
├── .claude/
│   ├── agents/              # 14 agent definitions (qa/ + ba/) + knowledge/ (24 reference files)
│   ├── skills/              # 20 skills across 3 categories
│   ├── commands/            # 16 slash commands
│   └── rules/               # Reference docs (agents, regression, skills-commands, mcp-browsers, test-data)
├── config/                  # Playwright browser configs + test-suites.json manifest
├── ci/                      # CI regression + full-cycle pipeline (gitignored)
├── docs/prompts/            # LLM prompt templates
├── regression/suites/       # 99 CSV suites (~3,756 test cases)
│   ├── Frontend/            # 46 CSVs in 15 module dirs (auth, catalog, cart, …)
│   ├── Backend/             # 52 CSVs in 27 module dirs (platform, api, graphql, …)
│   └── _release/            # Master release suite (080)
├── tests/                   # Test cases by sprint/JIRA ticket
├── test-data/               # Aliases registry + CSV fixtures (orgs, addresses, accounts)
├── reports/                 # Bug reports + regression reports
├── scripts/                 # Resolvers, GraphQL runner, sync/lint utilities, seeders
├── config.js                # Layered env loader (TEST_ENV-keyed)
└── get_variables_env.js     # Environment validation script
```

**Tracked in git:** `.claude/`, `config/`, `regression/`, `tests/`, `docs/`, `scripts/`, `test-data/`, `CLAUDE.md`, `.env.defaults`, `.env.${TEST_ENV}`

**Gitignored:** `.env`, `.env.local`, `.env.backup`, `.mcp.json`, `settings.json`, `results/`, `ci/`, `.github/`, `.claude/settings.local.json`

---

## Regression Test Suites

99 suites with **~3,756 test cases** in enriched agent-native CSV format. Authoritative definitions in [`config/test-suites.json`](config/test-suites.json) (`_meta.totalSuites: 99`).

Suites are organized under `Frontend/<module>/` and `Backend/<module>/` directories, with IDs like `001-catalog-navigation.csv`, `050a-graphql-xcatalog.csv`, `080-full-regression-release.csv`.

### Selection Groups

| Selection | Description | Use Case |
|-----------|-------------|----------|
| `smoke` | 042, 078 | Daily validation before deployment |
| `critical` | 042, 078, 039, 044, 049 | P0 suites only |
| `release` | 080 | Master release suite (100 cases) for major releases |
| `purchase-flow` | Cart + checkout + orders + payment | Purchase flow regression |
| `catalog` / `search` / `orders` / `auth` / `b2c` / `marketing` / `platform` | Module-aligned | Focused module runs |
| `bopis` / `payment` / `configurable-products` / `whitelabeling` | Feature-aligned | Focused feature runs |
| `layout-stability` | 048b | Critical-UI-scope regression (7 components × 8 pages matrix) |
| `frontend` | All Frontend/ suites | Frontend-only regression |
| `backend` | All Backend/ suites | Backend-only regression |
| `sprint` | Plan-driven via `vc/shared/docs/Sprint plans/sprint-*-summary.json` (`--no-plan` falls back to P0+P1) | Before sprint release |
| `sprint:XX-YY` | Pinned to a specific sprint plan | Re-run a past sprint's scope |
| `full` | All 99 suites | Before production release |

### P0 Critical Suites

| Suite | Domain |
|-------|--------|
| 042 — Smoke Tests | Core flows end-to-end |
| 078 — Smoke companion | Companion to suite 042 |
| 039 — Payment (CyberSource) | Embedded payment form, 3DS |
| 044 — Security Tests | PCI compliance, input validation, XSS, CSRF |
| 049 — Platform REST API | REST API health |

### CSV Column Format

```
ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions,
Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup,
References, Automation_Status
```

Authoring guides:
- Browser-mode CSV tags: [`.claude/agents/knowledge/test-runner-tags.md`](.claude/agents/knowledge/test-runner-tags.md)
- Runner-native GraphQL: [`.claude/agents/knowledge/graphql-test-cases-runner.md`](.claude/agents/knowledge/graphql-test-cases-runner.md)
- Test data resolver (`@td()` + `{{VAR}}`): [`.claude/rules/test-data.md`](.claude/rules/test-data.md)

### Frontend / Backend module layout

**Frontend (46 CSVs):** `auth/`, `catalog/`, `search/`, `cart/`, `checkout/`, `orders/`, `payment/`, `bopis/`, `b2c/`, `configurable-products/`, `whitelabeling/`, `marketing/`, `loyalty/`, `cross-cutting/`, `smoke/`

**Backend (52 CSVs):** `platform/`, `store/`, `catalog/`, `customer/`, `pricing/`, `inventory/`, `marketing/`, `notifications/`, `cms/`, `orders/`, `api/`, `graphql/`, `search/`, `configurable-products/`, `whitelabeling/`, `assets/`, `channels/`, `contracts/`, `image-tools/`, `import-export/`, `loyalty/`, `push-messages/`, `returns/`, `seo/`, `shipping/`, `xmarketing/`, `smoke/`

Full suite-to-module mapping lives in [`.claude/agents/knowledge/module-suite-map.md`](.claude/agents/knowledge/module-suite-map.md).

---

## CI/CD Pipeline

> **Note:** The `ci/` directory is gitignored. CI infrastructure is available in the GitHub Actions environment. Contact your team lead for local Docker CI setup.

### GitHub Actions

Go to **Actions** > **Regression Tests** > **Run workflow**:

| Parameter | Options | Default |
|-----------|---------|---------|
| Suite selection | `smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`, or comma-separated IDs | `smoke` |
| Environment | `qa`, `staging` | `qa` |
| Max budget (USD) | Any number | `10.0` |

CI environment mapping: `qa` → `FRONT_URL` / `BACK_URL`, `staging` → `VIRTO_START_FRONT` / `VIRTO_START_BACK`. CI mode uses only `playwright-chrome` (single headless Chromium) for all suites.

### Scheduled Runs

- **Daily smoke**: Mon-Fri 6:00 AM UTC — suite 042, $5 budget
- **Weekly full**: Sunday 2:00 AM UTC — all 99 suites, $80 budget
- **Full-cycle pipeline** (`.github/workflows/full-cycle.yml`): triggered on PR merge to main; daily Mon-Fri 8 AM UTC; or manual dispatch

### Cost Estimates

| Selection | Suites | Est. Cost | Est. Time |
|-----------|--------|-----------|-----------|
| `smoke` | 2 | ~$2-5 | ~30 min |
| `critical` | 5 | ~$10-15 | ~2 hrs |
| `sprint` | varies (plan-driven) | ~$40-60 | ~5-8 hrs |
| `full` | 99 | ~$60-100 | ~10-14 hrs |

### Required GitHub Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `FRONT_URL` / `BACK_URL` | Yes | QA environment URLs |
| `ADMIN` / `ADMIN_PASSWORD` | Yes | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Yes | Test user credentials |
| `USER2_EMAIL` / `USER2_PASSWORD` | Yes | Second test user |
| `USER_VIRTO` / `USER_VIRTO_PASSWORD` | Yes | Virtostart user |
| `STORE_ID` | Yes | Store identifier |
| `STORYBOOK_URL` / `STORYBOOK_DEV_URL` | Yes | Storybook URLs |
| `VIRTO_START_FRONT` / `VIRTO_START_BACK` | For staging runs | Virtostart URLs |
| `SKYFLOW_*`, `CYBERSOURCE_*`, `AUTHORIZNET_*`, `DATATRANCE_*` | For payment suites | Payment test cards |
| `POSTMAN_API_KEY` / `FIGMA_API_KEY` | Yes | API integrations |
| `GIT_TOKEN` | Yes | GitHub PAT for GitHub MCP |
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
| Edge | Chromium (msedge channel) | `playwright-edge` | High |
| Firefox | Gecko | `playwright-firefox` | High |

> WebKit/Safari is NOT supported on Windows. For Safari testing, use BrowserStack.

Mobile testing via BrowserStack (`BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY`).

Theme: **Coffee** (only Coffee passes WCAG A11y tests). Communication: **Microsoft Teams**.

---

## Resources

- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [Virto Commerce Documentation](https://docs.virtocommerce.org/)
- [Storefront User Guide](https://docs.virtocommerce.org/storefront/user-guide/2.0/)
- [Project Issues](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues)
- Detailed internal reference: [`.claude/rules/`](.claude/rules/) (agents, regression, skills-commands, mcp-browsers, test-data)
