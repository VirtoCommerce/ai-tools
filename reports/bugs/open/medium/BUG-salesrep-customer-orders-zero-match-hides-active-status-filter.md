# Sales Rep customer-orders: a zero-match filter hides the active status filter and its control — Medium

**Env:** vcst-qa @ Platform 3.1063.0, Theme vc-theme-b2b-vue-2.57.0-pr-2444-5946-59465f5e
(unmerged PRs live: vc-frontend#2444, vc-module-sales-rep#14, vc-module-x-api#84)

**Found by:** exploratory session `reports/exploratory/SBTM-salesrep-customer-orders-2026-09-03.md`

## Summary
On the Sales Rep customer-orders list, applying a status filter plus a created-date range that
together match nothing makes the **status filter section disappear from the Filters drawer entirely**.
The status filter is still applied and still in the outgoing query, but the rep can no longer see it
or uncheck it — the drawer shows only the date fields. The rep is left looking at "No orders match
this filter" beside a drawer that discloses only half the filter that produced it, and the only
recovery is an all-or-nothing **Reset**.

Root cause is visible on the wire: the drawer's status checkboxes are rendered from the response's
`term_facets`, and `salesRepCustomerOrders` returns `term_facets: []` whenever `totalCount` is 0. The
UI has no fallback for "zero results but a filter is active", so the control that would undo the
filter is built from data the zero-match response no longer carries.

## STR
1. Sign in to the storefront as a sales rep (`@td(SR_REP_PRIMARY.email)`).
2. Go to `/company/my-customers/@td(ORG_ACMECORP.platform_id)/orders`
   (observed: `/company/my-customers/105c2c4e-23be-4258-8691-568a0ff190be/orders`).
3. Open **Filters**, check **Processing (5)**, click **Apply** → 5 rows, drawer lists all four
   statuses with counts.
4. Open **Filters** again, set **Created date** Start = `09/03/2026`, End = `09/03/2026`
   (a day with no Processing orders), click **Apply**.
5. Grid shows `No orders match this filter`.
6. Open **Filters** again.

## Expected vs Actual
**Expected:** the drawer still shows the **Select order status** group with `Processing` checked, so
the rep can see which filter is active and drop just that one term (or the API returns the
unfiltered facet set so the control can render).

**Actual:** the **Select order status** group is absent — zero checkboxes. Only Created date,
**Reset** and a disabled **Apply** remain. The applied `status:"Processing"` term is invisible in the
UI yet still present in the request. Dropping only the status term is impossible; only Reset works,
which also discards the date range.

## Evidence
Request at step 4/6 (`SalesRepCustomerOrders`):
```
filter: status:"Processing" createddate:["2026-09-02T22:00:00.000Z" TO "2026-09-03T21:59:59.999Z"]
sort:   createdDate:asc
```
Response:
```json
{"data":{"salesRepCustomerOrders":{"totalCount":0,"items":[],"term_facets":[]}}}
```
- `reports/exploratory/screenshots/zero-match-status-facet-control-vanishes.png` — drawer with the
  status group gone
- `reports/exploratory/screenshots/zero-match-empty-state-no-inline-reset.png` — the empty state

HTTP 200 throughout; **zero console errors** for the whole session.

## Notes
- **BL-SR-012** (filter-aware empty states) is *satisfied on the message* — "No orders match this
  filter" is correctly distinct from a no-data state, and a Reset does exist. The defect is the
  **disclosure of the active filter set**, which BL-SR-012 does not currently cover.
- Distinct from suite `097` **SR-CO-015**, which covers a *failed or slow* facet request leaving the
  drawer honest. Here the facet request **succeeds** and legitimately returns an empty facet list —
  same drawer, different trigger, and not asserted anywhere.
- This surface's filter/sort grammar is field:value / field:direction (`status:"Processing"`,
  `createdDate:asc`), not the named filter/sort rule vocabulary BL-SR-009 / BL-SR-010 declare for the
  sales-rep domain. See the session report's Oracle Feedback table.
- Secondary, **Low**, same surface: the zero-match empty state offers no inline clear/reset
  affordance — the rep must know to reopen the drawer.

---

## Independent reproduction + layer isolation (added by `/qa-bug reproduce`, 2026-09-03)

Appended by a second session at the operator's request. **The original report's prose above is
unmodified** — this section only adds the reproduction, the layer verdict and the routing block.

**Status: CONFIRMED** (reproduced, root cause identified at source)
**Found by:** exploratory (`SBTM-salesrep-customer-orders-2026-09-03`) · reproduced independently at
Layer 3 + source · — none (not case-attributable: no case in suite `097` asserts this trigger)
**Archetype:** `FALLBACK`

### The discriminating probe — the API is NOT the owner

Same query, same org (`105c2c4e-…` = `ORG_ACME`), `facet:"status"` requested every time:

| # | Filter | `totalCount` | `term_facets` |
|---|---|---|---|
| A | none | 16 | 1 entry — `New(7) Processing(5) Cancelled(3) Payment required(1)` |
| B | `status:"Processing"` | 5 | **unchanged** — all four statuses, full counts |
| C | **`createddate:[2030-01-01 TO 2030-01-02]` only — NO status filter** | **0** | **0** |
| D | `status:"Processing"` + that date window (the report's case) | 0 | 0 |

### Independently re-reproduced — the trigger is broader than the STR above

Re-reproduced 2026-09-03 during `/qa-review-tests --verify` on the **same build**, on a **different
organization** (TechFlow, not AcmeCorp) with a **different status** (`Cancelled`, not `Processing`):
the `Select order status` group was again entirely absent from the drawer DOM, the response again
carried `term_facets: []` / `totalCount: 0`, and the outgoing query again retained
`filter: status:"Cancelled" createddate:[...]` with no control able to clear it. Only `Reset`
(enabled) and `Apply` (disabled) remained.

So the defect is **organization-independent and status-independent** — it is a property of the
zero-match response shape, not of the particular fixture in the STR. Evidence:
`reports/tickets/Sprint26-17/VCST-5733/screenshots/SR-CO-026-verify-REFUTED.png`.
Regression proof: `SR-CO-026` / `SR-CO-027` in suite 097 (both `Draft`, both RED until this lands).

**C is the discriminator.** With no status selection at all, an empty result set still yields no facets.
So the API is not dropping facets *because of the selection* — it drops them because nothing matched,
which is uniform and standard aggregation behaviour (an aggregation over zero documents has no buckets).
B independently confirms own-axis correctness: the status facet ignores its own selection, as designed.

### Backend confirmed in source — there is no zero-result branch to change

`SalesRepCustomerOrdersQueryHandler.Handle` (vc-module-sales-rep, `feat/VCST-5733-srh-all-customer-orders`)
ends with:

```csharp
result.Facets = _mapper.ToFacets(searchResult.Aggregations, request.CultureName);
```

It passes through **whatever aggregations the search returned**. There is no conditional on `TotalCount`,
no special-casing of empty results, and no facet-specific branch anywhere in the handler. The only early
returns are authorization short-circuits — `string.IsNullOrEmpty(request.UserId)` and
`organizationIds.Count == 0` — and both return before any search runs.

So on a zero-match query Elasticsearch produces no aggregation buckets, `ToFacets` maps that to an empty
list, and the module returns `Facets = []`. **This is search-engine semantics passed through faithfully,
not a module decision** — there is no choice in the module to reverse. Emitting facets at zero results
would mean *adding* a special case (a second aggregation-only query with the offending clause removed),
which is a feature request, not a bug fix. Note also that `result.Facets` is initialised to `[]` at the
top of the handler, so the field is always an array and never null.

**Layer 3 = PASS, on both behavioural and source evidence.**
**Consequence:** the report's alternative framing ("or the API returns the unfiltered facet set so the
control can render") is **withdrawn**: it would require the backend to special-case empty results, which is a new capability
rather than a fix. **The owning layer is the frontend.**

### Root cause at source — the composable, not the component

The symptom is visible at the `v-if` in the component, but the defect is one level up, in
`client-app/modules/sales-rep/composables/useSalesRepCustomerOrders.ts`:

```ts
const facets = computed(() => result.value?.salesRepCustomerOrders?.term_facets);
const statusOptions = computed(() => toFacetOptions(facets.value, STATUS_ORDERS_FACET_NAME));
const customerOptions = computed(() => toFacetOptions(facets.value, ORDER_CUSTOMER_FACET));
```

`statusOptions` is derived **purely** from the response, with no memory of previously-seen options and —
the actual defect — **no reference to `filters.value.statuses`, the applied selection, which lives in the
very same composable.** The full chain, with each step judged:

| Step | Correct? |
|---|---|
| API returns `term_facets: []` at zero results | ✅ by design, confirmed in source |
| `facets` → `[]` | ✅ |
| `toFacetOptions(facets, STATUS)` → `[]` — a pure mapper, `(facets ?? []).filter…flatMap…` | ✅ |
| **`statusOptions` → `[]`, never unioned with the applied `filters.value.statuses`** | ❌ **the defect** |
| `v-if="statuses.length"` in `sales-rep-orders-filters.vue` unmounts label + checkbox group | consequence |
| `filters.value.statuses` still holds `["Processing"]`, so `filterExpression` still emits `status:"Processing"` | the symptom |

Because the composable holds **both** `filters` and `statusOptions`, unioning the applied terms into the
options is a purely local change with no API involvement. `customerOptions` has the identical exposure on
the cross-customer route.

The query already passes `keepPreviousResult: true`, but that governs the loading transition — once the
zero-match response lands it *is* the current result, so it does not retain the earlier facet list.
### Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | `v-if="statuses.length"` unmounts the group while `applied.statuses` retains the selection; UI evidence in the original report's two screenshots |
| 2. Backend Admin | N/A | not an admin-visible surface |
| 3. GraphQL xAPI | **PASS** | probes A–D above **plus** the handler source: `result.Facets = _mapper.ToFacets(searchResult.Aggregations, …)` with no zero-result branch — pass-through of ES aggregation semantics |
| 4. Platform REST API | N/A | not exercised — the storefront reads this surface only through the scoped xAPI |

**Owning layer:** Layer 1 — Storefront Frontend.

### One correction to the STR

Step 2 cites `@td(ORG_ACMECORP.platform_id)`, which **does not resolve** — no such alias exists. The
correct alias is **`@td(ORG_ACME.platform_id)`** (`ORG-001`, org name `AGENT-TEST-Org-AcmeCorp-20260310`,
GUID `105c2c4e-23be-4258-8691-568a0ff190be` — matching the GUID the report itself observed). The alias
name appears to have been derived from the organization *name* rather than the alias key, so anyone
re-running the STR verbatim hits an unresolvable reference.

### Incidental, not part of this bug

The same file's presets are **rolling windows measured back from today** (`lastWeek` = `today - 7d`,
`lastYear` = `today - 1y`) and look correct — which corroborates, from the opposite direction, that the
four `ORD-063..066` date-preset failures in suite `014` belong to the **buyer** page's *shared*
calendar-aligned component and are pre-existing rather than caused by this PR.

### Layer-1 pass: the trigger is NOT zero-match — it is facet self-exclusion, and there are TWO grades

Walking the drawer directly (Layer 1, `playwright-edge`, same build) found a **second, more insidious
state** the STR does not reach, and it corrects the mechanism stated above.

| Grade | Precondition | What the drawer shows | Screenshot |
|---|---|---|---|
| baseline | no filter | `Select order status` with all four options + counts | `…-1-baseline-all-four-statuses.png` |
| **State A** | `totalCount > 0`, applied status excluded by **another** axis | group **renders**, other options present, **the applied option is absent** | `…-2-applied-option-missing-group-present.png` |
| **State B** | `totalCount = 0` (`term_facets: []`) | group **absent entirely** | `…-3-group-absent-entirely.png` |

All five in `reports/tickets/Sprint26-17/VCST-5733/screenshots/`, prefix `BUG-zero-match-status-group-`;
also attached to **VCST-5868**.

**The mechanism is self-exclusion, not emptiness.** Each term facet is aggregated with its **own** axis's
filter excluded but **every other axis applied** — which is why probe B above legitimately returned all
four statuses, and it is correct multi-select behaviour. The consequence is general: **an applied term is
visible only if the response happens to contain a bucket for it**, and self-exclusion guarantees no bucket
whenever another axis excludes that term. Zero-match (State B) is just the degenerate case where *every*
bucket disappears at once.

**This invalidates the obvious fix.** "Retain the previous facet list when `totalCount` is 0" repairs
State B and leaves State A untouched — the group is present, so no `v-if` fires and nothing looks wrong.
Only unioning `filters.value.*` into `statusOptions` / `customerOptions` covers both, which is the
`useSalesRepCustomerOrders.ts` anchor below.

**Pairing confirmed in both grades** — the outgoing query retained the applied term
(`filter: status:"…" …`) while no control in the DOM could clear it, so the list stays filtered by a term
the rep cannot see or undo. `Reset` is enabled but **all-or-nothing**: it clears the date window and the
customer selection along with the status, so there is no way to drop one term.

**The cross-customer route is worse.** With both `status` and `organizationname` applied, **both** groups
lose their applied option simultaneously — the rep cannot see *which customer* or *which status* is
narrowing the list (`…-4-cross-customer-both-groups-absent.png`), and the empty state offers no inline
recovery (`…-5-empty-state-no-inline-recovery.png`).

`GET`/`POST` all 200, **zero console errors and zero failed requests** across the whole pass — consistent
with a client-side render gate and the reason no telemetry correlates.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** `frontend`
- **Ownership hint:** platform (no `project-profile.json` on this deployment ⇒ native)
- **Component / module:** Sales Rep Hub — customer-orders filters drawer
- **RCA anchor (corrected):** `client-app/modules/sales-rep/composables/useSalesRepCustomerOrders.ts` —
  `statusOptions` / `customerOptions`, which must union the applied `filters.value` terms with the
  facet-derived options. Secondary (where the symptom shows): the `v-if="statuses.length"` guard in
  `sales-rep-orders-filters.vue`
- **Routing confidence:** **HIGH** — single repo, single composable, layer isolated by a paired API control
  **and** confirmed in backend source (Layer 3 PASS)
- **Application Insights:** N/A with reason — HTTP 200 throughout, zero console errors, and the defect is a
  client-side render gate, so there is no server-side error to correlate
