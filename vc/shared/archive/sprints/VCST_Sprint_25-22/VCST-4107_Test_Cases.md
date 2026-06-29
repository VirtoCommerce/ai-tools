# Test Cases for VCST-4107: Generic Export for Virtual Category should be disabled

## User Story Details
- **Jira Key**: VCST-4107
- **Summary**: Generic Export for Virtual Category should be disabled
- **Priority**: Low
- **Status**: To do
- **Created**: 10/14/2025

## Description
Generic export works with errors for Virtual catalog so need to disable it for Virtual catalog to avoid incorrect behavior.

---

## Test Cases

### Test Case 1: Verify Export Button Disabled for Virtual Category
**Objective**: Verify that the generic export button/option is disabled when accessing a virtual category

**Preconditions**:
- User is logged into the system
- User has access to virtual category management
- At least one virtual category exists in the system

**Test Steps**:
1. Navigate to the category management section
2. Select a virtual category
3. Check the export options/buttons availability

**Expected Results**:
- Generic export button should be disabled
- Generic export option should be grayed out
- Export tooltip should indicate feature is not available for virtual categories

**Test Data**: Existing virtual category

**Priority**: High

---

### Test Case 2: Verify Export Button State for Regular Categories
**Objective**: Confirm that generic export remains enabled for non-virtual categories

**Preconditions**:
- User is logged into the system
- Both virtual and regular categories exist in the system

**Test Steps**:
1. Navigate to category management
2. Select a regular (non-virtual) category
3. Check export functionality
4. Switch to a virtual category
5. Compare export functionality states

**Expected Results**:
- Export button should be enabled for regular categories
- Export function should work normally for regular categories
- System should maintain different states for different category types

**Test Data**: 
- Regular category
- Virtual category

**Priority**: High

---

### Test Case 3: Verify API-level Export Protection
**Objective**: Ensure export API endpoints are protected for virtual categories

**Preconditions**:
- Access to API testing tools
- Valid API credentials
- Virtual category ID available

**Test Steps**:
1. Attempt to trigger export via API for virtual category
2. Check API response
3. Verify error handling

**Expected Results**:
- API should return appropriate error code
- Error message should indicate operation not supported
- No partial or incorrect export should be initiated

**Test Data**: 
- Virtual category API endpoint
- Export API parameters

**Priority**: Medium

---

### Test Case 4: Multiple Category Selection Behavior
**Objective**: Verify export behavior when selecting multiple categories including virtual ones

**Preconditions**:
- Multiple categories of different types exist
- User has selection rights

**Test Steps**:
1. Select multiple regular categories
2. Add a virtual category to selection
3. Check export option state
4. Attempt to initiate export

**Expected Results**:
- System should warn about virtual categories in selection
- Export should be disabled if selection includes virtual categories
- Clear user message explaining the limitation

**Test Data**: Mix of virtual and regular categories

**Priority**: Medium

---

### Test Case 5: UI State Consistency
**Objective**: Verify UI remains consistent when switching between category types

**Preconditions**:
- User interface is accessible
- Multiple category types available

**Test Steps**:
1. Navigate between different category types
2. Check export button state changes
3. Verify UI elements consistency
4. Check for any visual glitches

**Expected Results**:
- UI should update smoothly
- No flickering or inconsistent states
- Clear visual indication of export availability

**Priority**: Medium

---

### Test Case 6: Batch Operation Handling
**Objective**: Verify batch operations excluding export for virtual categories

**Preconditions**:
- Batch operation capabilities enabled
- Multiple categories available

**Test Steps**:
1. Select multiple categories for batch operation
2. Check available operations
3. Verify export option handling
4. Attempt batch operations

**Expected Results**:
- Export option should be properly handled in batch operations
- Clear indication of limitations for virtual categories
- Other batch operations should work normally

**Priority**: Low

---

## Edge Cases and Negative Tests

### Test Case 7: System State Recovery
**Objective**: Verify system handles interrupted export attempts gracefully

**Preconditions**:
- System in normal operating state
- Virtual category available

**Test Steps**:
1. Attempt to force export through browser dev tools
2. Check system state after attempted bypass
3. Verify no partial exports created

**Expected Results**:
- System should maintain integrity
- No corrupt or partial exports created
- Appropriate error logging

**Priority**: Low

---

## Notes
- All tests should be executed in both production and staging environments
- Additional focus on performance impact of disabled functionality
- Consider monitoring system logs for unauthorized export attempts
- Related stories: Any previous export functionality tickets
- Dependencies: Category management system access, API availability