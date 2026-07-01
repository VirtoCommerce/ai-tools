# Sprint 26-12 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-06-29
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-06-15 – 2026-06-26 (confirmed by QA lead)

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-12 |
| Date range | 2026-06-15 – 2026-06-26 |
| Theme | Configurable-products-in-cart redesign + xCart per-line validation regression fix; multistep-checkout "Place Order" blocker; Loyalty mixed-cart & Product Points; B2B per-organization roles; UI-kit design-token system (VcButton/VcBadge + atomic-tier component reorg); catalog import/export/variation/sorting fixes; platform/security dependency hardening |
| Total Done/Tested tickets in sprint | 120 issues in sprint; 33 delivered & QA-relevant (18 Bugs + 15 Stories) |
| Test-relevant delivered tickets | 33 (18 Bugs + 15 Stories), status ∈ {Done, Tested, Testing, Testing-on-stable, Hotfix-ready, Ready-for-test} |
| Merged frontend PRs (in window) | 12 in vc-frontend (#2326, #2333, #2334, #2332, #2315, #2346, #2320, #2344, #2329, #2295, #2347, #2327) |
| Merged module PRs (in window) | 6 in vc-platform (#3058, #3057, #3060, #3059, #3063, #3062); module-repo fixes ship via their own `vc-module-*` repos (referenced by ticket) |

> **Note on workflow statuses:** the VCST project board has no green "Done" category. Completed-and-shippable work sits in **Done / Tested / Testing / Testing on stable / Hotfix ready / Ready for test**. Items still in *To do / In progress / In review / Draft / REFINEMENT / Reopen / Cancelled* are treated as **not deliverable** and excluded (Section 2.4).

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-5173 | [Cart] Configurable products behavior redesign (PR #2327) | Cart / Configurable Products |
| VCST-5104 | [Loyalty][Mixed Cart][E2E] Create Order | Loyalty / Cart |
| VCST-5158 | Make Save Order Product Snapshot Asynchronous | Orders (backend) |
| VCST-5079 | [E2E][Auto-tests][UI] Configurable Products storefront | Configurable Products |
| VCST-5076 | [E2E][Auto-tests][Dataset] Add configurable products + sections + options seed data | Test data / Configurable Products |
| VCST-4464 | onX Commerce Operation Foundation Protocol — Fulfilment Adapter, Create Order Flow | Orders / Integration |
| VCST-5345 | Expose per-variation associations on nested product load (REST) + xAPI `VariationType` | Catalog / GraphQL |
| VCST-5177 | [E2E] Configurable featured sorting for category browsing and search | Catalog / Search |
| VCST-5135 | [Loyalty] Product Points Program | Loyalty |
| VCST-5103 | [Loyalty][Mixed Cart] Loyalty Points Balance Validator | Loyalty |
| VCST-5028 | Support per-organization roles & access control for users (PR #2315) | B2B / Customer |
| VCST-4675 | Rebuild Product Search Index for a Category | Search / Catalog admin |
| VCST-4646 | [BOPIS][Map] Pickup location list with pagination | BOPIS |
| VCST-4217 | [UI-kit] VcButton colors & colour-presets — design tokens (PR #2320) | UI Kit |
| VCST-5232 | [Innovadis] Dashboard cards only display the first three values | Admin / Dashboard |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain |
|-----|----------|---------|--------|
| VCST-5234 | Highest | [XCart] Cart per-line validation errors (`items[].validationErrors` / `isValid`) disappear after any cart change | Cart / xCart |
| VCST-5369 | High | "Place Order" blocked/disabled on Review step in **Multistep checkout** (`checkout_multistep_enabled=true`) with `allowCartPayment=true` processors (Authorize.Net / CyberSource / Skyflow) — vc-frontend | Checkout / Payment |
| VCST-5189 | High | Parallel product CSV imports race — later-finishing import silently overwrites; **inventory data loss** | Catalog / Import |
| VCST-5261 | High | Security GHSA-hv8m-jj95-wg3x — MessagePack LZ4 decompression `AccessViolationException` on bad input (PR vc-platform #3058) | Platform / Security |
| VCST-5375 | Medium | `RoleSearchService` empty-keyword condition (hotfix ready) | Platform / Role search |
| VCST-5374 | Medium | Org users see **permanent** "locked out — contact administrator" for a **temporary** 15-min login lockout (non-org users correct) | Auth / B2B |
| VCST-5289 | Medium | `categories` x-api query ignores `sort` for nested `childCategories` (children fall back to `score desc`) | GraphQL xCatalog |
| VCST-5278 | Medium | Catalog product export fails 500 (FileNotFound) when a product image Url is an absolute/external blob URL | Catalog / Export |
| VCST-5238 | Medium | Apollo cache error missing field `currencyCode` on `UpdateShortCartItemQuantity` (PR #2333) | Cart / Loyalty mixed-cart |
| VCST-5233 | Medium | Copied coupon code can't be applied — "Click to copy" copies UPPERCASE, paste returns "This code is not valid" | Marketing / Coupons |
| VCST-5227 | Medium | Tasks UI **Due-date filter not applied** (binds `startDate`/`endDate` instead of `startDueDate`/`endDueDate`) | Admin / Task-management |
| VCST-5223 | Medium | [vc-news] Bulk delete confirmation shows page count (20) instead of full cross-page selection (56); 2→3 off-by-one | Admin / News |
| VCST-5218 | Medium | [vc-module-search] GET `/api/search/indexes/tasks/{id}/cancel` 500 `KeyNotFoundException` ('ServerName') | Search / Admin |
| VCST-4767 | Medium | [Marketing] Admin coupon code field accepts special characters despite "alphanumeric only" hint | Marketing / Admin |
| VCST-4228 | Medium | [UI-kit] VcBadge colors & icons — design tokens (PR #2347) | UI Kit |
| VCST-5276 | Low | Pricing Export "Select data to export" toolbar overlaps grid column header | Admin / Pricing (layout) |
| VCST-5270 | Low | [Push Messages] Admin menu icon missing (manifest `iconUrl` 404) | Admin / Push-messages |
| VCST-5021 | Low | [Cart] Coupons sidebar — Apply button always enabled for empty custom-code field (PR #2344) | Cart / Coupons |

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-5141 | [UI-kit] Component folder reorganization by atomic-design tiers (PR #2329) — import/selector regression surface across **all** UI-kit components | UI Kit / Structural |
| VCST-4981 | Refactor `orders.vue` component (PR #2295) — touches the orders-list hot path | Orders / Frontend |
| VCST-5264 | Update `StackExchange.Redis` to 3.0.0 (PR vc-platform #3059) — cart/session cache hot path; smoke-gated | Platform / Cache |
| VCST-5222 | [UI-kit] Storybook Docs font-family | UI Kit / Storybook |
| VCST-5247 | [Vulnerability] CVE-2026-48109 dependency fix — platform smoke | Platform / Security |
| VCST-5200 | Remove skip marker from Wishlist tests after Release 2.51.0 — wishlist auto-tests re-enabled (selector sanity) | Wishlist / Tests |
| VCST-2925 | [UI][E2E Auto-test] Add to lists / remove from list — lists/wishlist selector coverage | Lists / Selectors |
| VCST-4529 | [UI E2E Auto-tests] Pickup location — List > Filters & keyword Search (supports VCST-4646) | BOPIS / Tests |

### 2.4 Out of Scope

Excluded from QA verification this sprint — either **not deliverable** (status To do / In progress / In review / Draft / REFINEMENT / Reopen / Cancelled) or **non-product** (tooling / CI / infra / AI-demo / load-test / QA-process):

- **Not yet delivered:** VCST-5239 (org-scoped roles override, In progress), VCST-5126 (UCP MVP, Reopen), VCST-5089 (PeakJet Assets Store URL, To do), VCST-5077 (config-products xAPI auto-tests, To do), VCST-3912 (price restriction, In review), VCST-5339 (MCP on .NET), VCST-5319 (Missions backend), VCST-5303 (XCart perf skill, In review), VCST-5245 (BackgroundJobs module), VCST-5140 (order table mobile view, In review), VCST-5097 (Date Picker Range, To do), VCST-5024 (loyalty org-level totals, To do), VCST-4984 (VcTable row selection, In progress), VCST-4932 (Page Builder Asset Library, Reopen), VCST-4585 (token actions extendable, To do), VCST-4368 (Lists x-cross→UI kit, In review), VCST-5283 (admin drop-downs, To do), VCST-5269 (payment-form-after-shipping, **Reopen**), VCST-5198 (GA4 add_payment_info stale, Draft), VCST-5329 (Skyflow init — env/infra, To do), VCST-5361 (PeakJet ValueObject CPU, REFINEMENT), VCST-3286/VCST-5220 (sample-data), VCST-4923 (replayed-token disclosure, In progress — security, track for next sprint)
- **AI-Powered-Demo / demo-env:** VCST-5195, VCST-5194, VCST-5192, VCST-5188, VCST-5179, VCST-5307, VCST-5285 (demo PageBuilder DB)
- **Tooling / CI / infra:** VCST-5302/5244 (start-local & repo-scaffolding), VCST-5251/5328/5275 (modularity/extensibility internals), VCST-5246/5292/5372/5209/5138 (CI jobs), VCST-5366/5330/5279/5203/5063 (Agentic-QA & e2e tooling), VCST-5237/5258/5264-infra/4717 (env/observability), VCST-5034/5050 (docs/integration)
- **QA-process / load / release tasks:** VCST-5255 (Smoke-12), VCST-5256 (Regression-12), VCST-5166 (Regression-11), VCST-5169/5118/5039/5260/5259 (load tests), VCST-5163 (Stable 15 release — *deployment gate, see References*)
- **Code-review tasks (no direct user-facing change):** VCST-5273, VCST-5267, VCST-5266, VCST-5224, VCST-5082
- **Cancelled:** VCST-5061, VCST-5327, VCST-5326, VCST-5313, VCST-5280, VCST-5257, VCST-4392, VCST-5034

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical. Grouped by primary domain.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Checkout — Multistep Place Order (VCST-5369) | 4 | 5 | 20 | Critical | Place-Order **disabled** on the Review step blocks order completion outright — a revenue-blocking defect on the P0 checkout path; reproduces across Authorize.Net / CyberSource / Skyflow (all `allowCartPayment=true`) and only under the multistep flow, so easy to regress |
| Cart — xCart Validation + Configurable Products (VCST-5234, 5173, 5238, 5021) | 4 | 5 | 20 | Critical | VCST-5234 (Highest) is a per-line validation/`isValid` state loss on **any** cart mutation — directly affects whether checkout is gated correctly; plus a configurable-products cart redesign + Apollo `currencyCode` cache fix landing on the same cart surface simultaneously |
| Loyalty Mixed Cart & Product Points (VCST-5104, 5135, 5103) | 3 | 4 | 12 | High | Three concurrent loyalty deliverables (E2E create-order, Product Points program, balance validator) on the mixed-currency cart/order path; promotion-scope isolation + per-currency totals risk |
| Marketing / Coupons (VCST-5233, 4767, 5021) | 3 | 4 | 12 | High | Coupon copy/case-mismatch redemption blocker (carryover) + admin coupon validation + empty-apply guard — revenue-adjacent discount path, multiple concurrent touches |
| B2B Org Roles & Lockout (VCST-5028, 5374) | 3 | 4 | 12 | High | New per-organization role & access-control model (storefront + customer module) + temp-vs-permanent lockout messaging fix — access-control regressions are high-impact and hard to spot |
| Catalog — Import/Export/Variations/Sorting (VCST-5189, 5278, 5345, 5177, 5289, 4675) | 4 | 3 | 12 | High | Six concurrent catalog changes incl. a **parallel-import data-loss** fix (inventory integrity), export 500 on external blob URLs, per-variation associations, featured sorting, nested-category sort, and category reindex |
| UI Kit — Design Tokens & Reorg (VCST-4217, 4228, 5141) | 4 | 3 | 12 | High | New design-token system on VcButton + VcBadge **plus** an atomic-tier folder reorganization of the whole UI kit — broad reuse surface across every storefront page; import/selector & visual-regression risk |
| Orders — Async Snapshot & onX (VCST-5158, 4464) | 3 | 3 | 9 | Medium | Order product snapshot moved to async (timing/data-integrity on order creation) + onX fulfilment-adapter create-order integration; backend, no direct storefront surface |
| Search Indexing Admin (VCST-5218, 4675) | 3 | 3 | 9 | Medium | Cancel-indexation 500 fix + per-category reindex action; admin operability of the index workflow |
| Platform / Security (VCST-5261, 5375, 5264, 5247) | 2 | 4 | 8 | Medium | MessagePack/LZ4 + CVE dependency hardening, Redis 3.0.0 cache bump, role-search empty-keyword — platform stability & smoke, low UI surface |
| BOPIS — Pickup Pagination (VCST-4646, 4529) | 2 | 3 | 6 | Medium | Pickup-location list pagination + filters/search; existing mouse path works, regression scoped to the map/list panel |
| Admin SPA Modules (VCST-5227, 5223, 5276, 5270, 5232) | 3 | 2 | 6 | Medium | Task-management due-date filter, News bulk-delete count (data-safety on a destructive action), pricing-export layout overlap, push icon, dashboard cards — independent low-blast-radius admin fixes |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Checkout — Multistep Place Order | Yes | — | — | Yes | — | — |
| Cart — xCart Validation + Configurable | Yes | — | — | Yes | — | — |
| Loyalty Mixed Cart & Product Points | Yes | — | — | Yes | — | — |
| Marketing / Coupons | Yes | Yes | Yes | Yes | — | — |
| B2B Org Roles & Lockout | Yes | Yes | Yes | Yes | — | — |
| Catalog — Import/Export/Variations/Sorting | Yes | Yes | Yes | Yes | — | — |
| UI Kit — Design Tokens & Reorg | Yes | — | — | — | Yes | — |
| Orders — Async Snapshot & onX | — | Yes | Yes | Yes | — | — |
| Search Indexing Admin | — | Yes | Yes | — | — | — |
| Platform / Security | — | Yes | Yes | — | — | — |
| BOPIS — Pickup Pagination | Yes | — | — | Yes | — | — |
| Admin SPA Modules | — | Yes | Yes | — | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- **Multistep checkout Place Order (VCST-5369):** with `checkout_multistep_enabled=true`, drive **Proceed → Billing → Review → Place Order** to a paid order for each `allowCartPayment=true` processor (Authorize.Net, CyberSource, Skyflow); confirm the Place-Order control is enabled and the order is created. Cross-check the single-step flow still works.
- **Cart xCart validation + configurable (VCST-5234, 5173, 5238, 5021):** assert `items[].validationErrors` / `isValid` **persist** across add / update-qty / remove / coupon mutations (suite 050b5); configurable-product line behavior post-redesign; no Apollo `currencyCode` cache error on qty update; coupon Apply disabled on empty input.

**High domains (run in parallel with critical):**
- Loyalty mixed-cart: per-currency `cart.totals[]`, Product Points earning, balance validator at place-order (server-side).
- Marketing/coupons: copy-then-paste coupon case-insensitivity (UI + xAPI), admin alphanumeric coupon validation.
- B2B org roles & lockout: per-org role assignment & enforcement (storefront + admin + REST), temporary-vs-permanent lockout message for org users.
- Catalog: parallel-import data-integrity (no silent overwrite), export with external/absolute image URL (no 500), per-variation associations (REST + xAPI), featured sorting, nested-category sort (`childCategories`), per-category reindex.
- UI-kit: VcButton/VcBadge token-driven render across breakpoints + a layout-stability sweep (048b) and Storybook visual baselines after the folder reorg.

**Medium domains (after critical/high pass):** Orders async snapshot + onX create-order, search cancel-indexation, platform/security smoke (Redis/MessagePack/role-search), BOPIS pickup pagination, admin module fixes (task due-date filter, news delete count, pricing-export layout, push icon, dashboard cards).

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| Multistep Place Order (VCST-5369) | Decision Table | multistep on/off × processor (AN/CyberSource/Skyflow) × step reached (Billing/Review) |
| xCart per-line validity (VCST-5234) | State Transition | valid → mutate (add/update/remove/coupon) → `validationErrors`/`isValid` must persist |
| Configurable products in cart (VCST-5173) | State Transition + EP | add → edit config → re-add; default pre-fill; line consolidation |
| Apollo `currencyCode` (VCST-5238) | Error Guessing | update-qty on mixed-currency cart → no missing-field cache error |
| Coupon copy-case (VCST-5233) | EP | copied UPPERCASE vs stored case × paste in cart/sidebar |
| Coupon admin validation (VCST-4767) | EP + BVA | alphanumeric vs special-char input at field boundary |
| Per-org roles (VCST-5028) | Decision Table | role × organization × resource permission |
| Org lockout message (VCST-5374) | State Transition | N failed attempts → temporary-lockout text (org vs non-org user) |
| Parallel import (VCST-5189) | Pairwise / Error Guessing | two concurrent imports of overlapping SKUs → last-writer integrity |
| Catalog export external URL (VCST-5278) | Error Guessing | product with absolute/external blob image Url → export succeeds, no 500 |
| Nested-category sort (VCST-5289) | EP | `sort: priority;name` applied at every `childCategories` depth |
| Per-variation associations (VCST-5345) | EP | nested product load via REST vs xAPI `VariationType` parity |
| Featured sorting (VCST-5177) | Decision Table | category browse vs search × featured-first ordering |
| Loyalty mixed cart (VCST-5104/5135/5103) | State Transition + BVA | single→mixed cart; points earn/redeem; balance at boundary |
| UI-kit tokens (VCST-4217/4228) | Decision Table | component variant × state × token-driven color/icon |
| Async order snapshot (VCST-5158) | Error Guessing | place order → snapshot persisted after async settle |
| Cancel indexation (VCST-5218) | Error Guessing | cancel running index task → no 500, task transitions cleanly |
| News bulk delete count (VCST-5223) | BVA | cross-page select-all (56) and 2-row selection → confirmation count exact |
| Task due-date filter (VCST-5227) | EP + BVA | due-date window → only matching tasks; param `startDueDate`/`endDueDate` |
| Pricing export layout (VCST-5276) | Visual / geometry | export toolbar must not overlap grid header (numeric `getBoundingClientRect`) |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always-on (+ VCST-5141 UI-kit reorg / VCST-5264 Redis selector & build sanity) | P0 |
| 078 | Backend Smoke Tests | Cross-cutting | Always-on (+ VCST-5261/5247 dependency hardening) | P0 |
| 011 | Checkout Flow | Checkout | VCST-5369 | P0 |
| 012 | Checkout Guest | Checkout | VCST-5369 | P1 |
| 013 | Checkout B2B | Checkout | VCST-5369, VCST-5028 | P1 |
| 081 | Select Shipping Address Popup | Checkout | VCST-5369 | P1 |
| 039 | Payment CyberSource | Payment | VCST-5369 | P0 |
| 040a | Payment — Skyflow | Payment | VCST-5369 | P0 |
| 040b | Payment — Authorize.Net | Payment | VCST-5369 | P0 |
| 041 | Payment Cross-Cutting | Payment | VCST-5369 | P0 |
| 028 | Cart Core | Cart | VCST-5234, VCST-5173, VCST-5238, VCST-5021 | P0 |
| 029 | Cart Validation & Persistence | Cart | VCST-5234 | P0 |
| 030 | Cart Merge | Cart | VCST-5173 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | xCart | VCST-5234 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | xCart | VCST-5233, VCST-5021 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | xCart | VCST-5238 (loyalty `totals[]`) | P1 |
| 050b5 | GraphQL xCart — Per-RuleSet Validation & Line-Item Validity | xCart | VCST-5234 (exact match) | P0 |
| 072 | Configurable Products UI | Configurable Products | VCST-5173, VCST-5079 | P1 |
| 072b | Configurable Products E2E | Configurable Products | VCST-5173, VCST-5079 | P1 |
| 072c | Configurable Products Cross-Cutting | Configurable Products | VCST-5173 | P2 |
| 072d | Configurable Products File & Text Sections | Configurable Products | VCST-5173 | P2 |
| 052 | Configurable Products Admin | Configurable Products | VCST-5076, VCST-5173 | P2 |
| 050i | GraphQL Configurable Products | xCatalog | VCST-5079 | P1 |
| 075 | Loyalty | Loyalty | VCST-5135, VCST-5103 | P1 |
| 075b | Loyalty Mixed Cart Order | Loyalty | VCST-5104 | P1 |
| 075c | Loyalty Product Points Earning | Loyalty | VCST-5135 | P1 |
| 083 | Loyalty Catalog Browsing | Loyalty | VCST-5135 | P1 |
| 083b | Loyalty Mixed Cart Order | Loyalty | VCST-5104 | P1 |
| 077 | Coupons & Promotions Storefront | Marketing | VCST-5233, VCST-5021 | P1 |
| 077b | Coupons & Promotions — Cart Sidebar | Marketing | VCST-5021, VCST-5233 | P1 |
| 025 | Marketing Coupons & API | Marketing | VCST-4767, VCST-5233 | P1 |
| 023 | Marketing Promotions | Marketing | VCST-4767 | P2 |
| 079 | xMarketing Admin & REST | Marketing | VCST-4767 | P2 |
| 050j | GraphQL xMarketing | xMarketing | VCST-5233 | P2 |
| 006 | B2B Organization | B2B | VCST-5028 | P1 |
| 008 | B2B Members | B2B | VCST-5028 | P1 |
| 032 | Auth Session & RBAC | Auth | VCST-5028 | P1 |
| 031 | Auth Login & Register | Auth | VCST-5374 | P1 |
| 033 | Auth Company & Account Menu | Auth | VCST-5374 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-5028 | P1 |
| 027b | Customer Org Memberships (per-org roles & lockout) | Customer | VCST-5028, VCST-5374 (exact match) | P1 |
| 050d | GraphQL xProfile | xProfile | VCST-5028 | P2 |
| 049 | Platform API | Platform | VCST-5028 (org-membership REST), VCST-5375 | P0 |
| 051 | Catalog Admin Products | Catalog | VCST-5189, VCST-5278, VCST-5345 | P1 |
| 053 | Catalog Admin Categories | Catalog | VCST-5289, VCST-4675 | P1 |
| 064 | CSV Import Export | Import/Export | VCST-5189, VCST-5278 | P1 |
| 056 | Inventory | Inventory | VCST-5189 (inventory integrity) | P1 |
| 050a | GraphQL xCatalog | xCatalog | VCST-5289, VCST-5345, VCST-5177 | P1 |
| 061 | Search Indexing Admin | Search | VCST-5218, VCST-4675 | P1 |
| 001 | Catalog Navigation | Catalog | VCST-5177 | P2 |
| 002 | Product Detail | Catalog | VCST-5345 | P2 |
| 003 | Catalog Filters | Catalog | VCST-5177 | P2 |
| 004 | Search Core | Search | VCST-5177, VCST-4675 | P2 |
| 005 | Search Filters & Advanced | Search | VCST-5177 | P2 |
| 048b | Layout Stability | UI Kit / Cross-cutting | VCST-4217 (VcButton), VCST-4228 (VcBadge), VCST-5276 | P1 |
| 045 | Accessibility Tests | UI Kit | VCST-4217, VCST-4228 | P2 |
| 044 | Security Tests | Cross-cutting | VCST-5261 | P1 |
| 014 | Orders Frontend | Orders | VCST-5158 | P2 |
| 017 | Orders Admin Management | Orders | VCST-5158 | P2 |
| 018 | Orders Admin Payments | Orders | VCST-5369 (paid-order confirmation) | P2 |
| 050c | GraphQL xOrder | xOrder | VCST-5158, VCST-4464 | P2 |
| 055 | Pricing Management | Pricing | VCST-5276 | P2 |
| 020 | Platform Users Roles & Settings | Platform | VCST-5375 | P2 |
| 063 | Core Settings | Platform | VCST-5264 (Redis) | P2 |
| 085 | Task Management | Task Management | VCST-5227 | P2 |
| 084 | News Articles | News | VCST-5223 | P2 |
| 068 | Push Messages | Push Messages | VCST-5270 | P2 |
| 036 | BOPIS Store Selector | BOPIS | VCST-4646, VCST-4529 | P2 |
| 037 | BOPIS Cart | BOPIS | VCST-4646 | P2 |
| 038 | BOPIS Checkout | BOPIS | VCST-4646 | P2 |
| 050k | GraphQL xPickup | xPickup | VCST-4646 | P2 |
| 050h | GraphQL Wishlist | Wishlist | VCST-2925, VCST-5200 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

> BL-B2B-007..010 and BL-AUTH-012/013 referenced below are **candidate invariants** implied by VCST-5028; promote via a follow-up `/qa-test-lifecycle --update-bl` run before citing as canonical.

| Gap ID | Ticket(s) | Description (BL-* ref) | Target Suite(s) | Owner |
|--------|-----------|------------------------|-----------------|-------|
| GAP-01 | VCST-5234 | Assert `items[].isValid` / `items[].validationErrors` **persist** after a subsequent cart mutation (addItem, qty change, coupon apply) — the fix prevents the error state being silently wiped on recalculation (BL-CART-*) | 050b5 (exact match); 028/029 UI badge | qa-backend-expert + qa-frontend-expert |
| GAP-02 | VCST-5369 | Multistep checkout (`checkout_multistep_enabled=true`) × `allowCartPayment=true` — Place-Order on Review step (BL-CHK-002 double-submit, BL-CROSS-010 idempotency) | 081 (extend), 039/040a/040b cross-ref | qa-frontend-expert |
| GAP-03 | VCST-5369 | `checkout_multistep_enabled` toggled mid-session → Place-Order enable/disable state correct on Review (BL-CROSS-006) | 081 | qa-frontend-expert |
| GAP-04 | VCST-5374 | Org-scoped **temporary** lockout returns the temporary error code + org-specific storefront copy (NOT permanent "contact administrator") (BL-AUTH-012/013) | 027b, 032, 033 | qa-backend-expert + qa-frontend-expert |
| GAP-05 | VCST-5233 | "Click to copy" coupon code preserves display case AND the pasted value is accepted without manual edit (BL-CART-003) | 077, 077b, 025 | qa-frontend-expert + qa-backend-expert |
| GAP-06 | VCST-4767 | Coupon code field rejects chars outside the alphanumeric allowlist with a validation error (not silent accept) (BL-CART-003) | 025 (extend) | qa-backend-expert |
| GAP-07 | VCST-5289 | `categories` xAPI `childCategories(sort:)` returns children in requested order at every depth (BL-SRCH-003) | 050a (extend) | qa-backend-expert |
| GAP-08 | VCST-5345 | `product.variations[].associations[]` exposed on nested load — REST + xAPI `VariationType` parity (BL-CAT-002) | 050a, 049, 051 | qa-backend-expert |
| GAP-09 | VCST-5189 | Concurrent imports over overlapping SKUs → last-finishing import does NOT silently overwrite inventory (BL-CROSS-009) | 064 (extend), 056 | qa-backend-expert |
| GAP-10 | VCST-5278 | Export of products with external/absolute blob image URLs → recoverable error, no 500 FileNotFound | 064 (extend), 051 | qa-backend-expert |
| GAP-11 | VCST-5028 | Per-org roles invariants: org-role change does not mutate global `ApplicationUser.Roles`; self-service registration writes no security roles; JWT `permissions[]` == `pageContext.user.permissions` post org-switch; org-membership lock ≠ global `LockoutEnd` (BL-B2B-007..010, BL-AUTH-012) | 006, 027b, 032, 033 | qa-backend-expert + qa-frontend-expert |
| GAP-12 | VCST-5173 | Re-open configurator from a cart line item → updated configuration reprices the line correctly (cart-level edit path is new) (BL-CART-010 candidate) | 072, 072b (extend) | qa-frontend-expert |
| GAP-13 | VCST-5104/5103/5135 | Mixed-cart loyalty: points-only cart rejection at Place Order; zero earn on PTS lines; two-entry `orderTotals` shape; ProductPoints single-winner priority (see `project_loyalty_productpoints_resolution_model`) | 083, 083b, 075b, 075c | qa-frontend-expert + qa-backend-expert |
| GAP-14 | VCST-5158 | Async order snapshot: order places successfully (state `New`, not stuck); snapshot eventually present on order detail (BL-ORD-005, BL-CROSS-005) | 017, 018 (extend) | qa-backend-expert |
| GAP-15 | VCST-4464 | onX adapter create-order flow: request sent, order state transitions, error mapping — no suite covers onX | 017 (extend), 014 | qa-backend-expert |
| GAP-16 | VCST-5375 | `roles?keyword=` (empty/whitespace) returns full role list, not empty (BL-AUTH-005) | 020 (extend), 049 | qa-backend-expert |
| GAP-17 | VCST-5218 | `/api/search/indexes/tasks/{id}/cancel` with unknown ID → 404, not 500 KeyNotFoundException | 061 (extend) | qa-backend-expert |
| GAP-18 | VCST-5276 | Pricing-export toolbar must not overlap grid header — numeric geometry check (Admin SPA; 048b covers storefront only) | 054/055 (extend) + ui-ux-expert visual | qa-backend-expert + ui-ux-expert |
| GAP-19 | VCST-4646 | BOPIS pickup-location list pagination: page 2 loads, total/per-page counts correct (BL-CROSS-009) | 036, 037 (extend) | qa-frontend-expert |
| GAP-20 | VCST-5223 | News bulk-delete confirmation count == cross-page selection (56), not page count (20); 2-row → 2 (BL-CROSS-012) | 084 (extend) | qa-backend-expert |
| GAP-21 | VCST-5227 | Task due-date filter end-to-end via corrected `startDueDate`/`endDueDate` params → grid filtered | 085 (extend) | qa-backend-expert |
| GAP-22 | VCST-5261 | Malformed/oversized MessagePack input → controlled 4xx/500, no `AccessViolationException` crash | 044 (extend), 049 | qa-backend-expert |
| GAP-23 | VCST-4217/4228 | VcButton/VcBadge variant × color-preset × icon snapshot against the new design-token palette (PRs #2320/#2347) | 048b (extend) + Storybook | ui-ux-expert |
| GAP-24 | VCST-5021 | Cart coupon Apply disabled on empty custom-code input, re-enables on type (BL-CART-003) | 028 (extend), 077 | qa-frontend-expert |
| GAP-25 | VCST-5238 | Qty-update on a cart already holding a PTS line → no Apollo `currencyCode` cache error in console (BL-LOY-006) | 028, 083b | qa-frontend-expert |

**Tickets with no existing suite (extend nearest, don't create single-case suites):** VCST-5232 → 063 (2 Admin SPA cases); VCST-4464 → 017 (propose dedicated `019b-orders-onx.csv` only if the integration expands); VCST-5375 → 020; VCST-5261 → 044/049.

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|---------|-----------|----------------|-------------|-----------|
| VCST-5234 | GraphQL (xCart) + Storefront | P0 Bug fix | 8 | 050b5 (6), 028/029 (2) | State Transition + Error Guessing (which mutation resets validity) |
| VCST-5369 | Storefront (Checkout) | P0 Bug fix | 7 | 081 (5), 039/040a/040b (cross-ref) | Decision Table (allowCartPayment × multistep flag × step) |
| VCST-5104 | Storefront + GraphQL (xOrder/xCart) + E2E | P0 Feature | 10 | 083b (4), 075b (3), 050c (2), 014 (1) | State Transition + Decision Table (PTS-only/mixed/cash × place-order outcome) |
| VCST-5173 | Storefront + GraphQL (xCart) + E2E | P1 Feature | 10 | 072 (4), 072b (3), 050i (2), 028 (1) | Decision Table + State Transition (cart-level config edit → reprice) |
| VCST-5028 | REST + GraphQL (xProfile) + Storefront | P1 Feature | 12 | 027b (4), 006 (2), 032 (2), 033 (2), 049 (2) | Decision Table (role × org × global-role isolation); State Transition |
| VCST-5135 | GraphQL (xCart) + Admin | P1 Feature | 7 | 075 (3), 050b1 (2), 083 (2) | Pairwise (program priority × SKU × factor × window); single-winner Decision Table |
| VCST-5103 | GraphQL (xCart) + Storefront | P1 Feature | 6 | 075c (3), 083b (2), 028 (1) | BVA (balance = / < / 0 / > cost); State Transition (validator → retry) |
| VCST-5079 + VCST-5076 | Storefront + E2E + GraphQL | P1 Feature | 8 | 072b (3), 072c (3), 050i (2) | Pairwise (section × option count × required); Error Guessing (partial selection gate) |
| VCST-5345 | GraphQL (xCatalog) + REST | P1 Feature | 5 | 050a (3), 049 (1), 051 (1) | EP (variation with/without associations); Error Guessing (nested depth) |
| VCST-5177 | Storefront + GraphQL + Admin | P1 Feature | 5 | 004 (2), 001 (1), 050a (1), 053 (1) | State Transition (sort → reindex → order); BVA (featured position) |
| VCST-4675 | Admin + REST | P1 Feature | 4 | 061 (2), 053 (1), 049 (1) | State Transition (index → rebuild → results); Error Guessing (concurrent job) |
| VCST-4646 | Storefront | P1 Feature | 5 | 036 (2), 037 (3) | BVA (page boundaries, single/last page); Error Guessing |
| VCST-4217 | UI Kit / Storefront | P1 Feature | 4 | 048b (4) | Pairwise (VcButton variant × preset × disabled) |
| VCST-4464 | REST + Admin | P1 Feature | 5 | 017 (3), 014 (2) | State Transition (onX create-order → fulfillment); Error Guessing (adapter unavailable) |
| VCST-5158 | REST + Admin | P1 Feature | 4 | 017 (2), 018 (2) | State Transition (place → async snapshot → present); Error Guessing (job fails, order ok) |
| VCST-5261 | REST API / Security | P0 Bug fix | 3 | 044 (2), 049 (1) | Error Guessing (malformed input); BVA (payload-size boundary) |
| VCST-5189 | Admin + REST | P1 Bug fix | 4 | 064 (3), 049 (1) | Error Guessing (concurrent import); State Transition (import job lifecycle) |
| VCST-5375 | REST + Admin | P1 Bug fix | 3 | 020 (2), 049 (1) | BVA (empty / null / whitespace keyword) |
| VCST-5374 | Storefront + REST | P1 Bug fix | 6 | 027b (2), 032 (2), 033 (2) | Decision Table (lockout type × error code × copy); State Transition (temp vs perm) |
| VCST-5289 | GraphQL (xCatalog) | P1 Bug fix | 4 | 050a (4) | BVA (sort values asc/desc/invalid/omitted); Error Guessing (nested vs top-level) |
| VCST-5278 | Admin + REST | P1 Bug fix | 3 | 064 (2), 051 (1) | Error Guessing (absolute/relative/missing image); EP (external vs internal blob) |
| VCST-5238 | Storefront | P1 Bug fix | 3 | 028 (2), 083b (1) | State Transition (qty update on PTS cart); Error Guessing (cache invalidation) |
| VCST-5233 | Storefront + API | P1 Bug fix | 4 | 077 (2), 025 (2) | EP (copy upper/lower/mixed case); Error Guessing (copy → paste no edit) |
| VCST-5227 | Admin | P1 Bug fix | 4 | 085 (4) | BVA (date boundaries); Decision Table (startDueDate × endDueDate) |
| VCST-5218 | REST + Admin | P1 Bug fix | 3 | 061 (2), 049 (1) | Error Guessing (unknown task ID, double-cancel); EP (valid vs invalid) |
| VCST-4767 | Admin | P1 Bug fix | 4 | 025 (3), 023 (1) | EP (alphanumeric / special / unicode); BVA (max code length) |
| VCST-4228 | UI Kit / Storefront | P1 Bug fix | 4 | 048b (4) | Pairwise (VcBadge variant × color token × icon) |
| VCST-5021 | Storefront | P1 Bug fix | 3 | 028 (2), 077 (1) | State Transition (Apply enabled/disabled on empty/filled/cleared); BVA (1-char) |
| VCST-5223 | Admin | P2 Bug fix | 3 | 084 (3) | BVA (cross-page count 20 vs 56); Error Guessing (2→3 off-by-one) |
| VCST-5276 | Admin | P2 Bug fix | 2 | 054/055 (2) | Error Guessing / geometry (toolbar overlap on open/dismiss/resize) |
| VCST-5270 | Admin | P2 Bug fix | 2 | 068 (2) | Error Guessing (icon: first load, cache clear, restart) |
| VCST-5232 | Admin | P2 Bug fix | 2 | 063 (2) | Error Guessing (>3 / =3 / <3 dashboard card values) |

**Total new cases estimated: 70–90** (P0 ~20: VCST-5234/5369/5104/5261 · P1 ~50–60 · P2 ~8–10). Lower bound consolidates E2E journeys; upper bound fully decomposes each decision-table row.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-12 PRs deployed to QA — vc-frontend artifact (#2315, #2320, #2327, #2333, #2344, #2347, #2329, #2295) + vc-platform module build (#3058, #3059) + module-repo fixes (x-cart, x-catalog, search, customer, marketing, catalog, news, task-management, loyalty, pricing, push) confirmed via `packages.json` / `artifact.json` (verify artifact version, not merge status). The **Stable 15** release task (VCST-5163) is the deployment gate.
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Store has `checkout_multistep_enabled=true` available to exercise VCST-5369; Authorize.Net / CyberSource / Skyflow configured with `allowCartPayment=true`; sandbox cards via `@td()` (AN expiry MM/YY)
- [ ] Loyalty (points) product + standard product available for a mixed-currency cart (VCST-5104/5135/5103; configurable products excluded); loyalty balance resolved relative to `LOY_SKU_PTS_UNIT` (balance is not resettable — see `project_loyalty_balance_cannot_be_reset`)
- [ ] Coupons stored in non-uppercase case for VCST-5233; coupon with special chars for VCST-4767
- [ ] Multi-org user with per-org roles for VCST-5028 (`reference_multi_org_test_user`); org-member account for VCST-5374 temp-lockout
- [ ] Catalog dataset with: products having absolute/external image URLs (VCST-5278); a category with nested child categories (VCST-5289); products with variations (VCST-5345); ≥2 overlapping import CSVs for the parallel-import race (VCST-5189)
- [ ] Configurable-products seed data present (VCST-5076) for VCST-5173/5079
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`; `locale: en-US` set); use Edge/Chrome — not Firefox — for checkout completion

### 7.2 Exit Criteria

- [ ] All P0 cases executed with 100% pass (042, 078, 011-013, 039/040a/040b/041, 028/029, 050b5, 049)
- [ ] All P1 cases executed with ≥95% pass
- [ ] Zero Critical/Blocker open bugs in scope domains; **VCST-5369 multistep Place-Order verified fixed** (revenue blocker) and **VCST-5234 cart validity persistence verified**
- [ ] High-priority items verified: VCST-5189 (no import data loss), VCST-5261 (platform stable post-dependency bump), VCST-5028 (per-org roles enforced), VCST-5374 (temp-lockout messaging)
- [ ] New cases for the Critical/High GAPs generated and in Draft status
- [ ] UI-kit visual baselines re-captured post token-system + folder reorg (VCST-4217/4228/5141); 048b layout-stability green
- [ ] RTM updated to ≥95% coverage for in-scope tickets

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| `checkout_multistep_enabled=true` store + AN/CyberSource/Skyflow `allowCartPayment=true` | Store settings + `test-data/` cards via `@td()` | VCST-5369; AN expiry MM/YY |
| Loyalty (points) product + standard product | Loyalty module / Catalog | VCST-5104/5135/5103 mixed-currency cart; balance relative to `LOY_SKU_PTS_UNIT`, not resettable |
| Coupons in non-uppercase case + special-char coupon | Admin → Marketing → Coupons | VCST-5233 / VCST-4767 (coupons are a separate entity — `reference_marketing_coupons_api_contract`) |
| Multi-org user with per-org roles | `reference_multi_org_test_user` (MULTI_ORG_USER_EMAIL) + `MULTI_ORG_TF_BR` | VCST-5028; org-member account for VCST-5374 lockout |
| Products with absolute/external blob image URLs | Admin → Catalog | VCST-5278 export 500 path |
| Category with nested child categories | Admin → Catalog (B2B virtual catalog root `@td(VIRTUAL_CATALOG_B2B.id)`) | VCST-5289 nested sort |
| Products with variations | Admin → Catalog | VCST-5345 per-variation associations |
| ≥2 overlapping product import CSVs | `test-data/uploads/` | VCST-5189 parallel-import race |
| Configurable products + sections + options seed | VCST-5076 dataset | VCST-5173 / VCST-5079 |
| Pickup locations >1 page | BOPIS seed | VCST-4646 pagination, VCST-4529 filters |

All variables resolved at runtime via `{{VAR}}` or `@td(ALIAS.field)`. No hardcoded IDs, SKUs, emails, prices, or order numbers (`feedback_flexible_test_cases`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-12 deployment confirmed on QA (Stable 15 / VCST-5163) | 2026-06-26 | DevOps |
| Test plan created | 2026-06-29 (this document) | test-management-specialist |
| Critical verifications — VCST-5369 (multistep Place Order) + VCST-5234 (cart validity) | 2026-06-30 – 2026-07-01 | qa-frontend-expert + qa-backend-expert |
| High verifications — loyalty, coupons, B2B roles, catalog import/export, UI-kit | 2026-07-01 – 2026-07-02 | qa-frontend-expert + qa-backend-expert + ui-ux-expert |
| New test-case generation — Critical/High GAPs | 2026-07-02 – 2026-07-03 | test-management-specialist |
| P0 + P1 regression run | 2026-07-03 – 2026-07-04 | regression-orchestrator |
| P2 regression run (admin modules, BOPIS, platform smoke) | 2026-07-04 – 2026-07-07 | regression-orchestrator |
| New test cases review and promotion (Draft → Reviewed) | 2026-07-07 | qa-lead-orchestrator |
| Final sign-off / go-no-go | 2026-07-08 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: multistep checkout, cart/configurable, loyalty, coupons, B2B roles, BOPIS | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: catalog import/export, marketing/coupon admin, search indexing, task-mgmt, news, pricing, push, dashboard | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI: `cart.totals[]`/validity, `categories` sort, `VariationType`, loyalty | qa-backend-expert | `scripts/graphql-runner.ts` | Interactive |
| REST API: per-org roles, async order snapshot, cancel-indexation, role search | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| UI-kit design tokens + folder reorg (VcButton/VcBadge), Storybook baselines, layout-stability | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** Use Edge/Chrome (not Firefox) for checkout completion (`feedback_firefox_cart_dropdown_quirk`). Never share a browser session between parallel agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|-----------------|-------|
| VCST-5369 | Multistep Place Order blocked | Bug (High) | Checkout / Payment | 011-013, 039/040a/040b/041, 081 (no inline-pay Review case) | GAP-02/03: 7 | qa-frontend-expert |
| VCST-5234 | xCart per-line validity lost on mutation | Bug (Highest) | Cart / xCart | 028, 029, 050b1 (no validity-persist case) | GAP-01: 8 | qa-backend-expert + qa-frontend-expert |
| VCST-5173 | Configurable products in cart redesign | Story | Cart / Config Products | 072/072b (PDP only), 050i | GAP-12: 10 | qa-frontend-expert |
| VCST-5238 | Apollo `currencyCode` cache error | Bug | Cart / Loyalty | 028, 083b (none) | GAP-25: 3 | qa-frontend-expert |
| VCST-5021 | Coupon Apply enabled on empty input | Bug (Low) | Cart / Coupons | 028, 077 (no empty-state) | GAP-24: 3 | qa-frontend-expert |
| VCST-5104 | Loyalty mixed-cart create order | Story | Loyalty / Cart | 083b, 075b (happy path) | GAP-13: 10 | qa-frontend-expert + qa-backend-expert |
| VCST-5135 | Product Points Program | Story | Loyalty | 075, 075c, 083 | GAP-13: 7 | qa-backend-expert |
| VCST-5103 | Loyalty balance validator | Story | Loyalty | 075c, 083b | GAP-13: 6 | qa-frontend-expert + qa-backend-expert |
| VCST-5233 | Coupon copy UPPERCASE rejected | Bug | Marketing / Coupons | 077/077b, 025 (no case variant) | GAP-05: 4 | qa-frontend-expert + qa-backend-expert |
| VCST-4767 | Admin coupon accepts special chars | Bug | Marketing / Admin | 025, 023 (no validation boundary) | GAP-06: 4 | qa-backend-expert |
| VCST-5028 | Per-organization roles | Story | B2B / Customer | 006/027b/032/033 (partial) | GAP-11: 12 | qa-backend-expert + qa-frontend-expert |
| VCST-5374 | Org temp-lockout shown as permanent | Bug | Auth / B2B | 031/032/033 (global only) | GAP-04: 6 | qa-backend-expert + qa-frontend-expert |
| VCST-5189 | Parallel import data loss | Bug (High) | Catalog / Import | 064, 056 (no race case) | GAP-09: 4 | qa-backend-expert |
| VCST-5278 | Export 500 on external image URL | Bug | Catalog / Export | 064, 051 (no negative) | GAP-10: 3 | qa-backend-expert |
| VCST-5345 | Per-variation associations | Story | Catalog / GraphQL | 050a, 049, 051 (none) | GAP-08: 5 | qa-backend-expert |
| VCST-5177 | Configurable featured sorting | Story | Catalog / Search | 001/003/004/005, 050a | GAP: 5 | qa-frontend-expert + qa-backend-expert |
| VCST-5289 | Nested childCategories sort ignored | Bug | GraphQL xCatalog | 050a (no nested-sort case) | GAP-07: 4 | qa-backend-expert |
| VCST-4675 | Rebuild index for a category | Story | Search / Catalog | 061, 053 | GAP: 4 | qa-backend-expert |
| VCST-5218 | Cancel-indexation 500 | Bug | Search / Admin | 061 (nominal only) | GAP-17: 3 | qa-backend-expert |
| VCST-4217 | VcButton design tokens | Story | UI Kit | 048b (pre-token matrix) | GAP-23: 4 | ui-ux-expert |
| VCST-4228 | VcBadge colors & icons | Bug | UI Kit | 048b (pre-token matrix) | GAP-23: 4 | ui-ux-expert |
| VCST-5158 | Async order snapshot | Story | Orders | 017/018 (nominal) | GAP-14: 4 | qa-backend-expert |
| VCST-4464 | onX fulfilment create order | Story | Orders / Integration | 017 (generic) | GAP-15: 5 | qa-backend-expert |
| VCST-5261 | MessagePack LZ4 security | Bug (High) | Platform / Security | 044, 049 (no binary-codec case) | GAP-22: 3 | qa-backend-expert |
| VCST-5375 | RoleSearchService empty keyword | Bug | Platform / Role search | 020, 049 (none) | GAP-16: 3 | qa-backend-expert |
| VCST-4646 | BOPIS pickup pagination | Story | BOPIS | 036/037 (no pagination case) | GAP-19: 5 | qa-frontend-expert |
| VCST-5227 | Task due-date filter not applied | Bug | Admin / Task-mgmt | 085 (no due-date filter case) | GAP-21: 4 | qa-backend-expert |
| VCST-5223 | News bulk-delete count mismatch | Bug | Admin / News | 084 (no cross-page count) | GAP-20: 3 | qa-backend-expert |
| VCST-5276 | Pricing export toolbar overlap | Bug (Low) | Admin / Pricing | 054/055 (no geometry) | GAP-18: 2 | qa-backend-expert + ui-ux-expert |
| VCST-5270 | Push admin icon missing | Bug (Low) | Admin / Push | 068 (none) | 2 | qa-backend-expert |
| VCST-5232 | Dashboard cards show only 3 values | Bug (Low) | Admin / Dashboard | none | 2 (extend 063) | qa-backend-expert |
| VCST-5079/5076 | Config products auto-tests + seed | Story | Config Products | 072b/072c, 050i | 8 | qa-frontend-expert + qa-backend-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket spanning storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog data changed (allow 30-60s lag)

Applies to: VCST-5369 (multistep Place Order), VCST-5234 (cart validity), VCST-5173 (configurable in cart), VCST-5104/5135/5103 (loyalty mixed cart), VCST-5233 (coupon redemption), VCST-5028 (per-org roles), VCST-5189 (parallel import integrity), VCST-5158 (async order snapshot), VCST-5345 (per-variation associations).

---

## 13. References

- Sprint 26-12 vc-frontend PRs (in window 2026-06-15→26): #2315 (VCST-5028), #2320 (VCST-4217), #2327 (VCST-5173), #2333 (VCST-5238), #2344 (VCST-5021), #2347 (VCST-4228), #2329 (VCST-5141), #2295 (VCST-4981); infra/chore: #2326, #2334, #2346, #2332
- Sprint 26-12 vc-platform PRs (in window): #3058 (VCST-5261), #3057 (VCST-5251), #3060 (VCST-5163 Stable 15), #3059 (VCST-5264), #3063 (VCST-5246), #3062 (actions bump)
- Module-repo fixes ship via their own `vc-module-*` repos, referenced by ticket: x-cart (5234/5233), x-catalog (5289), search (5218), customer (5374/5028), marketing (4767), catalog (5189/5278/5345/5177/4675), news (5223), task-management (5227), loyalty (5104/5135/5103), pricing (5276), push-messages (5270)
- Module → Suite map: `.claude/agents/knowledge/execution/module-suite-map.md`
- BL invariants: `.claude/agents/knowledge/oracles/business-logic.md` (BL-CART-*, BL-CHK-*, BL-LOY-*, BL-AUTH-*, BL-B2B-*, BL-CAT-*, BL-SRCH-*, BL-ORD-*, BL-CROSS-*, BL-MARK-*)
- Relevant memories: `project_vcst_5104_mixed_cart_loyalty`, `project_loyalty_productpoints_resolution_model`, `project_loyalty_balance_cannot_be_reset`, `project_org_user_temp_lockout_permanent_message` (VCST-5374), `reference_admin_spa_ui_fix` (VCST-5276 layout), `feedback_datatrans_redirect_not_blocker`, `reference_promotioncoupons_sort_contract`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- Test data: `test-data/` (cards, coupons, multi-org user, import CSVs via `@td()` / `{{VAR}}`)
