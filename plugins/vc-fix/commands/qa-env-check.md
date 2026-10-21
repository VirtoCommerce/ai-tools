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
Tracker / Host      : {profile.tracker.kind} / {profile.vcs.clientHost}  — see check 6 (no profile ⇒ NOT READY)
Ticket key          : {profile.tracker.projectKey/JIRA_PROJECT_KEY (Jira) | 'Azure Boards — numeric id' (azure)}
```

Read `project-profile.json` once to fill the Tracker/Host line and drive check 6; **absent ⇒ verdict NOT READY — run `/project-init`** (there is no Jira / GitHub / VirtoCommerce default any more). Checks 1–5 still run so the operator sees the rest of the picture.

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
3. `.env.local` — gitignored test-user passwords only. Per-env via `USER_PASSWORD_${TEST_ENV.upper()}` suffix promotion. **No GitHub / Azure DevOps / Jira token lives in any `.env*` file** — those are in vc-secrets (check 6).
4. `.env` — legacy fallback for backwards-compat.

Three buckets — this table is the definition; there is no separate configuration doc:

| Bucket | Source | Examples |
|--------|--------|----------|
| Plugin-supplied | `.env.defaults` | Sandbox card numbers, Builder.io public URL |
| Customer-required (per env) | `.env.${TEST_ENV}` | `FRONT_URL`, `BACK_URL`, `STORE_ID`, `STOREFRONT_PROFILE`, `MODULES_ENABLED` (+ `ENV_RISK`, optional — `test` when unset, set `production` by hand for a production stand) |
| Project-wide (every env) + customer-secret | `.env.local` (gitignored) | `JIRA_BASE_URL`, `JIRA_PROJECT_KEY`, `JIRA_EMAIL` / `ADO_ORG`, `ADO_PROJECT`, `CLIENT_REPO_ORG`; `USER_PASSWORD_*`, `ADMIN_PASSWORD_*`, `FIGMA_API_KEY` |

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
| `github` | `/qa-fix` PR open/route, `/project-init` repo discovery — **the platform upstream is always GitHub**; a client repo may instead be on Azure Repos (check 6). On a PAT axis its entry is `node ${VC_SECRETS} run github` (vc-secrets injects the token at launch); on a session axis the hosted server with OAuth |
| `claude_ai_VirtoOZ_for_virtocommerce_com_docs` | `/vc-docs` (primary) |

Optional MCPs missing = warning, not failure. The dependent skill prints a clear error at runtime. **The tracker/host rows are profile-gated** — check 6 probes only the axis the profile actually uses (an Azure-Boards deployment doesn't need `atlassian`; an Azure-Repos client doesn't need `github` for its own code).

**Configured ≠ working — probe the credential, don't just count the server (VCST-5702 ITEM 3).** A server present in `.mcp.json` with an unresolved placeholder key reads as "configured", then every dependent call fails at runtime (observed: `.mcp.json` shipped a literal placeholder API key; the server registered, then `/qa-bug` Step 0 died with `Invalid API key`). So for each credentialed MCP:

- **Flag any header/env value still matching `/^<.*>$/` as `NOT READY`, naming the key** (e.g. `<server>: NOT READY — <KEY> is still the placeholder <KEY>`). A placeholder is a hard NOT READY, never a silent pass.
- **Run ONE lightweight live probe per credentialed MCP** and report `NOT READY` on an auth failure; the tracker/host axes already probe live in check 6.
- **Flag any plaintext token in `.mcp.json` as `NOT READY`** — a token belongs in vc-secrets, and the server entry is a `node ${VC_SECRETS} run <server>` call; `/project-init --check` moves a token that is still in a file.

### 5. Plugin Local State

Quick checks on plugin local state (vc-fix has no suite manifest / test-data registry — those are
full `vc-qa` plugin only, not shipped here):

| Item | Check |
|------|-------|
| `project-profile.json` | Exists at repo root, valid JSON — written by `/project-init` (the `vc-init` plugin); absent ⇒ NOT READY, `/qa-bug` / `/qa-fix` / `/qa-verify-fix` STOP until `/project-init` runs. |
| Host governance | `governance.host` set ⇒ skip every `$VC_RUN` / vc-secrets check below and verify the host's servers instead ([`knowledge/execution/host-governance.md`](../knowledge/execution/host-governance.md); vc-init's `verify-access` prints that table) |
| `$VC_RUN` | Set (by `/project-init`, in `.claude/settings.local.json` `env`) and the file exists — the bridge every tracker/host call goes through. Unset ⇒ NOT READY: the project was onboarded before VCST-6402, run `/project-init --check`. |
| `.fix-workspace/` | Present or creatable (gitignored — `/qa-fix` clones repos here). |
| `reports/bugs/` | Exists (create if missing — `/qa-bug` writes here). |
| `reports/fixes/` | Exists (create if missing — `/qa-fix` writes here). |

### 6. Tracker & Code-Host Connectivity (profile-driven)

Probe the **actual** tracker and code host the profile selects — not a fixed Jira+GitHub pair — through the
bridge, so the probe exercises exactly the path every real call takes. Read `project-profile.json`
(`tracker.kind`, `vcs.clientHost`, `upstream.contributionMode`, `auth.*`). See
[`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §1–§4. **No profile ⇒ skip this check and report
NOT READY (run `/project-init`).**

**Are the tokens stored?** Run `node "<VC_SECRETS>" doctor` once (`<VC_SECRETS>` = the vc-secrets shim, the
`VC_SECRETS` path `/project-init` wrote into the project's `.claude/settings.local.json` `env`). It resolves every declared secret (`github-pat`,
`ado-pat`, `jira-token`) without printing a value and exits non-zero on any `FAIL`. A `FAIL` on an axis the
profile uses is a blocker — the operator stores the token with `node "<VC_SECRETS>" set <name>` in their own
terminal, then `/project-init --check`. Session axes (`gh auth login` / `az login` / Atlassian OAuth) declare
no secret, so `doctor` has nothing to report for them; the probes below cover them.

**Tracker** (`tracker.kind`):

| kind | Probe | Expected | Auth |
|------|-------|----------|------|
| `jira` | `node "$VC_RUN" jira myself` (or, on `auth.jira: oauth`, Atlassian MCP `getVisibleJiraProjects`) | `{ accountId, displayName }` / project list | `jira-token` in vc-secrets (`auth.jira: pat`) **or** Atlassian OAuth; `tracker.projectKey` set |
| `azure` | `node "$VC_RUN" ado whoami` | the token/session owner `{ name, mail }` (not an HTML sign-in page) | `ado-pat` in vc-secrets (`auth.ado: pat`) **or** an `az login` session |

**Code host** (`vcs.clientHost` for the client's own repos; the platform upstream is always GitHub):

| host | Probe | Expected | Auth |
|------|-------|----------|------|
| `github` | `node "$VC_RUN" gh api repos/<owner>/<repo> --jq .permissions.push` (identity: `node "$VC_RUN" gh api user --jq .login`) | `true` | `github-pat` in vc-secrets (`auth.github: pat`) **or** a `gh auth login` session (`auth.github: gh-cli`) |
| `azure-repos` | `node "$VC_RUN" ado list-refs --repo <repo>` | refs JSON (not the 203 + HTML sign-in) | `ado-pat` in vc-secrets **or** `az login` |

The same command runs on either axis — the bridge injects the PAT or runs on the session; never branch on `auth.*`
yourself. `gh auth status` is refused by the bridge; the `gh api` probes above replace it.

- **Platform fork-PR / upstream issue** (`upstream.contributionMode: fork`, or a client filing upstream): needs the GitHub axis (`github-pat` or a `gh` session) **regardless** of the client host — the VirtoCommerce upstream is public GitHub; `node "$VC_RUN" gh api user --jq .login` proves the identity.
- Report each probed axis as UP/DOWN + whether its secret is stored (from `doctor`) — never print a token value. A missing secret on an axis the profile **does not** use is not a blocker.

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
| atlassian                 | Optional | Yes        |

### Plugin Local State
| Item                          | Status |
|-------------------------------|--------|
| project-profile.json          | OK (client / jira / github) |
| .fix-workspace/               | OK (creatable) |
| reports/bugs/, reports/fixes/ | OK     |

### Tracker & Host Connectivity (profile-driven)
| Axis    | Resolved       | Probe                         | Status | Secret (doctor) |
|---------|----------------|-------------------------------|--------|-----------------|
| Tracker | azure (Boards) | $VC_RUN ado whoami            | UP     | ado-pat ✓ |
| Host    | azure-repos    | $VC_RUN ado list-refs         | UP     | ado-pat ✓ |
| Upstream| fork → GitHub  | $VC_RUN gh api user           | UP     | github-pat ✓ |

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
after the run. `$pluginRoot` = the active install path, resolved via `claude plugin list --json` (see [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)).
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
- **Probe the profile's actual tracker/host (check 6), not a fixed Jira+GitHub pair** — read `project-profile.json`; absent ⇒ NOT READY, run `/project-init`. Every tracker/host probe goes through `node "$VC_RUN" …`; never read a token from a file, never print one. Only the axis the profile uses gates readiness.
