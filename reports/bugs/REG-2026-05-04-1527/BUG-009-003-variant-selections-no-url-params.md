# BUG-009-003 — Variant attribute selections do not propagate to URL query params

| Field | Value |
|---|---|
| **Severity** | Low |
| **Priority** | P3 |
| **Type** | Functional / SEO + sharing |
| **Test Case** | B2C-VAR-010 (Product Variations - Variant URL Parameters) |
| **Business Rule** | BL-B2C-001 |
| **Edge Case** | — |
| **Run** | REG-2026-05-04-1527 |
| **Browser** | playwright-firefox |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Tester** | qa-frontend-expert (Emily Johnson, slot 2 / TechFlow) |
| **Date** | 2026-05-05 |
| **Confirmed** | false (preliminary — feature may be intentionally not implemented yet) |
| **PR / Ticket Hint** | Storefront router + variant-picker integration |

## Summary

After a buyer selects variant attributes (Color, Size, Size_chart, Fabric) on a multi-attribute variation PDP, the URL **does not** receive corresponding query parameters (e.g. `?color=Blue&size=L`). Consequently, copying the URL and opening it in a new tab does **not** pre-select the chosen variant; the buyer lands back at the master product with no preselection.

## Steps to Reproduce

1. Sign in as Emily Johnson (slot 2 / TechFlow), `playwright-firefox`.
2. Navigate to `https://vcst-qa-storefront.govirto.com/products-with-options/variations-of-jeans/jeans/vintage-california-beach-pullover-hoodie`.
3. Click **Size_chart = L** (this triggers full auto-resolution to Blue / Size 50 / L / Cotton — verified separately).
4. Inspect `window.location.href` (or the address bar).
5. Optional: copy the URL, open a new tab, paste it, and observe the load state.

## Expected

Per the test case spec:

- URL updates with human-readable variant query parameters (e.g. `?size=L&color=Blue`).
- Opening the variant URL pre-selects the variant on load.
- Browser back-button navigates correctly through variant-state changes.
- URL uses readable names, not internal GUIDs.

## Actual

- After multiple variant clicks, `window.location.href` remains:
  `https://vcst-qa-storefront.govirto.com/products-with-options/variations-of-jeans/jeans/vintage-california-beach-pullover-hoodie`
- No query params appended.
- Browser address bar unchanged after attribute selection.
- (Direct variant URL pre-select cannot be tested because step 1 of that flow — URL update on selection — does not happen.)

## Evidence

- Verified live during the run; URL inspection result captured in `reports/regression/REG-2026-05-04-1527/009-results.json` (test `B2C-VAR-010` notes).
- Console: 0 errors during test.

## Suspected Cause

The storefront's variant-picker (`VcVariantPickerGroup` / `VcProductVariations`) does not emit a router push/replace on attribute change. Variant state is held in component-local reactive state only.

## Workaround

Buyers cannot share or bookmark a specific variant. They must share the master URL and instruct the recipient to manually select the same attributes.

## Notes

- This may be a **deliberate scope decision** (not yet implemented) rather than a regression. The configurable-product flow does pass `lineItemId` query params for cart-edit (verified in CONFIG-018 PASS), proving the router can carry state when wired up.
- Logged at Low/P3 to flag for product/SEO consideration. URL-bound variant state would also help SEO indexation of variants and Google Shopping feed integration.
