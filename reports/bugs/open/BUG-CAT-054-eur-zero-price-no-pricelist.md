# BUG-CAT-054: PDP shows misleading "€0.00" / "£0.00" / etc. for products missing a price list in the active currency

- **Source run:** REG-2026-04-20-1000 (Frontend/catalog, test CAT-054)
- **Verdict:** CONFIRMED (display-only)
- **Final Severity:** MEDIUM (downgraded from reported HIGH)
- **Priority:** P2
- **Environment:** `https://vcst-qa-storefront.govirto.com/` — build `2.47.0-pr-2225-130f-130fb04d`
- **Browser:** playwright-chrome (Chromium, viewport 1920x1080)
- **Theme:** vc-frontend (Coffee theme)
- **User:** Agent Chrome (B2B personal account), userId `c994fa34-dab9-4238-9c39-28756b3e547d`
- **BL refs:** BL-PRICE-005 (price display), BL-CART-004 (currency recalculation)
- **ECL refs:** ECL-3.1 (currency/pricing edge cases)
- **Related:** BUG CART-050 (missing EUR price in cart context)

---

## Summary

On the Product Detail Page, switching currency to one for which the product has NO price list entry (EUR, GBP, CNY, CZK tested) causes the price to render as `€0.00` / `£0.00` / `¥0.00` / `Kč0.00` — a misleading zero amount instead of an unavailable-price indicator such as "N/A" or "Price unavailable".

**Commerce risk:** LOW — the storefront correctly disables the quantity stepper, hides the "Add to cart" button, and the xAPI correctly returns `availabilityData.isBuyable=false`, so a zero-priced order cannot be placed through normal UI interaction. The issue is purely cosmetic/UX but still violates BL-PRICE-005 (price display must be truthful about unavailable state).

---

## Original report severity re-assessment

Per the original test case, CAT-054 flagged this as **HIGH** because it claimed the quantity stepper remained enabled and allowed adding a zero-priced item to cart. Live reproduction contradicts that:

| Claim in original report                    | Observed in current build                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PDP shows "€0.00"                           | CONFIRMED — displayed as "€0.00" placeholder                                              |
| Quantity stepper remains enabled            | FALSE — stepper is DISABLED (input `disabled=true`, +/- buttons `disabled=true`)          |
| User can add zero-priced item to cart       | FALSE — no "Add to cart" button rendered; backend also enforces `isBuyable=false`         |

Because the add-to-cart gate is enforced both client-side (UI) and server-side (`isBuyable=false`), the revenue risk is eliminated. The remaining issue is a UX defect (misleading zero price), which is MEDIUM, not HIGH.

---

## Steps to Reproduce

1. Open `https://vcst-qa-storefront.govirto.com/` in Chromium and sign in as a B2B personal user.
2. Navigate to PDP: `https://vcst-qa-storefront.govirto.com/snacks/chips/doritos-nacho-cheese-box-20x44gr`.
3. Verify default USD rendering: price shows `$16.00`, quantity stepper enabled with minus/plus buttons functional.
4. Click the top-header "Currency: USD" button to open the currency dropdown.
5. Click "€ EUR".
6. Observe the PDP after it reloads with EUR.

## Expected

- Price displays a non-monetary "unavailable" indicator such as `N/A`, `Price on request`, or `Price unavailable for EUR` — matching the "N/A" treatment already used for variant products without an option selected (see the related-products "Nachos Chips 50x200g" card which correctly shows "From N/A").
- Quantity stepper disabled (matches current behavior).
- Add-to-cart hidden or replaced with an "Unavailable in EUR" messaging.
- Related-product cards and cross-sell widgets on the PDP should apply the same rule.

## Actual

- PDP "Price and delivery" widget shows `Price: €0.00`.
- Quantity stepper input `disabled=true`, `+`/`-` buttons `disabled=true`.
- No "Add to cart" button rendered (functional gate works).
- Within the same PDP, the "Products related to this item" and "Customers bought together" widgets render related cards with `€0.00` labels (5 of 6 CBT cards in this example). One card that happens to have EUR pricing shows the correct price (`€78.00`), proving the €0.00 on others is solely due to missing EUR price list entry, not a data issue at the aggregation layer.
- Same behavior reproduces for GBP (`£0.00`), CNY (`¥0.00`), CZK (`Kč0.00`) — the bug is NOT EUR-specific; it occurs for any currency lacking a price list entry for the specific product.

## Backend verification (xAPI GraphQL `GetProduct`)

Comparison across five currencies against the same two products confirms the backend returns amount=0 with a formatted currency symbol when no price list exists, plus correctly marks the product non-buyable:

| Product                | Currency | price.actual.formattedAmount | amount | isBuyable | isAvailable |
| ---------------------- | -------- | ---------------------------- | ------ | --------- | ----------- |
| Doritos Nacho Box      | USD      | $16.00                       | 16     | true      | true        |
| Doritos Nacho Box      | EUR      | €0.00                        | 0      | false     | false       |
| Doritos Nacho Box      | GBP      | £0.00                        | 0      | false     | false       |
| Doritos Nacho Box      | CNY      | ¥0.00                        | 0      | false     | false       |
| Doritos Nacho Box      | CZK      | Kč0.00                       | 0      | false     | false       |
| 1024Wh Power Station   | USD      | $99.99                       | 99.99  | true      | true        |
| 1024Wh Power Station   | EUR      | €0.00                        | 0      | false     | false       |
| 1024Wh Power Station   | GBP      | £0.00                        | 0      | false     | false       |
| 1024Wh Power Station   | CNY      | ¥0.00                        | 0      | false     | false       |
| 1024Wh Power Station   | CZK      | Kč0.00                       | 0      | false     | false       |

Query used:
```
query GetProduct($storeId: String!, $currencyCode: String!, $cultureName: String, $id: String!) {
  product(storeId: $storeId, id: $id, currencyCode: $currencyCode, cultureName: $cultureName) {
    price { actual { amount formattedAmount } list { amount formattedAmount } }
    availabilityData { isActive isAvailable isBuyable isInStock availableQuantity }
    minQuantity maxQuantity
  }
}
```

## Catalog listing behavior (not affected)

The catalog listing page (`/catalog`) in EUR currency shows only priced products (85 results in EUR, 0 in AUD which has no price lists at all). The listing filter uses `Show in stock` + the price list scope, so €0.00 cards are effectively hidden there. The defect surfaces only on direct PDP deep-links and inside cross-sell widgets of unrelated PDPs.

## Evidence

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-054-01-doritos-USD-baseline.png` — USD baseline: $16.00, stepper enabled
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-054-02-doritos-EUR-zero-price.png` — EUR: €0.00, stepper disabled, no Add-to-cart, cross-sell cards also €0.00
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-054-03-catalog-EUR-listing.png` — catalog listing in EUR shows real prices for priced products
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-054-04-catalog-all-EUR-has-real-prices.png` — catalog view, no €0.00 cards

## Console / Network observations

- `ChangeCartCurrency` mutation fires correctly when user switches currency.
- Subsequent `GetProduct`, `SearchRelatedProducts`, `GetProductRecommendations` queries re-execute with new `currencyCode`.
- No console errors related to price rendering. Only unrelated 404s for apart.pl jewelry images.

## Severity Justification

- ❌ Not CRITICAL — no €0.00 order can be placed (functional gate holds).
- ❌ Not HIGH — no revenue impact, no data corruption; misinformation only.
- ✅ **MEDIUM** — visible price misrepresentation across all non-USD currencies, violates BL-PRICE-005 (price truthfulness), reduces buyer trust in B2B context, applies to every product missing multi-currency price lists. Also affects cross-sell tiles on unrelated PDPs.
- ⚠️ Should be fixed with UI change: either hide the price line entirely when `isBuyable=false`, or render "Price unavailable in EUR" style copy. Preferred long-term fix: adjust resolver to return `null` instead of `0` when no price list exists, so frontend can distinguish genuine zero-priced items from missing-price-list items.

## Suggested JIRA Title

`VCST: Storefront — PDP and cross-sell widgets show misleading "€0.00" for products missing a price list in the active currency`

## Recommended Labels / Components

`storefront`, `pdp`, `pricing`, `i18n`, `cross-currency`, `UX`

## Regression Coverage to Add

- `Frontend/catalog/002-...csv` or `Frontend/cross-cutting/046-i18n.csv`: Add a scenario that validates unpriced-currency PDP rendering uses "N/A" not `€0.00`.
- Extend to all cross-sell widgets (Products related, Customers bought together, Recommendations).
- Add backend expectation: `price.actual.amount === 0 && isBuyable === false` should trigger the "unavailable" UI branch.

## Cleanup / Side-effects

- `ChangeCartCurrency` mutation persists currency to the cart. Switched currency back to USD at end of investigation to restore default state.
- No orders created. No test data mutated.
