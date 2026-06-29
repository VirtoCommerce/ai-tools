# VCST-5374 — Fix Verification Report

**Verdict: VERIFIED** (pre-merge, against the deployed PR build) · 2026-06-26

- **Ticket:** VCST-5374 (Medium) — status `To do` (fix PR #303 still **open/unmerged**)
- **Env:** vcst-qa — `FRONT_URL` storefront + `/connect/token`
- **Build under test:** platform `3.1039.0`, theme `2.52.0-pr-2343`, **VirtoCommerce.Customer `3.1013.0-pr-303-fe3b`** (PR #303 alpha auto-deployed to QA)
- **Agent/tooling:** inline — playwright-chrome (UI) + Platform REST/token API

## Result
The org-member account now receives the **temporary** lockout code/message instead of the permanent one. Fix confirmed at both the storefront UI and the `/connect/token` API. Permanent-lock and non-org paths unchanged (no regression).

## Checklist

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Reproduce original symptom path (org user, 5 failed storefront logins) | PASS | Banner now temporary, not "blocked" |
| 2 | **Fix:** org user 5th attempt → `user_is_temporary_locked_out` (was `user_is_locked_out`) | PASS | `connect/token` attempt-5 body; `VCST-5374-FIXED-org-user-temporary-lockout.png` |
| 3 | **Fix (UI):** storefront banner = "Your account has been temporarily locked. Please try again later." | PASS | screenshot |
| 4 | **Determinism:** 3 consecutive reads while locked all `user_is_temporary_locked_out` | PASS (3/3) | API |
| 5 | `lockoutEnd` is a future timestamp (temporary, not MaxValue) | PASS | `2026-06-26T13:47Z` |
| 6 | **Regression:** admin permanent lock (`/lock`, MaxValue) still → `user_is_locked_out` | PASS | API |
| 7 | **Regression:** non-org user still → `user_is_temporary_locked_out` (unchanged path) | PASS | throwaway control |
| 8 | **Regression:** lockout still ENFORCED (login denied during lock) — BL-AUTH-003 | PASS | all locked responses HTTP 400 |
| 9 | No new console errors | PASS | only the expected 400s |
| 10 | Shared account restored (Emily unlocked, `accessFailedCount=0`) | PASS | post-test cleanup |

**STR:** 3/3 (+ live UI run). **Regression:** all pass. **Side effects:** none. **BL verified:** BL-AUTH-003 (lockout enforced), BL-AUTH-013 unaffected.

## Notes
- This is a **pre-merge** verification: the fix is live only because PR #303's alpha module build auto-deployed to vcst-qa. Per `feedback_verify_fix_stops_at_tested` + no-auto-merge, the JIRA ticket is **not** advanced to DONE — a human still merges PR #303, after which a post-merge re-check applies.
- Test account: `test-emily.johnson-20260310@test-agent.com` (org `6fb516c1…`); all locks reverted via `POST /api/platform/security/users/<id>/unlock`.
