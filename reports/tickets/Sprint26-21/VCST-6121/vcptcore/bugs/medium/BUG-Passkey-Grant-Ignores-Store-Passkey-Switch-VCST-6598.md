# BUG: Passkey sign-in ignores the store's Passkey switch — with the store Passkey scheme off, an already-open sign-in page still gets a token

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121
**Severity:** P2 / Medium · **Tracker:** [VCST-6598](https://virtocommerce.atlassian.net/browse/VCST-6598) · **Relates:** VCST-6121 (checklist item #25)

## Env
- **Stand:** `vcptcore` — `{{FRONT_URL}}` / `{{BACK_URL}}`, store `{{STORE_ID}}` (B2B-store)
- **Versions (package = deployed, `vc-deploy-dev@vcptcore-qa` 2026-10-28):** Platform 3.1091.0-pr-3144-e637 · Theme 2.61.0-pr-2601-8058-80583415 · **VirtoCommerce.Passkeys 3.1000.0-pr-1-a25f** · Store 3.1012.0-pr-190-ded5 · Customer 3.1032.0-pr-324-b30b · XFrontend 3.1008.0-alpha.64-vcst-6121-passkeys · ProfileExperienceApiModule 3.1022.0-pr-150-afd6 · AdminShell 3.1002.0-pr-4-1dd1 · OTP 3.1001.0 · MFA 3.1000.1
- **Browser:** Edge 155 (playwright-edge), WebAuthn virtual authenticator (CTAP2, internal, resident key, UV)
- **Repro rate:** 3/3 (C1 PKS-016 14:56Z, C1 PKA-002 15:13Z in REG-2026-10-28-1519, package 16:09–16:10Z UTC)
- **Trace id:** the stand sends neither `Request-Id` nor `traceparent`; joined by time to App Insights `vcptcore-qa` op `685e493ab61237fa08b89826cb3cb7ab` (`POST Authorization/Exchange` 200)
- **HAR:** none for this run — the edge lane writes its HAR only when its context closes and the context stayed open; the `network/` rows carry the requests
- **Evidence package:** `reports/tickets/Sprint26-21/VCST-6121/vcptcore/evidence-20261028T1607Z-passkey-store-switch-grant/` (`<pkg>` below)

## Summary
With B2B-store's **Passkey** authentication scheme switched off (store REST reads back `isActive: false`), a `/sign-in`
page loaded before the switch still signs the buyer in: `POST /connect/token grant_type=passkey&storeId=B2B-store`
→ **200 + tokens**, sign-in log `Passkey` succeeded. A freshly loaded page hides the button, so the switch is enforced
in the UI only. Why: `PasskeyGrantTypeHandler` never reads `storeId` and gates only on the global `Passkeys` option.

**Expected behaviour rests on the ticket text** ("Configuration per Store … to disable Passkey for security reason")
and is **pending the story author's open question Q2** (is the store switch meant to block the API as well?). OTP and
external sign-in already refuse server-side when their store switch is off (`<pkg>/source/findings.md` S3/S4).

## Steps to reproduce
1. Re-arm the account: `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_BUYER` (account `@td(PK_BUYER)`, B2B buyer on `{{STORE_ID}}`). Baseline `GET {BACK_URL}/api/store-authentication-schemes/B2B-store` → Password, GoogleSSO, Passkey all `isActive: true`.
2. Edge + virtual authenticator: `{FRONT_URL}/sign-in` → email + password → `/account/security` → **Add passkey** → logout (presence simulation off first).
3. Load `{FRONT_URL}/sign-in` — **Sign in with Passkey** is shown. Keep the tab.
4. Admin: `PUT {BACK_URL}/api/store-authentication-schemes/B2B-store` with Passkey `isActive: false`; read back → `false`.
5. Wait 60 s, do not reload. Presence simulation on, click **Sign in with Passkey** in the stale tab.
6. Control: logout, load `/sign-in` fresh → only **Sign in with Google** — the Passkey button is hidden.
7. Cleanup: `PUT` the prior scheme list back and read it back.

## Actual
- `POST {FRONT_URL}/connect/token` `grant_type=passkey&scope=offline_access&storeId=B2B-store&credential=…` → **200** token response (16:10:02 GMT) — `<pkg>/network/failing-passkey-grant-scheme-off.json` (#197)
- The SPA lands on `/` signed in as "AGENT-TEST-PK BUYER" — `bugs/screenshots/Passkey-Grant-Ignores-Store-Passkey-Switch/01-FAIL-signed-in-with-passkey-scheme-off.png`, `<pkg>/screenshots/dom-signed-in-scheme-off.txt`
- Sign-in log: `signInType Passkey, succeeded true, storeId B2B-store, 16:10:01.997Z` — `<pkg>/network/03-signin-log-pk-buyer.json`
- Store REST at the same time: Passkey `isActive: false` (16:09:21Z → restored 16:11:46Z) — `<pkg>/network/01-…`, `04-…`
- Fresh page load hides the button (control) — `bugs/screenshots/Passkey-Grant-Ignores-Store-Passkey-Switch/02-control-fresh-signin-no-passkey-button.png`
- Console: one unrelated 404 script error; App Insights: no exception, no store-scheme read in the op

## Expected
- With the store's Passkey scheme inactive, `grant_type=passkey` for that store is refused (400, no `access_token`), the page stays on `/sign-in`, and the sign-in log records a failed row — as OTP (`otp_disabled`) and external sign-in already do. **Pending author Q2.**

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | PASS | fresh load hides the button (`screenshots/02-…`); the SPA only sends the grant the server accepts (`screenshots/01-…`, `<pkg>/console/console.txt`) |
| 2. Backend Admin | N/A — not probed by the investigation | |
| 3. GraphQL xAPI | N/A — not probed by the investigation | |
| 4. Platform REST API | **FAIL** | `<pkg>/network/failing-passkey-grant-scheme-off.json` (200) vs `<pkg>/network/01-scheme-off-before-after.json` (`isActive: false`); `appinsights-window.json`, `appinsights-685e493a.json` |

**Owning layer:** Layer 4 — REST / module (platform token endpoint grant extension in vc-module-passkeys).

## Root Cause Analysis
- **Why:** `PasskeyGrantTypeHandler.ValidateGrantAsync` reads only `credential` and calls `AuthenticateAsync`; `storeId` is never read and no store service is injected (S1). `PasskeyService.AuthenticateAsync` gates only on the global `PasskeyOptions.Enabled` (S2). — `<pkg>/source/findings.md`
- **Precedent:** OTP `OtpService.ValidateUserAsync` refuses with `OtpDisabled` (S3); x-api `ExternalSignInValidator` requires an active store scheme (S4); `IStoreAuthenticationService.GetStoreSchemesAsync` has no consumer in the passkey module (S5).
- **Server side:** App Insights op `685e493ab61237fa08b89826cb3cb7ab` — passkey lookup, sign-count update, token inserts, no exception, no scheme read — `<pkg>/network/appinsights-685e493a.json`
- **Ruled out** (`<pkg>/root-cause.md` §5): by-design (ticket `{SPEC}` + VirtoOZ "Enable Authentication Types", no display-only wording; residual: author Q2); env data drift (seeded account, scheme read before/after/restore); timing (60–76 s wait, 3/3); version skew (deployed commits).
- **Confidence:** HIGH on the mechanism; the intended behaviour is pending Q2.

## Regression
N/A — new feature (vc-module-passkeys PR #1, unreleased); never worked. Not in stable bundles v15 / v16 (no `VirtoCommerce.Passkeys` entry).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST (token endpoint grant extension)
- **Suggested repo:** VirtoCommerce/vc-module-passkeys
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Passkeys — `PasskeyGrantTypeHandler`
- **RCA anchor:** `src/VirtoCommerce.Passkeys.Data/Services/PasskeyGrantTypeHandler.cs:34-64` `ValidateGrantAsync` — read `storeId`; when `IStoreAuthenticationService.GetStoreSchemesAsync(storeId, clone:false)` has no active `Passkey` scheme, fail with `PasskeyOutcome.PasskeyDisabled` (mapped to `NotAllowed`, line 77) before `AuthenticateAsync`, as x-api `ExternalSignInValidator` does; plus a handler unit test
- **Routing confidence:** HIGH — mechanism and repo; the fix shape assumes author Q2 = yes
