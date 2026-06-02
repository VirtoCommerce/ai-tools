# Sprint 26-09 Test Plan

**Document status:** Draft  
**Author:** test-management-specialist (orchestrated by /qa-test-plan)  
**Created:** 2026-05-15  
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)  
**Sprint dates:** 2026-04-29 – 2026-05-15 (inferred from JIRA Done resolutiondate range and merged-PR window)

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-09 |
| Date range | 2026-04-29 – 2026-05-15 |
| Theme | Configurable-products cart hardening (4 bugs + xAPI validation), Login-On-Behalf for company employees, Catalog permissions + FilteredBrowsing migration, Platform stability (TaskManagement / OAuth / Hangfire / xAPI concurrency), CyberSource OPUS amount validation, B2C Lists redesign, BOPIS modal scroll, A11y on checkout address popup |
| Total Done tickets | 33 (6 Stories, 15 Bugs, 12 Tasks/TechDebt) |
| Test-relevant Done tickets | 23 (Stories + Bugs + 2 test-relevant tasks) |
| Merged frontend PRs (in sprint window) | 18 PRs in `vc-frontend` |
| Merged module PRs (in sprint window) | ~14 across vc-platform, vc-module-catalog, vc-module-task-management, vc-module-sql-queries, vc-module-news, vc-module-x-cart |

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-4173 | Migrate FilteredBrowsing from Dynamic properties to Store Settings | Catalog / Store Settings |
| VCST-4755 | [Support][LuminousLabs] Granular Catalog Entity Permissions | Catalog / Auth (admin) |
| VCST-4898 | [Lists] Redesign the list-item | B2C Lists |
| VCST-4905 | Improve Login On Behalf UX for Support Member from Back Office | Auth / Impersonation |
| VCST-4906 | Login On Behalf for Company Employee | Auth / Impersonation |
| VCST-5026 | Add Backup and Restore feature to SqlQueries module | Admin / Platform module |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain |
|-----|----------|---------|--------|
| VCST-5069 | Highest | Builder.io and PageBuilder pages have errors on the frontend after rebuild index | CMS / Search Indexing |
| VCST-4835 | High | [Support][Innovadis] newsArticles: sort argument ignored, always returns oldest first | CMS / News xAPI |
| VCST-4936 | High | [Support][LuminosLabs] Quick Order adds only first quantity for duplicate items | Cart / Quick Order |
| VCST-4960 | High | [Cart][GraphQL] `changeCartConfiguredItem` silently accepts invalid `sectionId` — no validation error | Cart / Configurable Products / xAPI |
| VCST-4985 | High | [Cart] WHEN cart empty AND I have items in "Save for Later" THEN show the "Save for Later" block | Cart |
| VCST-4987 | High | [Configurable products] incorrect `maxLength` validation disables Add/Update Cart | Configurable Products / Cart |
| VCST-5053 | High | Merge carts for configurable products don't work properly | Cart / Configurable Products |
| VCST-5075 | High | [OPUS] CyberSource Capture request without `amount` shouldn't be processed | Payment / CyberSource |
| VCST-5083 | High | Cart-mutation race because XAPI binds `NoLockService` when Redis is absent | Platform / xAPI / Cart concurrency |
| VCST-5090 | High | VirtoCommerce.TaskManagement — `MySqlException` Incorrect table definition; only one auto column allowed | Platform / TaskManagement |
| VCST-4993 | Medium | [Checkout][Shipping][A11y] Address selection popup search input has wrong aria-label "Search pickup locations" | Checkout / A11y |
| VCST-5000 | Medium | Deleting a stuck job in Hangfire UI does not actually stop it | Platform / Hangfire / Admin |
| VCST-5029 | Medium | [BOPIS][Desktop] Pick Points modal does not auto-scroll to selected item when it is inside the default 50 | BOPIS / Storefront |
| VCST-5080 | Medium | OAuth client delete returns HTTP 500 on MySQL — error 1093 | Platform / Security / MySQL |
| VCST-5016 | Low | [Marketing][Cart] Coupons sidebar — "View all" link missing `rel="noopener noreferrer"` on `target="_blank"` | Marketing / Security hygiene |

### 2.3 TechDebt / Structural (QA-relevant: may impact test selectors or admin tables)

| Key | Summary | Domain |
|-----|---------|--------|
| VCST-4535 | [UI-kit] VcTable — implement `VcTableColumn` subcomponent for declarative column config | Admin SPA tables (broad) |
| VCST-5073 | Add address search by ID (xAPI extension) | xAPI / Profile / Addresses |
| PR vc-frontend #2201 (VCST-4517 pre-sprint) | Use breakpoints from the UI-kit | Frontend responsiveness |
| PR vc-frontend #2282 | chore: fix lint errors across project | Build / tooling |
| PR vc-frontend #2277, #2281, #2285, #2286 | Backend packages + types + VueUse 14.3 + minor dependency bumps | Dependencies |

### 2.4 Out of Scope

- VCST-4633 — Review deprecation warnings (recurring tooling task; no functional surface)
- VCST-4753 — Add actions for vc onX MCP adapter (integration code, no QA env deliverable yet)
- VCST-4968 — Regression test execution on QA (QA process task, not a code change)
- VCST-5008 — Onboarding (Dmitry Grishin) Step 2 (HR / onboarding)
- VCST-5035 — Smoke test on Virtostart (QA process task)
- VCST-5038 — Update modules on vcst environments (ops)
- VCST-5041 — Run E2E for All Supported DB in Parallel (CI infrastructure)
- VCST-5046 — Demo preparation for AI Scenarios (demo content, not customer-facing flow)
- VCST-5056 — [Docs][AI Quick Start] LLMS → VC DOCS (documentation only)
- VCST-5098 — API rate limit on api.github.com (CI / external integration)
- vc-platform #3022 (VCST-5065 Extension-Point Inspector), #3006 (VCST-4576 Token validation setting), #3019 (VCST-5006 Backoffice Modularity Framework) — pre-sprint tickets, not in this sprint's Done list
- vc-module-sql-queries #11 (VCST-5014), #13 dependabot fast-uri — pre-sprint / dependency-only

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Cart / Configurable Products (VCST-4985, 4987, 5053, 4960) | 5 | 5 | 25 | Critical | Four concurrent bug fixes on the same Cart × Configurable Products code path (UI validation, xAPI sectionId validation, merge logic, save-for-later block); regression surface is the cart's hottest area; P0 revenue path |
| Auth / Login On Behalf — Impersonation (VCST-4905, 4906) | 4 | 5 | 20 | Critical | Two new impersonation flows (support member → employee + company-employee → company-employee); security-sensitive — wrong scope = privilege escalation; new feature, no prior suite |
| Cart concurrency / xAPI lock (VCST-5083, 5075) | 4 | 5 | 20 | Critical | XAPI binds `NoLockService` when Redis missing (race on parallel cart mutations); CyberSource OPUS silently accepted captures without amount — both directly threaten financial integrity |
| CMS / Search Indexing (VCST-5069 Highest, VCST-4835) | 4 | 4 | 16 | Critical | Page Builder + Builder.io pages broken after reindex (Highest-priority bug); newsArticles sort regression in xCMS — content rendering depends on indexer correctness |
| Catalog Permissions + FilteredBrowsing migration (VCST-4173, 4755) | 4 | 4 | 16 | Critical | Permission-system change (granular entity scoping) + storage migration (Dynamic Properties → Store Settings) for browsing filters; back-office RBAC bugs are high-blast-radius |
| Payment / CyberSource (VCST-5075) | 3 | 5 | 15 | High | OPUS support ticket — Capture endpoint must reject when `amount` is missing; payment integrity P0 |
| BOPIS modal scroll (VCST-5029) | 3 | 4 | 12 | High | Pickup modal auto-scroll regression (item inside default 50); P1 BOPIS UX |
| Checkout A11y (VCST-4993) | 3 | 4 | 12 | High | Wrong `aria-label` ("Search pickup locations") on shipping address search — A11y on the P0 checkout path |
| B2C Lists redesign (VCST-4898) | 3 | 3 | 9 | Medium | New list-item layout — visual regression possible; functional add/remove/qty already covered |
| Quick Order duplicate quantity (VCST-4936) | 3 | 3 | 9 | Medium | LuminousLabs support bug — duplicate-SKU normalization; affects bulk B2B reorder |
| Platform / TaskManagement / OAuth / Hangfire / SqlQueries (VCST-5090, 5080, 5000, 5026) | 3 | 3 | 9 | Medium | Four admin/platform-only fixes; low storefront blast radius but operational impact |
| UI-kit VcTable refactor (VCST-4535) | 3 | 3 | 9 | Medium | Declarative column API replaces array-config across admin SPA tables; existing tests may pass while column visibility/sort silently regress |
| Marketing / Coupons sidebar security hygiene (VCST-5016) | 2 | 2 | 4 | Low | Adds `rel="noopener noreferrer"` to one external link — minimal blast radius |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Cart / Configurable Products | Yes | Yes | — | Yes | — | — |
| Login On Behalf | Yes | Yes | — | Yes | — | — |
| Cart concurrency / xAPI lock | — | — | — | Yes | — | — |
| CMS / Search Indexing | Yes | Yes | Yes | Yes | — | — |
| Catalog Permissions + FilteredBrowsing | Yes | Yes | Yes | Yes | — | — |
| Payment / CyberSource (OPUS) | Yes | — | Yes | — | — | — |
| BOPIS modal scroll | Yes | — | — | — | — | — |
| Checkout A11y | Yes | — | — | — | Yes | — |
| B2C Lists redesign | Yes | — | — | Yes | — | — |
| Quick Order duplicate qty | Yes | — | — | Yes | — | — |
| Platform / TaskManagement / OAuth / Hangfire | — | Yes | Yes | — | — | — |
| UI-kit VcTable refactor | — | Yes | — | — | — | — |
| Coupons sidebar `rel` attribute | Yes | — | — | — | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- Cart / Configurable Products: full layer stack (storefront cart UI + configurable PDP + xAPI mutations + admin); deep regression on the 4-bug cluster, including merge-on-login and concurrent-mutation paths
- Login On Behalf: end-to-end on storefront (employee perspective) and Admin SPA (support member trigger); RBAC verification — impersonator gets impersonated user's scope, not their own; stop-impersonation cleanly returns to original session
- Cart concurrency / xAPI: targeted parallel-mutation GraphQL run (VCST-5083) + payment-capture EP (VCST-5075)
- CMS / Search Indexing: reindex → page-render verification; xCMS `newsArticles` sort assertion

**High domains (run in parallel with critical):**
- Catalog Permissions + FilteredBrowsing: decision-table coverage on role × entity × CRUD; storefront filter visibility post-migration
- Payment / CyberSource OPUS: 3 EP cases at `/capture` endpoint
- BOPIS modal scroll, Checkout A11y: targeted regression in suites 036 and 011/045

**Medium domains (run after critical/high pass):**
- B2C Lists redesign — visual + functional smoke on suite 007
- Quick Order duplicate qty regression on 028 + 050b1
- Platform/Admin (TaskManagement, OAuth, Hangfire, SqlQueries) — Admin SPA + REST API
- VcTable refactor — admin-table regression sweep across customer/orders/platform admin (suites 026, 027, 017, 018, 020)

### 4.3 Test Design Techniques by Domain

| Domain | Technique | Rationale |
|--------|-----------|-----------|
| `changeCartConfiguredItem` validation (VCST-4960) | EP (valid / invalid / missing sectionId) | Three classes of input; assert `errors[]` populated for invalid/missing |
| Configurable-product `maxLength` (VCST-4987) | BVA (max-1, max, max+1) | Boundary validation re-enabled; text section |
| Cart merge configurable (VCST-5053) | State Transition (guest → login → merged cart) | Configured line items must preserve options, section values, price through merge |
| Save-for-Later block (VCST-4985) | State Transition (empty → add → remove all) | Block presence keyed to cart line count |
| Quick Order duplicate (VCST-4936) | EP (single / dup×2 / dup×3) | Normalisation rule — quantities accumulate, not overwrite |
| xAPI NoLockService race (VCST-5083) | EP (sequential / concurrent under no-Redis) | Cart totals integrity under concurrent mutation |
| CyberSource Capture no-amount (VCST-5075) | EP (with amount / no amount / zero amount) | Reject paths |
| FilteredBrowsing migration (VCST-4173) | Decision Table (property type × Store Setting toggle × storefront filter visibility) | Setting moved storage, behavior identical |
| Catalog entity permissions (VCST-4755) | Decision Table (role permission level × entity type × CRUD operation) | Granular permission matrix; BL-AUTH-005/006 |
| PageBuilder reindex (VCST-5069) | EP (reindex → page renders, console clean, xCMS valid) | Service-rebuild side effects |
| `newsArticles` sort (VCST-4835) | EP (ASC / DESC / no arg) | Arg-respecting branch coverage |
| Login On Behalf (VCST-4905, 4906) | State Transition + EP (RBAC negative cases) | Initiate → banner persists → navigate → stop; negative: missing permission, self-impersonation, nested |
| BOPIS modal scroll (VCST-5029) | BVA (item at 50, 51, last) | Scroll-into-view boundary |
| Address aria-label (VCST-4993) | EP (locale EN; aria-label value match) | Single A11y assertion |
| B2C Lists redesign (VCST-4898) | EP (layout renders; add/remove/qty; empty state) | Visual + functional surface |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|---------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always | P0 |
| 044 | Security Tests | Cross-cutting | VCST-4905, VCST-4906, VCST-5080 | P0 |
| 049 | Platform API | Platform | VCST-5080, VCST-5090, VCST-5026 | P0 |
| 078 | Backend Smoke Tests | Cross-cutting (backend) | VCST-5083, VCST-5075, VCST-5090 | P0 |
| 039 | Payment CyberSource | Payment | VCST-5075 | P0 |
| 040 | Payment Processors | Payment | VCST-5075 | P0 |
| 041 | Payment Cross-Cutting | Payment | VCST-5075 | P0 |
| 082 | Auth Impersonation / Login on Behalf | Auth | VCST-4905, VCST-4906 | P1 |
| 031 | Auth Login & Register | Auth | VCST-4905, VCST-4906 | P1 |
| 032 | Auth Session & RBAC | Auth | VCST-4905, VCST-4906 | P1 |
| 033 | Auth Company & Account Menu | Auth | VCST-4905, VCST-4906 | P1 |
| 020 | Platform Users Roles & Settings | Platform | VCST-4905, VCST-5080, VCST-4755 | P1 |
| 026 | Customer Contacts | Customer | VCST-4755, VCST-4906 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-4906 | P1 |
| 028 | Cart Core | Cart | VCST-4936, VCST-4985, VCST-5053 | P1 |
| 029 | Cart Validation & Persistence | Cart | VCST-4985, VCST-5053, VCST-5083 | P1 |
| 030 | Cart Merge | Cart | VCST-5053 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | GraphQL / xCart | VCST-4960, VCST-5053, VCST-5083, VCST-4936 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | GraphQL / xCart | VCST-4960, VCST-4936 | P1 |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | GraphQL / xCart | VCST-5053 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | GraphQL / xCart | VCST-4960, VCST-5083 | P1 |
| 050i | GraphQL Configurable Products | GraphQL / Configurable Products | VCST-4960, VCST-4987, VCST-5053 | P1 |
| 050a | GraphQL xCatalog | GraphQL / Catalog | VCST-4173, VCST-4755 | P1 |
| 050d | GraphQL xProfile | GraphQL / xProfile | VCST-4906, VCST-5073 | P1 |
| 050f | GraphQL xCMS | GraphQL / CMS | VCST-5069, VCST-4835 | P1 |
| 072 | Configurable Products UI | Config Products | VCST-4987, VCST-5053 | P1 |
| 072b | Configurable Products E2E | Config Products | VCST-4987, VCST-5053, VCST-4960 | P1 |
| 072c | Configurable Products Cross-Cutting | Config Products | VCST-4960 | P1 |
| 072d | Configurable Products File & Text Sections | Config Products | VCST-4987 | P1 |
| 052 | Configurable Products Admin | Config Products | VCST-4987, VCST-4960 | P1 |
| 001 | Catalog Navigation | Catalog | VCST-4173, VCST-4755 | P1 |
| 002 | Product Detail | Catalog | VCST-4173, VCST-4755 | P1 |
| 003 | Catalog Filters | Catalog | VCST-4173 | P1 |
| 004 | Search Core | Search | VCST-4173 | P1 |
| 005 | Search Filters & Advanced | Search | VCST-4173 | P1 |
| 051 | Catalog Admin Products | Catalog Admin | VCST-4755 | P1 |
| 053 | Catalog Admin Categories | Catalog Admin | VCST-4755 | P1 |
| 061 | Search Indexing Admin | Search Admin | VCST-5069, VCST-4173 | P1 |
| 007 | B2C Lists & Shared | B2C Lists | VCST-4898 | P1 |
| 059 | CMS Page Management | CMS | VCST-5069 | P1 |
| 060 | CMS Design & Content | CMS | VCST-5069, VCST-4835 | P1 |
| 036 | BOPIS Store Selector | BOPIS | VCST-5029 | P1 |
| 011 | Checkout Flow | Checkout | VCST-4993 | P1 |
| 034 | Store Management | Store | VCST-4173 | P1 |
| 045 | Accessibility Tests | Cross-cutting | VCST-4993 | P2 |
| 063 | Core Settings | Platform | VCST-4173 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

The following tickets have **no existing suite coverage** or require net-new test cases:

| Gap ID | Ticket | Description | Target Suite(s) | Owner |
|--------|--------|-------------|-----------------|-------|
| GAP-01 | VCST-4906 | Login On Behalf for Company Employee — full storefront flow (initiate from back office + employee perspective, banner persistence, stop-impersonation, RBAC enforcement). No prior suite coverage for the employee-side impersonation path. | Suite 082 | qa-frontend-expert |
| GAP-02 | VCST-4905 | Improved LOB UX for Support Member from Back Office — admin SPA trigger path, employee selector UX, error cases (permission missing, self-impersonation, nested impersonation). | Suite 082, Suite 020 | qa-backend-expert |
| GAP-03 | VCST-4960 | `changeCartConfiguredItem` silently accepts invalid `sectionId` — negative cases verifying xAPI now returns `errors[]` for invalid sectionId instead of silent no-op (BL-CART-011). | Suite 050i, Suite 050b4 | qa-backend-expert |
| GAP-04 | VCST-5053 | Merge carts for configurable products — merge-on-login preserves configured line items intact (options, section values, price). BL-CART-012 cross-lineItem boundary invariant. | Suite 050b3, Suite 072b, Suite 030 | qa-backend-expert + qa-frontend-expert |
| GAP-05 | VCST-4987 | `maxLength` validation re-fix — Add/Update Cart re-enabled after valid Text section input; BVA at boundary (max-1, max, max+1). BL-CART-014 section identification. | Suite 072d, Suite 050i | qa-frontend-expert |
| GAP-06 | VCST-4985 | Empty cart + "Save for Later" block visibility — block absent on empty cart, returns when item added. State-transition coverage absent from suite 028. | Suite 028 | qa-frontend-expert |
| GAP-07 | VCST-4936 | Quick Order — duplicate SKU accumulates correct total quantity rather than resetting to first line's qty. Cart quantity merge rule (BL-CART-007). | Suite 028, Suite 050b1 | qa-frontend-expert + qa-backend-expert |
| GAP-08 | VCST-5083 | xAPI `NoLockService` concurrency — parallel cart mutations under Redis-absent conditions do not corrupt cart totals (race-condition guard). BL-CART-001 / BL-CART-008 integrity. | Suite 050b4 | qa-backend-expert |
| GAP-09 | VCST-5075 | CyberSource Capture without `amount` field — request is rejected with HTTP 422 / error response, not silently processed. Payment integrity. | Suite 039, Suite 041 | qa-frontend-expert |
| GAP-10 | VCST-4173 | FilteredBrowsing migrated from Dynamic Properties to Store Settings — browsing-by-property still works in storefront after migration; Store Settings blade shows the setting; Dynamic Properties blade no longer shows it. | Suite 001, Suite 003, Suite 034 | qa-backend-expert + qa-frontend-expert |
| GAP-11 | VCST-4755 | Granular Catalog Entity Permissions — verify role with restricted permission cannot view/edit denied catalog entities; admin with full permission can; cross-entity boundaries not leaked. BL-AUTH-005/006 + catalog access control. | Suite 051, Suite 053, Suite 020, Suite 049 | qa-backend-expert |
| GAP-12 | VCST-5069 | Builder.io + PageBuilder pages errors after rebuild index — CMS pages render without JS errors post-reindex; xCMS GraphQL returns valid content nodes. | Suite 059, Suite 060, Suite 050f | qa-backend-expert |
| GAP-13 | VCST-4835 | `newsArticles` sort argument ignored — xCMS GraphQL query with `sort: publishDate DESC` returns results in correct descending order. | Suite 050f | qa-backend-expert |
| GAP-14 | VCST-4898 | Lists list-item redesign — new layout renders correctly (product image, name, price, qty, controls); existing list-item functional regression (add/remove/update qty). | Suite 007 | qa-frontend-expert |
| GAP-15 | VCST-5026 | SQL Queries module Backup & Restore — Admin blade shows Backup and Restore buttons; backup creates artifact; restore applies it; rollback on error. No existing Admin suite for this module. | Suite 049 (REST) | qa-backend-expert |
| GAP-16 | VCST-5073 | Address search by ID — xProfile `addresses` query with `id` filter returns the single matching address; non-existent ID returns empty. | Suite 050d | qa-backend-expert |
| GAP-17 | Unlinked PRs (BEM/deps/lint) | Smoke regression check — dependency/build-artifact changes may break selectors or runtime imports. No dedicated cases; smoke suite is the safety net. | Suite 042 | qa-frontend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|----------|-----------|-----------------|--------------|-----------|
| VCST-4906 | Storefront + Admin SPA | P1 Feature | 8–10 | 082, 020 | State Transition (initiate → banner → navigate → stop; BL-AUTH-008/009/010/011) |
| VCST-4905 | Admin SPA | P1 Feature | 5–6 | 082, 020 | State Transition (support member selects employee → session active → stops; BL-AUTH-011) + EP (permission missing) |
| VCST-4960 | GraphQL xAPI | P0 Bug fix | 4–5 | 050i, 050b4 | EP (valid sectionId / invalid sectionId / missing sectionId) — verifies BL-CART-011 now enforced; `errors[]` assertion mandatory |
| VCST-5053 | GraphQL + Storefront | P0 Bug fix | 5–6 | 050b3, 072b, 030 | State Transition (guest cart with configurable → login → merged cart preserves config; BL-CART-012 cross-boundary) |
| VCST-4987 | Storefront + GraphQL | P0 Bug fix | 4 | 072d, 050i | BVA (maxLength-1, maxLength, maxLength+1 chars in Text section) — BL-CART-014 |
| VCST-4985 | Storefront | P1 Bug fix | 3 | 028 | State Transition (empty cart → "Save for Later" absent → add item → block visible → remove all → block absent) |
| VCST-4936 | Storefront + GraphQL | P1 Bug fix | 3 | 028, 050b1 | EP (single SKU, duplicate SKU ×2, duplicate SKU ×3) — BL-CART-007 merge rule |
| VCST-5083 | GraphQL xAPI | P0 Bug fix | 3 | 050b4 | EP (sequential mutations pass; concurrent mutations under no-Redis path do not corrupt totals; BL-CART-001/008) |
| VCST-5075 | Storefront + REST API | P0 Bug fix | 3 | 039, 041 | EP (capture with amount — accepted; capture without amount — rejected; capture with zero amount — rejected) |
| VCST-4173 | Admin SPA + Storefront + GraphQL | P1 Feature | 5–6 | 034, 001, 003, 050a | Decision Table (property type × Store Setting toggle × storefront filter visibility) |
| VCST-4755 | Admin SPA + REST API + GraphQL | P1 Feature | 6–8 | 051, 053, 020, 049 | Decision Table (role permission level × entity type × CRUD operation; BL-AUTH-005/006) |
| VCST-5069 | Admin SPA + GraphQL | P1 Bug fix | 4 | 059, 060, 050f | EP (reindex → page renders without console errors; xCMS returns content nodes) |
| VCST-4835 | GraphQL xCMS | P1 Bug fix | 3 | 050f | EP (sort ASC / sort DESC / no sort arg) — assert `publishDate` ordering |
| VCST-4898 | Storefront | P1 Feature | 4–5 | 007 | EP (new layout renders; add/remove/update qty; empty list state; shared list-item layout) |
| VCST-4993 | Storefront + A11y | P1 Bug fix | 2 | 011, 045 | EP (aria-label value on address search input within checkout shipping popup) |
| VCST-5029 | Storefront | P1 Bug fix | 2 | 036 | BVA (item at position 50, item at position 51, last item) — auto-scroll visible in viewport |
| VCST-5026 | Admin SPA + REST API | P2 Feature | 3–4 | 049 | EP (backup creates artifact; restore from artifact; invalid artifact rejected) |
| VCST-5073 | GraphQL xProfile | P2 Feature | 3 | 050d | EP (existing ID returns match; non-existent ID returns empty; multiple IDs) |
| VCST-5080 | REST API | P1 Bug fix | 2 | 049 | EP (delete OAuth client — HTTP 200; verify MySQL error 1093 no longer triggers) |
| VCST-5090 | Platform / Admin | P1 Bug fix | 2 | 049, 078 | EP (TaskManagement table migration applied; background task creates/reads without error) |

**Total new cases estimated: 79–98**

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-09 PRs merged to QA branch and deployed
- [ ] Build artifact version confirmed via `packages.json` + `artifact.json` on the storefront (not `image.json`)
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Redis-absent toggle path verified at least once for VCST-5083 NoLockService coverage (use a dedicated test slot or coordinate with DevOps)
- [ ] At least one B2B org + Company Employee role + Support Member role provisioned for VCST-4905/4906 LOB scenarios
- [ ] Configurable product with both Text section (maxLength) and Section options exists for VCST-4987 + VCST-4960 + VCST-5053 BVA/State Transition cases
- [ ] CyberSource sandbox credentials valid; merchant POST endpoint reachable for VCST-5075 Capture verification
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`); Firefox/Edge confirmed for parallel agent runs

### 7.2 Exit Criteria

- [ ] All P0 test cases executed with 100% pass rate (suites 042, 044, 049, 078, 039, 040, 041)
- [ ] All P1 test cases executed with ≥95% pass rate
- [ ] Zero Critical/Blocker open bugs across Cart, Configurable Products, Auth, Payment, CMS, Catalog Permissions domains
- [ ] High-priority bugs verified fixed: VCST-5069, VCST-4960, VCST-5053, VCST-4987, VCST-4985, VCST-5083, VCST-5075, VCST-5090, VCST-4906, VCST-4905
- [ ] Regression suites 042, 044, 049, 078, 028-030, 050b1-b4, 050i, 072, 072b-d, 052, 039-041, 082 all pass
- [ ] New test cases for GAP-01 through GAP-09 generated and in Draft status; GAP-10 through GAP-17 in Backlog
- [ ] RTM updated to ≥95% coverage for in-scope tickets
- [ ] Critical-UI scope (suite 048b) re-run after the BEM/UI-kit refactor PRs (#2201, #2271, #2261)

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| Configurable product with Text section + Options section + File section | `/qa-seed-data catalog` or Admin → Catalog → Configurable Products | Required for VCST-4987 (Text maxLength BVA), VCST-4960 (sectionId xAPI), VCST-5053 (merge), VCST-4985 |
| Company Employee + Support Member (back-office role with `platform:security:loginOnBehalf` permission) | `test-data/users/agent-user-pool.csv` + Admin → Security → Roles | For VCST-4905, VCST-4906. Cross-reference `reference_impersonation_permission_naming` memory — admin key `platform:security:loginOnBehalf` ≡ code-side `CanImpersonate` |
| Customer-typed user (NOT back-office Administrator) | `test-data/users/agent-user-pool.csv` (SUPPORT_AGENT / John Mitchell) | LOB target must be storefront-capable customer; per `reference_admin_backoffice_only` memory the `admin` user cannot authenticate against storefront |
| CyberSource sandbox merchant credentials | `.env.local` (CYBERSOURCE_*) | For VCST-5075 Capture endpoint EP — verify configured for `vcst-qa` |
| BOPIS — fulfillment center list >50 entries | `/qa-seed-data` or live QA data | Required for VCST-5029 BVA at position 50/51/last |
| Pre-indexed Builder.io and PageBuilder pages | Admin → CMS → Pages + Admin → Search → Indexes | For VCST-5069 — must reindex during the test, observe page render before/after |
| B2C List (active customer, several items, including shared list) | Admin → Customer → Lists or `/qa-seed-data b2b` | For VCST-4898 redesign verification |
| Coupons with each type (% discount, fixed amount, free shipping, expired) | Admin → Marketing → Coupons | For VCST-5016 sidebar regression (existing); use `{{COUPON_CODE_*}}` vars |
| Newsletter / news articles with varied publishDate | Admin → CMS → News (or seed) | For VCST-4835 sort-arg coverage |
| Two parallel cart-mutation sessions (same userId / same cartId) | xAPI runner with two contexts | For VCST-5083 NoLockService concurrency test |

All variables resolved at runtime via `{{VAR}}` bindings or `@td(ALIAS.field)` resolver. No hardcoded IDs, SKUs, emails, prices, or order numbers in test cases (see `feedback_flexible_test_cases`, `feedback_env_resilience`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-09 deployment confirmed on QA | 2026-05-15 (in progress) | DevOps |
| Test plan created | 2026-05-15 (this document) | test-management-specialist |
| P0 bug verifications (VCST-5069, VCST-5075, VCST-5083, VCST-5090) | 2026-05-16 – 2026-05-17 | qa-backend-expert |
| Cart × Configurable Products cluster verification (VCST-4960, 4985, 4987, 5053, 4936) | 2026-05-16 – 2026-05-18 | qa-frontend-expert + qa-backend-expert |
| Login On Behalf E2E (VCST-4905, 4906) | 2026-05-18 – 2026-05-19 | qa-frontend-expert + qa-backend-expert |
| New test case generation — Critical-domain gaps (GAP-01 through GAP-09) | 2026-05-18 – 2026-05-20 | test-management-specialist |
| P0 + P1 regression run (suites: 042, 044, 049, 078, 028-030, 050b1-b4, 050i, 072, 072b-d, 052, 039-041, 082, 011, 036, 050f, 059-060) | 2026-05-19 – 2026-05-21 | regression-orchestrator |
| P2 regression run (045, 063) + smoke for unlinked PRs (042) | 2026-05-21 | regression-orchestrator |
| Critical-UI scope (048b) re-run after BEM/UI-kit PR (#2201, #2271, #2261) | 2026-05-21 | ui-ux-expert |
| New test cases review and promotion (Draft → Reviewed) | 2026-05-22 | qa-lead-orchestrator |
| Final sign-off / go/no-go | 2026-05-23 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: Cart × Configurable Products, BOPIS, B2C Lists, Coupons sidebar, Quick Order | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: Catalog Permissions, FilteredBrowsing settings, SqlQueries module, OAuth, Hangfire, TaskManagement, VcTable refactor sweep | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI (xCart, xCatalog, xProfile, xCMS, configurable products) | qa-backend-expert | playwright-edge | Interactive (runner-native via `scripts/graphql-runner.ts`) |
| REST API (Platform, SQL Queries Backup/Restore, OAuth, TaskManagement) | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| Login On Behalf (impersonation flow, A11y on banner) | qa-frontend-expert (employee perspective) + qa-backend-expert (admin trigger) | playwright-chrome + playwright-edge | Interactive |
| A11y: Checkout address popup aria-label (VCST-4993), LOB banner A11y | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** BA agents must not share browser slots with QA agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|------------------|-------|
| VCST-4906 | Login On Behalf for Company Employee | Story | Auth / LOB | Suite 082 (skeleton), 033 (partial) | GAP-01: 8–10 cases | qa-frontend-expert |
| VCST-4905 | Improve LOB UX from Back Office | Story | Auth / LOB | Suite 082 (skeleton), 020 (partial) | GAP-02: 5–6 cases | qa-backend-expert |
| VCST-4960 | `changeCartConfiguredItem` invalid sectionId silent accept | Bug (High) | Cart / Configurable / xAPI | Suite 050i (partial), 050b4 (partial) | GAP-03: 4–5 cases | qa-backend-expert |
| VCST-5053 | Merge cart loses configurable identity | Bug (High) | Cart / Configurable | Suite 030 (partial), 050b3, 072b (partial) | GAP-04: 5–6 cases | qa-backend-expert + qa-frontend-expert |
| VCST-4987 | Configurable `maxLength` validation regression | Bug (High) | Cart / Configurable | Suite 072d (none), 050i (partial) | GAP-05: 4 BVA cases | qa-frontend-expert |
| VCST-4985 | Empty cart + Save-for-Later block visibility | Bug (High) | Cart | Suite 028 (partial) | GAP-06: 3 state cases | qa-frontend-expert |
| VCST-4936 | Quick Order duplicate qty | Bug (High) | Cart / Quick Order | Suite 028 (partial), 050b1 (partial) | GAP-07: 3 cases | qa-frontend-expert + qa-backend-expert |
| VCST-5083 | xAPI NoLockService cart race | Bug (High) | Platform / xAPI | Suite 050b4 (none for concurrency) | GAP-08: 3 cases | qa-backend-expert |
| VCST-5075 | CyberSource Capture no-amount | Bug (High) | Payment | Suite 039 (partial), 041 (partial) | GAP-09: 3 cases | qa-frontend-expert |
| VCST-5069 | Builder.io + PageBuilder after reindex | Bug (Highest) | CMS / Search | Suite 059, 060, 050f (partial) | GAP-12: 4 cases | qa-backend-expert |
| VCST-4835 | `newsArticles` sort ignored | Bug (High) | CMS / xCMS | Suite 050f (none for sort arg) | GAP-13: 3 cases | qa-backend-expert |
| VCST-4173 | FilteredBrowsing migrate to Store Settings | Story | Catalog / Store Settings | Suite 034 (partial), 001, 003, 050a (partial) | GAP-10: 5–6 cases | qa-backend-expert + qa-frontend-expert |
| VCST-4755 | Granular Catalog Entity Permissions | Story | Catalog / Auth | Suite 051, 053, 020, 049 (none for permission matrix) | GAP-11: 6–8 cases | qa-backend-expert |
| VCST-4898 | Lists list-item redesign | Story | B2C Lists | Suite 007 (partial) | GAP-14: 4–5 cases | qa-frontend-expert |
| VCST-5026 | SqlQueries Backup & Restore | Story | Admin / Platform | Suite 049 (none) | GAP-15: 3–4 cases | qa-backend-expert |
| VCST-5073 | Address search by ID | Task | xAPI / xProfile | Suite 050d (none) | GAP-16: 3 cases | qa-backend-expert |
| VCST-5080 | OAuth client delete MySQL 500 | Bug (Medium) | Platform / Security | Suite 049 (partial), 044 | 2 cases | qa-backend-expert |
| VCST-5090 | TaskManagement MySQL incorrect table definition | Bug (High) | Platform | Suite 049 (partial), 078 | 2 cases | qa-backend-expert |
| VCST-5000 | Hangfire stuck job delete no-op | Bug (Medium) | Platform / Admin | Suite 020 (partial), 049 | 1 verification case | qa-backend-expert |
| VCST-4993 | Checkout address popup wrong aria-label | Bug (Medium) | Checkout / A11y | Suite 011 (partial), 045 (none) | 2 cases | ui-ux-expert + qa-frontend-expert |
| VCST-5029 | BOPIS pick-points modal auto-scroll | Bug (Medium) | BOPIS | Suite 036 (partial) | 2 BVA cases | qa-frontend-expert |
| VCST-5016 | Coupons sidebar `rel` attribute | Bug (Low) | Marketing | Suite 044 (partial) | 1 attribute case | qa-frontend-expert |
| VCST-4535 | VcTable VcTableColumn refactor | Task | Admin UI-kit | Suites 020, 026, 027, 017, 018 (no dedicated visual) | Smoke pass on admin tables — 1 case per touched table | qa-backend-expert + ui-ux-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket that spans storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly (use `scripts/graphql-runner.ts` for xAPI assertions; do NOT write custom JS scripts — see `feedback_use_canonical_graphql_runner`)
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog/CMS data changed (allow 30–60s lag)
- [ ] LAYOUT: For VCST-4535 / BEM PRs — verify `scripts/lib/measure-layout.ts` deltas stay within 048b thresholds

Applies to: VCST-4960, VCST-4987, VCST-5053, VCST-4985, VCST-4936 (Cart × Configurable cluster), VCST-4906 (LOB Company Employee), VCST-5069 (CMS reindex), VCST-4173 (FilteredBrowsing migration), VCST-4755 (Catalog Permissions), VCST-5083 (xAPI concurrency).

---

## 13. References

- **Sprint 26-09 PRs:**
  - `VirtoCommerce/vc-frontend` (18 merged): #2273 (VCST-4985), #2274 (VCST-4936), #2272 (VCST-4987), #2271 (VCST-4898), #2283 (VCST-5029), #2261 (VCST-4535), #2287 (VCST-4993), #2289 (VCST-5016), #2279 (VCST-4905), #2280 (VCST-4906); unlinked/dependency PRs: #2277, #2281, #2282, #2201 (VCST-4517), #2285 (VCST-4469), #2286 (VCST-5037), #2288 (VCST-5041), #2290 (VCST-4633)
  - `VirtoCommerce/vc-platform`: #3023 (VCST-5080)
  - `VirtoCommerce/vc-module-catalog`: #876 (VCST-4755), #881 (VCST-4173)
  - `VirtoCommerce/vc-module-task-management`: #27 (VCST-5090)
  - `VirtoCommerce/vc-module-sql-queries`: #12 (VCST-5026)
  - `VirtoCommerce/vc-module-news`: #18 (VCST-4835)
  - `VirtoCommerce/vc-module-x-cart`: #113 (VCST-4987), #116 (VCST-5053), #114 (configurationItem mutations — likely VCST-4960), #110 (cart aggregate validation)
- **Tickets with code path unverified at plan time** (Done but no clearly-linked PR found by orchestrator scan): VCST-4960 (likely PR vc-module-x-cart #114), VCST-5069, VCST-5075, VCST-5083, VCST-5000 — verify via release notes or deploy artifact before marking GAP cases ready.
- Module → Suite map: `.claude/agents/knowledge/module-suite-map.md`
- E2E Scenario Catalog: `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- GraphQL authoring contract: `.claude/agents/knowledge/graphql-test-cases-runner.md` (consume `@td()` natively)
- Business Logic invariants: `.claude/agents/knowledge/business-logic.md` (BL-CART-001, 007, 008, 011, 012, 014; BL-AUTH-005/006/008/009/010/011)
- Critical-UI scope (run 048b after BEM/UI-kit PRs): `.claude/agents/knowledge/critical-ui-scope.md`
- Test data: `test-data/users/agent-user-pool.csv`, `test-data/aliases.json`
- Memory cross-references: `feedback_use_canonical_graphql_runner`, `feedback_flexible_test_cases`, `feedback_env_resilience`, `reference_impersonation_permission_naming`, `reference_admin_backoffice_only`, `project_promotion_engine`, `feedback_apollo_cart_shipment_stale_data`
