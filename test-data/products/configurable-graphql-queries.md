# GraphQL Queries for Configurable Product Tests

Reference queries for Suite 36 CFG-GQL-* test cases. All queries target `{{BACK_URL}}/graphql` with Bearer token authentication.

> **Updated 2026-03-13** — Corrected based on GraphQL introspection. Key fixes:
> - Input type is `ConfigurationSectionInput` (not `InputConfigurationSectionType`)
> - `updateConfigurationItem` uses singular `configurationSection` (not plural)
> - `CartConfigurationItemType` uses `customText` field (not `textValue`)
> - All cart mutations require `storeId` + `userId` in the command
> - REST `/connect/token` requires `storeId` parameter for storefront users

---

## 0. Introspection — Always Verify Before Writing Queries

```graphql
# Verify input type fields
{ __type(name: "ConfigurationSectionInput") { inputFields { name type { name kind ofType { name } } } } }

# Verify cart configuration item fields
{ __type(name: "CartConfigurationItemType") { fields { name type { name kind ofType { name } } } } }

# Verify addItem input
{ __type(name: "InputAddItemType") { inputFields { name type { name kind ofType { name } } } } }

# Verify updateConfigurationItem input
{ __type(name: "InputUpdateConfigurationItemType") { inputFields { name type { name kind ofType { name } } } } }

# List all mutations
{ __schema { mutationType { fields { name args { name type { name } } } } } }
```

---

## 1. Resolve Product ID at Runtime

> **Never hardcode platform UUIDs.** Resolve product IDs dynamically before each test run.
> The xAPI has **no slug-based lookup** (`resolveProduct` does not exist in the schema).

### Available Lookup Methods

```graphql
# Method 1: By product name (keyword search) — works for unique names
query { products(storeId: "B2B-store", query: "Configurable Hat", first: 1) {
  items { id name code slug }
}}

# Method 2: By SKU/code (exact match) — reliable but SKUs are auto-generated
query { products(storeId: "B2B-store", filter: "code:YER-80407217", first: 1) {
  items { id name code slug }
}}

# Method 3: By known ID — use after initial resolution
query { product(storeId: "B2B-store", id: "<resolved-id>") {
  id name code slug hasVariations
  price { list { amount } sale { amount } actual { amount } }
  variations { id name code }
}}
```

### Lookup Caveats (verified 2026-03-13)

| Method | Works? | Limitation |
|--------|--------|------------|
| `products(query: "name")` | Partial | Fuzzy search — "Hoodie Base" → 2 results, "Base product EN" → 0 results |
| `products(filter: "code:SKU")` | Yes | Exact match, but SKUs are auto-generated per environment |
| `products(filter: "slug:...")` | **No** | Returns 0 results — slug filter not supported |
| `products(filter: "name:...")` | **No** | Returns 0 results — name filter not supported |
| `product(id: "UUID")` | Yes | Requires knowing the UUID already |

### Recommended Resolution Strategy

1. **Best:** Use `products(query: "<exact product name>")` — works for uniquely named products
2. **Fallback for ambiguous names:** Use `products(query: "<name>", filter: "category.path:Products with Options")` to narrow scope
3. **For "Base product EN":** Search by SKU from snapshot, or use `products(query: "NIR-24861764")` (SKU search works)
4. **Cache resolved IDs** for the duration of a test run — don't re-resolve per test case

### Test Products

| CSV ID | Product | Lookup Query | Expected Sections |
|--------|---------|-------------|-------------------|
| CFG-001 | Configurable Hat | `query: "Configurable Hat"` | 4: Product, Product, Text, File (all optional) |
| CFG-002 | Custom T-shirt | `query: "Custom T-shirt"` | 4: Product(req), Text, Product, File |
| CFG-004 | Hoodie Base (File optional) | `query: "Hoodie Base with Only File non required"` | 1: File (optional) |
| CFG-005 | Hoodie Base (File required) | `query: "Hoodie Base product with only File req"` | 1: File (required) |
| CFG-006 | Base product EN | `query: "Base product"` + verify slug ends with `/111111` | 3: File(req), Text(req), Product(req) + variations |
| CFG-009 | Bike with options | `query: "Bike with options"` + verify name exact | 3: Text, Variation(empty), Product(req) |
| CFG-010 | Off-Road Bike | `query: "Off-Road Bike"` | 3: Variation(empty) x2, Text |
| CFG-011 | Test Bike With Options | `query: "Test Bike With Options"` | 3: Product(req), Text(req), Product(req) |

---

## 2. productConfiguration — Get Configuration Sections & Options

Used by: CFG-GQL-001, CFG-GQL-002, CFG-GQL-003

> Call this after resolving `configurableProductId` via `products(query:)` lookup (Section 1).

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
      allowCustomText
      allowTextOptions
      maxLength
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

### Runtime Resolution Pattern

```
1. resolveProduct(slug: "configurable-hat") → get product.id
2. productConfiguration(configurableProductId: product.id) → get sections[].id, options[].product.id
3. Use live section/option IDs in addItem/updateConfigurationItem mutations
```

### Expected Section Types by Product

| Product (by slug) | Section Types | isRequired | Notes |
|-------------------|--------------|------------|-------|
| `configurable-hat` | `Product`, `Product`, `Text`, `File` | all `false` | 4 optional sections |
| `custom-t-shirt` | `Product`, `Text`, `Product`, `File` | first `true`, rest `false` | Required Product with preselected option |
| `physical` | `File` | `false` | Single optional file upload |
| `physical-1703` | `File` | `true` | Single required file upload |
| `111111` | `File`, `Text`, `Product` | all `true` | All 3 required; File max 2 files; Product has 9 options |
| `bike-with-options` | `Text`, `Variation`, `Product` | `false`, `false`, `true` | Variation section renders EMPTY (bug) |
| `off-road-bike` | `Variation`, `Variation`, `Text` | all `false` | Both Variation sections EMPTY (bug) |
| `test-bike-with-options` | `Product`, `Text`, `Product` | all `true` | 3 required; has sale prices and discounts |

---

## 3. addItem — Add Configured Product to Cart

Used by: CFG-GQL-004, CFG-GQL-005, CFG-GQL-008

> **IMPORTANT:** The command requires `storeId` and `userId` fields. The input type is `ConfigurationSectionInput` (not `InputConfigurationSectionType`). Extract `userId` from the JWT token `sub` claim.

```graphql
mutation addItem(
  $cartId: String!
  $storeId: String!
  $userId: String!
  $productId: String!
  $quantity: Int!
  $configurationSections: [ConfigurationSectionInput!]
) {
  addItem(
    command: {
      cartId: $cartId
      storeId: $storeId
      userId: $userId
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
        id
        sectionId
        productId
        quantity
        name
        sku
        customText
        type
        selectedForCheckout
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
      }
    }
    total {
      amount
      formattedAmount
    }
  }
}
```

### ConfigurationSectionInput Structure (Verified via introspection)

> Use `sectionId` and `option.productId` resolved dynamically from `productConfiguration` query (Section 2).

```json
[
  {
    "sectionId": "<resolved section.id>",
    "type": "Product",
    "option": {
      "productId": "<resolved option.product.id>",
      "quantity": 1
    }
  },
  {
    "sectionId": "<resolved section.id>",
    "type": "Text",
    "customText": "Engraving message"
  },
  {
    "sectionId": "<resolved section.id>",
    "type": "File",
    "fileUrls": ["https://uploaded-file-url"]
  },
  {
    "sectionId": "<resolved section.id>",
    "type": "Variation",
    "option": {
      "productId": "<resolved variation product.id>",
      "quantity": 1
    }
  }
]
```

> **Note:** The input uses `option` (with `productId` + `quantity`), `customText`, and `fileUrls` — NOT `value` with nested objects.

---

## 4. updateConfigurationItem — Edit Configuration in Cart

Used by: CFG-GQL-006, CFG-GQL-007

> **IMPORTANT:** Uses singular `configurationSection` (NOT plural `configurationSections`). Also requires `storeId` and `userId`.

```graphql
mutation updateConfigurationItem(
  $cartId: String!
  $storeId: String!
  $userId: String!
  $lineItemId: String!
  $configurationSection: ConfigurationSectionInput!
) {
  updateConfigurationItem(
    command: {
      cartId: $cartId
      storeId: $storeId
      userId: $userId
      lineItemId: $lineItemId
      configurationSection: $configurationSection
    }
  ) {
    id
    items {
      id
      sku
      configurationItems {
        id
        sectionId
        productId
        quantity
        name
        customText
        type
        selectedForCheckout
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

## 5. Negative Test Queries

Used by: CFG-GQL-008

### Invalid sectionId
```json
{
  "configurationSections": [
    {
      "sectionId": "00000000-0000-0000-0000-000000000000",
      "type": "Product",
      "option": { "productId": "nonexistent-id", "quantity": 1 }
    }
  ]
}
```
**Expected:** `errors[]` non-empty, addItem rejected.

### Missing required section
Resolve Bike with options (`bike-with-options`) sections, then send `configurationSections` without the required Product section.
**Expected:** `errors[]` contains validation error about required section.

### Cross-product option ID
Resolve an option product ID from Configurable Hat, use it in addItem for Base product EN.
**Expected:** OBSERVATION — platform may silently accept cross-product option IDs without error (potential missing validation).

---

## 6. Authentication Token

All mutations require a Bearer token. Obtain via REST:

```
POST {{BACK_URL}}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username={{USER_EMAIL}}&password={{USER_PASSWORD}}&scope=offline_access&storeId=B2B-store
```

> **Note:** `storeId` is REQUIRED for storefront users. Without it you get `user_cannot_login_in_store` error.

Extract `userId` from the JWT access_token `sub` claim (base64-decode the payload section).

The `requestPasswordLogin` GraphQL mutation does NOT exist on the storefront — use REST `/connect/token` instead.

---

## 7. Cart ID

Get or create a cart:

```graphql
query {
  cart(storeId: "B2B-store", userId: "<userId>", currencyCode: "USD", cultureName: "en-US") {
    id
    items { id name }
    itemsCount
  }
}
```

Clear cart before tests:
```graphql
mutation {
  clearCart(command: { cartId: "<cartId>", storeId: "B2B-store", userId: "<userId>" }) {
    id
    items { id }
  }
}
```

---

## 8. Full Test Flow Pattern (Dynamic Resolution)

Every GraphQL test should follow this pattern — never hardcode UUIDs:

```
Step 1: Authenticate      → POST /connect/token (with storeId!) → get access_token, extract userId from JWT sub
Step 2: Get/create cart    → cart query → get cartId
Step 3: Resolve product    → products(query: "Product Name") → get product.id (verify name/slug match)
Step 4: Get configuration  → productConfiguration(configurableProductId: product.id) → get section IDs, option IDs
Step 5: Execute mutation   → addItem / updateConfigurationItem with resolved IDs from steps 3-4
Step 6: Assert results     → verify configurationItems, prices, types
Step 7: Cleanup            → clearCart
```

> **No slug-based lookup exists** in the xAPI schema. Use `products(query:)` keyword search
> and validate the result matches by checking `name` or `slug` suffix. See Section 1 for details.

---

## Test Data Cross-Reference (Updated 2026-03-13)

| CFG-GQL Test | Product (slug) | Query/Mutation | Section Types | Notes |
|--------------|----------------|----------------|---------------|-------|
| CFG-GQL-001 | `configurable-hat` | productConfiguration | Product, Product, Text, File (all optional) | 4 sections |
| CFG-GQL-002 | `111111` | productConfiguration | File, Text, Product (all required) | Hybrid with variations |
| CFG-GQL-003 | `bike-with-options` | productConfiguration | Text, Variation (empty), Product (required) | 3 sections |
| CFG-GQL-004 | `configurable-hat` | addItem | Product | Resolve option from section 1 |
| CFG-GQL-005 | `111111` | addItem | Text + File + Product | All 3 required |
| CFG-GQL-006 | `configurable-hat` | updateConfigurationItem | Product | Singular configurationSection |
| CFG-GQL-007 | `bike-with-options` | updateConfigurationItem | Product | Use "Produts" section (Variation is empty) |
| CFG-GQL-008 | Multiple | addItem (negative) | Invalid IDs, missing required | Cross-product may not validate |

---

## Environment Snapshot

For a point-in-time snapshot of QA environment UUIDs (platform IDs, section IDs, option IDs), see:
`test-data/products/qa-env-snapshot-configurable.md`

> Use the snapshot as a quick reference during interactive testing only.
> Automated tests and agents must resolve IDs dynamically using the pattern in Section 8.
