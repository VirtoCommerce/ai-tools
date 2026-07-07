# CLAUDE.md

## Project Overview

**Agentic QA system** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools) — LLM-powered browser automation, NOT traditional `.spec.js` files. Prompt templates live in `vc/vcst-qa/docs/prompts/`.

This repo is also the **`vc-qa` Claude Code plugin** (manifest: `.claude-plugin/plugin.json`, marketplace entry: `.claude-plugin/marketplace.json` — marketplace name `vc-tools`). Teammates/customers add the marketplace with `/plugin marketplace add VirtoCommerce/vc-mcp-testing-module`, install via `/plugin install vc-qa@vc-tools`, then run `npm run plugin:configure` for env setup. Distribution/onboarding docs live in `docs/distribution.md` + `docs/onboarding.md`; see also `/qa-onboarding`.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: 18+
- **Plugin install**: `/plugin install` (Claude Code) → `npm run plugin:configure` (env setup; `plugin:check` to verify). See `docs/onboarding.md`.
- **MCP Servers**: `.mcp.json` (gitignored, create locally)
- **New deployment / new customer?** Run **`/project-init`** — a derive-driven wizard. It installs deps, then asks only what genuinely shapes config (env **name**, bug **tracker** — Jira/Azure Boards, code **host** — GitHub/Azure Repos, **auth** per axis — PAT recommended else browser/CLI login) and **derives** the rest (native-platform vs CLIENT project, client org, contribution mode, fork account) from the token + a live module/repo scan. Writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access with a readiness table. That profile is what makes `/qa-fix` route each bug to the right repo + tracker. **Absent profile ⇒ native-platform / Jira / GitHub defaults = the original behaviour.**
- **New here?** See `.claude/ROUTING.md`

## Commands

```bash
npm install              # Install dependencies
npm run env:check        # Verify env vars (42 total; 26 required)
npm run ci:smoke         # Smoke tests only (suites 042, 078)
npm run ci:critical      # P0 suites (042, 078, 039, 044, 049)
npm run ci:frontend      # Frontend-layer suites
npm run ci:backend       # Backend-layer suites
npm run ci:full          # Full regression (all 104 suites)
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
├── .claude/agents/       # 18 agents in qa/ + ba/ + developers/ subfolders (each w/ shared-instructions.md), knowledge/ (29 files) for shared refs
├── .claude/skills/       # 30 QA skills (vc-knowledge, testing, qa-methodology, development) + 2 root-level (project-init, run-vc-mcp-testing-module)
├── .claude/commands/     # 23 slash commands (incl. /project-init onboarding)
├── .claude/rules/        # Reference docs (agents, regression, skills-commands, mcp-browsers, quality-gates, test-data, reports)
├── config/               # Playwright MCP configs + test-suites.json manifest
├── ci/                   # CI regression — Docker + Claude Agent SDK (gitignored)
├── docs/                 # Plugin distribution/onboarding docs (prompt templates: vc/vcst-qa/docs/prompts/)
├── vc/                    # Layer 2 — VC internal per-env data (vcst-qa, shared); customers ignore
├── regression/suites/    # 110 CSV suites (~3,480 cases) in 44 module directories
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
- `.claude/rules/agents.md` — 18 agents (QA 10 + BA 4 + Developers 4), browser assignments, delegation rules
- `.claude/rules/regression.md` — 4 testing modes, CI pipeline, suite manifest, selection groups
- `.claude/rules/skills-commands.md` — 23 commands + 30 skills with arguments
- `.claude/rules/quality-gates.md` — **Single source of truth for the bug auto-fix gate ladder (G0–G7)**: shared by the interactive `/qa-fix` (+ `developers/` team — `fullstack-backend`/`backend-reviewer` for module/platform, `fullstack-frontend`/`frontend-reviewer` for vc-frontend) and the headless `ci/run-fix-cycle.ts`. Triage→reproduce→fix→review→CI/E2E→human-review; never auto-merge. Read before any change to the auto-fix flow.
- `.claude/rules/mcp-browsers.md` — MCP servers, browser rules, Storybook setup
- `.claude/rules/test-data.md` — `@td()` resolver + `{{VAR}}` policy: never hardcode IDs/SKUs/prices/cards/etc.; canonical sources, validation script, where the rule is enforced
- `.claude/rules/reports.md` — Report file policy + brevity rule: 4 allowed categories, hard size caps per type (bug <150 lines, clean regression <30, BA <250), bloat patterns to cut, reference-don't-inline
- Virto Commerce docs: **VirtoOZ MCP** (primary — 12 topic-scoped tools: `PlatformUserGuide`, `PlatformDeveloperGuide`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `*SourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`, `VirtoCommerce`) accessed via the `/vc-docs` skill. Context7 library `/virtocommerce/vc-docs` is a fallback.
