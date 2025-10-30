# Test Cases for VCST-3921: Copy SKU for product context menu

## User Story Details
- **Jira Key**: VCST-3921
- **Summary**: Copy SKU for product context menu
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/10/2025

## Description
As a Category Manager, I want to copy SKU from menu, so that I can share it from some body or used it for search.

---

## Test Cases

### Test Case 1: Copy SKU from Single Product Context Menu - Happy Path
**Objective**: Verify that a user can successfully copy a SKU from a product's context menu

**Preconditions**:
- User is logged in as Category Manager
- User has access to [Catalog module](https://docs.virtocommerce.org/user_docs/catalog-menu/)
- At least one product exists in the catalog with a valid SKU
- User has appropriate [permissions](https://docs.virtocommerce.org/user_docs/catalog-security/)

**Test Steps**:
1. Navigate to Catalog module
2. Select a catalog containing products
3. Locate a product in the list
4. Right-click on the product to open context menu
5. Click "Copy SKU" option
6. Paste the copied content into a text editor

**Expected Results**:
- Context menu contains "Copy SKU" option
- SKU is successfully copied to clipboard
- Pasted content matches exactly with the product's SKU
- No formatting is included in the copied SKU

**Test Data**: 
- Product with SKU: "TEST-SKU-001"

**Priority**: High

---

### Test Case 2: Copy SKU from Multiple Selected Products
**Objective**: Verify SKU copying functionality when multiple products are selected

**Preconditions**:
- User is logged in as Category Manager
- Multiple products exist in the [catalog](https://docs.virtocommerce.org/user_docs/catalog-menu/)

**Test Steps**:
1. Navigate to Catalog module
2. Select multiple products using Ctrl/Cmd + Click
3. Right-click on any selected product
4. Verify "Copy SKU" option in context menu
5. Click "Copy SKU" option

**Expected Results**:
- "Copy SKU" option should be disabled or not visible
- System should show appropriate message about multiple selection

**Priority**: Medium

---

### Test Case 3: Copy SKU for Product Without SKU
**Objective**: Verify system behavior when attempting to copy SKU from a product with no SKU assigned

**Preconditions**:
- User is logged in as Category Manager
- Product exists in catalog with empty SKU field

**Test Steps**:
1. Navigate to Catalog module
2. Locate product with empty SKU
3. Right-click to open context menu
4. Click "Copy SKU" option

**Expected Results**:
- "Copy SKU" option should be disabled
- System should show appropriate error message
- Nothing should be copied to clipboard

**Priority**: Medium

---

### Test Case 4: Copy SKU with Special Characters
**Objective**: Verify copying SKU containing special characters

**Preconditions**:
- Product exists with SKU containing special characters
- User has access to [product management](https://docs.virtocommerce.org/user_docs/catalog-products/)

**Test Steps**:
1. Navigate to product with special characters in SKU
2. Right-click to open context menu
3. Click "Copy SKU" option
4. Paste in different locations (text editor, search field)

**Expected Results**:
- SKU with special characters is copied correctly
- No character encoding issues
- Special characters remain intact when pasted

**Test Data**: 
- SKU with special characters: "TEST#$%@-123"

**Priority**: Medium

---

### Test Case 5: Permission Verification
**Objective**: Verify that only users with appropriate permissions can access Copy SKU feature

**Preconditions**:
- Multiple user roles configured
- [Security permissions](https://docs.virtocommerce.org/user_docs/catalog-security/) properly set up

**Test Steps**:
1. Login as user without catalog read permissions
2. Attempt to access catalog
3. Login as user with read-only permissions
4. Attempt to copy SKU
5. Login as Category Manager
6. Attempt to copy SKU

**Expected Results**:
- Users without catalog access cannot reach the feature
- Read-only users can copy SKU
- Category Managers can copy SKU

**Priority**: High

---

### Test Case 6: Browser Clipboard Integration
**Objective**: Verify clipboard functionality across different browsers

**Preconditions**:
- Access to multiple browsers (Chrome, Firefox, Safari, Edge)
- Product with known SKU

**Test Steps**:
1. Test Copy SKU in Chrome
2. Test Copy SKU in Firefox
3. Test Copy SKU in Safari
4. Test Copy SKU in Edge
5. Verify clipboard content in each browser

**Expected Results**:
- Feature works consistently across all supported browsers
- Clipboard permissions are properly requested if needed
- SKU is correctly copied in all browsers

**Priority**: High

---

## Notes
- Clipboard functionality might require specific browser permissions
- Feature should be tested across different operating systems
- Consider testing with various SKU formats and lengths
- Related to product search functionality
- Consider accessibility testing for keyboard-only users

The test cases cover core functionality, permissions, cross-browser compatibility, and various edge cases while referencing relevant documentation from the Virto Commerce platform.