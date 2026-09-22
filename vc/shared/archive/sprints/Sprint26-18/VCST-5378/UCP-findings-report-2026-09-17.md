# VCST-5378 — UCP Authenticated User Flow · findings report

**Date** 2026-09-17 · **Env** vcst-qa · **Store** B2B-store · **Tester** Elena Mutykova

**Build under test** — all three PRs open/unmerged, declared == deployed, confirmed live:
vc-platform #3108 `3.1071.0-pr-3108-016f` · vc-module-ucp #7 `3.1006.0-pr-7-1881` ·
vc-frontend #2467 `vc-theme-b2b-vue-2.58.0-pr-2467-8f0b`.

**Method** — driven over raw MCP JSON-RPC against `/ucp/mcp`, so every assertion lands on the wire.
Authenticated as `test-john.mitchell-20260310@test-agent.com` / org `105c2c4e-…`
(AGENT-TEST-Org-AcmeCorp-20260310). Isolated `cart_name` per scenario.

| # | Severity | Finding | Detail |
|---|---|---|---|
| F1 | **High** | Handoff restore fails ~50%; the session is a cache MISS | below + `reports/bugs/open/critical-high/BUG-VCST-5378-handoff-restore-cross-pod-cache-miss.md` |
| F2 | **Medium** | UCP identity derives from request origin; the Platform host advertises an authenticated flow it cannot serve | `reports/bugs/open/medium/BUG-VCST-5378-ucp-identity-derived-from-request-origin.md` |
| F3 | **Medium** | Checkout `status` is a hardcoded constant — org approval rules not implemented | below |
| F4 | **Medium** | Cross-account restore of an anonymous handoff returns HTTP 200 | below |
| F5 | **Low** | A missing required argument returns an unhandled error with only a trace ID | below |
| F6 | **Low** | Handoff cache telemetry records no cache key | below |

---

## F1 — Handoff restore fails ~50% of the time (High)

A fresh, never-opened `continue_url` returns
`400 {"code":"invalid_request","message":"ucp_session is invalid or expired."}`. The buyer sees *"This
checkout link has expired, has already been used, or is unavailable in this tab"* over an empty cart, while
`get_cart` confirms the cart is intact server-side.

**Measured first-attempt success**, fresh never-opened sessions:

| Flow | Result |
|---|---|
| Anonymous handoff | **20/41 ≈ 49%** (4/8, 9/12, 4/12, 0/4, 3/5) |
| Authenticated handoff | **3/11 ≈ 27%** (0/6, 3/5) |

The authenticated path is worse because the documented sequence is *anonymous attempt → 401 →
authenticated retry*, and the retry is an independently load-balanced **second** call needing a second
cache hit. `0.49² ≈ 0.24` predicts ~27%; measured 27%.

### Application Insights raw trace

App Insights component `vcst-qa` (RG `vcst`, subscription `973d0b8c-44bf-438d-a4b7-1c4162d3ccba`):

```kusto
dependencies
| where timestamp > ago(50m)
| where target has 'distributed-cache'
| project timestamp, name, resultCode, pod=cloud_RoleInstance, operation_Id,
          dims=tostring(customDimensions)
| order by timestamp asc
```

**Failing restore — the lookup misses, the operation ends 400:**

```
12:53:22  VC distributed-cache GetHandoffSession    resultCode=miss      pod=…-j2wfv  op=6361f94581ffe1e9363a19fa055e20fc
12:53:22  UCP restore_handoff                       resultCode=http_400  pod=…-j2wfv  op=6361f94581ffe1e9363a19fa055e20fc  success=False
```

**Succeeding restore — hit, then the session is consumed:**

```
12:53:34  VC distributed-cache GetHandoffSession    resultCode=hit       pod=…-j2wfv  op=b7ca6dc0ec962cd167bcbe65e5226485
12:53:34  VC distributed-cache RemoveHandoffSession resultCode=success   pod=…-j2wfv  op=b7ca6dc0ec962cd167bcbe65e5226485
12:53:34  UCP restore_handoff                       resultCode=success   pod=…-j2wfv  op=b7ca6dc0ec962cd167bcbe65e5226485
```

**A 401 is also a hit — the payload was found and is NOT consumed**, which is why the retry needs a second
successful lookup:

```
12:53:20  VC distributed-cache GetHandoffSession    resultCode=hit       pod=…-j2wfv  op=1c56c045d76da1912e11e35a092de951
12:53:20  UCP restore_handoff                       resultCode=http_401  pod=…-j2wfv  op=1c56c045d76da1912e11e35a092de951
```

Custom dimensions on a miss:

```json
{"AspNetCoreEnvironment":"Production","vc.dependency.outcome":"miss",
 "vc.dependency.component":"distributed-cache","vc.dependency.operation":"GetHandoffSession",
 "vc.dependency.system":"cache"}
```

**Same token, opposite outcome, differing only by pod** (`requests`, earlier window):

```
11:44:23  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:25  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:25  RESTORE  vcst-qa-platform-7b9b7999d6-ssqc8  200   <--
11:44:27  RESTORE  vcst-qa-platform-7b9b7999d6-j2wfv  400
11:44:27  RESTORE  vcst-qa-platform-7b9b7999d6-ssqc8  200   <--
```

### Proven vs inferred — read before fixing

**Proven.** The 400 is a cache **miss**, not expiry, consumption or tampering. A 400'd token succeeded on
the next call, which a consumed single-use session cannot. Single-use itself works: a genuinely restored
session returns 400 on replay, and all four tampered/forged token variants are rejected.

**Strongly supported — cross-pod partitioning.** Two Platform pods (`…-j2wfv`, `…-ssqc8`); **no Redis
resource in the subscription**, so `IDistributedCache` can only be the per-process
`AddDistributedMemoryCache()` fallback — which VirtoOZ documents as suitable for "local or single-node"
use, noting multi-node "should be Redis-backed so handoff restore works across nodes". A separate
browser-driven 4-trial experiment correlated 100% with the minting replica.

**Not conclusively proven.** One pair shows `SetHandoffSession success` on `ssqc8` (12:26:36) then
`GetHandoffSession miss` on `ssqc8` (12:27:24) — a miss on a pod that had performed a set. Telemetry carries
no cache key (F6), so those rows cannot be shown to concern the same session, and sampling may hide
operations. TTL expiry, eviction or PR #7's cache-key change may contribute. **Validate the fix by
re-measuring the first-attempt rate, not by assuming Redis alone closes it** — expect ~100% on both flows.

**The frontend is not at fault.** `handoff.ts` `requestUcpHandoffRestoreWithFallback` rethrows any non-401
without retry, exactly as the architecture notes specify. Retrying a 400 cannot help — the payload is not
there to find.

**Fix.** Back `IDistributedCache` with Redis on every multi-pod deployment; add a startup guard so UCP fails
loudly when handoff is enabled with a non-shared cache and >1 instance. Related: single-use is **unenforced
across pods** (`IDistributedLockService` has the same per-process limit), and PR #7's cache-key change
(`prefix + token` → `prefix + SHA256(token)`) makes a session minted by one build and read by another a
guaranteed miss during a rolling deploy.

---

## F3 — Checkout `status` is a hardcoded constant (Medium)

`UcpCheckoutService.cs` on `feat/VCST-5378-unified-buyer-flow`: `CreateCheckout` (l.69) and
`UpdateCheckout` (l.98) set `incomplete`; `HandoffCheckout` (l.141) and `RestoreHandoff` (l.248) set
`requires_escalation`. No approval, threshold or spending-limit logic exists in the service. Live: a
**$5,133.32** org cart returned `"incomplete"` with no approval vocabulary in the payload; back office shows
no approval rule or spending limit configured for store or org.

So org approval rules are **not implemented** in UCP, and `requires_escalation` is emitted unconditionally
on every handoff — an assistant would tell every buyer their order needs approval regardless of amount.
*This corrects an earlier reading of mine on the ticket that took a `requires_escalation` value at $1,535.99
as evidence the approval workflow worked. It is a constant.*

## F4 — Cross-account restore of an anonymous handoff returns 200 (Medium)

A different authenticated buyer restoring another buyer's **anonymous** handoff succeeds at the UCP layer
(3/3 trials, HTTP 200). No cart data leaks — the body carries `{"errors":[{"message":"Access denied.",
"extensions":{"code":"Forbidden"}}],"data":{"cart":null}}`, so XCart's authorization holds. But UCP's own
session binding does not refuse it and the endpoint answers 200 on a denied request. Defence-in-depth gap
plus a misleading status code, not an exposure. Only decidable by retrying past F1, since a 400 from that
endpoint is currently overloaded.

## F5 — A missing required argument returns an unhandled error (Low)

`"UCP operation failed unexpectedly."` plus a bare trace ID, while every other malformed input returns a
structured error. Confirmed on three tools: `create_cart` without `line_items`, `get_payment_handlers`
without `checkout_id`, `list_regions` without `country_id`. By contrast a misspelled `productId` returns
`{"code":"invalid_request","message":"line_items[].product_id is required."}`, and empty array / `quantity:
0` / `quantity: -5` all return precise errors. The caller is an LLM, so a missing required property is the
likeliest malformed call and the one case with no usable error. Separately, an unknown `store_id` reports
`"context.currency is required when UCP:DefaultCurrency is not configured."`, misattributing the cause.

## F6 — Handoff cache telemetry carries no cache key (Low, observability)

`GetHandoffSession` / `SetHandoffSession` / `RemoveHandoffSession` record `vc.dependency.outcome`
(`hit`/`miss`/`success`) but no cache key, session id or cart id, so a mint cannot be correlated to its
restore — precisely the correlation needed to settle F1 from telemetry alone. Adding a hashed key or the
cart id as a custom dimension would make this class of defect diagnosable without a live repro. Relevant to
VCST-5544 (Logging in UCP).

---

## Execution results

**`vcst-5378-test-cases.xlsx`** (20 cases, re-run from scratch, results written back into the workbook):
**11 Pass · 2 Fail · 1 Blocked · 6 Not Run**. Fails are TC-17/TC-18 (F1). The 6 Not Run depend on which
tool Claude chooses, which the server does not enforce — they need a configured UCP MCP client.

**B2B-store UCP scenario suite** (A/B/C/D/E + keyword sets): **31 Pass · 2 Fail · 1 Blocked** —
discovery 2/2 · search 7/7 · cart 9/9 · checkout 6/7 · country/region 5/5.

**Verified working.** Identity integrity is well built: spoofed anonymous `buyer_id`, foreign real
`buyer_id` and legacy `X-Buyer-*` headers are each rejected `403 buyer_context_mismatch`; audience, issuer
and resource path are all validated; anonymous ids match `ucp-anonymous-<32 hex>`; the
anonymous→authenticated merge carries items across at the same total and consumes the source cart with no
orphan; no order-placement or payment-execution tool exists.

**Two previously-logged defects are FIXED** — `search_products` with `price_min`/`price_max` no longer
errors, so the 2026-07-15 note blocking B1/B3 can be retired.

## Not verifiable on current fixtures — data gaps, not verdicts

- **Contract pricing.** Anonymous and org prices identical across 5 fixtures; catalog totals identical
  (4,550/4,550). No contract binds org `105c2c4e-…`; **0 of 99** price-list assignments condition on its
  groups (`Premium Customers`, `store-acme`); **0** target the fixtures' catalog `3b0e9125-…`;
  `pricelists/evaluate` returns an identical set with and without those groups. Needs org price ≠ list price.
- **Assortment scoping** — same situation. **PO / invoice** — not testable at the UCP layer by design;
  verify after handoff in the storefront. **C5 coupon** — none seeded on B2B-store.

## Test-case defects corrected in the workbook

| Case | Defect | Fix |
|---|---|---|
| TC-01 | asks to add **one** WF-3640; that SKU has min order qty **11–13**, so it could never pass | now asks for eleven; expected result documents the rule |
| TC-04, TC-05 | target **`B2C-store`**, which does not exist (B2B-store, Electronics, QA-STORE, test_del, TS-FULL-001) | retargeted to B2B-store |

The `B2C-store` error is inherited from the ticket's own *QA Steps — Claude* comment.
