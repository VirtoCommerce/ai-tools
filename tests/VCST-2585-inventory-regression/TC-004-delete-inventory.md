# Test Case: TC-004 - Delete Inventory Record

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-004 |
| **Test Case Name** | Delete Inventory Record - CRUD Delete Operation |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - CRUD |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory module's Delete operation works correctly after migration to Generic CRUD services. Ensure that inventory records can be deleted successfully with proper confirmation and no data integrity issues.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Test inventory record exists (can be created specifically for deletion test)
4. Product with inventory is available in the catalog
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3
7. **Important**: Use test data that can be safely deleted

## Test Data
- **Product SKU**: TEST-PRODUCT-DELETE-001 (test product)
- **Fulfillment Center**: Test Warehouse
- **In Stock Quantity**: 50
- **Note**: Create this record at beginning of test or use existing test record

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | **Setup**: Create test inventory record if needed | Test record exists for deletion |
| 4 | Navigate to "Catalog" → "Products" | Products list page loads |
| 5 | Search for and open product (TEST-PRODUCT-DELETE-001) | Product details page opens |
| 6 | Navigate to "Inventory" tab/section | Inventory section is displayed |
| 7 | Verify test inventory record is displayed in list | Test record is visible |
| 8 | **Document record details** (screenshot/note) | Record details noted for verification |
| 9 | Locate "Delete" button or action (trash icon, menu) | Delete action is available |
| 10 | Click "Delete" button/icon | Delete confirmation dialog appears |
| 11 | Verify confirmation dialog contains warning message | Warning about permanent deletion is shown |
| 12 | Verify confirmation shows inventory details | Record details displayed in confirmation |
| 13 | Click "Cancel" button in confirmation dialog | Dialog closes, record is NOT deleted |
| 14 | Verify record still exists in list | Record is still visible |
| 15 | Click "Delete" button/icon again | Delete confirmation dialog appears again |
| 16 | Click "Confirm" or "Yes" or "Delete" button | Deletion is initiated |
| 17 | Observe success notification/message | "Inventory deleted successfully" message displayed |
| 18 | Verify record is removed from inventory list | Record is no longer visible |
| 19 | Refresh the page (F5) | Page reloads |
| 20 | Verify record is still not present after refresh | Deletion is permanent |
| 21 | Navigate away and return to product | Return to same product page |
| 22 | Verify deleted record does not reappear | Deletion persisted in database |
| 23 | Check product details page | Product still exists (only inventory deleted) |
| 24 | Verify product is not deleted (only inventory record) | Product remains in catalog |

## Expected Results

### Visual Elements
- **Delete Button**: Clear delete action available (button or icon)
- **Confirmation Dialog**: Modal dialog with warning message
- **Warning Message**: Clear text about permanent deletion
- **Confirmation Buttons**: "Cancel" and "Confirm/Delete" buttons
- **Success Notification**: Visible success message after deletion

### Functional Behavior
- Inventory record is deleted successfully using IInventoryService
- Deletion requires explicit confirmation (not immediate)
- Cancel option prevents deletion
- Record is immediately removed from UI after deletion
- Deletion is permanent (persisted to database)
- Product itself is not affected by inventory deletion
- No orphaned data remains in database
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- Only the specific inventory record is deleted
- Product record remains intact
- Other inventory records (different fulfillment centers) are not affected
- Related data referential integrity is maintained
- Deletion audit trail is created (if applicable)
- No cascade deletion of unrelated data

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Inventory record before deletion
- [ ] Delete button/action location
- [ ] Deletion confirmation dialog
- [ ] Confirmation warning message
- [ ] Success notification
- [ ] Inventory list after deletion (record removed)
- [ ] Page after refresh (record still deleted)

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService, InventoryServiceImpl (migrated to Generic CRUD - Delete operation)

**Migration Impact**: This test verifies the Delete operation of the Generic CRUD service implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Delete action is available and accessible
- [ ] Confirmation dialog appears before deletion
- [ ] Warning message is clear and informative
- [ ] Cancel button prevents deletion
- [ ] Confirm button executes deletion
- [ ] Success message is displayed after deletion
- [ ] Record is removed from list immediately
- [ ] Deletion persists after page refresh
- [ ] Deletion persists after navigation
- [ ] Product is not deleted (only inventory record)
- [ ] Other inventory records are not affected
- [ ] No console errors
- [ ] No server errors in logs
- [ ] No orphaned data in database

## Related Test Cases
- TC-001: Create New Inventory Record (create record to delete)
- TC-002: View/Read Inventory Details (verify record before deletion)
- TC-005: Search Inventory by Product SKU (verify deleted record doesn't appear in search)
- TC-012: Bulk Inventory Operations (bulk delete operations)

## Additional Scenarios to Test

### Scenario 1: Delete with Confirmation Cancel
- Click delete button
- Click cancel in confirmation
- Verify record is NOT deleted
- Verify UI state returns to normal

### Scenario 2: Delete Last Inventory Record for Product
- Product has only one inventory record
- Delete that record
- Verify product still exists
- Verify inventory section shows "No inventory records"

### Scenario 3: Delete One of Multiple Records
- Product has inventory in 3 fulfillment centers
- Delete inventory for one fulfillment center
- Verify only that record is deleted
- Verify other two records remain intact

### Scenario 4: Attempt Delete with Pending Orders
- Inventory record has reserved quantities (active orders)
- Attempt to delete
- Verify system behavior (allow with warning, or prevent with message)
- Document the business rule

### Scenario 5: Delete Permission Check
- User with read-only permissions
- Verify delete button is hidden or disabled
- Attempt deletion should be prevented

### Scenario 6: Delete Recently Modified Record
- Update an inventory record
- Immediately delete it
- Verify deletion works correctly
- Verify no conflicts

## Safety Considerations

**⚠️ IMPORTANT - Test Data Safety**
- Only delete test records created specifically for testing
- Do NOT delete production or critical inventory data
- Verify you are in TEST environment before deletion
- Document all deletions performed
- Have database backup available if needed

## Rollback Actions
If production data is accidentally deleted:
1. Stop testing immediately
2. Note the deleted record details
3. Restore from database backup (coordinate with DBA)
4. Document the incident
5. Review test data identification procedures

