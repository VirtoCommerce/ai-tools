# Promotions & Coupons Seed Report

**Date:** 2026-03-11
**Environment:** QA (`https://vcst-qa.govirto.com`)
**Store:** B2B-store
**Feature:** VCST-4590 Coupons and Vouchers Page
**Seeded by:** qa-backend-expert (automated REST API)

---

## Summary

| Metric | Count |
|--------|-------|
| Promotions created | 16 (P01-P16) |
| Reward/condition trees configured | 16/16 (via REST API PUT) |
| Descriptions + endDates configured | 16/16 (via REST API PUT) |
| Coupons created (API) | 20 |
| Coupons deferred (Admin CSV import) | 3 (IMPORT-TEST1/2/3) |
| Total coupon codes | 23 |
| Pre-existing promotions deleted before seeding | 4 |

---

## Promotion IDs

| Label | Platform ID | Name | Active | Public | Exclusive | Coupons |
|-------|-------------|------|--------|--------|-----------|---------|
| P01 | `d763872c-d5ed-4bc4-99de-271324ef74ed` | QA Test - VCST-4590 Coupon Public | true | true | false | QA10OFF |
| P02 | `121718c0-13fc-4bd7-80d5-1c9296dfb045` | Simple QA Coupon | true | true | false | QA |
| P03 | `750bcee0-7241-4759-8994-7724ecbd6542` | Super Discount | true | true | false | SUPER |
| P04 | `e1d82455-180b-4e6d-bae7-34645cf4035e` | Coupon on discount for shipping | true | true | false | AIR |
| P05 | `c22f87ed-435e-4328-879c-4f87fcbafad8` | Register and get 15% for all | true | true | false | AGENT |
| P06 | `ea2ce7d6-f0ee-43f6-bdad-132a8edf5b61` | [E2E Test] Coupon | true | true | false | E2E-COUPON |
| P07 | `b88c34f1-e1ac-4d37-8ee8-06dfbf087882` | Wine Discount | true | true | false | WINE |
| P08 | `c4310bfc-b9b3-414b-b650-f3b6fdee8cb6` | Private Promo (do not make public) | true | **false** | false | PRIVATE4590 |
| P09 | `7960490f-9194-47db-a85a-ad2bee1f56a6` | Expired Coupon Test | **false** | true | false | EXPIRED-TEST |
| P10 | `8e4d06fd-23ec-4c18-905f-45ae0afcb4d9` | Auto Gift (no coupon) | true | true | false | _(none)_ |
| P11 | `33d8e1a0-8e85-4245-9013-360d36d18f58` | QA Fixed Dollar Off | true | true | false | FIXED5 |
| P12 | `6a43e19f-40b7-47ff-b3e3-8979a6f126a8` | QA Free Shipping | true | true | false | FREESHIP |
| P13 | `f61031c2-d6ce-48e9-87a7-d670a754b157` | QA Category Percent | true | true | false | CAT20 |
| P14 | `e3ef39d1-1e91-4a0a-af4a-9761b1e4291c` | QA Cart Threshold | true | true | false | THRESH50 |
| P15 | `8e134387-aead-4ba5-83a1-6b3347ef5896` | QA Usage Limit Test | true | true | false | QA-LIMITED, QA-MAXED, QA-PERCUST, QA-EXPDATE, QA-CPNEXPIRED, VALIDCODE123 |
| P16 | `d970f0bc-7abd-4255-be64-ee1de8708d11` | QA Exclusivity Test - Globally Exclusive | true | true | **true** | EXCLUSIVE10 |

---

## Promotion Descriptions & Expiration Dates (COMPLETED)

All 16 promotions updated with `description` and `endDate` fields via REST API GET+PUT (preserving existing dynamicExpression trees). Verified on P01 and P09.

| Label | Description | endDate |
|-------|-------------|---------|
| P01 | QA Coupon English Description | 2026-12-31T23:59:59Z |
| P02 | Simple 5% off cart subtotal coupon for QA testing | 2026-12-31T23:59:59Z |
| P03 | Super 20% discount for exclusivity and priority testing | 2026-12-31T23:59:59Z |
| P04 | Coupon on discount for shipping | 2026-12-31T23:59:59Z |
| P05 | For new customer get a 15% discount for all items | 2026-12-31T23:59:59Z |
| P06 | E2E test coupon -- $5 fixed dollar off cart | 2026-12-31T23:59:59Z |
| P07 | 10% off Wine category products | 2026-12-31T23:59:59Z |
| P08 | Private promotion -- not visible on storefront coupons page | 2026-12-31T23:59:59Z |
| P09 | Expired/inactive coupon for negative testing | **2026-03-10T00:00:00Z** (expired) |
| P10 | Automatic gift promotion -- no coupon code required | 2026-12-31T23:59:59Z |
| P11 | Fixed $5 dollar off cart subtotal | 2026-12-31T23:59:59Z |
| P12 | Free shipping -- $999 off shipping cost | 2026-12-31T23:59:59Z |
| P13 | 20% off specific product category | 2026-12-31T23:59:59Z |
| P14 | 10% off cart when subtotal >= $50 | 2026-12-31T23:59:59Z |
| P15 | Parent promotion for usage limit coupon variants | 2026-12-31T23:59:59Z |
| P16 | Globally exclusive -- blocks all other coupons | 2026-12-31T23:59:59Z |

---

## Coupon Details

| Code | Promotion | Max Uses Total | Max Uses Per User | Expiration | Status |
|------|-----------|---------------|-------------------|------------|--------|
| QA10OFF | P01 | unlimited | unlimited | none | Created |
| QA | P02 | unlimited | unlimited | none | Created |
| SUPER | P03 | unlimited | unlimited | none | Created |
| AIR | P04 | unlimited | unlimited | none | Created |
| AGENT | P05 | unlimited | unlimited | none | Created |
| E2E-COUPON | P06 | unlimited | unlimited | none | Created |
| WINE | P07 | unlimited | unlimited | none | Created |
| PRIVATE4590 | P08 | unlimited | unlimited | none | Created |
| EXPIRED-TEST | P09 | unlimited | unlimited | none | Created |
| FIXED5 | P11 | unlimited | unlimited | none | Created |
| FREESHIP | P12 | unlimited | unlimited | none | Created |
| CAT20 | P13 | unlimited | unlimited | none | Created |
| THRESH50 | P14 | unlimited | unlimited | none | Created |
| QA-LIMITED | P15 | 1 | unlimited | none | Created |
| QA-MAXED | P15 | 1 | unlimited | none | Created |
| QA-PERCUST | P15 | 100 | 1 | none | Created |
| QA-EXPDATE | P15 | unlimited | unlimited | 2026-03-12T23:59:59Z | Created |
| QA-CPNEXPIRED | P15 | unlimited | unlimited | 2026-03-10T00:00:00Z | Created |
| VALIDCODE123 | P15 | unlimited | unlimited | none | Created |
| EXCLUSIVE10 | P16 | unlimited | unlimited | none | Created |
| IMPORT-TEST1 | P01 | unlimited | unlimited | none | **Deferred** (Admin CSV import) |
| IMPORT-TEST2 | P01 | unlimited | unlimited | none | **Deferred** (Admin CSV import) |
| IMPORT-TEST3 | P01 | unlimited | unlimited | none | **Deferred** (Admin CSV import) |

---

## Pre-existing Promotions Cleaned Up

The following promotions existed without coupons and were deleted before recreation:

| ID | Name |
|----|------|
| `126e9689-451a-4ae2-a7c5-0d4a8f456ffe` | QA Test - VCST-4590 Coupon Public |
| `48498217-b768-4695-b60f-b965fe554bd2` | Coupon on discount for shipping |
| `9c76cbafa93c4ecd8a605ae189b4da5f` | Register and get 15% for all |
| `d4f15ebb-73bd-44e1-b8d8-f553d8411fc3` | [E2E Test] Coupon |

---

## Reward & Condition Configuration (COMPLETED)

All 16 promotions have been configured with their `dynamicExpression` trees via REST API `PUT /api/marketing/promotions`. Verified programmatically (16/16 PASS via `verify-rewards.js`) and visually spot-checked in Admin SPA (P01, P07, P14).

| Promotion | Reward Configured | Condition Configured | Status |
|-----------|-------------------|---------------------|--------|
| P01 | RewardCartGetOfRelSubtotal 10% | (none) | DONE |
| P02 | RewardCartGetOfRelSubtotal 5% | (none) | DONE |
| P03 | RewardCartGetOfRelSubtotal 20% | (none) | DONE |
| P04 | RewardShippingGetOfRelShippingMethod 10% | (none) | DONE |
| P05 | RewardCartGetOfRelSubtotal 15% | (none) | DONE |
| P06 | RewardCartGetOfAbsSubtotal $5 | (none) | DONE |
| P07 | RewardItemGetOfRel 10% | ConditionCategoryIs: Wine (`e60acff3-fcf6-42e3-bad8-8796611361a9`) | DONE |
| P08 | RewardCartGetOfRelSubtotal 5% | (none) | DONE |
| P09 | RewardCartGetOfRelSubtotal 5% | (none) | DONE |
| P10 | RewardItemGiftNumItem qty=1 | (none) | DONE |
| P11 | RewardCartGetOfAbsSubtotal $5 | (none) | DONE |
| P12 | RewardShippingGetOfAbsShippingMethod $999 | (none) | DONE |
| P13 | RewardItemGetOfRel 20% | ConditionCategoryIs: Wine (`e60acff3-fcf6-42e3-bad8-8796611361a9`) | DONE |
| P14 | RewardCartGetOfRelSubtotal 10% | ConditionCartSubtotalLeast >= $50 | DONE |
| P15 | RewardCartGetOfRelSubtotal 10% | (none) | DONE |
| P16 | RewardCartGetOfRelSubtotal 10% | (none) | DONE |

---

## Manual Setup Still Required

The following items require storefront interaction and cannot be configured via REST API:

### 1. Edge Case Preconditions (E01, E02)

- **E01 (QA-MAXED):** Use coupon once via storefront checkout to max out total uses
- **E02 (QA-PERCUST):** Use coupon once as USER_EMAIL to exhaust per-customer limit

### 3. Bulk Import Test (CPN-047)

- Upload `qa-bulk-coupons.csv` via Admin > P01 > Coupons > Import to create IMPORT-TEST1/2/3

### 4. Localization (P01)

- P01 localized name/description for EN and DE must be set via Admin localization UI

---

## API Discovery Notes

- Promotion creation: `POST /api/marketing/promotions` -- does NOT accept coupons in payload
- Coupon creation: `POST /api/marketing/promotions/coupons/add` -- accepts array of Coupon objects with `promotionId`
- Coupon search: `POST /api/marketing/promotions/coupons/search` -- filter by `promotionId`
- Promotion update: `PUT /api/marketing/promotions` -- send full promotion object
- Exclusivity field: `isExclusive` (boolean), not `exclusivity` (string enum)
- Password with `!` in curl requires URL-encoding (`%21`) or the `-d` value needs proper quoting
- Token endpoint: `/connect/token` with `grant_type=password&scope=openid`
- Reward/condition configuration: `PUT /api/marketing/promotions` with full `dynamicExpression` tree (4 blocks: BlockCustomerCondition, BlockCatalogCondition, BlockCartCondition, BlockReward)
- Wine category ID: `e60acff3-fcf6-42e3-bad8-8796611361a9` (found via `/api/catalog/search/categories`)
- Category search: `POST /api/catalog/categories/search` with `{ keyword: "Wine", take: 20 }` -- 547 total categories in catalog
- Verification script: `test-data/promotions/verify-rewards.js` (run as .cjs due to ES modules project)
