# Test Case: TC-012 - Bulk Inventory Operations

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-012 |
| **Test Case Name** | Bulk Inventory Operations |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P2 - High |
| **Test Type** | Functional - Bulk Operations |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that bulk inventory operations (bulk update, bulk delete, bulk import) work correctly after migration to Generic CRUD services. Ensure that IInventoryService can handle multiple records efficiently and accurately.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Multiple inventory records exist for bulk operations
4. Test environment: https://vcst-qa.govirto.com/
5. Credentials: admin / Password3

## Test Data
**Bulk Update Test:**
- 10-20 inventory records to update
- New quantity value: Increase by 50

**Bulk Delete Test:**
- 5-10 test inventory records (created specifically for deletion)
- Products: BULK-TEST-001 through BULK-TEST-010

**Bulk Import Test:**
- CSV file with 20-30 inventory records
- Mix of new records and updates to existing records

## Test Steps

### Part 1: Bulk Update

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Inventory" module | Inventory page loads |
| 4 | Select multiple inventory records (10-20 records) | Records selected via checkboxes |
| 5 | Verify "Bulk Actions" or "Actions" dropdown appears | Bulk actions menu is visible |
| 6 | Click "Bulk Actions" dropdown | Menu opens with options |
| 7 | Select "Bulk Update" or "Update Selected" option | Bulk update dialog/form opens |
| 8 | Verify form shows count of selected records | Count displayed (e.g., "10 records selected") |
| 9 | Enter update action: "Increase In Stock by 50" | Action configured |
| 10 | Click "Apply" or "Update" button | Bulk update initiates |
| 11 | Observe progress indicator (if shown) | Progress bar or percentage shown |
| 12 | Wait for completion | "Bulk update completed" message |
| 13 | Note how many records updated | Count displayed: "10 records updated" |
| 14 | Verify no error message | No errors reported |
| 15 | Check first updated record details | Quantity increased by 50 |
| 16 | Check random updated records (3-5 records) | All show quantity increased by 50 |
| 17 | Verify unselected records are unchanged | Other records not affected |

### Part 2: Bulk Delete

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 18 | **Setup**: Create 10 test inventory records | Records created: BULK-TEST-001 to 010 |
| 19 | Navigate to inventory list | Page loads with test records visible |
| 20 | Filter or search for BULK-TEST records | Test records displayed |
| 21 | Select all 10 test records | All 10 records selected |
| 22 | Click "Bulk Actions" dropdown | Menu opens |
| 23 | Select "Bulk Delete" or "Delete Selected" | Confirmation dialog appears |
| 24 | Verify confirmation shows count: "10 records" | Count is correct |
| 25 | Verify warning about permanent deletion | Warning message displayed |
| 26 | Click "Cancel" first | Dialog closes, no deletion |
| 27 | Verify records still exist | All 10 records still visible |
| 28 | Select all 10 test records again | Records selected |
| 29 | Click "Bulk Delete" | Confirmation dialog appears |
| 30 | Click "Confirm" or "Delete" | Bulk delete initiates |
| 31 | Observe progress (if shown) | Progress indicator displayed |
| 32 | Wait for completion | "10 records deleted successfully" |
| 33 | Verify records removed from list | Test records no longer visible |
| 34 | Search for BULK-TEST products | No results found (deleted) |
| 35 | Verify products still exist (inventory only deleted) | Products remain in catalog |

### Part 3: Bulk Import from CSV

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 36 | Prepare CSV file with 20-30 inventory records | CSV file ready |
| 37 | Navigate to Inventory module | Page loads |
| 38 | Locate "Import" or "Import from CSV" button | Import button visible |
| 39 | Click "Import from CSV" | Import dialog/page opens |
| 40 | Click "Choose File" or "Browse" | File selection dialog opens |
| 41 | Select prepared CSV file | File selected |
| 42 | Verify file name is displayed | File name shown |
| 43 | Configure import options (if available) | Options set (Create + Update mode) |
| 44 | Click "Upload" or "Import" button | Import process starts |
| 45 | Observe import progress | Progress shown |
| 46 | Wait for import to complete | "Import completed" message |
| 47 | Verify import summary shows record counts | "20 created, 5 updated" (example) |
| 48 | Verify no errors or minimal errors | Error count is 0 or minimal |
| 49 | Review error details if any | Errors are documented |
| 50 | Navigate to inventory list | Page loads |
| 51 | Search for imported records | Imported records found |
| 52 | Verify 3-5 imported records have correct data | Data matches CSV |
| 53 | Verify updated records show new values | Updates applied |
| 54 | Verify new records were created | New records exist |

## Expected Results

### Bulk Update
- Multiple records can be selected simultaneously
- Bulk update action is available
- Update applies to all selected records
- Progress is shown for long operations
- Success message shows count of updated records
- All selected records are updated correctly
- Unselected records are not affected
- Update is atomic (all succeed or all fail)
- Performance is acceptable (< 10 seconds for 20 records)

### Bulk Delete
- Multiple records can be selected for deletion
- Confirmation dialog appears before deletion
- Warning about permanent deletion is clear
- Cancel option prevents deletion
- Bulk delete removes all selected records
- Success message shows count of deleted records
- Deleted records no longer appear in list
- Related products remain intact
- Deletion is atomic
- Performance is acceptable

### Bulk Import
- Import from CSV functionality exists
- CSV file can be uploaded
- Import process validates CSV format
- Import creates new records
- Import updates existing records
- Import summary shows counts (created, updated, errors)
- Errors are reported with details
- Successfully imported data is accurate
- Performance is acceptable (< 30 seconds for 30 records)

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Multiple records selected
- [ ] Bulk actions menu
- [ ] Bulk update dialog
- [ ] Bulk update progress
- [ ] Bulk update completion
- [ ] Updated records verification
- [ ] Bulk delete confirmation
- [ ] Bulk delete completion
- [ ] Import CSV upload
- [ ] Import progress
- [ ] Import summary/results
- [ ] Imported records verification

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService, InventoryServiceImpl (migrated to Generic CRUD - batch operations)

**Migration Impact**: Bulk operations must work efficiently with the Generic CRUD implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist

**Bulk Update:**
- [ ] Multiple records can be selected
- [ ] Bulk update option is available
- [ ] Update dialog shows selected count
- [ ] Update applies to all selected records
- [ ] Success message with count
- [ ] All updated records are correct
- [ ] Unselected records unchanged
- [ ] No errors
- [ ] Performance is good

**Bulk Delete:**
- [ ] Multiple records can be selected
- [ ] Bulk delete option is available
- [ ] Confirmation dialog appears
- [ ] Warning message is clear
- [ ] Cancel prevents deletion
- [ ] Deletion removes all selected records
- [ ] Success message with count
- [ ] No orphaned data
- [ ] No errors
- [ ] Performance is good

**Bulk Import:**
- [ ] Import functionality exists
- [ ] CSV file uploads successfully
- [ ] Import processes without errors
- [ ] New records are created
- [ ] Existing records are updated
- [ ] Import summary is accurate
- [ ] Errors are reported clearly
- [ ] Imported data is accurate
- [ ] Performance is acceptable

## Related Test Cases
- TC-001: Create New Inventory Record (single create vs bulk)
- TC-003: Update Inventory Information (single update vs bulk)
- TC-004: Delete Inventory Record (single delete vs bulk)
- TC-011: CSV Export for Inventory (export then import)

## Additional Scenarios

### Scenario 1: Bulk Update with Validation Error
- Select 10 records
- Attempt bulk update with invalid value (e.g., negative quantity)
- Verify validation error is shown
- Verify no records are updated

### Scenario 2: Bulk Update Partial Selection
- Select 5 out of 50 records
- Perform bulk update
- Verify only 5 records are updated
- Verify other 45 records unchanged

### Scenario 3: Bulk Delete with Mixed Selection
- Select records from different fulfillment centers
- Perform bulk delete
- Verify all selected records deleted regardless of FC

### Scenario 4: Import CSV with Errors
- CSV has 30 records, 5 have errors (invalid data)
- Import CSV
- Verify 25 successful imports
- Verify 5 errors reported with details
- Verify error details help identify problem records

### Scenario 5: Import CSV with Duplicates
- CSV has duplicate entries (same product + FC twice)
- Import CSV
- Verify system behavior (reject duplicate, or use last value)
- Document expected behavior

### Scenario 6: Large Bulk Operation
- Select 100+ records
- Perform bulk update
- Verify operation completes
- Verify performance is acceptable
- Verify all records updated

## Performance Benchmarks

| Operation | Record Count | Expected Duration | Actual Duration | Pass? |
|-----------|--------------|-------------------|-----------------|-------|
| Bulk Update | 10 | < 5 sec | _____ | ☐ |
| Bulk Update | 20 | < 10 sec | _____ | ☐ |
| Bulk Update | 50 | < 20 sec | _____ | ☐ |
| Bulk Delete | 10 | < 3 sec | _____ | ☐ |
| Bulk Delete | 20 | < 5 sec | _____ | ☐ |
| Bulk Import | 30 | < 30 sec | _____ | ☐ |
| Bulk Import | 100 | < 90 sec | _____ | ☐ |

## CSV Import Template

**Required CSV Format:**
```csv
ProductSku,FulfillmentCenterName,InStockQuantity,ReservedQuantity,ReorderMinQuantity,AllowBackorder,AllowPreorder
TEST-001,Main Warehouse,100,10,20,true,false
TEST-002,East Coast DC,50,5,15,true,true
TEST-003,West Coast DC,75,0,25,false,false
```

**CSV Validation Requirements:**
- [ ] ProductSku must exist
- [ ] FulfillmentCenterName must exist
- [ ] Quantities must be numeric >= 0
- [ ] Boolean values must be true/false
- [ ] All required fields must be present

