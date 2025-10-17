# VCST-4066 Test Documentation

## Overview

This directory contains comprehensive test documentation for the **Search No Results** feature (VCST-4066), which provides users with a "Reset search" option when search queries return no results across multiple pages in the VirtoStart application.

## Feature Description

**Jira Ticket**: [VCST-4066 - Search - Back in stock - Unlock user if there is an empty search page](https://virtocommerce.atlassian.net/browse/VCST-4066)

**Summary**: When users search and get no results, they should see a clear "no results found" message with a "Reset search" button that returns them to the full list.

**Applicable Pages**:
1. Back in Stock List - `/account/back-in-stock`
2. Quotes - `/account/quotes`
3. Orders (All Orders & My Orders) - `/account/orders`
4. Company Members - `/company/members`
5. Global Search - Any page (blocked by VCST-3991)

## Documentation Structure

```
VCST-4066-search-no-results/
├── README.md                                      # This file
├── test-plan.md                                   # Comprehensive test plan
├── TC-001-back-in-stock-no-results.md            # Back in Stock test case
├── TC-002-quotes-no-results.md                   # Quotes test case
├── TC-003-orders-no-results.md                   # Orders test case
├── TC-004-company-members-no-results.md          # Company Members test case
├── TC-005-global-search-no-results.md            # Global Search test case (blocked)
├── TC-006-ui-ux-consistency.md                   # UI/UX consistency validation
├── TC-007-cross-browser-compatibility.md         # Cross-browser testing
├── TC-008-responsive-design.md                   # Responsive design validation
├── TC-009-search-valid-results.md                # Positive testing (regression)
├── TC-010-edge-cases-special-characters.md       # Edge cases and security
└── VCST-4066-test-cases.csv                      # TestRail import file
```

## Test Cases Summary

| Test Case ID | Test Case Name | Priority | Type | Estimate |
|--------------|----------------|----------|------|----------|
| TC-001 | Back in Stock - No Results Display and Reset | P1 | Functional | 15m |
| TC-002 | Quotes - No Results Display and Reset | P1 | Functional | 15m |
| TC-003 | Orders - No Results Display and Reset | P1 | Functional | 20m |
| TC-004 | Company Members - No Results Display and Reset | P1 | Functional | 15m |
| TC-005 | Global Search - No Results Display and Reset | P2 | Functional | 20m |
| TC-006 | UI/UX Consistency Validation | P2 | UI/UX | 30m |
| TC-007 | Cross-Browser Compatibility | P3 | Compatibility | 45m |
| TC-008 | Responsive Design Validation | P3 | UI/UX | 40m |
| TC-009 | Search with Valid Results | P1 | Functional | 20m |
| TC-010 | Edge Cases and Special Characters | P4 | Functional | 30m |
| TC-011 | Search with Filters - No Products Found | P2 | Functional | 25m |

**Total Estimated Time**: ~4.5 hours

## How to Use This Documentation

### For Test Execution

1. **Read the Test Plan**: Start with `test-plan.md` to understand the overall testing strategy, scope, and approach.

2. **Execute Priority 1 Tests First**: Focus on critical functional tests (TC-001 through TC-004, TC-009).

3. **Follow Test Steps**: Each test case file contains detailed step-by-step instructions with expected results.

4. **Document Results**: Use the checkboxes and sections provided in each test case to record:
   - Actual results
   - Status (Pass/Fail/Blocked/Not Executed)
   - Screenshots/evidence
   - Any defects found

5. **Log Defects**: If bugs are found, create Jira tickets and link them in the test case documentation.

### For TestRail Import

1. Open TestRail and navigate to your test project
2. Go to Test Cases section
3. Click "Import" and select "CSV"
4. Upload `VCST-4066-test-cases.csv`
5. Map the columns according to TestRail's import wizard
6. Verify all test cases are imported correctly

### For Test Reporting

After execution, compile results into a test summary report including:
- Total test cases executed
- Pass/Fail/Blocked counts
- Test coverage percentage
- Critical defects found
- Recommendations

## Test Environment

- **Application**: VirtoStart Demo Store
- **URL**: https://vcst-qa-storefront.govirto.com
- **Design Reference**: [Figma Design](https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/STOREFRONT-DRAFT-PART-3?node-id=1036-193810)

## Prerequisites

Before starting test execution, ensure:

1. **Access**: You have valid credentials for VirtoStart Demo Store
2. **Test Data**: The following data exists in the system:
   - At least 2-3 products in Back in Stock list
   - At least 2-3 quotes
   - At least 2-3 orders
   - Company membership with multiple members
3. **Browsers**: Access to Chrome, Firefox, Edge, Safari (as needed)
4. **Devices**: Access to desktop, tablet, and mobile devices (or browser DevTools)

## Test Execution Order

### Phase 1: Core Functionality (Priority 1)
Execute TC-001 through TC-004 and TC-009 to validate core functionality.

### Phase 2: Design & Consistency (Priority 2)
Execute TC-006 to ensure UI/UX consistency across all pages.

### Phase 3: Compatibility (Priority 3)
Execute TC-007 and TC-008 for cross-browser and responsive testing.

### Phase 4: Edge Cases (Priority 4)
Execute TC-010 for edge cases and security validation.

## Known Issues & Blockers

- **TC-005 (Global Search)**: Currently **BLOCKED** by [VCST-3991](https://virtocommerce.atlassian.net/browse/VCST-3991) which is on hold with Highest priority.

## Related Tickets

- **VCST-3991**: [Search] No results page - On Hold
- **VCST-3994**: Update search inputs placeholder-text - Done
- **VCDZ-741**: Get more search results if filters applied - In Progress

## Contact Information

For questions or clarifications about this test documentation:
- **Product Owner**: Alla Volkova
- **Developer**: Alexander Kurilin
- **Designer**: Elena Mutykova

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-15 | Test Team | Initial test documentation creation |

---

**Last Updated**: October 15, 2025

