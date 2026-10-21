# Sprint 26-11 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-06-15
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-06-08 – 2026-06-13 (confirmed by QA lead)

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-11 |
| Date range | 2026-06-08 – 2026-06-13 |
| Theme | Cart-inline payment expansion (Authorize.Net + Skyflow `AllowCartPayment`), Loyalty mixed-cart, coupon/promotion fixes, UI-kit date-picker & org-switcher accessibility, platform/API hardening |
| Total Done tickets | 43 (4 Stories, 12 Bugs, 22 Tasks, 1 TechDebt, 1 Spike, 3 Review tasks) |
| Test-relevant Done tickets | 15 (3 Stories + 12 Bugs) + 2 test-impacting tasks (VCST-5164, VCST-5167) |
| Merged frontend PRs (in sprint window) | 4 in vc-frontend (#2309, #2312, #2317, #2318) + related pre-window features (#2296, #2308) |
| Merged module PRs (in sprint window) | 5 in vc-platform (#3051, #3048, #3049, #3017, #3053) |

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-5162 | Extend Authorize.Net with `AllowCartPayment` — enter card details directly on cart/checkout page (PR #2309) | Payment |
| VCST-5009 | Extend Skyflow with `AllowCartPayment` — cart-inline vault card form (PR #2308) | Payment |
| VCST-5101 | [Loyalty][Mixed Cart][E2E] Add Loyalty Product to Cart — `cart.totals[]` split-by-currency, add-loyalty mutation, split cart summary (excludes configurable products) (PR #2296) | Loyalty / Cart |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain |
|-----|----------|---------|--------|
| VCST-5212 | High | GET `/api/platform/modules` intermittent 500 — `NullReferenceException` in `IconFileExists` when local catalog IconUrl is null (PR vc-platform #3051) | Platform / API |
| VCST-5211 | High | [UI Kit] VcDatePicker calendar grid not keyboard-focusable; Home/End/PgUp/PgDn unreachable in storefront (WCAG 2.1.1) (PR #2312/#2291) | UI Kit / A11y |
| VCST-5022 | High | [Marketing xAPI] `promotionCoupons` resolver silently ignores `sort` parameter (all variants return insertion order) | Marketing / GraphQL |
| VCST-5233 | Medium | [Promotions] Coupon stored in non-uppercase case rejected ("This code is not valid") when submitted case differs | Marketing / Cart |
| VCST-5197 | Medium | [Settings] "Reset to default" reset instantly with no confirmation, mis-clickable next to info icon — added confirmation (PR vc-platform #3048) | Platform / Admin |
| VCST-5178 | Medium | `DbUpdateException` String/binary truncated in `NotificationMessage.CreatedBy` (OrderApprovalRequest scheduler job) (PR vc-platform #3047) | Notifications / Platform |
| VCST-5176 | Medium | Organization switcher dropdown has no keyboard navigation (ArrowDown/Enter inoperable, no focus ring) — WCAG 2.1.1 | B2B / A11y |
| VCST-5153 | Medium | [UI Kit] Date Picker remaining a11y/UX gaps (Escape doesn't close popover — keyboard trap WCAG 2.1.2 — + 3 more) follow-up to VCST-4892 (PR #2312) | UI Kit / A11y |
| VCST-5148 | Medium | [Heineken] Removed `predefinedSearchFilters` factory still referenced by orphaned `vc-customer-search` directive (AngularJS dead code) | Customer / Admin |
| VCST-5107 | Medium | Backup & Restore errors for Catalog — DB-update restore failures for Variations and Configurable Products + error-message quality | Platform / Catalog |
| VCST-5091 | Medium | Indexation blade stays "In progress" indefinitely after a fatal error in `CreateIndexAsync` during manual full indexation | Search / Admin |
| VCST-5210 | Low | [Push Messages] FCM tokens rejected `UNREGISTERED` (404) never pruned — dead tokens retried on every send | Push Messages |

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-5164 | [Frontend] Update checkout initialization to prevent a mutations-condition race (PR #2317) — touches the P0 checkout-init path | Checkout |
| VCST-5167 | Update minor frontend dependencies (PR #2318) — smoke/selector & build sanity | Frontend / Build |
| VCST-5208 | Extract Backup & Restore from Platform into a standalone `vc-module-backup-restore` (PR vc-platform #3049) — module relocation, related to VCST-5107 | Platform / Backup |
| PR #2307 | feat: add data-test-id attributes to wishlist components (VCST-2925 — ticket not in this sprint; selector-impacting) | Wishlist / Selectors |

### 2.4 Out of Scope

- VCST-4901 — Migrate VC-Build on ModuleBootstrapper (.NET 10 build/CI infra, no QA-env user-facing change; PR vc-platform #3017)
- VCST-5131 / VCST-4869 — vc-shell OIDC publishing & v2 migration (tooling/infra)
- VCST-4456 / VCST-5145 — Virto Local index-write error & custom packages.json (local-dev infra)
- VCST-5152 / VCST-5044 / VCST-5221 / VCST-5251 — module logging refactor / CancellationToken migration / AI icons / modularity interfaces (internal, no user-facing change)
- VCST-5127 / VCST-5160 / VCST-5205 / VCST-5240 — Docs MCP & Agentic-QA tooling/auto-tests (QA tooling)
- VCST-5118 / VCST-5039 / VCST-4741 / VCST-5168 / VCST-5165 / VCST-5115 — load tests, env module updates, smoke/regression process tasks
- VCST-5199 — Webinar demo preparation (non-functional)
- VCST-5139 — UCP/Shopify/BigCommerce spike (no shipped deliverable)
- VCST-5230 / VCST-5157 / VCST-5087 — code-review tasks (no direct user-facing change)
- VCST-4492 — Sonar workflow setup (CI tooling)

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Payment — Cart-Inline (VCST-5162 Authorize.Net + VCST-5009 Skyflow) | 4 | 5 | 20 | Critical | Two payment processors gaining `AllowCartPayment=true`; card/vault form now renders on the cart page rather than at redirect — directly on the P0 revenue path; new render location + tokenization surface |
| Marketing / Coupons (VCST-5022 sort + VCST-5233 case-sensitivity) | 4 | 4 | 16 | Critical | Two concurrent coupon/promotion fixes; VCST-5233 is a redemption-blocking defect (valid coupons rejected), VCST-5022 a backend xAPI resolver change; cart-discount path is revenue-adjacent |
| Checkout Initialization (VCST-5164) | 3 | 5 | 15 | High | Race-condition fix in checkout init — P0 path; timing bugs are intermittent and hard to catch; affects all processors incl. CyberSource/Datatrans |
| UI-Kit Date Picker A11y (VCST-5211 + VCST-5153) | 4 | 3 | 12 | High | Shared `VcDatePicker` used across storefront date filters (orders, account); two tickets (grid focus + Escape/keyboard-trap); broad reuse surface |
| Loyalty Mixed Cart (VCST-5101) | 3 | 4 | 12 | High | New feature: `cart.totals[]` multi-currency, add-loyalty mutation, split cart summary; touches cart/purchase path; promotion-scope isolation risk (coupon must not touch PTS subtotal) |
| Platform / API + Settings + Notifications (VCST-5212 + VCST-5197 + VCST-5178) | 3 | 4 | 12 | High | Intermittent 500 on core `/api/platform/modules` breaks Admin Modules blade + deploy/CI checks; settings reset-guard; notification persistence truncation |
| Search Indexing Admin (VCST-5091) | 3 | 3 | 9 | Medium | Indexation blade stuck "In progress" after fatal error; admin UX + operability of re-index workflow |
| Backup & Restore / Catalog (VCST-5107, VCST-5208) | 3 | 3 | 9 | Medium | Restore failures for Variations & Configurable Products + module extraction to standalone repo; admin data-ops, no storefront surface |
| B2B Org Switcher A11y (VCST-5176) | 2 | 4 | 8 | Medium | Org switch is B2B-critical but a mouse workaround exists; WCAG 2.1.1 keyboard-operability gap |
| Frontend Dependencies (VCST-5167) | 2 | 3 | 6 | Medium | Minor dep bump — low functional change but can break build/selectors; smoke-gated |
| Customer Admin Dead-Code (VCST-5148) | 1 | 2 | 2 | Low | Orphaned AngularJS directive cleanup; no live runtime path (directive replaced by `va-filter-panel`) |
| Push Messages Token Pruning (VCST-5210) | 2 | 1 | 2 | Low | Backend-only; no user-facing failure — App Insights dependency-error noise and unbounded dead-token growth |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Payment — Cart-Inline | Yes | — | — | — | — | — |
| Marketing / Coupons | Yes | Yes | Yes | Yes | — | — |
| Checkout Initialization | Yes | — | — | Yes | — | — |
| UI-Kit Date Picker | Yes | — | — | — | Yes | — |
| Loyalty Mixed Cart | Yes | — | — | Yes | — | — |
| Platform / API + Settings + Notifications | — | Yes | Yes | — | — | — |
| Search Indexing Admin | — | Yes | — | — | — | — |
| Backup & Restore / Catalog | — | Yes | Yes | — | — | — |
| B2B Org Switcher | Yes | — | — | — | Yes | — |
| Customer Admin Dead-Code | — | Yes | — | — | — | — |
| Push Messages | — | Yes | — | Yes | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- Payment cart-inline (Authorize.Net + Skyflow): verify card/vault form renders on `/cart` (auth + guest), end-to-end pay-from-cart, declined-card handling; cross-processor regression via 041.
- Marketing/Coupons: coupon case-insensitivity (UI + xAPI), `promotionCoupons` sort correctness, redemption + discount application.

**High domains (run in parallel with critical):**
- Checkout init: race-condition edge case (cart update → immediate checkout nav) + full checkout regression 011-013.
- UI-kit date picker: keyboard-only navigation + Escape/keyboard-trap audit (suite 045 + Storybook).
- Loyalty mixed cart: storefront split-currency summary + xAPI `cart.totals[]` shape (single vs mixed currency).
- Platform/API: `/api/platform/modules` 200-not-500 under null-IconUrl modules; settings reset confirmation; notification persistence boundary.

**Medium domains (run after critical/high pass):**
- Search indexing fatal-error state, Backup/Restore catalog restore errors, org-switcher keyboard nav, frontend dep smoke sweep.

**Low domains (regression-only / spot check):** Customer admin dead-code console check, push-message token pruning (backend telemetry).

### 4.3 Test Design Techniques by Domain

| Domain | Technique | Rationale |
|--------|-----------|-----------|
| Payment cart-inline (VCST-5162, VCST-5009) | Decision Table | cart-page vs checkout-page × auth vs guest × card valid vs declined |
| Coupon case-sensitivity (VCST-5233) | Equivalence Partitioning | submitted case (UPPER/lower/Mixed) × stored-case variants |
| promotionCoupons sort (VCST-5022) | Equivalence Partitioning | valid sort fields: `endDate:asc/desc`, `name`, multi-field `endDate;name` (per `reference_promotioncoupons_sort_contract`) |
| Loyalty mixed cart (VCST-5101) | State Transition + BVA | single → mixed cart by adding a PTS line; `totals[]` element count 1 → 2 |
| Date picker keyboard (VCST-5211, VCST-5153) | State Transition + Error Guessing | focus-entry path into grid; Home/End/PgUp/PgDn; Escape closes / no keyboard trap |
| Org switcher (VCST-5176) | State Transition | Tab → Arrow → Enter → session swap confirmed |
| Platform modules 500 (VCST-5212) | Error Guessing | module with null local IconUrl → list returns 200 not 500 |
| Settings reset (VCST-5197) | Decision Table | confirm → reset; cancel → preserved; bulk reset |
| Notification CreatedBy (VCST-5178) | BVA | field length at cap−1, cap, cap+1 |
| Indexation fatal error (VCST-5091) | Error Guessing | fatal `CreateIndexAsync` → blade must leave "In progress" |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always-on (+ VCST-5167 selector/build sanity) | P0 |
| 078 | Backend Smoke Tests | Cross-cutting | Always-on | P0 |
| 040b | Payment — Authorize.Net | Payment | VCST-5162 | P0 |
| 040a | Payment — Skyflow | Payment | VCST-5009 | P0 |
| 041 | Payment Cross-Cutting | Payment | VCST-5162, VCST-5009 | P0 |
| 039 | Payment CyberSource | Payment | VCST-5164 (checkout init touches all processors) | P0 |
| 011 | Checkout Flow | Checkout | VCST-5164, VCST-5162, VCST-5009 | P1 |
| 012 | Checkout Guest | Checkout | VCST-5164 | P1 |
| 013 | Checkout B2B | Checkout | VCST-5164 | P1 |
| 028 | Cart Core | Cart | VCST-5162, VCST-5009, VCST-5101, VCST-5233 | P1 |
| 029 | Cart Validation & Persistence | Cart | VCST-5162, VCST-5009 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | xCart | VCST-5101 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | xCart | VCST-5233 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | xCart | VCST-5101 (`cart.totals[]`) | P1 |
| 075 | Loyalty (backend) | Loyalty | VCST-5101 | P1 |
| 083 | Loyalty Catalog Browsing | Loyalty | VCST-5101 (PR #2296) | P1 |
| 050j | GraphQL xMarketing (promotionCoupons) | xMarketing | VCST-5022 | P1 |
| 077 | Coupons & Promotions Storefront | Marketing | VCST-5022, VCST-5233 | P1 |
| 077b | Coupons & Promotions — Cart Sidebar | Marketing | VCST-5022, VCST-5233 | P1 |
| 025 | Marketing Coupons & API | Marketing | VCST-5022, VCST-5233 | P1 |
| 023 | Marketing Promotions | Marketing | VCST-5022 | P1 |
| 079 | xMarketing Admin & REST | Marketing | VCST-5022 | P1 |
| 049 | Platform API | Platform | VCST-5212 | P0 |
| 020 | Platform Users Roles & Settings | Platform | VCST-5197 | P1 |
| 063 | Core Settings | Platform | VCST-5197 | P2 |
| 057 | Notifications Templates | Notifications | VCST-5178 | P1 |
| 058 | Notifications Triggers | Notifications | VCST-5178 | P1 |
| 061 | Search Indexing Admin | Search | VCST-5091 | P1 |
| 045 | Accessibility Tests | UI Kit / Cross-cutting | VCST-5211, VCST-5153 | P2 |
| 033 | Auth Company & Account Menu | Auth | VCST-5176 | P1 |
| 006 | B2C Organization | B2C | VCST-5176 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-5148 | P1 |
| 027b | Customer Org Memberships (per-org roles & lockout) | Customer | Regression guard (VCST-5028 prior sprint) | P1 |
| 050l | GraphQL xAPI — Push Messages | Push Messages | VCST-5210 | P2 |
| 068 | Push Messages | Push Messages | VCST-5210 | P2 |
| 064 | CSV Import Export | Import/Export | VCST-5107 (interim, error-path cases only) | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

| Gap ID | Ticket | Description | Target Suite(s) | Owner |
|--------|--------|-------------|-----------------|-------|
| GAP-01 | VCST-5162 | Authorize.Net card form renders inline on `/cart` (`AllowCartPayment=true`) — cart-page form presence + end-to-end pay-from-cart; not just checkout-redirect (BL-CHK-004) | 040b | qa-frontend-expert |
| GAP-02 | VCST-5009 | Skyflow vault form renders on `/cart` for first-time entry (parallel to GAP-01; saved-card path already covered) (BL-CHK-004) | 040a | qa-frontend-expert |
| GAP-03 | VCST-5101 | Loyalty mixed-cart storefront UI: split-by-currency cart summary, PTS line rendered separately, per-line currency badge, two totals blocks (BL-LOY-003/005) | 028 (extend) or new `Frontend/loyalty/` mixed-cart suite | qa-frontend-expert |
| GAP-04 | VCST-5101 | GraphQL `cart.totals[]`: single-currency cart → exactly 1 entry; mixed → 2; promotion-scope isolation (coupon must not touch PTS subtotal) (BL-LOY-001..006) | 050b4 | qa-backend-expert |
| GAP-05 | VCST-5022 | `promotionCoupons` sort correctness: `endDate:asc`, `name:desc`, multi-field `endDate;name` produce distinct ordering | 050j | qa-backend-expert |
| GAP-06 | VCST-5233 | Coupon case-insensitivity: stored `SUMMER20` accepted as `summer20`/`Summer20` from cart field — UI + xAPI, negative (pre-fix) + positive (post-fix) (BL-CART-003) | 077, 077b, 050b2 | qa-frontend-expert (UI) + qa-backend-expert (API) |
| GAP-07 | VCST-5211 | VcDatePicker keyboard: calendar grid receives focus via Tab; Home/End/PgUp/PgDn navigate within grid (WCAG 2.1.1) | 045 (extend) | ui-ux-expert |
| GAP-08 | VCST-5153 | VcDatePicker: Escape closes popover (no keyboard trap, WCAG 2.1.2) + 3 remaining VCST-4892 follow-up gaps | 045 (extend) | ui-ux-expert |
| GAP-09 | VCST-5176 | Org-switcher keyboard nav: ArrowDown/Enter operate dropdown, focus ring visible, keyboard-only org switch completes session swap (BL-B2B-001) | 006 (extend) / 033 | qa-frontend-expert |
| GAP-10 | VCST-5107 | Backup & Restore for Catalog (Variations + Configurable Products) — no suite covers the module (extracted to `vc-module-backup-restore` via VCST-5208). **Propose new suite `Backend/backup-restore/086-backup-restore.csv`**; interim error-path cases in 064 | 086 (new) / 064 (interim) | qa-backend-expert |
| GAP-11 | VCST-5091 | Fatal `CreateIndexAsync` error → Hangfire completes with errors → Indexation blade must NOT remain "In progress" (BL-SRCH-003) | 061 (extend) | qa-backend-expert |
| GAP-12 | VCST-5197 | Settings "Reset to default" confirmation: confirm → reset, cancel → value preserved, bulk reset (BL-CROSS-006) | 063 (extend) | qa-backend-expert |
| GAP-13 | VCST-5178 | `NotificationMessage.CreatedBy` length BVA — recurring-job user name at cap−1 / cap / cap+1 accepted after the cap fix (BL-NOTIF-003) | 057 (extend) | qa-backend-expert |
| GAP-14 | VCST-5210 | FCM `UNREGISTERED` response → token pruned from registry, not retried on next send (P2, telemetry only) | 050l, 068 | qa-backend-expert |
| GAP-15 | VCST-5164 | Checkout-init race edge case — navigate to checkout immediately after cart update (fast-path timing) (BL-CHK-002) | 011 | qa-frontend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|---------|-----------|----------------|-------------|-----------|
| VCST-5162 | Storefront | P0 Feature | 5 | 040b | Decision Table (cart vs checkout × auth vs guest × valid vs declined) |
| VCST-5009 | Storefront | P0 Feature | 3 | 040a | Decision Table (Skyflow vault form location) |
| VCST-5101 (UI) | Storefront | P1 Feature | 6 | 028 (extend) | State Transition (single → mixed cart; BL-LOY-003) |
| VCST-5101 (GraphQL) | GraphQL | P1 Feature | 5 | 050b4 | Decision Table + BVA (currency combos; BL-LOY-001..006) |
| VCST-5022 | GraphQL | P1 Bug fix | 4 | 050j | EP (sort fields) |
| VCST-5233 (UI) | Storefront | P1 Bug fix | 4 | 077, 077b | EP (case-variant input × stored case; BL-CART-003) |
| VCST-5233 (GraphQL) | GraphQL | P1 Bug fix | 2 | 050b2 | EP (case-variant `validateCoupon`/`addCoupon`) |
| VCST-5212 | REST API | P1 Bug fix | 3 | 049 | Error Guessing (null IconUrl module → 200 not 500) |
| VCST-5211 | A11y / Storefront | P1 Bug fix | 4 | 045 | State Transition (focus → grid → Arrow/Home/End/PgUp/PgDn; WCAG 2.1.1) |
| VCST-5153 | A11y / Storefront | P1 Bug fix | 4 | 045 | Error Guessing (Escape closes, keyboard trap, 3 follow-ups; WCAG 2.1.2) |
| VCST-5197 | Admin | P2 Bug fix | 3 | 063 | Decision Table (confirm / cancel / bulk reset; BL-CROSS-006) |
| VCST-5178 | Admin / Notifications | P2 Bug fix | 2 | 057 | BVA (CreatedBy at cap−1/cap/cap+1; BL-NOTIF-003) |
| VCST-5176 | Storefront / A11y | P1 Bug fix | 4 | 006 / 033 | State Transition (Tab → Arrow → Enter → session swap; BL-B2B-001) |
| VCST-5107 | Admin | P2 Bug fix | 3 | 086 (new) / 064 (interim) | Error Guessing (restore Variation/ConfigProd → error quality) |
| VCST-5091 | Admin | P1 Bug fix | 2 | 061 | Error Guessing (fatal index → blade ≠ "In progress"; BL-SRCH-003) |
| VCST-5148 | Admin | P2 Bug fix | 1 | 027 | Error Guessing (removed factory → no console injection error) |
| VCST-5210 | Admin / GraphQL | P2 Bug fix | 2 | 050l, 068 | Error Guessing (UNREGISTERED → pruned, not retried) |
| VCST-5164 | Storefront | P1 TechDebt | 1 | 011 | Error Guessing (fast-path race: cart update + immediate checkout nav; BL-CHK-002) |
| VCST-5167 | Storefront | P2 TechDebt | 1 | 042 | Smoke (selector/build sanity — no net-new case if smoke passes) |

**Total new cases estimated: 59–68**

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-11 PRs deployed to QA — vc-frontend (#2309, #2312, #2317, #2318) artifact + vc-platform (#3051, #3048, #3049) module build confirmed via `packages.json` / `artifact.json` (per `feedback_pr_deploy_workflow` — verify artifact version, not merge status)
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Authorize.Net **and** Skyflow processors configured with `AllowCartPayment=true` on the test store; sandbox cards available via `@td()` (`reference_authorizenet_expiry_mmyy` — AN expiry is MM/YY)
- [ ] At least one loyalty (points) product + one standard product available to build a mixed-currency cart for VCST-5101 (configurable products excluded)
- [ ] Coupons stored in **non-uppercase** case exist for VCST-5233; ≥3 coupons with distinct `endDate`/`name` for VCST-5022 sort
- [ ] Multi-org user available for VCST-5176 (`reference_multi_org_test_user` — MULTI_ORG_USER_EMAIL, 11 orgs)
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`; `locale: en-US` set)

### 7.2 Exit Criteria

- [ ] All P0 test cases executed with 100% pass rate (042, 078, 040a/040b/041, 039, 049)
- [ ] All P1 test cases executed with ≥95% pass rate
- [ ] Zero Critical/Blocker open bugs in scope domains
- [ ] High-priority bugs verified fixed: VCST-5212, VCST-5211, VCST-5022 (+ Critical-domain stories VCST-5162, VCST-5009)
- [ ] Payment cart-inline (040a/040b) and coupon (077/077b/050j) regression all pass
- [ ] New test cases for GAP-01 through GAP-06 generated and in Draft status
- [ ] RTM updated to ≥95% coverage for in-scope tickets

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| Authorize.Net + Skyflow sandbox cards (valid + declined) | `test-data/` (`test-cards.csv`) via `@td()` | AN expiry mask is MM/YY (`reference_authorizenet_expiry_mmyy`); store must have `AllowCartPayment=true` |
| Loyalty (points) product + standard product | Admin → Catalog / Loyalty module | For VCST-5101 mixed-currency cart; exclude configurable products |
| Coupons stored in lower/Mixed case + UPPERCASE | Admin → Marketing → Coupons | VCST-5233 case-sensitivity; resolve via `{{COUPON_CODE_*}}` / `@td()` |
| ≥3 coupons with distinct endDate & name | Admin → Marketing → Coupons | VCST-5022 `promotionCoupons` sort (`reference_marketing_coupons_api_contract` — coupons are a separate entity) |
| Multi-org user (≥2 orgs) | `reference_multi_org_test_user` (MULTI_ORG_USER_EMAIL) | VCST-5176 org-switcher keyboard nav |
| Catalog dataset with Variations + Configurable Products | Admin → Catalog | VCST-5107 backup/restore error path |
| Platform module with null local IconUrl | Live module discovery state | VCST-5212 — intermittent; reproduce by toggling module load state |
| Order-approval notification trigger | Admin → Notifications | VCST-5178 `CreatedBy` boundary |

All variables resolved at runtime via `{{VAR}}` or `@td(ALIAS.field)`. No hardcoded IDs, SKUs, emails, prices, or order numbers (`feedback_flexible_test_cases`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-11 deployment confirmed on QA | 2026-06-13 | DevOps |
| Test plan created | 2026-06-15 (this document) | test-management-specialist |
| P0/High bug verifications (VCST-5212, VCST-5211, VCST-5022) + payment cart-inline (VCST-5162, VCST-5009) | 2026-06-16 – 2026-06-17 | qa-frontend-expert + qa-backend-expert |
| New test case generation — Critical/High domains (GAP-01 to GAP-09) | 2026-06-17 – 2026-06-18 | test-management-specialist |
| P0 + P1 regression run (042, 078, 040a/040b/041, 039, 011-013, 028-029, 050b*, 075/083, 050j, 077/077b, 049) | 2026-06-18 – 2026-06-19 | regression-orchestrator |
| P2 regression run (045, 063, 057-058, 061, 064, 050l/068, 027) | 2026-06-19 – 2026-06-20 | regression-orchestrator |
| New test cases review and promotion (Draft → Reviewed) | 2026-06-20 | qa-lead-orchestrator |
| Final sign-off / go/no-go | 2026-06-22 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: Payment cart-inline, Checkout, Cart, Coupons, Loyalty mixed-cart, Org switcher | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: Settings, Notifications, Search indexing, Backup/Restore, Customer | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI: `cart.totals[]`, `promotionCoupons` sort, coupon `validateCoupon`, push messages | qa-backend-expert | playwright-edge / `scripts/graphql-runner.ts` | Interactive |
| REST API: `/api/platform/modules` (VCST-5212), notifications | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| A11y: VcDatePicker keyboard (VCST-5211/5153), org switcher (VCST-5176) | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** BA agents must not share browser slots with QA agents. Use Edge/Chrome (not Firefox) for checkout completion (`feedback_firefox_cart_dropdown_quirk`).

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|-----------------|-------|
| VCST-5162 | Authorize.Net AllowCartPayment | Story | Payment | 040b (checkout flow, partial) | GAP-01: 5 cases | qa-frontend-expert |
| VCST-5009 | Skyflow AllowCartPayment | Story | Payment | 040a (saved-card, partial) | GAP-02: 3 cases | qa-frontend-expert |
| VCST-5101 | Loyalty mixed cart | Story | Loyalty / Cart | 083 (catalog), 028 (single-currency), 050b4 (partial) | GAP-03/04: ~11 cases | qa-frontend-expert + qa-backend-expert |
| VCST-5212 | /api/platform/modules 500 NRE | Bug (High) | Platform / API | 049 (partial) | GAP: 3 cases | qa-backend-expert |
| VCST-5211 | VcDatePicker grid not keyboard-focusable | Bug (High) | UI Kit / A11y | 045 (none for datepicker grid) | GAP-07: 4 cases | ui-ux-expert |
| VCST-5022 | promotionCoupons sort ignored | Bug (High) | Marketing / GraphQL | 050j (query, no sort assertion) | GAP-05: 4 cases | qa-backend-expert |
| VCST-5233 | Coupon case-sensitivity rejection | Bug | Marketing / Cart | 077/077b (apply, no case variant) | GAP-06: 6 cases | qa-frontend-expert + qa-backend-expert |
| VCST-5197 | Settings reset confirmation | Bug | Platform / Admin | 063 (reset, no confirm flow) | GAP-12: 3 cases | qa-backend-expert |
| VCST-5178 | NotificationMessage.CreatedBy truncation | Bug | Notifications | 057/058 (no length BVA) | GAP-13: 2 cases | qa-backend-expert |
| VCST-5176 | Org switcher no keyboard nav | Bug | B2B / A11y | 006/033 (mouse only) | GAP-09: 4 cases | qa-frontend-expert |
| VCST-5153 | Date Picker remaining a11y gaps | Bug | UI Kit / A11y | 045 (none for datepicker trap) | GAP-08: 4 cases | ui-ux-expert |
| VCST-5148 | Orphaned customer-search directive | Bug | Customer / Admin | 027 (none) | 1 console-guard case | qa-backend-expert |
| VCST-5107 | Backup/Restore catalog errors | Bug | Platform / Catalog | none (module uncovered) | GAP-10: 3 cases (+propose suite 086) | qa-backend-expert |
| VCST-5091 | Indexation blade stuck In Progress | Bug | Search / Admin | 061 (nominal only) | GAP-11: 2 cases | qa-backend-expert |
| VCST-5210 | FCM dead tokens not pruned | Bug (Low) | Push Messages | 050l/068 (no prune case) | GAP-14: 2 cases | qa-backend-expert |
| VCST-5164 | Checkout init race fix | Task | Checkout | 011-013 (nominal) | GAP-15: 1 edge case | qa-frontend-expert |
| VCST-5167 | Update minor frontend deps | TechDebt | Frontend / Build | 042 (smoke) | Smoke only | qa-frontend-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket spanning storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog data changed (allow 30-60s lag)

Applies to: VCST-5162 (Authorize.Net cart payment), VCST-5009 (Skyflow cart payment), VCST-5101 (loyalty mixed cart), VCST-5233 (coupon redemption), VCST-5022 (promotionCoupons), VCST-5164 (checkout init).

---

## 13. References

- Sprint 26-11 vc-frontend PRs (in window): #2309 (VCST-5162), #2312 (VCST-5153/5211), #2317 (VCST-5164), #2318 (VCST-5167); related pre-window: #2296 (loyalty, VCST-5101), #2308 (VCST-5009), #2291 (VCST-4892 datepicker)
- Sprint 26-11 vc-platform PRs (in window): #3051 (VCST-5212), #3048 (VCST-5197), #3049 (VCST-5208), #3017 (VCST-4901), #3053 (VCST-4492); related pre-window: #3047 (VCST-5178)
- Module → Suite map: `.claude/agents/knowledge/module-suite-map.md`
- BL invariants: `.claude/agents/knowledge/business-logic.md` (BL-CHK-*, BL-CART-*, BL-LOY-*, BL-NOTIF-*, BL-SRCH-*, BL-B2B-*, BL-CROSS-*)
- Promotion coupons sort contract: `reference_promotioncoupons_sort_contract` memory; marketing coupons API: `reference_marketing_coupons_api_contract`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- Test data: `test-data/` (cards, coupons, multi-org user via `@td()` / `{{VAR}}`)
