# BUG: Impersonation access_token not invalidated on revert (AC#6 violation)

## Status: CONFIRMED

**Severity: High (Security)** · Linked: **VCST-4906** (AC#6), refs VCST-4725, VCST-5174
**Env:** vcst-qa @ Platform 3.1026.0-family (deployed **3.1041.0**), Theme **2.53.0-pr-2343**
**Found by:** regression run `REG-2026-07-01-1807-082p0`, suite 082 case **IMP-046** (browser: playwright-edge)

## Summary
When an operator with `CanImpersonate` reverts out of an impersonated session ("Back to {operator}"), the frontend restores the operator's own session client-side but **never revokes the impersonation `access_token` server-side**. The stale impersonation token continues to authenticate as the target customer until its natural JWT expiry (~28 min) — including **after the operator fully logs out**. This violates VCST-4906 AC#6 ("Previous Token MUST be invalidated").

## Steps to Reproduce
Operator = John Mitchell (`@td(SUPPORT_AGENT)`, has `StorefrontPermissions.CanImpersonate`); target = David Kim (`@td(IMPERSONATE_TARGET)`).
1. Sign in as the operator; navigate `/account/impersonate/{target.userId}` → silent impersonation active (banner "John Mitchell logged in as David Kim").
2. Capture the active impersonation `access_token` from `localStorage.auth` (JWT `sub`=David, `vc_operator_name`=John).
3. Confirm it's valid: `POST {FRONT_URL}/graphql { me { id } }` with that token → **200**, `me.id` = David.
4. Click "Back to John Mitchell" (revert). Banner clears; frontend swaps to the operator's own token.
5. Re-run the same `me` probe with the **stale** impersonation token (t+0/4/8/12s), then log the operator out and probe once more.

## Expected vs Actual
- **Expected (AC#6):** stale impersonation token rejected — **401** — immediately after revert.
- **Actual:** stale token returns **200** with David's identity at every interval past the 5s window **and after operator logout**. No `POST /connect/revocation` is issued on revert.

Evidence: `reports/regression/REG-2026-07-01-1807-082p0/screenshots/IMP-046-FAIL-reverted-to-operator-but-stale-token-still-200.png` · results `reports/regression/REG-2026-07-01-1807-082p0/082-results.json`

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `revertImpersonate()` overwrites tokens client-side, never calls revocation (source-confirmed, RCA below) |
| 2. Backend Admin | N/A | not exercised by this flow |
| 3. GraphQL xAPI | PASS | `/graphql` correctly authorizes a *still-valid, non-revoked* JWT — not the defect |
| 4. Platform REST / auth server | SUSPECT | token-lifecycle dependency — see Fix Routing note |

**Owning layer:** Layer 1 — Storefront (the revert flow never attempts server-side revocation).

## Root Cause Analysis
`vc-frontend` → `client-app/shared/account/composables/useImpersonate.ts`:
```ts
async function revertImpersonate(redirectTo = "/") {
  resetState();
  await requestImpersonateToken("", redirectTo);   // re-mints operator token via grant_type=impersonate, user_id=""
}
```
`requestImpersonateToken()` then calls `setAccessToken/​setRefreshToken/…`, **overwriting `localStorage.auth`** with the operator's fresh token. The previous impersonation `access_token` is only *discarded locally* — it is never sent to the OpenIddict revocation endpoint (`/connect/revocation`), so the server keeps honoring it until expiry. To satisfy AC#6, `revertImpersonate` must capture the current token and revoke it server-side **before** overwriting it.

**Caveat (drives routing confidence):** the impersonation token is a self-contained JWT (decodable `sub`/`vc_operator_name` claims). If VC platform access tokens are plain JWTs with no revocation/introspection store, a frontend `/connect/revocation` call alone is a no-op for an access token — full AC#6 compliance would then also require **platform support** (issue impersonation tokens as reference tokens, or add a server-side revocation check). The "survives logout" observation is consistent with standard bearer-JWT semantics, which is *why* explicit revocation support is needed.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront (primary); Layer 4 — Platform (possible dependency)
- **Suggested repo:** `VirtoCommerce/vc-frontend` (primary) — escalate to `VirtoCommerce/vc-platform` if access-token revocation isn't supported server-side
- **repoKind:** frontend (primary) / platform (dependency)
- **Component / module:** vc-frontend `useImpersonate` composable (revert flow); OpenIddict token revocation on the platform side
- **RCA anchor:** `client-app/shared/account/composables/useImpersonate.ts` → `revertImpersonate` / `requestImpersonateToken` (no `/connect/revocation` call)
- **Routing confidence:** MEDIUM — the frontend gap is source-confirmed and single-repo; full AC#6 compliance may span vc-frontend + vc-platform depending on the platform token model. Not a trivial single-line fix → likely `/qa-fix` Gate 0 escalation.

## Notes
- IMP-046's literal `GET {BACK_URL}/api/account` probe returns 404 (wrong host for a storefront-minted token); oracle used was storefront `/graphql { me }`. The CSV Test_Data endpoint should be corrected to the GraphQL `me` probe.
- App Insights run-window correlation (both layers): 0 exceptions / 0 5xx — consistent with a missing-revocation (not an error) defect.
