# Barcode Search — Developer Guide

The storefront's barcode scanner submits a scanned code as one virtual xAPI filter term,
`barcode:"<value>"`. When a store has configured barcode matching (Admin → Store → Search
configuration → Barcode scanner), the term is expanded server-side into an exact-match filter on the
store's chosen index fields; when it hasn't, the term is left as a literal (normally no hits).

## Prerequisites

- A `VirtoCommerce.Catalog` version that includes barcode search (introduces `IBarcodeSearchConfigurationService` and the
  `Catalog.Search.BarcodeScannerEnabled` / `Catalog.Search.BarcodeSearchFields` store settings)
- A `VirtoCommerce.XCatalog` version that includes barcode search (introduces the `barcode:` term expansion)
- A store with at least one field configured (see the admin guide) — otherwise the term matches
  nothing

## Quick Start

### Step 1: Confirm the store's configured fields

```graphql
query StoreBarcodeSettings {
  store(storeId: "{{STORE_ID}}") {
    settings {
      modules
    }
  }
}
```

`settings.modules["VirtoCommerce.Catalog"]` carries both `BarcodeScannerEnabled` and
`BarcodeSearchFields` — these are public store settings, readable without authentication.

### Step 2: Query with the barcode term

```graphql
query FindByBarcode {
  products(storeId: "{{STORE_ID}}", filter: "barcode:\"<scanned-value>\"") {
    totalCount
    items {
      id
      name
    }
    filters {
      name
      value
      isGenerated
    }
  }
}
```

`POST {{BACK_URL}}/graphql`

## What happens server-side

| Configured `fields` | Behavior |
|---|---|
| none / missing | the `barcode:` term is left untouched — it filters a field literally named `barcode`, so it normally returns 0 |
| one field, e.g. `["gtin"]` | replaced with `gtin:"<value>"` |
| several fields, e.g. `["gtin","code"]` | replaced with an OR across all of them — a match on any one field counts |
| — | the default document scope (`is:product`) is widened to `is:product,variation`, so a code that only exists on a variation is still found, unless the caller sent an explicit `is:` term |
| — | every expanded field is reported in the response `filters[]` with `isGenerated: true`, and the original `barcode` term is removed from the reported user filters — so a storefront can drop it from its filter chips |
| — | the same expansion is applied inside facet aggregations, so facet counts stay consistent with the filtered result |

!!! note
    `*` and `?` inside a barcode value act as wildcards (they are not matched as literal characters), so
    do not rely on a value containing them being compared character-for-character.

A scanned value matches **regardless of letter case on Elasticsearch** (letter case follows the search
provider's own term comparison; the Lucene provider was not verified).

## Error handling

- An empty or whitespace-only value is a no-op — no error, no match.
- Values containing quotes or colons are escaped safely as a single filter term (no `errors[]`, no
  500).
- A very long (600-character) value does not raise a server error.
- `errors[]` is returned **inside** the HTTP 200 body — a 200 status alone does not mean the query
  succeeded; always check `errors[]`.

## REST endpoints (Admin SPA surface)

| Method + route | Permission | Purpose |
|---|---|---|
| `GET api/catalog/barcode-search/store/{storeId}` | `catalog:BrowseFilters:Read` | current settings; a store with nothing stored returns the defaults `{"scannerEnabled":true,"fields":[]}` |
| `GET api/catalog/barcode-search/store/{storeId}/fields` | `catalog:BrowseFilters:Read` | the selectable field list: the built-in `code`, `gtin`, `manufacturerPartNumber`, then lowercased short-text product/variation properties available as filterable string fields |
| `PUT api/catalog/barcode-search/store/{storeId}` | `catalog:BrowseFilters:Update` | saves; unknown field names return `400` naming them; a null body returns `400`; an unknown store returns `404`; success returns `204` |

```bash
curl -X GET "{{BACK_URL}}/api/catalog/barcode-search/store/{{STORE_ID}}" \
  -H "Authorization: Bearer {{ACCESS_TOKEN}}"
```

## Conclusion

The `barcode:` filter term is additive and backward-compatible: a store that has not configured any
fields sees no change in `products(filter:)` behavior. Configuring fields through the Admin SPA (or the
dedicated REST endpoint) is the only supported write path — writing the same settings through the
generic `PUT /api/stores/{id}` endpoint is not validated against the index schema and is not
recommended for this purpose.

---
*Sources: this run's own evidence (`reports/tickets/Sprint26-19/VCST-2945/`, `scripts/.graphql-evidence/`
runs); `.claude/knowledge/api/graphql-schema.md` (`products(filter, facet, sort, …)` signature confirmed
unchanged — the barcode term is a virtual filter string, not a new schema field); PlatformDeveloperGuide
consulted for terminology.*
