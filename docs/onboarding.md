# VC QA Plugin — Customer Onboarding

> **Audience:** Anyone with a Virto Commerce deployment (storefront + Admin SPA) who wants to run VC's internal QA agents against their own environment.
>
> **Time:** 5–15 minutes per environment.
>
> **Outcome:** A green `/qa-smoke` run covering both your storefront and Admin SPA, with bugs filed in your JIRA project in the standard format.

## Prerequisites

You need each of these before you start. If any are missing, the install will fail loudly with a specific error.

| Requirement | Why | How to check |
|------------|-----|--------------|
| Claude Code CLI (≥ 1.0) | The plugin's agents/skills/commands are loaded by Claude Code. | `claude --version` |
| Node.js ≥ 18 | The plugin's scripts and orchestrators are Node/TypeScript. | `node --version` |
| `playwright-chrome`, `playwright-firefox`, `playwright-edge` MCP servers | Browser automation for storefront + cross-browser. | See [Required MCP servers](#required-mcp-servers) below. |
| A VC storefront URL (`FRONT_URL`) | Where the storefront tests will run. | Browse to it in your browser; should load. |
| A VC Admin SPA / platform URL (`BACK_URL`) | Where the admin + API tests will run. | Browse to `${BACK_URL}/health` — should return JSON with module status. |
| Two test accounts | One non-admin storefront user, one admin SPA user. | See [Test accounts](#test-accounts) below. |
| Your customer's JIRA project key (e.g. `ACME`) | For bug filing. Default falls back to `VCST` if not set. | Atlassian → Projects → your project → Settings → Details. |

## Install

```bash
# 1. Clone (or fetch if already cloned via Claude Code plugin manager).
git clone https://github.com/VirtoCommerce/vc-mcp-testing-module.git vc-qa
cd vc-qa

# 2. Install JS dependencies.
npm install

# 3. Run the interactive installer.
npm run plugin:install
```

The installer walks you through 5 steps. At the end you'll have:
- `.env.{env-name}` — per-env config (committable, no secrets)
- `.env.local` — your secrets (gitignored)
- `test-data/aliases.{env-name}.json` — per-env entity overrides (stub)
- A green `npm run env:check` run

Re-run for additional environments:
```bash
npm run plugin:install -- --env=staging
npm run plugin:install -- --env=prod
```

## Verify

```bash
# Validate current install without prompting.
npm run plugin:check

# Run a smoke test against your default env.
/qa-env-check
/qa-smoke
```

Switch env on the fly:
```bash
TEST_ENV=staging /qa-smoke
TEST_ENV=prod /qa-smoke   # production-risk envs auto-skip admin-write suites
```

## Per-Environment Setup

Every customer has multiple environments. The plugin treats env names as arbitrary strings (`dev`, `qa`, `staging`, `prod`, `customer_eu`, `feature_branch_X`, anything matching `[a-z0-9_]+`). Safety is gated by `ENV_RISK`, not by env name.

| `ENV_RISK` | Allowed | Default for |
|------------|---------|-------------|
| `dev` | Everything, no friction. | Local dev, scratchpad. |
| `test` | Everything. No PII expectations. | Shared QA. |
| `staging` | Everything. Real-like data — be careful. | Pre-prod. |
| `production` | **Read-only by default.** Admin-write suites refuse to run without `--allow-admin-writes-on-prod`. | Live env. |

Set `ENV_RISK` in your `.env.${env-name}` file. The installer prompts you for it.

## Configuration Buckets

The plugin uses three env-file buckets:

| Bucket | Lives in | Committable? | What it holds |
|--------|----------|--------------|---------------|
| Plugin defaults | `.env.defaults` | ✅ Yes (in plugin repo) | Sandbox payment cards, Builder.io public URL. Same for every customer. Don't edit. |
| Customer per-env | `.env.{env-name}` | ✅ Yes (in your fork) | `FRONT_URL`, `BACK_URL`, `STORE_ID`, `ENV_RISK`, `STOREFRONT_PROFILE`, `MODULES_ENABLED`, `JIRA_PROJECT_KEY`. One file per env. |
| Customer secrets | `.env.local` | ❌ No (gitignored) | Passwords, API keys. Per-env via suffix promotion (`USER_PASSWORD_QA`, `USER_PASSWORD_STAGING`, etc.). |

Per-env suffix promotion is the magic that lets you keep all your env credentials in one gitignored file:

```bash
# .env.local
USER_PASSWORD_QA=secret-qa
USER_PASSWORD_STAGING=secret-staging
USER_PASSWORD_PROD=secret-prod

# At runtime:
TEST_ENV=qa /qa-smoke         # USER_PASSWORD → 'secret-qa'
TEST_ENV=staging /qa-smoke    # USER_PASSWORD → 'secret-staging'
TEST_ENV=prod /qa-smoke       # USER_PASSWORD → 'secret-prod'
```

## Module Subsetting

If your customer doesn't have every VC module installed, declare what they do have in `MODULES_ENABLED`:

```bash
# .env.qa
MODULES_ENABLED=catalog,customer,orders,marketing,inventory
```

The orchestrator will automatically skip Backend suites that require modules you don't list. Skipped suites are logged with the reason — they're not failures, they're "N/A for this customer."

Empty `MODULES_ENABLED` (or unset) = no filter, all suites run.

## Storefront Profile

```bash
# .env.qa
STOREFRONT_PROFILE=b2b      # B2B-only customer
STOREFRONT_PROFILE=b2c      # B2C-only customer
STOREFRONT_PROFILE=hybrid   # both (default — runs everything)
```

The orchestrator skips Frontend suites whose `storefrontProfile[]` doesn't include your active profile.

## Test Accounts

The plugin tests with two account types per env:

1. **Storefront test user (`USER_EMAIL` / `USER_PASSWORD`)** — non-admin. Can browse the storefront, add to cart, check out. For B2B suites, this user should belong to at least one org.
2. **Admin SPA user (`ADMIN` / `ADMIN_PASSWORD`)** — has back-office access. The customer's `aliases.json` should set `ADMIN_ROLE_TESTER.name` to the role this user has (so the BL-RBAC tests assert against the correct role).

For B2B suites that require a user with **2+ orgs**, set `MULTI_ORG_USER_EMAIL` / `MULTI_ORG_USER_PASSWORD`. Leave empty if you don't run B2B suites.

For impersonation tests, additional accounts are required. See `templates/aliases.json.template` for the slots.

## Required MCP Servers

Install these via Claude Code's MCP settings (`.mcp.json` or `claude_code/settings.json`):

```jsonc
{
  "mcpServers": {
    "playwright-chrome":  { "command": "npx", "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"] },
    "playwright-firefox": { "command": "npx", "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-firefox.config.json"] },
    "playwright-edge":    { "command": "npx", "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-edge.config.json"] }
  }
}
```

Optional (each gates specific skills):
- **postman** — enables `/qa-postman`, `/qa-api test`
- **atlassian** — enables `/qa-bug` JIRA filing, `/qa-status`, `/qa-test-plan`
- **context7** + **VirtoOZ MCP** — enables `/vc-docs` (docs lookup)
- **github** — enables `/qa-test PR #N`, `/ba-analyze`
- **figma-remote-mcp** — enables `/qa-design` Figma comparison

`npm run plugin:check` will warn if a required MCP server is missing.

## Atlassian / JIRA setup

`/qa-bug` files tickets into your JIRA project. Set `JIRA_PROJECT_KEY` in your `.env.{env-name}` to your project's key. The atlassian MCP server handles authentication — typically via OAuth on first use.

Bugs from each env are auto-tagged `env:${TEST_ENV}` and `risk:${ENV_RISK}` in JIRA labels so you can filter by env (e.g. "show me only prod bugs").

## Cost Awareness

The plugin uses your Anthropic API tokens. Approximate cost per command (varies by environment + bug density):

| Command | Approximate cost |
|---------|------------------|
| `/qa-status`, `/qa-env-check` | Free (no LLM, just dashboards) |
| `/qa-smoke` | ~$1 |
| `/qa-regression critical` | ~$5 |
| `/qa-regression full` | ~$80 |
| `/qa-regression full --no-admin` | ~$40 |

Default selections are conservative. Don't run `/qa-regression full` against prod unless you mean it.

## Troubleshooting

**`Invalid TEST_ENV="customer-staging-eu"`** → kebab-case env names break the suffix-promotion in `.env.local`. Use underscores: `customer_staging_eu`.

**`Missing required environment variables: FRONT_URL, …`** → run `npm run plugin:install`. If you ran it but vars are still missing, check that `.env.local` has the per-env-suffixed entries (e.g. `USER_PASSWORD_QA`, not just `USER_PASSWORD`).

**`Browser "chromium" is not installed`** → run `cli.js install` inside the MCP's bundled playwright-core. See memory `feedback_playwright_mcp_browser_version` in the plugin's MEMORY.md.

**Suites skipped for "requires modules not in MODULES_ENABLED"** → expected if you don't have that module. To run them anyway, add the module to your `MODULES_ENABLED` list — but the suite will fail if the module isn't actually installed.

**Suite refuses to run on `ENV_RISK=production`** → that suite mutates data. Either run on a lower-risk env or pass `--allow-admin-writes-on-prod` (only if you really mean it).

**`/qa-bug` files into the wrong JIRA project** → set `JIRA_PROJECT_KEY` in your `.env.{env-name}`. Defaults to `VCST` for backwards compatibility.

## Next Steps

After your first green `/qa-smoke`:

- Try a focused regression: `/qa-regression critical`
- Run a design audit: `/qa-design <your storefront page>`
- Generate API test cases: `/qa-api cases <your module>`
- Explore the agent set: `.claude/agents/README.md`
- Read the methodology: `.claude/skills/qa-methodology/qa-process/test-process-lifecycle.md`

## Where to find help

- Plugin docs: `docs/`
- Tier classification + governance: `.claude/architecture/TIER.md`
- Versioning + stability promise: `docs/versioning.md`
- Strategic plan (internal): `~/.claude/plans/functional-singing-cosmos.md`
- Issues + feature requests: GitHub Issues on the plugin repo
