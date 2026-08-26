# Virto Commerce Agentic QA — Onboarding

> **Audience:** Anyone with a Virto Commerce deployment (storefront + Admin SPA) who wants to use VC's QA agent crew + authoring framework against their own environment.

> **This repo is no longer a single plugin.** As of v0.7.0 it ships **two** things — pick the one you need:
>
> | | **`vc-fix` plugin** | **Full `vc-qa` toolset** |
> |---|---|---|
> | What | The bug-lifecycle slice: setup, bug filing, autofix, verification, monitoring, self-diagnostics (10 agents / 16 skills / 8 commands). | The whole crew: regression, BA analysis, ~121 reference suites, test-data + authoring framework (17 agents / 40 skills / 31 commands). |
> | How you get it | `/plugin install vc-fix@vc-tools` from the marketplace. | **Clone this repo** — `.claude/` components auto-load in the checkout. **Not** marketplace-installable. |
> | This guide | **Install & Verify** below. | Everything **after Verify** (regression selections, module subsetting, suite authoring). |
>
> The old model — installing the whole repo as one `vc-qa` plugin — was retired in v0.7.0, along with its `manifest.json` + `bootstrap/install.ts` installer. Onboarding is now `/project-init`.

> **Time:** 5–15 minutes per environment for setup. Days-to-weeks for customer-specific suite authoring (your customizations need your tests).
>
> **What you build over time:** suites for your custom features, in the same Enriched CSV format as the shipped reference suites.

## What you get (and what you write)

Whichever path you pick, this is **a methodology + agents + framework + reference suite library** — not a complete test suite for your specific storefront. See [`docs/marketing-onepager.md`](marketing-onepager.md) for the full framing.

| Layer | Out of the box | Your job |
|-------|---------------|---------|
| Methodology (ISTQB, evidence policy, defect workflow, report templates) | ✅ Use as-is | — |
| Agent crew + capability infrastructure (orchestrator, env loader, `@td()`, MCP browser pool) | ✅ Use as-is | — |
| Reference suites for **universal VC platform behavior** (auth, cart, checkout shape, payment integration patterns, GraphQL xAPI, Admin SPA module surfaces) | ✅ ~60-70% of the 110 suites run as-is once you fill in your `@td()` data | Configure `MODULES_ENABLED`, `STOREFRONT_PROFILE`, `PAYMENT_PROCESSORS_ENABLED` so non-applicable suites skip |
| Reference suites that are **vcst-qa-specific** (some BL invariants assume vcst-qa data shape, some UI assertions match VC's default Coffee theme) | ⚠️ Will fail or need adaptation on your deployment | Clone-and-adapt the closest reference, or skip via suite-list selection |
| Suites for **your custom features** (custom modules, custom checkout customizations, branded theme assertions, business-specific invariants) | ❌ Plugin does NOT ship these | **You write them** under `regression/suites/customer/` — see [`docs/test-authoring.md`](test-authoring.md) |

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
| Serena plugin + `uv`/`uvx` | Shared semantic code-navigation for the whole team (enabled in tracked config; install per machine). | `uvx --version`; see [Serena setup](#serena--semantic-code-navigation-whole-team-one-time-per-machine). |

## Install

The plugin distributes as a Claude Code marketplace plugin (per [Claude Code plugin docs](https://code.claude.com/docs/en/plugin-marketplaces)). Two steps:

> **Note:** the `vc-tools` marketplace currently lists only `vc-fix` (the bug-lifecycle subset — setup,
> bug filing, autofix, verification, monitoring, self-diagnostics; see `plugins/vc-fix/`). The Install
> and Verify steps below are the `vc-fix` plugin onboarding. `vc-qa` — the full agent crew this guide
> otherwise describes (regression, BA analysis, 110 suites) — is **not** marketplace-installable; its
> content lives in this repo and is used from a direct clone, not `/plugin install`. Sections past
> Verify (regression selections, suite authoring, etc.) assume that full `vc-qa` checkout.

**Step A — install the plugin via Claude Code:**

```
/plugin marketplace add VirtoCommerce/vc-mcp-testing-module
/plugin install vc-fix@vc-tools
```

(Other accepted source formats: `https://github.com/VirtoCommerce/vc-mcp-testing-module`, `git@github.com:VirtoCommerce/vc-mcp-testing-module.git`, or `./path/to/local/checkout`. The `github://` URI scheme is NOT supported.)

Claude Code clones the plugin into its cache and auto-discovers the agents (`agents/`), skills (`skills/`), commands (`commands/`), knowledge files (`knowledge/`), and MCP server config.

**Step B — install dependencies:**

```bash
# In the plugin install directory (Claude Code shows you the path after install).
npm install
```

**Step C — onboard with `/project-init` (recommended):**

Run `/project-init` in Claude Code. It's a **derive-driven** wizard — it asks only what genuinely shapes config:

- the environment **name** (e.g. `qa`, `staging`, `client_eu`),
- the bug **tracker** — Jira or Azure Boards,
- the code **host** — GitHub or Azure Repos,
- an **auth** preference per axis (a PAT is recommended; otherwise browser / CLI login — never passwords).

Everything else — native-platform vs CLIENT project, your org, contribution mode, fork account — is **derived** from the token plus a live module/repo scan. It writes:

- `project-profile.json` — the deployment profile that makes `/qa-fix` route each bug to the right repo (your custom code vs the native platform) and file to the right tracker,
- `.env.<env>` — per-env config (committable in your own repo, no secrets),
- `.env.local` — your secrets (gitignored),
- `.mcp.json` — MCP server config,

then prints a **readiness table** confirming access. Re-run `/project-init` for each additional environment, and `/project-init --check` after a plugin upgrade to migrate a stale profile to the current schema (no full re-onboarding).

> **Self-diagnostics is opt-in.** `/project-init` writes `"selfDiagnostics": true` into `project-profile.json` by default, which enables the passive session-telemetry collector behind `/vc-self-check` (diagnose the plugin's own runs) and `/vc-feedback` (attach a 👍/👎 verdict on a session). It's local-only and never sends anything without the explicit, consent-gated `/vc-self-check deliver` step; set it to `false` (or remove it) to make the collector a full no-op.

## Verify

```bash
# Validate current install without prompting.
npm run env:check

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
| Repo defaults | `.env.defaults` | ✅ Yes (in this repo) | Sandbox payment cards, Builder.io public URL. Same for every customer. Don't edit. |
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

`npm run env:check` will warn if a required MCP server is missing.

## Serena — semantic code navigation (whole-team, one-time per machine)

Serena is an LSP-backed code-navigation + editing MCP server (symbol search, find-references, precise
symbol edits). The developer agents (`fullstack-backend` / `fullstack-frontend`) use it to find and
apply fixes faster than the `Grep → Read → Edit` loop, and it's just as useful when *you* are reading
this repo's TypeScript/JS tooling (`scripts/`, `ci/`, `config.js`). **Every teammate should have it.**

`.claude/settings.json` (git-tracked) already ships `enabledPlugins."serena@claude-plugins-official": true`,
and `.serena/project.yml` (git-tracked) ships the shared project config — so once you install the
plugin, it's on and pre-configured with no extra steps. **Installing is per-machine**, though; the
enabled flag is a no-op until you do it once:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install serena@claude-plugins-official
```

Then **restart Claude Code** (plugin MCP tools bind at session start). Verify with `claude mcp list`
— you should see `plugin:serena:serena … ✔ Connected` — and the `mcp__plugin_serena_serena__*` tools
become available in-session. Requires [`uv`/`uvx`](https://docs.astral.sh/uv/) on PATH (Serena runs via
`uvx`); the first activation builds a local symbol cache under `.serena/cache/` (gitignored). Per-developer
tweaks go in `.serena/project.local.yml` (gitignored), never in the shared `project.yml`.

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

**`Missing required environment variables: FRONT_URL, …`** → run `/project-init`. If you ran it but vars are still missing, check that `.env.local` has the per-env-suffixed entries (e.g. `USER_PASSWORD_QA`, not just `USER_PASSWORD`).

**`Browser "chromium" is not installed`** → run `cli.js install` inside the MCP's bundled playwright-core. See memory `feedback_playwright_mcp_browser_version` in the plugin's MEMORY.md.

**Suites skipped for "requires modules not in MODULES_ENABLED"** → expected if you don't have that module. To run them anyway, add the module to your `MODULES_ENABLED` list — but the suite will fail if the module isn't actually installed.

**Suite refuses to run on `ENV_RISK=production`** → that suite mutates data. Either run on a lower-risk env or pass `--allow-admin-writes-on-prod` (only if you really mean it).

**`/qa-bug` files into the wrong JIRA project** → set `JIRA_PROJECT_KEY` in your `.env.{env-name}`. Defaults to `VCST` for backwards compatibility.

## Next Steps

After your first green `/qa-smoke`:

**Day 1:**
- Try a focused regression: `/qa-regression critical`
- Run a design audit: `/qa-design <your storefront page>`
- Explore the agent set: `knowledge/agents/README.md`
- Read the methodology: `skills/qa-process/test-process-lifecycle.md`

**Week 1:**
- Identify vcst-specific suites that don't apply to your deployment; add them to your local suite-skip list.
- For each of your custom features, find the closest reference suite in `regression/suites/Frontend/` or `Backend/` and clone it as a starting pattern.

**Week 2+:**
- **Start authoring your own suites** under `regression/suites/customer/`. The Enriched CSV format, `@td()` resolver, and BL invariant convention are all reusable. See [`docs/test-authoring.md`](test-authoring.md) for the full guide.
- Generate API test cases for your custom modules: `/qa-api cases <your module>`
- Build out your own `aliases.json` entries for your domain entities (custom product types, custom user roles, custom org structures).

**The expected steady state:** you maintain ~10-50 customer-authored suites covering your custom features, while the repo's shipped reference suites cover the universal VC platform behavior. Both run under the same orchestrator with the same agents.

## Where to find help

- Plugin docs: `docs/`
- Tier classification + governance: `.claude/architecture/TIER.md`
- Versioning + stability promise: `docs/versioning.md`
- Strategic plan (internal): `~/.claude/plans/functional-singing-cosmos.md`
- Issues + feature requests: GitHub Issues on this repo
