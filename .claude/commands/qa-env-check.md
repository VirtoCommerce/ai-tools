# /qa-env-check — Environment Validation

Validate that the QA environment is healthy and all required configuration is in place. Run this before any testing session.

## Usage
```
/qa-env-check            # Full check (env vars + endpoints + MCP servers)
/qa-env-check vars       # Check .env variables only
/qa-env-check endpoints  # Check endpoint health only
/qa-env-check mcp        # Check MCP server availability only
```

---

## Checks Performed

### 1. Environment Variables (29 required)
Run `npm run env:check` (uses `get_variables_env.js`) to verify all required variables are set:

| Group | Variables |
|-------|-----------|
| URLs | `FRONT_URL`, `BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK` |
| Credentials | `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO`, `USER_VIRTO_PASSWORD` |
| Store | `STORE_ID` |
| Skyflow | `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` |
| APIs | `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `POSTMAN_API_KEY` |

Report: X/29 variables set. List any missing.

### 2. Endpoint Health
Test each endpoint with curl (no browser needed):

| Endpoint | Check |
|----------|-------|
| Storefront | `curl -s -o /dev/null -w "%{http_code}" {FRONT_URL}` → expect 200 |
| Admin SPA | `curl -s -o /dev/null -w "%{http_code}" {BACK_URL}` → expect 200 |
| Platform Health | `curl -s {BACK_URL}/api/platform/healthcheck` → expect healthy |
| Auth Token | `curl -s -X POST {BACK_URL}/connect/token` with admin creds → expect 200 |
| GraphQL | `curl -s -X POST {BACK_URL}/graphql` with introspection → expect 200 |

Report: UP/DOWN for each. If DOWN, show HTTP status or error.

### 3. MCP Server Availability
Check which MCP servers are configured and reachable:
- Read `.mcp.json` to list configured servers
- For each Playwright server: verify the config file exists at the referenced path
- Report which servers are configured vs missing

### 4. Test Data Readiness
Quick checks on test infrastructure:
- `config/test-suites.json` exists and is valid JSON
- `regression/suites/` has CSV files matching the manifest
- `docs/prompts/test-runner-agent.md` template exists
- `reports/` directory exists (create if missing)

---

## Output Format

```
## Environment Check — YYYY-MM-DD HH:MM

### Variables: X/29 OK
[Missing: VAR1, VAR2 (if any)]

### Endpoints
| Endpoint | URL | Status |
|----------|-----|--------|
| Storefront | https://... | UP (200) |
| Admin | https://... | UP (200) |
| Health API | https://... | UP (healthy) |
| Auth | https://... | UP (200) |
| GraphQL | https://... | UP (200) |

### MCP Servers
| Server | Configured | Config File |
|--------|-----------|-------------|
| playwright-chrome | Yes | config/mcp-playwright-chrome.config.json |
| playwright-firefox | Yes | ... |
| playwright-edge | Yes | ... |

### Test Infrastructure
| Item | Status |
|------|--------|
| test-suites.json | OK (36 suites) |
| Suite CSV files | OK (36/36 present) |
| Test runner template | OK |
| Reports directory | OK |

### Verdict: READY / NOT READY
[If NOT READY: list blockers]
```

---

## Rules
- This is read-only — no browser automation, no test execution
- Use Bash (curl) for endpoint checks, not Playwright
- Run `npm run env:check` for variable validation
- Use Glob for file existence checks
- Fast execution target: < 30 seconds
