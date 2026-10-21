# Sprint 26-19 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-10-02
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-09-21 – 2026-10-05 *(quoted from the Jira sprint object `VCST Sprint 26-19`, id 2716, board 126)*

> **⚠ This sprint is still OPEN.** Built 2026-10-02, three days before close. **119 of 184** issues are not Done (Story: 11 To do, 6 Ready for test, 5 In review, 5 In progress, 5 On hold, 4 Testing, 3 Draft, 3 Tested, 1 Reopen · Bug: 9 To do, 9 In review, 4 In progress, 4 Ready for test, 2 Tested, plus 5 others · Task: 17 To do, 10 In progress, 3 In review and 9 others). The scope below is the **Done** set. Re-run `/qa-test-plan Sprint26-19` after close to capture the rest.

> **⚠ The deployed module set on `vcst` does not match the sprint's Done set.** These versions were read live from `{BACK_URL}/api/platform/modules` on 2026-10-02:
> - **`VirtoCommerce.Otp` is not installed.** VCST-5748 (OTP sign-in) cannot be tested on `vcst`. Its prior observations were made on `vcptcore_qa1`.
> - **`VirtoCommerce.XCart` is `3.1037.0-pr-141`.** That build predates x-cart **#142** (AutoMapper wave 4), **#143** (obsolete removal) and **#146** (IDistributedLock). So the structural x-cart change this sprint is **not on the QA cart**.
> - Several modules run PR builds: `UCP 3.1007.0-pr-9` (carries VCST-6054/6056), `Loyalty 3.1009.0-pr-18` (VCST-5855/6084), `XCatalog 3.1022.0-pr-113` + `Catalog 3.1046.0-pr-909` (VCST-2945) and `SalesRep 3.1012.0-pr-21`.
>
> "Done" in Jira is not "on QA". **The QA owner will install the missing / current modules on `vcst` later (stated 2026-10-02).** Until then, tickets whose PR is not deployed are `PENDING-DEPLOY`. They are scheduled after the install (§9), and §7.1 blocker 1 re-reads the module list before any verdict. The platform line itself (`3.1073.0`) is no longer the 26-18 pre-release pin to VCST-5378.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-19 (`VCST Sprint 26-19`, Jira sprint id 2716) |
| Date range | 2026-09-21 – 2026-10-05 (quoted from the sprint object; **active** at drafting) |
| Theme | **Sign-in and returns get new front doors, and the commerce core is rewired underneath.** OTP email sign-in, storefront OAuth for authenticated UCP handoffs, and extensible token grants all change `POST /connect/token`. A brand-new storefront Returns module ships with its quantity engine and buyer notifications. Meanwhile three cross-module refactors (AutoMapper wave 4, one `IDistributedLock`, VC00 obsolete removal) touch xAPI, cart, catalog, order and all three search providers at once |
| Done tickets | **65**: 14 Stories, 27 Bugs, 19 Tasks, 1 TechDebt, 3 Spikes, 1 Review task |
| **Of which out of scope** | **28**: 3 `[PoC]` theme-demo stories, 7 `[Agentic QA]` tooling, 3 `vc-shell` framework, 5 QA run activities, 3 vccom, 2 infra/maintenance, 1 client migration, 3 spikes, 1 review task (§2.4) |
| **Test-relevant Done tickets** | **37**: 10 Stories + 22 Bugs + 4 Tasks + 1 TechDebt |
| Merged PRs in `vc-frontend` | **30** in the window. **25 product PRs** land on `dev`. The other 5 are `[PoC]` demo PRs (#2499, #2502, #2503, #2508, #2512) that are **not on `origin/dev`**. One merge/revert pair cancels: #2514 (VCST-6077, Sales Rep tasks design) was reverted by #2535 the same day |
| Merged PRs in modules + platform | **63 VCST-linked** in `vc-module-*` / `vc-platform` across **29 repos**. **55** remain after excluding the CI-only VCST-5414 sweep. Source: an org-wide `is:merged` search for `VCST` in the window, so module PRs with no `VCST` key are only partially captured |
| Org-wide VCST-linked PRs in window | **131** (excluding `vc-frontend`, `vc-content-pages`, `vc-deploy-dev`): `ai-tools` 38 · `vc-modules` 7 · `vc-shell` 6 · `.github` 3 · and the product set above |
| Storefront sitemap | Refreshed to **rev 10** at Step 0. Platform line `3.1066.0-alpha.13384-vcst-5378` → **`3.1073.0`**; products 4,550 → **4,567**; nav categories 53 and `/products-with-options` 7 unchanged. **Only the deterministic axis was applied.** The local `vc-frontend` checkout (`48a9759c` @ 2026-09-24) is behind `origin/dev`, yet its route axis still shows 4 added / 4 removed literals (`/oauth/authorize`, `missions`, the Skyflow `saved-credit-cards` move, the `/account` + `/company` mounts) |

**This sprint's risk is mostly *where* the code ships, not *how much*.** 37 test-relevant tickets is about the
same as 26-18's 36. But seven domains score Critical, against five last sprint, and three of the seven
(auth, the xAPI/cart core, search indexing) are Critical because of refactors with **no acceptance
criteria** or new auth paths. Those are surfaces where a defect shows up as a wrong answer, not an
error. Two of the seven are also partly undeployed on `vcst` (banner). The first job of this plan is to
find out what can be tested here at all.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 10 of 14 Done)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5378 | **High** | Universal Commerce Protocol: **authenticated** user flow. Authenticated UCP handoffs + **storefront OAuth** (`/oauth/authorize` route); the platform gains OAuth resources, storefront login and a distributed-cache handoff store | UCP / Auth | vc-platform #3108, vc-module-ucp #7, vc-frontend #2467 |
| VCST-5628 | **High** | [Support][E2E] Register Returns, step 1: **my own returns**. New storefront `modules/returns` (list, create wizard, details, cancel). xAPI `returns` / `returnableItems` / `createReturn` / `submitReturn` / `cancelReturn`. Quantity engine (Draft holds nothing; Rejected/Cancelled release; partial approval releases the difference; re-validation at Submit and Approve) | Returns | vc-frontend #2488, vc-module-return #26 |
| VCST-5869 | **High** | [a11y] Sales Rep filters drawer announces itself as a dialog but isn't one: Escape doesn't close it, focus never returns. The fix is in the **shared** popover-dialog code | Sales Rep / a11y | vc-frontend #2486 |
| VCST-4933 | **High** | Page Builder: **Shared Components** (authoring + preview resolution) | Page Builder | vc-module-pagebuilder #159, vc-module-x-cms #23, #24, vc-frontend #2410 |
| VCST-5748 | Medium | **One-Time Password sign-in via email**: returning customers only, per-store enable. `grant_type=otp_email` at `/connect/token`; lockout shared with password attempts; own/trusted-store rule; stateless code | Auth & sign-in | vc-module-otp #1 (**new module**), vc-platform #3114, vc-frontend #2477 |
| VCST-4585 | Medium | [Heineken] Make token actions extendable: `GrantTypeHandlerBase` / `AddGrantTypeHandler` for custom grants | Auth & sign-in | vc-platform #3114 (shared with VCST-5748) |
| VCST-5732 | Medium | [E2E] **Sales Rep task management**: a dashboard Tasks widget (create title/description/due date/priority, groups Today/Active/Upcoming/Overdue/Completed, calendar indicators); visible only when the Task module is installed | Sales Rep hub | vc-frontend #2464, vc-module-sales-rep #16 |
| VCST-5883 | Medium | Register Returns, step 2: **buyer notifications** (registered / approved / partially approved / rejected, email + push), decline reasons, buyer culture | Returns | vc-frontend #2500, vc-module-return #27 |
| VCST-5957 | Medium | [Loyalty] Missions and challenges **redesign** | Loyalty Missions | vc-frontend #2524 (merged **2026-10-02**) |
| VCST-2945 | Medium | [E2E] **Barcode scanner-ready product properties**: barcode search setup across catalog, xCatalog and the storefront search layout | Search & catalog | vc-module-catalog #909, vc-module-x-catalog #113, vc-frontend #2501 |

> **VCST-5628's own text contradicts itself, and the test depends on which reading is right.** AC-1 says
> *"Choose source — from an order ONLY!!!"* and the narrative says *"link with past order is
> mandatory"*. Yet the In-scope table specifies a wizard *"from order **and** without order"*, and the
> settings include `Return.AllowOrderlessReturns` and `Return.MaxOrderlessLineQuantity`. These describe
> different products: either an orderless return is a defect, or it is a store-configurable feature.
> **Resolve it in writing with the PO before any orderless-return verdict** (§7.1 blocker 2). Until
> then, a tester will adopt whichever reading the build satisfies.

> **VCST-5748 and VCST-4585 are one platform change** (vc-platform #3114, custom grant-type handlers).
> The observed-behaviour base already holds a *single-observation* entry (`KB-06FE6C8D`, on
> `vcptcore_qa1`): the **same OTP code was accepted twice**, each time issuing a fresh token, which
> matches `ECL-4.3`. That is an open security question on a Done story. It is unconfirmed on `vcst`,
> where the module is not installed (banner).

### 2.2 Bugs Fixed (QA-relevant — 22 of 27 Done)

| Key | Pri | Summary | Domain | PR |
|-----|-----|---------|--------|-----|
| VCST-5933 | **High** | `organizationOrders`: a **locked-out member** can still read the organization's full order history | B2B org authorization | vc-module-x-order #52 |
| VCST-6085 | **High** | OpenSearch provider: an **unlocked index-creation race** shows "0 results" on the storefront (flaky E2E) | Search & indexing | vc-module-open-search #4 |
| VCST-6054 | **High** | UCP does not return **structured inventory errors**, so AI agents misread cart operations | UCP | vc-module-ucp #9 |
| VCST-6045 | **High** | [Support][Innovadis] Asset Library: a large upload is **aborted at 30 s** by the global request timeout, with no UI feedback | Page Builder / Assets | vc-shell #368, vc-module-pagebuilder #163 |
| VCST-6056 | Medium | UCP `create_cart`: the **stock limit is bypassed** by splitting one quantity across several `line_items` | UCP | vc-module-ucp #9 |
| VCST-6083 | Medium | Sales Rep hub: the Document library widget offers **no action for DOC/XLS/ZIP** | Sales Rep hub | vc-frontend #2509 |
| VCST-6005 | Medium | Sales Rep customer-orders cards at **375 px** wrap the Total mid-number | Sales Rep hub | vc-frontend #2525 |
| VCST-6002 | Medium | Sales Rep customer-orders date fields **clip their value** once both are filled | Sales Rep hub | *no PR found* — code path unverified |
| VCST-5870 | Medium | [a11y] Sales Rep hub breadcrumb separators are announced (missing `aria-hidden`); dead hub crumb | Sales Rep hub / a11y | vc-frontend #2491 |
| VCST-5759 | Medium | A sales rep with no first or last name **can't log in** to the storefront | Sales Rep / Auth | vc-module-sales-rep #17 |
| VCST-6028 | Medium | [admin][Sales-rep] **Infinite loop** during organization search | Sales Rep admin | vc-shell #367, vc-module-sales-rep #22 |
| VCST-5855 | Medium | [Missions] save-validation accepts a **negative reward** | Loyalty Missions | vc-module-loyalty #18 |
| VCST-6084 | Medium | [Missions] save-validation accepts **negative goal values** (OrderCount −1, OrderValue −1) | Loyalty Missions | vc-module-loyalty #18 |
| VCST-6029 | Medium | Compare: a long unbroken property value **overflows its cell** | Catalog browse / Compare | vc-frontend #2495 |
| VCST-5483 | Medium | [UI-kit][a11y] VcButton secondary/outline label at **4.05:1** (WCAG AA). The fix raises outline, surface **and** ghost contrast in global styles | UI kit & a11y | vc-frontend #2515 |
| VCST-5681 | Medium | Account sidebar renders **raw i18n keys** for module links | UI kit / i18n | vc-frontend #2496 |
| VCST-6016 | Medium | [Support][Security] **Path traversal** and unbounded recursion in the Assets / Content storage providers | Asset/Content storage security | vc-module-assets #38, vc-module-filesystem-assets #17, vc-module-azureblob-assets #38, vc-module-content #219 |
| VCST-6075 | Medium | `vc-uk-htmleditor`: wrong cursor/line positions until the first edit and after a blade resize | Admin SPA platform | vc-module-core #264 |
| VCST-5484 | Low | [UI-kit][a11y] VcCheckbox/VcRadioButton pointer target 18×18, below 24×24 (WCAG 2.5.8, `BL-UI-006`) | UI kit & a11y | vc-frontend #2516 |
| VCST-5840 | Low | [a11y] Language selector: every flag alt is "English (United States)" | UI kit & a11y | vc-frontend #2513 |
| VCST-6046 | Low | Product card shows "1 variations" (not pluralized) | Catalog browse | vc-frontend #2497 |
| VCST-6086 | Low | [Admin SPA] `setError` throws `TypeError … 'join'` when an error body has no `errors` list, so View details comes up empty | Admin SPA platform | vc-platform #3125 |

> **The Sales Rep surface carries eight Done tickets and one merge/revert pair.** VCST-6077 (*adjust Sales Rep
> Hub tasks design*, #2514) merged on 2026-10-02 and was reverted the same day (#2535, −1,734 lines
> across 45 `modules/sales-rep` files). #2514 also referenced VCST-5732. **Confirm which side of the
> revert `vcst` is serving** before testing the Tasks widget against its design.

### 2.3 TechDebt / Structural (QA-relevant — hot paths, no acceptance criteria)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5662 | **High** | **Replacing AutoMapper, wave 4.** Hand-written mappers replace AutoMapper in five experience-API modules | xAPI / cart core | vc-module-x-api #85, x-cart #142, x-catalog #111, x-order #51, x-pickup #12 |
| VCST-6052 | Medium | **One `IDistributedLock` API** on the platform. Cart locks, XAPI locks, UCP handoff sessions **and index-creation locks in all three search providers** move onto it | xAPI / cart core + Search | vc-platform #3122, x-api #88, x-cart #146, ucp #8, elastic-search-8 #49, elastic-search-9 #16, open-search #5 |
| VCST-5901 | Medium | **Cleanup of VC00 obsoletes before Stable 16.** 13 module PRs remove expired `[Obsolete]` code. Quote-from-cart validation migrates to `CartAggregate.ValidateAsync(string)` | xAPI / cart core | quote #152, x-cart #143, x-api #87, x-catalog #112, order #504, customer #317, marketing #279, profile-experience-api #146, inventory #166, payment #75, assets #39, core #263, catalog #908 |
| VCST-5206 | **High** | Page creation for vccom through skills. The **product** change is in Page Builder: *"git content as source of truth"* plus a `data-test-id` on the permalink prefix (**selector change**) | Page Builder | vc-module-pagebuilder #155, #164, vc-testing-module #196 |
| VCST-5220 | **High** | Sample data: property name `NFC_` → `NFC` (invalid name). **Test-data impact**: any fixture or case asserting the old name breaks | Test data | vc-sample-data #18 |

**The three refactors (`VCST-5662`, `VCST-6052`, `VCST-5901`) are the sprint's least visible high-impact
change.** None has acceptance criteria. Together they touch xCart, xCatalog, xOrder, xPickup, the xAPI
core and Quote. All three search providers also get a new index-creation lock in the same window as the
OpenSearch race fix (VCST-6085). A mapping refactor regresses **silently**: a field that used to be
mapped comes back `null` or default, and the UI renders a plausible blank. The shipped PRs are the
specification, so verdicts here are `{OBSERVED}`-provenance only. Also, per the banner, the x-cart half
is **not deployed** on `vcst`.

### 2.4 Out of Scope

- **`[PoC]` New ECommerce Theme Demo: VCST-6047, VCST-6048, VCST-6050** (all Highest). Demo pages for the paprika/dark themes. Their 5 `vc-frontend` PRs are **not on `origin/dev`**, so they never reach `FRONT_URL`. **D2** in §5.3.
- **`[Agentic QA]` / this repo's tooling: VCST-6103, 6102, 6091** (KB bugs), **VCST-5960** (KB v3 adoption), **VCST-6090** (Test Mind Map + Test Data Model), **VCST-5958** (Teams monitoring), **VCST-5930** (token-consumption review), plus 38 `ai-tools` PRs.
- **`vc-shell` framework: VCST-5785** (Esc leaves the old blade in the URL), **VCST-5746** (AI panel takes Ctrl/Cmd+\\), **VCST-5451** (vc-scheduler component). A separate product (**D2**). *Exception:* VCST-6045 and VCST-6028 are vc-shell fixes whose defect surfaces in an in-scope module (Page Builder Asset Library; Sales Rep admin), so they stay in §2.2.
- **QA run activities: VCST-6039, 5896** (load tests), **VCST-6035, 5695** (smoke on Virtostart), **VCST-5893** (regression on QA, theme only). Executions, not changes.
- **vccom (virtocommerce.com site): VCST-5706** (Story, page version history), **VCST-5846** (image management through LLM), **VCST-5581** (page history from GitHub). The marketing site, not `FRONT_URL`. VCST-5206 is the exception (§2.3) because it changed `vc-module-pagebuilder`.
- **Infra / maintenance: VCST-6126** (`libssl3t64` CVE, `vc-docker` #16), **VCST-5749** (Q3 maintenance), plus the VCST-5414 CI-workflow sweep (~25 repos, workflows only).
- **Client migration: VCST-5694** ([Heineken] DOT storefront migration).
- **Spikes with no shipped code: VCST-5254** (Playwright Python vs TypeScript), **VCST-5979** (Claude Commerce Agents blueprint), **VCST-5643** (sales-rep-hub component inventory).
- **Code Review task: VCST-5290** (x-cart misc refactorings). The task itself has no user-facing change, but its PR **x-cart #128 merged in the window** and is counted in the §3 xAPI/cart core domain.
- **Tested, not Done** (QA evidence already exists; regression context only): VCST-4464 (onX fulfilment adapter, Create Order), VCST-5944 (Push Messages recipients UX), VCST-5728 (shared-wishlist message, `SBTM-VCST-5728-2026-09-29`), VCST-6011 and VCST-6012 (Page Builder Designer clipboard gate + keyboard a11y).
- **Not Done, but live risk this sprint tests around:** VCST-6077 (Sales Rep tasks design, merged then reverted) · VCST-5707 (dialog bottom padding, #2526 merged, ticket not in this sprint) · VCST-5812 (vc-shell blank at 1024 px, #373).

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Auth & sign-in** | 5 | 5 | **25** | Critical | Three changes on **one endpoint**, `POST /connect/token`. VCST-5748 adds a new grant (`otp_email`) and a new module. VCST-4585 makes grant handling **extensible** (#3114). VCST-5378 adds storefront OAuth and a `/oauth/authorize` route (#3108, #2467). VCST-5759 changes rep sign-in validation. The base already records the OTP code being **reusable** (`KB-06FE6C8D`, ECL-4.3). Auth is P0, and a grant-pipeline regression locks out every user, not one |
| **xAPI / cart core (structural)** | 4 | 5 | **20** | Critical | AutoMapper wave 4 (5 modules), one `IDistributedLock` (cart, XAPI, UCP), VC00 obsolete removal (13 modules, including quote-from-cart validation), and x-cart #128 refactors, all in one window. No ACs. The failure mode is a silently unmapped field or a lock that no longer serializes concurrent cart writes. **Partly undeployed on `vcst`** (XCart pr-141) |
| **Search & indexing** | 4 | 5 | **20** | Critical | Index-creation locking changed in **all three** providers (ES8 #49, ES9 #16, OpenSearch #5) right after an index-creation **race fix** (VCST-6085, "0 results"). ES8 request timeouts (#48, unlinked) and the barcode search feature (VCST-2945, 35 frontend files in the search layout) land in the same window. Search is P0, and "0 results" is indistinguishable from "no match" |
| **Sales Rep hub** | 5 | 4 | **20** | Critical | **Eight** Done tickets plus a revert. A new Tasks widget (VCST-5732, 57 files, conditional on the Task module), a shared popover-dialog a11y fix (VCST-5869), the doc-library action (6083), 375 px totals (6005), date-field clipping (6002, no PR found), breadcrumb a11y (5870), rep login (5759) and the admin org-search infinite loop (6028). A design PR on the same module was merged and reverted on 2026-10-02 |
| **Returns** | 4 | 4 | **16** | Critical | A **new storefront module** (77 + 21 files) and a new quantity engine with hold/release semantics, partial approval and **concurrent-return re-validation**, plus four notification types. The base already records a draft accepting an over-limit quantity that only `submitReturn` refuses (`KB-5A6C014E`, **disputed**). **Spec conflict** on orderless returns (§2.1) |
| **UCP / agentic commerce** | 4 | 4 | **16** | Critical | The authenticated buyer flow (VCST-5378) **plus** two inventory bugs, one of which is a **stock-limit bypass** by splitting one quantity across lines (VCST-6056). That is an oversell path for AI-agent carts. The handoff session also moves to `IDistributedLock` (ucp #8) |
| **Loyalty Missions** | 4 | 4 | **16** | Critical | A full missions/challenges **redesign** (VCST-5957, #2524, merged on the plan's own creation day) plus two server-side validation fixes (5855, 6084). The redesign replaces the surface 083c/083d assert by selector and label |
| **B2B org-order authorization** | 3 | 5 | **15** | High | VCST-5933 is a **data-exposure** fix: a locked-out member could read the organization's whole order history through `organizationOrders`. One PR (x-order #52), so likelihood is bounded. Impact is a confidentiality breach on a P1 B2B surface. A verification report already exists (`reports/tickets/Sprint26-19/VCST-5933/`) |
| **UI kit & storefront a11y / i18n** | 3 | 4 | **12** | High | VcButton outline/surface/ghost contrast moves in **global styles** (#2515), and the checkbox/radio pointer target grows to 24×24 (#2516). Every storefront page renders both, so the change is **geometry** as well as colour. Also: language-selector alts (5840), raw i18n keys in the sidebar (5681), and keyboard-reachable clickable rows in checkout/quotes/purchase-requests (#2492, unlinked) |
| **Page Builder & Asset Library** | 5 | 2 | **10** | High | Shared Components (VCST-4933, 4 repos), *"git content as source of truth"* (VCST-5206, #155), a **selector change** on the permalink prefix (#164), and the 30 s upload abort (VCST-6045, a vc-shell interceptor change). Likelihood is high from concurrency; impact is bounded to CMS |
| **Asset / Content storage security** | 3 | 3 | 9 | Medium | VCST-6016 hardens path traversal and unbounded recursion across **four** storage providers. The regression direction is over-restriction: a legitimate nested folder or a dotted filename gets refused |
| **Admin SPA platform** | 3 | 3 | 9 | Medium | `setError` guard (6086) and the htmleditor caret (6075). Small, admin-only, but on shared Admin SPA code paths |
| **Catalog browse / Compare** | 2 | 4 | 8 | Medium | Compare cell overflow (6029) and variations pluralization (6046). Cosmetic/i18n on P1 surfaces |
| *`[PoC]` theme demo · `vc-shell` framework · vccom* | — | — | — | *Out of scope* | §2.4. Not scored; not gaps |

**Seven Critical domains is two more than 26-18, and the reason differs.** 26-18's Criticals were
*concentration* risks (many fixes on one surface). This sprint's are **new-entry-point** and
**no-AC refactor** risks: a new grant, a new OAuth route, a new returns module, and three cross-module
refactors whose specification is their diff. That changes the first move. §4.2 starts by establishing
**what is actually deployed** (banner), because two of the seven Criticals are partly absent from
`vcst`, and a green run against the wrong build is the most expensive outcome available.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-----------|------|--------------|------|-----------|
| Auth & sign-in | ✅ **primary** | ✅ (store OTP setting, sign-in log) | ✅ **primary** (`/connect/token`) | ✅ | ✅ (OTP form) | — |
| xAPI / cart core (structural) | ✅ | — | — | ✅ **primary** | — | — |
| Search & indexing | ✅ **primary** | ✅ (index rebuild, barcode config) | ✅ | ✅ | — | — |
| Sales Rep hub | ✅ **primary** | ✅ (vc-shell rep app, org search) | — | ✅ | ✅ **primary** | — |
| Returns | ✅ **primary** | ✅ (agent approve/reject) | ✅ (`/api/return/*`) | ✅ **primary** | ✅ | — |
| UCP / agentic commerce | — | — | ✅ **primary** (UCP endpoints) | ✅ | — | — |
| Loyalty Missions | ✅ **primary** | ✅ (mission save-validation) | ✅ | ✅ | ✅ | — |
| B2B org-order authorization | ✅ | ✅ (lock the member) | ✅ (`/connect/token`) | ✅ **primary** (`organizationOrders`) | — | — |
| UI kit & a11y / i18n | ✅ **primary** | — | — | — | ✅ **primary** | — |
| Page Builder & Asset Library | ✅ (shared-component render) | ✅ **primary** | — | ✅ (xCMS) | — | — |
| Asset / Content storage security | — | ✅ **primary** | ✅ **primary** | — | — | — |
| Admin SPA platform | — | ✅ **primary** | — | — | — | — |
| Catalog browse / Compare | ✅ **primary** | — | — | ✅ | ✅ | — |

### 4.2 Testing Approach by Priority

**Step zero applies to every domain: read the deployed version, then test.** For each ticket, record the
module version `{BACK_URL}/api/platform/modules` reports, and whether that build contains the ticket's
PR. A ticket whose PR is not deployed is `BLOCKED (not deployed)`, never `PASS` and never `FAIL`.

1. **Auth & sign-in (25): negative paths first, and on the right environment.** OTP is absent on `vcst`,
   so run VCST-5748 on the environment that has it, or record it as BLOCKED here. The cases that matter
   are code reuse (`ECL-4.3`, `KB-06FE6C8D`), shared lockout with password attempts, own/trusted-store
   enforcement, and "returning customers only". Then re-run the **password** grant and impersonation
   unchanged: VCST-4585 made the grant pipeline extensible, and the classic regression is an extension
   point that swallows the built-in grant. Storefront OAuth (`/oauth/authorize`) gets a FLOW pass from
   UCP handoff → authorize → token → back.
2. **xAPI / cart core (20): a field-diff sweep, not a smoke pass.** The refactors replace mapping code.
   The oracle is *the same request returns the same fields* across a representative cart, catalog,
   order and pickup query. Diff responses field-by-field against a pre-refactor capture if one exists
   (prior `REG-*` HARs), and assert non-null on fields the UI renders. Add a **concurrent cart-write**
   check for the lock change (two writers, one cart). Hold the x-cart half until XCart ≥ #146 is
   deployed.
3. **Search & indexing (20): rebuild under load, then read.** Trigger an index rebuild while the
   storefront is being searched. "0 results" during or after the rebuild is the VCST-6085 signature.
   Identify which provider `vcst` actually uses (four are installed) and say so in the verdict. Run
   barcode search (VCST-2945) against both a barcode property and a non-barcode property: that pair is
   the discriminating test.
4. **Sales Rep hub (20): resolve the revert before reading any Tasks result.** Then cover Tasks
   (VCST-5732) as a FLOW (create → group → complete → calendar indicator), including the
   **Task-module-absent** case the ticket names. Re-run the a11y and layout fixes at the viewport each
   names (375 px for 6005/6002). Re-run the shared popover-dialog behaviour (5869) on **every** consumer
   of that dialog, not just the Sales Rep drawer.
5. **Returns (16): the quantity engine is the product.** Ordered / requested / approved / available
   arithmetic is a decision table. Partial approval must **release** the difference. Two buyers in one
   organization returning against the same order must not over-return (concurrency re-validation, typed
   `RETURN_QUANTITY_UNAVAILABLE`). Scope `OWN` vs `ORGANIZATION` is server-enforced. The orderless path
   is blocked on §7.1 blocker 2.
6. **UCP (16) and Loyalty Missions (16).** UCP: the split-line stock bypass (6056) is a BVA on
   Σ line quantities vs stock, and the structured inventory error (6054) is a contract assertion. Missions:
   re-point 083c/083d at the redesign (selectors and labels), then assert the two validation fixes
   **server-side** via the admin save, not just the form.
7. **High (10–15).** VCST-5933: a locked member gets **nothing** from `organizationOrders` while an
   unlocked colleague in the same org still gets the full list (the divergent pair). UI-kit contrast and
   target size as a sibling sweep across cart/checkout/auth. Page Builder shared components:
   author → reuse on two pages → edit once → both update.
8. **Medium (8–9).** Storage-provider path traversal with **legitimate** nested and dotted paths as the
   negative corpus. Admin SPA `setError` with an errors-less body. Compare overflow, pluralization.

**Cross-cutting:** every Critical domain gets a cross-browser pass on two lanes. All three Playwright
lanes are click-capable (firefox since 2026-09-08). HAR capture on every run. Max 3 concurrent browser agents.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Auth & sign-in | **Decision Table** (grant type × account state × store trust) + **State Transition** (code issued → used → reused → expired; failed attempts → lockout) + Error Guessing (`ECL-4.x`) | A grant pipeline is a table of who-may-get-a-token-how. OTP lifetime and lockout are state machines whose wrong transition (reuse after success) is the known suspected defect |
| xAPI / cart core | **Boundary-of-features** (two-path field diff) + EP over entity shapes (simple / variation / configurable / BOPIS line) | A mapping refactor is only caught by comparing the same entity through two paths or two builds. EP picks the shapes most likely to carry an unmapped field |
| Search & indexing | **State Transition** (index absent → creating → ready → rebuilding) + **Divergent pair** (barcode vs non-barcode property) | The race lives in a transition; the barcode feature is only decidable against a property that must *not* match |
| Sales Rep hub | **FLOW** (Tasks lifecycle) + EP (Task module present/absent) + WCAG checklist + BVA at 375 px | One new feature with a conditional mount, plus a cluster of viewport and a11y fixes |
| Returns | **FLOW** first (order → returnable items → draft → submit → approve/partial/reject → notification), then **Decision Table** over the quantity model + concurrency Error Guessing | The quantity formula is a table; the chain spans storefront, xAPI, admin and notifications, and can break at any link while the next still looks fine |
| UCP | **BVA** (Σ split lines vs stock: under, equal, over) + contract assertion on the error shape | VCST-6056 is a boundary that was moved by splitting; VCST-6054 is a contract |
| Loyalty Missions | Visual/selector refresh + **BVA** (goal/reward at −1, 0, 1) | Validation fixes are boundaries; the redesign is a re-point, not a re-author |
| B2B org-order authorization | **Divergent pair** (locked vs unlocked member, same org) + State Transition (lock applied mid-session) | A permission fix is only decidable when a positive control exists in the same data |
| UI kit & a11y / i18n | WCAG 2.2 AA checklist + **BVA** on contrast (4.05 vs 4.5) and target size (18 vs 24) | Measurable criteria; assert tokens, never transcribed px (GOLDEN RULE) |
| Page Builder & Asset Library | State Transition (draft → published → shared-component edit) + BVA on upload size around the timeout | Shared components are a propagation question; the 30 s abort is a boundary in time |
| Asset / Content storage security | Error Guessing (traversal payloads) + **negative EP** (legitimate nested/dotted paths that must survive) | The regression direction of a hardening fix is over-refusal |
| Admin SPA platform | Error Guessing | Single-defect guards |
| Catalog browse / Compare | EP (value length, count 1 vs many) | Pluralization and overflow are partition boundaries |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

Classified by the layer directory each CSV lives under in `config/test-suites.json`, not by Jira component. **All 75 IDs verified present in the manifest (146 suites) and directory-checked: 32 Frontend, 43 Backend.** *(Independently re-verified by the orchestrator: 75/75 present, 32/43 split exact; GAP-01, GAP-02 and GAP-05 greps re-run and confirmed at zero sign-in / route / xAPI-returns matches.)* Every mapping was grounded by grepping the parsed suite rows (all 146 CSVs, full-row text: Steps, Assertions and References). Ticket-key stamps were searched first. A suite named in a ticket's chain with no key stamp is marked "consumer".

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`) — 32

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 042 | Smoke Tests | vc-frontend | VCST-5483/5484/5840 (global styles, shared popovers), VCST-5748 (sign-in on the smoke path) | P0 |
| 044 | Security Tests | vc-frontend | VCST-5748 (lockout shared with password; `SEC-AUTH-003`), VCST-5378 | P0 |
| 031 | Auth Login & Register | vc-frontend, vc-platform | VCST-5748 (OTP), VCST-4585, VCST-5378 (`/oauth/authorize`), VCST-5759 | P1 |
| 032 | Auth Session & RBAC | vc-frontend | VCST-5748 (shared lockout, token lifecycle), VCST-4585 | P1 |
| 033 | Auth Company & Account Menu | vc-frontend | VCST-5681 (sidebar raw i18n keys), VCST-5933 (`AUTH-039` blocked member) | P1 |
| 082 | Auth Impersonation / Login on Behalf | vc-frontend, vc-platform | VCST-4585 (consumer: #3114 touches custom grant-type handlers, and impersonate is a grant) | P1 |
| 011 | Checkout Flow | vc-frontend | VCST-5378 (#2467 touches shared/checkout), VCST-5662/5901 | P1 |
| 012 | Checkout Guest | vc-frontend | VCST-5378 (anonymous → sign-in → return) | P1 |
| 013 | Checkout B2B | vc-frontend | VCST-5662/5901 (x-cart/x-order mapping; `purchaseOrderNumber`) | P1 |
| 014 | Orders Frontend | vc-frontend | VCST-5628 (order → returns entry), VCST-5933 (org "All orders"), VCST-5662 | P1 |
| 014b | Orders Frontend — Returns, Documents & Date Filtering | vc-frontend | VCST-5628/5883. **Stale-risk:** `ORD-037/038/039/040` (Draft) assert a "Return"/"Request Return" button on order detail | P1 |
| 015 | Quotes | vc-module-quote | VCST-5901 (quote-from-cart validation → `CartAggregate.ValidateAsync(string)`, quote #152) | P1 |
| 028 | Cart Core | x-cart | VCST-5662, VCST-5901, VCST-6052 | P1 |
| 029 | Cart Validation & Persistence | x-cart | VCST-5662, VCST-5901 | P1 |
| 030 | Cart Merge | x-cart | VCST-5662, VCST-6052 (distributed cache/lock) | P1 |
| 037 | BOPIS Cart | x-pickup | VCST-5662 (x-pickup #12) | P1 |
| 038 | BOPIS Checkout | x-pickup | VCST-5662 (x-pickup #12) | P1 |
| 004 | Search Core | open-search, elastic-search, x-catalog | VCST-2945 (already stamped), VCST-6085 | P1 |
| 005 | Search Filters & Advanced | open-search, elastic-search | VCST-6085 ("0 results") | P1 |
| 001 | Catalog Navigation | vc-frontend | VCST-6046 (already stamped, `CAT-082`), VCST-6085 | P1 |
| 003 | Catalog Filters | vc-frontend | VCST-5484 (checkbox/radio consumer), VCST-6085 | P1 |
| 098 | Product Compare v2 | vc-frontend | VCST-6029 (long unbroken property value) | P2 |
| 045 | Accessibility Tests | vc-frontend | VCST-5483, 5484, 5840, 5869 | P2 |
| 046 | Localization Tests | vc-frontend | VCST-5840 (language selector), VCST-5681 | P2 |
| 048c | Layout Stability | vc-frontend | VCST-5483/5484 (global styles), VCST-6005 | P1 |
| 083c | Loyalty Missions Storefront | vc-frontend | VCST-5957 (already stamped) | P1 |
| 083d | Loyalty Missions E2E | vc-frontend | VCST-5957 (already stamped) | P1 |
| 089 | Sales Rep — My Customers | vc-frontend, sales-rep | VCST-5870 (breadcrumb consumer), VCST-5759 (rep sign-in) | P1 |
| 091 | Sales Rep — Customer Profile | vc-frontend | VCST-5870 (breadcrumb consumer) | P1 |
| 093 | Sales Rep — Hub Dashboard | vc-frontend, sales-rep | VCST-5732 (Tasks widget), VCST-6083 (document widget), VCST-5870 | P1 |
| 097 | Sales Rep — Customer Orders | vc-frontend | VCST-5869 (filters drawer), 5870, 6002, 6005 | P1 |
| 006 | B2B Organization | vc-module-customer | VCST-5933 (org context/lock), VCST-5759 | P1 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`) — 43

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 078 | Backend Smoke — Platform, API & GraphQL | vc-platform, x-api | VCST-4585, 5662, 6086 | P0 |
| 078b | Backend Smoke — Catalog, Search & Pricing | catalog, search | VCST-6085, 2945, 5901 | P0 |
| 078c | Backend Smoke — Orders, Customers & Marketing | order, customer, marketing | VCST-5901 (order #504, customer #317, marketing #279) | P0 |
| 078d | Backend Smoke — Content & Admin Workflows | pagebuilder, content | VCST-4933, 6016, 6075 | P0 |
| 049 | Platform API | vc-platform | VCST-4585 (`/connect/token` custom grant handlers), VCST-5748 | P0 |
| 101 | Platform — Sign-in Log | vc-platform | VCST-5748/4585/5378 (new grant types must be recorded; `SIL-006` covers password grant only) | P1 |
| 020 | Platform Users, Roles & Settings | vc-platform | VCST-5748 (lockout), VCST-5759, VCST-6086 (`setError`) | P1 |
| 050d | GraphQL xProfile | x-profile | VCST-5933, VCST-5759, VCST-5748 | P1 |
| 050c | GraphQL xOrder | x-order | VCST-5933 (`organizationOrders`, x-order #52), VCST-5662, VCST-5901 | P1 |
| 050a | GraphQL xCatalog | x-catalog | VCST-5662 (#111), VCST-5901 (#112), VCST-2945 (stamped) | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | x-cart | VCST-5662, 5901, 6052 | P1 |
| 050b2 | GraphQL xCart — Item Selection & Coupons | x-cart | VCST-5662, 5901 | P1 |
| 050b3 | GraphQL xCart — Shipment, Payment, Merge, Remove | x-cart | VCST-5662, 6052 | P1 |
| 050b4 | GraphQL xCart — Cross-Domain & Schema Coverage | x-cart | VCST-5662, 5901 | P1 |
| 050b5 | GraphQL xCart — Per-RuleSet Validation | x-cart | VCST-5901 (`ValidateAsync`), VCST-5662 | P1 |
| 050g | GraphQL Cross-Cutting | x-api | VCST-5662 (#85), 5901 (#87), 6052 (#88) | P1 |
| 050f | GraphQL xCMS | x-cms | VCST-4933 (x-cms #23/#24) | P1 |
| 050k | GraphQL xPickup | x-pickup | VCST-5662 (#12) | P1 |
| 050j | GraphQL xMarketing | x-marketing | VCST-5901 (marketing #279) | P1 |
| 050m | GraphQL xAPI — Sales Rep | sales-rep | VCST-5732 (module #16), VCST-5759 (#17) | P1 |
| 092 | Sales Rep — Admin / VC-Shell App | sales-rep | VCST-5759, VCST-6028 | P1 |
| 092b | Sales Rep — Admin Embedded App | sales-rep | VCST-6028 (org search loop), VCST-5759 | P1 |
| 085 | Task Management | task module | VCST-5732 (the widget is built on the Task module, and is "visible only if the module is installed") | P2 |
| 073 | Returns | vc-module-return | VCST-5628 (#26), VCST-5883 (#27). Admin UI/REST only, 22 cases | P1 |
| 057 | Notifications Templates | notifications | VCST-5883 (4 buyer emails), VCST-6075 (htmleditor, indirect, verify) | P1 |
| 058 | Notifications Triggers | notifications | VCST-5883 | P1 |
| 068 | Push Messages | push | VCST-5883 (push leg) | P2 |
| 017 | Orders Admin Management | order | VCST-5901 (#504), VCST-5628 (price snapshot from order line) | P1 |
| 018 | Orders Admin Payments | payment | VCST-5901 (payment #75) | P1 |
| 051 | Catalog Admin Products | catalog | VCST-5901 (#908), VCST-2945 (#909) | P1 |
| 056 | Inventory | inventory | VCST-5901 (#166) | P1 |
| 026 | Customer Contacts | customer | VCST-5901 (#317) | P1 |
| 023 | Marketing Promotions | marketing | VCST-5901 (#279) | P1 |
| 062 | Assets | assets | VCST-6016 (assets #38, filesystem #17, azureblob #38), VCST-5901 (#39) | P1 |
| 061 | Search Indexing Admin | search providers | VCST-6085, VCST-6052 (index-creation lock ×3 providers, ES8 timeouts) | P1 |
| 103 | Search Configuration Admin (Barcode) | catalog, x-catalog | VCST-2945 (already stamped) | P2 |
| 075d | Loyalty Missions | loyalty | VCST-5957, VCST-5855, VCST-6084 | P1 |
| 075e | Loyalty Missions Admin | loyalty | VCST-5855, VCST-6084 (`MSNA-023` covers negative reward only) | P1 |
| 059 | Page Builder | pagebuilder | VCST-4933, VCST-5206 | P1 |
| 060 | Page Builder — Designer, Content & Storefront | pagebuilder | VCST-4933, VCST-5206 | P1 |
| 060b | Page Builder — Field Types, Asset Library | pagebuilder, vc-shell | VCST-6045 (upload timeout), VCST-6016 | P1 |
| 102 | UCP Agentic Commerce | ucp | VCST-5378, 6054, 6056 (all already stamped), VCST-6052 (ucp #8) | P1 |
| 094 | UCP Observability | ucp | VCST-6054 (already stamped) | P2 |

**Decision notes**
1. **VCST-5901 touches 13 repos.** I activated a suite only where one maps to a touched module (015, 017, 018, 023, 026, 050a/b5/g/j, 051, 056, 062). The remaining modules ride the 078* smoke suites and the cart/checkout net. Do not read the breadth as 13 independent changes.
2. **VCST-5662 and VCST-6052 have no QA surface of their own.** The activated suites are the regression net for them. They are not ticket-specific coverage, and the mapping-sensitive fields the net never touches are GAP-21.
3. **VCST-5220 (`NFC_` → `NFC`)** is a vc-sample-data property rename. `grep -E "\bNFC_?\b"` over `test-data/`, `scripts/seed-data/`, `config/` and `.claude/knowledge/` returns nothing. It is not activated and needs no case. If a fixture reads the property later, `td:reconcile` will show it.
4. **VCST-5957 (PR #2524) merged 2026-10-02.** 083c/083d already carry VCST-5957 stamps, but confirm the redesign is deployed before reading a FAIL as a regression.
5. **VCST-6077 / #2514** (Sales Rep Hub tasks design) was merged and then reverted by #2535 on 2026-10-02. Hold any visual or layout assertion for the Tasks widget until the deployed shape is confirmed (GAP-03).
6. **VCST-6002** has no PR found. Its code path is unverified, so treat it as a visual probe, not a regression oracle.
7. **VCST-5628 is spec-conflicted.** AC-1 and the narrative say "from an order ONLY"; the In-scope table and the `Return.AllowOrderlessReturns` / `MaxOrderlessLineQuantity` settings say "with and without order". Orderless-path cases are held until the PO resolves it (GAP-04, §6.1).
8. **Oracle watch.** `PRF-GQL-093` (050d) asserts `organizationOrders` for a locked org as `is null OR totalCount = 0 OR items.0.organizationId is non-null {OBSERVED}`. The third disjunct passes in both the buggy and the fixed state, so it is a vacuous oracle for VCST-5933 (GAP-07).
9. **Doc-over-artifact guard.** No doc-vs-suite contradiction was found, so nothing is overwritten on a doc's authority. Existing `{OBSERVED}` assertions stand.

**Manifest findings (selection groups, re-checked against `config/test-suites.json`)**
- **M1.** The `loyalty` group still omits **075d and 075e** (26-18 raised this, still open). Its members are 075, 075b, 075c, 083, 083b, 083c, 083d, 075f, 083e. Missions backend and admin validation never run under `loyalty`, and VCST-5957/5855/6084 live there.
- **M2.** `sprint` excludes 045, 046 and 068, and also 050m, 050m2, 089, 090, 091, 092, 092b, 093, 097, 063, 069, 076, 043 and 047. **Six activated suites (045, 046, 068, 089, 091, 093, 097 plus 050m, 092, 092b) will not run under `regression:plan sprint`.** The Critical Sales Rep domain needs the `sales-rep` group unioned in explicitly. `full` has the same Sales Rep exclusions plus 096.
- **M3.** There is **no `returns` selection**, and `orders` omits **073** (Backend Returns) and 085. The returns chain is split across 014b, 073, 057, 058 and 068, with no group that runs it end to end.
- **M4.** `auth` is 031/032/033/082/101 only. It lacks 044, 049, 020 and 102, so an OTP/OAuth regression run must union `critical` or name the suites. `backend` excludes 092, 092b, 050m, 050m2, 094 and 102. No `ucp` or `task-management` selection exists, and 085 is reachable only through `sprint`/`full`/`backend`/`concern:admin`.
- **M5.** `.claude/knowledge/execution/module-suite-map.md` has no mention of 094, 097, 102, 103, 014b or UCP at all. It also shows Returns with Frontend `—` and the Sales Rep row without 097.
- **M6.** Knowledge holes. **BL-UCP is declared and empty.** There is no returns BL domain and no OTP/grant-type invariant in `bl/auth.yaml`. There are no domain maps for Returns, Auth/OTP or Task Management (`.claude/knowledge/domain/` has ucp, sales-rep, search, loyalty-missions, page-builder and b2b-organizations). Route candidate invariants to `/qa-review-oracles` and consider `/qa-domain-map returns`.

**Not activated (in scope, deliberately skipped):** 090 (buyer-facing My Sales Reps, untouched), 075/075b/075c/075f/083e (loyalty paths untouched), 050h/050i/050e (x-cart wishlist/configurable and xFrontend, covered by the 050b* net), 095 (background jobs, no ticket), 024, 096.

### 5.2 Coverage Gaps — New Test Cases Needed

Every row quotes the grep so it can be re-checked. Scope is "all rows of all 146 suites" unless narrowed, case-insensitive, over the full row text. Equivalent shell check: `grep -rliE "<regex>" regression/suites`. Live schema operations come from `.claude/knowledge/api/graphql-schema.md` (2026-09-29 snapshot).

| GAP | Ticket | Description | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-01 | VCST-5748 / 4585 | **OTP sign-in (`otp_email` grant, per-store enable, shared lockout with password, own/trusted-store rule, stateless code).** Grep `otp_email\|\botp\b` returns only 040c (4 rows, `PAY-DT-002/003`, the Datatrans 3DS payment OTP). Zero sign-in cases. 101's `SIL-006` covers the password grant only, and the new grant types are unrecorded-by-assertion. BL-AUTH has no invariant for this either (M6) | 031 · 032 · 049 · 044 · 101 | test-management-specialist → qa-backend-expert (REST/grant) + qa-frontend-expert (UI) |
| GAP-02 | VCST-5378 | **Storefront OAuth `/oauth/authorize` route** (vc-frontend #2467). Grep `oauth/authorize\|/oauth/` returns **zero** in all suites. 102's `oauth` hits are MCP discovery and auth-server metadata, not the storefront route | 031 (+012 anon→sign-in return, 102 as consumer) | test-management-specialist → qa-frontend-expert |
| GAP-03 | VCST-5732 | **Sales Rep Tasks widget.** Grep `\btask` over 093\|089\|091\|097\|050m\|050m2 returns **1 incidental hit** (`SR-CP-066`, a row-count case). `calendar indicator` returns zero. Grep `salesRepTask\|salesRepTasks\|salesRepTaskFilterRules` returns **zero**, although the schema has `salesRepTasks`, `salesRepTask`, `createSalesRepTask`, `updateSalesRepTask`, `changeSalesRepTaskStatus` and `deleteSalesRepTask`. 085 (26 cases) is the Admin Tasks app and REST only. Hold visual assertions (#2514 reverted by #2535) | 093 (UI) · 050m (xAPI) · 085 (seam) | test-management-specialist → qa-frontend-expert / qa-backend-expert |
| GAP-04 | VCST-5628 / 5883 | **Returns storefront module has no suite.** Grep `RETURN_QUANTITY_UNAVAILABLE\|AllowOrderlessReturns\|orderless\|modules/returns` returns **zero**. 073 is Admin UI/REST (`RET-001..022`, "Admin user is logged in"). 014b `ORD-037..040` are the only storefront return rows and are legacy Draft. **Spec-blocked in part** (order-only vs orderless) | **none** → propose `regression/suites/Frontend/returns/104-returns-storefront.csv` (ID 104 free) incl. one `[JOURNEY]`; refresh 014b `ORD-037..040` through lifecycle | test-management-specialist + qa-frontend-expert |
| GAP-05 | VCST-5628 | **Returns xAPI has no suite.** Grep `returnableItems\|returnReasons\|returnPolicy\|returnStatuses\|createReturn\|submitReturn\|cancelReturn\|updateReturn` returns **zero files**, although all ten operations are in the live schema. Quantity engine, `RETURN_QUANTITY_UNAVAILABLE` re-validation, scope OWN/ORGANIZATION and price snapshot are server-side rules with no API-layer case | **none** → propose `regression/suites/Backend/graphql/050o-graphql-xreturn.csv` (ID 050o free) | qa-backend-expert |
| GAP-06 | VCST-5883 | **Buyer notifications (registered / approved / partially approved / rejected, email and push, decline reasons, buyer culture).** Grep `\breturn(s\|ed)? (request\|approv\|reject\|regist\|decline)` over 057\|058\|068\|050l returns **zero**. `decline reason` returns zero in 073/057/058 | 057 · 058 · 068 | test-management-specialist → qa-backend-expert |
| GAP-07 | VCST-5933 | **Locked-out member reads the org's order history: current oracle is vacuous.** `PRF-GQL-093` (050d) locked-leg assertion ends `OR … organizationId is non-null {OBSERVED}`, so it passes whether or not the defect is present. No case in 050c or 014 asserts the denial. Strengthen to the spec expectation (null/denied/`totalCount = 0` for the locked caller) rather than describing the build | 050d (`PRF-GQL-093` + new) · 050c · 014 | qa-backend-expert |
| GAP-08 | VCST-6085 / 6052 | **Index-creation race → "0 results".** Grep `concurrent\|parallel\|simultaneous\|race\|cold\|first request` over 061\|004 returns 7 rows, none about index creation (e.g. `SRCHA-011` cancel build). All 48 rows of 061 are legacy "Not Automated"/Katalon. Environment may not allow forcing the race, so expect BLOCKED/Manual | 061 (+004, 078b as consumers) | test-management-specialist → qa-backend-expert |
| GAP-09 | VCST-6045 | **Large asset upload aborted at 30 s, no UI feedback.** Grep `upload.*(abort\|timeout)\|request timeout\|large (file )?upload\|30 ?s` over 060b\|062 returns zero relevant rows (one unrelated hit, `CMS-179`) | 060b · 062 | test-management-specialist → qa-backend-expert |
| GAP-10 | VCST-6016 | **Path traversal and unbounded recursion in Assets / Content storage providers.** Grep `traversal\|\.\./\|%2e` over 062\|060b\|049\|020 returns only lockout rows (`PLAT-081..093`, `API-037`, matching `.../locked`). `SEC-INPUT-004` (044) is the storefront input sink, not the storage providers. No filesystem/azureblob/content provider case | 062 · 060b · 049 | qa-backend-expert |
| GAP-11 | VCST-6084 | **Negative / zero mission goal values.** `MSNA-023` (075e) covers End-before-Start and a negative **reward** only; its steps set goal target = 1. Grep `negative` over 075e\|075d returns only that row. 5855 (reward) is covered; the goal side is not | 075e | test-management-specialist |
| GAP-12 | VCST-5869 | **Filters drawer announces as a dialog (Esc, focus return, role).** Grep `Escape\|role=.?dialog\|aria-modal\|focus (return\|restor)` over 097 returns **1 row** (`SR-CO-016` Tab + target size + axe at 375 px; it asserts no Esc dismissal or focus restore). 093's 7 hits are the layout-editor keyboard cases. Shared fix (#2486) also touches other popover dialogs | 097 · 093 · 045 | test-management-specialist → qa-frontend-expert |
| GAP-13 | VCST-6083 | **Document-library widget offers no action for DOC/XLS/ZIP.** Grep `\.(docx?\|xlsx?\|zip)\b\|DOC/XLS` over 093 returns zero. `SR-HD-083..088` cover render, rows, default 5 and Browse All; the page-level download is `SR-HD-096`. No per-file-type widget action | 093 | test-management-specialist |
| GAP-14 | VCST-6028 | **Admin org search infinite loop (vc-select paging).** Grep `infinite\|loop\|vc-select\|lazy.?load\|paging` over 092\|092b returns 1 unrelated row (`SR-EMB-022`). `SR-EMB-011` assigns a rep from the org side but never exercises search or paging | 092b · 092 | test-management-specialist |
| GAP-15 | VCST-5759 | **Rep with no first/last name cannot log in.** Grep for no-first/blank-name phrases over 092\|092b\|089\|031 returns only registration cases (`AUTH-001..008`) and unrelated rep profile cases. No case creates a rep with partial or empty name and signs in | 092 · 092b · 089 · 031 | test-management-specialist |
| GAP-16 | VCST-5870 | **Breadcrumb separators announced; dead hub crumb.** Grep `separator\|aria-hidden\|hub crumb\|dead crumb` over 089\|093\|097\|091 returns 3 incidental rows (`SR-FE-052`, `SR-HD-055`, `SR-CO-013`). `SR-CO-002..004` assert the customer segment text only | 097 · 089 · 091 | test-management-specialist → ui-ux-expert |
| GAP-17 | VCST-5840 | **Language selector flag alts all identical.** Grep `flag` over 045\|046\|033 returns 3 rows, none about alt text (`L10N-*` are language checks). `A11Y-IMG-001` is generic | 045 · 046 | test-management-specialist |
| GAP-18 | VCST-5681 | **Account sidebar raw i18n keys for module links.** Grep `raw\|i18n\|translation key` over 033 returns 1 unrelated row (`AUTH-034`). Raw-key checks exist for the Sales Rep sidebar in 093 only | 033 · 046 | test-management-specialist |
| GAP-19 | VCST-6029 | **Compare: long unbroken property value overflows a cell.** Grep `unbroken\|break-words\|word-break\|overflow-wrap` over 098 returns 2 rows (`CMP-009` label column at 375 px, `CMP-032` overflowing entries), neither a long unbroken value | 098 | test-management-specialist |
| GAP-20 | VCST-4933 | **Page Builder Shared Components.** Grep `shared (block\|component\|section)\|reusable\|global component` over 059\|060\|060b\|050f returns **zero**. x-cms #23/#24 add the read side | 059 · 060 · 060b · 050f | test-management-specialist |
| GAP-21 | VCST-5662 / 5901 (§6c) | **Mapping-sensitive cart/order fields.** Grep `updateCartDynamicProperties\|updateCartItemDynamicProperties\|changeCartItemComment\|changeComment` returns **zero corpus-wide**. Grep `purchaseOrderNumber` over 050b*\|028\|011\|013 returns only 013. Dynamic properties, comments and PO number are what a wholesale mapping replacement drops silently | 050b4 · 050b1 · 050c · 013 | test-management-specialist → qa-backend-expert |
| GAP-22 | VCST-6086 / 6075 | **Admin SPA: `setError` with no `errors` list; htmleditor cursor/line positions.** Grep `setError` returns 1 unrelated row (028); `htmleditor\|cursor position` returns 2 rows in 039 (payment). Both are exact-oracle fixes (D1) | 020 · 078 (setError) · 057 (editor, indirect) | qa-backend-expert |
| GAP-23 | VCST-6054 / 6056 / 5378 | **CLOSED.** 102 carries the keys: `UCPA-030..042` (6054/6056: `UCPA-035` is the split-line consolidated-total case, `UCPA-040..042` the out-of-stock / min-qty / post-handoff depletion shapes) and `UCPA-001..029` (5378). 094 `UCPO-003/005/006/016` cover structured error surfacing. No new case | 102 · 094 | — |
| GAP-24 | VCST-6046 | **CLOSED.** 001 `CAT-082` asserts singular/plural and the number equals the count (key stamped) | 001 | — |
| GAP-25 | VCST-2945 | **CLOSED.** 103 `SRCHA-049..056`, 004 `SRCH-014` (`[JOURNEY]` barcode scan) and 050a carry the key and barcode assertions | 103 · 004 · 050a | — |
| GAP-26 | VCST-5957 / 5855 | **CLOSED (with caveat).** 083c/083d carry VCST-5957 refs; reward-negative is `MSNA-023` (075e, no ticket stamp). Caveat: PR #2524 merged 2026-10-02, so re-verify against the deployed build before reading failures as regressions | 083c · 083d · 075e | — |
| GAP-27 | 26-18 GAP-09 (VCST-5547) | **CLOSED.** The 26-18 grep `condition tree` is now 20 hits in 026; `CUST-152..154` cover the group-filtered member list, the group-only members and the union of two groups | 026 | — |
| GAP-CF-01 | 26-18 GAP-03/08 | **Carry-forward, still zero.** No UI-kit suite in the manifest (`grep -ciE 'storybook\|ui-kit\|uikit' config/test-suites.json` = 0). This sprint adds three more shared-component changes (VCST-5483 VcButton contrast, 5484 checkbox/radio target, 5869 popover dialogs) | **none** → propose `Frontend/cross-cutting/0XX-ui-kit-components.csv` or extend 048c | test-management-specialist + ui-ux-expert |
| GAP-CF-02 | 26-18 GAP-14 | **Carry-forward.** Grep `bulk invite\|multiple e-?mails\|partial fail\|custom invitation\|invitation message` over 008 = zero (027 `CUST-074` is the Admin single-request case only) | 008 | test-management-specialist |
| GAP-CF-03 | 26-18 GAP-01 | **Carry-forward.** Grep `hide price\|price restriction\|hidden price\|restricted price` = zero corpus-wide | 054 · 050a · 002 · 017 | test-management-specialist |
| GAP-CF-04 | 26-18 GAP-02 | **Carry-forward.** Grep `federat\|remoteEntry\|plugin discovery` = zero corpus-wide | 093 (+089/091/097) | test-management-specialist |
| GAP-CF-05 | 26-18 GAP-04/06/07/11/12/13/15 | **Carry-forward, each re-grepped and still zero:** `hideDefaultHeader\|custom header` in 048c/089/090 · `{{blade\|raw binding\|unrendered` in 057 · `token expir\|expired token\|session expir` in 059/060 · `price calendar\|time-bound\|start date` in 055 · `rate.?limit\|429` in 044/031 and `inactivity\|idle timeout` corpus-wide · `segment\|disable\|deactivate` in 099/100 · `view all result` corpus-wide. (26-18 GAP-05, GAP-10 not re-grepped: not re-checkable by a single grep, so not carried) | 048c/089 · 057 · 059/060 · 055 · 044 · 099/100 · 004 | test-management-specialist |

### 5.3 Exploratory Charters — discovery of what the suites cannot assert

> **5 charters × 30 min, at the cap.** Derived per `.claude/skills/qa-sbtm/sprint-charter-selection.md`. Every charter is anchored to a §3 domain and to a §5.1 suite or a §5.2 GAP.
>
> **D3 check (`ls reports/exploratory/`, 2026-10-02).** `SBTM-VCST-5957-2026-10-01` is within 24 h, so **D3 fires on Loyalty Missions**. The rest are outside 24 h: `-5728-2026-09-29` (3 d), `-5378-2026-09-22` (10 d), `-5869-2026-09-21` (11 d), older 5317/5738 sessions.
>
> **Ranking.** C1 first (EXP-01, EXP-02), then signal count (EXP-03 has two), then §3 score; EXP-04/05 are score-20 single-signal C2s. The tie was broken by "least coverage first", as in 26-18.
>
> **Deploy gate.** EXP-03 (Auth) needs `VirtoCommerce.Otp`, which is not installed on `vcst`. Run it after the QA owner installs the module, or on an environment that has it. EXP-01 (Returns) and EXP-05 (Sales Rep) need §7.1 blockers 1–3 cleared first.
>
> **Lanes.** Three lanes, so two waves, isolated from the regression pool. Wave 1: EXP-01 (chrome), EXP-02 (firefox), EXP-03 (edge). Wave 2: EXP-04 (edge), EXP-05 (chrome). `playwright-firefox` clicks assume the MCP server was restarted after the occlusion-pref change.

| ID | Domain (§3) | Signals | Mission | Candidate scenarios | Technique | Lane | Owner |
|---|---|---|---|---|---|---|---|
| **EXP-01** | **Returns** (16, Critical) | **C1** (GAP-04, GAP-05 target `none`) + **C3** (GAP-04/05/06 chain: storefront → xAPI → Admin 073 → notifications 057/058/068, ≥3 suites across 2 layers) | Discover how the quantity engine and wizard behave at seams no case exists for, because the module has no suite at all. **Record what the UI offers for order-only vs orderless; do not assert it** (spec conflict) | 1. Same order line returned from two tabs / by two org colleagues at once: does the late submit get `RETURN_QUANTITY_UNAVAILABLE`, or silently over-return? 2. Draft holds nothing, then an admin partially approves elsewhere while the wizard is open: when does the displayed available quantity refresh? 3. Allowed-order-status setting or order status flips mid-wizard; attachment upload fails mid-wizard; OWN ↔ ORGANIZATION scope via the org switcher | Soap Opera · Scenario tour · Boundary-of-features | playwright-chrome | qa-frontend-expert (qa-backend-expert verifies API/admin side) |
| **EXP-02** | **UI kit & a11y** (12, High) | **C1** (GAP-CF-01, no UI-kit suite, carried from 26-18). The pure contrast and 24×24 oracles are D1 and go to §6.2, so this charter is limited to the consumer seam | Discover consumers broken by three global shared-component changes (VcButton contrast #2515, checkbox/radio target #2516, popover dialog focus #2486) that no component-level case can catch | 1. Walk every popover/dialog consumer (filters drawers, date picker, lists/quote modals, language selector) for Esc dismissal and focus return. 2. Checkbox/radio at dense consumers (facets, tables, drawers): overlapping hit areas after the target change. 3. VcButton secondary/outline in disabled/hover/focus states under the whitelabel/dark themes (070/071 tokens) | User-flow edge enumeration · Galumphing | playwright-firefox | qa-testing-expert (+ ui-ux-expert for axe/contrast probes) |
| **EXP-03** | **Auth & sign-in** (25, Critical) | **C2** (4 tickets on one surface at L=5: 5748, 4585, 5378, 5759; new module + platform + storefront) + **C3** (GAP-01 names 031/032/044 Frontend and 049/101 Backend) | Discover seams between the three new ways to reach `/connect/token` (OTP grant, storefront OAuth, custom grant handlers) and the existing lockout, sign-in log and impersonation behaviour | 1. Alternate password and OTP failures on one account: shared lockout counter, and does the lockout message differ by path? 2. OTP request on store A then attempt on a store the user does not own/trust; returning-vs-new classification for an unverified account; replay of a consumed/expired code. 3. Unauthenticated `/oauth/authorize` → sign-in by OTP → return; a rep with partial/empty name through both; confirm each attempt lands in the sign-in log | Soap Opera · Feature-pair matrix | playwright-edge | qa-backend-expert (qa-frontend-expert on the sign-in UI) |
| **EXP-04** | **Search & indexing** (20, Critical) | **C2** (one ticket across 3 provider repos: index-creation lock in open-search, elastic-search-8 and -9, plus ES8 request timeouts, barcode search and 6085 — counted as modules per the widened C2 unit) | Discover what the customer sees while an index is created, rebuilt or slow: the "0 results" window the lock was meant to close | 1. Trigger first build / rebuild from two admin sessions while a storefront search runs: zero results, error, or stale? 2. Slow cluster (bounded timeout): empty state vs error state on the storefront. 3. Barcode search across a blue-green swap and after the barcode property is deleted (sibling of `SRCHA-055`). Environment may not allow forcing the race, so log BLOCKED instead of passing | Feature-pair matrix · Saboteur | playwright-edge | qa-backend-expert |
| **EXP-05** | **Sales Rep hub** (20, Critical) | **C2** (11 tickets at L=5 across vc-frontend, sales-rep and vc-shell; plus the #2514/#2535 revert pair that makes the deployed shape uncertain) | Discover seams between the new Tasks widget and the surfaces six other fixes touched in the same window, on the build that is actually deployed | 1. Tasks: create a task around the day/timezone boundary and check group placement (Today/Overdue); Task module present vs absent for the same rep. 2. One session at 375 px by keyboard: filters drawer (Esc/focus), breadcrumb crumbs, customer-orders cards and date fields together. 3. Rep with partial name signs in, opens the hub, checks the document widget actions per file type | Feature-pair matrix · Boundary-of-features | playwright-chrome (wave 2) | qa-frontend-expert |

**Not chartered (and why)** — every Critical/High §3 domain without a charter, plus the Medium rows for completeness:

| Domain (§3 score) | Verdict | Routed to |
|---|---|---|
| **xAPI / cart core structural** (20, Critical) | **Qualifies on C2** (VCST-5662, 6052, 5901 across 13+ repos, L=4). **A cap casualty, not a "no signal"**: it was displaced by C1/C3 domains and by two zero-coverage C2s. The mitigation is the existing net (050b1–b5, 028–030, 011–013, 050a/c/k/g) plus the mapping-field gaps. If a slot frees, run it as the first reserve | GAP-21 + §6.3 |
| **UCP / agentic commerce** (16, Critical) | **D1** for 6054/6056 (exact structured-error and consolidated-quantity contracts, already `UCPA-030..042`). The 5378 auth flow was swept in `SBTM-VCST-5378-2026-09-22` (10 d, outside D3), which promoted five NET-NEW cases into 102 (`UCPA-025..029`). Only the storefront OAuth route is un-asserted, and that lives in EXP-03 | GAP-02, GAP-23 (closed) |
| **Loyalty Missions** (16, Critical) | **D3** — `SBTM-VCST-5957-2026-10-01` is within 24 h; extend that report, do not re-run. **Flag for the lead:** PR #2524 merged 2026-10-02, after that session's date, so confirm which build the session ran against. If it was pre-merge, a `[VAL]` re-run is a lead decision, not a new charter | GAP-11, GAP-26 |
| **B2B org-order authorization** (15, High) | **C4 qualifies (I=5, L=3) but D1 outranks it**: one exact oracle (a locked-out caller gets no org order history). A case is cheaper and permanent | GAP-07 + §6.2 |
| **Page Builder & Asset Library** (10, High) | **Qualifies on C2** (4933, 5206, 6045, 6016 across 5 repos). **A cap casualty at score 10**; 6045 and 6016 are also D1-shaped (a timeout threshold, traversal payloads) | GAP-09, GAP-10, GAP-20 |
| **Asset/Content storage security** (9, Medium) | Below the Critical/High threshold; exact payload oracles (D1) | GAP-10 |
| **Admin SPA platform** (9, Medium) | Below threshold; both fixes are exact oracles (D1) | GAP-22 |
| **Catalog browse / Compare** (8, Medium) | Below threshold; 6046 closed, 6029 is one assertable render (D1) | GAP-19, GAP-24 |
| **vc-shell framework** (5785/5746/5451), **PoC theme** (6047/6048/6050), **`[Agentic QA]` tooling**, infra, spikes | **D2** — separate products or no QA surface in this repo. Stated here rather than silently omitted | Nothing |

---

## 6. New Test Cases Needed (Per Ticket)

**Estimated total: 100–157 new cases.** The estimate excludes the 26-18 carry-forwards (GAP-CF-01..05) so they are not double-counted. Counts and technique only — no CSV authored here. Case generation happens per ticket via `/qa-test-cases-generator`.

> **First wave: about 48 cases** if the budget bites. In order: OTP sign-in 10 · Returns core (storefront 6 + xAPI 8 = 14) · Tasks widget core 6 · VCST-5933 strengthening 3 · VCST-6016 payloads 4 · VCST-6052 concurrency 3 · VCST-5869 2 · VCST-5759 2 · VCST-6084 1 · VCST-6085 2 · other High bugs 1. Selection rule: High priority, or the domain has no oracle at all.
>
> **Spec-blocked:** VCST-5628 orderless-path cases (about 4–6 of the 22–32) wait for the PO to resolve the order-only vs orderless conflict. VCST-5748 needs the "own/trusted store" rule stated precisely, and no BL invariant exists for it (M6).

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5748 | Storefront, REST (`/connect/token`), Admin setting | OTP sign-in: enable per store, returning-only, shared lockout, own/trusted store, stateless code | **10–14** | 031, 032, 049, 044, 101 (GAP-01) | **FLOW** first (request code → grant → session → sign-in log → what it unlocks), then **Decision Table** (store enable × returning/new × store trust × code state), **State Transition** (lockout across password+OTP), **BVA** on expiry/attempt count, Error Guessing (replay) |
| VCST-4585 | REST, Admin | Custom grant-type handlers: regression guards on existing grants | **2–3** | 082, 101, 049 | Error Guessing; feeds from the same PR (#3114) as 5748 |
| VCST-5378 | Storefront | `/oauth/authorize` route and sign-in return | **2–4** | 031, 012, 102 (GAP-02) | State Transition (anon → sign-in → return) + EP over buyer type. The UCP half is already covered |
| VCST-5732 | Storefront, GraphQL | Tasks widget: create (title/desc/due/priority), groups Today/Active/Upcoming/Overdue/Completed, calendar indicators, hidden if Task module absent | **10–14** | 093 (+050m, 085 seam) (GAP-03) | **FLOW** (create → group → due → complete), **Decision Table** (due date × status → group), **BVA** on the day/timezone boundary, EP on priority. Hold visual assertions (#2535 revert) |
| VCST-5869 | Storefront (a11y) | Filters drawer: dialog semantics, Esc, focus return | **2–3** | 097, 093 (GAP-12) | EP over open/close paths (keyboard, pointer, Esc, outside click) |
| VCST-5628 | Storefront, GraphQL, Admin | Returns step 1: list/create wizard/details/cancel; quantity engine (Ordered − Σ Requested − Σ Approved); Draft holds nothing; Rejected/Cancelled release; partial approval; concurrency re-validation; scope; price snapshot; mandatory attachments; allowed statuses | **22–32** (wizard 10–14, xAPI 8–12, `[JOURNEY]` 2–3, 073 refresh 2–3) | new 104 + new 050o + 073 (GAP-04, GAP-05) | **FLOW** first (create → submit → approve → quantity released → buyer sees it), then **BVA** on available quantity (0, 1, max−1, max, max+1), **State Transition** (Draft → Submitted → Approved/Partial/Rejected/Cancelled), Decision Table (scope × role) |
| VCST-5883 | Admin, Notifications, Push, Storefront | Buyer notifications: 4 events × email/push, decline reasons, buyer culture | **8–12** | 057, 058, 068 (GAP-06) | Decision Table (event × channel × culture), EP on decline reason |
| VCST-5957 | Storefront | Missions redesign: **already stamped in 083c/083d**. Incremental seam cases only | **0–3** | 083c, 083d | EP; contingent on the deployed build (decision note 4) |
| VCST-4933 | Admin, Storefront, GraphQL | Page Builder Shared Components: create, reuse, edit propagation, delete-in-use | **4–6** | 059, 060, 060b, 050f (GAP-20) | FLOW + State Transition (edit shared → pages reflect) |
| VCST-2945 | Admin, Storefront | Barcode setup. **CLOSED** in 103/004/050a | **0** | — | — |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5933 | GraphQL, Storefront | Locked-out member is denied org order history; replace the vacuous `PRF-GQL-093` leg | **3–4** | 050d, 050c, 014 (GAP-07) | EP over membership state + **State Transition** (lock applied mid-session) |
| VCST-6085 | Admin, Storefront | No "0 results" after concurrent index creation | **2–3** | 061, 004 (GAP-08) | Error Guessing; may be BLOCKED if the race cannot be forced |
| VCST-6045 | Admin (Page Builder) | Upload longer than 30 s completes or shows feedback | **2–3** | 060b, 062 (GAP-09) | **BVA** on duration/size around the timeout; likely Manual/Semi-Automated |
| VCST-6083 | Storefront | Document-widget action per file type (PDF, image, DOC, XLS, ZIP) | **2–3** | 093 (GAP-13) | EP over file type |
| VCST-6005 | Storefront (375 px) | Customer-orders card keeps Total on one line | **1–2** | 097, 048c | BVA (long money value at 375 px) |
| VCST-6002 | Storefront | Date fields do not clip when both filled. **No PR found, treat as a visual probe** | **1–2** | 097 | BVA / Error Guessing |
| VCST-5870 | Storefront (a11y) | Separators not announced; hub crumb not dead | **2–3** | 097, 089, 091 (GAP-16) | EP over route (customer-scoped / cross-customer) |
| VCST-5759 | Admin, Storefront | Rep with partial/empty name signs in | **2–3** | 092, 092b, 089, 031 (GAP-15) | EP over name presence (both / first only / last only / none) |
| VCST-6028 | Admin SPA | Org search terminates and pages | **1–2** | 092b (GAP-14) | Error Guessing |
| VCST-5855 | Admin | Negative reward. **Covered** by `MSNA-023`; add the ticket stamp during the 075e pass | **0** | 075e | — |
| VCST-6084 | Admin | Negative / zero goal values (target) | **1–2** | 075e (GAP-11) | **BVA** (−1, 0, 1) on each goal type |
| VCST-6029 | Storefront | Compare: long unbroken value | **1–2** | 098 (GAP-19) | BVA |
| VCST-6046 | Storefront | **CLOSED** (`CAT-082`) | **0** | 001 | — |
| VCST-5483 | Storefront (a11y) | VcButton secondary/outline contrast at or above the AA ratio | **2–3** | 045, 048c | **BVA** on the ratio threshold; assert tokens, never transcribed values |
| VCST-5484 | Storefront (a11y) | Checkbox/radio pointer target ≥ 24×24 (`BL-UI-006`) | **1–2** | 045, 048c | BVA on target size |
| VCST-5840 | Storefront (a11y) | Language selector flags: distinct alts | **1–2** | 045, 046 (GAP-17) | EP over languages |
| VCST-5681 | Storefront | No raw i18n keys in account sidebar module links | **1–2** | 033, 046 (GAP-18) | EP over locale × module link |
| VCST-6016 | REST, Admin | Traversal/recursion in Assets and Content providers | **4–6** | 062, 060b, 049 (GAP-10) | **EP** over payloads (`../`, encoded, absolute, deep nesting) × provider (filesystem, azureblob, content); negative-dominant |
| VCST-6086 | Admin SPA | `setError` with an error body lacking `errors` | **1–2** | 020, 078 (GAP-22) | Error Guessing |
| VCST-6075 | Admin SPA | htmleditor cursor/line positions before first edit and after resize | **1–2** | 057 (indirect, verify the surface) (GAP-22) | State Transition; likely Manual |
| VCST-6054 / 6056 | xAPI, UCP | **CLOSED** (`UCPA-030..042`, GAP-23) | **0** | 102 | — |

### 6.3 Tasks / TechDebt

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5662 | GraphQL, Storefront | AutoMapper wave 4: field-parity probes on what a mapping replacement drops silently (dynamic properties, comments, PO number, extended data) on top of the regression net | **5–8** | 050b4, 050b1, 050c, 050k, 013 (GAP-21) | **Classification Tree** over DTO → field, then Error Guessing (null/empty optional fields) |
| VCST-6052 | UCP, Search, Cart | One `IDistributedLock` API: concurrency guards for handoff single-use, index creation and cart operations | **3–5** | 102, 061, 050b3 | State Transition (concurrent requests); fed by EXP-04 |
| VCST-5901 | GraphQL, Storefront | VC00 obsolete removal: quote-from-cart validation through `CartAggregate.ValidateAsync(string)` | **2–3** | 015, 050b5 | EP over cart validity states |
| VCST-5206 | Admin, Storefront | Page creation via skills: selector-stability guard on the `data-test-id` permalink prefix | **1–2** | 059, 060 | EP; a stability guard, not a behaviour case |
| VCST-5220 | — | **No QA surface** (decision note 3) | **0** | — | — |

### 6c — Checklist diff (Critical / High domains only)

Method: each domain's checklist section was pulled and its items grepped against the §5.1 suites' rows. Covered items are recorded; every uncovered item routes to exactly one destination (§5.2 GAP if assertable, §5.3 scenario if state-shaped).

| Domain | Checklist section | Covered (no action) | Uncovered → destination |
|---|---|---|---|
| **Auth & sign-in** (Critical) | §1 Auth + §28 Security + A13 | Registration personal/org + validation (031 `AUTH-001..012`), sign-in/out, password reset (`AUTH-052`), lockout (`AUTH-020/070/072`), session expiry/concurrent sessions (032 `AUTH-048/049`), RBAC | **The checklist has no OTP, token-grant or OAuth-authorize item at all**, so the diff cannot see this sprint's whole surface (a hole in the checklist, not in this sprint). OTP → GAP-01, OAuth route → GAP-02; cross-grant lockout interplay → EXP-03 scenario 1 |
| **xAPI / cart core** (Critical) | §8 Cart/Checkout + xCart (graphql-checklist) | CRUD, selection, coupons, merge, shipment/payment, multi-cart, save for later (050b1–b4, 028–030) | **Cart dynamic properties and comments** (zero corpus-wide) → **GAP-21**. "Recently browsed products" on the cart page (zero in 028/029) → GAP-21 note. Approve/reject order appears in 008 (5 rows) and 027b but never in xOrder/050c → GAP-21 (low priority) |
| **Search & indexing** (Critical) | §6 Search + A10 | Name/partial/SKU search, typo tolerance, facet counts, index rebuild, status, provider health (061 `SRCHA-001..048`, all legacy "Not Automated"), barcode (103/004/050a) | **Concurrent/first index creation** (not an A10 item) → **GAP-08**; slow-cluster storefront behaviour → EXP-04 |
| **Sales Rep hub** (Critical) | §35 Sales Rep Hub + A28 Sales Rep Admin | Route guards, six stat tiles, recent orders, top sellers, localization, layout persistence (093 `SR-HD-001..063`), document library (`SR-HD-083..099`), my customers (089), admin rep CRUD and documents (092/092b) | **Tasks** (no checklist item and zero cases) → **GAP-03**; filters-drawer dialog semantics → GAP-12; breadcrumb → GAP-16; widget actions per file type → GAP-13; rep with partial name → GAP-15; org picker paging → GAP-14. Timezone/Task-module-flip state → EXP-05 |
| **Returns** (Critical) | Orders §10; A4 Orders Admin | Order detail, history, reorder, status lifecycle (014); admin order payment refund (A4) | **No Returns item exists in any of the three checklists** (only the A4 payment refund). A third checklist hole after Loyalty/Sales Rep in 26-18, and Returns has no domain map either. All routed to GAP-04/05/06 and EXP-01. `/qa-checklist new returns` is its own piece of work |
| **UCP / agentic commerce** (Critical) | §36 UCP | Discovery parity, identity linking, handoff mint/restore/TTL/single-use, stock errors, checkout guard (102 `UCPA-001..042`, 094) | None uncovered for the sprint's tickets. §36 itself records that BL-UCP is empty (M6) |
| **Loyalty Missions** (Critical) | §34 Loyalty | Mission progress on order total (075d, 11 rows), grant-once (5 rows), attribution (075d 6, 083c 11), reversal on cancel/refund (075d 1, 083d 2), points history (083c/083d 4 each) | Goal-value validation (negative/zero) is not a §34 item → GAP-11. Charter declined (D3) |
| **B2B org-order authorization** (High) | §12 Company Members + §13 Multi-Org | Org-scoped lock, block member, org switcher, cross-org maintainer (006, 033, 032 `AUTH-065/074`, 050d `PRF-GQL-068..093`) | The locked-caller order-history denial → **GAP-07** (existing case is vacuous) |
| **UI kit & a11y** (High) | §29 Accessibility + §22 Localization | Keyboard navigation, focus management, contrast, alt text, touch targets (045 `A11Y-*`, 048c VcButton) | Component-level seams and the flag-alt item → **GAP-17**, **GAP-CF-01**; consumer seams → EXP-02 |
| **Page Builder & Asset Library** (High) | A9 Content & Pages + A11 Assets | Create/edit/publish/clone/save-load (059), designer/content/storefront (060), field types/asset library (060b), upload/download (062 `ASSET-001..024`) | Shared Components → **GAP-20**; large-upload timeout → **GAP-09**; traversal → **GAP-10** |

Checklist sections that exist for Loyalty (§34), Sales Rep (§35, A28) and UCP (§36) are new since 26-18, so the 26-18 "no checklist" finding is closed for those three. **Still open:** Returns, Auth/OTP, Task Management and Product Compare have no checklist section.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

**Blockers — testing of the named domain does not start until these clear:**

1. **Module install on `vcst` (planned by the QA owner), followed by a re-read of the deployed versions.**
   Re-read `{BACK_URL}/api/platform/modules` after the install, and for each ticket record whether the
   deployed build contains its PR. Minimum set: `VirtoCommerce.Otp` present (VCST-5748); `XCart` at or
   after x-cart #146 (VCST-5662/6052/5901); `Xapi`, `XCatalog`, `XOrder`, `XPickup` at or after their
   wave-4 PRs; `Return` containing #26 + #27 (VCST-5628/5883); `SalesRep` containing #16, #17, #22;
   `OpenSearch` containing #4 + #5; `PageBuilderModule` containing #155, #159, #163, #164. **Read the
   versions; do not infer them from the ticket being Done.** Tickets whose PR is still absent stay
   `PENDING-DEPLOY`.
2. **VCST-5628's orderless-return conflict is resolved in writing** (§2.1): is a return without an order
   a defect or a store-configurable feature (`Return.AllowOrderlessReturns`)? **Ask the PO / VirtoOZ.**
   Order-linked returns can proceed; the orderless path waits.
3. **The VCST-6077 revert is resolved on the deployed build** (§2.2): which side of #2514/#2535 does
   `FRONT_URL` serve? Tasks-widget layout verdicts (VCST-5732) wait for the answer.
4. **The active search provider on `vcst` is identified** (ElasticSearch, ElasticSearch8, OpenSearch and
   ElasticAppSearch are all installed). VCST-6085 is OpenSearch-specific. If OpenSearch is not the active
   provider, its storefront symptom cannot be reproduced here, and the plan records that explicitly.

**Standard gates:**

5. `npm run env:check` green for `TEST_ENV=vcst`.
6. All three browser lanes reachable (`playwright-chrome`, `playwright-edge`, `playwright-firefox`), with
   MCP servers restarted after any config change.
7. Test data seeded and **verified live** per §8, including the divergent pairs (locked vs unlocked
   member, barcode vs non-barcode property, partial approval).
8. `npm run suites:lint` and `npm run td:validate` green. Suites 083c/083d are re-read after any
   re-pointing for the VCST-5957 redesign.
9. The `vc-frontend` checkout is pulled and `npm run sitemap:refresh` re-run, so §2 route lists reflect
   `/oauth/authorize`, `/account/returns*` and the module-mounted `/account` + `/company` routes (sitemap
   rev 10 is known-stale on routes).

### 7.2 Exit Criteria

| # | Criterion |
|---|---|
| 1 | Every **Critical** domain (7) has executed its §5.1 suites on at least two browser lanes, with HAR captured, **against a build that contains the ticket's PR** |
| 2 | Every **High** domain (3) has executed its §5.1 suites on at least one lane |
| 3 | All §5.2 `GAP-NN` items are either covered by a new `Draft` case or explicitly deferred **with a reason recorded in this file** |
| 4 | All §5.3 charters executed or explicitly stood down; each produces a net-new scenario or a written "nothing found" |
| 5 | OTP code reuse (`ECL-4.3`, `KB-06FE6C8D`) is confirmed or refuted on a build that has the module, and the base is updated (`kb confirm` / `kb dispute`) |
| 6 | The xAPI field-diff sweep (§4.2 item 2) has run on cart, catalog, order and pickup, with no unexplained `null` on a rendered field |
| 7 | The returns quantity model is verified for request → partial approval → release, and for two concurrent submitters on one order |
| 8 | VCST-5933 is verified with the divergent pair (locked member gets nothing, unlocked colleague gets the full list) |
| 9 | No open **Critical/High** bug filed by this cycle is left untriaged; each has severity, owning layer and a repo route |
| 10 | Every `PENDING-DEPLOY` ticket is either tested after the install or listed with its missing PR in the ticket comment |
| 11 | Zero suite CSVs left unparsable; `npm run suites:lint` and `npm run td:validate` green at close |
| 12 | Tracker comments follow the GOLDEN RULE: **one comment per ticket per run**, amended, with screenshots attached inline |

---

## 8. Test Data Requirements

Everything below resolves at runtime. **No literals**: `{{VAR}}` for per-environment values,
`@td(ALIAS.field)` for entities asserted by name, `live-discover` for drifting ids, and `random-data`
(`AGENT-TEST-` prefix) for unique inputs never asserted on. Per `.claude/rules/test-data.md`.

| Domain | Data needed | Layer | Notes |
|---|---|---|---|
| **Auth: OTP (VCST-5748)** | A store with OTP **enabled** and one with it **disabled**; a returning customer; an email-less or not-yet-registered address; access to the notification journal to read the code | `{{VAR}}` + Admin setup | "Returning customers only" needs the not-registered address as the negative. Lockout is **shared** with password attempts, so budget a fresh account per lockout case (FIFTH RULE: create it in the case) |
| **Auth: storefront OAuth / UCP (VCST-5378)** | A UCP client registration and an authenticated buyer | `@td()` + Admin setup | Prior session `SBTM-VCST-5378-2026-09-22` and `reports/tickets/Sprint26-19/VCST-5378/` hold the setup |
| **xAPI / cart core** | A cart carrying every line shape: simple, variation, configurable, BOPIS pickup, plus a quote created from a cart | seeder + `live-discover` | The shape spread is the point: an unmapped field hides in the shape nobody seeded |
| **Search & indexing** | A **barcode** product property with values, and a non-barcode property carrying the same string (the divergent pair) | Admin setup + `@td()` | Without the non-matching twin, a search that matches everything passes the barcode case |
| **Sales Rep (VCST-5732 etc.)** | A sales rep with served customers, the Task module installed, tasks due **today**, **overdue**, **upcoming** and **completed** (one per group); a rep with **no first/last name** (VCST-5759); DOC/XLS/ZIP documents (VCST-6083) | seeder + `@td()` | Each of the five groups needs a member, or a collapsed group is invisible. Overdue/today tasks are time-relative, so create them in the case (FIFTH RULE) |
| **Returns (VCST-5628/5883)** | Orders in an **eligible** and an **ineligible** status; one line with a large quantity (e.g. ordered ≫ requested ≫ approved); two buyers in **one organization**; a maintainer role for `ORGANIZATION` scope | seeder | The quantity triple must be **all different** (ordered ≠ requested ≠ approved), or partial-approval release is undecidable (SECOND RULE). File attachments are mandatory to submit |
| **UCP (VCST-6054/6056)** | A product with **known finite stock** | `live-discover` + seeder | Split lines must sum to under / equal to / over stock |
| **Loyalty Missions** | Missions of each goal type; admin access to save with −1 / 0 / 1 values | existing missions seeders | `seed:missions-e2e` **rewrites the store theme preset and never restores it**, so budget a restore step |
| **B2B org orders (VCST-5933)** | One organization with ≥2 members and order history: one member **locked**, one unlocked | seeder | **Do not unlock the TechFlow locked membership**: it is locked by design, and unlocking it breaks the impersonation suite |
| **UI kit & a11y** | None beyond existing pages | — | — |
| **Page Builder** | A shared component reused on ≥2 pages; an upload file large enough to exceed 30 s on the lane | Admin-authored + `random-data` | Generate the large file per run; never commit it |
| **Storage security (VCST-6016)** | Legitimate nested folders and dotted filenames (the negative corpus) | Admin-authored | Never seed a real exploit payload |
| **Sample data (VCST-5220)** | Re-check any fixture or case referencing the `NFC_` property name | `td:validate` | The property name changed to `NFC` |

**Standing constraints:** passwords are `{{VAR}}` tokens resolved from `.env.local`, never literals.
Disposable fixtures are isolated **per suite**, not per run; two suites consuming one fixture set are
serialised with a re-seed between them. Capture every observation with its run handle and entity ids,
because the fixture will not outlive it. No `reports/tickets/...` output path may appear in any case row (`DV-024`).

**Environment caveat:** this repo's knowledge records **no EUR product pricelist on `vcst-qa`**, so a
€0.00 is `BLOCKED`, not `FAIL`.

---

## 9. Schedule and Milestones

The sprint closes **2026-10-05**. Module install timing is owned by the QA owner; dates after it are relative to it.

| Date | Milestone | Owner |
|---|---|---|
| **2026-10-02** | Plan drafted (this document). Blockers 2–4 raised with the PO / release owner | orchestrator |
| 2026-10-02 – 10-03 | Testing of what **is** deployed now: UCP (pr-9), Loyalty validation (pr-18), barcode search (pr-113/pr-909), VCST-5933, UI-kit a11y, Sales Rep fixes on `SalesRep pr-21` | qa-frontend / qa-backend / ui-ux |
| *Install day (QA owner)* | Modules installed on `vcst`; entry blocker 1 re-read; tickets leave `PENDING-DEPLOY` | QA owner → orchestrator |
| Install + 0–1 d | OTP + storefront OAuth (Auth), xAPI field-diff sweep, x-cart concurrency, Returns FLOW | qa-backend / qa-frontend |
| Install + 1 d | §5.3 exploratory charters (30 min each), isolated from the regression pool | per §5.3 owners |
| **2026-10-05** | **Sprint closes.** Re-run `/qa-test-plan Sprint26-19` to capture the Done delta (119 issues open at drafting) | orchestrator |
| 2026-10-06 – 10-07 | Regression over the full §5.1 activation set; triage of everything found | regression-orchestrator / qa-lead-orchestrator |
| 2026-10-08 | Re-test of fixes; `Draft → Automated` promotion pass (`--promote`) | qa-lead-orchestrator |
| **2026-10-09** | Exit criteria reviewed; plan promoted `Draft → Approved`, or the gap recorded | orchestrator |

---

## 10. Resources — QA Agent Assignments

Per `.claude/rules/agents.md`. **Max 3 concurrent browser agents** across QA + BA combined. All three
Playwright lanes are click-capable.

| Domain | Agent | Browser lane | Rationale |
|---|---|---|---|
| Auth & sign-in (OTP, OAuth, grants) | **qa-backend-expert** | `playwright-edge` | `/connect/token` and the grant pipeline are platform work; the storefront OTP form is secondary |
| Auth: storefront sign-in UX + a11y | **qa-frontend-expert** | `playwright-chrome` | OTP form, lockout messaging |
| xAPI / cart core field-diff + concurrency | **qa-backend-expert** | none / `playwright-edge` | GraphQL-primary; concurrency is scripted |
| Search & indexing | **qa-testing-expert** | `playwright-firefox` | Rebuild-under-search is repetition work on an isolated lane |
| Sales Rep hub (storefront + a11y) | **qa-frontend-expert** | `playwright-chrome` | Storefront journeys + viewport checks |
| Sales Rep admin (vc-shell app, org search) | **qa-backend-expert** | `playwright-edge` | |
| Returns (storefront FLOW) | **qa-frontend-expert** | `playwright-chrome` | Sequential with Sales Rep: same agent, same lane |
| Returns (xAPI, quantity engine, agent approve) | **qa-backend-expert** | `playwright-edge` | |
| UCP / agentic commerce | **qa-backend-expert** | none (API) | No browser surface |
| Loyalty Missions | **qa-frontend-expert** | `playwright-chrome` | Redesign re-point; admin validation via qa-backend-expert |
| B2B org-order authorization | **qa-backend-expert** | `playwright-edge` | GraphQL-primary |
| UI kit & a11y / i18n | **ui-ux-expert** | Chrome DevTools MCP | WCAG 2.2 AA, contrast and target-size oracles |
| Page Builder & Asset Library | **qa-testing-expert** | `playwright-firefox` | |
| Storage security / Admin SPA platform | **qa-backend-expert** | `playwright-edge` | |
| Catalog browse / Compare | **qa-testing-expert** | `playwright-firefox` | |
| Test data (all domains) | **test-data-engineer** | none (Node + Platform API) | Authors **and runs** the seeders; delegates only browser confirmation |
| New case authoring (§6) | **test-management-specialist** | `playwright-chrome` (sequential, never parallel with qa-frontend) | **Sole writer** of `regression/suites/**` for the duration of this sprint's changes |
| Suite execution (§5.1) | **regression-orchestrator** | 3-slot pool | Batches of 3, matching the pool |
| Triage, status, go/no-go | **qa-lead-orchestrator** | — | Sole custodian of ticket status transitions |

---

## 11. JIRA Ticket Coverage Matrix

Every **test-relevant Done ticket** (37), its existing regression home, the new cases §6 calls for, and
its deployment state on `vcst` as read on 2026-10-02.

**Deploy state** legend, from `{BACK_URL}/api/platform/modules` on 2026-10-02:
- ✅ the module build on `vcst` carries the PR
- ⏳ `PENDING-DEPLOY`: the module is absent, or its build predates the PR. Tested after the QA owner's install
- ❓ the version is present but not yet matched to the PR. Resolve under §7.1 blocker 1

### 11.1 Stories

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-5748 | Auth & sign-in | **none for OTP** (031/032/049/044/101 for the password grant) | **10–14** (GAP-01) | EXP-03 | ⏳ `Otp` not installed | qa-backend-expert |
| VCST-4585 | Auth & sign-in | 082, 101, 049 | 2–3 | EXP-03 | ❓ platform #3114 | qa-backend-expert |
| VCST-5378 | UCP / Auth | **102 (`UCPA-001..029`)**, 031, 012 | 2–4 (GAP-02) | EXP-03 | ✅ UCP pr-9 · ❓ platform #3108 / theme #2467 | qa-frontend-expert |
| VCST-5732 | Sales Rep hub | 093, 050m, 085 (Admin Tasks only) | **10–14** (GAP-03) | EXP-05 | ❓ SalesRep pr-21 vs #16; #2514/#2535 revert | qa-frontend-expert |
| VCST-5869 | Sales Rep / a11y | 097, 093, 045 | 2–3 (GAP-12) | EXP-02, EXP-05 | ❓ theme | qa-frontend-expert |
| VCST-5628 | Returns | 073 (Admin only), 014b (legacy Draft) | **22–32** (GAP-04, GAP-05) ⛔ orderless part blocked | EXP-01 | ❓ Return 3.1003.0 vs #26 | test-management-specialist |
| VCST-5883 | Returns | 057, 058, 068 | **8–12** (GAP-06) | EXP-01 | ❓ Return vs #27 | qa-backend-expert |
| VCST-5957 | Loyalty Missions | **083c, 083d (stamped)** | 0–3 | — (D3) | ❓ #2524 merged 2026-10-02 | qa-frontend-expert |
| VCST-4933 | Page Builder | 059, 060, 060b, 050f | 4–6 (GAP-20) | — (cap) | ❓ PageBuilderModule 3.1029.0 vs #159 | test-management-specialist |
| VCST-2945 | Search & catalog | **103, 004, 050a (stamped)** | **0** (GAP-25 closed) | — | ✅ Catalog pr-909 / XCatalog pr-113 | — |

### 11.2 Bugs

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-5933 | B2B org-order authz | 050d (`PRF-GQL-093`, **vacuous**), 050c, 014, 033 | 3–4 (GAP-07) | — (D1) | ❓ XOrder 3.1013.0 vs #52 (verification report exists) | qa-backend-expert |
| VCST-6085 | Search & indexing | 061, 004, 005, 078b | 2–3 (GAP-08) | EXP-04 | ❓ OpenSearch 3.1004.0 vs #4; active provider unknown | qa-backend-expert |
| VCST-6054 | UCP | **102 (`UCPA-030..042`), 094** | **0** (GAP-23) | — (D1) | ✅ UCP pr-9 | — |
| VCST-6056 | UCP | **102 (`UCPA-035`)** | **0** (GAP-23) | — (D1) | ✅ UCP pr-9 | — |
| VCST-6045 | Page Builder / Assets | 060b, 062 | 2–3 (GAP-09) | — (D1) | ❓ PageBuilderModule vs #163 | qa-backend-expert |
| VCST-6083 | Sales Rep hub | 093 (`SR-HD-083..099`) | 2–3 (GAP-13) | EXP-05 | ❓ theme | test-management-specialist |
| VCST-6005 | Sales Rep hub | 097, 048c | 1–2 | EXP-05 | ❓ theme | qa-frontend-expert |
| VCST-6002 | Sales Rep hub | 097 | 1–2 (visual probe) | EXP-05 | ❓ no PR found | qa-frontend-expert |
| VCST-5870 | Sales Rep / a11y | 097, 089, 091 | 2–3 (GAP-16) | EXP-05 | ❓ theme | ui-ux-expert |
| VCST-5759 | Sales Rep / Auth | 092, 092b, 089, 031 | 2–3 (GAP-15) | EXP-03, EXP-05 | ❓ SalesRep pr-21 vs #17 | qa-backend-expert |
| VCST-6028 | Sales Rep admin | 092, 092b | 1–2 (GAP-14) | — | ❓ SalesRep pr-21 vs #22 | qa-backend-expert |
| VCST-5855 | Loyalty Missions | **075e (`MSNA-023`)** | **0** (add stamp) | — (D3) | ✅ Loyalty pr-18 | — |
| VCST-6084 | Loyalty Missions | 075e | 1–2 (GAP-11) | — (D3) | ✅ Loyalty pr-18 | test-management-specialist |
| VCST-6029 | Catalog / Compare | 098 | 1–2 (GAP-19) | — (D1) | ❓ theme | qa-testing-expert |
| VCST-6046 | Catalog browse | **001 (`CAT-082`)** | **0** (GAP-24) | — | ❓ theme | — |
| VCST-5483 | UI kit & a11y | 045, 048c, 042 | 2–3 | EXP-02 | ❓ theme | ui-ux-expert |
| VCST-5484 | UI kit & a11y | 045, 048c, 003 | 1–2 | EXP-02 | ❓ theme | ui-ux-expert |
| VCST-5840 | UI kit & a11y | 045, 046 | 1–2 (GAP-17) | EXP-02 | ❓ theme | ui-ux-expert |
| VCST-5681 | UI kit / i18n | 033, 046 | 1–2 (GAP-18) | — | ❓ theme | test-management-specialist |
| VCST-6016 | Storage security | 062, 060b, 049 | **4–6** (GAP-10) | — (D1) | ❓ Assets 3.1009 / FileSystemAssets 3.1004 / AzureBlobAssets 3.1007 / Content 3.1004 | qa-backend-expert |
| VCST-6086 | Admin SPA platform | 020, 078 | 1–2 (GAP-22) | — (D1) | ❓ platform #3125 | qa-backend-expert |
| VCST-6075 | Admin SPA platform | 057 (indirect) | 1–2 (GAP-22) | — (D1) | ❓ Core vs #264 | qa-backend-expert |

### 11.3 Tasks / TechDebt

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Deploy | Owner |
|---|---|---|---|---|---|---|
| VCST-5662 | xAPI / cart core | net: 050b1–b5, 050a, 050c, 050g, 050k, 028–030, 011–013, 037/038 | 5–8 (GAP-21) | — (cap; first reserve) | ⏳ XCart pr-141 predates #142 · ❓ Xapi/XCatalog/XOrder | qa-backend-expert |
| VCST-6052 | xAPI / cart core + Search | 102, 061, 050b3, 030 | 3–5 | EXP-04 | ⏳ XCart pr-141 predates #146 · ❓ search providers, platform #3122 | qa-backend-expert |
| VCST-5901 | xAPI / cart core | 015, 050b5, 017, 018, 023, 026, 051, 056, 062, 078* | 2–3 | — | ⏳ XCart pr-141 predates #143 · ❓ others | qa-backend-expert |
| VCST-5206 | Page Builder | 059, 060 | 1–2 (selector guard) | — | ❓ PageBuilderModule vs #155/#164 | test-management-specialist |
| VCST-5220 | Test data | — (no `NFC_` reference in fixtures/cases) | **0** | — | n/a | — |

### 11.4 Coverage summary

| Status | Count | Tickets |
|---|---|---|
| **Fully covered (re-run only)** | **6** | VCST-2945, 6046, 6054, 6056, 5855, 5957 *(5957 conditional on the deployed redesign)* |
| **Covered, needs new cases** | **26** | the §11 rows with a non-zero count and an existing suite |
| **No existing suite for the shipped surface** | **4** | VCST-5748 (no OTP case anywhere), VCST-5628 (no storefront or xAPI returns suite: GAP-04/05 propose `104` + `050o`), VCST-5883 (no return notification case), VCST-5732 (no Tasks-widget case; 085 is Admin only) |
| **Spec-blocked (part)** | **1** | VCST-5628 orderless path (§7.1 blocker 2) |
| **No QA surface** | **1** | VCST-5220 |
| **`PENDING-DEPLOY` on `vcst`** | **4** | VCST-5748, and the x-cart part of VCST-5662 / 6052 / 5901 |
| **Out of scope** | **28** | §2.4 |

> **The plan's real coverage debt is Returns and OTP.** Returns is a Critical domain carrying a new
> storefront module with **no storefront suite and no xAPI suite**, even though all ten operations are
> live in the schema. OTP is a new grant on the P0 auth endpoint with **zero sign-in cases**. Together
> they account for roughly 40–55 of the §6 estimate. Two new suite files (`Frontend/returns/104-…`,
> `Backend/graphql/050o-…`) are the highest-leverage artifacts this sprint could leave behind.

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

Tickets whose correctness cannot be decided on one layer. Each needs the layers compared against *each
other*, not each checked in isolation.

| # | Ticket(s) | Chain to verify | Why one layer is not enough |
|---|---|---|---|
| 1 | **VCST-5748 + VCST-4585** | Store OTP setting (Admin) ↔ `POST /api/otp/request` ↔ notification journal ↔ `POST /connect/token grant_type=otp_email` ↔ storefront session ↔ Sign-in log (suite 101) | The code is minted, mailed, exchanged and logged by four components. Reuse, lockout sharing and store trust can each be right on one layer and wrong on the next |
| 2 | **VCST-5378** | UCP handoff ↔ `/oauth/authorize` storefront route ↔ platform OAuth resource ↔ token ↔ UCP session store (`IDistributedLock`) | An authenticated handoff only works if all five agree on the same identity |
| 3 | **VCST-5628 + VCST-5883** | Storefront wizard ↔ `returnableItems` / `createReturn` / `submitReturn` ↔ Admin approve/partial/reject ↔ recomputed available quantity ↔ email + push notification | The quantity shown to the buyer, the one stored, and the one released after partial approval must agree. `KB-5A6C014E` already shows the displayed and stored values diverging |
| 4 | **VCST-5662 / 6052 / 5901** | Storefront render ↔ xAPI response fields ↔ pre-refactor capture | A silently unmapped field renders as a plausible blank, visible only against a reference |
| 5 | **VCST-6085 + VCST-6052** | Admin index rebuild ↔ provider index/alias state ↔ storefront search results | "0 results" is the same symptom for no-match, mid-rebuild and duplicate-alias |
| 6 | **VCST-5933** | Admin lock on the member ↔ `/connect/token` ↔ `organizationOrders` ↔ storefront order list | Lockout enforcement and data scoping are separate layers; the bug was that they disagreed |
| 7 | **VCST-6054 + VCST-6056** | UCP `create_cart` ↔ xCart cart ↔ inventory | The stock bypass is visible only by comparing the summed lines with the inventory record |
| 8 | **VCST-5732** | Storefront Tasks widget ↔ Task Management module (suite 085) ↔ calendar indicator | The widget is a view over another module's data; agreement is the assertion |
| 9 | **VCST-4933** | Page Builder shared-component edit ↔ xCMS resolution ↔ storefront render on ≥2 pages | Propagation is the feature; one page proves nothing |

---

## 13. References

**Merged PRs — `vc-frontend` (30 in window; 25 on `dev`):** #2410 (VCST-4933), #2464 (VCST-5732), #2467
(VCST-5378), #2477 (VCST-5748), #2486 (VCST-5869), #2488 (VCST-5628), #2491 (VCST-5870), #2492 (a11y
clickable rows, no ticket), #2495 (VCST-6029), #2496 (VCST-5681), #2497 (VCST-6046), #2498 (chore,
backend packages), #2500 (VCST-5883), #2501 (VCST-2945), #2509 (VCST-6083), #2513 (VCST-5840), #2514 +
revert #2535 (VCST-6077), #2515 (VCST-5483), #2516 (VCST-5484), #2517 + #2530 (CI, VCST-5414/5970),
#2524 (VCST-5957), #2525 (VCST-6005), #2526 (VCST-5707). **Not on `dev`:** #2499, #2502, #2503, #2508,
#2512 (`[PoC]` theme demo).

**Merged PRs — modules + platform (63 VCST-linked across 29 repos; product subset):** `vc-platform` #3108,
#3114, #3122, #3124, #3125, #3126 · `vc-module-otp` #1 · `vc-module-ucp` #7, #8, #9 · `vc-module-return`
#26, #27 · `vc-module-sales-rep` #16, #17, #22 · `vc-module-loyalty` #18 · `vc-module-x-order` #51, #52 ·
`vc-module-x-cart` #128, #142, #143, #146 · `vc-module-x-api` #85, #87, #88 · `vc-module-x-catalog` #111,
#112, #113 · `vc-module-x-pickup` #12 · `vc-module-x-cms` #23, #24 · `vc-module-catalog` #908, #909 ·
`vc-module-open-search` #4, #5 · `vc-module-elastic-search-8` #48, #49 · `vc-module-elastic-search-9` #16 ·
`vc-module-pagebuilder` #155, #159, #163, #164 · `vc-module-assets` #38, #39 ·
`vc-module-filesystem-assets` #17 · `vc-module-azureblob-assets` #38 · `vc-module-content` #219 ·
`vc-module-core` #263, #264 · `vc-module-quote` #152 · `vc-module-order` #504 · `vc-module-customer` #317 ·
`vc-module-marketing` #279 · `vc-module-profile-experience-api` #146 · `vc-module-inventory` #166 ·
`vc-module-payment` #75 · `vc-shell` #367, #368 (consumed by in-scope modules) · `vc-sample-data` #18, #19.

**Knowledge and rules (read, not restated):**
- `.claude/rules/agents.md` (roster, browser lanes, delegation) · `.claude/rules/test-data.md` · `.claude/rules/regression.md` · `.claude/rules/reports.md`
- `.claude/knowledge/oracles/` (`BL-*` via `npm run bl:extract`, read-only here; `ECL-*` incl. `ECL-4.3` OTP reuse)
- `.claude/knowledge/execution/quality-gates.md` · `ticket-routing.md` · `ticket-status-transitions.md` · `test-data-authoring.md` · `live-discovery.md`
- `.claude/knowledge/domain/sitemap.md`: **rev 10**, refreshed at Step 0 of this run (deterministic axis only)
- `.claude/skills/qa-risk/risk-prioritization-framework.md` (the 5×5 in §3) · `.claude/skills/qa-test-design/test-design-techniques.md` (§4.3) · `.claude/skills/qa-sbtm/sprint-charter-selection.md` (§5.3)
- Observed-behaviour base: `KB-06FE6C8D` (OTP reuse, single observation), `KB-8646A9CB` (sign-in lockout code), `KB-5A6C014E` (returns over-limit draft, disputed), `KB-7CC25D4A` (returns draft has no cancel on `/edit`). Ask with `npm run kb -- ask "<coordinate> <question>"`

**Manifest and tooling:** `config/test-suites.json` (**146 suites, 37 selection groups** at time of writing;
`npm run suites:lint` prints the live totals) · `npm run regression:plan -- <group>` · `npm run env:check` ·
`npm run td:validate` · `npm run suites:lint`.

**Prior art:**
- `vc/shared/docs/Sprint plans/sprint-26-18-test-plan.md`: the immediately prior plan
- `reports/tickets/Sprint26-19/`: **27 ticket folders already exist** (incl. VCST-2945, 5378, 5681, 5732, 5840, 5855, 5869, 5870, 5933, 5957, 6005, 6029, 6054, 6056, 6083, 6084, 6086). Testing on this sprint began before this plan; read these before re-testing anything
- `reports/exploratory/`: `SBTM-VCST-5957-2026-10-01`, `SBTM-VCST-5728-2026-09-29`, `SBTM-VCST-5378-2026-09-22`, `SBTM-VCST-5869-2026-09-21`
- `reports/regression/REG-2026-10-01-1243`, `REG-2026-09-30-1536`: most recent runs

**Tracker:** Jira project `VCST`, sprint `VCST Sprint 26-19` (id 2716, board 126).
