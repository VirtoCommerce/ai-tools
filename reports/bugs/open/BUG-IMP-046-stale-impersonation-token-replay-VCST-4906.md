# BUG-IMP-046: Stale Impersonation Access Token Remains Valid Server-Side After Operator Reverts Session — VCST-4906 AC#6 Violation

## Status: READY_TO_SUBMIT

**Severity:** Critical
**Priority:** P0
**Category:** Security / Session Management / Authentication / OAuth2
**Component:** Backend (Platform) + Frontend (vc-frontend)
**Owning layer:** **Layer 4 (Platform / OpenIddict)** + Layer 1 (Frontend) co-responsibility
**Environment:** vcst-qa
**Re-verified:** 2026-05-14 — playwright-edge — confirmed reproducible against current deploy

---

## Build / Environment under test

| Field | Value |
|---|---|
| FRONT_URL | `https://vcst-qa-storefront.govirto.com` |
| BACK_URL | `https://vcst-qa.govirto.com` |
| Platform | `3.1026.0` |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280 head `80690ef2`) |
| OpenIdConnectModule | `VirtoCommerce.OpenIdConnectModule 3.1000.0` |
| Health | `/health` → Healthy (Modules / Cache / Redis / SQL) |

## Operator + target (resolved via test-data/aliases.json)

| Role | Alias | Identity |
|---|---|---|
| Operator | `SUPPORT_AGENT` (USR-001) | John Mitchell — `test-john.mitchell-20260310@test-agent.com` — `platform_id=143bc845-7ba3-4982-ae9a-a9446a399705` — role grants `platform:security:loginOnBehalf` (≡ `StorefrontPermissions.CanImpersonate`) |
| Target | `IMPERSONATE_TARGET` (USR-007) | David Kim — `test-david.kim-20260310@test-agent.com` — `platform_id=ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (Active, TechFlow org `6fb516c1-...`) |

Credentials resolved from `process.env` at run time (`.env` `SUPPORT_AGENT_EMAIL`/`SUPPORT_AGENT_PASSWORD`). No hardcoded passwords.

---

## Summary

VCST-4906 AC#6 mandates: **"Previous Token MUST be invalidated"** when the operator clicks "Revert back to own account".

Re-verified on the PR #2280 deployment that this does NOT happen. After the operator impersonates target user B and clicks Revert in the storefront header, the impersonation `access_token` captured from `localStorage["auth"]` BEFORE the revert continues to authenticate as B against the storefront xAPI GraphQL `me` resolver, with the token's full 30-minute TTL intact and no server-side revocation in flight.

Two compounding gaps cause this:

1. **vc-frontend (PR #2280) `useImpersonate.ts::revertImpersonate()`** does NOT call `/revoke/token` (or any RFC 7009 revocation endpoint). It simply issues a new operator token via `requestImpersonateToken("")` and overwrites `localStorage`. The previous impersonation token is silently dropped from client-side storage, never sent back to the server for invalidation.
2. **vc-platform (`AuthorizationController.cs`)** — the `~/revoke/token` endpoint exists, but the platform's JWT validation pipeline is stateless. It validates incoming Bearer tokens via signature + `exp` only — no `jti` denylist, no per-token revocation table consulted at request time. So even if the frontend DID call the endpoint, the JWT validator would not honor it.

Net effect: an attacker who exfiltrates the impersonation token at any point before the operator's Revert click (XSS, browser-extension snoop, malicious middleware, HAR capture, console paste into a bug ticket, leaked log line) retains that token's full power until natural expiry. The operator clicking Revert is **security theater** — the UI banner disappears but the impersonation token is still live in attacker hands. The same token also stays alive after the operator fully signs out (verified in the prior session: see "Previous findings" below).

---

## Layer Validation

Re-verified 2026-05-14 via playwright-edge browser session (single Edge tab); 4 layers exercised.

| Layer | Expected | Actual | Result |
|---|---|---|---|
| 1 — Storefront UI | Revert click → operator chip in header, banner gone | Operator chip + breadcrumb restored, redirected to `/company/members` | **PASS (UI)** |
| 2 — Admin SPA | n/a — impersonation does not surface in admin SPA | n/a | **N/A** |
| 3 — GraphQL xAPI | `POST /graphql { me { id userName email contact { firstName lastName organizationId } } }` with stale `T_imp` after revert → HTTP 401 or `errors[]` with auth failure | **HTTP 200**, `data.me = { id: ec3031ac-...David, userName: test-david.kim-..., email: test-david.kim-..., contact: { firstName: David, lastName: Kim, organizationId: 6fb516c1-...TechFlow } }` — 26.3 seconds after the revert click | **FAIL** |
| 4 — Platform REST (`/connect/token grant_type=impersonate`) | No new issuance for empty `user_id` should leave the previous token usable | New operator token issued correctly, but NO `/revoke/token` or `/connect/revocation` request fires on revert | **FAIL (root cause)** |

**Network audit during the entire impersonation + revert session (playwright-edge `browser_network_requests` filtered):** only `POST /connect/token` calls — zero matches for `revoke|revocation|introspect|signout|sign-out|logout` until end-of-session. Confirms the frontend never even attempts revocation.

---

## Steps to Reproduce

### Pre-flight (browser, playwright-edge)

1. Sign in to `{FRONT_URL}/sign-in` as `SUPPORT_AGENT` (John Mitchell). Verify `localStorage["auth"]` shows operator token whose JWT `sub = 143bc845-...`, `vc_operator_user_id = null`.

### Impersonate

2. Navigate to `{FRONT_URL}/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (David Kim).
3. Wait for silent redirect to `/` (Home). The header chrome now shows operator chip `"John Mitchell logged in as David Kim"` + revert button `"Back to John Mitchell"` in the account menu.
4. **Capture impersonation token** as `T_imp`:
   ```js
   sessionStorage.setItem('__T_imp', JSON.parse(localStorage.getItem('auth')).access_token);
   ```
   Decoded `T_imp` claims observed: `sub=ec3031ac-...David`, `name=test-david.kim-...`, `vc_operator_user_id=143bc845-...John`, `jti=b80ab9e2-8575-4a41-91f1-55839cf01ba7`, `oi_tkn_id=1195706e-5b2e-4771-baca-093eb28972dc`, `exp - iat = 1800s`.

### Pre-revert sanity check

5. `fetch('/graphql', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+T_imp}, body: JSON.stringify({ query: '{ me { id userName email } }' }) })`
   → HTTP 200, `data.me.userName = test-david.kim-...` ✓ (token is valid pre-revert)

### Revert

6. Click `"Back to John Mitchell"` in the account-menu popup.
7. Page navigates to `/company/members`. `localStorage["auth"]` is now overwritten — JWT `sub=143bc845-...John`, `vc_operator_user_id=null`. UI shows John Mitchell as active.

### Critical assertion — replay stale `T_imp`

8. With the SAME `T_imp` captured in step 4 (NOT the new operator token), repeat:
   ```js
   fetch('/graphql', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+T_imp}, body: JSON.stringify({ query: '{ me { id userName email contact { firstName lastName organizationId } } }' }) })
   ```
9. Wait 5+ seconds, repeat. Wait 30+ seconds, repeat. Wait 5+ minutes (within token TTL), repeat.

### Expected

Step 8 onward should return HTTP 401, or HTTP 200 with `errors[]` containing an auth-failure code. AC#6: "Previous Token MUST be invalidated".

### Actual

| Replay time delta | gql_status | gql data.me |
|---|---|---|
| +0s (immediately after revert) | 200 | David Kim's full identity |
| +26.3 s | 200 | David Kim's full identity |
| (Cross-verified in prior session) +35.7 s on Firefox / +operator-signout / +5 min | 200 each time | David Kim each time |

The token is fully usable for the remainder of its 30-minute `exp` window against `/graphql { me }`. Other surfaces with the same token also accept it (Platform REST `/api/platform/security/currentuser` confirmed in prior session at `tests/Sprint-current/VCST-4906/evidence/imp-049/` and `reports/regression/REG-2026-05-14-1543/imp-046-confirmation/`).

---

## Evidence

All under `tests/Sprint-current/VCST-4906/evidence/bug-verification-security/`:

| File | Content |
|---|---|
| `imp-046-final-evidence-2026-05-14.json` | Re-verification evidence package: full `T_imp` + `T_op` JWT decoded claims, post-revert delta seconds, final GraphQL replay status + body showing David's identity 26 s after revert |
| `imp-046-post-revert-operator-restored.png` | Storefront header showing John Mitchell restored as active account post-revert (Layer 1 PASS) |

Additionally, prior session evidence (preserved verbatim — see "Previous findings"):
- `tests/Sprint-current/VCST-4906/evidence/imp-049/` — Firefox-session pre/post-revert token responses + screenshots
- `reports/regression/REG-2026-05-14-1543/imp-046-confirmation/` — independent Firefox confirmation with 35.7 s delta + post-operator-signout probes confirming the token survives operator sign-out (not just revert)

---

## Root Cause Analysis

### Smoking gun #1 — Frontend never revokes

[`client-app/shared/account/composables/useImpersonate.ts`](https://github.com/VirtoCommerce/vc-frontend/blob/feat/VCST-4906-login-on-behalf/client-app/shared/account/composables/useImpersonate.ts) @ sha `413bf48070e2afe5600a76551bf11b709efabb2c` (PR #2280):

```ts
async function revertImpersonate(redirectTo: string = "/"): Promise<void> {
  resetState();
  await requestImpersonateToken("", redirectTo);   // empty user_id signals "revert"
}

async function backToOperator(): Promise<void> {
  reverting.value = true;
  try {
    await revertImpersonate("/company/members");
  } catch (e) { Logger.error(backToOperator.name, e); }
  ...
}

async function requestImpersonateToken(userId: string, redirectTo: string = "/"): Promise<void> {
  step.value = "impersonate";
  try {
    const { error, data } = await useFetch("/connect/token")
      .post(
        new URLSearchParams({
          grant_type: "impersonate",
          scope: "offline_access",
          user_id: userId,                          // "" on revert
        }),
        "application/x-www-form-urlencoded",
      )
      .json<ConnectTokenResponseType>();
    ...
    if (access_token && token_type && expires_in && refresh_token) {
      setAccessToken(access_token);                  // ONLY operation: client-side swap
      setExpiresAt(expires_in);
      setTokenType(token_type);
      setRefreshToken(refresh_token);
      ...
```

The revert flow consists entirely of: `POST /connect/token user_id=""` → four `setX(...)` localStorage writes → broadcast/redirect. **No `/revoke/token` call, no Authorization header invalidation, no server notification that the old token should die.** AC#6 is not implemented at the frontend layer at all.

### Smoking gun #2 — Platform `/revoke/token` exists but JWT validator never consults it

[`src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs) @ sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` (branch `dev`):

```csharp
// Lines 87-110 — revoke endpoint EXISTS
[HttpPost("~/revoke/token")]
public async Task<ActionResult> RevokeCurrentUserToken()
{
    var tokenId = HttpContext.User.GetClaim("oi_tkn_id");
    var authId = HttpContext.User.GetClaim("oi_au_id");

    if (authId != null) {
        var tokens = _tokenManager.FindByAuthorizationIdAsync(authId);
        await foreach (var token in tokens) {
            await _tokenManager.TryRevokeAsync(token);
        }
    } ...
    return Ok();
}
```

The endpoint exists and updates OpenIddict's DB token status. However, the platform's JWT validation pipeline is stateless — it validates Bearer tokens via signature + `exp` only and never consults `_tokenManager.FindByIdAsync` at request time to check whether the token is still active. This is the parent design defect tracked in [`BUG_032_057-access-token-revocation.md`](BUG_032_057-access-token-revocation.md).

The same file `Exchange()` handler for `grant_type=impersonate` with `user_id=""` (lines ~257-310) correctly *issues* the new operator token but does NOT revoke the caller's incoming impersonation token.

### Why VCST-4906 AC#6 makes this a P0

`BUG_032_057` is a platform-wide design defect affecting every revocation path. **VCST-4906 AC#6 is the first user-facing AC that explicitly promises revocation.** The AC text is unambiguous; the shipped implementation does not honor it. PR #2280 added the `backToOperator()` / `revertImpersonate()` flows (NET-NEW per file history) but only the operator-restoration half of AC#6 was coded — the revocation half was never written.

### Network confirmation

`browser_network_requests` filtered `connect/token|revoke|revocation|introspect|signout|sign-out|logout` across the full session shows ONLY two `POST /connect/token` calls (the impersonate-to-target and the revert-to-operator token issuances). Zero revocation calls — the storefront never even attempts revocation.

---

## App Insights query — DEFERRED

Per `memory_azure_application_insights`, vcst-qa App Insights resources (`vcst-qa`, `vcst-qa-storefront`) are likely **classic** App Insights (NOT workspace-based) — data is not in the `vcst-devtraining-law` Log Analytics workspace. KQL queries via azure-mcp `monitor` against the workspace won't return relevant traces. A future verification should:

```kql
// In the classic App Insights resource directly (Azure Portal "Logs" pane):
requests
| where timestamp >= ago(24h)
| where url contains "/revoke/token" or url contains "/connect/revocation"
| project timestamp, name, url, resultCode, duration
```

Expected: zero requests during the bug repro window — corroborating the browser-side network observation that revocation is never attempted.

Browser-side `browser_network_requests` already provides the equivalent observation deterministically. App Insights is supplementary and can be added when the classic-AI access path is configured.

---

## Suggested Fix

**Two-part fix.** Either part on its own is insufficient.

### Part 1 — Frontend (vc-frontend, shippable in same PR #2280 release)

In `useImpersonate.ts::revertImpersonate()`, call `/revoke/token` BEFORE issuing the operator-restoration token:

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

Also call `/revoke/token` during operator sign-out (in `useUser.ts::signOut()` or equivalent), so the token doesn't survive the operator logging out entirely (confirmed-broken scenario from prior session).

### Part 2 — Platform (vc-platform, see `BUG_032_057`)

Implement a `jti`-based denylist consulted by the JWT validator middleware so that DB-revoked tokens actually fail validation at request time. Per BUG_032_057 recommendation, this can be in-memory (`IMemoryCache` with TTL `= exp - now`) for single-instance deployments or Redis-backed for multi-instance.

Acceptance: a Bearer with `jti` in the denylist returns HTTP 401 on any protected endpoint, including `/api/platform/security/currentuser`, `/graphql`, and `/xapi/...`.

### Part 3 — Interim mitigation (if Part 2 not feasible in VCST-4906 window)

Override the impersonate grant's `AccessTokenLifetime` to ≤ 60 s; require client-side refresh on every action; refuse refresh after revert. Reduces (does not eliminate) the exposure window from 30 min to 1 min. **Not an AC#6 fix on its own** — only Part 1 + Part 2 fully satisfy the AC.

---

## Acceptance Criteria for Fix Verification

When the fix ships, re-run IMP-046 from `regression/suites/Frontend/auth/082-auth-impersonation.csv`:

- [ ] Network panel during revert shows a `POST /revoke/token` request (Part 1 evidence)
- [ ] Probe `POST /graphql { me { id } }` with the captured impersonation token returns **HTTP 200** + impersonated identity BEFORE revert click
- [ ] Probe with the SAME token returns **HTTP 401** (or `errors: [{ message: ..., code: 'unauthorized' }]`) within ≤ 60 s AFTER revert click
- [ ] Operator's own session token continues to work normally on the same probe with the NEW operator token
- [ ] Same probe AFTER operator-sign-out (separate path) → HTTP 401
- [ ] No new attack surface: `/revoke/token` requires auth and only revokes tokens issued under the same operator session
- [ ] `PROPOSED-BL-AUTH-012` is promoted to `business-logic.md` once the AC#6 contract is restored

---

## Previous findings (preserved from prior sessions — superseded by Re-verification 2026-05-14 above)

### Session 1: `BUG_082_046-impersonation-token-not-invalidated-after-revert.md` (2026-05-14 13:00–14:00 UTC, qa-testing-expert via Firefox MCP)

Original write-up. Confirmed via Playwright Firefox + curl: stale `T_imp` returns HTTP 200 on `POST /graphql { me { id } }` after revert. Network panel: zero `/revoke/token` calls. Identified two-part root cause (frontend + platform). Identified parent defect `BUG_032_057-access-token-revocation.md`. Verdict: CONFIRMED.

### Session 2: `BUG-Impersonation-Token-Not-Invalidated-After-Revert-VCST-4906-AC6.md` (2026-05-14 14:52–15:30 UTC, qa-testing-expert via Firefox, independent fresh session)

Independent cross-engine confirmation. 35.7 s delta between revert click and replay rules out client-side animation/race window. **Added scope escalations:** (a) xAPI GraphQL also accepts the revoked token (not just Platform REST `/currentuser`), (b) token survives full operator sign-out (not just revert), (c) zero revocation call is ever attempted — only the new-operator-token issuance. Captured JWT claims including `jti=f471f635-...` and `vc_operator_user_id` audit trail. Verdict: CONFIRMED.

### Session 3 (this report): re-verification on Edge (playwright-edge) 2026-05-14 17:30 UTC

Re-confirmed against the same build (Platform 3.1026.0, theme PR #2280 head `80690ef2`, OpenIdConnectModule 3.1000.0). Third independent browser engine, fresh session, 26.3 s delta. Same outcome — stale `T_imp` returns David's full identity on `/graphql { me }` post-revert. Pulled the source files (vc-frontend@feat/VCST-4906 sha `413bf48` and vc-platform@dev sha `67ff599`) and confirmed the smoking-gun code paths. **No stealth fix has landed.** Bug remains.

---

## References

- **JIRA Parent:** [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906) — AC#6 ("Previous Token MUST be invalidated")
- **JIRA Epic:** VCST-4903
- **PR:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (head `80690ef2`)
- **Parent platform defect:** `reports/bugs/open/BUG_032_057-access-token-revocation.md`
- **Related bugs in this verification session:**
  - `reports/bugs/open/BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md` — sibling P1 (same OpenIddict pipeline, different attack vector: Locked / Invited target)
  - IMP-049-BUG-2 (operator session destroyed by Blocked-target impersonation) — frontend-owned, handled in parallel by qa-testing-expert; not in this report's scope
- **Test case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` IMP-046 "Previous Impersonation Token Invalidated After Revert (AC#6 Security)"
- **Source files verified 2026-05-14:**
  - vc-frontend `client-app/shared/account/composables/useImpersonate.ts` @ branch `feat/VCST-4906-login-on-behalf` (PR #2280, sha `413bf48070e2afe5600a76551bf11b709efabb2c`)
  - vc-platform `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` @ branch `dev` (sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6`) — `Exchange()` `IsImpersonateGrantType` branch lines ~257-310 + `RevokeCurrentUserToken()` lines 87-110
- **Business rules:** BL-AUTH-007 (impersonation session boundary), BL-AUTH-011 (token revocation on session end), PROPOSED-BL-AUTH-012
- **Edge case:** ECL-14.1 (impersonation security exit) in `.claude/agents/knowledge/e-commerce-edge-cases-library.md`
- **Suggested JIRA filing:**
  - Project: VCST · Issue type: Bug · Priority: P0/Critical
  - Labels: `security`, `authentication`, `impersonation`, `login-on-behalf`, `vcst-4906`, `oauth2`
  - Components: vc-platform-security, vc-frontend
  - Links: caused-by → VCST-4906; relates-to → BUG_032_057
