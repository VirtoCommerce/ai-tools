# Test Plan — VCST-4590: [Marketing] Coupons and Vouchers Page

**Date:** 2026-03-11
**Revised:** 2026-03-11 (post-exploration update)
**Sprint:** Sprint-current
**Prepared by:** test-management-specialist
**Status:** Active — Enhanced after live UI exploration

---

## 1. Objective

Validate the new Coupons & Vouchers page feature in the Virto Commerce B2B storefront. This
feature surfaces active, public promotion coupons to authenticated users so they can copy
coupon codes and apply them in the cart.

Three repositories are in scope:

| Repository | PR | Change |
|---|---|---|
| `vc-module-marketing` | #258 | IsPublic flag on Promotion model; LocalizedString fields for name/description; DB migration `20260223160251_AddLocalizations`; MySQL, PostgreSQL, SQL Server migrations |
| `vc-module-marketing-experience-api` | #14 | New `promotionCoupons` GraphQL query; `PromotionCouponType` schema type; DataLoader batch load for coupon codes; optional `cultureName` parameter on `DynamicContentItemType.dynamicProperties` |
| `vc-frontend` | #2198 | New `/account/coupons` page component; account sidebar "Coupons & promotions" link in Marketing section; coupon card component (name, description, detail, code + click-to-copy button); locale files for all 14 supported languages; skeleton loader during data fetch |

---

## 2. Feature Summary (from JIRA VCST-4590)

**User story:** As a user I want to be able to see available coupons and vouchers so the system
can tell me what I can apply and where I can benefit from discounts.

**Key behaviors implied by the story and design (node-id=2538-229020):**
1. Authenticated users see the Coupons & promotions page at `/account/coupons` via the account sidebar under the Marketing section.
2. Each card shows the promotion name (localized), description (localized), optional detail text, and a coupon code button.
3. Clicking the coupon code copies it to the clipboard with a toast notification ("Coupon copied successfully").
4. Only active, public (`IsPublic=true`) promotions with at least one coupon code are shown.
5. Results are paginated via GraphQL cursor-based pagination.
6. The `promotionCoupons` GraphQL query accepts `storeId`, `cultureName`, `first`, and `after` parameters.
7. The `DynamicContentItemType` regression: adding optional `cultureName` to `dynamicProperties` must not break existing dynamic content queries.

**Sources of data for frontend (from JIRA):**
- Promotion.IsPublic (Admin-managed toggle on the promotion)
- Promotion.LocalizedName / Promotion.LocalizedDescription (new localized fields from PR #258)
- Promotion.Coupon.Code (existing coupon code from coupons assigned to the promotion)
- Promotion.EndDate (for display; null means no expiry)

---

## 3. Scope

### In Scope

**Frontend (qa-frontend-expert):**
- Account sidebar: "Coupons & promotions" link in Marketing section, active state
- Page navigation: direct URL access, browser back, locale-prefixed URL
- Coupon card display: name, description, detail text, code button
- Click-to-copy: clipboard copy, "Coupon copied successfully" toast, manual dismiss
- Layout quality: empty state, cards with/without detail text, no JS errors on load
- Localization: locale-prefixed URL, storefront language switching (in scope for i18n tests)
- E2E happy path: copy from coupons page → paste in cart → apply discount

**Backend API (qa-backend-expert):**
- Admin SPA: IsPublic field on Promotion blade, localized name/description fields, persistence
- REST API: promotion CRUD with IsPublic field, coupon codes
- GraphQL `promotionCoupons` query: filtering (public only), pagination (cursor-based), cultureName localization
- DataLoader batch: distinct coupon codes per promotion (no N+1, no cross-contamination)
- DynamicContentItemType regression: `dynamicProperties(cultureName)` backward compatibility
- Module installation and DB migration verification

**Integration / Cross-Layer:**
- Admin save → storefront display propagation (within expected latency)
- Private promotion filtered out in both Admin (as expected) and storefront GraphQL
- Full E2E: Admin creates promotion → storefront coupons page shows it → user copies code → applies in cart

**Business Invariants:**
- BL-CART-003: Coupon applies to already-discounted (sale) price, not list price
- BL-PRICE-001: Discount stacking order preserved when coupon applied after tier pricing
- BL-CHK-006: Order total formula correct after coupon applied through coupons page

### Out of Scope

- Payment processing (not modified in these PRs)
- Other marketing features (content publishing, placeholders, loyalty points unrelated to this story)
- WCAG 2.1 accessibility testing (delegated to ui-ux-expert)
- Figma visual comparison (delegated to ui-ux-expert)
- Responsive / mobile layout (delegated to ui-ux-expert)
- CI pipeline configuration changes

---

## 4. Test Environment

| Item | Value |
|---|---|
| Environment | QA |
| Frontend URL | `{{FRONT_URL}}` env var |
| Backend URL | `{{ADMIN_URL}}` env var (Admin SPA); `{{BACK_URL}}` env var (REST/GraphQL) |
| GraphiQL | `{{FRONT_URL}}/ui/graphiql` |
| Theme | Coffee (B2B) |
| Marketing module | VirtoCommerce.Marketing >= 3.1001.0-pr-258 |
| Marketing xAPI module | VirtoCommerce.MarketingExperienceApi >= 3.1000.0-pr-14 |
| Frontend artifact | vc-theme-b2b-vue >= 2.44.0-pr-2198 |
| Design reference | https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/STOREFRONT-DRAFT-3?node-id=2538-229020 |

### Pre-conditions Before Execution

1. Both backend artifact ZIPs installed in QA — verify in Admin > Modules > Installed:
   - `VirtoCommerce.Marketing` with version >= 3.1001.0
   - `VirtoCommerce.MarketingExperienceApi` with version >= 3.1000.0
2. DB migration `20260223160251_AddLocalizations` applied — visible in `__EFMigrationsHistory` table on SQL Server.
3. Test data seeded (see `test-data.md`): at least 7 promotions with IsPublic=true and distinct coupon codes.
4. HTTPS environment confirmed (required for Clipboard API on storefront).
5. Test user accounts configured: personal account (`{{USER_EMAIL}}`) + B2B org account (`{{ORG_USER_EMAIL}}`).

---

## 5. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Both backend artifacts must be deployed together (alpha dependency between modules) | Medium | High | Verify both installed before starting any test; block if either missing |
| R2 | DB migration not run in QA | Low | High | Check `__EFMigrationsHistory` table first (CPN-031 covers this) |
| R3 | Clipboard API requires HTTPS — blocked in non-HTTPS or certain browser contexts | Low | Medium | QA is HTTPS; if clipboard blocked, use `evaluate` script workaround |
| R4 | DynamicContentItemType side-effect from PR #14 breaks existing dynamic content queries | Medium | P1 | Explicit regression test CPN-032 |
| R5 | No formal acceptance criteria in JIRA ticket | High | Medium | Tests derived from user story, design (Figma node-id=2538-229020), PR descriptions, business logic invariants |
| R6 | DataLoader cross-contamination: coupon codes mixed across promotions | Low | High (revenue) | CPN-025 explicitly tests for distinct codes per promotion |
| R7 | Private promotion coupon visible on storefront if filtering has a bug | Low | High (security) | CPN-027 and CPN-035 verify private promotions are excluded at both API and cart levels |

---

## 6. Test Strategy

Execution is split across four parallel phases. Each phase has a dedicated agent and browser.

### Phase 1 — Pre-Conditions Check (test-management-specialist)

Before browser testing begins:
1. Run CPN-031: verify both modules installed at correct versions.
2. Confirm DB migration applied (check `__EFMigrationsHistory` or run CPN-031 step).
3. Confirm test data is seeded per `test-data.md`.
4. If any pre-condition fails: block all phases and escalate to qa-lead-orchestrator.

### Phase 2 — Backend / Admin (qa-backend-expert, playwright-edge)

Target test cases: CPN-019, CPN-020, CPN-022, CPN-023, CPN-024, CPN-025, CPN-026, CPN-027, CPN-031, CPN-032

Focus areas:
- Admin SPA promotion blade: IsPublic, localized fields, persistence
- REST API promotion CRUD
- GraphQL promotionCoupons query: filtering, pagination, localization
- DataLoader batch correctness
- DynamicContentItemType regression

### Phase 3 — Frontend / UI (qa-frontend-expert, playwright-chrome)

Target test cases: CPN-001, CPN-002, CPN-003, CPN-004, CPN-005, CPN-006, CPN-007, CPN-008,
CPN-009, CPN-010, CPN-011, CPN-012, CPN-013, CPN-014, CPN-015, CPN-016, CPN-017, CPN-018,
CPN-034, CPN-036

Focus areas:
- Page navigation and access control
- Coupon card display
- Click-to-copy functionality
- Console error absence
- Expiry filtering
- B2B org user access

Run Phases 2 and 3 in parallel after Phase 1 passes.

### Phase 4 — Integration / E2E Cross-Layer (qa-testing-expert, playwright-firefox)

Target test cases: CPN-021, CPN-028, CPN-029, CPN-030, CPN-033, CPN-035

Focus areas:
- Admin save → storefront propagation
- BL-CART-003: coupon on sale price (not list price)
- BL-PRICE-001: stacking order
- BL-CHK-006: order total formula
- Full E2E happy path (Admin create → display → copy → apply)
- Negative: private coupon blocked in cart

Phase 4 can run in parallel with Phases 2 and 3, but CPN-033 depends on Phase 2 (promotion creation via Admin SPA) and Phase 3 (storefront page visibility) having passed at least their respective setup steps.

### Phase 5 — Consolidation (qa-lead-orchestrator)

- Collect all agent reports from Phases 2–4
- Apply quality gate evaluation
- Update JIRA VCST-4590 with pass/fail verdict

---

## 7. Cross-Layer Verification Checklist (for every P0/P1 E2E test)

- [ ] STOREFRONT: coupon card visible, code button functional, copy notification shown
- [ ] CONSOLE: No JavaScript errors in browser console during page load and copy action
- [ ] NETWORK: No failed API calls (4xx/5xx) on /graphql during coupons page interactions
- [ ] API: GraphQL `promotionCoupons` query returns correct filtered/paginated/localized data
- [ ] ADMIN: Promotion blade reflects saved IsPublic and localized fields correctly
- [ ] CART: addCoupon mutation `errors[]` is empty; discount appears in cart totals

---

## 8. Entry / Exit Criteria

### Entry Criteria (all must pass before execution)

- Both backend modules installed and verified (CPN-031)
- DB migration applied
- At least 7 test promotions with IsPublic=true seeded (see `test-data.md`)
- `{{FRONT_URL}}` and `{{ADMIN_URL}}` accessible from test runner

### Exit Criteria — PASS

- All 48 test cases executed (36 original + 12 new)
- 0 P0/Critical bugs open
- 0 P1/High bugs blocking revenue flows (BL-CART-003, BL-PRICE-001, BL-CHK-006 all pass)
- Pass rate >= 95%
- DynamicContentItemType regression (CPN-032) passes

### Exit Criteria — FAIL → REOPEN ticket

- Any of these fails: CPN-001, CPN-004, CPN-022, CPN-028, CPN-033
- BL-CART-003 violated: coupon applies to list price instead of sale price
- Private promotion visible on storefront (CPN-027 fails)
- GraphQL query returns wrong/unfiltered data (CPN-022 fails)

---

## 9. Test Cases Summary

### Original 36 Cases

| Section | Count | IDs | Priority |
|---|---|---|---|
| Access & Navigation | 6 | CPN-001, CPN-002, CPN-008, CPN-010, CPN-017, CPN-018 | 2 Critical, 2 High, 2 Low |
| Coupon Card Display | 5 | CPN-003, CPN-006, CPN-007, CPN-009, CPN-016 | 1 Critical, 2 High, 2 Medium |
| Copy Functionality | 3 | CPN-004, CPN-011, CPN-015 | 1 Critical, 1 Medium, 1 Medium |
| Business Logic (Expiry, Store Context) | 2 | CPN-012, CPN-014 | 2 High |
| Quality (Console Errors) | 1 | CPN-013 | 1 High |
| End-to-End (Copy → Cart Apply) | 1 | CPN-005 | 1 Critical |
| B2B Org User | 1 | CPN-036 | 1 High |
| Admin Backend | 2 | CPN-019, CPN-020 | 1 Critical, 1 High |
| Admin → Frontend Cross-Layer | 2 | CPN-021, CPN-027 | 2 Critical |
| GraphQL API | 4 | CPN-022, CPN-023, CPN-024, CPN-025 | 1 Critical, 3 High |
| REST API CRUD | 1 | CPN-026 | 1 Critical |
| Business Invariants | 3 | CPN-028, CPN-029, CPN-030 | 3 Critical |
| Backend Infrastructure | 1 | CPN-031 | 1 High |
| Regression (DynamicContent) | 1 | CPN-032 | 1 High |
| Full E2E Integration | 1 | CPN-033 | 1 Critical |
| Negative Cases | 2 | CPN-034, CPN-035 | 2 High |

### New Cases Added After Live UI Exploration (CPN-037 to CPN-048)

| Section | Count | IDs | Priority | Gap Covered |
|---|---|---|---|---|
| Cart Integration | 2 | CPN-037, CPN-038 | 2 High | Real 'Deny' removal button; expandable Discount breakdown UI |
| Admin Backend — Coupon-Level | 3 | CPN-039, CPN-040, CPN-041 | 1 High, 1 Medium, 1 Medium | Usage limits (max total + per-customer); coupon-level expiry date; alphanumeric code constraint |
| Admin Backend — Promotion-Level | 3 | CPN-042, CPN-045, CPN-046 | 1 High, 1 Medium, 1 Medium | Globally exclusive vs stackable; 'Can be redeemed more than once' toggle; priority ordering |
| Business Logic | 2 | CPN-043, CPN-048 | 1 High, 1 High | Auto-promotions without codes excluded from coupons page; store-scoping enforcement |
| Analytics | 1 | CPN-044 | 1 Medium | GA4 ep.coupon tracking in cart events |
| Admin Backend — Import | 1 | CPN-047 | 1 Low | Bulk coupon code import via CSV |

### Total

| | Count |
|---|---|
| Total test cases | **48** |
| Critical | 10 |
| High | 24 |
| Medium | 9 |
| Low | 5 |

**Priority breakdown:** Critical: 10 | High: 24 | Medium: 9 | Low: 5

---

## 10. Traceability Matrix (Implicit AC → Test Cases)

| Implicit Acceptance Criterion | Test Cases |
|---|---|
| AC1: Coupons page accessible from account sidebar (Marketing section) | CPN-001, CPN-002, CPN-008 |
| AC2: Unauthenticated users redirected | CPN-002 |
| AC3: Each card shows name, description, detail text, coupon code | CPN-003, CPN-006, CPN-007, CPN-009 |
| AC4: Clicking code copies to clipboard with toast | CPN-004, CPN-011, CPN-015 |
| AC5: Only public, active, store-scoped promotions with codes shown | CPN-012, CPN-014, CPN-022, CPN-027 |
| AC6: GraphQL promotionCoupons query works with pagination | CPN-022, CPN-023 |
| AC7: GraphQL cultureName localization | CPN-024 |
| AC8: DataLoader — no coupon code cross-contamination | CPN-025 |
| AC9: Admin IsPublic field persists | CPN-019, CPN-026 |
| AC10: Admin localized name/description fields persist | CPN-020, CPN-024 |
| AC11: Admin change reflected on storefront | CPN-021, CPN-033 |
| AC12: BL-CART-003 satisfied (coupon on sale price) | CPN-028, CPN-005 |
| AC13: BL-PRICE-001 stacking order | CPN-029 |
| AC14: BL-CHK-006 order total formula | CPN-030 |
| AC15: DynamicContentItemType regression free | CPN-032 |
| AC16: DB migration applied, modules installed | CPN-031 |
| AC17: Invalid/private coupon handled gracefully in cart | CPN-034, CPN-035 |
| AC18: B2B org user can access coupons page | CPN-036 |
| AC19: Coupon removal via 'Deny' button restores cart total | CPN-037 |
| AC20: Discount breakdown shows per-coupon amounts (expandable) | CPN-038 |
| AC21: Coupon-level max uses and per-customer limits enforced | CPN-039 |
| AC22: Coupon-level expiry date independent of promotion expiry | CPN-040 |
| AC23: Coupon code alphanumeric constraint enforced | CPN-041 |
| AC24: Globally exclusive promotion blocks coupon stacking | CPN-042 |
| AC25: Automatic promotions (no coupon codes) excluded from coupons page | CPN-043 |
| AC26: GA4 ep.coupon tracked in cart events when coupon applied | CPN-044 |
| AC27: 'Can be redeemed more than once' toggle persists | CPN-045 |
| AC28: Promotion priority/ordering field present and configurable | CPN-046 |
| AC29: Bulk coupon code import via Admin Import button | CPN-047 |
| AC30: Promotion store-scoping: not visible in unassigned store | CPN-048 |

---

## 11. Delegation Recommendations

| Test Cases | Assign To | Browser |
|---|---|---|
| CPN-001–018, CPN-034, CPN-036, CPN-037, CPN-038 | qa-frontend-expert | playwright-chrome |
| CPN-019–020, CPN-022–027, CPN-031–032, CPN-039–042, CPN-045–048 | qa-backend-expert | playwright-edge |
| CPN-021, CPN-028–030, CPN-033, CPN-035, CPN-043, CPN-044 | qa-testing-expert (cross-layer) | playwright-firefox |
| Visual Figma comparison, WCAG, responsive | ui-ux-expert | Chrome DevTools MCP |

**Notes on new cases:**
- CPN-037, CPN-038: Require real cart with applied coupon — use `playwright-chrome` (same session as frontend tests)
- CPN-039–041: Admin coupon blade detail — `playwright-edge` (admin SPA)
- CPN-042: Requires both admin setup AND cart interaction — assign to `qa-testing-expert` for cross-layer coverage
- CPN-043: Requires Admin IsPublic toggle + storefront verification — cross-layer, assign to `qa-testing-expert`
- CPN-044: Requires network request inspection on cart page — `playwright-firefox` with network monitoring
- CPN-047: Requires file upload to Admin — `playwright-edge`

---

## 12. Live UI Exploration Findings (2026-03-11)

Exploration was performed against the QA environment using `playwright-chrome`. Key findings that affected test accuracy:

### Real UI Labels Confirmed

| Area | Spec/Assumption | Real UI Label (Confirmed) |
|---|---|---|
| Cart coupon input | "coupon/promo code input field" | `textbox "Enter a promo-coupon"` |
| Coupon removal button | "Remove" or "X" | `button "Deny"` |
| Coupon notification | "Coupon copied successfully" | "Coupon copied successfully" (confirmed correct) |
| Notification dismiss | "Close" | `button "Close alert"` (confirmed correct) |
| Storefront URL prefix | `/account/coupons` | `/en-GB/account/coupons` (locale-prefixed by default) |
| Frontend version deployed | vc-theme-b2b-vue >= 2.44.0-pr-2198 | `2.44.0-pr-2198-6327-6327c148` (confirmed) |

### Admin Blade — Confirmed Fields

The promotion detail blade in Marketing > Promotions contains these fields (in order):
1. **Active** toggle ("Use this button to enable or disable your promotion")
2. **Public** toggle ("Display this promotion on storefront")
3. **Promotion name** (free text)
4. **Localized name** per locale — 9 locales: es-ES, pl-PL, pt-PT, ja-JP, zh-CN, de-DE, it-IT, en-US, fr-FR, ru-RU (first 2 shown, rest under "Show more languages")
5. **Localized description** per locale (same 9 locales)
6. **Start date** + **Expiration date** (datetime pickers)
7. **Stores** (multi-store list with "Add" option; current test data scoped to B2B-store)
8. **Coupons tab** (count badge) + **Usage History tab** (count badge)
9. **Promotion conditions**: user group, catalog conditions, cart conditions, rewards (all configurable)
10. **Description** (free text)
11. **Exclusivity** dropdown: exactly 2 options — "Valid with other offers" / "Globally exclusive"
12. **Can be redeemed more than once** toggle

### Coupon Detail Blade — Confirmed Fields

Individual coupon blade (opened from Coupons tab) contains:
- **Code** textbox (hint: "Coupon code may contain only alphanumeric characters")
- **Coupon expiration date** (separate from promotion expiry; hint: "Leave this field blank in case it is the same as the promotion expiration date")
- **Maximum use number** spinbutton (0 = unlimited)
- **Maximum uses per customer** spinbutton (0 = unlimited)
- **Total use count** (read-only, disabled textbox)

Coupons tab toolbar: **Add**, **Import**, **Refresh**, **Delete** buttons.

### Admin Promotions List — Confirmed Columns

Name, Active (toggle icon), Has Coupon (toggle icon), Start Date, End Date, Description. Total promotions: 33 across 2 pages.

### Cart Order Summary — Confirmed Structure

- **Subtotal** (static amount)
- **Discount** (collapsible button — expands to show per-coupon code + amount breakdown)
- **Tax**
- **Shipping cost**
- **Total**
- **Promotion code** section: `textbox "Enter a promo-coupon"` + `button "Deny"` (when coupon applied)
- **Place order** button
- **Quote request** section (B2B — "Add cart items to quote")

### Available Reward Types (14 total)

1. `$... off cart subtotal`
2. `...% off cart subtotal, no more than $...`
3. `... free items of ... product`
4. `$... off`
5. `$... off for ... specific product items`
6. `...% off for product ..., no more than $...`
7. `...% off for ... specific product items, no more than $...`
8. `... items of ... product as a gift`
9. `$... off for shipping at ...`
10. `% off for shipping at ..., no more than $...`
11. `$... off for using ... payment method`
12. `...% off for using ... payment method, no more than $...`
13. `...% off for ... of every ... specific product items`
14. `...% off for ... items of a specific product per every ... items of another product`

### Available Cart Conditions (6 total)

1. Number of items in the shopping cart
2. Number of items out of a category in the shopping cart
3. Number of specific product items in the shopping cart
4. Payment type is...
5. Shipping type is...
6. Cart subtotal is...

### Available Catalog Conditions (6 total)

1. Specific category
2. Product code contains...
3. Currency is...
4. Specific product
5. In stock quantity is...
6. Apply only to full price items and not sales items

### GA4 Coupon Tracking (Confirmed)

When coupon QA10OFF is applied in cart, these GA4 events include `ep.coupon=QA10OFF`:
- `view_cart`
- `begin_checkout`
- `add_shipping_info` (includes `ep.shipping_tier`)
- `add_payment_info` (includes `ep.payment_type`)

### Test Cases Corrected (Label Fixes)

CPN-005, CPN-028, CPN-029, CPN-033, CPN-034, CPN-035, CPN-015 — all updated to use real cart UI labels: `textbox "Enter a promo-coupon"` and `button "Deny"` instead of generic "coupon input field" / "Remove" / "Apply button".

---

## 13. Defect Reporting

All bugs filed as JIRA issues in VCST project, linked to VCST-4590.

| Severity | Condition |
|---|---|
| P0 | BL-CART-003/BL-CHK-006 violation; private coupon visible on storefront; page inaccessible |
| P1 | Page broken or blank; GraphQL query returns wrong/unfiltered data; clipboard copy non-functional; modules not installed |
| P2 | UI deviation from Figma; WCAG AA failure; localization missing; empty state not graceful |
| P3 | Minor cosmetic issue; low-impact UX problem |

**Artifacts path:** `tests/Sprint-current/VCST-4590/`
