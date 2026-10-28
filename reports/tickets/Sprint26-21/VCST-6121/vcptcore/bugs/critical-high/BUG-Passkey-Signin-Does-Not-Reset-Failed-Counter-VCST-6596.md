# BUG: Passkey sign-in does not reset the failed sign-in counter, so one wrong password after it locks the account

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121

**Severity:** High · **Priority:** P1 · **Tracker:** [VCST-6596](https://virtocommerce.atlassian.net/browse/VCST-6596) (screenshot embedded in Actual result) · **Relates to:** VCST-6121

## Env
- **Stand:** `vcptcore` — `{FRONT_URL}` vcptcore-qa-storefront / `{BACK_URL}` vcptcore-qa, store `B2B-store`, browser Edge (playwright-edge) with a virtual authenticator (CTAP2, internal, resident key, UV)
- **Build (verified against vc-deploy-dev `vcptcore-qa` at filing):** Platform 3.1091.0-pr-3144-e637 · Theme 2.61.0-pr-2601-8058-80583415 · **VirtoCommerce.Passkeys 3.1000.0-pr-1-a25f** (owning module) — all match
- **Other modules in the package (not compared — not the owning repo):** Customer 3.1032.0-pr-324-b30b, Store 3.1012.0-pr-190-ded5, XFrontend 3.1008.0-alpha.64-vcst-6121-passkeys, ProfileExperienceApiModule 3.1022.0-pr-150-afd6, AdminShell 3.1002.0-pr-4-1dd1, OTP 3.1001.0, MFA 3.1000.1
- **Repro rate:** 3/3 (deterministic), three sessions, two lanes
- **Trace ID:** none — the stand sends neither `Request-Id` nor `traceparent` on `/connect/token`
- **HAR:** none for this run — the edge lane writes its HAR only when the context closes; the network rows carry the requests (package `network/`)
- **App Insights:** grant sampled out, no exception (a missing side effect, not a throw) — package `network/appinsights-window.json`

## Summary
After a successful passkey sign-in the user's `accessFailedCount` keeps its old value. A buyer with 4 failed password attempts who then signs in with a passkey is locked out by the next single wrong password. The password grant resets the counter (ASP.NET Identity `CheckPasswordSignInAsync`); the passkey grant verifies the credential with `PerformPasskeyAssertionAsync` and nothing resets the counter afterwards.

## Steps to reproduce
1. Re-arm the account: `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_LOCKOUT` (unlocked, accessFailedCount 0, no passkeys). Account `@td(PK_LOCKOUT)` — B2B buyer on `{{STORE_ID}}`, lockoutEnabled true.
2. Edge, virtual authenticator. `{FRONT_URL}/sign-in` → sign in with email + password (`DEFAULT_TEST_PASSWORD`) → `/account/security` → **Add passkey** → row "Unnamed key · Device only". Logout.
3. Send 4 password grants with a wrong password: `POST {BACK_URL}/connect/token grant_type=password storeId=B2B-store` ×4 → 400 `invalid_grant` each. Admin read `GET /api/platform/security/users/id/{PK_LOCKOUT.userId}` → **accessFailedCount = 4**.
4. `{FRONT_URL}/sign-in` → **Sign in with Passkey** → one `POST /connect/token grant_type=passkey storeId=B2B-store` → **200**, signed in; sign-in log row `Passkey` succeeded.
5. Admin read again → **accessFailedCount = 4** (expected 0).
6. Logout → `/sign-in` → email + ONE wrong password → **Sign in** → 400 `user_is_temporary_locked_out`, alert "Your account has been temporarily locked. Please try again later."; lockoutEnd +2 min; sign-in log `Password` LockedOut.
7. Control (same account, re-armed): 4 wrong password grants (count 4) → 1 correct password grant 200 → **count 0** → 1 wrong → `login_failed`, count 1 (no lock).

## Actual
- Passkey grant `200` (package `network/02-passkey-grant-from-click.json`), counter still **4** 26 s later (`network/03-counter-after-passkey-success.json`).
- Next wrong password: `POST /connect/token grant_type=password` → **400** `{"code":"user_is_temporary_locked_out","errorDescription":"Your account has been temporarily locked. Please try again after some time."}` (`network/failing-password-grant-after-passkey.json`); lockoutEnd 14:50:59 UTC, log `Password LockedOut` (`network/05-state-after-one-wrong.json`).

![Locked after one wrong password](../screenshots/Passkey-Signin-Does-Not-Reset-Failed-Counter/01-FAIL-locked-after-one-wrong-password.png)

## Expected
- A successful sign-in resets the failure counter — `BL-AUTH-003` (DECLARED): 4 failures + 1 success → counter resets. The password path does (`network/06-control-password-success-resets.json`), and the sibling OTP and MFA grants reset in their own modules.
- After a passkey sign-in, accessFailedCount = 0; one later wrong password → `login_failed`, count 1, no lock.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | PASS (renders the server's `user_is_temporary_locked_out` correctly) | package `screenshots/01-FAIL-locked-after-one-wrong-password.png`, `screenshots/dom-locked-after-one-wrong.txt`, `console/console.json` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | FAIL | package `network/02-…`, `network/03-…`, `network/06-control-password-success-resets.json`; App Insights `network/appinsights-window.json` |

**Owning layer:** REST / module (platform auth grant extension in vc-module-passkeys)

## Root Cause Analysis
- **Why:** package `root-cause.md` §4. The passkey grant verifies via `PerformPasskeyAssertionAsync`; neither `PasskeyService` nor `GrantTypeHandlerBase` resets the counter on success.
- **Source:** package `source/findings.md` — S1 `PasskeyService.AuthenticateAsync` (vc-module-passkeys @ a25fea03, lines 28–51) has no `ResetAccessFailedCountAsync`; S3 `GrantTypeHandlerBase` never resets for any custom grant; S5 `OtpService` and S6 MFA grant reset in their own modules.
- **Ruled out** (`root-cause.md` §5): by-design / config-gated (BL-AUTH-003, no setting governs it), env data drift (account re-armed, counter read before/after each step), flaky (3/3), version skew (source read at the deployed commits).

## Regression
N/A — new feature (vc-module-passkeys PR #1, unreleased); never worked. Not in stable bundles v15 / v16.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST (module: platform auth grant extension)
- **Suggested repo:** VirtoCommerce/vc-module-passkeys
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Passkeys — `PasskeyService.AuthenticateAsync` (passkey grant)
- **RCA anchor:** `src/VirtoCommerce.Passkeys.Data/Services/PasskeyService.cs` `AuthenticateAsync` ~L44–50 (@ a25fea03) — after a successful `AddOrUpdatePasskeyAsync`, call `_userManager.ResetAccessFailedCountAsync(user)` as `OtpService` does; add a `PasskeyServiceTests` case. Not `GrantTypeHandlerBase` (would duplicate OTP/MFA resets and trip MFA's `ResetAccessFailedCountAsync` Never assertion).
- **Routing confidence:** HIGH
- **Note:** the code exists only on the open PR #1 branch `VCST-6121-passkeys` (not on `dev`), so the fix belongs in that PR — fix-forward.
