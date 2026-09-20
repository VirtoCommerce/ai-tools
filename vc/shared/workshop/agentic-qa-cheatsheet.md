# Agentic QA Quick Reference

Workshop hand-out. **No counts are transcribed here** — a transcribed count is correct once and stale
by the next merge. Where you see "run `ls …`" or "run `npm run …`", that command IS the answer.

Normative sources, in order: [`CLAUDE.md`](../../../CLAUDE.md) → [`.claude/rules/`](../../../.claude/rules/) →
[`.claude/ROUTING.md`](../../../.claude/ROUTING.md) (the decision tree: which command/skill/agent for which job).

---

## 0. Three surfaces — know which one you are on

| Surface | Lives in | Reaches you how | Contains |
|---|---|---|---|
| **`vc-qa`** (this repo) | `.claude/{commands,agents,skills,knowledge,rules,hooks}` | Auto-discovered on any clone — no install | The full QA + BA offering: `/qa-*`, `/ba-*` |
| **`vc-fix`** plugin | `plugins/vc-fix/` | `/plugin install vc-fix@vc-tools` | Bug lifecycle: `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, `/qa-monitoring`, `/project-init`, `/qa-env-check`, `/vc-self-check`, `/vc-feedback` + the dev/review team |
| **`vc-perf`** plugin | `plugins/vc-perf/` | `/plugin install vc-perf@vc-tools` (depends on `vc-fix`) | `/perf-init`, `/perf-loop`, `/perf-benchmark`, `/perf-fix`, `/perf-verify` + `perf-analyst` |

Marketplace: `/plugin marketplace add VirtoCommerce/vc-mcp-testing-module`.
Versions are per-plugin (`plugins/*/.claude-plugin/plugin.json`) — read them, don't quote them.

**On a fresh machine / new customer: run `/project-init` first.** It writes `project-profile.json`,
`.env.<env>`, `.env.local` and `.mcp.json`, then prints a readiness table. Follow with `npm run env:check`.

---

## 1. Commands

`ls .claude/commands/` for the live roster; each file's frontmatter carries its own `argument-hint`
(that is also what the `/` menu shows). The ones you reach for most:

| Command | Arguments | Use for |
|---------|-----------|---------|
| `/qa-smoke` | `[storefront\|admin]` | Pre-deploy P0 gate (suites 042 + 078). GO / CONDITIONAL GO / NO-GO |
| `/qa-test` | `<ticket-key> \| feature \| PR #N \| --epic <KEY>` | The main pipeline. **Step 1a routes by ticket type × status** — a fix-ready Bug runs `/qa-verify-fix` inline |
| `/qa-regression` | `[smoke\|critical\|sprint\|full\|frontend\|backend\|IDs]` | Parallel suite execution across 3 browser slots |
| `/qa-triage-results` | `[RUN_ID\|latest] [--fix] [--verify]` | Classify a run's FAIL/BLOCKED/SKIPPED: product bug vs test defect vs flaky |
| `/qa-test-lifecycle` | `suite <ID> \| domain <name> \| <ticket> \| PR #N \| diff` | Detect stale cases → sync → gap-fill → review → promote |
| `/qa-test-plan` | `SprintXX-YY \| current \| last` | Sprint test plan from Done items + PRs |
| `/qa-exploratory` | `[sprint\|ticket <KEY>\|checkout\|catalog\|B2B\|mobile\|new]` | Discovery-first — every run must surface a net-new scenario |
| `/qa-domain-map` | `<domain-slug> [--refresh]` | Build/refresh the persistent "what is this thing, where are its surfaces" map |
| `/qa-review-oracles` | `[bl\|ecl\|all] <scope> [--dry-run]` | Audit `BL-*` / `ECL-*` against docs + live + source, auto-apply confirmed |
| `/qa-seed-data` | `bootstrap\|minimal\|catalog\|b2b\|loyalty\|…\|teardown` | Provision / tear down fixtures |
| `/qa-status` | `[run\|jira\|env]` | Read-only dashboard, no browser |
| `/qa-design` | `component \| page \| flow [--storefront-only]` | BL-UI audit across Storybook + storefront |
| `/qa-hotfix` · `/qa-hotfix-check` | `VCST-XXXX …` | Cut a hotfix onto stable bundles · deliver + verify it on the stands |
| `/qa-deploy-pr` | `<ticket> [--pr …] [--apply] [--verify]` | Deploy all of a change's prerelease artifacts together |
| `/qa-local-env` | `[VCST-XXXX] [postgres\|mysql\|sqlserver]` | Local stack pinned to the deployed manifest |
| `/qa-sitemap` · `/qa-bundle-check` · `/qa-teams-watch` · `/qa-perf-measure` | see frontmatter | Sitemap refresh · bundle hotfix audit · Teams bug intake · backend work-per-request |
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|module <name>]` | Coordinates the 4 BA specialists |

**From the `vc-fix` plugin:** `/qa-bug` (file a bug) · `/qa-fix` (auto-fix through the G0–G7 ladder) ·
`/qa-verify-fix` (verify a fix — stops at TESTED, never auto-DONE) · `/qa-monitoring` (App Insights
triage) · `/qa-env-check` · `/project-init` · `/vc-self-check` · `/vc-feedback`.

---

## 2. Skills

`ls .claude/skills/` (plus `plugins/vc-fix/skills/`, `plugins/vc-perf/skills/`). A skill is
*methodology* — it loads when a step reads it, or you invoke it directly.

| Group | Skills |
|-------|--------|
| **Knowledge** | `/vc-docs` — VirtoOZ MCP (primary), Context7 fallback |
| **Test design** | `/qa-test-design` (FLOW first, then EP / BVA / decision tables / pairwise) · `/qa-test-cases-generator` · `/qa-checklist` · `/qa-plan` · `/qa-risk` |
| **Execution** | `/qa-test` · `/qa-api` · `/qa-postman` · `/qa-storybook` · `/qa-accessibility` · `/qa-design` · `/qa-sbtm` |
| **Data** | `/qa-generate-data` (design the combinations) → `/qa-seed-data` (provision + tear down) |
| **Review & method** | `/qa-review-tests` · `/qa-review-oracles` · `/qa-investigate` · `/qa-defect` · `/qa-evidence` · `/qa-metrics` · `/qa-coverage-gap` · `/qa-triage-results` |
| **Release / ops** | `/qa-hotfix` · `/qa-hotfix-check` · `/qa-bundle-check` · `/qa-deploy-pr` · `/qa-local-env` · `/qa-monitoring` · `/qa-perf-measure` · `/run-vc-mcp-testing-module` |
| **Dev (vc-fix)** | `/dotnet-unit-test` · `/dotnet-fix` · `/angular-admin` · `/vue-unit-test` · `/vue-fix` · `/vc-shell-fix` · `/qa-fix-routing` |

**Ask VirtoOZ before you guess.** When how the platform or the storefront is *supposed* to behave is
unclear, query `/vc-docs` before acting on it. Grounding order: this repo's knowledge → VirtoOZ →
live/source. A doc is authoritative for **mechanism**, never for exact UI strings or counts — those
are `{OBSERVED}`.

---

## 3. Agents

`ls .claude/agents/` for the roster. Models, browser lanes and delegation rules are normative in
[`.claude/rules/agents.md`](../../../.claude/rules/agents.md) — read it before dispatching.

| Team | Agent | Model | Browser lane |
|------|-------|-------|--------------|
| **QA** | `qa-lead-orchestrator` | sonnet | — · sole custodian of ticket STATUS; also the per-step **verifier** in `/qa-test` |
| | `qa-frontend-expert` | opus | `playwright-chrome` |
| | `qa-backend-expert` | opus | `playwright-edge` (Chrome DevTools for Admin SPA) |
| | `qa-testing-expert` | opus | `playwright-firefox` |
| | `ui-ux-expert` | sonnet | Chrome DevTools |
| | `test-management-specialist` | sonnet | `playwright-chrome` (sequential) |
| | `test-data-engineer` | opus | none — authors **and runs** the seeders |
| | `regression-orchestrator` · `test-runner-agent` | sonnet | — · assigned |
| **BA** | `ba-system-analyzer` | sonnet | `playwright-firefox` |
| | `ba-api-specialist` | sonnet | `playwright-edge` |
| | `ba-story-writer` · `ba-doc-writer` | sonnet | — · screenshots only |
| **Devs** | `fullstack-backend` · `fullstack-frontend` | opus | **none** — code only |
| | `backend-reviewer` · `frontend-reviewer` | sonnet | none — Gate 4 |

**Rules that bite:** never share a browser session between parallel agents · max 3 concurrent browser
agents (QA + BA combined) · never WebKit on Windows · close Chrome before `playwright-chrome` · an
MCP config change needs a server restart · Developers are the **only write-capable team**, single-repo
per run, and never auto-merge.

---

## 4. Common workflows

```bash
# One-time / new machine
/project-init                      # profile + .env + .mcp.json, then:
npm run env:check

# Daily pre-deploy gate (checklist-gated GO/NO-GO)
/qa-smoke

# Test a ticket — routes itself by type x status
/qa-test VCST-1234

# Regression
/qa-regression smoke               # fastest gate
/qa-regression sprint              # plan-driven (reads the newest sprint summary.json)
/qa-regression full                # everything the manifest does not exclude
/qa-regression 001,004,006         # ad hoc IDs
/qa-triage-results latest --fix    # classify the failures afterwards

# Bug lifecycle (vc-fix plugin)
/qa-bug Cart total shows $0 after coupon applied
/qa-fix VCST-1234                  # G0-G7 ladder, opens a PR, never merges
/qa-verify-fix VCST-1234           # stops at TESTED, never auto-DONE

# Coverage & knowledge
/qa-domain-map checkout --refresh
/qa-exploratory checkout
/ba-analyze flows

# Direct agent usage
"Use qa-frontend-expert to test the checkout flow"
"Use qa-backend-expert to verify the GraphQL catalog queries"
"Use ui-ux-expert to audit accessibility on the product page"
```

---

## 5. Regression selection groups

**Membership lives in `config/test-suites.json` → `selections`, never here.**
`npm run suites:lint` prints the suite and case totals; `npm run regression:plan -- <name>` resolves a
group to its actual suite list. Besides the classics there are `domain:*` and `concern:*` groups —
read the manifest.

| Selection | When to reach for it |
|-----------|----------------------|
| `smoke` | Daily validation before deployment |
| `critical` | P0 suites only |
| `purchase-flow` | Cart → checkout → orders → payment, end to end |
| `catalog` · `search` · `orders` · `auth` · `b2b` · `marketing` · `platform` · `loyalty` · … | One module, frontend + admin |
| `frontend` · `backend` | One layer, minus the manifest's exclusions |
| `sprint` | Plan-driven — `suitesActivated[]` from the newest sprint plan |
| `sprint:XX-YY` | Re-run a past sprint's scope, pinned to that plan |
| `full` | Everything not excluded — before a production release |

---

## 6. Gates & verdicts

- **Smoke is gated by the checklists, not by a pass-rate number.** Any checkout / payment /
  cross-layer-parity / admin-Critical failure ⇒ **NO-GO**; 3+ failures ⇒ NO-GO. Run
  `npm run suites:gates` first — a case with no checklist item cannot produce a NO-GO.
  Verdicts: **GO / CONDITIONAL GO / NO-GO**.
- **Bug auto-fix** runs the **G0 → G7 ladder** with ownership routing, client-code containment and a
  triple no-auto-merge guard — normative in
  [`quality-gates.md`](../../../.claude/knowledge/execution/quality-gates.md). A STOP / BAIL is a
  **success**, not a failure.
- **Ticket status** moves at most twice per run, and only `qa-lead-orchestrator` moves it — never past
  `TESTED` ([`ticket-status-transitions.md`](../../../.claude/knowledge/execution/ticket-status-transitions.md)).

---

## 7. Key paths

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Always-loaded project rules |
| `.claude/rules/` | Always loaded: `agents.md` · `regression.md` · `reports.md` · `test-data.md` |
| `.claude/ROUTING.md` | Decision tree — which command / skill / agent |
| `.claude/{commands,agents,skills}/` | The `vc-qa` component surface (project-scoped, no plugin manifest) |
| `.claude/knowledge/` | On demand: `execution/` · `domain/` · `oracles/` · `agents/` · `automation/` · `api/` |
| `.claude/knowledge/domain/<slug>.md` | What a domain IS — actors, value chain, surfaces per layer, where layers disagree |
| `.claude/knowledge/oracles/` | `BL-*` invariants · `ECL-*` edge-case library · bug catalog |
| `plugins/vc-fix/` · `plugins/vc-perf/` | The two distributed plugins (deliberately self-contained) |
| `config/test-suites.json` | Regression manifest — **source of truth** for suites and selections |
| `regression/suites/{Frontend,Backend}/` | Agent-native CSV suites in module-aligned subdirs |
| `test-data/` · `scripts/seed-data/` | Fixtures + `@td()` aliases · the seeders |
| `reports/{bugs,regression,tickets,ba,monitoring,exploratory,knowledge,performance}/` | The only report categories |
| `vc/shared/docs/prompts/` | Interactive prompt templates |
| `config.js` · `.env.*` | Layered environment loader (§8) |
| `.mcp.json` | MCP servers — **gitignored, per machine** |
| `docs/decisions/` | Never loaded — rationale, post-mortems, retired designs |

---

## 8. Environment

Layered loader keyed by `TEST_ENV` (default `vcst`). Later overrides earlier:

```
.env.defaults → .env.${TEST_ENV} → .env.local → .env (legacy fallback)
```

| Layer | Holds | Committed? |
|---|---|---|
| `.env.defaults` | Cross-env constants (sandbox cards, builder.io) | yes |
| `.env.vcst` · `.env.vcptcore` · `.env.virtostart` | Per-env URLs and identifiers | yes — no secrets |
| `.env.local` · `.env.playwright.local` | Passwords, API tokens | **gitignored** |

Variable groups: **URLs** (`FRONT_URL`, `BACK_URL`, `STORYBOOK_URL`, …) · **Credentials** (`ADMIN`,
`USER_EMAIL`, `ORG_USER_EMAIL`, `MULTI_ORG_USER_*`, `LOCKOUT_TEST_*`, `EUR_USER_*`, …) · **Store**
(`STORE_ID`) · **Payment sandboxes** (Skyflow · CyberSource · Authorize.Net · Datatrans) · **APIs**
(`FIGMA_API_KEY`, `POSTMAN_API_KEY`, `BROWSERSTACK_*`) · **Azure / App Insights**
(`AZURE_SUBSCRIPTION_ID`, `APPINSIGHTS_APP_ID_*`) · **CI** (`ANTHROPIC_API_KEY`, `TEAMS_WEBHOOK_URL`).

```bash
npm run env:check                       # validate the active layer
TEST_ENV=vcptcore npm run env:check     # switch env
```

Resolve a variable through `process.env` **after importing `config.js`** — the curated `env` export
does not carry every key, and a key it lacks is indistinguishable from one that is genuinely unset.

**Never hardcode.** Four data layers: `{{VAR}}` (env) · `@td(ALIAS.field)` (fixtures you assert on) ·
`live-discover` (IDs that drift between seeds) · `random-data` (unique inputs, `AGENT-TEST-` prefix so
teardown sweeps them). See [`.claude/rules/test-data.md`](../../../.claude/rules/test-data.md).

---

## 9. MCP servers

Project-level, in `.mcp.json` (gitignored — create it locally from `templates/.mcp.json.example`):

| Server | Purpose | Config |
|--------|---------|--------|
| `playwright-chrome` | Chromium automation | `config/mcp-playwright-chrome.config.json` |
| `playwright-firefox` | Firefox — **full click-capable lane** since 2026-09-08 (needs the occlusion-tracking flag, a server restart, and a PINNED `@playwright/mcp`) | `config/mcp-playwright-firefox.config.json` |
| `playwright-edge` | Edge (`msedge` channel) | `config/mcp-playwright-edge.config.json` |
| `playwright-mobile` | 390×844 portrait, `deviceScaleFactor: 3` | `config/mcp-playwright-mobile.config.json` |
| `postman` | Collections, environments, monitors | `--minimal` |
| `github` | PRs, issues, code search | `GIT_TOKEN` |
| `context7` | Library docs — fallback for VC docs | `CONTEXT7_API_KEY` |

User / IDE level: **VirtoOZ** (primary VC docs, via `/vc-docs`) · **Chrome DevTools** · **Atlassian** ·
**Azure** · **Figma** · **Microsoft Learn** · **Serena** (semantic code navigation — per-machine
install, needs `uv`/`uvx` on PATH, then restart Claude Code).

All lanes capture HAR, run isolated contexts at 1920×1080, and **record video always** (flushed on
`browser_close`, not continuously). Crop evidence with `element` + **`target`** — passing `ref` is
silently ignored and you get a full-viewport shot.

**Browser login secrets** go through Playwright MCP `--secrets .env.playwright.local` — type the
**bare key name** (`ORG_USER_PASSWORD`), never `{{VAR}}`. A miss is **silent**: the literal string is
typed and the only symptom is "Check your credentials". Confirm the hit in the tool output —
`fill(process.env['NAME'])` on a hit, `fill('NAME')` on a miss. Chrome DevTools MCP has **no**
`--secrets`. Details: [`browser-lanes.md`](../../../.claude/knowledge/execution/browser-lanes.md).

---

## 10. npm scripts

`package.json` → `scripts` is the roster, and it moves weekly:

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).join('\n'))"
```

| Family | What it does |
|--------|--------------|
| `env:check` | Validate the active env layer — **run this before anything else** |
| `ci:*` | Headless pipelines: `ci:smoke`, `ci:critical`, `ci:frontend`, `ci:backend`, `ci:full`, `ci:regression`, `ci:cycle*`, `ci:fix*`, `ci:monitor*`, `ci:audit*`, `ci:notify` |
| `seed:*` | Seed / teardown per domain (`seed:bootstrap`, `seed:b2b`, `seed:loyalty`, `seed:teardown`, `seed:dry-run`, …) |
| `suites:*` | Manifest health: `suites:lint` (prints the suite + case totals), `suites:gates`, `suites:lanes`, `suites:filter` |
| `td:*` | Test-data guards: `td:validate`, `td:validate:<domain>`, `td:reconcile`, `td:mutation-check` |
| `regression:plan` · `regression:select` · `regression:reap` | Resolve a selection · change-scoped selection · orphan-run backstop |
| `tc:*` | Case scaffold / alloc / scope / promote |
| `context:check` | Lint the always-loaded tier (budgets, dangling paths) — runs on every PR |
| `domain:check` · `oracles:rank` · `bl:lint` · `ecl:lint` | Knowledge freshness + oracle value gates |
| `test` | Unit tests plus the gates |

**Nothing in `ci/` runs unattended.** Every `cron:` in `.github/workflows/` is commented out, and the
regression workflow was removed 2026-09-08 — the *runner* is unaffected (`npm run ci:regression`, the
Docker image, and `full-cycle.yml` Phase 3 all still drive it).
