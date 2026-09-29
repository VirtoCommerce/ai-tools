# BUG — UCP derives its public identity from request origin, so the platform host advertises an authenticated flow it cannot serve

**Ticket:** VCST-5378 (UCP — Authenticated User Flow) · **Severity:** Medium · **Status:** draft, not filed
**Env:** vcst-qa · **Date:** 2026-09-17 · **Layer:** vc-module-ucp (+ vc-platform OAuth)

## Summary

UCP is served on two hosts and answers every self-describing question from the **request origin** rather
than from a declared canonical host. Both hosts therefore publish a complete, self-consistent, authoritative
-looking discovery manifest — but only one of them can complete the authenticated flow, and nothing in the
discovery chain says which.

An agent pointed at the platform host can browse and build a cart, then dead-ends the moment the buyer says
"use my account", with an error naming nothing real.

## Back-office check (per the check-back-office-before-filing rule)

`Admin > Security > OAuth applications` — read via `/api/platform/oauthapps/search` and independently
confirmed against the Admin UI. Two applications; the UCP one is:

```
displayName   "Claude Desktop QA"
clientId      37bc5cf0-991d-4fc8-af82-9347d4ba39af   (public, consent: systematic)
redirectUris  ["http://localhost:8766/oauth/callback"]
permissions   rsrc:https://vcst-qa-storefront.govirto.com/ucp/mcp
              ept:authorization  ept:end_session  ept:token
              gt:authorization_code  gt:client_credentials  gt:refresh_token
              rst:code  scp:email  scp:profile
```

**The configuration is correct and deliberate** — registered for the storefront host, which is the host
that works. This is NOT a missing permission, and the fix is not to add one.

## The two hosts, side by side

| | platform `vcst-qa.govirto.com` | storefront `vcst-qa-storefront.govirto.com` |
|---|---|---|
| `/.well-known/ucp` service endpoint | itself | itself |
| protected-resource `resource` | itself | itself |
| `authorization_servers` | itself | itself |
| anonymous commerce | works | works |
| **authenticated flow** | **`400 invalid_target`** | **works** |

Verified working configuration — all three legs on the storefront host:
`token @ storefront/connect/token` (`iss` = storefront) + `resource` = storefront + MCP @ storefront
→ `link_buyer_identity` → `200 {"linked":true,"buyer_id":"61ef67a6-…","organization_id":"105c2c4e-…","identity_source":"platform_oauth"}`.
Any host mix fails: a platform-issued token with a correct storefront audience is still refused
`401 invalid_token`, because UCP validates issuer and resource path as well as audience.

## The self-contradiction — one response, two answers

`get_store_capabilities` called on the **platform** host returns, in the same payload:

```
storefront_origin       : https://vcst-qa.govirto.com             <- request origin, wrong
stores[B2B-store].url   : https://vcst-qa-storefront.govirto.com  <- the actual storefront
is_default              : false                                   <- no default store to fall back to
```

No configuration value can make those agree; `storefront_origin` is computed from the request, not from the
store. The same host confusion appears with opposite polarity in the handoff: the advertised
`handoff_url_template` points at the platform host while the issued `continue_url` points at the
storefront (`.claude/knowledge/domain/ucp.md` §D2).

## Expected vs actual

- **Expected:** the endpoint published by `/.well-known/ucp` supports the full flow, anonymous and
  authenticated — that is what a discovery manifest is for. A host that cannot serve the flow should not
  advertise it.
- **Actual:** two hosts advertise it, one cannot deliver it, discovery cannot distinguish them, and the
  failure surfaces as `invalid_target` at the token endpoint — an error that names neither the host
  problem nor the resource registry.

## Suggested fix

Resolve UCP's public identity from a **declared canonical host** (the store's own `url`, or explicit
configuration) rather than from request origin, and make the store's `url` authoritative for
`storefront_origin`, the manifest endpoint and `handoff_url_template` alike. Where a second host must keep
serving `/ucp/mcp`, either have it advertise the canonical host or refuse to serve the manifest at all.

## Severity reasoning

Graded **Medium**, not High: the working path exists, is configured, and is in daily use by the team, so
this does not block the story. It is graded no lower because the failure is silent, self-consistent and
authoritative-looking — the failure mode most likely to cost an integrator a day, on the exact flow this
ticket delivers.

## Re-test — 2026-09-22 (`/qa-test VCST-5378` re-test) — STILL REPRODUCES, dev fix claim not confirmed

Dev comment on VCST-5378 (2026-09-21) claimed: *"F2: Added `UCP:PublicOrigin` so discovery and OAuth
use the same public URL. It must match the resource allowed for the OAuth client."* Re-tested live
against vcst-qa (UCP module redeployed `3.1006.0-pr-7-9bc9`), and **the exact defect reproduces
byte-for-byte**:

1. **`tools/call get_store_capabilities` on the platform host** (`https://vcst-qa.govirto.com/ucp/mcp`,
   no auth) still returns `storefront_origin: "https://vcst-qa.govirto.com"` (itself, computed from
   request origin) while `stores["B2B-store"].url` in the **same payload** is
   `"https://vcst-qa-storefront.govirto.com"` — the identical self-contradiction as D2/F2 on
   2026-09-17, unchanged.
2. **`endpoints.handoff_url_template`** on the platform host still resolves to
   `"https://vcst-qa.govirto.com/checkout?ucp_session={token}"` — still the platform host, which does
   not serve storefront checkout.
3. **Token minting for the platform-host resource still fails.** `POST /connect/token` with
   `resource=https://vcst-qa.govirto.com/ucp/mcp` → `400 invalid_target` (identical to the original
   finding). The same request with `resource=https://vcst-qa-storefront.govirto.com/ucp/mcp` succeeds
   (`200`, `aud`/`iss` both storefront). Tested with the environment's admin credentials, not the
   registered "Claude Desktop QA" OAuth app specifically, so this confirms the **platform-side
   `resource` validation and discovery advertisement**, which is the part `UCP:PublicOrigin` was
   supposed to fix; it does not by itself re-confirm the one registered client's own `rsrc:` grant.

**Verdict: NOT FIXED.** Either `UCP:PublicOrigin` was not set on vcst-qa's deployed config, the fix
only reaches a different code path (e.g. the bare `/.well-known/ucp` manifest, which was already
request-origin-scoped and unaffected either way), or the fix did not ship in this build. The dev's own
fix note names the exact right mechanism; what's missing is confirmation it's actually wired for this
environment. **Recommend: re-open with the developer, and this time validate by re-running steps 1–3
above post-fix, not by code review alone** — this repo's rule (`.claude/rules/agents.md` §Product
context) is to observe before crediting a fix.

---

## Resolution — FIXED, verified 2026-09-22

**Build:** UCP `3.1006.0-pr-7-612c` · Platform `3.1072.0-pr-3108-b6ef` · storefront `2.59.0-pr-2467-1951`.
**Fix:** vc-module-ucp#7 adds `IUcpPublicOriginResolver` / `UcpPublicOriginResolver`, resolving
`UCP:PublicOrigin` -> the store's `SecureUrl`/`Url` -> request origin. `UcpProfileService.GetProfile`
now feeds ONE resolved origin into the discovery MCP url, `Auth.AuthorizationServer` and the
protected-resource-metadata url, and `UcpMcpBuyerAuthenticationMiddleware.HasExpectedAudience` reads the
same resolver — so discovery, the challenge and audience validation can no longer disagree.

Every row of the table above, re-measured on the **platform** host:

| Row | Was | Now |
|---|---|---|
| `/.well-known/ucp` service endpoint | itself | **storefront** |
| protected-resource `resource` | itself | **storefront** |
| `authorization_servers` | itself | **storefront** |
| `get_store_capabilities.storefront_origin` | itself, contradicting `stores[].url` | **storefront — agrees** |
| `endpoints.handoff_url_template` | platform host | **storefront** |
| authenticated flow | **`400 invalid_target`** dead end | **completes, `200`** |

**The chain was walked end to end starting from the platform host**, as an agent following discovery
would: manifest -> `link_buyer_identity` 401 challenge -> protected-resource metadata -> AS metadata ->
token at the advertised `token_endpoint` for the advertised `resource` (200, `aud` = the MCP url,
`iss` = storefront) -> `link_buyer_identity` with that token -> **200**, `linked:true`, correct
`buyer_id` and `organization_id`. No host mixing, no manual correction.

`POST /connect/token?resource=<platform>/ucp/mcp` still returns `400 invalid_target`. **That is no longer
the defect** — nothing advertises that resource any more, so an agent never asks for it, and refusing an
unregistered resource is correct OAuth behaviour.

**Correction of record.** A QA comment on 2026-09-22 at 11:09 reported F2 as *"NOT FIXED — reproduces
unchanged"* and recommended re-opening it. That was measured on UCP `pr-7-9bc9`; the environment moved to
`pr-7-612c` afterwards. The 11:09 verdict was correct for the build it saw and is wrong for the deployed one.

**Not closed by this:** the module is still unmerged, and `UCP:PublicOrigin` is not set as a Platform
Setting on this environment (only `UCP.Enabled`), so the origin currently resolves from the store URL.
A deployment whose store `Url`/`SecureUrl` is unset or wrong would fall through to request origin and
could reproduce the original symptom.
