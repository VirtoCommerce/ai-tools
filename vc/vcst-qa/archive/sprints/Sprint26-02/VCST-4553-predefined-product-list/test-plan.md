# Test Plan: Predefined Product List Block (VCST-4553)

## 1. TEST PLAN IDENTIFIER
- **ID:** TP_VCST_4553
- **Version:** 1.0
- **Date:** 2026-02-05
- **Author:** test-management-specialist
- **JIRA:** VCST-4553 - Predefined Product List Block for CMS Pages

## 2. INTRODUCTION

### 2.1 Purpose
This test plan describes the testing approach for the Predefined Product List Block feature which enables merchandisers and content managers to add curated product lists to CMS pages via Builder.io Page Builder without requiring custom development.

### 2.2 Scope

**In Scope:**
- Builder.io component registration and configuration
- Manual product selection via SKU input (up to 12 products)
- Product reordering and sequence preservation
- Card type display modes (full/short)
- Responsive column layout (tablet: 2-3 cols, desktop: 3-4 cols)
- Frontend rendering of predefined product lists
- SKU validation and error handling
- Integration with existing Products block functionality
- Cross-browser compatibility
- Mobile responsiveness

**Out of Scope:**
- Builder.io platform infrastructure (external service)
- GraphQL xAPI product catalog queries (existing functionality, regression only)
- Product card component internals (existing UI-kit component, regression only)
- Performance testing (basic load time validation only)
- Automated product list generation (not part of requirements)

### 2.3 References
- **JIRA:** https://virtocommerce.atlassian.net/browse/VCST-4553
- **PR:** #2165 - VirtoCommerce/vc-frontend
- **Branch:** feat/VCST-4553-predefined-product-list
- **Artifact:** vc-theme-b2b-vue-2.41.0-pr-2165-b9ab-b9ab1fa9.zip
- **Testing Guide:** docs/prompts/How to test Builder.io.md

## 3. TEST ITEMS

### 3.1 Component Files
- `customComponents.ts` - Builder.io component registration
- `predefined-product-list.json` - Builder schema definition
- `products-block.vue` - Extended product block with SKU processing

### 3.2 Test Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Admin Platform** | https://vcst-qa.govirto.com | Backend verification |
| **Frontend QA** | https://vcst-qa-storefront.govirto.com | End-user validation |
| **Builder.io** | https://builder.io/content | Component configuration |
| **Builder.io Space** | VCST QA | Test workspace |

## 4. FEATURES TO BE TESTED

### 4.1 High Priority (P0/P1)

#### 4.1.1 Builder.io Component Configuration (P0)
- Component availability in Builder.io insert menu
- Component name: "Predefined Products"
- Component icon and preview rendering

#### 4.1.2 SKU Selection & Validation (P0)
- Manual SKU input via list field
- Maximum 12 SKUs validation
- Validation alert when limit exceeded
- Invalid SKU handling
- Empty SKU field handling
- Duplicate SKU handling

#### 4.1.3 Product Display Configuration (P1)
- Title text field (optional)
- Subtitle text field (optional)
- Card Type selection: "full" or "short"
- Column settings:
  - Tablet: 2-3 columns
  - Desktop: 3-4 columns

#### 4.1.4 Product Ordering (P0)
- Custom SKU sequence preservation
- Reorder SKUs in Builder.io (drag-drop or manual)
- Frontend displays products in specified order

#### 4.1.5 Frontend Rendering (P0)
- Products display on CMS pages
- Correct product information (image, name, price, etc.)
- Card type rendering (full vs short)
- Responsive column layout
- Title and subtitle rendering

### 4.2 Medium Priority (P2)

#### 4.2.1 Edge Cases
- Single product display (1 SKU)
- Maximum products (12 SKUs)
- Empty product list (0 SKUs)
- Mixed valid/invalid SKUs
- Products out of stock
- Products not published

#### 4.2.2 Integration
- Combination with other Builder.io blocks
- Multiple Predefined Product List blocks on same page
- Navigation from product cards to PDP

### 4.3 Low Priority (P3)

#### 4.3.1 Performance
- Component load time in Builder.io
- Frontend render time for 12 products
- Page load impact

## 5. FEATURES NOT TO BE TESTED
- Builder.io platform stability (external service)
- Product card component internals (existing UI-kit, regression only)
- GraphQL xAPI catalog queries (existing functionality, regression only)
- Admin product management (existing functionality)
- Builder.io authentication and access control (infrastructure)

## 6. APPROACH

### 6.1 Test Levels
- **Unit Testing:** Developers (not QA scope)
- **Component Testing:** ui-ux-expert (Builder.io configuration)
- **Integration Testing:** qa-frontend-expert (Frontend rendering)
- **E2E Testing:** qa-frontend-expert (Full flow: Builder → Frontend)
- **Accessibility Testing:** ui-ux-expert (WCAG 2.1 AA compliance)
- **Cross-browser Testing:** qa-frontend-expert (Chrome, Safari, Firefox, Edge)

### 6.2 Test Types
- Functional Testing (primary focus)
- Integration Testing (Builder.io + Frontend)
- UI/UX Testing (responsive design, card types)
- Accessibility Testing (WCAG 2.1 AA)
- Cross-browser Testing (desktop + mobile)
- Negative Testing (validation, error handling)

### 6.3 Test Techniques
- **Equivalence Partitioning:** Group SKU counts (0, 1-11, 12, 12+)
- **Boundary Value Analysis:** Test 0, 1, 11, 12, 13 SKUs
- **Decision Table Testing:** Card type, column settings combinations
- **State Transition Testing:** SKU list modifications (add, remove, reorder)
- **Error Guessing:** Common mistakes (typos in SKUs, wrong format)
- **Exploratory Testing:** Creative usage scenarios

## 7. TEST DELIVERABLES

### 7.1 Before Testing
- Test Plan (this document)
- Test Cases (detailed specifications)
- TestRail CSV (import-ready format)
- Test Data (valid SKU list)

### 7.2 During Testing
- Test Execution Results (daily)
- Bug Reports (as found)
- Screenshots (evidence)

### 7.3 After Testing
- Test Execution Report
- Bug Summary Report
- Test Metrics (coverage, pass rate)

## 8. TEST ENVIRONMENT

### 8.1 Software Requirements
- **Environment:** QA
- **Admin URL:** https://vcst-qa.govirto.com
- **Frontend URL:** https://vcst-qa-storefront.govirto.com
- **Builder.io URL:** https://builder.io/content
- **Builder.io Space:** VCST QA
- **Theme Version:** vc-theme-b2b-vue-2.41.0-pr-2165-b9ab

### 8.2 Hardware Requirements
- Desktop browsers: Chrome, Safari, Firefox, Edge
- Mobile devices: iPhone (Safari), Android (Chrome)
- Tablets: iPad (Safari)

### 8.3 Test Accounts
- Builder.io account: Access to VCST QA space
- Admin account: Verify product catalog
- Frontend account: View published pages

### 8.4 Test Data

**Valid Product SKUs (QA environment):**
- SKU-001 through SKU-012 (12 products minimum)
- Mix of product types (simple, variants, configurable)
- Mix of product states (in stock, low stock, out of stock)
- Published and unpublished products

**Invalid SKUs:**
- NON-EXISTENT-SKU
- INVALID-FORMAT
- Empty string

**Test Pages:**
- New CMS page: "Test Predefined Products Campaign"
- Existing CMS page: Homepage (integration test)

## 9. TEST CASES

### 9.1 Test Case Summary
**Total Test Cases:** 35

**By Priority:**
- P0 (Critical): 12 test cases (34%)
- P1 (High): 15 test cases (43%)
- P2 (Medium): 6 test cases (17%)
- P3 (Low): 2 test cases (6%)

**By Type:**
- Functional: 22 test cases (63%)
- Integration: 6 test cases (17%)
- UI/UX: 4 test cases (11%)
- Accessibility: 2 test cases (6%)
- Negative: 1 test case (3%)

**By Feature Area:**
- Builder.io Component: 8 test cases
- SKU Selection & Validation: 10 test cases
- Product Display Configuration: 5 test cases
- Frontend Rendering: 8 test cases
- Edge Cases: 4 test cases

### 9.2 Test Case Location
- Detailed test cases: See test-cases.md
- TestRail import: See testrail-import.csv
- Repository: tests/VCST-4553-predefined-product-list/

## 10. RESPONSIBILITIES

| Role | Responsibility |
|------|----------------|
| **qa-lead-orchestrator** | Approve test plan, coordinate testing, make go/no-go decision |
| **test-management-specialist (you)** | Create test plan, write test cases, track coverage |
| **ui-ux-expert** | Test Builder.io component configuration, accessibility |
| **qa-frontend-expert** | Test frontend rendering, cross-browser, E2E flows |
| **Developers** | Fix bugs, provide technical clarifications |
| **Product Manager** | Clarify requirements, prioritize bugs |

## 11. SCHEDULE

| Phase | Start Date | End Date | Duration | Owner |
|-------|-----------|----------|----------|-------|
| **Test Planning** | Feb 5 | Feb 5 | 0.5 days | test-management-specialist |
| **Test Case Writing** | Feb 5 | Feb 5 | 0.5 days | test-management-specialist |
| **Test Case Review** | Feb 5 | Feb 6 | 0.5 days | qa-lead-orchestrator |
| **Test Execution (Builder.io)** | Feb 6 | Feb 6 | 1 day | ui-ux-expert |
| **Test Execution (Frontend)** | Feb 6 | Feb 7 | 2 days | qa-frontend-expert |
| **Bug Fixing** | Feb 7 | Feb 8 | 2 days | Developers |
| **Re-testing** | Feb 8 | Feb 8 | 1 day | QA Team |
| **Test Sign-off** | Feb 8 | Feb 8 | 0.5 days | qa-lead-orchestrator |

**Total Duration:** 4 days (Feb 5 - Feb 8)

## 12. RISKS AND MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Builder.io service unavailable** | High | Low | Test early, have staging fallback, coordinate with Builder.io support |
| **QA environment instability** | High | Medium | Test on staging as backup, coordinate with DevOps |
| **Test products not available** | Medium | Low | Prepare test catalog in advance, verify SKUs exist |
| **Browser compatibility issues** | Medium | Medium | Test on multiple browsers early, allocate extra time |
| **SKU validation not working** | High | Low | Test validation early (P0 test case) |
| **Product ordering not preserved** | High | Low | Critical test case (P0), test early |
| **Requirements change mid-testing** | Medium | Low | Freeze requirements before testing, formal change process |

## 13. ENTRY CRITERIA
Testing can begin when:
- Feature deployed to QA environment (artifact installed)
- Test plan approved by qa-lead-orchestrator
- Test cases written and reviewed
- Test data prepared (12+ valid SKUs)
- Builder.io space accessible
- QA environment stable

## 14. EXIT CRITERIA
Testing is complete when:
- All P0/P1 test cases executed
- All P0/P1 test cases passing (or bugs accepted as known issues)
- No critical or high-severity bugs open
- Regression testing completed (existing Products block still works)
- Test coverage 95% for acceptance criteria
- Cross-browser testing completed (Chrome, Safari, Firefox, Edge)
- Mobile testing completed (iOS Safari, Chrome Android)
- Accessibility testing passed (WCAG 2.1 AA)
- qa-lead-orchestrator approval obtained

## 15. SUSPENSION CRITERIA
Testing will be suspended if:
- QA environment becomes unavailable
- Builder.io service has extended outage
- Critical blocking bug prevents further testing (e.g., component not visible)
- Requirements change significantly

## 16. RESUMPTION REQUIREMENTS
Testing can resume when:
- Environment restored and stable
- Builder.io service restored
- Blocking bugs fixed and verified
- Updated requirements approved

## 17. TEST METRICS

### 17.1 Metrics to Track
- **Test Coverage:** % of requirements covered by test cases
- **Test Execution Progress:** % of test cases executed
- **Pass Rate:** % of test cases passing
- **Defect Density:** Number of bugs per feature area
- **Defect Distribution:** Bugs by severity
- **Retest Pass Rate:** % of bugs fixed correctly on first retry

### 17.2 Target Metrics
- Test Coverage: 95%
- Pass Rate: 95% (before sign-off)
- Critical Bugs: 0 (before sign-off)
- High Bugs: 2 (with mitigation plan)

## 18. REQUIREMENTS TRACEABILITY MATRIX

| Req ID | Requirement | Test Cases | Coverage |
|--------|-------------|------------|----------|
| **AC-1** | Introduce Predefined Product List Block for non-technical users | TC_001, TC_002, TC_003, TC_004 | 100% |
| **AC-2** | Manual product selection by SKU/Title | TC_005, TC_006, TC_007, TC_008, TC_009, TC_010 | 100% |
| **AC-3** | Reorder products | TC_011, TC_012, TC_013 | 100% |
| **AC-4** | Settings like Products block | TC_014, TC_015, TC_016, TC_017, TC_018 | 100% |
| **IMPL-1** | SKU validation (max 12) | TC_019, TC_020, TC_021 | 100% |
| **IMPL-2** | Card Type (full/short) | TC_022, TC_023 | 100% |
| **IMPL-3** | Responsive columns (tablet/desktop) | TC_024, TC_025, TC_026 | 100% |

**Total Coverage:** 100% of acceptance criteria

## 19. APPROVALS

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Test Manager** | qa-lead-orchestrator | __________ | ______ |
| **Product Owner** | [PM Name] | __________ | ______ |
| **Development Lead** | [Dev Lead] | __________ | ______ |

---

## REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-05 | test-management-specialist | Initial test plan created |
