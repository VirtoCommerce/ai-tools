# Test Case: TC-003 - Orders - No Results Display and Reset

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-003 |
| **Test Case Name** | Orders - No Results Display and Reset (All Orders & My Orders) |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that when a user searches for orders on the Orders page (both "All orders" and "My orders" tabs) and no results are found, the system displays a clear "no results" message with a "Reset search" button that restores the full list.

## Preconditions
1. User is logged into VirtoStart Demo Store
2. User has access to the Orders page
3. User has at least one order in the system
4. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Valid search term**: [Existing order number or product name]
- **Invalid search term**: "ORDER999999XYZ"
- **URL**: `/account/orders`

## Test Steps - All Orders Tab

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa-storefront.govirto.com/account/orders | Orders page loads successfully |
| 2 | Verify "All orders" tab is selected by default | "All orders" tab is active |
| 3 | Verify that the search input field is visible | Search input field is displayed on the page |
| 4 | Verify that orders are listed (if any exist) | Full list of all orders is displayed |
| 5 | Enter a valid order number in the search field | Search field accepts input |
| 6 | Observe the search results | Orders matching the search term are displayed |
| 7 | Clear the search field and enter "ORDER999999XYZ" | Search field accepts the invalid search term |
| 8 | Press Enter or wait for search to execute | Search executes and processes the query |
| 9 | Observe the page content | "No results found" message is displayed |
| 10 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 11 | Verify the message text matches design specs | Message text is clear and user-friendly |
| 12 | Click the "Reset search" button | Button responds to click action |
| 13 | Observe the page after reset | Full list of all orders is restored |
| 14 | Verify the search field is cleared | Search field is empty after reset |

## Test Steps - My Orders Tab

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 15 | Click on the "My orders" tab | "My orders" tab becomes active |
| 16 | Verify that the search input field is visible | Search input field is displayed for My orders |
| 17 | Verify that user's orders are listed | Full list of user's orders is displayed |
| 18 | Enter a valid order number in the search field | Search field accepts input |
| 19 | Observe the search results | User's orders matching the search term are displayed |
| 20 | Clear the search field and enter "ORDER999999XYZ" | Search field accepts the invalid search term |
| 21 | Press Enter or wait for search to execute | Search executes and processes the query |
| 22 | Observe the page content | "No results found" message is displayed |
| 23 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 24 | Click the "Reset search" button | Button responds to click action |
| 25 | Observe the page after reset | Full list of user's orders is restored |
| 26 | Verify the search field is cleared | Search field is empty after reset |

## Test Steps - Tab Switching Behavior

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 27 | On "All orders" tab, enter a search term with no results | No results page is displayed |
| 28 | Without resetting, switch to "My orders" tab | Tab switches successfully |
| 29 | Observe the search state | Search is cleared or reset appropriately for the new tab |
| 30 | Verify proper order list display | Correct orders are displayed for the active tab |

## Expected Results

### Visual Elements
- **No Results Message**: Clear, user-friendly message indicating no results were found
- **Reset Button**: Prominent "Reset search" button is displayed
- **Layout**: Page maintains proper layout and styling on both tabs
- **Design Consistency**: Matches Figma design specifications
- **Tab Persistence**: Active tab remains selected during search operations

### Functional Behavior
- Search executes for non-existent terms without errors on both tabs
- No results page is non-blocking (user can interact with UI)
- Reset button clears the search and restores the appropriate order list
- Search field is cleared after reset
- Tab switching handles search state appropriately
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
- TC-001: Back in Stock - No Results
- TC-002: Quotes - No Results
- TC-004: Company Members - No Results
- TC-006: UI/UX Consistency Validation

