# Exploratory Session: Configurable Products -- Full Flow

**Date:** 2026-03-26
**Duration:** ~18 minutes active exploration
**Platform:** 3.1010.0
**Theme:** 2.45.0-pr-2215
**XCart module:** 3.1004.0-pr-104 (PR build)
**Browser:** Edge (fallback -- Firefox failed to launch due to profile lock)
**Account:** mutykovaelena@gmail.com (Bence and Family org)
**Charter:** Explore all configurable product section types, cart integration, pricing, and checkout flow

## Products Explored

| Product | URL Slug | Sections Tested | Time Spent |
|---------|----------|-----------------|------------|
| Configurable Hat | configurable-caps-shirts/configurable-hat | Product x2, Text, File (header only) | ~8 min |
| Off-Road Bike | configurations/off-road-bike | Product, Variation x2, Text (required) | ~5 min |
| Base product EN | configurable-caps-shirts/111111 | File (req), Text (req), Product (req) -- overview only | ~3 min |
| Products with options (category) | products-with-options | Category listing | ~2 min |

## Findings

### Bugs Found

| # | Severity | Title | Product | Steps to Reproduce | Evidence |
|---|----------|-------|---------|-------------------|----------|
| 1 | Medium | Variation sections render completely empty (no options) | Off-Road Bike | 1. Navigate to Off-Road Bike product page. 2. Expand "Variations" section. 3. Observe empty radiogroup with no selectable options. Same for "Variation section2". | `evidence/BUG-variation-section-empty.png` |
| 2 | Low | Multiple product image 404 errors in category listing | Products with options category | 1. Navigate to /products-with-options. 2. Open browser console. 3. Observe 7 console errors for missing images (flannel, jeans, grey product images). | Console log: `test-results/edge/console-2026-03-26T13-50-52-356Z.log` |
| 3 | Low | Off-Road Bike product image 404 error | Off-Road Bike | 1. Navigate to Off-Road Bike PDP. 2. Check console. 3. Two 404 errors for product image from external host (netdirector.co.uk) and a file API endpoint. | Console log: `test-results/edge/console-2026-03-26T13-55-51-636Z.log` |

### Previously Known Bugs -- Status Update

| # | Severity | Title | Previous Status | Current Status |
|---|----------|-------|-----------------|----------------|
| BUG_072b_001 | Critical | OOS configuration options selectable with no disabled state | Open | Not tested in this session (would require OOS product options) |
| BUG-3 | Low | File upload area stays clickable at max 5 files | Open | Not re-verified (File section observed but not deep-tested) |
| BUG-4 | Medium | "None" radio doesn't clear uploaded files | Open | Not re-verified |
| BUG-5 | Medium | 0-byte file accepted on required file section | Open | Not re-verified |
| Variation sections empty | Medium (documented) | Variation section renders empty on Bike with options | Open | **Still present** -- confirmed on both "Variations" and "Variation section2" sections |

### Risk Areas

- **Quantity stepper behavior on configurable products with required sections:** When the initial add-to-cart fails validation (required section not filled), the quantity spinner shows "1" on the product page. After fixing the required section and clicking decrease (1 to 0), the item appears to get added to cart instead of being removed. The interaction between validation state and quantity changes needs deeper investigation.
- **Variation section type:** Completely non-functional. Any product relying on variation sections for configuration cannot be properly configured. This blocks the entire Variation section feature.
- **Cart desync risk with XCart PR build:** The XCart module is running a PR build (3.1004.0-pr-104). While basic add/remove/quantity operations worked correctly during this session, the PR nature means edge cases around cart state management should be tested more thoroughly.
- **Edit configuration timing:** When clicking "Edit configuration" from the cart, there is a brief moment during page load where all sections appear unselected (None). The selections then populate correctly. If a user interacts during this loading window, selections could be lost.

### Observations

- **Product section pricing is accurate and responsive.** Switching between options (Black hat $10, Beige hat $500, Green hat $18, Red hat $14, None) instantly updates the sidebar price. Multi-section pricing correctly sums: base ($10) + section 1 option + section 2 option = total.
- **Text section supports both predefined values and custom input.** The hybrid approach (radio buttons for predefined + text input for custom) works well. Selecting the text input auto-selects the "Custom option" radio. Switching to a predefined value properly changes the selection.
- **XSS prevention works.** Entering `<script>alert('XSS')</script>` in the custom text input renders as plain text in the section header. No script execution occurred.
- **Text sections do not affect pricing.** Only Product section options contribute to the calculated price.
- **Required section validation works.** Attempting to add to cart with an unfilled required Text section shows a clear error notification ("Sorry, this product cannot be added to cart. Check your product configuration") and the section header changes to "Section is required" in red.
- **Cart correctly displays configuration details.** The "Components list" collapsible section shows all configured items (text selections, product selections) with proper numbering. The "Edit configuration" link correctly navigates back to the product page with the `lineItemId` parameter.
- **Edit configuration preserves selections.** After navigating via "Edit configuration" from the cart, all previously selected options (Product sections, Text sections) are correctly restored on the product page, including the total price.
- **Order total formula verified (BL-CHK-006).** For the Configurable Hat ($40 base config) + Off-Road Bike ($550 sale / $650 list): Subtotal $690 - Discount $100 + Shipping $0 + Tax $118 = Total $708. Correct.
- **Sale price / list price display.** The Off-Road Bike correctly shows both sale price ($550) and strikethrough list price ($650) with a -15% badge in the cart.
- **Accordion behavior.** Only one section can be expanded at a time within the configuration widget. Expanding a new section collapses the previously open one. Section headers correctly display the selected option name or "Personalize your selection further (optional)" when None is selected.
- **Base product EN** uses a different sidebar layout ("Variations in cart: 0" + "View cart") instead of the standard price/quantity stepper, reflecting its master-product-with-variations architecture.

### Questions

- Is the Variation section type expected to be empty on the Off-Road Bike, or is this a data configuration issue vs. a code bug? If the product has no variations assigned to those sections, the empty state should perhaps show a message rather than a blank area.
- What is the expected behavior when a user tries to decrease quantity from 1 to 0 on a configurable product that was initially blocked by validation? Should decreasing to 0 remove the item, or should it trigger an update with the now-valid configuration?
- The "Product not required not description *" section on Base product EN has a confusing name -- is this intentional test data or a naming issue?

## Session Metrics

| Metric | Value |
|--------|-------|
| Products explored | 4 |
| Section types tested | Product (PASS), Text (PASS), Variation (FAIL - empty), File (header only) |
| New bugs found | 1 functional (Variation empty) + 2 cosmetic (image 404s) |
| Known bugs confirmed | 1 (Variation sections still empty) |
| Console errors observed | 9 total (all image 404s, none functional) |
| Network failures blocking tests | 0 |
| Cross-layer verifications | Cart <-> PDP (Edit configuration), Cart pricing, Order total formula |
