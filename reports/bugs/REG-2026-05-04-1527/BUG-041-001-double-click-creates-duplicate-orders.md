# BUG-041-001 — Double-click on Place Order creates DUPLICATE orders (CyberSource)

**Severity:** P0 / Critical
**Suite:** 041 — Payment Cross-Cutting
**Test Case:** PAY-EDGE-001 — Double-Click Place Order Prevention
**Business Rule violated:** BL-CHK-003 (double-submit prevention), BL-PAY-005 (idempotency)
**Edge case ref:** ECL-1.2 (Race conditions / double-submit)
**Run:** REG-2026-05-04-1527
**Environment:** https://vcst-qa-storefront.govirto.com
**Browser:** Chrome via playwright-chrome

## Summary
Rapidly double-clicking the "Place Order" button on /cart with a valid CyberSource card creates **two identical orders** ($319.19 each). The button visually receives the `disabled` attribute after the first click, but Vue's reactivity-based disable is not fast enough to block a synchronous second click that fires within the same JS task.

## Steps to Reproduce
1. Sign in as a registered user.
2. Add 2 items to cart (total ~$319.19).
3. Switch payment method to "Bank card (CyberSource)".
4. Fill the CyberSource Microform form completely:
   - Card: `4622943127013705`
   - Cardholder: `John Smith`
   - Expiry: `09/2029`
   - CVV: `838`
5. Programmatically dispatch two `click()` calls on the Place Order button within the same synchronous tick (or rapidly double-click via mouse).
6. Wait 10 seconds for processing.
7. Navigate to `/account/orders`.

## Expected
- Only ONE `createOrderFromCart` GraphQL mutation issued.
- Place Order disabled after first click — second click is no-op.
- Exactly ONE new order in `/account/orders`.
(BL-CHK-003 / BL-PAY-005)

## Actual
- TWO new orders created with identical contents and totals:
  - `CO260504-00029` — Payment Invoice `PI260504-00031` — `$319.19` — Payment required
  - `CO260504-00030` — Payment Invoice `PI260504-00032` — `$319.19` — Payment required
- Both orders dated 5/4/2026, sequential payment IDs (no merging or de-duplication on backend).
- MutationObserver evidence shows the `disabled` attribute IS applied to the button after the first click — but BOTH `click()` invocations happened in the same JS tick (≈3.4 ms apart), and Vue's reactive update was applied AFTER the second handler ran. Result: two `createOrderFromCart` mutations issued in parallel.

## Evidence
- `reports/regression/REG-2026-05-04-1527/041-evidence/PAY-EDGE-001-FAIL-duplicate-orders.png` — Order list showing CO260504-00029 and CO260504-00030 both at $319.19.
- `reports/regression/REG-2026-05-04-1527/041-evidence/PAY-EDGE-001-order-completed.png` — Post-place-order viewport.
- MutationObserver log captured before the 10s wait:
  ```json
  [
    { "ts": 199022.10, "attr": "disabled", "value": "", "disabled": true },
    { "ts": 199022.10, "attr": "class", "value": "vc-button ... vc-button--disabled ...", "disabled": true }
  ]
  ```
  Both clicks happened at t=199018 (3.4 ms before the disabled mutation). Vue applied the disable AFTER both handlers had already invoked the place-order action.

## Root Cause Hypothesis
Storefront uses reactive `disabled` binding only — there is no synchronous in-handler guard (e.g., a flag set immediately at the top of the click handler before any await). Two clicks in the same JS tick both pass the (still-false) flag check.

## Recommended Fix
Inside the Place Order click handler, immediately set a guard flag (or `await` lock) at the very first line, before any async work — and check the flag at the top so the second click bails out:
```ts
let isPlacingOrder = false;
async function placeOrder() {
  if (isPlacingOrder) return;
  isPlacingOrder = true;
  try { /* mutation */ } finally { isPlacingOrder = false; }
}
```
The `disabled` binding alone is insufficient because Vue updates DOM in the next microtask.

## Cleanup Required
Cancel BOTH duplicate orders via admin:
- CO260504-00029
- CO260504-00030

Status `Payment required` — they have not been authorized at the gateway, but they exist as records in the order management module.

## Confirmed
**confirmed: false** — preliminary; needs qa-testing-expert investigation to rule out test environment quirk and verify reproduction across a clean session.

## Related
- BL-CHK-003 (Double-submit prevention)
- BL-PAY-005 (Order idempotency: one order per click)
- ECL-1.2 (Race conditions)
- PAY-DECLINE-004 (related: tests double-click guard after a decline)
