# Order verification report — CO260915-00002

Deployment: vcptcore-stable (platform 3.1007.26), store **B2B-store**, currency USD. Date: 2026-09-15.

## Surfaces used

| tag | surface | how it was read |
|---|---|---|
| **SF** | storefront order page | `/account/orders/fbb7cfbf-1c29-4f33-ad34-cbfca2886607`, signed in as the shopping account |
| **ADM** | Admin order blade | `#!/workspace/orders?orderId=fbb7cfbf-…`, plus its Line items / Discounts widgets and the PaymentIn + Shipment child blades |
| **API** | REST | `GET /api/order/customerOrders/number/CO260915-00002` as the platform administrator |

## The promotion I created

`AGENT-ARENA disposable 12pct off cart` — id `0287728a-2252-40ad-8cd5-88dea8939faf`.
Reward `RewardCartGetOfRelSubtotal` amount **12**, maxLimit 0 (no cap); criterion `ConditionIsEveryone`;
no catalog or cart conditions; storeIds `["B2B-store"]`; no coupon; startDate 2026-09-15T09:47:06Z, no end date.
`isActive: true` at placement time (09:51:39Z). Now disabled, not deleted.

---

## 1. Order number and status

| | value | source |
|---|---|---|
| number | **CO260915-00002** | SF page heading; ADM "Customer order number" field; API `number` |
| status **at placement** | **New** | SF "Status: New"; ADM status select "New"; API `status: "New"`, `isCancelled: false` |
| status **now** (after required cleanup cancel) | **Cancelled** | SF "Status: Cancelled"; ADM blade "Cancelled"; API `status: "Cancelled"`, `isCancelled: true`, `cancelledDate 2026-09-15T09:58:11.195Z` |

Internal id `fbb7cfbf-1c29-4f33-ad34-cbfca2886607`. All three surfaces agree, before and after cancellation.

## 2. Lines

| product | SKU | qty | unit price | line total |
|---|---|---|---|---|
| 1" Steel Carriage Bolt, Grade 5, Zinc Plated Finish, 1/4"-20, 100 PK | 5ZMR1 | **3** | $10.85 | $32.55 |
| 1" Stainless Steel Carriage Bolt, 18-8, NL-19(SM), 1/4"-20, 50 PK | 53MF87 | 1 | $42.20 | $42.20 |
| Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier | 566903892 | 1 | $189.00 | $189.00 |
| **line sum** | | | | **$263.75** |

- SF: product name, unit price, disabled qty stepper and line total per row; "Subtotal: $263.75".
- ADM: Line items widget, columns Item / Currency / Status / Qty / Price per item / Discount / Tax / Total.
- API: `items[].name`, `.sku`, `.quantity`, `.price` (equal to `.placedPrice`), `.extendedPrice`.

All three agree on all three lines. Every line carries `discountAmount 0` and `taxTotal 0` — expected, because
the promotion is a **cart-level** reward, so it lands in the order-level discount collection, not on the lines.

## 3. Discount

- **Promotion applied:** `AGENT-ARENA disposable 12pct off cart` — the one I created.
- **Exact amount: $31.65.**

| surface | what it shows |
|---|---|
| SF | Discount line `- $31.65`; expanding the chevron shows exactly **one** row, labelled with the promotion *description* ("AGENT-ARENA (disposable, agent-created): 12% off the cart subtotal. Safe to disable."), `-$31.65` |
| ADM | Discounts widget: one row, **name** "AGENT-ARENA disposable 12pct off cart", coupon blank, 31.65 USD. Header "Discount" field 31.65; summary "Total discount -31.65 USD" |
| API | `discounts[]` has exactly one entry: `promotionId 0287728a-2252-40ad-8cd5-88dea8939faf`, `name`, `description`, `coupon: null`, `discountAmount 31.65`; order-level `discountTotal 31.65` |

Arithmetic: 12% × $263.75 = **$31.65** exactly. The API's `promotionId` matches my promotion's id, so the
attribution is proven by id, not merely by name.

**Contamination check.** One pre-existing promotion, `test promo`, is active and scoped to B2B-store with no
coupon; its reward is `RewardCartGetOfAbsSubtotal` — **$50 off when cart subtotal is at least $500**. I was not
permitted to touch it, so I kept the cart subtotal at $263.75, below its $500 threshold. All three surfaces
confirm a single discount row, so nothing else contributed.

## 4. Shipping cost

**$0.00** — SF "Shipping cost $0.00" and "Fixed Rate (Ground) ($0.00)"; ADM "Shipping subtotal 0.00 USD" and the
Shipment blade's "Shipping price 0.00 USD" with method Ground; API `shippingTotal 0`, `shipments[0].price 0`.

**Why:** the method is priceless, not free. The order's own `shipments[0].shippingMethod` object carries its
settings inline, and `VirtoCommerce.Shipping.FixedRateShippingMethod.Ground.Rate` has
`itHasValues: false`, `value: null`, `defaultValue: 0` — the rate has never been configured for this store, so it
evaluates to 0. (`Air.Rate` is identical, so the other offered option would also have been $0.00.) The choice is
still recorded: `shipmentMethodCode FixedRate`, `shipmentMethodOption Ground`.

## 5. Tax

**$0.00** — SF "Tax $0.00"; ADM "Total tax 0.00 USD"; API `taxTotal 0`, `taxPercentRate 0`, `taxDetails []`, and
`subTotalWithTax` equal to `subTotal`.

**Why:** B2B-store has no active tax provider. `POST /api/taxes/search` (read via the Admin store blade's Tax
providers widget) returns exactly one provider for this store — `FixedRate` / `FixedRateTaxProvider` — with
**`isActive: false`**, and its `VirtoCommerce.Core.FixedTaxRateProvider.Rate` is itself unset (`value: null`,
`itHasValues: false`, default 0). The zero is doubly determined: no provider runs, and the rate it would have
used is unconfigured. The same call shows other stores do have tax (Electronics: FixedRate active, rate 10;
TestStorePostman: active, rate 15), so this is specific to B2B-store, not a platform-wide zero. Corroborated by
the Admin order blade's own note: "AvaTax is not enabled for this order's store".

## 6. Payment method

**Test payment method.**

| surface | what it shows |
|---|---|
| SF | Payment method: "Test payment method" |
| ADM | Child document `PaymentIn #PI260915-00002`; blade shows "Test payment method", Amount 232.10 |
| API | `inPayments[0].paymentMethod.name` "Test payment method"; `gatewayCode` / `typeName` `DefaultManualPaymentMethod`; `sum 232.10`; `status New`; `isApproved false` |

Agreed across all three. The API additionally exposes the gateway code, which neither UI surface shows.

## 7. Grand total

**$232.10** — SF "Total $232.10", ADM "Total 232.10 USD", API `total: 232.1` and `sum: 232.1`.

```
  subtotal (3 lines)      263.75
  discount (12% promo)   - 31.65
  shipping                  0.00
  tax                       0.00
  fee                       0.00
  --------------------------------
  grand total             232.10
```

Checked mechanically against the API payload: line `extendedPrice` sum = 263.75 = `subTotal`;
`subTotal − discountTotal + shippingTotal + taxTotal + feeTotal` = 232.10 = `total`.

---

## Findings

No surface contradicts another on any of the seven items. Four smaller observations:

1. **REST-internal inconsistency in the discount record.** `discounts[0].discountAmountWithTax` is **0** while
   `discounts[0].discountAmount` is 31.65 — and the order-level `discountTotalWithTax` is 31.65. With tax at zero
   the with-tax figure should equal the without-tax one. No UI surface displays the per-discount with-tax field
   and no total depends on it, so nothing visible is wrong; but a consumer reading `discountAmountWithTax` off
   the API would get 0 for a $31.65 discount.
2. **`paymentTotal` is 0** on the order while the PaymentIn's `sum` is 232.10. Consistent with the payment not
   being captured (`status New`, `isApproved false`) — it tracks money actually taken, not money due — but it is
   easy to misread as "no payment on this order".
3. **The Admin order tree renders the shipment amount as "–"** where the Shipment blade and the API both say
   0.00. Cosmetic; the tree appears to blank a zero shipment rather than print it.
4. **Timezone rendering**, not a disagreement: Admin shows "Sep 15, 2026 5:51:39 AM" (local, UTC−4) for the same
   instant the API reports as `2026-09-15T09:51:39.6897076Z`.

## Unknown

- **Whether my 12% promotion would have stacked with `test promo`.** I deliberately kept the subtotal below $500
  so only my promotion could apply, which is what makes the $31.65 cleanly attributable. That means I never
  observed the two together and cannot say how this deployment would combine them. Both are non-exclusive
  ("Valid with other offers") at priority 0, which *suggests* stacking, but I did not test it and do not claim it.

## Cleanup performed

- Cart emptied — `/cart` reads "Your cart is empty" (already emptied by placement; confirmed, not assumed).
- Order **cancelled, not deleted** — status Cancelled on all three surfaces, `cancelReason` recorded. Every money
  field is identical before and after the cancel (subTotal, discountTotal, shippingTotal, taxTotal, total), and
  the discount attribution survives.
- My promotion **disabled, not deleted** — `GET /api/marketing/promotions/0287728a-…` returns `isActive: false`
  with the reward and store scope intact.
- **No pre-existing promotion was touched.** Diffed the full `promotions/search` payload from before the run
  against after: 13 before, 14 after, the 14th being mine; all 13 originals identical on name, isActive,
  description, storeIds, startDate, endDate, hasCoupons and modifiedDate.
- No catalog or pricing data modified; no member accounts created or deleted.
