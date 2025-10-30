# Test Cases for VCST-3772: [Shared lists] [E2E] Anyone with read only access

## User Story Details
- **Jira Key**: VCST-3772
- **Summary**: [Shared lists] [E2E] Anyone with read only access
- **Priority**: Medium
- **Status**: Done
- **Created**: 8/14/2025

## Description
As a user I want to be able to share any of my shopping lists to anyone and provide read only access.

**SHARE SCENARIO**
Shopping List Owner:
A customer opens a shopping list and clicks Share button. A customer can initiate sharing from the context menu. Share menu option opens the popup like this: Anyone → Apply. The link and copy btn appear in the popup (design tbd)

**READ SCENARIO**
Anyone:
Opens the provided by shopping list owner URL. Reads the content. Secure link, no anonymous access to catalog if disabled. Full access to site features if this anyone is registered user (but the URL is still read only)

**Acceptance**: These read only lists can be shown for the registered users in their lists list. BUT: There shall be no possibility to add a product in this list or manage the list. For future: extend with copy function.

**TERMINATE ACCESS SCENARIO**
Shopping list owner: Action wheel options: Edit, Share, Make Private, Delete. Make private → Link access is terminated for everyone (including this org users).

---

## Test Cases

### Test Case 1: Verify Shopping List Owner Can Generate Shareable Link with Read-Only Access
**Objective**: Validate that a shopping list owner can successfully share a shopping list and generate a read-only shareable link via the Share button and context menu.

**Preconditions**:
- User is registered and logged in to the Virto Commerce storefront
- User has created at least one shopping list with products (https://docs.virtocommerce.org/user-docs/shopping-cart/)
- Shopping list contains at least 2-3 products with different properties

**Test Steps**:
1. Navigate to the shopping lists page
2. Open an existing shopping list with products
3. Click the "Share" button on the shopping list detail page
4. In the Share popup, select "Anyone" option from the dropdown/selection
5. Click "Apply" button
6. Verify that a shareable link is generated and displayed in the popup
7. Click the "Copy" button to copy the link to clipboard
8. Navigate back to the shopping list and access the context menu (three dots/action wheel)
9. Select "Share" option from the context menu
10. Verify the same share popup appears with the previously generated link

**Expected Results**:
- Share button is visible and clickable on the shopping list detail page
- Share popup opens with "Anyone" option available
- After clicking Apply, a unique shareable URL is generated
- Copy button is visible and functional
- The same share functionality is accessible via context menu
- The generated link remains consistent across both access methods
- Link format includes a secure token/identifier for read-only access

**Test Data**: 
- Test shopping list name: "Q4 Office Supplies"
- Products: 3 items with various quantities and prices

**Priority**: High

---

### Test Case 2: Verify Anonymous User Can Access Shared List with Read-Only Permissions
**Objective**: Validate that an anonymous user (not logged in) can open a shared shopping list link and view its contents without editing capabilities.

**Preconditions**:
- A registered user has created and shared a shopping list with "Anyone" access
- Shareable link has been generated and copied
- Catalog access for anonymous users is enabled in the system (https://docs.virtocommerce.org/platform/dev-docs/security/)
- Test browser is in incognito/private mode or logged out state

**Test Steps**:
1. Open a new incognito/private browser window
2. Paste the shared shopping list URL into the address bar
3. Press Enter to navigate to the shared list
4. Verify the shopping list loads with all products visible
5. Attempt to view product details by clicking on individual products
6. Look for "Add to Cart" or "Edit List" buttons
7. Attempt to modify quantities of products (if any controls are visible)
8. Attempt to remove products from the list (if any controls are visible)
9. Check if the context menu/action wheel is visible
10. Verify read-only indicator or messaging is displayed

**Expected Results**:
- Shopping list page loads successfully without login requirement
- All products in the list are visible with their properties (name, SKU, quantity, price)
- Product details can be viewed
- No "Add to Cart", "Edit", "Delete", or "Remove" buttons are available
- Quantity fields are disabled or not editable
- Context menu/action wheel is either hidden or shows no edit/delete options
- Clear visual indication that the list is in read-only mode
- Anonymous user cannot modify any aspect of the shared list

**Test Data**: 
- Shared list URL: [Generated from Test Case 1]
- Expected products count: 3 items

**Priority**: High

---

### Test Case 3: Verify Registered User Can View Shared List with Read-Only Access in Their Lists
**Objective**: Validate that a registered user who accesses a shared list can see it in their shopping lists overview with read-only restrictions, while maintaining full access to their own site features.

**Preconditions**:
- User A (owner) has created and shared a shopping list with "Anyone" access
- User B is a different registered user, logged into the storefront
- User B has access to the shareable link generated by User A
- User B has their own shopping lists created (https://docs.virtocommerce.org/user-docs/shopping-cart/)

**Test Steps**:
1. Login as User B (not the list owner)
2. Open the shared list URL provided by User A
3. Verify the shared list content is displayed
4. Navigate to the shopping lists overview page
5. Verify the shared list appears in User B's lists
6. Check for visual indicators distinguishing shared lists from owned lists
7. Attempt to add a product to the shared list
8. Attempt to edit the shared list name or description
9. Attempt to delete the shared list
10. Navigate to catalog and add a product to User B's own shopping list
11. Verify User B can still perform all normal operations on their own lists
12. Return to the shared list and confirm it remains read-only

**Expected Results**:
- Shared list is visible in User B's shopping lists overview
- Shared list has a visual indicator (icon, label, or badge) showing it's shared/read-only
- User B cannot add products to the shared list
- User B cannot edit shared list properties (name, description)
- User B cannot delete the shared list
- "Add to List" or similar buttons are disabled for the shared list
- User B maintains full access to their own shopping lists
- User B can create, edit, and delete their own lists normally
- Catalog browsing and other site features remain fully accessible
- Shared list shows owner information (User A's name/identifier)

**Test Data**: 
- User A credentials: owner@test.com
- User B credentials: viewer@test.com
- Shared list name: "Marketing Team Supplies"

**Priority**: High

---

### Test Case 4: Verify Shopping List Owner Can Terminate Access by Making List Private
**Objective**: Validate that a shopping list owner can revoke shared access by using the "Make Private" option, rendering all previously shared links invalid.

**Preconditions**:
- User is logged in as the shopping list owner
- Shopping list has been shared with "Anyone" access
- Shareable link has been distributed and is currently accessible
- Another user/browser session has the shared link open (for verification)

**Test Steps**:
1. Login as the shopping list owner
2. Navigate to the shopping lists page
3. Locate the shared shopping list
4. Click on the context menu/action wheel for the shared list
5. Verify available options: Edit, Share, Make Private, Delete
6. Select "Make Private" option
7. Confirm the action if a confirmation dialog appears
8. Verify the list status changes to private
9. In a separate browser/incognito window, attempt to access the previously shared link
10. Return to the owner's view and attempt to re-share the list
11. Verify a new link is generated (different from the previous one)

**Expected Results**:
- Context menu displays all four options: Edit, Share, Make Private, Delete
- "Make Private" option is clearly labeled and clickable
- After selecting "Make Private", confirmation is requested (if applicable)
- List status indicator changes from "Shared" to "Private"
- Previously shared link returns error or "Access Denied" message when accessed
- Error message is user-friendly (e.g., "This list is no longer shared" or "Access has been revoked")
- All users (including organization users) lose access to the previous link
- Owner can still access their own list normally
- Owner can re-share the list, generating a new unique link
- Previous link remains permanently invalid even after re-sharing

**Test Data**: 
- Original shared link: [From previous test]
- Expected error message: "This shopping list is no longer available" or similar

**Priority**: High

---

### Test Case 5: Verify Anonymous User Cannot Access Shared List When Catalog Access is Disabled
**Objective**: Validate that anonymous users cannot access shared shopping lists via direct link when anonymous catalog access is disabled in system configuration.

**Preconditions**:
- Shopping list has been shared with "Anyone" access
- Shareable link has been generated
- System configuration has anonymous catalog access disabled (https://docs.virtocommerce.org/platform/dev-docs/security/)
- User is not logged in (anonymous session)

**Test Steps**:
1. Ensure anonymous catalog access is disabled in Virto Commerce platform settings
2. Open an incognito/private browser window
3. Paste the shared shopping list URL into the address bar
4. Press Enter to navigate to the link
5. Observe the system response and any redirect behavior
6. Check if login page is displayed
7. Attempt to login with valid credentials
8. After successful login, verify if the shared list is accessible
9. Logout and attempt to access the link again
10. Document the security behavior and messaging

**Expected Results**:
- Anonymous user is redirected to login page when accessing shared link
- Appropriate security message is displayed (e.g., "Please login to view this content")
- No shopping list content is exposed before authentication
- After login, user can access the shared list with read-only permissions
- Security mechanism prevents unauthorized catalog access
- Link remains valid but requires authentication
- After logout, link again requires login
- No bypass methods exist to view content anonymously

**Test Data**: 
- System configuration: Anonymous access = Disabled
- Test credentials: registered-user@test.com / Password123
- Shared list URL: [From previous test]

**Priority**: High

---

## Notes
- All test cases should be executed in multiple browsers (Chrome, Firefox, Safari, Edge) to ensure cross-browser compatibility
- Related documentation: 
  - Shopping Cart/Lists: https://docs.virtocommerce.org/user-docs/shopping-cart/
  - Security Configuration: https://docs.virtocommerce.org/platform/dev-docs/security/
- Future enhancement: Copy function for shared lists (not in current scope)
- Verify that shared list URLs use secure tokens and cannot be easily guessed or enumerated
- Performance testing should verify that shared lists load within acceptable timeframes (< 3 seconds)
- Consider testing with lists containing various product counts (1, 10, 50, 100+ items)
- Dependency: This feature requires proper authentication and authorization module configuration in Virto Commerce platform