# Test Cases for VCST-3854: [Documentation] Catalog export/import through CSV file

## User Story Details
- **Jira Key**: VCST-3854
- **Summary**: [Documentation] Catalog export/import through CSV file
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/2/2025

## Description
Needs documentation update for catalog export and import via CSV file (steps, mandatory fields, partial updates, etc.).

---

## Test Cases

### Test Case 1: Basic Catalog Export to CSV
**Objective**: Verify the basic catalog export functionality to CSV file

**Preconditions**:
- User has admin access to Virto Commerce Platform
- At least one catalog exists in the system
- Reference: [Catalog Management](https://docs.virtocommerce.org/user-guide/catalog-management/)

**Test Steps**:
1. Navigate to Catalog module
2. Select an existing catalog
3. Click "Export" button
4. Choose CSV format
5. Select default export settings
6. Initiate export
7. Download the exported file

**Expected Results**:
- Export process completes successfully
- CSV file is generated with correct formatting
- File contains all catalog items with mandatory fields

**Test Data**: Existing catalog with multiple products

**Priority**: High

---

### Test Case 2: Catalog Import with Valid CSV File
**Objective**: Verify the import functionality with a properly formatted CSV file

**Preconditions**:
- Valid CSV file with catalog data
- User has import permissions
- Reference: [Import & Export](https://docs.virtocommerce.org/user-guide/catalog-management/import-export/)

**Test Steps**:
1. Navigate to Catalog module
2. Select "Import" option
3. Choose CSV file for import
4. Upload prepared CSV file
5. Verify preview data
6. Confirm import

**Expected Results**:
- Import process completes successfully
- All items are created/updated in the catalog
- System shows success message

**Test Data**: Valid CSV file with test catalog data

**Priority**: High

---

### Test Case 3: Partial Catalog Update via CSV
**Objective**: Verify partial update functionality for existing catalog items

**Preconditions**:
- Existing catalog with products
- CSV file containing partial updates
- Reference: [Catalog Items Management](https://docs.virtocommerce.org/user-guide/catalog-management/managing-products/)

**Test Steps**:
1. Prepare CSV file with partial updates
2. Navigate to Import function
3. Select "Update existing items" option
4. Upload CSV file
5. Confirm partial update
6. Verify updated fields

**Expected Results**:
- Only specified fields are updated
- Existing data remains unchanged for non-specified fields
- System shows update confirmation

**Priority**: Medium

---

### Test Case 4: Invalid CSV Format Import
**Objective**: Verify system behavior with incorrectly formatted CSV file

**Preconditions**:
- Incorrectly formatted CSV file
- User has import permissions

**Test Steps**:
1. Create CSV file with invalid format
2. Attempt to import file
3. Observe system response
4. Check error messages
5. Verify no data is imported

**Expected Results**:
- System rejects invalid file
- Clear error message displayed
- No data changes in catalog
- Import validation log available

**Priority**: Medium

---

### Test Case 5: Large Catalog Export
**Objective**: Verify export functionality with large data sets

**Preconditions**:
- Catalog with 10,000+ items
- Sufficient system resources

**Test Steps**:
1. Select large catalog
2. Initiate export process
3. Monitor export progress
4. Download resulting file
5. Verify file integrity

**Expected Results**:
- Export completes without timeout
- All items exported correctly
- File size handles large data set
- Progress indicator shows status

**Priority**: High

---

### Test Case 6: CSV Export with Custom Fields
**Objective**: Verify export functionality with custom field selection

**Preconditions**:
- Catalog with custom attributes
- Reference: [Custom Fields Configuration](https://docs.virtocommerce.org/user-guide/catalog-management/custom-fields/)

**Test Steps**:
1. Navigate to export settings
2. Select specific fields for export
3. Include custom attributes
4. Execute export
5. Verify exported file

**Expected Results**:
- Only selected fields are exported
- Custom fields are correctly included
- CSV format maintains integrity

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Import with Missing Mandatory Fields
**Objective**: Verify system handling of CSV import with missing required fields

**Preconditions**:
- CSV file with missing mandatory fields
- Documentation of required fields

**Test Steps**:
1. Create CSV file omitting mandatory fields
2. Attempt import
3. Check validation response
4. Verify error handling
5. Check system state

**Expected Results**:
- Import rejected with clear error message
- System maintains data integrity
- Detailed error log provided
- No partial imports performed

**Priority**: High

---

## Notes
- All tests should be performed in a test environment first
- Document any system-specific limitations found during testing
- Verify performance impact for large data sets
- Cross-reference with API documentation for consistency