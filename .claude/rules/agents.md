# Agents Reference

17 agents as flat `agents/*.md` files at the plugin root, across three teams (QA, BA, Developers). Plugin agent discovery is non-recursive, so agents are NOT nested in team subfolders; the per-team `shared-instructions.md` and the agents README live under `knowledge/agents/` (a plain reference dir, not scanned as components). See `knowledge/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints).

**Shared knowledge bases** — `ls .claude/knowledge/` for the current inventory; each file opens with its own scope. Grouped by directory: `api/` (api-auth, graphiql-interaction, graphql-schema, graphql-test-cases-runner, order-creation-matrix, platform-patterns) · `architecture/` (vc-frontend-architecture, vc-module-architecture) · `automation/` (browser-quirks, storefront-config-flags, storefront-selectors) · `ba/` (virto-doc-style) · `diagnostics/` (skill-expectations) · `domain/` (catalog, products, release-ledger, sitemap, store-settings, white-labeling) · `execution/` (debugging-signals, live-discovery, module-suite-map, performance-thresholds, test-data-authoring, test-execution-preflight, test-runner-tags, ticket-routing, tracker-ops) · `oracles/` (business-logic, critical-ui-scope, e-commerce-edge-cases-library, vc-bug-catalog).

**Non-obvious read-before-you-write rules** (these do NOT follow from the filenames):
- `api/graphql-schema.md` — MUST be consulted before writing or reviewing any GraphQL query/mutation (field names drift; verify against live introspection).
- `api/graphql-test-cases-runner.md` — the **canonical authoring contract** for runner-native GraphQL test cases (`scripts/graphql/graphql-runner.ts`): full tag grammar, predicate shapes, `@td()` resolver, capture chaining. Every agent that writes/reviews/migrates GraphQL cases MUST read it first; gold-standard reference suite: `regression/suites/Backend/graphql/050i-graphql-configurations.csv`.
- `execution/live-discovery.md` — read before authoring any test naming a product / address / cart / coupon entity that may drift between seeds.
- `domain/release-ledger.md` — MUST be consulted before **designing a test for**, or **triaging a failure in**, a component the ledger records a release for since the env's deployed version. It is the only source in the repo that answers "what shipped recently": VirtoOZ's release corpus stops at Platform 3.917.1 while production is past 3.1050, so the docs MCP cannot see roughly nine months of releases. Generated — `npm run releases:refresh`; never hand-edit. **Three rules travel with it, and skipping any one of them produces a confidently wrong verdict:** (1) it says what is **released upstream**, never what is **deployed on the env under test** — a capability it records that the live `/api/platform/modules` probe does not carry is `NOT_DEPLOYED`, never a `FAIL` and never a bug; (2) it is an editorial monthly digest that **declares itself non-exhaustive**, so presence is evidence but absence is not — a miss never licenses "nothing changed"; (3) it carries **no behaviour** (no ACs, field lists, or expected-value literals), so it can raise a *hypothesis* about a failure but can never settle a verdict, and it can never ground an assertion as `{DOC}`.
- `oracles/critical-ui-scope.md` — **currently UNCOVERED** (its only covering suite `048b` was removed 2026-07-25, so every applicable cell is `GAP`); it is the scope definition + `/qa-design` audit reference, not a regression gate.
- `oracles/vc-bug-catalog.md` — the "Familiar Problems" oracle (HICCUPPS-F) for exploratory sessions + Bad Neighborhood Tours.
- Note: `test-case-template.md` (enriched CSV column spec) lives in `skills/qa-test-cases-generator/`, NOT in `knowledge/`.

## QA Team (9 agents + shared-instructions)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, manages JIRA workflow, makes go/no-go decisions. **Also serves as the independent per-step verifier in `/qa-test`** (§Verifier Mode): a fresh, gate-scoped instance — never the pipeline's inline orchestrator and never the step's own doer — re-derives evidence from source and returns `APPROVE`/`REJECT`. Delegates any live re-check to a specialist on a **different browser lane** than the doer used. |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Claude Design spec comparison (Figma is a manual fallback only), debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **test-data-engineer** | opus | Owns test-data end-to-end: designs cross-entity combinations, **authors** the seeders / fixtures / `@td()` aliases / drift-guard validators + their unit tests, **AND RUNS them live** — real seed/teardown against a non-prod env + `td:reconcile` (Node + Platform-API, no browser) (`/qa-generate-data` + `/qa-seed-data`). Write-capable in THIS repo only (`scripts/seed-data/`, `test-data/`); no external repos. Canonical owner — `test-management-specialist` delegates fixture authoring here; `qa-backend/frontend-expert` do only the **browser** confirmation (storefront/Admin-SPA render + suite run) the engineer can't. See `knowledge/execution/test-data-authoring.md`. |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.2 AA accessibility, design system, and the **`vs. DESIGN` axis** — diffing declared tokens / control geometry / icon name→glyph parity against a Claude Design project (`DesignSync` → `scripts/lib/verify-design-spec.ts`, methodology `skills/qa-design/claude-design-verification.md`). Runs by default against `DESIGN_SYSTEM_PROJECT_ID`; precedence `BL-UI invariant > design spec > UX heuristic`; reports `SKIPPED`, never PASS, where `/design-login` is unavailable (web sessions, CI), and `KNOWN_DIVERGENCE` — advisory, never filed — for a mismatch the spec itself declares unshipped |
| **regression-orchestrator** | sonnet | Parallel regression + smoke mode, retries, browser fallback, consolidated reports |
| **test-runner-agent** | sonnet | Parameterized template for standard suite execution (used by regression-orchestrator) |

## BA Team (4 agents + shared-instructions)

Team framework: `knowledge/agents/ba/shared-instructions.md` (VirtoOZ-first sourcing, the four documentation audiences, no-hardcode, external-write discipline, output policy).

| Agent | Model | Purpose |
|-------|-------|---------|
| **ba-system-analyzer** | sonnet | Repo structure, GitHub module search, live UI exploration (storefront + admin), user flows, pain points. **Also the sole writer of BOTH shared oracles** (`/qa-review-oracles`, alias `/qa-review-bl`): audits each `BL-*` invariant **and** each `ECL-<n>.<m>` edge-case section against docs (VirtoOZ) + live (delegating the `{OBSERVED}` axis to `qa-testing-expert`) + source (GitHub MCP), and **auto-applies confirmed changes** to `business-logic.md` / `e-commerce-edge-cases-library.md` (gated by a 3-source evidence bar, body-only; unconfirmed → the axis's proposals file). **Never renumbers a surviving entry** — IDs are a citation contract the suites point at — and **never edits a CSV** (citation remaps belong to `test-management-specialist` via `/qa-review-tests --fix`). See §8/§8a in its definition. |
| **ba-api-specialist** | sonnet | API surface via Postman/Swagger, GitHub module code, live Swagger UI, health assessment |
| **ba-story-writer** | sonnet | Agile user stories with BDD acceptance criteria, DoD, test scenarios |
| **ba-doc-writer** | sonnet | Audience-targeted documentation — **Customer / Admin / Developer / Sales** (per `knowledge/ba/virto-doc-style.md`) + UX improvement specs |

**BA agent tools:**
- All BA agents use **GitHub MCP** to search VirtoCommerce module repos (`org:VirtoCommerce vc-module-*`) and **VirtoOZ MCP** (via `/vc-docs`) to ground terminology/voice
- `ba-system-analyzer` and `ba-api-specialist` use browsers for live UI analysis (see assignments below)
- `ba-story-writer` consumes other agents' output (no browser/GitHub); `ba-doc-writer` uses a browser **only** to capture real screenshots for Customer/Admin docs
- **Documentation audiences:** `ba-doc-writer` writes for four audiences — Customer (StorefrontUserGuide style), Admin (PlatformUserGuide style), Developer (PlatformDeveloperGuide style), and **Sales** (virtocommerce.com benefit-led marketing). Invoked via `/ba-analyze docs [audience]`. Virto's customers/partners are B2B enterprise organizations — see `reference_virto_customer_base` memory.

## Developers Team (4 agents + shared-instructions)

The **only write-capable team** — clone / branch / commit / push / open PR on external VirtoCommerce
product repos via local `git`/`gh`. QA agents stay read-only on GitHub; write scope is isolated here.
Driven by `/qa-fix` (interactive twin of `ci/run-fix-cycle.ts`), reusing `ci/config/fix-repos.json` +
`ci/lib/repo-router.ts` + `ci/lib/module-registry.ts`. One developer + one reviewer **per repo kind**,
picked by the routed repo's `kind`. Gate ladder + no-auto-merge: `.claude/rules/quality-gates.md`.

| Agent | Model | Purpose |
|-------|-------|---------|
| **fullstack-backend** | opus | Fixes ONE `vc-module-*` / `vc-platform` repo (.NET 10 / C# + the module's Admin SPA Angular). Reproduce-as-test → minimal fix → open PR. Interactive twin of `ci/agents/fix-backend-agent.md`. Skills: `/dotnet-unit-test`, `/dotnet-fix`, `/angular-admin`. |
| **backend-reviewer** | opus | Gate-4 reviewer of the C#/Angular local diff before the PR: single-repo, no test edits, no breaking changes, BL-* preserved, minimal & idiomatic. |
| **fullstack-frontend** | opus | Fixes the `vc-frontend` storefront (Vue 3 / TS / Vite + in-repo UI kit + Storybook), **and** a `module` repo's declared embedded frontend sub-app on the same stack (e.g. `vc-module-pagebuilder`'s `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`), scoped to the sub-app path within that module's single-repo checkout. Reproduce-as-vitest-test (or, for a module sub-app, its own `tsx --test`/ephemeral harness) → minimal fix → open PR. Interactive twin of `ci/agents/fix-frontend-agent.md`. Skills: `/vue-unit-test`, `/vue-fix` (`/storybook-test` optional), `/vc-shell-fix` (module-embedded sub-app). |
| **frontend-reviewer** | opus | Gate-4 reviewer of the Vue/TS local diff before the PR: single-repo (or single-sub-app scope for a module-embedded fix), no test/story edits, no leaked scratch-harness tooling, no breaking prop/event/slot or GraphQL contract, BL-UI preserved, minimal & idiomatic. |

**Developer team tools & constraints:**
- **No browser.** Code only; E2E verification (Gate 6) is delegated back to `qa-backend-expert` / `qa-frontend-expert` via `/qa-regression`.
- Write via local **Bash** `git`/`gh` + **Write/Edit** in `.fix-workspace/` (gitignored). Branch `claude/qa-autofix/VCST-XXXX`.
- **FORBIDDEN:** `merge_pull_request` / `gh pr merge` (denied in `settings.local.json`; never auto-merge).
- Single repo per run; cross-module / breaking change / no-test-harness → STOP + hand off.

## Parallel Execution — Browser Assignments

Each agent MUST use its own separate browser session. Agents sharing a browser will interfere with each other (navigation, cookies, state).

> **⚠️ `playwright-firefox` CANNOT CLICK on this storefront or the AngularJS Admin SPA.** `browser_click`
> resolves the element and then times out on Playwright's *"visible, enabled and stable"* actionability
> gate — on fully-visible, non-moving elements (verified NOT a layout/CLS bug: CLS=0, fixed bounding box).
> `browser_type` and navigation work fine; it is **clicking specifically** that fails.
> **Rule: never schedule a click-driven suite on firefox** — cart, checkout, merge, PDP interaction,
> sign-in, or **any** Admin SPA suite. If both Chromium slots are busy, **QUEUE** for the next free
> chrome/edge slot; a firefox placement costs a *whole wasted attempt*, not a degraded one.
> Firefox remains fine for read-only / navigation-light passes.
>
> Confirmed independently **6×** — 2026-06-01, 06-24 (whole Admin SPA), 07-25, 07-27 ×2, and 2026-08-05
> (`REG-2026-08-05-1942` attempt 1 lost suite 002 to it). `config/test-suites.json`
> `defaults.fallbackChain` was reordered to **chrome → edge → firefox** on 2026-08-05 because firefox sat
> *second*, so any suite whose first attempt failed fell straight onto the one lane that cannot click.
> **Root cause is in the `@playwright/mcp` layer, not Firefox/Playwright** — raw `playwright-core` +
> firefox clicks the same reproducer fine headed *and* headless, with and without the MCP's
> `recordHar`/viewport/locale context options (probed 2026-08-05); a browser-revision re-install was
> tried and did **not** fix it. Detail: `feedback_firefox_cart_dropdown_quirk` memory.

### QA Team Browsers
| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | |
| **ui-ux-expert** | `Chrome DevTools MCP` | (no webkit on Windows) |
| **test-management-specialist** | `playwright-chrome` (sequential, not parallel with frontend) | |
| **test-data-engineer** | none — authors AND runs seeders live (Node + Platform-API); delegates only browser-based storefront/suite verification to qa-backend/frontend-expert | |

### BA Team Browsers
| Agent | Playwright MCP Server | Purpose |
|-------|----------------------|---------|
| **ba-system-analyzer** | `playwright-firefox` | Storefront + admin UI exploration; BL-audit live axis (delegates `{OBSERVED}` confirmation to `qa-testing-expert`, also firefox — schedule sequentially, never in parallel on the same server) |
| **ba-api-specialist** | `playwright-edge` | Swagger UI browsing |

**Important:** BA browsers should NOT run in parallel with QA browsers on the same server. When BA and QA agents run simultaneously, schedule them on different browser slots. Max 3 concurrent browser agents total (QA + BA combined). Never use WebKit on Windows.

## Agent Delegation

- When delegating to sub-agents/specialist agents, verify the agent has the required tool permissions BEFORE dispatching.
- If a delegated agent fails with an internal error (e.g., classifyHandoffIfNeeded), immediately fall back to working directly rather than retrying the same broken delegation.
- For multi-suite regression runs, plan for rate limits: batch in groups of 3 (matching browser pool slots) rather than launching all simultaneously.
