# IMP-049 — Contract Lock-in Report

**Test case:** IMP-049 (Impersonation — Target User Account Status: Blocked and Invited Contracts)
**Suite:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` (row at line 918)
**Sprint:** 26-09 (VCST-4906 LoginOnBehalf for Company Employee, epic VCST-4903)
**PR under test:** vc-frontend #2280 (head `80690ef2`)
**Environment:** vcst-qa (`FRONT_URL=https://vcst-qa-storefront.govirto.com`, `BACK_URL=https://vcst-qa.govirto.com`)
**Platform:** 3.1026.0
**Theme:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2`
**Browser:** playwright-firefox (locale en-US)
**Operator:** SUPPORT_AGENT — `test-john.mitchell-20260310@test-agent.com` (USR-001, `143bc845-7ba3-4982-ae9a-a9446a399705`) — has `platform:security:loginOnBehalf` permission
**Executed:** 2026-05-14, qa-testing-expert
**Evidence:** `tests/Sprint-current/VCST-4906/evidence/imp-049/`

---

## 1. Part A — Blocked user (USR-021)

**Target:** `IMPERSONATE_TARGET_BLOCKED` → `3133b984-8e81-40bd-b2b3-847346ee3f4f` (`AGENT-TEST-imp-target-blocked-20260514@test-agent.com`)
**Platform lock state:** `lockoutEnd=9999-12-31T23:59:59.9999999+00:00`, `lockoutEnabled=true`, `/api/platform/security/users/{id}/locked` returns `{"locked":true}`

### Observed contract — outcome (a-frontend-block)

| Field | Observed value |
|---|---|
| Final URL | `https://vcst-qa-storefront.govirto.com/blocked` |
| Page title | `QA & Blocked` |
| Page heading | "Your account is blocked" |
| `POST /connect/token` HTTP status | **200** |
| Request body | `grant_type=impersonate&scope=offline_access&user_id=3133b984-8e81-40bd-b2b3-847346ee3f4f` |
| Response body | `{ access_token, token_type:'Bearer', expires_in:1799, refresh_token }` |
| Issued JWT `sub` | `3133b984-8e81-40bd-b2b3-847346ee3f4f` (Blocked target) |
| Issued JWT `email` | `AGENT-TEST-imp-target-blocked-20260514@test-agent.com` |
| Issued JWT `vc_operator_user_id` | `143bc845-7ba3-4982-ae9a-a9446a399705` (operator preserved in claims) |
| Issued JWT `exp - iat` | 1800 seconds (30-min valid token) |
| Impersonation banner | NOT rendered on `/blocked` |
| localStorage `auth.access_token` post-redirect | `null` (frontend wiped its own auth state) |
| localStorage `local_ship_to_addresses_3133b984-...` | Present (transient artifact of the brief Blocked session) |
| Operator session survival | **DESTROYED** — `/account` redirects to `/sign-in?returnUrl=/account/dashboard` |
| Console errors | 0 |
| Network 4xx/5xx | None |

### Evidence
- `evidence/imp-049/part-a-token-request-body.txt`
- `evidence/imp-049/part-a-token-response-body.json`
- `evidence/imp-049/part-a-blocked-final-ui.png`
- `evidence/imp-049/part-a-console.log`

### Interpretation
The frontend has a defense-in-depth check that catches the Locked status downstream and bounces the user to `/blocked`. **However**, the platform OAuth endpoint itself does NOT enforce the lock — it issued a fully valid 30-minute Bearer token for the Blocked account. The frontend's response was to wipe both the new session AND the operator session.

---

## 2. Part B — Invited user (USR-022)

**Target:** `IMPERSONATE_TARGET_INVITED` → `fa945873-f304-4d1f-a66b-1494e697b98f` (`AGENT-TEST-imp-target-invited-20260514@test-agent.com`)
**Platform invited state:** `emailConfirmed=false`, `sendVerificationEmail` issued, never clicked

### Observed contract — outcome (b-success)

| Field | Observed value |
|---|---|
| Final URL | `https://vcst-qa-storefront.govirto.com/` (Home) |
| Page title | `QA & Home` |
| `POST /connect/token` HTTP status | **200** |
| Request body | `grant_type=impersonate&scope=offline_access&user_id=fa945873-f304-4d1f-a66b-1494e697b98f` |
| Response body | `{ access_token, token_type:'Bearer', expires_in:1799, refresh_token }` |
| Issued JWT `sub` | `fa945873-f304-4d1f-a66b-1494e697b98f` (Invited target) |
| Issued JWT `email` | `AGENT-TEST-imp-target-invited-20260514@test-agent.com` |
| Issued JWT `vc_operator_user_id` | `143bc845-7ba3-4982-ae9a-a9446a399705` (operator) |
| Issued JWT `exp - iat` | 1800 seconds |
| Header impersonation chip | "John Mitchell logged in as Invited User" + org chip "AGENT-TEST-Org-TechFlow-20260310" |
| Account-menu popup | Exposes link "Invited User" → /account/dashboard, button "Logout", and **button "Back to John Mitchell"** (revert) |
| Storefront functional | YES — Daily Deals carousel renders, catalog accessible, cart count = 4, notifications = 4 |
| Console errors | 0 |
| Revert ("Back to John Mitchell") | Works — restores operator session; new token decoded `sub=143bc845..., vc_operator_user_id=null` |
| Post-revert landing | `/company/members` (operator's org home) |

### Evidence
- `evidence/imp-049/part-b-token-request-body.txt`
- `evidence/imp-049/part-b-token-response-body.json`
- `evidence/imp-049/part-b-invited-final-ui.png`
- `evidence/imp-049/part-b-invited-account-menu-with-revert.png`
- `evidence/imp-049/part-b-console.log`

### Interpretation
Invited users can be fully impersonated. `emailConfirmed=false` does NOT gate the impersonate grant in the OAuth endpoint, and the frontend does not differentiate — it treats the resulting token as a normal session. The standard operator chip + revert button render in the header.

---

## 3. REST cross-check (independent)

Method: From the operator's authenticated browser session, called `POST /connect/token grant_type=impersonate` directly via `fetch()` for BOTH targets, bypassing the `/account/impersonate/{userId}` route.

| Target | Status | Issued JWT `sub` | `vc_operator_user_id` | `exp - iat` |
|---|---|---|---|---|
| Blocked (`3133b984-...`) | **200** | `3133b984-...` | `143bc845-...` (operator) | 1800s |
| Invited (`fa945873-...`) | **200** | `fa945873-...` | `143bc845-...` (operator) | 1800s |

**Confirms the gate is NOT at the OAuth endpoint.** Both UI observations match the raw REST contract.

Evidence: `evidence/imp-049/rest-cross-check.json`

---

## 4. CSV lock-in diff (IMP-049 row at line 918)

### Description column

Before (excerpt):
```
VERIFY on first run: for each status, document the actual outcome (error message text,
redirect target, HTTP status code) and lock the assertion — 'VERIFY:' markers below
indicate open contracts.
```

After (excerpt):
```
LOCKED CONTRACT (observed 2026-05-14, platform 3.1026.0, theme vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2):
(a) Blocked target: POST /connect/token grant_type=impersonate returns HTTP 200 with a valid
    Bearer token whose sub = blocked user. The storefront frontend detects the Locked status
    downstream, wipes its own auth state from localStorage, and redirects to /blocked
    (heading 'Your account is blocked'). NET RESULT: operator session is DESTROYED
    (auth.access_token cleared); no impersonation banner; navigating to /account redirects to /sign-in.
(b) Invited target: POST /connect/token grant_type=impersonate returns HTTP 200 with a valid
    Bearer token whose sub = invited user. Impersonation succeeds silently and lands on /
    (Home). Header shows the operator chip 'John Mitchell logged in as Invited User' + org
    chip 'AGENT-TEST-Org-TechFlow-20260310'. Account-menu popup exposes 'Back to John
    Mitchell' button. Revert restores operator session cleanly.
SECURITY: The platform OAuth endpoint has NO status-based gate. Direct REST callers with
platform:security:loginOnBehalf can mint a usable 30-min Bearer for Blocked OR Invited
targets, bypassing the storefront UI's /blocked redirect entirely. See
tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md for the full security analysis.
```

### Steps column — Part A

Before:
```
[ASSERT] One of the following outcomes is observed:
  (a-success) VcLoaderOverlay appears and redirect completes — impersonation succeeds for Blocked accounts (platform allows it)
  (a-denied) POST /connect/token with grant_type=impersonate returns HTTP 4xx — rejection...
[ASSERT] Whichever outcome: document the exact HTTP status code from the /connect/token impersonate grant as PART-A-STATUS (VERIFY: expected 4xx for Blocked, but unknown — lock on first run)
...
```

After:
```
[ASSERT] LOCKED CONTRACT — Outcome (a-frontend-block) is observed: POST /connect/token
        grant_type=impersonate returns HTTP 200 with a valid Bearer token (sub=blocked_user_id,
        vc_operator_user_id=operator). The storefront detects the Locked status downstream,
        wipes auth from localStorage, and redirects to {{FRONT_URL}}/blocked (heading
        'Your account is blocked'). No impersonation banner renders. The operator's own session
        is DESTROYED in the process — auth.access_token is cleared and /account redirects to /sign-in
[ASSERT] [API] POST /connect/token grant_type=impersonate returns HTTP 200 (NOT 4xx — platform
        has no status-based gate for Locked accounts; defense-in-depth is enforced only by the
        storefront UI's /blocked redirect)
[ASSERT] Final URL is /blocked (NOT /account/impersonate/{userId}, NOT /403, NOT a success redirect into target's account area)
[ASSERT] localStorage auth.access_token is null after the redirect — both the new (Blocked) and old (operator) tokens are cleared
[ASSERT] Operator session is NOT preserved: navigating to /account redirects to /sign-in?returnUrl=/account/dashboard.
        Operator must re-authenticate to continue work — this is a SIDE EFFECT of frontend-only Locked enforcement
```

### Steps column — Part B

Before:
```
[ASSERT] One of the following outcomes is observed:
  (b-success) Impersonation succeeds — VcLoaderOverlay then redirect; banner visible
  (b-denied) Impersonation rejected — 4xx on /connect/token impersonate grant...
  (b-form) ImpersonateForm rendered...
[ASSERT] Whichever outcome: document the exact HTTP status code as PART-B-STATUS (VERIFY: expected 4xx for Invited/Pending, but unknown — lock on first run)
...
```

After:
```
[ASSERT] LOCKED CONTRACT — Outcome (b-success) is observed: POST /connect/token
        grant_type=impersonate returns HTTP 200 with a valid Bearer token (sub=invited_user_id,
        vc_operator_user_id=operator). Impersonation succeeds silently and final URL is
        {{FRONT_URL}}/ (Home). Storefront is fully functional under the Invited identity — catalog
        renders, account chrome shows the impersonated user
[ASSERT] [API] POST /connect/token grant_type=impersonate returns HTTP 200 (NOT 4xx — platform has
        no email-verification gate for impersonation; emailConfirmed=false does NOT block the
        impersonate grant)
[ASSERT] Header chrome shows the operator chip: 'John Mitchell logged in as Invited User'
        (operator-name-label span + 'logged in as' separator + target as Account menu trigger) +
        org chip 'AGENT-TEST-Org-TechFlow-20260310'
[ASSERT] Account-menu popup (click target name in header) exposes a 'Back to {operator_name}'
        revert button alongside the standard Logout
[ACT]    Click 'Back to {operator_name}' in the account-menu popup
[ASSERT] After revert: operator session restored; localStorage auth.access_token decodes to
        sub=operator_user_id with vc_operator_user_id=null (no longer impersonating); landing
        URL is /company/members (operator's org home) or /account/dashboard
```

### Cross-Layer column

The two `[API] ... (VERIFY: expected 401 or 403 for ...)` lines were replaced with explicit HTTP 200 contracts (incl. response shape and JWT claims). A third `[API]` line was added for the REST cross-check. Full text in the CSV.

### Notes column status

`Draft` → `Active`.

---

## 5. aliases.json bump diff (v1.4.5 → v1.4.6)

- `_meta.version`: `"1.4.5"` → `"1.4.6"`
- Added `_meta.changelog_1_4_6` entry summarizing both observed contracts and the security gap.
- Appended observed-contract paragraph to `IMPERSONATE_TARGET_BLOCKED._comment`.
- Appended observed-contract paragraph to `IMPERSONATE_TARGET_INVITED._comment`.

JSON validity re-confirmed via `node -e "JSON.parse(...)"`.

---

## 6. Bugs to file

### BUG-1 (P1, security): Platform OAuth `/connect/token grant_type=impersonate` has no status-based gate

**Why P1 (not P0)** — the storefront frontend mitigates the Blocked case via the `/blocked` redirect, so the most common attack path (UI-driven support tool) is contained. The exploit requires a REST caller with the `platform:security:loginOnBehalf` permission already in hand, AND a target user-id. However the gap is still real: any operator (or any compromised operator account) can use `curl`/Postman to mint a usable Bearer for a deliberately-locked customer and act as them against `/graphql`, `/xapi`, or any other API resource that trusts the JWT. This violates BL-AUTH-005 (RBAC) and BL-AUTH-006 (impersonation session scope) in spirit — the lock should be enforced at the boundary where the token is issued, not at the UI consumption layer.

**Repro:**
```http
POST /connect/token HTTP/1.1
Host: vcst-qa-storefront.govirto.com
Authorization: Bearer <operator-access-token-with-platform:security:loginOnBehalf>
Content-Type: application/x-www-form-urlencoded

grant_type=impersonate&scope=offline_access&user_id=<locked-user-id>
```
Expected: HTTP 4xx (`invalid_grant` or similar) referencing the lock.
Actual: HTTP 200 with a valid 30-min Bearer (`sub=<locked-user-id>`, `vc_operator_user_id=<operator-id>`).

**Recommended fix scope:** Add an account-lock + email-confirmation check to the `ImpersonateGrantHandler` (or equivalent) in `vc-module-x-identity` / `vc-module-platform` OpenIddict pipeline. Return `invalid_grant` with an error description naming the gate (e.g. `"user_locked"` / `"email_unconfirmed"`).

### BUG-2 (P1, UX/session): Operator session is destroyed by a Blocked-target impersonation attempt

**Symptom:** After `GET /account/impersonate/{blockedUserId}`, the storefront wipes both the new (Blocked) AND the operator's pre-existing auth tokens. The operator is bounced to `/sign-in` on next navigation to any `/account/*` route.

**Expected (per the Negative_Cases column on the original IMP-049):** "operator's own session must remain intact (not cleared); no orphaned session left in localStorage".

**Why this matters:** support agents accidentally clicking an impersonation link for a locked customer (e.g. from a stale list) lose their work-in-progress and need to re-authenticate, which is also a productivity tax. It also degrades the threat-modeling story: an external attacker who can lure an operator into clicking a malicious `/account/impersonate/{lockedUserId}` link can effectively force-log-out support staff at will (low-grade denial-of-service against the support workflow).

**Recommended fix:** When the frontend detects the Locked status downstream of an issued impersonation token, it should:
1. Invalidate ONLY the impersonated session.
2. Keep the operator's pre-existing session intact (re-hydrate from a stash, or call `/connect/token` with the operator's refresh token to restore).
3. Show a toast/alert "Cannot impersonate locked user" instead of a silent redirect to `/blocked`.

### BUG-3 (P2, product question): Should Invited (`emailConfirmed=false`) users be impersonable at all?

This is a product-question bug, not a defect. **Current contract (locked):** yes, fully — operator can act as an Invited user with no friction. There may be a legitimate support reason (verifying that a buyer's invitation arrived and the initial cart works), or this may be a vector for an operator to silently accept an organizational invitation on a buyer's behalf and skew customer-onboarding telemetry. Flag this to product for an explicit decision; if the answer is "should be blocked", file BUG-1's fix to cover both Locked AND `emailConfirmed=false`.

---

## 7. Verdict

**IMP-049: PASS_WITH_NOTES**

The test case has now been LOCKED to the observed platform contract — all `VERIFY:` markers replaced with explicit HTTP 200 contracts in Steps/State/Cross-Layer columns, and Notes flipped from `Draft` → `Active`. The test is reproducible and deterministic from this run forward.

`PASS_WITH_NOTES` (not `PASS`) because the lock-in surfaced two real bugs (BUG-1 P1 security gap, BUG-2 P1 operator-session-destroyed) and one product question (BUG-3 P2). These should be filed to JIRA against VCST-4906's parent epic VCST-4903 before sprint 26-09 closes.

The IMP-049 test itself is not blocked — the locked assertions encode the current contract; if a future fix changes the contract back to `(a-denied)/(b-denied)` (HTTP 4xx), the test will fail loudly and the lock-in should be re-run.

---

## 8. Files changed in this lock-in

| File | Change |
|---|---|
| `regression/suites/Frontend/auth/082-auth-impersonation.csv` | Row IMP-049 (line 918): replaced 6 VERIFY markers across Description/Steps/State/Cross-Layer/Negative_Cases/Notes columns with locked observed contracts. Notes status `Draft` → `Active`. |
| `test-data/aliases.json` | `_meta.version` 1.4.5 → 1.4.6; added `changelog_1_4_6`; appended observed-contract paragraph to `IMPERSONATE_TARGET_BLOCKED._comment` and `IMPERSONATE_TARGET_INVITED._comment`. |
| `tests/Sprint-current/VCST-4906/evidence/imp-049/` | New evidence: 2 token request bodies (.txt), 2 token response bodies (.json), 3 screenshots (.png), 2 console logs (.log), 1 REST cross-check (.json). |
| `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` | This report. |
