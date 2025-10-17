# Test Case: TC-005 - Global Search - No Results Display and Reset

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-005 |
| **Test Case Name** | Global Search - No Results Display and Reset |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P2 - High |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Status** | Blocked |
| **Blocked By** | [VCST-3991](https://virtocommerce.atlassian.net/browse/VCST-3991) - On Hold |

## Objective
Verify that when a user performs a global search from any page and no results are found, the system displays a clear "no results" message with a "Reset search" button that allows users to clear the search and continue browsing.

## Preconditions
1. User is on VirtoStart Demo Store
2. Global search functionality is implemented (VCST-3991)
3. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Valid search term**: [Existing product, category, or content]
- **Invalid search term**: "xyzglobalnonexistent123"
- **Test pages**: Home, Category pages, Product pages

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa-storefront.govirto.com | Homepage loads successfully |
| 2 | Locate the global search input field | Global search field is visible in header/navigation |
| 3 | Enter a valid search term | Search field accepts input |
| 4 | Observe the search results | Products/content matching the search term are displayed |
| 5 | Clear the search and enter "xyzglobalnonexistent123" | Search field accepts the invalid search term |
| 6 | Press Enter or click search button | Search executes and navigates to results page |
| 7 | Observe the page content | "No results found" message is displayed |
| 8 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 9 | Verify suggested actions or alternatives (if any) | Helpful suggestions or navigation options are provided |
| 10 | Verify the message matches design specs | Message text is clear and user-friendly |
| 11 | Click the "Reset search" button | Button responds to click action |
| 12 | Observe the behavior after reset | Search is cleared and user can continue browsing |
| 13 | Verify the search field is cleared | Search field is empty after reset |

## Test Steps - Cross-Page Behavior

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 14 | Navigate to a category page | Category page loads successfully |
| 15 | Perform global search with no results term | No results page is displayed consistently |
| 16 | Navigate to a product page | Product page loads successfully |
| 17 | Perform global search with no results term | No results page is displayed consistently |
| 18 | Verify consistency across all pages | Same no results experience across all pages |

## Expected Results

### Visual Elements
- **No Results Message**: Clear, user-friendly message indicating no results were found
- **Reset Button**: Prominent "Reset search" button is displayed
- **Layout**: Page maintains proper layout and styling
- **Design Consistency**: Matches Figma design specifications and local search patterns
- **Suggestions**: Optional helpful suggestions or related content
- **Navigation**: User can easily navigate away or retry search

### Functional Behavior
- Search executes for non-existent terms without errors
- No results page is non-blocking (user can interact with UI)
- Reset button clears the global search
- Search field in header is cleared after reset
- User can continue browsing after reset
- No results page is consistent across all site pages
- No page errors or broken states

## Actual Results
_To be filled during test execution - Currently Blocked by VCST-3991_

## Status
- [ ] Pass
- [ ] Fail
- [x] Blocked
- [ ] Not Executed

**Blocking Issue**: VCST-3991 (Search - No results page) is currently On Hold with Highest priority

## Test Evidence
_Attach screenshots/videos here when test can be executed_

## Notes/Comments
This test case is blocked by VCST-3991 which is currently on hold. The global search "no results" page implementation is pending. Once VCST-3991 is completed, this test case should be executed.

Related dependency: VCDZ-741 (Get more search results if filters applied) is also in progress.

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
- TC-004: Company Members - No Results
- TC-006: UI/UX Consistency Validation

## Dependencies
- **Blocked by**: [VCST-3991](https://virtocommerce.atlassian.net/browse/VCST-3991) - Search No results page (On Hold)
- **Related**: [VCST-3994](https://virtocommerce.atlassian.net/browse/VCST-3994) - Update search inputs placeholder-text (Done)
- **Related**: [VCDZ-741](https://virtocommerce.atlassian.net/browse/VCDZ-741) - Get more search results if filters applied (In Progress)

