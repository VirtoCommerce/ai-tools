# Sprint 26-08 Test Plan

**Document status:** Draft  
**Author:** test-management-specialist  
**Created:** 2026-04-30  
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)  
**Sprint dates:** 2026-04-14 – 2026-04-28 (inferred from merged PR and JIRA Done timestamps)

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-08 |
| Date range | 2026-04-14 – 2026-04-28 |
| Theme | Configurable Products maturation, Marketing/Coupons storefront, Checkout address search, Frontend BEM refactor, Page Builder localization, BOPIS pagination fix |
| Total Done tickets | 47 (15 Stories, 16 Bugs, 4 Review tasks, 1 Spike, 9 Tasks/TechDebt) |
| Test-relevant Done tickets | 30 (Stories + Bugs with QA impact) |
| Merged frontend PRs (in sprint window) | 27 PRs in vc-frontend |

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-4896 | [Marketing][Cart] Coupons sidebar | Marketing / Cart |
| VCST-4710 | [E2E][Checkout][Shipping] Address selection popup — advanced search and facets | Checkout / Addresses |
| VCST-4713 | [Catalog][Product][Configuration] Conditional sections | Configurable Products |
| VCST-4928 | [Frontend] Add live character counter to configurable product Text section inputs | Configurable Products |
| VCST-4926 | Page Builder Localization | CMS / Page Builder |
| VCST-4848 | Virto Pages — Index Rebuild, Content Providers, and Export/Import | CMS / Search |
| VCST-4768 | Product Snapshot | Catalog / Admin |
| VCST-4894 | System Operations module 4 Developer Tools | Platform |
| VCST-4899 | [Support] Disable/Hide password forget on VC Manager | Auth / Platform |
| VCST-4983 | [Support] Improve refund data model | Orders / Payments |
| VCST-2285 | [UI kit] Rework search component | Search / UI Kit |
| VCST-2284 | [Catalog browsing][Mobile] Rework search experience | Search / Catalog |
| VCST-4893 | Add support for payment localization (PR #2256) | Payment / i18n |
| VCST-4729 | Remove forced sorting of terms facets — switched to backend sort (PR #2238) | Catalog / Search |
| VCST-4725 | Impersonate user in preview mode for Page Builder (PR #2237) | CMS / Auth |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain |
|-----|----------|---------|--------|
| VCST-4992 | Highest | [Checkout][Shipping] Address popup column sort not wired (aria-sort declared but non-functional) | Checkout / A11y |
| VCST-4707 | High | [BOPIS] Pre-selection fails for pickup locations outside first 50 results (pagination bug) | BOPIS |
| VCST-4986 | High | Wishlist popup: checkbox does not visually uncheck when removing a product | Catalog / Wishlist |
| VCST-4934 | High | [Support] SecurityController.Update overwrites LockoutEnd, breaking storefront auth | Auth / Security |
| VCST-4989 | High | [Support] Time picker doesn't use user timezone | Platform / Admin |
| VCST-4991 | Medium | [Security] CVE-2026-40372: ASP.NET Core Elevation of Privilege Vulnerability | Security / Platform |
| VCST-4826 | Medium | [Configurable Products] "None" on optional File section does not clear uploaded files | Configurable Products |
| VCST-4825 | Medium | Disable file upload when max file limit reached (PR #2262) | Configurable Products |
| VCST-4950 | Medium | Page Builder — Clone button has no debounce, double-click creates duplicate pages | CMS / Page Builder |
| VCST-4951 | Low | Page Builder — Toast notification coverage inconsistent across operations | CMS / Page Builder |
| VCST-4884 | Medium | [Support] Sorting by "Modified Date" resets when a search keyword is entered | Search / Admin |
| VCST-4851 | Medium | Missing localization for settings in Global Settings UI | Platform / i18n |
| VCST-4477 | Medium | Order Management: Selected statuses are lost after adding a product in Order Edit | Orders / Admin |
| VCST-4631 | Low | Admin SPA: Shipping module calls /api/shipping/pickup-locations/indexedSearchEnabled before auth | BOPIS / Auth |
| VCST-4987 | — | Rollback text section maxLength validation for configurable products | Configurable Products |
| VCST-4800 | — | Fire purchase GA4 event when payment completes via finalizePayment (PR #2250) | Analytics |

### 2.3 TechDebt / Structural (QA-relevant: may impact test selectors)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-4888/4887/4886 | [BEM] Replace Tailwind with BEM in shared/account/ components (3 PRs) | Frontend / All |
| VCST-4841 | [BEM][UI-kit] Use BEM in UI-kit components | Frontend / All |
| VCST-4846 | Mark deprecated components in Storybook sidebar | Storybook |
| PR#2234 | feat: refactor data-test-ids | All UI layers |

### 2.4 Out of Scope

- VCST-4958: Katalon → Python/Pytest CI migration (infrastructure only, no functional change to test)
- VCST-4813: Architecture review spike for enterprise carts (no deliverable shipped to QA env)
- VCST-4953/4773/4895: CI tooling and dataset manager improvements (internal tooling)
- VCST-5014/5011: Support tickets with fixes not deployed to QA in this sprint window
- VCST-4870/4875/4877/4970: QA process tasks (module updates, regression runs)
- VCST-4959/5004/4990: Code review tasks (no direct user-facing changes)
- VCST-1886: Design task (no functional implementation in this sprint)
- Non-VCST support items (LuminousLabs, GitHub issues) not deployed to QA env

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Configurable Products (conditional sections + char counter + file fixes) | 5 | 4 | 20 | Critical | Three concurrent changes to the same section-handling logic; conditional sections is a new feature; regression surface is high |
| Checkout / Shipping Address Popup (VCST-4710 + VCST-4992) | 4 | 5 | 20 | Critical | Advanced search + facets on address popup is significant new behaviour; highest-priority bug fix in same component; checkout is P0 revenue path |
| BOPIS Pickup Pre-selection (VCST-4707) | 4 | 4 | 16 | Critical | Pagination bug fix in pickup location selector; previously blocked real-world pickup flows for stores with >50 locations |
| Marketing / Coupons Sidebar (VCST-4896) | 4 | 4 | 16 | Critical | New storefront feature on cart page; involves GraphQL xAPI (promotionCoupons), new UI component, cross-layer cart impact |
| Auth / Security (VCST-4934, VCST-4991) | 3 | 5 | 15 | High | SecurityController LockoutEnd regression + CVE fix; auth flows are P0 |
| Search Component Rework (VCST-2285, VCST-2284, VCST-4729) | 4 | 3 | 12 | High | UI kit search component rewrite + mobile catalog search; facet sort behaviour change; broad surface area |
| CMS / Page Builder (VCST-4926, VCST-4848, VCST-4950, VCST-4951, VCST-4725) | 3 | 3 | 9 | Medium | Localization + export/import + debounce fix; page builder is used but not on the critical purchase path |
| Orders / Admin (VCST-4477, VCST-4983) | 3 | 3 | 9 | Medium | Status-loss bug in order edit; refund data model improvement |
| Analytics / GA4 (VCST-4800) | 3 | 3 | 9 | Medium | finalizePayment GA4 event fix; affects tracking data quality |
| Frontend BEM Refactor (VCST-4886/4887/4888, VCST-4841, PR#2234) | 3 | 3 | 9 | Medium | CSS class rename + data-test-id refactor across account/ components; existing CSS-selector-based tests may break |
| Payment Localization (VCST-4893) | 2 | 3 | 6 | Medium | i18n strings for payment step; limited functional impact |
| Platform (VCST-4899, VCST-4851, VCST-4989) | 2 | 2 | 4 | Low | Admin-only: disable forgot-password option, missing localization strings, time picker timezone |
| Wishlist (VCST-4986) | 2 | 2 | 4 | Low | Visual-only checkbox state fix; no data integrity risk |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Configurable Products | Yes | Yes | — | Yes | Yes | — |
| Checkout / Address Popup | Yes | — | — | Yes | Yes | — |
| BOPIS | Yes | Yes | — | Yes | — | — |
| Marketing / Coupons | Yes | Yes | Yes | Yes | — | — |
| Auth / Security | Yes | Yes | Yes | — | — | — |
| Search Component | Yes | — | — | Yes | Yes | — |
| CMS / Page Builder | — | Yes | Yes | Yes | — | — |
| Orders / Admin | Yes | Yes | Yes | Yes | — | — |
| Analytics / GA4 | Yes | — | — | — | — | Yes |
| Frontend BEM / data-test-ids | Yes | — | — | — | Yes | — |
| Payment Localization | Yes | — | — | — | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- Configurable Products: full layer stack (storefront + admin + GraphQL)
- Checkout address popup: E2E journey + accessibility audit
- BOPIS pre-selection: functional regression + pagination boundary verification
- Coupons sidebar: storefront + GraphQL xAPI + admin cross-layer

**High domains (run in parallel with critical):**
- Auth/Security: regression against suites 031-033, 044
- Search rework: functional regression against suites 004-005

**Medium domains (run after critical/high pass):**
- CMS / Page Builder, Orders/Admin, GA4, BEM regression sweep

### 4.3 Test Design Techniques by Domain

| Domain | Technique | Rationale |
|--------|-----------|-----------|
| Conditional sections (VCST-4713) | Decision Table + State Transition | Multiple section types × visibility conditions × required/optional state |
| Char counter (VCST-4928) | BVA | 0, 1, maxLength-1, maxLength, maxLength+1 |
| File section fixes (VCST-4826, VCST-4825) | State Transition + EP | None/selected states; file count at max boundary |
| Checkout address popup (VCST-4710, VCST-4992) | Pairwise + BVA | Search text × facet combination; sort column × direction |
| BOPIS pagination (VCST-4707) | BVA | 50th result, 51st result, last result |
| Coupons sidebar (VCST-4896) | Decision Table + EP | Valid/invalid/expired/used coupon × promo type |
| Facet sort change (VCST-4729) | EP | Frontend-sorted vs backend-sorted behaviour |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|---------------|----------|
| 042 | Smoke | Cross-cutting | Always | P0 |
| 044 | Security | Cross-cutting | VCST-4934, VCST-4991 | P0 |
| 031 | Login / Auth | Auth | VCST-4934 | P0 |
| 032 | Registration | Auth | VCST-4934 | P1 |
| 036 | BOPIS Store Selector | BOPIS | VCST-4707, VCST-4631 | P1 |
| 037 | BOPIS Cart | BOPIS | VCST-4707 | P1 |
| 038 | BOPIS Checkout | BOPIS | VCST-4707 | P1 |
| 028 | Cart Core | Cart | VCST-4896, VCST-4986 | P1 |
| 029 | Cart Validation | Cart | VCST-4896 | P1 |
| 011 | Checkout Flow | Checkout | VCST-4710, VCST-4992 | P0 |
| 012 | Checkout Guest | Checkout | VCST-4710 | P1 |
| 013 | Checkout B2B | Checkout | VCST-4710 | P1 |
| 077 | Marketing Storefront | Marketing | VCST-4896 | P1 |
| 023 | Marketing Admin – Promotions | Marketing | VCST-4896 | P1 |
| 025 | Marketing Admin – Coupons/API | Marketing | VCST-4896 | P1 |
| 050 | GraphQL xAPI | GraphQL | VCST-4896, VCST-4710, VCST-4707 | P1 |
| 072 | Configurable Products UI | Config Products | VCST-4713, VCST-4928, VCST-4826, VCST-4825, VCST-4987 | P1 |
| 072b | Configurable Products E2E | Config Products | VCST-4713 | P1 |
| 052 | Configurable Products Admin | Config Products | VCST-4713 | P1 |
| 004 | Search Core | Search | VCST-2285, VCST-2284, VCST-4729 | P1 |
| 005 | Search Filters | Search | VCST-4729 | P1 |
| 059 | CMS Page Management | CMS | VCST-4926, VCST-4848, VCST-4950, VCST-4951, VCST-4725 | P2 |
| 060 | CMS Design / Content | CMS | VCST-4725 | P2 |
| 017 | Orders Admin | Orders | VCST-4477, VCST-4983 | P2 |
| 018 | Orders Admin – Payments | Orders | VCST-4983 | P2 |
| 039 | CyberSource Payment | Payment | VCST-4800 | P0 |
| 040 | Payment Processors | Payment | VCST-4800, VCST-4893 | P1 |
| 043 | GA4 Analytics | Cross-cutting | VCST-4800 | P2 |
| 020 | Platform Users/Roles | Platform | VCST-4899, VCST-4934 | P2 |
| 021 | Platform Dynamic Properties | Platform | VCST-4851 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

The following tickets have **no existing suite coverage** or require net-new test cases:

| Gap ID | Ticket | Description | Target Suite | Owner |
|--------|--------|-------------|-------------|-------|
| GAP-01 | VCST-4710 | Address popup: search by city/zip/name, facet by country/state, sort by any column | Suite 011 + Suite 050 | qa-frontend-expert + qa-backend-expert |
| GAP-02 | VCST-4992 | Address popup: column sort aria-sort attribute verification (A11y) | Suite 011 + Suite 048 (A11y) | qa-frontend-expert |
| GAP-03 | VCST-4713 | Conditional sections: show/hide based on selected option value in parent section | Suite 072 + Suite 072b | qa-frontend-expert + qa-backend-expert |
| GAP-04 | VCST-4896 | Coupons sidebar: full xAPI promotionCoupons query test cases (happy + negative) | Suite 050 + Suite 077 | qa-backend-expert |
| GAP-05 | VCST-4707 | BOPIS pagination: locations beyond page 1 (>50 results) pre-selection | Suite 036 + Suite 037 | qa-frontend-expert |
| GAP-06 | VCST-4800 | GA4 purchase event via finalizePayment flow (non-CyberSource processors) | Suite 043 | qa-frontend-expert |
| GAP-07 | VCST-4893 | Payment step — i18n string rendering per locale (EN, DE, FR at minimum) | Suite 040 | qa-frontend-expert |
| GAP-08 | VCST-4729 | Facet term list order: backend-sorted vs previously frontend-sorted; regression for affected categories | Suite 004 + Suite 005 | qa-frontend-expert |
| GAP-09 | VCST-4725 | Page Builder preview mode: impersonated user sees correct personalised content | Suite 059 | qa-backend-expert |
| GAP-10 | VCST-4983 | Refund data model: refund fields present in order REST API response and Admin order view | Suite 017 + Suite 018 + Suite 049 | qa-backend-expert |
| GAP-11 | VCST-2284/2285 | Mobile search: search component visual and functional regression on 375px viewport | Suite 004 | qa-frontend-expert |
| GAP-12 | BEM refactor | Smoke check: existing test selectors unbroken after BEM rename in account/ + UI-kit components | Suite 042 (Smoke) | qa-frontend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|---------|-----------|----------------|-------------|-----------|
| VCST-4710 | Storefront + GraphQL | P1 Feature | 6–8 | 011, 050 | Pairwise (search text × facet × sort) |
| VCST-4992 | Storefront + A11y | P0 Bug fix | 3 | 011, 048 | EP (sort directions) |
| VCST-4713 | Storefront + Admin + GraphQL | P1 Feature | 8–10 | 072, 072b, 052 | Decision Table (section type × condition value × visibility) |
| VCST-4928 | Storefront | P1 Feature | 4 | 072 | BVA (0, mid, max-1, max, max+1 characters) |
| VCST-4826 | Storefront | P1 Bug fix | 3 | 072 | State Transition (None→file→None) |
| VCST-4825 | Storefront | P1 Bug fix | 2 | 072 | BVA (at max file count, above max) |
| VCST-4896 | Storefront + GraphQL + Admin | P1 Feature | 10–12 | 077, 050, 025 | Decision Table (coupon type × validity × cart state) |
| VCST-4707 | Storefront + GraphQL | P0 Bug fix | 3 | 036, 037 | BVA (location #50, #51, last page) |
| VCST-4800 | Storefront + Analytics | P1 Bug fix | 3 | 043 | EP (finalizePayment vs direct payment paths) |
| VCST-4893 | Storefront | P2 Feature | 3 | 040 | EP (locale EN vs non-EN) |
| VCST-4729 | Storefront | P1 Feature | 3 | 004, 005 | EP (backend-sorted order) + regression check |
| VCST-4725 | Admin SPA | P2 Feature | 2 | 059 | EP (impersonated vs own preview) |
| VCST-4983 | Admin + REST API | P2 Feature | 3 | 017, 049 | EP (refund fields present/absent) |
| VCST-2284 | Storefront | P1 Feature | 4 | 004 | EP + Mobile viewport |
| VCST-4477 | Admin SPA | P1 Bug fix | 2 | 017 | State Transition (status preserved after add-product) |

**Total new cases estimated: 63–72**

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-08 PRs merged to QA branch and deployed
- [ ] Artifact version confirmed via `packages.json` + `artifact.json` (not `image.json`)
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Test data seeded: pickup locations with >50 results available for VCST-4707 BVA
- [ ] At least one coupon with each type (percentage, fixed amount, free shipping) exists for VCST-4896
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`)

### 7.2 Exit Criteria

- [ ] All P0 test cases executed with 100% pass rate
- [ ] All P1 test cases executed with ≥95% pass rate
- [ ] Zero Critical/Blocker open bugs in scope domains
- [ ] High-priority bugs (VCST-4707, VCST-4710, VCST-4992, VCST-4896) verified fixed
- [ ] Regression suites 042, 044, 011, 036-038, 028-029 all pass
- [ ] New test cases for GAP-01 through GAP-05 generated and in Draft status
- [ ] RTM updated to ≥95% coverage for in-scope tickets

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| Pickup locations (>50 entries) | `/qa-seed-data` or live QA data | Required for VCST-4707 BVA — must have at least 51 indexed fulfillment centers |
| Coupons: % discount, fixed amount, free shipping, expired | Admin → Marketing → Coupons | At least one per type; use `{{COUPON_CODE_*}}` vars |
| Products with configurable sections: Text (with maxLength), File (optional), conditional show/hide | Admin → Catalog → Configurable Products | 2–3 products with different section combinations |
| Address with USA + non-USA countries (for state/province facet testing, VCST-4710) | `test-data/addresses/` | Reference `techflow-org-addresses-state-20260423.json` |
| B2B org user + personal account user | `test-data/users/agent-user-pool.csv` | For checkout address popup (org context vs personal) |
| Multi-locale store (EN + at least one non-EN locale) | Admin → Stores | For VCST-4893 payment localization |
| Refundable order in status "Complete" | `test-data/` or seed via API | For VCST-4983 refund data model |

All variables resolved at runtime via `{{VAR}}` bindings or `@td(ALIAS.field)` resolver. No hardcoded IDs, SKUs, emails, or prices in test cases.

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-08 deployment confirmed on QA | 2026-04-29 (done) | DevOps |
| Test plan created | 2026-04-30 (this document) | test-management-specialist |
| P0 bug verifications (VCST-4707, VCST-4992, VCST-4934) | 2026-04-30 – 2026-05-01 | qa-frontend-expert + qa-backend-expert |
| New test case generation — Critical domains (GAP-01 to GAP-05) | 2026-05-01 – 2026-05-02 | test-management-specialist |
| P0 + P1 regression run (suites: 042, 044, 011, 036-038, 028-029, 072, 077) | 2026-05-02 – 2026-05-03 | regression-orchestrator |
| P2 regression run (suites: 059, 017-018, 040, 043, 020-021) | 2026-05-03 – 2026-05-04 | regression-orchestrator |
| New test cases review and promotion (Draft → Reviewed) | 2026-05-04 | qa-lead-orchestrator |
| Final sign-off / go/no-go | 2026-05-05 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: Checkout, BOPIS, Search, Cart, Coupons, Configurable Products, GA4 | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: Configurable Products admin, CMS, Orders, Marketing, Platform | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI: promotionCoupons, address queries, BOPIS fulfillmentCenters, configurable sections | qa-backend-expert | playwright-edge | Interactive |
| REST API: Orders refund, Platform, Marketing coupons API | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| A11y: Address popup aria-sort (VCST-4992), Search component | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** BA agents must not share browser slots with QA agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|-----------------|-------|
| VCST-4896 | Coupons sidebar | Story | Marketing / Cart | Suite 025 (partial), Suite 028 (partial) | GAP-04: ~10 new cases | qa-backend-expert |
| VCST-4710 | Checkout address popup — advanced search + facets | Story | Checkout | Suite 011 (partial journey), Suite 050 (none) | GAP-01: ~6 new cases | qa-frontend-expert |
| VCST-4713 | Conditional sections in product configuration | Story | Configurable Products | Suite 072 (partial), Suite 052 (none) | GAP-03: ~9 new cases | qa-frontend-expert + qa-backend-expert |
| VCST-4928 | Character counter for Text section inputs | Story | Configurable Products | Suite 072 (partial) | 4 BVA cases | qa-frontend-expert |
| VCST-4926 | Page Builder Localization | Story | CMS | Suite 059 (partial) | 2 cases | qa-backend-expert |
| VCST-4848 | Virto Pages — Index Rebuild, Content Providers, Export/Import | Story | CMS | Suite 059 (none) | 3–4 cases | qa-backend-expert |
| VCST-4768 | Product Snapshot | Story | Catalog / Admin | Suite 051 (partial) | 2 cases | qa-backend-expert |
| VCST-4894 | System Operations — Developer Tools | Story | Platform | Suite 063 (none) | 2 cases | qa-backend-expert |
| VCST-4899 | Disable forgot-password on VC Manager | Story | Auth / Platform | Suite 020 (none) | 1 case | qa-backend-expert |
| VCST-4983 | Improve refund data model | Story | Orders | Suite 017/018 (none) | GAP-10: 3 cases | qa-backend-expert |
| VCST-2285 | UI kit — Rework search component | Story | Search | Suite 004 (partial) | GAP-11: 3 mobile cases | qa-frontend-expert |
| VCST-2284 | Mobile search experience rework | Story | Search / Mobile | Suite 004 (none for mobile) | GAP-11: 4 cases | qa-frontend-expert |
| VCST-4893 | Payment localization | Story | Payment | Suite 040 (none) | GAP-07: 3 cases | qa-frontend-expert |
| VCST-4729 | Remove forced facet term sorting | Story | Catalog / Search | Suite 004/005 (partial) | GAP-08: 3 cases | qa-frontend-expert |
| VCST-4725 | Impersonate user in Page Builder preview | Story | CMS / Auth | Suite 059 (none) | GAP-09: 2 cases | qa-backend-expert |
| VCST-4992 | Address popup column sort not wired (Highest bug) | Bug | Checkout / A11y | Suite 011 (none) | GAP-02: 3 cases | qa-frontend-expert |
| VCST-4707 | BOPIS pre-selection fails beyond first 50 results | Bug | BOPIS | Suite 036/037 (partial) | GAP-05: 3 BVA cases | qa-frontend-expert |
| VCST-4986 | Wishlist checkbox doesn't uncheck on remove | Bug | Wishlist | Suite 028 (partial) | 1 state case | qa-frontend-expert |
| VCST-4934 | SecurityController.Update overwrites LockoutEnd | Bug | Auth / Security | Suite 031/044 (partial) | 2 regression cases | qa-backend-expert |
| VCST-4991 | CVE-2026-40372 ASP.NET Core EoP | Bug | Security | Suite 044 (partial) | 1 verification case | qa-backend-expert |
| VCST-4826 | File section "None" doesn't clear files | Bug | Configurable Products | Suite 072 (none) | 3 state cases | qa-frontend-expert |
| VCST-4825 | File upload not disabled at max limit | Bug | Configurable Products | Suite 072 (none) | 2 BVA cases | qa-frontend-expert |
| VCST-4987 | Rollback maxLength validation on Text section | Bug | Configurable Products | Suite 072 (partial) | 2 regression cases | qa-frontend-expert |
| VCST-4950 | Page Builder clone debounce missing | Bug | CMS | Suite 059 (none) | 1 case | qa-backend-expert |
| VCST-4951 | Page Builder toast inconsistency | Bug | CMS | Suite 059 (none) | 2 cases | qa-backend-expert |
| VCST-4884 | Sort by Modified Date resets on search | Bug | Search / Admin | Suite 061 (none) | 1 case | qa-backend-expert |
| VCST-4851 | Missing localization in Global Settings | Bug | Platform | Suite 021/063 (none) | 1 case | qa-backend-expert |
| VCST-4477 | Order edit: statuses lost after adding product | Bug | Orders / Admin | Suite 017 (none) | GAP: 2 state cases | qa-backend-expert |
| VCST-4631 | Admin shipping module calls pickup API before auth | Bug | BOPIS / Auth | Suite 036 (none) | 1 case | qa-backend-expert |
| VCST-4800 | GA4 purchase event via finalizePayment | Bug | Analytics | Suite 043 (none) | GAP-06: 3 cases | qa-frontend-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket that spans storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog data changed (allow 30-60s lag)

Applies to: VCST-4896 (coupons sidebar), VCST-4710 (address popup), VCST-4707 (BOPIS), VCST-4713 (conditional sections), VCST-4800 (GA4 event).

---

## 13. References

- Sprint 26-08 GitHub PRs: `VirtoCommerce/vc-frontend` — PRs #2219, #2225, #2235, #2238, #2250, #2253–2255, #2256, #2262–2268, #2269, #2270
- Module → Suite map: `.claude/agents/knowledge/module-suite-map.md`
- E2E Scenario Catalog: `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- Existing Sprint-current test artifacts: `tests/Sprint-current/VCST-4707/`, `VCST-4710/`, `VCST-4896/`, `VCST-4928/`, `VCST-4987/`
- Test data: `test-data/addresses/techflow-org-addresses-state-20260423.json`, `test-data/users/agent-user-pool.csv`
