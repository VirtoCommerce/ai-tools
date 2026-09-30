# UCP `create_cart` — duplicate consolidation keeps the first id spelling, so a valid line is dropped when an uppercase id comes first `[Low]`

## Status: OPEN — below the filing floor, not in the tracker

**Env:** vcst-qa @ Platform `3.1073.0-pr-3121-9965`, `VirtoCommerce.UCP 3.1007.0-pr-9-91ca` (vc-module-ucp PR #9 @ `91ca741`, open)
**Surface:** MCP `POST {{FRONT_URL}}/ucp/mcp` → `create_cart` (anonymous); REST create-cart behaves the same
**Found:** 2026-09-29, verifying VCST-6056. A side effect of that fix, not of the original defect.

## Summary

PR #9 groups duplicate `line_items[].product_id` values case-insensitively but keeps the **first**
entry's spelling as the key it sends to XCart. The catalog lookup is case-sensitive, so when the
first entry uses an uppercase GUID the whole consolidated line resolves to no product. `create_cart`
then returns `success` with an **empty cart**, and a correctly spelled lowercase entry is lost with it.
Nothing is oversold, so BL-CART-002 holds.

## Steps to Reproduce

1. Resolve `@td(PROD_LOW_STOCK.sku)`'s id live via `search_products` (lowercase GUID, stock 5).
2. `create_cart` with `line_items: [{ product_id: <ID UPPERCASED>, quantity: 2 }, { product_id: <id>, quantity: 3 }]`.
3. Read `ucp.status`, `cart.line_items`, `messages[]`.
4. Control: swap the order (lowercase first).

## Expected vs Actual

| Payload | Expected | Actual |
|---|---|---|
| `[UPPER 2, lower 3]` (in stock) | one line of 5, or a refusal naming the unknown id | `success`, `line_items: []`, `CART_PRODUCT_UNAVAILABLE` |
| `[UPPER 4, lower 5]` (over stock) | `insufficient_stock` refusal | `success`, `line_items: []`, `CART_PRODUCT_UNAVAILABLE` |
| `[lower 4, UPPER 5]` | `insufficient_stock` | `insufficient_stock`, requested 9 / available 5 — correct |

The outcome depends on entry order. An uppercase id on its own already returns `success` with an
empty cart; that class is `reports/bugs/open/medium/BUG-ucp-create-cart-reports-success-when-lines-are-dropped.md`.
What is new here is that the valid lowercase entry is swallowed along with it.

**Why Low:** `search_products` returns lowercase ids, so an agent that copies ids from the API never
sends an uppercase one. Whether the pre-fix build kept the lowercase line is `{HYPOTHESIS}` — not
tested on the old build.

## Evidence

`reports/tickets/Sprint26-19/VCST-6056/evidence/VCST-6056-item09c-upperFirst_2plus3-run1.json`,
`…item09c-upperFirst_4plus5-run1.json`, `…item09b-uppercase-alone-and-valid-mixed-case-run1.json`,
`…item09-case-insensitive-grouping-run1..3.json`. API-only; no screenshot applies.

## Suggested fix direction

In `UcpCartService.ConsolidateDesiredItems`, group case-insensitively but send a spelling the catalog
resolves (normalise the id, or prefer a resolvable entry), or group case-sensitively.
