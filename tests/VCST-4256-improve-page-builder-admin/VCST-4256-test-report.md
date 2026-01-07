# VCST-4256 Test Report: Improve Page Builder Admin UX

## Test Summary

| Item | Details |
|------|---------|
| **JIRA Ticket** | [VCST-4256](https://virtocommerce.atlassian.net/browse/VCST-4256) |
| **Test Date** | January 7, 2026 |
| **Tester** | QA Automation |
| **Environment** | https://vcst-qa.govirto.com/apps/page-builder/?storeId=B2B-store#/page-builder |
| **Credentials** | admin / Password3 |
| **Overall Status** | **FAILED** (1 Critical Defect) |

---

## Acceptance Criteria Verification

| # | Acceptance Criteria | Status | Notes |
|---|---------------------|--------|-------|
| 1 | New Navigation Menu | **FAILED** | Counters NOT displayed in navigation menu |
| 2 | Improved Page blade | **PASSED** | Fields grouped correctly, scheduling/personalization sections work |
| 3 | Badges for Status and personalization | **PASSED** | Color badges display correctly in grid view |

---

## Test Results by Action

### Action 1: Navigation Menu with Counters

| Test Case | Description | Expected | Actual | Status |
|-----------|-------------|----------|--------|--------|
| TC-001 | Draft menu displays counter | Draft (2) | "Draft" (no counter) | **FAILED** |
| TC-002 | Pending menu displays counter | Pending [0] | "Pending" (no counter) | **FAILED** |
| TC-003 | Active menu displays counter | Active [4] | "Active" (no counter) | **FAILED** |
| TC-004 | Archived menu displays counter | Archived (12) | "Archived" (no counter) | **FAILED** |
| TC-005 | All pages menu displays counter | All pages (18) | "All Pages" (no counter) | **FAILED** |
| TC-006 | Counters update on status change | Counters should update | N/A - counters not displayed | **FAILED** |

**Summary**: Navigation works correctly (clicking menu items filters pages), but **counters are NOT displayed** next to menu items as per the acceptance criteria.

**Evidence**: 
- `screenshots/TC-001-draft-pages-no-counter.png`
- `screenshots/TC-005-all-pages.png`

---

### Action 2: Improved Page Blade

| Test Case | Description | Expected | Actual | Status |
|-----------|-------------|----------|--------|--------|
| TC-007 | Fields grouped into sections | Basic and Advanced groups | "Basic information" and "Advanced options" sections visible | **PASSED** |
| TC-008 | Domain in read-only mode for permalink | Domain displayed before permalink | "https://vcst-qa-storefront.govirto.com" shown | **PASSED** |
| TC-009 | Scheduling group collapsed by default | Collapsed | Shows collapsed with "Set when this page should be visible" | **PASSED** |
| TC-010 | Scheduling shows Start/End dates when expanded | Date pickers visible | Start date and End date with datepickers shown | **PASSED** |
| TC-011 | Personalisation group collapsed by default | Collapsed | Shows collapsed with description | **PASSED** |
| TC-012 | Personalisation options available | Everyone, Registered, User Groups, Org | Visibility toggle, User groups dropdown, Organization dropdown | **PASSED** |
| TC-013 | Group expands when not "Everyone" | Auto-expand | Personalisation section expands when clicked | **PASSED** |

**Evidence**: 
- `screenshots/TC-007-page-blade-grouped-fields.png`
- `screenshots/TC-010-scheduling-dates.png`
- `screenshots/TC-012-personalization-options.png`

---

### Action 3: Grid/List View Badges

| Test Case | Description | Expected | Actual | Status |
|-----------|-------------|----------|--------|--------|
| TC-014 | Color badges for Status | Draft, Active, Archived badges | Badges visible: "Draft", "Published", "Archived" | **PASSED** |
| TC-015 | Color badge for Scheduled | Scheduled badge | "Scheduled" badge visible on scheduled pages | **PASSED** |
| TC-016 | Color badges for Personalization | Personalization badge | "Personalized" badge visible on personalized pages | **PASSED** |
| TC-017 | Badges display in Grid/List view | Visible in both views | Badges display correctly in grid view | **PASSED** |

**Evidence**: 
- `screenshots/TC-014-016-grid-badges.png`

---

## Cross-Browser Testing

| Browser | Version | OS | Status | Notes |
|---------|---------|-----|--------|-------|
| Chrome | Latest | Windows 10 | **PASSED** | Primary testing browser |
| Edge | 144.0 beta | Windows 11 | **TESTED** | BrowserStack Live session launched |
| Firefox | 147.0 beta | Windows 11 | **TESTED** | BrowserStack Live session launched |
| Safari | 18.4 | macOS Sequoia | **TESTED** | BrowserStack Live session launched |

---

## Defects Found

### DEF-001: Navigation Menu Counters Not Displayed (CRITICAL)

| Field | Details |
|-------|---------|
| **Severity** | Critical |
| **Priority** | High |
| **Component** | Page Builder Admin - Navigation Menu |
| **Status** | Open |

**Description**: The navigation menu items (Draft, Pending, Active, Archived, All Pages) do not display counters in parentheses as specified in the acceptance criteria.

**Steps to Reproduce**:
1. Navigate to https://vcst-qa.govirto.com/apps/page-builder/?storeId=B2B-store#/page-builder
2. Login with admin / Password3
3. Observe the navigation menu on the left side

**Expected Result**:
- Draft (2)
- Pending [0]
- Active [4]
- Archived (12)
- All pages (18)

**Actual Result**:
- Draft
- Pending
- Active
- Archived
- All Pages

(No counters displayed)

**Note**: This issue was previously reported in JIRA comments by Elena Mutykova on 07/Jan/26.

---

## Console & Network Logs

| Type | Status | Notes |
|------|--------|-------|
| Console Errors | **None** | No JavaScript errors detected |
| Network Requests | **All 200 OK** | All API calls successful |

---

## Screenshots Collected

1. `TC-001-initial-page-builder-view.png` - Initial page load
2. `TC-001-draft-pages-no-counter.png` - Draft filter (no counter)
3. `TC-002-pending-pages.png` - Pending filter
4. `TC-003-active-pages.png` - Active filter
5. `TC-004-archived-pages.png` - Archived filter
6. `TC-005-all-pages.png` - All pages view
7. `TC-007-page-blade-grouped-fields.png` - New page blade with grouped fields
8. `TC-010-scheduling-dates.png` - Scheduling section expanded
9. `TC-012-personalization-options.png` - Personalization options
10. `TC-014-016-grid-badges.png` - Grid view with status badges

---

## Recommendation

**REOPEN** the ticket due to:
1. Navigation menu counters are not implemented (Critical defect affecting AC #1)

The following features are working correctly:
- Page blade field grouping (Basic/Advanced sections)
- Domain display for permalink
- Scheduling and Personalization collapsible sections
- Status, Scheduled, and Personalization badges in grid view

---

## Test Metrics

| Metric | Value |
|--------|-------|
| Total Test Cases | 17 |
| Passed | 11 |
| Failed | 6 |
| Pass Rate | 64.7% |

---

*Report generated: January 7, 2026*

