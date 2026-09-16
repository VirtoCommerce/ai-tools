# Order verification — CO260915-00001 (vcptcore-stable, B2B-store)

Date: 2026-09-15 · Shopper: agent-test-impersonator@virtoworks.com ("Impersonation Operator",
org AGENT-TEST-Org-TechFlow-20260310) · Platform admin used for Marketing / order blade / REST.

Surfaces read:
- **SF** — storefront order page `/account/orders/1c458e1f-dd33-47c9-a109-c8733fb79ce4`
- **BO** — Admin order blade (Orders → CO260915-00001) + Line items / Discounts / PaymentIn widgets
- **API** — `GET /api/order/customerOrders/1c458e1f-dd33-47c9-a109-c8733fb79ce4`

Promotion created for this run: **KB-LAB run13 disposable 15pct off cart** — dynamic promotion,
Everyone / no catalog or cart condition, reward "15% off cart subtotal, no more than $10000",
no coupon, no store scope, start Sep 15 2026 04:15:00, no expiry. Active at placement; now disabled.

---

## The seven items

### 1. Order number and status
- Number **CO260915-00001** — SF (page title + H1), BO (Customer order number), API (`number`).
- Status at placement: **New** — SF ("Status: New"), BO (status bar + Status dropdown), API (`status: "New"`).
- Status now (after cleanup cancel): **Cancelled** on all three — API `status: "Cancelled"`,
  `isCancelled: true`, `cancelledDate: 2026-09-15T08:21:49.608Z`.
- Order id `1c458e1f-dd33-47c9-a109-c8733fb79ce4`; created `2026-09-15T08:17:18.308Z` (API),
  shown as "Sep 15, 2026 4:17:18 AM" in BO (browser-local time).

### 2. Lines
| Product | SKU (API/BO) | Qty | Unit price | Line total |
|---|---|---|---|---|
| Xerox WorkCentre 3335DNI Mono Laser MFP | 55557702 | 2 | $349.00 | $698.00 |
| HP LaserJet Pro MFP M127fn | 552223579 | 1 | $315.00 | $315.00 |
| Epson WorkForce WF-3640 All-in-One | 553684135 | 3 | $199.99 | $599.97 |

Identical on all three surfaces. SF shows product/qty/price-per-item/total; BO "Line items" blade adds
SKU + per-line Discount 0 and Tax 0.00; API `items[]` gives `price` / `quantity` / `extendedPrice`,
with `discountAmount: 0` and `taxTotal: 0` on every line.
Sum of lines = **$1,612.97** = the subtotal shown on all three.

### 3. Discount
- Promotion: **KB-LAB run13 disposable 15pct off cart** — the one created for this run, and the only
  discount on the order (`1 DISCOUNTS` in BO; a single entry in API `discounts[]`).
  API `discounts[0].promotionId = 44f0ef29-1541-44d4-a49f-175aa11c8bb9`, `coupon: null`.
- Amount: **$241.95**, which is 15% of the $1,612.97 subtotal (241.9455 exact).
- Read from: SF order summary "Discount −$241.95", expandable to a line naming the promotion by its
  description; BO "Total discount −241.95 USD" and the header Discount field 241.95;
  API `discountTotal: 241.95`.
- **The three surfaces render the same number at three different precisions** — see Findings.

### 4. Shipping cost
- **$0.00**, method **Fixed Rate (Ground)**.
- SF "Shipping cost $0.00" and "Shipping method: Fixed Rate (Ground) ($0.00)"; BO "Shipping subtotal
  0.00 USD"; API `shippingTotal: 0`, `shipments[0] = {shipmentMethodCode: "FixedRate",
  shipmentMethodOption: "Ground", price: 0, total: 0, number: "SH260915-00001"}`.
- **Why it is that amount:** the store's shipping method is configured with a zero rate. Verified in
  Admin → Stores → B2B-store → Shipping methods → "Fixed shipping rate" (code `FixedRate`, active) →
  Settings → Shipping > General: **Ground shipping rate = 0.0000** (Air shipping rate = 0.0000 too).
  So $0.00 is the configured rate, not a promotion or a waiver — my promotion's reward is
  subtotal-only and the API confirms `shippingDiscountTotal: 0`.

### 5. Tax
- **$0.00**.
- SF "Tax $0.00"; BO "Total tax 0.00 USD"; API `taxTotal: 0`, `taxPercentRate: 0`, `taxDetails: []`,
  and every line `taxPercentRate: 0` / `taxTotal: 0`. Each `*WithTax` field equals its base
  (`subTotalWithTax` = `subTotal` = 1612.97).
- **Why it is that amount:** no tax is being calculated for this store. The BO order blade states it
  outright — the widget **"AvaTax is not enabled for this order's store"** — and the store's
  FixedRate shipping method has **Tax type** unset. With no active tax provider the computed rate is
  0, so tax is 0 rather than "tax-exempt customer" or "tax-inclusive pricing".

### 6. Payment method
- **Test payment method** (gateway code `DefaultManualPaymentMethod`).
- SF "Payment method: Test payment method"; BO Incoming payment blade `PI260915-00001` titled
  "Test payment method", Amount 1371.02 USD; API `inPayments[0].gatewayCode =
  "DefaultManualPaymentMethod"` with `paymentMethod.name = "Test payment method"`, `sum: 1371.02`.
  It was the only method offered at checkout.

### 7. Grand total
**$1,371.02** — SF, BO and API all agree (`total: 1371.02`).

```
  line 1  Xerox   $349.00 × 2 =   $698.00
  line 2  HP      $315.00 × 1 =   $315.00
  line 3  Epson   $199.99 × 3 =   $599.97
  ------------------------------------------
  subtotal                      $1,612.97
  discount  15% of subtotal    −  $241.95
  shipping  FixedRate/Ground   +    $0.00
  tax       no tax provider    +    $0.00
  ------------------------------------------
  total                         $1,371.02
```

---

## Findings (cross-surface disagreements)

**F1 — the same discount is displayed at three different precisions.**
- SF: `-$241.95` (2 dp, both the summary line and the expanded per-promotion line)
- BO, Discounts widget grid: **`241.946`** (3 dp)
- API: `discounts[0].discountAmount = **241.9455**` (4 dp raw), while the aggregate
  `discountTotal = 241.95`
The order-level aggregate and the grand total are 241.95 / 1,371.02 everywhere, so no money is wrong.
But the Admin Discounts grid renders a currency amount at 3 decimal places, which no other surface
does and which is not a representable USD amount. Minor UI defect, Admin Discounts widget.

**F2 — `discountAmountWithTax` is 0 on the order discount (API only).**
API `discounts[0]`: `discountAmount: 241.9455` but `discountAmountWithTax: 0`. Everywhere else in
this payload the `*WithTax` field mirrors its base when tax is 0 (`subTotalWithTax` = `subTotal`,
`priceWithTax` = `price`). No surface renders this field, so there is no visible impact here — but on
a tax-enabled store a zero `discountAmountWithTax` would be wrong. Flagging as a candidate defect,
**not confirmed**: I could not establish from this deployment alone whether 0 is the intended value
for an order-level (as opposed to line-level) discount.

**F3 — cancelling the order left the shipment document at status New.**
After "Cancel document", the order and `PaymentIn #PI260915-00001` both moved to Cancelled, but
`Shipment #SH260915-00001` still reads **New** in the BO document tree. Observed post-cleanup, outside
the seven items; reporting it because it is a cross-document inconsistency on the same order.

**Not a disagreement (noted so it isn't mistaken for one):** the BO "Line items" blade header shows
`Discount 0.00 / Total 1,612.97` while the order shows `Discount 241.95 / Total 1,371.02`. These are
different scopes — the promotion is an order-level discount and is not allocated to lines
(API `items[].discountAmount = 0` on all three lines). Consistent, but easy to misread.

## Unknowns

- **F2's intended semantics** — see above. Unresolved.
- I did not establish *why* the store has no tax provider configured (deliberate for this test
  environment vs. an oversight); I only established that none is active and that this is the reason
  the tax is 0.

## Cleanup performed

- Cart: **empty** (verified at `/cart` — "Your cart is empty").
- Order: **cancelled**, not deleted — `status: "Cancelled"`, `isCancelled: true`, reason recorded
  ("KB-LAB run13 verification order — cancelled as part of test cleanup."), visible on SF and BO.
- Promotion: **disabled, not deleted** — grid Active column now shows inactive for
  "KB-LAB run13 disposable 15pct off cart" after save + grid refresh.
- No pre-existing promotion was opened for editing or modified. No catalog, pricing, store-config or
  member data was changed (the FixedRate settings dialog was closed with Cancel).

Screenshots: `reports/bugs/screenshots/_incoming/chrome/` (untracked scratch area) —
`cart-01`, `checkout-completed`, `storefront-order`, `bo-order-blade`, `bo-line-items`,
`bo-discounts`, `bo-fixed-rate-settings`, `bo-payment`, `bo-order-cancelled`,
`cleanup-promo-3`, `cleanup-cart`. Raw API payload: `api-order.json`.
