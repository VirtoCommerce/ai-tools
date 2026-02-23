# Test Cases: Configurable Products Feature

**Test Plan:** TP_CONFIGURABLE_PRODUCTS_001
**Version:** 1.0
**Date:** 2026-02-23
**Author:** test-management-specialist
**Total Test Cases:** 35 (TC-CF-001 to TC-CF-020 Storefront + TC-CA-001 to TC-CA-015 Admin)

---

## Section A: Storefront - Configurable Product Detail Page (Frontend)

### TC-CF-001 — Configurable Product PDP Renders Correctly (Happy Path)

| Field | Value |
|-------|-------|
| **ID** | TC-CF-001 |
| **Title** | Configurable product detail page renders all required elements |
| **Section** | Storefront > Configurable Products > PDP Rendering |
| **Priority** | P0 (Critical) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-001 |
| **Estimate** | 5 min |

**Preconditions:**
- Storefront accessible at `${FRONT_URL}`
- User is not logged in (guest)
- "Bike with options" product (SKU: CVQ-54616437) exists in category "Products with Options > Configurations > Build the bike of your dreams"

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `${FRONT_URL}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options` | Page loads without errors |
| 2 | Wait for page to fully render (wait for "Configure" text to appear) | Product detail page is visible |
| 3 | Observe the product name at top of page | Product name "Bike with options" is visible |
| 4 | Observe the base product price | Price $350.00 is displayed |
| 5 | Observe the "Configure the parameters" widget | Widget header "Configure the parameters" is visible below or alongside product info |
| 6 | Observe the accordion section inside the widget | Accordion button with label "Select one" is visible |
| 7 | Observe the accordion subtitle text | Subtitle reads "Personalize your selection further (optional)" |
| 8 | Observe the accordion default state | Accordion is open (expanded) by default |
| 9 | Observe the radio buttons inside the accordion | 5 radio options are visible: "Rear wheel, 26", double-wall rim, motorized", "200CC 250CC 4-Stroke Engine Motor...", "Seat", "Pedals", "None" |
| 10 | Observe default selection state | "None" radio is selected by default |
| 11 | Observe the quantity stepper | Quantity stepper shows value "0" |
| 12 | Observe the Add to Cart button | "Add to cart" button is disabled (greyed out) when qty = 0 |
| 13 | Observe the "Create your own configuration" button | Button with label "Create your own configuration" is visible on the page |
| 14 | Observe the "Customers bought together" section | Section "Customers bought together" is visible with related products listed |
| 15 | Observe the stock indicator | "In stock" badge is visible showing available quantity |

**Expected Overall Result:** All required configurable product PDP elements render correctly. Widget shows "Configure the parameters" header, accordion shows "Select one" with subtitle "Personalize your selection further (optional)", 5 radio options visible with "None" selected by default, quantity stepper starts at 0, Add to Cart button is disabled.

---

### TC-CF-002 — Select Radio Option Updates Price Display

| Field | Value |
|-------|-------|
| **ID** | TC-CF-002 |
| **Title** | Selecting a radio option updates total price display |
| **Section** | Storefront > Configurable Products > Option Selection |
| **Priority** | P0 (Critical) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-008 |
| **Estimate** | 8 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Page fully loaded, "Configure the parameters" widget visible
- "None" is selected by default

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Note the base product price shown on page | Base price: $350.00 |
| 2 | Click the radio button for "Seat" option | Radio for "Seat" becomes selected |
| 3 | Observe the Seat option row price | Seat option shows price $15.00 and extended price $15.00 (qty 1) |
| 4 | Observe the total product price after selecting Seat | Total price updates to reflect $350.00 base + $15.00 option = $365.00 |
| 5 | Click the radio button for "Pedals" option | Radio for "Pedals" becomes selected (Seat becomes deselected) |
| 6 | Observe the Pedals option row price | Pedals shows price $14.00 and extended price $14.00 (qty 1) |
| 7 | Observe total price after selecting Pedals | Total price updates to $350.00 + $14.00 = $364.00 |
| 8 | Click the radio button for "Engine" option | Radio for "200CC 250CC 4-Stroke Engine Motor..." becomes selected |
| 9 | Observe the Engine option row price | Engine shows price $225.00 and extended price $225.00 (qty 1) |
| 10 | Observe total price after selecting Engine | Total price updates to $350.00 + $225.00 = $575.00 |
| 11 | Click "None" radio button | "None" becomes selected, previous option deselected |
| 12 | Observe total price after selecting None | Total price returns to base price $350.00 |

**Expected Overall Result:** Selecting each radio option updates the displayed price to base + option extended price. Selecting "None" returns price to base. Price updates are immediate and reactive.

---

### TC-CF-003 — Rear Wheel Option Sale Price and Strikethrough Display

| Field | Value |
|-------|-------|
| **ID** | TC-CF-003 |
| **Title** | Rear wheel option displays sale price with list price strikethrough and correct extended price |
| **Section** | Storefront > Configurable Products > Price Display |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- "Configure the parameters" widget visible with accordion open

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the "Rear wheel, 26", double-wall rim, motorized" option row | Option row is visible with price info |
| 2 | Observe the unit/sale price displayed on the option row | $88.00 (salePrice) is displayed as the primary price with $126.00 (listPrice) shown with strikethrough |
| 3 | Observe the quantity for the Rear wheel option | Qty: 2 is shown |
| 4 | Observe the extended price for the Rear wheel option | Extended price: $176.00 (2 x $88.00) |
| 5 | Click the radio button for the Rear wheel option | Rear wheel becomes selected |
| 6 | Observe the total price after selecting Rear wheel | Total updates to $350.00 + $176.00 = $526.00 |

**Expected Overall Result:** Rear wheel option displays $88.00 as sale price with $126.00 strikethrough, qty 2, extended $176.00. Selecting the option updates the product total to $526.00.

---

### TC-CF-004 — Quantity Stepper Validation and Add to Cart Enable

| Field | Value |
|-------|-------|
| **ID** | TC-CF-004 |
| **Title** | Quantity stepper starts at 0; Add to Cart enables only when qty >= 1 |
| **Section** | Storefront > Configurable Products > Quantity and Cart |
| **Priority** | P0 (Critical) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Page fully loaded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe the quantity stepper initial value | Quantity stepper shows "0" |
| 2 | Observe the Add to Cart button state | "Add to cart" button is disabled or greyed out when qty = 0 |
| 3 | Attempt to click "Add to cart" while qty = 0 | Nothing happens; button does not respond; no item added to cart |
| 4 | Click the "+" (increment) button on the quantity stepper | Quantity increases to 1 |
| 5 | Observe the Add to Cart button state | "Add to cart" button becomes enabled (clickable, normal color) |
| 6 | Click "+" again | Quantity increases to 2 |
| 7 | Observe the Add to Cart button state | Button remains enabled |
| 8 | Click the "-" (decrement) button | Quantity decreases to 1 |
| 9 | Click "-" again | Quantity decreases to 0 |
| 10 | Observe the Add to Cart button state | "Add to cart" button becomes disabled again when qty = 0 |
| 11 | Attempt to type "0" directly into quantity field (if editable) | Either not accepted or Add to Cart stays disabled |
| 12 | Attempt to type "-1" into quantity field (if editable) | Negative value not accepted; quantity does not go below 0 |

**Expected Overall Result:** Quantity stepper starts at 0 and disables the Add to Cart button. Button enables when qty >= 1. Decrementing back to 0 disables the button again. Negative quantities are not permitted.

---

### TC-CF-005 — Add Configured Product to Cart (Happy Path)

| Field | Value |
|-------|-------|
| **ID** | TC-CF-005 |
| **Title** | Successfully add configured product with option selected to cart |
| **Section** | Storefront > Configurable Products > Add to Cart |
| **Priority** | P0 (Critical) |
| **Type** | Functional, E2E |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-003 |
| **Estimate** | 10 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- User is authenticated (logged in as `${USER_EMAIL}`)
- Cart is empty

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe initial cart state | Cart icon shows 0 items |
| 2 | Click radio button for "Seat" option ($15.00, qty 1) | "Seat" option is selected |
| 3 | Observe price update | Total price shows $350.00 + $15.00 = $365.00 |
| 4 | Click "+" on quantity stepper | Quantity changes from 0 to 1 |
| 5 | Click "Add to cart" button | Loading indicator briefly appears; success notification displayed |
| 6 | Observe cart icon in header | Cart icon updates to show 1 item |
| 7 | Navigate to cart page at `${FRONT_URL}/cart` | Cart page loads |
| 8 | Observe item in cart | "Bike with options" appears as a cart item |
| 9 | Observe the configuration details in cart | Cart item shows the selected option "Seat" listed under or alongside the product |
| 10 | Observe cart item price | Price shown is $365.00 (or $350.00 base with $15.00 option shown separately) |
| 11 | Observe cart subtotal | Subtotal reflects $365.00 |

**Expected Overall Result:** Configured product with "Seat" option is added to cart. Cart shows product with its configuration details and correct total price.

---

### TC-CF-006 — Add Configured Product to Cart with No Option Selected (Optional Section)

| Field | Value |
|-------|-------|
| **ID** | TC-CF-006 |
| **Title** | Add configured product to cart with "None" option selected (optional section) |
| **Section** | Storefront > Configurable Products > Add to Cart |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-003 |
| **Estimate** | 8 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- "None" is selected by default
- Cart is empty

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify "None" radio is selected | "None" option shows as selected in the accordion |
| 2 | Verify accordion label indicates optional | Subtitle reads "Personalize your selection further (optional)" |
| 3 | Click "+" to set quantity to 1 | Quantity becomes 1 |
| 4 | Observe Add to Cart button | Button is enabled |
| 5 | Click "Add to cart" | Item is added to cart without error; no validation error about unselected option |
| 6 | Navigate to cart | Cart page loads |
| 7 | Observe cart item | "Bike with options" appears in cart at base price $350.00 |
| 8 | Observe configuration details in cart | Cart may show "None" or no configuration option listed (no error state) |

**Expected Overall Result:** Optional configuration section allows proceeding with "None" selected. Product added to cart at base price with no validation error.

---

### TC-CF-007 — Accordion Expand and Collapse Behavior

| Field | Value |
|-------|-------|
| **ID** | TC-CF-007 |
| **Title** | Accordion section can be collapsed and expanded; radio options hidden when collapsed |
| **Section** | Storefront > Configurable Products > UI Interaction |
| **Priority** | P2 (Medium) |
| **Type** | Functional, UI |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Page loaded, accordion is open (default state)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify accordion is open by default | Radio options (Rear wheel, Engine, Seat, Pedals, None) are visible |
| 2 | Click the accordion header "Select one" | Accordion collapses; radio options are hidden |
| 3 | Observe accordion state | Accordion button/header indicates collapsed state (chevron points down or closed indicator) |
| 4 | Observe subtitle text when collapsed | Subtitle still reads "Personalize your selection further (optional)" (no option selected) |
| 5 | Click the accordion header again | Accordion expands; radio options become visible again |
| 6 | Select "Seat" option | Seat radio is selected |
| 7 | Click accordion header to collapse | Accordion collapses |
| 8 | Observe subtitle text when "Seat" is selected and accordion collapsed | Subtitle updates to show "Seat" (selected option name) as subtitle |
| 9 | Click accordion header to expand again | Accordion opens; "Seat" remains selected |

**Expected Overall Result:** Accordion expand/collapse works correctly. When an option is selected, the collapsed state shows the selected option name in the subtitle. Re-opening preserves the selection.

---

### TC-CF-008 — Accordion Subtitle Updates When Option Selected

| Field | Value |
|-------|-------|
| **ID** | TC-CF-008 |
| **Title** | Accordion subtitle updates to show selected option name |
| **Section** | Storefront > Configurable Products > UI Interaction |
| **Priority** | P1 (High) |
| **Type** | Functional, UI |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Accordion is open with "None" selected

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe initial subtitle | Subtitle reads "Personalize your selection further (optional)" |
| 2 | Click radio for "Seat" option | "Seat" radio selected |
| 3 | Observe accordion subtitle | Subtitle updates to show "Seat" as the selected option |
| 4 | Click radio for "Pedals" option | "Pedals" radio selected |
| 5 | Observe accordion subtitle | Subtitle updates to show "Pedals" |
| 6 | Click radio for "200CC 250CC 4-Stroke Engine Motor..." | Engine radio selected |
| 7 | Observe accordion subtitle | Subtitle updates to show the full or truncated engine name |
| 8 | Click radio for "None" | "None" selected |
| 9 | Observe accordion subtitle | Subtitle reverts to "Personalize your selection further (optional)" |

**Expected Overall Result:** Accordion subtitle correctly reflects the currently selected option name. When "None" is selected, subtitle returns to default "Personalize your selection further (optional)" text.

---

### TC-CF-009 — No Auto-Scroll When Selecting Long-Named Option

| Field | Value |
|-------|-------|
| **ID** | TC-CF-009 |
| **Title** | Page does not auto-scroll when selecting an option with a long name (VCST-4612 regression check) |
| **Section** | Storefront > Configurable Products > UI Interaction |
| **Priority** | P2 (Medium) |
| **Type** | Functional, UI, Regression |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, VCST-4612 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Page loaded, scroll position at the "Configure the parameters" widget
- "None" is selected (single-line subtitle)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll to configure widget; note scroll position | Widget is visible; scrollY position recorded |
| 2 | Select "Seat" option (short name) | Seat radio selected; subtitle updates to "Seat" |
| 3 | Verify scroll position is unchanged after Seat selection | scrollY remains the same; no page jump |
| 4 | Click radio for "200CC 250CC 4-Stroke Engine Motor For Motorcycle Dirt Bike ATV Engine CG250..." | Engine radio selected; subtitle updates to the engine name |
| 5 | Verify scroll position is unchanged after Engine selection | scrollY remains the same; no page jump even though subtitle text wraps to 2 lines |
| 6 | Click radio for "Seat" again | Seat radio selected; subtitle returns to 1-line "Seat" |
| 7 | Verify scroll position is unchanged | scrollY remains the same; no scroll occurs on subtitle collapse from 2 lines back to 1 line |
| 8 | Switch between "Seat" and "Pedals" several times | Options toggle correctly |
| 9 | Verify no scroll occurs during any selection | Scroll position stable throughout all radio clicks |

**Expected Overall Result:** No auto-scroll occurs when selecting any radio option regardless of the selected option name length or subtitle line wrapping. Page scroll position remains stable throughout all interactions. (Regression check for VCST-4612 fix in Sprint 26-03.)

---

### TC-CF-010 — "Create Your Own Configuration" Button Behavior

| Field | Value |
|-------|-------|
| **ID** | TC-CF-010 |
| **Title** | "Create your own configuration" button is present and functional |
| **Section** | Storefront > Configurable Products > PDP Buttons |
| **Priority** | P2 (Medium) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the "Create your own configuration" button on the page | Button with exact label "Create your own configuration" is visible |
| 2 | Click the "Create your own configuration" button | Button responds with an action |
| 3 | Observe what happens after clicking | Either: navigates to a configuration builder page, opens a modal/dialog, or scrolls to the configuration widget |
| 4 | Verify the action is intentional and not a broken link or error | No 404 error, no JavaScript error in console |

**Expected Overall Result:** "Create your own configuration" button is visible and clickable, triggering the expected action without errors.

---

### TC-CF-011 — "Customers Bought Together" Section Renders

| Field | Value |
|-------|-------|
| **ID** | TC-CF-011 |
| **Title** | "Customers bought together" section displays related configurable products |
| **Section** | Storefront > Configurable Products > Related Products |
| **Priority** | P2 (Medium) |
| **Type** | Functional, UI |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 3 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll down to find "Customers bought together" section | Section heading "Customers bought together" is visible |
| 2 | Observe the products listed | At least 3 related configurable products are displayed: Off-Road Bike, Vintage Wedding Cake, Entertainment set, Hoodie Base (or similar) |
| 3 | Verify product cards in the section have basic info | Product image, name, and price visible per product card |
| 4 | Click one of the related products | Navigates to that product's PDP without error |

**Expected Overall Result:** "Customers bought together" section renders with multiple related configurable products. Product cards are clickable and navigate to correct PDPs.

---

### TC-CF-012 — Configured Product Cart Display Shows Configuration Details

| Field | Value |
|-------|-------|
| **ID** | TC-CF-012 |
| **Title** | Cart displays selected configuration options for a configured product |
| **Section** | Storefront > Configurable Products > Cart |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- User is authenticated
- Cart is empty

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "Engine" option (qty 1, $225.00) | Engine radio selected |
| 2 | Set quantity stepper to 1 | Quantity = 1 |
| 3 | Click "Add to cart" | Product added to cart |
| 4 | Navigate to cart at `${FRONT_URL}/cart` | Cart page loads |
| 5 | Observe cart line items | "Bike with options" appears as cart item |
| 6 | Observe configuration detail in cart | The selected Engine option name is visible under the product as a configuration detail |
| 7 | Observe cart item unit price | Price reflects base + Engine option ($350 + $225 = $575.00) |
| 8 | Observe cart item quantity | Quantity shows 1 |
| 9 | Observe cart subtotal | Subtotal = $575.00 |
| 10 | Increase quantity of configured item to 2 in cart | Quantity becomes 2 |
| 11 | Observe subtotal update | Subtotal updates to $1,150.00 (2 x $575.00) |

**Expected Overall Result:** Cart correctly shows the configured product with its selected option displayed as a sub-item or configuration label. Prices and quantities are correct.

---

### TC-CF-013 — Checkout Flow with Configured Product

| Field | Value |
|-------|-------|
| **ID** | TC-CF-013 |
| **Title** | Checkout completes successfully with configured product in cart |
| **Section** | Storefront > Configurable Products > Checkout |
| **Priority** | P1 (High) |
| **Type** | Functional, E2E |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 15 min |

**Preconditions:**
- Configured product "Bike with options" with "Seat" option added to cart (from TC-CF-005)
- User is authenticated with valid shipping address on file
- Payment method available (test card)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to cart page | Cart shows "Bike with options" with Seat option, qty 1, price $365.00 |
| 2 | Click "Proceed to checkout" or equivalent button | Checkout page loads |
| 3 | Observe configured product in checkout order summary | "Bike with options" visible in order summary with Seat option and price $365.00 |
| 4 | Proceed through shipping step | Shipping address selected or confirmed |
| 5 | Proceed through shipping method selection | Shipping method selected |
| 6 | Proceed through payment step | Payment method entered (test card) |
| 7 | Review order summary before placing order | Order summary shows: Bike with options + Seat option, $365.00 + shipping |
| 8 | Click "Place order" | Order is placed successfully |
| 9 | Observe order confirmation page | Order confirmation page loads with order number |
| 10 | Observe configured item on confirmation | "Bike with options" with Seat option is listed in order summary on confirmation page |

**Expected Overall Result:** Complete checkout succeeds with configured product. Order confirmation page shows the product with its configuration details.

---

### TC-CF-014 — Order History Displays Configuration Details

| Field | Value |
|-------|-------|
| **ID** | TC-CF-014 |
| **Title** | Order history and order detail page show selected configuration options |
| **Section** | Storefront > Configurable Products > Orders |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 8 min |

**Preconditions:**
- A configured product order has been placed (from TC-CF-013)
- User is authenticated

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `${FRONT_URL}/account/orders` | Order history page loads |
| 2 | Find the order that contained the configured product | Order appears in list with order number and date |
| 3 | Click the order to view order details | Order detail page loads |
| 4 | Observe order line items | "Bike with options" appears as a line item |
| 5 | Observe configuration details in order | The selected configuration option (e.g., "Seat") is displayed under or alongside the product |
| 6 | Observe order item price | Price shown matches what was ordered ($365.00) |
| 7 | Observe order total | Order total is consistent with cart total at checkout |

**Expected Overall Result:** Order detail page correctly displays the configured product with its selected options. Configuration details (option name, option price) are preserved and visible in order history.

---

### TC-CF-015 — Multiple Options Price Calculation Accuracy

| Field | Value |
|-------|-------|
| **ID** | TC-CF-015 |
| **Title** | Price calculation is accurate when cycling through multiple options |
| **Section** | Storefront > Configurable Products > Price Calculation |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-008 |
| **Estimate** | 8 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- "None" is selected, base price $350.00 visible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Record base price | $350.00 |
| 2 | Select "Seat" ($15.00 x qty 1 = $15.00 extended) | Total = $350 + $15 = $365.00 |
| 3 | Verify total price = $365.00 | Price displayed matches expected |
| 4 | Select "Pedals" ($14.00 x qty 1 = $14.00 extended) | Total = $350 + $14 = $364.00 |
| 5 | Verify total price = $364.00 | Price displayed matches expected |
| 6 | Select "Engine" ($225.00 x qty 1 = $225.00 extended) | Total = $350 + $225 = $575.00 |
| 7 | Verify total price = $575.00 | Price displayed matches expected |
| 8 | Select "Rear wheel" ($88.00 x qty 2 = $176.00 extended) | Total = $350 + $176 = $526.00 |
| 9 | Verify total price = $526.00 | Price displayed matches expected: $350.00 + $176.00 = $526.00 |
| 10 | Select "None" | Total = $350.00 |
| 11 | Verify total price = $350.00 | Price returns to base |

**Expected Overall Result:** Price calculations are accurate for each option. Extended price = option price x option quantity. Total = base + extended. Cycle through all 5 options verifies no stale price state.

---

### TC-CF-016 — Extended Price Display per Option Row

| Field | Value |
|-------|-------|
| **ID** | TC-CF-016 |
| **Title** | Each option row displays unit price, quantity, and extended price |
| **Section** | Storefront > Configurable Products > Price Display |
| **Priority** | P1 (High) |
| **Type** | Functional, UI |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP
- Accordion is open showing all option rows

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe "Rear wheel, 26", double-wall rim, motorized" row | Row shows unit price, qty 2, and extended price $176.00 |
| 2 | Observe "200CC 250CC 4-Stroke Engine Motor..." row | Row shows unit price $225.00, qty 1, extended price $225.00 |
| 3 | Observe "Seat" row | Row shows unit price $15.00, qty 1, extended price $15.00 |
| 4 | Observe "Pedals" row | Row shows unit price $14.00, qty 1, extended price $14.00 |
| 5 | Observe "None" row | Row shows no price info (or $0.00) |
| 6 | Verify Rear wheel extended = unit price x qty | $88.00 (salePrice) x 2 = $176.00 displayed as extended price |

**Expected Overall Result:** All option rows display pricing information. Extended prices are mathematically consistent: salePrice x quantity. Rear wheel shows $88.00 (sale) with $126.00 strikethrough, extended $176.00. "None" row has no price.

---

### TC-CF-017 — Wishlist Button for Unauthenticated User

| Field | Value |
|-------|-------|
| **ID** | TC-CF-017 |
| **Title** | Wishlist button for unauthenticated user prompts login |
| **Section** | Storefront > Configurable Products > Wishlist |
| **Priority** | P3 (Low) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 3 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP as a guest (not logged in)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the wishlist/save button on the PDP | Wishlist icon/button is visible on the product page |
| 2 | Click the wishlist button | Login dialog/redirect appears prompting the user to sign in |
| 3 | Verify the product is not added to any wishlist | No success message; user prompted to authenticate |

**Expected Overall Result:** Unauthenticated users are prompted to sign in when attempting to add a configurable product to wishlist.

---

### TC-CF-018 — Breadcrumb Navigation from Configurable Product PDP

| Field | Value |
|-------|-------|
| **ID** | TC-CF-018 |
| **Title** | Breadcrumb navigation works correctly from configurable product PDP |
| **Section** | Storefront > Configurable Products > Navigation |
| **Priority** | P3 (Low) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 3 min |

**Preconditions:**
- Navigated to the "Bike with options" PDP via URL

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate breadcrumb navigation on the page | Breadcrumb trail visible showing path from homepage to product |
| 2 | Observe breadcrumb path | Should show: Home > Products with Options > Configurations > Build the bike of your dreams > Bike with options |
| 3 | Click the "Build the bike of your dreams" breadcrumb link | Navigates to the parent category page |
| 4 | Navigate back to the PDP | PDP reloads correctly |
| 5 | Click the "Products with Options" breadcrumb | Navigates to the top-level Products with Options category |

**Expected Overall Result:** Breadcrumb navigation accurately reflects the category hierarchy and all links navigate to correct category pages.

---

### TC-CF-019 — PDP Cross-Browser: Configuration Widget on Firefox

| Field | Value |
|-------|-------|
| **ID** | TC-CF-019 |
| **Title** | Configurable product PDP and configuration widget render correctly on Firefox |
| **Section** | Storefront > Configurable Products > Cross-Browser |
| **Priority** | P1 (High) |
| **Type** | Compatibility |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 8 min |

**Preconditions:**
- Firefox browser available
- Navigated to the "Bike with options" PDP in Firefox

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open PDP in Firefox | Page loads without errors |
| 2 | Observe "Configure the parameters" widget | Widget renders with correct layout in Firefox |
| 3 | Observe radio buttons | Radio buttons display correctly (no broken styling) |
| 4 | Click radio options | Radio selection works, price updates correctly |
| 5 | Set quantity to 1 and click Add to Cart | Cart add succeeds |
| 6 | No console errors specific to Firefox | Check browser console — no Firefox-specific JS errors |

**Expected Overall Result:** Configurable product PDP is fully functional in Firefox. All interactive elements work correctly.

---

### TC-CF-020 — PDP with Out-of-Stock Option Behavior

| Field | Value |
|-------|-------|
| **ID** | TC-CF-020 |
| **Title** | Out-of-stock option product is shown as unavailable or disabled in configuration widget |
| **Section** | Storefront > Configurable Products > Edge Cases |
| **Priority** | P2 (Medium) |
| **Type** | Functional |
| **Assignee** | qa-frontend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 8 min |

**Preconditions:**
- A configurable product exists with at least one option product that is out-of-stock (verify in Admin or use another configurable product with out-of-stock option)
- Navigate to that product's PDP

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to a configurable product PDP that has an out-of-stock option | Page loads |
| 2 | Locate the out-of-stock option in the configuration widget | Option row is visible |
| 3 | Observe the out-of-stock option's state | Option is either: visually greyed out, marked "Out of Stock", or disabled radio button |
| 4 | Attempt to select the out-of-stock option (if not disabled) | Either selection is prevented, or a warning/error is shown |
| 5 | Verify other in-stock options are still selectable | In-stock options can be selected normally |

**Expected Overall Result:** Out-of-stock options are clearly indicated as unavailable. Users cannot select out-of-stock options, or if they can, an appropriate message is shown. In-stock options remain functional.

---

## Section B: Admin SPA - Configurable Product Management (Backend)

### TC-CA-001 — Admin: Create New Configurable Product

| Field | Value |
|-------|-------|
| **ID** | TC-CA-001 |
| **Title** | Create a new configurable product in Admin catalog |
| **Section** | Admin > Catalog > Configurable Products > Create |
| **Priority** | P0 (Critical) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 15 min |

**Preconditions:**
- Admin SPA accessible at `${BACK_URL}`
- Logged in as `${ADMIN}` with catalog edit permissions
- "Products with Options > Configurations" category exists

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `${BACK_URL}` and log in as admin | Admin SPA loads, dashboard visible |
| 2 | Navigate to Catalog module | Catalog module opens |
| 3 | Navigate to the "Products with Options" category or equivalent test category | Category blade opens |
| 4 | Click "Add item" or "Add product" | Product creation form opens |
| 5 | Select product type "Configurable" (or appropriate type that supports configurations) | Configurable product form shown |
| 6 | Enter product name: "QA Test Configurable Product" | Name field populated |
| 7 | Enter product SKU: "QA-CONFIG-TEST-001" | SKU field populated |
| 8 | Set product price to $100.00 | Price entered |
| 9 | Save the product (click Save or OK) | Product saved successfully; no error messages |
| 10 | Verify product appears in category list | "QA Test Configurable Product" visible in category |

**Expected Overall Result:** New configurable product created and saved in Admin catalog.

---

### TC-CA-002 — Admin: Add Configuration Section to Product

| Field | Value |
|-------|-------|
| **ID** | TC-CA-002 |
| **Title** | Add a configuration section (group) to an existing product in Admin |
| **Section** | Admin > Catalog > Configurable Products > Configuration Sections |
| **Priority** | P0 (Critical) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" created in TC-CA-001
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Test Configurable Product" in Admin | Product detail blade opens |
| 2 | Find the Configurations tab or section | Configurations section visible |
| 3 | Click "Add configuration section" or "Add group" | Configuration section form opens |
| 4 | Enter section name: "QA Test Options" | Name field populated |
| 5 | Set the section as optional (not required) | Optional flag set |
| 6 | Save the configuration section | Section saved; no error |
| 7 | Verify section appears in the product's configuration list | "QA Test Options" visible in configurations |

**Expected Overall Result:** Configuration section added to product. Section is visible in the product configuration management view.

---

### TC-CA-003 — Admin: Add Option Products to Configuration Section

| Field | Value |
|-------|-------|
| **ID** | TC-CA-003 |
| **Title** | Add option products to a configuration section |
| **Section** | Admin > Catalog > Configurable Products > Option Products |
| **Priority** | P0 (Critical) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 15 min |

**Preconditions:**
- "QA Test Options" section created in TC-CA-002
- Existing simple products available in catalog to add as options

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the "QA Test Options" configuration section | Section management blade opens |
| 2 | Click "Add option" or "Add product" to the section | Product search/selector opens |
| 3 | Search for an existing product to add as an option (e.g., "Seat") | Product found in search results |
| 4 | Select the product | Product added as an option |
| 5 | Set the option quantity to 1 | Qty field set to 1 |
| 6 | Set the option price (or verify it inherits from product) | Price set or auto-populated |
| 7 | Save the option | Option saved without error |
| 8 | Add a second option product (e.g., "Pedals") with qty 1 | Second option added |
| 9 | Save all changes | All changes saved |
| 10 | Verify both options appear in the section | Both options visible in the configuration section |

**Expected Overall Result:** Two option products added to the configuration section with correct quantities and prices.

---

### TC-CA-004 — Admin: Set Option Price and Quantity

| Field | Value |
|-------|-------|
| **ID** | TC-CA-004 |
| **Title** | Set and update option price and quantity in configuration section |
| **Section** | Admin > Catalog > Configurable Products > Option Products |
| **Priority** | P1 (High) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- Options added to "QA Test Options" section in TC-CA-003
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the first option in the configuration section | Option edit form opens |
| 2 | Update the quantity to 3 | Quantity field updated to 3 |
| 3 | Update the price to $25.00 | Price field updated to $25.00 |
| 4 | Save the option | Saved without error |
| 5 | Verify the option now shows qty 3 and price $25.00 | Updated values displayed |
| 6 | Verify extended price = $25.00 x 3 = $75.00 (if displayed in Admin) | Extended price correct |

**Expected Overall Result:** Option quantity and price can be set and updated. Saved values persist.

---

### TC-CA-005 — Admin: Mark Configuration Section as Required

| Field | Value |
|-------|-------|
| **ID** | TC-CA-005 |
| **Title** | Mark a configuration section as required and verify storefront enforcement |
| **Section** | Admin > Catalog > Configurable Products > Required Options |
| **Priority** | P1 (High) |
| **Type** | Functional, Integration |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001, CONFIG-002 |
| **Estimate** | 15 min |

**Preconditions:**
- "QA Test Configurable Product" with configuration section exists
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the "QA Test Options" configuration section in Admin | Section edit opens |
| 2 | Change the "required" flag to true/on | Required flag enabled |
| 3 | Save the section | Saved without error |
| 4 | Navigate to the configurable product on storefront | Product PDP loads |
| 5 | Observe the accordion label | Accordion subtitle no longer says "(optional)"; may say "(required)" or remove the optional label |
| 6 | Set quantity to 1 without selecting any option (with "None" selected) | Quantity = 1 |
| 7 | Attempt to click "Add to cart" | Validation error: "Please select a required option" or similar message; item NOT added to cart |
| 8 | Select an option from the section | Option selected |
| 9 | Click "Add to cart" | Item successfully added to cart |

**Expected Overall Result:** Required sections prevent adding to cart without a selection. The "(optional)" label is removed when section is required.

---

### TC-CA-006 — Admin: Edit Existing Configuration (Change Option Price)

| Field | Value |
|-------|-------|
| **ID** | TC-CA-006 |
| **Title** | Edit existing configurable product — change an option price and verify on storefront |
| **Section** | Admin > Catalog > Configurable Products > Edit |
| **Priority** | P1 (High) |
| **Type** | Functional, Integration |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 15 min |

**Preconditions:**
- "QA Test Configurable Product" exists with options
- Admin logged in
- Note current price of first option (e.g., $25.00)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open first option in Admin | Option edit form |
| 2 | Change price from $25.00 to $30.00 | Price field updated |
| 3 | Save changes | Saved without error |
| 4 | Navigate to the product PDP on storefront | Page loads |
| 5 | Observe the updated option price | Option now shows $30.00 (price updated immediately or after cache clear) |
| 6 | Verify price calculation uses updated value | Total = base + $30.00 x qty |

**Expected Overall Result:** Price change in Admin is reflected on the storefront. Integration between Admin and Storefront works correctly.

---

### TC-CA-007 — Admin: Add New Section to Existing Product

| Field | Value |
|-------|-------|
| **ID** | TC-CA-007 |
| **Title** | Add a second configuration section to an existing configurable product |
| **Section** | Admin > Catalog > Configurable Products > Configuration Sections |
| **Priority** | P1 (High) |
| **Type** | Functional |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" has one section ("QA Test Options")
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Test Configurable Product" in Admin | Product opens |
| 2 | Add a second configuration section: "QA Color Options" | Section added |
| 3 | Add 2 option products to "QA Color Options" | Options added |
| 4 | Save all changes | Saved |
| 5 | Navigate to storefront PDP | Page loads |
| 6 | Observe "Configure the parameters" widget | Widget now shows TWO accordions (QA Test Options and QA Color Options) |
| 7 | Verify each accordion independently collapses/expands | Both accordions function independently |
| 8 | Select an option in each section | Each section tracks its own selection |

**Expected Overall Result:** Multiple configuration sections render as separate accordions. Each operates independently.

---

### TC-CA-008 — Admin: Remove Option from Configuration Section

| Field | Value |
|-------|-------|
| **ID** | TC-CA-008 |
| **Title** | Remove an option product from a configuration section |
| **Section** | Admin > Catalog > Configurable Products > Delete Option |
| **Priority** | P2 (Medium) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" has section with 2 options
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the option list for "QA Test Options" | Options listed |
| 2 | Select/click the second option to edit or delete | Option detail or delete action available |
| 3 | Click "Delete" or "Remove" for the second option | Confirmation dialog appears |
| 4 | Confirm deletion | Option removed from section |
| 5 | Verify only one option remains in section | Section now shows only 1 option |
| 6 | Navigate to storefront PDP | Page loads |
| 7 | Verify accordion shows only 2 radio options (1 option + None) | Deleted option no longer appears |

**Expected Overall Result:** Option successfully removed from configuration section. Storefront no longer shows the deleted option.

---

### TC-CA-009 — Admin: Delete Entire Configuration Section

| Field | Value |
|-------|-------|
| **ID** | TC-CA-009 |
| **Title** | Delete an entire configuration section from a configurable product |
| **Section** | Admin > Catalog > Configurable Products > Delete Section |
| **Priority** | P2 (Medium) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" has 2 sections (from TC-CA-007)
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Test Configurable Product" in Admin | Product opens |
| 2 | Select "QA Color Options" section for deletion | Section selected |
| 3 | Click "Delete section" | Confirmation dialog shown |
| 4 | Confirm deletion | Section deleted |
| 5 | Verify only "QA Test Options" section remains | Product shows 1 section |
| 6 | Navigate to storefront PDP | Page loads |
| 7 | Observe "Configure the parameters" widget | Only one accordion ("QA Test Options") is shown |

**Expected Overall Result:** Configuration section deleted from Admin. Storefront no longer shows the deleted section in the widget.

---

### TC-CA-010 — Admin: Publish/Activate Configurable Product

| Field | Value |
|-------|-------|
| **ID** | TC-CA-010 |
| **Title** | Publish and activate a configurable product; verify visibility on storefront |
| **Section** | Admin > Catalog > Configurable Products > Publish |
| **Priority** | P0 (Critical) |
| **Type** | Functional, Integration |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" exists but is NOT published/inactive
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Test Configurable Product" in Admin | Product opens |
| 2 | Verify current state is draft/unpublished | Published = false or Status = Draft |
| 3 | Attempt to find the product on storefront (direct URL or catalog browse) | Product NOT visible on storefront (404 or not in catalog) |
| 4 | Return to Admin, click "Publish" or change status to Active | Published flag enabled |
| 5 | Save the product | Product saved as published |
| 6 | Navigate to storefront and search or browse for the product | Product appears in catalog or accessible by direct URL |
| 7 | Open the product PDP | "Configure the parameters" widget is visible |

**Expected Overall Result:** Unpublished product is not visible on storefront. Publishing the product makes it accessible on storefront with all configuration options.

---

### TC-CA-011 — Admin: Validation — Required Fields on Configuration Section

| Field | Value |
|-------|-------|
| **ID** | TC-CA-011 |
| **Title** | Validation error when creating configuration section with missing required fields |
| **Section** | Admin > Catalog > Configurable Products > Validation |
| **Priority** | P2 (Medium) |
| **Type** | Functional, Negative |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 8 min |

**Preconditions:**
- Configurable product open in Admin
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initiate "Add configuration section" | Form opens |
| 2 | Leave section name EMPTY | Name field blank |
| 3 | Click Save | Validation error: "Section name is required" or similar; section NOT saved |
| 4 | Enter a valid section name | Name entered |
| 5 | Click Save | Section saved successfully |

**Expected Overall Result:** Admin validates required fields for configuration sections. Empty name prevents saving with appropriate error message.

---

### TC-CA-012 — Admin: Validation — Duplicate Section Name

| Field | Value |
|-------|-------|
| **ID** | TC-CA-012 |
| **Title** | Adding duplicate configuration section name shows appropriate behavior |
| **Section** | Admin > Catalog > Configurable Products > Validation |
| **Priority** | P2 (Medium) |
| **Type** | Functional, Negative |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 5 min |

**Preconditions:**
- "QA Test Configurable Product" has section "QA Test Options"
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to add a second section with the same name "QA Test Options" | Section form shown |
| 2 | Click Save | Either: validation error "Section name already exists" OR system allows it (note behavior) |
| 3 | If allowed: verify storefront shows two sections with same name | Document if duplicates cause UI issues |

**Expected Overall Result:** System either prevents duplicate section names with an error or handles them gracefully without causing storefront errors. Behavior is documented.

---

### TC-CA-013 — Admin: Edit Product Name and Verify on Storefront

| Field | Value |
|-------|-------|
| **ID** | TC-CA-013 |
| **Title** | Editing the configurable product name in Admin updates the storefront PDP |
| **Section** | Admin > Catalog > Configurable Products > Edit |
| **Priority** | P1 (High) |
| **Type** | Functional, Integration |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Test Configurable Product" is published and visible on storefront
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Test Configurable Product" in Admin | Product opens |
| 2 | Change product name to "QA Updated Configurable Product" | Name field updated |
| 3 | Save the product | Saved without error |
| 4 | Navigate to the product on storefront (direct URL or search) | Product PDP loads |
| 5 | Observe the product name on storefront | Name now shows "QA Updated Configurable Product" |

**Expected Overall Result:** Product name change in Admin reflects on storefront after save (and cache refresh if applicable).

---

### TC-CA-014 — Admin: View Configured Orders in Order Management

| Field | Value |
|-------|-------|
| **ID** | TC-CA-014 |
| **Title** | Orders containing configured products show configuration details in Admin |
| **Section** | Admin > Orders > Configured Orders |
| **Priority** | P1 (High) |
| **Type** | Functional, Integration |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- A configured product order has been placed on storefront (from TC-CF-013)
- Admin logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Orders module in Admin | Orders list loads |
| 2 | Find the order placed with the configured product | Order appears in list |
| 3 | Open the order | Order detail blade opens |
| 4 | Observe line items | "Bike with options" (or the configured product) appears as a line item |
| 5 | Observe configuration details in order | The selected option (e.g., "Seat") is visible as a sub-item or configuration attribute |
| 6 | Verify order total | Order total matches what customer paid |
| 7 | Verify order status can be updated | Change order status to "Processing" — saves without error |

**Expected Overall Result:** Admin orders view shows configured products with their selected options. Order total is consistent. Order management operations work for configured orders.

---

### TC-CA-015 — Admin: Delete Configurable Product

| Field | Value |
|-------|-------|
| **ID** | TC-CA-015 |
| **Title** | Delete a configurable product from Admin and verify it is removed from storefront |
| **Section** | Admin > Catalog > Configurable Products > Delete |
| **Priority** | P2 (Medium) |
| **Type** | Functional, CRUD |
| **Assignee** | qa-backend-expert |
| **References** | TP_CONFIGURABLE_PRODUCTS_001 |
| **Estimate** | 10 min |

**Preconditions:**
- "QA Updated Configurable Product" exists and is published
- Admin logged in
- Note the direct storefront URL for this product

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "QA Updated Configurable Product" in Admin | Product opens |
| 2 | Click "Delete" | Confirmation dialog appears |
| 3 | Confirm deletion | Product deleted from Admin catalog |
| 4 | Verify product no longer in category list | Product absent from catalog |
| 5 | Navigate to product's direct URL on storefront | 404 page or "Product not found" message shown |
| 6 | Search for the product on storefront | Product does not appear in search results |

**Expected Overall Result:** Deleted configurable product is removed from Admin catalog and no longer accessible on storefront. Users receive a 404 or similar for direct URL access.

---

## Test Case Summary

| Total Test Cases | 35 |
|---|---|
| Storefront (TC-CF-*) | 20 |
| Admin (TC-CA-*) | 15 |

| Priority | Count | % |
|----------|-------|---|
| P0 (Critical) | 6 | 17% |
| P1 (High) | 18 | 51% |
| P2 (Medium) | 9 | 26% |
| P3 (Low) | 2 | 6% |

| Section | Count |
|---------|-------|
| PDP Rendering | 1 |
| Option Selection | 1 |
| Price Display | 3 |
| Quantity and Cart | 2 |
| Cart Display | 1 |
| Checkout / Orders | 2 |
| UI Interaction | 3 |
| PDP Buttons | 1 |
| Related Products | 1 |
| Cross-Browser | 1 |
| Edge Cases | 1 |
| Admin - Create | 1 |
| Admin - Sections | 3 |
| Admin - Options | 2 |
| Admin - Edit | 3 |
| Admin - Publish | 1 |
| Admin - Validation | 2 |
| Admin - Orders | 1 |
| Admin - Delete | 1 |

---

*Test Cases Version 1.0 — Generated 2026-02-23 by test-management-specialist*
*Based on live UI exploration of v2.42.0-alpha.2241 at `${FRONT_URL}/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`*
