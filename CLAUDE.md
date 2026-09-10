# CLAUDE.md

## Project Overview

**Agentic QA system** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools) — LLM-powered browser automation, NOT traditional `.spec.js` files. Prompt templates live in `vc/shared/docs/prompts/`.

This repo hosts the **`vc-tools` Claude Code marketplace** (`.claude-plugin/marketplace.json`), which distributes **two plugins**. The first is **`vc-fix`** (`plugins/vc-fix/`) — the bug-lifecycle slice: `/project-init`, `/qa-bug`, `/qa-fix` (+ its `fullstack-backend`/`fullstack-frontend`/`backend-reviewer`/`frontend-reviewer` dev team), `/qa-verify-fix`, `/qa-monitoring` (+ `monitor-triage-agent`), and `/vc-self-check` (the self-diagnostics subsystem — see below) + `/vc-feedback` (`ls plugins/vc-fix/{agents,skills,commands}` for the live counts). Teammates/customers add the marketplace with `/plugin marketplace add VirtoCommerce/vc-mcp-testing-module`, install via `/plugin install vc-fix@vc-tools`. `vc-fix` is **fully self-contained, not repo-coupled** — its own `plugins/vc-fix/knowledge/`, `.claude/rules/`, `config.js`, `scripts/lib/`, `package.json` etc. are duplicated from the repo root, not referenced in place. This is deliberate: Claude Code doesn't document a reliable way for a plugin's commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no `${CLAUDE_PLUGIN_ROOT}`-equivalent; paths resolve against the *user's* CWD, which may be an unrelated project) — see `plugins/vc-fix/skills/qa-fix-routing/SKILL.md` for the finding. `qa-fix-routing/` additionally resolves its own data-file paths (`fix-repos.json`, `.module-registry.cache.json`) off `import.meta.url` rather than `process.cwd()`, so at least that piece works regardless of working directory. `/project-init`'s own onboarding flow now handles the same split explicitly: `plugins/vc-fix/skills/project-init/lib/paths.mjs` separates `outputRoot()` (`VC_FIX_HOME || process.cwd()` — where ALL generated project state lands, symmetric with the readers) from `pluginRoot()` (`CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` — read-only plugin assets, never a write target), so an installed plugin writes `project-profile.json`/`.env.*`/`.mcp.json` into the *project*, not the versioned marketplace cache. `gen-mcp` copies the Playwright MCP configs into the project's `config/` because `${CLAUDE_PLUGIN_ROOT}` does not expand inside a project-level `.mcp.json`.

The second plugin is **`vc-perf`** (`plugins/vc-perf/`) — the three-layer performance loop: **L1** BenchmarkDotNet A/B, **L2** a k6 load harness + `dotnet-counters`, **L3** `dotnet-trace` allocation/CPU/DB attribution, plus a `perf-analyst` agent that ranks optimization candidates and a `perf-loop` orchestrator. It **depends on `vc-fix` (`>=0.7.0`)** and reuses its onboarding, routing, and backend dev/review agents rather than duplicating them; advisory only, never a CI gate. **Each plugin versions and tags independently** (`vc-fix` `0.8.6`, `vc-perf` `0.2.6`, catalog `0.9.4`) — the marketplace's own `version` is the catalog's, not a plugin's, and a dependency range resolves against the per-plugin `{name}--v{version}` git tag, so a version bump without its tag silently strands dependents (`docs/release-process.md` §Step 1 + §Step 5a).

**Self-diagnostics (`vc-fix`, opt-in).** A passive collector (`hooks/session-telemetry.mjs`, active only when `project-profile.json` sets `selfDiagnostics: true`) records outcome-classified span + observation records to `<outputRoot>/.vc-fix/diagnostics/<sid>.jsonl`; `/vc-self-check` judges them against `knowledge/diagnostics/skill-expectations.md`; `deliver` files a consent-gated GitHub Issue built ONLY from a closed-vocabulary struct (no free text, no client names — `upstream-reduce.mjs`, `knowledge/diagnostics/upstream-schema.md`). Capture never decides what matters; the collector, `/vc-self-check` and the `Stop` hook are three separate layers. Local artifacts are ephemeral (log → analyze → contribute → delete). The four core files are byte-identical in `plugins/vc-fix/` and `.claude/` (CI-enforced). Full design rationale and incident history: `docs/decisions/self-diagnostics-design.md`.

**The full `vc-qa` surface** (its agents, skills and commands — `ls .claude/{agents,skills,commands}` for the live counts, never this file — plus its `knowledge/` and `hooks/`) is **no longer a plugin — it now lives under `.claude/`** (`.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/knowledge/`, `.claude/hooks/`) as **project-scoped components** that Claude Code auto-discovers in *this* repo. This is the "normal project" layout: `/qa-*` and `/ba-*` commands load locally on any clone with no plugin manifest and no marketplace listing (the `.claude-plugin/plugin.json` manifest was deleted deliberately). The remaining code surfaces that consume these — `ci/` (headless pipeline), `scripts/`, `config/` — reference them at their `.claude/…` paths. It could still be re-packaged as a plugin later (a new `plugin.json` moving components back to the repo root + a `marketplace.json` entry) if the full-regression/BA offering is distributed; for now it is a plain in-repo toolset, not a distributable.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: 18+
- **Plugin install**: `/plugin install` (Claude Code) → `/project-init` (env setup; `npm run env:check` to verify). See `docs/onboarding.md`.
- **Serena** (whole-team, one-time per machine): semantic code-navigation MCP. Enabled in the tracked `.claude/settings.json` and pre-configured by the tracked `.serena/project.yml`, but **installing is per-machine** (the enabled flag is a no-op until you do). Needs `uv`/`uvx` on PATH. Run `/plugin marketplace add anthropics/claude-plugins-official` → `/plugin install serena@claude-plugins-official`, then restart Claude Code (plugin MCP tools bind at session start). Verify: `claude mcp list` → `plugin:serena:serena … ✔ Connected`. See `docs/onboarding.md` §Serena.
- **MCP Servers**: `.mcp.json` (gitignored, create locally)
- **New deployment / new customer?** Run **`/project-init`** — a derive-driven wizard. It installs deps, then asks only what genuinely shapes config (env **name**, bug **tracker** — Jira/Azure Boards, code **host** — GitHub/Azure Repos, **auth** per axis — PAT recommended else browser/CLI login) and **derives** the rest (native-platform vs CLIENT project, client org, contribution mode, fork account) from the token + a live module/repo scan. Writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access with a readiness table. That profile is what makes `/qa-fix` route each bug to the right repo + tracker. **Absent profile ⇒ native-platform / Jira / GitHub defaults = the original behaviour.**
- **New here?** See `.claude/ROUTING.md`. **Adding a rule?** Read §Where the rules live first

## Commands

All runnable commands live in `package.json` `scripts` — read it rather than a copy here (the count was transcribed
here once and was stale by 10 within weeks; the file is the source of truth).
The `ci:*` family drives the pipelines; `npm run env:check` validates env vars before anything else.

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

Run `ls` — the layout is self-describing. Two non-obvious points `ls` does **not** show: `plugins/vc-fix/`
is the one distributed plugin and deliberately duplicates (rather than references) the root's
`knowledge/`/`rules/`/`config.js` — see §Project Overview for why; and `.claude/` is the project-scoped
`vc-qa` surface (commands/agents/skills/knowledge/hooks/rules), auto-discovered here with no plugin manifest.

**Gitignored:** `.env`, `.env.local`, `.env.backup`, `.mcp.json`, `results/`, `.newman-run/`, `.fix-workspace/`, `.vc-fix/` (self-diagnostics telemetry), `project-profile.json`, `.claude/settings.local.json` (note: `ci/` and `.github/` ARE tracked and ship with the plugin — only transient sub-paths like `ci/config/.module-registry.cache.json` are ignored). `.claude/settings.json` **is tracked** — it's the shared project config (hooks + `enabledPlugins`, incl. Serena); per-developer overrides go in the gitignored `.claude/settings.local.json` instead. **It deliberately does NOT register the self-diagnostics collector** (VCST-5582 H): `vc-fix@vc-tools` is enabled at the user level on the team's machines and ships its own `hooks.json`, so registering the `.claude/` mirror as well ran **two** collector processes per event against the same `.vc-fix/diagnostics/<sid>.*` files — duplicated spans and racing `saveState()` writes with lost cursor updates (observed: two `finalize` records 12 ms apart reporting 292 vs 290 spans). The mirror FILE stays (byte-identity is CI-enforced) and this repo now exercises exactly the copy a client runs; trade-off — a checkout *without* the plugin installed gets no telemetry here. `collector_contention` detection remains as a backstop for two parallel sessions on one `outputRoot`. **Serena dependency note:** `enabledPlugins.serena` only *enables* the official `claude-plugins-official`-marketplace Serena plugin for whoever has it installed (a no-op otherwise, never auto-installed) — when active it's a source-indexing LSP tool that runs against whatever gets checked out into `.fix-workspace/<repo>/`, which on a client deployment can be client code (§2a).

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
- `post_edit` hook: `npx tsc --noEmit -p ci/tsconfig.json` (wired in `.claude/settings.json`; `typescript`
  is a devDependency). Its `include` covers `ci/*.ts` + `ci/lib/` + **all of `../scripts/**/*.ts`** — so
  every TS file under `scripts/` is gated. It was previously scoped to `../scripts/lib/*.ts` only, which
  silently left `scripts/deploy/`, `scripts/unit/`, `scripts/hotfix/` etc. unchecked: a green run said
  nothing about them. The config is typecheck-only (`noEmit`, no `outDir`) and sets
  `allowImportingTsExtensions` for the `tsx`-style `.ts` import specifiers the unit tests use.
  Max 3 concurrent browser agents.
- Browser assignments: see `.claude/rules/agents.md`

## Critical Revenue Flows (must pass before deployment)

Registration/Auth, Catalog/Facets, Cart (variations, BOPIS), Search, Addresses, Checkout/Payment, Orders, B2B Multi-org, GA4 tracking.

**Payment flow:** CyberSource, Skyflow (VCST-5009), and Authorize.Net (VCST-5162, PR-deployed) have `allowCartPayment=true` — the card form renders directly on the cart page. Datatrans is the only remaining redirect processor: clicking "Place Order" redirects to `/checkout/payment`.

## Where the rules live — three loading tiers

- **Always loaded** (this file + `.claude/rules/*.md`): only what applies to every task. Keep it that way — `.claude/rules/` is re-paid on EVERY turn and EVERY subagent dispatch. Before adding a line here or in `rules/`, ask: *would removing it cause a mistake on a task that never touches this topic?* If not, it belongs one tier down.
- **On demand** (`.claude/knowledge/**`, `.claude/skills/*/` supporting files, `.claude/commands/*.md`): loaded when a step reads it. Task-conditional rules live here and are **cited** from the tier above, never restated.
- **Never loaded** (`docs/decisions/`): the measured rationale, incident post-mortems and retired designs. Read by humans deciding whether to change something.

**Enforced, not advisory:** `npm run context:check` (`scripts/maintenance/lint-claude-docs.mjs`) caps this file + `.claude/rules/` at 80,000 chars and any single line at 2,500, and ratchets dangling paths / missing scripts / missing `§` headings across all of `.claude/`; it runs on every PR via `.github/workflows/gates.yml` and inside `npm test`. A breach means *move something down a tier*, never *raise the budget*.

A fact stated once and cited elsewhere does not drift; every contradiction the 2026-09-07 audit found was in a fact that had been restated. Counts (suites, cases, agents…) are never transcribed into prose — run the script that prints them.

## Detailed References — single sources of truth

Each row names THE file that is normative for its topic. Read it before acting on that topic; do not re-derive from memory.

| Topic | Read |
|---|---|
| Ticket → flow routing (type × status → `feature-test` / `/qa-verify-fix` / `/qa-hotfix-check`) | `.claude/knowledge/execution/ticket-routing.md` |
| Ticket status transitions — `qa-lead-orchestrator` is the only actor, two hops per run | `.claude/knowledge/execution/ticket-status-transitions.md` |
| `/qa-test` — the pipeline contract (steps, gates, FAST vs FULL) | `.claude/commands/qa-test.md` (shell) + `.claude/skills/qa-test/` (methodology: `test-model.md`, `authoring.md`, `close-out.md`, `modes.md`, `axes.md`, `visual-axis.md`, `contract-refresh.md`, `coverage-triage.md`, `exploratory-lane.md`, `triage.md`) |
| The six derived pre-flight axes (`layer`, `visual_surface`, `contract_surface`, `coverage_surface`, `data_surface`, `domain_map`) | `.claude/skills/qa-test/axes.md` |
| **What a domain IS** — actors, value chain, surface inventory per layer, where the layers DISAGREE, coverage shape | `.claude/knowledge/domain/<domain>.md` (shape: `domain-map.md`; build/refresh `/qa-domain-map <slug>`; freshness `npm run domain:check`) |
| Prior art per ticket (read the sources directly) | `reports/ba/<domain>/` · `reports/ba/test-models/` · `reports/tickets/**/summary.json` |
| Bug auto-fix gate ladder G0–G7, ownership routing, no-auto-merge, client-code containment | `.claude/knowledge/execution/quality-gates.md` |
| Test data — `@td()` / `{{VAR}}`, GOLDEN RULE, SECOND RULE | `.claude/rules/test-data.md`; seeder authoring `.claude/knowledge/execution/test-data-authoring.md` |
| Report policy — categories, caps, severity folders, inline screenshots | `.claude/rules/reports.md` (stub) → `.claude/knowledge/execution/reports-policy.md` |
| Regression — modes, manifest, suite-authoring, selection groups | `.claude/rules/regression.md`; lanes / promotion / scaffold / selection / selectors / pipelines / suites under `.claude/knowledge/execution/regression-*.md` |
| Agents — roster, browser lanes, delegation | `.claude/rules/agents.md`; knowledge-base read-before-write rules `.claude/ROUTING.md` |
| MCP servers, `--secrets`, Chrome DevTools auth options | `.claude/knowledge/execution/browser-lanes.md` |
| Oracles — BL invariants, ECL edge cases, bug catalog; their audit + value gate | `.claude/knowledge/oracles/`, `.claude/skills/qa-review-oracles/` (`npm run oracles:rank`, `bl:lint`, `ecl:lint`) |
| Test-case staleness audit (Dim 11, `--triangulate`) | `.claude/skills/qa-review-tests/triangulation-criteria.md` |
| Claude Design `vs. DESIGN` axis | `.claude/skills/qa-design/claude-design-verification.md` |
| Tier classification for cross-product reuse | `.claude/architecture/TIER.md` |
| Command / skill arguments | each file's frontmatter (the `/` menu) |
| Virto Commerce docs | VirtoOZ MCP via `/vc-docs` (Context7 `/virtocommerce/vc-docs` fallback) |
| Why any of the above is shaped the way it is | `docs/decisions/qa-test-evolution.md`, `docs/decisions/self-diagnostics-design.md`, `docs/decisions/regression-history.md`, `docs/decisions/mirror-parity.md` |
