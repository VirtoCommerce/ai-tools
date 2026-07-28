# CLAUDE.md

## Project Overview

**Agentic QA system** for the Virto Commerce B2B e-commerce platform. Tests are executed through natural language prompts via MCP servers (Playwright, Chrome DevTools) — LLM-powered browser automation, NOT traditional `.spec.js` files. Prompt templates live in `vc/shared/docs/prompts/`.

This repo hosts the **`vc-tools` Claude Code marketplace** (`.claude-plugin/marketplace.json`), which currently distributes **one plugin: `vc-fix`** (`plugins/vc-fix/`) — the bug-lifecycle slice: `/project-init`, `/qa-bug`, `/qa-fix` (+ its `fullstack-backend`/`fullstack-frontend`/`backend-reviewer`/`frontend-reviewer` dev team), `/qa-verify-fix`, `/qa-monitoring` (+ `monitor-triage-agent`), and `/vc-self-check` (the self-diagnostics subsystem — see below) + `/vc-feedback` — 8 agents, 16 skills, 8 commands. Teammates/customers add the marketplace with `/plugin marketplace add VirtoCommerce/vc-mcp-testing-module`, install via `/plugin install vc-fix@vc-tools`. `vc-fix` is **fully self-contained, not repo-coupled** — its own `plugins/vc-fix/knowledge/`, `.claude/rules/`, `config.js`, `scripts/lib/`, `package.json` etc. are duplicated from the repo root, not referenced in place. This is deliberate: Claude Code doesn't document a reliable way for a plugin's commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no `${CLAUDE_PLUGIN_ROOT}`-equivalent; paths resolve against the *user's* CWD, which may be an unrelated project) — see `plugins/vc-fix/skills/qa-fix-routing/SKILL.md` for the finding. `qa-fix-routing/` additionally resolves its own data-file paths (`fix-repos.json`, `.module-registry.cache.json`) off `import.meta.url` rather than `process.cwd()`, so at least that piece works regardless of working directory. `/project-init`'s own onboarding flow now handles the same split explicitly: `plugins/vc-fix/skills/project-init/lib/paths.mjs` separates `outputRoot()` (`VC_FIX_HOME || process.cwd()` — where ALL generated project state lands, symmetric with the readers) from `pluginRoot()` (`CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` — read-only plugin assets, never a write target), so an installed plugin writes `project-profile.json`/`.env.*`/`.mcp.json` into the *project*, not the versioned marketplace cache. `gen-mcp` copies the Playwright MCP configs into the project's `config/` because `${CLAUDE_PLUGIN_ROOT}` does not expand inside a project-level `.mcp.json`.

**Self-diagnostics subsystem** (VCST-5475–5479, evolved into a client→vendor feedback loop by VCST-5509) — a two-tier way for a client-installed `vc-fix` to observe whether its OWN skills ran correctly and (opt-in) report quality issues back to VirtoCommerce, without ever mutating the client install or leaking client code. **Tier A** (passive, **opt-in** — captures only when `project-profile.json` sets `selfDiagnostics: true`, default off): `hooks/session-telemetry.mjs` wired via `hooks/hooks.json` — `SessionStart`→init, `UserPromptSubmit`→prompt (`/vc-feedback`), `PostToolUse[Skill]`→record, `SubagentStop`→agentstop, `Stop`→finalize. It reads the session transcript delta at each skill boundary + Stop and records deterministic, outcome-classified span signals (tool errors, denied permissions, hook failures, STOP/BAIL markers) to `<outputRoot>/.vc-fix/diagnostics/<session_id>.jsonl` (`outputRoot = VC_FIX_HOME || cwd`, per `paths.mjs` — NEVER the plugin dir; `.vc-fix/` is gitignored). Secrets are redacted; it never throws/blocks. **Tier B** (on-demand): `/vc-self-check` (`skills/vc-self-check/`) reads the telemetry + transcript against the oracle `knowledge/diagnostics/skill-expectations.md` (per-skill expected phases/gates + S0–S3 rubric) and writes a LOCAL `DIAG-*.md`. The `Stop` finalize runs `/vc-self-check` **silently via a tail-trigger** (`{decision:"block"}`, no `AskUserQuestion` modal) **only when the Tier-1 classifier flagged ≥1 span** (outcome `failed`/`degraded`/`silent_suspect`) or a `/vc-feedback` 👎 was recorded that session; a clean run prints one `vc-fix self-check: no plugin issues detected` line, and a plain development session with no plugin skill never triggers it (opt out with `VC_FIX_DIAG_CONSENT=off`; a session whose transcript scan errored is reported `degraded-collector`, not clean). It is model-invocable (no `disable-model-invocation`) so the tail-trigger can auto-run it, but never auto-triggers unprompted — recursion/re-nag is blocked by the `selfCheckSeen` one-shot guard + per-signature dedup + the collector dropping its own `vc-self-check` spans. `skills/vc-self-check/deliver.mjs` (`/vc-self-check deliver`) turns a confirmed DIAG into a consent-gated contribution to `VirtoCommerce/vc-mcp-testing-module`, routed by GitHub-token rights (PR / fork-PR / issue / local) via `probe-lib.mjs`. **§2a client-code containment is enforced by a default-deny CLOSED SCHEMA, not a denylist:** the outbound artifact is built ONLY from a validated `UpstreamSignal` struct (`skills/vc-self-check/upstream-reduce.mjs` → `reduce`/`validateUpstream`/`fingerprintStruct`; spec `knowledge/diagnostics/upstream-schema.md` + ADR `adr-upstream-default-deny.md`) whose every field is a closed-vocabulary enum or number — skill/verdict/severity/outcome/signal-class/struggle/error-**taxonomy-code**/tool-family/repo-**kind**/counts, ZERO free-text fields. `reduce()` reads ONLY the structured collector jsonl (span records + feedback verdicts); the LLM-authored DIAG cells (`signal`/`rootcause`/`fix`) and `/vc-feedback` prose NEVER enter the upstream path (feedback travels as 👍/👎 counts only), error TEXT is classified locally to a code (only the code travels), and repo/module/org NAMES are never sent — so the client-data-leak class that recurred across three review rounds is impossible by TYPE. `redact()` (shared `hooks/redact.mjs` secret rules) still scrubs the local persist path; the former free-text client-shape scrubbers (`scrubText`/`isClientSpecific`/`containsClientShape`) were **removed as dead code** (PR #143 review round 2) — with an enum-only upstream artifact there is nothing free-text to scrub, so the closed schema is the sole upstream guard. Local diagnostics are **ephemeral** — the lifecycle is log → analyze → contribute → **delete**: on a successful Issue delivery (`--confirm`, or a dedup already upstream) `deliver` removes the processed session's own artifacts (`<sid>.jsonl`/`.state.json`/`DIAG-<sid>-*`/its `DELIVERY-*`; that session only, never others; `--keep` retains). PR/fork-PR hand-off and local (nothing sent) delete nothing — they print the ready `--purge` cleanup command to run after the PR is opened. **Canonical copy: `plugins/vc-fix/`.** The **self-diagnostics subsystem is now kept in sync across both surfaces** (PR #143 R2): `hooks/redact.mjs`, `hooks/session-telemetry.mjs`, `skills/vc-self-check/deliver.mjs`, and `skills/vc-self-check/upstream-reduce.mjs` are **byte-identical** in `plugins/vc-fix/` and `.claude/`, so the hardened secret redaction + the default-deny closed-schema upstream path ship on BOTH — the client-data-leak class is closed on both, not just the distributed plugin. The `.claude/` mirror may still lag on **non-self-diagnostics** surface (e.g. no dedicated `/vc-feedback` command md — the `session-telemetry.mjs prompt` handler is present and wired, a shorter `skill-expectations.md`); those are prose/UX, not a containment gap. Self-diagnostics changes land in `plugins/vc-fix/` first and are copied to the mirror in the same change.

**The full `vc-qa` surface** (19 agents / 35 skills / 25 commands, plus its `knowledge/` and `hooks/`) is **no longer a plugin — it now lives under `.claude/`** (`.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/knowledge/`, `.claude/hooks/`) as **project-scoped components** that Claude Code auto-discovers in *this* repo. This is the "normal project" layout: `/qa-*` and `/ba-*` commands load locally on any clone with no plugin manifest and no marketplace listing (the `.claude-plugin/plugin.json` manifest was deleted deliberately). The remaining code surfaces that consume these — `ci/` (headless pipeline), `scripts/`, `config/` — reference them at their `.claude/…` paths. It could still be re-packaged as a plugin later (a new `plugin.json` moving components back to the repo root + a `marketplace.json` entry) if the full-regression/BA offering is distributed; for now it is a plain in-repo toolset, not a distributable.

## Prerequisites

- **IDE**: Cursor, Windsurf, or VS Code with Claude Code extension
- **Node.js**: 18+
- **Plugin install**: `/plugin install` (Claude Code) → `/project-init` (env setup; `npm run env:check` to verify). See `docs/onboarding.md`.
- **Serena** (whole-team, one-time per machine): semantic code-navigation MCP. Enabled in the tracked `.claude/settings.json` and pre-configured by the tracked `.serena/project.yml`, but **installing is per-machine** (the enabled flag is a no-op until you do). Needs `uv`/`uvx` on PATH. Run `/plugin marketplace add anthropics/claude-plugins-official` → `/plugin install serena@claude-plugins-official`, then restart Claude Code (plugin MCP tools bind at session start). Verify: `claude mcp list` → `plugin:serena:serena … ✔ Connected`. See `docs/onboarding.md` §Serena.
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
npm run ci:full          # Full regression (all 110 suites)
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
├── .claude-plugin/       # marketplace.json ONLY — lists ONE plugin: vc-fix (source "./plugins/vc-fix"). The old vc-qa plugin.json manifest was deleted; the root surface is no longer a plugin
├── plugins/vc-fix/       # THE distributed plugin — bug lifecycle only (project-init/qa-bug/qa-fix/qa-verify-fix). Fully self-contained: own agents/skills/commands + its own copies of knowledge/.claude/rules/scripts/config.js/package.json (not shared with the .claude/ ones below — no reliable plugin-root path resolution to lean on). skills/qa-fix-routing/ additionally resolves its data files off import.meta.url, not CWD
├── .claude/              # PROJECT-SCOPED vc-qa surface (auto-discovered by Claude Code in THIS repo — no plugin). The full vc-qa surface was moved here from the repo root so /qa-* commands load locally without a plugin manifest:
│   ├── commands/         #   25 slash commands, flat *.md (incl. /project-init onboarding)
│   ├── agents/           #   19 agents (QA + BA + Developers teams). FLAT *.md, non-recursive discovery
│   ├── skills/           #   35 skills, each skills/<name>/SKILL.md (ONE level; no category subfolders)
│   ├── knowledge/        #   28 shared reference files + agents/ (per-team shared-instructions + README) — plain dir, NOT scanned as components
│   ├── hooks/            #   hooks.json + enforce-real-user.mjs (settings.json points $CLAUDE_PROJECT_DIR/.claude/hooks/…)
│   └── rules/            #   Reference docs (agents, regression, skills-commands, mcp-browsers, quality-gates, test-data, reports)
├── config/               # Playwright MCP configs + test-suites.json manifest
├── ci/                   # CI regression — Docker + Claude Agent SDK (gitignored)
├── docs/                 # Plugin distribution/onboarding docs (prompt templates: vc/shared/docs/prompts/)
├── vc/                    # Layer 2 — VC internal per-env data (vcst-qa, shared); customers ignore
├── regression/suites/    # 110 CSV suites (~3,480 cases) in 44 module directories
├── tests/                # Test cases by sprint/JIRA ticket
├── reports/              # Bug reports + regression reports
├── test-data/            # Orgs, search queries, uploads
```

**Gitignored:** `.env`, `.env.local`, `.env.backup`, `.mcp.json`, `results/`, `.newman-run/`, `.fix-workspace/`, `.vc-fix/` (self-diagnostics telemetry), `project-profile.json`, `.claude/settings.local.json` (note: `ci/` and `.github/` ARE tracked and ship with the plugin — only transient sub-paths like `ci/config/.module-registry.cache.json` are ignored). `.claude/settings.json` **is tracked** — it's the shared project config (hooks + `enabledPlugins`, incl. Serena); per-developer overrides go in the gitignored `.claude/settings.local.json` instead. **Serena dependency note:** `enabledPlugins.serena` only *enables* the official `claude-plugins-official`-marketplace Serena plugin for whoever has it installed (a no-op otherwise, never auto-installed) — when active it's a source-indexing LSP tool that runs against whatever gets checked out into `.fix-workspace/<repo>/`, which on a client deployment can be client code (§2a).

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
  is a devDependency). Max 3 concurrent browser agents.
- Browser assignments: see `.claude/rules/agents.md`

## Critical Revenue Flows (must pass before deployment)

Registration/Auth, Catalog/Facets, Cart (variations, BOPIS), Search, Addresses, Checkout/Payment, Orders, B2B Multi-org, GA4 tracking.

**Payment flow:** CyberSource, Skyflow (VCST-5009), and Authorize.Net (VCST-5162, PR-deployed) have `allowCartPayment=true` — the card form renders directly on the cart page. Datatrans is the only remaining redirect processor: clicking "Place Order" redirects to `/checkout/payment`.

## Detailed References

- `.claude/architecture/TIER.md` — Tier classification (A/B/C/D) for multi-project expansion; canonical map of what's methodology vs capability vs storefront-domain vs missing. Read before any change aimed at standardization or cross-product reuse.
- `.claude/rules/agents.md` — 19 agents (QA 11 + BA 4 + Developers 4), browser assignments, delegation rules
- `.claude/rules/regression.md` — 4 testing modes, CI pipeline, suite manifest, selection groups
- `.claude/rules/skills-commands.md` — 28 commands + 35 skills with arguments
- `.claude/rules/quality-gates.md` — **Single source of truth for the bug auto-fix gate ladder (G0–G7)**: shared by the interactive `/qa-fix` (+ `developers/` team — `fullstack-backend`/`backend-reviewer` for module/platform, `fullstack-frontend`/`frontend-reviewer` for vc-frontend) and the headless `ci/run-fix-cycle.ts`. Triage→reproduce→fix→review→CI/E2E→human-review; never auto-merge. Read before any change to the auto-fix flow.
- `.claude/rules/mcp-browsers.md` — MCP servers, browser rules, Storybook setup
- `.claude/rules/test-data.md` — `@td()` resolver + `{{VAR}}` policy: never hardcode IDs/SKUs/prices/cards/etc.; canonical sources, validation script, where the rule is enforced
- `.claude/rules/reports.md` — Report file policy + brevity rule: 10 allowed categories (bug, test cases, BA, regression, monitoring, per-ticket QA, BL audit, exploratory session, coverage generation, performance investigation), hard size caps per type (bug <150 lines, clean regression <30, BA <250, per-ticket file <120, BL audit <100, exploratory <80, coverage <150, performance <120), bloat patterns to cut, reference-don't-inline. `/qa-test-lifecycle` run summaries **and `/qa-test`'s own step artifacts** are terminal-only — never written to disk (only `/qa-test`'s `summary.json` + screenshots persist).
- **BL oracle self-maintenance** — `/qa-review-bl` (skill `.claude/skills/qa-review-bl/`, command `.claude/commands/qa-review-bl.md`, deterministic core `scripts/knowledge/lint-bl.ts` → `bl:lint`/`bl:audit:collect`) triangulates each `BL-*` invariant in `knowledge/oracles/business-logic.md` against **docs + live + source code** and **auto-applies confirmed changes** (gated by a 3-source evidence bar, not human approval; unconfirmed → `reports/ba/bl-proposals-<date>.md`). Delegated to `ba-system-analyzer` (parallel triangulation, single-writer apply); also runs automatically as `/qa-test-lifecycle` Phase 4c, scoped to the `BL-*` a run touches. This deliberately supersedes the former "never auto-edit business-logic.md" rule.
- Virto Commerce docs: **VirtoOZ MCP** (primary — 12 topic-scoped tools: `PlatformUserGuide`, `PlatformDeveloperGuide`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `*SourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`, `VirtoCommerce`) accessed via the `/vc-docs` skill. Context7 library `/virtocommerce/vc-docs` is a fallback.
