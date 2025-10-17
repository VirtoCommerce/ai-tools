# Test Case: TC-006 - Search Inventory by Fulfillment Center

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-006 |
| **Test Case Name** | Search Inventory by Fulfillment Center |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - Search |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory search functionality works correctly by Fulfillment Center after migration to Generic Search services. Ensure that IInventorySearchService returns accurate results when filtering by fulfillment center location.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Multiple fulfillment centers exist in the system
4. Inventory records exist across different fulfillment centers
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
- **Fulfillment Center 1**: Main Warehouse (should have inventory records)
- **Fulfillment Center 2**: East Coast DC (should have inventory records)
- **Fulfillment Center 3**: West Coast DC (should have inventory records)
- **Empty Fulfillment Center**: New Empty Warehouse (should have no inventory)
- Note the number of inventory records in each fulfillment center before testing

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Inventory" module or management interface | Inventory management page loads |
| 4 | Verify inventory list displays all records (baseline) | Full inventory list is shown |
| 5 | Note total number of inventory records displayed | Total count recorded |
| 6 | Locate "Fulfillment Center" filter or dropdown | Fulfillment center filter is visible |
| 7 | Click on Fulfillment Center filter dropdown | Dropdown opens showing options |
| 8 | Verify dropdown lists all available fulfillment centers | All FCs are listed in dropdown |
| 9 | Select "Main Warehouse" from dropdown | Selection is made |
| 10 | Click "Apply Filter" or wait for auto-filter | Filter is applied |
| 11 | Observe filtered results | Results are updated |
| 12 | Verify only inventory from "Main Warehouse" is displayed | Only Main Warehouse records shown |
| 13 | Verify each result shows "Main Warehouse" as FC | Fulfillment center label correct |
| 14 | Count number of results | Count matches expected for Main Warehouse |
| 15 | Verify multiple products can be in same FC | Different products, same FC shown |
| 16 | Clear filter or select "East Coast DC" | New selection made |
| 17 | Apply filter | Filter is applied |
| 18 | Verify only "East Coast DC" inventory is displayed | Only East Coast DC records shown |
| 19 | Verify no "Main Warehouse" records appear | Previous filter cleared correctly |
| 20 | Select "West Coast DC" | New selection made |
| 21 | Apply filter | Filter is applied |
| 22 | Verify only "West Coast DC" inventory is displayed | Only West Coast DC records shown |
| 23 | Select "New Empty Warehouse" (no inventory) | Empty FC selected |
| 24 | Apply filter | Filter is applied |
| 25 | Verify "No results found" or empty list is displayed | No records shown for empty FC |
| 26 | Verify appropriate message for no results | User-friendly message displayed |
| 27 | Clear fulfillment center filter | Filter is cleared |
| 28 | Verify all inventory records are displayed again | Full list restored |
| 29 | Verify record count matches original baseline | All records are back |

## Expected Results

### Visual Elements
- **Filter Interface**: Clear fulfillment center filter/dropdown
- **Dropdown Options**: All fulfillment centers listed
- **Filter Badge/Indicator**: Visual indicator that filter is active
- **Results Display**: Filtered results clearly displayed
- **Clear Filter**: Option to clear or reset filter
- **No Results Message**: Clear message when FC has no inventory

### Functional Behavior
- Filter uses IInventorySearchService correctly
- Fulfillment center filter is accurate
- Only inventory from selected FC is shown
- Filter can be changed to different FC
- Results update immediately when filter changes
- Clear filter restores full list
- Empty fulfillment center shows appropriate message
- Filter state persists during navigation (if applicable)
- Performance is good (< 2 seconds for filtering)
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- All inventory records for selected FC are returned
- No records from other FCs appear in results
- Fulfillment center information is accurate
- Product details in results are correct
- Quantity information is accurate
- Multiple products in same FC all appear

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Fulfillment center filter dropdown
- [ ] Filter by Main Warehouse - results
- [ ] Filter by East Coast DC - results
- [ ] Filter by West Coast DC - results
- [ ] Filter by empty FC - no results
- [ ] Cleared filter - all results restored

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventorySearchService (migrated to Generic Search)

**Migration Impact**: This test verifies the Fulfillment Center filtering capability after Generic Search migration.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Fulfillment center filter is accessible
- [ ] Dropdown lists all fulfillment centers
- [ ] Filter applies without errors
- [ ] Results show only selected FC inventory
- [ ] Multiple products in same FC all appear
- [ ] Filter can be changed to different FC
- [ ] Empty FC shows no results message
- [ ] Clear filter restores all results
- [ ] Result count is accurate
- [ ] Performance is acceptable (< 2 seconds)
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-001: Create New Inventory Record (create in specific FC)
- TC-002: View/Read Inventory Details (view FC details)
- TC-005: Search Inventory by Product SKU (different search criteria)
- TC-007: Advanced Inventory Search with Filters (combined filters)

## Additional Scenarios to Test

### Scenario 1: Multi-Select Fulfillment Centers (if supported)
- Select multiple fulfillment centers (e.g., Main + East Coast)
- Verify results show inventory from both FCs
- Verify each result clearly indicates its FC

### Scenario 2: Product in Multiple Fulfillment Centers
- Find product that exists in 3 different FCs
- Filter by first FC - verify product appears with that FC
- Filter by second FC - verify product appears with that FC
- Filter by third FC - verify product appears with that FC
- Verify quantity values are different for each FC

### Scenario 3: Filter Persistence
- Apply fulfillment center filter
- Navigate to different page/section
- Return to inventory page
- Verify filter is still applied (if expected behavior)

### Scenario 4: Combined with Search
- Apply fulfillment center filter (Main Warehouse)
- Enter product SKU in search field
- Verify results show only if product is in Main Warehouse
- Verify product in other FCs doesn't appear

### Scenario 5: Sorting with Filter
- Apply fulfillment center filter
- Sort results by product name
- Verify sorting works correctly within filtered results
- Verify only filtered FC results are sorted

### Scenario 6: Newly Added Inventory
- Create new inventory record in specific FC
- Apply filter for that FC
- Verify newly created record appears
- Verify it doesn't appear in other FC filters

## Data Verification Table

| Fulfillment Center | Expected Count | Actual Count | Match? |
|-------------------|----------------|--------------|--------|
| Main Warehouse | _____ | _____ | ☐ |
| East Coast DC | _____ | _____ | ☐ |
| West Coast DC | _____ | _____ | ☐ |
| New Empty Warehouse | 0 | _____ | ☐ |
| **Total (All FCs)** | _____ | _____ | ☐ |

## Performance Considerations
- [ ] Filter by FC with 10 records - time: _____ ms
- [ ] Filter by FC with 50 records - time: _____ ms
- [ ] Filter by FC with 200+ records - time: _____ ms
- [ ] Clear filter and restore all - time: _____ ms

Target: All filter operations should complete in < 2 seconds

