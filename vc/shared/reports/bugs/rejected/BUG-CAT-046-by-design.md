# BUG-CAT-046 — REJECTED: PDP renders stacked widget cards instead of tabs (BY DESIGN)

- **Source run:** REG-2026-04-20-1000 (Frontend/catalog, test CAT-046)
- **Verdict:** BY-DESIGN (test case needs to be rewritten)
- **Severity:** N/A (rejected)
- **Environment:** `https://vcst-qa-storefront.govirto.com/` — build `2.47.0-pr-2225-130f-130fb04d`
- **Browser:** playwright-chrome

---

## Summary

Test CAT-046 was written against an older PDP design that used a tabbed layout (Description / Specifications / Reviews) with `role="tab"` elements. The current vc-frontend theme intentionally renders each PDP content block as a distinct **stacked `.vc-widget` card** rather than tabs. This is a deliberate design system choice, not a regression.

## Evidence of intentional stacked-card design

Multiple lines of evidence confirm the stacked-card pattern is deliberate:

### 1. Widget titles are first-class in the design system

On a richly populated PDP (`COTE SOLEIL Merlot 0.75L`), the PDP layout includes the following widgets, each rendered as a bordered card with its own icon-prefixed title:

- `PROPERTIES` — renders attribute key/value rows (weight, alcohol percentage, company license, region, sort, etc.)
- `DESCRIPTION` — renders HTML content with a `See more` collapse toggle
- `PRICE AND DELIVERY` — main buy block in the right-rail
- `SHIPMENT OPTIONS` — pickup locations link
- `PRODUCT VARIATIONS` — variant list with per-row add-to-cart
- `CUSTOMERS BOUGHT TOGETHER` — cross-sell tiles

On a lean PDP (`DORITOS NACHO BOX 20X44GR`) with no property/description content, the `PROPERTIES` and `DESCRIPTION` widgets simply do not render. Widgets on the Doritos PDP are limited to:

- `FEEDBACK` (reviews list)
- `PRICE AND DELIVERY`
- `SHIPMENT OPTIONS`
- `PRODUCTS RELATED TO THIS ITEM`
- `CUSTOMERS BOUGHT TOGETHER`

This per-product conditional rendering is characteristic of a widget-based composition pattern, not tabs.

### 2. Test-id naming confirms widgets are first-class

`document.querySelectorAll('[data-testid*="widget"]')` returns an element with `data-testid="shipment-options-widget"`. The widget suffix is the canonical naming convention for PDP content sections.

### 3. No `role="tab"` or `role="tabpanel"` rendered, anywhere, on any product

Tested PDPs (all return `tabs: [], tabpanels: 0`):

- `/snacks/chips/doritos-nacho-cheese-box-20x44gr`
- `/kitchen-supplies/everything-for-kitchen/CHAMPAGNE-COOLER-STAINLESS-STEEL-MAT-20CM`
- `/alcoholic-drinks/wine/cote-soleil-merlot-075l` (Properties + Description + Variations)
- `/alcoholic-drinks/efes-beer/erdinger-dunkel-dark-german-wheat-beer-500ml-bottles`
- `/product/b9347522-2df4-4cd8-84b3-45c6593e13e1` (consumer electronics)

If tabs were the intended design, at least one product would render them — none did.

### 4. `VcTabs` component exists in vc-frontend but is not used on the PDP

`github.com/VirtoCommerce/vc-frontend` defines a `VcTabs` component under `client-app/ui-kit/components/molecules/types.d.ts`, but it is not wired into the PDP template. This confirms that tabs are available in the design system but the team chose widgets for the PDP specifically.

## Impact of rewriting the test

Test CAT-046 assertions must be updated from:

> _"PDP renders Description / Specifications / Reviews tabs with role=tab elements"_

to something like:

> _"PDP renders a stacked vertical layout of `.vc-widget` cards. When a product has description content, a DESCRIPTION widget is rendered. When it has custom properties, a PROPERTIES widget is rendered. When it has reviews, a FEEDBACK widget is rendered. None of these widgets are nested inside a tab control."_

Suggested replacement assertions:

1. `data-testid*="widget"` elements exist (e.g., `shipment-options-widget`)
2. For products with properties: `PROPERTIES` widget present and contains at least one attribute row
3. For products with description HTML: `DESCRIPTION` widget present with `See more` toggle
4. For products with reviews: `FEEDBACK` widget present
5. For products with variants: `PRODUCT VARIATIONS` widget present with per-row buy buttons
6. `role="tab"` MUST NOT be present on any PDP (negative assertion to catch regression back to tabs)

## Recommendation to Product Owner

- Update test case CAT-046 in `regression/suites/Frontend/catalog/002-pdp.csv` (or wherever it lives) to assert the widget layout instead of tabs.
- Add a new assertion that locks in the widget contract: specific widgets should render conditionally based on data presence.
- Consider adding a design-system documentation link in the test case (once confirmed with UX team).

## Evidence

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-046-01-wine-stacked-widgets.png` — COTE SOLEIL Merlot PDP showing PROPERTIES and DESCRIPTION rendered as stacked widget cards, plus Price and Delivery, Product Variations, and Customers Bought Together widgets below. No tabs anywhere.

## Cross-reference with existing rejected-bug library

Similar pattern to `BUG_032_051-remember-me-known-gap.md` — test written against old spec, design has since evolved. Action is to update the test case, not file an engineering defect.
