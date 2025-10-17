# Test Case: TC-007 - Advanced Inventory Search with Filters

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-007 |
| **Test Case Name** | Advanced Inventory Search with Multiple Filters |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - Search |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory search functionality works correctly with multiple combined filters after migration to Generic Search services. Ensure that IInventorySearchService handles complex search queries with multiple criteria accurately.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Diverse inventory data exists (various SKUs, FCs, stock levels)
4. Test environment: https://vcst-qa.govirto.com/
5. Credentials: admin / Password3

## Test Data
- **Product SKU**: TEST-LAPTOP-001
- **Fulfillment Center**: Main Warehouse
- **Stock Level**: Products with stock > 50
- **Out of Stock**: Products with stock = 0
- **Low Stock**: Products with stock < 10
- **Allow Backorder**: Yes/No filters

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Inventory" management interface | Inventory page loads with all records |
| 4 | Note total number of inventory records (baseline) | Total count recorded |
| 5 | **Test 1: SKU + Fulfillment Center** | |
| 6 | Enter SKU filter: "TEST-LAPTOP" (partial) | SKU filter applied |
| 7 | Select Fulfillment Center: "Main Warehouse" | FC filter applied |
| 8 | Apply filters | Combined filters executed |
| 9 | Verify results show only TEST-LAPTOP in Main Warehouse | Correct combined filtering |
| 10 | Verify no other SKUs or FCs appear in results | Filters work together correctly |
| 11 | Clear all filters | Filters cleared, full list restored |
| 12 | **Test 2: Fulfillment Center + Stock Level** | |
| 13 | Select Fulfillment Center: "Main Warehouse" | FC filter applied |
| 14 | Apply stock level filter: "In Stock" (quantity > 0) | Stock filter applied |
| 15 | Apply combined filters | Filters executed |
| 16 | Verify all results are from Main Warehouse | FC filter working |
| 17 | Verify all results have stock quantity > 0 | Stock filter working |
| 18 | Note count of results for verification | Count recorded |
| 19 | Clear all filters | Filters cleared |
| 20 | **Test 3: Out of Stock Filter** | |
| 21 | Apply stock level filter: "Out of Stock" (quantity = 0) | Filter applied |
| 22 | Verify all results show quantity = 0 | Out of stock filter working |
| 23 | Verify "Out of Stock" indicator/badge is shown | Status indicator visible |
| 24 | Clear filters | Filters cleared |
| 25 | **Test 4: Low Stock + Fulfillment Center** | |
| 26 | Apply stock level filter: "Low Stock" (quantity < 10) | Filter applied |
| 27 | Select Fulfillment Center: "East Coast DC" | FC filter applied |
| 28 | Apply combined filters | Filters executed |
| 29 | Verify results are from East Coast DC with stock < 10 | Combined filters working |
| 30 | Clear filters | Filters cleared |
| 31 | **Test 5: Allow Backorder Filter** | |
| 32 | Apply filter: "Allow Backorder = Yes" | Filter applied |
| 33 | Verify all results have backorder enabled | Filter working correctly |
| 34 | Change to: "Allow Backorder = No" | Filter changed |
| 35 | Verify all results have backorder disabled | Filter working correctly |
| 36 | Clear filters | Filters cleared |
| 37 | **Test 6: Triple Filter Combination** | |
| 38 | Enter SKU: "TEST" (partial match) | SKU filter applied |
| 39 | Select FC: "Main Warehouse" | FC filter applied |
| 40 | Select Stock: "In Stock" (quantity > 0) | Stock filter applied |
| 41 | Apply all three filters | All filters executed |
| 42 | Verify results match all three criteria | All filters working together |
| 43 | Verify result count is correct | Accurate filtering |
| 44 | Remove SKU filter only | SKU filter removed |
| 45 | Verify results update (more results, FC + Stock only) | Individual filter removal works |
| 46 | Clear all filters | All filters cleared |

## Expected Results

### Visual Elements
- **Multiple Filter UI**: Clear interface for applying multiple filters
- **Active Filter Indicators**: Visual badges showing active filters
- **Filter Count**: Display of number of results matching filters
- **Clear Filters**: Easy option to clear individual or all filters
- **Filter Combinations**: All filter types can be used together

### Functional Behavior
- IInventorySearchService handles multiple criteria correctly
- Filters work in combination (AND logic)
- Each filter independently affects results
- Filters can be added incrementally
- Individual filters can be removed while keeping others
- Clear all filters restores full list
- Results update immediately when filters change
- Complex queries perform well (< 3 seconds)
- Empty result set shows appropriate message
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- All matching records are returned (no false negatives)
- No non-matching records appear (no false positives)
- Filter combinations use AND logic correctly
- Stock level filters use correct comparison operators
- Boolean filters (backorder, preorder) work correctly
- Partial match search works as expected

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] SKU + FC filter combination
- [ ] FC + Stock Level filter combination
- [ ] Out of Stock filter results
- [ ] Low Stock + FC combination
- [ ] Allow Backorder filter
- [ ] Triple filter combination (SKU + FC + Stock)
- [ ] Individual filter removal
- [ ] All filters cleared

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: 
- IInventorySearchService (migrated to Generic Search)
- IProductInventorySearchService (migrated to Generic Search)

**Migration Impact**: This test verifies complex search scenarios after Generic Search migration.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Multiple filters can be applied simultaneously
- [ ] SKU + FC combination works correctly
- [ ] FC + Stock Level combination works correctly
- [ ] Triple filter combination works correctly
- [ ] Out of Stock filter works correctly
- [ ] Low Stock filter works correctly
- [ ] Allow Backorder filter works correctly
- [ ] Individual filters can be removed
- [ ] Clear all filters works correctly
- [ ] Results are accurate for all combinations
- [ ] Performance is acceptable (< 3 seconds)
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-005: Search Inventory by Product SKU (single filter)
- TC-006: Search Inventory by Fulfillment Center (single filter)
- TC-001: Create New Inventory Record (create test data)
- TC-013: Inventory Stock Level Updates (stock level data)

## Advanced Search Scenarios

### Scenario 1: Progressive Filter Addition
1. Start with no filters (full list)
2. Add SKU filter (list narrows)
3. Add FC filter (list narrows more)
4. Add Stock filter (list narrows further)
5. Verify each step reduces results appropriately

### Scenario 2: Filter Conflict (No Results)
- Apply filters that match no records
- Example: SKU="LAPTOP" + FC="Main Warehouse" + Stock="Out of Stock"
- If no records match all criteria
- Verify "No results found" message
- Verify message suggests clearing some filters

### Scenario 3: Pagination with Filters
- Apply filters that return 50+ results
- Verify pagination works with active filters
- Navigate to page 2
- Verify filtered results continue on page 2
- Verify filters remain active across pages

### Scenario 4: Sorting with Multiple Filters
- Apply multiple filters
- Sort results by Product Name
- Verify sorting works within filtered results
- Sort by Stock Quantity
- Verify sorting maintains filter accuracy

### Scenario 5: Filter URL Parameters (if applicable)
- Apply multiple filters
- Copy page URL
- Open URL in new browser tab
- Verify filters are applied automatically from URL
- Verify results match original filtered view

### Scenario 6: Export Filtered Results
- Apply multiple filters
- Use export/CSV function (if available)
- Verify export contains only filtered results
- Verify all filtered records are in export

## Filter Combination Test Matrix

| Test # | SKU Filter | FC Filter | Stock Filter | Expected Results | Actual Results | Pass? |
|--------|------------|-----------|--------------|------------------|----------------|-------|
| 1 | TEST-LAPTOP | Main | Any | Only TEST-LAPTOP in Main | | ☐ |
| 2 | Any | Main | In Stock | Main + Stock > 0 | | ☐ |
| 3 | Any | Any | Out of Stock | Stock = 0 only | | ☐ |
| 4 | Any | East Coast | Low Stock | East + Stock < 10 | | ☐ |
| 5 | TEST | Main | In Stock | TEST + Main + Stock > 0 | | ☐ |
| 6 | None | None | None | All records | | ☐ |

## Performance Considerations
- [ ] 2 filters combined - time: _____ ms
- [ ] 3 filters combined - time: _____ ms
- [ ] 4+ filters combined - time: _____ ms
- [ ] Complex filter with 100+ results - time: _____ ms

Target: All filter combinations should complete in < 3 seconds

## Filter Logic Verification

**AND Logic (Default Expected):**
- Filter 1 AND Filter 2 AND Filter 3
- Results must match ALL filters simultaneously
- Verify this is the implemented logic

**Document any OR Logic:**
- If any filters use OR logic, document here
- Example: "Allow Backorder OR Allow Preorder"

