# VCST-4499 Test Cases - Automation Analysis

**Date:** 2026-01-29
**Ticket:** VCST-4499 - [BOPIS] The map jumps when searching or clearing
**Pull Request:** #2138
**Purpose:** Automation feasibility analysis and test case breakdown for automation engineers

---

## Automation Feasibility Legend

| Level | Description | Criteria |
|-------|-------------|----------|
| 🟢 **Easy** | Straightforward UI automation | Standard DOM interactions, no complex timing, reliable selectors |
| 🟡 **Medium** | Moderate complexity | Third-party integrations (Google Maps), timing considerations, multiple steps |
| 🟠 **Hard** | Complex automation | Performance testing, visual verification, complex state management |
| 🔴 **Not Recommended** | Better manual or specialized tools | Subjective validation, visual design review, accessibility tools better suited |

---

## Automation Priority Matrix

| Priority | Count | Test Cases |
|----------|-------|------------|
| **P0 - Critical** | 3 | TC-001, TC-002, TC-003 |
| **P1 - High** | 8 | TC-004, TC-005, TC-006, TC-007, TC-009, TC-013, TC-015, REG-001, REG-002, REG-004, REG-005 |
| **P2 - Medium** | 4 | TC-008, TC-011, REG-003, REG-006 |
| **P3 - Low** | 3 | TC-010, TC-012, TC-014 |

---

## Recommended Automation Approach

### Phase 1: Critical Path (Weeks 1-2)
- TC-001, TC-002, TC-003, TC-015
- Focus on smoke tests and critical flows

### Phase 2: Core Features (Weeks 3-4)
- TC-004, TC-005, TC-007, REG-001, REG-002, REG-004

### Phase 3: Enhanced Coverage (Weeks 5-6)
- TC-006, TC-008, TC-009, TC-013, REG-003, REG-005, REG-006

### Phase 4: Specialized Testing (Ongoing)
- TC-010 (localization), TC-011 (performance), TC-012 (error scenarios), TC-014 (accessibility with tools)

---

## Test Automation Framework Recommendations

**Recommended Stack:**
- **Framework:** Playwright (already have MCP integration)
- **Language:** TypeScript/JavaScript
- **Assertions:** Expect (Playwright built-in)
- **Reporting:** Playwright HTML Reporter + Allure
- **CI/CD:** GitHub Actions
- **Visual Testing:** Playwright Screenshots + Percy/Applitools (optional)

**Additional Tools:**
- **Accessibility:** axe-core integration with Playwright
- **Performance:** Lighthouse CI
- **API Testing:** Playwright Request Context
- **Mobile:** Playwright device emulation

---

