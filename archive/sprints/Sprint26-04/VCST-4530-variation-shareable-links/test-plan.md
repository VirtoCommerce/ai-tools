# Test Plan: VCST-4530 - Shareable Clickable Link for Product Variations

## 1. IDENTIFIER

| Field | Value |
|-------|-------|
| **Plan ID** | TP_VCST-4530 |
| **Version** | 1.2 |
| **Date** | 2026-02-25 |
| **Author** | Test Management Specialist |
| **Jira** | https://virtocommerce.atlassian.net/browse/VCST-4530 |
| **PR** | https://github.com/VirtoCommerce/vc-frontend/pull/2182 |
| **Status** | Ready for Execution |

---

## 2. INTRODUCTION

### Purpose
Validate that product variation items are now shareable and directly linkable via clickable permalinks — in the Product Detail Page default (card/list) layout, the PDP table layout, and the Catalog List View expanded variations section.

### User Story
**As a** Customer (B2B or B2C shopper)
**I want** to open and copy a direct link to a specific product variation
**So that:**
- I can quickly share the exact variant (color, size, configuration) with another customer
- The recipient sees the same variant immediately without reselecting options

### Scope

**In scope:**
- Product page variations rendered via `VcLineItem` in **default (card/list) layout** (`variations-default.vue`)
- Product page variations rendered via `VcProductTitle :to` in **table layout** (`variations-table.vue`, desktop `#desktop-body` template)
- **Catalog List View variations**: `VariationsDefault` component rendered inside the `#expanded-content` slot of `product-card.vue` in list view mode — variation line items expanded inline by clicking the "Variations (N)" button
- Link routing logic: slug-based (`/{slug}`) and ID-based fallback (`/product/{id}`) via `getProductRoute` utility
- Regression on product page core features (add-to-cart, properties, stock, price, sorting, pagination)
- Regression on catalog list view add-to-cart within expanded variations (must not trigger navigation)
- Mobile rendering: both PDP default layout and catalog list view responsive behavior (including the `product-card__variations-link-button` vs `product-card__variations-button` breakpoint behavior)
- Cross-browser behavior (Chrome, Firefox, Edge)
- Accessibility (keyboard navigation)

**Out of scope:**
- Backend / Admin SPA (no backend changes in this PR)
- Checkout or order flows (not affected)
- Category page variation chips/swatches (PR #2182 does not modify category-page variation components — exploratory baseline check only)
- New component creation (none in this PR)

### References
- Jira: https://virtocommerce.atlassian.net/browse/VCST-4530
- PR: https://github.com/VirtoCommerce/vc-frontend/pull/2182
- Artifact: https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.43.0-pr-2182-7d7f-7d7fa573.zip
- Files changed:
  - `client-app/shared/catalog/components/product/variations-default.vue`
  - `client-app/shared/catalog/components/product/variations-table.vue`
  - `client-app/core/utilities/product/index.ts` (existing utility, not new — unit-tested)

---

## 3. TEST ITEMS

| Component | Change | Test Impact |
|-----------|--------|------------|
| `variations-default.vue` | Added `:route="getProductRoute(variation.id, variation.slug)"` to `VcLineItem` | Variation cards in default layout now have clickable links — test link presence, URL, navigation. This change affects both the PDP default layout AND the catalog list view, because `product-card.vue` renders `VariationsDefault` inside its `#expanded-content` slot. |
| `variations-table.vue` | Added `:to="getProductRoute(variation.id, variation.slug)"` to `VcProductTitle` in `#desktop-body` | Variation names in table "Item" column now have clickable links — test link presence, URL, navigation, desktop-only scope |
| `product-card.vue` (consumer, not modified) | Not changed in this PR, but affected by `variations-default.vue` change | In list view mode: expanding the "Variations (N)" button renders `VariationsDefault` with the new `:route` prop — must verify links work in this catalog context too |
| `getProductRoute` utility | Already exists at `client-app/core/utilities/product/index.ts`; unit tests added in PR | Routing logic: slug → `/{slug}`, id-only → `{ name: "Product", params: { productId } }`, both-absent → `undefined` |

---

## 4. FEATURES TO TEST

### P0 — Blocker: None (no P0 cases; this is a feature addition, not a critical revenue path)

### P1 — High Priority (must pass for sign-off)
- Default layout: variation links render and navigate correctly (slug path)
- Table layout: variation name link renders and navigates correctly (slug path)
- Shareability: copied URL opens the correct variation in a fresh session
- Add-to-cart regression: cart buttons unaffected by link addition (PDP and catalog list view)
- Mobile: default layout variation links are tappable on mobile viewport
- Full regression: core product page features (breadcrumbs, properties, stock, price, sorting, pagination) unaffected
- URL correctness: slug vs ID routes verified via DevTools Network tab
- No JS errors: zero console errors throughout full interaction session
- **Catalog list view: switch to list mode, locate product with variations (TC-022)**
- **Catalog list view: expand variations and verify variation line items have links (TC-023)**
- **Catalog list view: click variation link navigates to correct variation page (TC-024)**
- **Catalog list view: browser back navigation returns to category list (TC-026)**
- **Catalog list view: add-to-cart does not trigger navigation (TC-028)**
- **Catalog list view: no console errors throughout full expand and navigation session (TC-029)**

### P2 — Medium Priority
- Default layout: ID fallback route (no slug variation)
- Table layout: ID fallback route (no slug variation)
- Same-tab navigation (no unintended new tab)
- Table layout: mobile viewport does not break (desktop-only `#desktop-body` template)
- Cross-browser: Firefox default layout links
- Cross-browser: Edge table layout links
- Keyboard accessibility: tab navigation to variation links
- Browser back/forward navigation history
- Pagination: variation links work on all pages
- UX visual styling: default layout (Coffee theme consistency)
- UX visual styling: table layout (Coffee theme consistency)
- **Catalog list view: URL correctness slug vs ID routes (TC-025)**
- **Catalog list view: mobile responsiveness and breakpoint behavior (TC-027)**

### P3 — Low Priority / Informational
- Edge case: variation with no slug and no valid ID
- Category page: baseline behavior documentation (exploratory, no regression expected)

---

## 5. FEATURES NOT TO TEST
- Backend API endpoints (no backend changes in this PR)
- Admin SPA catalog management (not affected)
- Checkout flow (not affected)
- Payment processing (not affected)
- Category page variation chips (PR does not modify those components — exploratory baseline only)

---

## 6. APPROACH

### Test Levels
- **UI / E2E (primary):** `qa-frontend-expert` — browser-based testing using Playwright MCP
- **UX / Visual:** `ui-ux-expert` — hover states, cursor behavior, Coffee theme consistency
- **Exploratory:** Manual category page baseline check

### Test Types
| Type | Cases | Notes |
|------|-------|-------|
| Functional | TC-001 to TC-006, TC-012, TC-016, TC-017, TC-019, TC-020, TC-022, TC-023, TC-024, TC-025, TC-026 | Happy paths, fallback routes, catalog list view |
| Regression | TC-007, TC-011, TC-021, TC-028, TC-029 | Cart, full product page, console errors, catalog list view regression |
| UX / Visual | TC-013, TC-014 | Hover states, Coffee theme |
| Negative | TC-010 | No slug and no ID edge case |
| Accessibility | TC-018 | Keyboard navigation |
| Exploratory | TC-015 | Category page baseline |
| Mobile | TC-008, TC-009, TC-027 | Default layout tap; table layout mobile safety; catalog list view mobile |
| Cross-browser | TC-016, TC-017 | Firefox, Edge |

### Techniques
- **Equivalence Partitioning:** Variation with slug / variation without slug
- **Boundary Value:** Empty slug and empty ID edge case
- **Exploratory:** Category page and mobile viewport discovery
- **Error Guessing:** Clicking Add to Cart in a linked item (link vs button click interception)

---

## 7. TEST ENVIRONMENT

| Resource | Value |
|----------|-------|
| **Frontend URL** | `${FRONT_URL}` (QA: https://vcst-qa-storefront.govirto.com) |
| **Backend URL** | `${BACK_URL}` (QA: https://vcst-qa.govirto.com) |
| **Store** | B2B-store |
| **Build Artifact** | https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.43.0-pr-2182-7d7f-7d7fa573.zip |
| **Primary Browser** | Chrome (desktop, 1920x1080) |
| **Secondary Browsers** | Firefox (latest), Edge (latest) |
| **Mobile** | DevTools emulation: iPhone 14 (390x844) |

### Test Data Requirements
- **Product with default layout variations (slug present):** Parent product with `ProductVariationsLayout` NOT set to "Table"; at least 2 variations with slugs configured in Admin
- **Product with table layout variations (slug present):** Parent product with `ProductVariationsLayout` set to "Table"; at least 2 variations with slugs
- **Variation without slug:** At least one variation with slug field empty — to test ID fallback route
- **B2B user credentials:** `USER_EMAIL` / `USER_PASSWORD` from `.env` (for add-to-cart regression)
- **Second browser / incognito window:** For shareability test TC-005
- **Confirmed test product categories:** `/products-with-options`, `/e2e-catalog` — confirm with QA lead which products have both layouts configured

---

## 8. TEST CASE SUMMARY

| Priority | Count | Test Cases |
|----------|-------|-----------|
| P1 | 14 | TC-001, TC-003, TC-005, TC-007, TC-008, TC-011, TC-012, TC-021, TC-022, TC-023, TC-024, TC-026, TC-028, TC-029 |
| P2 | 11 | TC-002, TC-004, TC-006, TC-009, TC-013, TC-014, TC-016, TC-017, TC-018, TC-019, TC-020, TC-025, TC-027 |
| P3 | 4 | TC-010, TC-015 |
| **Total** | **29** | TC-001 through TC-029 |

| Type | Count |
|------|-------|
| Functional | 18 |
| Regression | 5 |
| UX / Visual | 3 |
| Accessibility | 1 |
| Negative | 1 |
| Exploratory | 1 |

| Automation Status | Count |
|-------------------|-------|
| To be automated | 19 |
| Manual | 10 |

---

## 9. RESPONSIBILITIES

| Role | Responsibility |
|------|----------------|
| **qa-lead-orchestrator** | Approve test plan, coordinate execution, make go/no-go decision |
| **test-management-specialist** | Create plan, write cases, maintain TestRail CSV, track coverage |
| **qa-frontend-expert** | Execute TC-001 to TC-012, TC-016, TC-017, TC-019 to TC-024, TC-026, TC-028, TC-029 (functional + regression, PDP and catalog list view) using `playwright-chrome` |
| **ui-ux-expert** | Execute TC-013, TC-014 (UX/visual styling) using `Chrome DevTools MCP` |
| **qa-frontend-expert** | Execute TC-008, TC-009, TC-027 (mobile — DevTools device emulation) |
| Manual tester | Execute TC-005, TC-010, TC-015, TC-018, TC-025 (shareability, edge case, exploratory, keyboard, URL correctness via DevTools) |

**qa-backend-expert:** Not required (no backend changes in this PR).

---

## 10. SCHEDULE

| Phase | Activity |
|-------|----------|
| Test Planning | Test plan and cases created (v1.0, v1.1) — DONE; catalog list view cases added (v1.2) |
| Test Review | QA lead reviews and approves updated plan |
| Environment Setup | Confirm test data (products with variations, slug/no-slug mix, category page accessible in list view) exists in QA |
| P1 Execution | Execute TC-001, TC-003, TC-005, TC-007, TC-008, TC-011, TC-012, TC-021, TC-022, TC-023, TC-024, TC-026, TC-028, TC-029 |
| P2 Execution | Execute remaining P2 cases (TC-002, TC-004, TC-006, TC-009, TC-013 to TC-020, TC-025, TC-027) |
| P3 Execution | Execute TC-010, TC-015 (exploratory and edge cases) |
| Bug Fix | Developer fixes any bugs found; re-test |
| Sign-off | QA lead approves or rejects |

---

## 11. RISKS AND MITIGATION

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| No product with correct variation layout configured in QA test data | High | Medium | Check Admin catalog before execution; create/configure test product if needed |
| Mobile layout not covered for table layout (VcTable `#desktop-body` is desktop-only) | Low | Low | TC-009 verifies mobile state; table layout mobile is by-design desktop-only |
| Variations without slug may be absent from QA data (TC-002, TC-004, TC-025) | Medium | Medium | Verify via GraphQL Network response; create variation without slug if needed |
| Clicking Add to Cart inside a linked VcLineItem could accidentally navigate | High | Low | TC-007 and TC-028 explicitly test this separation in both PDP and catalog list view; code review confirms slot architecture prevents interception |
| `getProductRoute` returning `undefined` causes Vue prop warning | Low | Low | Unit tests in PR cover this case; TC-010, TC-021, and TC-029 verify no console warnings |
| Category page regression from PR changes | Low | Very Low | PR modifies only variations-default.vue and variations-table.vue (PDP-only) — TC-015 confirms no category page impact |
| Catalog list view "Variations (N)" expand button not visible at the tested viewport due to `3xl` container breakpoint | Medium | Low | TC-022 and TC-027 account for the breakpoint; use 1920x1080 desktop viewport to ensure the expand button renders; TC-027 explicitly covers mobile behavior |
| Variation data in catalog list view loaded asynchronously — timing could affect link rendering | Low | Low | TC-023 waits for the expansion to complete before verifying links; TC-029 monitors console for errors during async load |

---

## 12. ENTRY / EXIT CRITERIA

### Entry Criteria
- PR #2182 deployed to QA environment (artifact installed)
- Test data confirmed: products with variation layouts (default and table), slugs configured
- `${FRONT_URL}` and `${BACK_URL}` accessible
- This test plan approved by QA lead

### Exit Criteria
- All P1 test cases passed (100%)
- P2 test cases pass rate >= 90%
- No critical or high severity bugs open
- No JavaScript console errors during any test execution
- Test execution report documented

### Suspension Criteria
- QA environment is down or unstable
- No products with variations available in test data
- A blocking bug prevents basic navigation to variation pages

### Resumption Criteria
- Environment restored and stable
- Test data available
- Blocking bug fixed and re-verified

---

## 13. DECISION CRITERIA

**Approve** if: All P1 cases pass; links navigate to correct variation pages in both PDP and catalog list view; add-to-cart unaffected in both contexts; no JS console errors; no regression on product page or catalog list view core features.

**Reject** if: Any P1 case fails with a critical defect — links are broken (404 or wrong product), clicking causes JS errors, add-to-cart triggers unintended navigation in catalog list view, or mobile layout is broken.

**Approve with conditions** if: Minor visual styling issue (e.g., link color not perfectly matching design system tokens), or category page links not yet implemented (already confirmed out-of-scope for this PR). Document condition and create follow-up ticket.
