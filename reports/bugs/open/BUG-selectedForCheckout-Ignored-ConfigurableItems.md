# BUG: selectedForCheckout flag ignored for configurable product items — pricing not recalculated

## Status: CONFIRMED

**Severity:** High
**Component:** Cart / GraphQL xAPI / Configurable Products
**Browser:** Edge (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1019.0
**Theme Version:** 2.46.0-pr-2225-572f-572f0087
**Module Versions:** VirtoCommerce.XCart 3.1007.0-pr-105-3ec5, VirtoCommerce.Cart 3.1003.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-17
**Reported By:** QA Agent (REG-2026-04-17-0900, test CFG-GQL-009)

## Steps to Reproduce
1. Add a configurable product (Bike with options, $350 base) to cart with two configuration options: Seat ($45) and Rear wheel ($22 x qty 2 = $44)
2. Note the total: $417 ($350 + $45 + $22)
3. Execute `changeCartConfiguredItem` mutation setting `selectedForCheckout: false` for the Rear wheel configuration item
4. Query the cart and check the `selectedForCheckout` flag on each configuration item
5. Check the line item total price

## Expected Result
- Rear wheel configuration item should show `selectedForCheckout: false`
- Cart line item price should recalculate to $395 ($350 + $45, excluding the deselected Rear wheel $22)
- Only selected-for-checkout items contribute to the order total

## Actual Result
- **Both** configuration items still show `selectedForCheckout: true` — the flag change was silently ignored
- Cart line item price remains **$417** (unchanged)
- The `selectedForCheckout` flag is not propagated through the `changeCartConfiguredItem` mutation for configurable product items

## Evidence

**Full reproduction:** `reports/bugs/evidence/bug-reproduction-2026-04-17.md` (Bug 3 section)

### Issue 3a: `selectedForCheckout: false` in option input silently ignored

```graphql
mutation changeCartConfiguredItem($command: InputChangeCartConfiguredItemType!) {
  changeCartConfiguredItem(command: $command) {
    id
    items { id name selectedForCheckout configurationItems { id quantity product { id name } } }
    validationErrors { errorCode errorMessage objectId objectType }
  }
}
```
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US", "currencyCode": "USD",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "configurationSections": [{
      "sectionId": "29f2514c-51c6-43df-bba4-dd2db82240e4",
      "type": "Product",
      "option": {
        "productId": "e5df66a5-4fd5-48f4-a290-481f59807082",
        "quantity": 1,
        "selectedForCheckout": false
      }
    }]
  }
}
```

**Response:** Parent `selectedForCheckout: true` (unchanged). `selectedForCheckout: false` in option input silently ignored.

### Issue 3b: Parent deselect does NOT cascade to configurationItems

```graphql
mutation changeCartItemSelected($command: InputChangeCartItemSelectedType!) {
  changeCartItemSelected(command: $command) {
    id
    items { id name selectedForCheckout configurationItems { id name selectedForCheckout } }
    validationErrors { errorCode errorMessage }
  }
}
```
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US", "currencyCode": "USD",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "selectedForCheckout": false
  }
}
```

**Response:**
```json
{
  "data": {
    "changeCartItemSelected": {
      "items": [{
        "id": "de529a87-26ba-41f0-aff9-875353e5cf36",
        "name": "Bike with options",
        "selectedForCheckout": false,
        "configurationItems": [{
          "id": "4d56070a-bf54-4d64-a055-a418baefd23a",
          "name": "Seat",
          "selectedForCheckout": true
        }]
      }]
    }
  }
}
```

**Inconsistent state:** Parent=false, Child Seat=true. No cascade.

### Schema Introspection Evidence

**ConfigurableProductOptionInput (input):**
```
- productId: String! (required)
- quantity: Int! (required)
- selectedForCheckout: Boolean (OPTIONAL — field EXISTS but is SILENTLY IGNORED by backend)
```

**CartConfigurationItemType (output):**
```
- selectedForCheckout: Boolean! (NON-NULL — field is always returned, defaults to true)
```

**InputChangeCartItemSelectedType (input):**
```
- lineItemId: String! — targets parent line items ONLY
- selectedForCheckout: Boolean! — no mechanism to target individual configurationItems
```

The schema defines `selectedForCheckout` on both input and output types for configurationItems, but **no code path processes the input value** and **no mutation can target individual config items**.

## Root Cause Analysis
- `ConfigurableProductOptionInput.selectedForCheckout` exists in schema but the `ChangeCartConfiguredItem` handler in `CartAggregate.cs` does not map it to the persisted `ConfigurationItem.SelectedForCheckout`
- `changeCartItemSelected` mutation only supports `lineItemId` (parent level) — no `configurationItemId` parameter exists
- `CartValidator.ValidateConfiguredLineItems` (in PR #105) READS `SelectedForCheckout` from config items to determine required sections, proving the field is designed to be functional — but there's no write path
- **Not from PR #105** — PR only reads the field during validation, doesn't introduce the missing write path
- This is a **feature implementation gap**: the schema promises `selectedForCheckout` control on config items but the backend never processes it

## Impact
- **Checkout pricing:** Users cannot exclude individual configuration options from checkout. The entire configured product is all-or-nothing.
- **B2B workflows:** B2B buyers reviewing complex configurations cannot deselect optional components before submitting orders.
- **Feature gap vs bug:** If `selectedForCheckout` is intentionally not supported on configurationItems, the API should return an error or warning rather than silently ignoring the flag. Needs clarification from product team.

## References
- JIRA: not filed
- VC Docs: changeCartConfiguredItem mutation (Cart/mutations/changeCartConfiguredItem.md)
- Related: `selectedForCheckout` is a property on `LineItemEntity` in `vc-module-cart`
- Regression: REG-2026-04-17-0900 suite-072c-results.json
- Blocker for: CFG-EDGE-002 (currency change preserves selectedForCheckout state)
