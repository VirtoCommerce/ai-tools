---
description: "Validate QA environment health: .env variables (33), endpoint status, MCP servers, test infrastructure. Read-only, fast (<30s)."
argument-hint: "[vars|endpoints|mcp]"
---

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

### 1. Environment Variables (33 required)
Run `npm run env:check` (uses `get_variables_env.js`) to verify all required variables are set.

**Layered loader (TEST_ENV-aware):** values are merged from four files in this order — later layers override earlier ones:
1. `.env.defaults` — cross-env constants (sandbox cards, builder.io)
2. `.env.${TEST_ENV}` — per-env URLs/identifiers. Default `TEST_ENV=vcst`. Switch envs with `TEST_ENV=vcptcore npm run env:check` or `TEST_ENV=virtostart npm run env:check`.
3. `.env.local` — secrets (passwords, tokens). Gitignored.
4. `.env` — legacy fallback for backwards-compat; fills gaps without overriding.

| Group | Variables |
|-------|-----------|
| URLs | `FRONT_URL`, `BACK_URL`, `STORYBOOK_URL`, `STORYBOOK_DEV_URL` (per-env file). Legacy `VIRTO_START_FRONT`/`VIRTO_START_BACK` still read by CI. |
| Credentials | `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_*`, `USER_VIRTO`, `USER_VIRTO_PASSWORD` |
| Store | `STORE_ID` (per-env) |
| Skyflow | `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` |
| CyberSource | `CYBERSOURCE_CARD`, `CYBERSOURCE_EXPIRY`, `CYBERSOURCE_CVV` |
| Authorize.Net | `AUTHORIZNET_CARD`, `AUTHORIZNET_EXPIRY`, `AUTHORIZNET_CVV` |
| Datatrance | `DATATRANCE_MASTERCARD`, `DATATRANCE_EXPIRY`, `DATATRANCE_CVV`, `DATATRANCE_OTP` |
| APIs | `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `POSTMAN_API_KEY` |

Report: X/33 variables set, plus active `TEST_ENV`. List any missing.

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
- `.claude/agents/qa/test-runner-agent.md` agent exists
- `reports/` directory exists (create if missing)

---

## Output Format

```
## Environment Check — YYYY-MM-DD HH:MM

### Variables: X/33 OK
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
