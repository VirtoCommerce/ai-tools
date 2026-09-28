# Agents Reference

Agents are flat `.claude/agents/*.md` files (`ls` them for the roster), across three teams (QA, BA, Developers). Agent discovery is non-recursive, so agents are NOT nested in team subfolders; the per-team `shared-instructions.md` and the agents README live under `knowledge/agents/` (a plain reference dir, not scanned as components). See `knowledge/agents/README.md` for full documentation. QA agents use a **four-layer prompt architecture** — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints).

Knowledge-base inventory and the read-before-you-write rules (`graphql-schema.md`, `release-ledger.md`, …): [`.claude/ROUTING.md`](../ROUTING.md) §Knowledge bases.

## MCP servers & browser essentials

Project `.mcp.json` (gitignored, per machine): `playwright-chrome` / `playwright-firefox` / `playwright-edge` (`config/mcp-playwright-*.config.json`), `postman`, `github`, `context7`, **`kb`** (the observed-behaviour knowledge base — the ONE server nobody has to register: a tracked `SessionStart` hook merges it in, so it is there after one restart, and `npm run kb:install` is the manual fallback; the rule for WHEN to reach for it is [`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*, and its CLI door needs no server at all); user/IDE level: Chrome DevTools, Azure, Atlassian, Figma, Microsoft Learn, **VirtoOZ** (primary VC docs via `/vc-docs`). Browser login secrets go through Playwright MCP `--secrets .env.playwright.local` — type the **bare key name** (`ORG_USER_PASSWORD`), never `{{VAR}}`: the miss is silent and hook-blocked. **Chrome DevTools MCP has no `--secrets`**; a DevTools brief must name its auth path (persistent profile / mint an account / delegate to a Playwright lane). Full server table, `--secrets` setup and the DevTools auth options: [`knowledge/execution/browser-lanes.md`](../knowledge/execution/browser-lanes.md).

**About to WRITE product behaviour ⇒ ask VirtoOZ first.** Any agent, any task: query VirtoOZ via `/vc-docs` before committing a claim about what the platform or the storefront is *supposed* to do. **The trigger is the write, not whether you feel unsure** — converging evidence does not discharge it. The rule and its 3-source caveat live in [`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*.

**But a doc is authoritative for MECHANISM, not SURFACE** — exact UI strings, control types, layout and counts are `{OBSERVED}`, never `{DOC}` (a user guide paraphrases labels by design); a documented rule binds only to the surface the doc names; and docs contradicting an existing case, suite or knowledge file is a trigger to OBSERVE, never a licence to overwrite it. **Delegation teeth, which is this file's business: a dispatch brief must never instruct a subagent to prefer a doc over the artifact it is about to edit** — the artifact may be the only source written from the screen, and the subagent cannot re-check the brief's premise. Full rule, the enforceable quote test and the measured incident (VCST-5959: a doc-first brief put two nonexistent UI labels into a suite that had them right): [`../knowledge/agents/qa/shared-instructions.md`](../knowledge/agents/qa/shared-instructions.md) §What VirtoOZ is authoritative FOR.

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, isolated contexts, and HAR capture. Video recording was
  removed from all four lane configs 2026-09-21 — do not re-add a `recordVideo` block without also
  restoring the guard in `scripts/unit/playwright-lane-configs.test.mjs`.

## QA Team (+ shared-instructions)

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-lead-orchestrator** | sonnet | Orchestrates testing, delegates to specialists, makes go/no-go decisions. **Sole custodian of ticket STATUS** — a transition is an outward-facing write to a shared board, so no specialist, runner, verifier, doer or sub-agent ever makes one; they report it up (§Status custodian, single source of truth `knowledge/execution/ticket-status-transitions.md`: at most two hops per run — the opening one at `1a` when the `feature-test` route resolves, never confirmed, and the closing one at 5-status, always confirmed, `BLOCKED` transitions nothing but requires a blocker comment, never past `TESTED`, every hop AND skip recorded in `summary.json.status_transitions[]`). **Also serves as the independent per-step verifier in `/qa-test`** (§Verifier Mode): a fresh, gate-scoped instance — never the pipeline's inline orchestrator and never the step's own doer — re-derives evidence from source and returns `APPROVE`/`REJECT`. Delegates any live re-check to a specialist on a **different browser lane** than the doer used. |
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA, background jobs |
| **qa-testing-expert** | opus | Interactive testing - UI verification, Claude Design spec comparison (Figma is a manual fallback only), debugging |
| **test-management-specialist** | sonnet | Test planning, test case writing, coverage tracking, TestRail artifacts. **Sole owner of `/qa-test`'s corpus step (Artifact A)** — ONE dispatch covering BOTH phases: `2a` triages the existing corpus and applies the `REPAIR` edits, *then* the same agent authors only the surviving gaps. Merged 2026-09-11 so the run keeps a single writer on `regression/suites/**` ([`../skills/qa-test/coverage-triage.md`](../skills/qa-test/coverage-triage.md) §2a-own) |
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
**These four agents and their six skills live ONLY in [`plugins/vc-fix/`](../../plugins/vc-fix/) — the `.claude/`
duplicates were removed 2026-09-25 (they had forked; `/qa-fix`, the only caller, is plugin-only).** The table below
is the reference for what each does; `/plugin install vc-fix@vc-tools` is what puts them in the picker.

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

> **`playwright-firefox` is a full click-capable slot (2026-09-08; re-verified live 2026-09-11) — two prerequisites.**
> **(1) The MCP server must have been restarted after `config/mcp-playwright-firefox.config.json`
> gained `widget.windows.window_occlusion_tracking.enabled=false`.** The config is read at server start;
> without the restart this lane still fails exactly as before. **(2) `@playwright/mcp` must stay PINNED
> in `.mcp.json`** — an `@latest` entry swaps the server binary that reads that config.
>
> **Rollback, if clicks time out on this lane again:** check the MCP restart first, then set
> `defaults.firefoxClickOk: false` in `config/test-suites.json` — one line, no code change, and every
> consumer re-denies click-driven suites through `browserDenyListFor` in `ci/lib/suite-manifest.ts`.
> Root cause (dead `requestAnimationFrame` under Windows occlusion tracking vs Playwright's 5-tick stable
> check), the sticky-stall finding, the probe and the run tables:
> [`knowledge/automation/browser-quirks.md`](../knowledge/automation/browser-quirks.md) §Firefox.

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

- **A dispatch brief that sends a specialist to establish PLATFORM BEHAVIOUR must NAME the base and the tool id** — `mcp__kb__kb_ask`, or `npm run kb -- ask "<q>"` — with the coordinate (endpoint, GraphQL op, page path) *in* the question. Unnamed, the specialist works from the live stand instead. This file owns only the DELEGATION half; the rule, the tool surface and why the CLI form costs no search hop are [`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules → *Product context*, and the n=2 measurement behind it is `PLAN.md` §21.1 — **cited, not restated**, because the evidence narrative was 1,274 chars of the always-loaded tier and that tier is re-paid on every turn and every dispatch.
- When delegating to sub-agents/specialist agents, verify the agent has the required tool permissions BEFORE dispatching.
- If a delegated agent fails with an internal error (e.g., classifyHandoffIfNeeded), immediately fall back to working directly rather than retrying the same broken delegation.
- For multi-suite regression runs, plan for rate limits: batch in groups of 3 (matching browser pool slots) rather than launching all simultaneously.
- **Independent operations go out in ONE message; the unit you are saving is a round-trip, not a second.** Deterministic scripts here cost 1–2 s, so batching turns beats optimising script wall-clock by a wide margin. **But parallelism has a measured cost too, so it is a per-case judgment, never a default** — two writers on one suite CSV, two suites on one disposable fixture set, and a verifier beside its own doer each lose work. Reordering something that costs milliseconds to look concurrent is churn. The measured timings, the worked dependency waves and the full never-parallelise table: [`.claude/skills/qa-test/SKILL.md`](../skills/qa-test/SKILL.md) §Concurrency.
