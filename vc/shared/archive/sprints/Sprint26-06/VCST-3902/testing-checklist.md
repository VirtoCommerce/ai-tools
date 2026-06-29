# Testing Checklist — VCST-3902
# [Design][Configurable products] Quantity stepper add to cart — unexpected amount added

**Ticket:** VCST-3902
**Created:** 2026-03-31
**Target suites:** 072, 072b, 072c

---

## Scope of Changes

The ticket addresses three distinct behavioral areas on configurable product PDPs and in the cart:

1. **PDP add-to-cart flow** — button rename ("Create new configuration") + post-add state reset question
2. **Cart quantity stepper** — editing quantity for an existing configured line item (stepper-only, no config change)
3. **Edit configuration from cart** — opening config on PDP, button rename to "Update cart", creating a second config from the edit view

---

## Business Rules in Scope

| Rule | Description | Verification layer |
|------|-------------|-------------------|
| BL-CAT-006 | All required sections must be filled before add-to-cart | PDP, cart |
| BL-CART-001 | Max quantity enforcement — stepper respects stock limits | Cart stepper |
| BL-CART-006 | Pack size enforcement — stepper increments correctly | Cart stepper |
| BL-CART-007 | Different configurations create separate cart lines; same config adds to existing line quantity | Cart, E2E |
| BL-PRICE-001 | Discount stacking — prices correct after configuration | PDP, cart recalc |

---

## Coverage Map — AC to Existing Test Cases

### AC-1: "Create your own configuration" button renamed to "Create new configuration"

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| Button labeled "Create new configuration" appears on PDP | CFG-PDP-017 checks "Create your own configuration" button visibility/label — test step will fail if rename not applied | **GAP: case asserts old label name; needs label update** |
| Button visible in both fresh PDP state and edit-from-cart state | CFG-PDP-017 covers PDP-fresh context only | **GAP: edit-from-cart context not covered** |

### AC-2: Button restarts the configuration process (clears current selections)

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| Clicking "Create new configuration" resets all section selections to defaults | No existing case covers this reset behavior explicitly | **GAP: new case needed** |
| After reset, price returns to base price | No case covers post-reset price state | **GAP: new case needed** |
| After reset, quantity stepper returns to 0 | No case covers stepper state after reset | **GAP: new case needed** |
| After reset, "Add to cart" button shows (not "Update cart") | Not covered; depends on which context triggered the reset | **GAP: new case needed** |

### AC-3: Post-add-to-cart state — what happens to the configuration widget?

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| After successful add-to-cart, configuration widget resets to defaults | CFG-E2E-040 (back button navigation) partially documents state, but does not assert the exact reset behavior on success | **GAP: specific post-add state assertion missing** |
| After successful add-to-cart, quantity stepper resets to 0 | Not covered in any existing case | **GAP: new case needed** |
| After successful add-to-cart, "Add to cart" button becomes disabled again | CFG-PDP-005 covers disabled state at qty=0 in isolation; no case covers the re-disable after a successful add | **GAP: new case needed** |

### AC-4: Cart quantity stepper — quantity-only editing (no config change)

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| Increasing quantity via cart stepper recalculates line total (price x qty) | CFG-PDP-011 (lines 12) covers increase to qty=2 and subtotal recalc; CFG-E2E-012 covers qty change with configuration preserved | Covered by CFG-PDP-011, CFG-E2E-012 |
| Decreasing quantity via cart stepper recalculates line total | CFG-E2E-012 covers decrease from 3 to 2 | Covered by CFG-E2E-012 |
| Stepper respects max stock for the selected option (BL-CART-001) | CFG-E2E-046 covers stock enforcement on initial add; does NOT specifically test stepper in cart after add | **PARTIAL GAP: cart-stepper stock enforcement not explicitly tested** |
| Stepper increment step matches pack size (BL-CART-006) | No existing case verifies pack size increments for configurable products specifically | **GAP: pack size behavior not verified** |
| Quantity stepper in cart does NOT change the configuration | No case explicitly asserts config remains unchanged after qty-only change | CFG-E2E-012 implicitly covers this (Basic Seat still shown after qty change) — consider strengthening assertion |
| Setting cart qty to 0 removes the line item or blocks checkout | Not covered for configurable products | **GAP: new case needed** |

### AC-5: Edit configuration from cart — opens on PDP

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| Clicking edit on cart line item navigates to PDP (or opens edit UI) | CFG-EDIT-001, CFG-EDIT-002, CFG-EDIT-003 cover edit-configuration flow generically | Covered at flow level; label assertions will need updating |
| PDP opened from cart shows current configuration pre-selected | CFG-EDIT-001 asserts "Edit configuration opens with current selection (option A) visible" | Covered |
| All section types pre-filled (radio, text, file) when editing from cart | CFG-EDIT-001/002/003 each cover one section type | Covered per section type |

### AC-6: "Add to cart" button renamed to "Update cart" in edit-from-cart context

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| Button reads "Update cart" (not "Add to cart") when editing an existing cart item | CFG-EDIT-001 steps say "Click Save or Update" — label not specifically asserted | **GAP: button label assertion missing** |
| Clicking "Update cart" updates the existing line item (no duplicate created) | CFG-EDIT-001 asserts "Cart line item updated in-place (no duplicate)" | Covered on behavior; label not asserted |
| Price updates to reflect new configuration after clicking "Update cart" | CFG-EDIT-001 asserts price reflects option B after update | Covered |
| Clicking "Update cart" returns user to cart page | No navigation assertion after successful edit | **GAP: post-update navigation not asserted** |

### AC-7: "Create new configuration" from edit-from-cart context restarts config and shows "Add to cart"

| Scenario | Existing coverage | Gap? |
|----------|------------------|------|
| "Create new configuration" button visible while in edit-from-cart context | No existing case covers this button in edit context | **GAP: new case needed** |
| Clicking "Create new configuration" in edit context resets all selections | No existing case covers this | **GAP: new case needed** |
| After reset in edit context, button switches from "Update cart" to "Add to cart" | No existing case covers this state transition | **GAP: new case needed** |
| New configuration is added as a separate cart line (per BL-CART-007) | CFG-E2E-041 covers different configurations creating separate lines, but not from the edit-context restart flow | **PARTIAL GAP: BL-CART-007 covered generically; edit-restart-then-add not covered** |
| Original configured line item in cart is unchanged when adding a new one | Not covered | **GAP: new case needed** |

---

## Gap Summary

### New test cases required (8 cases)

| ID (proposed) | Description | Priority | Suite | BL refs |
|---------------|-------------|----------|-------|---------|
| CFG-3902-001 | "Create new configuration" button label verified on PDP (fresh state) | Critical | 072 | BL-CAT-006 |
| CFG-3902-002 | "Create new configuration" resets widget: all selections cleared, price returns to base, qty returns to 0, "Add to cart" shown | Critical | 072 | BL-CAT-006, BL-PRICE-001 |
| CFG-3902-003 | Post-add-to-cart widget state: quantity stepper resets to 0 and "Add to cart" button re-disables | High | 072 | BL-CAT-006 |
| CFG-3902-004 | "Update cart" button label verified in edit-from-cart context | Critical | 072 | BL-PRICE-001 |
| CFG-3902-005 | "Create new configuration" button visible in edit-from-cart context and resets to "Add to cart" state | Critical | 072 | BL-CAT-006 |
| CFG-3902-006 | New config added from edit-restart flow creates a separate cart line; original line unchanged (BL-CART-007) | Critical | 072b | BL-CART-007 |
| CFG-3902-007 | Cart stepper: setting qty to 0 removes line item or shows validation (configurable product) | High | 072 | BL-CART-001 |
| CFG-3902-008 | Cart stepper respects max stock for selected option — quantity cannot exceed option inventory via cart stepper (BL-CART-001) | High | 072b | BL-CART-001 |

### Existing cases requiring update

| Case ID | Suite | Required update |
|---------|-------|----------------|
| CFG-PDP-017 | 072 | Update asserted button label from "Create your own configuration" to "Create new configuration" |
| CFG-EDIT-001 | 072 | Add assertion: button reads "Update cart" (not "Add to cart") in the edit context |
| CFG-EDIT-002 | 072 | Add assertion: button reads "Update cart" in the edit context |
| CFG-EDIT-003 | 072 | Add assertion: button reads "Update cart" in the edit context; also assert post-save navigation to cart |
| CFG-E2E-012 | 072b | Strengthen assertion: configuration detail explicitly verified as unchanged after qty-only stepper edit |

---

## Detailed Checklist by Scenario

### Scenario 1 — PDP: "Create new configuration" button

- [ ] **CFG-3902-001** Button labeled "Create new configuration" is visible on the configurable product PDP
- [ ] **CFG-PDP-017 (UPDATE)** Existing case still passes with new button label (regression check)
- [ ] **CFG-3902-002a** Clicking "Create new configuration" after selecting an option clears the selection (all radios return to default/None state)
- [ ] **CFG-3902-002b** After reset, total price returns to base price
- [ ] **CFG-3902-002c** After reset, quantity stepper returns to 0
- [ ] **CFG-3902-002d** After reset, "Add to cart" button is disabled (qty is 0)
- [ ] **CFG-3902-003a** After successful add-to-cart, quantity stepper resets to 0
- [ ] **CFG-3902-003b** After successful add-to-cart, "Add to cart" button returns to disabled state

### Scenario 2 — Cart: quantity stepper (no configuration change)

- [ ] **CFG-PDP-011** (existing) Increasing qty in cart stepper recalculates line total correctly — PASSES
- [ ] **CFG-E2E-012** (existing) Decreasing qty in cart stepper recalculates line total; configuration unchanged — PASSES (verify assertion is explicit)
- [ ] **CFG-3902-007** Setting cart qty to 0 for a configured line item results in removal or validation error (not a negative total)
- [ ] **CFG-3902-008** Cart stepper for configured product cannot exceed available option inventory; attempts to go over show error or cap at max
- [ ] BL-CART-006 pack size: if a configured option has a pack size > 1, verify the stepper increments by that step (document if not applicable to current test products)

### Scenario 3 — Edit configuration from cart

- [ ] **CFG-EDIT-001** (existing) Clicking edit on cart line item opens configuration UI with current option pre-selected — PASSES
- [ ] **CFG-3902-004** In edit context, the primary action button is labeled "Update cart" (not "Add to cart")
- [ ] **CFG-EDIT-001 (UPDATE)** After changing the option and clicking "Update cart", line item updates in place; no duplicate line created — passes with updated label assertion
- [ ] Post-"Update cart": user is navigated back to cart (or cart reflects the change visible immediately)
- [ ] **CFG-3902-005a** "Create new configuration" button is visible while in edit-from-cart context
- [ ] **CFG-3902-005b** Clicking "Create new configuration" in edit context resets all sections to defaults
- [ ] **CFG-3902-005c** After reset in edit context, button label changes from "Update cart" to "Add to cart"
- [ ] **CFG-3902-006a** Completing the new configuration and clicking "Add to cart" from the reset state creates a NEW separate cart line item (BL-CART-007)
- [ ] **CFG-3902-006b** Original cart line item (the one that was being edited) remains unchanged in the cart

---

## Regression Risk Areas

The following existing cases are at risk of breaking if the label changes or state-reset logic introduces regressions. These should be executed as part of the verification run:

| Case | Risk |
|------|------|
| CFG-PDP-005 | Quantity stepper enable/disable logic could be affected by post-add reset |
| CFG-PDP-006 | Happy path add-to-cart; post-add state is where the bug manifests |
| CFG-PDP-011 | Cart quantity stepper behavior |
| CFG-E2E-012 | Cart quantity update with configuration preservation |
| CFG-EDIT-001, 002, 003 | Edit-from-cart full flow (all section types) |
| CFG-E2E-041 | Different configurations = separate lines (BL-CART-007 core invariant) |
| CFG-E2E-046 | Stock enforcement during add (adjacent to new BL-CART-001 cart-stepper case) |

---

## Edge Cases to Verify

| ECL ref | Scenario |
|---------|----------|
| ECL-7.1 | Configuration widget renders correctly in all states: fresh PDP, post-add, edit-from-cart, reset-from-edit |
| ECL-1.2 | Session timeout during configuration — if user times out while editing from cart, configuration state does not corrupt the cart |
| ECL-2.1 | Stock race condition: option goes OOS between PDP load and "Add to cart" click during create-new-config flow (CFG-E2E-038 covers this for standard add; verify it also applies to the restart flow) |

---

## Delegation

| Layer | Assigned to | Cases |
|-------|-------------|-------|
| Storefront UI (PDP buttons, widget state, cart stepper) | `qa-frontend-expert` / `playwright-chrome` | CFG-3902-001 through CFG-3902-008; regressions CFG-PDP-005, 006, 011, EDIT-001/002/003 |
| GraphQL (addItem, changeCartConfiguredItem, quantity) | `qa-backend-expert` / `playwright-edge` | Verify API payload does not double-count quantity when "unexpected amount" is submitted |
| E2E cross-layer (separate lines, cart integrity) | `qa-frontend-expert` (lead) + `qa-backend-expert` (verify) | CFG-3902-006, CFG-E2E-041 regression |

---

## Cross-Layer Verification for P0 Cases (CFG-3902-006)

- [ ] STOREFRONT: Two separate line items visible in cart with distinct configurations
- [ ] CONSOLE: No JS errors during "Create new configuration" restart flow
- [ ] NETWORK: No unexpected addItem calls; verify exactly one addItem fired per "Add to cart" click
- [ ] API: Cart API response contains two distinct items with separate configurationItems[] arrays
- [ ] ADMIN: Admin cart/order view shows both configured line items with correct prices

---

## Notes

1. The root cause of the quantity bug is most likely in the add-to-cart interaction: if the widget's quantity value was not reset after a successful add, a second "Add to cart" click would submit whatever quantity remained in the stepper rather than starting from 1. The post-add state reset (CFG-3902-003) is the direct regression check for the original bug.

2. The "Create new configuration" button rename is a design change. Any screenshot-based or text-based assertions in existing cases that reference "Create your own configuration" will fail and need updating in the suite CSVs (CFG-PDP-017 is the primary case; do a full-text search of all four suites for the old label before marking as done).

3. BL-CART-006 (pack size) is flagged in the ticket's business rules but no current test product in the QA catalog is known to have a pack size > 1 for configurable options. If such a product exists, add a targeted case. If not, document as out-of-scope until a suitable test product is seeded.
