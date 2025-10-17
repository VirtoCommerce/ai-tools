# Test Case: TC-009 - Inventory Restore Functionality

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-009 |
| **Test Case Name** | Inventory Restore Functionality |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Integration - Backup/Restore |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that inventory data can be restored correctly from backup after migration to Generic CRUD services. Ensure that the restore process imports all inventory data completely, accurately, and maintains referential integrity.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/system administrator permissions
3. Valid inventory backup file exists (created in TC-008)
4. Backup file is accessible for restore operation
5. Database backup exists (safety measure before restore)
6. Test environment: https://vcst-qa.govirto.com/
7. Credentials: admin / Password3

## Test Data
**Backup File Information:**
- Backup file name: _____ (from TC-008)
- Backup file created: _____ (date/time)
- Record count in backup: _____ (from TC-008)
- Test products in backup: TEST-PRODUCT-001, TEST-PRODUCT-002, TEST-PRODUCT-003

**Pre-Restore State:**
- Current inventory record count: _____
- Action: Modify or delete some test records to verify restore

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | **Prepare for Restore** | |
| 4 | Navigate to Inventory module | Inventory page loads |
| 5 | Document current inventory state (record count) | Current state recorded: _____ records |
| 6 | Modify a test inventory record (change quantity) | Record modified as marker |
| 7 | Note the modified value for verification | Modified value recorded |
| 8 | Delete a test inventory record (optional) | Record deleted as marker |
| 9 | Document the deleted record ID/SKU | Deleted record noted |
| 10 | **Perform Restore** | |
| 11 | Navigate to "Settings" or "System" → "Backup" | Backup/Restore page loads |
| 12 | Locate "Restore" or "Import" section | Restore section is visible |
| 13 | Click "Restore" or "Import" button | Restore dialog/page opens |
| 14 | Select "Inventory" module for restore | Inventory module selected |
| 15 | Upload or select backup file from TC-008 | File selected successfully |
| 16 | Verify restore options (merge, replace, etc.) | Options are displayed |
| 17 | Select restore mode (typically "Replace" for test) | Mode selected |
| 18 | Review restore summary (if shown) | Summary shows correct file and record count |
| 19 | Confirm restore operation | Confirmation provided |
| 20 | Click "Start Restore" or "Import" button | Restore process initiated |
| 21 | Observe restore progress indicator | Progress shown (percentage or spinner) |
| 22 | Wait for restore to complete | "Restore completed successfully" message |
| 23 | Note restore completion time | Time recorded: _____ |
| 24 | **Verify Restore Results** | |
| 25 | Navigate to Inventory module | Inventory page loads |
| 26 | Count total inventory records | Count matches backup count |
| 27 | Search for TEST-PRODUCT-001 | Record is found |
| 28 | Verify TEST-PRODUCT-001 details match backup | Data matches original backup |
| 29 | Search for TEST-PRODUCT-002 | Record is found |
| 30 | Verify TEST-PRODUCT-002 details match backup | Data matches original backup |
| 31 | Check previously modified record | Original value is restored (not modified value) |
| 32 | Check previously deleted record | Record is restored (if in backup) |
| 33 | Verify fulfillment center associations | FCs are correctly linked |
| 34 | Verify product associations | Products are correctly linked |
| 35 | Check for any orphaned or duplicate records | No orphans or duplicates |
| 36 | Verify quantity values are correct | All quantities match backup |
| 37 | Verify boolean flags (backorder, preorder) | Flags match backup |
| 38 | Check timestamps (created date maintained) | Timestamps preserved from backup |
| 39 | Review system logs for errors | No errors in logs |
| 40 | Test search functionality on restored data | Search works correctly |

## Expected Results

### Functional Behavior
- Restore process initiates successfully
- Backup file is uploaded/loaded without errors
- Restore mode options are clear (merge, replace, etc.)
- All inventory records are imported
- Restore completes without errors
- Completion notification is displayed
- System is usable immediately after restore
- No data loss during restore process
- Restore operation is logged/auditable

### Data Integrity
- **Completeness**: All records from backup are restored
- **Accuracy**: Restored data exactly matches backup data
- **Consistency**: All relationships are maintained (product-inventory, FC-inventory)
- **No Duplicates**: No duplicate records created (if replace mode)
- **Referential Integrity**: Product and FC references are valid
- **Field Coverage**: All fields are restored (SKU, FC, quantities, flags, timestamps)
- **Test Verification**: Modified records are restored to backup state
- **Test Verification**: Deleted records are restored (if in backup)

### Post-Restore System State
- Total record count matches backup
- All test records are present and correct
- Search functionality works on restored data
- CRUD operations work on restored records
- No orphaned or broken relationships
- System performance is normal
- No errors in application logs

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Pre-restore state (modified/deleted records)
- [ ] Restore configuration screen
- [ ] Backup file selection
- [ ] Restore in progress
- [ ] Restore completion message
- [ ] Post-restore inventory list
- [ ] Restored test records details
- [ ] Record count verification

**Restore Details:**
- Backup File Used: _____________________
- Restore Mode: ______________________
- Records Restored: ___________________
- Restore Duration: ___________________
- Restore Date/Time: _________________

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: Restore/Import services using IInventoryService (migrated to Generic CRUD)

**Migration Impact**: This test verifies that restore functionality works correctly with the Generic CRUD implementation. The restore process must properly deserialize and import inventory data into the new service layer.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Restore process initiates without errors
- [ ] Backup file uploads/loads successfully
- [ ] Restore options are clear
- [ ] Progress indicator is shown
- [ ] Restore completes successfully
- [ ] Success message is displayed
- [ ] Record count matches backup
- [ ] All test records are restored
- [ ] Modified records reverted to backup state
- [ ] Deleted records are restored
- [ ] Data values match backup exactly
- [ ] Relationships are intact
- [ ] No duplicate records (if replace mode)
- [ ] No orphaned records
- [ ] Search works on restored data
- [ ] CRUD operations work on restored data
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-008: Inventory Backup Functionality (created backup file)
- TC-001: Create New Inventory Record (test CRUD after restore)
- TC-002: View/Read Inventory Details (verify restored data)
- TC-005: Search Inventory by Product SKU (test search after restore)

## Performance Considerations
- Restore start time: _____ seconds
- Restore duration: _____ minutes
- Records per second: _____ (total records / duration)
- Post-restore system response: _____ (normal/slow)

**Acceptable Performance:**
- Small dataset (< 100 records): < 30 seconds
- Medium dataset (100-1000 records): 1-3 minutes
- Large dataset (1000+ records): 3-10 minutes

## Data Verification Matrix

**Verify these specific records after restore:**

| Product SKU | FC | Expected In Stock | Expected Reserved | Found? | Data Correct? |
|-------------|-----|-------------------|-------------------|--------|---------------|
| TEST-PRODUCT-001 | Main Warehouse | 100 | 10 | ☐ | ☐ |
| TEST-PRODUCT-002 | East Coast DC | 50 | 5 | ☐ | ☐ |
| TEST-PRODUCT-003 | West Coast DC | 75 | 0 | ☐ | ☐ |

**Modified Record Verification:**
- Record SKU: _____________________
- Pre-restore (modified) value: _____
- Post-restore value: _____
- Matches backup? ☐ Yes ☐ No

**Deleted Record Verification:**
- Record SKU: _____________________
- Was deleted before restore: ☐
- Restored after restore: ☐
- Data correct: ☐

## Additional Scenarios

### Scenario 1: Merge Mode Restore (if supported)
- Have existing inventory records
- Restore backup in "merge" mode
- Verify existing records not deleted
- Verify backup records added
- Verify duplicates handled correctly

### Scenario 2: Selective Restore (if supported)
- Select specific fulfillment centers to restore
- Perform restore
- Verify only selected FCs are restored
- Verify other FCs remain unchanged

### Scenario 3: Restore to Different Environment
- Create backup in QA environment
- Restore to different QA/test environment
- Verify cross-environment restore works
- Verify product/FC IDs resolve correctly

### Scenario 4: Restore Old Backup
- Use backup created several days/weeks ago
- Perform restore
- Verify data is restored to that historical state
- Verify no compatibility issues with old format

### Scenario 5: Restore with Missing Products
- Delete a product from catalog
- Restore backup with inventory for that product
- Verify system behavior (skip/error/create?)
- Document the expected behavior

## Rollback Plan

**If restore fails or corrupts data:**
1. Stop using the system immediately
2. Restore database from pre-restore backup
3. Document the failure details
4. Review restore logs
5. Investigate root cause
6. Retry restore in isolated test environment

## Safety Considerations
- ⚠️ **Create database backup before restore test**
- Only restore in TEST/QA environment
- Do not restore to production during this test
- Verify you're in correct environment
- Have rollback plan ready
- Coordinate with DevOps/DBA if needed

