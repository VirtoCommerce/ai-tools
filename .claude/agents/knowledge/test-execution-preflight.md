---
applicability: universal
applicability_rationale: "Pre-run readiness checklist (env health, fixture seed, MCP status). Universal."
---

# Test Execution Preflight

Canonical protocol every QA agent consults before executing a test case. Fixes the three gaps exposed by real regression runs:
1. Runs inheriting stale state (leftover cart, previous user's session)
2. Agents barreling through with the wrong user/org when Preconditions don't match
3. No reusable sign-out / sign-in / org-switch / cart-reset macros

This document defines the `[PRE:*]` tag vocabulary and the decision tree that turns those tags into browser actions.

---

## Purpose & Scope

**When preflight runs:**
- **Suite start** — always run the first test's `[PRE:*]` block before any test case executes.
- **Between cases** — re-run preflight only for tags that change (idempotent; see Idempotency Rule below).
- **On precondition mismatch** — if a plain-text Precondition can't be satisfied (e.g., user is logged in as the wrong account), the runner must treat it as a `[PRE:*]` resolution problem and act, not barrel through.

**Scope:** this protocol applies to storefront UI tests executed via Playwright MCP (`playwright-chrome`, `playwright-firefox`, `playwright-edge`) and Chrome DevTools MCP. Admin SPA tests have their own setup flow; API-only tests bypass the UI primitives entirely.

**Hard constraints (from project memory):**
- NEVER hardcode credentials in agent prompts or test cases. Read from `.env` at runtime via resolvers. (`feedback_agents_read_env_creds`)
- ALL actions must use real user interaction — click, type, hover. No JS shortcuts to bypass UI. (`feedback_real_user_interaction`)
- There is no sign-out page. Sign-out is an action in the account-menu popup, not a route. (`feedback_no_signout_page`)
- Close Chrome windows before `playwright-chrome` (user data directory conflict).
- Never use WebKit on Windows.

---

## State Detection

Before acting on any `[PRE:*]` tag, the agent must detect the current browser state. This makes every primitive **idempotent** — if the required state already holds, skip the action.

### How to check current auth state

1. **DOM probe** — take a `browser_snapshot` of the header. Look for:
   - Account-menu button (signed-in): selector area matching `data-testid="main-layout.top-header.account-menu.*"`.
   - Sign in link (signed-out): visible `/sign-in` anchor or "Sign in" text in the header.
2. **Whoami** — if signed in, navigate to `/account/dashboard` or click the account menu and read the displayed user name/email from the popup.
3. **Org context** — for B2B users, read the org name displayed in the header or in the account menu. Compare against the target org alias.
4. **Cart state** — navigate to `/cart` (only if `[PRE:RESET_CART]` is in play) and count line items via `browser_snapshot`.

**Do not** rely on cookies or localStorage alone for identity checks — the DOM is the source of truth for what the user sees. Cookies/localStorage are used by `[PRE:CLEAR_SESSION]` to purge state, not to verify it.

### Selectors (verified live 2026-04-24 on vcst-qa-storefront.govirto.com)

| Purpose | Selector |
|---------|---------|
| Account-menu trigger (header) | `data-test-id="main-layout.top-header.account-menu-button"` |
| Sign-out button (in account menu popup) | `data-test-id="main-layout.top-header.account-menu.sign-out-button"` |
| Sign-in page | URL `/sign-in` |
| Sign-in email field | `data-test-id="sign-in-page.email-input"` |
| Sign-in password field | `data-test-id="sign-in-page.password-input"` |
| Sign-in submit | `data-test-id="sign-in-page.login-button"` |
| Sign-up page | URL `/sign-up` |
| Sign-up first-name field | `data-test-id="sign-up-first-name-input"` |
| Sign-up last-name field | `data-test-id="sign-up-last-name-input"` |
| Sign-up email field | `data-test-id="sign-up-email-input"` |
| Sign-up password field | `data-test-id="sign-up-password-input"` |
| Sign-up confirm-password field | `data-test-id="sign-up-confirm-password-input"` |
| Sign-up submit | `data-test-id="sign-up-submit-button"` |
| Sign-up success redirect | URL `/successful-registration` |
| Whoami (display name) | Visible text inside `button[data-test-id="main-layout.top-header.account-menu-button"]`. Personal account: single display name (e.g., "John Doe"). B2B single-org: "Org name / Member display name" (e.g., "ACME Store 2 / ACME Store Maintainer"). B2B multi-org: same format — the current active org's name before the `/`. |
| Org switcher (B2B multi-org) | **Inside the account menu popup**, below the "Organizations" label. Current org is a checked radio (e.g., `radio "ACME Store" [checked]`). Other orgs are clickable `button` elements with `accessible name` equal to the org name. Click the target org button → full-context swap fires (cart reloads, many `/graphql` POSTs, but NO new `/connect/token` — same user token works across orgs). Header whoami reflects the new org immediately. |
| Cart page | URL `/cart` |
| Cart line-item remove | Per-row remove/trash icon on `/cart` — probe live |

**Note on attribute name:** the storefront uses `data-test-id` (kebab with dash) in most places. A few legacy spots may use `data-testid` (no dash). The sign-out selector has both forms in the wild; either should work with Playwright locators. Flag any new selector mismatch during live execution — do not guess.

### Sign-up flow (when account needs provisioning)

When `SIGNIN_AS <alias>` fails with 400/401 because the alias's email isn't seeded in the target environment, escalate to manual provisioning — do NOT auto-register from the preflight flow. Provisioning steps (for reference):

1. Navigate to `/sign-up`.
2. Fill First name, Last name, Email (from alias), Password (from alias). Personal-account radio is default.
3. Click `sign-up-submit-button`.
4. Verify redirect to `/successful-registration`.
5. Sign in to confirm credentials work.

Preflight agents must treat sign-up as out-of-scope — the protocol assumes accounts are already seeded. If not, emit `PRECONDITION_UNMET:SIGNIN_FAILED` and let a human or a dedicated seeding script handle provisioning. Password policy: ≥8 chars, digits + lowercase + uppercase + special char + ≥1 unique char.

---

## Primitives

Each primitive is a UI-only sequence. No JS shortcuts unless explicitly noted.

### SIGNOUT

**Purpose:** end the current session.

**Steps:**
1. Detect: is a user currently signed in? If no → skip (idempotent).
2. Click the user name / avatar in the top header — this opens the account-menu popup.
3. Inside the popup, click the **Logout** / **Sign out** button (`data-testid="main-layout.top-header.account-menu.sign-out-button"`).
4. Wait for redirect to `/` or `/sign-in`.
5. Verify: sign-in link is visible in the header (post-condition).

**Never** `browser_navigate('/sign-out')` or `/logout` — those routes don't exist.

### SIGNIN_AS <alias>

**Purpose:** establish a known authenticated session.

**Steps:**
1. Detect: is the target user already signed in? Read whoami; compare against `@td(<alias>.email)`. If match → skip.
2. If a different user is signed in → run `SIGNOUT` first.
3. Navigate to `/sign-in`.
4. Resolve credentials:
   - If the alias entry has `email_env` / `password_env`: read `process.env.<email_env>` and `process.env.<password_env>` from `.env`.
   - Otherwise use `@td(<alias>.email)` / `@td(<alias>.password)` via the standard resolver.
5. Fill the email field with the resolved email.
6. Fill the password field with the resolved password.
7. Click the submit button.
8. Wait for redirect away from `/sign-in` (to `/account/dashboard`, `/`, or a storefront landing page).
9. Verify: account-menu button is visible in the header; whoami matches the target.

**Failure handling:** if sign-in rejects (validation error, 401, "invalid credentials" toast) → capture screenshot, log the rejection, mark the test `BLOCKED` with reason `PRECONDITION_UNMET:SIGNIN_FAILED`.

### SWITCH_ORG <alias>

**Purpose:** select a specific org context for a multi-org B2B user.

**Steps (verified live 2026-04-24):**
1. Detect: is a user signed in? If not → `BLOCKED` (can't switch org when signed out).
2. Detect: is the current org already `@td(<alias>.name)`? Parse whoami text — the part before ` / ` is the current org name. If match → skip.
3. Click the account-menu button (`data-test-id="main-layout.top-header.account-menu-button"`) to open the popup.
4. Inside the popup, under the "Organizations" label, locate a `button` element whose accessible name equals `@td(<alias>.name)`. The currently active org is a `radio [checked]` and is NOT a button — never click the checked radio.
5. Click the target org's button. The account menu closes automatically.
6. Wait for context swap: expect a burst of `/graphql` POSTs (cart, catalog, permissions, user context). No `/connect/token` — the user token is org-agnostic.
7. Verify: re-read whoami; the part before ` / ` must equal `@td(<alias>.name)`.

**Failure handling:** if the org-switcher is absent → the signed-in user is not multi-org. This is a test-data setup error, not a runtime recoverable condition. `BLOCKED` with reason `PRECONDITION_UNMET:USER_NOT_MULTI_ORG`. Do NOT attempt to use a different user — the test case meant what it wrote.

### RESET_CART

**Purpose:** start the case with an empty cart.

**Steps:**
1. Navigate to `/cart`.
2. Detect: is the cart already empty? If yes → skip (idempotent).
3. For each line item: click the remove/trash icon, wait for the row to disappear.
4. Verify: empty-cart state is visible.

**Failure handling:** if a line item refuses to remove after one retry → log warning, proceed to the test. Cart reset is best-effort; do NOT block on it. The test itself will fail on its own assertions if the cart state is wrong for it.

### CLEAR_SESSION

**Purpose:** fully purge the user's session state — cookies, localStorage, sessionStorage. Use at user-context block boundaries (switching between B2B admin and personal user, for instance).

**Steps:**
1. If signed in → `SIGNOUT` first (leaves a clean auth state on the server).
2. Execute `browser_evaluate` to clear client-side storage:
   ```js
   try { localStorage.clear(); } catch (e) {}
   try { sessionStorage.clear(); } catch (e) {}
   ```
3. Clear cookies via the MCP context primitive if available. If not supported on the current MCP server, rely on `SIGNOUT` + storage clear as the best-effort substitute.
4. Navigate to `{{FRONT_URL}}` (home) to confirm a fresh state.
5. Verify: sign-in link visible in header; no user-scoped UI (mini-cart items, account menu) present.

### CLEAR_CACHE

**Purpose:** force the MCP browser to fetch fresh assets. Required when a module hotfix PR has shipped a new artifact (per `feedback_mcp_browser_cache`, Playwright MCP can cache admin SPA bundles up to 4h).

**Steps:**
1. Append a cache-buster query string to the URL (e.g., `?_cb=<timestamp>`) and navigate.
2. Alternative (heavier): `browser_evaluate` with `caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))`.
3. If the agent was spawned with a stale MCP session (started before the hotfix landed), a session-level fix is required — **escalate to the orchestrator** rather than attempting in-session workarounds. The orchestrator can restart the MCP server.

**Failure handling:** if the cached-bundle hash is still visible in loaded assets after the cache-buster navigate → the MCP cache is persistent; `BLOCKED` with reason `PRECONDITION_UNMET:MCP_CACHE_STALE` and notify orchestrator.

### VERIFY_AUTH <alias>

**Purpose:** assertion, not action. Use mid-steps (or in Preconditions) to confirm the session matches the expected user without modifying state.

**Steps:**
1. Read whoami from the account-menu popup or `/account/dashboard`.
2. Compare the displayed email to `@td(<alias>.email)`.
3. If match → continue.
4. If mismatch → `BLOCKED` with reason `PRECONDITION_UNMET:WRONG_USER` and the actual vs expected emails in the log. Do NOT auto-recover by swapping users — the test case asserted a state, and the state was wrong.

---

## Resolution Protocol (Decision Tree)

When a Precondition says `authenticated as @td(X)`:

1. Detect current auth state.
2. If logged out → `SIGNIN_AS X`.
3. If logged in as X → verify org, proceed.
4. If logged in as someone else → `SIGNOUT` → `SIGNIN_AS X`.
5. If logged in as X but wrong org → `SWITCH_ORG <target>` (only if X is multi-org; otherwise this is a data-setup error — `BLOCKED`, do not improvise).
6. If cart state matters → `RESET_CART` before executing the case Steps.

All primitives are idempotent: the agent checks state first and skips the action when the required state is already met. This keeps the decision tree cheap between adjacent cases that share context.

---

## Canonical Tag Order

When multiple `[PRE:*]` tags appear on a single case, the runner executes them in this order:

```
[PRE:CLEAR_SESSION]
[PRE:SIGNOUT]
[PRE:SIGNIN_AS:<alias>]
[PRE:SWITCH_ORG:<alias>]
[PRE:RESET_CART]
[PRE:CLEAR_CACHE]
[PRE:VERIFY_AUTH:<alias>]
```

Rationale:
- `CLEAR_SESSION` is the hammer — run it first if it's listed.
- `SIGNOUT` is a subset of CLEAR_SESSION; if both are listed, CLEAR_SESSION handles the sign-out implicitly.
- Authentication (`SIGNIN_AS`) must precede org-scoped setup (`SWITCH_ORG`) and cart-scoped setup (`RESET_CART`).
- `CLEAR_CACHE` comes after auth + cart so the cached bundle check happens under the right user/cart context.
- `VERIFY_AUTH` is always last — it's the assertion that the preflight succeeded.

---

## Error Handling

| Primitive | Failure | Runner action |
|-----------|---------|---------------|
| `SIGNOUT` | Account-menu doesn't open, logout button not found | `BLOCKED:PRECONDITION_UNMET:SIGNOUT_FAILED` |
| `SIGNIN_AS` | Sign-in form rejects credentials / validation error | `BLOCKED:PRECONDITION_UNMET:SIGNIN_FAILED` |
| `SWITCH_ORG` | Org-switcher absent (user not multi-org) | `BLOCKED:PRECONDITION_UNMET:USER_NOT_MULTI_ORG` |
| `SWITCH_ORG` | Target org not in dropdown | `BLOCKED:PRECONDITION_UNMET:ORG_NOT_AVAILABLE` |
| `RESET_CART` | Line item won't remove after retry | Log warning, proceed (best-effort) |
| `CLEAR_SESSION` | Cookies/storage clear throws | Log warning, proceed if SIGNOUT succeeded; else `BLOCKED` |
| `CLEAR_CACHE` | Cached bundle hash persists | `BLOCKED:PRECONDITION_UNMET:MCP_CACHE_STALE` + escalate to orchestrator |
| `VERIFY_AUTH` | Whoami mismatch | `BLOCKED:PRECONDITION_UNMET:WRONG_USER` |

On any `BLOCKED`:
1. Capture a `browser_take_screenshot` of the current state.
2. Log the failure reason in the test case result JSON (`statusReason`, `evidence.screenshot`).
3. Do NOT silently continue. Do NOT attempt to "fix" the test data by improvising.
4. Move to the next test case; the orchestrator aggregates blocked counts.

---

## Examples

### Example 1 — B2B admin test case (TechFlow org)

**Preconditions cell:**
```
[PRE:CLEAR_SESSION]
[PRE:SIGNIN_AS:TECHFLOW_ADMIN]
[PRE:RESET_CART]
1. Org TechFlow has ≥2 active addresses across ≥2 countries (US, CA, GB).
2. Cart shipping section is visible.
```

**Runner trace:**
1. `CLEAR_SESSION` — sign out existing user, clear storage, navigate to home. Confirms logged-out state.
2. `SIGNIN_AS:TECHFLOW_ADMIN` — resolve `@td(TECHFLOW_ADMIN.email)` via aliases.json → read row from `test-data/b2b/users.csv` matching USR-006 → fill sign-in form → submit → verify redirect and whoami = TECHFLOW_ADMIN email.
3. `RESET_CART` — navigate `/cart` → remove all line items → verify empty.
4. Plain-text check 1 — count org addresses via API or visible list; if < 2 → `BLOCKED` with data reason.
5. Plain-text check 2 — add items back (case-specific) → proceed to Steps.

### Example 2 — Personal user test case (no org)

**Preconditions cell:**
```
[PRE:CLEAR_SESSION]
[PRE:SIGNIN_AS:USER2]
[PRE:RESET_CART]
1. USER2 has exactly 1 saved address (Albania, null regionId).
```

**Runner trace:**
1. `CLEAR_SESSION` — ensures no leftover B2B org context.
2. `SIGNIN_AS:USER2` — resolve USER2 alias → read `USER2_EMAIL`/`USER2_PASSWORD` from `.env` (alias has `email_env`/`password_env` references, not literal values). Sign in, verify whoami.
3. `RESET_CART` — empty the personal cart.
4. Plain-text check 1 — visit `/account/addresses`, confirm 1 address visible with Albania country.
5. Proceed to Steps.

### Example 3 — Multi-org user switching between orgs

**Preconditions cell:**
```
[PRE:SIGNIN_AS:USER_MULTI_ORG]
[PRE:SWITCH_ORG:ORG_TECHFLOW]
[PRE:VERIFY_AUTH:USER_MULTI_ORG]
```

**Runner trace:**
1. `SIGNIN_AS:USER_MULTI_ORG` — if already signed in as this user, skip. Otherwise sign in.
2. `SWITCH_ORG:ORG_TECHFLOW` — click header org-switcher, select "TechFlow" from dropdown, wait for reload, verify org name displayed.
3. `VERIFY_AUTH:USER_MULTI_ORG` — whoami must still be USER_MULTI_ORG after the org switch (should be — org switch doesn't change user identity).
4. Proceed to Steps.

---

## Future Work

Future primitives proposed but not yet authored (flagged for roadmap):
- `[PRE:ADD_PRODUCTS:<count>]` — add N products to cart programmatically via the catalog → PDP → add-to-cart flow. Parameterization to choose product source (alias, search term, category).
- `[PRE:SET_SHIPPING_ADDRESS:<alias>]` — set a specific shipping address on the current cart via the cart's address popup. Useful for downstream checkout tests.
- `[PRE:SET_PAYMENT_METHOD:<type>]` — pre-select a payment method tile.
- `[PRE:SEED_ORDER:<status>]` — create an order in a specific status (Pending / Shipped / Completed) via admin API before the storefront test starts — used for post-order UX tests.

Do not use these tags in CSVs yet — they have no runner support. Until then, encode such requirements as plain-text preconditions and accept that the runner may skip or mark `BLOCKED`.

---

## Cross-References

- `.claude/agents/knowledge/test-runner-tags.md` — `[PRE:*]` quick reference and failure-policy summary
- `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` — Preconditions column spec and when to use `[PRE:*]`
- `.claude/agents/qa/test-runner-agent.md` — Phase 2 step 2 triggers this protocol
- `.claude/agents/qa/autonomous-test-runner.md` — Phase 2 step 2 triggers this protocol
- Project memory:
  - `feedback_agents_read_env_creds` — credentials are read from `.env` at runtime
  - `feedback_real_user_interaction` — UI actions only, no JS shortcuts
  - `feedback_no_signout_page` — sign-out is an action, not a route
  - `feedback_mcp_browser_cache` — MCP cache `CLEAR_CACHE` rationale
  - `user_test_accounts` — which passwords belong to which users
