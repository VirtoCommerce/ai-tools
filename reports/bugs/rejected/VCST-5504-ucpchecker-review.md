# VCST-5504 — UCP Checker Review & Conformance Verification

**Env:** vcst-qa @ `https://vcst-qa-storefront.govirto.com` · UCP module `VirtoCommerce.UCP 3.1003.0-pr-4` (PR #4 artifact) · Date: 2026-07-22
**Scope:** Review [ucpchecker.com](https://ucpchecker.com/check/vcst-qa-storefront.govirto.com) result + [Universal-Commerce-Protocol/conformance](https://github.com/Universal-Commerce-Protocol/conformance) categories against the **UCP 2026-04-08** spec — correct vs false positive — plus a live end-to-end probe of the UCP MCP endpoint. Detect-and-report only; no ticket transition, no fix.

---

## Verdict (TL;DR)

1. **The fix ([vc-module-ucp PR #4](https://github.com/VirtoCommerce/vc-module-ucp/pull/4)) works and is deployed.** `/.well-known/ucp` now matches the 2026-04-08 discovery shape; ucpchecker score is **85/100 (A)**. ✅
2. **The one remaining ucpchecker finding ("Publish keys at the manifest root") is CORRECT, not a false positive** — `signing_keys` is genuinely absent. It is a **roadmap item** (needs key management + HTTP Message Signatures), not a same-day hotfix. ⚠️
3. **NEW blocking bug found in the live probe:** the **agent checkout scenario is broken** — any UCP checkout tool that writes a shipping address fails reproducibly (`xapi_execution_failed` / HTTP 502 on `addOrUpdateCartAddress`). This directly contradicts "all scenarios should work properly" and should be a **hotfix**. 🔴

---

## 1. Manifest fix — CONFIRMED

Live `/.well-known/ucp` (public discovery document):

```json
{ "ucp": { "version": "2026-04-08", "status": "success",
  "services": { "com.virtocommerce.ucp": [{ "version":"2026-04-08","transport":"mcp","endpoint":"https://vcst-qa-storefront.govirto.com/ucp/mcp" }] },
  "capabilities": { "...catalog / .cart / .checkout / .order / .geography": [{ "version":"2026-04-08" }] },
  "payment_handlers": {} } }
```

Matches the spec: protocol keys nested under top-level `ucp`, MCP service advertised, 5 capabilities @ 2026-04-08, and legacy Virto fields (`ucp_version`/`platform`/`storefront_origin`/`stores`) correctly **excluded from the public doc** while still returned by the `get_store_capabilities` MCP tool. PR #4 also adds the JSON-only `tools/list` compat shim ucpchecker relies on — verified working (returns `application/json`, not `text/event-stream`).

## 2. ucpchecker findings — classified

| # | Finding | Verdict | Notes |
|---|---------|---------|-------|
| 1 | Manifest shape / discovery metadata | **Fixed / correct** | Was the original blocker; PR #4 resolved it → 85/100. |
| 2 | **"Publish keys at the manifest root"** (missing `signing_keys`) | **CORRECT — real, not a false positive** | Live manifest has no root `signing_keys[]`. Per the [UCP signatures spec](https://ucp.dev/specification/signatures/), the profile's dual purpose is capability declaration **+ publishing signing keys** for identity verification; businesses **must** sign webhook payloads with a key from `signing_keys`. Deduction is legitimate. **Roadmap, not hotfix** — requires JWK key generation/rotation + HTTP Message Signature support, which the module does not yet implement. |
| 3 | Agent Discovery 80 / Conformance 88 / Capability 87 | **Correct sub-scores** | Consistent with #2 (no signing keys → discovery/identity dinged) and payment handlers empty (capability coverage < 100). |

**Answer to the ticket question:** the checker results are **correct, not false positives.** The remaining 15 points are real, spec-grounded gaps.

## 3. Live MCP scenario probe — endpoint `POST /ucp/mcp`

MCP `initialize` negotiates protocol `2025-11-25`, server "Virto Commerce UCP Instructions", **16 tools** advertised. Results:

| Scenario / tool | Result |
|---|---|
| `initialize` handshake | ✅ |
| `tools/list` (normal + JSON-only compat) | ✅ 16 tools |
| `get_store_capabilities` | ✅ stores: B2B-store, Electronics (USD/en-US) |
| `search_products` (B2B-store) | ✅ priced results |
| `create_cart` (1 line item) | ✅ cart + pricing/tax/discount |
| `resolve_country` / `list_regions` (USA→NY) | ✅ |
| `create_checkout` **without** address | ✅ `status: incomplete` |
| `create_checkout` **with** shipping_address | 🔴 **502 `addOrUpdateCartAddress`** |
| `update_checkout` **with** shipping_address | 🔴 **502 `addOrUpdateCartAddress`** |
| `checkout_and_handoff` | 🔴 **502 `addOrUpdateCartAddress`** — **no `continue_url` produced** |

### 🔴 BUG — UCP checkout fails when writing a shipping address

**Severity:** High (blocks the primary agentic-commerce flow: an AI agent cannot complete a physical-goods checkout handoff, which the tool contract *requires* a shipping address for).

**STR** (against live `/ucp/mcp`, anonymous buyer):
1. `create_cart` with one physical product → OK (cart_id returned).
2. `checkout_and_handoff` (or `create_checkout`/`update_checkout`) with a **complete, valid** `shipping_address` (`first_name`, `last_name`, `line1`, `city`, `region_id:"NY"`, `country_id:"USA"`, `postal_code:"10001"`).
3. **Actual:** `{"is_error":true,"code":"xapi_execution_failed","status_code":502,"message":"Error trying to resolve field 'addOrUpdateCartAddress'."}`
4. **Expected:** checkout advances; `checkout_and_handoff` returns a hosted-checkout `continue_url`.

**Isolation (proves it's the address write, not input):**
- Reproduces on a **fresh cart** and across **3 different tools** — not transient.
- Not bad input: `region_id` resolved via `list_regions` (`NY`), country via `resolve_country` (`USA`); same failure.
- `create_checkout` **without** an address **succeeds** → the failure is exactly the address-write step.

**Code anchor:** `vc-module-ucp` → [`src/VirtoCommerce.UCP.Data/Services/UcpCartService.cs`](https://github.com/VirtoCommerce/vc-module-ucp/blob/dev/src/VirtoCommerce.UCP.Data/Services/UcpCartService.cs) → `BuildAddressCommand` / `BuildAddress` → in-process xAPI `addOrUpdateCartAddress`. The `BuildAddress` payload itself looks complete (sends `addressType`, `line1`, `city`, `regionId`, `regionName`, `countryCode`, `countryName`, `postalCode`+`zip`, names), so the 502 is a **server-side resolver failure**, not a malformed UCP payload.

**Root-cause hypotheses (for dev):**
- **Most likely:** anonymous UCP buyer (`ucp-anonymous-…`) has no valid platform `userId`, and the `addOrUpdateCartAddress` mutation resolver throws when persisting the address without a real user context (cf. the known "cart needs userId" checkout constraint).
- Alt: an xAPI/platform issue on the deployed build (mutation input contract drift).

**App Insights confirmation (vcst-qa backend, RG `vcst`, App ID `7d07a5e2…`, probe window 11:16–11:19 UTC 2026-07-22):**
- The `/ucp/mcp` calls that failed the checkout return **HTTP 200 at the transport layer** — MCP wraps the tool error in a 200 JSON-RPC body, so the "502" is only inside the payload. The failing calls are the slow ones (op `e6b787d5…` 3790ms @ 11:17:29, op `6eb9e9b1…` 603ms @ 11:19:03).
- **No `exceptions` and no `traces` rows** are emitted for the GraphQL failure → **observability gap**: the UCP module swallows the xAPI/GraphQL error and returns its own error model without logging telemetry. A dev debugging this must read pod logs, not App Insights.
- The failing operation's `dependencies` show repeated **`AspNetUsers … WHERE [Id]=@p`** lookups + price/ES reads but **no cart-address DB write** → the mutation fails in the resolver **before** persistence, which supports the anonymous-buyer `userId` hypothesis over a DB/contract fault.
- **Next step (dev):** inspect the platform pod logs for the `addOrUpdateCartAddress` resolver exception at those timestamps; add telemetry so UCP tool errors surface in App Insights.

## 4. Conformance suite ([Universal-Commerce-Protocol/conformance](https://github.com/Universal-Commerce-Protocol/conformance)) — expected mapping

Not executed live (needs pytest + simulation credentials + merchant fixtures). Predicted classification against what VC currently implements:

| Category | Expected | Basis |
|---|---|---|
| Protocol (discovery/services) | **PASS** | Manifest now spec-aligned (§1). |
| Binding / MCP transport | **PASS** | 16 tools list & execute over `/ucp/mcp`. |
| Checkout lifecycle | **FAIL** | §3 bug — address write blocks checkout. |
| Order | Partial | `track_order` present; unverified without a completed order. |
| Business logic | Likely PASS | Pricing/tax/discount returned correctly in cart. |
| Card credential / AP2 | **FAIL/SKIP** | `payment_handlers` empty — no handlers advertised. |
| Fulfillment | Unverified | Blocked by checkout bug. |
| Webhook | **FAIL** | No webhook signing (ties to #2). |
| Idempotency | Unknown | Needs dedicated run. |
| Validation / Invalid input | Likely PASS | Address input validated client-side; tool schemas enforce required fields. |
| Security (signatures / signing keys) | **FAIL** | No `signing_keys` / HTTP Message Signatures (#2). |

## 5. Recommendation — hotfix vs roadmap

**Hotfix (this sprint):**
- 🔴 Fix the `addOrUpdateCartAddress` 502 so the agent checkout/handoff scenario completes (the "all scenarios work" acceptance criterion is currently **not met**).

**Roadmap:**
- ⚠️ `signing_keys` at manifest root + HTTP Message Signatures (webhook signing, identity verification) → closes the 15-point ucpchecker gap and the Security/Webhook conformance categories.
- Advertise `payment_handlers` → Card credential / AP2 conformance + Capability Coverage to 100.
- Minor consistency note: cart/checkout operation envelopes still report legacy `ucp.version:"1.0"` with `dev.ucp.shopping.*` capability namespaces, while discovery advertises `com.virtocommerce.ucp.*` @ `2026-04-08`. Harmless today but worth aligning.

---
*Evidence: live probes via `POST /ucp/mcp` on 2026-07-22. Reproduction commands available on request. No JIRA transition performed.*
