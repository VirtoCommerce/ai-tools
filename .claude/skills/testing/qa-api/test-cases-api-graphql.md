# REST API & GraphQL xAPI Test Cases

> Reference file for qa-backend-expert agent. Read when testing Platform APIs or GraphQL xAPI.

## 1. PLATFORM REST API TESTING (Suite 14 - 25 tests)

Using Postman MCP or browser_evaluate for API calls.

### A. Authentication (API-014 to API-016)

```javascript
// API-014: Login - Get authentication token
POST ${BACK_URL}/connect/token
Content-Type: application/x-www-form-urlencoded
Body: grant_type=password&username=${ADMIN}&password=${ADMIN_PASSWORD}&scope=openid offline_access

Expected: 200 OK
Validations:
- Access token returned (valid JWT)
- Token type is Bearer
- Expiration > 0
- Authenticated request succeeds with token

// API-015: Invalid Credentials (negative)
POST ${BACK_URL}/connect/token (wrong password)
- Returns 400 Bad Request
- Error message does NOT reveal if user exists
- No access token returned
- No stack traces in response

// API-016: Token Refresh
POST ${BACK_URL}/connect/token (grant_type=refresh_token)
- New access token issued
- New refresh token issued
- Authenticated requests work with new token
```

### B. Catalog APIs (API-001 to API-003, API-018, API-019)

```javascript
// API-001: Get Products List
GET ${BACK_URL}/api/catalog/products?storeId=${STORE_ID}
- Response 200 OK
- Products array returned with id, name, code, imgSrc
- Pagination metadata present (totalCount)

// API-002: Get Product by ID
GET ${BACK_URL}/api/catalog/products/{id}
- Full product detail (descriptions, prices, images, variations)
- SEO info populated
- Category assignments present

// API-003: Search Products
GET ${BACK_URL}/api/catalog/products?keyword=laptop
- Matching products returned
GET ${BACK_URL}/api/catalog/products?keyword=nonexistent_xyz
- Empty results with totalCount=0
- Response time under 500ms

// API-018: Create Product
POST ${BACK_URL}/api/catalog/products
Body: { "code": "QA-TEST-001", "name": "Test Product", "categoryId": "..." }
- Product created with 200/201
- Product retrievable by ID
- Product appears in category
- Cleanup deletion succeeds

// API-019: Update Product
PUT ${BACK_URL}/api/catalog/products/{id}
- Updated name/description saved
- Other fields unchanged
- ModifiedDate updated
```

### C. Pricing APIs (API-004, API-005)

```javascript
// API-004: Get Product Prices (price evaluation)
GET ${BACK_URL}/api/pricing/evaluate
Body: { productIds: ["prod-id"], quantity: 1 }
- ListPrice and SalePrice present
- Currency matches store configuration
- Price tiers included if configured

// API-005: Price Calculation with Quantity (tier pricing)
Request price for quantity=1  -> base price
Request price for quantity=10 -> tier 1 discount
Request price for quantity=100 -> tier 2 discount
- Higher quantities get lower per-unit price
- Price breakdown shows tier details
```

### D. Inventory APIs (API-006, API-007)

```javascript
// API-006: Check Product Availability
GET ${BACK_URL}/api/inventory/products/{id}/availability
- InStockQuantity present
- FulfillmentCenter information present
- AllowPreorder/AllowBackorder flags set correctly
- Response time under 300ms

// API-007: Reserve Stock
POST reserve -> verify stock decreased
POST release -> verify stock restored
- Available quantity decreases on reserve
- Stock quantity restores after release
```

### E. Order APIs (API-008 to API-010)

```javascript
// API-008: Get Orders List
GET ${BACK_URL}/api/order/customerOrders
- Each order has number, status, total, currency
- Pagination works (skip/take)
- Status filter returns correct subset

// API-009: Get Order by ID
GET ${BACK_URL}/api/order/customerOrders/{id}
- Line items with product info
- Shipping and payment info present
- Order total matches line items + shipping - discounts

// API-010: Create Order (full flow)
1. Create cart via API
2. Add product -> set address -> set shipping -> set payment
3. Create order from cart
- Order created with status 'New'
- Order number generated
```

### F. Customer APIs (API-011 to API-013)

```javascript
// API-011: Get Customer Profile
GET ${BACK_URL}/api/members/{userId}
- Email, name, phone populated
- Addresses collection present
- Organization membership shown (if B2B)

// API-013: Create Organization
POST ${BACK_URL}/api/members/organizations
Body: { "name": "Test Org QA", "description": "...", "addresses": [...] }
- Organization created with 200/201
- Org has generated ID
- Members list initially contains creator
```

### G. Error Handling & Security (API-023 to API-025)

```javascript
// API-023: 404 Not Found
GET ${BACK_URL}/api/catalog/products/nonexistent-id  -> structured 404 error
GET ${BACK_URL}/api/nonexistent-endpoint              -> 404, no stack traces

// API-024: Validation Errors
POST ${BACK_URL}/api/catalog/products with empty body -> 400 with field-level errors
POST with invalid data types -> descriptive validation messages

// API-025: Security Headers
- CORS allows expected origins only
- X-Content-Type-Options: nosniff present
- No server version disclosed in headers
- Content-Type correctly set on all responses
```

## 2. GRAPHQL xAPI TESTING (Suite 15 - 20 tests)

GraphQL endpoint: `${BACK_URL}/graphql` or via Graphiql: `${BACK_URL}/ui/graphiql`
Reference docs: https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/

### A. xCatalog Queries (GQL-001 to GQL-004, GQL-019)

```graphql
# GQL-001: Search Products Query
# IMPORTANT: Search arg is "query" NOT "keyword" (keyword only works on brands query)
query {
  products(storeId: "${STORE_ID}", query: "laptop", currencyCode: "USD") {
    totalCount
    items { id name code imgSrc }
  }
}
# totalCount > 0 for valid search term, items contain id/name/code, no errors

# GQL-002: Get Product Detail
query {
  product(storeId: "${STORE_ID}", id: "PRODUCT_ID") {
    id name
    descriptions { content }
    prices { list { amount } sale { amount } }
  }
}
# Descriptions present, prices include list and sale amounts

# GQL-003: Category Tree
query {
  categories(storeId: "${STORE_ID}") {
    totalCount
    items { id name slug childCategories { id name } }
  }
}
# Root categories returned, child categories nested correctly

# GQL-004: Product Facets/Filters
# Filter syntax is a STRING, not GraphQL objects:
#   filter: "category.subtree:<categoryId> price.USD:(0 TO) inStock_variations:true"
#   facet: "Brand price.USD"
# Response uses term_facets[] and range_facets[] — NOT "facets { values }"
query {
  products(
    storeId: "${STORE_ID}"
    filter: "category.subtree:<CATEGORY_ID> price.USD:(0 TO) inStock_variations:true"
    facet: "Brand"
    currencyCode: "USD"
  ) {
    totalCount
    items { id name }
    term_facets { name label terms { term label count isSelected } }
    range_facets { name ranges { from to count } }
  }
}
# Verify: term_facets non-empty, counts match filtered totalCount
# Apply additional filter (Brand:value) → results narrow (AND logic)

# GQL-019: Product Variations
# query product with variations -> verify variation properties (size, color)
# Variations array populated, each has distinct properties, availability/pricing differs
```

### B. xCart Mutations (GQL-005 to GQL-010, GQL-017)

> **CRITICAL:** All xCart mutations use the `command:` input pattern. Never use individual arguments.
> `storeId` is always required. `userId` is required per schema type but inferred from auth token.
> CartType has **flat** money fields: `total`, `subTotal`, `discountTotal` — NOT nested under `totals`. No `grandTotal`.
> Products search uses `query` arg — NOT `keyword`. Always verify via introspection before writing test cases.

```graphql
# GQL-005: Get or Create Cart (cart is auto-created on first query for authenticated user)
# NOTE: There is NO createCart mutation — use the cart query instead
query {
  cart(storeId: "${STORE_ID}", currencyCode: "USD", cultureName: "en-US") {
    id name itemsCount
  }
}
# Cart returned with ID; auto-created if none existed for user

# GQL-006: Add Item to Cart
mutation {
  addItem(command: {
    storeId: "${STORE_ID}", currencyCode: "USD",
    productId: "PRODUCT_ID", quantity: 2
  }) {
    id itemsCount
    items { id productId quantity listPrice { amount } }
  }
}
# itemsCount incremented, quantity=2, listPrice populated
# userId is required per schema type but inferred from auth token

# GQL-007: Update Cart Item Quantity
mutation {
  changeCartItemQuantity(command: {
    storeId: "${STORE_ID}", currencyCode: "USD",
    lineItemId: "LINE_ITEM_ID", quantity: 5
  }) {
    id items { id quantity } subTotal { amount }
  }
}
# Quantity changed to 5, subtotal recalculated
# NOTE: mutation is changeCartItemQuantity (NOT changeItemQuantity)

# GQL-008: Remove Item from Cart
mutation {
  removeCartItem(command: {
    storeId: "${STORE_ID}", currencyCode: "USD",
    lineItemId: "LINE_ITEM_ID"
  }) {
    id itemsCount items { id }
  }
}
# itemsCount decremented, total recalculated
# NOTE: mutation is removeCartItem (NOT removeItem)

# GQL-009: Set Shipping Address
mutation {
  addOrUpdateCartShipment(command: {
    storeId: "${STORE_ID}", currencyCode: "USD",
    shipment: {
      deliveryAddress: {
        city: "New York", regionName: "NY",
        postalCode: "10001", countryCode: "US",
        line1: "123 Test St"
      }
    }
  }) {
    id
    shipments { deliveryAddress { city regionName postalCode } }
    availableShippingMethods { code optionName price { amount } }
  }
}
# Address saved on shipment, availableShippingMethods populated

# GQL-010: Apply Coupon
mutation {
  addCoupon(command: {
    storeId: "${STORE_ID}", currencyCode: "USD",
    couponCode: "TESTCOUPON"
  }) {
    id
    coupons { code isAppliedSuccessfully }
    discountTotal { amount }
    total { amount }
  }
}
# IMPORTANT: CartType has FLAT money fields — use "total { amount }" not "totals { grandTotal { amount } }"
# isAppliedSuccessfully = true, discountTotal shows amount, invalid coupon returns error

# GQL-017: Full Checkout Flow via GraphQL (end-to-end, ~10min)
# 1. Query cart → 2. addItem (×N) → 3. addOrUpdateCartShipment (address)
# 4. Read availableShippingMethods → 5. addOrUpdateCartShipment (method)
# 6. addOrUpdateCartPayment → 7. createOrderFromCart
# Cart money fields at each stage are FLAT: subTotal, total, shippingTotal, discountTotal (NOT nested under "totals")
# ALL mutations use command: { storeId, currencyCode, ... } — userId inferred from token
```

### C. xOrder Queries & Mutations (GQL-011 to GQL-013)

```graphql
# GQL-011: Get Orders Query
query {
  orders(filter: "", sort: "createdDate:desc") {
    totalCount
    items { id number status createdDate total { amount } }
  }
}
# Orders sorted by date, pagination works (first/after)

# GQL-012: Get Order Detail
# query order by ID/number -> verify line items, addresses, payments, totals correct

# GQL-013: Create Order from Cart
mutation {
  createOrderFromCart(command: { cartId: "CART_ID" }) {
    id number status
  }
}
# Order number generated, status 'New'/'Processing', cart cleared
```

### D. xCMS & Security (GQL-014 to GQL-016, GQL-018, GQL-020)

```graphql
# GQL-014: CMS Page Content
query { pages(storeId: "${STORE_ID}") { totalCount items { id name relativeUrl content } } }
# Pages returned with content, no HTML injection

# GQL-015: Error Handling
# Malformed query -> clear syntax error message
# Non-existent field -> specific field error
# Missing required args -> validation error
# No 500 errors, all return structured GraphQL errors

# GQL-016: Authentication - Unauthenticated Access
# Products query without auth -> should work (public)
# Orders query without auth -> should fail
# Cart mutation without auth -> should fail
# Error messages don't leak sensitive info

# GQL-018: Query Performance
# Product search < 500ms, Nested query < 1000ms, Orders list < 500ms
# No obvious N+1 query patterns

# GQL-020: Introspection Security
# { __schema { types { name } } }
# No internal/debug types exposed, rate limiting applies
```
