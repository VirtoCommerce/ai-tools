# Sprint 26-14 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-07-24
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-07-13 – 2026-07-24

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-14 (JIRA sprint name: `Sprint 26-14`) |
| Date range | 2026-07-13 – 2026-07-24 |
| Theme | A large **XCart/Order performance + request-scoped-caching epic** (VCST-5303) across x-cart/x-catalog/customer/pricing/tax/platform, plus an XCart cache-invalidation fix and validator-singleton perf; a **new Sales Rep module + storefront hub** (My Sales Reps contact info, My Customers, customer profile, dashboard, embedded Admin app); **search-indexing reliability** (concurrent-indexation crash, invalid index name, Azure-AI-Search date-range 500) + multilingual filter; configurable-products cart-edit crash + E2E/xAPI/dataset; **UI-kit design tokens** (VcAlert/VcChip/VcTable/VcIcon/VcButton) + **Tailwind→BEM [4]/[5]**; per-store asset URL + PDP widget layout + catalog mapping; platform-settings clear-to-empty + a **.NET security CVE**; Page Builder preview-language / publish-banner fixes; loyalty in-cart validation; change-password logout redirect |
| Total issues in sprint | 164 (34 Story + Bug delivered; 41 Task/TechDebt delivered; remainder not in a Done state) |
| Test-relevant delivered tickets | 40 (17 Bugs + 17 Stories + ~6 test-impact Tasks/TechDebt), status = Done |
| Merged frontend PRs (in window) | 20 in `vc-frontend` (18 VCST-linked; incl. #2343, #2375, #2376, #2370, #2369, #2363, #2373, #2368, #2362, #2358, #2378, #2380, #2383, #2387, #2390, #2393, #2382, #2386, #2388, #2381) |
| Merged module/platform PRs (in window) | ≥31 across ~15 `vc-module-*` / `vc-platform` repos (referenced by ticket; excludes `vc-deploy-dev` manifest commits and `vc-modules` bundle bumps) |

> **Note on workflow statuses:** scope is taken from issues in the **Done** category this sprint (Story + Bug for §2.1/§2.2; Task/TechDebt for §2.3). Items still in *To do / In progress / In review / Draft / REFINEMENT / Reopen / On hold / Cancelled* are treated as **not deliverable** and excluded (§2.4). A few tickets (VCST-5391, 5219, 5430, 5365) progressed from *Testing/Tested/Wait hotfixes* in Sprint 26-13 to **Done** here — they are carried as regression-verification items.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Summary | Status | Domain |
|-----|---------|--------|--------|
| VCST-5303 | [Skill] Improve XCart Operation & Order Creation Performance (request-scoped caching across x-cart/x-catalog/customer/pricing/tax/platform) | Done | Platform Perf / Cart / Order |
| VCST-5409 | [FE] Organization member — My Sales Reps Contact Information (PR #2378) | Done | Sales Rep / B2B |
| VCST-4907 | [BE] Organization member — My Sales Reps Contact Information (x-api) | Done | Sales Rep / GraphQL |
| VCST-5469 | [FE] Sales Rep — Reorganize left rail & show My Customers (PR #2380) | Done | Sales Rep / B2B |
| VCST-5304 | [BE] Sales Rep — Reorganize left rail & show My Customers (embedded app + x-api) | Done | Sales Rep / Admin |
| VCST-5293 | [BE] Sales Rep Role — VC-Shell App | Done | Sales Rep / Admin |
| VCST-5079 | [E2E][Auto-tests][UI] Configurable Products storefront | Done | Configurable Products |
| VCST-5077 | [E2E][Auto-tests][GraphQL] Configurable Products xAPI — incl. cart merge | Done | Configurable Products / GraphQL |
| VCST-5076 | [E2E][Auto-tests][Dataset] Configurable products + sections + options seed data | Done | Configurable Products / Data |
| VCST-5089 | [Support][PeakJet] Assets Store URL — per-store Asset Public URL for xAPI asset links (store/x-api/x-catalog) | Done | Catalog / Assets |
| VCST-5318 | [Support] Catalog mapping (Map) — allow linking products/items only, disallow categories | Done | Catalog / Admin |
| VCST-5460 | [UI-kit] Implement design tokens in VcAlert (PR #2387) | Done | UI Kit |
| VCST-5459 | [UI-kit] Implement design tokens in VcChip (PR #2386) | Done | UI Kit |
| VCST-4984 | [UI-kit] Update VcTable — row selection, default empty state (PR #2362) | Done | UI Kit |
| VCST-4400 | [UI-kit] Update VcIcon — solid & outline icons support (PR #2382) | Done | UI Kit |
| VCST-5365 | [Loyalty][Mixed Cart] Show loyalty validation text in cart before Place Order (PR #2368) | Done | Loyalty |
| VCST-5339 | MCP on .NET — see §2.4 (dev tooling, no storefront/admin surface) | Done | Platform / Tooling |

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Status | Domain |
|-----|----------|---------|--------|--------|
| VCST-5522 | High | [Security] CVE-2026-47304 — .NET XML-encryption security-feature-bypass; platform bumped to .NET 10.0.10 (PR #3082) | Done | Platform / Security |
| VCST-5497 | High | [Support] Contacts Created/Modified custom date-range → 500 on Azure AI Search (DateTimeOffset filter literal missing timezone) | Done | Search / Customer |
| VCST-5416 | High | Search indexation crashes — `IndexOutOfRangeException` in `IndexProgressHandler` (thread-unsafe Dictionary); leaves "Indexation already in progress" stuck; storefront order history empty | Done | Search / Platform |
| VCST-5559 | Medium | Invalid index name when removing documents and requesting suggestions (`…-active-member` vs `…-member-active`) — azure-search #56 | Done | Search |
| VCST-5542 | Medium | [GH-vc-module-export-103] Generated exports cannot be downloaded after BackupRestore ≥3.1001.1 renamed `platform:export`/`import` permission values — backup-restore #4 re-registers legacy perms | Done | Admin / Import-Export |
| VCST-5506 | Medium | [UI-kit] VcButton hover issues (PR #2386) | Done | UI Kit |
| VCST-5505 | Medium | XCart cache is not invalidated when the Cart changes (x-cart #135) | Done | Cart / GraphQL |
| VCST-5494 | Medium | [FE][Sales Rep] "My customers" hub link shown but page redirects to Dashboard for a rep with no org membership | Done | Sales Rep / B2B |
| VCST-5471 | Medium | [Support] Widget tiles overlap / Prices widget disappears on Product Details page (platform #3078) | Done | Catalog / Admin (layout) |
| VCST-5441 | Medium | [AgentFix][Platform Settings] A dictionary setting cannot be cleared to empty (relates VCST-5239 org-role whitelist) | Done | Platform Settings / B2B |
| VCST-5438 | Medium | Logout on the Change Password page does not redirect — anonymous user stranded on the form (PR #2375) | Done | Auth |
| VCST-5391 | Medium | [Cart] Editing a configurable product from the cart returns error resolving `extendedPrice` (`changeCartConfiguredItem`) | Done | Cart / Configurable Products / GraphQL |
| VCST-5324 | Medium | Multilanguage ShortText property filter returns 0 results for non-default languages (facet shows count, click yields nothing) | Done | Catalog / Search (i18n) |
| VCST-5219 | Medium | [Support][Page Builder] Designer preview ignores page language — renders default language; lang switch → 404 (multi-language store) — PR #2363 | Done | Page Builder / CMS (i18n) |
| VCST-5515 | Low | [Admin][Page Builder] Stale "Has a changes" banner after a clean Publish (pagebuilder shell #156) | Done | Page Builder / Admin |
| VCST-5495 | Low | [Support] Contacts: filter panel and row "⋮" menu overlap — opening one popover does not close the other | Done | Admin / Customer (layout) |
| VCST-5430 | Low | [Page Builder Designer] Preview-as-user selector breaks the toolbar layout on long emails | Done | Page Builder / Admin (layout) |

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Summary | Status | Domain |
|-----|---------|--------|--------|
| VCST-5427 | FluentValidation validators re-constructed per call (~18% of cart-op allocations) → registered as singletons (customer/order/catalog/platform) | Done | Platform / Perf (hot path) |
| VCST-5435 | Make `ChangeOrganizationContactRoleCommandHandler` extendable — B2B org-role command surface | Done | B2B / Customer |
| VCST-5071 | [BEM] Replace Tailwind with BEM [5] — product components; storefront CSS class rename → selector/data-test-id churn (PR #2370) | Done | UI Kit / Structural |
| VCST-5070 | [BEM] Replace Tailwind with BEM [4] — cart & catalog components; same selector regression surface (PR #2369) | Done | UI Kit / Structural |
| VCST-5405 | [FE] Fix circular dependencies (Rollup chunks + dependency-cruiser) — FE build-graph change (PR #2358) | Done | Frontend / Build |
| VCST-5516 | Move hardcoded hosts/domains/URLs from `vite.config.ts` to `.env`; derive CSP `frame-ancestors` from `APP_BACKEND_URL` (PR #2393) | Done | Frontend / Config (CSP) |
| VCST-4226 | Red Theme 4 Release — non-Coffee theme visual/layout preset (PR #2373) | Done | Theme / Whitelabeling |

### 2.4 Out of Scope

Excluded from QA verification this sprint — either **not deliverable** (status ≠ Done: To do / In progress / In review / Draft / REFINEMENT / On hold / Cancelled — **89 issues**, not enumerated as none shipped a testable surface) or **non-product** (agentic-QA tooling / CI / infra / release ops / dependency bumps):

- **Agentic-QA / vc-fix tooling (Done, non-product):** VCST-5475/5476/5477/5478/5479 (self-diagnostics), VCST-5525/5517/5482/5470/5465/5464/5463/5462/5461/5447/5279/5226 (skills, tracker plumbing, App-Insights integration), VCST-5512/5511/5402 (`/qa-hotfix*` tooling), VCST-5509 (feedback loop)
- **CI / dependency / infra (Done):** VCST-5548/5455/5498/5444/5513 (dep + Sonar bumps), VCST-5516 (also §2.3 — CSP/env), VCST-5373 (Nuget trusted publisher)
- **Release / env ops (Done):** VCST-5529/5528 (hotfix backports into stable bundles v14/v15), VCST-5382 (module baseline on vcst), VCST-5453 (Virtostart smoke), VCST-5380 (theme regression), VCST-5504 (UCP checker review)
- **Backend perf micro-optimizations (Done, folded into §2.3/GAP-01 not individually verified):** VCST-5468 (resolve mediators per request), VCST-5556 (reuse platform request-scoped cache)
- **Dev tooling (story):** VCST-5339 (MCP on .NET — no storefront/admin surface)
- **Auto-test authoring tasks (Done):** VCST-5002 (address search E2E), VCST-4529 (pickup filters E2E), VCST-4978 (DOT perf audit)

---

## 3. Risk Assessment

Risk Score = Likelihood × Impact (5×5 matrix). Thresholds: 1-4 Low, 5-9 Medium, 10-15 High, 16-25 Critical. Grouped by primary domain.

| Domain | Likelihood | Impact | Score | Level | Rationale |
|--------|-----------|--------|-------|-------|-----------|
| Platform Perf — XCart/Order & request-scoped caching (VCST-5303, 5505, 5427) | 5 | 5 | 25 | Critical | A cross-repo performance epic touching the **cart/order/catalog hot paths simultaneously** (x-cart, x-catalog, customer, pricing, tax, platform `IRequestScopedCache`) plus a cart cache-invalidation fix and validator-singleton registration. Caching + singleton lifetime changes are the highest-risk class for **subtle correctness/staleness/state-bleed** regressions on the P0 revenue path — many concurrent touches, hard to spot |
| Sales Rep — new module & storefront hub (VCST-4907, 5304, 5293, 5409, 5469, 5494) | 4 | 4 | 16 | Critical | A **brand-new `vc-module-sales-rep`** + scoped xAPI + embedded Admin app + four new storefront surfaces (My Sales Reps contact info, My Customers, customer profile, dashboard) landing together, with a membership-scoping bug (rep with no org membership misrouted). New multi-repo feature, B2B customer-visible, access-scoping risk |
| Search — indexing reliability & i18n (VCST-5416, 5559, 5497, 5324) | 4 | 4 | 16 | Critical | A **concurrency crash in indexation** (thread-unsafe Dictionary) that leaves indexing stuck AND **storefront order history empty**, an invalid-index-name bug on remove/suggest, a Contacts date-range 500 on Azure AI Search, and a multilingual filter returning 0 results — search/index integrity feeds catalog browse, order history, and admin contacts |
| Cart — Configurable Products & E2E (VCST-5391, 5079, 5077, 5076) | 4 | 4 | 16 | Critical | Edit-from-cart **crash** (`changeCartConfiguredItem` → `extendedPrice`) that gates cart mutation, plus storefront E2E + xAPI cart-merge + a new seed dataset — all on the cart/checkout surface; a cart-mutation crash directly blocks purchase |
| UI Kit — design tokens & BEM (VCST-5460, 5459, 4984, 4400, 5506, 5071, 5070) | 4 | 3 | 12 | High | Five UI-kit component changes (VcAlert/VcChip/VcTable/VcIcon/VcButton design tokens + hover) **plus** the Tailwind→BEM migration across product/cart/catalog components — broad selector/data-test-id + visual-regression blast radius across every storefront page that reuses the kit |
| Catalog — assets/PDP & mapping (VCST-5089, 5471, 5318) | 3 | 4 | 12 | High | Per-store Asset Public URL substitution changes how **every xAPI asset link resolves** (storefront images), a PDP admin blade widget-overlap/disappearing-prices layout fix, and a catalog-mapping data-integrity guard — asset-link correctness is broad and customer-visible |
| Platform Settings & Security (VCST-5441, 5522, 5435) | 3 | 4 | 12 | High | A **.NET security CVE** patch (broad runtime bump, low functional-regression likelihood but high impact), a platform-settings dictionary clear-to-empty fix (tied to the org-role whitelist model), and a B2B org-role command extensibility change |
| Page Builder / CMS (VCST-5219, 5515, 5430) | 3 | 3 | 9 | Medium | Designer preview language honoring on multi-language stores (+ no 404), a stale post-publish "Has changes" banner, and a preview-as-user toolbar-layout fix — content-authoring correctness + designer operability, limited storefront blast radius |
| Loyalty mixed cart (VCST-5365) | 3 | 3 | 9 | Medium | Cart surfaces the loyalty insufficient-balance validation text **before** Place Order (not only as a server rejection) on the mixed-cart checkout path — single ticket, focused UI-timing change |
| Auth — Change Password (VCST-5438) | 2 | 3 | 6 | Medium | Logout from the change-password form now redirects an anonymous user to a safe landing page instead of stranding them — narrow, single-flow fix |
| Admin modules — export/contacts UI (VCST-5542, 5495) | 3 | 2 | 6 | Medium | Export-download permission re-registration after a BackupRestore rename, and a contacts filter/row-menu popover-overlap fix — independent, low-blast-radius admin fixes |

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Platform Perf — XCart/Order & caching | Yes | — | Yes | Yes | — | — |
| Sales Rep — new module & hub | Yes | Yes | Yes | Yes | — | — |
| Search — indexing reliability & i18n | Yes | Yes | Yes | Yes | — | — |
| Cart — Configurable Products | Yes | Yes | — | Yes | — | — |
| UI Kit — design tokens & BEM | Yes | — | — | — | Yes | — |
| Catalog — assets/PDP & mapping | Yes | Yes | — | Yes | — | — |
| Platform Settings & Security | — | Yes | Yes | — | — | — |
| Page Builder / CMS | Yes | Yes | Yes | — | — | — |
| Loyalty mixed cart | Yes | — | — | Yes | — | — |
| Auth — Change Password | Yes | — | Yes | — | — | — |
| Admin modules — export/contacts UI | — | Yes | Yes | — | — | — |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**
- **Platform Perf — XCart/Order & caching (VCST-5303, 5505, 5427):** exercise the cart/order hot paths that the caching epic touched — add/update/remove line, apply/remove coupon, change shipment/payment, place order — and assert **correctness before performance**: every mutation is reflected on the immediately-following read (no stale XCart), and repeated reads under the request-scoped cache never serve a superseded aggregate. Validator-singleton change: drive concurrent cart/order/catalog validations and confirm no state bleed between requests. Treat any stale-read/leaked-state observation as a Critical bug.
- **Sales Rep — new module & hub (VCST-4907/5304/5293/5409/5469/5494):** for a sales-rep user, verify My Sales Reps contact info (storefront widget + scoped xAPI), the reorganized left rail + My Customers list scoped to the authenticated rep, customer profile, and dashboard; in the embedded Admin app confirm the Sales Rep role gates visible sections. Guard the misrouting bug: a rep **with no org membership** must see an empty/no-access state, **not** a redirect to Dashboard.
- **Search — indexing reliability & i18n (VCST-5416/5559/5497/5324):** trigger indexation under concurrent/repeat runs — no `IndexOutOfRangeException`, no permanently-stuck "Indexation already in progress", and storefront order history is populated afterwards; remove-docs + suggestions never emits a malformed index name; Contacts custom date-range filter returns results (no Azure-AI-Search 500); non-default-language ShortText property filter returns matches (not 0).
- **Cart — Configurable Products (VCST-5391/5079/5077/5076):** editing a configurable line from the cart reprices without the `extendedPrice` error; full PDP-configurator→cart→checkout E2E per section type; guest→auth cart merge preserves configuration state; seed dataset covers every section type.

**High domains (run in parallel with critical):**
- UI-kit / BEM: token-equality + aspect-ratio oracle on VcAlert/VcChip/VcButton/VcIcon/VcTable (always screenshot, even on PASS — `feedback_sized_control_token_aspect_oracle`); **post-BEM selector/data-test-id + visual regression sweep** across product/cart/catalog pages (048b + smoke).
- Catalog assets/PDP/mapping: per-store Asset Public URL resolves in xAPI asset links (store-configured URL, not raw internal path); PDP admin blade — no widget overlap, Prices widget present; catalog-mapping picker excludes categories.
- Platform Settings & Security: dictionary setting clears to empty and persists across reload; CVE-2026-47304 — crafted XML payload no longer bypasses encryption; org-role command extension point preserves out-of-box behavior.

**Medium domains (after critical/high pass):** Page Builder preview-language + publish-banner + toolbar layout; loyalty in-cart validation text timing; change-password logout redirect; export-download after permission rename; contacts popover mutual-exclusion.

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| XCart/Order caching (VCST-5303) | Non-functional BVA + Error Guessing | cache-hit threshold; mutate-then-read stale-cache paths |
| XCart cache invalidation (VCST-5505) | Error Guessing | mutate-then-read race across add/remove/qty/coupon |
| Validator singletons (VCST-5427) | Error Guessing | concurrent-request validator state bleed |
| Sales Rep contact info (VCST-5409/4907) | EP | contact-info field present/absent; schema field coverage |
| Sales Rep My Customers / left rail (VCST-5469/5304) | Classification Tree | nav item × page state; rep role × visible entity |
| Sales Rep role gating (VCST-5293) | Decision Table | role × visible section (embedded app) |
| Sales Rep no-membership routing (VCST-5494) | Error Guessing | no-org-membership → empty state, not redirect |
| Indexation crash (VCST-5416) | Error Guessing | concurrent indexation trigger; stuck-state recovery |
| Invalid index name (VCST-5559) | Error Guessing | remove-docs + suggestions sequence |
| Contacts date-range 500 (VCST-5497) | BVA | date-range boundary × timezone offset |
| i18n property filter (VCST-5324) | EP | default vs non-default language × ShortText filter |
| Configurable cart edit (VCST-5391) | Error Guessing | edit config line → no missing-`extendedPrice` error |
| Configurable E2E/xAPI (VCST-5079/5077/5076) | Pairwise + Error Guessing | section type × option count; cart merge with configured lines |
| Design tokens (VCST-5460/5459/5506/4400) | Token-equality + aspect oracle | sized-control token+aspect, always screenshot |
| VcTable states (VCST-4984) | Classification Tree | selection × empty/error state × consumer |
| BEM migration (VCST-5071/5070) | Error Guessing | selector/data-test-id churn regression sweep |
| Per-store asset URL (VCST-5089) | EP | store-configured vs default URL substitution |
| PDP widget layout (VCST-5471) | Visual / geometry | widget tile overlap; Prices widget presence |
| Catalog mapping (VCST-5318) | Decision Table | entity type (product/item/category) × allowed/disallowed |
| Platform-settings clear (VCST-5441) | BVA | empty vs whitespace vs populated dictionary value |
| CVE .NET (VCST-5522) | Error Guessing | crafted XML encryption-bypass payload |
| Org-role handler extend (VCST-5435) | Error Guessing | extension-point regression guard |
| Page Builder preview i18n (VCST-5219) | EP | page language × preview render / no 404 |
| Publish banner (VCST-5515) | State Transition | dirty → publish → clean |
| Preview-as-user toolbar (VCST-5430) | Boundary / geometry | long-email overflow |
| Loyalty in-cart text (VCST-5365) | State Transition | balance state → validation text before Place Order |
| Change-password logout (VCST-5438) | Error Guessing | logout mid-flow → safe redirect |
| Export download (VCST-5542) | Error Guessing | legacy permission mapping after rename |
| Contacts popover overlap (VCST-5495) | Error Guessing | concurrent popover mutual-exclusion |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> **Scope note:** Sales Rep is **not** suite-less — `config/test-suites.json` already carries dedicated Sales Rep suites (`089` My Customers, `090` My Sales Reps, `091` Customer Profile, `092` Admin Embedded App, `050m` scoped `/graphql/sales-rep`). All Sales Rep tickets extend these rather than proposing new suites.

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 042 | Smoke Tests | Cross-cutting | Always-on (+ VCST-5522 security-patch sanity, VCST-5416 index-crash regression sanity) | P0 |
| 028 | Cart Core | Cart | VCST-5391, VCST-5505, VCST-5365 | P0 |
| 029 | Cart Validation & Persistence | Cart | VCST-5505 (cache-invalidation cross-ref) | P2 |
| 030 | Cart Merge | Cart | VCST-5077 | P1 |
| 072 | Configurable Products UI | Configurable Products | VCST-5391, VCST-5079 | P1 |
| 072b | Configurable Products E2E | Configurable Products | VCST-5079, VCST-5077, VCST-5076 | P1 |
| 083b | Loyalty Mixed Cart Order | Loyalty | VCST-5365 | P1 |
| 089 | Sales Rep — My Customers (storefront) | Sales Rep | VCST-5469, VCST-5494, VCST-5304 | P1 |
| 090 | Sales Rep — My Sales Reps (storefront) | Sales Rep | VCST-5409, VCST-4907 | P1 |
| 091 | Sales Rep — Customer Profile (storefront) | Sales Rep | VCST-5409 (contact-info cross-ref) | P2 |
| 001 | Catalog Navigation | Catalog | VCST-5071 (BEM) | P2 |
| 002 | Product Detail | Catalog | VCST-5089, VCST-5471 (cross-ref) | P2 |
| 003 | Catalog Filters | Catalog | VCST-5324, VCST-5071 | P1 |
| 048b | Layout Stability | UI Kit / Cross-cutting | VCST-5460, 5459, 4984, 4400, 5506, 5071, 5070 | P1 |
| 045 | Accessibility Tests | UI Kit | VCST-5460, 5459 | P2 |
| 010 | B2B Bulk Ship Dashboard | B2B | VCST-4984 (VcTable) | P2 |
| 014 | Orders Frontend | Orders | VCST-5416 (order-history cross-check), VCST-4984 | P2 |
| 032 | Auth Session & RBAC | Auth | VCST-5438 (cross-ref) | P2 |
| 033 | Auth Company & Account Menu | Auth | VCST-5438 | P1 |
| 044 | Security Tests | Cross-cutting | VCST-5522 | P1 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 078 | Backend Smoke Tests | Cross-cutting | Always-on (+ VCST-5303/5427 perf, VCST-5522 security, VCST-5416 indexation) | P0 |
| 049 | Platform API | Platform | VCST-5522, VCST-5303 | P0 |
| 061 | Search Indexing Admin | Search | VCST-5416, VCST-5559, VCST-5497, VCST-5324 | P0 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | xCart | VCST-5303, VCST-5505 | P1 |
| 050b3 | GraphQL xCart — Shipment/Payment/Merge/Remove | xCart | VCST-5505, VCST-5303 | P1 |
| 050c | GraphQL xOrder | xOrder | VCST-5303 | P2 |
| 050i | GraphQL Configurable Products | xCatalog | VCST-5391, VCST-5077 | P1 |
| 050a | GraphQL xCatalog | xCatalog | VCST-5324 | P1 |
| 050m | GraphQL xAPI — Sales Rep (scoped) | Sales Rep | VCST-4907, VCST-5304, VCST-5293 | P1 |
| 050n | GraphQL Store Asset URL | Store / xAPI | VCST-5089 | P1 |
| 092 | Sales Rep — Admin Embedded App | Sales Rep | VCST-5304, VCST-5293 | P1 |
| 026 | Customer Contacts | Customer | VCST-5497, VCST-5495 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-5435 | P2 |
| 027b | Customer Org-Scoped Roles | Customer | VCST-5441, VCST-5435 | P1 |
| 051 | Catalog Admin Products | Catalog | VCST-5471, VCST-5318 | P1 |
| 052 | Configurable Products Admin | Configurable Products | VCST-5076 | P2 |
| 034 | Store Management | Store | VCST-5089 (per-store URL config) | P2 |
| 064 | CSV Import Export | Platform-config | VCST-5542, VCST-5318 | P1 |
| 020 | Platform Users Roles & Settings | Platform | VCST-5441, VCST-5542 | P1 |
| 063 | Core Settings | Platform | VCST-5441 (cross-ref) | P2 |
| 059 | Page Builder | CMS | VCST-5219 | P2 |
| 060 | Page Builder — Design & Content | CMS | VCST-5515, VCST-5430, VCST-5219 | P2 |

### 5.2 Coverage Gaps — New Test Cases Needed

> **Candidate BL invariants implied by this sprint (not yet canonical — promote via a follow-up `/qa-review-bl` run before citing as canonical):** BL-CART-016 (xCart cache invalidation on mutation), BL-SRCH-008 (Azure-Search DateTimeOffset range filter must be timezone-qualified), BL-B2B-012 (Sales Rep with no org membership gets an empty/no-access state, not a misrouted redirect), BL-CAT-013 (per-store Asset Public URL substitution in xAPI asset links). Carried forward, still unconfirmed from Sprint 26-13: BL-SRCH-006 (facet sort direction), BL-CAT-009 (featured-sort ordering), BL-SRCH-007 (multilingual ShortText filter).
>
> **Tickets with no existing suite:** none this sprint — every ticket, including the Sales Rep domain, extends an existing suite (see the §5.1 scope note). No new single-case suites proposed.

| Gap ID | Ticket(s) | Description (BL-* ref) | Target Suite(s) | Owner |
|--------|-----------|------------------------|-----------------|-------|
| GAP-01 | VCST-5303, VCST-5427 | Request-scoped caching across x-cart/x-catalog/customer/pricing/tax/platform speeds up XCart ops & order creation without introducing stale reads; FluentValidation validators registered as singletons don't leak state across concurrent requests (BL-CROSS-002 adjacent) | 050b1 (extend), 050b3 (extend), 050c (extend), 078 (extend) | qa-backend-expert |
| GAP-02 | VCST-5505 | XCart cache invalidates correctly on every cart mutation (add/remove/qty/coupon) — no stale-read window (BL-CART-016 candidate) | 050b1 (extend), 050b3 (extend), 028 (extend) | qa-backend-expert + qa-frontend-expert |
| GAP-03 | VCST-4907, VCST-5409 | Org member "My Sales Reps" contact info resolves correctly via the scoped xAPI and renders on the storefront widget | 050m (extend), 090 (extend) | qa-backend-expert + qa-frontend-expert |
| GAP-04 | VCST-5304, VCST-5469 | Sales Rep left-rail reorganization + "My Customers" page shows the correct nav structure and a customer list scoped to the authenticated rep | 089 (extend), 092 (extend) | qa-frontend-expert + qa-backend-expert |
| GAP-05 | VCST-5293 | Sales Rep Role gates visible sections in the VC-Shell embedded Admin app (BL-AUTH-006 adjacent) | 092 (extend) | qa-backend-expert |
| GAP-06 | VCST-5494 | "My customers" hub link does NOT redirect a rep with no org membership to Dashboard — shows an empty/no-access state instead (BL-B2B-012 candidate) | 089 (extend) | qa-frontend-expert |
| GAP-07 | VCST-5416 | Indexation no longer throws `IndexOutOfRangeException` under concurrent access; "Indexation already in progress" doesn't get permanently stuck; storefront order history isn't left empty after a crash (BL-SRCH-003, BL-CROSS-009) | 061 (extend), 078 (extend), 014 (extend, order-history cross-check) | qa-backend-expert |
| GAP-08 | VCST-5559 | Removing docs + requesting suggestions never sends an invalid index name to the search engine | 061 (extend) | qa-backend-expert |
| GAP-09 | VCST-5497 | Contacts Created/Modified custom date-range filter emits a timezone-qualified `DateTimeOffset` literal to Azure AI Search — no 500 (BL-SRCH-008 candidate) | 026 (extend), 061 (extend) | qa-backend-expert |
| GAP-10 | VCST-5324 | Regression re-verification: multilingual ShortText property filter continues returning matches in non-default languages (BL-SRCH-007 candidate, carried from Sprint 26-13) | 003 (extend), 050a (extend) | qa-backend-expert |
| GAP-11 | VCST-5391 | Regression re-verification: editing a configurable product from the cart (`changeCartConfiguredItem`) still reprices without an `extendedPrice` resolution error (BL-CART-010) | 050i (extend), 072 (extend) | qa-backend-expert |
| GAP-12 | VCST-5079, VCST-5077, VCST-5076 | Configurable Products E2E/dataset completion: PDP configurator → cart → checkout per section type; xAPI cart merge preserves configuration-item state; seed dataset covers every section type (BL-CART-014, BL-CART-012) | 072 (extend), 072b (extend), 050i (extend), 030 (extend) | qa-frontend-expert + qa-backend-expert |
| GAP-13 | VCST-5460, VCST-5459 | VcAlert/VcChip design-token migration: token-equality + aspect-ratio oracle, always-screenshot, no visual regression (BL-UI-001..003) | 048b (extend), 045 (extend) | ui-ux-expert |
| GAP-14 | VCST-4984 | VcTable row selection + default empty/error state renders correctly on every consumer (B2B lists/dashboard, orders grids) | 048b (extend), 010 (extend), 014 (extend) | ui-ux-expert + qa-frontend-expert |
| GAP-15 | VCST-4400 | VcIcon solid vs. outline variant renders at correct size/weight across consumers (BL-UI-001) | 048b (extend) | ui-ux-expert |
| GAP-16 | VCST-5506 | VcButton hover state shows no token/aspect regression (sized-control token+aspect oracle) | 048b (extend) | ui-ux-expert |
| GAP-17 | VCST-5071, VCST-5070 | Tailwind→BEM migration on product/cart/catalog components: no selector/`data-test-id` breakage, no visual regression | 048b (extend), 001/002/003 (extend), 028/029/030 (extend), 042 (extend) | ui-ux-expert + qa-frontend-expert |
| GAP-18 | VCST-5089 | Per-store Asset Public URL substitutes correctly in xAPI asset links (resolves to the store-configured public URL, not a raw internal path) (BL-CAT-013 candidate) | 050n (exact match), 034 (extend), 002 (extend) | qa-backend-expert |
| GAP-19 | VCST-5471 | Admin product-edit blade: widget tiles don't overlap and the Prices widget doesn't disappear (blade layout regression, BL-UI-004) | 051 (extend) | qa-backend-expert |
| GAP-20 | VCST-5318 | Catalog mapping UI allows linking products/items only — categories are excluded from the picker (data-integrity guard) | 051 (extend), 064 (extend) | qa-backend-expert |
| GAP-21 | VCST-5441 | A dictionary-type platform setting can be cleared to an empty value and the empty state persists after reload (relates BL-B2B-011 clear-to-empty precedent) | 020 (extend), 027b (extend), 063 (extend) | qa-backend-expert |
| GAP-22 | VCST-5522 | CVE-2026-47304 .NET XML-encryption bypass is patched — a crafted XML payload no longer bypasses encryption (security regression guard) | 044 (extend), 049 (extend), 078 (extend) | qa-backend-expert |
| GAP-23 | VCST-5435 | `ChangeOrganizationContactRoleCommandHandler` extension point doesn't alter existing org-role-change behavior for out-of-box scenarios (regression guard on BL-B2B-008) | 027 (extend), 027b (extend) | qa-backend-expert |
| GAP-24 | VCST-5219 | Regression re-verification: designer preview honors page language; language switch doesn't 404 (carried from Sprint 26-13) | 059 (extend), 060 (extend) | qa-backend-expert |
| GAP-25 | VCST-5515 | "Has changes" banner clears correctly after a clean Publish (no stale-dirty state) | 060 (extend) | qa-backend-expert |
| GAP-26 | VCST-5430 | Regression re-verification: preview-as-user toolbar doesn't overlap/clip for long email addresses (BL-UI-004, carried from Sprint 26-13) | 060 (extend) | qa-backend-expert + ui-ux-expert |
| GAP-27 | VCST-5365 | Regression re-verification: cart shows loyalty insufficient-balance validation text before Place Order is clicked (BL-LOY-008 UI-surfacing, carried from Sprint 26-13) | 028 (extend), 083b (extend) | qa-frontend-expert |
| GAP-28 | VCST-5438 | Logging out from the Change Password page redirects an anonymous user to a safe landing page — no stranded state (BL-AUTH-007 adjacent) | 033 (extend), 032 (extend) | qa-frontend-expert |
| GAP-29 | VCST-5542 | Generated exports remain downloadable after BackupRestore renames the `platform:export`/`platform:import` permission values (legacy permission re-registration honored) | 064 (extend), 020 (extend) | qa-backend-expert |
| GAP-30 | VCST-5495 | Contacts admin: filter-panel and row "⋮" menu popovers are mutually exclusive — opening one closes any other open popover | 026 (extend) | qa-backend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

| Ticket | Layer(s) | Case Type | Suggested Count | Target Suite | Technique |
|--------|---------|-----------|----------------|-------------|-----------|
| VCST-5303 | GraphQL (xCart/xOrder) + REST | P1 Story (perf regression guard) | 6 | 050b1 (2), 050b3 (2), 050c (1), 078 (1) | Non-functional BVA (cache-hit threshold) + Error Guessing (stale-cache paths) |
| VCST-5505 | GraphQL (xCart) + Storefront | P1 Bug fix (verify) | 5 | 050b1 (2), 050b3 (1), 028 (2) | Error Guessing (mutate-then-read race) |
| VCST-5427 | REST / Backend | P2 TechDebt | 4 | 078 (2), 017 (1), 026 (1) | Error Guessing (concurrent-request validator state bleed) |
| VCST-5409 | Storefront | P1 Story | 4 | 090 (4) | EP (contact-info field present/absent) |
| VCST-4907 | GraphQL (scoped sales-rep) | P1 Story | 4 | 050m (4) | EP (schema field coverage) |
| VCST-5469 | Storefront | P1 Story | 5 | 089 (5) | Classification Tree (nav item × page state) |
| VCST-5304 | Backend (Admin embedded app) + GraphQL | P1 Story | 5 | 092 (3), 050m (2) | Classification Tree (rep role × visible entity) |
| VCST-5293 | Backend (Admin embedded app) | P2 Story | 3 | 092 (3) | Decision Table (role × visible section) |
| VCST-5494 | Storefront | P1 Bug fix (verify) | 3 | 089 (3) | Error Guessing (no-org-membership state) |
| VCST-5416 | Backend Admin | P0 Bug fix (verify) | 6 | 061 (4), 078 (1), 014 (1) | Error Guessing (concurrent indexation trigger) |
| VCST-5559 | Backend Admin | P1 Bug fix | 3 | 061 (3) | Error Guessing (remove-docs + suggestions sequence) |
| VCST-5497 | Backend Admin + REST | P0 Bug fix (verify) | 5 | 026 (3), 061 (2) | BVA (date-range boundary × timezone offset) |
| VCST-5324 | Storefront + GraphQL | P1 Bug fix (regression verify) | 3 | 003 (1), 050a (2) | EP (default vs. non-default language) |
| VCST-5391 | GraphQL (xAPI) | P1 Bug fix (regression verify) | 3 | 050i (2), 072 (1) | Error Guessing |
| VCST-5079 | Storefront + E2E | P1 Story (verify) | 5 | 072 (2), 072b (3) | Pairwise (section type × option count) |
| VCST-5077 | GraphQL | P1 Story | 4 | 050i (2), 030 (2) | Error Guessing (cart merge w/ configured lines) |
| VCST-5076 | Backend (data) | P2 Story | 3 | 052 (3) | Classification Tree (section × option type coverage) |
| VCST-5460 | UI Kit / Storefront | P2 Story | 3 | 048b (2), 045 (1) | Token-equality + aspect oracle |
| VCST-5459 | UI Kit / Storefront | P2 Story | 3 | 048b (2), 045 (1) | Token-equality + aspect oracle |
| VCST-4984 | UI Kit / Storefront | P2 Story | 4 | 048b (2), 010 (1), 014 (1) | Classification Tree (selection × empty/error state) |
| VCST-4400 | UI Kit / Storefront | P2 Story | 2 | 048b (2) | Visual/geometry (icon variant × size) |
| VCST-5506 | UI Kit / Storefront | P2 Bug fix | 2 | 048b (2) | Visual/geometry (token+aspect oracle) |
| VCST-5071 | UI Kit / Storefront | P2 TechDebt | 3 | 048b (1), 001/002/003 (2) | Error Guessing (selector churn sweep) |
| VCST-5070 | UI Kit / Storefront | P2 TechDebt | 3 | 048b (1), 028/029/030 (2) | Error Guessing (selector churn sweep) |
| VCST-5089 | GraphQL + Backend | P1 Story | 5 | 050n (3), 034 (1), 002 (1) | EP (store-configured vs. default URL) |
| VCST-5471 | Admin | P1 Bug fix | 3 | 051 (3) | Visual/geometry (widget layout) |
| VCST-5318 | Admin | P2 Story | 4 | 051 (2), 064 (2) | Decision Table (entity type × allowed/disallowed) |
| VCST-5441 | Admin | P1 Bug fix | 3 | 020 (2), 027b (1) | BVA (empty vs. whitespace vs. populated) |
| VCST-5522 | Backend / Security | P0 Bug fix (verify) | 4 | 044 (2), 049 (1), 078 (1) | Error Guessing (crafted XML payload) |
| VCST-5435 | Backend | P2 TechDebt | 3 | 027 (2), 027b (1) | Error Guessing (extension-point regression guard) |
| VCST-5219 | Admin | P2 Bug fix (regression verify) | 2 | 059 (1), 060 (1) | EP (page language × preview) |
| VCST-5515 | Admin | P2 Bug fix | 2 | 060 (2) | State Transition (dirty → publish → clean) |
| VCST-5430 | Admin | P2 Bug fix (regression verify) | 2 | 060 (2) | Boundary/geometry (long-email overflow) |
| VCST-5365 | Storefront | P1 Story (verify) | 2 | 028 (1), 083b (1) | State Transition (balance state → validation text) |
| VCST-5438 | Storefront | P1 Bug fix | 3 | 033 (2), 032 (1) | Error Guessing (logout mid-flow) |
| VCST-5542 | Admin | P1 Bug fix | 3 | 064 (2), 020 (1) | Error Guessing (legacy permission mapping) |
| VCST-5495 | Admin | P2 Bug fix | 2 | 026 (2) | Error Guessing (concurrent popover state) |

**Total new cases estimated: 115–140** (P0 ~15: VCST-5416/5497/5522 · P1 ~65–75 · P2 ~40–50). Lower bound consolidates cross-ref/regression-verification cases into their primary suite; upper bound fully decomposes each decision-table/pairwise/classification-tree row.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- [ ] All Sprint 26-14 PRs deployed to QA — `vc-frontend` artifact (#2343, #2375, #2376, #2370, #2369, #2363, #2373, #2368, #2362, #2358, #2378, #2380, #2383, #2387, #2390, #2393, #2382, #2386, #2388) + `vc-platform` build (#3056, #3073, #3078, #3080, #3082, #3084) + module-repo fixes (sales-rep, azure-search, customer, x-cart, x-api, x-catalog, order, pricing, tax, catalog, backup-restore, store, pagebuilder) confirmed via `packages.json` / `artifact.json` (verify artifact version, not merge status)
- [ ] QA environment health check passes: `{BACK_URL}/health` returns all services healthy (note: `/health`, not `/api/platform/healthcheck`)
- [ ] **Search index rebuilt and healthy** on the env — required before VCST-5416/5559/5497/5324 and before any catalog-browse/order-history assertion (allow 30–60s indexing lag)
- [ ] Sales Rep test users seeded: a rep **with** org membership + served customers, and a rep **with no** org membership (for the VCST-5494 no-access path); `@td()` sales-rep aliases resolve (`reference_sales_rep_membership_equals_served_customer`)
- [ ] Configurable-products seed dataset present (VCST-5076) for VCST-5391/5079/5077; a cart holding a configurable line for the edit-reprice path
- [ ] A store with a **non-default Asset Public URL** configured for VCST-5089; a product with assets to resolve
- [ ] Multilingual catalog data: a ShortText property with non-default-language values (VCST-5324); a multi-language Page Builder page (VCST-5219)
- [ ] Contacts with Created/Modified dates spanning a custom range for VCST-5497
- [ ] A dictionary-type platform setting with values to clear-to-empty for VCST-5441
- [ ] Loyalty (points) product + standard product for a mixed-currency cart with an insufficient balance (VCST-5365); balance relative to `LOY_SKU_PTS_UNIT` (not resettable — `project_loyalty_balance_cannot_be_reset`)
- [ ] MCP browsers available (close Chrome windows before `playwright-chrome`; `locale: en-US` set); use Edge/Chrome — not Firefox — for checkout completion (`feedback_firefox_cart_dropdown_quirk`)

### 7.2 Exit Criteria

- [ ] All P0 cases executed with 100% pass (042, 078, 049, 061, 028)
- [ ] All P1 cases executed with ≥95% pass
- [ ] Zero Critical/Blocker open bugs in scope domains; specifically: **XCart/order caching shows no stale-read or state-bleed** (VCST-5303/5505/5427), **search indexation is crash-free and order history populates** (VCST-5416), **configurable-cart edit crash stays fixed** (VCST-5391), and the **Sales Rep no-membership path shows an empty state, not a Dashboard redirect** (VCST-5494)
- [ ] Security verified: CVE-2026-47304 XML-encryption bypass closed (VCST-5522)
- [ ] Sales Rep new surfaces verified end-to-end (My Sales Reps, My Customers, customer profile, dashboard, embedded Admin role gating)
- [ ] UI-kit visual baselines re-captured post design-token + BEM migration (VCST-5460/5459/4984/4400/5506/5071/5070); 048b layout-stability green
- [ ] New cases for the Critical/High GAPs generated and in Draft status
- [ ] RTM updated to ≥95% coverage for in-scope tickets

---

## 8. Test Data Requirements

| Data Need | Source | Notes |
|-----------|--------|-------|
| Rebuilt/healthy search index | Admin → Search Indexing | Prereq for VCST-5416/5559/5497/5324 and all catalog-browse/order-history checks |
| Sales Rep users — with & without org membership | Customer / Sales Rep module + `@td()` | VCST-5469/5494/5409/4907/5304; no-membership user for the redirect guard (`reference_sales_rep_membership_equals_served_customer`) |
| Configurable products + sections + options seed + a cart with a configured line | VCST-5076 dataset | VCST-5391/5079/5077 |
| Store with non-default Asset Public URL + product assets | Admin → Stores | VCST-5089 asset-link substitution |
| ShortText property with non-default-language values | Admin → Catalog | VCST-5324 i18n filter |
| Multi-language Page Builder page | Page Builder / CMS | VCST-5219 preview language + no 404 |
| Contacts spanning a custom Created/Modified date range | Admin → Contacts | VCST-5497 date-range filter |
| Dictionary-type platform setting with values | Admin → Settings | VCST-5441 clear-to-empty |
| Loyalty (points) + standard product, insufficient-balance mixed cart | Loyalty module / Catalog | VCST-5365; balance relative to `LOY_SKU_PTS_UNIT`, not resettable |
| Export-generating data + a user without the renamed export permission | Admin → Import/Export | VCST-5542 legacy permission mapping |
| Non-Coffee Red Theme 4 preset (context for BEM/token sweep) | Store theme presets (`reference_theme_presets`) | VCST-4226 / GAP-17 (only Coffee is WCAG-clean — `feedback_a11y_coffee_only`) |

All variables resolved at runtime via `{{VAR}}` or `@td(ALIAS.field)`. No hardcoded IDs, SKUs, emails, prices, or order numbers (`feedback_flexible_test_cases`).

---

## 9. Schedule and Milestones

| Milestone | Target Date | Owner |
|-----------|------------|-------|
| Sprint 26-14 deployment confirmed on QA (module baseline + search index rebuilt) | 2026-07-24 | DevOps |
| Test plan created | 2026-07-24 (this document) | test-management-specialist |
| Critical verifications — XCart/order caching (5303/5505/5427), search indexation (5416/5497/5559), configurable-cart crash (5391), Sales Rep hub (5494 + surfaces) | 2026-07-25 – 2026-07-28 | qa-backend-expert + qa-frontend-expert |
| High verifications — UI-kit tokens/BEM, catalog assets/PDP/mapping, platform-settings/security | 2026-07-28 – 2026-07-29 | qa-frontend-expert + qa-backend-expert + ui-ux-expert |
| New test-case generation — Critical/High GAPs | 2026-07-29 – 2026-07-30 | test-management-specialist |
| P0 + P1 regression run | 2026-07-30 – 2026-07-31 | regression-orchestrator |
| P2 regression run (Page Builder, admin modules, auth, loyalty) | 2026-07-31 – 2026-08-01 | regression-orchestrator |
| New test cases review and promotion (Draft → Reviewed) | 2026-08-01 | qa-lead-orchestrator |
| Final sign-off / go-no-go | 2026-08-04 | qa-lead-orchestrator |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser | Mode |
|--------|-------|---------|------|
| Storefront UI: Sales Rep hub, cart/configurable, loyalty, catalog, change-password, BEM sweep | qa-frontend-expert | playwright-chrome | Interactive + Regression |
| Admin SPA: Sales Rep embedded app, search indexing, catalog admin/mapping, PDP blade, Page Builder, contacts, export, platform settings | qa-backend-expert | playwright-edge / Chrome DevTools | Interactive + Regression |
| GraphQL xAPI: xCart/xOrder caching, `changeCartConfiguredItem`, scoped sales-rep, store asset URL, i18n filter | qa-backend-expert | `scripts/graphql/graphql-runner.ts` | Interactive |
| REST API: request-scoped caching, validator singletons, CVE/security, platform settings, org-role handler | qa-backend-expert | playwright-edge / Postman MCP | Interactive |
| UI-kit design tokens (VcAlert/VcChip/VcTable/VcIcon/VcButton) + BEM migration, layout-stability, baselines | ui-ux-expert | Chrome DevTools MCP | Interactive |
| Test case generation + plan | test-management-specialist | playwright-chrome (exploration only) | Planning |
| Regression orchestration | regression-orchestrator | 3-slot pool (chrome/firefox/edge) | Regression |

**Max 3 concurrent browser agents.** Use Edge/Chrome (not Firefox) for checkout completion (`feedback_firefox_cart_dropdown_quirk`). Never share a browser session between parallel agents.

---

## 11. JIRA Ticket Coverage Matrix

| Key | Summary | Type | Domain | Existing Suite Coverage | New Tests Needed | Owner |
|-----|---------|------|--------|------------------------|-----------------|-------|
| VCST-5303 | Improve XCart/Order performance (caching) | Story (High) | Platform Perf / Cart | 050b1/050b3/050c, 078 (perf-blind) | GAP-01: 6 | qa-backend-expert |
| VCST-5505 | XCart cache not invalidated on cart change | Bug | Cart / GraphQL | 050b1/050b3, 028 (none targeted) | GAP-02: 5 | qa-backend-expert + qa-frontend-expert |
| VCST-5427 | Validators re-constructed per call → singletons | TechDebt (perf) | Platform / Perf | 078 (smoke) | (folded GAP-01): 4 | qa-backend-expert |
| VCST-5409 | My Sales Reps contact info (FE) | Story (High) | Sales Rep | 090 | GAP-03: 4 | qa-frontend-expert |
| VCST-4907 | My Sales Reps contact info (xAPI) | Story (High) | Sales Rep / GraphQL | 050m | GAP-03: 4 | qa-backend-expert |
| VCST-5469 | Sales Rep left rail + My Customers (FE) | Story | Sales Rep | 089 | GAP-04: 5 | qa-frontend-expert |
| VCST-5304 | Sales Rep left rail + My Customers (BE) | Story | Sales Rep / Admin | 092, 050m | GAP-04: 5 | qa-backend-expert |
| VCST-5293 | Sales Rep Role — VC-Shell app | Story (Low) | Sales Rep / Admin | 092 | GAP-05: 3 | qa-backend-expert |
| VCST-5494 | "My customers" hub link misroutes no-membership rep | Bug | Sales Rep / B2B | 089 (none) | GAP-06: 3 | qa-frontend-expert |
| VCST-5416 | Indexation crash + stuck + empty order history | Bug (High) | Search / Platform | 061, 078, 014 (none targeted) | GAP-07: 6 | qa-backend-expert |
| VCST-5559 | Invalid index name on remove/suggest | Bug | Search | 061 (none) | GAP-08: 3 | qa-backend-expert |
| VCST-5497 | Contacts date-range 500 (Azure AI Search) | Bug (High) | Search / Customer | 026, 061 (none) | GAP-09: 5 | qa-backend-expert |
| VCST-5324 | i18n ShortText filter 0 results | Bug | Catalog / Search | 003, 050a (carried) | GAP-10: 3 | qa-backend-expert |
| VCST-5391 | Config-cart edit `extendedPrice` error | Bug | Cart / Config Products | 050i, 072 (carried) | GAP-11: 3 | qa-backend-expert |
| VCST-5079 | Config products storefront E2E | Story (High) | Configurable Products | 072/072b | GAP-12: 5 | qa-frontend-expert |
| VCST-5077 | Config products xAPI + cart merge | Story (High) | Config Products / GraphQL | 050i, 030 | GAP-12: 4 | qa-backend-expert |
| VCST-5076 | Config products seed dataset | Story (High) | Configurable Products / Data | 052 | GAP-12: 3 | qa-backend-expert |
| VCST-5460 | Design tokens VcAlert | Story | UI Kit | 048b, 045 | GAP-13: 3 | ui-ux-expert |
| VCST-5459 | Design tokens VcChip | Story | UI Kit | 048b, 045 | GAP-13: 3 | ui-ux-expert |
| VCST-4984 | VcTable row selection + empty state | Story | UI Kit | 048b, 010, 014 | GAP-14: 4 | ui-ux-expert + qa-frontend-expert |
| VCST-4400 | VcIcon solid & outline | Story | UI Kit | 048b | GAP-15: 2 | ui-ux-expert |
| VCST-5506 | VcButton hover issues | Bug | UI Kit | 048b | GAP-16: 2 | ui-ux-expert |
| VCST-5071/5070 | BEM Tailwind→BEM [5]/[4] | TechDebt | UI Kit / Structural | 048b, 001/002/003, 028/029/030, 042 | GAP-17: 6 | ui-ux-expert + qa-frontend-expert |
| VCST-5089 | Per-store Asset Public URL (xAPI) | Story (High) | Catalog / Assets | 050n, 034, 002 | GAP-18: 5 | qa-backend-expert |
| VCST-5471 | PDP widget tiles overlap / Prices missing | Bug | Catalog / Admin | 051 (none) | GAP-19: 3 | qa-backend-expert |
| VCST-5318 | Catalog mapping products/items only | Story | Catalog / Admin | 051, 064 | GAP-20: 4 | qa-backend-expert |
| VCST-5441 | Platform-settings dictionary clear-to-empty | Bug | Platform Settings / B2B | 020, 027b, 063 (none) | GAP-21: 3 | qa-backend-expert |
| VCST-5522 | CVE-2026-47304 .NET XML-encryption bypass | Bug (High, sec) | Platform / Security | 044, 049, 078 (none) | GAP-22: 4 | qa-backend-expert |
| VCST-5435 | Org-role command handler extendable | TechDebt | B2B / Customer | 027, 027b | GAP-23: 3 | qa-backend-expert |
| VCST-5219 | Designer preview i18n / 404 | Bug | Page Builder / CMS | 059, 060 (carried) | GAP-24: 2 | qa-backend-expert |
| VCST-5515 | Stale "Has changes" banner after publish | Bug (Low) | Page Builder / Admin | 060 (none) | GAP-25: 2 | qa-backend-expert |
| VCST-5430 | Preview-as-user toolbar layout | Bug (Low) | Page Builder / Admin | 060 (carried) | GAP-26: 2 | qa-backend-expert + ui-ux-expert |
| VCST-5365 | In-cart loyalty validation text | Story | Loyalty | 028, 083b (carried) | GAP-27: 2 | qa-frontend-expert |
| VCST-5438 | Change-password logout no redirect | Bug | Auth | 033, 032 (none) | GAP-28: 3 | qa-frontend-expert |
| VCST-5542 | Exports not downloadable after perm rename | Bug | Admin / Import-Export | 064, 020 (none) | GAP-29: 3 | qa-backend-expert |
| VCST-5495 | Contacts filter/menu popover overlap | Bug (Low) | Admin / Customer | 026 (none) | GAP-30: 2 | qa-backend-expert |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

For every P0/P1 ticket spanning storefront + backend, verify all of the following before marking Done:

- [ ] STOREFRONT: UI state correct (visual, labels, interaction)
- [ ] CONSOLE: No JS errors in browser console
- [ ] NETWORK: No unexpected 4xx/5xx responses
- [ ] API/GraphQL: Data persisted and returned correctly (**and no stale read** after a mutation — VCST-5303/5505)
- [ ] ADMIN: Back-office reflects the storefront change (where applicable)
- [ ] SEARCH: Re-indexing completed if catalog data changed (allow 30-60s lag); order history populated post-index (VCST-5416)

Applies to: VCST-5303/5505 (XCart caching), VCST-5416/5497 (search indexation + contacts), VCST-4907/5304/5409/5469/5494 (Sales Rep full stack), VCST-5391/5079/5077 (configurable in cart), VCST-5089 (per-store asset URL), VCST-5324 (i18n filter), VCST-5522 (security).

---

## 13. References

- Sprint 26-14 vc-frontend PRs (in window 2026-07-13→07-24): #2343 (VCST-5126 UCP carryover), #2375 (VCST-5438), #2376 (VCST-5444), #2370 (VCST-5071), #2369 (VCST-5070), #2363 (VCST-5219), #2373 (VCST-4226), #2368 (VCST-5365), #2362 (VCST-4984), #2358 (VCST-5405), #2378 (VCST-5409), #2380 (VCST-5469/5308), #2383 (VCST-5308 Sales Rep profile), #2387 (VCST-5460), #2390 (VCST-5455), #2393 (VCST-5516), #2382 (VCST-4400), #2386 (VCST-5459/5506), #2388 (VCST-5485 Sales Rep dashboard); backend-package chore: #2381
- Sprint 26-14 module/platform PRs (in window, by ticket):
  - **XCart/Order perf (VCST-5303/5468/5556):** vc-module-x-cart #134, vc-module-x-catalog #101, vc-module-customer #307/#311, vc-module-pricing #234, vc-module-tax #57, vc-platform #3084, vc-module-x-api #76, vc-module-sales-rep #5
  - **XCart cache (VCST-5505):** vc-module-x-cart #135
  - **Validator singletons (VCST-5427):** vc-module-customer #306, vc-module-order #501, vc-module-catalog #897, vc-platform #3073
  - **Sales Rep (VCST-4907/5304/5308):** vc-module-sales-rep #2/#3, vc-module-x-api #76
  - **Search (VCST-5559/5497):** vc-module-azure-search #56, vc-module-customer #308/#310
  - **Backup-restore export (VCST-5542):** vc-module-backup-restore #4
  - **Assets (VCST-5089):** vc-module-store #171, vc-module-x-api #77, vc-module-x-catalog #104
  - **Catalog mapping (VCST-5318):** vc-module-catalog #898
  - **PDP widget / Security / deps (VCST-5471/5522/5498):** vc-platform #3078/#3082/#3080
  - **Page Builder banner (VCST-5515):** vc-module-pagebuilder #156
  - **Background jobs (VCST-5245):** vc-platform #3056
  - Release bundle bumps: vc-modules #50/#51/#52/#53 (v14/v15/latest Platform + Assets Store URL absorb)
- Module → Suite map: `.claude/knowledge/execution/module-suite-map.md`
- BL invariants: `.claude/knowledge/oracles/business-logic.md` (BL-CART-*, BL-SRCH-*, BL-CAT-*, BL-B2B-*, BL-AUTH-*, BL-LOY-*, BL-UI-*, BL-CROSS-*) — candidate BL-CART-016 / BL-SRCH-008 / BL-B2B-012 / BL-CAT-013 pending a `/qa-review-bl` promotion
- Relevant memories: `reference_sales_rep_membership_equals_served_customer` (Sales Rep scoping), `project_org_role_whitelist_filters_admin` (VCST-5441 clear-to-empty precedent), `reference_configurable_items_always_separate_lines` / `project_remove_configuration_item_noop_bug` (configurable cart), `feedback_sized_control_token_aspect_oracle` (UI-kit token/aspect oracle), `reference_platform_rest_needs_context_free_admin_token` (search/contacts REST), `project_storefront_default_language_fallback` (VCST-5219 preview i18n), `project_loyalty_balance_cannot_be_reset` (VCST-5365), `feedback_firefox_cart_dropdown_quirk`, `feedback_a11y_coffee_only`
- Risk framework: `.claude/skills/qa-methodology/qa-risk/risk-prioritization-framework.md`
- Suite manifest: `config/test-suites.json`
- Test case template: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- Test data: `test-data/` (config-products seed, sales-rep users, per-store asset URL, cards via `@td()` / `{{VAR}}`)
