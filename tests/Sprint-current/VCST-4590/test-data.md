# Test Data — VCST-4590: Coupons and Vouchers Page

**Date:** 2026-03-11
**Revised:** 2026-03-11 (expanded to cover all 48 test cases)
**Status:** Required before test execution

---

## 1. Promotion Definitions

All promotions must exist in the Admin marketing module assigned to the store matching `{{STORE_ID}}` unless noted otherwise. All must be IsActive=true and IsPublic=true unless the column says otherwise.

### 1.1 Core Promotions (used across multiple test areas)

| ID | Promotion Name | IsActive | IsPublic | Coupon Code | Reward Type | Reward Value | Condition | Exclusivity | Priority | End Date | Used By |
|----|---|---|---|---|---|---|---|---|---|---|---|
| P01 | QA Test - VCST-4590 Coupon Public | true | true | QA10OFF | % off cart subtotal | 10% | (none) | Valid with other offers | 1 | (none) | CPN-001, CPN-003, CPN-004, CPN-005, CPN-007, CPN-008, CPN-014, CPN-028, CPN-029, CPN-033, CPN-037, CPN-038, CPN-039, CPN-040, CPN-042, CPN-044, CPN-045, CPN-046, CPN-047, CPN-048 |
| P02 | Simple QA Coupon | true | true | QA | % off cart subtotal | 5% | (none) | Valid with other offers | 5 | (none) | CPN-002, CPN-006, CPN-009, CPN-010, CPN-011, CPN-013, CPN-016, CPN-017, CPN-018 |
| P03 | Super Discount | true | true | SUPER | % off cart subtotal | 20% | (none) | Valid with other offers | 10 | (none) | CPN-042 (second coupon in exclusivity test) |
| P04 | Coupon on discount for shipping | true | true | AIR | % off shipping | 10% | (none) | Valid with other offers | 5 | (none) | CPN-012 |
| P05 | Register and get 15% for all | true | true | AGENT | % off cart subtotal | 15% | (none) | Valid with other offers | 5 | (none) | CPN-032 |
| P06 | [E2E Test] Coupon | true | true | E2E-COUPON | Fixed $ off cart | $5 | (none) | Valid with other offers | 5 | (none) | CPN-033, CPN-034 |
| P07 | Wine Discount | true | true | WINE | % off category | 10% | Specific category: Wine | Valid with other offers | 5 | (none) | CPN-030 |

### 1.2 Localization Test Promotions

| ID | Promotion Name | IsActive | IsPublic | Coupon Code | Localized Name (en-US) | Localized Desc (en-US) | Localized Name (de-DE) | Localized Desc (de-DE) | Used By |
|----|---|---|---|---|---|---|---|---|---|
| P01 (same as above) | QA Test - VCST-4590 Coupon Public | true | true | QA10OFF | QA Coupon English Name | QA Coupon English Description | QA Gutschein Deutsch Name | QA Gutschein Deutsch Beschreibung | CPN-008, CPN-021 |

### 1.3 Negative / Edge Case Promotions

| ID | Promotion Name | IsActive | IsPublic | Coupon Code | Reward | Condition | End Date / Special | Used By |
|----|---|---|---|---|---|---|---|---|
| P08 | Private Promo (do not make public) | true | **false** | PRIVATE4590 | % off cart subtotal 5% | (none) | (none) | CPN-027, CPN-035 |
| P09 | Expired Coupon Test | **false** | true | EXPIRED-TEST | % off cart subtotal 5% | (none) | Set IsActive=false OR set Expiration date = yesterday | CPN-014 |
| P10 | Auto Gift (no coupon) | true | true | (zero coupon codes) | Free gift item: any product | (none) | (none) — automatic promotion | CPN-043 |

**Note on P10:** This represents any automatic promotion already present in the QA environment with IsPublic=true and zero coupon codes. The existing "Snack as a gift" promotion (observed with 686 usage history, no coupon codes) satisfies this requirement. Do not add coupon codes to it.

### 1.4 Reward Type Variant Promotions

These promotions demonstrate the four primary reward categories needed for full reward-type coverage.

| ID | Promotion Name | IsActive | IsPublic | Coupon Code | Reward Type (admin label) | Reward Config | Condition | Used By |
|----|---|---|---|---|---|---|---|---|
| P11 | QA Fixed Dollar Off | true | true | FIXED5 | `$... off cart subtotal` | $5 off | (none) | CPN-033, P06 (duplicate purpose — either code works) |
| P12 | QA Free Shipping | true | true | FREESHIP | `$... off for shipping at ...` | $999 off shipping (effectively free) | Shipping method: any | CPN-034 (alternative to E2E-COUPON for shipping test) |
| P13 | QA Category Percent | true | true | CAT20 | `...% off for product... no more than $...` | 20% off a category, no cap | Specific category: any category with test product | CPN-030 (alternative to WINE) |
| P14 | QA Cart Threshold | true | true | THRESH50 | % off cart subtotal | 10% | Cart subtotal >= $50 | CPN-029 (condition-based test) |

### 1.5 Coupon Configuration Variants

These are coupon-level settings applied to promotion P01 (QA10OFF) unless otherwise noted. They are configured on the individual coupon record in the Coupons tab of the promotion detail blade.

| Coupon Code | Promotion | Max Total Uses | Max Uses Per Customer | Coupon Expiry | Description | Used By |
|---|---|---|---|---|---|---|
| QA10OFF | P01 | 0 (unlimited) | 0 (unlimited) | (blank — use promotion expiry) | Default coupon; unlimited use | CPN-001 through CPN-048 (primary coupon) |
| QA-LIMITED | P01 or new promotion | 1 | 1 | (blank) | Max 1 total use; used for maxed-out edge case. See Section 1.6. | CPN-039 |
| QA-PERCUST | P01 or new promotion | 100 | 1 | (blank) | Max 1 use per customer (total=100); second use by same user must fail | CPN-039 |
| QA-EXPDATE | P01 or new promotion | 0 | 0 | Tomorrow's date | Coupon expires tomorrow; used to verify coupon-level expiry is honored | CPN-040 |
| QA-CPNEXPIRED | P01 or new promotion | 0 | 0 | Yesterday's date | Coupon-level expiry in past; must be rejected at cart | CPN-040 |
| VALIDCODE123 | P01 or new promotion | 0 | 0 | (blank) | All alphanumeric; must be accepted | CPN-041 |

**Note:** For CPN-039 and CPN-040, it is acceptable to create a separate promotion (e.g., "QA Usage Limit Test") and attach the coupon variants to it rather than to P01.

### 1.6 Edge Case Promotions

| ID | Scenario | Coupon Code | Setup | Expected Behavior | Used By |
|----|---|---|---|---|---|
| E01 | Maxed-out coupon | QA-MAXED | Create coupon with `Maximum use number = 1`, then use it once. After first use, `Total use count` = 1 = `Maximum use number`. | Cart must reject with error on second attempt | CPN-039 |
| E02 | Per-customer limit reached | QA-PERCUST | Create coupon with `Maximum uses per customer = 1`. Use once with `{{USER_EMAIL}}`. | Same user's second attempt must be rejected; different user can still use it | CPN-039 |
| E03 | Coupon-level expired | QA-CPNEXPIRED | Set `Coupon expiration date` = yesterday on the coupon record | Cart must reject even if promotion end date is far future | CPN-040 |
| E04 | Promotion-level expired | EXPIRED-TEST | Set promotion IsActive=false OR Expiration date = yesterday | Storefront coupons page must not show it; cart must reject | CPN-014 |
| E05 | Invalid alphanumeric chars | INVALID CODE! | Attempt to type "INVALID CODE!" into the Code field in admin coupon blade | Admin must show validation error or prevent save | CPN-041 |
| E06 | Globally exclusive blocks other | QA10OFF | Set P01 exclusivity to "Globally exclusive". Attempt to also apply SUPER in same cart. | Only the globally exclusive coupon remains; second coupon rejected | CPN-042 |
| E07 | Automatic promotion hidden | (none) | Any IsPublic=true promotion with zero coupons (e.g., "Snack as a gift") | Must not appear on storefront /account/coupons page | CPN-043 |
| E08 | Store-scoped promotion | QA10OFF | P01 assigned to B2B-store only; second store exists without P01 | P01 appears on B2B-store coupons page; does not appear on unassigned store | CPN-048 |

### 1.7 Priority and Exclusivity Test Promotions

| Promotion Name | Coupon Code | Priority | Exclusivity | Purpose | Used By |
|---|---|---|---|---|---|
| QA Test - VCST-4590 Coupon Public (P01) | QA10OFF | 1 | Globally exclusive (for CPN-042 only; revert after) | Highest priority, blocks all others when exclusive | CPN-042, CPN-046 |
| Super Discount (P03) | SUPER | 10 | Valid with other offers | Lower priority; used in stack or exclusivity conflict | CPN-042, CPN-046 |
| Simple QA Coupon (P02) | QA | 5 | Valid with other offers | Middle priority | CPN-046 |

**Priority convention:** Lower integer = higher precedence. P01 priority=1 takes precedence over P02 priority=5.

### 1.8 Bulk Import Coupon Test File

For CPN-047 (bulk import via CSV), create a plain CSV file with the following content:

**Filename:** `qa-bulk-coupons.csv`

```
Code
IMPORT-TEST1
IMPORT-TEST2
IMPORT-TEST3
```

This file is uploaded via the "Import" button on the Coupons tab toolbar of any promotion. After import, all three codes must appear in the promotion's coupon list.

---

## 2. Required User Accounts

| Account | Role | Purpose | Env Variable |
|---|---|---|---|
| Personal storefront user | Registered user (no org) | Primary test user for all storefront and cart tests | `{{USER_EMAIL}}` / `{{USER_PASSWORD}}` |
| B2B org member | Organization buyer | CPN-036 (B2B org user access check) | `{{ORG_USER_EMAIL}}` / `{{ORG_USER_PASSWORD}}` |
| Admin user | Platform admin | Admin SPA tests: CPN-019–CPN-021, CPN-026–CPN-027, CPN-039–CPN-048 | `{{ADMIN_EMAIL}}` / `{{ADMIN_PASSWORD}}` |

---

## 3. Required Product Test Data

| Purpose | Property | Value |
|---|---|---|
| Cart add for E2E tests | SKU | `{{TEST_SKU}}` — must be in stock and purchasable |
| BL-CART-003 test (CPN-028) | Product must have a sale price lower than list price | Any product with visible strikethrough list price on PDP |
| BL-PRICE-001 test (CPN-029) | Product must have tier pricing (e.g., 10+ units = lower price) | A product with tiered pricing configured in price list |
| Category coupon test (CPN-030) | Product must belong to a known category | Use a product in the "Wine" category for WINE coupon, or any category for CAT20 |

Fallback: If `{{TEST_SKU}}` is unavailable, use any product at `/products-with-options/configurable-caps-shirts/hoodie` (Vintage Colorado Hoodie, ~$54) or a product with a sale price shown.

---

## 4. Environment Variables Required

All variables must be set in `.env` before execution:

| Variable | Purpose |
|---|---|
| `FRONT_URL` | Storefront base URL (e.g., `https://vcst-qa-storefront.govirto.com`) |
| `ADMIN_URL` or `BACK_URL` | Admin SPA / Backend API base URL (e.g., `https://vcst-qa.govirto.com`) |
| `USER_EMAIL` | Personal account email for storefront tests |
| `USER_PASSWORD` | Personal account password |
| `ORG_USER_EMAIL` | B2B org user email |
| `ORG_USER_PASSWORD` | B2B org user password |
| `ADMIN_EMAIL` | Admin SPA login email |
| `ADMIN_PASSWORD` | Admin SPA login password |
| `STORE_ID` | VC Store ID (e.g., `B2B-store`) |
| `CULTURE_NAME` | Default culture (e.g., `en-US`) |
| `TEST_SKU` | A purchasable product SKU for cart tests |
| `CURRENCY_CODE` | Default currency (e.g., `USD`) |

---

## 5. Seeding Instructions

### Option A: Admin SPA (Manual)

For each promotion in Section 1:

1. Log into `{{ADMIN_URL}}` with admin credentials.
2. Navigate to **Marketing > Promotions** and click **Add**.
3. Fill in the promotion-level fields:
   - **Name**: as specified in the table
   - **Active** toggle: on/off per table
   - **Is Public** toggle: on/off per table
   - **Description**: if specified
   - **Exclusivity**: choose "Valid with other offers" or "Globally exclusive"
   - **Priority**: enter integer value per table
   - **Start/Expiration date**: leave blank unless specified as expired
   - **Stores**: select `{{STORE_ID}}`; for P48 store-scope test, assign only to B2B-store
   - **Can be redeemed more than once**: set per test requirement
4. Go to the **Conditions** tab and add conditions if specified.
5. Go to the **Rewards** tab and configure the reward type and value.
6. Go to the **Coupons** tab, click **Add**, and enter the coupon code.
   - Set **Maximum use number** (0 = unlimited)
   - Set **Maximum uses per customer** (0 = unlimited)
   - Set **Coupon expiration date** if needed (leave blank to inherit from promotion)
7. For Promotion P01 only: go to the **Localization** section and add:
   - **en-US**: Name = "QA Coupon English Name", Description = "QA Coupon English Description"
   - **de-DE**: Name = "QA Gutschein Deutsch Name", Description = "QA Gutschein Deutsch Beschreibung"
8. Click **Save**.

For edge-case E01 (maxed-out coupon QA-MAXED):
- After saving the promotion with `Maximum use number = 1`, log in as `{{USER_EMAIL}}` and apply QA-MAXED in the cart once so `Total use count` increments to 1.
- Do not clear this — the maxed-out state is the test precondition.

For edge-case E02 (per-customer limit QA-PERCUST):
- After saving the coupon with `Maximum uses per customer = 1`, apply the coupon once as `{{USER_EMAIL}}`.
- Do not clear this — the per-customer used state is the test precondition.

### Option B: REST API (Automated Seeding)

#### Step 1 — Obtain access token

```bash
TOKEN=$(curl -s -X POST {{ADMIN_URL}}/connect/token \
  -d "grant_type=password&username={{ADMIN_EMAIL}}&password={{ADMIN_PASSWORD}}&scope=openid" \
  | jq -r '.access_token')
```

#### Step 2 — Create Promotion P01 (QA10OFF — 10% off, unlimited, stackable)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "QA Test - VCST-4590 Coupon Public",
    "isActive": true,
    "isPublic": true,
    "priority": 1,
    "exclusivity": "Valid with other offers",
    "description": "QA Coupon English Description",
    "storeIds": ["{{STORE_ID}}"],
    "localizedValues": [
      {"languageCode": "en-US", "key": "Name", "value": "QA Coupon English Name"},
      {"languageCode": "en-US", "key": "Description", "value": "QA Coupon English Description"},
      {"languageCode": "de-DE", "key": "Name", "value": "QA Gutschein Deutsch Name"},
      {"languageCode": "de-DE", "key": "Description", "value": "QA Gutschein Deutsch Beschreibung"}
    ],
    "coupons": [
      {
        "code": "QA10OFF",
        "maxUsesNumber": 0,
        "maxUsesPerUser": 0
      }
    ]
  }'
```

#### Step 3 — Create Promotion P02 (QA — 5% off)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Simple QA Coupon",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "QA", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 4 — Create Promotion P03 (SUPER — 20% off)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Super Discount",
    "isActive": true,
    "isPublic": true,
    "priority": 10,
    "exclusivity": "Valid with other offers",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "SUPER", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 5 — Create Promotion P04 (AIR — 10% off shipping)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coupon on discount for shipping",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "description": "Coupon on discount for shipping",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "AIR", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 6 — Create Promotion P05 (AGENT — 15% off)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Register and get 15% for all",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "description": "For new customer get a 15% discount for all items",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "AGENT", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 7 — Create Promotion P06 (E2E-COUPON — $5 fixed off)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "[E2E Test] Coupon",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "E2E-COUPON", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 8 — Create Promotion P07 (WINE — 10% off category)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wine Discount",
    "isActive": true,
    "isPublic": true,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "WINE", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 9 — Create Promotion P08 (PRIVATE4590 — private, not public)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Private Promo (do not make public)",
    "isActive": true,
    "isPublic": false,
    "priority": 5,
    "exclusivity": "Valid with other offers",
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "PRIVATE4590", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 10 — Create Promotion P09 (EXPIRED-TEST — inactive/expired)

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Expired Coupon Test",
    "isActive": false,
    "isPublic": true,
    "priority": 5,
    "storeIds": ["{{STORE_ID}}"],
    "coupons": [{"code": "EXPIRED-TEST", "maxUsesNumber": 0, "maxUsesPerUser": 0}]
  }'
```

#### Step 11 — Create coupon-level usage limit test coupons

These must be added to an existing promotion (e.g., P01) via the coupon add endpoint, or create a new promotion "QA Usage Limit Test":

```bash
# Add coupon with max 1 total use to P01 (replace {PROMOTION_ID} with the actual ID)
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-LIMITED", "maxUsesNumber": 1, "maxUsesPerUser": 0}'

# Add coupon with max 1 use per customer
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-PERCUST", "maxUsesNumber": 100, "maxUsesPerUser": 1}'
```

#### Step 12 — Create coupon-level expiration date test coupons

```bash
# Coupon that expires tomorrow (replace TOMORROW_DATE with actual ISO date)
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-EXPDATE", "maxUsesNumber": 0, "maxUsesPerUser": 0, "expirationDate": "TOMORROW_DATE"}'

# Coupon that expired yesterday (replace YESTERDAY_DATE with actual ISO date)
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "QA-CPNEXPIRED", "maxUsesNumber": 0, "maxUsesPerUser": 0, "expirationDate": "YESTERDAY_DATE"}'
```

#### Step 13 — Create valid alphanumeric test coupon

```bash
curl -s -X POST {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID}/coupons \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "VALIDCODE123", "maxUsesNumber": 0, "maxUsesPerUser": 0}'
```

Note: The invalid code `INVALID CODE!` cannot be seeded via API if the API enforces the same constraint as the UI. The constraint test (CPN-041) is performed in the Admin SPA by typing the invalid code into the Code field and observing the validation error.

#### Step 14 — Create bulk import test file

Create a local file `qa-bulk-coupons.csv` with contents from Section 1.8, then upload via:
- Admin SPA: open any promotion, go to Coupons tab, click **Import**, select the file.
- REST API: check if `POST /api/marketing/promotions/{id}/coupons/import` endpoint is available; if not, use Admin SPA.

---

## 6. Test Case to Promotion Mapping

| CPN # | Test Case Title (short) | Promotions / Coupons Required |
|---|---|---|
| CPN-001 | Coupons page loads for authenticated user | P01 (QA10OFF) — page must show at least one coupon |
| CPN-002 | Unauthenticated redirect to login | Any public promotion exists; no login required to check redirect |
| CPN-003 | Coupon card displays name, description, code | P01 (QA10OFF) — card fields: localized name, description, code |
| CPN-004 | Click-to-copy copies code to clipboard | P01 (QA10OFF) — code copy interaction |
| CPN-005 | Apply coupon from cart page | P01 (QA10OFF) + `{{TEST_SKU}}` in cart |
| CPN-006 | Invalid coupon shows error message | P02 (QA) — type invalid code "BADCODE" in cart |
| CPN-007 | Applied coupon removed from cart | P01 (QA10OFF) applied, then click "Deny" button |
| CPN-008 | Coupons page shows localized content (en-US) | P01 with en-US localized name and description |
| CPN-009 | Coupons page pagination | 8+ public coupons must exist (P01–P07 = 7; add one more to trigger pagination) |
| CPN-010 | Coupons page empty state (no public coupons) | Temporarily make all promotions non-public; or use a second store with zero promotions |
| CPN-011 | Coupons page: click coupon → copy code intent | P02 (QA) — test click and copy on any card |
| CPN-012 | Cart: apply shipping discount coupon | P04 (AIR) — shipping discount must reduce shipping cost |
| CPN-013 | Coupons page: multiple coupons listed | P01–P07 all present and visible |
| CPN-014 | Cart: expired/inactive coupon rejected | P09 (EXPIRED-TEST) |
| CPN-015 | Cart: empty coupon field shows validation | No coupon needed; submit empty field |
| CPN-016 | Coupons page: coupon card links | P02 (QA) — check for any linked navigation on card |
| CPN-017 | Coupons page: responsive mobile layout | Any public promotions; viewport 390x844 |
| CPN-018 | Coupons page sidebar navigation | P02 (QA) or any; focus is sidebar "Coupons" link |
| CPN-019 | Admin: create promotion with IsPublic=true | New promotion via Admin SPA |
| CPN-020 | Admin: edit promotion name and description | P01 or P02 — edit and save |
| CPN-021 | Admin: localized name persists after save | P01 — en-US and de-DE localized fields |
| CPN-022 | Admin: add coupon code to promotion | P01 or any — add second coupon code |
| CPN-023 | Admin: promotion activation toggle | P09 — toggle IsActive on/off |
| CPN-024 | Admin: promotion IsPublic toggle | P08 — toggle IsPublic on/off |
| CPN-025 | Admin: promotion appears in storefront after publish | P08 — toggle IsPublic=true, verify storefront page |
| CPN-026 | Admin: create promotion via REST API | New promotion: "APITEST4590" with code via REST |
| CPN-027 | Admin: private promotion not on storefront | P08 (PRIVATE4590) — IsPublic=false must not appear on /account/coupons |
| CPN-028 | Cart: coupon discount applies to sale price not list price | P01 (QA10OFF) + product with sale price (BL-CART-003) |
| CPN-029 | Cart: coupon stacks correctly with tier pricing | P01 (QA10OFF) + product with tier pricing (BL-PRICE-001) |
| CPN-030 | Cart: category coupon applies only to matching items | P07 (WINE) + product in Wine category |
| CPN-031 | Checkout: coupon discount reflected in order total | P01 (QA10OFF) + `{{TEST_SKU}}` through full checkout |
| CPN-032 | Cart: AGENT coupon 15% off | P05 (AGENT) + item in cart |
| CPN-033 | E2E: apply coupon, checkout, order persisted | P06 (E2E-COUPON) + `{{TEST_SKU}}` + full checkout |
| CPN-034 | Cart: fixed dollar discount coupon | P06 (E2E-COUPON) — $5 off |
| CPN-035 | Cart: private coupon code still usable if known | P08 (PRIVATE4590) — code not shown on coupons page but can be entered manually |
| CPN-036 | B2B org user sees coupons page | P01 or any — logged in as `{{ORG_USER_EMAIL}}` |
| CPN-037 | Cart: 'Deny' button removes coupon, total restores | P01 (QA10OFF) applied; click "Deny" button; verify total |
| CPN-038 | Cart: discount breakdown section shows per-coupon amount | P01 (QA10OFF) applied; expand "Discount" collapsible |
| CPN-039 | Admin: coupon-level max uses and max per customer | QA-LIMITED (max 1 total) and QA-PERCUST (max 1 per customer) |
| CPN-040 | Admin: coupon expiry independent of promotion expiry | QA-EXPDATE (future expiry) and QA-CPNEXPIRED (past expiry) |
| CPN-041 | Admin: alphanumeric constraint on coupon code | VALIDCODE123 (valid) and "INVALID CODE!" (must fail validation) |
| CPN-042 | Admin: globally exclusive promotion blocks second | P01 (QA10OFF, set Globally exclusive) + P03 (SUPER) |
| CPN-043 | Coupons page: automatic promotion not shown | P10 (auto gift — no coupon codes) — verify absent from /account/coupons |
| CPN-044 | GA4: coupon tracked in analytics events | P01 (QA10OFF) applied; inspect GA4 network calls |
| CPN-045 | Admin: 'Can be redeemed more than once' toggle | P01 or any — toggle and save, verify persistence |
| CPN-046 | Admin: priority ordering | P01 (priority 1), P02 (priority 5), P03 (priority 10) |
| CPN-047 | Admin: bulk import coupon codes via CSV | Any promotion + `qa-bulk-coupons.csv` file (Section 1.8) |
| CPN-048 | Admin: store-scoped promotion not on unassigned store | P01 (B2B-store only) + second store without P01 |

---

## 7. Cleanup After Tests

After test execution, clean up all test-created data to keep the QA environment clean.

| Data Created By | Cleanup Method |
|---|---|
| Promotion created in CPN-019 | DELETE `{{ADMIN_URL}}/api/marketing/promotions/{id}` |
| Promotion created in CPN-026 (APITEST4590) | DELETE `{{ADMIN_URL}}/api/marketing/promotions/{id}` |
| Coupon codes added in CPN-022 (second code on P01) | DELETE via Admin SPA Coupons tab, or DELETE coupon endpoint |
| Coupon codes imported in CPN-047 (IMPORT-TEST1, 2, 3) | DELETE via Admin SPA Coupons tab after test |
| Cart items added during cart tests (CPN-005, CPN-028–CPN-038, CPN-044) | Clear cart via "Remove" item button in storefront cart, or GraphQL `removeItem` mutation |
| Applied coupons in cart during tests | Click "Deny" button in cart, or call `removeCartCoupon` GraphQL mutation |
| P01 exclusivity changed to "Globally exclusive" for CPN-042 | Restore to "Valid with other offers" via Admin SPA or REST API PATCH |
| P01 localized fields modified in CPN-021 | Restore to original values: en-US Name/Desc as above, de-DE Name/Desc as above |
| QA-LIMITED coupon usage count incremented | If cleanup required: delete coupon and recreate with count reset |
| QA-PERCUST per-user usage for `{{USER_EMAIL}}` | If cleanup required: delete coupon and recreate |
| Promotion created in CPN-033 (E2E-XTEST-{timestamp}) | DELETE via Admin SPA or REST API after test confirms order persistence |

### Cleanup via REST API

```bash
# Get TOKEN first (see Step 1 in Section 5)

# Delete a promotion by ID
curl -s -X DELETE {{ADMIN_URL}}/api/marketing/promotions/{PROMOTION_ID} \
  -H "Authorization: Bearer $TOKEN"

# List promotions to find IDs for cleanup
curl -s "{{ADMIN_URL}}/api/marketing/promotions?keyword=QA&take=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.[].id'
```

---

## 8. Quick Reference: Coupon Code Summary

| Code | Discount | Public | Active | Edge Case | Primary Test Cases |
|---|---|---|---|---|---|
| QA10OFF | 10% off cart | Yes | Yes | None | CPN-001, CPN-003–CPN-005, CPN-028–CPN-029, CPN-037–CPN-038, CPN-044–CPN-048 |
| QA | 5% off cart | Yes | Yes | None | CPN-002, CPN-006, CPN-009, CPN-011, CPN-013 |
| SUPER | 20% off cart | Yes | Yes | Blocked by globally exclusive | CPN-042, CPN-046 |
| AIR | 10% off shipping | Yes | Yes | Shipping type reward | CPN-012 |
| AGENT | 15% off cart | Yes | Yes | None | CPN-032 |
| E2E-COUPON | $5 fixed off | Yes | Yes | Fixed amount reward | CPN-033, CPN-034 |
| WINE | 10% off Wine category | Yes | Yes | Category-scoped | CPN-030 |
| PRIVATE4590 | 5% off cart | **No** | Yes | IsPublic=false | CPN-027, CPN-035 |
| EXPIRED-TEST | 5% off cart | Yes | **No** | Inactive | CPN-014 |
| QA-LIMITED | 10% off cart | Yes | Yes | Max 1 total use (pre-used) | CPN-039 |
| QA-PERCUST | 10% off cart | Yes | Yes | Max 1 per customer (pre-used) | CPN-039 |
| QA-EXPDATE | 10% off cart | Yes | Yes | Coupon expiry = tomorrow | CPN-040 |
| QA-CPNEXPIRED | 10% off cart | Yes | Yes | Coupon expiry = yesterday | CPN-040 |
| VALIDCODE123 | 10% off cart | Yes | Yes | Alphanumeric valid | CPN-041 |
| IMPORT-TEST1 | 10% off cart | Yes | Yes | Bulk imported | CPN-047 |
| IMPORT-TEST2 | 10% off cart | Yes | Yes | Bulk imported | CPN-047 |
| IMPORT-TEST3 | 10% off cart | Yes | Yes | Bulk imported | CPN-047 |
