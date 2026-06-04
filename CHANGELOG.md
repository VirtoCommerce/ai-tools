# Changelog

All notable changes to the VC QA plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver per [`docs/versioning.md`](docs/versioning.md). **Breaking changes are flagged `**BREAKING:**`** and paired with a migration note.

> **Tier-A changes are flagged `**Tier A:**`** so reviewers know to read carefully — those affect the standardization contract.

---

## [Unreleased]

Forward-looking work on top of v0.3.0. Pin to v0.3.0 for stability; this branch tip is unstable.

### Added

#### Bug auto-fix pipeline (interactive + headless twins) — PR #20
- **`.claude/rules/quality-gates.md`** — single source of truth for the auto-fix gate ladder **G0–G7**: fix-eligibility triage → single-repo route → reproduce-as-failing-test (red) → minimal fix (green) → code review → build/CI → E2E verification → **human review (never auto-merge)**. Both entry points reference gates by ID and share the no-auto-merge triple guard (permission deny + orchestrator + agent).
- **`/qa-fix VCST-XXXX`** (`.claude/commands/qa-fix.md`) — interactive autonomous fix of an already-filed bug. Interactive twin of `ci/run-fix-cycle.ts` (same relationship as `/qa-regression` ↔ `ci/run-regression.ts`).
- **`developers/` agent team** — first write-capable team, isolated from read-only QA agents: `fullstack-backend` (opus; .NET 10 / C# + module Admin SPA Angular, reproduce-as-test → minimal fix → PR) and `backend-reviewer` (opus; Gate-4 diff review before the PR). Plus `shared-instructions.md`.
- **Headless CI auto-fix** — `ci/run-fix-cycle.ts` + `.github/workflows/auto-fix.yml` (JIRA bug → draft PR): `ci/agents/fix-triage-agent.md` / `fix-backend-agent.md` / `fix-frontend-agent.md`, repo allowlist `ci/config/fix-repos.json`, routing/checkout `ci/lib/repo-router.ts`, live module dependency graph `ci/lib/module-registry.ts` (Platform API, cached). npm scripts: `ci:fix`, `ci:fix:dry`.
- **Development skills** (`.claude/skills/development/`, used by `fullstack-backend`): `/dotnet-unit-test` (red repro as xUnit test, never edits existing tests), `/dotnet-fix` (minimal idiomatic .NET 10 fix + build/test gate), `/angular-admin` (module Admin SPA fixes; red→green via uncommitted Node scratch harness since module repos ship no JS test runner).
- **`.claude/agents/knowledge/vc-module-architecture.md`** — VC module repo anatomy + .NET 10 / xUnit / Angular conventions for the fix agents.
- **Dedicated write token** — `GITHUB_FIX_BUGS_TOKEN` → `GH_TOKEN` for `/qa-fix` push/PR scope; QA agents stay read-only on GitHub.

### Changed

- **`regression/suites/Backend/graphql/050j-graphql-xmarketing.csv`** — +7 cases (13 → 20): VCST-5022 `promotionCoupons` sort coverage — 3 regression guards (endDate/name honored, `;` multi-field separator, silently-ignored syntaxes) + lifecycle sync. Manifest `testCount` updated.
- **`regression/suites/Backend/customer/026-customer-contacts.csv`** — CUST-055 updated for the new `va-filter-panel` contacts filter UI (VCST-5148, PR #24).
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
- **`.claude/agents/knowledge/storefront-selectors.md`** — paths updated from root `tests/` to `vc/vcst-qa/tests/` (Layer 2 split).

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
- `node .claude/skills/run-vc-mcp-testing-module/driver.mjs` — 7/7 checks pass
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
- **`.claude/commands/qa-onboarding.md`** — customer's post-install entry-point slash command. 7-step guided flow + `tour` / `smoke` / `troubleshoot` sub-modes.
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

- **`.claude/commands/qa-env-check.md`** — rewritten for dual-surface validation. Active config panel front-loaded (TEST_ENV, ENV_RISK, STOREFRONT_PROFILE, MODULES_ENABLED, JIRA_PROJECT_KEY). Storefront and Admin SPA validated independently. Platform health endpoint corrected to `/health` (not `/api/platform/healthcheck`).
- **`.claude/commands/qa-bug.md`** — `Project: VCST` instruction now reads from `env.JIRA_PROJECT_KEY` (defaults to VCST for backwards compat).
- **`.claude/commands/qa-status.md`** — JQL hardcoded `project = VCST` now uses `${JIRA_PROJECT_KEY}` substitution.
- **`.claude/commands/qa-test-plan.md`** — same: 5 JQL queries parameterized.
- **`.claude/skills/qa-methodology/qa-defect/defect-lifecycle-workflow.md`** — same: 3 JQL queries parameterized.
- **`.claude/agents/knowledge/sitemap.md`** — B2B virtual catalog root GUID refs refactored to `@td(VIRTUAL_CATALOG_B2B.id)` with educational qualification ("vcst-qa value is X, customer differs").

### Deprecated

- `VIRTO_START_FRONT` / `VIRTO_START_BACK` exports in `config.js` marked with `TODO(qa-agentic-standardization)` — these are vcst-internal env field names. Consumers should switch to `TEST_ENV=virtostart` + the standard `FRONT_URL` / `BACK_URL`. Removal scheduled for v0.2 once the 13 consumer files migrate.

### Not Yet Done (deliberately deferred)

- Drop the `TEST_ENV='vcst'` default in `config.js` — breaking change pending coordinated update across npm scripts + GitHub Actions workflows.
- Tag remaining Frontend suites with `storefrontProfile[]` — needs content review of ~10 obvious-B2B suites.
- Tag write-suites with `envRiskGate: "staging"` — needs read/write classification per suite.
- Generalize the payment matrix (suite 039 split per processor).
- Move admin role names to `aliases.json`.
- Refactor ~1300 vcst-ism refs in `.claude/agents/knowledge/` (live-discovery, test-runner-tags, critical-ui-scope, shared-instructions, graphql-test-cases-runner) — case-by-case judgment between template-via-@td vs annotate-as-example.
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
