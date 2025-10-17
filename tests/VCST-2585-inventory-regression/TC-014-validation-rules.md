# Test Case: TC-014 - Inventory Validation Rules

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-014 |
| **Test Case Name** | Inventory Validation Rules |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P3 - Medium |
| **Test Type** | Functional - Validation |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that inventory validation rules are properly enforced after migration to Generic CRUD services. Ensure that invalid data is rejected with clear error messages and that data integrity is maintained.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Test product exists in catalog
4. Test environment: https://vcst-qa.govirto.com/
5. Credentials: admin / Password3

## Test Steps

### Part 1: Required Field Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to product inventory section | Inventory page loads |
| 4 | Click "Add Inventory" or "Create" | Inventory form opens |
| 5 | Leave "Product SKU" field empty (if available) | Field is empty |
| 6 | Leave "Fulfillment Center" field empty | Required field empty |
| 7 | Enter "In Stock" quantity: 100 | Value entered |
| 8 | Attempt to save | Save attempted |
| 9 | Verify validation error for "Fulfillment Center" | Error: "Fulfillment Center is required" |
| 10 | Verify form is not submitted | Record not created |
| 11 | Verify error message is clear and visible | Error message displayed prominently |
| 12 | Select a Fulfillment Center | Required field filled |
| 13 | Save again | Record created successfully |

### Part 2: Numeric Field Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 14 | Navigate to existing inventory record | Record details displayed |
| 15 | Click "Edit" | Edit form opens |
| 16 | Enter non-numeric value in "In Stock": "abc" | Invalid value entered |
| 17 | Attempt to save | Save attempted |
| 18 | Verify validation error | Error: "In Stock must be a number" |
| 19 | Verify value not saved | Original value retained |
| 20 | Enter special characters: "100#@" | Invalid value entered |
| 21 | Attempt to save | Save attempted |
| 22 | Verify validation error | Error: "Invalid number format" |
| 23 | Enter valid number: "100" | Valid value entered |
| 24 | Save successfully | Record updated |

### Part 3: Negative Value Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 25 | Click "Edit" on inventory record | Edit form opens |
| 26 | Enter negative "In Stock" value: "-50" | Negative value entered |
| 27 | Attempt to save | Save attempted |
| 28 | Verify validation error | Error: "In Stock cannot be negative" or error is shown |
| 29 | Verify value not saved | Original value retained |
| 30 | Enter negative "Reserved" value: "-10" | Negative value entered |
| 31 | Attempt to save | Save attempted |
| 32 | Verify validation error | Error: "Reserved cannot be negative" or error is shown |
| 33 | Enter negative "Reorder Min": "-5" | Negative value entered |
| 34 | Attempt to save | Save attempted |
| 35 | Verify validation error or acceptance | Document system behavior |
| 36 | Enter valid values: In Stock = 100, Reserved = 10 | Valid values entered |
| 37 | Save successfully | Record updated |

### Part 4: Decimal/Float Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 38 | Click "Edit" on inventory record | Edit form opens |
| 39 | Enter decimal "In Stock" value: "50.75" | Decimal value entered |
| 40 | Attempt to save | Save attempted |
| 41 | Observe system behavior | Either: accepted, rounded, or validation error |
| 42 | Document actual behavior | Behavior recorded |
| 43 | If decimal not allowed, verify error message | Error: "In Stock must be a whole number" |
| 44 | If decimal allowed, verify value saved correctly | Value saved as 50.75 or rounded |

### Part 5: Maximum Value Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 45 | Click "Edit" on inventory record | Edit form opens |
| 46 | Enter very large value: "999999999999" | Extremely large value entered |
| 47 | Attempt to save | Save attempted |
| 48 | Observe system behavior | Either: accepted or validation error for max value |
| 49 | Document actual behavior and max limit (if any) | Max limit recorded |
| 50 | If max limit enforced, verify error message | Error: "Value exceeds maximum" |

### Part 6: Duplicate Record Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 51 | Navigate to product with existing inventory | Product has inventory in "Main Warehouse" |
| 52 | Note existing fulfillment center: "Main Warehouse" | Noted |
| 53 | Click "Add Inventory" | Create form opens |
| 54 | Select same fulfillment center: "Main Warehouse" | Same FC selected |
| 55 | Enter quantity: 50 | Value entered |
| 56 | Attempt to save (duplicate product + FC combination) | Save attempted |
| 57 | Verify duplicate validation error | Error: "Inventory already exists for this fulfillment center" |
| 58 | Verify duplicate record not created | No duplicate created |
| 59 | Select different FC: "East Coast DC" | Different FC selected |
| 60 | Save successfully | New record created (different FC allowed) |

### Part 7: Product/FC Reference Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 61 | Attempt to create inventory with non-existent product | (May require API or manual DB manipulation) |
| 62 | Observe system behavior | Error: "Product not found" or referential integrity error |
| 63 | Attempt to create inventory with non-existent FC | (May require API or manual entry) |
| 64 | Observe system behavior | Error: "Fulfillment Center not found" |

### Part 8: Field Length Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 65 | If any text fields exist (notes, etc.), test length | Enter very long text (1000+ characters) |
| 66 | Attempt to save | Save attempted |
| 67 | Observe system behavior | Either: accepted, truncated, or validation error |
| 68 | Document max length limits | Max length recorded |

## Expected Results

### Required Field Validation
- Required fields are marked with asterisk or indicator
- Empty required fields trigger validation errors
- Error messages clearly state which field is required
- Form cannot be submitted with missing required fields
- Error messages appear near the invalid field

### Numeric Validation
- Non-numeric values are rejected
- Special characters in numeric fields are rejected
- Clear error messages for numeric field violations
- Only valid numbers are accepted

### Negative Value Validation
- Negative stock quantities are rejected (or accepted - document behavior)
- Negative reserved quantities are rejected (or accepted - document behavior)
- Clear error messages explain why negative values are invalid
- System maintains data integrity (no negative stock)

### Decimal Value Handling
- System either accepts or rejects decimal values consistently
- If decimals accepted, they are stored correctly
- If decimals rejected, clear error message provided
- If decimals rounded, rounding behavior is documented

### Maximum Value Validation
- Very large numbers are handled appropriately
- Maximum value limits are enforced (if they exist)
- Clear error messages for exceeding max values
- System doesn't crash with large numbers

### Duplicate Prevention
- Duplicate product + FC combinations are prevented
- Clear error message when attempting duplicate
- Same product in different FCs is allowed
- Different products in same FC is allowed

### Referential Integrity
- Invalid product references are rejected
- Invalid fulfillment center references are rejected
- Error messages are clear about missing references
- System maintains referential integrity

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Required field validation error
- [ ] Numeric validation error (non-numeric input)
- [ ] Negative value validation error
- [ ] Decimal value handling
- [ ] Maximum value handling
- [ ] Duplicate record error
- [ ] Product/FC reference error
- [ ] Successful save after correcting errors

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: IInventoryService validation logic (migrated to Generic CRUD)

**Migration Impact**: Validation rules must be properly enforced with Generic CRUD implementation.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Required fields are validated
- [ ] Numeric fields reject non-numeric input
- [ ] Negative values are handled appropriately
- [ ] Decimal values are handled appropriately
- [ ] Very large values are handled appropriately
- [ ] Duplicate records are prevented
- [ ] Product references are validated
- [ ] Fulfillment center references are validated
- [ ] Error messages are clear and helpful
- [ ] Error messages appear near the field
- [ ] Invalid data is not saved
- [ ] Valid data is saved successfully
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-001: Create New Inventory Record (validation during create)
- TC-003: Update Inventory Information (validation during update)
- TC-012: Bulk Inventory Operations (validation in bulk operations)
- TC-013: Inventory Stock Level Updates (stock level validation)

## Validation Rules Matrix

| Field | Rule | Test Value | Expected Behavior | Actual Behavior | Pass? |
|-------|------|------------|-------------------|-----------------|-------|
| Fulfillment Center | Required | Empty | Error: Required | | ☐ |
| In Stock | Numeric | "abc" | Error: Must be number | | ☐ |
| In Stock | Non-negative | "-50" | Error or Accept? | | ☐ |
| In Stock | Decimal | "50.75" | Rounded or Accept? | | ☐ |
| In Stock | Max value | "999999999999" | Accept or Error? | | ☐ |
| Reserved | Numeric | "xyz" | Error: Must be number | | ☐ |
| Reserved | Non-negative | "-10" | Error or Accept? | | ☐ |
| Product + FC | Unique | Duplicate | Error: Already exists | | ☐ |
| Product SKU | Exists | "NONEXIST" | Error: Not found | | ☐ |
| FC ID | Exists | "NONEXIST-FC" | Error: Not found | | ☐ |

## Additional Scenarios

### Scenario 1: Client-Side vs Server-Side Validation
- Disable JavaScript in browser
- Attempt to submit invalid data
- Verify server-side validation still works
- Ensure server-side validation prevents invalid data

### Scenario 2: Multiple Validation Errors
- Leave required field empty
- Enter non-numeric value in another field
- Enter negative value in third field
- Submit form
- Verify all errors are displayed simultaneously
- Verify all errors must be fixed before save succeeds

### Scenario 3: Validation Error Recovery
- Trigger validation error
- Correct the error
- Verify error message clears
- Verify form can be submitted successfully

### Scenario 4: Copy/Paste Invalid Data
- Copy invalid data (non-numeric with special chars)
- Paste into numeric field
- Verify validation catches the issue
- Verify clear error message

### Scenario 5: Boundary Values
- Enter 0 for In Stock (valid)
- Enter 1 for In Stock (valid)
- Enter 2147483647 (max 32-bit int)
- Document which values are accepted

## Business Rules Documentation

**Document Actual System Behavior:**
- [ ] Negative stock allowed? Yes/No
- [ ] Decimal quantities allowed? Yes/No
- [ ] Maximum stock value? ___________
- [ ] Reserved can exceed InStock? Yes/No
- [ ] Duplicate product+FC prevented? Yes/No
- [ ] Required fields: _________________
- [ ] Optional fields: _________________

**Validation Timing:**
- [ ] Client-side (browser) validation? Yes/No
- [ ] Server-side validation? Yes/No
- [ ] Real-time validation (as typing)? Yes/No
- [ ] Validation on blur (leaving field)? Yes/No
- [ ] Validation on submit only? Yes/No

