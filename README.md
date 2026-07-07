# vc-mcp-testing-module

Agentic QA system for the **Virto Commerce B2B e-commerce platform**.

> **Not a traditional `.spec.js` test suite.** Tests run as natural-language prompts through MCP servers — LLM-powered browser automation with AI agents that navigate, test, and report.

## Quick Start

**Install as a Claude Code plugin** (in Claude Code):

```
/plugin marketplace add VirtoCommerce/vc-mcp-testing-module
/plugin install vc-qa@vc-tools
```

Then, in the plugin install directory (Claude Code shows the path), configure your env:

```bash
npm install
npx playwright install chromium firefox   # Edge uses the system msedge channel
npm run plugin:configure                   # scaffolds .env.<env> + .env.local, then env:check
# Create .mcp.json (see below) → restart IDE → type: /qa-smoke storefront
```

> Prefer a manual clone? `git clone … && cd vc-mcp-testing-module && npm install`, then hand-create `.env.local` + `.mcp.json`. For a new customer/deployment run `/project-init` instead of `plugin:configure` — it also writes the `project-profile.json` that `/qa-fix` routing needs.

Default `TEST_ENV` is `vcst`. Switch with `TEST_ENV=vcptcore npm run env:check` or `TEST_ENV=virtostart …`.

> **New deployment or new customer?** Run **`/project-init`** in Claude Code instead of hand-writing the files below. It asks only what shapes config (env name, bug tracker — Jira or Azure Boards, code host — GitHub or Azure Repos, auth per axis) and **derives** the rest (native-platform vs client project, client org, fork account) from your token + a live repo scan, then writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access. That profile is what routes each `/qa-fix` to the right repo (client custom code vs native VirtoCommerce platform) and the right tracker.

## Prerequisites

- **Node.js 18+**, **Git**, and an IDE with Claude Code (VS Code + [extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code), Cursor, or Windsurf).
- From your team lead: **Anthropic API key**, **QA env credentials** (URLs + admin/test users), **GitHub PAT**, **JIRA** access, **Postman key**, **payment test cards**. Figma key + BrowserStack are optional.

## Setup

### 1. Environment variables (layered loader, keyed by `TEST_ENV`)

Files load in order; later overrides earlier:

| File | Tracked | Purpose |
|------|---------|---------|
| `.env.defaults` | git | Cross-env constants (sandbox cards, Builder.io) |
| `.env.${TEST_ENV}` | git | Per-env URLs/IDs (`.env.vcst`, `.env.vcptcore`, `.env.virtostart`) — no secrets |
| `.env.local` | **gitignored** | Secrets — create this locally (passwords, API tokens) |

Validate with `npm run env:check` (42 vars; 26 required). Variable *names* are stable across envs — only values differ. Access in code via `import { env } from './config.js'` (ES modules — always `.js`).

Minimum `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
ADMIN=...                 ADMIN_PASSWORD=...
USER_EMAIL=...            USER_PASSWORD=...
USER2_EMAIL=...           USER2_PASSWORD=...
USER_VIRTO=...            USER_VIRTO_PASSWORD=...
GIT_TOKEN=ghp_...         POSTMAN_API_KEY=...        FIGMA_API_KEY=...
GITHUB_FIX_BUGS_TOKEN=ghp_...   # write-capable PAT for /qa-fix (push + PR). GIT_TOKEN is read-only and 403s on push to the VC org.
```

App Insights monitoring vars (`APPINSIGHTS_APP_ID_*`, `APPINSIGHTS_RESOURCE_*`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`) are committed in `.env.${TEST_ENV}` — no secrets needed.

### 2. `.mcp.json` (gitignored — create in project root)

```json
{
  "mcpServers": {
    "playwright-chrome":  { "type": "stdio", "command": "cmd", "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"] },
    "playwright-firefox": { "type": "stdio", "command": "cmd", "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-firefox.config.json"] },
    "playwright-edge":    { "type": "stdio", "command": "cmd", "args": ["/c", "npx", "@playwright/mcp@latest", "--config", "config/mcp-playwright-edge.config.json"] },
    "postman":            { "type": "stdio", "command": "cmd", "args": ["/c", "npx", "@postman/postman-mcp-server@latest", "--minimal"], "env": { "POSTMAN_API_KEY": "%POSTMAN_API_KEY%" } }
  }
}
```

> **macOS/Linux:** drop `"command": "cmd"` and the `"/c"` arg — use `"command": "npx"` with the remaining args, and `$POSTMAN_API_KEY`.
> **WebKit is not supported on Windows** — use Chromium, Firefox, or Edge. **Restart the IDE after any `.mcp.json` change.**

Optional user/IDE-level MCP servers (not in `.mcp.json`): Chrome DevTools, **Azure** (App Insights for `/qa-monitoring` — authenticate with `az login` / AAD), Atlassian (JIRA), Figma, GitHub, Context7, VirtoOZ.

### 3. Verify

```bash
npm run env:check       # SET/EMPTY report — fails if required vars missing
```

Then in Claude Code: `Navigate to the storefront URL and take a screenshot`. If a browser opens and navigates — you're set.

**Common issues:** restart the IDE after `.mcp.json` edits · close all Chrome windows before `playwright-chrome` (user-data-dir conflict) · `Browser "chromium" is not installed` → run `cli.js install` inside the MCP's bundled `playwright-core`.

## How Testing Works

Five pipelines, each with an interactive + headless-CI twin:

1. **Interactive MCP-driven** (primary) — tell Claude Code what to test: `/qa-smoke storefront`, `/qa-test VCST-1234`, `Use qa-frontend-expert to verify checkout`. Real browser via Playwright MCP → HAR/screenshots/console → reports.
2. **CI regression** — `ci/run-regression.ts` runs CSV suites headless in Docker (`npm run ci:*`).
3. **Autonomous regression** (Agent Teams) — `/qa-regression critical --autonomous`; isolated browsers + retry/backoff.
4. **Full-cycle** — `ci/run-full-cycle.ts`: sync stale cases → review → regression (`npm run ci:cycle`).
5. **Monitoring** (`/qa-monitoring`) + **auto-fix** (`/qa-fix`) — App Insights triage / bug-fix-to-PR (gate ladder G0–G7, never auto-merges).

> `ci/` ships with the plugin (it's tracked) and also runs in GitHub Actions. Only transient sub-paths (`.fix-workspace/`, the module-registry cache, heavy run artifacts) are gitignored.

## Commands, Skills & Agents

Full reference: [`.claude/rules/skills-commands.md`](.claude/rules/skills-commands.md).

- **23 slash commands** — `/project-init`, `/qa-smoke`, `/qa-test`, `/qa-regression`, `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-hotfix`, `/qa-bundle-check`, `/qa-monitoring`, `/qa-design`, `/qa-exploratory`, `/qa-test-lifecycle`, `/qa-test-plan`, `/qa-seed-data`, `/qa-onboarding`, `/ba-analyze`, `/ba-stories`, …
- **30 skills** in [`.claude/skills/`](.claude/skills/) (VC knowledge, testing, QA methodology, development) + 2 root-level (`project-init`, `run-vc-mcp-testing-module`).
- **18 agents** in [`.claude/agents/`](.claude/agents/) across three teams (QA 10, BA 4, Developers 4). Each parallel agent uses its own browser — see [`.claude/rules/agents.md`](.claude/rules/agents.md). Max 3 concurrent browser agents.

Use an agent by name: `Use the qa-backend-expert to test the Platform API`.

## Key npm Commands

```bash
npm run env:check          # Validate env vars (active TEST_ENV)
npm run ci:smoke           # CI smoke (042, 078)   ·  ci:critical / ci:frontend / ci:backend / ci:full
npm run ci:cycle           # Full pipeline: sync → review → regression
npm run seed[:minimal|:catalog|:full|:teardown]   # Test-data seeding (Postman MCP)
npm run graphql:validate   # Run GraphQL fixtures  ·  schema:check (drift gate)
npm run suites:lint        # Manifest selections in sync  ·  scope:validate (critical-UI scope)
```

Full list: `package.json`.

## Repository Structure

```
vc-mcp-testing-module/
├── CLAUDE.md             # Claude Code project instructions
├── .claude/
│   ├── agents/           # 18 agents (qa/ ba/ developers/) + knowledge/ (28 reference files)
│   ├── skills/           # 30 skills (4 categories) + 2 root-level
│   ├── commands/         # 23 slash commands
│   └── rules/            # Reference docs (agents, regression, skills-commands, mcp-browsers, test-data, quality-gates, reports)
├── config/               # Playwright browser configs + test-suites.json manifest
├── ci/                   # CI / full-cycle / auto-fix / monitoring pipelines (gitignored)
├── vc/                   # VC internal per-env data (+ shared/docs/prompts/ templates) — customers ignore
├── regression/suites/    # CSV suites under Frontend/ + Backend/ (manifest is authoritative)
├── tests/                # Test cases by sprint/JIRA ticket
├── test-data/            # Alias registry + CSV fixtures
├── reports/              # Bug + regression reports
├── scripts/              # Resolvers, GraphQL runner, sync/lint utilities, seeders
└── config.js             # Layered env loader (TEST_ENV-keyed)
```

**Gitignored:** `.env`, `.env.local`, `.mcp.json`, `settings.json`, `results/`, `.newman-run/`, `.fix-workspace/`, `project-profile.json`, `.claude/settings.local.json`. (`ci/` and `.github/` are tracked and ship.)

## Regression Suites

CSV suites in enriched agent-native format, organized under `Frontend/<module>/` and `Backend/<module>/`. **Authoritative definitions + selection groups live in [`config/test-suites.json`](config/test-suites.json)** (groups: `smoke`, `critical`, `release`, `frontend`, `backend`, `sprint`, `full`, plus module/feature-aligned groups like `catalog`, `b2b`, `payment`).

P0 suites: 042 (Smoke), 078 (Smoke companion), 039 (CyberSource payment), 044 (Security), 049 (Platform REST API).

Authoring guides: browser-mode tags ([`test-runner-tags.md`](.claude/agents/knowledge/execution/test-runner-tags.md)) · GraphQL ([`graphql-test-cases-runner.md`](.claude/agents/knowledge/api/graphql-test-cases-runner.md)) · test data ([`.claude/rules/test-data.md`](.claude/rules/test-data.md)).

## Notes

- **Payment flow:** CyberSource, Skyflow, and Authorize.Net render the card form directly on the cart page (`allowCartPayment=true`). Datatrans is the only redirect processor — "Place Order" → `/checkout/payment`.
- **Browsers:** Chrome (`playwright-chrome`, primary), Edge (`playwright-edge`), Firefox (`playwright-firefox`). Safari/WebKit not on Windows — use BrowserStack. Theme: **Coffee** (only Coffee passes a11y). Comms: **Microsoft Teams**.

## Resources

- [Playwright MCP](https://github.com/microsoft/playwright-mcp) · [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) · [Virto Commerce Docs](https://docs.virtocommerce.org/)
- Internal reference: [`.claude/rules/`](.claude/rules/) and [`CLAUDE.md`](CLAUDE.md)
