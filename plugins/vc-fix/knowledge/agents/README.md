# Agent System — vc-fix

`vc-fix` ships a narrow slice of the full `vc-qa` agent crew, scoped to five workflows: project
setup (`/project-init`), bug filing (`/qa-bug`), bug fixing (`/qa-fix` + its dev team), bug
verification (`/qa-verify-fix`), online bug monitoring (`/qa-monitoring`), and plugin
self-diagnostics (`/vc-self-check`) + direct feedback (`/vc-feedback`). **10 agents, 8 commands, 16 skills** — no regression
orchestration, no BA team, no Storybook/a11y/design-system tooling. Those live only in the full
`vc-qa` plugin (not shipped here).

## Quick Start

```
/project-init                # Onboard: env, bug tracker, code host, project-profile.json
/qa-bug <description>        # Reproduce, document, optionally file a bug
/qa-fix VCST-1234            # Autonomous fix of an already-filed bug
/qa-verify-fix VCST-1234     # Verify a fix, transition the ticket
/qa-monitoring both          # Query App Insights, dedup, triage, live-repro, report
/vc-self-check               # Diagnose whether the plugin's own skills ran correctly
/vc-feedback "…" 👎          # Attach your own verdict to this session (silent-failure signal)
```

---

## Agent Inventory (10 agents)

### QA specialists (4) — read-only, no shared-instructions file

| Agent | Model | Purpose |
|-------|-------|---------|
| **qa-frontend-expert** | opus | Customer-facing storefront, user journeys, checkout flows — used by `/qa-bug` (repro) and `/qa-verify-fix`/G6 (frontend E2E verification), and by `/qa-monitoring` for frontend live repro |
| **qa-backend-expert** | opus | Platform APIs, GraphQL xAPI, Modules, Admin SPA — used by `/qa-bug` (repro) and `/qa-verify-fix`/G6 (backend E2E verification), and by `/qa-monitoring` for backend live repro |
| **qa-testing-expert** | opus | Interactive testing, debugging, evidence collection — used by `/qa-bug` for live reproduction |
| **monitor-triage-agent** | sonnet | Classifies a deduplicated App Insights error signature (REAL_BUG / KNOWN_ISSUE / CONFIG_GATED / THIRD_PARTY / TRANSIENT / NOISE) with severity + repo route — used by `/qa-monitoring` |

### Developers team (4) — the only write-capable agents

The **only write-capable team** (clone / branch / commit / push / open PR via local `git`/`gh`). QA
agents stay read-only. Driven by `/qa-fix`; reuses the self-contained `skills/qa-fix-routing/`
skill (an extract of `ci/lib/repo-router.ts` + `ci/lib/module-registry.ts` etc. from the full
`vc-qa` plugin's `ci/` directory — not shipped here). **One developer + one reviewer per repo
kind**, picked by the routed repo's `kind`. Gate ladder: `.claude/rules/quality-gates.md`. **Never
auto-merges.** No browser.

| Agent | Model | Purpose |
|-------|-------|---------|
| **fullstack-backend** | opus | Fixes a single `vc-module-*` / `vc-platform` repo — .NET 10 / C# + the module's Admin SPA (Angular). Reproduce-as-test → minimal fix → PR. Skills: `/dotnet-unit-test`, `/dotnet-fix`, `/angular-admin`. |
| **backend-reviewer** | opus | Reviews the C#/Angular local diff before the PR (Gate 4): single-repo, no test edits, no breaking changes, BL-* preserved, minimal & idiomatic. |
| **fullstack-frontend** | opus | Fixes the `vc-frontend` storefront — Vue 3 / TS / Vite + the in-repo UI kit + Storybook — **and** a `module` repo's declared embedded frontend sub-app on the same stack (e.g. `vc-module-pagebuilder`'s Vue 3 shell), scoped to the sub-app path within that module's single-repo checkout. Reproduce-as-vitest-test (or, for a module sub-app, its own `tsx --test`/ephemeral harness) → minimal fix → PR. Skills: `/vue-unit-test`, `/vue-fix`, `/vc-shell-fix` (module-embedded sub-app). |
| **frontend-reviewer** | opus | Reviews the Vue/TS local diff before the PR (Gate 4): single-repo, no test/story edits, no breaking prop/event/slot or GraphQL contract, BL-UI preserved, minimal & idiomatic. |

**Dropped from the full `vc-qa` crew** (not shipped in `vc-fix`): `qa-lead-orchestrator` (its
Gate-0/1 triage role is spelled out inline in `qa-fix.md`/`qa-bug.md`/`quality-gates.md` — the
top-level session performs it directly), `ui-ux-expert`, `regression-orchestrator`,
`autonomous-regression-orchestrator`, `test-runner-agent`, `autonomous-test-runner`,
`test-management-specialist`, and all 4 `ba-*` agents.

### Self-diagnostics (2) — read-only, invoked by `/vc-self-check`

| Agent | Model | Purpose |
|-------|-------|---------|
| **self-check-diagnostician** | sonnet | Tier-2 diagnostician of the client→vendor feedback loop: given one session id, reads its telemetry jsonl + transcript + the `skill-expectations.md` oracle, and returns ONLY a validated finding STRUCT (verdict + severity + evidence + root-cause + proposed fix + vendor-provenance fields). Writes no files, sends nothing. |
| **self-check-deliverer** | sonnet | Non-interactive deliverer: given the validated finding STRUCT and the operator's single consent, owns the whole delivery (dedup lookup, route selection, body composition, leak scan, sending, telemetry retention) by running `deliver.mjs`. Asks nothing further; the only thing it ever sends is a GitHub Issue/comment on `VirtoCommerce/vc-mcp-testing-module`. |

---

## Slash Commands (8)

| Command | Purpose |
|---------|---------|
| `/project-init` | Onboard this plugin: env name, bug tracker (Jira/Azure Boards), code host (GitHub/Azure Repos), auth, discover client/platform repo split, write `project-profile.json` + `.env.<env>` + `.mcp.json`, verify access. Day-2 modes (skip the interview): **`--add-env`** adds another environment (URLs + per-env access creds) to an onboarded project; **`--check`** reconciles the profile to the current schema after an upgrade, then verifies |
| `/qa-bug [description]` | Reproduce, document, and optionally file a bug |
| `/qa-fix VCST-XXXX` | Autonomous fix of an already-filed bug: triage → root-cause + single-repo route → reproduce-as-test → minimal fix → self code-review → branch + PR + CI/E2E → STOP for human review (never auto-merges) |
| `/qa-verify-fix VCST-XXXX` | Verify a bug fix: fetch ticket, reproduce STR, confirm fix, regression checks, transition the ticket |
| `/qa-monitoring [layer]` | Online bug monitoring from App Insights: query → dedup (fingerprint) → triage → live repro → report. Detect-and-report only — never files a ticket or auto-fixes |
| `/qa-env-check` | Validate env vars, endpoints, MCP servers |
| `/vc-self-check` | Self-diagnostics (Tier B): read this session's passive telemetry (`hooks/session-telemetry.mjs` → `.vc-fix/diagnostics/`) + transcript + the `knowledge/diagnostics/skill-expectations.md` oracle → per-skill verdict + severity + proposed fix → LOCAL `DIAG-*.md`. `deliver` sub-step contributes a scrubbed, consent-gated PR/issue to VirtoCommerce. Never modifies the install; model-invocable (no `disable-model-invocation`) so the end-of-turn tail-trigger can auto-run it silently; recursion blocked by span-drop + `selfCheckSeen` + per-signature dedup |
| `/vc-feedback` | Attach an explicit 👍/👎 verdict (with optional note) to the current session's telemetry trace — the main detector of SILENT failures (a task done wrong with no error). Local + silent: recorded by the `UserPromptSubmit` hook; nothing is sent until the separate consent-gated `deliver` step |

**Dropped from the full `vc-qa` crew:** `/qa-smoke`, `/qa-test`, `/qa-regression`,
`/qa-coverage-generation`, `/qa-test-lifecycle`, `/qa-test-plan`, `/qa-sync-tests`,
`/qa-seed-data`, `/qa-design`, `/qa-exploratory`, `/qa-status`,
`/qa-onboarding`, `/qa-hotfix`, `/qa-bundle-check`, `/qa-local-env`, `/ba-analyze`,
`/ba-stories` — full `vc-qa` plugin only, not shipped here.

---

## Workflow Architecture

```
                        USER
              ┌──────────┼──────────┬──────────────┐
       /project-init   /qa-bug   /qa-fix VCST-XXXX   /qa-verify-fix VCST-XXXX
                          │           │                        │
                    qa-testing-  triage (G0/G1) via       qa-backend-expert /
                    expert /     skills/qa-fix-routing/    qa-frontend-expert
                    qa-backend-/       │
                    qa-frontend-  fullstack-backend or
                    expert        fullstack-frontend
                                       │
                                  backend-reviewer or
                                  frontend-reviewer (Gate 4)
                                       │
                                  PR open, human review (never merged)
```

`/qa-monitoring [layer]` is a separate entry point: it queries App Insights, dedups via
`skills/qa-monitoring/fingerprint-store.ts`, triages with `monitor-triage-agent`, live-repros
HIGH-confidence findings with `qa-frontend-expert`/`qa-backend-expert`, and drafts a bug report
with a `## Fix Routing` block — the same contract `/qa-bug` produces, so a confirmed draft can
be handed to `/qa-fix` by the user.

### Browser Isolation

Each parallel QA agent MUST use its own Playwright MCP server:

| Agent | Primary Browser | Fallback |
|-------|----------------|----------|
| qa-frontend-expert | playwright-chrome | — |
| qa-backend-expert | playwright-edge | Chrome DevTools |
| qa-testing-expert | playwright-firefox | — |

The dev team (`fullstack-backend`, `fullstack-frontend`, reviewers) uses no browser — code only.
Max 3 concurrent browser agents. Never use WebKit on Windows. Full reference: `.claude/rules/mcp-browsers.md`.

---

## Prompt Architecture (QA Agents)

QA agents use a **four-layer prompt architecture**:

1. **Business Logic** (invariants) — what the correct business outcome is → `knowledge/oracles/business-logic.md`
2. **Domain Knowledge** (judgment) — what good implementation looks like
3. **Skill Set** (technique) — how to find what's broken
4. **Design Decisions** (constraints) — tools and boundaries

Shared knowledge files live in `knowledge/` (duplicated into this plugin from the full `vc-qa`
repo, minus the BA-only files). Includes `business-logic.md`, `graphql-schema.md`,
`graphql-test-cases-runner.md`, `live-discovery.md`, `vc-module-architecture.md`,
`vc-frontend-architecture.md`.

---

## Customizing Agents

All 8 agents are flat `.md` files at the plugin root `agents/` (plugin agent discovery is
non-recursive — no team subfolders). The developers team's `shared-instructions.md` lives under
`knowledge/agents/developers/`. Each agent is a Markdown file with YAML frontmatter (name,
description, model, color). Edit the `.md` file to customize behavior.

---

## Documentation Sources (all agents)

For any Virto Commerce platform / module / API / storefront / deployment / B2B question, **all
agents must query VirtoOZ MCP first** via the `/vc-docs` skill. VirtoOZ exposes 12 topic-scoped
retrieval tools — pick the narrowest one (e.g. `PlatformDeveloperGuide` for backend API questions,
`StorefrontDeveloperGuide` for vc-frontend, `B2BExperts` for B2B-specific guidance, `*SourceCode`
tools for code-level questions). Context7 (`/virtocommerce/vc-docs`) is the fallback when VirtoOZ
returns thin results or for non-VC libraries. Full tool list and routing rules in
`skills/vc-docs/SKILL.md` and `.claude/rules/mcp-browsers.md`.

## Requirements

- Claude Code with subagent/Task tool support
- MCP servers configured in `.mcp.json` (Playwright chrome/firefox/edge, github)
- User/IDE-level MCPs configured: Chrome DevTools, Azure, Atlassian, **VirtoOZ**
- `.env` with environment URLs and credentials (run `npm run env:check` or `/qa-env-check`)
