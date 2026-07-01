# VCST-5126 — UCP MVP · Testing Checklist (MCP `vc-ucp` tools)

Scope: Universal Commerce Protocol MVP — Claude drives **discovery → search → cart → checkout → handoff → order tracking** through the `vc-ucp` MCP tools, B2C happy path **and** B2B variant. Env: **vcst-qa** (`https://vcst-qa-storefront.govirto.com`). Status: Testing.

## How to test (applies to every case)
- **Driver = natural-language buyer prompt** to Claude with the `vc-ucp` MCP server connected to vcst-qa. Assert *which* tool fires, *with what args*, and the *shape/values* of the response. These are agentic tools — no `.spec` files. Only browser hop is the `continue_url` handoff (use `playwright-chrome` / Edge).
- **`store_id` is REQUIRED on every catalog/cart/checkout call** — discovery returns `default_store_id: null` with 5 stores. Use `B2B-store` (in-stock printers, the storefront origin) or `Electronics` (B2C-style, phones). Omitting it → `missing_store_id`.
- **Money is minor units** — USD $150 = `15000`. Top off-by-100 risk; assert units explicitly. Watch `price` (sell) vs `list_price` (was) — they differ on discounted SKUs.
- **No hardcoding in assertions** — resolve product ids at runtime via `search_products(query)`; the codes/prices below are *current live references* (fetched 2026-06-25) to make scenarios concrete, not values to assert exactly. Catalog drifts.
- **`addItem` settles async** — line items may be empty on the create/update response; re-read with `get_cart`.
- **`ucp_session` is a short-lived handoff token** — never used for order tracking; expiry after checkout is expected.
- Capture the tool-call transcript as evidence; HAR only on the storefront handoff leg. READ-ONLY on JIRA/GitHub; creds from `.env`.

## Live catalog reference (vcst-qa, fetched 2026-06-25 — verify at runtime)
| Role in scenarios | Store | Product | Code | id (may drift) | price / list | stock |
|----|----|----|----|----|----|----|
| Primary buyable item | B2B-store | Xerox WorkCentre 6515/DN | `565196699` | `aad7a78a899048d6b21e646887bddaa6` | $549.00 | 18,982 ✅ |
| Sale≠list price probe | B2B-store | Epson WorkForce WF-3640 | `553684135` | `1c2eaea0a391492ca1045a42d598692e` | **$100.00** / list $199.99 | 920 ✅ |
| Under-$150 / 2nd "gift" line | B2B-store | Epson WorkForce WF-2750 | `555929564` | `28a40a7733614e45a22a9f2386b1db3e` | $99.99 | 816 ✅ |
| Under-$150 alt | B2B-store | Xerox WorkCentre 3335DNI | `55557702` | `4b729fae613046448aaba7c265bb4f2d` | $99.99 | 361 ✅ |
| **Out-of-stock** negative | Electronics | Samsung Galaxy S6 SM-G920F | `SAG920F32GBB` | `7c835a9b1c8e4445aa118dae659231c3` | $599.00 | **0 ❌** |
| **Variant** picker (color) | Electronics | ASUS ZenFone 2 ZE551ML 16GB | `ASZF216GBSL` | `8b7b07c165924a879392f4f51a6f7ce0` | $99.99 | 0 ❌ (3 color variants) |
| Variant picker (color) | Electronics | Samsung Galaxy S6 | `SAG920F32GBB` | `7c835a9b1c8e4445aa118dae659231c3` | $599.00 | 0 ❌ (Gold/White) |

> Note: on this build **B2B-store printers are in stock** (use for cart/checkout E2E) and **Electronics phones are out of stock** (use for out-of-stock/variant-without-buy cases). `search "printer"` in B2B-store → 34 hits; `search "phone"` in Electronics → 13.

## 0. Pre-flight — capability facts confirmed on vcst-qa (2026-06-25)
- [x] `get_store_capabilities` → `ucp_version 1.0`, capabilities `[catalog, cart, checkout, order, geography]`; `default_store_id: null` (multi-store → pass `store_id`).
- [x] **Payment handlers: only `hosted_checkout` is `available`.** `native_card` + `google_pay` = `not_available`. **No `purchase_order`/`invoice` handler exists on this build** → §G3/§G5 are **DEFERRED (record, don't FAIL)**.
- [x] **Buyer delegation = `buyer_context_headers`** (`X-Buyer-User-Id` / `X-Buyer-Organization-Id`), **not OAuth/OIDC** → there is no `begin_buyer_authorization`; B2B is header/param-scoped (`buyer_id` / `organization_id` tool args).
- [x] Error schema `ucp_error`, codes: `invalid_request, missing_store_id, product_not_found, cart_not_found, order_not_found, xapi_execution_failed`.
- [x] Handoff template: `…/checkout?ucp_session={token}`; headers `X-Correlation-Id`, `Idempotency-Key`, `X-Agent-Api-Key`.

## A. Discovery & capabilities
- [ ] **A1** "What can I buy here?" → `get_store_capabilities` returns the profile, capability set, payment handlers, and the 5 stores.
- [ ] **A2** Multi-store, no store_id → agent must pick/echo a `store_id` (no silent default); cart/checkout without one → `missing_store_id`.
- [ ] **A3** Wrong/unreachable `base_url` → structured `ucp_error`, no raw stack trace.

## B. Product search & retrieval
- [ ] **B1** "find a printer under $150" → `search_products(query="printer", store_id="B2B-store", price_max=15000)`; all hits ≤ 15000 minor units (expect WF-2750 / 3335DNI @ $99.99); `total_count`/`has_next_page` present.
- [ ] **B2** "details of the Xerox 6515" → `get_product(id, store_id)` returns price, image_url, availability (qty), attributes, variations.
- [ ] **B3** Price band "$200–$600" in B2B-store → both bounds honored (expect Xerox 6515 $549, exclude $99 printers).
- [ ] **B4** Zero-match query ("flux capacitor") → empty `products`, no error.
- [ ] **B5** Variant query: "ASUS ZenFone 2, what colors?" in Electronics → `search_products`/`get_product` returns `variations[]` with Black/Red/Gold + per-variant ids; agent can pick one.
- [ ] **B6** **Sale-vs-list**: `get_product` on Epson WF-3640 → `price.amount=10000` while `list_price.amount=19999`; agent reports the $100 sell price, not list.
- [ ] **B7** Resilience: a product seeded only in the physical catalog is absent/404 (`product_not_found`) — confirms virtual-catalog linkage.

## C. Cart lifecycle
- [ ] **C1** "Add the Xerox 6515" → `create_cart(store_id="B2B-store", line_items=[{product_id, quantity:1}])` returns `cart.id`, `buyer_id`, lines, totals, `continue_url`.
- [ ] **C2** "Add an Epson WF-2750 as a gift" → `update_cart` sends the **complete desired** line_items (not a delta); 2 lines present.
- [ ] **C3** "Make it 3 Xerox" → `update_cart` (keep line id, qty=3); quantity + subTotal update.
- [ ] **C4** "Remove the Epson" → `update_cart` (omit line OR id+qty=0); totals recompute.
- [ ] **C5** "Apply code `@td(<live coupon>)`" → `update_cart(coupons=[…])`; discount + promo message in totals. *(Confirm a live promotion/coupon exists on B2B-store first; otherwise treat as data-prep.)*
- [ ] **C6** Invalid coupon ("BOGUS123") → rejected with message; cart stays valid (no crash).
- [ ] **C7** "What's in my cart?" → `get_cart(cart_id, store_id)` returns lines, totals, coupons, tax/promo messages, continue_url.
- [ ] **C8** Same product twice (B2B-store): add Xerox 6515 in `create_cart`, then again via `update_cart` → ONE consolidated line, summed qty; assert via `subTotal` (≈ 2×$549), NOT `itemsCount`.
- [ ] **C9** "Show my carts" → `list_carts(buyer_id, store_id)`; buyer-scoped; **rejects missing buyer_id**.
- [ ] **C10** Async settle: `create_cart` → immediate response may have empty lines → `get_cart` re-read shows the item.
- [ ] **C11** Change-cart contract: agent reuses `cart.id`+`buyer_id` via `update_cart`, never `create_cart` as a fallback.

## D. Checkout, payment handlers & handoff
- [ ] **D1** "Check out, ship to 1 Main St, Seattle WA 98101, for Jane Doe (jane@example.com)" → `resolve_country`→`list_regions`→`checkout_and_handoff`; country normalized to `USA`, region_id for WA resolved, returns `continue_url` (does NOT stop at the snapshot).
- [ ] **D2** "What can I pay with?" → `get_payment_handlers(checkout_id)` returns exactly `hosted_checkout: available` (native/google_pay `not_available`).
- [ ] **D3** Two-step: `create_checkout` (may omit continue_url) → `handoff_checkout` mints signed token + continue_url.
- [ ] **D4** "Change the shipping address" → `update_checkout` → `handoff_checkout` again returns a **fresh** continue_url.
- [ ] **D5** Address with **no recipient name** → agent asks "who is the order for?" before proceeding (first_name/last_name required).
- [ ] **D6** Negative: delivery address must parse into `shipping_address`, never `notes`.
- [ ] **D7** Open `continue_url` in browser → storefront resolves `ucp_session` token → restores the **exact** cart → normal Virto checkout UI; cart contents match the UCP cart. (Datatrans redirect to `/checkout/payment` is by-design, not a defect.)
- [ ] **D8** Missing `postal_code` → agent asks for ZIP before checkout.

## E. Country / region resolution
- [ ] **E1** "Ship to Kazakhstan" → `resolve_country("KZ")` → `KAZ` (platform id, not invented).
- [ ] **E2** "United States, Washington" → `resolve_country`→`list_regions("USA")` returns regions; correct `region_id` for WA.
- [ ] **E3** Country with no regions → empty region set handled; city stays free text.
- [ ] **E4** ISO2 passed straight into `country_code` → accepted, normalized via platform `ICountriesService`.
- [ ] **E5** `list_countries(query="United")` → filter works, respects limit.

## F. Order tracking
Live orders reference (B2B-store, fetched 2026-06-25 — UCP-originated, `ucp-anonymous-*` buyers; statuses change, re-fetch via `get-orders`):
| # | order_number | order_id | UCP status | total | lines |
|---|----|----|----|----|----|
| latest | `CO260625-00018` | `6d78ee4d-504d-4ee8-b7b9-f40817337c90` | Payment required | $711.60 (71160) | Hair Dryer ×2, Game Console ×1 |
| −1 | `CO260625-00017` | `b2156be0-376c-4799-aa7d-e0884e6e760e` | New | $201.58 (20158) | Brown VT Print Hat ×2 |
| −2 | `CO260625-00016` | `b6eb7d0f-3786-4da7-967c-2fd7046ddbbc` | Payment required | $42,150.00 | Eggette Machine ×999, Hat ×1 |

Confirmed `track_order` response shape (2026-06-25): `order{ id, number, status, status_display_value, created_at, cart_id, store_id, buyer_id, currency, totals{subtotal,total,tax_total,discount_total,shipping_total}, line_items[]{product_id,sku,name,status,quantity,unit_price,placed_price,line_total,tax_total}, shipments[]{number,status,shipment_method_code,shipment_method_option,tracking_number,tracking_url,delivery_at,delivery_address{…region_id,country_code}}, payments[]{number,gateway_code,method_name,status,billing_address} }` — all money in **minor units**.

- [ ] **F1** "I paid — where's my order?" right after handoff → `track_order(cart_id, buyer_id)` (or `track_last_order`) uses the saved ids; doesn't ask for an order number.
- [ ] **F2** "Order #CO260625-00018, where is it?" → `track_order(order_number="CO260625-00018")` returns the order with `status="Payment required"`, `totals.total.amount=71160`, 2 line_items, a shipment (`SH…`, method `FixedRate`/`Air`), and a payment (`gateway_code`). ✅ verified resolvable.
- [ ] **F3** Track by `order_id` → `track_order(order_id="b2156be0-…")` resolves CO260625-00017 (status `New`). **Track by `cart_id` is buyer-scoped (verified):** `track_order(cart_id="fed50162-…", buyer_id="ucp-anonymous-b82c…")` resolves CO260625-00018 ✅; the **same `cart_id` WITHOUT `buyer_id`** falls back to the last-saved-checkout buyer → **`404 order_not_found`** ❌. Post-handoff the agent MUST pass both the `cart_id` and the `buyer_id` returned by `create_cart` — `track_last_order` only works for the cart created in this same MCP session.
- [ ] **F4** Track before payment completes → `order_not_found` handled gracefully. **Verified live:** the last saved checkout `cart_id ac83f8f9-…` (buyer `ucp-anonymous-745721…`) returns `404 order_not_found` because no order was created yet — agent should report "no order yet / pending", not crash; expired `ucp_session` not used.
- [ ] **F5** Unknown/garbage `order_id` → clean `order_not_found`; no raw stack trace.
- [ ] **F6** ⚠️ **Per-line totals mapping** — on CO260625-00018, `line_items[].placed_price` and `line_items[].line_total` come back **`0`** while `unit_price`, `tax_total`, and order `subtotal`/`total` are correct. Assert `line_total == quantity × placed_price` and `Σ line_total == subtotal`; **currently fails → candidate UCP order-DTO mapping defect, file via `/qa-bug`.**
- [ ] **F7** ⚠️ **Inconsistent buyer enforcement across lookup paths (security)** — verified contrast: the **`cart_id` path enforces the buyer** (wrong/absent buyer_id → 404), but the **`order_number` / `order_id` path does NOT** — `track_order(order_number="CO260625-00018")` resolved with a non-matching lookup buyer_id. Since `CO260625-NNNNN` numbers are sequential and guessable, confirm whether a Buyer-A-scoped agent can read Buyer B's order by number → if yes, real isolation defect. File via `/qa-bug` (ties to H7).

## G. B2B variant (header-scoped delegation, contract pricing)
> Confirmed at §0: **no OAuth, no PO/invoice handler** on this build. Treat PO/invoice/approval as DEFERRED, not FAIL.
- [ ] **G1** Buyer-aware search with `buyer_id`/`organization_id` (resolve via `@td(MULTI_ORG_USER)` / B2B org alias) → contract prices, org assortment honored vs anonymous list prices.
- [ ] **G2** `create_cart(store_id="B2B-store", buyer_id, organization_id)` → cart carries org context; contract pricing reflected.
- [ ] **G3** `get_payment_handlers` for a B2B checkout → only `hosted_checkout` today; **`purchase_order`/`invoice` absent → record as DEFERRED (MVP gap vs ticket §B2B step 6).**
- [ ] **G4** `checkout_and_handoff` for a B2B buyer → continue_url; open it → storefront resumes org context (no second login since delegation is header-based).
- [ ] **G5** Approval-threshold path (`requires_buyer_review`) → **not on this build → DEFERRED**; record expected behavior per ticket.
- [ ] **G6** `list_carts(buyer_id, organization_id)` → scoped to that buyer/org only (cross-org isolation).

## H. Negative / resilience / contract integrity
- [ ] **H1** `update_cart` with non-existent `cart_id` → `cart_not_found`; agent does NOT silently `create_cart`.
- [ ] **H2** `list_carts` without `buyer_id` → rejected (no global anonymous list).
- [ ] **H3** Quantity bounds: qty=0 valid only with a line id (removal); negatives rejected; qty above available stock handled cleanly.
- [ ] **H4** `currency`/`language` override (e.g. `language="de-DE"`) → prices + cart totals reflect requested currency/culture.
- [ ] **H5** **Out-of-stock**: add Samsung Galaxy S6 (`SAG920F32GBB`, Electronics, qty 0) → availability surfaced; not silently added to a buyable cart.
- [ ] **H6** Idempotency: repeat the same `create_cart`/checkout call with the same `Idempotency-Key` → same logical result, no duplicate cart/checkout/order.
- [ ] **H7** Cross-buyer isolation → Buyer A cannot `get_cart`/`track_order` Buyer B's resources. **Probe the §F7 finding**: sequential `CO260625-NNNNN` numbers are guessable and `track_order(order_number)` did not enforce the lookup buyer_id — confirm whether a buyer-scoped agent can read another buyer's order.
- [ ] **H8** Anti-neologism guard: tool names + response fields use UCP standard terms; no Virto-internal names leak into UCP DTOs.

## I. End-to-end agentic transcripts (acceptance flows)
- [ ] **E2E-1 — B2C happy path** (ticket steps 1–10): capabilities → search printer <$150 in B2B-store → pick one → add a 2nd as gift → (coupon if available) → guest-address checkout (Seattle) → hosted_checkout → handoff → click URL → complete in storefront → `track_order(cart_id, buyer_id)`. One transcript, one browser hop.
- [ ] **E2E-2 — B2B contract path**: `buyer_id`+`organization_id` search (contract price) → cart on B2B-store → checkout (hosted_checkout only) → handoff resumes org context → track.
- [ ] **E2E-3 — Edit-after-handoff**: full flow, then change address mid-way (`update_checkout`→re-`handoff_checkout`), verify fresh URL + restored cart.
- [ ] **E2E-4 — Variant + out-of-stock**: pick an ASUS ZenFone 2 color variant (Electronics), attempt add → confirm out-of-stock handling surfaces before checkout.

## Notes for executors
- Resolve users/orgs via `@td()` (`MULTI_ORG_USER`, `ORG_USER`, B2B aliases); never hardcode creds — read `.env` at runtime.
- The product codes/ids above are **live references for 2026-06-25** — re-resolve via `search_products` at run time; assert relative magnitudes and structural invariants (env-resilience), never exact prices / order numbers / URL path segments.
- A clean DEFERRED for an absent surface (PO/invoice, approval gate, OAuth delegation) is a correct outcome, not a failure — record it with the §0 capability evidence.
- Evidence policy: `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`. File confirmed defects via `/qa-bug` (with a live second-source repro before filing).
