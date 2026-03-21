# Regression & CI Reference

## Architecture: Four Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK
`ci/run-regression.ts` orchestrates headless regression using `@anthropic-ai/claude-agent-sdk`. It reads suite CSVs from `regression/suites/`, injects them into prompts with agent instructions from `ci/agents/` (3 CI-specific agent definitions: `qa-frontend-expert.md`, `qa-backend-expert.md`, `qa-testing-expert.md`), and runs suites in parallel batches (up to 3 concurrent, configurable via `MAX_PARALLEL`). Results are tracked in `reports/regression/history.json` (90-day rolling window). Teams notifications via `ci/notify-teams.ts`.

**Note:** CI mode uses only `playwright-chrome` (single headless Chromium) for all suites. The 3-browser pool (chrome/firefox/edge) applies only to interactive mode. CI environment mapping: `qa` → `FRONT_URL`/`BACK_URL`, `staging` → `VIRTO_START_FRONT`/`VIRTO_START_BACK`.

**Regression Orchestration Pipeline (interactive mode):**
1. `regression-orchestrator` agent reads `config/test-suites.json` manifest
2. Resolves suite selection (`smoke`, `critical`, `sprint`, `full`, or comma-separated IDs)
3. Assigns suites to browser pool slots (3 slots: chrome, firefox, edge)
4. Spawns sub-agents using `.claude/agents/qa/test-runner-agent.md` template with substituted parameters (`{{SUITE_ID}}`, `{{BROWSER_SERVER}}`, `{{ENVIRONMENT_URL}}`, `{{OUTPUT_FILE}}`, etc.)
5. Each sub-agent gets an isolated browser context, executes all test cases from its CSV, writes JSON results
6. Orchestrator collects results, handles retries with browser fallback chain, produces consolidated report

### 3. Autonomous Interactive Regression (Agent Teams)
`autonomous-regression-orchestrator` creates a team of child agents using Agent Teams API (TeamCreate, SendMessage). Each child gets an isolated browser context, fresh authentication, and exponential backoff (30s→60s→120s). The orchestrator manages a 3+1 token bucket (3 browser + 1 reporting agent), tracks failures in `results/{RUN_ID}/failures.json`, retries failed suites with browser fallback chain (max 3 attempts), and produces a consolidated report with quality gate evaluation and optional JIRA ticket creation via Atlassian MCP.

**Invoke:** `/qa-regression critical --autonomous` or use `autonomous-regression-orchestrator` agent directly.
**Results:** `results/{RUN_ID}/` (regression-report.md, summary.json, failures.json, per-suite results)
**Reporting module:** `scripts/reporting.ts` (generate reports, JIRA payloads, status updates)

### 4. Full Test Cycle CI Pipeline (Sync → Lifecycle → Regression)
`ci/run-full-cycle.ts` orchestrates a 3-phase pipeline triggered by code changes. Phase 1 (SYNC) detects stale test cases from PRs/diffs/module updates using `/qa-sync-tests` logic + Context7, updates Steps/Assertions, and generates cases for new behavior. Phase 2 (LIFECYCLE) runs 7-dimension static quality review on affected suites. Phase 3 (REGRESSION) delegates to `ci/run-regression.ts` to execute the affected suites. Each phase has independent skip flags and budget allocation (30%/20%/50% of total budget). Results go to `reports/full-cycle/{RUN_ID}/`.

**Invoke:** `CHANGE_SOURCE="PR #123" npm run ci:cycle` or via `.github/workflows/full-cycle.yml`
**Triggers:** PR merge to main (auto), daily schedule (Mon-Fri 8AM UTC), manual dispatch
**npm scripts:** `ci:cycle` (full), `ci:cycle:pr` (PR-driven), `ci:cycle:sync-only` (Phase 1 only), `ci:cycle:no-sync` (skip Phase 1)

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: 45 suites (19 frontend + 26 backend) with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: `smoke` (01), `critical` (01,06,08,14), `release` (00), `sprint` (33 suites), `full` (all 45), `frontend` (01-13,35-36,41), `backend` (14-34,37-40,42)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## Regression Test Suites

45 modular suites + 1 master suite in `regression/suites/` (Frontend/ + Backend/) in enriched agent-native CSV format (`ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status`). Full definitions in `config/test-suites.json`. **Total: ~2,271 test cases** (~1,175 frontend + ~1,096 backend).

- **Suite 00** (`Frontend/00-full-regression-release.csv`): Master suite — 90 consolidated P0/P1 test cases for major releases
- **Frontend** (suites 01-13, 35-36, 41): Smoke, Auth, Catalog, Cart (04a), Checkout (04b), Orders & Quotes (04c), BOPIS, Payment, GA4, Security, A11y, i18n, Perf, Browser Compat, B2C, White Labeling, Configurable Products, Coupons & Promotions
- **Backend** (suites 14-34, 37-40, 42): Platform API, GraphQL xAPI, Catalog/Store/Pricing/Orders/Customer/Inventory/Marketing/Notifications/CMS/Search/Assets/Settings Admin, CSV Import/Export, Shipping, SEO, White Labeling, Push Messages, Image Tools, Returns, Contracts, Loyalty, Channels & Data Quality, xMarketing
- **P0 suites**: 01 (Smoke), 06 (Payment), 08 (Security), 14 (Platform API)

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily validation before deployment |
| `critical` | 01, 06, 08, 14 | P0 suites only |
| `release` | 00 | Master suite for major releases |
| `sprint` | 33 suites (01-06, 08, 14-27, 29-31, 35-39, 41-42) | Before sprint release |
| `full` | All 45 | Before production release |
| `frontend` | 01-13, 35-36, 41 (18 suites) | Frontend-only regression |
| `backend` | 14-34, 37-40, 42 (26 suites) | Backend-only regression |

## CI Regression Testing

The `ci/` directory provides Docker-based CI regression using the Claude Agent SDK:

```bash
docker build -t vc-regression -f ci/Dockerfile .
docker run --rm --shm-size=2gb --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  vc-regression
```

Suite selection accepts the same group names as above, or comma-separated IDs (`01,04,06`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports go to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary).

**Note:** The CI `run-regression.ts` dynamically loads suite definitions from `config/test-suites.json` at startup. Selection groups are also defined in the manifest's `selections` block.

**Scheduled Pipeline (GitHub Actions - `.github/workflows/regression.yml`):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 01 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all suites ($80 budget)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## Prompt Templates

Key prompt templates in `docs/prompts/`:
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

> **Note:** `test-runner-agent.md` is now an agent definition at `.claude/agents/qa/test-runner-agent.md`, not a prompt template.
