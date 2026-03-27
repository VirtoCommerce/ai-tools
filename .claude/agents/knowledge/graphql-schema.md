# GraphQL xAPI Schema Reference

> **Source**: Live introspection of `{{BACK_URL}}/graphql` (2026-03-27)
> **Purpose**: Agents MUST consult this file before writing or reviewing GraphQL queries/mutations.
> If you suspect the schema has changed, re-introspect before generating test cases.

## Critical Rules

1. **All mutations use `command` wrapper**: `mutation { foo(command: { ...fields }) { ...return } }`
2. **No `createCart` mutation** — use `cart(storeId, currencyCode)` query to get/create a cart
3. **MoneyType structure**: `{ amount currency { code } }` — NOT `{ amount currencyCode }`
4. **CartType has flat money fields**: `subTotal`, `total`, `discountTotal` directly — NOT nested under `totals`
5. **Auth token**: `grant_type=password&scope=offline_access&username=...&password=...&storeId=...` — NO `client_id`
6. **Facets on ProductConnection**: `term_facets { terms { term label count } }`, `range_facets { ranges { from to count } }` — NOT `facets { values }`
7. **Products search**: arg is `query`, not `keyword` (but `brands` query uses `keyword`)
8. **Variations**: `availabilityData` (not `availability`)
9. **Order addresses/payments**: `addresses[]` and `inPayments[]` (not `shippingAddress` or `payment`)

---

## Queries (sorted by domain)

### Catalog

```
products(after, first, storeId!, userId, currencyCode, cultureName, query, previousOutline, filter, preserveUserQuery, facet, fuzzy, fuzzyLevel, sort, productIds, selectedAddressId, selectedAddress, custom)
product(id!, storeId!, userId, currencyCode, cultureName, previousOutline, custom)
categories(after, first, storeId!, userId, currencyCode, cultureName, previousOutline, query, filter, fuzzy, fuzzyLevel, facet, sort, categoryIds)
category(id!, storeId!, userId, currencyCode, cultureName, previousOutline)
childCategories(storeId!, userId, cultureName, currencyCode, previousOutline, categoryId, maxLevel, onlyActive, productFilter)
brands(after, first, storeId!, userId, currencyCode, cultureName, sort, keyword)
brand(id!, storeId!, cultureName)
productSuggestions(storeId!, query, size)
properties(after, first, storeId!, types, filter, cultureName)
property(id!, cultureName)
productConfiguration(configurableProductId!, storeId!, userId, cultureName, currencyCode)
```

### Cart

```
cart(cartId, storeId!, currencyCode!, cartType, cartName, userId, cultureName)
carts(after, first, sort, storeId, userId, currencyCode, cultureName, cartType, filter)
validateCoupon(cartId, storeId!, currencyCode!, userId!, cultureName, cartName, cartType, coupon!)
pickupLocations(after, first, keyword, sort, storeId)
cartPickupLocations(after, first, keyword, sort, cartId!, storeId!, cultureName!, facet, filter)
configurationItems(cartId, lineItemId!, storeId!, currencyCode!, cartType, cartName, userId, cultureName)
pricesSum(cartId!, storeId!, currencyCode!, cultureName, userId, lineItemIds!)
getSavedForLater(storeId!, userId!, organizationId, currencyCode, cultureName)
```

### Orders

```
order(id, number, cultureName)
orders(after, first, sort, facet, filter, cultureName, userId)
organizationOrders(after, first, sort, facet, filter, cultureName, organizationId)
orderStatuses(cultureName)
orderLineItemStatuses(cultureName)
paymentStatuses(cultureName)
shipmentStatuses(cultureName)
payments(facet, filter, sort, cultureName, userId, after, first)
```

### Profile

```
me(userId)
organization(id!, userId)
contact(id!, userId)
vendor(id!, userId)
organizations(after, first, searchPhrase, sort)
contacts(after, first, searchPhrase, sort)
checkUsernameUniqueness(username!)
checkEmailUniqueness(email!)
validatePassword(password!)
user(id, userName, email, loginProvider, providerKey)
role(roleName!)
```

### CMS / Content

```
pages(after, first, storeId!, keyword!, cultureName)
page(storeId!, cultureName, id!)
pageDocuments(after, first, storeId!, keyword!, cultureName)
pageDocument(id!)
menu(storeId!, cultureName!, name!)
menus(storeId!, cultureName, keyword)
builderPage(storeId!, pageId!)
```

### Wishlists

```
wishlist(listId!, cultureName)
wishlists(after, first, storeId, userId, currencyCode, cultureName, scope, sort)
sharedWishlist(sharingKey!)
```

### Other

```
countries()
regions(countryId!)
store(storeId, cultureName, domain)
slugInfo(slug, permalink, storeId, userId, cultureName)
whiteLabelingSettings(organizationId, userId, storeId, domain, cultureName)
dynamicProperty(idOrName!, cultureName, objectType)
dynamicProperties(after, first, cultureName, filter, sort, objectType)
searchHistory(storeId!, maxCount!)
recentlyBrowsed(storeId!, cultureName, currencyCode, maxProducts)
recommendations(storeId!, userId, cultureName, currencyCode, previousOutline, productId, model, fallbackProductsFilter, maxRecommendations)
quote(id, storeId, userId, currencyCode, cultureName)
quotes(after, first, keyword, sort, storeId, userId, currencyCode, cultureName, filter)
```

---

## Mutations (grouped by domain)

### Cart Mutations

All cart mutations share a common base: `cartId, storeId!, cartName, userId!, currencyCode, cultureName, cartType` plus mutation-specific fields.

| Mutation | Command Type | Extra Fields |
|----------|-------------|--------------|
| `addItem` | `InputAddItemType!` | `productId!`, `quantity!`, `price`, `comment`, `dynamicProperties`, `configurationSections`, `createdDate` |
| `addItemsCart` | `InputAddItemsType!` | (bulk add) |
| `addBulkItemsCart` | `InputAddBulkItemsType!` | (bulk add) |
| `changeCartItemQuantity` | `InputChangeCartItemQuantityType!` | `lineItemId!`, `quantity!` |
| `changeCartItemsQuantity` | `InputChangeCartItemsQuantityType!` | (bulk quantity change) |
| `changeCartItemPrice` | `InputChangeCartItemPriceType!` | (price override) |
| `changeCartItemComment` | `InputChangeCartItemCommentType` | (comment) |
| `changeCartItemSelected` | `InputChangeCartItemSelectedType` | (select/unselect) |
| `selectCartItems` / `unSelectCartItems` | `InputChangeCartItemsSelectedType` | (bulk select) |
| `selectAllCartItems` / `unSelectAllCartItems` | `InputChangeAllCartItemsSelectedType` | (select all) |
| `removeCartItem` | `InputRemoveItemType!` | `lineItemId!` |
| `removeCartItems` | `InputRemoveItemsType!` | (bulk remove) |
| `addCoupon` | `InputAddCouponType!` | `couponCode!` |
| `removeCoupon` | `InputRemoveCouponType!` | `couponCode` |
| `addOrUpdateCartShipment` | `InputAddOrUpdateCartShipmentType!` | `shipment!` (InputShipmentType) |
| `addOrUpdateCartPayment` | `InputAddOrUpdateCartPaymentType!` | `payment!` (InputPaymentType) |
| `changeCartCurrency` | `InputChangeCartCurrencyType!` | `newCurrencyCode!` |
| `changeComment` | `InputChangeCommentType` | (cart comment) |
| `changePurchaseOrderNumber` | `InputChangePurchaseOrderNumber` | (PO number) |
| `mergeCart` | `InputMergeCartType!` | (merge anonymous cart) |
| `clearCart` | `InputClearCartType!` | (clear all items) |
| `removeCart` | `InputRemoveCartType!` | `cartId!`, `userId!` |
| `clearShipments` | `InputClearShipmentsType!` | |
| `clearPayments` | `InputClearPaymentsType!` | |
| `addOrUpdateCartAddress` | `InputAddOrUpdateCartAddressType!` | (address) |
| `removeCartAddress` | `InputRemoveCartAddressType!` | |
| `refreshCart` | `RefreshCartType!` | |
| `initializeCartPayment` | `InputInitializeCartPaymentType!` | |
| `moveToSavedForLater` / `moveFromSavedForLater` | `InputSaveForLaterType!` | |

### Order Mutations

| Mutation | Command Type |
|----------|-------------|
| `createOrderFromCart` | `InputCreateOrderFromCartType!` — fields: `cartId` |
| `changeOrderStatus` | `InputChangeOrderStatusType!` |
| `initializePayment` | `InputInitializePaymentType!` |
| `authorizePayment` | `InputAuthorizePaymentType!` |
| `addOrUpdateOrderPayment` | `InputAddOrUpdateOrderPaymentType!` |

### Profile Mutations

| Mutation | Command Type | Key Fields |
|----------|-------------|------------|
| `createOrganization` | `InputCreateOrganizationType!` | `name`, `addresses`, `dynamicProperties` — **NO storeId** |
| `updateOrganization` | `InputUpdateOrganizationType!` | |
| `createContact` | `InputCreateContactType!` | `firstName!`, `lastName!`, `phones`, `emails`, `groups` — **NO storeId** |
| `updateContact` | `InputUpdateContactType!` | `id!`, `firstName!`, `lastName!`, `phones`, `emails` — **NO storeId** |
| `deleteContact` | `InputDeleteContactType!` | |
| `updatePersonalData` | `InputUpdatePersonalDataType!` | `personalData!` (InputPersonalDataType: `email, fullName, firstName, lastName, middleName`) — **NO storeId** |
| `updateMemberAddresses` | `InputUpdateMemberAddressType!` | `memberId!`, `addresses!` |
| `deleteMemberAddresses` | `InputDeleteMemberAddressType!` | |
| `inviteUser` | `InputInviteUserType!` | |
| `registerByInvitation` | `InputRegisterByInvitationType!` | |
| `requestRegistration` | `InputRequestRegistrationType!` | |
| `changePassword` | `InputChangePasswordType` | |
| `sendVerifyEmail` | `InputSendVerifyEmailType` | |
| `confirmEmail` | `InputConfirmEmailType!` | |

---

## Key Return Types

### CartType (returned by cart query and all cart mutations)

Money fields (flat, NOT nested under `totals`):
`total`, `subTotal`, `subTotalWithTax`, `extendedPriceTotal`, `extendedPriceTotalWithTax`, `taxTotal`, `fee`, `feeWithTax`, `feeTotal`, `feeTotalWithTax`, `shippingPrice`, `shippingPriceWithTax`, `shippingTotal`, `shippingTotalWithTax`, `paymentPrice`, `paymentPriceWithTax`, `paymentTotal`, `paymentTotalWithTax`, `handlingTotal`, `handlingTotalWithTax`, `discountTotal`, `discountTotalWithTax`, `subTotalDiscount`, `subTotalDiscountWithTax`

Other fields: `id`, `name`, `status`, `storeId`, `channelId`, `hasPhysicalProducts`, `isAnonymous`, `customerId`, `customerName`, `organizationId`, `organizationName`, `comment`, `purchaseOrderNumber`, `currency`, `taxType`, `taxDetails`, `shipments`, `availableShippingMethods`, `payments`, `availablePaymentMethods`, `discounts`, `addresses`, `gifts`, `availableGifts`, `items` (LineItemType[]), `itemsCount`, `itemsQuantity`, `coupons` (CouponType[]), `dynamicProperties`, `validationErrors`, `type`, `warnings`

### LineItemType (cart line items)

Key fields: `id`, `productId`, `name`, `sku`, `quantity`, `imageUrl`, `isValid`, `validationErrors`, `selectedForCheckout`

Money fields (MoneyType): `listPrice`, `listPriceWithTax`, `placedPrice`, `placedPriceWithTax`, `salePrice`, `salePriceWithTax`, `extendedPrice`, `extendedPriceWithTax`, `discountAmount`, `discountAmountWithTax`, `discountTotal`, `discountTotalWithTax`, `listTotal`, `listTotalWithTax`, `taxTotal`

### MoneyType

Fields: `amount` (Decimal), `currency` (CurrencyType), `decimalDigits`, `formattedAmount`, `formattedAmountWithoutCurrency`, `formattedAmountWithoutPoint`, `formattedAmountWithoutPointAndCurrency`

**CurrencyType**: `name`, `code`, `symbol`, `exchangeRate`, `customFormatting`, `englishName`, `cultureName`

Usage: `subTotal { amount currency { code } formattedAmount }`

### CouponType

Fields: `code`, `isAppliedSuccessfully`

### Product

Key fields: `id`, `code`, `name`, `slug`, `imgSrc`, `productType`, `isConfigurable`, `outline`, `brandName`

Nested: `descriptions` (array), `price` (PriceType), `prices` (PriceType[]), `variations` (VariationType[]), `availabilityData` (AvailabilityData), `images`, `properties`, `keyProperties`, `assets`, `category`, `brand`, `seoInfo`, `associations`, `videos`, `rating`

### VariationType

Fields: `id`, `name`, `code`, `productType`, `minQuantity`, `maxQuantity`, `packSize`, `availabilityData`, `images`, `price`, `prices`, `properties`, `assets`, `outlines`, `slug`, `vendor`, `rating`

### AvailabilityData

Fields: `availableQuantity`, `isBuyable`, `isAvailable`, `isInStock`, `isActive`, `isTrackInventory`, `isEstimated`, `inventories`

### PriceType

Fields: `list` (MoneyType), `listWithTax`, `sale`, `saleWithTax`, `actual`, `actualWithTax`, `discountAmount`, `discountAmountWithTax`, `discountPercent`, `currency`, `startDate`, `endDate`, `tierPrices`, `discounts`, `pricelistId`, `pricelistName`, `minQuantity`

### ProductConnection (returned by `products` query)

Fields: `totalCount`, `pageInfo`, `edges`, `items` (Product[]), `filter_facets`, `range_facets` (RangeFacet[]), `term_facets` (TermFacet[]), `filters`

### TermFacet / FacetTermType

```graphql
term_facets { name label order facetType terms { term label count isSelected } }
```

### RangeFacet / FacetRangeType

```graphql
range_facets { name label order facetType ranges { from to count isSelected label includeFrom includeTo fromStr toStr min max total } statistics { ... } }
```

### CustomerOrderType

Key fields: `id`, `number`, `status`, `statusDisplayValue`, `createdDate`, `customerId`, `customerName`, `storeId`

Money fields: `total`, `subTotal`, `taxTotal`, `discountAmount`, `shippingTotal`, `paymentTotal`, etc.

Nested: `items` (OrderLineItemType[]), `addresses` (OrderAddressType[]), `inPayments` (PaymentInType[]), `shipments`, `coupons`, `discounts`, `dynamicProperties`, `availablePaymentMethods`

### PageType

Fields: `id`, `name`, `relativeUrl`, `permalink`, `content`

---

## Input Sub-Types

### InputShipmentType

Fields: `id`, `fulfillmentCenterId`, `height`, `length`, `measureUnit`, `shipmentMethodCode`, `shipmentMethodOption`, `volumetricWeight`, `weight`, `weightUnit`, `width`, `deliveryAddress` (InputAddressType), `currency`, `price`, `vendorId`, `comment`, `pickupLocationId`, `dynamicProperties`

### InputPaymentType

Fields: `id`, `outerId`, `paymentGatewayCode`, `billingAddress` (InputAddressType), `purpose`, `currency`, `price`, `amount`, `vendorId`, `comment`, `dynamicProperties`

### InputMemberAddressType

Fields: `id`, `city`, `countryCode`, `countryName`, `email`, `firstName`, `lastName`, `middleName`, `name`, `organization`, `phone`, `postalCode`, `regionId`, `regionName`, `zip`, `line1`, `line2`, `outerId`, `description`, `addressType`, `key`

### InputPersonalDataType

Fields: `email`, `fullName`, `firstName`, `lastName`, `middleName`

---

## Common Query Patterns

### Get/create cart
```graphql
query { cart(storeId: "B2B-store" currencyCode: "USD") { id itemsCount items { id productId quantity listPrice { amount } } } }
```

### Add item to cart
```graphql
mutation { addItem(command: { storeId: "B2B-store" productId: "SKU123" quantity: 1 currencyCode: "USD" }) { id itemsCount items { productId quantity listPrice { amount } } } }
```

### Search products
```graphql
query { products(storeId: "B2B-store" query: "laptop" currencyCode: "USD") { totalCount items { id name code imgSrc price { actual { amount } } } term_facets { name terms { term label count } } } }
```

### Create order from cart
```graphql
mutation { createOrderFromCart(command: { cartId: "cart-uuid" }) { id number status } }
```
