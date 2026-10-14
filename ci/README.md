# CI Testing with Claude Agent SDK

Automated regression and test lifecycle management for Virto Commerce via GitHub Actions and Docker.

## Architecture

```
GitHub Actions / CLI / Docker
  │
  ├── npm run ci:regression ─ ci/run-regression.ts ─ Execute test suites
  │                             ├── Reads suite CSVs from regression/suites/ (via config/test-suites.json)
  │                             ├── Reads agent defs from ci/agents/
  │                             ├── Lanes: browser (Agent SDK query() + Playwright MCP) ·
  │                             │   fastpath (runner-native GraphQL, no browser slot) ·
  │                             │   deterministic (`runner` suites, no agent)
  │                             ├── Validates env vars, suite selection, CSV format
  │                             ├── Turn / timeout / budget caps derived per suite from the manifest
  │                             └── Writes reports/regression/CI-YYYY-MM-DD-HHMM/
  │
  ├── full-cycle.yml ──── ci/run-full-cycle.ts ──── Sync → Lifecycle → Regression
  │                             ├── Phase 0: BL freshness (mark)
  │                             ├── Phase 1: Scope + sync + static review of affected suites
  │                             ├── Phase 2: Review only (runs only when SKIP_SYNC=true)
  │                             ├── Phase 3: Delegates to run-regression.ts
  │                             ├── Phase 4: BL freshness (from the regression results)
  │                             └── Writes reports/full-cycle/CYCLE-*/
  │
  ├── monitor.yml ─────── ci/run-monitor.ts ─────── App Insights online-bug monitoring
  ├── suite-audit.yml ─── ci/run-suite-audit.ts ─── Test-case staleness audit (one suite per run)
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
2. Select **Full Test Cycle** (there is no Regression workflow — removed 2026-09-08; see below)
3. Click **Run workflow** and configure inputs

## Pipelines

### Regression Only (`npm run ci:regression`)

Executes test suites against the live environment.

**Invoked by:** the CLI alias, the Docker image above, or `full-cycle.yml` Phase 3 (Regression). There is **no
regression GitHub Actions workflow** — `regression.yml` was removed 2026-09-08 after one run in its
lifetime (2026-02-11, scheduled, failed in 72 s). Nothing scheduled triggers a regression run today;
a run is something a person or an agent starts (CLI, Docker, or a manual `full-cycle.yml` dispatch).

### Full Cycle (`full-cycle.yml`)

Syncs test cases with code changes, validates them, then runs regression.

**Triggers:**
- Manual (`workflow_dispatch`) only. The PR-merge and Mon-Fri 8:00 AM UTC triggers are
  **commented out** in `full-cycle.yml`, so nothing runs this pipeline unattended.

**Phases:**
| Phase | Budget Share | What it does |
|-------|-------------|-------------|
| 0. BL freshness | — (no agent) | `scripts/knowledge/bl-fresh.ts` marks `BL-*` rules SUSPECT from the change, age and closed Jira bugs |
| 1. Scope + Sync | 50% of remaining | `/qa-test-lifecycle {CHANGE_SOURCE} --ci` — detect stale/broken cases, update steps/assertions, **and review** (dims 1–7, 9, 10) |
| 2. Review | 50% of remaining | Same command at `suite <ids>` scope. **Runs only when `SKIP_SYNC=true`** — Phase 1 already reviews what it synced |
| 3. Regression | the remainder | Execute affected suites via `run-regression.ts` |
| 4. BL freshness | — (no agent) | `bl-fresh.ts --results <run dir> --rerun` — clears or confirms SUSPECT rules from the run |

`SKIP_SYNC` / `SKIP_REGRESSION` / `SKIP_BL_FRESH` skip their phase. `SKIP_LIFECYCLE` skips only the **standalone** review
pass (Phase 2) — a change-driven Phase 1 always reviews, because `/qa-test-lifecycle`'s Review phase
always runs. Neither model phase generates cases or opens a browser, so CI cannot ground a
`{HYPOTHESIS}` assertion; such cases stay `Draft` and out of regression selections.

### Monitoring (`monitor.yml`, `npm run ci:monitor`) and Suite Audit (`suite-audit.yml`, `npm run ci:audit`)

Headless twins of `/qa-monitoring` and `/qa-review-tests --triangulate`. Both workflows are
`workflow_dispatch` only — their `cron:` lines are commented out. Internals:
[`.claude/knowledge/execution/regression-pipelines.md`](../.claude/knowledge/execution/regression-pipelines.md).

## Suite Selection

| Selection | Suites | Description |
|-----------|--------|-------------|
| `smoke` | 042, 078, 078b, 078c, 078d | Daily pre-deploy validation |
| `critical` | 042, 078, 078b, 078c, 078d, 039, 044, 049 | P0 revenue-critical suites |
| `sprint` | Manifest rule (all minus excludes) — the plan-driven `sprint-*-summary.json` scope is `/qa-regression sprint` only | Before sprint release |
| `full` | All suites the manifest does not exclude | Before production release |
| `frontend` | `Frontend/` suites minus manifest excludes | Frontend only |
| `backend` | `Backend/` suites minus manifest excludes | Backend only |
| `042,039,049` | Custom | Comma-separated IDs |

Selection groups are defined in `config/test-suites.json` (`selections`) and loaded at startup; invalid suite IDs are caught with helpful error messages. `npm run regression:plan -- <selection>` resolves a group to its suite list (and derived caps) without running it; `npm run suites:lint` prints the totals.

## npm Scripts

```bash
npm run ci:regression          # Run regression (set SUITE_SELECTION env var)
npm run ci:smoke               # Smoke tests (042, 078, 078b-d)
npm run ci:critical            # P0 suites (042, 078, 078b-d, 039, 044, 049)
npm run ci:frontend            # Frontend suites
npm run ci:backend             # Backend suites
npm run ci:full                # `full` selection (forces MAX_BUDGET_USD=80)
npm run ci:cycle               # Full cycle (set CHANGE_SOURCE env var)
npm run ci:cycle:pr            # Full cycle for a PR (set PR_NUMBER env var)
npm run ci:cycle:sync-only     # Sync phase only
npm run ci:cycle:no-sync       # Skip sync, run lifecycle + regression
npm run ci:monitor             # App Insights monitoring (ci:monitor:dry = DRY_RUN)
npm run ci:audit               # Suite staleness audit (ci:audit:dry = DRY_RUN)
npm run ci:notify              # Send Teams notification for latest run
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (validated at startup) |
| `FRONT_URL` / `BACK_URL` | Storefront / Platform URL — **no default**; loaded from `.env.${TEST_ENV}` (`VIRTO_START_FRONT` / `VIRTO_START_BACK` take precedence when `TEST_ENVIRONMENT=staging`). Missing ⇒ exit 1 |

### Recommended (tests fail without these)

| Variable | Description |
|----------|-------------|
| `ADMIN` / `ADMIN_PASSWORD` | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Primary test user |
| `USER2_EMAIL` / `USER2_PASSWORD` | Secondary test user |
| `STORE_ID` | Store identifier |

### Optional (for specific suites)

| Variable | Used by |
|----------|---------|
| `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` | Suite 040a (Payment — Skyflow) |
| `CYBERSOURCE_CARD`, `CYBERSOURCE_EXPIRY`, `CYBERSOURCE_CVV` | Suite 039 (Payment — CyberSource) |
| `AUTHORIZNET_CARD`, `AUTHORIZNET_EXPIRY`, `AUTHORIZNET_CVV` | Suite 040b (Payment — Authorize.Net) |
| `DATATRANCE_MASTERCARD`, `DATATRANCE_EXPIRY`, `DATATRANCE_CVV`, `DATATRANCE_OTP` | Suite 040c (Payment — Datatrans) |
| `MODULES_ENABLED`, `PAYMENT_PROCESSORS_ENABLED`, `STOREFRONT_PROFILE`, `ENV_RISK` (default `dev`), `ALLOW_ADMIN_WRITES_ON_PROD` | Multi-env selection filters (`ci/lib/suite-manifest.ts`) — skip suites the target env cannot run |
| `TEAMS_WEBHOOK_URL` | Teams notifications |

### Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_BUDGET_USD` | derived from the selection's estimates (`run-full-cycle.ts`: `20.0`) | Override for the total budget cap of the run |
| `MAX_TURNS` | derived per suite from its case count | Override for max agent turns per suite |
| `MAX_PARALLEL` | `3` | Max concurrent suites on the browser lane |
| `MAX_PARALLEL_FASTPATH` | `4` | Max concurrent runner-native GraphQL suites |
| `MAX_PARALLEL_DETERMINISTIC` | `2` | Max concurrent deterministic `runner` suites |
| `SUITE_TIMEOUT_MS` | derived per suite from its manifest estimate | Override for the per-suite timeout |
| `MODEL` | `claude-sonnet-4-5-20250929` | Claude model |
| `TEST_ENVIRONMENT` | `qa` | `qa` or `staging` |
| `TEST_ENV` | `vcst` | Which `.env.<name>` layer supplies URLs and identifiers |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Every suite finished and passed |
| `1` | A real failure (`fail`) or a runner error in at least one suite |
| `2` | Nothing failed, but a suite was truncated (turns / budget / timeout) or deferred — never green |
| `3` | Infrastructure blocked the run |

## File Structure

```
ci/
├── run-regression.ts              # Suite execution orchestrator
├── run-full-cycle.ts              # Sync → Lifecycle → Regression pipeline
├── run-monitor.ts                 # App Insights monitoring (twin of /qa-monitoring)
├── run-suite-audit.ts             # Suite staleness audit (twin of /qa-review-tests --triangulate)
├── notify-teams.ts                # Teams Adaptive Card notifications
├── Dockerfile                     # Docker image (Playwright + Agent SDK)
├── tsconfig.json                  # TypeScript config
├── README.md                      # This file
├── agents/                        # CI-specific agent definitions
│   ├── qa-frontend-expert.md      # Storefront testing (cart, checkout, search)
│   ├── qa-backend-expert.md       # API, GraphQL, Admin SPA testing
│   ├── qa-testing-expert.md       # General-purpose test execution
│   ├── monitor-triage-agent.md    # Signal classifier for run-monitor.ts
│   ├── regression-triage-agent.md # Failure classifier for regression triage
│   ├── ci-sync-agent.md           # Test-case sync agent
│   └── ci-lifecycle-agent.md      # Static quality-review agent
├── lib/                           # Shared runner modules (manifest, lanes, scheduler, caps, App Insights)
├── monitoring/queries/            # KQL queries for run-monitor.ts
└── config/
    └── mcp-playwright-chrome.ci.json  # Headless Chromium template (copied per lane by lib/lane-mcp.ts)
```

## Reports

| Pipeline | Output Directory | Files |
|----------|-----------------|-------|
| Regression | `reports/regression/CI-YYYY-MM-DD-HHMM/` | `summary.json`, `regression-report.md`, per suite `suite-<id>-resolved.csv` / `-cases.jsonl` / `-results.json` |
| Full Cycle | `reports/full-cycle/CYCLE-YYYY-MM-DD-HHMM/` | `phase1-sync.txt`, `phase2-lifecycle.txt` (agent output of the phase that ran) |
| Monitoring | `reports/monitoring/MONITOR-YYYY-MM-DD-HHMM/` | see `regression-pipelines.md` |
| Suite Audit | `reports/suite-audit/TCA-YYYY-MM-DD-HHMM/` | see `regression-pipelines.md` |
| History | `reports/regression/history.json` | Rolling 90-day per-suite history |
| CI run log | `reports/regression/history-ci-runs.json` | Rolling 90-day run-level cost / duration log |

## Agent Prompt Injection

`run-regression.ts` builds a prompt for each suite with:

1. **Run Configuration** — Run ID, suite, lane, date, environment, Frontend URL, Backend URL
2. **Credentials** — All `USER_*`, `ADMIN_*`, `STORE_ID`, payment test data
3. **Agent Instructions** — from `ci/agents/{agent-type}.md`
4. **Test Cases** — the path of the suite CSV, already `@td()`-resolved and written to the run dir (the agent reads it; the content is not inlined)
5. **Preflight** — `[PRE:*]` tags run before each case
6. **Results contract** — per-case `suite-<id>-cases.jsonl` lines + a `suite-<id>-results.json` envelope
7. **Execution Rules** — Playwright MCP tool usage guidance

Agents read URLs from the `**Frontend URL:**` and `**Backend URL:**` labels in the Run Configuration section.

## Cost Optimization

- Default model is Sonnet (~5x cheaper than Opus)
- Budget, timeout and turn caps are derived per suite from the manifest (`ci/lib/suite-caps.ts`); `MAX_BUDGET_USD` / `SUITE_TIMEOUT_MS` / `MAX_TURNS` only override them
- A timed-out suite is cancelled through the SDK's `abortController`, so it stops spending
- Browser-lane concurrency stays at 3 to balance speed vs. rate limits and test-account slots
- `npm run regression:plan -- <selection>` prints the derived budget before you spend it; start with `smoke` to validate setup before `full`
- Full cycle allocates budget: 50% of the total to Phase 1 (or Phase 2), the remainder to regression
