# Test Case: TC-008 - Inventory Backup Functionality

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-008 |
| **Test Case Name** | Inventory Backup Functionality |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Integration - Backup/Restore |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that inventory data can be backed up correctly after migration to Generic CRUD services. Ensure that the backup process exports all inventory data completely and accurately, maintaining data integrity for future restore operations.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/system administrator permissions
3. Multiple inventory records exist in the system
4. Sufficient disk space for backup file
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
**Pre-Backup Inventory Count:**
- Total inventory records: _____ (document before test)
- Number of unique products: _____
- Number of fulfillment centers: _____
- Sample product SKUs to verify: TEST-PRODUCT-001, TEST-PRODUCT-002, TEST-PRODUCT-003

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | **Document current inventory state** | |
| 4 | Navigate to Inventory module | Inventory page loads |
| 5 | Count and note total number of inventory records | Total count recorded: _____ |
| 6 | Note details of 3-5 specific inventory records | Details documented for verification |
| 7 | **Perform Backup** | |
| 8 | Navigate to "Settings" or "System" in main menu | Settings page loads |
| 9 | Locate "Backup" or "Export/Import" section | Backup section is visible |
| 10 | Select "Inventory" module for backup | Inventory module selected |
| 11 | Verify backup options/settings are available | Options displayed (if any) |
| 12 | Configure backup settings (full backup) | Settings configured |
| 13 | Click "Start Backup" or "Export" button | Backup process initiated |
| 14 | Observe backup progress indicator | Progress shown (percentage or spinner) |
| 15 | Wait for backup to complete | "Backup completed successfully" message |
| 16 | Note backup completion time | Time recorded: _____ |
| 17 | **Verify Backup File** | |
| 18 | Verify backup file is generated | Backup file exists |
| 19 | Note backup file name and location | File details recorded |
| 20 | Verify backup file size is reasonable | File size > 0, appropriate for data volume |
| 21 | Download backup file (if applicable) | File downloaded successfully |
| 22 | Verify file format (ZIP, JSON, SQL, etc.) | Correct file format confirmed |
| 23 | Open/extract backup file | File opens without errors |
| 24 | **Inspect Backup Contents** | |
| 25 | Verify backup contains inventory data | Inventory data is present |
| 26 | Verify record count in backup matches system | Counts match |
| 27 | Search for specific test products in backup | Test products found in backup |
| 28 | Verify all key fields are present in backup | All fields exported: SKU, FC, quantities, etc. |
| 29 | Verify data format is readable/structured | Data is properly structured (JSON/XML/CSV) |
| 30 | Check for any error logs during backup | No errors in logs |

## Expected Results

### Functional Behavior
- Backup process initiates successfully
- All inventory records are exported
- Backup completes without errors
- Backup file is generated and accessible
- Backup includes all inventory fields and data
- Related data (products, FCs) is properly referenced
- Backup process doesn't lock or block system
- Users can continue working during backup (if non-blocking)
- Completion notification is displayed
- No data loss during backup process

### Data Integrity
- **Completeness**: All inventory records are included
- **Accuracy**: Data values in backup match source database
- **Consistency**: Relationships are maintained (product-inventory, FC-inventory)
- **Field Coverage**: All fields are exported (SKU, FC ID, quantities, flags, timestamps)
- **Test Verification**: Specific test records are verifiable in backup
- **No Corruption**: Backup file is not corrupted
- **Format Validity**: Backup file format is valid and parseable

### Backup File Characteristics
- File format: Documented and appropriate (e.g., .zip, .bak, .json)
- File size: Reasonable based on data volume
- File naming: Clear, includes timestamp or version
- File location: Accessible for download or restore
- File metadata: Includes backup date, module name, version

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots and files here:_
- [ ] Backup configuration screen
- [ ] Backup in progress
- [ ] Backup completion message
- [ ] Backup file details (name, size, location)
- [ ] Backup file contents sample
- [ ] Record count verification

**Backup File Details:**
- File Name: _____________________
- File Size: _____________________
- File Format: ___________________
- Record Count in Backup: _________
- Backup Date/Time: ______________

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: Backup services using IInventoryService (migrated to Generic CRUD)

**Migration Impact**: This test verifies that backup functionality works correctly with the Generic CRUD implementation. The backup process must properly serialize and export inventory data from the new service layer.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Backup process initiates without errors
- [ ] Progress indicator is shown
- [ ] Backup completes successfully
- [ ] Success message is displayed
- [ ] Backup file is created
- [ ] File size is appropriate
- [ ] File format is correct
- [ ] File can be opened/extracted
- [ ] All inventory records are in backup
- [ ] Record count matches system
- [ ] All fields are exported
- [ ] Test records are verifiable in backup
- [ ] No data corruption
- [ ] No console errors
- [ ] No server errors in logs
- [ ] Completion time is acceptable

## Related Test Cases
- TC-009: Inventory Restore Functionality (restore from this backup)
- TC-001: Create New Inventory Record (create records to backup)
- TC-003: Update Inventory Information (verify updated data in backup)

## Performance Considerations
- Backup start time: _____ seconds
- Backup duration: _____ minutes
- Records per second: _____ (total records / duration)
- File generation time: _____ seconds

**Acceptable Performance:**
- Small dataset (< 100 records): < 30 seconds
- Medium dataset (100-1000 records): 1-3 minutes
- Large dataset (1000+ records): 3-10 minutes

## Data Verification Sample

**Verify these specific records in backup:**

| Product SKU | FC | In Stock | Reserved | In Backup? | Data Matches? |
|-------------|-----|----------|----------|------------|---------------|
| TEST-PRODUCT-001 | Main Warehouse | 100 | 10 | ☐ | ☐ |
| TEST-PRODUCT-002 | East Coast DC | 50 | 5 | ☐ | ☐ |
| TEST-PRODUCT-003 | West Coast DC | 75 | 0 | ☐ | ☐ |

## Additional Scenarios

### Scenario 1: Incremental Backup (if supported)
- Perform full backup
- Add new inventory records
- Perform incremental backup
- Verify only new/changed records in incremental backup

### Scenario 2: Scheduled Backup (if supported)
- Configure scheduled backup
- Wait for scheduled time
- Verify backup runs automatically
- Verify backup file is created

### Scenario 3: Backup During Active Use
- Perform backup while users are actively managing inventory
- Verify backup completes without locking
- Verify backup contains consistent snapshot

### Scenario 4: Large Dataset Backup
- System with 5000+ inventory records
- Perform backup
- Verify performance
- Verify completeness

## Safety Considerations
- Store backup file securely
- Document backup file location
- Keep backup file for restore test (TC-009)
- Do not delete backup until restore test is complete

