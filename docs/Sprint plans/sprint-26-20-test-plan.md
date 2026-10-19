# Sprint 26-20 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-10-14
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-10-05 – 2026-10-19 *(quoted from the Jira sprint object `VCST Sprint 26-20`, id 2717, board 126)*

> **⚠ This sprint is still OPEN.** Built 2026-10-14, five days before close. **148 of 224** issues are not Done (Story: 9 In progress, 4 In review, 4 Testing, 3 Ready for test, 4 Draft, 4 To do, 3 On hold, 1 Tested, 1 Refinement · Bug: 10 To do, 9 Draft, 5 On hold, 5 Tested, 4 In progress, 2 Testing on stable, 2 Wait hotfixes, 2 Hotfix ready, 2 Cancelled, and 3 others · Task: 35 To do, 9 In progress, 7 In review, 3 Testing, and 9 others · 8 TechDebt / Review / Spike). The scope below is the **Done** set. Re-run `/qa-test-plan Sprint26-20` after close to capture the rest.

> **⚠ `FRONT_URL` is not serving `dev`.** Read live on 2026-10-14 09:02 UTC (`scripts/preflight`, `/api/platform/modules` + the storefront bundle):
> - **The storefront theme is `2.60.0-pr-2543`.** That is an **unmerged PR build** of VCST-6017 (beacon-based analytics, status *Ready for test*). It is 13 commits ahead of and **7 behind** `vc-frontend` `dev`.
> - **The theme is missing six Done tickets:** #2522 (VCST-5817), #2518 (VCST-5880), #2523 (VCST-5884, storefront half), #2485 (VCST-5924), #2571 (VCST-6265) and #2574 (VCST-6307). A storefront verdict on any of the six is `PENDING-DEPLOY`, never `PASS` or `FAIL`.
> - **The theme also carries analytics code that is not on `dev`.** VCST-6100's oracle is `window.dataLayer`, and VCST-6017 writes to the same layer. Read any GA4 result on this build as *VCST-6017 + dev*, not as dev.
> - **Backend modules are current.** Every module release on `vcst` was published after its sprint PR merged, for example XCart 3.1042.0, XOrder 3.1016.0, Quote 3.1005.0, PageBuilder 3.1034.0, Return 3.1005.0, Platform 3.1079.0. *Containment is inferred from release dates and not diffed.*
> - **`VirtoCommerce.Otp` 3.1000.0 is now installed** (it was absent in 26-19), so the OTP suites `104`/`105` can run here. The store setting `OtpSignIn.Enabled` was not checked.
> - **Exceptions:** `SalesRep` runs a PR build (`3.1014.0-pr-13-4fbb`) that has not been matched to #18 or #21. **`vc-module-import` (VCST-6247) and `vc-module-punchout` (VCST-5886) are not installed**, so neither can be tested on `vcst`.
>
> **Most of this sprint was QA'd on PR builds before merge**, on `vcptcore-qa`/`qa1` or on a local storefront pointed at the `vcst` API. Jira records a verification on 45 of the 48 test-relevant tickets (44 by QA, 1 by the developer: VCST-6247); none on VCST-6131, 6180 or 5687. **This plan is therefore a post-merge confirmation plan more than a first-test plan:** its job is to prove the merged, deployed build behaves the way the PR build did, and to put the result into the regression corpus.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-20 (`VCST Sprint 26-20`, Jira sprint id 2717) |
| Date range | 2026-10-05 – 2026-10-19 (quoted from the sprint object; **active** at drafting) |
| Theme | **Who may touch what.** Seven of the 48 test-relevant tickets are authorization fixes: a Write co-owner taking over a wishlist (6125), a list modified before authorization runs (6116), a buyer refused their own order attachment (5995), anonymous access to import history (6247), and missing permissions on Tax, Catalog Personalization and Catalog Publishing (6276). Around them, Sales Rep list sharing is rebuilt for many recipients (5925/5707/5728/5850). Configurable-product file attachments get a five-ticket fix chain across five repos. The cart's order/quote gate is re-pointed at the rule set it actually validated (6089) |
| Done tickets | **76**: 18 Stories, 34 Bugs, 21 Tasks, 1 TechDebt, 1 Spike, 1 Review task |
| **Of which out of scope** | **28**: 9 `[Agentic QA]`/tooling, 5 CI/repo/team setup, 3 demo/PoC, 3 QA run/env activities, 2 test automation, 1 `vc-frontend-next` theme regression, 1 `vc-shell` framework, 1 flag-off TechDebt, 3 review/spike (§2.4) |
| **Test-relevant Done tickets** | **48**: 14 Stories + 32 Bugs + 2 Tasks |
| Merged PRs in `vc-frontend` | **35** in the window, 34 on `dev`. **28 product PRs**, including #2547 (unlinked), which bumps backend packages and regenerates GraphQL types and **removes the `requestPasswordReset` query** from the storefront's types (§2.3). The other 7 are 6 CI/repo/Claude-config PRs (#2538, #2545, #2549, #2550, #2553, #2562: VCST-6033/6206/6210 and unlinked) and 1 codegen tool (#2546, VCST-6187). No revert in the window. #2536 (VCST-6077) **re-lands** #2514, which was reverted on 2026-10-02 |
| Merged PRs in modules + platform | **44** product PRs across **27 repos** (`vc-module-*` + `vc-platform`). Also in the window: 7 `vc-modules` bundle bumps, 8 `vc-shell` and 6 `vendor-portal` PRs (Marketplace, VM-* keys), plus **40** CI-sweep/dependabot PRs excluded. Source: org-wide `is:merged` search for the window, so it is not limited to VCST-keyed PRs |
| `vc-frontend-next` | Exists; 7 PRs merged (VCST-6030 new theme, VCST-6210 CI). Out of scope (§2.4) |
| Storefront sitemap | Refreshed to **rev 11** at Step 0. Platform line 3.1073.0 → **3.1078.0**; products 4,567 → **4,615**; 53 nav categories (Carriage Bolts moved `bolts/` → `destinations/`); `/products-with-options` 7 unchanged. **Deterministic axis only.** The local `vc-frontend` checkout is still `48a9759c` @ 2026-09-24, behind `origin/dev` `3d463fb6`, so the route lists stay known-stale. That matters this sprint because VCST-6077 moves `/company/calendar` → `/company/tasks` |

**The risk this sprint is in the authorization boundary, and it fails silently.** An authorization fix has
two regression directions: the hole stays open, or the fix refuses a legitimate caller. Only one of them
throws an error a regression run notices. 6276 adds three **new permissions**, so a non-admin role that
worked yesterday is refused today, by design. 6116 was an authorization check that ran *after* the write,
so the xAPI response said "denied" while storage had already changed. Its oracle is the stored state,
not the response. Six domains score Critical; four of them are Critical because of an authorization
change.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 14 of 18 Done)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5886 | **High** | **Coupa ERP punchout, cXML `PunchOutSetupRequest`.** Anonymous `POST /api/punchout/cxml` returns a StartPage URL with a single-use token. The token signs in the mapped customer once; the session is time-limited and shows "Punchout mode" with one organization and no switcher. cXML status codes for each failure. Admin "Punchout user" widget on the contact | Punchout | vc-module-punchout #1 (**new module, not installed on `vcst`**), vc-module-profile-experience-api #147, vc-frontend #2506 |
| VCST-6077 | Medium | [Sales Rep Hub] **Tasks design.** Calendar page renamed **Tasks** (`/company/tasks`; `/company/calendar` → 404); zebra task table; one row action (Mark as complete / Reopen); scope chips Today/All/Upcoming/Overdue/Completed with counts; `?filter=overdue` deep link; compact mini calendar | Sales Rep hub | vc-frontend #2536 (re-lands #2514) |
| VCST-6027 | Medium | [Configurable products] **Configuration checklist** in the Price and delivery widget: done / required / optional rows; red rows link to their option; Add to cart enabled only when no row is red | Configurable products | vc-frontend #2527 |
| VCST-6001 | Medium | [Sales Rep] Customer-orders filter adopts **VcDateRangePicker** (combined under 640 px, split above; start > end blocks Apply; one-sided range is open-ended). **Selector impact:** calendar buttons are renamed "Open calendar: \<label\>", on `/account/orders` too | Sales Rep hub | vc-frontend #2519 |
| VCST-5944 | Medium | [Push Messages] **Recipients audience builder:** Everyone / specific people or companies / match by conditions / advanced query. The previewed recipient count equals the delivered count; paged preview | Push messages | vc-module-push-messages #28 |
| VCST-5925 | Medium | [BE][Sales Rep][Lists] **Sharing with many recipients.** Grants are added and removed as deltas (no replace-set). `sharingSetting.targets[]` replaces `sharingSettings[].sharedWith`. One stable list-level key; the owner can always revoke; a write without scope leaves sharing untouched | Lists sharing & Wishlist authz | vc-module-x-cart #141, vc-module-sales-rep #21, vc-module-cart #194, vc-frontend #2476 |
| VCST-5924 | Medium | [Configurable products] **File attachment links** in cart, checkout review and order details | Configurable products | vc-frontend #2485 (**not on `FRONT_URL`**) |
| VCST-5884 | Medium | [E2E] Returns step 3: **My Organization Returns.** New permission `xapi:my_organization:return:view`; an organization tab next to My returns; read-only list (search, filter, sort, paging); drafts never listed | Returns — organization | vc-module-return #28, vc-frontend #2523 (**not on `FRONT_URL`**) |
| VCST-5880 | Medium | [A11y] **Compare:** header and body become one native table, so every cell is associated with its product column (WCAG 1.3.1); sticky header kept | UI kit & a11y | vc-frontend #2518 (**not on `FRONT_URL`**) |
| VCST-5850 | Medium | [Sales Rep hub] **Send push/email to many customers.** **Partial delivery:** multi-organization send via `sendCustomerCommunication` and three entry points shipped, but the Customers multi-select in the popup did not | Lists sharing & messaging | vc-module-sales-rep #21, vc-module-x-cart #141, vc-module-cart #194, vc-frontend #2476 |
| VCST-5817 | Medium | [Search] The search input stops moving 115 px when the category-scope indicator changes (`BL-UI-003`) | Search bar & analytics | vc-frontend #2522 (**not on `FRONT_URL`**) |
| VCST-5728 | Medium | [BFE][Sales Rep][Lists] **Existing message** is shown when editing a share; only newly added customers are notified; a message-only edit sends nothing | Lists sharing | same four PRs as 5925 |
| VCST-5707 | Medium | [BFE][Sales Rep][Lists] **Sharing rework.** A second recipient does not revoke the first; Stop sharing asks for confirmation; sharing can be re-created | Lists sharing | same four PRs as 5925 |
| VCST-5687 | Medium | [Sales Rep hub] **Empty state** for Dashboard and Customer pages when every block is hidden | Sales Rep hub | vc-frontend #2539 (not linked on the ticket; no QA comment) |

> **VCST-6027 is Done with a QA FAIL on it.** Finished Text and File rows show the option name only,
> where the specification says name **and** value. VCST-6188 is open for it. The checklist's remaining
> behaviour is testable; the Text/File done-row assertion is **held** until VCST-6188 is resolved. Do not
> author it to match the build.

> **VCST-5850 shipped in part.** The API side and three entry points shipped; the To-Be Customers
> multi-select in "Send a message" did not, and no follow-up ticket exists yet. Test what shipped. Raise
> the missing half as a scope gap, not as a bug.

### 2.2 Bugs Fixed (QA-relevant — 32 of 34 Done)

| Key | Pri | Summary | Domain | PR |
|-----|-----|---------|--------|-----|
| VCST-6247 | **Highest** | [Support] `vc-module-import`: **anonymous access** to import history via `/api/import/profiles/execution/history/search` (the authorization handler always succeeds) | Platform API authorization | vc-module-import #44 (**module not installed on `vcst`**) |
| VCST-6276 | **High** | [Support] Missing authorization on **Tax, Catalog Personalization and Catalog Publishing** APIs. **New permissions** `tax:read`, `tax:update` and `personalization:update`; the legacy completeness-job route is removed. `/api/platform/apps` split to VCST-6279 (open) | Platform API authorization | vc-module-tax #61, catalog-personalization #93, catalog-publishing #82 (+ bundle hotfixes) |
| VCST-6268 | **High** | [Vulnerability] Dependency CVE in Image Tools: the imaging library is **replaced** (ImageSharp → SkiaSharp). Thumbnail sizes per mode must be unchanged; formats JPEG/PNG/WebP/BMP/SVG; GIF/TIFF skipped without failing the task | Image Tools | vc-module-image-tools #130 |
| VCST-6125 | **High** | [xAPI][Wishlist] A Write **co-owner takes ownership** of an Organization-scope list via `changeWishlist(scope)`; the owner loses it and it can be made public | Lists sharing & Wishlist authz | vc-module-x-cart #141, vc-frontend #2476 |
| VCST-6116 | **High** | [xAPI][Wishlist] `addWishlistItem` / `updateWishListItems` **persist before authorization**: "Access denied" is returned while the quantity has already changed in storage | Lists sharing & Wishlist authz | vc-module-x-cart #141 |
| VCST-6089 | **High** | [x-cart] `GetValidationErrors()` reads an obsolete mirror. `createOrderFromCart` / `createQuoteFromCart` now gate on the rule set they just validated. `GetValidationErrors()` is deprecated (VC0016), a breaking change for derived aggregates | Cart & order validation core | vc-module-x-cart #147, x-order #53, quote #158 |
| VCST-6012 | **High** | Page Builder Designer **keyboard accessibility**: section tree unreachable, plus four related defects | Page Builder | vc-module-pagebuilder #165 |
| VCST-6011 | **High** | Page Builder Designer: an unguarded clipboard read gates the actions menu, so **Shared Component creation is unreachable in Firefox** | Page Builder | vc-module-pagebuilder #165 |
| VCST-5995 | **High** | [Configurable products] Buyer gets **403 on their own configuration file** from Order Details. Other buyers, plain customers and anonymous must still get 403; owner access on pre-upgrade orders is unconfirmed | Configurable products | file-experience-api #25, x-cart #149, x-order #55, quote #159 |
| VCST-6307 | Medium | PDP: SKU **invisible in dark mode** (Mercury dark preset) | UI kit & a11y | vc-frontend #2574 (**not on `FRONT_URL`**) |
| VCST-6173 | Medium | [Orders] "Created date" presets return **wrong ranges at month boundaries and east of UTC** | Orders date filter | vc-frontend #2540 |
| VCST-6131 | Medium | OTP sign-in: a **locked account is told a correct code is wrong** (anti-enumeration constraint from VCST-5748). **Which fix shipped (backend silent no-send, or reworded message) is not recorded** | Auth / OTP | no dedicated PR found; only vc-frontend #2477 (the VCST-5748 PR) is referenced |
| VCST-6107 | Medium | [Storefront] Field labels on account pages fail colour contrast (return details page) | Returns — organization | vc-frontend #2532 |
| VCST-6104 | Medium | [Sales Rep][Lists] Widening a Customer share to "Anyone with link" warns recipients will **lose** access, but their links become public | Lists sharing | vc-frontend #2476 |
| VCST-6096 | Medium | [A11y] **VcButton in loading state** has no accessible name (global UI-kit change) | UI kit & a11y | vc-frontend #2528 |
| VCST-6093 | Medium | [platform] A **DefaultValue settings override** from configuration never reaches a typed read | Platform settings & SEO admin | vc-platform #3128 |
| VCST-6010 | Medium | Page Builder: Shared Component create accepts a **non-existent storeId** → orphan | Page Builder | vc-module-pagebuilder #170 |
| VCST-6009 | Medium | Page Builder: **concurrent page save** silently discards one author's work. Fix adds ETag / If-Match: **raw content POST without a version → 428, stale → 412.** This is a **breaking API change**, and it caused VCST-6285 (the platform auto-test seeder) | Page Builder | vc-module-pagebuilder #167 |
| VCST-6000 | Medium | [Configurable products] A **zero-byte file** satisfies a REQUIRED File section; optional per-scope `MinFileSize` on upload | Configurable products | x-cart #144, file-experience-api #22, vc-frontend #2510 |
| VCST-5999 | Medium | [Configurable products] **Quote from cart loses configuration file attachments**: URLs 404 for everyone | Configurable products | vc-module-quote #159 |
| VCST-5993 | Medium | [ui-kit][a11y] **VcTextarea** has no accessible name (label is a div; `aria-labelledby` points at itself) | UI kit & a11y | vc-frontend #2531 |
| VCST-5990 | Medium | [Cart][Quotes][a11y] **Quantity stepper** flags a range violation it never explains (WCAG 3.3.1). **Spec conflict:** AC1 says "explain before commit", the fix still commits the typed quantity | UI kit & a11y | vc-frontend #2533 |
| VCST-5989 | Medium | [Support] `GET /api/seoinfos/explain` returns no stages when a permalink fails to resolve | Platform settings & SEO admin | vc-module-seo #22, vc-module-catalog #910 |
| VCST-5978 | Medium | [UI-kit] **VcSelect:** Escape in an open dropdown also closes the surrounding VcModal | UI kit & a11y | already fixed by VCST-5869 (vc-frontend #2486, 26-19) |
| VCST-5945 | Medium | **Top header overlaps itself at 1280 px** when signed in | UI kit & a11y | vc-frontend #2534 |
| VCST-6306 | Low | Admin: **store SEO records cannot be deleted** (Delete disabled) | Platform settings & SEO admin | vc-module-seo #24 |
| VCST-6265 | Low | Account sidebar breaks "Coupons & promotions" mid-word at 768–1279 px | UI kit & a11y | vc-frontend #2571 (**not on `FRONT_URL`**) |
| VCST-6180 | Low | Sales Rep: My recent orders wraps Total and Date mid-value | Sales Rep hub | vc-frontend #2537 (shared with 6153). **No QA verdict on the ticket** |
| VCST-6176 | Low | Account menu: **Returns icon** renders as the legacy solid glyph | Returns — organization | vc-frontend #2544 |
| VCST-6175 | Low | [Sales Rep][i18n] Customer orders: status chip shows the raw English status when the list is empty | Sales Rep hub | vc-frontend #2541 |
| VCST-6153 | Low | Sales Rep: Top sellers wraps Revenue and rank mid-number | Sales Rep hub | vc-frontend #2537 |
| VCST-6100 | Low | [GA] Search-bar `view_item_list` is pushed on page load for the URL keyword with no dropdown shown (`BL-GA4-001`) | Search bar & analytics | vc-frontend #2529 |

> **Six tickets were closed Done on a PR-build verification:** 6307, 6265, 5945, 6100, 6096 and 6176.
> Their QA comments say so and ask for a re-check after deploy. Two of them (6307, 6265) are still
> **not on `FRONT_URL`** (banner). These are post-deploy confirmations, not new testing. Each is one
> short pass on the deployed build.

### 2.3 TechDebt / Structural (QA-relevant — product behaviour, test impact)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6199 | **High** | [Support] SQL Queries: **configurable command timeout** (`SqlQueries.General.CommandTimeout`, default 30 s), applied to preview, execute and export. **Bundled:** xlsx export moves NPOI → MiniExcel (content type, date/time formats). AC3 (a clear timeout message) is not met on Linux + SQL Server ("Unknown error 258"), accepted as non-critical | SQL Queries | vc-module-sql-queries #25 |
| VCST-5755 | Medium | [BE] Sales Rep Hub **statistics cache invalidation** across instances (Redis backplane). New runtime flags `SalesRep.Statistics.*InvalidateOnChange` (TopSeller defaults to false = intentionally stale) | Sales Rep hub | vc-module-sales-rep #18 |
| *(unlinked)* | — | **vc-frontend #2547:** backend packages + GraphQL types regenerated against platform 3.1076, **`requestPasswordReset` query removed** from the storefront types. Forgot-password is a P0 auth path, so it is a regression target even with no ticket | Auth | vc-frontend #2547 |
| *(selector impact)* | — | **VCST-6001** renames the calendar buttons on `/account/orders` and the sales-rep filter. **VCST-6077** moves `/company/calendar` → `/company/tasks`. **VCST-5880** changes the compare DOM to one table. **VCST-6009** makes raw content POST need If-Match, which breaks any seeder or case that posts Page Builder content | — | see §5.1 decision notes for affected case IDs |

### 2.4 Out of Scope

- **`[Agentic QA]` / this repo's tooling (9):** VCST-6282, 6225, 6221, 6189, 6186, 6179, 6122 (KB, `/preflight`), VCST-6156 (KB capture contract, Bug), VCST-6150 (`/qa-env-upgrade`).
- **CI / repo / team setup (5):** VCST-5414 (GitHub actions into `.github`, the 20-repo workflow sweep), VCST-6210 (CI for `vc-frontend-next`), VCST-6194 (merge 59 release to Next), VCST-6252 (storefront GitHub teams), VCST-6187 (GraphQL codegen `--only`, dev tooling).
- **Demo / PoC (3):** VCST-6030 (new e-commerce theme PoC, `vc-frontend-next` #2), VCST-6076 (Sales Rep demo account on Virto Start), VCST-5857 (AI-powered demo reskin; its own text puts storefront and modules out of scope). **D2** in §5.3.
- **QA run / environment activities (3):** VCST-6161 (smoke on Virtostart-20), VCST-6036 (regression on QA, theme only), VCST-6038 (update modules on vcst environments).
- **Test automation (2):** VCST-6033 (Python → TypeScript test migration; also vc-frontend #2553, vc-platform #3131, vc-modules #81), VCST-6285 (platform auto-test seeder fails with 428 — the **symptom** of VCST-6009's If-Match contract, recorded there).
- **`vc-frontend-next` (1):** VCST-6214, regression of the 2.59 merges into the new theme. QA PASS WITH NOTES on alpha 2685 (2026-10-09). That theme is not what `FRONT_URL` serves today. **D2.**
- **`vc-shell` framework (1):** VCST-5670 (focus lands on body; PASS WITH NOTES on vcmp-dev). A separate product, as in 26-19. The 8 `vc-shell` and 6 `vendor-portal` PRs (VM-* keys) in the window are Marketplace work and are out of scope for the same reason.
- **TechDebt behind a flag (1):** VCST-5761 (Frontend Modularity, declared plugin contributions; vc-frontend #2504, x-api #89, vc-platform #3127). The module-federation switch ships **off**, and the developer states there is nothing to test. **Watch item:** x-api #89 adds `store.plugins` contributions to a P0 query, which the 078 smoke net covers.
- **Review / spike (3):** VCST-6248 (MySQL 8.4 default; ships in Platform 3.1078.0 but matters only to MySQL deployments, and no QA environment runs MySQL), VCST-6092 (dormant repos review), VCST-6230 (Paprika theme spike, empty ticket).
- **Not Done, but deployed this window and a live risk:** the **Stable 16 hotfix stream**. VCST-6286 (subscription job fails on orders with a payment; subscription #128), VCST-6287 (recurring jobs scheduled with default cron after start; background-jobs #6), VCST-6315 (cron setting save 500; platform #3135), VCST-6312 (background-jobs list collapses same-named handlers; background-jobs #7), VCST-6313 (content search returns a Task envelope; content #224), VCST-6324 and VCST-6181 (admin SEO/link-account blades). All of these PRs are in builds now on `vcst`. They are tracked by their own `/qa-hotfix-check` flow; this plan activates their suites as regression context only (095 background jobs, 059/060 content).
- **Tested, not Done** (regression context only): VCST-4464 (onX fulfilment), VCST-6081 (infinite loop uploading a file to a configurable product), VCST-6281 (upload error messages drop the parameter), VCST-4973 (Page Builder toasts), VCST-6145 (missions redesign polish), VCST-6200 (PlatformOperationLog index), VCST-5641 (cache metrics).
- **Ready for test, deployed on `FRONT_URL`:** VCST-6017 (beacon analytics). It is the storefront build itself (banner), so every storefront run this sprint exercises it.

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Configurable products — file attachments** | 5 | 4 | **20** | Critical | **Five tickets, five repos, one artifact.** File-experience-api, x-cart, x-order, quote and the storefront all changed how a buyer's configuration file is owned, authorized and shown: 5995 (owner 403), 5999 (quote re-owns files before the cart is cleared), 6000 (zero-byte rejection + `MinFileSize`), 5924 (links in cart/checkout/order), 6027 (checklist). 5995 is an **authorization boundary on buyer-uploaded documents**; its regression direction is a *different* buyer reading the file. Pre-upgrade orders' owner access is unconfirmed. The storefront half (5924) is not on `FRONT_URL` |
| **Lists sharing & Wishlist authorization** | 5 | 4 | **20** | Critical | Seven tickets on one feature in one window, with a **contract change** (`sharingSetting.targets[]` replaces `sharingSettings[].sharedWith`) and **two High authorization fixes**. 6116 wrote before it authorized, so its oracle is **storage**, read through an uncached admin path, never the xAPI response. 6125 let a co-owner take ownership. The sharing model went from one recipient to many with add/remove deltas, and "a write without scope leaves sharing untouched" is a rule that a client sending a partial payload can break. 5850 shipped in part |
| **Cart & order validation core** | 4 | 5 | **20** | Critical | 6089 changes **which validation result gates `createOrderFromCart` and `createQuoteFromCart`**. A wrong gate either rejects a valid cart at checkout or lets an invalid one through, both on the P0 revenue path. **Four x-cart PRs** merged in the window (#141 sharing, #144 zero-byte, #147 validation cache, #149 file authorization). The defect is cache-state-dependent: it needs order → quote → order on the same cached aggregate. QA noted an unattributed `$0` RFQ line price on PR builds, to re-check on the release |
| **Platform API authorization** | 4 | 4 | **16** | Critical | Two Support/security tickets close **missing-authorization** holes on four modules: Import (Highest), Tax, Catalog Personalization and Catalog Publishing. 6276 introduces **new permissions** (`tax:read`, `tax:update`, `personalization:update`), so the expected regression is **over-refusal**: a store manager role that used to see the Taxes widget or edit user groups is refused after upgrade. Import is not installed on `vcst`, so 6247 cannot be verified here |
| **Sales Rep hub (Tasks, dashboard, filters)** | 4 | 4 | **16** | Critical | The Tasks page is **re-routed and redesigned** (6077: `/company/calendar` → `/company/tasks`, a known spec conflict on rail width). The orders filter moves to VcDateRangePicker (6001, renamed controls). The statistics cache gains cross-instance invalidation (5755, Redis backplane, runtime flags). Also 6175/6153/6180 layout/i18n and 5687 empty state. `SalesRep` on `vcst` is a PR build not matched to #18/#21 |
| **Returns — organization returns** | 4 | 4 | **16** | Critical | A **new permission** (`xapi:my_organization:return:view`) opens an organization's returns to its members, read-only. That is a data-scope change on a P1 surface. "Drafts never listed" is the confidentiality rule. An earlier round FAILED on it (VCST-6226, a cancelled draft visible to the organization). AC-4 (organization email copy) is unratified. Two follow-up bugs (6261/6262) and five layout bugs are linked. **The storefront half is not on `FRONT_URL`** |
| **UI kit & storefront a11y / layout** | 3 | 4 | **12** | High | Two **global** UI-kit changes (6096 VcButton loading name, 5993 VcTextarea label) and the signed-in header at 1280 px (5945, every page). Plus VcSelect-in-modal Escape (5978), the quantity stepper explanation (5990, spec conflict), compare as one table (5880, a DOM change), sidebar wrap (6265) and dark-mode SKU (6307). Individually narrow; collectively on every page |
| **Punchout (cXML)** | 3 | 4 | **12** | High | A **passwordless sign-in path**: a single-use token signs in a mapped customer. The module is **not installed** on `vcst`. The part that **is** deployed is profile-experience-api #147, which adds a `ContactOrganizationsContext` and **organization post-filtering middleware**. That touches every organization query, so it is a regression risk for the org switcher and B2B organization suites even though punchout itself cannot run here |
| **Image Tools thumbnails (CVE library swap)** | 4 | 3 | **12** | High | The whole imaging library is replaced. Sizes per mode are meant to be unchanged; pixels may differ by resampling. JPEG on the regression environment was not proven (`.jpeg` upload 405). Thumbnail generation failing shows on every catalog surface as a missing or full-size image |
| **Page Builder** | 5 | 2 | **10** | High | Four fixes in one module, one of them a **breaking API contract** (6009: If-Match required on raw content POST; 428/412). That already broke the platform auto-test seeder (6285), and any of this repo's content seeders or cases that POST content are next. Keyboard a11y (6012) and the clipboard gate (6011, with a spec conflict on Paste state) change the Designer. Impact is bounded to CMS |
| **Auth / OTP** | 2 | 5 | **10** | High | 6131 is one message-level fix on the P0 sign-in path with an **anti-enumeration** constraint: the UI must not reveal whether an account exists or is locked. Which fix shipped (backend silent no-send or frontend wording) is not recorded. Also #2547 removes `requestPasswordReset` from the storefront's GraphQL types (§2.3) |
| **Search bar & analytics** | 3 | 3 | 9 | Medium | 5817 (layout shift, `BL-UI-003`; not on `FRONT_URL`) and 6100 (GA4 `search_bar` event, `BL-GA4-001`). **The deployed theme carries VCST-6017's analytics code on top of `dev`**, so a 6100 result on `vcst` is about the combination |
| **Platform settings & SEO admin** | 3 | 3 | 9 | Medium | 6093 (typed reads honour the configuration DefaultValue override; needs config + restart), 5989 (SEO explain stages; Seo and Catalog must be pinned together), 6306 (store SEO Delete). Admin-only, but 6093 changes how every typed setting read resolves |
| **Push messages audience** | 3 | 3 | 9 | Medium | 5944 rebuilds the audience builder. "Previewed count = delivered count" is the core rule, and wildcard operators return 0 on ElasticAppSearch (an open product decision) |
| **Storefront orders date filter** | 2 | 4 | 8 | Medium | 6173: date-preset arithmetic at month boundaries and east of UTC. Needs a browser clock override and a non-UTC timezone; the next natural trigger is 2026-10-31 |
| **SQL Queries** | 2 | 3 | 6 | Medium | 6199: a configurable timeout plus a bundled export-library swap (NPOI → MiniExcel). The library swap carries more risk than the timeout; its xlsx output formats changed |
| *Agentic QA tooling · CI · demo/PoC · `vc-frontend-next` · `vc-shell` · Stable 16 hotfix stream* | — | — | — | *Out of scope* | §2.4. Not scored; not gaps |

**Six Critical domains, and four of them are authorization changes.** 26-19's Criticals were new entry
points and no-AC refactors. This sprint's are fixes to *who is allowed*. Those fixes already passed QA on
PR builds, so the open question is narrower: **does the merged, deployed build still refuse the wrong caller
and still admit the right one?** Each of these needs a **divergent pair** in the data, one caller who must
be refused and one who must be let through, or the case passes in both the fixed and the broken state.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-----------|------|--------------|------|-----------|
| Configurable products — files | ✅ **primary** (PDP checklist, cart/checkout/order links) | ✅ (file owner, admin 200) | ✅ (file URLs: 200/403 matrix) | ✅ **primary** (`addItem` sections, `createQuoteFromCart`, order `files.url`) | — | — |
| Lists sharing & Wishlist authz | ✅ **primary** (Share dialog, recipient flows) | ✅ (uncached storage read) | ✅ | ✅ **primary** (`changeWishlist`, `addWishlistItem`, `updateWishListItems`, `sharedWishlist`, `sendCustomerCommunication`) | — | — |
| Cart & order validation core | ✅ (checkout, quote request) | ✅ (order created/rejected) | — | ✅ **primary** (`createOrderFromCart`, `createQuoteFromCart`, bulk add) | — | — |
| Platform API authorization | — | ✅ **primary** (Taxes widget, product User groups, channel completeness under a non-admin role) | ✅ **primary** (anonymous / under-permitted / permitted) | — | — | — |
| Sales Rep hub | ✅ **primary** | ✅ (Tasks module, statistics flags) | — | ✅ (`salesRepTasks`, statistics) | ✅ (date range picker) | — |
| Returns — organization | ✅ **primary** | ✅ (permission grant) | — | ✅ **primary** (org-scoped returns query) | ✅ (contrast) | — |
| UI kit & a11y / layout | ✅ **primary** | — | — | — | ✅ **primary** | — |
| Punchout | ✅ (punchout mode) | ✅ (Punchout user widget) | ✅ **primary** (`/api/punchout/cxml`) | ✅ (org post-filtering, deployed) | — | — |
| Image Tools | ✅ (rendered thumbnails) | ✅ **primary** (regenerate, settings) | ✅ | — | — | — |
| Page Builder | ✅ (published page) | ✅ **primary** (Designer) | ✅ **primary** (ETag / If-Match / storeId) | — | ✅ (Designer keyboard) | — |
| Auth / OTP | ✅ **primary** | — | ✅ (`/api/otp/request`, `/connect/token`) | — | — | — |
| Search bar & analytics | ✅ **primary** | — | — | — | — | ✅ **primary** (`dataLayer`) |
| Platform settings & SEO admin | ✅ (SEO resolution) | ✅ **primary** | ✅ (`/api/seoinfos/explain`) | — | — | — |
| Push messages audience | ✅ (push inbox) | ✅ **primary** | ✅ (`preview-recipients`) | — | — | — |
| Orders date filter | ✅ **primary** | — | — | ✅ (orders filter) | — | — |
| SQL Queries | — | ✅ **primary** | ✅ (execute / export) | — | — | — |

### 4.2 Testing Approach by Priority

**Step zero for every storefront ticket: confirm the theme carries the PR.** Read the storefront version
(footer `Ver.` or the bundle) and check it against §11's deploy column. Six Done tickets are not on the
current theme (banner); they are `PENDING-DEPLOY` until `FRONT_URL` serves a `dev` build at or after
2026-10-14 08:24 UTC (#2574). **Backend tickets:** the module versions in §11 were read on 2026-10-14;
re-read them if a test day starts after a deploy.

1. **Configurable products — files (20): the authorization matrix first, then the FLOW.** Every file
   surface (cart line, order line, quote line) gets the same matrix: **owner → 200, a second buyer in
   another organization → 403, anonymous → 403, admin → 200.** A 200 for the owner alone proves nothing.
   Then the FLOW: configure with a file → cart → quote from cart → **clear or delete the original cart** →
   quote file still resolves (5999) → order → order details link opens (5995/5924). Zero-byte: required
   section + 0-byte only → refused; 0-byte + real file → accepted; optional + 0-byte → accepted (6000).
   Probe one **pre-upgrade order**: its owner access was left unconfirmed.
2. **Lists sharing & Wishlist authz (20): read storage, not the response.** For 6116, an unauthorized
   `addWishlistItem` must leave the stored quantity unchanged, read through an uncached admin path. For
   6125, a Write co-owner's `changeWishlist` that carries scope or sharing is refused, and the owner and
   scope are unchanged afterwards. Then the sharing model: share with A, add B (A keeps access), remove A
   (B keeps access), Stop sharing (old link 404), re-share (same key). 6104's widen-to-public path: no
   revocation warning, the link becomes public read-only. 5850: send to several organizations via the
   shipped entry points only.
3. **Cart & order validation core (20): reproduce the cache state.** The defect needed order → quote →
   order on the **same cached aggregate**. Run that sequence with a cart that is valid for one rule set
   and invalid for another, and assert the gate uses the rule set it just validated. Bulk add must return
   `CART_INVALID_PRODUCT` / `LINE_ITEM_LIMIT` as operation errors. Re-check the RFQ `$0` line price QA
   saw on the PR builds, now on the release.
4. **Platform API authorization (16): the three-caller matrix, both directions.** For each endpoint group
   (tax, personalization, completeness): **anonymous → 401; authenticated without the new permission →
   403; with it → 200.** Then the over-refusal direction: the Admin Store Taxes widget, the product User
   groups blade and channel completeness, under a **non-admin role granted the new permissions**. And
   **storefront cart tax unchanged**: the storefront calls tax through the service path, not the
   permissioned API. 6247 is `BLOCKED (not installed)` on `vcst`; it was verified on the stable and
   regression environments by its own hotfix flow.
5. **Sales Rep hub (16), Returns — organization (16).** Sales Rep: Tasks as a FLOW on the new route
   (`/company/tasks`; the old route is a 404) with one task per scope chip and `?filter=overdue`. **Hold
   the rail-width assertion** (spec conflict). VcDateRangePicker: start > end, one-sided, under/over 640 px.
   Statistics cache: a change by one rep reflected without waiting for the TTL. Returns organization: a
   **divergent pair**, a member with the new permission and one without in the same organization, plus a
   **draft and a cancelled draft** that must never appear. The storefront half waits for the deploy; the
   xAPI half (Return 3.1005.0) can run now.
6. **High (10–12).** UI kit: VcButton loading name and VcTextarea label as a **sibling sweep** across
   every consumer (Lists Create list, Invite member, quote comment, sales-rep task notes), not one
   instance. Header at 1280 px with a **long organization name** (the trigger). Punchout: the cXML status
   matrix on an environment that has the module; on `vcst`, the **org post-filtering** regression (org
   switcher, multi-org member). Image Tools: one thumbnail per mode and per format, sizes against the
   pre-swap expectation. Page Builder: two concurrent writers → one 200, one 412; no version → 428; **and
   re-run this repo's content seeders**, which may now 428 like 6285 did. Auth/OTP: a locked account
   with a **correct** code must not be told the code is wrong, and must not reveal that it is locked.
7. **Medium (6–9).** 6100 on `dataLayer` (note the VCST-6017 overlay). 6093 needs a configuration override
   and a restart, so run it where QA can restart, never by saving the settings blade. 6173 with a clock
   override at UTC+3 on the 1st and 31st. 6199 export formats (date/time cells) after the library swap.

**Cross-cutting:** every Critical domain gets a cross-browser pass on two lanes. All three Playwright
lanes are click-capable (firefox since 2026-09-08). HAR capture on every run. Max 3 concurrent browser agents.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Configurable products — files | **FLOW** first (configure → cart → quote → clear cart → order → order details) + **Decision Table** (caller × file owner entity × surface) + **BVA** on file size (0, 1 byte, `MinFileSize`) | The file changes owner twice in the chain (cart → quote, cart → order), and each hand-off is where a 403 or 404 appeared |
| Lists sharing & Wishlist authz | **Divergent pair** (owner vs co-owner; recipient A vs B) + **State Transition** (private → shared → widened → narrowed → stopped → re-shared) + Error Guessing (partial payloads without scope) | An authorization fix is only decidable with a positive control in the same data; sharing is a state machine whose wrong transition revokes the wrong person |
| Cart & order validation core | **State Transition** over the cached aggregate (validate `*` → validate `default` → gate) + **Decision Table** (rule set × validity) | The defect is a stale read across a cache hit; only a sequence reproduces it |
| Platform API authorization | **Decision Table** (caller: anonymous / no permission / permission × endpoint group) + negative EP for the over-refusal direction | Three callers per endpoint, and the regression direction of a hardening fix is over-refusal |
| Sales Rep hub | **FLOW** (Tasks lifecycle on the new route) + **EP** (scope chips) + **BVA** (640 px; start = end; one-sided range) | A redesign plus a re-route, with control-level behaviour at a breakpoint |
| Returns — organization | **Divergent pair** (permitted vs non-permitted member) + **EP** over return state (draft, cancelled draft, submitted, approved) | "Drafts never listed" is decided only when a draft exists |
| UI kit & a11y / layout | WCAG 2.2 AA checklist + **sibling sweep** over consumers + **BVA** on width (1279/1280, 767/768) | Global components are only covered when every consumer is visited |
| Punchout | **Decision Table** (cXML status by failure class) + State Transition (token issued → used → reused → expired) | A single-use credential is a state machine; the status table is the contract |
| Image Tools | **EP** (mode × format) | A library swap is caught by visiting each mode and format once |
| Page Builder | **State Transition** (version current → stale) + Error Guessing (no / weak / wildcard ETag) | Optimistic concurrency is a version state machine |
| Auth / OTP | **Decision Table** (account state × code correctness → message) | Anti-enumeration means two different states must produce the same visible message |
| Search bar & analytics | Event-count assertions on `dataLayer` (load, focus, type, reopen) | The oracle is event count, not UI |
| Settings, SEO, Push, SQL Queries | Error Guessing + EP | Single-defect guards and admin flows |
| Orders date filter | **BVA** on calendar boundaries (1st, 29th–31st) × timezone (UTC, UTC+3) | Date arithmetic fails at the boundary and off-UTC |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

Classified by the layer directory each CSV lives under in `config/test-suites.json`, not by Jira component. **All 63 IDs verified present in the manifest (154 suites, 38 selections) and directory-checked: 30 Frontend, 33 Backend.** Every mapping was grounded by grepping the parsed suite rows (all 154 CSVs, 5,274 rows, full-row text: Steps, Assertions, References). Ticket-key stamps were searched first. A suite named in a ticket's chain with no key stamp is marked "consumer". Frontend suites read `{FRONT_URL}`, Backend suites read `{BACK_URL}`; both are the `vcst` stand (read 2026-10-14 09:02Z).

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`) — 30

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 042 | Smoke Tests | vc-frontend | VCST-6096 (global VcButton), VCST-5945 (header on every page) | P0 |
| 043 | Google Analytics | vc-frontend | VCST-6100 (search-bar `view_item_list`); VCST-6017 already stamped (`GA-034..053`). **Reads the unmerged #2543 build (note 1)** | P2 |
| 045 | Accessibility Tests | vc-frontend | VCST-6096, 5993, 5978, 5990, 6307 (legacy Manual rows; the new oracles go to GAP-19, not here) | P2 |
| 046 | Localization Tests | vc-frontend | VCST-6175 (de-DE status chip), 6077 (new Tasks strings), 6176 | P2 |
| 048c | Layout Stability (runner-native) | vc-frontend | VCST-5945, 5817, 6265, 6153/6180 (width probes); `LAYOUT-COMP-VCBUTTON-*` is a consumer of 6096 | P1 |
| 002 | Product Detail | vc-frontend | VCST-6307 (SKU line in dark mode; consumer), 6027 (price block) | P1 |
| 004 | Search Core | vc-frontend | VCST-5817 (scope slot; consumer), 6100 | P1 |
| 098 | Product Compare v2 | vc-frontend | VCST-5880 (already stamped, `CMP-036..053`). **Stale on the stand (note 1)** | P2 |
| 028 | Cart Core | x-cart | VCST-5990 (quantity stepper; `CART-031/035` are Manual), VCST-6089 | P1 |
| 029 | Cart Validation & Persistence | x-cart | VCST-6089 (consumer: validation mirror + cache) | P1 |
| 011 | Checkout Flow | vc-frontend | VCST-6089 (`createOrderFromCart`), VCST-5924 (review step; multistep checkout is off on the stand) | P1 |
| 013 | Checkout B2B | vc-frontend | VCST-6089 (consumer) | P1 |
| 015 | Quotes | vc-module-quote | VCST-6089 (`createQuoteFromCart`), VCST-5999/5995 (quote-owned files); **stale-risk `QUOTE-031/032` (VCST-6001)** | P1 |
| 014 | Orders Frontend | vc-frontend | VCST-5924, 5995 (files on Order Details); **stale-risk `ORD-097/098` (VCST-6001)** | P1 |
| 014b | Orders Frontend — Returns, Documents & Date Filtering | vc-frontend | VCST-6173 (Created-date presets), VCST-6001 (calendar names) | P1 |
| 014c | Orders Frontend — Returns (buyer's own returns + agent decisions) | vc-frontend | VCST-5884 (already stamped, 24 rows), 6107, 6176. **Org tab absent on the stand (note 1)** | P1 |
| 072 | Configurable Products UI — Sections, Cart & Checkout | vc-frontend | VCST-5924, 6000 (cart/checkout file display) | P1 |
| 072b | Configurable Products E2E | vc-frontend | VCST-5924, 5995, 5999 (`CFG-E2E-024` is the only file-through-order row; Manual, no link assertion) | P1 |
| 072d | Configurable Products File & Text Sections | vc-frontend | VCST-6000 (`CFG-FILE-003` already asserts 0-byte rejection; Manual, stamped VCST-4827) | P1 |
| 072e | Configurable Products UI — Conditional Sections | vc-frontend | VCST-6027 (consumer: dependent options appear in the checklist) | P1 |
| 072f | Configurable Products UI — Promotions + PDP checklist | vc-frontend | VCST-6027 (already stamped, `CFG-CHK-001..028`) | P1 |
| 007 | B2B Lists & Shared | vc-frontend | VCST-5707 (36 stamped rows), 5925, 5728, 6104, 6125. **`B2C-LIST-043` asserts the pre-rework behaviour (M7)** | P1 |
| 104 | Auth OTP Sign-In | vc-module-otp | VCST-6131 (locked-account message); the module **is installed** on the stand now (note 3) | P1 |
| 089 | Sales Rep — My Customers | sales-rep | VCST-5850 (Send message entry points), 5925 (consumer) | P1 |
| 091 | Sales Rep — Customer Profile | sales-rep | VCST-6153/6180 (recent orders, top sellers), 5687 (customer-page empty state) | P1 |
| 093 | Sales Rep — Hub Dashboard | sales-rep | VCST-5687, 5755 (stat tiles), 6077 (`All tasks` link) | P1 |
| 097 | Sales Rep — Customer Orders | sales-rep | VCST-6001 (already stamped, 13 rows), 6175 (`SR-CO-032`, EXPECTED-RED until this fix), 6153 | P1 |
| 106 | Sales Rep — Tasks (storefront) | sales-rep | VCST-6077 (already stamped, `SR-TK-001..029`). **sales-rep on the stand is a PR build (note 1)** | P1 |
| 033 | Auth Company & Account Menu | vc-frontend | VCST-6265 (sidebar wrap), 6176 (Returns icon) | P1 |
| 100 | Catalog Personalization — Storefront Visibility | catalog-personalization | VCST-6276 (consumer: personalization reads are now permission-gated) | P0 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`) — 33

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 078 | Backend Smoke — Platform, API & GraphQL | vc-platform, x-api | VCST-6093, 6276 (new permissions); VCST-6248 (MySQL default) is out of scope (§2.4) and is a watch item only | P0 |
| 078b | Backend Smoke — Catalog, Search & Pricing | catalog | VCST-5989 (catalog #910), 6268 | P0 |
| 078c | Backend Smoke — Orders, Customers & Marketing | order, customer | VCST-6089 (x-order #53) | P0 |
| 078d | Backend Smoke — Content & Admin Workflows | pagebuilder | VCST-6009/6010/6011/6012 | P0 |
| 049 | Platform API | vc-platform | VCST-6276 (anonymous 401, permission gates; no row names tax, personalization or completeness) | P0 |
| 020 | Platform Users, Roles & Settings | vc-platform | VCST-6276 (roles lose access without the new permissions), VCST-6093 | P1 |
| 101 | Platform — Sign-in Log | vc-platform | VCST-6093 (`SIL-020/022/024/057` read the setting through the stored path; consumers) | P1 |
| 034 | Store Management | store | VCST-6276 (Store Tax widget), VCST-6306 (`STORE-017` SEO list) | P1 |
| 050i | GraphQL Configurable Products | x-cart | VCST-5995/5999/6000/5924 (file section); in the `configurable-products` group | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | x-cart | VCST-6089 (bulk add, `CRB-GQL-132`) | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | x-cart | VCST-6089 (`CRX-GQL-013/024..026/053..055`, createOrderFromCart rows) | P1 |
| 050b5 | GraphQL xCart — Per-RuleSet Validation | x-cart | VCST-6089 (the ruleSet cache and gate) | P1 |
| 050c | GraphQL xOrder | x-order | VCST-6089, 5995 (order files) | P1 |
| 050h | GraphQL Wishlist | x-cart | VCST-5707, 5925, 5728, 5850, 6116, 6125 (already stamped, 15 rows) | P1 |
| 050m | GraphQL xAPI — Sales Rep | sales-rep | VCST-5850, 5755, 5925; **`SR-GQL-042..053` use singular `organizationId` (M8)** | P1 |
| 050d | GraphQL xProfile | profile-xapi | VCST-5886 (#147 org post-filtering touches every organization query; `PRF-GQL-072..093`) | P1 |
| 050o | GraphQL xAPI — Returns | return | VCST-5884 (already stamped, `RET-ORG-001..015/042..044`) | P1 |
| 050l | GraphQL xAPI — Push Messages | push-messages | VCST-5944 (already stamped, 5 rows) | P2 |
| 059 | Page Builder | pagebuilder | VCST-6009 (Designer save path; `CMS-113/116/122/130` are consumers), 6010, 6011 | P1 |
| 060 | Page Builder — Designer, Content & Storefront | pagebuilder | VCST-6009, 6012 | P1 |
| 060b | Page Builder — Field Types, Asset Library & Operations | pagebuilder | VCST-6011, 6012 (`CMS-184` neighbour) | P1 |
| 066 | SEO | seo | VCST-5989 (`SEO-001` consumer: Debug no longer records broken links) | P1 |
| 053 | Catalog Admin Categories | catalog | VCST-6306 (category SEO list, `CATA-015/037`; consumer) | P1 |
| 068 | Push Messages | push-messages | VCST-5944 (already stamped, 10 rows) | P2 |
| 069 | Image Tools | image-tools | VCST-6268 (28 legacy rows, no Automation_Status) | P2 |
| 062 | Assets | assets | VCST-6268 (event-based thumbnail generation on upload; consumer) | P1 |
| 073 | Returns | return | VCST-5884 (Admin UI/REST consumer) | P1 |
| 073a | Returns — Authorize & Notifications | return | VCST-5884 (already stamped: `RET-ORG-035..039/053`, org email copy) | P1 |
| 073b | Returns — Admin SPA Decisions | return | VCST-5884 (already stamped: `RET-ORG-040/041/045..047`) | P1 |
| 085 | Task Management | task module | VCST-6077 (consumer: admin-created, canceled and dateless tasks surface on the Tasks page) | P2 |
| 099 | Catalog Personalization (User Groups) | catalog-personalization | VCST-6276 (`PERS-008`: write without `personalization:update`) | P1 |
| 076 | Channels | catalog-publishing | VCST-6276 (completeness evaluators now need `channel:read`; 14 legacy rows, no status) | P2 |
| 105 | OTP Sign-In API | vc-module-otp | VCST-6131 (`OTP-028` blocked account, `OTP-019/020` lockout) | P1 |

**Decision notes**

1. **Deploy state decides what a FAIL means (rule: not a regression on a stale stand).** `{FRONT_URL}` serves theme `2.60.0-pr-2543`, the **unmerged** PR build of VCST-6017, 13 commits ahead and 7 behind `dev` (orchestrator-supplied). The frontend PRs of six Done tickets are not in it, so these reads are **stale UI, and a FAIL is not a regression**:
   - **#2518 (VCST-5880):** all 18 stamped `098` `CMP-036..053` assert the one-table DOM and will read the old two-table build. Pre-existing `CMP-021` (`.compare-products__head`), `CMP-003`, `CMP-009/024`, `CMP-022` select old markup; confirm after the merge.
   - **#2523 (VCST-5884 frontend):** the Returns organization tab is absent. In `014c` the storefront rows (`RET-ORG-016..033`, `048..052`) read a page without it. `050o`, `073a`, `073b` hit the API and Admin and are unaffected.
   - **#2485 (VCST-5924):** no file links in cart, checkout or Order Details. `072b CFG-E2E-024` and `014`/`015` file rows read a build without them.
   - **#2522 (VCST-5817)**, **#2571 (VCST-6265)**, **#2574 (VCST-6307):** the scope-slot, sidebar-wrap and PDP dark-mode probes in `048c`, `004`, `033`, `002` read the pre-fix build.
   - **Module side:** `sales-rep` is a PR build (`3.1014.0-pr-13`), "unverified vs #18/#21" (orchestrator). Treat `106`, `093`, `050m`, `050h` and `007` results as unconfirmed for VCST-5755/5925/5850/5728 until the build is confirmed. Every other sprint module on the stand was released after its PRs merged (inferred, not proven per PR).
2. **vc-module-import and vc-module-punchout are not installed** (VCST-6247, VCST-5886). Their cases are authorable and land `BLOCKED` on the stand, not `FAIL`. They are in §5.2 as `none`-target gaps with proposed suites.
3. **`virtocommerce.otp` 3.1000.0 is installed on the stand** (preflight). 26-19 EXP-03 was gated on it not being installed, so `104`/`105` are runnable now (store setting `OtpSignIn.Enabled` still has to be on; not checked).
4. **Spec conflicts are held, not resolved here (§6 "hold the assertion").** VCST-6077 rail width, VCST-5990 "before commit", VCST-6011 Paste state, VCST-5884 AC-4, VCST-5850 partial delivery, VCST-6027 Done-despite-FAIL (VCST-6188). The existing `SR-TK-019`, `CFG-CHK-011` and `RET-ORG-035..039/053` already keep the spec-side expectation; none is rewritten to match the build.
5. **Breadth is not 48 independent changes.** VCST-5707/5925/5728/5850/6104/6116/6125 are one PR set (x-cart #141, sales-rep #21, cart #194, vc-frontend #2476), and the five Configurable-file tickets share x-cart, x-order, quote and file-experience-api. Already-stamped suites (`007`, `050h`, `014c`, `050o`, `073a/b`, `098`, `106`, `097`, `072f`, `050l`, `068`) are activated as the net, not as new gaps.
6. **Doc-over-artifact guard.** No doc-vs-suite contradiction was found, so nothing is overwritten on a doc's authority. `OTP-018` asserts single-use of an OTP code; KB-06FE6C8D recorded the same code accepted twice on qa1. The case stays as the spec expectation (hold; expect `FAIL`, do not invert).
7. **Observed (KB) used:** KB-1336804F (Page Builder content token: 428 without, 400 for a weak header token, body token via `includeVersion=true` on a proxied stand), KB-6E56FB4B (a Write member of an Organization-scope list can be set up and refused on `changeWishlist`/`removeWishlist` since x-cart 3.1038: the co-owner fixture is feasible, contrary to the `WISH-045` "FIXTURE-GAP" note), KB-06FE6C8D (OTP replay).

**Selector and contract impact (stale-risk, listed not edited)**

- **VCST-6001 (calendar buttons renamed `Open calendar: <label>`).** Exact-name clicks: `014 ORD-097/098`, `015 QUOTE-031` ("`Open calendar` or equivalent"). Natural-language or prefix matches that should survive: `014b ORD-074/078/080`, `ORD-081..083`, `015 QUOTE-032`. `014b ORD-076` asserts distinct names and will now pass. `097 SR-CO-039..051` were authored against it.
- **VCST-6077 (`/company/calendar` → `/company/tasks`).** Only `106 SR-TK-002` names the old route, and it asserts the 404, which is intended. No other suite carries the old route or a Calendar nav label.
- **VCST-5880 (compare is one table).** Old-markup selectors in `098`: `CMP-021` (`.compare-products__head`), `CMP-003` (`.compare-products__actions`), `CMP-022` (`.compare-products__empty-state`), `CMP-009/024` (`.compare-table__product`). Unverified whether each class survives #2518.
- **VCST-6009 (raw page-content POST needs `If-Match`).** No suite row posts raw content (only `059 CMS-120/124` use the copy endpoint `.../content/{sourceGroupId}`; whether copy now needs a token is unverified, §5.3 EXP-05). **Seeders:** `scripts/seed-data/cms/seed-pagebuilder-pages.mjs` already reads `includeVersion=true` and sends `If-Match` (HEAD). **`scripts/seed-data/cms/seed-pagebuilder-shared-components.mjs:120` (`postPageContent`, `npm run seed:pb-shared`) posts raw grouped content with no token, so it will `428` on PageBuilder 3.1034.0** (VCST-6285 fixed the platform auto-test seeder, not this one). Not edited; route to `test-data-engineer`.
- **VCST-5925/5707 (sharing contract).** `007 B2C-LIST-043` ([Automated], promoted REG-2026-08-25-1128) asserts a **single-value** customer control, "the previously selected customer will lose access" and "only customer_b is retained" as `{OBSERVED}`. That is the behaviour VCST-5707 replaced, so it will `FAIL` on a build containing #2476: a stale inverted oracle (M7). Legacy scalar `sharedWithId` rows (`B2C-LIST-048/049/051`, `WISH-33/34/035`) remain valid by the 5925 AC ("legacy `sharedWithId` treated as one-element set").
- **VCST-5850 (`sendCustomerCommunication`).** `050m SR-GQL-042..053` and `007 B2C-LIST-041/048/049` send singular `organizationId`; `050h WISH-040` already sends `organizationIds`. Whether the singular input is still accepted is unverified (M8).

**Manifest findings (selection groups, re-checked against `config/test-suites.json`)**

- **M1 (carried, 26-19 M1, re-checked).** The `loyalty` group still omits **075d and 075e** (members: 075, 075b, 075c, 083, 083b, 083c, 083d, 075f, 083e). No loyalty ticket this sprint; carried only so it is not lost.
- **M2 (carried, widened).** `sprint` excludes 043, 045, 046, 047, 050m, 050m2, 063, 068, 069, 076, 089, 090, 091, 092, 092b, 093, 097. **Eleven of the 63 activated suites will not run under `regression:plan sprint`: 043, 045, 046, 050m, 068, 069, 076, 089, 091, 093, 097.** That drops the whole Sales Rep Critical domain except the new `106`, plus Image Tools (VCST-6268), GA (VCST-6100) and Push. `full` has the same Sales Rep and 096 exclusions.
- **M3 (partly closed).** A `returns` selection now exists (014c, 050o, 073, 073a, 073b). It still omits the order-entry link (014/014b) and the notification suites (057/058/068).
- **M4 (partly closed).** `auth` now includes 104 and 105. It still lacks 044, 049, 020 and 102. `backend` still excludes 092, 092b, 050m, 050m2, 094, 102. No `ucp` or `task-management` selection exists. **New:** the `sales-rep` group (050m, 050m2, 089, 090, 091, 092, 092b, 093, 097) omits the new **106**, and the `configurable-products` group (tag) omits 014/015, where the file-link and quote-file seams live.
- **M5 (carried, re-checked: still open).** `.claude/knowledge/execution/module-suite-map.md` contains no mention of 094, 095, 097, 102, 103, 104, 105, 106, 014b or UCP/OTP/Punchout (grep count 0 each). It says "All 99 suites" against 154, and its Sales Rep Frontend cell is 089-091, 093 (no 097, 106).
- **M6 (carried, narrowed).** BL domains `ret`, `push` and `ucp` are declared and empty (3 of 29), so **Returns (Critical) has no correctness oracle at all**, nor does Push. There is no OTP invariant (`104 OTP-001` cites `BL-AUTH-015`, which is the 5-step organization-resolution chain). There is no BL domain for Page Builder, Image Tools, Punchout or file-ownership authorization. Route candidate invariants to `/qa-review-oracles`. **Closed since 26-19:** domain maps now exist for Returns (`returns.md`) and Auth (`auth.md`); there is still none for Task Management, Punchout, Image Tools, Platform security or Lists sharing.
- **M7 (new). Stale inverted oracle.** `007 B2C-LIST-043` (see above). REPAIR it against the spec through `/qa-review-tests --fix`; do not edit the expectation to match the old build either way.
- **M8 (new). Unverified input contract.** `sendCustomerCommunication` singular `organizationId` in 15+ rows against the `organizationIds` the 5850 ticket describes. `.claude/knowledge/api/graphql-schema.md` lists the mutation but not the input type's fields (curated allowlist), so the schema file cannot answer it. Introspect `InputSendCustomerCommunicationType` once before authoring.
- **M9 (new). Seeder breaks on the deployed Page Builder** (`seed:pb-shared`, above).
- **M10 (new). Where the inputs and the repo disagree (reported, nothing overwritten).** (a) The VCST-6268 QA comment cites "suite 069b 20/24"; the manifest has **no 069b**, only `069` (28 rows, no Automation_Status). (b) *Withdrawn by the orchestrator:* the specialist reported six SBTM sessions as missing, but all seven are on disk (re-listed 2026-10-14); §5.3's D3 check is corrected. (c) `jira-details.json` flags **51** records test-relevant; the plan scopes **48** (§1). VCST-6248 (MySQL default; no QA environment runs MySQL), VCST-6214 (`vc-frontend-next`) and VCST-5670 (`vc-shell`) are out of scope per §2.4 (D2), so they carry no §6 count. (d) `WISH-045` calls the co-owner variant a FIXTURE-GAP, while KB-6E56FB4B recorded it on a rep-owned list with a Write member (GAP-04). (e) 26-19 said the OTP module was not installed; preflight now lists `virtocommerce.otp` 3.1000.0 (note 3).

**Not activated (in scope, deliberately skipped):** 090 (buyer-facing My Sales Reps, untouched), 092/092b (no Sales Rep Admin ticket), 075*/083* (loyalty untouched), 050e/050g/050j/050k/050n, 094/102 (UCP untouched), 095 (VCST-6312 is in the window but its ticket is not Done and the suite already carries `BGJ-006/014/053`), 064/064b (VCST-6199's xlsx export belongs to SQL Queries, not CSV import/export), 052 (Configurable Admin untouched), 057/058 (the return-email rows are in 073a), 001/003/005 (weak consumers of 5817), 063 (settings consumer, covered by 020 and 101), 017/017b/018/019.

### 5.2 Coverage Gaps — New Test Cases Needed

Every row quotes the grep so it can be re-checked. Scope is "all rows of all 154 suites" unless narrowed, case-insensitive, over the full row text. Equivalent shell check: `grep -rliE "<regex>" regression/suites`. The first block is new this sprint. The second block carries 26-19 gaps that were **each re-grepped today and are still open**. The third lists what closed.

| GAP | Ticket | Description | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-01 | VCST-5995 / 5999 | **Authorization of configuration files on order-, quote- and cart-owned files** (owner 200; other buyer, plain customer, anonymous 403; admin 200; quote re-owns the file before the cart is cleared; deleting the cart keeps the quote file). Grep `file.{0,40}(403\|forbidden)\|403.{0,40}file\|files?\.url\|fileUrl` returns 14 rows in 7 suites, none an owner-vs-other-buyer matrix (`CFG-GQL-029/030/032/055b` are cart-side section flips). `owner (can\|may) (open\|read)\|entitled\|re-?own` over 050i\|015\|050c\|014\|072b returns **0**. `015 QUOTE-013` is a generic "Quote with Attachments" Draft. Security-sensitive: needs two buyers of **different** users so the matrix can discriminate | 050i · 050c · 015 · 014 | test-management-specialist + test-data-engineer (two-buyer fixture) → qa-backend-expert |
| GAP-02 | VCST-6000 | **Server-side required-File validation and per-scope minimum size** (`addItem` with only a 0-byte file rejected with `CONFIGURATION_SECTION_FILES_REQUIRED`; real file or 0-byte + real succeeds; optional + 0-byte succeeds; `INVALID_MIN_SIZE` under a scope minimum). Grep `MinFileSize\|INVALID_MIN_SIZE\|FILES_REQUIRED` returns **0**. The UI half exists: `072d CFG-FILE-003` (Manual, stamped VCST-4827). No zero-byte or 1-byte alias exists in `UPLOAD_FIXTURES` (primary, smallPdf, smallXlsx, jpg, svg), and `test-data/uploads/large_logo.png` is an accidental 0-byte file: do not reuse it as a "large" fixture. The scope minimum is per-env config (set on qa only) | 050i (+ stamp `CFG-FILE-003`) | test-management-specialist + test-data-engineer → qa-backend-expert |
| GAP-03 | VCST-5924 | **File attached to a configuration is an openable link in cart, checkout review and Order Details.** Grep `(file\|attachment).{0,60}(link\|download\|href)\|(link\|download\|href).{0,60}(file\|attachment)` over 072*\|014\|015\|013\|011 returns 3 rows (`ORD-014`, `QUOTE-013`, `CFG-E2E-024`); `CFG-E2E-024` asserts "file reference preserved", not that it opens. No formal AC; checkout review step not verifiable (multistep off) | 072b (`[JOURNEY]`) · 014 | test-management-specialist → qa-frontend-expert |
| GAP-04 | VCST-6125 | **Co-owner (Write member) of an Organization-scope list: `changeWishlist` with scope/targets/message refused, `removeWishlist` refused, admin may remove, rename and item edits allowed, owner and scope unchanged.** Grep `co-owner\|co owner\|coowner` returns 2 rows: `B2C-LIST-077` (menu) and `WISH-045`, which declares the Write-member variant a **FIXTURE-GAP** and runs only the reader and other-rep refusals. KB-6E56FB4B shows the variant was observed on a rep-owned list with a Write member, so the fixture is buildable. Write and Read members must be seeded as a real pair (SECOND RULE) | 050h · 007 | test-management-specialist + test-data-engineer → qa-backend-expert |
| GAP-05 | VCST-6089 | **`createOrderFromCart` gates on the `*` ruleSet it just validated, not the last computed one; `createQuoteFromCart` gates on `default` + operation errors + deleted-product check; order → quote → order on one cached aggregate.** No key stamp anywhere. Grep `ruleSet` returns 10 rows (050b5 ×9, 083b ×1), none a gate; `createQuoteFromCart` 4 rows in 015 (`QUOTE-001/013/015/016`), none a deleted-product rejection (`deleted product\|removed product\|unpublished\|no longer (available\|exists)` over 015\|050b5\|050c = 1 row, `QUOTE-030`, a status case). The REG-2026-10-09-1716 defect repro was an ad-hoc probe and its run folder is pruned. Recheck the zero-priced RFQ line seen on that run after release | 050b5 · 050c · 015 | test-management-specialist → qa-backend-expert |
| GAP-06 | VCST-6276 | **REST authorization on Tax, Catalog Personalization and Catalog Publishing endpoints** (anonymous 401; `tax:read`/`tax:update`, `personalization:update`, `channel:read` matrix; legacy `EvaluateCompletenessJob` route removed; Admin widgets and storefront cart tax unaffected). Grep `tax:read\|tax:update\|personalization:update\|channel:read` returns **1 row** (`099 PERS-008`, write path only). `api/tax\|taxProvider\|Taxes widget\|evaluateTaxes` 4 rows, all Admin UI. Completeness: `076` 14 legacy rows with no status. 28 rows match `anonymous.{0,80}401`, none on these modules. **Breaking for non-admin roles, so role migration is part of the oracle** | 049 · 099 · 034 · 076 | test-management-specialist → qa-backend-expert |
| GAP-07 | VCST-6247 | **vc-module-import authorization** (anonymous 401 on history search, profile search and organization lookup; run/resume require authorization; org users scoped to their own organization; Admin and vendor-portal own-org view still work). Grep `api/import\|import/profiles\|execution/history\|ImportController\|vc-module-import\|Import module` returns 4 rows (075e `MSNA-014`, 078 `BSM-051/052`, 078c `BSM-071`), all platform data-import health. **Module not installed: authorable, `BLOCKED`** | **none** → propose `regression/suites/Backend/import-export/108-import-module-authz.csv` (ID 108 free) | test-management-specialist → qa-backend-expert |
| GAP-08 | VCST-5886 | **Punchout cXML** (setup request statuses 200/400/401/450/500, single-use token and lifetime, session lifetime and auto sign-out, "Punchout mode" with a single org and no switcher, Admin "Punchout user" widget and permissions, store setting gate, used or expired link → 403). Grep `punch-?out\|cXML\|ContactOrganizationsContext\|StartPage` returns **0**. profile-xapi #147 is installed and touches every organization query; regression net is `050d PRF-GQL-072..093` (no key stamp). **Module not installed; needs per-env `Punchout:Configurations` and a shared secret** | **none** → propose `Backend/punchout/109-punchout-cxml.csv` and `Frontend/punchout/110-punchout-storefront.csv` (109, 110 free); add 2–3 org-query guards to 050d | test-management-specialist → qa-backend-expert (+ qa-frontend-expert) |
| GAP-09 | VCST-6268 | **Thumbnail library swap: format and resize matrix.** Grep `WebP\|\bGIF\b\|TIFF\|\bSVG\b\|BMP\|SkiaSharp\|native` over 069\|062 returns **0**. `069` has `IMGTL-008/009/010` (FixedSize, FixedWidth/Height, Crop) and `IMGTL-028` (PNG vs JPEG), all legacy with no status. Unasserted: WebP/BMP/SVG supported, GIF/TIFF skipped without failing the task, regenerate vs process-changes vs on-upload generation. Assert **dimensions and task outcome, never pixels** (resampling differs by design). No GIF/TIFF/BMP fixture alias exists. The Jira "suite 069b" does not exist (M10) | 069 · 062 | test-management-specialist + test-data-engineer → qa-backend-expert |
| GAP-10 | VCST-6009 | **Page content concurrency token** (strong tag from `includeVersion=true`; no token 428; stale 412 and first author's work kept; weak, wildcard, list or mismatched 400; one winner under concurrent writers; Designer warns a stale tab, keeps edits, recovers). Grep `If-Match\|ETag\|\b428\b\|\b412\b\|eTag\|includeVersion` over 059\|060\|060b\|050f\|078d\|049 returns **0** (corpus-wide 1, `FWL-052`, unrelated). Use the body token, never the response header, on the proxied stand (KB-1336804F) | 059 · 060 | test-management-specialist → qa-backend-expert |
| GAP-11 | VCST-6010 / 6011 (+ 26-19 GAP-20) | **Shared Components: create rejects an unknown `storeId` (400, nothing persisted), real store 201, empty 400, out-of-scope store 403 before lookup; "Save selected as Shared Component" reachable with the clipboard permission denied; created component persists.** Grep `page-builder-shared-components\|shared-components\|Shared Component` over 059\|060\|060b\|050f\|078d\|049 returns **0**; `clipboard\|Paste\|Save selected as Shared` 3 unrelated rows (`CMS-037/077/168`). 26-19 GAP-20 (zero Shared Component coverage) is **merged here**, and its `PB_SC_*` fixtures and `seed:pb-shared` already exist (but see M9) | 060b · 059 · 060 | test-management-specialist → qa-backend-expert |
| GAP-12 | VCST-6012 | **Designer keyboard and a11y** (Tab reaches every section-tree control before the preview, icon-only controls named, no "(undefined)", Shared badge axe-clean, Escape closes and restores focus, no overlap at 375). Grep `keyboard.{0,60}(section\|tree\|designer)\|(section\|tree\|designer).{0,60}keyboard\|aria-prohibited\|ArrowUp` over 059\|060\|060b returns **1 row** (`CMS-184`, the overwrite dialog) | 060b | test-management-specialist → qa-testing-expert |
| GAP-13 | VCST-6131 | **OTP sign-in for a locked account: a correct code is not reported as wrong, and the UI discloses neither existence nor lock.** Grep `user_is_temporary_locked_out\|lockoutSecondsRemaining\|locked.{0,40}(message\|screen)` over 104 returns 1 row (`OTP-003`, the unknown-email mask). `105 OTP-019/020/028` cover the API (lockout, shared counter, blocked account). Fix path (backend silent no-send vs frontend wording) is **unconfirmed**; assert only the negative and the anti-enumeration rule | 104 · 105 | test-management-specialist → qa-frontend-expert |
| GAP-14 | VCST-5755 | **Sales Rep statistics cache invalidation** (cart and order changes evict the organization's cache; dashboard aggregate = sum of per-customer cards; `salesRepCustomers` sorted by order metrics reflects a change; flags runtime-flippable, TopSeller stale by default; other instance within about a second via Redis backplane). Grep `InvalidateOnChange\|statistics cache\|Redis\|backplane\|cache invalidat` returns 8 rows in 5 suites, none Sales Rep. Over 050m\|093\|091\|089\|097, `evict\|\bcache\|cached\|invalidat` returns 30 rows, all client-side Apollo/layout caching. The two-replica half **needs more than one replica and a Redis connection string** | 050m · 093 | test-management-specialist → qa-backend-expert |
| GAP-15 | VCST-5687 | **Dashboard and customer page when every block is hidden** show an empty-state placeholder with a way back (Edit layout / Restore default layout). Grep `All blocks are hidden\|every block (is )?hidden\|all (blocks\|widgets\|stats).{0,30}hidden\|empty.state.{0,40}(layout\|hidden)` returns 3 unrelated rows (`CAT-034`, `B2C-NOTIF-004`, `CPN-016`); `Restore default layout` over 093\|091 returns **0**. Placeholder wording is "e.g." in the ticket, so assert presence and the action, not the copy | 093 · 091 | test-management-specialist → qa-frontend-expert |
| GAP-16 | VCST-6153 / 6180 / 6265 / 5945 | **No mid-word or mid-value wrapping, and no overlap, at the breakpoints** (Revenue/Total/Date stay on one line in Top sellers and My recent orders; sidebar labels break at spaces between 768 and 1279; signed-in top bar on one line at 1280 and neighbours). Grep `mid-word\|mid-value\|breaks? mid\|split(s)? (mid\|across)\|wraps? (mid\|onto)` returns 3 rows (`SR-TK-020`, `RET-ORG-027`, `CMP-001`), none on these surfaces. `048c` has `LAYOUT-COMP-HEADER-001/003` (spacing grid, 375 touch targets), no 1280 signed-in probe | 048c · 091 · 093 · 033 | test-management-specialist → qa-frontend-expert |
| GAP-17 | VCST-5817 | **Search input does not move when the scope slot swaps skeleton → chip** (BL-UI-003). Grep `search scope\|scope (slot\|chip\|indicator)\|category scope\|scope chip` returns 6 rows (`SR-TK-011/022/023` unrelated; `SRCH-005/011/013` search behaviour), none a layout shift. A residual shift equal to the label-width difference is left to PO/design (hold) | 048c · 004 | test-management-specialist → qa-frontend-expert |
| GAP-18 | VCST-6100 | **Search-bar `view_item_list` only while the dropdown is open** (nothing on load for a URL keyword; one event on opening the prefilled box; one per typing and reopening; results-page events unchanged; `?barcode=&q=` sends nothing; item fields per BL-GA4-001). Grep `search_bar\|item_list_id` returns 25 rows, all in 043; `URL keyword\|prefilled\|without (touching\|opening)\|on page load` over 043 returns 4 rows (`GA-019/020/021/032`, not this event). `GA-053` covers manual-call parity only. **043 is shared with the VCST-6017 run: one author per change, and the stand serves the unmerged analytics build** | 043 | test-management-specialist → qa-frontend-expert |
| GAP-19 | VCST-6096 / 5993 / 5978 / 5990 (+ 26-19 GAP-CF-01) | **UI-kit accessibility oracles** (loading VcButton keeps its name and carries `aria-busy`; VcTextarea has a real label; Escape in a VcSelect inside a VcModal closes the dropdown only and returns focus; below-minimum quantity sets `aria-invalid` and `aria-describedby`). Grep `aria-busy` returns **0**; `VcTextarea\|textarea.{0,40}(accessible\|label)` 3 consumer rows (`B2C-LIST-056/057`, `CUST-058`); `aria-invalid\|aria-describedby` over 028\|029\|011\|015\|007 returns 1 row (`B2C-LIST-057`); `Esc(ape)?` near dropdown/modal returns **0**. `grep -ciE 'storybook\|ui-kit\|uikit' config/test-suites.json` = **0**, so the 26-19 carry-forward now has a target | **none** → propose `regression/suites/Frontend/cross-cutting/107-ui-kit-accessibility.csv` (ID 107 free) | test-management-specialist + ui-ux-expert |
| GAP-20 | VCST-6107 / 6307 / 6176 | **Visual-token oracles:** Returns details labels and dark table hover at AA; PDP SKU line readable in dark mode and light unchanged; Returns icon is the outline glyph. Grep `contrast\|4\.5` over 014c\|014b\|073\|045\|050o returns 8 rows (`RET-ORG-027/031` are layout/dark mode of the org table, not the details labels); `SKU #\|SKU line\|Copy SKU` 1 row (`MSNF-083`); `undo-2\|Returns icon\|outline icon\|icon.{0,30}(Returns\|outline)` 6 rows, none Returns. Assert ratios against the BL-A11Y-003 threshold and tokens, never transcribed colours | 014c · 002 · 033 | test-management-specialist → ui-ux-expert / qa-frontend-expert |
| GAP-21 | VCST-5989 / 6306 | **SEO explain (Stage 0 Candidates, rejected-before-pipeline shows Stages 1–6 with 0, unknown slug unchanged, Debug records no broken link) and Store SEO delete** (Delete enabled for a store with no records; persists after Save; re-add; multi-select; product/category lists unchanged). Grep `seoinfos/explain\|Debug SEO\|Candidates\|explain.{0,20}(stage\|slug)` returns 1 unrelated row (`SR-HD-040`); `Store.{0,20}SEO\|SEO (list\|record).{0,30}(delete\|Delete)\|Delete.{0,40}SEO` 3 rows (`STORE-017`, `CATA-015/037`). `066` is broken-link management only (`SEO-001..020`, legacy). Follow-up VCST-6324 (delete after store save lost) is open | 066 · 034 · 053 | test-management-specialist → qa-backend-expert |
| GAP-22 | VCST-6093 | **A `DefaultValue` settings override from configuration reaches typed reads** (no stored row → override value; stored value wins; settings without override keep their own default). Grep `Settings:Override\|DefaultValue override\|configuration override` returns **0**; `101 SIL-020/022/024/057` exercise the stored path. Needs a config override and a restart; do not save the settings blade during the test. Expect Manual/BLOCKED on a stand without the override | 101 · 020 | test-management-specialist → qa-backend-expert |
| GAP-23 | VCST-6199 | **SQL Queries command timeout** (`SqlQueries.General.CommandTimeout`, default and non-positive fallback, applied to execute-preview, execute-query and report export; clear timed-out error; xlsx export content type and formats after NPOI → MiniExcel). Grep `CommandTimeout\|sql-?quer\|SqlQuer\|execute-preview\|MiniExcel` returns 1 row (`BKRS-052`, unrelated). **No SQL Queries suite.** AC3 is **not met on Linux + SqlServer** (generic inner error shown), accepted as non-critical: hold that assertion. Needs a read-only DB login | **none** → propose `regression/suites/Backend/sql-queries/111-sql-queries.csv` (ID 111 free) | test-management-specialist → qa-backend-expert |
| GAP-24 | VCST-6173 | **Orders "Created date" presets at month boundaries and east of UTC.** Grep `Last (day\|week\|month\|year)\|preset` over 014\|014b\|097 returns 23 rows, the presets only as "sends both bounds" (`ORD-063..066`); `month boundary\|east of UTC\|UTC\+\|timezoneId\|setSystemTime\|clock override\|fake (clock\|time)` over 014\|014b\|097\|015 returns 2 rows (`ORD-090`, `SR-CO-047`). Timezone emulation has a house pattern (`SR-CO-047`, `SKIPPED` if the lane cannot); **a clock override has none in the corpus**, so the month-boundary rows may be Manual | 014b | test-management-specialist → qa-frontend-expert |
| GAP-25 | VCST-5707 (stale) | **Replace the pre-rework oracle.** See M7: `B2C-LIST-043`. Grep `lose access\|single-value\|only customer_b` over 007\|050h returns 5 rows; only `B2C-LIST-043` asserts the old behaviour, `072/073/074/078` are the new Stop-sharing rows. Keep the spec ("a second share must not revoke the first"), write it as a new case, retire the old one through REPAIR | 007 | test-management-specialist |

**Carried from 26-19 (each re-grepped today, still open):**

| GAP | Ticket | Description (grep, scope, hits today) | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-CF-01 | 26-19 GAP-02 / VCST-5378 | Storefront `/oauth/authorize`. `oauth/authorize\|/oauth/` = **0** | 031 · 012 | test-management-specialist → qa-frontend-expert |
| GAP-CF-02 | 26-19 GAP-07 / VCST-5933 | Vacuous oracle: `PRF-GQL-093` (050d) locked leg still ends `OR … organizationId is non-null {OBSERVED}`. Strengthen to the spec; do not describe the build | 050d · 050c · 014 | qa-backend-expert |
| GAP-CF-03 | 26-19 GAP-08 / VCST-6085 | Index-creation race. `concurrent\|parallel\|simultaneous\|race\|cold\|first request` over 061\|004 = 7 rows, none about index creation (`SRCHA-011` is cancel build) | 061 | qa-backend-expert |
| GAP-CF-04 | 26-19 GAP-09 / VCST-6045 | Large upload aborted at 30 s. `upload.*(abort\|timeout)\|request timeout\|large (file )?upload\|30 ?s` over 060b\|062 = **0** | 060b · 062 | test-management-specialist |
| GAP-CF-05 | 26-19 GAP-10 / VCST-6016 | Path traversal in Assets/Content providers. `traversal\|\.\./\|%2e` over 062\|060b\|049\|020 = 7 rows, only lockout rows (`PLAT-081..093`, `API-037`) | 062 · 060b · 049 | qa-backend-expert |
| GAP-CF-06 | 26-19 GAP-11 / VCST-6084 | Negative/zero mission goal values. `negative` over 075e\|075d = 1 row (`MSNA-023`, reward only) | 075e | test-management-specialist |
| GAP-CF-07 | 26-19 GAP-12 / VCST-5869 | Filters drawer dialog semantics. `Escape\|role=.?dialog\|aria-modal\|focus (return\|restor)` over 097 = 2 rows (`SR-CO-013`, `SR-CO-051`, a calendar case) | 097 · 093 · 045 | test-management-specialist → qa-frontend-expert |
| GAP-CF-08 | 26-19 GAP-13 / VCST-6083 | Document widget action per file type. `\.(docx?\|xlsx?\|zip)\b\|DOC/XLS` over 093 = **0** | 093 | test-management-specialist |
| GAP-CF-09 | 26-19 GAP-14 / VCST-6028 | Admin org search paging loop. `infinite\|loop\|vc-select\|lazy.?load\|paging` over 092\|092b = 1 unrelated (`SR-EMB-022`) | 092b | test-management-specialist |
| GAP-CF-10 | 26-19 GAP-15 / VCST-5759 | Rep with partial or empty name signs in. `no first\|blank name\|empty name\|without (a )?(first\|last) name\|partial name` over 092\|092b\|089\|031 = **0** | 092 · 092b · 089 · 031 | test-management-specialist |
| GAP-CF-11 | 26-19 GAP-16 / VCST-5870 | Breadcrumb separators announced / dead hub crumb. `separator\|aria-hidden\|hub crumb\|dead crumb` over 089\|093\|097\|091 = 4 incidental rows | 097 · 089 · 091 | test-management-specialist → ui-ux-expert |
| GAP-CF-12 | 26-19 GAP-17 / VCST-5840 | Language selector flag alts. `flag` over 045\|046\|033 = 3 rows, none about alt text | 045 · 046 | test-management-specialist |
| GAP-CF-13 | 26-19 GAP-18 / VCST-5681 | Raw i18n keys in account sidebar module links. `raw\|i18n\|translation key` over 033 = 1 unrelated (`AUTH-034`) | 033 · 046 | test-management-specialist |
| GAP-CF-14 | 26-19 GAP-19 / VCST-6029 | Compare: long unbroken property **value**. `unbroken\|break-words\|word-break\|overflow-wrap` over 098 = 3 rows (`CMP-009/032/042`; `042` is the product name). VCST-5880 explicitly waived the value variant for lack of a fixture | 098 | test-management-specialist |
| GAP-CF-15 | 26-19 GAP-21 / VCST-5662, 5901 | Mapping-sensitive cart fields. `updateCartDynamicProperties\|updateCartItemDynamicProperties\|changeCartItemComment\|changeComment` = **0 corpus-wide**; `purchaseOrderNumber` over 050b1..4\|028\|011\|013 = 3 rows, all 013 | 050b4 · 050b1 · 050c · 013 | test-management-specialist → qa-backend-expert |
| GAP-CF-16 | 26-19 GAP-22 / VCST-6086, 6075 | `setError` without `errors`; htmleditor cursor. `setError` = 1 unrelated (`CART-060`); `htmleditor\|cursor position` = 2 rows in 039 | 020 · 078 · 057 | qa-backend-expert |
| GAP-CF-17 | 26-19 GAP-03 (residual) / VCST-5732 | Sales Rep Tasks at the **xAPI** layer. `salesRepTask\|salesRepTasks\|createSalesRepTask\|changeSalesRepTaskStatus` = 6 rows, all steps inside UI cases of 106; **0** in 050m. UI half closed (see below) | 050m | qa-backend-expert |
| GAP-CF-18 | 26-18 GAP-14 | Bulk invite / partial failure. `bulk invite\|multiple e-?mails\|partial fail\|custom invitation\|invitation message` over 008 = **0** | 008 | test-management-specialist |
| GAP-CF-19 | 26-18 GAP-01 | Price restriction. `hide price\|price restriction\|hidden price\|restricted price` = **0 corpus-wide** | 054 · 050a · 002 · 017 | test-management-specialist |
| GAP-CF-20 | 26-18 GAP-02 | Federation / plugin discovery. `federat\|remoteEntry\|plugin discovery` = 1 incidental word (`RET-ORG-052`); no case. VCST-5159/5761 ship behind a disabled switch this sprint | 093 (+089/091/097) | test-management-specialist |
| GAP-CF-21 | 26-18 GAP-04/06/07/11/12/13/15 | Each re-grepped, still **0**: `hideDefaultHeader\|custom header` in 048c\|089\|090 · `\{\{blade\|raw binding\|unrendered` in 057 · `token expir\|expired token\|session expir` in 059\|060 · `price calendar\|time-bound\|start date` in 055 · `rate.?limit\|429` in 044\|031 and `inactivity\|idle timeout` corpus-wide · `segment\|disable\|deactivate` in 099\|100 · `view all result` corpus-wide | 048c/089 · 057 · 059/060 · 055 · 044 · 099/100 · 004 | test-management-specialist |

**Closed (re-checked, with the evidence):**

- **CLOSED, VCST-5884 / 6107.** `014c` `RET-ORG-016..033/048..052`, `050o` `RET-ORG-001..015/042..044`, `073a` `RET-ORG-035..039/053`, `073b` `RET-ORG-040/041/045..047` (53 stamped rows). `RET-ORG-027` carries VCST-6107 (table at three widths); the details-label contrast is GAP-20.
- **CLOSED, VCST-5880.** `098` `CMP-036..053` (18 stamped). Stale on the stand (note 1).
- **CLOSED, VCST-6077 and 26-19 GAP-03 (UI half).** `106` `SR-TK-001..029` (29 Draft, stamped VCST-6077; `salesRepTask*` mutations appear inside them).
- **CLOSED, VCST-6001.** `097` `SR-CO-039..051` (13 stamped). **VCST-6175 closed by an existing row:** `097 SR-CO-032`, EXPECTED-RED until this fix; add the stamp and drop the marker during lifecycle.
- **CLOSED, VCST-6027.** `072f` `CFG-CHK-001..028` (28 stamped), `050i CFG-GQL-032` re-pointed. Hold `CFG-CHK-011` (§6).
- **CLOSED, VCST-5707 / 5925 / 5728 / 6104 / 6116 / 5850.** `007` (36 rows stamped VCST-5707, plus the 5925/5728/6104 rows) and `050h` (15 stamped rows, `WISH-009/036..049`): reader and other-rep refusals (`WISH-045`), authorize-before-write (`WISH-047`, Catches VCST-6116), widening to Anyone with link (`B2C-LIST-078`), message persistence (`B2C-LIST-067`), and the multi-org send (`WISH-040` takes `organizationIds`). Only the co-owner variant (GAP-04) and the stale `B2C-LIST-043` (GAP-25) remain.
- **CLOSED, VCST-5944.** `050l` `PUSH-031/052..055` (5) and `068` `PUSH-042..051` (10), all stamped.
- **CLOSED, 26-19 GAP-01 (OTP).** `104` `OTP-001..017`, `105` `OTP-018..028`, all stamped VCST-5748 (the 26-19 grep `otp_email\|\botp\b` returned only Datatrans rows).
- **CLOSED, 26-19 GAP-04 / GAP-05 / GAP-06 (Returns).** `014c` (storefront), `050o` (xAPI), `073a` `RET-AUTH-009..015, 028..031` (buyer emails/push, decline reasons, buyer culture).
- **Still closed from 26-19:** GAP-23 (UCP), GAP-24 (`CAT-082`), GAP-25 (barcode), GAP-26 (missions), GAP-27 (condition tree): not re-run, nothing in this sprint touches them.

### 5.3 Exploratory Charters — discovery of what the suites cannot assert

> **5 charters × 30 min, at the cap.** Derived per `.claude/skills/qa-sbtm/sprint-charter-selection.md` over the §3 matrix and §5.2.
>
> **D3 check (`ls reports/exploratory/`, 2026-10-14; re-verified by the orchestrator).** Sessions on disk for this sprint: `SBTM-VCST-6017-2026-10-13` (**inside 24 h**), `SBTM-VCST-5884-2026-10-12` and `SBTM-VCST-5880-2026-10-12` (~2 d), `SBTM-VCST-5884-2026-10-08`, `SBTM-VCST-6077-2026-10-07`, `SBTM-VCST-6027-2026-10-06`, `SBTM-VCST-6001-2026-10-06` (all outside 24 h). **D3 fires only on VCST-6017** (beacon analytics, Ready for test, under the Medium "Search bar & analytics" row, which is not chartered anyway). No chartered domain is disqualified by D3. The Sales Rep (6077/6001), Returns (5884) and Configurable (6027) sessions are prior art: **read them before EXP-02 and EXP-04 run**, so no scenario is re-explored.
>
> **Ranking.** C1 first (EXP-01), then signal count (EXP-02 has two), then §3 score (EXP-03 at 20, EXP-04 at 16, EXP-05 at 10). **One judgment call:** Returns (16, C2) outranks Page Builder (10) on score, and is displaced by a deploy gate instead (see the "Not chartered" table). The lead can swap them.
>
> **Deploy gates.** EXP-02's storefront-link half needs a build with #2485; its API half does not. EXP-04 runs against a `sales-rep` PR build. Neither is a reason to skip, but both go in the session note.
>
> **Lanes.** Three lanes, two waves, isolated from the regression pool. Wave 1: EXP-01 (firefox), EXP-02 (chrome), EXP-03 (edge). Wave 2: EXP-04 (chrome), EXP-05 (firefox). Firefox clicks assume the MCP server was restarted after the occlusion-pref change.

| ID | Domain (§3) | Signals | Mission | Candidate scenarios | Technique | Lane | Owner |
|---|---|---|---|---|---|---|---|
| **EXP-01** | **UI kit & a11y** (12, High) | **C1** (GAP-19: no UI-kit suite, `none` target, carried from 26-18 and 26-19). The pure name/state oracles are D1 and go to §6, so the charter is limited to the consumer seam | Discover consumers broken by the shared-component changes of this sprint (VcButton loading #2528, VcTextarea label #2531, VcSelect inside VcModal #2486, quantity-stepper description #2533) that no component-level case can catch | 1. Walk every loading-VcButton consumer (barcode modal, Add to cart, Place order, quote submit): is the name stable, and is a double submit still refused while `aria-busy`? 2. Every VcTextarea consumer (Lists create, Invite member, quote comment, rep task notes, reviews): label click focuses, an invalid state links its message. 3. VcSelect inside each modal and drawer (Invite member Role, Add address Country and the uncovered Region): Escape closes the dropdown first, focus returns | User-flow edge enumeration · Galumphing | playwright-firefox | qa-testing-expert (+ ui-ux-expert for axe) |
| **EXP-02** | **Configurable products — file attachments** (20, Critical) | **C2** (5 tickets at L=5 across file-experience-api, x-cart, x-order, quote, vc-frontend) + **C3** (GAP-01/02/03 name 050i, 015, 014, 072b: 4 suites, 2 layers) | Discover what happens to a buyer's uploaded configuration file at every seam of its life (upload, cart, clear, quote conversion, order, reorder) and who can open it. The owner/other-buyer matrix itself is D1 and goes to §6; the charter takes the transitions between the links | 1. File on a cart line → create quote → clear or delete the cart → place an order from another path: does the quote file still open for its owner and stay refused for a colleague in the same organization? 2. An order placed before the fix against one placed after: what the buyer sees on a 403 (the ticket notes the whole page navigating to /403, not fixed). 3. Replace a file while editing a configured cart line, reorder from history, a 0-byte plus a real file, with and without a scope minimum | Soap Opera · Scenario tour | playwright-chrome | qa-frontend-expert (qa-backend-expert verifies the API/403 side) |
| **EXP-03** | **Lists sharing & Wishlist authorization** (20, Critical) | **C2** (7 tickets at L=5 on one PR set: x-cart #141, sales-rep #21, cart #194, vc-frontend #2476) | Discover role × scope × action seams of the reworked sharing model that the 51 stamped cases do not name: a Write member beside an owner, a target who is also a colleague, a rep who stops serving an organization | 1. Co-owner on an Organization-scope list: every verb (scope, targets, message only, remove, rename, item edits) and the menu; the message-only edit that answers 200 and writes nothing is an open contract question (record it). 2. A target-organization member who is also a member of the owner's organization; the rep loses service of a target after sharing: owner revokes, refusals stay HTTP 200 + `errors[]`, never 500. 3. Widen/narrow transitions with link sharing re-enabled (stable key reused, old link 404, message-only edit sends nothing) | Feature-pair matrix · Boundary-of-features | playwright-edge | qa-backend-expert (qa-frontend-expert on menus and dialogs) |
| **EXP-04** | **Sales Rep hub** (16, Critical) | **C2** (7 tickets at L=4 across vc-frontend and sales-rep, plus a statistics cache and a `sales-rep` PR build that makes the deployed shape uncertain) | Discover seams between the new Tasks page, the date-range filter, the layout empty state and the statistics cache, on the build that is actually deployed | 1. A buyer places and cancels an order while the rep watches Dashboard, My customers and a Customer profile: which tiles and lists follow, how fast, and what stays stale by design. 2. Hide every block via Edit layout on the Dashboard and the Customer page, save, reload, restore: at 375, by keyboard. 3. Customer-orders filters together: date range, status chip, a de-DE zero-match, west-of-UTC browser, Task module present vs absent | Feature-pair matrix · Boundary-of-features | playwright-chrome (wave 2) | qa-frontend-expert |
| **EXP-05** | **Page Builder** (10, High) | **C2** (4 tickets at L=5 on one module, three PRs #165/#167/#170) + the carried zero-coverage Shared Components (GAP-11). The 428/412/400 and 400/403 contracts are D1 (GAP-10/11), so the charter is the Designer's behaviour | Discover how the Designer behaves under two authors and under a browser that denies the clipboard | 1. Two tabs, one page: stale tab warned, edits kept, recovery; **does the copy-page and clone path need a token now**, and what a stale tab does to publish, unpublish and draft. 2. Actions menu under clipboard denied, prompt and granted in Firefox, Chrome and Edge: Save selected as Shared Component → reload → where it is used; create in a store the author may not see. 3. Keyboard only: section-tree reach, ArrowUp/Down reorder, Escape and focus return at 375 beside the AI assistant button | Soap Opera · Saboteur | playwright-firefox (wave 2) | qa-testing-expert (qa-backend-expert on the API side) |

**Not chartered (and why)**: every Critical/High §3 domain without a charter, plus the Medium rows:

| Domain (§3 score) | Verdict | Routed to |
|---|---|---|
| **Cart & order validation core** (20, Critical) | **Qualifies on C2** (one ticket across x-cart, x-order and quote, L=4), but **D1 outranks it**: the change is an exact gate contract (which ruleSet an order or quote is allowed on) and a deprecation. A case is cheaper and permanent. REG-2026-10-09-1716 already ran 27 cases (24 passed, 2 blocked, 1 ambiguous). Recheck the zero-priced RFQ line after release | GAP-05 + §6.2 |
| **Platform API authorization** (16, Critical) | **D1**: exact authorization outcomes (401, 403, permission matrix). Import is not installed, so it is `BLOCKED` anyway | GAP-06, GAP-07 + §6.2 |
| **Returns — organization returns** (16, Critical) | **Qualifies on C2** (3 tickets, L=4) but **displaced, not rejected**: (1) the organization tab (#2523) is absent on `{FRONT_URL}`, so the charter would explore a surface that is not deployed; (2) 53 stamped cases and the 5884 test strategy already cover it, and `SBTM-VCST-5884-2026-10-08` + `-10-12` are on disk (outside 24 h). **First reserve** once a build with #2523 is on the stand. BL-RET is empty (M6) | 014c/050o/073a/073b |
| **Punchout (cXML)** (12, High) | **C1** (GAP-08, `none` target) but it fails the deploy gate: the module is not installed on the stand, so a charter could not run there. QA ran three rounds on qa1. The cXML status contract is D1. **Second reserve** once a stand has the module and its configuration | GAP-08 |
| **Image Tools thumbnails** (12, High) | **No C signal** (one ticket, one module; I=3). Format × resize method is an equivalence partition over exact outcomes (D1) | GAP-09 + §6.2 |
| **Auth / OTP** (10, High) | **C4** (I=5, L=2) but **D1 outranks it**: one assertable negative (a locked account is not told a correct code is wrong); the fix path is unconfirmed | GAP-13 + §6.2 |
| **Search bar & analytics** (9), **Platform settings & SEO admin** (9), **Push messages audience** (9), **Storefront orders date filter** (8), **SQL Queries** (6) | Below the Critical/High threshold; each is an exact oracle (D1). D3 also fires on the analytics row: `SBTM-VCST-6017-2026-10-13` is inside 24 h | GAP-18, GAP-21, GAP-22, GAP-24, GAP-23 |
| **vc-shell framework (VCST-5670), vc-frontend-next theme (VCST-6214), Vendor Portal, tooling, CI, spikes** | **D2**: separate products or no QA surface in this repo. Stated here rather than silently omitted | Nothing |

---

## 6. New Test Cases Needed (Per Ticket)

**Estimated total: 97–156 new cases.** The estimate excludes the carried GAP-CF-01..21 so they are not double-counted. Counts and technique only; no CSV is authored here. Case generation happens per ticket via `/qa-test-cases-generator`. Technique per `.claude/skills/qa-test-design/test-design-techniques.md`, FLOW first for value chains.

> **First wave: about 36 cases** if the budget bites. In order: file authorization 5 (GAP-01) · permission matrix 8 (GAP-06) · ruleSet gate 4 (GAP-05) · page-content concurrency 4 (GAP-10) · required-file API 3 (GAP-02) · statistics cache 3 (GAP-14) · empty-layout state 2 (GAP-15) · co-owner 2 (GAP-04) · locked OTP 2 (GAP-13) · replace `B2C-LIST-043` 1 (GAP-25) · multi-org check 0 · other High bugs 2. Selection rule: High priority, or the domain has no oracle at all (Platform authorization, file ownership and Returns have none in `bl/`).
>
> **Hold the assertion (spec conflict or unratified; the case keeps the spec side and is never rewritten to match the build):**
> - **VCST-6077:** the three rail widths (ticket, mockup, PR) disagree. `SR-TK-019` already asserts the ticket value and records the PR as a known divergence. Leave it.
> - **VCST-5990:** AC1 says the range is explained **before** commit; the PR still commits the typed quantity. Assert the accessible state and the unchanged blocking; hold the pre-commit claim until the PO records a decision.
> - **VCST-6011:** dev says Paste is disabled without clipboard access, QA saw it always enabled. Hold Paste; assert only that the menu renders populated and does not read the clipboard on open.
> - **VCST-5884 AC-4:** the organization email copy is not in the Acceptance field. `RET-ORG-035..039/053` assert it; hold them from any gate until it is ratified.
> - **VCST-5850:** partial delivery. The multi-select in the popup is not shipped; assert the API (`WISH-040`) and the three entry points, not the popup.
> - **VCST-6027:** closed Done although QA failed AC-1/AC-3.1 for Text and File rows (VCST-6188 open). `CFG-CHK-011` keeps "section name + value"; expect `FAIL` until 6188 is fixed. Do not read the Jira status as a pass.
> - **Others:** VCST-6131 (exact wording and fix path unconfirmed), VCST-5817 (residual shift for long labels is a PO decision), VCST-5924 (no formal AC), VCST-6199 (AC3 timed-out message), VCST-5755 (AC-5 benchmark not run).
>
> **Spec-blocked or env-blocked:** VCST-6247 and VCST-5886 (modules not installed), VCST-6093 (needs a config override and a restart), VCST-6173 month-boundary rows (no clock override), VCST-5755's two-replica half, VCST-6199 (read-only DB login).

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5886 | REST (cXML), Admin, Storefront, GraphQL | Punchout: setup-request statuses, token lifetime and single use, session, Admin mapping widget, store setting gate; plus org-query guards for profile-xapi #147 | **14–21** (cXML 8–10, storefront 3–4, Admin 2–3, 050d guards 2–3 + 1 `[JOURNEY]`) | new 109 + new 110 + 050d (GAP-08). **BLOCKED on the stand** | **FLOW** first (setup request → token → single sign-in → session → auto sign-out), **Decision Table** (cXML status × cause), **State Transition** (token valid → used → expired), **BVA** on token and session lifetime |
| VCST-6077 | Storefront | Tasks redesign: **already stamped** (`SR-TK-001..029`). Only the stamp review and the held rail width | **0–2** | 106 | — (hold the rail-width assertion) |
| VCST-6027 | Storefront | PDP configuration checklist: **already stamped** (`CFG-CHK-001..028`). Stamp review only | **0–2** | 072f (+ 072e consumer) | — (hold `CFG-CHK-011` against VCST-6188) |
| VCST-6001 | Storefront | VcDateRangePicker in the customer-orders filter: **already stamped** (`SR-CO-039..051`). The work is the selector REPAIR in 014/014b/015 | **0** | 097 (+ REPAIR 014, 014b, 015) | — |
| VCST-5944 | Admin, GraphQL | Audience builder: **already stamped** (15 rows) | **0** | 068, 050l | — |
| VCST-5925 | GraphQL, Storefront | Multi-recipient sharing: **already stamped** (10 rows); AC5 deferred to VCST-6147 (On hold) | **0–1** | 007, 050h | — |
| VCST-5924 | Storefront | File links in cart, checkout review and Order Details; a `[JOURNEY]` through to the order | **2–3** | 072b, 014 (GAP-03) | **FLOW** (attach → cart → checkout → order), EP over surface (cart, review, order, quote). Stale on the stand (#2485); checkout review step not verifiable |
| VCST-5884 | Storefront, GraphQL, Admin | Organization returns: **already stamped** (53 rows) | **0–2** | 014c, 050o, 073a, 073b | — (AC-4 cases held) |
| VCST-5880 | Storefront (a11y) | Compare one table: **already stamped** (18 rows). Selector REPAIR for the old-markup rows | **0** | 098 | — |
| VCST-5850 | GraphQL, Storefront | Send to multiple organizations: the API is covered by `WISH-040`; popup multi-select not shipped | **0–1** (an `organizationId` contract guard once M8 is checked) | 050m, 007 | — (hold the popup) |
| VCST-5817 | Storefront | Scope slot never collapses: no horizontal movement of the search input on skeleton → chip (BL-UI-003) | **1–2** | 048c, 004 (GAP-17) | **BVA** on the swap states (idle, preparing, resolved), assert movement as a delta of zero. Stale on the stand (#2522); residual long-label shift held |
| VCST-5728 | Storefront | Existing message on edit: **already stamped** (`B2C-LIST-067`) | **0** | 007 | — |
| VCST-5707 | Storefront, GraphQL | Sharing rework: **already stamped** (51 rows). Replace the stale `B2C-LIST-043` with a spec-side case: a second share keeps the first | **1–2** | 007 (GAP-25) | **State Transition** (share A → share B → both retained → remove A) |
| VCST-5687 | Storefront | Empty state when every block is hidden, on the Dashboard and the Customer page, with a way back | **2–3** | 093, 091 (GAP-15) | **State Transition** (visible → all hidden → restore), EP over page (dashboard, customer). Assert placeholder and action, not the copy |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-6247 | REST | Import authorization: anonymous 401 on three endpoints, run/resume need authorization, org scoping, Admin and vendor-portal still work. **BLOCKED** | **4–6** | new 108 (GAP-07) | **Decision Table** (endpoint × caller), EP |
| VCST-6276 | REST, Admin, Storefront | Tax / personalization / completeness authorization: anonymous 401; `tax:read`/`tax:update`, `personalization:update`, `channel:read` matrix; legacy route gone; Admin widgets and cart tax unaffected | **8–12** | 049, 099, 034, 076 (GAP-06) | **Decision Table** (endpoint × role × permission), EP over caller. Breaking for non-admin roles: seed a role without the permissions (SECOND RULE) |
| VCST-6268 | Admin, REST | Thumbnails after the library swap: resize methods keep dimensions, formats (supported / skipped), regenerate vs process-changes vs on-upload, no native-load error | **5–8** | 069, 062 (GAP-09) | **Pairwise** (format × method × trigger), **BVA** on size. Dimensions and outcome only, never pixels. Hold JPEG on regression (`.jpeg` upload 405) |
| VCST-6125 | GraphQL, Storefront | Co-owner (Write member) of an Organization-scope list cannot take ownership, change scope or remove | **2–3** | 050h, 007 (GAP-04) | **Decision Table** (member access × verb); fixture: second Write member |
| VCST-6116 | GraphQL | Authorize before write: **already stamped** (`WISH-047`) | **0** | 050h | — |
| VCST-6089 | GraphQL, Storefront | Order and quote gates on the validated ruleSet; deleted-product check; order → quote → order on one cached aggregate | **4–6** | 050b5, 050c, 015 (GAP-05) | **EP** over ruleSet, **State Transition** (cached aggregate across operations), Error Guessing. Recheck the zero-priced RFQ line |
| VCST-6012 | Admin SPA (a11y) | Designer keyboard reach, names, Shared badge axe-clean, Escape and focus return, 375 overlap, ArrowUp/Down reorder | **3–4** | 060b (GAP-12) | EP over control group, **BVA** on viewport. Do not assert the two unfiled follow-ups |
| VCST-6011 | Admin SPA | Actions menus render without clipboard permission; Save selected as Shared Component reachable and persisted; no clipboard read on open | **2–3** | 060b, 059 (GAP-11) | EP over permission (granted, prompt, denied) × browser. Hold Paste |
| VCST-5995 | REST, GraphQL | Buyer opens their own configuration file from Order Details; other buyers, plain customer, anonymous 403; admin 200; pre-upgrade order | **4–6** | 050i, 050c, 014 (GAP-01) | **Decision Table** (caller × file owner entity), EP. Pre-upgrade orders need the one-time migration: Manual |
| VCST-5999 | GraphQL, REST | Quote created from a cart keeps its files: same URL, owner and admin 200, others 403, deleting the cart keeps the quote file, clearing a cart without a quote deletes by design | **2–3** | 015, 050i (GAP-01) | **State Transition** (cart → quote → cart cleared) |
| VCST-6000 | GraphQL, Storefront | Required File section: 0-byte rejected (`CONFIGURATION_SECTION_FILES_REQUIRED`); real, or 0-byte + real, passes; optional passes; `INVALID_MIN_SIZE` under a scope minimum | **3–4** | 050i, 072d (GAP-02) | **BVA** (0, 1 byte), Decision Table (required × files). Scope minimum is per-env config: `BLOCKED` where unset |
| VCST-6307 | Storefront (a11y) | PDP SKU readable in dark mode, light unchanged, variation page, Copy SKU toast | **1–2** | 002 (GAP-20) | **BVA** on the AA ratio, assert tokens not colours. Stale on the stand (#2574) |
| VCST-6173 | Storefront | Created-date presets at month boundaries and east of UTC | **3–4** | 014b (GAP-24) | **BVA** (day 2 / day 31 boundaries) × timezone partition. Month-boundary rows need a clock override: may be Manual |
| VCST-6131 | Storefront, REST | A locked account entering a correct code is not told it is wrong; no disclosure of existence or lock | **2–3** | 104, 105 (GAP-13) | EP over account state (unlocked, locked, blocked, unknown). Hold wording and fix path |
| VCST-6107 | Storefront (a11y) | Return details labels and dark table hover at AA, on light and dark | **1–2** | 014c (GAP-20) | **BVA** on the ratio threshold |
| VCST-6104 | Storefront | Widening to Anyone with link: **already stamped** (`B2C-LIST-074/078`) | **0** | 007 | — |
| VCST-6096 | Storefront (a11y) | Loading VcButton keeps its name, `aria-busy` while loading and removed after; barcode Browse announced | **2–3** | new 107 (GAP-19) | EP (loading / idle), **State Transition** (loading → idle) |
| VCST-6093 | REST, Admin | A configuration `DefaultValue` override reaches typed reads; stored value wins; others unaffected | **2–3** | 101, 020 (GAP-22) | **Decision Table** (stored × override). Needs override + restart: Manual/BLOCKED |
| VCST-6010 | REST | Unknown `storeId` on Shared Component create → 400, nothing persisted; real store 201; empty 400; out-of-scope 403 before lookup | **2–3** | 060b, 059 (GAP-11) | EP over store (real, unknown, empty, out of scope). A case-variant `storeId` stored non-canonically is a PO question |
| VCST-6009 | REST, Admin SPA | Page-content token: 428 / 412 / 400, one winner under concurrent writers, Designer stale-tab warning, publish/draft/copy unaffected | **4–6** | 059, 060 (GAP-10) | **Decision Table** (token state × status), **State Transition** (two writers), Error Guessing. Body token on the proxied stand (KB-1336804F) |
| VCST-5993 | Storefront (a11y) | VcTextarea real label: accessible name, label focuses, no self-referencing `aria-labelledby`, `ariaLabel`-only fallback | **2** | 107 (GAP-19) | EP over label source |
| VCST-5990 | Storefront (a11y) | Below-minimum quantity: `aria-invalid` + `aria-describedby`; quote row; blocking unchanged; typed 0 keeps its message | **2–3** | 107, 028 (GAP-19) | **BVA** (min−1, min, 0) × context (cart, quote). Hold "before commit" |
| VCST-5989 | Admin, REST | SEO explain: Stage 0 Candidates, pre-pipeline rejection shows Stages 1–6 with 0, unknown slug unchanged, Debug records no broken link, owning store resolves | **3–5** | 066, 051/053 (GAP-21) | EP over slug state (resolved, rejected, unknown). Brand-page AC not verifiable on dev |
| VCST-5978 | Storefront (a11y) | Escape in an open VcSelect inside a VcModal closes the dropdown only; closed → closes the dialog; slot trigger and autocomplete; outside a modal | **2** | 107 (GAP-19) | EP over open/close path (BL-A11Y-001) |
| VCST-5945 | Storefront | Signed-in top bar on one line at 1280 and its neighbours, long names truncated with the full name on hover, no page overflow | **1–2** | 048c (GAP-16) | **BVA** across the breakpoints (1279/1280, 1499/1500) |
| VCST-6306 | Admin SPA | Store → SEO Delete enabled and works; re-add; multi-select; product/category lists unchanged; Delete without Save + Reset removes nothing | **2–3** | 034, 053 (GAP-21) | **State Transition** (add → select → delete → save). VCST-6324 follow-up is open |
| VCST-6265 | Storefront | Sidebar labels break at spaces at 768–1279, one line from 1280, long unbroken strings still wrap | **1** | 048c, 033 (GAP-16) | **BVA** on the width edges. Stale on the stand (#2571) |
| VCST-6180 | Storefront | My recent orders keeps Total and Date on one line | **0–1** (shared with 6153) | 091 (GAP-16) | BVA (width × long money value) |
| VCST-6176 | Storefront | Returns icon is the outline glyph on desktop and mobile | **0–1** | 033, 014c (GAP-20) | EP; icon-name parity belongs to `ui-ux-expert` (`vs. DESIGN`) |
| VCST-6175 | Storefront (i18n) | Zero-match status chip stays localized: **covered by `097 SR-CO-032`** | **0** | 097 | — (stamp, drop EXPECTED-RED) |
| VCST-6153 | Storefront | Top sellers Rank, Units and Revenue stay on one line at three widths | **1–2** | 093, 091 (GAP-16) | BVA (width) |
| VCST-6100 | Storefront (analytics) | Search-bar `view_item_list`: none on load, one on open, one per typing/reopen, results page unchanged, barcode URL sends nothing | **2–3** | 043 (GAP-18) | **State Transition** (closed → open → typing → reopened) on `window.dataLayer`. Single author for 043; unmerged analytics build on the stand |

### 6.3 Tasks / Review

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5755 | GraphQL, Storefront | Statistics cache invalidation on cart and order changes; aggregate = sum of per-customer cards; sort reflects a change; flags runtime-flippable, TopSeller stale by default; buyer-placed orders move no rep tile | **3–5** | 050m, 093 (GAP-14) | **State Transition** (change → read), **Decision Table** (flag × event). Two-replica half `BLOCKED` on a single replica; `sales-rep` PR build unverified vs #18 |
| VCST-6199 | REST, Admin | SQL Queries command timeout (default, non-positive fallback, three call sites), timed-out error, xlsx export formats after MiniExcel | **4–6** | new 111 (GAP-23) | **BVA** (negative, 0, 1, default), EP over call site. Hold the AC3 message. Needs the read-only DB login |
| VCST-6214 | Storefront (new theme) | Merged upstream features on `vc-frontend-next`: no suite, **D2**. QA recorded 16/16 ACs with 15 pre-existing checklist FAILs | **0** | — | — |
| VCST-6248 | Platform (MySQL) | Default MySQL server version: smoke on a MySQL stand if one exists; no QA environment is known to run MySQL | **0** | 078 | — |
| VCST-5670 | vc-shell | Focus after sign-in, blade open, Maximize, Save: **D2** (separate product, `vcmp-dev`) | **0** | — | — |

### 6c — Checklist diff (Critical / High domains only)

Method: each domain's checklist section was pulled and its items compared with the §5.1 suites' rows (title and full text). Covered items are recorded; every uncovered item routes to exactly one destination (§5.2 GAP if assertable, §5.3 scenario if state-shaped).

| Domain | Checklist section | Covered (no action) | Uncovered → destination |
|---|---|---|---|
| **Configurable products — file attachments** (Critical) | §14 File Section Type + Storefront UX + Cart & Checkout; graphql-checklist xCart Configurable Products | Required/optional file, type and size limits, multiple files and remove, 0-byte rejection (UI) — `072d CFG-FILE-001..011` (Manual); persistence through merge, SFL, edit (`072`, `050b3 CRL-GQL-125`); file section on cart lines (`050i`) | **Authorization of the file by owner/other buyer/quote/order** → **GAP-01**; server-side required-file and minimum size → **GAP-02**; file link opens in cart, review, order → **GAP-03**; lifecycle seams → **EXP-02**. The checklist has **no item for the PDP configuration checklist** (a hole; `072f` has 28 rows) |
| **Lists sharing & Wishlist** (Critical) | §21 B2B Lists; graphql-checklist Wishlists | Shared list visible to org members, private list scope, bulk add, rename/delete, share dialog, Stop sharing, widen/narrow (`007` 36 stamped rows, `050h` 15) | Co-owner (Write) variants → **GAP-04**; stale `B2C-LIST-043` → **GAP-25**; role × scope seams → **EXP-03**. The checklist has **no target-organization sharing item**; the rule lives in BL-SR-002 |
| **Cart & order validation core** (Critical) | §8 Cart/Checkout; graphql-checklist xCart Lifecycle, xOrder, xQuote (§20) | CRUD, selection, coupon, merge, checkout setup, per-ruleSet validation (`050b1..5`, `028..030`, `011/013`), quote from cart happy path (`015 QUOTE-001/015`) | Gate on the validated ruleSet, deleted-product quote check, cached-aggregate transitions → **GAP-05**; cart comments and dynamic properties (zero corpus-wide) → **GAP-CF-15** |
| **Platform API authorization** (Critical) | A13 Platform Security, A18 Tax, A25, A26, API1 | Role and permission assignment, lockout, generic 401/403 (`020`, `049`, `044`), `PERS-008`, admin Tax/Channel rows (`034`, `076`, legacy) | **Per-endpoint anonymous 401 and the new permission matrix** → **GAP-06**; import module → **GAP-07**. A18/A25/A26 list no permission items at all |
| **Sales Rep hub** (Critical) | §35 Sales Rep Hub + A28 | Six stat tiles, recent orders, top sellers, localization, layout persistence (`093`, `091`), customers (`089`), customer orders and date filter (`097`), Tasks (`106`) | Statistics freshness → **GAP-14**; empty layout → **GAP-15**; value wrapping → **GAP-16**; Tasks xAPI → **GAP-CF-17**; seams → **EXP-04**. The checklist has **no Tasks item** (hole) |
| **Returns — organization returns** (Critical) | none (§10 Orders and A4 cover order detail and the payment refund only) | All of it by suites (`014c`, `050o`, `073a/b`: 53 stamped rows) | Details contrast and icon → **GAP-20**. **Still no Returns checklist section, no BL-RET invariant (M6)**; `returns.md` domain map exists now. `/qa-checklist new returns` is its own piece of work |
| **UI kit & a11y** (High) | §29 Accessibility + §22 Localization | Keyboard reach, focus indicators, alt text, touch targets at layout level (`045` legacy Manual, `048c`) | Loading name/`aria-busy`, textarea label, Escape in a select inside a modal, stepper description → **GAP-19**; contrast tokens → **GAP-20**; consumer seams → **EXP-01** |
| **Punchout (cXML)** (High) | none in any of the three checklists | profile-xapi org queries by `050d` (no key stamp) | All of it → **GAP-08**. A hole in the checklist |
| **Image Tools** (High) | A17 Image Tools | Add/run/delete a task, status, settings, multiple tasks, generated dimensions (`069 IMGTL-001..028`, legacy) | Format support and GIF/TIFF skip, regenerate vs on-upload → **GAP-09**. A17 has no "supported formats" item |
| **Page Builder** (High) | A9 Content & Pages (+ A11 Assets) | Create, edit, publish, clone, preview, save/load (`059`, `060`, `060b`) | Concurrency token → **GAP-10**; Shared Components and clipboard menu → **GAP-11**; Designer keyboard → **GAP-12**; two-author behaviour → **EXP-05**. A9 has no concurrent-edit item |
| **Auth / OTP** (High) | §1 Auth (+ §28 Security) | Registration, sign-in/out, lockout after N failures, session expiry (`031`, `032`, `044`), OTP flow (`104/105`, 28 stamped rows) | Locked-account OTP message → **GAP-13**. §1 still has **no OTP or grant item** |

Checklist sections still missing (re-checked against the heading list of `domain-checklists.md`): **Returns, OTP/Auth grants, Task Management, Product Compare, Punchout, Lists sharing to targets**. Sections that exist for Loyalty (§34), Sales Rep (§35, A28) and UCP (§36) are unchanged since 26-19.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

**Blockers — testing of the named domain does not start until these clear:**

1. **`FRONT_URL` serves a `dev` build at or after #2574 (2026-10-14 08:24 UTC).** Today it serves the
   unmerged VCST-6017 PR build (banner). Until it changes, the storefront half of VCST-5817, 5880, 5884,
   5924, 6265 and 6307 is `PENDING-DEPLOY`. Ask the release owner whether the VCST-6017 pin is deliberate
   and how long it stays. **Read the theme version before every storefront verdict.**
2. **`SalesRep 3.1014.0-pr-13-4fbb` is matched to the sprint PRs** (#18 VCST-5755, #21 VCST-5925/5850/5728/5707).
   Read the PR build's base, or get a release installed. Until then, Sales Rep sharing and statistics
   verdicts carry the build id and are provisional.
3. **A permission fixture for VCST-6276 exists:** a non-admin back-office role **with** `tax:read` /
   `tax:update` / `personalization:update` and one **without**. Without both, the over-refusal direction
   cannot be tested (§8).
4. **The four open spec conflicts have an owner** (PO): VCST-6077 rail width (272 / 300 / 280 px),
   VCST-5990 "explain before commit", VCST-6011 Paste state without clipboard permission, VCST-5884 AC-4
   (organization email copy). The rest of each ticket proceeds; the conflicted assertion is held.

**Standard gates:**

5. `npm run env:check` green for `TEST_ENV=vcst`.
6. All three browser lanes reachable (`playwright-chrome`, `playwright-edge`, `playwright-firefox`), with
   MCP servers restarted after any config change.
7. Test data seeded and **verified live** per §8, including the divergent pairs (owner vs co-owner,
   permitted vs non-permitted member, file owner vs other buyer).
8. `npm run suites:lint` and `npm run td:validate` green.
9. **Page Builder content seeders re-run once** after PageBuilder 3.1034.0. VCST-6009 made raw content
   POST require If-Match, and the platform auto-test seeder already fails with 428 (VCST-6285). `seed:cms-pages`
   already sends the token; **`seed:pb-shared` does not** (`seed-pagebuilder-shared-components.mjs:120`, M9)
   and will 428. Route the fix to `test-data-engineer` before reading any 059/060/060b failure as a
   product regression.
10. The `vc-frontend` checkout is pulled and `npm run sitemap:refresh` re-run before any route-level
    assertion: VCST-6077 moved `/company/calendar` → `/company/tasks`, and sitemap rev 11 is known-stale
    on routes.

### 7.2 Exit Criteria

| # | Criterion |
|---|---|
| 1 | Every **Critical** domain (6) has executed its §5.1 suites on at least two browser lanes, with HAR captured, **against a build that contains the ticket's PR** |
| 2 | Every **High** domain (5) has executed its §5.1 suites on at least one lane |
| 3 | All §5.2 `GAP-NN` items are either covered by a new `Draft` case or explicitly deferred **with a reason recorded in this file** |
| 4 | All §5.3 charters executed or explicitly stood down; each produces a net-new scenario or a written "nothing found" |
| 5 | Every authorization fix (5995, 6116, 6125, 6276, 5884) is verified **in both directions** on the deployed build: the wrong caller refused, the right caller admitted |
| 6 | VCST-6116 is verified on **stored state** (uncached read), not on the xAPI response |
| 7 | The configurable-product file FLOW (cart → quote → cleared cart → order → order details) passes the owner / other-buyer / anonymous / admin matrix at each hand-off |
| 8 | VCST-6089's order → quote → order sequence on one cached aggregate is run, and the RFQ `$0` line price QA saw on PR builds is confirmed or ruled out on the release |
| 9 | The six PR-build-only verifications (6307, 6265, 5945, 6100, 6096, 6176) are re-confirmed on the deployed build, and the ticket comment amended |
| 10 | No open **Critical/High** bug filed by this cycle is left untriaged; each has severity, owning layer and a repo route |
| 11 | Every `PENDING-DEPLOY` / `BLOCKED (not installed)` ticket is either tested after deploy or listed with its missing build in the ticket comment |
| 12 | Zero suite CSVs left unparsable; `npm run suites:lint` and `npm run td:validate` green at close |
| 13 | Tracker comments follow the GOLDEN RULE: **one comment per ticket per run**, amended, with screenshots attached inline |

---

## 8. Test Data Requirements

Everything below resolves at runtime. **No literals**: `{{VAR}}` for per-environment values,
`@td(ALIAS.field)` for entities asserted by name, `live-discover` for drifting ids, and `random-data`
(`AGENT-TEST-` prefix) for unique inputs never asserted on. Per `.claude/rules/test-data.md`.

| Domain | Data needed | Layer / seeder | Notes |
|---|---|---|---|
| **Configurable products — files** | A configurable product with a **required** and an **optional** File section; two buyers in **different organizations**; a 0-byte file, a 1-byte file and a normal file; one order and one quote carrying a configuration file; **one order placed before the upgrade** | `seed:configurable` + `random-data` (files generated per run, never committed) + `live-discover` (pre-upgrade order) | The second buyer is the negative control for 5995/5999. Without them, an owner-only 200 passes in the broken state too (SECOND RULE). `MinFileSize` is a per-environment scope setting: read it, don't assume it |
| **Lists sharing & Wishlist authz** | An Organization-scope list with an owner and a **Write co-owner**; a list shared with **two** customer organizations (A and B); a guest for the public link; a sales rep serving ≥2 customer organizations | `seed:wishlists` + `seed:sales-rep` | Share A and B with **different** members so "adding B kept A" is decidable. Sharing state is mutable and pooled per list, so create the share in the case and stop it in Cleanup (FIFTH RULE) |
| **Cart & order validation core** | A cart valid under one rule set and invalid under another; a product that triggers `CART_INVALID_PRODUCT`; a line-item limit to exceed | `scripts/seed-data/carts/` (no `seed:carts` npm script) + `live-discover` | The divergence between rule sets is the fixture. A cart valid under both cannot catch a wrong-gate defect |
| **Platform API authorization** | Back-office role **with** `tax:read` / `tax:update` / `personalization:update` and one **without**; a store with a tax provider; a product with user groups; a channel with completeness | `seed:rbac` (extend) + Admin setup | Create the roles in the case and delete them in Cleanup. Credentials via `{{VAR}}` only |
| **Sales Rep hub** | One task per scope chip (today, upcoming, overdue, completed, plus an undated and a cancelled one); customer orders spanning a date range; a de-DE culture with Order.Status translations | `seed:sales-rep-tasks`, `seed:sales-rep-i18n`, `seed:sales-rep-stats` | Overdue and today are time-relative, so create them in the case. "All ≠ sum of status chips" when cancelled or undated tasks exist; seed both so the count rule is decidable |
| **Returns — organization** | One organization with two members, **one with** `xapi:my_organization:return:view` and **one without**; returns in Submitted, Approved, **Draft** and **cancelled Draft** | `seed:returns` + `seed:membership-roles` | The draft and the cancelled draft are the negative corpus ("never listed"); VCST-6226 failed on exactly that |
| **Punchout** | A shared secret, a domain, a mapped **non-admin** customer and an unmapped one | Environment config (`Punchout:Configurations`), not seedable here | Module not installed on `vcst`; author cases now, run where it is installed |
| **Image Tools** | One image per format (JPEG, PNG, WebP, BMP, SVG; GIF/TIFF as skip cases) | `random-data` image generation | Assert sizes per mode against the setting, never pixel values |
| **Page Builder** | Two sessions on the **same page** (concurrent writers); an unknown store id | `seed:pb-shared` + `random-data` | Re-run `seed:cms-pages` / `seed:pb-shared` after 3.1034.0 (entry gate 9) |
| **Auth / OTP** | A **locked** account with OTP enabled on the store | `seed:otp-signin` + `seed:membership-lock` | Lock the account in the case, unlock in Cleanup. **Do not unlock the TechFlow locked membership**: it is locked by design and the impersonation suite depends on it |
| **Orders date filter** | Orders spanning a month boundary | `seed:orders` | The clock override and timezone are browser settings, not data |
| **Push messages audience** | Contacts and companies that match one condition and not another | `seed:push-audience` | Sent messages cannot be deleted: every send is test residue, so prefer the preview |
| **SQL Queries** | A query that exceeds a low timeout; an export with date/time columns | Admin setup | Needs the SqlQueries read-only DB login on the environment |

**Standing constraints:** passwords are `{{VAR}}` tokens resolved from `.env.local`, never literals.
Disposable fixtures are isolated **per suite**, not per run; two suites consuming one fixture set are
serialised with a re-seed between them. Capture every observation with its run handle and entity ids,
because the fixture will not outlive it. No `reports/tickets/...` output path may appear in any case row (`DV-024`).

---

## 9. Schedule and Milestones

The sprint closes **2026-10-19**. The storefront deploy (§7.1 blocker 1) is owned by the release owner; dates after it are relative to it.

| Date | Milestone | Owner |
|---|---|---|
| **2026-10-14** | Plan drafted (this document). Blockers 1–4 raised with the release owner and the PO | orchestrator |
| 2026-10-14 – 10-15 | Backend-first testing of what **is** deployed: Wishlist/sharing authz on XCart 3.1042.0 (xAPI + storage), file-authorization matrix (FileExperienceApi 3.1008.0, XOrder 3.1016.0, Quote 3.1005.0), 6089 cache sequence, 6276 three-caller matrix, Returns organization via xAPI, Page Builder ETag + seeder re-run, Image Tools | qa-backend-expert / test-data-engineer |
| 2026-10-15 – 10-16 | Storefront tickets already on the theme (Sales Rep Tasks/filters, 5945, 6096, 5993, 5990, 6173, 6100) | qa-frontend-expert / ui-ux-expert |
| *Storefront deploy day* | `FRONT_URL` on `dev` ≥ #2574; blocker 1 cleared; 5817, 5880, 5884, 5924, 6265, 6307 leave `PENDING-DEPLOY` | release owner → orchestrator |
| Deploy + 0–1 d | Storefront file links (5924), organization returns UI (5884), compare (5880), PR-build re-confirmations | qa-frontend-expert |
| Deploy + 1 d | §5.3 exploratory charters (30 min each), isolated from the regression pool | per §5.3 owners |
| **2026-10-19** | **Sprint closes.** Re-run `/qa-test-plan Sprint26-20` to capture the Done delta (148 issues open at drafting) | orchestrator |
| 2026-10-20 – 10-21 | Regression over the full §5.1 activation set; triage | regression-orchestrator / qa-lead-orchestrator |
| 2026-10-22 | Re-test of fixes; `Draft → Automated` promotion pass (`--promote`) | qa-lead-orchestrator |
| **2026-10-23** | Exit criteria reviewed; plan promoted `Draft → Approved`, or the gap recorded | orchestrator |

---

## 10. Resources — QA Agent Assignments

Per `.claude/rules/agents.md`. **Max 3 concurrent browser agents** across QA + BA combined. All three
Playwright lanes are click-capable.

| Domain | Agent | Browser lane | Rationale |
|---|---|---|---|
| Configurable products — file authz matrix + quote/order hand-offs | **qa-backend-expert** | `playwright-edge` | GraphQL + file URLs; the matrix is API-primary |
| Configurable products — PDP checklist, cart/order links | **qa-frontend-expert** | `playwright-chrome` | Storefront FLOW (after deploy for 5924) |
| Lists sharing & Wishlist authz | **qa-backend-expert** | `playwright-edge` | xAPI + uncached storage read |
| Lists sharing storefront (Share dialog, rep messaging) | **qa-frontend-expert** | `playwright-chrome` | Sequential with Sales Rep: same agent, same lane |
| Cart & order validation core | **qa-backend-expert** | none / `playwright-edge` | GraphQL-primary; the cache sequence is scripted |
| Platform API authorization | **qa-backend-expert** | `playwright-edge` | REST matrix + Admin widgets under a non-admin role |
| Sales Rep hub (Tasks, filters, empty state) | **qa-frontend-expert** | `playwright-chrome` | Storefront journeys + breakpoints |
| Sales Rep statistics cache (5755) | **qa-backend-expert** | none | Two-instance probe; needs the Redis backplane |
| Returns — organization | **qa-frontend-expert** (UI) + **qa-backend-expert** (xAPI) | chrome / edge | The xAPI half can run before the storefront deploy |
| UI kit & a11y / layout | **ui-ux-expert** | Chrome DevTools MCP | WCAG 2.2 AA, accessible-name and contrast oracles |
| Punchout | **qa-backend-expert** | `playwright-edge` | cXML API; on an environment with the module |
| Image Tools | **qa-testing-expert** | `playwright-firefox` | Admin regenerate + storefront render |
| Page Builder | **qa-testing-expert** | `playwright-firefox` | Two-session concurrency + Designer keyboard |
| Auth / OTP, Orders date filter, Search & analytics | **qa-frontend-expert** | `playwright-chrome` | Storefront; clock override for 6173; `dataLayer` for 6100 |
| Platform settings & SEO, Push audience, SQL Queries | **qa-backend-expert** | `playwright-edge` | Admin-primary |
| Test data (all domains) | **test-data-engineer** | none (Node + Platform API) | Authors **and runs** the seeders, including the Page Builder seeder re-run (§7.1 gate 9) |
| New case authoring (§6) | **test-management-specialist** | `playwright-chrome` (sequential, never parallel with qa-frontend) | **Sole writer** of `regression/suites/**` for the duration of this sprint's changes |
| Suite execution (§5.1) | **regression-orchestrator** | 3-slot pool | Batches of 3, matching the pool |
| Triage, status, go/no-go | **qa-lead-orchestrator** | — | Sole custodian of ticket status transitions |

---

## 11. JIRA Ticket Coverage Matrix

Every **test-relevant Done ticket** (48), its existing regression home, the new cases §6 calls for, and
its deployment state on `vcst` as read on 2026-10-14 09:02 UTC.

**Deploy** legend:
- ✅ the build on `vcst` carries the PR (module: release published after the PR merged, inferred; theme: the PR is in `2.60.0-pr-2543`'s `dev` base)
- ⏳ `PENDING-DEPLOY`: the PR is merged but not in the deployed build. Tested after the deploy (§7.1 blocker 1)
- ⛔ the module is not installed on `vcst`: the case is authorable, and the run result is `BLOCKED`
- ❓ present but not matched to the PR (§7.1 blocker 2)

### 11.1 Stories

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-5886 | Punchout | none for Punchout; 050d PRF-GQL-072..093 (organization queries, consumers of profile-xapi #147) | 14-21 (GAP-08) | — (C1 but module not installed; reserve) | ⛔ Punchout not installed · ✅ profile-xapi | test-management-specialist → qa-backend-expert / qa-frontend-expert; BLOCKED on vcst |
| VCST-6077 | Sales Rep hub | 106 SR-TK-001..029 (stamped; 29 Draft) | 0-2 | EXP-04 (seam only) | ✅ theme · ❓ SalesRep pr-13 | test-management-specialist (holds), qa-frontend-expert |
| VCST-6027 | Configurable products — files | 072f CFG-CHK-001..028 (stamped; 28 Draft); 050i CFG-GQL-032 re-pointed | 0-2 | — | ✅ theme | test-management-specialist (hold CFG-CHK-011 against VCST-6188) |
| VCST-6001 | Sales Rep hub | 097 SR-CO-039..051 (stamped; 13). Selector stale-risk in 014 / 014b / 015 | 0 | EXP-04 (seam only) | ✅ theme · ❓ SalesRep pr-13 | test-management-specialist (REPAIR selectors during lifecycle) |
| VCST-5944 | Push messages audience | 050l PUSH-031/052..055, 068 PUSH-042..051 (stamped; 15) | 0 | — | ✅ | qa-backend-expert |
| VCST-5925 | Lists sharing & Wishlist authz | 007 B2C-LIST-052/064/071/073/075, 050h WISH-036/039/041/042/049 (stamped; 10) | 0-1 | EXP-03 (seam only) | ✅ theme · ❓ SalesRep pr-13 | qa-backend-expert |
| VCST-5924 | Configurable products — files | none stamped; 072b CFG-E2E-024 (Manual; "reference preserved", no link assertion) | 2-3 (GAP-03) | EXP-02 | ⏳ theme lacks #2485 | test-management-specialist → qa-frontend-expert; FE PR not on FRONT_URL |
| VCST-5884 | Returns — organization | 014c RET-ORG-016..033/048..052, 050o RET-ORG-001..015/042..044, 073a RET-ORG-035..039/053, 073b RET-ORG-040/041/045..047 (stamped; 53) | 0-2 | — (displaced: deploy gate + coverage; reserve) | ✅ Return 3.1005.0 · ⏳ theme lacks #2523 | test-management-specialist (AC-4 cases held) |
| VCST-5880 | UI kit & a11y / layout | 098 CMP-036..053 (stamped; 18) | 0 | — | ⏳ theme lacks #2518 | qa-frontend-expert |
| VCST-5850 | Lists sharing & Wishlist authz | 050h WISH-040 (multi-org `organizationIds`, stamped VCST-5707); 050m SR-GQL-042..053 and 007 B2C-LIST-041/048/049 still send singular `organizationId` (M8) | 0-1 | EXP-03 (seam only) | ✅ theme · ❓ SalesRep pr-13 | test-management-specialist → qa-backend-expert; popup multi-select held |
| VCST-5817 | Search bar & analytics | none (004 SRCH-005/011/013 mention scope; no layout shift probe) | 1-2 (GAP-17) | — | ⏳ theme lacks #2522 | test-management-specialist → qa-frontend-expert; FE PR not on FRONT_URL |
| VCST-5728 | Lists sharing & Wishlist authz | 007 B2C-LIST-067 (stamped) | 0 | — | ✅ theme · ❓ SalesRep pr-13 | qa-frontend-expert |
| VCST-5707 | Lists sharing & Wishlist authz | 007 (36 stamped rows), 050h WISH-009/036..049 (15 stamped). B2C-LIST-043 asserts the PRE-rework behaviour | 1-2 (GAP-25) | EXP-03 (seam only) | ✅ theme · ❓ SalesRep pr-13 | test-management-specialist (REPAIR B2C-LIST-043 against the spec) |
| VCST-5687 | Sales Rep hub | none (093/091 cover Edit layout; no empty-state row) | 2-3 (GAP-15) | EXP-04 (seam only) | ✅ theme | test-management-specialist → qa-frontend-expert |

### 11.2 Bugs

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-6247 | Platform API authorization | none (vc-module-import not installed on vcst) | 4-6 (GAP-07) | — (D1: exact authz outcomes; module not installed) | ⛔ Import not installed | test-management-specialist → qa-backend-expert; BLOCKED on vcst |
| VCST-6276 | Platform API authorization | 099 PERS-008 (write without personalization:update, stamped VCST-5282); 034 / 076 legacy admin rows (consumers) | 8-12 (GAP-06) | — (D1: permission matrix) | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6268 | Image Tools | 069 IMGTL-008/009/010/028 (legacy, no status; consumers); 062 (consumer) | 5-8 (GAP-09) | — (no C signal; format x method is EP) | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6125 | Lists sharing & Wishlist authz | 050h WISH-045 (reader + other-rep refusals; co-owner variant deferred as FIXTURE-GAP); 007 B2C-LIST-077 | 2-3 (GAP-04) | EXP-03 | ✅ XCart 3.1042.0 · theme | test-management-specialist + test-data-engineer (fixture) → qa-backend-expert |
| VCST-6116 | Lists sharing & Wishlist authz | 050h WISH-047 (stamped, Catches:VCST-6116) | 0 | EXP-03 (seam only) | ✅ XCart 3.1042.0 · theme | qa-backend-expert |
| VCST-6089 | Cart & order validation core | none stamped; consumers 050b5 (ruleSet), 050b4 CRX-GQL-*, 015 QUOTE-001/007, 075b MCO-GQL-005/013 (loyalty createOrderFromCart negatives; consumers) | 4-6 (GAP-05) | — (D1: exact gate contract) | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6012 | Page Builder | 060b CMS-184 (overwrite-dialog keyboard; neighbour, different ticket) | 3-4 (GAP-12) | EXP-05 | ✅ | test-management-specialist → qa-testing-expert (firefox) / qa-backend-expert |
| VCST-6011 | Page Builder | none (059/060/060b: zero clipboard / Shared Component rows) | 2-3 (GAP-11) | EXP-05 | ✅ | test-management-specialist → qa-testing-expert (firefox) |
| VCST-5995 | Configurable products — files | none stamped; 050i CFG-GQL-029/030 (Quarantined, cart-side only); 072b CFG-E2E-024 (Manual, no link/authz) | 4-6 (GAP-01) | EXP-02 | ✅ backend · ⏳ storefront #2485 | test-management-specialist + test-data-engineer (two-buyer fixture) → qa-backend-expert |
| VCST-6307 | UI kit & a11y / layout | none (002 consumer) | 1-2 (GAP-20) | — (D1: contrast ratio at AA) | ⏳ theme lacks #2574 | test-management-specialist → qa-frontend-expert (+ ui-ux-expert) |
| VCST-6173 | Orders date filter | 014b ORD-063..066 (presets send both bounds; shape only) | 3-4 (GAP-24) | — (D1: date arithmetic) | ✅ theme | test-management-specialist → qa-frontend-expert; needs clock + timezone override capability |
| VCST-6131 | Auth / OTP | 104 OTP-002/003, 105 OTP-019/020/028 (wrong code, lockout API, blocked account); none for the locked-account UI message | 2-3 (GAP-13) | — (D1: one assertable negative; fix path unconfirmed) | ❓ Otp 3.1000.0; fix path unknown | test-management-specialist → qa-frontend-expert / qa-backend-expert |
| VCST-6107 | Returns — organization | 014c RET-ORG-027 (stamped; table layout), RET-ORG-031 (dark mode); no details-label contrast row | 1-2 (GAP-20) | — (D1: contrast ratio) | ✅ theme | test-management-specialist → ui-ux-expert / qa-frontend-expert |
| VCST-6104 | Lists sharing & Wishlist authz | 007 B2C-LIST-074, B2C-LIST-078 (stamped) | 0 | — | ✅ theme | qa-frontend-expert |
| VCST-6096 | UI kit & a11y / layout | 048c LAYOUT-COMP-VCBUTTON-* (layout only; consumers) | 2-3 (GAP-19) | EXP-01 (consumer seam) | ✅ theme | test-management-specialist → ui-ux-expert / qa-frontend-expert |
| VCST-6093 | Platform settings & SEO admin | 101 SIL-020/022/024/057 (stored-setting path, stamped VCST-5898; consumers) | 2-3 (GAP-22) | — (D1; env override + restart prerequisite) | ✅ | test-management-specialist → qa-backend-expert; Manual/BLOCKED unless the stand carries the override |
| VCST-6010 | Page Builder | none | 2-3 (GAP-11) | EXP-05 | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6009 | Page Builder | 059 CMS-113/116/122/130 (Designer load/clone/round-trip; consumers). No row asserts 428/412/400 | 4-6 (GAP-10) | EXP-05 | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6000 | Configurable products — files | 072d CFG-FILE-003 (Manual, stamped VCST-4827, UI half); none for addItem / MinFileSize | 3-4 (GAP-02) | EXP-02 (seam only) | ✅ XCart 3.1042.0 · theme | test-management-specialist + test-data-engineer (0-byte / 1-byte alias) → qa-backend-expert |
| VCST-5999 | Configurable products — files | none stamped; 015 QUOTE-013 (Draft, generic "Quote with Attachments") | 2-3 (GAP-01) | EXP-02 | ✅ | test-management-specialist → qa-backend-expert |
| VCST-5993 | UI kit & a11y / layout | 007 B2C-LIST-056/057 (consumers; stamped VCST-5707) | 2 (GAP-19) | EXP-01 (consumer seam) | ✅ theme | test-management-specialist → ui-ux-expert |
| VCST-5990 | UI kit & a11y / layout | 028 CART-031/035 (Manual; steppers, no a11y state) | 2-3 (GAP-19) | EXP-01 (consumer seam) | ✅ theme | test-management-specialist → qa-frontend-expert; "before commit" held |
| VCST-5989 | Platform settings & SEO admin | 066 SEO-001 (broken-link detection; consumer of "Debug no longer records broken links"); none for explain | 3-5 (GAP-21) | — (D1: stage counts) | ✅ | test-management-specialist → qa-backend-expert |
| VCST-5978 | UI kit & a11y / layout | none (045 A11Y-KB-004/005 generic Manual; 097 SR-CO-051 is a calendar case) | 2 (GAP-19) | EXP-01 (consumer seam) | ✅ theme | test-management-specialist → ui-ux-expert |
| VCST-5945 | UI kit & a11y / layout | 048c LAYOUT-COMP-HEADER-001/003 (spacing grid, touch targets at 375); none at 1280 signed-in | 1-2 (GAP-16) | — | ✅ theme | test-management-specialist → qa-frontend-expert |
| VCST-6306 | Platform settings & SEO admin | 034 STORE-017 (Draft, "Edit SEO"); 053 CATA-015/037 (category SEO list rows; consumers) | 2-3 (GAP-21) | — | ✅ | test-management-specialist → qa-backend-expert |
| VCST-6265 | UI kit & a11y / layout | none (033 consumer; 048c LAYOUT-COMP-VCSIDEBAR-001) | 1 (GAP-16) | — | ⏳ theme lacks #2571 | test-management-specialist → qa-frontend-expert |
| VCST-6180 | Sales Rep hub | none (091 recent-orders rows do not assert single-line values) | 0-1 (GAP-16) | EXP-04 (seam only) | ✅ theme | test-management-specialist → qa-frontend-expert |
| VCST-6176 | Returns — organization | 014c RET-ORG-052 (nav present; no icon assertion) | 0-1 (GAP-20) | — | ✅ theme | ui-ux-expert (vs. DESIGN icon parity) / test-management-specialist |
| VCST-6175 | Sales Rep hub | 097 SR-CO-032 (Draft, EXPECTED-RED until this fix; unstamped) | 0 | EXP-04 (seam only) | ✅ theme | test-management-specialist (stamp + drop EXPECTED-RED during lifecycle) |
| VCST-6153 | Sales Rep hub | none (091/093 Top sellers rows assert ranking, not wrapping) | 1-2 (GAP-16) | EXP-04 (seam only) | ✅ theme | test-management-specialist → qa-frontend-expert |
| VCST-6100 | Search bar & analytics | 043 GA-053 (search dropdown kept on manual calls); no row asserts on-load silence | 2-3 (GAP-18) | — (D1: dataLayer contract BL-GA4-001) | ✅ theme + VCST-6017 overlay | test-management-specialist → qa-frontend-expert |

### 11.3 Tasks / TechDebt

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-6199 | SQL Queries | none (no SQL Queries suite) | 4-6 (GAP-23) | — | ✅ | test-management-specialist → qa-backend-expert; BLOCKED-prone (read-only DB login) |
| VCST-5755 | Sales Rep hub | none (050m/093 cover statistics shape, no cache-freshness row) | 3-5 (GAP-14) | EXP-04 | ❓ SalesRep pr-13 vs #18 | test-management-specialist → qa-backend-expert; 2-replica half BLOCKED on a single replica |

### 11.4 Coverage summary

| Status | Count | Tickets |
|---|---|---|
| **Fully covered (re-run only; at most a stamp or a held-assertion review)** | **12** | VCST-5728, 6104, 6116, 5944, 6175 (existing `SR-CO-032`, drop EXPECTED-RED), 6001, 5880, 5925, 5850, 5884, 6027, 6077 |
| **Covered, needs new cases** | **33** | the §11 rows with a non-zero count and an existing suite |
| **No suite for the shipped surface** | **3** | VCST-6247 (import authz → `108`), VCST-5886 (punchout → `109` + `110`), VCST-6199 (SQL Queries → `111`) |
| **Spec conflict held (part of the ticket)** | **6** | VCST-6077 (rail width), 5990 (before commit), 6011 (Paste), 5884 (AC-4), 5850 (popup multi-select), 6027 (VCST-6188) |
| **`PENDING-DEPLOY` on `vcst` (storefront)** | **7** | VCST-5817, 5880, 5884, 5924, 6265, 6307, plus the storefront half of 5995 |
| **`BLOCKED` — module not installed** | **2** | VCST-6247, VCST-5886 |
| **Out of scope** | **28** | §2.4 |

> **The authorization fixes are where the coverage debt sits, not the features.** The big features are
> already stamped: Lists sharing (51 rows), organization Returns (53), Tasks (29), the configuration
> checklist (28), compare (18). Testing for those ran before this plan. The rows that do **not** exist are
> the ones that refuse someone: the file owner / other-buyer matrix (GAP-01), the permission matrix on
> three modules (GAP-06), the co-owner (GAP-04), and the ruleSet gate (GAP-05). Those four gaps are 19
> of the 36-case first wave. They are also the cases that fail silently when missing, because every
> existing case runs as the caller who is allowed.

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

Tickets whose correctness cannot be decided on one layer. Each needs the layers compared against *each
other*, not each checked in isolation.

| # | Ticket(s) | Chain to verify | Why one layer is not enough |
|---|---|---|---|
| 1 | **VCST-5995 + 5999 + 6000 + 5924** | PDP configuration (File section) ↔ `addItem` validation ↔ file-experience-api upload + owner ↔ `createQuoteFromCart` (file re-owned) ↔ cart cleared ↔ order `files.url` ↔ storefront order-details link | The file changes owner at each hand-off, and each fix sits on a different layer. A link that renders but 403s, or a quote URL that 404s after the cart is cleared, is only visible end to end |
| 2 | **VCST-6116 + 6125 + 5925** | Storefront Share dialog ↔ `changeWishlist` / `addWishlistItem` ↔ **stored list state (uncached admin read)** ↔ `sharedWishlist` for each recipient | 6116 returned "denied" while the store changed. The response and the storage disagreed, and only reading both shows it |
| 3 | **VCST-5728 + 5850 + 5707** | Rep Share / Send a message ↔ `sendCustomerCommunication` ↔ notification (push + email) per recipient ↔ recipient inbox | "Notify only the new customers" and "a message-only edit sends nothing" are decided at the inbox, not at the mutation |
| 4 | **VCST-6089** | Storefront checkout / quote request ↔ `createOrderFromCart` / `createQuoteFromCart` gate ↔ cached aggregate validation by rule set ↔ the order or quote actually persisted (Admin) | A wrong gate shows as a created order that should not exist, or a refusal with no visible reason |
| 5 | **VCST-6276** | Admin role permissions ↔ REST tax / personalization / completeness ↔ Admin widgets ↔ **storefront cart tax** | The fix hardens the API; the storefront's tax path must stay unaffected, and only comparing the two shows over-refusal |
| 6 | **VCST-5884** | Permission grant (Admin) ↔ org-scoped returns query (xAPI) ↔ storefront organization tab ↔ draft / cancelled-draft exclusion | Visibility is enforced server-side and rendered client-side; VCST-6226 leaked a cancelled draft through exactly this seam |
| 7 | **VCST-5755** | Rep A's order change on instance 1 ↔ Redis backplane ↔ statistics read on instance 2 ↔ dashboard tile vs sum of customer cards | Cache invalidation is a property of two instances; one instance always looks right |
| 8 | **VCST-6009** | Designer tab A and tab B ↔ grouped content GET (ETag) ↔ save (If-Match) ↔ 412 / 428 ↔ stored page | "One winner, never a mixed state" is only checkable by reading the stored page after both saves |
| 9 | **VCST-5886** (where installed) | ERP `PunchOutSetupRequest` ↔ cXML response StartPage ↔ token sign-in ↔ storefront punchout mode (single org) ↔ token reuse refused | A single-use credential crosses three systems; reuse is refused or it is not |

---

## 13. References

**Merged PRs — `vc-frontend` (35 in window; 34 on `dev`; 28 product):** #2476 (VCST-5707/5925/5728/5850/6104/6125), #2480 + #2481 + #2551 (VCST-5159, module-federation harness, ships **off**), #2485 (VCST-5924), #2504 (VCST-5761), #2506 (VCST-5886), #2510 (VCST-6000), #2518 (VCST-5880), #2519 (VCST-6001), #2522 (VCST-5817), #2523 (VCST-5884), #2527 (VCST-6027), #2528 (VCST-6096), #2529 (VCST-6100), #2531 (VCST-5993), #2532 (VCST-6107), #2533 (VCST-5990), #2534 (VCST-5945), #2536 (VCST-6077, re-lands #2514), #2537 (VCST-6153/6180), #2539 (VCST-5687), #2540 (VCST-6173), #2541 (VCST-6175), #2544 (VCST-6176), #2547 (unlinked: backend packages + GraphQL types, `requestPasswordReset` removed), #2571 (VCST-6265), #2574 (VCST-6307). **CI / tooling, not product:** #2538, #2545, #2546, #2549, #2550, #2553, #2562. **Deployed theme:** `2.60.0-pr-2543` = open PR #2543 (VCST-6017).

**Merged PRs — modules + platform (44 product PRs across 27 repos):** `vc-platform` #3127, #3128, #3129, #3132, #3135 · `vc-module-x-cart` #141, #144, #147, #149 · `vc-module-x-order` #53, #55 · `vc-module-quote` #158, #159 · `vc-module-file-experience-api` #22, #25 · `vc-module-cart` #194 · `vc-module-sales-rep` #18, #21 · `vc-module-return` #28 · `vc-module-pagebuilder` #165, #167, #170 · `vc-module-tax` #61 · `vc-module-catalog-personalization` #93 · `vc-module-catalog-publishing` #82 · `vc-module-import` #43, #44, #45 · `vc-module-image-tools` #130 · `vc-module-punchout` #1 · `vc-module-profile-experience-api` #147 · `vc-module-push-messages` #28 · `vc-module-seo` #22, #24 · `vc-module-catalog` #910 · `vc-module-sql-queries` #25 · `vc-module-x-api` #89 · `vc-module-store` #186 · `vc-module-customer` #320 · `vc-module-content` #224 · `vc-module-background-jobs` #6, #7 · `vc-module-subscription` #128 · `vc-module-audit-log` #21. **Bundles:** `vc-modules` #78, #80, #82–#86. **Out of scope:** `vc-shell` #378–#385, `vendor-portal` #242, #246–#248, #251, #252, `vc-frontend-next` #2–#9, 40 CI-sweep / dependabot PRs.

**Deployed versions (`vcst`, read 2026-10-14 09:02 UTC via `scripts/preflight/cli.ts`):** Platform 3.1079.0 · theme `2.60.0-pr-2543` · XCart 3.1042.0 · XOrder 3.1016.0 · Quote 3.1005.0 · FileExperienceApi 3.1008.0 · Cart 3.1012.0 · SalesRep `3.1014.0-pr-13-4fbb` · Return 3.1005.0 · PageBuilder 3.1034.0 · Tax 3.1008.0 · CatalogPersonalization 3.1007.0 · CatalogPublishing 3.1008.0 · ImageTools 3.1007.0 · ProfileExperienceApi 3.1021.0 · PushMessages 3.1008.0 · Seo 3.1007.0 · Catalog 3.1049.0 · SqlQueries 3.1006.0 · Xapi 3.1027.0. **Not installed:** Import, Punchout, AuditLog.

**Knowledge and rules (read, not restated):**
- `.claude/rules/agents.md` (roster, browser lanes, delegation) · `.claude/rules/test-data.md` · `.claude/rules/regression.md` · `.claude/rules/reports.md`
- `.claude/knowledge/oracles/` (`BL-*` via `npm run bl:extract`, read-only here; `BL-UI-003`, `BL-GA4-001` cited) · `ECL-*`
- `.claude/knowledge/execution/quality-gates.md` · `ticket-routing.md` · `ticket-status-transitions.md` · `test-data-authoring.md` · `live-discovery.md`
- `.claude/knowledge/domain/sitemap.md`: **rev 11**, refreshed at Step 0 of this run (deterministic axis only; routes known-stale)
- `.claude/skills/qa-risk/risk-prioritization-framework.md` (§3) · `.claude/skills/qa-test-design/test-design-techniques.md` (§4.3) · `.claude/skills/qa-sbtm/sprint-charter-selection.md` (§5.3)
- Observed-behaviour base: ask with `npm run kb -- ask "<coordinate> <question>"` (or `mcp__kb__kb_ask`) before writing any claim about platform behaviour

**Manifest and tooling:** `config/test-suites.json` (**154 suites, 38 selection groups** at time of writing;
`npm run suites:lint` prints the live totals) · `npm run regression:plan -- <group>` · `npm run env:check` ·
`npm run td:validate` · `npm run suites:lint`.

**Prior art:**
- `vc/shared/docs/Sprint plans/sprint-26-19-test-plan.md`: the immediately prior plan
- `reports/tickets/Sprint26-20/`: **18 ticket folders already exist** (VCST-4973, 5880, 5884, 5993, 5995, 5999, 6009, 6017, 6027, 6081, 6089, 6214, 6226, 6261, 6262, 6265, 6281, 6307). Read these before re-testing anything
- `reports/exploratory/`: `SBTM-VCST-6017-2026-10-13`, `SBTM-VCST-5884-2026-10-12` / `-10-08`, `SBTM-VCST-5880-2026-10-12`, `SBTM-VCST-6077-2026-10-07`, `SBTM-VCST-6027-2026-10-06`, `SBTM-VCST-6001-2026-10-06`
- `reports/regression/REG-2026-10-13-1739`, `REG-2026-10-13-1726`: most recent runs

**Tracker:** Jira project `VCST`, sprint `VCST Sprint 26-20` (id 2717, board 126).
