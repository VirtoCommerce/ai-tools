# Test Case: TC-013 - Inventory Stock Level Updates

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-013 |
| **Test Case Name** | Inventory Stock Level Updates |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P2 - High |
| **Test Type** | Functional - Stock Management |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that stock level updates (In Stock, Reserved, Available calculations) work correctly after migration to Generic CRUD services. Ensure that stock management operations maintain data integrity and proper stock status transitions.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Test product with inventory exists
4. Test environment: https://vcst-qa.govirto.com/
5. Credentials: admin / Password3

## Test Data
**Test Product:**
- Product SKU: TEST-STOCK-MGMT-001
- Fulfillment Center: Main Warehouse
- Initial In Stock: 100
- Initial Reserved: 10
- Initial Available: 90 (calculated: InStock - Reserved)

## Test Steps

### Part 1: Increase Stock Level

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to product TEST-STOCK-MGMT-001 | Product page loads |
| 4 | Navigate to Inventory tab | Inventory section displayed |
| 5 | Note current values: In Stock = 100, Reserved = 10 | Values recorded |
| 6 | Calculate expected available: 100 - 10 = 90 | Expected available: 90 |
| 7 | Verify "Available" shows 90 (if displayed) | Available = 90 |
| 8 | Click "Edit" on Main Warehouse inventory | Edit form opens |
| 9 | Change "In Stock" from 100 to 150 | New value entered |
| 10 | Keep "Reserved" as 10 (unchanged) | Reserved stays 10 |
| 11 | Click "Save" | Update saved successfully |
| 12 | Verify "In Stock" shows 150 | In Stock updated to 150 |
| 13 | Verify "Reserved" shows 10 | Reserved unchanged |
| 14 | Verify "Available" shows 140 (150 - 10) | Available recalculated correctly |
| 15 | Verify status indicator shows "In Stock" | Status is "In Stock" |

### Part 2: Decrease Stock Level

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 16 | Click "Edit" on inventory record | Edit form opens |
| 17 | Change "In Stock" from 150 to 50 | New value entered |
| 18 | Keep "Reserved" as 10 | Reserved unchanged |
| 19 | Click "Save" | Update saved successfully |
| 20 | Verify "In Stock" shows 50 | In Stock updated to 50 |
| 21 | Verify "Reserved" shows 10 | Reserved unchanged |
| 22 | Verify "Available" shows 40 (50 - 10) | Available recalculated correctly |
| 23 | Verify status still shows "In Stock" (qty > 0) | Status is "In Stock" |

### Part 3: Set to Zero Stock (Out of Stock)

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 24 | Click "Edit" on inventory record | Edit form opens |
| 25 | Change "In Stock" from 50 to 0 | New value entered |
| 26 | Set "Reserved" to 0 | Reserved cleared |
| 27 | Click "Save" | Update saved successfully |
| 28 | Verify "In Stock" shows 0 | In Stock = 0 |
| 29 | Verify "Reserved" shows 0 | Reserved = 0 |
| 30 | Verify "Available" shows 0 | Available = 0 |
| 31 | Verify status shows "Out of Stock" | Status changed to "Out of Stock" |
| 32 | Verify "Out of Stock" indicator/badge is visible | Visual indicator shown |

### Part 4: Restore Stock (Back in Stock)

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 33 | Click "Edit" on inventory record | Edit form opens |
| 34 | Change "In Stock" from 0 to 75 | New value entered |
| 35 | Click "Save" | Update saved successfully |
| 36 | Verify "In Stock" shows 75 | In Stock = 75 |
| 37 | Verify "Available" shows 75 | Available = 75 |
| 38 | Verify status changes to "In Stock" | Status restored to "In Stock" |
| 39 | Verify "Out of Stock" indicator removed | No out of stock badge |

### Part 5: Update Reserved Quantity

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 40 | Current state: In Stock = 75, Reserved = 0 | State confirmed |
| 41 | Click "Edit" on inventory record | Edit form opens |
| 42 | Keep "In Stock" as 75 | In Stock unchanged |
| 43 | Change "Reserved" from 0 to 25 | Reserved increased |
| 44 | Click "Save" | Update saved successfully |
| 45 | Verify "In Stock" shows 75 | In Stock unchanged |
| 46 | Verify "Reserved" shows 25 | Reserved updated to 25 |
| 47 | Verify "Available" shows 50 (75 - 25) | Available recalculated correctly |

### Part 6: Reserved Greater Than In Stock (Edge Case)

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 48 | Click "Edit" on inventory record | Edit form opens |
| 49 | Keep "In Stock" as 75 | In Stock unchanged |
| 50 | Change "Reserved" from 25 to 100 (> In Stock) | Reserved > In Stock |
| 51 | Click "Save" | Save attempt |
| 52 | Observe system behavior | Either: saved with warning, validation error, or Available = negative |
| 53 | Document actual behavior | Behavior recorded |
| 54 | If saved, verify "Available" calculation | Available = 75 - 100 = -25 (or 0 if capped) |

### Part 7: Low Stock Scenario

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 55 | Reset inventory: In Stock = 100, Reserved = 0 | Reset complete |
| 56 | Note "Reorder Min Quantity" value (e.g., 20) | Reorder min = 20 |
| 57 | Update "In Stock" to 15 (below reorder min) | Stock below threshold |
| 58 | Click "Save" | Saved successfully |
| 59 | Verify "Low Stock" indicator appears (if feature exists) | Low stock warning shown |
| 60 | Verify stock status is "Low Stock" or similar | Status reflects low stock |

## Expected Results

### Functional Behavior
- Stock level updates are processed correctly
- In Stock quantity can be increased
- In Stock quantity can be decreased
- Zero stock triggers "Out of Stock" status
- Restocking updates status back to "In Stock"
- Reserved quantity can be updated independently
- Available quantity is calculated correctly (InStock - Reserved)
- Status indicators update based on stock levels
- Low stock warnings appear when below threshold
- Updates are saved immediately to database
- No errors during stock updates

### Calculations
- **Available Quantity**: Always calculated as InStock - Reserved
- **In Stock Status**: InStock > 0 → "In Stock"
- **Out of Stock Status**: InStock = 0 → "Out of Stock"
- **Low Stock**: InStock < ReorderMinQuantity → "Low Stock" (if feature exists)
- Calculations update in real-time after save

### Data Integrity
- Stock levels never become negative (validation)
- Reserved quantity is properly managed
- Status transitions are correct
- Timestamps updated on each change
- Audit trail created for changes (if feature exists)
- Stock calculations are consistent
- No stock discrepancies after updates

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Initial stock levels (100/10/90)
- [ ] Increased stock (150/10/140)
- [ ] Decreased stock (50/10/40)
- [ ] Out of stock (0/0/0) with status indicator
- [ ] Back in stock (75/0/75)
- [ ] Reserved quantity update (75/25/50)
- [ ] Reserved > InStock scenario
- [ ] Low stock warning (if applicable)

## Stock Level Tracking Table

| Step | Action | In Stock | Reserved | Available | Status | Correct? |
|------|--------|----------|----------|-----------|--------|----------|
| Initial | Starting state | 100 | 10 | 90 | In Stock | ☐ |
| 1 | Increase stock | 150 | 10 | 140 | In Stock | ☐ |
| 2 | Decrease stock | 50 | 10 | 40 | In Stock | ☐ |
| 3 | Zero stock | 0 | 0 | 0 | Out of Stock | ☐ |
| 4 | Restore stock | 75 | 0 | 75 | In Stock | ☐ |
| 5 | Add reserved | 75 | 25 | 50 | In Stock | ☐ |
| 6 | Reserved > Stock | 75 | 100 | ? | ? | ☐ |
| 7 | Low stock | 15 | 0 | 15 | Low Stock? | ☐ |

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService (migrated to Generic CRUD - stock management)

**Migration Impact**: Stock level calculations and status updates must work correctly with Generic CRUD implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Stock increase works correctly
- [ ] Stock decrease works correctly
- [ ] Zero stock triggers out of stock status
- [ ] Restocking updates status correctly
- [ ] Reserved quantity updates work
- [ ] Available is calculated correctly
- [ ] All calculations are accurate
- [ ] Status indicators update properly
- [ ] Low stock warning works (if applicable)
- [ ] Reserved > InStock behavior is documented
- [ ] No negative stock values
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-002: View/Read Inventory Details (view stock levels)
- TC-003: Update Inventory Information (update operations)
- TC-010: Product Indexing with Inventory Data (stock status in index)
- TC-014: Inventory Validation Rules (stock level validation)

## Additional Scenarios

### Scenario 1: Rapid Stock Updates
- Update stock level
- Immediately update again
- Verify both updates are saved
- Verify final value is correct

### Scenario 2: Stock Update During Active Order
- Product has active orders (reserved qty > 0)
- Update In Stock quantity
- Verify Reserved is not affected
- Verify Available recalculates correctly

### Scenario 3: Multiple Fulfillment Centers
- Product in 3 FCs: FC1 (100), FC2 (50), FC3 (0)
- Update FC1 stock to 200
- Verify FC1 updated, FC2 and FC3 unchanged
- Verify independent stock management per FC

### Scenario 4: Negative Stock Entry Attempt
- Try to enter -10 for In Stock
- Verify validation error
- Verify stock not updated to negative

### Scenario 5: Stock Update with Concurrent Users
- User A opens edit form
- User B updates same inventory
- User A saves their changes
- Verify conflict handling (last write wins, or error)

## Business Rules to Verify

**Stock Status Rules:**
- InStock > 0 → Status = "In Stock"
- InStock = 0 → Status = "Out of Stock"
- InStock < ReorderMinQuantity → Warning/Indicator

**Available Calculation:**
- Available = InStock - Reserved
- Available can be negative if Reserved > InStock (document actual behavior)
- Available updates immediately when InStock or Reserved changes

**Reserved Quantity Rules:**
- Reserved can be set independently
- Reserved typically set by order system, not manual
- Reserved > InStock is allowed/disallowed? (document)

