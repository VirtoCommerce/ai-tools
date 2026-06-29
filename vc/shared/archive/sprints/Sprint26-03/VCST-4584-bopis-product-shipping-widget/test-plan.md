# Test Plan: VCST-4584 - [BOPIS] Product Details Re-design Shipping Options Widget

## Overview

| Field | Value |
|-------|-------|
| Jira Ticket | [VCST-4584](https://virtocommerce.atlassian.net/browse/VCST-4584) |
| GitHub PR | [#2181](https://github.com/VirtoCommerce/vc-frontend/pull/2181) |
| Also Covers | [VCST-4613](https://virtocommerce.atlassian.net/browse/VCST-4613) - Hint for pickup location descriptions |
| Type | Story + Bug Fix |
| Priority | P1 (BOPIS critical path) |
| Sprint | Sprint 26-03 |
| Developer | Maya Diachkovskaia (goldenmaya) |
| QA Lead | QA Lead Orchestrator |
| Artifact | `vc-theme-b2b-vue-2.42.0-pr-2181-2d87-2d87863a.zip` |
| CI Status | SUCCESS (CLA signed, green) |
| Test Date | 2026-02-19 |
| Version | 2.0 (updated 2026-02-19) |

---

## Feature Description

### What Changed

The product details page previously showed a static inline list of pickup locations with store names and availability status rendered in the "Shipment Options" widget on every page load, regardless of whether the user wanted to browse them.

This PR redesigns the widget to:

1. **Compact widget design:** Shows a store/pickup icon and a "Check pickup locations" CTA link instead of the old static list
2. **On-demand fetch:** Clicking the CTA fetches up to 50 pickup locations via `GetProductPickupLocations` GraphQL query (with `first: 50`)
3. **View-only map modal:** Opens the existing `SelectAddressMapModal` in non-selectable mode - users can browse, search, and view location details on the map but cannot select a location (selection remains in checkout only)
4. **New filter context architecture:** `usePickupFilterContext` composable introduced with `createCartFilterContext()` and `createProductFilterContext()` factories, decoupling filter state between product page and cart contexts
5. **No facet filters in product context:** `createProductFilterContext()` returns empty facets, so Country/Region/City dropdowns are hidden in the product page modal
6. **Keyword search still available:** Users can search by location name/keyword inside the product modal
7. **resetFilter behavior change:** Now calls `closeInfoCard() + onFilterChange()` instead of `applyFilter()`
8. **VCST-4613 fix:** Availability description chip is now wrapped in `VcTooltip` so truncated text shows the full description on hover
9. **GraphQL schema expansion:** `getProductPickupLocationsQuery.graphql` now queries additional fields: `description`, `contactEmail`, `contactPhone`, `workingHours`, `geoLocation`, full `address` block
10. **VcRadioButton `noIndicator` prop:** New prop that hides the radio circle element while keeping the label, used in view-only list mode
11. **VcPopover `max-w-full` fix:** Prevents overflow in constrained container widths
12. **Locale key rename:** `in_store` renamed to `check_pickup_locations` across all 13 language files

---

## Scope of Changes

### Files Modified (27 total)

| Layer | Component | Nature of Change |
|-------|-----------|-----------------|
| GraphQL | `getProductPickupLocationsQuery.graphql` | Added fields: `description`, `contactEmail`, `contactPhone`, `workingHours`, `geoLocation`, full `address` block |
| Product Page | `product.vue` | Prop change: `pickup-locations` array -> `product-id` string |
| Product Component | `product-pickup-locations.vue` | Complete redesign: static list -> CTA button + map modal trigger with `VcLoaderOverlay` |
| NEW Composable | `usePickupFilterContext.ts` | New injectable filter context; `createCartFilterContext()` and `createProductFilterContext()` factories |
| Checkout Composable | `useBopis.ts` | Uses `createCartFilterContext()`, passes `filterContext` to modal |
| Checkout Composable | `useSelectAddressMap.ts` | Now uses `usePickupFilterContext()` instead of `useCartPickupLocations()` directly |
| Modal | `select-address-map-modal.vue` | Accepts `selectable` + `filterContext` props; calls `providePickupFilterContext` |
| Modal | `select-address-modal.vue` | Accepts optional `filterContext` prop; conditionally provides context |
| Filter Component | `select-address-filter.vue` | Uses `usePickupFilterContext()`; hides facet filters when `hasFacetFilters=false` |
| Map Desktop | `select-address-map-desktop.vue` | Passes `selectable` prop; unified `onSelect` handler |
| Map Mobile | `select-address-map-mobile.vue` | Passes `selectable` prop |
| Map List | `select-address-map-list.vue` | `noIndicator` prop on radio button; hover highlight state (`secondary-50`) |
| Location Card | `pickup-location-card.vue` | Footer hidden when `selectable=false` |
| UI Kit | `vc-radio-button.vue` | New `noIndicator` prop hides radio circle via `display: none` |
| UI Kit | `vc-popover.vue` | Added `max-w-full` to prevent overflow |
| Shared | `pickup-availability-info.vue` | Wrapped in `VcTooltip` (VCST-4613 fix) |
| Locales (13) | `en/de/es/fr/fi/it/ja/no/pl/pt/ru/sv/zh.json` | Key renamed: `in_store` -> `check_pickup_locations` |

---

## Risk Assessment

**Overall Risk: MEDIUM-HIGH**

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| BOPIS cart/checkout regression (selectable flow broken by context refactor) | Critical | Low | Full regression of cart BOPIS flow + E2E checkout (TC-4584-14 through TC-4584-20) |
| `usePickupFilterContext` Vue injection error (missing provider) | High | Low | Test both product page and cart modal paths; monitor console for `inject()` warnings |
| `resetFilter` behavior change causes unexpected UX in cart | Medium | Low | TC-4584-18 explicitly tests new closeInfoCard + onFilterChange sequence |
| GraphQL new fields absent from backend schema (schema not deployed yet) | High | Low | TC-4584-13 verifies fields in Network response; check with backend team if failing |
| Locale key rename breaks CTA text in any locale (old key value still cached/used) | Medium | Low | TC-4584-34 through TC-4584-38 cover all 13 locales |
| Product context unexpectedly shows facet filters | Medium | Low | TC-4584-08 verifies no dropdowns in product modal |
| View-only modal unexpectedly shows Select button (selectable prop misconfiguration) | High | Low | TC-4584-05 is a Critical test; TC-4584-40 covers mobile |
| Mobile modal not receiving selectable=false from product page path | Medium | Low | TC-4584-40 explicitly tests mobile view-only mode |
| VcRadioButton noIndicator regression affecting other radio usages site-wide | Medium | Low | TC-4584-31 tests radio buttons on checkout pages |
| Double-click on CTA sends duplicate GraphQL requests | Low | Medium | TC-4584-26 tests double-click prevention |
| No error state shown if network fails during CTA click | Medium | Medium | TC-4584-24 tests offline/network failure scenario |

---

## Test Environment

| Parameter | Value |
|-----------|-------|
| Frontend URL | `FRONT_URL` from `.env` |
| Backend URL | `BACK_URL` from `.env` |
| Storybook | `STORYBOOK_URL` from `.env` |
| Primary Browser | Chrome (desktop 1920x1080) |
| Mobile Viewport | 375px width x 812px height (iPhone) |
| Tablet Viewport | 768px width x 1024px height (iPad) |
| Test Users | `USER_EMAIL` / `USER_PASSWORD` from `.env` |

### Preconditions for Test Execution

1. PR #2181 artifact deployed to QA environment (artifact: `vc-theme-b2b-vue-2.42.0-pr-2181-2d87-2d87863a.zip`)
2. At least one product in the catalog with BOPIS-eligible pickup locations configured (minimum 3 locations for filter testing to be meaningful)
3. At least one pickup location has `description`, `contactEmail`, `contactPhone`, `workingHours`, and `geoLocation` fields populated in the backend (for info card detail tests)
4. At least one pickup location has an `availabilityNote` longer than 30 characters (for tooltip truncation test)
5. BOPIS module enabled (`xPickupEnabled = true`) in store configuration
6. Google Maps API key configured for the shipping module
7. Cart has at least one in-stock product added (for checkout regression tests)
8. Test user logged in as `USER_EMAIL`
9. Storybook deployed with the new `noIndicator` prop for VcRadioButton (for TC-4584-28)

---

## Test Approach

### Testing Layers

| Layer | Assigned To | Method | Test Cases |
|-------|-------------|--------|-----------|
| Product page widget + modal (new feature) | qa-frontend-expert | Interactive browser testing, DevTools Network monitoring | TC-4584-01 through TC-4584-13 |
| BOPIS checkout regression | qa-frontend-expert | Interactive browser testing, E2E flow | TC-4584-14 through TC-4584-20 |
| Location info card details | qa-frontend-expert | Interactive browser testing | TC-4584-21 through TC-4584-23 |
| Edge cases and error handling | qa-frontend-expert | Browser DevTools (offline mode, rapid click) | TC-4584-24 through TC-4584-27 |
| VcRadioButton `noIndicator` prop | ui-ux-expert | Storybook component testing + live environment | TC-4584-28, TC-4584-29, TC-4584-31 |
| VcPopover overflow fix | ui-ux-expert | Storybook + live environment | TC-4584-30 |
| VcTooltip on availability chip (VCST-4613) | ui-ux-expert + qa-frontend-expert | Live environment (both modal contexts) | TC-4584-32, TC-4584-33 |
| Localization spot-check (all 13 locales) | qa-frontend-expert | Language switcher in storefront | TC-4584-34 through TC-4584-38 |
| Mobile responsive testing (375px + 768px) | qa-frontend-expert | DevTools Device Toolbar viewport resize | TC-4584-39 through TC-4584-42 |

### Testing Priority Order (Execution Sequence)

1. **First pass - critical path:** TC-4584-01, TC-4584-04, TC-4584-05 (widget visible, CTA works, view-only mode confirmed)
2. **Second pass - regression safeguard:** TC-4584-14, TC-4584-15, TC-4584-20 (cart BOPIS not broken, E2E works)
3. **Third pass - product modal features:** TC-4584-06, TC-4584-07, TC-4584-08, TC-4584-09, TC-4584-13 (search, no facets, map, close, GraphQL)
4. **Fourth pass - edge cases and behavior changes:** TC-4584-16, TC-4584-18, TC-4584-24, TC-4584-25
5. **Fifth pass - UI kit + tooltip:** TC-4584-28, TC-4584-29, TC-4584-32, TC-4584-33
6. **Sixth pass - localization:** TC-4584-34 through TC-4584-38
7. **Seventh pass - mobile:** TC-4584-39 through TC-4584-42
8. **Final pass - remaining cases:** TC-4584-02, TC-4584-03, TC-4584-10, TC-4584-11, TC-4584-12, TC-4584-17, TC-4584-19, TC-4584-21 through TC-4584-23, TC-4584-26, TC-4584-27, TC-4584-30, TC-4584-31

### What is NOT in Scope

- Backend API testing (no backend code changes in this PR)
- Admin SPA testing (no admin UI changes)
- Payment processing flow testing (unrelated feature)
- New user registration / authentication (unrelated)
- Automated test creation (manual testing only for this sprint)
- Performance/load testing
- BrowserStack real device testing (viewport simulation is sufficient for this sprint)

---

## Test Cases Summary

### Section 1: Product Page Widget - New Design (13 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-01 | Widget visible with correct structure on BOPIS-eligible product page | Critical | 5 min |
| TC-4584-02 | Widget hidden when product has no pickup locations | High | 5 min |
| TC-4584-03 | Widget hidden when BOPIS module is globally disabled | High | 5 min |
| TC-4584-04 | Clicking CTA triggers loading overlay then opens modal | Critical | 8 min |
| TC-4584-05 | Modal opens in view-only mode - no Select button visible | Critical | 8 min |
| TC-4584-06 | Radio button indicators hidden in location list (noIndicator) | High | 5 min |
| TC-4584-07 | Keyword search filters pickup locations in modal | High | 8 min |
| TC-4584-08 | Facet filters NOT shown in product modal context | High | 5 min |
| TC-4584-09 | Map marker click highlights list item and opens info card | High | 8 min |
| TC-4584-10 | Close modal returns cleanly to product page with CTA functional | High | 5 min |
| TC-4584-11 | Re-opening modal fetches fresh data, no stale filters | Medium | 8 min |
| TC-4584-12 | Modal shows up to 50 locations with no pagination control | Medium | 5 min |
| TC-4584-13 | GraphQL response includes all new fields (description, geoLocation, address) | Critical | 10 min |

### Section 2: BOPIS Checkout Regression (7 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-14 | Cart BOPIS modal opens in fully selectable mode | Critical | 8 min |
| TC-4584-15 | Selecting a location in cart BOPIS modal saves correctly | Critical | 10 min |
| TC-4584-16 | Cart BOPIS - facet filters visible and functional | High | 8 min |
| TC-4584-17 | Cart BOPIS - keyword search still works | High | 5 min |
| TC-4584-18 | Cart BOPIS - reset filter closes info card and refreshes (behavior change) | High | 8 min |
| TC-4584-19 | Cart BOPIS - load more pagination works | Medium | 8 min |
| TC-4584-20 | Full BOPIS checkout E2E - add to cart through confirmation | Critical | 15 min |

### Section 3: Location Info Card Details (3 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-21 | Info card displays all available details from new GraphQL fields | Critical | 8 min |
| TC-4584-22 | Cart info card shows Select button in footer | High | 5 min |
| TC-4584-23 | Map marker pins use geoLocation data for placement | High | 5 min |

### Section 4: Edge Cases and Error Handling (4 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-24 | Network failure during CTA click shows appropriate error state | High | 10 min |
| TC-4584-25 | Modal with zero results from keyword search shows empty state | High | 5 min |
| TC-4584-26 | Rapid double-click on CTA does not duplicate GraphQL requests | Medium | 5 min |
| TC-4584-27 | Back/forward browser navigation does not break product page | Medium | 5 min |

### Section 5: UI Kit Component Changes (4 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-28 | VcRadioButton noIndicator=true hides radio circle element | High | 5 min |
| TC-4584-29 | VcRadioButton default (noIndicator=false) no visual regression | High | 5 min |
| TC-4584-30 | VcPopover content does not overflow horizontally | Medium | 5 min |
| TC-4584-31 | VcRadioButton changes do not regress other radio button usages | Medium | 8 min |

### Section 6: VCST-4613 Availability Tooltip (2 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-32 | Availability chip tooltip shows full text on hover in product modal | High | 5 min |
| TC-4584-33 | Availability chip tooltip also works in cart BOPIS modal | High | 5 min |

### Section 7: Localization (5 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-34 | EN locale: "Check pickup locations" text displays | High | 3 min |
| TC-4584-35 | DE locale: German translation correct | Medium | 3 min |
| TC-4584-36 | FR and ES locale spot-check | Medium | 5 min |
| TC-4584-37 | RU and JA locale spot-check | Medium | 5 min |
| TC-4584-38 | Remaining 7 locales spot-check (FI, IT, NO, PL, PT, SV, ZH) | Low | 10 min |

### Section 8: Mobile and Responsive (4 cases)

| ID | Title | Priority | Estimate |
|----|-------|----------|---------|
| TC-4584-39 | Mobile 375px: widget CTA layout and tap works | High | 5 min |
| TC-4584-40 | Mobile 375px: view-only modal correct layout and no Select button | High | 8 min |
| TC-4584-41 | Mobile 375px: cart BOPIS modal still selectable | High | 8 min |
| TC-4584-42 | Tablet 768px: widget and modal display correctly | Medium | 8 min |

**Total: 42 test cases**
**Total Estimated Time: ~4 hours (one tester, sequential execution)**
**Priority Distribution: 8 Critical, 22 High, 11 Medium, 1 Low**

---

## Pass/Fail Criteria

### Pass Criteria (ALL must be met for approval)

- All Critical test cases pass (8 cases: TC-4584-01, 04, 05, 13, 14, 15, 20, 21)
- All High test cases pass or have documented known-issue waivers approved by QA Lead
- BOPIS cart checkout flow is fully functional (TC-4584-14, TC-4584-15, TC-4584-20)
- Product page widget is visible and the CTA triggers the modal (TC-4584-01, TC-4584-04)
- Modal correctly distinguishes view-only mode vs selectable mode (TC-4584-05, TC-4584-14)
- No unhandled console errors or Vue injection warnings during any modal open/use/close flow
- Locale key rename works in EN at minimum (TC-4584-34)

### Fail Criteria (ANY one blocks release approval)

- Cart BOPIS location selection flow is broken (TC-4584-15 fails)
- Map modal throws Vue injection error (`inject() can only be used inside setup()`)
- GraphQL query for product pickup locations fails with HTTP error or schema validation error (TC-4584-13 fails)
- "Select this pickup location" button is visible in the product page modal (TC-4584-05 fails - wrong mode)
- Clicking CTA causes JavaScript crash or white screen
- Console shows unhandled errors during modal interaction

### Approve With Conditions

The following issues may be accepted as known issues with a follow-up ticket, and do not block approval:

- Minor layout/spacing inconsistencies at specific viewport sizes (if not affecting usability)
- Tooltip positioning slightly off in edge case screen sizes (VCST-4613 fix)
- Non-critical locale translation text issues (Medium/Low priority locales)
- VcPopover overflow only visible in extreme edge-case container sizes
- Minor animation glitches that don't affect functionality

---

## Artifact Paths

| Artifact | Path |
|----------|------|
| Test Plan | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/test-plan.md` |
| Test Cases | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/test-cases.md` |
| Execution Report | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/test-execution-report.md` |
| TestRail CSV | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/testrail-import.csv` |
| Screenshots Desktop | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/screenshots/desktop/` |
| Screenshots Mobile | `tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget/screenshots/mobile/` |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-19 | test-management-specialist | Initial test plan (27 test cases) |
| 2.0 | 2026-02-19 | test-management-specialist | Expanded to 42 test cases; added error handling, info card detail, tablet viewport, full E2E, location limit, all 13 locales, VcRadioButton site-wide regression, VCST-4613 cart modal coverage; refined preconditions and execution order |
