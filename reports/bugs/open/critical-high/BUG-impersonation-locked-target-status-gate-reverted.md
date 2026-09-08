# Impersonating a Locked target regressed to HTTP 200 + operator-session-destroyed (server-side status gate reverted) `[P0]` `[Security]`

**Env:** vcst-qa @ Store `3.1007.0` · Customer `3.1023.0` · Theme `2.57.0-alpha.2490`
**Found by:** `/qa-regression` REG-2026-09-07-1342, suite 082 (`IMP-049` Part A) · triaged `REAL_BUG` · live-verified 2026-09-08

## Summary

`POST /connect/token grant_type=impersonate` against a **Locked** target user now returns **HTTP 200 with a valid
Bearer token**, wipes the operator's own auth state, and redirects to `/blocked` — destroying the operator's
session in the process. This is the **2026-05-14 baseline** contract that a later fix (RE-LOCKED, verified
2026-07-15: HTTP 400, no token, operator session preserved) had corrected. The server-side status gate has
regressed back to its original, worse state. Distinct from `BUG-nested-impersonation-privilege-escalation.md`
(chained-token escalation) and from `BUG-impersonation-no-account-type-gate-administrator-target.md`
(target account-type, not status) — this is specifically the Locked/blocked-status gate at the first grant.

## Steps to reproduce

1. Confirm the target is genuinely Locked: `GET {{BACK_URL}}/api/security/users/<targetId>` →
   `lockoutEnd=9999-12-31T23:59:59+00:00`, `lockoutEnabled=true`; `GET .../locked` → `{"locked":true}`.
2. Clear session. Sign in to storefront as `SUPPORT_AGENT` (`@td(SUPPORT_AGENT.email)`, has `loginOnBehalf`).
3. Navigate to `{{FRONT_URL}}/account/impersonate/@td(IMPERSONATE_TARGET_BLOCKED.userId)`.
4. Observe `POST {{FRONT_URL}}/connect/token`, `grant_type=impersonate&user_id=<blocked target>`.

## Expected vs actual

**Expected (the 2026-07-15 contract, previously verified live and locked into the case):** HTTP 400, no token
issued, storefront shows a graceful "switching failed" error, operator's own session **preserved**
(`/account` remains reachable without re-authenticating).

**Actual (reproduced 2026-09-08):** HTTP **200** with a full JWT (`sub=<blocked user>`,
`vc_operator_user_id=<SUPPORT_AGENT>`, `vc_operator_name=<SUPPORT_AGENT email>`). Storefront detects the Locked
status client-side, wipes `localStorage` auth state, and redirects to `/blocked` ("Your account is blocked").
No impersonation banner renders. The operator's own session is **destroyed** — navigating to
`/account/dashboard` afterward redirects to `/sign-in?returnUrl=/account/dashboard`, forcing re-authentication.
Both of the case's own recorded Part-A `Failure_Signals` fire verbatim: *"/connect/token returns HTTP 200 for a
Locked target"* and *"operator session destroyed after the denied attempt (must be preserved)"*.

![Locked target impersonation returns HTTP 200](../../../regression/REG-2026-09-07-1342/screenshots/IMP-049-VERIFY-REPRODUCED-blocked-200.png)
![Operator session destroyed — /account redirects to /sign-in](../../../regression/REG-2026-09-07-1342/screenshots/IMP-049-VERIFY-REPRODUCED-operator-session-destroyed.png)

## Impact

The platform OAuth endpoint has no functioning status-based gate for a Locked target. Any direct REST caller
holding `loginOnBehalf` can mint a usable 30-minute Bearer for a Locked account, bypassing the storefront UI's
`/blocked` redirect entirely (the redirect is client-side only). This additionally destroys the *operator's own*
session as a side effect, which is itself a regression from the 07-15 fix independent of the security question.

## Root cause (hypothesis)

The 2026-07-15 fix that made `/connect/token` return 400 for a Locked target has been reverted or bypassed —
possibly a platform version rollback, a config toggle, or a re-introduced code path. Needs source diffing between
the build that carried the 07-15 fix and the current `vc-platform`/Customer module versions on this env
(Customer `3.1023.0`) to identify exactly what regressed. Not yet root-caused at the code level — flagging for
the assigned developer to bisect.

## Related test-case defect (not filed separately, noted for the fix owner)

`IMP-049`'s `Steps` column (suite 082) is internally inconsistent — it describes Part A as *"returns HTTP 400
with a valid Bearer token ... operator's own session is PRESERVED (intact).access_token is cleared"*, conflating
both historical contracts in one sentence. Only the `[STATE]`-tagged `Assertions` column is coherent and was used
as the oracle for this verification. Route to `/qa-review-tests 082 --fix` to clean up the `Steps` column
separately from this product bug.

## Fix Routing

- **Primary:** `vc-platform` — the Locked-target status check at the impersonate grant handler (the same
  `AuthorizationController` area referenced in the nested-impersonation bug, but the STATUS gate rather than the
  permission gate). Restore the 07-15 behavior: HTTP 400, no token, operator session untouched.
- **Layer:** backend (platform token endpoint).
- Do NOT auto-merge — human review required.
