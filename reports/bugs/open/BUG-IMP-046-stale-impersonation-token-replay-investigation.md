# Investigation — BUG-IMP-046 Stale Impersonation Token Replay (VCST-4906 AC#6)

Companion to [BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md](BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md). Holds full layer matrix, smoking-gun code excerpts, three confirmation sessions, App Insights query plan, acceptance criteria, JIRA filing — extracted to comply with 150-line cap in `.claude/rules/reports.md`.

## Layer Validation (Re-verified 2026-05-14, playwright-edge)

| Layer | Expected | Actual | Result |
|---|---|---|---|
| 1 — Storefront UI | Revert click → operator chip restored, banner gone | Operator chip + breadcrumb restored, redirect `/company/members` | **PASS (UI)** |
| 2 — Admin SPA | n/a — impersonation does not surface in admin SPA | n/a | **N/A** |
| 3 — GraphQL xAPI | `POST /graphql { me { … } }` with stale `T_imp` → 401 or `errors[]` | **200**, full David Kim identity 26.3 s after revert | **FAIL** |
| 4 — Platform REST | Empty `user_id` issuance should leave previous token unusable | New operator token issued; **NO `/revoke/token` call** fires | **FAIL (root cause)** |

Network audit (`browser_network_requests` filtered `connect/token|revoke|revocation|introspect|signout|sign-out|logout`): only the two `POST /connect/token` issuances. Zero revocation calls. Storefront never attempts revocation.

## Smoking Gun #1 — Frontend never revokes

`client-app/shared/account/composables/useImpersonate.ts` @ sha `413bf48070e2afe5600a76551bf11b709efabb2c` (PR #2280, branch `feat/VCST-4906-login-on-behalf`):

```ts
async function revertImpersonate(redirectTo: string = "/"): Promise<void> {
  resetState();
  await requestImpersonateToken("", redirectTo);   // empty user_id signals "revert"
}

async function backToOperator(): Promise<void> {
  reverting.value = true;
  try { await revertImpersonate("/company/members"); }
  catch (e) { Logger.error(backToOperator.name, e); }
  // …
}

async function requestImpersonateToken(userId: string, redirectTo: string = "/"): Promise<void> {
  step.value = "impersonate";
  try {
    const { error, data } = await useFetch("/connect/token").post(
      new URLSearchParams({ grant_type: "impersonate", scope: "offline_access", user_id: userId }),  // "" on revert
      "application/x-www-form-urlencoded",
    ).json<ConnectTokenResponseType>();
    // …
    if (access_token && token_type && expires_in && refresh_token) {
      setAccessToken(access_token);   // ONLY operation: client-side swap
      setExpiresAt(expires_in);
      setTokenType(token_type);
      setRefreshToken(refresh_token);
```

Revert flow = `POST /connect/token user_id=""` + four `setX(...)` localStorage writes + broadcast/redirect. **No `/revoke/token`, no Authorization header invalidation, no server notification that the old token should die.** AC#6 is not implemented at the frontend layer at all.

## Smoking Gun #2 — Platform `/revoke/token` exists but JWT validator never consults it

`src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` @ sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` (branch `dev`):

```csharp
// Lines 87-110 — endpoint EXISTS
[HttpPost("~/revoke/token")]
public async Task<ActionResult> RevokeCurrentUserToken()
{
    var tokenId = HttpContext.User.GetClaim("oi_tkn_id");
    var authId  = HttpContext.User.GetClaim("oi_au_id");
    if (authId != null) {
        var tokens = _tokenManager.FindByAuthorizationIdAsync(authId);
        await foreach (var token in tokens) {
            await _tokenManager.TryRevokeAsync(token);
        }
    } // …
    return Ok();
}
```

Endpoint exists and updates OpenIddict DB token status. JWT validation pipeline is stateless — validates Bearer tokens via signature + `exp` only, never consults `_tokenManager.FindByIdAsync` at request time. Parent design defect: [BUG_032_057-access-token-revocation.md](BUG_032_057-access-token-revocation.md).

`Exchange()` handler for `grant_type=impersonate` with `user_id=""` (~L257-310) correctly issues the new operator token but does NOT revoke the caller's incoming impersonation token.

## Why VCST-4906 AC#6 makes this a P0

BUG_032_057 is a platform-wide design defect affecting every revocation path. **VCST-4906 AC#6 is the first user-facing AC that explicitly promises revocation.** AC text is unambiguous; shipped implementation does not honor it. PR #2280 added `backToOperator()` / `revertImpersonate()` flows (NET-NEW per file history) but only the operator-restoration half of AC#6 was coded — the revocation half was never written.

## App Insights — DEFERRED

Per `memory_azure_application_insights`, vcst-qa AI resources (`vcst-qa`, `vcst-qa-storefront`) are likely **classic** (NOT workspace-based) — data not in `vcst-devtraining-law`. KQL via azure-mcp `monitor` against the workspace won't return relevant traces. Future verification, run directly in the classic AI Logs pane:

```kql
requests
| where timestamp >= ago(24h)
| where url contains "/revoke/token" or url contains "/connect/revocation"
| project timestamp, name, url, resultCode, duration
```

Expected: zero requests during repro window — corroborates browser-side observation. Browser-side `browser_network_requests` already provides equivalent deterministic observation; AI is supplementary, can be added when classic-AI access path is configured.

## Suggested Fix (Detail)

### Part 1 — Frontend (vc-frontend, ships in PR #2280)

```ts
async function revertImpersonate(redirectTo: string = "/"): Promise<void> {
  resetState();
  try {
    await useFetch("/revoke/token").post(
      new URLSearchParams({ token_type_hint: "access_token" }),
      "application/x-www-form-urlencoded",
    );
  } catch (e) {
    Logger.error("revertImpersonate.revoke", e);
    // best-effort: operator restoration must still succeed
  }
  await requestImpersonateToken("", redirectTo);
}
```

Also call `/revoke/token` during operator sign-out (`useUser.ts::signOut()` or equivalent) so token doesn't survive operator logout entirely (confirmed-broken scenario from prior session).

### Part 2 — Platform (vc-platform, parent BUG_032_057)

JTI-based denylist consulted by JWT validator middleware so DB-revoked tokens fail validation at request time. Per BUG_032_057: `IMemoryCache` with TTL `= exp - now` (single-instance) or Redis (multi-instance).

Acceptance: Bearer with `jti` in denylist returns HTTP 401 on any protected endpoint (`/api/platform/security/currentuser`, `/graphql`, `/xapi/...`).

### Part 3 — Interim mitigation (if Part 2 not feasible in VCST-4906 window)

Override impersonate-grant `AccessTokenLifetime` ≤ 60 s; require client-side refresh on every action; refuse refresh after revert. Reduces exposure 30 min → 1 min. **Not an AC#6 fix on its own** — only Part 1 + Part 2 fully satisfy AC.

## Acceptance Criteria for Fix Verification

Re-run IMP-046 from `regression/suites/Frontend/auth/082-auth-impersonation.csv`:

- [ ] Network panel during revert shows `POST /revoke/token` (Part 1 evidence)
- [ ] Probe `/graphql { me { id } }` with captured impersonation token → **200** + impersonated identity BEFORE revert
- [ ] Same token returns **401** (or `errors: [{ code: 'unauthorized' }]`) within ≤ 60 s AFTER revert
- [ ] Operator's NEW token continues to work normally on same probe
- [ ] Same probe AFTER operator-sign-out (separate path) → 401
- [ ] No new attack surface: `/revoke/token` requires auth, only revokes tokens issued under same operator session
- [ ] `PROPOSED-BL-AUTH-012` promoted to `business-logic.md` once AC#6 contract restored

## Previous Findings (preserved verbatim; superseded by Re-verification 2026-05-14)

### Session 1 — `BUG_082_046-impersonation-token-not-invalidated-after-revert.md` (2026-05-14 13:00–14:00 UTC, qa-testing-expert / Firefox MCP)

Original write-up. Confirmed via Playwright Firefox + curl: stale `T_imp` returns 200 on `POST /graphql { me { id } }` after revert. Network panel: zero `/revoke/token`. Identified two-part root cause (frontend + platform) and parent defect BUG_032_057. **CONFIRMED.**

### Session 2 — `BUG-Impersonation-Token-Not-Invalidated-After-Revert-VCST-4906-AC6.md` (2026-05-14 14:52–15:30 UTC, qa-testing-expert / Firefox, independent fresh session)

Independent cross-engine confirmation. 35.7 s delta rules out client-side animation/race. **Added scope:** (a) xAPI GraphQL also accepts the revoked token (not just Platform REST `/currentuser`), (b) token survives full operator sign-out (not just revert), (c) zero revocation call ever attempted — only new-operator-token issuance. Captured JWT claims including `jti=f471f635-…` and `vc_operator_user_id` audit trail. **CONFIRMED.**

### Session 3 — Edge re-verification (2026-05-14 17:30 UTC, this report's source)

Re-confirmed against same build (Platform 3.1026.0, PR #2280 head `80690ef2`, OpenIdConnectModule 3.1000.0). Third independent browser engine, fresh session, 26.3 s delta. Same outcome — stale `T_imp` returns David's full identity on `/graphql { me }` post-revert. Pulled source files (vc-frontend@`feat/VCST-4906` sha `413bf48` + vc-platform@`dev` sha `67ff599`) and confirmed smoking-gun code paths. **No stealth fix has landed.**

## References

- **JIRA Parent:** [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906) — AC#6 ("Previous Token MUST be invalidated")
- **JIRA Epic:** VCST-4903
- **PR:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (head `80690ef2`)
- **Parent platform defect:** [reports/bugs/open/BUG_032_057-access-token-revocation.md](BUG_032_057-access-token-revocation.md)
- **Sibling P1 (same OpenIddict pipeline, different vector — Locked / Invited target):** [BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md](BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md)
- **IMP-049-BUG-2** (operator session destroyed by Blocked-target impersonation) — frontend-owned, handled in parallel by qa-testing-expert; not in this report's scope
- **Test case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` IMP-046
- **Source files verified 2026-05-14:** vc-frontend `client-app/shared/account/composables/useImpersonate.ts` @ `feat/VCST-4906-login-on-behalf` sha `413bf48070e2afe5600a76551bf11b709efabb2c`; vc-platform `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` @ `dev` sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` — `Exchange()` `IsImpersonateGrantType` ~L257-310, `RevokeCurrentUserToken()` L87-110
- **Business rules:** BL-AUTH-007, BL-AUTH-011, `PROPOSED-BL-AUTH-012`
- **Edge case:** ECL-14.1 in `.claude/agents/knowledge/e-commerce-edge-cases-library.md`

## Suggested JIRA Filing

- Project: VCST · Issue type: Bug · Priority: P0/Critical
- Labels: `security`, `authentication`, `impersonation`, `login-on-behalf`, `vcst-4906`, `oauth2`
- Components: vc-platform-security, vc-frontend
- Links: caused-by → VCST-4906; relates-to → BUG_032_057
