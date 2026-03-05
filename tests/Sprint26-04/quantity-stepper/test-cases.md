# Quantity Stepper - Test Cases

**Component:** Quantity Stepper (`spinbutton "Product quantity"` + `button "Decrease quantity"` + `button "Increase quantity"`)
**Date:** 2026-03-05
**Author:** test-management-specialist
**Total:** 35 test cases (P0: 8, P1: 19, P2: 8)

## UI Discovery Summary

- Present on: Category listing cards, Product Detail Pages (PDP), Cart page
- Accessible role: `spinbutton` with label "Product quantity"
- Decrease button: `button "Decrease quantity"` (disabled at qty=0 on PDP/listing, disabled at minimum in cart)
- Increase button: `button "Increase quantity"`
- "in Cart" count indicator appears adjacent to stepper when qty > 0 (PDP/listing)
- Stock count shown as "In stock" label with count adjacent to stepper on cart
- Cart also shows "Remove from cart" button (separate from stepper)
- Bulk Order page uses SKU,Qty text format - not a stepper component
- Storefront version: 2.43.0-pr-2200-24c5

**Invariant coverage:** BL-CART-001 (max qty), BL-CART-006 (pack size), BL-CART-007 (same SKU increments, no duplicate line), BL-PRICE-004 (tier pricing boundary)

---

## Group 1: PDP Stepper - Happy Path

### QS-PDP-001
**Title:** Increment quantity from 0 to 1 via "Increase quantity" button on PDP
**Priority:** P0
**Preconditions:** User is signed in. Navigate to `/e2e-test-ram/e2e-test-kingston-valueram-ddr4-3200-4gb` (product "[E2E Test] Kingston ValueRAM DDR4 3200 4Gb", $24.96, in stock). Cart does not already contain this product.
**Test Data:** Product SKU JOF-41986355, price $24.96.

**Steps:**
1. Observe the stepper in the "Price and delivery" sidebar section: the `spinbutton "Product quantity"` shows value "0" and the "Decrease quantity" button is disabled.
2. Click the "Increase quantity" button.
3. Observe the `spinbutton "Product quantity"` value.
4. Observe the "in Cart" indicator that appears adjacent to the stepper.
5. Observe the Cart icon badge count in the navigation bar.
6. Observe the state of the "Decrease quantity" button.

**Expected Results:**
- Step 3: `spinbutton "Product quantity"` value changes to "1".
- Step 4: An "in Cart" indicator appears showing "1".
- Step 5: Cart badge increments by 1 (product is immediately added to cart - no separate "Add to Cart" button click required).
- Step 6: "Decrease quantity" button becomes enabled (no longer disabled).

---

### QS-PDP-002
**Title:** Increment quantity multiple times sequentially on PDP
**Priority:** P0
**Preconditions:** Same as QS-PDP-001. Product is in stock. Cart does not contain this product.

**Steps:**
1. Click "Increase quantity" button - quantity becomes 1.
2. Click "Increase quantity" button again - quantity becomes 2.
3. Click "Increase quantity" button again - quantity becomes 3.
4. Observe the `spinbutton "Product quantity"` value after each click.
5. Observe the "in Cart" indicator value after each click.
6. Observe the Cart badge count in the navigation bar after each click.

**Expected Results:**
- After step 1: spinbutton = "1", "in Cart" indicator = "1", cart badge increments by 1.
- After step 2: spinbutton = "2", "in Cart" indicator = "2", cart badge increments by 1.
- After step 3: spinbutton = "3", "in Cart" indicator = "3", cart badge increments by 1.
- No additional line items are created in the cart - the existing line quantity is updated each time.

---

### QS-PDP-003
**Title:** Decrement quantity from 2 to 1 via "Decrease quantity" button on PDP
**Priority:** P0
**Preconditions:** User is signed in. Product has quantity 2 in cart (use QS-PDP-002 as setup, or add product with qty=2 directly).

**Steps:**
1. Verify `spinbutton "Product quantity"` shows "2" and "in Cart" indicator shows "2".
2. Click the "Decrease quantity" button.
3. Observe the `spinbutton "Product quantity"` value.
4. Observe the "in Cart" indicator value.
5. Observe the Cart badge count in the navigation bar.

**Expected Results:**
- Step 3: spinbutton value = "1".
- Step 4: "in Cart" indicator = "1".
- Step 5: Cart badge decrements by 1.
- The "Decrease quantity" button remains enabled (qty is still 1, above the minimum of 0 on PDP).

---

### QS-PDP-004
**Title:** Decrement quantity from 1 to 0 removes product from cart
**Priority:** P0
**Preconditions:** User is signed in. Product has quantity 1 in cart (spinbutton shows "1", "in Cart" indicator shows "1").

**Steps:**
1. Verify `spinbutton "Product quantity"` shows "1" and "Decrease quantity" button is enabled.
2. Click the "Decrease quantity" button.
3. Observe the `spinbutton "Product quantity"` value.
4. Observe whether the "in Cart" indicator is still visible.
5. Observe the Cart badge count in the navigation bar.
6. Observe the state of the "Decrease quantity" button.

**Expected Results:**
- Step 3: spinbutton value = "0".
- Step 4: "in Cart" indicator disappears (is no longer rendered in the DOM).
- Step 5: Cart badge decrements by 1 (product removed from cart entirely).
- Step 6: "Decrease quantity" button becomes disabled again.

---

### QS-PDP-005
**Title:** Category listing card stepper increments quantity and shows "in Cart" indicator
**Priority:** P0
**Preconditions:** User is signed in. Navigate to `/e2e-test-ram`. Product "[E2E Test] Kingston ValueRAM DDR4 3200 4Gb" is visible on the listing with qty=0.

**Steps:**
1. Locate the product card for "[E2E Test] Kingston ValueRAM DDR4 3200 4Gb". Observe the stepper: spinbutton shows "0", "Decrease quantity" is disabled.
2. Click the "Increase quantity" button on the product card.
3. Observe the spinbutton value, "in Cart" indicator, and Cart badge.
4. Click "Increase quantity" again.
5. Observe the spinbutton value, "in Cart" indicator, and Cart badge.

**Expected Results:**
- Step 3: spinbutton = "1", "in Cart" indicator appears with "1", Cart badge increments by 1.
- Step 5: spinbutton = "2", "in Cart" indicator = "2", Cart badge increments by 1.
- Behavior matches PDP stepper - same immediate add-to-cart mechanic.

---

### QS-PDP-006
**Title:** Same SKU added from listing and PDP increments one line item, does not create duplicate
**Priority:** P0
**Preconditions:** User is signed in. Cart is empty or does not contain "[E2E Test] Kingston ValueRAM DDR4 3200 4Gb".

**Steps:**
1. Navigate to `/e2e-test-ram` category listing. Click "Increase quantity" on the Kingston 4Gb card - qty becomes 1.
2. Navigate to `/e2e-test-ram/e2e-test-kingston-valueram-ddr4-3200-4gb` (PDP for same product).
3. Observe the `spinbutton "Product quantity"` on PDP.
4. Click "Increase quantity" on the PDP.
5. Navigate to `/cart`.
6. Count the number of line items for "[E2E Test] Kingston ValueRAM DDR4 3200 4Gb".
7. Observe the quantity shown for that line item.

**Expected Results:**
- Step 3: PDP spinbutton shows "1" (reflecting the qty already in cart from step 1).
- Step 6: Exactly one line item exists for this product SKU in the cart.
- Step 7: Line item quantity = 2 (not two separate lines of qty 1 each). Satisfies BL-CART-007.

---

## Group 2: Cart Stepper - Happy Path

### QS-CART-001
**Title:** Cart stepper increments line item quantity and recalculates line total
**Priority:** P0
**Preconditions:** User is signed in. Cart contains "Fanta Orange Bottle 500ml" with qty=2 at $7,777.00/unit. Navigate to `/cart`.

**Steps:**
1. Observe the `spinbutton "Product quantity"` for "Fanta Orange Bottle 500ml" - it shows "2". Line total shows $15,554.00.
2. Click the "Increase quantity" button for that line item.
3. Observe the spinbutton value.
4. Observe the line total displayed for that item.
5. Observe the "Subtotal" and "Total" in the Order Summary sidebar.

**Expected Results:**
- Step 3: spinbutton = "3".
- Step 4: Line total = $23,331.00 (3 x $7,777.00). Calculation is exact - no floating-point rounding artifact.
- Step 5: Subtotal updates to reflect the new line total. Total = Subtotal + Tax + Shipping - Discount.

---

### QS-CART-002
**Title:** Cart stepper decrements line item quantity and recalculates line total
**Priority:** P0
**Preconditions:** Cart contains a line item with qty=2. Navigate to `/cart`.

**Steps:**
1. Confirm spinbutton shows "2" for the line item.
2. Click the "Decrease quantity" button for that line item.
3. Observe the spinbutton value.
4. Observe the line total displayed for that item.
5. Observe the "Subtotal" and "Total" in the Order Summary sidebar.

**Expected Results:**
- Step 3: spinbutton = "1".
- Step 4: Line total = 1 x unit price (recalculated correctly).
- Step 5: Order summary (Subtotal, Total) updates immediately.

---

### QS-CART-003
**Title:** "Decrease quantity" button is disabled when cart line item reaches minimum allowed quantity
**Priority:** P1
**Preconditions:** Cart contains a product with qty=1 (no pack-size or MOQ configured for this product - minimum is 1). Navigate to `/cart`.

**Steps:**
1. Observe the `spinbutton "Product quantity"` shows "1".
2. Observe the state of the "Decrease quantity" button.
3. Attempt to click the "Decrease quantity" button.

**Expected Results:**
- Step 2: "Decrease quantity" button is in a disabled state (cannot be clicked).
- Step 3: Button does not respond. Quantity remains "1". Line item remains in cart. Cart total unchanged.
- Note: On PDP/listing, the "Decrease quantity" button becomes disabled at qty=0. On the cart, the minimum before removal is 1 (product cannot have qty=0 in cart - use "Remove from cart" button to remove).

---

## Group 3: Direct Quantity Input

### QS-INPUT-001
**Title:** Direct keyboard entry of a valid quantity in the spinbutton field on PDP
**Priority:** P1
**Preconditions:** User is signed in. Navigate to PDP. Product has qty=1 in cart (spinbutton shows "1").

**Steps:**
1. Click on the `spinbutton "Product quantity"` field to focus it.
2. Select all existing text and type "5".
3. Press Tab or click elsewhere to commit the value.
4. Observe the spinbutton value, "in Cart" indicator, and Cart badge.

**Expected Results:**
- Spinbutton accepts the input "5".
- After committing: spinbutton = "5", "in Cart" indicator = "5", Cart badge updates to reflect the new quantity.
- Cart is updated to qty=5 for this product without creating a duplicate line.

---

### QS-INPUT-002
**Title:** Direct keyboard entry of a valid quantity in the spinbutton field on cart page
**Priority:** P1
**Preconditions:** Cart contains a product with qty=1. Navigate to `/cart`. Spinbutton shows "1".

**Steps:**
1. Click on the `spinbutton "Product quantity"` field for the line item to focus it.
2. Select all text and type "10".
3. Press Enter or click elsewhere to commit.
4. Observe the spinbutton value.
5. Observe the line total.
6. Observe the Order Summary subtotal and total.

**Expected Results:**
- Spinbutton = "10" after commit.
- Line total = 10 x unit price.
- Order Summary updates immediately.

---

### QS-INPUT-003
**Title:** Entering quantity "0" in the spinbutton field on PDP removes product from cart
**Priority:** P1
**Preconditions:** Product has qty=1 in cart. PDP spinbutton shows "1".

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and type "0".
3. Press Tab or click elsewhere to commit.
4. Observe spinbutton, "in Cart" indicator, and Cart badge.

**Expected Results:**
- Spinbutton = "0".
- "in Cart" indicator disappears.
- Cart badge decrements - product removed from cart.
- "Decrease quantity" button becomes disabled.

---

### QS-INPUT-004
**Title:** Entering a negative number in the spinbutton field is rejected or treated as 0
**Priority:** P1
**Preconditions:** Product is in cart with qty=1. PDP or cart spinbutton shows "1".

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and type "-1".
3. Press Tab or Enter to commit.
4. Observe the spinbutton value and cart state.

**Expected Results:**
- The field does not accept a negative value, OR the value is rejected/corrected on commit.
- Quantity remains at the last valid value (e.g., 1) or falls back to minimum (0 on PDP, 1 on cart).
- No console errors indicating an invalid API call with qty=-1.
- Cart line item quantity is not set to a negative value.

---

### QS-INPUT-005
**Title:** Entering a non-numeric value in the spinbutton field is rejected
**Priority:** P1
**Preconditions:** Product is in cart. Spinbutton shows a valid quantity.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and type "abc".
3. Press Tab or Enter to commit.
4. Observe the spinbutton value and cart state.

**Expected Results:**
- The spinbutton field does not accept non-numeric characters (browser-level validation for input type="number" or spinbutton), OR the value is cleared/reverted on commit.
- Quantity reverts to last valid value.
- No API call is made with an invalid quantity.

---

### QS-INPUT-006
**Title:** Entering a decimal number in the spinbutton field is rejected or rounded
**Priority:** P2
**Preconditions:** Product is in cart. Spinbutton shows a valid integer quantity.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and type "1.5".
3. Press Tab or Enter to commit.
4. Observe the spinbutton value.

**Expected Results:**
- The value is either rejected (field reverts) or rounded to nearest integer (1 or 2).
- Cart is not updated with a fractional quantity.
- No API call sent with qty=1.5.

---

### QS-INPUT-007
**Title:** Entering a very large number (beyond available stock) in the spinbutton field
**Priority:** P1
**Preconditions:** A product with known, finite stock (e.g., stock=100). Product not yet in cart or has qty=1.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field on PDP or cart.
2. Select all and type "99999".
3. Press Tab or Enter to commit.
4. Observe the spinbutton value.
5. Check whether an error or warning message appears near the stepper.
6. Observe the "in Cart" indicator and Cart badge.

**Expected Results:**
- The system either: (a) caps the quantity to available stock and shows a message such as "Only X items available", OR (b) accepts the input and shows a warning at cart/checkout level.
- Quantity is not accepted as 99999 if stock is lower (BL-CART-001).
- "+" button (Increase quantity) is disabled once max stock is reached.

---

## Group 4: Boundary Values

### QS-BVA-001
**Title:** "Decrease quantity" button is disabled at quantity 0 on PDP/listing
**Priority:** P0
**Preconditions:** Navigate to any in-stock product PDP or listing card. Product is NOT in the cart (qty=0).

**Steps:**
1. Observe the stepper: `spinbutton "Product quantity"` shows "0".
2. Observe the "Decrease quantity" button state.
3. Attempt to interact with the "Decrease quantity" button.

**Expected Results:**
- "Decrease quantity" button is disabled (aria-disabled or visually disabled, cannot be activated).
- Quantity remains "0". No API call is fired.
- No console error.

---

### QS-BVA-002
**Title:** "Increase quantity" button reaches and enforces maximum available stock
**Priority:** P1
**Preconditions:** A product with a known low stock count (e.g., stock=3). Use a product that clearly shows "In stock: N". Product has qty=0 in cart.

**Steps:**
1. Click "Increase quantity" three times to reach qty=3 (max stock).
2. Observe the state of the "Increase quantity" button at qty=3.
3. Attempt to click "Increase quantity" a fourth time.
4. Observe the spinbutton value and any message displayed.

**Expected Results:**
- After step 1: qty=3, Cart badge has increased by 3.
- Step 2: "Increase quantity" button becomes disabled at max stock.
- Step 3: No action occurs (button is disabled).
- Step 4: Spinbutton remains at "3". No message about adding more than available inventory.
- Satisfies BL-CART-001: max quantity enforced at stock level.

---

### QS-BVA-003
**Title:** Quantity 1 is the minimum that keeps a product in the cart (on cart page)
**Priority:** P0
**Preconditions:** Cart contains a product with qty=2. Navigate to `/cart`.

**Steps:**
1. Verify spinbutton shows "2". "Decrease quantity" button is enabled.
2. Click "Decrease quantity". Spinbutton shows "1".
3. Observe the "Decrease quantity" button state at qty=1.
4. Confirm product is still in the cart with qty=1.

**Expected Results:**
- Step 3: "Decrease quantity" button is disabled at qty=1 (on the cart page, 1 is the enforced minimum - further decrement would require using "Remove from cart").
- Step 4: Product remains in cart. Line total = 1 x unit price.

---

### QS-BVA-004
**Title:** "Remove from cart" button removes the line item without using the stepper
**Priority:** P1
**Preconditions:** Cart contains a product. Navigate to `/cart`.

**Steps:**
1. Locate the "Remove from cart" button for a line item.
2. Click "Remove from cart".
3. Observe whether the line item is removed from the cart.
4. Observe the Cart badge count, Subtotal, and Total in the Order Summary.

**Expected Results:**
- The line item is removed entirely from the cart (regardless of current qty).
- Cart badge decrements by the quantity that was in that line.
- Subtotal, Tax, and Total recalculate without the removed item.
- If the cart becomes empty, an appropriate empty cart state is displayed.

---

## Group 5: Pack Size / Minimum Order Quantity

### QS-PACK-001
**Title:** Stepper increments by pack size when product has a configured pack size (MOQ)
**Priority:** P1
**Preconditions:** A product with a pack size configured (e.g., sold in multiples of 6). Product has qty=0. Navigate to the product's PDP or listing card.
**Note:** Identify a suitable product from the catalog or Admin that has MOQ/pack size set.

**Steps:**
1. Observe the initial spinbutton value: "0" (or the pack size minimum if pre-set).
2. Click "Increase quantity" once.
3. Observe the spinbutton value.
4. Click "Increase quantity" a second time.
5. Observe the spinbutton value.

**Expected Results:**
- Step 3: Spinbutton shows the pack size quantity (e.g., "6"), not "1". The stepper jumps directly to the minimum pack size.
- Step 5: Spinbutton shows 2 x pack size (e.g., "12").
- Each "Increase quantity" click increments by the configured pack size, not by 1.
- Satisfies BL-CART-006.

---

### QS-PACK-002
**Title:** Direct entry of a non-multiple quantity is rejected or auto-rounded to nearest pack size multiple
**Priority:** P1
**Preconditions:** Same pack-size product from QS-PACK-001. Spinbutton shows the pack size value (e.g., "6").

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and type "7" (not a multiple of pack size 6).
3. Press Tab or Enter to commit.
4. Observe the spinbutton value and any message.

**Expected Results:**
- The system either rejects "7" and reverts to the previous valid value ("6"), OR auto-rounds up to the next multiple of the pack size ("12").
- An informational message may appear (e.g., "Quantity must be a multiple of 6").
- Cart is not updated with qty=7 for a pack-size-6 product.
- Satisfies BL-CART-006.

---

### QS-PACK-003
**Title:** "Decrease quantity" button decrements by pack size (not by 1) for pack-size products
**Priority:** P1
**Preconditions:** Pack-size product with qty=12 in cart. Cart or PDP stepper shows "12".

**Steps:**
1. Verify spinbutton = "12".
2. Click "Decrease quantity".
3. Observe the spinbutton value.

**Expected Results:**
- Spinbutton shows "6" (12 minus one pack of 6), not "11".
- Cart updates to qty=6.

---

## Group 6: Quantity Persistence

### QS-PERSIST-001
**Title:** Cart quantity persists after page refresh on the cart page
**Priority:** P1
**Preconditions:** Cart contains a product with qty=3. Navigate to `/cart`. Spinbutton shows "3".

**Steps:**
1. Verify spinbutton = "3" for the product.
2. Refresh the browser page (F5 or browser reload button).
3. Wait for the cart page to fully load.
4. Observe the spinbutton value for the product.
5. Observe the Cart badge count in the navigation bar.

**Expected Results:**
- Step 4: Spinbutton still shows "3" after refresh.
- Step 5: Cart badge still reflects the correct total item count.
- Cart quantity is persisted server-side and survives a page reload.

---

### QS-PERSIST-002
**Title:** PDP stepper reflects current cart quantity on page load when product is already in cart
**Priority:** P1
**Preconditions:** Product is in cart with qty=2. Navigate away from PDP to another page, then navigate back to the PDP.

**Steps:**
1. With qty=2 in cart, navigate to the category listing or homepage.
2. Navigate back to the product PDP (`/e2e-test-ram/e2e-test-kingston-valueram-ddr4-3200-4gb`).
3. Wait for the PDP to fully load.
4. Observe the `spinbutton "Product quantity"` value.
5. Observe the "in Cart" indicator.

**Expected Results:**
- Step 4: Spinbutton shows "2" (not "0") - the PDP stepper initializes to the current cart quantity.
- Step 5: "in Cart" indicator is visible showing "2".

---

### QS-PERSIST-003
**Title:** Cart quantity persists across sign-out and sign-in for authenticated users
**Priority:** P1
**Preconditions:** User is signed in. Cart contains a product with qty=3.

**Steps:**
1. Verify cart shows qty=3 for the product.
2. Sign out (click "Account menu" button, then "Logout").
3. Sign back in using the same credentials.
4. Navigate to `/cart`.
5. Observe the spinbutton value for the product.

**Expected Results:**
- Step 5: Spinbutton = "3". Cart is restored server-side with the same quantity.
- Cart badge in the navigation bar reflects the correct count.
- Satisfies BL-CART-008.

---

## Group 7: Disabled States

### QS-DISABLED-001
**Title:** Both stepper buttons are disabled for an out-of-stock product on PDP
**Priority:** P1
**Preconditions:** A product that is out of stock (not "In stock"). Navigate to its PDP.
**Note:** Use a product where the inventory status shows "Out of stock" rather than "In stock".

**Steps:**
1. Navigate to a PDP for an out-of-stock product.
2. Observe the stepper component.
3. Observe the "Increase quantity" button state.
4. Observe the "Decrease quantity" button state.
5. Attempt to click "Increase quantity".

**Expected Results:**
- Both "Increase quantity" and "Decrease quantity" buttons are disabled.
- The `spinbutton "Product quantity"` field is also disabled or read-only.
- Clicking "Increase quantity" does not add the product to the cart.
- Cart badge count does not change.
- An "Out of stock" or similar indicator is displayed near the stepper.

---

### QS-DISABLED-002
**Title:** "Increase quantity" button is disabled when stock limit is reached
**Priority:** P1
**Preconditions:** A product with known maximum stock N (e.g., N=5). Current cart qty = N (maximum). Navigate to PDP or cart.

**Steps:**
1. Ensure the cart has qty = N for the product.
2. Navigate to the PDP for that product.
3. Observe the `spinbutton "Product quantity"` and "Increase quantity" button.
4. Attempt to click "Increase quantity".

**Expected Results:**
- "Increase quantity" button is disabled (grayed out, not clickable).
- Spinbutton shows the stock-limit quantity N.
- Clicking the disabled button does not fire an API call or change the cart quantity.
- Satisfies BL-CART-001.

---

### QS-DISABLED-003
**Title:** Stepper is disabled for configurable products that require customization before adding to cart
**Priority:** P2
**Preconditions:** Navigate to a configurable product PDP at `/products-with-options/configurable-caps-shirts/configurable-hat`. These products use a "Customize" CTA flow, not a direct quantity stepper.

**Steps:**
1. Navigate to the configurable hat PDP.
2. Observe whether a standard quantity stepper (Decrease/spinbutton/Increase) is present.
3. Observe whether a "Customize" button is present instead.

**Expected Results:**
- No direct quantity stepper is available for configurable products before customization.
- A "Customize" button is present - the user must complete the configuration before a quantity can be set.
- The product cannot be added to the cart bypassing the configurator.

---

## Group 8: Keyboard Interaction

### QS-KB-001
**Title:** Up arrow key increments quantity in the spinbutton field
**Priority:** P2
**Preconditions:** Product has qty=1 in cart. PDP spinbutton shows "1" and is focused.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field to focus it.
2. Press the Up Arrow key once.
3. Observe the spinbutton value.
4. Press the Up Arrow key a second time.
5. Observe the spinbutton value.

**Expected Results:**
- Step 3: Spinbutton value increments to "2" (standard HTML spinbutton behavior).
- Step 5: Spinbutton value increments to "3".
- Cart is updated with each keypress (or on blur/commit depending on implementation).

---

### QS-KB-002
**Title:** Down arrow key decrements quantity in the spinbutton field
**Priority:** P2
**Preconditions:** Product has qty=3 in cart. Spinbutton focused and shows "3".

**Steps:**
1. Click on the `spinbutton "Product quantity"` field to focus it.
2. Press the Down Arrow key once.
3. Observe the spinbutton value.

**Expected Results:**
- Spinbutton value decrements to "2".
- Down arrow at qty=1 either stops at 1 (cart page) or goes to 0 (PDP page) per context rules.

---

### QS-KB-003
**Title:** Tab key moves focus away from spinbutton without changing quantity
**Priority:** P2
**Preconditions:** Product has qty=2 in cart. PDP spinbutton shows "2" and is focused.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field to focus it.
2. Do not change the value - press Tab to move focus to the next element.
3. Observe the spinbutton value.
4. Observe the Cart badge count.

**Expected Results:**
- Spinbutton value remains "2" (Tab does not trigger an increment/decrement).
- Cart badge unchanged.
- Focus moves to the next interactive element in tab order ("Increase quantity" button or adjacent element).

---

### QS-KB-004
**Title:** Enter key commits manual quantity entry in the spinbutton field
**Priority:** P2
**Preconditions:** Product in cart. Spinbutton on PDP shows qty=1.

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all text and type "4".
3. Press Enter.
4. Observe the spinbutton value, "in Cart" indicator, and Cart badge.

**Expected Results:**
- Pressing Enter commits the new value.
- Spinbutton = "4", "in Cart" indicator = "4", Cart badge updates to reflect qty=4.
- Cart API call fires with the updated quantity.

---

## Group 9: Cart vs PDP - Contextual Differences

### QS-CTX-001
**Title:** Stepper minimum behavior differs between PDP (0 allowed) and cart (1 minimum)
**Priority:** P1
**Preconditions:** Same product present in cart with qty=1. Have both PDP and cart available to compare.

**Steps:**
1. Navigate to `/cart`. Observe "Decrease quantity" button state when spinbutton = "1".
2. Navigate to PDP for the same product. Observe spinbutton value and "Decrease quantity" button state.
3. On PDP, click "Decrease quantity" to bring qty to 0.
4. Navigate back to `/cart`.
5. Observe whether the product is still in the cart.

**Expected Results:**
- Step 1: On cart page, "Decrease quantity" is disabled at qty=1 - the minimum in cart is 1 (removing requires "Remove from cart" button).
- Step 2: On PDP, spinbutton shows "1" (same cart qty), "Decrease quantity" is enabled (PDP allows going to 0).
- Step 3: Qty goes to 0 on PDP, "in Cart" indicator disappears, Cart badge decrements.
- Step 5: Product is no longer in the cart (was removed by decrementing to 0 on PDP).

---

### QS-CTX-002
**Title:** PDP stepper synchronizes with cart quantity changes made on the cart page
**Priority:** P1
**Preconditions:** Product in cart with qty=1. PDP and cart open in different browser tabs or navigated sequentially.

**Steps:**
1. Navigate to `/cart`. Change qty from 1 to 3 using the "Increase quantity" button (click twice).
2. Navigate to the PDP for that same product.
3. Observe the `spinbutton "Product quantity"` on PDP.

**Expected Results:**
- PDP spinbutton shows "3" - it reflects the server-side cart quantity, not a stale cached value.
- "in Cart" indicator shows "3".

---

### QS-CTX-003
**Title:** Quantity stepper line total recalculates correctly with tier pricing when threshold is crossed
**Priority:** P1
**Preconditions:** A product with configured tiered pricing (e.g., 1-9 units = $10/unit, 10+ units = $8/unit). Product has qty=9 in cart.
**Note:** Use the Pricing admin to confirm tier settings, or use a known tiered product from the catalog.

**Steps:**
1. Navigate to `/cart` with the product at qty=9. Note the unit price ($10.00) and line total ($90.00).
2. Click "Increase quantity" to bring qty to 10.
3. Observe the unit price displayed.
4. Observe the line total.
5. Observe the Order Summary subtotal.

**Expected Results:**
- Step 3: Unit price changes from $10.00 to $8.00 (tier price activates at threshold).
- Step 4: Line total = $80.00 (all 10 units at $8.00 - not a split $90 + $8).
- Step 5: Subtotal reflects the tier-discounted total.
- Satisfies BL-PRICE-004.

---

## Group 10: Error States and Edge Cases

### QS-ERR-001
**Title:** Rapid double-click on "Increase quantity" does not create duplicate cart entries or corrupt quantity
**Priority:** P1
**Preconditions:** Product has qty=1. PDP spinbutton shows "1".

**Steps:**
1. Double-click the "Increase quantity" button in rapid succession.
2. Wait 1-2 seconds for all API responses to settle.
3. Observe the spinbutton value.
4. Navigate to `/cart` and check the line item quantity.

**Expected Results:**
- Spinbutton shows either "2" or "3" - a deterministic value based on how many requests were processed.
- No duplicate line items in the cart.
- No console errors from conflicting API responses.
- Cart total is arithmetically consistent with the displayed quantity.

---

### QS-ERR-002
**Title:** Stepper does not allow quantity to exceed cart maximum when stock reduces mid-session
**Priority:** P1
**Preconditions:** Product has stock=5. User has qty=4 in cart. In a separate Admin session, inventory is reduced to 2.
**Note:** Requires Admin access to reduce inventory. This is a cross-layer scenario.

**Steps:**
1. With qty=4 in cart (stock was 5), reduce product stock to 2 in Admin (Inventory section).
2. Return to the storefront. Navigate to `/cart` or PDP.
3. Observe whether an error or stock warning appears on the cart line item.
4. Attempt to click "Increase quantity" (which would exceed new stock of 2).
5. Attempt to proceed to checkout.

**Expected Results:**
- Step 3: Cart shows an error state (e.g., "Only 2 available") or the qty is auto-corrected to 2.
- Step 4: "Increase quantity" button is disabled (stock limit enforced).
- Step 5: Checkout may be blocked or warn about the overage.
- Satisfies BL-CART-002 (out-of-stock mid-session) and BL-CART-001.

---

### QS-ERR-003
**Title:** Stepper on category listing reflects stock correctly for "In stock" vs "Out of stock" products
**Priority:** P1
**Preconditions:** Navigate to `/e2e-test-ram` (E2E test category). Page loads with multiple products listed.

**Steps:**
1. Identify a product showing "In stock" indicator adjacent to its stepper.
2. Identify a product showing "Out of stock" (if present in the category).
3. For the "In stock" product, observe both stepper buttons.
4. For the "Out of stock" product, observe both stepper buttons.

**Expected Results:**
- Step 3: "In stock" product - "Increase quantity" is enabled, "Decrease quantity" is disabled (at qty=0). The "In stock" label is visible.
- Step 4: "Out of stock" product - both buttons are disabled. An "Out of stock" label or equivalent message is visible. The spinbutton field is also disabled or read-only.

---

### QS-ERR-004
**Title:** Clearing the spinbutton field entirely and tabbing away does not crash or set qty to 0 unexpectedly
**Priority:** P2
**Preconditions:** Product has qty=2 in cart. Cart page spinbutton shows "2".

**Steps:**
1. Click on the `spinbutton "Product quantity"` field.
2. Select all and delete all characters (field is now empty).
3. Press Tab to move focus away.
4. Observe the spinbutton value.
5. Observe the cart line item and order summary.

**Expected Results:**
- The field reverts to the last valid value ("2"), OR it treats an empty field as invalid input and shows a validation hint.
- Cart quantity is NOT changed to 0 due to an empty input.
- No console error or unhandled exception.
- Order summary remains consistent.

---

### QS-ERR-005
**Title:** Pasting a large number via clipboard into the spinbutton field
**Priority:** P2
**Preconditions:** Product has qty=1. Spinbutton focused on PDP or cart.

**Steps:**
1. Copy the text "9999" to clipboard.
2. Click on the `spinbutton "Product quantity"` field.
3. Select all and paste (Ctrl+V).
4. Press Tab or Enter to commit.
5. Observe the spinbutton value and any messages.

**Expected Results:**
- If stock < 9999: Quantity is capped to available stock with a notification, OR the order is submitted but fails validation at checkout. "Increase quantity" button becomes disabled at the stock limit.
- If the product has unlimited/high stock: Quantity is set to 9999, order summary updates.
- No application crash or silent data corruption.

---

## Group 11: Bulk Order / Quick Order Page

### QS-BULK-001
**Title:** Bulk order pad (Copy&Paste) accepts valid SKU and quantity and adds to cart
**Priority:** P1
**Preconditions:** User is signed in. Navigate to `/bulk-order`. "Copy&Paste" tab is active.

**Steps:**
1. Click in the textarea field (placeholder: "Format example: 6AF8SM0VPFV6,10 / 3RO1GEQI34E8,20").
2. Type a valid SKU and quantity in the format `SKU,Quantity` (e.g., `JOF-41986355,3`).
3. Observe the "Reset" and "Add to cart" buttons - they should become enabled.
4. Click "Add to cart".
5. Navigate to `/cart`.
6. Observe whether the product appears with the correct quantity.

**Expected Results:**
- Step 3: "Reset" and "Add to cart" buttons become enabled after valid input is entered.
- Step 4: Product(s) are added to cart.
- Step 6: Product appears in cart with qty=3 (or combined with existing qty if already in cart).
- Cart badge increments by 3.

---

### QS-BULK-002
**Title:** Bulk order pad quantity field enforces minimum of 1 per line
**Priority:** P2
**Preconditions:** Navigate to `/bulk-order`. "Copy&Paste" tab active.

**Steps:**
1. Enter `JOF-41986355,0` (quantity of 0) in the textarea.
2. Click "Add to cart".
3. Observe any error or validation message.

**Expected Results:**
- Either: The entry is rejected with an error message (e.g., "Quantity must be at least 1").
- Or: The line is ignored/skipped and the product is not added to cart.
- No product is added to cart with qty=0.

---

## Delegation Recommendations

| Test Case Group | Assign To | Rationale |
|-----------------|-----------|-----------|
| QS-PDP-* (all PDP stepper) | `qa-frontend-expert` | Storefront UI + immediate cart mutation via xAPI |
| QS-CART-* (cart stepper) | `qa-frontend-expert` | Cart page UI + order summary recalculation |
| QS-INPUT-* (direct input) | `qa-frontend-expert` | Form input validation on storefront |
| QS-BVA-* (boundary values) | `qa-frontend-expert` | Storefront + xAPI `addItem` validation |
| QS-PACK-* (pack size) | `qa-backend-expert` | Requires Admin config + xAPI validation |
| QS-PERSIST-* (persistence) | `qa-frontend-expert` | Storefront session + server-side cart |
| QS-DISABLED-* (disabled states) | `qa-frontend-expert` | Storefront UI state + inventory check |
| QS-KB-* (keyboard) | `qa-frontend-expert` | Accessibility + keyboard interaction |
| QS-CTX-* (cart vs PDP context) | `qa-frontend-expert` | Cross-page state verification |
| QS-ERR-002 (mid-session stock) | `qa-testing-expert` | Multi-session Admin + storefront scenario |
| QS-ERR-* (other error states) | `qa-frontend-expert` | Edge-case input validation |
| QS-BULK-* (bulk order) | `qa-frontend-expert` | Bulk order page UI + cart integration |

---

## Coverage Summary

| Domain Checklist Item (Domain #5) | Covered By |
|------------------------------------|------------|
| Stepper +/- buttons: increment, decrement, boundary enforcement | QS-PDP-001..004, QS-BVA-001..003, QS-CART-001..003 |
| Qty field: direct input, min qty enforced, max stock enforced | QS-INPUT-001..007, QS-BVA-002 |
| Pack size / qty step (multiples of 6) | QS-PACK-001..003 |
| Variations (B2B layout): select variant then add | QS-DISABLED-003 (configurable), context noted |
| Configurable products: "Customize" then add | QS-DISABLED-003 |
| Quick-add from category listing (badge increments) | QS-PDP-005, QS-PDP-006 |
| Success toast / mini-cart preview after add | Implicitly in QS-PDP-001 (cart badge update) |
| Cart icon badge count updates immediately | QS-PDP-001, QS-PDP-005 |
| Cart quantity recalculates line totals | QS-CART-001, QS-CART-002, QS-CTX-003 |

**Business Invariants mapped:**
- BL-CART-001 (max qty enforcement): QS-BVA-002, QS-INPUT-007, QS-ERR-002
- BL-CART-006 (pack size): QS-PACK-001..003
- BL-CART-007 (no duplicate lines): QS-PDP-006
- BL-CART-008 (persistence across sign-out): QS-PERSIST-003
- BL-PRICE-004 (tier pricing boundary): QS-CTX-003
