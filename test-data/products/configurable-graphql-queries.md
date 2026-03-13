# GraphQL Queries for Configurable Product Tests

Reference queries for Suite 36 CFG-GQL-* test cases. All queries target `{{BACK_URL}}/graphql` with Bearer token authentication.

---

## 1. productConfiguration — Get Configuration Sections & Options

Used by: CFG-GQL-001, CFG-GQL-002, CFG-GQL-003

```graphql
query productConfiguration($configurableProductId: String!, $storeId: String!) {
  productConfiguration(
    configurableProductId: $configurableProductId
    storeId: $storeId
  ) {
    configurationSections {
      id
      name
      description
      type
      isRequired
      options {
        id
        quantity
        listPrice {
          amount
          formattedAmount
        }
        salePrice {
          amount
          formattedAmount
        }
        extendedPrice {
          amount
          formattedAmount
        }
        product {
          id
          name
          code
          imgSrc
          properties {
            name
            value
            type
          }
        }
      }
    }
  }
}
```

### Variables by Test Product

| Product | Variable `configurableProductId` | `storeId` |
|---------|----------------------------------|-----------|
| Configurable Hat | (lookup by slug `configurable-hat`) | `{{STORE_ID}}` |
| Hoodie Base (File required) | (lookup by slug `physical-1703`) | `{{STORE_ID}}` |
| Base product EN | (lookup by slug `111111`) | `{{STORE_ID}}` |
| Bike with options | `f16d3e8f-6c86-4679-bcfd-100a0b164421` | `{{STORE_ID}}` |

### Expected Section Types by Product

| Product | Section Types | isRequired |
|---------|--------------|------------|
| Configurable Hat | `Product` | `true` |
| Hoodie Base (File optional) | `File` | `false` |
| Hoodie Base (File required) | `File` | `true` |
| Base product EN | `Text`, `Text`, `Text` | varies |
| Bike with options | `Variation`, `Text` | varies |

---

## 2. addItem — Add Configured Product to Cart

Used by: CFG-GQL-004, CFG-GQL-005, CFG-GQL-008

```graphql
mutation addItem(
  $cartId: String!
  $productId: String!
  $quantity: Int!
  $configurationSections: [InputConfigurationSectionType!]
) {
  addItem(
    command: {
      cartId: $cartId
      productId: $productId
      quantity: $quantity
      configurationSections: $configurationSections
    }
  ) {
    id
    items {
      id
      sku
      name
      quantity
      placedPrice {
        amount
        formattedAmount
      }
      extendedPrice {
        amount
        formattedAmount
      }
      configurationItems {
        sectionId
        productId
        quantity
        name
        textValue
        type
      }
    }
    total {
      amount
      formattedAmount
    }
  }
}
```

### configurationSections Input Structure

```json
[
  {
    "sectionId": "<section UUID>",
    "type": "Product",
    "value": {
      "productId": "<option product UUID>",
      "quantity": 1
    }
  },
  {
    "sectionId": "<section UUID>",
    "type": "Text",
    "value": {
      "customText": "Engraving message"
    }
  },
  {
    "sectionId": "<section UUID>",
    "type": "File",
    "value": {
      "fileUrl": "https://uploaded-file-url"
    }
  },
  {
    "sectionId": "<section UUID>",
    "type": "Variation",
    "value": {
      "productId": "<variation product UUID>",
      "quantity": 1
    }
  }
]
```

---

## 3. updateConfigurationItem — Edit Configuration in Cart

Used by: CFG-GQL-006, CFG-GQL-007

```graphql
mutation updateConfigurationItem(
  $cartId: String!
  $lineItemId: String!
  $configurationSections: [InputConfigurationSectionType!]!
) {
  updateConfigurationItem(
    command: {
      cartId: $cartId
      lineItemId: $lineItemId
      configurationSections: $configurationSections
    }
  ) {
    id
    items {
      id
      sku
      configurationItems {
        sectionId
        productId
        quantity
        name
        textValue
        type
      }
      placedPrice {
        amount
      }
      extendedPrice {
        amount
      }
    }
  }
}
```

---

## 4. Negative Test Queries

Used by: CFG-GQL-008

### Invalid configurationId
```json
{
  "configurationSections": [
    {
      "sectionId": "00000000-0000-0000-0000-000000000000",
      "type": "Product",
      "value": { "productId": "nonexistent-id", "quantity": 1 }
    }
  ]
}
```
**Expected:** `errors[]` non-empty, addItem rejected.

### Missing required section
Send `configurationSections` without the required section for Configurable Hat.
**Expected:** `errors[]` contains validation error about required section.

### Cross-product option ID
Use option ID from Configurable Hat in addItem for Base product EN.
**Expected:** `errors[]` contains validation error.

---

## 5. Authentication Token

All mutations require a Bearer token. Obtain via:

```graphql
mutation {
  requestPasswordLogin(
    command: {
      email: "{{USER_EMAIL}}"
      password: "{{USER_PASSWORD}}"
    }
  ) {
    succeeded
    token
  }
}
```

Or via REST:
```
POST {{BACK_URL}}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={{USER_EMAIL}}&password={{USER_PASSWORD}}&scope=offline_access
```

---

## Test Data Cross-Reference

| CFG-GQL Test | Product | Query/Mutation | Section Type |
|--------------|---------|----------------|--------------|
| CFG-GQL-001 | Configurable Hat | productConfiguration | Product |
| CFG-GQL-002 | Base product EN | productConfiguration | Text (x3) |
| CFG-GQL-003 | Bike with options | productConfiguration | Variation + Text |
| CFG-GQL-004 | Configurable Hat | addItem | Product |
| CFG-GQL-005 | Base product EN | addItem | Text |
| CFG-GQL-006 | Configurable Hat | updateConfigurationItem | Product |
| CFG-GQL-007 | Bike with options | updateConfigurationItem | Variation |
| CFG-GQL-008 | Multiple | addItem (negative) | Invalid IDs, missing required |
