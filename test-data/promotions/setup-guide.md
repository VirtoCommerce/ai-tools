# Promotions & Coupons — Test Data Setup Guide

**Feature:** VCST-4590 Coupons and Vouchers Page
**Date:** 2026-03-11
**Total promotions:** 16 | **Total coupons:** 18 | **Edge cases:** 8

---

## Prerequisites

- Admin access to `{{BACK_URL}}` (ADMIN_EMAIL / ADMIN_PASSWORD)
- Store ID: `B2B-store` (or value from STORE_ID env var)
- At least one purchasable product in cart for discount verification

## File Inventory

| File | Records | Description |
|------|---------|-------------|
| `promotions.csv` | 16 | Promotion definitions with reward types, conditions, exclusivity, priority |
| `coupons.csv` | 18 | Coupon codes with usage limits, expiration dates, edge case flags |
| `conditions.csv` | 4 | Cart and catalog conditions attached to promotions |
| `rewards.csv` | 15 | Reward configurations (%, $, shipping, gift, category) |
| `edge-cases.csv` | 8 | Edge case scenarios with setup steps, preconditions, expected behavior |
| `qa-bulk-coupons.csv` | 3 | CSV file for Admin bulk import test (CPN-047) |

---

## Seeding Order

Promotions must be created before coupons. Conditions and rewards are part of the promotion payload.

> ⚠️ **API CONTRACT CORRECTION (2026-06-01) — the curl examples below are OUTDATED.**
> The `Promotion` model has **no `coupons[]` field** (only a `HasCoupons` bool), and there is **no `POST /promotions/{id}/coupons` endpoint**. The inline `"coupons": [...]` in the promotion bodies below is **silently ignored**, and `POST /promotions/{id}/coupons` returns **404**. Following them verbatim creates promotions with NO coupons attached.
>
> **Correct flow (use this instead):**
> 1. `POST /api/marketing/promotions` with body `{ name, type:"DynamicPromotion", isActive, isPublic, priority, storeIds:["B2B-store"] }` → capture `id`.
> 2. `POST /api/marketing/promotions/coupons/add` with an **ARRAY** body: `[{ "promotionId":"<id>", "code":"<CODE>", "maxUsesNumber":0, "maxUsesPerUser":0 }]` → expect **204**.
> 3. Verify: `POST /api/marketing/promotions/coupons/search` body `{ "promotionId":"<id>", "take":10 }`; confirm the code is present.
>
> Storefront visibility on `/account/coupons` requires the promotion to be **`isActive=true` AND `isPublic=true` with a non-expired `endDate`** — `promotionCoupons` (PromotionCouponsQueryHandler) filters `OnlyActive=true` + `IsPublic=true`. See `reference_marketing_coupons_api_contract` memory.

### Step 1 — Obtain access token

```bash
TOKEN=$(curl -sk -X POST ${BACK_URL}/connect/token \
  -d "grant_type=password&username=${ADMIN_EMAIL}&password=${ADMIN_PASSWORD}&scope=openid" \
  | jq -r '.access_token')
```

### Step 2 — Create core promotions (P01–P07)

These are the 7 public, active promotions whose coupons appear on the storefront `/account/coupons` page.

```bash
# P01 — QA10OFF (10% off cart, priority 1, with localization)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Test - VCST-4590 Coupon Public",
    "isActive": true,
    "isPublic": true,
    "priority": 1,
    "exclusivity": "CombinablePromotion",
    "description": "QA Coupon English Description",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "QA10OFF", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P02 — QA (5% off cart, priority 5)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple QA Coupon",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "QA", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P03 — SUPER (20% off cart, priority 10)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Super Discount",
    "isActive": true,
    "isPublic": true,
    "priority": 10,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "SUPER", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P04 — AIR (10% off shipping)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coupon on discount for shipping",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "AIR", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P05 — AGENT (15% off cart)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Register and get 15% for all",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "AGENT", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P06 — E2E-COUPON ($5 fixed off cart)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "[E2E Test] Coupon",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "E2E-COUPON", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P07 — WINE (10% off Wine category)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wine Discount",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "WINE", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

### Step 3 — Create negative/edge case promotions (P08–P10)

```bash
# P08 — PRIVATE4590 (IsPublic=false — hidden from storefront)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Private Promo (do not make public)",
    "isActive": true,
    "isPublic": false,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "PRIVATE4590", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P09 — EXPIRED-TEST (IsActive=false — inactive)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Expired Coupon Test",
    "isActive": false,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "EXPIRED-TEST", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P10 — Auto gift (no coupon codes — automatic promotion)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto Gift (no coupon)",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": []
  }'
```

### Step 4 — Create reward variant promotions (P11–P14)

```bash
# P11 — FIXED5 ($5 fixed off cart)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Fixed Dollar Off",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "FIXED5", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P12 — FREESHIP ($999 off shipping = free shipping)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Free Shipping",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "FREESHIP", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P13 — CAT20 (20% off category, no cap)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Category Percent",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "CAT20", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'

# P14 — THRESH50 (10% off cart when subtotal >= $50)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Cart Threshold",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "THRESH50", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

### Step 5 — Create usage limit parent promotion (P15) and coupon variants

```bash
# P15 — Parent promotion for coupon configuration variants
P15_ID=$(curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Usage Limit Test",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "CombinablePromotion",
    "storeIds": ["B2B-store"]
  }' | jq -r '.id')

# Add coupon variants to P15
# QA-LIMITED — max 1 total use
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-LIMITED", "maxUsesNumber": 1, "maxUsesPerUser": 0}'

# QA-MAXED — max 1 total use (will be pre-used)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-MAXED", "maxUsesNumber": 1, "maxUsesPerUser": 0}'

# QA-PERCUST — max 1 use per customer, 100 total
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-PERCUST", "maxUsesNumber": 100, "maxUsesPerUser": 1}'

# QA-EXPDATE — expires tomorrow
TOMORROW=$(date -d "+1 day" +%Y-%m-%dT23:59:59Z 2>/dev/null || date -v+1d +%Y-%m-%dT23:59:59Z)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"QA-EXPDATE\", \"maxUsesNumber\": 0, \"maxUsesPerUser\": 0, \"expirationDate\": \"${TOMORROW}\"}"

# QA-CPNEXPIRED — expired yesterday
YESTERDAY=$(date -d "-1 day" +%Y-%m-%dT00:00:00Z 2>/dev/null || date -v-1d +%Y-%m-%dT00:00:00Z)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"QA-CPNEXPIRED\", \"maxUsesNumber\": 0, \"maxUsesPerUser\": 0, \"expirationDate\": \"${YESTERDAY}\"}"

# VALIDCODE123 — alphanumeric valid code
curl -sk -X POST ${BACK_URL}/api/marketing/promotions/${P15_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "VALIDCODE123", "maxUsesNumber": 0, "maxUsesPerUser": 0}'
```

### Step 6 — Create globally exclusive promotion (P16)

```bash
# P16 — Globally exclusive (blocks other coupons)
curl -sk -X POST ${BACK_URL}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Exclusivity Test - Globally Exclusive",
    "isActive": true,
    "isPublic": true,
    "priority": 1,
    "exclusivity": "ExclusivePromotion",
    "storeIds": ["B2B-store"],
    "coupons": [{"code": "EXCLUSIVE10", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

### Step 7 — Pre-condition setup for edge cases

After all promotions are created, set up the preconditions:

```bash
# E01 — Pre-use QA-MAXED to max out total uses
# Login as storefront user, add product to cart, apply QA-MAXED, complete checkout
# This must be done via browser (storefront UI) or GraphQL addCartCoupon mutation

# E02 — Pre-use QA-PERCUST for USER_EMAIL
# Login as USER_EMAIL, add product to cart, apply QA-PERCUST, complete checkout
# After this, USER_EMAIL has used their 1 per-customer allowance
```

---

## GraphQL Queries

### Query public coupons (storefront)

This is the query used by the `/account/coupons` page to fetch all public promotion coupons.

```graphql
query coupons {
  promotionCoupons(first: 20, after: "0", cultureName: "en-US", storeId: "B2B-store") {
    totalCount
    items {
      id
      endDate
      name
      description
      couponCode
    }
  }
}
```

**Endpoint:** `POST {{FRONT_URL}}/storefrontapi/graphql`
**Auth:** Bearer token (storefront user)
**Expected:** `totalCount` >= 7 (P01–P07 public coupons), each item has `couponCode`, `name`, `description`, `endDate`

### Apply coupon to cart (storefront)

```graphql
mutation addCoupon($command: InputAddCouponType!) {
  addCoupon(command: $command) {
    id
    coupons {
      code
      isAppliedSuccessfully
    }
    discountTotal {
      amount
      formattedAmount
    }
    total {
      amount
      formattedAmount
    }
  }
}
```

**Variables:**
```json
{
  "command": {
    "storeId": "B2B-store",
    "cartName": "default",
    "userId": "{{USER_ID}}",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "couponCode": "QA10OFF"
  }
}
```

### Remove coupon from cart (storefront)

```graphql
mutation removeCoupon($command: InputRemoveCouponType!) {
  removeCoupon(command: $command) {
    id
    coupons {
      code
      isAppliedSuccessfully
    }
    total {
      amount
      formattedAmount
    }
  }
}
```

**Variables:**
```json
{
  "command": {
    "storeId": "B2B-store",
    "cartName": "default",
    "userId": "{{USER_ID}}",
    "cultureName": "en-US",
    "currencyCode": "USD",
    "couponCode": "QA10OFF"
  }
}
```

---

## Cleanup / Teardown

```bash
# List all QA test promotions
curl -sk "${BACK_URL}/api/marketing/promotions?keyword=QA&take=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {id, name}'

# Delete a promotion by ID
curl -sk -X DELETE ${BACK_URL}/api/marketing/promotions/{PROMOTION_ID} \
  -H "Authorization: Bearer $TOKEN"

# Restore P01 exclusivity after CPN-042 test
# PATCH promotion to set exclusivity back to CombinablePromotion
```

---

## Quick Reference

| Code | Discount | Type | Public | Active | Edge Case | Test Cases |
|------|----------|------|--------|--------|-----------|------------|
| QA10OFF | 10% cart | % | Yes | Yes | — | CPN-001,003-005,028-029,037-038,044-048 |
| QA | 5% cart | % | Yes | Yes | — | CPN-002,006,009,011,013,016-018,046 |
| SUPER | 20% cart | % | Yes | Yes | Exclusivity | CPN-042,046 |
| AIR | 10% shipping | % | Yes | Yes | — | CPN-012 |
| AGENT | 15% cart | % | Yes | Yes | — | CPN-032 |
| E2E-COUPON | $5 cart | $ | Yes | Yes | — | CPN-033,034 |
| WINE | 10% Wine | % cat | Yes | Yes | — | CPN-030 |
| FIXED5 | $5 cart | $ | Yes | Yes | — | CPN-033 |
| FREESHIP | Free ship | $ ship | Yes | Yes | — | CPN-012 |
| CAT20 | 20% cat | % cat | Yes | Yes | — | CPN-030 |
| THRESH50 | 10% cart | % cond | Yes | Yes | $50 min | CPN-029 |
| EXCLUSIVE10 | 10% cart | % excl | Yes | Yes | Blocks others | CPN-042 |
| PRIVATE4590 | 5% cart | % | **No** | Yes | Hidden | CPN-027,035 |
| EXPIRED-TEST | 5% cart | % | Yes | **No** | Inactive | CPN-014 |
| QA-LIMITED | 10% cart | % | Yes | Yes | Max 1 total | CPN-039 |
| QA-MAXED | 10% cart | % | Yes | Yes | Pre-used | CPN-039 |
| QA-PERCUST | 10% cart | % | Yes | Yes | 1/customer | CPN-039 |
| QA-EXPDATE | 10% cart | % | Yes | Yes | Exp tomorrow | CPN-040 |
| QA-CPNEXPIRED | 10% cart | % | Yes | Yes | Exp yesterday | CPN-040 |
| VALIDCODE123 | 10% cart | % | Yes | Yes | Alphanumeric | CPN-041 |
| IMPORT-TEST1 | 10% cart | % | Yes | Yes | Bulk import | CPN-047 |
| IMPORT-TEST2 | 10% cart | % | Yes | Yes | Bulk import | CPN-047 |
| IMPORT-TEST3 | 10% cart | % | Yes | Yes | Bulk import | CPN-047 |
