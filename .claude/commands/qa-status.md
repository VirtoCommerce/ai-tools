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

If no status file exists, report "No active regression run."

### 2. JIRA Testing Queue
Query JIRA via Atlassian MCP for tickets in the QA pipeline. Substitute `${JIRA_PROJECT_KEY}` from env (defaults to `VCST`):
```
JQL: project = ${JIRA_PROJECT_KEY} AND status in ("Ready for Test", "Testing") ORDER BY priority DESC, updated DESC
```
Show a table: Key | Summary | Status | Priority | Assignee | Updated

### 3. Environment Health (quick, no browser needed)
Run these checks via Bash/curl (not Playwright — avoids browser overhead):
- `curl -s {BACK_URL}/api/platform/healthcheck` — platform health
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
