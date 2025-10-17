# Test Case: TC-001 - Back in Stock - No Results Display and Reset

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-001 |
| **Test Case Name** | Back in Stock - No Results Display and Reset |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that when a user searches for items on the Back in Stock page and no results are found, the system displays a clear "no results" message with a "Reset search" button that restores the full list.

## Preconditions
1. User is logged into VirtoStart Demo Store
2. User has access to the Back in Stock page
3. User has at least one item in the Back in Stock list
4. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Valid search term**: [Existing product name in back in stock list]
- **Invalid search term**: "xyznonexistentproduct123"
- **URL**: `/account/back-in-stock`

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa-storefront.govirto.com/account/back-in-stock | Back in Stock page loads successfully |
| 2 | Verify that the search input field is visible | Search input field is displayed on the page |
| 3 | Verify that products are listed (if any exist) | Full list of back in stock items is displayed |
| 4 | Enter a valid product name in the search field | Search field accepts input |
| 5 | Observe the search results | Products matching the search term are displayed |
| 6 | Clear the search field and enter "xyznonexistentproduct123" | Search field accepts the invalid search term |
| 7 | Press Enter or wait for search to execute | Search executes and processes the query |
| 8 | Observe the page content | "No results found" message is displayed |
| 9 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 10 | Verify the message text matches design specs | Message text is clear and user-friendly |
| 11 | Click the "Reset search" button | Button responds to click action |
| 12 | Observe the page after reset | Full list of back in stock items is restored |
| 13 | Verify the search field is cleared | Search field is empty after reset |

## Expected Results

### Visual Elements
- **No Results Message**: Clear, user-friendly message indicating no results were found
- **Reset Button**: Prominent "Reset search" button is displayed
- **Layout**: Page maintains proper layout and styling
- **Design Consistency**: Matches Figma design specifications

### Functional Behavior
- Search executes for non-existent terms without errors
- No results page is non-blocking (user can interact with UI)
- Reset button clears the search and restores the full list
- Search field is cleared after reset
- No page refresh is required (smooth transition)

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots/videos here_

## Notes/Comments
_Add any additional observations or issues encountered_

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)
- [ ] Safari (macOS)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

## Related Test Cases
- TC-002: Quotes - No Results
- TC-003: Orders - No Results
- TC-004: Company Members - No Results
- TC-006: UI/UX Consistency Validation

