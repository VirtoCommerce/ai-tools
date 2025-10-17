# Test Data - VCST-2585 Inventory Regression Testing

## Document Information

| Field | Value |
|-------|-------|
| **Document Type** | Test Data Specification |
| **Related Ticket** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Test Environment** | https://vcst-qa.govirto.com/ |
| **Last Updated** | 2025-10-15 |

## Overview

This document specifies the test data requirements for regression testing the Inventory module after migration to Generic CRUD and Search services.

## Test Environment Access

**Backend Admin:**
- URL: https://vcst-qa.govirto.com/
- Username: admin
- Password: Password3

**Permissions Required:**
- Admin/System Administrator
- Inventory Management
- Catalog Management
- Backup/Restore Access

## Fulfillment Centers

The following fulfillment centers should exist in the test environment:

| FC ID | FC Name | Description | Status |
|-------|---------|-------------|--------|
| main-warehouse | Main Warehouse | Primary fulfillment center | Active |
| east-coast-dc | East Coast DC | East coast distribution center | Active |
| west-coast-dc | West Coast DC | West coast distribution center | Active |
| new-empty-warehouse | New Empty Warehouse | Empty FC for testing | Active |
| test-warehouse | Test Warehouse | Test purposes only | Active |

**Setup Instructions:**
1. Verify all fulfillment centers exist in Settings → Fulfillment Centers
2. If missing, create the fulfillment centers
3. Ensure all are in "Active" status

## Test Products

### Products for CRUD Operations (TC-001 to TC-004)

| Product SKU | Product Name | Category | Status |
|-------------|--------------|----------|--------|
| TEST-PRODUCT-001 | Test Product 001 | Test Category | Active |
| TEST-PRODUCT-002 | Test Product 002 | Test Category | Active |
| TEST-PRODUCT-003 | Test Product 003 | Test Category | Active |
| TEST-PRODUCT-DELETE-001 | Test Product Delete 001 | Test Category | Active |

**Initial Inventory:**
- TEST-PRODUCT-001 @ Main Warehouse: 100 in stock, 10 reserved
- TEST-PRODUCT-002 @ East Coast DC: 50 in stock, 5 reserved
- TEST-PRODUCT-003 @ West Coast DC: 75 in stock, 0 reserved

### Products for Search Testing (TC-005 to TC-007)

| Product SKU | Product Name | FCs with Inventory |
|-------------|--------------|-------------------|
| TEST-LAPTOP-001 | Test Laptop Model 001 | Main Warehouse, East Coast DC |
| TEST-PHONE-001 | Test Phone Model 001 | Main Warehouse |
| TEST-PHONE-002 | Test Phone Model 002 | West Coast DC |

**Inventory Details:**
- TEST-LAPTOP-001 @ Main Warehouse: 100 in stock
- TEST-LAPTOP-001 @ East Coast DC: 50 in stock
- TEST-PHONE-001 @ Main Warehouse: 75 in stock
- TEST-PHONE-002 @ West Coast DC: 30 in stock

### Products for Indexing Testing (TC-010)

| Product SKU | Product Name | Stock Status |
|-------------|--------------|--------------|
| TEST-INDEX-PRODUCT-001 | Test Index Product 001 | In Stock (100) |
| TEST-INDEX-PRODUCT-002 | Test Index Product 002 | Out of Stock (0) |
| TEST-INDEX-PRODUCT-003 | Test Index Product 003 | Low Stock (5) |

**Inventory Details:**
- TEST-INDEX-PRODUCT-001 @ Main Warehouse: 100 in stock
- TEST-INDEX-PRODUCT-002 @ Main Warehouse: 0 in stock
- TEST-INDEX-PRODUCT-003 @ Main Warehouse: 5 in stock, reorder min: 20

### Products for Stock Management Testing (TC-013)

| Product SKU | Product Name | Initial Stock |
|-------------|--------------|---------------|
| TEST-STOCK-MGMT-001 | Test Stock Management 001 | 100 in stock, 10 reserved |

**Inventory Details:**
- TEST-STOCK-MGMT-001 @ Main Warehouse: 100 in stock, 10 reserved, reorder min: 20

### Products for Bulk Operations (TC-012)

Create 10 test products for bulk deletion:

| Product SKU | Product Name | FC | Stock |
|-------------|--------------|-----|-------|
| BULK-TEST-001 | Bulk Test Product 001 | Test Warehouse | 10 |
| BULK-TEST-002 | Bulk Test Product 002 | Test Warehouse | 10 |
| BULK-TEST-003 | Bulk Test Product 003 | Test Warehouse | 10 |
| BULK-TEST-004 | Bulk Test Product 004 | Test Warehouse | 10 |
| BULK-TEST-005 | Bulk Test Product 005 | Test Warehouse | 10 |
| BULK-TEST-006 | Bulk Test Product 006 | Test Warehouse | 10 |
| BULK-TEST-007 | Bulk Test Product 007 | Test Warehouse | 10 |
| BULK-TEST-008 | Bulk Test Product 008 | Test Warehouse | 10 |
| BULK-TEST-009 | Bulk Test Product 009 | Test Warehouse | 10 |
| BULK-TEST-010 | Bulk Test Product 010 | Test Warehouse | 10 |

**Note:** These products will be deleted during TC-012 bulk delete test.

## CSV Import Test Data

**File: inventory_import_test.csv**

Create a CSV file with 20-30 inventory records for bulk import testing (TC-012):

```csv
ProductSku,FulfillmentCenterName,InStockQuantity,ReservedQuantity,ReorderMinQuantity,AllowBackorder,AllowPreorder
IMPORT-TEST-001,Main Warehouse,100,10,20,true,false
IMPORT-TEST-002,Main Warehouse,50,5,15,true,true
IMPORT-TEST-003,East Coast DC,75,0,25,false,false
IMPORT-TEST-004,East Coast DC,100,20,30,true,false
IMPORT-TEST-005,West Coast DC,60,10,20,false,true
IMPORT-TEST-006,West Coast DC,80,15,25,true,false
IMPORT-TEST-007,Main Warehouse,90,5,20,false,false
IMPORT-TEST-008,Main Warehouse,110,10,30,true,true
IMPORT-TEST-009,East Coast DC,45,0,15,true,false
IMPORT-TEST-010,East Coast DC,70,10,20,false,false
IMPORT-TEST-011,West Coast DC,85,5,25,true,true
IMPORT-TEST-012,West Coast DC,95,15,30,false,false
IMPORT-TEST-013,Main Warehouse,55,5,15,true,false
IMPORT-TEST-014,Main Warehouse,120,20,35,true,true
IMPORT-TEST-015,East Coast DC,40,0,10,false,false
IMPORT-TEST-016,East Coast DC,65,10,20,true,false
IMPORT-TEST-017,West Coast DC,75,10,25,false,true
IMPORT-TEST-018,West Coast DC,100,15,30,true,false
IMPORT-TEST-019,Main Warehouse,88,8,22,false,false
IMPORT-TEST-020,Main Warehouse,105,12,28,true,true
```

**Setup Instructions:**
1. Create products IMPORT-TEST-001 through IMPORT-TEST-020 in catalog
2. Save CSV file as `inventory_import_test.csv`
3. Use for TC-012 bulk import test

## Test Data for Backup/Restore (TC-008, TC-009)

**Pre-Backup State:**
- Ensure at least 50 inventory records exist
- Include variety of stock levels (in stock, out of stock, low stock)
- Include records across multiple fulfillment centers
- Document specific records to verify after restore:
  - TEST-PRODUCT-001 @ Main Warehouse: 100/10
  - TEST-PRODUCT-002 @ East Coast DC: 50/5
  - TEST-PRODUCT-003 @ West Coast DC: 75/0

**Backup File:**
- Will be created during TC-008
- Store securely for use in TC-009
- Document file name and creation timestamp

## Test Data for CSV Export (TC-011)

**Requirements:**
- Minimum 50 inventory records for expression limit testing (VCST-2576)
- Mix of different products and fulfillment centers
- Various stock levels
- Include records with special characters in product names (if any)

**Verification Records:**
Select 5-10 random records and document their details before export for verification:

| Product SKU | FC | In Stock | Reserved | Verified? |
|-------------|-----|----------|----------|-----------|
| ___________ | ___ | ________ | ________ | ☐ |
| ___________ | ___ | ________ | ________ | ☐ |
| ___________ | ___ | ________ | ________ | ☐ |
| ___________ | ___ | ________ | ________ | ☐ |
| ___________ | ___ | ________ | ________ | ☐ |

## Validation Test Data (TC-014)

**Invalid Data Samples:**
- Non-numeric stock value: "abc", "100#@", "xyz"
- Negative stock value: -50, -10, -100
- Decimal stock value: 50.75, 100.5, 25.33
- Very large value: 999999999999
- Special characters: "@#$%", "100!@#"
- Empty required fields: (blank)

**Valid Data Samples:**
- Stock values: 0, 1, 100, 1000, 50000
- Boolean values: true, false, yes, no

## Test Data Maintenance

### Before Testing
1. Verify all fulfillment centers exist
2. Create all test products
3. Create initial inventory records
4. Create CSV import file
5. Document current state

### During Testing
1. Document any new test data created
2. Track which records are modified
3. Track which records are deleted
4. Save backup files securely

### After Testing
1. Clean up test records (optional, or keep for future tests)
2. Delete bulk test products (BULK-TEST-001 to 010)
3. Delete import test products (IMPORT-TEST-001 to 020)
4. Archive any created files (backup, CSV exports)
5. Document final state

## Data Setup Script (Optional)

If automation is available, create a setup script to:
1. Create all test fulfillment centers
2. Create all test products
3. Create initial inventory records
4. Generate CSV import file
5. Validate setup is complete

## Test Data Verification Checklist

Before starting test execution:
- [ ] All fulfillment centers exist
- [ ] All CRUD test products exist with inventory
- [ ] All search test products exist with inventory
- [ ] All indexing test products exist with inventory
- [ ] Stock management test product exists
- [ ] Bulk test products created (10 products)
- [ ] Import CSV file created (20-30 records)
- [ ] Admin access verified (admin / Password3)
- [ ] Environment is https://vcst-qa.govirto.com/
- [ ] Minimum 50 total inventory records exist
- [ ] Current state documented

## Inventory Count Summary

**Expected Inventory Counts After Setup:**
- Total inventory records: ~50+ (verify actual count)
- Records in Main Warehouse: ~20+
- Records in East Coast DC: ~10+
- Records in West Coast DC: ~10+
- Records in Test Warehouse: ~10
- Products with inventory: ~40+

**Document Actual Counts:**
- Total inventory records: _____
- Records in Main Warehouse: _____
- Records in East Coast DC: _____
- Records in West Coast DC: _____
- Records in Test Warehouse: _____
- Products with inventory: _____

## Notes

- All test product SKUs prefixed with "TEST-" or "BULK-" or "IMPORT-" for easy identification
- Test data can be reused across multiple test runs
- Clean up test data after testing (optional)
- Keep backup files for restore testing
- Document any deviations from this specification

## Contact

For test data setup issues or questions:
- Test Lead: Elena Mutykova
- Environment Owner: DevOps Team
- DBA Support: (if database access needed)

