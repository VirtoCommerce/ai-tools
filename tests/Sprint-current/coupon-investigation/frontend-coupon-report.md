# Coupon Investigation Report — Frontend

**Date:** 2026-03-11
**Tester:** qa-frontend-expert (automated)
**Environment:** QA — `https://vcst-qa-storefront.govirto.com` (Ver. 2.44.0-pr-2198-6327-6327c148)
**Browser:** Chromium (playwright-chrome)
**Account:** Elena Mutykova / ACME Store 3

---

## Executive Summary

Investigation of three coupon-related bugs from Azure Application Insights. The QA environment has a **critical frontend-backend GraphQL schema mismatch** that blocks the entire storefront catalog and cart page rendering. This mismatch is a higher-severity blocker than the originally reported coupon bugs.

---

## Bug Reproduction Results

### BUG 1 (P0): validateCoupon KeyNotFoundException

**Status: PARTIALLY REPRODUCED — Schema Mismatch Variant**

**Original Report:** `validateCoupon` mutation crashes with `KeyNotFoundException` in `CartMappingProfile.cs:211` for promotion ID `b05d564a-dfb0-4d4f-9cf0-3a3e824d6942`.

**Finding:** The `validateCoupon` mutation **does not exist** in the current GraphQL schema. When called, it returns:
```json
{
  "message": "Cannot query field 'validateCoupon' on type 'Mutations'. Did you mean 'addCoupon' or 'removeCoupon'?",
  "extensions": { "code": "FIELDS_ON_CORRECT_TYPE" }
}
```

Only `addCoupon` and `removeCoupon` exist as coupon-related mutations. The `addCoupon` mutation itself works correctly — tested by adding product ID `58faf1ff-7980-4948-bf4d-73d15cab9936` (Mini Digital Camera, $100) and applying coupon `QA10OFF`, which returned `isAppliedSuccessfully: true` with $9.999 discount (10% off).

The KeyNotFoundException may have been a transient backend issue, or it may only occur when the storefront's cart query requests specific promotion detail fields. The cart query from the storefront itself fails due to the `configuredGroups` field not existing (see Additional Finding below).

---

### BUG 2 (P0): addCoupon AuthorizationError on token expiry

**Status: NOT REPRODUCED**

**Original Report:** `addCoupon` fails with AuthorizationError at `PurchaseSchema.cs:1735` when auth token expires.

**Finding:** Could not reproduce. The storefront proxies GraphQL requests server-side, so the browser session's auth token is not directly exposed to GraphQL calls from the client. This bug likely requires:
1. An actual session timeout (token expiry after extended inactivity)
2. The specific race condition where the server's refresh token also expires
3. Or a backend deployment/restart that invalidates all tokens

**Recommendation:** Requires longer-duration test session with deliberate token expiry simulation, or App Insights log correlation with the exact user sessions that triggered it.

---

### BUG 3 (P1): GraphQL schema mismatches (promotions/promotion fields)

**Status: REPRODUCED — CONFIRMED**

**Finding:** Confirmed via GraphQL introspection:
- `promotions` **does not exist** on Query type. Error: "Cannot query field 'promotions' on type 'Query'. Did you mean 'regions' or 'properties'?"
- Only `promotionCoupons` exists as a promotion-related query
- The coupons page (`/account/coupons`) **loads correctly** and displays 15 coupon cards, indicating it uses the `promotionCoupons` query (not `promotions`)

---

## Additional Critical Finding: Storefront-Backend Schema Mismatch (BLOCKER)

**Severity: P0 — BLOCKER**

The storefront code (v2.44.0) queries GraphQL fields that do not exist on the backend schema:

| Field | Type | Error |
|-------|------|-------|
| `configuredGroups` | `CartType` | "Cannot query field 'configuredGroups' on type 'CartType'" |
| `configurationSections` | `Product` | "Cannot query field 'configurationSections' on type 'Product'" |
| `validateCoupon` | `Mutations` | "Cannot query field 'validateCoupon' on type 'Mutations'" |
| `promotions` | `Query` | "Cannot query field 'promotions' on type 'Query'" |

**Impact:**
1. **Cart page broken:** Shows "Your cart is empty" even when items exist in the cart. Console shows `ApolloError: Error trying to resolve field 'cart'`. Users **cannot view or manage their cart** through the UI.
2. **Catalog pages broken:** All category pages show 0 results. Console shows `ApolloError: Error trying to resolve field 'products'`. Users **cannot browse products** through the storefront.
3. **Search broken:** All searches return "no results found" despite products existing in the GraphQL data layer.
4. **Product pages broken:** Direct product URLs return 404.

**Root Cause:** The storefront frontend code has been updated to version 2.44.0 which expects `configuredGroups` (for configurable products) and `configurationSections` fields, but the backend GraphQL schema does not include these fields. This is a **deployment mismatch** — the frontend was deployed with a newer schema expectation than what the backend provides.

---

## Steps Performed

1. Navigated to storefront homepage — logged in as Elena Mutykova / ACME Store 3
2. Observed error toast: "Something went wrong. Please try again later." on every page
3. Navigated to `/snacks` — 0 results, ApolloError on 'products' field
4. Navigated to `/soft-drinks` — 0 results, same error
5. Navigated to `/cart` — "Your cart is empty", ApolloError on 'cart' field
6. Navigated to `/search?q=hat` — no results, ApolloError on 'products' field
7. Navigated to `/account/coupons` — **loaded successfully** with 15 coupon cards
8. Via GraphQL API: Successfully added product to cart (`addItem` mutation)
9. Via GraphQL API: Successfully applied coupon QA10OFF (`addCoupon` mutation) — $9.999 discount on $100 item
10. Via GraphQL API: Confirmed `validateCoupon` does not exist in schema
11. Via GraphQL API: Confirmed `promotions` does not exist on Query type
12. Via GraphQL API: Identified `configuredGroups` on CartType as the breaking field
13. Via GraphQL API: Identified `configurationSections` on Product as the breaking field
14. Cleaned up cart (removed coupon and item)

---

## Console Errors Captured

```
ApolloError: Error trying to resolve field 'cart'.
ApolloError: Error trying to resolve field 'products'.
Failed to load resource: the server responded with a status of 400 ()
```

---

## Recommendations

1. **P0 — Immediate:** Align the backend GraphQL schema with the storefront v2.44.0 expectations. Deploy the module that provides `configuredGroups` on `CartType` and `configurationSections` on `Product`. Alternatively, roll back the storefront to a version compatible with the current backend schema.
2. **P1 — Short term:** If `validateCoupon` was removed intentionally, ensure the storefront code no longer calls it. If it was accidentally removed, restore the mutation.
3. **P1 — Short term:** Clarify whether `promotions` query was replaced by `promotionCoupons` intentionally.
4. **P0 — Process:** Implement schema compatibility checks in CI/CD to prevent frontend-backend schema mismatches from reaching QA.
