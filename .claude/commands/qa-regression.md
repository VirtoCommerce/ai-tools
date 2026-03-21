---
description: "Run regression test suites in parallel. Supports scope selection: smoke, critical, sprint, full, frontend, backend, or comma-separated suite IDs."
argument-hint: "[smoke|critical|sprint|full|frontend|backend|01,04,06]"
disable-model-invocation: true
---

# /qa-regression — Run Regression Test Suites

You are the **Regression Orchestrator** for Virto Commerce. When invoked, you execute regression test suites in parallel using the test-suites.json manifest and dedicated sub-agents with isolated browser contexts.

## Usage
```
/qa-regression                   # Default: smoke (Suite 01)
/qa-regression smoke             # Suite 01 only (~15 min)
/qa-regression critical          # P0 suites: 01, 06, 08, 14
/qa-regression sprint            # Sprint release suites (26 suites)
/qa-regression full              # All 36 suites (production release)
/qa-regression frontend          # Frontend suites: 01-13, 35-36
/qa-regression backend           # Backend suites: 14-34
/qa-regression 01,04,06          # Specific suite IDs
/qa-regression critical --autonomous   # Agent Teams mode (failure recovery + JIRA)
/qa-regression full --autonomous       # Full regression with autonomous orchestration
```

### Execution Modes

- **Standard mode (default):** Uses `regression-orchestrator` agent with Task dispatch. Simpler, faster for small runs.
- **Autonomous mode (`--autonomous`):** Uses `autonomous-regression-orchestrator` agent with Agent Teams. Adds: token bucket concurrency (3+1), exponential backoff retries (30s→60s→120s), persistent failure tracking (`failures.json`), consolidated reporting via TypeScript, and auto-JIRA ticket creation for Critical/High bugs. Results written to `results/{RUN_ID}/`.

When `--autonomous` is specified, delegate to `autonomous-regression-orchestrator` instead of `regression-orchestrator`.

---

## Execution Pipeline

### Step 0 — Pre-Flight (per `.claude/templates/agent-dispatch.md`)

1. **Environment health** — run `/qa-env-check endpoints`. If unhealthy, abort — regression on a broken env wastes budget.
2. **Duplicate check** — check `reports/regression/test-run-status.json` for an active run with the same suite selection. If found, block — wait for current run to complete.
3. **Context7 query** (for `sprint` and `full` selections) — resolve `/virtocommerce/vc-docs`, query `"platform release notes recent changes"` with `tokens: 8000`. Flag any API contract changes that may cause false failures in existing test cases. Consider running `/qa-sync-tests` first if breaking changes detected.

### Step 1 — Read Manifest
Read `config/test-suites.json` to load suite definitions, browser pool, and selection groups. Resolve the requested selection into suite IDs.

### Step 2 — Generate Run ID
Create `REG-YYYY-MM-DD-HHMM` and output directory `reports/regression/{RUN_ID}/`.

### Step 3 — Initialize Status Tracker
Write `reports/regression/test-run-status.json` with all suites in `pending` state.

### Step 4 — Dispatch Sub-Agents in Batches of 3
With 3 browser slots (playwright-chrome, playwright-firefox, playwright-edge):
1. Pick next 3 pending suites (P0 first, then P1, then P2)
2. Assign each a browser slot
3. Launch all 3 as parallel Task calls using the agent type from the manifest
4. Fill in `.claude/agents/qa/test-runner-agent.md` template with suite parameters

### Step 5 — Monitor, Retry, Continue
- Wait for batch to complete
- Update status tracker
- On failure: retry with next browser in fallback chain (max 2 retries)
- Free browser slots and dispatch next batch
- On environment unreachable: stop all remaining suites

### Step 6 — Consolidate Report
Write `reports/regression/regression-YYYY-MM-DD.md` with:
- Executive summary (suites run/passed/failed, pass rate)
- Suite-by-suite results table
- Bugs found
- Retry log
- Detailed results per suite

### Step 7 — Deliver Summary
Output concise verdict to user with pass rate, bugs, and report path.

---

## Browser Pool

| Slot | Server | Fallback |
|------|--------|----------|
| 1 | playwright-chrome | firefox → edge |
| 2 | playwright-firefox | chrome → edge |
| 3 | playwright-edge | chrome → firefox |

Never assign two agents to the same browser. Never use WebKit on Windows.

---

## Selection Groups (from test-suites.json)

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 01 | Daily pre-deploy |
| `critical` | 01, 06, 08, 14 | P0 gate |
| `sprint` | 26 suites | Sprint release |
| `full` | All 36 | Production release |
| `frontend` | 01-13, 35-36 | Frontend only |
| `backend` | 14-34 | Backend only |

---

## Rules
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Never execute tests yourself — delegate via Task tool
- Never share browser slots between concurrent agents
- Priority order: P0 before P1 before P2
- Always write test-run-status.json (external tools monitor it)
- Read URLs from .env via `config.js`, never hardcode
- If >50% suites fail, flag as critical_failure — suggest `/qa-sync-tests` to check for stale test cases
- If a browser fails to launch, retry with fallback chain (see Browser Pool table above)
