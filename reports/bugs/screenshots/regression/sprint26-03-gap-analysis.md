# Sprint26-03 vs Frontend Regression Suites: Gap Analysis Report

**Date:** 2026-02-23
**Author:** test-management-specialist
**Scope:** Sprint26-03 test cases vs all 15 Frontend regression suite CSVs

---

## Executive Summary

This report analyses 11 Sprint26-03 ticket directories against all 15 Frontend regression suite CSV files to identify gaps, missing coverage, and required updates. The analysis is read-only; no files were modified.

**Overall Findings:**

| Category | Count |
|----------|-------|
| Tickets with FULL regression coverage | 1 (VCST-4122) |
| Tickets with PARTIAL regression coverage | 2 (VCST-4586, VCST-4637) |
| Tickets with NO regression coverage | 5 (VCST-4584, VCST-4589, VCST-4623, VCST-4612, Storybook x3) |
| Regression CSVs that need new rows added | 5 |
| New regression CSV files recommended | 1 |
| Existing regression rows needing status update | 3 |

---

## Part 1: Per-Ticket Analysis

---

### VCST-4122 — Reset Filters Button

**Ticket type:** Feature
**Test cases written:** 26 (23 Pass, 2 Skip, 1 Partial)
**Status in regression suites:** FULLY COVERED

**Finding:** The VCST-4122 reset filters functionality is already incorporated into `03-catalog-search-tests.csv` as test cases CAT-014 through CAT-025 (12 test cases). The coverage is comprehensive and includes:

- Filter chip display for all filter types (facet, InStock, PurchasedBefore, Branches)
- Reset Filters button behaviour (clear all vs individual chip close)
- Category context preservation (stays on `/printers`, does not redirect to `/catalog`)
- Search term preservation after reset on search results page
- Browser back/forward with filter state
- Page refresh preserving filter state from URL
- Multi-select within a single facet group

Additionally, `00-full-regression-release.csv` includes FR-CAT-003 which covers the basic Reset Filters scenario.

**Action required:** None. Coverage is complete and correct.

**Quality notes:**
- The sprint test cases for VCST-4122 recorded 2 Skipped and 1 Partial result. The regression CSV rows do not reflect this as they are pre-execution templates, which is correct.
- The execution report in `VCST-4122-reset-filters/test-execution-report.md` confirmed zero bugs and APPROVED status.

---

### VCST-4584 — BOPIS Product Page Shipping Widget Redesign

**Ticket type:** Feature (UI redesign)
**Test cases written:** 42 (organized across 8 sections)
**Status in regression suites:** MAJOR GAP

**Key behaviour changes introduced:**
- Product page now shows a **view-only** BOPIS widget (modal with `selectable=false`). There is no "Select" button. The user can only view locations, not select one.
- The cart checkout modal retains the existing selectable behaviour.
- New `VcRadioButton` `noIndicator` prop hides the radio button circle on the product page modal.
- `usePickupFilterContext` composable refactored to support both product-page and cart contexts.
- New GraphQL location fields exposed: `description`, `contactEmail`, `contactPhone`, `workingHours`, `geoLocation`.

**Coverage in existing regression suites:**

`05-bopis-pickup-tests.csv` (27 test cases, BOPIS-001 to BOPIS-027) covers:
- Cart-level BOPIS modal: map display, location search, filters, location selection, location card details, integration with checkout.
- Does NOT cover: product page BOPIS widget.

`00-full-regression-release.csv` (FR-BOPIS-001 to FR-BOPIS-005) covers:
- Cart-level BOPIS pickup map, search, filters, selection, mobile.
- Does NOT cover: product page BOPIS widget.

`11-performance-tests.csv` (PERF-LOAD-001 to PERF-SCROLL-001) covers:
- BOPIS modal performance (open time, search, filter, map interactions, memory).
- All performance tests assume cart-level modal context; product page widget not referenced.

`10-localization-tests.csv` covers BOPIS modal localization for the cart context only.

`09-accessibility-tests.csv` covers BOPIS modal keyboard/screen reader but only in the cart flow.

`01-smoke-tests.csv` SMK-010 covers BOPIS checkout pickup selection (cart modal).

**Gaps identified:**

The following test scenarios from VCST-4584 have NO coverage in any regression CSV:

1. Product page widget displays as view-only (no "Select" button visible)
2. Clicking the BOPIS CTA on the product page opens the correct view-only modal
3. Modal on product page shows location list and map without a selection mechanism
4. Closing product page BOPIS modal returns user to product page without side effects
5. `noIndicator` prop — radio buttons in product page modal do not show the circle indicator
6. Cart BOPIS modal still shows "Select" button after the redesign (regression check)
7. New location info fields display: `contactEmail`, `contactPhone`, `workingHours`, `description`
8. Location info card shows all new GraphQL fields in both product page and cart modals
9. VCST-4613 availability tooltip (related ticket): tooltip shows correct availability count on product page
10. Localization of product page BOPIS widget labels
11. Mobile: product page BOPIS CTA and modal responsive layout

**Recommended additions to `05-bopis-pickup-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| BOPIS-028 | Product Page BOPIS Widget - View-Only Modal Opens | Critical | Tests CTA on product page opens modal |
| BOPIS-029 | Product Page BOPIS Widget - No Select Button (View Only) | Critical | Confirms `selectable=false` behaviour |
| BOPIS-030 | Product Page BOPIS Widget - Map and List Display | High | Verifies map and list render in view-only modal |
| BOPIS-031 | Product Page BOPIS Widget - Close Modal | High | Close returns to product page without state change |
| BOPIS-032 | Product Page BOPIS Widget - No Radio Indicator | High | Radio circle hidden (`noIndicator` prop) |
| BOPIS-033 | Location Info Card - New Fields (email, phone, hours) | High | New GraphQL fields displayed |
| BOPIS-034 | Cart BOPIS Modal - Select Button Still Present (Regression) | Critical | Regression: cart modal not broken by redesign |
| BOPIS-035 | VCST-4613 Availability Tooltip - Product Page | Medium | Tooltip shows availability count |
| BOPIS-036 | Product Page BOPIS Widget - Mobile Responsive | High | CTA and modal on 375px viewport |

**Recommended additions to `10-localization-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| L10N-BOPIS-PDP-001 | BOPIS Product Page Widget Localization | Medium | Widget labels in non-English locales |

---

### VCST-4589 — Account Left Rail Menu Update

**Ticket type:** Feature (navigation restructure)
**Test cases written:** 44 (across 6 sections: Menu Structure, Navigation, Visual Design, Accessibility, Cross-Browser, Mobile)
**Status in regression suites:** GAP

**Key behaviour changes introduced:**
- Account left rail menu restructured from 8 flat items to a grouped hierarchy:
  - **Purchasing group:** Dashboard, Orders, Lists, Saved for Later
  - **User group:** Profile, Addresses, Change Password, Saved Credit Cards
  - **Marketing group:** (placeholder, not yet populated)
  - **Corporate group:** (placeholder, visible for B2B users)
- Group headers are non-clickable section labels.
- Items under each group maintain their existing routes.

**Coverage in existing regression suites:**

`02-authentication-tests.csv` (28 test cases) covers login, registration, logout, SSO, impersonation — but does NOT cover the account menu navigation structure.

`00-full-regression-release.csv` (FR-ORDER-001, FR-ORDER-002, etc.) tests navigation to order history and account pages via URLs but does not test the left rail menu structure itself.

`13-b2c-features-tests.csv` tests ship-to address management, lists, and configuration — all via direct navigation, not via the left rail menu.

No regression CSV currently tests:
- The grouped menu structure is visible and correct
- Group headers are present and non-clickable
- Correct items appear under each group
- Navigation via the restructured menu still reaches correct pages
- Menu visibility on mobile (hamburger, drawer)
- Active state highlighting for current page

**Recommended additions to `02-authentication-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| AUTH-029 | Account Menu - Purchasing Group Structure | Critical | Verifies Dashboard, Orders, Lists, Saved for Later under Purchasing |
| AUTH-030 | Account Menu - User Group Structure | Critical | Verifies Profile, Addresses, Change Password, Saved Credit Cards under User |
| AUTH-031 | Account Menu - Group Headers Non-Clickable | High | Headers are labels, not links |
| AUTH-032 | Account Menu - Navigation to Each Item | High | Click each item, verify correct page loads |
| AUTH-033 | Account Menu - Active State Highlighting | Medium | Current page item highlighted in menu |
| AUTH-034 | Account Menu - Mobile Drawer/Responsive | High | Menu accessible on 375px viewport |

---

### VCST-4623 — VcBadge Size Change (sm to xs)

**Ticket type:** Bug fix / Visual change
**Test cases written:** 33 (15 Visual/Accessibility, 18 Functional)
**Status in regression suites:** NOT COVERED in any CSV

**Key changes introduced:**
- `VcBadge` size prop changed from `sm` to `xs` in two components:
  - `facet-filter.vue` (badge on facet selected-value chips)
  - `category-selector.vue` (badge on category item count chips)
- `xs` size renders smaller badges (reduced padding, font size).
- Dynamic `px-1` padding class added for double/triple digit count values.
- WCAG contrast ratio maintained despite smaller size.

**Coverage in existing regression suites:**

`03-catalog-search-tests.csv` does not test badge appearance or size.
`09-accessibility-tests.csv` tests WCAG compliance generally but does not test badge contrast or size regression.
`12-browser-compatibility-tests.csv` tests general cross-browser compatibility but not badge-specific rendering.
`00-full-regression-release.csv` FR-CAT-002 tests filter chips but not badge size or accessibility.

No regression CSV has any test case for:
- VcBadge renders at `xs` size in facet filters
- Badge is readable/distinguishable at smaller size
- Badge with double-digit count (e.g., "10+") uses dynamic padding correctly
- Badge color contrast meets WCAG AA at `xs` size
- No regression in facet filter chip appearance

**Recommended additions to `03-catalog-search-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| CAT-026 | Facet Filter Badge - Size xs Visible and Readable | High | Badge renders at xs, text legible |
| CAT-027 | Facet Filter Badge - Double-Digit Count Padding | High | Badge with 10+ count, px-1 padding correct |
| CAT-028 | Category Selector Badge - Size xs Visible | High | Category item count badge at xs size |
| CAT-029 | Facet Filter Badge - WCAG Contrast at xs Size | High | Contrast ratio >= 4.5:1 despite smaller size |

**Recommended additions to `09-accessibility-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| A11Y-BADGE-001 | VcBadge xs Size - WCAG AA Contrast Compliance | High | Contrast verified at xs size |
| A11Y-BADGE-002 | VcBadge Screen Reader - Count Announced | Medium | Badge count announced by screen reader |

---

### VCST-4586 — Configurable Product Pricing Bug Fix

**Ticket type:** Bug fix
**Test cases executed:** 14 (7 Backend API, 4 Frontend Desktop, 3 Frontend Mobile)
**Verdict:** Conditionally Approved (1 new mobile bug found, non-blocking)
**Status in regression suites:** PARTIAL GAP

**Root cause fixed:**
- `ConfiguredLineItemContainer.cs` line 165: `items.Sum(x => x.DiscountAmount)` changed to `items.Sum(x => x.DiscountAmount * x.Quantity)`.
- Frontend: `salePrice` prop now passed to child components in `product-configuration.vue` and `option-product.vue`.

**Coverage in existing regression suites:**

`04-cart-checkout-tests.csv` (31 test cases) does not include any test for configurable product pricing accuracy.

`00-full-regression-release.csv` includes FR-B2C-CONFIG-001 through FR-B2C-CONFIG-003 which test configurable product configuration flow, but FR-B2C-CONFIG-001 does not verify discount calculation correctness with quantity > 1.

`13-b2c-features-tests.csv` includes B2C-CONFIG-008 ("Product Configuration - Price Calculation Accuracy") which tests that total price = base + modifiers, but does NOT test discount amounts scaled by quantity — it tests additive modifiers, not discount amounts.

**Gap:** No regression test explicitly verifies that `discountAmount * quantity` is correct in the cart for configured products (the original bug scenario).

**New mobile bug discovered (non-blocking):** Mobile viewport uses a fallback component `vc-property @2xl:hidden` which still shows list price instead of sale price. This is not covered by any regression test.

**Recommended additions to `13-b2c-features-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| B2C-CONFIG-013 | Configurable Product - Discount Amount Scales with Quantity | Critical | Verifies discountAmount * qty = correct total discount (VCST-4586 regression) |
| B2C-CONFIG-014 | Configurable Product - Sale Price Displayed (Not List Price) | Critical | Sale price shown as primary, list price strikethrough in config options |
| B2C-CONFIG-015 | Configurable Product - Mobile Sale Price Display | High | Mobile fallback component shows sale price (new bug regression) |

---

### VCST-4612 — Auto-Scroll Race Condition Bug (Configurable Product)

**Ticket type:** Bug investigation
**Test cases written:** None — only a bug investigation report exists
**Status in regression suites:** NOT COVERED

**Bug confirmed:**
- First click on a radio button in a collapsed-then-expanded configuration accordion (e.g., Tyres section) after a fresh page load causes:
  1. Page auto-scrolls ~1282px downward to the bottom of the option list.
  2. The clicked radio button selection reverts to "None".
- Reproduces 2/2 times on fresh page load, never reproduces on subsequent clicks in the same session.

**Coverage in existing regression suites:**

`13-b2c-features-tests.csv` tests configurable product UI (B2C-CONFIG-001 through B2C-CONFIG-012) but none of the existing test cases involve:
- Clicking a collapsed accordion section for the first time after page load.
- Verifying no auto-scroll after first radio button click.
- Verifying selection sticks on first attempt.

**Note:** This bug is open and under investigation. Test cases should be added to the regression suite to prevent this bug from re-emerging after a future fix.

**Recommended additions to `13-b2c-features-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| B2C-CONFIG-016 | Configurable Product - First Click in Collapsed Section Does Not Auto-Scroll | High | After fresh page load, expand accordion, first click — page must not scroll (VCST-4612 regression) |
| B2C-CONFIG-017 | Configurable Product - First Click Selection Sticks | High | After fresh page load, first radio click sticks; does not revert to "None" |

---

### VCST-4637 — White Labeling Module Testing

**Ticket type:** Feature testing / Bug investigation
**Artifacts:** Bug investigation report (`store-level-wl-report.md`) only. No `test-cases.md` exists.
**Status in regression suites:** PARTIAL COVERAGE (regression CSV exists, but reflects pre-bug state)

**Bugs found:**
- **BUG-1 (Critical):** Store-level white labeling DB record and ACME Store 3 org record share the same DB ID, causing data contamination. Contoso, ACME Store 2 fail to render correctly despite correct GraphQL config.
- **BUG-2 (High):** GraphQL `mainMenuLinks` query ignores the `organizationId` parameter — always returns store-level data.
- **BUG-3 (Medium):** GraphQL and REST return inconsistent data for the same white labeling record.

**Coverage in existing regression suites:**

`35-frontend-whitelabeling-tests.csv` (68 test cases, FWL-001 to FWL-068) provides comprehensive coverage of white labeling functionality including:
- FWL-001 to FWL-012: Store-level settings (logo, favicon, theme preset, colors, fonts, footer links).
- FWL-013: GraphQL query for store-level white label settings (`pageContext` query).
- FWL-014 to FWL-025: Organization-level settings (logo, colors, footer, menu links per org).
- FWL-026: GraphQL query returns organization-specific data.
- FWL-027: `pageContext` query returns correct org context.
- FWL-028 to FWL-040: Multi-organization switching and context isolation.
- FWL-041 to FWL-054: Advanced features (mobile, cross-browser, accessibility, performance).
- FWL-055 to FWL-068: Security and error handling.

**Gap analysis for VCST-4637 bugs:**

| FWL Test | Existing Coverage | Gap Due to VCST-4637 Bugs |
|----------|------------------|--------------------------|
| FWL-013 | GraphQL pageContext query | Does not assert that `organizationId` is respected (BUG-2 gap) |
| FWL-026 | GraphQL returns org-specific data | Currently FAILING due to BUG-2 (GraphQL ignores organizationId) |
| FWL-027 | pageContext returns correct org context | Currently FAILING due to BUG-1 (data contamination) |
| FWL-028 | Switch to Org2, verify Org2 theme | Currently FAILING for Contoso and ACME Store 2 (BUG-1) |

**Recommended additions to `35-frontend-whitelabeling-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| FWL-069 | GraphQL mainMenuLinks - organizationId Parameter Respected | Critical | Verifies BUG-2 fix: response differs per org ID |
| FWL-070 | GraphQL vs REST Data Consistency for WL Records | High | Verifies BUG-3 fix: same data returned via both endpoints |
| FWL-071 | Store-Level WL Record Does Not Contaminate Org Records | Critical | Verifies BUG-1 fix: each org record has unique DB ID |
| FWL-072 | Contoso Org White Label Renders Correctly | Critical | Regression for Contoso org (was failing due to BUG-1) |
| FWL-073 | ACME Store 2 Org White Label Renders Correctly | Critical | Regression for ACME Store 2 org |

**Note:** A `test-cases.md` file should be created for VCST-4637 to document the test scenarios formally. This is a documentation gap.

---

### VCST-4233, VCST-4537, VCST-4538 — Storybook Migration Parts 7, 8, 9

**Ticket types:** Storybook migration (StoryFn → StoryObj format)
**Test cases written:** 9 + 22 + 20 = 51 total, ALL PASS
**Status in regression suites:** NOT COVERED — no Storybook regression suite exists

**Components tested in VCST-4233 (Part 7):**
- VcCollapsibleContent, VcChip (19 stories), VcButtonSeeMoreLess, VcAlert (17 stories), VcVariantPickerGroup (15+ stories) — 68 stories total

**Components tested in VCST-4537 (Part 8):**
- VcCarouselPagination, VcCheckboxGroup, VcDialog (3 new size stories), VcIcon, VcImage (NEW component with fallback mechanism) — 20 stories, VcBreadcrumbs NOT in PR (documented)

**Components tested in VCST-4538 (Part 9):**
- VcLink (NEW, security attributes: rel="noopener noreferrer"), VcLayout (NEW), VcLabel (REFACTORED), VcInputDetails (REFACTORED, popover-host decorator), VcInfinityScrollLoader (NEW) — 15 stories

**Coverage in existing regression suites:**

No regression CSV file covers Storybook component story validation. The existing suites are all end-to-end storefront or admin tests. Storybook tests are exclusively sprint-level test artifacts.

This is a deliberate scope decision that exists across all sprints (not just Sprint26-03). However, components that appear in Storybook are also used in the storefront, and some Storybook story changes directly affect storefront behaviour:

- `VcImage` (Part 8): NEW component. The fallback mechanism (shows placeholder if image fails) should be validated in storefront scenarios.
- `VcLink` (Part 9): NEW component. Security attributes (`rel="noopener noreferrer"`) must be present on all external links in the storefront.
- `VcDialog` (Part 8): Three new size stories (xs, sm, md). Dialog sizes affect BOPIS modal, address modals, payment modals.
- `VcLabel` (Part 9): REFACTORED. Used widely across form fields in checkout and account management.
- `VcAlert` (Part 7): `info` color regression confirmed passing. Alert variants used in error states throughout storefront.
- `VcVariantPickerGroup` (Part 7): Used in product variant selection. Directly related to B2C-VAR-* test cases.

**Recommended action:**

A new file `regression/suites/Frontend/36-storybook-uikit-tests.csv` should be created to cover Storybook component regression at the story level. For now, the most impactful components to add to existing suites are:

**Recommended additions to `13-b2c-features-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| B2C-VAR-011 | VcVariantPickerGroup - All Variants Render Correctly | High | Regression for storybook Part 7 migration |

**Recommended additions to `09-accessibility-tests.csv`:**

| Proposed ID | Title | Priority | Notes |
|-------------|-------|----------|-------|
| A11Y-LINK-001 | VcLink - External Links Have rel="noopener noreferrer" | High | Security regression: all external links use VcLink with correct rel attribute |

**Recommended new suite:** `36-storybook-uikit-tests.csv` (see Part 3 below).

---

## Part 2: Regression Suite Coverage Map

The table below shows which Sprint26-03 tickets are covered (or not) in each regression suite CSV.

| Regression Suite | VCST-4122 (Reset Filters) | VCST-4584 (BOPIS Widget) | VCST-4589 (Account Menu) | VCST-4623 (VcBadge) | VCST-4586 (Pricing Fix) | VCST-4612 (Auto-Scroll) | VCST-4637 (White Label) | Storybook Parts 7-9 |
|-----------------|--------------------------|--------------------------|--------------------------|---------------------|------------------------|------------------------|------------------------|---------------------|
| 00-full-regression-release | Partial (FR-CAT-003) | Not covered | Not covered | Not covered | Partial (FR-B2C-CONFIG-001) | Not covered | Not covered | Not covered |
| 01-smoke-tests | Not covered | SMK-010 (cart only) | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 02-authentication-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 03-catalog-search-tests | FULL (CAT-014 to CAT-025) | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 04-cart-checkout-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 05-bopis-pickup-tests | Not covered | Cart modal only (not PDP) | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 06-payment-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 07-google-analytics-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 08-security-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 09-accessibility-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 10-localization-tests | Not covered | Cart modal only | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 11-performance-tests | Not covered | Cart modal only | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 12-browser-compatibility-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered |
| 13-b2c-features-tests | Not covered | Not covered | Not covered | Not covered | Partial (B2C-CONFIG-008) | Not covered | Not covered | Not covered |
| 35-frontend-whitelabeling-tests | Not covered | Not covered | Not covered | Not covered | Not covered | Not covered | Partial (pre-bug) | Not covered |

---

## Part 3: Recommended New Test Cases (Full Specifications)

The following CSV rows are ready to be added to their respective regression suite files. All rows follow the existing TestRail CSV format used in the suites.

---

### Rows for `05-bopis-pickup-tests.csv`

```csv
BOPIS-028,Product Page BOPIS Widget - View-Only Modal Opens,BOPIS > Product Page,Functional,Critical,5m,"Product detail page for BOPIS-eligible product with pickup locations configured","1. Navigate to product detail page for a BOPIS-eligible product
2. Locate the BOPIS shipping widget in the shipping section
3. Verify the widget shows a 'Check availability at nearby locations' or equivalent CTA
4. Click the CTA button
5. Verify the pickup location modal opens","- BOPIS CTA button visible in product page shipping section
- Clicking CTA opens pickup location modal
- Modal opens without errors
- Map renders with location markers
- Location list populates",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-029,Product Page BOPIS Widget - No Select Button (View Only),BOPIS > Product Page,Functional,Critical,5m,"BOPIS modal opened from product detail page","1. Open BOPIS modal from product detail page
2. Scroll through location list
3. Click on a location in the list
4. Inspect the location info card and map info window
5. Confirm no 'Select' button is present","- No 'Select' or 'Choose this location' button visible anywhere in the modal
- Modal is informational/view-only
- Location can be viewed but not selected from product page
- Contrast: Cart BOPIS modal (BOPIS-034) still shows 'Select' button",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-030,Product Page BOPIS Widget - Map and Location List Display,BOPIS > Product Page,Functional,High,5m,"BOPIS modal opened from product detail page","1. Open BOPIS modal from product detail page
2. Verify map renders with markers
3. Verify location list displays below or beside map
4. Verify each location entry shows: name, address, distance (if available)
5. Scroll through location list","- Map loads with markers for pickup locations
- Location list displays all available locations
- Each entry shows location name, address
- Map and list are synchronized (clicking location in list shows on map)
- Modal dimensions stable, no layout shift",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-031,Product Page BOPIS Widget - Close Modal Returns to Product Page,BOPIS > Product Page,Functional,High,3m,"BOPIS modal opened from product detail page","1. Open BOPIS modal from product detail page
2. Interact with modal (scroll list, view a location)
3. Click X (close) button or press Escape
4. Verify modal closes
5. Verify product detail page is unchanged","- Modal closes cleanly
- No navigation occurs (user stays on product page)
- Product page state is unchanged (scroll position preserved)
- Product cart widget still visible and functional
- No console errors on close",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-032,Product Page BOPIS Widget - Radio Button Has No Indicator,BOPIS > Product Page,Functional,High,3m,"BOPIS modal opened from product detail page","1. Open BOPIS modal from product detail page
2. Locate radio buttons in location list (if present)
3. Inspect radio button visual style
4. Verify no circular radio indicator is shown","- Radio button circles (filled circle indicator) are NOT visible in the product page modal
- Location highlighting or selection feedback uses a different visual (e.g., border, background)
- This is the noIndicator prop behaviour
- Compare: Cart BOPIS modal still shows standard radio indicators",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-033,Location Info Card - New Fields Display (Email Phone Hours),BOPIS > Location Info,Functional,High,5m,"Pickup locations configured with contactEmail, contactPhone, workingHours, description fields","1. Open BOPIS modal (from cart or product page)
2. Click on a location that has all new fields populated
3. Verify info card or info window displays:
   - Contact email
   - Contact phone
   - Working hours
   - Description text
4. Verify fields are absent if not populated (no empty labels)","- Contact email displays when field is populated
- Contact phone displays when populated
- Working hours display when populated (formatted readably)
- Description text displays when populated
- Fields absent when not configured (no empty placeholders)
- Layout is not broken by additional fields",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-034,Cart BOPIS Modal - Select Button Still Present (Regression),BOPIS > Cart > Regression,Functional,Critical,5m,"Items in cart, BOPIS modal opened from cart/checkout","1. Add a BOPIS-eligible product to cart
2. Navigate to cart
3. Select Pickup delivery option
4. Click 'Select pickup location'
5. Open BOPIS modal
6. Click on a location
7. Verify 'Select' or 'Choose this location' button is present","- 'Select' button visible in location info card/window in the cart BOPIS modal
- Clicking 'Select' chooses the location and closes modal
- Selected location shown in cart/checkout
- Cart BOPIS modal is NOT broken by the VCST-4584 product page changes",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-035,VCST-4613 Availability Tooltip on Product Page,BOPIS > Product Page,Functional,Medium,4m,"Product detail page with BOPIS widget, pickup locations with varying availability","1. Navigate to product detail page
2. Locate the BOPIS widget availability indicator
3. Hover over or click the availability tooltip trigger
4. Verify tooltip shows location count or availability status
5. Verify tooltip content is accurate","- Availability tooltip triggers on hover or click
- Tooltip shows correct count of available pickup locations
- Content reflects actual stock at nearby locations
- Tooltip closes on mouseout or click outside
- No console errors",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual

BOPIS-036,Product Page BOPIS Widget - Mobile Responsive (375x667),BOPIS > Product Page > Mobile,Functional,High,5m,"Mobile viewport (375x667), product detail page with BOPIS widget","1. Set viewport to 375x667 (mobile)
2. Navigate to product detail page
3. Verify BOPIS widget renders correctly (no overflow or cut-off)
4. Tap the BOPIS CTA button
5. Verify modal opens and is mobile-optimized
6. Verify map and list are accessible on mobile
7. Verify close button is tappable (44x44px minimum)","- BOPIS widget visible and not overflowing on mobile
- CTA button tap target adequate
- Modal opens in mobile-friendly layout
- Map renders (may be smaller or below list)
- Touch interactions work (tap, pinch zoom on map)
- Close button accessible
- No horizontal scrolling required",tests/Sprint26-03/VCST-4584-bopis-product-shipping-widget,Manual
```

---

### Rows for `02-authentication-tests.csv`

```csv
AUTH-029,Account Menu - Purchasing Group Structure,Authentication > Account Menu,Functional,Critical,3m,"User logged in with account access","1. Log in to storefront
2. Navigate to account section (e.g., via user icon or My Account link)
3. Locate the left rail navigation menu
4. Verify 'Purchasing' group header is visible
5. Verify the following items appear under Purchasing: Dashboard, Orders, Lists, Saved for Later","- 'Purchasing' group label visible in left rail
- Dashboard link present under Purchasing
- Orders link present under Purchasing
- Lists link present under Purchasing
- Saved for Later link present under Purchasing
- Items are in correct order",tests/Sprint26-03/VCST-4589-account-menu-update,Manual

AUTH-030,Account Menu - User Group Structure,Authentication > Account Menu,Functional,Critical,3m,"User logged in","1. Navigate to account left rail menu
2. Locate 'User' group header
3. Verify the following items appear under User: Profile, Addresses, Change Password, Saved Credit Cards","- 'User' group label visible
- Profile link under User
- Addresses link under User
- Change Password link under User
- Saved Credit Cards link under User",tests/Sprint26-03/VCST-4589-account-menu-update,Manual

AUTH-031,Account Menu - Group Headers Are Non-Clickable Labels,Authentication > Account Menu,Functional,High,3m,"User logged in, account menu visible","1. Navigate to account left rail menu
2. Click on the 'Purchasing' group header
3. Verify no navigation occurs
4. Click on the 'User' group header
5. Verify no navigation occurs","- Group headers ('Purchasing', 'User', 'Marketing', 'Corporate') are not links
- Clicking a group header does not navigate anywhere
- Cursor style indicates non-interactive (default, not pointer)
- Headers serve as visual section labels only",tests/Sprint26-03/VCST-4589-account-menu-update,Manual

AUTH-032,Account Menu - All Navigation Items Route Correctly,Authentication > Account Menu,Functional,High,8m,"User logged in, account menu visible","1. Click 'Dashboard' in Purchasing group, verify correct page
2. Click 'Orders' in Purchasing group, verify Order History page
3. Click 'Lists' in Purchasing group, verify Lists page
4. Click 'Saved for Later' in Purchasing group, verify Saved for Later page
5. Click 'Profile' in User group, verify Profile page
6. Click 'Addresses' in User group, verify Addresses page
7. Click 'Change Password' in User group, verify Change Password page
8. Click 'Saved Credit Cards' in User group, verify Saved Credit Cards page","- Each menu item navigates to the correct page
- Page title or heading confirms correct destination
- Left rail remains visible after navigation
- Active menu item is highlighted",tests/Sprint26-03/VCST-4589-account-menu-update,Manual

AUTH-033,Account Menu - Active State Highlighting,Authentication > Account Menu,Functional,Medium,4m,"User logged in, navigating between account pages","1. Navigate to Orders page via menu
2. Verify 'Orders' item is highlighted/active in left rail
3. Navigate to Profile page via menu
4. Verify 'Profile' is now highlighted and 'Orders' is no longer active","- Currently viewed page item is visually highlighted (bold, border, background)
- Only one item active at a time
- Active state updates correctly on navigation",tests/Sprint26-03/VCST-4589-account-menu-update,Manual

AUTH-034,Account Menu - Mobile Responsive Layout,Authentication > Account Menu > Mobile,Functional,High,5m,"Mobile viewport (375x667), user logged in","1. Set viewport to 375x667
2. Navigate to account section
3. Verify left rail menu adapts for mobile (hamburger, drawer, or tabs)
4. Open mobile menu
5. Verify grouped structure visible on mobile
6. Navigate to Orders via mobile menu","- Account menu accessible on mobile
- Grouped structure maintained (Purchasing, User groups visible)
- Touch targets adequate (44x44px minimum)
- Menu opens/closes correctly
- Navigation from mobile menu works",tests/Sprint26-03/VCST-4589-account-menu-update,Manual
```

---

### Rows for `03-catalog-search-tests.csv`

```csv
CAT-026,Facet Filter Badge - Size xs Renders Legibly,Catalog > Filters > Badge,Visual,High,3m,"Category with faceted filters, products available","1. Navigate to category page with facets
2. Apply a facet filter (e.g., Brand)
3. Locate the filter chip that appears
4. Observe the badge element showing the count or filter indicator
5. Verify the badge is readable and clearly visible","- Badge renders at xs size (smaller than before)
- Badge text is legible (not clipped or overflowing)
- Badge has sufficient visual contrast against background
- Badge shape and padding are correct",tests/Sprint26-03/VCST-4623-badge-size-change,Manual

CAT-027,Facet Filter Badge - Double-Digit Count Uses Correct Padding,Catalog > Filters > Badge,Functional,High,3m,"Category with many filter values, apply 10+ filter values","1. Navigate to category with many filterable values
2. Apply 10 or more values from the same facet group
3. Observe the facet header badge showing the count","- Badge shows double-digit count (e.g., '10', '12')
- Badge width expands to fit double-digit count (px-1 dynamic padding)
- Count not clipped or truncated
- Badge remains proportionally correct",tests/Sprint26-03/VCST-4623-badge-size-change,Manual

CAT-028,Category Selector Badge - Size xs Renders Correctly,Catalog > Category Selector > Badge,Visual,High,3m,"Category selector component visible (category navigation)","1. Navigate to a top-level category page that shows subcategory navigation
2. Locate the category selector component
3. Observe count badges on category items","- Category item count badges render at xs size
- Badge count is readable
- No layout overflow from smaller badge
- Badge consistent in appearance across different category items",tests/Sprint26-03/VCST-4623-badge-size-change,Manual

CAT-029,Facet Filter Badge - WCAG Contrast at xs Size,Catalog > Filters > Badge > Accessibility,Accessibility,High,5m,"Category with facets, browser contrast checker or DevTools","1. Navigate to category page with facets
2. Apply a filter to show filter chip with badge
3. Use browser DevTools or accessibility checker to measure badge text contrast ratio","- Badge text contrast ratio >= 4.5:1 against badge background (WCAG AA for normal text)
- Contrast maintained despite xs size reduction
- Badge meets WCAG 2.1 Level AA",tests/Sprint26-03/VCST-4623-badge-size-change,Manual
```

---

### Rows for `13-b2c-features-tests.csv`

```csv
B2C-CONFIG-013,Configurable Product - Discount Scales Correctly with Quantity,B2C Features > Configurations > Pricing,Functional,Critical,6m,"Configurable product with discounted options, quantity > 1","1. Navigate to configurable product page (e.g., bike builder)
2. Select a configuration option that has a discount (list price > sale price)
3. Set quantity to 2 or more
4. Observe the subtotal in the configuration section
5. Verify in cart: subtotal = salePrice x quantity (not listPrice x quantity)
6. Verify cart discount amount = (listPrice - salePrice) x quantity","- Sale price is used for subtotal calculation (not list price)
- Discount amount is multiplied by quantity: discountAmount * qty = correct total discount
- Cart subtotal is mathematically correct: salePrice x qty
- No pricing discrepancy between product page and cart
- This is the VCST-4586 regression case",tests/Sprint26-03/VCST-4586,Manual

B2C-CONFIG-014,Configurable Product - Sale Price Displayed as Primary Price,B2C Features > Configurations > Pricing,Functional,Critical,4m,"Configurable product with discounted options (list price != sale price)","1. Navigate to configurable product
2. Select an option with a discount applied
3. Observe the price display in the configuration section
4. Verify which price is shown prominently","- Sale price (salePrice) is displayed prominently (bold, dark colour)
- List price (listPrice) is shown with strikethrough formatting
- Visual presentation: salePrice = primary, listPrice = secondary/crossed out
- Price math is clear: e.g., $88.00 (sale) with $126.00 crossed out",tests/Sprint26-03/VCST-4586,Manual

B2C-CONFIG-015,Configurable Product - Mobile Sale Price Display,B2C Features > Configurations > Pricing > Mobile,Functional,High,4m,"Mobile viewport (375x667), configurable product with discounted options","1. Set viewport to 375x667
2. Navigate to configurable product
3. Select an option with a discount
4. Observe price display in configuration section on mobile","- Mobile fallback price component shows sale price (not list price)
- Sale price visible in mobile configuration section
- Regression check: list price should NOT be shown as the primary price on mobile
- Note: This is testing the fix for the new mobile bug found in VCST-4586",tests/Sprint26-03/VCST-4586,Manual

B2C-CONFIG-016,Configurable Product - No Auto-Scroll on First Collapsed Section Click,B2C Features > Configurations > Interaction,Functional,High,5m,"Fresh page load of configurable product with multiple accordion sections (some collapsed by default)","1. Navigate to configurable product page (fresh load - no cached state)
2. Wait for page to fully load
3. Locate a configuration accordion section that is COLLAPSED by default
4. Click the accordion header to expand it
5. Immediately click a radio button option inside the newly expanded section
6. Verify page scroll position","- Page does NOT auto-scroll after the first radio button click
- Radio button selection STICKS (does not revert to 'None' or default)
- Scroll position remains where user was before click
- Selected option is confirmed as checked
- This is the VCST-4612 regression case",tests/Sprint26-03/VCST-4612,Manual

B2C-CONFIG-017,Configurable Product - First Click Radio Selection Sticks (No Revert),B2C Features > Configurations > Interaction,Functional,High,4m,"Fresh page load, configurable product with collapsed accordion sections","1. Fresh page load of configurable product
2. Expand a collapsed accordion section
3. Click a radio button option (e.g., first option in the newly expanded section)
4. Observe the radio button state after 1-2 seconds
5. Verify the selection has not reverted","- Radio button remains selected after first click
- The selection does NOT revert to 'None' or the default value
- Price updates to reflect the selected option
- Section header updates to show selected option name
- This is the VCST-4612 regression case (selection revert bug)",tests/Sprint26-03/VCST-4612,Manual

B2C-VAR-011,VcVariantPickerGroup - All Variant Options Render Correctly,B2C Features > Variations > UI,Functional,High,4m,"Product with multiple variation options (size, colour), Storybook changes deployed","1. Navigate to product with size and colour variants
2. Observe the variant picker UI (colour swatches, size buttons)
3. Click various options
4. Verify visual feedback for selected, unselected, and disabled states","- All variant options render (no blank spaces or broken swatches)
- Selected state visually distinct (border, checkmark, fill)
- Unselected state clearly different from selected
- Disabled/out-of-stock variant shown differently (grayed)
- No visual regression from Storybook StoryFn to StoryObj migration",tests/Sprint26-03/VCST-4233-storybook-migration-part7,Manual
```

---

### Rows for `35-frontend-whitelabeling-tests.csv`

```csv
FWL-069,GraphQL mainMenuLinks - organizationId Parameter Respected,White Labeling > GraphQL > Organization,Functional,Critical,8m,"Multiple organizations configured with different mainMenuLinks, GraphQL access available","1. Query mainMenuLinks via GraphQL for Organization A (pass Organization A's ID)
2. Note the returned menu links
3. Query mainMenuLinks via GraphQL for Organization B (pass Organization B's ID)
4. Compare the two responses","- Response for Organization A returns Organization A's mainMenuLinks
- Response for Organization B returns Organization B's mainMenuLinks
- The two responses differ (assuming different org configs)
- organizationId parameter is honoured by the GraphQL resolver
- This is the VCST-4637 BUG-2 regression test",tests/Sprint26-03/VCST-4637-white-labeling,Manual

FWL-070,GraphQL and REST Return Consistent White Label Data,White Labeling > API Consistency,Functional,High,8m,"White labeling configured for an organization, both GraphQL and REST endpoints accessible","1. Retrieve white labeling settings for a specific organization via GraphQL
2. Retrieve the same organization's white labeling settings via REST API
3. Compare the responses (logo URL, theme colors, menu links, footer links)","- GraphQL and REST return identical data for the same organization
- No fields present in REST but absent in GraphQL (or vice versa)
- No value discrepancies between the two API responses
- This is the VCST-4637 BUG-3 regression test",tests/Sprint26-03/VCST-4637-white-labeling,Manual

FWL-071,Store-Level WL Record Does Not Share DB ID with Any Org Record,White Labeling > Data Integrity,Functional,Critical,5m,"Admin access to white labeling module, multiple organizations configured","1. Access white labeling records via Admin or API
2. Retrieve the store-level white labeling record and note its DB/entity ID
3. Retrieve all organization-level white labeling records
4. Verify no organization record shares the same DB ID as the store-level record","- Store-level WL record has a unique DB ID
- No organization WL record has the same ID as the store-level record
- Data contamination does not occur (correct org renders correct theme)
- This is the VCST-4637 BUG-1 regression test",tests/Sprint26-03/VCST-4637-white-labeling,Manual

FWL-072,Contoso Organization White Label Renders Correctly,White Labeling > Organizations > Contoso,Functional,Critical,6m,"Contoso organization configured with white label settings (logo, theme, menu links)","1. Log in as a member of the Contoso organization
2. Navigate to storefront homepage
3. Verify Contoso branding: logo, colour scheme, menu links, footer links","- Contoso logo displays (not default store logo, not another org's logo)
- Contoso theme colours applied
- Contoso mainMenuLinks render correctly
- Contoso footer links correct
- No visual bleed from store-level or other org settings
- Regression for BUG-1 fix (was failing due to data contamination)",tests/Sprint26-03/VCST-4637-white-labeling,Manual

FWL-073,ACME Store 2 Organization White Label Renders Correctly,White Labeling > Organizations > ACME Store 2,Functional,Critical,6m,"ACME Store 2 organization configured with white label settings","1. Log in as a member of ACME Store 2 organization
2. Navigate to storefront homepage
3. Verify ACME Store 2 branding: logo, colour scheme, menu links, footer links","- ACME Store 2 logo displays correctly
- ACME Store 2 theme applied
- ACME Store 2 menu and footer links correct
- No contamination from store-level or other org settings
- Regression for BUG-1 fix (was failing due to data contamination)",tests/Sprint26-03/VCST-4637-white-labeling,Manual
```

---

### Rows for `09-accessibility-tests.csv`

```csv
A11Y-BADGE-001,VcBadge xs Size - WCAG AA Contrast Compliance,Accessibility > Components > Badge,Accessibility,High,5m,"Category page with facet filters applied, accessibility checker available","1. Navigate to category page
2. Apply facet filters to display filter chips with badges
3. Use browser accessibility tools or DevTools to measure badge text contrast
4. Check contrast ratio for badge text against badge background colour","- Badge text contrast ratio >= 4.5:1 (WCAG AA for normal-size text)
- Contrast maintained despite badge size reduction to xs
- Result is WCAG 2.1 Level AA compliant
- Test applies to both light and dark theme variants",tests/Sprint26-03/VCST-4623-badge-size-change,Manual

A11Y-BADGE-002,VcBadge Count Announced by Screen Reader,Accessibility > Components > Badge,Accessibility,Medium,4m,"Category page with filter chips, screen reader enabled (NVDA or VoiceOver)","1. Enable screen reader
2. Navigate to category page
3. Apply facet filter to show filter chip with badge
4. Navigate to the filter chip badge using screen reader
5. Verify the badge count is announced","- Screen reader announces the badge count
- Announcement is meaningful (e.g., '3 selected' or 'count: 3')
- Badge does not have an empty aria-label that suppresses reading
- Appropriate ARIA attribute ensures count is readable",tests/Sprint26-03/VCST-4623-badge-size-change,Manual

A11Y-LINK-001,External Links Use rel=noopener noreferrer (VcLink Component),Accessibility > Security > Links,Security,High,5m,"Pages with external links rendered via VcLink component","1. Navigate to storefront pages that contain external links (footer links, white label menu links, etc.)
2. Right-click or inspect each external link element
3. Verify rel attribute contains 'noopener noreferrer'","- All external links have rel='noopener noreferrer'
- Attribute prevents tab-napping security vulnerability
- VcLink component consistently applies this attribute
- Internal links (same origin) do not require this attribute
- Regression for Storybook Part 9 (VcLink) security attributes",tests/Sprint26-03/VCST-4538-storybook-migration-part9,Manual
```

---

## Part 4: New Regression Suite Recommendation

### Recommended: `36-storybook-uikit-tests.csv`

**Justification:** Storybook migration work (VCST-4233, VCST-4537, VCST-4538) has covered 51 stories across 15 components. These components are used across the storefront and admin SPA. The current regression suites have no dedicated coverage for UI-Kit component story rendering at the Storybook level. As the migration continues (Parts 10+), the gap will grow.

**Proposed scope:**
- 1 test case per Storybook story (or per component section)
- Covers: story renders without errors, visual appearance matches baseline, interactive stories respond to interactions
- References: Storybook URL, component name, story name
- Priority: Medium (P2) unless the component is in a critical revenue flow (then P1)

**Scope for initial suite based on Sprint26-03 components:**

| Component | Source | Stories | Priority |
|-----------|--------|---------|----------|
| VcImage | VCST-4537 | Default + fallback (broken URL) | P1 — used in product images |
| VcLink | VCST-4538 | Default + external (security) | P1 — used in navigation |
| VcDialog | VCST-4537 | xs, sm, md sizes | P1 — used in BOPIS modal |
| VcVariantPickerGroup | VCST-4233 | All variant states | P1 — used in product variations |
| VcAlert | VCST-4233 | All colour variants incl. info | P2 |
| VcChip | VCST-4233 | All 19 stories | P2 |
| VcLabel | VCST-4538 | All refactored stories | P2 — used in checkout forms |
| VcInputDetails | VCST-4538 | All refactored stories | P2 |
| VcInfinityScrollLoader | VCST-4538 | Loading + complete states | P2 |
| VcCollapsibleContent | VCST-4233 | Collapsed/expanded states | P2 |
| VcButtonSeeMoreLess | VCST-4233 | Default stories | P2 |
| VcCarouselPagination | VCST-4537 | All pagination states | P2 |
| VcCheckboxGroup | VCST-4537 | All checkbox states | P2 |
| VcLayout | VCST-4538 | All layout variants | P2 |
| VcIcon | VCST-4537 | Key icon set | P3 |

**Estimated test case count:** 30-40 test cases initially.

---

## Part 5: Quality Issues Found in Existing Regression Suites

The following issues were observed in the existing regression suite CSV files during this review. These are not related to Sprint26-03 but are documented here as they were noticed.

### Issue 1: PAY-AN-001 has incorrect References field

**File:** `06-payment-tests.csv`
**Row:** PAY-AN-001 (Authorize.Net - Payment Flow)
**Issue:** The References field contains `google-analytics` which is clearly incorrect for a payment test. Should reference a payment-related ticket or test plan.
**Severity:** Low (documentation quality)

### Issue 2: PAY-DT-001 has incorrect References field

**File:** `06-payment-tests.csv`
**Row:** PAY-DT-001 (Datatrans - Payment Flow)
**Issue:** References field is `google-analytics` — same incorrect reference as PAY-AN-001.
**Severity:** Low (documentation quality)

### Issue 3: 11-performance-tests.csv scope is narrowly focused on BOPIS modal

**File:** `11-performance-tests.csv`
**Issue:** Almost all 20 test cases in this suite (PERF-LOAD-001 through PERF-SCROLL-001) reference `VCST-4499 TC-011` and focus exclusively on BOPIS pickup modal performance. The suite name is "Performance Tests" but it lacks page load, API, and scroll performance tests for non-BOPIS flows. This was partially compensated by `00-full-regression-release.csv` which includes FR-PERFORMANCE-001 through FR-PERFORMANCE-005, but the dedicated performance suite is very narrow.
**Severity:** Medium (coverage gap — non-BOPIS performance not in dedicated suite)
**Recommendation:** Expand `11-performance-tests.csv` to include Core Web Vitals tests for homepage, category, product, cart, and checkout pages (similar to what is in `00-full-regression-release.csv`).

### Issue 4: FWL-026 and FWL-027 are currently failing (VCST-4637 bugs)

**File:** `35-frontend-whitelabeling-tests.csv`
**Rows:** FWL-026 (GraphQL returns org-specific data), FWL-027 (pageContext query returns correct org context)
**Issue:** Based on the VCST-4637 bug investigation, these tests are expected to fail in the current environment because BUG-2 (GraphQL ignores organizationId) and BUG-1 (data contamination) are open. The regression CSV does not mark these as "known failing" — they will produce false failures when run.
**Severity:** High (misleading test results)
**Recommendation:** Add a note to these rows (or a separate "known issues" section) indicating they are expected to fail until VCST-4637 bugs are resolved.

### Issue 5: 13-b2c-features-tests.csv has no configurable product pricing test for discounts with quantity

**File:** `13-b2c-features-tests.csv`
**Row:** B2C-CONFIG-008 (Price Calculation Accuracy)
**Issue:** This test case covers base price + modifiers but does not cover the discount amount scenario. The bug in VCST-4586 (`discountAmount` not scaled by quantity) would NOT be caught by B2C-CONFIG-008.
**Severity:** High (critical revenue bug would not be detected by regression)
**Resolution:** Add B2C-CONFIG-013 (proposed above).

---

## Part 6: Summary of All Recommended Changes

### Files to Update (add new rows)

| File | Rows to Add | Count |
|------|-------------|-------|
| `05-bopis-pickup-tests.csv` | BOPIS-028 through BOPIS-036 | 9 new rows |
| `02-authentication-tests.csv` | AUTH-029 through AUTH-034 | 6 new rows |
| `03-catalog-search-tests.csv` | CAT-026 through CAT-029 | 4 new rows |
| `13-b2c-features-tests.csv` | B2C-CONFIG-013 through B2C-CONFIG-017, B2C-VAR-011 | 7 new rows |
| `35-frontend-whitelabeling-tests.csv` | FWL-069 through FWL-073 | 5 new rows |
| `09-accessibility-tests.csv` | A11Y-BADGE-001, A11Y-BADGE-002, A11Y-LINK-001 | 3 new rows |

**Total new rows across existing files: 34**

### New Files to Create

| File | Purpose | Estimated Rows |
|------|---------|----------------|
| `36-storybook-uikit-tests.csv` | UI-Kit component story regression | 30-40 |

### Documentation Gaps

| Ticket | Gap | Action |
|--------|-----|--------|
| VCST-4637 | No `test-cases.md` exists; only investigation report | Create `test-cases.md` for VCST-4637 |

### Priority Order for Implementing Changes

1. **BOPIS-034** (cart modal regression) — Critical, prevents regressions from VCST-4584 changes breaking cart flow
2. **BOPIS-028, BOPIS-029** (product page widget view-only) — Critical, covers the primary new behaviour
3. **B2C-CONFIG-013, B2C-CONFIG-014** (pricing fix regression) — Critical, prevents VCST-4586 from regressing
4. **B2C-CONFIG-016, B2C-CONFIG-017** (auto-scroll regression) — High, for when VCST-4612 is fixed
5. **AUTH-029, AUTH-030** (account menu groups) — Critical, covers the primary VCST-4589 behaviour
6. **FWL-069, FWL-071, FWL-072, FWL-073** (white label bug regressions) — Critical, for when VCST-4637 bugs are fixed
7. **CAT-026, CAT-027, CAT-028, CAT-029** (VcBadge size) — High
8. **A11Y-BADGE-001, A11Y-LINK-001** — High (security/accessibility)
9. **BOPIS-030 through BOPIS-036** (remaining BOPIS product page cases) — High
10. **AUTH-031 through AUTH-034** (remaining account menu cases) — High
11. **B2C-VAR-011, B2C-CONFIG-015** (remaining configurable product cases) — Medium
12. **FWL-070** (API consistency) — High (for when VCST-4637 fixed)
13. **A11Y-BADGE-002** — Medium
14. **36-storybook-uikit-tests.csv** (new suite) — Medium, ongoing

---

*Report generated: 2026-02-23*
*Based on: 11 Sprint26-03 ticket directories + 15 Frontend regression suite CSV files*
*Status: Read-only analysis. No files were modified.*
