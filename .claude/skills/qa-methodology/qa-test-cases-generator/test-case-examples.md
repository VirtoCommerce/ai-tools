# Test Case Examples — Layer-Specific Worked Examples

> Companion to `test-case-template.md`. Load this file when you need a concrete reference for a specific layer.
> For column definitions and tag tables, see `test-case-template.md`.
> GraphQL queries/mutations match the **real vc-frontend xAPI operations** — use `command` input types, not inline arguments.

---

## REST API — API-042: Create Product

```csv
API-042,"Create Product — Catalog REST","API > Catalog > CRUD",High,BL-CAT-001,"ECL-14.1","Admin authenticated with {{ADMIN_EMAIL}}, target catalog exists","admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}, back_url={{BACK_URL}}, store_id={{STORE_ID}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password username={{ADMIN_EMAIL}} password={{ADMIN_PASSWORD}}
[SETUP] note current product count via GET {{BACK_URL}}/api/catalog/products?skip=0&take=20
[HTTP] POST {{BACK_URL}}/api/catalog/products body: {""code"":""QA-TEST-042"",""name"":""API Test Product"",""catalogId"":""{{CATALOG_ID}}""}
[WAIT] 2s for indexing","[STATUS] 200 or 201 on POST
[BODY] response contains product id (non-empty string)
[BODY] response.code == ""QA-TEST-042""
[SCHEMA] response has fields: id, code, name, catalogId
[PERF] response time < 1000ms","[DB] GET {{BACK_URL}}/api/catalog/products/{{created_id}} returns the product
[ADMIN] product visible in Admin > Catalog > Products grid
[SEARCH] after 30-60s reindex, POST {{BACK_URL}}/api/catalog/search/products {""keyword"":""QA-TEST-042""} returns the product","5xx on POST, response missing id field, GET after create returns 404, response time > 3s","[TEARDOWN] DELETE {{BACK_URL}}/api/catalog/products?ids={{created_id}}",VCST-XXXX,Automated
```

---

## GraphQL xAPI — GQL-042: Add Coupon to Cart (via GraphiQL UI)

> **All GraphQL tests execute in the GraphiQL UI** at `{{BACK_URL}}/ui/graphiql`.
> GraphiQL uses CodeMirror — use `browser_type` (NOT `browser_fill`). See `graphiql-interaction.md` for the full interaction guide.
> **Use real xAPI signatures:** mutations take `$command` input types; queries take individual parameters. See `xapi-query-ref.md`.

```csv
GQL-042,"Add Coupon to Cart — addCoupon Mutation via GraphiQL","GraphQL > xCart > Coupons",High,"BL-CART-003, BL-PROMO-001","ECL-14.1, ECL-5.1","Cart exists with items, valid coupon code available, OAuth2 bearer token obtained","back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, store_id={{STORE_ID}}, coupon_code={{COUPON_CODE}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password for {{USER_EMAIL}} → save bearer token
[NAV] {{BACK_URL}}/ui/graphiql
[WAIT] GraphiQL editor loaded
[ACT] click Headers tab → clear editor (Ctrl+A, Backspace) → type: {""Authorization"": ""Bearer {{TOKEN}}""}
[ACT] click Variables tab → clear (Ctrl+A, Backspace) → type: {""command"": {""storeId"": ""{{STORE_ID}}"", ""cultureName"": ""en-US"", ""currencyCode"": ""USD"", ""couponCode"": ""{{COUPON_CODE}}""}}
[ACT] click query editor → clear (Ctrl+A, Backspace)
[ACT] type mutation: mutation AddCoupon($command: InputAddCouponType!) { addCoupon(command: $command) { id coupons { code isAppliedSuccessfully } totals { discountTotal { amount } subTotal { amount } grandTotal { amount } } } }
[ACT] click Execute (▶) button or press Ctrl+Enter
[WAIT] response panel shows result
[READ] snapshot response panel or evaluate: document.querySelector('.result-window .CodeMirror').CodeMirror.getValue()
[VAR] save discountTotal.amount as {{DISCOUNT}}","[RESPONSE] response panel contains data (no red error banner)
[DATA] data.addCoupon.coupons contains entry with code == {{COUPON_CODE}}
[DATA] coupons[].isAppliedSuccessfully == true
[MATH] grandTotal.amount = subTotal.amount - discountTotal.amount
[COUNT] coupons array length incremented by 1","[ROUNDTRIP] clear editor → type cart query → execute → coupons still applied, totals unchanged
[STOREFRONT] {{FRONT_URL}}/cart shows discount line and updated total
[CONSOLE] no JS errors in GraphiQL during execution","errors[] non-empty in response panel, discountTotal.amount == 0, coupon not in coupons array, GraphiQL shows network error or red error banner","[TEARDOWN] type removeCoupon mutation: mutation RemoveCoupon($command: InputRemoveCouponType!) { removeCoupon(command: $command) { id coupons { code } } } with variables {""command"": {""storeId"": ""{{STORE_ID}}"", ""cultureName"": ""en-US"", ""currencyCode"": ""USD"", ""couponCode"": ""{{COUPON_CODE}}""}} → execute to restore cart state",VCST-XXXX,Automated
```

---

## GraphQL xAPI — GQL-043: Add Item to Cart (via GraphiQL UI)

> Demonstrates the `addItem` mutation with `InputAddItemType!` command pattern.

```csv
GQL-043,"Add Item to Cart — addItem Mutation via GraphiQL","GraphQL > xCart > Items",Critical,"BL-CART-001, BL-GQL-004","ECL-14.1, ECL-2.1","Cart exists (or will be auto-created); product ID known; OAuth2 bearer token obtained","back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, store_id={{STORE_ID}}, product_id={{TEST_SKU}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password for {{USER_EMAIL}} → save bearer token
[NAV] {{BACK_URL}}/ui/graphiql
[WAIT] GraphiQL editor loaded
[ACT] click Headers tab → clear (Ctrl+A, Backspace) → type: {""Authorization"": ""Bearer {{TOKEN}}""}
[ACT] click Variables tab → clear (Ctrl+A, Backspace) → type: {""command"": {""storeId"": ""{{STORE_ID}}"", ""cultureName"": ""en-US"", ""currencyCode"": ""USD"", ""productId"": ""{{TEST_SKU}}"", ""quantity"": 2}}
[ACT] click query editor → clear (Ctrl+A, Backspace)
[ACT] type mutation: mutation AddItem($command: InputAddItemType!) { addItem(command: $command) { id itemsCount items { id productId name quantity listPrice { amount } extendedPrice { amount } } totals { grandTotal { amount } } } }
[ACT] click Execute (▶) or Ctrl+Enter
[WAIT] response panel shows result
[READ] read response — save cart id and lineItemId","[RESPONSE] response panel shows data without error banner
[ERRORS] errors[] absent or empty
[DATA] itemsCount incremented by 1
[DATA] items[] contains entry with productId == {{TEST_SKU}}
[DATA] items[].quantity == 2
[MATH] items[].listPrice.amount > 0
[MATH] extendedPrice.amount == listPrice.amount × quantity (within rounding)","[ROUNDTRIP] clear editor → type cart query: query { cart(storeId: ""{{STORE_ID}}"" cultureName: ""en-US"" currencyCode: ""USD"") { id itemsCount items { productId quantity } } } → execute → item present
[CONSOLE] no JS errors in GraphiQL","errors[] non-empty; itemsCount not incremented; quantity wrong; listPrice.amount == 0; productId mismatch","[TEARDOWN] type removeCartItems mutation: mutation RemoveCartItems($command: InputRemoveItemsType!) { removeCartItems(command: $command) { id itemsCount } } with variables referencing the lineItemId",VCST-XXXX,Automated
```

---

## GraphQL xAPI — GQL-044: Search Products Query (via GraphiQL UI)

> Demonstrates the `products` query with real field selection matching vc-frontend's `SearchProducts` operation.

```csv
GQL-044,"Search Products — products Query via GraphiQL","GraphQL > xCatalog > Search",Critical,BL-GQL-002,"ECL-2.1, ECL-8.1","GraphiQL UI accessible; products exist in catalog","back_url={{BACK_URL}}, store_id={{STORE_ID}}, keyword=""bolt""","[NAV] {{BACK_URL}}/ui/graphiql
[WAIT] GraphiQL editor loaded
[ACT] click Variables tab → clear (Ctrl+A, Backspace) → type: {""storeId"": ""{{STORE_ID}}"", ""keyword"": ""bolt"", ""first"": 20}
[ACT] click query editor → clear (Ctrl+A, Backspace)
[ACT] type query: query SearchProducts($storeId: String!, $keyword: String, $first: Int) { products(storeId: $storeId keyword: $keyword first: $first cultureName: ""en-US"" currencyCode: ""USD"") { totalCount items { id name code price { actual { amount formattedAmount } list { amount formattedAmount } } availabilityData { isAvailable availableQuantity } images { url } } } }
[GQL] click Execute (▶) or Ctrl+Enter
[WAIT] response panel shows result
[READ] read response from response panel","[RESPONSE] response panel shows data without error banner
[DATA] data.products.totalCount > 0 for known keyword
[DATA] items[] non-empty; each item has id, name, code
[DATA] price.actual.amount > 0 for available products
[DATA] availabilityData.isAvailable == true for in-stock items
[DATA] images[].url is a valid URL or images[] is empty (not null)
[ERRORS] no errors[] in response","[ROUNDTRIP] re-execute same query → same totalCount returned
[COMPARE] search with empty keyword returns broader results (totalCount ≥ keyword result)
[CONSOLE] no JS errors in GraphiQL","errors[] non-empty; totalCount == 0 for known keyword; missing id/name/code; price.actual null for available product; GraphiQL shows error banner",none,xAPI,Automated
```

---

## GraphQL xAPI — GQL-045: Create Order from Cart (via GraphiQL UI)

> Demonstrates the `createOrderFromCart` mutation with `InputCreateOrderFromCartType!`.

```csv
GQL-045,"Create Order from Cart — createOrderFromCart Mutation","GraphQL > xOrder > Create",Critical,"BL-ORD-001, BL-GQL-004","ECL-14.1, ECL-2.1","Cart has items, shipping address set, payment initialized; OAuth2 bearer token obtained","back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, cart_id={{CART_ID}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password for {{USER_EMAIL}} → save bearer token
[NAV] {{BACK_URL}}/ui/graphiql
[WAIT] GraphiQL editor loaded
[ACT] click Headers tab → clear (Ctrl+A, Backspace) → type: {""Authorization"": ""Bearer {{TOKEN}}""}
[ACT] click Variables tab → clear (Ctrl+A, Backspace) → type: {""command"": {""cartId"": ""{{CART_ID}}""}}
[ACT] click query editor → clear (Ctrl+A, Backspace)
[ACT] type mutation: mutation CreateOrderFromCart($command: InputCreateOrderFromCartType!) { createOrderFromCart(command: $command) { id number status createdDate items { id name quantity price { amount } } total { amount } } }
[GQL] click Execute (▶) or Ctrl+Enter
[WAIT] response panel shows result
[READ] read response — save order id and number","[RESPONSE] response panel shows data without error banner
[ERRORS] errors[] absent or empty
[DATA] data.createOrderFromCart.id is non-empty UUID
[DATA] number is non-empty (order number assigned)
[DATA] status == ""New"" or known initial status
[DATA] items[] matches cart line items (count and names)
[MATH] total.amount > 0 and matches cart grandTotal","[ADMIN] order visible in Admin > Orders with matching number
[REST] GET {{BACK_URL}}/api/order/customerOrders/number/{{order_number}} returns the order
[ROUNDTRIP] query orders in GraphiQL: query { orders(cultureName: ""en-US"" sort: ""createdDate:desc"" first: 1) { items { id number status } } } → new order appears first
[CONSOLE] no JS errors in GraphiQL","errors[] non-empty; createOrderFromCart returns null; order number empty; status unexpected; total.amount == 0; order not visible in Admin","[TEARDOWN] none (order created is test evidence — clean up via Admin if needed)",VCST-XXXX,Automated
```

---

## GraphQL xAPI — GQL-046: Get User Profile (via GraphiQL UI)

> Demonstrates the `me` query for current user profile.

```csv
GQL-046,"Get Current User Profile — me Query","GraphQL > xProfile > User",High,BL-GQL-002,"ECL-2.1","User authenticated; auth header set in GraphiQL","back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password for {{USER_EMAIL}} → save bearer token
[NAV] {{BACK_URL}}/ui/graphiql
[WAIT] GraphiQL editor loaded
[ACT] click Headers tab → clear (Ctrl+A, Backspace) → type: {""Authorization"": ""Bearer {{TOKEN}}""}
[ACT] click query editor → clear (Ctrl+A, Backspace)
[ACT] type query: query { me { id userName email contact { id firstName lastName fullName } organizationId } }
[GQL] click Execute (▶) or Ctrl+Enter
[WAIT] response panel shows result
[READ] read response — verify user data","[RESPONSE] response panel shows data without error banner
[DATA] data.me.id is non-empty string
[DATA] userName matches {{USER_EMAIL}}
[DATA] email matches {{USER_EMAIL}}
[DATA] contact.fullName is non-empty
[DATA] organizationId is null (personal) or valid UUID (org user)
[ERRORS] no errors[] in response","[ROUNDTRIP] re-execute → same user data returned
[CONSOLE] no JS errors in GraphiQL
[NEGATIVE] remove auth header → execute → returns anonymous user or auth error","errors[] non-empty; me returns null; userName mismatch; contact null for known user",none,xAPI,Automated
```

---

## Admin UI — ADM-042: Create Coupon

```csv
ADM-042,"Create Coupon — Marketing Admin","Admin > Marketing > Coupons",High,BL-PROMO-001,,"Admin logged in as {{ADMIN_EMAIL}}, Marketing module enabled","admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}, back_url={{BACK_URL}}","[NAV] {{BACK_URL}} → login as {{ADMIN_EMAIL}}
[NAV] Menu → Marketing → Coupons
[WAIT] coupons list blade loaded
[ACT] click 'Add' button in toolbar
[BLADE] new coupon blade opens
[ACT] fill 'Coupon Code': QA-COUPON-042
[ACT] fill 'Max Uses': 100
[ACT] select 'Promotion': first available promotion from dropdown
[ACT] set 'Expiration Date': 30 days from now
[SAVE] click 'Save' in blade toolbar
[WAIT] success notification","[TOAST] success message contains 'saved' or 'created'
[BLADE] coupon detail blade shows saved values
[GRID] coupons list contains row with code 'QA-COUPON-042'
[FORM] all field values match what was entered","[API] GET /api/marketing/coupons returns the new coupon
[STOREFRONT] coupon code QA-COUPON-042 is accepted at checkout (after applying)
[CONSOLE] no JS errors during create flow
[NETWORK] no 4xx/5xx responses","Blade shows validation error instead of saving, save spinner >5s, coupon not in grid after save, 5xx on save API call","[TEARDOWN] delete coupon QA-COUPON-042 via Admin or API",VCST-XXXX,Automated
```

---

## E2E Cross-Layer — E2E-042: Apply Coupon Full Flow

> E2E tests cross all layers. The GraphQL verification step uses the **real `cart` query** and **`addCoupon` mutation** signatures from vc-frontend.

```csv
E2E-042,"Apply Coupon — Full Flow: Storefront → GraphQL → Admin","E2E > Coupons > Apply",Critical,"BL-PROMO-001, BL-CART-003","ECL-5.1, ECL-14.1","User logged in on storefront, cart has items, coupon QA-COUPON-042 exists and is active","front_url={{FRONT_URL}}, back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, coupon_code={{COUPON_CODE}}, admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}, store_id={{STORE_ID}}","--- STOREFRONT ---
[NAV] {{FRONT_URL}}/cart
[WAIT] cart page loaded with items
[ACT] fill 'Coupon Code' input: {{COUPON_CODE}}
[ACT] click 'Apply Coupon' button
[WAIT] discount applied — total updated
--- GRAPHQL (verify via xAPI) ---
[AUTH] POST {{BACK_URL}}/connect/token grant_type=password for {{USER_EMAIL}} → save token
[GQL] POST {{BACK_URL}}/graphql with Authorization header; query: query { cart(storeId: ""{{STORE_ID}}"" cultureName: ""en-US"" currencyCode: ""USD"") { id coupons { code isAppliedSuccessfully } totals { discountTotal { amount } grandTotal { amount } subTotal { amount } } isValid validationErrors { errorCode errorMessage } } }
--- ADMIN ---
[NAV] {{BACK_URL}} → login as {{ADMIN_EMAIL}}
[NAV] Menu → Marketing → Coupons
[GRID] search for {{COUPON_CODE}}
[WAIT] coupon row found","--- STOREFRONT ---
[DOM] success message: coupon applied
[DOM] discount line visible in order summary
[MATH] displayed total = subtotal - discount
--- GRAPHQL ---
[ERRORS] cart query errors[] is empty
[DATA] coupons[].code == {{COUPON_CODE}}
[DATA] coupons[].isAppliedSuccessfully == true
[MATH] grandTotal.amount == subTotal.amount - discountTotal.amount
[DATA] isValid == true; validationErrors[] empty
--- ADMIN ---
[GRID] coupon usage count incremented","[CONSOLE] no JS errors on storefront during apply
[NETWORK] no 5xx on /graphql
[ROUNDTRIP] remove coupon on storefront → re-query cart via GraphQL → coupons[] empty, discountTotal == 0","Coupon input shows error instead of success, discount amount is 0, GraphQL errors[] non-empty, total unchanged after apply, admin coupon usage not incremented","[TEARDOWN] mutation RemoveCoupon($command: InputRemoveCouponType!) { removeCoupon(command: $command) { id coupons { code } } } with {""command"": {""storeId"": ""{{STORE_ID}}"", ""cultureName"": ""en-US"", ""currencyCode"": ""USD"", ""couponCode"": ""{{COUPON_CODE}}""}} + sign out of admin",VCST-XXXX,Automated
```

---

## Migration from Legacy TestRail Format

| Legacy Column | New Column(s) | Notes |
|---------------|--------------|-------|
| `Type` | — | Removed |
| `Estimate` | — | Removed |
| `Preconditions` | `Preconditions` + `Test_Data` | Split: prose → Preconditions; `{{VAR}}` bindings → Test_Data |
| `Steps` | `Steps` + `Assertions` | Split: actions → Steps (with type tags); expected outcomes → Assertions |
| `Expected Result` | `Assertions` + `Cross_Layer_Checks` | UI assertions → Assertions; API/console → Cross_Layer_Checks |
| — | `Business_Rule` | New — map to BL-* from `business-logic.md` |
| — | `Edge_Case_Refs` | New — map to ECL sections |
| — | `Failure_Signals` | New — early warning patterns |
| — | `Cleanup` | New — state restoration |

---

## GraphQL Signature Quick Reference (for test case authoring)

> Real operation signatures from vc-frontend. Always use `$command` input types for mutations. See `xapi-query-ref.md` for full examples with variables.

### Mutations (require auth + command input)

| Operation | Input Type | Key Return Fields |
|-----------|-----------|-------------------|
| `addItem(command: $command)` | `InputAddItemType!` | `id, itemsCount, items { productId quantity listPrice { amount } }` |
| `removeCartItems(command: $command)` | `InputRemoveItemsType!` | `id, itemsCount` |
| `changeCartItemQuantity(command: $command)` | `InputChangeCartItemQuantityType!` | `id, items { quantity }, totals { subTotal { amount } }` |
| `addCoupon(command: $command)` | `InputAddCouponType!` | `id, coupons { code isAppliedSuccessfully }, totals { discountTotal { amount } }` |
| `removeCoupon(command: $command)` | `InputRemoveCouponType!` | `id, coupons { code }` |
| `clearCart(command: $command)` | `InputClearCartType!` | `id, itemsCount` |
| `createOrderFromCart(command: $command)` | `InputCreateOrderFromCartType!` | `id, number, status, items { name quantity price { amount } }, total { amount }` |
| `updateMemberAddresses(command: $command)` | `InputUpdateMemberAddressType!` | `id, addresses { items { ... } }` |
| `initializeCartPayment(command: $command)` | `InputInitializeCartPaymentType!` | `isSuccess, errorMessage, actionRedirectUrl, paymentActionType` |

### Queries (individual parameters)

| Operation | Key Parameters | Key Return Fields |
|-----------|---------------|-------------------|
| `products(storeId, keyword, first, ...)` | `storeId!, currencyCode!, keyword, first, after, facetQuery, filter` | `totalCount, items { id name code price { actual { amount } } availabilityData { isAvailable } }` |
| `product(id, storeId, ...)` | `id!, storeId!, currencyCode!, cultureName` | `id, name, code, properties { name value }, variations { id price { actual { amount } } }` |
| `categories(storeId, ...)` | `storeId!, cultureName, first` | `totalCount, items { id name slug childCategories { id name } }` |
| `cart(storeId, ...)` | `storeId!, cultureName!, currencyCode!` | `id, itemsCount, items { productId quantity }, totals { grandTotal { amount } }, isValid` |
| `orders(filter, sort, first, ...)` | `cultureName, filter, sort, first, after` | `totalCount, items { id number status total { amount } }` |
| `me` | (none — uses auth token) | `id, userName, email, contact { fullName }, organizationId` |
| `pageContext(domain, storeId, ...)` | `domain!, storeId!, cultureName!, permalink!` | `slugInfo, store { storeId settings { ... } }, whiteLabelingSettings, user` |

### Common Command Fields

All cart mutation commands include store context fields:
```json
{
  "command": {
    "storeId": "{{STORE_ID}}",
    "cultureName": "en-US",
    "currencyCode": "USD",
    ...operation-specific fields
  }
}
```
