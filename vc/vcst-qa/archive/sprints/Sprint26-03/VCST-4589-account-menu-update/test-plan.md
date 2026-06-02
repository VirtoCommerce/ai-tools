# Test Plan: VCST-4589 - Account Left Rail Menu Update

## Test Information

| Field | Value |
|-------|-------|
| **JIRA Ticket** | [VCST-4589](https://virtocommerce.atlassian.net/browse/VCST-4589) |
| **GitHub PR** | [#2179](https://github.com/VirtoCommerce/vc-frontend/pull/2179) |
| **Sprint** | VCST Sprint 26-03 |
| **Priority** | High (P2) |
| **Story Points** | 2 |
| **Test Environment** | QA |
| **Test Lead** | qa-lead-orchestrator |
| **Test Start Date** | 2026-02-18 |
| **Expected Completion** | 2026-02-19 |

## Feature Overview

### User Story
As a user I want to see the organized view of the menu in my account so I know what is where.

### Design Reference
Figma: https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-3?node-id=2538-230213&p=f&t=sEQr6Opn4CBuHGGF-0

### Changes Summary
- Account left rail menu reorganized from flat structure to grouped structure
- New "purchasing" menu group introduced
- Menu items re-ordered and re-categorized
- Icons and titles updated
- Configuration file: `client-app/config/menu.json` (103 additions, 82 deletions)

### Acceptance Criteria
1. Menu displays organized view with clear categorization
2. Users can easily identify and navigate to account sections
3. Coupons and promotions excluded (moved to VCST-4590)

## Test Scope

### In Scope
- Account left rail menu structure and organization
- Menu item grouping (e.g., "purchasing" group)
- Navigation routes for all menu items
- Menu item icons and titles
- Menu item ordering and priorities
- Visual design alignment with Figma mockup
- Desktop browser compatibility (Chrome, Firefox, Edge)
- Mobile menu behavior (iPhone/Android viewports, touch interactions, navigation)
- Keyboard navigation and accessibility

### Out of Scope
- Coupons and promotions functionality (VCST-4590)
- Backend API changes (no API modifications)
- Admin SPA (frontend-only change)
- Content within account pages (only navigation testing)

## Test Strategy

### Phase 1: Test Planning
**Owner:** test-management-specialist
**Duration:** 2 hours

**Activities:**
1. Analyze Figma design in detail
2. Document baseline menu structure (before changes)
3. Document target menu structure (after changes)
4. Write comprehensive test cases covering:
   - Menu structure verification
   - Navigation functionality
   - Visual design compliance
   - Accessibility requirements
5. Create TestRail import CSV

**Deliverables:**
- `test-cases.md` - Detailed test case specifications
- `testrail-import.csv` - TestRail import format
- Baseline vs target menu structure documentation

### Phase 2: Functional Testing
**Owner:** qa-frontend-expert
**Duration:** 4-6 hours

**Activities:**
1. Deploy PR artifact to test environment
   - Artifact URL: https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.42.0-pr-2179-9d33-9d3334d1.zip
2. Verify menu structure and grouping
3. Test all navigation routes:
   - Dashboard
   - Orders
   - Profile
   - All other menu items
4. Verify menu item ordering
5. Test active/selected state highlighting
6. Cross-browser testing (Chrome, Firefox, Edge)
7. Document any deviations from expected behavior

**Deliverables:**
- Functional test execution results
- Screenshots of menu on each browser
- Bug reports (if issues found)

### Phase 3: UX/Visual Validation
**Owner:** ui-ux-expert
**Duration:** 2-3 hours

**Activities:**
1. Pixel-perfect comparison with Figma design
2. Verify menu styling:
   - Spacing and layout
   - Typography (font sizes, weights)
   - Colors and contrast
   - Icons (correct icons, proper sizing)
3. Accessibility audit:
   - Keyboard navigation (Tab, Enter, Arrow keys)
   - Screen reader compatibility
   - ARIA labels and roles
   - Focus indicators
   - Color contrast ratios (WCAG 2.1 AA)
4. UX evaluation:
   - Menu intuitiveness
   - Clear categorization
   - Easy navigation

**Deliverables:**
- Figma vs implementation comparison screenshots
- Accessibility audit report
- UX evaluation notes

### Phase 4: Consolidation & Sign-off
**Owner:** qa-lead-orchestrator
**Duration:** 1 hour

**Activities:**
1. Collect all test results from specialists
2. Review all findings and evidence
3. Create consolidated test execution report
4. Update JIRA ticket with results
5. Make approval decision:
   - Approve (if all tests pass)
   - Approve with minor issues (if non-blocking issues)
   - Request changes (if blocking issues found)

**Deliverables:**
- `test-execution-report.md` - Consolidated test results
- JIRA ticket updated with status and findings
- GitHub PR comment with QA sign-off

## Test Environment

| Resource | URL/Details |
|----------|-------------|
| **Frontend (QA)** | From `.env` - `FRONT_URL` |
| **Test User** | From `.env` - `USER_EMAIL` / `USER_PASSWORD` |
| **PR Artifact** | https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.42.0-pr-2179-9d33-9d3334d1.zip |
| **Browsers** | Chrome (latest), Firefox (latest), Edge (latest) |

## Test Data Requirements

| Data Type | Details |
|-----------|---------|
| **Test User** | Authenticated user with account access |
| **Account State** | User must have active orders, profile data |
| **Organizations** | If multi-org supported, test with multiple orgs |

## Test Cases Overview

Test cases will be organized into the following categories:

1. **Menu Structure** (5-8 test cases)
   - Verify menu grouping structure
   - Verify menu item hierarchy
   - Verify menu item counts

2. **Navigation Functionality** (10-15 test cases)
   - Test each menu item navigation
   - Verify correct page loads
   - Verify active state highlighting
   - Verify breadcrumb updates

3. **Visual Design** (8-10 test cases)
   - Icons verification
   - Typography verification
   - Spacing and layout
   - Color scheme

4. **Accessibility** (5-7 test cases)
   - Keyboard navigation
   - Screen reader compatibility
   - Focus management
   - ARIA attributes

5. **Cross-Browser** (3 test cases)
   - Chrome compatibility
   - Firefox compatibility
   - Edge compatibility

**Total Estimated Test Cases:** 31-43

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Limited Acceptance Criteria** | Medium | Use Figma design as detailed specification |
| **Menu Configuration Change** | High | Test all menu items thoroughly, verify no broken routes |
| **Cross-Browser Issues** | Low | Test on all major desktop browsers |
| **Accessibility Regression** | Medium | Run comprehensive WCAG audit |
| **User Confusion** | Low | Evaluate menu intuitiveness in UX phase |

## Success Criteria

Testing will be considered successful if:

1. All menu items display correctly with proper icons and titles
2. All navigation routes work without errors
3. Menu structure matches Figma design
4. No accessibility violations (WCAG 2.1 AA)
5. Consistent behavior across Chrome, Firefox, Edge
6. No critical or high-severity bugs found
7. User experience is intuitive and organized

## Exit Criteria

QA sign-off will be provided when:

1. All test cases executed
2. All critical and high bugs resolved and re-tested
3. Accessibility audit passed
4. Design approval from ui-ux-expert
5. Consolidated test execution report completed
6. JIRA ticket updated with final status

## Team Assignments

| Role | Agent | Responsibilities |
|------|-------|------------------|
| **QA Lead** | qa-lead-orchestrator | Coordinate testing, consolidate results, make approval decision |
| **Test Management** | test-management-specialist | Write test cases, create TestRail CSV, track coverage |
| **Functional Testing** | qa-frontend-expert | Execute navigation tests, cross-browser testing, functional validation |
| **UX/Visual QA** | ui-ux-expert | Figma comparison, accessibility audit, design validation |

## Communication Plan

- **Daily Status Updates:** Posted to JIRA ticket
- **Blockers:** Escalated immediately to developer (Anatolii Vasilev) or Product Owner
- **Final Sign-off:** Posted to both JIRA and GitHub PR

## References

- JIRA Ticket: https://virtocommerce.atlassian.net/browse/VCST-4589
- GitHub PR: https://github.com/VirtoCommerce/vc-frontend/pull/2179
- Figma Design: https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-3?node-id=2538-230213&p=f&t=sEQr6Opn4CBuHGGF-0
- Related Ticket (Future): VCST-4590 (Coupons and promotions)

---

**Document Status:** Ready for execution
**Created:** 2026-02-18
**Last Updated:** 2026-02-18
