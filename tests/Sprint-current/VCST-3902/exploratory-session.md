# Exploratory Testing Session: VCST-3902

**Ticket:** VCST-3902 - [Design][Configurable products] Quantity stepper add to cart - unexpected amount added
**Charter:** Risk-based exploratory session focusing on quantity/state management edge cases around configurable products and cart interaction
**Heuristic:** SFDPOT (Structure, Function, Data, Platform, Operations, Time)
**Browser:** Edge (Playwright MCP) -- Firefox was unavailable due to browser install version mismatch
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`), build `2.45.0-pr-2226-1bdb-1bdb15cb`
**Date:** 2026-03-31
**Tester:** qa-testing-expert (automated via MCP)
**Duration:** ~25 minutes active testing

---

## Products Tested

| Product | URL Pattern | Type | Configuration Model |
|---------|------------|------|-------------------|
| Base product EN | `/products-with-options/configurable-caps-shirts/111111` | Configurable with per-variation steppers | Each variation has its own +/- stepper; changes auto-add to cart |
| Configurable Hat | `/products-with-options/configurable-caps-shirts/configurable-hat` | Configurable with single "Add to Cart" | Select options via radio buttons, then click "ADD TO CART" button |

---

## Findings Summary

| # | Type | Severity | Title |
|---|------|----------|-------|
| F1 | Observation | -- | Variation stepper +/- clicks immediately add/remove from cart (no separate Add to Cart button for per-variation model) |
| F2 | Bug | Medium | Rapid synchronous clicks (0ms) on + button: 5 clicks = qty 1 instead of qty 5 |
| F3 | Bug | High | Race condition: rapid clicks cause contradictory mutations (qty=0 then qty=1 sent to server) |
| F4 | Observation | -- | Quantity input has `min=1`, `max={stock}`, `type=number`; value 0 represents "not in cart" state |
| F5 | Bug | High | Typing "999" (exceeds max=33) results in qty=9 in cart -- intermediate digit sent to server |
| F6 | Bug | High | Server accepted partial value: 999 typed, but cart received qty=9 (first digit only) instead of clamping to max=33 |
| F7 | Observation | Low | Typing "-5" resulted in qty=5 (browser strips minus sign from `input[type=number]` with `min=1`) |
| F8 | Observation | PASS | Non-numeric characters ("abc") correctly rejected by `input[type=number]` |
| F9 | Observation | PASS | Multiple variations (3 different products, different quantities) work correctly with individual +/- clicks spaced 2s apart |
| F10 | Observation | PASS | Browser back button preserves cart state correctly (server-side state fetched on load) |
| F11 | Observation | PASS | Minus button correctly disabled at qty=0 |
| F12 | Observation | -- | With 200ms spacing, debounce batches correctly: 3 clicks -> 1 mutation with qty=3 |
| F13 | Bug | Medium | 5 synchronous clicks (0ms delay) result in qty=1. Only first click registers, others lost. |
| F14 | Observation | PASS | With 50ms spacing, 5 clicks correctly result in qty=5 (single batched mutation) |
| F15 | Question | -- | "Create new configuration" button not visible on Base product EN (per-variation stepper model). Only present on Configurable Hat (single Add to Cart model) |
| F16 | Observation | PASS | After adding configurable product, button changes from "ADD TO CART" to "UPDATE CART" and "Create new configuration" link appears |
| F17 | Observation | PASS | "Create new configuration" correctly resets page: removes lineItemId from URL, restores "ADD TO CART" button, hides "Create new configuration" link |
| F18 | Observation | PASS | "UPDATE CART" without changes is idempotent (no duplicate created, cart count unchanged) |
| F19 | Bug | P0 | ADD TO CART button NOT disabled after first click (double-submit prevention missing) |
| F20 | Bug | P0 | Double-clicking "ADD TO CART" creates duplicate cart line items with identical configuration |

---

## Bug Details

### BUG-1 (P0): Double-click on "ADD TO CART" creates duplicate configurable product lines

**Severity:** P0 (Critical) -- BL-CHK-003 violation (double-submit prevention)
**Product:** Configurable Hat
**Steps to reproduce:**
1. Navigate to Configurable Hat PDP
2. Click "Create new configuration" (if in edit mode)
3. Click "ADD TO CART" twice rapidly (synchronous double-click)
4. Navigate to /cart

**Expected:** Only 1 new line item created. Button should disable after first click.
**Actual:** 2 identical line items created. Button remains enabled (`disabled: false`) immediately after first click.
**Evidence:** `tests/Sprint-current/VCST-3902/18-cart-duplicate-check.png`
**Impact:** Customers may accidentally add duplicate configured items, leading to incorrect orders and potential revenue issues.

---

### BUG-2 (High): Typing over-max quantity sends intermediate digit to cart

**Severity:** High
**Product:** Base product EN (per-variation stepper)
**Steps to reproduce:**
1. Navigate to Base product EN PDP
2. Click into the quantity input for "Base product Blue" (stock: 33, max: 33)
3. Type "999" and press Enter

**Expected:** Input should either clamp to max (33) or reject the input with only a validation error and not update cart.
**Actual:**
- UI shows "999" in red with validation error "Order from 1 to 33 item(s)" -- correct display
- But the actual cart quantity is **9** (not 33, not 999)
- The server received an intermediate value during typing (likely "9" before "99" or "999")
**Evidence:** `tests/Sprint-current/VCST-3902/11-qty-999-typed.png`, `tests/Sprint-current/VCST-3902/12-cart-after-999.png`
**Root cause hypothesis:** The debounce fires mid-typing and sends the current partial value to the server before all digits are entered.

---

### BUG-3 (Medium): Synchronous rapid clicks on quantity stepper lose increments

**Severity:** Medium (real users click at ~50ms+ intervals which works; 0ms is edge case)
**Product:** Base product EN (per-variation stepper)
**Steps to reproduce:**
1. Navigate to Base product EN PDP, scroll to Product Variations
2. Click the + button on any variation 5 times as fast as possible (< 10ms between clicks)

**Expected:** Quantity should increment to 5.
**Actual:** Quantity increments to 1 only. The remaining 4 clicks are lost.
**Network evidence:** Only 1 `UpdateShortCartItemQuantity` mutation sent with `quantity: 1`.
**Workaround confirmed:** With 50ms delay between clicks, all 5 increments register correctly.
**Root cause hypothesis:** Vue reactive state update coalesces synchronous events. The click handler uses `nextTick` or similar mechanism that processes only once per microtask.

---

## Debounce Behavior Analysis

| Click Spacing | Clicks | Final Qty | Mutations Sent | Result |
|--------------|--------|-----------|----------------|--------|
| 0ms (sync) | 5 | 1 | 1 (qty=1) | FAIL - clicks lost |
| 50ms | 5 | 5 | 1 (qty=5) | PASS - batched correctly |
| 200ms | 3 | 3 | 1 (qty=3) | PASS - batched correctly |
| 2000ms | 1+1+1 | 1+2+1 | 3 (individual) | PASS - each processed |

The debounce timer appears to be ~1-2 seconds. The issue is that synchronous/near-synchronous clicks (0ms) are coalesced by Vue's reactivity system before even reaching the debounce.

---

## Areas Tested (SFDPOT)

| Dimension | Coverage | Key Findings |
|-----------|----------|-------------|
| **Structure** | Tested 2 configurable product types (per-variation stepper vs single Add to Cart) | Different UI patterns for different product configs |
| **Function** | Quantity +/-, typing values, Add to Cart, Update Cart, Create new configuration | Double-submit bug (P0), over-max input bug |
| **Data** | qty=0, qty=999, qty=-5, qty="abc", max boundary | Input validation display works but server receives incorrect values |
| **Platform** | Edge browser only (Firefox install issue) | No browser-specific issues found |
| **Operations** | Navigation (back/forward), rapid clicks, state persistence | Back button preserves state correctly |
| **Time** | Debounce timing (0ms, 50ms, 200ms, 2000ms) | 0ms clicks lose data, 50ms+ works |

---

## Not Tested (blocked or out of scope)

- Firefox and cross-browser comparison (Firefox MCP install mismatch)
- Edit from cart flow (clicking "Edit" on a configurable item in the cart page)
- Two-tab concurrent editing
- Mobile viewport
- Configuration section interactions (file upload, text input, product selection sections)

---

## Recommendations

1. **P0 Fix Required:** Disable "ADD TO CART" / "UPDATE CART" buttons immediately on click and re-enable after server response. This prevents duplicate cart lines.
2. **High Fix Required:** The quantity input debounce should NOT send partial values during typing. Consider:
   - Only sending the mutation on `blur` or `Enter` keypress (not on every input change)
   - Validating the value against min/max BEFORE sending to server
   - Clamping to max if over-max value is entered
3. **Medium Fix Recommended:** Investigate the synchronous click coalescing in the Vue quantity stepper component. While 0ms is an edge case, it could affect users with accessibility tools that fire rapid events.

---

## Evidence Files

| File | Description |
|------|-------------|
| `02-products-with-options.png` | Products with options category page |
| `05-configure-sections.png` | Configure the parameters section |
| `08-variations-list.png` | Product variations with quantity steppers |
| `10-all-variations-visible.png` | All 3 variations visible with qty counters |
| `11-qty-999-typed.png` | Typing 999 in quantity input -- validation error shown but value sent |
| `12-cart-after-999.png` | Cart showing qty=9 after typing 999 |
| `14-three-variations-in-cart.png` | 3 different variations in cart simultaneously |
| `15-configurable-hat.png` | Configurable Hat PDP with ADD TO CART button |
| `17-hat-after-add-to-cart.png` | After add to cart: UPDATE CART + Create new configuration |
| `18-cart-duplicate-check.png` | **4 duplicate Configurable Hat lines after double-click** |
