# Sprint 26-17 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-09-04
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-08-24 – 2026-09-07 *(inferred — Sprint 26-16 closed 2026-08-24 and the cadence is 14 days; the Jira sprint object's `startDate`/`endDate` were not retrievable through the MCP's field projection, so treat the window as inferred, not quoted)*

> **⚠ This sprint is still OPEN.** Built 2026-09-04, three days before the inferred close. **33 of 71** Story+Bug issues are not Done (13 In review, 6 In progress, 6 To do, 4 On hold, 3 REFINEMENT, 3 Draft, 2 Reopen, 1 Testing, 2 Tested, 2 Ready for test). Scope below is the **Done** set. Re-run `/qa-test-plan Sprint26-17` after close to capture the delta.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-17 |
| Date range | 2026-08-24 – 2026-09-07 (inferred) |
| Theme | Loyalty Missions goes live (frontend + backend); the Sales Rep hub gains a permission-gated Document Library; company roles become store-configurable; **AutoMapper Wave 3 rewrites response mapping across six xAPI repos**; a silent cart overcharge and a catalog-paging defect land on the revenue path |
| Done tickets | **40** — 6 Stories, 20 Bugs, 14 Tasks |
| **Of which out of scope** | **20** — 17 Done Bugs + 2 Done Tasks are `vc-shell` / Vendor Portal (separate product), 3 Tasks are this repo's own `[Agentic QA]` tooling |
| **Test-relevant Done tickets** | **17** — 6 Stories + 3 in-scope Bugs + 8 product-relevant Tasks |
| Merged PRs in `vc-frontend` | **12** |
| Merged PRs in modules + platform | **23** (18 module across 13 repos + 5 `vc-platform`) |
| Merged PRs org-wide in window | **135** — of which `vc-shell` **37**, `vc-mcp-testing-module` **33**, `vc-deploy-dev` **22**, `vc-docs` 5, other 3 |
| Storefront sitemap | Refreshed to **rev 8** at Step 0 (platform line 3.1057.0 → **3.1062.0**, products 4,520 → **4,626**, nav categories 49 → **53**). §2 was additionally **re-derived from the `vc-frontend` router source** — it had been carried from rev 4 (May 2026) and was missing `/account/missions` and the entire `/company/*` Sales Rep hub |

**The headline number is the scope ratio: 40 Done, 17 test-relevant.** Half this sprint's closed work is a different product. That is not a complaint about the sprint — it is the single most important input to how the QA effort is allocated below, and it means the 17 in-scope items carry an unusually high average risk.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5752 | High | [UI kit] Fix outline icons | UI kit / Design system | vc-frontend #2449 |
| VCST-5730 | High | [E2E] Shared Document Library for Sales Reps — new `/company/documents`, loads the `sales-rep-documents` assets folder, TOP 5/10 + pagination, permission-gated on `documents:read` through XFile | Sales Rep hub | vc-frontend #2439, vc-module-sales-rep #12 |
| VCST-5704 | Medium | [Support][Innovadis] Page-wide anchor linking in Page Builder Rich Text fields | CMS / Page Builder | vc-frontend #2441, vc-module-pagebuilder #160 |
| VCST-5450 | Medium | [E2E] Frontend Customer Company Roles configurable per store — Initialize-Applications query, member filters, invite, change role | B2B / Company members | vc-frontend #2426, vc-module-profile-experience-api #143, vc-module-customer #314, vc-platform #3098 |
| VCST-5346 | Medium | [Missions][Frontend] Missions & Challenges — new `/account/missions` | Loyalty / Missions | vc-frontend #2396 |
| VCST-5319 | Medium | [Missions][Backend] Implement initial missions backend | Loyalty / Missions | vc-module-loyalty #14 |

### 2.2 Bugs Fixed (QA-relevant — 3 of 20 Done)

| Key | Pri | Summary | Domain | PR |
|-----|-----|---------|--------|-----|
| VCST-5801 | Medium | **[Cart] Guest→account merge converts a gift line into a paid unit at full price — silent overcharge.** Merge combined line items by `productId` alone, ignoring gift status: the account's paid line was incremented to qty 3 at `listPrice`, `isGift:false`, `discounts:[]`. Confirmed backend-side via an independent authenticated GraphQL call. Origin `REG-2026-08-24-1317`, suite 029, `CART-022`/`CART-041` | Cart / Promotions | vc-module-x-cart #139 |
| VCST-5868 | Medium | [Sales Rep] A zero-match filter hides the active status filter and its control — the rep cannot see or undo it | Sales Rep hub | — |
| VCST-5848 | Medium | [Page Builder][Storefront] Subscribe form: a link inside the checkbox label cannot be clicked — the click toggles the checkbox | CMS / Page Builder | vc-frontend #2466 |

> **VCST-5801 carries an unresolved question from the fixer, and it is a money question.** `gifts[]` still offers the gift *after* the merge, so repeated sign-out → guest → sign-in cycles **may compound** the overcharge. Explicitly unverified. It is carried as a §5.2 gap, not assumed fixed.

### 2.3 TechDebt / Structural (QA-relevant — may touch hot paths or selectors)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5661 | Medium | **Replacing AutoMapper — Wave 3, six repos in one window**: x-cart #138, x-order #50, x-catalog #110, x-api #83 (`FacetMappingContext`), x-pickup #11, catalog-csv-export-import #146 | xAPI response mapping (cross-cutting) | 6 PRs |
| VCST-5566 | High | `LastChangesService.Reset` published one Redis backplane message per saved row per inheritance level — **1285× duplication** measured under load | Platform / caching | vc-platform #3105 |
| VCST-5777 | High | Fix outline icons — Chrome 151 on macOS; renders strokes **without** `non-scaling-stroke` | UI kit / Design system | vc-frontend #2451 |
| VCST-5753 | Medium | OpenSearch provider returned no results for full-text search by **email** (Member index) | Search / Members | vc-module-open-search #3 |
| VCST-5750 | Medium | [Login on behalf] SSO support for the login-on-behalf session | Auth / Impersonation | vc-frontend #2448 |
| VCST-5689 | Medium | x-catalog: variations resolver issues one ES product search **per variation-bearing product** per listing page (N+1) | Catalog / xAPI perf | — |
| VCST-5220 | Medium | Fix Sample Data — property name `NFC_` must start with a letter or number | Sample data | — |
| VCST-5696 / VCST-5766 | Medium | Regression test on QA (theme only) · Update modules on vcst environments | QA / env ops | — |

**`VCST-5661` is the structural item that matters most.** Its failure mode is a **silently dropped or mis-mapped response field**, not an exception — so it produces no error, no log line, and no failing build. Six repos in one window makes it the sprint's largest single regression surface.

### 2.4 Out of Scope

- **`vc-shell` / Vendor Portal — 17 Done Bugs + 2 Done Tasks** (VCST-5671, 5806, 5803, 5802, 5688, 5677, 5673, 5672, 5668, 5667, 5665, 5664, 5663, 5596, 5813, 5680, 5678; Tasks 5632, 5600), plus **37 merged PRs**. A **separate product**: no Coffee theme, and this repo's storefront-selectors, `BL-UI` invariants, P0-route set and regression suites are all inapplicable. Tested against `vcmp-dev` + hosted Storybook, not `FRONT_URL`. This is disqualifier **D2** in §5.3 — not a coverage gap.
- **`[Agentic QA]` tooling — VCST-5865, 5853, 5674** (this repo's own `/qa-test`, `/qa-regression`, knowledge-generation work) + 33 `vc-mcp-testing-module` PRs. Internal tooling, no product surface.
- **`vc-deploy-dev` (22 PRs), `vc-docs` (5), `vc-github-actions`, `vc-deploy-marketplace`** — deploy manifests, documentation and CI.
- **Cross-sprint work merged in-window, not in this sprint's Done set** — noted so a reviewer does not read it as untested sprint scope: **VCST-5387** binary sidecar export/import (vc-platform #3099, backup-restore #5/#6, catalog #904) · **VCST-5852** DbContext command timeout (#3107) · **VCST-5769/5770** dependency advisories incl. the **dompurify + swiper** *runtime* deps (#2456/#2457) · **VCST-5341/5342** BenchmarkDotNet suites (x-cart #130, x-order #46) · vc-frontend **#2436** single category-scope indicator and **#2453** backend-package chore (neither carries a ticket).
- **Not Done, therefore not in scope — but live risk this sprint tests around:** **VCST-5881** (Highest, In progress, `qa-found`) catalog listing renders 3 cards under "3,569 results" then stops paging · VCST-5849 (Reopen, High) PRIMARY KEY violation linking a product · VCST-5735 (Reopen) compare-products design · VCST-5847 (Testing) Page Builder recursive designer preview on token expiry · VCST-5869/5870 (On hold) Sales Rep a11y · VCST-5817 (REFINEMENT) search input travels 115px · VCST-5652 + VCST-5097 (Ready for test) VcButton icon sizes, Date Picker Range · VCST-5653 (In review) focus indicators WCAG 1.4.11/2.4.7.

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Catalog browse & xAPI paging** | 5 | 5 | **25** | Critical | VCST-5881 (Highest, open) has the primary `/catalog` listing showing **3 of 3,569** products on the default sort and then declaring itself complete — no error, no empty state. Compounded by VCST-5689 (N+1 variations resolver) and x-catalog #110's AutoMapper removal in the same window. First surface every shopper hits |
| **AutoMapper Wave 3 — response mapping** | 5 | 5 | **25** | Critical | VCST-5661 across **six** repos (x-cart, x-order, x-catalog, x-api, x-pickup, catalog-csv-export-import). Touches the shape of nearly every xAPI response; fails **silently** by dropping or mis-mapping a field. Highest concurrent-change count in the sprint |
| **Cart / gift promotions (money)** | 4 | 5 | **20** | Critical | VCST-5801 was a **silent overcharge** on the revenue path, and its fix landed in x-cart #139 while x-cart #138 rewrote that repo's mapping in the same window — two changes, one repo, one of them a mapper rewrite. The compounding-overcharge question is unverified |
| **Loyalty Missions** | 5 | 4 | **20** | Critical | Brand-new customer surface (`/account/missions`) shipped frontend + backend together (VCST-5346, 5319). Its own test model records verdict **FAIL with 12 of 23 conditions PASS** and three live defects — VCST-5843 (Apollo `errorPolicy` unset ⇒ a partial payload discards 12 good missions), VCST-5824 (card vs modal progress disagree), and a nav-link regression created by the fix itself |
| **Sales Rep hub & Document library** | 5 | 4 | **20** | Critical | VCST-5730 adds a **doubly-gated** new route (`isSalesRepsEnabled()` **and** `documents:read`), where absent permission hides the route, the nav link *and* the dashboard widget — and a layout saved in that state **drops the block's persisted position**. Plus VCST-5868 fixed, 5869/5870 open, and 5732/5731/5337 in review on the same surface |
| **Company roles configurable** | 4 | 4 | **16** | Critical | VCST-5450 spans four repos and the **settings v2** API with new dictionary + tenant scope. Changes member **filters**, **invite** and **change role** at once — i.e. B2B permission assignment, where a wrong role is a security outcome, not a cosmetic one |
| **CMS / Page Builder** | 4 | 3 | **12** | High | VCST-5704 (page-wide anchors, frontend + module) and VCST-5848 (checkbox-label click) Done; VCST-5847 (recursive designer preview on token expiry) still in Testing |
| **Platform / caching & jobs** | 3 | 4 | **12** | High | VCST-5566 removed a **1285×** Redis backplane amplification. A fix in cache-invalidation fan-out risks the opposite failure — an invalidation that no longer arrives — which surfaces as stale reads, not as an error |
| **UI kit — icons & focus** | 4 | 3 | **12** | High | VCST-5752 + VCST-5777 change icon **stroke rendering globally** (`non-scaling-stroke`), so the rendered blast radius is every icon on every surface and is strictly larger than the diff. VCST-5653/5652/5097 queue behind them |
| **Search / OpenSearch Member index** | 3 | 3 | **9** | Medium | VCST-5753 fixed full-text member search by email — admin-facing, bounded |
| **Backup / restore (cross-sprint)** | 3 | 3 | **9** | Medium | VCST-5387 streams catalog binaries through backup/restore across three repos. Not sprint scope; listed because it merged in-window |
| **Auth / Login on behalf** | 2 | 4 | **8** | Medium | VCST-5750 adds SSO to an impersonation session — high impact if wrong, but a narrow, well-bounded change |
| *`vc-shell` / Vendor Portal* | — | — | — | *Out of scope* | 17 Done bugs, 37 PRs, **separate product** (§2.4). Not scored; not a gap |

**Six Critical domains against 17 test-relevant tickets.** Three of them (paging, mapping, cart money) fail **silently** — no exception, no log, no red build — which is what §4.2 prioritises around.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-----------|------|--------------|------|-----------|
| Catalog browse & xAPI paging | ✅ | — | ✅ (control) | ✅ **primary** | — | — |
| AutoMapper Wave 3 | ✅ | ✅ | ✅ | ✅ **primary** | — | — |
| Cart / gift promotions | ✅ **primary** | ✅ (promotion setup) | — | ✅ | — | ✅ (GA4 cart) |
| Loyalty Missions | ✅ **primary** | ✅ (missions toggle) | — | ✅ | ✅ | — |
| Sales Rep hub & Documents | ✅ **primary** | ✅ (permissions, assets) | ✅ (XFile) | ✅ | ✅ | — |
| Company roles configurable | ✅ | ✅ **primary** | ✅ (settings v2) | ✅ | — | — |
| CMS / Page Builder | ✅ | ✅ **primary** | — | — | ✅ | — |
| Platform / caching & jobs | — | ✅ | ✅ **primary** | — | — | — |
| UI kit — icons & focus | ✅ **primary** | — | — | — | ✅ **primary** | — |
| Search / Member index | — | ✅ **primary** | ✅ | — | — | — |
| Auth / Login on behalf | ✅ | ✅ | ✅ **primary** | — | — | — |

### 4.2 Testing Approach by Priority

**Critical first, and the ordering inside Critical is by failure *visibility*, not by score.** A defect that throws is found by any test that runs; a defect that silently returns the wrong shape is found only by a test that asserts the right thing.

1. **Catalog paging (25)** — assert a page is **FULL**, at the storefront's real page size of **16**, and walk pages to reconcile the union against `totalCount`. The existing suite `050a` pagination cases pass while the bug is live because they request `first:1/2/3` or assert `items.length >= 1`. Pair every measurement with a **positive control** (`name:asc`, which returns a full 16/16) in the same window, so a null result is trustworthy.
2. **AutoMapper Wave 3 (25)** — field-by-field response comparison per touched operation, not smoke. The only assertion that can catch a dropped field is one that names the field. Prioritise x-cart and x-catalog (they also carry independent changes this window).
3. **Cart / gift promotions (20)** — money invariants with **divergent** fixtures: the gift line and the paid line must differ in a way that separates a correct merge from an incremented paid line. Explicitly test **repeated** sign-out → guest → sign-in cycles for the unverified compounding case.
4. **Loyalty Missions (20)** — the value chain end-to-end (order → progress → completion → points credited → spend what was granted), on the customer's own surface. Its recorded FAIL and three open defects mean the expectation is *graded*, not green: assert and report, do not expect pass.
5. **Sales Rep hub & Documents (20)** — test the **gate matrix** explicitly: permission present/absent × module enabled/disabled, plus the layout-persistence trap (save a layout without `documents:read`, restore the permission, verify the block returns and nothing else was dropped).
6. **Company roles (16)** — decision table over role × store × operation (filter / invite / change role). A wrong role granted is a security finding, so verify the **effective permission**, not just the label in the UI.
7. **High (12)** — Page Builder anchors + checkbox label; Redis invalidation *arrival* (stale-read direction); icon stroke rendering swept across surfaces, since the blast radius exceeds the diff.
8. **Medium (8–9)** — member email search, login-on-behalf SSO, backup/restore. Targeted confirmation only.

**Cross-cutting:** every Critical domain gets a cross-browser pass (`chrome` + `edge`; **never `playwright-firefox`** — it cannot click this storefront or the Admin SPA). HAR capture on every run. Max 3 concurrent browser agents.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Catalog browse & xAPI paging | **FLOW** first, then BVA + Pairwise | The chain is *request page → middleware filters → response → observer decides end-of-list*. BVA on page size (1, 15, **16**, 17) and offset; pairwise over sort × page × index copy — the defect only appears on a tied sort |
| AutoMapper Wave 3 | Decision Table + Error Guessing | One row per (operation, field-group) with expected presence/shape. EG targets the classic mapper losses: nested collections, nullable value types, enums, facets |
| Cart / gift promotions | **FLOW** first, then State Transition + Decision Table | Guest cart → sign-in → merge → cart state is a state machine; the gift/paid × same-product × merge matrix is a decision table. ST also covers the repeated-cycle compounding question |
| Loyalty Missions | **FLOW** first, then EP + State Transition | Mission lifecycle (not started → in progress → complete → reward spent) is a state machine; goal types are equivalence partitions. FLOW is mandatory — the recorded failure mode was 127 cases that never placed an order |
| Sales Rep hub & Documents | Decision Table + Pairwise | The gate matrix (permission × module flag × role) is a decision table; pairwise over document count × page size × preview-available |
| Company roles configurable | Decision Table + EP | Role × store × operation, with EP over role kinds |
| CMS / Page Builder | State Transition + Error Guessing | Anchor navigation and token expiry are both state-dependent |
| Platform / caching & jobs | Error Guessing + load-shaped probe | The risk is a *missing* invalidation; EG on inheritance depth, which is what the 1285× multiplier keyed on |
| UI kit — icons & focus | Visual sweep + WCAG 2.2 AA checklist | Stroke rendering is a measurable geometry property; focus is a WCAG criterion (1.4.11 / 2.4.7) |
| Search / Member index | EP + BVA | Email as a full-text term: partial, exact, domain-only, special characters |
| Auth / Login on behalf | State Transition | Session identity across an SSO handoff |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

Classified by the layer directory each CSV lives under in `config/test-suites.json`, not by Jira component. **All 46 IDs verified present in the manifest (135 suites) and layer-checked — 15 Frontend, 31 Backend.**

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite | Name | Module | Sprint trigger | Priority |
|---|---|---|---|---|
| 042 | Smoke Tests | vc-frontend | VCST-5752, VCST-5777 (icon rendering baseline) | P0 |
| 001 | Catalog Navigation | vc-module-x-catalog, vc-frontend | VCST-5689, VCST-5661 (x-catalog #110) — consumer | Critical |
| 002 | Product Detail | vc-module-x-catalog, vc-frontend | VCST-5689, VCST-5881 — consumer | Critical |
| 008 | B2B Members | vc-module-customer, vc-frontend | VCST-5450 | Critical |
| 029 | Cart Validation & Persistence | vc-module-x-cart, vc-frontend | VCST-5801 | Critical |
| 030 | Cart Merge | vc-module-x-cart, vc-frontend | VCST-5801 (origin `REG-2026-08-24-1317`, CART-022/041) | Critical |
| 033 | Auth Company & Account Menu | vc-frontend | VCST-5450 | Critical |
| 082 | Auth Impersonation / Login on Behalf | vc-frontend | VCST-5750 | Medium |
| 083 | Loyalty Catalog Browsing | vc-frontend | VCST-5346 (route-guard adjacency) — secondary | Critical |
| 083c | Loyalty Missions Storefront | vc-frontend | VCST-5346 | Critical |
| 083d | Loyalty Missions E2E | vc-frontend | VCST-5346 | Critical |
| 089 | Sales Rep — My Customers | vc-module-sales-rep, vc-frontend | VCST-5730 (nav path), VCST-5868 | Critical |
| 091 | Sales Rep — Customer Profile | vc-module-sales-rep, vc-frontend | VCST-5730 | Critical |
| 093 | Sales Rep — Hub Dashboard | vc-module-sales-rep, vc-frontend | VCST-5730, VCST-5868 | Critical |
| 097 | Sales Rep — Customer Orders | vc-module-sales-rep, vc-frontend | VCST-5868 | Critical |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite | Name | Module | Sprint trigger | Priority |
|---|---|---|---|---|
| 078 / 078b / 078c / 078d | Backend Smoke (4-way split) | cross-cutting | Whole-sprint P0 baseline | P0 |
| 020 | Platform Users Roles & Settings | vc-platform | VCST-5450 | Critical |
| 026 | Customer Contacts | vc-module-customer | VCST-5753 | Medium |
| 027 | Customer Orgs & Invites | vc-module-customer | VCST-5450 | Critical |
| 027b | Customer Org-Scoped Roles | vc-module-customer | VCST-5450 (dictionary settings v2 target) | Critical |
| 049 | Platform API | vc-module-x-api | VCST-5661 (x-api #83, `FacetMappingContext`) — secondary | Critical |
| 050a | GraphQL xCatalog | vc-module-x-catalog | VCST-5661 (#110), VCST-5689 | Critical |
| 050b1–050b5 | GraphQL xCart family | vc-module-x-cart | VCST-5801, VCST-5661 (#138) | Critical |
| 050c | GraphQL xOrder | vc-module-x-order | VCST-5661 (#50) | Critical |
| 050d | GraphQL xProfile | vc-module-profile-experience-api | VCST-5450 (Initialize-Applications) | Critical |
| 050k | GraphQL xPickup | vc-module-x-pickup | VCST-5661 (#11) | Critical |
| 050m | GraphQL xAPI — Sales Rep (scoped) | vc-module-sales-rep, vc-module-x-api | VCST-5730, VCST-5868 | Critical |
| 051 | Catalog Admin Products | vc-module-catalog | VCST-5661 (admin/import mapping path) — secondary | Critical |
| 059 | Page Builder | vc-module-pagebuilder | VCST-5704 (admin-side anchor authoring) | High |
| 060 | Page Builder — Design & Content | vc-module-pagebuilder | VCST-5704 | High |
| 061 | Search Indexing Admin | vc-module-open-search | VCST-5753 | Medium |
| 063 | Core Settings | vc-platform | VCST-5450 (settings v2 API) | Critical |
| 064 | CSV Import Export | vc-module-catalog-csv-export-import | VCST-5661 (#146) | Critical |
| 075 | Loyalty | vc-module-loyalty | VCST-5319 — secondary | Critical |
| 075d | Loyalty Missions | vc-module-loyalty | VCST-5319 | Critical |
| 075e | Loyalty Missions Admin | vc-module-loyalty | VCST-5319 | Critical |
| 092 | Sales Rep — Admin / VC-Shell App | vc-module-sales-rep | VCST-5730 (`documents:read` config) | Critical |
| 092b | Sales Rep — Admin Embedded App | vc-module-sales-rep | VCST-5730 | Critical |
| 095 | Background Jobs — Hangfire Migration | vc-platform | VCST-5566 (adjacent infra) — secondary, no direct assertion | High |

**Not activated, recorded so the absence is a decision rather than an oversight:** **098** Product Compare v2 (VCST-5735 is *Reopen*, not Done) · **090** Sales Rep — My Sales Reps · **057/058** Notifications.

### 5.2 Coverage Gaps — New Test Cases Needed

| GAP | Ticket | Description | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-01 | VCST-5881 | Catalog listing renders a **partial page** while claiming 3,569 results: `RemoveNullCatalogProductsMiddleware` strips unhydrated docs *after* the page cut and decrements `totalCount` without back-fill, amplified by a single `score:desc` sort clause with no tiebreaker (ES replicas round-robin). **Corpus-wide, no case asserts a page is FULL at the storefront's real page size of 16, and none walks pages to reconcile the union against `totalCount`.** Author (a) a page-size-16 full-page assertion, (b) a page-walk union-vs-`totalCount` reconciliation, (c) a deterministic-tiebreaker guard with the known-good `name:asc` control | 050a (machine lane) · 001 (storefront journey) | test-management-specialist → qa-backend-expert |
| GAP-02 | VCST-5801 | The fixer's **explicitly unverified** question: does a repeated sign-out→guest→sign-in cycle compound the overcharge, given `gifts[]` still offers the gift post-merge? No case in 029/030 exercises a second cycle. If EXP-02 does not reproduce it, author the **negative** case as a permanent guard rather than dropping it | 030 | test-management-specialist — fed by EXP-02 |
| GAP-03 | VCST-5730 | `/company/documents` is a wholly new, doubly-gated route with TOP 5/10 + pagination and **no covering suite** (confirmed by search, not assumed). D3-blocked from a charter, so author cases directly | **none** — new suite (candidate `Frontend/sales-rep/0XX-sales-rep-documents.csv`, or extend 089/093) | test-management-specialist |
| GAP-04 | VCST-5704 | Anchor linking renders **storefront-side**; 059/060 cover only Admin authoring, and **no Frontend Page Builder rendering suite exists at all** | **none** | test-management-specialist |
| GAP-05 | VCST-5450 | What does an **empty** per-store role dictionary do — fall back to the global whitelist (ORGROLE-003, known working) or silently deny every role? The v2 empty-state contract is unconfirmed live | 027b | test-management-specialist — fed by EXP-03 |
| GAP-06 | VCST-5566 | The 1285×-duplication fix needs a guard asserting backplane message count stays **flat** across N inheritance levels rather than proportional. A count metric, not a UI behaviour | **none** — route to `/qa-perf-measure` | test-data-engineer / qa-backend-expert |
| GAP-07 | VCST-5848 | No Frontend suite covers the Page Builder subscribe-form widget at all (same gap class as GAP-04) | **none** | test-management-specialist |
| GAP-08 | VCST-5752, VCST-5777 | A corpus grep for `stroke-width` / `non-scaling-stroke` returns **zero** matches — no suite asserts icon geometry. This is precisely the `/qa-design` DESIGN-STROKE axis's target | **none** — route to `/qa-design` | ui-ux-expert |
| GAP-09 | checklist §6c (Company Members) | `/qa-checklist` §12 **"bulk invite: multiple emails, partial failure handling"** and **"custom invitation message vs default template"** are absent from suite 008's 37 case titles (grepped, zero matches) despite 008 being otherwise exhaustive | 008 | test-management-specialist |
| GAP-10 | checklist §6c (Search) | The §6 fuzzy-search item is **already covered** in suite 004. Recorded to show the diff was run, not skipped — **closed, no action** | 004 | — |

### 5.3 Exploratory Charters — discovery of what the suites cannot assert

> **3 charters × 30 min** (under the cap of 5 — the remaining Critical/High domains were disqualified on **D1**/**D2**/**D3**, not squeezed out by the cap). Lanes are chrome/edge only: `playwright-firefox` cannot click this storefront or the Admin SPA. Run **isolated from the regression pool** (3 lanes total).
>
> **D3 verified against `reports/exploratory/` on disk.** `SBTM-salesrep-customer-orders-2026-09-03.md` is **inside 24 h** ⇒ D3 fires on the Sales Rep surface. `SBTM-loyalty-missions-2026-08-28`, `SBTM-catalog-variations-resolver-2026-08-26` and `SBTM-chunk-load-resilience-2026-08-26` are outside 24 h and were consulted as **prior art**, not treated as disqualifiers.

| ID | Domain | Signals | Mission (discover X that suites Y don't cover) | Candidate scenarios | Technique | Lane | Owner |
|----|--------|---------|-----------------------------------------------|---------------------|-----------|------|-------|
| **EXP-01** | AutoMapper Wave 3 — cross-module field diff | **C2** (one ticket, **six** modules) | Discover a silently dropped or mis-mapped response field across the six AutoMapper-removal PRs — a class no fixed-value suite assertion can catch, because the documented failure mode is *not an error* | 1. **x-cart #138** — read one cart via GraphQL `cart()` and via REST `/api/carts/{id}`, diff every field, prioritising money / discount / **gift** fields (the exact class VCST-5801 broke in this same window) · 2. **x-order #50** — place an order with custom + dynamic properties, diff GraphQL `order()` against the Admin order-detail payload · 3. **x-catalog #110 `FacetMappingContext`** — diff a faceted response's facet metadata against the same definitions read from Admin catalog properties · 4. **x-pickup #11** — BOPIS fulfilment-centre fields, xPickup GraphQL vs Admin FFC data | Boundary-of-features two-path field diff — the method that already found a real MOQ divergence in `SBTM-catalog-variations-resolver-2026-08-26` | `playwright-edge` | qa-backend-expert |
| **EXP-02** | Cart gift-merge compounding × mapper-rewrite seam | **C2** (two concurrent changes to x-cart gift/merge logic in one window), money, I=5 | Confirm or refute that repeated sign-out→guest→sign-in cycles compound the gift-to-paid overcharge after the fix, and whether the AutoMapper rewrite reintroduces or masks it (feeds GAP-02) | 1. Repeat the guest→account merge twice in one session with the same gift-eligible product — does the paid quantity increment again? · 2. Sign **out** after the first merge and back in — is the gift still offered, and does accepting it merge into the existing paid line? · 3. Does the fixed, now gift-aware product-key comparison survive end-to-end through the AutoMapper-rewritten cart response? | State Transition + Boundary-of-features | `playwright-chrome` | qa-frontend-expert |
| **EXP-03** | Company roles configurable per store — settings v2 seam | **C2** (one ticket, four modules) + **C3** (chain spans 008/027/027b/020/050d across two layers) | Discover where per-store role configurability breaks the seam between Initialize-Applications, member filters, invite and change-role. Each feature is already deeply covered (129 cases across 027/027b/008); none tests the seam the *new per-store axis* introduces | 1. Configure a **different** allowed-role set per store on one org, then switch store — does the role picker match the **active** store's dictionary rather than a cached Initialize-Applications payload? · 2. Change a member's role while that store's settings-v2 dictionary is mid-edit in another Admin session · 3. A store with an **empty** dictionary — whitelist fallback (ORGROLE-003) or silent deny-all? (feeds GAP-05) | Feature-pair matrix + State Transition | `playwright-edge` | qa-backend-expert |

**Not chartered (and why):**

| Domain | Verdict | Routed to |
|---|---|---|
| Sales Rep hub & Document library | **D3** — charted 2026-09-03, < 24 h ago, on this exact surface (that session is the origin of VCST-5868). VCST-5730's new route is a genuine **C1**, but D3 outranks any C signal | GAP-03 (authored directly); the 2026-09-03 session's own charter-from-gap queue is the natural next Sales Rep charter once 24 h clears |
| Catalog browse & xAPI paging | **D1** — root cause already diagnosed to the file and line; the need is one assertable oracle (page-full + `totalCount` reconciliation), not a discovery mission | GAP-01 + §6 |
| Loyalty Missions | Deeply pre-covered (075d/075e/083c/083d, 142 cases) plus a thorough session 2026-08-28 (> 24 h, so not D3) that this sprint's diff adds no fresh uncovered surface beyond | No action this cycle |
| CMS / Page Builder | **D1** for VCST-5704 and VCST-5848 (each one assertable behaviour); VCST-5847 is not in the Done set (*Testing*) | GAP-04, GAP-07 + §6 |
| Platform / Redis backplane | **D1** and a tooling mismatch — correctness here is a message-count assertion, not a 30-minute UI exploration | GAP-06 → `/qa-perf-measure` |
| UI kit — icons & focus | **D1** — each is a single assertable geometry/token defect, the DESIGN-STROKE axis's target | GAP-08 + §6 |
| Search / OpenSearch Member index | Medium (below the Critical/High threshold) and **D1** (one fixed defect) | §6 |
| Login on behalf SSO | Medium (below threshold) and **D1** | §6 (suite 082) |
| Backup / restore binary sidecar | Medium; cross-sprint, not in this Done set | No action this cycle |
| `vc-shell` / Vendor Portal | **D2** — separate product, no QA surface in this repo | Nothing; the 17-bug count is recorded in §2.4 only |
| **White Labeling** *(queued from 26-16 as C4, cut by that sprint's cap)* | Re-evaluated on this sprint's own merits rather than carried over automatically: **no White Labeling ticket or PR appears in the 26-17 inventory**, and the triggering defect was fixed and regression-covered by 067/070/071 last sprint. **Declined — no fresh signal** | Re-queue only when a future diff touches `vc-module-white-labeling` |
| **Lists / Wishlist sharing** *(26-16 EXP-03, blocked, never executed)* | No Lists/Wishlist ticket in the 26-17 Done set — a stale carry-over with no fresh signal | Backlog; revisit when a sprint touches 007/050h/050l |
| **Background jobs, Hangfire→RabbitMQ** *(26-16 EXP-05, blocked, never executed)* | No new background-jobs ticket this sprint; suite 095's 52 cases already carry the 26-16 shipment. This sprint's only platform-infra item (VCST-5566) is a **different subsystem** — Redis pub/sub cache invalidation, not job execution | Backlog. **Separately: the credential gap that blocked three 26-16 charters is an environment problem, not a scheduling one, and should be raised with ops** |

---

## 6. New Test Cases Needed (Per Ticket)

**Estimated total: 45–70 new cases.**

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5730 | Storefront, GraphQL, Admin | New-route journey + permission gate + pagination | **10–14** | new suite (GAP-03) | **FLOW** first (nav → list → permission-denied → TOP 5/10 → pagination), then EP over permission states |
| VCST-5450 | Storefront, GraphQL, Admin | Per-store role dictionary CRUD + Initialize-Applications consistency + invite/change-role seam | **12–16** | 027, 027b, 008, 050d, 063 | **FLOW** (settings v2 → picker → invite/role change), Decision Table (store × dictionary state × role) |
| VCST-5704 | Storefront, Admin | Anchor generation + scroll-to-target | 4–6 | none (GAP-04) | EP (anchor present / absent / malformed) |
| VCST-5752 | Storefront (visual) | Icon rendering / geometry | 3–5 | none — via `/qa-design` | BVA (stroke-width thresholds) |
| VCST-5346 | Storefront | Missions incremental — **only if this sprint shipped a new mission type** | 0–4 *(contingent)* | 083c, 083d | EP |
| VCST-5319 | Backend, GraphQL | Missions backend incremental | 0–4 *(contingent)* | 075d, 075e | EP |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5801 | Storefront, GraphQL | Regression guard + repeat-cycle case | 2–4 | 030, 050b3 | State Transition |
| VCST-5868 | Storefront | Regression guard — zero-match filter no longer hides the status control | 1–2 | 097 | Error Guessing |
| VCST-5848 | Storefront | Regression guard — checkbox-label click no longer toggles | 1 | none (GAP-07) | Error Guessing |

### 6.3 Tasks / TechDebt

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5661 | GraphQL (xCart/xOrder/xCatalog/xPickup), REST (CSV) | Field-diff regression guards | 4–8 *(contingent on EXP-01)* | 050a, 050b1–b5, 050c, 050k, 064 | Boundary-of-features |
| VCST-5750 | Storefront | SSO login-on-behalf session establishment | 2–3 | 082 | EP |
| VCST-5753 | Admin | Member-index search-by-email guard | 1–2 | 026, 061 | EP |
| VCST-5566 | Backend | Backplane message-count guard | 1–2 | none (GAP-06) → `/qa-perf-measure` | BVA (N inheritance levels) |
| VCST-5777 | Storefront (visual) | `non-scaling-stroke` guard, Chrome ≥ 151 | 1–2 | none (GAP-08) | BVA |
| VCST-5220 | Test data | Sample-data property-name fixture fix — no app behaviour change | **0** | n/a | n/a |

### 6c — Checklist diff (Critical / High domains)

- **Company Members (§12 vs suite 008)** — every item covered except bulk invite with partial-failure handling, and the custom-invitation-message vs default-template pair. Confirmed absent by direct grep against 008's 37 case titles ⇒ **GAP-09** (assertable ⇒ §5.2/§6, not a charter).
- **Catalog (§2 vs 001/002/003/050a)** — the fuzzy-search item is already covered in suite 004 ⇒ **GAP-10, closed**. Recorded so the diff is visibly *run*, not skipped.
- **Cart / Checkout (§8) "Loyalty gifts display" vs 029/030** — absent (zero `gift` matches in either suite). That is exactly VCST-5801's blast radius, so it is captured as GAP-02 / EXP-02 rather than duplicated.
- **Loyalty and Sales Rep have no `/qa-checklist` domain section at all** (zero headings for either). That is itself a checklist-coverage gap and a real finding, but it is out of scope for a per-ticket sprint diff — noted for a `/qa-checklist new <domain>` follow-up, deliberately **not** actioned here.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- `npm run env:check` green for `TEST_ENV=vcst`; `FRONT_URL` / `BACK_URL` reachable.
- Deployed build verified live, **not assumed** — platform line **3.1062.0** / 87 modules as of the Step-0 crawl. Confirm the storefront theme version from the login-page HTML (the footer "Ver." is SPA-rendered; `/health` lies during a restart).
- **Loyalty Missions toggles ON**: the Loyalty module `ENABLED_KEY` **and** `MISSIONS_ENABLED_KEY`. With either off, `/account/missions` does not exist at all — a `404` is then a config state, not a defect.
- **Sales Rep fixtures**: `isSalesRepsEnabled()` on; a rep with `documents:read` **and** one without (the gate matrix needs both); the `sales-rep-documents` assets folder populated past one page.
- **Gift-promotion fixture for VCST-5801**: an active gift promotion, plus the *same* product purchasable as a paid line, with **divergent** prices so a merged paid line is distinguishable from a correct gift line. A flat/equal fixture makes the case unfalsifiable.
- **Catalog paging fixture**: a category with **> 32** products so pages 2 and 3 exist, and both the default (`score:desc`) and `name:asc` sorts reachable — the second is the positive control.
- Company-roles fixtures: ≥ 2 stores with **different** configured role sets, and a member to invite / re-role in each.
- `npm run td:validate` + `TEST_ENV=vcst npm run td:reconcile` green; `npm run suites:lint` green.
- **Fixture-state pre-flight**: compare each fixture's recorded `*_at_seed` values against live before authoring. Sprint 26-16 lost 5 of 34 cases to a sibling suite consuming shared disposable fixtures.

### 7.2 Exit Criteria

- All Critical-domain suites executed; **0 open P0** attributable to sprint scope.
- **Catalog paging: a full-page assertion at page size 16 exists and passes, with its `name:asc` control in the same run.** Without the control a pass is not evidence.
- **AutoMapper Wave 3: every touched operation has a field-level assertion**, not a smoke check. A green smoke run over a silently-dropped field is the failure this criterion exists to prevent.
- **VCST-5801: the repeated-cycle compounding question is answered either way**, and recorded. "Not reproduced" is an acceptable exit only if it is *stated*.
- Loyalty Missions: the FLOW journey case executed end-to-end; the three open defects (VCST-5843, 5824, nav-link-after-mid-session-sign-in) each re-confirmed on this build and **not re-filed**.
- Sales Rep Documents: the full gate matrix covered, including the layout-persistence trap.
- Every `BL-*` cited by an executed case verified; new `BL-*`/`ECL-*` candidates routed to `/qa-review-oracles` as **proposals**, never direct oracle edits.
- A11y findings on functional tickets filed as **their own standalone tickets at real severity** — never as a Sub-task, and they do **not** block a feature story.
- Any below-floor (`Low`/P3) finding recorded in the checklist + `reports/bugs/open/low/`, never silently dropped.
- Feature Release Gate ratified per `.claude/skills/qa-metrics/quality-gates.md` §1a; GO/NO-GO is a **recommendation** — a human decides.

---

## 8. Test Data Requirements

Per `.claude/rules/test-data.md`: resolve through `@td(ALIAS.field)` / `{{VAR}}`, never a literal. **A fixture must be discriminating, not merely resolvable** — that is the second rule, and it is the one this sprint depends on most.

| Domain | Data needed | Source / note |
|--------|-------------|---------------|
| Cart / gift promotions | Active gift promotion + the same product as a paid line, at **divergent** prices; a guest cart and an account cart | `td:validate:standard`. Equal prices make a merged paid line indistinguishable from a correct gift — the case would pass either way |
| Catalog paging | A category with **> 32** products; both sorts reachable; a positive control (`name:asc`) | Live env now holds 4,626 products / 53 nav categories (sitemap rev 8). Note that 4 of those categories are **QA seed fixtures**, not merchandising data |
| Loyalty Missions | Missions across all goal types and lifecycle states; orders with **non-flat** totals (shipping / tax / discount present) | The recorded VCST-5346 failure: flat $30 orders left "does the goal accrue `order.Total` or merchandise value?" **undecidable** — both the right and the wrong implementation predict $30.00 |
| Sales Rep Documents | Rep **with** and **without** `documents:read`; `sales-rep-documents` folder past one page; a document with and without a preview | `td:validate:sales-rep`. Both permission states are required — one state cannot test a gate |
| Company roles | ≥ 2 stores with **different** role sets; invitable + re-rolable members in each | `td:validate:b2b`. Identical role sets make "configurable per store" unfalsifiable |
| AutoMapper Wave 3 | Entities exercising nested collections, nullable value types, enums and facets per touched operation | Sparse entities are the ones a mapper rewrite loses |
| Search / Member index | Members whose email matches partially, exactly, and by domain only | `td:reconcile` |
| Page Builder | A page with in-page anchors; a subscribe form with a link inside its checkbox label | — |

**Do not re-seed between producing an observation and its being cited.** Disposable fixtures are per-*seed*, and "isolated" without a qualifier will be read as per-*run*. Capture the run handle and entity ids with any observation, or it is a memory rather than evidence.

---

## 9. Schedule and Milestones

The sprint closes 2026-09-07 (inferred). Testing runs from close to +1 week.

| Date | Milestone | Owner |
|------|-----------|-------|
| 2026-09-05 | Fixtures seeded + `td:validate` / `td:reconcile` green; deployed build + module versions confirmed live; Missions + Sales Rep toggles verified | test-data-engineer |
| 2026-09-08 | Critical domains 1–3 (catalog paging, AutoMapper, cart money) executed | qa-backend-expert, qa-frontend-expert |
| 2026-09-09 | Critical domains 4–6 (Missions, Sales Rep Documents, company roles) executed | qa-frontend-expert, qa-backend-expert |
| 2026-09-10 | §5.3 exploratory charters run (isolated from the regression pool) | qa-testing-expert |
| 2026-09-11 | High domains (Page Builder, platform caching, UI-kit icons + a11y) | ui-ux-expert, qa-backend-expert |
| 2026-09-12 | Medium domains; triage via `/qa-triage-results --fix`; new cases promoted `Draft → Automated` | qa-lead-orchestrator |
| 2026-09-15 | Feature Release Gate ratified; GO/NO-GO recommendation | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

Per `.claude/rules/agents.md`. **Max 3 concurrent browser agents.** Each agent gets its own isolated session — never share a browser between parallel agents.

| Domain | Agent | Lane |
|--------|-------|------|
| Catalog browse & xAPI paging | `qa-backend-expert` | `playwright-edge` (+ GraphiQL) |
| AutoMapper Wave 3 | `qa-backend-expert` | `playwright-edge` |
| Cart / gift promotions | `qa-frontend-expert` | `playwright-chrome` |
| Loyalty Missions | `qa-frontend-expert` | `playwright-chrome` |
| Sales Rep hub & Documents | `qa-frontend-expert` | `playwright-chrome` |
| Company roles configurable | `qa-backend-expert` | `playwright-edge` (Admin SPA) |
| CMS / Page Builder | `qa-backend-expert` | Chrome DevTools MCP (Admin SPA) |
| Platform / caching & jobs | `qa-backend-expert` | none (API only) |
| UI kit — icons, focus, a11y | `ui-ux-expert` | Chrome DevTools MCP |
| Search / Member index | `qa-backend-expert` | `playwright-edge` |
| Exploratory charters (§5.3) | `qa-testing-expert` | `playwright-chrome` / `playwright-edge` |
| Test data | `test-data-engineer` | none (Node + Platform API) |
| Orchestration, triage, status | `qa-lead-orchestrator` | none |

**Two lane rules that cost a whole attempt when broken:**
- **Never schedule a click-driven pass on `playwright-firefox`.** `browser_click` resolves the element then times out on the actionability gate — on fully-visible, non-moving elements. Confirmed 6×. Cart, checkout, sign-in, PDP interaction and every Admin SPA suite must queue for a free chrome/edge slot instead.
- **Chrome DevTools MCP has no `--secrets`.** A brief for that lane must name its auth path — the pre-signed persistent profile (default, and the only one reaching a role-gated surface), minting an account through the UI (role-agnostic targets only), or dispatching the pass to a Playwright lane. Leaving it unstated cost a full agent turn on VCST-5733. Also: **a subagent does not inherit `DesignSync`**, so the `vs. DESIGN` axis must run in the main session or report `SKIPPED`.

---

## 11. JIRA Ticket Coverage Matrix

Every test-relevant Done ticket. **New-case counts are from §6; a `none` in the suite column is a §5.2 gap, not an omission.**

| Ticket | Domain | Existing suite(s) | New cases | Owner |
|---|---|---|---|---|
| VCST-5346 | Loyalty Missions (frontend) | 083c, 083d, 083 | 0–4 *(contingent)* | qa-frontend-expert |
| VCST-5319 | Loyalty Missions (backend) | 075d, 075e, 075 | 0–4 *(contingent)* | qa-backend-expert |
| VCST-5730 | Sales Rep Document Library | 089, 091, 093, 092, 092b, 050m | **10–14** (GAP-03, new suite) | qa-frontend-expert |
| VCST-5450 | Company roles configurable | 008, 033, 027, 027b, 020, 063, 050d | **12–16** (+ GAP-05) | qa-backend-expert |
| VCST-5704 | Page Builder anchors | 059, 060 | 4–6 (GAP-04) | qa-backend-expert |
| VCST-5752 | UI kit outline icons | 042 | 3–5 (GAP-08) | ui-ux-expert |
| VCST-5801 | Cart gift merge (money) | 029, 030, 050b1–b5 | 2–4 (+ GAP-02) | qa-frontend-expert |
| VCST-5868 | Sales Rep zero-match filter | 097, 093 | 1–2 | qa-frontend-expert |
| VCST-5848 | Page Builder subscribe form | none | 1 (GAP-07) | qa-frontend-expert |
| VCST-5661 | AutoMapper Wave 3 (6 repos) | 050a, 050b1–b5, 050c, 050k, 064, 049, 051 | 4–8 *(contingent on EXP-01)* | qa-backend-expert |
| VCST-5566 | Redis backplane duplication | 095 *(adjacent only)* | 1–2 (GAP-06 → `/qa-perf-measure`) | qa-backend-expert |
| VCST-5777 | Outline icon strokes (Chrome 151) | 042 | 1–2 (GAP-08) | ui-ux-expert |
| VCST-5753 | Member index email search | 026, 061 | 1–2 | qa-backend-expert |
| VCST-5750 | Login on behalf SSO | 082 | 2–3 | qa-frontend-expert |
| VCST-5689 | x-catalog variations N+1 | 001, 002, 050a | 0 — perf, see `/qa-perf-measure` | qa-backend-expert |
| VCST-5220 | Sample data property name | n/a | 0 | test-data-engineer |
| VCST-5696 / VCST-5766 | QA / env ops | n/a | 0 | qa-lead-orchestrator |

**Tracked but NOT in scope (not Done) — listed so a reader does not mistake absence for coverage:** VCST-5881 (Highest, In progress) drives **GAP-01**, because its coverage gap is real today · VCST-5849, VCST-5735 (Reopen) · VCST-5847 (Testing) · VCST-5869, VCST-5870 (On hold) · VCST-5652, VCST-5097 (Ready for test) · VCST-5653 (In review).

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

Tickets whose value chain crosses layers, so a single-layer pass cannot clear them:

1. **VCST-5801 — gift merge (Cart).** Guest cart with a gift → sign in → xAPI cart state → storefront cart totals → checkout. Verify `isGift`, `discounts[]`, `extendedPrice` and the cart `subTotal` **at the API**, then that the storefront renders the same numbers. Repeat the sign-out → guest → sign-in cycle to settle the compounding question.
2. **VCST-5346 + VCST-5319 — Loyalty Missions.** Place a real order → mission progress accrues → mission completes → points credited to the ledger → points spendable. Frontend + backend shipped together, so neither half alone is evidence. Order totals must be non-flat.
3. **VCST-5730 — Sales Rep Document Library.** Assets folder (Admin) → XFile permission → xAPI → `/company/documents` page + dashboard widget + nav link. Run the permission-absent case too, and the layout-save trap.
4. **VCST-5450 — Company roles.** Platform settings v2 (dictionary + tenant scope) → customer module → profile xAPI → storefront filters / invite / change role. Verify the **effective permission** after a role change, not the label.
5. **VCST-5661 — AutoMapper Wave 3.** Per touched operation: xAPI response shape → storefront render. Six repos; field-level assertions.
6. **VCST-5881 (open, Highest) — catalog paging.** Platform REST (`/api/catalog/search/products`, the passing control) → xAPI `products` connection (the failing layer) → storefront grid + infinite scroll. The layer split *is* the finding.
7. **VCST-5750 — Login on behalf SSO.** Admin initiates → SSO handoff → storefront session identity → permissions of the impersonated user.
8. **VCST-5566 — Redis backplane.** Save an inherited entity → invalidation fan-out → a read on another node returns fresh data. Test the *stale-read* direction, which is the risk a de-duplication fix introduces.

---

## 13. References

**Merged `vc-frontend` PRs in window (12):** #2396 (VCST-5346 Missions) · #2426 (VCST-5450 company roles) · #2436 (search-bar scope indicator, no ticket) · #2439 (VCST-5730 documents library) · #2441 (VCST-5704 page anchors) · #2448 (VCST-5750 login-on-behalf SSO) · #2449 (VCST-5752 settings icon) · #2451 (VCST-5777 outline icon strokes) · #2453 (backend packages chore) · #2456 (VCST-5769 build advisories) · #2457 (VCST-5770 dompurify + swiper) · #2466 (VCST-5848 checkbox label)

**Merged module / platform PRs in window (23):** vc-platform #3098, #3099, #3105, #3106, #3107 · x-cart #130, #138, #139 · x-order #46, #50 · x-catalog #110 · x-api #83 · x-pickup #11 · catalog-csv-export-import #146 · open-search #3 · loyalty #14 · sales-rep #12 · pagebuilder #160 · profile-experience-api #143 · customer #314 · catalog #904 · backup-restore #5, #6

**Knowledge:** `.claude/knowledge/oracles/business-logic.md` · `e-commerce-edge-cases-library.md` · `vc-bug-catalog.md` · `.claude/knowledge/domain/{sitemap,functionality-map,release-ledger,store-settings}.md` · `.claude/knowledge/execution/{module-suite-map,ticket-routing,ticket-status-transitions,live-discovery,test-data-authoring}.md` · `.claude/knowledge/api/{graphql-schema,graphql-test-cases-runner}.md`

**Rules:** `.claude/rules/{agents,regression,quality-gates,reports,test-data,mcp-browsers,skills-commands}.md`

**Manifest:** `config/test-suites.json` (135 suites — 60 Frontend / 75 Backend; 37 selections)

**Prior artifacts:** `vc/shared/docs/Sprint plans/sprint-26-16-test-plan.md` (+ `-summary.json`) · `reports/ba/test-models/VCST-5346-2026-08-28.md` and `-2026-09-02.md` · `reports/bugs/open/critical-high/BUG-xapi-catalog-paging-drops-unhydrated-products.md` · `reports/bugs/open/BUG-cart-merge-converts-gift-into-paid-unit.md` · `reports/regression/REG-2026-08-24-1317/` (origin of VCST-5801)

**Step 0 (sitemap):** refreshed to **rev 8** — `.claude/knowledge/domain/sitemap.md` + snapshot `sitemap-snapshot.vcst.json` + the `plugins/vc-fix/` mirror. Platform line 3.1057.0 → **3.1062.0**; products 4,520 → **4,626**; nav categories 49 → **53** (all 4 additions are QA seed fixtures: `agent-test-empty-category`, `seed-compare-fixtures`, `seed-compare-nested`, `seed-loyalty-missions-e2e`). §2 was additionally **re-derived from the `vc-frontend` router source** after the crawler's diff was found blind to storefront routes — it had been carried from rev 4 (May 2026), missing `/account/missions` and the whole `/company/*` Sales Rep hub. `scripts/maintenance/refresh-sitemap.mjs` gained a **route axis** (+ a staleness guard) so this is now self-detecting; see `.claude/commands/qa-sitemap.md` Step 1b.
