# VCST-4351: Search Cards Feature - Manual Testing Documentation
## PR #2121: Product Card Component Refactoring

**Jira Ticket:** [VCST-4351](https://virtocommerce.atlassian.net/browse/VCST-4351)
**Pull Request:** #2121
**Feature:** Product card component refactoring for search results

---

## 📋 Documentation Overview

This folder contains comprehensive manual testing documentation for the Search Cards Feature (VCST-4351). All documentation has been created to support thorough, systematic testing while maintaining consistency and quality.

### Available Documents

| Document | Purpose | Use When |
|----------|---------|----------|
| **[test-plan](./test-plan)** | Original comprehensive test plan | Reference for overall test strategy |
| **[manual-testing-checklist.md](./manual-testing-checklist.md)** | Detailed step-by-step test cases | Executing manual tests |
| **[test-execution-tracker.csv](./test-execution-tracker.csv)** | Test result tracking spreadsheet | Recording test results |
| **[screenshot-evidence-guide.md](./screenshot-evidence-guide.md)** | Evidence collection procedures | Capturing screenshots and logs |
| **[test-data-preparation-guide.md](./test-data-preparation-guide.md)** | Test data setup instructions | Before starting tests |
| **README.md** (this file) | Documentation index and guide | Getting started |

---

## 🚀 Quick Start Guide

### Step 1: Preparation (Before Testing)

1. **Read the Test Plan**
   - Review [test-plan](./test-plan) to understand overall scope
   - Note: Section 2 (Visual Regression) is excluded from manual testing

2. **Prepare Test Data**
   - Follow [test-data-preparation-guide.md](./test-data-preparation-guide.md)
   - Create all required test products (~20 products)
   - Verify search functionality works
   - **Time Estimate:** 2-3 hours

3. **Setup Test Environment**
   - Install required browser extensions (axe DevTools, WAVE)
   - Clear browser cache and cookies
   - Set zoom to 100%
   - Create screenshot folders

4. **Review Documentation**
   - Skim [manual-testing-checklist.md](./manual-testing-checklist.md) (79 test cases)
   - Read [screenshot-evidence-guide.md](./screenshot-evidence-guide.md)
   - Open [test-execution-tracker.csv](./test-execution-tracker.csv) in Excel/Google Sheets

### Step 2: Test Execution

1. **Start Testing**
   - Open [manual-testing-checklist.md](./manual-testing-checklist.md)
   - Work through tests sequentially or by priority
   - Follow step-by-step instructions for each test

2. **Record Results**
   - Update [test-execution-tracker.csv](./test-execution-tracker.csv) after each test
   - Capture screenshots per [screenshot-evidence-guide.md](./screenshot-evidence-guide.md)
   - Document actual results in checklist

3. **Collect Evidence**
   - Take required screenshots
   - Export DevTools logs for failures
   - Save HAR files for network issues
   - Organize per naming conventions

### Step 3: Reporting

1. **Complete Test Summary**
   - Fill in "Test Summary Template" at end of checklist
   - Calculate pass/fail rates
   - Document critical issues

2. **Create Bug Reports**
   - For each failure, create JIRA bug
   - Attach evidence from screenshots folder
   - Link to test case ID

3. **Final Report**
   - Export completed tracker CSV
   - Compile all evidence
   - Prepare recommendation (approve/reject/retest)

---

## 📂 Folder Structure

```
tests/VCST-4351/
├── README.md                           # This file - Overview and guide
├── test-plan                           # Original test plan (reference)
├── manual-testing-checklist.md         # 79 detailed test cases
├── test-execution-tracker.csv          # Results tracking spreadsheet
├── screenshot-evidence-guide.md        # Evidence collection procedures
├── test-data-preparation-guide.md      # Test data setup instructions
│
├── screenshots/                        # Test evidence (create during testing)
│   ├── section-1-component-functional/
│   ├── section-3-integration/
│   ├── section-4-responsive/
│   ├── section-5-accessibility/
│   ├── section-6-cross-browser/
│   ├── section-7-performance/
│   ├── section-8-edge-cases/
│   └── section-9-regression/
│
├── evidence/                           # Additional evidence
│   ├── console-logs/
│   ├── network-logs/
│   ├── har-files/
│   ├── lighthouse-reports/
│   ├── accessibility-reports/
│   └── videos/
│
└── bugs/                              # Bug-specific evidence
    ├── BUG-001/
    └── BUG-002/
```

### Creating Folders

**Windows (PowerShell):**
```powershell
cd tests/VCST-4351/
mkdir screenshots/section-1-component-functional, screenshots/section-3-integration, screenshots/section-4-responsive, screenshots/section-5-accessibility, screenshots/section-6-cross-browser, screenshots/section-7-performance, screenshots/section-8-edge-cases, screenshots/section-9-regression, evidence/console-logs, evidence/network-logs, evidence/har-files, evidence/lighthouse-reports, evidence/accessibility-reports, evidence/videos, bugs
```

**macOS/Linux:**
```bash
cd tests/VCST-4351/
mkdir -p screenshots/{section-1-component-functional,section-3-integration,section-4-responsive,section-5-accessibility,section-6-cross-browser,section-7-performance,section-8-edge-cases,section-9-regression}
mkdir -p evidence/{console-logs,network-logs,har-files,lighthouse-reports,accessibility-reports,videos}
mkdir -p bugs
```

---

## 📊 Test Coverage Summary

### Test Sections (Section 2 Skipped)

| Section | Test Count | Priority | Est. Time |
|---------|------------|----------|-----------|
| **1. Component Functional Testing** | 17 tests | High | 2-3 hours |
| **3. Integration Testing** | 8 tests | Critical | 1-2 hours |
| **4. Responsive Design Testing** | 9 tests | High | 2-3 hours |
| **5. Accessibility Testing** | 14 tests | Critical | 3-4 hours |
| **6. Cross-Browser Testing** | 6 tests | High | 2-3 hours |
| **7. Performance Testing** | 6 tests | Medium | 1-2 hours |
| **8. Edge Cases Testing** | 11 tests | High | 2-3 hours |
| **9. Regression Testing** | 8 tests | Critical | 2-3 hours |
| **Total** | **79 tests** | | **15-23 hours** |

### Priority Breakdown

- **Critical:** 24 tests (30%)
- **High:** 31 tests (39%)
- **Medium:** 18 tests (23%)
- **Low:** 6 tests (8%)

---

## 🎯 Test Objectives

### What We're Testing

This manual test plan validates the **product card component refactoring** for search results, focusing on:

1. **List View Layout** - New grid structure and responsive breakpoints
2. **Container Queries** - Changed from xl to 2xl breakpoint (1500px)
3. **Component Integration** - Search dropdown functionality
4. **Responsive Design** - Mobile, tablet, desktop viewports
5. **Accessibility** - WCAG AA compliance, keyboard navigation
6. **Cross-Browser** - Chrome, Edge, Firefox, Safari
7. **Performance** - Render speed, layout shifts, memory
8. **Edge Cases** - Data variations, boundary conditions
9. **Regression** - Existing functionality still works

### What We're NOT Testing (Skipped)

- **Section 2: Visual Regression Testing (Storybook)** - Excluded per request
  - 12 Storybook list view stories validation
  - Storybook visual checks
  - Story-level responsive testing

---

## 🔧 Prerequisites

### Environment Access

- **Frontend:** https://vcst-qa-storefront.govirto.com
- **Admin:** https://vcst-qa.govirto.com
- **Storybook:** https://vcst-qa-storybook.govirto.com

### Credentials

**Admin:**
```
Username: admin
Password: Password1!
```

**Test User:**
```
Email: mutykovaelena@gmail.com
Password: Password2!
```

### Required Tools

**Browsers:**
- Chrome (latest)
- Edge (latest)
- Firefox (latest)
- Safari (latest) - for macOS/iOS testing

**Browser Extensions:**
- axe DevTools (accessibility testing)
- WAVE (accessibility evaluation)
- Lighthouse (built-in Chrome)
- ColorZilla (color contrast checker)

**Optional Tools:**
- Screen recording software
- Image annotation tool (for marking up screenshots)
- CSV/Excel editor (for tracker)

---

## 📝 Test Execution Workflow

### Recommended Testing Order

#### Phase 1: Critical Path (Day 1)
**Focus:** Core functionality and integration
- Section 3: Integration Testing (8 tests) - **Critical**
- Section 1: Component Functional Testing (17 tests) - **High priority tests first**
- Section 9: Regression Testing (8 tests) - **Ensure no breaking changes**

**Deliverable:** Core functionality validated ✅

#### Phase 2: Accessibility & Responsive (Day 2)
**Focus:** WCAG compliance and multi-device support
- Section 5: Accessibility Testing (14 tests) - **Critical for compliance**
- Section 4: Responsive Design Testing (9 tests) - **All viewports**

**Deliverable:** Accessibility compliance confirmed ✅

#### Phase 3: Cross-Browser & Performance (Day 3)
**Focus:** Browser compatibility and performance metrics
- Section 6: Cross-Browser Testing (6 tests) - **All major browsers**
- Section 7: Performance Testing (6 tests) - **Baseline metrics**

**Deliverable:** Browser compatibility matrix ✅

#### Phase 4: Edge Cases & Final Validation (Day 4)
**Focus:** Boundary conditions and final verification
- Section 8: Edge Cases Testing (11 tests) - **Data variations**
- **Retest:** Any failed tests from previous phases
- **Final:** Complete test summary and report

**Deliverable:** Complete test report with recommendation ✅

---

## 📈 Test Tracking

### Using the Tracker

The [test-execution-tracker.csv](./test-execution-tracker.csv) contains:

**Columns:**
- Test ID
- Section
- Test Title
- Priority
- Component
- Status (Not Started, In Progress, Completed)
- Result (Pass, Fail, Blocked, Skip)
- Tester
- Test Date
- Browser
- Browser Version
- OS
- Execution Time
- Actual Results
- Issues Found
- Bug ID
- Screenshot Path
- Notes
- Retest Required

**How to Use:**
1. Open in Excel or Google Sheets
2. Filter by Priority to tackle critical tests first
3. Update Status as you work through tests
4. Record Result (Pass/Fail) after each test
5. Add Screenshot Path for evidence
6. Link Bug IDs for failures

**Exporting Results:**
- Save as CSV for TestRail import
- Convert to XLSX for sharing
- Generate pivot tables for summary stats

---

## 🐛 Bug Reporting

### When to Create a Bug

Create a JIRA bug when:
- Test fails (Result = Fail)
- Unexpected behavior occurs
- Accessibility violation found
- Visual inconsistency detected
- Performance below threshold

### Bug Report Template

**Title Format:**
```
[VCST-4351] {Component} - {Brief description}
```

**Example:**
```
[VCST-4351] Product Card - List view padding incorrect at 2xl breakpoint
```

**Bug Report Contents:**

```markdown
## Summary
Brief description of the issue

## Test Case
- **Test ID:** TEST-4351-002
- **Test Title:** List View Padding at 2xl+ Breakpoint
- **Section:** 1.1 Product Card List View Layout

## Environment
- **Frontend URL:** https://vcst-qa-storefront.govirto.com
- **Browser:** Chrome 131.0.6778.86
- **OS:** Windows 11
- **Viewport:** 1600x900

## Steps to Reproduce
1. Set browser width to 1600px
2. Open search dropdown
3. Type "test" to show products
4. Inspect product card padding

## Expected Result
Product card should have padding of p-4 (16px) at 2xl+ breakpoint

## Actual Result
Product card has padding of p-3 (12px) at 2xl+ breakpoint

## Evidence
- Screenshot: tests/VCST-4351/screenshots/section-1-component-functional/VCST-4351-002-padding-incorrect-FAIL.png
- DevTools: tests/VCST-4351/evidence/console-logs/VCST-4351-002-console.txt

## Severity
Medium

## Priority
High

## Additional Notes
This affects visual consistency at larger breakpoints and may impact design specs.
```

### Bug Severity Guidelines

**Critical:**
- Site crash or complete feature failure
- Data loss or corruption
- Security vulnerability
- Blocker for core functionality

**High:**
- Major feature not working
- Accessibility WCAG AA violation
- Significant visual regression
- Performance degradation > 50%

**Medium:**
- Minor feature issue
- Visual inconsistency
- Minor accessibility issue
- Performance degradation 20-50%

**Low:**
- Cosmetic issue
- Edge case behavior
- Minor performance impact
- Enhancement suggestion

---

## ✅ Completion Criteria

### Definition of Done

Testing is considered complete when:

- [ ] All 79 test cases executed
- [ ] Test execution tracker fully updated
- [ ] All screenshots and evidence collected
- [ ] Bug reports created for all failures
- [ ] Test summary completed
- [ ] Final recommendation provided
- [ ] Documentation archived

### Test Success Criteria

**To recommend approval:**
- ✅ Zero critical bugs
- ✅ ≤ 2 high priority bugs (with workarounds)
- ✅ All accessibility tests pass (WCAG AA)
- ✅ Core functionality works across all browsers
- ✅ No regressions in existing features
- ✅ Performance within acceptable thresholds

**To reject:**
- ❌ Any critical bugs found
- ❌ > 3 high priority bugs
- ❌ Accessibility failures (WCAG AA violations)
- ❌ Core functionality broken
- ❌ Major regressions detected

---

## 🎓 Tips for Testers

### General Testing Tips

1. **Start Fresh**
   - Clear cache before each testing session
   - Use incognito/private mode for clean state
   - Close unnecessary browser tabs

2. **Be Systematic**
   - Follow tests in order
   - Don't skip steps
   - Record results immediately
   - Take screenshots as you go

3. **Document Everything**
   - More evidence is better than less
   - Annotate screenshots if issues not obvious
   - Copy error messages to notes
   - Record exact browser versions

4. **Think Like a User**
   - Test realistic scenarios
   - Try unexpected inputs
   - Test keyboard and mouse
   - Consider accessibility needs

5. **Stay Organized**
   - Use consistent naming conventions
   - Save files to correct folders
   - Update tracker frequently
   - Backup evidence regularly

### Common Pitfalls to Avoid

❌ **Don't:**
- Rush through tests
- Skip evidence collection
- Test without clearing cache
- Assume tests will pass
- Forget to record browser versions
- Test only happy paths
- Mix up test IDs in evidence

✅ **Do:**
- Take your time
- Capture all required evidence
- Clear cache frequently
- Test with skepticism
- Document environment details
- Test edge cases
- Follow naming conventions

---

## 📞 Support & Questions

### Getting Help

**For test plan questions:**
- Review [test-plan](./test-plan) for detailed context
- Check [manual-testing-checklist.md](./manual-testing-checklist.md) for step details

**For tool issues:**
- Browser DevTools: F1 in DevTools for help
- axe DevTools: Visit https://deque.com/axe/devtools/
- Lighthouse: Visit https://developers.google.com/web/tools/lighthouse

**For environment issues:**
- Verify environment variables: `npm run env:check`
- Check [.env](.env) configuration
- Contact development team

**For test data issues:**
- Review [test-data-preparation-guide.md](./test-data-preparation-guide.md)
- Check Admin panel for product status
- Verify search indexing is complete

---

## 📚 Additional Resources

### Official Documentation

- **JIRA Ticket:** [VCST-4351](https://virtocommerce.atlassian.net/browse/VCST-4351)
- **Pull Request:** [PR #2121](https://github.com/VirtoCommerce/project/pull/2121)
- **Storybook:** https://vcst-qa-storybook.govirto.com

### Reference Guides

- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **Container Queries:** https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Container_Queries
- **Chrome DevTools:** https://developer.chrome.com/docs/devtools/
- **Accessibility Testing:** https://www.a11yproject.com/

### Testing Standards

- **WCAG AA Compliance:** Required
- **Browser Support:** Last 2 versions of major browsers
- **Mobile Devices:** iOS Safari, Chrome Mobile
- **Performance:** LCP < 2.5s, CLS < 0.1

---

## 📊 Test Metrics & Reporting

### Key Metrics to Track

**Execution Metrics:**
- Total tests executed
- Pass rate (%)
- Fail rate (%)
- Blocked tests
- Average execution time per test

**Quality Metrics:**
- Critical bugs found
- High priority bugs found
- Total bug count
- Accessibility violations
- Performance issues

**Coverage Metrics:**
- Test coverage by component
- Test coverage by priority
- Browser coverage (%)
- Viewport coverage (%)

### Sample Test Report Template

```markdown
# Test Execution Report: VCST-4351

## Executive Summary
- **Total Tests:** 79
- **Executed:** 79 (100%)
- **Passed:** 72 (91%)
- **Failed:** 5 (6%)
- **Blocked:** 2 (3%)

## Test Results by Section
| Section | Total | Pass | Fail | Blocked |
|---------|-------|------|------|---------|
| Component Functional | 17 | 16 | 1 | 0 |
| Integration | 8 | 7 | 1 | 0 |
| Responsive | 9 | 9 | 0 | 0 |
| Accessibility | 14 | 12 | 2 | 0 |
| Cross-Browser | 6 | 6 | 0 | 0 |
| Performance | 6 | 5 | 0 | 1 |
| Edge Cases | 11 | 10 | 1 | 0 |
| Regression | 8 | 7 | 0 | 1 |

## Issues Found
- **Critical:** 0
- **High:** 2
- **Medium:** 3
- **Low:** 2

## Recommendation
[Approve with Minor Fixes / Reject / Needs Retest]

## Next Steps
1. Fix high priority bugs
2. Retest failed cases
3. Final validation
```

---

## 🔄 Versioning

**Document Version:** 1.0
**Created:** 2026-01-28
**Last Updated:** 2026-01-28
**Created By:** Claude Code Assistant
**Status:** Ready for Use

### Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-28 | Initial creation of manual testing documentation |

---

## ✨ Summary

This comprehensive manual testing documentation provides everything needed to thoroughly test the VCST-4351 Search Cards Feature. With 79 detailed test cases, step-by-step instructions, evidence collection guidelines, and test data preparation procedures, testers can systematically validate all aspects of the product card component refactoring.

**Key Features:**
- ✅ 79 detailed, step-by-step test cases
- ✅ CSV tracker for results tracking
- ✅ Comprehensive screenshot guide
- ✅ Test data preparation instructions
- ✅ Browser setup procedures
- ✅ Bug reporting templates
- ✅ Organized evidence collection

**Getting Started:**
1. Review this README
2. Follow the Quick Start Guide
3. Prepare test data
4. Execute tests systematically
5. Document and report findings

**Questions?** Review the Support & Questions section or consult the relevant guide document.

---

**Happy Testing! 🧪**

*For any issues or suggestions regarding this documentation, please contact the QA team or create a JIRA ticket.*
