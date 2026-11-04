# BUG: xAPI `deleteSignInKey` does not end the user's other sessions (refresh tokens keep working), unlike the REST delete

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121
**Severity:** P2 / Medium · **Tracker:** [VCST-6594](https://virtocommerce.atlassian.net/browse/VCST-6594) · **Relates:** VCST-6121 (checklist item #32)

## Env
- **Stand:** `vcptcore` — `{{FRONT_URL}}` / `{{BACK_URL}}`, store `{{STORE_ID}}` (B2B-store)
- **Versions (package = deployed, `vc-deploy-dev@vcptcore-qa` 2026-10-28):** Platform 3.1091.0-pr-3144-e637 · Theme 2.61.0-pr-2601-8058-80583415 · **VirtoCommerce.XFrontend 3.1008.0-alpha.64-vcst-6121-passkeys** · VirtoCommerce.Passkeys 3.1000.0-pr-1-a25f · ProfileExperienceApiModule 3.1022.0-pr-150-afd6 · Customer 3.1032.0-pr-324-b30b · Store 3.1012.0-pr-190-ded5 · AdminShell 3.1002.0-pr-4-1dd1
- **Repro rate:** 4/4 (3x discovery, 4a 14:12, package: xAPI by API 14:54 and by UI click 14:58 UTC)
- **HAR:** none for this run — the edge lane writes its HAR only when its context closes and the context stayed open; the `network/` rows carry the requests instead
- **Evidence package:** `reports/tickets/Sprint26-21/VCST-6121/vcptcore/evidence-20261028T1455Z-xapi-delete-key-sessions/` (`<pkg>` below)
- **Evidence type: API-only.** The defect is a surviving refresh token on a *different* session; no storefront screen shows it, so the report carries no UI screenshot (reports §5.0).

## Summary
After a buyer deletes a passkey through xAPI `Mutation.deleteSignInKey` (the storefront Security page uses it), every
other session of that buyer can still renew itself with its refresh token. Deleting a key through the platform REST
endpoint ends those sessions (`invalid_grant`). Why: session termination after a key delete lives in the REST
controller, not in `ISignInMethodService.DeleteKeyAsync`, and the xAPI handler calls the service directly.

**Expected behaviour is pending the story author's answer** (Q3: does deleting a sign-in key end other sessions on
the storefront path too?). Access tokens are validated statelessly by default (KB-7564A9BF), so a still-accepted
access token is not the defect — **the defect is the surviving refresh token.**

## Steps to reproduce
1. Re-arm: `TEST_ENV=vcptcore npm run seed:passkey -- --only PK_LOCKOUT` (account `@td(PK_LOCKOUT)`, B2B buyer, 0 passkeys).
2. Open two independent sessions s1, s2: `POST {BACK_URL}/connect/token grant_type=password scope=offline_access storeId=B2B-store` ×2 (keep each access + refresh token).
3. Edge, virtual authenticator: storefront password sign-in → `/account/security` → **Add passkey** (key listed).
4. With s2: `Mutation.deleteSignInKey(command:{signInMethodName:"Passkey", keyId})` (keyId from `Query.signInMethods`) → `succeeded: true`.
5. With s1: `grant_type=refresh_token` → **200, new access token** (expected 400 invalid_grant). Again 57 s after the delete with the new refresh token → 200.
6. UI variant: open session s3 (password grant), then in the browser **Add passkey** → **Delete** → **OK** (one `DeleteSignInKey` mutation, succeeded) → s3 refresh_token grant → **200**.
7. REST control: re-arm `PK_BO_MANAGER`; sessions b1, b2 (password grant); register a passkey in Admin Shell → Profile → Sign-in methods → **Add a passkey**; with b2 `DELETE {BACK_URL}/api/platform/security/currentuser/sign-in-methods/Passkey/keys/{id}` → 204; b1 refresh_token → **400 invalid_grant**.

## Actual
- `deleteSignInKey` → `200 {succeeded: true, errors: []}` — `<pkg>/network/failing-deleteSignInKey-s2.json`; UI door `<pkg>/network/failing-deleteSignInKey-ui.json`
- s1 refresh after the delete → **200, new access token** at +3 s (`network/02`) and +57 s (`network/04`); s3 after the UI delete → **200** (`network/10`)
- s1 access token still answers `Query.signInMethods` (200, key gone) — `network/03` (not the defect, see Summary)
- Console: 0 errors / 0 warnings (`console/console.json`); App Insights: no exception — a missing side effect, not a throw

## Expected
- After a successful key delete, the user's **other** sessions' refresh tokens are refused (`400 invalid_grant`), as on the REST door (`network/07`: "The specified refresh token is no longer valid.") and as xAPI `changePassword` does — **pending author Q3**.
- The deleting session itself stays signed in.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | (UI door's request is row 4 → Layer 3) |
| 2. Backend Admin | N/A — not probed by the investigation | Admin Shell used only to register the control key |
| 3. GraphQL xAPI | **FAIL** | `<pkg>/network/failing-deleteSignInKey-s2.json`, `-ui.json` + `network/02`, `04`, `10` |
| 4. Platform REST API | PASS | `<pkg>/network/06` (204), `07` (400 invalid_grant), `08` (401); `appinsights-window.json` |

**Owning layer:** Layer 3 — xAPI (REST right + xAPI wrong).

## Root Cause Analysis
- **Why:** `DeleteSignInKeyCommandHandler.Handle` only returns `signInMethodService.DeleteKeyAsync(...)`; the REST `SecurityController` delete adds `await TryTerminateUserSessions(user, user)` (excluding the caller's authorization id). — `<pkg>/source/findings.md` S1–S3
- **Precedent:** xAPI `ChangePasswordCommandHandler` (vc-module-profile-experience-api) terminates sessions itself — S4.
- **Server side:** App Insights op `694ca63c30bff2bc04c575df00dd7e02` Exchange 200 (s1 after xAPI delete) vs op `ff4803eabb6148ce8e0fb610d24a2020` /connect/token 400 (b1 after REST delete); TRACE_ID `d3341f2f51ab43cd8c1c5d753762e517` = UI mutation — `<pkg>/network/appinsights-window.json`
- **Ruled out** (`<pkg>/root-cause.md` §5): by-design (no VirtoOZ page covers key deletion; REST + xAPI changePassword parity — residual: author Q3 open); env data drift (account re-armed, fresh sessions); timing (refused at +3 s on REST, accepted at +57 s on xAPI); version skew (deployed build).
- **Confidence:** MEDIUM — mechanism proven live + in source; the intended storefront behaviour is inferred from parity.

## Regression
N/A — new mutation (vc-module-x-frontend PR #13, unreleased). Not in stable bundles v15 (XFrontend 3.1003.0) / v16 (3.1007.0): the handler does not exist at either tag.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-x-frontend
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** XFrontend — `DeleteSignInKeyCommandHandler`
- **RCA anchor:** `src/VirtoCommerce.XFrontend.Data/Commands/DeleteSignInKeyCommandHandler.cs:13-16` `Handle` — after a succeeded `DeleteKeyAsync`, terminate the user's other sessions via `IUserSessionsService`, excluding the caller's authorization id (mirror vc-platform `SecurityController.TryTerminateUserSessions`). Alternative: move termination into vc-platform `SignInMethodService.DeleteKeyAsync` (cross-repo — author's design call).
- **Routing confidence:** MEDIUM — expected behaviour pending author Q3
