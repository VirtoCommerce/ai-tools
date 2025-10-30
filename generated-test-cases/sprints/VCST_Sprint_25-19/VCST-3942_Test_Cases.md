# Test Cases for VCST-3942: Add Support for Color Data Type in CSV Export/Import

## User Story Details
- **Jira Key**: VCST-3942
- **Summary**: Add Support for Color Data Type in CSV Export/Import
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/15/2025

## Description
Support Color data type in Catalog CSV Export/Import module.
As a Catalog Manager,
I want to be able to export and import product color attributes in CSV files using a Color data type,
So that product color information can be consistently managed, exchanged, and synchronized across catalogs.

---

## Test Cases

### Test Case 1: Export Products with Color Property
**Objective**: Verify that products with color properties can be correctly exported to CSV format

**Preconditions**:
- Admin user has access to Virto Commerce Platform ([Admin documentation](https://docs.virtocommerce.org/products/platform/user-guide/))
- Catalog with products containing color properties exists
- Color property is defined in [Property Dictionary](https://docs.virtocommerce.org/products/platform/user-guide/properties-dictionary/)

**Test Steps**:
1. Navigate to Catalog module
2. Select catalog containing products with color properties
3. Click "Export" button
4. Select CSV format and configure export settings
5. Start export process
6. Download exported CSV file

**Expected Results**:
- CSV file is generated successfully
- Color values are exported in correct format (HEX or RGB)
- All color properties are present in the exported file
- Column headers for color properties are properly labeled

**Test Data**: 
- Products with various color values (#FF0000, #00FF00, RGB(255,0,0))
- Multiple color properties per product

**Priority**: High

---

### Test Case 2: Import Products with Valid Color Values
**Objective**: Verify that CSV files containing valid color values can be imported successfully

**Preconditions**:
- Admin user has access to platform
- Valid CSV file with color properties prepared
- [Import configuration](https://docs.virtocommerce.org/products/platform/user-guide/catalog-import/) is set up

**Test Steps**:
1. Navigate to Catalog module
2. Select "Import" function
3. Upload prepared CSV file
4. Configure import settings
5. Execute import process
6. Verify imported products

**Expected Results**:
- Import process completes successfully
- Color values are correctly assigned to products
- No error messages displayed
- All products are updated with correct color information

**Test Data**: 
CSV file containing:
- HEX color values (#FFFFFF)
- RGB color values (RGB(255,255,255))
- Named colors (Red, Blue, Green)

**Priority**: High

---

### Test Case 3: Handle Invalid Color Format
**Objective**: Verify system behavior when importing invalid color formats

**Preconditions**:
- Admin user has access to platform
- CSV file with invalid color values prepared

**Test Steps**:
1. Prepare CSV file with invalid color formats
2. Attempt to import the file
3. Check system response
4. Verify error handling
5. Check import logs

**Expected Results**:
- System should identify invalid color formats
- Appropriate error messages should be displayed
- Invalid entries should be logged
- Valid entries in same file should still be processed
- Import process should not crash

**Test Data**: 
Invalid formats:
- Incorrect HEX (#GGGGGG)
- Invalid RGB values (RGB(256,300,0))
- Malformed syntax (#FFF, RGB(255))

**Priority**: Medium

---

### Test Case 4: Update Existing Color Properties
**Objective**: Verify that existing color properties can be updated through CSV import

**Preconditions**:
- Products with existing color properties
- CSV file with updated color values
- [Property update permissions](https://docs.virtocommerce.org/products/platform/user-guide/security/) configured

**Test Steps**:
1. Export existing products
2. Modify color values in CSV
3. Import modified CSV
4. Check updated products
5. Verify change history

**Expected Results**:
- Existing color values are updated
- Change history reflects modifications
- No duplicate properties created
- Original property structure maintained

**Priority**: Medium

---

### Test Case 5: Bulk Color Property Import
**Objective**: Verify system performance with large-scale color property imports

**Preconditions**:
- Large CSV file (1000+ products)
- System resources monitored
- [Bulk import settings](https://docs.virtocommerce.org/products/platform/user-guide/catalog-import/) configured

**Test Steps**:
1. Prepare large CSV file
2. Start bulk import
3. Monitor system performance
4. Check import progress
5. Verify completion status

**Expected Results**:
- System handles large import efficiently
- No timeout errors
- Progress indicator works correctly
- Memory usage remains stable
- All records processed correctly

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Missing Color Values
**Objective**: Verify handling of missing or null color values

**Test Steps**:
1. Import CSV with empty color fields
2. Import CSV with missing color columns
3. Check system response

**Expected Results**:
- System handles null values appropriately
- Default values applied if configured
- Clear error messages for required fields

**Priority**: Low

---

## Notes
- All color values should support both HEX and RGB formats
- Performance testing recommended for large catalogs
- Related to color property dictionary configuration
- Consider localization aspects for color names