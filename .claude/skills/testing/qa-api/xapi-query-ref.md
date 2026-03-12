# Virto Commerce xAPI & REST API Quick Reference

> Ready-to-use query/mutation examples for testing. All examples use environment variables from `config.js`.

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
query searchProducts($storeId: String!, $keyword: String, $first: Int) {
  products(
    storeId: $storeId
    keyword: $keyword
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
# Variables: { "storeId": "${STORE_ID}", "keyword": "bolt", "first": 20 }
```

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

```graphql
# Get or create cart
query cart($storeId: String!, $cultureName: String!, $currencyCode: String!) {
  cart(storeId: $storeId, cultureName: $cultureName, currencyCode: $currencyCode) {
    id name itemsCount
    items { id productId name quantity listPrice { amount } extendedPrice { amount } }
    totals { subTotal { amount } grandTotal { amount } }
    isValid validationErrors { errorCode errorMessage }
  }
}
# Variables: { "storeId": "${STORE_ID}", "cultureName": "en-US", "currencyCode": "USD" }
```

```graphql
# Add item to cart
mutation addItem($command: InputAddItemType!) {
  addItem(command: $command) {
    id itemsCount
    items { id productId name quantity }
    totals { grandTotal { amount } }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "cultureName": "en-US", "currencyCode": "USD", "productId": "product-id", "quantity": 1 } }
```

```graphql
# Remove item from cart
mutation removeItem($command: InputRemoveItemType!) {
  removeItem(command: $command) {
    id itemsCount
    totals { grandTotal { amount } }
  }
}
# Variables: { "command": { "storeId": "${STORE_ID}", "cultureName": "en-US", "currencyCode": "USD", "lineItemId": "line-item-id" } }
```

```graphql
# Clear cart
mutation clearCart($command: InputClearCartType!) {
  clearCart(command: $command) {
    id itemsCount
  }
}
```

```graphql
# Add coupon
mutation addCoupon($command: InputAddCouponType!) {
  addCoupon(command: $command) {
    id
    coupons { code isAppliedSuccessfully }
    totals { discountTotal { amount } grandTotal { amount } }
  }
}
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
