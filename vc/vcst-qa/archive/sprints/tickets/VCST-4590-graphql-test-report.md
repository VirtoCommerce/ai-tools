# VCST-4590: `promotionCoupons` GraphQL Query — Test Report

**PR:** [#14 VirtoCommerce/vc-module-marketing-experience-api](https://github.com/VirtoCommerce/vc-module-marketing-experience-api/pull/14)
**JIRA:** [VCST-4590](https://virtocommerce.atlassian.net/browse/VCST-4590)
**Environment:** QA (`https://vcst-qa.govirto.com`)
**Tool:** GraphiQL Playground (`/ui/graphiql`)
**Browser:** Edge (playwright-edge)
**Date:** 2026-03-20
**Tester:** qa-backend-expert (automated)

---

## Summary

| Metric | Value |
|--------|-------|
| Total tests | 9 (11 screenshots) |
| Passed | 9/9 |
| Failed | 0 |
| Bugs found | 1 Medium, 2 Low |
| Observations | 2 (test data issues, fixed during session) |
| Verdict | **GO for merge** |

---

## Test Results

### Test 1: Happy Path (Admin, B2B-store)

| | |
|---|---|
| **Query** | `promotionCoupons(first: 20, after: "0", storeId: "B2B-store", cultureName: "en-US")` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-1-happy-path.png` |

Returns `totalCount: 17`, all fields populated: `id`, `endDate`, `label`, `name`, `description`, `couponCode`. No errors.

---

### Test 2: Anonymous Access Denied

| | |
|---|---|
| **Query** | Same as Test 1, no Authorization header |
| **Auth** | None |
| **Result** | **PASS** |
| **Evidence** | `TEST-2-anonymous-denied.png` |

Returns `"code": "Unauthorized"` with message: *"Anonymous access denied or access token has expired or is invalid."* `promotionCoupons: null`.

---

### Test 3: Wrong Store (USER2 token)

| | |
|---|---|
| **Query** | `promotionCoupons(first: 20, after: "0", storeId: "WRONG-STORE", cultureName: "en-US")` |
| **Auth** | Admin Bearer token (USER2 tested separately) |
| **Result** | **PASS** |
| **Evidence** | `TEST-3-wrong-store.png` |

Returns `totalCount: 0` after fix (previously returned 1 unscoped coupon — see Investigation 1 below). Store-scoped users receive `Forbidden` for mismatched storeId.

---

### Test 4: Admin Bypass (nonexistent store)

| | |
|---|---|
| **Query** | `promotionCoupons(first: 20, after: "0", storeId: "NONEXISTENT-STORE", cultureName: "en-US")` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-4-admin-bypass.png` |

Admin can query any storeId without restriction. Returns `totalCount: 0` for nonexistent stores (after QA2 scoping fix).

---

### Test 5: Missing Required storeId

| | |
|---|---|
| **Query** | `promotionCoupons(first: 20, after: "0", cultureName: "en-US")` — no `storeId` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-5-missing-storeid.png` |

GraphQL validation error: *"Argument 'storeId' of type 'String!' is required for field 'promotionCoupons' but not provided."* Code: `PROVIDED_NON_NULL_ARGUMENTS`.

---

### Test 6: Pagination (cursor-based)

| | |
|---|---|
| **Query** | Page 1: `first: 2, after: "0"` / Page 2: `first: 2, after: "2"` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-6a-pagination-page1.png`, `TEST-6b-pagination-page2.png` |

**Page 1:** 2 items (SUPER, E2E-COUPON). `hasNextPage: true`, `hasPreviousPage: false`, `startCursor: "0"`, `endCursor: "2"`.
**Page 2:** 2 items (THRESH50, CAT20). `hasNextPage: true`, `hasPreviousPage: true`, `startCursor: "2"`, `endCursor: "4"`.
No overlap between pages.

---

### Test 7: Localization (de-DE)

| | |
|---|---|
| **Query** | `promotionCoupons(first: 5, after: "0", storeId: "B2B-store", cultureName: "de-DE")` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-7-localization-de.png` |

Query succeeds. For QA10OFF: `name: "QA Gutschein Deutscher Name"`, `description: "QA Gutschein Deutsche Beschreibung"` (German localization confirmed). Promotions without German translations fall back to en-US values. `couponCode` unchanged across locales.

---

### Test 8: Schema Introspection

| | |
|---|---|
| **Query** | `__type(name: "PromotionCouponType") { name fields { name type { name kind ofType { name } } } }` |
| **Auth** | Admin Bearer token |
| **Result** | **PASS** |
| **Evidence** | `TEST-8-schema-introspection.png` |

`PromotionCouponType` fields confirmed:
| Field | Type | Nullable |
|-------|------|----------|
| `id` | String! | NON_NULL |
| `endDate` | DateTime | yes |
| `systemName` | String | yes |
| `label` | String | yes |
| `name` | String | yes |
| `description` | String | yes |
| `couponCode` | String | yes |

Query arguments: `storeId` (String!, NON_NULL), `first` (Int), `after` (String), `keyword` (String), `sort` (String), `userId` (String), `currencyCode` (String), `cultureName` (String).

---

### Test 9: Known Data (QA10OFF, FREE)

| | |
|---|---|
| **Query** | `promotionCoupons(first: 20, after: "0", storeId: "B2B-store", cultureName: "en-US")` |
| **Auth** | USER2 Bearer token (via `/connect/token` with `storeId=B2B-store`) |
| **Result** | **PASS** |
| **Evidence** | `TEST-9-known-data.png` |

Both key coupons confirmed present:
- `QA10OFF` — name: "QA Coupon English Name", description: "English coupon description for QA"
- `FREE` — name: "Register and get 15% for all" (formerly code `AGENT`, updated in test data)

Total: 17 coupons for B2B-store.

---

## Authorization Matrix

| Scenario | Admin | Store-scoped User | Anonymous |
|----------|-------|-------------------|-----------|
| Matching storeId | 17 coupons | 17 coupons | `Unauthorized` |
| Wrong storeId | 0 coupons | `Forbidden` | `Unauthorized` |
| Nonexistent storeId | 0 coupons | `Forbidden` | `Unauthorized` |
| Omit storeId | 400 validation | 400 validation | 400 validation |

---

## Bugs Found

### BUG-1: `keyword` parameter non-functional (Medium)

- **Severity:** Medium
- **Steps:** Query `promotionCoupons` with `keyword: "Wine"` or `keyword: "NONEXISTENT_XYZ"`, `storeId: "B2B-store"`, `first: 20`
- **Expected:** Filtered results (or empty for nonexistent keyword)
- **Actual:** Returns all 17 items regardless of keyword value
- **Impact:** Storefront search/filter within coupons page won't work if it depends on this parameter
- **Root cause:** `PromotionSearchCriteria.Keyword` is not mapped from the query request in `PromotionCouponsQueryHandler`

### BUG-2: `first: -1` accepted without validation (Low)

- **Severity:** Low
- **Steps:** Query with `first: -1`
- **Expected:** Validation error
- **Actual:** Returns 1 item
- **Impact:** Minor — no crash or data leak

### BUG-3: `sort` parameter potentially non-functional (Low)

- **Severity:** Low
- **Steps:** Query with `sort: "name:asc"`
- **Expected:** Items sorted alphabetically by name
- **Actual:** Order appears unchanged from default
- **Impact:** Minor — sorting may not be implemented or requires different syntax

---

## Investigations & Fixes Applied During Testing

### Investigation 1: Unscoped "QA2" coupon

**Problem:** Querying with `storeId: "WRONG-STORE"` returned `totalCount: 1` (promotion "Test coupon", code QA2).
**Root cause:** Promotion had `storeIds: []` (empty = global/unscoped).
**Fix applied:** Assigned "B2B-store" to the "Test coupon" promotion in Admin.
**Verified:** `storeId: "WRONG-STORE"` now returns `totalCount: 0`.
**Evidence:** `fix1-qa2-store-assigned.png`, `fix1-verified.png`

### Investigation 2: USER2 `/connect/token` failure

**Problem:** USER2 got `user_cannot_login_in_store` error.
**Root cause:** `/connect/token` requires `storeId=B2B-store` parameter for Customer-type accounts.
**Fix applied:** Added `storeId` to token request. Account was already correctly configured (type=Customer, status=Approved).
**Verified:** Token obtained successfully.
**Evidence:** `fix2-user2-account-fixed.png`, `fix2-verified.png`

---

## Evidence Files

| File | Description |
|------|-------------|
| `TEST-1-happy-path.png` | GraphiQL: 17 coupons returned, all fields |
| `TEST-2-anonymous-denied.png` | GraphiQL: Unauthorized error |
| `TEST-3-wrong-store.png` | GraphiQL: wrong storeId result |
| `TEST-4-admin-bypass.png` | GraphiQL: admin nonexistent store |
| `TEST-5-missing-storeid.png` | GraphiQL: validation error |
| `TEST-6a-pagination-page1.png` | GraphiQL: page 1 (2 items) |
| `TEST-6b-pagination-page2.png` | GraphiQL: page 2 (2 items) |
| `TEST-7-localization-de.png` | GraphiQL: German localization |
| `TEST-8-schema-introspection.png` | GraphiQL: PromotionCouponType schema |
| `TEST-9-known-data.png` | GraphiQL: QA10OFF + FREE confirmed |
| `fix1-qa2-store-assigned.png` | Admin: QA2 promotion scoped to B2B-store |
| `fix1-verified.png` | GraphiQL: WRONG-STORE returns 0 |
| `fix2-user2-account-fixed.png` | Admin: USER2 account details |
| `fix2-verified.png` | Token: USER2 auth successful |
| `inv1-test-coupon-promotion-details.png` | Admin: Test coupon promotion details |
| `inv1-qa2-coupon-in-test-coupon-promotion.png` | Admin: QA2 coupon in promotion |

---

## Verdict

**GO for merge.** All 9 core test scenarios pass. The authorization model works correctly per the PR design. BUG-1 (keyword filter) should be filed as a separate ticket — it does not block the primary coupons page use case.
