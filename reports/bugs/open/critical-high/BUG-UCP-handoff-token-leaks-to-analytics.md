# BUG — the raw `ucp_session` handoff token leaves the browser in cleartext to Google Analytics, and is retained in Virto's own telemetry

**Filed as:** VCST-6053 (standalone Bug, High, relates-to VCST-5378) · **Severity:** High · **Status:** FILED 2026-09-22, evidence HAR attached
**Env:** vcst-qa · **Date:** 2026-09-22 · **Layer:** vc-module-ucp (URL design) + vc-frontend (landing page)
**Build:** UCP `3.1006.0-pr-7-612c` · Platform `3.1072.0-pr-3108-b6ef` · storefront `2.59.0-pr-2467-1951-195127f5`

## Summary

The UCP handoff link carries its bearer secret in a **query string**:
`handoff_url_template = https://<storefront>/checkout?ucp_session={token}`.

When the buyer opens that link, the storefront's GA4 tag beacons the document location (`dl`) and
referrer (`dr`) to `region1.google-analytics.com` — **including the raw `ucp_session`**. The
Application Insights JavaScript SDK auto-collects that outbound request as a dependency, so the same
secret is also written into Virto's own `vcst-qa-storefront` telemetry store (default 90-day retention).

`ucp_session` is a 256-bit opaque bearer key that restores a specific buyer's cart. Anyone holding it
can restore that handoff until it is consumed or its TTL expires.

## The token is still LIVE when it leaves

This is the part that makes it more than a hygiene issue. From the session HAR, in request order, for
one handoff (token redacted to its first 8 chars):

```
15:45:17.984  GET  200  <storefront>/checkout?ucp_session=gnO3ErH5…   the buyer opens the link
15:45:19.165  POST 401  <storefront>/ucp/v1/internal/handoff/restore  anonymous attempt — does NOT consume
15:45:19.190  POST 204  region1.google-analytics.com/g/collect        ← TOKEN LEAVES, 25 ms later
15:45:21.079  POST 200  <storefront>/ucp/v1/internal/handoff/restore  consumed — 1.889 s AFTER it left
15:45:24.266  POST 204  region1.google-analytics.com/g/collect        still carried, now in `dr`
15:45:40.387  POST 204  region1.google-analytics.com/g/collect        still carried
```

The restore flow is anonymous-first and retries only on 401 — **by design, a failed restore does not
consume the token**. So a handoff the buyer abandons (closes the tab, fails to sign in) stays **valid**
in Google's and Virto's stores for its entire TTL, not merely recorded after the fact.

## Evidence

**1. Session HAR** — `test-results/edge/har/session.har` (2,559 entries). URLs containing `ucp_session`:

| Host | Entries |
|---|---|
| `region1.google-analytics.com` | **74** |
| `vcst-qa-storefront.govirto.com` | 19 |

A redacted 12-entry slice covering the sequence above is attached as
`reports/bugs/evidence/VCST-5378-ucp-session-ga-leak.har` (28 KB). The token is reduced to its first
8 characters in that file; the full value appears only in the untrimmed session HAR.

**2. Application Insights** — component `vcst-qa-storefront`, table `dependencies`, 6-hour window:

```kusto
dependencies
| where timestamp > ago(6h)
| summarize total=count(),
            ucpSession=countif(data contains 'ucp_session' or name contains 'ucp_session'),
            encodedUcp=countif(data contains '%3Fucp' or data contains '%26ucp')
```

| total | rows containing `ucp_session` | URL-encoded `%3Fucp`/`%26ucp` |
|---|---|---|
| 16,463 | **141** | 186 |

Sample row: `target = region1.google-analytics.com`, value in the **`dl` (document location)**
parameter, `ucp_session%3DImwbJU…`.

> **Query note, because it cost a wrong conclusion once.** KQL `has` is **term-based** and misses a
> URL-encoded `%3Fucp_session%3D`; the first pass with `data has 'ucp_session'` returned **0 rows** and
> looked like a clean result. Use `contains` (substring). The Platform component `vcst-qa` is genuinely
> clean — the restore call carries the token in the request **body**, not the URL.

## What is NOT the problem

- **The `key_hash` telemetry dimension is fine.** `vc.ucp.handoff.key_hash` is an unsalted uppercase-hex
  SHA-256 of a 256-bit token — not brute-forceable, and a sound correlation id. It is the fix for F6 and
  should stay.
- **The Platform-side telemetry is clean.** 0 rows across `requests`/`dependencies`/`exceptions`/`traces`
  on `vcst-qa`.
- **This is not a GA4 configuration mistake.** GA4 reporting the document location is what GA4 does.

## Root cause

**The secret is in a query string.** Query strings are copied into `Referer` headers, analytics payloads,
CDN and proxy access logs, browser history and bookmarks. Any one of those is enough; the GA leg is
simply the one observable here. Scrubbing App Insights would leave the Google leg untouched, and
scrubbing both would leave browser history and any future third-party tag.

## Suggested fix — ordered by how much of the class each closes

1. **Move the token out of the query string.** A URL *fragment* (`#ucp_session=…`) is never sent to a
   server and never appears in `Referer`; the storefront already reads and strips the value client-side.
   Cheapest change that closes the whole class.
2. **Or exchange it server-side:** `continue_url` carries a short-lived opaque *reference*, and the
   storefront POSTs it for the real session. The storefront already does something adjacent — it rewrites
   `?ucp_session=<token>` to `?ucp_resume=<uuid>` and parks the token in `sessionStorage` — so the
   pattern exists; it just happens **after** the token has already been in the address bar.
3. **Consume on first touch.** The anonymous-first/401-retry design means the token survives a failed
   restore. Narrowing that window reduces exposure but does not close the class on its own.
4. **Shorten the TTL** — mitigation only.

## Reproduction

1. Mint a handoff: MCP `checkout_and_handoff` at `POST {FRONT_URL}/ucp/mcp` → note `continue_url`.
2. Open `continue_url` in a browser with the network log recording.
3. Observe `POST region1.google-analytics.com/g/collect` with `dl=` (and later `dr=`) containing the
   URL-encoded `ucp_session`.
4. Query `vcst-qa-storefront` App Insights `dependencies` with **`contains 'ucp_session'`** — the same
   value is retained server-side.

## Notes

- Found during `/qa-test VCST-5378` round 1, 2026-09-22. Not previously reported on that ticket.
- The story's own verdict was set to PASS WITH NOTES by operator decision; this is tracked separately
  rather than blocking it.
- Mitigating, and worth stating so the severity is not over-read: the token is single-use, has a short
  TTL, and this build correctly refuses a *different* buyer with `403 buyer_context_mismatch`. The
  finding is the cleartext transmission of a live bearer credential to a third-party processor, not a
  demonstrated account takeover.
