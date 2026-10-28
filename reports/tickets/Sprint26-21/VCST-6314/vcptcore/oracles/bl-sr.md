# BL invariants — extract (32 of 232)

> Verbatim slice of the oracle rendered from `.claude\knowledge\oracles\bl/*.yaml`, produced by `npm run bl:extract -- --domain sr`.
> **This is a SUBSET.** Invariants outside the filter are not shown and are not absent — if the
> task turns out to touch another domain, extract that domain too rather than concluding no rule
> applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.

**Included:** BL-SR-001, BL-SR-002, BL-SR-003, BL-SR-004, BL-SR-005, BL-SR-006, BL-SR-007, BL-SR-008, BL-SR-009, BL-SR-010, BL-SR-011, BL-SR-012, BL-SR-013, BL-SR-014, BL-SR-015, BL-SR-016, BL-SR-017, BL-SR-018, BL-SR-019, BL-SR-020, BL-SR-021, BL-SR-022, BL-SR-023, BL-SR-024, BL-SR-025, BL-SR-026, BL-SR-027, BL-SR-028, BL-SR-029, BL-SR-030, BL-SR-031, BL-SR-032

---

### BL-SR-001: Statistics periods are inclusive UTC instants, no server truncation; omitted bounds → all-time `[P1-data]`
- **Rule:** `salesRepCustomerOrderStatistics` / `salesRepCustomerCartStatistics` accept any number of aliased `period(from, to)` and `comparison(current, previous)` blocks. Both bounds are **inclusive UTC instants** — the caller sends the time component and any local→UTC conversion; the server does **no** date truncation. A `period` with no bounds → all-time (`firstOrderDate` = "customer since"). A per-request loader coalesces identical ranges so a range used by both a period and a comparison is aggregated once.
- **Verify:** Same range requested as an aliased `period` and inside a `comparison` → identical aggregate, one DB pass; a bounded `period` vs a no-bound `period` on the same customer → all-time count ≥ bounded count.
- **Violation signal:** Server re-truncates the caller's bounds to date boundaries; identical ranges aggregated more than once; omitted bounds error instead of all-time.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCustomerOrderStatistics.md (published) — example uses aliased period/comparison blocks and a bound-less period returning firstOrderDate as 'customer since'
- **Source:** module README §Order statistics ("both `period` bounds are inclusive and compared as UTC instants… there is no server-side date truncation"); live probe 2026-07-23.
- **Trust:** INFERRED

### BL-SR-002: Statistics are creator + membership scoped — no cross-rep / unserved-org leak `[P0-security]`
- **Rule:** **Two halves, and they have different scopes.** **(a) Membership scope — UNIVERSAL.** Every sales-rep surface is confined to the **organizations the rep serves**: a rep never sees another rep's data, an organization the rep does not serve yields no data (null / zero / empty) rather than a leak, and anonymous callers get an authorization error. **(b) Creator scope — the STATISTICS AND RANKINGS family ONLY.** `salesRepOrders`, the three statistics queries (`salesRepCustomerOrderStatistics` / `salesRepCustomerCartStatistics` / `salesRepCustomerCounts`), `salesRepTopSellers`, and the order-derived `salesRepCustomers` orderings additionally count **only the carts/orders the calling rep created**. **Half (b) does NOT extend to the index-backed "every order of a served customer" surface** (`salesRepCustomerOrders` / `salesRepCustomerOrder`), which is **deliberately creator-AGNOSTIC**: a rep sees orders placed by buyers and by colleagues within the orgs they serve. That is the surface working as designed, not a violation of this rule — judging that family against half (b) manufactures a false FAIL.
- **Verify:** *Half (a):* `salesRepCustomer`/`salesRepCustomerOrderStatistics` for an unserved org resolves null/empty (mirrors 050m SR-GQL-016/023); a per-org **locked** membership excludes that org while unlocked orgs still resolve; anonymous → auth error. *Half (b) — the CONTRAST is the test, and it is literal-free:* on ONE rep token in ONE window, `salesRepOrders` returns strictly fewer orders than `salesRepCustomerOrders`, and `salesRepCustomerOrders` returns **more than one distinct `customerId`** (a creator-scoped surface returns exactly one). Rep A's **statistics** still exclude rep B's orders in a shared org.
- **Violation signal:** *Half (a)* — any surface returns data from an org the rep does not serve, or anonymous access returns data. *Half (b)* — a **statistics or ranking** figure includes orders/carts the rep did not create. **NOT a violation:** `salesRepCustomerOrders` / `salesRepCustomerOrder` returning an order the rep did not place — that is the surface's purpose.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** PlatformUserGuide → Sales Rep → Overview (Key features): *"List and filter orders: Show the orders a rep created for their customers"* — supports the creator-scope half for the rep's own order list (`salesRepOrders`). The guide is silent on the statistics/rankings creator-scope and never mentions `salesRepCustomerOrders`/`salesRepCustomerOrder` at all — that carve-out remains an undocumented implementation detail (bl-audit-criteria §1a class 1). No page states the membership-scope half (a) explicitly either; it is inferred from the per-organization assignment model the same guide describes.
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/overview.md (published) — POST /graphql/sales-rep requires a bearer token and is scoped to the store and membership of the caller
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepOrders.md (published) — returns the orders the sales representative created for their customers
- **Source:** module README @`dev` — *"All statistics and rankings obey the same data-isolation rule … they count only the data the calling rep created (their own orders/carts), within the organizations they serve"* (L459), and *"Every statistics query is scoped two ways — to the organizations the rep serves (membership) and to the data the rep created"* (L489). The README does **not** mention `salesRepCustomerOrders` at all. Source: `SalesRepOrdersQueryHandler.BuildSearchCriteria` sets BOTH `criteria.OrganizationIds` and `criteria.CustomerId = request.UserId` (blob `8f7253d0`), whereas the customer-orders handler applies organization scope only. Live probe 2026-07-23; re-probed 2026-09-04.
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] B2C-LIST-052, B2C-LIST-053, B2C-LIST-054, B2C-LIST-057, B2C-LIST-070, B2C-LIST-071, B2C-LIST-074, B2C-LIST-078, WISH-039, WISH-041, WISH-043, WISH-049 failed in REG-2026-10-05-1613

### BL-SR-003: Comparison returns the delta; `*ChangePercent` is NULL when the previous baseline is 0 `[P1-data]`
- **Rule:** `comparison(current, previous)` always returns the absolute change (`totalChange`, `countChange`, `averageChange` as Money/scalar) plus a `*ChangePercent`. When the **previous** period baseline is 0, the percent is **null** (no divide-by-zero, no Infinity) while the absolute change is still the full current value.
- **Verify:** Customer with orders only in the current period, none in the previous → `totalChange.amount` = current total, `totalChangePercent` = null, `countChangePercent` = null. (Live-confirmed 2026-07-23: `totalChange.amount=816`, `totalChangePercent=null`.)
- **Violation signal:** Percent renders as `Infinity`/`NaN`/`0` or errors when previous = 0; absolute change dropped when percent is null.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCustomerOrderStatistics.md (published) — comparison(current, previous) returns totalChange, totalChangePercent, countChange, countChangePercent
- **Source:** module README §Order statistics comparison; live probe 2026-07-23.
- **Trust:** INFERRED

### BL-SR-004: Money resolves to one currency (`currencyCode` → store default → platform primary) and echoes it `[P1-data]`
- **Rule:** All monetary statistics are converted to a single currency chosen by `currencyCode`, falling back to the store default then the platform primary; the resolved `currencyCode` is echoed back and `formattedAmount` is localized by `cultureName`. Mixed-currency underlying orders are aggregated into that one currency.
- **Verify:** Pass `currencyCode:"EUR"` → response `currencyCode:"EUR"`, `formattedAmount` uses the € symbol; omit → store default. (Live-confirmed 2026-07-23: EUR echoed, `€816.00`.) Assert the echoed code + symbol, **not** a specific converted amount (FX rate is env-dependent — vcst-qa EUR ≈ 1.0).
- **Violation signal:** `currencyCode` not echoed; `formattedAmount` unlocalized; per-currency figures returned unconverted / double-counted.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCustomerOrderStatistics.md (published) — currencyCode argument is the reporting currency; response example echoes currencyCode with localized formattedAmount
- **Source:** module README (Money "converted to `currencyCode` → store default → platform primary"); live probe 2026-07-23.
- **Trust:** INFERRED

### BL-SR-005: Statistics scope excludes flag-cancelled / prototype orders unconditionally `[P1-data]`
- **Rule:** The statistics scope (`salesRepCustomerOrderStatistics` / `salesRepCustomerCartStatistics`) excludes orders and carts flagged prototype or cancelled **at the entity level** (`IsPrototype` / `IsCancelled`) — unconditionally, and this does NOT loosen under any named filter. This differs from the order-*list* scope, which deliberately includes cancelled orders so that `Cancelled` is a real list filter (BL-SR-009). An order whose `Status` field merely reads a cancelled-like value **without** the `IsCancelled` flag (e.g. written directly by an external/ERP integration bypassing the platform cancel workflow) is NOT excluded by this scope and correctly counts toward every statistics figure, including the baseline/all-status one.
- **Verify:** A customer with a genuinely cancelled order (`IsCancelled=true`) → every statistics figure excludes it under any filter, including `filter:"Cancelled"`. A customer with a `Status`-only cancelled-looking order (`IsCancelled=false`) → the baseline/all-status figure INCLUDES it.
- **Violation signal:** Flag-cancelled/prototype orders inflate the baseline totals/counts; OR a flag-less, status-only cancelled-looking order is wrongly excluded from the baseline (scope matching on the `Status` string instead of the `IsCancelled`/`IsPrototype` flags).
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-module-sales-rep `RepOrderScopeQueryExtensions.ApplyRepScope` (default `includeCancelled=false` → filters `!IsPrototype && !IsCancelled`); `CustomerOrderStatisticsService.BuildQuery` calls it with no `includeCancelled` argument, so the exclusion is unconditional regardless of any status filter. Contrast `SalesRepOrderStatusService.BuildQuery`, which passes `includeCancelled: true` for the list scope (BL-SR-009).
- **Trust:** INFERRED

### BL-SR-006: Cart statistics are currency-scoped; item quantity is the shipped primary metric `[P1-data]`
- **Rule:** `salesRepCustomerCartStatistics` uses a cart-*kind* filter whose built-in default `"active-carts"` = non-empty carts that are **not** wishlists. `count` / `total` / `average` remain schema fields, but the shipped Active-carts widget surfaces **summed line-item quantity** (selected vs not-selected-for-checkout) as its primary figures, with `count` demoted to an internal denominator for `average`. Cart statistics are scoped to **exactly the requested `currencyCode`** — a customer's carts in other currencies are excluded outright, never folded or converted (unlike order-statistics Money, BL-SR-004). Gift line items are included in the item-quantity figures but excluded from the money total/count and from the storefront's own cart-page counter — a known, currently-unresolved inconsistency. Same `period`/`comparison` shape as order statistics; same creator+membership scope (BL-SR-002).
- **Verify:** Rep with active carts across served orgs → the `active-carts` period returns selected/unselected item quantities. A customer's carts in a currency other than the requested `currencyCode` contribute nothing to the figures (not converted, not merged).
- **Violation signal:** Wishlists or empty carts counted as active; carts in another currency folded into the requested-currency figures; another rep's carts included.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCartFilterRules.md (published) — cart statistics filter rule 'active-carts' discovered with a localizedName
- **Source:** vc-module-sales-rep `CustomerCartStatisticsService.BuildQuery` — `query.Where(x.Currency == currencyCode)` ("One cart per currency, mirrored on a switch, so folding every currency would report one cart as many"); `AddCartFiguresAsync` excludes `IsGift` from total/count while `AddItemQuantitiesAsync` does not.
- **Source:** VCST-5588 (Done) — agreed redesign: Active carts shows summed quantities of lines selected / not selected for checkout; wishlist and saved-for-later excluded
- **Source:** VCST-5588 (Done) — QA reopen found carts of other currencies summed; fix filters Active cart data by currency; gifts stated to count as cart items
- **Source:** VCST-5648 (Cancelled) — dev confirms non-empty guard applies to dated windows as well; empty carts never counted as active
- **Trust:** DECLARED

### BL-SR-007: Customer counts — `assignedCustomers` is a period-independent scalar; period counts never exceed it `[P1-data]`
- **Rule:** `salesRepCustomerCounts` exposes `assignedCustomers` (a scalar total of served orgs, period-independent) plus `period{orderingCustomers, newCustomers}` and `comparison{orderingCustomersChange, orderingCustomersChangePercent, newCustomersChange}`. `orderingCustomers` and `newCustomers` for any period are ≤ `assignedCustomers`.
- **Verify:** Rep serving 5 orgs → `assignedCustomers=5`; a month's `orderingCustomers`/`newCustomers` ≤ 5. (Live-confirmed 2026-07-23: 5 / 4 / 5.)
- **Violation signal:** A period count exceeds `assignedCustomers`; `assignedCustomers` varies with the period arg.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCustomerCounts.md (published) — returns how many customers the rep is assigned plus ordering/new customers over requested date ranges, scoped to the rep
- **Source:** module README §My customers; live probe 2026-07-23.
- **Trust:** DECLARED

### BL-SR-008: Top sellers ranked by named sort over a period; `take` clamps at 10 (never errors); rows are a line-item snapshot `[P1-data]`
- **Rule:** `salesRepTopSellers` ranks products by `sort` (`by-units` default, `by-revenue`) over an optional `period`, returning the top `take` (default 5, **max 10**). `take` above 10 is **clamped** (never a validation error). Each row's `name`/`sku`/`imageUrl`/category come from the **order line-item snapshot** — no live catalog read; `revenue` is Money. Optional category `filter` restricts to that category's subtree. Creator+membership scoped (BL-SR-002); omit `organizationId` for the cross-customer dashboard.
- **Verify:** `take:5` → ≤5 rows; `take:15` → ≤10 rows, no error (live-confirmed 2026-07-23: clamped); `by-units` vs `by-revenue` re-rank; category filter narrows the set; row identity from snapshot even if the catalog product changed.
- **Violation signal:** `take>10` errors or returns >10; ranking reads live catalog; category filter ignored; another rep's line items ranked.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepTopSellers.md (published) — ranks best sellers by units (default) or revenue over a period; omit organizationId for cross-customer; filter restricts to category subtree
- **Source:** module README §Top sellers; live probe 2026-07-23.
- **Trust:** DECLARED

### BL-SR-009: One named filter rule per axis; omit → baseline; unknown name fails CLOSED (no data, no error) `[P1-data]`
- **Rule:** Lists and statistics blocks are filtered by a single **named filter rule** (not raw statuses), discovered per axis via `salesRepOrderFilterRules` / `salesRepCartFilterRules` / `salesRepCustomerFilterRules` / `salesRepTopSellerFilterRules` (`{name, localizedName}`). Omit `filter` → baseline; an **unrecognized name fails CLOSED** (returns zero data, never "return everything"), no error. Rule sets are overridable per project; a rule may be composite. `salesRepCustomerFilterRules` ships a single `All` baseline; `salesRepTopSellerFilterRules` names are category ids. **This invariant governs exactly those four axes and does not extend to the index-backed "every order of a served customer" surface** (`salesRepCustomerOrders`): its `filter` argument is a raw search-phrase / field:value expression in the order-search index's own grammar, not a named-rule lookup — it ships no filter-rule discovery query, and it correctly **narrows** on a raw field:value term rather than failing closed on it. That is the surface working as designed, not a violation of this rule.
- **Verify:** `filter:"BOGUS"` on `salesRepOrders` → `totalCount:0` while baseline (no filter) > 0 (live-confirmed 2026-07-23: 0 vs 8); discovery returns localized names. **Contrast:** the identical raw field:value term *narrows* `salesRepCustomerOrders` instead of failing closed, and no filter-rule discovery query exists for that surface (querying one is a schema error) — both are correct under this Rule's stated scope. Re-confirmed by paired probes in one window on the same token.
- **Violation signal:** Unknown filter returns the full/baseline set (fails open); a raw status/type accepted instead of a rule name; discovery returns raw enum keys — **on one of the four named axes.** NOT a violation of this rule: a raw field:value filter narrowing `salesRepCustomerOrders`, or the absence of a filter-rule discovery query on that surface.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepOrderFilterRules.md (published) — named filters for orders list and order statistics, each with name and localizedName
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepCustomerFilterRules.md (published) — customer filter rules ship a single 'all' rule
- **Source:** module README §Filter rules + its new §Customer orders ("Unlike the rule-based lists above, these two follow **X-Order's** shape: `filter` is a search phrase, `facet` names index fields, and `sort` takes index field expressions. They read the order **index**, not the database"); `SalesRepOrdersQueryHandler.Handle` resolves via `_filterRuleResolver.ApplyListFilterAsync(...)`, whereas `SalesRepCustomerOrdersQueryHandler.BuildSearchCriteria` assigns `criteria.Keyword = request.Filter` with no rule-resolver call and no discovery-query type in existence for it; live probe 2026-07-23; re-triangulated 2026-09-03.
- **Trust:** INFERRED

### BL-SR-010: One named sort rule per axis; unknown name → default ordering; unsupported direction → ERROR; `customerSalesReps` exempt `[P1-data]`
- **Rule:** Lists are ordered by a single **named sort rule** discovered via `salesRepOrderSortRules` (`recent` default, `total`) / `salesRepCustomerSortRules` (`my-last-orders` default, `ytd-purchases`, `name`) / `salesRepTopSellerSortRules` (`by-units` default, `by-revenue`). A sort **never fails closed on the name** — an unknown/omitted rule name falls back to the domain default (no error). An optional `:asc`/`:desc` direction suffix reverses a rule **where meaningful** (`total:asc`, `name:desc`, `ytd-purchases:asc`); an **unsupported direction is rejected with an error** (`recent:asc`, `by-units:asc` → `extensions.code=ARGUMENT`). `customerSalesReps` accepts a plain member `sort` (e.g. `name:asc`) but is **exempt from the named rep sort-rule vocabulary** (no discovery query). The customers-list direction applies uniformly to member-column and order-derived (`my-last-orders`/`ytd-purchases`) rankings. **This invariant governs exactly those three axes (plus the stated `customerSalesReps` exemption) and does not extend to the index-backed "every order of a served customer" surface** (`salesRepCustomerOrders`): its `sort` takes a raw X-Order **field expression** (`<indexField>:asc|desc`), ships no sort-rule discovery query, performs **no direction validation** — an unsupported direction is accepted silently rather than rejected — and an unrecognized token does **NOT** fall back to the domain default but yields a third, undefined ordering. All of that is that surface working as designed, not a violation of this rule.
- **Verify:** Unknown sort name → default order, no error (live 2026-07-23: `totalCount` unchanged); `recent:asc`/`by-units:asc` → error `code=ARGUMENT`; `total:asc`/`name:desc`/`ytd-purchases:asc` → 200, reversed order; `customerSalesReps(sort:"name:asc")` → 200 (accepts plain sort). **Contrast, paired controls in one window:** a raw index-field expression *reorders* `salesRepCustomerOrders` while the same expression is *ignored* by `salesRepOrders` (which resolves names only); a legacy rule name sent to `salesRepCustomerOrders` produces neither that rule's ordering nor the default; and an unsupported direction that returns `code=ARGUMENT` on `salesRepOrders` returns 200 unchanged on `salesRepCustomerOrders`. No sort-rule discovery query exists for that surface.
- **Violation signal:** Unknown sort name errors or fails closed; an unsupported direction silently ignored; `customerSalesReps` rejects a plain `sort` arg, or honors a named rep sort-rule token — **on one of the three named axes.** NOT a violation of this rule: `salesRepCustomerOrders` silently accepting an unsupported direction, honouring a raw index-field expression, not falling back to the default on an unknown token, or having no sort-rule discovery query. Read unscoped, the "unsupported direction silently ignored" clause condemns that surface's correct behaviour verbatim.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepTopSellerSortRules.md (published) — ranking options by-units and by-revenue discovered with localizedName
- **Source:** module README §Sort rules, which scopes itself in its own opening words — "The **orders, customers and top-sellers** lists are ordered by a single, optional named sort rule" — plus its §Customer orders ("Unlike the rule-based lists above, these two follow **X-Order's** shape … `sort` takes index field expressions"); `SalesRepOrdersQueryHandler` resolves via `_sortRuleResolver.ApplySortAsync(...)`, whereas `SalesRepCustomerOrdersQueryHandler.BuildSearchCriteria` assigns `criteria.Sort = request.Sort.EmptyToNull() ?? DefaultSort` with no resolver call and no discovery-query type in existence for it; live probe 2026-07-23; re-triangulated 2026-09-03.
- **Trust:** INFERRED

### BL-SR-011: Sales-rep storefront UI requires permission + module enabled; org membership is gated per-route, not uniformly `[P0-security]`
- **Rule:** The storefront Sales Rep area is gated on `sales-rep:access` AND the store's `SalesRep.Enabled` setting — both required for any Sales Rep surface to appear: a non-rep buyer is gated/redirected and no `salesRep*` widget or query fires, and with the module disabled the "Sales Rep hub" rail section and routes are absent even for a permissioned rep. **Org membership is NOT a uniform third requirement:** the **rep-facing** hub pages (`/company/dashboard`, `/company/my-customers`, `/company/my-customers/{orgId}`) are reachable regardless of the rep's own organization membership — a rep's customers are the organizations they *serve*, independent of any org the rep belongs to (fix `VCST-5494`, vc-frontend PR #2391, clears the inherited `meta.requiresOrganization` on the three rep-facing routes). Only the **buyer-facing** `/company/sales-reps` contact page still requires org membership.
- **Verify:** Rep with `sales-rep:access` + module enabled → hub/my-customers/customer-profile render, including the empty "No customers found" state for a rep with **zero** org memberships; **any non-rep account lacking `sales-rep:access`** — a low-privilege buyer, **or a privileged non-rep** (e.g. an org maintainer holding org user-CRUD permissions and `platform:security:loginOnBehalf`, but not `sales-rep:access`) — is redirected, no `salesRep*` query issued; `SalesRep.Enabled=false` → hub/list/profile unreachable and rail section absent (mirrors 089 SR-FE-003). The buyer-facing `/company/sales-reps` page stays org-gated regardless.
- **Violation signal:** Any sales-rep widget/query for a non-rep; hub reachable while the module is disabled (client-side-only gate); OR a customer-less rep's rep-facing hub links render but **redirect to `/account/dashboard`** (visible-but-dead links — the pre-fix VCST-5494 behavior).
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/user-guide/docs/sales-rep/enabling-sales-rep.md (published) — Sales Rep app is enabled per store via the store's Sales rep module settings toggle
- **Docs:** platform/user-guide/docs/sales-rep/managing-sales-reps.md (published) — 'Sales representative' role provides access to the sales rep hub on the frontend
- **Source:** module README ("Toggle the storefront Sales Rep UI per store"); live verification 2026-07-23 (hub route `/company/dashboard`); vc-frontend PR #2391 `fix(VCST-5494)` (merged dev 2026-07-23) narrows the org-membership requirement to the buyer-facing route only.
- **Source:** VCST-5304 (Done) — when logged in as a Sales Rep (role), the account left rail gets a separate 'Sales Rep hub' widget
- **Source:** VCST-5494 (Done) — rep with no org membership was redirected from My customers; fixed so rep-facing hub pages are reachable
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-HD-100, SR-HD-102 failed in REG-2026-10-15-1548

### BL-SR-012: Filter-aware empty states distinguish "no data" from "nothing matched the filter/search" `[P2-ux]`
- **Rule:** The orders, top-sellers and my-customers views render **distinct** empty states for "the rep has no data at all" vs "the current filter/search matched nothing" — the latter must offer a way back (clear filter/search), not read as "you have no customers/orders".
- **Verify:** A narrowing filter/search with zero matches → "nothing matches" state (with reset affordance), distinct from the no-data-at-all state.
- **Violation signal:** A zero-match filter shows the generic "no data" state; no way to clear the filter; a spinner/blank instead of an empty state.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** vc-frontend PR #2395 ("Filter-aware empty states… distinguish 'nothing matches this filter/search' from 'no data'").
- **Trust:** INFERRED
- **Lifecycle:** SUSPECT — [case] SR-TK-023 failed in REG-2026-10-07-1421

### BL-SR-013: Rep-facing status / money / rule vocabulary localizes by `cultureName`; raw enum/key never surfaces `[P2-ux]`
- **Rule:** Filter/sort rule labels (`localizedName`), order statuses (`statusDisplayValue`), and `formattedAmount` localize by `cultureName`. The storefront renders the localized label, never a raw enum value or an i18n key.
- **Verify:** Discovery queries return `localizedName` distinct from `name`; a rule chip / status / money value renders a human label, not `New`-style raw keys or `sales-rep.*` i18n paths.
- **Violation signal:** A raw enum/status key or unresolved i18n key shown in the UI; `formattedAmount` not localized.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/SalesRep/queries/salesRepOrderFilterRules.md (published) — rule discovery takes cultureName and returns localizedName distinct from name
- **Source:** module README (`localizedName` on all rule discovery; `statusDisplayValue`); vc-frontend PR #2395 (13 locales).
- **Source:** VCST-5681 (Done) — Sales Rep account sidebar rendered raw i18n keys in a non-English locale; fixed to render localized labels
- **Trust:** DECLARED
- **Lifecycle:** SUSPECT — [case] SR-CO-032 failed in REG-2026-10-06-1457

### BL-SR-014: Embedded Sales Rep Admin app gates on customer-member + platform-security permissions, not on `sales-rep:access` `[P1-data]`
- **Rule:** The embedded Sales Rep Admin app (`api/sales-rep`) is gated by the **customer module's member permissions + platform security permissions**, NOT by `sales-rep:access` (which only defines a storefront rep) and NOT merely by the module being installed. The exact matrix (`[Authorize]` attributes; **multiple attributes = AND — all required**):
  - **Read** (`search`, `roles`, `dictionaries`, `GET {id}`) → **`customer:read`**.
  - **Create** → **`customer:create` AND `platform:security:create`**.
  - **Update** → **`customer:update` AND `platform:security:update`**.
  - **Delete** → **`customer:delete` AND `platform:security:delete`**.
  - **Account-only ops** (`{id}/block`, `{id}/unblock`, `{id}/password`) → **`platform:security:update` only** (NOT `customer:update`) — a distinct mutate class from entity CRUD.
  - An `isAdministrator` account bypasses all checks.
- **Verify:** a back-office Manager (`isAdministrator=false`) **without `customer:read`** gets the menu entry hidden and `POST /api/sales-rep/search` → 302 → AccessDenied; a Manager with **`customer:read` only** opens the app and lists reps (search → 200) but Add/Delete/Save are hidden and `POST`/`PUT /api/sales-rep` → **403**; block/unblock/reset-password succeed only with `platform:security:update` (independent of `customer:update`).
- **Violation signal:** a Manager lacking `customer:read` reaches the rep list; a `customer:read`-only Manager creates/edits/deletes a rep (UI action present or create/update API 2xx); or block/unblock/set-password succeeds without `platform:security:update`.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Docs:** platform/user-guide/docs/sales-rep/managing-sales-reps.md (published) — admins view, add, edit, block and delete sales reps; no permission requirements stated
- **Source:** `vc-module-sales-rep` `SalesRepController.cs` (`dev`, `api/sales-rep`) — per-endpoint `[Authorize]` map (`CustomerModule…Permissions.Read/Create/Update/Delete` + `Platform…Permissions.SecurityCreate/Update/Delete`); `useSalesRepPermissions/index.ts` (frontend UI gate — CRUD subset, no account-ops class); `ModuleConstants.cs` (`sales-rep:access` = rep definition only). VCST-5293.
- **Trust:** INFERRED

### BL-SR-015: Configurable layout is keyed by rep + surface + optional store; a never-saved key resolves null; per-user isolation `[P1-data]`
- **Rule:** `salesRepLayout` / `saveSalesRepLayout` address a document keyed on the calling user's id, the `scope` argument (a per-surface identifier, e.g. `"dashboard"` / `"customerProfile"`), and an optional `storeId` — three distinct `storeId` values (omitted, a nonexistent store, a real store) address three distinct documents. A (user, scope, storeId) combination that was never saved resolves `salesRepLayout` to `null`, never an error. A rep's saved layout is never visible to a different rep querying the same scope.
- **Verify:** Query `salesRepLayout` with a fresh `scope` → `null` (SR-GQL-099/103/116). Save under one `storeId`, query under a different `storeId`/omitted → `null`, not the saved doc (SR-GQL-104). Two different authenticated reps querying the same `scope` each resolve only their own document, never the other's (SR-GQL-102).
- **Violation signal:** A scope/storeId combination that was never saved returns anything but `null`; a rep's saved layout is visible to a different rep querying the same scope; `storeId` omitted and a real value resolve the same document.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `LayoutService.GetLayoutAsync`/`BuildNameParts` (keys the customer-preference lookup on `[PreferenceName, scope, storeId?]` under the resolved `userId`); `SalesRepLayoutQuery.Map` (`UserId = context.GetCurrentUserId()`).
- **Source:** VCST-5367 (Done) — story 'drag and drop and save layout' for hub and customer profile; layout saved in member dynamic properties
- **Trust:** INFERRED

### BL-SR-016: `saveSalesRepLayout` is a full-document replace, never a merge `[P1-data]`
- **Rule:** Saving a layout replaces the entire stored document for that key — every region and block the caller omits from the mutation is gone after the save, not merely left unchanged. There is no partial-update / patch semantics.
- **Verify:** Save a document containing two regions; save again with only one region → reload resolves only that region; the omitted region and its blocks are gone, not carried over from the prior save (SR-GQL-107).
- **Violation signal:** A region/block omitted from a save survives in the reloaded document (silent merge instead of replace).
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `SaveLayoutCommandHandler.Handle` (builds a brand-new `Layout` from only `request.SchemaVersion`/`request.Regions` — the prior stored value is never read or merged).
- **Trust:** INFERRED

### BL-SR-017: Persisted block order and `hidden` are independent, verbatim round-trip fields `[P2-ux]`
- **Rule:** Within a `SalesRepLayoutRegion.blocks[]`, array position is the only signal of render order and `hidden` is a flag independent of position — both are stored and returned exactly as sent, with no server-side reordering, deduplication, or reinterpretation.
- **Verify:** Save a region with blocks in a specific order and one block `hidden:true`; reload → same order, same hidden flags (SR-GQL-100/108/109/115).
- **Violation signal:** Reload returns blocks in a different order than saved; a `hidden:true` block reverts to `false` (or vice versa) without a save.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `LayoutBlock`/`LayoutRegion` (plain properties, no reordering logic); `LayoutService.SaveLayoutAsync`/`GetLayoutAsync` (verbatim JSON serialize/deserialize, no transform).
- **Trust:** INFERRED

### BL-SR-018: Save mutation echoes the persisted document, including a fresh UTC `modifiedDate` `[P2-ux]`
- **Rule:** `saveSalesRepLayout`'s response IS the just-persisted document — the same regions/blocks that were sent, plus a `modifiedDate` set to the save's UTC instant. A caller does not need to re-query `salesRepLayout` after a successful save to see the current state.
- **Verify:** Save a document; the mutation response's regions/blocks match what was sent and `modifiedDate` is a fresh UTC timestamp; an immediate follow-up `salesRepLayout` query returns an identical document (SR-GQL-106/115).
- **Violation signal:** The mutation response omits `modifiedDate` (or returns it null); the echoed document disagrees with what was sent; a follow-up query disagrees with the echo.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `LayoutService.SaveLayoutAsync` (sets `layout.ModifiedDate = DateTime.UtcNow` before persisting); `SaveLayoutCommandHandler.Handle` (returns the same `layout` instance it just saved).
- **Trust:** INFERRED

### BL-SR-019: `SalesRepLayoutSetting.value` (`AnyValue`) preserves its scalar JSON type across the round trip `[P2-ux]`
- **Rule:** A block setting's `value` keeps the scalar type it was sent as — string, number, or boolean — with no coercion. A date-shaped string is stored and returned as a string, never parsed into a date type.
- **Verify:** Save a setting `value` as a number, a boolean, and a date-formatted string; reload each → same JSON type as sent, same value (SR-GQL-111).
- **Violation signal:** A scalar value changes type across the round trip (e.g. a date-formatted string is returned reformatted/parsed, or a number is returned as a string).
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `LayoutService` `_serializerSettings` (`DateParseHandling.None`); `SalesRepLayoutSettingType` (`Value` typed `AnyValueGraphType`, a scalar passthrough).
- **Trust:** INFERRED

### BL-SR-020: `scope` and `region.id` are free-form strings, not enums; an unrecognized value fails silently to a different (empty) document `[P1-data]`
- **Rule:** Neither the layout surface identifier (`scope`) nor a region id is validated against a fixed vocabulary — both are plain `String` arguments. An unrecognized value never errors; it addresses a document that has never been saved (`null` on read; a new, independent document on write).
- **Verify:** Query/save with a `scope` (or `region.id`) value no known surface/region uses → HTTP 200; read resolves `null`; write creates a new, independent document, never the "real" surface's (SR-GQL-105/114).
- **Violation signal:** An unrecognized `scope`/region id errors instead of addressing an empty document, or is silently coerced to a known value.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `InputSalesRepLayoutType`/`SalesRepLayoutQuery` (`Scope`/region id typed `StringGraphType`, no enum/validator); `LayoutService.BuildNameParts` (raw string concatenation, no allow-list check).
- **Trust:** INFERRED

### BL-SR-021: Both layout operations require an authenticated caller `[P0-security]`
- **Rule:** `salesRepLayout` and `saveSalesRepLayout` both require a valid authenticated session. An anonymous caller never receives layout data or a successful save; the response is a structured authorization error, not a silently-empty success.
- **Verify:** Call both operations without an Authorization header → HTTP 200, the field's `data` is `null`, `errors[0].extensions.code` denotes an authorization failure; the same calls with a valid rep session succeed (SR-GQL-101/112).
- **Violation signal:** An anonymous caller receives usable data, or a 5xx instead of a structured `errors[]` entry.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `SalesRepLayoutQuery.Map` (`UserId = context.GetCurrentUserId()`); `LayoutService.GetLayoutAsync`/`SaveLayoutAsync` (`ArgumentException.ThrowIfNullOrEmpty(userId)`) — consistent with the domain's established anonymous-access contract (BL-SR-002).
- **Trust:** INFERRED

### BL-SR-022: Required layout-input fields are schema-enforced; a non-scalar setting `value` is rejected `[P1-data]`
- **Rule:** `scope`, `schemaVersion`, `block.hidden`, and `block.settings` are non-null on the input type — omitting any of them fails the mutation before it persists anything. `settings` may be an empty list but not absent. A setting `value` that is a list or object (rather than a scalar) is rejected, not silently coerced or dropped.
- **Verify:** Omit `scope`/`schemaVersion`/`hidden`/`settings` in turn → the mutation fails with a structured validation error before any persistence (SR-GQL-113); an empty `settings:[]` is accepted (SR-GQL-110); `settings[].value` sent as an array or object → rejected with a structured error (SR-GQL-117).
- **Violation signal:** A required field can be omitted and the mutation still succeeds; an array/object `value` is accepted or silently stringified.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `InputSalesRepLayoutType` (`Scope`/`SchemaVersion` non-null); mirrored output shape in `SalesRepLayoutBlockType`/`SalesRepLayoutSettingType` (`Hidden`/`Settings` non-null; `Value` a scalar `AnyValueGraphType`).
- **Trust:** INFERRED

### BL-SR-023: The customer-profile layout is scope-wide — one document per rep, not per customer `[P1-data]`
- **Rule:** The saved layout for the `customerProfile` surface has no per-customer dimension — `salesRepLayout`/`saveSalesRepLayout` take only `scope` and an optional `storeId`, never a customer/organization id. A rep's customer-profile arrangement is the same document regardless of which customer they are viewing.
- **Verify:** Save a `customerProfile` layout while viewing one served customer; open a different served customer's profile → the same arrangement renders, confirmed in **both directions** (a save while viewing customer A renders on customer B, and a save while viewing B renders on A); inspecting the `saveSalesRepLayout` mutation payload shows no organization/customer id field anywhere in the request (SR-CP-042; draft/edit-mode carry-over: SR-CP-043).
- **Violation signal:** A customer-profile layout differs per customer, or the schema/backend accepts a customer/organization argument for this query/mutation.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** `vc-module-sales-rep` `SalesRepLayoutQuery`/`SaveLayoutCommand` (only `Scope`/`StoreId`/`UserId` fields — no customer/organization id anywhere in the layout schema); live-confirmed bidirectionally on the storefront, with the mutation payload inspected and carrying no organization/customer id.
- **Trust:** INFERRED

### BL-SR-024: Configurable-layout changes persist only on explicit Save, are scoped to the rep's account, and survive reload and re-authentication `[P1-data]`
- **Rule:** No drag, hide, or reorder action is persisted on its own — each is a draft-only change until the rep explicitly saves, and one Save issues exactly one full-document replace (BL-SR-016), never more. The persisted arrangement is scoped to the rep's account rather than a device or browser session: reloading, signing out and back in, or opening an independent browser session all resolve the same saved arrangement. Cancel and Reset discard the in-progress draft without issuing any save.
- **Verify:** Perform a drag/hide/reorder without saving, then reload → the pre-change arrangement still renders; Save once → exactly one save call is issued; a reload and a fresh sign-in both then show the saved arrangement; Cancel and Reset both complete with zero save calls.
- **Violation signal:** An unsaved change survives a reload; a drag/hide/reorder issues a save call by itself; Cancel or Reset issues a save call; the arrangement differs after sign-out/sign-in.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module composable governing the edit draft (`save()` as the sole mutation call site; reorder/hide actions touch only the draft) — consistent with BL-SR-015 (account-scoped key) and BL-SR-016 (full-document replace). Live-confirmed: save→reload returned the arrangement exactly; a second save fully replaced the first save's state with no leftovers; Cancel and Reset each issued zero network requests; the arrangement survived a full sign-out/sign-in.
- **Source:** VCST-5367 (Done) — story 'drag and drop and save layout'; layout stored on the member, i.e. account-scoped
- **Trust:** INFERRED

### BL-SR-025: The block registry owns structure and region placement; the saved document owns only order and hidden, with unknown types dropped and missing blocks appended `[P1-data]`
- **Rule:** Which block types exist and which region each renders in is decided by the frontend's block registry alone — never by the saved document. The document contributes only per-block order and a hidden flag. On load: a persisted block type absent from the registry is dropped silently (no error, no placeholder, no orphan entry); a registered block type absent from the document is appended after the document's own blocks; a registered block whose document region disagrees with the registry's region for that type renders in the registry's region, not the document's. Every such deviation self-heals on the next save — the round-trip payload always matches the registry's current structure.
- **Verify:** Plant a document containing an unregistered block type → received by the client but rendered nowhere, no console error, no gap in the layout; plant a document omitting a registered type → it appears, appended after the document's survivors; plant a document placing a registered block in the wrong region → it renders in its registry region, not the document's; save afterward and reload → the unknown type is gone and every block sits in its registry region.
- **Violation signal:** An unregistered type renders as a blank slot, an error, or a stray entry; a block absent from the document stays missing rather than being appended; a block renders in the document's region rather than the registry's; a save fails to correct a planted deviation.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module load-path reconciliation logic (pure function reconciling persisted blocks against the registry). Live-confirmed: two unregistered block types received by the client rendered nowhere; two registered blocks missing from a planted document were appended after the document's survivors; blocks planted in the wrong region were re-homed to their registry region (leaving that region empty); a subsequent save purged the unknown types and reset every block to its registry region, and reload showed no oscillation.
- **Trust:** INFERRED

### BL-SR-026: A layout key that was never saved (`null`) is not a failure — registry defaults render with editing enabled `[P1-data]`
- **Rule:** `null` from the layout query (a never-saved key, BL-SR-015) is a normal, expected state, not an error condition — the surface renders the registry's default arrangement and leaves editing enabled, with no error alert.
- **Verify:** Load a layout-driven surface for a (user, scope, storeId) combination that was never saved → registry defaults render, Edit is enabled, no error/alert appears.
- **Violation signal:** A never-saved key disables Edit, shows an error/alert, or is otherwise treated the same as a genuine read failure.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module composable distinguishing a `null` result from a fetch failure. Live-confirmed: a never-saved rep's surface loaded registry defaults with Edit enabled and no alert.
- **Trust:** INFERRED

### BL-SR-027: The two widget columns are structurally separate drag groups — cross-column drag is impossible in either direction `[P2-ux]`
- **Rule:** The wide and rail widget columns are distinct drag-and-drop groups by construction; no widget can be dropped from one column into the other, regardless of runtime state.
- **Verify:** Attempt to drag a wide-column widget into the rail column, and a rail-column widget into the wide column → both attempts are no-ops; neither widget changes column.
- **Violation signal:** A widget crosses from one column to the other via drag.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module layout-surface component (per-column, distinct drag-group identifiers). Live-confirmed both directions as no-ops.
- **Trust:** INFERRED

### BL-SR-028: Stat cards park/restore by drag or keyboard; widgets hide via a dismiss control and restore only from a hidden-items tray `[P2-ux]`
- **Rule:** A stat card has no per-card dismiss control — it moves between visible and parked by dragging into/out of a parked zone, or by the equivalent keyboard gesture; a mouse-driven park drops at the drop position, a keyboard park appends to the end of the target zone. A widget hides via an explicit dismiss control and can be restored only by choosing it from a hidden-items tray — dragging a hidden widget back in is not a valid restore path. A parked/hidden item is absent from the rendered surface outside edit mode and appears in a distinct "hidden" grouping only in edit mode; the state persists across a reload.
- **Verify:** Confirm a stat card renders no dismiss control; drag a stat card into and out of the parked zone — both work, and the drop lands at the drop position, not appended; a widget's dismiss control hides it, and it can only be restored from the hidden-items tray; outside edit mode a parked/hidden item is absent from the page; in edit mode it appears under a "hidden" grouping; the parked/hidden state survives a reload.
- **Violation signal:** A stat card exposes a dismiss control; a hidden widget can be restored by dragging; a parked/hidden item remains rendered outside edit mode, or its state resets on reload.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module layout-region component (park-only toggle for stat cards) and hidden-items tray component (button-only widget restore). Live-confirmed: no dismiss control on a stat card; drag in/out of the parked zone both worked, landing at drop position (vs. keyboard append); widget dismiss→tray→restore confirmed; a parked card is absent from the page outside edit mode and appears under a "hidden" grouping in edit mode, including across a persisted hidden state.
- **Trust:** INFERRED

### BL-SR-029: Keyboard grab-and-move announces every transition via `aria-live`, with position for reorder and without position for park/restore; however a grab ended by a pointer interruption is a tracked violation `[P2-ux]`
- **Rule:** Grabbing a block for keyboard reordering, moving it, and dropping it all announce via `aria-live`, including position (e.g. "position N of M") for reorder moves and edge cases; park and restore append to the end of their target zone and announce without a position — this asymmetry is intentional. Ending a grab must always restore the pre-grab state and announce the cancellation, regardless of what ends it — an explicit keyboard cancel (Escape / blur / tab-out) or any other interaction that terminates the grab.
- **Verify:** Grab a block via keyboard, move with arrow keys → announcements include position; drive a block to an edge → the edge announcement is distinct; park then restore via keyboard → announcements omit position; end a grab via Escape → the pre-grab position is restored and the cancellation announced; end a grab via any other interaction (e.g. a pointer action on another block) → the pre-grab position must still be restored and the cancellation still announced.
- **Violation signal:** A reorder or edge announcement omits position; a park/restore announcement includes one; ending a grab by any means other than Escape/blur/tab commits the moved position without restoring it or announcing the cancellation.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module keyboard-sort composable (`moved`/`edge` signal payloads carry position; `parked`/`restored` carry only an id). Live-confirmed: eight verbatim announcement strings captured across grab/move/edge/park/restore/drop; Escape correctly restored on all three regions and a neutral-area click also restored correctly. The same live pass also found a **pointer press on another draggable block while a grab is live silently ends the grab without restoring the pre-grab position and without an announcement**, committing the in-progress move by accident — a confirmed violation of this Rule, tracked as a separate defect rather than reflected as intended behavior.
- **Trust:** INFERRED

### BL-SR-030: A save already in flight cannot be duplicated by a rapid repeat trigger `[P2-ux]`
- **Rule:** Triggering Save again while a save is already in flight never results in a second full-document-replace call reaching the backend — exactly one save request is issued per user-intended save, regardless of how a repeat trigger is delivered.
- **Verify:** Rapidly trigger Save twice in immediate succession → exactly one save mutation call is observed.
- **Violation signal:** Two save mutation calls are observed for a single rapid repeat trigger.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module composable's save guard (client-side only — the backend has no concurrency guard of its own; each save is an independent full replace, per BL-SR-016). Live-confirmed: a rapid double-trigger on the Save control produced exactly one save mutation call; the specific guard mechanism (composable guard vs. a disabled control swallowing the second click) could not be isolated from the UI alone, so this Rule is stated as the observable **outcome**, not the mechanism.
- **Trust:** INFERRED

### BL-SR-031: A hidden widget's data query does not fire; a hidden stat card's page-level statistics query still fires unchanged `[P2-ux]`
- **Rule:** A widget that is hidden and saved is not mounted at all, so none of its own data queries fire on load. Stat cards are different: every card's data comes from one shared page-level statistics query, so hiding a card does not shrink that query's scope or omit it — it still fires with the same request shape whether or not any card is hidden.
- **Verify:** Hide a widget and save, then reload → none of that widget's own data queries appear in the reload's network trace (checked against a positive control with the widget visible); hide a stat card and save, then reload → the page-level statistics query still fires with an unchanged request shape. A tray-only restore without a reload is served from cache and does not exercise this — the check must cross a reload.
- **Violation signal:** A hidden widget's query still fires; a hidden stat card causes the page-level statistics query to change scope, drop a parameter, or stop firing.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module layout-surface component (mounts a block's component only when currently visible) and the shared page-level statistics composable feeding every stat card regardless of hidden state. Live-confirmed: hiding and saving a widget dropped exactly that widget's own operations from the reload trace against a positive control; hiding and saving a stat card left the page-level statistics query firing with an unchanged request shape.
- **Trust:** INFERRED
- **Lifecycle:** SUSPECT — [code] vc-frontend@203908b:client-app/modules/sales-rep/composables/useStatDataNeeds.ts#useStatDataNeeds (:46-54) outside edit mode returns statDataNeeds(scope, current.visible), and layout/stat-data-needs.ts#orderStatisticsFlags turns those needs into @include flags on the statistics query, so hiding a stat card does shrink the query; this contradicts the clause 'hiding a card does not shrink that query's scope or omit it' (the queries are also held until the layout has settled). No human source decides it (the in-code comment cites VCST-5647, which only asks that unrendered fields not be requested), re-run the check

### BL-SR-032: The rail region mounts only while it holds at least one visible block, and unmounts structurally (not just visually) when empty `[P2-ux]`
- **Rule:** The narrow rail column is not rendered at all when it has no visible blocks — the main column then runs full width — and mounts as soon as at least one block becomes visible in it. This is a structural mount/unmount, not a visual collapse; the unmounted state persists across a reload.
- **Verify:** Hide every block in the rail and save, then reload → the rail element is absent from the page (not merely empty or zero-width), and the main column occupies the full width; restore one block to the rail → the rail element reappears.
- **Violation signal:** The rail region remains in the page (even empty/zero-height) when it holds no visible blocks; the main column does not expand to fill the freed width.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** module layout-surface component (mount of the rail region gated on the count of currently-visible rail blocks). Live-confirmed: with the rail's only blocks hidden and saved, the rail element was absent from the page after reload and the main column ran full width; restoring one block remounted the rail.
- **Trust:** INFERRED

---

