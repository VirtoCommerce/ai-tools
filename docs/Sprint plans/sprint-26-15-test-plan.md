# Sprint 26-15 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-08-07
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-07-27 – 2026-08-10

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-15 (JIRA sprint name: `VCST Sprint 26-15`, board 126, state **active**) |
| Date range | 2026-07-27 – 2026-08-10 — **the sprint has not closed yet**; scope below is cut off at **2026-08-07** |
| Sprint goal (from JIRA) | 1. UCP · 2. Page Builder — Shared Sections · 3. Roles + Membership · 4. Red Theme · 5. Sales Rep Hub · One Shell |
| Theme | The **Sales Rep Hub** lands end-to-end — dashboard + statistics BE/FE, customer profile with sales widgets and top-products, drag-and-drop **saved layout**, per-widget settings (max rows / status tabs), rep→customer **email + push messaging**, and list publishing to a customer — with a stored-XSS fix on the messaging mutation. In parall: a **platform security/auth cluster** (admin API 302→401, an "API-only user" back-office sign-in gate, two sanitizer/DoS CVEs), a **request-scoped-caching sweep merged into ~25 module repos**, the reworked **admin Notification editor** plus its four follow-up defects, **multi-org invite + membership-derived employee status**, a Page Builder publish **data-loss** fix, cart defects on **mixed/loyalty carts and coupons**, dark **red.dark / mercury** presets, and a large `vc-shell` **WCAG 2.2 accessibility** pass |
| Total issues in sprint | 166 |
| Delivered (Done category, excl. Cancelled) | **66** — 23 Story · 21 Bug · 17 Task · 1 TechDebt · 4 Review task |
| Test-relevant delivered tickets | **45** (17 product Stories + 21 Bugs + ~7 test-impact Task/TechDebt) |
| Merged frontend PRs (in window) | **19** in `vc-frontend` (#2352, #2392, #2394, #2395, #2399, #2400, #2401, #2403, #2404, #2405, #2407, #2408, #2411, #2412, #2413, #2418, #2420, #2422, #2425) |
| Merged module/platform PRs (in window) | **54** code PRs across ~35 `vc-module-*` / `vc-platform` repos (excludes 22 `vc-deploy-dev` manifest PRs and 2 `vc-modules` bundle bumps), **plus 23 `vc-shell`** + 4 `vendor-portal` framework PRs |
| Environment at plan time | vcst-qa @ Platform assembly line **3.1057.0**, 87 modules, 4,523 store products (`sitemap.md` rev 6, refreshed by Step 0 of this run) |

> **Note on workflow statuses:** scope is taken from issues in the **Done** category (Story + Bug → §2.1/§2.2; Task/TechDebt/Review task → §2.3). *To do / In progress / In review / Ready for test / REFINEMENT / Reopen / On hold* are treated as not deliverable and excluded (§2.4), as are the 4 **Cancelled** items. Because the sprint is still open, tickets may still move into Done after 2026-08-07 — re-run `/qa-test-plan 26-15` after sprint close if the delta matters.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Priority | Summary | Domain | Delivery |
|-----|----------|---------|--------|----------|
| VCST-5532 | High | [Security] Restrict admin back-office sign-in independently of API permissions ("API-only user") | Platform Security & Auth | `vc-platform` #3092 |
| VCST-5485 | Medium | [FE] [Sales Rep] Hub Dashboard | Sales Rep | `vc-frontend` #2395 |
| VCST-5362 | Medium | [BE] [Sales Rep] Hub Dashboard | Sales Rep | `vc-module-sales-rep` #4 |
| VCST-5309 | Medium | [BE] [Sales Rep] View customer sales data page (MTD/YTD orders, AOV, $ and % vs last year) | Sales Rep | `vc-module-sales-rep` #4 |
| VCST-5308 | Medium | [BFE] [Sales Rep] View customer profile (sales widgets, orders, quick actions, top products, customer info) | Sales Rep | `vc-module-sales-rep` #4 |
| VCST-5368 | Medium | [Sales Rep] Customer profile — Top products purchased (by $ / by qty, windowed) | Sales Rep | `vc-module-sales-rep` #4 |
| VCST-5367 | Medium | [BFE] [Sales Rep] Hub + customer profile — drag-and-drop and **save layout** (Member dynamic properties) | Sales Rep | `vc-frontend` #2400 |
| VCST-5649 | Medium | [FE] [Sales Rep] Widget settings — max rows (1–20) + Recent-Orders status tabs | Sales Rep | `vc-frontend` #2425 |
| VCST-5310 | Medium | [Sales Rep] Push messages & emails to customers (msg ≤1000 chars, URL clickable, email → all members, push → storefront) | Sales Rep | `vc-frontend` #2392 |
| VCST-5331 | Medium | [Org member] Get email and push from the Rep | Sales Rep / Notifications | module + theme |
| VCST-5332 | Medium | [BFE] [Sales Rep] [Lists] Publish list to customer ("Sales Rep recommends", add-to-cart, multi-customer share) | Sales Rep / Lists | `vc-frontend` #2405 |
| VCST-5281 | Medium | Organization Invite and Status for Multi Organization customers | B2B Organizations | `vc-frontend` #2399, `profile-experience-api` #141, `customer` #312 |
| VCST-5433 | Medium | [Dark] Implement red.dark preset | Theming | `vc-frontend` #2407 |
| VCST-5452 | Medium | [Dark] Update mercury dark theme | Theming | `vc-frontend` #2407 |
| VCST-5557 | Medium | Improve Notification Editor (tabbed workspace, live preview, JSON editor, autocomplete, full-screen, localization) | Notifications | `vc-module-notification` #202 |
| VCST-4368 | Medium | [Lists] Change x-cross to UI kit one | Lists / UI Kit | `vc-frontend` |
| VCST-5192 | Medium | [AI Powered Demo] Front page alteration (Builder.io) | CMS / Homepage | Builder.io content |

**Not product surface — excluded from §6:** VCST-5509 (vc-fix self-diagnostics subsystem, this tooling repo) and the five AI-demo agent skills VCST-5467 / 5394 / 5393 / 5307 / 5194.

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain | Delivery |
|-----|----------|---------|--------|----------|
| VCST-5618 | **Highest** | Admin API returns 302 → login instead of 401 when the session expires (regression since Platform 3.1027.0) | Platform Security & Auth | `vc-platform` #3093 |
| VCST-5657 | High | [Mixed cart] Place order active when only loyalty products are selected | Cart & Checkout | `vc-module-loyalty` #15, `vc-frontend` #2420 |
| VCST-5558 | High | [Sales Rep] Stored XSS / HTML injection — `sendCustomerCommunication` title & message unescaped (admin Preview executes; email HTML injection) | Sales Rep / Security | `vc-module-sales-rep` |
| VCST-5554 | High | `GET /api/order/dashboardStatistics` → 500 `InvalidCastException` (String→Boolean); Admin Home KPI cards blank | Orders Admin | `vc-platform` #3089 |
| VCST-5604 | High | Notification editor: a single Ctrl+Z on a freshly opened template wipes the whole body | Notifications | `vc-module-notification` |
| VCST-5513 | High | [Vulnerability] AngleSharp mXSS (CVE-2026-54570) — HtmlSanitizer bumped | Platform Security | `vc-module-catalog` #902 |
| VCST-5417 | High | [Page Builder] Published page loses ALL content after rename → save → publish (irreversible live data loss) | Page Builder / CMS | `vc-module-pagebuilder` #151 |
| VCST-5518 | Medium | [Cart][Coupons] Applying an invalid coupon over a working one silently drops the working coupon (no rollback) | Cart & Checkout | `vc-frontend` #2422 |
| VCST-5589 | Medium | Statistics widgets serve stale cached data — update only after a full page refresh | Sales Rep | `vc-frontend` #2412 |
| VCST-5586 | Medium | Statistics widgets show empty values inconsistently — must render `0` | Sales Rep | `vc-frontend` #2408 |
| VCST-5615 | Medium | Pages index rebuild intermittently indexes 0 documents and reports success | Page Builder / Indexing | `vc-module-pages` #19 |
| VCST-5610 | Medium | Notification live preview → HTTP 500 on in-progress Liquid; generic toast hides the blade close button | Notifications | `vc-module-notification` |
| VCST-5543 | Medium | Wrong iframe width in Notification Preview | Notifications | `vc-module-notification` |
| VCST-5534 | Medium | [Price Lists] `PUT /api/products/{productId}/prices` silently orphans a Price row when nested `Price` omits `productId` | Pricing | `vc-module-pricing` #236 |
| VCST-5598 | Medium | [vc-shell] Expired session not detected when the platform answers 302/HTML instead of 401 | Admin SPA / vc-shell | `vc-shell` #270 |
| VCST-5617 | Medium | [vc-shell] Generated apps start with empty `html lang` and pinch-zoom disabled (WCAG 3.1.1 A / 1.4.4 AA) | Admin SPA / A11y | `vc-shell` #274 |
| VCST-5602 | Medium | [vendor-portal] Empty `html lang` and disabled pinch-zoom | Vendor Portal / A11y | `vendor-portal` |
| VCST-5514 | Medium | VcSelect button focus issue | UI Kit | `vc-frontend` #2411 |
| VCST-5574 | Medium | [UI-Kit] Icons look weird on 404 / 500 pages | UI Kit | `vc-frontend` #2401 |
| VCST-5608 | Low | Notification editor: Ctrl+Q code folding throws a TypeError, fold gutter dead | Notifications | `vc-module-notification` |
| VCST-5428 | Low | Admin console error `parentBlade.refresh is not a function` + unhandled rejection on every Facets save | Catalog Admin | `vc-module-catalog` #901 |

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Summary | Test impact |
|-----|---------|-------------|
| VCST-5468 | Resolve `IMediator` from request scope in x-api GraphQL + request-scoped cache primitive | **Merged into ~25 module repos** — the single broadest blast radius this sprint; every xAPI read path is in scope |
| VCST-5637 | Deduplicate product search within a request in x-catalog (overridable seam) + `vc-platform` #3095 streaming JSON content hash for cache keys | Catalog/search read correctness under dedup; cache-key collisions |
| VCST-5556 / VCST-5603 / VCST-5627 | Reuse platform `IRequestScopedCache` in Customer `MemberResolver`; add `IRequestScopedCacheAccessor` (drops Hangfire dep); capture the cache change token **before** the load | Member/contact resolution staleness; mutate-then-read races |
| `vc-platform` #3077 | Fix user cache corruption on update | Auth/user-profile staleness after edit |
| VCST-5579 | [Mixed cart] Display warnings in order summary widget | Cart warning surface — pairs with VCST-5657 |
| VCST-4855 | Separate component for Saved for Later (drops `ListDetails`/`useWishlists` dependency) | Selector/data-test-id churn on Saved-for-Later + Lists |
| VCST-5412 / VCST-5530 | [vc-shell] accessibility + bundle-size improvements; keyboard shortcuts | Admin SPA keyboard/a11y regression sweep; 23 unlinked `vc-shell` PRs ride along |
| VCST-5519 | Update dependencies (major versions), `vc-frontend` #2394 | Storefront-wide regression risk from major bumps |
| VCST-4772 | [Security] AutoMapper DoS (uncontrolled recursion) in customer-review | Review submission/rendering paths |
| VCST-5349 | [E2E auto-test][Page Builder] add pages with blocks to dataset | Enables the VCST-5417 publish-content dataset |
| VCST-5583 | Export Migration Scripts (system-operations) | Admin export flow |
| VCST-5159 | Register `vc-frontend` application as plugin host (`x-api` #78, `x-frontend` #8) | Storefront bootstrap / plugin registration |

### 2.4 Out of Scope

- **95 sprint issues not in a Done state** at 2026-08-07 (To do / In progress / In review / Ready for test / REFINEMENT / On hold) — the sprint is still open; they are not deliverable in this plan. Notably VCST-5544 ("Logging in UCP") sits at *Ready for test* and VCST-5568 ("Regression test on QA (only theme)-15") is *In progress*.
- **4 Cancelled:** VCST-5651 (cart fails to load after adding a loyalty item — duplicate of the VCST-5657 cluster), VCST-5272 (input `id`/label association), VCST-5458 / VCST-5572 (load-test tasks), VCST-5569 (minor dependency bumps).
- **Internal tooling / no product surface:** VCST-5509 (vc-fix self-diagnostics), VCST-5225 / VCST-5636 (Agentic QA tasks in this repo), VCST-5493 (RabbitMQ for background jobs in Virto Cloud — infra), the 4 Review tasks (VCST-5389 / 5573 / 5576 / 5584), and the 37 `vc-mcp-testing-module` PRs merged in the window.
- **AI Powered Demo skills** (VCST-5467 / 5394 / 5393 / 5307 / 5194) — demo agent skills, no storefront/admin surface. VCST-5192 (Builder.io front page) **is** in scope as CMS content.
- **Environment/ops tasks:** VCST-5454, VCST-5456, VCST-5567, VCST-5570 (module updates, smoke/regression scheduling) — process, not product.

---

## 3. Risk Assessment

Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`, grouped by **domain**.

| Domain | L | I | Score | Level | Rationale |
|--------|:-:|:-:|:-----:|-------|-----------|
| **Platform Security & Auth** (5618, 5532, 5513, 4772, + `vc-platform` #3077) | 4 | 5 | **20** | Critical | Auth is the P0 gate for every admin+API surface. 5618 changes the unauthenticated response contract (302→401) that clients branch on; 5532 adds a *new* sign-in gate that can lock legitimate operators out; two sanitizer/DoS CVEs land in the same window |
| **Platform perf & request-scoped caching** (5468, 5637, 5556, 5603, 5627, #3077) | 4 | 5 | **20** | Critical | One change merged into ~25 module repos + a new cache-key hash. Failure mode is a **stale or cross-request-leaked read**, which is silent and reads as a data bug anywhere in the storefront |
| **Sales Rep — Hub / Profile / Layout / Statistics / Messaging** (5485, 5362, 5309, 5308, 5368, 5367, 5649, 5310, 5331, 5332, 5558, 5589, 5586) | 5 | 4 | **20** | Critical | 13 concurrent tickets on one young module, incl. a **stored XSS** and two statistics-correctness bugs; layout + widget settings both persist to the same `settings` contract |
| **Cart & Checkout** (5657, 5518, 5579, + PR #2352 CVV, #2420) | 4 | 5 | **20** | Critical | P0 revenue path. Two silent-wrong-state defects: an order that must be blocked can be placed; a valid coupon disappears on an invalid re-apply |
| **Admin SPA / vc-shell framework + A11y** (5598, 5617, 5602, 5412, 5530, 5514 + 23 unlinked `vc-shell` PRs) | 5 | 3 | **15** | High | The largest unlinked change volume in the sprint lands in the shared shell every module's Admin UI renders through |
| **Notifications editor** (5557, 5604, 5610, 5543, 5608) | 4 | 3 | **12** | High | A full blade rework plus **four** defects already found against it — including a one-keystroke content-destroying bug |
| **B2B Organizations & Membership** (5281, `profile-experience-api` #141/#142, 5331) | 3 | 4 | **12** | High | Employee status is now *derived* from Organization Membership; invite now targets existing customers across multiple orgs |
| **Page Builder / CMS + Pages indexing** (5417, 5615, 5349, 5192) | 3 | 4 | **12** | High | 5417 is irreversible **live content loss**; 5615 reports indexing success while indexing nothing |
| **Pricing / Price Lists** (5534) | 2 | 5 | **10** | High | Silently orphaned Price rows corrupt pricing data; low likelihood, maximum blast radius |
| **Lists & Saved for Later** (5332, 4368, 4855) | 3 | 3 | **9** | Medium | Component extraction + UI-kit swap on a page that also receives rep-shared lists |
| **Orders Admin dashboard** (5554) | 2 | 3 | **6** | Medium | Admin landing KPI cards; order management itself unaffected |
| **Theming — dark presets & UI Kit icons** (5433, 5452, 5574) | 3 | 2 | **6** | Medium | Palette-only change, but the dark ramp is inverted (shade 50 = darkest) — a wrong-direction fix is easy to ship |
| **Catalog Admin** (5428) | 2 | 3 | **6** | Medium | Console error + unhandled rejection on Facets save; save itself succeeds |
| **AI Powered Demo / Builder.io homepage** (5192 + demo skills) | 2 | 2 | **4** | Low | Demo content; homepage copy/layout only |

**Cross-browser (`qa-testing-expert`) pass is mandatory for all four Critical domains.** Never schedule a click-driven suite on `playwright-firefox` (`.claude/rules/agents.md`) — queue for a chrome/edge slot instead.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Platform Security & Auth | Yes | Yes | Yes | — | — | — |
| Platform perf & request-scoped caching | Yes | — | Yes | Yes | — | — |
| Sales Rep — Hub / Profile / Messaging | Yes | Yes | — | Yes | — | — |
| Cart & Checkout | Yes | — | — | Yes | — | Yes |
| Admin SPA / vc-shell + A11y | — | Yes | — | — | Yes | — |
| Notifications editor | — | Yes | Yes | — | — | — |
| B2B Organizations & Membership | Yes | Yes | Yes | Yes | — | — |
| Page Builder / CMS + indexing | Yes | Yes | Yes | — | — | — |
| Pricing / Price Lists | Yes | Yes | Yes | Yes | — | — |
| Lists & Saved for Later | Yes | — | — | Yes | — | — |
| Orders Admin dashboard | — | Yes | Yes | — | — | — |
| Theming — dark presets & UI Kit | Yes | — | — | — | Yes | — |
| Catalog Admin | — | Yes | Yes | — | — | — |
| Builder.io homepage | Yes | — | — | — | — | Yes |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**

- **Platform Security & Auth (5618, 5532, 5513, 4772).** With an *expired/absent* admin session, every `/api/**` call must answer **401** with no `Location` header — assert the status code and the absence of the redirect, not just "the UI showed a login screen"; the storefront-side and `vc-shell`-side twins (VCST-5598) must both detect it. For VCST-5532, drive the full decision table of *is-administrator × has-any-permission × new admin-sign-in flag*: an "API-only" user keeps its API permissions but is refused the back-office UI, while every existing operator who could sign in before still can (the regression risk is a lockout, not a leak). CVE fixes: re-run the crafted-payload probes (annotation-xml mXSS via sanitized HTML fields; deep-recursion AutoMapper payload on customer-review) and confirm rejection without a 500.
- **Platform perf & request-scoped caching (5468 + 5637 + 5556/5603/5627).** Correctness before performance. For each touched read path (catalog/product search, cart, order, quote, customer/member, pricing, CMS), do **mutate → immediately read** and assert the read reflects the mutation; then repeat the same read twice in one request and assert one dependency call, not a stale second answer. Drive two different users/orgs concurrently against member-resolving endpoints and assert **zero cross-request bleed** (this is the failure the request-scoped cache would produce). The x-catalog dedup seam needs a paired positive/negative control per `/qa-perf-measure` — a count that does not drop is a finding, not a pass.
- **Sales Rep — Hub / Profile / Layout / Statistics / Messaging.** As an authenticated rep: hub dashboard renders every widget with real data; customer profile shows sales widgets (MTD/YTD orders, AOV, $ and % vs last-year same period), orders recent-first, top products by $ **and** by qty over each window, quick actions, customer info. **VCST-5586 is the assertion to hold everywhere:** an absent metric renders `0`, never blank — and VCST-5589 means a mutation must be visible **without a full page refresh**. Layout: drag-and-drop → Save → reload → the layout survives; Reset restores defaults; a rep with **no saved layout** still gets the registry default (never an empty hub). Widget settings (VCST-5649): max-rows BVA at 0 / 1 / 20 / 21 and non-numeric, Recent-Orders status tabs with **all boxes unchecked** (the "All" tab must remain), unknown/missing setting keys falling back to registry defaults. Messaging: message length boundary at 1000/1001, a URL rendered clickable, Email → every member of that customer receives it, Push → storefront push, and **VCST-5558's XSS payload in both title and message must render as inert text** in the admin journal Preview *and* in the delivered email. List publish (VCST-5332): shared list appears to the customer as "Sales Rep recommends", every item is add-to-cart-able, and a multi-customer share is tracked per customer.
- **Cart & Checkout (5657, 5518, 5579).** Loyalty-only selection must **block** Place Order with "Add a regular product to check out." — and the guard must hold at the *selection* level (regular items present but unselected), which is exactly the case that shipped broken; VCST-5579's order-summary warnings are the surface that now carries it, so assert the warning text is visible, not merely that the button is disabled. Coupons: apply a valid coupon, then an invalid one — the valid coupon **survives** and totals are unchanged (remove-then-validate with no rollback was the defect); also valid→valid replace, invalid-first, and expired.

**High domains (run in parallel with the Critical set):**

- **Admin SPA / vc-shell + A11y:** `html lang` is non-empty and matches the selected UI language, pinch-zoom/`user-scalable` is not suppressed (WCAG 1.4.4 AA), keyboard operability across menu items, breadcrumb overflow trigger, adornments and the dashboard widget rearrange/resize; axe-core at **WCAG 2.2** on login + a representative blade; `vc-data-table` mobile card view (scrolling, expandable rows, declared column widths). The 23 unlinked `vc-shell` PRs make this a **regression sweep, not a feature check** — run it on the Admin SPA suites in full.
- **Notifications editor:** Ctrl+Z on a freshly opened template is a **no-op** (VCST-5604 — the highest-value single assertion in this domain), an in-progress/invalid Liquid preview surfaces a readable error while the blade close button stays reachable, the preview iframe fills its pane at each breakpoint, Ctrl+Q folding works, and the tabbed layout keeps template + sample JSON usable together with variable autocomplete and localized strings.
- **B2B Organizations & Membership (5281):** employee status is derived from the membership row (not the global contact status — see the DV-022 fixture rule in `.claude/rules/test-data.md`: lock/unlock/role-change needs `@td(MULTI_ORG_TF_BR.*)`, not `{{MULTI_ORG_USER_EMAIL}}`); inviting an **existing** customer into a second org creates a membership without duplicating the contact; statuses agree across storefront Company Members, xAPI, and the Admin SPA.
- **Page Builder / CMS + indexing (5417, 5615):** rename (Name and/or Permalink) → Save → Publish on a page **with content blocks** keeps every block live — verify on the published storefront URL, not only in the editor; then re-publish twice more. Pages index rebuild either indexes a non-zero document count or **reports failure** — a "success with 0 documents" is the bug. Builder.io homepage (5192): hero/CTA targets resolve (the known `/soda` 404 stays tracked).
- **Pricing (5534):** `PUT /api/products/{productId}/prices` with the nested `Price.productId` omitted must either populate it or reject — never persist an orphan row; re-read the price list and the storefront PDP price after the write.

**Medium/Low (after Critical + High pass):** Orders Admin dashboard KPI cards populate (no 500 on `dashboardStatistics`) across setting-value shapes; dark **red.dark** + mercury presets — token/contrast audit remembering the **inverted dark ramp** (shade 50 = darkest, so "brighter on hover" means a *higher* shade); UI-kit icons on 404/500 and `VcSelect`/`VcMenuItem` focus; Facets save leaves a clean console; Saved for Later + Lists selector/data-test-id sweep after the component extraction and the x-cross swap.

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| Admin session expiry → 401 (5618, 5598) | Decision Table + Error Guessing | session state × endpoint × expected status/`Location` |
| API-only user (5532) | Decision Table | is-administrator × permissions held × admin-sign-in flag |
| Sanitizer / DoS CVEs (5513, 4772) | Error Guessing (attack payloads) | crafted `annotation-xml` mXSS; deep-recursion mapping payload |
| Request-scoped cache sweep (5468, 5556, 5603, 5627) | Error Guessing + State Transition | mutate-then-read staleness; cross-request state bleed |
| x-catalog search dedup (5637) | Dependency-count A/B with paired controls | a count that doesn't drop is a finding, not a pass |
| Sales Rep statistics (5309, 5362, 5586, 5589) | EP + BVA | zero / partial / full data; `0` vs empty; window boundaries; stale-after-mutation |
| Saved layout (5367) | State Transition | default → dragged → saved → reloaded → reset |
| Widget settings (5649) | BVA + Pairwise | max-rows 0/1/20/21/non-numeric × widget; status-tab subsets incl. none checked |
| Rep messaging (5310, 5331) | BVA + Decision Table | message length 1000/1001; channel (email/push) × recipient membership |
| Stored XSS (5558) | Error Guessing (payload injection) | payload in title **and** message → inert in admin Preview + email |
| List publish (5332) | Classification Tree | list state × 1 vs many customers × add-to-cart from shared list |
| Loyalty-only cart (5657, 5579) | Decision Table | selected line types (loyalty / regular / mixed) × Place Order enabled × warning shown |
| Coupon rollback (5518) | State Transition | valid → invalid → state after; valid→valid; invalid-first; expired |
| Multi-org invite & status (5281) | Decision Table + EP | membership status × org count × surface (storefront/xAPI/admin) |
| Page publish after rename (5417) | State Transition | published → renamed → saved → published (blocks preserved) |
| Pages reindex (5615) | Error Guessing | repeat/concurrent rebuild → non-zero count or explicit failure |
| Price nested-object write (5534) | EP | `productId` present / omitted / mismatched |
| Notification editor undo (5604, 5608) | Error Guessing | first-keystroke undo on untouched template; fold shortcut |
| Notification preview (5610, 5543) | EP + Boundary/geometry | valid / in-progress / invalid Liquid; iframe width per breakpoint |
| vc-shell a11y (5617, 5602, 5412, 5530) | Checklist (WCAG 2.2 AA) + keyboard walk | `lang`, zoom, hit areas, keyboard operability, accessible names |
| Dark presets (5433, 5452) | Token-equality + contrast oracle | inverted dark ramp; always screenshot, even on PASS |
| UI Kit icons / focus (5574, 5514) | Visual / geometry | 404–500 icon render; focus ring on select/menu item |
| Orders dashboard 500 (5554) | EP | setting value shapes (string/bool/empty) → converter |
| Facets save console (5428) | Error Guessing | console clean on save; no unhandled rejection |
| Saved for Later extraction (4855, 4368) | Error Guessing | selector/data-test-id churn regression sweep |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> Classified by the CSV's **layer directory**, not by JIRA component. All 63 ids below exist in `config/test-suites.json` and their CSVs are present on disk (verified this run). All Sales Rep work extends the existing `089`/`090`/`091`/`093` (Frontend) + `050m`/`092`/`092b` (Backend) suites — no new Sales Rep suite is needed. `048b` (referenced by the Sprint 26-14 plan) was retired; its runner-native replacement **`048c`** is used throughout.

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite ID | Name | Module | Sprint trigger (VCST keys) | Priority |
|----------|------|--------|----------------------------|----------|
| 002 | Product Detail | Catalog | 5513 (sanitized HTML descriptions), 5368 (top-product row → PDP) | P1 |
| 003 | Catalog Filters | Catalog | 5428, 5637 | P2 |
| 004 | Search Core | Search | 5637, 5615 | P1 |
| 006 | B2B Organization | B2B / Customer | 5281 | P1 |
| 007 | B2B Lists & Shared | B2B / Lists | 5332, 5331, 4855, 4368 | P1 |
| 008 | B2B Members | B2B / Customer | 5281 | P1 |
| 011 | Checkout Flow | Checkout | 5657, 5579 | P2 |
| 011b | B2B Company E2E | B2B | 5281 | P2 |
| 014 | Orders Frontend | Orders | 5468, 5637 (cache regression sweep) | P2 |
| 028 | Cart Core | Cart | 5657, 5518, 5579, 4855 | P0 |
| 029 | Cart Validation & Persistence | Cart | 5657, 5518, 5579 | P1 |
| 031 | Auth Login & Register | Auth | 5281 (invite existing customer) | P1 |
| 032 | Auth Session & RBAC | Auth | 5618, 5598, 5532 (storefront cross-ref) | P1 |
| 033 | Auth Company & Account Menu | Auth | 5281 (org status / switcher) | P1 |
| 042 | Smoke Tests | Cross-cutting | Always-on (+ 5519 dep-bump sanity, 5192, 5574) | P0 |
| 044 | Security Tests | Cross-cutting | 5558, 5513, 5532 | P0 |
| 045 | Accessibility Tests | Cross-cutting / UI kit | 5617, 5602, 5412 (storefront-side cross-ref) | P1 |
| 048c | Layout Stability (runner-native) | UI kit / Cross-cutting | 5574, 5514, 4368, 5452, 5433, 5192 | P1 |
| 071 | Whitelabeling Branding | Whitelabeling / Theming | 5452, 5433 | P2 |
| 077 | Coupons & Promotions Storefront | Marketing | 5518 | P1 |
| 077b | Coupons & Promotions — Cart Sidebar | Marketing | 5518 | P1 |
| 083 | Loyalty Catalog Browsing | Loyalty | 5657 (precursor) | P2 |
| 083b | Loyalty Mixed Cart Order | Loyalty | 5657, 5579 | P0 |
| 089 | Sales Rep — My Customers (storefront) | Sales Rep | 5362, 5310, 5586, 5589 | P1 |
| 090 | Sales Rep — My Sales Reps (storefront) | Sales Rep | 5331, 5589 | P2 |
| 091 | Sales Rep — Customer Profile (storefront) | Sales Rep | 5308, 5309, 5368, 5649, 5367, 5310, 5586, 5589 | P1 |
| 093 | Sales Rep — Hub Dashboard (storefront) | Sales Rep | 5485, 5649, 5367, 5362, 5586, 5589 | P0 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite ID | Name | Module | Sprint trigger (VCST keys) | Priority |
|----------|------|--------|----------------------------|----------|
| 017 | Orders Admin Management | Orders | 5554 | P1 |
| 020 | Platform Users Roles & Settings | Platform | 5532, 5618, `vc-platform` #3077 | P0 |
| 021 | Platform Dynamic Properties | Platform | 5367 (layout in Member dynamic properties) | P1 |
| 026 | Customer Contacts | Customer | 5281, 5556, 5603 | P1 |
| 027 | Customer Orgs & Invites | Customer | 5281 | P0 |
| 027b | Customer Org-Scoped Roles | Customer | 5281 (status derived from membership) | P1 |
| 049 | Platform API | Platform | 5618, 5532, 5554, 5627, 5534 | P0 |
| 050a | GraphQL xCatalog | xCatalog | 5637, 5468 | P0 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | xCart | 5468, 5657 | P1 |
| 050b3 | GraphQL xCart — Shipment/Payment/Merge/Remove | xCart | 5468, 5518 | P1 |
| 050c | GraphQL xOrder | xOrder | 5468, 5637 | P1 |
| 050d | GraphQL xProfile | xProfile | 5281, 5468 | P1 |
| 050e | GraphQL xFrontend (pageContext) | xFrontend | 5159 | P2 |
| 050f | GraphQL xCMS | xCMS | 5417, 5468 | P2 |
| 050g | GraphQL Cross-Cutting | xAPI (~25 modules) | 5468, 5637, 5627, 5159 | P0 |
| 050h | GraphQL Wishlist | xAPI / Lists | 5332, 4855 | P1 |
| 050l | GraphQL xAPI — Push Messages | Push Messages | 5310, 5331, 5332 | P1 |
| 050m | GraphQL xAPI — Sales Rep (scoped) | Sales Rep | 5558, 5649, 5367, 5368, 5309, 5308, 5310 | P0 |
| 051 | Catalog Admin Products | Catalog | 5428, 5513 | P1 |
| 053 | Catalog Admin Categories | Catalog | 5428 | P2 |
| 054 | Pricing Logic | Pricing | 5534 | P1 |
| 055 | Pricing Management | Pricing | 5534 | P1 |
| 057 | Notifications Templates | Notifications | 5557, 5604, 5610, 5608, 5543 | P0 |
| 058 | Notifications Triggers | Notifications | 5557, 5331, 5310 | P1 |
| 059 | Page Builder | CMS / Page Builder | 5417, 5349 | P0 |
| 060 | Page Builder — Design & Content | CMS / Page Builder | 5417, 5349 | P1 |
| 061 | Search Indexing Admin | Search / Pages | 5615, `vc-module-search` dep bumps | P0 |
| 063 | Core Settings | Platform | 5554 (safe setting value converter) | P1 |
| 064 | CSV Import Export | Import/Export | 5583 | P2 |
| 068 | Push Messages | Push Messages | 5310, 5331, 5332 | P1 |
| 075 | Loyalty | Loyalty | 5657 | P1 |
| 075b | Loyalty Mixed Cart Order | Loyalty | 5657, 5579 | P0 |
| 078 | Backend Smoke Tests | Cross-cutting | Always-on (+ 5468/5637, 5519, 5513/4772) | P0 |
| 086 | Customer Reviews GraphQL (xAPI) | Customer Reviews | 4772, 5468 | P2 |
| 092 | Sales Rep — Admin / VC-Shell App | Sales Rep | 5558 (admin journal Preview XSS), 5367, 5598 | P0 |
| 092b | Sales Rep — Admin Embedded App | Sales Rep | 5558, 5412, 5530, 5598 | P1 |

### 5.2 Coverage Gaps — New Test Cases Needed

> **Two blockers to settle before execution.** (1) **No suite owns the `vc-shell` / vendor-portal surface** — `092b` covers only the *Sales Rep* embedded app, not the framework. GAP-16/GAP-17 propose two new CSVs under `regression/suites/Backend/vc-shell/`; manifest ids must be assigned via `suites:append` + `suites:sync` (deliberately **not** invented here). (2) **GAP-30** — the Sales Rep statistics cases already in `093`/`091`/`050m` cannot ground `{OBSERVED}` on the current thin seed, because `order.createdDate` is server-assigned; MTD/YTD, prev-month, last-year and multi-currency assertions stay unverifiable until `test-data-engineer` supplies a past-period baseline strategy.
>
> **Candidate BL invariants implied by this sprint** (marked `*` below — **not canonical**; promote via `/qa-review-oracles bl` before citing in a case): **BL-AUTH-017** admin back-office sign-in is a per-user gate independent of API permissions · **BL-SR-033** per-block widget `settings` are scalar-only flattened keys, unknown/missing → registry default · **BL-SR-034** rep-authored title/message stored escaped, never executing in admin Preview or outbound email · **BL-NOTIF-008** an in-progress-Liquid preview is a field-level error, never a 500 + blade-blocking toast · **BL-PRICE-009** a nested `Price` omitting `productId` is rejected, never persisted as an orphan · **BL-SRCH-006** a rebuild indexing 0 documents reports failure · **BL-CMS-001** rename→save→publish carries content blocks into the new inner version.

| Gap ID | Ticket(s) | What has no suite today | Target suite | Owner |
|--------|-----------|-------------------------|--------------|-------|
| GAP-01 | 5532 | The new per-user "can sign into admin UI" gate: API-only user passes API permission checks yet is refused the Admin SPA; flag toggled mid-session; interaction with existing RBAC | 020, 049, 044, 032 (cross-ref) | qa-backend-expert |
| GAP-02 | 5618, 5598 | 401-vs-302 cases landed last sprint (BL-AUTH-014) — still uncovered is the **vc-shell consumer half**: the shell's interceptor detecting a 302/HTML answer | 049/020 (verify) + new `Backend/vc-shell/vc-shell-framework-core.csv` | qa-backend-expert |
| GAP-03 | 5649 | Widget settings model: max-rows 1–20, per-widget defaults, status checkboxes with the always-present "All" tab, scalar-only flattened persistence, unknown key → default | 093, 091, 050m | test-management-specialist → qa-frontend/backend-expert |
| GAP-04 | 5368 | Top-products by-$ vs by-qty ranking divergence, window selection, row click → PDP | 091, 050m | qa-backend-expert + qa-frontend-expert |
| GAP-05 | 5367 | The **dynamic-property storage** half of saved layout: survives reload + re-auth, per-rep isolated, full-document replace not merge | 021, 093/091 (verify) | qa-backend-expert |
| GAP-06 | 5558 | Stored-XSS regression guard on `sendCustomerCommunication`: stored escaped, admin Preview inert, outbound email not injectable | 050m, 092, 044 | qa-backend-expert |
| GAP-07 | 5310, 5331 | Delivery matrix end-to-end: message mandatory + 1000-char cap, URL clickable, Email → **all** org members, Push → storefront inbox, per-member channel | 089, 091, 068, 050l, 058 | qa-backend-expert + qa-frontend-expert |
| GAP-08 | 5332 | Publish-list-to-customer: action-wheel share, rep's custom message, "Sales Rep recommends" label, items add-to-cart-able, multi-customer tracking | 007, 050h, 068 | qa-frontend-expert |
| GAP-09 | 5281 | Membership-derived employee status + inviting an **existing** customer into an extra org, cross-layer. Fixture caution: use `@td(MULTI_ORG_TF_BR.email)`, not `{{MULTI_ORG_USER_EMAIL}}` (DV-022) | 027, 027b, 026, 050d, 006/008/011b, 031 | qa-backend-expert + qa-frontend-expert |
| GAP-10 | 5557 | Tabbed workspace, live preview, JSON editor, variable autocomplete, full-screen mode, per-locale editing | 057, 058 | qa-backend-expert |
| GAP-11 | 5604, 5610, 5608, 5543 | Single-Ctrl+Z-on-fresh-open must not wipe the body; in-progress Liquid → field-level error not a blade-blocking 500 toast; Ctrl+Q fold operable; preview iframe width per channel | 057 | qa-backend-expert |
| GAP-12 | 5657, 5579 | Place Order **blocked** when only loyalty-currency lines are selected, with "Add a regular product to check out."; removing the old alerts must not lose the warning — it moves to the order-summary widget | 028, 029, 083b, 075b, 011 | qa-frontend-expert + qa-backend-expert |
| GAP-13 | 5518 | Coupon replace is remove-then-validate with no rollback — an invalid coupon over a working one must leave the working one applied | 028, 077, 077b, 050b3 | qa-frontend-expert |
| GAP-14 | 5417, 5349 | Rename → save → publish must carry content blocks into the new inner version; plus a dataset of pages *with* blocks so the path is exercisable | 059, 060, 050f (cross-ref) | qa-backend-expert |
| GAP-15 | 5615 | A zero-document rebuild must surface as failure, and storefront page search must not be silently emptied | 061, 004 (cross-ref) | qa-backend-expert |
| GAP-16 | 5617, 5602 | **No owner for the generated-app shell:** non-empty `html lang`, pinch-zoom not disabled (WCAG 3.1.1 A / 1.4.4 AA); `045` is storefront-only | New `Backend/vc-shell/vc-shell-a11y.csv`; 045 cross-ref | ui-ux-expert |
| GAP-17 | 5412, 5530 + 23 unlinked vc-shell PRs | Same missing owner for the framework's functional surface: keyboard shortcuts, dashboard widget keyboard resize/rearrange, `vc-data-table` mobile card view / column widths / expandable rows, `vc-video` trusted embeds, German i18n, bundle budget | New `Backend/vc-shell/vc-shell-framework-core.csv`; 092b cross-ref | ui-ux-expert + qa-backend-expert |
| GAP-18 | 5554 | `dashboardStatistics` 500 + blank KPI cards — the safe setting-value converter needs a **type-coercion matrix**, not one repro | 049, 017, 063 | qa-backend-expert |
| GAP-19 | 5534 | Negative-payload coverage for the nested-`Price` write, plus an explicit "no orphan row was created" assertion | 055, 054, 049 | qa-backend-expert |
| GAP-20 | 5513, 4772 | Dependency-CVE guards: AngleSharp mXSS on catalog rich-text, AutoMapper DoS on customer-review | 044, 051, 002, 086, 078 | qa-backend-expert |
| GAP-21 | 5637, 5468, 5556, 5603, 5627 | The cache/IMediator-scope change landed in ~25 repos with one suite reference (`050a`). Uncovered: no stale read within/across requests, change token captured **before** the load, streaming-JSON cache keys correct, no cross-request bleed, dependency-count drops without behavior change | 050g, 050a, 050b1, 050c, 050d, 026, 078 | qa-backend-expert |
| GAP-22 | 5589, 5586 | A widget renders **0**, never blank, for every zero metric, and refreshes **without** a full page reload | 093, 091 (verify+extend), 089 (verify) | qa-frontend-expert |
| GAP-23 | 5574, 5514, 4368 | No geometry/token oracle for icon rendering on 404/500, `VcSelect` focus ring, the x-cross → UI-kit swap in Lists | 048c, 007 (cross-ref) | ui-ux-expert |
| GAP-24 | 5452, 5433 | Dark presets have no token-equality/contrast coverage. **Caution:** the dark ramp is inverted (shade 50 = darkest) — "brighter on hover" means a *higher* shade | 071, 048c, 045 (contrast) | ui-ux-expert |
| GAP-25 | 5428 | No console-clean assertion on the Facets blade save | 051, 053, 003 (cross-ref) | qa-backend-expert |
| GAP-26 | 4855 | The Saved-for-Later component split preserving add-back-to-cart and configured-line round-trip | 007, 050h, 028 (cross-ref) | qa-frontend-expert |
| GAP-27 | 5583 | A generated export is downloadable and re-importable after migration | 064 | qa-backend-expert |
| GAP-28 | 5159 | `pageContext` and plugin-contributed schema still resolve for a plugin-hosted storefront | 050e, 050g | qa-backend-expert |
| GAP-29 | 5519 + search/audit-log bumps | No post-bump smoke assertion (module load, no startup error, console clean) | 042, 078 | qa-backend-expert |
| GAP-30 | 5485, 5362, 5309, 5308 | Cases exist — the gap is the **thin seed**: temporal windows (MTD/YTD, prev-month, last-year same day-span), multi-currency and cart statistics are unverifiable while `createdDate` is server-assigned | 093/091/050m (unblock, don't re-author) | test-data-engineer → qa-backend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

> `Test_Data` resolves via `@td(ALIAS.field)` / `{{VAR}}` only — no literal SKUs, GUIDs, emails, prices or PDP paths (use a fixture's `url` alias; never compose `/product/<sku>`). All rows are authored `Automation_Status = Draft` and promoted only after `/qa-review-tests` + lead approval. `*` marks a **candidate** BL id (see §5.2) that must be promoted before a case cites it.

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite (split) | Technique | BL / ECL |
|--------|--------|-----------|:-----:|----------------------|-----------|----------|
| 5532 | Admin SPA + REST | P0 security gate | 6 | 020 (2), 049 (2), 044 (1), 032 (1) | Decision Table (admin-UI flag × API permission × surface) | BL-AUTH-005/006/014, BL-AUTH-017* |
| 5649 | Storefront + GraphQL | P1 Story | 9 | 093 (4), 091 (2), 050m (3) | BVA (0/1/20/21 rows) + Decision Table (tab combos incl. all-unchecked) + EP (unknown key) | BL-SR-019/025/026, BL-SR-033* |
| 5557 | Admin SPA + REST | P1 Story | 6 | 057 (5), 058 (1) | Classification Tree (tab × editor mode × locale) + Error Guessing | BL-NOTIF-004/005, BL-UI-007 |
| 5485 | Storefront | P1 — verify (covered) | 3 | 093 (3) | EP (full / partial / zero-org rep) | BL-SR-011/012 |
| 5368 | Storefront + GraphQL | P1 Story | 5 | 091 (3), 050m (2) | Pairwise (sort axis × window × row count) | BL-SR-008/004/001 |
| 5367 | Storefront + GraphQL + dyn. props | P1 Story | 5 | 093 (2), 091 (1), 021 (1), 050m (1) | State Transition (default → drag → save → reload → re-auth) | BL-SR-015/016/023/024/030 |
| 5362 / 5309 / 5308 | GraphQL + Storefront | P1 — verify + extend | 5 | 050m (3), 091 (2) | EP + Error Guessing (null `*ChangePercent` on a zero baseline) | BL-SR-001/002/003/005/007 |
| 5332 | Storefront + GraphQL | P1 Story | 6 | 007 (3), 050h (2), 068 (1) | Classification Tree (channel × single/multi customer × item type) | BL-CART-015, BL-B2B-005, BL-NOTIF-001 |
| 5331 | GraphQL + REST | P1 Story | 4 | 068 (2), 058 (1), 090 (1) | Decision Table (member channel × recipient set) | BL-NOTIF-001/003, BL-B2B-005 |
| 5310 | Storefront + GraphQL | P1 Story | 5 | 089 (2), 091 (1), 050m (1), 068 (1) | BVA (0/1/1000/1001 chars) + EP (URL clickable) | BL-SR-013, BL-NOTIF-001, BL-SR-034* |
| 5281 | Storefront + REST + GraphQL | P0 cross-layer | 8 | 027 (2), 027b (1), 026 (1), 050d (1), 006 (1), 008 (1), 031 (1) | State Transition (invite → pending → approved/declined/revoked) + Decision Table | BL-B2B-009/010/012/013, BL-AUTH-015 |
| 4368 | Storefront (UI kit) | P2 Story | 2 | 048c (2) | Visual/geometry (icon variant × size, token equality) | BL-UI-001/005, ECL-1.7 |
| 5452 / 5433 | Storefront (theming) | P2 Story | 4 | 071 (2), 048c (2) | Token-equality + contrast oracle (inverted-ramp guard) | BL-UI-001/002, BL-WL-006 |
| 5192 | Storefront (CMS) | P3 Story | 2 | 042 (1), 048c (1) | EP (homepage renders, no CLS/console regression) | BL-UI-001, BL-CROSS-011 |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite (split) | Technique | BL / ECL |
|--------|--------|-----------|:-----:|----------------------|-----------|----------|
| 5618 | REST + Admin SPA | Highest — verify only | 2 | 049 (1), 020 (1) | Error Guessing (expired cookie on XHR) | BL-AUTH-014 |
| 5657 | Storefront + GraphQL | P0 fix | 5 | 028 (2), 083b (1), 075b (1), 050b1 (1) | Decision Table (line selection × currency mix) + Error Guessing | BL-LOY-004/008/010, ECL-13.3 |
| 5604 | Admin SPA | High fix | 3 | 057 (3) | State Transition (fresh open → single undo → redo) | BL-NOTIF-006, BL-UI-007 |
| 5558 | GraphQL + Admin SPA + email | High fix (security) | 5 | 050m (2), 092 (2), 044 (1) | Error Guessing (script/attribute/entity payload set) | BL-SR-034*, BL-GQL-003, ECL-4.3 |
| 5554 | REST + Admin SPA | High fix | 4 | 049 (2), 017 (1), 063 (1) | EP (setting value: bool / "true" / "" / arbitrary string) | BL-CROSS-011, ECL-10.2/10.3 |
| 5513 | REST + Admin SPA | High fix (CVE) | 3 | 044 (2), 051 (1) | Error Guessing (mXSS payload corpus) | BL-CROSS-003, ECL-14.8 |
| 5417 | Admin SPA (Page Builder) | High fix (data loss) | 4 | 059 (3), 060 (1) | State Transition (rename → save → publish → re-open live) | BL-CMS-001*, BL-CROSS-007 |
| 5617 / 5602 | A11y (vc-shell + vendor-portal) | fix | 4 | new vc-shell a11y suite (3), 045 (1) | EP (lang present/absent) + Boundary (zoom scale limit) | BL-UI-006, ECL-15.1 |
| 5598 | Admin shell + REST | fix (twin of 5618) | 3 | 092 (2), 032 (1) | Error Guessing (302/HTML where 401 expected) | BL-AUTH-014 |
| 5615 | Backend Admin (Search/Pages) | fix | 3 | 061 (3) | Error Guessing (repeat rebuild to hit the intermittent 0-doc path) | BL-SRCH-003, BL-SRCH-006*, BL-CROSS-009 |
| 5610 | Admin SPA | fix | 2 | 057 (2) | Error Guessing (submit mid-edit Liquid) | BL-NOTIF-007, BL-NOTIF-008*, BL-UI-004 |
| 5608 | Admin SPA | Low fix | 2 | 057 (2) | Error Guessing (Ctrl+Q on empty / folded region) | BL-UI-007 |
| 5589 | Storefront | verify + extend | 3 | 093 (2), 091 (1) | State Transition (data change → refresh without reload) | BL-SR-003, ECL-7.3 |
| 5586 | Storefront + GraphQL | verify + extend | 3 | 093 (2), 091 (1) | EP (zero vs null vs empty per metric type) | BL-SR-012/004 |
| 5574 | Storefront (UI kit) | fix | 2 | 048c (2) | Visual/geometry (icon size/weight on error pages) | BL-UI-001, ECL-1.7 |
| 5543 | Admin SPA | fix | 2 | 057 (2) | Boundary/geometry (preview iframe width per channel) | BL-UI-004 |
| 5534 | REST | fix (data integrity) | 4 | 055 (2), 054 (1), 049 (1) | EP (`productId` present/omitted/mismatched) + orphan-row assertion | BL-PRICE-009*, BL-PRICE-006, BL-CROSS-012 |
| 5518 | Storefront + GraphQL | verify + extend | 4 | 028 (1), 077 (1), 077b (1), 050b3 (1) | State Transition (valid → invalid attempt → rollback) | BL-CART-003/009, ECL-1.3 |
| 5514 | Storefront (UI kit) | fix | 2 | 048c (2) + 045 (focus-order cross-ref) | Visual/geometry + keyboard walk | BL-UI-003/006 |
| 5428 | Admin SPA | Low fix | 2 | 051 (1), 053 (1) | Error Guessing (repeat Facets save, console-clean oracle) | BL-CROSS-003, ECL-10.3 |

### 6.3 Tasks / TechDebt

| Ticket | Layers | Case type | Count | Target suite (split) | Technique | BL / ECL |
|--------|--------|-----------|:-----:|----------------------|-----------|----------|
| 5637 + 5468 + 5556 + 5603 + 5627 | GraphQL + REST | P0 perf + correctness guard | 11 | 050g (3), 050a (2), 050b1 (1), 050c (1), 050d (1), 026 (1), 078 (2) | Error Guessing (stale read, mutate-then-read, change-token race) + dependency-**count** oracle (`/qa-perf-measure`, not latency) | BL-GQL-002/003, BL-CROSS-002/009 |
| 5579 | Storefront | P1 | 3 | 028 (2), 083b (1) | State Transition (invalid selection → warning in order summary) | BL-LOY-004/008, BL-UI-004 |
| 4855 | Storefront + GraphQL | P1 | 3 | 007 (2), 050h (1) | Error Guessing (split regression: add back to cart, configured line round-trip) | BL-CART-015 |
| 5412 + 5530 + 23 unlinked vc-shell PRs | Admin shell (A11y + framework) | P1 | 7 | new vc-shell framework suite (5), 092b (2) | Classification Tree (component × pointer/keyboard/mobile-card) + bundle-budget oracle | BL-UI-001/003/006/007, ECL-7.4, ECL-15.1 |
| 5519 | Cross-cutting | P2 | 2 | 042 (1), 078 (1) | Post-bump smoke (module load + console/network clean) | BL-CROSS-003, ECL-14.8 |
| 5349 | Admin SPA (Page Builder) | P2 (test data) | 2 | 059 (1), 060 (1) | Classification Tree (page × block type) | BL-CMS-001* |
| 5583 | Admin SPA / REST | P2 | 3 | 064 (3) | EP (export → migrate → re-import round trip) | BL-IMPEX-001/004 |
| 5159 | GraphQL | P2 | 2 | 050e (1), 050g (1) | EP (plugin-hosted vs native `pageContext`) | BL-GQL-001/004, BL-B2B-007 |
| 4772 | GraphQL | P2 (CVE) | 2 | 086 (2) | Error Guessing (deep/hostile mapping payload) | BL-GQL-001, ECL-14.8 |

**`estimatedTotalNewCases: "150-185"`** — the lower bound folds every *verify-only* row (5618, 5485, 5362/5309/5308, 5589, 5586, 5518) into its primary suite and treats the two new vc-shell suites as one; the upper bound fully decomposes each Decision-Table / Pairwise / Classification-Tree row and splits the two vc-shell suites.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- Sprint 26-15 builds deployed to QA: Platform ≥ **3.1057.0** (87 modules) with `vc-module-sales-rep`, `vc-module-notification` ≥ the #202 build, `vc-module-pagebuilder` ≥ #151, `vc-module-pricing` ≥ #236, `vc-module-pages` ≥ #19, `vc-module-loyalty` ≥ #15, `vc-module-catalog` ≥ #902, and the theme carrying `vc-frontend` #2425. Verify against `/api/platform/modules` — a pinned version is **not** proof it is live (`reference_platform_deploy_silent_fail_trailing_comma`, `reference_module_bump_silent_dependency_skip`).
- `npm run env:check` green for the target env; `npm run td:validate` + `TEST_ENV=<env> npm run td:reconcile` green.
- **Sales Rep fixtures seeded on the target env** (`npm run seed:sales-rep`, `seed:sales-rep-stats`): at least one rep serving ≥2 orgs with a saved-layout baseline, one rep with partial data, one with zero customers, plus the statistics windows fixture (`td:validate:sales-rep`, `td:validate:sales-rep-stats` green).
- Mixed-cart / loyalty fixtures available (loyalty catalog + ProductPoints SKUs) — **vcst-qa only**; vcptcore has no loyalty module (`reference_vcptcore_no_loyalty_module`).
- Multi-org membership fixtures present (`@td(MULTI_ORG_TF_BR.*)` — real membership rows, per DV-022).
- A Page Builder page **with content blocks** seeded via the VCST-5349 dataset, plus a Notification template large enough (~50 KB) to make the VCST-5604 undo case meaningful.
- Browser secrets file `.env.playwright.local` loaded **at MCP start** (`feedback_playwright_secrets_startup_only`) — a mid-session variable locks the shared account out.
- Admin SPA credentials confirmed per env (`Password1!` vs `Password1` differ by env).

### 7.2 Exit Criteria

- **All four Critical domains** pass their activated suites, incl. a cross-browser (chrome + edge) pass; zero open P0/P1 in Security & Auth, request-scoped caching, Sales Rep, or Cart & Checkout.
- The five *silent-wrong-state* assertions hold explicitly, each with evidence: 401-not-302 with no `Location`; loyalty-only Place Order blocked **with** the warning text; valid coupon survives an invalid re-apply; renamed published page keeps every block on the live URL; a Pages reindex never reports success with 0 documents.
- Statistics widgets: `0` rendered for absent metrics and values refreshed **without** a page reload.
- No pre-existing operator loses admin sign-in after VCST-5532 (regression check, not just the new negative case).
- axe-core WCAG 2.2 AA: no new Critical/Serious violations on the Admin SPA login + a representative blade, and `html lang` / pinch-zoom fixed in both `vc-shell` and vendor-portal.
- Every new case authored this sprint is promoted (`Draft → Automated`/`Reviewed`) or left `Draft` with a stated reason; `npm run suites:lint` + `npm run suites:review` green (no duplicate case IDs).
- Feature Release Gate computed deterministically (`npm run … compute-metrics.ts --gate feature`), GO/NO-GO recorded per domain; **release approval stays human**.

---

## 8. Test Data Requirements

| Need | Source / alias | Notes |
|------|----------------|-------|
| Sales reps (multi-org, partial-data, zero-customer) | `test-data/sales-rep/sales-reps.csv` → `@td(SR_REP_PRIMARY.*)`, `@td(SR_REP_PAGING.*)`, `@td(SR_REP_NOCUSTOMERS.*)` | `SR_REP_LAYOUT` is the **only** disposable-layout alias — never wipe `SR_REP_PRIMARY`'s never-saved baseline (`td:validate:sales-rep`) |
| Sales Rep statistics windows (MTD/YTD, last-year comparison) | `npm run seed:sales-rep-stats` + `buildStatisticsWindows()` | `createdDate` is **server-assigned** — past-period baselines are unseedable, so a `null` `*ChangePercent` may be correct, not broken (`reference_order_createddate_unwritable`) |
| Rep-served orgs | `test-data/b2b/organizations.csv` (pinned `platform_id`) | Every served org must be pinned, not overlay-resolved |
| Multi-org membership (lock/unlock/role/invite) | `@td(MULTI_ORG_TF_BR.email/.password)` | **Not** `{{MULTI_ORG_USER_EMAIL}}` — it has no membership rows (DV-022) |
| Loyalty / mixed cart | loyalty catalog + ProductPoints SKUs via `npm run seed:standard-products` | vcst-qa only |
| Coupons (valid / invalid / expired) | `@td(COUPON_*.code)` + `live-discover` for an active coupon | Never hardcode a code |
| Price-list write target | `@td(PRICELIST_*.*)` + a seeded product `@td(PROD_*.sku)` | Assert on the re-read row, not the write response |
| Page Builder page with blocks | VCST-5349 dataset | Needed for the 5417 rename→publish case |
| Notification template (large) | seeded Abandoned-cart default template | ~50 KB body makes the undo-wipe case observable |
| XSS payloads | inline in the case (test input, not fixture data) | Assert inert rendering in admin Preview + delivered email |
| Storefront PDP paths | `{{FRONT_URL}}@td(ALIAS.url)` | Never compose `/product/<sku>` — SPA soft-404 |

No hardcoded IDs / SKUs / prices / emails / order numbers anywhere (`.claude/rules/test-data.md`).

---

## 9. Schedule and Milestones

| Date | Milestone | Owner |
|------|-----------|-------|
| 2026-08-07 | Plan drafted; sitemap refreshed (rev 6); fixture gates run (`td:validate`, `td:reconcile`) | orchestrator |
| 2026-08-08 | Sales Rep + Security/Auth fixtures seeded; new cases authored for the Critical domains | test-data-engineer, test-management-specialist |
| 2026-08-10 | **Sprint close** — re-run `/qa-test-plan 26-15` to capture tickets that reached Done after 08-07 | orchestrator |
| 2026-08-10 – 08-11 | Critical domains executed (Security & Auth, caching sweep, Sales Rep, Cart) + cross-browser pass | qa-backend-expert, qa-frontend-expert, qa-testing-expert |
| 2026-08-12 | High domains (Admin SPA/vc-shell + a11y, Notifications, B2B orgs, Page Builder, Pricing) | qa-backend-expert, ui-ux-expert |
| 2026-08-13 | Medium/Low domains; `/qa-triage-results latest --fix` on the run's FAILs | qa-lead-orchestrator |
| 2026-08-14 | Case promotion (`Draft → Automated`/`Reviewed`), Feature Release Gate per domain, GO/NO-GO recommendation | qa-lead-orchestrator (human ratifies) |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser lane |
|--------|-------|--------------|
| Platform Security & Auth (API + admin) | `qa-backend-expert` | `playwright-edge` (or Chrome DevTools MCP for Admin SPA) |
| Platform perf & request-scoped caching | `qa-backend-expert` (+ `/qa-perf-measure`) | `playwright-edge` / API-only |
| Sales Rep — storefront hub, profile, layout, messaging | `qa-frontend-expert` | `playwright-chrome` |
| Sales Rep — scoped xAPI + statistics contract | `qa-backend-expert` | API-only |
| Cart & Checkout (mixed cart, coupons) | `qa-frontend-expert` | `playwright-chrome` |
| Admin SPA / vc-shell regression | `qa-backend-expert` | Chrome DevTools MCP |
| A11y (WCAG 2.2 AA, dark presets, UI kit) | `ui-ux-expert` | Chrome DevTools MCP |
| Notifications editor | `qa-backend-expert` | `playwright-edge` |
| B2B Organizations & Membership | `qa-frontend-expert` + `qa-backend-expert` | chrome / edge (sequential) |
| Page Builder / CMS + indexing | `qa-backend-expert` | `playwright-edge` |
| Cross-browser confirmation on Critical domains | `qa-testing-expert` | queue for a **chrome/edge** slot |
| Fixtures (seed + reconcile) | `test-data-engineer` | none (Node + Platform API) |
| Case authoring / review / promotion | `test-management-specialist` | `playwright-chrome` (sequential) |

**Max 3 concurrent browser agents.** `playwright-firefox` **cannot click** on this storefront or the Admin SPA (confirmed 6×) — queue rather than place a click-driven suite there.

---

## 11. JIRA Ticket Coverage Matrix

| Ticket | Type | Existing suites | New cases | Owner |
|--------|------|-----------------|:---------:|-------|
| VCST-5618 | Bug (Highest) | 049, 020, 032 | 2 (verify only) | qa-backend-expert |
| VCST-5532 | Story (High) | 020, 049, 044, 032 | 6 | qa-backend-expert |
| VCST-5513 | Bug (High) | 044, 051, 002, 078 | 3 | qa-backend-expert |
| VCST-4772 | Task (Security) | 086, 078 | 2 | qa-backend-expert |
| VCST-5657 | Bug (High) | 028, 029, 083b, 075b, 011, 050b1 | 5 | qa-frontend-expert |
| VCST-5579 | Task | 028, 083b | 3 | qa-frontend-expert |
| VCST-5518 | Bug | 028, 077, 077b, 050b3 | 4 | qa-frontend-expert |
| VCST-5558 | Bug (High) | 050m, 092, 044 | 5 | qa-backend-expert |
| VCST-5485 | Story | 093 | 3 (verify) | qa-frontend-expert |
| VCST-5362 / 5309 / 5308 | Story ×3 | 050m, 091, 089, 093 | 5 | qa-backend-expert + qa-frontend-expert |
| VCST-5368 | Story | 091, 050m, 002 | 5 | qa-backend-expert + qa-frontend-expert |
| VCST-5367 | Story | 093, 091, 050m, 021 | 5 | qa-frontend-expert + qa-backend-expert |
| VCST-5649 | Story | 093, 091, 050m | 9 | qa-frontend-expert + qa-backend-expert |
| VCST-5310 | Story | 089, 091, 050m, 068, 050l | 5 | qa-frontend-expert + qa-backend-expert |
| VCST-5331 | Story | 068, 058, 090, 050l | 4 | qa-backend-expert |
| VCST-5332 | Story | 007, 050h, 068 | 6 | qa-frontend-expert |
| VCST-5589 | Bug | 093, 091, 089 | 3 | qa-frontend-expert |
| VCST-5586 | Bug | 093, 091 | 3 | qa-frontend-expert |
| VCST-5281 | Story | 027, 027b, 026, 050d, 006, 008, 011b, 031, 033 | 8 | qa-backend-expert + qa-frontend-expert |
| VCST-5557 | Story | 057, 058 | 6 | qa-backend-expert |
| VCST-5604 | Bug (High) | 057 | 3 | qa-backend-expert |
| VCST-5610 | Bug | 057 | 2 | qa-backend-expert |
| VCST-5543 | Bug | 057 | 2 | qa-backend-expert |
| VCST-5608 | Bug (Low) | 057 | 2 | qa-backend-expert |
| VCST-5417 | Bug (High) | 059, 060, 050f | 4 | qa-backend-expert |
| VCST-5349 | Task | 059, 060 | 2 | qa-backend-expert |
| VCST-5615 | Bug | 061, 004 | 3 | qa-backend-expert |
| VCST-5534 | Bug | 055, 054, 049 | 4 | qa-backend-expert |
| VCST-5554 | Bug (High) | 049, 017, 063 | 4 | qa-backend-expert |
| VCST-5598 | Bug | 092, 032, **new vc-shell framework suite** | 3 | qa-backend-expert |
| VCST-5617 / 5602 | Bug ×2 | 045, **new vc-shell a11y suite** | 4 | ui-ux-expert |
| VCST-5412 / 5530 | Task ×2 | 092b, **new vc-shell framework suite** | 7 | ui-ux-expert + qa-backend-expert |
| VCST-5514 | Bug | 048c, 045 | 2 | ui-ux-expert |
| VCST-5574 | Bug | 048c, 042 | 2 | ui-ux-expert |
| VCST-4368 | Story | 048c, 007 | 2 | ui-ux-expert |
| VCST-5452 / 5433 | Story ×2 | 071, 048c, 045 | 4 | ui-ux-expert |
| VCST-5428 | Bug (Low) | 051, 053, 003 | 2 | qa-backend-expert |
| VCST-4855 | Task | 007, 050h, 028 | 3 | qa-frontend-expert |
| VCST-5637 / 5468 / 5556 / 5603 / 5627 | Task ×5 | 050g, 050a, 050b1, 050c, 050d, 026, 014, 078 | 11 | qa-backend-expert |
| VCST-5159 | Task | 050e, 050g | 2 | qa-backend-expert |
| VCST-5583 | Task | 064 | 3 | qa-backend-expert |
| VCST-5519 | TechDebt | 042, 078 | 2 | qa-backend-expert |
| VCST-5192 | Story | 042, 048c | 2 | qa-frontend-expert |
| VCST-5509 · 5467 · 5394 · 5393 · 5307 · 5194 · 5493 · 5225 · 5636 | Story/Task | — | 0 — **out of test scope** (§2.4) | — |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

| # | Flow | Layers | Tickets |
|---|------|--------|---------|
| 1 | Admin session expires → `/api/**` answers **401** (no `Location`) → both the Admin SPA and `vc-shell` detect it and route to sign-in cleanly | REST + Admin SPA + vc-shell | 5618, 5598 |
| 2 | "API-only" user: API calls with its permissions succeed, back-office sign-in refused; a normal operator's sign-in unaffected | REST + Admin SPA | 5532 |
| 3 | Rep sends a communication with an XSS payload → inert in the admin journal Preview **and** in the delivered email → org member receives email + storefront push | GraphQL + Admin SPA + Storefront + Notifications | 5558, 5310, 5331 |
| 4 | Rep arranges hub layout + widget settings → Save → reload → layout and settings persist; statistics show `0` (not blank) and refresh without a page reload | Storefront + GraphQL + member dynamic properties | 5367, 5649, 5586, 5589 |
| 5 | Rep publishes a list to a customer → customer sees "Sales Rep recommends" → adds an item to cart → checks out | Storefront + GraphQL + Notifications | 5332 |
| 6 | Mixed cart: loyalty-only selection → Place Order blocked with the order-summary warning → add/select a regular product → order placed | Storefront + GraphQL | 5657, 5579 |
| 7 | Valid coupon → invalid coupon applied → valid coupon and totals survive → order placed at the discounted total | Storefront + GraphQL | 5518 |
| 8 | Existing customer invited into a second org → membership-derived status agrees across storefront Company Members, xAPI, and Admin SPA | Storefront + REST + GraphQL + Admin SPA | 5281 |
| 9 | Published Page Builder page renamed → saved → published → every content block still live on the storefront URL; a Pages reindex reports a non-zero count | Admin SPA + Storefront + indexing | 5417, 5615, 5349 |
| 10 | Price written with nested `Price.productId` omitted → no orphan row → PDP and price list agree after re-read | REST + Admin SPA + Storefront + GraphQL | 5534 |
| 11 | Mutate cart/member/catalog → immediately re-read on the same request-scoped-cache path → no stale or cross-user answer | REST + GraphQL + Storefront | 5468, 5556, 5603, 5627, 5637 |

---

## 13. References

**Frontend PRs (`VirtoCommerce/vc-frontend`, merged 2026-07-27 → 2026-08-07):** #2352 (CVV per brand), #2392 (5310), #2394 (5519), #2395 (5485), #2399 (5281), #2400 (5367), #2401 (5574), #2403 (codegen), #2404/#2413 (backend packages), #2405 (5332), #2407 (5433/5452), #2408 (5586), #2411 (5514), #2412 (5589), #2418 (4855), #2420 (loyalty alerts), #2422 (5518), #2425 (5649).

**Platform / module PRs (selected):** `vc-platform` #3077, #3089 (5554), #3092 (5532), #3093 (5618), #3094 (5627), #3095 (5637) · `vc-module-sales-rep` #4 (5309/5362), #7 · `vc-module-notification` #202 (5557) · `vc-module-pagebuilder` #150 (5219), #151 (5417), #157 (5349) · `vc-module-pages` #19 (5615) · `vc-module-pricing` #236 (5534) · `vc-module-loyalty` #15 (5657) · `vc-module-catalog` #901 (5428), #902 (5513) · `vc-module-customer` #312 (5281), #313 (5603) · `vc-module-profile-experience-api` #141 (5281), #142 · `vc-module-x-catalog` #106 (5637) · `vc-module-customer-review` #82 (4772) · `vc-module-x-api` #78 / `vc-module-x-frontend` #8 (5159) · `vc-module-system-operations` #3 (5583) · `vc-module-audit-log` #16/#17 · **VCST-5468 "Resolve mediators per request"** merged in ~25 module repos on 2026-07-27 · `vc-shell` #264–#283 (23 PRs: WCAG 2.2 a11y, dashboard keyboard rearrange/resize, data-table mobile card view, session-expiry interceptor) · `vendor-portal` (4 PRs).

**Knowledge / rules:** `.claude/rules/agents.md` (browser lanes, firefox click quirk) · `.claude/rules/regression.md` (suite manifest, selections, triage) · `.claude/rules/test-data.md` (`@td()`, DV-021/DV-022) · `.claude/rules/quality-gates.md` (G0–G7) · `.claude/rules/reports.md` (size caps) · `.claude/knowledge/oracles/business-logic.md` · `.claude/knowledge/oracles/e-commerce-edge-cases-library.md` · `.claude/knowledge/oracles/vc-bug-catalog.md` · `.claude/knowledge/execution/module-suite-map.md` · `.claude/knowledge/execution/ticket-routing.md` · `.claude/knowledge/domain/sitemap.md` (rev 6, refreshed by this run).

**Manifest / tooling:** `config/test-suites.json` (121 suites, 37 selections) · `npm run suites:lint` · `npm run suites:review` · `npm run td:validate` / `td:reconcile` · `npm run triage:collect` · `scripts/regression/compute-metrics.ts --gate feature`.

**Prior sprint plans:** `sprint-26-14-test-plan.md` (structural reference) · `sprint-26-13-test-plan.md`.
