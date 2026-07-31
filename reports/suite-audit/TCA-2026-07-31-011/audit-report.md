# TCA-2026-07-31-011 — Dimension 11 staleness audit, suite 011 Checkout Flow

**Suite:** `regression/suites/Frontend/checkout/011-checkout-flow.csv` (71 cases, P0/revenue-critical)
**Picked by:** `npm run tc:audit:queue -- --pick` → `011 … 71 due … source=vc-frontend … 0 caveat(s)`
**Source axis resolved:** `tc:audit:source -- 011` → `Checkout → vc-frontend` (via module-suite-map)
**Applied to CSV:** **0 rows.** Every verdict is UNGROUNDED — the live axis was unavailable in this
runner, so no assertion can clear the §1 evidence bar. Per the §4 auto-fix matrix, UNGROUNDED writes
nothing. The CSV is byte-unchanged and both gates match their pre-run baseline.

## Axis coverage — including what was NOT covered (§6a)

| Axis | Status | Detail |
|---|---|---|
| **Docs** | Partial | VirtoOZ `StorefrontUserGuide` + `PlatformUserGuide`. The checkout *flow* is documented (`storefront/user-guide/shopping/checkout-process`). The address-popup *mechanics* (keyword search, country/state/city facets, column sort, pagination) are **not documented anywhere** — §1a class-1 "facet-render mechanics". That makes them `docs: N/A`-**eligible**, but N/A is NOT claimed as satisfying anything here: §1a requires Source **and** Live both present and agreeing, and Live is absent. |
| **Source** | Good, not complete | `vc-frontend @ a1e3cd1a` (2026-07-31) + `vc-module-profile-experience-api @ 2e4c6b00` (2026-07-27). Anchored: storefront component + composable + i18n + ui-kit table, and the xAPI query/builder/handler/service (args, paging, facets, authz). |
| **Live** | **ABSENT** | No Playwright MCP and no browser in this runner. **Zero `{OBSERVED}` results were produced.** No live claim appears anywhere in this report. |

**Deliberately not read** (so no finding below rests on it): `vc-module-customer` / platform indexing —
the producer of the city and region aggregations; `vc-module-cart` / `vc-module-orders` /
payment-processor modules, so the core-flow and totals cases (CHK-001…009, CHK-081…083, CHK-052/053/056/057)
have **no backend anchor** this run; the module Admin SPA blades. Because every verdict is already
UNGROUNDED on the missing live axis, this incomplete source coverage changes no verdict — but it means
the source axis is **not** claimed complete for those cases.

**Deploy lag is undetectable this run (§1e).** Source is anchored at *master HEAD*, not the deployed QA
artifact. Where source shows a fix that a case says is absent (P1, P8), that is reported as
source-vs-case-text only — it is *not* a claim about what is deployed.

## Verdict table

All 71 cases roll up to **UNGROUNDED** (decision table: "an applicable axis absent ⇒ UNGROUNDED").
Grouped, since the reason is identical and per-case rows would repeat one sentence 71 times.

| Cases | n | Docs | Source | Live | Verdict | Action |
|---|---|---|---|---|---|---|
| CHK-001…009 core flow (VCST-4499) | 9 | flow documented, `checkout-process` | storefront only; **no cart/order backend anchor** | ABSENT | UNGROUNDED | report only |
| CHK-026…030, 043/044/046, 050…057, 061…063, 074…078, 081…086 coverage-gap + validation + totals + min-order | 30 | mixed; min-order **not** documented | partial; see P6 | ABSENT | UNGROUNDED | report only |
| CHK-058/059/060 address selector | 3 | favorite-at-top documented (`company-info`) | anchored | ABSENT | UNGROUNDED | report only |
| CHK-087…115 address popup (VCST-4710 / PR #129) | 29 | N/A-eligible (§1a class 1), not claimed | well anchored | ABSENT | UNGROUNDED | report only |

**Verdicts:** CONFIRMED 0 | DRIFT 0 | MISSING 0 | CONTRADICTORY 0 | UNGROUNDED 71 | RETIRE 0
**Applied:** 0 rows | **Proposals:** 11 | **`docs: N/A` claimed:** 0/71

This is the expected shape of a no-live-axis run, not a failure: a lone axis never confirms, and two
agreeing axes are the minimum. Nothing was written, so nothing can be wrong in the CSV.

## Re-gate (§4 rule 7)

Unchanged from the pre-run baseline, because nothing was applied:

| Gate | Baseline | After | Verdict |
|---|---|---|---|
| `suites:review -- <csv> --fail-on=High` | 299 findings / 232 blocking / 0 Blocker / 39 Critical | identical, exit 0 | no new Blocker/Critical |
| `suites:lint` | OK (119 suites, 37 selections) + 2 pre-existing sales-rep WARNs | identical | unchanged |
| `git status --porcelain` | clean | clean | no CSV edit |

The 2 lint WARNs (duplicate id `092`, orphan `093`) are the pre-existing, already-documented sales-rep
defects — unrelated to this suite.

---

## Proposals — never auto-applied (§6)

Each clause below traces to a `file:line` or a doc quote. No clause rests on a live observation,
because there was none.

### P1 — CHK-094 and CHK-114/115 assert opposite behaviour; source says sort IS wired

CHK-094 ("Column Sort NOT Wired — Defect #1 Bug Verification", Critical) asserts sort is absent.
CHK-114/115 assert sort works ascending/descending. Both cite VCST-4992. They cannot both pass.

Source says sort is implemented and enabled for the checkout popup:
- `useCheckout.ts:356` — `sortableColumns: ["name"]`
- `select-address-modal.vue:378` — `sortable: props.sortableColumns.includes(col.id)`
- `select-address-modal.vue:78` — `@header-click="onSortChange"` → `:398-401` `emit("updateSort", info)`
- `useCheckout.ts:364-372` — `onUpdateSort` writes the sort ref, which feeds the query variables
  (`useCustomerAddresses.ts:31` `sort: getSortingExpression(sort.value)`) ⇒ a refetch
- `vc-table.vue:111` — `v-else-if="column.sortable && sort"` renders the clickable header;
  `:100` + `:1245` — a sortable header gets `vc-table__title--sortable` ⇒ `cursor-pointer`

So CHK-094's `cursor: auto`, "order does NOT change", and "no additional /graphql request" assertions
are contradicted by source. Note the subtlety: CHK-094's *first* assertion (`aria-sort="none"`) still
matches source on open, because `getAriaSort` (`vc-table.vue:753-759`) returns `"none"` unless
`sort.column === column.id`, and the default sort column is `lastName`
(`useCustomerAddresses.ts:17-20`), which is not any column's id.

**Recommended human action:** confirm live, then retire CHK-094 (Automation_Status is never set to
Deprecated automatically — §4). Do not "fix" CHK-094 and CHK-114 into agreement without a live check.

### P2 — CHK-114 clicks a "Name" column header that does not exist

Only `name` is sortable (P1). Column titles from `select-address-modal.vue:358-379` + `locales/en.json`:
- personal: `firstName`→"Recipient name", `name`→**"Address"**, `phone`→"Phone", `email`→"Email", `id`→"Active"
- corporate: `name`→**"Address"**, `description`→"Description", `countryName`→"Country", `id`→"Active"

Neither branch has a column titled "Name". The one sortable header is titled **"Address"**.
CHK-114's `[STATE] Default sort for personal account: lastName ascending` *is* source-supported
(`useCustomerAddresses.ts:18`) — but `lastName` is not a column, so no header can ever display that
state. Worth deciding whether the intended default is `lastName` or the sortable `name`.

### P3 — CHK-087 asserts the corporate column set under a personal-account precondition

CHK-087 (Critical) asserts `popup has 4 columns: Address / Description / Country / Active` with
precondition "User logged in as `{{USER_EMAIL}}`". That 4-column set is the **corporate** branch
(`select-address-modal.vue:360-365`, gated by `isCorporateAddresses: isCorporateMember.value`,
`useCheckout.ts:349`). A personal account renders **5** columns (`:366-372`). CHK-101 establishes that
`{{USER_EMAIL}}` is a personal, non-org account. Either the precondition or the assertion is wrong.

### P4 — Pagination is offset-based; three artifacts call it cursor-based

Two independent writers agree it is offset paging:
- frontend: `useCustomerAddresses.ts:30` — `after: String((page.value - 1) * toValue(itemsPerPage))`
  (an offset rendered as a string, not an opaque cursor)
- backend: `BaseAddressesQueryBuilder.cs:44` — `new MemberAddressConnection<…>(response.Results,
  query.Skip, query.Take, response.TotalCount)`; `BaseAddressesQueryHandler.cs:36-37` maps
  `Take`/`Skip` onto the search criteria

And in server mode the modal shows only the current page — `paginatedAddresses`
(`select-address-modal.vue:351-355`) returns `props.addresses` unchanged, so pages **replace**, they do
not accumulate.

Contradicted text: CHK-098 `[STATE] addresses from first page remain accessible (cursor-based
pagination)` and `[COUNT] total visible addresses increases`; CHK-060 "additional addresses appended",
"'Show more'", "after cursor", "no duplicate addresses across pages"; and CHK-060's `References` stamp
"pagination now server-side via cursor".

### P5 — CHK-060's page size and page count are wrong

`ADDRESSES_PER_PAGE = 6` (`useCheckout.ts:32`), passed for both personal and org (`:84`, `:101`);
the modal's own default is also `pageSize: 6` (`:309`). CHK-060 asserts "default 8 per page, 3 pages
total" against the 22-address TechFlow seed. At 6/page, 22 addresses is **4** pages.
(`PAGE_LIMIT = 100`, `core/constants/search.ts:6`, caps the rendered pager — not reached here.)

### P6 — CHK-054/055/084/085 depend on a `MinOrderTotal` store setting that no VirtoCommerce source defines

- `MinOrderTotal` across `org:VirtoCommerce`: **0 hits** outside this repo (only the suite CSV itself
  and `test-data/README.md`).
- `vc-frontend`: no `minOrder` / "minimum order" reference at all — no storefront block UI.
- Docs: the `PlatformUserGuide` Store → General settings page documents no minimum-order-total setting.
- Nearest mechanism located anywhere in the org: `CouponMinOrderAmount` on `PromotionReward`
  (`vc-module-marketing`, `src/VirtoCommerce.MarketingModule.Web/Model/PromotionReward.cs`) — a
  **coupon-eligibility** threshold, not a checkout gate. That is a different mechanism, not this one.
- Our own oracle already agrees: **BL-CHK-007** states minimum-order enforcement is "**NOT native to
  Virto Commerce**" (recorded as live-verified 2026-07-15) and applies only to deployments that add a
  custom validator.

Per §1d the absence is the finding and nothing more: **no VirtoCommerce source defines a store-level
`MinOrderTotal`, and no replacing native mechanism was located.** No claim is made about why.
All four cases already carry a `SKIP:` instruction, so they are inert rather than failing.

**Recommended human action:** stop naming the concrete path "Admin > Stores > General > MinOrderTotal"
in the preconditions, and reference BL-CHK-007's custom-validator caveat instead. Also note CHK-084's
own text already flags it as a duplicate of CHK-054's scope.

### P7 — CHK-106's `checkDuplicateAddress` has no storefront caller

The query exists server-side and in the generated schema (`client-app/core/api/graphql/types.ts:5677`,
`AddressDuplicatedResultType.isDuplicated` `:64`; also listed in our own
`.claude/knowledge/api/graphql-schema.md`). But `vc-frontend` contains **no `.graphql` document and no
call site** for it — a search of `client-app` for `checkDuplicate` returns only the generated type.

So CHK-106's `[API] checkDuplicateAddress query called before save; isDuplicated = true` cannot occur
from the storefront as built. The case's own precondition already hedges on "OQ-8 resolved to confirm
duplicate-check UI is in scope", and OQ-8 is unresolved. The replacing mechanism was **not located**:
BL-PROFILE-001's write-path silent dedup is a server-side skip, which is not a user-facing warning, so
it does not satisfy this case's assertions. Reported as absence, not explained.

### P8 — CHK-099 (Defect #3, aria-label) is satisfied in source

`createAddressFilterContext` sets
`searchAriaLabelKey: "shared.checkout.select_address_modal.search_addresses_aria_label"`
(`usePickupFilterContext.ts:154`) = **"Search addresses"** (`locales/en.json`), and `useCheckout.ts:135`
uses that factory. The BOPIS key `pages.account.order_details.bopis.search_pickup_locations`
("Search pickup locations") remains only on the two *pickup* contexts (`:68`, `:194`), which is correct
there. Source therefore satisfies both of CHK-099's assertions. Needs a live check against the deployed
build before the case is reclassified from bug-verification.

### P9 — BL-CHK-008 is source-confirmed at both writers, but for a reason the invariant does not state

Positive result. The region facet is omitted, not emptied:
- backend: `MemberAddressService.cs:82` — `if (!addressesSearchResult.Facets.Regions.IsNullOrEmpty())`
  guards the whole block, so `GetTermFacet("RegionId", "Region", …)` (`:106`) is only added when the
  aggregation is non-empty
- frontend: `filterOptionsRegions` resolves via `find(f => f.name === ADDRESS_REGION_FACET)` else
  `undefined` (`usePickupFilterContext.ts:112-115`), and the dropdown is `v-if="filterOptionsRegions"`
  (`select-address-filter.vue:18`)
- the facet-name constants match the backend exactly — `CountryCode` / `RegionId` / `City`
  (`usePickupFilterContext.ts:74-76`)

Worth recording in the invariant: if the facet object were ever present with `terms: []`, the frontend
would render it **disabled** (`:disabled="!filterOptionsRegions.values?.length"`,
`select-address-filter.vue:22`), *not* absent. So BL-CHK-008's "absent from the DOM" holds because of
the **backend omission**, not the frontend guard. Narrow and true is better than broad here.

### P10 — CHK-092 (city facet label): mechanism found, cause NOT established

City is the only one of the three facets whose label is passed through unresolved:
- `MemberAddressService.cs:74` — City: `Label = x.Label`
- `:58` — Country: `Label = countries.FirstOrDefault(…)?.Name ?? x.CountryCode`
- `:102` — Region: `Label = regions.FirstOrDefault(…)?.Name ?? regionFacet.RegionId`

So whatever the underlying city aggregation supplies as `Label` is rendered verbatim; neither the xAPI
mapper nor the storefront resolves a city name. **The producer of `Facets.Cities` was not read** (it
lives in the member search/indexing layer, outside the two repos anchored here), so the cause of
Defect #2 is not established. The missing resolution step is the finding, not the explanation.

### P11 — CHK-100 asserts "all 3 filter buttons" unconditionally

Given P9, the State/Region facet renders only when the result set has non-null `regionId` values.
CHK-100's `[DOM] all 3 filter buttons (Country, State, City) fully visible within 375px viewport` is
therefore data-dependent. Recommend binding the case to a seed that guarantees non-null regions, or
stating the 2-facet case explicitly. Minor.

---

## Incidental verifications (no action; recorded so the next audit need not redo them)

- Every `data-test-id` the popup cases use exists in source: `select-address-modal`,
  `search-keyword-input`, `filter-country` / `filter-region` / `filter-city`, `search-button`,
  `reset-filters-mobile-button`, `select-address-button` (`address-selection.vue:21,31`),
  `customer-address-${id}`, `confirm-button`, `close-button`.
- The link copy the cases click — "Please select a shipping address" — is **correct**: rendered as
  `common.prefixes.please` ("Please") + `shared.checkout.shipping_details_section.links.select_address`
  ("select a shipping address"), `address-selection.vue:26-37`.
- Every GraphQL argument the popup cases assert is real: `after`, `first`, `sort`, `countryCodes`,
  `regionIds`, `cities`, `keyword` — declared in
  `getCurrentCustomerAddresses.graphql:3-19` and registered server-side in
  `BaseAddressesQuery.cs:14-32`, then mapped onto the search criteria in
  `BaseAddressesQueryHandler.cs:36-42`. `term_facets { name terms { term label count } }` backs the
  count-badge assertions.
- The address filter component is genuinely shared with BOPIS pickup locations — it is typed
  `IPickupFilterContext` and its loading flag is literally named `pickupLocationsLoading`
  (`select-address-filter.vue:62`, `usePickupFilterContext.ts:19`). The two empty-state controls in
  the modal still use BOPIS i18n keys (`select-address-modal.vue:165,248`
  → `pages.account.order_details.bopis.cart_pickup_points_reset_search`). Not asserted by any case;
  noted because it is the same copy-paste family as Defect #3.
- Docs state that with the Shipping-address policy enabled the shipping address is "prefilled with the
  most recently used address" (`checkout-process`), while a favourite address "will automatically
  appear at the top of the address list … and during checkout" (`company-info`). CHK-058 instead
  describes pre-selection via default sort + `isDefault`. These may be three different mechanisms;
  CHK-058 could not be adjudicated without the live axis. Flagged for the next audit that has one.

## Next run

Re-run `/qa-review-tests suite 011 --triangulate --fix` in an environment **with a browser**. With the
docs and source axes already gathered above, a live pass would likely convert P1/P2/P3/P4/P5/P8 into
applied CONFIRMED/DRIFT edits. Suite 011 stays at the head of `tc:audit:queue` until a row is stamped.
