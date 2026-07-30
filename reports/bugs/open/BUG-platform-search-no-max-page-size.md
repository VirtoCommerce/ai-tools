# Platform search endpoints have no maximum page size — large `take` causes multi-minute requests / gateway timeouts

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a-vcst-5618-e27ac905`

## Summary

Neither the Catalog search nor the Orders search endpoint enforces a maximum `take` (page size). A single authenticated request with a large `take` value can occupy the origin server for well over a minute, and the Orders endpoint times out at the Cloudflare edge (`524`) after 125 seconds. This is a resource-exhaustion / availability concern, not merely a slow query.

## Steps to Reproduce

```
POST {{BACK_URL}}/api/catalog/search/products
{"take":10000,"skip":0}

POST {{BACK_URL}}/api/order/customerOrders/search
{"take":5000,"skip":0}
```

## Actual Result

| Call | Result |
|---|---|
| Catalog `take:1000` (control) | 200 in 2.5s, 14.3 MB |
| Catalog `take:10000` | **200 OK after 54.6 seconds, 61,601,149 bytes** (61 MB), returning 4710 of 4713 items in one response |
| Orders `take:100` (control) | 200 in **37.3 seconds** for 2.4 MB (`totalCount: 8321`) — already a slow baseline worth noting |
| Orders `take:5000` | **`524` Cloudflare "A timeout occurred" after 125.0 seconds** |

The catalog case does eventually succeed rather than erroring — which is arguably a *stronger* no-cap signal than an outright failure: the server will happily assemble and return an unbounded 61 MB payload for one request with no complaint.

## Expected Result

A server-side maximum page size (e.g. 100–500 items) enforced regardless of the client-requested `take`, returning either a clamped result set or a `400` for an out-of-range request — never an unbounded multi-minute response.

## Root Cause Analysis

The `take`/`skip` pagination parameters on the shared search-criteria contract (`SearchCriteriaBase` or equivalent) have no upper-bound validation. This affects at least two modules (Catalog, Orders) via what is likely a shared base class, suggesting the fix belongs at the platform/shared-contract level rather than per-module.

## Severity

**P1** — an authenticated (not even elevated-privilege) caller can tie up backend/database/Elasticsearch resources for well over a minute with a single request; at scale this is a real availability/DoS-adjacent risk, and the Orders endpoint already demonstrates actual failure (Cloudflare `524`) under a moderate `take` value. The already-slow 37s baseline for `take:100` on Orders is a secondary performance concern worth its own investigation.

## Screenshots

N/A (API-only, no UI).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-platform (if `SearchCriteriaBase`/pagination is a shared platform contract) — confirm via source lookup; if not shared, `vc-module-catalog` + `vc-module-order` individually
- **repoKind:** platform (or module, multiple)
- **Ownership hint:** platform
- **Component / module:** Search-criteria pagination (`take`/`skip`) — Catalog indexed search, Orders search
- **RCA anchor:** not pinned — needs source lookup for the shared search-criteria base class
- **Routing confidence:** MEDIUM — confident this is a real defect and likely shared-contract in scope, needs source confirmation on exactly where the cap should live
