# Test Runner Tag & Column Reference

Shared reference for `test-runner-agent.md` and `autonomous-test-runner.md`. Consulted on demand — do NOT pre-read at suite start.

## CSV Columns (enriched agent-native format)

| Column | Use |
|--------|-----|
| `ID` | Stable test case ID — report in results JSON |
| `Title` | Test name — announce before execution |
| `Section` | Grouping only |
| `Priority` | Critical/High/Medium/Low — determines failure severity |
| `Business_Rule` | BL-* invariant(s). If observed behavior violates it, mark FAIL regardless of steps. Look up the specific BL-ID in `knowledge/business-logic.md` only if ambiguous |
| `Edge_Case_Refs` | ECL-* sections to actively watch for. Look up in `knowledge/e-commerce-edge-cases-library.md` only if ambiguous |
| `Preconditions` | Verify before executing; mark BLOCKED if unmet |
| `Test_Data` | `{{VAR}}` and `@td()` bindings — see substitution below |
| `Steps` | Typed action steps — see Step Tags |
| `Assertions` | Explicit pass/fail predicates — see Assertion Tags |
| `Cross_Layer_Checks` | API / console / network — see Cross-Layer Tags |
| `Failure_Signals` | Early warning patterns — monitor throughout, not just at end |
| `Cleanup` | State restoration — execute after every test |
| `References` | JIRA / sprint ticket IDs — include in bug reports |
| `Automation_Status` | Automated/Manual/Semi-Automated — record in results |

## Precondition Tags (`[PRE:*]`)

`[PRE:*]` tags appear in the `Preconditions` column and specify **execution-time state-setup actions** that the runner performs via browser UI before executing the test's `Steps` block. They are imperative (runner acts) not merely declarative (runner verifies). Full protocol: `.claude/agents/knowledge/test-execution-preflight.md`.

| Tag | Action |
|-----|--------|
| `[PRE:SIGNOUT]` | Sign out via account-menu popup if currently signed in |
| `[PRE:SIGNIN_AS:<alias>]` | Sign in as the user resolved from `<alias>` (e.g., `TECHFLOW_ADMIN`, `USER2`, `USER_DEFAULT`); sign out first if different user is active |
| `[PRE:SWITCH_ORG:<alias>]` | Switch to the org identified by `<alias>` via org-switcher UI; execute after sign-in |
| `[PRE:RESET_CART]` | Clear all items from the cart via UI; proceed even if clear partially fails |
| `[PRE:CLEAR_SESSION]` | Full sign-out + fresh page load to purge session; use at user-context block boundaries |
| `[PRE:CLEAR_CACHE]` | Cache-busting navigate to force fresh asset load after module hotfix deployments |
| `[PRE:VERIFY_AUTH:<alias>]` | Assert current session is `<alias>` without changing state; BLOCKED on mismatch |

**Canonical tag order when multiple tags appear on one case:**
`[PRE:CLEAR_SESSION]` → `[PRE:SIGNOUT]` → `[PRE:SIGNIN_AS]` → `[PRE:SWITCH_ORG]` → `[PRE:RESET_CART]` → `[PRE:CLEAR_CACHE]` → `[PRE:VERIFY_AUTH]`

**Idempotency rule:** Detect state before acting. If required state is already met, skip the action and proceed.

**Failure policy:** `[PRE:SIGNIN_AS]`, `[PRE:SIGNOUT]`, `[PRE:SWITCH_ORG]`, `[PRE:CLEAR_SESSION]`, `[PRE:CLEAR_CACHE]`, and `[PRE:VERIFY_AUTH]` failures → mark test **BLOCKED**. `[PRE:RESET_CART]` failure → **log warning only**, do NOT block.

## Step Type Tags → Playwright MCP tools

| Tag | Tool |
|-----|------|
| `[NAV]` | `browser_navigate` |
| `[ACT]` | `browser_click`, `browser_fill`, `browser_fill_form`, `browser_type`, `browser_select_option`, `browser_hover` |
| `[WAIT]` | `browser_wait_for` |
| `[ASSERT]` | `browser_snapshot` + evaluate DOM (inline checkpoint — fail immediately on miss) |
| `[SCROLL]` | `browser_evaluate` (scroll into view) |
| `[KEY]` | `browser_press_key` |

After every `[ACT]` that triggers a state change, call `browser_console_messages` — log errors immediately.

## Assertion Target Tags

| Tag | Check |
|-----|-------|
| `[DOM]` | Element visible / text / attribute / enabled state — `browser_snapshot` |
| `[STATE]` | Application state (logged in, item in cart, order created) |
| `[MATH]` | Extract numeric values from DOM, verify the equation |
| `[FORMAT]` | Exact display format (`$24.99` not `$24.9`) |
| `[NAV]` | Current URL matches expected path |

One failing assertion = test FAIL. Business Rule override: BL-* violation = FAIL even if DOM assertions passed.

## Cross-Layer Check Tags

| Tag | Check |
|-----|-------|
| `[API]` | `browser_network_requests` — inspect GraphQL/REST response. **GraphQL mutations: verify `errors[]` is empty — HTTP 200 alone does NOT indicate success (ECL-14.1)** |
| `[CONSOLE]` | `browser_console_messages` — errors + warnings |
| `[NETWORK]` | `browser_network_requests` — 4xx/5xx on primary API calls |
| `[ADMIN]` | Navigate to admin panel, verify back-office state, return |
| `[EMAIL]` | Wait up to 60s for Hangfire job before asserting delivery |

Cross-layer failures are test failures — record in bug report.

## Variable Substitution

Substitute `{{VAR}}` placeholders in `Test_Data`, `Steps`, `Assertions`, `Cross_Layer_Checks` before execution.

**User credentials — agent user pool first, fall back to .env:**

| Placeholder | Resolution |
|-------------|-----------|
| `{{USER_EMAIL}}` | pool lookup by `{{BROWSER_SERVER}}` → `personal_email` (fallback `process.env.USER_EMAIL`) |
| `{{USER_PASSWORD}}` | pool → `personal_password` (fallback `process.env.USER_PASSWORD`) |
| `{{ORG_USER_EMAIL}}` | pool → `b2b_email` (fallback `process.env.ORG_USER_EMAIL`) |
| `{{ORG_USER_PASSWORD}}` | pool → `b2b_password` (fallback `process.env.ORG_USER_PASSWORD`) |

**Other variables — from .env:** `{{FRONT_URL}}`, `{{BACK_URL}}`, `{{TEST_CARD_NUMBER}}`, `{{TEST_CARD_EXP}}`, `{{TEST_CARD_CVV}}`, `{{TEST_SKU}}`, `{{STORE_ID}}`, `{{CULTURE_NAME}}`, `{{CURRENCY_CODE}}`.

**`@td(ALIAS.field)` bindings:** Pre-resolved by orchestrator in the suite CSV written to the run directory. If unresolved (interactive mode), read `test-data/aliases.json` → referenced CSV file → filter to get value.

## Agent User Pool

Read `test-data/users/agent-user-pool.csv`, match `server_name` = `{{BROWSER_SERVER}}`:

| Browser Server | Personal | B2B |
|---------------|----------|-----|
| `playwright-chrome` | `qa-agent-slot1@virtocommerce.com` | `test-john.mitchell-20260310@test-agent.com` (AcmeCorp) |
| `playwright-firefox` | `qa-agent-slot2@virtocommerce.com` | `test-emily.johnson-20260310@test-agent.com` (TechFlow) |
| `playwright-edge` | `qa-agent-slot3@virtocommerce.com` | `test-carlos.rodriguez-20260310@test-agent.com` (BuildRight) |

**Why:** Sharing a user across parallel agents causes cart pollution, order history bleed, flaky auth.

**Fallback:** If pool CSV missing or `seeded: false`, use `.env` creds. Log: `"⚠ Agent user pool not available for {{BROWSER_SERVER}}, falling back to .env credentials"`.

## Common Failure Signals (monitor even when not listed)

- GraphQL mutation `errors[]` non-empty (ECL-14.1)
- Spinner / loading indicator visible > 5s
- HTTP 4xx/5xx on any primary API call
- `console.error` with TypeError or ReferenceError
- Redirect to `/error` or `/404`

## Result Status Definitions

- **PASS** — all assertions + cross-layer checks passed, no BL-* invariant violated
- **FAIL** — any assertion or cross-layer check failed, or BL-* invariant violated
- **BLOCKED** — preconditions not met or environment prevents execution
- **SKIPPED** — intentionally skipped (document reason)

## Transient Failure Signals (NOT auto-confirmed bugs)

- Search index lag (ECL-14.2): price/product not reflected within 60s
- GraphQL `errors[]` with "not found" → may be stale test data
- Spinner timeout on first load → cold start
