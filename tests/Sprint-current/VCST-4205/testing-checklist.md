# VCST-4205 — Verification Checklist
## Save-for-Later + Configurable Products: Configuration Merge / Loss / Edit-Loss Fix

---

## 1. Header

| Field | Value |
|-------|-------|
| **Ticket** | VCST-4205 |
| **XCart build** | VirtoCommerce.XCart 3.1014.0-pr-118-1be7 |
| **Theme build** | vc-theme-b2b-vue-2.49.0-pr-2294 |
| **Environment** | vcst-qa |
| **FRONT_URL** | `{{FRONT_URL}}` → https://vcst-qa-storefront.govirto.com |
| **BACK_URL** | `{{BACK_URL}}` → https://vcst-qa.govirto.com |
| **GraphQL endpoint** | `{{BACK_URL}}/graphql` |
| **Test user** | `{{USER_EMAIL}}` (from `.env.vcst`) |
| **Agent pool** | `test-data/users/agent-user-pool.csv` — match `server_name` to browser slot |
| **Date** | 2026-05-19 |
| **Status at start** | Both artifacts confirmed in vcst-qa deploy manifest |

**Primary test product:** `configurable-hat` — navigate via `{{FRONT_URL}}/products-with-options/configurable-caps-shirts/`.
Sections: Product (cap style), Product (color variant), Text (personalization), File (artwork upload).
**Fallback product:** `custom-t-shirt` (same category path) — use if `configurable-hat` is unavailable or has fewer than 2 Product sections.

---

## 2. Pre-Execution Verification

Before executing any scenario, confirm the following in vcst-qa:

- [ ] `{{BACK_URL}}/health` returns `{ "status": "Healthy" }` for SQL Server and Redis
- [ ] XCart module version in `{{BACK_URL}}/api/platform/modules` contains `VirtoCommerce.XCart` at `3.1014.0-pr-118-*`
- [ ] Storefront theme version in `{{BACK_URL}}/api/platform/modules` or deploy manifest shows `vc-theme-b2b-vue-2.49.0-pr-2294`
- [ ] `{{FRONT_URL}}/products-with-options/configurable-caps-shirts/` loads without 404
- [ ] `configurable-hat` PDP is accessible and shows at least 2 Product sections + Text section + File section
- [ ] `{{USER_EMAIL}}` can sign in successfully

---

## 3. Core Regression Scenarios

### 3.1 Case 1 — Multiple Configurable Items of Same Product Must Remain Separate in Save-for-Later

**Business Rules:** BL-CART-003, BL-CART-007
**Edge Cases:** ECL-14.1 (silent errors[]), ECL-7.3 (loading states)
**Priority:** Critical
**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

#### Pre-conditions

- [PRE:CLEAR_SESSION]
- [PRE:SIGNIN_AS:USER_DEFAULT] — use `{{USER_EMAIL}}` / `{{USER_PASSWORD}}`
- [PRE:RESET_CART] — confirm cart is empty before proceeding
- `configurable-hat` PDP is reachable at `{{FRONT_URL}}/products-with-options/configurable-caps-shirts/`

#### Test Data

```
product_url = {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
config_A_label = "Configuration A" (first combination — e.g., Style: Classic, Color: Red, Text: "Hello", File: any small PNG)
config_B_label = "Configuration B" (different combination — e.g., Style: Sport, Color: Blue, Text: "World", File: any small PNG)
Note: record exact section values selected for each configuration at execution time;
      do NOT assert exact option names — assert that A and B values differ from each other.
```

#### Steps

```
[NAV] Navigate to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
[WAIT] wait for PDP to load fully (all section widgets visible)
[ACT] Select options for Configuration A (Product section 1: first available option,
      Product section 2: first available option, Text: type "AGENT-TEST-CFG-A",
      File section: upload any small image file)
[ASSERT] [DOM] All sections show selected state; no validation error visible
[ACT] Click the quantity increase (+) button to add the item to cart (qty = 1)
[WAIT] wait for cart badge to update to 1
[ASSERT] [STATE] Cart badge shows 1
[API] Capture network request for addItem/changeCartItemsQuantity mutation; assert errors[] is empty

[NAV] Navigate back to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
[WAIT] wait for PDP to reload fresh
[ACT] Select options for Configuration B (Product section 1: DIFFERENT option from A,
      Product section 2: DIFFERENT option from A, Text: type "AGENT-TEST-CFG-B",
      File section: upload a DIFFERENT small image file from Config A)
[ASSERT] [DOM] All sections show the new (B) selections; values visually different from A
[ACT] Click the quantity increase (+) button to add to cart (qty = 1)
[WAIT] wait for cart badge to update to 2
[ASSERT] [STATE] Cart badge shows 2

[NAV] Navigate to {{FRONT_URL}}/cart
[WAIT] wait for cart page to load and both line items to render
[ASSERT] [DOM] Two distinct line items are visible in the active cart (not one merged line)
[ASSERT] [DOM] Line item 1 shows Configuration A values (e.g., Text section reads "AGENT-TEST-CFG-A")
[ASSERT] [DOM] Line item 2 shows Configuration B values (e.g., Text section reads "AGENT-TEST-CFG-B")
[ASSERT] [MATH] Cart subtotal = sum of both line item prices (record values for price-consistency check)

[ACT] Click "Save for Later" on line item 1 (Configuration A)
[WAIT] wait for line item 1 to move from active cart to saved section
[ASSERT] [DOM] Active cart now shows only 1 line item (Configuration B)
[ASSERT] [DOM] Saved-for-later section is visible and contains exactly 1 entry
[ASSERT] [DOM] The saved entry shows Configuration A values (Text: "AGENT-TEST-CFG-A")
[API] Inspect the moveCartItemToSaved / wishlist mutation response; assert errors[] is empty
[CONSOLE] No JS errors related to cart or configuration

[ACT] Click "Save for Later" on line item 2 (Configuration B)
[WAIT] wait for line item 2 to move to saved section
[ASSERT] [DOM] Active cart is now empty (or shows 0 items)
[ASSERT] [DOM] Saved-for-later section contains exactly 2 entries
[ASSERT] [DOM] Entry 1 shows Configuration A values (Text: "AGENT-TEST-CFG-A")
[ASSERT] [DOM] Entry 2 shows Configuration B values (Text: "AGENT-TEST-CFG-B")
[ASSERT] The two entries are visually and semantically distinct — NOT merged into one entry
[API] Inspect mutation response for second save; assert errors[] is empty
[NETWORK] No 4xx/5xx on any cart API call throughout this sequence
[CONSOLE] No JS errors at any point
```

#### Explicit Pass Assertion

Both line items (Config A and Config B) appear as **two separate entries** in the Save-for-Later section. They are not merged into one entry, even though both originate from the same configurable product. Each entry preserves its own section selections.

#### Failure Signals

- Saved-for-later shows 1 entry instead of 2 after both saves — FAIL (regression of Case 1 bug)
- Saved entry shows a mix of Config A and Config B values — FAIL
- `errors[]` non-empty on any mutation — FAIL
- Cart badge / subtotal not updating after each save — investigate further before filing

#### Cleanup

```
[ACT] Click "Move to Cart" on all saved-for-later entries to restore them to the active cart
[ACT] Remove all items from cart via the Remove/delete control
[ASSERT] [STATE] Cart is empty; saved-for-later section is empty
```

---

### 3.2 Case 2 — "Move to Cart" from Save-for-Later Must Preserve Configuration

**Business Rules:** BL-CART-003, BL-CART-007, BL-CART-014
**Edge Cases:** ECL-14.1 (silent errors[]), ECL-7.3 (loading states during mutation)
**Priority:** Critical
**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

#### Pre-conditions

- [PRE:CLEAR_SESSION]
- [PRE:SIGNIN_AS:USER_DEFAULT]
- [PRE:RESET_CART]
- `configurable-hat` PDP is reachable

#### Test Data

```
product_url = {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
config_text = "AGENT-TEST-MOVE-BACK"
Note: record the exact Product section option labels selected at execution time.
      Assert that those same labels appear after Move to Cart.
```

#### Steps

```
[NAV] Navigate to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
[WAIT] PDP fully loaded
[ACT] Select one option in Product section 1 (record label, e.g., "Classic")
[ACT] Select one option in Product section 2 (record label, e.g., "Red")
[ACT] Type "AGENT-TEST-MOVE-BACK" into the Text section input
[ACT] Upload a small image file in the File section
[ASSERT] [DOM] All four sections show selected/filled state
[ACT] Click quantity increase (+) to add item to cart
[WAIT] Cart badge updates to 1
[ASSERT] [STATE] Cart badge = 1
[API] Assert addItem / quantityChange mutation errors[] is empty

[NAV] Navigate to {{FRONT_URL}}/cart
[WAIT] Cart page loaded, line item visible
[ASSERT] [DOM] Line item shows all four section selections:
         - Product section 1: recorded label (e.g., "Classic")
         - Product section 2: recorded label (e.g., "Red")
         - Text section: "AGENT-TEST-MOVE-BACK"
         - File section: filename or upload indicator visible
[ACT] Click "Save for Later" on the line item
[WAIT] Item moves to saved section; active cart is empty
[ASSERT] [DOM] Saved-for-later section shows 1 entry
[ASSERT] [DOM] The saved entry displays the same section labels as recorded above
[API] Assert save mutation errors[] is empty

[ACT] Click "Move to Cart" on the saved entry
[WAIT] Item moves back to active cart; saved section empty or entry removed
[ASSERT] [DOM] Active cart shows 1 line item
[ASSERT] [DOM] The restored line item shows ALL FOUR original section selections:
         - Product section 1: same label as recorded ("Classic")
         - Product section 2: same label as recorded ("Red")
         - Text section: "AGENT-TEST-MOVE-BACK" (exact match)
         - File section: same file indicator as original
[ASSERT] [DOM] No section shows "—", empty, or default/unset state
[ASSERT] [MATH] Line item price after move equals the price before save (record both; delta must be $0.00
         if selectedForCheckout state is unchanged throughout)
[API] Inspect the moveToCart / addItem mutation response; assert errors[] is empty
[API] Inspect the cart query response after move; assert configurationItems[] is non-empty
      and each item's section fields match the original selections
[NETWORK] No 4xx/5xx on any cart or wishlist API call
[CONSOLE] No JS errors related to configuration loading or cart update
```

#### Explicit Pass Assertion

After "Move to Cart", the line item in the active cart shows all section selections identical to the original configuration added from PDP. No section is empty, reset, or showing a default value.

#### Failure Signals

- Any section in the moved-back line item shows empty, "—", or a default/unset state — FAIL (Case 2 regression)
- `configurationItems[]` empty in cart API response after move — FAIL
- Line item price changes from pre-save value when selectedForCheckout state has not changed — FAIL (price regression, cross-reference BL-CART-010)
- "Successfully added" toast shown when errors[] is non-empty — FAIL (error-swallowing regression)

#### Cleanup

```
[ACT] Remove the line item from the active cart
[ASSERT] [STATE] Cart is empty
```

---

### 3.3 Case 3 — "Edit Configuration" on Cart Line Item Must Persist New Selections

**Business Rules:** BL-CART-014, BL-PRICE-001, BL-CART-010
**Edge Cases:** ECL-7.1 (loading / stale cached state), ECL-7.3 (loading states during save)
**Priority:** Critical
**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

#### Pre-conditions

- [PRE:CLEAR_SESSION]
- [PRE:SIGNIN_AS:USER_DEFAULT]
- [PRE:RESET_CART]
- `configurable-hat` PDP is reachable
- User is on cart page with at least one configurable line item already added

#### Test Data

```
product_url = {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
config_original_text = "AGENT-TEST-EDIT-ORIG"
config_edited_text   = "AGENT-TEST-EDIT-NEW"
Note: record original Product section option labels and edited option labels at execution time.
```

#### Steps — Phase A: Add item with original configuration

```
[NAV] Navigate to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
[WAIT] PDP fully loaded
[ACT] Select Product section 1: first available option (record as orig_p1)
[ACT] Select Product section 2: first available option (record as orig_p2)
[ACT] Type "AGENT-TEST-EDIT-ORIG" into the Text section
[ACT] Upload a small image file for the File section
[ASSERT] [DOM] All sections filled
[ACT] Click quantity increase (+) to add to cart
[WAIT] Cart badge = 1
```

#### Steps — Phase B: Navigate to cart and open Edit Configuration

```
[NAV] Navigate to {{FRONT_URL}}/cart
[WAIT] Cart page and line item fully rendered
[ASSERT] [DOM] Line item shows orig_p1, orig_p2, "AGENT-TEST-EDIT-ORIG", file indicator
[ACT] Click "Edit Configuration" on the line item
[WAIT] Edit Configuration panel/modal opens
[ASSERT] [DOM] Edit panel shows current selections pre-populated:
         - Product section 1: orig_p1 selected
         - Product section 2: orig_p2 selected
         - Text: "AGENT-TEST-EDIT-ORIG"
         - File: original file indicator
```

#### Steps — Phase C: Change options and save

```
[ACT] Change Product section 1 to a DIFFERENT option (record as new_p1; must differ from orig_p1)
[ACT] Change Product section 2 to a DIFFERENT option (record as new_p2; must differ from orig_p2)
[ACT] Clear the Text field and type "AGENT-TEST-EDIT-NEW"
[ACT] Replace the File section upload with a different small image file
[ASSERT] [DOM] All four sections now show the new values (new_p1, new_p2, new text, new file)
[ACT] Click "Save" (or "Update Configuration" — use the exact label shown in the UI)
[WAIT] Edit panel closes; cart page re-renders with updated line item
[ASSERT] [DOM] The line item on the cart page shows the NEW configuration:
         - Product section 1: new_p1 (NOT orig_p1)
         - Product section 2: new_p2 (NOT orig_p2)
         - Text section: "AGENT-TEST-EDIT-NEW" (NOT "AGENT-TEST-EDIT-ORIG")
         - File section: new file indicator
[ASSERT] [DOM] NONE of the original values (orig_p1, orig_p2, "AGENT-TEST-EDIT-ORIG") remain visible
[ASSERT] [DOM] No section shows empty, "—", or default/unset state
[API] Inspect the updateCartConfigurationItem / save mutation response; assert errors[] is empty
[API] After save, query cart and inspect configurationItems[]:
      - assert Text section configurationItem.customText = "AGENT-TEST-EDIT-NEW"
      - assert Product section 1 configurationItem.option.productId matches new_p1 selection
[NETWORK] No 4xx/5xx on any cart mutation
[CONSOLE] No JS errors after save
```

#### Steps — Phase D: Persist check — reload page

```
[NAV] Hard-navigate to {{FRONT_URL}}/cart (force fresh page load)
[WAIT] Cart re-loads from server
[ASSERT] [DOM] Line item still shows new configuration (new_p1, new_p2, "AGENT-TEST-EDIT-NEW", new file)
         Confirms server-side persistence, not just in-memory UI state
```

#### Explicit Pass Assertion

After saving the edited configuration and reloading the cart, the line item reflects the new selections on all four sections. The original values are gone. No section is empty or reset.

#### Failure Signals

- After save, any section reverts to original value or shows empty — FAIL (Case 3 regression)
- After page reload, edited values are lost — FAIL (persistence regression)
- Save mutation errors[] non-empty — FAIL
- Cart page shows a spinner indefinitely after save (> 5 s) — FAIL (ECL-7.3)
- `customText` in API response still equals "AGENT-TEST-EDIT-ORIG" — FAIL

#### Cleanup

```
[ACT] Remove the line item from cart
[ASSERT] [STATE] Cart is empty
```

---

## 4. Price-Consistency Check

**Business Rules:** BL-CART-003, BL-CART-010, BL-PRICE-001
**Edge Cases:** ECL-2.3 (pricing timing / stale cart totals), ECL-14.1 (silent errors[])
**Priority:** High
**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

**Rationale:** Prior to the fix, the same item showed $16 in cart, $8 after saving, $20 in "See all" saved list, and $16 again after Move to Cart. This scenario walks the same transitions and records price at every transition point.

#### Pre-conditions

- [PRE:CLEAR_SESSION]
- [PRE:SIGNIN_AS:USER_DEFAULT]
- [PRE:RESET_CART]
- A valid coupon code `{{VALID_COUPON_CODE}}` (= `QA`) is available on vcst-qa
- `configurable-hat` PDP is reachable

#### Test Data

```
product_url = {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
coupon_code = {{VALID_COUPON_CODE}}
config_text_item1 = "AGENT-TEST-PRICE-A"
config_text_item2 = "AGENT-TEST-PRICE-B"
Note: Capture numeric prices from DOM at each checkpoint.
      Do NOT assert exact price values — assert consistency across transitions.
```

#### Steps

```
--- SETUP: Add two distinct configurable items to cart ---

[NAV] Navigate to {{FRONT_URL}}/products-with-options/configurable-caps-shirts/
[ACT] Select Config A options; Text = "AGENT-TEST-PRICE-A"; add to cart
[WAIT] Cart badge = 1

[NAV] Navigate back to PDP (fresh)
[ACT] Select Config B options (different from A); Text = "AGENT-TEST-PRICE-B"; add to cart
[WAIT] Cart badge = 2

[NAV] Navigate to {{FRONT_URL}}/cart
[WAIT] Both line items rendered

--- CHECKPOINT 1: Cart (before coupon) ---
[ASSERT] [MATH] Record: lineItem1_cart_price, lineItem2_cart_price, cart_subtotal
[ASSERT] cart_subtotal == lineItem1_cart_price + lineItem2_cart_price (BL-PRICE-008)

[ACT] Apply coupon code {{VALID_COUPON_CODE}}
[WAIT] Coupon applied; discount line visible
[ASSERT] [DOM] Coupon discount shown and > $0
[ASSERT] [MATH] Record: lineItem1_cart_price_couponed, lineItem2_cart_price_couponed,
                        cart_subtotal_couponed, cart_discount_amount

--- CHECKPOINT 2: Save item 1 to Save-for-Later ---
[ACT] Click "Save for Later" on line item 1
[WAIT] Item 1 moves to saved section
[ASSERT] [DOM] Item 1 appears in saved-for-later section
[ASSERT] [MATH] Record: item1_saved_price (price shown in saved-for-later section)
[ASSERT] item1_saved_price == lineItem1_cart_price (pre-coupon unit price; coupon applies at cart level,
         not per-item saved price — verify semantics match VC behavior)

--- CHECKPOINT 3: "See all" saved list (if accessible) ---
[ACT] If a "See all" / "View saved list" link exists, navigate to the full saved items page
[WAIT] Saved items page or expanded view loaded
[ASSERT] [MATH] Record: item1_seenall_price
[ASSERT] item1_seenall_price == item1_saved_price (no repricing between Save-for-Later section and full view)

--- CHECKPOINT 4: Move to Cart ---
[ACT] Click "Move to Cart" on item 1 in saved list (or navigate back to cart page and use Move to Cart)
[WAIT] Item 1 appears in active cart
[ASSERT] [DOM] Item 1 is back in active cart section
[ASSERT] [MATH] Record: item1_returned_price
[ASSERT] item1_returned_price == lineItem1_cart_price
         (round-trip: cart → saved → cart must preserve unit price with no selectedForCheckout change)

--- CHECKPOINT 5: "Add All to Cart" path (if two items are in saved) ---
[ACT] Save item 2 to saved-for-later as well
[WAIT] Both items in saved section; cart empty
[ASSERT] [MATH] Record: item2_saved_price; assert item2_saved_price == lineItem2_cart_price
[ACT] Click "Add All to Cart" (or equivalent bulk-move control if present)
[WAIT] All items moved back to active cart
[ASSERT] [DOM] Both items visible in active cart
[ASSERT] [MATH] Record: item1_addall_price, item2_addall_price
[ASSERT] item1_addall_price == lineItem1_cart_price
[ASSERT] item2_addall_price == lineItem2_cart_price

--- Cross-layer verification ---
[API] After final state, query cart via GraphQL (or inspect network requests):
      assert each lineItem.listPrice matches the DOM-displayed price (no hidden repricing)
[NETWORK] No 4xx/5xx on any move-to-cart or add-all mutation
[CONSOLE] No JS errors referencing price calculation or configuration
```

#### Key Price Invariants (all must hold)

| Transition | Invariant |
|------------|-----------|
| Cart → Save-for-Later | Unit price of item unchanged |
| Save-for-Later section → "See all" saved view | Price identical in both views |
| Save-for-Later → Move to Cart (no selection change) | Price after move equals price before save |
| Save-for-Later → Add All to Cart | Same as Move to Cart per item |
| BL-CART-010 note | If selectedForCheckout changes during the round-trip, a price delta is legitimate — document which sections were selected/deselected |

#### Failure Signals

- Price in saved-for-later view differs from cart price by more than $0.00 (and no selection state changed) — FAIL
- Price in "See all" differs from price in saved-for-later section — FAIL
- Price after Move to Cart differs from price before Save — FAIL
- Any add-all-to-cart call returns errors[] non-empty — FAIL

#### Cleanup

```
[ACT] Remove all items from cart
[ASSERT] [STATE] Cart empty; saved-for-later empty
```

---

## 5. Error-Handling Probe

**Business Rules:** BL-CART-003
**Edge Cases:** ECL-14.1 (silent errors[] swallowing), ECL-7.3 (loading states)
**Priority:** High
**Agent:** `qa-backend-expert` (Admin SPA setup) + `qa-frontend-expert` (storefront verification)
**Browsers:** Admin: `playwright-edge` | Storefront: `playwright-chrome`

**Goal:** Force `Move to Cart` to fail at the xAPI layer, then assert the storefront does NOT show a success toast and the cart state remains unchanged.

#### Pre-conditions

- [PRE:CLEAR_SESSION] on both browser sessions
- Admin session: `{{ADMIN}}` signed into `{{BACK_URL}}/ui` (use `{{BACK_URL}}` + `/ui` path)
- Storefront session: `{{USER_EMAIL}}` signed in with one configurable line item in Save-for-Later
  (use `configurable-hat` with any complete configuration; Text = "AGENT-TEST-ERR-PROBE")

#### Setup Steps (qa-backend-expert — playwright-edge)

```
--- Step A: Record the product SKU of the configurable-hat ---
[NAV] Navigate to {{BACK_URL}}/ui/#/catalog
[WAIT] Admin catalog blade loads
[ACT] Search for "configurable-hat" in the catalog search
[ASSERT] [DOM] Product entry found
[ACT] Open the product; navigate to the Inventory tab
[ASSERT] [DOM] Record the current Inventory Status (expected: Enabled)
[ACT] Change Inventory Status to "Disabled" for the Fulfillment Center used by B2B-store
[ACT] Click Save
[WAIT] Save confirmation (toast or page refresh)
[ASSERT] [DOM] Status shows Disabled
[API] Optionally confirm via GET {{BACK_URL}}/api/inventory/products/{sku} → status = Disabled
Note: Do NOT wait for search reindex — inventory check is at addItem time, not search time.
      The addItem mutation checks inventory status synchronously.
```

#### Probe Steps (qa-frontend-expert — playwright-chrome)

```
[NAV] Navigate to {{FRONT_URL}}/cart
[WAIT] Cart page loaded; saved-for-later section visible with 1 entry (the configurable-hat item)
[ASSERT] [DOM] Cart active section shows 0 items; saved section shows 1 item (Text: "AGENT-TEST-ERR-PROBE")
[ACT] Click "Move to Cart" on the saved configurable-hat entry
[WAIT] 3 seconds (allow mutation to complete and response to render)
[ASSERT] [DOM] NO "Successfully added" / "Item added to cart" toast appears
[ASSERT] [DOM] The item remains in the saved-for-later section (not moved to active cart)
[ASSERT] [DOM] An error message, alert, or inline warning IS visible to the user
         (exact wording may vary — assert any error indicator is present)
[ASSERT] [STATE] Active cart item count unchanged (still 0)
[API] Inspect the Move to Cart / addItem mutation response:
      assert errors[] is NON-EMPTY (expect a stock/availability error)
[NETWORK] HTTP status on the GraphQL mutation endpoint must be 200 (GraphQL always 200),
          but errors[] in the body must be non-empty
[CONSOLE] No unhandled JS exception (error[] being non-empty is expected; a JS crash is not)
```

#### Teardown Steps (qa-backend-expert — playwright-edge)

```
[NAV] Return to {{BACK_URL}}/ui/#/catalog → product → Inventory tab
[ACT] Restore Inventory Status to "Enabled"
[ACT] Save
[WAIT] 60s for search reindex to propagate (ECL-14.2)
[ASSERT] [API] GET {{BACK_URL}}/api/inventory/products/{sku} → status = Enabled
```

#### Explicit Pass Assertion

When `addItem` returns non-empty `errors[]`, the storefront shows an error to the user and does NOT display a success toast. The item stays in saved-for-later; the active cart is unchanged.

#### Failure Signals

- "Successfully added" toast appears despite errors[] being non-empty — FAIL (error-swallowing regression)
- Item moves to active cart despite mutation failure — FAIL
- No user-visible error shown at all — FAIL
- Admin inventory toggle unavailable or product not found — BLOCKED (document as environment gap)

---

## 6. Adjacent Regression Checks

These checks confirm no collateral damage from the fix. They reference existing suite cases by ID.

### 6.1 Save-for-Later for Non-Configurable Items (Suite 029)

**Verify:** Cases `CART-012` and `CART-013` in `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` still pass for a plain (non-configurable) product.

| Case | Title | Expected Result |
|------|-------|-----------------|
| CART-012 | Save for Later - Move Item | Non-configurable product moves to saved section; errors[] empty; subtotal updates |
| CART-013 | Save for Later - Move Back | Non-configurable product returns to active cart; price unchanged |

**How to run:** Execute these two cases with the assigned `playwright-chrome` agent (see suite agent assignment). Use any in-stock non-configurable product from the catalog — do not use `configurable-hat`.

**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

### 6.2 Edit Configuration on Cart (Suite 072)

**Verify:** Cases `CFG-EDIT-001`, `CFG-EDIT-002`, `CFG-EDIT-003` in `regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv` still pass.

| Case | Title | Expected Result |
|------|-------|-----------------|
| CFG-EDIT-001 | Edit Product Section Selection via Cart Edit Configuration | Product section change persists after save |
| CFG-EDIT-002 | Edit Text Section Input via Cart Edit Configuration | Text change persists after save |
| CFG-EDIT-003 | Edit/Replace Uploaded File via Cart Edit Configuration | File replacement persists after save |

**How to run:** Execute via `playwright-chrome`. These are the canonical Edit Configuration regression cases — they exercise the same fix path as Case 3 above but via their own preconditions and data.

**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

### 6.3 Same Configuration Consolidation (BL-CART-007)

**Verify:** Adding the SAME complete configuration of `configurable-hat` twice results in ONE line item with qty = 2 (not two separate lines).

| Step | Expected |
|------|----------|
| Add Config A (Style: Classic, Color: Red, Text: "AGENT-TEST-SAME", File: same file) | Cart: 1 line, qty 1 |
| Navigate to PDP → add identical Config A again | Cart: 1 line, qty 2 (consolidated) |
| Assert two identical configs do NOT create two separate lines | BL-CART-007 holds |

Note: this is the complement of Case 1 — two DIFFERENT configs must be separate (Case 1); two IDENTICAL configs must consolidate (BL-CART-007). Both must hold simultaneously after the fix.

**Agent:** `qa-frontend-expert` | **Browser:** `playwright-chrome`

---

## 7. Business Rules to Verify

| Rule ID | Domain | Description | Scenarios |
|---------|--------|-------------|-----------|
| **BL-CART-003** | Cart | Coupon + save interaction; cart persistence including save-for-later | Cases 1, 2; Price check; Error probe |
| **BL-CART-007** | Cart | Same SKU + same config = single line (qty+1); same SKU + different configs = separate lines | Cases 1, 3; Section 6.3 |
| **BL-CART-010** | Cart | Configurable lineItem `listPrice` = sum of `selectedForCheckout=true` placement prices; deselection reduces price; Move to Cart without selection change must yield same price | Price check; Case 2 |
| **BL-CART-014** | Cart | Section key identification: `(sectionId, type)` for Text/File; `option.productId` required for Variation. Omitting `option` on Variation = silent no-op. | Cases 2, 3 (verify API payload shapes) |
| **BL-PRICE-001** | Pricing | Discount stacking order; price math integrity end-to-end through cart → saved → cart round-trip | Price check |

---

## 8. Edge Cases to Cover

| ECL ID | Category | What to Watch For | Where Applicable |
|--------|----------|-------------------|-----------------|
| **ECL-14.1** | GraphQL xAPI Error Patterns — Silent errors[] | `addItem` / move mutations return HTTP 200 with non-empty `errors[]`; storefront treats 200 as success without inspecting body | Cases 1, 2, 3, Error probe |
| **ECL-7.1** | Frontend & UI — Browser/device issues; stale cached state | Edit Configuration panel pre-populates stale data (old selections); post-save cart shows pre-edit values if cache not busted | Case 3; CFG-EDIT adjacent checks |
| **ECL-2.3** | Pricing Timing — Stale cart totals | Price in saved-for-later or after Move to Cart lags behind the last-known price; race condition after configuration change triggers repricing | Price check (BL-PRICE-001, BL-CART-010) |
| **ECL-7.3** | Loading States — Double-click / spinner | "Move to Cart" button clickable during loading; multiple addItem mutations sent; item appears twice | Case 2 (after Move to Cart, assert exactly 1 line item, not 2) |

---

## 9. Agent Dispatch Matrix

| Scenario | Agent | Browser Server | Notes |
|----------|-------|---------------|-------|
| Case 1 — Merge prevention | `qa-frontend-expert` | `playwright-chrome` | Full DOM + network inspection; runs solo (not parallel with Case 2/3 — same user session risk) |
| Case 2 — Move to Cart config preservation | `qa-frontend-expert` | `playwright-chrome` | Run sequentially after Case 1 cleanup; [PRE:RESET_CART] between cases |
| Case 3 — Edit Configuration persistence | `qa-frontend-expert` | `playwright-chrome` | Run after Case 2 cleanup |
| Price-consistency check | `qa-frontend-expert` | `playwright-chrome` | Run after Cases 1-3; requires coupon {{VALID_COUPON_CODE}} to be active |
| Error-handling probe — Admin setup/teardown | `qa-backend-expert` | `playwright-edge` | Admin SPA: set inventory Disabled before storefront probe; restore after |
| Error-handling probe — Storefront verification | `qa-frontend-expert` | `playwright-chrome` | Coordinate with backend agent — storefront probe starts AFTER admin confirms inventory Disabled |
| Adjacent: CART-012/013 (suite 029) | `qa-frontend-expert` | `playwright-chrome` | Can run in same session after Cases 1-3; use non-configurable product |
| Adjacent: CFG-EDIT-001/002/003 (suite 072) | `qa-frontend-expert` | `playwright-chrome` | Run as a sub-sequence from the 072 CSV directly |
| BL-CART-007 consolidation check | `qa-frontend-expert` | `playwright-chrome` | Section 6.3; can run in same session |

**Execution order recommendation:**

1. Pre-execution verification (environment health check)
2. Case 1 → Case 2 → Case 3 (sequential; reset cart between each)
3. Price-consistency check
4. Error-handling probe (admin + storefront coordinated)
5. Adjacent regression: CART-012/013, CFG-EDIT-001/002/003, BL-CART-007 consolidation

---

## 10. Acceptance Criteria

The fix is accepted (**PASS**) only when ALL of the following are true:

### Case 1 — Merge Prevention
- [ ] PASS: Two configurable line items with different configurations, saved independently to Save-for-Later, appear as **two separate entries** in the saved section (not merged)
- [ ] PASS: Each saved entry displays its own distinct section selections
- [ ] PASS: No `errors[]` on any save mutation

### Case 2 — Move to Cart Preserves Configuration
- [ ] PASS: Line item returned from Save-for-Later to active cart shows all four section selections identical to the original configuration
- [ ] PASS: No section is empty, reset, or showing a default/unset value
- [ ] PASS: Line item price after move equals price before save (no selection-state change occurred)
- [ ] PASS: `configurationItems[]` in the cart API response is non-empty after move

### Case 3 — Edit Configuration Persists
- [ ] PASS: After clicking Save in the Edit Configuration panel, the cart page shows the NEW section values, not the original ones
- [ ] PASS: After a hard page reload, the new configuration values are still present (server-side persistence confirmed)
- [ ] PASS: No section shows empty or default state post-edit

### Price-Consistency Check
- [ ] PASS: Unit price of a configurable line item is identical at all four views: Cart, Save-for-Later section, "See all" saved view, post-Move-to-Cart cart
- [ ] PASS: cart_subtotal = sum of lineItem prices (BL-PRICE-008)

### Error-Handling Probe
- [ ] PASS: When `addItem` / move-to-cart mutation returns non-empty `errors[]`, no "Successfully added" or equivalent success toast is shown
- [ ] PASS: Item remains in saved-for-later; active cart unchanged
- [ ] PASS: A user-visible error indicator is present

### Adjacent Regression
- [ ] PASS: CART-012 and CART-013 pass for non-configurable products (no collateral damage)
- [ ] PASS: CFG-EDIT-001/002/003 pass (Edit Configuration on cart still works via existing suite cases)
- [ ] PASS: Two identical configurable configurations consolidate to qty=2, not two lines (BL-CART-007)

### Overall Verdict
- **PASS** — all checkboxes above are checked
- **FAIL** — any checkbox above is unchecked; file a bug against VCST-4205 with evidence captured per `/qa-evidence compact` policy; block deployment of these two artifacts until fixed
- **BLOCKED** — environment health check fails or test product unavailable; escalate to `qa-lead-orchestrator` before execution

---

## Appendix: Quick Reference

**GraphQL endpoint:** `{{BACK_URL}}/graphql`
**GraphiQL UI:** `{{BACK_URL}}/ui/graphiql`
**Admin SPA:** `{{BACK_URL}}/ui`
**Cart page:** `{{FRONT_URL}}/cart`
**PDP path:** `{{FRONT_URL}}/products-with-options/configurable-caps-shirts/`
**Inventory API:** `GET {{BACK_URL}}/api/inventory/products/{sku}`
**Platform health:** `GET {{BACK_URL}}/health`

**AGENT-TEST- prefix:** All text inputs and file names in this checklist use the `AGENT-TEST-` prefix so `/qa-seed-data teardown` can sweep them automatically.

**Related suites:**
- `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` — CART-012, CART-013
- `regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv` — CFG-EDIT-001/002/003
- `regression/suites/Frontend/configurable-products/072b-configurable-products-e2e.csv` — E2E scenarios
