# Test Case: TC-001 - Create New Inventory Record

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-001 |
| **Test Case Name** | Create New Inventory Record - CRUD Create Operation |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - CRUD |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory module's Create operation works correctly after migration to Generic CRUD services. Ensure that new inventory records can be created successfully with all required and optional fields.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. At least one product exists in the catalog
4. At least one fulfillment center is configured
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
- **Product SKU**: TEST-PRODUCT-001 (or any existing product SKU)
- **Fulfillment Center**: Main Warehouse (or any existing fulfillment center)
- **In Stock Quantity**: 100
- **Reserved Quantity**: 10
- **Reorder Min Quantity**: 20
- **Preorder Quantity**: 5
- **Backorder Quantity**: 0
- **Allow Backorder**: Yes
- **Allow Preorder**: Yes

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Catalog" → "Products" in the main menu | Products list page loads |
| 4 | Search for and open a product (TEST-PRODUCT-001) | Product details page opens |
| 5 | Navigate to the "Inventory" tab or section | Inventory management interface is displayed |
| 6 | Verify "Add Inventory" or "Create New" button is visible | Button is available and enabled |
| 7 | Click "Add Inventory" or "Create New" button | Inventory creation form/dialog opens |
| 8 | Verify form fields: Fulfillment Center dropdown | Dropdown shows available fulfillment centers |
| 9 | Select "Main Warehouse" from Fulfillment Center dropdown | Fulfillment center is selected |
| 10 | Enter "100" in "In Stock" or "Quantity" field | Value is accepted |
| 11 | Enter "10" in "Reserved" field (if available) | Value is accepted |
| 12 | Enter "20" in "Reorder Min Quantity" field | Value is accepted |
| 13 | Enter "5" in "Preorder Quantity" field (if available) | Value is accepted |
| 14 | Enable "Allow Backorder" checkbox (if available) | Checkbox is checked |
| 15 | Enable "Allow Preorder" checkbox (if available) | Checkbox is checked |
| 16 | Click "Save" or "Create" button | Save action is initiated |
| 17 | Observe success notification/message | "Inventory created successfully" message displayed |
| 18 | Verify the new inventory record appears in the list | New record is visible with correct details |
| 19 | Click on the newly created inventory record | Record details are displayed correctly |
| 20 | Verify all entered values are saved correctly | All fields match the entered data |

## Expected Results

### Visual Elements
- **Form UI**: Clear, well-organized inventory creation form
- **Field Labels**: All fields properly labeled and intuitive
- **Validation Messages**: Clear validation messages for incorrect input
- **Success Notification**: Visible success message after creation

### Functional Behavior
- Inventory record is created successfully using IInventoryService
- All entered data is persisted to the database
- Record is immediately visible in the inventory list
- Record can be opened and viewed with correct data
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- Product SKU is correctly linked
- Fulfillment center is correctly associated
- All quantity fields are saved with correct values
- Boolean flags (Allow Backorder, Allow Preorder) are saved correctly
- Created timestamp is recorded
- Created by user is recorded

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Inventory creation form
- [ ] Filled form with test data
- [ ] Success notification
- [ ] Created inventory record in list
- [ ] Record details view

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService, InventoryServiceImpl (migrated to Generic CRUD)

**Migration Impact**: This test verifies the Create operation of the Generic CRUD service implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Inventory record created without errors
- [ ] All mandatory fields are properly validated
- [ ] Optional fields can be left blank
- [ ] Success message is displayed
- [ ] Record appears in inventory list immediately
- [ ] Record details are accurate and complete
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-002: View/Read Inventory Details (verify created record can be read)
- TC-003: Update Inventory Information (update the created record)
- TC-004: Delete Inventory Record (delete the created record)
- TC-005: Search Inventory by Product SKU (search for created record)
- TC-014: Inventory Validation Rules (validation during creation)

## Rollback Actions
If test fails or leaves test data:
1. Manually delete the created inventory record
2. Document the record ID for cleanup
3. Verify deletion was successful

