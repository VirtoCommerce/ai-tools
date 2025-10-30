# Test Cases for VCST-3638: [Support] JSONPATCH can reference elements in the array/list only by their index

## User Story Details
- **Jira Key**: VCST-3638
- **Summary**: [Support] JSONPATCH can reference elements in the array/list only by their index
- **Priority**: Medium
- **Status**: Done
- **Created**: 7/17/2025

## Description
JSONPATCH can reference elements in the array/list only by their index, we need to implement some other way to patch dynamic properties by name.

---

## Test Cases

### Test Case 1: Update Dynamic Property by Name Instead of Index
**Objective**: Verify that dynamic properties can be successfully updated using property name reference instead of array index in JSONPATCH operations

**Preconditions**:
- VirtoCommerce platform is installed and running
- API access is configured with valid authentication token
- At least one entity (e.g., Product, Category, or Customer) exists with dynamic properties defined
- Reference: [Dynamic Properties documentation](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)
- Dynamic property with name "Brand" exists in the system

**Test Steps**:
1. Send GET request to retrieve the entity with dynamic properties via REST API
2. Identify the dynamic property "Brand" in the response
3. Construct a JSONPATCH request to update the "Brand" property using name-based reference: `[{"op": "replace", "path": "/dynamicProperties/[name='Brand']/values/0/value", "value": "NewBrandValue"}]`
4. Send PATCH request to the entity endpoint with the constructed JSONPATCH payload
5. Send GET request to retrieve the updated entity
6. Verify the "Brand" property value has been updated

**Expected Results**:
- JSONPATCH request with name-based reference is accepted (HTTP 200/204)
- Dynamic property "Brand" value is successfully updated to "NewBrandValue"
- Response contains the updated property with correct value
- No other dynamic properties are affected by the update

**Test Data**: 
- Entity ID: [existing entity with dynamic properties]
- Dynamic Property Name: "Brand"
- New Value: "NewBrandValue"

**Priority**: High

---

### Test Case 2: Add New Value to Multi-Value Dynamic Property by Name
**Objective**: Verify that new values can be added to multi-value dynamic properties using name reference in JSONPATCH operations

**Preconditions**:
- VirtoCommerce platform is installed and running
- API access is configured with valid authentication token
- Entity exists with a multi-value dynamic property (e.g., "Tags" with dictionary type)
- Reference: [Dynamic Properties documentation](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)
- Dynamic property "Tags" is configured to accept multiple values

**Test Steps**:
1. Send GET request to retrieve the entity with the multi-value dynamic property "Tags"
2. Note the current number of values in the "Tags" property
3. Construct a JSONPATCH request to add a new value using name-based reference: `[{"op": "add", "path": "/dynamicProperties/[name='Tags']/values/-", "value": {"value": "NewTag"}}]`
4. Send PATCH request to the entity endpoint with the JSONPATCH payload
5. Send GET request to retrieve the updated entity
6. Verify the new value is added to the "Tags" property

**Expected Results**:
- JSONPATCH request is accepted (HTTP 200/204)
- New value "NewTag" is added to the "Tags" property
- Existing values in the "Tags" property remain unchanged
- Total count of values increases by 1

**Test Data**:
- Dynamic Property Name: "Tags"
- New Value: "NewTag"

**Priority**: High

---

### Test Case 3: Remove Dynamic Property Value by Name Reference
**Objective**: Verify that specific values can be removed from dynamic properties using name-based reference in JSONPATCH operations

**Preconditions**:
- VirtoCommerce platform is installed and running
- API access is configured with valid authentication token
- Entity exists with dynamic property containing multiple values
- Reference: [Dynamic Properties documentation](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)
- Dynamic property "Colors" has at least 2 values

**Test Steps**:
1. Send GET request to retrieve the entity with dynamic property "Colors"
2. Identify a specific value to remove (e.g., "Red")
3. Construct a JSONPATCH request to remove the value using name-based reference: `[{"op": "remove", "path": "/dynamicProperties/[name='Colors']/values/[value='Red']"}]`
4. Send PATCH request to the entity endpoint with the JSONPATCH payload
5. Send GET request to retrieve the updated entity
6. Verify the specific value is removed from the "Colors" property

**Expected Results**:
- JSONPATCH request is accepted (HTTP 200/204)
- The value "Red" is removed from the "Colors" property
- Other values in the "Colors" property remain unchanged
- Total count of values decreases by 1

**Test Data**:
- Dynamic Property Name: "Colors"
- Value to Remove: "Red"

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 4: Attempt to Update Non-Existent Dynamic Property by Name
**Objective**: Verify proper error handling when attempting to update a dynamic property that doesn't exist using name reference

**Preconditions**:
- VirtoCommerce platform is installed and running
- API access is configured with valid authentication token
- Entity exists with some dynamic properties defined
- Reference: [Dynamic Properties documentation](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)

**Test Steps**:
1. Send GET request to retrieve an entity with dynamic properties
2. Verify that dynamic property "NonExistentProperty" does not exist
3. Construct a JSONPATCH request to update the non-existent property: `[{"op": "replace", "path": "/dynamicProperties/[name='NonExistentProperty']/values/0/value", "value": "TestValue"}]`
4. Send PATCH request to the entity endpoint with the JSONPATCH payload
5. Verify the response status code and error message

**Expected Results**:
- JSONPATCH request is rejected with appropriate error code (HTTP 400 or 404)
- Error message clearly indicates the dynamic property name was not found
- Response includes validation details: "Dynamic property with name 'NonExistentProperty' does not exist"
- Entity remains unchanged
- No new properties are created unintentionally

**Test Data**:
- Non-existent Property Name: "NonExistentProperty"
- Test Value: "TestValue"

**Priority**: High

---

### Test Case 5: Update Dynamic Property with Invalid Name Format in JSONPATCH
**Objective**: Verify proper validation and error handling when using malformed name-based reference syntax in JSONPATCH operations

**Preconditions**:
- VirtoCommerce platform is installed and running
- API access is configured with valid authentication token
- Entity exists with dynamic property "Size"
- Reference: [Dynamic Properties documentation](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)

**Test Steps**:
1. Send GET request to retrieve an entity with dynamic property "Size"
2. Construct JSONPATCH requests with various invalid name reference formats:
   - Missing closing bracket: `[{"op": "replace", "path": "/dynamicProperties/[name='Size'/values/0/value", "value": "Large"}]`
   - Wrong syntax: `[{"op": "replace", "path": "/dynamicProperties/name=Size/values/0/value", "value": "Large"}]`
   - Empty name: `[{"op": "replace", "path": "/dynamicProperties/[name='']/values/0/value", "value": "Large"}]`
3. Send each PATCH request separately to the entity endpoint
4. Verify the response for each request

**Expected Results**:
- All JSONPATCH requests with invalid syntax are rejected (HTTP 400)
- Error messages clearly indicate the syntax error in the path reference
- Helpful error message guides users to correct format: "Invalid path format. Use [name='PropertyName'] to reference by name"
- Entity remains unchanged after each failed attempt
- System remains stable after validation errors

**Test Data**:
- Valid Property Name: "Size"
- Test Value: "Large"
- Invalid Path Formats: (listed in test steps)

**Priority**: Medium

---

## Notes
- All test cases should be executed against the REST API endpoints for entities supporting dynamic properties (Products, Categories, Customers)
- Reference: [VirtoCommerce REST API documentation](https://docs.virtocommerce.org/platform/developer-guide/REST-API/)
- The name-based reference syntax should follow the format: `/dynamicProperties/[name='PropertyName']`
- Consider backward compatibility: index-based references should still work alongside name-based references
- Test with different dynamic property types: Short Text, Long Text, Integer, Decimal, DateTime, Boolean, and Dictionary
- Verify that the implementation works consistently across all modules that support dynamic properties
- Performance testing may be required if filtering by name impacts response time significantly
- Related documentation: [Working with Dynamic Properties](https://docs.virtocommerce.org/platform/developer-guide/Modules/dynamic-properties/)