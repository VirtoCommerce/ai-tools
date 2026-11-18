# Sprint 26-22 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-11-11
**Target environment:** QA (`FRONT_URL` / `BACK_URL`), `TEST_ENV=vcst`
**Sprint dates:** 2026-11-02 – 2026-11-16 *(quoted from the Jira sprint object `VCST Sprint 26-22`, id 2949, board 126)*
**Flags:** `--frontend`. Only `vc-frontend` PRs were reviewed; module PRs were not fetched. The waves cover the §5.1.1 Frontend suites only.

> **Update 2026-11-12 (`--update`).** The scope did not change: no Story, Bug or Task of the sprint turned Done after 2026-11-11. Two things moved:
> - **Build.** `vcst` now serves theme **`2.62.0-alpha.2647`** (`vc-frontend` `dev` @ `0315ecbd`, vc-deploy-dev#7097, 2026-11-11 17:12 UTC) and the **Xapi release 3.1031.0** (vc-deploy-dev#7098) in place of the x-api#70 PR build. alpha.2647 carries #2552, #2633, #2634, #2642 and #2652, so VCST-6079, VCST-6253, VCST-6254 and VCST-6698 are no longer `NOT_DEPLOYED` — the domain waves ran their cases on alpha.2647. Only W0 and the first W2 run were on alpha.2642. The build notes below are the 2026-11-11 reading.
> - **WX.** Besides the five sign-in suites it now holds the 35 env-wide cases W1, W3, W4 and W6 deferred (store settings, the shared pickup-location set, a shared price, the missions toggle, an appsettings flag). The list: `regression/releases/sprint-26-22/PLAN.md` §WX.

> **⚠ This sprint is still OPEN.** The plan was built on 2026-11-11, five days before the sprint closes. Of 179 issues, **78 are Done**. The rest include 8 Tasks and 4 Stories In review, 9 Tasks and 6 Stories In progress, 5 Tested, and 8 Testing or Ready for test. The scope below is the **Done** set. Re-run `/qa-test-plan 26-22 --update` after the sprint closes.

> **The deployed theme is behind `dev`, and `dev` CI is red.** Build read on 2026-11-11 (`vc-deploy-dev@vcst-qa` manifest, `/api/platform/modules`, `theme-ci.yml` runs):
> - **Theme `2.62.0-alpha.2642`** is `vc-frontend` `dev` @ `16fa89e1` (2026-11-11 08:18 UTC), the last green `theme-ci` run on `dev`. Alphas 2643–2645 failed CI and are not deployed. **Five PRs merged after it are NOT on `vcst`:** #2652 (VCST-6079), #2552 (VCST-6078, live-data account dashboard), #2642 (VCST-6698, front-end half), #2633 (VCST-6253) and #2634 (VCST-6254). Their cases report `NOT_DEPLOYED`, never FAIL, until a green alpha is deployed (then run `--update`).
> - **Platform 3.1097.0**, 92 modules, 0 load errors, upgraded today by vc-deploy-dev#7094 (SalesRep 3.1023.0, Loyalty 3.1011.0, XFrontend 3.1010.0, Orders 3.1020.0, Search 3.1015.0, Catalog 3.1052.0 and others).
> - **`VirtoCommerce.Xapi` is a PR build:** `3.1031.0-pr-70-108f` (vc-module-x-api#70, VCST-4717), deployed by vc-deploy-dev#7095. ApplicationInsights 3.1007.0 (VCST-4717) does not load with Xapi 3.1030.0: the platform failed to start until this build was pinned. Every GraphQL call runs through this build, so a GraphQL or telemetry failure must be checked against it before it is filed. When x-api#70 is released, `/qa-env-upgrade vcst` moves Xapi back to a release, and the waves that have not started re-pin with `--update`.
> - **`dev` CI is red on most pushes this sprint** (11 of the last 12 `theme-ci` runs on `dev`, 2026-11-10 – 11, failed). Read a storefront failure as possibly already seen by upstream CI before filing it.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-22 (`VCST Sprint 26-22`, Jira sprint id 2949) |
| Date range | 2026-11-02 – 2026-11-16 (**active** at drafting) |
| Sprint goal (Jira) | Subscriptions SOW alignment and MFA per user and company (customer-driven); MCP Agentic API for roles; Bridge; Site Builder |
| Theme | **The storefront's look is rebuilt underneath it while sign-in gains a policy.** Bridge lands its foundation: shape and typography tokens, CSS layers, a soft `VcWidget`, and a CI ban on new `!important`, which together touch every page. MFA becomes a policy per store, decided by the administrator, the organization or the customer (VCST-6597, 44 files). Around them: four sign-in fixes, two Sales Rep Hub stories, an address-composable removal across account, company and quotes, and about twenty a11y and layout fixes found by agents |
| Done tickets | **78**: 11 Stories, 38 Bugs, 23 Tasks, 6 Review tasks |
| **Of which out of scope** | **18**: 6 review tasks, 4 `[Agentic QA]` / auto-test tasks, 2 `[AI Powered Demo]`, 3 CI/NuGet tasks, 1 release merge, 1 env update, 1 smoke on another stand (§2.4) |
| **Test-relevant Done tickets** | **60**: 10 Stories + 38 Bugs + 12 Tasks |
| Merged PRs in `vc-frontend` | **37** in the window: 35 on `dev` and 2 on feature branches (#2631 into `feat/VCST-6289-soft-widget`, #2653 into `feat/VCST-6078-user-dashboard`). 3 are CI/workflow only (#2615, #2636, #2643). One has no ticket key (#2647, company-info null organization; reviewed under VCST-6732) |
| Merged PRs in modules + platform | Not fetched (`--frontend`). The module halves of the Done tickets are listed per ticket in §11 |
| Storefront sitemap | Refreshed to **rev 13** at Step 0: platform line 3.1090.0 → **3.1097.0**, modules 89 → **92**, products 4,655 → **4,652**, nav categories 52 → **53** (`seed-range-facet-fixtures`), routes +2 (`/punchout/:sessionToken`, a returns `Account` mount). Deterministic axis only. The local `vc-frontend` checkout is `66004bd4` from 2026-10-09, so the route lists are still known-stale |

**The risk this sprint is a page that looks slightly wrong everywhere.** Bridge moves every
storefront style into CSS layers and onto new tokens (#2600, #2620 — 68 files, #2631, #2623). A
layer-order or token mistake breaks no test and throws no error. Instead, a border disappears, a
focus ring changes colour, or a label shrinks, on pages no Bridge ticket names. Two Done bugs this
sprint (VCST-6662 label sizes, VCST-6079 focus ring) already show this shape. So the UI-kit wave
runs the layout, accessibility and whitelabel suites over the **whole** storefront, not only the
pages each ticket names.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 10)

| Key | Pri | Summary | Domain | vc-frontend PRs |
|-----|-----|---------|--------|-----------------|
| VCST-6641 | High | [Platform][MCP] OAuth applications: set up AI agent clients fully in the back office (Admin Shell and classic  | Back office (no wave) | — (module only) |
| VCST-6597 | Medium | MFA policy per store: administrator, organization or customer decides who uses the email code | Auth | #2622 |
| VCST-6451 | Medium | Sales Rep Hub: header icon linking to the hub Dashboard (Sales Rep role only) | Sales Rep | — (module only) |
| VCST-6338 | Medium | Extract Legacy Admin UI to Admin-AngularJS Module | Back office (no wave) | — (module only) |
| VCST-6158 | Medium | [Sales Rep Hub] Promo & Coupons by customer | Sales Rep | #2596 |
| VCST-6157 | High | [Sales Rep Hub] Tasks by customer | Sales Rep | — (module only) |
| VCST-6155 | High | MCP module - UCP on top of it, samples (this work) | Back office (no wave) | — (module only) |
| VCST-6136 | High | [Next] Select Organization Menu | Company | — (`vc-frontend-next`, not on `vcst`) |
| VCST-6079 | Medium | Watermelon preset: the focus ring is the theme accent RED, so a focused field reads as a validation error (and | UI kit / a11y | #2652 · **#2652 merged after alpha.2642 — NOT_DEPLOYED** |
| VCST-5994 | Medium | [ui-kit][a11y] Error state is visual only on VcCheckbox, VcTextarea and date-range fields — no aria-invalid, n | UI kit / a11y | #2629 |

### 2.2 Bugs Fixed (QA-relevant — 38)

| Key | Pri | Summary | Domain | vc-frontend PRs |
|-----|-----|---------|--------|-----------------|
| VCST-6756 | Lowest | [vc-module-admin-shell] Menu Editor: Save fails with 400 after adding AngularJS screens — fractional priority  | Back office (no wave) | — (module only) |
| VCST-6703 | Medium | Back office New account: "Entered passwords do not match!" stays visible after Password is changed to match Re | Auth | — (module only) |
| VCST-6702 | Medium | [Sales Rep Hub] Tasks: the filter row cannot wrap — at 768–898 px Priorities is cut off and the page scrolls s | Sales Rep | — (module only) |
| VCST-6701 | Medium | [Sales Rep Hub] Tasks: the new Customer column clips customer names to two short lines at 1280 px (customers t | Sales Rep | — (module only) |
| VCST-6700 | High | Search: IIndexingManager.IndexAsync/IndexAllDocumentsAsync/IndexChangesAsync lost ICancellationToken overload  | Catalog & search | — (module only) |
| VCST-6698 | High | Customer address Line1/Line2 limited to 128 chars while Cart/Order allow 2048 — a longer address fails to save | Cart & addresses | #2642 · **#2642 merged after alpha.2642 — front-end half NOT_DEPLOYED** |
| VCST-6669 | High | When a user forced to change password there is a 500 error | Auth | — (module only) |
| VCST-6665 | Medium | [Catalog] Catalog deletion fails with FK_Item_Catalog_CatalogId when catalog products are linked to categories | Back office (no wave) | — (module only) |
| VCST-6664 | Medium | [catalogcsvimport] Import links products to categories of another catalog (CategoryId not validated) – product | Back office (no wave) | — (module only) |
| VCST-6663 | Medium | [catalogcsvimport] Column mapping edits are lost when the Map columns blade is reopened; import runs with the  | Back office (no wave) | — (module only) |
| VCST-6662 | High | [ui-kit][Next] Field labels in one form differ in size and colour: VcInput labels are 12 px and muted, VcSelec | UI kit / a11y | #2646 |
| VCST-6652 | Medium | /company/members: the members table sticks out of its card and the whole page scrolls sideways at 1024–1106 px | Company | #2638 |
| VCST-6630 | High | Passkey and OTP sign-in force a password change when the account's password is expired (only SSO sign-in skips | Auth | — (module only) |
| VCST-6600 | Medium | Storefront Security page: keyboard focus drops to the page body after adding a passkey and after deleting one | Auth | #2640 |
| VCST-6599 | Medium | Storefront Security page: every passkey's buttons are named only "Edit" and "Delete", so screen-reader users c | Auth | #2637 |
| VCST-6593 | Medium | Admin Shell login: keyboard focus on "Sign in with a passkey" and "Continue with Google" is not visible (1.34: | Auth | — (module only) |
| VCST-6537 | Medium | [vc-module-marketplace-vendor] Fresh PostgreSQL install creates truncated tables: offers search fails with "42 | Back office (no wave) | — (module only) |
| VCST-6530 | Medium | MFA: a store with StoreMode=Disabled lets a Backoffice account get API tokens without the code while global MF | Auth | — (module only) |
| VCST-6504 | Medium | Sign-in code boxes are almost invisible: border contrast 1.48:1 (light) / 1.88:1 (dark), under WCAG 1.4.11's 3 | Auth | — (module only) |
| VCST-6477 | Low | Pickup location search: a keyword containing ' or & returns every location in cartPickupLocations and productP | Catalog & search | — (module only) |
| VCST-6375 | Medium | Storefront cart: "Price per item" shows the list price on desktop but the discounted price on narrow screens w | Cart & addresses | #2588 |
| VCST-6374 | Medium | Storefront cart: every line checkbox and the select-all checkbox are announced as "Toggle vendor select"; bill | Cart & addresses | #2587, #2586 |
| VCST-6288 | Low | Storefront Company info: console TypeError "Cannot read properties of undefined (reading 'status')" for Organi | Company | #2612 |
| VCST-6254 | Medium | [Search] Keyboard focus is lost to the page body after removing the category scope chip from the search bar | Catalog & search | #2634 · **#2634 merged after alpha.2642 — NOT_DEPLOYED** |
| VCST-6253 | Medium | [Catalog] Leaving a category page before its data loads rewrites the URL to that category while another page s | Catalog & search | #2633 · **#2633 merged after alpha.2642 — NOT_DEPLOYED** |
| VCST-6251 | Medium | [xAPI] Caller-supplied filter/keyword terms overwrite the scope set around TermFilter.MapTo (carts, quotes, ba | Catalog & search | — (module only) |
| VCST-6215 | Medium | [ui-kit][a11y] Required asterisk leaks into accessible names, and VcInput never exposes required (WCAG 4.1.2 / | UI kit / a11y | #2586 |
| VCST-6205 | Low | [Sales Rep] At 320px the "All blocks are hidden" empty state overflows its column and the page scrolls horizon | Sales Rep | #2653 |
| VCST-6197 | Medium | [Sales Rep] Customer orders at 375 px: re-opening the Filters drawer pushes the page sideways (horizontal scro | Sales Rep | #2608 |
| VCST-6196 | Medium | [Sales Rep][i18n] Customer orders: the Created date filter shows the raw key sales_rep.customer_orders.filters | Sales Rep | — (module only) |
| VCST-6195 | Medium | [Sales Rep] Customer orders: removing one chip of an applied date preset leaves the Filters drawer showing the | Sales Rep | — (module only) |
| VCST-6185 | Medium | x-cart mergeCart does not verify the caller can access SecondCartId | Cart & addresses | — (module only) |
| VCST-6143 | Medium | [Missions][a11y] Mission progress bars expose no progressbar role or value to assistive tech | UI kit / a11y | #2591 |
| VCST-6142 | Medium | [Missions][a11y] Completed-mission check icon fails 3:1 contrast over its overlay — 2.04:1 light, 2.56:1 dark | UI kit / a11y | #2590 |
| VCST-6099 | Low | [GA][Frontend] Search results view_item_list is sent as Category "undefined" (page 1) on /search | Catalog & search | #2641 |
| VCST-5938 | Medium | Compare page freezes and sometimes becomes unresponsive | Catalog & search | #2613 |
| VCST-5816 | Medium | [vc-shell] GET /api/vcmp/message/unreadcount returns HTTP 500 on every poll — notification unread count broken | Back office (no wave) | — (module only) |
| VCST-5711 | Medium | [Storefront][A11y] Cart: delivery/payment selectors and placeholder images fail accessibility checks | Cart & addresses | #2586, #2632 |

### 2.3 TechDebt / Structural / Tasks (QA-relevant — 12)

| Key | Pri | Summary | Domain | vc-frontend PRs |
|-----|-----|---------|--------|-----------------|
| VCST-6763 | High | [FE] vc-frontend: upgrade vitest 3 → 4 (tinypool and @vitest/mocker advisories) | Dependencies | #2651 |
| VCST-6737 | High | vc-frontend: fix vulnerable npm dependencies (osv-scanner, dev 2.62.0) | Dependencies | #2657, #2651, #2650 |
| VCST-6733 | High | Fix High/Critical dependency vulnerabilities in stable16 bundle (osv-scanner) | Dependencies | — (module only) |
| VCST-6647 | Medium | [Sales Rep Hub] [Reporting] Extract the report body into a reusable component | Sales Rep | #2624 |
| VCST-6564 | Highest | Move Google Maps and Firebase to a company-owned Google Cloud account (tracks VCI-1540) | Cart & addresses | — (module only) |
| VCST-6529 | High | [Bridge][Foundation] CSS layers follow-ups from the #2577 review | UI kit / a11y | #2620, #2631 |
| VCST-6495 | High | MFA: a storefront user can get tokens without the code by omitting storeId or naming a store without MFA | Auth | — (module only) |
| VCST-6468 | Medium | [Bridge][Foundation] Block new !important in CI | UI kit / a11y | #2623 |
| VCST-6289 | High | [Bridge][UI-kit] Give VcWidget the soft plate, a marked section head and a nested mode | UI kit / a11y | #2620 |
| VCST-6232 | High | [Bridge][Foundation] Shape and typography token architecture | UI kit / a11y | #2600 |
| VCST-4857 | Medium | Remove deprecated useOrganizationAddresses and useUserAddresses, migrate to new composables | Cart & addresses | #2424 |
| VCST-3632 | High | Badges (notifications and cart) overlap when count is large in PL, PT, ES, RU languages in header | UI kit / a11y | #2644 |

### 2.4 Out of Scope (18)

| Key | Type | Summary |
|-----|------|---------|
| VCST-6745 | Review task | Code Review [vc-module-punchout]: docs: Update README to match the current module code |
| VCST-6740 | Task | Test reсent mcp-onx changes |
| VCST-6732 | Review task | Code Review [vc-frontend]: fix(company-info): stop the page from throwing when the organization becomes null |
| VCST-6691 | Review task | Code Review [vc-module-catalog-csv-export-import]: ci: Publish NuGet via Trusted Publishing on support/3.1000 |
| VCST-6690 | Review task | Code Review [vc-module-catalog-csv-export-import]: fix: Move NuGetAuditMode to a PropertyGroup (support/3.1000 |
| VCST-6642 | Task | Remove manual operations for Nuget policies |
| VCST-6636 | Task | [Agentic QA] /qa-docs: one documentation skill — What's new, How to set it up, How it works, Motion film |
| VCST-6626 | Task | Merge 61 Release to Next |
| VCST-6590 | Task | [FE] Fix the dev Sonar gate: new code period, bugs and vulnerabilities |
| VCST-6588 | Task | [FE] Speed up Theme CI: run unit tests once, Sonar in parallel, cancel stale PR runs |
| VCST-6450 | Task | [AI Powered Demo] Create an Application Insights resource for the deploy MCP audit trail |
| VCST-6436 | Task | [Auto-tests] Fix flaky and `known issues` tests |
| VCST-6423 | Task | [Agentic QA] Optimize agents promts |
| VCST-6416 | Task | Smoke test on Virtostart-21 |
| VCST-6202 | Review task | Code Review [vc-module-x-api]: Keep OverrideSchemaBuilder replacements in scoped schemas |
| VCST-6164 | Task | Update modules on vcst environments |
| VCST-5928 | Review task | Code Review [vc-module-elastic-search-8]: fix: throw on a failed index mapping load instead of caching an empt |
| VCST-5754 | Story | [AI Powered Demo] vc-marketing-clips skill |

Review tasks that shipped code are tested through their parent change: VCST-6732 through #2647 (Company), VCST-6202 through Xapi 3.1030.0 (now replaced on `vcst` by the x-api#70 PR build).

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Authentication — MFA, passkeys, OTP & password policy** | 5 | 5 | **25** | Critical | **The MFA policy is now decided in three places.** VCST-6597 (#2622, 44 files) lets the administrator, the organization or the customer decide who uses the email code, and adds the settings to account security and company pages through federation. In the same window: a forced password change returned 500 (6669); passkey and OTP sign-in forced a change on an expired password (6630); a storefront user could get tokens without the code by omitting `storeId` (6495); and a Backoffice account could do the same on a `StoreMode=Disabled` store (6530). Each is a sign-in that is wrongly refused or wrongly admitted |
| **Storefront UI kit, design tokens, a11y & i18n (Bridge)** | 5 | 5 | **25** | Critical | **Every page renders through this.** Shape and typography tokens (#2600), CSS layers with the soft `VcWidget` and widget skeleton (#2620, 68 files; #2631), the `!important` ban (#2623), required-asterisk and `aria-` fixes in `VcInput`/`VcCheckbox`/`VcTextarea` (#2586, #2629), badges capped at 99+ (#2644, 30 files), mission a11y (#2590, #2591). Two Done bugs, VCST-6662 and VCST-6079, are already regressions of this kind. VCST-6079's fix is **not deployed** |
| **Sales Rep hub** | 5 | 4 | **20** | Critical | Two stories (6157 Tasks by customer, 6158 Promo & Coupons with the coupon card exposed to plugins, #2596), the header link (6451), a sales report component moved into the core theme (6647, #2624, 44 files, `core-api` contract), and six layout or i18n fixes (6702, 6701, 6205, 6197, 6196, 6195). The hub is plugin-delivered, so a broken `core-api` contract shows up as a missing widget, not an error |
| **Cart, checkout & addresses** | 4 | 5 | **20** | Critical | **The address composables were removed** (#2424, 25 files across account, company, quotes and ship-to-location). Address line length 128 → 2048 (6698: the module half is deployed, the front-end half is **not**). Cart price per item on narrow layouts (6375), checkbox and method-selector names (6374, 5711), `mergeCart` now checks access to the second cart (6185, xAPI). Google Maps and Firebase moved to a company-owned account (6564): the BOPIS map and push notifications depend on the new keys |
| **Catalog, search, compare & analytics** | 3 | 5 | **15** | High | Bug fixes only: compare page freeze (5938, #2613), GA `view_item_list` category (6099, #2641), xAPI caller filters overwrite the scope (6251, **security**), indexing cancellation (6700), pickup keyword `'`/`&` (6477). 6253 and 6254 are **not deployed** |
| **Company & organization** | 3 | 4 | **12** | High | Members table overflow (6652, #2638), company-info console error and null organization (6288, #2612, #2647); #2424 also changes company addresses. VCST-6136 (Select Organization menu) is a `vc-frontend-next` story: not on `vcst`, GAP-32 |
| **Storefront dependencies & build** | 2 | 5 | **10** | High | vitest 4 and the npm advisory upgrades (6763, 6737, #2650, #2651, #2657) change `yarn.lock` of the shipped theme. Low likelihood, whole-storefront blast radius; W0 smoke is the guard |
| **Platform, MCP & back office** | 4 | 3 | 12 | High | OAuth apps for AI clients (6641), MCP/UCP module (6155), legacy Admin UI extracted to its own module (6338), Menu Editor save (6756), CSV import (6663, 6664), catalog deletion (6665). **No storefront wave** under `--frontend`; §5.1.2 lists the suites |
| *Agentic QA · CI · NuGet · demo · env updates · review tasks* | — | — | — | *Out of scope* | §2.4. Not scored; not gaps |

**Four Critical domains, and two of them fail without an error.** A sign-in policy that refuses the
right buyer looks like "login broken" and gets triaged as flake. A layer-order mistake looks like
nothing at all. So every Critical case asserts **presence and appearance**: the token, the code step
or its absence, the rendered field label and focus ring. "No console error" is not a pass.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA / Shell | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-------------------|------|--------------|------|-----------|
| Auth — MFA, passkeys, OTP | ✅ **primary** (MFA policy on account security + company, code step, passkey, OTP, forced password change) | ✅ (store MFA policy, back-office new account 6703) | ✅ **primary** (`/connect/token` with and without `storeId`, `StoreMode=Disabled`) | ✅ (`me`, policy fields) | ✅ (Security page names and focus 6599/6600, code box contrast 6504) | — |
| UI kit, tokens, a11y & i18n | ✅ **primary** (every page: forms, widgets, badges, presets) | — | — | — | ✅ **primary** (asterisk, `aria-required`, error state, progressbar) | — |
| Sales Rep hub | ✅ **primary** (Tasks by customer, Promo & Coupons, header link, report) | ✅ (rep assignment) | — | ✅ (`/graphql/sales-rep`) | ✅ (320–898 px layouts) | — |
| Cart, checkout & addresses | ✅ **primary** (cart, checkout, address forms, ship-to, quotes, BOPIS map) | — | — | ✅ **primary** (`mergeCart` second cart access) | ✅ (checkbox and selector names) | — |
| Catalog, search, compare | ✅ **primary** (compare, search, category) | — | ✅ (indexing) | ✅ (term filter scope) | ✅ (focus after chip removal) | ✅ **primary** (`view_item_list`) |
| Company & organization | ✅ **primary** (members, company info, org menu) | — | — | ✅ (organization) | — | — |
| Dependencies & build | ✅ (W0 smoke on the deployed build) | — | — | — | — | — |

### 4.2 Testing Approach by Priority

**Step zero for every storefront verdict: read the theme version.** `vcst` serves `2.62.0-alpha.2642`
(`dev` @ `16fa89e1`). A case for 6079, 6078, 6698 (front end), 6253 or 6254 is `NOT_DEPLOYED` on this
build. A later deploy changes the build under the run; record it in the wave's `report.md`.

1. **Auth (25): both directions, on every entry point.**
   - **Admitted:** MFA policy off → password only; administrator policy on → password → code; organization or customer policy → the code is asked only for those it covers. Passkey and OTP sign-in with an expired password reach the change-password page, not a 500 (6630, 6669).
   - **Refused:** tokens without the code when `storeId` is omitted or names another store (6495); a Backoffice account on a `StoreMode=Disabled` store (6530).
   - **Turning MFA or OTP on is environment-wide**, so 104, 111, 114, 114a and 114b run only in **WX**, serialised, with the setting restored in Cleanup.
2. **UI kit (25): sweep, do not sample.** Run 048c (layout stability), 045 (a11y), 046 (localization) and 070/071 (whitelabel presets) over the whole storefront. Every form shows labels of one size and colour (6662). The required asterisk is not part of the accessible name (6215). An error state is announced on checkbox, textarea and date range (5994). Badges read 99+ in PL, PT, ES and RU (3632).
3. **Sales Rep (20): presence first, then the two stories.** The hub route renders, the plugin entry loads, and the header link shows for a Sales Rep only (6451). Then Tasks by customer (106, 6157) and Promo & Coupons (091c, 6158). Then the layouts at 320, 375 and 768–898 px (6205, 6197, 6702, 6701).
4. **Cart & addresses (20): a divergent pair for every address field.** Add, edit and select an address in account, company, checkout and quote (#2424 removed the composables all four used). The front-end limit of 2048 for Line1/Line2 is not deployed, so assert only the module half (the API accepts more than 128) until it is. `mergeCart` merges your own second cart and refuses someone else's (6185).
5. **High (10–15):** compare page with many products at the compact-header threshold (5938); GA `view_item_list` on a search page carries the search list, not "undefined" (6099); pickup keywords `O'Neil` / `A&B` (6477); members table and company info for a maintainer (6652, 6288).
6. **Medium / Low:** run the affected suites only.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Auth | **Decision Table** (policy owner × store mode × grant × account state → code asked / token / refused) + **State Transition** (expired password → sign-in → forced change) + **Divergent pair** (with and without `storeId`) | Three places now decide the same policy; the wrong cell hides in the table |
| UI kit / a11y | **Coverage sweep** (every page × preset) + WCAG 2.2 AA checklist + **Differential** (screenshots before/after a layer change) | A layer-order defect lands on pages no ticket names |
| Sales Rep | **Presence assertion** + **FLOW** (dashboard → customer → tasks / coupons) + **BVA** on width (320, 375, 768, 898) | The hub fails by absence; the layout bugs sit on width boundaries |
| Cart & addresses | **EP** over address entry points (account, company, checkout, quote) + **BVA** on line length (128, 129, 2048, 2049) + **Divergent pair** (own vs foreign second cart) | One composable removed from four callers; one limit raised on two layers |
| Catalog & search | Error Guessing + **EP** on keyword characters; event-payload assertions for GA | Single-defect guards |
| Company | **EP** over roles (maintainer, employee) × organization state (set, null) | 6288/#2647 fail only for a null organization |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> 43 Frontend suites (1,666 cases, about 25 h 50 m of work, 8 h 36 m wall clock on 3 lanes, from `npm run regression:plan`) in the waves, plus the Backend suites in §5.1.2, which are listed but **not waved** (`--frontend`). Every id is in `config/test-suites.json`. Suite 118 (account dashboard, VCST-6078) is left out: the ticket is not Done and #2552 is not deployed.

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite | Name | Wave | Sprint trigger | Pri |
|-------|------|------|----------------|-----|
| 042 | Smoke Tests | W0 | every deploy; 6737, 6763 (lockfile) | P0 |
| 031 | Auth Login & Register | W1 | 6669, 6630, 6504 | P1 |
| 032 | Auth Session & RBAC | W1 | 6495, 6530 | P1 |
| 033 | Auth Company & Account Menu | W1 | 6597, 3632 | P1 |
| 082 | Auth Impersonation / Login on Behalf | W1 | 6597 | P1 |
| 044 | Security Tests | W1 | 6495, 6530, 6185, 6251 | P0 |
| 089 | Sales Rep — My Customers | W2 | 6157, 6158 | P1 |
| 090 | Sales Rep — My Sales Reps | W2 | 6451 | P1 |
| 091 | Sales Rep — Customer Profile | W2 | 6157, 6158 | P1 |
| 091c | Sales Rep — Available Coupons | W2 | 6158 | P1 |
| 093 | Sales Rep — Hub Dashboard | W2 | 6451, 6205 | P1 |
| 093b | Sales Rep — Hub Plugin Delivery | W2 | 6647, 6158 (`core-api` contract) | P1 |
| 097 | Sales Rep — Customer Orders | W2 | 6197, 6196, 6195 | P1 |
| 106 | Sales Rep — Tasks | W2 | 6157, 6702, 6701 | P1 |
| 112 | Sales Rep — Customer Activity & Insights | W2 | 6647 | P1 |
| 011 | Checkout Flow | W3 | 4857, 5711, 6698 | P1 |
| 013 | Checkout B2B | W3 | 4857 | P1 |
| 028 | Cart Core | W3 | 6375, 6374 | P1 |
| 029 | Cart Validation & Persistence | W3 | 6374 | P1 |
| 030 | Cart Merge | W3 | 6185 | P1 |
| 081 | Select Shipping Address Popup | W3 | 4857, 6698 | P1 |
| 015 | Quotes | W3 | 4857, 6375 | P1 |
| 036 | BOPIS Store Selector | W3 | 6564 (Maps key), 6477 | P1 |
| 001 | Catalog Navigation | W4 | 6253 (not deployed) | P1 |
| 002 | Product Detail | W4 | 6253 | P1 |
| 004 | Search Core | W4 | 6254 (not deployed), 6251, 6700 | P1 |
| 005 | Search Filters & Advanced | W4 | 6251 | P1 |
| 098 | Product Compare v2 | W4 | 5938 | P2 |
| 043 | Google Analytics | W4 | 6099 | P2 |
| 006 | B2B Organization | W5 | 6288, 4857 | P1 |
| 008 | B2B Members | W5 | 6652 | P1 |
| 011b | B2B Company E2E | W5 | 4857 | P1 |
| 083c | Loyalty Missions Storefront | W6 | 6142, 6143 | P1 |
| 045 | Accessibility Tests | W6 | 6215, 5994, 6599, 6600, 6374, 5711 | P2 |
| 046 | Localization Tests | W6 | 3632, 6196 | P2 |
| 048c | Layout Stability (runner-native) | W6 | 6232, 6289, 6529, 6468 | P1 |
| 070 | Whitelabeling Storefront | W6 | 6232, 6079 (not deployed) | P1 |
| 071 | Whitelabeling Branding | W6 | 6232, 6662 | P1 |
| 104 | Auth OTP Sign-In | WX | 6630, 6597 | P1 |
| 111 | Auth MFA Sign-In | WX | 6597, 6495 | P1 |
| 114 | Auth Passkey Sign-In | WX | 6630, 6599, 6600 | P1 |
| 114a | Auth Passkey on an MFA store | WX | 6597 | P1 |
| 114b | Auth Passkey on an OTP store | WX | 6630 | P1 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`) — listed, not waved

| Suite | Name | Sprint trigger |
|-------|------|----------------|
| 110 | MFA Sign-In API and Backoffice | 6597, 6495, 6530 |
| 105 | OTP Sign-In API | 6630 |
| 115 | Passkey Sign-In API and Backoffice | 6630 |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | 6185 |
| 050a | GraphQL xCatalog | 6251 |
| 061 | Search Indexing Admin | 6700 |
| 061b | Search Indexation Jobs | 6700 |
| 026 | Customer Contacts | 6698 |
| 064 | CSV Import Export | 6663, 6664 |
| 051 | Catalog Admin Products | 6665 |
| 053 | Catalog Admin Categories | 6665 |
| 020b | Platform Admin Shell — Classic theme | 6338, 6756 |
| 102 | UCP Agentic Commerce | 6155 |
| 094 | UCP Observability | 6155, VCST-4717 (telemetry) |
| 050m3 | GraphQL xAPI — Sales Rep Customer Activity & Insights | 6647 |

### 5.2 Coverage Gaps — New Test Cases Needed

> 33 gaps from the Step 6c checklist diff (Critical/High domains) and the ticket ACs. `none` = no suite holds it today.

| Gap | Ticket | Gap description | Target suite(s) | Owner |
|-----|--------|-----------------|-----------------|-------|
| GAP-01 | VCST-6597 | MFA policy per store (everyone / off / admin-managed per customer and organization / user-chosen): the storefront Security page and Company info controls that set the email-code requirement are not exercised; suite 111 covers only the StoreMode on/off sign-in path (BL-AUTH-016 org context, ECL-4) | 111, 006, 033 | qa-frontend-expert |
| GAP-02 | VCST-6597 | Policy outcomes at sign-in: an organization-level and a customer-level setting decide whether the code step appears; a change by the org maintainer takes effect at the member's next sign-in, and a member without the maintainer role cannot reach the control | 111, 104 | qa-frontend-expert |
| GAP-03 | VCST-6630 | OTP (email-code) sign-in on an account whose password has expired must open the storefront with no forced change-password step (BL-AUTH-018); passkey is covered by PKS-022, OTP has no equivalent row | 104 | qa-frontend-expert |
| GAP-04 | VCST-6669 | Forced change-password after a password sign-in (account flagged password-expired): the storefront /change-password path has no case in 031/032; the 500 was reported on the back-office login, so confirm what the storefront shows | 031, 032 | qa-frontend-expert |
| GAP-05 | VCST-6599, VCST-6600 | Security page passkey rows: each Edit/Delete button name includes the key name; keyboard focus lands on a defined element after Add passkey and after Delete then OK (BL-A11Y-001, BL-A11Y-002); 114 has no focus or accessible-name assertion | 114, 045 | qa-frontend-expert |
| GAP-06 | VCST-6504 | Six-box code input (OTP and MFA code step): box border meets 3:1 non-text contrast in light and dark theme (BL-A11Y-003) | 045, 104, 111 | qa-frontend-expert |
| GAP-07 | VCST-6215, VCST-5994 | Required asterisk kept out of the accessible name, aria-required on VcInput, aria-invalid plus linked message on VcCheckbox, VcTextarea and date-range fields (BL-A11Y-002, BL-A11Y-004); 045 has generic form-label and error rows only | 045, 031 | qa-frontend-expert |
| GAP-08 | VCST-6079 | Watermelon preset: keyboard focus ring is visibly distinct from the invalid-field colour on a focused and on an invalid field (BL-A11Y-003, BL-WL-001) | 071, 070 | qa-frontend-expert |
| GAP-09 | VCST-6232 | Shape and typography tokens (radius, shadow, font family, size, line height) drive the whole storefront; switching preset must not change layout of header, PDP, cart, account (BL-UI-001, BL-UI-003) | 048c, 070, 071 | qa-frontend-expert |
| GAP-10 | VCST-6289, VCST-6529 | VcWidget classic (default) vs soft vs nested/seamless mode on PDP, cart and account; classic must look unchanged; CSS layer order must not let a plugin style lose to the base (BL-UI-002, BL-UI-004) | 070, 048c, 042 | qa-frontend-expert |
| GAP-11 | VCST-6662 | Field labels in one form share size and colour across VcInput, VcSelect and VcTextarea (Sales Rep Hub modals, Schedule call, Edit task) (BL-UI-002, BL-UI-005) | 048c, 106 | qa-frontend-expert |
| GAP-12 | VCST-3632 | Header notification and cart badges at large counts: 99+ on desktop, dot on mobile, no overlap in pl, pt, es, ru (BL-UI-004, ECL-7) | 046, 048c | qa-frontend-expert |
| GAP-13 | VCST-6157 | Tasks by customer: Customer column on /company/tasks, Customers/Status/Priorities filters combine, filtering by one served customer shows only that customer's tasks, empty state when none match (BL-SR-012); suite 106 has no Customer column or filter row | 106 | qa-frontend-expert |
| GAP-14 | VCST-6701, VCST-6702 | Tasks page layout: Customer column readable at 1280 px (customers sharing a prefix distinguishable); filter row wraps at 768-898 px with Priorities fully visible and no sideways scroll (BL-UI-004, BL-UI-006) | 106, 048c | qa-frontend-expert |
| GAP-15 | VCST-6158 | Promo codes, coupons and vouchers widget on the Sales Rep Customer page: compact layout, lists only that customer's coupons, empty state, widget exposed to plugins; 091c covers the page and the full layout | 091c, 091 | qa-frontend-expert |
| GAP-16 | VCST-6647 | Report body extracted as one component: the Reporting page and the customer-profile block render the same figures for the same rep, customer and period (BL-SR-001, BL-SR-004) | 091, 112, 093 | qa-frontend-expert |
| GAP-17 | VCST-6451 | Header Sales Rep Hub icon: visible only to the Sales Rep role, opens the Dashboard in one click from any storefront page, absent for buyer and anonymous (BL-SR-011); the linked PR is not in this plan's input | 093, 033 | qa-frontend-expert |
| GAP-18 | VCST-6205, VCST-6197, VCST-6196, VCST-6195 | Sales Rep layout regressions: 320 px all-blocks-hidden empty state, 375 px Filters drawer re-open scroll, custom date filter label after language switch or cold load, chip removal vs drawer state (BL-SR-012, BL-SR-013, BL-UI-004) | 093, 097 | qa-frontend-expert |
| GAP-19 | VCST-6078 | Live-data account dashboard (#2552, #2653): recent-order status chips, statuses in Edit layout, focus ring on a stat card; the ticket is not Done but the PR merged, suite 118 covers it | 118, 093 | qa-frontend-expert |
| GAP-20 | VCST-6698 | Address Line1/Line2 up to the 2048 limit: saving a long personal and company address succeeds and displays without clipping in address list, ship-to popup and checkout (BL-UI-004); storefront layer only | 081, 011, 006, 048c | qa-frontend-expert |
| GAP-21 | VCST-4857 | Removed deprecated address composables: the migration touched account, company, quotes and ship-to; regression walk of address add/edit/delete/select on each surface | 081, 006, 015, 011 | qa-frontend-expert |
| GAP-22 | VCST-6375 | Cart "Price per item" shows the same value at desktop and at narrow width for a line with a promotion whose "Round amount per item" is unchecked (BL-CART-003); no row in 028 compares the two layouts | 028, 048c | qa-frontend-expert |
| GAP-23 | VCST-6374, VCST-5711 | Cart accessible names: select-all and per-line checkboxes, billing checkbox, delivery/payment selectors, placeholder image alt (BL-A11Y-002, BL-A11Y-004) | 028, 045 | qa-frontend-expert |
| GAP-24 | VCST-6185 | mergeCart authorization (BL-CART-016): signing in with an anonymous cart merges only the caller's own cart; the xAPI mutation check itself is in the module PR (not fetched, --frontend) | 030, 029 | qa-frontend-expert |
| GAP-25 | VCST-6253, VCST-6254 | A late category load keeps the URL of the page on screen after navigating away; removing the search scope chip returns focus to the search input (BL-SRCH-004, BL-A11Y-001) | 001, 004 | qa-frontend-expert |
| GAP-26 | VCST-5938 | Compare page does not freeze at the compact-header threshold with many products and during resize (BL-UI-003) | 098 | qa-frontend-expert |
| GAP-27 | VCST-6099 | GA view_item_list on /search reports a search list, not category "undefined" (BL-GA4) | 043 | qa-frontend-expert |
| GAP-28 | VCST-6477 | Pickup location search with a keyword containing an apostrophe or ampersand returns only matching locations on the cart and product pickers | 036 | qa-frontend-expert |
| GAP-29 | VCST-6652, VCST-6288, #2647 | /company/members table fits its card at 1024-1106 px; Company info loads with no console error for a maintainer with no logo and when the organization becomes null (#2647 has no ticket) | 008, 006, 011b, 048c | qa-frontend-expert |
| GAP-30 | VCST-6143, VCST-6142 | Mission progress bars expose role progressbar and values; completed-mission check icon meets 3:1 over its overlay in light and dark (BL-A11Y-003, BL-A11Y-004) | 083c, 045 | qa-frontend-expert |
| GAP-31 | VCST-6564 | Google Maps and Firebase moved to a company-owned Google Cloud account: address autocomplete / map and push-notification registration have no storefront suite (only search autocomplete rows exist), uncovered surface | none | test-management-specialist |
| GAP-32 | VCST-6136 | [Next] Select Organization Menu is a vc-frontend-next story: its design is not vc-frontend's, so existing 006/033 cases must not be edited to match it; needs its own cases if Next is in scope | none | test-management-specialist |
| GAP-33 | VCST-6763, VCST-6737, VCST-6733 | Dependency upgrades (vitest 4, vulnerable npm advisories, lockfile restore): no storefront behaviour to assert; build/start and the smoke path are the only observable canary | 042, 048c | qa-frontend-expert |

### 5.3 Exploratory Charters (discovery — what the suites cannot assert)

> 5 charters × 30 min. Lane: any free browser slot (firefox included since 2026-09-08, `.claude/rules/agents.md`). Run isolated from the regression pool (3 lanes total). Run with `/qa-exploratory sprint`.

| ID | Domain | Signals | Mission | Candidate scenarios | Technique | Lane | Owner |
|----|--------|---------|---------|---------------------|-----------|------|-------|
| EXP-01 | Cart, checkout & addresses | C1, C2 | Discover what breaks when the sprint's cart/address changes meet in one buyer session, and whether address autocomplete, maps and push registration still work after the Google Cloud account move (GAP-31, no suite); suites 028/081/011 assert each change alone. | 1. A long Line1/Line2 address saved in the ship-to popup, then shown in checkout and an order, at desktop and 375 px (GAP-20, GAP-21) 2. A promo line with "Round amount per item" unchecked: price per item across the narrow breakpoint while the checkbox names are read by a screen reader (GAP-22, GAP-23) 3. Anonymous cart then sign-in merge, then address autocomplete and map on a new address (GAP-24, GAP-31) | Feature-pair matrix + Soap Opera | playwright-chrome | qa-frontend-expert |
| EXP-02 | Authentication — MFA, passkeys, OTP & password policy | C2 | Discover seams between MFA per-store policy and the three sign-in methods (password, OTP, passkey) with an expired password, a forced change and an org fallback; suites 104/111/114/114a/114b each hold one method and no policy permutation. | 1. Policy changed by an org maintainer while a member is on the code step (GAP-01, GAP-02) 2. Expired-password account through OTP, passkey and password with MFA on and off, ending on the right page each time (GAP-03, GAP-04) 3. Passkey add/delete on the Security page by keyboard only, then sign-out and sign-in in a second tab (GAP-05) | State transitions + Boundary-of-features | playwright-edge | qa-frontend-expert |
| EXP-03 | Storefront UI kit, design tokens, a11y & i18n (Bridge) | C2 | Discover pages where the token, soft VcWidget, CSS-layer and form-a11y changes interact: a preset, a widget mode and a long locale together; 048c/070/071 check layout per feature, not their combination. | 1. Each preset (incl. Watermelon) x classic/soft widget on PDP, cart, account dashboard: radius, focus ring vs error colour, overflow (GAP-08, GAP-09, GAP-10) 2. Required and invalid fields under pl/ru with a keyboard-only walk: label size/colour parity and announced error state (GAP-07, GAP-11) 3. Header badge at large counts in pl/pt/es/ru at 1024 and 375 px with the soft design (GAP-12) | Galumphing + Feature-pair matrix | playwright-firefox | qa-testing-expert |
| EXP-04 | Sales Rep hub | C2 | Discover seams in the Sales Rep Hub after two stories, a header link, a report component and six layout fixes landed together: the Tasks customer filter, coupons widget, customer-profile report and dashboard layout share one rep session. | 1. Rep opens the hub from the new header icon, filters Tasks by customer, schedules a call, then opens that customer's profile report and coupons at 768 and 320 px (GAP-13, GAP-14, GAP-16, GAP-17) 2. Edit layout hides every block, reload, language switch, then the Customers/Status/Priorities row is checked for raw keys (GAP-18) 3. A rep who loses a served customer mid-session: Tasks, coupons and report on the same page (GAP-13, GAP-15, GAP-16) | Soap Opera + Boundary-of-features | playwright-chrome | qa-frontend-expert |
| EXP-05 | Catalog, search, compare & analytics | C4 | Probe the P0 browse path (I=5) where several navigation-race and focus fixes landed with a low likelihood score and no combined test: category load race, search scope chip, compare freeze, GA payload. | 1. Click through three categories quickly and use Back while the first loads; URL vs page on screen (GAP-25) 2. Add a scope chip, remove it by keyboard, search with an apostrophe in the term, compare 4 products and resize (GAP-25, GAP-26, GAP-28) 3. Same session: GA view_item_list on /search and category pages after each step (GAP-27) | Saboteur + Galumphing | playwright-edge | qa-frontend-expert |

**Not chartered (and why):** Company & organization — No C signal (L=3, I=4, no gap without a suite, no seam); members table, company-info error and select-organization fixes are assertable, so they go to GAP-29 and section 6; Storefront dependencies & build (security upgrades) — D1 exact oracle and no UI surface: npm advisory, lockfile and vitest changes are checked by the build and the smoke path (GAP-33); a charter has nothing to explore; Platform, MCP & back office (no storefront wave) — D2 no storefront QA surface under --frontend; back-office items go to section 6 Backend rows only; VCST-6136 [Next] Select Organization Menu — D2 separate theme (vc-frontend-next), design not in this repo; GAP-32; VCST-6468 block !important in CI — D1 CI gate, not a storefront behaviour; nothing to run.

---

## 6. New Test Cases Needed (Per Ticket)

> 33 rows, **70-101** new cases estimated. Counts and targets only: the cases are written per ticket with `/qa-test-cases-generator` or `/qa-test`. Proposed new suite: Frontend/cross-cutting: third-party map and push services smoke (address autocomplete / Google Maps, Firebase push registration) for VCST-6564, GAP-31; P2, about 2 cases; needs a decision on whether the QA stand keys allow it.

| Ticket | Layers | Case type | Count | Target suite | Technique |
|--------|--------|-----------|-------|--------------|-----------|
| VCST-6597 | Storefront UI | Positive + negative + state-transition | 6 | 111 (policy cases), 006 (Company info toggle), 033 (Security page entry) | Decision table (mode x role x level) + State transitions |
| VCST-6630 | Storefront UI | Negative / security | 2 | 104 | Decision table (method x expired) |
| VCST-6669 | Storefront UI | Negative | 2 | 031 | Error guessing + BVA |
| VCST-6599, VCST-6600 | Storefront UI | Accessibility | 3 | 114 | Error guessing (focus order) |
| VCST-6504 | Storefront UI | Accessibility (contrast) | 2 | 045 | BVA (3:1 threshold) |
| VCST-6215, VCST-5994 | Storefront UI | Accessibility | 4 | 045 | Equivalence partitioning (control types) |
| VCST-6079 | Storefront UI | Visual / accessibility | 2 | 071 | Decision table (preset x state) |
| VCST-6232 | Storefront UI | Layout stability | 3 | 048c | Classification tree (preset x page) |
| VCST-6289, VCST-6529 | Storefront UI | Visual / layout | 3 | 070 | Pairwise (mode x page) |
| VCST-6662 | Storefront UI | Visual | 2 | 048c | Equivalence partitioning (control types) |
| VCST-3632 | Storefront UI | Layout / i18n | 2 | 046 | BVA (99 / 100) + locale partitions |
| VCST-6157 | Storefront UI | Positive + negative + empty state | 4 | 106 | Pairwise (3 filters) |
| VCST-6701, VCST-6702 | Storefront UI | Layout | 3 | 106 | BVA (viewport widths) |
| VCST-6158 | Storefront UI | Positive + empty state | 3 | 091c | Equivalence partitioning |
| VCST-6647 | Storefront UI + GraphQL reconciliation | Cross-surface consistency | 2 | 112 | Flow coverage |
| VCST-6451 | Storefront UI | Positive + RBAC negative | 3 | 093 | Decision table (role) |
| VCST-6205, VCST-6197, VCST-6196, VCST-6195 | Storefront UI | Regression (layout, i18n, state) | 4 | 093 (6205), 097 (6197, 6196, 6195) | BVA (320/375) + State transitions |
| VCST-6078 | Storefront UI | Positive + empty state | 3 | 118 | Equivalence partitioning |
| VCST-6698 | Storefront UI (+ GraphQL round-trip) | BVA | 3 | 081, 011 | BVA (127/128/2048/2049) |
| VCST-4857 | Storefront UI | Regression | 3 | 081, 006, 015 | Flow coverage |
| VCST-6375 | Storefront UI | Cross-viewport consistency | 2 | 028 | Decision table (rounding x viewport) |
| VCST-6374, VCST-5711 | Storefront UI | Accessibility | 3 | 028, 045 | Equivalence partitioning |
| VCST-6185 | Storefront UI (+ xAPI, module repo) | Security negative | 1 | 029 | Error guessing |
| VCST-6253, VCST-6254 | Storefront UI | Race + accessibility | 3 | 001, 004 | Error guessing (timing, focus) |
| VCST-5938 | Storefront UI | Performance / stability | 1 | 098 | BVA (header threshold) |
| VCST-6099 | Storefront UI + network | Analytics payload | 1 | 043 | Equivalence partitioning |
| VCST-6477 | Storefront UI | Negative (special characters) | 2 | 036 | Error guessing + EP |
| VCST-6652, VCST-6288, #2647 | Storefront UI | Layout + console | 3 | 008, 006, 011b | BVA (viewport) + Error guessing |
| VCST-6143, VCST-6142 | Storefront UI | Accessibility | 2 | 083c | EP + BVA (3:1) |
| VCST-6564 | Storefront UI | Smoke of third-party services | 2 | proposed new suite (see proposedNewSuites) | Flow coverage |
| VCST-6641, VCST-6155 | Admin SPA + REST (back office) | Positive + RBAC negative | 3 | Backend/platform (existing OAuth applications / MCP coverage; confirm ids in module-suite-map) | Decision table (client type x scope) |
| VCST-6665, VCST-6664, VCST-6663 | Admin UI (catalog, CSV import) | Negative + data integrity | 4 | Backend/catalog and Backend/import-export (existing) | Error guessing + State transitions |
| VCST-6703, VCST-6593 | Admin UI | Validation + accessibility | 2 | Backend/platform (existing) | Equivalence partitioning |

### 6c — Checklist diff (Critical / High domains only)

| Domain | Checklist items compared | → §5.2 | → §5.3 | Note |
|--------|--------------------------|--------|--------|------|
| Authentication — MFA, passkeys, OTP & password policy | about 18 (checklist 1 Auth, 28 Security, 25 account password rows) vs 031/032/033/104/111/114/114a/114b/082 | 5 | 3 | Policy modes, expired-password via OTP, forced change, passkey a11y go to gaps; concurrent sessions during a policy change and lockout vs MFA step go to EXP-02 |
| Storefront UI kit, design tokens, a11y & i18n (Bridge) | about 17 (checklist 29 Accessibility, 22 Localization) vs 045/046/048c/070/071 | 7 | 3 | Specific a11y attributes and badge/label rows go to gaps; the preset x widget x locale combination goes to EXP-03 |
| Sales Rep hub | 16 (checklist 35) vs 089/090/091/091c/093/093b/097/106/112 | 6 | 3 | Tasks customer filter, header link, report component go to gaps; served-customer change mid-session and hidden-layout reload go to EXP-04 |
| Cart, checkout & addresses | about 30 (checklist 5 Add to Cart, 8 Cart/Checkout) vs 028/029/011/013/081 | 6 | 3 | Price-per-item parity, checkbox names, address length and composable regression go to gaps; merge + autocomplete session goes to EXP-01 |
| Catalog, search, compare & analytics | about 24 (checklist 2 Catalog, 6 Search, 15 PDP, 16 GA) vs 001/002/004/005/098/043 | 5 | 2 | Race and focus fixes go to gaps; rapid navigation + scope chip combination goes to EXP-05 |
| Company & organization | about 18 (checklist 11 Company Info, 12 Members) vs 006/008/011b/033 | 2 | 0 | Members table overflow and company-info console error go to gaps; no charter (no C signal) |
| Storefront dependencies & build (security upgrades) | 0, no domain checklist exists | 1 | 0 | Build tooling only; smoke 042 is the canary (GAP-33) |
| Platform, MCP & back office (no storefront wave) | 0 under --frontend (backend-admin checklist not walked) | 0 | 0 | Back office handled by section 6 Backend rows; a Backend gap-diff belongs to a --with-backend plan |

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

1. **W0 green** on the deployed build: `042` passes on theme `2.62.0-alpha.2642` + Platform 3.1097.0 + Xapi `3.1031.0-pr-70-108f`. A red W0 stops every wave.
2. **Build recorded:** each wave's `report.md` names the theme alpha and the Xapi build it ran on. If a newer green alpha is deployed during the freeze, `--update` the plan before the next wave starts.
3. **Sign-in settings:** `MultiFactorAuthentication` and `OtpSignIn.Enabled` are at their defaults (off) before W1–W6. Only WX changes them — and, since the 2026-11-12 update, the other env-wide settings in `PLAN.md` §WX — and it restores each in Cleanup.
4. **Fixtures seeded** per §8, by the owner of the wave that consumes them, before the wave starts.
5. **Personas per owner:** two owners never sign in as the same account (contract §7.1); each wave's `state.json` names its personas.

### 7.2 Exit Criteria

1. Every wave is `TRIAGED` or `DONE`, with `untriaged = 0`.
2. No open Critical or High bug against a Critical domain (§3) without a decision recorded in the ledger.
3. Every `NOT_DEPLOYED` case (6079, 6078, 6698 front end, 6253, 6254) is either re-run on a deployed green alpha or carried to the next sprint in the ledger.
4. The VCST-4717 pair (Xapi x-api#70 + ApplicationInsights 3.1007.0) is noted as a PR build in the release record; a GraphQL failure on it is triaged against x-api#70 before it is filed against another module.

---

## 8. Test Data Requirements

| Need | Source | Wave |
|------|--------|------|
| Sales Rep fixtures (reps, customers, coupons, tasks) | `npm run seed:sales-rep`; tasks are wall-clock relative: `TEST_ENV=vcst npm run seed:sales-rep-tasks` before each 106 run (decays at local midnight) | W2 |
| Buyer accounts with addresses (account, company, checkout) | `@td()` personas from `config.js` (USER, ORG_USER, MULTI_ORG) | W3, W5 |
| Second cart owned by another buyer (6185 divergent pair) | `random-data` + live-discover at run time | W3 |
| Organization with a maintainer and many members (6652, 6288) | existing B2B org fixtures (`test-data/`, `@td()`) | W5 |
| Loyalty missions fixtures | `seed-loyalty-missions-e2e` family | W6 |
| Expired-password account (6630, 6669) | created in the case via `POST users/create` with `passwordExpired`, deleted in Cleanup (FIFTH RULE) | W1, WX |
| Passkey virtual authenticator | WebAuthn virtual authenticator in the browser lane (114 notes) | WX |
| Pickup locations with `'` and `&` in names (6477) | live-discover; create in the case if absent | W3 |

Never assert exact prices, IDs or order numbers: resolve through `@td()` / live-discover (`.claude/rules/test-data.md`).

---

## 9. Schedule and Milestones

| Date | Milestone |
|------|-----------|
| 2026-11-11 | Plan drafted; waves written to `regression/releases/sprint-26-22/` |
| 2026-11-12 | W0 smoke gate on the deployed build |
| 2026-11-12 – 2026-11-14 | W1–W6 in parallel, one owner each |
| 2026-11-14 | WX exclusive window (sign-in settings), one owner, alone |
| 2026-11-16 | Sprint close: `--update` for late Done items and any newer green alpha |
| 2026-11-17 – 2026-11-20 | Triage closed, ledger `DONE`, release PR merged |

---

## 10. Resources — QA Agent Assignments

| Wave | Domain | Agent | Lane |
|------|--------|-------|------|
| W0 | Smoke gate | `test-runner-agent` via `/qa-run` | `playwright-chrome` |
| W1 | Auth | `qa-frontend-expert` | `playwright-chrome` |
| W2 | Sales Rep hub | `qa-frontend-expert` | `playwright-chrome` / `playwright-edge` |
| W3 | Cart, checkout & addresses | `qa-frontend-expert` | `playwright-edge` |
| W4 | Catalog, search, compare & GA | `qa-frontend-expert` | `playwright-firefox` |
| W5 | Company & organization | `qa-frontend-expert` | `playwright-chrome` |
| W6 | UI kit, a11y & i18n | `vc-test:ui-ux-expert` + `qa-testing-expert` | `playwright-firefox` / `playwright-edge` |
| WX | Sign-in settings window | `qa-backend-expert` (settings) + `qa-frontend-expert` | `playwright-edge` |
| §5.3 charters | Exploratory | `qa-testing-expert` | any free lane, isolated from the regression pool |

At most three browser agents at once across all owners on one machine (`.claude/rules/agents.md`).

---

## 11. JIRA Ticket Coverage Matrix

Every test-relevant Done ticket, the suite that covers it, and whether §6 adds cases. Back-office tickets point at §5.1.2 suites, which are not waved.

| Key | Type | Domain | Frontend suites (wave) | Backend suites (not waved) | Gaps | New cases | Note |
|-----|------|--------|------------------------|----------------------------|------|-----------|------|
| VCST-6763 | Task | Storefront | 042 | — | — | 0 |  |
| VCST-6756 | Bug | Platform | — | 020b | — | 0 |  |
| VCST-6737 | Task | Storefront | 042 | — | — | 0 |  |
| VCST-6733 | Task | Storefront | — | — | — | 0 |  |
| VCST-6703 | Bug | Authentication | — | — | — | 2 |  |
| VCST-6702 | Bug | Sales | 106 | — | — | 3 |  |
| VCST-6701 | Bug | Sales | 106 | — | — | 3 |  |
| VCST-6700 | Bug | Catalog | 004 | 061, 061b | — | 0 |  |
| VCST-6698 | Bug | Cart | 011, 081 | 026 | GAP-20 | 3 | front end NOT_DEPLOYED on alpha.2642 |
| VCST-6669 | Bug | Authentication | 031 | — | GAP-04 | 2 |  |
| VCST-6665 | Bug | Platform | — | 051, 053 | — | 4 |  |
| VCST-6664 | Bug | Platform | — | 064 | — | 4 |  |
| VCST-6663 | Bug | Platform | — | 064 | — | 4 |  |
| VCST-6662 | Bug | Storefront | 071 | — | GAP-11 | 2 |  |
| VCST-6652 | Bug | Company | 008 | — | — | 3 |  |
| VCST-6647 | Task | Sales | 093b, 112 | 050m3 | GAP-16 | 2 |  |
| VCST-6641 | Story | Platform | — | — | — | 3 |  |
| VCST-6630 | Bug | Authentication | 031, 104, 114, 114b | 105, 115 | GAP-03 | 2 |  |
| VCST-6600 | Bug | Authentication | 045, 114 | — | — | 3 |  |
| VCST-6599 | Bug | Authentication | 045, 114 | — | — | 3 |  |
| VCST-6597 | Story | Authentication | 033, 082, 104, 111, 114a | 110 | GAP-01, GAP-02 | 6 |  |
| VCST-6593 | Bug | Authentication | — | — | — | 2 |  |
| VCST-6564 | Task | Cart | 036 | — | GAP-31 | 2 |  |
| VCST-6537 | Bug | Platform | — | — | — | 0 |  |
| VCST-6530 | Bug | Authentication | 032, 044 | 110 | — | 0 |  |
| VCST-6529 | Task | Storefront | 048c | — | — | 3 |  |
| VCST-6504 | Bug | Authentication | 031 | — | GAP-06 | 2 |  |
| VCST-6495 | Task | Authentication | 032, 044, 111 | 110 | — | 0 |  |
| VCST-6477 | Bug | Catalog | 036 | — | GAP-28 | 2 |  |
| VCST-6468 | Task | Storefront | 048c | — | — | 0 |  |
| VCST-6451 | Story | Sales | 090, 093 | — | GAP-17 | 3 |  |
| VCST-6375 | Bug | Cart | 028, 015 | — | GAP-22 | 2 |  |
| VCST-6374 | Bug | Cart | 028, 029, 045 | — | — | 3 |  |
| VCST-6338 | Story | Platform | — | 020b | — | 0 |  |
| VCST-6289 | Task | Storefront | 048c | — | — | 3 |  |
| VCST-6288 | Bug | Company | 006 | — | — | 3 |  |
| VCST-6254 | Bug | Catalog | 004 | — | — | 3 | front end NOT_DEPLOYED on alpha.2642 |
| VCST-6253 | Bug | Catalog | 001, 002 | — | — | 3 | front end NOT_DEPLOYED on alpha.2642 |
| VCST-6251 | Bug | Catalog | 044, 004, 005 | 050a | — | 0 |  |
| VCST-6232 | Task | Storefront | 048c, 070, 071 | — | GAP-09 | 3 |  |
| VCST-6215 | Bug | Storefront | 045 | — | — | 4 |  |
| VCST-6205 | Bug | Sales | 093 | — | — | 4 |  |
| VCST-6197 | Bug | Sales | 097 | — | — | 4 |  |
| VCST-6196 | Bug | Sales | 097, 046 | — | — | 4 |  |
| VCST-6195 | Bug | Sales | 097 | — | — | 4 |  |
| VCST-6185 | Bug | Cart | 044, 030 | 050b3 | GAP-24 | 1 |  |
| VCST-6158 | Story | Sales | 089, 091, 091c, 093b | — | GAP-15 | 3 |  |
| VCST-6157 | Story | Sales | 089, 091, 106 | — | GAP-13 | 4 |  |
| VCST-6155 | Story | Platform | — | 102 | — | 3 |  |
| VCST-6143 | Bug | Storefront | 083c | — | — | 2 |  |
| VCST-6142 | Bug | Storefront | 083c | — | — | 2 |  |
| VCST-6136 | Story | Company | — | — | GAP-32 | 0 | vc-frontend-next — not on vcst |
| VCST-6099 | Bug | Catalog | 043 | — | GAP-27 | 1 |  |
| VCST-6079 | Story | Storefront | 070 | — | GAP-08 | 2 | front end NOT_DEPLOYED on alpha.2642 |
| VCST-5994 | Story | Storefront | 045 | — | — | 4 |  |
| VCST-5938 | Bug | Catalog | 098 | — | GAP-26 | 1 |  |
| VCST-5816 | Bug | Platform | — | — | — | 0 |  |
| VCST-5711 | Bug | Cart | 011, 045 | — | — | 3 |  |
| VCST-4857 | Task | Cart | 011, 013, 081, 015, 006, 011b | — | GAP-21 | 3 |  |
| VCST-3632 | Task | Storefront | 033, 046 | — | GAP-12 | 2 |  |

**Coverage summary:** 60 test-relevant tickets; 54 reach at least one activated suite; 6 reach none and rely on §5.2/§6 only: VCST-6733, VCST-6703, VCST-6641, VCST-6593, VCST-6537, VCST-5816.

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

| Ticket | Storefront | API / xAPI | Back office | Check |
|--------|-----------|------------|-------------|-------|
| VCST-6597 MFA policy per store | account security + company page | `/connect/token`, `me` | store MFA policy | Each policy owner (admin / org / customer) asks for the code exactly where it should, on storefront and token endpoint |
| VCST-6495 / 6530 MFA token bypass | sign-in | `/connect/token` without `storeId`, with another store, `StoreMode=Disabled` | — | No token without the code in any variant; a legitimate token still issued |
| VCST-6630 / 6669 expired password | sign-in by passkey, OTP, password | token grants | user with `passwordExpired` | Forced change page, no 500, then sign-in works |
| VCST-6185 mergeCart access | cart after sign-in | `mergeCart` with own / foreign `SecondCartId` | — | Own cart merges; a foreign one is refused |
| VCST-6698 address length | address forms (**front end not deployed**) | customer + cart + order address > 128 | contact address | The API accepts > 128 on all three; the form limit is checked after the deploy |
| VCST-6158 Promo & Coupons | coupon card in the hub (plugin) | `/graphql/sales-rep` | promotions | The rep sees the customer's coupons; a non-rep does not |
| VCST-6251 term filter scope | search with a filter | `products` with caller terms | — | A caller's term never widens the store scope |
| VCST-4717 telemetry (PR build) | any GraphQL page | `/graphql` | App Insights | GraphQL answers; requests reach App Insights with the expected names |

---

## 13. References

- `vc-frontend` PRs merged in the window: #2615, #2608, #2612, #2600, #2631, #2624, #2424, #2596, #2632, #2636, #2622, #2638, #2637, #2613, #2586, #2643, #2620, #2640, #2641, #2644, #2647, #2629, #2587, #2623, #2590, #2591, #2588, #2650, #2646, #2651, #2657, #2652, #2653, #2552, #2642, #2633, #2634.
- Deploy: vc-deploy-dev#7094 (env upgrade, 2026-11-11), vc-deploy-dev#7095 (Xapi x-api#70 PR build).
- Knowledge: `.claude/knowledge/domain/sitemap.md` (rev 13), `.claude/knowledge/execution/module-suite-map.md`, `bl:extract` per domain, `.claude/knowledge/oracles/e-commerce-edge-cases-library.md`.
- Manifest: `config/test-suites.json`; sizes from `npm run regression:plan`.
- Waves: `regression/releases/sprint-26-22/` (`PLAN.md`, `release.json`, `PROGRESS.md`).
- Previous plan: `docs/Sprint plans/sprint-26-21-test-plan.md`.
