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

### Test Case 1: Export Products with Color Attributes to CSV
**Objective**: Verify that products with Color data type attributes are successfully exported to CSV file with correct color values

**Preconditions**:
- User is logged in with Catalog Manager permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- Catalog module is installed and configured (https://docs.virtocommerce.org/products/catalog/)
- At least one product exists with a Color data type attribute defined (e.g., "Product Color" attribute)
- Product has color value assigned (e.g., #FF0000 for red, #00FF00 for green)
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)

**Test Steps**:
1. Navigate to Catalog > Products section (https://docs.virtocommerce.org/products/catalog/)
2. Select one or more products that have Color attributes assigned
3. Click on "Export" button and select CSV export option
4. Choose export settings and confirm the export
5. Download the generated CSV file
6. Open the CSV file in a text editor or spreadsheet application
7. Locate the column corresponding to the Color attribute
8. Verify the color values are present in the exported data

**Expected Results**:
- CSV export completes successfully without errors
- Color attribute column is present in the CSV file header
- Color values are exported in a valid format (HEX format: #RRGGBB)
- All products with color attributes have their color values correctly represented
- Empty color values are handled appropriately (blank or NULL)

**Test Data**: 
- Product 1: Name="Red T-Shirt", Color="#FF0000"
- Product 2: Name="Blue Jeans", Color="#0000FF"
- Product 3: Name="Green Cap", Color="#00FF00"

**Priority**: High

---

### Test Case 2: Import Products with Color Attributes from CSV
**Objective**: Verify that products with Color data type attributes can be successfully imported from a CSV file

**Preconditions**:
- User is logged in with Catalog Manager permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- Catalog module is installed and configured (https://docs.virtocommerce.org/products/catalog/)
- Color data type attribute is defined in the catalog schema
- CSV file is prepared with Color attribute column containing valid color values
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)

**Test Steps**:
1. Prepare a CSV file with product data including Color attribute column
2. Ensure Color values are in valid HEX format (#RRGGBB)
3. Navigate to Catalog > Products section
4. Click on "Import" button and select CSV import option
5. Upload the prepared CSV file
6. Map the Color column to the appropriate Color attribute field
7. Configure import settings and start the import process
8. Wait for import completion and review the import log
9. Navigate to the imported products
10. Verify that Color attributes are correctly assigned to products

**Expected Results**:
- CSV file is successfully validated and uploaded
- Import process completes without errors
- Color values are correctly parsed and stored
- Products display the correct color values in their attribute section
- Import log shows successful import of Color attributes
- Color picker/display in product details shows the correct color

**Test Data**:
```csv
SKU,Name,Product Color
TSH-001,Red T-Shirt,#FF0000
TSH-002,Blue T-Shirt,#0000FF
TSH-003,White T-Shirt,#FFFFFF
```

**Priority**: High

---

### Test Case 3: Update Existing Product Color Attributes via CSV Import
**Objective**: Verify that existing product color attributes can be updated through CSV import

**Preconditions**:
- User is logged in with Catalog Manager permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- Products with existing Color attributes already exist in the catalog
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)
- CSV file is prepared with updated color values for existing products

**Test Steps**:
1. Export existing products with Color attributes to CSV to get current values
2. Modify the Color values in the exported CSV file for specific products
3. Navigate to Catalog > Products section
4. Click on "Import" button and select CSV import option
5. Upload the modified CSV file
6. Select "Update existing products" option in import settings
7. Map columns appropriately including the Color attribute
8. Execute the import process
9. Review the import log for any warnings or errors
10. Navigate to the updated products and verify color changes

**Expected Results**:
- Import process successfully identifies existing products
- Color attributes are updated with new values from CSV
- Previous color values are replaced with new ones
- Import log confirms successful updates
- No duplicate products are created
- Products retain all other attribute values unchanged
- Color display in product details reflects the updated values

**Test Data**:
- Existing Product SKU: TSH-001, Old Color: #FF0000, New Color: #FF6B6B
- Existing Product SKU: TSH-002, Old Color: #0000FF, New Color: #4169E1

**Priority**: High

---

### Test Case 4: Handle Invalid Color Format in CSV Import
**Objective**: Verify that the system properly validates and handles invalid color format values during CSV import

**Preconditions**:
- User is logged in with Catalog Manager permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- Catalog module is installed and configured (https://docs.virtocommerce.org/products/catalog/)
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)
- CSV file is prepared with various invalid color format values

**Test Steps**:
1. Create a CSV file with products containing invalid Color values:
   - Missing # symbol (e.g., "FF0000")
   - Invalid HEX characters (e.g., "#GGHHII")
   - Incorrect length (e.g., "#FFF" or "#FFFF0000")
   - Text color names (e.g., "red", "blue")
   - Empty values
   - Special characters (e.g., "#FF-00-00")
2. Navigate to Catalog > Import section
3. Upload the CSV file with invalid color formats
4. Start the import process
5. Monitor the validation process
6. Review the import log and error messages

**Expected Results**:
- System validates color format before importing
- Clear error messages are displayed for invalid color formats
- Import log identifies specific rows and columns with invalid data
- Invalid rows are rejected or skipped based on import settings
- Valid rows (if any) are imported successfully
- Error messages specify the expected color format (HEX: #RRGGBB)
- No products are created/updated with invalid color values
- User is notified of validation failures

**Test Data**:
```csv
SKU,Name,Product Color
TSH-004,Invalid Color 1,FF0000
TSH-005,Invalid Color 2,#GGHHII
TSH-006,Invalid Color 3,red
TSH-007,Invalid Color 4,#FFF
TSH-008,Empty Color,
```

**Priority**: High

---

### Test Case 5: Export and Re-Import Color Attributes (Round-Trip Test)
**Objective**: Verify data integrity by exporting products with Color attributes and re-importing them without data loss

**Preconditions**:
- User is logged in with Catalog Manager permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- Multiple products exist with various Color attribute values
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)
- Test catalog with at least 10 products with different color values

**Test Steps**:
1. Document the current color values for all test products
2. Navigate to Catalog > Products section
3. Select all test products with Color attributes
4. Export products to CSV format
5. Save the exported CSV file
6. Delete the color attribute values from the original products (or create a backup)
7. Import the previously exported CSV file
8. Complete the import process
9. Compare the re-imported color values with the original documented values
10. Verify color display in product details and product listing

**Expected Results**:
- Export completes successfully with all color data
- CSV file contains accurate color values in HEX format
- Import process completes without errors or warnings
- All color values match exactly after re-import (byte-for-byte comparison)
- No data transformation or loss occurs during export/import cycle
- Color values maintain proper case (uppercase HEX values)
- Special color values (like #000000 black, #FFFFFF white) are preserved
- Import log confirms 100% successful import

**Test Data**: 
Products with diverse color values:
- Standard colors: #FF0000, #00FF00, #0000FF
- Edge colors: #000000, #FFFFFF
- Mid-tone colors: #808080, #C0C0C0
- Custom colors: #FF6B6B, #4ECDC4, #45B7D1

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Import CSV with Multiple Color Attributes per Product
**Objective**: Verify that products with multiple Color data type attributes (e.g., Primary Color, Secondary Color) are correctly handled during import

**Preconditions**:
- Multiple Color attributes are defined in the catalog schema (e.g., "Primary Color", "Secondary Color", "Accent Color")
- User is logged in with appropriate permissions (https://docs.virtocommerce.org/platform/user-guide/security/)
- CSV Export/Import module is installed (https://docs.virtocommerce.org/modules/catalog-csv-import/)

**Test Steps**:
1. Create a CSV file with multiple Color attribute columns
2. Add products with values for multiple color attributes
3. Navigate to Catalog > Import section
4. Upload the CSV file
5. Map each color column to its corresponding attribute
6. Execute the import process
7. Verify each product's multiple color attributes
8. Test export of these products to ensure all color attributes are included

**Expected Results**:
- All color attribute columns are correctly identified during mapping
- Import successfully assigns values to multiple color attributes per product
- Each color attribute maintains its distinct value
- Export includes all color attribute columns
- No color values are mixed or overwritten between different color attributes

**Test Data**:
```csv
SKU,Name,Primary Color,Secondary Color,Accent Color
TSH-009,Multicolor Shirt,#FF0000,#0000FF,#FFFF00
TSH-010,Two-Tone Pants,#000000,#FFFFFF,
```

**Priority**: Medium

---

## Notes
- Color values should be stored and handled in HEX format (#RRGGBB) as this is the standard web color format
- Consider testing with different CSV encoding formats (UTF-8, ASCII) to ensure compatibility
- Verify that the Color data type integrates properly with the product attributes system (https://docs.virtocommerce.org/products/catalog/)
- Test performance with large CSV files (1000+ products) containing color attributes
- Ensure color attribute export/import works correctly in both single product and bulk operations
- Validate that color picker UI controls (if any) in the admin interface properly display imported color values
- Consider testing color attribute behavior with product variations/variants if applicable
- Document any specific CSV column naming conventions required for Color attributes
- Dependencies: This feature depends on the core Catalog module and CSV Export/Import module being properly installed and configured