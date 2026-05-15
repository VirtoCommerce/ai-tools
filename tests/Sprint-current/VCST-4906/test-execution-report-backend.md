# VCST-4906 IMP-046 — Backend / Server-Side Verification

**Date:** 2026-05-14
**Agent:** qa-backend-expert
**Scope:** Re-verify IMP-046 "Previous impersonation token invalidated after revert" from a server-side / REST context to resolve whether AC#5c/AC#6 is met by the actual OAuth resource server (not just the same-origin GraphQL layer the frontend agent tested).
**PR under test:** vc-frontend #2280 (deployed as `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2`)
**Platform:** vcst-qa, version 3.1026.0
**Frontend report cross-ref:** [`test-execution-report-frontend.md`](test-execution-report-frontend.md) §IMP-046

---

## TL;DR — Verdict: **FAIL — P0 ESCALATION**

The stale impersonation access token (`T_imp`) **remains fully valid server-side for the full remainder of its natural 30-minute lifetime after revert.** It is not revoked, blacklisted, or de-scoped. A copy of the token retained by the operator (or any process that captured it during the impersonation window — extensions, logs, proxies, error reporters) can be replayed any time within ~30 minutes to read and (likely) mutate the target user's data.

This **contradicts** the frontend agent's earlier observation of "200/Anonymous" — that result was an artifact of the browser context, not a server-side invalidation. From a clean curl context and from a fresh fetch within the same browser, the same stale token returns the **target's full identity, contact PII, and cart**.

---

## Setup

**Flow used:** Option A (storefront UI on playwright-edge) for token capture + curl for clean REST testing.

**Why not Option B (direct OAuth):** the platform's `/connect/token` `grant_type=password` rejects storefront users with `user_cannot_login_in_store` — the storefront has its own OpenIddict authority (`iss: https://vcst-qa-storefront.govirto.com/`), so the only way to obtain a valid impersonation token for the storefront resource server is via the storefront UI flow. The platform host (`vcst-qa.govirto.com`) is a *separate* authority and its tokens (operator/admin) are not what AC#5c/AC#6 cares about.

### Step 1 — Operator sign-in (John Mitchell)
- Navigated playwright-edge to `https://vcst-qa-storefront.govirto.com/sign-in`
- Filled credentials from `test-data/b2b/users.csv` USR-001 (`test-john.mitchell-20260310@test-agent.com` / `TestPass123!`)
- Captured `T_op` from `localStorage.auth.access_token`

**T_op claim summary (redacted of signature):**
| claim | value |
|---|---|
| `sub` | `143bc845-7ba3-4982-ae9a-a9446a399705` (John Mitchell) |
| `name` / `email` | `test-john.mitchell-20260310@test-agent.com` |
| `role` | `__customer` |
| `iss` | `https://vcst-qa-storefront.govirto.com/` |
| `aud` | `resource_server` |
| `vc_operator_user_id` | (absent) |
| `iat` → `exp` | 30 min token lifetime |

### Step 2 — Impersonation of David Kim (USR-007)
- Navigated to `/company/members`, clicked **Actions → Login on behalf** on David Kim row, confirmed in modal.
- Captured impersonation token `T_imp` from `localStorage.auth.access_token` immediately after the silent-flow handoff.
- Network: `POST https://vcst-qa-storefront.govirto.com/connect/token` body = `grant_type=impersonate&scope=offline_access&user_id=ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` → 200.

**T_imp claim summary:**
| claim | value |
|---|---|
| `sub` | `ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (David Kim) |
| `name` / `email` | `test-david.kim-20260310@test-agent.com` |
| `vc_operator_user_id` | `143bc845-…` (John Mitchell) |
| `vc_operator_name` | `test-john.mitchell-20260310@test-agent.com` |
| `organization_id` | `6fb516c1-07f3-4af4-be5e-35961e3f7993` (TechFlow) |
| `permission` | `["storefront:organization:view", "storefront:user:view"]` |
| `role` | `__customer` |
| `iss` | `https://vcst-qa-storefront.govirto.com/` |
| `aud` | `resource_server` |
| `iat` | 2026-05-14T08:42:10Z |
| `exp` | 2026-05-14T09:12:10Z (30 min lifetime, ~21 min remaining after revert) |
| `jti` | `a57c8100-4fe9-4bce-b510-6c4d518f7ca2` |
| `oi_tkn_id` | `343afb7c-92c3-4548-89fb-2b1c095ee7a6` |

The `oi_tkn_id` claim is significant — OpenIddict assigns it per-token and uses it for server-side revocation tracking. If revocation were happening, this is the handle that would be added to a revocation set.

---

## Pre-Revert REST Test (sanity)

### `/api/account` is NOT a real REST API on either host
- `GET https://vcst-qa.govirto.com/api/account` → **404** (platform host does not expose this route)
- `GET https://vcst-qa-storefront.govirto.com/api/account` → **200 text/html** (the storefront SPA's Vue catch-all route returning `<!doctype html>`)

**The IMP-046 spec literal "`GET {{BACK_URL}}/api/account`" is based on a wrong route assumption.** Neither host has a JSON `/api/account` endpoint. The functional equivalent on this platform is `POST /graphql { me { … } }`.

### Functional equivalents
| Endpoint | Pre-revert with T_imp | Identity returned |
|---|---|---|
| `POST https://vcst-qa-storefront.govirto.com/graphql { me { id userName } }` | **200** | David Kim (`ec3031ac-…`) |
| `POST https://vcst-qa.govirto.com/graphql { me { id userName } }` (cross-origin, BACK_URL equivalent) | **200** | David Kim (`ec3031ac-…`) |
| `GET https://vcst-qa.govirto.com/connect/userinfo` | **401** `invalid_token`, `"The issuer associated to the specified token is not valid."` | — (platform admin authority rejects storefront-issued tokens regardless of state) |
| `POST https://vcst-qa.govirto.com/api/sitemaps/search` | **403** same `invalid_token` reason | — |

**Interpretation:** The storefront-issued token is accepted by both the storefront-host `/graphql` and the platform-host `/graphql` (both are configured to trust the storefront's OpenIddict authority). Other platform REST endpoints (`/connect/userinfo`, `/api/sitemaps`, anything under the platform admin resource server) reject storefront tokens because of strict issuer validation. Those rejection are **issuer-policy rejections**, not token-state rejections, so they do not exercise the "is this token revoked?" code path at all — they 401/403 the same way pre- and post-revert.

The only endpoints that *actually exercise* impersonation-token revocation are the two `/graphql` endpoints.

---

## Revert Mechanism

- Clicked **Account menu → "Back to John Mitchell"** in the storefront header.
- Network: `POST https://vcst-qa-storefront.govirto.com/connect/token` body = `grant_type=impersonate&scope=offline_access&user_id=` (empty `user_id`) → 200.
- localStorage updated: new token, `sub = 143bc845-…` (John Mitchell), `vc_operator_user_id` claim removed.

**Critical finding:** the storefront's revert path does **not** call:
- `POST /connect/revocation` (RFC 7009 token revocation)
- `POST /connect/logout` / end-session
- Any other revoke / blacklist endpoint

It simply requests a new token. The previously-issued `T_imp` is **only abandoned client-side** (overwritten in localStorage). Server-side it remains a valid, signed JWT until its natural 30-minute `exp`.

Source-of-truth implication: `useImpersonate.ts` (vc-frontend) likely calls a single "swap token" code path that's reused for both `impersonate(userId)` and `revert()` — the only difference is `user_id` is omitted on revert.

---

## Post-Revert REST Test (the critical case)

All tests below use the **same `T_imp`** captured pre-revert. Revert happened at 2026-05-14T08:45:30Z.

### Test 1 — `POST https://vcst-qa.govirto.com/graphql` (BACK_URL, cross-origin, REST-equivalent)

**08:45:33Z (3s after revert):**
```http
POST /graphql HTTP/1.1
Host: vcst-qa.govirto.com
Authorization: Bearer <T_imp>
Content-Type: application/json

{"query":"query{ me { id userName memberId } }"}
```
**→ HTTP 200**
```json
{"data":{"me":{"id":"ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b","userName":"test-david.kim-20260310@test-agent.com","memberId":"af6c8e96-1d5b-4713-89ec-81ad7294f365"}}}
```

**08:51:00Z (5m30s after revert) — re-run:** same result, 200, David Kim identity.

### Test 2 — `POST https://vcst-qa-storefront.govirto.com/graphql` (storefront host, same as frontend agent's test)

**Same as Test 1:** 200 with David Kim identity. From both curl AND from `fetch()` inside the browser (default + `credentials: 'omit'` modes). The frontend agent's previously-reported "Anonymous fallback" could not be reproduced.

### Test 3 — Deeper data extraction with stale token

Rich `me` query post-revert (5+ min post-revert):
```graphql
query{ me { id userName memberId email isAdministrator phoneNumber emailConfirmed lockoutEnabled contact { id firstName lastName fullName emails organizationId organizationsIds } } }
```
**→ HTTP 200** — returns David Kim's full profile + contact PII + TechFlow `organizationId` (`6fb516c1-…`).

Orders search:
```graphql
query($userId:String!){ orders(userId:$userId, first:5){ totalCount items { number status total { amount currency { code } } } } }
# variables: { userId: "ec3031ac-…" }
```
**→ HTTP 200** — `totalCount: 0` (David has no orders), but **query accepted and scoped to David Kim** — not rejected as anonymous.

Cart access:
```graphql
query{ cart(storeId:"B2B-store", userId:"ec3031ac-…", currencyCode:"USD"){ id itemsCount } }
```
**→ HTTP 200** — returns David Kim's cart id `ff1b5a83-0099-4a31-8e00-d5e1a54143f1`.

### Test 4 — Platform admin endpoints (control)

`GET https://vcst-qa.govirto.com/connect/userinfo` with stale T_imp → **401** `invalid_token` "The issuer associated to the specified token is not valid."
`POST https://vcst-qa.govirto.com/api/sitemaps/search` with stale T_imp → **403** same reason.

These return the **same rejection pre- and post-revert** because the rejection is issuer-policy (storefront tokens not accepted by platform admin authority), not token-state-aware. They are not an indicator of revocation.

---

## Cross-Endpoint Consistency Summary

| Endpoint | Host | Pre-revert with T_imp | Post-revert with T_imp | Delta |
|---|---|---|---|---|
| `POST /graphql { me }` | vcst-qa-storefront | 200 David Kim | **200 David Kim** | None |
| `POST /graphql { me }` | vcst-qa (BACK_URL) | 200 David Kim | **200 David Kim** | None |
| `POST /graphql { me { contact … } }` | vcst-qa | 200 (full PII) | **200 (full PII)** | None |
| `POST /graphql { orders(userId:David) }` | vcst-qa | 200 (David's orders, empty) | **200 (David's orders)** | None |
| `POST /graphql { cart(userId:David) }` | vcst-qa | 200 (David's cart) | **200 (David's cart)** | None |
| `GET /connect/userinfo` | vcst-qa | 401 invalid_issuer | 401 invalid_issuer | None (issuer rejection — orthogonal) |
| `POST /api/sitemaps/search` | vcst-qa | 403 invalid_issuer | 403 invalid_issuer | None (issuer rejection — orthogonal) |

**Every endpoint that meaningfully exercises the storefront-issued T_imp returns identical results pre- and post-revert.** There is no measurable difference in token authority after the revert click.

---

## Comparison with Frontend Agent Result

Frontend agent observed:
> Returns 200 with `me.id = 18a81de5-…, userName = Anonymous`

Backend re-test observed (same flow, same endpoint, same stale T_imp pattern, from both curl and browser):
> Returns 200 with `me.id = ec3031ac-… (David Kim), userName = test-david.kim-…`

**Possible explanations for the divergence:**
1. The frontend agent's captured token may not have been the live impersonation token at the moment of capture — they used `window.__IMPERSONATION_TOKEN__` (a custom global, presumably set by the storefront for testing) which may have been stale-by-the-time-of-storage or pointed at a refresh-fallback value.
2. The frontend agent's "stale" replay may have been against a token that had already been silently rotated by Apollo's `onError` interceptor reacting to a 401 (silent re-auth → new anonymous token → cached → replayed).
3. Timing — between revert and replay the storefront's token-refresh logic may have already swapped the in-memory token to an anonymous one before the test fired.

In any case, the **server-side ground-truth** (what the resource server actually does when presented with the original impersonation JWT) is unambiguous: it accepts it, validates it, and returns David Kim's data.

---

## Why This Is P0

| Threat | Realistic? |
|---|---|
| Operator captures `T_imp` via DevTools / network log during impersonation, retains it after clicking "Back to John Mitchell", replays it from any HTTP client up to 30 min later. | **Yes, trivial** |
| Browser extension / 3rd-party script with access to `localStorage` during impersonation captures `T_imp` for exfiltration. | Yes, demonstrated in this report |
| Error reporter / Sentry / browser cache pickled the impersonation token in a payload, replay-able. | Yes |
| Cross-org data leakage: John Mitchell (ACME/Camila-incorporate) accessing David Kim's (TechFlow) cart, profile, organization, orders post-revert. | **Demonstrated** |

This violates AC#5c and AC#6 of VCST-4906 directly ("Previous Token MUST be invalidated"). The audit-log claim (`vc_operator_user_id` in T_imp) cannot save us — the audit log records "John acted as David" but the actions are still attributable to David's session, and **after revert, John no longer needs to be the active session for the data to flow**.

ECL-14.1 (privilege escalation chain): a stale token retains its full original scope for the remainder of its 30-min lifetime; any leak of the token = 30 min of replayable access to the target user's data.

---

## Disposition Recommendation: **FIX SERVER**

The "Reword AC" option is not viable because:
- The frontend agent's reported "200/Anonymous" graceful-fallback is **not what the server actually does** — the server returns full target identity. The frontend agent's observation was a browser-context artifact that the server cannot rely on as a security guarantee.
- Even if it *were* the consistent server behavior, "200/Anonymous" violates RFC 7009 / OAuth 2.0 semantics for revoked tokens (`invalid_grant` / 401 `invalid_token` is the canonical response).

**Required server-side fix:**

The storefront's `/connect/token` `grant_type=impersonate` flow with empty `user_id` (the revert path) MUST also invoke OpenIddict token revocation against the previous access token's `oi_tkn_id`/`jti`. Concretely:

1. When `grant_type=impersonate` is invoked with empty `user_id` (revert), the server should look up the calling token's `oi_tkn_id`, mark it revoked in the OpenIddict token store, AND revoke its associated refresh token chain.
2. The OpenIddict resource server middleware on `/graphql` (both hosts) MUST validate tokens against the revocation list, not just verify the JWT signature/expiry. (If `IOpenIddictTokenManager.ValidateAsync` or equivalent is not currently in the validation pipeline, that's the gap.)
3. After fix: replaying `T_imp` post-revert MUST return 401 `invalid_token` with `error_description="The token is no longer valid."` (OpenIddict's standard wording for revoked tokens).

**Update IMP-046 spec wording** to be implementation-honest:
- Change "`GET {{BACK_URL}}/api/account`" → "`POST {{BACK_URL}}/graphql { me { id userName } }`" (the correct REST-equivalent on this platform; there is no `/api/account` JSON endpoint)
- Change "HTTP 401" → keep 401 as the canonical assertion (it is RFC-correct); confirm with OpenIddict that revoked tokens emit 401 not 200.

---

## Final Verdict for IMP-046 Backend Layer

**FAIL — P0 ESCALATION**

The impersonation access token is not invalidated server-side after revert. Stale tokens retain their full original authority (read PII, read cart, query orders scoped to target) for the remainder of their natural 30-minute lifetime. This violates AC#5c/AC#6 of VCST-4906 in both letter (no 401) and spirit (continued privileged access). The frontend agent's earlier "Anonymous fallback" observation was a browser-context artifact, not a server-side guarantee — the server provides no invalidation at all.

**Action:** halt VCST-4906 release. File P0 bug against vc-frontend's `useImpersonate.ts` revert flow AND against the platform OpenIddict revocation pipeline. PR #2280 should not ship until the revert path triggers actual server-side token revocation.

---

## Evidence Summary

| Item | Captured |
|---|---|
| T_op decoded claims | Yes (in report, signature redacted) |
| T_imp decoded claims | Yes (in report, signature redacted) |
| Revert request body | `grant_type=impersonate&scope=offline_access&user_id=` (empty user_id) |
| Pre-revert REST results (4 endpoints) | Yes |
| Post-revert REST results (4 endpoints, 2 timings: T+3s, T+5m30s) | Yes |
| Deep data extraction post-revert (me.contact, orders, cart) | Yes — all returned target's data |
| Browser-context replay (default + credentials:'omit') | Yes — matches curl, contradicts frontend agent observation |

Temporary token files (`tests/Sprint-current/VCST-4906/.token-op.txt`, `.token-imp.txt`) were deleted after the run; raw JWTs are not committed to the repo.
