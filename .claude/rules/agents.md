# Agents Reference

16 agents in `.claude/agents/qa/`, `.claude/agents/ba/`, and `.claude/agents/developers/` across three teams, plus per-team `shared-instructions.md`. See `.claude/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints). Shared reference files in `.claude/agents/knowledge/`: `api-auth.md`, `business-logic.md`, `platform-patterns.md`, `browser-quirks.md`, `debugging-signals.md`, `performance-thresholds.md`, `catalog.md`, `store-settings.md`, `white-labeling.md`, `e-commerce-edge-cases-library.md`, `vc-bug-catalog.md`, `module-suite-map.md`, `sitemap.md`, `products.md`, `graphiql-interaction.md`, `order-creation-matrix.md`, `graphql-schema.md`, `graphql-test-cases-runner.md`, `test-runner-tags.md`, `live-discovery.md`, `critical-ui-scope.md`, `storefront-selectors.md`, `test-execution-preflight.md`, `storefront-config-flags.md`, `vc-module-architecture.md`, `virto-doc-style.md` (26 files) — these are cross-agent knowledge bases that agents should consult during testing. `api-auth.md` — Platform API OAuth2 authentication (token endpoint, credentials, headers). `business-logic.md` — testable business invariants: pricing, cart, checkout, orders, auth, B2B, catalog, cross-domain. `e-commerce-edge-cases-library.md` — 13 generic + 7 VC-specific edge case categories with BL-* cross-references (ECL-* IDs). `vc-bug-catalog.md` — VC-specific historical failure patterns indexed by domain (VC-CART-*, VC-CAT-*, VC-PROMO-*, VC-CFG-*, VC-B2B-*, VC-LIST-*, VC-AUTH-*, VC-CHECKOUT-*, VC-ORDERS-*, VC-UI-*, VC-API-*, VC-LOY-*, VC-CMS-*, VC-ADDR-*, VC-BOPIS-*, VC-DEPLOY-*, VC-PURCHASE-*, VC-EXEC-*); each entry has pattern → past incident → detection probe → cross-ref to BL/ECL/MEMORY. Used by exploratory sessions as the "Familiar Problems" oracle (HICCUPPS-F) and to seed Bad Neighborhood Tours. `module-suite-map.md` — module-to-suite mapping. `sitemap.md` — full storefront sitemap (March 2026). `products.md` — product types, xAPI fields, configurable sections, test data. `graphiql-interaction.md` — step-by-step CodeMirror editor interaction guide for GraphiQL UI (auth headers, query typing, execution, response reading). `order-creation-matrix.md` — order creation flow matrix for different payment/shipping combinations. `graphql-schema.md` — xAPI GraphQL schema reference (queries, mutations, input types, return types) from live introspection — MUST consult before writing or reviewing GraphQL queries/mutations. `graphql-test-cases-runner.md` — **canonical authoring contract for runner-native GraphQL test cases** consumed by `scripts/graphql-runner.ts`: full `Steps`/`Assertions`/`Cleanup` tag grammar (`[AUTH]/[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]/[REST-OP]/[REST-EXEC]/[REST-CAPTURE]/[REST]` + `[ERRORS]/[DATA]/[NULL]/[COUNT]/[VAR]`), predicate shapes (incl. arithmetic / cross-path / OR-AND / `[VAR]`), `getByPath` filter syntax, `@td()` resolver (CSV-backed + inline), capture chaining, common failure modes, authoring checklist, worked example. Every agent that writes/reviews/migrates GraphQL test cases (test-management-specialist, qa-backend-expert, qa-frontend-expert, qa-testing-expert, test-runner-agent, autonomous-test-runner, qa-lead-orchestrator) MUST read this before authoring; gold-standard reference suite: `regression/suites/Backend/graphql/050i-graphql-configurations.csv`. `test-runner-tags.md` — shared CSV column/step/assertion/cross-layer tag reference for test-runner-agent and autonomous-test-runner (browser-mode tags; runner-native GraphQL tags live in `graphql-test-cases-runner.md`). `live-discovery.md` — decision tree + JS recipes (via `scripts/lib/live-discover.ts` / `random-data.ts`) + CSV-runner recipes (via `[GQL-OP]+[GQL-CAPTURE]`) for resolving test data at runtime instead of hardcoding; covers when to pick `{{VAR}}` vs `@td()` vs `live-discover` vs `random-data`, parallel-run isolation against the agent user pool, and `AGENT-TEST-` cleanup prefix conventions. Read before authoring any test that mentions a product / address / cart / coupon entity that may drift between seeds. `critical-ui-scope.md` — regression-enforced matrix of 7 components × 8 pages with applicable BL-UI invariants per cell; covered by suite `048b-layout-stability.csv` and validated by `npm run scope:validate`. `storefront-selectors.md` — stable selector reference (data-test-id / role / aria-label patterns) for storefront UI automation. `test-execution-preflight.md` — preflight checklist agents run before browser-driven test execution (env health, fixture seed, MCP server status). `storefront-config-flags.md` — snapshot of vc-frontend `$cfg.*` settings_data.json flag inventory (see `reference_storefront_config_flags` memory). `vc-module-architecture.md` — VC module repo anatomy + .NET 10 / xUnit / Angular conventions (used by the developers team). `virto-doc-style.md` — canonical BA documentation style guide: four audience skeletons (Customer/StorefrontUserGuide, Admin/PlatformUserGuide, Developer/PlatformDeveloperGuide, **Sales**/virtocommerce.com marketing), MkDocs admonition conventions, no-hardcode + truth guardrails; read by `ba-doc-writer` before authoring any doc. Note: `test-case-template.md` (enriched CSV column spec) lives in `skills/qa-methodology/qa-test-cases-generator/`, not in knowledge/.

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

## BA Team (4 agents + shared-instructions)

Team framework: `.claude/agents/ba/shared-instructions.md` (VirtoOZ-first sourcing, the four documentation audiences, no-hardcode, external-write discipline, output policy).

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, GitHub module search, live UI exploration (storefront + admin), user flows, pain points |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, GitHub module code, live Swagger UI, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | Audience-targeted documentation — **Customer / Admin / Developer / Sales** (per `knowledge/virto-doc-style.md`) + UX improvement specs |

**BA agent tools:**
- All BA agents use **GitHub MCP** to search VirtoCommerce module repos (`org:VirtoCommerce vc-module-*`) and **VirtoOZ MCP** (via `/vc-docs`) to ground terminology/voice
- `ba-system-analyzer` and `ba-api-specialist` use browsers for live UI analysis (see assignments below)
- `ba-story-writer` consumes other agents' output (no browser/GitHub); `ba-doc-writer` uses a browser **only** to capture real screenshots for Customer/Admin docs
- **Documentation audiences:** `ba-doc-writer` writes for four audiences — Customer (StorefrontUserGuide style), Admin (PlatformUserGuide style), Developer (PlatformDeveloperGuide style), and **Sales** (virtocommerce.com benefit-led marketing). Invoked via `/ba-analyze docs [audience]`. Virto's customers/partners are B2B enterprise organizations — see `reference_virto_customer_base` memory.

## Developers Team (2 agents + shared-instructions)

The **only write-capable team** — clone / branch / commit / push / open PR on external VirtoCommerce
product repos via local `git`/`gh`. QA agents stay read-only on GitHub; write scope is isolated here.
Driven by `/qa-fix` (interactive twin of `ci/run-fix-cycle.ts`), reusing `ci/config/fix-repos.json` +
`ci/lib/repo-router.ts` + `ci/lib/module-registry.ts`. Gate ladder + no-auto-merge: `.claude/rules/quality-gates.md`.

| Agent | Model | Purpose |
|-------|-------|---------|
| **fullstack-backend** | opus | Fixes ONE `vc-module-*` / `vc-platform` repo (.NET 10 / C# + the module's Admin SPA Angular). Reproduce-as-test → minimal fix → open PR. Interactive twin of `ci/agents/fix-backend-agent.md`. Extensible — `fullstack-frontend` (vc-frontend/Vue) is the planned next member. |
| **backend-reviewer** | opus | Gate-4 reviewer of the local diff before the PR: single-repo, no test edits, no breaking changes, BL-* preserved, minimal & idiomatic. |

**Developer team tools & constraints:**
- **No browser.** Code only; E2E verification (Gate 6) is delegated back to `qa-backend-expert` / `qa-frontend-expert` via `/qa-regression`.
- Write via local **Bash** `git`/`gh` + **Write/Edit** in `.fix-workspace/` (gitignored). Branch `claude/qa-autofix/VCST-XXXX`.
- **FORBIDDEN:** `merge_pull_request` / `gh pr merge` (denied in `settings.local.json`; never auto-merge).
- Single repo per run; cross-module / breaking change / no-test-harness → STOP + hand off.

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
