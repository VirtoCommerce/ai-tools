# API Test Case Patterns

> Reference for `test-management-specialist` writing API test cases in enriched CSV format.
> Read alongside `test-case-template.md` (column spec) and `xapi-query-ref.md` (query signatures).

---

## Step Tags by Layer

### REST API Steps (`[HTTP]`, `[AUTH]`, `[SETUP]`, `[TEARDOWN]`, `[WAIT]`)

```
[AUTH] POST {{BACK_URL}}/connect/token grant_type=password username={{ADMIN_EMAIL}} password={{ADMIN_PASSWORD}}
[SETUP] GET {{BACK_URL}}/api/... — capture baseline state before test
[HTTP] POST/GET/PUT/DELETE {{BACK_URL}}/api/... body: {...}
[WAIT] 2s for async processing (search reindex, event propagation)
[TEARDOWN] DELETE {{BACK_URL}}/api/... — remove created test data
```

### GraphQL xAPI Steps (`[GQL]`, `[AUTH]`, `[VAR]`, `[SETUP]`, `[TEARDOWN]`, `[WAIT]`)

> **CRITICAL:** Always verify mutation/query names and input types via introspection before writing steps.
> All cart mutations use `command:` input pattern with required fields: `storeId`, `userId`, `cultureName`, `currencyCode`.

```
[AUTH] POST {{BACK_URL}}/connect/token for {{USER_EMAIL}}
[SETUP] [GQL] query { cart(storeId: "{{STORE_ID}}" currencyCode: "USD" cultureName: "en-US") { id itemsCount } } — verify precondition
[GQL] mutation { addItem(command: { storeId: "{{STORE_ID}}" currencyCode: "USD" productId: "{{PRODUCT_ID}}" quantity: 1 }) { id itemsCount } }
[VAR] save response.data.addItem.id as {{CART_ID}}
[WAIT] 30s for search reindex (only after catalog mutations)
[TEARDOWN] [GQL] mutation { clearCart(command: { storeId: "{{STORE_ID}}" currencyCode: "USD" }) { id } }
```

**Common mutation name mistakes to avoid:**
- `removeItem` → correct: `removeCartItem`
- `changeItemQuantity` → correct: `changeCartItemQuantity`
- Individual args `addItem(cartId: "...", productId: "...")` → correct: `addItem(command: { ... })`
- `createOrderFromCart(cartId: "...")` → correct: `createOrderFromCart(command: { cartId: "..." })`

---

## Assertion Tags by Layer

### REST Assertions

| Tag | Use for |
|-----|---------|
| `[STATUS]` | HTTP status code: `200`, `201`, `400`, `401`, `403`, `404`, `500` |
| `[BODY]` | Response field exists, value matches, type correct |
| `[SCHEMA]` | Required fields all present: `id`, `name`, `code`, etc. |
| `[HEADER]` | `Content-Type`, `X-Content-Type-Options`, CORS |
| `[PERF]` | Response time threshold (CRUD < 1000ms, search < 500ms) |

### GraphQL Assertions

| Tag | Use for |
|-----|---------|
| `[ERRORS]` | `errors[]` is empty (happy path) OR contains expected error code (negative test) |
| `[DATA]` | `data.[field]` has expected value or structure |
| `[NULL]` | Field is null or non-null as expected |
| `[COUNT]` | `totalCount` or array length matches expectation |
| `[MATH]` | Calculated totals match formula (total.amount = subTotal.amount + shippingTotal.amount - discountTotal.amount) — use flat CartType fields, NO `grandTotal` |
| `[PERF]` | Query response time threshold |

### Cross-Layer Checks

| Tag | Use for |
|-----|---------|
| `[ROUNDTRIP]` | Mutation → query confirms data persisted |
| `[DB]` | GET after POST/PUT confirms persistence (REST) |
| `[ADMIN]` | Entity visible in Admin SPA after API create/update |
| `[STOREFRONT]` | Storefront UI reflects the API change |
| `[SEARCH]` | Search index updated after catalog/pricing changes (30-60s lag) |
| `[EVENT]` | Platform event/notification fired |
| `[CONSOLE]` | No JS errors if tested via browser |

---

## Coverage Checklists

### REST API — Per Endpoint Checklist

For every REST endpoint, generate test cases covering:

**CRUD Operations:**
- [ ] `GET` list: returns array + `totalCount`, pagination works (`skip`/`take`)
- [ ] `GET` by ID: all expected fields present, correct values
- [ ] `POST` create: 200/201, response has `id`, entity retrievable by GET after
- [ ] `PUT`/`PATCH` update: changed fields saved, unchanged fields intact, `modifiedDate` updated
- [ ] `DELETE`: 200, entity no longer returned by GET (404)

**Error Cases:**
- [ ] `GET` non-existent ID → 404, structured error body (no stack trace)
- [ ] `POST` empty body → 400 with field-level validation errors
- [ ] `POST` invalid field types → 400 with descriptive message
- [ ] `POST` duplicate unique key → 400 or 409 with clear message
- [ ] Any request without `Authorization` header → 401
- [ ] Request with valid token but insufficient role → 403
- [ ] Malformed JSON body → 400

**Pagination:**
- [ ] `skip=0&take=5` returns 5 items (if ≥5 exist)
- [ ] `skip=totalCount` returns empty array, `totalCount` unchanged
- [ ] `take=0` returns empty array, `totalCount` still correct

**Security:**
- [ ] No stack traces in any error response
- [ ] No internal server details in headers (version, framework)
- [ ] `X-Content-Type-Options: nosniff` present
- [ ] CORS allows only expected origins

**Performance:**
- [ ] List endpoint < 500ms
- [ ] Single-resource GET < 300ms
- [ ] POST/PUT create/update < 1000ms

---

### GraphQL xAPI — Per Operation Checklist

**For every Query:**
- [ ] Happy path: `errors[]` empty, `data` has expected structure
- [ ] Required arguments missing → `errors[]` contains validation error
- [ ] `storeId` wrong/non-existent → `errors[]` or empty `data`
- [ ] Pagination: `first` + `after` cursor, `totalCount` accurate
- [ ] No auth (anonymous) → public queries work, private queries return auth error
- [ ] Response time within threshold

**For every Mutation:**
- [ ] Happy path: `errors[]` empty, returned entity has correct values
- [ ] `[ROUNDTRIP]` query confirms mutation persisted
- [ ] Invalid input (missing required field) → `errors[]` with `errorCode`
- [ ] Duplicate/conflict → `errors[]` with specific code (not 500)
- [ ] Auth: unauthenticated call → `errors[]` with auth error (HTTP 200, not 401)
- [ ] Wrong user scope (e.g., another user's cart) → access denied error in `errors[]`
- [ ] `[MATH]` verify totals recalculated after cart mutations

**Invariant — applies to ALL mutations:**
```
Cross_Layer_Checks: [API] [mutationName] response errors[] is empty
Failure_Signals: errors[] non-empty in [mutationName] response
```

---

## Coverage Matrix by API Domain

### Authentication

| Test ID pattern | Scenario | Priority | Business Rule |
|----------------|----------|----------|---------------|
| AUTH-001 | Valid credentials → JWT issued | Critical | BL-AUTH-001 |
| AUTH-002 | Invalid password → 400, no token | Critical | BL-AUTH-001 |
| AUTH-003 | Non-existent user → 400 (no user enumeration) | High | BL-SEC-001 |
| AUTH-004 | Token refresh → new tokens issued | High | BL-AUTH-001 |
| AUTH-005 | Expired token on protected endpoint → 401 | High | BL-AUTH-001 |
| AUTH-006 | No Authorization header → 401 | Critical | BL-AUTH-001 |

### xCatalog / Catalog REST

| Test ID pattern | Scenario | Priority | Business Rule |
|----------------|----------|----------|---------------|
| CAT-001 | Search products by keyword → results + totalCount | High | BL-CAT-001 |
| CAT-002 | Get product by ID → all fields populated | High | BL-CAT-001 |
| CAT-003 | Search non-existent keyword → empty array, totalCount=0 | Medium | BL-CAT-001 |
| CAT-004 | Get product with variations → variations array populated | High | BL-CAT-002 |
| CAT-005 | Get product with tier pricing → price tiers in response | High | BL-PRICE-004 |
| CAT-006 | Create product (REST) → retrievable by ID | High | BL-CAT-001 |
| CAT-007 | Get categories with child hierarchy | Medium | BL-CAT-001 |
| CAT-008 | Product without price in requested currency → unavailable | High | BL-PRICE-005 |
| CAT-009 | Filter by category subtree: `category.subtree:<id>` → only products in category/subcategories | High | BL-CAT-001 |
| CAT-010 | Filter by price range: `price.USD:(0 TO)` → only products with price | High | BL-PRICE-001 |
| CAT-011 | Filter by stock: `inStock_variations:true` → only in-stock products | High | BL-CAT-001 |
| CAT-012 | Combined filter: `category.subtree:<id> price.USD:(0 TO) inStock_variations:true` → AND logic | High | BL-CAT-001 |
| CAT-013 | Facet response: `facet: "Brand"` → term_facets[] with counts matching filtered results | High | BL-CAT-001 |
| CAT-014 | Price range facet: `facet: "price.USD"` → range_facets[] with from/to/count | Medium | BL-PRICE-001 |
| CAT-015 | Sort: `sort: "price:asc"` → products ordered by price ascending | Medium | BL-CAT-001 |

### xCart Mutations

| Test ID pattern | Scenario | Priority | Business Rule |
|----------------|----------|----------|---------------|
| CART-001 | addItem → itemsCount increments, errors[] empty | Critical | BL-CART-001 |
| CART-002 | addItem with quantity=0 → errors[] with validation code | High | BL-CART-001 |
| CART-003 | addItem non-existent productId → errors[] | High | BL-CART-001 |
| CART-004 | changeItemQuantity → totals recalculated | Critical | BL-CART-001, BL-PRICE-004 |
| CART-005 | removeItem → itemsCount decrements, totals recalculated | Critical | BL-CART-001 |
| CART-006 | addCoupon valid code → isAppliedSuccessfully=true, discountTotal > 0 | Critical | BL-CART-003, BL-PROMO-001 |
| CART-007 | addCoupon invalid code → errors[] or isAppliedSuccessfully=false | High | BL-CART-003 |
| CART-008 | addCoupon: total = subTotal − discountTotal (math check, flat CartType fields) | Critical | BL-PRICE-001 |
| CART-009 | clearCart → itemsCount=0 | High | BL-CART-001 |
| CART-010 | Cart accessed by different user → access denied | High | BL-AUTH-002 |

### xOrder

| Test ID pattern | Scenario | Priority | Business Rule |
|----------------|----------|----------|---------------|
| ORD-001 | createOrderFromCart → status 'New', order number generated | Critical | BL-ORD-001 |
| ORD-002 | createOrderFromCart empty cart → errors[] | Critical | BL-ORD-001 |
| ORD-003 | query orders → sorted by createdDate desc, pagination works | High | BL-ORD-001 |
| ORD-004 | query order by ID → line items, totals, status all present | High | BL-ORD-001 |
| ORD-005 | Order total = sum(line items) + shipping - discounts | Critical | BL-PRICE-001, BL-ORD-002 |
| ORD-006 | query orders without auth → errors[] with auth error | Critical | BL-AUTH-002 |

### Pricing REST

| Test ID pattern | Scenario | Priority | Business Rule |
|----------------|----------|----------|---------------|
| PRICE-001 | Evaluate price for qty=1 → list and sale prices present | High | BL-PRICE-001 |
| PRICE-002 | Tier pricing: qty=9 vs qty=10 → price drops at threshold | High | BL-PRICE-004 |
| PRICE-003 | Currency switch → price from that currency's price list (not conversion) | High | BL-PRICE-005 |

### Error Handling (cross-domain)

| Test ID pattern | Scenario | Priority |
|----------------|----------|----------|
| ERR-001 | REST 404 response has `message` field, no stack trace | High |
| ERR-002 | REST 400 has field-level `errors[]` array | High |
| ERR-003 | GraphQL malformed query → `errors[].message` contains syntax info | High |
| ERR-004 | GraphQL missing required arg → `errors[].extensions.code` present | High |
| ERR-005 | REST 500 does not expose stack trace or internal paths | Critical |
| ERR-006 | GraphQL mutation error: HTTP 200 but errors[] non-empty (not a 4xx) | Critical |

---

## Negative Test Patterns

Always include these for every new operation:

### REST negative set (minimum 3 per endpoint):
1. **Missing auth** → 401
2. **Invalid/missing required field** → 400 with validation message
3. **Non-existent resource** → 404 with structured body

### GraphQL negative set (minimum 3 per mutation):
1. **Missing required command field** (e.g., omit `storeId` or `productId`) → `errors[]` with validation error
2. **Unauthenticated call** (no Bearer token) → `errors[]` with auth error (still HTTP 200)
3. **Invalid ID/reference** (e.g., non-existent `productId` in addItem) → `errors[]` with `NOT_FOUND` or similar code
4. **Empty/null command** → `errors[]` with validation error (not 500)

### High-value negative cases (add when applicable):
- Concurrent updates to same resource (optimistic concurrency)
- Boundary values: `quantity=0`, `quantity=-1`, `take=0`, `skip > totalCount`
- Oversized payloads / extremely long strings
- SQL injection attempt in search/filter parameters
- XSS payload in string fields

---

## Failure Signals Reference

Common failure signals to include in the `Failure_Signals` column:

**REST API:**
- `5xx on POST/PUT/DELETE request`
- `Response time > 3s`
- `Response missing required field: id`
- `GET after POST returns 404`
- `400 response without field-level errors`
- `Error response contains stack trace`

**GraphQL xAPI:**
- `errors[] non-empty in [mutationName] response`
- `HTTP non-200 status on /graphql`
- `data.[field] is null (unexpected)`
- `totalCount=0 when results expected`
- `Response time > 2s on simple query`
- `isAppliedSuccessfully=false on valid coupon`

---

## Worked Skeleton — REST CRUD

Fill in the blanks for any REST create endpoint:

```csv
{ID},"Create {Resource} — Happy Path","API > {Module} > CRUD",High,{BL-CODE},"ECL-14.1",
"Admin authenticated with {{ADMIN_EMAIL}}, no duplicate {resource} exists",
"admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}, back_url={{BACK_URL}}",
"[AUTH] POST {{BACK_URL}}/connect/token grant_type=password username={{ADMIN_EMAIL}} password={{ADMIN_PASSWORD}}
[SETUP] GET {{BACK_URL}}/api/{endpoint} — note current count
[HTTP] POST {{BACK_URL}}/api/{endpoint} body: { ...minimal valid payload... }",
"[STATUS] 200 or 201
[BODY] response has non-empty id field
[BODY] response.{key_field} == expected value
[SCHEMA] response has required fields: id, {field1}, {field2}
[PERF] response time < 1000ms",
"[DB] GET {{BACK_URL}}/api/{endpoint}/{{created_id}} returns the resource
[ADMIN] resource visible in Admin SPA
[EVENT] creation event fired (if applicable)",
"5xx on POST, response missing id field, GET after create returns 404, response time > 3s",
"[TEARDOWN] DELETE {{BACK_URL}}/api/{endpoint}?ids={{created_id}}",
{VCST-XXXX},Automated
```

## Worked Skeleton — GraphQL Mutation

Fill in the blanks for any xAPI mutation. **Before using, verify mutation name and input type via introspection.**

```csv
{ID},"[MutationName] — Happy Path","GraphQL > {Module} > {Operation}",{Priority},{BL-CODE},{ECL-CODE},
"User authenticated as {{USER_EMAIL}}, {preconditions}",
"back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, store_id={{STORE_ID}}, {other_vars}",
"[AUTH] POST {{BACK_URL}}/connect/token for {{USER_EMAIL}}
[SETUP] [GQL] query to verify precondition state
[GQL] mutation { {mutationName}(command: { storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" {operation-specific-fields} }) { id {fields} } }
[VAR] save {field} as {{{VAR_NAME}}}",
"[ERRORS] errors[] is empty
[DATA] {field} == expected value
[COUNT] {collection}.length incremented/decremented by 1
[MATH] total.amount = subTotal.amount + shippingTotal.amount - discountTotal.amount (flat CartType fields)",
"[API] {mutationName} response errors[] is empty
[ROUNDTRIP] query {entityName} by id confirms mutation persisted
[STOREFRONT] {{FRONT_URL}}/... reflects the change (if applicable)",
"errors[] non-empty in {mutationName} response, {field} unchanged after mutation, response time > 2s",
"[TEARDOWN] {reverseMutation}(command: { storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" ... }) to restore state",
{VCST-XXXX},Automated
```

### CartType Return Fields — Common Mistakes

CartType has **flat** money fields — NOT nested under `totals`:
- `total { amount }` — NOT ~~`totals { grandTotal { amount } }`~~
- `subTotal { amount }` — NOT ~~`totals { subTotal { amount } }`~~
- `discountTotal { amount }`, `shippingTotal { amount }`, `taxTotal { amount }` — all flat
- There is **NO `grandTotal`** field — use `total`

MoneyType structure: `{ amount currency { code } formattedAmount }` — NOT `{ amount currencyCode }`

### Mandatory Cart Mutation Command Fields

Every xCart mutation command MUST include `storeId!` (required). `userId!` is required per schema type but inferred from auth token when authenticated.

| Field | Source | Notes |
|-------|--------|-------|
| `storeId` | `{{STORE_ID}}` | **Required** — always include |
| `currencyCode` | `"USD"` | Include for pricing context |
| `userId` | (omit when authenticated) | Required per type, but server infers from token |
| `cultureName` | `"en-US"` | Optional — include for localized responses |

Plus operation-specific fields:

| Mutation | Additional Required Fields |
|----------|--------------------------|
| `addItem` | `productId`, `quantity` |
| `changeCartItemQuantity` | `lineItemId`, `quantity` |
| `removeCartItem` | `lineItemId` |
| `addCoupon` | `couponCode` |
| `removeCoupon` | `couponCode` |
| `addOrUpdateCartShipment` | `shipment: { deliveryAddress: {...} }` |
| `addOrUpdateCartPayment` | `payment: { paymentGatewayCode, amount }` |
| `clearCart` | (base fields only) |
| `createOrderFromCart` | `cartId` |
