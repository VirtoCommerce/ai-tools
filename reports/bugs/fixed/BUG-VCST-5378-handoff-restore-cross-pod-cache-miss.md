# BUG — UCP handoff restore fails ~50% of the time: session cache is per-pod, not shared

**Ticket:** VCST-5378 (UCP — Authenticated User Flow) · **Severity:** High · **Status:** FIXED, verified 2026-09-22 (never filed as a separate tracker item — reported and fixed directly against the parent story)
**Env:** vcst-qa · **Date:** 2026-09-17 · **Layer:** cross-layer (vc-module-ucp + deployment)

## Verification — 2026-09-22 (`/qa-test VCST-5378` re-test)

Dev comment on VCST-5378 (2026-09-21) claimed: *"Verified handoff between two nodes, including
simultaneous requests and restarts. This requires a shared cache and distributed locking configured
by the host."* Re-measured live against vcst-qa, UCP module redeployed (`3.1006.0-pr-7-9bc9`,
storefront `2.58.0-pr-2467-89a3`):

- **Anonymous handoff, first-attempt restore: 10/10 = 100%** (up from 17/32 ≈ 53% / 20/41 ≈ 49% on
  2026-09-17), driven over raw MCP JSON-RPC against the storefront host, fresh never-opened sessions
  each trial. Correlation ids on the restore calls came from at least two distinct pod prefixes
  (`0HNOO3BU3E3JN`, `0HNOO3B981HJE`), so this is a genuine cross-pod result, not an artifact of one
  replica serving every request.
- **Authenticated handoff, live browser walk: 1/1 success** — signed in as
  `test-john.mitchell-20260310@test-agent.com` (B2B-store, org AGENT-TEST-Org-AcmeCorp), minted a
  cart ($1,100.00, Epson WorkForce WF-3640 ×11), `checkout_and_handoff`, opened `continue_url` fresh:
  landed directly on `/cart/{id}?ucp_handoff=1` with the exact cart, shipping address and total
  intact — no expired-link toast, no manual retry needed.

**Verdict: FIXED.** Root cause (per-process `IDistributedCache` fallback under two Platform pods) is
resolved — the fix note says "Redis is optional" but a shared cache + distributed lock is now
evidently wired on vcst-qa, since the miss this bug documented no longer reproduces at 10/10 and 1/1.

## Summary

A fresh, never-opened `continue_url` fails on its first and only legitimate use roughly half the time
with `400 {"code":"invalid_request","message":"ucp_session is invalid or expired."}`. The cart is intact
server-side; the buyer is told the link is expired or already used.

**Root cause:** the handoff payload is stored in `IDistributedCache`. The UCP module registers
`AddDistributedMemoryCache()` as a fallback, which is **per process**. `vcst-qa` runs **two Platform
pods**. `checkout_and_handoff` writes the session into the minting pod's memory; the restore request is
load-balanced independently, and a restore landing on the other pod finds nothing and returns 400.

## Evidence

**1. Reproduces with authentication entirely removed** — rules out identity, the 401 branch and buyer
binding. Anonymous flow driven over raw MCP JSON-RPC (`search_products` → `create_cart` →
`checkout_and_handoff` → `POST /ucp/v1/internal/handoff/restore`), first attempt on fresh sessions:

| Run | First-attempt success |
|---|---|
| n=8  | 4/8 |
| n=12 (via storefront) | 9/12 |
| n=12 (via platform)   | 4/12 |
| **total** | **17/32 ≈ 53%** |

**2. A "consumed" session came back.** Retrying one fresh token: attempt 1 → 400 "invalid or expired",
attempt 2 → **200**. A single-use session that was genuinely consumed cannot later succeed, so the 400 is
a lookup miss, not consumption.

**3. Same token, opposite result, differing only by pod** (App Insights, `requests` table):

```
11:44:23  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:25  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:25  RESTORE  vcst-qa-platform-7b9b7999d6-ssqc8  200   <-
11:44:27  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:27  RESTORE  vcst-qa-platform-7b9b7999d6-ssqc8  200   <-
```

Independently reproduced by a second agent on `playwright-edge`: a 4-trial mint/restore experiment
correlated **100%** — every restore on the minting replica returned 200, every one on the other returned
400, and a token that 400'd on the wrong replica returned 200 on the right one.

**4. No Redis exists.** `az redis list` over subscription `973d0b8c-44bf-438d-a4b7-1c4162d3ccba` returns
zero resources, so `IDistributedCache` can only be the per-process fallback. (A self-hosted in-cluster
Redis cannot be ruled out from the subscription listing alone — but the cross-pod miss in (3) already
proves that whatever is configured is not shared.)

**5. App Insights dependency telemetry proves the 400 is a cache MISS** — not expiry, not consumption,
not tampering. The module instruments the lookup, and the outcome is explicit:

```
12:53:22  VC distributed-cache GetHandoffSession   resultCode=miss      pod=…-j2wfv  op=6361f945…
12:53:22  UCP restore_handoff                      resultCode=http_400  pod=…-j2wfv  op=6361f945…

12:53:34  VC distributed-cache GetHandoffSession   resultCode=hit       pod=…-j2wfv  op=b7ca6dc0…
12:53:34  VC distributed-cache RemoveHandoffSession resultCode=success  pod=…-j2wfv  op=b7ca6dc0…
12:53:34  UCP restore_handoff                      resultCode=success   pod=…-j2wfv  op=b7ca6dc0…
```

A 401 is also a `hit` — the payload was found and is NOT consumed, which is why the documented
401→retry path is legitimate and why the retry needs a *second* successful lookup.

## What is proven, and what is inferred — read this before fixing

**Proven:** the failure is a cache **miss** (evidence 5), and the session was neither consumed nor expired
(evidence 2).

**Strongly supported, not conclusively proven:** that the miss is caused by *cross-pod partitioning*.
Evidence 3 (same token, 400 on one pod and 200 on the other within 2 s) and the independent 4-trial 100%
correlation are direct, and evidence 4 supplies the mechanism. **However**, one observed pair shows
`SetHandoffSession success` on `ssqc8` at 12:26:36 followed by `GetHandoffSession miss` on `ssqc8` at
12:27:24 — a miss on a pod that had performed a set. The telemetry carries **no cache key**, so those rows
cannot be proven to concern the same session, and adaptive sampling may hide intervening operations. TTL
expiry, eviction, or PR #7's cache-key change may be additional contributors.

**Therefore: validate the fix by re-measuring the first-attempt success rate, not by assuming Redis alone
closes it.** Expected after a shared cache: ~100%, anonymous and authenticated alike.

**5. {DOC} corroboration** — VirtoOZ, UCP Web API: the module registers `AddDistributedMemoryCache()` as
a fallback "so handoff works without Redis in local or single-node deployments. In production multi-node
deployments, the platform distributed cache should be Redis-backed so handoff restore works across nodes."

## The frontend is NOT at fault

`vc-frontend` PR #2467, `client-app/shared/checkout/ucp/handoff.ts`,
`requestUcpHandoffRestoreWithFallback`: a non-401 is rethrown with no retry, by design, and the
architecture comment on the ticket specifies exactly that. Retrying a 400 could not help — the payload is
not there to find. **A fix that hardens frontend retries would mask a lost session, not restore it.**

## Two further consequences

- **The single-use guarantee is unenforced across pods.** Restore is serialized through
  `IDistributedLockService`, which has the same per-process problem, so two concurrent opens on different
  pods are not mutually excluded.
- PR #7 changed the cache-key derivation (`prefix + token` → `prefix + SHA256(token)`), so any session
  minted by one build and read by another is a guaranteed miss during a rolling deploy.

## Expected vs actual

- **Expected:** a fresh `continue_url` restores on its single legitimate use, every time.
- **Actual:** ~50% return 400 and the buyer sees "This checkout link has expired, has already been used,
  or is unavailable in this tab" over an empty cart, while `get_cart` confirms the cart is intact.

## Suggested fix

Back `IDistributedCache` with Redis on every multi-pod deployment, and add a startup guard in the UCP
module that fails loudly (or warns) when handoff is enabled with a non-shared cache and more than one
instance — otherwise this degrades silently at ~1/N in production.

## Caveat on classification

The immediate remedy is deployment configuration, so this may be an environment defect rather than a code
defect. What is product-side is that the failure is **silent and misattributed**: the buyer-facing message
claims expiry/reuse for what is a cache miss.
