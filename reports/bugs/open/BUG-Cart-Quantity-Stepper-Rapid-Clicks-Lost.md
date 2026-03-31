# BUG: [Cart/PDP] Rapid quantity stepper clicks lose increments

**Severity:** High
**Priority:** P1
**Type:** Bug
**Status:** Reproduced
**Environment:** QA Storefront - https://vcst-qa-storefront.govirto.com
**Browser:** Chrome (Playwright MCP), Edge (Playwright MCP) — reproduced on both
**Store Version:** 2.45.0-pr-2226-1bdb-1bdb15cb
**Date:** 2026-03-31
**Tested By:** qa-testing-expert, qa-frontend-expert

---

## Summary

Clicking the quantity stepper +/- buttons in rapid succession (< 50ms between clicks) causes increments to be lost. For example, clicking + five times results in a quantity of 1-2 instead of 5. The root cause is Vue's reactivity batching: synchronous clicks are coalesced into a single microtask flush, and the debounced server mutation handler fires only once with the coalesced value.

---

## Steps to Reproduce

### On PDP (per-variation stepper)
1. Navigate to a product with variations (e.g., Base product EN at `/products-with-options/configurable-caps-shirts/111111`)
2. Find a variation with qty=0
3. Click the + button 5 times as fast as possible (< 10ms between clicks)
4. Wait 3 seconds for debounce to settle

**Expected:** Quantity = 5
**Actual:** Quantity = 1 (or 2). Only 1 GraphQL mutation sent with `quantity: 1` (or `quantity: 2`).

### On Cart page (cart stepper)
1. Add a product to cart with qty=1
2. Navigate to `/cart`
3. Click the + button 5 times rapidly
4. Wait 3 seconds

**Expected:** Quantity = 6
**Actual:** Quantity = 2-3. Lost 3-4 increments.

### Workaround (confirms root cause)
1. Click + button 5 times with 50ms delay between each click
2. **Result:** Quantity correctly reaches 5. All increments batched into a single mutation with correct final value.

---

## Debounce Behavior Analysis

| Click Spacing | Clicks | Expected Qty | Actual Qty | Mutations Sent | Result |
|--------------|--------|-------------|-----------|----------------|--------|
| 0ms (sync) | 5 | 5 | 1 | 1 (qty=1) | **FAIL** |
| 50ms | 5 | 5 | 5 | 1 (qty=5) | PASS |
| 200ms | 3 | 3 | 3 | 1 (qty=3) | PASS |
| 2000ms | 3 | 3 | 3 | 3 (individual) | PASS |

---

## Root Cause (Source Code Analysis)

### Component chain

1. **`vc-quantity-stepper.vue`** — +/- buttons call `handleIncrement()` which synchronously updates `model.value` via `defineModel()`
2. **`quantity-control.vue`** — `watch(stepperQuantity, ...)` fires on model change and calls debounced `handleStepperChange()`
3. **`handleStepperChange`** is debounced with `timeout.value` (300ms from `add-to-cart.vue` or 0ms default)

### The problem

When 5 clicks arrive synchronously (same event loop frame):
1. Each `handleIncrement()` call updates `model.value`: 0→1→2→3→4→5
2. BUT Vue's reactivity system batches watcher callbacks — the `watch(stepperQuantity)` watcher fires **once** after all synchronous updates
3. The debounced `handleStepperChange()` is called once
4. Meanwhile, `watch(value)` at line 204 of `quantity-control.vue` may reset `stepperQuantity` back to the server-confirmed value before all increments are processed

With 50ms+ spacing, each click triggers the watcher in a separate microtask, and the debounce correctly accumulates the clicks into a single server mutation with the final value.

### Key files

| File | Role |
|------|------|
| `client-app/ui-kit/components/organisms/quantity-stepper/vc-quantity-stepper.vue` | +/- buttons, synchronous `model` update |
| `client-app/shared/common/components/quantity-control.vue` | Watcher on `stepperQuantity`, debounced `handleStepperChange()` |
| `client-app/shared/cart/constants/index.ts` | `DEFAULT_DEBOUNCE_IN_MS = 300` |

---

## Impact

- **Medium for real users:** Most human clicks are spaced 50ms+ apart, so the bug affects edge cases
- **Higher for accessibility:** Assistive technologies, switch access devices, or keyboard repeat may fire rapid events
- **UX frustration:** Users clicking quickly see the counter jump back, creating confusion

---

## Suggested Fix

The +/- buttons should maintain an **optimistic local counter** that accumulates all clicks and is not reset by the server-confirmed value watcher while a mutation is in-flight:

1. In `quantity-control.vue`: guard `watch(value)` (line 204) to not overwrite `stepperQuantity` while a mutation is pending
2. Alternative: queue increment/decrement deltas rather than relying on Vue's reactive value at debounce-fire time
3. Alternative: use `nextTick()` between click handler and state read to ensure each click gets its own microtask

---

## Evidence

| File | Description |
|------|-------------|
| `tests/Sprint-current/VCST-3902/bug2-bug3-investigation.md` | Full investigation with network logs |
| `tests/Sprint-current/VCST-3902/exploratory-session.md` | Exploratory session with timing analysis |

---

## Scope

- **Pre-existing bug** — NOT introduced by PR #2226
- **Affects:** All products with quantity steppers (PDP variations, cart line items)
- **Components:** `vc-quantity-stepper.vue`, `quantity-control.vue`
