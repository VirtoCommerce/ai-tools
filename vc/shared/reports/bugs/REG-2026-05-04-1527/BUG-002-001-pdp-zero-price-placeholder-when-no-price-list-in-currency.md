# BUG-002-001 — [Storefront] PDP shows €0.00 placeholder when product has no price defined in selected currency (no "unavailable" message)

| Field | Value |
|---|---|
| Run | REG-2026-05-04-1527 |
| Suite | 002 — Product Detail |
| Test case | CAT-054 |
| Severity | High |
| Priority | P1 |
| Browser | playwright-chrome (Chromium 148) |
| Environment | https://vcst-qa-storefront.govirto.com |
| Theme | Coffee (B2B-store) |
| Business rule | BL-PRICE-005, BL-CAT-006 |
| Edge case ref | ECL-3.1 |
| Confirmed | false (preliminary; see investigation note) |

## Summary
On a PDP for a product that has a price list in USD but no price list in EUR, switching the storefront currency to EUR causes the PDP to render a literal **"Price: €0.00"** placeholder instead of either an explicit "Not available in this currency" state or hiding the price block entirely. This violates BL-PRICE-005 (currency-specific price-list integrity) and the ECL-3.1 edge case for missing currency price lists.

The qty-stepper "+" button (which IS the add-to-cart entry on this storefront per project guardrail `feedback_qty_stepper_as_add_to_cart.md`) is correctly disabled, so no €0.00 order can actually be placed — but the user-facing communication is misleading and a guest could reasonably interpret "€0.00" as "free".

## Reproduction
1. Sign in as Agent Chrome (slot 1 / TechFlow / `qa-agent-slot1@virtocommerce.com`).
2. Navigate to https://vcst-qa-storefront.govirto.com/alcoholic-drinks/efes-beer/efes-bottle-50cl. In the default USD currency, price = `$2,324.00`, qty stepper "+" is enabled, stock badge `5728`.
3. Use the top-header **Currency:** switcher to select **EUR** (€).
4. Wait for the PDP to re-render.

## Expected
Per BL-PRICE-005 and CAT-054 assertions:
- The product either shows a clear "Not available in this currency" / "Price unavailable" state, **OR** hides the price block entirely.
- No `€0.00` (or any zero-value) placeholder is rendered.
- "Add to cart" entry-point (qty stepper `+`) is disabled — *this part already works*.

## Actual
- Price block in the right-rail "Price and delivery" panel renders literally **"Price: €0.00"**.
- No "Not available in this currency" message anywhere on the PDP.
- No price-hidden state — the zero is shown as if it were a real price.
- Qty stepper "+" is correctly disabled (button.disabled === true; `vc-button--solid--…` class but `disabled` attribute set), so the user cannot actually add the product. ✅
- Stock badge still shows `5728` (in stock), which combined with the `€0.00` reads as "free product, in stock" to a confused user.

## Cross-layer evidence
- Currency switch GraphQL request fires correctly: `SearchProducts` with `currencyCode: "EUR"` and filter `price.EUR:(0 TO)` (verified in network tab; HTTP 200, no GraphQL `errors[]`).
- Console: 0 errors (no JS exceptions, no unhandled promise rejections).
- HAR captured.

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/002-evidence/CAT-054-efes-eur-zero.png` (full PDP showing `Price: €0.00` and disabled qty stepper).

## Investigation note
- Same PDP in default USD shows `$2,324.00` correctly, so the currency-specific price list mechanism is partly working — the issue is purely the missing-price fallback UI.
- Other products in EUR with defined EUR price lists (e.g., COTE SOLEIL Merlot variation 1) render correctly: `€3,556.00` (a real price-list value, not an exchange-rate conversion of `$2,345`). So this is specifically a missing-data presentation issue.

## Suggested fix scope
- Frontend: detect zero / missing `price.actual` in selected currency and render a "Not available in this currency" inline label, plus hide the numeric price field (rather than rendering `formattedAmount` from a zero MoneyType).
- Optionally fall back to the default currency price with a "Switch back to USD to purchase" hint.

## Linked tests
- CAT-054 (this run, FAIL).
- Suggested regression: re-run CAT-052 / CAT-053 / CAT-054 across all configured currencies (AUD/CNY/CZK/EUR/GBP/GHS/USD/XPT) on a sample of 10 products that have varying price-list coverage.
