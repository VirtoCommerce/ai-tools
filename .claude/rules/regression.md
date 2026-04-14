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
`ci/run-full-cycle.ts` orchestrates a 3-phase pipeline triggered by code changes. Phase 1 (SYNC + REVIEW) uses `/qa-test-lifecycle --ci` to detect stale test cases from PRs/diffs/module updates, update Steps/Assertions, analyze coverage gaps, and run 7-dimension quality review. Phase 2 (REGRESSION) delegates to `ci/run-regression.ts` to execute the affected suites. Each phase has independent skip flags and budget allocation (50%/50% of total budget). Results go to `reports/full-cycle/{RUN_ID}/`.

**Invoke:** `CHANGE_SOURCE="PR #123" npm run ci:cycle` or via `.github/workflows/full-cycle.yml`
**Triggers:** PR merge to main (auto), daily schedule (Mon-Fri 8AM UTC), manual dispatch
**npm scripts:** `ci:cycle` (full), `ci:cycle:pr` (PR-driven), `ci:cycle:sync-only` (Phase 1 only), `ci:cycle:no-sync` (skip Phase 1)

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: 79 suites in module-aligned subdirectories under `Frontend/` and `Backend/`, with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: `smoke`, `critical`, `release`, `sprint`, `full`, `frontend`, `backend`, plus module-specific groups (`catalog`, `search`, `orders`, `auth`, `b2c`, `marketing`, `platform`, `bopis`, `payment`, `configurable-products`, `whitelabeling`, `purchase-flow`)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## Regression Test Suites

79 suites in `regression/suites/` organized by module under `Frontend/` (40 suites) and `Backend/` (38 suites) + 1 release suite. Enriched agent-native CSV format. Full definitions in `config/test-suites.json`. **Total: ~2,400 test cases**.

### Frontend Suites (40 suites, user-facing features & flows)

| Directory | Suites | Tests | Description |
|-----------|--------|-------|-------------|
| `Frontend/auth/` | 031-033 | 68 | Login, registration, session, RBAC, company menu |
| `Frontend/catalog/` | 001-003 | 70 | Navigation, product detail, filters |
| `Frontend/search/` | 004-005 | 60 | Core search, filters & advanced |
| `Frontend/cart/` | 028-030 | 77 | Core, validation/persistence, merge |
| `Frontend/checkout/` | 011-013 | 64 | Flow, guest, B2B |
| `Frontend/orders/` | 014-015 | 97 | Orders frontend, quotes |
| `Frontend/payment/` | 039-041 | 65 | CyberSource, processors, cross-cutting |
| `Frontend/bopis/` | 036-038 | 88 | Store selector, cart, checkout |
| `Frontend/b2c/` | 006-010 | 166 | Organization, lists, members, variations/configs, bulk/ship/dashboard |
| `Frontend/configurable-products/` | 072, 072b, 072c | 139 | UI, E2E scenarios, cross-cutting |
| `Frontend/whitelabeling/` | 070-071 | 68 | Storefront, branding |
| `Frontend/marketing/` | 077 | 54 | Coupons & promotions storefront |
| `Frontend/cross-cutting/` | 042-048 | 172 | Smoke, GA4, security, a11y, i18n, performance, browser compat |

### Backend Suites (38 suites, admin UI, modules & APIs)

| Directory | Suites | Tests | Description |
|-----------|--------|-------|-------------|
| `Backend/platform/` | 020-021, 063 | 94 | Users/roles, dynamic properties, core settings |
| `Backend/store/` | 034-035 | 65 | Management, rounding/email |
| `Backend/catalog/` | 051, 053 | 63 | Products admin, categories admin |
| `Backend/customer/` | 026-027 | 84 | Contacts, orgs & invites |
| `Backend/pricing/` | 054-055 | 62 | Logic, management |
| `Backend/inventory/` | 056 | 43 | Fulfillment centers, stock |
| `Backend/marketing/` | 023-025 | 89 | Promotions, content, coupons/API |
| `Backend/notifications/` | 057-058 | 53 | Templates, triggers |
| `Backend/cms/` | 059-060 | 56 | Page management, design/content |
| `Backend/orders/` | 017-019 | 90 | Management, payments, shipments admin |
| `Backend/api/` | 049 | 33 | Platform REST API |
| `Backend/graphql/` | 050 | 33 | GraphQL xAPI |
| `Backend/search/` | 061 | 46 | Search indexing admin |
| `Backend/configurable-products/` | 052 | 15 | Configurable products admin |
| `Backend/whitelabeling/` | 067 | 40 | White labeling admin |
| Other modules | various | ~213 | assets, channels, contracts, image-tools, import-export, loyalty, push-messages, returns, seo, shipping, xmarketing |

- **Release suite**: `_release/080-full-regression-release.csv` (100 P0/P1 tests for major releases)
- **P0 suites**: 042 (Smoke), 039 (CyberSource Payment), 044 (Security), 049 (Platform API)

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 042 | Daily validation before deployment |
| `critical` | 042, 039, 044, 049 | P0 suites only |
| `release` | 080 | Master suite for major releases |
| `purchase-flow` | cart + checkout + orders-frontend + payment | Purchase flow regression |
| `catalog` | 001-003, 051, 053 | Catalog module (frontend + admin) |
| `search` | 004-005, 061 | Search module (frontend + admin) |
| `orders` | 014-019 | Orders & quotes (frontend + admin) |
| `auth` | 031-033 | Authentication module |
| `b2c` | 006-010 | B2C features |
| `marketing` | 023-025, 077 | Marketing module (admin + storefront) |
| `platform` | 020-021, 049, 063 | Platform module |
| `frontend` | All Frontend/ suites (40) | Frontend-only regression |
| `backend` | All Backend/ suites (38) | Backend-only regression |
| `sprint` | All P0 + P1 suites | Before sprint release |
| `full` | All 79 suites | Before production release |

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

Suite selection accepts group names (`smoke`, `critical`, `catalog`, `orders`, etc.) or comma-separated IDs (`042,039,049`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports go to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary).

**Note:** The CI `run-regression.ts` dynamically loads suite definitions from `config/test-suites.json` at startup. Selection groups are also defined in the manifest's `selections` block.

**Scheduled Pipeline (GitHub Actions - `.github/workflows/regression.yml`):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 042 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all 79 suites ($80 budget)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## Prompt Templates

Key prompt templates in `docs/prompts/`:
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

> **Note:** `test-runner-agent.md` is now an agent definition at `.claude/agents/qa/test-runner-agent.md`, not a prompt template.
