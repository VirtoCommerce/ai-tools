# Test Plan: VCST-4623 - Change VcBadge Size in Facets

## Ticket Information
- **JIRA Ticket:** [VCST-4623](https://virtocommerce.atlassian.net/browse/VCST-4623)
- **GitHub PR:** [#2180](https://github.com/VirtoCommerce/vc-frontend/pull/2180)
- **Type:** Task
- **Status:** Ready for test
- **Assignee:** Anatolii Vasilev
- **Created:** 2026-02-12
- **QA Lead:** QA Lead Orchestrator
- **Test Start Date:** 2026-02-18

## Summary
Change the badge size in catalog facets from `sm` (small) to `xs` (extra-small) for better visual hierarchy and design consistency.

## Scope

### In Scope
1. VcBadge component size changes in facet filters
2. VcBadge component size changes in category selector
3. Visual regression testing
4. Accessibility compliance (WCAG 2.1 AA)
5. Responsive behavior validation
6. Cross-browser compatibility

### Out of Scope
- Backend API changes (none in this PR)
- Other badge usages outside facets/category selector
- New functionality (visual change only)

## Changed Files
1. `client-app/shared/catalog/components/facet-filter.vue` - 2 badge size changes
2. `client-app/shared/catalog/components/category-selector.vue` - 1 badge size change

## Code Changes
```diff
- size="sm"
+ size="xs"
```

## Test Environments
- **Primary:** QA environment (Coffee theme)
- **URL:** From `FRONT_URL` in .env
- **PR Artifact:** https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.42.0-pr-2180-fb9b-fb9b1e98.zip

## Test Strategy

### Phase 1: Visual & Accessibility Testing (ui-ux-expert)
**Owner:** ui-ux-expert
**Estimated Time:** 2 hours

**Objectives:**
- Verify visual correctness of badge size reduction
- Ensure WCAG 2.1 AA accessibility compliance
- Validate component rendering across viewports

**Test Areas:**
1. Visual comparison against design screenshot
2. Badge readability at xs size
3. Color contrast ratios (outline variant)
4. Touch target size compliance (44x44px minimum for iOS)
5. Screen reader compatibility
6. Responsive behavior (desktop, tablet, mobile)
7. Storybook component testing (if available)

**Deliverables:**
- Visual regression screenshots
- Accessibility audit report
- Readability assessment

### Phase 2: Functional Testing (qa-frontend-expert)
**Owner:** qa-frontend-expert
**Estimated Time:** 3 hours

**Objectives:**
- Validate badge functionality in catalog facets
- Validate badge functionality in category selector
- Ensure no regressions in surrounding UI
- Cross-browser compatibility

**Test Areas:**
1. Facet filter badge display and counts
2. Category selector badge display and counts
3. Badge interaction (clickable areas)
4. Count variations (1-9, 10-99, 100+)
5. Dynamic padding behavior
6. Cross-browser testing (Chrome, Firefox, Edge)
7. Responsive testing (desktop, tablet, mobile)
8. Regression check for other badge usages

**Deliverables:**
- Functional test execution report
- Cross-browser compatibility matrix
- Screenshots by device/browser
- Bug reports (if issues found)

### Phase 3: Consolidation & Sign-off (qa-lead)
**Owner:** qa-lead (orchestrator)
**Estimated Time:** 1 hour

**Objectives:**
- Review all test results
- Make approval decision
- Update JIRA ticket
- Comment on GitHub PR

**Deliverables:**
- Consolidated test report
- JIRA status update
- GitHub PR review comment

## Acceptance Criteria
- [ ] Badge size in facet filters changed to `xs`
- [ ] Badge size in category selector changed to `xs`
- [ ] Visual appearance matches design screenshot
- [ ] Badge counts display correctly
- [ ] No visual regressions in surrounding UI
- [ ] WCAG 2.1 AA accessibility compliance maintained
- [ ] Badges readable at xs size (desktop and mobile)
- [ ] Touch targets meet minimum size guidelines
- [ ] Cross-browser compatibility confirmed (Chrome, Firefox, Edge)
- [ ] Responsive behavior maintained across viewports

## Test Data Requirements
- Catalog with multiple facet types (color, size, brand, price)
- Categories with varying item counts (single, double, triple digits)
- Products with multiple filter options applied

## Risks & Mitigation

### Risk 1: Badge Readability
**Concern:** xs size may be too small for easy reading
**Mitigation:** Test across devices, verify against design system specs
**Severity:** Medium

### Risk 2: Touch Target Size
**Concern:** Smaller badges may not meet 44x44px minimum touch target
**Mitigation:** Measure actual touch targets, consider padding
**Severity:** Medium

### Risk 3: Visual Regression
**Concern:** Change may affect other badge usages unintentionally
**Mitigation:** Full visual regression check across catalog pages
**Severity:** Low

## Browser & Device Matrix

### Desktop (Last 2 Versions)
| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | Pending |
| Firefox | Latest | Pending |
| Edge | Latest | Pending |

### Mobile
| Device | Browser | Status |
|--------|---------|--------|
| iPhone (375x667) | Safari | Pending |
| Android (360x640) | Chrome | Pending |

### Viewports
- Desktop: 1920x1080, 1366x768
- Tablet: 768x1024
- Mobile: 375x667, 360x640

## Timeline
- **Test Plan Creation:** 2026-02-18 (1 hour)
- **Phase 1 - Visual/Accessibility Testing:** 2026-02-18 (2 hours)
- **Phase 2 - Functional Testing:** 2026-02-18 (3 hours)
- **Phase 3 - Consolidation:** 2026-02-18 (1 hour)
- **Total Estimated Time:** 7 hours

## Exit Criteria
- All acceptance criteria met
- No critical or high severity bugs found
- Accessibility compliance verified
- All test phases completed
- JIRA ticket updated
- GitHub PR reviewed

## Success Criteria
This testing effort is considered successful when:
1. All test cases executed and documented
2. Visual changes match design intent
3. No functional regressions introduced
4. Accessibility standards maintained
5. QA approval provided on GitHub PR
6. JIRA ticket transitioned to "Tested" status
