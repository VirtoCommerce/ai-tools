---
description: "Validate VC QA plugin environment: env vars, both surfaces (storefront + Admin SPA), MCP servers, the profile's tracker/host connectivity, multi-env config, test infrastructure. Read-only, fast (<30s)."
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
Tracker / Host      : {profile.tracker.kind or 'jira (default)'} / {profile.vcs.clientHost or 'github (default)'}  — see check 6
Ticket key          : {profile.tracker.projectKey/JIRA_PROJECT_KEY (Jira) | 'Azure Boards — numeric id' (azure)}
```

Read `project-profile.json` (if present) once to fill the Tracker/Host line and drive check 6; **absent ⇒ native defaults (Jira / GitHub / VirtoCommerce)**, exactly as before.

If `ENV_RISK=production`, add a prominent warning:
```
⚠ PRODUCTION-RISK ENV. Admin-write suites will refuse to run unless
  --allow-admin-writes-on-prod is passed.
```

### 2. Environment Variables

Run `npm run env:check` to verify required variables are set. Source of truth for the schema: **`config.js`** (the layered env loader) — the customer should consult that for what's required.

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
| `atlassian` | `/qa-bug` ticket filing, `/qa-fix` transitions, `/qa-verify-fix` — **only when `tracker.kind = jira`** (see check 6) |
| `context7` | `/vc-docs` (fallback) |
| `github` | `/qa-fix` PR open/route, `/project-init` repo discovery — **the platform upstream is always GitHub**; a client repo may instead be on Azure Repos (check 6) |
| `claude_ai_VirtoOZ_for_virtocommerce_com_docs` | `/vc-docs` (primary) |

Optional MCPs missing = warning, not failure. The dependent skill prints a clear error at runtime. **The tracker/host rows are profile-gated** — check 6 probes only the axis the profile actually uses (an Azure-Boards deployment doesn't need `atlassian`; an Azure-Repos client doesn't need `github` for its own code).

**Configured ≠ working — probe the credential, don't just count the server (VCST-5702 ITEM 3).** A server present in `.mcp.json` with an unresolved placeholder key reads as "configured", then every dependent call fails at runtime (observed: `.mcp.json` shipped a literal `<CONTEXT7_API_KEY>`; the server registered, then `/qa-bug` Step 0 died with `Invalid API key … should start with 'ctx7sk'`). So for each credentialed MCP:

- **Flag any header/env value still matching `/^<.*>$/` as `NOT READY`, naming the key** (e.g. `context7: NOT READY — CONTEXT7_API_KEY is still the placeholder <CONTEXT7_API_KEY>`). A placeholder is a hard NOT READY, never a silent pass.
- **Run ONE lightweight live probe per credentialed MCP** and report `NOT READY` on an auth failure — for `context7`, `resolve-library-id` on a known library (e.g. `react`); the tracker/host axes already probe live in check 6.
- **Warn that plaintext secrets do not belong in `.mcp.json`** — reference the env var instead (`"Authorization": "Bearer ${CONTEXT7_API_KEY}"`, value in `.env.local`), so a key is never committed and rotation is one place.

### 5. Plugin Local State

Quick checks on plugin local state (vc-fix has no suite manifest / test-data registry — those are
full `vc-qa` plugin only, not shipped here):

| Item | Check |
|------|-------|
| `project-profile.json` | Exists at repo root, valid JSON — written by `/project-init`; its absence means `/qa-fix` falls back to native-platform/Jira/GitHub defaults. |
| `.fix-workspace/` | Present or creatable (gitignored — `/qa-fix` clones repos here). |
| `reports/bugs/` | Exists (create if missing — `/qa-bug` writes here). |
| `reports/fixes/` | Exists (create if missing — `/qa-fix` writes here). |

### 6. Tracker & Code-Host Connectivity (profile-driven)

Probe the **actual** tracker and code host the profile selects — not a fixed Jira+GitHub pair — plus
the topology-required auth env vars for the resolved axes. Read `project-profile.json`
(`tracker.kind`, `vcs.clientHost`, `upstream.contributionMode`). See
[`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §1–§4. **No profile ⇒ probe Jira + GitHub —
the native default, unchanged.**

**Tracker** (`tracker.kind`):

| kind | Probe | Expected | Env vars required |
|------|-------|----------|-------------------|
| `jira` (or no profile) | Atlassian MCP `getVisibleJiraProjects` (or `getJiraIssue` on a known key) | project list / issue JSON | Atlassian MCP OAuth **or** `JIRA_API_TOKEN` + `JIRA_EMAIL`; `JIRA_PROJECT_KEY` set |
| `azure` | `node "$pluginRoot/skills/qa-fix-routing/ado.mjs" list-types` | Bug work-item types as JSON (not an HTML sign-in page) | `ADO_PAT` **or** `ADO_AUTH=az-login`; `ADO_ORG` / `ADO_PROJECT` (else from the profile) |

> `$pluginRoot` above = the ACTIVE vc-fix install path, resolved at runtime via `claude plugin list --json` (not a profile field; see [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)).

**Code host** (`vcs.clientHost` for the client's own repos; the platform upstream is always GitHub):

| host | Probe | Expected | Env vars required |
|------|-------|----------|-------------------|
| `github` (or no profile) | `gh auth status` (write scope) — or `GH_TOKEN="$GITHUB_FIX_BUGS_TOKEN" gh api repos/<owner>/<repo> --jq .permissions.push` | authenticated / `true` | `GITHUB_FIX_BUGS_TOKEN` (PAT host) **or** a `gh auth login` session (`vcs.auth: gh-cli`) |
| `azure-repos` | ADO repos REST `GET {base}/_apis/git/repositories/<repo>?api-version=7.1` (or `ado.mjs list-refs`) | repo JSON (not the 203 + HTML sign-in) | `ADO_PAT` **or** `az login` |

- **Platform fork-PR / upstream issue** (`upstream.contributionMode: fork`, or a client filing upstream): needs `GITHUB_FIX_BUGS_TOKEN` (or `gh` session) **regardless** of the client host — the VirtoCommerce upstream is public GitHub.
- Report each probed axis as UP/DOWN + which env vars are present/missing (never print the token value). A missing var on an axis the profile **does not** use is not a blocker.

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

### Plugin Local State
| Item                          | Status |
|-------------------------------|--------|
| project-profile.json          | OK (client / jira / github) |
| .fix-workspace/               | OK (creatable) |
| reports/bugs/, reports/fixes/ | OK     |

### Tracker & Host Connectivity (profile-driven)
| Axis    | Resolved       | Probe               | Status | Auth vars |
|---------|----------------|---------------------|--------|-----------|
| Tracker | azure (Boards) | ado.mjs list-types  | UP     | ADO_PAT ✓ |
| Host    | azure-repos    | ADO repos REST      | UP     | ADO_PAT ✓ |
| Upstream| fork → GitHub  | gh auth status      | UP     | GITHUB_FIX_BUGS_TOKEN ✓ |

### Verdict: READY
(or NOT READY: list specific blockers + remediation hints)
```

**Signal completion (self-diagnostics — the LAST action).** After the readiness table above (whether
the verdict is READY or NOT READY — both are a completed run), run this once (best-effort, silent,
never blocks):

```bash
node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-env-check"
```

So the vc-fix self-diagnostics collector prints its one-line clean/health status **exactly once**
after the run. `$pluginRoot` = the active install path — reuse if already resolved (check 6, Azure),
else `claude plugin list --json` (see [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)).
Details: [`knowledge/diagnostics/skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md)
§Signal completion.

---

## Rules

- Read-only — no browser automation, no test execution, no admin writes.
- Use Bash (curl) for endpoint checks. `-k` flag for self-signed certs (common in customer dev/qa envs). On Windows, `-sk` is required (memory: SSL cert issue on Windows).
- Run `npm run env:check` for variable validation — it loads the layered env files and reports merged state.
- For platform health, use `$BACK_URL/health` (NOT `/api/platform/healthcheck` — that path returns 404; see memory `Platform health endpoint`).
- Fast execution target: < 30 seconds total.
- When `ENV_RISK=production`, lead the output with the production warning so the user can't miss it.
- **Probe the profile's actual tracker/host (check 6), not a fixed Jira+GitHub pair** — read `project-profile.json`; absent ⇒ native Jira/GitHub defaults. Only the axis the profile uses gates readiness; never print a token value.
