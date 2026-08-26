# [vc-frontend] Cart quantity stepper: decimal/negative input is sent to the server (rejected) → generic error toast instead of inline validation

## Status: CONFIRMED

**Severity:** Medium (client-side validation gap / UX — no data loss; server correctly rejects)
**Env:** vcst-qa storefront — Theme `2.51.0-pr-2310`, Platform `3.1035.0`, XCart `3.1019.0-pr-124-89a6`
**Owning layer:** Layer 1 — vc-frontend (cart quantity input validation)
**Reproduced:** 2026-06-11 (REG-2026-06-11-1423, suite 028 CART-036 — since split into CART-036/CART-065/CART-066; this decimal/negative symptom is now covered by CART-036 (negative) and CART-066 (decimal))

## Summary

Entering an invalid quantity (decimal e.g. `1.5`, negative, or non-integer) in the `/cart` line-item quantity stepper is **passed straight to the server**. The GraphQL mutation is rejected (server validation works — App Insights shows **no 5xx** for the run window), but the storefront surfaces a **generic red error toast** ("Apologies for the inconvenience…technical issues") instead of clean **inline** validation, and the input field **retains the invalid value** (e.g. "1.5") rather than reverting to the last valid quantity. Cart data is not corrupted (qty/total stay at last-valid).

Contrast: the **max-stock** cap (CART-037) and **pack-size** (CART-055) paths both show clean inline messages — only the **min/integer/negative** path is unhandled client-side.

## Steps to Reproduce

1. Sign in; add any product to `/cart` (qty 1).
2. In the line quantity input, type a decimal (`1.5`) or negative value and commit (blur/Enter).
3. Observe the network call, the toast, and the field value.

## Expected vs Actual

- **Expected:** invalid qty is caught **client-side** with an inline message; the field reverts to the last valid integer; no server round-trip / generic error toast.
- **Actual:** the value is sent; the server rejects it; a **generic** "something went wrong" toast appears; the field keeps the invalid `1.5`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | no inline validation on decimal/negative/non-integer; generic toast; field retains invalid value |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | PASS (correctly rejects) | `changeCartItemQuantity` rejects the invalid qty; **App Insights: no 5xx** in the run window — server validation is working |
| 4. Platform REST | N/A | — |

**Owning layer:** Layer 1 — vc-frontend. The quantity stepper lacks the min/integer/negative client guard that the max/pack-size paths have.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Component / module:** cart line-item quantity stepper / `useCart` change-quantity handler
- **RCA anchor:** the cart qty input change handler (search vc-frontend for the line-item quantity stepper + `changeItemQuantity`); add a min/integer guard + revert-to-valid mirroring the max-stock path
- **Routing confidence:** HIGH

## References
- REG-2026-06-11-1423 suite 028 CART-036 (now CART-036/CART-066) — evidence `screenshots/cart-036-invalid-input.png`
- The generic toast here is the same non-actionable "something went wrong" pattern seen in over-stock/EUR summary states — track whether a shared client error-handler change addresses both.

---

## Re-verification 2026-08-26 — STILL REPRODUCES (source axis), and the RCA anchor is now exact

The draft's anchor said "search vc-frontend for the line-item quantity stepper". It is pinned now, and the gap is **deliberate**, not missing:

**1. The cart explicitly opts out of validation.** `client-app/shared/cart/components/cart-line-items.vue@dev` passes `disable-validation` to the quantity control:
```
<QuantityControl
  :mode="$cfg.product_quantity_control"
  :min-quantity="item.minQuantity"  :max-quantity="item.maxQuantity"  :pack-size="item.packSize"
  hide-button  :model-value="item.quantity"  :name="item.id"
  disable-validation
  @update:model-value="$emit('change:itemQuantity', { itemId: item.id, quantity: $event })"
/>
```
The min/max/pack-size props are supplied but validation is switched off, so the typed value is emitted straight up.

**2. The stepper only normalizes *empty* and *zero*, never a decimal or a negative.** `client-app/ui-kit/components/organisms/quantity-stepper/vc-quantity-stepper.vue@dev`:
```js
function normalize() {
  if (model.value === undefined && lastNonEmptyValue.value !== undefined) { update(lastNonEmptyValue.value); }
  if (model.value === 0 && vcInputRef.value?.inputElement) { vcInputRef.value.inputElement.value = "0"; }
}
```
`min` / `step` / `max` are consulted only by `checkIfOperationIsAllowed` / `calculateStepper`, i.e. **only on the +/− buttons**. The typed-input path bypasses them entirely — which is exactly why the field keeps `1.5`: nothing ever writes a valid value back over it.

**3. Nothing guards it downstream either.** `useCart.ts@dev` `changeItemQuantityBatched(lineItemId, quantity)` forwards the raw number to the mutation and only `Logger.error`s the rejection — the generic toast.

This also explains the contrast the draft noted: max-stock and pack-size produce clean inline messages because those arrive as **server** `validationErrors` rendered per line, whereas a decimal/negative is a hard mutation rejection with no `validationErrors` payload to render.

**Verdict: still open, Medium.** No tracker item found. Anchor for the fix: remove `disable-validation` in `cart-line-items.vue`, or extend `normalize()` to clamp to `min`/integer/`step` on blur.
