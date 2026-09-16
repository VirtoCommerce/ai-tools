---
id: KB-FF7E4D5B
subject: cart-subtotal-percentage-reward-on-customerorder
plane: experiential
question: when a percentage promotion discounts the whole cart, where does that discount end up on the resulting CustomerOrder
status: active
refutableBy: observation
appliesTo:
  - axis: surface
    value: storefront-xapi
  - axis: surface
    value: rest
  - axis: principal
    value: customer
  - axis: reward
    value: percentage-off-cart-subtotal
anchors:
  - coordinate: CustomerOrder.discounts
  - coordinate: CustomerOrder.subTotalDiscount
  - coordinate: OrderLineItemType.discountTotal
  - coordinate: GET /api/order/customerOrders/{id}
evidence:
  - method: observation
    deployment: vcptcore_stable
    at: 2026-09-10T19:56:22.148Z
---

A promotion whose reward is a percentage off the cart subtotal is recorded on the resulting CustomerOrder as exactly one entry in the order-level discounts collection, and nowhere else: every line item keeps its full placedPrice with an empty discounts array and discountAmount/discountTotal of 0, the shipment discountAmount is 0, and subTotalDiscount is 0.00 as well - only the order-level discountAmount/discountTotal carry the reduction.
