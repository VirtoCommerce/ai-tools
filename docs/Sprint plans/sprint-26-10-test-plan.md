# Sprint 26-10 Test Plan

**Document status:** Draft  
**Author:** test-management-specialist (orchestrated by /qa-test-plan)  
**Created:** 2026-05-29  
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)  
**Sprint dates:** 2026-05-18 – 2026-06-01 (from JIRA active sprint "VCST Sprint 26-10", board 126)

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | VCST Sprint 26-10 |
| Date range | 2026-05-18 – 2026-06-01 |
| Theme | Test stabilization · Loyalty Catalog on Store (per-product points factor + storefront browsing) · Frontend application init via xAPI · Page Builder + Virto OZ support · Support fixes (GA4 datalayer, account-lockout enforcement, DE category permalink) · UI-Kit Date Picker · Configurable Products default-option support + Save-for-Later/`selectedForCheckout` fixes · Security hardening (persistent token validation, session invalidation, Scriban/CVE) · B2C Lists a11y + layout-stability polish |
| Total Done tickets | 42 (11 Stories, 15 Bugs, 16 Tasks) |
| Test-relevant Done tickets | 30 (Stories + Bugs + 4 test-relevant tasks: VCST-5149, VCST-5113, VCST-5001, VCST-4839) |
| Merged frontend PRs (in sprint window) | 13 PRs in `vc-frontend` (11 VCST-linked, 2 unlinked/infra) |
| Merged module PRs (in sprint window) | ~9 VCST-linked across `vc-platform`, `vc-module-loyalty`, `vc-module-x-cart` (CMS / x-profile / x-marketing repos not reachable at plan time — see §13) |

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-4642 | [E2E] Frontend Application Initialization via XAPI | Platform / Frontend bootstrap |
| VCST-5023 | [Loyalty] Multiply factor per product per customer group to calculate loyalty points | Loyalty / Pricing |
| VCST-5100 | [Loyalty][Mixed Cart][E2E] Loyalty Catalog Browsing | Loyalty / Catalog (storefront) |
| VCST-5109 | [Support] Improve GA4 datalayer for view_item_list and purchase events | Analytics / GA4 |
| VCST-5074 | [Support] AutoAccountsLockoutJob Not Locking Users | Auth / Security (Platform) |
| VCST-4576 | Persistent Access Token Validation for Enhanced Security Control | Security / Platform |
| VCST-4531 | [E2E] Invalidate all active sessions after password change (Pen Test Remediation) | Security / Auth |
| VCST-4715 | [Catalog][Product][Configuration] Add default option support | Configurable Products |
| VCST-4892 | [UI Kit] Date Picker component | UI-Kit / Storybook |
| VCST-5088 | Backup and Restore Improvements | Platform / Admin |
| VCST-4464 | onX Fulfilment Adapter — Create Order Flow | Integration / onX (backend) |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain |
|-----|----------|---------|--------|
| VCST-5144 | High | [PeakJet] Cut category permalink if switch to DE | i18n / Catalog / SEO |
| VCST-5106 | High | Frontend throws errors if Marketing X-API not installed (`promotionCoupons`) | Marketing / GraphQL resilience |
| VCST-5018 | High | [Cart] Coupons sidebar — error message silent for screen readers (no `role="alert"` / `aria-live`) | Marketing / Cart / A11y |
| VCST-4961 | Medium | [Cart][GraphQL] `selectedForCheckout` on `configurationItems` has no write path | Cart / Configurable / GraphQL |
| VCST-4205 | Medium | Issues with "Save for Later" and Configurable Product functionality | Cart / Configurable Products |
| VCST-4962 | Medium | DELETE /api/cms/{storeId}/menu does not actually delete menu link lists | CMS / REST API |
| VCST-4999 | Medium | [Support] Account lockout policy not enforced on Manager (backend) login | Auth / Security |
| VCST-5017 | Medium | [Cart] Coupons sidebar — apply/trash icon buttons missing `aria-label` (WCAG 4.1.2) | Marketing / Cart / A11y |
| VCST-5030 | Medium | Show-password icon disappears after input loses focus on Change Password page | Auth / UI |
| VCST-5067 | Medium | [A11y] Lists card — modified-date has no screen-reader label | B2C Lists / A11y |
| VCST-5110 | Medium | [Mobile][Lists] CLS exceeds budget (P0) — skeleton-to-grid swap reflow | B2C Lists / Performance |
| VCST-5111 | Medium | [Lists] off-grid spacing values at md+ breakpoints (3 violations) | B2C Lists / Layout |
| VCST-5132 | Medium | Package 'Scriban' 7.0.5 has a known high-severity vulnerability | Security / Dependency |
| VCST-5066 | Low | [A11y] Lists card — save-v2 icon contrast 2.56:1 fails WCAG 1.4.11 | B2C Lists / A11y |
| VCST-5124 | Low | [Cart] Save-for-later bookmark overflows card by 27px when deleted product is unchecked (mobile) | Cart / Layout (mobile) |

### 2.3 TechDebt / Structural (QA-relevant: may impact test selectors, security posture, or shared tooling)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-5149 | [Support] Hotfixes for AutoAccountsLockoutJob | Auth / Security (supports VCST-5074, VCST-4999) |
| VCST-5113 | [Vulnerability] CVE-2026-44503 (Azure.Core / Azure.Identity bump) | Security / Dependency |
| VCST-5001 | [XAPI] `currentOrganizationAddresses` / `currentCustomerAddresses` | xAPI / Profile / Addresses |
| VCST-4839 | Implement dark presets in Storybook | UI-Kit / Storybook (note: only Coffee theme is A11y-compliant — `feedback_a11y_coffee_only`) |
| VCST-4843 | Pin all third-party GitHub Actions to full commit SHA | CI / supply-chain hygiene (vc-frontend #2297, vc-platform #3036) |

### 2.4 Out of Scope

- VCST-5060 — Add decorator for optional tests (test-runner tooling, no product surface)
- VCST-4688 — Community Post: how to use context7 (documentation)
- VCST-5155 — Make indexed docs count verification customizable (search-indexing CI tooling)
- VCST-5151 — Swagger validation for Module CI (CI infrastructure)
- VCST-5130 — Add XMarketing module to docker environment for autotests (CI infrastructure)
- VCST-5125 — Release S14 hotfix for EventBus (release/ops task)
- VCST-5117 — Update modules on vcst environments (ops)
- VCST-5114 — Smoke test on Virtostart-10 (QA process task)
- VCST-5054 — DeprecationWarning: `url.parse()` (code cleanup, no functional surface)
- VCST-5036 — Regression test on QA (only theme)-09 (QA process task)
- VCST-4761 — Add image verification to publish-stable-bundles workflow (CI infrastructure)
- vc-frontend #2300 (chore: graphql types & backend packages), #2301 (VCST-5063 test param — not in this sprint's Done list) — covered only by the smoke safety net (GAP unlinked)

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Frontend bootstrap / xAPI init (VCST-4642) | 4 | 5 | 20 | Critical | Storefront now initializes the application via xAPI `pageContext` — a change to the bootstrap path affects every page. If init regresses, the whole storefront is down; smoke surface for all flows |
| Loyalty Catalog & Points (VCST-5023, VCST-5100) | 4 | 5 | 20 | Critical | New per-product/per-customer-group points factor (pricing engine) + new loyalty-catalog storefront browsing. Touches catalog browse + price calculation = revenue path. Caveat: PTS currency is listing-scope only (see `project_loyalty_catalog_currency_scope`) — PDP/cart/search revert to USD; do not file USD reversion as a bug |
| Security / Auth cluster (VCST-4576, 4531, 5074, 4999, 5149, 5113, 5132) | 4 | 5 | 20 | Critical | Persistent access-token validation + session invalidation on password change + account-lockout enforcement (storefront + backend) + two dependency CVEs. Auth/security defects = privilege/credential exposure; multiple concurrent changes on the same surface |
| Cart × Configurable Products (VCST-4715, VCST-4961, VCST-4205) | 4 | 5 | 20 | Critical | New default-option support + `selectedForCheckout` write-path fix + Save-for-Later configurable repricing — all on the cart's hottest path. P0 revenue surface; configuration must survive save/restore and reprice correctly |
| UI-Kit Date Picker (VCST-4892) | 4 | 3 | 12 | High | New shared `vc-date-picker` component reused across forms and the Orders date-range filter; isolation tests may pass while integration regresses (Esc-to-close, reversed-range validation, filter persistence). Prior retest (2026-05-28) already surfaced issues — verify the confirmed-fixed behaviors |
| GA4 Analytics (VCST-5109) | 3 | 4 | 12 | High | Enriched `view_item_list` and `purchase` datalayer (GA4 is a critical revenue-tracking flow per CLAUDE.md). Broken events corrupt analytics, not checkout — Impact 4 |
| Catalog i18n / SEO permalink (VCST-5144) | 3 | 4 | 12 | High | Category permalink truncated when switching to DE locale → 404/wrong category. Catalog navigation + SEO; affects localized storefronts |
| Marketing resilience + Coupons A11y (VCST-5106, 5018, 5017) | 3 | 4 | 12 | High | `promotionCoupons` query crashed the cart when x-marketing module absent (resilience) + coupon-sidebar screen-reader gaps. Cart-render resilience is high blast-radius if a module is missing |
| B2C Lists polish — layout/CLS/A11y (VCST-5111, 5110, 5067, 5066) | 3 | 3 | 9 | Medium | Spacing-grid, mobile CLS (P0 metric), SR labels, icon contrast on Lists pages. Visual/perf/a11y regressions — covered by 048b layout-stability + 045 |
| Platform/Admin — Backup-Restore, onX, EventBus (VCST-5088, 4464, 5125) | 3 | 3 | 9 | Medium | Backup/restore improvements + onX fulfillment adapter (backend, may not be wired on QA storefront) + EventBus hotfix. Operational impact, low storefront blast radius |
| CMS Menu API (VCST-4962) | 2 | 3 | 6 | Medium | DELETE menu link-lists endpoint was a no-op; admin REST surface, low storefront reach |
| xAPI Addresses (VCST-5001) | 2 | 3 | 6 | Medium | New `currentOrganizationAddresses` / `currentCustomerAddresses` queries; org-vs-personal scope isolation (B2B) |
| Cart mobile layout + Auth password icon (VCST-5124, 5030) | 2 | 2 | 4 | Low | Cosmetic overflow on mobile save-for-later card + show-password icon visibility after blur |
| Storybook dark presets (VCST-4839) | 2 | 2 | 4 | Low | Storybook-only preset selector; dark themes are not A11y-compliant (Coffee only) — verify presets render, do not run a11y gates on dark |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Frontend bootstrap / xAPI init | Yes | — | — | Yes | — | — |
| Loyalty Catalog & Points | Yes | Yes | — | Yes | — | — |
| Security / Auth cluster | Yes | Yes | Yes | — | — | — |
| Cart × Configurable Products | Yes | Yes | — | Yes | — | — |
| UI-Kit Date Picker | Yes | — | — | — | Yes | — |
| GA4 Analytics | Yes | — | — | — | — | Yes |
| Catalog i18n / SEO permalink | Yes | — | — | Yes | — | — |
| Marketing resilience + Coupons A11y | Yes | Yes | — | Yes | Yes | — |
| B2C Lists polish | Yes | — | — | — | Yes | — |
| Platform/Admin (Backup-Restore, onX) | — | Yes | Yes | — | — | — |
| CMS Menu API | — | Yes | Yes | — | — | — |
| xAPI Addresses | — | — | — | Yes | — | — |
| Cart mobile / Auth password icon | Yes | — | — | — | — | — |
| Storybook dark presets | — | — | — | — | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- **Frontend bootstrap / xAPI init (VCST-4642):** smoke the entire storefront after deploy — homepage, catalog, PDP, cart, checkout must render with no console errors when init runs through xAPI `pageContext`. Targeted GraphQL run on `pageContext` (suite 050e) + cross-domain schema (050b4).
- **Cart × Configurable Products (VCST-4715, 4961, 4205):** full layer stack — admin default-option config, storefront PDP preselection, `selectedForCheckout` write path across all selection mutations, Save-for-Later → restore repricing. xAPI runner for 050i/050b2/050b3.
- **Security / Auth cluster:** token revoke → 401 (VCST-4576); session invalidation after password change across devices (VCST-4531); lockout job enforces threshold on storefront + backend Manager login (VCST-5074, 4999, 5149); confirm CVE/Scriban bumps don't regress notification/CMS rendering (5113, 5132).
- **Loyalty Catalog & Points:** admin per-product factor + `loyaltyPoints` on Product xAPI (VCST-5023); storefront loyalty-catalog browsing with PTS in listing only, USD on PDP/cart (VCST-5100, honoring the currency-scope caveat).

**High domains (run in parallel with critical):**
- UI-Kit Date Picker integration on the Orders filter (VCST-4892) — calendar open/close, reversed-range validation, filter persistence, back-nav state.
- GA4 datalayer (VCST-5109) on suite 043 — `view_item_list` + `purchase` enriched fields.
- Catalog DE permalink (VCST-5144) on 001/003/046.
- Marketing resilience + coupon a11y (VCST-5106, 5018, 5017) on 050j/077/077b/045.

**Medium / Low domains (run after critical/high pass):**
- B2C Lists layout/CLS/a11y (5111, 5110, 5067, 5066) — 048b + 045 + 007.
- Platform/Admin (Backup-Restore 5088, onX 4464, CMS menu 4962, xAPI addresses 5001) — Admin SPA + REST + 050d.
- Cart mobile overflow (5124) + show-password icon (5030) — targeted regression on 028/048b and 031.
- Storybook dark presets (4839) — render-only verification, no a11y gate.

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| Configurable default option (VCST-4715) | Decision Table (section type × `isDefault` × required/optional) + EP (one-default-per-section invariant) | New `isDefault` field across admin + storefront + xAPI |
| `selectedForCheckout` write path (VCST-4961) | State Transition (toggle → lineItem reprices) + EP (single / batch / unselect-all / idempotent) | Write path was silently ignored; BL-CART-010 |
| Save-for-Later configurable (VCST-4205) | State Transition (configurable item → saved → restored → config preserved + repriced) | Config integrity through save/restore |
| Frontend xAPI init (VCST-4642) | EP (pageContext returns bootstrap fields; storefront renders clean; degradation when xFrontend unavailable) | Bootstrap resilience; BL-CROSS-011 |
| Persistent token validation (VCST-4576) | State Transition (active → revoke → 401) + EP (expired / revoked / never-issued / valid) | Security state machine; BL-AUTH-005/006 |
| Session invalidation (VCST-4531) | State Transition (change password → sessions invalidated) + EP (same-device / other-device / API-token) | Pen-test remediation; BL-AUTH-003 |
| Account lockout (VCST-5074, 4999) | EP (job runs → locked after threshold; manual API cross-check) | Threshold enforcement; BL-AUTH-003 |
| Loyalty points factor (VCST-5023) | Decision Table (program type × per-product row present/absent × store default) + EP (factor 1 / 2 / 0.5 / absent) | Pricing-rule matrix; assert `loyaltyPoints` on Product query only |
| Loyalty catalog browsing (VCST-5100) | EP (eligible user browses; guard for non-eligible; PTS in listing; USD on PDP) | Honors PTS listing-scope caveat |
| GA4 datalayer (VCST-5109) | EP (view_item_list enriched fields; purchase items array matches order lines) | Branch coverage on analytics events |
| Catalog DE permalink (VCST-5144) | EP (EN permalink / DE permalink / direct URL after locale switch) | Locale-switch URL integrity; BL-CAT-004 |
| Marketing xAPI degradation (VCST-5106) | EP (module installed = sidebar works; absent = renders, `promotionCoupons` null not error) | Resilience branch; BL-CROSS-003/011 |
| Coupon sidebar a11y (VCST-5018, 5017) | EP (role=alert / aria-live; Apply + Trash aria-labels; SR announcement) | WCAG 4.1.2 single-assertion cases |
| UI-Kit Date Picker (VCST-4892) | State Transition (open → range → apply → persist; Esc closes; reversed-range validation; back-nav retains) + BVA (same-day / 1-day / max-date range) | Component + integration regression |
| Lists layout/CLS (VCST-5111, 5110) | BVA (md 768px / lg 1024px spacing) + EP (CLS < 0.1 on mobile skeleton-to-grid) | Layout-stability thresholds |
| Lists a11y (VCST-5067, 5066) | EP (modified-date aria-label; icon contrast ≥ 3:1) | WCAG 1.4.11 |
| Cart mobile overflow (VCST-5124) | BVA (375px, unchecked deleted-product state, `getBoundingClientRect`) | Layout boundary |
| Backup & Restore (VCST-5088) | EP (backup created; restore applied; corrupted/wrong-version rejected) | Admin/platform feature |
| onX adapter (VCST-4464) | EP (order placed → shipment ref; invalid config → meaningful error not 500) | Integration happy/negative |
| CMS menu delete (VCST-4962) | EP (DELETE → 200; re-GET → 404/empty; invalid storeId → 404 not 500) | REST negative coverage |
| xAPI addresses (VCST-5001) | EP (org-scoped vs personal-scoped lists; org switch changes result) | B2B context isolation; BL-B2B-001 |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger Tickets | Priority |
|----------|------|--------|----------------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always | P0 |
| 078 | Backend Smoke Tests | Cross-cutting (backend) | Always | P0 |
| 044 | Security Tests | Cross-cutting | VCST-4576, VCST-4531, VCST-5074, VCST-4999, VCST-5113, VCST-5132 | P0 |
| 049 | Platform API | Platform | VCST-5088, VCST-5074, VCST-4576, VCST-4962 | P0 |
| 031 | Auth Login & Register | Auth | VCST-4531, VCST-5074, VCST-4999, VCST-5030 | P1 |
| 032 | Auth Session & RBAC | Auth | VCST-4531, VCST-4576 | P1 |
| 033 | Auth Company & Account Menu | Auth | VCST-4531 | P1 |
| 082 | Auth Impersonation / Login on Behalf | Auth | VCST-4531 | P1 |
| 020 | Platform Users Roles & Settings | Platform | VCST-5074, VCST-4999, VCST-5088 | P1 |
| 075 | Loyalty | Loyalty (backend) | VCST-5023 | P1 |
| 083 | Loyalty Catalog Browsing | Loyalty (storefront) | VCST-5100 | P1 |
| 043 | Google Analytics | Analytics / GA4 | VCST-5109 | P2 |
| 028 | Cart Core | Cart | VCST-4205, VCST-4961, VCST-5124 | P1 |
| 029 | Cart Validation & Persistence | Cart | VCST-4205, VCST-4961 | P1 |
| 072 | Configurable Products UI | Configurable Products | VCST-4715, VCST-4205 | P1 |
| 072b | Configurable Products E2E | Configurable Products | VCST-4715, VCST-4205 | P1 |
| 072c | Configurable Products Cross-Cutting | Configurable Products | VCST-4715, VCST-4961 | P1 |
| 072d | Configurable Products File & Text Sections | Configurable Products | VCST-4715 | P1 |
| 052 | Configurable Products Admin | Configurable Products | VCST-4715 | P1 |
| 050i | GraphQL Configurable Products | GraphQL / Configurable | VCST-4715, VCST-4961 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | GraphQL / xCart | VCST-4205, VCST-4961 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | GraphQL / xCart | VCST-4961, VCST-5018, VCST-5017 | P1 |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | GraphQL / xCart | VCST-4205 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | GraphQL / xCart | VCST-4642 | P1 |
| 050j | GraphQL xMarketing (promotionCoupons) | GraphQL / Marketing | VCST-5106 | P1 |
| 050d | GraphQL xProfile | GraphQL / xProfile | VCST-5001 | P1 |
| 050e | GraphQL xFrontend (pageContext) | GraphQL / Platform bootstrap | VCST-4642 | P1 |
| 050f | GraphQL xCMS | GraphQL / CMS | VCST-4962 | P1 |
| 050a | GraphQL xCatalog | GraphQL / Catalog | VCST-5144, VCST-5100 | P1 |
| 077 | Coupons & Promotions Storefront | Marketing (storefront) | VCST-5018, VCST-5017, VCST-5106 | P1 |
| 077b | Coupons & Promotions — Cart Sidebar | Marketing (storefront) | VCST-5018, VCST-5017 | P1 |
| 023 | Marketing Promotions | Marketing (admin) | VCST-5017, VCST-5018 | P1 |
| 025 | Marketing Coupons & API | Marketing (admin) | VCST-5017, VCST-5018 | P1 |
| 059 | CMS Page Management | CMS | VCST-4962 | P1 |
| 007 | B2C Lists & Shared | B2C Lists | VCST-5111, VCST-5110, VCST-5067, VCST-5066 | P1 |
| 048b | Layout Stability | Cross-cutting / UI | VCST-5111, VCST-5110, VCST-5124 | P1 |
| 045 | Accessibility Tests | Cross-cutting / A11y | VCST-5018, VCST-5017, VCST-5067, VCST-5066 | P2 |
| 001 | Catalog Navigation | Catalog | VCST-5144 | P1 |
| 003 | Catalog Filters | Catalog | VCST-5144 | P1 |
| 014 | Orders Frontend | Orders (date-picker filter) | VCST-4892 | P1 |
| 046 | Localization Tests | i18n | VCST-5144 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

| Gap ID | Ticket | Description | Target Suite(s) | Owner |
|--------|--------|-------------|-----------------|-------|
| GAP-01 | VCST-4715 | Default-option preselection — configurable section with `isDefault: true` renders the option pre-checked on PDP load; no existing coverage for the `isDefault` field across admin or storefront. | 052, 072, 072b, 072d, 050i | qa-backend-expert + qa-frontend-expert |
| GAP-02 | VCST-4961 | `selectedForCheckout` write path for `configurationItems` — xCart selection mutations propagate the flag and reprice the parent lineItem; verify across all five selection mutations. BL-CART-010. | 050i, 050b2, 050b4 | qa-backend-expert |
| GAP-03 | VCST-4205 | Save for Later + Configurable Product — moving a configurable item to saved list preserves configuration; restoring reprices correctly. BL-CART-010/011. | 028, 072b, 050b3 | qa-frontend-expert + qa-backend-expert |
| GAP-04 | VCST-5109 | GA4 `view_item_list` enriched datalayer fields present/correct; `purchase` event items array matches order lines. | 043 | qa-testing-expert |
| GAP-05 | VCST-5074 | AutoAccountsLockoutJob locks accounts after configured threshold; verified via job run + `GET /api/platform/security/users/{id}` lockout status. BL-AUTH-003. | 020, 049 | qa-backend-expert |
| GAP-06 | VCST-5023 | Loyalty per-product multiply factor — Admin sets factor; `loyaltyPoints` on Product xAPI = `price × factor`; store default applies when no row. PTS listing-scope caveat: do NOT assert PTS on PDP/cart/search. | 075, 050a | qa-backend-expert |
| GAP-07 | VCST-5100 | Loyalty catalog browsing — route guard for eligible users; listing shows PTS; PDP/cart revert to USD (per caveat). | 083 | qa-frontend-expert |
| GAP-08 | VCST-4642 | Frontend init via xAPI — `pageContext` returns required bootstrap fields; storefront renders without JS errors when xFrontend is sole init source. BL-CROSS-011. | 050e, 050b4 | qa-backend-expert |
| GAP-09 | VCST-4464 | onX Fulfilment Adapter — order placement with onX provider creates the order + valid shipment reference; no existing backend coverage. | 049, 078 | qa-backend-expert |
| GAP-10 | VCST-4576 | Persistent Access Token Validation — revoke/expire a PAT; revoked token → 401; active token works until revocation. BL-AUTH-005/006. | 044, 049, 032 | qa-backend-expert |
| GAP-11 | VCST-4531 | Session invalidation after password change — all active sessions invalidated immediately; existing sessions → 401/redirect. BL-AUTH-003. | 031, 032, 044 | qa-frontend-expert + qa-backend-expert |
| GAP-12 | VCST-5144 | Category permalink i18n — switching to DE must not truncate/corrupt the category slug; storefront resolves the right category. BL-CAT-004. | 001, 003, 046 | qa-frontend-expert |
| GAP-13 | VCST-5106 | Marketing xAPI graceful degradation — when x-marketing absent, xCart queries with `promotionCoupons` return without JS error; cart renders. BL-CROSS-011/003. | 050j, 077, 077b | qa-backend-expert + qa-frontend-expert |
| GAP-14 | VCST-5018 + VCST-5017 | Coupon sidebar A11y — `role="alert"`/`aria-live` on error (5018); `aria-label` on Apply + Trash (5017). Both in PR #2303. | 045, 077b | ui-ux-expert + qa-frontend-expert |
| GAP-15 | VCST-4962 | DELETE /api/cms/{storeId}/menu deletes menu link lists; re-GET → 404/empty; invalid storeId → 404 not 500. | 049, 059 | qa-backend-expert |
| GAP-16 | VCST-5088 | Backup & Restore — Admin blade creates timestamped artifact; restore applies; partial/corrupt backup rejected gracefully. | 049, 020 | qa-backend-expert |
| GAP-17 | VCST-5001 | xAPI `currentOrganizationAddresses` / `currentCustomerAddresses` return correct collections; org vs personal scope isolated. BL-B2B-001. | 050d | qa-backend-expert |
| GAP-18 | VCST-5111 + VCST-5110 | Lists layout/CLS — off-grid spacing at md+ fixed (5111); skeleton-to-grid CLS below P0 threshold on mobile (5110). Net-new layout-stability assertions for Lists. | 007, 048b | ui-ux-expert |
| GAP-19 | VCST-5067 + VCST-5066 | Lists A11y — modified-date SR label (5067); save-v2 icon contrast ≥3:1 WCAG 1.4.11 (5066). | 045, 007 | ui-ux-expert |
| GAP-20 | VCST-5124 | Save-for-later bookmark overflow — card does not overflow 27px when deleted product is unchecked; measured via `getBoundingClientRect` at 375px. | 028, 048b | qa-frontend-expert |
| GAP-21 | VCST-4892 | UI-Kit Date Picker on Orders filter — calendar open; range persists; Esc closes; reversed range shows validation; back-nav retains filter state. (Prior retest done; new regression cases for confirmed-fixed behaviors.) | 014, 015 | qa-frontend-expert |
| GAP-22 | VCST-5132 + VCST-5113 | Scriban/CVE upgrades — existing Scriban template rendering in notifications/CMS unchanged; Azure.Core/Identity bump no regression. | 049, 078 | qa-backend-expert |

### 5.3 Smoke Safety Net for Unlinked PRs

vc-frontend #2300 (graphql types & backend packages) and #2301 (VCST-5063 test param) have no functional Done ticket — dependency/type/build changes can break selectors or runtime imports. No dedicated cases; **suite 042** smoke is the safety net.

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|----------|-----------|-----------------|--------------|-----------|
| VCST-4715 | Admin SPA + Storefront + GraphQL | P1 Feature | 8–10 | 052, 072, 072d, 050i | Decision Table (section type × isDefault × required/optional) + EP (one-default-per-section) + BVA (0/1/2 defaults). BL-CAT-006 |
| VCST-4961 | GraphQL xAPI | P1 Bug fix | 5–6 | 050i, 050b2, 050b4 | State Transition (selectedForCheckout toggle → reprice) + EP (single / batch / unselect-all / idempotent). BL-CART-010/011/012/013 |
| VCST-4205 | Storefront + GraphQL | P1 Bug fix | 4–5 | 028, 072b, 050b3 | State Transition (configurable → Save for Later → Restore → preserved + repriced). BL-CART-010 + BL-CART-007 |
| VCST-5109 | Storefront (Analytics) | P2 Feature | 4–5 | 043 | EP (view_item_list enriched fields; purchase items array matches order lines; missing field = FAIL). BL-CROSS-005 |
| VCST-5074 | Platform Admin + REST | P1 Bug fix | 3–4 | 020, 049 | EP (job runs → locked after threshold; manual API cross-check). BL-AUTH-003 |
| VCST-5023 | Admin SPA + GraphQL | P1 Feature | 5–6 | 075, 050a | Decision Table (program type × factor row present/absent × store default) + EP (factor 1/2/0.5/absent). Assert `loyaltyPoints` on Product query only |
| VCST-5100 | Storefront | P1 Feature | 3–4 | 083 | EP (eligible sees catalog; guard for non-eligible; listing PTS; PDP USD). BL-B2B-005. PTS caveat enforced |
| VCST-4642 | GraphQL + Storefront | P1 Feature | 4 | 050e, 050b4 | EP (pageContext returns bootstrap fields; init clean; degradation when xFrontend unavailable). BL-CROSS-011 |
| VCST-4464 | REST API + Admin SPA | P2 Feature | 3 | 049, 078 | EP (onX order → shipment ref; invalid config → meaningful error not 500). BL-ORD-001 |
| VCST-4576 | REST API + Admin SPA | P1 Feature (security) | 5–6 | 044, 049, 032 | State Transition (active → revoke → 401) + EP (expired / revoked / never-issued / valid). BL-AUTH-005/006 |
| VCST-4531 | Storefront + REST API | P1 Feature (security) | 4–5 | 031, 032, 044 | State Transition (change password → sessions invalidated) + EP (same-device / other-device / API-token). BL-AUTH-003 |
| VCST-5144 | Storefront | P1 Bug fix | 3 | 001, 003, 046 | EP (EN permalink / DE permalink / direct URL after locale switch). BL-CAT-004 |
| VCST-5106 | GraphQL + Storefront | P1 Bug fix | 3–4 | 050j, 077, 077b | EP (module installed = sidebar works; absent = renders, `promotionCoupons` null not error). BL-CROSS-003/011 |
| VCST-5018 + VCST-5017 | Storefront + A11y | P1 Bug fix | 4 | 045, 077b | EP (role=alert on error; Apply aria-label; Trash aria-label; SR announcement). WCAG 4.1.2 |
| VCST-4962 | REST API | P1 Bug fix | 3 | 049, 059 | EP (DELETE → 200; re-GET → 404/empty; invalid storeId → 404 not 500). BL-CROSS-007 |
| VCST-5088 | Admin SPA + REST | P2 Feature | 3–4 | 049, 020 | EP (backup created; restore applied; corrupted/wrong-version rejected) |
| VCST-5001 | GraphQL xAPI | P2 Feature | 3 | 050d | EP (org-scoped list; personal list; org switch changes result). BL-B2B-001 |
| VCST-5111 + VCST-5110 | Storefront + Layout | P1 Bug fix | 3 | 007, 048b | BVA (md 768px, lg 1024px spacing) + EP (CLS < 0.1 mobile 375px skeleton-to-grid) |
| VCST-5067 + VCST-5066 | Storefront A11y | P1 Bug fix | 3 | 045, 007 | EP (modified-date aria-label; save icon contrast ≥3:1 WCAG 1.4.11) |
| VCST-5124 | Storefront + Layout (mobile) | P1 Bug fix | 2 | 028, 048b | BVA (375px, unchecked deleted-product state, `getBoundingClientRect`) |
| VCST-4892 | Storefront | P1 Bug fix | 5–6 | 014, 015 | State Transition (open → range → apply → persist; Esc closes; reversed range validation; back-nav retains) + BVA (same-day / 1-day / max-date) |
| VCST-5030 | Storefront | P1 Bug fix | 2 | 031 | EP (type → blur → icon visible; refocus → icon still visible) |
| VCST-5132 | REST API + Admin | P2 Bug fix | 2 | 049, 078 | EP (Scriban template renders in notification; CMS template unchanged after upgrade) |

**Total new cases estimated: 90–115.** Case generation happens later via `/qa-test-cases-generator VCST-XXXX` per ticket, driven by these counts/techniques.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-10 PRs merged/deployed to QA; build artifact version confirmed via `packages.json` + `artifact.json` on the storefront (NOT `image.json` — `feedback_no_storefront_image`)
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Loyalty: at least one loyalty program + per-product factor row + a loyalty-eligible customer group provisioned for VCST-5023/5100
- [ ] Configurable product with a section that has a default option (`isDefault`) provisioned for VCST-4715
- [ ] B2B org with both organization-scoped and personal addresses for VCST-5001 scope isolation
- [ ] A user account whose active sessions can be enumerated (two devices/contexts) for VCST-4531 invalidation
- [ ] A persistent access token issued for VCST-4576 revoke flow
- [ ] Marketing x-marketing module toggle path available (installed vs absent) for VCST-5106 degradation test — coordinate with DevOps if a teardown env is needed
- [ ] Orders with date data spanning the picker range for VCST-4892 filter cases
- [ ] MCP browsers available (close Chrome before `playwright-chrome`); Firefox/Edge confirmed for parallel agents; Playwright `locale: en-US` set (`feedback_playwright_locale`)

### 7.2 Exit Criteria

- [ ] All P0 cases pass 100% (suites 042, 078, 044, 049)
- [ ] All P1 cases ≥95% pass
- [ ] Zero Critical/Blocker open bugs across Frontend bootstrap, Loyalty, Security/Auth, Cart × Configurable Products
- [ ] High-priority bugs verified fixed: VCST-5144, VCST-5106, VCST-5018; security stories VCST-4576, VCST-4531 verified; lockout VCST-5074/4999 enforced
- [ ] Frontend xAPI init (VCST-4642) smoke-clean across homepage/catalog/PDP/cart/checkout — no console errors
- [ ] New cases for GAP-01 through GAP-14 generated in Draft; GAP-15 through GAP-22 in Backlog
- [ ] Critical-UI scope (suite 048b) re-run after Lists layout PRs (#2292) and the date-picker PR (#2291)
- [ ] RTM updated to ≥95% coverage for in-scope tickets
- [ ] Loyalty PTS-currency caveat documented in case notes (USD on PDP/cart is by-design, not a bug — `project_loyalty_catalog_currency_scope`)

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| Loyalty program + per-product points factor + eligible customer group | Admin → Loyalty + `/qa-seed-data` | VCST-5023, VCST-5100. Assert `loyaltyPoints` on Product xAPI only; PTS is listing-scope (`project_loyalty_catalog_currency_scope`) |
| Configurable product with a section that has a default option (`isDefault`) | Admin → Catalog → Configurable Products or `/qa-seed-data catalog` | VCST-4715 default preselection; VCST-4961/4205 selection + save-for-later |
| Persistent access token (issuable + revocable) | Admin → Security → API keys / `.env.local` | VCST-4576 revoke → 401 flow |
| User with multiple active sessions (two contexts/devices) | `test-data/users/agent-user-pool.csv` | VCST-4531 session invalidation on password change |
| Manager (back-office) + storefront accounts subject to lockout policy | `test-data/users/agent-user-pool.csv` + Admin → Security | VCST-5074/4999/5149 lockout enforcement (storefront + backend) |
| B2B org with org-scoped AND personal addresses | `test-data/addresses/` + Admin → Customer | VCST-5001 `currentOrganizationAddresses` / `currentCustomerAddresses` isolation |
| Orders spanning a date range | `/qa-seed-data` or live QA orders | VCST-4892 Orders date-picker filter persistence / reversed-range |
| Coupons (% / fixed / free-shipping / expired) | Admin → Marketing → Coupons | VCST-5018/5017/5106 coupon sidebar; use `{{COUPON_CODE_*}}` |
| Environment with vs without `vc-module-x-marketing` | DevOps / teardown env | VCST-5106 graceful-degradation branch |
| CMS store with menu link lists | Admin → CMS → Menus | VCST-4962 DELETE menu verification |
| Lists with several items (incl. shared list), mobile viewport 375px | Admin → Customer → Lists or `/qa-seed-data b2b` | VCST-5111/5110/5067/5066 layout + a11y + CLS |
| Scriban-bearing notification + CMS templates | Admin → Notifications / CMS | VCST-5132/5113 post-upgrade render check |

All variables resolved at runtime via `{{VAR}}` or `@td(ALIAS.field)`. No hardcoded IDs, SKUs, emails, prices, or order numbers (`feedback_flexible_test_cases`, `feedback_env_resilience`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-10 deployment confirmed on QA | 2026-05-29 (ongoing) | DevOps |
| Test plan created | 2026-05-29 (this document) | test-management-specialist |
| Frontend xAPI-init smoke (VCST-4642) + P0 security verifications (VCST-4576, 4531, 5074) | 2026-05-29 – 2026-05-31 | qa-frontend-expert + qa-backend-expert |
| Cart × Configurable Products cluster (VCST-4715, 4961, 4205) | 2026-05-30 – 2026-06-01 | qa-frontend-expert + qa-backend-expert |
| Loyalty Catalog & Points (VCST-5023, 5100) | 2026-05-31 – 2026-06-02 | qa-backend-expert + qa-frontend-expert |
| New test case generation — Critical/High gaps (GAP-01 through GAP-14) | 2026-05-31 – 2026-06-03 | test-management-specialist |
| P0 + P1 regression run (042, 078, 044, 049, 028-029, 072/072b-d, 052, 050i/050b1-b4/050j/050d/050e/050a, 082, 031-033, 020, 075, 083, 077/077b, 001/003, 014) | 2026-06-02 – 2026-06-04 | regression-orchestrator |
| P2 run (043, 045, 046) + smoke for unlinked PRs (042) | 2026-06-04 | regression-orchestrator |
| Critical-UI scope (048b) re-run after Lists (#2292) + date-picker (#2291) PRs | 2026-06-04 | ui-ux-expert |
| New cases review and promotion (Draft → Reviewed) | 2026-06-05 | qa-lead-orchestrator |
| Final sign-off / go-no-go | 2026-06-05 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: Loyalty catalog, Cart × Configurable, Lists, Coupons sidebar, Date Picker, DE permalink, mobile layout | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: Loyalty factor config, Configurable default option, Backup/Restore, lockout policy, CMS menu, token validation | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI (xCart, xCatalog, xProfile, xFrontend/pageContext, xMarketing, configurable products) | qa-backend-expert | playwright-edge | Interactive (runner-native via `scripts/graphql-runner.ts`) |
| REST API (Platform security/token, Backup/Restore, lockout job, CMS menu, onX adapter) | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| Security / Auth (token revoke, session invalidation, lockout) | qa-backend-expert + qa-frontend-expert | playwright-edge + playwright-chrome | Interactive |
| A11y: coupon sidebar, Lists SR labels + contrast, Date Picker keyboard | ui-ux-expert | Chrome DevTools MCP | Interactive |
| GA4 datalayer (VCST-5109) | qa-testing-expert | playwright-firefox | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** BA agents must not share browser slots with QA agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|------------------|-------|
| VCST-4642 | Frontend init via XAPI | Story | Platform bootstrap | 042, 050b4 (partial); 050e (new) | GAP-08: 4 cases | qa-backend-expert |
| VCST-5023 | Loyalty per-product points factor | Story | Loyalty / Pricing | 075 (partial), 050a | GAP-06: 5–6 cases | qa-backend-expert |
| VCST-5100 | Loyalty catalog browsing | Story | Loyalty / Catalog | 083 (skeleton) | GAP-07: 3–4 cases | qa-frontend-expert |
| VCST-5109 | GA4 enriched datalayer | Story | Analytics | 043 (partial) | GAP-04: 4–5 cases | qa-testing-expert |
| VCST-5074 | Account lockout job | Story | Auth / Security | 044, 020, 049 (partial) | GAP-05: 3–4 cases | qa-backend-expert |
| VCST-4576 | Persistent token validation | Story | Security | 044, 049, 032 (partial) | GAP-10: 5–6 cases | qa-backend-expert |
| VCST-4531 | Session invalidation on password change | Story | Security / Auth | 031, 032, 044 (partial) | GAP-11: 4–5 cases | qa-frontend-expert + qa-backend-expert |
| VCST-4715 | Configurable default option | Story | Configurable Products | 052, 072, 072d, 050i (none for isDefault) | GAP-01: 8–10 cases | qa-backend-expert + qa-frontend-expert |
| VCST-4892 | UI-Kit Date Picker | Story | UI-Kit / Orders filter | 014 (partial) | GAP-21: 5–6 cases | qa-frontend-expert |
| VCST-5088 | Backup & Restore | Story | Platform / Admin | 049, 020 (none) | GAP-16: 3–4 cases | qa-backend-expert |
| VCST-4464 | onX Fulfilment Adapter | Story | Integration | 049, 078 (none) | GAP-09: 3 cases | qa-backend-expert |
| VCST-5144 | DE category permalink | Bug (High) | i18n / Catalog | 001, 003, 046 (partial) | GAP-12: 3 cases | qa-frontend-expert |
| VCST-5106 | Marketing xAPI resilience | Bug (High) | Marketing / GraphQL | 050j, 077, 077b (none for absent-module) | GAP-13: 3–4 cases | qa-backend-expert + qa-frontend-expert |
| VCST-5018 | Coupon error not announced | Bug (High) | Marketing / A11y | 045, 077b (partial) | GAP-14: shared 4 cases | ui-ux-expert |
| VCST-5017 | Coupon buttons missing aria-label | Bug (Medium) | Marketing / A11y | 045, 077b (partial) | GAP-14: shared 4 cases | ui-ux-expert |
| VCST-4961 | `selectedForCheckout` write path | Bug (Medium) | Cart / Configurable | 050i, 050b2 (partial) | GAP-02: 5–6 cases | qa-backend-expert |
| VCST-4205 | Save for Later + configurable | Bug (Medium) | Cart / Configurable | 028, 072b, 050b3 (partial) | GAP-03: 4–5 cases | qa-frontend-expert + qa-backend-expert |
| VCST-4962 | CMS menu DELETE no-op | Bug (Medium) | CMS / REST | 049, 059 (none) | GAP-15: 3 cases | qa-backend-expert |
| VCST-4999 | Manager lockout not enforced | Bug (Medium) | Auth / Security | 044, 031 (partial) | covered by GAP-05 | qa-backend-expert |
| VCST-5030 | Show-password icon disappears | Bug (Medium) | Auth / UI | 031 (partial) | 2 cases | qa-frontend-expert |
| VCST-5067 | Lists modified-date no SR label | Bug (Medium) | Lists / A11y | 045, 007 (partial) | GAP-19: shared 3 cases | ui-ux-expert |
| VCST-5110 | Lists mobile CLS | Bug (Medium) | Lists / Perf | 048b, 007 (partial) | GAP-18: shared 3 cases | ui-ux-expert |
| VCST-5111 | Lists off-grid spacing md+ | Bug (Medium) | Lists / Layout | 048b, 007 (partial) | GAP-18: shared 3 cases | ui-ux-expert |
| VCST-5132 | Scriban CVE | Bug (Medium) | Security / Dep | 049, 078 (partial) | GAP-22: 2 cases | qa-backend-expert |
| VCST-5066 | Lists icon contrast | Bug (Low) | Lists / A11y | 045, 007 (partial) | GAP-19: shared 3 cases | ui-ux-expert |
| VCST-5124 | Save-for-later mobile overflow | Bug (Low) | Cart / Layout | 028, 048b (partial) | GAP-20: 2 cases | qa-frontend-expert |
| VCST-5001 | xAPI org/customer addresses | Task | xAPI / Addresses | 050d (none) | GAP-17: 3 cases | qa-backend-expert |
| VCST-5113 | CVE-2026-44503 | Task | Security / Dep | 049, 078 | covered by GAP-22 | qa-backend-expert |
| VCST-5149 | Lockout job hotfix | Task | Auth / Security | 020, 049 | covered by GAP-05 | qa-backend-expert |
| VCST-4839 | Storybook dark presets | Task | UI-Kit / Storybook | Storybook only (render-only; no a11y gate on dark) | 1 render-check | ui-ux-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket spanning storefront + backend, verify before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted/returned correctly (use `scripts/graphql-runner.ts` for xAPI assertions — never custom JS scripts, per `feedback_use_canonical_graphql_runner`)
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog/CMS data changed (allow 30–60s lag)
- [ ] LAYOUT: For Lists/date-picker PRs — verify `scripts/lib/measure-layout.ts` deltas stay within 048b thresholds

Applies to: VCST-4642 (frontend init), VCST-4715/4961/4205 (Cart × Configurable cluster), VCST-5023/5100 (Loyalty), VCST-4576/4531/5074 (Security/Auth), VCST-5106 (Marketing resilience), VCST-5144 (DE permalink).

---

## 13. References

- **Sprint 26-10 PRs:**
  - `VirtoCommerce/vc-frontend` (13 merged): #2291 (VCST-4892), #2299 (VCST-5109), #2305 (VCST-5106), #2303 (VCST-5017/5018), #2304 (VCST-5124), #2217 (VCST-4839), #2293 (VCST-4642), #2292 (VCST-5110), #2294 (VCST-4205), #2275 (VCST-4531), #2297 (VCST-4843); unlinked: #2300 (graphql types & backend packages), #2301 (VCST-5063 test param)
  - `VirtoCommerce/vc-platform`: #3043 (VCST-4999), #3038 (VCST-5074), #3036 (VCST-4843), #3035 (VCST-5113), #3033 (VCST-5030), #3030 (VCST-5088); dependabot #3037/#3042; #3040 (VCST-5063)
  - `VirtoCommerce/vc-module-loyalty`: #8 (VCST-5023)
  - `VirtoCommerce/vc-module-x-cart`: #119 (VCST-4961), #118 (VCST-4205)
  - `VirtoCommerce/vc-module-catalog`: #885 (internal VM-1727, no VCST link)
- **Module repos not reachable at plan time** (GitHub search 422 — verify code path via release notes or wrapping vc-frontend PR before marking GAP cases ready): `vc-module-cms-content` / `vc-module-page-builder` (VCST-4962), `vc-module-x-profile` (VCST-5001), `vc-module-x-marketing` (VCST-5106 — wrapped by frontend #2305), frontend-init backend (VCST-4642 — wrapped by frontend #2293), token validation (VCST-4576), session invalidation (VCST-4531 — wrapped by frontend #2275)
- Module → Suite map: `.claude/agents/knowledge/module-suite-map.md`
- E2E Scenario Catalog: `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- GraphQL authoring contract: `.claude/agents/knowledge/graphql-test-cases-runner.md` (consume `@td()` natively)
- Business Logic invariants: `.claude/agents/knowledge/business-logic.md` (BL-CART-007/010/011/012/013; BL-AUTH-003/005/006; BL-CAT-004/006; BL-B2B-001/005; BL-CROSS-003/005/007/011; BL-ORD-001)
- Critical-UI scope (run 048b after Lists/date-picker PRs): `.claude/agents/knowledge/critical-ui-scope.md`
- Test data: `test-data/users/agent-user-pool.csv`, `test-data/aliases.json`, `test-data/addresses/`
- Memory cross-references: `project_loyalty_catalog_currency_scope`, `feedback_use_canonical_graphql_runner`, `feedback_flexible_test_cases`, `feedback_env_resilience`, `feedback_a11y_coffee_only`, `feedback_no_storefront_image`, `feedback_playwright_locale`, `reference_storefront_config_flags`
