# Agents Reference

14 agents in `.claude/agents/qa/` and `.claude/agents/ba/` across two teams, plus `shared-instructions.md`. See `.claude/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints). Shared reference files in `.claude/agents/knowledge/`: `api-auth.md`, `business-logic.md`, `platform-patterns.md`, `browser-quirks.md`, `debugging-signals.md`, `performance-thresholds.md`, `catalog.md`, `store-settings.md`, `white-labeling.md`, `e-commerce-edge-cases-library.md`, `module-suite-map.md`, `sitemap.md`, `products.md`, `graphiql-interaction.md` (14 files) — these are cross-agent knowledge bases that agents should consult during testing. `api-auth.md` — Platform API OAuth2 authentication (token endpoint, credentials, headers). `business-logic.md` — testable business invariants: pricing, cart, checkout, orders, auth, B2B, catalog, cross-domain. `e-commerce-edge-cases-library.md` — 13 generic + 7 VC-specific edge case categories with BL-* cross-references (ECL-* IDs). `module-suite-map.md` — module-to-suite mapping. `sitemap.md` — full storefront sitemap (March 2026). `products.md` — product types, xAPI fields, configurable sections, test data. `graphiql-interaction.md` — step-by-step CodeMirror editor interaction guide for GraphiQL UI (auth headers, query typing, execution, response reading). Note: `test-case-template.md` (enriched CSV column spec) lives in `skills/qa-methodology/qa-test-cases-generator/`, not in knowledge/.

## QA Team (10 agents + shared-instructions)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, makes go/no-go decisions |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Figma comparison, debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.1 AA accessibility, design system |
| **regression-orchestrator** | sonnet | Parallel regression + smoke mode, retries, browser fallback, consolidated reports |
| **autonomous-regression-orchestrator** | sonnet | Agent Teams regression: token bucket, exponential backoff, failure recovery, JIRA integration |
| **autonomous-test-runner** | sonnet | Parameterized template for Agent Teams mode suite execution (used by autonomous-regression-orchestrator) |
| **test-runner-agent** | sonnet | Parameterized template for standard suite execution (used by regression-orchestrator) |

## BA Team (4 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, GitHub module search, live UI exploration (storefront + admin), user flows, pain points |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, GitHub module code, live Swagger UI, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | User docs, admin guides, API quick-start, UX improvement specs |

**BA agent tools:**
- All BA agents use **GitHub MCP** to search VirtoCommerce module repos (`org:VirtoCommerce vc-module-*`)
- `ba-system-analyzer` and `ba-api-specialist` use browsers for live UI analysis (see assignments below)
- `ba-story-writer` and `ba-doc-writer` do not require browsers or GitHub (they consume other agents' output)

## Parallel Execution — Browser Assignments

Each agent MUST use its own separate browser session. Agents sharing a browser will interfere with each other (navigation, cookies, state).

### QA Team Browsers
| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | |
| **ui-ux-expert** | `Chrome DevTools MCP` | (no webkit on Windows) |
| **test-management-specialist** | `playwright-chrome` (sequential, not parallel with frontend) | |

### BA Team Browsers
| Agent | Playwright MCP Server | Purpose |
|-------|----------------------|---------|
| **ba-system-analyzer** | `playwright-firefox` | Storefront + admin UI exploration |
| **ba-api-specialist** | `playwright-edge` | Swagger UI browsing |

**Important:** BA browsers should NOT run in parallel with QA browsers on the same server. When BA and QA agents run simultaneously, schedule them on different browser slots. Max 3 concurrent browser agents total (QA + BA combined). Never use WebKit on Windows.

## Agent Delegation

- When delegating to sub-agents/specialist agents, verify the agent has the required tool permissions BEFORE dispatching.
- If a delegated agent fails with an internal error (e.g., classifyHandoffIfNeeded), immediately fall back to working directly rather than retrying the same broken delegation.
- For multi-suite regression runs, plan for rate limits: batch in groups of 3 (matching browser pool slots) rather than launching all simultaneously.
