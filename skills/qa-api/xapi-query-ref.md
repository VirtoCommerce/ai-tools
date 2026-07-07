# Virto Commerce xAPI & REST API Quick Reference

> Ready-to-use query/mutation examples for testing. All examples use environment variables from `config.js`.
>
> **WARNING:** These templates are reference examples. Before using any query or mutation in test cases, **verify against the live schema via introspection**. Field names, input types, and mutation signatures can change between platform versions.

---

## Schema Introspection (ALWAYS DO THIS FIRST)

Run these at `${BACK_URL}/graphql` or in GraphiQL (`${BACK_URL}/ui/graphiql`) to verify before writing any query/mutation.

```graphql
# List all available queries
{ __schema { queryType { fields { name description args { name type { name kind ofType { name } } } } } } }

# List all available mutations
{ __schema { mutationType { fields { name description args { name type { name kind ofType { name } } } } } } }

# Inspect a specific input type (e.g., command argument)
{ __type(name: "InputAddItemType") { inputFields { name type { name kind ofType { name kind } } } } }

# Inspect a return type
{ __type(name: "CartType") { fields { name type { name kind ofType { name } } } } }
```

**Use introspection to verify:**
- Exact mutation/query name (e.g., `removeCartItem` vs `removeItem`)
- Input type name (e.g., `InputAddItemType` vs `AddItemInput`)
- Required fields on input types (e.g., `storeId`, `userId` on cart commands)
- Available return fields and their types
- Filter/sort argument syntax

---

## Authentication

```bash
# Get OAuth2 token
POST ${BACK_URL}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username=${ADMIN}&password=${ADMIN_PASSWORD}&scope=openid offline_access
```

Response: `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }`

Use in headers: `Authorization: Bearer ${access_token}`

---

## GraphQL xAPI (${BACK_URL}/graphql)

All GraphQL requests require `Authorization: Bearer ${token}` header.

### xCatalog — Products & Categories

```graphql
# Search products
# IMPORTANT: The search argument is "query" NOT "keyword" (keyword only works on brands query)
query searchProducts($storeId: String!, $query: String, $first: Int) {
  products(
    storeId: $storeId
    query: $query
    first: $first
    cultureName: "en-US"
    currencyCode: "USD"
  ) {
    totalCount
    items {
      id
      name
      code
      price {
        actual { amount formattedAmount }
        list { amount formattedAmount }
      }
      availabilityData { isAvailable availableQuantity }
      images { url }
    }
  }
}
# Variables: { "storeId": "${STORE_ID}", "query": "bolt", "first": 20 }
```

```graphql
# Search products with filter and facets
# The "filter" arg uses Virto xAPI filter syntax (NOT GraphQL filter objects)
# The "facet" arg specifies which facets to return in the response
query filteredProducts($storeId: String!, $filter: String, $facet: String, $first: Int) {
  products(
    storeId: $storeId
    filter: $filter
    facet: $facet
    first: $first
    cultureName: "en-US"
    currencyCode: "USD"
  ) {
    totalCount
    items {
      id name code imgSrc
      price { actual { amount } list { amount } }
      availabilityData { isAvailable isInStock availableQuantity }
    }
    term_facets {
      name label
      terms { term label count isSelected }
    }
    range_facets {
      name label
      ranges { from to count isSelected label }
    }
  }
}
```

#### Filter Syntax Reference

The `filter` argument is a **string** using Virto xAPI filter syntax. Multiple filters are space-separated (AND logic).

| Filter Pattern | Example | Description |
|---------------|---------|-------------|
| **Category subtree** | `category.subtree:@td(VIRTUAL_CATALOG_B2B.id)` | Products in category and all subcategories (use category ID). The vcst-qa value is `fc596540864a41bf8ab78734ee7353a3`; customer's catalog root differs. |
| **Category path** | `category.path:Bolts` | Products in category by path/slug |
| **Price range (has price)** | `price.USD:(0 TO)` | Products with any USD price > 0 |
| **Price range (bounded)** | `price.USD:(10 TO 100)` | Products with USD price between 10 and 100 |
| **In stock (variations)** | `inStock_variations:true` | Products with at least one in-stock variation |
| **In stock (simple)** | `inStock:true` | Products currently in stock |
| **Property value** | `Brand:Acme` | Products with Brand property = "Acme" |
| **Multiple values** | `Brand:Acme,Bolt` | Products with Brand = "Acme" OR "Bolt" |
| **Outline** | `__outline:catalog/category` | Products matching catalog outline path |
| **Product type** | `productType:Physical` | Filter by product type |
| **Is buyable** | `isBuyable:true` | Only buyable products |

**Combined filter examples:**
```
# Category + in stock + has price
"category.subtree:@td(VIRTUAL_CATALOG_B2B.id) price.USD:(0 TO) inStock_variations:true"

# Category + price range + brand
"category.subtree:@td(VIRTUAL_CATALOG_B2B.id) price.USD:(10 TO 500) Brand:Acme"

# Keyword search with category filter
# Use both "query" arg for text search AND "filter" arg for category/price/stock
```

**Variables example:**
```json
{
  "storeId": "${STORE_ID}",
  "filter": "category.subtree:@td(VIRTUAL_CATALOG_B2B.id) price.USD:(0 TO) inStock_variations:true",
  "facet": "Brand price.USD",
  "first": 20
}
```

#### Facet Syntax Reference

The `facet` argument specifies which aggregations to return. Space-separated.

| Facet Pattern | Example | Description |
|--------------|---------|-------------|
| **Term facet** | `Brand` | Aggregate by Brand property values |
| **Price range facet** | `price.USD` | Aggregate price ranges in USD |
| **Multiple facets** | `Brand Color price.USD` | Multiple facets at once |

Response uses `term_facets` (for term facets) and `range_facets` (for price/range facets) — NOT `facets { values }`.

#### Sort Syntax

The `sort` argument is a string: `fieldName:asc` or `fieldName:desc`.

| Sort Example | Description |
|-------------|-------------|
| `name:asc` | Alphabetical by name |
| `price:asc` | Cheapest first |
| `price:desc` | Most expensive first |
| `createdDate:desc` | Newest first |
| `priority:desc` | By priority |

**IMPORTANT:** Always verify filter field names via introspection or by testing — filter keys depend on indexed properties and may vary per catalog configuration.

```graphql
# Get single product by ID
query product($id: String!, $storeId: String!) {
  product(id: $id, storeId: $storeId, cultureName: "en-US", currencyCode: "USD") {
    id name code description { content }
    properties { name value valueType }
    variations { id name code price { actual { amount } } }
  }
}
```

```graphql
# Get categories
query categories($storeId: String!) {
  categories(storeId: $storeId, cultureName: "en-US", first: 50) {
    totalCount
    items { id name slug hasParent childCategories { id name } }
  }
}
```

### xCart — Shopping Cart

> **CRITICAL:** All cart mutations use a `command` input object. Common base fields: `cartId, storeId!, cartName, userId!, currencyCode, cultureName, cartType`. `storeId` is always required. `userId` is required per type but **inferred from auth token** — omit in variables when authenticated. CartType returns **flat** money fields (`total`, `subTotal`, `discountTotal`) — NOT nested under `totals`. There is **NO `grandTotal`** — use `total`. Always verify field names via `{ __type(name: "InputTypeName") { inputFields { name } } }` before writing test cases.

```graphql
# Get or create cart
# NOTE: No createCart mutation exists — this query auto-creates a cart for the authenticated user
query cart($storeId: String!, $currencyCode: String!, $cultureName: String) {
  cart(storeId: $storeId, currencyCode: $currencyCode, cultureName: $cultureName) {
    id name itemsCount
    items { id productId name quantity listPrice { amount } extendedPrice { amount } }
    subTotal { amount }
    total { amount }
    discountTotal { amount }
    isValid validationErrors { errorCode errorMessage }
  }
}
# Variables: { "storeId": "${STORE_ID}", "currencyCode": "USD", "cultureName": "en-US" }
# IMPORTANT: CartType has FLAT money fields (subTotal, total, discountTotal) — NOT nested under "totals"
# IMPORTANT: The field is "total" NOT "grandTotal"
```

```graphql
# Add item to cart
mutation addItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id itemsCount
    items { id productId name quantity listPrice { amount } }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "productId": "product-id", "quantity": 1 } }
# userId is required per schema type but inferred from auth token when authenticated
# Verify InputAddItemType fields: { __type(name: "InputAddItemType") { inputFields { name } } }
```

```graphql
# Change cart item quantity
# NOTE: Mutation name is changeCartItemQuantity (NOT changeItemQuantity)
mutation changeCartItemQuantity($command: InputChangeCartItemQuantityType!) {
  changeCartItemQuantity(command: $command) {
    id itemsCount
    items { id quantity }
    subTotal { amount }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "lineItemId": "line-item-id", "quantity": 5 } }
```

```graphql
# Remove item from cart
# NOTE: Mutation name is removeCartItem (NOT removeItem)
mutation removeCartItem($command: InputRemoveItemType!) {
  removeCartItem(command: $command) {
    id itemsCount
    items { id }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "lineItemId": "line-item-id" } }
```

```graphql
# Clear cart
mutation clearCart($command: InputClearCartType!) {
  clearCart(command: $command) {
    id itemsCount
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD" } }
```

```graphql
# Add coupon
mutation addCoupon($command: InputAddCouponType!) {
  addCoupon(command: $command) {
    id
    coupons { code isAppliedSuccessfully }
    discountTotal { amount }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "couponCode": "COUPON-CODE" } }
```

```graphql
# Remove coupon
mutation removeCoupon($command: InputRemoveCouponType!) {
  removeCoupon(command: $command) {
    id
    coupons { code isAppliedSuccessfully }
    discountTotal { amount }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "couponCode": "COUPON-CODE" } }
```

```graphql
# Add or update cart shipment (set shipping address + method)
mutation addOrUpdateCartShipment($command: InputAddOrUpdateCartShipmentType!) {
  addOrUpdateCartShipment(command: $command) {
    id
    shipments {
      id shipmentMethodCode shipmentMethodOption
      deliveryAddress { city regionName postalCode countryCode line1 }
    }
    availableShippingMethods { code optionName price { amount } }
    shippingTotal { amount }
    total { amount }
  }
}
# Variables (address only): { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "shipment": { "deliveryAddress": { "city": "New York", "regionName": "NY", "postalCode": "10001", "countryCode": "US", "line1": "123 Test St" } } } }
# Variables (with method): { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "shipment": { "shipmentMethodCode": "FixedRate", "shipmentMethodOption": "Ground", "deliveryAddress": { ... } } } }
# Verify input: { __type(name: "InputAddOrUpdateCartShipmentType") { inputFields { name } } }
# See InputShipmentType for full shipment fields: deliveryAddress, shipmentMethodCode, shipmentMethodOption, fulfillmentCenterId, etc.
```

```graphql
# Add or update cart payment
mutation addOrUpdateCartPayment($command: InputAddOrUpdateCartPaymentType!) {
  addOrUpdateCartPayment(command: $command) {
    id
    payments { id paymentGatewayCode amount { amount } }
    total { amount }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "currencyCode": "USD", "payment": { "paymentGatewayCode": "DefaultManualPaymentMethod" } } }
# Verify input: { __type(name: "InputAddOrUpdateCartPaymentType") { inputFields { name } } }
# See InputPaymentType for full payment fields: paymentGatewayCode, billingAddress, amount, etc.
```

### xOrder — Orders

```graphql
# Create order from cart
mutation createOrderFromCart($command: InputCreateOrderFromCartType!) {
  createOrderFromCart(command: $command) {
    id number status
    items { id name quantity price { amount } }
    total { amount }
  }
}
# Variables: { "command": { "cartId": "cart-id" } }
# NOTE: createOrderFromCart uses command pattern (NOT individual cartId arg)
```

```graphql
# Get orders
query orders($filter: String, $first: Int, $sort: String) {
  orders(cultureName: "en-US", filter: $filter, first: $first, sort: $sort) {
    totalCount
    items {
      id number createdDate status
      total { amount formattedAmount }
      items { name quantity }
    }
  }
}
```

```graphql
# Get single order by ID
query order($id: String!) {
  order(id: $id, cultureName: "en-US") {
    id number status createdDate
    items { id name productId quantity price { amount } }
    addresses { city regionName postalCode countryCode }
    inPayments { id paymentMethod { code } status }
    subTotal { amount }
    shippingTotal { amount }
    taxTotal { amount }
    total { amount }
  }
}
```

### xProfile — User & Organization

```graphql
# Get current user
query me {
  me {
    id userName email
    contact { id firstName lastName fullName }
    organizationId
  }
}
```

```graphql
# Get organization
query organization($id: String!) {
  organization(id: $id) {
    id name
    contacts { items { id fullName emails } }
  }
}
```

---

---

## Known xAPI Mutation Names (Quick Reference)

> These are the verified mutation names as of March 2026. **Always confirm via introspection** — names may change.

| Operation | Correct Mutation Name | WRONG Names (Do NOT Use) |
|-----------|-----------------------|--------------------------|
| Add item to cart | `addItem` | |
| Change item quantity | `changeCartItemQuantity` | ~~changeItemQuantity~~ |
| Remove item from cart | `removeCartItem` | ~~removeItem~~ |
| Clear cart | `clearCart` | |
| Add coupon | `addCoupon` | |
| Remove coupon | `removeCoupon` | |
| Set shipping address/method | `addOrUpdateCartShipment` | ~~setShippingAddress~~, ~~updateShipment~~ |
| Set payment | `addOrUpdateCartPayment` | ~~setPayment~~, ~~updatePayment~~ |
| Create order from cart | `createOrderFromCart` | |

**All mutations use `command:` input pattern** — never individual arguments.

---

## REST API Common Operations

### Catalog

```bash
# List products
GET ${BACK_URL}/api/catalog/products?skip=0&take=20

# Get product by ID
GET ${BACK_URL}/api/catalog/products/{productId}

# Search products
POST ${BACK_URL}/api/catalog/search/products
{ "keyword": "bolt", "skip": 0, "take": 20, "catalogId": "catalog-id" }
```

### Orders

```bash
# List orders
POST ${BACK_URL}/api/order/customerOrders/search
{ "skip": 0, "take": 20, "sort": "createdDate:desc" }

# Get order by ID
GET ${BACK_URL}/api/order/customerOrders/{orderId}

# Get order by number
GET ${BACK_URL}/api/order/customerOrders/number/{orderNumber}
```

### Customers

```bash
# Search contacts
POST ${BACK_URL}/api/contacts/search
{ "keyword": "", "skip": 0, "take": 20 }

# Search organizations
POST ${BACK_URL}/api/members/search
{ "memberType": "Organization", "skip": 0, "take": 20 }
```

### Platform Health

```bash
# Health check
GET ${BACK_URL}/api/platform/healthcheck

# Platform version
GET ${BACK_URL}/api/platform
```

---

## Common Patterns

### Pagination
- REST: `skip` (offset) + `take` (limit) → response has `totalCount`
- GraphQL: `first` (limit) + `after` (cursor) → response has `totalCount` + `pageInfo`

### Error Handling
- REST: Standard HTTP status codes (400, 401, 403, 404, 500)
- GraphQL: Always 200 status — check `errors` array for failures
  ```json
  { "data": { "product": null }, "errors": [{ "message": "Product not found", "extensions": { "code": "NOT_FOUND" } }] }
  ```

### Store Context
- Most xAPI queries require `storeId`, `cultureName`, `currencyCode`
- Use environment: `STORE_ID` for storeId, `"en-US"` for default culture, `"USD"` for default currency

---

## pageContext (xFrontend)

Single optimized query for storefront bootstrap — aggregates store, user, slug resolution, and white-labeling into one call instead of 4 separate queries. Part of the **xFrontend** module.

**Expected response time:** ~200–400ms.

### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `domain` | String | Yes | Current domain — resolves store and URL context |
| `storeId` | String | Yes | Store to load config from |
| `cultureName` | String | Yes | Language for localized data |
| `permalink` | String | Yes | URL path — used to resolve `slugInfo` |
| `organizationId` | String | No | Org context for white-labeling override |
| `userId` | String | No | User context |

### Response Type: `PageContextResponseType`

| Field | Type | Description |
|-------|------|-------------|
| `slugInfo` | SlugInfoResponseType | Resolved slug — `entityInfo { id }` |
| `store` | StoreResponseType | Full store data (same shape as `store` query) |
| `whiteLabelingSettings` | WhiteLabelingSettingsType | Branding: `logoUrl`, `faviconUrl`, `themePresetName`, `footerLinks[]`, `mainMenuLinks[]` |
| `user` | UserType | Current user — `id`, `userName` |

### Full Query Example

```graphql
{
  pageContext(
    domain: "localhost"
    storeId: "${STORE_ID}"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "OrganizationId"
    userId: "UserId"
  ) {
    slugInfo {
      entityInfo { id }
    }
    store {
      storeId storeName storeUrl
      settings {
        quotesEnabled isSpa anonymousUsersAllowed
        emailVerificationEnabled emailVerificationRequired
      }
    }
    whiteLabelingSettings {
      logoUrl faviconUrl themePresetName
      footerLinks { title url priority childItems { title url priority } }
      mainMenuLinks { title url priority childItems { title url priority } }
    }
    user {
      id userName
    }
  }
}
```

### Example Response

```json
{
  "data": {
    "pageContext": {
      "slugInfo": { "entityInfo": { "id": "92ab56ae-4199-47dc-..." } },
      "store": { "storeId": "B2B-store" },
      "whiteLabelingSettings": {
        "logoUrl": "https://virtostart-main.govirto.com/cms-content/assets/.../logo.png"
      },
      "user": { "id": "UserId", "userName": "Anonymous" }
    }
  }
}
```

### Notes
- `slugInfo.entityInfo.id` resolves the entity (product, category, CMS page) for the current URL
- `whiteLabelingSettings` returns org-level branding when `organizationId` is set, falls back to store-level
- Invalid `organizationId` → `null` fields (HTTP 200, no error)
- Missing `storeId` → HTTP 200 with `errors[]`
- Querying without `mainMenuLinks` in the selection set still works (backward compatible)
- Source: [xFrontend/PageContext.md](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/xFrontend/PageContext.md)

---

## Store Settings

### StoreResponseType Fields

| Field | Type | Description |
|-------|------|-------------|
| `storeId` | String | Unique store identifier |
| `storeName` | String | Display name |
| `catalogId` | String | Linked product catalog ID |
| `storeUrl` | String | Storefront URL |
| `defaultLanguage` | LanguageType | `cultureName`, `nativeName`, `isInvariant`, `twoLetterLanguageName`, `twoLetterRegionName`, `threeLetterLanguageName`, `threeLetterRegionName` |
| `availableLanguages` | Array\<LanguageType\> | All configured languages |
| `defaultCurrency` | CurrencyType | `code`, `symbol` |
| `availableCurrencies` | Array\<CurrencyType\> | All configured currencies |
| `settings` | StoreSettingsType | Feature flags + SEO config |
| `graphQLSettings` | GraphQLSettingsType | GraphQL endpoint settings (CORS, allowed origins — fields not publicly documented) |
| `dynamicProperties` | DynamicPropertyValueType | Custom dynamic property values |

### StoreSettingsType Fields

| Field | Type | Description |
|-------|------|-------------|
| `quotesEnabled` | Boolean | Quotes / RFQ feature |
| `subscriptionEnabled` | Boolean | Recurring subscriptions |
| `taxCalculationEnabled` | Boolean | Tax calculation |
| `anonymousUsersAllowed` | Boolean | Guest browsing |
| `isSpa` | Boolean | Single-Page Application mode |
| `emailVerificationEnabled` | Boolean | Email verification flow |
| `emailVerificationRequired` | Boolean | Mandatory email verification |
| `createAnonymousOrderEnabled` | Boolean | Guest checkout orders |
| `defaultSelectedForCheckout` | Boolean | Default store at checkout |
| `seoLinkType` | String | SEO URL format (`None`, etc.) |
| `environmentName` | String | Environment label |
| `passwordRequirements` | PasswordOptionsType | Password policy |
| `modules` | Array\<ModuleSettingsType\> | Per-module settings / feature flags |

### GraphQL — Full Store Query

```graphql
query($storeId: String!, $cultureName: String) {
  store(storeId: $storeId, cultureName: $cultureName) {
    userId userName
    storeId storeName catalogId storeUrl
    defaultLanguage {
      isInvariant cultureName nativeName
      twoLetterLanguageName twoLetterRegionName
      threeLetterLanguageName threeLetterRegionName
    }
    availableLanguages { cultureName twoLetterLanguageName }
    defaultCurrency { code symbol }
    availableCurrencies { code symbol }
    settings {
      quotesEnabled subscriptionEnabled taxCalculationEnabled
      anonymousUsersAllowed isSpa
      emailVerificationEnabled emailVerificationRequired
      createAnonymousOrderEnabled defaultSelectedForCheckout
      seoLinkType environmentName
      modules { moduleId settings { name value } }
    }
  }
}
# Variables: { "storeId": "${STORE_ID}", "cultureName": "en-US" }
# Optional params: domain
```

### GraphQL — Module Settings (Feature Flags)

```graphql
query {
  store(storeId: "${STORE_ID}", cultureName: "en-US") {
    settings {
      modules { moduleId settings { name value } }
    }
  }
}
```

Example response (GA4 module):
```json
{ "moduleId": "VirtoCommerce.GoogleEcommerceAnalytics", "settings": [
  { "name": "GoogleAnalytics4.EnableTracking", "value": true },
  { "name": "GoogleAnalytics4.MeasurementId", "value": "GA-B2B-STORE" }
]}
```

### REST — Store Settings

```bash
GET ${BACK_URL}/api/stores/${STORE_ID}/settings?cultureName=en-US
```

Returns all public store settings including `modules[]` with `moduleId`, `name`, `value`.
