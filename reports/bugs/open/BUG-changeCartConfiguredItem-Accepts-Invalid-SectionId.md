# BUG: changeCartConfiguredItem accepts invalid sectionId — data corruption risk

## Status: CONFIRMED

**Severity:** High
**Component:** Cart / GraphQL xAPI / Configurable Products
**Browser:** Edge (Chromium)
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1019.0
**Theme Version:** 2.46.0-pr-2225-572f-572f0087
**Module Versions:** VirtoCommerce.XCart 3.1007.0-pr-105-3ec5, VirtoCommerce.Cart 3.1003.0, VirtoCommerce.Catalog 3.1018.0-pr-871-3340
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-04-17
**Reported By:** QA Agent (REG-2026-04-17-0900, test CFG-E2E-052)

## Steps to Reproduce
1. Add a configurable product (e.g., Configurable Hat) to cart via `addItem` mutation
2. Note the lineItemId from the response
3. Execute `changeCartConfiguredItem` mutation with a fabricated sectionId: `00000000-0000-0000-0000-000000000000` and a valid productId from the catalog
4. Inspect the response `validationErrors[]` and `configurationItems`

## Expected Result
The mutation should reject the invalid sectionId with a non-empty `validationErrors[]` array (e.g., "Configuration section not found"). The original `configurationItems` should remain unchanged.

## Actual Result
The mutation returns with **empty `validationErrors[]`** and **accepts the invalid sectionId**. The `configurationItems` array now contains an entry with `sectionId=00000000-0000-0000-0000-000000000000` — a section that does not exist in the product's configuration. This is silent data corruption.

## Evidence

**Full reproduction:** `reports/bugs/evidence/bug-reproduction-2026-04-17.md` (Bug 2 section)

### Step 1 — Add Configurable Hat with valid config

```graphql
mutation addItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id
    itemsQuantity
    items { id productId name configurationItems { id quantity product { id name } } }
    validationErrors { errorCode errorMessage }
  }
}
```
```json
{
  "command": {
    "storeId": "B2B-store",
    "userId": "3302dcbc-e2b2-41c4-a272-81411c9a083b",
    "cultureName": "en-US", "currencyCode": "USD",
    "cartName": "default", "cartType": "cart",
    "productId": "38dbe95c-3f46-48ff-bb9a-8bd96f475214",
    "quantity": 1,
    "configurationSections": [{
      "sectionId": "f8004e62-f820-4a00-8adb-774ab27c6011",
      "type": "Product",
      "option": { "productId": "aa8116e5-1448-447b-af51-89db83cb5c19", "quantity": 1 }
    }]
  }
}
```
Response: lineItemId `5ccced26-3261-44e5-b940-b547a3f599d5`, configItem `7965273d-...` (Black hat). validationErrors: [].

### Step 2 — changeCartConfiguredItem with FABRICATED sectionId

```graphql
mutation changeCartConfiguredItem($command: InputChangeCartConfiguredItemType!) {
  changeCartConfiguredItem(command: $command) {
    id
    items { id productId name configurationItems { id quantity product { id name } } }
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
    "cartName": "default", "cartType": "cart",
    "lineItemId": "5ccced26-3261-44e5-b940-b547a3f599d5",
    "configurationSections": [{
      "sectionId": "00000000-0000-0000-0000-000000000000",
      "type": "Product",
      "option": { "productId": "aa8116e5-1448-447b-af51-89db83cb5c19", "quantity": 1 }
    }]
  }
}
```

### Actual Response (HTTP 200)
```json
{
  "data": {
    "changeCartConfiguredItem": {
      "id": "f6399bd0-5fe0-4f80-ad0e-b307dc5c3f44",
      "items": [{
        "id": "5ccced26-3261-44e5-b940-b547a3f599d5",
        "productId": "38dbe95c-3f46-48ff-bb9a-8bd96f475214",
        "name": "Configurable Hat",
        "configurationItems": [{
          "id": "04ba90bd-9801-4bb0-b023-1f0317b5d604",
          "quantity": 1,
          "product": { "id": "aa8116e5-1448-447b-af51-89db83cb5c19", "name": "Black hat" }
        }]
      }],
      "validationErrors": []
    }
  }
}
```

**Key observations:**
- `validationErrors: []` — NO error returned for fabricated sectionId
- configItem ID changed (`7965273d` → `04ba90bd`) — system PROCESSED the request and regenerated items
- The fabricated sectionId was silently ignored rather than rejected

### Schema Introspection

**ConfigurationSectionInput:**
- `sectionId: String!` (required)
- `type: String!` (required)
- `option: ConfigurableProductOptionInput`
- `customText: String`
- `fileUrls: [String]`

No server-side validation cross-references sectionId against the product's actual configuration sections.

## Root Cause Analysis
- Source file: `VirtoCommerce/vc-module-x-cart/src/VirtoCommerce.XCart.Core/CartAggregate.cs` — `ChangeCartConfiguredItem` handler does not validate sectionId against the product's actual configuration sections
- Suspected cause: Missing cross-reference between `configurationSections[].sectionId` input and `productConfiguration.configurationSections[].id`. The mutation processes whatever sectionId is provided without checking it exists.
- **Not from PR #105** — PR only adds `DependsOnSectionId` field, does not touch mutation handler validation
- App Insights: not queried (no server-side exception — the request succeeds silently)

## Impact
- **Data integrity (Critical):** Cart line items can contain configuration entries referencing non-existent sections. This corrupted state may propagate to orders if checkout does not re-validate.
- **Checkout/Order risk:** If an order is created from a cart with phantom sectionIds, order fulfillment may fail or produce incorrect line items.
- **Security:** Malicious actors could inject arbitrary sectionIds to manipulate cart state.

## References
- JIRA: not filed
- VC Docs: changeCartConfiguredItem mutation (Cart/mutations/changeCartConfiguredItem.md)
- Regression: REG-2026-04-17-0900 suite-072c-results.json
