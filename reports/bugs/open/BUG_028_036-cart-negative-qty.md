# BUG: [Cart / Checkout / Orders] Negative cart quantity accepted by UI AND server — order placed with qty = −1

**Severity:** Critical · **Priority:** P0 · **Status:** Reproduced
**Env:** vcst-qa storefront 2.47.0-pr-2225 / Platform 3.1022.0 · Edge (playwright-edge) · 2026-04-22 · qa-frontend-expert
**BL Violation:** BL-CART-001 (min qty=1), BL-ORD-001 (order integrity), BL-CHK-001 (checkout validation gate)
**User:** `test-carlos.rodriguez-20260310@test-agent.com` (B2B Org Admin, BuildRight org)
**Related:** Supersedes `BUG-Cart-Quantity-Input-Accepts-Invalid-Values.md` (March 2026 attempt #1) — same defect, broader proven scope.

## Summary

Cart line-item quantity `-1` is accepted by the storefront UI, by the `ChangeFullCartItemsQuantity` xAPI mutation (HTTP 200), persists across refresh, and **a complete order can be placed with a negative-quantity line**. The CustomerOrder persists `quantity: -1` and the order appears in admin/storefront order management as a valid $2,994 order with status "New" and an active "Pay Now" button. Validation gap is **4 layers deep** (storefront UI, xAPI, order builder, Admin SPA edit) — see investigation file for full layer analysis.

## Reproduction Steps

**Preconditions:** logged in as Carlos Rodriguez (B2B org admin), cart has a line item with `min=1, max=N`, B2B-store / USD, shipping + billing addresses set, delivery + payment methods selectable.

1. Navigate to `/cart`.
2. In the qty `<input type="number" min="1" max="3969">`, paste `-1` (or Playwright `fill('-1')` — bypasses keystroke-strip of `-`).
3. Press Tab.
   - `input.validity.valid === false` (rangeUnderflow), `validationMessage` non-empty.
   - GQL `ChangeFullCartItemsQuantity` sent with `quantity: -1` → **HTTP 200**.
   - Cart badge shows **−1**; "Something went wrong" banner appears in Order Summary.
4. Refresh `/cart` → server returns qty=−1; badge shows −1. **Persisted server-side.**
5. Select delivery "Fixed Rate (Ground)" + payment "Manual" → banner clears, **Place Order button enables**.
6. Click **Place Order** → `/checkout/completed`: "Order CO260422-00001 has been successfully submitted."
7. Open `/account/orders/<id>` → qty cell displays **−1**, line total $2,345.00, order total $2,994, "PAY NOW" button active.
8. Direct GQL `GetFullOrder(id)` → `items[0].quantity: -1`.

## Expected vs Actual

| Stage | Expected | Actual |
|---|---|---|
| Storefront input | Reject `-1` (input.validity.valid=false) | UI accepts, emits update |
| xAPI mutation | GQL error / reject | HTTP 200, persists |
| Place Order gate | Block when any line qty < 1 | Button enabled, order created |
| Admin SPA | Show data-integrity warning | Order displayed as normal $2,994 New order, no flag |

## Real-User Threat Model

Pure keystrokes can't produce `-1` (Edge strips `-`). Production paths that DO produce it: **paste from clipboard, DevTools console, screen-reader spinbutton-set, browser extensions, automation tooling.** Cart is revenue-critical — must defend against all input vectors, not just keystroke.

## Business Impact

Order `CO260422-00001` exists in the system with `quantity: -1` and `extendedPrice: 2345` (sign dropped — code is aware enough to absolutize money but not aware enough to reject). Downstream:

- **Fulfillment** receives qty=-1 → parsing failures, reverse-allocations ("pay me to ship you back 1 bottle").
- **Inventory** may increment by 1 on shipment (interpreted as a return).
- **Accounting / tax** — positive total with negative-qty line breaks reconciliation.
- **GA4 / analytics** — nonsensical basket composition.
- **Audit trail** — "valid" order no legitimate customer could have created.

## Root Cause — 4-Layer Failure (summary)

1. **Storefront UI:** `cart-line-items.vue` uses `<QuantityControl disable-validation>`; `handleChange` emits without `isValid` check.
2. **xAPI:** `ChangeFullCartItemsQuantity` input type does not enforce `quantity >= 1`.
3. **Order builder:** `createOrderFromCart` / `CustomerOrderBuilder` accepts and persists negative qty; Place Order gate only checks shipping/payment presence.
4. **Admin SPA:** order line-item qty input is `<input type=text smart-float num-type=integer>` — no `min`, no clamp; admin can edit to additional negative values and Save.

Toolbar actions on the bad order — **all enabled**: Capture payment, Refund payment, Set shipment status → Sent. **No admin circuit breaker.**

See [BUG_028_036-cart-negative-qty-investigation.md](BUG_028_036-cart-negative-qty-investigation.md) for: per-layer file references, full DOM/Angular attribute dump, raw `/api/order/customerOrders/{id}` JSON, admin SPA blast-radius enumeration, defense-in-depth fix list (13 items across 4 layers + data remediation), promotion-engine interaction, dashboard revenue corruption (separate but related), JIRA recommendation, cleanup path.

## Evidence

| File | Description |
|---|---|
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-01-negative-qty-filled.png` | Cart with qty=-1, badge=-1, banner |
| `…invest-BUG_028_036-03-place-order-enabled-with-neg-qty.png` | Place Order enabled with qty=-1 |
| `…invest-BUG_028_036-04-order-completed-with-neg-qty.png` | Confirmation page CO260422-00001 |
| `…invest-BUG_028_036-05-order-detail-neg-qty-order.png` | Storefront order detail, qty=-1, PAY NOW active |
| `…invest-BUG_028_036-admin-03-line-items-neg-qty-inline.png` | Admin line-items sub-blade shows qty=-1 in editable input |
| `…invest-BUG_028_036-admin-06-rest-api-raw.json` | Platform REST raw JSON proving `quantity: -1`, `reserveQuantity: 0`, empty shipment items |

## Cleanup

Existing bad order CO260422-00001 left in place as evidence. Recommended dispose path: **`Cancel document`** on order blade (preserves audit trail). Do NOT `Capture payment` / `Refund payment` / `Create return`.

## Recommended JIRA

`[Cart/Orders] Negative line-item quantity accepted by xAPI and persisted on CustomerOrder — qty=-1 orders can be placed`
Labels: `Severity:Critical`, `Priority:P0`, `Area:Cart`, `Area:Checkout`, `Area:Orders`, `Area:xAPI`, `Revenue-Risk`, `Data-Integrity`, `critical-hotfix`
