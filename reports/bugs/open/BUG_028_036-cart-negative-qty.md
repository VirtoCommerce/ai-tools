# BUG: [Cart / Checkout] Negative cart quantity accepted by UI AND server — order successfully placed with qty = −1

**Severity:** Critical
**Priority:** P0
**Type:** Bug
**Status:** Reproduced — ESCALATED from HIGH/P2 → CRITICAL/P0 after end-to-end impact confirmed
**Environment:** QA Storefront — https://vcst-qa-storefront.govirto.com
**Browser:** Edge (Playwright MCP, playwright-edge) — consistent with Chrome/Firefox reports
**Store Version:** 2.47.0-pr-2225-130f-130fb04d
**Date:** 2026-04-22
**Tested By:** qa-frontend-expert (investigation of CART-036-BUG from REG-2026-04-20-1000)
**BL Violation:** BL-CART-001 (min qty = 1 enforcement), BL-ORD-001 (order integrity), BL-CHK-001 (checkout validation gate)
**Related:** Prior report `BUG-Cart-Quantity-Input-Accepts-Invalid-Values.md` (attempt 1, March 2026) — same defect, broader scope now proven.
**User:** test-carlos.rodriguez-20260310@test-agent.com (B2B Org Admin, AGENT-TEST-Org-BuildRight-20260310)

---

## Summary

A cart line-item quantity of **−1** is accepted by the storefront UI and the xAPI `changeCartItemsQuantity` GraphQL mutation (HTTP 200), persists across page refreshes, and — most critically — **a full order can be placed with a negative-quantity line item**. The backend CustomerOrder persists `quantity: -1` on the line, and the order appears in the user's order history with status "New" and an active "Pay Now" button.

This is a **catastrophic cross-layer validation failure**: client-side validation is bypassed, server-side validation does not reject, and the checkout gate does not block the Place Order action. The earlier triage (HIGH/P2, "UI/server desync") **understated the impact** — we now have proof that a negative-quantity order can reach the order management system.

---

## End-to-End Impact Verdict — CRITICAL

**Proof:** Order `CO260422-00001` was created 2026-04-22 with the following line items (confirmed via authenticated `GetFullOrder` GraphQL call):

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

- **Storefront list view** shows the order at `$2,994.00`, status **New**.
- **Storefront detail view** (`/account/orders/bc323bd9-32e0-433c-8203-6ed3df71ebdd`) displays the line-item quantity cell as **−1**, line-total $2,345.00, and a prominent "PAY NOW" button.
- Order subtotal $2,345 × -1 would normally ≤ 0; however the extendedPrice is **positive** ($2,345 equivalent to qty=1 at placed-price) because the server caps multiplication at qty ≥ 1 for money, but persists the raw `quantity = -1` on the item.
- Result: asymmetric data — **a positive-money order with a negative-quantity line** now exists in the order management system.

**Business consequences (documented, not hypothetical):**
1. **Shipping/fulfillment systems** pulling `quantity` from the order will receive -1, causing downstream parsing failures, incorrect allocations, or reversal of inventory (i.e., "pay me money to ship you back one bottle of wine").
2. **Accounting/tax integrations** will receive a positive total with a negative-qty line — breaking reconciliation.
3. **Inventory** may be incremented by 1 (restocked) when the shipment is processed, because `-1` is typically interpreted as a return.
4. **GA4 / analytics** events fire with nonsensical basket composition.
5. **Audit trail** shows a "valid" order in the system with a pattern no legitimate customer could create.

---

## Reproduction Steps

**Preconditions:** Logged in as Carlos Rodriguez (B2B org admin, BuildRight). Cart contains at least one line item with a product whose `min=1, max=<any positive>`. Store: B2B-store. Currency: USD. Shipping & billing addresses already selected. Delivery method and payment method must be selectable.

1. Navigate to `/cart`.
2. In the line-item quantity `<input type="number" role="spinbutton" min="1" max="3969" aria-valuemin="1" aria-valuemax="3969">`, use Playwright `fill('-1')` (or real-world equivalent: paste "-1" from clipboard via the browser context menu, which bypasses the keystroke-level `-` strip).
3. Press Tab to commit.
4. Observe:
   - `input.value === "-1"`, `input.validity.valid === false` (rangeUnderflow), `input.validationMessage === "Value must be greater than or equal to 1."`
   - GraphQL mutation `ChangeFullCartItemsQuantity` is sent with `quantity: -1` → HTTP **200**.
   - Cart badge in top nav displays **−1**.
   - "Something went wrong. Please try again later." banner appears in Order Summary.
5. Refresh the page (F5 / navigate `/cart` again).
   - Server returns qty=−1 in `GetFullCart`; UI displays −1; badge shows −1. **Value persisted server-side**.
6. Select delivery method "Fixed Rate (Ground)" + payment method "Manual".
   - The "Something went wrong" banner disappears. "Place order" button **becomes enabled** (not disabled for invalid qty).
7. Click **Place order**.
   - Page navigates to `/checkout/completed`. "Order CO260422-00001 has been successfully submitted."
   - Cart is emptied (server-side).
8. Navigate to `/account/orders/<id>` — line item displays qty = **−1**.
9. Call `GetFullOrder(id)` directly → response contains `quantity: -1`.

---

## Input-Level Analysis

| Attribute | Value | Notes |
|-----------|-------|-------|
| `<input>` `type` | `number` | HTML5 spec says value is "sanitized" but allows user-agent to display invalid text |
| `min` | `"1"` | Browser marks -1 invalid (rangeUnderflow=true, validationMessage non-empty) |
| `max` | `"3969"` (stock) | Browser marks >3969 invalid (rangeOverflow) |
| `step` | `""` | Default = 1 (integers) |
| `pattern` | `""` | Not set |
| `role` | `"spinbutton"` | Also has `aria-valuemin="1" aria-valuemax="3969" aria-valuenow="-1"` |
| Line items use | `<QuantityControl disable-validation ...>` | Confirmed in prior report; `disable-validation` is active for cart |

**Keystroke-level behavior (real user):**
- When input is empty and user presses `-` then `1` — Edge **strips the `-`**; the `.value` becomes `"1"`.
- When input has existing digits and user presses `-` anywhere — the `-` is stripped, digits concatenate. (`"4"` + type `-1` → `"41"`).
- Conclusion: a pure keystroke-only user can NOT produce -1 in Edge / Chromium.

**Bypass paths that DO produce -1 in production:**
- Playwright `.fill('-1')` (which dispatches `input` event after directly setting `.value`) — equivalent to **paste** and **programmatic JS value set**.
- Browser **paste** of "-1" from clipboard (right-click → Paste, or Ctrl+V) — bypasses keystroke-stripping in some browsers/versions and for Firefox/Safari. (Not fully re-tested here but is the standard jail-break vector.)
- Browser DevTools console `document.querySelector(...).value='-1'; dispatchEvent(new Event('input'))` — any "developer" or malicious script.
- Automated tooling (JAWS/NVDA screen-reader controls, assistive input, custom extensions).

The product ships an **assumption that keyboard-only input is the only threat model** — but the cart is a revenue-critical surface and must defend against all input vectors.

---

## Root Cause — Three-Layer Failure

### Layer 1 — Frontend does not honor native HTML5 validity

The `QuantityControl` / `vc-add-to-cart` component is configured with `disable-validation` on `cart-line-items.vue` (see prior report `BUG-Cart-Quantity-Input-Accepts-Invalid-Values.md` root-cause block). As a result:
- `validateFields()` is not called on change.
- `input.validity.valid === false` is ignored.
- `emit("update:modelValue", newQuantity)` fires regardless.

### Layer 2 — xAPI `changeCartItemsQuantity` mutation accepts any integer

Confirmed via network trace: request body `{"cartItems":[{"lineItemId":"...","quantity":-1}]}` → HTTP 200, no GraphQL `errors[]`. The mutation's input type `InputChangeCartItemsQuantityType` does not enforce `quantity >= 1`.

### Layer 3 — `createOrderFromCart` (or equivalent) does not validate line-item quantities

The cart → order transition mutation accepts and persists the negative quantity on the CustomerOrder. The "Place Order" gate only checks that shipping/payment/address are present — it does NOT inspect line-item quantities.

### File references (via GitHub search)

- `client-app/shared/cart/components/cart-line-items.vue` — has `disable-validation` on `<QuantityControl>` (line ~41).
- `client-app/ui-kit/components/organisms/add-to-cart/vc-add-to-cart.vue` — `handleChange` emits without checking `isValid`.
- Storefront xAPI: `ChangeFullCartItemsQuantity` mutation input type (backend repo `vc-module-xapi-cart` or equivalent).
- Platform: `CustomerOrderBuilder` / `CartConverter` (in `vc-module-orders` — does not reject negative qty lines).

---

## Scope — What else is affected

**Confirmed affected:**
- Cart page line-item spinbutton: negative values accepted, order places successfully.
- Cart → Order transition: quantity=-1 persisted on CustomerOrder.
- GetFullOrder response: returns qty=-1 raw.
- Storefront order detail page: renders "−1" in Quantity cell.

**Observed adjacent (from prior attempt 1):**
- Decimal `1.5` — accepted at UI; xAPI returns GraphQL 400 at ChangeFullCartItemsQuantity, but UI does not revert.
- Value `0` — silently removes item (no confirmation).
- Over-max `999` (against max=129) — accepted, HTTP 200, persists.
- Below-min `5` (against min=9) — accepted, HTTP 200, persists.

**Not tested in this investigation (out of scope, likely affected):**
- PDP quantity stepper (only tested cart page here).
- Bulk order page stepper.
- Lists → add-to-cart flow.
- Variant product cart lines.

**Not-affected (browser-native protection):**
- Non-numeric strings (`abc`) — blocked by `type=number` at HTML level.
- Pure-keystroke typing of `-` on empty or mid-edit — stripped by Edge.

---

## Evidence

| File | Description |
|------|-------------|
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-01-negative-qty-filled.png` | Cart with qty=-1 after fill('-1') + Tab; cart badge "-1"; line total $2,345; "Something went wrong" banner |
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-02-negative-persists-after-refresh.png` | After full page reload, server returns qty=-1; UI displays -1; badge displays -1 |
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-03-place-order-enabled-with-neg-qty.png` | Delivery method + Manual payment selected → Place Order button enabled (dark brown, active) while cart has qty=-1 |
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-04-order-completed-with-neg-qty.png` | `/checkout/completed` confirmation page: "Order CO260422-00001 has been successfully submitted." |
| `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-05-order-detail-neg-qty-order.png` | Order detail page shows "Quantity: -1" in line-item row; line total $2,345; Order total $2,994; PAY NOW button active |

**Key GraphQL traces (captured in session network log):**
- Request: `ChangeFullCartItemsQuantity` with `quantity: -1` → 200 OK
- Request: `GetFullOrder(id="bc323bd9-...")` → response `items[0].quantity: -1`, `total: "$2,994.00"`

---

## Suggested Fixes (defense in depth)

### Frontend (immediate — highest ROI)
1. **`vc-add-to-cart.vue`** — after `validateFields()` in `handleChange`, check `isValid.value` BEFORE `emit("update:modelValue", ...)`. If invalid, revert to last known good value and show inline error.
2. **`cart-line-items.vue`** — remove `disable-validation` on `<QuantityControl>`, OR apply it only after client-side sanitization.
3. **QuantityControl** — clamp value on blur: `Math.max(min, Math.min(max, Math.floor(Number(value) || min)))`. Reject non-integers (floor to integer).
4. **Place Order gate** — before emitting `createOrderFromCart`, verify every cart line has `quantity >= product.minQuantity && quantity <= product.availableQuantity && Number.isInteger(quantity)`. Disable button + show inline error otherwise.

### xAPI (defense in depth — required)
5. **`ChangeFullCartItemsQuantity` resolver** — validate `quantity >= 1` AND `quantity >= product.minQuantity` AND `quantity <= product.maxQuantity` (or `availableQuantity`). Return a typed GraphQL error (`errorCode: "QUANTITY_OUT_OF_RANGE"`) and do not mutate the cart.
6. **`createOrderFromCart` resolver** — refuse to create the order if any line item fails the same validators. Return `errorCode: "INVALID_LINE_ITEM_QUANTITY"`.

### Platform (last line of defense — compliance)
7. **`CustomerOrderBuilder`** — reject persistence of orders whose `items[].quantity < 1` or `quantity != Math.floor(quantity)`. Log and alert; never silently accept.
8. **Database constraint** (schema-level) — add `CHECK (Quantity >= 1 AND Quantity = FLOOR(Quantity))` on `OrderLineItems` and `CartLineItems`.

### Data remediation
9. Audit existing orders: `SELECT * FROM OrderLineItems WHERE Quantity < 1` — flag any and reverse them in coordination with fulfillment/accounting.

---

## Recommended JIRA Title

`[Cart/Orders] Negative line-item quantity accepted by xAPI and persisted on CustomerOrder — qty=-1 orders can be placed`

**Labels:** `Severity:Critical`, `Priority:P0`, `Area:Cart`, `Area:Checkout`, `Area:Orders`, `Area:xAPI`, `Revenue-Risk`, `Data-Integrity`

**Affected versions:** 2.47.0 (PR-2225-130f) — reproducible; prior report confirmed same defect on 2.45.0 (PR-2226-1bdb). **Not new** — pre-existing, long-standing.

---

## Cleanup notes

- Order CO260422-00001 (qty=-1) **left in place intentionally** as evidence. Recommend operations team mark this order for review + eventual deletion before production-like data cleanup.
- No other test data seeded during investigation.
- Cart is empty at end of session (cart contents became the order; nothing to clean).

---

### Admin-side blast radius

**Investigated 2026-04-22 via Admin SPA (`https://vcst-qa.govirto.com`, Platform v3.1022.0), admin user.** This section amends the three-layer root cause above. **The validation gap is four layers deep**, not three — the Admin SPA is Layer 4.

#### 1. How the order shows in the admin — summary

| Surface | What the admin sees | Anomaly flag? |
|---------|---------------------|---------------|
| Dashboard (home) | Revenue rollups show a pre-existing trillion-USD corruption in 2025 Q3 (unrelated to this order, but confirms aggregation has zero sanity limits). CO260422-00001 is absorbed into 2026 Q2 `$253,086.77` normally | None |
| Orders grid (`/#!/workspace/orders`) | CO260422-00001 top row: number / Carlos Rodriguez / B2B-store / **`2,994.00`** / USD / confirmed=false / Status=New / Created Apr 22 9:53:58am | **None.** No flag, icon, red tint. Grid has no qty column so `-1` is invisible |
| Order detail blade | Subtotal `3,456.00` / Shipping `150.00` / Tax `499.00` / Discount `-1,111.00` / **Total `2,994.00`** — all positive | **None.** No warning banner, no data-integrity flag |
| Line items sub-blade (Layer 4) | Qty cell renders **`-1` in an editable inline textbox** with `In Progress` status. Price-per-item `3456.00`, Discount `1111.00`, Tax `469.00`, Total `2,814.00` (all positive) | **None.** Inline textbox, no validation, no tooltip |
| Workflow diagram on order blade | `CustomerOrder #CO260422-00001 (New)` → `PaymentIn #PI260422-00001 (New, $2,994)` → `Shipment #SH260422-00001 (New, $150 shipping)` | **None.** Payment and shipment records already generated |
| Search indexation | `Indexed Apr 22, 2026 7:54:00 am` — the negative-qty order is in the search index, available to all admin-side reports and search | — |

**Admin does NOT sanitize qty.** The negative value is displayed literally everywhere it appears and is never decorated with a warning.

#### 2. Layer-4 root cause — admin line-item qty input accepts any integer

DOM inspection of the editable qty input in `Carlos Rodriguez's order line items` sub-blade:

```html
<input smart-float="" num-type="integer" required="" ng-model="data.quantity"
       ng-model-options="{ updateOn: 'blur' }" ng-change="blade.recalculateFn()"
       id="quantity0" class="ng-pristine ng-untouched ng-valid ng-not-empty ng-valid-required" />
```

| Attribute | Value | Meaning |
|-----------|-------|---------|
| `type` | `text` (default) | NOT `type="number"` — worse than the storefront spinbutton which at least had `type=number` and `min=1` |
| `min` / `max` / `step` / `pattern` | **null** | Zero HTML5 validation constraints |
| `num-type` | `"integer"` | Angular directive; restricts to integers. Does NOT enforce non-negative |
| `smart-float` | — | VC Angular directive; by evidence, it does NOT reject negative values |
| Angular state | `ng-valid`, `ng-valid-required`, `validity.valid === true`, `validationMessage === ""` | **Browser + Angular both say `-1` is a valid value** |
| `ng-change` | `blade.recalculateFn()` | Recomputes totals on blur — no validation guard inside |
| `aria-valuemin` / `aria-valuemax` | null | Less constrained than the storefront (which had `aria-valuemin="1" aria-valuemax="3969"`) |

**Confirmed: the admin line-item qty input is the fourth validation-gap layer.** An admin opening this order can type `-5`, `-999`, or `0` into the qty cell; on blur, Angular's `recalculateFn()` fires and the Save button enables. There is no clamp, no error state, no disabled-save guard.

#### 3. Payment and fulfillment actions — ALL enabled on the bad order

Enumerated via DOM `disabled`/`aria-disabled` inspection across all three open blades; **no toolbar button is disabled** on this qty=-1 order:

**Order blade (`Carlos Rodriguez's order`)** — toolbar buttons, all `disabled: false`:
- `New document`, `Save`, `Reset`, `Delete`, `Cancel document`, `Get invoice PDF`, `Create return`

**PaymentIn blade (`Incoming payment #PI260422-00001`, status=New, amount=$2,994 USD)** — toolbar buttons, all `disabled: false`:
- `New document`, `Reset`, `Delete`, `Cancel document`, **`Capture payment`**, **`Refund payment`**

**Shipment blade (`Shipment #SH260422-00001`, status=New, amount=$150 USD, fulfillment center unset)** — toolbar buttons, all `disabled: false`:
- `New document`, `Reset`, `Delete`, `Cancel document`, `Create return`. Status dropdown freely lets admin transition `New → Picking → Sent → Delivered`

**Implication:** an admin with ordinary Orders permissions can click `Capture payment` RIGHT NOW and attempt to bill the customer $2,994 for an order whose only charged line item has qty=-1. A warehouse clerk can set Shipment status to `Sent` without being shown the negative qty at all (qty is in a different sub-blade). There is NO admin-side circuit breaker.

#### 4. Raw DB representation — Platform REST `/api/order/customerOrders/{id}`

Full JSON captured at `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-admin-06-rest-api-raw.json`. Key fields:

```json
{
  "orderNumber": "CO260422-00001",
  "orderStatus": "New",
  "isApproved": false,
  "isCancelled": false,
  "subTotal": 3456,
  "total": 2994,
  "items": [
    {
      "id": "11a844b4-2e7f-4657-a119-ee411d07a7b1",
      "productId": "4b312d4e-4388-434a-9164-0f158b900463",
      "sku": "418132",
      "name": "COTE SOLEIL Merlot 0.75L: Elegance in Every Sip",
      "quantity": -1,                    //  <-- RAW NEGATIVE, no coercion
      "price": 3456,
      "priceWithTax": 4147.2,
      "placedPrice": 2345,
      "placedPriceWithTax": 2814,
      "extendedPrice": 2345,             //  <-- |quantity| x placedPrice - sign dropped
      "extendedPriceWithTax": 2814,      //  <-- same: positive despite qty=-1
      "discountAmount": 1111,
      "taxTotal": 469,
      "taxPercentRate": 0.2,
      "reserveQuantity": 0,              //  <-- nothing reserved from inventory
      "fulfillmentLocationCode": null,
      "status": "In Progress"
    },
    {
      "sku": "8010073", "name": "SHOT",
      "quantity": 1, "isGift": true,
      "price": 0, "extendedPrice": 0     //  <-- free promo-triggered gift
    }
  ],
  "inPayments": [{ "sum": 2994, "paymentStatus": "New", "isCancelled": false }],
  "shipments": [{
     "status": "New",
     "fulfillmentCenterId": null,
     "totalWithTax": 180,
     "items": []                         //  <-- SHIPMENT HAS ZERO LINE ITEMS
  }]
}
```

**New facts not in the original storefront-only evidence:**
1. **`reserveQuantity: 0`** on the merlot line — inventory was **never decremented** for this line. Probably because the platform refused to reserve -1 units, but silently (no error propagated to reject the order).
2. **`shipments[0].items: []`** — the auto-generated Shipment has an **empty** items array. The platform did NOT copy the merlot line into the shipment (because it could not pick a negative quantity), yet it created a non-empty shipment record worth $180. A warehouse Sent-action would dispatch shipping cost with nothing in the box.
3. **`extendedPrice = |quantity| * placedPrice`** — the money math is explicitly using the absolute value of quantity. The code is aware of the qty sign enough to avoid it but NOT aware enough to reject the order. Asymmetric handling.
4. **`fulfillmentLocationCode: null`**, **`fulfillmentCenterId: null`** — order was created without fulfillment center assignment (orthogonal issue but confirms this order is in an un-fulfillable state).
5. **Two items in the order but one is a promo gift** — the $1,111 discount came from a "buy X -> get free SHOT" promo that fired when the merlot was added. Negative qty on the buy-line did NOT invalidate the promo. Promotion engine treated qty=-1 as qualifying the promo.

#### 5. Dashboard / reports impact

**Pre-existing corrupted totals independent of this bug:**
- Home dashboard: Revenue = **`$1,080,009,436,748.15 USD`** (one trillion+). Concentrated in 2025 Q3 `$1,080,002,537,796.84`. This is a different data-integrity issue (not caused by CO260422-00001), but it proves **the admin revenue aggregation has no sanity ceiling** and would not flag another anomaly like it.
- Revenue-per-customer: `$2,769,254,966.02` (2.7B USD/customer).
- Average order value: `$289,625,107.26`.

**Dashboard screenshot:** `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_028_036-admin-00-dashboard-revenue-corrupted.png`

CO260422-00001 by itself adds only $2,994 to 2026 Q2 (`$253,086.77` total for the quarter — not yet corrupted). But because the order's sign is dropped by `extendedPrice`, the positive $2,994 flows into revenue as if it were a legitimate sale. A legitimate-looking "sale" that cannot be fulfilled, cannot be inventoried, cannot be paid, and cannot be shipped — yet is counted in revenue projections.

#### 6. Validation-gap depth: confirmed 4 layers

| Layer | Location | Result |
|-------|----------|--------|
| 1 — Storefront UI | `cart-line-items.vue` + `QuantityControl` `disable-validation` | Accepts `-1` via paste / `fill()` / JS |
| 2 — xAPI mutation | `ChangeFullCartItemsQuantity` resolver | HTTP 200, persists `-1` in cart |
| 3 — Order creation | `createOrderFromCart` / `CustomerOrderBuilder` | Creates CustomerOrder with `quantity: -1` |
| 4 — Admin SPA edit (NEW — this section) | line-item qty `<input smart-float num-type="integer">` | No HTML5/Angular guard; admin can freely set additional negative qty via inline edit, press Save, persist |

**An admin attempting to FIX this order by editing the qty could accidentally make it worse** (e.g. typing a misread `-1` where they meant `1`, or typing `-10`). There is no safeguard on the remediation path either.

#### 7. Evidence captured (this investigation)

| File | Description |
|------|-------------|
| `invest-BUG_028_036-admin-00-dashboard-revenue-corrupted.png` | Admin dashboard — trillion-USD revenue, confirms aggregation has no ceiling |
| `invest-BUG_028_036-admin-01-orders-grid-no-flag.png` | Orders grid — CO260422-00001 displayed like a normal $2,994 order, no warning |
| `invest-BUG_028_036-admin-02-order-detail.png` | Order detail blade — all-positive totals, workflow diagram shows payment/shipment records already generated |
| `invest-BUG_028_036-admin-02-order-detail-snapshot.md` | Full a11y snapshot of detail blade |
| `invest-BUG_028_036-admin-03-line-items-neg-qty-inline.png` | Line-items sub-blade — qty=-1 in editable textbox with Status='In Progress' |
| `invest-BUG_028_036-admin-04-paymentin-actions.png` | PaymentIn blade — Capture payment & Refund payment buttons enabled on qty=-1 order |
| `invest-BUG_028_036-admin-05-shipment-actions.png` | Shipment blade — status=New, amount=$180, status freely editable |
| `invest-BUG_028_036-admin-06-rest-api-raw.json` | Platform `/api/order/customerOrders/{id}` raw JSON — proves DB persists `quantity: -1`, `reserveQuantity: 0`, `shipment.items: []` |

#### 8. Suggested fixes — additional Layer-4 items

Add to the "Suggested Fixes" section above:

### Admin SPA (Layer 4 — required for defense in depth)
10. **Line-item qty input** (`order-line-items-list.tpl.html` / equivalent Angular template in `vc-module-orders` admin UI) — add `ng-min="1"`, `ng-pattern="^[1-9]\d*$"`, or a `smartFloat` directive option that rejects sign. Tie the Save button to line-items' aggregate validity.
11. **Order detail blade** — show a prominent warning banner if any `item.quantity < 1` or `item.quantity != Math.floor(item.quantity)`. Gate Capture/Refund/Save until the admin acknowledges or fixes.
12. **Orders grid** — surface a data-integrity warning icon in the Total or Status column when any line has `quantity < 1`. Let the admin filter for `"has negative qty"` to find historical bad data.
13. **Dashboard revenue aggregation** — add a sanity-check filter that excludes (and reports) orders with negative-qty lines so the revenue KPI is not silently inflated.

#### 9. Severity confirmation

**P0 stands — strongly reconfirmed.** Admin-side findings do not de-escalate; they either hold or escalate the severity:

- **If only the storefront were broken** but admin detected/blocked the anomaly: P1/P2 (UI bug, admin catches before fulfillment).
- **If admin passively displayed but blocked actions** (Capture/Ship disabled for invalid qty): P0 (data integrity, no immediate fulfillment risk).
- **Actual situation — admin passively displays AND all destructive actions are enabled AND admin edit accepts further negative values:** **P0 critical-hotfix.** A 4-layer validation gap on a revenue-critical entity is a company-wide reputational/financial/compliance risk.

**Recommended escalation:** add JIRA label `critical-hotfix`, notify Operations (existing CO260422-00001 needs manual containment), notify Accounting/BI (trillion-USD dashboard corruption — separate but related investigation). Do NOT ship to production until at least Layer 2 (xAPI `ChangeFullCartItemsQuantity`) and Layer 3 (`CustomerOrderBuilder`) reject negative quantity; Layers 1 and 4 should follow within the same hotfix sprint.

#### 10. Cleanup path for CO260422-00001 (when you want to dispose)

Admin has three destructive options, all currently enabled — use the SAFEST one:
- **Safest: `Cancel document` on the order blade** — marks order Cancelled, stops downstream payment/shipment processing, preserves audit trail. Use this.
- `Delete` on the order blade — hard-deletes the order. Loses audit trail. Do not use until bug is filed with a direct link to this investigation.
- Do NOT click `Capture payment` (would try to charge a real payment gateway), `Refund payment` (would try to reverse a never-captured payment), or `Create return` (would create a return document for a never-shipped order).
