# VCST-5905 — Fix verification: `salesRepCustomerOrders` TYPE_LOAD

**Verdict: VERIFIED** · check type: fix verification (RED→GREEN) · 2026-09-07

**Env:** vcst-qa @ Platform **3.1064.0**, Theme `vc-theme-b2b-vue-2.57.0-alpha.2490`
**Live modules** (`GET /api/platform/modules`, not inferred): `VirtoCommerce.SalesRep` **3.1008.0-pr-19-5e0f** · `VirtoCommerce.XOrder` 3.1011.0 · `VirtoCommerce.Xapi` 3.1020.0
**Fix:** [vc-module-sales-rep#19](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/19) — retargets `SalesRepMapper` to `IXOrderMapper` in `VirtoCommerce.XOrder.Core.Services` and passes a `FacetMappingContext` to `ToFacetResult`. All CI green (ci, auto-tests ×3 DBs, swagger-validation, SonarCloud, CLA). **PR is still OPEN** — verified on its prerelease artifact, not on a merged build.
**Deployed by:** `vc-deploy-dev@vcst-qa` commit `6f7ed60a`, 2026-09-07T15:38:36Z.

## Summary
The retarget resolves the outage. `salesRepCustomerOrders` returns real paged data with no `TYPE_LOAD`,
3/3 consecutive runs. The whole scoped `/graphql/sales-rep` surface (11 fields) resolves, and the
`ToFacets` path the fix rewrote produces facet counts that reconcile exactly with the unfaceted total.
No side effects found. One evidence slot is **not captured** — see the gap below.

## RED → GREEN

Baseline is **live telemetry**, not a recollection — App Insights `vcst-qa`, operation `POST graphql/SalesRepCustomerOrders`:

| Phase | Window (UTC) | Evidence |
|---|---|---|
| **RED** (SalesRep 3.1007.0) | 13:58:17 → 14:19:05 | `exceptions`: **5 ×** `System.TypeLoadException at MediatR.Wrappers.RequestHandlerWrapperImpl`2.Handle`` · `requests`: **5 ×** `resultCode 500`, `success=False` |
| — deploy — | 15:38:36 | `6f7ed60a` pins `VirtoCommerce.SalesRep_3.1008.0-pr-19-5e0f.zip` |
| **GREEN** (SalesRep 3.1008.0-pr-19) | 15:45:30 onward | `requests`: `resultCode 200`, `success=True`; **zero** `IXOrderMapper` exceptions in the 12 h window to 18:17 |

STR re-run live (this verification, ~18:10 UTC), 3 consecutive times, byte-identical query from the ticket:

```
run 1  PASS  http 200  totalCount=96  items=[CO260907-00004, CO260907-00003]  errorCodes=none
run 2  PASS  http 200  totalCount=96  items=[CO260907-00004, CO260907-00003]  errorCodes=none
run 3  PASS  http 200  totalCount=96  items=[CO260907-00004, CO260907-00003]  errorCodes=none
```

## Verification checklist

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Original STR reproduces clean, 3 consecutive runs | **PASS** | 3/3, `totalCount=96`, real order numbers, no `errors[]` |
| 2 | Fix resolves the reported issue | **PASS** | `data.salesRepCustomerOrders` non-null; `TYPE_LOAD` absent |
| 3 | Root cause addressed, not symptom | **PASS** | DI constructs `SalesRepMapper`; server-side `TypeLoadException` ceased in telemetry |
| 4 | `salesRepCustomers` / `salesRepOrders` still work | **PASS** | 5 served orgs; 24 rep-placed orders |
| 5 | Rest of the scoped schema (11 fields) | **PASS** | filter+sort rules, statistics, customer counts, top sellers, `salesRepCustomerOrder` |
| 6 | No new server-side errors | **PASS** | zero `IXOrderMapper` exceptions post-fix |
| 7 | Storefront reflects corrected behaviour | **NOT CAPTURED** | see Evidence gap |
| 8 | API returns expected response | **PASS** | HTTP 200 + typed payload on both `/graphql/sales-rep` and `/graphql` |
| 9 | Boundaries: paging, facets, multi-word filter value | **PASS** | `after:"2"` pages; facet sum reconciles; `status:"Payment required"` → 2/2 |
| 10 | `BL-SR-002` membership scope holds **[P0-security]** | **PASS** | 96 rep-visible of 8 248 store-wide; 0 of 96 rows outside the 5 served orgs |

## Business rules verified

| Invariant | Verdict | Measurement |
|---|---|---|
| `BL-SR-002` no cross-rep / unserved-org leak `[P0-security]` | PASS | 96 of 8 248; 0 leaked rows |
| `BL-SR-009` named filter rule; unknown value fails CLOSED | PASS | every facet term round-trips at the same count; unknown → `totalCount 0`, no error |
| `BL-SR-010` sort direction honoured | PASS | `createdDate:desc` head `CO260907-00004`; `:asc` head `CO260706-00003` |
| `BL-SR-013` localized vocabulary, no raw enum key | PASS | `New / Cancelled / Processing / Payment required / Completed` |
| facet ↔ total reconciliation (the rewritten `ToFacets`) | PASS | `73+10+10+2+1 = 96` = unfaceted `totalCount` |

`BL-SR-002` is the one that mattered most here: the fix rewrote the mapper the scoped query depends on,
and a mapping change is exactly what could silently widen scope. It did not.

## Evidence gap — stated, not hidden

**Layer 1 (storefront) is NOT CAPTURED, again, and for the same verified reason.** Regression run
`REG-2026-09-07-1342` is **ACTIVE** — `npm run regression:reap` reports it progressed 0 min ago — so all
three Playwright lanes are held, and taking one would corrupt an in-flight run. Chrome DevTools MCP was
not substituted: that lane has no `--secrets`, and the Sales Rep hub is role-gated, so neither a minted
account nor an unknown persistent profile reaches the surface under test.

This does not change the verdict: the owning layer is L3, and L3 + L4 both pass. That same active run
executes suites **091 / 093 / 097**, which reference this field 42 times — its triage supplies the
storefront confirmation without a separate browser pass.

**No screenshot is attached, deliberately:** the defect and its fix are API-layer. The GraphQL
request/response pair and the server-side exception timeline are the primary evidence; there is no UI
state to photograph beyond a grid that was empty and is now populated.

## Notes for the reader

- The fix is verified on an **unmerged PR prerelease**. Merge and release remain the owning team's.
- The ticket's two pre-existing open bugs on this surface are now **unblocked** for verification; neither
  was re-tested here.
- Five of the adjacent queries and one invariant first came back red on my own query authoring (wrong
  sub-field names, and an unquoted multi-word filter value). Each was corrected against live
  introspection and re-run; none was a product finding.

**Artifacts:** `evidence.html` · `verification-summary.json` (this folder)
