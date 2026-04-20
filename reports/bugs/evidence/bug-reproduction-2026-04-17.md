# GraphQL Cart Bug Reproduction Evidence

**Date:** 2026-04-17
**Environment:** https://vcst-qa.govirto.com (GraphQL endpoint: /graphql)
**User:** test-carlos.rodriguez-20260310@test-agent.com (B2B user, BuildRight org)
**userId:** `3302dcbc-e2b2-41c4-a272-81411c9a083b`
**Store:** B2B-store

> **Note:** The originally requested user `mutykovaelena@gmail.com` was temporarily locked out at the time of testing (too many failed login attempts). Slot 3 B2B user was used instead. Results are equivalent -- both are authenticated B2B storefront users.

---

## Bug 1: addItem with invalid productId

### Status: NOT REPRODUCED (appears fixed)

The `addItem` mutation now correctly rejects an invalid productId by returning a `CART_PRODUCT_UNAVAILABLE` validation error. The item is NOT added to the cart, `items` array is empty, and `itemsQuantity` is 0.

### GraphQL Query

```graphql
mutation addItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id
    itemsQuantity
    items {
      id
      productId
      name
      quantity
      listPrice { amount }
      extendedPrice { amount }
    }
    validationErrors {
      errorCode
      errorMessage
    }
    total { amount }
  }
}
```

### Variables

```json
{
  "command": {
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "cartName": "default",
    "cartType": "cart",
    "productId": "00000000-0000-0000-0000-000000000000",
    "quantity": 1
  }
}
```

### Full Response (HTTP 200)

```json
{
  "data": {
    "addItem": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "itemsQuantity": 0,
      "items": [],
      "validationErrors": [
        {
          "errorCode": "CART_PRODUCT_UNAVAILABLE",
          "errorMessage": "Product with ID 00000000-0000-0000-0000-000000000000 was not added to cart. The product is not longer available for purchase."
        }
      ],
      "total": {
        "amount": 0
      }
    }
  }
}
```

### Analysis

- `items: []` -- no phantom entry was created
- `itemsQuantity: 0` -- cart remains empty
- `validationErrors` contains `CART_PRODUCT_UNAVAILABLE` with a descriptive message
- The same behavior was verified with a second random GUID (`aaaabbbb-cccc-dddd-eeee-ffffffffffff`) -- same `CART_PRODUCT_UNAVAILABLE` error
- **Verdict:** The validation is working correctly. Either the bug was fixed since it was first reported, or the behavior differs under specific conditions not tested here.

### Screenshot

File: `tests/Sprint-current/VCST-4825/bug1-additem-invalid-productid.png`
(Shows GraphiQL with the addItem mutation loaded; the fetch-based execution confirmed the validation error response)

---

## Bug 2: changeCartConfiguredItem accepts invalid sectionId

### Status: CONFIRMED

The `changeCartConfiguredItem` mutation silently accepts a fabricated sectionId (`00000000-0000-0000-0000-000000000000`) without returning any validation error. It returns HTTP 200 with `validationErrors: []`.

### Setup: Add Configurable Hat with valid configuration

**Product:** Configurable Hat (ID: `38dbe95c-3f46-48ff-bb9a-8bd96f475214`)
**Valid Section:** "Select your fav color" (ID: `f8004e62-f820-4a00-8adb-774ab27c6011`)
**Selected Option:** Black hat (product ID: `aa8116e5-1448-447b-af51-89db83cb5c19`)

```graphql
mutation addItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id
    itemsQuantity
    items {
      id
      productId
      name
      quantity
      configurationItems {
        id
        quantity
        product { id name }
      }
    }
    validationErrors { errorCode errorMessage }
  }
}
```

**Add Variables:**
```json
{
  "command": {
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "cartName": "default",
    "cartType": "cart",
    "productId": "38dbe95c-3f46-48ff-bb9a-8bd96f475214",
    "quantity": 1,
    "configurationSections": [
      {
        "sectionId": "f8004e62-f820-4a00-8adb-774ab27c6011",
        "type": "Product",
        "option": {
          "productId": "aa8116e5-1448-447b-af51-89db83cb5c19",
          "quantity": 1
        }
      }
    ]
  }
}
```

**Add Response:**
```json
{
  "data": {
    "addItem": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "itemsQuantity": 1,
      "items": [
        {
          "id": "5ccced26-3261-44e5-b940-b547a3f599d5",
          "productId": "38dbe95c-3f46-48ff-bb9a-8bd96f475214",
          "name": "Configurable Hat",
          "quantity": 1,
          "configurationItems": [
            {
              "id": "7965273d-93c8-4992-9123-1acaf498f325",
              "quantity": 1,
              "product": {
                "id": "aa8116e5-1448-447b-af51-89db83cb5c19",
                "name": "Black hat"
              }
            }
          ]
        }
      ],
      "validationErrors": []
    }
  }
}
```

Obtained `lineItemId: 5ccced26-3261-44e5-b940-b547a3f599d5`.

### Bug Reproduction: changeCartConfiguredItem with invalid sectionId

```graphql
mutation changeCartConfiguredItem($command: InputChangeCartConfiguredItemType!) {
  changeCartConfiguredItem(command: $command) {
    id
    items {
      id
      productId
      name
      configurationItems {
        id
        quantity
        product { id name }
      }
    }
    validationErrors {
      errorCode
      errorMessage
      objectId
      objectType
    }
  }
}
```

### Variables

```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "cartName": "default",
    "cartType": "cart",
    "lineItemId": "5ccced26-3261-44e5-b940-b547a3f599d5",
    "configurationSections": [
      {
        "sectionId": "00000000-0000-0000-0000-000000000000",
        "type": "Product",
        "option": {
          "productId": "aa8116e5-1448-447b-af51-89db83cb5c19",
          "quantity": 1
        }
      }
    ]
  }
}
```

### Full Response (HTTP 200)

```json
{
  "data": {
    "changeCartConfiguredItem": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "items": [
        {
          "id": "5ccced26-3261-44e5-b940-b547a3f599d5",
          "productId": "38dbe95c-3f46-48ff-bb9a-8bd96f475214",
          "name": "Configurable Hat",
          "configurationItems": [
            {
              "id": "04ba90bd-9801-4bb0-b023-1f0317b5d604",
              "quantity": 1,
              "product": {
                "id": "aa8116e5-1448-447b-af51-89db83cb5c19",
                "name": "Black hat"
              }
            }
          ]
        }
      ],
      "validationErrors": []
    }
  }
}
```

### Analysis

- **`validationErrors: []`** -- The mutation returned NO validation errors despite the completely fabricated sectionId `00000000-0000-0000-0000-000000000000`
- The configuration item ID changed from `7965273d-93c8-4992-9123-1acaf498f325` to `04ba90bd-9801-4bb0-b023-1f0317b5d604`, indicating the system processed the request and regenerated configuration items
- The invalid sectionId was silently ignored -- the resulting configuration still shows Black hat with the same product
- **Expected behavior:** The mutation should return a validation error (e.g., `INVALID_SECTION_ID` or `CONFIGURATION_SECTION_NOT_FOUND`) when the sectionId does not belong to the product's defined configuration sections
- **Additional observation:** When the mutation is called WITHOUT explicit `cartId`, it may create/return a different empty cart (observed during initial testing with `id: fc2438a1`), adding to the confusion

### Schema Introspection (relevant types)

**ConfigurationSectionInput:**
- `sectionId: String!` (required)
- `type: String!` (required)
- `option: ConfigurableProductOptionInput`
- `customText: String`
- `fileUrls: [String]`

**InputChangeCartConfiguredItemType:**
- `cartId: String`
- `storeId: String!`
- `userId: String!`
- `lineItemId: String!`
- `quantity: Int`
- `configurationSections: [ConfigurationSectionInput]`

---

## Bug 3: selectedForCheckout ignored for configurable items

### Status: CONFIRMED (two distinct issues found)

### Issue 3a: `selectedForCheckout` in ConfigurableProductOptionInput is silently ignored by changeCartConfiguredItem

### Issue 3b: `changeCartItemSelected` does NOT cascade to child configurationItems

### Setup: Add Bike with options

**Product:** Bike with options (ID: `f16d3e8f-6c86-4679-bcfd-100a0b164421`)
**Section:** "Section with products" (ID: `29f2514c-51c6-43df-bba4-dd2db82240e4`)
**Option:** Seat ($45, product ID: `e5df66a5-4fd5-48f4-a290-481f59807082`)

Added to cart, obtained `lineItemId: de529a87-26ba-41f0-aff9-875353e5cf36`
Initial state: parent `selectedForCheckout: true`, config item Seat `selectedForCheckout: true`

### Issue 3a: selectedForCheckout in option input is silently ignored

```graphql
mutation changeCartConfiguredItem($command: InputChangeCartConfiguredItemType!) {
  changeCartConfiguredItem(command: $command) {
    id
    items {
      id
      productId
      name
      selectedForCheckout
      configurationItems {
        id
        quantity
        product { id name }
      }
    }
    validationErrors {
      errorCode
      errorMessage
      objectId
      objectType
    }
  }
}
```

**Variables:**
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "cartName": "default",
    "cartType": "cart",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "configurationSections": [
      {
        "sectionId": "29f2514c-51c6-43df-bba4-dd2db82240e4",
        "type": "Product",
        "option": {
          "productId": "e5df66a5-4fd5-48f4-a290-481f59807082",
          "quantity": 1,
          "selectedForCheckout": false
        }
      }
    ]
  }
}
```

**Full Response (HTTP 200):**
```json
{
  "data": {
    "changeCartConfiguredItem": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "items": [
        {
          "id": "de529a87-26ba-41f0-aff9-875353e5cf36",
          "productId": "f16d3e8f-6c86-4679-bcfd-100a0b164421",
          "name": "Bike with options",
          "selectedForCheckout": true,
          "configurationItems": [
            {
              "id": "4d56070a-bf54-4d64-a055-a418baefd23a",
              "quantity": 1,
              "product": {
                "id": "e5df66a5-4fd5-48f4-a290-481f59807082",
                "name": "Seat"
              }
            }
          ]
        }
      ],
      "validationErrors": []
    }
  }
}
```

**Analysis:** `selectedForCheckout` remains `true` on the parent. The `selectedForCheckout: false` passed inside `option` was silently ignored. The schema accepts it (confirmed via introspection below) but the backend does not process it.

### Issue 3b: Parent deselect does NOT cascade to configurationItems

```graphql
mutation changeCartItemSelected($command: InputChangeCartItemSelectedType!) {
  changeCartItemSelected(command: $command) {
    id
    items {
      id
      name
      selectedForCheckout
      configurationItems {
        id
        name
        selectedForCheckout
      }
    }
    validationErrors { errorCode errorMessage }
  }
}
```

**Variables:**
```json
{
  "command": {
    "cartId": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "cartName": "default",
    "cartType": "cart",
    "lineItemId": "de529a87-26ba-41f0-aff9-875353e5cf36",
    "selectedForCheckout": false
  }
}
```

**Full Response (HTTP 200):**
```json
{
  "data": {
    "changeCartItemSelected": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "items": [
        {
          "id": "de529a87-26ba-41f0-aff9-875353e5cf36",
          "name": "Bike with options",
          "selectedForCheckout": false,
          "configurationItems": [
            {
              "id": "4d56070a-bf54-4d64-a055-a418baefd23a",
              "name": "Seat",
              "selectedForCheckout": true
            }
          ]
        }
      ],
      "validationErrors": []
    }
  }
}
```

**Analysis:**
- Parent line item "Bike with options" `selectedForCheckout` changed to `false` -- this works
- Child configuration item "Seat" `selectedForCheckout` remains `true` -- does NOT cascade
- This creates an inconsistent state: the parent is deselected but the child thinks it's still selected
- No mutation exists to set `selectedForCheckout` on individual configurationItems directly (`changeCartItemSelected` only targets line items by `lineItemId`)

### Schema Introspection Evidence

**ConfigurableProductOptionInput (input type):**
```json
{
  "inputFields": [
    { "name": "productId", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "quantity", "type": { "kind": "NON_NULL", "ofType": { "name": "Int" } } },
    { "name": "selectedForCheckout", "type": { "name": "Boolean", "kind": "SCALAR" } }
  ]
}
```
The `selectedForCheckout` field EXISTS on the input type but is silently ignored by the backend.

**CartConfigurationItemType (output type):**
```json
{
  "fields": [
    { "name": "id", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "sectionId", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "type", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "productId", "type": { "name": "String" } },
    { "name": "name", "type": { "name": "String" } },
    { "name": "sku", "type": { "name": "String" } },
    { "name": "imageUrl", "type": { "name": "String" } },
    { "name": "quantity", "type": { "name": "Int" } },
    { "name": "customText", "type": { "name": "String" } },
    { "name": "selectedForCheckout", "type": { "kind": "NON_NULL", "ofType": { "name": "Boolean" } } },
    { "name": "listPrice", "type": { "kind": "NON_NULL", "ofType": { "name": "MoneyType" } } },
    { "name": "salePrice", "type": { "kind": "NON_NULL", "ofType": { "name": "MoneyType" } } },
    { "name": "extendedPrice", "type": { "kind": "NON_NULL", "ofType": { "name": "MoneyType" } } },
    { "name": "files", "type": { "kind": "LIST", "ofType": { "name": "CartConfigurationItemFileType" } } },
    { "name": "product", "type": { "name": "Product" } }
  ]
}
```
The output type HAS `selectedForCheckout` (Boolean!), proving the field is modeled in the schema but there is no way to actually set it.

**InputChangeCartItemSelectedType (input type):**
```json
{
  "inputFields": [
    { "name": "cartId", "type": { "name": "String" } },
    { "name": "storeId", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "userId", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "lineItemId", "type": { "kind": "NON_NULL", "ofType": { "name": "String" } } },
    { "name": "selectedForCheckout", "type": { "kind": "NON_NULL", "ofType": { "name": "Boolean" } } }
  ]
}
```
This input only supports `lineItemId` -- there is no mechanism to target a `configurationItemId`.

---

## Summary

| Bug | Status | Severity | Details |
|-----|--------|----------|---------|
| Bug 1: addItem with invalid productId | NOT REPRODUCED | N/A | Returns `CART_PRODUCT_UNAVAILABLE` validation error correctly |
| Bug 2: changeCartConfiguredItem with invalid sectionId | CONFIRMED | Medium | Silently accepts fabricated sectionId, no validation error |
| Bug 3a: selectedForCheckout in option input ignored | CONFIRMED | Medium | Schema accepts the field but backend ignores it |
| Bug 3b: selectedForCheckout cascade missing | CONFIRMED | Medium | Parent deselect does not cascade to configurationItems |
