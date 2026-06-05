# CLAUDE.md

## Project Overview

**Agentic QA system** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools) — LLM-powered browser automation, NOT traditional `.spec.js` files. Prompt templates live in `docs/prompts/`.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: 18+
- **MCP Servers**: `.mcp.json` (gitignored, create locally)
- **New here?** See `.claude/ROUTING.md`

## Commands

```bash
npm install              # Install dependencies
npm run env:check        # Verify all required env vars (33 total)
npm run ci:smoke         # Smoke tests only (suite 042)
npm run ci:critical      # P0 suites (042, 039, 044, 049)
npm run ci:frontend      # Frontend-layer suites
npm run ci:backend       # Backend-layer suites
npm run ci:full          # Full regression (all 99 suites)
npm run ci:regression    # Run CI regression via Claude Agent SDK
npm run ci:cycle         # Full cycle: sync → lifecycle → regression
npm run ci:coverage      # Coverage generation pipeline
npm run ci:monitor       # Online bug monitoring from App Insights (ci:monitor:dry = triage-only)
npm run ci:notify        # Teams notification (requires TEAMS_WEBHOOK_URL)
```

## Environment

Layered loader, keyed by `TEST_ENV` (default `vcst`). Validate: `npm run env:check`. Access: `import { env } from './config.js'`.

Load order (later overrides earlier): `.env.defaults` → `.env.${TEST_ENV}` → `.env.local` → legacy `.env` (backwards-compat fallback).

- **Per-env URLs/identifiers** (committed, no secrets): `.env.vcst` (current QA), `.env.vcptcore` (second QA), `.env.virtostart` (staging)
- **Secrets** (passwords, API tokens): `.env.local` only — gitignored
- **Cross-env constants** (sandbox cards, builder.io): `.env.defaults`
- Switch envs: `TEST_ENV=vcptcore npm run env:check` or `TEST_ENV=virtostart …`
- Agents read variable values via `process.env.X` — they don't care which file it came from. Variable *names* are stable across envs.
- ES modules project — always use `.js` extensions in imports
- URLs from env vars, never hardcoded. Default environment: vcst-qa
- **Frontend**: `FRONT_URL` | **Backend**: `BACK_URL` | **Storybook**: `STORYBOOK_URL` / `STORYBOOK_DEV_URL`
- Theme: Coffee | Communication: Microsoft Teams

## Repository Structure

```
├── .claude/agents/       # 16 agents in qa/ + ba/ + developers/ subfolders (each w/ shared-instructions.md), knowledge/ (26 files) for shared refs
├── .claude/skills/       # 24 skills (vc-knowledge, testing, qa-methodology, development)
├── .claude/commands/     # 18 slash commands
├── .claude/rules/        # Reference docs (agents, regression, skills, MCP, quality-gates)
├── config/               # Playwright MCP configs + test-suites.json manifest
├── ci/                   # CI regression — Docker + Claude Agent SDK (gitignored)
├── docs/prompts/         # LLM prompt templates
├── regression/suites/    # 99 CSV suites (~3,756 cases) in 42 module directories
├── tests/                # Test cases by sprint/JIRA ticket
├── reports/              # Bug reports + regression reports
├── test-data/            # Orgs, search queries, uploads
```

**Gitignored:** `.env`, `.env.local`, `.env.backup`, `.mcp.json`, `settings.json`, `results/`, `ci/`, `.github/`, `.claude/settings.local.json`

## Essential Rules

**Testing:**
- NEVER share a browser session between parallel agents — each gets its own isolated context
- Run deep/comprehensive tests unless explicitly told smoke. Always capture HAR files.
- Batch regression in groups of 3 (matching browser pool slots)

**Browser:**
- Use `chromium` (not `chrome`). WebKit NOT supported on Windows — use Edge fallback.
- Close Chrome windows before `playwright-chrome` (user data dir conflict)
- MCP config changes require server restart

**Agent Teams:**
- Mode: `teammateMode: "in-process"` in settings.json
- `post_edit` hook: `npx tsc --noEmit`. Max 3 concurrent browser agents.
- Browser assignments: see `.claude/rules/agents.md`

## Critical Revenue Flows (must pass before deployment)

Registration/Auth, Catalog/Facets, Cart (variations, BOPIS), Search, Addresses, Checkout/Payment, Orders, B2B Multi-org, GA4 tracking.

**Payment flow:** CyberSource, Skyflow (VCST-5009), and Authorize.Net (VCST-5162, PR-deployed) have `allowCartPayment=true` — the card form renders directly on the cart page. Datatrans is the only remaining redirect processor: clicking "Place Order" redirects to `/checkout/payment`.

## Detailed References

- `.claude/architecture/TIER.md` — Tier classification (A/B/C/D) for multi-project expansion; canonical map of what's methodology vs capability vs storefront-domain vs missing. Read before any change aimed at standardization or cross-product reuse.
- `.claude/rules/agents.md` — 16 agents (QA 10 + BA 4 + Developers 2), browser assignments, delegation rules
- `.claude/rules/regression.md` — 4 testing modes, CI pipeline, suite manifest, selection groups
- `.claude/rules/skills-commands.md` — 17 commands + 23 skills with arguments
- `.claude/rules/quality-gates.md` — **Single source of truth for the bug auto-fix gate ladder (G0–G7)**: shared by the interactive `/qa-fix` (+ `developers/` team `fullstack-backend`/`backend-reviewer`) and the headless `ci/run-fix-cycle.ts`. Triage→reproduce→fix→review→CI/E2E→human-review; never auto-merge. Read before any change to the auto-fix flow.
- `.claude/rules/mcp-browsers.md` — MCP servers, browser rules, Storybook setup
- `.claude/rules/test-data.md` — `@td()` resolver + `{{VAR}}` policy: never hardcode IDs/SKUs/prices/cards/etc.; canonical sources, validation script, where the rule is enforced
- `.claude/rules/reports.md` — Report file policy + brevity rule: 4 allowed categories, hard size caps per type (bug <150 lines, clean regression <30, BA <250), bloat patterns to cut, reference-don't-inline
- Virto Commerce docs: **VirtoOZ MCP** (primary — 12 topic-scoped tools: `PlatformUserGuide`, `PlatformDeveloperGuide`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `*SourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`, `VirtoCommerce`) accessed via the `/vc-docs` skill. Context7 library `/virtocommerce/vc-docs` is a fallback.
