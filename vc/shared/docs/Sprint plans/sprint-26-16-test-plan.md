# Sprint 26-16 Test Plan

**Document status:** Draft
**Author:** test-management-specialist (orchestrated by /qa-test-plan)
**Created:** 2026-08-24
**Target environment:** QA (`FRONT_URL` / `BACK_URL`)
**Sprint dates:** 2026-08-10 – 2026-08-24

---

## 1. Sprint Summary

| Field | Value |
|-------|-------|
| Sprint | Sprint 26-16 (JIRA sprint name: **`Sprint 26-16`** — note the space; `sprint = "Sprint26-16"` returns 0 issues) |
| Date range | 2026-08-10 – 2026-08-24 — **the sprint closes today**; 82 of 125 issues are still not Done |
| Sprint goal (from JIRA) | _Not exposed by the Atlassian MCP sprint field — the theme below is **inferred from the delivered set**, not quoted from JIRA._ |
| Theme | A **Sales Rep Hub correctness-and-polish pass** (statistics in the user's local time, AOV + period-over-period surfaced, per-widget failure isolation, plural/translation fixes, plus three tasks that *define* the widget logic for "New orders", "Active cart" and "Recent orders"/"Top sellers"), riding on a broad **platform infrastructure sweep**: the Hangfire → **BackgroundJob (RabbitMQ)** migration merged into six modules, **AutoMapper removal** waves 1–2 across four more, and an **x-catalog variations-resolver N+1** collapse. Alongside: a pricing-accuracy fix (`discountPercent` via `IMoneyRoundingPolicy`), a **White Labeling favicon crash that blanked the storefront**, a wishlist-lookup correctness + performance fix for Thorlabs, **WCAG 2.2 AA** gaps in the cart coupons sidebar, a new **Fulfillment-Center stock** admin blade, agent-discovery SEO (**Organization JSON-LD** + **`/llms.txt`**), a product-reviews design refresh, and storefront **chunk-load recovery**. |
| Total issues in sprint | 125 |
| Delivered (Done category) | **43** — 10 Story · 11 Bug · 16 Task · 5 Review task · 1 TechDebt |
| Test-relevant delivered tickets | **32** (9 product Stories + 10 Bugs + 1 TechDebt + 12 test-impact Task / Review task) |
| Merged frontend PRs (in window) | **19** in `vc-frontend` (#2409, #2414, #2415, #2416, #2417, #2419, #2421, #2423, #2428, #2429, #2430, #2431, #2432, #2433, #2434, #2435, #2437, #2438, #2443) |
| Merged module/platform PRs (in window) | **37** code PRs across **21** `vc-module-*` / `vc-platform` repos, **plus 26 `vc-shell`** framework PRs (separate product — see §2.4). Excludes 88 `vc-deploy-dev` / `vc-docs` / `vc-modules` / tooling PRs. |
| Environment at plan time | vcst-qa @ Platform assembly line **3.1057.0**, 87 modules, **4,520** store products (`sitemap.md` **rev 7**, refreshed by Step 0 of this run) |

> **Note on workflow statuses:** scope is taken from issues in the **Done** category (Story + Bug → §2.1/§2.2; Task / Review task / TechDebt → §2.3). *To do / In progress / In review / Ready for test / REFINEMENT / Reopen / On hold* are treated as not deliverable and excluded (§2.4). Because the sprint closes **today (2026-08-24)**, tickets may still move into Done after this cut — re-run `/qa-test-plan 26-16` after close if the delta matters.

---

## 2. Scope

### 2.1 Stories Delivered (QA-relevant)

| Key | Priority | Summary | Domain | Delivery |
|-----|----------|---------|--------|----------|
| VCST-5691 | Medium | [Support] Make `PriceType.discountPercent` rounding accurate and configurable, reusing `IMoneyRoundingPolicy` (12.5% must not be silently misreported) | Pricing / xAPI | `vc-module-x-api` #81, #82; `vc-module-x-cart` #137; `vc-module-x-catalog` #109 |
| VCST-5546 | Medium | [Fulfillment center] Manager sees product stock quantities per fulfillment center (new blade) | Inventory Admin | `vc-module-inventory` #163 |
| VCST-5335 | Medium | [Customer] [Lists] Get access to the list shared by the Rep — flagged "recommended by Rep", push notification, customer can edit | Lists / Wishlist sharing | `vc-module-cart` #192, `vc-module-sales-rep` #8, `vc-module-x-cart` #136 |
| VCST-5724 | Medium | [FE] [Sales Rep] [Lists] Remove the Email/Push channel checkboxes from the Share dialog — a share always sends on **both** channels | Lists / Sales Rep sharing | `vc-frontend` #2438 |
| VCST-5536 | Medium | [E2E] Publish Organization schema (JSON-LD) + Open Graph on the homepage; store-level config returned by the initialization query | SEO / structured data | `vc-frontend` #2415 |
| VCST-5537 | Medium | Publish a `/llms.txt` brand brief at the site root | SEO / agent discovery | `vc-frontend` #2419 |
| VCST-5487 | Medium | Update product reviews design | Customer Reviews (PDP) | `vc-frontend` #2417 |
| VCST-5544 | Medium | Logging in UCP — end-to-end OpenTelemetry observability for MCP–UCP–xAPI activity | UCP / observability | `vc-module-ucp` #6 |
| VCST-5745 | Low | [Support] [InfoSys] [Heineken] Add a random 6-digit token to the CSV product-export file name (unguessable URL) | Catalog CSV export | `vc-module-catalog-csv-export-import` #145 |

**Not product surface — excluded from §6:** VCST-5644 (*Virto Commerce Atomic Periodic Table* — a developer/SA knowledge site with no storefront or Admin SPA surface in this deployment).

### 2.2 Bugs Fixed (QA-relevant)

| Key | Priority | Summary | Domain | Delivery |
|-----|----------|---------|--------|----------|
| VCST-5575 | **High** | [Agentic Fix] White Labeling: an org favicon URL with no file extension crashes `whiteLabelingSettings` xAPI (`LastIndexOf('.') == -1`) → cascades into `pageContext` → **blank storefront** for that org | White Labeling | `vc-module-white-labeling` #26 |
| VCST-5705 | **High** | [Support] [Thorlabs] `FindWishlistsByProductsAsync` accepted `storeId` and never used it (wishlists returned across every store) + a non-SARGable customer/organization predicate on one of the module's highest-frequency queries | Lists / Wishlist + perf | `vc-module-cart` #193 |
| VCST-5533 | Medium | [Cart] Coupons sidebar — WCAG 2.2 AA gaps: success/discount-total not announced, error not field-associated, placeholder-only label, weak focus indicator | Cart a11y | `vc-frontend` #2421 |
| VCST-5592 | Medium | Statistics widgets ("New orders") on Dashboard + Customer page use UTC/server time instead of the user's local time — the day boundary disagrees with the order lists | Sales Rep Hub | `vc-frontend` #2414 |
| VCST-5623 | Medium | `POST /api/platform/security/login` returns **500** (not 400) on null credential fields; empty-string and unknown-user already return 200 gracefully | Platform Security API | `vc-platform` #3100 |
| VCST-5656 | Medium | `DELETE /api/catalog/products` returns **409** and skips all post-delete cleanup when the product has an inventory row → the product is deleted but the inventory row survives as an orphan | Catalog / Inventory API | `vc-platform` #3101 |
| VCST-5647 | Low | [OPT] [BFE] Sales Rep dashboard tiles discard the AOV and period-over-period change the statistics query already fetches | Sales Rep Hub | `vc-frontend` #2437, `vc-module-sales-rep` #11 |
| VCST-5682 | Low | Sales Rep hub: a single failed statistics widget raises a **page-level** error toast, undercutting the per-widget isolation the hub implements | Sales Rep Hub | `vc-frontend` #2432, #2443 |
| VCST-5683 | Low | My Customers table renders "1 orders" — `sales_rep.my_customers.table.orders_count` has no plural forms | Sales Rep i18n | `vc-frontend` #2430 |
| VCST-5684 | Low | German AOV widget subtitle leaves "YTD" untranslated (the German convention is *seit Jahresbeginn*) | Sales Rep i18n | `vc-frontend` #2429 |

**Carryover, excluded from scope:** VCST-5627 (a cache change token minted after the load cannot observe an invalidation landing during it → stale entity cached) resolved **2026-08-04**, before this sprint's window opened — already covered by the Sprint 26-15 plan's request-scoped-caching sweep.

### 2.3 TechDebt / Structural (QA-relevant: may impact tests / touch hot paths)

| Key | Type | Summary | Test impact | Delivery |
|-----|------|---------|-------------|----------|
| VCST-5490 | Task | Migrate modules from Hangfire to **BackgroundJob (RabbitMQ)** — Step 1 | **Cross-module.** Every background job in catalog, inventory, order, pricing, sitemaps and store changes execution substrate. Indexing, export/import, order processing and sitemap generation are all downstream | `vc-module-catalog` #903, `inventory` #164, `order` #503, `pricing` #237, `sitemaps` #92, `store` #174 |
| VCST-5689 | Task | x-catalog: batch the variations resolver instead of one Elasticsearch search per variation-bearing master on a listing page | Catalog browse + PLP performance; a correctness risk if batching changes *which* variations resolve | `vc-module-x-catalog` #108 |
| VCST-5659 / VCST-5660 | Task | **AutoMapper removal** waves 1 + 2 | Hand-written mapping replaces convention mapping — a dropped or mistyped field is silent. Touches CSV export/import, pickup, profile xAPI, order xAPI | `catalog-csv-export-import` #142, `x-pickup` #10, `profile-experience-api` #144, `x-order` #49 |
| VCST-5654 | TechDebt | Failed chunk loads are permanent — no retry or error handling for dynamic imports | Storefront resilience: a transient CDN/network failure previously bricked the route until a hard reload | `vc-frontend` #2431 |
| VCST-5587 | Task | Define + align **"New orders"** widget logic on Dashboard and Customer page — which order statuses count toward value and delta | Supplies the **oracle** for the Sales Rep statistics assertions | `vc-frontend` #2433 |
| VCST-5588 | Task | Define + align **"Active cart"** widget logic — what value and delta represent | As above | `vc-frontend` #2416, `vc-module-sales-rep` #10 |
| VCST-5590 | Task | Define + align display rules for **"Recent orders"** and **"Top sellers"** — whether to render empty statuses/categories | As above | `vc-frontend` #2409, `vc-module-sales-rep` #9 |
| VCST-5720 | Task | [Skyflow] Expose the module's GraphQL schema on its own endpoint | Payment module surface moves — schema/introspection path changes for Skyflow cases | `vc-module-skyflow` #25 |
| VCST-5716 | Review task | `vc-module-x-api`: let the caller extend the MediatR configuration `AddSchema` builds | xAPI infrastructure; regression risk across every module that builds a schema | `vc-module-x-api` #80 |
| VCST-5736 | Review task | `vc-platform`: make the production error page reachable and renderable | Error-path surface — a 500 must now render a page, not a blank | `vc-platform` #3103 |
| VCST-5739 | Review task | `vc-module-subscription`: log a warning instead of failing when a subscription has no `CustomerOrderPrototype` | Subscription job no longer hard-fails on incomplete data | `vc-module-subscription` #119 |
| VCST-5220 | Task | Fix sample data — property name `NFC_` must start with a letter or number | Sample-data seeding; affects fresh-env provisioning | sample-data assets |

### 2.4 Out of Scope

**Not delivered this sprint (82 issues).** Everything still in *To do / In progress / In review / Ready for test / REFINEMENT / Reopen / On hold* at the 2026-08-24 cut — including the whole **`vc-shell` WCAG 2.2 accessibility cluster** (VCST-5632, 5670, 5671, 5672, 5673, 5677, 5678, 5679, 5680, 5663–5669, 5688, 5600, 5596, 5598, 5530, 5746), all *Ready for test*, none Done.

> **`vc-shell` / Vendor Portal is a SEPARATE PRODUCT.** Its **26** merged PRs in this window are the largest single block of code movement in the sprint, but this repo's storefront rules, `BL-UI-*` invariants, Coffee-theme oracles and regression suites **do not apply to it**. It is tested against `vcmp-dev` and its own hosted Storybook, not `FRONT_URL`. No `vc-shell` ticket is mapped to a storefront suite in §5 or §6.

**Delivered but excluded from the test plan:**

| Key | Reason |
|-----|--------|
| VCST-5627 | Carryover — resolved 2026-08-04, before the sprint window (covered by the 26-15 plan) |
| VCST-5644 | *Atomic Periodic Table* — developer/SA knowledge site, no product surface in this deployment |
| VCST-5585, VCST-5737 | Documentation only (`SECURITY.md`, PR-description guide) — no user-facing change |
| VCST-5619 | `vc-shell` `test:storybook` CI gate — separate product, CI tooling |
| VCST-4863, VCST-5248 | Maintenance / deprecation-warning review — no shipped user-facing change |
| VCST-5510, VCST-5568, VCST-5700 | QA-internal tooling and test-execution tasks (autotest build parallelism, a theme regression run, a load test) |
| VCST-5582, VCST-5774 | Agentic-QA plugin work in this tooling repo, not the VC product |
| VCST-5641 | *To do* — OpenTelemetry cache metrics; the `vc-module-opentelemetry` #2 PR merged but the ticket has not reached Done |

**PRs from prior-sprint tickets landing in this window** (code is live on QA; coverage already planned in Sprint 26-15): VCST-5332 (`vc-module-cart` #192, `sales-rep` #8, `x-cart` #136) and VCST-5367 (`vc-module-sales-rep` #6).

**Unlinked PRs** (no VCST reference): `vc-frontend` #2428 (SonarCloud reliability gate on `dev`), #2435 (backend package + type bump); `vc-module-store` #175/#176 (dependabot). `vc-module-subscription` #119 and `vc-module-x-api` #80 carry no key in the title but are linked via Review tasks VCST-5739 / VCST-5716.

---

## 3. Risk Assessment

Scored with the 5×5 Likelihood × Impact matrix (`.claude/skills/qa-risk/risk-prioritization-framework.md`), grouped by **domain**, not by ticket.

| Domain | Tickets | L | I | Score | Level | Rationale |
|--------|---------|:-:|:-:|:-----:|-------|-----------|
| **Sales Rep Hub & Customer Profile** | 5592, 5647, 5682, 5683, 5684, 5587, 5588, 5590 | 5 | 4 | **20** | Critical | Eight Done tickets and nine PRs land on the *same* statistics/widget surface in one sprint — the highest concurrent-change count of the sprint. Time-window logic, value/delta definitions, failure isolation and i18n all moved at once; a regression here is visible to every B2B rep |
| **Pricing & `discountPercent` (xAPI)** | 5691 | 4 | 5 | **20** | Critical | A rounding change on the price object served to PDP, PLP and cart. Wrong percentages are a revenue-path and trust defect, and the fix spans four PRs in three repos (`x-api`, `x-cart`, `x-catalog`) |
| **Catalog browse & variations resolver** | 5689, 5659, 5660 | 4 | 5 | **20** | Critical | The variations resolver was re-shaped from per-master search to batched, and AutoMapper was removed from four mapping paths in the same window. Catalog browse is a P0 revenue path and mapping loss is silent |
| **Background-jobs migration (Hangfire → RabbitMQ)** | 5490 | 4 | 5 | **20** | Critical | One change merged into six modules at once, replacing the execution substrate for indexing, export/import, order processing and sitemap generation. Failures are asynchronous and surface late |
| **Lists / Wishlist sharing** | 5335, 5724, 5705 | 4 | 4 | **16** | Critical | Three tickets across storefront, sales-rep and cart module; `storeId` scoping changed on the "in wishlist" lookup that runs on every catalog and product page, and the share dialog's channel model changed |
| **White Labeling** | 5575 | 3 | 5 | **15** | High | Low likelihood (the Admin UI only permits upload; reachable via API or bad-data import) but total impact — the entire storefront rendered blank for the affected org |
| **Platform Security / Auth API** | 5623 | 3 | 5 | **15** | High | Auth is a P0 path; the fix changes the error contract on the login endpoint, so the regression risk is refusing a payload that previously succeeded |
| **Cart — coupons sidebar (a11y)** | 5533 | 3 | 5 | **15** | High | Cart is P0. Four announcement/labelling/focus changes to a live widget; the risk is a DOM change breaking coupon apply/remove, not the a11y improvement itself |
| **Catalog / Inventory Admin** | 5546, 5656, 5745, 5220 | 4 | 3 | **12** | High | A new blade, a delete-path fix with cleanup semantics, an export-filename change and a sample-data fix — four concurrent changes to admin catalog/inventory workflows |
| **Storefront resilience (chunk loads)** | 5654 | 3 | 4 | **12** | High | Route-level dynamic-import recovery. A wrong retry policy can mask a real failure or loop; correct behaviour is only observable under induced network failure |
| **Payment — Skyflow schema endpoint** | 5720 | 2 | 5 | **10** | High | Only a schema-exposure change, but Skyflow is a P0 payment processor with `allowCartPayment=true` — the card form renders directly on the cart page |
| **Customer Reviews (PDP)** | 5487 | 3 | 3 | **9** | Medium | A visual redesign of the reviews block on the PDP; contained, but PDP-visible |
| **SEO / structured data & agent discovery** | 5536, 5537 | 3 | 3 | **9** | Medium | New homepage JSON-LD + Open Graph driven by store settings, plus a new static `/llms.txt`. Malformed JSON-LD is invisible to users but breaks agent/crawler parsing |
| **UCP / OpenTelemetry observability** | 5544 | 2 | 2 | **4** | Low | Telemetry emission only — no user-facing surface; verified by reading traces, not the UI |

> **Not scored — separate product:** the `vc-shell` / Vendor Portal a11y cluster (26 PRs). Its tickets are *Ready for test*, not Done, and it sits outside this repo's regression scope entirely (§2.4).

---

## 4. Test Strategy

### 4.1 Testing Layers Matrix

| Domain | Storefront UI | Admin SPA | REST API | GraphQL xAPI | A11y | Analytics |
|--------|:------------:|:---------:|:--------:|:------------:|:----:|:---------:|
| Sales Rep Hub & Customer Profile | Yes | — | — | Yes | — | — |
| Pricing & `discountPercent` | Yes | Yes | Yes | Yes | — | — |
| Catalog browse & variations resolver | Yes | — | — | Yes | — | — |
| Background-jobs migration | — | Yes | Yes | — | — | — |
| Lists / Wishlist sharing | Yes | — | Yes | Yes | — | — |
| White Labeling | Yes | Yes | — | Yes | — | — |
| Platform Security / Auth API | — | Yes | Yes | — | — | — |
| Cart — coupons sidebar | Yes | — | — | Yes | Yes | — |
| Catalog / Inventory Admin | — | Yes | Yes | — | — | — |
| Storefront resilience (chunk loads) | Yes | — | — | — | — | — |
| Payment — Skyflow | Yes | — | Yes | Yes | — | — |
| Customer Reviews (PDP) | Yes | Yes | — | Yes | — | — |
| SEO / structured data | Yes | Yes | — | Yes | — | Yes |
| UCP / OpenTelemetry | — | — | Yes | Yes | — | Yes |

### 4.2 Testing Approach by Priority

**Critical domains (run first, block release if failing):**

- **Sales Rep Hub & Customer Profile (5592, 5647, 5682, 5683, 5684 + the 5587/5588/5590 definitions).** The three definition tasks are the **oracle** — read them before asserting anything, because "New orders" and "Active cart" now have a declared status set and delta meaning, and "Recent orders"/"Top sellers" have declared empty-state rules. For **5592** the assertion is a *day-boundary* one: identify or seed an order placed inside the local-time day but outside the UTC day (or vice-versa) and assert the widget count agrees with the order list on the same page — comparing two widgets to each other is not enough, since both can be wrong in the same direction. For **5647**, assert the tiles now *render* the AOV and period-over-period change the query already returns; a `null` `*ChangePercent` may be legitimately correct rather than broken, because `createdDate` is server-assigned and past-period baselines are unseedable (`reference_order_createddate_unwritable`). For **5682**, force exactly **one** statistics query to fail and assert the failing widget shows its own inline "Couldn't load…" state, every sibling keeps its real value, **and no page-level toast appears** — the absence of the toast *is* the fix. **5683/5684** are i18n: `1 order` / `2 orders` in English and no bare "YTD" in the German subtitle; sweep the other shipped locales for the same pattern rather than only the two reported strings.
- **Pricing & `discountPercent` (5691).** Drive a fractional promotion (e.g. 12.5%) and assert the percentage the storefront displays equals the one configured — on PDP, PLP and the cart line, since all three read the same price object. Then exercise the policy itself: precision and midpoint behaviour are now configurable through `IMoneyRoundingPolicy`, so change the policy and assert the exposed value follows it and that no consumer recomputes the percentage locally. Regression: a price with **no** discount must expose `0`, not `null` or a rounding artefact.
- **Catalog browse & variations resolver (5689, 5659, 5660).** Correctness before performance. On a listing page carrying several variation-bearing masters, assert the **same set of variations** resolves before and after batching — a batched query that silently drops or re-orders variations is the failure mode. Then confirm the N+1 collapse with `/qa-perf-measure`'s paired positive/negative controls: a dependency count that does *not* drop is a finding, not a pass. For the AutoMapper waves, walk **every** field of the affected DTOs on a fully-populated entity (CSV export/import round-trip, pickup, profile xAPI, order xAPI) — hand-written mapping fails by omission, so asserting on a subset of fields proves nothing.
- **Background-jobs migration (5490).** For each of the six modules, trigger its background job through the real UI/API and assert it (a) starts, (b) reports progress, (c) completes with a non-zero result, and (d) surfaces a **readable failure** on bad input — "success with 0 documents" is the bug shape this substrate change is most likely to produce. Catalog and search indexing, price-list import, order processing and sitemap generation are the four highest-value jobs. Also assert job **cancellation** still works, since that is the semantics most likely to differ between Hangfire and a queue.
- **Lists / Wishlist sharing (5335, 5724, 5705).** For **5705** the store-scoping fix is the assertion: a customer with wishlists in **two** stores must see the "in wishlist" marker only for the current store's list — this is the defect that shipped, and it is invisible on a single-store env, so it needs a two-store fixture. For **5335**, a rep-shared list appears in the customer's own lists flagged as recommended by the rep, the push notification links to it, and the customer can **edit** it (add/remove items). For **5724**, the Share dialog no longer shows Email/Push checkboxes and the share is delivered on **both** channels — assert the delivery, not just the absent checkbox, and re-open an *existing* share for editing, since the original defect was on the edit path.

**High domains (run in parallel with the Critical set):**

- **White Labeling (5575):** set an org favicon URL with **no file extension** (via API or import, since the Admin UI only permits upload) and assert `whiteLabelingSettings` returns a usable payload and the storefront **mounts** — the regression is a blank page, so assert render, not merely HTTP 200. Re-check that the normal extension-bearing path and the size-suffix variants still resolve.
- **Platform Security / Auth API (5623):** drive the full payload matrix — `{}`, `userName: null`, `password: null`, missing key, empty raw body, empty string, unknown user, valid credentials — asserting **400** for malformed/incomplete, **200 + `succeeded:false`** for wrong-but-well-formed, and success for valid. No stack trace in any response body.
- **Cart — coupons sidebar (5533):** the a11y assertions (success and discount-total announced, error tied to the input via `aria-describedby`, a real label rather than placeholder-only, a visible focus indicator) run against axe-core at WCAG 2.2 AA **plus a keyboard walk**; the higher-value regression check is that apply / replace / remove coupon still work and the discount total still updates, since the DOM around the widget changed. Hold the single-slot last-wins coupon behaviour and assert on `discountTotal` (`reference_cart_coupon_sidebar_behavior`).
- **Catalog / Inventory Admin (5546, 5656, 5745, 5220):** for **5656** the A/B is a product **with** an inventory row versus one without — DELETE must return 200, publish `ProductChangedEvent`, and leave **no orphan inventory row**; re-query inventory after the delete rather than trusting the response. **5546** is a new blade: stock per fulfillment center, non-zero items only, variations included — seed inventory against the store's main FFC, not `ffcs[0]` (`reference_seed_inventory_store_main_ffc`). **5745**: the export filename carries a random token and two consecutive exports produce **different** names. **5220**: a fresh sample-data seed completes without the `NFC_` property-name rejection.
- **Storefront resilience (5654):** induce a failed dynamic import (block the chunk URL) and assert the route recovers — the retry succeeds, or a readable error is shown with a working recovery action. Assert it does **not** loop indefinitely, and that a genuinely missing chunk still surfaces an error rather than a silent blank.
- **Payment — Skyflow (5720):** the module's GraphQL schema is reachable on its own endpoint **and** the cart-page card form still renders and completes a payment (`allowCartPayment=true`). Schema relocation must not change the storefront's payment path.

**Medium/Low (after Critical + High pass):** Customer Reviews PDP redesign — visual + state stress (no reviews / one / many, plus the rating summary), screenshotting even on PASS per `feedback_sized_control_token_aspect_oracle`; SEO — the homepage emits a **valid** `application/ld+json` Organization/OnlineStore block (parse it, don't grep for the tag) plus Open Graph tags, driven by store settings and reverted correctly by the initialization query, and `/llms.txt` is served at the site root as plain text with a 200; UCP/OpenTelemetry — MCP–UCP–xAPI activity appears as correlated traces in Application Insights with usable operation names (read the telemetry; there is no UI surface).

### 4.3 Test Design Techniques by Domain

| Domain / Ticket | Technique | Rationale |
|-----------------|-----------|-----------|
| Statistics local time (5592) | BVA + Decision Table | order timestamp either side of the local/UTC day boundary × widget × order list |
| Widget logic definitions (5587, 5588, 5590) | Decision Table | order status set × counted-in-value × counted-in-delta; empty status/category × rendered-or-hidden |
| AOV / period-over-period tiles (5647) | EP | zero / partial / full data; legitimate `null` comparison vs a missing render |
| Per-widget failure isolation (5682) | Error Guessing + State Transition | force 1 of N queries to fail → inline state, siblings intact, **no** page toast |
| Plural + translation (5683, 5684) | BVA + Checklist | count 0 / 1 / 2 / many; sweep every shipped locale, not the two reported strings |
| `discountPercent` rounding (5691) | BVA + EP | 12.5% and other fractional rates; midpoint values; 0% and no-discount; policy precision settings |
| Variations resolver batching (5689) | Dependency-count A/B with paired controls | a count that doesn't drop is a finding, not a pass; variation **set equality** before/after |
| AutoMapper removal (5659, 5660) | Field-coverage matrix (EP over DTO fields) | hand-written mapping fails by omission — assert every field on a fully-populated entity |
| Background-jobs migration (5490) | State Transition + Error Guessing | queued → running → completed / failed / cancelled, per module; bad input → readable failure, never "success with 0" |
| Wishlist store scoping (5705) | Decision Table | store × customer/organization × wishlist present → "in wishlist" marker shown |
| Rep-shared list access (5335) | State Transition | shared → visible to customer → opened → edited → items added to cart |
| Share channel simplification (5724) | Decision Table | new share vs **editing an existing** share × email delivered × push delivered |
| Favicon extension crash (5575) | Error Guessing + EP | URL with / without extension, with query string, empty, malformed → xAPI survives and the storefront mounts |
| Login null credentials (5623) | Decision Table | `userName` × `password` ∈ {valid, empty, null, absent} × raw-body shape → status code |
| Coupons sidebar a11y (5533) | Checklist (WCAG 2.2 AA) + keyboard walk | announcement, error association, label, focus indicator — plus an apply/remove regression pass |
| Product delete with inventory (5656) | Decision Table | inventory row present/absent × qty 0/non-zero × row age → status, event published, orphan row |
| Fulfillment-center stock blade (5546) | EP + Pairwise | FC × product/variation × zero vs non-zero quantity |
| Export filename randomness (5745) | Error Guessing | two consecutive exports differ; token format; URL not guessable from the timestamp |
| Chunk-load recovery (5654) | State Transition + Error Guessing | load fails → retry → succeeds / exhausts → readable error; never an infinite loop or a silent blank |
| Skyflow schema endpoint (5720) | EP | schema reachable on the new endpoint; cart-page card form still completes a payment |
| Organization JSON-LD + OG (5536) | EP + schema validation | store setting present/absent/partial → valid **parsed** JSON-LD, not a substring match |
| `/llms.txt` (5537) | Checklist | served at root, 200, `text/plain`, non-empty |
| Customer Reviews redesign (5487) | State stress + visual review | no reviews / one / many / long text; screenshot even on PASS |
| UCP telemetry (5544) | Trace inspection | MCP→UCP→xAPI correlated by operation id, usable operation names |

---

## 5. Regression Suite Mapping

### 5.1 Suites Activated by This Sprint

> Classified by the CSV's **layer directory**, not by JIRA component. All 34 ids below exist in `config/test-suites.json` (123 suites) and their CSVs are present on disk — verified this run. No `vc-shell` / Vendor Portal ticket is mapped here (§2.4).

#### 5.1.1 Frontend Suites (`regression/suites/Frontend/`)

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 001 | Catalog Navigation | Catalog | VCST-5705, VCST-5689 | P1 |
| 002 | Product Detail | Catalog | VCST-5705 | P1 |
| 007 | B2B Lists & Shared | Lists / Wishlist | VCST-5335, VCST-5724 | P1 |
| 028 | Cart Core | Cart | VCST-5533 | P1 |
| 045 | Accessibility Tests | Cross-cutting | VCST-5533 | P2 |
| 048d | Structured Data & SEO (storefront) | SEO | VCST-5536, VCST-5537 | P2 |
| 070 | Whitelabeling Storefront | White Labeling | VCST-5575 | P1 |
| 071 | Whitelabeling Branding | White Labeling | VCST-5575 | P1 |
| 077b | Coupons & Promotions — Cart Sidebar | Marketing / Cart | VCST-5533 | P1 |
| 088 | Customer Reviews Storefront | Customer Reviews | VCST-5487 | P2 |
| 089 | Sales Rep — My Customers (storefront) | Sales Rep | VCST-5683 | P1 |
| 091 | Sales Rep — Customer Profile (storefront) | Sales Rep | VCST-5592, VCST-5682, VCST-5587, VCST-5588, VCST-5590 | P1 |
| 093 | Sales Rep — Hub Dashboard (storefront) | Sales Rep | VCST-5592, VCST-5647, VCST-5682, VCST-5684, VCST-5587, VCST-5588, VCST-5590 | P1 |
| 040a | Payment - Skyflow | Payment | VCST-5720 | P0 |

#### 5.1.2 Backend Suites (`regression/suites/Backend/`)

| Suite ID | Name | Module | Sprint Trigger | Priority |
|----------|------|--------|----------------|----------|
| 021 | Platform Dynamic Properties | Platform | VCST-5220 | P1 |
| 049 | Platform API | Platform / Auth | VCST-5623, VCST-5656 | P0 |
| 050a | GraphQL xCatalog | Catalog | VCST-5689, VCST-5691 | P1 |
| 050c | GraphQL xOrder | Orders | VCST-5659, VCST-5660 | P1 |
| 050d | GraphQL xProfile | Profile | VCST-5659, VCST-5660 | P1 |
| 050e | GraphQL xFrontend (pageContext) | Frontend xAPI | VCST-5536, VCST-5575 | P1 |
| 050g | GraphQL Cross-Cutting | xAPI infra | VCST-5716 | P1 |
| 050h | GraphQL Wishlist | Lists | VCST-5335, VCST-5705, VCST-5724 | P1 |
| 050k | GraphQL xPickup | BOPIS | VCST-5659, VCST-5660 | P1 |
| 050l | GraphQL xAPI — Push Messages | Notifications | VCST-5335 | P2 |
| 050m | GraphQL xAPI — Sales Rep | Sales Rep | VCST-5592, VCST-5647, VCST-5682, VCST-5587, VCST-5588, VCST-5590 | P1 |
| 051 | Catalog Admin Products | Catalog | VCST-5656 | P1 |
| 054 | Pricing Logic | Pricing | VCST-5691 | P1 |
| 056 | Inventory | Inventory | VCST-5546, VCST-5656 | P1 |
| 064 | CSV Import Export | Import / Export | VCST-5659, VCST-5660, VCST-5745 | P1 |
| 067 | Whitelabeling Admin | White Labeling | VCST-5575 | P1 |
| 086 | Customer Reviews GraphQL (xAPI) | Customer Reviews | VCST-5487 | P2 |
| 087 | Customer Reviews Admin & Moderation | Customer Reviews | VCST-5487 | P2 |
| 094 | UCP Observability | UCP | VCST-5544 | P2 |
| 095 | Background Jobs — Hangfire Migration | Background Jobs | VCST-5490 | P1 |

**Totals:** 14 Frontend + 20 Backend = **34 suites activated**.

### 5.2 Coverage Gaps — New Test Cases Needed

| GAP ID | Ticket | Gap description | Target suite(s) | Owner |
|--------|--------|-----------------|-----------------|-------|
| GAP-01 | VCST-5537 | No suite validates a static `/llms.txt` at the site root; `048d` covers JSON-LD/OG only, not a plain-text brand brief | `048d` (extend) — genuinely thin surface | qa-frontend-expert |
| GAP-02 | VCST-5644 | Atomic Periodic Table is a standalone dev/marketing knowledge site, not part of `vc-frontend` or the Admin SPA — **no applicable suite, no QA surface in this repo** | none | — |
| GAP-03 | VCST-5654 | No suite exercises a failed dynamic `import()` / stale chunk-hash scenario or its retry/error-handling path — **the domain has no suite today** | none — new case set needed | qa-frontend-expert |
| GAP-04 | VCST-5720 | No suite validates a payment module's own GraphQL schema endpoint; `040a` covers only the storefront card-form flow — **the backend GraphQL surface is uncovered** | `040a` (frontend only) — no backend counterpart | qa-backend-expert |
| GAP-05 | VCST-5716 | The `AddSchema` MediatR extension point is infra-level; no suite asserts a caller-extended schema still registers correctly across xAPI modules | `050g` (extend) | qa-backend-expert |
| GAP-06 | VCST-5736 | No suite verifies the platform's production error page actually renders (vs blank / raw 500) | none — platform-config has no error-page case | qa-backend-expert |
| GAP-07 | VCST-5739 | The Subscriptions module has **no active regression suite at all** (`feature-domain-map.md`: "Subscription/recurring orders: None — GAP, not active in the current QA environment"), so the `CustomerOrderPrototype`-null warning path is unverifiable | none | qa-backend-expert |
| GAP-08 | VCST-5705 | `050h`/`007` exist but do not test **cross-store wishlist isolation** (the fixed `storeId` bug) or the "in wishlist" marker at catalog/PDP scale under the corrected predicate | `050h`, `001`, `002` | qa-backend-expert |
| GAP-09 | VCST-5335 | No case covers the full cross-layer chain: Rep shares list → push notification delivered → customer sees the "recommended by Rep" flag → customer edits the list | `007`, `050h`, `050l` | qa-frontend-expert + qa-backend-expert |
| GAP-10 | VCST-5546 | The new stock-per-fulfillment-center Admin blade has zero existing coverage in `056` | `056` | qa-backend-expert |
| GAP-11 | VCST-5587 / 5588 / 5590 | The newly-defined widget business rules (new-orders statuses, active-cart delta, recent-orders/top-sellers empty state) have no prior case set | `091`, `093`, `050m` | qa-frontend-expert + qa-backend-expert |
| GAP-12 | VCST-5691 | `054` has no case for the `discountPercent` rounding defect (12.5% misreport) under a configurable `IMoneyRoundingPolicy` | `054`, `050a` | qa-backend-expert |
| GAP-13 | VCST-5623 | `049` lacks a null/malformed-credential negative case against `POST /api/platform/security/login` | `049` | qa-backend-expert |

---

## 6. New Test Cases Needed (Per Ticket)

Counts and mapping only — the cases themselves are authored later via `/qa-test-cases-generator VCST-XXXX`, which resolves all `@td()` / `{{VAR}}` bindings at authoring time per `.claude/rules/test-data.md`.

### 6.1 Stories

| Ticket | Layers | Case type | Count | Target suite | Technique |
|--------|--------|-----------|:-----:|--------------|-----------|
| VCST-5335 | Storefront, GraphQL (Wishlist + Push) | Functional — share received, flag, edit | 6 | `007`, `050h` | State Transition + Decision Table |
| VCST-5487 | Storefront, GraphQL, Admin | Visual / functional redesign | 5 | `088`, `086`, `087` | EP + Error Guessing |
| VCST-5536 | Storefront, GraphQL (xFrontend) | SEO validation (JSON-LD / OG) | 4 | `048d`, `050e` | Decision Table (config on/off × field) |
| VCST-5537 | Storefront / static asset | Static-file validation | 2 | `048d` (thin) | EP |
| VCST-5544 | Backend / observability | Telemetry presence | 3 | `094` | Error Guessing (trace propagation) |
| VCST-5546 | Admin SPA | New blade — CRUD / display | 5 | `056` | BVA (qty 0 / negative / max) + Decision Table (multi-FFC) |
| VCST-5644 | — | N/A — no QA surface | 0 | none | — |
| VCST-5691 | GraphQL, REST | Rounding-config BVA | 6 | `054`, `050a` | BVA (12.5% / .005 edge) + Pairwise (policy × currency) |
| VCST-5724 | Storefront | UI simplification regression | 3 | `007` | EP + State Transition (both channels sent) |
| VCST-5745 | Admin / REST | Filename / security | 2 | `064` | Error Guessing (guessable URL) |

### 6.2 Bugs

| Ticket | Layers | Case type | Count | Target suite | Technique |
|--------|--------|-----------|:-----:|--------------|-----------|
| VCST-5575 | Storefront, GraphQL | Negative regression (crash repro) | 3 | `067`, `070`, `071` | EP (favicon URL formats) + BVA |
| VCST-5705 | GraphQL, Storefront | Regression — `storeId` scope + perf | 4 | `050h`, `001`, `002` | EP (multi-store) + Error Guessing |
| VCST-5533 | Storefront, A11y | A11y regression | 5 | `028`, `045`, `077b` | Checklist (WCAG 2.2 AA) + Decision Table (state × AT) |
| VCST-5592 | Storefront, GraphQL | Timezone regression | 3 | `093`, `091`, `050m` | BVA (local midnight vs UTC boundary) |
| VCST-5623 | REST | Negative / error-code | 2 | `049` | EP (null field combinations) |
| VCST-5656 | REST, Admin | Negative + cleanup verification | 3 | `049`, `051`, `056` | Error Guessing + State Transition (delete with dependent inventory) |
| VCST-5647 | Storefront, GraphQL | Regression — data completeness | 2 | `093`, `050m` | EP |
| VCST-5682 | Storefront | Fault-isolation regression | 2 | `093`, `091` | Error Guessing (simulate one widget failure) |
| VCST-5683 | Storefront | i18n regression | 1 | `089` | EP (count = 1 vs > 1) |
| VCST-5684 | Storefront | i18n regression | 1 | `093` | EP |

### 6.3 Tasks / TechDebt

| Ticket | Layers | Case type | Count | Target suite | Technique |
|--------|--------|-----------|:-----:|--------------|-----------|
| VCST-5490 | Backend (6 modules) | Regression smoke — job still fires | 6 | `095` | State Transition (queued → processed) |
| VCST-5659 / 5660 | GraphQL (4 modules) | Regression — mapping fidelity | 4 | `064`, `050k`, `050d`, `050c` | EP over DTO fields |
| VCST-5654 | Storefront | Resilience / error handling | 3 | none (GAP-03) | Error Guessing (simulate stale chunk 404) |
| VCST-5689 | GraphQL, Storefront | Perf / functional regression | 3 | `050a`, `001` | BVA (variation-count scaling) + Error Guessing (N+1) |
| VCST-5587 / 5588 / 5590 | Storefront, GraphQL | Business-rule verification | 6 | `091`, `093`, `050m` | Decision Table (status × empty state) |
| VCST-5720 | GraphQL (payment) | Schema-exposure functional | 2 | none (GAP-04) | EP |
| VCST-5716 | GraphQL infra | Regression smoke | 1 | `050g` | Error Guessing |
| VCST-5736 | Platform | Negative / error page | 2 | none (GAP-06) | Error Guessing |
| VCST-5739 | Backend | Negative — no prototype | 1 | none (GAP-07) | Error Guessing |
| VCST-5220 | Admin SPA | Validation — property name | 2 | `021` | BVA / EP (leading-character class) |
| VCST-5619 | vc-shell (separate product) | N/A — out of regression scope | 0 | N/A | — |

**Estimated total new cases: 85–100** (Stories ≈36 · Bugs ≈26 · Tasks/TechDebt ≈30; VCST-5644 and VCST-5619 at 0).

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria

- Sprint 26-16 builds deployed to QA: Platform ≥ **3.1057.0** (87 modules) carrying `vc-platform` #3100/#3101/#3103, `vc-module-white-labeling` ≥ #26, `vc-module-cart` ≥ #193, `vc-module-inventory` ≥ #164, `vc-module-x-api` ≥ #82, `vc-module-x-catalog` ≥ #109, `vc-module-sales-rep` ≥ #11, `vc-module-skyflow` ≥ #25, `vc-module-ucp` ≥ #6, and the theme carrying `vc-frontend` #2443. **Verify against `/api/platform/modules`** — a pinned version is not proof it is live (`reference_platform_deploy_silent_fail_trailing_comma`, `reference_module_bump_silent_dependency_skip`). For the Platform itself, read the version from the **login-page HTML**, not `/health` (`reference_platform_live_version_from_login_page`).
- `npm run env:check` green for the target env; `npm run td:validate` + `TEST_ENV=<env> npm run td:reconcile` green.
- **Sales Rep fixtures seeded** (`npm run seed:sales-rep`, `seed:sales-rep-stats`): a rep serving ≥2 orgs with a saved-layout baseline, a rep with partial data, a rep with zero customers, plus the statistics-windows fixture (`td:validate:sales-rep`, `td:validate:sales-rep-stats` green).
- **A two-store wishlist fixture** — the same customer holding a wishlist in two different stores. Without it VCST-5705's store-scoping fix is unverifiable (GAP-08); a single-store env passes vacuously.
- A **fully-populated** entity per AutoMapper-touched DTO (CSV export/import row, pickup, profile, order) so field-by-field mapping loss is detectable.
- Promotion fixtures with a **fractional** discount rate (12.5%) for VCST-5691, plus a zero-discount control.
- An org with a **malformed favicon URL** (no file extension), set via API or import — the Admin UI will not produce one.
- Inventory rows attached to disposable products for the VCST-5656 delete A/B, seeded against the **store's main FFC** (`reference_seed_inventory_store_main_ffc`).
- Browser secrets file `.env.playwright.local` loaded **at MCP start** (`feedback_playwright_secrets_startup_only`) — a mid-session change locks the shared account out.
- Admin SPA credentials confirmed per env (`Password1!` vs `Password1` differ by env).

### 7.2 Exit Criteria

- **All five Critical domains** pass their activated suites, including a cross-browser (chrome + edge) pass; zero open P0/P1 in Sales Rep Hub, Pricing, Catalog browse, Background jobs or Lists/Wishlist.
- The *silent-wrong-state* assertions hold explicitly, each with evidence: the statistics day boundary agrees with the order list on the same page; a single failed widget produces **no** page-level toast; the variation **set** is unchanged after batching and the dependency count actually drops against a paired control; every background job either completes with a non-zero result or reports a readable failure (never "success with 0"); a product delete with an inventory row leaves **no orphan row**; the "in wishlist" marker is scoped to the current store.
- `discountPercent` matches the configured rate for a fractional promotion on PDP, PLP and cart, and follows the configured `IMoneyRoundingPolicy`.
- `whiteLabelingSettings` survives an extension-less favicon URL and the storefront **mounts** for that org.
- `POST /api/platform/security/login` returns 400 for every malformed payload shape and still succeeds for valid credentials — no stack traces in any body.
- axe-core WCAG 2.2 AA: no new Critical/Serious violations in the cart coupons sidebar, and coupon apply/replace/remove still work with `discountTotal` updating.
- Homepage JSON-LD **parses** as valid Organization/OnlineStore; `/llms.txt` returns 200 as plain text.
- Every new case authored this sprint is promoted (`Draft → Automated`/`Reviewed`) or left `Draft` with a stated reason; `npm run suites:lint` + `npm run suites:review` green (no duplicate case IDs).
- Feature Release Gate computed deterministically (`npm run … compute-metrics.ts --gate feature`), GO/NO-GO recorded per domain; **release approval stays human**.

---

## 8. Test Data Requirements

| Need | Source / alias | Notes |
|------|----------------|-------|
| Sales reps (multi-org, partial-data, zero-customer) | `test-data/sales-rep/sales-reps.csv` → `@td(SR_REP_PRIMARY.*)`, `@td(SR_REP_PAGING.*)`, `@td(SR_REP_NOCUSTOMERS.*)` | `SR_REP_LAYOUT` is the **only** disposable-layout alias — never wipe `SR_REP_PRIMARY`'s never-saved baseline (`td:validate:sales-rep`) |
| Sales Rep statistics windows (MTD/YTD, last-year comparison) | `npm run seed:sales-rep-stats` + `buildStatisticsWindows()` | `createdDate` is **server-assigned** — past-period baselines are unseedable, so a `null` `*ChangePercent` may be correct, not broken (`reference_order_createddate_unwritable`) |
| An order straddling the local/UTC day boundary | `live-discover` against the seeded order set | The VCST-5592 assertion; pick by timestamp, never by a hardcoded order number |
| Two-store wishlist (same customer) | wishlist fixtures + a second store | **Required** for VCST-5705 (GAP-08); single-store envs pass vacuously |
| Rep-served orgs | `test-data/b2b/organizations.csv` (pinned `platform_id`) | Every served org must be pinned, not overlay-resolved |
| Fractional-discount promotion (12.5%) + zero-discount control | promotion fixtures + `@td(PRICELIST_*.*)` | Assert on the re-read price object, not the write response |
| Product with an inventory row (disposable) | `@td(PROD_*.sku)` + `npm run seed:inventory` | Seed against the store's **main** FFC (`reference_seed_inventory_store_main_ffc`) |
| Org with a malformed favicon URL (no extension) | set via Platform API / import | The Admin UI only permits upload — it cannot produce this input |
| Fully-populated DTO entities (CSV row, pickup, profile, order) | existing seeders | Needed to detect AutoMapper-removal field loss by omission |
| Coupons (valid / invalid / expired) | `@td(COUPON_*.code)` + `live-discover` for an active coupon | Never hardcode a code; assert `discountTotal`, single-slot last-wins |
| Storefront PDP paths | `{{FRONT_URL}}@td(ALIAS.url)` | Never compose `/product/<sku>` — it is an SPA soft-404 (HTTP 200) |
| Store settings for JSON-LD / OG | store settings via Admin or API | Drive present / absent / partial to exercise the config decision table |

No hardcoded IDs / SKUs / prices / emails / order numbers anywhere (`.claude/rules/test-data.md`).

---

## 9. Schedule and Milestones

| Date | Milestone | Owner |
|------|-----------|-------|
| 2026-08-24 | Plan drafted; sitemap refreshed (rev 7); fixture gates run (`td:validate`, `td:reconcile`) | orchestrator |
| 2026-08-24 | **Sprint close** — re-run `/qa-test-plan 26-16` to capture tickets reaching Done after this cut | orchestrator |
| 2026-08-25 | Two-store wishlist + fractional-promotion + malformed-favicon fixtures seeded; cases authored for the Critical domains | test-data-engineer, test-management-specialist |
| 2026-08-25 – 08-26 | Critical domains executed (Sales Rep Hub, Pricing, Catalog browse, Background jobs, Lists/Wishlist) + cross-browser pass | qa-frontend-expert, qa-backend-expert, qa-testing-expert |
| 2026-08-27 | High domains (White Labeling, Auth API, Cart a11y, Catalog/Inventory Admin, chunk-load recovery, Skyflow) | qa-backend-expert, ui-ux-expert |
| 2026-08-28 | Medium/Low domains (Customer Reviews, SEO, UCP telemetry); `/qa-triage-results latest --fix` on the run's FAILs | qa-lead-orchestrator |
| 2026-08-31 | Case promotion (`Draft → Automated`/`Reviewed`), Feature Release Gate per domain, GO/NO-GO recommendation | qa-lead-orchestrator (human ratifies) |

---

## 10. Resources — QA Agent Assignments

| Domain | Agent | Browser lane |
|--------|-------|--------------|
| Sales Rep Hub — storefront dashboard, profile, i18n | `qa-frontend-expert` | `playwright-chrome` |
| Sales Rep — scoped xAPI + statistics contract | `qa-backend-expert` | API-only |
| Pricing & `discountPercent` (PDP/PLP/cart + xAPI) | `qa-backend-expert` + `qa-frontend-expert` | edge / chrome (sequential) |
| Catalog browse & variations resolver | `qa-backend-expert` (+ `/qa-perf-measure`) | `playwright-edge` / API-only |
| Background-jobs migration (6 modules) | `qa-backend-expert` | Chrome DevTools MCP (Admin SPA) |
| Lists / Wishlist sharing | `qa-frontend-expert` + `qa-backend-expert` | chrome / edge (sequential) |
| White Labeling | `qa-frontend-expert` | `playwright-chrome` |
| Platform Security / Auth API | `qa-backend-expert` | API-only |
| Cart coupons sidebar — a11y + regression | `ui-ux-expert` (a11y) + `qa-frontend-expert` (functional) | Chrome DevTools MCP / chrome |
| Catalog / Inventory Admin | `qa-backend-expert` | Chrome DevTools MCP |
| Storefront resilience (chunk loads) | `qa-frontend-expert` | Chrome DevTools MCP (network blocking) |
| Payment — Skyflow | `qa-frontend-expert` | `playwright-chrome` |
| Customer Reviews (PDP) | `ui-ux-expert` | Chrome DevTools MCP |
| SEO / structured data | `qa-frontend-expert` | `playwright-chrome` |
| UCP / OpenTelemetry | `qa-backend-expert` | none (App Insights) |
| Cross-browser confirmation on Critical domains | `qa-testing-expert` | queue for a **chrome/edge** slot |
| Fixtures (seed + reconcile) | `test-data-engineer` | none (Node + Platform API) |
| Case authoring / review / promotion | `test-management-specialist` | `playwright-chrome` (sequential) |

**Max 3 concurrent browser agents.** `playwright-firefox` **cannot click** on this storefront or the Admin SPA (confirmed 6×) — queue for a chrome/edge slot rather than placing a click-driven suite there.

---

## 11. JIRA Ticket Coverage Matrix

| Ticket | Type | Existing suites | New cases | Owner |
|--------|------|-----------------|:---------:|-------|
| VCST-5691 | Story | 054, 050a | 6 | qa-backend-expert |
| VCST-5546 | Story | 056 | 5 | qa-backend-expert |
| VCST-5335 | Story | 007, 050h, 050l | 6 | qa-frontend-expert + qa-backend-expert |
| VCST-5724 | Story | 007 | 3 | qa-frontend-expert |
| VCST-5536 | Story | 048d, 050e | 4 | qa-frontend-expert |
| VCST-5537 | Story | 048d | 2 | qa-frontend-expert |
| VCST-5487 | Story | 088, 086, 087 | 5 | ui-ux-expert |
| VCST-5544 | Story | 094 | 3 | qa-backend-expert |
| VCST-5745 | Story | 064 | 2 | qa-backend-expert |
| VCST-5644 | Story | — | 0 | — (no QA surface) |
| VCST-5575 | Bug | 067, 070, 071, 050e | 3 | qa-frontend-expert |
| VCST-5705 | Bug | 050h, 001, 002 | 4 | qa-backend-expert |
| VCST-5533 | Bug | 028, 045, 077b | 5 | ui-ux-expert + qa-frontend-expert |
| VCST-5592 | Bug | 093, 091, 050m | 3 | qa-frontend-expert |
| VCST-5623 | Bug | 049 | 2 | qa-backend-expert |
| VCST-5656 | Bug | 049, 051, 056 | 3 | qa-backend-expert |
| VCST-5647 | Bug | 093, 050m | 2 | qa-frontend-expert |
| VCST-5682 | Bug | 093, 091 | 2 | qa-frontend-expert |
| VCST-5683 | Bug | 089 | 1 | qa-frontend-expert |
| VCST-5684 | Bug | 093 | 1 | qa-frontend-expert |
| VCST-5490 | Task | 095 | 6 | qa-backend-expert |
| VCST-5659 / 5660 | Task | 064, 050k, 050d, 050c | 4 | qa-backend-expert |
| VCST-5654 | TechDebt | — (GAP-03) | 3 | qa-frontend-expert |
| VCST-5689 | Task | 050a, 001 | 3 | qa-backend-expert |
| VCST-5587 / 5588 / 5590 | Task | 091, 093, 050m | 6 | qa-frontend-expert + qa-backend-expert |
| VCST-5720 | Task | 040a (GAP-04) | 2 | qa-backend-expert |
| VCST-5716 | Review task | 050g | 1 | qa-backend-expert |
| VCST-5736 | Review task | — (GAP-06) | 2 | qa-backend-expert |
| VCST-5739 | Review task | — (GAP-07) | 1 | qa-backend-expert |
| VCST-5220 | Task | 021 | 2 | qa-backend-expert |
| VCST-5619 | Task | — | 0 | — (vc-shell, separate product) |

---

## 12. Cross-Layer Verification Checklist (P0/P1 E2E Cases)

Tickets whose correctness cannot be proven from a single layer — each needs a storefront **and** a backend observation in the same run:

- [ ] **VCST-5691** — configure a 12.5% promotion in Admin → assert `discountPercent` in the xAPI response → assert the same percentage renders on PDP, PLP and the cart line.
- [ ] **VCST-5705** — same customer, wishlists in two stores → xAPI `FindWishlistsByProducts` returns only the current store's → the "in wishlist" marker on the catalog grid and PDP matches.
- [ ] **VCST-5335** — Rep shares a list (sales-rep module) → push message delivered (`050l`) → customer's storefront Lists shows the "recommended by Rep" flag → customer edits it and adds an item to cart.
- [ ] **VCST-5575** — set an extension-less favicon URL via API → `whiteLabelingSettings` returns a usable payload → `pageContext` resolves → the storefront **mounts** (not a blank page) for that org.
- [ ] **VCST-5656** — create a product with an inventory row → DELETE via REST returns 200 → `ProductChangedEvent` published → re-query inventory and assert **no orphan row** → product absent from the Admin catalog grid.
- [ ] **VCST-5490** — trigger catalog reindex, price-list import, order processing and sitemap generation → each completes with a non-zero result in the Admin SPA → the storefront reflects the outcome (new products searchable, prices live, sitemap served).
- [ ] **VCST-5689** — PLP with several variation-bearing masters → variation set identical to the pre-batch baseline → App Insights dependency count drops against a paired negative control.
- [ ] **VCST-5592 / 5587 / 5588 / 5590** — Sales Rep hub widget values agree with the order/cart lists on the same page under the declared status definitions, in the user's local timezone.
- [ ] **VCST-5720** — Skyflow schema reachable on its own endpoint → the cart-page card form renders → a payment completes end-to-end.
- [ ] **VCST-5536** — store setting toggled in Admin → initialization query returns it → homepage emits **parseable** JSON-LD + Open Graph tags.

---

## 13. References

**Merged PRs in window (2026-08-10 – 2026-08-24)**
- `vc-frontend` (19): #2409, #2414, #2415, #2416, #2417, #2419, #2421, #2423, #2428, #2429, #2430, #2431, #2432, #2433, #2434, #2435, #2437, #2438, #2443
- `vc-platform` (4): #3100, #3101, #3103, #3104
- Modules (33 across 20 repos): `cart` #192/#193 · `catalog` #903 · `catalog-csv-export-import` #142/#145 · `inventory` #163/#164 · `opentelemetry` #2 · `order` #503 · `pricing` #237 · `profile-experience-api` #144 · `sales-rep` #6/#8/#9/#10/#11 · `sitemaps` #92 · `skyflow` #25 · `store` #174/#175/#176 · `subscription` #119 · `ucp` #6 · `white-labeling` #26 · `x-api` #80/#81/#82 · `x-cart` #136/#137 · `x-catalog` #108/#109 · `x-order` #49 · `x-pickup` #10
- `vc-shell` (26): separate product — not mapped to suites (§2.4)

**Knowledge & config**
- Suite manifest: `config/test-suites.json` (123 suites — every id in §5.1 verified present, CSVs confirmed on disk)
- Oracles: `.claude/knowledge/oracles/business-logic.md`, `.claude/knowledge/oracles/e-commerce-edge-cases-library.md`
- Module → suite mapping: `.claude/knowledge/execution/module-suite-map.md`
- Storefront sitemap: `.claude/knowledge/domain/sitemap.md` (**rev 7**, refreshed 2026-08-24 by Step 0 of this run)
- Test data policy: `.claude/rules/test-data.md` · Agents & browser lanes: `.claude/rules/agents.md` · Reports policy: `.claude/rules/reports.md`
- Techniques: `.claude/skills/qa-test-design/test-design-techniques.md` · Risk matrix: `.claude/skills/qa-risk/risk-prioritization-framework.md`

**Prior plan:** `vc/shared/docs/Sprint plans/sprint-26-15-test-plan.md`
