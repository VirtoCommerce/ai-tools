# GraphQL WhiteLabeling & PageContext Test Cases

## Overview

This directory contains comprehensive GraphQL API test cases for two critical Virto Commerce xAPI queries:

1. **whiteLabelingSettings** - Organization-specific branding configuration query
2. **pageContext** - Unified storefront context query (consolidates 4 queries into 1)

## Files

| File | Description | Test Cases |
|------|-------------|------------|
| `test-cases.md` | Detailed test specifications with GraphQL queries, steps, and expected results | 50 total (25 per query) |
| `testrail-import.csv` | TestRail-compatible CSV for importing test cases | 50 rows |

## Test Coverage Summary

### Total Test Cases: 50
- **whiteLabelingSettings Query**: 25 test cases (WL-GQL-001 through WL-GQL-025)
- **pageContext Query**: 25 test cases (PC-GQL-001 through PC-GQL-025)

### Coverage by Type
| Type | Count | Percentage |
|------|-------|------------|
| Functional | 34 | 68% |
| Negative | 8 | 16% |
| Performance | 3 | 6% |
| Security | 3 | 6% |
| Regression | 2 | 4% |

### Coverage by Priority
| Priority | Count | Percentage |
|----------|-------|------------|
| Critical | 18 | 36% |
| High | 26 | 52% |
| Medium | 6 | 12% |

## Key Features Tested

### whiteLabelingSettings Query
- Basic query with all required parameters (organizationId, storeId)
- Full branding configuration (logo, secondaryLogo, favicon, theme, footer, mainMenu)
- Empty/null branding fallback behavior
- Optional parameters (cultureName, userId)
- **mainMenuLinks field** with hierarchical structure and priority ordering (VCST-4637)
- Error handling (missing params, invalid organizationId, non-existent link lists)
- Organization isolation (no cross-contamination)
- Performance (response time < 500ms)
- Localization (cultureName parameter)
- Authentication/authorization
- Concurrent query handling

### pageContext Query
- Unified query returning 4 sub-objects in single response:
  1. **slugInfo** - Slug resolution (permalink → entity ID)
  2. **store** - Store data
  3. **whiteLabelingSettings** - Organization branding (includes mainMenuLinks)
  4. **user** - User context
- Performance optimization (50-70% faster than 4 separate queries)
- Authenticated vs anonymous user handling
- Organization switching (dynamic branding updates)
- Multi-page support (product, category, CMS, Page Builder pages)
- Domain-based store resolution
- Language prefix handling in permalinks (/pl/qa1 vs /qa1)
- Error handling (missing required params, invalid storeId/domain)

## Test Environment

### Configuration
- **Backend URL:** `${BACK_URL}` (from .env)
- **GraphQL Endpoint:** `${BACK_URL}/graphql`
- **Default Store ID:** B2B-store
- **Test Organizations:** test-org-001, branded-org-001, no-branding-org, multilang-org, org-a, org-b
- **Test Domains:** qa.virtocommerce.com, store-a.virtocommerce.com, store-b.virtocommerce.com

### Test Data Requirements
- Organizations with varying branding configurations (full, partial, none)
- Link lists for footer and main menu (with hierarchical structure)
- Localized content (EN and PL cultures)
- Test users (user-123) and anonymous users
- Multiple page types (homepage, product, category, CMS, Page Builder)

## VCST-4637: Main Menu Links Feature

The test suite includes extensive coverage of the new `mainMenuLinks` field introduced in VCST-4637:

### Key Test Cases
- **WL-GQL-016**: Verify mainMenuLinks hierarchical structure with priority
- **WL-GQL-017**: Verify mainMenuLinks when MainMenuLinkListName is NULL
- **WL-GQL-018**: Verify mainMenuLinks with non-existent link list name
- **WL-GQL-019**: Organization isolation (no cross-contamination)
- **PC-GQL-006**: Verify whiteLabelingSettings includes mainMenuLinks in pageContext
- **PC-GQL-025**: Verify all 4 sub-objects returned (including mainMenuLinks)

### mainMenuLinks Structure
```graphql
mainMenuLinks {
  title        # Link text
  url          # Link target
  priority     # Integer for ordering
  childItems {
    title
    url
    priority
  }
}
```

## Execution Strategy

### Priority-Based Execution
1. **Critical (P0)** - 18 test cases
   - Basic query functionality
   - Full branding configuration
   - Organization isolation
   - pageContext consolidation
   - mainMenuLinks integration

2. **High (P1)** - 26 test cases
   - Error handling
   - Optional parameters
   - Hierarchical structures
   - Performance tests
   - Localization

3. **Medium (P2)** - 6 test cases
   - Edge cases
   - Secondary features
   - Additional validations

### Recommended Test Suites
1. **Smoke Test** (5-10 test cases, ~15 minutes)
   - WL-GQL-001, WL-GQL-002, WL-GQL-016, PC-GQL-001, PC-GQL-005, PC-GQL-006, PC-GQL-025

2. **Full Regression** (50 test cases, ~3 hours)
   - All test cases in sequence

3. **Performance Test** (3 test cases, ~20 minutes)
   - WL-GQL-020, PC-GQL-018

4. **Security Test** (3 test cases, ~15 minutes)
   - WL-GQL-019, WL-GQL-021

## Automation Recommendations

### High Priority for Automation (Critical P0/P1)
- WL-GQL-001: Basic whiteLabelingSettings query
- WL-GQL-002: Query with full branding
- WL-GQL-016: mainMenuLinks hierarchical structure
- WL-GQL-019: Organization isolation
- PC-GQL-001: Basic pageContext query
- PC-GQL-005: whiteLabelingSettings embedded in pageContext
- PC-GQL-006: mainMenuLinks in pageContext
- PC-GQL-022: pageContext with both organizationId and userId
- PC-GQL-025: All 4 sub-objects returned

### Medium Priority for Automation
- Error handling test cases (WL-GQL-004 through WL-GQL-006, PC-GQL-014 through PC-GQL-017)
- Performance tests (WL-GQL-020, PC-GQL-018)
- Localization tests (WL-GQL-007, PC-GQL-011)

### Target Automation Coverage
- **Q1 2026 Goal:** 60% automation (30 test cases automated)
- **Current Status:** 0% (all manual)

## Related Documentation

### Virto Commerce Docs
- [WhiteLabeling Settings Query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/White-labeling/queries/whiteLabelingSettings.md)
- [PageContext Query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/xFrontend/PageContext.md)

### JIRA Tickets
- VCST-4637: Main Menu Links Feature (PR #21)
- C384970: White Labeling Widget
- C384971: Upload Custom Logo
- C384972: Upload Favicon
- C385320, C385321: Thumbnail Job for Favicons
- C385322, C385323: Footer Links (Parent + Children)
- C385324: Footer Links in GraphQL Query

### Related Test Suites
- `regression/suites/Backend/15-graphql-xapi-tests.csv` - General GraphQL xAPI tests
- `regression/suites/Backend/32-whitelabeling-tests.csv` - Admin UI and storefront whitelabeling tests (40 test cases)

## Test Execution Notes

### Manual Testing
1. Use GraphQL playground at `${BACK_URL}/graphql`
2. Copy query from test case
3. Replace placeholders with actual test data (organizationId, storeId, etc.)
4. Execute query and verify response matches expected result
5. Document pass/fail status and any deviations

### Automated Testing
1. Use Postman collections or Playwright with GraphQL API calls
2. Parameterize queries with test data sets
3. Assert response structure and field values
4. Measure response times for performance tests
5. Generate execution reports

### Common Issues
- **Missing test data:** Ensure organizations and link lists are configured before testing
- **Null vs empty array:** Some fields may return null vs [] depending on implementation - both are acceptable
- **Performance variability:** Response times may vary based on database size and system load - run multiple iterations
- **Localization:** Ensure link lists have translations configured for cultureName tests
- **Cache:** Clear GraphQL response cache between tests to avoid stale data

## Changelog

### Version 1.0 (2026-02-17)
- Initial creation of comprehensive GraphQL test suite
- 50 test cases covering whiteLabelingSettings and pageContext queries
- Focus on VCST-4637 mainMenuLinks field integration
- TestRail import CSV included
