# VCST-5126 — UCP MVP · Test Execution Report

**Env:** vcst-qa (`https://vcst-qa-storefront.govirto.com`, storefront theme `2.52.0-pr-2343`) · **Date:** 2026-06-25 · **Driver:** `vc-ucp` MCP tools (live) + playwright-chrome for handoff · **Stores:** `B2B-store`, `Electronics`

## Verdict
Core agentic flow (discovery → search → cart → checkout → signed handoff → storefront cart restore → order tracking) **works end-to-end**. **42 scenarios PASS**, **4 findings** (1 likely-bug, 1 security-smell, 2 minor/data), **8 DEFERRED** (absent on this MVP build or need delegated B2B identity). No blocker to the handoff happy path.

## Results by area
| Area | Result |
|------|--------|
| **A. Discovery** | A1 PASS · A2 PASS (`missing_store_id` on no store_id) · A3 NOT RUN (skipped — would poison session base_url) |
| **B. Search/product** | B1–B7 **PASS** (price bounds, empty-set, variations, `product_not_found`; sale≠list confirmed WF-3640 $100/$199.99) |
| **C. Cart** | C1–C4 PASS · C6 PASS (bad coupon → `applied:false`, cart intact) · C7/C9 PASS · C8 PASS (**consolidation**: same product ×2 → one line qty 2) · C10 PASS (items synchronous on create) · C11 PASS-by-design · **C5 DEFERRED** (no live coupon) |
| **D. Checkout/handoff** | D1–D4 **PASS** (signed `continue_url` w/ expiry; ISO2 `US`→`USA`; only `hosted_checkout`; fresh URL after `update_checkout`) · D5/D8 PASS-by-schema · D6 PASS · **D7 PASS** (storefront restored exact cart) |
| **E. Geography** | E1 PASS (`KZ`→`KAZ`) · E2 PASS (`US`→`USA`, WA region) · E3 PASS (KAZ 0 regions) · E4 PASS (ISO2 normalized at checkout) · **E5 FINDING** (query filter ignored) |
| **F. Order tracking** | F1–F5 **PASS** (by order_number, order_id, cart_id+buyer_id; `order_not_found` graceful) · **F6/F7 FINDINGS** |
| **G. B2B** | G6 PASS (buyer-scoped list) · **G1/G2/G4 DEFERRED** (no delegated buyer id available; delegation is header-based, no OAuth) · **G3/G5 DEFERRED** (no PO/invoice/approval handler on build) |
| **H. Negative/resilience** | H1 PASS (`cart_not_found`) · H2 PASS-by-schema · H3 PASS (MOQ "2–4 items" enforced; qty0+id removes) · H4 PASS (`de-DE`+EUR → localized slug/price/format) · H5 **PASS** (OOS Samsung → `PRODUCT_FFC_QTY`, not added) · **H6 NOT TESTABLE** (no Idempotency-Key param on MCP tools) · H7 see F7 · H8 PASS (UCP-standard field names) |
| **I. E2E** | E2E-1 **PASS** to handoff+restore (payment completion is manual in storefront) · E2E-3 **PASS** (edit-after-handoff: address changed, fresh URL, storefront showed updated 400 Broad St) · E2E-4 PASS (OOS + variant) · **E2E-2 DEFERRED** (B2B contract) |

## Findings
**UCP-1 · postal_code missing from checkout API response + false warning · Medium**
All three checkout write paths (`checkout_and_handoff`, `create_checkout`, `update_checkout`) return every address with `postal_code: null` and emit `shipping_postal_code_missing` (warning) even when a valid ZIP is supplied. **Not data loss** — the storefront cart-restore screen shows the ZIP persisted ("400 Broad St, Seattle, Washington, **98109**, United States of America"). So the postal is saved but the **UCP response DTO omits it**, which would make an agent wrongly re-ask the buyer for a ZIP it already has. Repro: send `postal_code:"98101"` to `checkout_and_handoff` on cart `244a0601…` → response postal null; storefront shows it. Candidate `/qa-bug`.

**UCP-2 · track_order does not enforce buyer on order_number/order_id lookups · Medium (security)**
`track_order(cart_id=…)` IS buyer-scoped (wrong/absent `buyer_id` → `404 order_not_found`), but `track_order(order_number=…)` / `(order_id=…)` resolve the order regardless of the lookup `buyer_id` (verified: `CO260625-00018` returned with a non-matching saved buyer). `CO260625-NNNNN` numbers are sequential/guessable → potential cross-buyer order read. Needs a Buyer-A-vs-Buyer-B confirmation, then `/qa-bug`.

**UCP-3 · track_order per-line placed_price & line_total = 0 · Low–Medium**
On `CO260625-00018`, `line_items[].placed_price` and `line_items[].line_total` are `0` while `unit_price`, `tax_total`, and order `subtotal`/`total` are correct. Per-line totals DTO mapping gap.

**UCP-4 · list_countries query filter ignored · Low**
`list_countries(query="United")` returned the unfiltered alphabetical page (Afghanistan, Åland…), not United States/Kingdom/Arab Emirates. `resolve_country` works, so checkout isn't blocked.

### Minor observations (not filed)
- Repeated `handoff_checkout`/`update_checkout` calls **append duplicate addresses** to the cart (cart `244a0601…` accrued 6 address rows for one recipient).
- Every handoff returns checkout `status: "requires_escalation"` (likely: no shipping method selected + the postal warning) yet still issues a valid `continue_url`.
- `create_cart`/checkout responses return `continue_url: null`; the real URL only comes from `handoff_checkout`/`checkout_and_handoff`.

## Evidence / data used
- Live carts created (B2B-store): `244a0601-3522-4be2-8078-83c58ca87161` (Xerox ×3), `05849d88-5114-4a91-af9a-86c9d2e16b86` (consolidation), `c372b8bb-…` (Electronics OOS, empty). All `cart_name` prefixed `AGENT-TEST-UCP-*`.
- Handoff tokens (expired by now): `…moeYqvRG…`, `…aKFzuIzm…`, `…gGajvLiy…`.
- Orders tracked (read-only): `CO260625-00018/00017/00016`.
- No orders placed (Place Order requires storefront-side delivery+payment selection); no JIRA/GitHub writes.

## Not run / deferred — why
A3 (bad base_url — avoid poisoning the MCP session's remembered URL) · C5 (no live coupon seeded) · G1/G2/G4/E2E-2 (need a real delegated B2B buyer id; delegation is header-based) · G3/G5 (PO/invoice/approval handlers absent on this build — see §0 capabilities) · H6 (MCP tools expose no `Idempotency-Key` argument).
