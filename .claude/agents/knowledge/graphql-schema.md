# GraphQL xAPI Schema Reference

> **Source**: Live introspection of `{{BACK_URL}}/graphql` (2026-05-27)
> **Purpose**: Agents MUST consult this file before writing or reviewing GraphQL queries/mutations.
> **Refresh**: `node scripts/refresh-graphql-schema.mjs` — run when schema may have changed.

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
10. **All cart mutations require `userId`**: `addItem`, `addOrUpdateCartShipment`, `addOrUpdateCartPayment`, `clearCart` — get from `me { id }`
11. **`addOrUpdateCartShipment` requires `price`**: `CartShipmentValidator` rejects if price doesn't match available shipping rate. Query `availableShippingMethods` first.

---

## Queries

### Cart

```
cartPickupLocations(after: String, first: Int, keyword: String, sort: String, cartId: String!, storeId: String!, cultureName: String!, facet: String, filter: String)
promotionCoupons(after: String, first: Int, keyword: String, sort: String, storeId: String!, userId: String, currencyCode: String, cultureName: String)
validateCoupon(cartId: String, storeId: String!, currencyCode: String!, userId: String!, cultureName: String, cartName: String, cartType: String, coupon: String!)
cart(cartId: String, storeId: String!, currencyCode: String!, cartType: String, cartName: String, userId: String, cultureName: String)
pricesSum(cartId: String!, storeId: String!, currencyCode: String!, cultureName: String, userId: String, lineItemIds: ?!)
getSavedForLater(storeId: String!, userId: String!, organizationId: String, currencyCode: String, cultureName: String)
pickupLocations(after: String, first: Int, keyword: String, sort: String, storeId: String)
carts(after: String, first: Int, sort: String, storeId: String, userId: String, currencyCode: String, cultureName: String, cartType: String, filter: String)
```

### Catalog

```
dynamicProperty(idOrName: String!, cultureName: String, objectType: String)
dynamicProperties(after: String, first: Int, cultureName: String, filter: String, sort: String, objectType: String)
productPickupLocations(after: String, first: Int, keyword: String, sort: String, productId: String!, storeId: String!, cultureName: String!)
product(id: String!, storeId: String!, userId: String, currencyCode: String, cultureName: String, previousOutline: String, custom: String)
category(id: String!, storeId: String!, userId: String, currencyCode: String, cultureName: String, previousOutline: String)
categories(after: String, first: Int, storeId: String!, userId: String, currencyCode: String, cultureName: String, previousOutline: String, query: String, filter: String, fuzzy: Boolean, fuzzyLevel: Int, facet: String, sort: String, categoryIds: String)
properties(after: String, first: Int, storeId: String!, types: PropertyType, filter: String, cultureName: String)
property(id: String!, cultureName: String)
fulfillmentCenter(id: String!)
fulfillmentCenters(after: String, first: Int, storeId: String, query: String, sort: String, fulfillmentCenterIds: String)
childCategories(storeId: String!, userId: String, cultureName: String, currencyCode: String, previousOutline: String, categoryId: String, maxLevel: Int, onlyActive: Boolean, productFilter: String)
brand(id: String!, storeId: String!, cultureName: String)
productSuggestions(storeId: String!, query: String, size: Int)
brands(after: String, first: Int, storeId: String!, userId: String, currencyCode: String, cultureName: String, sort: String, keyword: String)
products(after: String, first: Int, storeId: String!, userId: String, currencyCode: String, cultureName: String, query: String, previousOutline: String, filter: String, preserveUserQuery: Boolean, facet: String, fuzzy: Boolean, fuzzyLevel: Int, sort: String, productIds: String, selectedAddressId: String, selectedAddress: String, custom: String)
productConfiguration(configurableProductId: String!, storeId: String!, userId: String, cultureName: String, currencyCode: String)
```

### CMS

```
builderPage(storeId: String!, pageId: String!)
menu(storeId: String!, cultureName: String!, name: String!)
menus(storeId: String!, cultureName: String, keyword: String)
page(storeId: String!, cultureName: String, id: String!)
pages(after: String, first: Int, storeId: String!, keyword: String!, cultureName: String)
pageDocument(id: String!)
pageDocuments(after: String, first: Int, storeId: String!, keyword: String!, cultureName: String)
pageContext(domain: String, cultureName: String, permalink: String, organizationId: String, userId: String, storeId: String)
```

### Orders

```
order(id: String, number: String, cultureName: String)
payments(facet: String, filter: String, sort: String, cultureName: String, userId: String, after: String, first: Int)
orderLineItemStatuses(cultureName: String)
orderStatuses(cultureName: String)
paymentStatuses(cultureName: String)
orders(after: String, first: Int, sort: String, facet: String, filter: String, cultureName: String, userId: String)
organizationOrders(after: String, first: Int, sort: String, facet: String, filter: String, cultureName: String, organizationId: String)
shipmentStatuses(cultureName: String)
```

### Other

```
countries()
regions(countryId: String!)
store(storeId: String, cultureName: String, domain: String)
slugInfo(slug: String, permalink: String, storeId: String, userId: String, cultureName: String)
contract(id: String)
fileUploadOptions(scope: String)
newsArticleAuthor(authorId: String!)
newsArticle(id: String!, storeId: String!, languageCode: String!)
newsArticles(after: String, first: Int, keyword: String, sort: String, storeId: String!, languageCode: String!, userId: String, authorId: String, tags: String)
newsArticleTags(languageCode: String!)
fcmSettings()
pushMessages(after: String, first: Int, keyword: String, sort: String, unreadOnly: Boolean, withHidden: Boolean, cultureName: String)
tasks(after: String, first: Int, keyword: String, sort: String, responsibleId: String, storeId: String, startDueDate: DateTime, endDueDate: DateTime, isActive: Boolean, completed: Boolean)
loyaltyPointsHistory(after: String, first: Int, keyword: String, sort: String, userId: String, operationType: String)
loyaltyBalance(userId: String, orderId: String)
skyflowCards(storeId: String)
evaluateDynamicContent(storeId: String, placeName: String, categoryId: String, productId: String, cultureName: String, toDate: DateTime, tags: String, userGroups: String)
backInStockSubscriptions(after: String, first: Int, keyword: String, sort: String, storeId: String, productIds: String, isActive: Boolean)
configurationItems(cartId: String, lineItemId: String!, storeId: String!, currencyCode: String!, cartType: String, cartName: String, userId: String, cultureName: String)
recentlyBrowsed(storeId: String!, cultureName: String, currencyCode: String, maxProducts: Int)
recommendations(storeId: String!, userId: String, cultureName: String, currencyCode: String, previousOutline: String, productId: String, model: String, fallbackProductsFilter: String, maxRecommendations: Int)
searchHistory(storeId: String!, maxCount: Int!)
checkDuplicateAddress(memberId: String!, address: InputMemberAddressType!)
currentCustomerAddresses(after: String, first: Int, keyword: String, sort: String, countryCodes: String, regionIds: String, cities: String, ids: String)
canLeaveFeedback(storeId: String!, entityId: String!, entityType: String!)
customerReviews(after: String, first: Int, keyword: String, sort: String, storeId: String!, entityId: String!, entityType: String!, filter: String)
```

### Profile

```
organizationContracts(after: String, first: Int, organizationId: String!, storeId: String, vendorId: String, statuses: String, startDate: DateTime, endDate: DateTime)
me(userId: String)
organization(id: String!, userId: String)
contact(id: String!, userId: String)
vendor(id: String!, userId: String)
organizations(after: String, first: Int, searchPhrase: String, sort: String)
contacts(after: String, first: Int, searchPhrase: String, sort: String)
checkUsernameUniqueness(username: String!)
checkEmailUniqueness(email: String!)
validatePassword(password: String!)
user(id: String, userName: String, email: String, loginProvider: String, providerKey: String)
role(roleName: String!)
currentOrganizationAddresses(after: String, first: Int, keyword: String, sort: String, countryCodes: String, regionIds: String, cities: String, ids: String)
```

### Quotes

```
quoteAttachmentOptions()
quote(id: String, storeId: String, userId: String, currencyCode: String, cultureName: String)
quotes(after: String, first: Int, keyword: String, sort: String, storeId: String, userId: String, currencyCode: String, cultureName: String, filter: String)
```

### WhiteLabeling

```
whiteLabelingSettings(organizationId: String, userId: String, storeId: String, domain: String, cultureName: String)
```

### Wishlists

```
wishlist(listId: String!, cultureName: String)
sharedWishlist(sharingKey: String!)
wishlists(after: String, first: Int, storeId: String, userId: String, currencyCode: String, cultureName: String, scope: String, sort: String)
```

---

## Mutations

> **All mutations use `command` wrapper**: `mutation { name(command: { ...fields }) { ...return } }`

### Cart

| Mutation | Command Type |
|----------|-------------|
| `addItem` | `InputAddItemType` |
| `updateCartQuantity` | `InputUpdateCartQuantity` |
| `addGiftItems` | `InputAddGiftItemsType` |
| `rejectGiftItems` | `InputRejectGiftItemsType` |
| `clearCart` | `InputClearCartType` |
| `changeComment` | `InputChangeCommentType` |
| `changeCartItemPrice` | `InputChangeCartItemPriceType` |
| `changeCartItemQuantity` | `InputChangeCartItemQuantityType` |
| `changeCartItemsQuantity` | `InputChangeCartItemsQuantityType` |
| `changeCartConfiguredItem` | `InputChangeCartConfiguredItemType` |
| `changeCartItemComment` | `InputChangeCartItemCommentType` |
| `changeCartItemSelected` | `InputChangeCartItemSelectedType` |
| `selectCartItems` | `InputChangeCartItemsSelectedType` |
| `unSelectCartItems` | `InputChangeCartItemsSelectedType` |
| `selectAllCartItems` | `InputChangeAllCartItemsSelectedType` |
| `unSelectAllCartItems` | `InputChangeAllCartItemsSelectedType` |
| `removeCartItem` | `InputRemoveItemType` |
| `removeCartItems` | `InputRemoveItemsType` |
| `addCoupon` | `InputAddCouponType` |
| `removeCoupon` | `InputRemoveCouponType` |
| `removeShipment` | `InputRemoveShipmentType` |
| `addOrUpdateCartShipment` | `InputAddOrUpdateCartShipmentType` |
| `addOrUpdateCartPayment` | `InputAddOrUpdateCartPaymentType` |
| `mergeCart` | `InputMergeCartType` |
| `changeCartCurrency` | `InputChangeCartCurrencyType` |
| `removeCart` | `InputRemoveCartType` |
| `clearShipments` | `InputClearShipmentsType` |
| `clearPayments` | `InputClearPaymentsType` |
| `addOrUpdateCartAddress` | `InputAddOrUpdateCartAddressType` |
| `removeCartAddress` | `InputRemoveCartAddressType` |
| `addItemsCart` | `InputAddItemsType` |
| `addBulkItemsCart` | `InputAddBulkItemsType` |
| `addCartAddress` | `InputAddOrUpdateCartAddressType` |
| `updateCartDynamicProperties` | `InputUpdateCartDynamicPropertiesType` |
| `updateCartItemDynamicProperties` | `InputUpdateCartItemDynamicPropertiesType` |
| `updateCartPaymentDynamicProperties` | `InputUpdateCartPaymentDynamicPropertiesType` |
| `updateCartShipmentDynamicProperties` | `InputUpdateCartShipmentDynamicPropertiesType` |
| `refreshCart` | `RefreshCartType` |
| `addWishlistItem` | `InputAddWishlistItemType` |
| `updateWishListItems` | `InputUpdateWishlistItemsType` |
| `addWishlistBulkItem` | `InputAddWishlistBulkItemType` |
| `addWishlistItems` | `InputAddWishlistItemsType` |
| `removeWishlistItem` | `InputRemoveWishlistItemType` |
| `removeWishlistItems` | `InputRemoveWishlistItemsType` |
| `moveWishlistItem` | `InputMoveWishlistItemType` |
| `initializeCartPayment` | `InputInitializeCartPaymentType` |
| `addConfigurationItem` | `InputAddConfigurationItemType` |
| `addConfigurationItems` | `InputAddConfigurationItemsType` |
| `changeCartConfigurationItemSelected` | `InputChangeCartConfigurationItemSelectedType` |
| `createCartFromWishlist` | `InputCreateCartFromWishlistType` |
| `createConfiguredLineItem` | `InputCreateConfiguredLineItemCommand` |
| `moveFromSavedForLater` | `InputSaveForLaterType` |
| `moveToSavedForLater` | `InputSaveForLaterType` |
| `removeConfigurationItem` | `InputRemoveConfigurationItemType` |
| `removeConfigurationItems` | `InputRemoveConfigurationItemsType` |
| `selectAllCartConfigurationItems` | `InputChangeAllCartConfigurationItemsSelectedType` |
| `selectCartConfigurationItems` | `InputChangeCartConfigurationItemsSelectedType` |
| `unSelectAllCartConfigurationItems` | `InputChangeAllCartConfigurationItemsSelectedType` |
| `unSelectCartConfigurationItems` | `InputChangeCartConfigurationItemsSelectedType` |
| `updateConfigurationItem` | `InputUpdateConfigurationItemType` |
| `updateConfigurationItems` | `InputUpdateConfigurationItemsType` |
| `addQuoteItems` | `AddQuoteItemsCommandType` |
| `changeQuoteComment` | `ChangeQuoteCommentCommandType` |
| `changeQuoteItemQuantity` | `ChangeQuoteItemQuantityCommandType` |
| `createQuoteFromCart` | `CreateQuoteFromCartCommandType` |
| `removeQuoteItem` | `RemoveQuoteItemCommandType` |
| `initializePayment` | `InputInitializePaymentType` |
| `authorizePayment` | `InputAuthorizePaymentType` |

### Files

| Mutation | Command Type |
|----------|-------------|
| `deleteFile` | `DeleteFileCommandType` |

### Notifications

| Mutation | Command Type |
|----------|-------------|
| `addFcmToken` | `InputAddFcmTokenType` |
| `clearAllPushMessages` | `none` |
| `deleteFcmToken` | `InputDeleteFcmTokenType` |
| `markAllPushMessagesRead` | `none` |
| `markAllPushMessagesUnread` | `none` |
| `markPushMessageRead` | `InputMarkPushMessageReadType` |
| `markPushMessageUnread` | `InputMarkPushMessageUnreadType` |
| `confirmTask` | `ConfirmTaskCommandType` |
| `rejectTask` | `RejectTaskCommandType` |
| `pushHistoricalEvent` | `InputPushHistoricalEventType` |

### Orders

| Mutation | Command Type |
|----------|-------------|
| `changePurchaseOrderNumber` | `InputChangePurchaseOrderNumber` |
| `createOrderFromCart` | `InputCreateOrderFromCartType` |
| `changeOrderStatus` | `InputChangeOrderStatusType` |
| `updateOrderDynamicProperties` | `InputUpdateOrderDynamicPropertiesType` |
| `updateOrderItemDynamicProperties` | `InputUpdateOrderItemDynamicPropertiesType` |
| `updateOrderPaymentDynamicProperties` | `InputUpdateOrderPaymentDynamicPropertiesType` |
| `updateOrderShipmentDynamicProperties` | `InputUpdateOrderShipmentDynamicPropertiesType` |
| `addOrUpdateOrderPayment` | `InputAddOrUpdateOrderPaymentType` |

### Other

| Mutation | Command Type |
|----------|-------------|
| `activateBackInStockSubscription` | `ActivateBackInStockSubscriptionCommandType` |
| `deactivateBackInStockSubscription` | `DeactivateBackInStockSubscriptionCommandType` |
| `saveSearchQuery` | `InputSaveSearchQueryType` |
| `registerByInvitation` | `InputRegisterByInvitationType` |

### Payment

| Mutation | Command Type |
|----------|-------------|
| `deleteSkyflowCard` | `DeleteSkyflowCardCommandType` |

### Profile

| Mutation | Command Type |
|----------|-------------|
| `changeOrganizationLogo` | `InputChangeOrganizationLogoCommandType` |
| `updateMemberAddresses` | `InputUpdateMemberAddressType` |
| `deleteMemberAddresses` | `InputDeleteMemberAddressType` |
| `updateOrganization` | `InputUpdateOrganizationType` |
| `createOrganization` | `InputCreateOrganizationType` |
| `removeMemberFromOrganization` | `InputRemoveMemberFromOrganizationType` |
| `requestRegistration` | `InputRequestRegistrationType` |
| `createContact` | `InputCreateContactType` |
| `updateContact` | `InputUpdateContactType` |
| `deleteContact` | `InputDeleteContactType` |
| `updatePersonalData` | `InputUpdatePersonalDataType` |
| `updateMemberDynamicProperties` | `InputUpdateMemberDynamicPropertiesType` |
| `sendVerifyEmail` | `InputSendVerifyEmailType` |
| `confirmEmail` | `InputConfirmEmailType` |
| `resetPasswordByToken` | `InputResetPasswordByTokenType` |
| `changePassword` | `InputChangePasswordType` |
| `lockOrganizationContact` | `InputLockUnlockOrganizationContactType` |
| `unlockOrganizationContact` | `InputLockUnlockOrganizationContactType` |
| `inviteUser` | `InputInviteUserType` |
| `createUser` | `InputCreateUserType` |
| `updateUser` | `InputUpdateUserType` |
| `changeOrganizationContactRole` | `InputChangeOrganizationContactRoleType` |
| `deleteUsers` | `InputDeleteUserType` |
| `updateRole` | `InputUpdateRoleType` |
| `addAddressToFavorites` | `AddAddressToFavoritesCommandType` |
| `removeAddressFromFavorites` | `RemoveAddressFromFavoritesCommandType` |
| `sendPasswordResetEmail` | `SendPasswordResetEmailCommandType` |

### Quotes

| Mutation | Command Type |
|----------|-------------|
| `addQuoteAttachments` | `AddQuoteAttachmentsCommandType` |
| `approveQuoteRequest` | `ApproveQuoteCommandType` |
| `cancelQuoteRequest` | `CancelQuoteCommandType` |
| `createQuote` | `CreateQuoteCommandType` |
| `declineQuoteRequest` | `DeclineQuoteCommandType` |
| `deleteQuoteAttachments` | `DeleteQuoteAttachmentsCommandType` |
| `submitQuoteRequest` | `SubmitQuoteCommandType` |
| `updateQuoteAddresses` | `UpdateQuoteAddressesCommandType` |
| `updateQuoteAttachments` | `UpdateQuoteAttachmentsCommandType` |
| `updateQuoteDynamicProperties` | `UpdateQuoteDynamicPropertiesCommandType` |

### Reviews

| Mutation | Command Type |
|----------|-------------|
| `createReview` | `CreateReviewCommandType` |

### Wishlists

| Mutation | Command Type |
|----------|-------------|
| `createWishlist` | `InputCreateWishlistType` |
| `cloneWishlist` | `InputCloneWishlistType` |
| `changeWishlist` | `InputChangeWishlistType` |
| `removeWishlist` | `InputRemoveWishlistType` |

---

## Key Return Types

### CartType

Fields: `id`, `name`, `status`, `storeId`, `channelId`, `hasPhysicalProducts`, `isAnonymous`, `customerId`, `customerName`, `organizationId`, `organizationName`, `isRecuring`, `comment`, `purchaseOrderNumber`, `checkoutId`, `volumetricWeight`, `weightUnit`, `weight`, `total`, `subTotal`, `subTotalWithTax`, `extendedPriceTotal`, `extendedPriceTotalWithTax`, `currency`, `taxTotal`, `taxPercentRate`, `taxType`, `taxDetails`, `fee`, `feeWithTax`, `feeTotal`, `feeTotalWithTax`, `shippingPrice`, `shippingPriceWithTax`, `shippingTotal`, `shippingTotalWithTax`, `shipments`, `availableShippingMethods`, `paymentPrice`, `paymentPriceWithTax`, `paymentTotal`, `paymentTotalWithTax`, `payments`, `availablePaymentMethods`, `handlingTotal`, `handlingTotalWithTax`, `discountTotal`, `discountTotalWithTax`, `subTotalDiscount`, `subTotalDiscountWithTax`, `discounts`, `addresses`, `gifts`, `availableGifts`, `items`, `itemsCount`, `itemsQuantity`, `coupons`, `dynamicProperties`, `validationErrors`, `type`, `warnings`

### LineItemType

Fields: `product`, `inStockQuantity`, `warehouseLocation`, `isValid`, `validationErrors`, `catalogId`, `categoryId`, `createdDate`, `height`, `id`, `imageUrl`, `isGift`, `isReadOnly`, `isReccuring`, `selectedForCheckout`, `languageCode`, `length`, `measureUnit`, `name`, `productOuterId`, `note`, `objectType`, `productId`, `productType`, `quantity`, `requiredShipping`, `shipmentMethodCode`, `sku`, `taxPercentRate`, `taxType`, `thumbnailImageUrl`, `volumetricWeight`, `weight`, `weightUnit`, `width`, `fulfillmentCenterId`, `fulfillmentCenterName`, `discounts`, `taxDetails`, `discountAmount`, `discountAmountWithTax`, `discountTotal`, `discountTotalWithTax`, `extendedPrice`, `extendedPriceWithTax`, `listPrice`, `listPriceWithTax`, `listTotal`, `listTotalWithTax`, `showPlacedPrice`, `placedPrice`, `placedPriceWithTax`, `salePrice`, `salePriceWithTax`, `taxTotal`, `dynamicProperties`, `vendor`, `configurationItems`

### CustomerOrderType

Fields: `id`, `operationType`, `parentOperationId`, `number`, `isApproved`, `status`, `statusDisplayValue`, `comment`, `outerId`, `isCancelled`, `cancelledDate`, `cancelReason`, `objectType`, `customerId`, `customerName`, `channelId`, `storeId`, `storeName`, `organizationId`, `organizationName`, `employeeId`, `employeeName`, `shoppingCartId`, `isPrototype`, `subscriptionNumber`, `subscriptionId`, `purchaseOrderNumber`, `taxType`, `taxPercentRate`, `languageCode`, `createdDate`, `createdBy`, `modifiedDate`, `modifiedBy`, `currency`, `total`, `taxTotal`, `discountAmount`, `subTotal`, `subTotalWithTax`, `subTotalDiscount`, `subTotalDiscountWithTax`, `subTotalTaxTotal`, `shippingTotal`, `shippingTotalWithTax`, `shippingSubTotal`, `shippingSubTotalWithTax`, `shippingDiscountTotal`, `shippingDiscountTotalWithTax`, `shippingTaxTotal`, `paymentTotal`, `paymentTotalWithTax`, `paymentSubTotal`, `paymentSubTotalWithTax`, `paymentDiscountTotal`, `paymentDiscountTotalWithTax`, `paymentTaxTotal`, `discountTotal`, `discountTotalWithTax`, `fee`, `feeWithTax`, `feeTotal`, `feeTotalWithTax`, `addresses`, `items`, `inPayments`, `shipments`, `taxDetails`, `dynamicProperties`, `coupons`, `discounts`, `availablePaymentMethods`

### Product

Fields: `id`, `code`, `catalogId`, `productType`, `minQuantity`, `maxQuantity`, `packSize`, `relevanceScore`, `isConfigurable`, `outline`, `slug`, `name`, `seoInfo`, `descriptions`, `description`, `category`, `imgSrc`, `outerId`, `gtin`, `manufacturerPartNumber`, `weightUnit`, `weight`, `measureUnit`, `height`, `width`, `length`, `brandName`, `brand`, `masterVariation`, `variations`, `hasVariations`, `availabilityData`, `images`, `price`, `prices`, `minVariationPrice`, `properties`, `keyProperties`, `assets`, `outlines`, `breadcrumbs`, `vendor`, `rating`, `inWishlist`, `wishlistIds`, `isPurchased`, `associations`, `videos`

### VariationType

Fields: `id`, `name`, `code`, `productType`, `minQuantity`, `maxQuantity`, `packSize`, `availabilityData`, `images`, `price`, `prices`, `properties`, `assets`, `outlines`, `slug`, `vendor`, `rating`

### CouponType

Fields: `code`, `isAppliedSuccessfully`

### MoneyType

Fields: `amount`, `currency`, `decimalDigits`, `formattedAmount`, `formattedAmountWithoutCurrency`, `formattedAmountWithoutPoint`, `formattedAmountWithoutPointAndCurrency`

### CurrencyType

Fields: `name`, `code`, `symbol`, `exchangeRate`, `customFormatting`, `englishName`, `cultureName`

### PriceType

Fields: `list`, `listWithTax`, `sale`, `saleWithTax`, `actual`, `actualWithTax`, `discountAmount`, `discountAmountWithTax`, `discountPercent`, `currency`, `startDate`, `endDate`, `tierPrices`, `discounts`, `pricelistId`, `pricelistName`, `minQuantity`

### ProductConnection

Fields: `totalCount`, `pageInfo`, `edges`, `items`, `filter_facets`, `range_facets`, `term_facets`, `filters`

### TermFacet

Fields: `name`, `label`, `order`, `facetType`, `terms`

### FacetTermType

Fields: `term`, `count`, `isSelected`, `label`

### RangeFacet

Fields: `name`, `label`, `order`, `facetType`, `ranges`, `statistics`

### FacetRangeType

Fields: `count`, `from`, `includeFrom`, `fromStr`, `max`, `min`, `to`, `includeTo`, `toStr`, `total`, `label`, `isSelected`

### PageType

Fields: `id`, `name`, `relativeUrl`, `permalink`, `content`

### AvailabilityData

Fields: `availableQuantity`, `isBuyable`, `isAvailable`, `isInStock`, `isActive`, `isTrackInventory`, `isEstimated`, `inventories`

---

## Key Input Types

### InputAddItemType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `productId: String (required)`, `quantity: Int (required)`, `price: Decimal`, `comment: String`, `dynamicProperties: InputDynamicPropertyValueType`, `configurationSections: ConfigurationSectionInput`, `createdDate: DateTime`

### InputRemoveItemType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `lineItemId: String (required)`

### InputChangeCartItemQuantityType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `lineItemId: String (required)`, `quantity: Int (required)`

### InputAddCouponType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `couponCode: String (required)`

### InputRemoveCouponType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `couponCode: String`

### InputCreateOrderFromCartType

Fields: `cartId: String`

### InputChangeCartCurrencyType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `newCurrencyCode: String (required)`

### InputAddOrUpdateCartShipmentType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `shipment: InputShipmentType (required)`

### InputAddOrUpdateCartPaymentType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`, `payment: InputPaymentType (required)`

### InputCreateOrganizationType

Fields: `name: String`, `addresses: InputMemberAddressType`, `dynamicProperties: InputDynamicPropertyValueType`

### InputUpdateContactType

Fields: `id: String (required)`, `name: String`, `memberType: String`, `addresses: InputMemberAddressType`, `phones: String`, `emails: String`, `groups: String`, `dynamicProperties: InputDynamicPropertyValueType`, `fullName: String`, `firstName: String (required)`, `lastName: String (required)`, `middleName: String`, `salutation: String`, `photoUrl: String`, `timeZone: String`, `defaultLanguage: String`, `currencyCode: String`, `about: String`, `selectedAddressId: String`, `organizations: String`

### InputCreateContactType

Fields: `id: String`, `name: String`, `memberType: String`, `addresses: InputMemberAddressType`, `phones: String`, `emails: String`, `groups: String`, `dynamicProperties: InputDynamicPropertyValueType`, `fullName: String`, `firstName: String (required)`, `lastName: String (required)`, `middleName: String`, `salutation: String`, `photoUrl: String`, `timeZone: String`, `defaultLanguage: String`, `currencyCode: String`, `about: String`, `selectedAddressId: String`, `organizations: String`

### InputUpdatePersonalDataType

Fields: `personalData: InputPersonalDataType (required)`

### InputUpdateMemberAddressType

Fields: `memberId: String (required)`, `addresses: ? (required)`

### InputRemoveCartType

Fields: `cartId: String (required)`, `userId: String (required)`

### InputClearCartType

Fields: `cartId: String`, `storeId: String (required)`, `cartName: String`, `userId: String (required)`, `currencyCode: String`, `cultureName: String`, `cartType: String`

### InputShipmentType

Fields: `id: OptionalString`, `fulfillmentCenterId: OptionalString`, `height: OptionalNullableDecimal`, `length: OptionalNullableDecimal`, `measureUnit: OptionalString`, `shipmentMethodCode: OptionalString`, `shipmentMethodOption: OptionalString`, `volumetricWeight: OptionalNullableDecimal`, `weight: OptionalNullableDecimal`, `weightUnit: OptionalString`, `width: OptionalNullableDecimal`, `deliveryAddress: InputAddressType`, `currency: OptionalString`, `price: OptionalDecimal`, `vendorId: OptionalString`, `comment: OptionalString`, `pickupLocationId: OptionalString`, `dynamicProperties: InputDynamicPropertyValueType`

### InputPaymentType

Fields: `id: OptionalString`, `outerId: OptionalString`, `paymentGatewayCode: OptionalString`, `billingAddress: InputAddressType`, `purpose: OptionalString`, `currency: OptionalString`, `price: OptionalDecimal`, `amount: OptionalDecimal`, `vendorId: OptionalString`, `comment: OptionalString`, `dynamicProperties: InputDynamicPropertyValueType`

### InputMemberAddressType

Fields: `id: String`, `city: String (required)`, `countryCode: String (required)`, `countryName: String`, `email: String`, `firstName: String`, `key: String`, `lastName: String`, `line1: String (required)`, `line2: String`, `middleName: String`, `name: String`, `organization: String`, `phone: String`, `postalCode: String (required)`, `regionId: String`, `regionName: String`, `zip: String`, `outerId: String`, `description: String`, `addressType: Int`

### InputPersonalDataType

Fields: `email: String`, `fullName: String`, `firstName: String`, `lastName: String`, `middleName: String`

---

## Common Query Patterns

### Get/create cart
```graphql
query { cart(storeId: "B2B-store" currencyCode: "USD") { id itemsCount items { id productId quantity listPrice { amount } } } }
```

### Add item to cart
```graphql
mutation { addItem(command: { storeId: "B2B-store" userId: "<USER_ID>" productId: "<PRODUCT_ID>" quantity: 1 currencyCode: "USD" cultureName: "en-US" }) { id itemsCount items { productId quantity listPrice { amount } } } }
```
> **Note:** `userId` is required. Get from `query { me { id } }`.

### Search products
```graphql
query { products(storeId: "B2B-store" query: "laptop" currencyCode: "USD") { totalCount items { id name code imgSrc price { actual { amount } } } term_facets { name terms { term label count } } } }
```

### Full checkout flow (verified — see order-creation-matrix.md)
```graphql
# 1. Get userId
query { me { id } }
# 2. Add item (userId required)
mutation { addItem(command: { storeId: "B2B-store" userId: "<USER_ID>" productId: "<PRODUCT_ID>" quantity: 1 currencyCode: "USD" cultureName: "en-US" }) { id } }
# 3. Set shipment (price MUST match rate)
mutation { addOrUpdateCartShipment(command: { storeId: "B2B-store" userId: "<USER_ID>" currencyCode: "USD" cultureName: "en-US" shipment: { shipmentMethodCode: "FixedRate" shipmentMethodOption: "Ground" price: 150 deliveryAddress: { city: "New York" countryCode: "US" countryName: "United States" firstName: "Test" lastName: "User" line1: "123 Test St" postalCode: "10001" } } }) { id } }
# 4. Set payment
mutation { addOrUpdateCartPayment(command: { storeId: "B2B-store" userId: "<USER_ID>" currencyCode: "USD" cultureName: "en-US" payment: { paymentGatewayCode: "DefaultManualPaymentMethod" } }) { id } }
# 5. Create order
mutation { createOrderFromCart(command: { cartId: "<CART_ID>" }) { id number status } }
```
