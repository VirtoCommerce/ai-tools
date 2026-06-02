# CI Testing with Claude Agent SDK

Automated regression and test lifecycle management for Virto Commerce via GitHub Actions and Docker.

## Architecture

```
GitHub Actions
  │
  ├── regression.yml ──── ci/run-regression.ts ──── Execute test suites
  │                             ├── Reads suite CSVs from regression/suites/
  │                             ├── Reads agent defs from ci/agents/
  │                             ├── Calls Agent SDK query() with Playwright MCP
  │                             ├── Validates env vars, suite selection, CSV format
  │                             ├── Timeout per suite (10min default, configurable)
  │                             └── Writes reports/regression/ci-YYYY-MM-DD/
  │
  ├── full-cycle.yml ──── ci/run-full-cycle.ts ──── Sync → Lifecycle → Regression
  │                             ├── Phase 1: Sync test cases with code changes
  │                             ├── Phase 2: Static quality review (7 dimensions)
  │                             ├── Phase 3: Delegates to run-regression.ts
  │                             └── Writes reports/full-cycle/CYCLE-*/
  │
  ├── auto-fix.yml ────── ci/run-fix-cycle.ts ───── Triage → Fix → Draft PR (per JIRA bug)
  │                             ├── Fetches JIRA bug + linked reports/bugs/*.md
  │                             ├── Phase 0: Triage gate (real code defect? which repo?)
  │                             ├── Checks out product source (vc-frontend / vc-module-* / vc-platform)
  │                             ├── Phase 1: Reproduce-as-test → fix → build/lint/typecheck/test
  │                             ├── Opens a DRAFT PR (gh) + comments/transitions JIRA
  │                             └── Writes reports/fixes/FIX-*/
  │
  └── (all) ───────────── ci/notify-teams.ts ────── Teams Adaptive Card notification
```

## Quick Start

### Run locally

```bash
# Smoke regression (simplest)
npm run ci:smoke

# Critical P0 suites
npm run ci:critical

# Full cycle: sync test cases with a PR, then review + regress
CHANGE_SOURCE="PR #123" npm run ci:cycle

# Sync only (no regression)
CHANGE_SOURCE="diff" npm run ci:cycle:sync-only
```

### Run with Docker

```bash
docker build -t vc-regression -f ci/Dockerfile .

docker run --rm \
  --shm-size=2gb \
  --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  -v $(pwd)/reports:/app/reports \
  vc-regression
```

### Run via GitHub Actions

1. Go to **Actions** tab
2. Select **Regression Tests** or **Full Test Cycle**
3. Click **Run workflow** and configure inputs

## Pipelines

### Regression Only (`regression.yml`)

Executes test suites against the live environment.

**Triggers:**
- Manual (`workflow_dispatch`)
- Daily smoke: Mon-Fri 6:00 AM UTC (suite 01, $5 budget)
- Weekly full: Sunday 2:00 AM UTC (all suites, $80 budget)

### Full Cycle (`full-cycle.yml`)

Syncs test cases with code changes, validates them, then runs regression.

**Triggers:**
- On PR merge to main (auto-detects PR number)
- Daily: Mon-Fri 8:00 AM UTC (`diff` mode)
- Manual (`workflow_dispatch`)

**Phases:**
| Phase | Budget Share | What it does |
|-------|-------------|-------------|
| 1. Sync | 30% | Detect stale/broken cases, update steps/assertions, generate for new behavior |
| 2. Lifecycle | 20% | 7-dimension static quality review, auto-fix structural issues |
| 3. Regression | 50% | Execute affected suites via `run-regression.ts` |

Each phase can be skipped independently via `SKIP_SYNC`, `SKIP_LIFECYCLE`, `SKIP_REGRESSION`.

### Auto-Fix (`auto-fix.yml`)

Reads JIRA **bug** tickets and, for each one, opens a **draft PR** that fixes the
defect in the relevant *product* repo. This is the missing middle of the loop:
regression *finds* bugs → auto-fix *proposes a fix* → human reviews & merges →
regression *re-verifies* after deploy.

> **Key difference from regression:** regression drives a live deployed environment
> via Playwright (no source). Auto-fix **clones product source** (`vc-frontend`,
> `vc-module-*`, `vc-platform`) and edits code. It needs `gh` with write access to
> those repos, plus Node and .NET toolchains.

**Per-ticket phases:**

| Phase | Budget | What happens | Tools |
|-------|--------|--------------|-------|
| Context | — | Fetch JIRA issue (REST) + find linked `reports/bugs/*.md` | (orchestrator) |
| 0. Triage | 15% | Real, code-fixable defect? Route to a repo. **Bails on by-design / config-gated / env-data / API-only / no-STR.** | Read, Glob, Grep, Bash |
| (checkout) | — | Clone repo, cut branch `qa-autofix/VCST-XXXX` (deterministic) | `gh`, `git` |
| 1. Fix | 70% | Reproduce-as-test (red) → minimal fix → build + lint + typecheck + test (green) → commit + push | Read, Edit, Write, Glob, Grep, Bash |
| (PR + JIRA) | 15% | `gh pr create --draft`, label, JIRA comment + transition | `gh`, JIRA REST |

**Verification bars differ by layer:**
- **Frontend (vc-frontend):** self-verifiable in CI — `vue-tsc`, lint, **vitest** red→green, build. High-confidence draft PRs.
- **Backend (vc-module-* / vc-platform):** *static* only — `dotnet build` + `dotnet test` + xUnit red→green. The live storefront symptom **cannot** be re-verified here (needs redeploy); PRs are labeled "needs deploy verification" and the loop closes post-merge via the regression pipeline + `/qa-verify-fix`.

**Scale & dependencies (100+ module repos):** repos are **not** enumerated. The allowlist is **pattern-based** (`ci/config/fix-repos.json` → `allow.patterns`/`deny`/`explicit`). The dependency graph comes from the **Platform API** (`ci/lib/module-registry.ts`), not from scraping manifests:
- `GET /api/platform/modules` → installed modules with `Dependencies[]` and `ProjectUrl` (the authoritative module-ID → repo map — e.g. `VirtoCommerce.Xapi` → `vc-module-experience-api`, which a name heuristic can't derive).
- `POST /api/platform/modules/getdependents` → reverse graph (impact) in one call.

The fix prompt is given the routed module's dependencies, and the agent **bails on cross-module fixes** (root cause in a NuGet dependency needs human version-bump + publish coordination). Optional `FIX_IMPACT_ANALYSIS=true` adds *dependents* for post-merge regression scope. Auth is the standard platform password grant (admin creds from env — see `.claude/agents/knowledge/api-auth.md`); the module list is disk-cached (`MODULE_REGISTRY_TTL_H`, default 24h). All best-effort — if `BACK_URL`/creds are absent the pipeline still runs without dependency context.

**Safety model:** draft PRs only (never auto-merge) · pattern allowlist + org check (`isAllowedRepo` rejects anything off-org / off-pattern / denied) · by-design **triage gate** · cross-module **bail** · low-confidence fixes are **skipped** (JIRA comment) rather than PR'd · `gh` token scope is the real blast-radius control.

**Invoke:**

```bash
# One ticket, no writes (safe pilot) — needs ANTHROPIC_API_KEY + gh auth
FIX_TICKETS=VCST-5110 npm run ci:fix:dry

# One ticket for real (opens a draft PR, comments JIRA)
FIX_TICKETS=VCST-5110 npm run ci:fix

# Scan for labeled tickets (needs JIRA REST creds)
npm run ci:fix
```

**Env vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `GH_TOKEN` / `GITHUB_TOKEN` | yes | `gh` auth — PAT with **write** on the product repos (the default Actions token can't push to other repos) |
| `FIX_TICKETS` | one of | Comma-separated VCST keys (manual mode) |
| `FIX_LABEL` / `FIX_JQL` | one of | Scan mode — discover tickets by label (needs JIRA REST) |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | for JIRA | REST access for fetch/comment/transition. If absent, use `FIX_TICKETS` and JIRA writes are skipped. |
| `MAX_TICKETS` | no | Default `5` |
| `MAX_BUDGET_USD` | no | Default `30.0` |
| `MODEL` | no | Default Sonnet; set Opus for harder fixes |
| `DRY_RUN` | no | `true` = no PR, no JIRA writes |
| `JIRA_TRANSITION` | no | Target status after PR (default `In Review`) |
| `FIX_REPO_ORG` | no | GitHub org override for the repo allowlist (default from `ci/config/fix-repos.json`). Use for customer forks / a different org. |
| `FIX_REPOS_CONFIG` | no | Path to the repo registry (default `ci/config/fix-repos.json`) |
| `BACK_URL` + `ADMIN`/`ADMIN_PASSWORD`/`STORE_ID` | for deps | Platform API access for the module dependency graph (`GET /api/platform/modules`, `getdependents`). Absent → pipeline runs without dependency context. |
| `MODULE_REGISTRY_TTL_H` | no | Hours to cache the installed-module list from the API (default `24`) |
| `MODULE_REGISTRY_CACHE` | no | Path to the module cache (default `ci/config/.module-registry.cache.json`, gitignored) |
| `FIX_IMPACT_ANALYSIS` | no | `true` = also fetch reverse dependents (`getdependents`) for impact notes |
| `FIX_INSECURE_TLS` | no | `true` = relax TLS cert validation for the Platform API (self-signed QA cert) |

**Output:** `reports/fixes/FIX-YYYY-MM-DD-HHMM/` — `fix-report.md`, `summary.json`, and per-ticket `<KEY>/` dirs (triage + fix transcripts, `ticket.json`, `PR_BODY.md`). Cloned source lives in `.fix-workspace/` (gitignored).

**Extending coverage:** module repos are auto-discovered — no list to maintain. To onboard a new *kind* of repo or change routing hints, edit **`ci/config/fix-repos.json`** (`allow.patterns`, `deny`, `explicit`, `routing`). For a different GitHub org / customer fork, set `FIX_REPO_ORG` or edit the config's `org`. Build/lint/test commands per repo *kind* live in `REPO_PROFILES` in `ci/lib/repo-router.ts`.

## Suite Selection

| Selection | Suites | Description |
|-----------|--------|-------------|
| `smoke` | 01 | Daily pre-deploy validation |
| `critical` | 01, 06, 08, 14 | P0 revenue-critical suites |
| `sprint` | 33 suites | Before sprint release |
| `full` | All 45 suites | Before production release |
| `frontend` | 01-13, 35-36, 41 | Frontend only (18 suites) |
| `backend` | 14-34, 37-40, 42 | Backend only (26 suites) |
| `01,04a,06` | Custom | Comma-separated IDs |

Invalid suite IDs are caught at startup with helpful error messages.

## npm Scripts

```bash
npm run ci:regression          # Run regression (set SUITE_SELECTION env var)
npm run ci:smoke               # Smoke tests (suite 01)
npm run ci:critical            # P0 suites (01, 06, 08, 14)
npm run ci:frontend            # Frontend suites
npm run ci:backend             # Backend suites
npm run ci:full                # All 45 suites ($80 budget)
npm run ci:cycle               # Full cycle (set CHANGE_SOURCE env var)
npm run ci:cycle:pr            # Full cycle for a PR (set PR_NUMBER env var)
npm run ci:cycle:sync-only     # Sync phase only
npm run ci:cycle:no-sync       # Skip sync, run lifecycle + regression
npm run ci:notify              # Send Teams notification for latest run
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (validated at startup) |

### Recommended (tests fail without these)

| Variable | Description |
|----------|-------------|
| `FRONT_URL` | Storefront URL (default: vcst-qa-storefront.govirto.com) |
| `BACK_URL` | Platform/Admin URL (default: vcst-qa.govirto.com) |
| `ADMIN` / `ADMIN_PASSWORD` | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Primary test user |
| `USER2_EMAIL` / `USER2_PASSWORD` | Secondary test user |
| `STORE_ID` | Store identifier |

### Optional (for specific suites)

| Variable | Used by |
|----------|---------|
| `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` | Suite 06 (Payment) |
| `CYBERSOURCE_CARD`, `CYBERSOURCE_EXPIRY`, `CYBERSOURCE_CVV` | Suite 06 (Payment) |
| `AUTHORIZNET_CARD`, `AUTHORIZNET_EXPIRY`, `AUTHORIZNET_CVV` | Suite 06 (Payment) |
| `DATATRANCE_MASTERCARD`, `DATATRANCE_EXPIRY`, `DATATRANCE_CVV`, `DATATRANCE_OTP` | Suite 06 (Payment) |
| `TEAMS_WEBHOOK_URL` | Teams notifications |

### Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_BUDGET_USD` | `10.0` | Total budget cap for the run |
| `MAX_TURNS` | `100` | Max agent turns per suite |
| `MAX_PARALLEL` | `3` | Max concurrent suites |
| `SUITE_TIMEOUT_MS` | `600000` | Per-suite timeout (10 min) |
| `MODEL` | `claude-sonnet-4-5-20250929` | Claude model |
| `TEST_ENVIRONMENT` | `qa` | `qa` or `staging` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All suites passed |
| `1` | Real test failures (at least one suite errored) |
| `2` | Budget/turn limits hit (no real failures — consider increasing budget) |

## File Structure

```
ci/
├── run-regression.ts              # Suite execution orchestrator
├── run-full-cycle.ts              # Sync → Lifecycle → Regression pipeline
├── notify-teams.ts                # Teams Adaptive Card notifications
├── Dockerfile                     # Docker image (Playwright + Agent SDK)
├── tsconfig.json                  # TypeScript config
├── README.md                      # This file
├── agents/                        # CI-specific agent definitions
│   ├── qa-frontend-expert.md      # Storefront testing (cart, checkout, search)
│   ├── qa-backend-expert.md       # API, GraphQL, Admin SPA testing
│   └── qa-testing-expert.md       # General-purpose test execution
└── config/
    └── mcp-playwright-chrome.ci.json  # Headless Chromium config
```

## Reports

| Pipeline | Output Directory | Files |
|----------|-----------------|-------|
| Regression | `reports/regression/ci-YYYY-MM-DD/` | `summary.json`, `regression-report.md` |
| Full Cycle | `reports/full-cycle/CYCLE-YYYY-MM-DD-HHMM/` | `cycle-summary.json`, `cycle-report.md`, per-phase JSONs |
| History | `reports/regression/history.json` | Rolling 90-day run history |

## Agent Prompt Injection

`run-regression.ts` builds a prompt for each suite with:

1. **Run Configuration** — Run ID, date, environment, Frontend URL, Backend URL
2. **Credentials** — All `USER_*`, `ADMIN_*`, `STORE_ID`, payment test data
3. **Agent Instructions** — from `ci/agents/{agent-type}.md`
4. **Test Cases** — CSV content from `regression/suites/`
5. **Execution Rules** — Playwright MCP tool usage guidance

Agents read URLs from the `**Frontend URL:**` and `**Backend URL:**` labels in the Run Configuration section.

## Cost Optimization

- Default model is Sonnet (~5x cheaper than Opus)
- Budget caps enforced per suite and globally via `MAX_BUDGET_USD`
- Suite timeout prevents runaway spending (`SUITE_TIMEOUT_MS`)
- Turn limits per suite via `MAX_TURNS`
- Parallel batches of 3 balance speed vs. rate limits
- Start with `smoke` ($2-5) to validate setup before `full` ($40-80)
- Full cycle allocates budget: 30% sync + 20% lifecycle + 50% regression
