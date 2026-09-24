# UCP `create_cart` returns `ucp.status: success` when it silently dropped every requested line `[P2]`

**Env:** vcst-qa @ Platform `3.1072.0-pr-3108-b6ef`, `VirtoCommerce.UCP` `3.1006.0-pr-7-612c`
**Surface:** MCP `POST {{FRONT_URL}}/ucp/mcp` → `tools/call` `create_cart` (anonymous, no credential)
**Found:** 2026-09-23 (SBTM O7, VCST-5378). Three independent causes reproduced the same shape.
**Case:** `UCPA-025` in suite `102` — it asserts the CURRENT behaviour as `{OBSERVED}`, deliberately, so
the case passes today and will fail if the contract is tightened. That is a documented observation, not
an endorsement.

## Summary

`ucp.status` reports the **transport and request** outcome, never the **line** outcome. A well-formed
request whose every line was rejected returns `status: success` with an empty `cart.line_items[]`, and
the only signal is an entry in the top-level `messages[]` array.

An MCP client that branches on `status` — the obvious thing to branch on, and the field named `status` —
concludes the cart was built and proceeds to checkout with an empty or partial cart.

## Reproduced from three unrelated causes, all identical in shape

| Requested | `ucp.status` | `cart.line_items` | `messages[]` |
|---|---|---|---|
| a configurable parent SKU with required sections unset (`AGENT-TEST-Config-Phone-Case`) | `success` | `[]` | `CONFIGURATION_SECTION_REQUIRED` "Required sections are missing" `recoverable` |
| an all-zero `product_id` (`00000000-0000-0000-0000-000000000000`) | `success` | `[]` | `CART_PRODUCT_UNAVAILABLE` "…not longer available for purchase." `recoverable` |
| a quantity above available stock (`quantity: 6`, stock 5) | `success` | `[]` | `PRODUCT_FFC_QTY` "Available quantity is 5." `recoverable` |

Three different subsystems — configuration, catalog availability, inventory — and one indistinguishable
envelope. Nothing at the top level differs between "your cart is ready" and "nothing you asked for is in
it".

## The configurable case is the one an agent cannot foresee

`search_products` reports `AGENT-TEST-Config-Phone-Case` with **`product_type: "Physical"`**, not
`Configurable`. So an agent reading the catalog listing has no way to know the line will need a
configuration payload, adds it like any other product, and is told `success`. Confirmed live 2026-09-23.

## Steps to Reproduce

1. Anonymous MCP call, **no `Authorization` header**:
   ```json
   { "jsonrpc":"2.0","id":1,"method":"tools/call","params":{ "name":"create_cart","arguments":{
       "store_id":"{{STORE_ID}}",
       "line_items":[ {"product_id":"00000000-0000-0000-0000-000000000000","quantity":1} ] } } }
   ```
2. Read `body.ucp.status`, `body.cart.line_items.length`, `body.messages`.
3. Repeat with the configurable parent's live-discovered id (search `AGENT-TEST-Config-Phone-Case`), and
   with a quantity above a known stock figure.

## Expected vs Actual

**Expected** — one of: (a) `ucp.status` reflects that no requested line was created, e.g. `partial` /
`error`; or (b) the response documents, in the tool's own schema, that `status` is transport-only and
`messages[]` MUST be read on every call. Today the contract states neither.

**Actual** — `status: success` in every case above.

## Why this is P2 and not higher

The information is not lost: `messages[]` is populated, correctly coded and marked `recoverable` every
time, so a careful client can detect it and `UCPA-025` proves the signal is stable. This is a
contract-clarity defect, not data loss.

**It becomes worse in combination.** Where the dropped-line signal is absent *entirely* — a merged
over-stock line reports `success` with `messages: []` — the client has nothing at all to check; that is
filed separately as `BUG-ucp-stock-limit-bypassed-by-splitting-line-entries.md` and is the more serious
of the two.

## Open product question — this may be intended

No product answer exists yet on whether an MCP agent is *expected* to re-read `messages[]` after every
mutating call. VirtoOZ documents no UCP surface at all (UCP domain map `D8`), so there is no
documentation to appeal to and this must not be resolved by inference. Route to the module owner before
any fix: if it is intended, the tool's `description` and the generated contract
(`.claude/knowledge/api/ucp-schema.md`) should say so explicitly, which is a smaller change than
altering `status`.

## Evidence

Live probes 2026-09-23, anonymous session, `vcst-qa`. `UCPA-025` in
`regression/suites/Backend/ucp/102-ucp-agentic-commerce.csv` covers the first two causes and passes
against the current behaviour; the third (stock) is covered by the inventory block added the same day.
UCP domain map `D16` (`.claude/knowledge/domain/ucp.md`).
