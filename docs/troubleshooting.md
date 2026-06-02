# VC QA Plugin — Troubleshooting

> Greppable catalog of known failure modes + remediations. Use this when something fails on install or during a test run. Each entry has a unique anchor for support runbook references.
>
> Can't find your issue? File a GitHub Issue with the symptom + the full output of `npm run plugin:check`. See [`docs/support-runbook.md`](support-runbook.md) for the escalation path.

## Quick index

| If you see… | Jump to |
|-------------|---------|
| `Invalid marketplace source format` | [#install-1](#install-1-invalid-marketplace-source-format) |
| `marketplace.json not found` | [#install-2](#install-2-marketplacejson-not-found) |
| Plugin installed but no agents/commands appear | [#install-3](#install-3-plugin-installed-but-no-agents-or-commands-appear) |
| `Invalid TEST_ENV` | [#config-1](#config-1-invalid-test_env-validation-error) |
| `Missing CORE environment variables` | [#config-2](#config-2-missing-core-environment-variables) |
| Suites all skip with "envRiskGate exceeded" | [#runtime-1](#runtime-1-suites-all-skip-with-envriskgate-exceeded) |
| Suites all skip with "requires modules not in MODULES_ENABLED" | [#runtime-2](#runtime-2-suites-skip-with-requiresmodules) |
| `Failed to resolve @td(...)` | [#runtime-3](#runtime-3-failed-to-resolve-td-reference) |
| `Browser "chromium" is not installed` | [#mcp-1](#mcp-1-browser-chromium-is-not-installed-from-playwright-mcp) |
| Platform `/health` returns 404 | [#platform-1](#platform-1-platform-health-endpoint-returns-404) |
| `npm run schema:check` fails on Windows | [#platform-2](#platform-2-npm-run-schema-check-fails-on-windows) |
| Bugs filed to the wrong JIRA project | [#runtime-4](#runtime-4-bugs-filed-to-wrong-jira-project) |

---

## Install + first-run failures

### #install-1 · "Invalid marketplace source format"

**Symptom:** Running `/plugin marketplace add github://VirtoCommerce/vc-mcp-testing-module` returns:
```
Invalid marketplace source format. Try: owner/repo, https://..., or ./path
```

**Cause:** The `github://` URI scheme is not supported. Valid formats are:
- `owner/repo` (GitHub shorthand)
- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git` (SSH)
- `./path/to/local/checkout`

**Fix:**
```
/plugin marketplace add VirtoCommerce/vc-mcp-testing-module
```

Or for local testing while developing:
```
/plugin marketplace add ./
```

### #install-2 · "marketplace.json not found"

**Symptom:** `/plugin marketplace add` claims success but `/plugin install vc-qa@vc-tools` fails with `Plugin vc-qa not found in vc-tools marketplace`.

**Cause:** Marketplace was added but the source repo's default branch doesn't contain `.claude-plugin/marketplace.json`. For our repo this happens if you target a branch that pre-dates the plugin migration (anything before commit `ecf00c4` on `feature/v0.3-product-audit` / `main` after merge).

**Fix:** Ensure you're on a branch/tag with the manifest. For published releases:
```
/plugin marketplace remove vc-tools
/plugin marketplace add VirtoCommerce/vc-mcp-testing-module
/plugin install vc-qa@vc-tools
```

For local testing, ensure your working tree has `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`:
```bash
ls .claude-plugin/   # should show plugin.json + marketplace.json
git checkout main    # or the branch with the plugin migration
```

### #install-3 · Plugin installed but no agents or commands appear

**Symptom:** `/plugin install vc-qa@vc-tools` reports success, but `/agents` doesn't list any of the QA agents, and `/qa-*` slash commands are not recognized.

**Causes:**
1. Claude Code may need a session refresh after plugin install.
2. Slash commands may be namespaced under the plugin: `/vc-qa:qa-status` instead of `/qa-status`.
3. Plugin install dir's `.claude/agents/`, `.claude/skills/`, `.claude/commands/` paths may not match what Claude Code expects.

**Fix:**
1. Restart Claude Code session (or the IDE if running embedded).
2. Try the namespaced form: `/vc-qa:qa-status`, `/vc-qa:qa-smoke`, etc.
3. Run `/plugin list` to confirm vc-qa shows as installed + enabled.
4. If still broken, run `/plugin remove vc-qa@vc-tools` then re-install; the cache may be stale.

---

## Configuration failures

### #config-1 · "Invalid TEST_ENV" validation error

**Symptom:** Any command using `TEST_ENV` reports:
```
[config] Invalid TEST_ENV="customer-staging-eu". Must match [a-z0-9_]+.
Use underscores instead of hyphens (e.g. "customer_staging_eu", not
"customer-staging-eu"). This is required so per-env secrets in .env.local
(e.g. USER_PASSWORD_CUSTOMER_STAGING_EU) resolve correctly.
```

**Cause:** Your `TEST_ENV` name contains characters other than `[a-z0-9_]`. Most commonly: hyphens (`-`), uppercase, or special characters. Why: `config.js` uses `TEST_ENV.toUpperCase()` as a suffix to look up per-env secrets in `.env.local` (e.g. `USER_PASSWORD_${TEST_ENV.upper()}`). Hyphens break the suffix promotion silently in older versions; the validator catches it loud now.

**Fix:** Rename `TEST_ENV` to use underscores. E.g.:
- `customer-staging-eu` → `customer_staging_eu`
- `feature-branch-X` → `feature_branch_x`
- `Region-Asia-Prod` → `region_asia_prod`

Then rename your `.env.${TEST_ENV}` file accordingly. Update any per-env suffixes in `.env.local` to match.

### #config-2 · "Missing CORE environment variables"

**Symptom:** `npm run env:check` or `npm run plugin:check` exits with:
```
[config] Missing CORE environment variables (required for any run): FRONT_URL, BACK_URL, ...
[config] Run: npm run plugin:configure   (or edit .env.${TEST_ENV} + .env.local manually)
```

**Cause:** One or more of the 7 CORE env vars isn't set: `FRONT_URL`, `BACK_URL`, `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `STORE_ID`.

**Fix:** Run the configure wizard:
```bash
npm run plugin:configure
```

Or edit manually:
- Per-env values (URLs, store ID) → `.env.${TEST_ENV}`
- Secrets (passwords) → `.env.local` with per-env suffix (e.g. `USER_PASSWORD_${TEST_ENV.upper()}`)

See [`docs/onboarding.md`](onboarding.md) § Configuration Buckets for the 3-bucket env model.

### #config-3 · Feature-gated vars cause warnings (not failures)

**Symptom:** `npm run env:check` logs:
```
[config] FEATURE-GATED skipped: /qa-design Figma comparison — set FIGMA_API_KEY to enable
[config] FEATURE-GATED skipped: /qa-postman, /qa-api test — set POSTMAN_API_KEY to enable
```

**Not an error** — these are warnings about optional features. Skip if you don't use the named skill. To enable, set the listed env vars in `.env.local`.

---

## Runtime / orchestrator failures

### #runtime-1 · Suites all skip with "envRiskGate exceeded"

**Symptom:** Running `npm run ci:critical` or `/qa-regression critical` logs:
```
[multi-env-filter] Skipping 45 suite(s) due to env constraints:
  - 011: envRiskGate "staging" exceeded by active ENV_RISK "production"
  - 013: envRiskGate "staging" exceeded by active ENV_RISK "production"
  ...
```

**Cause:** `ENV_RISK=production` in your `.env.${TEST_ENV}` is correctly blocking the 45 admin-write suites from running on a production-risk env. This is the safety gate working as designed.

**Fix (choose one):**
- **Intentional skip** — keep `ENV_RISK=production`, accept that read-only suites only run. This is the safest option for prod.
- **Override per-run** — pass the escape hatch flag:
  ```bash
  ALLOW_ADMIN_WRITES_ON_PROD=true TEST_ENV=prod ENV_RISK=production npm run ci:critical
  ```
  The orchestrator logs a prominent warning at startup. Use sparingly.
- **Lower the env risk** — if the env is not actually production, set `ENV_RISK=staging` in `.env.${TEST_ENV}`. The 45 suites will then run.

### #runtime-2 · Suites skip with "requiresModules not in MODULES_ENABLED"

**Symptom:**
```
[multi-env-filter] Skipping 12 suite(s) due to env constraints:
  - 059: requires modules [cms] not in MODULES_ENABLED
  - 075: requires modules [loyalty] not in MODULES_ENABLED
  ...
```

**Cause:** Your `MODULES_ENABLED` env var lists fewer modules than the suites require. This is intentional — the orchestrator skips suites for modules you don't have installed.

**Fix:**
- If you HAVE that module installed → add it to `MODULES_ENABLED` in `.env.${TEST_ENV}`. E.g. `MODULES_ENABLED=catalog,customer,orders,cms,loyalty`.
- If you DON'T have that module → skip is correct. Nothing to do.
- To disable the filter entirely → leave `MODULES_ENABLED` empty (the filter is a no-op when unset).

### #runtime-3 · "Failed to resolve @td() reference"

**Symptom:** `npx tsx scripts/validate-td-refs.ts` or a suite run logs:
```
[test-data-resolver] Failed to resolve @td(TECHFLOW_ADMIN.email): Unknown alias "TECHFLOW_ADMIN"
```

**Cause:** A suite uses an alias that's not in your `test-data/aliases.json`. Common reasons:
1. You forked from the plugin but didn't migrate vcst's specific aliases to your own equivalents.
2. The suite is a **reference** suite (per `customerApplicability` tag) that needs adaptation, not direct use.
3. You renamed an alias without updating the suite that references it.

**Fix (in order of preference):**
1. **Add your own equivalent** — define `TECHFLOW_ADMIN` (or whatever name your test uses) in `test-data/aliases.json` pointing at your equivalent entity.
2. **Override per-env** — define it in `test-data/aliases.${TEST_ENV}.json` if it differs per environment.
3. **Skip the suite** — if it's vcst-specific, don't include it in your selection. Mark it explicitly in your `MODULES_ENABLED` or remove its ID from your regression selection.
4. **Use the inline form** — if the value is a one-off, use `@td(file, filter, column)` form referencing a CSV row directly.

See [`docs/test-authoring.md`](test-authoring.md) § Section 2 (The `@td()` Resolver) for the full syntax.

### #runtime-4 · Bugs filed to wrong JIRA project

**Symptom:** `/qa-bug <description>` files a JIRA ticket but it goes to project `VCST` instead of your project.

**Cause:** `JIRA_PROJECT_KEY` env var not set; defaults to `VCST` (vcst's project) for backwards compatibility.

**Fix:** Set in `.env.${TEST_ENV}`:
```bash
JIRA_PROJECT_KEY=YOUR_PROJECT_KEY
```

Where `YOUR_PROJECT_KEY` is the key from Atlassian → Projects → your project → Settings → Details (usually 3-5 uppercase letters).

---

## MCP / Browser failures

### #mcp-1 · "Browser 'chromium' is not installed" from Playwright MCP

**Symptom:**
```
Error: Browser "chromium" is not installed at /path/to/playwright-mcp/...
```

**Cause:** Playwright MCP bundles its own `playwright-core` and expects browsers installed in its sandbox, not your global Playwright install. Common after MCP version updates.

**Fix:** Run the install command from inside the MCP's bundled Playwright. The exact path depends on your MCP install location (npm global vs local). One typical path:
```bash
cd ~/.npm/_npx/{hash}/node_modules/@playwright/mcp/node_modules/playwright-core
npx playwright install chromium
```

Or simpler, force the MCP to use your global Playwright by setting `PLAYWRIGHT_BROWSERS_PATH` env var before launching the MCP. See your Playwright MCP config (`config/mcp-playwright-*.config.json`) for browser-specific overrides.

No Claude Code restart needed after the install — the MCP picks up the browsers on next launch.

### #mcp-2 · Playwright Firefox MCP cart-dropdown timeout

**Symptom:** Tests on Firefox MCP timeout when interacting with `/cart` payment dropdown or dialog buttons, even though the same flow works on Chrome/Edge.

**Cause:** Known stability check quirk in Firefox MCP (CLS=0 false positive). Not a product bug.

**Fix:** Use Chrome or Edge MCP for checkout completion tests. Firefox stays useful for cross-browser verification on non-cart pages.

### #mcp-3 · `chromium not chrome` browser engine name

**Symptom:** MCP config rejects `"browserName": "chrome"`.

**Cause:** Playwright uses `chromium` as the engine name, not `chrome`. Same for `firefox` and `webkit`.

**Fix:** Edit `config/mcp-playwright-chrome.config.json` (or similar) to use:
```json
{ "browserName": "chromium", "channel": null }
```

For Edge specifically: `{ "browserName": "chromium", "channel": "msedge" }`.

WebKit is NOT supported on Windows — fall back to Edge or Chrome.

---

## Platform endpoint failures

### #platform-1 · Platform `/health` endpoint returns 404

**Symptom:** `curl ${BACK_URL}/api/platform/healthcheck` returns 404.

**Cause:** The VC platform health endpoint is at `/health`, NOT `/api/platform/healthcheck`.

**Fix:**
```bash
curl -sk ${BACK_URL}/health
```

(Add `-sk` on Windows for SSL self-signed cert acceptance.)

Returns JSON with `Modules`, `Cache`, `Redis`, `SQL Server` status fields. Use this in CI health checks.

### #platform-2 · `npm run schema:check` fails on Windows

**Symptom:** Running `npm run schema:check` on Windows cmd.exe yields:
```
The system cannot find the path specified.
```

**Cause:** The script ends in `> /dev/null` which is a bash-ism not recognized on Windows.

**Fix:** Run the underlying script directly instead of via `npm run`:
```bash
node scripts/refresh-graphql-schema.mjs --dry-run
```

Same fix for any other `npm run` script that uses bash redirects or inline `VAR=val cmd` syntax. The driver (`node .claude/skills/run-vc-mcp-testing-module/driver.mjs`) sidesteps this by invoking scripts directly.

### #platform-3 · Auth token fails with 403 / 400

**Symptom:**
```bash
curl -sk -X POST ${BACK_URL}/connect/token -d 'grant_type=password&...'
# Returns 400 or 403
```

**Cause:** Common reasons:
- Wrong `client_id` (try `internal-frontend` for storefront flows)
- Account locked (5 failed login attempts → automatic lockout)
- Password expired
- MFA enabled on the account
- Account `userType` doesn't match the storefront type (e.g., Administrator-type can't auth against storefront; needs Customer-typed user)

**Fix:** Verify in Admin SPA → Security → Users → your test user:
- `userType` matches the surface you're testing
- Account is not locked (check the `lockoutEnd` field)
- Email is verified (`emailConfirmed: true`)
- The user's role includes the required permissions (e.g., `platform:security:loginOnBehalf` for impersonation tests)

---

## Plugin update / versioning failures

### #update-1 · Customer pinned to old version but docs reference new features

**Symptom:** Customer-side docs (their own fork's `CHANGELOG.md` or `docs/onboarding.md`) describe features (e.g. `PAYMENT_PROCESSORS_ENABLED`, `customerApplicability` tags) that don't exist in their installed version.

**Cause:** Customer pinned to an older plugin version. New features land in newer minor releases.

**Fix:**
- Check installed version: `cat .claude-plugin/plugin.json` (look for `"version"`)
- Compare to latest: see [`CHANGELOG.md`](../CHANGELOG.md)
- Update: `/plugin update vc-qa@vc-tools` (Claude Code refreshes from marketplace)

### #update-2 · Two marketplaces with the same name

**Symptom:**
```
Marketplace name 'vc-tools' already exists. Adding this marketplace will replace the existing one.
```

**Cause:** Claude Code allows only one marketplace per name globally. If you registered `vc-tools` from a different source (e.g., a fork), the official one will replace it.

**Fix:**
- If you registered a custom fork's marketplace as `vc-tools`, accept the replacement to switch to the official.
- If you have a private fork that needs to stay separate, rename it in `marketplace.json` (e.g., `vc-tools-internal`).

---

## "It worked once but now doesn't" failures

### #regression-1 · Suite fails today, passed yesterday — same env, same code

Most common causes (in order of frequency):
1. **vcst-qa data drift** — vcst-qa's test data was reseeded; alias values stale. Check `_meta.changelog_*` in `test-data/aliases.json` for recent entries.
2. **Asset hash mismatch** during deployment — the storefront serves a build that doesn't match what the plugin expects. Wait for the deploy to finish, then re-run.
3. **MCP browser cache** — playwright-chrome cached a stale admin SPA bundle (4h max-age). Force-refresh:
   ```bash
   # Restart playwright-chrome MCP and try again
   ```
4. **Platform background job** — search indexer lag (30-60s after a product change). Wait and retry. See `BL-CROSS-002`.

### #regression-2 · `/qa-bug` reports "filed" but no JIRA ticket created

**Symptom:** Bug-filing skill claims success, but the ticket doesn't appear in JIRA.

**Causes:**
1. Atlassian MCP not authenticated (run `/mcp` to verify)
2. `JIRA_PROJECT_KEY` is wrong; ticket went to a project you don't have access to (check #runtime-4)
3. Customer's JIRA disallows Bug-Create from API
4. JIRA's required custom fields aren't being populated by the plugin

**Fix:**
1. `/mcp` → verify `atlassian` shows as connected
2. Try filing directly via `mcp__atlassian__createJiraIssue` with explicit project key
3. Check JIRA admin: enable Bug-Create via REST API for the test user's role
4. If custom fields blocking: file manually + open a GitHub Issue with the required-field error so the plugin can add them

---

## When to escalate

| Severity | Action |
|----------|--------|
| Install fails on a fresh clone | File a GitHub Issue with the full `npm run plugin:check` output |
| Plugin breaks after a working install | Reproduce from a clean MCP cache (clear `~/.claude/cache/plugins/vc-qa` if exists), then file Issue |
| Same suite fails on 2+ envs with same root cause | Real plugin bug — file Issue with the bug report from `/qa-bug` |
| Customer storefront bug surfaced by a passing-suite assertion | Not a plugin bug — file in YOUR JIRA project |
| Anything time-sensitive affecting an active pilot | Direct contact to your VC pilot owner (per [`docs/support-runbook.md`](support-runbook.md) § 1) |

## Adding new entries

When you hit a new failure mode + fix it, contribute back:

1. Edit this file with a new entry following the existing pattern (anchor, symptom, cause, fix)
2. Add the new anchor to the Quick Index table at the top
3. Update [`docs/support-runbook.md`](support-runbook.md) § 3.B (config-issue lookup) with a one-line row pointing here
4. Open a PR

See [`docs/support-runbook.md`](support-runbook.md) § 7 (Knowledge Base Contributions) for the contribution discipline.

## References

- Customer onboarding: [`docs/onboarding.md`](onboarding.md)
- Test authoring (clone-and-adapt + customer suites): [`docs/test-authoring.md`](test-authoring.md)
- Support runbook (internal-to-VC, escalation paths): [`docs/support-runbook.md`](support-runbook.md)
- Versioning + stability contract: [`docs/versioning.md`](versioning.md)
- Distribution + plugin install mechanism: [`docs/distribution.md`](distribution.md)
- Claude Code plugin docs: https://code.claude.com/docs/en/plugin-marketplaces
