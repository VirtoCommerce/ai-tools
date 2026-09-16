# Verification report - order CO260915-00004 (B2B-store)

Surfaces used:
  S = storefront   https://vcptcore-stable-storefront.govirto.com/account/orders/3bbed4fb-322f-4216-a623-7b7f0337db35
  A = Admin blade  https://vcptcore-stable.govirto.com/#!/workspace/orders?orderId=3bbed4fb-322f-4216-a623-7b7f0337db35
  R = REST         GET https://vcptcore-stable.govirto.com/api/order/customerOrders/3bbed4fb-322f-4216-a623-7b7f0337db35

Promotion created for this run (mine, disposable):
  ARENA-OPUS5 2026-09-15 disposable 23pct off cart
  id f170bcbf-00f3-48e6-901a-c8bca7d837fe | reward "23% off cart subtotal" | Everyone | B2B-store
  active from Sep 15 2026 07:05:58 (local) - order placed 07:11:20, so active at placement.

## 1. Order number and status
  CO260915-00004
  At verification: New   (S "Status: New" | A status field "New" | R status "New")
  After cleanup:   Cancelled (S, A, R all agree; R isCancelled true, cancelledDate 2026-09-15T11:18:27Z)

## 2. Lines
  SKU 566903892  Canon Imageclass WiFi MF232W          qty 1  x $189.00 = $189.00
  SKU 553390824  Epson Expression Premium XP-820       qty 2  x $190.00 = $380.00
  SKU 5ZMR1      1" Steel Carriage Bolt, Grade 5       qty 4  x  $10.85 =  $43.40
  Subtotal $612.40. Identical on S, A (line-items blade), R. Per-line discount 0.00 everywhere.

## 3. Discount
  Promotion: ARENA-OPUS5 ... 23pct off cart (mine) - the ONLY promotion that applied.
  Amount: 140.852 raw, carried as 140.85 in every total.
    S  "- $140.85", expander names the promotion
    A  Discounts grid: 140.852 USD; header Discount 140.85; "1 DISCOUNTS"
    R  discounts[0].discountAmount 140.852, promotionId f170bcbf-...; discountTotal 140.85
  612.40 x 0.23 = 140.852. No coupon. No other promotion contributed.

## 4. Shipping cost - $0.00
  Method: FixedRate / option "Ground" (S label "Fixed Rate (Ground) ($0.00)"; R shipments[0]
  shipmentMethodCode FixedRate, shipmentMethodOption Ground, name "Fixed shipping rate").
  WHY: B2B-store > Shipping methods > "Fixed shipping rate" > Settings (Shipping > General):
    Ground shipping rate = 0.0000, Air shipping rate = 0.0000.
  The configured rate is literally zero - not a discount, not free-shipping logic.

## 5. Tax - $0.00
  WHY: B2B-store Tax providers list is EMPTY - no tax provider registered or active.
  A order widget: "AvaTax is not enabled for this order's store".
  R: taxTotal 0.0, taxPercentRate 0.0, taxDetails [], every line taxTotal 0.0.

## 6. Payment method
  "Test payment method" (S PAYMENT METHOD card; A payment blade PI260915-00004).
  R: inPayments[0].paymentMethod.code = DefaultManualPaymentMethod,
     .name = "Test payment method", group Manual, active, store B2B-store.
  PaymentIn PI260915-00004, amount 471.55, status New, not approved.

## 7. Grand total - $471.55
  612.40 subtotal
  -140.85 discount
  +  0.00 shipping
  +  0.00 tax
  = 471.55   (identical on S, A, R)

## Cross-surface differences observed (presentation only, no value disagreement)
  a) Discount precision: A grid and R record 140.852; S and all headline totals show 140.85.
  b) Shipping label: S renders "Fixed Rate (Ground)"; A/R store name "Fixed shipping rate",
     code FixedRate, option Ground.
  c) A line-items blade header reads Discount 0.00 / Total 612.40 because the reward is an
     ORDER-level discount and is not distributed onto lines.
  d) R inPayments[0].paymentMethodCode is null even though the nested paymentMethod.code is
     populated; R order.discounts[0].discountAmountWithTax is 0.0 while discountAmount is
     140.852 (order-level discountTotalWithTax is correct at 140.85).

## Not established
  - Whether (d) is intentional or a data-population defect: not determined from these surfaces.

## Cleanup done
  Cart emptied (order consumed it; /cart shows "Your cart is empty").
  Order CO260915-00004 cancelled with reason.
  Promotion set inactive and left in place (16 promotions, not deleted; "1 USAGE HISTORY").
  No pre-existing promotion was opened for edit or changed; Active flags match the before shot.
