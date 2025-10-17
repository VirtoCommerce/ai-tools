# Test Case: TC-002 - View/Read Inventory Details

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-002 |
| **Test Case Name** | View/Read Inventory Details - CRUD Read Operation |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - CRUD |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory module's Read operation works correctly after migration to Generic CRUD services. Ensure that inventory record details can be viewed and retrieved accurately with all fields displayed properly.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. At least one inventory record exists in the system
4. Product with inventory is available in the catalog
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
- **Product SKU**: Existing product with inventory (e.g., TEST-PRODUCT-001)
- **Inventory Record ID**: Existing inventory record ID
- **Known Values**: Note the existing values for verification
  - In Stock Quantity: [Known value]
  - Reserved Quantity: [Known value]
  - Fulfillment Center: [Known value]

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Catalog" → "Products" | Products list page loads |
| 4 | Search for product with existing inventory | Product appears in search results |
| 5 | Click on the product to open details | Product details page opens |
| 6 | Navigate to "Inventory" tab/section | Inventory section is displayed |
| 7 | Verify inventory records list is displayed | List of inventory records is shown |
| 8 | Verify each record shows: Fulfillment Center name | Fulfillment center is displayed |
| 9 | Verify each record shows: In Stock quantity | Quantity value is displayed |
| 10 | Verify each record shows: Status indicators | Status (In Stock, Low Stock, Out of Stock) shown |
| 11 | Click on an inventory record to view details | Inventory detail view opens |
| 12 | Verify "Fulfillment Center" field displays correctly | Correct fulfillment center is shown |
| 13 | Verify "In Stock" quantity is displayed | Correct quantity value is shown |
| 14 | Verify "Reserved" quantity is displayed (if applicable) | Reserved quantity is shown |
| 15 | Verify "Reorder Min Quantity" is displayed | Reorder value is shown |
| 16 | Verify "Preorder Quantity" is displayed (if applicable) | Preorder quantity is shown |
| 17 | Verify "Backorder Quantity" is displayed (if applicable) | Backorder quantity is shown |
| 18 | Verify "Allow Backorder" flag is displayed | Checkbox or flag state is shown |
| 19 | Verify "Allow Preorder" flag is displayed | Checkbox or flag state is shown |
| 20 | Verify "Created Date" and "Modified Date" are shown | Timestamps are displayed correctly |
| 21 | Close the detail view and reopen same record | Same data is displayed consistently |
| 22 | Navigate to different product and return | Inventory data persists and loads correctly |

## Expected Results

### Visual Elements
- **List View**: Clear, organized list of inventory records per product
- **Detail View**: Comprehensive display of all inventory fields
- **Formatting**: Proper formatting for numbers, dates, and flags
- **Layout**: Responsive and user-friendly layout
- **Loading States**: Smooth loading without errors

### Functional Behavior
- Inventory records are retrieved successfully using IInventoryService
- All fields are populated with correct data from database
- Data loads quickly without performance issues
- Multiple inventory records (different fulfillment centers) are displayed
- Detail view can be opened and closed without issues
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- Product SKU association is correct
- Fulfillment center information is accurate
- All quantity values match database records
- Boolean flags display correct state
- Timestamps are formatted and displayed correctly
- Calculated fields (e.g., Available = InStock - Reserved) are accurate

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Inventory list view
- [ ] Inventory detail view
- [ ] Multiple fulfillment centers display
- [ ] All field values visible
- [ ] Date and status fields

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService (migrated to Generic CRUD - Read operation)

**Migration Impact**: This test verifies the Read/Get operation of the Generic CRUD service implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Inventory list loads without errors
- [ ] All inventory records for product are displayed
- [ ] Detail view opens successfully
- [ ] All fields are populated with data
- [ ] Data matches expected values from database
- [ ] Fulfillment center information is correct
- [ ] Quantity fields display numeric values correctly
- [ ] Boolean flags display correct state
- [ ] Timestamps are formatted properly
- [ ] No console errors
- [ ] No server errors in logs
- [ ] Performance is acceptable (loads within 2 seconds)

## Related Test Cases
- TC-001: Create New Inventory Record (create before reading)
- TC-003: Update Inventory Information (read before and after update)
- TC-005: Search Inventory by Product SKU (search then read results)
- TC-006: Search Inventory by Fulfillment Center (search then read results)

## Additional Scenarios to Test

### Scenario 1: View Inventory with Multiple Fulfillment Centers
- Product has inventory in 3+ fulfillment centers
- Verify all records are displayed
- Verify each record shows correct fulfillment center

### Scenario 2: View Inventory with Zero Stock
- Product has 0 in stock quantity
- Verify display shows "Out of Stock" or appropriate indicator
- Verify all other fields still display correctly

### Scenario 3: View Inventory with Reserved Quantities
- Inventory has reserved quantities
- Verify available quantity calculation is correct
- Verify reserved quantity is displayed separately

### Scenario 4: Read-Only Access
- User with read-only permissions views inventory
- Verify data is displayed
- Verify edit/delete buttons are hidden or disabled

