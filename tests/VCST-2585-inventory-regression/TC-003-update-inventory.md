# Test Case: TC-003 - Update Inventory Information

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-003 |
| **Test Case Name** | Update Inventory Information - CRUD Update Operation |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - CRUD |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory module's Update operation works correctly after migration to Generic CRUD services. Ensure that existing inventory records can be modified successfully and changes are persisted accurately.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. At least one inventory record exists in the system
4. Product with inventory is available in the catalog
5. Note current inventory values before test for comparison
6. Test environment: https://vcst-qa.govirto.com/
7. Credentials: admin / Password3

## Test Data

### Initial Values (Before Update)
- **Product SKU**: TEST-PRODUCT-001
- **Fulfillment Center**: Main Warehouse
- **In Stock Quantity**: 100
- **Reserved Quantity**: 10
- **Reorder Min Quantity**: 20

### Updated Values (To Apply)
- **In Stock Quantity**: 150 (change from 100)
- **Reserved Quantity**: 15 (change from 10)
- **Reorder Min Quantity**: 25 (change from 20)
- **Allow Backorder**: Toggle current state
- **Allow Preorder**: Toggle current state

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Catalog" → "Products" | Products list page loads |
| 4 | Search for and open product (TEST-PRODUCT-001) | Product details page opens |
| 5 | Navigate to "Inventory" tab/section | Inventory section is displayed |
| 6 | Verify existing inventory record is displayed | Record shows current values |
| 7 | **Document current values** (screenshot/note) | Values recorded for comparison |
| 8 | Click "Edit" button or click on inventory record | Inventory edit form opens |
| 9 | Verify form is pre-populated with current values | All fields show existing data |
| 10 | Verify Fulfillment Center field (should be read-only) | Field is disabled or read-only |
| 11 | Change "In Stock" quantity from 100 to 150 | New value is accepted |
| 12 | Change "Reserved" quantity from 10 to 15 | New value is accepted |
| 13 | Change "Reorder Min Quantity" from 20 to 25 | New value is accepted |
| 14 | Toggle "Allow Backorder" checkbox | Checkbox state changes |
| 15 | Toggle "Allow Preorder" checkbox | Checkbox state changes |
| 16 | Click "Save" or "Update" button | Save action is initiated |
| 17 | Observe success notification/message | "Inventory updated successfully" message displayed |
| 18 | Verify the record in list shows updated values | In Stock shows 150, other fields updated |
| 19 | Click on the inventory record to view details | Detail view opens |
| 20 | Verify all updated values are persisted correctly | All fields show new values |
| 21 | Verify "Modified Date" timestamp is updated | Timestamp reflects current date/time |
| 22 | Navigate away from product and return | Updated values persist after navigation |
| 23 | Refresh the page (F5) | Updated values remain after page refresh |

## Expected Results

### Visual Elements
- **Edit Form**: Clear, well-organized inventory edit form
- **Pre-population**: Form fields filled with current values
- **Validation**: Inline validation for incorrect inputs
- **Success Notification**: Clear success message after update

### Functional Behavior
- Inventory record is updated successfully using IInventoryService
- All modified fields are persisted to database
- Changes are immediately visible in list and detail views
- Unmodified fields retain their original values
- Modified timestamp is updated automatically
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- Only specified fields are modified
- Product SKU association remains unchanged
- Fulfillment center association remains unchanged
- Quantity values are updated correctly
- Boolean flags are toggled correctly
- Modified timestamp is current
- Modified by user is recorded
- Audit trail is created (if applicable)

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Initial inventory values (before update)
- [ ] Edit form with current values
- [ ] Edit form with modified values
- [ ] Success notification
- [ ] Updated inventory in list view
- [ ] Updated inventory in detail view
- [ ] Modified timestamp updated

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService, InventoryServiceImpl (migrated to Generic CRUD - Update operation)

**Migration Impact**: This test verifies the Update operation of the Generic CRUD service implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Edit form opens without errors
- [ ] Form is pre-populated with current values
- [ ] Fulfillment Center field is read-only (cannot be changed)
- [ ] Quantity fields accept numeric input
- [ ] Validation works for invalid inputs
- [ ] Save operation completes successfully
- [ ] Success message is displayed
- [ ] Updated values are visible immediately
- [ ] Modified timestamp is updated
- [ ] Changes persist after navigation
- [ ] Changes persist after page refresh
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-001: Create New Inventory Record (create record to update)
- TC-002: View/Read Inventory Details (read before and after update)
- TC-004: Delete Inventory Record (cleanup after test)
- TC-013: Inventory Stock Level Updates (specific stock updates)
- TC-014: Inventory Validation Rules (validation during update)

## Additional Scenarios to Test

### Scenario 1: Update Only Single Field
- Change only "In Stock" quantity
- Verify other fields remain unchanged
- Verify update is saved correctly

### Scenario 2: Update to Zero Quantity
- Set "In Stock" to 0
- Verify status changes to "Out of Stock"
- Verify update is allowed

### Scenario 3: Update with Invalid Data
- Enter negative quantity (-10)
- Enter non-numeric value ("abc")
- Verify validation prevents save
- Verify error messages are clear

### Scenario 4: Concurrent Update Handling
- Open edit form in two browser tabs
- Update field in first tab and save
- Update different field in second tab and save
- Verify conflict handling or last-write-wins behavior

### Scenario 5: Update Reserved Quantity Greater Than In Stock
- Set Reserved = 200, In Stock = 150
- Verify validation behavior
- Verify business rules are enforced

## Rollback Actions
After test completion:
1. Restore original inventory values
2. Document any permanent changes made
3. Verify restoration was successful

