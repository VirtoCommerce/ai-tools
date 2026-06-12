# VC MCP Testing Module — Repository Index

Agentic QA system for the **Virto Commerce B2B e-commerce platform**. Tests are executed through
natural language prompts via MCP servers (Playwright, Chrome DevTools, Atlassian, …) — LLM-powered
browser automation with AI agents, **not** traditional `.spec.js` files.

> **Authoritative counts** (verified 2026-06-12): 18 agents · 26 skills (+1 repo-tooling) · 19 commands ·
> 27 knowledge files · 104 regression suites (~3,790 cases). Single sources of truth:
> [`config/test-suites.json`](config/test-suites.json) for suites, [`.claude/rules/`](.claude/rules/) for everything else.

## Quick Navigation

| Path | Purpose |
|------|---------|
| [README.md](README.md) | Setup + quick-start guide |
| [CLAUDE.md](CLAUDE.md) | Project instructions for Claude Code (overrides defaults) |
| [.claude/](.claude/) | Agents, skills, commands, rules, knowledge |
| [config/](config/) | MCP browser configs + `test-suites.json` manifest |
| [regression/suites/](regression/suites/) | 104 module-aligned CSV suites (Frontend/ + Backend/) |
| [test-data/](test-data/) | `@td()` alias registry + CSV fixtures |
| [reports/](reports/) | Bug reports + regression / monitoring summaries |
| [tests/](tests/) | Active per-sprint / per-ticket evidence (root = current) |
| [scripts/](scripts/) | Resolvers, GraphQL runner, sync/lint utilities, seeders |
| [docs/](docs/) | Plugin distribution / onboarding / runbook docs |
| [bootstrap/](bootstrap/) | Plugin installer (`install.ts`) |
| [templates/](templates/) | Customer-facing config templates (`aliases.json.template`) |
| [vc/](vc/) | **Layer 2** — VC's internal per-env data (`vcst-qa/`, `shared/`); customers ignore |
| ci/ | CI regression / full-cycle / auto-fix / monitoring pipelines (**gitignored**) |

## Directory Structure

```
vc-mcp-testing-module/
├── CLAUDE.md                       # Project instructions for Claude Code
├── README.md                       # Setup & quick-start
├── INDEX.md                        # This file
├── config.js                       # Layered env loader (TEST_ENV-keyed)
│
├── .claude/
│   ├── agents/                     # 18 agents — qa/ (10) + ba/ (4) + developers/ (4), each w/ shared-instructions.md
│   │   └── knowledge/              # 27 shared reference files (business-logic, graphql-schema, sitemap, …)
│   ├── skills/                     # 26 skills in 4 groups (vc-knowledge, testing, qa-methodology, development) + 1 repo-tooling
│   ├── commands/                   # 19 slash commands
│   └── rules/                      # agents, regression, skills-commands, mcp-browsers, test-data, quality-gates, reports
│
├── config/                         # MCP browser configs + test-suites.json manifest
│   ├── mcp-playwright-{chrome,firefox,edge}.config.json
│   └── test-suites.json            # Regression orchestration manifest (_meta.totalSuites: 104)
│
├── regression/suites/
│   ├── Frontend/                   # 48 CSVs in 15 module dirs
│   └── Backend/                    # 56 CSVs in 29 module dirs
│
├── test-data/                      # aliases.json registry + CSV fixtures (orgs, addresses, users, products, payment, …)
├── reports/                        # bugs/, regression/, monitoring/, ba/, tickets/, …
├── tests/                          # Active sprint/ticket evidence (root = current)
├── scripts/                        # lib/ resolvers, graphql-runner.ts, sync/lint utilities, seeders
├── docs/                           # Distribution, onboarding, runbooks, release/versioning
├── bootstrap/install.ts            # Plugin installer
├── templates/                      # Customer config templates
└── vc/                             # Layer 2 — VC internal data
    ├── shared/                     # Cross-env: docs/Sprint plans/, workshop/
    └── vcst-qa/                    # Primary VC QA env: tests/, reports/, docs/prompts/
```

## Testing Environments

Layered env loader keyed by `TEST_ENV` (default `vcst`). Validate with `npm run env:check`.
Load order: `.env.defaults` → `.env.${TEST_ENV}` → `.env.local` (secrets, gitignored) → legacy `.env`.

| Env | `TEST_ENV` | Notes |
|-----|-----------|-------|
| vcst-qa | `vcst` (default) | Current QA — most development happens here |
| vcptcore-qa | `vcptcore` | Second QA env |
| virtostart | `virtostart` | Staging-like |

| Resource | Variable |
|----------|----------|
| Frontend | `FRONT_URL` |
| Backend | `BACK_URL` |
| Storybook | `STORYBOOK_URL` / `STORYBOOK_DEV_URL` |

Theme preset: **Coffee**. Communication: **Microsoft Teams**.

## Regression Suites

104 suites (~3,790 cases) in enriched agent-native CSV format, organized into module-aligned
subdirectories under `Frontend/` and `Backend/`. Per-module breakdown:
[regression/suites/README.md](regression/suites/README.md). Authoritative definitions and selection
groups: [config/test-suites.json](config/test-suites.json).

**Selection groups:** `smoke` (042, 078) · `critical` (042, 078, 039, 044, 049) · `release` (080) ·
`frontend` · `backend` · `sprint` (plan-driven) · `full` (104) · plus module/feature groups
(`catalog`, `search`, `orders`, `auth`, `b2c`, `marketing`, `platform`, `bopis`, `payment`,
`configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`).

**P0 suites:** 042 (Smoke), 078 (Backend Smoke), 039 (CyberSource Payment), 044 (Security), 049 (Platform API).

## Claude Code Agents (18)

Three teams; full reference in [.claude/rules/agents.md](.claude/rules/agents.md).

### QA Team (10)
| Agent | Model | Purpose |
|-------|-------|---------|
| qa-lead-orchestrator | sonnet | Orchestrates testing, JIRA workflow, go/no-go |
| qa-frontend-expert | opus | Storefront, checkout, mobile, cross-browser |
| qa-backend-expert | opus | Platform APIs, GraphQL xAPI, Admin SPA, jobs |
| qa-testing-expert | opus | Interactive UI testing, Figma comparison, debugging |
| test-management-specialist | sonnet | Test planning, case writing, coverage tracking |
| ui-ux-expert | sonnet | Storybook, WCAG 2.x AA, design system |
| regression-orchestrator | sonnet | Parallel regression, retries, consolidated reports |
| autonomous-regression-orchestrator | sonnet | Agent Teams regression: token bucket, recovery, JIRA |
| autonomous-test-runner | sonnet | Agent Teams suite-execution template |
| test-runner-agent | sonnet | Standard suite-execution template |

### BA Team (4)
`ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, `ba-doc-writer` (all sonnet) — analysis,
API audit, Agile stories, audience-targeted docs (Customer / Admin / Developer / Sales).

### Developers Team (4) — only write-capable team, driven by `/qa-fix`; never auto-merges
`fullstack-backend`, `backend-reviewer`, `fullstack-frontend`, `frontend-reviewer` (all opus) — one
developer + one reviewer per repo kind. Gate ladder: [.claude/rules/quality-gates.md](.claude/rules/quality-gates.md).

## Commands & Skills

- **19 slash commands** — [.claude/commands/](.claude/commands/), reference in [.claude/rules/skills-commands.md](.claude/rules/skills-commands.md).
- **26 skills** in 4 groups (+1 repo-tooling) — [.claude/skills/README.md](.claude/skills/README.md).

## MCP Servers

Project-level (`.mcp.json`, gitignored — create locally): `playwright-chrome`, `playwright-firefox`,
`playwright-edge`, `postman`, `github`, `context7`.
User/IDE-level: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ** (primary VC docs).
Full reference: [.claude/rules/mcp-browsers.md](.claude/rules/mcp-browsers.md).

## Commands (npm)

```bash
npm install              # Install dependencies
npm run env:check        # Validate env vars for active TEST_ENV layer
npm run ci:smoke         # Smoke selection (042, 078)
npm run ci:critical      # P0 selection (042, 078, 039, 044, 049)
npm run ci:frontend      # All Frontend/ suites
npm run ci:backend       # All Backend/ suites
npm run ci:full          # Full regression (all 104 suites)
npm run ci:cycle         # Full cycle: sync → review → regression
npm run ci:monitor       # Online bug monitoring from App Insights
npm run ci:notify        # Teams notification
```

## Key Files

- [CLAUDE.md](CLAUDE.md) — Project instructions for Claude Code
- [README.md](README.md) — Setup & quick-start
- [config/test-suites.json](config/test-suites.json) — Regression orchestration manifest (source of truth)
- [regression/suites/README.md](regression/suites/README.md) — Per-module suite index
- [.claude/agents/knowledge/sitemap.md](.claude/agents/knowledge/sitemap.md) — Storefront sitemap
- [.claude/agents/knowledge/products.md](.claude/agents/knowledge/products.md) — Product types, xAPI fields, configurable sections
- [test-data/README.md](test-data/README.md) — `@td()` resolver + fixture catalog
- [vc/README.md](vc/README.md) — Layer 2 (VC internal per-env data) layout
