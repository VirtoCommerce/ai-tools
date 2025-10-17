# Test Case: TC-011 - CSV Export for Inventory

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-011 |
| **Test Case Name** | CSV Export for Inventory Data |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Related Bug** | [VCST-2576](https://virtocommerce.atlassian.net/browse/VCST-2576) - Export to CSV: Internal error |
| **Priority** | P2 - High |
| **Test Type** | Functional - Export |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that CSV export functionality for inventory data works correctly after migration to Generic CRUD and Search services. This test specifically addresses the fix for VCST-2576 which caused "Internal error: An expression services limit has been reached" during CSV export.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Multiple inventory records exist in the system (varying quantities)
4. Test environment: https://vcst-qa.govirto.com/
5. Credentials: admin / Password3

## Test Data
**Inventory Records for Export:**
- Minimum 50 inventory records (to test expression limit fix)
- Mix of different products and fulfillment centers
- Various stock levels (in stock, out of stock, low stock)
- Records with different boolean flags (backorder, preorder)

**Expected CSV Columns:**
- Product SKU
- Product Name (if included)
- Fulfillment Center
- Fulfillment Center Name
- In Stock Quantity
- Reserved Quantity (if applicable)
- Reorder Min Quantity
- Allow Backorder
- Allow Preorder
- Created Date
- Modified Date

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Inventory" module | Inventory management page loads |
| 4 | Verify inventory list displays multiple records | Multiple records visible (50+) |
| 5 | Note total number of inventory records | Total count recorded: _____ |
| 6 | **Test 1: Export All Inventory (No Filters)** | |
| 7 | Locate "Export" or "Export to CSV" button | Export button is visible |
| 8 | Click "Export to CSV" button | Export process initiates |
| 9 | Observe export progress (if shown) | Progress indicator or immediate download |
| 10 | Verify no error message appears | **No "expression services limit" error** |
| 11 | Verify CSV file download starts | File download initiated |
| 12 | Wait for download to complete | File downloaded successfully |
| 13 | Note file name and size | File details recorded |
| 14 | Open CSV file in Excel/text editor | File opens without errors |
| 15 | **Verify CSV Contents** | |
| 16 | Verify header row contains expected columns | All expected columns present |
| 17 | Count number of data rows in CSV | Row count matches inventory count |
| 18 | Verify first 5 records have all fields populated | Data is complete |
| 19 | Verify last 5 records have all fields populated | Data is complete (no truncation) |
| 20 | Check for product SKU values | SKUs are present and correct |
| 21 | Check for fulfillment center values | FC names are present |
| 22 | Check for quantity values (In Stock, Reserved) | Numeric values are correct |
| 23 | Check for boolean values (Allow Backorder) | Values are true/false or yes/no |
| 24 | Check for date values | Dates are formatted correctly |
| 25 | Verify no duplicate rows | Each record appears once |
| 26 | Verify no missing data (empty cells for required fields) | Required fields are populated |
| 27 | **Test 2: Export with Filters Applied** | |
| 28 | Return to inventory page | Page loads |
| 29 | Apply filter: Fulfillment Center = "Main Warehouse" | Filter applied |
| 30 | Note filtered record count | Count recorded: _____ |
| 31 | Click "Export to CSV" | Export initiates |
| 32 | Verify export completes without error | No errors, file downloaded |
| 33 | Open CSV file | File opens |
| 34 | Verify row count matches filtered count | Only filtered records exported |
| 35 | Verify all rows are from "Main Warehouse" | Filter applied to export |
| 36 | **Test 3: Export Large Dataset** | |
| 37 | Clear filters to show all inventory | All records displayed |
| 38 | If less than 100 records, note actual count | Count noted |
| 39 | If 100+ records exist, proceed with export | |
| 40 | Click "Export to CSV" | Export initiates |
| 41 | Wait for export to complete | File downloads successfully |
| 42 | Open CSV file | File opens without corruption |
| 43 | Verify all records are exported | **No expression limit error, all rows present** |
| 44 | Check file size is reasonable | File size appropriate for data |
| 45 | **Test 4: Verify Data Accuracy** | |
| 46 | Choose 3 random products from CSV | Products selected |
| 47 | For each product, note SKU and quantities from CSV | Data recorded from CSV |
| 48 | Navigate to those products in admin UI | Products found |
| 49 | Compare CSV data with UI data | Data matches exactly |
| 50 | Verify inventory quantities match | Quantities are accurate |

## Expected Results

### Functional Behavior
- Export to CSV button is available and accessible
- Export process initiates without errors
- **No "expression services limit" error occurs (VCST-2576 fix)**
- CSV file is generated successfully
- File downloads to user's system
- Large datasets (100+ records) export successfully
- Export with filters applied works correctly
- Filtered exports contain only filtered records
- Export process is reasonably fast
- No timeout errors during export

### CSV File Characteristics
- **File Format**: Valid CSV format
- **File Extension**: .csv
- **File Size**: Appropriate for data volume
- **File Name**: Descriptive, includes timestamp or "inventory"
- **Encoding**: UTF-8 or compatible encoding
- **Delimiter**: Comma (,) or properly specified
- **Headers**: Clear column headers in first row
- **Data Rows**: One row per inventory record
- **No Corruption**: File opens in Excel and text editors

### Data Integrity in Export
- **Completeness**: All inventory records exported
- **Accuracy**: Data values match source database
- **Consistency**: No data transformation errors
- **Required Fields**: All required fields populated
- **Optional Fields**: Optional fields included (may be empty)
- **Relationships**: Product and FC references are included
- **Data Types**: Numbers, dates, booleans formatted correctly
- **Special Characters**: Handled correctly (quotes, commas in data)
- **No Duplicates**: Each record appears exactly once
- **No Missing Records**: Record count matches expected

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots and files here:_
- [ ] Export button location
- [ ] Export initiated (progress or download)
- [ ] No error message (confirm VCST-2576 fix)
- [ ] Downloaded CSV file
- [ ] CSV file opened in Excel (screenshot)
- [ ] CSV header row
- [ ] CSV data sample (first 10 rows)
- [ ] Filtered export CSV
- [ ] Large dataset export CSV

**CSV File Details:**
- File Name: _____________________
- File Size: _____________________
- Number of Rows (excluding header): _____
- Number of Columns: _____
- Encoding: _____________________

## Notes/Comments
_Add any additional observations or issues encountered_

**Related Bug**: VCST-2576 - "Export to CSV: Internal error: An expression services limit has been reached"

**Service Under Test**: Export functionality using IInventoryService and IInventorySearchService (migrated to Generic CRUD/Search)

**Migration Impact**: The migration to Generic services should resolve the expression limit issue that occurred with the previous implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Export button is accessible
- [ ] Export initiates without errors
- [ ] **No "expression services limit" error** (VCST-2576)
- [ ] CSV file is generated
- [ ] File downloads successfully
- [ ] File can be opened
- [ ] Header row is present and correct
- [ ] All records are exported
- [ ] Record count matches expected
- [ ] Data values are accurate
- [ ] Required fields are populated
- [ ] Date formats are correct
- [ ] Boolean values are readable
- [ ] Numeric values are correct
- [ ] No duplicate records
- [ ] Filtered export works correctly
- [ ] Large dataset export works (100+ records)
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-002: View/Read Inventory Details (verify source data before export)
- TC-005: Search Inventory by Product SKU (export search results)
- TC-006: Search Inventory by Fulfillment Center (export filtered results)
- TC-007: Advanced Inventory Search with Filters (export with complex filters)

## CSV Verification Checklist

**Column Verification:**
- [ ] Product SKU column
- [ ] Product Name column (if applicable)
- [ ] Fulfillment Center ID/Name column
- [ ] In Stock Quantity column
- [ ] Reserved Quantity column
- [ ] Reorder Min Quantity column
- [ ] Allow Backorder column
- [ ] Allow Preorder column
- [ ] Created Date column
- [ ] Modified Date column

**Data Quality Checks:**
- [ ] No empty rows
- [ ] No malformed rows (wrong column count)
- [ ] Consistent data types per column
- [ ] Valid date formats
- [ ] Valid numeric formats
- [ ] Boolean values are consistent (true/false or yes/no)
- [ ] No unescaped special characters breaking CSV format

## Additional Scenarios

### Scenario 1: Export with Search Applied
- Enter search term for specific product
- Apply search
- Export to CSV
- Verify only matching products in CSV

### Scenario 2: Export Empty Result Set
- Apply filters that match no records
- Attempt export
- Verify CSV has header row only, or appropriate message

### Scenario 3: Export with Special Characters
- Find inventory with product names containing commas, quotes
- Export to CSV
- Verify special characters are properly escaped
- Verify CSV format is not broken

### Scenario 4: Export with Very Large Dataset
- System with 1000+ inventory records
- Export to CSV
- Verify export completes (may take longer)
- Verify all records exported
- **Verify no expression limit error**

### Scenario 5: Rapid Consecutive Exports
- Export CSV
- Immediately export again
- Export a third time
- Verify all exports succeed
- Verify no conflicts or errors

### Scenario 6: Export and Re-Import
- Export inventory to CSV
- Modify some values in CSV
- Import modified CSV (if import feature exists)
- Verify import works with exported format

## Performance Considerations
- Export 50 records - time: _____ seconds
- Export 100 records - time: _____ seconds
- Export 500 records - time: _____ seconds
- Export 1000+ records - time: _____ seconds

**Acceptable Performance:**
- 50-100 records: < 5 seconds
- 100-500 records: < 15 seconds
- 500-1000 records: < 30 seconds
- 1000+ records: < 60 seconds

## VCST-2576 Specific Verification

**Confirm Bug Fix:**
- [ ] Export 50+ records WITHOUT "expression services limit" error
- [ ] Export 100+ records WITHOUT error
- [ ] Export with complex filters WITHOUT error
- [ ] Export completes successfully where it previously failed

**Before Fix (Expected Failure):** "Internal error: An expression services limit has been reached"

**After Fix (Expected Success):** CSV export completes successfully with no errors

