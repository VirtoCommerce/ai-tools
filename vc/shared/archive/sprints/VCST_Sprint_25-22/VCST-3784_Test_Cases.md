# Test Cases for VCST-3784: Preview page in Page Builder leads to 404 error

## User Story Details
- **Jira Key**: VCST-3784
- **Summary**: Preview page in Page Builder leads to 404 error
- **Priority**: Medium
- **Status**: To do
- **Created**: 8/15/2025

## Description
As a Content Editor, I want to be able to preview a newly created page in Page Builder. However, when I click the Preview button after saving, I am redirected to a 404 page instead of seeing the preview.

---

## Test Cases

### Test Case 1: Basic Preview Functionality for New Page
**Objective**: Verify that the preview functionality works correctly for a newly created page

**Preconditions**:
- User is logged in as Content Editor
- Page Builder is accessible
- New page has been created with basic content

**Test Steps**:
1. Navigate to Page Builder
2. Create a new page with some content
3. Save the page
4. Click the Preview button

**Expected Results**:
- Preview page should load successfully
- Content should be displayed as it would appear on the live site
- No 404 error should occur

**Test Data**: Basic page with title and body text
**Priority**: High

---

### Test Case 2: Preview Area Interactivity
**Objective**: Verify that the preview area is non-interactive

**Preconditions**:
- User is in preview mode
- Page contains various interactive elements

**Test Steps**:
1. Load preview of the page
2. Attempt to interact with the top header
3. Try clicking on any links in the content
4. Attempt to interact with any forms or buttons

**Expected Results**:
- Top header should be non-interactive
- All links should be non-clickable
- Forms and buttons should be disabled
- Preview should be view-only

**Priority**: Medium

---

### Test Case 3: Copy to Clipboard Icon Functionality
**Objective**: Verify the copy to clipboard icon works correctly in different edit block modes

**Preconditions**:
- User is in Page Builder
- Multiple edit blocks exist in different modes

**Test Steps**:
1. Navigate to a text edit block
2. Locate the copy to clipboard icon
3. Click the icon
4. Repeat for other block modes (HTML, Rich Text, etc.)

**Expected Results**:
- Copy icon should be visible and properly aligned in all block modes
- Clicking icon should copy content to clipboard
- Visual feedback should indicate successful copy
- Clipboard should contain correct content

**Priority**: Medium

---

### Test Case 4: Preview After Multiple Edits
**Objective**: Verify preview functionality after multiple page modifications

**Preconditions**:
- Existing page in Page Builder
- User has edit permissions

**Test Steps**:
1. Make multiple content changes
2. Save changes
3. Preview page
4. Return to edit mode
5. Make additional changes
6. Preview again

**Expected Results**:
- All changes should be reflected in preview
- Preview should load correctly after each edit
- No data loss between preview sessions

**Priority**: High

---

### Test Case 5: Preview with Special Characters and Media
**Objective**: Verify preview handles special content correctly

**Preconditions**:
- Page contains special characters
- Page includes media elements

**Test Steps**:
1. Add content with special characters (é, ñ, 漢字)
2. Insert images and videos
3. Save page
4. Preview page

**Expected Results**:
- Special characters should display correctly
- Media should render properly
- Layout should maintain integrity

**Priority**: Medium

---

### Test Case 6: Preview Page URL Structure
**Objective**: Verify preview URL generation and handling

**Preconditions**:
- Multiple pages exist in system
- Different URL patterns are used

**Test Steps**:
1. Create page with standard URL
2. Create page with special characters in URL
3. Create page with maximum length URL
4. Preview each page

**Expected Results**:
- Preview URLs should be correctly generated
- No 404 errors should occur
- URLs should maintain proper structure

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 7: Preview Without Saving
**Objective**: Verify system behavior when previewing unsaved changes

**Preconditions**:
- User is editing a page
- Changes have not been saved

**Test Steps**:
1. Make changes to page content
2. Without saving, click Preview
3. Return to edit mode
4. Make more changes
5. Click Preview again

**Expected Results**:
- System should prompt to save changes
- Preview should show latest saved version
- Unsaved changes should not appear in preview

**Priority**: Medium

---

### Test Case 8: Preview with Maximum Content
**Objective**: Verify preview functionality with maximum allowed content

**Preconditions**:
- Page contains maximum allowed content size
- Multiple complex elements present

**Test Steps**:
1. Create page with maximum allowed content
2. Add various content types (text, media, widgets)
3. Save page
4. Preview page

**Expected Results**:
- Preview should load without timeout
- All content should render correctly
- Performance should be acceptable

**Priority**: Medium

---

## Notes
- All tests should be executed in different browsers
- Mobile responsiveness should be verified in preview mode
- Performance metrics should be monitored during preview operations
- Related stories: Any authentication or permission-related stories