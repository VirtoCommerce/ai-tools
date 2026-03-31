# BUG: [Configurable products] Double-click "Add to cart" creates duplicate line items

**Related Ticket:** VCST-3902
**Severity:** Critical
**Priority:** P0
**Type:** Bug
**Status:** Reproduced
**Environment:** QA Storefront - https://vcst-qa-storefront.govirto.com
**Browser:** Firefox (Playwright MCP), Edge (Playwright MCP) — reproduced on both
**Store Version:** 2.45.0-pr-2226-1bdb-1bdb15cb
**Date:** 2026-03-31
**Tested By:** qa-testing-expert
**BL Violation:** BL-CHK-003 (Double-submit prevention)

---

## Summary

Double-clicking the "ADD TO CART" button on a configurable product creates duplicate cart line items with identical configurations. The button is NOT disabled between clicks — Vue's reactivity does not propagate the `disabled` state to the DOM before the second click handler fires.

---

## Steps to Reproduce

1. Navigate to a configurable product PDP (e.g., Configurable Hat at `/products-with-options/configurable-caps-shirts/configurable-hat`)
2. If in edit mode, click "Create new configuration" to reset
3. Select required configuration options (if any)
4. Double-click "ADD TO CART" as fast as possible (two clicks within ~50ms)
5. Navigate to `/cart`

**Expected:** 1 new line item created. Button should disable after first click.
**Actual:** 2 identical line items created with the same configuration.

---

## Root Cause (Source Code Analysis)

**File:** `client-app/shared/cart/components/add-to-cart.vue` (PR #2226)
**Function:** `onConfigurableSubmit()`

```typescript
async function onConfigurableSubmit() {
  // MISSING: if (loading.value) return;  <-- This guard is absent
  const lineItem = getLineItem(cart.value?.items);
  const mode = lineItem ? AddToCartModeType.Update : AddToCartModeType.Add;
  // ...validation...
  loading.value = true;
  try {
    // ...addToCart mutation...
  } finally {
    loading.value = false;
  }
}
```

The button template uses `:disabled="disabled"` where `disabled = computed(() => loading.value || ...)`. However:

1. **Vue reactivity gap:** Setting `loading.value = true` triggers a reactive update, but the DOM re-render (applying `disabled` attribute to the button) happens asynchronously in the next microtask. Two clicks arriving in the same event loop frame both execute `onConfigurableSubmit()` before the button becomes disabled.

2. **`getLineItem()` returns `undefined` for both clicks:** For new configurable products (no `lineItemId` in URL), `getLineItem()` always returns `undefined`, so `mode = Add` for both clicks. The second click doesn't detect the first item because `router.replace({ query: { lineItemId: newItem.id } })` hasn't completed yet.

3. **Contrast with non-configurable products:** `AddToCartSimple` component uses a different mechanism (`updateItemCartQuantity` which is idempotent — same productId increments qty instead of creating a duplicate). The configurable product path uses `addToCart()` which always creates a new line item.

---

## Impact

- Customers may accidentally add duplicate configured items to cart
- Duplicate orders possible if not caught during checkout review
- Revenue risk: incorrect order totals, fulfillment confusion
- Violates BL-CHK-003 (Place Order / Add to Cart idempotency)

---

## Suggested Fix

Add an early return guard at the top of `onConfigurableSubmit()`:

```typescript
async function onConfigurableSubmit() {
  if (loading.value) return;  // Prevent double-submit
  // ...rest of function
}
```

Additionally, consider using `addToCartLoading` from `useShortCart()` in the `disabled` computed (it tracks the Apollo mutation state, which stays `true` for the full network round-trip):

```typescript
const disabled = computed(() => loading.value || addToCartLoading.value || !product.value.availabilityData?.isAvailable);
```

---

## Evidence

| File | Description |
|------|-------------|
| `tests/Sprint-current/VCST-3902/18-cart-duplicate-check.png` | 4 identical Configurable Hat lines after double-clicks |
| `tests/Sprint-current/VCST-3902/03-cart-after-double-click.png` | Cart showing duplicates |
| `tests/Sprint-current/VCST-3902/exploratory-session.md` | Full exploratory session log |

---

## Scope

- **Introduced by:** PR VirtoCommerce/vc-frontend#2226 (`feat/VCST-3902-quantity-stepper`)
- **Blocker for:** VCST-3902 merge
- **Affects:** All configurable product types using `AddToCart` component
- **Does NOT affect:** Simple products (they use `AddToCartSimple`)
