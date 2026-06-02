# BUG: [Cart] Quantity input accepts and persists invalid values — no client or server validation

**Severity:** Critical
**Priority:** P0
**Type:** Bug
**Status:** Reproduced
**Environment:** QA Storefront - https://vcst-qa-storefront.govirto.com
**Browser:** Firefox (Playwright MCP), Chrome (Playwright MCP) — reproduced on both
**Store Version:** 2.45.0-pr-2226-1bdb-1bdb15cb
**Date:** 2026-03-31
**Tested By:** qa-testing-expert
**BL Violation:** BL-CART-001 (Max quantity enforcement), BL-CART-006 (Pack size / min qty enforcement)
**Test Product:** Straws Paper Black 24cm-6mm Pack 500pcs (min=9, max=129)

---

## Summary

When a user types a quantity value directly into the cart quantity input field, the value is sent to the server via GraphQL mutation **without any validation**. The server (`changeCartItemsQuantity` / `ChangeFullCartItemsQuantity`) accepts ANY integer value — including values exceeding available stock, values below minimum order quantity, and zero (which silently removes the item). Validation error messages appear in the UI but are purely cosmetic — the mutation has already been sent and accepted.

This is a **two-layer validation failure**: the frontend skips validation before sending, and the backend does not enforce constraints.

---

## Steps to Reproduce

### Scenario A: Over-max quantity (999 when max=129)
1. Add "Straws Paper Black 24cm-6mm Pack 500pcs" to cart (min qty = 9)
2. Navigate to `/cart`
3. Click into the quantity input field
4. Select all text (Ctrl+A), type "999"
5. Wait 2 seconds for debounce to settle

**Expected:** Value rejected or clamped to 129. Mutation NOT sent with invalid value.
**Actual:** Mutation sent with `quantity: 999`. Server returns HTTP 200. Cart shows qty=999, total=$15,884.10. Value persists after page refresh.

### Scenario B: Below-min quantity (5 when min=9)
1. Same product in cart
2. Select all text, type "5"

**Expected:** Value rejected or clamped to 9.
**Actual:** Mutation sent with `quantity: 5`. Server accepts. UI shows validation error "You can order minimum 9 item(s)" but qty=5 is already persisted.

### Scenario C: Zero quantity (silent item removal)
1. Same product in cart
2. Select all text, type "0"

**Expected:** Confirmation dialog "Remove item from cart?" or rejection.
**Actual:** Mutation sent with `quantity: 0`. Item silently removed from cart. No confirmation. No undo.

### Scenario D: One over max (130 when max=129)
1. Same product in cart
2. Select all text, type "130"

**Expected:** Rejected or clamped to 129.
**Actual:** Accepted and persisted. Sidebar shows "Something went wrong. Please try again later."

---

## Root Cause (Source Code Analysis)

### Frontend — Layer 1

**File:** `client-app/ui-kit/components/organisms/add-to-cart/vc-add-to-cart.vue`

```typescript
const handleChange = debounce(async () => {
  setValue(quantity.value);
  const newQuantity = Number(quantity.value);
  if (isNaN(newQuantity) || newQuantity < 1 || newQuantity === modelValue.value || pendingQuantity.value === newQuantity) {
    return;
  }
  await validateFields();                    // Sets isValid = false for invalid values
  emit("update:modelValue", newQuantity);    // Emits ANYWAY — does not check isValid
  pendingQuantity.value = newQuantity;
}, timeout.value ?? 0);
```

The `validateFields()` call sets `isValid.value = false` but the emit on the next line does NOT check `isValid.value` before sending.

**File:** `client-app/shared/cart/components/cart-line-items.vue` (line 41)

```html
<QuantityControl ... disable-validation ... />
```

For cart items, `disable-validation=true` **skips `validateFields()` entirely** — `isValid` stays at its initial `true` — so any value goes to the server.

### Backend — Layer 2

The `ChangeFullCartItemsQuantity` / `changeCartItemsQuantity` GraphQL mutation accepts any integer and returns HTTP 200. It does not validate against the product's `minQuantity`, `maxQuantity`, or `availableQuantity`. Validation warnings may appear in the response but the mutation is already applied.

---

## Test Evidence Summary

| Input | Min | Max | Sent to Server | HTTP | Persisted | Valid? |
|-------|-----|-----|---------------|------|-----------|--------|
| 9 | 9 | 129 | qty=9 | 200 | Yes | Yes |
| 99 | 9 | 129 | qty=99 | 200 | Yes | Yes |
| 999 | 9 | 129 | qty=999 | 200 | Yes | **NO** |
| 0 | 9 | 129 | qty=0 | 200 | Item removed | **NO** |
| 5 | 9 | 129 | qty=5 | 200 | Yes | **NO** |
| 129 | 9 | 129 | qty=129 | 200 | Yes | Yes |
| 130 | 9 | 129 | qty=130 | 200 | Yes | **NO** |

---

## Impact

- **Revenue risk (P0):** Orders can be placed for quantities exceeding available inventory, leading to overselling and fulfillment failures
- **Data loss:** qty=0 silently removes items without confirmation
- **Business rule violation:** min order quantity bypassed (e.g., qty=5 when min=9)
- **Cart corruption:** Invalid quantities persist across sessions and page refreshes
- **UX:** Validation errors are cosmetic — user sees "max 129" error but their cart already has 999

---

## Suggested Fixes

### Frontend (immediate)
1. In `vc-add-to-cart.vue` `handleChange()`: check `isValid.value` AFTER `validateFields()` and BEFORE emitting. Do NOT emit if validation fails.
2. In `cart-line-items.vue`: remove or conditionally apply `disable-validation=true` — validation must run before server mutation.
3. For qty=0: intercept and show confirmation dialog before sending mutation.
4. Consider using `@change` (blur) event instead of `@input` for cart quantity to avoid mid-typing mutations.

### Backend (defense-in-depth)
5. `changeCartItemsQuantity` mutation must validate quantity against product `minQuantity`, `maxQuantity`, and `availableQuantity`. Return a GraphQL error and reject the mutation if constraints are violated.

---

## Evidence

| File | Description |
|------|-------------|
| `tests/Sprint-current/VCST-3902/bug2-straws-investigation.md` | Full investigation report |
| `tests/Sprint-current/VCST-3902/step3-typed-999.png` | qty=999 accepted, validation error shown |
| `tests/Sprint-current/VCST-3902/step3-after-refresh-999.png` | qty=999 persists after refresh |
| `tests/Sprint-current/VCST-3902/step4-typed-0.png` | Cart empty after typing 0 |
| `tests/Sprint-current/VCST-3902/step5-typed-negative5.png` | qty=5 (under min) accepted |
| `tests/Sprint-current/VCST-3902/step6-typed-130.png` | qty=130 (over max) accepted |
| `tests/Sprint-current/VCST-3902/network-step4-zero.txt` | Network log showing qty=0 mutation |

---

## Scope

- **Pre-existing bug** — NOT introduced by PR #2226
- **Affects:** ALL products in the cart (simple and configurable), any product with min/max constraints
- **Components:** `vc-add-to-cart.vue`, `quantity-control.vue`, `cart-line-items.vue`, xAPI `changeCartItemsQuantity` mutation
