# Catalog search: unvalidated `skip`/`take` reach Elasticsearch unguarded — 500s leak the index name

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a-vcst-5618-e27ac905`

## Summary

`POST /api/catalog/search/products` passes `skip`/`take` straight through to Elasticsearch with no validation or clamping. Three distinct malformed-input shapes all produce `500` responses — two of which leak the live Elasticsearch index name in the error body, and one of which is an unhandled `NullReferenceException` on non-numeric input. Confirmed independently by Application Insights (`CatalogModuleIndexedSearch/SearchProducts` 500×7 in the test window).

## Steps to Reproduce

```
POST {{BACK_URL}}/api/catalog/search/products
Content-Type: application/json

{"skip":-1,"take":10}
{"skip":999999,"take":10}
{"skip":"abc","take":"xyz"}
```

## Actual Result

| Input | Status | Body |
|---|---|---|
| `{"skip":-1,"take":10}` | **500** | `"Request failed to execute. Call: Status code 400 from: POST /vcst-qa-platformvcst-product-active/_search. ServerError: Type: illegal_argument_exception Reason: \"[from] parameter cannot be negative but was [-1]\""` — **leaks ES index name** `vcst-qa-platformvcst-product-active` |
| `{"skip":999999,"take":10}` | **500** | `"... search_phase_execution_exception Reason: \"all shards failed\" CausedBy: ... \"Result window is too large, from + size must be less than or equal to: [10000] but was [1000009]. ... [index.max_result_window] index level setting.\""` — same index name leaked, plus internal ES tuning parameter names |
| `{"skip":"abc","take":"xyz"}` | **500** | `{"message":"Object reference not set to an instance of an object.","stackTrace":null}` — unhandled NRE, no model-binding `400` |
| `{"skip":0,"take":10}` (control) | 200 | `totalCount: 4713` — confirms the endpoint itself works correctly for valid input |

All three confirmed live and independently corroborated by Application Insights server-side exception telemetry in the same time window.

## Expected Result

- Negative or out-of-range `skip`/`take` → `400 Bad Request` with a clean validation message, or silently clamp to a safe range.
- Non-numeric `skip`/`take` → `400 Bad Request` (model-binding validation error), never an unhandled NRE.
- No internal infrastructure detail (Elasticsearch index name, ES tuning parameters) ever reaches the HTTP response body.

## Root Cause Analysis

No input validation exists on the search-criteria binding before the query is dispatched to Elasticsearch. The `skip`/`take` values flow unchecked into the ES `from`/`size` query parameters; ES's own error responses (which legitimately include the index name in their error text) are then relayed to the client verbatim instead of being caught and mapped to a sanitized `400`.

## Severity

**P1** — combines an information-disclosure defect (ES index name + internal settings names) with an availability concern (the deep-pagination case exercises `index.max_result_window`, and see the companion "no max page size" bug for the related resource-exhaustion angle on valid-but-huge `take` values).

## Screenshots

N/A (API-only, no UI).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST / xAPI-adjacent search
- **Suggested repo:** VirtoCommerce/vc-module-catalog (indexed search implementation) — possibly `vc-module-search`/`vc-module-elastic-search` if the ES query-building lives there
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** `CatalogModuleIndexedSearch/SearchProducts`
- **RCA anchor:** not pinned — needs source lookup for the search-criteria validation / ES client error-wrapping layer
- **Routing confidence:** MEDIUM — confident on the module (`vc-module-catalog`'s indexed search), less confident on the exact file without a source-code lookup
