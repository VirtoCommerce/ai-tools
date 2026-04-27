# GraphQL Fixtures Validation

**Validated at:** 2026-04-27T09:14:17.010Z
**Schema source:** https://vcst-qa.govirto.com/graphql
**Total:** 54 fixtures — 54 passed, 0 failed

## ✅ Passed Fixtures (54)

| Name | Kind | Role | Category | Required Vars | Last Validated | Known Issues |
|------|------|------|----------|---------------|----------------|--------------|
| addConfigurationItem | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| addConfigurationItems | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| addCoupon | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), COUPON_CODE (String) | 2026-04-24 | 1 noted |
| addItem | mutation | ORG_USER (or PUBLIC anon cart — userId may be anon guid) | cart | STORE_ID (String), USER_ID (String), PRODUCT_ID (String), QUANTITY (Int — via GraphQL $qty variable) | 2026-04-24 | 1 noted |
| addItemsCart | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String); cartItems via GraphQL $items variable (Array of InputNewCartItemType) | 2026-04-24 | 1 noted |
| addOrUpdateCartPayment | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| addOrUpdateCartShipment | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| addWishlistItem | mutation | ORG_USER | wishlist | LIST_ID (String), PRODUCT_ID (String) | 2026-04-27 | 1 noted |
| brand | query | PUBLIC or ORG_USER | catalog | STORE_ID (String), BRAND_ID (String) | 2026-04-27 | 1 noted |
| brands | query | PUBLIC or ORG_USER | catalog | STORE_ID (String) | 2026-04-27 | 1 noted |
| cart | query | ORG_USER (authenticated) or PUBLIC (anonymous cart) | cart | STORE_ID (String), CURRENCY_CODE (String) | 2026-04-24 | 1 noted |
| carts | query | ORG_USER | cart | (none) | 2026-04-24 | 1 noted |
| categories | query | PUBLIC or ORG_USER | catalog | STORE_ID (String) | 2026-04-27 | 1 noted |
| category | query | PUBLIC or ORG_USER | catalog | STORE_ID (String), CATEGORY_ID (String) | 2026-04-27 | 1 noted |
| changeCartConfiguredItem | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| changeCartItemQuantity | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String), QUANTITY via $qty variable (Int) | 2026-04-24 | 1 noted |
| clearCart | mutation | ORG_USER (or PUBLIC anon cart) | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| configurationItems | query | ORG_USER | configurable-products | STORE_ID (String), CURRENCY_CODE (String, e.g. "USD"), LINE_ITEM_ID (String — capture from cart line item) | 2026-04-27 | 1 noted |
| contact | query | ORG_USER | profile | CONTACT_ID (String — memberId from me query) | 2026-04-24 | 1 noted |
| createCartFromWishlist | mutation | ORG_USER | wishlist | LIST_ID (String — capture from wishlists query) | 2026-04-27 | 1 noted |
| createConfiguredLineItem | mutation | PUBLIC or ORG_USER | configurable-products | STORE_ID (String — passed inline in command), CONFIGURABLE_PRODUCT_ID (String) | 2026-04-27 | 1 noted |
| createOrderFromCart | mutation | ORG_USER | order | CART_ID (String — capture from earlier cart query/mutation) | 2026-04-27 | 1 noted |
| createOrganization | mutation | ORG_USER or higher (any authenticated user per observed behavior) | organization | ORG_NAME (String) | 2026-04-24 | 1 noted |
| createWishlist | mutation | ORG_USER | wishlist | STORE_ID (String), USER_ID (String), LIST_NAME (String) | 2026-04-24 | 1 noted |
| currentCustomerAddresses | query | ORG_USER | profile | (none) | 2026-04-24 | 1 noted |
| currentOrganizationAddresses | query | ORG_USER | profile | (none) | 2026-04-27 | 1 noted |
| deleteMemberAddresses | mutation | ORG_USER | profile | MEMBER_ID (String), CITY, COUNTRY_CODE, LINE1, POSTAL_CODE (of the address to delete) | 2026-04-24 | 1 noted |
| me | query | ORG_USER | profile | (none) | 2026-04-24 | 1 noted |
| order-detail | query | ORG_USER | orders | ORDER_NUMBER (String) | 2026-04-24 | 1 noted |
| order-detail-full | query | ORG_USER | orders | ORDER_NUMBER (String) | 2026-04-24 | 3 noted |
| orders-list | query | ORG_USER | orders | (none) | 2026-04-24 | 1 noted |
| organization | query | ORG_USER | profile | ORG_ID (String) | 2026-04-24 | 1 noted |
| pages | query | PUBLIC or ORG_USER | cms | STORE_ID (String) | 2026-04-27 | 1 noted |
| product | query | PUBLIC or ORG_USER | catalog | PRODUCT_ID (String), STORE_ID (String) | 2026-04-24 | 1 noted |
| productConfiguration | query | PUBLIC or ORG_USER | configurable-products | STORE_ID (String), CONFIGURABLE_PRODUCT_ID (String — e.g. CFG-013 GUID c972b4d0-25c2-4d7c-8a18-9360a8889bc3) | 2026-04-27 | 1 noted |
| products | query | PUBLIC or ORG_USER | catalog | STORE_ID (String), CATALOG_SUBTREE_ID (String — typically "fc596540-..." root of B2B virtual catalog) | 2026-04-24 | 1 noted |
| promotionCoupons | query | ORG_USER | marketing | (none) | 2026-04-27 | 1 noted |
| removeCart | mutation | ORG_USER | cart | USER_ID (String), CART_ID (String — capture from earlier cart query) | 2026-04-27 | 1 noted |
| removeCartItem | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-24 | 1 noted |
| removeConfigurationItem | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| removeConfigurationItems | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| removeCoupon | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), COUPON_CODE (String) | 2026-04-27 | 1 noted |
| removeWishlist | mutation | ORG_USER (owner) | wishlist | LIST_ID (String) | 2026-04-24 | 1 noted |
| selectAllCartItems | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| selectCartItems | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| slugInfo | query | PUBLIC or ORG_USER | catalog | STORE_ID (String) | 2026-04-27 | 1 noted |
| unSelectAllCartItems | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| unSelectCartItems | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String) | 2026-04-27 | 1 noted |
| updateConfigurationItem | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| updateConfigurationItems | mutation | ORG_USER | configurable-products | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-27 | 1 noted |
| updateContact | mutation | ORG_USER | profile | CONTACT_ID (String), FIRST_NAME (String), LAST_NAME (String) | 2026-04-24 | 2 noted |
| updateMemberAddresses | mutation | ORG_USER (the member being updated, or admin) | profile | MEMBER_ID (String), CITY (String), COUNTRY_CODE (String), LINE1 (String), POSTAL_CODE (String) | 2026-04-24 | 2 noted |
| wishlist | query | ORG_USER | wishlist | LIST_ID (String) | 2026-04-24 | 1 noted |
| wishlists | query | ORG_USER | wishlist | (none) | 2026-04-24 | 1 noted |

## Known-Issues Summary

**addConfigurationItem**:
- (none)

**addConfigurationItems**:
- (none)

**addCoupon**:
- Invalid/expired coupon returns coupons[].isAppliedSuccessfully=false (no schema error)

**addItem**:
- (none)

**addItemsCart**:
- (none)

**addOrUpdateCartPayment**:
- (none)

**addOrUpdateCartShipment**:
- price MUST match available shipping rate (CartShipmentValidator). Query availableShippingMethods first.

**addWishlistItem**:
- (none)

**brand**:
- Resolver may return synthetic object (id=zero-guid, other fields null) for invalid ID — test cases must accept either null or synthetic.

**brands**:
- The brands query uses "keyword" arg (not "query" like products)

**cart**:
- (none)

**carts**:
- (none)

**categories**:
- (none)

**category**:
- (none)

**changeCartConfiguredItem**:
- REPLACE semantics for both quantity and configurationSections; pass desired final state.

**changeCartItemQuantity**:
- Quantity must be >= 1; zero/negative should return validation error

**clearCart**:
- (none)

**configurationItems**:
- (none)

**contact**:
- (none)

**createCartFromWishlist**:
- (none)

**createConfiguredLineItem**:
- Returns a ConfigurationLineItemType (preview) — does NOT mutate the cart. Use addItem or addConfigurationItem to persist.

**createOrderFromCart**:
- Creates a real order in the system; no easy teardown via runner — use sparingly or against disposable accounts.

**createOrganization**:
- (none)

**createWishlist**:
- (none)

**currentCustomerAddresses**:
- (none)

**currentOrganizationAddresses**:
- (none)

**deleteMemberAddresses**:
- Deletion matching key is the full address object — pass exact values

**me**:
- (none)

**order-detail**:
- (none)

**order-detail-full**:
- order.coupons: resolver returns INVALID_OPERATION on some orders (server bug, not schema drift)
- order.currency.name: resolver returns INVALID_OPERATION (server bug, not schema drift)
- Both bugs are separate from schema coverage — fields ARE in schema, resolver fails at runtime

**orders-list**:
- (none)

**organization**:
- (none)

**pages**:
- (none)

**product**:
- (none)

**productConfiguration**:
- cultureName description in schema says "Currency code" — schema description bug; correct semantics are culture (e.g. "en-US")

**products**:
- Without category.subtree filter, results are empty even though products exist (BL feedback)

**promotionCoupons**:
- (none)

**removeCart**:
- Returns Boolean directly (no nested object); destination assertion is data.removeCart = true|false.

**removeCartItem**:
- (none)

**removeConfigurationItem**:
- The required `configurationSection` input identifies WHICH section to remove (by sectionId/type); option/customText/fileUrls fields are ignored.

**removeConfigurationItems**:
- (none)

**removeCoupon**:
- Removing a coupon that was never applied returns 200 OK (silent no-op) by design — not an error.

**removeWishlist**:
- (none)

**selectAllCartItems**:
- (none)

**selectCartItems**:
- Idempotent on already-selected items (does NOT error).

**slugInfo**:
- (none)

**unSelectAllCartItems**:
- (none)

**unSelectCartItems**:
- Invalid lineItemId should be a graceful no-op (preserve real items). HTTP 500 = bug.

**updateConfigurationItem**:
- REPLACE semantics — pass full desired ConfigurationSectionInput each call.

**updateConfigurationItems**:
- REPLACE semantics — pass full desired list each call.

**updateContact**:
- BL: EnableNoHtmlTagsValidation rejects HTML in phones
- BL: MaxLength(64) on phones

**updateMemberAddresses**:
- BL: EnableNoHtmlTagsValidation applies to city/line1/line2 (XSS rejected)
- Semantics are REPLACE (pass full desired list each call)

**wishlist**:
- (none)

**wishlists**:
- (none)

