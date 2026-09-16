---
id: KB-D61E2FFA
subject: gql-type-carttype
plane: derived-first
question: What fields does the GraphQL type `CartType` have, and what type is each?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    platformVersion: 3.1007.26
anchors:
  - coordinate: CartType
    hash: ae4955dc2fbc
  - coordinate: CartType.addresses
    hash: 242cca19784b
  - coordinate: CartType.availableGifts
    hash: 0600185428b9
  - coordinate: CartType.availablePaymentMethods
    hash: fc010cfef0f0
  - coordinate: CartType.availableShippingMethods
    hash: c63755fe3d84
  - coordinate: CartType.cartTotals
    hash: 067f2ecf3366
  - coordinate: CartType.channelId
    hash: a9ad62005f5b
  - coordinate: CartType.checkoutId
    hash: f8998717bdd1
  - coordinate: CartType.comment
    hash: daa8fcab278e
  - coordinate: CartType.coupons
    hash: ee1cd28ff2bc
  - coordinate: CartType.currency
    hash: 477d7780102b
  - coordinate: CartType.customerId
    hash: 3d6da1db9fed
  - coordinate: CartType.customerName
    hash: d57e2b4d2823
  - coordinate: CartType.discounts
    hash: db308d49e70b
  - coordinate: CartType.discountTotal
    hash: 6226a5e9f0a1
  - coordinate: CartType.discountTotalWithTax
    hash: c44e194ecaf0
  - coordinate: CartType.dynamicProperties
    hash: 36dfdf7c65f8
  - coordinate: CartType.extendedPriceTotal
    hash: d4aa19eefd9e
  - coordinate: CartType.extendedPriceTotalWithTax
    hash: 7bf4135cc631
  - coordinate: CartType.fee
    hash: 3df5575f63ec
  - coordinate: CartType.feeTotal
    hash: 2aa3a03bb77b
  - coordinate: CartType.feeTotalWithTax
    hash: bd89575b493d
  - coordinate: CartType.feeWithTax
    hash: 6afc488fc6c6
  - coordinate: CartType.gifts
    hash: e2f4f19728e1
  - coordinate: CartType.handlingTotal
    hash: b16f7a2ad5c4
  - coordinate: CartType.handlingTotalWithTax
    hash: 49b76a67c107
  - coordinate: CartType.hasPhysicalProducts
    hash: 4260fab17a73
  - coordinate: CartType.id
    hash: 23d182c998e6
  - coordinate: CartType.isAnonymous
    hash: 85d2d2742103
  - coordinate: CartType.isRecuring
    hash: 45fb27b58f77
  - coordinate: CartType.items
    hash: 914a44f90603
  - coordinate: CartType.itemsCount
    hash: 7545f19a81c4
  - coordinate: CartType.itemsQuantity
    hash: 7816a1191375
  - coordinate: CartType.name
    hash: d212a4ea663c
  - coordinate: CartType.organizationId
    hash: abd73e10e07c
  - coordinate: CartType.organizationName
    hash: f52dbfd32bde
  - coordinate: CartType.paymentPrice
    hash: 788e61c3ba68
  - coordinate: CartType.paymentPriceWithTax
    hash: c012800d58e3
  - coordinate: CartType.payments
    hash: fd8450245755
  - coordinate: CartType.paymentTotal
    hash: bce7f680d1e2
  - coordinate: CartType.paymentTotalWithTax
    hash: 8144dbb9a83f
  - coordinate: CartType.purchaseOrderNumber
    hash: 6a3d13e59240
  - coordinate: CartType.shipments
    hash: c4742b46ad6b
  - coordinate: CartType.shippingPrice
    hash: f34493906c64
  - coordinate: CartType.shippingPriceWithTax
    hash: 9e2695f80d5a
  - coordinate: CartType.shippingTotal
    hash: dea0bbded819
  - coordinate: CartType.shippingTotalWithTax
    hash: c892b4a263f2
  - coordinate: CartType.status
    hash: 206caa392af0
  - coordinate: CartType.storeId
    hash: f750fb11945a
  - coordinate: CartType.subTotal
    hash: 9cc30ea81ccd
  - coordinate: CartType.subTotalDiscount
    hash: c28f83d2b614
  - coordinate: CartType.subTotalDiscountWithTax
    hash: 6af8aea652e9
  - coordinate: CartType.subTotalWithTax
    hash: 3a322464699b
  - coordinate: CartType.taxDetails
    hash: 1fb256193ae6
  - coordinate: CartType.taxPercentRate
    hash: 4d66f988b6ce
  - coordinate: CartType.taxTotal
    hash: 897a91cd1946
  - coordinate: CartType.taxType
    hash: 1913da88d600
  - coordinate: CartType.total
    hash: 52359287f058
  - coordinate: CartType.type
    hash: b31f6f5fcf0d
  - coordinate: CartType.validationErrors
    hash: 3e60d13d1d69
  - coordinate: CartType.volumetricWeight
    hash: f5d0a8b66265
  - coordinate: CartType.warnings
    hash: 136d2dc89910
  - coordinate: CartType.weight
    hash: a3098cd3813f
  - coordinate: CartType.weightUnit
    hash: bbfe94560b86
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# CartType

A GraphQL object type on this deployment's schema, carrying 63 fields. It is what an operation returns: a field that is not here cannot be selected, however plausible its name.

| field | type | what the schema says |
|---|---|---|
| `addresses` | `[CartAddressType!]!` | Addresses |
| `availableGifts` | `[GiftItemType!]!` | Available Gifts |
| `availablePaymentMethods` | `[PaymentMethodType!]!` | Available payment methods |
| `availableShippingMethods` | `[ShippingMethodType!]!` | — |
| `cartTotals` | `[CartTotalType]` | Cart totals |
| `channelId` | `String` | Shopping cart channel ID |
| `checkoutId` | `String!` | Cart checkout ID |
| `comment` | `String` | Shopping cart text comment |
| `coupons` | `[CouponType!]!` | Coupons |
| `currency` | `CurrencyType!` | Currency |
| `customerId` | `String!` | Shopping cart user ID |
| `customerName` | `String` | Shopping cart user name |
| `discounts` | `[DiscountType!]!` | Discounts |
| `discountTotal` | `MoneyType!` | Total discount |
| `discountTotalWithTax` | `MoneyType!` | Total discount with tax |
| `dynamicProperties` | `[DynamicPropertyValueType!]!` | Cart dynamic property values |
| `extendedPriceTotal` | `MoneyType!` | Total extended price |
| `extendedPriceTotalWithTax` | `MoneyType!` | Total extended price with tax |
| `fee` | `MoneyType!` | Shopping cart fee |
| `feeTotal` | `MoneyType!` | Total fee |
| `feeTotalWithTax` | `MoneyType!` | Total fee with tax |
| `feeWithTax` | `MoneyType!` | Shopping cart fee with tax |
| `gifts` | `[GiftItemType!]!` | Gifts |
| `handlingTotal` | `MoneyType!` | Total handling |
| `handlingTotalWithTax` | `MoneyType!` | Total handling with tax |
| `hasPhysicalProducts` | `Boolean` | Has physical products |
| `id` | `String!` | Shopping cart ID |
| `isAnonymous` | `Boolean!` | Displays whether the shopping cart is anonymous |
| `isRecuring` | `Boolean` | Displays whether the shopping cart is recurring |
| `items` | `[LineItemType!]!` | Items |
| `itemsCount` | `Int!` | Item count |
| `itemsQuantity` | `Int!` | Quantity of items |
| `name` | `String!` | Shopping cart name |
| `organizationId` | `String` | Shopping cart organization ID |
| `organizationName` | `String` | Shopping cart organization name |
| `paymentPrice` | `MoneyType!` | Payment price |
| `paymentPriceWithTax` | `MoneyType!` | Payment price with tax |
| `payments` | `[PaymentType!]!` | Payments |
| `paymentTotal` | `MoneyType!` | Total payment |
| `paymentTotalWithTax` | `MoneyType!` | Total payment with tax |
| `purchaseOrderNumber` | `String` | Purchase order number |
| `shipments` | `[ShipmentType!]!` | Shipments |
| `shippingPrice` | `MoneyType!` | Shipping price |
| `shippingPriceWithTax` | `MoneyType!` | Shipping price with tax |
| `shippingTotal` | `MoneyType!` | Total shipping |
| `shippingTotalWithTax` | `MoneyType!` | Total shipping with tax |
| `status` | `String` | Shopping cart status |
| `storeId` | `String!` | Shopping cart store ID |
| `subTotal` | `MoneyType!` | Shopping cart subtotal |
| `subTotalDiscount` | `MoneyType!` | Subtotal discount |
| `subTotalDiscountWithTax` | `MoneyType!` | Subtotal discount with tax |
| `subTotalWithTax` | `MoneyType!` | Subtotal with tax |
| `taxDetails` | `[TaxDetailType!]!` | Tax details |
| `taxPercentRate` | `Decimal!` | Tax percentage |
| `taxTotal` | `MoneyType!` | Total tax |
| `taxType` | `String!` | Shipping tax type |
| `total` | `MoneyType!` | Shopping cart total |
| `type` | `String` | Shopping cart type |
| `validationErrors` | `[ValidationErrorType!]!` | A set of errors in case the cart is invalid |
| `volumetricWeight` | `Decimal` | Shopping cart volumetric weight value |
| `warnings` | `[ValidationErrorType!]!` | A set of temporary warnings for a cart user |
| `weight` | `Decimal` | Shopping cart weight value |
| `weightUnit` | `String` | Shopping cart weight unit value |

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-type-carttype.json`.
