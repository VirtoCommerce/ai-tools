# salesRepCustomerOrders is dead on released XOrder 3.1011.0 — TypeLoadException on IXOrderMapper — High

## Status: FIXED
**Tracker:** [VCST-5905](https://virtocommerce.atlassian.net/browse/VCST-5905) — Bug, Priority High, filed 2026-09-07, status `Draft`
**Found by:** manual (operator API probe) · confirmed server-side via Application Insights · suites 091/093/097 of `REG-2026-09-07-1342` overlap this surface (attribution pending that run's triage)
**Archetype:** SILENT

**Severity:** High · **Type:** Module version incompatibility (released combination) · **Provenance:** PRE-EXISTING

**Env:** vcst-qa @ Platform **3.1064.0**, Theme `vc-theme-b2b-vue-2.57.0-alpha.2490`
Declared **and** deployed (`vc-deploy-dev@vcst-qa`, source `GithubReleases` — no PR builds):
`VirtoCommerce.Xapi 3.1020.0` · `VirtoCommerce.XOrder 3.1011.0` · `VirtoCommerce.SalesRep 3.1007.0`

## Summary
Every call to `salesRepCustomerOrders` on the scoped `/graphql/sales-rep` schema returns **HTTP 200**
with `data.salesRepCustomerOrders: null` and `errors[].extensions.code = "TYPE_LOAD"`. The entire Sales
Rep customer-orders surface is non-functional — list, filters, paging and the customer-scoped order
views all depend on this single field.

The cause is an assembly-level breaking change. `IXOrderMapper` now lives in
`VirtoCommerce.XOrder.Core` (`src/VirtoCommerce.XOrder.Core/Services/IXOrderMapper.cs` on x-order HEAD),
but `VirtoCommerce.SalesRep 3.1007.0` was compiled against its old home in `VirtoCommerce.XOrder.Data`.
DI therefore cannot construct the query handler at all, so the field can never resolve — this is not a
data, filter or permission problem.

**These are released versions, not prereleases**, so any deployment pinning this trio inherits the outage.

## Expected vs Actual
- **Expected:** `salesRepCustomerOrders` returns a page of the rep's served-customer orders (as it did on XOrder 3.1010.0).
- **Actual:** `200` + `data: null` + `errors[TYPE_LOAD]`, on every call, for every argument set.

## Steps to Reproduce
1. Obtain a sales-rep token for `{{STORE_ID}}`.
2. `POST {{BACK_URL}}/graphql/sales-rep` with:
   `{ salesRepCustomerOrders(storeId:"{{STORE_ID}}", cultureName:"en-US", first:2) { totalCount items { number } } }`
3. Response is `200` with:

```json
{"errors":[{"message":"Error trying to resolve field 'salesRepCustomerOrders'.",
  "path":["salesRepCustomerOrders"],
  "extensions":{"code":"TYPE_LOAD","codes":["TYPE_LOAD"]}}],
 "data":{"salesRepCustomerOrders":null}}
```

Reproduces on every attempt; four independent occurrences captured in telemetry.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | NOT CAPTURED | Both chromium lanes occupied by `REG-2026-09-07-1342`; firefox cannot click this storefront. Deferred — see Evidence gap |
| 2. Backend Admin | N/A | Surface is storefront-only; orders are readable in Admin via the Platform REST path below |
| 3. GraphQL xAPI | **FAIL** | `TYPE_LOAD` on `/graphql/sales-rep`; **standard `/graphql` `orders` PASSES** — 200, `totalCount 8585`, real items |
| 4. Platform REST API | PASS | `POST /api/order/customerOrders/search` → 200, `totalCount 8585` |

**Owning layer:** Layer 3 — GraphQL xAPI (scoped `sales-rep` schema)

The discriminator that isolates this: the **standard** xAPI `orders` query resolves correctly against the
same `VirtoCommerce.XOrder` 3.1011.0 assembly. XOrder's own handlers construct fine; only SalesRep's
query builder — which resolves an XOrder type through DI — fails. So XOrder 3.1011.0 is internally
consistent, and the defect is specifically SalesRep's stale binding to a moved type.

## Root Cause Analysis
Innermost exception (App Insights, resource `vcst-qa`, table `exceptions`):

```
System.TypeLoadException: Could not load type
'VirtoCommerce.XOrder.Data.Services.IXOrderMapper'
from assembly 'VirtoCommerce.XOrder.Data, Version=3.1011.0.0, Culture=neutral, PublicKeyToken=null'
```

Call chain (level 22 down to 0):

```
VirtoCommerce.SalesRep.ExperienceApi 3.1007.0
  SalesRepCustomerOrdersQueryBuilder.cs:37   (GetFieldType lambda)
-> VirtoCommerce.Xapi.Core 3.1020.0  RequestBuilder.cs:91  (GetResponseAsync)
-> MediatR 12.0.0  Mediator.Send -> RequestHandlerWrapperImpl.Handle
-> Microsoft.Extensions.DependencyInjection  CallSiteFactory.CreateConstructorCallSite
-> System.Signature.Init -> System.TypeLoadException
```

The throw is inside DI **constructor call-site creation**, i.e. at handler construction — which is why no
argument combination and no permission state can avoid it.

Source evidence (GitHub, read-only):
- `vc-module-x-order` HEAD: interface at `src/VirtoCommerce.XOrder.Core/Services/IXOrderMapper.cs`;
  implementation `XOrderMapper.cs` remains under `src/VirtoCommerce.XOrder.Data/Services/`.
- `vc-module-sales-rep` HEAD: `src/VirtoCommerce.SalesRep.Data/Services/SalesRepMapper.cs` references `IXOrderMapper`.

**Regression window:** last good **XOrder 3.1010.0** — `reports/bugs/open/low/BUG-salesrep-customer-orders-max-result-window.md`
records this same query returning real data and real pagination boundaries on 3.1010.0 (env header:
`SalesRep 3.1007.0-pr-14-5569, XOrder 3.1010.0`). First bad: **3.1011.0**. The interface move landed in
that bump.

**CAUSATION CONFIRMED at source level** — tag diff, no deployment required (recorded in the VCST-5905 comment):

| | tag `3.1010.0` | tag `3.1011.0` |
|---|---|---|
| Path | `XOrder.Data/Services/IXOrderMapper.cs` | **404 — gone**; now `XOrder.Core/Services/IXOrderMapper.cs` |
| Namespace | `VirtoCommerce.XOrder.Data.Services` | `VirtoCommerce.XOrder.Core.Services` |
| Signature | `ToFacetResult(OrderAggregation, string cultureName)` | `ToFacetResult(OrderAggregation, FacetMappingContext)`, plus new `MapTo(IList<IFilter>, PaymentSearchCriteria)` |

It is a **double** breaking change — assembly/namespace move **and** signature change — shipped in a patch bump.

`SalesRepMapper.cs` @ SalesRep 3.1007.0 carries `using VirtoCommerce.XOrder.Data.Services;`, takes
`IXOrderMapper` by **constructor injection**, and calls the old 2-arg `ToFacetResult(x, cultureName)` —
which is exactly why the stack dies inside `CallSiteFactory.CreateConstructorCallSite`. Source and stack
trace agree with no inference left in the chain.

**Fix is single-repo and small** (revising the MEDIUM routing note below): `SalesRepMapper` only
*consumes* `IXOrderMapper`, so the new `MapTo` member imposes nothing on SalesRep. Change the `using`
to `VirtoCommerce.XOrder.Core.Services` and adapt the one `ToFacetResult` call site to a
`FacetMappingContext`.

**Do NOT downgrade XOrder to 3.1010.0** — 3.1011.0 put `FacetMappingContext` into the interface, so any
other module compiled against 3.1011.0 would hit the mirror-image `TypeLoadException`. Fix forward.

## Alternatives ruled out
- **By design** — no. A `System.TypeLoadException` from DI construction is never intended behaviour, and the same field returned data on the previous XOrder patch.
- **Data / fixture drift** — no. Layer 4 REST reports 8,585 orders and the standard xAPI `orders` query returns real rows; the data is present and readable.
- **Auth / permission scope** — no. The throw precedes any authorization check, occurring during handler construction.
- **The two known open bugs on this surface** — no, both are different defects and neither explains `TYPE_LOAD`:
  `open/medium/BUG-salesrep-customer-orders-zero-match-hides-active-status-filter.md` (facet/UI) and
  `open/low/BUG-salesrep-customer-orders-max-result-window.md` (`SEARCH`/`TRANSPORT`). Both were filed
  against XOrder 3.1010.0 + PR builds and are **currently unverifiable** on this build, since the field
  cannot resolve at all — they are neither fixed nor confirmed.

## Impact
- Complete outage of the Sales Rep customer-orders surface on any deployment of this released trio.
- Regression suites referencing this field: **091** (12 refs), **093** (18 refs), **097** (12 refs) — Frontend; **050m** (95 refs) and **050m2** (4 refs) — Backend. Suite 089 does not reference it.
- Blocks verification of the two pre-existing open bugs above.

## Evidence gap (stated, not hidden)
No storefront screenshot or HAR: both chromium lanes were occupied by regression run
`REG-2026-09-07-1342`, and the firefox lane cannot click on this storefront (`@playwright/mcp`
actionability defect). The API response plus the server-side exception chain are stronger evidence for
this particular defect than a screenshot of an empty grid would be, but the Layer-1 slot is
**deferred, not satisfied**. Filed at CONFIRMED rather than READY_TO_SUBMIT for that reason.

Telemetry join keys — App Insights `vcst-qa`, table `exceptions`, `operation_Name = POST graphql/SalesRepCustomerOrders`:
`8287ae0a21c944a4a94afa1a01184310` · `a202f139b82d46f5826bcfa015703c98` · `f08cc4614af04aaf9e74e95ed4d5334a` · `a12ba0a806294ad6ba91ac0c1004a4eb`

## Follow-ups
1. Identify the introducing commit/PR in `vc-module-x-order` that moved `IXOrderMapper` from `.Data` to `.Core`, and confirm its diff explains the symptom (correlation is not yet causation-confirmed).
2. Decide env remediation — pin XOrder back to 3.1010.0, or deploy a SalesRep build compiled against 3.1011.0. This is a deployment decision, not a code fix.
3. Re-verify both pre-existing open bugs once the field resolves again.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — GraphQL xAPI (scoped `sales-rep` schema)
- **Suggested repo:** `VirtoCommerce/vc-module-sales-rep` (rebuild/retarget against XOrder 3.1011.0) — the breaking change itself originated in `VirtoCommerce/vc-module-x-order`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** SalesRep ExperienceApi — `SalesRepCustomerOrdersQueryBuilder`
- **RCA anchor:** `src/VirtoCommerce.SalesRep.ExperienceApi/Queries/SalesRepCustomerOrdersQueryBuilder.cs:37`; missing type `VirtoCommerce.XOrder.Data.Services.IXOrderMapper`; consumer `src/VirtoCommerce.SalesRep.Data/Services/SalesRepMapper.cs`
- **Routing confidence:** MEDIUM — the layer and RCA anchor are HIGH confidence (the exception chain names file and line), but the *fix* spans two repos: a rebuild in `vc-module-sales-rep`, or a compatibility shim / revert in `vc-module-x-order`. Expect `/qa-fix` **Gate 0 BAIL, `BAIL_CLASS: multi-repo`** — a cross-repo breaking change is out of auto-fix scope by design.

## Resolution
**Status: FIXED** — verified 2026-09-07 on vcst-qa.

- **Fixed in:** `VirtoCommerce.SalesRep` **3.1008.0** — [vc-module-sales-rep#19](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/19)
  (verified on the prerelease artifact `3.1008.0-pr-19-5e0f`; **the PR was still OPEN at verification time**).
- **Tracker:** [VCST-5905](https://virtocommerce.atlassian.net/browse/VCST-5905) → `Tested`.
- **Fix shape:** `SalesRepMapper` retargeted to `IXOrderMapper` in `VirtoCommerce.XOrder.Core.Services`
  and `ToFacetResult` now receives a `FacetMappingContext`. **Single repo** — the routing note above
  predicted a `multi-repo` Gate-0 bail; that was too pessimistic, because `SalesRepMapper` only
  *consumes* the interface, so XOrder's new `MapTo` member imposed nothing on SalesRep. No shim or
  revert in `vc-module-x-order` was needed.
- **Verification method:** STR re-run 3/3 clean (`totalCount 96`, real order numbers, no `TYPE_LOAD`);
  11/11 adjacent queries across the scoped `/graphql/sales-rep` schema; 6/6 invariants measured
  (`BL-SR-002` P0-security scope holds at 96 rep-visible of 8,248 store-wide with zero leaked rows;
  facet counts reconcile to the unfaceted total). RED baseline taken from live App Insights telemetry —
  5 × `System.TypeLoadException` / `resultCode 500` between 13:58:17Z and 14:19:05Z, then zero
  occurrences after the 15:38:36Z deploy.
- **Not captured:** Layer-1 storefront confirmation — all three Playwright lanes were held by the
  ACTIVE regression run `REG-2026-09-07-1342`. The owning layer is L3 and both L3 and L4 pass; suites
  091/093/097 in that run cover the field 42 times.
- **Evidence:** `reports/tickets/Sprint26-18/VCST-5905/` (`verification-report.md`, `evidence.html`,
  `verification-summary.json`).
