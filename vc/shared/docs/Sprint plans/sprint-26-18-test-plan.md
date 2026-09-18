# Sprint 26-18 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-09-18
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-09-07 – 2026-09-21 *(quoted from the Jira sprint object `VCST Sprint 26-18`, id 2715, board 126 — **not** inferred, unlike 26-17)*

> **⚠ This sprint is still OPEN.** Built 2026-09-18, three days before close. **101 of 158** issues are not Done (35 To do, 18 In progress, 10 On hold, 10 In review, 9 Ready for test, 5 Reopen, 5 Cancelled, 3 Draft, 3 Tested, 2 Testing, 1 REFINEMENT). Scope below is the **Done** set. Re-run `/qa-test-plan Sprint26-18` after close to capture the delta.

> **⚠ The QA environment is not on a stable platform line.** `vcst-qa` reports
> `3.1066.0-alpha.13384-vcst-5378-unified-buyer-flow` — a **pre-release build pinned to VCST-5378**
> (Universal Commerce Protocol — Authenticated User Flow, High), which is currently in **`Reopen`**.
> Every result in this plan is therefore produced against an in-flight build of a reopened story, not
> against a stable line carrying this sprint's work. See §7.1 — this is the plan's single largest
> validity threat and nothing QA controls resolves it.

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-18 (`VCST Sprint 26-18`, Jira sprint id 2715) |
| Date range | 2026-09-07 – 2026-09-21 (quoted from the sprint object) |
| Theme | **The shared UI kit and the Sales Rep hub are both rebuilt underneath live features.** Six UI-kit tickets change rendering every storefront surface goes through; the Sales Rep hub moves to federated-plugin loading in the same window as a total-outage fix; Loyalty Missions absorbs nine follow-up defects; and order price visibility becomes a server-side overridable contract |
| Done tickets | **57** — 14 Stories, 19 Bugs, 15 Tasks, 3 TechDebt, 2 Spikes, 4 Review tasks |
| **Of which out of scope** | **21** — 3 `vc-shell` bugs (separate product), 4 Review tasks, 3 `[Agentic QA]` tooling, 3 QA run activities, 2 env module bumps, 2 `[AI Powered Demo]`, 1 CI infra, 1 architecture map, 1 QA suite re-author, 1 spike with no shipped code |
| **Test-relevant Done tickets** | **36** — 11 Stories + 16 Bugs + 5 Tasks + 3 TechDebt + 1 Spike |
| Merged PRs in `vc-frontend` | **23** |
| Merged PRs in modules + platform | **23** across 13 repos (18 module + 5 `vc-platform`) |
| Merged PRs org-wide in window | **~690** (667 outside `vc-frontend`, plus the 23 above) — overwhelmingly `vc-content-pages` docs and bot PRs. The **VCST-linked** subset is **~96**: 75 outside `vc-frontend`/`vc-content-pages`, plus 21 of the 23 `vc-frontend` PRs |
| Non-product repos in window | `vc-deploy-dev` **27** · `vc-mcp-testing-module` **12** · `vc-shell` **8** · `vc-modules` **7** · `.github` **3** |
| Storefront sitemap | Refreshed to **rev 9** at Step 0 (platform line 3.1062.0 → **3.1066.0-alpha.13384-vcst-5378**, products 4,626 → **4,550** — a net **decrease** of 76; nav categories 53 and `/products-with-options` 7 unchanged). **Only the deterministic axis was applied:** the crawler reported the local `vc-frontend` checkout as behind `origin/dev` (local `17c99c7c` @ 2026-08-26), so the route map was *not* rewritten from a stale source |

**The headline number is not the scope ratio this time — it is the concentration.** 36 test-relevant items
is more than double 26-17's 17, but they cluster: **nine** tickets land on Loyalty Missions and **six** on
the shared UI kit. Two domains hold 42% of the in-scope work, and in both cases the changes are to code
that *other* features render through. The blast radius of this sprint is materially larger than its diff.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant — 11 of 14 Done)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-3912 | **High** | [Support] #38981 **Price restriction** — order price visibility moves out of `OrderAuthorizationHandler` into `ICustomerOrderDataProtectionService`; every read/save/patch/export/import path now routes through it; orders carry a new `withPrices` wire flag the admin UI reads instead of re-deriving the rule client-side | Pricing / Orders | vc-module-order #472 |
| VCST-5024 | Medium | [E2E][Loyalty] Earned/redeemed loyalty points totals at the **organization** level — multiple managers earn and redeem against one outlet, while transactions stay on the contact level for stats | Loyalty | vc-module-loyalty #17, vc-frontend #2475 |
| VCST-5547 | Medium | [Condition tree][User groups] A text link in the user-group condition opens a blade listing the contacts in the selected group(s) — across Promotions, Loyalty missions and Pricelist assignment | Catalog admin / User groups | vc-module-customer #315, vc-module-core #257 |
| VCST-5317 | Medium | Hide locked organizations from the header org switcher (`GetOrganizations` / `SearchOrganizationsQuery` scopes by `UserId`, filters `IsCurrentlyLocked`) | B2B / Org switcher | vc-frontend #2469, #2483, vc-module-profile-experience-api #145, vc-module-customer #316 |
| VCST-5851 | Medium | [Support][Innovadis][Mustad] Dictionary **"Priority"** sorted storefront facets in reverse, contradicting the "lowest value used first" hint — admin can now pick priority **ascending or descending** | Search / Facets | vc-module-catalog #906 |
| VCST-5725 | Medium | [Support][Innovadis] Asset Library: **warn before overwriting** an asset with the same filename | Page Builder / Assets | vc-module-pagebuilder #162 |
| VCST-5735 | Medium | Update **compare products** design | Product Compare | vc-frontend #2452 |
| VCST-5097 | Medium | [UI Kit] Date Picker component (**Range**) — new component | UI kit | vc-frontend #2402 |
| VCST-5891 | Medium | [UI-kit] Update **VcButton** layout (sentence case) | UI kit | vc-frontend #2470 |
| VCST-5652 | Medium | Update **VcButton icon sizes** | UI kit | vc-frontend #2470 |
| VCST-5653 | Medium | [UI-Kit] **Focus indicators** — WCAG 1.4.11 / 2.4.7 | UI kit / A11y | vc-frontend #2468 |

> **VCST-3912 is the sprint's quietest high-impact change.** It adds no screen; it relocates the decision
> "may this user see prices?" for *every* order path — search, indexed search, get by id/number/outer id,
> save, patch, export, import. The ticket states export and several save paths were **previously
> uncovered**, so the new behaviour is strictly broader than the old. A wrong answer either leaks prices
> or zeroes them on save — and the save direction **writes**, so it is not recoverable by re-reading.

> **VCST-5317's title and its own AC-1/AC-2 disagree, and the disagreement is unresolved.** The summary
> says locked orgs are *excluded* from `GetOrganizations`; AC-1 says the locked org **is displayed, with a
> Locked label**, and AC-2 says `items[]` contains all org ids. Those are different products. AC-6 (all
> memberships locked) is marked in the ticket itself as *"exact UX is a product decision to confirm"* —
> and this repo's own knowledge records that an all-locked user is routed to `/403`. **Resolve with the PO
> / VirtoOZ before any verdict is written**; do not let a tester adopt whichever reading the build happens
> to satisfy. Tracked as an entry-criteria blocker in §7.1.

### 2.2 Bugs Fixed (QA-relevant — 16 of 19 Done)

| Key | Pri | Summary | Domain | PR |
|-----|-----|---------|--------|-----|
| VCST-5952 | **High** | Admin SPA: blade context not cleared on sign-out — the orders grid enters an **unbounded `$digest` loop** after two in-tab re-logins | Platform / Admin SPA | vc-platform #3115 |
| VCST-5905 | **High** | `salesRepCustomerOrders` returns **`TYPE_LOAD`** on released XOrder 3.1011.0 — the Sales Rep customer-orders surface was **fully down**. Assembly-level breaking change: `IXOrderMapper` moved `.Data` → `.Core`; SalesRep 3.1007.0 was compiled against the old home, so DI could not construct the handler at all | Sales Rep / xAPI | vc-module-sales-rep #19 |
| VCST-5900 | **High** | [Support] Admin SPA password-reset deep link intermittently redirects to login (**race** with the 500 ms `loginDialog` redirect) | Platform / Auth | vc-platform #3111 |
| VCST-5849 | **High** | [Support] HTTP 500 `Violation of PRIMARY KEY constraint 'PK_Item'` when linking a product **that has variations** into a virtual catalog — the link re-inserts existing variation rows. 100% repeatable; blocks an Innovadis/Heras platform update | Catalog admin | vc-module-catalog #905 |
| VCST-5909 | **High** | [Missions] The notification toast never disappears | Loyalty / Missions | vc-frontend #2471 |
| VCST-5916 | Medium | [Loyalty] Points history: **"Operation" column empty** for every mission-granted row | Loyalty | vc-module-loyalty #16, vc-frontend #2473 |
| VCST-5910 | Medium | [Missions] Date badge collapses **three** designed states into two (amber for every live mission, red from 10 days out) | Loyalty / Missions | vc-frontend #2471 |
| VCST-5825 | Medium | [Missions] Order-value mission card shows amount spent but **never its target** — AC "I must see the goal" unmet | Loyalty / Missions | vc-frontend #2471 |
| VCST-5831 | Medium | [Missions] SKU mission modal at **375 px** truncates every product name | Loyalty / Missions (mobile) | vc-frontend #2471 |
| VCST-5912 | Medium | [Missions][a11y] Quantity spinbutton exposes `aria-invalid=true` and a wrong `aria-valuenow` **on untouched render** (WCAG 4.1.2) | Loyalty / Missions (a11y) | vc-frontend #2484 |
| VCST-5911 | Medium | [Missions][a11y] warning-500 status dot at **2.09:1** (WCAG 1.4.11); open-ended missions convey status **by colour alone** | Loyalty / Missions (a11y) | vc-frontend #2479 |
| VCST-5838 | Low | [Missions][a11y] Dark mode: active pagination page number at **4.37:1** (needs 4.5) | Loyalty / Missions (a11y) | vc-frontend #2478 |
| VCST-5940 | Medium | Notifications: **Preview renders the raw `{{blade.html}}` binding** instead of the sent message | Admin / Notifications | vc-module-notification #203 |
| VCST-5847 | Medium | [Page Builder] Designer preview renders the designer **recursively** when the access token expires | CMS / Page Builder | vc-module-pagebuilder #161 |
| VCST-5370 | Medium | Elastic App Search **relevance field** support | Search | vc-module-elastic-app-search #51 |
| VCST-5282 | Low | [Catalog][Admin] User Groups widget — assigned group name **duplicated** (title + description render the same value) | Catalog admin / Personalization | vc-module-catalog-personalization #90, vc-modules #70 |

> **Five of the six non-a11y Missions bugs were fixed in a single PR (`vc-frontend #2471`), and three of
> the nine Missions tickets are a11y.** That concentration is the §3 Likelihood-5 justification: one PR
> touching toast lifecycle, date-badge state derivation, card content and modal layout at once is exactly
> the shape that regresses a sibling behaviour without failing its own review.

### 2.3 TechDebt / Structural (QA-relevant — may touch hot paths or selectors)

| Key | Pri | Summary | Domain | PRs |
|-----|-----|---------|--------|-----|
| VCST-5159 | Medium | **(Spike, shipped)** Frontend Modularity — **Sales Rep Hub as a Plugin**: the app-initialization query now returns a plugin list and the frontend loads plugins via **MF2 module federation** | Sales Rep / app bootstrap | vc-frontend #2445, #2427 |
| VCST-4386 | Medium | [E2E][Skyflow] Move **Skyflow to a separate frontend module** — type generation failed when the Skyflow backend module was absent, so it is decoupled from the core bundle | Payment | vc-frontend #2440 |
| VCST-5472 | Medium | **VcTable**: custom `#header` / `hideDefaultHeader` drops the selection column while the body keeps it (**column misalignment**); now exposes selection scope and `headAttrs` on the `#header` slot | UI kit / Grids | vc-frontend #2459 |
| VCST-5890 | Medium | [Sales Rep] Reuse **VcTabSwitch** for rule chips | Sales Rep (selectors) | vc-frontend #2474 |
| VCST-5701 | Medium | [UI-Kit] **VcScrollbar**: auto tab stop does not react to prop changes | UI kit / A11y | vc-frontend #2455 |
| VCST-5771 | Medium | [FE][Security] Harden **three untrusted-input sinks** in `client-app` | Storefront security | vc-frontend #2460 |
| VCST-5772 | Medium | [FE][Security] Clear scanner noise: 3 false positives + 8 dev-script findings | Storefront security | vc-frontend #2461 |
| VCST-5773 | Medium | [FE][Security] Pin GitHub Actions to SHAs; gate freshly published npm releases | CI supply chain | vc-frontend #2462 |
| VCST-5686 | Medium | Hangfire → **BackgroundJob (RabbitMQ) Step 2 — Cancellation** | Platform / Jobs | vc-platform #3097, vc-module-search #145, vc-module-image-tools #125, vc-module-background-jobs #3 |

**`VCST-5159` is the structural item that matters most, and it is filed as a Spike.** Moving the Sales Rep
hub from statically bundled to **federation-loaded at runtime** changes *when and whether* that code exists
in the page. Its failure modes — a plugin that fails to resolve, loads twice, or loads after the route that
needs it — produce a blank or partial hub, not an exception in the diff. It landed in the same window as
VCST-5905 (a total outage of the same surface, now fixed) and VCST-5890 (a selector change on the same
surface). **Three changes, one surface, one window** — and because it is typed as a Spike, it carries no
acceptance criteria to test against. Treat the shipped PRs as the specification and say so in the verdict.

### 2.4 Out of Scope

- **`vc-shell` / Vendor Portal — 3 Done bugs** (VCST-5860 view-mode toggle has no accessible name, VCST-5861 blade-toolbar disabled state, VCST-5862 25 Light-theme contrast violations) and **8 merged PRs**. A **separate product**: no Coffee theme, and this repo's storefront selectors, `BL-UI` invariants, P0-route set and regression suites are all inapplicable. Tested against `vcmp-dev` + hosted Storybook, not `FRONT_URL`. Disqualifier **D2** in §5.3 — not a coverage gap. *(The three fixes merged 2026-09-04, just before the window; the tickets closed in-sprint.)*
- **`[Agentic QA]` internal tooling — VCST-5922** (token-consumption review), **VCST-5776** (knowledge-base architecture ADR), **VCST-5774** (vc-fix PAT in plaintext) + 12 `vc-mcp-testing-module` PRs. This repo's own tooling, no product surface.
- **QA suite maintenance — VCST-5959** ([QA] re-author 075-loyalty + 083-loyalty-catalog). Not a product change, but it **rewrites two suites this plan maps against** — see the §5.1 / §6 note.
- **QA run activities — VCST-5892** (smoke on Virtostart), **VCST-5764** (regression on QA, theme only), **VCST-5768** (load test). Executions, not changes.
- **Environment / CI — VCST-5895, VCST-5698** (module bumps on vcst environments), **VCST-5146** (configurable Elasticsearch version + search provider in `docker-env-full`; `.github` #88/#92/#93, `vc-github-actions` #408, `vc-platform` #3116) + **27 `vc-deploy-dev` PRs**.
- **Internal / demo — VCST-5708** ([AI Powered Demo] vc-quotes skill), **VCST-5658** ([AI Powered Demo] refactoring/hardening), **VCST-5491** (Interactive Solution Architecture Map).
- **Spike with no shipped code — VCST-3893** (GA4 Analytics Beacon Architecture). Its implementation ticket **VCST-6017** is `To do` in the next sprint.
- **Code Review tasks (4) — VCST-5927, 5926, 5889, 5778.** No user-facing change.
- **Not Done, therefore not in scope — but live risk this sprint tests around:** **VCST-5378** (High, **`Reopen`**) UCP Authenticated User Flow — *and the QA platform build is pinned to it*, see the banner · VCST-5817 (In progress) search input travels 115 px on category-scope change · VCST-6016 (Ready for test) path-traversal / unbounded-recursion in Assets & Content storage providers · VCST-6007 (To do) failed auto-test runs.

---

## 3. Risk Assessment

5×5 Likelihood × Impact per `.claude/skills/qa-risk/risk-prioritization-framework.md`. Grouped by **domain**, not by ticket.

| Domain | L | I | Score | Level | Rationale |
|--------|---|---|-------|-------|-----------|
| **Loyalty — Missions & points** | 5 | 4 | **20** | Critical | **Nine** Done tickets, five of them in one PR (`#2471`). Spans toast lifecycle, date-badge state derivation, card content, 375 px modal layout, three a11y defects, the points-history "Operation" column, **and** a new org-level earned/redeemed aggregation (VCST-5024) that changes what the number *means* — from per-contact to per-outlet across multiple managers. Highest concurrent-change count in the sprint, on a surface whose 26-17 test model already recorded **FAIL** |
| **UI kit — shared rendering** | 5 | 4 | **20** | Critical | **Six** tickets change components every storefront surface renders through: VcButton layout **and** icon sizes (#2470, one PR, two tickets), the global focus ring (#2468), a brand-new DateRangePicker (#2402), VcTable's selection column (#2459), VcScrollbar tab stops (#2455). The rendered blast radius is strictly larger than the diff — a VcButton regression reaches cart, checkout and auth without any of those files changing |
| **Sales Rep — hub & customer orders** | 5 | 4 | **20** | Critical | Three changes, one surface, one window: VCST-5159 moves the hub to **MF2 federated plugin loading** (a Spike, so no ACs), VCST-5905 fixed a **total outage** (`TYPE_LOAD` — DI could not construct the handler), VCST-5890 swapped rule chips onto VcTabSwitch (**selector change**). VCST-5905's own report names the suites at risk: 091/093/097 storefront, 050m/050m2 backend |
| **Pricing — order price visibility** | 4 | 5 | **20** | Critical | VCST-3912 relocates the price-visibility decision into `ICustomerOrderDataProtectionService` and routes **every** order path through it, including export and save paths the ticket says were **previously uncovered**. Price visibility is a data-protection outcome; the **save** direction writes zeroed prices back, so a wrong answer is not recoverable by re-reading |
| **Platform auth & Admin SPA session** | 4 | 5 | **20** | Critical | Two High bugs on the session boundary: an **unbounded `$digest` loop** after two in-tab re-logins (VCST-5952) and a **race** between a password-reset deep link and the 500 ms `loginDialog` redirect (VCST-5900). Both timing-dependent, both on auth, both fixed in `vc-platform` in the same window |
| **Search & facets** | 3 | 5 | **15** | High | VCST-5851 **inverts** facet ordering semantics — a behaviour two named customers already depend on — and VCST-5370 adds relevance-field support to the Elastic App Search provider. Search is the first surface a shopper uses after browse, and ranking defects are silent |
| **Payment — Skyflow modularization** | 3 | 5 | **15** | High | VCST-4386 changes **how Skyflow payment code is bundled** — core → separately loaded frontend module. Impact is P0 (payment); likelihood is bounded because it is a packaging change, not a logic change. The failure mode is *absence* — the module not loading — which looks like a missing payment option, not an error |
| **Catalog admin — virtual catalog & user groups** | 4 | 3 | **12** | High | VCST-5849 (HTTP 500 `PK_Item`, 100% repeatable, blocks a customer platform update), VCST-5547 (new contacts blade off the condition tree, reused by Promotions/Missions/Pricelists), VCST-5282 (duplicated group name). Admin-facing so impact is bounded, but VCST-5849 is a **hard blocker** for its reporter |
| **B2B — org switcher / locked orgs** | 3 | 4 | **12** | High | VCST-5317 spans four repos, and **its title contradicts its own AC-1/AC-2** (exclude vs. show-with-Locked-marker). AC-6 (all memberships locked) is flagged in the ticket as an unconfirmed product decision. A specification ambiguity on a permission surface is a larger risk than the code change |
| **Storefront security — untrusted-input sinks** | 3 | 4 | **12** | High | VCST-5771 hardens three untrusted-input sinks in `client-app`. The regression direction of a sanitiser fix is **over**-sanitising — legitimate customer content (product descriptions, CMS rich text) silently stripped or escaped. VCST-5772/5773 are scanner hygiene and supply-chain pinning |
| **Product Compare** | 3 | 4 | **12** | High | VCST-5735 redesigns compare. It was **`Reopen` during 26-17** — which is exactly why 26-17 recorded suite 098 as deliberately *not* activated. It is now Done, so 098 returns to scope this sprint (§5.1) |
| **Platform jobs & Admin notifications** | 3 | 3 | 9 | Medium | VCST-5686 (Hangfire → RabbitMQ **cancellation**, four repos) and VCST-5940 (notification preview rendered a raw `{{blade.html}}` binding). Admin-facing and bounded, but cancellation semantics are easy to get half-right — a job that reports cancelled and keeps running |
| **CMS / Page Builder & Asset Library** | 3 | 2 | 6 | Medium | VCST-5847 (recursive designer render on token expiry — carried from 26-17, where it was still *Testing*) and VCST-5725 (asset-overwrite warning) |
| *`vc-shell` / Vendor Portal* | — | — | — | *Out of scope* | 3 Done bugs, 8 PRs, **separate product** (§2.4). Not scored; not a gap |

**Five Critical domains against 36 test-relevant tickets — and the shape differs from 26-17.** Last
sprint's Criticals were *silent-failure* defects (paging, mapping, money). This sprint's are
**concentration** risks: three of the five (Loyalty, UI kit, Sales Rep) are Critical because many changes
landed on one surface at once, not because any single change is dangerous. That changes the strategy —
§4.2 prioritises **sibling-regression sweeps over the unchanged behaviours of a changed component**, which
is exactly what a per-ticket verification pass does not do.

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront | Admin SPA | REST | GraphQL xAPI | A11y | Analytics |
|--------|-----------|-----------|------|--------------|------|-----------|
| Loyalty — Missions & points | ✅ **primary** | ✅ (missions + points admin) | — | ✅ | ✅ **primary** | — |
| UI kit — shared rendering | ✅ **primary** | — | — | — | ✅ **primary** | — |
| Sales Rep — hub & customer orders | ✅ **primary** | ✅ (permissions) | ✅ (control) | ✅ **primary** | — | — |
| Pricing — order price visibility | ✅ | ✅ **primary** | ✅ **primary** | ✅ | — | — |
| Platform auth & Admin SPA session | — | ✅ **primary** | ✅ | — | — | — |
| Search & facets | ✅ **primary** | ✅ (facet settings) | — | ✅ | — | — |
| Payment — Skyflow modularization | ✅ **primary** | — | — | ✅ | — | — |
| Catalog admin — virtual catalog & user groups | — | ✅ **primary** | ✅ | — | — | — |
| B2B — org switcher / locked orgs | ✅ **primary** | ✅ (lock/unlock setup) | ✅ (`/connect/token`) | ✅ **primary** | — | — |
| Storefront security — input sinks | ✅ **primary** | ✅ (author the content) | — | — | — | — |
| Product Compare | ✅ **primary** | — | — | ✅ | ✅ | — |
| Platform jobs & Admin notifications | — | ✅ **primary** | ✅ | — | — | — |
| CMS / Page Builder & Assets | ✅ | ✅ **primary** | — | — | — | — |

### 4.2 Testing Approach by Priority

**Critical first, and the ordering inside Critical is by how much *unchanged* behaviour sits behind the
change.** This sprint's Criticals are concentration risks (§3), so the defect to hunt is the sibling
regression — a behaviour nobody touched, rendered through a component somebody did.

1. **UI kit (20) — sweep, do not spot-check.** Six tickets, two of them (`#2470`) in one PR. Verify
   VcButton, the focus ring, VcTable and VcScrollbar **on surfaces the diff never mentions** — cart,
   checkout, auth, the account menu, Admin-adjacent grids. `BL-UI-001…006` layout invariants are the
   oracle. The new DateRangePicker gets component-level coverage in its own right (Storybook + a11y),
   because a brand-new component has no prior behaviour to regress.
2. **Loyalty Missions & points (20) — separate the five-in-one-PR fixes.** Verify VCST-5909/5910/5825/5831
   independently, then re-run the *unmentioned* Missions behaviours (progress, completion, reward credit,
   reward spend). Treat VCST-5024 as a **semantics change, not a display change**: assert an org-level
   total is the aggregate across managers of one outlet while per-contact transactions stay intact — and
   the two numbers must be **different** for the fixture to be discriminating (`.claude/rules/test-data.md`
   SECOND RULE). Equal values on both sides of the distinction under test are a data defect.
3. **Sales Rep hub (20) — prove the plugin actually loaded before believing any result.** VCST-5159's
   failure mode is absence, so establish plugin-loaded / not-loaded as an explicit precondition; then
   re-verify `salesRepCustomerOrders` against the released module trio, and re-point selectors after the
   VcTabSwitch swap. A green Sales Rep suite on a hub that silently failed to load is the trap here.
4. **Pricing — order price visibility (20) — test both directions, and test the write.** Permission
   present/absent × every path the ticket names (search, indexed search, get by id/number/outer id, save,
   patch, export, import). Assert the `withPrices` wire flag agrees with what was actually returned, and
   assert that a save by a price-blind user **restores** prices from storage rather than persisting zeroes.
   Export is called out as previously uncovered — cover it explicitly.
5. **Platform auth & Admin SPA session (20) — the repeat is the test.** VCST-5952 needs **two** in-tab
   re-logins (one will not reproduce it); VCST-5900 is a race against a 500 ms timer, so it needs
   repetition under varied timing, not a single pass.
6. **High (12–15)** — facet ordering in **both** directions against the dictionary hint (VCST-5851 is a
   semantics inversion two named customers already depend on); Skyflow present **and** absent at checkout;
   the `PK_Item` fix against a product *with* variations beside one without (the discriminating pair);
   VCST-5317 blocked on the §2.1 spec question; over-sanitising checks on legitimate rich content; compare
   via the re-activated suite 098.
7. **Medium (6–9)** — job cancellation (assert the job actually stops, not that the UI says cancelled),
   notification preview, Page Builder token expiry, asset-overwrite warning.

**Cross-cutting:** every Critical domain gets a cross-browser pass. **All three lanes are click-capable** —
`playwright-firefox` has been a full slot since 2026-09-08 (re-verified 2026-09-11), so unlike the 26-17
plan this one does **not** restrict Criticals to chrome + edge. HAR capture on every run; video records
always. Max 3 concurrent browser agents.

### 4.3 Test Design Techniques by Domain

| Domain | Techniques | Why this one |
|--------|-----------|--------------|
| Loyalty — Missions & points | **FLOW** first, then State Transition + EP | Mission lifecycle (not started → in progress → complete → reward credited → reward spent) is a state machine; the date badge is explicitly a **three**-state derivation that collapsed to two, so ST is the technique that names the missing state. EP over goal types. FLOW is mandatory — the 26-17 failure mode was cases that never placed an order |
| UI kit — shared rendering | Visual sweep + WCAG 2.2 AA checklist + BVA | Focus indicators are measurable WCAG criteria (1.4.11 / 2.4.7); VcButton icon sizing and VcTable column alignment are geometry, so BVA on size/scale boundaries. The sweep is the point — the risk lives on surfaces the diff does not name |
| Sales Rep — hub & customer orders | **FLOW** first, then Decision Table | The chain is *init query returns plugin list → MF2 loads it → route resolves → query resolves → rows render*, and it can break at any link while the next link still looks fine. Decision table over plugin-loaded × permission × role |
| Pricing — order price visibility | Decision Table + **Boundary-of-features** | One row per (path × permission × scope) with expected `withPrices` and expected price content. Boundary-of-features because the same order read two ways (REST vs GraphQL vs export) must agree — a two-path field diff is the only thing that catches a path the service was never wired into |
| Platform auth & Admin SPA session | State Transition + repetition-under-timing | Both defects are sequence- and timing-dependent; a single-pass functional check cannot see either |
| Search & facets | Decision Table + EP | Priority ascending × descending × equal-priority ties against the dictionary hint; EP over relevance-field configurations |
| Payment — Skyflow modularization | EP (present / absent / fails-to-load) + FLOW | The failure mode is absence, so the partitions are about module availability; then a full checkout FLOW through the surviving path |
| Catalog admin — virtual catalog & user groups | **Divergent-pair** + Error Guessing | VCST-5849 is only decidable with a product that **has** variations beside one that does not — the pair *is* the test. EG on re-link, retry and partial-link states |
| B2B — org switcher / locked orgs | Decision Table + State Transition | Membership state (unlocked / locked / lock expired) × switcher visibility × `/connect/token` outcome; ST covers AC-3's expiring lock. **Blocked on the §2.1 spec question** |
| Storefront security — input sinks | Error Guessing + **negative** EP | The regression direction is over-sanitising, so the cases that matter are *legitimate* content that must survive — the inverse of a security test |
| Product Compare | FLOW + EP | Add → compare → remove → empty state, with EP over item counts |
| Platform jobs & notifications | State Transition + Error Guessing | Cancellation is a state machine with a half-right failure (reports cancelled, keeps running); EG on cancel-during-start and cancel-twice |
| CMS / Page Builder & Assets | State Transition + Error Guessing | Token expiry and same-filename overwrite are both state-dependent |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

Classified by the layer directory each CSV lives under in `config/test-suites.json`, not by Jira component. **All 58 IDs verified present in the manifest (143 suites) and layer-checked — 24 Frontend, 34 Backend.** *(Independently re-verified by the orchestrator against the manifest: 58/58 present, 24/34 split exact.)*

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 042 | Smoke Tests | vc-frontend | VCST-5891, VCST-5652, VCST-5653 (site-wide UI-kit baseline), VCST-4386, VCST-5159 | P0 |
| 001 | Catalog Navigation | vc-module-catalog, vc-frontend | VCST-5851 (facet order on category pages); UI-kit consumer | P1 |
| 003 | Catalog Filters | vc-module-catalog, vc-frontend | VCST-5851 | P1 |
| 004 | Search Core | vc-module-elastic-app-search | VCST-5370 (relevance field) | P1 |
| 005 | Search Filters & Advanced | vc-module-catalog, vc-module-elastic-app-search | VCST-5851 (**already carries 6 direct VCST-5851 refs**), VCST-5370 | P1 |
| 098 | Product Compare v2 | vc-frontend | VCST-5735 — **ACTIVATED this sprint** (see decision note below) | P2 |
| 006 | B2B Organization | vc-module-customer, vc-frontend | VCST-5317 (locked-membership exclusion) | P1 |
| 033 | Auth Company & Account Menu | vc-frontend | VCST-5317 (the header org switcher is this suite's surface) | P1 |
| 008 | B2B Members | vc-module-customer, vc-frontend | VCST-5547 (user-group → customers), VCST-5472 (VcTable consumer) | P1 |
| 031 | Auth Login & Register | vc-platform, vc-frontend | VCST-5900 (storefront twin of the reset-link race) | P1 |
| 044 | Security Tests | vc-frontend | VCST-5771, VCST-5772, VCST-5773 | P0 |
| 045 | Accessibility Tests | vc-frontend | VCST-5653, VCST-5912, VCST-5911, VCST-5838 | P2 |
| 048c | Layout Stability (runner-native) | vc-frontend UI kit | VCST-5891, VCST-5652, VCST-5653, VCST-5472 — `BL-UI-001…006` carriers | P1 |
| 040a | Payment — Skyflow | vc-frontend | VCST-4386 (Skyflow → separate frontend module) | P0 |
| 041 | Payment Cross-Cutting | vc-frontend | VCST-4386 | P0 |
| 083 | Loyalty Catalog Browsing | vc-module-loyalty, vc-frontend | VCST-5916 (adjacency) — ⚠ **re-authored by VCST-5959 this sprint** | P1 |
| 083c | Loyalty Missions Storefront | vc-frontend | VCST-5909, VCST-5910, VCST-5825, VCST-5831, VCST-5912, VCST-5911, VCST-5838 | P1 |
| 083d | Loyalty Missions E2E | vc-frontend | the same seven missions tickets | P1 |
| 083e | Loyalty Organization Balance Storefront | vc-module-loyalty, vc-frontend | VCST-5024 | P1 |
| 089 | Sales Rep — My Customers | vc-module-sales-rep, vc-frontend | VCST-5159, VCST-5472, VCST-5890 | P1 |
| 091 | Sales Rep — Customer Profile | vc-module-sales-rep, vc-frontend | VCST-5159 | P1 |
| 093 | Sales Rep — Hub Dashboard | vc-module-sales-rep, vc-frontend | VCST-5159 (hub load mechanism), VCST-5890 (rule chips → VcTabSwitch) | P1 |
| 097 | Sales Rep — Customer Orders | vc-module-sales-rep, vc-frontend | VCST-5905 (total-outage fix) | P1 |
| 100 | Catalog Personalization — Storefront Visibility | vc-module-catalog-personalization | VCST-5547, VCST-5282 (secondary) | P0 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite | Name | Module | Sprint trigger (VCST keys) | Priority |
|---|---|---|---|---|
| 078 / 078b / 078c / 078d | Backend Smoke (4-way split) | cross-cutting | Whole-sprint P0 baseline; VCST-5952, VCST-5686 | P0 |
| 049 | Platform API | vc-platform, vc-module-order | VCST-3912 (order-module extension points), VCST-5686 | P0 |
| 050a | GraphQL xCatalog | vc-module-x-catalog | VCST-5851, VCST-3912 (price hiding in xAPI), VCST-5370 | P1 |
| 050c | GraphQL xOrder | vc-module-x-order | VCST-3912 (vc-module-order #472) | P1 |
| 050d | GraphQL xProfile | vc-module-profile-experience-api | VCST-5317 (`GetOrganizations` excludes locked — PR #145) | P1 |
| 050m | GraphQL xAPI — Sales Rep | vc-module-sales-rep | VCST-5905 (**55 `salesRepCustomerOrders` references — the outage's own oracle**), VCST-5159 | P1 |
| 050m2 | GraphQL Sales Rep — procedural | vc-module-sales-rep | VCST-5905 | P1 |
| 017 | Orders Admin Management | vc-module-order | VCST-3912, VCST-5952 | P1 |
| 017b | Orders Admin — Order Widgets | vc-module-order | VCST-5952 (the orders grid **is** the `$digest` surface) | P1 |
| 020 | Platform Users Roles & Settings | vc-platform | VCST-5952, VCST-5900 | P1 |
| 026 | Customer Contacts | vc-module-customer | VCST-5547 | P1 |
| 027 | Customer Orgs & Invites | vc-module-customer | VCST-5317 (#316), VCST-5547 | P1 |
| 051 | Catalog Admin Products | vc-module-catalog | VCST-5849 (virtual-catalog link with variations), VCST-5851 (priority authoring) | P1 |
| 053 | Catalog Admin Categories | vc-module-catalog, vc-module-catalog-personalization | VCST-5849, VCST-5282 (widget cases landed in commit `2e008906`) | P1 |
| 054 | Pricing Logic | vc-module-pricing, vc-module-order | VCST-3912 | P1 |
| 055 | Pricing Management | vc-module-pricing | VCST-3912 | P1 |
| 057 | Notifications Templates | vc-module-notification | VCST-5940 (#203) | P1 |
| 059 | Page Builder | vc-module-pagebuilder | VCST-5847 (#161) | P1 |
| 060 | Page Builder — Designer, Content & Storefront | vc-module-pagebuilder | VCST-5847 | P1 |
| 060b | Page Builder — Field Types, Asset Library & Operations | vc-module-pagebuilder | VCST-5725 (**cases already authored this sprint, carrying the ticket key**) | P1 |
| 061 | Search Indexing Admin | vc-module-elastic-app-search, vc-module-search | VCST-5370 (#51), VCST-5686 (search #145) | P1 |
| 062 | Assets | vc-module-assets | VCST-5725 | P1 |
| 069 | Image Tools | vc-module-image-tools | VCST-5686 (image-tools #125) | P2 |
| 075 | Loyalty | vc-module-loyalty | VCST-5916 (#16) — ⚠ **re-authored by VCST-5959 this sprint** | P1 |
| 075d | Loyalty Missions | vc-module-loyalty | VCST-5916, missions backend set | P1 |
| 075e | Loyalty Missions Admin | vc-module-loyalty | VCST-5916 | P1 |
| 075f | Loyalty Organization Balance | vc-module-loyalty | VCST-5024 (#17) | P1 |
| 092 | Sales Rep — Admin / VC-Shell App | vc-module-sales-rep | VCST-5159 | P1 |
| 092b | Sales Rep — Admin Embedded App | vc-module-sales-rep | VCST-5159 | P1 |
| 095 | Background Jobs — Hangfire Migration | vc-platform, vc-module-background-jobs | VCST-5686 (Step 2 — Cancellation) | P1 |
| 099 | Catalog Personalization (User Groups) | vc-module-catalog-personalization | VCST-5547, VCST-5282 (#90) | P1 |

**Decision — 098 Product Compare v2 (revisited from 26-17):** 26-17 explicitly recorded 098 as *not activated because VCST-5735 was `Reopen`*. It is now **Done** (vc-frontend #2452), so the reason for exclusion has lapsed. **Activated.** The suite's 35 cases were authored from the v2 test model (commit `0450045f`), i.e. against the design this ticket ships — so this is a re-run plus a selector/label refresh (§6.1), not a re-authoring.

> **⚠ Manifest finding — act on this before running `/qa-regression loyalty`.** The `loyalty` selection group resolves to `075, 075b, 075c, 083, 083b, 083c, 083d, 075f, 083e` — it **omits `075d` and `075e`** (Loyalty Missions + Missions Admin, **57 cases**). Running the group this sprint would silently skip the backend half of the nine missions tickets, which is the single largest ticket cluster in §3. **Activate the missions suites by explicit ID this sprint**, or fix the group in `config/test-suites.json` (owner: whoever next edits the manifest — not this plan). *Verified by the orchestrator: the group's `include` array is exactly as quoted, and 075d/075e declare 34 + 23 = 57 cases.*

**Not activated, recorded so the absence is a decision rather than an oversight:** **090** Sales Rep — My Sales Reps (buyer-facing; no 26-18 ticket touches it) · **002** Product Detail and the other storefront suites that merely *consume* the UI kit — VcButton / focus-ring are site-wide, so the baseline is carried by 042 + 048c + 045 rather than fanned across every consumer · **043** Google Analytics, **046** Localization, **047** Performance, **048** Browser Compatibility, **048d** SEO — no sprint trigger · **050b1–b5 / 050e–050l / 050n** — no xCart / xCMS / wishlist / push / marketing change in the Done set · **011–015, 028–030, 036–038, 070–074, 076–088, 094, 096** — no trigger · **VCST-5860/5861/5862 (`vc-shell`)** — **D2**, separate product, no QA surface in this repo.

---

### 5.2 Coverage Gaps — New Test Cases Needed

Every row is grounded in a grep actually run against `regression/suites/**/*.csv` (all 143 CSVs unless a narrower path is named). The grep is quoted in the Description so the claim is re-checkable. *(Orchestrator spot-checked GAP-01, GAP-03 and GAP-14 independently — all three confirmed at zero matches.)*

| GAP | Ticket | Description | Target suite(s) | Owner |
|---|---|---|---|---|
| GAP-01 | VCST-3912 | **Price restriction / hide-price extension points.** Grepped all suites for `hide price\|price restriction\|hidden price` → **zero matches**. The full case-title lists of 054 (32 cases) and 055 (33 cases) are create/edit/delete/assign/search/permission/tier/tax — **no case asserts a price is ABSENT for a restricted viewer**, on any surface. The feature's whole observable is a negative | 054 · 050a · 002 · 017 | test-management-specialist → qa-backend-expert |
| GAP-02 | VCST-5159 | **Sales Rep hub loads by federated plugin discovery.** Grepped for `federat\|remoteEntry\|plugin discovery` → **zero matches corpus-wide**. 093's 80 cases all assume the hub is mounted (SR-HD-001 asserts widgets render, SR-HD-003 asserts module-disabled absence) — none asserts what happens when *discovery itself* partially fails, times out, or returns a stale manifest. A load-mechanism change with no load-mechanism assertion | 093 (+ 089/091/097 as consumers) | test-management-specialist |
| GAP-03 | VCST-5097 | **DateRangePicker (Range mode) — no storefront UI-kit suite exists at all.** Grepped `config/test-suites.json` for `storybook\|ui-kit\|uikit` → zero suites. `date range\|date picker\|daterange` matches only Backend admin suites — those are admin date *filters*, not this component | **none** — propose `Frontend/cross-cutting/0XX-ui-kit-components.csv`, or extend 048c | test-management-specialist + ui-ux-expert |
| GAP-04 | VCST-5472 | **VcTable `#header` / `hideDefaultHeader` drops the selection column.** Grepped all Frontend suites for `hideDefaultHeader\|custom header\|#header` → **zero**. `VcTable\|selection column` matches only 008, 048c, 089, 090 — none in the custom-header configuration that *is* the defect | 048c · 089 | test-management-specialist |
| GAP-05 | VCST-5952 | **Admin SPA blade context not cleared on sign-out.** Grepped 020 / 017 / 017b / 078d for `digest\|re-login\|relogin\|blade context\|blade stack` → 2 incidental matches, **no case performs two in-tab sign-out→sign-in cycles**. The defect needs the *second* cycle; every existing case signs in once | 020 · 017b | qa-backend-expert |
| GAP-06 | VCST-5940 | **Notifications Preview renders raw `{{blade.html}}`.** 057 has 82 `preview` matches, but grepping it for `{{blade\|raw binding\|unrendered` → **zero**: every preview case asserts the blade *opens*, none asserts the body is a RENDERED message rather than a binding token | 057 | test-management-specialist |
| GAP-07 | VCST-5847 | **Page Builder designer renders recursively when the access token expires.** Grepped 059 + 060 for `token expir\|expired token\|session expir` → **zero**. No case exercises the designer across a token lifetime | 059 (or 060) | test-management-specialist |
| GAP-08 | VCST-5701 | **VcScrollbar auto tab-stop does not react to prop changes.** No UI-kit suite exists (see GAP-03). `scrollbar` matches in 001/011/014/046/048/048c/057/072/083c/088 are all layout/overflow assertions — none asserts tab-stop reactivity to a prop change | **none** — same target as GAP-03 | ui-ux-expert |
| GAP-09 | VCST-5547 | **Manager sees the customer list of a selected user group.** 099's 10 cases are entirely `/api/personalization/taggeditem` round-trips; grepped all suites for `condition tree\|conditiontree` → **zero**, and 099 for `segment` → **zero**. The condition-tree → customer-list surface has no coverage on either side | 099 · 026 · 008 | test-management-specialist |
| GAP-10 | VCST-4386 | **Skyflow moved to a separate frontend module** — the new failure mode is the *module* failing to resolve / lazy-load, not card handling. `skyflow` appears in 10 suites (040a has 29 cases incl. 63 3DS/saved-card matches), but nothing asserts a module-load failure, its fallback, or that checkout degrades rather than dead-ends | 040a · 041 · 042 | qa-frontend-expert |
| GAP-11 | §6c — A2 Pricing | Checklist item **"Price calendar: start/end dates on price-list assignments, time-bound pricing"**. Grepped `Backend/pricing/*.csv` for `price calendar\|start date.*price\|time-bound` → **zero** across 65 cases. Adjacent to VCST-3912 — both are "when is a price visible" | 055 | test-management-specialist |
| GAP-12 | §6c — §28 Security (adjacent VCST-5771/5772/5773) | **"Rate limiting: login, password reset, API → 429"** (grep `rate limit` in 044 + 031 → **zero**) and **"Session expires after inactivity timeout"** (grep `session expire\|inactivity` in 032 + 044 → **zero**). Both untested while three security tickets land on the same surface | 044 | qa-backend-expert |
| GAP-13 | §6c — A25 Personalization (adjacent VCST-5547, VCST-5282) | **"Segment-based catalog: verify a customer segment sees only the personalized product set"** (grep `segment` in 099 → **zero**) and **"Personalization disable: deactivate rule → all customers see full catalog"** (grep `disable\|deactivate` in 099 → **zero**). 100's 6 cases cover anonymous/tagged visibility only | 100 · 099 | test-management-specialist |
| GAP-14 | §6c — §12 Company Members — **carry-forward, never closed** | 26-17 raised this as its GAP-09 and it is **still open**: grep 008 for `bulk invite\|multiple email\|partial fail` → **zero**; `custom invitation\|invitation message` → **zero**. Re-issued rather than silently dropped | 008 | test-management-specialist |
| GAP-15 | §6c — §6 Search | **"'View All Results' link from dropdown"** — grep `view all result` across `Frontend/search/*.csv` → **zero**. (Search history *is* covered: 2 matches in 004) | 004 | test-management-specialist |
| **GAP-16** | VCST-5851 | **CLOSED — already covered, but flagged for oracle re-verification.** Suite 005 carries **6 direct `VCST-5851` references** and 51 facet-order matches, asserting BOTH `Priority ascending` and `Priority descending`, tagged `{OBSERVED}`. **No new case.** ⚠ Those assertions were authored from the *pre-fix* direction split — an assertion written from a known defect **inverts when the defect is fixed**. After vc-module-catalog #906 deploys, re-verify direction rather than reading a FAIL as a regression | 005 | qa-backend-expert (re-verify, **do not author**) |
| **GAP-17** | VCST-5725 | **CLOSED** — 060b already carries this sprint's cases, naming the ticket and the exact inline alert, plus a long-filename narrow-viewport fixture. No action | 060b | — |
| **GAP-18** | VCST-5909/5910/5825/5831 | **CLOSED** — 083c grep: `badge\|days remaining\|expiring` 36 · `target\|goal` 169 · `375` 8 · `toast` 2. All four missions bugs have an existing assertion surface. Re-run only | 083c · 083d | — |
| **GAP-19** | VCST-5024 | **CLOSED** — 075f (22 cases) + 083e (8 cases) were authored for org-level loyalty this sprint, covering pooled balance, concurrent earn/redeem, lock-out refusal, mode-flip and multi-org default resolution | 075f · 083e | — |
| **GAP-20** | VCST-5282 | **CLOSED** — cases landed in 053 via commit `2e008906` ("cover the reworked User groups widget in suite 053") | 053 | — |

---

### 5.3 Exploratory Charters — discovery of what the suites cannot assert

> **5 charters × 30 min — at the cap.** Derived strictly per `.claude/skills/qa-sbtm/sprint-charter-selection.md`: every charter is anchored to a §3 risk domain **and** a §5.1 suite or a §5.2 gap. None is invented.
>
> **D3 check — run against real files (`ls reports/exploratory/`, 2026-09-18).** Thirteen SBTM reports on disk. Nearest by date: `SBTM-VCST-5024-2026-09-16` (**2 days — outside 24 h**), `SBTM-VCST-5317-R3-2026-09-10` and `-R2`/`-R1-2026-09-09` (**8–9 days**), `SBTM-sprint-26-17-*-2026-09-07` ×3 (11 d), `SBTM-VCST-5738-2026-09-04` (14 d), `SBTM-salesrep-customer-orders-2026-09-03` (15 d), `SBTM-loyalty-missions-2026-08-28` (21 d), `SBTM-catalog-variations-resolver` / `SBTM-chunk-load-resilience` (both 2026-08-26, 23 d), `SBTM-page-builder-versioning-2026-07-08` (72 d). **D3 fires on nothing this sprint.** Unlike 26-17 — where the Sales Rep session was < 24 h old and blocked a charter — every session here is prior art, not a disqualifier. The two most recent (VCST-5024, VCST-5317) are nevertheless treated as *surfaces already swept*, which is why neither Loyalty-org-totals nor the org switcher earns a charter below.
>
> **Lanes.** `playwright-firefox` is a full click-capable slot since 2026-09-08, **conditional on the MCP server having been restarted** after the occlusion-pref config change and on `@playwright/mcp` staying pinned in `.mcp.json`. Clicks timing out at *"visible, enabled and stable"* mean the restart was missed — not a bad charter. Three lanes total, so run in **two waves**, isolated from the regression pool.

| ID | Domain (§3) | Signals | Mission (discover X that suites Y don't cover) | Candidate scenarios | Technique | Lane | Owner |
|----|---|---|---|---|---|---|---|
| **EXP-01** | **UI Kit** — VcButton, focus ring, DateRangePicker, VcTable, VcScrollbar (20) | **C1** (GAP-03 *and* GAP-08 both have target `none` — the corpus has **no UI-kit suite at all**) + **C2** (6 tickets on shared components every storefront surface renders through) | Discover where the shared-component rewrites break a **consumer** rather than the component — the class no component-level case can catch, because there is no component-level suite and the consumers' cases assert business outcomes, not geometry | 1. Walk 042's smoke path with the new VcButton: does sentence-case + the new icon size change any **wrapping or truncation** at 375 px on a control whose label was tuned to the old case? · 2. Tab the full checkout with the new focus ring — any control where the ring is **clipped by an overflow ancestor** or lands behind a sticky bar? · 3. Open a VcTable using a custom `#header` **with** selection enabled (089 / 008) — does the body still align, and does select-all still select? · 4. Change a VcScrollbar prop at runtime (resize / filter that changes content height) — does the tab stop follow? | State-Stress + sized-control token/aspect oracle (screenshot even on PASS) | `playwright-chrome` | ui-ux-expert |
| **EXP-02** | **Sales Rep** — hub-as-plugin & customer orders (20) | **C2** — three concurrent changes on one surface at L=5: VCST-5159 changes **how the hub loads**, VCST-5905 fixes a **total outage**, VCST-5890 changes the **rule-chip selectors** the dashboard is asserted by | Discover failure modes of the new federated-plugin load path (GAP-02 — zero corpus coverage) and whether the outage fix holds under the reload change that landed in the same window | 1. Load the hub with the plugin manifest **slow or partially failing** (throttle / block the discovery request) — empty state, or an unmounted route that still appears in nav? · 2. Sign in as a rep, then as a **non-rep**, in the same tab — does a stale plugin registration leak the hub to an account that must not see it? · 3. Deep-link straight to a customer-orders route **before** the hub plugin has registered — 404, blank, or recovery? · 4. Rule chips after the VcTabSwitch migration: does chip state survive a period-filter change and a browser-back? | Galumphing + State Transition; boundary-of-features on load order | `playwright-edge` | qa-frontend-expert |
| **EXP-03** | **Pricing** — price-restriction extension points (20) | **C3** — GAP-01 names **4 suites across 2 layers** (054, 017, 050a Backend; 002 Frontend) and the chain is *"a price must be absent everywhere"*, which each suite can only see its own link of | Hunt for surfaces that still **leak a price** when restriction is active. A hidden price is a whole-of-product property; a per-suite assertion can only cover the surfaces someone thought of | 1. With restriction on, sweep every price-rendering surface in one session: catalog card → PDP → quick-view → cart → mini-cart → checkout summary → order confirmation → order history → quote → CSV export → GraphQL response — which one still shows a number? · 2. Does a restricted viewer see `0.00` / `—` / nothing, and is any of those distinguishable from the **real** no-price-for-currency state (a known `vcst-qa` condition)? · 3. Toggle restriction **mid-session** — does an already-rendered page or a cached Apollo cart keep the old price? · 4. Checklist A2's **price-evaluation troubleshooting tool** — does it still trace correctly with the new hooks, or does it leak the price it is supposed to hide? | Galumphing + Saboteur; whole-of-product surface sweep | `playwright-firefox` | qa-backend-expert |
| **EXP-04** | **Loyalty** — Missions & points (20) | **C2** — **9** concurrent missions tickets at L=5, six of them shipped through essentially one PR set (#2471/#2479/#2484) into one component tree | *Evaluated honestly, and it does qualify — but it ranks last among the C2s.* The surface is the most heavily pre-covered in the corpus (083c 84 + 083d 8 + 075d 34 + 075e 23 = **149 cases**, and GAP-18 shows all four UI bugs have assertion surfaces). What has **no** coverage is the six-fixes-in-one-tree **seam** | 1. One mission card simultaneously **near its date threshold** (5910's amber/red boundary) **and** order-value-based (5825's goal display) — do the two fixes render a coherent card, or does one overwrite the other's badge slot? · 2. At **375 px** (5831) with the a11y spinbutton fix (5912) — is the corrected `aria-valuenow` still exposed once the modal truncates? · 3. Complete a mission and dismiss the toast (5909) **while** the points-history Operation column (5916) is loading — does history show the operation, or the empty cell the fix removed? · 4. Dark mode (5838) × open-ended mission (5911's colour-only status) — is status still conveyable without colour? | Feature-pair matrix (the six fixes pairwise) + State Transition | `playwright-chrome` (wave 2) | qa-frontend-expert |
| **EXP-05** | **Payment** — Skyflow modularization (15) | **C4** — `I = 5, L = 3`: a payment path's blast radius is total, while a pure bundling change keeps likelihood low enough that it will never earn suite budget. GAP-10 confirms nothing asserts the module's *load*, only its behaviour once loaded | Discover how the extracted Skyflow module fails when it does not arrive — the failure mode a 29-case payment-behaviour suite structurally cannot reach | 1. Block / throttle the Skyflow module chunk at checkout — does the page offer another method, or dead-end with the cart intact? · 2. Reach payment, then hard-reload — does the module re-resolve, or does a half-initialized vault call fire? · 3. Switch method away from Skyflow and back within one checkout — is the iframe re-mounted cleanly (PCI: no card data left in DOM/localStorage)? · 4. Cross-check 041's cross-cutting assumptions now that the code is a separate module | Saboteur (resource-level) + Error Guessing | `playwright-edge` (wave 2) | qa-frontend-expert |

**Ranking applied:** C1 first (EXP-01 is the only C1 — two gaps with target `none`), then signal count, then §3 score. EXP-02/03/04 all sit at score 20 with one signal each, so the rule gives no tie-break; it was broken with the file's own logic — *zero coverage beats partial coverage as a claim on 30 minutes* — ordering by how much coverage already exists: Sales Rep plugin loading (zero) → price visibility (zero) → Missions (149 cases). EXP-05 is C4 at score 15.

**Not chartered (and why)** — covers every Critical/High §3 domain absent from the table above:

| Domain (§3 score) | Verdict | Routed to |
|---|---|---|
| **Platform auth & Admin SPA session lifecycle** (20, Critical) | **No qualifying signal — the honest call, not a cap casualty.** C2 needs ≥3 concurrent changes on one surface; VCST-5952 + VCST-5900 are 2 (VCST-5686 also touches `vc-platform` but is a different subsystem — job execution, not the SPA auth lifecycle). C4 needs `L ≤ 3`; this is `L = 4`. C1 fails — GAP-05 has target suites. C3 fails — GAP-05 names 2 suites in 1 layer. Both defects also have exact oracles (a `$digest` loop after cycle 2; a redirect losing a race with a 500 ms timer) ⇒ **D1** | GAP-05 + §6.2 |
| **Search & facets** (15, High) | **D1.** VCST-5851 is already covered (GAP-16, 6 direct refs in 005) and VCST-5370's oracle is assertable — a configured relevance field changes ranking in a stated direction. A precise oracle makes a case cheaper *and* permanent | §6.1 + GAP-16 re-verification + GAP-15 |
| **Catalog admin — virtual catalog & user groups** (12, High) | **D1** for VCST-5849 (one action, one 500, one PK violation — an exact negative case) and VCST-5282 (already landed, GAP-20). VCST-5547's uncovered surface is real but assertable | GAP-09, GAP-13 + §6.1 |
| **B2B — org switcher / locked orgs** (12, High) | Not D3 (the three VCST-5317 sessions are 8–9 days old), but declined on merit: **those three sessions already swept this exact surface** and produced the coverage now in 006/033/027/050d. A fourth pass on a surface explored three times in one sprint is the lowest-yield 30 minutes available | §5.1 re-run; no new charter |
| **Storefront security — untrusted-input sinks** (12, High) | **D1** — each hardened sink is an assertable injection case, and the two genuinely missing items (rate limiting, session inactivity) are precise `429` / timeout oracles | GAP-12 + §6.3 |
| **Product Compare** (12, High) | Declined — 098 is **activated** this sprint and its 35 cases were authored from the v2 test model, i.e. against the design being shipped. The residue is a visual diff, which is an axis, not a charter | §5.1 (098) + `/qa-design` |
| **Platform jobs & Admin notifications** (9, Medium) | Below the Critical/High threshold; VCST-5686 is covered by 095's 52 cases, VCST-5940 is a single assertable render (**D1**) | GAP-06 + §6.3 |
| **CMS / Page Builder & Asset Library** (6, Medium) | Below threshold; VCST-5725 already covered (GAP-17), VCST-5847 is one assertable state transition (**D1**) | GAP-07 |
| **Loyalty — org-level totals (VCST-5024)** | Charted 2026-09-16 (outside 24 h, so not formally D3) **and** covered by 30 cases in 075f/083e authored from that session. Nothing left to discover this cycle | GAP-19 (closed) |
| **`vc-shell` — VCST-5860/5861/5862** | **D2** — separate product, no QA surface in this repo. Stated rather than silently omitted | Nothing |
| *Carry-overs from 26-17: EXP-01 AutoMapper wave 3 · EXP-02 cart gift-merge · EXP-03 company roles per store* | All three were 26-17 charters; **no 26-18 Done ticket touches any of those surfaces**. Stale carry-overs with no fresh signal — declined on this sprint's own merits rather than inherited | Backlog; re-queue when a diff touches x-cart merge, per-store role dictionaries, or the AutoMapper removals |

---

## 6. New Test Cases Needed (Per Ticket)

**Estimated total: 75–120 new cases.** Counts and technique only — no CSV authored here. Case generation happens per ticket via `/qa-test-cases-generator`.

> ⚠ **VCST-5959 re-authored suites 075 and 083 during this same sprint.** Any case proposed below for those two files must land on the **re-authored** version (both were rewritten at commit `4e258073`, after `9250a23d`), never on a stale copy. Rows targeting 075d/075e/083b/083c/083d/083e are unaffected.
>
> **First wave (~40 cases)** if the sprint budget bites: GAP-01 (price restriction), GAP-02 (plugin load), GAP-05 (Admin SPA re-login), the VCST-5905 guard, VCST-5849 and VCST-5686 — the rows whose ticket is High priority, or whose absence leaves a Critical domain with **no oracle at all**.

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-3912 | Backend, GraphQL, Admin, Storefront | Price-visibility across every rendering surface (negative-dominant) | **8–12** | 054, 050a, 002, 017 (GAP-01) | **FLOW** first (the chain is *restriction configured → price suppressed → still suppressed downstream*), then **Decision Table** (role × surface × restriction state) |
| VCST-5547 | Admin, REST, Storefront | User-group → customer-list retrieval + permission scoping | **6–9** | 099, 026, 008 (GAP-09) | FLOW, then EP over group-membership states (member / non-member / empty group / deleted group) |
| VCST-5317 | Storefront, GraphQL | Locked-membership handling in the org switcher | **3–5** | 006, 033, 050d | EP over membership status + **State Transition** (lock applied mid-session — a lock revokes tokens but does not evict a live session). **Blocked on the §7.1 spec question** |
| VCST-5097 | Storefront (UI kit) | DateRangePicker — Range mode | **6–10** | **none** (GAP-03) | **BVA** (start = end, reversed range, single day, month/year boundary, DST) + EP on invalid input |
| VCST-5891 + VCST-5652 | Storefront (UI kit) | VcButton layout (sentence case) + icon sizes | **3–5** | 048c (+ new UI-kit suite) | BVA on the sized-control token/aspect oracle; assert **tokens**, never transcribed px (GOLDEN RULE) |
| VCST-5653 | Storefront (a11y) | Focus indicator — WCAG 1.4.11 / 2.4.7 | **3–5** | 045, 048c | EP over control types (button / link / input / custom widget); contrast + ring-visibility oracle |
| VCST-5370 | Backend, GraphQL, Storefront | Elastic App Search relevance field | **4–6** | 061, 004, 005, 050a | Decision Table (field configured / absent / invalid × query type × sort mode) |
| VCST-5735 | Storefront | Compare v2 — **refresh**, not net-new: re-point 098's labels/selectors at the shipped redesign | **2–4 refreshed, 0 net-new** | 098 | Visual diff + State Transition |
| VCST-5024 | GraphQL, Storefront | Org-level loyalty totals — **already 30 cases** (075f + 083e) | **0–2** *(incremental only)* | 075f, 083e | EP — contingent on a delta this sprint added |
| VCST-5725 | Admin | Asset-overwrite warning — **already covered in 060b** | **0** | 060b | — |
| VCST-5851 | Storefront, GraphQL, Admin | Dictionary priority facet order — **already covered in 005**; re-verify direction post-deploy | **0** | 005 | Oracle re-verification, **do not author** (GAP-16) |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5952 | Admin SPA | Two-cycle in-tab re-login guard (blade context cleared) | **2–3** | 020, 017b (GAP-05) | **State Transition** (sign-in → sign-out → sign-in → sign-out → sign-in), asserting no unbounded digest |
| VCST-5900 | Admin SPA | Password-reset deep link vs the 500 ms `loginDialog` redirect | **2–3** | 020 | State Transition + Error Guessing (navigate at, before and after the timer) |
| VCST-5905 | GraphQL, Storefront | Schema-load guard on `salesRepCustomerOrders` (`TYPE_LOAD` must not recur on an XOrder bump) | **1–2** | 050m, 097 | Error Guessing; 050m already holds 55 references to the operation, so this is a *load* guard, not a behaviour case |
| VCST-5849 | Admin, Catalog | Link a product **that has variations** into a virtual catalog | **2–3** | 051, 053 | EP (with / without variations × first link / re-link idempotence) — the PK violation is the negative oracle |
| VCST-5916 | Backend, Storefront | Points-history "Operation" populated for mission-granted rows | **2–3** | 075 ⚠, 083 ⚠, 075d | EP over grant sources (mission / order / manual / reversal); ⚠ **re-authored suites** |
| VCST-5940 | Admin | Preview renders the sent message, never a raw binding token | **1–2** | 057 (GAP-06) | Error Guessing |
| VCST-5847 | Admin, CMS | Access-token expiry does not recurse the designer | **1–2** | 059 or 060 (GAP-07) | State Transition (valid → expired → refreshed) |
| VCST-5912 / 5911 / 5838 | Storefront (a11y) | axe guards — `aria-invalid` on untouched render, contrast ratios, colour-only status | **2–4** | 045, 083c | BVA on contrast thresholds (2.09:1 / 4.37:1 vs the 3:1 and 4.5:1 lines). **Note:** a CSS-only disabled control inflates the contrast count as a phantom node |
| VCST-5909 / 5910 / 5825 / 5831 | Storefront | **Covered in 083c** (GAP-18) — regression re-run; any addition is a seam case from EXP-04 | **0–2** | 083c, 083d | — |
| VCST-5282 | Admin | **Covered** — landed in 053 at commit `2e008906` | **0** | 053 | — |

### 6.3 Tasks / TechDebt

| Ticket | Layers | Case type | Count | Target suite | Technique |
|---|---|---|---|---|---|
| VCST-5159 | Storefront, GraphQL | Plugin-discovery mount + failure fallback + permission scoping across a session boundary | **4–6** | 093, 089, 091, 097 (GAP-02) | Error Guessing + State Transition; fed by EXP-02 |
| VCST-4386 | Storefront, Payment | Skyflow module resolution, fallback, re-mount hygiene | **3–5** | 040a, 041, 042 (GAP-10) | Error Guessing (resource-level); fed by EXP-05 |
| VCST-5771 / 5772 / 5773 | Storefront (security) | Sink-hardening guards **+** the two missing §28 items (rate limiting `429`, session inactivity expiry) | **4–6** | 044 (GAP-12) | Error Guessing (injection payloads) + EP on timeout boundaries |
| VCST-5686 | Backend | Job cancellation across 4 modules (platform, search, image-tools, background-jobs) | **4–6** | 095, 061, 069 | **State Transition** (queued → running → cancel-requested → cancelled; plus cancel-after-complete as the negative) |
| VCST-5472 | Storefront (UI kit) | VcTable custom header × selection column | **3–4** | 048c, 089 (GAP-04) | Decision Table (`#header` × `hideDefaultHeader` × selectable) |
| VCST-5701 | Storefront (UI kit) | VcScrollbar auto tab-stop reacts to prop changes | **2–3** | **none** (GAP-08) | State Transition on prop change |
| VCST-5890 | Storefront | VcTabSwitch rule-chip selector-migration guard | **1–2** | 093 | EP; a selector-stability guard so the 26-19 run does not read a chip change as a regression |
| **Checklist-only** (GAP-11, GAP-13, GAP-14, GAP-15) | Admin, Storefront | Price calendar · segment-based catalog + personalization disable · bulk-invite partial failure + custom invitation message · "View All Results" link | **7–10** | 055, 099/100, 008, 004 | EP + Decision Table |
| VCST-5159 (Spike doc) / VCST-5959 | — | No product behaviour — QA-internal | **0** | 075, 083 (re-authored) | n/a |

### 6c — Checklist diff (Critical / High domains only)

Method: for each Critical/High §3 domain, that domain's `/qa-checklist` section was pulled and the case bodies of that domain's §5.1 suites grepped for each item. Uncovered items route to exactly one destination; covered items are recorded so the diff reads as **run**, not skipped.

| Domain | Checklist section | Covered (recorded, no action) | Uncovered → destination |
|---|---|---|---|
| **Pricing** (Critical) | A2 Pricing Admin | Create/edit/delete price list · add product prices · tier pricing via min-qty · assignment + priority · search & filter · export · storefront evaluation | **"Price calendar / time-bound pricing"** → **GAP-11** (assertable). **"Price-evaluation troubleshooting — trace which price list applies"** → state-shaped, re-checked under the new restriction hooks ⇒ **EXP-03 scenario 4** |
| **Platform auth & Admin SPA** (Critical) | A13 Platform Security & Users + §28 Security | Add/edit/delete user · roles & granular permissions · lockout · password policy · API accounts · user search · audit log (13 matches in 020) · password reset (13 in 020, 6 in 031) | **"Rate limiting → 429"** and **"Session expires after inactivity"** (both zero) → **GAP-12**. Blade-context-on-sign-out is **not a checklist item at all** — the checklist itself has a hole here → **GAP-05** |
| **Search & facets** (High) | §6 Search + A10 Search & Indexing | Typo tolerance / fuzzy · sort-by-relevance persisting through pagination · facet counts / `BL-SRCH-001` · search by SKU · search history · index rebuild · faceted-search configuration (51 facet-order matches in 005) | **"'View All Results' link from dropdown"** (zero) → **GAP-15** |
| **Catalog admin — virtual catalog & user groups** (High) | A1 Catalog Admin + A25 Catalog Personalization | Virtual catalog handling (051: 30 variation matches, 053) · tagged products (099 `PERS-001…`) · rule priority | **"Segment-based catalog: segment sees only the personalized set"** (zero) and **"Personalization disable → full catalog"** (zero) → **GAP-13** |
| **B2B — org switcher / locked orgs** (High) | §11 Company Info + §12 Company Members + §13 Multi-Org | Invite + roles · registration via link · invitation expiry/resend · edit role · multi-role · role icons · block/unblock · filter & search · permission enforcement · locked-org handling (006, 027, 050d) | **"Bulk invite: multiple emails, partial failure handling"** and **"Custom invitation message vs default template"** — both still zero, **carried forward unclosed from 26-17 GAP-09** → **GAP-14** |
| **Payment — Skyflow modularization** (High) | §9 Payment + A27 Payment Admin | Skyflow Visa/MC tokenization · CyberSource + 3DS (040a: 63 matches) · Authorize.Net · Datatrans OTP · declined card · form validation · PCI iframe · saved-card reuse · capture/refund | Nothing *behavioural* uncovered — the gap is structural: no item covers **module load failure**, because the checklist predates the split → **GAP-10** (assertable part) + **EXP-05** (failure-mode part) |
| **Storefront security** (High) | §28 Security | XSS sanitization · CSRF · token handling · HTTPS · API authorization 401/403 · input validation · sensitive-data exposure (044, 34 cases) | Rate limiting + session inactivity → **GAP-12** (shared with Platform auth) |
| **Loyalty** (Critical) | — | — | **No `/qa-checklist` section for Loyalty exists.** `domain-checklists.md` runs §1–§33 + BF, `backend-admin-checklists.md` A1–A27 + API1/API2 — the 3 `loyalty` matches are incidental prose, not a section. A domain with 149 regression cases and nine tickets this sprint has **no checklist**, so no diff is possible. 26-17 recorded the same finding; still open → `/qa-checklist new loyalty` (deliberately not actioned here) |
| **Sales Rep** (Critical) | — | — | **No checklist section.** Same class as Loyalty → `/qa-checklist new sales-rep`; the un-enumerated residue is covered this sprint by **EXP-02** |
| **UI Kit** (Critical) | §29 Accessibility (nearest — there is no UI-kit section) | Keyboard navigation · focus management/trap · focus indicators (045) · ARIA landmarks · alt text · colour contrast · form labels · `aria-live` announcements (34 matches) · skip navigation · touch targets 44×44 | §29 is fully covered at the *page* level; the hole is **component**-level and structural — no UI-kit suite exists. Assertable parts → **GAP-03, GAP-04, GAP-08**; state-shaped parts (ring clipped by an overflow ancestor, prop-change reactivity, header/selection interaction) → **EXP-01** |
| **Product Compare** (High) | — | — | **No checklist section.** 098's own test model covers it; noted as a third checklist-coverage hole alongside Loyalty and Sales Rep |

**Three Critical/High domains have no `/qa-checklist` section at all** (Loyalty, Sales Rep, Product Compare — plus UI Kit, which has only the page-level a11y section). That is a standing gap in the checklist corpus, not in this sprint's coverage, and it is recorded here rather than actioned: a `/qa-checklist new <domain>` run is its own piece of work.

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

**Blockers — testing of the named domain does not start until these clear:**

1. **The QA platform line is a pre-release build pinned to a reopened story.** `vcst-qa` reports
   `3.1066.0-alpha.13384-vcst-5378-unified-buyer-flow`; **VCST-5378 is `Reopen`**. Confirm with the
   release owner whether this build is the intended test target for 26-18 sign-off. If it is not, results
   produced against it are **provisional** and every verdict in this sprint inherits that caveat. This
   affects all 13 domains, not one — it is listed first for that reason.
2. **VCST-5317's specification conflict is resolved in writing** (§2.1) — does the switcher *exclude* a
   locked org, or *show it with a Locked marker*? And what is the all-memberships-locked behaviour (AC-6
   is marked "product decision to confirm"; our knowledge says `/403`)? **Ask VirtoOZ / the PO. Do not
   test this ticket until answered** — with two readings live, a tester will unconsciously adopt whichever
   one the build satisfies, and the resulting PASS means nothing.
3. **VCST-5159 has no acceptance criteria** (typed as a Spike). Either the PO supplies them, or the plan
   records explicitly that the shipped PRs (`#2445`, `#2427`) are the specification and the verdict is
   `{OBSERVED}`-provenance only. Pick one and write it down before the Sales Rep work starts.

**Standard gates:**

4. `npm run env:check` green for `TEST_ENV=vcst`.
5. Deployed module versions confirmed against `vc-deploy-dev@vcst-qa` — specifically the
   `VirtoCommerce.SalesRep` / `VirtoCommerce.XOrder` / `VirtoCommerce.Xapi` trio, because VCST-5905 was an
   **assembly-binding** defect: the fix is only present if the deployed SalesRep build was compiled against
   XOrder 3.1011.0. **Read the versions; do not infer them from the ticket being Done.**
6. All three browser lanes reachable (`playwright-chrome`, `playwright-edge`, `playwright-firefox`) — MCP
   servers restarted after any config change.
7. Test data seeded and **verified live** per §8, including the loyalty org-level fixture whose two sides
   must differ.
8. `npm run suites:lint` green, and suites **075** / **083** re-read *after* VCST-5959's re-authoring
   landed (2026-09-17) — the legacy shape this plan's predecessors mapped against no longer exists.

### 7.2 Exit Criteria

| # | Criterion |
|---|---|
| 1 | Every **Critical** domain (5) has executed its §5.1 suites on at least two browser lanes, with HAR captured |
| 2 | Every **High** domain (6) has executed its §5.1 suites on at least one lane |
| 3 | All §5.2 `GAP-NN` items are either covered by a new `Draft` case or explicitly deferred **with a reason recorded in this file** |
| 4 | All §5.3 charters executed or explicitly stood down; each produces a net-new scenario or a written "nothing found" |
| 5 | The UI-kit sibling sweep (§4.2 item 1) has covered cart, checkout, auth and the account menu — surfaces the diff does not name |
| 6 | VCST-3912's **save/export** directions are verified, not just the read paths |
| 7 | VCST-5952 verified with **two** in-tab re-logins; VCST-5900 verified across repeated timing attempts |
| 8 | Sales Rep results carry an explicit statement that the MF2 plugin **loaded** for that run |
| 9 | No open **Critical/High** bug filed by this cycle is left untriaged; all have severity + owning layer + repo route |
| 10 | Entry blockers 1–3 are resolved, or every affected verdict is marked **provisional** and the reason is in the ticket comment |
| 11 | Zero suite CSVs left unparsable; `npm run suites:lint` and `npm run td:validate` green at close |
| 12 | Tracker comments follow the GOLDEN RULE — **one comment per ticket per run**, amended, with screenshots attached inline |

> **Criterion 10 is the one that will be tempting to skip.** A sprint tested on a pre-release build of a
> reopened story is not a failed sprint, but it is a **qualified** one, and the qualification has to travel
> with the result rather than living only here.

---

## 8. Test Data Requirements

Everything below resolves at runtime. **No literals** — `{{VAR}}` for per-environment values, `@td(ALIAS.field)`
for entities asserted by name, `live-discover` for drifting ids, `random-data` (`AGENT-TEST-` prefix) for
unique inputs never asserted on. Per `.claude/rules/test-data.md`.

| Domain | Data needed | Layer | Notes |
|---|---|---|---|
| **Loyalty — org-level totals (VCST-5024)** | An organization with **≥2 manager contacts**, each having earned **and** redeemed points, with **different** per-contact subtotals | `@td()` + seeder | **The SECOND RULE bites hardest here.** If the two managers' totals are equal, or if the org total happens to equal one contact's total, the case cannot distinguish a correct aggregate from a wrong one. The fixture must make org-total ≠ any single contact total, and contact totals ≠ each other |
| **Loyalty — Missions** | Missions of each goal type (SKU, order-value, open-ended), at each date-badge state — the **three** states VCST-5910 says collapsed to two | seeder | Needs a mission ending **>10 days out**, one **inside** 10 days, and one **open-ended** — the triple that makes the collapse visible. `seed:missions-e2e` **rewrites the store theme preset and never restores it** — budget a restore step |
| **Pricing (VCST-3912)** | Two users: one **with** and one **without** `order:read_prices`; orders reachable by id, number and outer id; an order in an exportable state | `@td()` + existing accounts | The price-blind user must be able to **save** an order — that is the write-direction case. Verify prices are restored from storage, not zeroed |
| **Sales Rep (VCST-5905/5159/5890)** | A sales rep with served customers holding **≥2 pages** of orders | `@td()` + live-discover | Paging is where the prior open bugs sat. Confirm the MF2 plugin loaded before trusting any row count |
| **B2B org switcher (VCST-5317)** | A multi-org user with ≥1 **currently locked** membership, ≥1 unlocked, and ≥1 with an **expired** `LockoutEnd` (AC-3), plus an all-locked user (AC-6) | seeder | The multi-org fixture user (11 orgs) exists. **Do not unlock the TechFlow locked membership** — it is locked by design and unlocking it breaks the impersonation suite |
| **Catalog admin (VCST-5849)** | The **divergent pair**: one product **with** ≥1 variation and one **without**, plus a virtual catalog to link into | seeder | The pair is the test; a single product cannot decide it. Note the known re-seed duplicate issue on catalog-link + index lag |
| **Search & facets (VCST-5851)** | A dictionary property with ≥3 values at **distinct** priorities, including a **tie** | Admin setup + `@td()` | Equal priorities are the interesting case for an ordering change; distinct-only data hides tie-break behaviour |
| **User groups (VCST-5547/5282)** | ≥2 user groups with **overlapping** membership, referenced from a Promotion, a Mission and a Pricelist assignment | seeder | Overlap is what makes "the list contains the values of the selected group(s)" falsifiable |
| **Storefront security (VCST-5771)** | Legitimate rich content that *looks* dangerous — product descriptions and CMS blocks with inline markup, quotes, angle brackets, unicode | Admin-authored | This is the **negative** corpus: it must survive the sanitiser. Never seed a real exploit payload |
| **Payment (VCST-4386)** | Checkout reachable with the Skyflow module **present** and **absent** | env config | Absence is the failure mode being tested |
| **Product Compare (VCST-5735)** | ≥4 comparable products sharing a property set | `live-discover` | Assert shape, not fixed titles |

**Standing constraints:** passwords are `{{VAR}}` tokens resolved from `.env.local`, never literals. Disposable
fixtures are isolated **per suite**, not per run — two suites consuming one fixture set are serialised with a
re-seed between them. Capture every observation with its run handle + entity ids, because the fixture will not
outlive it. No `reports/tickets/...` output path may appear in any case row (`DV-024`).

**Environment caveat:** this repo's knowledge records **no EUR product pricelist on `vcst-qa`** — a €0.00 is
`BLOCKED`, not `FAIL`. Relevant to any pricing or loyalty case tempted to switch currency.

---

## 9. Schedule and Milestones

Sprint closes **2026-09-21**. The plan is built 3 days early (§ banner), so the first window overlaps the
sprint's own tail and covers only what is already Done.

| Date | Milestone | Owner |
|---|---|---|
| **2026-09-18** | Plan drafted (this document). Entry blockers 1–3 raised with PO / release owner | orchestrator |
| 2026-09-19 | Entry blockers answered; test data seeded and verified live; `env:check` + `suites:lint` green | test-data-engineer |
| 2026-09-19 – 09-20 | New `Draft` cases authored from §6 (Critical domains first) | test-management-specialist |
| **2026-09-21** | **Sprint closes.** Re-run `/qa-test-plan Sprint26-18` to capture the Done delta — 101 issues were open at drafting, so the delta is expected to be large | orchestrator |
| 2026-09-22 – 09-23 | Critical-domain execution: UI-kit sweep, Loyalty, Sales Rep, Pricing, Platform auth. Cross-browser, 3 lanes | qa-frontend / qa-backend / qa-testing |
| 2026-09-23 | §5.3 exploratory charters (30 min each), isolated from the regression pool | qa-testing-expert et al. |
| 2026-09-24 | High-domain execution; bug triage of everything found so far | qa-lead-orchestrator |
| 2026-09-25 | Medium domains; regression suite run over the full §5.1 activation set | regression-orchestrator |
| 2026-09-26 | Triage, re-test of fixes, `Draft → Automated` promotion pass (`--promote`) | qa-lead-orchestrator |
| **2026-09-28** | Exit criteria reviewed; plan promoted `Draft → Approved` or the gap recorded | orchestrator |

> **The 2026-09-21 re-run is not optional bookkeeping.** 101 of 158 issues were open when this was written,
> including 9 `Ready for test` and 10 `In review`. A plan built at 36% sprint completion describes a
> minority of the sprint.

---

## 10. Resources — QA Agent Assignments

Per `.claude/rules/agents.md`. **Max 3 concurrent browser agents** across QA + BA combined. All three
Playwright lanes are click-capable (firefox since 2026-09-08, re-verified 2026-09-11).

| Domain | Agent | Browser lane | Rationale |
|---|---|---|---|
| UI kit — shared rendering | **ui-ux-expert** | Chrome DevTools MCP | Owns the design-system axis, WCAG 2.2 AA and the `vs. DESIGN` diff. The focus-indicator and icon-size tickets are its native surface |
| UI kit — sibling sweep on commerce surfaces | **qa-frontend-expert** | `playwright-chrome` | The sweep crosses cart/checkout/auth, which is storefront-journey work, not component work |
| Loyalty — Missions & points (storefront + a11y) | **qa-frontend-expert** | `playwright-chrome` | Sequential with the sweep above — same agent, same lane, no parallel conflict |
| Loyalty — points/org-level backend + admin | **qa-backend-expert** | `playwright-edge` | GraphQL + Admin SPA |
| Sales Rep — hub, plugin load, customer orders | **qa-backend-expert** | `playwright-edge` | Primary defect surface is xAPI (`salesRepCustomerOrders`); Admin SPA for permissions |
| Pricing — order price visibility | **qa-backend-expert** | `playwright-edge` | REST + GraphQL + Admin primary; storefront secondary |
| Platform auth & Admin SPA session | **qa-testing-expert** | `playwright-firefox` | Repetition-under-timing work; isolated lane so the re-login loops do not disturb the other two |
| Search & facets | **qa-testing-expert** | `playwright-firefox` | |
| Catalog admin — virtual catalog, user groups | **qa-backend-expert** | `playwright-edge` | Admin-primary |
| B2B — org switcher | **qa-frontend-expert** | `playwright-chrome` | **Hold until entry blocker 2 clears** |
| Storefront security — input sinks | **qa-frontend-expert** | `playwright-chrome` | Negative corpus must render on the storefront |
| Payment — Skyflow | **qa-frontend-expert** | `playwright-chrome` | Checkout journey |
| Product Compare | **qa-testing-expert** | `playwright-firefox` | |
| Platform jobs & notifications | **qa-backend-expert** | `playwright-edge` | |
| CMS / Page Builder & Assets | **qa-testing-expert** | `playwright-firefox` | |
| Test data (all domains) | **test-data-engineer** | none — Node + Platform API | Authors **and runs** the seeders; delegates only browser confirmation |
| New case authoring (§6) | **test-management-specialist** | `playwright-chrome` (sequential, never parallel with qa-frontend) | **Sole writer** of `regression/suites/**` for the duration of this sprint's changes |
| Suite execution (§5.1) | **regression-orchestrator** | 3-slot pool | Batches of 3, matching the pool |
| Triage, status, go/no-go | **qa-lead-orchestrator** | — | Sole custodian of ticket status transitions |

> **One writer per suite CSV, for the duration of the change.** VCST-5959 re-authored 075 and 083 *during*
> this sprint. Any §6 case targeting those two lands on the **re-authored** version — re-read before
> writing, and do not resolve a conflict with git.

---


## 11. JIRA Ticket Coverage Matrix

Every **test-relevant Done ticket** (36), its existing regression home, the new cases §6 calls for, and the
owning agent. "Existing suite" means a suite that already asserts this surface — not merely one that
touches the module.

### 11.1 Stories

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Owner |
|---|---|---|---|---|---|
| VCST-3912 | Pricing | 054, 055, 017, 049, 050a, 050c | **8–12** (GAP-01) | EXP-03 | qa-backend-expert |
| VCST-5024 | Loyalty | **075f (22), 083e (8)** | 0–2 | — (swept 09-16) | qa-backend-expert |
| VCST-5547 | Catalog admin / User groups | 099, 100, 026, 027, 008 | **6–9** (GAP-09) | — | test-management-specialist |
| VCST-5317 | B2B org switcher | 006, 033, 027, 050d | **3–5** ⛔ blocked | — (swept ×3) | qa-frontend-expert |
| VCST-5851 | Search & facets | **005 (6 direct refs)**, 001, 003, 050a, 051 | **0** — re-verify only (GAP-16) | — | qa-backend-expert |
| VCST-5725 | Page Builder / Assets | **060b, 062** | **0** (GAP-17) | — | — |
| VCST-5735 | Product Compare | **098 (35)** | 2–4 refreshed | — | qa-testing-expert |
| VCST-5097 | UI kit | **none** | **6–10** (GAP-03) | EXP-01 | ui-ux-expert |
| VCST-5891 | UI kit | 048c, 042 | **3–5** | EXP-01 | ui-ux-expert |
| VCST-5652 | UI kit | 048c, 042 | *(with 5891)* | EXP-01 | ui-ux-expert |
| VCST-5653 | UI kit / A11y | 045, 048c, 042 | **3–5** | EXP-01 | ui-ux-expert |

### 11.2 Bugs

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Owner |
|---|---|---|---|---|---|
| VCST-5952 | Platform / Admin SPA | 020, 017, 017b, 078d | **2–3** (GAP-05) | — (D1) | qa-backend-expert |
| VCST-5905 | Sales Rep / xAPI | **050m (55 refs)**, 050m2, 097, 091, 093 | **1–2** load guard | EXP-02 | qa-backend-expert |
| VCST-5900 | Platform / Auth | 020, 031 | **2–3** | — (D1) | qa-backend-expert |
| VCST-5849 | Catalog admin | 051, 053 | **2–3** | — (D1) | qa-backend-expert |
| VCST-5909 | Loyalty / Missions | **083c, 083d** | 0–2 | EXP-04 | qa-frontend-expert |
| VCST-5910 | Loyalty / Missions | **083c (36 badge refs)** | 0–2 | EXP-04 | qa-frontend-expert |
| VCST-5825 | Loyalty / Missions | **083c (169 goal refs)** | 0–2 | EXP-04 | qa-frontend-expert |
| VCST-5831 | Loyalty / Missions | **083c (8 × 375 px refs)** | 0–2 | EXP-04 | qa-frontend-expert |
| VCST-5916 | Loyalty | 075 ⚠, 083 ⚠, 075d | **2–3** | EXP-04 | qa-backend-expert |
| VCST-5912 | Missions / A11y | 045, 083c | **2–4** | EXP-04 | ui-ux-expert |
| VCST-5911 | Missions / A11y | 045, 083c | *(with 5912)* | EXP-04 | ui-ux-expert |
| VCST-5838 | Missions / A11y | 045, 083c | *(with 5912)* | EXP-04 | ui-ux-expert |
| VCST-5940 | Admin / Notifications | 057 (82 preview refs) | **1–2** (GAP-06) | — (D1) | test-management-specialist |
| VCST-5847 | CMS / Page Builder | 059, 060 | **1–2** (GAP-07) | — (D1) | test-management-specialist |
| VCST-5370 | Search | 004, 005, 061, 050a | **4–6** | — (D1) | qa-backend-expert |
| VCST-5282 | Catalog admin | **053** (`2e008906`), 099, 100 | **0** (GAP-20) | — | — |

### 11.3 Tasks / TechDebt / Spikes

| Ticket | Domain | Existing suite(s) | New cases (§6) | Charter | Owner |
|---|---|---|---|---|---|
| VCST-5159 | Sales Rep / bootstrap | **none for load path** (093/089/091/097 assume mounted) | **4–6** (GAP-02) | EXP-02 | test-management-specialist |
| VCST-4386 | Payment / Skyflow | 040a (29), 041, 042 | **3–5** (GAP-10) | EXP-05 | qa-frontend-expert |
| VCST-5472 | UI kit / Grids | 048c, 008, 089 | **3–4** (GAP-04) | EXP-01 | test-management-specialist |
| VCST-5890 | Sales Rep / selectors | 093, 089 | **1–2** | EXP-02 | qa-frontend-expert |
| VCST-5701 | UI kit / A11y | **none** | **2–3** (GAP-08) | EXP-01 | ui-ux-expert |
| VCST-5771 | Storefront security | 044 (34) | **4–6** (GAP-12) | — (D1) | qa-backend-expert |
| VCST-5772 | Storefront security | 044 | *(with 5771)* | — | qa-backend-expert |
| VCST-5773 | CI supply chain | — (no QA surface) | **0** | — | — |
| VCST-5686 | Platform / Jobs | 095 (52), 061, 069, 049, 078* | **4–6** | — | qa-backend-expert |

### 11.4 Coverage summary

| Status | Count | Tickets |
|---|---|---|
| **Fully covered — re-run only** | **7** | VCST-5024, 5725, 5851, 5282, 5909, 5910, 5825 *(the last three via 083c, plus a seam charter)* |
| **Covered, needs new cases** | **21** | the §6.1/6.2/6.3 rows with a non-zero count and an existing suite |
| **No existing suite at all** | **4** | VCST-5097, VCST-5701 (GAP-03/08 — no UI-kit suite exists), VCST-5159 (no load-path coverage), VCST-5831 *(partial — 083c asserts the viewport but not the truncation)* |
| **Blocked on a specification answer** | **1** | VCST-5317 (§7.1 entry blocker 2) |
| **No QA surface** | **1** | VCST-5773 (CI supply chain) |
| **Out of scope** | **21** | §2.4 |

> **The four "no existing suite" tickets are the plan's real coverage debt**, and three of them
> (VCST-5097, VCST-5701, VCST-5472) point at the same missing artifact: **this corpus has no UI-kit
> component suite**, while the UI kit is a Critical domain carrying six tickets. GAP-03/04/08 propose
> `Frontend/cross-cutting/0XX-ui-kit-components.csv`; roughly 25–35 of the §6 estimate lands there. That
> suite is the single highest-leverage artifact this sprint could leave behind.

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E)

Tickets whose correctness cannot be decided on one layer. Each needs the layers to be compared against
*each other*, not each checked in isolation.

| # | Ticket(s) | Chain to verify | Why one layer is not enough |
|---|---|---|---|
| 1 | **VCST-3912** | Admin order view ↔ REST `GET /api/order/...` ↔ GraphQL `order()` ↔ **export file** ↔ **save round-trip** | The ticket's own claim is that export and several save paths were *previously uncovered*. Reading one path proves nothing about the others, and only the save round-trip proves prices were restored from storage rather than persisted as zeroes |
| 2 | **VCST-5024** | Storefront org-level total ↔ per-contact points history ↔ `vc-module-loyalty` aggregation ↔ Admin points view | The number changed *meaning*. Agreement across layers is the assertion; a single correct-looking figure is not evidence |
| 3 | **VCST-5905 + VCST-5159 + VCST-5890** | App-init plugin list → MF2 load → `/company/*` route → `salesRepCustomerOrders` → rendered rows | Four links, each of which fails while the next still looks plausible. An empty grid is the shared symptom of a plugin that did not load, a query that returned `TYPE_LOAD`, and a rep with no customers |
| 4 | **VCST-5317** | Header switcher ↔ `organizations` xAPI (`GetOrganizations`) ↔ `/connect/token` rejection | AC-4 *requires* the two enforcement layers to agree; that is a cross-layer assertion by construction. **Blocked on entry blocker 2** |
| 5 | **VCST-5851** | Admin facet/dictionary priority setting ↔ storefront facet order ↔ xAPI facet payload | The defect was a direction inversion between the admin hint and the storefront render — visible only by comparing the two |
| 6 | **VCST-5849** | Admin link action ↔ SQL `PK_Item` ↔ resulting virtual-catalog contents ↔ storefront category render | A 500 is the symptom; the test is that the link *succeeded and is correct*, which only the storefront render confirms |
| 7 | **VCST-5952 + VCST-5900** | Sign-out → re-login (×2) → blade context ↔ orders grid ↔ password-reset deep link | Both are session-boundary defects where the Admin SPA and the platform auth layer disagree about state |
| 8 | **VCST-5771** | Admin-authored rich content ↔ stored value ↔ storefront render | Over-sanitising is only visible by diffing what was authored against what renders |
| 9 | **VCST-4386** | Module manifest / bundle ↔ checkout payment options ↔ Skyflow iframe | Absence of a module is invisible unless the expected-present case is run alongside the expected-absent one |

---

## 13. References

**Merged PRs — `vc-frontend` (23 in window):** #2452 (VCST-5735), #2471 (VCST-5910/5831/5825/5909), #2455
(VCST-5701), #2472 (chore, no ticket), #2445 + #2427 (VCST-5159), #2470 (VCST-5891/5652), #2473
(VCST-5916), #2468 (VCST-5653), #2469 + #2483 (VCST-5317), #2459 (VCST-5472), #2474 (VCST-5890), #2487
(VCST-5146), #2478 (VCST-5838), #2479 (VCST-5911), #2440 (VCST-4386), #2402 (VCST-5097), #2475
(VCST-5024), #2484 (VCST-5912), #2460 (VCST-5771), #2461 (VCST-5772), #2462 (VCST-5773).

**Merged PRs — modules + platform (23 across 13 repos):** `vc-platform` #3097, #3109, #3111, #3115, #3116 ·
`vc-module-catalog` #905, #906 · `vc-module-customer` #315, #316 · `vc-module-loyalty` #16, #17 ·
`vc-module-pagebuilder` #161, #162 · `vc-module-sales-rep` #19 · `vc-module-order` #472 · `vc-module-core`
#257 · `vc-module-notification` #203 · `vc-module-profile-experience-api` #145 ·
`vc-module-catalog-personalization` #90 · `vc-module-elastic-app-search` #51 · `vc-module-search` #145 ·
`vc-module-image-tools` #125 · `vc-module-background-jobs` #3.

**Knowledge and rules (read, not restated):**
- `.claude/rules/agents.md` — roster, browser lanes, delegation
- `.claude/rules/test-data.md` — GOLDEN / SECOND / THIRD / FOURTH rules
- `.claude/rules/regression.md` · `.claude/rules/reports.md`
- `.claude/knowledge/oracles/business-logic.md` — `BL-*` invariants (read-only here)
- `.claude/knowledge/oracles/e-commerce-edge-cases-library.md` — `ECL-*`
- `.claude/knowledge/execution/quality-gates.md` · `ticket-routing.md` · `ticket-status-transitions.md`
- `.claude/knowledge/execution/test-data-authoring.md` · `live-discovery.md`
- `.claude/knowledge/domain/sitemap.md` — **rev 9**, refreshed at Step 0 of this run
- `.claude/knowledge/domain/loyalty-missions.md` · `sales-rep.md` · `b2b-organizations.md` · `catalog.md`
- `.claude/skills/qa-risk/risk-prioritization-framework.md` — the 5×5 used in §3
- `.claude/skills/qa-test-design/test-design-techniques.md` — the techniques named in §4.3
- `.claude/skills/qa-sbtm/sprint-charter-selection.md` — the §5.3 derivation rule

**Manifest and tooling:** `config/test-suites.json` (**143 suites, 38 selection groups** at time of writing —
`npm run suites:lint` prints the live totals; do not trust this transcription) · `npm run regression:plan -- <group>`
· `npm run env:check` · `npm run td:validate` · `npm run suites:lint`.

**Prior art:**
- `vc/shared/docs/Sprint plans/sprint-26-17-test-plan.md` — the immediately prior plan; §5.1 records why
  suite **098** was *not* activated (VCST-5735 was `Reopen`), which this sprint revisits
- `reports/tickets/Sprint26-18/` — **17 tickets already carry artifacts** (VCST-3912, 5024, 5317, 5378,
  5653, 5825, 5831, 5838, 5860, 5861, 5862, 5905, 5909, 5910, 5911, 5916, 5940). Testing on this sprint
  began before this plan existed; read these before re-testing anything
- `reports/exploratory/` — `SBTM-VCST-5024-2026-09-16`, `SBTM-VCST-5317-2026-09-09` (+R2, +R3 2026-09-10)
  are this sprint's own sessions and are prior art for §5.3's D3 check
- `reports/regression/REG-2026-09-16-1930`, `REG-2026-09-16-1821` — most recent runs

**Tracker:** Jira project `VCST`, sprint `VCST Sprint 26-18` (id 2715, board 126).
