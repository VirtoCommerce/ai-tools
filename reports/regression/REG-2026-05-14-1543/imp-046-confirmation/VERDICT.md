# IMP-046 Independent Confirmation — VERDICT

**Run:** REG-2026-05-14-1543 (independent retest by qa-testing-expert)
**Test case:** IMP-046 — Impersonation Access Token Not Invalidated After Revert (VCST-4906 AC#6)
**Theme build:** 2.49.0-pr-2280-8069-80690ef2 (vc-frontend PR #2280)
**Platform:** vcst-qa / 3.1026.0
**Browser:** playwright-firefox (DIFFERENT engine from preliminary run's playwright-chrome — rules out browser-specific localStorage/cookie residue)
**Date:** 2026-05-14 UTC
**Fresh session:** localStorage/sessionStorage/cookies cleared on /sign-in BEFORE login

## VERDICT: **CONFIRMED**

The previous regression run's finding is reproduced exactly. **BL-AUTH-007 and BL-AUTH-011 are violated.** VCST-4906 AC#6 ("Previous Token MUST be invalidated") fails.

---

## 1. Pre-revert `/currentuser` with IMP_TOKEN

| Field | Value |
|---|---|
| HTTP status | **200 OK** |
| `userName` | `test-david.kim-20260310@test-agent.com` |
| Timestamp | 2026-05-14T14:53:30 UTC (approx) |
| Evidence | `pre-revert-currentuser.json` |

## 2. Post-revert `/currentuser` with same IMP_TOKEN

| Field | Value | Δ from pre-revert |
|---|---|---|
| HTTP status | **200 OK** | **unchanged** (expected 401) |
| `userName` | `test-david.kim-20260310@test-agent.com` | **unchanged** (token still authenticates as David) |
| Body length | 355 bytes | identical (same response payload) |
| Permissions | `storefront:organization:view`, `storefront:user:view` | identical |
| Timestamp | 2026-05-14T14:54:47.6 UTC | — |
| Evidence | `post-revert-currentuser.json` |

## 3. Time delta between revert click and post-revert assertion

| Event | Timestamp (UTC) |
|---|---|
| Revert button click (`[data-test-id="back-to-operator-row"]`) | 2026-05-14T14:54:11.930Z |
| Storefront fully reverted (account header reads "John Mitchell", new JWT for John, vc_operator_name=null) | ~14:54:12-14:54:15 |
| Post-revert assertion sent (Node-side replay of IMP_TOKEN) | 2026-05-14T14:54:47.6 UTC |
| **Δ revert→replay** | **35.7 seconds** |

35.7 s is well outside any plausible client-side animation/race window. The storefront UI is in a stable post-revert state at the time of replay.

## 4. Storefront revocation attempt observed?

**No.** Filtered network log shows only:

| # | Method/URL | Body | Purpose |
|---|---|---|---|
| 56 | POST `vcst-qa-storefront.govirto.com/connect/token` → 200 | `grant_type=impersonate&scope=offline_access&user_id=ec3031ac-...` | impersonate David |
| 187 | POST `vcst-qa-storefront.govirto.com/connect/token` → 200 | `grant_type=impersonate&scope=offline_access&user_id=` (empty user_id) | exit impersonation (mint new operator token) |

There is **NO** `/connect/revocation` call, **NO** `/connect/logout`, **NO** sign-out, **NO** impersonation-teardown REST call between revert click and post-revert assertion. The storefront treats revert as a pure client-side token swap: drop David's tokens from localStorage, mint John's, done.

Filter `revoke|revocation|sign-out|signout|logout|introspect|invalid` against the full session network log returned **zero matches** — evidence file: `network-revoke-search.txt`.

## 5. JWT `exp` claim for IMP_TOKEN

| Claim | Value |
|---|---|
| `iat` (issued at) | 2026-05-14T14:52:09 UTC |
| `exp` (expires) | 2026-05-14T15:22:09 UTC |
| Lifetime | 30 minutes |
| Remaining at post-revert replay | ~27 min |
| `sub` | `ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (David Kim) |
| `name` / `email` | `test-david.kim-20260310@test-agent.com` |
| `memberId` | `af6c8e96-1d5b-4713-89ec-81ad7294f365` |
| `vc_operator_user_id` | `143bc845-7ba3-4982-ae9a-a9446a399705` (John Mitchell) |
| `vc_operator_name` | `test-john.mitchell-20260310@test-agent.com` |
| `jti` | `f471f635-7f9d-4116-948a-d32ddeb45e0b` |

JWT is genuinely server-trusted via signature + `exp`; backend has no concept of "this impersonation has been reverted." Evidence: `imp-token-decoded.json`.

## 6. Cross-endpoint check (`/customerOrders`)

`GET /api/order/customerOrders?customerId=...` returned **405 Method Not Allowed** — endpoint is POST-only, ruling it out for this check.

**Substituted with storefront xAPI GraphQL `{ me { ... } }`** against `https://vcst-qa.govirto.com/graphql` with the same IMP_TOKEN:

| Field | Value |
|---|---|
| HTTP status | **200 OK** |
| `me.id` | `ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (David) |
| `me.userName` / `me.email` | `test-david.kim-20260310@test-agent.com` |
| `me.contact.firstName` / `lastName` | David / Kim |
| `me.contact.organizationId` | `6fb516c1-07f3-4af4-be5e-35961e3f7993` (TechFlow) |
| Evidence | `post-revert-graphql-me.json` |

The token is fully operational on at least two independent backend surfaces (Platform REST `/api/platform/security/currentuser` + xAPI `/graphql`). This rules out a `/currentuser`-only cache misread.

## 7. Additional finding — survives operator sign-out

After the operator (John) clicked **Sign out** via the storefront account menu (`[data-test-id="sign-out-button"]`) and was redirected to `/sign-in`, the same IMP_TOKEN was replayed once more against `/api/platform/security/currentuser`:

- **Status: 200 OK** — `userName=test-david.kim-...` (full payload unchanged)
- Evidence: `post-operator-signout-currentuser.json`

This strengthens the root cause: the platform does NOT maintain a revocation list / reference-token store / impersonation-session table. **Tokens are validated by signature + `exp` alone.**

## 8. Evidence paths

All under `reports/regression/REG-2026-05-14-1543/imp-046-confirmation/`:

| File | Contents |
|---|---|
| `imp-token.txt` | Captured impersonation JWT (1827 chars) |
| `imp-token-decoded.json` | Decoded header + payload, exp/iat timestamps, all claims |
| `pre-revert-currentuser.json` | Step 5 sanity check — 200/David |
| `post-revert-currentuser.json` | Step 7 critical assertion — 200/David (expected 401) |
| `post-revert-graphql-me.json` | Cross-endpoint xAPI replay — 200/David with full profile |
| `post-revert-customerorders.json` | Order endpoint probe — 405 (method-only) |
| `post-operator-signout-currentuser.json` | After operator signed out — 200/David |
| `network-auth-calls.txt` | Filtered network log (token/impersonate/sign-out/revoke) |
| `network-revoke-search.txt` | Empty — proves zero revocation calls |
| `network-full.txt` | Full non-static network log |
| `01-menu-open-pre-revert.png` | Screenshot — David's account menu open, "Back to John Mitchell" visible |
| `02-post-revert-john.png` | Screenshot — post-revert UI: account label = John Mitchell, no impersonation banner |

Console log throughout the session (HAR via Playwright auto-capture): see `test-results/firefox/` for the per-page console transcripts referenced in tool output.

## 9. Root cause hypothesis (one-line)

**Frontend never calls revocation + backend has no impersonation-session bookkeeping** — `/connect/token` `grant_type=impersonate` mints a 30-min JWT that is server-trusted by signature + `exp` only; revert is a pure client-side token swap (re-mints a new operator token via the same `grant_type=impersonate` with `user_id=` empty), and the previously-issued David JWT remains valid for its full 30-min lifetime against every backend surface (Platform REST + xAPI GraphQL).

## 10. Severity rationale (Critical / P0)

- **BL-AUTH-007** (token lifecycle) and **BL-AUTH-011** (impersonation session integrity) are both violated
- **ECL-14.1** edge case (stale-token reuse after session change) directly hit
- VCST-4906 **AC#6 explicitly requires server-side invalidation** — not met
- Attack surface: any operator with `platform:security:loginOnBehalf` (CanImpersonate) who reverts mid-session leaves behind a ~30-min window where the impersonation token, if leaked (HAR, browser extension, dev-tools paste, network capture), authenticates as the target user from anywhere — no further operator action required, even an operator sign-out does not stop it
- Affects both Platform REST and xAPI surfaces (read+probable-write parity)

## 11. Recommended fix shape (for orchestrator awareness — NOT filed)

Backend: implement either (a) reference tokens with a revocation list checked on every authn, or (b) an impersonation-session record keyed by `(operator_id, target_id, oi_au_id)` and validated alongside JWT, with explicit teardown on revert / operator-signout / operator-token-refresh. Frontend: call the new revocation endpoint as part of `back-to-operator-row` click handler BEFORE swapping local tokens.
