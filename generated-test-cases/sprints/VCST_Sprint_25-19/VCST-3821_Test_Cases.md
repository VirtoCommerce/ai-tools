# Test Cases for VCST-3821: [UI-kit] Update VcModal - new sizes

## User Story Details
- **Jira Key**: VCST-3821
- **Summary**: [UI-kit] Update VcModal - new sizes
- **Priority**: Medium
- **Status**: Done
- **Created**: 8/25/2025

## Description
No description provided

---

## Test Cases

### Test Case 1: Verify Default Modal Size
**Objective**: Verify that the modal component displays correctly with default size settings

**Preconditions**:
- VcModal component is imported and available in the application
- Developer has access to [Virto Commerce Platform UI](https://docs.virtocommerce.org/platform-ui/configuration/)

**Test Steps**:
1. Create a new instance of VcModal without specifying size property
2. Open the modal using trigger action
3. Verify modal dimensions
4. Check modal responsiveness on different screen sizes

**Expected Results**:
- Modal should display with default size settings
- Modal should be centered on the screen
- Content should be properly contained within the modal
- Modal should be responsive on different screen sizes

**Priority**: High

---

### Test Case 2: Verify Small Modal Size
**Objective**: Validate the small size configuration of VcModal

**Preconditions**:
- VcModal component is imported
- Size property is set to 'small'

**Test Steps**:
1. Set modal size property to 'small'
2. Open the modal
3. Measure modal dimensions
4. Compare against design specifications
5. Test content overflow handling

**Expected Results**:
- Modal should display with small size dimensions
- Content should be properly scaled
- Scrollbars should appear if content exceeds small size limits

**Priority**: Medium

---

### Test Case 3: Verify Large Modal Size
**Objective**: Validate the large size configuration of VcModal

**Preconditions**:
- VcModal component is imported
- Size property is set to 'large'

**Test Steps**:
1. Set modal size property to 'large'
2. Open the modal
3. Verify modal dimensions
4. Test with different content lengths
5. Check modal positioning

**Expected Results**:
- Modal should display with large size dimensions
- Modal should maintain proper spacing from screen edges
- Content should be properly formatted within large size constraints

**Priority**: Medium

---

### Test Case 4: Modal Size Transition
**Objective**: Verify smooth transition when changing modal sizes dynamically

**Preconditions**:
- Modal component is mounted
- Size property can be modified dynamically

**Test Steps**:
1. Open modal with initial size
2. Change size property during runtime
3. Observe transition effect
4. Test multiple size changes in succession

**Expected Results**:
- Size transition should be smooth and animated
- Content should adjust without visual artifacts
- Modal should maintain proper positioning during transition

**Priority**: Medium

---

### Test Case 5: Modal Size with Custom Content
**Objective**: Verify modal size behavior with various content types

**Preconditions**:
- Modal component is configured
- Different content types available (text, images, forms)

**Test Steps**:
1. Load modal with text content
2. Test with image content
3. Test with form elements
4. Test with mixed content types
5. Verify size consistency

**Expected Results**:
- Modal should maintain specified size regardless of content type
- Content should be properly formatted and displayed
- Scrollbars should appear when needed

**Priority**: High

---

### Test Case 6: Modal Size on Different Devices (Edge Case)
**Objective**: Verify modal size behavior across different devices and orientations

**Preconditions**:
- Access to various devices or device emulators
- Different screen sizes and resolutions available

**Test Steps**:
1. Test modal on desktop
2. Test on tablet devices
3. Test on mobile devices
4. Test in different orientations
5. Verify size adaptability

**Expected Results**:
- Modal should adapt appropriately to device screen size
- Content should remain accessible and readable
- No layout breaking or overflow issues

**Priority**: High

---

## Notes
- Modal sizes should follow UI-kit design specifications
- Consider accessibility requirements for different modal sizes
- Test with real content scenarios for accurate results
- Verify integration with existing modal implementations

Related Documentation:
- [Platform UI Guidelines](https://docs.virtocommerce.org/platform-ui/configuration/)
- [UI Components](https://docs.virtocommerce.org/platform-ui/components/)