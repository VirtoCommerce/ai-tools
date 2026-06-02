# BUG-032-001 — Access token NOT revoked after logout (token replay until TTL expiry)

- **Run**: REG-2026-05-04-1527
- **Suite**: 032 — Auth Session & RBAC
- **Test cases**: AUTH-024, AUTH-057
- **Severity**: High (Security; potential P0 pending architectural decision)
- **Business rule**: BL-AUTH-003 (Token revocation must be immediate)
- **Edge cases**: ECL-4.3, ECL-6.1
- **Confirmed**: false (preliminary — needs qa-testing-expert investigation; may be by-design OAuth)
- **Browser**: playwright-chrome 148.0.0.0 on Windows
- **Environment**: https://vcst-qa-storefront.govirto.com
- **Reproducibility**: 100% (verified twice with two independent token captures: jti=e8d4fff2 and jti=a9db41df)

## Steps to Reproduce

1. Sign in to storefront as `qa-agent-slot1@virtocommerce.com` / `TestAgent1!`.
2. Open DevTools → Network. Capture `access_token` from `POST /connect/token` response.
3. Click user name in top header → click Logout (`[data-test-id="sign-out-button"]`).
4. Verify `POST /revoke/token` returns HTTP 200 — the logout flow itself works correctly.
5. While still on the storefront origin (now logged out), execute the following from DevTools console:

```js
fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <captured_access_token>' },
  body: JSON.stringify({ query: '{ me { id userName } }' })
}).then(r => r.json()).then(console.log);
```

## Expected

`/graphql` returns HTTP 401 Unauthorized OR HTTP 200 with `{ me: { userName: "Anonymous" } }`, because the access token was revoked at step 4.

## Actual

`/graphql` returns HTTP 200 with:
```json
{ "data": { "me": { "id": "c994fa34-dab9-4238-9c39-28756b3e547d", "userName": "qa-agent-slot1@virtocommerce.com" } } }
```
Full user data exposed via the supposedly-revoked token.

## Control verification (rules out alternative explanations)

- **Bogus token** via the same `/graphql` proxy → returns `{ me: { userName: "Anonymous" } }` (correct rejection of invalid token).
- **No Authorization header** → returns `{ me: { userName: "Anonymous" } }` (correct anonymous behavior).
- Only the actual revoked access_token returned authenticated data — confirming the **revoked token itself is still being accepted** (not a session-cookie fallback at the proxy).

## Diagnosis (likely root cause)

The Virto Commerce platform `/revoke/token` endpoint likely revokes only the **refresh_token** (which is OpenIddict's standard revoke contract). The **access_token** remains valid for its full TTL (`exp - iat = 1799s ≈ 30 min` on captured tokens). This is a typical OAuth 2.0 trade-off — but it directly contradicts BL-AUTH-003 wording "Token revocation must be immediate."

## Cross-references

- Suite 044 NOT_TESTED notes: "token expiry not exposed in QA" — same observability gap.
- BL-AUTH-003 (knowledge/business-logic.md) — current wording requires immediate revocation.

## Recommendation

Choose one:
- **(A) Implement an access-token blacklist** (Redis-backed `jti` blocklist, checked on every `/graphql` request) so revocation is truly immediate.
- **(B) Update BL-AUTH-003** to reflect industry-standard OAuth 2.0 behavior — only refresh_token is revoked; access_token validity ends at natural TTL. Document the ~30-min replay window as an accepted security trade-off and consider shortening `expires_in` from 1799s to something tighter (e.g., 5 min) to compensate.

## Evidence

- `reports/regression/REG-2026-05-04-1527/032-evidence/AUTH-024-account-popup.png`
- POST /revoke/token network log (HTTP 200)
- /graphql response body with revoked token (above)
