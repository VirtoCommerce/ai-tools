# GraphQL Fixtures Validation

**Validated at:** 2026-04-24T19:11:46.199Z
**Schema source:** https://vcst-qa.govirto.com/graphql
**Total:** 24 fixtures — 24 passed, 0 failed

## ✅ Passed Fixtures (24)

| Name | Kind | Role | Category | Required Vars | Last Validated | Known Issues |
|------|------|------|----------|---------------|----------------|--------------|
| addCoupon | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), COUPON_CODE (String) | 2026-04-24 | 1 noted |
| addItem | mutation | ORG_USER (or PUBLIC anon cart — userId may be anon guid) | cart | STORE_ID (String), USER_ID (String), PRODUCT_ID (String), QUANTITY (Int — via GraphQL $qty variable) | 2026-04-24 | 1 noted |
| addItemsCart | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String); cartItems via GraphQL $items variable (Array of InputNewCartItemType) | 2026-04-24 | 1 noted |
| cart | query | ORG_USER (authenticated) or PUBLIC (anonymous cart) | cart | STORE_ID (String), CURRENCY_CODE (String) | 2026-04-24 | 1 noted |
| carts | query | ORG_USER | cart | (none) | 2026-04-24 | 1 noted |
| changeCartItemQuantity | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String), QUANTITY via $qty variable (Int) | 2026-04-24 | 1 noted |
| contact | query | ORG_USER | profile | CONTACT_ID (String — memberId from me query) | 2026-04-24 | 1 noted |
| createOrganization | mutation | ORG_USER or higher (any authenticated user per observed behavior) | organization | ORG_NAME (String) | 2026-04-24 | 1 noted |
| createWishlist | mutation | ORG_USER | wishlist | STORE_ID (String), USER_ID (String), LIST_NAME (String) | 2026-04-24 | 1 noted |
| currentCustomerAddresses | query | ORG_USER | profile | (none) | 2026-04-24 | 1 noted |
| deleteMemberAddresses | mutation | ORG_USER | profile | MEMBER_ID (String), CITY, COUNTRY_CODE, LINE1, POSTAL_CODE (of the address to delete) | 2026-04-24 | 1 noted |
| me | query | ORG_USER | profile | (none) | 2026-04-24 | 1 noted |
| order-detail | query | ORG_USER | orders | ORDER_NUMBER (String) | 2026-04-24 | 1 noted |
| order-detail-full | query | ORG_USER | orders | ORDER_NUMBER (String) | 2026-04-24 | 3 noted |
| orders-list | query | ORG_USER | orders | (none) | 2026-04-24 | 1 noted |
| organization | query | ORG_USER | profile | ORG_ID (String) | 2026-04-24 | 1 noted |
| product | query | PUBLIC or ORG_USER | catalog | PRODUCT_ID (String), STORE_ID (String) | 2026-04-24 | 1 noted |
| products | query | PUBLIC or ORG_USER | catalog | STORE_ID (String), CATALOG_SUBTREE_ID (String — typically "fc596540-..." root of B2B virtual catalog) | 2026-04-24 | 1 noted |
| removeCartItem | mutation | ORG_USER | cart | STORE_ID (String), USER_ID (String), LINE_ITEM_ID (String) | 2026-04-24 | 1 noted |
| removeWishlist | mutation | ORG_USER (owner) | wishlist | LIST_ID (String) | 2026-04-24 | 1 noted |
| updateContact | mutation | ORG_USER | profile | CONTACT_ID (String), FIRST_NAME (String), LAST_NAME (String) | 2026-04-24 | 2 noted |
| updateMemberAddresses | mutation | ORG_USER (the member being updated, or admin) | profile | MEMBER_ID (String), CITY (String), COUNTRY_CODE (String), LINE1 (String), POSTAL_CODE (String) | 2026-04-24 | 2 noted |
| wishlist | query | ORG_USER | wishlist | LIST_ID (String) | 2026-04-24 | 1 noted |
| wishlists | query | ORG_USER | wishlist | (none) | 2026-04-24 | 1 noted |

## Known-Issues Summary

**addCoupon**:
- Invalid/expired coupon returns coupons[].isAppliedSuccessfully=false (no schema error)

**addItem**:
- (none)

**addItemsCart**:
- (none)

**cart**:
- (none)

**carts**:
- (none)

**changeCartItemQuantity**:
- Quantity must be >= 1; zero/negative should return validation error

**contact**:
- (none)

**createOrganization**:
- (none)

**createWishlist**:
- (none)

**currentCustomerAddresses**:
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

**product**:
- (none)

**products**:
- Without category.subtree filter, results are empty even though products exist (BL feedback)

**removeCartItem**:
- (none)

**removeWishlist**:
- (none)

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

