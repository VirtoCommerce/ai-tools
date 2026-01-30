# Test Cases for VCST-3949: Export and Import for virtual catalog should be hidden

## User Story Details
- **Jira Key**: VCST-3949
- **Summary**: Export and Import for virtual catalog should be hidden
- **Priority**: High
- **Status**: Done
- **Created**: 9/17/2025

## Description
Currently, the export of a virtual catalog generates an empty document, and the import action removes products from the physical catalog. To avoid incorrect behavior and data loss, the VirtoCommerce CSV import options for virtual catalogs should be hidden.

---

## Test Cases

### Test Case 1: Verify Export Option is Hidden for Virtual Catalog
**Objective**: Verify that the CSV export option is not visible when accessing a virtual catalog in the admin panel

**Preconditions**:
- User is logged into VirtoCommerce Platform Manager with appropriate permissions
- At least one virtual catalog exists in the system (refer to [Virto Commerce Catalog Documentation](https://docs.virtocommerce.org/platform/user-guide/catalogs/))
- User has catalog management permissions

**Test Steps**:
1. Navigate to Catalog module in the Platform Manager
2. Select an existing virtual catalog from the catalog list
3. Open the virtual catalog details page
4. Check the toolbar/action menu for export options
5. Verify that no CSV export button or option is available

**Expected Results**:
- Virtual catalog opens successfully
- No "Export" or "Export to CSV" button/option is visible in the toolbar or action menu
- UI does not provide any mechanism to trigger catalog export for virtual catalogs

**Test Data**: 
- Virtual catalog name: "Test Virtual Catalog"

**Priority**: High

---

### Test Case 2: Verify Import Option is Hidden for Virtual Catalog
**Objective**: Verify that the CSV import option is not visible when accessing a virtual catalog in the admin panel

**Preconditions**:
- User is logged into VirtoCommerce Platform Manager with appropriate permissions
- At least one virtual catalog exists in the system
- User has catalog management permissions

**Test Steps**:
1. Navigate to Catalog module in the Platform Manager
2. Select an existing virtual catalog from the catalog list
3. Open the virtual catalog details page
4. Check the toolbar/action menu for import options
5. Verify that no CSV import button or option is available
6. Check for any drag-and-drop import functionality

**Expected Results**:
- Virtual catalog opens successfully
- No "Import" or "Import from CSV" button/option is visible in the toolbar or action menu
- No drag-and-drop import area is available
- UI does not provide any mechanism to trigger catalog import for virtual catalogs

**Test Data**: 
- Virtual catalog name: "Test Virtual Catalog"

**Priority**: High

---

### Test Case 3: Verify Export and Import Options are Still Available for Physical Catalog
**Objective**: Verify that the CSV export and import options remain visible and functional for physical catalogs after the fix

**Preconditions**:
- User is logged into VirtoCommerce Platform Manager with appropriate permissions
- At least one physical catalog exists in the system with products
- User has catalog management permissions

**Test Steps**:
1. Navigate to Catalog module in the Platform Manager
2. Select an existing physical catalog from the catalog list
3. Open the physical catalog details page
4. Check the toolbar/action menu for export options
5. Verify that CSV export button/option is visible
6. Check the toolbar/action menu for import options
7. Verify that CSV import button/option is visible
8. (Optional) Trigger an export action to verify functionality

**Expected Results**:
- Physical catalog opens successfully
- "Export" or "Export to CSV" button/option is visible and clickable
- "Import" or "Import from CSV" button/option is visible and clickable
- Export functionality generates a valid CSV file with catalog data (if tested)
- The fix only affects virtual catalogs, not physical catalogs

**Test Data**: 
- Physical catalog name: "Default Physical Catalog"
- Expected products in export: At least 1 product

**Priority**: High

---

### Test Case 4: Verify Direct API Access for Virtual Catalog Export Returns Appropriate Response
**Objective**: Verify that attempting to export a virtual catalog via direct API call returns an appropriate error or blocked response

**Preconditions**:
- User has API access credentials
- At least one virtual catalog exists in the system
- API endpoint for catalog export is documented (refer to [Virto Commerce API Documentation](https://docs.virtocommerce.org/platform/developer-guide/))
- Virtual catalog ID is known

**Test Steps**:
1. Obtain the virtual catalog ID from the database or API
2. Construct an API request to export the virtual catalog (e.g., POST/GET to export endpoint)
3. Include proper authentication headers
4. Execute the API call
5. Review the HTTP response code and response body

**Expected Results**:
- API returns HTTP 400 (Bad Request), 403 (Forbidden), or similar error code
- Response body contains meaningful error message indicating export is not allowed for virtual catalogs
- OR: API returns HTTP 200 with an empty/null response indicating no export data available
- No data loss occurs in any related physical catalogs
- System logs appropriate warning/error message

**Test Data**: 
- Virtual catalog ID: [Specific test virtual catalog ID]
- API endpoint: `/api/catalog/export` (example)

**Priority**: Medium

---

### Test Case 5: Verify Direct API Access for Virtual Catalog Import is Blocked
**Objective**: Verify that attempting to import data into a virtual catalog via direct API call is properly blocked and does not affect physical catalogs

**Preconditions**:
- User has API access credentials
- At least one virtual catalog exists in the system
- At least one physical catalog with products exists in the system (to verify no data loss)
- API endpoint for catalog import is documented
- Valid CSV import file is prepared

**Test Steps**:
1. Note the current product count in the associated physical catalog
2. Obtain the virtual catalog ID from the database or API
3. Construct an API request to import into the virtual catalog with a valid CSV file
4. Include proper authentication headers
5. Execute the API call
6. Review the HTTP response code and response body
7. Verify the product count in the physical catalog remains unchanged
8. Verify no products were deleted from the physical catalog

**Expected Results**:
- API returns HTTP 400 (Bad Request), 403 (Forbidden), or similar error code
- Response body contains meaningful error message indicating import is not allowed for virtual catalogs
- No products are removed from any physical catalogs
- Product count in physical catalog remains unchanged
- System logs appropriate warning/error message
- No data corruption or data loss occurs

**Test Data**: 
- Virtual catalog ID: [Specific test virtual catalog ID]
- Physical catalog: "Default Physical Catalog" with 10 products
- CSV file: Valid import file with sample product data
- API endpoint: `/api/catalog/import` (example)

**Priority**: High

---

## Edge Cases and Negative Tests

### Additional Testing Notes:

**Edge Case Considerations**:
- Test with virtual catalogs that have different permission levels
- Test with users having different role assignments (Admin, Catalog Manager, Viewer)
- Verify behavior when switching between physical and virtual catalogs in the same session
- Test with newly created virtual catalogs vs. existing ones

**Regression Testing**:
- Verify that existing physical catalog export/import workflows are not affected
- Confirm that catalog synchronization features still work properly
- Validate that product links between physical and virtual catalogs remain intact

---

## Notes
- **Documentation Reference**: Virtual catalogs in Virto Commerce are catalog views that aggregate products from physical catalogs without storing actual product data
- **Related Functionality**: This fix prevents data loss that could occur when import operations on virtual catalogs inadvertently affect source physical catalogs
- **Browser Compatibility**: Test UI changes across supported browsers (Chrome, Firefox, Edge, Safari)
- **API Version**: Verify fix is applied to all supported API versions
- **Dependencies**: This test suite assumes the Catalog module is properly installed and configured
- **Performance Impact**: Verify that hiding these options does not introduce performance degradation
- **Localization**: If applicable, verify that any error messages are properly localized

---

## Test Execution Checklist
- [ ] All test cases executed in QA environment
- [ ] Test cases executed in Staging environment
- [ ] Regression tests passed
- [ ] API tests validated with Swagger/Postman
- [ ] Cross-browser testing completed (if UI changes exist)
- [ ] Documentation updated to reflect changes
- [ ] Security review completed (if API changes exist)