# BUG-2 Investigation: Quantity Input Sends Invalid Values to Server

**Product:** BLACK STRAWS PAPER BLACK 24CM-6MM PACK 500PCS
**URL:** https://vcst-qa-storefront.govirto.com/kitchen-supplies/everything-for-kitchen/straws-paper-black-24cm-6mm-pack-500pcs
**Product ID:** `f86a35c6-6845-4ea4-8bb0-820afe5d0dad`
**Browser:** Firefox (playwright-firefox)
**Date:** 2026-03-31
**Investigator:** qa-testing-expert

---

## Product Constraints

| Property       | Value |
|----------------|-------|
| Min Quantity   | 9     |
| Max Quantity   | 129   |
| Available Stock| 129   |
| Pack Size      | N/A   |
| Price (actual) | $15.90|
| Price (list)   | $88.00|
| Material       | Steel |

## Root Cause Confirmed

The `handleChange` debounced function (300ms) in `vc-add-to-cart.vue` fires on `@input` event and sends the mutation **before** checking whether the value is valid. For cart items specifically, `disable-validation=true` skips client-side validation entirely, so any value typed into the input goes directly to the server via the `ChangeFullCartItemsQuantity` GraphQL mutation.

The server (xAPI) does **NOT** enforce min/max quantity constraints on the `changeCartItemsQuantity` mutation. It accepts any integer value, including values below minQuantity, above maxQuantity (available stock), and zero (which removes the item).

---

## Test Results

### Step 1: Product Understanding

- Product page loads correctly with 4 variations
- Target variation (500PCS) shows qty stepper with min=9, max=129
- The `+` button correctly sets quantity to 9 (minQuantity) on first click
- Network confirmed: `UpdateShortCartItemQuantity` mutation sent with `quantity: 9`

**Screenshot:** `step1-product-page.png`, `step2-variations-visible.png`

### Step 2: Add to Cart (Baseline)

- Cart page shows line item with qty=9, total $143.10
- Cart input attributes: `min="9"`, `max="129"`, `type="number"`
- `-` button correctly disabled at min value
- No validation errors

**Screenshot:** `step2-cart-page.png`

### Step 3: Over-Max Value (999) -- FAIL

**Action:** In cart, select all text in qty input, type "999" digit by digit.

**Observation 1 -- First "9" typed:**
- Ctrl+A did NOT select all text in Firefox number input; "9" was appended to existing "9", making "99"
- Debounce fired with qty=99 (within valid range)
- Server accepted: `ChangeFullCartItemsQuantity` with `quantity: 99` -> HTTP 200
- Cart icon immediately showed 99, totals recalculated to $1,574.10

**Observation 2 -- Second "9" typed (now "999"):**
- Client validation error appeared: "You can order maximum 129 item(s)"
- BUT the mutation was ALREADY SENT with `quantity: 999` -> HTTP 200
- Server accepted the over-max value
- Cart icon: 999, total: $15,884.10
- Sidebar showed "Something went wrong. Please try again later."

**Observation 3 -- After page refresh:**
- Server persisted qty=999
- Validation error still shows: "You can order maximum 129 item(s)"
- Total persists at $15,884.10 / $87,912.00
- The invalid state survives page reload

**Network evidence:**
```
ChangeFullCartItemsQuantity -> quantity: 99  -> HTTP 200 (intermediate)
ChangeFullCartItemsQuantity -> quantity: 999 -> HTTP 200 (over-max, accepted)
```

**Screenshots:** `step3-typed-first-9.png`, `step3-typed-999.png`, `step3-after-refresh-999.png`

**Verdict: FAIL** -- Server accepts and persists qty > maxQuantity

### Step 4: Zero Value (0) -- FAIL

**Action:** Select all text, type "0".

**Result:**
- Mutation fired: `ChangeFullCartItemsQuantity` with `quantity: 0` -> HTTP 200
- **Item was removed from cart entirely** (cart shows "Your cart is empty")
- No confirmation dialog shown
- No "minimum 9 items" validation error
- The removal is silent and irreversible without re-adding

**Network evidence (from saved file):**
```
ChangeFullCartItemsQuantity -> quantity: 9 -> HTTP 200 (reset)
ChangeFullCartItemsQuantity -> quantity: 0 -> HTTP 200 (item removed)
```

**Screenshot:** `step4-typed-0.png`

**Verdict: FAIL** -- qty=0 silently removes item without confirmation, bypasses minQuantity validation

### Step 5: Negative Value (-5) -- PARTIAL FAIL

**Action:** Select all text, type "-5".

**Result:**
- HTML `type="number"` input rejected the "-" character (min >= 0)
- Only "5" was accepted, making the value 5 (below min of 9)
- Mutation fired: `ChangeFullCartItemsQuantity` with `quantity: 5` -> HTTP 200
- Validation error appeared: "You can order minimum 9 item(s)"
- BUT the value was already persisted on the server
- After refresh: qty=5 persists, validation error shows

**Screenshot:** `step5-typed-negative5.png`, `step5-after-refresh.png`

**Verdict: FAIL** -- Server accepts qty < minQuantity. HTML prevents actual negative numbers, but values between 0 and min are accepted.

### Step 6: Boundary Values (129 exact, 130 one-over) -- MIXED

**Action 1:** Type "129" (exact max).
- Accepted correctly, no validation error
- Total: $2,051.10
- "+" button disabled (correct behavior)

**Action 2:** Type "130" (one over max).
- Mutation fired: `ChangeFullCartItemsQuantity` with `quantity: 130` -> HTTP 200
- Validation error: "You can order maximum 129 item(s)"
- Server accepted and persisted qty=130
- "Something went wrong. Please try again later." in sidebar

**Screenshots:** `step6-typed-129.png`, `step6-typed-130.png`

**Verdict:** 129 = PASS, 130 = FAIL

### Step 7: Network Mutation Log Summary

| Test Case | Value Sent | HTTP Status | Server Persisted | Valid? |
|-----------|-----------|-------------|-----------------|--------|
| Add via + button | 9 | 200 | Yes | Yes (min) |
| Type "99" (mid-typing) | 99 | 200 | Yes | Yes |
| Type "999" (over max) | 999 | 200 | Yes | **NO (max=129)** |
| Type "0" | 0 | 200 | Item removed | **NO (min=9)** |
| Type "5" (under min) | 5 | 200 | Yes | **NO (min=9)** |
| Type "129" (exact max) | 129 | 200 | Yes | Yes |
| Type "130" (one over) | 130 | 200 | Yes | **NO (max=129)** |

### Step 8: Console Errors

**Zero JavaScript errors** throughout the entire investigation session.
Only warnings observed:
- Cookie `_ga_S2KXT3KTJZ` expiry overwrite (GA4 cookie, benign)
- Preloaded resource `index-CljRfL_C.js` not used within seconds (benign)
- WebSocket connection closed (navigation-related, benign)
- OpaqueResponseBlocking on external images (CORS, benign)

No Vue warnings, no unhandled promise rejections.

---

## Bug Summary

### Two-Layer Validation Failure

**Layer 1 -- Frontend (`vc-add-to-cart.vue`):**
- The `handleChange` debounce fires on every `@input` event after 300ms
- It calls `validateFields()` but does NOT check `isValid.value` before emitting the quantity
- For cart items, `disable-validation=true` means validation is completely skipped
- Result: any typed value (0, 5, 130, 999) is sent to the server

**Layer 2 -- Backend (xAPI `changeCartItemsQuantity` mutation):**
- The mutation accepts ANY integer quantity
- It does NOT validate against product `minQuantity` or `maxQuantity`
- It does NOT validate against `availableQuantity` (stock)
- qty=0 removes the item (no error returned)
- Result: invalid quantities are persisted server-side

### Impact

| Scenario | Severity | Impact |
|----------|----------|--------|
| Over-max ordering (999 > 129 stock) | **P0** | Could create orders for unavailable inventory |
| Silent item removal (qty=0) | **P1** | Data loss -- user loses cart item without confirmation |
| Under-min ordering (5 < 9 min) | **P1** | Violates business rules on minimum order quantities |
| Intermediate debounce values | **P2** | Unnecessary server mutations during typing |

### Recommended Fixes

1. **Frontend (immediate):** In `handleChange`, check `isValid.value` AFTER `validateFields()` and BEFORE emitting the quantity update. Do NOT emit if validation fails.

2. **Frontend (cart):** Remove or conditionally apply `disable-validation=true` for quantity changes. Validation should always run before server mutation.

3. **Frontend (qty=0):** Intercept qty=0 and show a confirmation dialog ("Remove item from cart?") instead of silently sending it.

4. **Backend (defense-in-depth):** The `changeCartItemsQuantity` mutation should validate quantity against product min/max/stock and return a GraphQL error if constraints are violated.

5. **Frontend (debounce improvement):** Consider validating on each keystroke and only sending the mutation when the final value passes validation. Alternatively, increase debounce or use `@change` (blur) event for the cart page input instead of `@input`.

---

## Evidence Files

| File | Description |
|------|-------------|
| `step1-product-page.png` | PDP showing product with variations |
| `step2-variations-visible.png` | Variation list with qty steppers |
| `step2-cart-page.png` | Cart with qty=9 (valid baseline) |
| `step3-typed-first-9.png` | Intermediate value 99 sent to server |
| `step3-typed-999.png` | Over-max 999 accepted, validation error shown |
| `step3-after-refresh-999.png` | 999 persists after page refresh |
| `step4-typed-0.png` | Cart empty after qty=0 (item removed) |
| `step5-typed-negative5.png` | Under-min qty=5 accepted |
| `step5-after-refresh.png` | qty=5 persists after refresh |
| `step6-typed-129.png` | Exact max (129) accepted correctly |
| `step6-typed-130.png` | Over-max 130 accepted, validation error shown |
| `network-step4-zero.txt` | Full network log showing qty=0 mutation |
| `network-step6-129.txt` | Full network log showing qty=129 mutation |
| `cleanup-reset-to-9.png` | Cart restored to valid state (qty=9) |
