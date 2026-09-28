# Mind-map coverage backlog - nodes no suite case stamps (TM-014)

Date 2026-09-28. Scope: `loyalty-missions.mind-map.json` (loy), `search.mind-map.json` (srch).
Source of the list: `npm run models:check -- --json` (findings `TM-014`; the checker prints the count).
Triage rule: an existing case was stamped only where it decides the node itself. Parent nodes
whose only candidates already decide a more specific child were left open rather than double-stamped.
No new cases authored: authoring needs live grounding this session did not have.

Risk = highest priority tag among the node's `oracle_refs` in `business-logic.md`
(`[P0-revenue]`, `[P1-data]`, `[P2-ux]`); `none` = no BL ref, or an ECL-only ref (the edge-case library carries no priority tag).

## Ranked backlog

| # | Node | Kind | Risk | Status | Disposition |
|---|---|---|---|---|---|
| 1 | `loy.mission.progress.accrue.loyalty-currency-lines` | branch/negative | P0 (BL-LOY-017) | CONFIRMED | author case - `Backend/loyalty/075d-loyalty-missions.csv`. MSN-029 and MSN-E2E-007 are Deprecated (their premise was refuted), so the corrected expectation has no live case. Needs an order with a loyalty-currency line |
| 2 | `loy.mission.reward.grant.per-organization` | branch/state | P0 (BL-LOY-018, BL-LOY-020) | CONFIRMED | author case - `Backend/loyalty/075f-loyalty-organization-balance.csv` (needs the store-mode flip and a two-organization buyer). LOYORG-005 covers shared progress and LOYORG-E2E-007 covers points earning, neither the reward grant per organization |
| 3 | `srch.index.freshness` | behavior | P1 (BL-SRCH-003, BL-CAT-003) | CONFIRMED | author case - `Backend/search/061-search-indexing-admin.csv` or a cross-layer case in `Frontend/search/005-search-filters-advanced.csv`: catalog edit, then storefront result inside the consistency window. SRCHA-015/021 are TestRail-era, no window assertion |
| 4 | `srch.index.freshness.window-without-event-indexation` | branch/integration | P1 (BL-SRCH-003) | UNVERIFIED | needs live observation first (event-based indexation toggle), then `061-search-indexing-admin.csv` |
| 5 | `srch.scope.store` | behavior | P1 (BL-SRCH-004, BL-STORE-001) | CONFIRMED | author case - `Backend/graphql/050a-graphql-xcatalog.csv`: same query against two stores returns only each store's catalog. CAT-GQL-146 scopes barcode configuration, not catalog scope |
| 6 | `srch.results.facets.ghost-docs-inflate-counts` | branch/integration | P1 (BL-SRCH-001, BL-SRCH-003) | DRIFT | needs live observation first; resolve the DRIFT route before authoring. SRCH-NEW-039/103 check count vs cards, not stale documents of deleted products |
| 7 | `srch.query.keyword.mobile-overlay-named-controls` | branch/negative | P1 (BL-A11Y-002, BL-UI-006) | DRIFT | needs live observation first; then `Frontend/search/004-search-core.csv`. SRCH-NEW-026 checks the desktop bar only |
| 8 | `srch.barcode.config.keyboard-operable` | branch/negative | P1 (BL-A11Y-001) | DRIFT | needs live observation first; then `Backend/search/103-search-configuration-admin.csv` (Admin blade, keyboard walk) |
| 9 | `srch.barcode.scan.browse-named` | branch/negative | P1 (BL-A11Y-002) | DRIFT | needs live observation first; then `Frontend/search/004-search-core.csv` (scanner modal, camera-less run) |
| 10 | `srch.results.render.layout-stable` | branch/boundary | P2 (BL-UI-001) | DRIFT | needs live observation first; then `Frontend/search/005-search-filters-advanced.csv` (few-result and empty states) |
| 11 | `srch.barcode.resolve.value-rendered-literally` | branch/negative | P2 (BL-SRCH-005) | CONFIRMED | author case - `Frontend/search/004-search-core.csv`: markup in `?barcode=` shown as text in the heading. SRCH-NEW-020 covers `?q=` only |
| 12 | `loy.mission.author.delete-with-progress` | branch/negative | none | CONFIRMED | author case - `Backend/loyalty/075e-loyalty-missions-admin.csv` (delete a mission holding progress returns the FK 500). No case in the corpus deletes a mission |
| 13 | `loy.mission.archive` | behavior | none | CONFIRMED | author case - `Backend/loyalty/075e-loyalty-missions-admin.csv`: Published to Archived, then customer view drops it |
| 14 | `loy.mission.expire` | behavior | none | CONFIRMED | needs live observation first: the daily sweep is a background job; a trigger path (Hangfire) must be established. Then `Backend/loyalty/075d-loyalty-missions.csv` |
| 15 | `srch.results.facets.control-filters-persist` | branch/state | none (ECL-3.2) | CONFIRMED | author case - `Frontend/search/005-search-filters-advanced.csv`. SRCH-NEW-012/013 toggle the controls but never navigate away and back |
| 16 | `srch.barcode.fulltext.single-hit-lists` | branch/state | none | DRIFT | needs live observation first; resolve the DRIFT before authoring in `Frontend/search/004-search-core.csv` |
| 17 | `srch.barcode.scan.dispatch` | branch/happy | none | UNVERIFIED | needs live observation first (decoded scan needs a camera or fake-media device), then `Frontend/search/004-search-core.csv` |
| 18 | `srch.barcode.scan.not-in-history` | branch/state | none | UNVERIFIED | needs live observation first. SRCH-022 asserts the code is absent from history but navigates by URL, so it does not exercise a real scan; extend it once dispatch is observed |
| 19 | `srch.barcode.expand.barcode-field-is-facet` | branch/integration | none (ECL-3.2) | UNVERIFIED | needs live observation first, then `Backend/graphql/050a-graphql-xcatalog.csv` |
| 20 | `srch.barcode.expand.reserved-name` | branch/negative | none | UNVERIFIED | needs live observation first, then `Backend/graphql/050a-graphql-xcatalog.csv` |
| 21 | `srch.barcode.expand.second-term-literal` | branch/boundary | none | CONFIRMED | author case - `Backend/graphql/050a-graphql-xcatalog.csv` (two barcode terms; comma-separated values OR together) |
| 22 | `srch.barcode.expand.unpriced-not-found` | branch/negative | none | CONFIRMED | author case - `Backend/graphql/050a-graphql-xcatalog.csv` (fixture with no price in the active currency) |
| 23 | `srch.barcode.resolve.whitespace-value` | branch/boundary | none | CONFIRMED | author case - `Frontend/search/004-search-core.csv`. CAT-GQL-148 covers the xCatalog half, not the untrimmed storefront empty state |
| 24 | `srch.barcode.scan.no-camera-dead-end` | branch/negative | none | CONFIRMED | author case - `Frontend/search/004-search-core.csv` (headless run with no media device; assert the spinner and disabled upload, record as a known gap) |
| 25 | `srch.barcode.scan.button-visibility` | branch/state | none | CONFIRMED | author case - `Frontend/search/004-search-core.csv`. SRCH-016 asserts the button is absent when the scanner is off, not the empty-input swap with the clear button |
| 26 | `srch.barcode.config.set-exact` | branch/happy | none | CONFIRMED | author case - `Backend/search/103-search-configuration-admin.csv` (Admin blade: save Exact with fields, reopen with them checked first). SRCHA-052 covers order stability and save gating only |
| 27 | `srch.barcode.config.set-fulltext` | branch/state | none | CONFIRMED | author case - `Backend/search/103-search-configuration-admin.csv` |
| 28 | `srch.barcode.config.enable` | branch/state | none | CONFIRMED | author case - `Backend/search/103-search-configuration-admin.csv`; SRCH-016 covers only the disable half |
| 29 | `srch.barcode.settings.public.malformed-json` | branch/negative | none | CONFIRMED | author case - `Backend/search/103-search-configuration-admin.csv` (write a malformed field list through the generic settings API, then check storefront falls back to full-text) |
| 30 | `srch.index.manage.blue-green-swap` | branch/state | none | CONFIRMED | author case in canonical format. SRCHA-010/042 decide it but sit in legacy-format `061-search-indexing-admin.csv`; a stamp there is not counted by `models:check`, so migrate or re-author them |
| 31 | `srch.admin.facets` | behavior | none | CONFIRMED | same as row 30: SRCHA-047/048 decide it in legacy-format `061`; migrate or re-author |

## Parent behaviours left open on purpose

Their headline is decided only through children that already carry a stamp; stamping the same
case again with the parent adds a citation but no new decision. Cover them by covering the children above,
or revisit if a case is authored that decides the parent as a whole.

| Node | Kind | Risk | Status | Disposition |
|---|---|---|---|---|
| `srch.index.manage` | behavior | none | CONFIRMED | author case - `Backend/search/061-search-indexing-admin.csv` is a legacy TestRail-format suite (SRCHA-007/022 exist) whose rows the checker does not read for stamps; author in the canonical format, e.g. `Backend/search/103-search-configuration-admin.csv` |
| `srch.barcode.data.fill` | behavior | none | CONFIRMED | author case - `Backend/catalog/*` or `050a`: set a code on a product and on a variation, read it back. New feature, no case decides the data entry side |
| `srch.barcode.config` | behavior | none | CONFIRMED | out of scope as a separate case: its children (rows 26-29, plus the stamped `config.*` branches) decide it |
| `srch.barcode.settings.public` | behavior | none | CONFIRMED | out of scope as a separate case: decided through `malformed-json` (row 29) |
| `srch.barcode.scan` | behavior | none | CONFIRMED | out of scope as a separate case: decided through rows 17, 18, 24, 25 |
| `srch.barcode.expand` | behavior | none | CONFIRMED | out of scope as a separate case: nine stamped children in `050a` decide it |
| `srch.barcode.resolve` | behavior | none | CONFIRMED | out of scope as a separate case: stamped children in SRCH-014..023 decide it |

## Notes for the next pass

- Six of the DRIFT nodes (rows 6-10, 16) carry a route that is not yet a tracked owner (`TM-018`); file or route them before authoring, otherwise a new case would pin the current behaviour.
- All stamped rows kept their `Automation_Status`. No row was promoted; Draft rows remain Draft.
- Author every "author case" row through `tc:scaffold` and `append-test-cases-to-suite.ts --check-global-ids`, with the `Behavior:` stamp from the plan row.

## Barcode x catalog shape - proposed case matrix (2026-09-28, UPDATE on srch)

Why: the barcode branches were modelled against store settings only; one property shape (Product/ShortText) and one variation shape were seeded. The 18 new nodes sit under `srch.barcode.expand.shape-*` (+ `srch.barcode.config.shape-fields-offered-by-value-type`). Source: released `CatalogDocumentBuilder` / `ProductDocumentBuilder` (VirtoOZ source, master). The expansion (x-catalog#113) and fields endpoint (catalog#909) are open PRs the corpus does not hold and `kb ask` had no entry, so scan outcomes stay UNVERIFIED except two index-shape facts (CONFIRMED, DOC).

Classification tree (CT). Four axes, each leaf an equivalence class:
- **Product type**: Physical, Digital, BillOfMaterials, configurable. Indexing has no branch on it (only the parent's `type` collection for variations), so it collapses to one case per type.
- **Property value type** (index mapping): ShortText/Color (string, filterable), Number (Double), Integer (32-bit), Boolean (empty becomes false), DateTime, LongText/Html (searchable only, lowercased), GeoPoint (searchable only; excluded, no scan meaning).
- **Property level**: Product, Variation (propagates to the active parent), dynamic (separate index path, ShortText also to `__content`).
- **Multiplicity**: single, multivalue (collection), dictionary (alias indexed), multilanguage (base field plus `<name>_<lang>`).

Full cross 4x7x3x4 = 336. Invalid tuples removed (typed values are single only; dictionary/multivalue/multilanguage are ShortText only; dynamic has no multilanguage): about 90 valid. All-pairs needs at least 28 (7 types x 4 product types); product type is inert, so 4 type-cases plus 13 property-shape cases cover every pair that can differ: 17 cases below.

| # | Case (one scan unless stated) | Node (`srch.barcode.` prefix) | Suite | Data requirement (`data.srch.`) |
|---|---|---|---|---|
| C1 | GET fields lists which of the zoo properties (per type/level/multiplicity), compared with the index schema | config.shape-fields-offered-by-value-type | 103 | property.value-type-zoo |
| C2 | Number property configured, numeric scan finds its product | expand.shape-number-property | 050a | product.typed-property-values, store.barcode-typed-fields |
| C3 | Scan `0`+digits: hits ShortText product by string AND Number product by value (expect 2) | expand.shape-numeric-leading-zero | 050a | typed-property-values |
| C4 | Integer 2147483647 found; 13-digit EAN scan on an Integer field | expand.shape-integer-overflow | 050a | typed-property-values |
| C5 | Fields [gtin, integer, boolean, datetime], scan a GTIN: gtin hit still returned, no error | expand.shape-typed-field-non-matching-scan | 050a | typed-property-values |
| C6 | Boolean field, scan `false`: count equals products lacking a value | expand.shape-boolean-default-false | 050a | typed-property-values |
| C7 | Dictionary property: alias scan vs displayed-value scan | expand.shape-dictionary-alias | 050a | product.dictionary-multivalue-multilanguage-values |
| C8 | Multivalue: scan the second value | expand.shape-multivalue-property | 050a | same |
| C9 | Multilanguage: scan the language-2 value; try configuring `<name>_<lang>` | expand.shape-multilanguage-property | 050a | same |
| C10 | LongText mixed-case token scanned as stored and lowercased | expand.shape-longtext-property | 050a | typed-property-values |
| C11 | Variation-type property value: parent+variation (2) vs variation MPN (1); storefront lists, does not open | expand.shape-variation-property-double-hit | 050a, 004 | variation.variation-property-active-inactive |
| C12 | Deactivate the variation carrying V2: parent stops matching, variation doc stays | expand.shape-inactive-variation | 050a | same |
| C13 | Inactive product; active product under an inactive category | expand.shape-inactive-or-hidden-product | 050a, 004 | product.inactive-hidden |
| C14 | One scan per Physical/Digital/BOM/configurable; each found and opens its page | expand.shape-product-type | 050a, 004 | product.product-type-matrix |
| C15 | Same code in a hidden catalog (expect 1); product linked into 2 virtual categories (expect 1) | expand.shape-cross-catalog-duplicate-code, expand.shape-linked-category-single-hit | 050a | product.catalog-placement |
| C16 | Product and variation share a GTIN: 2 hits, list | expand.shape-product-and-variation-share-value | 004 | variation.variation-property-active-inactive |
| C17 | Dynamic ShortText property: is it offered, does its value match | expand.shape-dynamic-property | 050a, 103 | product.dynamic-property-value |

Seeder gap: `seed:barcode` (`scripts/seed-data/catalog/barcode-specs.mjs`) defines only two Product/ShortText properties, one parent with two variations, no inactive/hidden product, no second catalog or link, no dynamic property, no multilanguage catalog. The nine new requirements are `CREATE` with `executor: case` and `UNVERIFIED`; extending the spec module is the prerequisite for C2-C17. No CSV case was added.

Possible product defects to verify (not filed): (a) an empty Boolean property is indexed under `property.Name` unlowered while every other typed value uses the lowercased name, so a mixed-case boolean may split into two fields; (b) one typed field in the OR expansion may turn a valid text scan into a provider error (C5); (c) PR909 wording says short-text only while the index schema also declares numeric/boolean/date fields filterable, so the fields list and the dedicated-PUT validator may disagree with the generic write path (D3).
