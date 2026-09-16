---
id: KB-B321AACD
subject: gql-mutations-createorderfromcart
plane: derived-first
question: What is the signature of the GraphQL mutation `Mutations.createOrderFromCart`, and what do its inputs require?
status: active
refutableBy: derivation
appliesTo:
  - surface: graphql
    root: Mutations
    platformVersion: 3.1007.26
anchors:
  - coordinate: Mutations.createOrderFromCart
    hash: efe0d8ee7194
  - coordinate: CustomerOrderType
    hash: 15bd3945be9c
  - coordinate: InputCreateOrderFromCartType
    hash: 7dcb7cd0e29c
evidence:
  - method: extraction
    deployment: vcptcore_stable
    pin: c2f9c438eba4cd95
---

# Mutations.createOrderFromCart

A GraphQL mutation field on the root type `Mutations`. The root type names on this deployment are read from introspection, not assumed: `Query` / `Mutations` / `Subscriptions`.

```graphql
createOrderFromCart(command: InputCreateOrderFromCartType!): CustomerOrderType
```

| argument | type | required | what the schema says |
|---|---|---|---|
| `command` | `InputCreateOrderFromCartType!` | yes | — |

## `CustomerOrderType` (OBJECT)

| field | type | what the schema says |
|---|---|---|
| `addresses` | `[OrderAddressType!]!` | — |
| `availablePaymentMethods` | `[OrderPaymentMethodType!]!` | Available payment methods |
| `cancelledDate` | `DateTime` | — |
| `cancelReason` | `String` | — |
| `channelId` | `String` | — |
| `comment` | `String` | — |
| `coupons` | `[String!]!` | — |
| `createdBy` | `String` | — |
| `createdDate` | `DateTime!` | — |
| `currency` | `CurrencyType!` | — |
| `customerId` | `String!` | — |
| `customerName` | `String` | — |
| `discountAmount` | `MoneyType!` | — |
| `discounts` | `[OrderDiscountType!]!` | — |
| `discountTotal` | `MoneyType!` | — |
| `discountTotalWithTax` | `MoneyType!` | — |
| `dynamicProperties` | `[DynamicPropertyValueType!]!` | Customer order dynamic property values |
| `employeeId` | `String` | — |
| `employeeName` | `String` | — |
| `fee` | `MoneyType!` | — |
| `feeTotal` | `MoneyType!` | — |
| `feeTotalWithTax` | `MoneyType!` | — |
| `feeWithTax` | `MoneyType!` | — |
| `id` | `String!` | — |
| `inPayments` | `[PaymentInType!]!` | — |
| `isApproved` | `Boolean!` | — |
| `isCancelled` | `Boolean!` | — |
| `isPrototype` | `Boolean!` | — |
| `items` | `[OrderLineItemType!]!` | — |
| `languageCode` | `String` | — |
| `modifiedBy` | `String` | — |
| `modifiedDate` | `DateTime` | — |
| `number` | `String!` | — |
| `objectType` | `String!` | — |
| `operationType` | `String!` | — |
| `orderTotals` | `[OrderTotalType]` | Order totals |
| `organizationId` | `String` | — |
| `organizationName` | `String` | — |
| `outerId` | `String` | — |
| `parentOperationId` | `String` | — |
| `paymentDiscountTotal` | `MoneyType!` | — |
| `paymentDiscountTotalWithTax` | `MoneyType!` | — |
| `paymentSubTotal` | `MoneyType!` | — |
| `paymentSubTotalWithTax` | `MoneyType!` | — |
| `paymentTaxTotal` | `MoneyType!` | — |
| `paymentTotal` | `MoneyType!` | — |
| `paymentTotalWithTax` | `MoneyType!` | — |
| `purchaseOrderNumber` | `String` | — |
| `shipments` | `[OrderShipmentType!]!` | — |
| `shippingDiscountTotal` | `MoneyType!` | — |
| `shippingDiscountTotalWithTax` | `MoneyType!` | — |
| `shippingSubTotal` | `MoneyType!` | — |
| `shippingSubTotalWithTax` | `MoneyType!` | — |
| `shippingTaxTotal` | `MoneyType!` | — |
| `shippingTotal` | `MoneyType!` | — |
| `shippingTotalWithTax` | `MoneyType!` | — |
| `shoppingCartId` | `String` | — |
| `status` | `String` | — |
| `statusDisplayValue` | `String` | — |
| `storeId` | `String!` | — |
| `storeName` | `String` | — |
| `subscriptionId` | `String` | — |
| `subscriptionNumber` | `String` | — |
| `subTotal` | `MoneyType!` | — |
| `subTotalDiscount` | `MoneyType!` | — |
| `subTotalDiscountWithTax` | `MoneyType!` | — |
| `subTotalTaxTotal` | `MoneyType!` | — |
| `subTotalWithTax` | `MoneyType!` | — |
| `taxDetails` | `[OrderTaxDetailType!]!` | — |
| `taxPercentRate` | `Decimal!` | — |
| `taxTotal` | `MoneyType!` | — |
| `taxType` | `String` | — |
| `total` | `MoneyType!` | — |

## `InputCreateOrderFromCartType` (INPUT_OBJECT)

| field | type | what the schema says |
|---|---|---|
| `cartId` | `String` | Cart ID |

Generated from `vcptcore_stable` at pin `c2f9c438eba4cd95`. Table: `derived/graphql/gql-mutations-createorderfromcart.json`.
