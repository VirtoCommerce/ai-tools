# Sprint 26-23 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-11-26
**Target environment:** QA (`FRONT_URL` / `BACK_URL`), `TEST_ENV=vcst`
**Sprint dates:** 2026-11-16 – 2026-11-30 *(from the Jira sprint object `VCST Sprint 26-23`, id 2950, board 126)*
**Regression ticket:** VCST-6853 (Regression test on QA (only theme)-23)
**Flags:** `current --env vcst`. Module PRs were reviewed as well as `vc-frontend`. The waves cover the §5.1.1 Frontend suites only ("only theme"); §5.1.2 is listed, not waved.

> **⚠ This sprint is still OPEN.** The plan was built on 2026-11-26, four days before the sprint closes. The scope below is the **77 Done** items as of that date. Re-run `/qa-test-plan 26-23 --update` after the sprint closes.

> **Build under test (read 2026-11-26):**
> - **Platform 3.1101.0**, 92 modules. The env was upgraded on 2026-11-25 by vc-deploy-dev#7158: 57 modules to their latest releases, including 8 that were on PR builds before (MFA, OTP, ProfileExperienceApiModule, SalesRep, SiteBuilder, Xapi, XCatalog). Live `/api/platform/modules` confirms the new versions (e.g. Xapi 3.1033.0, SalesRep 3.1029.0, Catalog 3.1054.0, MFA 3.1007.0).
> - **Theme `2.63.0-alpha.2681`** — a green dev alpha, not a release. alpha.N is the Nth commit of `dev`: 2681 = `vc-frontend` `dev` @ `5d7c54b0` (#2702, 2026-11-25), the HEAD of `dev` when the plan was built. **Every `vc-frontend` PR merged in the window is deployed**, so this plan has no `NOT_DEPLOYED` front-end case. `dev` CI is mixed this week (5 of the last 12 `theme-ci` runs on `dev` failed): read a storefront failure as possibly already seen by upstream CI before filing it.
> - **Not delivered (release:delivery, reviewed): the Subscriptions storefront is NOT on vcst.** Its PRs (#2669, #2671, #2673, #2700) merged into `feat/VCST-6507`, whose PR into `dev` (#2602) is open — so §2.1’s six Subscriptions stories are `NOT_DEPLOYED` here and W2 reports them so, never FAIL. **VCST-7006** has no `dev` fix PR (only `support/3.1009`): GAP-01 in W1 decides whether 3.1028.0 already refuses it. Details: `regression/releases/sprint-26-23/PLAN.md` §Not delivered.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-23 (`VCST Sprint 26-23`, Jira sprint id 2950) |
| Date range | 2026-11-16 – 2026-11-30 (**active** at drafting) |
| Theme | **Three privilege escalations in xAPI closed, and Subscriptions reach the storefront.** Three Highest security bugs (VCST-7006, 6974, 6970) stop storefront callers from assigning themselves roles, user types and other members through xAPI user, contact and organization mutations. Six Subscriptions stories put buy-once-or-subscribe on the product page, subscription controls on cart lines and a subscriptions area in the account (#2671, #2673). Around them: OTP becomes a store authentication type and its code single-use, Bridge gives tables, pagination, headings and tabs their soft look, compare moves into its own module with a server-side list, Site Builder Release #1 reaches the storefront, and the Sales Rep hub gets charts, call and multi-select messages |
| Done tickets | **77**: 23 Stories, 19 Bugs, 32 Tasks, 2 Spikes, 1 Review task |
| **Of which out of scope** | **19** (§2.4) |
| **Test-relevant Done tickets** | **58**: 21 Stories + 19 Bugs + 18 Tasks |
| Merged PRs in `vc-frontend` | **35** in the window: 31 on `dev` (all deployed in alpha.2681) and 4 on `feat/VCST-6507` (#2669, #2671, #2673, #2700 — Subscriptions, **not deployed**). 7 are CI, dependency or tooling only (#2665, #2681, #2682, #2687, #2693, #2699, #2702) |
| Merged PRs in modules + platform | **188** in `vc-module-*`, `vc-platform` and `vc-shell`. Most are the release bumps of the AutoMapper removal (VCST-6859) and the `.github` pin (VCST-6129); the functional ones are listed per ticket in §2 and §11 |
| Storefront sitemap | Refreshed to **rev 15** at Step 0: platform line 3.1097.0 → **3.1101.0**, products 4,652 → **4,658**, nav categories 53 → **55** (`seed-personalization-control-fixtures`, `seed-personalization-tagged-fixtures`). Route axis read from `vc-frontend` `dev` @ `5d7c54b0`: `/compare` left the vc-frontend router (VCST-5918 moved it into the Product Comparison module plugin; the page still exists) |

**The risk this sprint is a caller who can do more than they should, and a new flow nobody has run end to end.**
The three security fixes are denials: a case that only checks the happy path passes on the vulnerable
build too. So every one of them needs a divergent pair — the forbidden role refused, an allowed role
still accepted — or the fix is untested in both directions. Subscriptions is the opposite risk: one
large PR (#2671) touches the product page, the cart, checkout, the account and order history at once,
and suite 124 holds only 20 cases. The plan sends its gaps to §5.2 and one charter (EXP-03) down the
whole subscriber journey.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 21)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6842 | High | [SiteBuilder][MCP] Site Builder tools on the MCP module | Site Builder | site-builder#2, #9 |
| VCST-6946 | Medium | Admin Shell: Dashboard Editor — widget rules for everyone and per role, layout for everyone | Admin Shell (no wave) | admin-shell#19 |
| VCST-6941 | Medium | Map the procurement system identity to an organization | Punchout | punchout#13 |
| VCST-6913 | Medium | Subscriptions — Skip delivery: confirm skipping only the next delivery | Subscriptions | vc-frontend#2671 |
| VCST-6910 | Medium | Subscriptions — Delivery settings menu: pause or cancel the whole delivery | Subscriptions | vc-frontend#2671, #2700 |
| VCST-6909 | Medium | Subscriptions — "How subscriptions work" page | Subscriptions | vc-frontend#2669, #2671, #2673 |
| VCST-6867 | Medium | Subscriptions — Change a product's subscription: frequency, pause, cancel | Subscriptions | vc-frontend#2671 |
| VCST-6862 | Medium | Subscriptions — Cart: change or turn off a subscription on a line | Subscriptions | vc-frontend#2671, #2673; product-subscription#3 |
| VCST-6861 | Medium | Subscriptions — Product page: buy once or subscribe | Subscriptions | vc-frontend#2671, #2673 |
| VCST-6839 | Medium | Read the security database connection string from `ConnectionStrings:VirtoCommerce.Auth` | Platform (no wave) | — |
| VCST-6764 | Medium | Punchout Purchase Order update and cancellation lifecycle | Punchout | punchout#12 |
| VCST-6755 | Medium | Map PurchaseOrderLineNumber on OrderRequest | Orders / Punchout | punchout#10, x-order#58, x-cart#155, order#511, cart#201 |
| VCST-6670 | Medium | [Sales Rep Hub] Customers multi-select in the "Send a message" popup | Sales Rep | sales-rep#40 |
| VCST-6639 | Medium | [Platform][MCP] AI agents connect with the MCP URL only (CIMD) | Admin Shell (no wave) | mcp#4, admin-shell#14, vc-platform#3165 |
| VCST-6572 | Medium | [FE] Storefront Site Builder for Release #1 | Site Builder | vc-frontend#2630 |
| VCST-6571 | Medium | [PageBuilder] Take PR #174, adapt it and finish it for Release #1 | Site Builder (no wave) | site-builder#1, #3, #6, #7 |
| VCST-6258 | Medium | [User dashboard] Visual chart for revenues and orders of the user | Account dashboard | vc-frontend#2625 |
| VCST-6257 | Medium | [Sales Rep Hub] [Customer dashboard] Visual chart for revenues and orders | Sales Rep | sales-rep#38 |
| VCST-6256 | Medium | [Sales Rep Hub] Call a customer | Sales Rep | sales-rep#40 |
| VCST-6255 | Medium | [Sales Rep Hub] [Rep dashboard] Visual chart for revenues and orders by customer | Sales Rep | sales-rep#28, #38, #49, #50 |
| VCST-5918 | Medium | [E2E] Product Compare with server-side storage for registered users | Catalog & compare | vc-frontend#2635, #2684; product-comparison#1 |

### 2.2 Bugs Fixed (QA-relevant — 19)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-7006 | Highest | [Security] XAPI inviteUser / changeOrganizationContactRole assign any platform role | Security | profile-experience-api#163 |
| VCST-6974 | Highest | [Security] XAPI createUser / createContact / updateContact persist caller-supplied roles, member, organizations | Security | profile-experience-api#155–158, #160, #161 |
| VCST-6970 | Highest | [Security] XAPI updateUser lets a self-registered customer set own UserType / roles | Security | profile-experience-api#153, #154, #161 |
| VCST-6483 | High | Order price protection: a user without order:read_prices still sees capture and refund amounts | Orders (no wave) | order#512 |
| VCST-6950 | Medium | [SiteBuilder] "Preview as" a customer renders the storefront as Anonymous | Site Builder | site-builder#4, vc-frontend#2689 |
| VCST-6949 | Medium | [a11y] Dark mode: page-builder Slider "Dark gray" background, white headings unreadable | UI kit / a11y | vc-frontend#2688 |
| VCST-6936 | Medium | Admin Shell: missing notification about errors in modules | Admin Shell (no wave) | admin-shell#21 |
| VCST-6935 | Medium | Admin Angular: Errors filter doesn't work in modules list | Admin Shell (no wave) | vc-platform#3171, #3172; admin-angular-js#6 |
| VCST-6928 | Medium | User profile blade does not open | Admin Shell (no wave) | admin-shell#17, #18; admin-angular-js#5; vc-platform#3169 |
| VCST-6901 | Medium | VcLineItems story: the "in cart" chip renders unstyled | UI kit | vc-frontend#2675 |
| VCST-6570 | Medium | [PageBuilder][FE] Security hotfix for released Page Builder versions | Site Builder | pagebuilder#182, vc-frontend#2626 |
| VCST-6490 | Medium | OTP sign-in: the emailed code is not one-time | Auth | otp#4 |
| VCST-6324 | Medium | Admin: deleting a store SEO record after saving the store is silently lost | Admin Shell (no wave) | — |
| VCST-6117 | Medium | [A11y][Lists] Share list dialog: focus not returned to the trigger | UI kit / a11y | vc-frontend#2677 |
| VCST-5640 | Medium | x-catalog: CatalogProductBinder builds a throwaway JSON DOM for every product | Catalog & search | x-api#79, x-catalog#107 |
| VCST-6688 | Low | vc-module-mfa README: requestMfaChangeCode refused for a Required user | Auth | vc-frontend#2648, mfa#6 |
| VCST-6679 | Low | [Select branch] White square corners behind the rounded search input | UI kit | vc-frontend#2680 |
| VCST-6632 | Low | Admin Sign-in log: the Type filter has no Passkey option (nor OTP) | Auth (no wave) | passkeys#3 |
| VCST-6476 | Medium | ISalesRepRoleResolver DI scope issue | Sales Rep | — (resolved 2026-11-10, before the sprint; regression only) |

### 2.3 TechDebt / Structural / Tasks (QA-relevant — 18)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-6736 | High | vc-shell: update vulnerable dependencies used by all modules | Admin Shell (no wave) | vc-shell |
| VCST-6983 | Medium | Admin Shell modules: optional Admin dependencies, npm audit, vc-shell update | Admin Shell (no wave) | admin-shell |
| VCST-6912 | Medium | [Vulnerability] CVE-2026-114147 | Platform (no wave) | — |
| VCST-6880 | Medium | [UI Kit][Step 1] Import ui-kit only through its public entries | UI kit | vc-frontend#2666 |
| VCST-6879 | Medium | [UI Kit][Step 1] Pass theme services to the uiKit plugin | UI kit | vc-frontend#2666 |
| VCST-6878 | Medium | [UI Kit][Step 1] Move theme helpers used by ui-kit into ui-kit | UI kit | vc-frontend#2666 |
| VCST-6877 | Medium | [UI Kit][Step 1] Replace GraphQL types in ui-kit components | UI kit | vc-frontend#2666 |
| VCST-6876 | Medium | [UI Kit][Step 1] Guard ui-kit import boundaries | UI kit | vc-frontend#2666 |
| VCST-6859 | Medium | Remove AutoMapper from XAPI-dependent modules | Platform (W0 smoke) | module releases |
| VCST-6794 | Medium | [Sales Rep Hub] Call a customer: extension glued to the number | Sales Rep | sales-rep#46 |
| VCST-6744 | Medium | [Bridge][UI-kit] Page frame: add VcFrame | UI kit | vc-frontend#2656 |
| VCST-6498 | Medium | MFA: users with an unconfirmed email or lockout disabled can't sign in once MFA is required | Auth | mfa |
| VCST-6493 | Medium | [Bridge][Foundation] Kit component roots give way to a parent's class | UI kit | vc-frontend#2639 |
| VCST-6292 · 6291 · 6290 · 6233 | Medium | [Bridge][UI-kit] VcPagination, VcTable, headings soft look; VcTabSwitchGroup | UI kit | vc-frontend#2617, #2618, #2655, #2654 |
| VCST-6237 | Medium | [Bridge][Header][Desktop] Organizations menu | Company | vc-frontend#2667 |

Merged this sprint but **not** in the Done list (in the build, so their surfaces are in scope; they widen a suite's trigger in §5.1): VCST-6169 (OTP as a store authentication type, #2683, otp#5), VCST-6864 (#2695), VCST-6914 (subscription emails), VCST-6938 (ES empty mapping), VCST-6958 (#2686), VCST-6963 (#2690), VCST-6918 (store setup tools for agents), VCST-6874, VCST-6473, VCST-6934.

### 2.4 Out of Scope (19)

| Key | Type | Summary |
|-----|------|---------|
| VCST-6747 | Review task | Code Review [vc-module-x-api]: do not report GraphQL authorization errors as server failures |
| VCST-6900 | Spike | [Plugin platform] Rework Module Federation and the @vc-frontend/core facade |
| VCST-6667 | Spike | [UI Kit] Separate repository for the UI Kit |
| VCST-6138 | Story | [E2E] My Accounts > Security — Paprika + Mercury (E2E automation, no product change) |
| VCST-4464 | Story | onX Fulfilment Adapter — Create Order Flow (resolved 2026-11-08, before the sprint) |
| VCST-6841 | Task | Merge 62 Release to Next |
| VCST-6385 · 6923 · 6845 · 6160 · 6124 | Task | [Agentic QA] tooling |
| VCST-6888 · 6886 · 6885 | Task | [UI Kit][Step 3] repository, mirror, package decisions (no shipped storefront change) |
| VCST-6856 | Task | vc-build canary testing and pinned rollout |
| VCST-6903 | Task | vc-modules registry: point Punchout at an alpha |
| VCST-6852 · 6643 | Task | Smoke test on Virtostart-23 / -22 |
| VCST-6644 | Task | Regression test on QA (only theme)-22 (previous regression) |

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Security — xAPI user, contact and organization mutations** | 5 | 5 | **25** | Critical | **Three Highest privilege escalations on the same mutations, ten PRs.** `inviteUser` / `changeOrganizationContactRole` assigned any platform role (7006); `createUser` / `createContact` / `updateContact` persisted caller-supplied roles, member and organizations (6974); `updateUser` let a self-registered customer change its own UserType and roles (6970). The fix is a refusal; over-blocking a legitimate maintainer is the other failure |
| **Product Subscriptions — storefront** | 5 | 5 | **25** | Critical | **New flow on the revenue path.** Six stories and two follow-ups ship in one large PR (#2671) plus #2673: buy once or subscribe on the PDP, frequency and off switch on cart lines, a subscriptions area with delivery cards, pause / skip / cancel, order-history marks, a how-it-works page, all languages, new emails (6914). Suite 124 holds 20 cases |
| **Authentication — OTP, MFA, passkeys** | 4 | 5 | **20** | Critical | OTP becomes a store authentication type (6169, #2683) and its code single-use (6490); MFA lets an unconfirmed email or a lockout-disabled user sign in (6498); the admin sign-in log filters Passkey and OTP (6632). Each is a sign-in wrongly refused or wrongly admitted |
| **Storefront UI kit, Bridge soft look, a11y** | 5 | 4 | **20** | Critical | **Seventeen concurrent kit changes render on every page**: VcTable, VcPagination, headings, VcTabSwitchGroup, VcFrame, a parent class winning over kit roots (6493), the kit decoupled from the theme (#2666, 5 tasks), a selected line item edge (6958), dark-mode contrast (6949), share-list focus (6117) |
| **Catalog, compare & search** | 4 | 5 | **20** | Critical | Compare moved out of vc-frontend into the Product Comparison module plugin with a server-side list (5918, #2635, #2684); the x-catalog binder rewritten (5640); an empty ES mapping no longer cached (6938). The browse path every buyer takes |
| **Sales Rep hub** | 4 | 4 | **16** | Critical | Rep and customer dashboard charts (6255, 6257), call a customer with extensions (6256, 6794), multi-select messages (6670), all in the `vc-module-sales-rep` plugin. A broken plugin contract shows as a missing widget, not an error |
| **Site Builder / Page Builder** | 5 | 3 | **15** | High | Release #1 lands on the storefront (6572, #2630) and in the module (6571), with MCP tools (6842), "Preview as" (6950), custom section types (6963) and a Page Builder security hotfix (6570). No Frontend suite exists (GAP-24) |
| **Orders, price protection & Punchout** | 3 | 4 | **12** | High | `order:read_prices` hides capture and refund amounts (6483); PurchaseOrderLineNumber across cart, order, xAPI and cXML (6755); punchout PO update/cancel (6764) and identity → organization (6941) |
| **Admin Shell / Admin SPA** | 4 | 3 | **12** | High | Dashboard Editor (6946), module error notice and filter (6936, 6935), profile blade (6928), admin flag guard (6874), store SEO delete (6324), MCP CIMD (6639), store setup tools (6918). **No storefront wave** ("only theme"); §5.1.2 lists the suites |
| **Account dashboard** | 3 | 4 | **12** | High | Revenue and orders chart on the user dashboard (6258, #2625) |
| **Platform / infra (no UI)** | 1 | 2 | 2 | Low | Connection string (6839), job engine result (6934), AutoMapper removal (6859), CVE and dependency bumps. W0 smoke is the guard |
| *Agentic QA · spikes · release merges · smoke tasks · review tasks* | — | — | — | *Out of scope* | §2.4. Not scored; not gaps |

**Six Critical domains, and two of them pass silently when they are wrong.** A privilege fix that
over-blocks looks like "the maintainer page is broken"; one that under-blocks looks like nothing at all.
So every security case is a divergent pair, and every Subscriptions case asserts the state on the next
page (cart → account → order history), not only the click that changed it.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA / Shell | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-------------------|------|--------------|------|-----------|
| Security — xAPI mutations | ✅ (company members, invite, role change as maintainer and as buyer) | ✅ (user roles and type after the call) | — | ✅ **primary** (`inviteUser`, `changeOrganizationContactRole`, `createUser`, `createContact`, `updateContact`, `updateUser`) | — | — |
| Product Subscriptions | ✅ **primary** (PDP, cart line, checkout, account subscriptions, order history, how-it-works) | ✅ (subscription records) | ✅ (renewals, emails — 125) | ✅ (050p) | ✅ (delivery menu, confirmations) | — |
| Auth — OTP, MFA, passkeys | ✅ **primary** (sign-in by store type, OTP replay, MFA unconfirmed email) | ✅ (sign-in log filter) | ✅ (105, 110, 115) | ✅ (`me`) | — | — |
| UI kit / Bridge / a11y | ✅ **primary** (every page × classic / soft) | — | — | — | ✅ **primary** (contrast, focus) | — |
| Catalog, compare & search | ✅ **primary** (listing, PDP, compare, search) | ✅ (compare store settings — 123c) | ✅ (indexing) | ✅ (050a, 050q) | — | — |
| Sales Rep hub | ✅ **primary** (dashboards, call, messages) | — | — | ✅ (`/graphql/sales-rep`) | — | — |
| Site Builder | ✅ (published pages, preview-as) | ✅ **primary** (designer — 123, 123b) | — | — | ✅ (dark mode) | — |
| Orders & Punchout | ✅ (punchout session, requisition) | ✅ **primary** (price protection) | ✅ (cXML) | ✅ (line number) | — | — |
| Admin Shell | — | ✅ **primary** | ✅ | — | — | — |
| Account dashboard | ✅ **primary** (chart) | — | — | ✅ | — | — |

### 4.2 Testing Approach by Priority

**Step zero for every storefront verdict: read the theme version.** `vcst` serves `2.63.0-alpha.2681`
(`dev` @ `5d7c54b0`). A later deploy changes the build under the run: record it in the wave's `report.md`.

1. **Security (25): both directions, every mutation.** As a storefront buyer and as an organization maintainer, call each fixed mutation with a forbidden value (a platform role outside the organization allow-list, another member, `UserType`) and with an allowed one. Refused, and the stored user unchanged — then the allowed call still succeeds (GAP-01..03).
2. **Subscriptions (25): one subscriber journey, state checked on the next page.** Subscribe on the PDP → change the frequency and turn it off on the cart line → place the order → the account list, the delivery card and the order-history mark agree. Then pause, skip one and cancel from the delivery menu. Every language: no raw key.
3. **Auth (20): store authentication types as a decision table.** OTP shown only where the store lists it; the code works once and a replay is refused; MFA with an unconfirmed email. **Turning OTP or MFA on is environment-wide**, so 104, 111 and 114b run only in **WX**, with the setting restored in Cleanup.
4. **UI kit (20): sweep, do not sample.** 048c, 045, 046, 070, 071 over the whole storefront: tables, pagination, headings and tabs in the classic and the soft design; dark-mode contrast (6949); share-list focus (6117); the selected cart line (6958).
5. **Catalog & compare (20):** the same fields for a simple, a variation and a configurable product on listing, PDP and compare after the binder change (GAP-14). Compare now comes from the module plugin: add, remove and sign in with a list (098 — in WX, it flips `ProductComparison` store settings).
6. **Sales Rep (16):** presence first (plugin loads, dashboards render), then the charts, call a customer (extension after a pause) and multi-select messages.
7. **High (12–15):** Site Builder pages on the storefront and "Preview as" (GAP-23, 24); punchout session and requisition (WX — `Punchout.Enabled`); the account dashboard chart (120).
8. **Medium / Low:** the affected suites only.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Security | **Decision Table** (caller role × mutation × value allowed / forbidden) + **Divergent pair** (forbidden refused, allowed accepted) | The fix fails silently in either direction |
| Subscriptions | **State Transition** (one-time → subscribed → paused → skipped → cancelled) + **Flow coverage** (PDP → cart → checkout → account → order history) + EP over locales | One PR changed every page of the journey |
| Auth | **Decision Table** (store auth types × MFA × passkey) + **State Transition** (code issued → used → replayed) | Three switches decide one sign-in page |
| UI kit / a11y | **Coverage sweep** (every page × classic / soft) + WCAG 2.2 AA + BVA on contrast | A kit change lands on pages no ticket names |
| Catalog & compare | **Divergent pair** (product types) + Error Guessing (empty mapping) | Binder parity and a moved route |
| Sales Rep | **Presence assertion** + EP (number formats) + Pairwise (selection size × customers) | Plugin-delivered: fails by absence |
| Site Builder | Classification tree (section type × theme × mode) + State Transition (preview code) | New surface, no suite |
| Orders & Punchout | Decision Table (permission × surface) + Flow (cart → order → cXML) | Exact contracts |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> 35 Frontend suites and 38 Backend suites, 73 in all. Every id is in `config/test-suites.json`; the layer is the directory of the suite's CSV. Suites 121 and 122 (`vc-frontend-next`) are left out: this sprint's storefront PRs are `vc-frontend`. Account dashboard is suite 120 (not 118, which is MCP agents). Nothing is waved here; the orchestrator sizes it with `npm run regression:plan`.

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite | Name | Module | Sprint trigger | Pri |
|-------|------|--------|----------------|-----|
| 001 | Catalog Navigation | Catalog | VCST-6938, VCST-5640 | P1 |
| 002 | Product Detail | Catalog | VCST-6861, VCST-5640, VCST-6862 (PDP purchase options) | P1 |
| 003 | Catalog Filters | Catalog | VCST-6938, VCST-5640 | P1 |
| 004 | Search Core | Search | VCST-5640, VCST-6938 | P1 |
| 005 | Search Filters & Advanced | Search | VCST-5640, VCST-6938 | P1 |
| 006 | B2B Organization | B2B | VCST-6237, VCST-6970 | P1 |
| 007 | B2B Lists & Shared | B2B | VCST-6117 | P1 |
| 008 | B2B Members | B2B | VCST-7006, VCST-6974, VCST-6291, VCST-6292 | P1 |
| 011 | Checkout Flow | Checkout | VCST-6755, VCST-6861, VCST-6862 | P1 |
| 014 | Orders Frontend — History, Detail, Status & Reorder | Orders | VCST-6913, VCST-6867, VCST-6755, VCST-6291, VCST-6292, VCST-6493 | P1 |
| 028 | Cart Core | Cart | VCST-6862, VCST-6755, VCST-6958 | P1 |
| 031 | Auth Login & Register | Auth | VCST-6169, VCST-6498 | P1 |
| 032 | Auth Session & RBAC | Auth | VCST-6970, VCST-6974, VCST-7006 | P1 |
| 033 | Auth Company & Account Menu | Auth | VCST-6237, VCST-6688, VCST-6169 | P1 |
| 036 | BOPIS Store Selector | BOPIS | VCST-6679 | P1 |
| 042 | Smoke Tests | Smoke | every deploy; VCST-6876..VCST-6880 (ui-kit decoupling), VCST-6572 | P0 |
| 044 | Security Tests | Security | VCST-7006, VCST-6974, VCST-6970 | P0 |
| 045 | Accessibility Tests | Accessibility | VCST-6117, VCST-6949, VCST-6958, VCST-6233 | P2 |
| 046 | Localization Tests | Localization | VCST-6909, VCST-6861, VCST-6862 (#VCST-2673 all languages) | P2 |
| 048c | Layout Stability (runner-native) | Layout | VCST-6290, VCST-6291, VCST-6292, VCST-6233, VCST-6744, VCST-6493, VCST-6679, VCST-6958 | P1 |
| 070 | Whitelabeling Storefront | White labeling | VCST-6290, VCST-6744, VCST-6949 | P1 |
| 071 | Whitelabeling Branding | White labeling | VCST-6290, VCST-6291, VCST-6292, VCST-6493 | P1 |
| 089 | Sales Rep — My Customers (storefront UI/E2E) | Sales Rep | VCST-6256, VCST-6794, VCST-6670 | P1 |
| 091 | Sales Rep — Customer Profile (storefront) | Sales Rep | VCST-6257, VCST-6256 | P1 |
| 093 | Sales Rep — Hub Dashboard (storefront) | Sales Rep | VCST-6255, VCST-6670 | P1 |
| 093b | Sales Rep — Hub Plugin Delivery (Module Federation, storefront) | Sales Rep | VCST-6255, VCST-6257 (@vc-frontend/core 0.2.11 build) | P1 |
| 098 | Product Compare v2 | Catalog / Compare | VCST-5918 | P2 |
| 104 | Auth OTP Sign-In | Auth | VCST-6490, VCST-6169 | P1 |
| 107 | Punchout — storefront session (start link to signed-in buyer) | Punchout | VCST-6941 | P1 |
| 109 | Punchout — Create requisition (PunchOutOrderMessage) | Punchout | VCST-6764, VCST-6755, VCST-6941 | P1 |
| 111 | Auth MFA Sign-In (storefront) | Auth | VCST-6498, VCST-6688 | P1 |
| 114b | Auth Passkey on an OTP store (storefront) | Auth | VCST-6169 | P1 |
| 116 | Sales Rep — Reporting (customer sales report, storefront) | Sales Rep | VCST-6255 | P1 |
| 120 | Orders - Account dashboard (storefront, live data) | Orders / Account | VCST-6258 | P1 |
| 124 | Product Subscriptions - Storefront (purchase, consent, subscriptions page, order history) | Subscriptions | VCST-6861, VCST-6862, VCST-6867, VCST-6909, VCST-6910, VCST-6913, VCST-6864 | P1 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite | Name | Module | Sprint trigger | Pri |
|-------|------|--------|----------------|-----|
| 017 | Orders Admin Management | Orders | VCST-6483 | P1 |
| 017b | Orders Admin Management — Orders > Order Widgets | Orders | VCST-6483 | P1 |
| 018 | Orders Admin Payments | Orders | VCST-6483 (capture / refund amounts) | P1 |
| 020 | Platform Users Roles & Settings | Platform | VCST-6928, VCST-6874, VCST-6970 | P1 |
| 020b | Platform Admin Shell — Classic theme (menu, search, Settings v2 save, responsive) | Admin Shell | VCST-6936, VCST-6935, VCST-6946, VCST-6928, VCST-6874, VCST-6473, VCST-6983 | P1 |
| 026 | Customer Contacts | Customer | VCST-6974, VCST-6970 | P1 |
| 027 | Customer Orgs & Invites | Customer | VCST-7006 | P1 |
| 027b | Customer Org-Scoped Roles (whitelists, org-level inheritance, enforcement) | Customer | VCST-7006, VCST-6974 | P1 |
| 034 | Store Management | Store | VCST-6324, VCST-6918 | P1 |
| 049 | Platform API | Platform API | VCST-6935, VCST-6839, VCST-6934 | P0 |
| 050a | GraphQL xCatalog | GraphQL | VCST-5640 | P1 |
| 050b1 | GraphQL xCart — Basic CRUD & Quantity | GraphQL | VCST-6755 | P1 |
| 050c | GraphQL xOrder | GraphQL | VCST-6755 | P1 |
| 050d | GraphQL xProfile | GraphQL | VCST-7006, VCST-6974, VCST-6970, VCST-6498 | P1 |
| 050m | GraphQL xAPI — Sales Rep (scoped /graphql/sales-rep) | GraphQL | VCST-6255, VCST-6257 | P1 |
| 050m3 | GraphQL xAPI — Sales Rep Customer Activity & Insights (scoped /graphql/sales-rep) | GraphQL | VCST-6255, VCST-6257 | P1 |
| 050p | GraphQL xAPI - Product Subscriptions (offers, cart, consent, skip guard, lifecycle, ownership) | GraphQL | VCST-6861, VCST-6862, VCST-6867, VCST-6910, VCST-6913, VCST-6864 | P1 |
| 050q | GraphQL xAPI - Product Comparison (server-side compare list: save, read, remove, move, merge, access rules, limits, settings gates) | GraphQL | VCST-5918 | P1 |
| 059 | Page Builder | Page Builder | VCST-6570 | P1 |
| 060 | Page Builder — Designer, Content & Storefront | Page Builder | VCST-6570, VCST-6949 | P1 |
| 061 | Search Indexing Admin | Search | VCST-6938 | P1 |
| 061b | Search Indexation Jobs | Search | VCST-6938, VCST-6934 | P1 |
| 066 | SEO | SEO | VCST-6324 | P1 |
| 078 | Backend Smoke — Platform, API & GraphQL | Smoke | every deploy; VCST-6859 (AutoMapper removal) | P0 |
| 095 | Background Jobs — Hangfire Migration | Background jobs | VCST-6934 | P1 |
| 101 | Platform — Sign-in Log | Platform | VCST-6632, VCST-6498 | P1 |
| 105 | OTP Sign-In API | Auth API | VCST-6490, VCST-6169 | P1 |
| 108 | Punchout — cXML setup, token exchange and Admin user mapping | Punchout | VCST-6941, VCST-6764 | P1 |
| 110 | MFA Sign-In API and Backoffice | Auth API | VCST-6498, VCST-6688 | P1 |
| 110a | MFA modes: REST, xAPI and Backoffice | Auth API | VCST-6498, VCST-6688, VCST-6970 | P1 |
| 113 | Punchout — cXML OrderRequest to customer order | Punchout | VCST-6755, VCST-6764 | P1 |
| 115 | Passkey Sign-In API and Backoffice | Auth API | VCST-6632 | P1 |
| 118 | MCP — agents: sign-in, tools, approval, kill switch, audit and connected agents (admin scope) | MCP | VCST-6639, VCST-6918, VCST-6842 | P1 |
| 119 | Azure Monitor OpenTelemetry telemetry (App Insights migration) | Observability | VCST-6747, VCST-6983 | P2 |
| 123 | Site Builder — Designer, Theme & Publishing | Site Builder | VCST-6571, VCST-6842, VCST-6950, VCST-6963 | P1 |
| 123b | Site Builder — Pages Management & Lifecycle | Site Builder | VCST-6571, VCST-6842 | P1 |
| 123c | Product Comparison - Admin store settings | Catalog / Compare | VCST-5918 | P2 |
| 125 | Product Subscriptions - Admin REST (renewals, retries, permissions, import) | Subscriptions | VCST-6914, VCST-6862, VCST-6861 | P1 |

### 5.2 Coverage Gaps — New Test Cases Needed

> 38 gaps from the Step 6c checklist diff (Critical/High domains) and the ticket summaries. Existing coverage was checked by keyword and ticket stamp on the suite CSVs, so a row only claims "no row" where that search found none. `none` = no suite holds it today. Suites 091, 093, 093b and 116 have uncommitted edits in the working tree: a gap that targets them waits for that change to land.

| Gap | Ticket | Gap description | Target suite(s) | Owner |
|-----|--------|-----------------|-----------------|-------|
| GAP-01 | VCST-7006 | inviteUser and changeOrganizationContactRole with a platform role outside the organization role allow-list are refused server-side, for a new invite and for a role change; an allowed role still succeeds (BL-B2B-011, BL-B2B-009, BL-GQL-004). 027b ORGROLE-010/011 hold the REST membership path and 050d PRF-GQL-066 the happy-path role change; no xAPI refusal row | 050d, 027b, 008 | qa-backend-expert |
| GAP-02 | VCST-6974 | createUser, createContact and updateContact ignore or refuse caller-supplied roles, member, organizations and groups; the caller own account and organization are the only target (BL-GQL-004, BL-GQL-005, BL-B2B-010). 050d PRF-GQL-031 covers only HTML and oversized phone | 050d, 026, 044 | qa-backend-expert |
| GAP-03 | VCST-6970 | updateUser from a self-registered storefront session changes profile fields only: UserType, Roles and the password hash are ignored, and a caller who may manage users still can (no over-blocking) (BL-GQL-004, BL-AUTH-005). 110a holds two rows; 050d has no updateUser row and 044/032 no storefront-session negative | 044, 032, 050d | qa-backend-expert |
| GAP-04 | VCST-6498 | Email confirmation resets on an email change, and the MFA sign-in code goes to an unconfirmed email with a warning when lockout is disabled (BL-AUTH-002, BL-AUTH-022); 111 holds unconfirmed-email rows, none for the reset after an email change | 111, 032, 050d | qa-frontend-expert |
| GAP-05 | VCST-6490 | OTP storefront sign-in: the emailed code works for one sign-in only, and a replay on the sign-in page is refused with a visible message (BL-AUTH-026); 105 holds the API refusal, no 104 row carries the stamp | 104, 105 | qa-frontend-expert |
| GAP-06 | VCST-6169 | OTP shows on the storefront sign-in only when the store lists it in its authentication types, and is hidden otherwise; combinations with an MFA store and passkey as a decision table (BL-AUTH-019, BL-AUTH-020); no case carries the 6169 stamp | 104, 114b, 031, 105 | qa-frontend-expert |
| GAP-07 | VCST-6632 | Admin Sign-in log Type filter lists Passkey and OTP and returns only those rows; 101 has no Passkey or OTP filter row | 101, 115, 105 | qa-backend-expert |
| GAP-08 | VCST-6862 | Cart line: change the frequency or turn the subscription off on a line; the default consent terms render as formatted text with bold lead-ins, never raw Markdown marks (**deferred 2026-11-26**: the terms format is still undecided in the module PR — no case until it is; the storefront is not on vcst anyway); 124 has no turn-off row | 124, 050p, 028 | qa-frontend-expert |
| GAP-09 | VCST-6909 | "How subscriptions work" page: reachable from the product page and the account, content and links, guest view; no row in 124 | 124, 046 | qa-frontend-expert |
| GAP-10 | VCST-6910 | Delivery settings menu on a delivery card: pause or cancel the whole delivery with confirmation, every item visible without a scroll at a short viewport height (#2700) | 124 | qa-frontend-expert |
| GAP-11 | VCST-6867, VCST-6913 | Subscription mark in order history list and detail: present for a subscription order, absent for a plain order; 124 holds one order-history row | 124, 014 | qa-frontend-expert |
| GAP-12 | VCST-6861, VCST-6862, VCST-6909 | Subscription strings in every storefront language (#2673 "all languages"): no raw key on the product card, cart line or subscriptions page; 124 has no locale row | 124, 046 | qa-frontend-expert |
| GAP-13 | VCST-6914 | Four new subscription emails, formatted text, store branding and 13 languages; 125 holds email rows for the earlier set only | 125, 058 | qa-backend-expert |
| GAP-14 | VCST-5640 | Products bound from the index with the per-property binder expose the same fields as before (dynamic properties, variations, configurable, prices, images) on listing, PDP and compare and in xCatalog; assert parity on a divergent pair of product types | 050a, 004, 002, 003 | qa-backend-expert |
| GAP-15 | VCST-6938 | Search recovers after an index mapping load returned empty: the empty mapping is not cached and the next query returns hits (BL-SRCH-003). **Decided 2026-11-26: not tested on vcst** — forcing an empty mapping breaks search for every session on the shared stand; covered by the fix PR tests (`NOT_TESTABLE` here) | 061, 061b, 004, 001 | qa-backend-expert |
| GAP-16 | VCST-6670 | Send a message to several customers from the hub: multi-select of customers, only the selected receive it, an empty selection is refused (BL-SR-002, BL-SR-011) | 089, 093 | qa-frontend-expert |
| GAP-17 | VCST-6794, VCST-6256 | Call a customer: the extension is dialled after a pause and not glued to the number, and a number without "+" is not dialled without its country code (the ticket two defects; exact dial string from the AC) | 089, 091 | qa-frontend-expert |
| GAP-18 | VCST-6258 | Account dashboard Sales Statistics chart (revenue and orders of the user): figures match the user own orders for the period, empty state, currency and locale; 120 has no chart row | 120 | qa-frontend-expert |
| GAP-19 | VCST-6483 | A user without order:read_prices sees no capture or refund amounts in childrenOperations, the Admin operations tree and the Capture blade; a user with it sees them. 017 holds one read_prices row, none for captures or refunds (BL-ORD-004) | 017, 017b, 018, 050c | qa-backend-expert |
| GAP-20 | VCST-6755 | PurchaseOrderLineNumber set on a cart line reaches the order line, the xAPI read and the punchout OrderRequest; no suite names the field | 050b1, 050c, 113, 011 | qa-backend-expert |
| GAP-21 | VCST-6764 | Punchout purchase order update and cancel through the cXML OrderRequest, and several session items in one PO; no row carries the stamp (BL-PUNCHOUT-003) | 113, 109 | qa-backend-expert |
| GAP-22 | VCST-6941 | Punchout identity maps to an organization: the buyer lands in the mapped organization context and an unmapped one is refused (BL-AUTH-015, BL-PUNCHOUT-004) | 107, 109, 108 | qa-frontend-expert |
| GAP-23 | VCST-6950 | Preview as a customer renders the storefront as that customer, not Anonymous; the one-time code is exchanged once on the storefront host and a replay or a second tab is refused; no row carries the stamp | 123, 123b | qa-backend-expert |
| GAP-24 | VCST-6572, VCST-6963 | Storefront side of Site Builder Release #1: pages render and custom section types render in light and dark; every Site Builder suite is Backend, no Frontend suite exists | **new Frontend Site Builder suite — deferred** (decided 2026-11-26): the storefront part is behind the build-time flag `site_builder_enabled` (theme `settings_data.json`, `false` in alpha.2681 and on every stand checked — vcst, vcptcore, vcptcore_qa1, vcptcore_regression, virtostart); the suite is written once a flag-on stand exists (VCST-6574, On hold). `NOT_DEPLOYED` on vcst | test-management-specialist |
| GAP-25 | VCST-6842 | Site Builder tools on the MCP module: an agent creates or edits a page that the designer then shows, and a role without the scope is refused; 118 holds no Site Builder tool row | 118, 123b | qa-backend-expert |
| GAP-26 | VCST-6570 | Hardened Page Builder API, designer, rendering and preview: script or HTML injected into content does not execute on the storefront or in preview; 060 holds one script-related row | 059, 060 | qa-backend-expert |
| GAP-27 | VCST-6949 | Dark mode: heading text on the "Dark gray" background of the Slider and the nine other static-content blocks meets text contrast (BL-A11Y-003) | 045, 070 | qa-frontend-expert |
| GAP-28 | VCST-6117 | Share list dialog: focus returns to the trigger after the dialog and after its confirmation close, and delete confirmations open on Cancel (#2677) (BL-A11Y-001) | 007, 045 | qa-frontend-expert |
| GAP-29 | VCST-6290, VCST-6291, VCST-6292, VCST-6233, VCST-6744 | Bridge soft look on tables, pagination, the tab-switch group, headings and VcFrame: classic design unchanged, soft applied on members, orders, search and compare pages (BL-UI-001, BL-UI-003, BL-UI-004) | 048c, 070, 071, 008, 014 | qa-frontend-expert |
| GAP-30 | VCST-6493, VCST-6958 | A parent class wins over the VcButton root, and a selected line item shows a leading edge instead of a tinted background: no regression on button variants, states and cart or order lines (BL-UI-002, BL-A11Y-003) | 048c, 028, 014 | qa-frontend-expert |
| GAP-31 | VCST-6876..VCST-6880 | ui-kit decoupled from the theme (#2666): notifications, image settings and logger still reach the kit (a toast still appears, images still resolve); exact observable | 042, 048c, 002 | qa-frontend-expert |
| GAP-32 | VCST-6679 | Select branch search input shows no white corners behind the rounded field, light and dark (BL-UI-004) | 036, 048c | qa-frontend-expert |
| GAP-33 | VCST-6237 | Organization switcher as its own desktop header control: shown to a multi-organization user, switching swaps the context (BL-CROSS-008, BL-AUTH-015, BL-B2B-001); 033/006 hold the older menu rows, so re-ground labels by observation and not by the [Next] design | 033, 006 | qa-frontend-expert |
| GAP-34 | VCST-6946 | Admin Shell Dashboard Editor: widget rules for everyone and per role, layout for everyone, user layouts stored on the server; no suite holds the editor | **020b** (decided 2026-11-26: no new suite; cases added with `/qa-test-lifecycle VCST-6946`) | test-management-specialist |
| GAP-35 | VCST-6936, VCST-6935 | Admin: a notice for modules that failed to load, and the Errors filter of the Angular modules list shows only modules with errors; 020b has dashboard and error rows, none carries the stamp | 020b, 049 | qa-backend-expert |
| GAP-36 | VCST-6928, VCST-6874 | User profile blade opens and applies the profile regional format and time zone (served by the platform); administrator flag guard, login on behalf, plugin menu sections | 020, 020b | qa-backend-expert |
| GAP-37 | VCST-6324 | A store SEO record deleted after the store was saved persists: Save stays enabled and the record is gone after reload; 066 and 034 hold two related hits | 034, 066 | qa-backend-expert |
| GAP-38 | VCST-6918 | Store setup toolsets for AI agents (tax, shipping, payment, catalog, store, settings tools): tools listed per role and a role without the scope refused; 118 holds no store-setup row | 118 | qa-backend-expert |

### 5.3 Exploratory Charters (discovery — what the suites cannot assert)

> 5 charters × 30 min. Lane: any free browser slot (firefox included since 2026-09-08, `.claude/rules/agents.md`). Run isolated from the regression pool (3 lanes total). Run with `/qa-exploratory sprint`. D3: no SBTM session on these domains in the last 24 h. Ranked C1 first, then signal count, then §3 score.

| ID | Domain | Signals | Mission | Candidate scenarios | Technique | Lane | Owner |
|----|--------|---------|---------|---------------------|-----------|------|-------|
| EXP-01 | Site Builder / Page Builder | C1, C2 | Discover what breaks when the Site Builder storefront port, custom section types, "Preview as" and the MCP tools meet in one author session; no Frontend suite exists (GAP-24) and 123/123b see only the designer. | 1. A page with a custom section type is designed, published and viewed on the storefront in light and dark, then edited again (GAP-24, GAP-27) 2. "Preview as" a customer, then reload and open a second tab: who the storefront renders (GAP-23) 3. An agent creates a page through the MCP tools, the designer opens and publishes it, injected HTML in a text block is checked on preview and live (GAP-25, GAP-26) | Soap Opera + Boundary-of-features | playwright-chrome | qa-frontend-expert |
| EXP-02 | Admin Shell / Admin SPA | C1, C2 | Discover seams between the new Dashboard Editor, module-error notices, the profile blade and the admin flag guard, which nine tickets changed at once; the editor has no suite (GAP-34). | 1. A dashboard widget rule for everyone and one per role, a user layout saved on the server, then the same user on a second browser (GAP-34) 2. A module that failed to load: the notice in the shell and the Errors filter in the Angular list agree (GAP-35) 3. The profile blade after a regional format and time zone change, then dates in lists, then login on behalf as a non-admin (GAP-36) | Feature-pair matrix + Boundary-of-features | playwright-edge | qa-backend-expert |
| EXP-03 | Product Subscriptions - storefront | C2, C3 | Discover what breaks along one subscriber journey that eight tickets and one large PR changed: product page, cart line, account, order history and the emails; 124, 050p and 125 each assert one link. | 1. Subscribe on the product page, change the frequency on the cart line, turn it off, turn it on again, check the cart and the account list (GAP-08, GAP-11) 2. Pause then skip then cancel a delivery from the delivery settings menu at a short viewport and in a long locale (GAP-10, GAP-12) 3. Order placed with a subscription line: order history mark, the new emails and the how-it-works page in a second language (GAP-09, GAP-11, GAP-13) | Soap Opera + Feature-pair matrix | playwright-firefox | qa-frontend-expert |
| EXP-04 | Authentication - OTP, MFA, passkeys | C2, C3 | Discover seams between store authentication types, single-use OTP, MFA with an unconfirmed email and the Sign-in log filter; 104, 105, 111 and 114b each hold one method. OTP and MFA toggles are env-wide: run it when no wave is active and restore the settings. | 1. OTP offered by store setting, code used once then replayed, the Sign-in log shows both rows and its Type filter finds them (GAP-05, GAP-06, GAP-07) 2. Email changed on the account, confirmation reset, MFA required: where the sign-in code goes (GAP-04) 3. Passkey sign-in on an OTP store, then OTP on an MFA store, ending on the right page each time (GAP-06) | State transitions + Boundary-of-features | playwright-edge | qa-frontend-expert |
| EXP-05 | Catalog, compare & search | C2, C3 | Discover what breaks where the binder rewrite, the empty-mapping fix and the server-side compare list meet on the browse path; 050a, 004, 098 and 050q each assert one. | 1. Product types side by side (simple, variation, configurable) on listing, PDP and compare: same fields after the binder change (GAP-14) 2. A guest compare list, sign-in, organization switch, then the same list from a second browser (BL-CAT-014, BL-CAT-015) 3. Search, reindex and search again with facets and sort, watching for an empty result that should not be (GAP-15) | Saboteur + Galumphing | playwright-chrome | qa-frontend-expert |

**Not chartered (and why):** Security - xAPI user/contact/org mutations — D1 exact oracle: each fix is an assertable denial (BL-B2B-011, BL-GQL-004, BL-GQL-005), so it goes to GAP-01..03 and section 6, however high the score; Storefront UI kit, Bridge soft look, a11y — C2 only, ranked 6th of 8 qualifying domains behind five with two signals, and the cap is 5: the 048c/045/070/071 sweep and GAP-27..33 carry it, and it takes the next free slot; Sales Rep hub — C2 only, ranked 7th, and its suites are mid-edit in the working tree; Orders, price protection & Punchout — L=3, no C signal, every fix an exact contract (GAP-19..22); Account dashboard — D1 single chart (GAP-18); Platform / infra (no UI) — D2 no storefront QA surface; the hotfix backports of VCST-6974 and VCST-6970 to support lines belong to /qa-hotfix-check, not to a charter; out of scope (Agentic QA, spikes, release merges, smoke tasks, review tasks) — D2, not scored.

---

## 6. New Test Cases Needed (Per Ticket)

> 39 rows, **103-145** new cases estimated (the rows sum to 121). Counts and targets only: the cases are written per ticket with `/qa-test-cases-generator` or `/qa-test`. Decided 2026-11-26: a **new Frontend Site Builder suite** for the storefront side (GAP-24, P1, about 6 cases) — **deferred** until a stand serves a theme built with `site_builder_enabled=true` (none does; VCST-6574 On hold); the Admin Shell Dashboard Editor cases go into the existing **020b** (GAP-34, about 5 cases) — no new Backend suite. GAP-15 is not tested on vcst; GAP-08 is deferred.

| Ticket | Layers | Case type | Count | Target suite | Technique |
|--------|--------|-----------|-------|--------------|-----------|
| VCST-7006 | xAPI | Negative / security | 5 | 050d, 027b | Decision table (role × allow-list × operation) |
| VCST-6974 | xAPI | Negative / security | 5 | 050d, 026, 044 | Error guessing + Divergent pair (own vs foreign target) |
| VCST-6970 | xAPI + Storefront session | Negative + no-over-blocking | 3 | 044, 032, 050d | Decision table (caller permission × field) |
| VCST-6498 | Storefront UI + xAPI | Positive + state transition | 3 | 111, 032, 050d | State transition (email confirmed → changed → unconfirmed) |
| VCST-6490 | Storefront UI | Negative / security | 2 | 104 | State transition (issued → used → replayed) |
| VCST-6169 | Storefront UI + REST | Positive + negative | 4 | 104, 114b, 031 | Decision table (store auth types × MFA × passkey) |
| VCST-6632 | Admin UI + REST | Positive | 2 | 101 | Equivalence partitioning (Type values) |
| VCST-6862 | Storefront UI + xAPI | Positive + negative | 3 | 124, 028 | Decision table (frequency × on/off) + EP |
| VCST-6909 | Storefront UI | Positive + guest | 2 | 124 | Equivalence partitioning (guest / signed in) |
| VCST-6910 | Storefront UI | Positive + layout | 2 | 124 | BVA (viewport height) |
| VCST-6867, VCST-6913 | Storefront UI | Positive + negative | 3 | 124, 014 | Equivalence partitioning (subscription / plain order) |
| VCST-6861, VCST-6862, VCST-6909 | Storefront UI | Localization | 2 | 124, 046 | EP (locale partitions) |
| VCST-6914 | REST + email journal | Positive + localization | 4 | 125, 058 | EP (email type × language) |
| VCST-5640 | xAPI + Storefront UI | Regression / parity | 2 | 050a, 004 | Divergent pair (product types) |
| VCST-6938 | Storefront UI + REST | Resilience (needs fault injection) | 2 | 061b, 004 | Error guessing |
| VCST-6670 | Storefront UI | Positive + negative | 3 | 089, 093 | Pairwise (selection size × customer set) + BVA |
| VCST-6794, VCST-6256 | Storefront UI | Negative / format | 3 | 089, 091 | EP (number formats) + BVA |
| VCST-6258 | Storefront UI | Positive + empty state | 3 | 120 | EP (period × data present) |
| VCST-6483 | Admin UI + REST | Negative / security | 4 | 017, 017b, 018 | Decision table (permission × surface) |
| VCST-6755 | Storefront UI + xAPI + REST | Cross-layer flow | 4 | 050b1, 050c, 113, 011 | Flow coverage (cart → order → punchout) |
| VCST-6764 | REST (cXML) + Storefront UI | Lifecycle + negative | 4 | 113, 109 | State transition (create → update → cancel) |
| VCST-6941 | Storefront UI | Positive + negative | 2 | 107, 109 | Decision table (identity × organization) |
| VCST-6950 | Admin UI + Storefront UI | Positive + negative / security | 3 | 123, 123b | State transition (code issued → exchanged → replayed) |
| VCST-6572, VCST-6963 | Storefront UI | Positive + theme variants | 6 | proposed Frontend/site-builder | Classification tree (section type × theme × mode) |
| VCST-6842 | MCP + Admin UI | Positive + RBAC negative | 3 | 118, 123b | Decision table (scope × tool) |
| VCST-6570 | REST + Storefront UI | Negative / security | 4 | 059, 060 | Error guessing (injection vectors) |
| VCST-6949 | Storefront UI | Accessibility (contrast) | 2 | 045, 070 | BVA (contrast threshold) |
| VCST-6117 | Storefront UI | Accessibility (focus) | 2 | 007, 045 | Error guessing (focus order) |
| VCST-6290, VCST-6291, VCST-6292, VCST-6233, VCST-6744 | Storefront UI | Visual / layout | 5 | 048c, 070, 071 | Classification tree (component × page × design) |
| VCST-6493, VCST-6958 | Storefront UI | Visual / regression | 3 | 048c, 014, 028 | Pairwise (variant × state) |
| VCST-6876..VCST-6880 | Storefront UI | Smoke / regression | 2 | 042, 048c | Flow coverage |
| VCST-6679 | Storefront UI | Visual | 1 | 036 | EP (light / dark) |
| VCST-6237 | Storefront UI | Positive + RBAC | 3 | 033, 006 | Decision table (organizations count × role) |
| VCST-6946 | Admin UI + REST | Positive + RBAC negative | 5 | proposed Backend/platform | Decision table (rule scope × role) + State transition |
| VCST-6936, VCST-6935 | Admin UI | Positive | 3 | 020b, 049 | EP (module state) |
| VCST-6928, VCST-6874 | Admin UI | Positive + negative | 4 | 020, 020b | Decision table (admin flag × user) |
| VCST-6324 | Admin UI | Regression / persistence | 2 | 034, 066 | State transition (save → delete → save) |
| VCST-6918 | MCP + Admin UI | Positive + RBAC negative | 4 | 118 | Decision table (role × tool) |
| VCST-6747, VCST-6934 | Telemetry / Admin UI | Exact oracle | 2 | 119, 095 | Error guessing |

### 6c — Checklist diff (Critical / High domains only)

> Item counts are approximate (rows of the named checklist section). Subscriptions, Site Builder and the Admin Shell hold no BL-* invariant today: a candidate list goes to `/qa-review-oracles`, not into this plan.

| Domain | Checklist items compared | → §5.2 | → §5.3 | Note |
|--------|--------------------------|--------|--------|------|
| Security - xAPI user, contact and organization mutations | about 23 (checklist 28 Security, A13 Platform Security, graphql Security + xProfile) vs 044/032/008/026/027/027b/050d/110a | 3 | 0 | Role allow-list, caller-supplied fields and updateUser are exact denials: all go to gaps; D1, so no charter |
| Product Subscriptions - storefront | about 22 (checklist 33 Subscriptions, A19) vs 124/050p/125 | 6 | 3 | Cart-line off switch, how-it-works page, menu, order-history mark, locales and emails go to gaps; the journey across them goes to EXP-03. Zero BL-* for subscriptions: a gap in the oracle |
| Authentication - OTP, MFA, passkeys | about 17 (checklist 1 Auth, 25 Account) vs 031/032/033/104/111/114b/105/110/110a/115/101 | 4 | 3 | Store auth types, replay, email confirmation reset and the log filter go to gaps; method × store combinations go to EXP-04 |
| Storefront UI kit, Bridge soft look, a11y | about 19 (checklist 29 Accessibility, 22 Localization, 24 White Labeling) vs 045/046/048c/070/071 | 7 | 0 | Specific contrast, focus and class-precedence rows go to gaps; the combination goes uncharted (ranked 6th, cap) |
| Catalog, compare & search | about 26 (checklist 2 Catalog, 6 Search, 15 PDP) vs 001/002/003/004/005/098/050a/050q/061 | 2 | 3 | Binder parity and mapping recovery go to gaps; compare across guest, sign-in and organization goes to EXP-05 |
| Sales Rep hub | about 40 (checklist 35, A28) vs 089/091/091c/093/093b/116/050m/050m3 | 2 | 0 | Multi-select message and the dial string go to gaps; chart rows exist (116, 091, 093 are modified in the working tree: re-diff before writing) |
| Site Builder / Page Builder | about 12 (backend A9 Content and Pages) vs 059/060/123/123b | 4 | 3 | Preview as, MCP tools, hardening and the missing storefront suite go to gaps; the author session goes to EXP-01. Zero BL-* for Site Builder |
| Orders, price protection & Punchout | about 25 (checklist 10 Orders, A4 Orders Admin; no punchout checklist) vs 017/017b/018/113/108/107/109 | 4 | 0 | Price protection, line number, PO lifecycle and organization mapping are exact: gaps, no charter |
| Admin Shell / Admin SPA | about 24 (backend A7, A12, A13, API1; no admin-shell checklist) vs 020/020b/034/049/118 | 5 | 3 | Dashboard Editor has no suite (C1); module notice, profile blade and store setup tools to gaps; their seams to EXP-02. Zero BL-* for the shell |
| Account dashboard | about 8 (checklist 25 Account) vs 120 | 1 | 0 | One chart: exact oracle, gap, no charter |

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

1. **W0 green** on the deployed build: `042` passes on theme `2.63.0-alpha.2681` + Platform 3.1101.0. A red W0 stops every wave.
2. **Build recorded:** each wave's `report.md` names the theme alpha it ran on. If a newer green alpha or a fix release is deployed during the freeze, `--update` the plan before the next wave starts.
3. **Store settings at their defaults** before W1–W6: `OtpSignIn.Enabled`, `MultiFactorAuthentication`, `ProductComparison`, `Punchout.Enabled`. Only WX changes them, and it restores each in Cleanup.
4. **Persona clones seeded once, before W0**: `npm run seed:wave-personas -- --fixtures` (sets S1–S4, contract §7.1). Other fixtures per §8, by the owner of the wave that consumes them, before the wave starts; nobody re-seeds while another wave runs.
5. **Sales Rep suites committed:** 091, 093, 093b and 116 carry uncommitted local edits (VCST-6257 lifecycle). W4 runs the committed CSVs, so land or park that change before W4 is claimed.

### 7.2 Exit Criteria

1. Every wave is `TRIAGED` or `DONE`, with `untriaged = 0`.
2. No open Critical or High bug against a Critical domain (§3) without a decision recorded in the ledger.
3. The three security fixes (7006, 6974, 6970) each have a PASS for the refusal **and** for the allowed call (§12).
4. The theme is recorded as a dev alpha in the release record; a storefront FAIL is checked against `dev` CI before it is filed.

---

## 8. Test Data Requirements

| Need | Source | Wave |
|------|--------|------|
| Per-wave persona clones and their orders | `npm run seed:wave-personas -- --fixtures`; bind with `npm run persona:use -- <set> --release sprint-26-23 --wave <W>` | W1, W2, W3, W6 |
| Subscription plans, products and a subscriber with deliveries | `npm run seed:subscriptions` (`SUBS_FX_*`, guard `td:validate:subscriptions`) | W2 |
| Buyer with past orders for the account chart | the S2 clones' orders (`--fixtures`); `@td()` through `aliases.vcst.S2.json` | W2 |
| Products of three types for binder parity (GAP-14) | existing catalog fixtures (`@td()`), live-discover for a configurable product | W3 |
| Sales Rep fixtures (reps, customers, call orgs) | `npm run seed:sales-rep`, `seed:sales-rep-call` (12 `ORG_SR_CALL_*`) | W4 |
| Organization with a maintainer, members and an invite target (security pairs) | existing B2B org fixtures; the forbidden role resolved live from the organization role allow-list | W1, W5 |
| OTP / MFA store settings, passkey virtual authenticator | set in the WX case, restored in Cleanup | WX |
| Punchout buyer, cXML credentials | punchout fixtures (`seed:punchout` where present) | WX |

Never assert exact prices, IDs or order numbers: resolve through `@td()` / live-discover (`.claude/rules/test-data.md`).

---

## 9. Schedule and Milestones

| Date | Milestone |
|------|-----------|
| 2026-11-26 | Plan drafted; waves written to `regression/releases/sprint-26-23/` |
| 2026-11-26 | Persona clones seeded; W0 smoke gate on the deployed build |
| 2026-11-26 – 2026-11-28 | W1–W6 in parallel, one owner each |
| 2026-11-28 | WX exclusive window (OTP, MFA, compare and punchout settings), one owner, alone |
| 2026-11-30 | Sprint close: `--update` for late Done items and any newer green alpha |
| 2026-12-01 – 2026-12-03 | Triage closed, ledger `DONE`, release PR merged |

---

## 10. Resources — QA Agent Assignments

| Wave | Domain | Agent | Lane |
|------|--------|-------|------|
| W0 | Smoke gate | `test-runner-agent` via `/qa-run` | `playwright-chrome` |
| W1 | Security & sign-in | `qa-frontend-expert` + `qa-backend-expert` (xAPI pairs) | `playwright-chrome` / `playwright-edge` |
| W2 | Subscriptions, cart, checkout & orders | `qa-frontend-expert` | `playwright-chrome` |
| W3 | Catalog, search & BOPIS | `qa-frontend-expert` | `playwright-firefox` |
| W4 | Sales Rep hub | `qa-frontend-expert` | `playwright-chrome` / `playwright-edge` |
| W5 | Company, members & lists | `qa-frontend-expert` | `playwright-edge` |
| W6 | UI kit, a11y & i18n (Bridge) | `vc-test:ui-ux-expert` + `qa-testing-expert` | `playwright-firefox` / `playwright-edge` |
| WX | Exclusive window | `qa-backend-expert` (settings) + `qa-frontend-expert` | `playwright-chrome` (114b requires it) |
| §5.3 charters | Exploratory | `qa-testing-expert` | any free lane, isolated from the regression pool |

At most three browser agents at once per machine (`.claude/rules/agents.md`).

---

## 11. JIRA Ticket Coverage Matrix

Every test-relevant Done ticket, the suites that cover it and the gaps §5.2 adds. Back-office tickets point at §5.1.2 suites, which are not waved.

| Key | Type | Domain | Frontend suites (wave) | Backend suites (not waved) | Gaps |
|-----|------|--------|------------------------|----------------------------|------|
| VCST-7006 | Bug | Security | 008 (W5), 032, 044 (W1) | 027, 027b, 050d | GAP-01 |
| VCST-6974 | Bug | Security | 008 (W5), 032, 044 (W1) | 026, 027b, 050d | GAP-02 |
| VCST-6970 | Bug | Security | 006 (W5), 032, 044 (W1) | 020, 026, 050d, 110a | GAP-03 |
| VCST-6861 | Story | Subscriptions | 002 (W3), 011, 124 (W2), 046 (W6) | 050p, 125 | GAP-12 |
| VCST-6862 | Story | Subscriptions | 002 (W3), 011, 028, 124 (W2), 046 (W6) | 050p, 125 | GAP-08, GAP-12 |
| VCST-6867 | Story | Subscriptions | 014, 124 (W2) | 050p | GAP-11 |
| VCST-6909 | Story | Subscriptions | 124 (W2), 046 (W6) | — | GAP-09, GAP-12 |
| VCST-6910 | Story | Subscriptions | 124 (W2) | 050p | GAP-10 |
| VCST-6913 | Story | Subscriptions | 014, 124 (W2) | 050p | GAP-11 |
| VCST-6498 | Task | Auth | 031 (W1), 111 (WX) | 050d, 101, 110, 110a | GAP-04 |
| VCST-6490 | Bug | Auth | 104 (WX) | 105 | GAP-05 |
| VCST-6688 | Bug | Auth | 033 (W1), 111 (WX) | 110, 110a | — |
| VCST-6632 | Bug | Auth | — | 101, 115 | GAP-07 |
| VCST-6290 · 6291 · 6292 · 6233 · 6744 | Task | UI kit | 008 (W5), 014 (W2), 045, 048c, 070, 071 (W6) | — | GAP-29 |
| VCST-6493 | Task | UI kit | 014 (W2), 048c, 071 (W6) | — | GAP-30 |
| VCST-6876 … 6880 | Task | UI kit | 042 (W0), 048c (W6) | — | GAP-31 |
| VCST-6901 | Bug | UI kit | — (Storybook story only) | — | — |
| VCST-6949 | Bug | UI kit / a11y | 045, 070 (W6) | 060 | GAP-27 |
| VCST-6117 | Bug | UI kit / a11y | 007 (W5), 045 (W6) | — | GAP-28 |
| VCST-6679 | Bug | UI kit | 036 (W3), 048c (W6) | — | GAP-32 |
| VCST-6237 | Task | Company | 006 (W5), 033 (W1) | — | GAP-33 |
| VCST-5918 | Story | Catalog & compare | 098 (WX) | 050q, 123c | — |
| VCST-5640 | Bug | Catalog & search | 001, 002, 003, 004, 005 (W3) | 050a | GAP-14 |
| VCST-6255 | Story | Sales Rep | 093, 093b, 116 (W4) | 050m, 050m3 | — |
| VCST-6256 | Story | Sales Rep | 089, 091 (W4) | — | GAP-17 |
| VCST-6257 | Story | Sales Rep | 091, 093b (W4) | 050m, 050m3 | — |
| VCST-6670 | Story | Sales Rep | 089, 093 (W4) | — | GAP-16 |
| VCST-6794 | Task | Sales Rep | 089 (W4) | — | GAP-17 |
| VCST-6476 | Bug | Sales Rep | 089, 093 (W4) | 050m | — |
| VCST-6572 | Story | Site Builder | — (no Frontend suite) | 123 | GAP-24 |
| VCST-6571 | Story | Site Builder | — | 123, 123b | — |
| VCST-6842 | Story | Site Builder | — | 118, 123, 123b | GAP-25 |
| VCST-6950 | Bug | Site Builder | — | 123, 123b | GAP-23 |
| VCST-6570 | Bug | Site Builder | — | 059, 060 | GAP-26 |
| VCST-6483 | Bug | Orders | — | 017, 017b, 018 | GAP-19 |
| VCST-6755 | Story | Orders / Punchout | 011, 014, 028 (W2), 109 (WX) | 050b1, 050c, 113 | GAP-20 |
| VCST-6764 | Story | Punchout | 109 (WX) | 108, 113 | GAP-21 |
| VCST-6941 | Story | Punchout | 107, 109 (WX) | 108 | GAP-22 |
| VCST-6258 | Story | Account dashboard | 120 (W2) | — | GAP-18 |
| VCST-6946 | Story | Admin Shell | — | 020b | GAP-34 |
| VCST-6936 · 6935 | Bug | Admin Shell | — | 020b, 049 | GAP-35 |
| VCST-6928 | Bug | Admin Shell | — | 020, 020b | GAP-36 |
| VCST-6324 | Bug | Admin Shell | — | 034, 066 | GAP-37 |
| VCST-6639 | Story | Admin Shell | — | 118 | — |
| VCST-6736 · 6983 | Task | Admin Shell | — | 020b | — |
| VCST-6859 | Task | Platform | 042 (W0) | 078 | — |
| VCST-6839 · 6912 | Story / Task | Platform | — | 049 | — |

**Coverage summary:** 58 test-relevant tickets. Every Story and Bug reaches at least one activated suite, except VCST-6572 (storefront Site Builder — no Frontend suite, GAP-24) and VCST-6901 (a Storybook story, no storefront surface). Back-office tickets run outside the waves ("only theme").

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

| Ticket | Storefront | API / xAPI | Back office | Check |
|--------|-----------|------------|-------------|-------|
| VCST-7006 invite / role change | company members: invite, change role | `inviteUser`, `changeOrganizationContactRole` with a role outside the allow-list and inside it | user roles | Forbidden role refused and not stored; allowed role assigned |
| VCST-6974 create user / contact | registration, company members | `createUser`, `createContact`, `updateContact` with caller-supplied roles, member, organizations | user + contact | Caller-supplied values ignored or refused; own account and organization only |
| VCST-6970 update user | account profile | `updateUser` as a self-registered buyer with `UserType` / roles, and as a user manager | user type + roles | Buyer changes profile fields only; a user manager still can |
| VCST-6861 … 6913 subscriptions | PDP → cart line → checkout → account → order history | 050p | subscription record, emails (125) | One subscription seen identically on every page; pause / skip / cancel reflected everywhere |
| VCST-6169 / 6490 OTP | sign-in page per store | 105 (OTP API) | store authentication types, sign-in log | OTP offered only where enabled; a code works once |
| VCST-5918 compare | compare page from the module plugin | 050q | store compare settings (123c) | A registered user's list survives sign-out / sign-in and a second browser |
| VCST-6755 PO line number | punchout requisition | cart / order line, cXML OrderRequest | order line | The number set on the cart line reaches the order and the cXML |
| VCST-6950 Preview as | storefront in preview | preview auth code exchange | Site Builder designer | Renders as the chosen customer; a replayed code is refused |

---

## 13. References

- `vc-frontend` PRs merged in the window (all deployed in alpha.2681): #2655, #2654, #2626, #2665, #2648, #2625, #2669, #2671, #2639, #2666, #2618, #2673, #2617, #2656, #2675, #2635, #2681, #2684, #2687, #2630, #1729, #2682, #2693, #2689, #2688, #2690, #2686, #2699, #2683, #2695, #2667, #2700, #2677, #2680, #2702.
- Module and platform PRs: per ticket in §2 and §11 (188 merged in the window, most of them release bumps).
- Deploy: vc-deploy-dev#7158 (env upgrade to Platform 3.1101.0 + theme alpha.2681, merged 2026-11-25).
- Knowledge: `.claude/knowledge/domain/sitemap.md` (rev 15), `.claude/knowledge/execution/module-suite-map.md`, `bl:extract` per domain, `.claude/knowledge/oracles/e-commerce-edge-cases-library.md`.
- Manifest: `config/test-suites.json`; sizes from `npm run regression:plan`.
- Waves: `regression/releases/sprint-26-23/` (`PLAN.md`, `release.json`, `PROGRESS.md`); regression ticket VCST-6853.
- Previous plan: `docs/Sprint plans/sprint-26-22-test-plan.md`.
