# ai-tools — Repository Index

Agentic QA system for the **Virto Commerce B2B e-commerce platform**. Tests are executed through
natural language prompts via MCP servers (Playwright, Chrome DevTools, Atlassian, …) — LLM-powered
browser automation with AI agents, **not** traditional `.spec.js` files. The repo also hosts the
`ai-tools` Claude Code marketplace ([`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)).

> **Counts are derived, never transcribed** (`CLAUDE.md` §Where the rules live). This block used to
> print them under the heading "Authoritative counts" — and on 2026-09-19 **five of its six figures
> were wrong**, the skills and commands totals by 1 and 4, the knowledge and suite totals by 24 and
> 17. "Authoritative" is the one word that stops a reader checking, which is what made it expensive.
> Do not restore the numbers; run them:
>
> ```bash
> ls .claude/agents/*.md | wc -l          # agents
> ls -d .claude/skills/*/ | wc -l         # skills
> ls .claude/commands/*.md | wc -l        # commands
> find .claude/knowledge -name '*.md' | wc -l
> npm run suites:lint                      # suites + cases, from the manifest
> ```
>
> Single sources of truth: [`config/test-suites.json`](config/test-suites.json) for suites,
> [`.claude/rules/`](.claude/rules/) for everything else.

## Quick Navigation

| Path | Purpose |
|------|---------|
| [README.md](README.md) | Setup + quick-start guide |
| [CLAUDE.md](CLAUDE.md) | Project instructions for Claude Code (overrides defaults) |
| [.claude/ROUTING.md](.claude/ROUTING.md) | "When to use what" — task → command / skill / agent |
| [.claude/](.claude/) | The project-scoped `vc-qa` surface: agents, skills, commands, rules, knowledge, hooks |
| [plugins/](plugins/) | The marketplace plugins: [`vc-fix`](plugins/vc-fix/README.md) · `vc-perf` · [`vc-secrets`](plugins/vc-secrets/README.md) |
| [config/](config/) | MCP browser configs + `test-suites.json` manifest |
| [regression/suites/](regression/suites/) | Module-aligned CSV suites (Frontend/ + Backend/) — `npm run suites:lint` prints the totals |
| [test-data/](test-data/) | `@td()` alias registry + CSV fixtures |
| [reports/](reports/) | Bug reports, regression / monitoring / ticket / BA reports |
| [scripts/](scripts/) | Resolvers, GraphQL runner, seeders, deploy, `kb`, sync/lint utilities |
| [ci/](ci/) | Headless regression / full-cycle / monitoring / suite-audit pipelines (tracked) |
| [docs/](docs/) | Onboarding, distribution, release/versioning, decisions (`docs/decisions/`) |
| [templates/](templates/) | Customer-facing config templates (`.env.local.template`, `.env.playwright.local.template`, `.env.{env}.example`, `.mcp.json.example`, `aliases.{env}.json.template`, `bl.schema.json`) |
| [vc/](vc/) | **Layer 2** — VC's internal shared data (`vc/shared/`: sprint plans, prompt templates, workshop); customers ignore |

## Directory Structure

```
ai-tools/
├── CLAUDE.md                       # Project instructions for Claude Code
├── README.md                       # Setup & quick-start
├── INDEX.md                        # This file
├── CHANGELOG.md
├── config.js                       # Layered env loader (TEST_ENV-keyed)
├── .claude-plugin/marketplace.json # The ai-tools marketplace catalog (lists plugins/*)
│
├── .claude/
│   ├── ROUTING.md                  # When to use what
│   ├── agents/                     # FLAT — discovery is non-recursive, so no qa/ ba/ subdirs
│   ├── skills/                     # one dir each, skills/<name>/SKILL.md
│   ├── commands/                   # slash commands
│   ├── knowledge/                  # shared reference files — generated roster in knowledge/README.md
│   │                               #   incl. knowledge/agents/{qa,ba}/shared-instructions.md
│   ├── rules/                      # agents, regression, reports, test-data — the always-loaded tier
│   ├── hooks/                      # registered by the tracked settings.json (auth/tracker guards, kb, typecheck)
│   ├── templates/                  # test-model.md, agent-dispatch.md, summary / mind-map / data-model schemas
│   └── architecture/TIER.md        # A/B/C/D reuse classification
│
├── plugins/
│   ├── vc-fix/                     # bug lifecycle + Developers team (self-contained)
│   ├── vc-perf/                    # three-layer performance loop (depends on vc-fix)
│   └── vc-secrets/                 # secrets launcher for MCP configs
│
├── config/                         # MCP browser configs + test-suites.json manifest
│   ├── mcp-playwright-{chrome,firefox,edge,mobile}.config.json
│   └── test-suites.json            # Regression orchestration manifest (its `_meta` carries the live totals)
│
├── regression/suites/
│   ├── Frontend/                   # module-aligned CSVs — `npm run suites:lint` prints the totals
│   └── Backend/                    # ditto; never transcribe a suite or case count
│
├── test-data/                      # aliases.json registry + CSV fixtures (orgs, addresses, users, products, payment, …)
├── reports/                        # bugs/, regression/, monitoring/, ba/, tickets/, …
├── scripts/                        # lib/ resolvers, graphql/, seed-data/, deploy/, kb/, maintenance/, …
├── ci/                             # Agent-SDK pipelines (run-regression / run-full-cycle / run-monitor / run-suite-audit)
├── docs/                           # Distribution, onboarding, runbooks, release/versioning, decisions/
├── templates/                      # Customer config templates
└── vc/shared/                      # Layer 2 — VC internal: docs/Sprint plans/, docs/prompts/, workshop/
```

## Testing Environments

Layered env loader keyed by `TEST_ENV` (default `vcst`). Validate with `npm run env:check`.
Load order: `.env.defaults` → `.env.${TEST_ENV}` → `.env.local` (secrets, gitignored) → legacy `.env`.

| Env | `TEST_ENV` | Notes |
|-----|-----------|-------|
| vcst-qa | `vcst` (default) | Current QA — most development happens here |
| vcptcore-qa | `vcptcore` | Second QA env |
| virtostart | `virtostart` | Staging-like |

Other `.env.<name>` files in the root (e.g. the `vcptcore_*` stable / regression targets) are
additional deployment targets added with `/project-init --add-env`; `ls .env.*` lists them.

| Resource | Variable |
|----------|----------|
| Frontend | `FRONT_URL` |
| Backend | `BACK_URL` |
| Storybook | `STORYBOOK_URL` / `STORYBOOK_DEV_URL` |

Theme preset: **Coffee**. Communication: **Microsoft Teams**.

## Regression Suites

Enriched agent-native CSV format, organized into module-aligned subdirectories under `Frontend/` and
`Backend/`. **Suite, case and selection counts are derived — `npm run suites:lint` prints them.** (The
figures once written here, 126 suites / 4,155 cases / 37 selections, were stale by 17 / 592 / 1 when
checked on 2026-09-19; `.claude/rules/regression.md` carries the same warning, and `DOC-006` fails a
build that reintroduces a count there.) Per-module breakdown:
[regression/suites/README.md](regression/suites/README.md). Authoritative definitions and selection
groups: [config/test-suites.json](config/test-suites.json); `npm run regression:plan -- <name>`
resolves a group to its suites.

**Selection groups:** `smoke` · `critical` (a curated subset of the P0 suites) ·
`frontend` · `backend` · `sprint` (plan-driven) · `full` · plus module/feature groups (`catalog`,
`search`, `orders`, `returns`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`,
`configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`, `sales-rep`, `customer-reviews`, …)
and the `domain:*` / `concern:*` facets.

**Priority** is per suite — the manifest's `priority` field, shown beside every suite in
[regression/suites/README.md](regression/suites/README.md); membership of a group is never typed here.

## Claude Code Agents

Three teams; full reference in [.claude/rules/agents.md](.claude/rules/agents.md), roster with models
and colours in [.claude/knowledge/agents/README.md](.claude/knowledge/agents/README.md).

### QA Team
| Agent | Model | Purpose |
|-------|-------|---------|
| qa-lead-orchestrator | sonnet | Orchestrates testing, JIRA workflow, go/no-go; sole custodian of ticket status |
| qa-frontend-expert | opus | Storefront, checkout, mobile, cross-browser |
| qa-backend-expert | opus | Platform APIs, GraphQL xAPI, Admin SPA, jobs |
| qa-testing-expert | opus | Interactive UI testing, Claude Design spec comparison, debugging |
| test-management-specialist | sonnet | Test planning, case writing, coverage tracking |
| ui-ux-expert | sonnet | Storybook, WCAG 2.2 AA, design system, the `vs. DESIGN` axis |
| regression-orchestrator | sonnet | Parallel regression, retries, consolidated reports |
| test-runner-agent | sonnet | Standard suite-execution template |
| test-data-engineer | opus | Owns test-data end-to-end: designs, authors, and runs seeders/fixtures/validators |

### BA Team
`ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, `ba-doc-writer` (all sonnet) — analysis,
API audit, Agile stories, audience-targeted docs (Customer / Admin / Developer / Sales).

### Developers Team — plugin-only, driven by `/qa-fix`; never auto-merges
`fullstack-backend`, `backend-reviewer`, `fullstack-frontend`, `frontend-reviewer` (developers opus, Gate-4
reviewers sonnet) — one developer + one reviewer per repo kind. They live in
[`plugins/vc-fix/agents/`](plugins/vc-fix/agents/) only. Gate ladder:
[.claude/knowledge/execution/quality-gates.md](.claude/knowledge/execution/quality-gates.md).

## Commands & Skills

- **Task → tool index** — [.claude/ROUTING.md](.claude/ROUTING.md).
- **Slash commands** — [commands/](.claude/commands), reference: each file's frontmatter (the `/` menu). Count: `ls .claude/commands/*.md | wc -l`. The bug-lifecycle commands (`/project-init`, `/qa-env-check`, `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-monitoring`, `/vc-self-check`, `/vc-feedback`) come from the `vc-fix` plugin.
- **Skills** — one level each under [skills/](.claude/skills) (`skills/<name>/SKILL.md`); see [skills/README.md](.claude/skills/README.md), which derives the per-category split. Count: `ls -d .claude/skills/*/ | wc -l`.

## MCP Servers

Project-level (`.mcp.json`, gitignored — create locally): `playwright-chrome`, `playwright-firefox`,
`playwright-edge` (pinned `@playwright/mcp` versions), `postman`, `github`, `context7`, and **`kb`** —
the observed-behaviour knowledge base, merged in by a tracked `SessionStart` hook (`npm run kb:install`
is the manual fallback).
User/IDE-level: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ** (primary VC docs).
Full reference: [.claude/knowledge/execution/browser-lanes.md](.claude/knowledge/execution/browser-lanes.md).

## Commands (npm)

```bash
npm install              # Install dependencies
npm run env:check        # Validate env vars for active TEST_ENV layer
npm run ci:smoke         # Smoke selection
npm run ci:critical      # Critical selection (a curated subset of the P0 suites)
npm run ci:frontend      # Frontend selection
npm run ci:backend       # Backend selection
npm run ci:full          # Full regression (the manifest's `full` selection)
npm run ci:cycle         # Full cycle: sync → review → regression
npm run ci:monitor       # Online bug monitoring from App Insights
npm run ci:notify        # Teams notification
npm run context:check    # Docs/prompt budget + dangling-reference gate (runs on every PR)
npm run docs:index       # Regenerate the README rosters (skills, agents, commands, suites); :check gates CI
npm run kb -- ask "<q>"  # Ask the observed-behaviour knowledge base (no MCP server needed)
```

Full list: `package.json` `scripts`.

## Key Files

- [CLAUDE.md](CLAUDE.md) — Project instructions for Claude Code
- [README.md](README.md) — Setup & quick-start
- [.claude/ROUTING.md](.claude/ROUTING.md) — When to use what
- [config/test-suites.json](config/test-suites.json) — Regression orchestration manifest (source of truth)
- [regression/suites/README.md](regression/suites/README.md) — Per-module suite index
- [.claude/knowledge/README.md](.claude/knowledge/README.md) — Knowledge base folders + generated file roster
- [knowledge/domain/sitemap.md](.claude/knowledge/domain/sitemap.md) — Storefront sitemap
- [knowledge/domain/products.md](.claude/knowledge/domain/products.md) — Product types, xAPI fields, configurable sections
- [test-data/README.md](test-data/README.md) — `@td()` resolver + fixture catalog
- [docs/onboarding.md](docs/onboarding.md) — Onboarding (incl. Serena)
- [docs/release-process.md](docs/release-process.md) — Plugin release + tagging
