# ai-tools

Agentic QA system for the **Virto Commerce B2B e-commerce platform**.

> **Not a traditional `.spec.js` test suite.** Tests run as natural-language prompts through MCP servers — LLM-powered browser automation with AI agents that navigate, test, and report.

This repo hosts two things:

1. **The `ai-tools` Claude Code marketplace** ([`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)) —
   each plugin versions and tags independently:
   - **[`vc-fix`](plugins/vc-fix/)** — self-contained bug lifecycle: setup, filing, autonomous fixing,
     verification, monitoring, self-diagnostics. **The flagship offering** — see Quick Start below.
   - **`vc-perf`** ([`plugins/vc-perf/`](plugins/vc-perf/)) — the three-layer performance loop (BenchmarkDotNet
     A/B → k6 load → dotnet-trace attribution → perf verdict → optimization PRs). Depends on `vc-fix`;
     advisory only, never a CI gate.
   - **[`vc-secrets`](plugins/vc-secrets/)** — a launcher that starts a declared command (an MCP server or any
     other process) with its secrets resolved per launch from the OS credential store or Azure Key Vault, so no
     client config holds a token. Independent of the others.
2. **The full `vc-qa` agent crew** (regression, BA analysis, the regression suites, the agent crew) — the source
   `vc-fix` was extracted from. It lives project-scoped under `.claude/` (auto-discovered on any
   clone, no plugin manifest) but is **not marketplace-installable**: not listed in the marketplace,
   not currently packaged as a plugin. Kept for direct-clone use and as the
   base for a future full-regression/BA offering — see [Full `vc-qa` Agent Crew](#full-vc-qa-agent-crew--direct-clone-only) below.

## Quick Start — Install `vc-fix`

```
/plugin marketplace add VirtoCommerce/ai-tools
/plugin install vc-fix@ai-tools
```

Then, in the plugin install directory (Claude Code shows the path after install), run:

```
/project-init
```

It interviews you for env name, bug tracker (Jira or Azure Boards), code host (GitHub or Azure
Repos), and auth (never passwords) — then derives the rest (native-platform vs client project,
fork account) from your token + a live repo scan, and writes `project-profile.json` + `.env.<env>`
+ `.env.local` + `.mcp.json`. That profile routes every `/qa-fix` to the right repo and tracker.

Two **day-2 modes** skip the interview:

```
/project-init --add-env   # add another environment (URLs + per-env access keys) to an onboarded project
/project-init --check     # reconcile the profile to the current schema after a plugin upgrade, then verify
```

`--add-env` reuses the project's tracker/host and only adds a new `.env.<name>` + its per-env creds
(a second QA env, staging, a customer's second site); a different tracker or code host is a
different *project*, not an environment. Full modes table: [`plugins/vc-fix/README.md`](plugins/vc-fix/README.md#project-init-modes).

Then try:

```
/qa-bug <description>        # Reproduce, document, optionally file a bug
/qa-fix VCST-1234            # Autonomous fix of an already-filed bug — never auto-merges
/qa-verify-fix VCST-1234     # Verify a fix, transition the ticket
/qa-monitoring both          # Query App Insights, dedup, triage, live-repro, report
```

Full plugin docs: **[`plugins/vc-fix/README.md`](plugins/vc-fix/README.md)** (agent/command/skill
inventory, self-containment rationale, gate ladder reference). The other plugins install the same way
(`/plugin install vc-perf@ai-tools`, `/plugin install vc-secrets@ai-tools`); `vc-secrets` is described
normatively in [`plugins/vc-secrets/README.md`](plugins/vc-secrets/README.md).

---

## Full `vc-qa` Agent Crew — direct clone only

> Everything below this point documents the **full `vc-qa` agent crew** — regression orchestration,
> BA analysis, Storybook/a11y, the CSV suites and the agent crew. It is **not** the `vc-fix` plugin above:
> it is **not marketplace-installable**, and only usable by cloning this repo directly. If you just
> want the bug-lifecycle plugin, stop here and use Quick Start above instead.

### Install (direct clone)

```bash
git clone https://github.com/VirtoCommerce/ai-tools && cd ai-tools
npm install
npx playwright install chromium firefox   # Edge uses the system msedge channel
/project-init                   # scaffolds .env.<env> + .env.local, then env:check
# Create .mcp.json (see below) → restart IDE → type: /qa-env-check (vc-fix plugin)
```

> `/project-init`, `/qa-env-check` and the other bug-lifecycle commands come from the `vc-fix` plugin — install it
> as above even on a direct clone (the team enables it at user level). New here? Start at
> [`.claude/ROUTING.md`](.claude/ROUTING.md); a guided first run is `/qa-onboarding`.

Pick the environment with `TEST_ENV` (default `vcst`) — see [Configuration](#configuration).

> **New deployment or new customer?** Run **`/project-init`** in Claude Code instead of hand-writing the files below. It asks only what shapes config (env name, bug tracker — Jira or Azure Boards, code host — GitHub or Azure Repos, auth per axis) and **derives** the rest (native-platform vs client project, client org, fork account) from your token + a live repo scan, then writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access. That profile is what routes each `/qa-fix` to the right repo (client custom code vs native VirtoCommerce platform) and the right tracker.

### Prerequisites

- **Node.js 18+**, **Git**, and an IDE with Claude Code (VS Code + [extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code), Cursor, or Windsurf).
- From your team lead: **Anthropic API key**, **QA env credentials** (URLs + admin/test users), **GitHub PAT**, **JIRA** access, **Postman key**, **payment test cards**. Figma key + BrowserStack are optional.
- **Serena** (optional, whole-team semantic code-navigation MCP): enabled in the tracked `.claude/settings.json` (a no-op until installed **per machine**). Needs `uv`/`uvx` on PATH. Install: `/plugin marketplace add anthropics/claude-plugins-official` → `/plugin install serena@claude-plugins-official`, then restart Claude Code. Speeds up `/qa-fix` symbol navigation/editing. See `docs/onboarding.md` §Serena.

### Configuration

#### 1. Environment variables (layered loader, keyed by `TEST_ENV`)

Every script works against **one environment**, chosen by name (`TEST_ENV`), and builds its settings from these files. Later rows override earlier ones:

| File | In git | Holds |
|------|--------|-------|
| `.env.defaults` | yes | Constants shared by every env (sandbox cards, Builder.io) |
| `.env.<env>` | yes | That env's URLs, store, `ENV_RISK` and **which accounts the tests use** (`USER_EMAIL`, `ORG_USER_EMAIL`, …). Shared by the whole team. |
| `.env.local` | no | Your API tokens and machine-wide settings. **Applied to every env.** |
| `.env.playwright.<env>` | no | That env's passwords. The scripts read it for the active env; the Playwright MCP servers read it through `--secrets`, directly or merged into `.env.playwright.all`. |
| `.env.playwright.all` | no | Built by `npm run secrets:playwright`: every env's passwords, renamed `KEY_<ENV>`, in one `--secrets` file for all envs. Never edited by hand. |

How the final value is decided:

- **`.env.local` overrides `.env.<env>` for every env.** A `BACK_URL` or `USER_EMAIL` there points every environment at it, so keep env-specific values out of it. Scripts warn about it (`[env] .env.local sets BACK_URL=…, overriding .env.<env>`) only for `BACK_URL`, `FRONT_URL` and `ENV_RISK`; any other key, such as a test account, overrides silently.
- **`KEY_<ENV>` beats `KEY` for that env**, whichever file (or your shell) sets it. Use it in `.env.<env>` to pin a value that nobody's `.env.local` can change, e.g. `BACK_URL_VCPTCORE_DEV=…`. Passwords in `.env.playwright.<env>` beat `.env.local` the same way.
- `.env.<env>` and `.env.local` also override a variable of the same name set in your shell (`.env.defaults` doesn't). To override one from the shell, use the `KEY_<ENV>` form — unless a file pins that same `KEY_<ENV>`, which then wins.

**Choosing the environment.** Env names are `[a-z0-9_]+` (`vcptcore_dev`, not `vcptcore-dev`); a name without a `.env.<env>` file prints a warning. The first of these that is set wins:

1. `TEST_ENV` in your shell. PowerShell: `$env:TEST_ENV='vcptcore_dev'` (stays set in that terminal). Bash: `TEST_ENV=vcptcore_dev npm run env:check`.
2. `.env.test-env` (gitignored, one line: `TEST_ENV=vcptcore_dev`) — your default, for every session in this checkout. Sessions in the VS Code chat panel don't inherit a variable you set in a terminal, so this file, or telling Claude the env, is how they get it. A `claude` CLI session does inherit the `TEST_ENV` of the terminal that started it, and that beats the file — so two sessions can run against two envs in parallel (`$env:TEST_ENV='vcst'; claude` in one terminal, `$env:TEST_ENV='vcptcore_dev'; claude` in another). `/qa-deploy-pr` (`npm run deploy:pr`) reads this file too, and its `--env=` flag picks another env; `/qa-env-upgrade` always needs `--env=`.
3. `vcst`.

Check the result with `npm run env:check`; it prints each variable as SET (with its length) or EMPTY, never a secret's value. Variable *names* are the same in every env, only values differ. In code: `import { env } from './config.js'` (ES modules — always `.js`); a key the curated `env` export does not carry is read from `process.env` after the import. To add an env, start from [`templates/.env.{env}.example`](templates/.env.{env}.example).

**Keep config shared.** Whatever the seeded data depends on — URLs, the store, the test accounts' emails — must resolve to the same values for everyone who seeds or tests an env. So it belongs in the committed `.env.<env>`, never only in your `.env.local`. When two testers resolve different values they break each other: the tests sign in as accounts that were never seeded, and re-seeding hands shared fixtures to whoever seeded last (the order seeder moves its `AGENT-TEST-ORD-*` orders to the current `USER_EMAIL`).

**Passwords are the exception: they never go into git.** That is an accepted gap. Sync them by hand from the team secret store, and keep the values identical across testers:

- Seeding resets an existing test account's password to the value in your config, so testers with different values lock each other out.
- If a password variable is missing, the seeders create the account with a built-in fallback password, without a warning, and the tests can't sign in. The variable names are listed in [`templates/.env.local.template`](templates/.env.local.template).

Minimum files:

```env
# .env.local — tokens, never env-specific values
ANTHROPIC_API_KEY=sk-ant-...
GIT_TOKEN=ghp_...         POSTMAN_API_KEY=...        FIGMA_API_KEY=...
GITHUB_FIX_BUGS_TOKEN=ghp_...   # write-capable PAT for /qa-fix (push + PR). GIT_TOKEN is read-only and 403s on push to the VC org.
JIRA_EMAIL=you@...        JIRA_API_TOKEN=...         # Jira REST, same account: tracker comments, /qa-deploy-pr finding a ticket's PRs

# .env.playwright.<env> — that env's passwords
ADMIN_PASSWORD=...        USER_PASSWORD=...          USER2_PASSWORD=...
TEST_USER_PASSWORD=...    B2B_USER_PASSWORD=...      DEFAULT_TEST_PASSWORD=...
```

This layering is how the scripts in this repo work. The `vc-fix` plugin keeps its own copy of the loader, which doesn't read `.env.playwright.<env>`; there, per-env passwords go in `.env.local` as `KEY_<ENV>=…`.

App Insights monitoring vars (`APPINSIGHTS_APP_ID_*`, `APPINSIGHTS_RESOURCE_*`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`) are committed in `.env.${TEST_ENV}` — no secrets needed.

#### 2. `.mcp.json` (gitignored — create in project root)

Copy [`templates/.mcp.json.example`](templates/.mcp.json.example) to `.mcp.json` and replace its `<PLACEHOLDER>`s. It declares the Playwright lanes (`playwright-chrome`, `-firefox`, `-edge`, `-mobile`), Chrome DevTools, Postman, GitHub, Context7, **Azure** (App Insights for `/qa-monitoring` — authenticate with `az login`), Figma and Atlassian; drop the servers you don't use. VirtoOZ and Microsoft Learn are set up at user level. The `kb` server needs no entry: a tracked `SessionStart` hook adds it, so it appears after one restart (`npm run kb:install` does the same by hand). Full server table: [`.claude/knowledge/execution/browser-lanes.md`](.claude/knowledge/execution/browser-lanes.md).

> **macOS/Linux:** drop `"command": "cmd"` and the `"/c"` arg — use `"command": "npx"` with the remaining args.
> **Keep `@playwright/mcp` pinned** at the template's version. The lane configs in `config/` are written for it, and `@latest` swaps the binary that reads them ([`.claude/rules/agents.md`](.claude/rules/agents.md)).
> **WebKit is not supported on Windows** — use Chromium, Firefox, or Edge. **Restart the IDE after any `.mcp.json` change.**
> **Browser logins:** the Playwright servers can only type a password through `--secrets`. The template passes `--secrets .env.playwright.local`; point it at the env's own `.env.playwright.<env>` instead, the file the scripts read. The servers read that file once, at start. To pick it per session, write the path as `.env.playwright.${TEST_ENV:-<default env>}`: Claude Code fills in the `TEST_ENV` of the shell that started `claude`, so two CLI sessions started with different `TEST_ENV` values use different envs' passwords. The env's file must exist, or that session's browser servers don't start.
> **Every env without a restart:** `npm run secrets:playwright` merges each `.env.playwright.<env>` into `.env.playwright.all`, renaming every key `KEY_<ENV>` (`ORG_USER_PASSWORD_VCST_QA`). Point all Playwright servers' `--secrets` at it once; a run on any env then types its own suffix, so switching env, or testing two envs in parallel, needs no restart. After changing a password, re-run the script and restart the servers.

#### 3. Verify

```bash
npm run env:check       # SET/EMPTY report — fails if required vars missing
```

Then in Claude Code: `/qa-env-check`, or `Navigate to the storefront URL and take a screenshot`. If a browser opens and navigates — you're set.

**Common issues:** restart the IDE after `.mcp.json` edits · close all Chrome windows before `playwright-chrome` (user-data-dir conflict) · `Browser "chromium" is not installed` → run `cli.js install` inside the MCP's bundled `playwright-core`.

### Test Data Seeding

The seeders create the data the suites reference — catalogs, products, prices, stock, store settings, B2B orgs and users, promotions, loyalty and more — on the env selected by `TEST_ENV`, through the platform API. Before seeding: `npm ci`, a passing `npm run env:check`, the env's passwords in `.env.playwright.<env>`, and `ENV_RISK` declared in `.env.<env>`. The seeders refuse `ENV_RISK=production` unless you pass `--allow-admin-writes-on-prod`.

```bash
npm run seed:bootstrap -- --dry-run   # rehearsal: reads only, prints the plan
npm run seed:bootstrap                # every phase in dependency order (several minutes)
npm run seed:minimal                  # required phases only
npm run td:reconcile                  # check the live env afterwards
npm run seed:bootstrap:teardown       # remove what the seeders created (AGENT-TEST-* only)
```

Single domains have their own scripts (`seed:b2b`, `seed:products`, `seed:promotions`, … in `package.json`), and in Claude Code `/qa-seed-data bootstrap` runs the same flow. The seeders are idempotent, so re-running repairs drift. They write the runtime IDs they create to `test-data/aliases.<env>.json`: commit that file after seeding a shared env so everyone resolves the same IDs (`localhost`'s is gitignored). After the first seed, set `TEST_USER_ID` in `.env.<env>` to the id of `USER_EMAIL`'s account.

Caveats:

- **Seeding changes existing data, not only adds.** On an env that already has data, the store step reconfigures the `STORE_ID` store from [`test-data/stores/stores.csv`](test-data/stores/stores.csv) (email, fulfillment centers, white-labeling theme, payment and shipping methods). The optional steps add store-wide promotions (including an automatic gift on every cart), loyalty programs and published `qa-*` pages.
- **Reading a dry run:** later steps can't find what earlier steps only pretended to create, so expect "not found — seed … first" warnings that a real run won't produce. The catalog step's plan also shows a new virtual catalog; a real run reuses the store's existing one.

### How Testing Works

Four pipelines:

1. **Interactive MCP-driven** (primary) — tell Claude Code what to test: `/qa-smoke storefront`, `/qa-test VCST-1234`, `/qa-test-fast VCST-1234`, `Use qa-frontend-expert to verify checkout`. Real browser via Playwright MCP → HAR/screenshots/console → reports.
2. **CI regression** — `ci/run-regression.ts` runs CSV suites headless via the Claude Agent SDK, locally or in Docker (`npm run ci:*`).
3. **Change-driven full cycle** — `ci/run-full-cycle.ts`: sync stale cases → review → run the affected suites (`npm run ci:cycle`).
4. **Monitoring** (`/qa-monitoring`, `npm run ci:monitor`) + **auto-fix** (`/qa-fix`) — App Insights triage / bug-fix-to-PR (gate ladder G0–G7, never auto-merges).

> `ci/` and `.github/` are tracked. The GitHub workflows (`full-cycle.yml`, `monitor.yml`, `suite-audit.yml`) have
> their `cron:` commented out, so none of the test pipelines runs unattended; `gates.yml` (incl. `npm run context:check`)
> runs on every PR, plus a weekly scheduled pass over its external checks.

### Commands, Skills & Agents

Start at **[`.claude/ROUTING.md`](.claude/ROUTING.md)** — "I want to… → use…". Full argument reference: each command and skill file's own frontmatter (`description` + `argument-hint`), which the harness renders as the `/` menu.

- **Slash commands** (`ls .claude/commands` for the current set; the bug-lifecycle ones — `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-monitoring`, `/qa-env-check`, `/project-init`, `/vc-self-check`, `/vc-feedback` — come from the `vc-fix` plugin; `/qa-monitoring`, `/project-init` and `/vc-self-check` also have project-scoped copies here) — `/qa-smoke`, `/qa-test`, `/qa-test-fast`, `/qa-regression`, `/qa-triage-results`, `/qa-exploratory`, `/qa-test-lifecycle`, `/qa-test-plan`, `/qa-domain-map`, `/qa-seed-data`, `/qa-deploy-pr`, `/qa-bundle-check`, `/qa-hotfix`, `/qa-hotfix-check`, `/qa-design`, `/qa-local-env`, `/qa-onboarding`, `/ba-analyze`, `/code-review-full`, …
- **Skills** in [`skills/`](.claude/skills) — one `skills/<name>/SKILL.md` each, category as a `[Tag]` in the description; see [skills/README.md](.claude/skills/README.md) for how the counts are derived.
- **Agents** in [`agents/`](.claude/agents) across QA and BA teams; the Developers team ships in `plugins/vc-fix/agents/` — roster in [`.claude/rules/agents.md`](.claude/rules/agents.md). Each parallel agent uses its own browser. Max 3 concurrent browser agents.

Use an agent by name: `Use the qa-backend-expert to test the Platform API`.

### Key npm Commands

```bash
npm run env:check          # Validate env vars (active TEST_ENV)
npm run ci:smoke           # CI smoke selection   ·  ci:critical / ci:frontend / ci:backend / ci:full
npm run ci:cycle           # Full pipeline: sync → review → regression
npm run seed:bootstrap     # Test-data seeding (-- --dry-run to rehearse) — see Test Data Seeding
npm run graphql:validate   # Run GraphQL fixtures  ·  schema:check (drift gate)
npm run suites:lint        # Manifest selections in sync; prints suite + case totals
npm run context:check      # Docs/prompt budget + dangling-reference gate (runs on every PR)
npm run kb -- ask "<q>"    # Ask the observed-behaviour knowledge base
```

Full list: `package.json`.

### Repository Structure

`vc-qa`'s component dirs (`agents/`, `skills/`, `commands/`, `hooks/`, `knowledge/`) are
**project-scoped under `.claude/`** — Claude Code auto-discovers them in this repo with no plugin
manifest (the old `.claude-plugin/plugin.json` was deleted). The plugins keep their own copies under
`plugins/<name>/`. Full map: [`INDEX.md`](INDEX.md).

```
ai-tools/
├── CLAUDE.md             # Claude Code project instructions
├── .claude-plugin/       # marketplace.json ONLY (lists the plugins under plugins/)
├── plugins/
│   ├── vc-fix/           # self-contained bug-lifecycle plugin (own agents/skills/commands + own copies
│   │                     #   of knowledge/, .claude/rules/, scripts/, config.js)
│   ├── vc-perf/          # performance loop (depends on vc-fix)
│   └── vc-secrets/       # secrets launcher
├── .claude/              # PROJECT-SCOPED vc-qa surface (auto-discovered — no plugin manifest)
│   ├── agents/           #   agents, flat *.md (QA / BA) — no subfolders
│   ├── skills/           #   skills, each skills/<name>/SKILL.md ([Category] tag in the description)
│   ├── commands/         #   slash commands, flat *.md (the / menu is the inventory)
│   ├── hooks/            #   hook scripts registered by the tracked .claude/settings.json
│   ├── knowledge/        #   shared reference files (api/ oracles/ execution/ domain/ …) + agents/ team instructions
│   ├── rules/            #   the always-loaded tier: agents, regression, reports, test-data
│   ├── templates/        #   test-model, dispatch and summary / mind-map / data-model schemas
│   ├── architecture/     #   TIER.md classification
│   └── ROUTING.md        #   "New here?" entry point
├── config/               # vc-qa: Playwright browser configs + test-suites.json manifest
├── ci/                   # vc-qa: CI / full-cycle / monitoring / suite-audit pipelines (tracked)
├── vc/shared/            # vc-qa: VC internal shared data (sprint plans, prompt templates, workshop) — customers ignore
├── regression/suites/    # vc-qa: CSV suites under Frontend/ + Backend/, module-aligned dirs (`npm run suites:lint` prints the totals)
├── test-data/            # vc-qa: Alias registry + CSV fixtures
├── reports/              # vc-qa: Bug, regression, per-ticket (tickets/<Sprint>/<TICKET>/<env>/) and BA reports
├── scripts/              # vc-qa: Resolvers, GraphQL runner, seeders, deploy, kb, sync/lint utilities
├── docs/                 # onboarding, distribution, release process, decisions/
└── config.js             # vc-qa: Layered env loader (TEST_ENV-keyed)
```

**Gitignored:** `.env`, `.env.local`, `.env.playwright.*`, `.env.test-env`, `.mcp.json`, `results/`, `.newman-run/`, `.fix-workspace/`, `.vc-fix/`, `project-profile.json`, `.claude/settings.local.json`. (`ci/` and `.github/` are tracked and ship.) `.claude/settings.json` is tracked — the shared project config (hooks + `enabledPlugins`, incl. Serena).

### Regression Suites

CSV suites in enriched agent-native format, organized under `Frontend/<module>/` and `Backend/<module>/`. **Authoritative definitions + selection groups live in [`config/test-suites.json`](config/test-suites.json)** (groups: `smoke`, `critical`, `purchase-flow`, `frontend`, `backend`, `sprint`, `full`, plus module/feature-aligned groups like `catalog`, `orders`, `returns`, `b2b`, `payment`, `loyalty`, `sales-rep` — `npm run regression:plan -- <name>` resolves one). Per-module index: [`regression/suites/README.md`](regression/suites/README.md).

Priority is per suite — the `priority` field in the manifest, shown beside every suite in the [per-module index](regression/suites/README.md). The `critical` selection that `ci:critical` runs is a curated subset of the P0 suites, not all of them: `npm run regression:plan -- critical` lists it.

Authoring guides: browser-mode tags ([`test-runner-tags.md`](.claude/knowledge/execution/test-runner-tags.md)) · GraphQL ([`graphql-test-cases-runner.md`](.claude/knowledge/api/graphql-test-cases-runner.md)) · test data ([`.claude/rules/test-data.md`](.claude/rules/test-data.md)) · cases that catch bugs ([`cases-that-catch-bugs.md`](.claude/knowledge/execution/cases-that-catch-bugs.md)).

### Notes

- **Payment flow:** CyberSource, Skyflow, and Authorize.Net render the card form directly on the cart page (`allowCartPayment=true`). Datatrans is the only redirect processor — "Place Order" → `/checkout/payment`.
- **Browsers:** Chrome (`playwright-chrome`, primary), Edge (`playwright-edge`), Firefox (`playwright-firefox`, click-capable since 2026-09-08). Safari/WebKit not on Windows — use BrowserStack. Theme: **Coffee** (only Coffee passes a11y). Comms: **Microsoft Teams**.

## Resources

- [Playwright MCP](https://github.com/microsoft/playwright-mcp) · [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) · [Virto Commerce Docs](https://docs.virtocommerce.org/)
- Internal reference: [`.claude/ROUTING.md`](.claude/ROUTING.md), [`.claude/rules/`](.claude/rules/), [`CLAUDE.md`](CLAUDE.md), [`INDEX.md`](INDEX.md)
