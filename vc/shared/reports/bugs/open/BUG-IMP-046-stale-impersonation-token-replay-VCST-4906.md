# BUG-IMP-046: Stale Impersonation Token Replays After Operator Reverts — VCST-4906 AC#6 Violation

**Severity:** Critical · **Priority:** P0 · **Status:** READY_TO_SUBMIT · **Category:** Security / Session / OAuth2
**Owning layer:** Layer 4 (Platform / OpenIddict) + Layer 1 (Frontend) co-responsibility
**Env:** vcst-qa storefront (`https://vcst-qa-storefront.govirto.com`) · Platform 3.1026.0 · Theme `vc-theme-b2b-vue-2.49.0-pr-2280-80690ef2` · OpenIdConnectModule 3.1000.0 · `/health` Healthy
**Re-verified:** 2026-05-14 — playwright-edge (3rd browser engine; Firefox confirmed twice in prior sessions)
**BL Refs:** BL-AUTH-007 (impersonation session boundary), BL-AUTH-011 (token revocation on session end), `PROPOSED-BL-AUTH-012` · ECL-14.1
**Related:** Parent platform defect [BUG_032_057-access-token-revocation.md](BUG_032_057-access-token-revocation.md); sibling [BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md](BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md)

## Summary

VCST-4906 AC#6 mandates **"Previous Token MUST be invalidated"** on Revert. PR #2280 (head `80690ef2`) does not do this. After operator John Mitchell impersonates target David Kim and clicks "Revert", the impersonation `access_token` captured from `localStorage["auth"]` BEFORE the revert continues to authenticate as David against `/graphql { me }` with the full 30-min TTL intact. Two compounding gaps: (1) frontend `revertImpersonate()` never calls `/revoke/token`; (2) platform JWT validator is stateless — `/revoke/token` updates an OpenIddict DB row but the validator never consults it. Net effect: an attacker who exfiltrates the token at any point before Revert (XSS, extension snoop, HAR capture, console-paste, leaked log) retains full power until natural expiry. Revert is **security theater**.

## Operator + Target

| Role | Alias | Identity |
|---|---|---|
| Operator | `SUPPORT_AGENT` | John Mitchell · `test-john.mitchell-20260310@test-agent.com` · `platform_id=143bc845-…` · perm `platform:security:loginOnBehalf` (≡ `CanImpersonate`) |
| Target | `IMPERSONATE_TARGET` | David Kim · `test-david.kim-20260310@test-agent.com` · `platform_id=ec3031ac-…` · TechFlow org · Active |

Credentials resolved from `process.env` at run time.

## Reproduction Steps

1. Sign in as `SUPPORT_AGENT` at `{FRONT_URL}/sign-in`. `localStorage["auth"]` JWT `sub=143bc845-…`, `vc_operator_user_id=null`.
2. Navigate to `{FRONT_URL}/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b`. Page redirects to `/`; header shows "John Mitchell logged in as David Kim".
3. **Capture impersonation token as `T_imp`:**
   ```js
   sessionStorage.setItem('__T_imp', JSON.parse(localStorage.getItem('auth')).access_token);
   ```
   Decoded `T_imp`: `sub=ec3031ac-…David`, `vc_operator_user_id=143bc845-…John`, `jti=b80ab9e2-…`, `oi_tkn_id=1195706e-…`, `exp - iat = 1800s`.
4. **Pre-revert sanity:** `fetch('/graphql', { ..., 'Authorization': 'Bearer '+T_imp, body: '{"query":"{ me { id userName email } }"}' })` → **200**, `me.userName = test-david.kim-…`.
5. Click **"Back to John Mitchell"** in account menu. Navigates `/company/members`; `localStorage["auth"]` overwritten to operator token; UI shows John active.
6. **Critical assertion — replay stale `T_imp`** with the SAME token from step 3:
   ```js
   fetch('/graphql', { method:'POST', headers:{'Content-Type':'application/json',
     'Authorization':'Bearer '+T_imp}, body: JSON.stringify({ query: '{ me { id userName email contact { firstName lastName organizationId } } }' }) })
   ```
7. Repeat at +5 s, +30 s, +5 min within TTL.

## Expected vs Actual

| Replay Δ | Expected | gql_status | data.me |
|---|---|---|---|
| Pre-revert | 200 (token valid) | 200 | David Kim ✓ |
| +0 s after revert | 401 / `errors[]` auth-failure | **200** | David Kim full identity ❌ |
| +26.3 s (this session, Edge) | 401 | **200** | David Kim ❌ |
| +35.7 s (prior Firefox) | 401 | **200** | David Kim ❌ |
| After operator sign-out (prior session) | 401 | **200** | David Kim ❌ |

Token usable for full 30-min `exp`. Other surfaces also accept it: `/api/platform/security/currentuser`, `/xapi/...`.

**Network audit (entire session, filtered `revoke|revocation|introspect|signout|logout`):** zero matches. Only two `POST /connect/token` issuances (impersonate-to-target, revert-to-operator). **Frontend never even attempts revocation.**

## Root Cause (two-layer)

**Layer 1 — Frontend never revokes.** `client-app/shared/account/composables/useImpersonate.ts` @ sha `413bf48` (PR #2280): `revertImpersonate()` consists entirely of `POST /connect/token user_id=""` + four `setX(...)` localStorage writes. No `/revoke/token`, no server notification.

**Layer 4 — Platform `/revoke/token` exists but JWT validator never consults it.** `vc-platform/src/.../AuthorizationController.cs` @ `67ff599` `RevokeCurrentUserToken()` updates OpenIddict DB row status; validator only checks signature + `exp`. Parent defect [BUG_032_057](BUG_032_057-access-token-revocation.md).

## Evidence

Under `tests/Sprint-current/VCST-4906/evidence/bug-verification-security/`:

| File | Content |
|---|---|
| `imp-046-final-evidence-2026-05-14.json` | `T_imp` + `T_op` decoded claims, post-revert delta seconds, GraphQL replay 200 + David's identity 26 s after revert |
| `imp-046-post-revert-operator-restored.png` | Header shows John Mitchell restored (Layer 1 UI PASS) |

Prior independent sessions: `tests/Sprint-current/VCST-4906/evidence/imp-049/`, `reports/regression/REG-2026-05-14-1543/imp-046-confirmation/` (Firefox, +35.7 s, post-operator-signout probes).

## Recommended Fix (two-part — either alone insufficient)

**Part 1 (vc-frontend, ships in same PR #2280):** in `revertImpersonate()` call `/revoke/token` BEFORE issuing the operator-restoration token. Same for `useUser.ts::signOut()` so token doesn't survive operator logout.
**Part 2 (vc-platform — parent BUG_032_057):** JTI denylist consulted by JWT validator middleware; DB-revoked tokens must fail validation at request time.
**Part 3 (interim if Part 2 not feasible in VCST-4906 window):** override impersonate-grant `AccessTokenLifetime` ≤ 60s. Reduces (does not eliminate) exposure. Not an AC#6 fix on its own.

See [BUG-IMP-046-stale-impersonation-token-replay-investigation.md](BUG-IMP-046-stale-impersonation-token-replay-investigation.md) for: full code excerpts (frontend + platform), Layer Validation matrix, 3 prior-session confirmations, App Insights query plan, acceptance criteria checklist, JIRA filing recommendation.

## Recommended JIRA

`Impersonation: Previous token NOT invalidated after Revert — VCST-4906 AC#6`
Labels: `security`, `authentication`, `impersonation`, `login-on-behalf`, `vcst-4906`, `oauth2`, `Severity:Critical`, `Priority:P0`
Links: caused-by → VCST-4906; relates-to → BUG_032_057
