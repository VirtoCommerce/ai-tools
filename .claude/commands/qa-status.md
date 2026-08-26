---
description: "Show QA dashboard: active regression runs, JIRA testing queue, environment health, recent bugs. Read-only, no browser needed."
argument-hint: "[run|jira|env]"
---

# /qa-status — Check QA Run Status & Dashboard

Show the current state of QA testing: active regression runs, recent results, JIRA tickets in testing, and environment health.

## Usage
```
/qa-status                # Full dashboard (runs + JIRA + env health)
/qa-status run            # Current/last regression run status only
/qa-status jira           # JIRA tickets in "Testing" or "Ready for Test"
/qa-status env            # Quick environment health check (no browser needed)
```

---

## Dashboard Sections

### 1. Active/Recent Regression Run
Read `reports/regression/test-run-status.json` if it exists:
- Show run ID, selection, start time, status (running/completed/failed)
- Suite progress: X/Y completed, current pass rate
- If running: which suites are pending/in-progress/done
- If completed: link to the full report
- **Live dashboard:** point at the self-refreshing `reports/regression/{RUN_ID}/regression-report.html` — the visual companion to this text view. `/qa-regression` launches it automatically at run start (`npm run report:regression:watch`); it fills in live and settles into the final report. To (re)open it manually: `npm run report:regression:watch -- --run-id {RUN_ID}` (live) or `npm run report:regression:open -- --run-id {RUN_ID}` (static snapshot).

If no status file exists, report "No active regression run."

### 2. JIRA Testing Queue
Query JIRA via Atlassian MCP for tickets in the QA pipeline. Substitute `${JIRA_PROJECT_KEY}` from env (defaults to `VCST`):
```
JQL: project = ${JIRA_PROJECT_KEY} AND status in ("Ready for Test", "Testing") ORDER BY priority DESC, updated DESC
```
Show a table: Key | Summary | Status | Priority | Assignee | Updated

### 3. Environment Health (quick, no browser needed)
Run these checks via Bash/curl (not Playwright — avoids browser overhead):
- `curl -s -o /dev/null -w "%{http_code}" {BACK_URL}/health` — platform health. **Use `/health`, not `/api/platform/healthcheck`** — the latter returns **404** on this platform, so following it reports a healthy platform as DOWN (verified 2026-08-25 against `3.1061.0`). Note `/health` returns 200 even mid-restart, so it is a liveness check, not a build check — read the live version from the login-page HTML instead.
- `curl -s -o /dev/null -w "%{http_code}" {FRONT_URL}` — storefront responds
- `curl -s -o /dev/null -w "%{http_code}" {BACK_URL}` — admin responds

Report: UP/DOWN for each endpoint.

### 4. Recent Bug Reports
List files in `reports/bugs/open` sorted by date (newest first, max 10):
- Show filename, severity (from filename or first lines), date

---

## Output Format

```
## QA Dashboard — YYYY-MM-DD HH:MM

### Regression
[Status: idle | running REG-... (X/Y suites) | last run REG-... passed X%]

### JIRA Queue
| Key | Summary | Status | Priority |
| ... | ... | ... | ... |
[X tickets ready for test, Y in testing]

### Environment
| Endpoint | Status |
| Storefront | UP |
| Admin | UP |
| Health API | UP |

### Recent Bugs (last 5)
| File | Severity | Date |
| ... | ... | ... |
```

---

## Rules
- This is a read-only command — no browser automation, no test execution
- Use curl/Bash for health checks (fast, no MCP server needed)
- Use Atlassian MCP for JIRA queries
- Use Glob/Read for file-based status
