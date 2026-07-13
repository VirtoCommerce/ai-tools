# Sprint 26-13 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-07-13
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-06-29 – 2026-07-10

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-13 |
| Date range | 2026-06-29 – 2026-07-10 |
| Theme | Multistep-checkout "Place Order" unblock + payment-form ordering & Skyflow validation; B2B **organization-scoped roles with user-level override** and a **multi-org privilege-escalation** fix (security); configurable-products **in-cart** persistence + edit-reprice crash fix + E2E/xAPI; Loyalty mixed-cart create-order, Product Points & in-cart balance validation; catalog **sorting/variations/i18n-search** fixes; Page Builder Asset Library + preview/breadcrumb i18n fixes; UI-kit VcSlider + **Tailwind→BEM** migration + Red Theme 4 |
| Total issues in sprint | 127 (42 Story + 26 Bug + 59 Task/TechDebt) |
| Test-relevant delivered tickets | 45 (18 Bugs + 19 Stories + 8 test-impact Tasks/TechDebt), status ∈ {Done, Tested, Testing, Ready for test, Wait hotfixes} |
| Merged frontend PRs (in window) | 23 in vc-frontend (17 VCST-linked; incl. #2353, #2336, #2349, #2335, #2354, #2350, #2360, #2366, #2371, #2374, #2316) |
| Merged module PRs (in window) | 7 in vc-platform (#3064, #3065, #3067, #3068, #3069, #3074, #3075); module-repo fixes ship via their own `vc-module-*` repos (referenced by ticket) |

> **Note on workflow statuses:** the VCST board has no single green "Done" category. Completed-and-shippable work sits in **Done / Tested / Testing / Ready for test / Wait hotfixes**. Items still in *To do / In progress / In review / Draft / REFINEMENT / Reopen / On hold / Cancelled* are treated as **not deliverable** and excluded (Section 2.4).

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Status | Domain |
|-----|---------|--------|--------|
| VCST-5239 | Organization-scoped roles with user-level override (PR #2354) | Done | B2B / Auth (roles) |
| VCST-5104 | [Loyalty][Mixed Cart][E2E] Create Order (PR #2335) | Done | Loyalty / Checkout |
| VCST-5135 | [Loyalty] Product Points Program | Done | Loyalty |
| VCST-5103 | [Loyalty][Mixed Cart] Loyalty Points Balance Validator | Done | Loyalty |
| VCST-5365 | [Loyalty][Mixed Cart] Show loyalty validation text in cart before Place Order | Testing | Loyalty |
| VCST-5431 | Persist `ConfigurationItem.SectionName` in Cart and Order | Done | Cart / Configurable Products |
| VCST-5079 | [E2E][UI] Configurable Products storefront | Tested | Configurable Products |
| VCST-5077 | [E2E][GraphQL] Configurable Products xAPI (incl. cart merge) | Testing | Configurable Products / GraphQL |
| VCST-5076 | [E2E][Dataset] Configurable products + sections + options seed data | Tested | Configurable Products / Data |
| VCST-5385 | Numerical sorting for facet terms (asc/desc) | Done | Search / Facets |
| VCST-5345 | Per-variation associations on nested product load (REST) + xAPI `VariationType` | Done | Catalog / GraphQL |
| VCST-5177 | [E2E] Configurable featured sorting for category browsing + search (PR #2350) | Done | Catalog / Search |
| VCST-4932 | [E2E] Page Builder — Asset Library | Done | Page Builder / CMS |
| VCST-5140 | Update order table mobile view (PR #2316) | Done | Orders / UI (mobile) |
| VCST-4464 | onX Fulfilment Adapter — Create Order Flow | Tested | Orders / Integration |
| VCST-5126 | Universal Commerce Protocol (UCP) — MVP | Done | Platform / UCP |
| VCST-4646 | [BOPIS][Map] Pickup location list with pagination | Done | BOPIS |
| VCST-5232 | Dashboard cards only display the first three values (PR #3064) | Done | Admin / Dashboard |
| VCST-5222 | [UI-kit] Storybook Docs theme settings (PR #2330) | Done | UI Kit / Storybook |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Status | Domain |
|-----|----------|---------|--------|--------|
| VCST-5369 | High | "Place Order" blocked/disabled on Review step in **Multistep checkout** (`allowCartPayment=true` — AN / CyberSource / Skyflow) — PR #2353 | Done | Checkout |
| VCST-5401 | High | [Multi-org] Global role assigned after switching organization (**privilege escalation**) | Done | B2B / Security |
| VCST-5392 | Medium | Large file upload (~101 MB) hangs at 100%, never-ending POST | Done | Platform / Assets |
| VCST-5391 | Medium | [Cart] Editing configurable product from cart → error resolving `extendedPrice` (`changeCartConfiguredItem`) | Tested | Cart / Configurable Products / GraphQL |
| VCST-5375 | Medium | `RoleSearchService` empty-keyword condition (PR vc-platform #3065) | Done | Platform / Role search |
| VCST-5361 | Medium | `ValueObject` reflection on equality/hashing hot path → CPU saturation at scale (PR #3069) | Done | Platform / Performance |
| VCST-5329 | Low | Skyflow payment fails to init — "Failed to get bearer token" | Done | Payment |
| VCST-5324 | Medium | Multilanguage ShortText property filter returns 0 results (non-default langs) — PR #2371 | Wait hotfixes | Catalog / Search (i18n) |
| VCST-5289 | Medium | `categories` x-api query ignores `sort` for nested `childCategories` | Done | Catalog / GraphQL |
| VCST-5274 | Medium | Storefront breadcrumb shows old page name after Page Builder rename (PR #2360) | Done | Page Builder / Storefront |
| VCST-5269 | Medium | Payment form displayed only after selecting delivery method / shipping address (PR #2336) | Done | Checkout / Payment |
| VCST-5227 | Medium | [task-management] Tasks UI — Due-date filter not applied (`startDueDate`/`endDueDate`) | Done | Admin / Task-management |
| VCST-5223 | Medium | [vc-news] Bulk-delete confirmation shows page count (20) instead of full cross-page selection | Done | Admin / News |
| VCST-5219 | Medium | [Page Builder] Designer preview ignores page language; lang switch → 404 (PR #2374) | Tested | Page Builder / CMS (i18n) |
| VCST-5413 | Medium | VcSlider price-filter handles render oversized (nouislider CSS overrides `--handle-size`) — PR #2366 | Done | UI Kit / Search filter |
| VCST-5429 | Low | [Page Builder] Published page intermittently renders empty (transient empty body) | Tested | Page Builder / CMS |
| VCST-5430 | Low | [Page Builder] Designer preview-as-user selector breaks toolbar layout on long emails | Wait hotfixes | Page Builder / Admin (layout) |
| VCST-5202 | Low | Skyflow card form: no per-brand CVV length validation (3-digit CVV on Amex) — PR #2349 | Done | Payment |

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Summary | Status | Domain |
|-----|---------|--------|--------|
| VCST-4923 | [Security] Sensitive user-data disclosure via replayed admin session token (PR vc-platform #3068) | Done | Platform / Auth (security) |
| VCST-5071 | [BEM] Replace Tailwind with BEM [5] — storefront CSS class rename → selector/data-test-id churn | Ready for test | UI Kit / Structural |
| VCST-5070 | [BEM] Replace Tailwind with BEM [4] — same class migration, selector regression surface | Ready for test | UI Kit / Structural |
| VCST-4226 | Red Theme 4 Release — non-Coffee theme visual/layout changes | Ready for test | Theme / Whitelabeling |
| VCST-5434 | [UCP] Rename namespace `Virtocommerce`→`VirtoCommerce` — backend rename, potential contract/API-surface impact | Done | Platform / UCP |
| VCST-4529 | [UI E2E] Pickup location — List > Filters and keyword Search (supports VCST-4646) | Tested | BOPIS / Tests |
| VCST-5163 | Stable 15 Release — deployment/bundle gate for the sprint | Testing | Release |
| VCST-5382 | Update modules on vcst environments-13 — deployed module-version baseline for all sprint regression | Done | Env baseline |

### 2.4 Out of Scope

Excluded from QA verification this sprint — either **not deliverable** (status To do / In progress / In review / Draft / REFINEMENT / Reopen / On hold / Cancelled) or **non-product** (tooling / CI / infra / AI-demo / load-test / QA-process):

- **Not yet delivered (feature/bug work):** VCST-5441 (dictionary-setting clear-to-empty, In progress — relates VCST-5239), VCST-5438/5435/5427/5416 (In review), VCST-5417/5409/5378/5346/5319/5318/5308/5304/5281/5245/5089/4984/4907/4400/5370 (In progress), VCST-5310/5309/5097/4585/5283/5231/4717 (To do), VCST-5277/5272/5198 (Draft), VCST-5303/5293/4368/3912 (In review), VCST-5344/5338 (On hold)
- **Tooling / CI / infra:** VCST-5451/5444/5414/5412/5405/5373/5206/5050/4863/5386/5372/5381/5440/5439/5305/5292/5407/5379/5256 (start-local, MF pilot, security-CI, deps bumps, observability, docs)
- **QA-process / load / release / test-authoring:** VCST-5384/5380/5359/5353/5352/5350/5349 (Page Builder E2E auto-tests), VCST-4978/4966/5169 (perf/load), VCST-5163 (Stable 15 — *release gate, see References*)
- **Data / sample-data:** VCST-5220, VCST-3286
- **AI-Powered-Demo / Agentic-QA:** VCST-5226, VCST-5225
- **Cancelled:** VCST-4719, VCST-5442, VCST-5437, VCST-5436, VCST-5426, VCST-5383, VCST-5260, VCST-5259
- **MCP-on-.NET tooling (story):** VCST-5339 (Ready for test — dev tooling, no storefront/admin surface)

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical. Grouped by primary domain.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Checkout / Payment (VCST-5369, 5269, 5202, 5329) | 4 | 5 | 20 | Critical | Multistep Place-Order was **blocked** (revenue-blocking) and the payment-form-render ordering both changed on the P0 checkout path; reproduces across all `allowCartPayment=true` processors (AN / CyberSource / Skyflow); plus Skyflow init + CVV-validation fixes on the same billing surface — several concurrent touches, easy to regress |
| B2B Org Roles & Security (VCST-5239, 5401, 4923) | 4 | 5 | 20 | Critical | Brand-new **organization-scoped roles + user-level override** access-control model shipped alongside a just-fixed **privilege-escalation** bug (global role retained after org switch) and a replayed-session-token disclosure fix — access-control/security regressions are high-impact and hard to spot |
| Cart — Configurable Products (VCST-5431, 5391, 5079, 5077, 5076) | 4 | 4 | 16 | Critical | Configurable-product **in-cart** persistence (`SectionName`) + an edit-from-cart **crash** fix (`changeCartConfiguredItem` → `extendedPrice`) + storefront E2E + xAPI cart-merge, all landing on the cart/checkout surface simultaneously; a cart-mutation crash directly gates purchase |
| Loyalty Mixed Cart & Product Points (VCST-5104, 5135, 5103, 5365) | 4 | 3 | 12 | High | Four concurrent loyalty deliverables (mixed-cart create-order, Product Points program, balance validator, in-cart validation text) on the mixed-currency cart/order path; promotion-scope isolation + per-currency totals + balance-boundary risk |
| Catalog — Sorting / Variations / i18n Search (VCST-5385, 5345, 5177, 5289, 5324) | 4 | 3 | 12 | High | Five concurrent catalog/search changes: facet numeric sort, per-variation associations, configurable featured sort, nested-`childCategories` sort, and a multilingual ShortText filter returning **0 results** — search relevance & catalog integrity, broad browse surface |
| Page Builder / CMS (VCST-4932, 5429, 5274, 5219, 5430) | 4 | 3 | 12 | High | Five concurrent Page Builder / CMS changes incl. a **published-page-renders-empty** intermittent (customer-facing), designer-preview i18n/404, stale breadcrumb after rename, Asset Library, and a toolbar-layout fix — content-delivery correctness + designer operability |
| UI Kit / Theme / BEM (VCST-5413, 5071, 5070, 4226, 5222) | 4 | 3 | 12 | High | **Tailwind→BEM** class migration (broad selector/data-test-id + visual-regression surface across every storefront page) + VcSlider handle-size fix + Red Theme 4 release + Storybook docs theme — high reuse blast radius |
| Orders — Mobile / onX / UCP (VCST-5140, 4464, 5126, 5434) | 3 | 3 | 9 | Medium | Mobile order-card redesign + onX fulfilment create-order integration + UCP MVP with a namespace rename (contract-surface risk); order-integration timing/data-integrity, limited storefront surface |
| Platform — Perf / Assets / Role search (VCST-5361, 5392, 5375) | 3 | 3 | 9 | Medium | `ValueObject` reflection hot-path CPU fix (scale/perf), large-file-upload hang (assets), role-search empty-keyword — platform stability & operability, low UI surface |
| Admin SPA Modules (VCST-5232, 5227, 5223) | 3 | 2 | 6 | Medium | Dashboard-card truncation, task-management due-date filter, news bulk-delete count (data-safety on a destructive action) — independent low-blast-radius admin fixes |
| BOPIS — Pickup Pagination (VCST-4646, 4529) | 2 | 3 | 6 | Medium | Pickup-location list pagination + filters/keyword search; existing mouse path works, regression scoped to the map/list panel |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Checkout / Payment | Yes | — | — | Yes | — | — |
| B2B Org Roles & Security | Yes | Yes | Yes | Yes | — | — |
| Cart — Configurable Products | Yes | Yes | — | Yes | — | — |
| Loyalty Mixed Cart & Product Points | Yes | — | — | Yes | — | — |
| Catalog — Sorting / Variations / i18n | Yes | Yes | Yes | Yes | — | — |
| Page Builder / CMS | Yes | Yes | Yes | — | — | — |
| UI Kit / Theme / BEM | Yes | — | — | — | Yes | — |
| Orders — Mobile / onX / UCP | Yes | Yes | Yes | Yes | — | — |
| Platform — Perf / Assets / Role search | — | Yes | Yes | — | — | — |
| Admin SPA Modules | — | Yes | Yes | — | — | — |
| BOPIS — Pickup Pagination | Yes | — | — | Yes | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- **Checkout / Payment (VCST-5369, 5269, 5202, 5329):** with `checkout_multistep_enabled=true`, drive **Proceed → Shipping → Billing → Review → Place Order** to a paid order for each `allowCartPayment=true` processor (Authorize.Net, CyberSource, Skyflow); confirm the billing/payment form renders on the Billing step (not gated behind shipping selection), Place-Order is enabled on Review, and the order is created. Cross-check the single-step flow; verify Skyflow init error handling and Amex 4-digit CVV enforcement.
- **B2B Org Roles & Security (VCST-5239, 5401, 4923):** per-org role assignment with a **user-level override** (override wins over inherited role); **privilege-escalation** guard — switching organization must NOT retain a global role from a prior org context (`pageContext.user.permissions` scoped to the active org); replayed/stale admin session token is rejected. Storefront + Admin + REST + xAPI.
- **Cart — Configurable Products (VCST-5431, 5391, 5079, 5077, 5076):** editing a configurable line from the cart (`changeCartConfiguredItem`) reprices without the `extendedPrice` error; `ConfigurationItem.SectionName` persists across cart→order; full PDP-configurator→cart→checkout E2E per section type; guest→auth cart merge preserves configuration state.

**High domains (run in parallel with critical):**
- Loyalty mixed-cart: cash+PTS create-order with correct `orderTotals[]` split; Product Points earn/single-winner; balance validator at boundaries; in-cart insufficient-balance text before Place Order.
- Catalog: facet numeric asc/desc sort, per-variation associations (REST vs xAPI parity), featured-first in browse+search, nested-`childCategories` sort at depth, non-default-language ShortText filter returns matches.
- Page Builder / CMS: published-page repeat-load stability (no empty body), designer preview language + no 404, breadcrumb reflects rename, Asset Library upload/browse/select.
- UI-kit / theme: VcSlider handle size across breakpoints; **post-BEM-migration** visual + selector regression sweep across the UI-kit consumer surface (048b + smoke); Red Theme 4 preset sweep; re-capture Storybook baselines.

**Medium domains (after critical/high pass):** orders mobile cards + onX create-order + UCP smoke, platform perf/assets/role-search, admin module fixes (dashboard cards, task due-date filter, news delete count), BOPIS pickup pagination + filters.

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| Multistep Place Order (VCST-5369) | Decision Table | processor (AN/CyberSource/Skyflow) × multistep flag × step reached (Billing/Review) |
| Payment form ordering (VCST-5269) | State Transition | shipping selected → billing/payment form visible |
| Skyflow CVV (VCST-5202) | EP + BVA | CVV length (3/4) × card brand (Amex vs other) |
| Org roles + override (VCST-5239) | Decision Table | role × organization × user-level override precedence |
| Privilege escalation (VCST-5401) | Decision Table + Error Guessing | org-switch → permission set strictly re-scoped |
| Replayed token (VCST-4923) | Error Guessing | stale/replayed session token → rejected, no data disclosure |
| Configurable cart edit (VCST-5391) | Error Guessing | edit config line → no missing-`extendedPrice` error, reprice returned |
| Config `SectionName` persist (VCST-5431) | EP | field survives cart→order boundary |
| Loyalty mixed cart (VCST-5104/5135/5103/5365) | State Transition + BVA | points-only/mixed/cash × outcome; balance at boundary; UI text timing |
| Facet numeric sort (VCST-5385) | BVA | asc / desc / invalid / omitted on numeric-valued terms |
| Per-variation associations (VCST-5345) | EP | variation with/without associations; REST vs xAPI parity |
| Featured sorting (VCST-5177) | Decision Table | category browse vs search × featured-first ordering |
| Nested-category sort (VCST-5289) | BVA | sort applied at every `childCategories` depth |
| i18n property filter (VCST-5324) | EP | default vs non-default language × ShortText filter |
| Published page empty (VCST-5429) | Error Guessing | repeat-load race/cache repro |
| Designer preview i18n (VCST-5219) | EP | page language × preview render / no 404 |
| VcSlider handle (VCST-5413) | Visual / geometry | handle size across breakpoints (`getBoundingClientRect`) |
| BEM migration (VCST-5071/5070) | Error Guessing | selector/data-test-id churn regression sweep |
| Red Theme 4 (VCST-4226) | Visual regression | theme-preset sweep across storefront pages |
| onX create-order (VCST-4464) | State Transition | create-order → fulfillment; adapter-unavailable error mapping |
| Role search (VCST-5375) | BVA | empty / null / whitespace keyword |
| Large file upload (VCST-5392) | BVA | file-size boundary (~100 MB) |
| News bulk delete (VCST-5223) | BVA | cross-page count vs page count; 2→3 off-by-one |
| Task due-date filter (VCST-5227) | Decision Table | `startDueDate` × `endDueDate` window |
| BOPIS pagination (VCST-4646/4529) | BVA + Error Guessing | page boundaries; filter × keyword combos |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always-on (+ VCST-5071/5070 BEM selector sanity, VCST-4226 theme, VCST-5382 module baseline) | P0 |
| 078 | Backend Smoke Tests | Cross-cutting | Always-on (+ VCST-5361 perf hot-path, VCST-5382) | P0 |
| 011 | Checkout Flow | Checkout | VCST-5369, VCST-5269 | P0 |
| 012 | Checkout Guest | Checkout | VCST-5369 | P1 |
| 013 | Checkout B2B | Checkout | VCST-5369, VCST-5239 | P1 |
| 081 | Select Shipping Address Popup | Checkout | VCST-5269 | P1 |
| 039 | Payment CyberSource | Payment | VCST-5369 | P0 |
| 040a | Payment — Skyflow | Payment | VCST-5369, VCST-5202, VCST-5329 | P0 |
| 040b | Payment — Authorize.Net | Payment | VCST-5369 | P0 |
| 041 | Payment Cross-Cutting | Payment | VCST-5369 | P0 |
| 018 | Orders Admin Payments | Orders | VCST-5369 (paid-order confirmation) | P2 |
| 028 | Cart Core | Cart | VCST-5391, VCST-5431, VCST-5365 | P0 |
| 029 | Cart Validation & Persistence | Cart | VCST-5431 | P0 |
| 030 | Cart Merge | Cart | VCST-5077 | P1 |
| 072 | Configurable Products UI | Configurable Products | VCST-5079, VCST-5391 | P1 |
| 072b | Configurable Products E2E | Configurable Products | VCST-5079, VCST-5431 | P1 |
| 072c | Configurable Products Cross-Cutting | Configurable Products | VCST-5079 | P2 |
| 072d | Configurable Products File & Text Sections | Configurable Products | VCST-5079 | P2 |
| 052 | Configurable Products Admin | Configurable Products | VCST-5076 | P2 |
| 050i | GraphQL Configurable Products | xCatalog | VCST-5077, VCST-5431, VCST-5391 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | xCart | VCST-5391 | P1 |
| 075 | Loyalty | Loyalty | VCST-5135 | P1 |
| 075b | Loyalty Mixed Cart Order | Loyalty | VCST-5104 | P1 |
| 075c | Loyalty Product Points Earning | Loyalty | VCST-5135, VCST-5103 | P1 |
| 083 | Loyalty Catalog Browsing | Loyalty | VCST-5135 | P1 |
| 083b | Loyalty Mixed Cart Order | Loyalty | VCST-5104, VCST-5103, VCST-5365 | P1 |
| 050c | GraphQL xOrder | xOrder | VCST-5104, VCST-4464 | P2 |
| 006 | B2B Organization | B2B | VCST-5239 | P1 |
| 008 | B2B Members | B2B | VCST-5239 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-5239 | P1 |
| 027b | Customer Org Memberships (per-org roles & override) | Customer | VCST-5239, VCST-5401 (exact match) | P1 |
| 031 | Auth Login & Register | Auth | VCST-5401 | P1 |
| 032 | Auth Session & RBAC | Auth | VCST-5401, VCST-5239 | P1 |
| 033 | Auth Company & Account Menu | Auth | VCST-5239 | P1 |
| 082 | Auth Company Menu & RBAC | Auth | VCST-4923 (session token) | P1 |
| 050d | GraphQL xProfile | xProfile | VCST-5239 | P2 |
| 049 | Platform API | Platform | VCST-5401, VCST-5375, VCST-5345, VCST-4923 | P0 |
| 044 | Security Tests | Cross-cutting | VCST-5401, VCST-4923 | P1 |
| 001 | Catalog Navigation | Catalog | VCST-5177, VCST-5274 | P2 |
| 002 | Product Detail | Catalog | VCST-5345 | P2 |
| 003 | Catalog Filters | Catalog | VCST-5385, VCST-5324, VCST-5177, VCST-5413 | P1 |
| 004 | Search Core | Search | VCST-5177 | P2 |
| 005 | Search Filters & Advanced | Search | VCST-5385 | P2 |
| 051 | Catalog Admin Products | Catalog | VCST-5345 | P1 |
| 053 | Catalog Admin Categories | Catalog | VCST-5177, VCST-5289 | P1 |
| 050a | GraphQL xCatalog | xCatalog | VCST-5289, VCST-5345, VCST-5177, VCST-5385, VCST-5324 | P1 |
| 046 | Internationalization | Cross-cutting | VCST-5324, VCST-5219 | P2 |
| 059 | CMS Page Management | CMS | VCST-5219 | P2 |
| 060 | CMS Design & Content | CMS | VCST-4932, VCST-5429, VCST-5274, VCST-5219, VCST-5430 | P2 |
| 062 | Assets | Assets | VCST-4932, VCST-5392 | P2 |
| 048b | Layout Stability | UI Kit / Cross-cutting | VCST-5413, VCST-5071, VCST-5070, VCST-4226, VCST-5140 | P1 |
| 045 | Accessibility Tests | UI Kit | VCST-4226, VCST-5140 | P2 |
| 070 | White Labeling Storefront | Whitelabeling | VCST-4226 | P2 |
| 071 | White Labeling Branding | Whitelabeling | VCST-4226 | P2 |
| 014 | Orders Frontend | Orders | VCST-5140, VCST-4464 | P2 |
| 017 | Orders Admin Management | Orders | VCST-4464, VCST-5126, VCST-5434 | P2 |
| 020 | Platform Users Roles & Settings | Platform | VCST-5375 | P2 |
| 063 | Core Settings | Platform | VCST-5232 | P2 |
| 085 | Task Management | Task Management | VCST-5227 | P2 |
| 084 | News Articles | News | VCST-5223 | P2 |
| 036 | BOPIS Store Selector | BOPIS | VCST-4646, VCST-4529 | P2 |
| 037 | BOPIS Cart | BOPIS | VCST-4646 | P2 |
| 038 | BOPIS Checkout | BOPIS | VCST-4646 | P2 |
| 050k | GraphQL xPickup | xPickup | VCST-4646 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

> BL-SRCH-006 (facet term sort direction), BL-CAT-009 (featured/priority sort ordering), and BL-SRCH-007 (multilingual property filter) are **candidate invariants** implied by VCST-5385/5177/5324 — promote via a follow-up `/qa-test-lifecycle --update-bl` run before citing as canonical. BL-B2B-007..011 are already canonical (promoted since Sprint 26-12).

| Gap ID | Ticket(s) | Description (BL-* ref) | Target Suite(s) | Owner |
|--------|-----------|------------------------|-----------------|-------|
| GAP-01 | VCST-5369, VCST-5269 | Multistep checkout: billing/payment form renders on the Billing step (not gated behind shipping selection) and Place-Order enables correctly on Review for `allowCartPayment=true` processors (BL-CROSS-006 flag-driven behavior; BL-CHK-002 button-state extension) | 011 (extend), 013 (extend), 039/040a/040b (cross-ref) | qa-frontend-expert |
| GAP-02 | VCST-5369 | `checkout_multistep_enabled` toggled mid-session → Place-Order enable/disable state remains correct across step re-entry/back-nav (BL-CROSS-006) | 011 (extend) | qa-frontend-expert |
| GAP-03 | VCST-5202 | Skyflow CVV validation is brand-aware: Amex requires 4 digits, other brands require 3; a 3-digit CVV on Amex is rejected (payment-form validation) | 040a (extend) | qa-frontend-expert |
| GAP-04 | VCST-5329 | Skyflow payment init failure ("Failed to get bearer token") surfaces a recoverable error state, not a silent/blank payment form | 040a (extend) | qa-frontend-expert |
| GAP-05 | VCST-5104 | Mixed-cart loyalty order creation: cash+PTS lines create a valid order with correct `orderTotals[]` split (BL-LOY-007, BL-LOY-010, BL-LOY-013) | 075b (extend), 083b (extend), 050c (extend) | qa-backend-expert + qa-frontend-expert |
| GAP-06 | VCST-5135 | Product Points Program: earn factor/window per SKU, single-winner priority when multiple programs apply (BL-LOY-009) | 075c (extend), 083 (extend) | qa-backend-expert |
| GAP-07 | VCST-5103 | Loyalty balance validator: order blocked with typed `LOYALTY_INSUFFICIENT_BALANCE` at balance boundaries (=, <, >, 0) (BL-LOY-008) | 075c (extend), 083b (extend) | qa-backend-expert |
| GAP-08 | VCST-5365 | Cart shows loyalty insufficient-balance validation text BEFORE Place-Order is clicked, not only as a server rejection at submit (BL-LOY-008 UI-surfacing extension) | 028 (extend), 083b (extend) | qa-frontend-expert |
| GAP-09 | VCST-5431 | `ConfigurationItem.SectionName` persists identically across cart → order boundary (survives `SaveAsync`/order creation) (BL-CART-010 adjacent) | 050i (extend), 072b (extend) | qa-backend-expert |
| GAP-10 | VCST-5391 | Editing a configurable product from the cart (`changeCartConfiguredItem`) no longer errors resolving `extendedPrice`; repriced total returned (BL-CART-010) | 050i (extend), 072 (extend) | qa-backend-expert |
| GAP-11 | VCST-5079 | Configurable Products storefront E2E: PDP configurator → cart → checkout for each section type (Product/Text/File/Variation) (BL-CART-014) | 072 (extend), 072b (extend) | qa-frontend-expert |
| GAP-12 | VCST-5077 | Configurable Products xAPI: cart merge (guest→auth) preserves configuration-item selection state on merged lines (BL-CART-008 × BL-CART-012) | 050i (extend), 030 (extend) | qa-backend-expert |
| GAP-13 | VCST-5239 | Org-scoped role + user-level override: override wins over org-inherited role for the same permission; JWT permissions reflect the override post org-switch (BL-B2B-007, BL-B2B-008) | 027b (exact match), 006 (extend), 008 (extend) | qa-backend-expert + qa-frontend-expert |
| GAP-14 | VCST-5401 | Privilege escalation regression: switching organization must NOT retain/assign a global role from a prior org context — `pageContext.user.permissions` scoped strictly to the active org (BL-B2B-007) | 027b (exact match), 032 (extend), 049 (extend) | qa-backend-expert |
| GAP-15 | VCST-4923 | Replayed admin session token is rejected — no sensitive user data disclosure via a stale/replayed token (BL-AUTH-003 adjacent, security boundary) | 044 (extend), 082 (extend), 049 (extend) | qa-backend-expert |
| GAP-16 | VCST-5385 | Facet term sort (`asc`/`desc`) on numeric-valued terms orders correctly, not lexicographically (BL-SRCH-006 candidate) | 003 (extend), 050a (extend), 005 (extend) | qa-backend-expert + qa-frontend-expert |
| GAP-17 | VCST-5345 | `product.variations[].associations[]` parity between REST nested load and xAPI `VariationType` (BL-CAT-002) | 050a (extend), 049 (extend), 051 (extend) | qa-backend-expert |
| GAP-18 | VCST-5177 | Featured products sort first in category browse AND search results, consistently (BL-CAT-009 candidate) | 001 (extend), 003 (extend), 004 (extend), 050a (extend), 053 (extend) | qa-frontend-expert + qa-backend-expert |
| GAP-19 | VCST-5289 | Regression re-verification: `categories` xAPI `childCategories(sort:)` applies at every nesting depth post-deploy (BL-SRCH-003) | 050a (extend) | qa-backend-expert |
| GAP-20 | VCST-5324 | ShortText property filter returns matching results in non-default languages (not 0 results) (BL-SRCH-007 candidate) | 003 (extend), 050a (extend), 046 (extend) | qa-backend-expert |
| GAP-21 | VCST-4932 | Asset Library E2E: upload/browse/select asset across folder + permission scope | 062 (extend) | qa-backend-expert |
| GAP-22 | VCST-5429 | Published CMS page intermittently renders empty — repeat-load stability check for race/cache condition | 060 (extend) | qa-backend-expert |
| GAP-23 | VCST-5274 | Storefront breadcrumb reflects a category rename without stale-cache lag beyond the documented window (BL-CAT-003 pattern, candidate application to CMS/category breadcrumb cache) | 001 (extend), 060 (extend) | qa-frontend-expert |
| GAP-24 | VCST-5219 | Designer preview renders the page in the selected language; language switch does not 404 | 059 (extend), 060 (extend) | qa-backend-expert |
| GAP-25 | VCST-5430 | Preview-as-user toolbar does not overlap/clip for long email addresses (BL-UI-004 content boundary) | 060 (extend) + ui-ux-expert visual | qa-backend-expert + ui-ux-expert |
| GAP-26 | VCST-5413 | VcSlider price-filter handle renders at correct size (no oversized nouislider CSS) across breakpoints (BL-UI-001, BL-UI-003) | 048b (extend), 003 (extend) | ui-ux-expert |
| GAP-27 | VCST-5071, VCST-5070 | BEM Tailwind→BEM class migration: no visual regression / selector breakage across the UI-kit consumer surface (regression sweep, no functional BL) | 048b (extend), 042 (extend) | ui-ux-expert |
| GAP-28 | VCST-4226 | Red Theme 4 release: theme-preset sweep across storefront pages, no layout/token regressions | 042 (extend), 048b (extend), 070 (extend), 071 (extend) | ui-ux-expert |
| GAP-29 | VCST-5140 | Mobile order-card redesign renders correctly across viewport sizes without truncation/overlap | 014 (extend), 048b (extend) | qa-frontend-expert |
| GAP-30 | VCST-4464 | onX Fulfilment Adapter create-order: request sent, order state transitions correctly, adapter-unavailable error mapped (BL-ORD-001) | 017 (extend), 014 (extend) | qa-backend-expert |
| GAP-31 | VCST-5126, VCST-5434 | UCP MVP + namespace rename: existing order-integration paths unaffected by the rename; new UCP surface smoke-covered (no suite exists yet) | 017 (extend) | qa-backend-expert |
| GAP-32 | VCST-5375 | `roles?keyword=` (empty/whitespace) returns full role list, not empty (BL-AUTH-005) | 020 (extend), 049 (extend) | qa-backend-expert |
| GAP-33 | VCST-5361 | `ValueObject` reflection hot-path: CPU/latency stays within threshold under repeated equality checks (non-functional, no direct BL) | 078 (extend) | qa-backend-expert |
| GAP-34 | VCST-5392 | Large file upload (~100MB boundary) completes or fails gracefully, does not hang the request (BL-CROSS-011 adjacent) | 062 (extend) | qa-backend-expert |
| GAP-35 | VCST-5232 | Admin dashboard cards display all configured values, not truncated to first 3 (BL-UI-004 content boundary) | 063 (extend) | qa-backend-expert |
| GAP-36 | VCST-5227 | Task due-date filter end-to-end via corrected `startDueDate`/`endDueDate` params → grid filtered correctly | 085 (extend) | qa-backend-expert |
| GAP-37 | VCST-5223 | News bulk-delete confirmation count == full cross-page selection, not current-page count (2→3 off-by-one) | 084 (extend) | qa-backend-expert |
| GAP-38 | VCST-4646, VCST-4529 | BOPIS pickup-location list: pagination (page 2+ loads, correct counts) and filter/keyword search combos (BL-CROSS-009) | 036 (extend), 037 (extend) | qa-frontend-expert |

**Tickets with no existing suite (extend nearest, don't create single-case suites):** VCST-5126/VCST-5434 (UCP) → 017 (propose dedicated `019b-orders-ucp.csv` only if the integration expands beyond onX); VCST-5361 → 078/047; VCST-5392 → 062; VCST-5430 → 060.

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|---------|-----------|----------------|-------------|-----------|
| VCST-5369 | Storefront (Checkout) | P0 Bug fix (verify) | 6 | 011 (4), 013 (1), 039/040a/040b (cross-ref 1) | Decision Table (processor × multistep flag × step) |
| VCST-5269 | Storefront (Checkout) | P1 Bug fix | 4 | 011 (3), 039/040a/040b (cross-ref 1) | State Transition (shipping selected → billing form visible) |
| VCST-5202 | Storefront (Payment) | P2 Bug fix | 3 | 040a (3) | EP + BVA (CVV length × card brand) |
| VCST-5329 | Storefront (Payment) | P2 Bug fix | 2 | 040a (2) | Error Guessing (init failure recovery) |
| VCST-5104 | Storefront + GraphQL (xOrder/xCart) | P0 Feature | 9 | 075b (4), 083b (3), 050c (2) | State Transition + Decision Table (points-only/mixed/cash × outcome) |
| VCST-5135 | GraphQL (xCart) + Admin | P1 Feature | 6 | 075c (3), 083 (3) | Pairwise (program × SKU × factor × window) |
| VCST-5103 | GraphQL (xCart) + Storefront | P1 Feature | 5 | 075c (2), 083b (3) | BVA (balance = / < / 0 / > cost) |
| VCST-5365 | Storefront | P1 Story (verify) | 3 | 028 (2), 083b (1) | State Transition (validation text at insufficient-balance state) |
| VCST-5431 | GraphQL (xAPI) + E2E | P1 Feature | 4 | 050i (3), 072b (1) | EP (field persistence across cart/order) |
| VCST-5391 | GraphQL (xAPI) | P1 Bug fix (verify) | 3 | 050i (2), 072 (1) | Error Guessing (missing pricing field on edit) |
| VCST-5079 | Storefront + E2E | P1 Story (verify) | 6 | 072 (3), 072b (3) | Pairwise (section type × option count × required) |
| VCST-5077 | GraphQL (xCart) | P1 Story | 4 | 050i (2), 030 (2) | Error Guessing (cart merge with configured lines) |
| VCST-5239 | REST + GraphQL (xProfile) + Storefront | P0 Feature | 10 | 027b (4), 006 (2), 008 (2), 032 (2) | Decision Table (role × org × user-level override) |
| VCST-5401 | REST + GraphQL + Storefront | P0 Bug fix (security, verify) | 6 | 027b (2), 032 (2), 049 (2) | Decision Table + Error Guessing (org-switch privilege path) |
| VCST-4923 | REST + Storefront | P0 TechDebt (security, verify) | 4 | 044 (2), 082 (1), 049 (1) | Error Guessing (replayed token) |
| VCST-5385 | Storefront + GraphQL | P1 Story | 5 | 003 (2), 050a (2), 005 (1) | BVA (asc/desc/invalid/omitted on numeric term) |
| VCST-5345 | GraphQL + REST | P1 Story | 5 | 050a (3), 049 (1), 051 (1) | EP (variation with/without associations; REST vs xAPI parity) |
| VCST-5177 | Storefront + GraphQL + Admin | P1 Story | 6 | 001 (1), 003 (1), 004 (1), 050a (2), 053 (1) | Decision Table (category vs search × featured-first) |
| VCST-5289 | GraphQL | P1 Bug fix (regression verify) | 3 | 050a (3) | BVA (nested depth × sort order) |
| VCST-5324 | Storefront + GraphQL | P1 Bug fix | 4 | 003 (2), 050a (2) | EP (default vs non-default language × filter) |
| VCST-4932 | Admin | P2 Story | 4 | 062 (4) | Classification Tree (asset type × folder × permission) |
| VCST-5429 | Admin | P2 Bug fix | 3 | 060 (3) | Error Guessing (race/cache repro) |
| VCST-5274 | Storefront + Admin | P2 Bug fix | 3 | 001 (2), 060 (1) | Error Guessing (rename → breadcrumb cache) |
| VCST-5219 | Admin | P2 Bug fix | 3 | 059 (2), 060 (1) | EP (page language × preview) |
| VCST-5430 | Admin | P2 Bug fix (Low) | 2 | 060 (2) | Boundary / geometry (long email overflow) |
| VCST-5413 | UI Kit / Storefront | P2 Bug fix | 3 | 048b (2), 003 (1) | Visual / geometry (handle size across breakpoints) |
| VCST-5071 + VCST-5070 | UI Kit / Storefront | P2 TechDebt | 4 | 048b (3), 042 (1) | Error Guessing (selector churn regression sweep) |
| VCST-4226 | UI Kit / Storefront | P2 Release | 5 | 042 (2), 048b (2), 070/071 (1) | Visual regression (theme-preset sweep) |
| VCST-5140 | Storefront (Orders) | P2 Story | 4 | 014 (3), 048b (1) | Classification Tree (viewport × order state) |
| VCST-4464 | REST + Admin | P1 Story | 5 | 017 (3), 014 (2) | State Transition (create-order → fulfillment); Error Guessing (adapter unavailable) |
| VCST-5126 + VCST-5434 | REST + Admin | P2 Feature (smoke) | 3 | 017 (3) | Error Guessing (existing paths unaffected by rename) |
| VCST-5375 | REST + Admin | P2 Bug fix (hotfix ready) | 3 | 020 (2), 049 (1) | BVA (empty / null / whitespace keyword) |
| VCST-5361 | Backend (perf) | P2 TechDebt | 2 | 078 (2) | Non-functional BVA (reflection call volume) |
| VCST-5392 | Admin (Assets) | P2 Bug fix | 2 | 062 (2) | BVA (file size boundary ~100MB) |
| VCST-5232 | Admin | P2 Story/Bug | 2 | 063 (2) | BVA (>3 / =3 / <3 card values) |
| VCST-5227 | Admin | P2 Bug fix | 4 | 085 (4) | Decision Table (startDueDate × endDueDate) |
| VCST-5223 | Admin | P2 Bug fix | 3 | 084 (3) | BVA (cross-page count 20 vs 56; 2→3 off-by-one) |
| VCST-4646 | Storefront | P2 Story | 5 | 036 (3), 037 (2) | BVA (page boundaries) |
| VCST-4529 | Storefront | P2 TechDebt | 3 | 036 (3) | Error Guessing (filter × keyword combos) |

**Total new cases estimated: 145–160** (P0 ~35: VCST-5369/5104/5239/5401/4923 · P1 ~65–75 · P2 ~45–55). Lower bound consolidates cross-ref/E2E journeys; upper bound fully decomposes each decision-table/pairwise row.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-13 PRs deployed to QA — vc-frontend artifact (#2353, #2336, #2349, #2335, #2354, #2350, #2360, #2366, #2371, #2374, #2316) + vc-platform build (#3064, #3065, #3068, #3069) + module-repo fixes confirmed via `packages.json` / `artifact.json` (verify artifact version, not merge status). The **Stable 15** release task (VCST-5163) is the deployment gate; **VCST-5382** confirms the module-version baseline on the env.
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy
- [ ] Store has `checkout_multistep_enabled=true` available for VCST-5369; Authorize.Net / CyberSource / Skyflow configured with `allowCartPayment=true`; sandbox cards via `@td()` (AN expiry MM/YY, Amex 4-digit CVV fixture for VCST-5202)
- [ ] Multi-org user with per-org roles **and** a user-level role override for VCST-5239 (`reference_multi_org_test_user`); a second org for the org-switch privilege path (VCST-5401)
- [ ] Loyalty (points) product + standard product for a mixed-currency cart (VCST-5104/5135/5103/5365); balance resolved relative to `LOY_SKU_PTS_UNIT` (not resettable — `project_loyalty_balance_cannot_be_reset`)
- [ ] Configurable-products seed data present (VCST-5076) for VCST-5431/5391/5079/5077; a cart holding a configurable line for the edit-reprice path
- [ ] Catalog dataset with: a numeric-valued facet (VCST-5385); a category with nested child categories (VCST-5289); products with variations + associations (VCST-5345); a ShortText property with non-default-language values (VCST-5324); featured products for browse+search (VCST-5177)
- [ ] Page Builder pages: a published page + a renamed page/category (VCST-5274) + a multi-language page (VCST-5219); Asset Library assets (VCST-4932); a ~100 MB upload fixture (VCST-5392)
- [ ] Pickup locations >1 page for VCST-4646 pagination + VCST-4529 filters
- [ ] Non-Coffee (Red Theme 4) preset selectable for VCST-4226 (note: only Coffee is WCAG-clean — `feedback_a11y_coffee_only`)
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`; `locale: en-US` set); use Edge/Chrome — not Firefox — for checkout completion (`feedback_firefox_cart_dropdown_quirk`)

### 7.2 Exit Criteria

- [ ] All P0 cases executed with 100% pass (042, 078, 011-013, 039/040a/040b/041, 028/029, 049)
- [ ] All P1 cases executed with ≥95% pass
- [ ] Zero Critical/Blocker open bugs in scope domains; **VCST-5369 multistep Place-Order verified fixed** (revenue blocker), **VCST-5401 privilege escalation verified closed** (security), and **VCST-5391 configurable-cart edit crash verified fixed**
- [ ] High-priority items verified: VCST-5239 (org roles + override enforced), VCST-4923 (replayed token rejected), VCST-5431 (config persists cart→order), loyalty mixed-cart create-order
- [ ] New cases for the Critical/High GAPs generated and in Draft status
- [ ] UI-kit visual baselines re-captured post BEM migration + Red Theme 4 (VCST-5071/5070/4226); 048b layout-stability green
- [ ] RTM updated to ≥95% coverage for in-scope tickets

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| `checkout_multistep_enabled=true` store + AN/CyberSource/Skyflow `allowCartPayment=true` | Store settings + `test-data/` cards via `@td()` | VCST-5369/5269; AN expiry MM/YY; Amex 4-digit CVV for VCST-5202 |
| Multi-org user with per-org roles + a user-level override | `reference_multi_org_test_user` (`MULTI_ORG_USER_EMAIL`) + a 2nd org | VCST-5239 override precedence; VCST-5401 org-switch privilege path |
| Loyalty (points) product + standard product | Loyalty module / Catalog | VCST-5104/5135/5103/5365 mixed-currency cart; balance relative to `LOY_SKU_PTS_UNIT`, not resettable |
| Configurable products + sections + options seed + a cart with a configured line | VCST-5076 dataset | VCST-5431/5391/5079/5077 |
| Numeric-valued facet + featured products | Admin → Catalog | VCST-5385 numeric sort; VCST-5177 featured-first |
| Category with nested child categories | Admin → Catalog (B2B virtual catalog root `@td(VIRTUAL_CATALOG_B2B.id)`) | VCST-5289 nested sort |
| Products with variations + associations | Admin → Catalog | VCST-5345 REST/xAPI parity |
| ShortText property with non-default-language values | Admin → Catalog | VCST-5324 i18n filter |
| Page Builder: published page, renamed page/category, multi-language page, Asset Library assets | Page Builder / CMS | VCST-5429/5274/5219/4932 |
| ~100 MB upload fixture | `test-data/uploads/` | VCST-5392 large-file hang |
| Pickup locations >1 page | BOPIS seed | VCST-4646 pagination, VCST-4529 filters |
| Non-Coffee Red Theme 4 preset | Store theme presets (`reference_theme_presets`) | VCST-4226 |

All variables resolved at runtime via `{{VAR}}` or `@td(ALIAS.field)`. No hardcoded IDs, SKUs, emails, prices, or order numbers (`feedback_flexible_test_cases`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-13 deployment confirmed on QA (Stable 15 / VCST-5163, module baseline VCST-5382) | 2026-07-10 | DevOps |
| Test plan created | 2026-07-13 (this document) | test-management-specialist |
| Critical verifications — VCST-5369 (multistep Place Order), VCST-5401 (privilege escalation), VCST-5391 (config-cart crash) | 2026-07-14 – 2026-07-15 | qa-frontend-expert + qa-backend-expert |
| High verifications — org roles/override, loyalty mixed-cart, catalog sorting/i18n, Page Builder, UI-kit/BEM | 2026-07-15 – 2026-07-16 | qa-frontend-expert + qa-backend-expert + ui-ux-expert |
| New test-case generation — Critical/High GAPs | 2026-07-16 – 2026-07-17 | test-management-specialist |
| P0 + P1 regression run | 2026-07-17 – 2026-07-18 | regression-orchestrator |
| P2 regression run (admin modules, BOPIS, CMS, platform) | 2026-07-18 – 2026-07-21 | regression-orchestrator |
| New test cases review and promotion (Draft → Reviewed) | 2026-07-21 | qa-lead-orchestrator |
| Final sign-off / go-no-go | 2026-07-22 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: multistep checkout, cart/configurable, loyalty, catalog sort, Page Builder storefront, BOPIS, mobile orders | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: org roles, Page Builder designer, catalog admin, task-mgmt, news, dashboard, assets | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI: `changeCartConfiguredItem`, `categories` sort, `VariationType`, facet sort, loyalty, xProfile roles | qa-backend-expert | `scripts/graphql-runner.ts` | Interactive |
| REST API: per-org roles + override, privilege escalation, replayed token, role search, onX/UCP, large upload | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| UI-kit VcSlider + BEM migration + Red Theme 4, Storybook baselines, layout-stability | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** Use Edge/Chrome (not Firefox) for checkout completion (`feedback_firefox_cart_dropdown_quirk`). Never share a browser session between parallel agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|-----------------|-------|
| VCST-5369 | Multistep Place Order blocked | Bug (High) | Checkout / Payment | 011-013, 039/040a/040b/041, 081 | GAP-01/02: 6 | qa-frontend-expert |
| VCST-5269 | Payment form only after shipping | Bug | Checkout / Payment | 011, 081 | GAP-01: 4 | qa-frontend-expert |
| VCST-5202 | Skyflow Amex CVV length | Bug (Low) | Payment | 040a | GAP-03: 3 | qa-frontend-expert |
| VCST-5329 | Skyflow init bearer-token fail | Bug (Low) | Payment | 040a | GAP-04: 2 | qa-frontend-expert |
| VCST-5239 | Org-scoped roles + user override | Story (High) | B2B / Auth | 006/027b/032/033 (partial) | GAP-13: 10 | qa-backend-expert + qa-frontend-expert |
| VCST-5401 | Global role after org switch (priv-esc) | Bug (High) | B2B / Security | 027b/032/049 (none targeted) | GAP-14: 6 | qa-backend-expert + qa-frontend-expert |
| VCST-4923 | Replayed session-token disclosure | TechDebt (sec) | Platform / Auth | 044, 082, 049 (none) | GAP-15: 4 | qa-backend-expert |
| VCST-5431 | Persist config SectionName cart→order | Story | Cart / Config Products | 050i, 072b (none) | GAP-09: 4 | qa-backend-expert |
| VCST-5391 | Config-cart edit `extendedPrice` error | Bug | Cart / Config Products | 050i, 072 (none) | GAP-10: 3 | qa-backend-expert |
| VCST-5079 | Config products storefront E2E | Story | Configurable Products | 072/072b | GAP-11: 6 | qa-frontend-expert |
| VCST-5077 | Config products xAPI + cart merge | Story | Config Products / GraphQL | 050i, 030 | GAP-12: 4 | qa-backend-expert |
| VCST-5104 | Loyalty mixed-cart create order | Story (High) | Loyalty / Checkout | 075b, 083b (happy path) | GAP-05: 9 | qa-frontend-expert + qa-backend-expert |
| VCST-5135 | Product Points Program | Story | Loyalty | 075, 075c, 083 | GAP-06: 6 | qa-backend-expert |
| VCST-5103 | Loyalty balance validator | Story | Loyalty | 075c, 083b | GAP-07: 5 | qa-backend-expert |
| VCST-5365 | In-cart loyalty validation text | Story | Loyalty | 028, 083b | GAP-08: 3 | qa-frontend-expert |
| VCST-5385 | Numeric facet sorting | Story | Search / Facets | 003/005, 050a (none) | GAP-16: 5 | qa-backend-expert + qa-frontend-expert |
| VCST-5345 | Per-variation associations | Story | Catalog / GraphQL | 050a, 049, 051 (none) | GAP-17: 5 | qa-backend-expert |
| VCST-5177 | Configurable featured sorting | Story | Catalog / Search | 001/003/004, 050a, 053 | GAP-18: 6 | qa-frontend-expert + qa-backend-expert |
| VCST-5289 | Nested childCategories sort ignored | Bug | Catalog / GraphQL | 050a (none targeted) | GAP-19: 3 | qa-backend-expert |
| VCST-5324 | i18n ShortText filter 0 results | Bug | Catalog / Search | 003, 050a, 046 (none) | GAP-20: 4 | qa-backend-expert |
| VCST-4932 | Page Builder Asset Library | Story | Page Builder / CMS | 062 (partial) | GAP-21: 4 | qa-backend-expert |
| VCST-5429 | Published page renders empty | Bug (Low) | Page Builder / CMS | 060 (none) | GAP-22: 3 | qa-backend-expert |
| VCST-5274 | Stale breadcrumb after rename | Bug | Page Builder / Storefront | 001, 060 (none) | GAP-23: 3 | qa-frontend-expert |
| VCST-5219 | Designer preview i18n / 404 | Bug | Page Builder / CMS | 059, 060 (none) | GAP-24: 3 | qa-backend-expert |
| VCST-5430 | Preview-as-user toolbar layout | Bug (Low) | Page Builder / Admin | 060 (none) | GAP-25: 2 | qa-backend-expert + ui-ux-expert |
| VCST-5413 | VcSlider handle oversized | Bug | UI Kit / Search filter | 048b, 003 (pre-fix) | GAP-26: 3 | ui-ux-expert |
| VCST-5071/5070 | BEM Tailwind→BEM migration | TechDebt | UI Kit / Structural | 048b, 042 (selector risk) | GAP-27: 4 | ui-ux-expert |
| VCST-4226 | Red Theme 4 release | TechDebt | Theme | 042, 048b, 070/071 | GAP-28: 5 | ui-ux-expert |
| VCST-5140 | Mobile order cards | Story | Orders / UI | 014, 048b | GAP-29: 4 | qa-frontend-expert |
| VCST-4464 | onX fulfilment create order | Story (High) | Orders / Integration | 017, 014 (generic) | GAP-30: 5 | qa-backend-expert |
| VCST-5126/5434 | UCP MVP + namespace rename | Story | Platform / UCP | 017 (none) | GAP-31: 3 | qa-backend-expert |
| VCST-5375 | RoleSearchService empty keyword | Bug | Platform / Role search | 020, 049 (none) | GAP-32: 3 | qa-backend-expert |
| VCST-5361 | ValueObject reflection CPU | Bug | Platform / Performance | 078 (smoke) | GAP-33: 2 | qa-backend-expert |
| VCST-5392 | Large file upload hang | Bug | Platform / Assets | 062 (none) | GAP-34: 2 | qa-backend-expert |
| VCST-5232 | Dashboard cards show only 3 | Story/Bug | Admin / Dashboard | 063 (none) | GAP-35: 2 | qa-backend-expert |
| VCST-5227 | Task due-date filter not applied | Bug | Admin / Task-mgmt | 085 (no due-date case) | GAP-36: 4 | qa-backend-expert |
| VCST-5223 | News bulk-delete count mismatch | Bug | Admin / News | 084 (no cross-page count) | GAP-37: 3 | qa-backend-expert |
| VCST-4646 | BOPIS pickup pagination | Story | BOPIS | 036/037 (no pagination) | GAP-38: 5 | qa-frontend-expert |
| VCST-4529 | BOPIS pickup filters/search | TechDebt | BOPIS | 036 | GAP-38: 3 | qa-frontend-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket spanning storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog data changed (allow 30-60s lag)

Applies to: VCST-5369 (multistep Place Order), VCST-5269 (payment form ordering), VCST-5239 (org roles + override), VCST-5401 (privilege escalation), VCST-4923 (replayed token), VCST-5431/5391 (configurable in cart), VCST-5104/5135/5103 (loyalty mixed cart), VCST-5345 (per-variation associations), VCST-5177 (featured sorting), VCST-4464 (onX create order).

---

## 13. References

- Sprint 26-13 vc-frontend PRs (in window 2026-06-29→07-10): #2353 (VCST-5369), #2336 (VCST-5269), #2349 (VCST-5202), #2335 (VCST-5104), #2354 (VCST-5239), #2350 (VCST-5177), #2360 (VCST-5274), #2366 (VCST-5413), #2371 (VCST-5324), #2374 (VCST-5219), #2316 (VCST-5140), #2330 (VCST-5222); MF-pilot / deps / perf / chore: #2377, #2365, #2367, #2361, #2339, #2345, #2340, #2357, #2356, #2355, #2338
- Sprint 26-13 vc-platform PRs (in window): #3064 (VCST-5232), #3065 (VCST-5375), #3067 (VCST-5386), #3068 (VCST-4923), #3069 (VCST-5361), #3074/#3075 (workflow/actions bumps)
- Module-repo fixes ship via their own `vc-module-*` repos, referenced by ticket: x-cart / x-catalog (5391/5431/5289/5345/5385/5324/5177), customer (5239/5401), catalog (5345/5177), page-builder (4932/5429/5274/5219/5430), loyalty (5104/5135/5103/5365), task-management (5227), news (5223), assets (5392), search (indexing), orders/onX (4464)
- Module → Suite map: `.claude/knowledge/execution/module-suite-map.md`
- BL invariants: `.claude/knowledge/oracles/business-logic.md` (BL-CART-*, BL-CHK-*, BL-LOY-*, BL-AUTH-*, BL-B2B-*, BL-CAT-*, BL-SRCH-*, BL-ORD-*, BL-CROSS-*, BL-UI-*)
- Relevant memories: `project_org_role_whitelist_filters_admin` (VCST-5239 whitelist), `project_vcst_5104_mixed_cart_loyalty`, `project_loyalty_productpoints_resolution_model`, `project_loyalty_balance_cannot_be_reset`, `reference_configurable_items_always_separate_lines`, `project_checkout_multistep_gate` (VCST-5369), `feedback_datatrans_redirect_not_blocker`, `reference_authorizenet_expiry_mmyy`, `reference_theme_presets` / `feedback_a11y_coffee_only` (VCST-4226), `reference_multi_org_test_user`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- Test data: `test-data/` (cards, multi-org user, config-products seed, import fixtures via `@td()` / `{{VAR}}`)
