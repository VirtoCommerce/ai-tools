# Test Cases for VCST-3933: [Save4later] Remove Saved for later from Shopping lists query 

## User Story Details
- **Jira Key**: VCST-3933
- **Summary**: [Save4later] Remove Saved for later from Shopping lists query 
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/11/2025

## Description
We separate the Shopping List and Saved from later - 
Saved for later items should be removed from the Shopping list query results

---

## Test Cases

### Test Case 1: Verify Shopping List Query Excludes Saved for Later Items
**Objective**: Verify that when querying shopping lists, items marked as "Saved for Later" are excluded from the results

**Preconditions**:
- User is authenticated and has access to the storefront
- User has at least one shopping list with regular items
- User has at least one item marked as "Saved for Later"
- Shopping lists module is properly configured: https://docs.virtocommerce.org/modules/shopping-list/

**Test Steps**:
1. Navigate to the Shopping Lists page in the storefront
2. Execute a GraphQL query to retrieve shopping lists using the shopping lists query endpoint
3. Review the returned shopping list items in the query response
4. Verify the structure and content of each item returned
5. Check if any items with "Saved for Later" status are present in the results

**Expected Results**:
- Shopping list query returns successfully with status 200
- Only regular shopping list items are included in the query results
- Items marked as "Saved for Later" are completely excluded from the shopping list query response
- The item count in the shopping list matches the number of regular items only (excluding saved for later items)
- Query response maintains proper data structure without errors

**Test Data**: 
- User with shopping list containing 3 regular items and 2 "Saved for Later" items
- Expected result count: 3 items

**Priority**: High

---

### Test Case 2: Verify Separate Saved for Later Query Returns Only Saved Items
**Objective**: Ensure that "Saved for Later" items can be retrieved through a dedicated query separate from shopping lists

**Preconditions**:
- User is authenticated with valid credentials
- User has items in both Shopping List and Saved for Later
- API endpoints for both Shopping List and Saved for Later are accessible

**Test Steps**:
1. Execute the shopping lists query via GraphQL API
2. Note the items returned and their identifiers
3. Execute a separate "Saved for Later" query (if available as separate endpoint)
4. Compare the item IDs between both query results
5. Verify no overlap exists between the two result sets

**Expected Results**:
- Shopping list query returns only items not marked as "Saved for Later"
- Saved for Later query returns only items with "Saved for Later" status
- No item appears in both query results simultaneously
- Each query returns distinct sets of items with no duplicates
- Both queries execute successfully without errors

**Test Data**: 
- Shopping List items: ProductID_001, ProductID_002, ProductID_003
- Saved for Later items: ProductID_004, ProductID_005

**Priority**: High

---

### Test Case 3: Verify Moving Item from Shopping List to Saved for Later Updates Query Results
**Objective**: Test that moving an item to "Saved for Later" immediately removes it from shopping list query results

**Preconditions**:
- User is logged into the storefront
- Shopping cart and lists functionality is enabled: https://docs.virtocommerce.org/modules/shopping-cart/
- User has a shopping list with at least 3 items
- None of the items are currently in "Saved for Later" status

**Test Steps**:
1. Query the shopping lists and record the initial item count and item IDs
2. Select one specific item from the shopping list (note its ID)
3. Execute the action to move the item to "Saved for Later"
4. Wait for the operation to complete successfully
5. Re-query the shopping lists immediately after the move operation
6. Compare the new query results with the initial results

**Expected Results**:
- Initial query shows all items in the shopping list (e.g., 3 items)
- Move operation completes successfully with confirmation message
- Subsequent shopping list query shows one fewer item (e.g., 2 items)
- The moved item's ID is absent from the new shopping list query results
- The moved item is now available in the "Saved for Later" query/view
- Shopping list item count is decremented by 1

**Test Data**: 
- Initial shopping list: [ItemA, ItemB, ItemC]
- Item to move: ItemB
- Expected final shopping list: [ItemA, ItemC]

**Priority**: High

---

### Test Case 4: Verify Empty Shopping List Query When All Items Are Saved for Later
**Objective**: Test edge case where all shopping list items are moved to "Saved for Later" 

**Preconditions**:
- User is authenticated
- User has an existing shopping list with items
- Shopping list contains exactly 2-3 items
- "Saved for Later" feature is enabled and functional

**Test Steps**:
1. Execute shopping list query and verify items are present
2. Move all items from the shopping list to "Saved for Later" one by one
3. Confirm each move operation completes successfully
4. Execute the shopping list query again after all moves are completed
5. Verify the query response structure and content
6. Check for any error messages or null values

**Expected Results**:
- Shopping list query executes successfully without errors
- Query returns an empty list/array for shopping list items
- Response indicates zero items in the shopping list count
- No system errors or exceptions are thrown
- The shopping list entity still exists but with no items
- All moved items are retrievable through "Saved for Later" functionality

**Test Data**: 
- Shopping List with items: [Product_X, Product_Y]
- All items moved to Saved for Later
- Expected shopping list result: Empty array []

**Priority**: Medium

---

### Test Case 5: Verify Shopping List Query After Moving Item Back from Saved for Later
**Objective**: Validate that moving an item from "Saved for Later" back to Shopping List includes it in shopping list query results

**Preconditions**:
- User has valid authentication credentials
- User has at least one item in "Saved for Later"
- User has an existing shopping list (may be empty or contain items)
- Shopping lists module is properly configured

**Test Steps**:
1. Execute shopping list query and record current items and count
2. Identify an item currently in "Saved for Later" status
3. Execute the action to move the item from "Saved for Later" back to Shopping List
4. Confirm the move operation completes without errors
5. Re-execute the shopping list query
6. Verify the previously saved item now appears in the results
7. Confirm the item is no longer in "Saved for Later"

**Expected Results**:
- Move operation from "Saved for Later" to Shopping List succeeds
- Shopping list query now includes the moved item in its results
- Shopping list item count is incremented by 1
- Item details (ID, name, quantity, etc.) are preserved after the move
- Item no longer appears in "Saved for Later" query/view
- Query response maintains consistent data structure

**Test Data**: 
- Initial Shopping List: [ItemA] (count: 1)
- Saved for Later: [ItemB, ItemC]
- Item to move back: ItemB
- Expected final Shopping List: [ItemA, ItemB] (count: 2)

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Additional Testing Considerations

**Performance Testing**:
- Test shopping list query performance with large datasets (100+ items in both lists)
- Verify query execution time remains acceptable after separation of concerns

**Concurrent Operations**:
- Test simultaneous moves of items between Shopping List and Saved for Later
- Verify data consistency when multiple users access the same shared shopping list

**Data Integrity**:
- Verify database correctly maintains separate tables/flags for Shopping List vs Saved for Later
- Confirm no orphaned records exist after multiple move operations

**API Validation**:
- Test GraphQL query filters and parameters work correctly
- Verify proper error handling when invalid list IDs are provided

---

## Notes
- All tests should be executed against both GraphQL API endpoints and Storefront UI
- Verify backward compatibility if existing integrations rely on previous shopping list query behavior
- Consider testing with different user roles (customer, manager, admin) if permissions vary
- Related documentation: https://docs.virtocommerce.org/modules/shopping-list/
- Ensure cache invalidation works correctly after items are moved between lists
- Test should cover both single-user shopping lists and shared shopping lists scenarios