# Sprint 26-21 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-10-28
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-10-19 – 2026-11-02 *(quoted from the Jira sprint object `VCST Sprint 26-21`, id 2718, board 126)*

> **⚠ This sprint is still OPEN.** The plan was built on 2026-10-28, five days before the sprint closes. **165 of 211** issues are not Done. The 100 read before Jira's page limit split as:
> - Bug: 17 Draft, 8 To do, 7 In review, 4 Ready for test, 2 Testing, 2 Tested, 2 Cancelled, 1 Refinement, 1 Wait hotfixes.
> - Task: 21 To do, 8 In progress, 4 Testing, 2 In review, and 5 others.
> - Story: 4 In progress, 3 Draft, 3 Refinement, and 3 others.
> - 5 Review / Spike / TechDebt.
>
> The scope below is the **Done** set. Re-run `/qa-test-plan 26-21` after the sprint closes to capture the rest.

> **`FRONT_URL` serves `dev`, and every Done ticket except punchout is deployed.** Build read live on 2026-10-28 08:40 UTC (`scripts/preflight`, `/api/platform/modules`, deployed theme). Declared = deployed, with no drift:
> - **Theme `2.61.0-alpha.2605`** is `vc-frontend` `dev` @ `d4edbe94` (#2607, 2026-10-28 07:40). It carries every Done storefront PR of the sprint, **including #2607, which removes the built-in Sales Rep Hub**. It does **not** carry #2601 (VCST-6121 passkeys / `/account/security`, merged an hour later).
> - **Platform 3.1090.0**, 89 modules, all on releases, no PR builds:
>   - New this sprint: **MFA 3.1000.0**, **OTP 3.1001.0** and **AdminShell 3.1001.0**.
>   - Sprint fixes: SalesRep 3.1016.0, PageBuilder 3.1038.0, Customer 3.1031.0, Xapi 3.1028.0, XOrder 3.1017.0, Search 3.1013.0, Catalog 3.1051.0, Pricing 3.1010.0, ImageTools 3.1009.0, ProfileExperienceApi 3.1022.0, GoogleEcommerceAnalytics 4.1006.0. Each release carries its sprint fix: the release version is at or above the one in the ticket.
> - **`VirtoCommerce.Punchout` is not installed on `vcst`** (as in 26-20), so VCST-5887's backend is `NOT_DEPLOYED` here. `vcptcore-qa1` runs Punchout `pr-6`. The storefront half (#2564) **is** on `vcst`.
> - **`vc-frontend` `dev` CI has been red on every push since 2026-10-27 14:53** (`a9de7833`, alpha.2602 → alpha.2605): the Playwright auto-tests fail, and so does deploy-cloud "Check deployment status". The theme `vcst` serves is the head of a red branch. Read any storefront failure on Sales Rep, sign-in or profile as possibly already seen by upstream CI before filing it.
>
> **Most of this sprint was QA'd on PR builds before merge**, on `vcptcore-qa1`, `vcptcore-qa`, `vcst` PR pins, or a local storefront pointed at the `vcst` API. Jira records a QA verification on 29 of the 35 test-relevant tickets. **None** is recorded on VCST-6181, 6425, 6479, 6533 and 6567; VCST-6480 was verified by its developer only. As in 26-20, **this plan is mainly a post-merge confirmation plan.** Its job is to prove that the deployed release builds behave the way the PR builds did, and that the six unverified tickets behave at all.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-21 (`VCST Sprint 26-21`, Jira sprint id 2718) |
| Date range | 2026-10-19 – 2026-11-02 (quoted from the sprint object; **active** at drafting) |
| Sprint goal (Jira) | Release MFA, Passkey and Punchout; GA Admin Shell; CMS Page Builder Next (roadmap); MCP; Sales Rep Hub; QA Test Fast for the dev team |
| Theme | **Sign-in gets a second step, and the back office gets a second shell.** MFA by email code ships end to end: a new module, platform two-factor extension points, an OTP grant change, the storefront code step, and Admin Shell / VC-Shell sign-in. The Vue **Admin Shell** goes live: one new module plus 51 per-module admin-UI PRs merged on one day. The **Sales Rep Hub** is now delivered only as a module plugin; the built-in copy was deleted from the theme the morning this plan was written. Around them: four search and indexing changes, four Page Builder changes, and a run of storefront i18n, a11y and GA4 fixes found by agents |
| Done tickets | **46**: 11 Stories, 19 Bugs, 13 Tasks, 2 Review tasks, 1 Spike |
| **Of which out of scope** | **11**: 5 `[Agentic QA]`, 1 `[MF]` ai-tools skill, 1 CI workflow, 1 spike, 1 demo data, 1 hosting config, 1 merge-release task (§2.4) |
| **Test-relevant Done tickets** | **35**: 10 Stories + 18 Bugs + 5 Tasks + 2 Review tasks (both review tasks shipped code) |
| Merged PRs in `vc-frontend` | **16 product PRs**: 15 on `dev`, plus #2592 (VCST-6274), which landed on the `feat/VCST-6231-css-layers` branch, not `dev`. Also 4 CI/release-workflow PRs (#2580, #2585, #2605, #2611) and 1 tests-only PR (#2589). No reverts. **Two are flagged breaking:** #2570 moves the OTP code step into a form shared with MFA (the PR drops three `otp-email-*` data-test-ids, which no suite uses; the rendered ids may be unchanged, so read the live DOM before authoring a selector), and #2607 removes the built-in Sales Rep Hub and the `sales_rep_builtin_enabled` setting |
| Merged PRs in modules + platform | **80** product PRs across **63 repos** (`vc-module-*` + `vc-platform`), 79 on the default branch. **51 of them are VCST-6327's per-module Admin Shell UI PRs, merged 2026-10-27.** The rest of the window: 66 bundle bumps (62 `vc-deploy-dev`, 4 `vc-modules`), 5 `vc-shell` PRs, 1 `vendor-portal` PR, 1 `vc-frontend-next` PR, and **30** CI-sweep/dependabot PRs, excluded. Source: an org-wide `is:merged` search, not limited to VCST-keyed PRs |
| Done outside the sprint, merged and deployed in the window | **VCST-6536** (x-order #57, a **security** fix: a buyer could read other customers' orders via an OR keyword) · **VCST-6477** (search #159: keywords with `'` or `&` now filter) · **VCST-6340** (quote #167 / product-snapshot #5, background jobs moved off Hangfire). §2.3 |
| `vc-frontend-next` | 1 product PR (#11, the 2.60.0 merge, VCST-6398) and 3 CI. Out of scope (§2.4). The three bugs that merge found (6452/6453/6454) were fixed in `vc-frontend` and **are** in scope |
| Storefront sitemap | Refreshed to **rev 12** at Step 0. Platform line 3.1078.0 → **3.1090.0**, modules 87 → **89**, products 4,615 → **4,655**, 52 nav categories (rev 11 counted one twice; Carriage Bolts moved back to `bolts/`), `/products-with-options` 7 unchanged. **Deterministic axis only.** The local `vc-frontend` checkout is still `48a9759c` from 2026-09-24, so the route lists remain known-stale. That matters now: #2607 deletes the theme's own `/company/*` routes, and the hub's routes now come from the plugin |

**The risk this sprint is a sign-in that is refused, and nothing reports it.** MFA changes what a
correct password means: with `MultiFactorAuthentication.Enabled`, the token endpoint answers
`two_factor_required` instead of a token. The failure that ships unnoticed is a legitimate caller
that can no longer get in, for example an OTP-only buyer, a VC-Shell app (VCST-6533), an impersonating
rep, or a login helper that does not expect the code step. Every such failure
looks like "login broken" in a regression run, so it gets triaged as flake. The Sales Rep Hub has the
same shape: if the host does not serve the plugin, the hub is simply absent, and no error is raised.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 10 of 11 Done)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6327 | **Highest** | **Admin Shell on VC-Shell.** New module `vc-module-admin-shell`: a vc-shell host at `/apps/admin-shell/` that loads module UIs as Module Federation remotes. Unported AngularJS screens stay reachable inside a frame. One server-built menu replaces the AngularJS menu and the app switcher (strangler pattern). Needs `SecurityHeaders:FrameOptions=SameOrigin`. QA: **FAIL** 2026-10-23 (48/58 checklist rows, REG-2026-10-23-1337 23/11/3), then **PASS WITH OPEN ISSUES** 2026-10-26. Spawned VCST-6545…6563 | Back office shell | admin-shell #1, vc-shell #386, platform #3137 + **51 module PRs** (§13) |
| VCST-6260 | **Highest** | **Classic admin theme update.** Responsive below 768 px (drawer menu, one blade plus a folded strip), "Collapse menu" at the bottom, global search Ctrl/Cmd+K (menu, apps, settings, users, roles; permission-scoped), header license / environment / version labels, Settings v2 (unknown key → 400 with nothing half-saved). Released in Platform 3.1088.0 | Back office shell | platform #3134 |
| VCST-5904 | **High** | **MFA by email code** for back office and storefront. Global `MultiFactorAuthentication.Enabled` plus a per-store `StoreMode`. Correct password → `two_factor_required`; right code → `amr=mfa`; wrong → `invalid_code`; resend, attempt cap and ticket lifetime. The sign-in log records both steps. **Contract changes:** #2570 moves the OTP code step into a form shared with MFA, and OTP #3 lets `otp_email` skip the second factor. Not testable on a stand: `DisableEnforcement`, external IdP bypass | Auth — MFA & OTP | platform #3133, mfa #1/#2, otp #3, customer #321, vc-frontend #2570 |
| VCST-5887 | **High** | **Punchout cXML `PunchOutOrderMessage`.** "Create requisition" replaces "Place order" in a punchout session and POSTs the reviewed cart to the procurement system. A second return is refused. A replay with `Punchout.Enabled` off is refused. Sessions started before the deploy cannot return a cart | Punchout | punchout #2 (**not installed on `vcst`**), vc-frontend #2564 |
| VCST-5337 | Medium | [Sales Rep] **Customer insights GA.** Orders (qty, $, MTD/YTD), last order, search and browse history from GA4, carts, last login. Works **without** the GA module. Activity at `/company/my-customers/{id}/activities`. Needs GA4 Workload Identity and the `sales-rep:diagnostics` permission | Sales Rep hub | sales-rep #15, google-ecommerce-analytics #61, vc-frontend #2458 |
| VCST-5731 | Medium | [E2E] **Customer search activity.** Recent terms, latest first, with a Top switch. Clicking a term opens `/search?q=<term>` | Sales Rep hub | same as 5337 |
| VCST-6314 | Medium | [Sales Rep Hub] **Schedule a call with date and time.** "Schedule call" on the customer page opens a task of type Call: customer prefilled, time mandatory (default 9:00 AM), optional Google/Apple Calendar copy, unserved customers refused. **Also delivers VCST-6399:** SalesRep starts without the Task Management module | Sales Rep hub | sales-rep #26 (+ #13) |
| VCST-6533 | Medium | **VC-Shell apps: sign in with the email code** when back-office MFA is on: a code step after a correct password, not "login or password is incorrect". With MFA off, password only. **No QA recorded** | Back office shell / Auth | admin-shell 3.1001.0 (no PR link in ticket) |
| VCST-5903 | Medium | [UI kit] **VcStatWidget** KPI card. No storefront consumer yet; Storybook only | Storefront UI kit | vc-frontend #2568 |
| VCST-5906 | Medium | [UI kit] **VcTileButton** (button / router link / external link; disabled is always a button). No consumer yet; Storybook only | Storefront UI kit | vc-frontend #2575 |

### 2.2 Bugs Fixed (QA-relevant — 18 of 19 Done)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6167 | Medium | [Support/Thorlabs] **Event-based product indexing no longer expires the whole product cache** (`ExpireRegion` + `GC.Collect` after every batch removed). Hotfixed to S16/S15 | Search & indexing | catalog #914, vc-modules #94 |
| VCST-6425 | Medium | **Azure Search: intermittent 500 "Cannot skip tokens on partial JSON"** (SDK 12.1.0-beta.2). #61 reverts #59's `IncludeFields → $select`, which had caused 400s on virtual fields. Hotfixed to S16/S15/S14. **No QA recorded**; it applies only on Azure Search stands | Search & indexing | azure-search #59, #61 |
| VCST-5690 | Medium | **Profile/contact validation returns field-level detail.** Six xProfile mutations now return `{field, errorCode, message}` instead of a bare `VALIDATION`. `/account/profile` and the address dialog show the error under the rejected input; nothing is saved | Customer profile | profile-experience-api #150, vc-frontend #2597 |
| VCST-6181 | Medium | **Admin Contacts → Accounts → Link:** keyword search and the filters (Locked, Email not verified, Account type, Status, Role, Last login) now filter the list. Customer 3.1029.0, hotfixed to S16/S15. **No QA recorded** | Customer profile | vc-module-customer (PR not linked in ticket) |
| VCST-4973 | Medium | **Page Builder:** the 4 missing success toasts on the Published-page and Pages-list flows fire once each. Hotfixed to v16/v15 | Page Builder | pagebuilder #172 |
| VCST-6381 | Medium | **Asset Library:** opening a folder (from the list, a breadcrumb, or the Designer picker) clears the search text | Page Builder | pagebuilder #177 |
| VCST-5991 | Medium | [UI kit] **VcQuantityStepper `max={0}`** is a real ceiling: the stepping helpers and DOM/ARIA agree | Storefront UI kit | vc-frontend #2542 (+ #2484) |
| VCST-6454 | Medium | [Configurable products][a11y] **Option radios on a configurable PDP get an accessible name** (product name, or "None"; WCAG 4.1.2) | Storefront UI kit, a11y | vc-frontend #2599 |
| VCST-6452 | Medium | [Quotes][i18n] **No raw i18n keys** on `/account/quotes` and `/account/quotes/{id}` after a full-page load | Storefront i18n | vc-frontend #2593 |
| VCST-6501 | Medium | [i18n] **Switching language twice** on a product whose slug exists in one language only **no longer ends on 404** | Storefront i18n | vc-frontend #2604 |
| VCST-6453 | Medium | [GA4] **Infinite scroll:** each page's `view_item_list` carries only the products that page added, with correct index | Storefront analytics | vc-frontend #2594 |
| VCST-6148 | Medium | **Order.Status localization save no longer 500s** ("same key en-US"). Double-click guard; an existing duplicate self-heals on the next save. Platform 3.1086.0 | Platform admin | platform #3139 |
| VCST-6480 | Medium | **Modules load on ARM64** (module DLLs copied to the probing folder). Developer-verified on Apple Silicon only; on x64 stands, a smoke check only | Platform admin | platform #3146 |
| VCST-6309 | Low | **Pricing API rejects zero and negative list prices** (`PUT /api/products/prices`, `PUT /api/products/{id}/prices`). CSV price import still accepts list = 0 (not covered) | Pricing API | pricing #242 |
| VCST-6310 | Low | **Admin Sign-in log grid** in the profile time zone, consistent with the record card and Users → Last login | Platform admin | platform #3140 |
| VCST-6311 | Low | **Sign-in log trend badges** show an absolute delta on a near-zero baseline instead of "↑ 88400%" | Platform admin | platform #3140 |
| VCST-6478 | Low | [GA4] **`select_item` / `view_item` / `add_to_wishlist` items** carry currency, list id/name and index | Storefront analytics | vc-frontend #2598 |
| VCST-6500 | Low | **Image Tools:** the thumbnail run reports real counts ("Processed 51 of 51"), not 0 of 0 | Image Tools | image-tools #133 |

### 2.3 TechDebt / Structural / Tasks (QA-relevant — product behaviour, test impact)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6532 | Medium | [MF][FE] **The built-in Sales Rep Hub is removed from the theme.** That means `client-app/modules/sales-rep`, the `sales_rep_builtin_enabled` setting, and the codegen and ESLint entries. The hub now comes **only** from the SalesRep module plugin (3.1014.0+), so every storefront host must route `/modules/...`. **No QA**: "covered by regression testing". That makes the §5.1 Sales Rep suites the test of this ticket. **Deployed on `vcst` since this morning** | Sales Rep hub | vc-frontend #2607 (**breaking**, 240 files) |
| VCST-6567 | Medium | **Admin Shell MFA sign-in**: `two_factor_required` → code step, wrong code, attempt limit, resend, back to sign-in. The **passkey** part is in scope of the story but not shipped (vc-module-passkeys #1 and platform #3144 are still under test). Developer-tested only | Back office shell / Auth | admin-shell #3 |
| VCST-6132 | Medium | **OTP sign-in falls back** to another accessible organization when the last-used one is blocked or stale, the way the password grant already does. This applies to every credential sign-in that sets `SignInResult` (password, `otp_email`, mfa). QA covered `otp_email` only (OTP-029…051 in 104/105); the MFA path was deferred to 5904 | Auth — MFA & OTP | customer #321 |
| VCST-5443 | Medium | **Page Builder Designer Asset Library picker:** multi-select, New folder beside Upload, upload into the new folder, pending selection kept (8 ACs). AC1/AC2 need the storefront **Image carousel** section (#2595), released together | Page Builder | pagebuilder #166, vc-frontend #2595 |
| VCST-6443 | Medium | **Page Builder permalinks** containing whitespace, `& ? #` or invisible characters are **rejected with 400**, not stored or normalized. The rule is the same in the API, the shell and the legacy page blade. **Legacy page migration was not tested** | Page Builder | pagebuilder #178 |
| VCST-6429 | Medium | *(Review task, shipped code)* **IndexationJob lock contention** is logged as Error and shown on the progress notification, and the lock is always released. Search 3.1011.0. Spawned VCST-6474 (concurrent progress display, To do) | Search & indexing | search #157 |
| VCST-6479 | Medium | *(Review task, shipped code)* **AutoMapper removed from `vc-module-x-api`** (`AddSchema` no longer calls `AddAutoMapper`; no GraphQL schema change). Xapi 3.1028.0. **No QA recorded** on the module every storefront query goes through | GraphQL xAPI core | x-api #93 (flagged breaking: DI) |
| *(Done outside the sprint)* VCST-6536 | **High** | **[X-Order] a buyer could read other customers' orders** via an OR keyword in the `orders` / `organizationOrders` search. The caller scope is now AND-ed. XOrder 3.1017.0 on `vcst`. **Security fix, not in any sprint** | GraphQL xAPI core | x-order #57 |
| *(Done outside the sprint)* VCST-6477 | Low | **Search keyword parser accepts `'` and `&` inside words** (O'Neil, A&B). Such keywords now filter instead of being dropped and returning everything. Reported on pickup locations, but **the parser is shared** | Search & indexing | search #159 |
| *(Done outside the sprint)* VCST-6340 | High | NU1903 package bump, and **background jobs move off Hangfire** for Quote and Product Snapshot. `vcst` Quote 3.1005.0 predates #167, so the move is not deployed here | — | quote #167, product-snapshot #5 |
| *(selector impact)* | — | **#2570** is flagged as removing `otp-email-code-input`, `otp-email-sign-in-button` and `otp-email-resend-button` and renaming the OTP BEM classes. **No suite, script or fixture references them** (suite 104 drives the code step by labels), and the shared form may render the same ids. No REPAIR is needed; read the live DOM before authoring a new selector. **#2607** removes the theme's sales-rep module wholesale, so any case keyed to built-in-hub selectors or `sales_rep_builtin_enabled` is stale. **#2597** changes the profile error from a toast to a field error. **catalog #913** changes the property-group delete permission | — | §5.2 REPAIR rows |

### 2.4 Out of Scope

- **`[Agentic QA]` / this repo's tooling (5):** VCST-6345 (env isolation T1), 6348 (T4), 6350 (T6, per-ticket stands), 5675 (`/qa-report`), 6534 (PIXEL visual regression; its 15 new rows in suite 048c are test assets, not product).
- **`[MF]` dev tooling (1):** VCST-6322 (`mf-new-plugin` skill, ai-tools).
- **CI / release workflow (1):** VCST-6526 (`@vc-frontend/core` alpha pre-releases, workflows and docs only, "nothing to test").
- **Spike (1):** VCST-6414 (Site Builder on Admin Shell + `vc-frontend-next`: an ADR and a demo on a local stand, nothing shipped). **D2** in §5.3.
- **Demo data (1):** VCST-6110 (Virto Start electronics catalog and personas, `virtostart` only). **D2.**
- **Hosting config (1):** VCST-6316 (Virto Start 400 after Entra sign-in, an nginx header-buffer change on Virto Cloud, no product code).
- **Merge-release task (1):** VCST-6398 (2.60.0 → `vc-frontend-next`). The redesign theme is not what `FRONT_URL` serves. Its three spawned bugs are in §2.2.
- **`vc-shell` framework and Marketplace (context only):**
  - vc-shell #387 (RTL for ar/he/fa/ur), #389, and #390/#391 (feature branches) have no Done ticket.
  - vendor-portal #253 moves to `@vc-shell` 2.7.0.
  - vc-shell #386 **is** in scope through VCST-6327.
- **Ready for test, not Done, partly merged:** VCST-6121 (passkeys; vc-frontend #2601 is merged but **not on `vcst`**, and platform #3144 / passkeys #1 are under test), VCST-6251 (xAPI scope terms), VCST-6274 (`!important` removal, on a feature branch). VCST-5888 (punchout OrderRequest) is **Reopen**; punchout #5 went to `dev-temp`, and suite 113 already exists.
- **In progress, merged:** VCST-6507 (payment #80, a stored-credential contract, backend only, no UI).

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Authentication — MFA & OTP fallback** | 5 | 5 | **25** | Critical | **Four tickets, one front door.** The changes: a new MFA module, two-factor extension points in the platform (#3133), the OTP grant skipping the second factor (otp #3), the organization fallback for every credential grant (customer #321), and a new storefront code step (#2570) that **rebuilds the OTP form** it shares. With MFA on, a correct password no longer yields a token. The failure that hides is the **wrong refusal**: an OTP-only buyer, a VC-Shell app (6533), an impersonating rep (082), or a suite's login helper. Every such failure reads as "login broken" in a regression run and gets called flake. 6132's fallback has a second hidden direction: signing in to an organization the user should no longer reach |
| **Sales Rep hub** | 5 | 4 | **20** | Critical | **The built-in hub was deleted from the theme this morning** (#2607, 240 files, no QA: "covered by regression"). The hub now exists only if the host serves the SalesRep plugin. It renders nothing rather than an error if the host does not. The same window adds GA4-backed insights and search activity (5337/5731; GA module optional, Workload Identity required) and scheduled calls with a mandatory time (6314; SalesRep now starts without Task Management). Four concurrent changes to one surface, the biggest of them untested |
| **Search & catalog indexing** | 4 | 5 | **20** | Critical | **Four changes to the search pipeline in one window, in four modules.** Catalog no longer expires the whole product cache per indexing batch (6167). The IndexationJob lock is surfaced and released (6429). Azure Search swapped its SDK and reverted `$select` (6425). The keyword parser now honours `'` and `&` (6477, outside the sprint). All four fail **silently**: a stale cached product, a skipped build, or a keyword that now filters where it used to return everything. Each returns 200 with plausible data. 6167's oracle is "product A stays cached when product B is reindexed", visible only across two reads, and QA could infer it only from response times |
| **Back office shell — Admin Shell & Classic theme** | 5 | 3 | **15** | High | **A second back office went live.** New `vc-module-admin-shell`, vc-shell #386, platform #3137, and **51 per-module admin-UI PRs merged on 2026-10-27**. The QA history is FAIL, then PASS WITH OPEN ISSUES, and VCST-6545…6563 are still open. The Classic AngularJS theme was reworked at the same time (6260: responsive, global search, Settings v2). Several `vcst` module versions predate their Admin Shell UI release (e.g. Quote 3.1005.0 vs the 3.1006.0 wave), so the host shows a mix of native and framed screens. MFA sign-in into the shell (6533/6567) has **no QA** |
| **GraphQL xAPI core** | 3 | 5 | **15** | High | **6479 removes AutoMapper from the module every storefront query passes through**, with no QA recorded. A mapping regression drops a field or returns a default value with no error, on any query: latent blast radius (**C4**). In the same window, **6536** (outside the sprint) closes a **cross-customer order read** via an OR keyword. That is an authorization fix on the P0 orders path whose own regression direction is over-refusal: a buyer's own keyword search returns too little |
| **Storefront UI kit, a11y & i18n** | 3 | 5 | **15** | High | 5991 makes `max={0}` a real ceiling on the quantity stepper. That control is on cart and PDP add-to-cart, the revenue path, and the change was QA'd only on a local container. 6501 (language switch → 404) and 6452 (raw keys after a hard load) were verified on PR builds against `vcst`. 6454 (radio names, WCAG 4.1.2) is the same. 5903/5906 add components no screen uses yet: Storybook-only, low |
| **Customer profile & contacts** | 3 | 4 | **12** | High | 5690 changes **the error contract of six xProfile mutations** (field-level errors instead of `VALIDATION`). Any client or suite keyed to the old shape breaks, and the storefront now shows the error on the field instead of a toast. 6181 fixes the Link-account blade filters with **no QA recorded** |
| **Punchout (cXML)** | 3 | 4 | **12** | High | The cart goes back to the procurement system as a `PunchOutOrderMessage` (punchout #2, renamed services). The module is **not installed on `vcst`**, so the backend is `NOT_DEPLOYED` here and is tested on `vcptcore-qa1`. The storefront half **is** on `vcst`. There, the regression question is the inverse: a non-punchout buyer must still see **Place order** |
| **Page Builder** | 5 | 2 | **10** | High | Four changes in one module. 6443 is a **contract tightening**: a permalink with whitespace or `? # &` is now refused with 400. Existing pages with such permalinks, and any seeder that writes one, are the regression direction; legacy migration was not tested. Plus the picker multi-select and folders with the storefront Image carousel (5443), the folder search reset (6381), and the toasts (4973) |
| **Pricing API validation** | 2 | 5 | **10** | High | One fix on a P0 data path: server-side refusal of zero and negative list prices. The regression direction is a **legitimate price write refused**, e.g. a sale price on its own, or a price list update that carries an unchanged zero. CSV price import still accepts 0, and that inconsistency is a known open edge |
| **Platform admin — settings, sign-in log, module loading** | 3 | 3 | 9 | Medium | Dictionary-setting save (6148, self-heal), Sign-in log time zone (6310), trend badges (6311), and ARM64 module loading (6480, x64 smoke only) |
| **Storefront analytics (GA4)** | 3 | 2 | 6 | Medium | Two `dataLayer` contract fixes (6453, 6478). The oracle is event payloads, suite 043. Verified only on PR builds against `vcst` |
| **Image Tools** | 2 | 2 | 4 | Low | 6500: the counts are now real. Already verified on `vcst` (069 IMGTL-026) |
| *Agentic QA tooling · CI · spike · demo · hosting · `vc-frontend-next` · `vc-shell` RTL / vendor portal* | — | — | — | *Out of scope* | §2.4. Not scored; not gaps |

**Three Critical domains, all of them silent.** 26-20's Criticals were authorization fixes, where the
right caller had to be admitted and the wrong one refused. This sprint's Criticals fail by
**absence**: a sign-in that never completes, a hub that never renders, a search result that is stale
or newly empty. None of them throws an error a regression run is built to notice. So every Critical
case below asserts **presence**: the token, the plugin route, the fresh value. "No error" is not a
pass.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA / Shell | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-------------------|------|--------------|------|-----------|
| Auth — MFA & OTP | ✅ **primary** (password → code step, resend, wrong code, OTP sign-in, org fallback) | ✅ **primary** (back-office MFA, VC-Shell / Admin Shell code step) | ✅ **primary** (`/connect/token`: `two_factor_required`, `invalid_code`, `amr=mfa`; OTP request) | ✅ (`me`, organization context after fallback) | ✅ (code input labels, focus) | — |
| Sales Rep hub | ✅ **primary** (plugin-delivered hub, insights, search activity, Schedule call) | ✅ (rep management, Task Management off) | — | ✅ (`/graphql/sales-rep`: activity, tasks) | — | ✅ (GA4 read path, optional module) |
| Search & catalog indexing | ✅ (search results for `'` / `&` keywords; PDP after a product edit) | ✅ **primary** (Indexing blade, lock notification) | ✅ **primary** (index build, product update → read) | ✅ (`products`, `productPickupLocations` keyword) | — | — |
| Back office shell | — | ✅ **primary** (Admin Shell host, menu, framed screens, Classic theme, global search) | ✅ (Settings v2 400 / 204) | — | ✅ (phone drawer, keyboard) | — |
| GraphQL xAPI core | ✅ (order list keyword search) | — | — | ✅ **primary** (field parity across operations; `orders` / `organizationOrders` OR-keyword scope) | — | — |
| UI kit, a11y & i18n | ✅ **primary** | — | — | — | ✅ **primary** (radio names, stepper ARIA) | — |
| Customer profile & contacts | ✅ **primary** (field errors on profile / address) | ✅ (Link account blade) | — | ✅ **primary** (6 mutations' error shape) | ✅ (error association with field) | — |
| Punchout | ✅ (Create requisition vs Place order) | ✅ (Punchout user widget) | ✅ **primary** (`/api/punchout/cxml`, return endpoint) | — | — | — |
| Page Builder | ✅ (Image carousel, published permalinks) | ✅ **primary** (Designer picker, Asset Library, toasts) | ✅ **primary** (permalink 400) | — | — | — |
| Pricing API | — | ✅ (Admin price entry) | ✅ **primary** (`PUT` prices: 0 / negative / positive) | ✅ (storefront price unaffected) | — | — |
| Platform admin | — | ✅ **primary** | ✅ (dictionary items) | — | — | — |
| Storefront analytics | ✅ | — | — | — | — | ✅ **primary** (`dataLayer`) |
| Image Tools | ✅ (thumbnails render) | ✅ **primary** | — | — | — | — |

### 4.2 Testing Approach by Priority

**Step zero for every storefront verdict: read the theme version.** `vcst` serves
`2.61.0-alpha.2605` (`dev` @ `d4edbe94`). A later push changes the build under the run, and `dev` CI is
red (banner). For backend tickets, the module versions in §11 were read on 2026-10-28 08:40 UTC; re-read
them if a test day starts after a deploy.

1. **Auth — MFA & OTP (25): both directions, on every entry point.**
   - **Admitted:** MFA off → password only. MFA on → password → code → token with `amr=mfa`. OTP-only buyer → `otp_email` grant still signs in (otp #3). Impersonation (082) and a VC-Shell app (6533/6567) still reach a session.
   - **Refused:** wrong code, expired ticket, attempt cap, resend throttled.
   - **6132 fallback:** a user whose last-used organization is blocked lands in **another accessible** organization, never in the blocked one and never on an error. Run it on **password, `otp_email` and mfa**; QA ran only `otp_email`.
   - **Turning MFA on is environment-wide** (`MultiFactorAuthentication.Enabled`). The MFA suites therefore run **serialised**, in their own window, with the setting restored in Cleanup. Never run them parallel to any other suite that signs in (§7.1 gate 3).
2. **Sales Rep hub (20): presence first.** Before any functional case:
   - The hub route renders its content, not an empty shell or a 404.
   - The plugin's remote entry loads with 200 from `/modules/...`.
   - The theme setting `sales_rep_builtin_enabled` no longer exists.

   Then run 093b (plugin delivery), 089–091/097/106/112, and the insights cases. Run them twice: once with the GA module answering, and once with GA disabled or without diagnostics permission, so the "optional" claim is tested. Then Schedule call: the time is mandatory, the default is 9:00, an unserved customer is refused, and SalesRep is still up with Task Management off (6399).
3. **Search & indexing (20): two reads, never one.**
   - **6167:** read product A, then update and reindex product B, then read A again. A is still served from cache. The oracle is a second read of A, plus a check that A's response does not carry B's change; response time is supporting evidence only.
   - **6429:** start two builds back to back. The second is refused with a visible lock message, the first completes, and the lock is released afterwards: a third build starts.
   - **6477:** for keywords `O'Neil` / `A&B`, the result set is a **subset**, not everything, on products, pickup locations and orders.
   - **6425** runs only where Azure Search is the provider. Record it `BLOCKED (provider)` on `vcst` if it is not.
4. **Back office shell (15): the menu is the contract.** Every Classic menu item reachable from Admin
   Shell lands on a working screen, native or framed: no blank frame and no 403 for an admin. The
   frame-options header (`SameOrigin`) is present. Sign-in with MFA on reaches the code step (6533/6567,
   **first QA**). The 6260 cases (020b) re-run on the release build, Platform 3.1090.0.
5. **GraphQL xAPI core (15): field parity, then scope.**
   - **6479:** for the operations the storefront uses most (cart, product, order, profile, wishlist), compare a response from the 3.1028.0 build against a recorded baseline: same fields, no new nulls, no defaulted values. This is the **§5.3 C4 charter**; a field-by-field oracle has no single value to assert.
   - **6536:** a **divergent pair**. Buyer A's OR-keyword search never returns buyer B's order, and buyer A's own keyword search still returns A's matching orders.
6. **High (12–15): UI kit / i18n, profile, punchout, Page Builder, pricing.**
   - **UI kit / i18n:** run the agent-found fixes (6452, 6453, 6454, 6478, 6501) **on the deployed build** for the first time; each was verified only on a PR build against the `vcst` API. 5991: stepper at max 0 / max 1 / no max, on PDP and cart.
   - **Profile:** 5690's error shape on all six mutations, with field and code.
   - **Punchout:** on `vcptcore-qa1`; on `vcst`, "Place order" for a normal buyer only.
   - **Page Builder:** 6443 rejects `space ? # &` and invisible characters with 400, and an **existing** page with such a permalink still opens (`seed:pb-legacy-permalinks`).
   - **Pricing:** 6309 refuses 0 and −10, accepts a positive price, and leaves a sale price on an existing list price unaffected.
7. **Medium / Low:** run the affected suites only; no exploratory time.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Auth — MFA & OTP | **Decision Table** (grant type × MFA setting × store mode × account state → outcome) + **State Transition** (password → ticket → code → token; ticket expiry; attempt cap) + **Divergent pair** (blocked vs accessible last-used organization) | A sign-in is a state machine with a policy table on top; the wrong refusal hides in one table cell |
| Sales Rep hub | **Presence assertion** (plugin entry 200, route renders) + **FLOW** (customer page → Schedule call → task list) + **EP** (GA module on / off / no permission) | A removal fails by absence; the GA dependency is declared optional, and only the "off" partition proves it |
| Search & catalog indexing | **State Transition** (cached → B updated → A read) + **Concurrency** (two builds) + **EP / BVA** on keyword characters (`'`, `&`, leading/trailing, alone) | Cache and lock defects need a sequence; parser defects sit on character classes |
| Back office shell | **Coverage sweep** (every menu item × native/framed) + **BVA** on width (767/768) | 51 module UIs changed at once; only a sweep visits them all |
| GraphQL xAPI core | **Differential** (field parity against a baseline) + **Divergent pair** (buyer A vs B) | A mapping refactor's oracle is the previous output; a scope fix needs the caller who must be refused |
| UI kit, a11y & i18n | WCAG 2.2 AA checklist + **BVA** (max 0 / 1 / none) + **State Transition** (language A → B → A) | 6501 only fails on the second switch |
| Customer profile | **EP** over invalid characters (digit, `_`, `@`) × six mutations | One rule, six entry points |
| Punchout | **Decision Table** (session type × Punchout.Enabled × return count) | "Second return refused" and "replay with the flag off refused" are table rows |
| Page Builder | **EP** over permalink characters + **Error Guessing** (pre-existing permalink) | A tightened validator's regression is the data that was valid yesterday |
| Pricing API | **BVA** (−0.01, 0, 0.01) + **EP** (list vs sale) | A sign check at a boundary |
| Platform admin, GA4, Image Tools | Error Guessing + EP; event-payload assertions for GA4 | Single-defect guards |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> 85 suites activated (34 Frontend, 51 Backend), all present in `config/test-suites.json`; classified by the directory the CSV lives in. Suites 107/108/109/113 (Punchout) are activated but the module is not installed on vcst: they run on vcptcore-qa1 (Punchout pr-6) and report `NOT_DEPLOYED` on vcst, never FAIL. The storefront half of VCST-5887 (a non-punchout buyer still sees Place order, BL-PUNCHOUT-008) is runnable on vcst through 011/013 and `PNCR-016` (109). Outside-sprint but merged and deployed: VCST-6536 (x-order, suites 050c + 014), VCST-6477 (search keyword parser, suites 004/005/037/050k); VCST-6340 (suite 095) is merged but **not** deployed on vcst (Quote 3.1005.0 predates #167). VCST-6121 (passkeys, theme alpha.2605 excludes #2601) has no suite and is not activated.

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite | Name | Module | Sprint trigger | Priority |
|---|---|---|---|---|
| 001 | Catalog Navigation | catalog | VCST-6453 (category infinite scroll) | P1 |
| 002 | Product Detail | catalog | VCST-5991, VCST-6501 (PDP stepper; language switch on a single-language SEO URL) | P1 |
| 004 | Search Core | search | VCST-6453, VCST-6477 (search infinite scroll; keyword apostrophe/ampersand) | P1 |
| 005 | Search Filters & Advanced | search | VCST-6477 (Search - Special Characters) | P1 |
| 006 | B2B Organization | b2b | VCST-6132 (org fallback), VCST-5690 (Company info address; REPAIR GAP-03) | P1 |
| 008 | B2B Members | b2b | VCST-5904 (OTP switch-to-password link used in member flows) | P1 |
| 010 | B2B Bulk Ship Dashboard | b2b | VCST-5690 (Ship To address forms, header Add new dialog) | P1 |
| 011 | Checkout Flow | checkout | VCST-5887 (a non-punchout buyer must still see Place order, BL-PUNCHOUT-008), VCST-5690 | P1 |
| 013 | Checkout B2B | checkout | VCST-5887 (B2B checkout Place order) | P1 |
| 014 | Orders Frontend — History, Detail, Status & Reorder | orders | VCST-6536 (ORD-104 OR keyword in the order search box) | P1 |
| 015 | Quotes | orders | VCST-6452 (quotes i18n after hard load) | P1 |
| 028 | Cart Core | cart | VCST-5991 (VcQuantityStepper max, cart) | P1 |
| 031 | Auth Login & Register | auth | VCST-5904, VCST-6132 (storefront sign-in form shared with the OTP/MFA code step) | P1 |
| 032 | Auth Session & RBAC | auth | VCST-5904 (token refresh / session after MFA) | P1 |
| 037 | BOPIS Cart | bopis | VCST-6477 (BOPIS-063 apostrophe + ampersand pickup search) | P1 |
| 042 | Smoke Tests | smoke | VCST-5690 (SMK-025 profile save), sprint smoke | P0 |
| 043 | Google Analytics | cross-cutting | VCST-6453, VCST-6478 (GA4 view_item_list, select_item, view_item, add_to_wishlist) | P2 |
| 044 | Security Tests | cross-cutting | VCST-5690 (SEC-VALIDATION-001/002 stubs, REPAIR GAP-05) | P0 |
| 045 | Accessibility Tests | cross-cutting | VCST-6454, VCST-5991 (accessible names, ARIA) | P2 |
| 046 | Localization Tests | cross-cutting | VCST-6452, VCST-6501 (i18n, language switch) | P2 |
| 072 | Configurable Products UI — Sections, Cart & Checkout | configurable-products | VCST-6454 (configurable PDP radios) | P1 |
| 082 | Auth Impersonation / Login on Behalf | auth | VCST-5904 (MFA + login on behalf, BL-AUTH-009/010/011) | P1 |
| 089 | Sales Rep — My Customers (storefront UI/E2E) | sales-rep | VCST-5337, VCST-6532 (hub from plugin; 40 provenance rows to re-point, GAP-02) | P1 |
| 090 | Sales Rep — My Sales Reps (storefront, buyer-facing) | sales-rep | VCST-6532 (Sales reps link served by the plugin) | P1 |
| 091 | Sales Rep — Customer Profile (storefront) | sales-rep | VCST-5337, VCST-6314 (SR-CP-023 REPAIR GAP-01) | P1 |
| 093 | Sales Rep — Hub Dashboard (storefront) | sales-rep | VCST-5337, VCST-6532 (dashboard on the plugin-delivered hub) | P1 |
| 093b | Sales Rep — Hub Plugin Delivery (Module Federation, storefront) | sales-rep | VCST-6532, VCST-5337 (Module Federation delivery; REPAIR GAP-02) | P1 |
| 097 | Sales Rep — Customer Orders (storefront) | sales-rep | VCST-6532 (customer orders route served by the plugin) | P1 |
| 104 | Auth OTP Sign-In | auth | VCST-5904, VCST-6132 (OTP; #2570 form refactor) | P1 |
| 106 | Sales Rep — Tasks (storefront) | sales-rep | VCST-6314 (Schedule call creates a Call task, VCST-6399) | P1 |
| 107 | Punchout — storefront session (start link to signed-in buyer) | punchout | VCST-5887 (storefront half). Run on vcptcore-qa1 (Punchout pr-6) - NOT_DEPLOYED on vcst | P1 |
| 109 | Punchout — Create requisition (PunchOutOrderMessage) | punchout | VCST-5887 (Create requisition). Run on vcptcore-qa1 (Punchout pr-6) - NOT_DEPLOYED on vcst (PNCR-016 is runnable on vcst) | P1 |
| 111 | Auth MFA Sign-In (storefront) | auth | VCST-5904 (storefront MFA code step) | P1 |
| 112 | Sales Rep — Customer Activity & Insights (storefront) | sales-rep | VCST-5337, VCST-5731 (activity and insights) | P1 |
#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite | Name | Module | Sprint trigger | Priority |
|---|---|---|---|---|
| 017 | Orders Admin Management | orders | VCST-6148 (Order.Status translations in Orders admin) | P1 |
| 020 | Platform Users Roles & Settings | platform | VCST-6148 (Order.Status dictionary), VCST-6260, VCST-6309 (PLAT-080, REPAIR GAP-04) | P1 |
| 020b | Platform Admin Shell — Classic theme (menu, search, Settings v2 save, responsive) | platform | VCST-6260, VCST-6327 (Classic theme: responsive, collapse menu, Ctrl/Cmd+K) | P1 |
| 026 | Customer Contacts | customer | VCST-6181 (Contacts, Accounts widget, Link blade) | P1 |
| 049 | Platform API | api | VCST-5904 (Back office password sign-in answers requiresTwoFactor, platform#3133), VCST-6148 (localizable settings REST), REST response-type changes (dynamic-associations#58, audit-log#24) | P0 |
| 050a | GraphQL xCatalog | graphql | VCST-6479 (AutoMapper removal, x-api#93) | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | graphql | VCST-6479 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | graphql | VCST-6479 | P1 |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | graphql | VCST-6479 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | graphql | VCST-6479 | P1 |
| 050b5 | GraphQL xCart — Per-RuleSet Validation & Line-Item Validity | graphql | VCST-6479 | P1 |
| 050c | GraphQL xOrder | graphql | VCST-6479, VCST-6536 (ORD-GQL-015/016: an OR keyword cannot cross customer scope) | P1 |
| 050d | GraphQL xProfile | graphql | VCST-6479, VCST-5690 (field-level errors; GAP-10) | P1 |
| 050e | GraphQL xFrontend (pageContext) | graphql | VCST-6479 | P1 |
| 050f | GraphQL xCMS | graphql | VCST-6479 (GAP-23) | P1 |
| 050g | GraphQL Cross-Cutting | graphql | VCST-6479 | P1 |
| 050h | GraphQL Wishlist | graphql | VCST-6479 (GAP-23) | P1 |
| 050i | GraphQL Configurable Products | graphql | VCST-6479 | P1 |
| 050j | GraphQL xMarketing (promotionCoupons) | graphql | VCST-6479 (GAP-23) | P1 |
| 050k | GraphQL xPickup | graphql | VCST-6479, VCST-6477 (PCK-GQL-129 keyword) | P1 |
| 050l | GraphQL xAPI — Push Messages | graphql | VCST-6479 | P2 |
| 050m | GraphQL xAPI — Sales Rep (scoped /graphql/sales-rep) | graphql | VCST-5337, VCST-6314 (scoped /graphql/sales-rep) | P1 |
| 050m2 | GraphQL xAPI — Sales Rep, procedural (multi-tool: shell + query) | graphql | VCST-6314 | P1 |
| 050m3 | GraphQL xAPI — Sales Rep Customer Activity & Insights (scoped /graphql/sales-rep) | graphql | VCST-5337, VCST-5731 (activity operations) | P1 |
| 050n | GraphQL Store Asset URL | graphql | VCST-6479 | P1 |
| 050o | GraphQL xAPI — Returns (buyer's own returns + decided-return read surface, steps 1-2) | graphql | VCST-6479 (GAP-23) | P1 |
| 051 | Catalog Admin Products | catalog | VCST-6167 (product cache vs reindex), VCST-6327 (catalog#913 admin UI, property-group delete permission) | P1 |
| 054 | Pricing Logic | pricing | VCST-6309 (pricing logic around list price) | P1 |
| 055 | Pricing Management | pricing | VCST-6309 (price write validation) | P1 |
| 059 | Page Builder | page-builder | VCST-4973 (success toasts), VCST-6443 | P1 |
| 059b | Page Builder — Permalink validation | page-builder | VCST-6443 (permalink validation) | P1 |
| 060 | Page Builder — Designer, Content & Storefront | page-builder | VCST-5443 (storefront Image carousel) | P1 |
| 060b | Page Builder — Field Types, Scheduling & Operations | page-builder | VCST-5443, VCST-6381 (Designer picker) | P1 |
| 060c | Page Builder — Asset Library (picker, pagination, references) | page-builder | VCST-5443, VCST-6381 (Asset Library picker, folders) | P1 |
| 061 | Search Indexing Admin | search | VCST-6167, VCST-6425, VCST-6429 (index build, provider) | P1 |
| 061b | Search Indexation Jobs | search | VCST-6429 (IndexationJob lock) | P1 |
| 063 | Core Settings | platform | VCST-6148 (settings blade save) | P2 |
| 064 | CSV Import Export | import-export | VCST-6309 (CSV price import still accepts list = 0, not covered) | P1 |
| 069 | Image Tools | image-tools | VCST-6500 (IMGTL-026 real counts) | P2 |
| 078 | Backend Smoke — Platform, API & GraphQL | smoke | VCST-6327, VCST-6480 (platform smoke; module load) | P0 |
| 078b | Backend Smoke — Catalog, Search & Pricing Admin | smoke | VCST-6327, VCST-6167, VCST-6309 (catalog, search and pricing admin smoke on Admin Shell) | P0 |
| 078c | Backend Smoke — Orders, Customers & Marketing Admin | smoke | VCST-6327 (orders, customers, marketing admin smoke) | P0 |
| 078d | Backend Smoke — Content & Admin Workflows | smoke | VCST-6327 (content and admin workflows smoke) | P0 |
| 092 | Sales Rep — Admin / VC-Shell App (rep management) | sales-rep | VCST-6327, VCST-6314 (Sales Rep admin VC-Shell app) | P1 |
| 092b | Sales Rep — Admin Embedded App (back-office) | sales-rep | VCST-6327, VCST-5337 (embedded admin app; sales-rep:diagnostics) | P1 |
| 095 | Background Jobs — Hangfire Migration | background-jobs | VCST-6340 (outside sprint; Quote 3.1005.0 on vcst predates #167, run after the bump) | P1 |
| 101 | Platform — Sign-in Log | platform | VCST-5904, VCST-6310, VCST-6311 (MFA log rows, time zone, trend badges) | P1 |
| 105 | OTP Sign-In API | api | VCST-5904, VCST-6132 (otp_email grant, org fallback) | P1 |
| 108 | Punchout — cXML setup, token exchange and Admin user mapping | punchout | VCST-5887 (setup / token / mapping). Run on vcptcore-qa1 (Punchout pr-6) - NOT_DEPLOYED on vcst | P1 |
| 110 | MFA Sign-In API and Backoffice | api | VCST-5904, VCST-6533, VCST-6567 (MFA API + Backoffice) | P1 |
| 113 | Punchout — cXML OrderRequest to customer order | punchout | VCST-5887, VCST-5888 (OrderRequest; VCST-5888 is outside the sprint). Run on vcptcore-qa1 (Punchout pr-6) - NOT_DEPLOYED on vcst | P1 |

---

### 5.2 Coverage Gaps — New Test Cases Needed

REPAIR rows are edits to existing cases and are marked as such; no CSV was touched. Suite id **114** is proposed because 110 already exists on `main` as the MFA API suite (VCST-5904, 32 rows) and is not the Admin Shell suite the VCST-6327 Jira comment calls "suite 110 (37 cases, Draft)"; highest existing id is 113, so 114 is free (`npm run tc:alloc` to reserve it).

| GAP-NN | Ticket | Description | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-01 | VCST-6314 | **REPAIR.** `SR-CP-023` (091, Reviewed) asserts the "Schedule a call" tile renders disabled and a click opens no modal. Spec now: it opens the task popup (task Call, customer prefilled, due date empty, time mandatory default 9:00 AM, default priority). Keep the Order on behalf / Create quote disabled assertions, re-state the Schedule call part from the AC (do not invert to the build) | 091 | test-management-specialist (single author) |
| GAP-02 | VCST-6532 | **REPAIR.** The built-in hub and `sales_rep_builtin_enabled` are gone from the theme (#2607, already on vcst alpha.2605). (a) `SR-HD-100` (093b) Preconditions name the theme settings "module_federation_enabled=true, sales_rep_builtin_enabled=false": drop the removed setting, keep the plugin precondition. (b) `B2C-LIST-060` (007, Reviewed) Preconditions cite `client-app/modules/sales-rep/locales/*.json`, a path that no longer exists in the theme: re-locate where the share-dialog strings are served from now before re-running. (c) 40 rows in 089 and 11 rows in 091 carry `Source: vc-frontend/client-app/modules/sales-rep/...` provenance in References: citation-only, re-point on next touch, no behaviour change | 093b, 007, 089, 091 | test-management-specialist |
| GAP-03 | VCST-5690 | **REPAIR.** `B2C-ORG-039` (006) asserts "Generic error toast: 'Something went wrong. Please try again later.' — not field-specific" for Company info > Add address. On the fixed build `/account/profile` and the `/account/addresses` dialog flag the offending input inline and the header Ship-to Add new dialog shows only the toast "Some of the addresses are not valid" (KB-E0D6EA2B). The Company info dialog was not observed: re-observe it on vcst first, then re-point the expectation to the observed spec; do not invert on a guess | 006 | qa-frontend-expert (observe) + test-management-specialist (edit) |
| GAP-04 | VCST-6309 | **REPAIR.** `PLAT-080` (020, Critical, Draft) is UI-only and says "Zero price behavior follows configured policy (allowed or blocked)": an oracle that passes either way. Spec: the server rejects zero and negative list prices. Tighten to the spec; the REST half is GAP-11 | 020 | test-management-specialist |
| GAP-05 | VCST-5690 | **REPAIR.** `SEC-VALIDATION-001` (name validation, NameValidationPattern) and `SEC-VALIDATION-002` (script injection) in 044 are Critical stubs: Preconditions only, Steps / Assertions / Automation_Status empty, so they certify nothing. Complete them against GAP-10 (name field rejected, inline on the input, nothing saved) or cut them | 044 | test-management-specialist |
| GAP-06 | VCST-6327 | **No host suite exists** (only 020b, the Classic theme). Admin Shell host at `{BACK_URL}/apps/admin-shell/`: module UIs as Module Federation remotes, unported AngularJS screens embedded in a frame (iframe fallback), one server-built permission-filtered menu replacing the AngularJS menu and app switcher, deep link and refresh, sign-out and session across native and framed screens, mixed screens when a vcst module predates its admin-shell UI release (51 module admin PRs merged 2026-10-27), host-level console / network sanity. One host smoke walk across the module screens, not 51 module suites. BL: none for this domain (finding, see 6c). Open QA issues VCST-6545..6563 are the regression oracle seeds | **114 (new, none today)**, 020b, 078d | qa-backend-expert |
| GAP-07 | VCST-6533 / VCST-6567 | MFA by email in the Admin Shell sign-in: `two_factor_required` -> code step, correct code signs in, wrong / expired code shows an error with retry and resend, attempt limit, back to sign-in, wrong password unchanged, MFA off = password only, desktop + phone, EN/AR. Backoffice (Classic) MFA is covered by 110 (MFA-001..032) and its log rows by 101; the VC-Shell client is not. Passkey sign-in is out of scope (VCST-6121 not deployed) | **114 (new)**, 110, 101, 111 | qa-backend-expert |
| GAP-08 | VCST-6314 | Schedule call (hub customer page -> task popup): defaults (task Call, customer prefilled, due date empty, time mandatory 9:00 AM, priority Normal because the platform has no Medium), required-time boundary, optional Google / Apple Calendar copy, unserved customer refused (the operation's refusal shape from `/qa-api ref sales-rep`), Sales Rep module starts without the Task Management module (VCST-6399). Tasks suite 106 has 29 cases and none for Schedule call | 106, 091, 050m2 | qa-frontend-expert |
| GAP-09 | VCST-5337 | Customer insights prerequisites: `sales-rep:diagnostics` must be granted by hand on upgraded installs (rep without it: activity degrades, no error page); Google Ecommerce Analytics module absent: hub still works. `SR-ACT-014` covers GA unavailable, not the module-not-installed or the missing permission | 112, 092b, 050m3 | qa-backend-expert |
| GAP-10 | VCST-5690 | Field-level validation errors. GraphQL: `updateContact`, `updateMemberAddresses`, `updatePersonalData` return one error per failed rule with `extensions.field` (e.g. `lastName`, `addresses[0].firstName`) and `extensions.errorCode` (`InvalidCharacters`, `NotEmptyValidator`, `MaximumLengthValidator`, `HtmlTagsNotAllowed`, `InvalidEmail`), `data.<op>` null, nothing saved, `me` / `contact(id)` keep the saved name (KB-CC283A85). Today `PRF-GQL-031/032/033/038` only assert `errors[]` non-empty. The ticket says six mutations: name the other three from introspection. Storefront: inline error under the input on `/account/profile` and the `/account/addresses` dialog, Update disabled while a server error shows, editing a flagged input clears only its own error; the header Ship-to Add new dialog toast-only | 050d, 010, 042, 044 | qa-backend-expert (API), qa-frontend-expert (UI) |
| GAP-11 | VCST-6309 | `PUT /api/products/prices` and `PUT /api/products/{id}/prices` reject zero and negative list prices with 400 (not a 5xx), a valid positive price still saves, a mixed valid+invalid body writes nothing, sale price unchanged. Record (do not require) that CSV price import still accepts list = 0. No case in 054/055/049 | 055, 049, 064 | qa-backend-expert |
| GAP-12 | VCST-6310 / VCST-6311 | Sign-in log: grid dates in the operator's profile time zone, consistent with the record card and Users > Last login date; trend badges show an absolute delta (e.g. +4) when the previous period is near zero, not a huge percentage. 101 has SIL-037/038 (order, date range) and SIL-041 (statistics) but nothing on time zone or the badge arithmetic. Note the Top accounts entry "undefined" is probably not a defect (ticket) | 101 | qa-backend-expert |
| GAP-13 | VCST-6148 | Saving Order.Status localizable dictionary translations (`POST /api/platform/localizable-settings/Order.Status/dictionary-items`) returns 204 not 500; Save guarded against double click; an existing duplicate is removed on the next save (self-heal); case-only duplicates are unit-test-only today. No case in 017 / 020 / 063 / 049 | 049, 020, 063 | qa-backend-expert |
| GAP-14 | VCST-6181 | Admin > Contacts > Accounts widget > Link: keyword search and the six filters (Locked only, Email not verified, Account type, Status, Role, Last login) filter as on Security > Users, dropdowns populated, Clear filters works. No QA comment exists, so explore before authoring. No case in 026/027 | 026 | qa-backend-expert |
| GAP-15 | VCST-6453 / VCST-6478 | GA4: on infinite scroll each page's `view_item_list` carries only the products that page added, with the correct index (category and search); `select_item`, `view_item`, `add_to_wishlist` carry `currency`; `select_item` index and list id/name match the `view_item_list`; saved-for-later, cart line clicks and compare report their own list and position. `GA-002` asserts `items_count` equals every card in the grid, true for page 1 only. Oracle: `window.dataLayer`, BL-GA4-001/002 | 043, 001, 004 | qa-frontend-expert |
| GAP-16 | VCST-5991 | `VcQuantityStepper` `max=0`: stepping helpers and DOM/ARIA agree (no announced ceiling of 0, no overflow when stepping above it) on the cart and PDP add-to-cart. `CART-037` (Max Stock Enforcement, Manual) does not touch max = 0 | 028, 002, 045 | qa-frontend-expert |
| GAP-17 | VCST-6452 | After a hard load of `/account/quotes` and `/account/quotes/{id}`, table headers and tab titles are translated, not raw i18n keys (also under a non-English locale). 015 has 32 quote-flow cases, none for i18n after hard load | 015, 046 | qa-frontend-expert |
| GAP-18 | VCST-6454 | Configurable PDP Product-type option radios have an accessible name (product name, or None in the store language; WCAG 4.1.2 / 3.3.2); selection, keyboard use and add to cart unchanged. The ticket says "re-check on vcst-qa after merge and deploy": the deployed theme `2.61.0-alpha.2605` (`dev` @ `d4edbe94`) carries #2599 (merged 2026-10-26), so this is runnable on `vcst` | 072, 045 | qa-frontend-expert |
| GAP-19 | VCST-6501 | Switching language twice on a product whose SEO URL exists in one language only does not end on a 404. `L10N-ROUTE-001` covers slug-vs-locale collision, not this | 046, 002 | qa-frontend-expert |
| GAP-20 | VCST-6381 | Designer "Choose from" picker: opening a folder (list or breadcrumb) clears the search text. The shell half is `CMS-206` (AC9); the Designer picker `CMS-141` asserts folder navigation but not the cleared search | 060b, 060c | qa-backend-expert |
| GAP-21 | VCST-6167 / VCST-6425 | Index and cache seam. Event indexing of product B must not expire cached product A (multi-instance + Redis) and B must still read fresh after the event (stale-cache is the hidden regression direction, 200 with plausible data, BL-SRCH-003, BL-CROSS-002). Azure AI Search `SearchAsync` must not fail intermittently with 500 "Cannot skip tokens on partial JSON": an environment-gated case (`BLOCKED`, not FAIL, on any other provider), large payload that fills a read buffer; no QA comment recorded | 061, 051, 061b, 004 | qa-backend-expert |
| GAP-22 | VCST-6477 (outside sprint) | Search keyword with an apostrophe or ampersand now filters instead of being dropped (pickup locations and all keyword parsing; Search 3.1013.0 on vcst). `BOPIS-063` (037) is Manual; add automated cases for the product search box, the pickup search and the xAPI keyword; spec direction: result set narrows | 005, 037, 004, 050k | qa-frontend-expert |
| GAP-23 | VCST-6479 | AutoMapper removed from x-api, "no behaviour change intended", no QA comment. Full-field schema cases exist for xCatalog (`CAT-GQL-113`), xCart (`CRX-GQL-096/097`), xOrder (`ORD-GQL-013`) and xProfile (`PRF-GQL-046/047`); none for xCMS, wishlist, xMarketing, xPickup, returns. Mapping regressions drop fields silently with HTTP 200. Take the exact mapped type list from the PR file list before authoring | 050f, 050h, 050j, 050k, 050o | qa-backend-expert |

**REPAIR scan results.** (1) VCST-5904: the three removed `data-test-id`s `otp-email-code-input`, `otp-email-sign-in-button` and `otp-email-resend-button` have **zero hits** in `regression/suites/**`, `scripts/**` and `test-data/**` (the committed OTP suite 104 drives the code step by labels); `scripts/lib/sign-in-selectors.ts` holds only `otp-email-switch-to-password-link` and 111 asserts `otp-email-switch-to-otp-link`, neither of which was removed. Residual risk: the vc-frontend dev clone (c2beab2c, 2026-10-26) builds the code-step ids as `${idPrefix}-sign-in-button` / `-resend-button` from a shared form with `id-prefix` `otp-email` and `mfa`, so the rendered ids may be unchanged; look up the live DOM before authoring any selector. No REPAIR row, none needed. (2) VCST-6532: no suite names `sales_rep_builtin` except `SR-HD-100` (GAP-02). (3) VCST-5690: no case asserts the bare `VALIDATION` code itself (the `\bVALIDATION\b` hits in 044/050m/089 are headings or business-rule text); the 050d cases assert only `errors[]` non-empty and still hold. `B2C-ORG-039` (GAP-03) is the one case that asserts the old behaviour.

**Not gaps (read first, covered):** VCST-6260 (020b PLAT-106..127, 20 cases), VCST-5904 (110 / 111 / 104 / 105, 9 MFA cases still `Draft`: MFA-006/010/013/015/017/024/025/028/030), VCST-6132 (OTP-029..051 + MFASF-005), VCST-6443 (059b CMS-259..293, 35 cases), VCST-5443 + VCST-6381 shell half (060c CMS-220..244, CMS-206), VCST-4973 (059 CMS-005/006/127/128 assert the toast), VCST-6429 (061b SRCHJ-001..006), VCST-5337/5731 (112 SR-ACT-001..028 + 050m3 SR-ACTG-001..010, all `Draft`), VCST-5887/5888 (107/108/109/113), VCST-6500 (069 IMGTL-026), **VCST-6536** (050c `ORD-GQL-015` / `ORD-GQL-016` assert an OR clause never widens `orders` / `organizationOrders` beyond the caller's own scope, 014 `ORD-104` the storefront search box; BL-AUTH-006). Not testable here: VCST-6480 (ARM64 module copy; x64 stands, unit tests only), VCST-5903 / VCST-5906 (UI-kit components with no consumer, Storybook surface).

**Oracle finding (route to `/qa-review-oracles`, not written here).** There is no `BL-*` invariant for the second factor itself (BL-AUTH-015/016 cover only the org fallback that MFA reuses), and none for Admin Shell, Page Builder or Image Tools. Candidate invariants to propose: a second factor is required on every credential grant once `MultiFactorAuthentication.Enabled` (store mode overrides global); a code is single-use and capped at 3 wrong attempts; the ticket dies on password reset; the sign-in log carries one row per step.

---

### 5.3 Exploratory Charters (discovery — what the suites cannot assert)

> 5 charters × 30 min. Lane: any free browser slot (firefox included since 2026-09-08, `.claude/rules/agents.md`); the lanes below are chrome / edge. Run isolated from the regression pool (3 lanes total). EXP-02 opens operator settings windows (`MultiFactorAuthentication.Enabled`, store `StoreMode`) that challenge every sign-in on the stand: run it alone, never beside another sign-in suite.

| ID | Domain | Signals | Mission (discover X that suites Y don't cover) | Candidate scenarios | Technique | Owner |
|----|--------|---------|-----------------------------------------------|---------------------|-----------|-------|
| EXP-01 | Back office shell — Admin Shell & Classic theme | C1, C2 | Discover how the Admin Shell host behaves at the seams between native Module Federation screens, framed AngularJS screens and the server-built menu — a host with **no** suite (GAP-06) and 4 tickets / 51 module PRs in one window, which 020b (Classic only) and 078d cannot see | 1. A module whose vcst version predates its admin-shell UI: open it from the menu, deep link, refresh, Back — native or frame, same permission? 2. A restricted role: menu entries vs what a deep link to a hidden screen does; sign out inside a frame, then reload the host. 3. Session expiry while a framed screen is dirty: unsaved data, redirect target | Feature-pair matrix (host × native/framed × role) | qa-testing-expert (lane: playwright-edge) |
| EXP-02 | Authentication — MFA & OTP fallback | C2, C3 | Discover which client x grant x organization-state combinations refuse a legitimate sign-in or let one through once MFA is on, beyond 110/111/104/105 and the 2026-10-23 session: the new VC-Shell sign-in (GAP-07) is the uncharted client | 1. OTP-only customer and a password customer on a store whose `StoreMode` differs from global, signed in through storefront, Classic admin and Admin Shell. 2. MFA sign-in whose last-used organization is locked / removed (fallback after the code), then an explicit org switch. 3. Impersonation chain: operator with MFA starts login on behalf, a second tab signs out, Stop impersonation | Feature-pair matrix · Saboteur | qa-testing-expert (lane: playwright-chrome) |
| EXP-03 | Sales Rep hub | C2, C3 | Discover what a rep sees when the plugin-delivered hub, scheduled calls, activity from GA4 and the task module all change at once, across the surfaces 091 / 106 / 112 / 093b cover one at a time (GAP-01, 08, 09) | 1. Rep journey: dashboard -> customer -> Schedule call -> task in Tasks and calendar -> activity feed shows the customer's own search. 2. Rep of two organizations switching organization mid-journey; non-rep teammate on the same routes. 3. Module-federation fragility on a cold deep link: slow network, plugin chunk delayed, language switch | Soap opera (rep persona) | qa-testing-expert (lane: playwright-chrome) |
| EXP-04 | Search & catalog indexing | C2, C3 | Discover stale or wrong results across four search-pipeline changes in one window (product cache not expired per batch, IndexationJob lock, Azure SDK swap, keyword parser) that return 200 with plausible data: the seams of GAP-21 / GAP-22 across 061 / 061b / 051 / 004 | 1. Edit product B, reindex, read A and B from storefront, xAPI and admin: who is stale, how long. 2. Keywords with apostrophe, ampersand, `OR`, quotes in product search, pickup search and order search together with a reindex running. 3. Back-to-back Build / Delete and build while a storefront search is mid-pagination | Saboteur · Boundary-of-features | qa-testing-expert (lane: playwright-edge) |
| EXP-05 | GraphQL xAPI core | C4 | Discover fields silently dropped or nulled by the AutoMapper removal (x-api#93, no QA comment, every storefront query passes through the module) by walking storefront journeys with the Network tab against the 050* suites that carry no full-field case (GAP-23) | 1. Cart -> checkout -> order -> account profile on the storefront, comparing every GraphQL response against introspection for null on non-nullable-looking fields. 2. xCMS / pageContext / wishlist / pickup pages with a store, culture and currency not used by the suites. 3. The same query as anonymous, B2C and org buyer: do computed fields (price, availability, localized names) agree | Galumphing · Saboteur | qa-testing-expert (lane: playwright-edge, GraphiQL) |

**Not chartered (and why):** Storefront UI kit, a11y & i18n — D1 exact oracle (stepper ARIA, radio names, quotes keys, one language switch) → §6 cases (GAP-16..19); Customer profile & contacts — D1 exact error contract → §6 / GAP-10; Pricing API validation — C4 but D1 (one contract: 400 on list <= 0) → §6 / GAP-11; Punchout (cXML) — D3 already charted in the last 24 h (`reports/exploratory/SBTM-VCST-5888-2026-10-27.md`) and `NOT_DEPLOYED` on vcst, extend that report; Page Builder — C2 only, lowest rank at the cap, and 59b + 60c hold 83 cases for the exact oracles; Platform admin, Storefront analytics (GA4), Image Tools — no C signal (exact oracles → §6). Authentication MFA was last charted 2026-10-23 (`SBTM-VCST-5904-2026-10-23.md`, outside the 24 h window, so not D3): EXP-02 is scoped to ground that session did not cover.

---

## 6. New Test Cases Needed (Per Ticket)

Counts are NEW cases (REPAIR edits not counted). A `0` row names the suite that already covers it. Techniques: EP, BVA, ST (state transition), DT (decision table), EG (error guessing), PW (pairwise), CT (classification tree).

### 6.1 Stories

| Ticket | Layers | Case type | Suggested count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-6260 | Admin | Regression | 0 (020b PLAT-106..127 `Draft`, run and promote) | 020b | — |
| VCST-6327 | Admin (Admin Shell host), E2E | Functional + negative + permission | 14-18 | 114 (new) | CT (module × native/framed × role), ST, EG |
| VCST-5887 | Storefront, GraphQL | Regression | 0 (107 / 109 / 108 / 113, run on vcptcore-qa1; `PNCR-016` on vcst) | 107, 109, 108, 113 | — |
| VCST-5904 | REST, Admin, Storefront | Regression + negative | 0 (110 / 111 / 104 / 105 cover; run the 9 `Draft` MFA cases) | 110, 111 | — |
| VCST-5337 | GraphQL, Storefront | Edge | 2-3 (GAP-09) | 112, 092b, 050m3 | DT, EG |
| VCST-5731 | Storefront | Functional | 0 (112 SR-ACT-018/019 cover the term click) | 112 | — |
| VCST-5903 | Storybook | n/a | 0 (UI-kit component, no consumer; Storybook surface) | — | — |
| VCST-5906 | Storybook | n/a | 0 (same) | — | — |
| VCST-6314 | Storefront, GraphQL | Functional + boundary + negative | 6-8 (+1 REPAIR GAP-01) | 106, 091, 050m2 | BVA (time), DT (defaults), EG |
| VCST-6533 | Admin Shell | Functional + negative | 5-6 | 114 | ST, EG, BVA (attempts) |

### 6.2 Bugs

| Ticket | Layers | Case type | Suggested count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-4973 | Admin | Regression | 0 (059 CMS-005/006/127/128) | 059 | — |
| VCST-5690 | GraphQL, Storefront | Negative + contract | 6-8 (+3 REPAIR GAP-03/05) | 050d, 010, 044 | EP (one class per rule), BVA (128 / 129 chars), DT |
| VCST-5991 | Storefront | Boundary | 2-3 | 028, 002, 045 | BVA (max = 0, 1, N), EG |
| VCST-6148 | REST, Admin | Negative + idempotency | 3-4 | 049, 020, 063 | EG (double click, duplicate), ST |
| VCST-6167 | REST, GraphQL | Cross-layer | 2-3 | 061, 051 | EG, ST (cache) |
| VCST-6181 | Admin | Functional + filter matrix | 4-5 | 026 | PW (6 filters), EP |
| VCST-6381 | Admin | Regression | 1 (Designer picker half) | 060b | EP |
| VCST-6425 | REST | Environment-gated | 1-2 | 061 | EG (payload size) |
| VCST-6452 | Storefront | Regression | 2 | 015, 046 | EP (locale), EG (hard load) |
| VCST-6453 | Storefront | Analytics | 3-4 | 043, 001, 004 | BVA (page 1 / 2 / N), EP |
| VCST-6454 | Storefront | a11y regression | 2-3 | 072, 045 | EP |
| VCST-6480 | Platform | not testable (x64 stands; ARM64 unit tests only) | 0 | 078 (module load smoke) | — |
| VCST-6501 | Storefront | Regression | 2 | 046, 002 | ST (language sequence), EG |
| VCST-6309 | REST | Negative + boundary | 4-5 (+1 REPAIR GAP-04) | 055, 049 | BVA (-0.01, 0, 0.01), EP |
| VCST-6310 | Admin | Regression | 2 | 101 | EP (time zones), BVA (day boundary) |
| VCST-6311 | Admin | Boundary | 2 | 101 | BVA (previous period 0, 1, near zero) |
| VCST-6478 | Storefront | Analytics | 4-5 | 043 | DT (event × field), EP |
| VCST-6500 | Admin | Regression | 0 (069 IMGTL-026) | 069 | — |

### 6.3 Tasks / Review

| Ticket | Layers | Case type | Suggested count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5443 | Admin, Storefront | Regression | 0 (060c CMS-220..244, 8 ACs) | 060c | — |
| VCST-6132 | REST, Storefront | Regression | 0 (OTP-029..051, MFASF-005) | 104, 105, 111 | — |
| VCST-6429 | Admin | Regression | 0 (061b SRCHJ-001..006) | 061b | — |
| VCST-6443 | Admin, REST | Regression | 0 (059b CMS-259..293) | 059b | — |
| VCST-6479 | GraphQL | Schema / data integrity | 5-6 (GAP-23) | 050f, 050h, 050j, 050k, 050o | EP (type), EG (silent null) |
| VCST-6532 | Storefront | Regression | 0-1 (+REPAIR GAP-02) | 093b | — |
| VCST-6567 | Admin Shell | Functional + negative | 2-3 | 114 | ST, EG |
| VCST-6536 (outside sprint) | GraphQL, Storefront | Regression | 0 (050c ORD-GQL-015/016, 014 ORD-104; confirm they are non-vacuous on a buyer with zero own orders) | 050c, 014 | — |
| VCST-6477 (outside sprint) | Storefront, GraphQL | Functional + EG | 3-4 (GAP-22) | 005, 037, 050k | EP (character class), EG |

**Estimate: 77-100 new cases** (14-18 of them the new suite 114), plus 5 REPAIR edits.

### 6c — Checklist diff (Critical / High domains only)

Drawn once per domain from `/qa-checklist` (`domain-checklists.md`, `backend-admin-checklists.md`, `graphql-checklist.md`) against the §5.1 case titles. "Assertable" -> a §5.2 `GAP-NN`; "state-shaped" -> a charter candidate scenario. Domains with no checklist item to diff are named.

| Domain (level) | Checklist | Uncovered item | Goes to |
|---|---|---|---|
| Authentication — MFA & OTP (Critical) | #1 Auth | The checklist has **no** second-factor, OTP or org-fallback item at all; the 8 items it has (registration, sign-in/out, reset, lockout, expiry, concurrent sessions, validation) are covered by 031 / 032 / 104 / 105 / 110 / 111. VC-Shell client sign-in with MFA | GAP-07 (assertable); EXP-02 (client × grant × org state) |
| Sales Rep hub (Critical) | #35, A28 | Schedule call (no checklist item either); hub served by a plugin on a host without the `/modules` route (KB-847622A8, vcst declares the route); sales-rep:diagnostics; Customer insights after-settle assertions | GAP-08, GAP-09 (assertable); EXP-03 (host / cold deep link / org switch) |
| Search & catalog indexing (Critical) | #6 Search, A10 | A10 "Index rebuild completes" has no lock-contention, no cache-after-reindex item; #6 has no apostrophe / ampersand / `OR` keyword item | GAP-21, GAP-22 (assertable); EXP-04 (stale seams, concurrency) |
| Back office shell (High) | A13 Platform Security | No Admin Shell item (host, menu, iframe fallback, MFA step). Classic-theme items covered by 020b | GAP-06, GAP-07; EXP-01 |
| GraphQL xAPI core (High) | graphql-checklist (Schema, Cross-Cutting) | "Request all available data" / full-field type coverage is missing for xCMS, wishlist, xMarketing, xPickup, returns | GAP-23 (assertable); EXP-05 (silent null) |
| Storefront UI kit, a11y & i18n (High) | #29 a11y, #22 i18n, #15 PDP | Stepper max = 0 ARIA; radio accessible name; quotes keys after hard load; single-language SEO URL switch | GAP-16..19 (all assertable, D1) |
| Customer profile & contacts (High) | graphql-checklist xProfile, A5 Customer Admin | xProfile "Profile update" has no validation-error shape; A5 has no Link-account blade filter item | GAP-10, GAP-14 (assertable) |
| Punchout (High) | none (no Punchout checklist; #36 is UCP) | A checklist for Punchout does not exist: the suites 107 / 108 / 109 / 113 (114 cases) are the only enumeration | no row; propose a checklist at the next `/qa-checklist` refresh |
| Page Builder (High) | A9 Content & Pages | A9 "Create page: permalink" has no forbidden-character rule; Asset Library picker (multi-select, folders) absent from A9. Covered by 059b (35) and 060c (48) | GAP-20 (Designer picker search clear); no other gap |
| Pricing API validation (High) | A2 Pricing Admin, API1 | "Add product prices" has no zero / negative boundary; API1 "Pricing API" lists only `/evaluate` | GAP-04, GAP-11 (assertable) |

**Oracle coverage note:** BL-* cited: BL-AUTH-006/009/010/011/015/016, BL-SRCH-003, BL-CROSS-002, BL-GA4-001/002, BL-PUNCHOUT-008, BL-GQL-001. Domains with **zero** BL-* for this sprint's change (finding, see 5.2): MFA second factor, Admin Shell, Page Builder, Image Tools. VirtoOZ was not queried: every behaviour above is taken from the Jira AC / QA comments, the suites, and the observed-behaviour base (KB-CC283A85, KB-E0D6EA2B, KB-DC04ED4B, KB-847622A8); nothing here is asserted from docs.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

**Blockers — testing of the named domain does not start until these clear:**

1. **The deployed theme is pinned for the run.** `vcst` serves `2.61.0-alpha.2605`. `dev` CI is red, and the next push will change the build under a running suite. Record the theme version at the start of each run, and re-read it before each storefront verdict. Ask the release owner whether the red `dev` CI (Playwright auto-tests and deploy-cloud, since `a9de7833`) is known and owned. **Sales Rep and sign-in failures on this build are triaged against that CI first** (banner).
2. **The Sales Rep plugin route is served by the `vcst` storefront host.** `/modules/...` must answer with the SalesRep remote entry, which vcptcore-qa got through `vc-deploy-dev` #6960. If it does not, every Sales Rep verdict is `BLOCKED (host)`, not `FAIL`, and the finding is about the environment.
3. **An MFA window is booked.** `MultiFactorAuthentication.Enabled` is environment-wide. Suites 110/111 (and any case that turns MFA on) run **alone**, with no other signing-in suite in parallel, and restore the setting in Cleanup. A parallel run under MFA-on makes every other suite's sign-in fail. That is exactly the false "login broken" signal §3 warns about.
4. **Punchout runs on `vcptcore-qa1`** (Punchout `pr-6`). On `vcst` the module is not installed, so suites 107/108/109/113 record `NOT_DEPLOYED`, never `FAIL`.

**Standard gates:**

5. `npm run env:check` green for `TEST_ENV=vcst` (and `vcptcore_qa1` for punchout).
6. All three browser lanes reachable (`playwright-chrome`, `playwright-edge`, `playwright-firefox`), with MCP servers restarted after any config change.
7. Test data seeded and **verified live** per §8, including the divergent pairs (buyer A vs B for 6536; a blocked vs an accessible last-used organization for 6132).
8. `npm run suites:lint` and `npm run td:validate` green.
9. **The §5.2 REPAIR rows (GAP-01…05) land before the suites they repair are run.** They cover the Schedule call tile (091), the built-in-hub setting and paths (093b, 007), the old generic error toast (006), the "allowed or blocked" zero price (020), and the empty security stubs (044). Otherwise the run reports a test defect as a product failure.
10. The `vc-frontend` checkout is pulled and `npm run sitemap:refresh` re-run before any route-level Sales Rep assertion. Sitemap rev 12 is known-stale on routes, and #2607 moved the hub's routes into the plugin.

### 7.2 Exit Criteria

| # | Criterion |
|---|---|
| 1 | Every **Critical** domain (3) has executed its §5.1 suites on at least two browser lanes, with HAR captured, against the build in the banner or a later one that is recorded |
| 2 | Every **High** domain (7) has executed its §5.1 suites on at least one lane |
| 3 | All §5.2 `GAP-NN` items are either covered by a new `Draft` case (or a REPAIR applied) or explicitly deferred **with a reason recorded in this file** |
| 4 | All §5.3 charters executed or explicitly stood down; each produces a net-new scenario or a written "nothing found" |
| 5 | MFA is verified in **both directions** on the release build, for each entry point (storefront, back office, Admin Shell / VC-Shell, OTP, impersonation): the right caller admitted, the wrong code refused |
| 6 | VCST-6132's fallback is verified on **all three** grants (password, `otp_email`, mfa) |
| 7 | The Sales Rep hub is shown **present** (plugin entry 200 + route renders) on the deployed theme before any Sales Rep functional verdict is recorded |
| 8 | VCST-6167 is verified with the **two-read** oracle; VCST-6429 with two concurrent builds and a third after release |
| 9 | VCST-6536 is verified with a divergent pair: B's order is never visible to A, and A's own keyword search still finds A's orders |
| 10 | The six tickets with no QA record (6181, 6425, 6479, 6533, 6567; 6480 developer-only) each have a recorded verdict, or a recorded `BLOCKED` reason |
| 11 | The PR-build-only verifications (5991, 6452, 6453, 6454, 6478, 6501) are re-confirmed on the deployed build, and the ticket comment amended |
| 12 | No open **Critical/High** bug filed by this cycle is left untriaged; each has severity, owning layer and a repo route |
| 13 | Zero suite CSVs left unparsable; `npm run suites:lint` and `npm run td:validate` green at close |
| 14 | Tracker comments follow the GOLDEN RULE: **one comment per ticket per run**, amended, with screenshots attached inline |

---

## 8. Test Data Requirements

Everything below resolves at runtime. **No literals:**
- `{{VAR}}` for per-environment values.
- `@td(ALIAS.field)` for entities asserted by name.
- `live-discover` for drifting ids.
- `random-data` (`AGENT-TEST-` prefix) for unique inputs never asserted on.

All per `.claude/rules/test-data.md`.

| Domain | Data needed | Layer / seeder | Notes |
|---|---|---|---|
| **Auth — MFA & OTP** | An account per kind (storefront buyer, back-office admin, OTP-only buyer, rep for impersonation); the store's `MultiFactorAuthentication.StoreMode`; a buyer in **two** organizations whose last-used one is blocked | `scripts/seed-data/auth/mfa-fixtures.mjs` **inside the case** (FIFTH RULE), `seed:otp-signin`, `seed:membership-lock`, `seed:impersonation` | Codes are read from the **notification journal** (`MfaSignInEmailNotification`, `readLatestMfaCode`), never SMTP; no code within 90 s → `BLOCKED`. The MFA setting is environment-wide: restore it in Cleanup (§7.1 gate 3). **Do not unlock the TechFlow locked membership**: it is locked by design |
| **Sales Rep hub** | A rep serving ≥ 2 customer organizations; one customer with orders, searches and product views in GA4; one task of type Call; an **unserved** customer | `seed:sales-rep`, `seed:sales-rep-tasks`, `seed:sales-rep-stats` | GA4 activity cannot be seeded from here. Read it live, and record `BLOCKED (GA4 config)` when the Workload Identity is not configured. A Call's due time is set in the case |
| **Search & catalog indexing** | Two products (A, B) in one indexed catalog; products, pickup locations and orders whose names contain `'` and `&` | `seed:catalog-edge`, `seed:bopis`, `random-data` | Create the `'` / `&` names in the case and delete them in Cleanup. An index build is environment-wide: **serialise** the 6429 concurrency case with every search suite |
| **Back office shell** | An admin and a **restricted** back-office role (global search must not list what the role cannot open) | `seed:rbac` | 020b already holds the restricted-role cases; reuse its role |
| **GraphQL xAPI core** | Two buyers in **different** organizations, each with ≥ 2 orders whose numbers share a keyword | `seed:orders` + `seed:company-users` | The divergent pair for 6536. A shared keyword is required, or the OR search cannot cross scope in the broken build either |
| **UI kit, a11y & i18n** | A product whose SEO slug exists in **one** language only; a quote; a configurable product with a Product-type section | `seed:configurable`, `seed:quotes`, `live-discover` | 6501 needs the one-language slug, or the case passes in both builds (SECOND RULE) |
| **Customer profile** | A contact and an organization to update; invalid names (digit, `_`, `@`) | `seed:company-users` + `random-data` | Nothing is saved on refusal, so assert the stored value is unchanged |
| **Punchout** | Shared secret, domain, mapped non-admin customer | `seed:punchout` (+ `:verify`, `:reset-carts`) on `vcptcore-qa1` | Not on `vcst` |
| **Page Builder** | Pages with legacy permalinks containing space / `?` / `#` / `&`; Asset Library folders with files | `seed:pb-legacy-permalinks`, `seed:cms-assets`, `seed:pb-shared` | The legacy pages are the regression direction of 6443 |
| **Pricing API** | A product with a price list entry | `seed:pricing` | Write 0 / −10 / a positive value through REST; restore in Cleanup |
| **Platform admin, Image Tools, GA4** | Order.Status dictionary items; images to thumbnail; a category with > 1 page of products | Admin setup, `seed:category-images`, `seed:ga4-lists` | — |

**Standing constraints:** passwords are `{{VAR}}` tokens resolved from `.env.local`, never literals.
Disposable fixtures are isolated **per suite**, not per run, and two suites that consume one fixture set
run serialised, with a re-seed between them. Capture every observation with its run handle and entity
ids, because the fixture will not outlive it. No `reports/tickets/...` output path may appear in any case
row (`DV-024`).

---

## 9. Schedule and Milestones

The sprint closes on **2026-11-02**, so the plan has three working days before close plus the
regression week after it.

| Date | Milestone | Owner |
|---|---|---|
| **2026-10-28** | Plan drafted (this document). Blockers 1–2 raised with the release owner (red `dev` CI; plugin route on `vcst`) | orchestrator |
| 2026-10-28 – 10-29 | §5.2 REPAIR rows GAP-01…05 applied by the single suite writer (GAP-03 after `qa-frontend-expert` re-observes the Company info dialog); `suites:lint` green | test-management-specialist |
| 2026-10-29 | **MFA window** (§7.1 gate 3): suites 110/111, then 104/105/031/082 with MFA on and off; 6132 on all three grants | qa-backend-expert → qa-frontend-expert (sequential) |
| 2026-10-29 – 10-30 | Sales Rep presence check, then hub suites; GA module on/off | qa-frontend-expert |
| 2026-10-29 – 10-30 | Search & indexing sequences (6167 two-read, 6429 concurrency, 6477 keywords); 6536 divergent pair; 6479 field parity | qa-backend-expert |
| 2026-10-30 | Admin Shell sweep + 6533/6567 first QA; Page Builder; pricing; profile | qa-testing-expert / qa-backend-expert |
| 2026-10-30 – 10-31 | §5.3 exploratory charters (30 min each), isolated from the regression pool | per §5.3 owners |
| 2026-10-31 | Punchout on `vcptcore-qa1` | qa-backend-expert |
| **2026-11-02** | **Sprint closes.** Re-run `/qa-test-plan 26-21` to capture the Done delta (165 issues open at drafting) | orchestrator |
| 2026-11-03 – 11-04 | Regression over the full §5.1 activation set (`/qa-run sprint:26-21`); triage | regression-orchestrator / qa-lead-orchestrator |
| 2026-11-05 | Re-test of fixes; `Draft → Automated` promotion pass (`--promote`) | qa-lead-orchestrator |
| **2026-11-06** | Exit criteria reviewed; plan promoted `Draft → Approved`, or the gap recorded | orchestrator |

---

## 10. Resources — QA Agent Assignments

Per `.claude/rules/agents.md`. **Max 3 concurrent browser agents** across QA + BA combined. All three
Playwright lanes are click-capable.

| Domain | Agent | Browser lane | Rationale |
|---|---|---|---|
| Auth — MFA API, back office, OTP grants, 6132 fallback | **qa-backend-expert** | `playwright-edge` | Token-endpoint matrix + back-office sign-in; runs **alone** in the MFA window |
| Auth — storefront MFA step, OTP UI, impersonation | **qa-frontend-expert** | `playwright-chrome` | Sequential after the API half, same window |
| Sales Rep hub (presence, insights, Schedule call) | **qa-frontend-expert** | `playwright-chrome` | Storefront journeys; plugin delivery |
| Sales Rep `/graphql/sales-rep`, Task Management off | **qa-backend-expert** | none / `playwright-edge` | GraphQL-primary |
| Search & indexing (6167, 6429, 6477, 6425) | **qa-backend-expert** | `playwright-edge` | REST + Indexing blade; serialised with search suites |
| Back office shell (Admin Shell sweep, Classic theme, 6533/6567) | **qa-testing-expert** | `playwright-firefox` | Broad admin sweep; MFA sign-in into the shell |
| GraphQL xAPI core (6479 parity, 6536 pair) | **qa-backend-expert** | none | Scripted GraphQL; no browser needed |
| UI kit, a11y & i18n | **vc-test:ui-ux-expert** (a11y) + **qa-frontend-expert** (i18n) | a Playwright lane the run assigns / `playwright-chrome` | WCAG 4.1.2 radio names, stepper ARIA; language switch |
| Customer profile & contacts | **qa-frontend-expert** (storefront) + **qa-backend-expert** (mutations, Link blade) | chrome / edge | — |
| Punchout | **qa-backend-expert** | `playwright-edge` on `vcptcore-qa1` | Module not on `vcst` |
| Page Builder | **qa-testing-expert** | `playwright-firefox` | Designer picker + Asset Library |
| Pricing, Platform admin, Image Tools | **qa-backend-expert** | `playwright-edge` | Admin / REST |
| Storefront analytics (GA4) | **qa-frontend-expert** | `playwright-chrome` | `dataLayer` oracle |
| Test data (all domains) | **test-data-engineer** | none (Node + Platform API) | Authors **and runs** the seeders |
| REPAIR rows and new case authoring (§5.2 / §6) | **test-management-specialist** | `playwright-chrome` (sequential, never parallel with qa-frontend) | **Sole writer** of `regression/suites/**` for the duration of this sprint's changes |
| Suite execution (§5.1) | **regression-orchestrator** | 3-slot pool | Batches of 3 |
| Triage, status, go/no-go | **qa-lead-orchestrator** | — | Sole custodian of ticket status transitions |

---

## 11. JIRA Ticket Coverage Matrix

The table lists every **test-relevant Done ticket** (35), plus the three Done-outside-sprint tickets
deployed in the window. For each: its existing regression home, the new cases §6 calls for, and its
deployment state on `vcst` as read on 2026-10-28 08:40 UTC.

**Deploy** legend:
- ✅ the build on `vcst` carries the fix. For a module, the deployed release is at or above the version the ticket names. For the theme, the PR is in `dev` @ `d4edbe94`.
- ⛔ the module is not installed on `vcst`: run elsewhere, and the result here is `NOT_DEPLOYED`.
- ❓ the code is deployed but the precondition is environmental (provider, host route, GA4 config).
- — not testable on a QA stand.

### 11.1 Stories

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-6327 | Back office shell | 020b (Classic only), 078–078d smoke, 092/092b | 14-18 → **114 (new)** (GAP-06) | EXP-01 | ✅ AdminShell 3.1001.0 (some modules predate their shell UI) | qa-backend-expert |
| VCST-6260 | Back office shell | 020b PLAT-106..127 (`Draft`) | 0 (run + promote) | EXP-01 | ✅ Platform 3.1090.0 | qa-testing-expert |
| VCST-5904 | Auth — MFA & OTP | 110, 111, 104, 105, 101, 082 (9 MFA cases `Draft`) | 0 | EXP-02 | ✅ MFA 3.1000.0 · OTP 3.1001.0 · theme | qa-backend-expert → qa-frontend-expert |
| VCST-5887 | Punchout | 107, 108, 109, 113; `PNCR-016` + 011/013 (Place order) on `vcst` | 0 | — (D3) | ⛔ Punchout · ✅ theme #2564 | qa-backend-expert (`vcptcore-qa1`) |
| VCST-5337 | Sales Rep hub | 112 SR-ACT-001..028, 050m3, 092b (all `Draft`) | 2-3 (GAP-09) | EXP-03 | ✅ SalesRep 3.1016.0 · GA 4.1006.0 · ❓ GA4 Workload Identity | qa-backend-expert |
| VCST-5731 | Sales Rep hub | 112 SR-ACT-018/019 | 0 | EXP-03 | ✅ · ❓ GA4 config | qa-frontend-expert |
| VCST-6314 | Sales Rep hub | 106 (29, none for Schedule call), 091 (`SR-CP-023` REPAIR), 050m2 | 6-8 (GAP-08) + REPAIR GAP-01 | EXP-03 | ✅ SalesRep 3.1016.0 | qa-frontend-expert |
| VCST-6533 | Back office shell / Auth | 110 (Classic back office only) | 5-6 → 114 (GAP-07) | EXP-02 | ✅ AdminShell 3.1001.0 + MFA | qa-backend-expert (**first QA**) |
| VCST-5903 | UI kit | — (Storybook surface) | 0 | — | ✅ theme | — |
| VCST-5906 | UI kit | — (Storybook surface) | 0 | — | ✅ theme | — |

### 11.2 Bugs

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-6167 | Search & indexing | 061, 051, 061b | 2-3 (GAP-21) | EXP-04 | ✅ Catalog 3.1051.0 | qa-backend-expert |
| VCST-6425 | Search & indexing | 061 | 1-2 (GAP-21, provider-gated) | EXP-04 | ✅ AzureSearch 3.1009.0 · ❓ provider on `vcst` | qa-backend-expert (**first QA**) |
| VCST-5690 | Customer profile | 050d PRF-GQL-031..038, 010, 042 SMK-025, 006 `B2C-ORG-039` (REPAIR), 044 stubs (REPAIR) | 6-8 (GAP-10) + REPAIR GAP-03/05 | — (D1) | ✅ ProfileExperienceApi 3.1022.0 · theme #2597 | qa-backend-expert + qa-frontend-expert |
| VCST-6181 | Customer profile | 026 (none for Link blade) | 4-5 (GAP-14) | — | ✅ Customer 3.1031.0 | qa-backend-expert (**first QA**) |
| VCST-4973 | Page Builder | 059 CMS-005/006/127/128 | 0 | — | ✅ PageBuilder 3.1038.0 | qa-testing-expert |
| VCST-6381 | Page Builder | 060c CMS-206, 060b CMS-141 | 1 (GAP-20) | — | ✅ | qa-testing-expert |
| VCST-5991 | UI kit | 028 CART-037 (not max 0), 002, 045 | 2-3 (GAP-16) | — (D1) | ✅ theme #2542 | qa-frontend-expert |
| VCST-6454 | UI kit / a11y | 072, 045 | 2-3 (GAP-18) | — (D1) | ✅ theme #2599 | vc-test:ui-ux-expert |
| VCST-6452 | i18n | 015 (none for i18n), 046 | 2 (GAP-17) | — (D1) | ✅ theme #2593 | qa-frontend-expert |
| VCST-6501 | i18n | 046 `L10N-ROUTE-001` (different defect), 002 | 2 (GAP-19) | — (D1) | ✅ theme #2604 | qa-frontend-expert |
| VCST-6453 | GA4 | 043 `GA-002` (page 1 only), 001, 004 | 3-4 (GAP-15) | — | ✅ theme #2594 | qa-frontend-expert |
| VCST-6478 | GA4 | 043 | 4-5 (GAP-15) | — | ✅ theme #2598 | qa-frontend-expert |
| VCST-6148 | Platform admin | 017, 020, 063, 049 (none) | 3-4 (GAP-13) | — | ✅ Platform 3.1090.0 | qa-backend-expert |
| VCST-6480 | Platform admin | 078 (module-load smoke) | 0 | — | — (ARM64; x64 stands smoke only) | — |
| VCST-6309 | Pricing API | 055, 049 (none), 020 `PLAT-080` (REPAIR) | 4-5 (GAP-11) + REPAIR GAP-04 | — (D1) | ✅ Pricing 3.1010.0 | qa-backend-expert |
| VCST-6310 | Platform admin | 101 SIL-037/038 | 2 (GAP-12) | — | ✅ | qa-backend-expert |
| VCST-6311 | Platform admin | 101 SIL-041 | 2 (GAP-12) | — | ✅ | qa-backend-expert |
| VCST-6500 | Image Tools | 069 IMGTL-026 | 0 | — | ✅ ImageTools 3.1009.0 | qa-backend-expert |

### 11.3 Tasks / Review / Done outside the sprint

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-6532 | Sales Rep hub | 093b `SR-HD-100` (REPAIR), 007 `B2C-LIST-060` (REPAIR), 089/090/091/093/097 | 0-1 + REPAIR GAP-02 | EXP-03 | ✅ theme #2607 · ❓ host route `/modules/...` | qa-frontend-expert |
| VCST-6567 | Back office shell / Auth | — | 2-3 → 114 (GAP-07) | EXP-02 | ✅ AdminShell 3.1001.0 | qa-backend-expert (**first QA**) |
| VCST-6132 | Auth — MFA & OTP | 104/105 OTP-029..051, 111 MFASF-005 | 0 (run on all three grants) | EXP-02 | ✅ Customer 3.1031.0 | qa-backend-expert |
| VCST-5443 | Page Builder | 060c CMS-220..244, 060 (Image carousel) | 0 | — | ✅ PageBuilder 3.1038.0 · theme #2595 | qa-testing-expert |
| VCST-6443 | Page Builder | 059b CMS-259..293 | 0 | — | ✅ PageBuilder 3.1038.0 | qa-testing-expert |
| VCST-6429 | Search & indexing | 061b SRCHJ-001..006 | 0 | EXP-04 | ✅ Search 3.1013.0 | qa-backend-expert |
| VCST-6479 | GraphQL xAPI core | 050a…050o (full-field cases for xCatalog, xCart, xOrder, xProfile only) | 5-6 (GAP-23) | EXP-05 | ✅ Xapi 3.1028.0 | qa-backend-expert (**first QA**) |
| VCST-6536 *(outside sprint)* | GraphQL xAPI core | 050c ORD-GQL-015/016, 014 ORD-104 | 0 (confirm non-vacuous) | EXP-05 | ✅ XOrder 3.1017.0 | qa-backend-expert |
| VCST-6477 *(outside sprint)* | Search & indexing | 037 BOPIS-063 (Manual), 050k PCK-GQL-129 | 3-4 (GAP-22) | EXP-04 | ✅ Search 3.1013.0 | qa-frontend-expert |
| VCST-6340 *(outside sprint)* | Background jobs | 095 | 0 | — | not deployed (Quote 3.1005.0 predates #167) | — |

### 11.4 Coverage summary

| Status | Count | Tickets |
|---|---|---|
| **Fully covered (re-run or promote only)** | **12** | VCST-6260, 5904, 5887, 5731, 4973, 6500, 6132, 5443, 6443, 6429, 6536†, 6340† |
| **Covered, needs new cases** | **19** | VCST-5337, 6314, 6167, 6425, 5690, 6381, 5991, 6454, 6452, 6501, 6453, 6478, 6148, 6309, 6310, 6311, 6532, 6479, 6477† |
| **No suite for the shipped surface** | **4** | VCST-6327, 6533, 6567 (Admin Shell host → proposed **114**), VCST-6181 (Link blade → 026) |
| **REPAIR before running** | **5 rows** | GAP-01 (091), GAP-02 (093b, 007), GAP-03 (006), GAP-04 (020), GAP-05 (044) |
| **No QA recorded on any build** | **6** | VCST-6181, 6425, 6479, 6533, 6567; 6480 (developer only) |
| **`NOT_DEPLOYED` on `vcst`** | **1** | VCST-5887 backend (Punchout); 6340† |
| **Not testable on a QA stand** | **3** | VCST-6480 (ARM64), 5903, 5906 (Storybook only) |
| **Out of scope** | **11** | §2.4 |

† Done outside the sprint.

> **The coverage debt this sprint is in the new shell, not in the new features.** MFA (110/111, 45 rows),
> punchout (107–113), Sales Rep insights (112) and the Page Builder fixes (059b, 060c) were stamped while
> they were tested. The surfaces with **no** suite are the Admin Shell host and its MFA sign-in. They are
> new and touched by 51 module PRs, and nobody has QA'd the sign-in. The three tickets with the widest
> blast radius and no QA record (6479 AutoMapper, 6533/6567 shell MFA) are where this cycle's first
> verdicts come from.

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

These tickets cannot be decided on one layer. Each needs its layers compared against *each other*, not
each checked in isolation.

| # | Ticket(s) | Chain to verify | Why one layer is not enough |
|---|---|---|---|
| 1 | **VCST-5904 + 6132 + 6533 + 6567** | `MultiFactorAuthentication.Enabled` / `StoreMode` (Admin) ↔ `/connect/token` (`two_factor_required` → code → `amr=mfa`) ↔ notification journal (code issued) ↔ storefront code step ↔ Admin Shell / VC-Shell code step ↔ Sign-in log (both steps recorded) ↔ organization chosen after sign-in | The policy is set in one place and enforced in four clients. A client that does not understand `two_factor_required` shows "wrong password", and only the client's own screen reveals that |
| 2 | **VCST-6532 + 5337 + 5731 + 6314** | Theme (built-in hub absent) ↔ host route `/modules/...` (remote entry 200) ↔ plugin renders `/company/*` ↔ `/graphql/sales-rep` (activity, tasks) ↔ GA4 module (optional) ↔ Task Management (optional) | A removal and two optional dependencies: the hub is correct only when every layer is present, **and** it degrades when an optional one is absent |
| 3 | **VCST-6167 + 6429 + 6477** | Admin product edit ↔ indexing event ↔ IndexationJob lock ↔ search index ↔ product cache ↔ storefront search / PDP | Cache and index are two copies of one truth; a defect shows only when a read through one is compared with the other |
| 4 | **VCST-5690** | xProfile mutation error `{field, errorCode}` ↔ storefront field-level message ↔ stored contact unchanged (Admin) | The contract is server-side and the rendering client-side; "nothing saved" is decided by the stored record |
| 5 | **VCST-6536 + 6479** | Buyer A storefront order search (keyword with OR) ↔ `orders` / `organizationOrders` ↔ buyer B's orders (Admin) | A scope leak is only visible against the other buyer's data |
| 6 | **VCST-5443** | Designer picker (multi-select, new folder) ↔ `POST /api/assets/folder` ↔ stored page content ↔ storefront Image carousel | Released together; the storefront section is the consumer of the picker's multi-select |
| 7 | **VCST-5887** (on `vcptcore-qa1`) | Punchout session ↔ storefront "Create requisition" ↔ cXML `PunchOutOrderMessage` POST ↔ cart state after return ↔ second return refused | The cart leaves the system; only the returned document shows what the buyer reviewed |

---

## 13. References

**Merged PRs — `vc-frontend` (16 product; 15 on `dev`):** #2607 (VCST-6532, breaking), #2604 (6501),
#2601 (6121, *not on `vcst`*), #2599 (6454), #2598 (6478/6502), #2597 (5690), #2595 (5443), #2594 (6453),
#2593 (6452), #2592 (6274, `feat/VCST-6231-css-layers`), #2575 (5906), #2570 (5904, breaking), #2568 (5903),
#2564 (5887), #2542 (5991), #2458 (5337/5731). CI/release workflow: #2580, #2585, #2605, #2611. Tests only: #2589.

**Merged PRs — modules + platform (80 product PRs, 63 repos):**
- `vc-platform`: #3133 (5904), #3134 (6260), #3140 (6310/6311), #3146 (6480)
- `vc-module-mfa`: #1, #2
- `vc-module-otp`: #3
- `vc-module-customer`: #321 (6132), plus the 6181 fix
- `vc-module-admin-shell`: #1 (6327), #3 (6567)
- `vc-module-sales-rep`: #15, #26
- `vc-module-google-ecommerce-analytics`: #61
- `vc-module-pagebuilder`: #166, #177, #178
- `vc-module-search`: #157, #159
- `vc-module-azure-search`: #59, #61
- `vc-module-catalog`: #913 (Admin Shell; changes the property-group delete permission), #914 (6167)
- `vc-module-pricing`: #242
- `vc-module-image-tools`: #133
- `vc-module-profile-experience-api`: #150
- `vc-module-x-api`: #93
- `vc-module-x-order`: #57 (6536)
- `vc-module-punchout`: #2 (#5 → `dev-temp`)
- `vc-module-payment`: #80 (6507)
- `vc-module-quote`: #167, `vc-module-product-snapshot`: #5 (6340)
- **51 per-module Admin Shell UI PRs for VCST-6327**, merged 2026-10-27. The list is in the VCST-6327 ticket body.

Also in the window: `vc-shell` #386 (6327), #387, #389, #390, #391 · `vendor-portal` #253 ·
`vc-frontend-next` #11 (6398) · 62 `vc-deploy-dev` bundle bumps.

**Deployed versions (`vcst`, read 2026-10-28 08:40 UTC via `scripts/preflight/cli.ts`):**
- Platform 3.1090.0, theme `2.61.0-alpha.2605` (`dev` @ `d4edbe94`), 89 modules, declared = deployed.
- Sprint-relevant modules: MFA 3.1000.0, OTP 3.1001.0, AdminShell 3.1001.0, SalesRep 3.1016.0, PageBuilder 3.1038.0, Customer 3.1031.0, Xapi 3.1028.0, XOrder 3.1017.0, Search 3.1013.0, AzureSearch 3.1009.0, Catalog 3.1051.0, Pricing 3.1010.0, ImageTools 3.1009.0, ProfileExperienceApi 3.1022.0, GoogleEcommerceAnalytics 4.1006.0, Quote 3.1005.0.
- **Punchout not installed.**
- `vcptcore-qa1`: Platform 3.1090.0, theme `2.61.0-alpha.2601`, Punchout `pr-6`.

**Provenance of behaviour statements in this plan:** MFA, Admin Shell and the punchout return are
**new** in this sprint. Their behaviour is quoted from the ticket ACs and the PR bodies `{SPEC}` and
from QA comments on PR builds `{OBSERVED}` on the named build; no doc page exists yet. The
release-build verdicts are what §5.1 produces. Released behaviour that a case asserts is grounded per
`CLAUDE.md` §Essential Rules → *Product context* (`kb_ask` first, then VirtoOZ) when the case is written,
not in this plan.

**Knowledge and rules (read, not restated):**
- `.claude/rules/agents.md` (roster, browser lanes, delegation) · `.claude/rules/test-data.md` · `.claude/rules/regression.md` · `.claude/rules/reports.md`
- `.claude/knowledge/oracles/` (`BL-*` via `npm run bl:extract`, read-only here) · `ECL-*`
- `.claude/knowledge/execution/quality-gates.md` · `ticket-routing.md` · `ticket-status-transitions.md` · `test-data-authoring.md` · `live-discovery.md`
- `.claude/knowledge/domain/sitemap.md`: **rev 12**, refreshed at Step 0 of this run (deterministic axis only; routes known-stale)
- `.claude/skills/qa-risk/risk-prioritization-framework.md` (§3) · `.claude/skills/qa-test-design/test-design-techniques.md` (§4.3) · `.claude/skills/qa-sbtm/sprint-charter-selection.md` (§5.3)
- MFA fixtures and the code reader: `scripts/seed-data/auth/mfa-fixtures.mjs`

**Manifest and tooling:** `config/test-suites.json` (**168 suites, 39 selection groups** at time of
writing; `npm run suites:lint` prints the live totals) · `npm run regression:plan -- <group>` ·
`npm run env:check` · `npm run td:validate` · `npm run suites:lint`.

**Prior art:**
- `docs/Sprint plans/sprint-26-20-test-plan.md`: the immediately prior plan
- `reports/tickets/Sprint26-21/`: **15 ticket folders already exist** (VCST-5903, 5904, 6132, 6231, 6260, 6274, 6381, 6398, 6429, 6443, 6452, 6453, 6454, 6478, 6501). Read these before re-testing anything
- `reports/exploratory/`: `SBTM-VCST-5904-2026-10-23`, `SBTM-VCST-6260-2026-10-21`, `SBTM-VCST-6132-2026-10-20`, `SBTM-VCST-6398-2026-10-20`, `SBTM-VCST-5888-2026-10-27`, `SBTM-VCST-5887-2026-10-14`
- Regression runs named in the tickets: REG-2026-10-21-1800 (6260), REG-2026-10-23-1337 (6327), REG-2026-10-20-1811 / -1248 (5887), REG-2026-10-22-1819 (6443), REG-2026-10-26-VCST-6478-r3

**Tracker:** Jira project `VCST`, sprint `VCST Sprint 26-21` (id 2718, board 126).
