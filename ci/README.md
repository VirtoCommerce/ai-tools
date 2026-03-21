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
  └── (both) ──────────── ci/notify-teams.ts ────── Teams Adaptive Card notification
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
