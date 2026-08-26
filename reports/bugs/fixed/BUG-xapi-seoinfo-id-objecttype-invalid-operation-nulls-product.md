# xAPI `product.seoInfo.id`/`objectType` throw INVALID_OPERATION and null the whole product `[P2]` `[BL-GQL-003]`

## Status: CONFIRMED

**Env:** vcst-qa @ Platform 3.1057.0-pr-3095-…, XCatalog 3.1016.0-pr-106-3559 (pre-existing — reproduces on baseline XCatalog 3.1015.0 too; unrelated to the VCST-5637 dedup change deployed alongside)
**Case:** CAT-GQL-113 (suite `050a-graphql-xcatalog.csv`), surfaced during the VCST-5637 change-scoped regression + `/qa-triage-results` on 2026-08-05.

## Summary
Querying `product(id, storeId, currencyCode) { seoInfo { id objectType } }` returns HTTP 200 with `data.product = null` and two GraphQL `errors[]` entries — `INVALID_OPERATION` on both `seoInfo.id` and `seoInfo.objectType`. Every other requested field on `product` (20+ scalar/object fields including `seoInfo.semanticUrl`) resolves fine in the same request; only those two `SeoInfo` sub-fields fault, and because the query has no field-level error tolerance, the fault nulls the entire `product` object rather than just `seoInfo.id`/`objectType`.

## Steps to Reproduce
1. POST to `{{BACK_URL}}/graphql`:
   ```graphql
   query {
     product(id: "<any product id>" storeId: "B2B-store" currencyCode: "USD") {
       id name
       seoInfo { id semanticUrl objectType }
     }
   }
   ```
2. Observe the response.

## Expected vs Actual
- **Expected:** `seoInfo.id` and `seoInfo.objectType` are declared nullable `String` in the schema and resolve (possibly to `null` if genuinely absent) without faulting the parent `product`.
- **Actual:** HTTP 200, `data.product: null`, `errors[]`:
  ```json
  [
    {"message":"Error trying to resolve field 'id'.","path":["product","seoInfo","id"],"extensions":{"code":"INVALID_OPERATION"}},
    {"message":"Error trying to resolve field 'objectType'.","path":["product","seoInfo","objectType"],"extensions":{"code":"INVALID_OPERATION"}}
  ]
  ```
  `seoInfo.semanticUrl` and 9 other `SeoInfo` fields resolve correctly in the same isolation probe; only `id`/`objectType` (and, by the same probe pattern, `objectId`) fault.

## Impact
Any storefront/consumer query selecting `seoInfo.id`, `seoInfo.objectId`, or `seoInfo.objectType` anywhere loses the **entire** product payload, not just the one field — a schema-valid query fails at runtime with no server error surfaced beyond `errors[]`. P2: degraded (a specific field-selection breaks an otherwise-correct query), not P0/P1 (no revenue-flow block found — the affected fields aren't in the storefront's default PDP/PLP selection sets exercised elsewhere in this suite).

## Root cause (hypothesis)
The `SeoInfo` GraphQL type's `id`/`objectId`/`objectType` resolvers likely read from a source object that doesn't carry those properties on the `product` resolution path (they may be populated only when `SeoInfo` is loaded via its own dedicated query, not as a nested field off `Product`), throwing rather than returning null. Needs a source-level look at the `SeoInfo` GraphQL type resolver in `vc-module-x-catalog`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI (GraphQL resolver)
- **Suggested repo:** `VirtoCommerce/vc-module-x-catalog`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xCatalog — `SeoInfo` GraphQL type resolver (`id`/`objectId`/`objectType` fields), reached via `Query.product`
- **RCA anchor:** GraphQL error `path: ["product","seoInfo","id"]`, `extensions.code: INVALID_OPERATION` — search `vc-module-x-catalog` for the `SeoInfo` GraphQL type definition and its `id`/`objectId`/`objectType` field resolvers
- **Routing confidence:** MEDIUM — layer/repo is clear (xCatalog owns `Product.seoInfo`); exact resolver method not yet located via `search_code`

## Resolution
- **Fixed in:** `VirtoCommerce.XCatalog` **3.1018.0** (live on vcst-qa; the draft reproduced on `3.1016.0-pr-106-3559` and on baseline `3.1015.0`). No tracker item was ever filed for this draft — it is resolved upstream incidentally, so **no ticket is needed**.
- **Verified:** 2026-08-26, backlog-triage re-verification (GraphQL probe, no browser). The exact STR query now returns HTTP 200 with a fully-populated product and **no `errors[]`**:

  ```
  query{ product(id:"08c33cfc9f664426a52fac8882da2df0" storeId:"B2B-store" currencyCode:"USD"){
    id seoInfo{ id objectId objectType semanticUrl } } }
  →  {"data":{"product":{"id":"08c33cfc9f664426a52fac8882da2df0","seoInfo":{
       "id":"b26486578b1c4caf8603f53877848576",
       "objectId":"08c33cfc9f664426a52fac8882da2df0",
       "objectType":"CatalogProduct",
       "semanticUrl":"canon-imageclass-wifi-mf232w-…"}}}}
  ```

  All three previously-faulting fields (`id`, `objectId`, `objectType`) resolve; `data.product` is no longer nulled.
- **Method:** admin-token GraphQL POST to `{{BACK_URL}}/graphql`, product id resolved live (no hardcoded id). Control query (`seoInfo{semanticUrl}` only) also green, as before.
- **Follow-up:** suite case **CAT-GQL-113** (`050a-graphql-xcatalog.csv`) was failing on this defect and should now pass — worth re-running to confirm the case itself is not also stale.
