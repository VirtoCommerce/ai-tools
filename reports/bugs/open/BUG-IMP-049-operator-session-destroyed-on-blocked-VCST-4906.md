# BUG: Operator Session Destroyed by Attempted Blocked-Target Impersonation (IMP-049-BUG-2)

## Status: READY_TO_SUBMIT

**Severity:** High (P1)
**Priority:** P1
**Component:** Storefront / Auth / Impersonation (vc-frontend `useImpersonate`)
**Browser:** Firefox (playwright-firefox; Mozilla/5.0 Gecko, Playwright 1.60)
**Environment:** `https://vcst-qa-storefront.govirto.com` (vcst-qa)
**Platform Version:** 3.1026.0
**Theme Version:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280 — VCST-4906 feature build)
**Date:** 2026-05-14
**Reported By:** QA (qa-testing-expert, via Playwright Firefox MCP)
**Suite / Case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` / IMP-049 (Part A — Blocked target)
**Related JIRA:** child of [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906)
**Related Bug:** IMP-049-BUG-1 (qa-backend-expert) — Platform OAuth `/connect/token grant_type=impersonate` has no Locked/EmailUnconfirmed gate; this frontend bug is the downstream consequence

---

## Summary

When the operator (Support Agent with `StorefrontPermissions.CanImpersonate`) accidentally or deliberately follows an impersonation link for a **Locked** target user, the storefront frontend correctly detects the lock downstream and redirects to `/blocked` — **but in the process it destroys the operator's own session**, replacing `localStorage.auth` with an empty shell `{access_token:null, refresh_token:null, expires_at:null, token_type:"Bearer"}`. The operator is then bounced to `/sign-in?returnUrl=/account/dashboard` on any subsequent navigation into `/account/*` and must re-authenticate from scratch.

This violates the Negative_Cases contract recorded on IMP-049 of suite 082-auth-impersonation.csv: *"operator's own session must remain intact (not cleared); no orphaned session left in localStorage"*. The bug is fully reproducible and deterministic on this build.

---

## Steps to Reproduce

1. Sign in to storefront `{FRONT_URL}/sign-in` as `SUPPORT_AGENT` (USR-001 `test-john.mitchell-20260310@test-agent.com`, role includes `StorefrontPermissions.CanImpersonate`). Password from `test-data/b2b/users.csv` (column `password`).
2. Open Firefox DevTools → Application → Local Storage → `https://vcst-qa-storefront.govirto.com` → copy the `auth` entry. Decode its `access_token` JWT payload; confirm `sub` = operator GUID (`143bc845-7ba3-4982-ae9a-a9446a399705`), `vc_operator_user_id` is absent or null, `exp − iat = 1800` (30-min TTL).
3. Verify the operator can navigate to `/account/dashboard` and stays signed in.
4. In the same tab, navigate directly to:
   `{FRONT_URL}/account/impersonate/3133b984-8e81-40bd-b2b3-847346ee3f4f`
   (`IMPERSONATE_TARGET_BLOCKED` = USR-021 `AGENT-TEST-imp-target-blocked-20260514@test-agent.com`, platform-level Locked: `lockoutEnd=9999-12-31T23:59:59.9999999+00:00`, `lockoutEnabled=true`).
5. Wait ~3 s for the storefront to detect the Locked status downstream and redirect to `/blocked` (page heading "Your account is blocked", page title "QA & Blocked").
6. Re-inspect `localStorage.auth`.

### Expected (per IMP-049 Negative_Cases contract)

`localStorage.auth.access_token` continues to decode to the operator's `sub` (`143bc845-...`) with the same `exp` (30-min TTL). Navigating to `/account/dashboard` still loads the operator's dashboard. A toast/notification informs the operator that the target is locked; no operator-side session impact.

### Actual

`localStorage.auth` becomes exactly:
```json
{"expires_at":null,"token_type":"Bearer","access_token":null,"refresh_token":null}
```
The operator's tokens are gone. Navigating to `{FRONT_URL}/account` redirects to `{FRONT_URL}/sign-in?returnUrl=/account/dashboard`. The operator must re-enter email + password to recover. Any unsaved work in other tabs (cart, draft, list) is broken because the cross-tab broadcast in `requestImpersonateToken` also fires `reloadAndOpenMainPage` to `TabsType.OTHERS`.

---

## Evidence

All artifacts under `tests/Sprint-current/VCST-4906/evidence/bug-verification-frontend/`:

| File | Content |
|------|---------|
| `bug1-01-operator-home-pre.png` | Operator signed in at `/`, post-login state |
| `bug1-pre-localStorage.json` | Pre-impersonation JWT decode: `sub=143bc845-...`, `iat=1778779923`, `exp=1778781723`, TTL 1800s |
| `bug1-02-blocked-page.png` | `/blocked` page with heading "Your account is blocked" (full page) |
| `bug1-post-localStorage.json` | Post-redirect raw `auth` payload — all token fields `null` |
| `bug1-03-account-redirects-signin.png` | `/account` → `/sign-in?returnUrl=/account/dashboard` evidence |
| `bug1-console.log` | Firefox console (0 errors, 4 warnings — none related; impersonation flow runs silently) |
| `bug1-network.txt` | Network requests over the flow (HAR-equivalent) |

**Prior corroborating evidence** (from IMP-049 lock-in run, same build): `tests/Sprint-current/VCST-4906/evidence/imp-049/part-a-token-request-body.txt`, `part-a-token-response-body.json`, `part-a-blocked-final-ui.png`, `part-a-console.log` — showing `POST /connect/token grant_type=impersonate user_id=3133b984-…` returned HTTP 200 with a valid 30-min Bearer for the Blocked sub before the frontend wiped it.

**Console errors:** 0 (the operator-wipe is silent; there is no user-facing notification).
**Network 4xx/5xx during the flow:** none — `POST /connect/token` succeeded with HTTP 200; `/blocked` is a SPA route load.

---

## Layer Validation

| Layer | Result | Notes |
|---|---|---|
| 1. Storefront (vc-frontend) | **FAIL — owning layer** | `revertImpersonate("")` is called through the `/blocked` redirect flow without first stashing or re-hydrating the operator's pre-impersonation tokens. `requestImpersonateToken` only writes `setAccessToken/setExpiresAt/setTokenType/setRefreshToken` on the success branch; the failure/Locked branch clears them via downstream auth interceptors. |
| 2. Admin SPA | **N/A** | Admin SPA is not involved; the operator is on the storefront. |
| 3. GraphQL xAPI | **N/A** | No GraphQL call participates in the Locked detection path; the resolution happens at the storefront router/auth guard layer. |
| 4. Platform REST | **N/A for this bug** | The OAuth endpoint itself does issue a valid token (see IMP-049-BUG-1, qa-backend-expert). That is a *separate* security gap; here we are isolating the frontend-only consequence. |

---

## Root Cause Analysis

### Source code — vc-frontend (PR #2280, branch `feat/VCST-4906-login-on-behalf`, head `80690ef26c55eeec8655af5de7f3dbd1e694409b`)

File: [`client-app/shared/account/composables/useImpersonate.ts`](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4906-login-on-behalf/client-app/shared/account/composables/useImpersonate.ts) (blob sha `413bf48070e2afe5600a76551bf11b709efabb2c`)

Key function (extracted verbatim from the PR head):

```typescript
async function requestImpersonateToken(userId: string, redirectTo: string = "/"): Promise<void> {
  step.value = "impersonate";
  try {
    const { error, data } = await useFetch("/connect/token")
      .post(
        new URLSearchParams({
          grant_type: "impersonate",
          scope: "offline_access",
          user_id: userId,
        }),
        "application/x-www-form-urlencoded",
      )
      .json<ConnectTokenResponseType>();

    if (!data.value || error.value) {
      errors.value = [{ code: "impersonate_failed" }];
      step.value = "idle";
      return;   // <-- BUG: operator token is NOT restored here
    }

    const { access_token, token_type, expires_in, refresh_token, error: tokenError, errors: tokenErrors } = data.value;

    if (access_token && token_type && expires_in && refresh_token) {
      setAccessToken(access_token);
      setExpiresAt(expires_in);
      setTokenType(token_type);
      setRefreshToken(refresh_token);
      step.value = "success";
      setTimeout(() => {
        void broadcast.emit(reloadAndOpenMainPage, null, TabsType.OTHERS);
        location.href = redirectTo;
      }, 1000);
    } else {
      notifications.error({ text: t("pages.account.impersonate.error") });
      Logger.error(requestImpersonateToken.name, tokenError, tokenErrors);
      errors.value = [{ code: "impersonate_failed" }];
      step.value = "idle";
      return;   // <-- BUG: same problem
    }
  } catch (e) {
    notifications.error({ text: t("pages.account.impersonate.error") });
    Logger.error(requestImpersonateToken.name, e);
    errors.value = [{ code: "impersonate_failed" }];
    step.value = "idle";
    // <-- BUG: same problem
  }
}
```

For the Locked case, the OAuth endpoint actually returns HTTP 200 with a valid impersonation token (the gate is at the frontend router, not the API — see IMP-049-BUG-1). The token is therefore written via `setAccessToken(access_token)` etc. — successfully replacing the operator's token in `localStorage`. Then a downstream router/auth guard detects the Locked status (likely from a `/me`/`currentUser` probe) and redirects to `/blocked`; somewhere along that redirect path, the auth state is cleared (the unauthorizedErrorEvent or similar), producing the empty shell observed in `localStorage`.

There is **no equivalent of a "stash operator token, restore on failure" sequence** in `useImpersonate.ts`. The function never reads or preserves the pre-impersonation token, so by the time `/blocked` fires, the operator's tokens are already overwritten or in the middle of being cleared.

### Why PR #2280 surfaces this

PR #2280 is the introduction of the operator-facing "Login on behalf" flow with a `revertImpersonate`/`backToOperator` round-trip. The composable was refactored from a simpler "verify-then-impersonate" pattern to the new model where impersonation can be invoked from the company-members page on an already-authenticated operator. The Locked redirect path was not exercised in the pre-PR-2280 design (it required an explicit security-form submission per impersonation attempt, where rejection happened before the token swap), so the regression is genuinely new to this PR.

### Files in PR #2280 that touch this behavior

`get_pull_request_files` for VirtoCommerce/vc-frontend PR #2280 returns 19 files; the ones relevant to this bug are:

| Path | Relevance |
|------|-----------|
| `client-app/shared/account/composables/useImpersonate.ts` | **Root** — `requestImpersonateToken`, `revertImpersonate`, `backToOperator` |
| `client-app/shared/account/composables/useImpersonate.test.ts` | Existing unit tests do not assert the "operator session survives a Locked target" contract |
| `client-app/pages/company/members.vue` | Triggers `openLoginOnBehalfModal` → router.push `Impersonate` |
| `client-app/shared/layout/components/header/_internal/top-header.vue` | Renders operator chip + `back-to-operator-row` |
| `client-app/shared/layout/components/header/_internal/mobile-menu/menus/main-menu.vue` | Mobile equivalent |
| `client-app/ui-kit/components/molecules/loader-overlay/vc-loader-overlay.vue` | Slot extension used by the loader overlay during the flow |

(The remaining files in PR #2280 are i18n locale JSONs — not relevant to this bug.)

---

## Suggested Fix

Make `useImpersonate.ts::requestImpersonateToken` resilient to downstream failure by either:

**Option A — Stash + restore (recommended):**

```typescript
async function requestImpersonateToken(userId: string, redirectTo: string = "/"): Promise<void> {
  step.value = "impersonate";

  // STASH the operator's current tokens BEFORE the request — only when starting impersonation (userId !== "")
  const stash = userId
    ? {
        access_token: getAccessToken(),
        refresh_token: getRefreshToken(),
        expires_at: getExpiresAt(),
        token_type: getTokenType(),
      }
    : null;

  try {
    const { error, data } = await useFetch("/connect/token") /* ...as before... */;
    if (!data.value || error.value) {
      errors.value = [{ code: "impersonate_failed" }];
      step.value = "idle";
      if (stash) restoreTokens(stash);   // <-- new
      return;
    }
    /* ...success path unchanged... */
  } catch (e) {
    notifications.error({ text: t("pages.account.impersonate.error") });
    Logger.error(requestImpersonateToken.name, e);
    errors.value = [{ code: "impersonate_failed" }];
    step.value = "idle";
    if (stash) restoreTokens(stash);   // <-- new
  }
}
```

Additionally, register a router beforeEach (or extend the existing `/blocked` route handler) so that when the storefront detects a Locked impersonation target, it restores the stashed operator session AND shows a toast `"Cannot impersonate locked user — your session is intact"`. The current silent redirect to `/blocked` confuses the operator and degrades support workflow.

**Option B — Defense-in-depth at the API (preferred long-term, blocks IMP-049-BUG-1):**

If the platform OAuth endpoint rejects impersonation grants for Locked targets with HTTP 4xx (per IMP-049-BUG-1's recommended fix), the impersonation token is never issued and `setAccessToken` is never called — the operator's token is therefore never overwritten. Option A is still recommended as defense-in-depth in case the platform check ever regresses.

---

## Acceptance Criteria for Fix Verification

When the fix ships, re-run IMP-049 Part A:

- [ ] After `GET /account/impersonate/{lockedUserId}` and the `/blocked` redirect, `localStorage.auth.access_token` decodes to operator `sub` (not null, not target's sub).
- [ ] Operator can navigate to `/account/dashboard` without re-authentication.
- [ ] A user-visible toast or banner informs the operator the target is locked.
- [ ] Cross-tab `reloadAndOpenMainPage` broadcast (current) does NOT fire when the impersonation failed; other tabs keep showing the operator's view.

---

## References

- **JIRA Parent:** [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906)
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (`feat/VCST-4906-login-on-behalf`, head `80690ef2`)
- **Test case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` IMP-049 Part A
- **Lock-in report:** `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md`
- **Related (separate bug):** IMP-049-BUG-1 — Platform OAuth `/connect/token grant_type=impersonate` has no status-based gate (qa-backend-expert)
- **Source files verified 2026-05-14:**
  - `vc-frontend/client-app/shared/account/composables/useImpersonate.ts` blob sha `413bf48070e2afe5600a76551bf11b709efabb2c`
  - `vc-frontend/client-app/pages/company/members.vue` blob sha `29f0153cde528d3fde3fd2158a226fec16dedf43`
