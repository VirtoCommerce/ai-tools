# Barcode exact match treats `*` and `?` as wildcards; a partial code opens a product `[Medium]`

## Status: FILED — VCST-6094 (Subtask of VCST-2945)

**Severity:** Medium (P2) · **Related:** VCST-2945 (in scope — new code path)
**Env:** vcst-qa · Catalog 3.1046.0-pr-909-2839 · XCatalog 3.1022.0-pr-113-f4a8 · theme 2.59.0-pr-2501-7e0c · Platform 3.1073.0-pr-3121-9965 · Elasticsearch 8

## Summary

In Exact mode the scanned value is expected to equal a stored identifier ("Matching is exact: the scanned value must equal the stored value"). Instead, a value containing `*` or `?` is run as a wildcard query: `*` alone matches every product that has the field, and a truncated code followed by `*` (or with one digit replaced by `?`) matches the full product. Because the storefront opens the product page on a single hit, a partial or wildcarded scan lands the shopper on a PDP whose code they never scanned.

## Steps to Reproduce

Preconditions: admin token (`{{ADMIN}}` / `{{ADMIN_PASSWORD}}`); `@td(BARCODE_STORE.id)` seeded (`npm run seed:barcode`).

1. Configure Exact mode on gtin:
   `PUT {{BACK_URL}}/api/catalog/barcode-search/store/@td(BARCODE_STORE.id)` body `{"scannerEnabled":true,"fields":["gtin"]}`
2. `POST {{BACK_URL}}/graphql` (anonymous is enough):
   `products(storeId:"@td(BARCODE_STORE.id)", currencyCode:"USD", filter:"barcode:\"<V>\"") { totalCount }`
   with `<V>` = each of:
   - `*`
   - first 12 digits of `@td(BARCODE_GTIN_UNIQUE.gtin)` + `*`
   - first 12 digits of `@td(BARCODE_GTIN_UNIQUE.gtin)` + `?`
3. Storefront: set the same fields on the storefront's store (Admin → Stores → store → Search configuration → Barcode scanner → Exact match → GTIN → Save), then open
   `{{FRONT_URL}}/search?barcode=<first 10 digits of @td(BARCODE_GTIN_UNIQUE.gtin)>*`
4. Restore both stores to `{"scannerEnabled":true,"fields":[]}`.

## Expected vs Actual

| Scan value | Expected | Actual |
|---|---|---|
| full GTIN | 1 | 1 |
| `*` | 0 | **258** (fields [gtin], category-scoped, CAT-GQL-150); **4 714** with fields [code] |
| 12-digit prefix + `*` | 0 | **1** |
| 12-digit prefix + `?` | 0 | **1** |
| strict prefix, no wildcard | 0 | 0 |
| storefront `?barcode=<10 digits>*` | "No products found for barcode …" | **redirects to the `@td(BARCODE_GTIN_UNIQUE.sku)` PDP**; `?barcode=*` lists 3 722 products |

No `errors[]`; every response is HTTP 200.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL (inherits L3) | HAR `VCST-2945-4a-frontend-2026-09-28.har` (requests `barcode=2945100000*`, `barcode=2945%3F00000018`, `barcode=*`) |
| 2. Admin | N/A | config is saved correctly |
| 3. xAPI | **FAIL** | `reports/regression/REG-2026-09-28-1518/graphql-evidence/CAT-GQL-150-1790610049021.json`; re-checked 2026-09-28: generic `gtin:"<prefix>*"` → 1, `gtin:"*"` → 313, strict prefix → 0 |
| 4. REST | N/A | expansion happens in xAPI |

**Owning layer:** Layer 3 — xAPI.

## Root Cause Analysis

`EvalBarcodeFilterMiddleware.ExpandBarcodeFilter` builds `new TermFilter { FieldName = x, Values = values }` from the raw scanned value (`EvalBarcodeFilterMiddleware.cs:56`). Elasticsearch 8's `ElasticSearchFiltersBuilder.HasWildcardValue` turns any term value containing `*` or `?` into a `WildcardQuery` (`ElasticSearchFiltersBuilder.cs:33`, `:80-83`). The theme cannot prevent this: `escapeFilterSyntaxValue` (`client-app/core/utilities/search/facets.ts:25`) escapes only `\` and `"`, and the filter-syntax grammar allows only `\" \\ \r \n \t` as escapes, so there is no filter-syntax way to send a literal `*`.

Oracles: PR #113 description — "values are compared exactly as term filters"; the blade hint "Matching is exact: the scanned value must equal the stored value"; BL-SRCH-005.

## Open question for the PR author

The VirtoOZ filter-syntax docs ("Wildcard search", `docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/Catalog/examples/filter-syntax`) document `*` and `?` as wildcards in term filters in general. VCST-3840 / VCST-3873 added wildcard matching on purpose. So the question is scoped to the barcode path only: should it escape or neutralise `*` and `?` to keep its exact-identity contract?

**Recommended:** yes. Neutralise them in the barcode middleware and leave the generic filter behaviour unchanged. Realistic scan inputs contain `?`: a QR code that encodes a URL (`https://…/p?id=…`) is a normal payload, and on the current build it would run as a wildcard.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-x-catalog (PR #113, branch `feat/VCST-2945-barcode-search-setup`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xCatalog — `EvalBarcodeFilterMiddleware` (barcode term expansion)
- **RCA anchor:** `src/VirtoCommerce.XCatalog.Data/Middlewares/EvalBarcodeFilterMiddleware.cs` `ExpandBarcodeFilter` (line 56); downstream trigger `vc-module-elastic-search-8` `ElasticSearchFiltersBuilder.HasWildcardValue`
- **Routing confidence:** MEDIUM. The fix belongs in the middleware, but `TermFilter` has no "literal" flag, so a provider-agnostic escape may need either a provider-aware value or a second repo (the ES8 builder). Confirm the product decision in the open question first.

Found by: /qa-test VCST-2945 (2026-09-28)
