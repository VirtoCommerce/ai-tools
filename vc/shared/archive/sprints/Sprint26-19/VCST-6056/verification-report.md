# VCST-6056 — Fix verification (UCP create_cart consolidates duplicate lines before stock validation)

**Verdict: VERIFIED — with 1 incidental finding (F1, Low) and 3 observations.** STR 3/3 (split 4+5) and 3/3 (nine×1).

**Env:** vcst-qa (TEST_ENV=vcst), direct HTTP from Node, anonymous, no browser, no order placed, no continue_url followed.
**Build (re-checked via `/api/platform/modules` at start):** VirtoCommerce.UCP `3.1007.0-pr-9-91ca` (vc-module-ucp PR #9 @ 91ca741) · XCart `3.1037.0-pr-141-fb27` · Inventory `3.1008.0` · Xapi `3.1023.0`.
**Fixture:** @td(PROD_LOW_STOCK.sku), id resolved live via `search_products`. Back-office truth (`POST /api/inventory/search`): 1 FFC, inStock **5**, reserved 0, allowBackorder false, allowPreorder false → **A = 5**. Nothing on the fixture was changed.

| # | Check | Result | Decisive fields |
|---|---|---|---|
| 1 | create_cart `[4, 5]` same product (MCP + REST) | **PASS 3/3** | MCP `isError:true`, `code:insufficient_stock`, `status_code:409`, `requested_quantity:9`, `available_quantity:5`; REST **409** same code/qty; no `cart`/`checkout` payload, no continue_url |
| 2 | create_cart nine × qty 1 | **PASS 3/3** | identical to #1: `insufficient_stock`, requested 9 / available 5, REST 409 |
| 3 | Control: single qty 9 / single qty 6 | **PASS** | qty 9 → same code, requested 9 / available 5 (split no longer changes the outcome); qty 6 → requested 6 / available 5; REST 409 both |
| 4 | Valid duplicates `[2, 3]` | **PASS** | `ucp.status:success`, exactly ONE line qty 5, `inventory_errors:[]`; get_cart same; admin cart has that product at qty 5 |
| 5 | update_cart on #4 cart → `[{id,4},{5}]` + checkout guards | **PASS** | update_cart `insufficient_stock` requested 9 / available 5, `line_item_id` preserved. get_cart: line **qty 9 persists** (documented non-atomic update, not filed); line `inventory_status:insufficient_stock`, `cart.inventory_errors` populated. create_checkout / update_checkout / checkout_and_handoff → `insufficient_stock` (MCP); REST handoff **409**; no continue_url anywhere |
| 6 | Correct same cart to qty 2 | **PASS** | update_cart success, line qty 2, `inventory_errors:[]`; create_checkout `success` (status `incomplete`); checkout_and_handoff `ok:true`, continue_url returned (REDACTED, not followed) |
| 7 | int32 overflow `[2147483647, 1]` | **PASS** | create_cart MCP `invalid_request` / `status_code:400`, "The combined line item quantity is out of range."; REST POST **400**; no `cart_id` in details. Same on update_cart (MCP + REST PUT 400), and the existing line stayed at qty 1 (get_cart + admin) |
| 8 | Mixed `[A 2, B 1, A 1]` | **PASS** | two lines: A = 3, B = 1 (MCP, get_cart, REST 200). B = product `201482`, available 932 (inventory: 510 + 422 + 0 over 3 FFCs) — run2; run1's B was coincidentally the store's gift-reward product (see O2) |
| 9 | Mixed case `[lower 4, UPPER 5]` | **PASS 3/3** | refused `insufficient_stock` requested 9 / available 5 (MCP + REST 409) — grouped case-insensitively, not two lines. **Order matters, see F1** |
| 10 | BL-CART-002 / ECL-2.1 across 1–9 | **PASS** | No path produced a line above 5 inside a success envelope from create_cart/update_cart. The only >5 line (qty 9 after a refused update in #5) is flagged `insufficient_stock` and every checkout/handoff path refuses it. Admin view of all 16 refused create_cart carts (#1–#3, MCP + REST): **0 items** |

## Incidental finding (not filed — for the PR #9 owner)

**F1 — consolidation keeps the FIRST spelling of a product_id, but the catalog lookup is case-sensitive, so the outcome depends on entry order. [Low]** {OBSERVED}
- `[UPPER]` alone → `ucp.status:success`, `line_items:[]`, `messages[]` `CART_PRODUCT_UNAVAILABLE` "…not longer available…" (this is the existing class in `reports/bugs/open/medium/BUG-ucp-create-cart-reports-success-when-lines-are-dropped.md`).
- `[lower 4, UPPER 5]` → refused, requested 9 (item 9).
- `[UPPER 4, lower 5]` → **success, empty cart**, `CART_PRODUCT_UNAVAILABLE` (MCP and REST 200).
- `[UPPER 2, lower 3]` (in stock, 5 total) → **success, empty cart**. The valid lowercase entry is lost because it was folded into the unresolvable uppercase key.
- Nothing is oversold, so BL-CART-002 holds. The pre-fix per-entry path would probably have added the lowercase entry {HYPOTHESIS: not tested on the pre-fix build}. Suggested fix: have `ConsolidateDesiredItems` key on the case-insensitive id but emit a spelling the catalog resolves (or normalise the id), or keep grouping case-sensitive. Evidence: `item09c-*`, `item09b-*`.

## Observations (not bugs)

- **O1 — duplicate entries in `details.errors[]` on update_cart refusals.** Two identical `insufficient_stock` entries for one line. This predates the fix: VCST-6054 evidence shows the same for a single-entry update (2 entries, MCP + REST). create_cart and checkout refusals list 1 entry.
- **O2 — UCP cart projection hides promotion gift lines.** On this store a promotion auto-adds a gift (`isGift:true`, price 0, SKU 566903892) to non-empty carts. `GET /api/carts/{id}` shows it; UCP create_cart/get_cart/checkout `line_items` do not. Totals are unaffected (price 0). Worth a product decision on whether agents should see gift lines before handoff.
- **O3 — latency.** create_cart with a valid line ~1.6 s, create_checkout ~1.8 s, checkout_and_handoff **2.66 s** (>2 s). Refusals are fast (130–290 ms).
- A refused create_cart still creates an **empty** cart (`details.cart_id`). This is the VCST-6054 contract ("The cart may still contain unfulfillable quantities").
- MCP ↔ REST parity held on every refusal code and quantity. There were no 5xx responses, no errors inside 200 responses, and no tokens or sessions in any payload.
- Docs (VirtoOZ, UCP Web API §Error model) do not list `insufficient_stock` yet. That is expected while PR #9 is unreleased, and it is a doc follow-up at release.

## Knowledge base (queued locally, not pushed)

Captured: KB-AC9F5E0C (duplicate consolidation), KB-8F33647E (case / first-spelling, F1), KB-B142F52E (non-atomic rejected update_cart + checkout guards), KB-E4DE692A (int32 overflow → invalid_request), KB-75BD84BE (gift lines hidden). Confirmed: KB-25388E6C (search_products `available_quantity` = back-office stock).

## Evidence — `reports/tickets/Sprint26-19/VCST-6056/evidence/`

`item00-backoffice-inventory-run1` · `item01-split-4plus5-run1..3` · `item02-nine-by-one-run1..3` · `item03-single-9-run1` · `item03-single-6-run1` · `item04-valid-duplicates-2plus3-run1` · `item05-update-cart-duplicates-overstock-and-checkout-guards-run1` · `item06-corrected-qty2-checkout-succeeds-run1` · `item07-int32-overflow-run1` · `item08-mixed-products-run1..2` · `item09-case-insensitive-grouping-run1..3` · `item09b-uppercase-alone-and-valid-mixed-case-run1` · `item09c-upperFirst_4plus5-run1` · `item09c-upperFirst_2plus3-run1` · `item10-refused-carts-backoffice-state-run1` (all prefixed `VCST-6056-`, `.json`). Authorization, tokens, continue_url and ucp_session values are redacted.

**Teardown:** anonymous carts only, none needed. The fixture's stock and backorder settings are unchanged. No Jira post, no transition, no suite or knowledge edits.
