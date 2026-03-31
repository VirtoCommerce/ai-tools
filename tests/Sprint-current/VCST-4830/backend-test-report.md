# Backend Test Report -- VCST-4830

**Title:** Address created on every API call  
**Fix:** PR #106 (vc-module-x-cart) -- `AddShipmentAsync` now only resets `DeliveryAddress.Key` when the address doesn't belong to an existing cart shipment. `AddOrUpdateCartShipmentCommandHandler` preserves the previous delivery address key.  
**Artifact:** VirtoCommerce.XCart_3.1005.0-pr-106-ad89.zip  
**Tested by:** qa-backend-expert (automated)  
**Date:** 2026-03-31

## Environment

| Property | Value |
|----------|-------|
| Backend | https://vcst-qa.govirto.com |
| Frontend | https://vcst-qa-storefront.govirto.com |
| Store | B2B-store |
| User | mutykovaelena@gmail.com (multi-org) |
| User ID | 42765f34-51cf-4994-806b-e82e65fd5c14 |
| Platform Health | Healthy (Modules, Cache, Redis, SQL Server) |
| Tool | GraphQL xAPI via curl + GraphiQL UI (playwright-edge) |

## Test Results

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Authenticate via OAuth2 | PASS | Token obtained, 1799s expiry |
| 3 | Get userId via `me` query | PASS | ID: 42765f34-51cf-4994-806b-e82e65fd5c14 |
| 4 | Add item to cart | PASS | Cart 243ee3b1, itemsCount=1, product ALCOE1839 |
| 5 | Set FIRST shipping address (123 Test St, NY) | PASS | Shipment 9332394d, key c06f0347 assigned |
| 6 | Query cart state | PASS | 1 item, 1 shipment, address=123 Test St |
| 7 | UPDATE address to 456 Updated Ave (same shipment) | PASS | Address updated, key PRESERVED (c06f0347), shipment count=1 |
| 8 | THIRD update to 789 Third St | PASS | Address updated, key PRESERVED (c06f0347), shipment count=1 |
| 9 | Final cart query + availableShippingMethods | PASS | Cart valid, 1 shipment, 3 shipping methods, no validation errors |
| 10 | C3: Multi-cart PK guard | PASS | New cart got NEW key (808abe8e), no PK collision |
| 11 | C1: Address change updates shipping methods | PASS | CA address accepted, shipping methods returned, key still preserved |

**All 10 tests PASSED. 0 failures.**

## Address Key Tracking

| Step | Action | deliveryAddress.key | line1 | Shipment Count |
|------|--------|-------------------|-------|----------------|
| 5 | Set FIRST address | c06f0347-31d4-442d-b86c-6044a18a8443 | 123 Test St | 1 |
| 6 | Query cart (verify) | c06f0347-31d4-442d-b86c-6044a18a8443 | 123 Test St | 1 |
| 7 | UPDATE to 456 Updated Ave | c06f0347-31d4-442d-b86c-6044a18a8443 | 456 Updated Ave | 1 |
| 8 | UPDATE to 789 Third St | c06f0347-31d4-442d-b86c-6044a18a8443 | 789 Third St | 1 |
| 11 | UPDATE to 100 Sunset Blvd (CA) | c06f0347-31d4-442d-b86c-6044a18a8443 | 100 Sunset Blvd | 1 |
| 10 | NEW cart, same address | 808abe8e-6c01-437c-854e-ef2394e70714 | 123 Test St | 1 |

**Key observation:** The `deliveryAddress.key` remained `c06f0347-31d4-442d-b86c-6044a18a8443` through 4 consecutive address updates on the same cart shipment. This confirms the fix: `AddShipmentAsync` now preserves the address key when updating an existing shipment's delivery address, preventing the creation of duplicate CartAddress records in the database.

A new cart correctly received a different key (`808abe8e`), confirming the PK duplication guard for cross-cart scenarios still works.

## Business Rules Verified

| Rule | Description | Result |
|------|-------------|--------|
| BL-CHK-005 | Shipping method depends on address | PASS -- methods returned after address set/change |
| BL-SHIP-001 | Ship-to address determines available methods | PASS -- 3 methods available for both NY and CA addresses |
| ECL-14.1 | API contract -- mutation returns match expectations | PASS -- all mutations returned correct shipment/address structure |
| ECL-8.1 | Address boundary -- repeated updates to same entity | PASS -- 4 updates, no duplication, key preserved |

## Regression Guards

| Guard | Description | Result |
|-------|-------------|--------|
| C1 | Address change updates shipping methods | PASS -- region change (NY to CA) accepted, methods recalculated |
| C3 | Multi-cart PK guard | PASS -- new cart gets new address key, no PK collision |

## Evidence

| File | Description |
|------|-------------|
| screenshots/step9-final-cart-query.png | GraphiQL showing final cart query with single shipment, preserved key, and 3 shipping methods |

## Cleanup

All test entities cleaned up:
- Cart 243ee3b1-03ec-4824-a862-4530dd4914ff: cleared + removed
- Cart 211107be-83ae-490d-97b9-b6e8d40dd28c: cleared + removed
- No orphaned data left

## Verdict

**PASS** -- The fix in PR #106 (VirtoCommerce.XCart_3.1005.0-pr-106-ad89) correctly resolves the "address created on every API call" bug. The `addOrUpdateCartShipment` mutation now preserves the `deliveryAddress.key` when updating an existing shipment's address, preventing duplicate CartAddress records. Verified through 4 consecutive address updates on the same shipment with consistent key preservation. Regression guards (multi-cart PK isolation, shipping method recalculation) also pass.
