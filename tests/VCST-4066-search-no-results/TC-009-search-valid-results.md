# Test Case: TC-009 - Search with Valid Results (Positive Testing)

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-009 |
| **Test Case Name** | Search with Valid Results - Positive Testing |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that when a user searches and results are found, the normal search results are displayed correctly, and the "no results" page does not appear. This ensures the feature doesn't interfere with successful searches.

## Preconditions
1. User is logged into VirtoStart Demo Store
2. User has access to all local search pages
3. Test data exists in the system (orders, quotes, back in stock items, members)
4. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Back in Stock**: At least 2-3 products in the list
- **Quotes**: At least 2-3 quotes in the system
- **Orders**: At least 2-3 orders in the system
- **Company Members**: At least 2-3 members in the company

## Test Steps - Back in Stock Page

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to `/account/back-in-stock` | Page loads successfully |
| 2 | Note the products displayed in the list | Products are visible |
| 3 | Select a product name from the list | Product name identified |
| 4 | Enter the product name in search field | Search field accepts input |
| 5 | Execute the search | Search processes successfully |
| 6 | Observe the results | Matching product(s) are displayed |
| 7 | Verify no results message is NOT shown | Only search results are visible |
| 8 | Verify reset button is NOT shown | Reset button does not appear |
| 9 | Verify search field retains the search term | Search term remains in field |
| 10 | Clear search field | Search is cleared |
| 11 | Verify full list is restored | All products are displayed again |

## Test Steps - Quotes Page

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 12 | Navigate to `/account/quotes` | Page loads successfully |
| 13 | Note the quotes displayed in the list | Quotes are visible |
| 14 | Select a quote number or product from the list | Quote identifier identified |
| 15 | Enter the identifier in search field | Search field accepts input |
| 16 | Execute the search | Search processes successfully |
| 17 | Observe the results | Matching quote(s) are displayed |
| 18 | Verify no results message is NOT shown | Only search results are visible |
| 19 | Verify reset button is NOT shown | Reset button does not appear |
| 20 | Clear search to restore full list | Full quote list is restored |

## Test Steps - Orders Page

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 21 | Navigate to `/account/orders` | Page loads successfully |
| 22 | On "All orders" tab, note displayed orders | Orders are visible |
| 23 | Select an order number from the list | Order number identified |
| 24 | Enter the order number in search field | Search field accepts input |
| 25 | Execute the search | Search processes successfully |
| 26 | Observe the results | Matching order(s) are displayed |
| 27 | Verify no results message is NOT shown | Only search results are visible |
| 28 | Verify reset button is NOT shown | Reset button does not appear |
| 29 | Switch to "My orders" tab | Tab switches successfully |
| 30 | Repeat search with valid order number | Search works correctly on My orders tab |
| 31 | Verify results display correctly | Results are shown appropriately |

## Test Steps - Company Members Page

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 32 | Navigate to `/company/members` | Page loads successfully |
| 33 | Note the members displayed in the list | Members are visible |
| 34 | Select a member name from the list | Member name identified |
| 35 | Enter the member name in search field | Search field accepts input |
| 36 | Execute the search | Search processes successfully |
| 37 | Observe the results | Matching member(s) are displayed |
| 38 | Verify no results message is NOT shown | Only search results are visible |
| 39 | Verify reset button is NOT shown | Reset button does not appear |
| 40 | Clear search to restore full list | Full member list is restored |

## Partial Match Testing

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 41 | On any page, enter a partial search term | Partial term entered |
| 42 | Execute the search | Search processes successfully |
| 43 | Verify partial matches are found (if supported) | Relevant results displayed |
| 44 | Verify no results page does NOT appear | Only actual results or full list shown |

## Case Sensitivity Testing

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 45 | On any page, enter a search term in UPPERCASE | Search term entered |
| 46 | Execute the search | Search is case-insensitive |
| 47 | Verify results are found | Results match regardless of case |
| 48 | Repeat with lowercase | Same results are found |
| 49 | Repeat with MixedCase | Same results are found |

## Expected Results

### Search Results Display
- Matching items are displayed correctly
- Search results are relevant and accurate
- Results are properly formatted and styled
- Search term is highlighted (if feature exists)

### No Results Page Should NOT Appear
- No "no results found" message is shown when results exist
- No "Reset search" button appears for valid searches
- Normal search results view is maintained

### Search Functionality
- Search executes quickly (< 2 seconds)
- Search is case-insensitive (if designed that way)
- Partial matches work (if supported by design)
- Search field retains the search term
- Clearing search restores full list

### User Experience
- Smooth transition between full list and search results
- No page refresh required
- No errors or broken states
- Consistent behavior across all pages

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots showing successful search results_

## Notes/Comments
_Add any observations about search behavior_

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
- TC-010: Edge Cases - Special Characters in Search

## Regression Verification
This test case serves as a regression test to ensure that the new "no results" feature doesn't negatively impact normal search functionality with valid results.

