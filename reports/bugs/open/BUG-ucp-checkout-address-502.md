# BUG — UCP agent checkout fails when writing a shipping address (`addOrUpdateCartAddress` 502) · High

**Env:** vcst-qa @ `https://vcst-qa-storefront.govirto.com/ucp/mcp` · `VirtoCommerce.UCP 3.1003.0-pr-4` (PR #4 artifact) · 2026-07-22
**Found by:** live UCP MCP probe during VCST-5504 review · **Repo:** [vc-module-ucp](https://github.com/VirtoCommerce/vc-module-ucp)

## Summary
Any UCP checkout tool that writes a shipping address — `checkout_and_handoff`, `create_checkout` (with address), `update_checkout` — fails with `xapi_execution_failed` / internal 502 on `addOrUpdateCartAddress`. Checkout creation *without* an address succeeds. This blocks the primary agentic-commerce flow: an AI agent cannot complete a physical-goods checkout handoff (which requires a shipping address), so **no `continue_url` is ever produced**.

## STR
Against live `/ucp/mcp` (MCP streamable-HTTP, anonymous buyer):
1. `create_cart` — `{store_id:"B2B-store", line_items:[{product_id:"b799e717-f9a3-49f9-9421-ef35d7299b6d", quantity:1}]}` → OK, returns `cart_id`.
2. Resolve geography: `resolve_country("United States")` → `USA`; `list_regions("USA")` → `NY`.
3. `checkout_and_handoff` — `{store_id:"B2B-store", cart_id, buyer_id, shipping_address:{first_name:"Agent", last_name:"Tester", line1:"123 Main St", city:"New York", region_id:"NY", country_id:"USA", postal_code:"10001"}}`.

## Expected vs Actual
- **Expected:** checkout advances; `checkout_and_handoff` returns a hosted-checkout `continue_url`.
- **Actual:** `{"is_error":true,"code":"xapi_execution_failed","status_code":502,"message":"Error trying to resolve field 'addOrUpdateCartAddress'."}`

## Isolation (proves real, not input error)
- Reproduces on a **fresh cart** and across **3 tools** (`checkout_and_handoff`, `create_checkout`+address, `update_checkout`+address) — not transient.
- Geography valid: `region_id` (`NY`) and `country_id` (`USA`) resolved via the module's own `list_regions`/`resolve_country`.
- `create_checkout` **without** an address **succeeds** (`status: incomplete`) → failure is exactly the address-write step.

## Root cause (evidence) — narrowed to UCP's in-process execution path
- Code path: [`UcpCartService.cs`](https://github.com/VirtoCommerce/vc-module-ucp/blob/dev/src/VirtoCommerce.UCP.Data/Services/UcpCartService.cs) `BuildAddressCommand`/`BuildAddress` → **`IXApiInProcessExecutor`** → xAPI `addOrUpdateCartAddress`. Payload is complete → not a malformed payload.
- **Differential test (2026-07-22) — the decisive evidence:**
  - `addOrUpdateCartAddress` **via the storefront HTTP xAPI (`/graphql`) SUCCEEDS** with identical inputs — tested with a **fabricated/non-existent `userId`**, both **with and without `cartId`**. Address saves, `addresses[]` returned.
  - The **same mutation via UCP's in-process executor FAILS** (502), reproducibly.
  - UCP's **other** in-process operations (`create_cart`, `update_cart`, `search_products`) **succeed**.
- **Therefore:** the bug is specific to **`addOrUpdateCartAddress` executed through UCP's in-process path** — NOT the environment (HTTP path works), NOT the anonymous `userId` (bogus id works via HTTP), NOT `cartId`/address shape. My earlier "anonymous userId" hypothesis is **refuted** by the differential test.
- **Likely internal cause (for dev):** the in-process execution context is missing something this specific resolver needs that other cart mutations don't (e.g. HttpContext/user principal, a DI-scoped service such as address/region validation, or a DataLoader) — reproduce by invoking `addOrUpdateCartAddress` through `IXApiInProcessExecutor` in a unit/integration test.
- `addOrUpdateCartAddress` **is present** in the deployed schema (134 mutations) — not a renamed/missing field.
- **App Insights (vcst-qa backend, RG `vcst`, 11:16–11:19 UTC):** failing `/ucp/mcp` calls return HTTP 200 (MCP wraps the error); **no `exceptions`/`traces` emitted** (observability gap); the failing op's `dependencies` show `AspNetUsers` + price/ES reads but **no cart-address write** → fails before persistence.

## Fix routing
- **Owner repo:** `vc-module-ucp` (kind: module / platform).
- **Investigate:** pod logs for the `addOrUpdateCartAddress` resolver exception at the timestamps above; whether the UCP anonymous buyer maps to a real platform user for cart-address persistence.
- **Add:** telemetry so UCP tool errors surface in App Insights (currently swallowed).

## REGRESSION — was working on 2026-07-15
The UCP scenario pack ("Scenarios for test B2B-store, UCP", updated 2026-07-15) records **D1 / D3 / D4 checkout+handoff as `[verified pass]`** (ship to Seattle WA → `continue_url` returned). Re-run 2026-07-22 against the same store: **D1 and D3 now FAIL** with the identical `addOrUpdateCartAddress` 502. So this is a **regression** introduced between 2026-07-15 and 2026-07-22 (the window in which the PR #4 UCP artifact + any platform bump deployed to vcst-qa; note the backend DB target is `vcst-qa-platform_restored`, i.e. a restored DB — a candidate cause). Dev should bisect that window.

## Scenario re-run summary (2026-07-22, B2B-store, 26 runnable scenarios)
**22 PASS · 2 FAIL · 2 CHANGED.**
- **FAIL:** D1 `checkout_and_handoff`, D3 `create_checkout`(+address) — both `addOrUpdateCartAddress` 502.
- **Passing around the failure:** D5 (missing name → clean 400) and D8 (missing postal → clean 400) confirm the module's own address validation works; only the xAPI persistence step fails.
- **CHANGED (improvement):** B1 `price_max` and B3 `price_min`+`price_max` **now return results** — the VCST-5339 KNOWN DEFECT (price filters unhandled) appears **fixed**; worth a separate verify/close.
- **PASS:** B2/B4/B5/B6/B7 (search & retrieval), all C (cart lifecycle: min-qty message, qty updates, remove, invalid coupon, consolidation $1,098.00, list_carts scoping), D2 (`hosted_checkout` available), all E (country/region).

## Severity
**High** — breaks the core UCP "buy" scenario end-to-end **and is a regression** from 2026-07-15; contradicts the VCST-5504 acceptance note "all scenarios should work properly". Recommend hotfix.
