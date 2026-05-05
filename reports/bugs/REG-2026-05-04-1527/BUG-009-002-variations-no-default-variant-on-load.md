# BUG-009-002 — Multi-attribute variation product loads with no default variant pre-selected

| Field | Value |
|---|---|
| **Severity** | Low |
| **Priority** | P3 |
| **Type** | UX / Spec ambiguity |
| **Test Case** | B2C-VAR-008 (Product Variations - Default Variant Selection) |
| **Business Rule** | BL-B2C-001 |
| **Edge Case** | — |
| **Run** | REG-2026-05-04-1527 |
| **Browser** | playwright-firefox |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Tester** | qa-frontend-expert (Emily Johnson, slot 2 / TechFlow) |
| **Date** | 2026-05-05 |
| **Confirmed** | false — likely by-design; needs spec/UX review |
| **PR / Ticket Hint** | Storefront variant resolution policy |

## Summary

When a fresh PDP for a multi-attribute variation product (4 axes: Color × Size × Size_chart × Fabric) is loaded, **no variant is pre-selected** and `Add to Cart` is disabled. The test expects a "default variant" pre-selected, with `Add to Cart` enabled and a price visible. Either the test expectation is wrong for multi-axis products, or the storefront should pick a sensible default.

## Steps to Reproduce

1. Sign in as the slot-2 B2B user (TechFlow / Emily Johnson) on `playwright-firefox`.
2. Open a fresh tab/session and navigate to:
   `https://vcst-qa-storefront.govirto.com/products-with-options/variations-of-jeans/jeans/vintage-california-beach-pullover-hoodie`.
3. Without interacting, inspect:
   - All four `[data-test-id^="variant-picker-group--*"]` groups (Color, Size, Size_chart, Fabric).
   - The `Price:` row (right-side widget).
   - The `ADD TO CART` button state and `aria-label`.

## Expected

Per the test case spec:

- Default variant pre-selected on page load (not blank state).
- `Add to Cart` enabled immediately without user interaction.
- Default variant SKU added to cart matches expected default.

## Actual

- All four variant-picker `<input type="radio">` elements report `checked: false` for every value.
- Programmatic check: `selections === { Color: null, Size: null, Size_chart: null, Fabric: null }`.
- `Price: N/A` is displayed.
- `ADD TO CART` button is disabled with `aria-label="Select options to proceed"`.

## Evidence

- Screenshot of fresh-load PDP: `reports/regression/REG-2026-05-04-1527/009-evidence/var008-no-default-variant.png`
- Console: 0 errors.
- Same product correctly resolves to a full SKU once any one axis is picked (e.g. `Size_chart=M` auto-fills Color/Size/Fabric to a valid combination — see B2C-VAR-001 PASS in same run).

## Suspected Cause / By-Design Question

For 4-axis variation products, automatically choosing one of N×M×P×Q combinations on first load risks displaying an "unintended" SKU (with a price the merchant did not want shown first, or an out-of-stock combo). The storefront may intentionally render a blank state in this case to force the buyer to choose.

For 1-axis or 2-axis simpler products, a default may exist — this PDP just has too many axes.

## Recommendation

- **Option A (spec change):** Update the test to allow blank-state on PDPs with ≥ 3 variant axes; assert default-only on 1–2 axis products.
- **Option B (impl change):** Have the storefront pick the first available variant by configurable rule (e.g. lowest price, default variant flagged in catalog, or simply first by `displayOrder`).

## Notes

- This is **not** blocking purchase. After any single attribute is selected, the picker auto-completes the remaining axes to a valid in-stock variant and `Add to Cart` is enabled (verified in B2C-VAR-001 / 003 / 005 / 009).
- Filed at Low/P3 to flag for product owner review, not as a regression.
