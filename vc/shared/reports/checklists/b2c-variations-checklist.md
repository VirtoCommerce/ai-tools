# B2C Product Variations Test Checklist

**Domain:** Product Configurations & Variations (B2C Layout)
**Related Suites:** 13 (B2C Features), 36 (Configurable Products), 00 (Full Regression), 01 (Smoke)
**TestRail Section:** B2C variation layout (VCST-3459)
**Business Invariants:** BL-PRICE-004 (tiered pricing), BL-CART-001 (max qty), BL-CROSS-*
**Created:** 2026-03-06
**Author:** test-management-specialist

---

## Overview

This checklist covers B2C product variation testing on the Virto Commerce storefront. The B2C layout
is activated when a product has the catalog property `VirtoFrontend_UI_Layout = B2C`. In this mode,
the standard variation list/table view is hidden and replaced with an inline option selector (color
swatches, size buttons, dropdowns) directly on the PDP.

**Test data:** Products in `/products-with-options/` category. 7 variation products + 8 configurable
products available as test data (see domain-checklists.md checklist item 13.14).

**Precondition for all B2C variation tests:**
- Storefront accessible at `${FRONT_URL}`
- At least one product with `VirtoFrontend_UI_Layout = B2C` property set in Admin catalog
- Product has 2+ active variations with variation properties (color, size, fabric, etc.)

---

## A. Variation Display and Layout

*Validates that the B2C selector renders correctly and the standard table/list view is suppressed.*

- [ ] **A.1** B2C layout activated: when `VirtoFrontend_UI_Layout = B2C` is set, the "Options" section renders on PDP and the standard variation list/table view is hidden
  - Priority: Critical | TestRail: C411031 | Suite 13: B2C-VAR-001
- [ ] **A.2** B2C layout NOT activated: when `VirtoFrontend_UI_Layout = B2B` (or property absent), Options section is hidden and standard variation list/table is shown
  - Priority: High | TestRail: C411032
- [ ] **A.3** Color swatches render for a product with color variations: each swatch shows the actual color (CSS background or image), not just a text label
  - Priority: Critical | TestRail: C411048 | Suite 13: B2C-VAR-002
- [ ] **A.4** Size/text option buttons render as button-style selectors (not dropdown) when values are short (S, M, L, XL)
  - Priority: High | Suite 13: B2C-VAR-001
- [ ] **A.5** Option groups are correctly derived from variation properties: if variations have `Color`, `Size`, and `Fabric` properties, three separate option sections render
  - Priority: High | TestRail: C411035
- [ ] **A.6** Up to 150 variations are loaded from the backend; out-of-stock variations are filtered out before rendering the option matrix
  - Priority: High | TestRail: C411034
- [ ] **A.7** The `VirtoFrontend_UI_Layout = B2C` property itself is hidden from the customer-visible PDP properties/specifications section
  - Priority: Medium | TestRail: C411031

---

## B. Option Selection and Validation

*Validates that the interaction model for selecting variation options is correct.*

- [ ] **B.1** Customer can click any available (in-stock) option; selected option shows a visible selected state (border highlight, checkmark, or background change)
  - Priority: Critical | TestRail: C411037 | Suite 13: B2C-VAR-001, B2C-VAR-002
- [ ] **B.2** Only one value per option group is selectable at a time; selecting a new value deselects the previous
  - Priority: Critical | Suite 13: B2C-VAR-003
- [ ] **B.3** Guidance message shown when not all required option groups are selected (e.g., "Please select a size")
  - Priority: High | TestRail: C411041
- [ ] **B.4** "Add to Cart" button is disabled until all required option groups have a selection; enabled immediately upon completing all selections
  - Priority: Critical | TestRail: C411046 | Suite 13: B2C-VAR-004
- [ ] **B.5** After selecting one option, the availability of remaining options refreshes: incompatible combinations are disabled or marked unavailable
  - Priority: High | TestRail: C411039
- [ ] **B.6** If the currently selected option becomes unavailable after another option is changed, the system reselects automatically or clears the selection with a message
  - Priority: High | TestRail: C411042
- [ ] **B.7** Multi-attribute selection (e.g., Size + Color): selecting Size M then Color Blue resolves to the specific M/Blue variant; both attributes required
  - Priority: Critical | Suite 13: B2C-VAR-003

---

## C. Price and Stock Updates on Selection

*Validates BL-PRICE-004 (tier pricing), BL-PRICE-003 (rounding), and BL-CART-001 (stock enforcement).*

- [ ] **C.1** Selecting a color variation updates the displayed price to that variant's price immediately (no page reload)
  - Priority: Critical | TestRail: C411052 | Suite 13: B2C-VAR-006
- [ ] **C.2** Sale price shown as primary price with list price strikethrough when variation has both salePrice and listPrice (BL-PRICE-004)
  - Priority: Critical | TestRail: C411052
- [ ] **C.3** Stock/availability indicator updates on variation selection: shows "In stock", "Low stock", or "Out of stock" for the selected variant specifically
  - Priority: Critical | TestRail: C411052 | Suite 13: B2C-VAR-007
- [ ] **C.4** SKU code on PDP updates to the selected variation's SKU after option selection
  - Priority: High | Suite 13: B2C-VAR-006
- [ ] **C.5** "From $X" price shown on category listing for products with varying prices across variants; specific price shown on PDP after variant is selected
  - Priority: High | domain-checklists.md item 13.3
- [ ] **C.6** All prices display with exactly 2 decimal places; no $12.5 or $12.456 formatting (BL-PRICE-003)
  - Priority: High
- [ ] **C.7** Selecting a variation with tiered pricing: "From $X" label reflects lowest tier; price on PDP matches the correct tier for qty=1 (BL-PRICE-004)
  - Priority: Medium

---

## D. Add to Cart with Variations

*Validates that the correct variant SKU is sent to the cart API and the cart reflects the selection.*

- [ ] **D.1** Add to Cart sends the correct variation SKU (not the parent product SKU) to the xCart `addItem` mutation; verify via Network tab
  - Priority: Critical | TestRail: C411059 | Suite 13: B2C-VAR-005
- [ ] **D.2** Cart line item shows variant details (e.g., "T-Shirt — Size: M, Color: Blue") not just the parent product name
  - Priority: Critical | domain-checklists.md item 13.12 | Suite 13: B2C-VAR-005
- [ ] **D.3** Cart quantity + variation combination: adding qty 2 of Blue/M adds 2 units of that specific SKU; adding Blue/L separately creates a new line item
  - Priority: High
- [ ] **D.4** Changing color/option after the product is already in the cart shows a prompt or updates the cart correctly (does not silently replace)
  - Priority: High | TestRail: C411060
- [ ] **D.5** Minimum quantity enforced per variation: if the selected variant has min qty = 3, default quantity starts at 3 and cannot be set below 3
  - Priority: High | Suite 00: FR-CART-023
- [ ] **D.6** Maximum quantity enforced per variation: stepper "+" disables at max stock for selected variant; entering a higher value auto-corrects
  - Priority: High | Suite 00: FR-CART-017, FR-CART-018 | BL-CART-001
- [ ] **D.7** Pack size validation per variation: entering a non-pack-multiple quantity auto-rounds or shows an error
  - Priority: Medium | Suite 00: FR-CART-024, FR-CART-026

---

## E. Variation Images

*Validates that the image gallery reflects the selected variation.*

- [ ] **E.1** Main product image updates to the selected color/variant's primary image immediately on selection (no reload required)
  - Priority: Critical | TestRail: C411051 | Suite 13: B2C-VAR-002
- [ ] **E.2** Thumbnail gallery updates to show images specific to the selected variation; previously visible thumbnails for other variants are removed or replaced
  - Priority: High | TestRail: C411051
- [ ] **E.3** Color swatch tooltip shows the color name on hover (desktop) or tap (mobile)
  - Priority: Medium | TestRail: C411049
- [ ] **E.4** Color swatch renders the correct color accurately (hex match or image swatch matches variant color)
  - Priority: Medium | TestRail: C411048, C411049
- [ ] **E.5** If the selected variation has no color-specific image, the parent product's default image is shown (no broken image icon)
  - Priority: High

---

## F. Variation Table and List Layout (Default/B2B Layout)

*These cases validate the standard (non-B2C) variation table and list views for contrast and completeness.*

- [ ] **F.1** Default variation layout (no B2C property): variation list view is shown on PDP with rows per variation
  - Priority: Medium | TestRail: C410705
- [ ] **F.2** Default variation layout: variation table view is shown on PDP with columns per attribute
  - Priority: Medium | TestRail: C410706
- [ ] **F.3** Variation table: min/max/stock/pack validation enforced per row (entering invalid qty shows error per variation row)
  - Priority: High | TestRail: C411202 | Suite 00: FR-CART-024
- [ ] **F.4** Variation list: min/max/stock/pack validation enforced per row
  - Priority: High | TestRail: C411203
- [ ] **F.5** Variation table/list: invalid quantity input field resets or rejects non-numeric values
  - Priority: Medium | TestRail: C411185

---

## G. Unavailable Variations

*Validates BL-CART-001 (out-of-stock enforcement) and domain-checklists.md items 13.4, 13.5.*

- [ ] **G.1** Out-of-stock variations are greyed out or disabled in the option selector; cannot be clicked
  - Priority: Critical | domain-checklists.md item 13.4 | Suite 13: B2C-VAR-007
- [ ] **G.2** "Out of Stock" or equivalent badge visible for disabled variation options (not silently hidden)
  - Priority: High | domain-checklists.md item 13.4
- [ ] **G.3** Unavailable option combinations: selecting Color=Red disables sizes that have no Red+Size variant in stock
  - Priority: High | TestRail: C411038 | domain-checklists.md item 13.5
- [ ] **G.4** Matrix reflects changes when variations are removed in Admin: removed variants no longer appear as selectable options (after cache/reindex)
  - Priority: High | TestRail: C411036
- [ ] **G.5** "Add to Cart" button remains disabled when the selected combination is unavailable even if individual options appear selected
  - Priority: Critical | TestRail: C411046
- [ ] **G.6** Stock per variation: inventory shown is specific to the selected variant, not the aggregate across all variants
  - Priority: High | domain-checklists.md item 13.6

---

## H. URL and SEO

*Validates BL-CROSS linkage between variation selection and URL state.*

- [ ] **H.1** URL updates to reflect the selected variation (e.g., `?color=blue&size=m` query parameters or slug change) after option selection
  - Priority: High | TestRail: VCST-4530 (variation shareable links)
- [ ] **H.2** Deep-linking to a variation-specific URL pre-selects the correct options and shows the correct variant price/image on page load
  - Priority: High | TestRail: VCST-4530
- [ ] **H.3** Breadcrumb trail is accurate and unchanged by variation selection (parent category > product name)
  - Priority: Medium | domain-checklists.md items 3.2, 4.2
- [ ] **H.4** Canonical URL on PDP points to the parent product URL (not the variation-specific URL) to avoid duplicate content
  - Priority: Medium | domain-checklists.md item 4.3
- [ ] **H.5** Browser back button after variation selection navigates correctly without losing page state unexpectedly
  - Priority: Medium | TestRail: C411058

---

## I. Cross-Browser and Responsive

*Validates variation selectors work across browsers and viewport sizes.*

- [ ] **I.1** Color swatches and size buttons render correctly and are clickable on mobile (touch tap, min 44x44px touch target)
  - Priority: High | TestRail: C411062 | Suite 13: B2C-VAR-009
- [ ] **I.2** Variation selector layout stacks vertically on mobile viewport (375px width) without horizontal overflow
  - Priority: High | TestRail: C411062
- [ ] **I.3** Variation selectors work in Firefox, Edge, and Chrome without layout differences that obscure options
  - Priority: Medium | Suite 00: FR-BROWSER-003, FR-BROWSER-004
- [ ] **I.4** Swatch hover states (tooltip, border) function on desktop (mouse hover) and are accessible via focus on keyboard navigation
  - Priority: Medium

---

## J. Edge Cases

*Error guessing and boundary value scenarios.*

- [ ] **J.1** Rapid option switching (clicking multiple options quickly): final selected state is correct; no stale price or image from intermediate selection
  - Priority: High
- [ ] **J.2** Browser back/forward navigation after selecting a variation: selected option state is preserved or gracefully reset (no JS error)
  - Priority: High | TestRail: C411058
- [ ] **J.3** Product with a single variation (only one option in each group): selector displays the single option pre-selected; Add to Cart enabled
  - Priority: Medium
- [ ] **J.4** Product with many variations (50+): all in-stock options render without performance degradation or UI overflow; TestRail: C411034 caps at 150
  - Priority: Medium | TestRail: C411034
- [ ] **J.5** Page refresh after selecting variation: page re-loads cleanly; if URL encodes selection, correct variant re-renders
  - Priority: Medium
- [ ] **J.6** Purchased-before badge shows on variation products in catalog listing for items previously purchased (registered user)
  - Priority: Low | TestRail: C415267, C415268
- [ ] **J.7** Purchased-before filter on variation PDP shows only previously purchased variants
  - Priority: Low | TestRail: C415268

---

## Gap Analysis vs Existing Suites

| Checklist Category | Suite 13 (B2C Features) | Suite 36 (Config Products) | Suite 00 (Full Regression) | Suite 01 (Smoke) | Gap |
|--------------------|------------------------|---------------------------|---------------------------|-----------------|-----|
| A. Display & Layout | B2C-VAR-001,002 | CFG-PDP-001 | FR-CART-002 (partial) | None | A.3-A.7 not in smoke/full |
| B. Option Selection | B2C-VAR-003,004 | CFG-PDP-002,005 | FR-CART-002 (partial) | None | B.3-B.6 not in full |
| C. Price/Stock Updates | B2C-VAR-006,007 | CFG-PDP-002,003,004 | None explicit | None | C.1-C.4 missing from full |
| D. Add to Cart | B2C-VAR-005 | CFG-PDP-006,007 | FR-CART-002 | SMK-007 (generic) | Correct SKU verification missing from full/smoke |
| E. Images | B2C-VAR-002 | None | None | None | E.1-E.5 missing from full |
| F. Table/List Layout | None | None | FR-CART-023,024 (qty only) | None | F.1-F.5 missing from full |
| G. Unavailable Variations | B2C-VAR-007 | None | None | None | G.1-G.6 missing from full |
| H. URL & SEO | None | None | None | None | H.1-H.5 missing entirely |
| I. Cross-Browser/Mobile | B2C-VAR-009 | None | FR-BROWSER-005 (generic) | None | I.1-I.2 missing from smoke |
| J. Edge Cases | None | CFG-PDP-010 (scroll) | None | None | J.1-J.5 missing from full |

**Critical gaps for Full Regression (Suite 00):**
1. No test case verifying correct variation SKU sent to cart API (Category D.1)
2. No test cases for price/stock update on variation selection (Category C)
3. No test cases for variation images updating on selection (Category E)
4. No test cases for unavailable/out-of-stock variations (Category G.1-G.3)
5. No smoke test for B2C variation select + add to cart happy path

**Smoke gap:** SMK-007 covers generic "Add to Cart" but does not test variation selection. One smoke test needed for: select variation → Add to Cart → verify correct variant in cart.
