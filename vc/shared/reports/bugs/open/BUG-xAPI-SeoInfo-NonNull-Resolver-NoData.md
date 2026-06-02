# BUG — xAPI `Product.seoInfo.{id, objectId, objectType}` returns INVALID_OPERATION when product has no CatalogSeoInfo record, collapsing entire `data.product` to null

## Status: CONFIRMED

## Summary

Calling the xAPI `product()` query with `seoInfo { id }`, `seoInfo { objectId }`, or `seoInfo { objectType }` in the selection set throws `INVALID_OPERATION` at the resolver level whenever the underlying product has no `CatalogSeoInfo` row in the database. Because all three fields are declared `String!` (NON_NULL) in the xAPI schema, the null bubbles up the response chain and collapses the entire `data.product` payload to `null` — even for fields that resolved successfully.

**Discovered by:** regression run REG-2026-05-20-1248, test case **CAT-GQL-113** (suite `050a-graphql-xcatalog`, "xCatalog — Product Full-Field Schema Coverage"). Pass rate dropped from 100% (last verified 2026-05-18, runner-native gold-standard reference) to 96.8% (30/31) on this run, with CAT-GQL-113 the sole new failure.

## Severity / Priority

| Field | Value |
|---|---|
| Severity | **High** |
| Priority | High |
| Type | Regression — schema contract violation |
| Component | `VirtoCommerce.Xapi` (the xAPI module servicing `/graphql`) |
| Affects version | `VirtoCommerce.Xapi 3.1008.0` (deployed today 2026-05-20 on vcst-qa) |
| Last-known-good | `VirtoCommerce.Xapi 3.1007.0` (deployed 2026-05-19 — REG-2026-05-19-1400 had 050a at 100%) |

**User-impact justification (High, not Critical):**
- Affects any storefront/admin/SDK client that selects `seoInfo.id`, `seoInfo.objectId`, or `seoInfo.objectType` on the `Product` xAPI type.
- Triggers only for products without `CatalogSeoInfo` rows — but those products are silently common in B2B catalogs (e.g., bulk-imported AliExpress-style products without explicit SEO tuning).
- When triggered, the *entire* `data.product` collapses to `null` — not just the seoInfo block — because the broken fields are NON_NULL. Storefront product detail pages, admin product detail panels, and any tooling consuming `product()` will render as "not found" instead of degrading gracefully.
- vc-frontend may or may not select these specific fields — needs confirmation (see "Frontend impact check" below). Even if vc-frontend's current queries don't select these fields, the schema contract is broken and any client adding them would fail.

## Reproduction

### Pre-conditions
- vcst-qa environment (platform 3.1028.0, xAPI 3.1008.0, theme 2.49.0).
- Any product in the storefront's default `products()` listing that has no `CatalogSeoInfo` row in `dbo.CatalogSeoInfo` — verified empty via `GET /api/catalog/products/{id}?respGroup=ItemSeo` → `seoInfos: []`.

### Steps to reproduce (deterministic)

```bash
npx tsx scripts/graphql-runner.ts \
  --case "regression/suites/Backend/graphql/050a-graphql-xcatalog.csv:CAT-GQL-113" \
  --refresh-schema \
  --evidence-dir reports/regression/REG-2026-05-20-1248/graphql-evidence
```

Verdict: **FAIL (0/6 assertions passed)**. Re-run 3 times in this session (12:48 UTC, 13:35 UTC, 13:58 UTC) — deterministic failure.

### Minimal ad-hoc repro (GraphQL only)

```graphql
query {
  product(
    id: "454eaffa-b975-4f6c-b0e5-f581a16bbe1d"   # any product with no CatalogSeoInfo row
    storeId: "B2B-store"
    cultureName: "en-US"
    currencyCode: "USD"
    userId: "00000000-0000-0000-0000-000000000000"
  ) {
    id
    name
    seoInfo { id objectType }
  }
}
```

### Expected response

```json
{
  "data": {
    "product": {
      "id": "454eaffa-b975-4f6c-b0e5-f581a16bbe1d",
      "name": "ASTRAL CHAIN Nintendo Switch Game Deals…",
      "seoInfo": {
        "id": "",                       // synthesized (empty string is fine for non-null), or
        "objectType": "CatalogProduct"  // synthesized from product type
      }
    }
  }
}
```

### Actual response

```json
{
  "errors": [
    { "message": "Error trying to resolve field 'id'.", "path": ["product","seoInfo","id"], "extensions": { "code": "INVALID_OPERATION" } },
    { "message": "Error trying to resolve field 'objectType'.", "path": ["product","seoInfo","objectType"], "extensions": { "code": "INVALID_OPERATION" } }
  ],
  "data": {
    "product": null
  }
}
```

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend (vc-frontend) | **N/A — needs confirmation** | vc-frontend selectors must be audited to know if storefront PDP queries select these fields. Likely PASS today (storefront PDP query probably doesn't request `seoInfo.id`), but contract is broken. |
| 2. Backend Admin (Admin SPA) | **PASS** | Admin SPA reads catalog via Platform REST, not xAPI — see Layer 4. |
| 3. GraphQL xAPI (`/graphql`) | **FAIL** | Owning layer. `seoInfo.{id,objectId,objectType}` resolver throws INVALID_OPERATION for products without `CatalogSeoInfo` rows. Evidence: `reports/regression/REG-2026-05-20-1248/graphql-evidence/CAT-GQL-113-1779284289487.json` (and 2 prior evidence files in same dir). |
| 4. Platform REST API (`/api/catalog/products/{id}`) | **PASS** | `?respGroup=ItemSeo` returns `seoInfos: []` cleanly. The DB state (no SEO row) is the same data state both layers observe — REST simply returns the empty array; xAPI throws instead of synthesizing. |

**Owning layer:** Layer 3 (`VirtoCommerce.Xapi 3.1008.0`).

## Per-field probe (key for triage)

The bug is precisely scoped to 3 of the 13 `SeoInfo` fields. The other 10 resolve correctly even for products without `CatalogSeoInfo` rows — confirming xAPI **does** synthesize fallback values for some fields, just not for these three.

Probe was run on product `454eaffa-b975-4f6c-b0e5-f581a16bbe1d` (no CatalogSeoInfo row):

| Field | Schema | Resolver outcome |
|---|---|---|
| `id` | `String!` | ❌ INVALID_OPERATION |
| `objectId` | `String!` | ❌ INVALID_OPERATION |
| `objectType` | `String!` | ❌ INVALID_OPERATION |
| `name` | `String` | ✅ Returns product's name (synthesized fallback) |
| `semanticUrl` | `String` | ✅ Returns product's GUID (synthesized fallback) |
| `outline` | `String` | ✅ Returns `null` (acceptable — nullable) |
| `pageTitle`, `metaDescription`, `imageAltDescription`, `metaKeywords`, `storeId` | `String` | ✅ Return `null` (nullable, accepted) |
| `languageCode` | `String` | ✅ Returns culture (`en-US`) |
| `isActive` | `Boolean` | ✅ Returns `true` |

**Cross-check — same query on a product *with* a CatalogSeoInfo row** (`0b6297e8-d100-4419-ac54-8bf240777271`, Animal Crossing — has real slug):

```json
{
  "seoInfo": {
    "id": "49c1b977-6cc6-413f-9022-1ffae7328cc5",     // ✅ real
    "objectId": "0b6297e8-d100-4419-ac54-8bf240777271", // ✅ real
    "objectType": "CatalogProduct",                    // ✅ real
    "name": null,
    "semanticUrl": "animal-crossing-new-orizons-nintendo-ALCE0128",
    "pageTitle": "Animal Crossing Nintendo Switch Game"
  }
}
```

So the resolver works fine **when a CatalogSeoInfo row exists**. It only throws when the row is absent.

## Module versions (deploy state captured live 2026-05-20T12:55Z)

| Component | Version | Δ from prior cache (2026-05-19) |
|---|---|---|
| Platform | **3.1028.0** | ↑ from 3.1026.0 |
| Theme | **vc-theme-b2b-vue-2.49.0 (GA)** | ↑ from `2.49.0-pr-2292-f131d346` |
| **VirtoCommerce.Xapi** | **3.1008.0** | **↑ from 3.1007.0 — suspected owner of regression** |
| VirtoCommerce.XCart | 3.1015.0-pr-119-6a09 (preview) | ↑ from 3.1013.0 |
| VirtoCommerce.XCatalog | 3.1005.0 | unchanged |
| VirtoCommerce.Catalog | 3.1022.0 | unchanged |
| VirtoCommerce.ProfileExperienceApiModule | 3.1007.0 | ↑ from 3.1006.0 |
| VirtoCommerce.Notifications | 3.1006.0 | ↑ from 3.1005.0 |
| VirtoCommerce.AzureBlobAssets | 3.1003.0 | ↑ from 3.1002.0 |

Full deploy state: `reports/deploy-state-cache.json` (captured 2026-05-20T12:55Z).

## Root Cause Analysis

**Suspect module:** `VirtoCommerce.Xapi 3.1008.0` (bumped today from 3.1007.0). xAPI owns the `Product.seoInfo` resolver chain.

**Likely defect class:** Resolver no longer handles the "no CatalogSeoInfo row" branch for `id`, `objectId`, `objectType`. Working hypothesis: a refactor in xAPI 3.1008.0 changed `SeoInfoType` resolvers from "synthesize from product context if no entity" to "read entity property directly" — when the entity is `null` (no row), the property access throws and emerges as `INVALID_OPERATION`. The other 10 fields preserved their synthesis branch.

**Recommended fix paths (for the xAPI team):**
1. **Synthesize fallback values** for the 3 identity fields when no `CatalogSeoInfo` row exists:
   - `id` → empty string `""` (or a deterministic synthetic like `"synthetic-{productId}-{cultureName}"`)
   - `objectId` → the product's `id`
   - `objectType` → the literal `"CatalogProduct"` (or `"CatalogCategory"` etc. depending on owning type)
2. **Or** change schema to make these fields nullable (`String` instead of `String!`) and document that they're populated only when an explicit SEO record exists. *(This is the contract-loosening option; preferable to leave the contract as-is and fix the resolver.)*

Option 1 is preferred because the contract `String!` is already in use by clients and changing schema would break consumers expecting non-null values.

**Where to look (xAPI codebase, hint):** The likely files are in `vc-module-x-catalog/src/.../Schemas/SeoInfoType.cs` or `vc-module-xapi-platform/src/.../Schemas/SeoInfo*.cs` (the GraphQL types that map `CatalogSeoInfo` → `SeoInfoType`). Compare `3.1007.0` vs `3.1008.0` for any change to `Field(x => x.Id)`, `Field(x => x.ObjectId)`, `Field(x => x.ObjectType)` resolver definitions.

## Frontend impact check (TODO before closing)

Run this in vc-frontend to confirm storefront safety:

```bash
# In vc-frontend repo
grep -rE 'seoInfo\s*\{[^}]*(id|objectId|objectType)' client-app graphql
```

If any storefront query selects these fields, **the storefront product detail page is currently broken for products without CatalogSeoInfo rows** — escalate to Critical. If not, severity stays at High (schema-contract bug, not user-visible regression yet).

## Suggested STR for the fix-side regression test

When the xAPI fix lands, the existing CAT-GQL-113 (suite 050a, line ~339 in CSV) is the right gate — it picks `products.items.0` which (deterministically) lands on a no-SEO product in the default order. Re-run:

```bash
npx tsx scripts/graphql-runner.ts \
  --case "regression/suites/Backend/graphql/050a-graphql-xcatalog.csv:CAT-GQL-113" \
  --refresh-schema
```

Expected post-fix: **PASS (6/6)**.

## Evidence Files

- Runner JSON evidence (3 runs in this session):
  - `reports/regression/REG-2026-05-20-1248/graphql-evidence/CAT-GQL-113-1779281603367.json` (initial run during regression)
  - `reports/regression/REG-2026-05-20-1248/graphql-evidence/CAT-GQL-113-1779281701568.json` (first re-run with --refresh-schema)
  - `reports/regression/REG-2026-05-20-1248/graphql-evidence/CAT-GQL-113-1779284289487.json` (final re-run with --refresh-schema)
- Regression report: `reports/regression/REG-2026-05-20-1248/regression-2026-05-20.md`
- Deploy state cache: `reports/deploy-state-cache.json`

## References

- Test case: `regression/suites/Backend/graphql/050a-graphql-xcatalog.csv:CAT-GQL-113`
- Module: [VirtoCommerce/vc-module-xapi-platform](https://github.com/VirtoCommerce/vc-module-xapi-platform) (assumed)
- Schema source: `.claude/agents/knowledge/graphql-schema.md` (current snapshot shows `SeoInfo.id`, `SeoInfo.objectId`, `SeoInfo.objectType` all as `String!`)
- Memory: `feedback_use_canonical_graphql_runner` — bug confirmed via canonical runner, not custom script
