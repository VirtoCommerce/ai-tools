# BUG: addItem mutation silently accepts invalid productId without validation error

## Status: CLOSED (Cannot Reproduce)

**Original Severity:** High
**Closure Reason:** Reproduction attempt on 2026-04-17 shows `addItem` correctly returns `CART_PRODUCT_UNAVAILABLE` error for invalid productId. The item is NOT added to cart. Either the original regression agent misreported, or behavior differs by user context. See `reports/bugs/evidence/bug-reproduction-2026-04-17.md` for full evidence.
**Component:** Cart / GraphQL xAPI
**Browser:** Edge (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1019.0
**Theme Version:** 2.46.0-pr-2225-572f-572f0087
**Module Versions:** VirtoCommerce.XCart 3.1007.0-pr-105-3ec5, VirtoCommerce.Cart 3.1003.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-17
**Reported By:** QA Agent (REG-2026-04-17-0900, test CFG-GQL-008)

## Steps to Reproduce
1. Authenticate as a storefront user via GraphQL
2. Execute `addItem` mutation with a non-existent productId: `00000000-0000-0000-0000-000000000000`
3. Include valid storeId, userId, currencyCode, cultureName, quantity=1
4. Inspect the response for `errors[]` and `validationErrors[]`

## Expected Result
The `addItem` mutation should return a non-empty `errors[]` array with a descriptive error message (e.g., "Product not found" or "Invalid productId"). The invalid item should NOT be added to the cart. Per VC docs: "The addItem mutation validates products, adds them to the shopping cart..."

## Actual Result
The mutation returns successfully with **no errors**. The item with the invalid productId is silently added to the cart. No `errors[]`, no `validationErrors[]`. The cart now contains a phantom line item with no valid product backing it.

## Evidence
- Request: `addItem` with `productId=00000000-0000-0000-0000-000000000000`
- Response: `data.addItem` returned successfully, item added, no errors array
- Console errors: none
- Network errors: HTTP 200 (GraphQL always returns 200)
- HAR file: not captured
- Regression test: CFG-GQL-008 in suite 072c, run REG-2026-04-17-0900

## Root Cause Analysis
- Source file: `VirtoCommerce/vc-module-x-cart/src/VirtoCommerce.XCart.Core/CartAggregate.cs` — `AddItemAsync` method likely does not validate productId existence before adding to cart
- Suspected cause: Missing product existence check in the addItem pipeline. The mutation accepts any string as productId without verifying it maps to a real product in the catalog.
- Recent changes: XCart module is on PR-105 branch (3.1007.0-pr-105-3ec5) — configurable products feature may have relaxed validation
- App Insights: not queried (API-level issue, not a server exception)

## Impact
- **Security:** Attackers could fill carts with phantom products, potentially causing issues at checkout/order processing
- **Data integrity:** Cart contains invalid line items that have no product backing — price calculations, promotions, and checkout may fail silently
- **User experience:** If a product is deleted or unpublished while in a user's session, the invalid item persists without warning

## References
- JIRA: not filed
- VC Docs: "The addItem mutation validates products" (https://github.com/virtocommerce/vc-docs — Cart/mutations/add-item.md)
- Regression: REG-2026-04-17-0900 suite-072c-results.json
