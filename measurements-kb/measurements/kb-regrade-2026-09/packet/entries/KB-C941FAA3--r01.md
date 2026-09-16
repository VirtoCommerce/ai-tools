---
id: KB-C941FAA3
subject: gql-mutations-additem
plane: derived-first
question: What is the signature of the GraphQL mutation `Mutations.addItem`, and what do its inputs require?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    root: Mutations
    platformVersion: 3.1007.26
anchors:
  - coordinate: Mutations.addItem
    hash: 6409d77dad8c
  - coordinate: CartType
    hash: 8354850caced
  - coordinate: InputAddItemType
    hash: f5d6976bbc77
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# Mutations.addItem

A GraphQL mutation field on the root type `Mutations`. The root type names on this deployment are read from introspection, not assumed: `Query` / `Mutations` / `Subscriptions`.

```graphql
addItem(command: InputAddItemType!): CartType
```

| argument | type | required | what the schema says |
|---|---|---|---|
| `command` | `InputAddItemType!` | yes | — |

## `CartType` (OBJECT)

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

## `InputAddItemType` (INPUT_OBJECT)

| field | type | what the schema says |
|---|---|---|
| `cartId` | `String` | — |
| `cartName` | `String` | — |
| `cartType` | `String` | — |
| `comment` | `String` | Comment |
| `configurationSections` | `[ConfigurationSectionInput]` | Configurable product support. List of configurable product sections |
| `createdDate` | `DateTime` | Create date. Optional, to manually control line item position in the cart if required. ISO-8601 format, for example: 2025-01-23T11:46:11Z |
| `cultureName` | `String` | — |
| `currencyCode` | `String` | — |
| `dynamicProperties` | `[InputDynamicPropertyValueType]` | — |
| `itemCurrencyCode` | `String` | Add the product in a different currency |
| `price` | `Decimal` | Price |
| `productId` | `String!` | Product ID |
| `quantity` | `Int!` | Quantity |
| `storeId` | `String!` | — |
| `userId` | `String!` | — |

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-mutations-additem.json`.
