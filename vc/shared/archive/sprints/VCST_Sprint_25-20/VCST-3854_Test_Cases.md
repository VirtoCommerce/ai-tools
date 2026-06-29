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

### Test Case 1: Verify Documentation for Complete Catalog Export Process
**Objective**: Validate that the documentation accurately describes the complete catalog export process through CSV file and all steps are functional

**Preconditions**:
- Virto Commerce platform is installed and accessible (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has administrator privileges with catalog management permissions
- At least one catalog with products exists in the system (https://docs.virtocommerce.org/products/catalog/)
- CSV export module is installed and configured

**Test Steps**:
1. Navigate to the Catalog module as described in documentation
2. Select the catalog to export following documented navigation path
3. Click on the Export button/option as specified in documentation
4. Select CSV as the export format according to documented steps
5. Configure export settings (if any) as per documentation guidance
6. Initiate the export process following documented procedure
7. Download the generated CSV file from the location specified in documentation
8. Open and verify the CSV file structure matches documented format

**Expected Results**:
- All navigation steps in documentation lead to correct UI elements
- Export button/option is available and functional as documented
- CSV format option is available and can be selected
- Export completes successfully without errors
- Downloaded CSV file contains all expected columns as per documentation (Product ID, SKU, Name, Category, Price, etc.)
- CSV file structure matches the documented schema/format
- All mandatory fields specified in documentation are present in exported CSV

**Test Data**: 
- Sample catalog with minimum 10 products across different categories
- Products with various attributes (physical, digital, configurable)

**Priority**: High

---

### Test Case 2: Verify Documentation for Complete Catalog Import Process with Valid CSV
**Objective**: Validate that the documentation accurately describes the catalog import process and successfully imports products from a properly formatted CSV file

**Preconditions**:
- Virto Commerce platform is installed and accessible
- User has administrator privileges with catalog management permissions
- Valid CSV file prepared according to documented format and mandatory fields (https://docs.virtocommerce.org/products/catalog/)
- CSV file contains all mandatory fields as specified in documentation (SKU, Name, CategoryPath, etc.)
- Target catalog exists in the system

**Test Steps**:
1. Navigate to the Catalog module following documented path
2. Locate and click Import option as described in documentation
3. Select CSV as import format according to documented steps
4. Upload the prepared CSV file using the method described in documentation
5. Map CSV columns to system fields as per documentation guidance (if manual mapping required)
6. Review import preview/summary if mentioned in documentation
7. Execute the import process following documented procedure
8. Verify import completion and check status as documented
9. Navigate to catalog and verify imported products appear correctly

**Expected Results**:
- Import option is accessible from the location specified in documentation
- CSV file upload mechanism works as documented
- All mandatory fields listed in documentation are correctly processed
- Import process completes without errors for valid CSV
- Success message displays as described in documentation
- All products from CSV file are imported with correct data
- Product attributes match the values in CSV file
- No data loss or corruption occurs during import

**Test Data**: 
- Valid CSV file with 20 products containing:
  - All mandatory fields (SKU, Name, CategoryPath, Price)
  - Various product types
  - Different attribute combinations

**Priority**: High

---

### Test Case 3: Verify Documentation for Partial Product Update via CSV Import
**Objective**: Validate that documentation correctly describes the partial update functionality and successfully updates existing products without overwriting unchanged fields

**Preconditions**:
- Virto Commerce platform is installed with existing products
- User has administrator privileges
- Existing catalog with at least 10 products already imported
- CSV file prepared with partial data (only fields to be updated) following documented format
- Documentation specifies how partial updates should be handled

**Test Steps**:
1. Export existing catalog to CSV to capture current state
2. Create a new CSV file with only SKU and fields to update (e.g., Price, Description) as per documentation guidance
3. Navigate to Import function following documented steps
4. Upload the partial update CSV file
5. Verify documentation mentions update/merge mode and select appropriate option
6. Execute import process as documented
7. Verify that only specified fields are updated
8. Confirm unchanged fields retain original values
9. Check documentation for any warnings or notes about partial updates

**Expected Results**:
- Documentation clearly explains partial update capability
- Import process recognizes existing products by SKU (or documented identifier)
- Only fields present in CSV are updated as documented
- Fields not included in CSV remain unchanged
- No new duplicate products are created
- Update mode/merge mode (if exists) works as documented
- Audit logs reflect the partial updates (if mentioned in documentation)

**Test Data**: 
- CSV file with 10 SKUs and only 2-3 fields to update:
  - SKU (identifier)
  - Price (new value)
  - Description (new value)

**Priority**: High

---

### Test Case 4: Verify Documentation for Mandatory Fields Validation and Error Handling
**Objective**: Validate that documentation accurately lists all mandatory fields and describes error handling when mandatory fields are missing or invalid

**Preconditions**:
- Virto Commerce platform is installed and accessible
- User has administrator privileges with catalog management permissions
- Documentation lists all mandatory fields for CSV import
- Multiple CSV files prepared with various missing or invalid mandatory fields

**Test Steps**:
1. Review documentation for complete list of mandatory fields
2. Create CSV file missing one mandatory field (e.g., SKU) as identified in documentation
3. Attempt to import the CSV file following documented steps
4. Observe and document the error message displayed
5. Create CSV file with invalid data format for mandatory field (e.g., invalid price format)
6. Attempt to import and observe error handling
7. Create CSV file with empty values in mandatory fields
8. Attempt import and verify error messages match documentation
9. Verify documentation describes each error scenario and resolution

**Expected Results**:
- Documentation clearly lists all mandatory fields with descriptions
- Import process validates mandatory fields before processing as documented
- Appropriate error messages display for missing mandatory fields
- Error messages match those described in documentation
- Documentation provides guidance on resolving validation errors
- Invalid data formats in mandatory fields are rejected with clear messages
- Import process fails gracefully without partial imports (unless documented otherwise)
- Error logs/reports are generated as per documentation

**Test Data**: 
Prepare multiple CSV files:
- CSV missing SKU field
- CSV missing Name field
- CSV with invalid Price format (text instead of number)
- CSV with empty mandatory fields
- CSV with all mandatory fields present (control test)

**Priority**: High

---

### Test Case 5: Verify Documentation Accuracy for CSV File Format, Structure, and Special Characters Handling
**Objective**: Validate that documentation correctly describes CSV file format specifications, column structure, delimiters, encoding, and handling of special characters

**Preconditions**:
- Virto Commerce platform is installed and accessible
- User has administrator privileges
- Documentation specifies CSV format requirements (delimiter, encoding, quote characters)
- Multiple CSV files prepared with different formats and special characters

**Test Steps**:
1. Review documentation for CSV format specifications (delimiter, encoding, headers)
2. Verify documentation specifies character encoding (UTF-8, UTF-16, etc.)
3. Create CSV file using documented delimiter (comma, semicolon, tab)
4. Create CSV file with special characters in product names (quotes, commas, newlines, unicode characters)
5. Import CSV files following documented process
6. Verify special characters are handled correctly as documented
7. Test with different encodings if multiple are supported per documentation
8. Verify column header names match exactly as specified in documentation
9. Test with extra columns not in documentation to verify handling

**Expected Results**:
- Documentation specifies exact CSV format requirements (RFC 4180 or custom)
- Character encoding is clearly documented (UTF-8 recommended)
- Delimiter character is specified (typically comma)
- Column headers are listed with exact spelling and case sensitivity
- Special characters (quotes, commas, line breaks) handling is documented
- Multi-line field support is documented if available
- Unicode character support is confirmed and documented
- Import handles special characters without data corruption
- Extra columns are either ignored or cause documented behavior
- Sample CSV file template is provided or clearly documented

**Test Data**: 
Multiple CSV files:
- Standard format with documented delimiter
- UTF-8 encoded file with international characters (é, ñ, 中文, etc.)
- Products with special characters: "Product "Special" Name", "Price: $99.99"
- Multi-line descriptions (if supported)
- CSV with extra undocumented columns

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Covered in Above Test Cases:
- **Edge Case**: Partial updates (Test Case 3)
- **Negative Test**: Missing mandatory fields (Test Case 4)
- **Negative Test**: Invalid data formats (Test Case 4)
- **Edge Case**: Special characters and encoding (Test Case 5)
- **Edge Case**: Extra columns handling (Test Case 5)

---

## Notes
- Verify that documentation includes troubleshooting section for common import/export issues
- Check if documentation provides sample CSV templates or downloadable examples
- Ensure documentation specifies any file size limitations for CSV imports
- Confirm documentation mentions performance considerations for large CSV files
- Validate that documentation includes information about batch processing or chunking for large imports
- Check if documentation covers rollback procedures in case of import failures
- Verify documentation mentions any dependencies on specific modules or extensions
- Ensure screenshots or visual guides in documentation match current UI (if applicable)
- Cross-reference with https://docs.virtocommerce.org/products/catalog/ for consistency
- Consider creating additional test cases if documentation covers advanced features like:
  - Category hierarchy import
  - Product associations/relationships
  - SEO metadata import
  - Image URL imports
  - Inventory level imports