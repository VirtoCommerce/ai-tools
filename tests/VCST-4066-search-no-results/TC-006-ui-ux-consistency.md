# Test Case: TC-006 - UI/UX Consistency Validation

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-006 |
| **Test Case Name** | UI/UX Consistency Validation Across All Pages |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P2 - High |
| **Test Type** | UI/UX |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that the "no results" page design, layout, and user experience are consistent across all pages where the feature is implemented. Ensure compliance with Figma design specifications.

## Preconditions
1. User is logged into VirtoStart Demo Store
2. All local search pages are accessible (Back in Stock, Quotes, Orders, Company Members)
3. Figma design reference is available
4. Test environment: https://vcst-qa-storefront.govirto.com

## Design Reference
**Figma**: https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/STOREFRONT-DRAFT-PART-3?node-id=1036-193810

## Test Steps - Visual Consistency

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to Back in Stock page and trigger no results | Observe and document the no results layout |
| 2 | Take screenshot of the no results page | Screenshot captured for reference |
| 3 | Navigate to Quotes page and trigger no results | Observe and document the no results layout |
| 4 | Take screenshot of the no results page | Screenshot captured for reference |
| 5 | Navigate to Orders page and trigger no results | Observe and document the no results layout |
| 6 | Take screenshot of the no results page | Screenshot captured for reference |
| 7 | Navigate to Company Members and trigger no results | Observe and document the no results layout |
| 8 | Take screenshot of the no results page | Screenshot captured for reference |
| 9 | Compare all screenshots side by side | Identify any visual inconsistencies |

## Visual Elements Checklist

### Message Text
| Element | Expected | Back in Stock | Quotes | Orders | Members |
|---------|----------|---------------|--------|---------|---------|
| Message displayed | Yes | [ ] | [ ] | [ ] | [ ] |
| Text is clear & readable | Yes | [ ] | [ ] | [ ] | [ ] |
| Message position | Center/Top | [ ] | [ ] | [ ] | [ ] |
| Font family matches | Design spec | [ ] | [ ] | [ ] | [ ] |
| Font size matches | Design spec | [ ] | [ ] | [ ] | [ ] |
| Font weight matches | Design spec | [ ] | [ ] | [ ] | [ ] |
| Text color matches | Design spec | [ ] | [ ] | [ ] | [ ] |

### Reset Button
| Element | Expected | Back in Stock | Quotes | Orders | Members |
|---------|----------|---------------|--------|---------|---------|
| Button displayed | Yes | [ ] | [ ] | [ ] | [ ] |
| Button text | "Reset search" | [ ] | [ ] | [ ] | [ ] |
| Button style | Primary/Secondary | [ ] | [ ] | [ ] | [ ] |
| Button size | As per design | [ ] | [ ] | [ ] | [ ] |
| Button position | Below message | [ ] | [ ] | [ ] | [ ] |
| Button color | Design spec | [ ] | [ ] | [ ] | [ ] |
| Hover state | Proper feedback | [ ] | [ ] | [ ] | [ ] |
| Click state | Proper feedback | [ ] | [ ] | [ ] | [ ] |

### Layout & Spacing
| Element | Expected | Back in Stock | Quotes | Orders | Members |
|---------|----------|---------------|--------|---------|---------|
| Container alignment | Center | [ ] | [ ] | [ ] | [ ] |
| Top margin/padding | Consistent | [ ] | [ ] | [ ] | [ ] |
| Bottom margin/padding | Consistent | [ ] | [ ] | [ ] | [ ] |
| Message to button spacing | Consistent | [ ] | [ ] | [ ] | [ ] |
| Page header visible | Yes | [ ] | [ ] | [ ] | [ ] |
| Page footer visible | Yes | [ ] | [ ] | [ ] | [ ] |
| Search field visible | Yes | [ ] | [ ] | [ ] | [ ] |

### Icons & Graphics (if applicable)
| Element | Expected | Back in Stock | Quotes | Orders | Members |
|---------|----------|---------------|--------|---------|---------|
| Icon displayed | If per design | [ ] | [ ] | [ ] | [ ] |
| Icon size | As per design | [ ] | [ ] | [ ] | [ ] |
| Icon color | As per design | [ ] | [ ] | [ ] | [ ] |
| Icon position | As per design | [ ] | [ ] | [ ] | [ ] |

## Test Steps - Functional Consistency

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 10 | On each page, verify reset button functionality | Reset works consistently on all pages |
| 11 | On each page, verify search field is cleared after reset | Search field clears consistently |
| 12 | On each page, verify full list is restored after reset | List restoration works consistently |
| 13 | On each page, verify no page refresh occurs | Smooth transition on all pages |
| 14 | On each page, test keyboard navigation (Tab, Enter) | Keyboard navigation works consistently |

## Test Steps - Design Compliance

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 15 | Open Figma design specification | Design reference is accessible |
| 16 | Compare message text with design | Text matches Figma specifications |
| 17 | Compare button style with design | Button matches Figma specifications |
| 18 | Compare spacing/layout with design | Layout matches Figma specifications |
| 19 | Compare colors with design (use color picker) | Colors match Figma specifications |
| 20 | Verify all typography (font, size, weight) | Typography matches Figma specifications |

## Accessibility Validation

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 21 | Test color contrast ratio (message text) | Meets WCAG AA standards (4.5:1) |
| 22 | Test color contrast ratio (button) | Meets WCAG AA standards (3:1) |
| 23 | Test with screen reader (NVDA/JAWS) | Message and button are announced properly |
| 24 | Test keyboard-only navigation | All interactive elements are accessible |
| 25 | Test focus indicators | Focus states are visible and clear |
| 26 | Verify ARIA labels (if applicable) | Proper ARIA attributes are present |

## Expected Results

### Visual Consistency
- All pages use the same message text (or contextually appropriate variations)
- Reset button style, size, and color are identical across pages
- Layout and spacing are consistent across all implementations
- Typography (font family, size, weight, color) is uniform

### Functional Consistency
- Reset button behavior is identical on all pages
- Search field clearing works the same way everywhere
- List restoration happens smoothly without page refresh
- Keyboard navigation works consistently

### Design Compliance
- Implementation matches Figma design specifications
- Colors, fonts, and spacing match the design system
- No deviations from approved designs

### Accessibility
- WCAG AA compliance for color contrast
- Screen reader compatibility
- Keyboard navigation support
- Proper focus management

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach comparison screenshots and design reference here_

## Inconsistencies Found
_Document any visual or functional inconsistencies discovered_

| Page | Inconsistency | Severity | Notes |
|------|---------------|----------|-------|
| | | | |

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)
- [ ] Safari (macOS)

## Related Test Cases
- TC-001: Back in Stock - No Results
- TC-002: Quotes - No Results
- TC-003: Orders - No Results
- TC-004: Company Members - No Results
- TC-008: Responsive Design Validation

