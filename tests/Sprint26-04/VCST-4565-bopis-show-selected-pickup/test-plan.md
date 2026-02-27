# Test Plan: VCST-4565
# [BOPIS][Desktop] Show Selected Pick Point on Pick Point Popup Window Reopen

| Field | Value |
|-------|-------|
| **Ticket** | [VCST-4565](https://virtocommerce.atlassian.net/browse/VCST-4565) |
| **PR** | [VirtoCommerce/vc-frontend#2188](https://github.com/VirtoCommerce/vc-frontend/pull/2188) |
| **Type** | Feature / Enhancement |
| **Priority** | P1 — High |
| **Dev** | Maya Diachkovskaia |
| **QA Lead** | qa-lead-orchestrator |
| **Sprint** | Sprint 26-04 |
| **Date** | 2026-02-27 |
| **Artifact Path** | `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/` |

---

## 1. Introduction

### Purpose

This test plan verifies that when a user reopens the BOPIS pickup location popup from the cart page on Desktop (1920x1080), the previously confirmed pickup location is correctly pre-selected — both visually highlighted in the location list and marked on the map. It also confirms that the neutral/empty state, selection-change flow, modal-cancel behavior, and delivery-method-switch behavior all work correctly.

### Background

Prior to PR #2188, reopening the pick-point popup would open it with no indication of the current selection. The user had no way to tell which location was already confirmed without closing the modal and reading the cart. The fix introduces pre-selection state management so the UI reflects confirmed state on every reopen.

This ticket is related to the broader BOPIS cart flow that also includes:
- **VCST-4618** — `GetCartPickupLocations` duplicate-key fix (modal opening for configurable product carts)
- **VCST-4650** — Pickup location address field search indexing

The VCST-4618 fix is a precondition for this ticket: if the modal cannot open (VCST-4618 bug), pre-selection cannot be tested. Regression coverage for the modal-open scenario is therefore included here and cross-referenced to VCST-4618 test cases.

### References

| Reference | Link |
|-----------|------|
| Jira ticket | VCST-4565 |
| PR | VirtoCommerce/vc-frontend#2188 |
| Related bug | VCST-4618 (duplicate key fix — modal opening regression) |
| Existing suite | Suite 05 — BOPIS Pickup Tests (`regression/suites/Frontend/05-bopis-pickup-tests.csv`) |
| Test data | `test-data/bopis/pickup-locations.csv` |

---

## 2. Scope

### In Scope

| Area | Coverage |
|------|----------|
| Desktop (1920x1080) pickup modal — pre-selection visual highlight in list | Primary feature verification |
| Desktop pickup modal — map marker highlighted for selected location | Primary feature verification |
| Desktop pickup modal — list auto-scroll to pre-selected item | Primary feature verification |
| No pre-selection state when no location has been confirmed | Empty/neutral state |
| Changing selection from a pre-selected state (pick different, confirm) | Selection-change flow |
| Cancel / close modal preserves original confirmed selection | Cancel behavior |
| Delivery method switch clears pickup selection; modal reopen has no pre-selection | Delivery-switch side-effect |
| Modal opens without error for standard cart (regression from VCST-4618 fix) | Regression coverage |
| Country / State / City facet filters still functional after PR #2188 changes | Regression coverage |
| Radio button visual indicator present in cart modal (regression from VCST-4584) | Regression coverage |

### Out of Scope

| Area | Reason |
|------|--------|
| Mobile viewport pre-selection behavior | Desktop-only ticket scope (1920x1080) |
| Product page BOPIS view-only modal pre-selection | Product page modal has no selection; out of scope |
| Configurable product duplicate-key scenario | Covered by VCST-4618 test plan |
| Address field search indexing | Covered by VCST-4650 test plan |
| Checkout page pickup display | Cart page only per ticket scope |
| Payment processing | Not BOPIS-related |
| Admin configuration of pickup locations | Infrastructure; not regression target |

---

## 3. Test Items

| Layer | Component | Relevance |
|-------|-----------|-----------|
| Storefront — Cart page | Pickup delivery method section | User selects Pickup, sees current location name |
| Storefront — Cart page | Pencil/edit icon next to pickup address | Trigger to reopen the modal |
| Storefront — BOPIS Pickup Modal | Location list (left panel) | Pre-selection highlight, scroll-to-selected |
| Storefront — BOPIS Pickup Modal | Map (right panel) | Pre-selected marker highlight |
| Storefront — BOPIS Pickup Modal | Location info card | Select/Confirm button, Cancel button |
| Storefront — BOPIS Pickup Modal | Facet filters (Country, State, City) | Regression — must not be broken by PR #2188 |
| Storefront — Cart page | Delivery method toggle (Pickup / Delivery) | Side-effect on selection state |

---

## 4. Features to Test

### P0 — Critical Path (must pass for release)

| # | Feature | Test Cases |
|---|---------|------------|
| 1 | Modal opens without error on reopen — regression from VCST-4618 | TC-4565-001 |
| 2 | Previously confirmed location is visually highlighted in list on reopen | TC-4565-002 |
| 3 | Map marker for confirmed location is highlighted on reopen | TC-4565-003 |
| 4 | No pre-selection shown when no location has been confirmed (clean state) | TC-4565-005 |
| 5 | Cancel modal preserves original confirmed location | TC-4565-007 |

### P1 — High Priority

| # | Feature | Test Cases |
|---|---------|------------|
| 6 | List auto-scrolls to bring pre-selected item into view | TC-4565-004 |
| 7 | Changing selection from pre-selected state — new location confirmed | TC-4565-006 |
| 8 | Delivery-method switch clears pickup; modal reopens in clean state | TC-4565-008 |
| 9 | Country / State / City facet filters work correctly (regression) | TC-4565-009 |
| 10 | Radio button indicator present in cart modal (regression from VCST-4584) | TC-4565-010 |

### P2 — Edge Cases and Secondary Scenarios

| # | Feature | Test Cases |
|---|---------|------------|
| 11 | Pre-selection persists after applying and removing a facet filter | TC-4565-011 |
| 12 | Pre-selection persists after using the search/keyword field in modal | TC-4565-012 |

---

## 5. Features Not to Test

- Automation code coverage (automation-engineer responsibility)
- Admin-side fulfillment center configuration
- Non-BOPIS delivery methods (standard shipping)
- Multi-org pickup location context switching
- Subscription order pickup behavior
- Performance benchmarks beyond subjective responsiveness (<3s modal open)

---

## 6. Approach

### Test Levels

| Level | Scope | Agent |
|-------|-------|-------|
| UI — Storefront | Cart page pickup flow, modal interaction, visual state | qa-frontend-expert |
| UI — Exploratory | Discover additional edge cases during manual walkthrough | test-management-specialist (exploration only) |

This ticket is a frontend-only enhancement. No backend API changes are expected from PR #2188. The GraphQL `cartPickupLocations` query and `productPickupLocations` query are not modified. All test cases are UI-layer tests executed via Playwright on the QA storefront.

### Test Types

| Type | Scope |
|------|-------|
| Functional | Pre-selection state management in the modal |
| Regression | Modal open (VCST-4618), filters, radio indicator (VCST-4584) |
| Boundary / Edge Case | Filter interaction with pre-selection, search interaction with pre-selection |

### Techniques

- **State Transition Testing:** Confirmed → Reopen → Verify state preserved; Confirmed → Cancel → Verify unchanged; Confirmed → Delivery switch → Reopen → Verify cleared
- **Visual Verification:** Screenshot comparison for highlighted list item and map marker
- **Boundary Testing:** Location at bottom of scrollable list (verifies scroll-to-selected)
- **Equivalence Partitioning:** No-selection state vs. pre-selected state

---

## 7. Test Environment

| Resource | Value |
|----------|-------|
| Frontend URL | `${FRONT_URL}` (https://vcst-qa-storefront.govirto.com) |
| Backend / Admin | `${BACK_URL}` (https://vcst-qa.govirto.com) |
| Store ID | B2B-store |
| Desktop viewport | 1920x1080 |
| Primary browser | Chrome (`playwright-chrome`) |
| Primary test user (BOPIS) | qa-user-04@virtocommerce.com / Test123! |
| Secondary test user | mutykovaelena@gmail.com / Password2! |
| Cart page URL | `${FRONT_URL}/cart` |
| Test pickup location — near top of list | BOPIS-LOC-001 — "Downtown Store", 123 Main Street, Los Angeles, CA |
| Test pickup location — near bottom of list | BOPIS-LOC-050 — "Filter Test - Small Store", 500 Small Location Ln, Los Angeles, CA |
| BOPIS product | Any BOPIS-eligible product; Bolts category products confirmed in prior sprint |

### Prerequisites

- PR #2188 deployed to QA environment
- VCST-4618 fix deployed (modal must be able to open — if not, this plan is blocked)
- Pickup locations configured for B2B-store (verified from prior BOPIS sprint testing)
- Test user accounts accessible (`qa-user-04@virtocommerce.com`)
- Viewport explicitly set to 1920x1080 before executing each test case

---

## 8. Test Case Summary

| Priority | Count | Test Case IDs |
|----------|-------|---------------|
| P0 — Critical | 5 | TC-4565-001 through TC-4565-005, TC-4565-007 (listed as P0) |
| P1 — High | 5 | TC-4565-006, TC-4565-008, TC-4565-009, TC-4565-010, TC-4565-004 |
| P2 — Medium | 2 | TC-4565-011, TC-4565-012 |
| **Total** | **12** | |

| Type | Count |
|------|-------|
| Feature (new behavior) | 7 |
| Regression | 4 |
| Edge Case | 2 |

### Cross-Reference to Suite 05

The following Suite 05 test cases cover overlapping areas and **do not need to be re-executed** as part of VCST-4565 testing. Verify they continue to pass as a separate regression sweep.

| Suite 05 Case | Title | Overlap With VCST-4565 |
|---------------|-------|------------------------|
| BOPIS-002 | Desktop — Location Selection Flow | Base flow this ticket extends; pre-selection is the new layer on top |
| BOPIS-015 | Pickup Location Card — Cancel | Cancel behavior verified in TC-4565-007 (extended to include re-open check) |
| BOPIS-016 | Pickup Location Card — Confirm | Confirm flow is precondition for all pre-selection tests |
| BOPIS-019 | Pickup Filters — City Search | Regression coverage in TC-4565-009 |
| BOPIS-020 | Pickup Filters — State Search | Regression coverage in TC-4565-009 |
| BOPIS-027 | Integration — Switch Delivery Methods | Delivery-switch side-effect covered in TC-4565-008 (scoped to pre-selection) |
| BOPIS-034 | Cart BOPIS Modal — Select Button Present (Regression) | Covered in TC-4565-010 |

---

## 9. Responsibilities

| Role | Responsibility |
|------|----------------|
| qa-lead-orchestrator | Approve plan, confirm PR #2188 deployed, make go/no-go decision |
| test-management-specialist | Author this plan and test cases, validate steps against real UI |
| qa-frontend-expert | Execute all TC-4565-001 through TC-4565-012 on playwright-chrome |

---

## 10. Schedule

| Phase | Owner | Duration |
|-------|-------|----------|
| Plan review and approval | qa-lead-orchestrator | 0.5 day |
| Test case execution (TC-001 to TC-010) | qa-frontend-expert | 2 hours |
| Edge case execution (TC-011 to TC-012) | qa-frontend-expert | 30 min |
| Bug triage and re-test | qa-frontend-expert | As needed |
| Sign-off | qa-lead-orchestrator | Same day as execution |

---

## 11. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| VCST-4618 fix not deployed — modal cannot open | Blocks all test cases | Low | Verify modal opens with standard cart before starting; escalate to qa-lead if blocked |
| No visual highlight implemented (feature not working at all) | All P0 feature cases fail | Low — PR #2188 merged | Capture screenshot showing absence of highlight; raise bug immediately |
| List auto-scroll not triggered at 1920x1080 (all items visible) | TC-4565-004 cannot be verified | Medium | Use a location at the end of a long list; if all fit on screen, document and mark N/A |
| Map marker highlight is purely JS-based and not detectable by DOM snapshot | TC-4565-003 requires visual inspection | Medium | Use `browser_take_screenshot` and visually compare marker color; document the visual class if accessible |
| Facet filters broken by PR #2188 (unintended regression) | Blocks TC-4565-009 | Low | Run filter test early; if broken, stop and raise bug before proceeding |

---

## 12. Entry and Exit Criteria

### Entry Criteria

- [ ] PR #2188 merged and deployed to QA
- [ ] VCST-4618 fix deployed and confirmed (modal opens for standard cart)
- [ ] This test plan approved by qa-lead-orchestrator
- [ ] Test user `qa-user-04@virtocommerce.com` accessible
- [ ] At least one BOPIS-eligible product in stock in QA catalog

### Exit Criteria

- [ ] All P0 test cases pass (TC-4565-001, -002, -003, -005, -007)
- [ ] All P1 test cases pass or have a documented bug ticket
- [ ] No open Critical or High severity bugs without a fix commitment
- [ ] Screenshots captured for TC-4565-002 (list highlight) and TC-4565-003 (map marker)
- [ ] qa-lead-orchestrator sign-off recorded

### Suspension Criteria

- QA environment unavailable
- VCST-4618 regression blocks modal from opening (all cases blocked)
- PR #2188 rolled back

---

## 13. Defect Reporting

| Attribute | Value |
|-----------|-------|
| Bug report directory | `reports/bugs/` |
| Naming convention | `BUG-VCST-4565-{Short-Description}.md` |
| Severity baseline | Pre-selection absent on reopen = High; map marker not highlighted = Medium; scroll not triggered = Low; filter broken = High |
| Jira project | VCST |

---

## 14. Sign-off

| Role | Status |
|------|--------|
| qa-lead-orchestrator | Pending approval |
| qa-frontend-expert | Pending execution |
| test-management-specialist | Plan authored — 2026-02-27 |
