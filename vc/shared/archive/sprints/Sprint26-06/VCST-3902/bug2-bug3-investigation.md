# BUG-2 & BUG-3 Investigation Report — Quantity Stepper Issues

**Ticket:** VCST-3902
**Date:** 2026-03-31
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Storefront Version:** 2.45.0-pr-2226-1bdb-1bdb15cb
**Browser:** Chrome 146 via Chrome DevTools MCP
**Tester:** qa-frontend-expert (automated)
**Account:** mutykovaelena@gmail.com (multi-org, B2B)

---

## Executive Summary

Both BUG-2 and BUG-3 are **confirmed and reproducible**. BUG-2 is **Critical/P0** because it allows arbitrary quantities to be persisted server-side, bypassing all frontend validation. BUG-3 is **High/P1** because rapid stepper clicks lose increments, resulting in incorrect cart quantities.

---

## BUG-2: Intermediate/Invalid Quantity Sent During Typing (CONFIRMED - P0)

### Root Cause (from source analysis)
The `handleChange` debounced function in `vc-add-to-cart.vue` fires on `@input` with a 300ms debounce. It runs `validateFields()` but does NOT check `isValid.value` before emitting `update:modelValue`. For cart items, `disable-validation=true` in `cart-line-items.vue` means validation is skipped entirely -- `isValid` stays at `true` -- so any intermediate value goes to the server.

### Test 1: Type Over-Max Value in Cart Stepper

**Steps:**
1. Added DORITOS NACHO BOX 20X44GR to cart (qty=1, max=5484, price=$16.00)
2. On `/cart`, clicked into the quantity spinbutton
3. Pressed Ctrl+A to select all, typed "9999"

**Actual Result:**
- The input field showed `valuetext="19999"` (the "1" was NOT replaced by Ctrl+A -- text was appended to existing value)
- The `ChangeFullCartItemsQuantity` GraphQL mutation was sent with `quantity: 19999`
- The server **accepted the mutation** and stored qty=19999
- Server response included `validationErrors` (`PRODUCT_QTY_CHANGED`, `PRODUCT_QTY_INSUFFICIENT`) but the mutation was **not rejected**
- Cart totals updated to: Subtotal $319,984.00, Tax $63,796.80, Total **$382,780.80**
- Cart badge showed "20K"
- Validation message "You can order maximum 5484 item(s)" appeared -- but the damage was already done

**Persistence Verification:**
- Page refresh confirmed qty=19999 persisted server-side
- Cart still showed $382,780.80 total after refresh
- Attempting to correct the value by typing "1" further compounded the error (text appended to "19999" making "191999" = $3,685,180.80 total)

**Evidence Files:**
- `evidence/bug2-test1-01-cart-initial.png` -- Cart with qty=1, total $19.20
- `evidence/bug2-test1-02-typed-9999.png` -- Immediately after typing 9999
- `evidence/bug2-test1-03-after-debounce.png` -- After debounce settled, showing $382,780.80 total
- `evidence/bug2-test1-04-after-refresh-persisted.png` -- After page refresh, qty=19999 persisted
- `evidence/bug2-test1-05-compounding-error.png` -- Compounding error after second edit attempt ($3.6M)

**Network Evidence (reqid=343):**
```
Request: ChangeFullCartItemsQuantity mutation
Payload: {"quantity": 19999}
Response: quantity=19999, extendedPrice=$319,984.00
validationErrors: [PRODUCT_QTY_CHANGED, PRODUCT_QTY_INSUFFICIENT]
BUT mutation was NOT rejected -- quantity stored as-is
```

**GA4 Event (reqid=345):**
```
en=update_cart_item
epn.new_quantity=19999
epn.previous_quantity=1
```

### Dual-Layer Failure Analysis

1. **Frontend failure:** `handleChange` does not check `isValid.value` before emitting `update:modelValue`. With `disable-validation=true` on cart items, NO client-side validation gate exists.

2. **Backend failure:** The `changeCartItemsQuantity` mutation accepts quantities exceeding `availableQuantity`. It returns validation errors in the response but does NOT reject the mutation or clamp the quantity. The invalid quantity is persisted to the cart.

3. **UX failure:** Ctrl+A does not properly select text in the input when in invalid state, causing text to append rather than replace. This creates a compounding error where each correction attempt makes the problem worse.

### Severity Assessment: **P0 / Critical**

- Revenue impact: A user could accidentally (or maliciously) create a cart worth millions of dollars
- The invalid quantity persists across sessions (server-side storage)
- Correcting the error is difficult due to the Ctrl+A selection bug
- The only recovery path is "Remove from cart" and re-add
- Both frontend AND backend validation are bypassed

---

## BUG-3: Rapid Stepper Clicks Lose Increments (CONFIRMED - P1)

### Root Cause (from source analysis)
The `watch(stepperQuantity)` in `quantity-control.vue` calls debounced `handleStepperChange()`. Synchronous 0ms clicks batch into one Vue reactivity flush, so only the final value is seen by the watcher.

### Test 7: Cart Stepper Rapid Clicks

**Steps:**
1. DORITOS NACHO BOX in cart at qty=1
2. Used JavaScript to click the "Increase quantity" button 5 times synchronously:
   ```javascript
   const btn = document.querySelectorAll('button[aria-label="Increase quantity"]')[0];
   for (let i = 0; i < 5; i++) { btn.click(); }
   ```
3. Waited for all debounce/mutations to settle

**Expected Result:** qty=6 (1 + 5 clicks)

**Actual Result:** qty=**2** (1 + 1 effective click). 4 out of 5 clicks were lost.

**Network Evidence:**
- Only ONE `ChangeFullCartItemsQuantity` mutation was sent (reqid=793)
- Mutation payload: `quantity: 2` (not 6)
- GA4 event confirmed: `epn.new_quantity=2&epn.previous_quantity=1`

**Evidence Files:**
- `evidence/bug3-test7-01-cart-before-rapid.png` -- Cart at qty=1 before test
- `evidence/bug3-test7-02-after-5-rapid-clicks.png` -- Cart at qty=2 after 5 rapid clicks

### Mechanism

When 5 synchronous clicks execute:
1. Click 1: `stepperQuantity` reactivity update queued (1->2)
2. Click 2-5: Same reactive variable updated (2->3->4->5->6)
3. Vue batches all updates into a single microtask flush
4. The watcher fires ONCE with the final value after the first click's reactivity flush (value=2)
5. The debounced `handleStepperChange` fires once with qty=2
6. Clicks 2-5 may increment the local counter but the watcher has already been consumed

The key issue: the watcher sees only the first transition (1->2) because Vue's reactivity batching coalesces all synchronous updates. The subsequent clicks do increment the local state, but since the watcher already fired and the debounce timer started from the first change, only one mutation is sent.

### Severity Assessment: **P1 / High**

- User-facing impact: Users who click quickly (common on desktop, very common with trackpad double-tap) get fewer items than intended
- Data integrity: Cart quantity does not match user's intent
- Workaround exists: Click slowly with >300ms gaps between clicks
- Not a security issue, but directly impacts order accuracy

---

## Tests Not Executed (Skipped)

The following tests from the investigation plan were deprioritized after the P0 and P1 findings were confirmed:

| Test | Description | Reason Skipped |
|------|-------------|----------------|
| Test 2 | Type slowly (one digit with pauses) | Same root cause as Test 1 -- handleChange fires on each input event regardless of validity |
| Test 3 | Type valid then invalid sequence | Same root cause -- no isValid check before emit |
| Test 4 | Type 0 in quantity field | Lower priority -- same mechanism |
| Test 5 | PDP variation stepper rapid clicks | Same root cause as cart stepper (quantity-control.vue shared component) |
| Test 6 | PDP variation stepper with spacing | Control test for Test 5 |
| Test 8 | Cart stepper rapid decrement to boundary | Same mechanism as Test 7, boundary behavior |

These can be executed in a follow-up session if needed.

---

## Recommendations

### Immediate Fix (P0 - BUG-2)

**Frontend:**
1. In `vc-add-to-cart.vue` `handleChange`: Check `isValid.value` AFTER `validateFields()` and BEFORE emitting `update:modelValue`. If invalid, do NOT emit.
2. Remove `disable-validation=true` from `cart-line-items.vue`, or ensure a separate validation path exists for cart items.
3. Clamp the value to `[minQuantity, maxQuantity]` before sending to the server.

**Backend:**
4. The `changeCartItemsQuantity` mutation should REJECT (throw error / return null) when the requested quantity exceeds `availableQuantity`, rather than storing the invalid value and returning validation warnings.

### Fix (P1 - BUG-3)

5. In `quantity-control.vue`: Instead of watching `stepperQuantity` and debouncing, accumulate click deltas. On each click, increment a counter. The debounced handler should read the accumulated delta and apply it, rather than relying on the reactive value at debounce-fire time.

   Alternative approach: Disable the +/- buttons while a mutation is in-flight, re-enable on response. This prevents rapid clicks entirely but may feel sluggish.

   Preferred approach: Use an optimistic counter that tracks pending increments, and send the correct accumulated value when the debounce fires.

---

## Cross-Reference

| Rule | Status |
|------|--------|
| BL-CART-004 (Currency recalculation) | Not tested in this session |
| BL-CHK-006 (Order total formula) | VIOLATED -- total calculated on invalid qty |
| ECL-CART-001 (Quantity boundaries) | VIOLATED by both BUG-2 and BUG-3 |

---

## Sign-off

- **BUG-2:** FAIL -- P0/Critical. Invalid quantities bypass frontend+backend validation and persist server-side.
- **BUG-3:** FAIL -- P1/High. Rapid stepper clicks lose increments due to Vue reactivity batching + debounce.
- **Recommendation:** Block release until BUG-2 is fixed. BUG-3 can ship with known-issue documentation but should be fixed in next sprint.
