---
description: "Validate VC QA plugin environment: env vars, both surfaces (storefront + Admin SPA), MCP servers, multi-env config, test infrastructure. Read-only, fast (<30s)."
argument-hint: "[vars|endpoints|mcp|env]"
---

# /qa-env-check — Environment Validation

Validate that the customer's plugin install is healthy and all required configuration is in place. Run this before any testing session and after changing `.env.*` files.

## Usage
```
/qa-env-check            # Full check (env vars + both surfaces + MCP + multi-env config)
/qa-env-check vars       # Env vars only (delegates to npm run env:check)
/qa-env-check endpoints  # Storefront + Admin SPA reachability + platform health
/qa-env-check mcp        # MCP server availability
/qa-env-check env        # Active TEST_ENV, ENV_RISK, STOREFRONT_PROFILE, MODULES_ENABLED summary
```

---

## Checks Performed

### 1. Active Environment Summary (always shown first)

Display the multi-env-aware config prominently so the user sees what they're actually about to run against:

```
Active Configuration
────────────────────
TEST_ENV            : {value or '(unset — defaults to vcst)'}
ENV_RISK            : {value} — {description: dev/test/staging/production}
STOREFRONT_PROFILE  : {value} — gates which Frontend suites apply
MODULES_ENABLED     : {value or '(empty — no filter, all suites run)'}
JIRA_PROJECT_KEY    : {value}
```

If `ENV_RISK=production`, add a prominent warning:
```
⚠ PRODUCTION-RISK ENV. Admin-write suites will refuse to run unless
  --allow-admin-writes-on-prod is passed.
```

### 2. Environment Variables

Run `npm run env:check` to verify required variables are set. Source of truth for the schema: **`manifest.json` `envSchema`** — the customer should consult that for what's required.

Layered loader order (later overrides earlier):
1. `.env.defaults` — plugin-supplied constants (sandbox cards, Builder.io public URL). Same for every customer.
2. `.env.${TEST_ENV}` — customer per-env values (URLs, store ID, modules, risk class). `TEST_ENV` can be any `[a-z0-9_]+` name; kebab-case is rejected.
3. `.env.local` — gitignored secrets. Per-env via `USER_PASSWORD_${TEST_ENV.upper()}` suffix promotion.
4. `.env` — legacy fallback for backwards-compat.

Three buckets per `docs/configuration.md`:

| Bucket | Source | Examples |
|--------|--------|----------|
| Plugin-supplied | `.env.defaults` | Sandbox card numbers, Builder.io public URL |
| Customer-required (per env) | `.env.${TEST_ENV}` | `FRONT_URL`, `BACK_URL`, `STORE_ID`, `ENV_RISK`, `STOREFRONT_PROFILE`, `MODULES_ENABLED`, `JIRA_PROJECT_KEY` |
| Customer-secret | `.env.local` (gitignored) | `USER_PASSWORD_*`, `ADMIN_PASSWORD_*`, `FIGMA_API_KEY`, `POSTMAN_API_KEY` |

Report: `X/Y` required vars set, plus active `TEST_ENV`. List any missing with their bucket.

### 3. Endpoint Health (BOTH surfaces validated independently)

The plugin covers two surfaces; both must be reachable. Test each with `curl` (no browser needed).

**Storefront surface (FRONT_URL):**

| Check | Command | Expected |
|-------|---------|----------|
| Reachable | `curl -sko /dev/null -w "%{http_code}" $FRONT_URL` | 200 (or 301/302 redirecting to a valid 200) |
| Robots accessible | `curl -sk $FRONT_URL/robots.txt -o /dev/null -w "%{http_code}"` | 200 |

**Admin SPA / platform surface (BACK_URL):**

| Check | Command | Expected |
|-------|---------|----------|
| Reachable | `curl -sko /dev/null -w "%{http_code}" $BACK_URL` | 200 |
| Platform health | `curl -sk $BACK_URL/health` | JSON with `Modules`, `Cache`, `Redis`, `SQL Server` status (see memory `Platform health endpoint`). NOT `/api/platform/healthcheck` — that path returns 404. |
| Auth token (admin) | `curl -sk -X POST $BACK_URL/connect/token -d 'grant_type=password&username=$ADMIN&password=$ADMIN_PASSWORD&client_id=internal-frontend'` | 200 with `access_token` |
| GraphQL xAPI | `curl -sk -X POST $BACK_URL/graphql -H "Authorization: Bearer $TOKEN" -d '{"query":"{ __typename }"}'` | 200 with `data: { __typename: \"Query\" }` |

If either surface is DOWN, report which one and the HTTP status. The plugin can run storefront-only or admin-only via `--no-admin` / `--no-front` flags (TBD in orchestrator).

### 4. MCP Server Availability

Check which MCP servers are configured and reachable. Source of truth: customer's `.mcp.json` (or Claude Code MCP settings).

**Required:** `playwright-chrome`, `playwright-firefox`, `playwright-edge`. If any is missing, smoke tests will fail.

**Optional (each gates specific skills):**

| Server | Gates |
|--------|-------|
| `postman` | `/qa-postman`, `/qa-api test` |
| `atlassian` | `/qa-bug` JIRA filing, `/qa-status`, `/qa-test-plan` |
| `context7` | `/vc-docs` (fallback) |
| `github` | `/qa-test PR #N`, `/ba-analyze` |
| `figma-remote-mcp` | `/qa-design` (Figma comparison) |
| `claude_ai_VirtoOZ_for_virtocommerce_com_docs` | `/vc-docs` (primary) |

Optional MCPs missing = warning, not failure. The dependent skill prints a clear error at runtime.

### 5. Test Infrastructure

Quick checks on plugin local state:

| Item | Check |
|------|-------|
| `manifest.json` | Exists at repo root, valid JSON. |
| `config/test-suites.json` | Exists, valid JSON, schema lint passes (`npm run suites:lint`). |
| `test-data/aliases.json` | Exists. |
| `test-data/aliases.${TEST_ENV}.json` | Optional — note if present (env overrides active). |
| Regression suite CSV files | All `file:` paths in manifest resolve to existing CSV files. |
| `.claude/agents/qa/test-runner-agent.md` | Exists (orchestrator dispatches to this template). |
| `reports/` directory | Exists (create if missing — orchestrator writes here). |

---

## Output Format

```
## /qa-env-check — YYYY-MM-DD HH:MM:SS

### Active Configuration
TEST_ENV            : qa
ENV_RISK            : staging
STOREFRONT_PROFILE  : hybrid
MODULES_ENABLED     : catalog,customer,orders,marketing,cms
JIRA_PROJECT_KEY    : ACME

### Variables: X/Y OK
Plugin-supplied   : 16/16 from .env.defaults
Customer per-env  : 7/7 from .env.qa
Customer secrets  : 8/8 from .env.local (via _QA suffix promotion)
[Missing: list any]

### Surface Health
| Surface          | URL                          | Status            |
|------------------|------------------------------|-------------------|
| Storefront       | https://shop.example.com     | UP (200)          |
| Admin SPA        | https://admin.example.com    | UP (200)          |
| Platform health  | https://admin.example.com/health | UP (all modules healthy) |
| Auth token       | $BACK_URL/connect/token      | UP (200, token issued) |
| GraphQL xAPI     | $BACK_URL/graphql            | UP (200, __typename ok) |

### MCP Servers
| Server                    | Required | Configured |
|---------------------------|----------|------------|
| playwright-chrome         | Yes      | Yes        |
| playwright-firefox        | Yes      | Yes        |
| playwright-edge           | Yes      | Yes        |
| postman                   | Optional | Yes        |
| atlassian                 | Optional | Yes        |
| context7                  | Optional | No (skill /vc-docs falls back to VirtoOZ) |

### Test Infrastructure
| Item                          | Status |
|-------------------------------|--------|
| manifest.json                 | OK     |
| config/test-suites.json       | OK (99 suites, schema valid) |
| test-data/aliases.json        | OK     |
| test-data/aliases.qa.json     | OK (env overrides active) |
| Suite CSV files               | OK (99/99 present) |
| reports/ directory            | OK     |

### Verdict: READY
(or NOT READY: list specific blockers + remediation hints)
```

---

## Rules

- Read-only — no browser automation, no test execution, no admin writes.
- Use Bash (curl) for endpoint checks. `-k` flag for self-signed certs (common in customer dev/qa envs). On Windows, `-sk` is required (memory: SSL cert issue on Windows).
- Run `npm run env:check` for variable validation — it loads the layered env files and reports merged state.
- For platform health, use `$BACK_URL/health` (NOT `/api/platform/healthcheck` — that path returns 404; see memory `Platform health endpoint`).
- Fast execution target: < 30 seconds total.
- When `ENV_RISK=production`, lead the output with the production warning so the user can't miss it.
