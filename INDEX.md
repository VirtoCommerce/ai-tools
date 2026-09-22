# VC MCP Testing Module — Repository Index

Agentic QA system for the **Virto Commerce B2B e-commerce platform**. Tests are executed through
natural language prompts via MCP servers (Playwright, Chrome DevTools, Atlassian, …) — LLM-powered
browser automation with AI agents, **not** traditional `.spec.js` files.

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
| [.claude/](.claude/) | Agents, skills, commands, rules, knowledge |
| [config/](config/) | MCP browser configs + `test-suites.json` manifest |
| [regression/suites/](regression/suites/) | 126 module-aligned CSV suites (Frontend/ + Backend/) |
| [test-data/](test-data/) | `@td()` alias registry + CSV fixtures |
| [reports/](reports/) | Bug reports + regression / monitoring summaries |
| [tests/](tests/) | Active per-sprint / per-ticket evidence (root = current) |
| [scripts/](scripts/) | Resolvers, GraphQL runner, sync/lint utilities, seeders |
| [docs/](docs/) | Plugin distribution / onboarding / runbook docs |
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
│   ├── agents/                     # FLAT — discovery is non-recursive, so no qa/ ba/ developers/ subdirs
│   ├── skills/                     # one dir each, skills/<name>/SKILL.md
│   ├── knowledge/                  # shared reference files (business-logic, graphql-schema, sitemap, …)
│   │                               #   incl. knowledge/agents/{qa,ba,developers}/shared-instructions.md
│   ├── commands/                   # slash commands
│   └── rules/                      # agents, regression, test-data, reports — the always-loaded tier; the rest moved to knowledge/execution/ (2026-09-08)
│
├── config/                         # MCP browser configs + test-suites.json manifest
│   ├── mcp-playwright-{chrome,firefox,edge}.config.json
│   └── test-suites.json            # Regression orchestration manifest (its `_meta` carries the live totals)
│
├── regression/suites/
│   ├── Frontend/                   # module-aligned CSVs — `npm run suites:lint` prints the totals
│   └── Backend/                    # ditto; never transcribe a suite or case count
│
├── test-data/                      # aliases.json registry + CSV fixtures (orgs, addresses, users, products, payment, …)
├── reports/                        # bugs/, regression/, monitoring/, ba/, tickets/, …
├── tests/                          # Active sprint/ticket evidence (root = current)
├── scripts/                        # lib/ resolvers, graphql-runner.ts, sync/lint utilities, seeders
├── docs/                           # Distribution, onboarding, runbooks, release/versioning
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

Enriched agent-native CSV format, organized into module-aligned subdirectories under `Frontend/` and
`Backend/`. **Suite, case and selection counts are derived — `npm run suites:lint` prints them.** (The
figures once written here, 126 suites / 4,155 cases / 37 selections, were stale by 17 / 592 / 1 when
checked on 2026-09-19; `.claude/rules/regression.md` carries the same warning, and `DOC-006` fails a
build that reintroduces a count there.) Per-module breakdown:
[regression/suites/README.md](regression/suites/README.md). Authoritative definitions and selection
groups: [config/test-suites.json](config/test-suites.json).

**Selection groups:** `smoke` (042, 078, 078b-d) · `critical` (042, 078, 078b-d, 039, 044, 049) ·
`frontend` · `backend` · `sprint` (plan-driven) · `full` (119) · plus module/feature groups
(`catalog`, `search`, `orders`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`,
`configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`).

**P0 suites:** 042 (Smoke), 078 (Backend Smoke), 039 (CyberSource Payment), 044 (Security), 049 (Platform API).

## Claude Code Agents (19)

Three teams; full reference in [.claude/rules/agents.md](.claude/rules/agents.md).

### QA Team (11)
| Agent | Model | Purpose |
|-------|-------|---------|
| qa-lead-orchestrator | sonnet | Orchestrates testing, JIRA workflow, go/no-go |
| qa-frontend-expert | opus | Storefront, checkout, mobile, cross-browser |
| qa-backend-expert | opus | Platform APIs, GraphQL xAPI, Admin SPA, jobs |
| qa-testing-expert | opus | Interactive UI testing, Figma comparison, debugging |
| test-management-specialist | sonnet | Test planning, case writing, coverage tracking |
| ui-ux-expert | sonnet | Storybook, WCAG 2.x AA, design system |
| regression-orchestrator | sonnet | Parallel regression, retries, consolidated reports |
| test-runner-agent | sonnet | Standard suite-execution template |
| test-data-engineer | opus | Owns test-data end-to-end: designs, authors, and runs seeders/fixtures/validators |

### BA Team (4)
`ba-system-analyzer`, `ba-api-specialist`, `ba-story-writer`, `ba-doc-writer` (all sonnet) — analysis,
API audit, Agile stories, audience-targeted docs (Customer / Admin / Developer / Sales).

### Developers Team (4) — only write-capable team, driven by `/qa-fix`; never auto-merges
`fullstack-backend`, `backend-reviewer`, `fullstack-frontend`, `frontend-reviewer` (developers opus, Gate-4 reviewers sonnet since 2026-09-08) — one
developer + one reviewer per repo kind. Gate ladder: [.claude/knowledge/execution/quality-gates.md](.claude/knowledge/execution/quality-gates.md).

## Commands & Skills

- **Slash commands** — [commands/](.claude/commands), reference: each file's frontmatter (the `/` menu). Count: `ls .claude/commands/*.md | wc -l`.
- **Skills** — one level each under [skills/](.claude/skills) (`skills/<name>/SKILL.md`); see [skills/README.md](.claude/skills/README.md), which derives the per-category split. Count: `ls -d .claude/skills/*/ | wc -l`.

## MCP Servers

Project-level (`.mcp.json`, gitignored — create locally): `playwright-chrome`, `playwright-firefox`,
`playwright-edge`, `postman`, `github`, `context7`.
User/IDE-level: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ** (primary VC docs).
Full reference: [.claude/knowledge/execution/browser-lanes.md](.claude/knowledge/execution/browser-lanes.md).

## Commands (npm)

```bash
npm install              # Install dependencies
npm run env:check        # Validate env vars for active TEST_ENV layer
npm run ci:smoke         # Smoke selection (042, 078, 078b-d)
npm run ci:critical      # P0 selection (042, 078, 078b-d, 039, 044, 049)
npm run ci:frontend      # All Frontend/ suites
npm run ci:backend       # All Backend/ suites
npm run ci:full          # Full regression (all 119 `full` suites)
npm run ci:cycle         # Full cycle: sync → review → regression
npm run ci:monitor       # Online bug monitoring from App Insights
npm run ci:notify        # Teams notification
```

## Key Files

- [CLAUDE.md](CLAUDE.md) — Project instructions for Claude Code
- [README.md](README.md) — Setup & quick-start
- [config/test-suites.json](config/test-suites.json) — Regression orchestration manifest (source of truth)
- [regression/suites/README.md](regression/suites/README.md) — Per-module suite index
- [knowledge/domain/sitemap.md](.claude/knowledge/domain/sitemap.md) — Storefront sitemap
- [knowledge/domain/products.md](.claude/knowledge/domain/products.md) — Product types, xAPI fields, configurable sections
- [test-data/README.md](test-data/README.md) — `@td()` resolver + fixture catalog
