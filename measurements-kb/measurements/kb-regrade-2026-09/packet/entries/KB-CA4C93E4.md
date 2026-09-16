---
id: KB-CA4C93E4
subject: discount-rate-not-persisted-on-order
plane: experiential
question: can I tell from a placed order what percentage a promotion took off it
status: active
refutableBy: observation
appliesTo:
  - axis: surface
    value: storefront-xapi
  - axis: surface
    value: rest
  - axis: principal
    value: customer
anchors:
  - coordinate: OrderDiscountType.amount
  - coordinate: OrderDiscountType.promotionId
  - coordinate: Discount.discountAmount
evidence:
  - method: observation
    deployment: vcptcore_stable
    at: 2026-09-10T19:56:35.741Z
---

A placed order stores no discount rate: the discount entry carries only a money amount plus promotionId, promotion name, description and coupon, so the percentage is recoverable only by dividing the amount by the base it was taken from, or by following promotionId back to the promotion definition - which is mutable and can be edited or deleted after the order exists. The free-text description is the only place a rate may appear, and only because a human happened to type it there. By contrast the same schema does keep a rate for tax, in taxPercentRate.
