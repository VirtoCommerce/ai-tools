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
