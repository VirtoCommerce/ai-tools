---
description: "Run 12 P0 smoke tests (Suite 01) for daily pre-deployment validation. Quick GO/NO-GO verdict in ~15 min."
argument-hint: "[storefront|admin]"
disable-model-invocation: true
---

# /qa-smoke — Quick Smoke Test Run

Run Suite 01 smoke tests for daily pre-deployment validation. Executes two parallel tracks for a GO/NO-GO verdict in ~15 min.

## Usage
```
/qa-smoke              # Run full smoke suite (both tracks)
/qa-smoke storefront   # Track A only (storefront tests)
/qa-smoke admin        # Track B only (admin health checks)
```

---

## Execution

You are the smoke test orchestrator running in the main context. Spawn sub-agents directly — do NOT delegate to another orchestrator agent.

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints` (or inline: `curl -sk {BACK_URL}/health`). If unhealthy, warn user and ask whether to proceed.
2. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version and theme version — include in the smoke report header (Step 4)
3. **Duplicate check** — scan `reports/regression/` for a `SMOKE-*` run from today. If found, warn user and show previous verdict.
4. **Context7 query** — resolve `/virtocommerce/vc-docs`, query `"storefront cart checkout smoke"` with `tokens: 8000`. Check for recent module behavior changes that could affect smoke tests.

### Step 1 — Read Suite & Prepare Run

1. Read `config/test-suites.json` to get Suite 01 details (CSV path, test count)
2. Read `config.js` to load `FRONT_URL` and `BACK_URL`
3. Generate run ID: `SMOKE-YYYY-MM-DD-HHMM`
4. Create output directory: `reports/regression/{RUN_ID}/`

### Step 2 — Dispatch Parallel Tracks

Unless the user specified `storefront` or `admin` only, launch **both tracks simultaneously** in a single message using the Agent tool:

**Track A — Storefront** (`qa-frontend-expert`, `playwright-chrome`)

Prompt:
```
You are executing Track A of a smoke test run ({RUN_ID}).

Suite: 042 — Smoke Tests
CSV: regression/suites/Frontend/smoke/042-smoke-tests.csv
Browser: playwright-chrome
Frontend URL: {FRONT_URL}
Output: reports/regression/{RUN_ID}/suite-01-trackA-results.json

Follow the test-runner-agent protocol in .claude/agents/qa/test-runner-agent.md.
Execute all 12 smoke test cases (SMK-001 through SMK-012) as a customer journey.
Capture evidence on failures. Write structured JSON results to the output file.
```

**Track B — Admin & Backend** (`qa-backend-expert`, `playwright-edge`)

Prompt:
```
You are executing Track B of a smoke test run ({RUN_ID}).

Suite: 078 — Backend Smoke Tests
CSV: regression/suites/Backend/smoke/078-backend-smoke-tests.csv
Browser: playwright-edge
Backend URL: {BACK_URL}
Frontend URL: {FRONT_URL}
Output: reports/regression/{RUN_ID}/suite-01-trackB-results.json

Run parallel admin/backend health checks:
1. Admin SPA loads and key blades (Catalog, Orders, Contacts) open without errors
2. Platform modules show Active status, no error state
3. API health check endpoint responds (GET {BACK_URL}/api/platform/modules)
4. GraphQL endpoint accepts introspection query
5. Auth token endpoint works
6. If Track A data is available, verify created contacts/orders appear in Admin

Write structured JSON results to the output file with pass/fail per check.
```

### Step 3 — Collect Results & Verdict

After both tracks complete, read both output files and apply verdict rules:

| Condition | Verdict |
|-----------|---------|
| All 12 storefront tests PASS + Admin healthy | **GO** — Safe to deploy |
| 1-2 non-critical tests fail (not checkout/payment) | **CONDITIONAL GO** — Deploy with monitoring |
| Any checkout test fails (SMK-009/010/011) | **NO-GO** — Checkout broken |
| Any payment test fails (SMK-011) | **NO-GO** — Payment broken |
| Admin SPA won't load | **NO-GO** — Platform unhealthy |
| 3+ tests fail | **NO-GO** — Too many failures |

### Step 4 — Write Report

Write `reports/regression/{RUN_ID}/smoke-report.md`:

```markdown
# Smoke Test Report — {RUN_ID}

## Verdict: GO / CONDITIONAL GO / NO-GO

| Field | Value |
|-------|-------|
| Run ID | {RUN_ID} |
| Date | YYYY-MM-DD |
| Environment | {FRONT_URL} |
| Platform | {PlatformVersion} |
| Theme | {theme version} |

## Track A — Storefront Results

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| SMK-001 | ... | PASS/FAIL | ... |

## Track B — Admin Health

| Check | Status | Notes |
|-------|--------|-------|
| Admin SPA loads | PASS/FAIL | ... |

## Bugs Found

(list or "None")
```

### Step 5 — Deliver Summary

Output verdict, pass rate, bugs found, and report path to the user.

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Track A: `playwright-chrome` (fallback: `playwright-firefox`). Track B: `playwright-edge` (fallback: `playwright-chrome`)
- Never use WebKit — not supported on Windows
- Never assign both tracks to the same browser server
- Read all URLs from config.js / .env — never hardcode
- If a browser fails to launch, retry with fallback browser (max 1 retry per track)
