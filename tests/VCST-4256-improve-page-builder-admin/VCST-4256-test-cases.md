# VCST-4256 Page Builder Admin - Test Cases

## Overview
Comprehensive test cases for the Page Builder Admin UX improvements covering navigation menu counters, page blade functionality, status transitions, badge combinations, and grid view badges.

**Total Test Cases: 80**

---

## Section 1: Navigation Menu - Counters (TC-001 to TC-006)

| ID | Title | Priority |
|----|-------|----------|
| TC-001 | Verify Draft menu item displays counter | High |
| TC-002 | Verify Pending menu item displays counter | High |
| TC-003 | Verify Active menu item displays counter | High |
| TC-004 | Verify Archived menu item displays counter | High |
| TC-005 | Verify All Pages menu item displays total counter | High |
| TC-006 | Verify counters update when page status changes | Medium |

---

## Section 2: Navigation Menu - Filtering (TC-007 to TC-011)

| ID | Title | Priority |
|----|-------|----------|
| TC-007 | Verify Draft filter shows only draft pages | High |
| TC-008 | Verify Pending filter shows only scheduled pages | High |
| TC-009 | Verify Active filter shows only published pages | High |
| TC-010 | Verify Archived filter shows only archived pages | High |
| TC-011 | Verify All Pages shows all pages | High |

---

## Section 3: Page Blade - Field Grouping (TC-012 to TC-016)

| ID | Title | Priority |
|----|-------|----------|
| TC-012 | Verify fields are grouped into Basic and Advanced sections | High |
| TC-013 | Verify Basic information section contains Name field | High |
| TC-014 | Verify Basic information section contains Permalink field | High |
| TC-015 | Verify domain is displayed in read-only mode for permalink | High |
| TC-016 | Verify Basic information section contains Language dropdown | High |

---

## Section 4: Page Blade - Scheduling (TC-017 to TC-020)

| ID | Title | Priority |
|----|-------|----------|
| TC-017 | Verify Scheduling section is collapsed by default | High |
| TC-018 | Verify Scheduling section can be expanded | High |
| TC-019 | Verify Start date datepicker in Scheduling section | Medium |
| TC-020 | Verify End date datepicker in Scheduling section | Medium |

---

## Section 5: Page Blade - Personalization (TC-021 to TC-025)

| ID | Title | Priority |
|----|-------|----------|
| TC-021 | Verify Personalization section is collapsed by default | High |
| TC-022 | Verify Personalization section can be expanded | High |
| TC-023 | Verify Visibility toggle in Personalization section | High |
| TC-024 | Verify User groups dropdown in Personalization section | Medium |
| TC-025 | Verify Organization dropdown in Personalization section | Medium |

---

## Section 6: Page Blade - Actions (TC-026 to TC-028)

| ID | Title | Priority |
|----|-------|----------|
| TC-026 | Verify Save button on page blade | High |
| TC-027 | Verify Archive button on page blade | Medium |
| TC-028 | Verify Open designer button on page blade | High |

---

## Section 7: Grid View - Status Badges (TC-029 to TC-033)

| ID | Title | Priority |
|----|-------|----------|
| TC-029 | Verify Draft status badge in grid view | High |
| TC-030 | Verify Published status badge in grid view | High |
| TC-031 | Verify Archived status badge in grid view | High |
| TC-032 | Verify Scheduled badge in grid view | High |
| TC-033 | Verify Personalized badge in grid view | High |

---

## Section 8: Grid View - Structure (TC-034 to TC-038)

| ID | Title | Priority |
|----|-------|----------|
| TC-034 | Verify grid columns display correctly | High |
| TC-035 | Verify page row is clickable | High |
| TC-036 | Verify checkbox selection on page rows | Medium |
| TC-037 | Verify bulk selection checkbox | Medium |
| TC-038 | Verify Totals counter at bottom | Medium |

---

## Section 9: Page Management (TC-039 to TC-042)

| ID | Title | Priority |
|----|-------|----------|
| TC-039 | Verify Add button creates new page | High |
| TC-040 | Verify Archive button functionality | High |
| TC-041 | Verify Refresh button updates page list | Medium |
| TC-042 | Verify Search functionality | Medium |

---

## Section 10: Authentication (TC-043 to TC-046)

| ID | Title | Priority |
|----|-------|----------|
| TC-043 | Verify login with valid credentials | High |
| TC-044 | Verify login button disabled without credentials | Medium |
| TC-045 | Verify Azure AD login option | Low |
| TC-046 | Verify Google login option | Low |

---

## Section 11: User Interface (TC-047 to TC-048)

| ID | Title | Priority |
|----|-------|----------|
| TC-047 | Verify admin user profile display | Low |
| TC-048 | Verify logo display | Low |

---

## Section 12: Cross-Browser Compatibility (TC-049 to TC-052)

| ID | Title | Priority |
|----|-------|----------|
| TC-049 | Cross-browser - Chrome compatibility | High |
| TC-050 | Cross-browser - Edge compatibility | High |
| TC-051 | Cross-browser - Firefox compatibility | High |
| TC-052 | Cross-browser - Safari compatibility | Medium |

---

## Section 13: Status Transitions (TC-053 to TC-057)

| ID | Title | Priority |
|----|-------|----------|
| TC-053 | Verify Draft to Published status transition | High |
| TC-054 | Verify Published to Archived status transition | High |
| TC-055 | Verify Draft to Archived status transition | High |
| TC-056 | Verify Publish button appears for Draft pages | High |
| TC-057 | Verify Publish button not visible for Archived pages | Medium |

---

## Section 14: Badge Styling (TC-058 to TC-062)

| ID | Title | Priority |
|----|-------|----------|
| TC-058 | Verify Draft badge color styling | Medium |
| TC-059 | Verify Published badge color styling | Medium |
| TC-060 | Verify Archived badge color styling | Medium |
| TC-061 | Verify Scheduled badge color styling | Medium |
| TC-062 | Verify Personalized badge color styling | Medium |

---

## Section 15: Badge Combinations (TC-063 to TC-067)

| ID | Title | Priority |
|----|-------|----------|
| TC-063 | Verify Published + Scheduled badge combination | High |
| TC-064 | Verify Published + Personalized badge combination | High |
| TC-065 | Verify Published + Scheduled + Personalized triple badge | High |
| TC-066 | Verify Draft + Personalized badge combination | Medium |
| TC-067 | Verify Archived + Personalized badge combination | Medium |

---

## Section 16: Status Display in Page Blade (TC-068 to TC-071)

| ID | Title | Priority |
|----|-------|----------|
| TC-068 | Verify Draft status label in page blade header | High |
| TC-069 | Verify Published status label in page blade header | High |
| TC-070 | Verify Archived status label in page blade header | High |
| TC-071 | Verify status changes after Publish action | High |

---

## Section 17: Badge Visibility by Filter (TC-072 to TC-076)

| ID | Title | Priority |
|----|-------|----------|
| TC-072 | Verify badge is visible in Draft filter view | Medium |
| TC-073 | Verify badge is visible in Active filter view | Medium |
| TC-074 | Verify badge is visible in Archived filter view | Medium |
| TC-075 | Verify badge is visible in Pending filter view | Medium |
| TC-076 | Verify new unsaved page has no status badge | Medium |

---

## Section 18: Badge Updates (TC-077 to TC-079)

| ID | Title | Priority |
|----|-------|----------|
| TC-077 | Verify badge updates after save | Medium |
| TC-078 | Verify Scheduled badge appears after setting dates | Medium |
| TC-079 | Verify Personalized badge appears after setting visibility | Medium |

---

## Section 19: Badge Display Consistency (TC-080)

| ID | Title | Priority |
|----|-------|----------|
| TC-080 | Verify multiple pages with same status in grid | Medium |

---

## Test Case Distribution Summary

| Category | Count | High | Medium | Low |
|----------|-------|------|--------|-----|
| Navigation Menu - Counters | 6 | 5 | 1 | 0 |
| Navigation Menu - Filtering | 5 | 5 | 0 | 0 |
| Page Blade - Field Grouping | 5 | 5 | 0 | 0 |
| Page Blade - Scheduling | 4 | 2 | 2 | 0 |
| Page Blade - Personalization | 5 | 3 | 2 | 0 |
| Page Blade - Actions | 3 | 2 | 1 | 0 |
| Grid View - Status Badges | 5 | 5 | 0 | 0 |
| Grid View - Structure | 5 | 2 | 3 | 0 |
| Page Management | 4 | 2 | 2 | 0 |
| Authentication | 4 | 1 | 1 | 2 |
| User Interface | 2 | 0 | 0 | 2 |
| Cross-Browser | 4 | 3 | 1 | 0 |
| Status Transitions | 5 | 4 | 1 | 0 |
| Badge Styling | 5 | 0 | 5 | 0 |
| Badge Combinations | 5 | 3 | 2 | 0 |
| Status Display in Page Blade | 4 | 4 | 0 | 0 |
| Badge Visibility by Filter | 5 | 0 | 5 | 0 |
| Badge Updates | 3 | 0 | 3 | 0 |
| Badge Display Consistency | 1 | 0 | 1 | 0 |
| **Total** | **80** | **46** | **30** | **4** |

---

## New Test Cases Added (28 total)

### Status Transitions (5 TCs)
- Covers status workflow: Draft → Published → Archived
- Validates Publish button visibility based on current status

### Badge Styling (5 TCs)
- Verifies distinct color styling for each badge type
- Ensures visual differentiation between statuses

### Badge Combinations (5 TCs)
- Tests all possible badge combinations:
  - Published + Scheduled
  - Published + Personalized
  - Published + Scheduled + Personalized (triple)
  - Draft + Personalized
  - Archived + Personalized

### Status Display in Page Blade (4 TCs)
- Verifies status label in page blade header for each status
- Validates status update after publish action

### Badge Visibility by Filter (5 TCs)
- Tests badge display across all navigation filters
- Edge case: new unsaved page has no badge

### Badge Updates (3 TCs)
- Validates badge appears after saving
- Tests dynamic badge updates after configuration changes

### Badge Display Consistency (1 TC)
- Ensures consistent styling across multiple pages with same status

---

## TestRail Import Instructions

1. Navigate to TestRail > Test Cases
2. Click "Import" button
3. Select "CSV Import"
4. Upload file: `VCST-4256-test-cases-testrail.csv`
5. Map columns:
   - Title → Title
   - Section → Section (with hierarchy)
   - Priority → Priority
   - Preconditions → Preconditions
   - Steps → Steps
   - Expected Result → Expected
   - Type → Type
6. Click "Import"

---

*Updated: January 7, 2026*
