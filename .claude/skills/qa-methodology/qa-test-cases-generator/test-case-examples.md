# Test Case Examples — Layer-Specific Worked Examples

> Companion to `test-case-template.md`. Load this file when you need a concrete reference for a specific layer.
> For column definitions and tag tables, see `test-case-template.md`.

---

## REST API — API-042: Create Product

```csv
API-042,"Create Product — Catalog REST","API > Catalog > CRUD",High,BL-CAT-001,"ECL-14.1","Admin authenticated with {{ADMIN_EMAIL}}, target catalog exists","admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}, back_url={{BACK_URL}}, store_id={{STORE_ID}}","[AUTH] POST {{BACK_URL}}/connect/token grant_type=password username={{ADMIN_EMAIL}} password={{ADMIN_PASSWORD}}
[SETUP] note current product count via GET {{BACK_URL}}/api/catalog/products?storeId={{STORE_ID}}
[HTTP] POST {{BACK_URL}}/api/catalog/products body: {""code"":""QA-TEST-042"",""name"":""API Test Product"",""catalogId"":""{{CATALOG_ID}}""}
[WAIT] 2s for indexing","[STATUS] 200 or 201 on POST
[BODY] response contains product id (non-empty string)
[BODY] response.code == ""QA-TEST-042""
[SCHEMA] response has fields: id, code, name, catalogId
[PERF] response time < 1000ms","[DB] GET {{BACK_URL}}/api/catalog/products/{{created_id}} returns the product
[ADMIN] product visible in Admin > Catalog > Products grid
[SEARCH] after 30-60s reindex, product searchable by code","5xx on POST, response missing id field, GET after create returns 404, response time > 3s","[TEARDOWN] DELETE {{BACK_URL}}/api/catalog/products?ids={{created_id}}",VCST-XXXX,Automated
```

---

## GraphQL xAPI — GQL-042: Add Coupon to Cart

```csv
GQL-042,"Add Coupon to Cart — xCart Mutation","GraphQL > xCart > Coupons",High,"BL-CART-003, BL-PROMO-001","ECL-14.1, ECL-5.1","User authenticated, cart exists with items, valid coupon code available","back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, cart_id={{CART_ID}}, coupon_code={{COUPON_CODE}}","[AUTH] POST {{BACK_URL}}/connect/token for {{USER_EMAIL}}
[SETUP] ensure cart {{CART_ID}} has at least 1 item via cart query
[GQL] mutation { addCoupon(command: { cartId: ""{{CART_ID}}"", couponCode: ""{{COUPON_CODE}}"" }) { id coupons { code isAppliedSuccessfully } totals { discountTotal { amount } subTotal { amount } grandTotalAmount { amount } } } }
[VAR] save discountTotal.amount as {{DISCOUNT}}","[ERRORS] errors[] is empty
[DATA] coupons array contains entry with code == {{COUPON_CODE}}
[DATA] coupons[].isAppliedSuccessfully == true
[MATH] grandTotalAmount = subTotal - discountTotal
[COUNT] coupons array length incremented by 1","[ROUNDTRIP] query cart by id → coupons still applied, totals unchanged
[STOREFRONT] {{FRONT_URL}}/cart shows discount line and updated total
[ADMIN] order (if created) shows coupon in admin","errors[] non-empty after addCoupon, discountTotal.amount == 0, coupon not in coupons array, 5xx on /graphql","[TEARDOWN] removeCoupon mutation to restore cart state",VCST-XXXX,Automated
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

```csv
E2E-042,"Apply Coupon — Full Flow: Storefront → API → Admin","E2E > Coupons > Apply",Critical,"BL-PROMO-001, BL-CART-003","ECL-5.1, ECL-14.1","User logged in on storefront, cart has items, coupon QA-COUPON-042 exists and is active","front_url={{FRONT_URL}}, back_url={{BACK_URL}}, user_email={{USER_EMAIL}}, user_password={{USER_PASSWORD}}, coupon_code={{COUPON_CODE}}, admin_email={{ADMIN_EMAIL}}, admin_password={{ADMIN_PASSWORD}}","--- STOREFRONT ---
[NAV] {{FRONT_URL}}/cart
[WAIT] cart page loaded with items
[ACT] fill 'Coupon Code' input: {{COUPON_CODE}}
[ACT] click 'Apply Coupon' button
[WAIT] discount applied — total updated
--- API ---
[GQL] query { cart { coupons { code isAppliedSuccessfully } totals { discountTotal { amount } grandTotalAmount { amount } } } }
--- ADMIN ---
[NAV] {{BACK_URL}} → login as {{ADMIN_EMAIL}}
[NAV] Menu → Marketing → Coupons
[GRID] search for {{COUPON_CODE}}
[WAIT] coupon row found","--- STOREFRONT ---
[DOM] success message: coupon applied
[DOM] discount line visible in order summary
[MATH] displayed total = subtotal - discount
--- API ---
[ERRORS] cart query errors[] is empty
[DATA] coupons[].isAppliedSuccessfully == true
[MATH] grandTotalAmount == subTotal - discountTotal
--- ADMIN ---
[GRID] coupon usage count incremented","[CONSOLE] no JS errors on storefront during apply
[NETWORK] no 5xx on /graphql
[API] cart query confirms coupon state matches UI","Coupon input shows error instead of success, discount amount is 0, API errors[] non-empty, total unchanged after apply, admin coupon usage not incremented","[TEARDOWN] removeCoupon mutation + sign out of admin",VCST-XXXX,Automated
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
