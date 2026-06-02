# Changelog

All notable changes to the VC QA plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver per [`docs/versioning.md`](docs/versioning.md). **Breaking changes are flagged `**BREAKING:**`** and paired with a migration note.

> **Tier-A changes are flagged `**Tier A:**`** so reviewers know to read carefully — those affect the standardization contract.

---

## [Unreleased] — `feature/qa-agentic-standardization`

The first stretch of customer-plugin work. Not yet released. Pin to commit SHA if consuming pre-release.

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
