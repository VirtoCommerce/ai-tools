# Test Cases for VCST-3784: Preview page in Page Builder leads to 404 error

## User Story Details
- **Jira Key**: VCST-3784
- **Summary**: Preview page in Page Builder leads to 404 error
- **Priority**: Medium
- **Status**: To do
- **Created**: 8/15/2025

## Description
As a Content Editor, I want to be able to preview a newly created page in Page Builder. However, when I click the Preview button after saving, I am redirected to a 404 page instead of seeing the preview.
Also
Preview area should not be interactive, now the top header is interactive.
Also
Adjust Copy to clipboard icon for each edit block mode

---

## Test Cases

### Test Case 1: Preview New Page - Happy Path
**Objective**: Verify that a newly created page can be previewed successfully in Page Builder

**Preconditions**:
- User has Content Editor role permissions [Reference: https://docs.virtocommerce.org/user-guide/configuration-guide/users/]
- User is logged into the platform
- Page Builder module is installed and configured [Reference: https://docs.virtocommerce.org/user-guide/content-management/]

**Test Steps**:
1. Navigate to Content Management > Pages
2. Create a new page with basic content
3. Save the page
4. Click the Preview button

**Expected Results**:
- Preview opens in a new tab/window
- Page content is displayed correctly
- No 404 error is shown
- Preview URL matches the expected format

**Test Data**: 
- Page title: "Test Page"
- Basic HTML content

**Priority**: High

---

### Test Case 2: Preview Area Interactivity Check
**Objective**: Verify that the preview area is non-interactive

**Preconditions**:
- Existing page in preview mode
- Page contains interactive elements (links, buttons, header)

**Test Steps**:
1. Open page in preview mode
2. Attempt to click links in the header
3. Try to interact with navigation elements
4. Test all clickable elements in the preview

**Expected Results**:
- All interactive elements should be disabled
- No navigation occurs when clicking links
- Header remains non-interactive
- Preview maintains static display state

**Priority**: Medium

---

### Test Case 3: Copy to Clipboard Functionality
**Objective**: Verify the copy to clipboard icon works correctly in different edit block modes

**Preconditions**:
- User is in Page Builder
- Multiple edit blocks are available
- Different edit modes are accessible

**Test Steps**:
1. Switch between different edit block modes (HTML, Markdown, etc.)
2. Locate copy to clipboard icon in each mode
3. Click copy icon in each mode
4. Paste copied content in external editor

**Expected Results**:
- Copy icon is properly aligned in each mode
- Copy functionality works in all edit modes
- Copied content matches source content
- Visual feedback is provided when copying

**Priority**: Medium

---

### Test Case 4: Preview After Content Update
**Objective**: Verify preview functionality after making changes to existing content

**Preconditions**:
- Existing page with content
- User has edit permissions

**Test Steps**:
1. Open existing page in editor
2. Make content changes
3. Save changes
4. Click preview before saving
5. Save and click preview again

**Expected Results**:
- Preview shows warning if trying to preview unsaved changes
- After saving, preview shows updated content
- No 404 error occurs
- Changes are reflected accurately in preview

**Priority**: High

---

### Test Case 5: Preview with Special Characters
**Objective**: Verify preview works with pages containing special characters in title/URL

**Preconditions**:
- Ability to create pages with special characters

**Test Steps**:
1. Create page with special characters in title (é, ñ, etc.)
2. Save page
3. Preview page
4. Check URL encoding

**Expected Results**:
- Preview loads correctly
- URL is properly encoded
- Special characters display correctly
- No 404 error occurs

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Preview with Empty Content
**Objective**: Verify preview behavior with empty or minimal content

**Test Steps**:
1. Create page with no content
2. Create page with only whitespace
3. Preview both cases

**Expected Results**:
- System handles empty content gracefully
- Appropriate message or empty preview shown
- No system errors occur

**Priority**: Low

### Test Case 7: Preview Under Heavy Load
**Objective**: Verify preview functionality under system stress

**Test Steps**:
1. Create multiple preview requests simultaneously
2. Preview large content pages
3. Monitor system response

**Expected Results**:
- Preview loads within acceptable time
- No system crashes or timeouts
- Multiple preview windows handle correctly

**Priority**: Medium

---

## Notes
- Testing should be performed across different browsers
- Mobile preview functionality should be verified if applicable
- Integration with content delivery network should be verified
- Performance metrics should be captured for preview loading times