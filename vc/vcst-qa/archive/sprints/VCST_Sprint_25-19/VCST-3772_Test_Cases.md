# Test Cases for VCST-3772: [Shared lists] [E2E] Anyone with read only access

## User Story Details
[As provided in the prompt]

## Test Cases

### Test Case 1: Share Shopping List with Anyone - Happy Path
**Objective**: Verify that a shopping list owner can successfully share a list with read-only access

**Preconditions**:
- User is logged in to the storefront ([Authentication docs](https://docs.virtocommerce.org/user-guide/shopping-lists/))
- User has at least one shopping list created ([Shopping Lists docs](https://docs.virtocommerce.org/user-guide/shopping-lists/))
- Shopping list contains at least one item

**Test Steps**:
1. Navigate to Shopping Lists page
2. Open an existing shopping list
3. Click "Share" button
4. Select "Anyone" option in sharing popup
5. Click "Apply"
6. Copy generated sharing link

**Expected Results**:
- Share popup appears with "Anyone" option
- Sharing link is generated
- Copy button is available and functional
- Success message is displayed

**Priority**: High

---

### Test Case 2: Access Shared List as Anonymous User
**Objective**: Verify shared list access behavior for anonymous users

**Preconditions**:
- Have a valid sharing link for a shopping list
- Catalog anonymous access is disabled ([Catalog Security docs](https://docs.virtocommerce.org/user-guide/catalog-security/))

**Test Steps**:
1. Open shared list URL in incognito/private browser window
2. Attempt to view list contents
3. Attempt to modify list contents

**Expected Results**:
- User is redirected to login page
- No access to list contents without authentication
- No modification options are available

**Priority**: High

---

### Test Case 3: Access Shared List as Registered User
**Objective**: Verify shared list behavior for authenticated users

**Preconditions**:
- Have a valid sharing link
- User has active account
- User is logged in

**Test Steps**:
1. Open shared list URL while logged in
2. Verify list visibility in user's lists section
3. Attempt to add items to shared list
4. Attempt to modify shared list

**Expected Results**:
- List is visible in read-only mode
- Add/Edit options are disabled
- List appears in user's shopping lists section with read-only indicator
- No modification controls are available

**Priority**: High

---

### Test Case 4: Terminate Shared List Access
**Objective**: Verify owner can revoke shared access

**Preconditions**:
- Shopping list is shared
- Owner is logged in
- Active sharing link exists

**Test Steps**:
1. Navigate to shared shopping list
2. Open action wheel menu
3. Select "Make Private" option
4. Attempt to access list using previously shared link

**Expected Results**:
- "Make Private" action succeeds
- Previously shared link becomes invalid
- Users with link can no longer access the list
- Confirmation message displayed

**Priority**: High

---

### Test Case 5: Share List via Context Menu
**Objective**: Verify sharing functionality through context menu

**Preconditions**:
- User has shopping lists
- User is logged in

**Test Steps**:
1. Locate shopping list in lists overview
2. Open context menu (three dots)
3. Select "Share" option
4. Complete sharing process

**Expected Results**:
- Context menu contains "Share" option
- Share dialog opens correctly
- Sharing process functions identical to main share button

**Priority**: Medium

---

### Test Case 6: Multiple Share Link Generation
**Objective**: Verify behavior when generating multiple share links

**Preconditions**:
- Shopping list exists
- Owner has sharing permissions

**Test Steps**:
1. Share list and copy link
2. Close share dialog
3. Reshare same list
4. Generate new link

**Expected Results**:
- Previous link remains valid
- New link is generated
- Both links provide access to same list
- No conflicts between multiple active share links

**Priority**: Medium

---

### Test Case 7: Edge Case - Empty Shared List
**Objective**: Verify sharing behavior for empty shopping lists

**Preconditions**:
- Empty shopping list exists
- User has sharing permissions

**Test Steps**:
1. Create empty shopping list
2. Attempt to share empty list
3. Access shared empty list

**Expected Results**:
- Sharing functionality works for empty lists
- Appropriate empty state message displayed
- No errors occur

**Priority**: Low

## Notes
- All sharing operations should be logged for audit purposes
- Share links should be secure and randomly generated
- Consider testing across different browsers and devices
- Integration with notification system should be tested if implemented
- Consider testing concurrent access scenarios