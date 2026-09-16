---
id: KB-AE6BEE53
subject: gql-type-lineitemtype
plane: derived-first
question: What fields does the GraphQL type `LineItemType` have, and what type is each?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    platformVersion: 3.1007.26
anchors:
  - coordinate: LineItemType
    hash: 037a66ecabf9
  - coordinate: LineItemType.catalogId
    hash: c67453f417dd
  - coordinate: LineItemType.categoryId
    hash: c91a3a7b0b0a
  - coordinate: LineItemType.configurationItems
    hash: ce68f4861d53
  - coordinate: LineItemType.createdDate
    hash: 31b8ce9ba5c9
  - coordinate: LineItemType.currencyCode
    hash: ca3e3446f113
  - coordinate: LineItemType.discountAmount
    hash: 720d91abfd25
  - coordinate: LineItemType.discountAmountWithTax
    hash: f286eb49baff
  - coordinate: LineItemType.discounts
    hash: db308d49e70b
  - coordinate: LineItemType.discountTotal
    hash: 6226a5e9f0a1
  - coordinate: LineItemType.discountTotalWithTax
    hash: c44e194ecaf0
  - coordinate: LineItemType.dynamicProperties
    hash: 3c0a7ca5c1e0
  - coordinate: LineItemType.extendedPrice
    hash: f52ee768725a
  - coordinate: LineItemType.extendedPriceWithTax
    hash: a521553c2dfd
  - coordinate: LineItemType.fulfillmentCenterId
    hash: 277af83e809b
  - coordinate: LineItemType.fulfillmentCenterName
    hash: 3d068cc83d91
  - coordinate: LineItemType.height
    hash: a461f352da5a
  - coordinate: LineItemType.id
    hash: 23d182c998e6
  - coordinate: LineItemType.imageUrl
    hash: d070e3cbf062
  - coordinate: LineItemType.inStockQuantity
    hash: ed89b1ebd3c2
  - coordinate: LineItemType.isGift
    hash: 9572da2ac763
  - coordinate: LineItemType.isReadOnly
    hash: 8d3f997fbd40
  - coordinate: LineItemType.isReccuring
    hash: b65f2d939fb7
  - coordinate: LineItemType.isValid
    hash: 917b0c75a55a
  - coordinate: LineItemType.languageCode
    hash: f8a4816f660d
  - coordinate: LineItemType.length
    hash: 633b8be2c403
  - coordinate: LineItemType.listPrice
    hash: d3f1bca42861
  - coordinate: LineItemType.listPriceWithTax
    hash: 47f46db06ee7
  - coordinate: LineItemType.listTotal
    hash: 0e23fccade7f
  - coordinate: LineItemType.listTotalWithTax
    hash: d550e9cf2d47
  - coordinate: LineItemType.measureUnit
    hash: ac3538a73b60
  - coordinate: LineItemType.name
    hash: d212a4ea663c
  - coordinate: LineItemType.note
    hash: 76416358ea4c
  - coordinate: LineItemType.objectType
    hash: 73e845197931
  - coordinate: LineItemType.placedPrice
    hash: b0c1fdc5b03f
  - coordinate: LineItemType.placedPriceWithTax
    hash: 9d9504c71f46
  - coordinate: LineItemType.product
    hash: ae13b65e932e
  - coordinate: LineItemType.productId
    hash: bea38fdaba6d
  - coordinate: LineItemType.productOuterId
    hash: f874970103f5
  - coordinate: LineItemType.productType
    hash: f0bcfce20f7e
  - coordinate: LineItemType.quantity
    hash: f3111c37ad07
  - coordinate: LineItemType.requiredShipping
    hash: e723c4d0b8d6
  - coordinate: LineItemType.salePrice
    hash: 16606a0963d2
  - coordinate: LineItemType.salePriceWithTax
    hash: 24dac16ddb94
  - coordinate: LineItemType.selectedForCheckout
    hash: 322fadf0a502
  - coordinate: LineItemType.shipmentMethodCode
    hash: bfa2f8a8d04c
  - coordinate: LineItemType.showPlacedPrice
    hash: 06d931bde5a3
  - coordinate: LineItemType.sku
    hash: 3ea2e97da55e
  - coordinate: LineItemType.taxDetails
    hash: 1fb256193ae6
  - coordinate: LineItemType.taxPercentRate
    hash: 4d66f988b6ce
  - coordinate: LineItemType.taxTotal
    hash: 897a91cd1946
  - coordinate: LineItemType.taxType
    hash: 695603216f5c
  - coordinate: LineItemType.thumbnailImageUrl
    hash: b7c76930b4b9
  - coordinate: LineItemType.validationErrors
    hash: 3e60d13d1d69
  - coordinate: LineItemType.vendor
    hash: a0c7d3fa8143
  - coordinate: LineItemType.volumetricWeight
    hash: f5d0a8b66265
  - coordinate: LineItemType.warehouseLocation
    hash: 826b22aedede
  - coordinate: LineItemType.weight
    hash: a3098cd3813f
  - coordinate: LineItemType.weightUnit
    hash: bbfe94560b86
  - coordinate: LineItemType.width
    hash: 6d9ad55edc43
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# LineItemType

A GraphQL object type on this deployment's schema, carrying 59 fields. It is what an operation returns: a field that is not here cannot be selected, however plausible its name.

| field | type | what the schema says |
|---|---|---|
| `catalogId` | `String!` | Catalog ID value |
| `categoryId` | `String` | Category ID value |
| `configurationItems` | `[CartConfigurationItemType]` | Configuration items for configurable product |
| `createdDate` | `DateTime!` | Line item create date |
| `currencyCode` | `String` | Line item currency code |
| `discountAmount` | `MoneyType!` | Discount amount |
| `discountAmountWithTax` | `MoneyType!` | Discount amount with tax |
| `discounts` | `[DiscountType!]!` | Discounts |
| `discountTotal` | `MoneyType!` | Total discount |
| `discountTotalWithTax` | `MoneyType!` | Total discount with tax |
| `dynamicProperties` | `[DynamicPropertyValueType]` | Cart line item dynamic property values |
| `extendedPrice` | `MoneyType!` | Extended price |
| `extendedPriceWithTax` | `MoneyType!` | Extended price with tax |
| `fulfillmentCenterId` | `String` | Line item fulfillment center ID value |
| `fulfillmentCenterName` | `String` | Line item fulfillment center name value |
| `height` | `Decimal` | Height value |
| `id` | `String!` | Line item ID |
| `imageUrl` | `String` | Value of line item image absolute URL |
| `inStockQuantity` | `Int!` | In stock quantity |
| `isGift` | `Boolean!` | flag of line item is a gift |
| `isReadOnly` | `Boolean!` | Shows whether this is read-only |
| `isReccuring` | `Boolean!` | Shows whether the line item is recurring |
| `isValid` | `Boolean!` | Shows whether this is valid |
| `languageCode` | `String` | Culture name in the ISO 3166-1 alpha-3 format |
| `length` | `Decimal` | Length value |
| `listPrice` | `MoneyType!` | List price |
| `listPriceWithTax` | `MoneyType!` | List price with tax |
| `listTotal` | `MoneyType!` | List total |
| `listTotalWithTax` | `MoneyType!` | List total with tax |
| `measureUnit` | `String` | Measurement unit value |
| `name` | `String!` | Line item name value |
| `note` | `String` | Line item comment |
| `objectType` | `String!` | Line item quantity value |
| `placedPrice` | `MoneyType!` | Placed price |
| `placedPriceWithTax` | `MoneyType!` | Placed price with tax |
| `product` | `Product` | — |
| `productId` | `String!` | Product ID value |
| `productOuterId` | `String` | Product outer Id |
| `productType` | `String` | Product type: Physical, Digital, or Subscription |
| `quantity` | `Int!` | Line item quantity value |
| `requiredShipping` | `Boolean!` | Requirement for line item shipping |
| `salePrice` | `MoneyType!` | Sale price |
| `salePriceWithTax` | `MoneyType!` | Sale price with tax |
| `selectedForCheckout` | `Boolean!` | Shows whether the line item is selected for buying |
| `shipmentMethodCode` | `String` | Line item shipping method code value |
| `showPlacedPrice` | `Boolean!` | Indicates whether the PlacedPrice should be visible to the customer |
| `sku` | `String!` | Product SKU value |
| `taxDetails` | `[TaxDetailType!]!` | Tax details |
| `taxPercentRate` | `Decimal!` | Total shipping tax amount value |
| `taxTotal` | `MoneyType!` | Tax total |
| `taxType` | `String` | Shipping tax type value |
| `thumbnailImageUrl` | `String` | Value of line item thumbnail image absolute URL |
| `validationErrors` | `[ValidationErrorType!]!` | Validation errors |
| `vendor` | `CommonVendor` | — |
| `volumetricWeight` | `Decimal` | Volumetric weight value |
| `warehouseLocation` | `String` | Warehouse location |
| `weight` | `Decimal` | Shopping cart weight value |
| `weightUnit` | `String` | Weight unit value |
| `width` | `Decimal` | Width value |

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-type-lineitemtype.json`.
