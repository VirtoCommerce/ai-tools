# Test Cases for VCST-4040: [UI-kit] Improve VcBadge a11y (check all colors and variants)

## User Story Details
- **Jira Key**: VCST-4040
- **Summary**: [UI-kit] Improve VcBadge a11y (check all colors and variants)
- **Priority**: Medium
- **Status**: Ready for test
- **Created**: 10/1/2025

## Description
Example: - see changes in VcButton component.Use Accessibility tab in storybook for testing.

---

## Test Cases

### Test Case 1: Color Contrast Verification for Default Badge
**Objective**: Verify that all badge color variants meet WCAG 2.1 AA contrast requirements

**Preconditions**:
- Storybook environment is set up
- Access to Chrome DevTools with Accessibility features
- VcBadge component is available

**Test Steps**:
1. Open Storybook and navigate to VcBadge component
2. Open Chrome DevTools and select the Accessibility tab
3. Check each default badge color variant
4. Run contrast checker for text and background colors

**Expected Results**:
- Color contrast ratio should be at least 4.5:1 for normal text
- No contrast violations reported in DevTools
- All text remains clearly visible against badge backgrounds

**Test Data**: Default badge colors (primary, secondary, success, warning, danger)
**Priority**: High

---

### Test Case 2: Screen Reader Compatibility
**Objective**: Ensure VcBadge content is properly announced by screen readers

**Preconditions**:
- Screen reader software installed (e.g., NVDA, VoiceOver)
- VcBadge component rendered with various content types

**Test Steps**:
1. Enable screen reader
2. Navigate to page containing VcBadge components
3. Tab through different badge variants
4. Listen to screen reader announcements

**Expected Results**:
- Badge content is clearly announced
- Role and state information is properly conveyed
- No content is skipped or announced incorrectly

**Test Data**: Various badge text content
**Priority**: High

---

### Test Case 3: Keyboard Navigation and Focus States
**Objective**: Verify proper keyboard navigation and focus indicators

**Preconditions**:
- VcBadge components rendered in interactive state
- Keyboard-only navigation enabled

**Test Steps**:
1. Press Tab key to navigate between interactive badges
2. Verify focus indicator visibility
3. Check focus order
4. Test interaction with Enter/Space keys if applicable

**Expected Results**:
- Focus indicator is clearly visible
- Focus order is logical
- Interactive badges respond to keyboard inputs
- Focus state meets contrast requirements

**Priority**: High

---

### Test Case 4: Badge Size Variants Accessibility
**Objective**: Verify accessibility compliance across different badge sizes

**Preconditions**:
- VcBadge component with different size variants
- Access to accessibility testing tools

**Test Steps**:
1. Render badges in all available sizes
2. Check text readability in each size
3. Verify minimum touch target sizes
4. Test with screen magnification

**Expected Results**:
- Text remains readable at all sizes
- Touch targets meet minimum size requirements (44x44px)
- No content overflow or truncation issues
- Proper scaling with screen magnification

**Test Data**: Different badge sizes (small, medium, large)
**Priority**: Medium

---

### Test Case 5: Dynamic Content Handling
**Objective**: Verify accessibility features with dynamically changing badge content

**Preconditions**:
- VcBadge component with dynamic content capability
- Test environment supporting content updates

**Test Steps**:
1. Initialize badge with initial content
2. Update badge content dynamically
3. Check screen reader announcement of changes
4. Verify contrast and readability after updates

**Expected Results**:
- Screen reader announces content updates
- Contrast ratios maintain compliance after updates
- No visual artifacts during content changes
- ARIA attributes update correctly

**Priority**: Medium

---

### Test Case 6: RTL Support
**Objective**: Verify accessibility in Right-to-Left language contexts

**Preconditions**:
- VcBadge component in RTL-enabled environment
- RTL language setting enabled

**Test Steps**:
1. Switch application to RTL mode
2. Render badges with RTL text
3. Check badge alignment and spacing
4. Verify screen reader behavior with RTL content

**Expected Results**:
- Badge layout correctly adapts to RTL
- Text alignment is appropriate for RTL
- Screen reader announces content in correct order
- Visual hierarchy maintained in RTL

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Extreme Content Lengths
**Objective**: Verify accessibility with extreme content scenarios

**Preconditions**:
- VcBadge component
- Test data with varying content lengths

**Test Steps**:
1. Test with very long text content
2. Test with single character content
3. Test with special characters
4. Verify truncation behavior

**Expected Results**:
- Proper content truncation when needed
- Maintenance of readable text size
- Screen reader handles all content correctly
- No layout breaking

**Test Data**: 
- Long string: "This is a very long badge content text"
- Single character: "1"
- Special characters: "!@#$%"

**Priority**: Low

---

## Notes
- All tests should be performed across major browsers (Chrome, Firefox, Safari)
- Test with different screen readers for comprehensive coverage
- Document any specific WCAG guidelines being verified
- Consider testing with users who rely on accessibility tools