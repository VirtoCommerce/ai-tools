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
npm run ci:full          # Full regression (all 79 suites)
npm run ci:regression    # Run CI regression via Claude Agent SDK
npm run ci:cycle         # Full cycle: sync → lifecycle → regression
npm run ci:coverage      # Coverage generation pipeline
npm run ci:notify        # Teams notification (requires TEAMS_WEBHOOK_URL)
```

## Environment

Create `.env` (33 vars). Validate: `npm run env:check`. Access: `import { env } from './config.js'`

- ES modules project — always use `.js` extensions in imports
- URLs from env vars, never hardcoded. Default environment: QA
- **Frontend**: `FRONT_URL` | **Backend**: `BACK_URL` | **Storybook**: `STORYBOOK_URL` / `STORYBOOK_DEV_URL`
- Theme: Coffee | Communication: Microsoft Teams

## Repository Structure

```
├── .claude/agents/       # 14 agents in qa/ + ba/ subfolders, knowledge/ (17 files) for shared refs
├── .claude/skills/       # 20 skills (vc-knowledge, testing, qa-methodology)
├── .claude/commands/     # 14 slash commands
├── .claude/rules/        # Reference docs (agents, regression, skills, MCP)
├── config/               # Playwright MCP configs + test-suites.json manifest
├── ci/                   # CI regression — Docker + Claude Agent SDK (gitignored)
├── docs/prompts/         # LLM prompt templates
├── regression/suites/    # 79 CSV suites (~2,400 cases) in 33 module directories
├── tests/                # Test cases by sprint/JIRA ticket
├── reports/              # Bug reports + regression reports
├── test-data/            # Orgs, search queries, uploads
```

**Gitignored:** `.env`, `.mcp.json`, `settings.json`, `results/`, `ci/`, `.github/`, `.claude/settings.local.json`

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

**Payment flow:** CyberSource shows the payment form directly on the cart page. All other processors (Skyflow, Authorize.Net, Datatrance) require clicking "Place Order" first, which redirects to `/checkout/payment` page.

## Detailed References

- `.claude/rules/agents.md` — 14 agents, browser assignments, delegation rules
- `.claude/rules/regression.md` — 4 testing modes, CI pipeline, suite manifest, selection groups
- `.claude/rules/skills-commands.md` — 14 commands + 20 skills with arguments
- `.claude/rules/mcp-browsers.md` — MCP servers, browser rules, Storybook setup
- Virto Commerce docs: Context7 library `/virtocommerce/vc-docs` (resolve-library-id → query-docs)
