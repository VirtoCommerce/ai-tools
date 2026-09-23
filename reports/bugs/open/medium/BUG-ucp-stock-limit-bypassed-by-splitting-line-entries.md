# UCP `create_cart` — stock limit is bypassed by splitting one quantity across line entries `[P2]` `[BL-CART-002]`

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1072.0-pr-3108-b6ef`, `VirtoCommerce.UCP` `3.1006.0-pr-7-612c`
**Surface:** MCP `POST {{FRONT_URL}}/ucp/mcp` → `tools/call` `create_cart` (anonymous, no credential)
**Found:** 2026-09-23, during the VCST-5378 suite-102 machine-lane pass. Re-verified live the same day with the control below.
**Case:** none yet — suite `102` records the OBSERVATION as `UCPA-035`; it does not assert this as a defect.

## Summary

`create_cart` validates each `line_items[]` entry against available stock **individually**, then merges
entries for the same `product_id` into one line **after** validation. The merged total is never
re-checked, so a quantity the API refuses in one entry is accepted when split across two.

The resulting cart holds **9 units of a product with 5 in stock** and `ucp.status` is `success`.
Top-level and cart-level `messages[]` are both **empty**; the only signal is a **line-level**
`PRODUCT_QTY_CHANGED` "The product available qty is changed" (`recoverable`) on
`cart.line_items[].messages`. That code names a different event — the quantity *changed*, not that it
*exceeds* stock — and it carries no available quantity, so it does not tell a caller what went wrong.
The over-stock line then carries into `create_checkout` unchallenged, priced.

> **Correction, 2026-09-23.** An earlier revision said `messages[]` was empty with "no warning of any
> kind" — overstated: that probe read only the ROOT array, never `cart.line_items[].messages`. The
> finding stands; the defect is a *misleading* signal at a level a caller may not read, not an absent
> one. The domain map's `D18` had this right; this file did not.

## The control — this is not "the product allows overselling"

Same product, same anonymous session, four requests. Back-office truth from
`POST /api/inventory/search`: **`inStock=5, reserved=0, allowBackorder=false, allowPreorder=false,
status=Enabled`** on `AGENT-TEST-East Coast Warehouse`.

| Request | `ucp.status` | Line in cart | `messages[]` |
|---|---|---|---|
| one entry, `quantity: 9` | `success` | **none — refused** | `PRODUCT_FFC_QTY` "Available quantity is 5." `recoverable` |
| one entry, `quantity: 6` | `success` | **none — refused** | `PRODUCT_FFC_QTY` "Available quantity is 5." `recoverable` |
| **two entries, `4` + `5`** | `success` | **one line, `quantity: 9`** | `[]` at root + cart level; line-level `PRODUCT_QTY_CHANGED` "The product available qty is changed" `recoverable` |
| **nine entries, `1` × 9** | `success` | **one line, `quantity: 9`** | `[]` at root + cart level; line-level `PRODUCT_QTY_CHANGED` "The product available qty is changed" `recoverable` |

The per-entry check works and is correctly configured. Only the aggregate is unguarded — and the
bypass is *quieter* than the blocked path, which reports an error.

## Steps to Reproduce

1. Pick a product with known low stock. On vcst-qa: SKU `QA-LOW-001` (`available_quantity: 5`;
   resolve its platform id live via `search_products` — the GUID is env-specific).
2. Confirm the back-office truth first: `POST {{BACK_URL}}/api/inventory/search` with
   `{"productIds":["<id>"],"take":20}` using a context-free admin token.
3. Anonymous MCP call, **no `Authorization` header**:
   ```json
   { "jsonrpc":"2.0","id":1,"method":"tools/call","params":{ "name":"create_cart","arguments":{
       "store_id":"{{STORE_ID}}",
       "line_items":[ {"product_id":"<id>","quantity":4}, {"product_id":"<id>","quantity":5} ] } } }
   ```
4. Read `quantity`, `ucp.status`, `messages`, `cart.messages` **and `cart.line_items[].messages`** —
   the last is the only place any signal appears.
5. Control: repeat with a single entry at `quantity: 9`, then `quantity: 6`. Both are refused.
6. Mint a handoff on the over-stock cart — `checkout_and_handoff` with `store_id`, `cart_id`,
   `buyer_id` and a `shipping_address` (it is REQUIRED; without it no `continue_url` is minted and
   the refusal is unrelated to stock). Returns `ok: true` and a `continue_url`.
7. Open the `continue_url` in a browser. It restores to `/cart/<cart_id>?ucp_handoff=1`.
8. Observe the line at quantity 9 beside "In stock 5", the error "You can order maximum 5 item(s)",
   and **Place order disabled**. Then select a delivery method and a payment method and confirm Place
   order STAYS disabled — that is what proves the block is the stock rule, not an unfinished form.

**Never paste a real `continue_url` anywhere** — it carries a live `ucp_session` bearer token (VCST-6053). Redact it.

## Expected vs Actual

**Expected** — the cart never holds more of a product than is available when the product forbids
backorder and preorder. Either the request is refused with `PRODUCT_FFC_QTY`, or the line is clamped to
5 with a `recoverable` message. `BL-CART-002`.

**Actual** — the cart holds 9. `ucp.status: success`, root and cart `messages: []`, and only a line-level `PRODUCT_QTY_CHANGED` that names the wrong event and omits the available quantity.

## Downstream — how far it travels, and where it is finally stopped

`create_checkout` on that cart returns `ucp.status: success`, `checkout.status: incomplete`, and the
snapshot carries **`line_items[…].quantity = 9` at `$134.91`**. Its only messages are
`handoff_required` (info) and `shipping_address_missing` (warning) — **nothing about stock**.

`checkout_and_handoff` **does** mint a `continue_url` for the over-stock cart (`ok: true`) once a
`shipping_address` is supplied — that argument is required, and an earlier probe that omitted it was
refused for the missing address, not for the stock overage. So nothing in the UCP chain declines the
over-stock line at any point.

**ESTABLISHED 2026-09-23 — the storefront DOES block the order. This is not an oversell.**
The handoff was minted and opened end to end (steps 6–8 below). The restored storefront cart shows the
line at **quantity 9** beside an **"In stock 5"** badge and a clear line-level error
**"You can order maximum 5 item(s)"**, and **Place order is disabled**.

The disable was then proved to be the STOCK rule and not an incomplete form: after selecting a delivery
method (`Fixed Rate (Ground)`) and a payment method (`Manual`), the *"Complete all required information
to proceed"* notice disappeared and shipping was costed (`+$150.00`, total `$284.91`) — and **Place
order remained disabled**, with only the stock error outstanding. Evidence:
`reports/bugs/screenshots/ucp-stock-limit-bypassed-by-splitting-line-entries/`
(`ucp-oversell-cart-qty9-vs-stock5.png`, `ucp-oversell-place-order-blocked.png`).

**So the defect is confined to the UCP/agent layer.** No revenue is at risk through the storefront. What
IS at risk is an agent acting on `create_cart` + `create_checkout`, both of which report `success` with a
priced, over-stock checkout snapshot, and neither of which surfaces the stock violation where a caller
reads it — the agent will tell the customer the order is ready and hand off to a checkout that can never
complete. This closes the UCP domain map's **G9**.

**Severity downgraded to `[P2]` / Medium** (`.claude/rules/reports.md` §1a — the lower reading, now
that order placement is proven blocked), and this file re-filed from `open/critical-high/` to
`open/medium/` to match. It was opened `[P1]` while the downstream gate was unproven.

## Not a duplicate — related, different mechanism

`BUG-cart-accepts-negative-quantity.md` / `BUG-cart-accepts-non-pack-multiple-quantity.md` are GraphQL
`changeCartItemQuantity` accepting **one invalid value verbatim**. This is a per-entry check correct in
isolation that **never aggregates** — fixing either would not fix this, and the surface differs. Checked
recursively across `reports/bugs/**`, by class not surface. Tracker: **VCST-6056**, related to VCST-6054.

## Suggested fix direction

Re-validate against stock **after** merging entries by `product_id`, or reject a payload that names the
same `product_id` in more than one entry. Whichever is chosen, the outcome must be reported at the
level a caller actually reads, with the code that names the real cause — `PRODUCT_FFC_QTY` and the
available quantity, as the single-entry path already does. A line-level `PRODUCT_QTY_CHANGED` is worse
than no message, because it describes an event that did not happen.

## Evidence

Re-verification transcript (control table above) produced 2026-09-23 against `vcst-qa`, anonymous
session, one product. `UCPA-035` in `regression/suites/Backend/ucp/102-ucp-agentic-commerce.csv`
records the observation; no case asserts the invariant yet, because no `BL-UCP-*` exists and
`BL-CART-002` is the delegated invariant this would violate.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **PASS** | Correctly refuses: "You can order maximum 5 item(s)", Place order disabled with delivery + payment both selected — `ucp-oversell-place-order-blocked.png` |
| 2. Backend Admin | **PASS** | `POST /api/inventory/search` reports the truth: `inStock=5, reserved=0, allowBackorder=false` |
| 3. GraphQL xAPI | N/A | not exercised — UCP calls XCart in-process, no storefront GraphQL request is involved in the split-entry path |
| 4. Platform REST API | **FAIL** | `POST /ucp/mcp` `create_cart` accepts the merged over-stock line; `create_checkout` then snapshots it priced |

**Owning layer:** Layer 4 — the UCP adapter's own cart write path.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST/MCP (UCP adapter)
- **Suggested repo:** `VirtoCommerce/vc-module-ucp`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** UCP cart service — the line-entry merge in the `create_cart` path
- **RCA anchor:** `UcpCartService` — the same class VCST-6054's own analysis names (`ReadCartLineItems` / `AddMessages`). Not confirmed by `search_code` this pass, so the anchor is inherited from VCST-6054's developer-written analysis, not independently derived.
- **Routing confidence:** MEDIUM — layer and repo certain; the exact method is not. The merge could live in the UCP request mapper *or* in XCart, and that decides between `vc-module-ucp` and `vc-module-x-cart`. Confirm before fixing.
