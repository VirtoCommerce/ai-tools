# COV-VCST-5378 — UCP tool surface × scenario coverage (2026-09-22)

**Basis** — all three columns observed live this pass, not read from prior art:
`POST {FRONT_URL}/ucp/mcp` `initialize` + `tools/list` (18 tools, full input schemas),
`get_store_capabilities` (19 declared operations), and the 22 prior-art scenarios in
`vc/shared/archive/sprints/Sprint26-18/VCST-5378/UCP Authenticated User Flow — Test Scenarios (VCST-5378).md`.
Build: UCP `3.1006.0-pr-7-612c` · Platform `3.1072.0-pr-3108-b6ef` · storefront `2.59.0-pr-2467-1951`.

**Corpus reality check:** the only UCP suite is `094-ucp-observability.csv` — 23 cases, all telemetry,
**0 touching the value chain**, 19 still `Draft` and never run (domain map §4). So the "Suite" column
below is `—` for every row, and that is the finding, not an omission.

## 1. The tool surface — 18 MCP tools in 5 capabilities

| # | Tool | Capability | Required args | REST twin |
|---|---|---|---|---|
| 1 | `get_store_capabilities` | profile | — | `GET /.well-known/ucp` |
| 2 | `link_buyer_identity` | identity_linking | — | MCP only |
| 3 | `logout_buyer` | *(none declared)* | — | MCP only |
| 4 | `search_products` | catalog | `query` | `POST /ucp/v1/catalog/search` |
| 5 | `get_product` | catalog | *(none — `id`/`product_id` both optional)* | `GET /ucp/v1/catalog/products/{id}` |
| 6 | `create_cart` | cart | `line_items` | `POST /ucp/v1/carts` |
| 7 | `list_carts` | cart | — | `GET /ucp/v1/carts` |
| 8 | `get_cart` | cart | `cart_id` | `GET /ucp/v1/carts/{cartId}` |
| 9 | `update_cart` | cart | `cart_id`, `line_items` | `PUT /ucp/v1/carts/{cartId}` |
| 10 | `create_checkout` | checkout | `cart_id` | `POST /ucp/v1/checkouts` |
| 11 | `update_checkout` | checkout | `checkout_id` | `PATCH /ucp/v1/checkouts/{checkoutId}` |
| 12 | `handoff_checkout` | checkout | `checkout_id` | `POST /ucp/v1/checkouts/{id}/handoff` |
| 13 | `checkout_and_handoff` | checkout | `cart_id` | MCP only |
| 14 | `get_payment_handlers` | checkout | `checkout_id` | `GET /ucp/v1/checkouts/{id}/payment-handlers` |
| 15 | `track_order` | order | *(none — `order_id`/`order_number`/`cart_id` all optional)* | `GET /ucp/v1/orders/{orderId}` · `?cart_id=` |
| 16 | `list_countries` | geography | — | `GET /ucp/v1/geography/countries` |
| 17 | `resolve_country` | geography | `query` | `GET .../countries/resolve` |
| 18 | `list_regions` | geography | `country_id` | `GET .../countries/{id}/regions` |

Plus one operation that is **not** a tool: `POST /ucp/v1/internal/handoff/restore`
(`storefront_restore`, status `available_storefront`) — the storefront's own leg, and the site of F1.

## 2. Scenario → tool match

| TS | Scenario | Tools it needs | Reachable? | Suite |
|---|---|---|---|---|
| 01 | Happy path B2C: search → cart → handoff | 2,4,6,13,restore | **YES** | — |
| 02 | Order attribution preserved | 15 + payment | **NO — unreachable** (§3a) | — |
| 03 | Multi-item conversational refinement | 4,6,9 | YES | — |
| 04 | `continue_url` validity + expiry | 13,restore | YES (expiry needs a 16-min wait) | — |
| 05 | Resumes as the correct authenticated user | 2,13,restore | YES | — |
| 06 | Discovery accuracy | 4,5 | YES | — |
| 22 | Discovery on ordinary (non-fixture) catalog | 4 | YES | — |
| 07 | Contract pricing applied | 2,4,6 | **BLOCKED — fixture** (§3b) | — |
| 08 | Assortment restricted to org | 2,4 | **BLOCKED — fixture** (§3b) | — |
| 09 | Storefront resumes as the organization | 2,13,restore | YES | — |
| 10 | Approval rules honored on handoff | 13 | **NO — not implemented** (§3c) | — |
| 11 | PO / invoice terms honored | 14 + storefront | **NO on this env** (§3d) | — |
| 12 | Multiple buyers, same organization | 2,6,7 | YES | — |
| 13 | Approval blocks over-limit self-checkout | 13 | **NO — not implemented** (§3c) | — |
| 14 | Unauthenticated user attempts checkout | 6,13 | YES | — |
| 15 | `continue_url` reused after completion | restore | YES | — |
| 16 | Tampered / forged `continue_url` | restore | **PARTLY — as written it tests a mechanism that does not exist** (§3e) | — |
| 17 | Stock changes between assembly and resume | 6,9,restore | YES | — |
| 18 | Buyer loses org membership before handoff | 2,13,restore + Admin | YES (Admin-driven) | — |
| 19 | Session timeout between interaction and handoff | restore | YES | — |
| 20 | Claude cannot fulfil part of a request | 4,9 | YES | — |
| 21 | Cross-organization / cross-user handoff | restore | YES | — |

## 3. GAPS — direction A: scenarios no tool can satisfy

- **§3a TS-02 order attribution is unreachable, and not only because payment is out of scope.** No tool
  *writes* attribution; `track_order` only reads, and it resolves by `order_id` / `order_number` /
  `cart_id` — it returns no agent- or session-derived field. The story's own promise ("my agent session
  preserved as order attribution") names **no observable artifact**, which `1d` also reached
  independently. **This needs a product answer before any case can be written.**
- **§3c TS-10 / TS-13 approval rules are not implemented in UCP at all.** `UcpCheckoutService` sets
  `status` as a constant; the 2026-09-21 fix changed only the *message* and explicitly states approval
  rules "remain in the existing checkout". So these two scenarios can only ever be satisfied *after* the
  buyer is back in the storefront — i.e. they are storefront-checkout scenarios wearing UCP clothing.
- **§3d TS-11 PO/invoice** — `get_payment_handlers` returns a static list; on this environment only
  `hosted_checkout` is `available`, with `native_card` and `google_pay` both `not_available`. Nothing
  PO/invoice-shaped is exposed, so the scenario cannot be exercised here.
- **§3e TS-16 tampering** — the scenario says to modify "cart id, user id, **signature**". `ucp_session`
  is a 256-bit **opaque** random key carrying none of those. The real tamper test is "an unknown token
  ⇒ 400, no cart exposed"; the scenario as written should be rewritten, not run.
- **§3b TS-07 / TS-08** are *blocked*, not impossible — the tools exist and work; the **data** cannot
  falsify them (org price == list price). Routed to `3a`. `.claude/rules/test-data.md` SECOND RULE.

## 4. GAPS — direction B: tools no scenario exercises

| Tool | TS coverage | Why it matters |
|---|---|---|
| `logout_buyer` | **NONE** | Revokes the Platform OAuth authorization *and its refresh tokens, including other sessions*. That is the widest-blast-radius tool on the surface and nothing tests it — see §5 |
| `list_countries` · `resolve_country` · `list_regions` | **NONE** | The whole **geography** capability — 3 of 18 tools — has zero scenario coverage, yet a physical-goods handoff cannot proceed without a resolved country/region (`handoff_checkout` refuses until `shipping_address` is set) |
| `update_checkout` | **NONE** | The only way to set buyer/address data on a checkout; every address-dependent handoff depends on it |
| `handoff_checkout` (two-step) | **NONE** | Only `checkout_and_handoff` was ever walked end to end — domain map **G8**. The two paths return *different envelope shapes* (D6), so they are not interchangeable for a client |
| `get_cart` · `list_carts` | incidental only | `list_carts` is the buyer-scoping oracle: it is how you prove one buyer cannot see another's carts |
| `get_payment_handlers` | TS-11 only | Which is itself unreachable (§3d) — so effectively zero |
| `track_order` | TS-02 only | Which is itself unreachable (§3a) — so effectively zero |

**Eight of eighteen tools have no scenario that exercises them at all**, and two more are covered only by
scenarios that cannot run. Against a corpus of 23 cases that touch none of the chain, the honest
statement is that the UCP tool surface is **essentially untested by the regression corpus**.

## 5. Discovery inconsistencies observed this pass (all live, all this build)

| # | What | Verdict |
|---|---|---|
| I1 | `tools/list` returns **18**; `get_store_capabilities.mcp_tools` advertises **17** — `logout_buyer` is missing from the profile | NEW this pass |
| I2 | `initialize.instructions` enumerates **16** ("Available tools: … and `track_order`"), omitting `link_buyer_identity` *and* `logout_buyer` — then the prose below it instructs the client to call `link_buyer_identity`. Three surfaces, three counts | NEW this pass |
| I3 | **`get_store_capabilities` carries `payment_handlers` TWICE, in one payload, at two paths, with two types**: `ucp.payment_handlers = {}` (empty object, matching `/.well-known/ucp` on both hosts) and top-level `payment_handlers = [3 handlers]`. So the contradiction is *inside a single response*, not merely across two endpoints | domain map **D1 — RESTATE, do not close.** Sharper and worse than D1 as written. (A discovery lane reading only the nested path concluded D1 was refuted; checking both paths in the saved payload settled it) |
| I4 | Three version vocabularies in one payload: `ucp.version = 2026-04-08`, `ucp_version = 1.0`, MCP protocol `2025-06-18` | domain map **D5** — STILL HOLDS |
| I5 | `headers.buyer_context` is now `[]` — the legacy `X-Buyer-*` headers are no longer advertised (they are actively rejected 403) | **D13 half FIXED** |
| I6 | `headers.agent_api_key: "X-Agent-Api-Key"` is still advertised and still read by nothing | **D13 half OPEN** (G6) |
| I7 | `get_product` declares **no required argument**, though it needs `id` or `product_id`; `track_order` likewise needs one of three | schema weakness — an LLM caller cannot tell from the schema |
| I8 | `logout_buyer` carries no `capability` in the operations list, unlike all 17 others | NEW this pass |

**Not an inconsistency, and worth recording as a refuted suspicion:** `line_items[]` declares no
`required` in its item schema, which predicts that a malformed *nested* item escapes validation. Tested
directly — `create_cart` with `line_items:[{}]`, `[{quantity:1}]` and `[{product_id:null,…}]` all return
`400 invalid_request "line_items[].product_id is required."` **The prediction is wrong; F5's fix covers
the nested case too.**

## 6. What to do with this

1. **Author the geography + `update_checkout` + two-step-handoff cases** — 8 untouched tools is the
   cheapest coverage win on this surface, and `update_checkout` blocks every address-dependent handoff.
2. **Rewrite TS-16** against the real mechanism (unknown token ⇒ 400) instead of a signature that does not exist.
3. **Get a product answer on TS-02** (order attribution) before writing anything; it is currently unwritable.
4. **Move TS-10 / TS-11 / TS-13 out of this story's scope** or re-point them at storefront checkout —
   UCP implements no approval or payment-terms logic and the 2026-09-21 fix says so explicitly.
5. **Cover `logout_buyer`** — it revokes refresh tokens across sessions and has no test at all.
6. File I1/I2/I8 as one low-severity discovery-consistency finding; I3/I4/I6 are already domain-map rows.
