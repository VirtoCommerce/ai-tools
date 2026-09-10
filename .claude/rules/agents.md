# Agents Reference

Agents are flat `.claude/agents/*.md` files (`ls` them for the roster), across three teams (QA, BA, Developers). Agent discovery is non-recursive, so agents are NOT nested in team subfolders; the per-team `shared-instructions.md` and the agents README live under `knowledge/agents/` (a plain reference dir, not scanned as components). See `knowledge/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints).

Knowledge-base inventory and the read-before-you-write rules (`graphql-schema.md`, `release-ledger.md`, …): [`.claude/ROUTING.md`](../ROUTING.md) §Knowledge bases.

## MCP servers & browser essentials

Project `.mcp.json` (gitignored, per machine): `playwright-chrome` / `playwright-firefox` / `playwright-edge` (`config/mcp-playwright-*.config.json`), `postman`, `github`, `context7`; user/IDE level: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ** (primary VC docs via `/vc-docs`). Browser login secrets go through Playwright MCP `--secrets .env.playwright.local` — type the **bare key name** (`ORG_USER_PASSWORD`), never `{{VAR}}`: the miss is silent and hook-blocked. **Chrome DevTools MCP has no `--secrets`**; a DevTools brief must name its auth path (persistent profile / mint an account / delegate to a Playwright lane). Full server table, `--secrets` setup and the DevTools auth options: [`knowledge/execution/browser-lanes.md`](../knowledge/execution/browser-lanes.md).

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, HAR capture enabled, video on failure, isolated contexts.

## QA Team (+ shared-instructions)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, makes go/no-go decisions. **Sole custodian of ticket STATUS** — a transition is an outward-facing write to a shared board, so no specialist, runner, verifier, doer or sub-agent ever makes one; they report it up (§Status custodian, single source of truth `knowledge/execution/ticket-status-transitions.md`: at most two hops per run — the opening one at `1a` when the `feature-test` route resolves, never confirmed, and the closing one at 5f, always confirmed, `BLOCKED` transitions nothing but requires a blocker comment, never past `TESTED`, every hop AND skip recorded in `summary.json.status_transitions[]`). **Also serves as the independent per-step verifier in `/qa-test`** (§Verifier Mode): a fresh, gate-scoped instance — never the pipeline's inline orchestrator and never the step's own doer — re-derives evidence from source and returns `APPROVE`/`REJECT`. Delegates any live re-check to a specialist on a **different browser lane** than the doer used. |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Claude Design spec comparison (Figma is a manual fallback only), debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts |
| **test-data-engineer** | opus | Owns test-data end-to-end: designs cross-entity combinations, **authors** the seeders / fixtures / `@td()` aliases / drift-guard validators + their unit tests, **AND RUNS them live** — real seed/teardown against a non-prod env + `td:reconcile` (Node + Platform-API, no browser) (`/qa-generate-data` + `/qa-seed-data`). Write-capable in THIS repo only (`scripts/seed-data/`, `test-data/`); no external repos. Canonical owner — `test-management-specialist` delegates fixture authoring here; `qa-backend/frontend-expert` do only the **browser** confirmation (storefront/Admin-SPA render + suite run) the engineer can't. See `knowledge/execution/test-data-authoring.md`. |
| **ui-ux-expert** | sonnet | Storybook component testing, WCAG 2.2 AA accessibility, design system, and the **`vs. DESIGN` axis** — diffing declared tokens / control geometry / icon name→glyph parity against a Claude Design project (`DesignSync` → `scripts/lib/verify-design-spec.ts`, methodology `skills/qa-design/claude-design-verification.md`). Runs by default against the project **the ticket's own Prototype link names** (no global default — `DESIGN_SYSTEM_PROJECT_ID` removed 2026-09-03; no design link ⇒ `SKIPPED`); precedence `BL-UI invariant > design spec > UX heuristic`; reports `SKIPPED`, never PASS, where `/design-consent` is unavailable (web sessions, CI), and `KNOWN_DIVERGENCE` — advisory, never filed — for a mismatch the spec itself declares unshipped |
| **regression-orchestrator** | sonnet | Parallel regression + smoke mode, retries, browser fallback, consolidated reports |
| **test-runner-agent** | sonnet | Parameterized template for standard suite execution — runs a bounded batch of suites on one slot (used by regression-orchestrator) |

## BA Team (+ shared-instructions)

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

## Developers Team (+ shared-instructions)

The **only write-capable team** — clone / branch / commit / push / open PR on external VirtoCommerce
product repos via local `git`/`gh`. QA agents stay read-only on GitHub; write scope is isolated here.
Driven by `/qa-fix` (interactive twin of `ci/run-fix-cycle.ts`), reusing `ci/config/fix-repos.json` +
`ci/lib/repo-router.ts` + `ci/lib/module-registry.ts`. One developer + one reviewer **per repo kind**,
picked by the routed repo's `kind`. Gate ladder + no-auto-merge: `.claude/knowledge/execution/quality-gates.md`.

| Agent | Model | Purpose |
|-------|-------|---------|
| **fullstack-backend** | opus | Fixes ONE `vc-module-*` / `vc-platform` repo (.NET 10 / C# + the module's Admin SPA Angular). Reproduce-as-test → minimal fix → open PR. Interactive twin of `ci/agents/fix-backend-agent.md`. Skills: `/dotnet-unit-test`, `/dotnet-fix`, `/angular-admin`. |
| **backend-reviewer** | sonnet | Gate-4 reviewer of the C#/Angular local diff before the PR: single-repo, no test edits, no breaking changes, BL-* preserved, minimal & idiomatic. |
| **fullstack-frontend** | opus | Fixes the `vc-frontend` storefront (Vue 3 / TS / Vite + in-repo UI kit + Storybook), **and** a `module` repo's declared embedded frontend sub-app on the same stack (e.g. `vc-module-pagebuilder`'s `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`), scoped to the sub-app path within that module's single-repo checkout. Reproduce-as-vitest-test (or, for a module sub-app, its own `tsx --test`/ephemeral harness) → minimal fix → open PR. Interactive twin of `ci/agents/fix-frontend-agent.md`. Skills: `/vue-unit-test`, `/vue-fix` (`/storybook-test` optional), `/vc-shell-fix` (module-embedded sub-app). |
| **frontend-reviewer** | sonnet | Gate-4 reviewer of the Vue/TS local diff before the PR: single-repo (or single-sub-app scope for a module-embedded fix), no test/story edits, no leaked scratch-harness tooling, no breaking prop/event/slot or GraphQL contract, BL-UI preserved, minimal & idiomatic. |

**Developer team tools & constraints:**
- **No browser.** Code only; E2E verification (Gate 6) is delegated back to `qa-backend-expert` / `qa-frontend-expert` via `/qa-regression`.
- Write via local **Bash** `git`/`gh` + **Write/Edit** in `.fix-workspace/` (gitignored). Branch `claude/qa-autofix/VCST-XXXX`.
- **FORBIDDEN:** `merge_pull_request` / `gh pr merge` (denied in `settings.local.json`; never auto-merge).
- Single repo per run; cross-module / breaking change / no-test-harness → STOP + hand off.

## Parallel Execution — Browser Assignments

Each agent MUST use its own separate browser session. Agents sharing a browser will interfere with each other (navigation, cookies, state).

> **`playwright-firefox` is a full click-capable slot again (2026-09-08) — one prerequisite.** For most of
> 2026 it was not: `browser_click` resolved the element and then timed out on Playwright's *"visible,
> enabled and stable"* gate on fully-visible, non-moving elements, confirmed 6× (2026-06-01 → 2026-08-05),
> while `browser_type` and navigation worked. **Root cause:** a fully covered firefox window stops
> `requestAnimationFrame` (Windows occlusion tracking) and Playwright's stable check needs **5 consecutive
> rAF ticks** on Windows + Firefox — 1 everywhere else — so it never completes. Measured: 15 of 15 failing
> attempts had a dead rAF, 0 passing ones did. The stall is **sticky** (the driver does not restart when
> the window is uncovered), which is why one covered moment poisoned a whole session.
>
> **PREREQUISITE — the MCP server must have been restarted after `config/mcp-playwright-firefox.config.json`
> gained `widget.windows.window_occlusion_tracking.enabled=false`.** The config is read at server start;
> without the restart this lane still fails exactly as before.
>
> **Rollback, if clicks time out on this lane again:** check the MCP restart first, then set
> `defaults.firefoxClickOk: false` in `config/test-suites.json` — one line, no code change, and every
> consumer (`regression:plan`, `ci/run-regression.ts`, `regression:select`) re-denies click-driven suites
> through `browserDenyListFor` in `ci/lib/suite-manifest.ts`. Evidence, the probe and the run tables:
> `knowledge/automation/browser-quirks.md` §Firefox.

### QA Team Browsers
| Agent | Playwright MCP Server | Alternative |
|-------|----------------------|-------------|
| **qa-frontend-expert** | `playwright-chrome` | |
| **qa-backend-expert** | `playwright-edge` | or `Chrome DevTools MCP` for Admin SPA |
| **qa-testing-expert** | `playwright-firefox` | click-capable again since 2026-09-08 — see the box above for the one prerequisite and the rollback |
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
- **Independent operations go out in ONE message; the unit you are saving is a round-trip, not a second.** A numbered list of independent probes/scripts walked one tool call per turn spends a full model turn per item — measured in `/qa-test` `1b`, seven independent probes totalling ~3 s of work were costing seven turns. Every deterministic script in this repo runs in 1–2 s (the one exception is live GraphQL introspection at ~8.5 s), so batching turns beats optimising script wall-clock by a wide margin. **But parallelism here has a measured cost too, so it is a per-case judgment, never a default:** two writers on one suite CSV take the corpus gate down for every author in the tree (`.claude/rules/regression.md` §Suite inventory), two suites on one disposable fixture set silently eat each other's data (`.claude/knowledge/execution/test-data-authoring.md` §The scope of "isolated" — 5 of 34 cases lost), and a verifier run beside its own doer verifies a half-finished step. Reordering something that costs milliseconds to look concurrent is churn. Worked dependency waves + the full never-parallelise table: `.claude/skills/qa-test/SKILL.md` §Concurrency.
