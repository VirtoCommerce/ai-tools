# Changelog

All notable changes to the VC QA plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver per [`docs/versioning.md`](docs/versioning.md). **Breaking changes are flagged `**BREAKING:**`** and paired with a migration note.

> **Tier-A changes are flagged `**Tier A:**`** so reviewers know to read carefully — those affect the standardization contract.

---

## [Unreleased]

Forward-looking work on top of v0.7.0. Pin to a tagged release for stability; this branch tip is unstable.

### Added — vc-fix self-diagnostics subsystem (VCST-5475–5479)

A two-tier way for a client-installed `vc-fix` to observe whether its OWN skills ran correctly and, opt-in, report quality issues back to VirtoCommerce — without ever mutating the client install or leaking client code. `vc-fix` now ships **8 agents, 15 skills, 7 commands** (plugin `0.6.0`; marketplace `0.9.0`).

- **Tier A:** `hooks/session-telemetry.mjs` (passive) wired via `hooks/hooks.json` — `SessionStart`→init, `PostToolUse[Skill]`→record, `Stop`→finalize. Records per-skill boundaries, timings, and deterministic signals (tool errors, denied permissions, hook failures, STOP/BAIL markers, anomaly score) to gitignored `<outputRoot>/.vc-fix/diagnostics/<session_id>.jsonl`. Secrets redacted; never throws/blocks a tool.
- **Oracle:** `knowledge/diagnostics/skill-expectations.md` — per-command expected phases/gates + anti-patterns + an S0–S3 severity rubric.
- **Tier B:** `/vc-self-check` (`skills/vc-self-check/`, `disable-model-invocation`) reads the telemetry + transcript + oracle → per-skill verdict (OK/DEGRADED/BROKEN) + severity + proposed fix → LOCAL `DIAG-*.md`. A one-shot yes/no consent prompt fires from `Stop` only when the anomaly score is high (opt out `VC_FIX_DIAG_CONSENT=off`); never auto-runs.
- **Delivery:** `skills/vc-self-check/deliver.mjs` (`/vc-self-check deliver`) — scrubbed (§2a client-code containment), consent-gated (draft-and-confirm) contribution to `VirtoCommerce/vc-mcp-testing-module`, routed by GitHub-token rights (PR / fork-PR / issue / local), with issue dedup.
- Shipped symmetrically in `plugins/vc-fix/` and `.claude/`.

---

## [0.7.0] — 2026-07-08

Headline themes since v0.6.0: the **`vc-qa` surface converts from a dormant plugin layout to a project-scoped `.claude/` layout** (auto-discovered on any clone, no manifest), the **marketplace listing swaps `vc-qa` for the self-contained `vc-fix` plugin** — now carrying `/qa-monitoring` + a monitor-only Teams card — and **`/project-init` stops writing generated state into the plugin cache**, writing it into the project instead.

**`**BREAKING:**` `vc-qa` surface converted from a (dormant) plugin layout to a project-scoped `.claude/` layout.**
The full `vc-qa` component tree — `commands/` (23), `agents/` (18), `skills/` (32), `knowledge/`, `hooks/` — was
moved with `git mv` (history preserved) from the repo root into `.claude/commands|agents|skills|knowledge|hooks/`,
so Claude Code auto-discovers it as **project-scoped components in this repo** with no plugin manifest and no
marketplace listing. The `.claude-plugin/plugin.json` (`vc-qa`) manifest was deleted. `/qa-*` and `/ba-*` commands
now load locally on any clone. Path references updated across consumers: the `settings.json` hook path, `package.json`
`local:*` scripts, `scripts/audit-agents-knowledge.ts` + `scripts/validate-critical-ui-scope.ts` (fs reads), `ci/`
agent prompts + monitor oracles, and ~120 relative markdown links inside the moved files (recomputed depth-aware).
`plugins/vc-fix/` and its marketplace listing are unaffected — `vc-fix` remains the distributable plugin.
Migration for an existing checkout: `git pull`; project components load from `.claude/` automatically (reload the
session). Re-packaging as a plugin later means moving the component dirs back to the repo root + restoring a manifest.

**`**BREAKING:**` `vc-qa` removed from the marketplace listing; added `vc-fix`.** `.claude-plugin/marketplace.json`
now lists only `vc-fix` (`plugins/vc-fix/` — the bug-lifecycle subset: `/project-init`, `/qa-bug`, `/qa-fix`
+ dev team, `/qa-verify-fix`, `/qa-monitoring`; 8 agents, 14 skills, 6 commands). `/plugin install vc-qa@vc-tools` no longer
resolves — use `/plugin install vc-fix@vc-tools`. `vc-qa`'s full agent crew (regression, BA, 110 suites)
stays on disk at the repo root, unmodified, but is not currently installable via the marketplace.
`vc-fix` is fully self-contained (its own `knowledge/`, `.claude/rules/`, `scripts/lib/`, `config.js`) —
it does not share files with the root `vc-qa` tree at runtime, since a plugin install has no documented
way to resolve its own install location for cross-file references.

**Added `/qa-monitoring` + `monitor-triage-agent` to `vc-fix`.** Online bug monitoring from
Application Insights (query → fingerprint dedup → triage → live repro → report; detect-and-report
only, never files a ticket or auto-fixes) — a self-contained extract of the full `vc-qa` plugin's
monitoring pipeline. The headless CI twin (`ci/run-monitor.ts`) and its `@azure/identity` REST
client are not shipped; `/qa-monitoring` queries via Azure MCP's `applicationinsights` tool
directly, and the dedup logic + KQL probes live in `plugins/vc-fix/skills/qa-monitoring/`
(`fingerprint-store.ts`, `queries/*.kql`). `vc-fix` now ships 8 agents, 14 skills, 6 commands.

**Added the Teams notification card to `vc-fix`'s `/qa-monitoring`.** A monitor-only extract
of `ci/notify-teams.ts` (the regression-card mode is dropped — no regression pipeline is
shipped) at `plugins/vc-fix/skills/qa-monitoring/notify-teams.ts`. Reads `TEAMS_WEBHOOK_URL`
via `config.js`/`.env.local`; no-ops with a clear message when unset, so `/qa-monitoring`
runs and reports the same with or without it.

**Fixed `/project-init` writing generated state into the plugin cache instead of the project.**
The `vc-fix` `/project-init` generators derived their output root from `import.meta.url`, so an
**installed** plugin wrote `project-profile.json` / `.env.*` / `.mcp.json` / `.claude/settings.local.json`
into the versioned marketplace cache (`~/.claude/plugins/cache/vc-tools/vc-fix/<version>/`) while the
runtime readers (`config.js`, `loadProjectProfile()`) read them from `process.cwd()` — writers and
readers pointed at different dirs, so config never took effect and cache writes were lost on the next
upgrade. New helper `plugins/vc-fix/skills/project-init/lib/paths.mjs` splits the two roots explicitly:
`outputRoot()` = `VC_FIX_HOME || process.cwd()` (all generated project state, symmetric with the readers)
vs `pluginRoot()` = `CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` (read-only plugin assets —
`templates/`, source `config/`; never a write target). All six generators (`gen-profile`, `scaffold-env`,
`scaffold-secrets`, `write-env`, `discover-repos`, `gen-mcp`) default output to `outputRoot()` and read
templates from `pluginRoot()`. `gen-mcp` also copies the three Playwright MCP configs from the plugin
into the project's `config/` (copy-if-absent), since `${CLAUDE_PLUGIN_ROOT}` does not expand inside a
project-level `.mcp.json`. This closes the "not yet fixed" onboarding-CWD question noted in `CLAUDE.md`.

---

## [0.6.0] — 2026-07-07

**Structural fix: the plugin's components now actually load.** In v0.5.0 the plugin installed but almost nothing registered — every component lived under `.claude/`, skills were nested two levels deep, and non-agent files sat inside the agents tree. Claude Code discovers plugin components at the **plugin root** (never `./.claude/`), so this release physically relocates everything to where discovery looks. No behavior of any command/agent/skill changed — only their on-disk location and the internal path references to them.

### Fixed

- **Components moved to the plugin root** — `commands/`, `agents/`, `skills/`, `hooks/` are now siblings of `.claude-plugin/` (were under `.claude/`, which the plugin loader never scans). Moved with `git mv` to preserve history. (`.claude/` still holds non-plugin material: `rules/`, `architecture/`, `ROUTING.md`, `settings*`.)
- **Skills flattened to one level** — every skill is now `skills/<name>/SKILL.md`. The four category folders (`development/`, `qa-methodology/`, `testing/`, `vc-knowledge/`) were removed and their skills promoted; plugin skill discovery is one level only, so the 30 nested skills previously never loaded. All 32 skills now register. No name collisions.
- **Agents flattened to flat top-level files** — the 18 agents are now `agents/*.md` at the plugin root. Plugin **agent discovery is non-recursive** (confirmed against the docs + upstream issue #19202, closed "not planned"), so the previous `agents/{qa,ba,developers}/` subfolders registered **0** agents. Names are unique across teams, so the flat layout is unambiguous.
- **Non-agent files removed from the agents discovery path** — `agents/knowledge/` → a plugin-root `knowledge/` reference dir (28 shared files, not a component type, so never scanned); the three per-team `shared-instructions.md` and the agents `README.md` → `knowledge/agents/`. This stops reference docs from being mis-registered as agents.
- **`SKILL.md` frontmatter** — added a kebab-case `name:` (matching the folder) to the 22 skills that were missing it; every SKILL.md now has `name:` + `description:`.
- **`plugin.json` cleanup** — removed the `category` field (belongs in the marketplace entry; emitted a validation warning) and corrected the component counts in the description (18 agents, 32 skills, 23 commands, 28 knowledge files). No component path overrides added — default root discovery covers everything (and dot-segment override paths like `./.claude/agents` fail manifest validation anyway).
- **Reference rewrite** — updated every path reference to the moved components across the live surface (agents, skills, commands, hooks, knowledge, `.claude/rules`, `.claude/architecture`, `ci/`, `scripts/`, `config/`, `docs/`, and the top-level docs). Historical report artifacts under `reports/` and `vc/` were intentionally left untouched (point-in-time records).

**Verified:** `claude plugin validate .` passes with 0 errors / 0 warnings; `claude plugin details vc-qa` reports 18 agents, 32 skills, 23 commands, 2 hooks (no `knowledge:*` / `shared-instructions` / `README` pseudo-agents).

---

## [0.5.0] — 2026-07-07

Headline themes since v0.4.0: **`/project-init` becomes a derive-driven onboarding wizard** with full client-vs-platform / Jira-vs-Azure-Boards / GitHub-vs-Azure-Repos support, **`/qa-fix` gains ownership-aware routing** (client repos, platform fork-PRs, frontend provenance) behind a hard client-code-containment invariant, and the **seeder is rebuilt** into a single-process, dedup-safe, store-scoped pipeline whose runtime GUIDs all land in per-env `aliases.{env}.json`. All changes remain additive.

### Added

#### `/project-init` — derive-driven onboarding + client/platform routing
- **Deployment-profile onboarding** — `/project-init` now asks only what genuinely shapes config (environment **name**, bug **tracker**, code **host**, per-axis **auth preference**); everything else (native-platform vs CLIENT, client org, contribution mode, fork account) is **derived** from the token + a live module/repo scan. Writes `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` and verifies access.
- **Tracker + code-host adapters** — Jira **or Azure Boards**; GitHub **or Azure Repos**. CI VCS adapters (`ci/lib/vcs/`) + ownership-routed `ci/run-fix-cycle.ts`; PR VCS selected by `contributionPlan.host`.
- **Client-repo discovery** — scans for the client theme / custom modules / storefront fork, classifies ownership, and derives the fork account. `discover-repos.mjs`.
- **Independent auth axes** — PAT recommended, else browser/CLI login per axis; `ensure-session.mjs` drives browser login (az browser SSO + device-code, ADO tenant auto-discovery) without hand-typed commands. GitHub verified via real `gh` write-scope probe (not just "logged in").
- **verify-access readiness table** — prints the full `/qa-fix` readiness table (repos, tracker, host, MCP servers) in chat; existing-env guard prunes inapplicable Azure blocks.
- **Non-interactive writers** — `write-env.mjs`, always-scaffold optional `POSTMAN`/`CONTEXT7` keys in `.env.local`.

#### `/qa-fix` — ownership routing + client-code containment
- **Ownership-routed delivery (quality-gates §1a/§1b/§2a)** — `repoOwnership` / `contributionPlan` route each fix by repo: client repos → PR on the client host (GitHub or Azure Repos); platform repos → direct or **fork-PR** to `VirtoCommerce/*`; too-complex platform bugs → upstream GitHub Issue. Frontend **provenance** (`ci/lib/provenance.ts`) refines a client-storefront-fork bug to client vs unmodified-platform code.
- **Client-code containment — hard security invariant** — client code never leaves the client's project; a platform fork-PR / issue carries only scrubbed platform-generic code. Enforced at routing, G3/G4 review, and the developers team.
- **Platform frontend bug = upstream contribution**, not a fork-patch of the client repo.

#### White-labeling
- **BL-WL two-layer master switch** promoted; suite 067 enriched, WL fixtures wired into 070/071.
- **Brand assets seeded** (Electronics, Fashion) — logo/favicon bytes + thumbnails uploaded via `seed-white-labeling`; `WL-ORG-A` branding wired; vcst + vcptcore WL asset-URL overrides in the per-env alias files.

### Changed

#### Seeding — single-process, dedup-safe, store-scoped rebuild
- **Single-process category + product seeding** eliminates the duplicate-tree corruption from the search-index-lag race; reconcile dedups categories by **CODE**, not display name.
- **Store-scoped catalog** — seed catalog linked into the store's virtual catalog; stock targets the **store main FFC** (all FFCs added to the store); reduced catalog/category fixtures.
- **Auto-enrichment** — seeded products get images + descriptions; seeded categories get a placeholder image + description; complete SEO (`pageTitle`) on all seeded products **and** categories; generic "Catalog" SEO title per catalog.
- **Configurable products** — 4 CFG seeders consolidated into one with aligned category hierarchy; CFG writeback migration completed (runtime GUIDs → `aliases.{env}.json`).
- **Standard products** — prefixed + fully seeded from one CSV source of truth; malformed `STD-001` row repaired.
- **Teardown** now fully sweeps BOPIS, pricelists, and B2B orgs; member-sweep batching + 503 retry hardening (PR #84).
- **POSIX env-prefix npm scripts** use `cross-env` for cross-platform correctness.

#### Test-data — every env owns its aliases
- **All envs (including vcst) write `aliases.{env}.json`**; **no runtime platform GUIDs in committed CSVs** — an unseeded env resolves an id to `""` (clear miss) instead of leaking another env's GUID. Credential-hygiene gate added; `td:reconcile` now checks duplicates, `AGENT-TEST-` prefix, and complete SEO.
- **Configurable-parent storefront URLs** re-pointed to `/products-with-options/cfg-parents/<slug>` after drift; `CON-001` currency corrected EUR → USD.

#### Suites
- **Suite 049** catalog API cases fixed to the real deployed contracts.

---

## [0.4.0] — 2026-07-01

Bug auto-fix + hotfix pipelines land, and the test-data layer becomes env-agnostic. Adds the `/qa-fix` interactive fix loop with its write-capable `developers/` team, the `/qa-hotfix` + `/qa-bundle-check` release pipeline, a unified env-agnostic seeder with live reconciliation gates (VCST-5406), a new `vcptcore-qa1` environment, and a Playwright bump. All changes are additive (new commands, new env vars with safe defaults, new suites) — no breaking changes.

### Added

#### Bug auto-fix pipeline (interactive + headless twins) — PR #20
- **`.claude/rules/quality-gates.md`** — single source of truth for the auto-fix gate ladder **G0–G7**: fix-eligibility triage → single-repo route → reproduce-as-failing-test (red) → minimal fix (green) → code review → build/CI → E2E verification → **human review (never auto-merge)**. Both entry points reference gates by ID and share the no-auto-merge triple guard (permission deny + orchestrator + agent).
- **`/qa-fix VCST-XXXX`** (`commands/qa-fix.md`) — interactive autonomous fix of an already-filed bug. Interactive twin of `ci/run-fix-cycle.ts` (same relationship as `/qa-regression` ↔ `ci/run-regression.ts`).
- **`developers/` agent team** — first write-capable team, isolated from read-only QA agents: `fullstack-backend` (opus; .NET 10 / C# + module Admin SPA Angular, reproduce-as-test → minimal fix → PR) and `backend-reviewer` (opus; Gate-4 diff review before the PR). Plus `shared-instructions.md`.
- **Headless CI auto-fix** — `ci/run-fix-cycle.ts` + `.github/workflows/auto-fix.yml` (JIRA bug → draft PR): `ci/agents/fix-triage-agent.md` / `fix-backend-agent.md` / `fix-frontend-agent.md`, repo allowlist `ci/config/fix-repos.json`, routing/checkout `ci/lib/repo-router.ts`, live module dependency graph `ci/lib/module-registry.ts` (Platform API, cached). npm scripts: `ci:fix`, `ci:fix:dry`.
- **Development skills** (`skills/`, used by `fullstack-backend`): `/dotnet-unit-test` (red repro as xUnit test, never edits existing tests), `/dotnet-fix` (minimal idiomatic .NET 10 fix + build/test gate), `/angular-admin` (module Admin SPA fixes; red→green via uncommitted Node scratch harness since module repos ship no JS test runner).
- **`knowledge/vc-module-architecture.md`** — VC module repo anatomy + .NET 10 / xUnit / Angular conventions for the fix agents.
- **Dedicated write token** — `GITHUB_FIX_BUGS_TOKEN` → `GH_TOKEN` for `/qa-fix` push/PR scope; QA agents stay read-only on GitHub.

#### Hotfix release pipeline — PR #70
- **`/qa-hotfix VCST-XXXX [bundles]`** (`commands/qa-hotfix.md` + skill) — release a hotfix of an already-merged-and-released fix into the bundles currently latest-stable (asks which): resolve task → linked PR → fix commit, verify MERGED + SHIPPED, then per bundle cherry-pick onto `support/<X.Y>` and trigger the repo's "Release hotfix" workflow. Deterministic core: `scripts/hotfix-precheck.ts` (read-only) + `scripts/hotfix-release.ts` (gated write). Never auto-merges; STOPs when no support branch exists. npm: `hotfix:precheck`, `hotfix:release`.
- **`/qa-bundle-check vN | <package.json-url>`** (`commands/qa-bundle-check.md` + skill) — compare a frozen stable bundle's pinned module/Platform/Theme versions against the latest same-line hotfix on GitHub; flags only newer patches on the same major.minor line, traces each to its PR + JIRA task. Upstream discovery step for `/qa-hotfix`. npm: `bundle:check`.

#### Env-agnostic seeding + test-data integrity gates (VCST-5406) — PR #76
- **Unified company-users seeder** (`scripts/seed-data/seed-company-users.mjs` + shared lib) — replaces 4 separate seeders; one entry point for personal / B2B / cross-org memberships / impersonation / loyalty users. npm: `seed:company-users`, `seed:b2b`, `seed:b2b:memberships`, `seed:users`, `seed:impersonation`, `seed:loyalty:users` (+ teardowns). Hardened against reseed id drift; B2B teardown now sweeps all `users.csv` accounts, not just the membership CSV.
- **`seed:bootstrap`** (`scripts/seed-data/seed-bootstrap.mjs`) — env-agnostic seed bootstrap so seeders self-resolve per `TEST_ENV` instead of assuming vcst-qa.
- **Live reconciliation gate** — `td:reconcile` (`scripts/seed-data/reconcile-test-data.mjs`) probes the platform (catalog root exists, `.env.{ENV}` user roles have accounts, B2B users are org-scoped with no global roles, no password literals in committed CSVs). Companion static gate `td:validate` unchanged. New `td:validate:b2b` (`validate-b2b-data.mjs`) checks the B2B relational graph.
- **Portable promotion seeding** — `seed-promotions.mjs` resolves promotion category/product by business key instead of hardcoded ids; fixture refresh for drifted ids + impersonation fixtures.

#### MCP/UCP testing — PR #74
- **UCP MVP scenarios (VCST-5126)** — live execution report + demo script; MCP/UCP testing checklist added.

### Changed

#### Test-data — password-literal migration (VCST-5406)
- **Seed-CSV password columns now carry `{{VAR}}` tokens** (`B2B_USER_PASSWORD` / `TEST_USER_PASSWORD` / `DEFAULT_TEST_PASSWORD` / per-slot `AGENT_SLOT*`), resolved at seed time from `.env.local` by `scripts/lib/user-provision.mjs` `resolvePassword()`. Real values live only in `.env.local` (gitignored) + the team secret store; safe non-prod defaults ship in `templates/.env.local.template`. `td:reconcile` secret-hygiene fails any bare password literal.
- **B2B relational graph aligned** across `test-data/b2b/`; orphaned virtostart fixtures dropped.

#### Environments
- **`vcptcore-qa1` environment added** (`TEST_ENV=vcptcore1`, `.env.vcptcore_qa1`) — PRs #71, #73. Duplicate env config consolidated onto `.env.vcptcore_qa1`; personas wired to `seed:b2b` fixture accounts.

#### Dependencies
- **Playwright bumped to 1.61.1** + `@playwright/mcp` 0.0.77 (PR #72); `npm audit fix` resolved 4 of 5 transitive advisories.

#### Tooling & suites
- **GraphQL runner tooling repaired** (PR #75) — env loading, negative-test scoring, lint defaults.
- **Strict CSV lint ratchet** for regression suites + search-suite fixes.
- **Runner-native GraphQL / configurable suite fixes** — 050b2, 050b4 (`88e098b`, PR #69), 050b5 (CVAL-GQL-007 isolation with pinned addable B2B fixtures), 050i (configurable cases; VCST-5398 cancelled), 050a, 030; 072 recovered blocked configurable-product cases (CFG-PDP-019, CFG-VAR-017/019); VCST-5391 verification; VCST-5177 configurable sorting cases (PR #66).
- **Repo housekeeping** — vcst-qa archive relocated to `vc/shared/`; sprint 26-12 plan added (PR #68).

#### Auto-fix pipeline follow-ups & earlier suite sync

- **`regression/suites/Backend/graphql/050j-graphql-xmarketing.csv`** — +7 cases (13 → 20): VCST-5022 `promotionCoupons` sort coverage — 3 regression guards (endDate/name honored, `;` multi-field separator, silently-ignored syntaxes) + lifecycle sync. Manifest `testCount` updated.
- **`regression/suites/Backend/customer/026-customer-contacts.csv`** — CUST-055 updated for the new `va-filter-panel` contacts filter UI (VCST-5148, PR #24).
- **`commands/qa-test.md`** — `/qa-test` Plan + Write steps now reuse the `/qa-plan` E2E scenario catalog (`skills/qa-plan/e2e-scenario-catalog.md`): Step 2 maps the ticket to its `E2E-*` scenario(s) and inherits their regression-suite traceability; Step 3 folds those scenarios into the scoped `testing-checklist.md`. Closes the gap where `/qa-test` never consulted the 105-scenario catalog. Stays lightweight — produces the scoped checklist, **not** a full `/qa-plan` test plan / RTM / TestRail CSV (full case authoring + peer-review promotion remains a standalone `/qa-plan` run).
- **`ci/lib/repo-router.ts`** — marketing-xAPI routing fixed (`vc-module-x-marketing` resolution); .NET build hardening in the fix cycle.
- **`.gitignore`** — auto-fix transient state ignored: `.fix-workspace/` (cloned product repos), `ci/config/.module-registry.cache.json`, heavy artifacts under `reports/fixes/FIX-*/` (png/har/jpg; fix-report.md + summary.json stay tracked).

---

## [0.3.0] — 2026-06-02

Phase 1 substrate complete. Plugin is honestly positioned, vcst-clean at Layer 1, multi-env-aware end-to-end, and ships a customer CI template. Closes 12 of 20 strategic workstreams (#1, #5, #6, #7, #8, #9, #10, #11, #19, #20, and positioning + support docs from v0.2-prep). 8 workstreams remain for Phase 2 (live pilot validation) and Phase 3 (GA).

### Changed (Tier A — positioning)

- **Plugin positioning honest-reframed** as "starting-point + authoring framework" (Option B from the 2026-06-02 strategic re-audit). The previous "same suites, your storefront" framing was overselling. vcst-qa's 99 suites test VC platform behavior plus vcst-qa-specific data; we now measure: **48.5% apply universally, 51.5% are reference-pattern that customers clone-and-adapt, 0% are pure vcst-internal at the suite level.** Customer-authored suites are the expected workflow, not the exception.
  - `docs/marketing-onepager.md` — full rewrite. Three-layer value (methodology / agents+framework / reference suites). Explicit "what plugin ships" vs "what you write" table.
  - `docs/onboarding.md` — new "What the plugin ships (and what it doesn't)" section. Day 1 / Week 1 / Week 2+ next-steps timeline centers on customer-authored suites.
  - `docs/pilot-runbook.md` § 5 — success metric updated to require customer to author at least one suite for a customer-specific feature during pilot week.

### Added

#### Multi-env safety (workstreams #7 + #8)
- **`scripts/verify-multi-env-filters.ts`** — offline verifier that replays `applyMultiEnvFilters` from `ci/run-regression.ts` against the manifest for 6 scenarios. Deterministic, exits 0 iff every expectation holds. Verified results:
  - virtostart smoke (no restrictions) → 2/2 kept
  - `MODULES_ENABLED=catalog,customer,orders` → 25/99 skipped via modules gate
  - `STOREFRONT_PROFILE=b2c` → 4 b2b/hybrid suites skipped
  - `ENV_RISK=production` (no hatch) → exactly 45 envRiskGate suites skipped (matches manifest's 45 tagged — perfect)
  - `ENV_RISK=production` + `ALLOW_ADMIN_WRITES_ON_PROD=true` → all 99 kept, `escapeHatchActive: true`
  - `PAYMENT_PROCESSORS_ENABLED=cybersource` → suite 040 (other processors) skipped via processors gate
- **`vc/shared/reports/multi-env-verification/verification-2026-06-02.md`** — VC's archived reference artifact (Layer 2). Customer runs of `npm run verify:multi-env:report` land at root `reports/multi-env-verification/`.
- **npm scripts** — `verify:multi-env` (stdout) and `verify:multi-env:report` (writes to disk).

#### Customer CI template (workstream #20)
- **`.github/workflows/customer-template.yml`** — drop-in workflow customers copy into their repo. Checks out `vc-mcp-testing-module` as a subdir, runs `verify:multi-env` + `env:check` preflights, executes `ci:regression` with `workflow_dispatch` inputs for suite selection, test_env, env_risk, storefront_profile, modules_enabled, payment_processors_enabled, allow_admin_writes_on_prod, max_budget. 22 GitHub secrets referenced (8 required, ~14 optional / feature-gated).
- **`docs/test-authoring.md` § 11** — "Running in CI" section documents the template end-to-end (secrets, multi-env inputs, schedule, cost per run).

#### Multi-env Layer 2 split (workstream #6)
- **`vc/` directory** — Layer 2 (VC-internal deployments) sub-tree:
  - `vc/vcst-qa/` — primary VC QA env. `vc/vcst-qa/tests/` now holds per-ticket evidence previously at root `tests/`.
  - `vc/vcptcore-qa/` — second QA env (placeholder until accumulated evidence).
  - `vc/virtostart/` — staging-like env (placeholder).
  - `vc/shared/` — cross-env materials; `vc/shared/workshop/` holds VC training material.
- **`vc/README.md`** — explains Layer 2 model, archive convention, customer-side sparse-checkout to exclude.

#### Per-suite + per-agent + per-knowledge applicability audits (workstreams #5, #10, #11)
- **`scripts/audit-suite-applicability.ts`** — classifies all 99 suites. Output: 48 universal / 51 reference / 0 vcst-specific.
- **`scripts/audit-agents-knowledge.ts`** — tags 39 files via YAML frontmatter. 21 universal / 18 reference.
- **`scripts/audit-aliases.ts`** — classifies 211 aliases. 7 templates / 204 vcst-data.
- **`config/test-suites.json`** — every suite now has `customerApplicability` field.

#### Failure-mode catalog (workstream #19)
- **`docs/troubleshooting.md`** — 20-entry quick-index table mapping error → anchor, categorized: install / config / runtime / MCP / platform / update / regression.

#### Aliases template backfill (workstream #9)
- **`templates/aliases.json.template`** — added `AGENT_POOL_SLOT_1/2/3` (CSV-backed), `ADMIN_ROLE_TESTER`, `ADMIN_ROLES_COMMON`, `ADMIN_USER`, `VIRTUAL_CATALOG_B2B` (inline aliases with `{{REPLACE_*}}` placeholders). Customer install starts from a complete alias set, not a stub.

#### Releases + versioning (workstream #16)
- **`docs/release-process.md`** — full mechanical release workflow: cadence, roles, trigger criteria, 7-step release process, hotfix flow, pre-release flow, anti-patterns.
- **`CHANGELOG.md`** — this file. v0.1.0-alpha + v0.3.0 entries documented.

### Changed

- **`.claude-plugin/plugin.json`** — `version: "0.2.0"` → `"0.3.0"`.
- **`.claude-plugin/marketplace.json`** — `version: "0.2.0"` → `"0.3.0"`.
- **`knowledge/storefront-selectors.md`** — paths updated from root `tests/` to `vc/vcst-qa/tests/` (Layer 2 split).

### Added (already covered above, kept for v0.2.0 work that landed in v0.3.0)

- **`docs/support-runbook.md`** — internal-to-VC playbook for supporting customers running the plugin. Three-tier support model, triage flow, per-branch playbooks, escalation paths, patch-release workflow, customer-communication templates, anti-patterns. Resolves the "TBD" in `docs/distribution.md` § Support Model.

### Deferred to Phase 2 / v0.4.0

- Workstream #3 (live smoke on non-vcst VC) — needs `ANTHROPIC_API_KEY` + ~$3-5 + ~18 min. Documented command lives in `docs/test-authoring.md` § 11.
- Workstream #12 (pilot rehearsal) — protocol shipped this release (`docs/pilot-rehearsal-protocol.md`); the actual rehearsal RUN needs a human.
- Workstream #13 / #17 (pricing + license) — user decisions.
- Workstream #14 (support staffing) — needs named owner.
- Workstream #15 (marketing assets — demo video, getting-started landing) — post-pilot.
- Workstream #18 (telemetry / opt-in usage signals) — post-pilot.
- Drop `TEST_ENV='vcst'` default in `config.js` — coordinated breaking change across npm scripts + GitHub Actions.
- Generalize payment matrix (suite 039 split per processor).
- Move `test-data/aliases.json` into Layer 2 (requires resolver path config).

### Verified

- `npm run env:check` — green on `TEST_ENV=vcst` and `TEST_ENV=virtostart`
- `npm run verify:multi-env` — all 6 scenarios pass
- `npm run suites:lint` — 99 suites, 35 selections, schema valid
- `npx tsx scripts/validate-td-refs.ts` — all suites resolve
- `npm run plugin:check` — manifest OK, env present
- `node skills/run-vc-mcp-testing-module/driver.mjs` — 7/7 checks pass
- `scripts/detect-vcst-isms.ts --suites` — 0 findings
- `scripts/detect-vcst-isms.ts --agents` — 0 findings

### How to tag this release (post-merge)

```bash
git checkout main
git pull
git tag -a v0.3.0 -m "Release v0.3.0 — Phase 1 substrate complete"
git push origin v0.3.0
```

Then announce per `docs/release-process.md` § Step 6.

---

## [0.1.0-alpha] — 2026-06-02

First customer-installable release. Merged via PR #21 into `main`, tagged `v0.1.0-alpha`. Customers should pin to this tag.

### Added

- **`manifest.json`** — plugin metadata at repo root: name (`vc-qa`), version, scope (storefront + Admin SPA), required & optional MCP servers, full envSchema (3-bucketed: plugin-supplied / customer-required / customer-secret), default quality gates.
- **`bootstrap/install.ts`** — interactive 5-step customer onboarding wizard. Scaffolds `.env.{env}`, appends per-env-suffixed secrets to `.env.local`, generates `aliases.{env}.json` stub, validates via `env:check`. Re-runnable for additional env profiles.
- **`templates/.env.local.template`** — customer-secrets template demonstrating per-env suffix promotion (`USER_PASSWORD_QA`, `USER_PASSWORD_STAGING`, etc.) so one gitignored file holds all env creds.
- **`templates/aliases.json.template`** — starter aliases.json with `{{REPLACE_*}}` placeholders, privacy-by-default header, and the core 9 aliases every customer needs.
- **`docs/onboarding.md`** — customer-facing quickstart: prerequisites, install, verify, per-env workflow, MCP setup, cost awareness, troubleshooting.
- **`docs/distribution.md`** — distribution model decision: hybrid (Claude Code plugin for `.claude/`, npm for scripts/ci). Versioning + update cadence + support model.
- **`docs/pilot-runbook.md`** — internal VC playbook for running Phase 4 customer pilots: candidate qualification, kickoff agenda, solo-run gate, wrap, feedback capture template, triage workflow.
- **`docs/versioning.md`** — **Tier A:** Tier A/B/C/D stability promises + semver rules + breaking-change definition + customer upgrade path + Tier A artifact lock list.
- **`.claude/architecture/TIER.md`** — file-by-file tier classification (A/B/C/D). Scope: storefront + Admin SPA. Multi-env first-class.
- **`commands/qa-onboarding.md`** — customer's post-install entry-point slash command. 7-step guided flow + `tour` / `smoke` / `troubleshoot` sub-modes.
- **`scripts/detect-vcst-isms.ts`** — read-only scanner that finds vcst-qa hardcoded values (catalog GUIDs, org names, internal emails, vcst URLs). Allow-listed by path. Baseline scan: suite CSVs + agent prompts both 0 findings; remaining hits are knowledge-file conventions.
- **`scripts/tag-suites-multi-env.ts`** — idempotent tagger that derives `requiresModules[]` for Backend suites from their file path. Tagged 33 Backend suites in this release.
- **`scripts/lib/test-data-resolver.ts`** — per-env aliases override support. Loads `aliases.{TEST_ENV}.json` on top of base `aliases.json` when present.
- **`ci/run-regression.ts`** — multi-env filter pass on `resolveSuites()`. Skips suites whose `requiresModules[]` not in `MODULES_ENABLED`, whose `storefrontProfile[]` excludes the active `STOREFRONT_PROFILE`, or whose `envRiskGate` is below the active `ENV_RISK`.
- **`config.js`** — new env vars: `ENV_RISK={dev|test|staging|production}`, `STOREFRONT_PROFILE={b2b|b2c|hybrid}`, `MODULES_ENABLED=<csv>`, `JIRA_PROJECT_KEY=<key>`. `TEST_ENV` now validated against `[a-z0-9_]+` with helpful error on kebab-case.
- **`config/test-suites.schema.json`** — new optional fields: `storefrontProfile[]`, `requiresModules[]`, `envRiskGate`. All optional; existing suites validate unchanged.
- **`config/test-suites.json`** — 33 Backend suites tagged with `requiresModules[]` (one entry per VC module: catalog, customer, orders, marketing, pricing, inventory, notifications, cms, store, search, shipping, returns, loyalty, seo, assets, channels, contracts, import-export, image-tools, whitelabeling, push-messages).
- **`.env.defaults`** — 30-line header documenting the 3-bucket env model + multi-env workflow + ENV_RISK safety gate.
- **`.gitignore`** — `/*.yml` + `/*.yaml` at repo root suppresses Playwright accessibility snapshots that browser MCPs dump to CWD.
- **`package.json`** — `plugin:install`, `plugin:check` scripts.

### Changed

- **`commands/qa-env-check.md`** — rewritten for dual-surface validation. Active config panel front-loaded (TEST_ENV, ENV_RISK, STOREFRONT_PROFILE, MODULES_ENABLED, JIRA_PROJECT_KEY). Storefront and Admin SPA validated independently. Platform health endpoint corrected to `/health` (not `/api/platform/healthcheck`).
- **`commands/qa-bug.md`** — `Project: VCST` instruction now reads from `env.JIRA_PROJECT_KEY` (defaults to VCST for backwards compat).
- **`commands/qa-status.md`** — JQL hardcoded `project = VCST` now uses `${JIRA_PROJECT_KEY}` substitution.
- **`commands/qa-test-plan.md`** — same: 5 JQL queries parameterized.
- **`skills/qa-defect/defect-lifecycle-workflow.md`** — same: 3 JQL queries parameterized.
- **`knowledge/sitemap.md`** — B2B virtual catalog root GUID refs refactored to `@td(VIRTUAL_CATALOG_B2B.id)` with educational qualification ("vcst-qa value is X, customer differs").

### Deprecated

- `VIRTO_START_FRONT` / `VIRTO_START_BACK` exports in `config.js` marked with `TODO(qa-agentic-standardization)` — these are vcst-internal env field names. Consumers should switch to `TEST_ENV=virtostart` + the standard `FRONT_URL` / `BACK_URL`. Removal scheduled for v0.2 once the 13 consumer files migrate.

### Not Yet Done (deliberately deferred)

- Drop the `TEST_ENV='vcst'` default in `config.js` — breaking change pending coordinated update across npm scripts + GitHub Actions workflows.
- Tag remaining Frontend suites with `storefrontProfile[]` — needs content review of ~10 obvious-B2B suites.
- Tag write-suites with `envRiskGate: "staging"` — needs read/write classification per suite.
- Generalize the payment matrix (suite 039 split per processor).
- Move admin role names to `aliases.json`.
- Refactor ~1300 vcst-ism refs in `knowledge/` (live-discovery, test-runner-tags, critical-ui-scope, shared-instructions, graphql-test-cases-runner) — case-by-case judgment between template-via-@td vs annotate-as-example.
- `docs/migrations/` directory for breaking-change migration guides (created when first such change ships).
- `CHANGELOG.md` entry-by-entry SHA links — added when first tagged release ships.

### Verified

- `npm run env:check` — green on `TEST_ENV=vcst`
- `TEST_ENV=customer-staging-eu npm run env:check` — exits with helpful underscore hint (kebab-case validation works)
- `ENV_RISK=production npm run env:check` — prints production warning at startup
- `npm run plugin:check` — manifest OK, .env.vcst present, .env.local present, env:check delegated successfully
- `npx tsx scripts/validate-td-refs.ts` — 79/79 suites resolve `@td()` references
- `npx tsx scripts/tag-suites-multi-env.ts` — idempotent (re-run = no-op after first run)
- `npx tsx scripts/detect-vcst-isms.ts --suites` — 0 findings (suite CSVs clean)
- `npx tsx scripts/detect-vcst-isms.ts --agents` — 0 findings (agent prompts clean)
- `npm run suites:lint` — 99 suites, 35 selections, schema valid

---

## How Versions Will Be Assigned (going forward)

When the first tagged release cuts:

- **v0.1.0-alpha** — current branch tip. First customer-installable build. NOT for production use.
- **v0.1.x** — bugfix patches against the alpha (no new features).
- **v0.2.0** — after Pilot 1 completes. Folds in pilot feedback's `must-fix-before-next-pilot` items.
- **v0.5.0** — after 3 pilots complete. Triage stabilizes; documentation refines.
- **v1.0.0** — Tier A formally frozen per `docs/versioning.md`. Public GA.

Each release cuts from `feature/qa-agentic-standardization` (or its successor branch). Tags follow the form `v0.1.0-alpha`, `v0.1.0`, `v0.2.0-beta`, etc.

---

## References

- Strategic plan: [`~/.claude/plans/functional-singing-cosmos.md`](file:///~/.claude/plans/functional-singing-cosmos.md)
- Tier classification: [`.claude/architecture/TIER.md`](.claude/architecture/TIER.md)
- Versioning contract: [`docs/versioning.md`](docs/versioning.md)
- Customer onboarding: [`docs/onboarding.md`](docs/onboarding.md)
- Pilot runbook: [`docs/pilot-runbook.md`](docs/pilot-runbook.md)
- Distribution model: [`docs/distribution.md`](docs/distribution.md)
