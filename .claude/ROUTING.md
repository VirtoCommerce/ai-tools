# Routing Guide — When to Use What

Quick decision tree for the project-scoped `vc-qa` surface under `.claude/` — **31 commands, 41 skills,
17 agents**, auto-discovered in this repo with no plugin manifest.

**Standing up a deployment?** `/project-init` → `/qa-env-check` → `/qa-smoke`.
**New to the repo, already configured?** `/qa-onboarding` → `/qa-env-check` → `/qa-smoke`.

> This file is an INDEX, not a contract. Where a decision has a single source of truth, it is named
> in §Single Sources of Truth below — read that file, don't re-derive the rule from this table.

## By Action

| I want to... | Use | Type |
|--------------|-----|------|
| **Stand the tooling up on a new machine / customer** | `/project-init` (`--check` to reconcile + verify) | Command |
| **Onboard as a new user** | `/qa-onboarding [env\|smoke\|tour\|troubleshoot]` | Command |
| **Check environment health** | `/qa-env-check [vars\|endpoints\|mcp\|env]` | Command |
| **See QA dashboard** | `/qa-status [run\|jira\|env]` | Command |
| **Run smoke tests** | `/qa-smoke [storefront\|admin]` | Command |
| **Run regression suites** | `/qa-regression [smoke\|critical\|sprint\|full\|frontend\|backend\|IDs] [--cases <tier>] [--also-ids <ids>] [--no-plan]` | Command |
| **Triage a finished regression run's failures** | `/qa-triage-results [RUN_ID\|latest] [--fix] [--verify]` | Command |
| **Test a ticket / feature / PR** | `/qa-test <ticket-key> \| feature \| PR #N \| --epic <KEY> [--iterate]` | Command |
| **Run an exploratory session** | `/qa-exploratory [sprint\|sprint:XX-YY\|checkout\|catalog\|B2B\|mobile\|new]` | Command |
| **File or investigate a bug** | `/qa-bug description \| <ticket-key> \| screenshot` | Command |
| **Autonomously fix a filed bug** | `/qa-fix VCST-XXXX` | Command |
| **Verify a bug fix** | `/qa-verify-fix VCST-XXXX` | Command |
| **Deploy a PR's prerelease artifacts to a test env** | `/qa-deploy-pr <ticket-key> [--apply] [--verify]` | Command |
| **Check a stable bundle for missed hotfixes** | `/qa-bundle-check vN \| <package.json-url>` | Command |
| **Release a hotfix into stable bundles** | `/qa-hotfix VCST-XXXX [bundles] [--dry-run]` | Command |
| **Deliver a released hotfix onto the deployed envs** | `/qa-hotfix-check VCST-XXXX [--envs=…] [--dry-run]` | Command |
| **Monitor live errors (App Insights)** | `/qa-monitoring [frontend\|backend\|both] [--since=MIN] [--dry-run]` | Command |
| **Measure backend work per request / prove a perf change** | `/qa-perf-measure <ticket-key> \| <surface> [--ab a:b] [--scale] [--load]` | Command |
| **Audit component/page design + UX + design spec** | `/qa-design component \| page \| flow [--storefront-only] [--design <project>]` | Command |
| **Spin up a local VC stack** | `/qa-local-env [VCST-XXXX] [postgres\|mysql\|sqlserver]` | Command |
| **Full test-case lifecycle (sync → … → promote)** | `/qa-test-lifecycle suite <ID> \| domain <name> \| PR #NNN \| module <name> \| diff [--promote-only]` | Command |
| **Build a sprint test plan** | `/qa-test-plan SprintXX-YY \| current \| last` | Command |
| **Generate coverage at scale** | `/qa-coverage-generation [p0\|p1\|full\|domain <name>\|sprint\|ci-dry-run]` | Command |
| **Seed / teardown test data** | `/qa-seed-data [bootstrap\|minimal\|catalog\|b2b\|pricing\|inventory\|loyalty\|promotions\|bopis\|configurable\|users\|full\|teardown]` | Command |
| **Audit an oracle (BL / ECL) against docs+live+source** | `/qa-review-oracles [bl\|ecl\|all] <scope> [--dry-run]` (alias `/qa-review-bl`) | Command |
| **Refresh the storefront sitemap knowledge file** | `/qa-sitemap [--check] [--no-browser]` | Command |
| **Review THIS repo's own code diff** | `/code-review-full [branch \| SHA \| PR \| path]` | Command |
| **Self-diagnose the plugin from session telemetry** | `/vc-self-check [latest \| <session-id>] \| deliver` | Command |
| **Run business analysis** | `/ba-analyze [full\|flows\|api\|docs\|stories\|ui\|module <name>]` | Command |
| **Generate user stories** | `/ba-stories feature name \| VCST-XXXX` | Command |
| **Get a test checklist for a domain** | `/qa-checklist domain \| feature \| new <domain> \| admin <module>` | Skill |
| **Generate test cases** | `/qa-test-cases-generator VCST-XXXX \| domain \| suite ID \| migrate <suite>` | Skill |
| **Design the test-data combinations a feature needs** | `/qa-generate-data <feature \| flow \| VCST-XXXX>` | Skill |
| **Analyze test coverage gaps** | `/qa-coverage-gap analyze \| generate \| validate \| full \| domain <name> \| suite <ID>` | Skill |
| **Review test-case quality / triangulate staleness** | `/qa-review-tests suite <ID> \| file <path> \| diff \| --triangulate \| --fix` | Skill |
| **Create Postman collections** | `/qa-postman create <purpose> \| env <profile> \| verify <collection>` | Skill |
| **Look up VC documentation** | `/vc-docs topic \| module \| concept` | Skill |
| **Build / smoke-test this repo's own tooling** | `/run-vc-mcp-testing-module` | Skill |

> `/qa-sync-tests` was **removed** — the command file is deleted and there is no redirect or alias.
> Use `/qa-test-lifecycle PR #NNN \| module <name> \| diff` instead.

## By Category

### Run Tests (Commands — execute immediately)
- `/qa-smoke` — Daily smoke (P0 set, GO/NO-GO verdict)
- `/qa-test` — Test a ticket, feature or PR. Step `1a` routes on **two axes**: the FLOW by ticket type × status (fix-ready Bug → `/qa-verify-fix` inline; hotfix-status Bug → `/qa-hotfix-check`; Sub-task → inherit parent; else `feature-test`), then a **FAST** (checklist-only) or **FULL** (Test Model + authoring + verifiers + promotion) path. The command is the orchestration shell; the `/qa-test` **skill** holds the methodology
- `/qa-regression` — Run suites in parallel. `sprint` resolves the most recent sprint plan → `suitesActivated[]`; `--cases critical` narrows to a priority tier within each suite
- `/qa-triage-results` — Classify a completed run's FAIL/BLOCKED/SKIPPED into real bug vs test defect vs flaky/env; live-verify, route test fixes, draft bugs. Never files a ticket, never triggers `/qa-fix`
- `/qa-exploratory` — Scenario-discovery session. `sprint` runs the plan's §5.3 charters (≤5, in series). Lane is chrome/edge — never firefox
- `/qa-bug` — Reproduce, document, optionally file
- `/qa-fix` — Autonomous fix of an already-filed bug: G0 triage → G1 single-repo route → reproduce-as-test → minimal fix → review → PR → **STOP for human review** (never auto-merges). Interactive twin of `ci/run-fix-cycle.ts`
- `/qa-verify-fix` — Reproduce the original bug, confirm the fix, regression checks, transition the ticket (stops at TESTED)
- `/qa-deploy-pr` — Gather every fresh CI prerelease artifact a change produced and deploy them together in ONE `vc-deploy-dev` manifest update. Unblocks `/qa-test PR #N` and `/qa-verify-fix`
- `/qa-bundle-check` → `/qa-hotfix` → `/qa-hotfix-check` — the three-link hotfix chain: find bundles missing a shipped patch → cherry-pick onto `support/<X.Y>` and release → deliver onto the deployed envs and close the ticket
- `/qa-monitoring` — App Insights: query → dedup by fingerprint → triage → live repro → report. Detect-and-report only. Interactive twin of `ci/run-monitor.ts`
- `/qa-perf-measure` — Backend work per request on a **deployed** env (dependency counts via the `operation_Id` join, N+1 by input scaling, paired controls). Measure-and-report only
- `/qa-local-env` — Local VC stack (start-local + Docker) pinned to the deployed manifest; fresh DB every run

### Plan & Manage Test Cases (Commands + Skills)
- `/qa-test-lifecycle` — Unified pipeline: scope → sync stale → analyze gaps → generate → review → fix → verify → approve → **promote** (Phase 6P is the promoter for handoff / re-promotion / non-`/qa-test` sources)
- `/qa-test-plan` — Sprint plan from tracker Done + merged vc-frontend PRs; risk-scores domains, maps to suites, derives §5.2 gaps and §5.3 exploratory charters
- `/qa-coverage-generation` — Orchestrated parallel coverage generation across domain batches
- `/qa-plan` — Test plans from the E2E scenario catalog
- `/qa-checklist` — Oracle-grounded test-writing checklists (storefront + backend/admin + GraphQL domains)
- `/qa-test-design` — Derivation techniques. **`FLOW` runs FIRST** on any state-changing feature (model the value chain; the parameter-space techniques EP/BVA/DT/ST/PW/CT/EG only refine a link FLOW has already named)
- `/qa-test-cases-generator` — Agent-native enriched-CSV cases from tickets, features, checklists or legacy suites
- `/qa-risk` — Risk-based prioritization (5×5 matrix)
- `/qa-sbtm` — SBTM charters, heuristics, tours, debrief, sprint charter selection
- `/qa-coverage-gap` — Autonomous gap analysis + generation (4-cycle pipeline)
- `/qa-review-tests` — 11-dimension quality review; `--triangulate` (Dim 11) checks whether a provenance tag is *true*, not merely present
- `/qa-test` (skill) — the methodology behind the `/qa-test` command: `test-model.md`, `authoring.md`, `close-out.md`, `modes.md`

### Test Data (Skills)
- `/qa-generate-data` — Design the cross-entity combinations a feature needs, reuse fixtures that already cover a case, author only the gaps + `@td()` aliases (offline)
- `/qa-seed-data` — Seed / teardown via repo seed scripts (`npm run seed*`) or Postman MCP
- `/qa-postman` — Postman MCP collections: create, configure, verify, export (Newman/Postman CLI executes, not MCP)

### QA Methodology (Skills — process frameworks)
- `/qa-process` — ISTQB 7-phase lifecycle
- `/qa-investigate` — Bug investigation + evidence-to-claim root-cause worksheet
- `/qa-defect` — Defect lifecycle, Bug workflow
- `/qa-evidence` — Evidence capture & report formatting, output paths
- `/qa-metrics` — Quality metrics & gate enforcement
- `/qa-review-oracles` — Two-axis oracle audit (`bl` → `business-logic.md`, `ecl` → `e-commerce-edge-cases-library.md`): triangulate against docs + live + source, auto-apply confirmed, route the rest to proposals. **Value gates GROWTH only**, never a correction

### Specialized Testing (Skills — domain expertise)
- `/qa-storybook` — Visual regression, responsive breakpoints, state variations
- `/qa-accessibility` — WCAG 2.2 AA audits (POUR + the 2.2 additions, axe-core, Lighthouse, keyboard walk)
- `/qa-design` — Dual Storybook + Storefront BL-UI audit, design-system consistency, UX heuristics, and the **`vs. DESIGN` axis** (tokens / control geometry / icon name→glyph parity vs a Claude Design project via `DesignSync`; reports `SKIPPED`, never PASS, where `/design-login` is unavailable)
- `/qa-api` — REST + GraphQL xAPI: reference lookup, execution, case generation
- `/qa-perf-measure`, `/qa-monitoring`, `/qa-triage-results`, `/qa-deploy-pr`, `/qa-hotfix`, `/qa-hotfix-check`, `/qa-bundle-check`, `/qa-local-env` — the skills backing the same-named commands above

### Development (Skills — used by the `developers/` team in `/qa-fix`)
- `/dotnet-unit-test` — Reproduce a backend bug as a failing xUnit test (red → green)
- `/dotnet-fix` — Minimal, idiomatic .NET 10 fix in one VC module
- `/angular-admin` — Fix a module's Admin SPA (AngularJS) UI; scratch harness for logic, visual render harness + numeric geometry for layout/CSS
- `/vue-unit-test` — Reproduce a vc-frontend bug as a failing vitest test (red → green)
- `/vue-fix` — Minimal, idiomatic Vue 3 / TS fix in vc-frontend
- `/vc-shell-fix` — Fix a module-embedded Vue 3 shell sub-app (declared in `moduleFrontendSubApps`); the sub-app's own `tsx --test` for state/logic, an ephemeral never-committed vitest harness for DOM

### Tooling & Diagnostics
- `/project-init` — Onboard onto a deployment: tracker + code host + auth per axis, derive client-vs-platform, write `project-profile.json` / `.env.<env>` / `.mcp.json`, verify access
- `/vc-self-check` — Read this session's telemetry + transcript against `.claude/knowledge/diagnostics/skill-expectations.md`; per-finding verdict + severity; `deliver` contributes a consent-gated GitHub Issue upstream
- `/run-vc-mcp-testing-module` — Build / launch / smoke-test this repo's own tooling
- `/code-review-full` — 9 parallel review agents over a diff **of this repo** — not a QA flow against the VC platform

### VC Knowledge (Skill — auto-invocable)
- `/vc-docs` — Documentation lookup. **Primary: VirtoOZ MCP** (12 topic-scoped tools); Context7 `/virtocommerce/vc-docs` is the fallback

### Agents (use directly for complex multi-step work)

**QA Team (9 agents + shared-instructions):**
- `qa-lead-orchestrator` — Coordinates testing, go/no-go. **Also the independent per-step verifier** in `/qa-test` (§Verifier Mode — a fresh instance, never the step's own doer)
- `qa-frontend-expert` — Storefront, checkout, mobile, cross-browser
- `qa-backend-expert` — APIs, GraphQL xAPI, Admin SPA, background jobs
- `qa-testing-expert` — Interactive testing, Claude Design spec comparison, debugging
- `test-management-specialist` — Test planning, case writing, coverage
- `test-data-engineer` — Owns test data end-to-end: designs combinations, **authors** the seeders / fixtures / `@td()` aliases / validators **and runs them live** (no browser)
- `ui-ux-expert` — Storybook, WCAG 2.2 AA, design system, the `vs. DESIGN` axis
- `regression-orchestrator` — Parallel regression, retries, consolidated reports
- `test-runner-agent` — Parameterized suite runner (spawned by regression-orchestrator)

**BA Team (4 agents + shared-instructions):**
- `ba-system-analyzer` — Repo structure, module inventory, user flows, pain points; **sole writer of both shared oracles**
- `ba-api-specialist` — API surface via Postman/Swagger, health assessment
- `ba-story-writer` — Agile user stories with BDD acceptance criteria
- `ba-doc-writer` — Audience-targeted docs (Customer / Admin / Developer / Sales)

**Developers Team (4 agents — the only write-capable team, used by `/qa-fix`; one dev + one reviewer per repo kind):**
- `fullstack-backend` — One `vc-module-*` / `vc-platform` repo (.NET 10 + the module's Admin Angular): reproduce-as-test → minimal fix → PR
- `backend-reviewer` — Gate-4 reviewer of the C#/Angular diff before the PR
- `fullstack-frontend` — `vc-frontend`, **and** a module's declared embedded Vue 3 sub-app: reproduce-as-test → minimal fix → PR
- `frontend-reviewer` — Gate-4 reviewer of the Vue/TS diff before the PR

Browser lane assignments and the firefox-cannot-click rule: `.claude/rules/agents.md`.

### Knowledge Base (shared agent references in `.claude/knowledge/`)
- **`api/`** — `api-auth.md`, `graphiql-interaction.md`, `graphql-schema.md`, `graphql-test-cases-runner.md`, `order-creation-matrix.md`, `platform-patterns.md`
- **`architecture/`** — `vc-frontend-architecture.md`, `vc-module-architecture.md`
- **`automation/`** — `browser-quirks.md`, `storefront-config-flags.md`, `storefront-selectors.md`
- **`ba/`** — `virto-doc-style.md`
- **`diagnostics/`** — `skill-expectations.md`
- **`domain/`** — `catalog.md`, `products.md`, `sitemap.md`, `store-settings.md`, `white-labeling.md`
- **`execution/`** — `debugging-signals.md`, `es-call-ab-method.md`, `live-discovery.md`, `module-suite-map.md`, `performance-thresholds.md`, `test-data-authoring.md`, `test-execution-preflight.md`, `test-runner-tags.md`, `ticket-routing.md`, `tracker-ops.md`
- **`oracles/`** — `business-logic.md` (BL-*), `critical-ui-scope.md`, `e-commerce-edge-cases-library.md` (ECL-*), `vc-bug-catalog.md` (VC-* archetypes)
- **`agents/`** — per-team `shared-instructions.md` + `README.md` (a plain reference dir, not scanned as components)

Also: `.claude/architecture/TIER.md` (A/B/C/D classification — read before any standardization or
cross-product-reuse change) and `.claude/templates/` (`test-model.md`, `qa-test-summary.schema.json`,
`agent-dispatch.md`).

### Plugins (distributed separately — NOT part of this `.claude/` surface)
- **`vc-fix`** (`plugins/vc-fix/`) — the bug-lifecycle slice shipped to teammates/customers via the `vc-tools` marketplace: `/project-init`, `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-monitoring`, `/vc-self-check`, `/vc-feedback`. Self-contained; the canonical copy of the self-diagnostics subsystem
- **`vc-perf`** (`plugins/vc-perf/`) — the three-layer performance loop (`/perf-init`, `/perf-benchmark`, `/perf-loop`, `/perf-fix`, `/perf-verify`). Depends on `vc-fix`; advisory only, never a CI gate

## Single Sources of Truth (read these, don't re-derive)

| Decision | Lives at |
|---|---|
| Which **flow** a tracker item takes (type × status) | `.claude/knowledge/execution/ticket-routing.md` |
| The bug auto-fix **gate ladder** G0–G7, no-auto-merge, client-code containment | `.claude/rules/quality-gates.md` |
| Which **repo / tracker / host** a fix delivers to | `ci/lib/repo-router.ts` + `ci/config/fix-repos.json` (+ `project-profile.json`) |
| Tracker/host-agnostic ops (resolve / comment / transition / PR) | `.claude/knowledge/execution/tracker-ops.md` |
| Which **suites** a change needs | `npm run regression:select` (`scripts/lib/suite-selection.ts`) |
| Which **lane** a case runs on | `scripts/lib/case-classifier.ts` (via `npm run suites:lanes`) |
| Report categories, size caps, what stays terminal-only | `.claude/rules/reports.md` |
| Testing modes, suite manifest, selection groups | `.claude/rules/regression.md` |
| Agents, browser assignments, delegation rules | `.claude/rules/agents.md` |
| Full command + skill argument reference | `.claude/rules/skills-commands.md` |
| Test-data resolution + the no-hardcode GOLDEN RULE | `.claude/rules/test-data.md` |

## Cross-References

| Command | Related | Notes |
|---------|---------|-------|
| `/qa-exploratory` | `/qa-sbtm` | Command runs sessions; skill provides the methodology + the sprint charter-selection rule |
| `/qa-smoke` | `/qa-plan` | Smoke uses the E2E scenario catalog for P0 selection |
| `/qa-regression` | `/qa-triage-results`, `/qa-metrics` | Run → triage the failures → results feed the quality gates |
| `/qa-regression` | `/qa-coverage-gap` | Gap analysis validates suite completeness before a run |
| `/qa-bug` | `/qa-investigate`, `/qa-defect` | Bug command uses the investigation flow + defect templates |
| `/qa-fix` | `/qa-bug` (upstream), `/qa-verify-fix` (downstream) | `/qa-bug` files the ticket → `/qa-fix` triages, fixes, opens a PR (STOP for human review) → after merge `/qa-verify-fix` closes the loop. Gate ladder: `.claude/rules/quality-gates.md` |
| `/qa-fix` | `/qa-deploy-pr` | A PR's prerelease has to be deployed before `/qa-test PR #N` or `/qa-verify-fix` can see the change |
| `/qa-fix` | `/qa-bundle-check` → `/qa-hotfix` → `/qa-hotfix-check` | After a fix ships to master: find the bundles that lack it → cherry-pick + release → deliver onto the deployed envs |
| `/qa-monitoring` | `/qa-bug`, `/qa-fix` | Monitoring drafts confirmed bugs → a human picks them up (monitoring never files a ticket or auto-fixes) |
| `/qa-test` | `/qa-test` skill, `/qa-test-design`, `/qa-checklist`, `/qa-risk` | Command = the pipeline + its gates; skill = the methodology. The FULL path writes a Test Model before any case exists |
| `/qa-test` | `/qa-test-cases-generator`, `/qa-review-tests`, `/qa-generate-data` | Step 3 reuses the same skills `/qa-test-lifecycle` Phases 3–4 use, and appends cases as `Draft` straight into `regression/suites/` |
| `/qa-test` | `/qa-verify-fix`, `/qa-hotfix-check` | Step 1a routes a fix-ready Bug into `/qa-verify-fix` inline and a hotfix-status Bug into `/qa-hotfix-check` |
| `/qa-test-lifecycle` | `/qa-coverage-gap`, `/qa-review-tests` | Unified pipeline: sync + gap analysis + quality review + promotion (Phase 6P) |
| `/qa-test-plan` | `/qa-regression`, `/qa-risk`, `/qa-exploratory` | Plan maps risk-scored domains to suites (§5.1/§5.2) and derives the exploratory charters (§5.3) |
| `/qa-verify-fix` | `/qa-investigate`, `/qa-checklist` | Verification uses the investigation flow + the Bug Fix Verification checklist |
| `/qa-coverage-generation` | `/qa-coverage-gap`, `/qa-test-cases-generator` | Coverage generation uses gap analysis + the case generator |
| `/qa-seed-data` | `/qa-generate-data`, `/qa-test`, `/qa-regression` | Design combinations → seed → run |
| `/qa-review-oracles` | `/qa-review-tests --fix`, `/qa-checklist`, `/qa-exploratory` | The oracle skill never edits a CSV — citation remaps go to `/qa-review-tests`; exploratory feeds it `[THEORETICAL]`→`[OBSERVED]` proposals |
| `/qa-sitemap` | `/qa-test-plan` | Refreshes `.claude/knowledge/domain/sitemap.md`; wired into `/qa-test-plan` Step 0 at per-sprint cadence |
