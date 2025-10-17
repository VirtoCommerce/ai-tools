# Test Case: TC-004 - Company Members - No Results Display and Reset

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-004 |
| **Test Case Name** | Company Members - No Results Display and Reset |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that when a user searches for company members on the Company Members page and no results are found, the system displays a clear "no results" message with a "Reset search" button that restores the full list.

## Preconditions
1. User is logged into VirtoStart Demo Store
2. User is part of a company with multiple members
3. User has access to the Company Members page
4. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Valid search term**: [Existing member name or email]
- **Invalid search term**: "nonexistentmember999@test.com"
- **URL**: `/company/members`

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa-storefront.govirto.com/company/members | Company Members page loads successfully |
| 2 | Verify that the search input field is visible | Search input field is displayed on the page |
| 3 | Verify that company members are listed | Full list of company members is displayed |
| 4 | Count the number of members displayed | Note the total number of members for validation |
| 5 | Enter a valid member name in the search field | Search field accepts input |
| 6 | Observe the search results | Members matching the search term are displayed |
| 7 | Clear the search field and enter "nonexistentmember999@test.com" | Search field accepts the invalid search term |
| 8 | Press Enter or wait for search to execute | Search executes and processes the query |
| 9 | Observe the page content | "No results found" message is displayed |
| 10 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 11 | Verify the message text matches design specs | Message text is clear and user-friendly |
| 12 | Verify that no member cards/rows are displayed | Only the no results message and reset button are shown |
| 13 | Click the "Reset search" button | Button responds to click action |
| 14 | Observe the page after reset | Full list of company members is restored |
| 15 | Verify the search field is cleared | Search field is empty after reset |
| 16 | Count the members displayed after reset | Same number of members as initially displayed |

## Additional Test Scenarios

### Scenario A: Search with Partial Match
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| A1 | Enter a partial name that doesn't match any member | No results page is displayed with reset button |
| A2 | Click reset | Full member list is restored |

### Scenario B: Search with Special Characters
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| B1 | Enter special characters: "!@#$%^&*()" | Search handles special characters gracefully |
| B2 | Verify behavior | Either no results page or filtered results (no errors) |
| B3 | Click reset if no results shown | Full member list is restored |

### Scenario C: Empty Search Field
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| C1 | Clear search field completely | Full member list is displayed |
| C2 | Verify reset button is not shown | Reset button only appears after no results search |

## Expected Results

### Visual Elements
- **No Results Message**: Clear, user-friendly message indicating no results were found
- **Reset Button**: Prominent "Reset search" button is displayed
- **Layout**: Page maintains proper layout and styling
- **Design Consistency**: Matches Figma design specifications
- **Member Cards/Table**: No member entries shown during no results state

### Functional Behavior
- Search executes for non-existent terms without errors
- No results page is non-blocking (user can interact with UI)
- Reset button clears the search and restores the full member list
- Search field is cleared after reset
- Member count remains consistent after reset
- No page refresh is required (smooth transition)
- Search functionality works for names, emails, and other member fields

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
- TC-003: Orders - No Results
- TC-006: UI/UX Consistency Validation
- TC-010: Edge Cases - Special Characters in Search

