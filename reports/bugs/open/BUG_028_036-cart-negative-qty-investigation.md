# Investigation — Cart Negative Quantity (BUG_028_036)

Companion to [BUG_028_036-cart-negative-qty.md](BUG_028_036-cart-negative-qty.md). Holds full layer-by-layer analysis, admin-SPA blast radius, raw API/JSON evidence, and the 13-item defense-in-depth fix list — extracted from the bug body to comply with the 150-line cap in `.claude/rules/reports.md`.

## End-to-End Impact Proof — `GetFullOrder` (storefront xAPI)

```json
{
  "number": "CO260422-00001",
  "status": "New",
  "total": { "formattedAmount": "$2,994.00" },
  "items": [
    {
      "name": "COTE SOLEIL Merlot 0.75L: Elegance in Every Sip",
      "sku": "418132",
      "quantity": -1,
      "extendedPrice": { "formattedAmount": "$2,345.00", "amount": 2345 }
    },
    { "name": "SHOT", "sku": "8010073", "quantity": 1, "extendedPrice": { "amount": 0 } }
  ]
}
```

Storefront list view shows $2,994.00 / New. Storefront detail view (`/account/orders/bc323bd9-…`) shows qty=-1, line total $2,345, "PAY NOW" prominent. Money math is asymmetric — `extendedPrice = |quantity| * placedPrice` (sign dropped on money) while raw `quantity` retains sign.

## Storefront Input-Level Analysis

| Attribute | Value | Notes |
|---|---|---|
| `<input>` `type` | `number` | HTML5 spec allows UA to display invalid text |
| `min` | `"1"` | `validity.rangeUnderflow=true` for `-1`, `validationMessage` non-empty |
| `max` | `"3969"` (stock) | rangeOverflow >3969 |
| `step` | `""` | default = 1 |
| `pattern` | `""` | not set |
| `role` | `"spinbutton"` | `aria-valuemin=1 aria-valuemax=3969 aria-valuenow=-1` |
| Component | `<QuantityControl disable-validation>` | confirmed in `cart-line-items.vue` |

### Keystroke behavior (real user)

- Empty input + press `-` then `1` → Edge strips `-`; `.value = "1"`.
- Existing digits + press `-` anywhere → `-` stripped, digits concatenate (`"4"` + type `-1` → `"41"`).
- **Pure keystroke users cannot produce `-1` in Edge / Chromium.**

### Bypass paths that DO produce `-1` in production

- Playwright `.fill('-1')` — dispatches `input` after setting `.value` directly; equivalent to paste / programmatic JS.
- Browser paste from clipboard — Firefox / Safari especially; on Chromium-based, depends on context.
- DevTools console `el.value='-1'; el.dispatchEvent(new Event('input'))`.
- Assistive tech (JAWS/NVDA spinbutton controls), custom extensions, automation.

## Root Cause — Layer-by-Layer

### Layer 1 — Storefront frontend ignores native HTML5 validity

- `client-app/shared/cart/components/cart-line-items.vue` — `<QuantityControl disable-validation>` on the line.
- `client-app/ui-kit/components/organisms/add-to-cart/vc-add-to-cart.vue` — `handleChange` emits without checking `isValid`.
- `validateFields()` not called; `input.validity.valid === false` ignored; `emit("update:modelValue", newQuantity)` fires regardless.

### Layer 2 — xAPI `ChangeFullCartItemsQuantity` accepts any integer

Network trace: request body `{"cartItems":[{"lineItemId":"...","quantity":-1}]}` → HTTP 200, no GraphQL `errors[]`. The mutation's input type `InputChangeCartItemsQuantityType` does not enforce `quantity >= 1`. Backend: `vc-module-xapi-cart` (or equivalent xAPI module).

### Layer 3 — `createOrderFromCart` does not validate line quantities

Cart→order transition accepts and persists negative qty on CustomerOrder. The Place-Order gate only checks shipping/payment/address presence — it does NOT inspect line-item quantities. Platform: `CustomerOrderBuilder` / `CartConverter` in `vc-module-orders`.

### Layer 4 — Admin SPA inline qty input accepts any integer

DOM of admin line-item qty input (from `Carlos Rodriguez's order line items` sub-blade):

```html
<input smart-float="" num-type="integer" required="" ng-model="data.quantity"
       ng-model-options="{ updateOn: 'blur' }" ng-change="blade.recalculateFn()"
       id="quantity0" class="ng-pristine ng-untouched ng-valid ng-not-empty ng-valid-required" />
```

| Attribute | Value | Meaning |
|---|---|---|
| `type` | `text` (default) | **Worse than storefront** — not `type=number`, no `min` |
| `min` / `max` / `step` / `pattern` | null | Zero HTML5 constraints |
| `num-type` | `"integer"` | Restricts to integers, NOT non-negative |
| `smart-float` | — | VC Angular directive — does not reject negatives |
| Angular state | `ng-valid`, `validity.valid === true`, `validationMessage === ""` | Browser + Angular both consider `-1` valid |
| `ng-change` | `blade.recalculateFn()` | Recomputes totals on blur; no validation guard |
| `aria-valuemin` / `aria-valuemax` | null | Less constrained than storefront (which had aria-valuemin=1) |

An admin opening the bad order can type `-5`, `-999`, or `0`; on blur, `recalculateFn()` fires, Save button enables. No clamp, no error state, no disabled-save guard. The remediation path is itself unsafe.

## Admin SPA — How the bad order surfaces

| Surface | Admin sees | Anomaly flag? |
|---|---|---|
| Dashboard home | Pre-existing $1.08T revenue corruption (unrelated, but proves no sanity ceiling) | None |
| Orders grid | CO260422-00001 row: Carlos Rodriguez / B2B-store / **$2,994.00** / USD / Status=New | None — grid has no qty column, `-1` invisible |
| Order detail blade | Subtotal $3,456 / Shipping $150 / Tax $499 / Discount −$1,111 / **Total $2,994** | None — no warning banner |
| Line-items sub-blade | Qty cell renders **`-1`** in editable inline textbox; Status `In Progress` | None — inline textbox, no validation, no tooltip |
| Workflow diagram | CO #CO260422-00001 (New) → PaymentIn #PI260422-00001 (New, $2,994) → Shipment #SH260422-00001 (New, $150) | None — payment + shipment already generated |
| Search indexation | Indexed Apr 22 2026 07:54 | — |

**Admin does NOT sanitize qty.** The negative value is rendered literally everywhere it appears.

## Admin Toolbar Actions — all enabled on the bad order

DOM `disabled` / `aria-disabled` inspection across 3 open blades — **no toolbar button is disabled**:

**Order blade:** `New document`, `Save`, `Reset`, `Delete`, `Cancel document`, `Get invoice PDF`, `Create return`.
**PaymentIn blade (status=New, $2,994 USD):** `New document`, `Reset`, `Delete`, `Cancel document`, **`Capture payment`**, **`Refund payment`**.
**Shipment blade (status=New, $150, fulfillment center unset):** `New document`, `Reset`, `Delete`, `Cancel document`, `Create return`; status dropdown allows freely transitioning New → Picking → Sent → Delivered.

**Implication:** an admin with ordinary Orders permissions can click `Capture payment` right now and attempt to bill the customer $2,994 for an order whose only charged line has qty=-1. A warehouse clerk can flip Shipment status to `Sent` without ever seeing the negative qty (qty is in a different sub-blade). No admin-side circuit breaker.

## Raw Platform REST — `/api/order/customerOrders/{id}`

Full JSON: `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-admin-06-rest-api-raw.json`. Key fields:

```json
{
  "orderNumber": "CO260422-00001", "orderStatus": "New",
  "isApproved": false, "isCancelled": false,
  "subTotal": 3456, "total": 2994,
  "items": [
    {
      "sku": "418132", "name": "COTE SOLEIL Merlot 0.75L: …",
      "quantity": -1,                 //  RAW NEGATIVE
      "price": 3456, "placedPrice": 2345,
      "extendedPrice": 2345,          //  |qty| * placedPrice — sign dropped
      "discountAmount": 1111, "taxTotal": 469,
      "reserveQuantity": 0,           //  nothing reserved from inventory
      "fulfillmentLocationCode": null,
      "status": "In Progress"
    },
    { "sku": "8010073", "name": "SHOT", "quantity": 1, "isGift": true, "price": 0 }
  ],
  "inPayments": [{ "sum": 2994, "paymentStatus": "New" }],
  "shipments": [{
     "status": "New", "fulfillmentCenterId": null,
     "totalWithTax": 180, "items": []       //  SHIPMENT HAS ZERO LINE ITEMS
  }]
}
```

**New facts not in storefront-only evidence:**

1. **`reserveQuantity: 0`** — inventory never decremented (platform refused to reserve -1, silently).
2. **`shipments[0].items: []`** — auto-generated shipment is empty (could not pick negative qty); yet $180 shipment record exists. A Sent action would ship cost-zero with empty box.
3. **`extendedPrice = |qty| * placedPrice`** — code uses `abs(qty)` for money but does not reject the order. **Asymmetric handling.**
4. **`fulfillmentLocationCode/CenterId: null`** — un-fulfillable state on top of negative qty.
5. **Promotion engine** treated qty=-1 as qualifying for "buy X → free SHOT" promo; `$1,111` discount + free gift attached.

## Pre-existing Dashboard Corruption (related, separate root cause)

Home dashboard reports Revenue = **`$1,080,009,436,748.15 USD`** (1 trillion+), concentrated in 2025 Q3 `$1,080,002,537,796.84`. Revenue-per-customer `$2,769,254,966.02`, AOV `$289,625,107.26`. Different defect — but proves admin revenue aggregation has no sanity ceiling and would not flag another order like CO260422-00001 on its own. Track as separate investigation.

Evidence: `invest-BUG_028_036-admin-00-dashboard-revenue-corrupted.png`.

## Scope — Confirmed / Adjacent / Untested

**Confirmed affected:**
- Cart page line-item spinbutton
- Cart → order transition
- `GetFullOrder` xAPI response
- Storefront order detail page
- Admin SPA order line-item qty input

**Adjacent (from attempt #1):**
- Decimal `1.5` — UI accepts; xAPI 400, UI does not revert.
- `0` — silently removes item.
- Over-max `999` (vs max=129) — accepted, persists.
- Below-min `5` (vs min=9) — accepted, persists.

**Untested but likely affected:**
- PDP qty stepper
- Bulk order page stepper
- Lists → add-to-cart flow
- Variant product cart lines

**Browser-protected:**
- Non-numeric strings (`abc`) — blocked by `type=number`.
- Pure-keystroke `-` — stripped by Edge.

## Defense-in-Depth Fix List (13 items)

### Storefront (Layer 1)

1. `vc-add-to-cart.vue` `handleChange` — call `validateFields()` and check `isValid.value` BEFORE emitting `update:modelValue`. Revert + inline error if invalid.
2. `cart-line-items.vue` — remove `disable-validation` on `<QuantityControl>`, or apply only after client-side sanitization.
3. `QuantityControl` — clamp on blur: `Math.max(min, Math.min(max, Math.floor(Number(v) || min)))`; reject non-integers.
4. Place-Order gate — verify every line `quantity >= product.minQuantity && quantity <= product.availableQuantity && Number.isInteger(quantity)`. Disable button + inline error otherwise.

### xAPI (Layer 2)

5. `ChangeFullCartItemsQuantity` resolver — validate `quantity >= 1` AND `>= product.minQuantity` AND `<= product.maxQuantity` (or `availableQuantity`). Return typed GraphQL error `errorCode: "QUANTITY_OUT_OF_RANGE"`.
6. `createOrderFromCart` resolver — refuse order creation if any line fails validators. Return `errorCode: "INVALID_LINE_ITEM_QUANTITY"`.

### Platform (Layer 3)

7. `CustomerOrderBuilder` — reject persistence if any `items[].quantity < 1` OR `quantity != Math.floor(quantity)`. Log + alert; never silently accept.
8. Database constraint: `CHECK (Quantity >= 1 AND Quantity = FLOOR(Quantity))` on `OrderLineItems` and `CartLineItems`.

### Admin SPA (Layer 4)

9. Line-item qty input — add `ng-min="1"`, `ng-pattern="^[1-9]\d*$"`, or extend `smartFloat` directive to reject sign. Gate Save button on aggregate line-items validity.
10. Order detail blade — prominent warning banner when any `item.quantity < 1` or non-integer. Gate Capture/Refund/Save until acknowledged or fixed.
11. Orders grid — surface data-integrity warning icon in Total or Status column when any line qty < 1. Allow filter `has negative qty`.
12. Dashboard revenue aggregation — sanity-check filter that excludes (and reports) orders with negative-qty lines.

### Data Remediation

13. Audit: `SELECT * FROM OrderLineItems WHERE Quantity < 1` — flag and reverse in coordination with Operations + Accounting.

## Severity Confirmation

**P0 stands — strongly reconfirmed.**

- If only storefront broken but admin blocked: P1/P2.
- If admin passively displayed but blocked actions: P0 (data integrity, no fulfillment risk).
- **Actual: admin passively displays AND all destructive actions enabled AND admin edit accepts further negatives → P0 critical-hotfix.**

Recommended escalation: JIRA label `critical-hotfix`; notify Operations (CO260422-00001 manual containment); notify Accounting/BI (dashboard corruption — separate). Do not ship to production until at least Layers 2 + 3 reject negative quantity; Layers 1 + 4 within same hotfix sprint.

## Cleanup Path for CO260422-00001

Admin has three destructive options, all currently enabled. Use the SAFEST:

- **Safest: `Cancel document`** on order blade — marks order Cancelled, stops downstream payment/shipment, preserves audit trail. **Use this.**
- `Delete` on order blade — hard-delete, loses audit trail. Do not use until bug filed with direct link to this investigation.
- **Do NOT:** `Capture payment` (real gateway charge), `Refund payment` (reverses never-captured payment), `Create return` (return for never-shipped order).

## Affected Versions

Storefront 2.47.0-pr-2225-130f reproducible; attempt #1 confirmed on 2.45.0-pr-2226-1bdb. **Not new — long-standing pre-existing defect.**
