# Cleanup Report: Configurable Products E2E Test Data (2026-02-24)

**Date:** 2026-02-24
**Environment:** QA (https://vcst-qa.govirto.com)
**Store:** B2B-store
**Executed by:** qa-backend-expert agent
**Auth method:** REST API via playwright-edge browser_evaluate

---

## Summary

| Area | Status | Details |
|------|--------|---------|
| Test product deletion | COMPLETED | 19/19 test products deleted |
| Pricelist cleanup (BeerUSD) | COMPLETED | 9 price entries removed from BeerUSD pricelist |
| Pricelist cleanup (all) | PARTIAL | 4 inherited price references remain (will orphan-clean on next index) |
| Inventory cleanup | CASCADE | 19 inventory entries removed via product deletion cascade |
| Virtual catalog links | COMPLETED | 3 links removed from B2B-mixed / Configurations category |
| Search re-index | TRIGGERED | Job IDs: 1341885, 1341886 |
| **Collateral damage** | **CRITICAL** | **Entire "Configurable products" catalog content wiped** |

---

## CRITICAL ISSUE: Unintended Cascade Deletion

**The `POST /api/catalog/listentries/delete` API, when called without a `categoryId` parameter, cascade-deleted the entire "Configurable products" physical catalog contents -- not just the specified product IDs.**

### What was lost:

- **7 categories** in the "Configurable products" catalog:
  - "Build the bike of your dreams" (24f62fd5)
  - "Components" (9f01b7dd)
  - "Create your own Entertainments" (d0b18b79)
  - "Custom Furniture" (f4237014)
  - "Dreamy cakes" (477ae5de)
  - "Pillows, blankets and mattress made of natural materials" (2e2f0e39)
  - "Wonderful beds" (376e6287)

- **~48 pre-existing products** including:
  - "Bike with options" (CVQ-54616437, ID: 2923a1f6) -- configurable product used for demos
  - "Off-Road Bike. Configurable product" (INN-69077289, ID: 958d0762)
  - "Bed" (XTB-45758311), "Blanket" (CBB-80276738), "Pedals" (QRS-65145454)
  - Various buttercreme/cake products, school desks, entertainment sets, etc.
  - Full list was captured in the initial `listentries` query (67 total entries minus 19 test products)

- **"Configurations" virtual category** (a50654eb) in B2B-mixed virtual catalog was also removed.

### Root Cause:

The `POST /api/catalog/listentries/delete` endpoint appears to perform a catalog-scoped cascade delete when `catalogId` is specified without `categoryId`. The first call targeted 3 linked products from B2B-mixed with `catalogId: 'fc596540864a41bf8ab78734ee7353a3'`, which deleted those products AND the associated virtual category. The second call targeted 9 remaining products with `catalogId: '7f840fe0-f141-471c-9bad-97d33ee5e87d'` (the physical catalog), which cascaded to delete ALL remaining content in that catalog.

### Remediation Required:

1. **Restore the "Configurable products" catalog data** from a QA database backup or re-deploy from seed data
2. **Restore the "Configurations" virtual category** in B2B-mixed and re-link configurable products
3. **Trigger a full search re-index** after restoration

The catalog shell itself (`7f840fe0-f141-471c-9bad-97d33ee5e87d`) still exists and can be repopulated.

---

## Test Products Successfully Deleted (19 total)

### Main Configurable Products (5)

| # | Name | SKU | ID | Status |
|---|------|-----|----|--------|
| 1 | Test Config Bike 20260224 | BIKE-CFG-20260224 | 38f9fe93-6316-4577-b755-3dc5e52ff428 | DELETED |
| 2 | Test Config Laptop 20260224 | LAPTOP-CFG-20260224 | 23c2d777-7a81-40c0-9c9a-8223df9c005e | DELETED |
| 3 | Test Config OOS Bike 20260224 | BIKE-OOS-CFG-20260224 | f481a9f6-fab0-4f73-8cc9-1970567ce580 | DELETED |
| 4 | Test Config AllOOS 20260224 | CFG-ALLOOS-20260224 | ceabf76f-4c86-4e25-8823-cda20809e897 | DELETED |
| 5 | Test Config Checkout Bike 20260224 | BIKE-CHK-CFG-20260224 | 8c283a9c-6177-4e0e-92a7-819a42eeb21b | DELETED (not in original request, discovered during cleanup) |

### Bike Option Products (6)

| # | Name | SKU | ID | Status |
|---|------|-----|----|--------|
| 6 | Standard Wheels | WHEEL-STD-20260224 | cafec596-5fb0-437d-8f1b-701942815795 | DELETED |
| 7 | Sport Wheels | WHEEL-SPORT-20260224 | 0fa83b9d-c619-470b-928a-e1d4be7b18c0 | DELETED |
| 8 | Azure Frame (was Blue Frame) | FRAME-BLUE-20260224 | 3b7cb98b-da8b-41b5-8a92-592beb9c8861 | DELETED |
| 9 | Red Frame | FRAME-RED-20260224 | 08dd55f3-e006-44d7-a429-9e127fa57adf | DELETED |
| 10 | Limited Edition Black Frame | FRAME-BLACK-20260224 | 9215d047-b84b-4069-b859-a5c372bbff80 | DELETED |
| 11 | Silver Frame | FRAME-SILVER-20260224 | b5850faf-ebc7-4add-9d2f-c4f3c8fde0a7 | DELETED |

### Laptop Option Products (6)

| # | Name | SKU | ID | Status |
|---|------|-----|----|--------|
| 12 | 8GB | RAM-8GB-20260224 | 5cf79641-50c6-4d5d-aad3-e7df71854ff7 | DELETED |
| 13 | 16GB | RAM-16GB-20260224 | 754c9182-9ba3-4e13-ad89-5c135700685d | DELETED |
| 14 | 32GB | RAM-32GB-20260224 | af80389e-5aed-4104-86e8-076102612828 | DELETED |
| 15 | 256GB SSD | SSD-256GB-20260224 | 3aac3a08-3054-4685-bc5f-88d796809277 | DELETED |
| 16 | 512GB SSD | SSD-512GB-20260224 | bcb54e42-f32f-4695-83b7-14d9a6c9a582 | DELETED |
| 17 | 1TB SSD | SSD-1TB-20260224 | 87624d0c-bf80-44b0-97e6-dddec2aa1446 | DELETED |

### AllOOS Option Products (2)

| # | Name | SKU | ID | Status |
|---|------|-----|----|--------|
| 18 | Carbon Material | MAT-CARBON-20260224 | 5b233bba-e93f-4470-acc4-ca78e4ecc79c | DELETED |
| 19 | Titanium Material | MAT-TITANIUM-20260224 | 64b35486-a526-4b77-959c-009033dc65ab | DELETED |

---

## Pricelist Cleanup

- **BeerUSD** (a690e429-ac38-4e15-9099-9938f3577b71): 9 price entries deleted via `DELETE /api/pricing/pricelists/{id}/products/prices` -- Status 204
- **All pricelists**: Bulk delete via `DELETE /api/pricing/products/prices` -- Status 204
- **Post-verify**: BeerUSD = 0 remaining, All pricelists = 4 remaining (inherited via pricelist assignments, orphaned after product deletion)

## Inventory Cleanup

19 inventory entries found across 2 fulfillment centers were cascade-deleted with the products:
- **Los Angeles Branch** (vendor-fulfillment): 9 entries
- **Transfer_2 USA Florida FFC** (08996841): 10 entries

## Virtual Catalog Links

3 products had links to B2B-mixed / Configurations category (a50654eb):
- Test Config OOS Bike, Test Config AllOOS, Test Config Checkout Bike
- Links removed via `POST /api/catalog/listentries/delete` -- Status 204

## Orders

The following orders were NOT deleted (as requested, left as-is):
- CO260224-00006
- CO260224-00007
- CO260224-00009

## Search Re-Index

- Triggered via `POST /api/search/indexes/index` with `rebuild: true`
- Job ID 1341885 (general document type)
- Job ID 1341886 (Product document type)

---

## Lessons Learned / API Behavior Documentation

**IMPORTANT**: The Virto Commerce `POST /api/catalog/listentries/delete` endpoint behaves differently than expected:

1. When called with `catalogId` and `listEntries` (array of product entries), it does NOT limit deletion to just the listed products. It appears to cascade-delete based on the catalog scope.
2. The safe way to delete individual products is likely `DELETE /api/catalog/products?ids=...` (not via `listentries/delete`).
3. For virtual catalog unlinks, specify both `catalogId` and `categoryId` AND set `isVirtual: true` on the entries.

**Recommendation for future cleanup operations:**
- Use the direct `DELETE /api/catalog/products` endpoint with specific product IDs
- Test the delete API against a single product first before batch operations
- Always verify pre-existing data integrity immediately after the first delete call
