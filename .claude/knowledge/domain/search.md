---
domain_slug: srch
applicability: universal
rationale: |
  What the Search domain IS on the storefront (keyword search bar, suggestions/hints, results page with
  facets/sorting/paging/empty-state), in the Admin SPA (Search → Index management; Store → Search
  configuration → Facets/Sorting/Barcode scanner), and on the xCatalog GraphQL contract (`products`,
  `categories`, `properties` with `filter`/`facet`/`sort`) — its actors, its value chain, the surface
  inventory per layer, where the layers DISAGREE, and the shape of existing QA coverage. Built now
  because VCST-2945 ("Bar Code Scanner Ready Product Properties") lands a store-level configuration
  layer (`Catalog.Search.BarcodeScannerEnabled` / `Catalog.Search.BarcodeSearchFields`) on top of the
  existing barcode-scan button (VCST-2622) and the domain had no map at all — zero prior BA analysis or
  test model for search/barcode (`reports/ba/**` glob returned nothing for either term).
generated: 2026-09-28
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/** — glob for "search" and "barcode": NO prior BA analysis, NO prior test model. This is
    the first written enumeration of this domain.
  - .claude/knowledge/domain/catalog.md (reference-applicability, xCatalog `products`/`properties` query
    shapes, filter syntax) and .claude/knowledge/domain/store-settings.md (Public Store Settings
    mechanism, capability manifest) — cited, not restated
  - .claude/knowledge/domain/sitemap.md §6/§11 — storefront search URL + barcode-scan icon location,
    confirmed live this pass
  - .claude/knowledge/oracles/business-logic.md — BL-SRCH-001..005, BL-CAT-001..012, BL-STORE-001 (read
    for orientation, cited not restated)
  - .claude/knowledge/oracles/e-commerce-edge-cases-library.md — `--domain srch` matched **zero**
    sections. Not absent from the library by omission; genuinely unfiled.
  - GET /api/platform/modules (context-free admin token), 2026-09-28 — deployed versions below
  - vc-module-catalog PR #909 (open, unmerged), vc-module-x-catalog PR #113 (open, unmerged),
    vc-frontend PR #2501 (open, unmerged) — all three read in full via GitHub MCP this pass; all three
    DEPLOYED as PR builds on the environment this map describes (see the MID-CHANGE call-out below)
  - live enumeration on vcst-qa (storefront desktop 1920x1080 + mobile 375px, anonymous + signed-in B2B,
    Admin SPA Store → Search configuration), 2026-09-28, playwright-chrome
  - live REST probe (read-only): `GET /api/catalog/barcode-search/store/B2B-store` +
    `.../store/B2B-store/fields`, 2026-09-28
  - .claude/knowledge/api/graphql-schema.md, refreshed **2026-09-28** (this run) — `products(filter,
    facet, sort, …)` signature confirmed unchanged; no barcode-specific field exists at the schema level
    (by design — it is a virtual filter-string term, not a new GraphQL field)
  - PlatformUserGuide §Search overview + §Manage Properties → Configure facets; StorefrontUserGuide
    §Search Options / §Barcode scanner — fetched first-hand via VirtoOZ this pass, quoted verbatim below
  - config/test-suites.json + regression/suites/Frontend/search/004,005, Frontend/catalog/003,
    Backend/search/061, Backend/graphql/050a, Backend/catalog/051 — counts re-derived by csv-parse
  - test-data/aliases.json — grepped for gtin/barcode/scanner: zero hits
excludes: Admin Search → Index management (blue-green build/swap/backup/cancel, Elastic-Search-module
  entity indexing) was NOT live-browsed this pass — enumerated from suite 061's case titles + sitemap.md
  only (G5). Which search provider is ACTIVE on this environment (ElasticSearch / ElasticSearch8 / Lucene
  / AzureSearch — all four installed) was not determined (G7). Granting real camera permission and
  completing an actual scan was out of scope for a read-only pass (G6). Facet/sort/chip/paging depth
  beyond a baseline render is deliberately NOT re-covered here — suites 003/004/005/061 and
  `catalog.md` already own that detail; this map does not duplicate it.
---

# Search — domain map

> Refresh with `/qa-domain-map srch`. This file answers **what the feature is and where its surfaces
> are**. It does **not** carry behavioural rules — those are `BL-SRCH-*`/`BL-CAT-*`/`BL-STORE-*` in
> `oracles/business-logic.md` (cited by id below, never restated) — and it can **never ground an
> assertion as `{DOC}`**. It is a pointer index plus a surface inventory: it tells you *where to look*
> and *what exists*, never *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art/docs say otherwise and are wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

**Read-only pass.** No create/edit/save/delete was performed anywhere. The Admin Barcode-scanner tile's
radio was clicked to **view** the "Exact match" field-picker and then discarded by navigating away
without Save — the backend was re-confirmed still holding its original defaults afterward. The
barcode-scan modal's camera was never granted. Every capability confirmable only by mutating a
**shared** fixture (the B2B-store's own barcode settings, used by every other runner) is `UNVERIFIED`
**with the mutation named**, in §5's open gaps.

> **MID-CHANGE CALL-OUT.** The barcode-scanner-configuration feature described throughout §1, §2c/2d and
> most of §3 rests on **three open, unmerged pull requests**, all deployed as PR builds on this
> environment: `vc-module-catalog#909` (Catalog `3.1046.0-pr-909-2839`), `vc-module-x-catalog#113`
> (XCatalog `3.1022.0-pr-113-f4a8`), `vc-frontend#2501` (theme `vc-theme-b2b-vue-2.59.0-pr-2501-7e0c`).
> **Re-read this map after they merge or revert.** Everything else in this map (the search bar, results
> page, existing Facets/Sorting Admin tiles, xCatalog `products` contract) describes **released**
> behaviour and is not affected by that caveat.

---

## §1 — Purpose and value chain

**Purpose** (`PlatformUserGuide` §Search overview —
[docs.virtocommerce.org/platform/user-guide/search/overview](https://docs.virtocommerce.org/platform/user-guide/search/overview),
verbatim, fetched first-hand): *"The **Search** module (called **Search Index** in the Platform menu)
provides a comprehensive solution for indexed search functionality, offering full-text search capability,
extensible document models, and multi-document support. It enables efficient indexing, querying, and
management of search data for various ecommerce entities, empowering administrators to optimize search
experiences for end-users."* `CONFIRMED` as the declared purpose.

The barcode-specific chain below is reconstructed from the three PR bodies (source, not yet merged) +
live observation, and is the first written statement of it in this repo:

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | **A Category Manager fills in barcode-bearing product properties** | GTIN / MPN are catalog-level product fields; any other short-text property can also serve. `CONFIRMED` source: `ProductDocumentBuilder.BuildSchemaAsync` now declares `gtin`/`manufacturerPartNumber` filterable (declaration-only — both already fed `__content` since VCST-3054, so no re-index is required for this half) |
| 2 | **A store admin decides HOW a scan is matched** | `Stores → {store} → Settings → Search configuration → Barcode scanner`: an **Enable** switch + a **Full-text search / Exact match on selected fields** choice + a flat field picker. `PUT /api/catalog/barcode-search/store/{storeId}`, gated `catalog:BrowseFilters:Update`. **Live on B2B-store: enabled=true, fields=[] — i.e. still in FULL-TEXT mode** (§3 D1) |
| 3 | **The shopper scans** | Storefront search bar (desktop + mobile), a "Barcode scan" icon button; clicking opens a camera-preview modal. `CONFIRMED` live both viewports |
| 4a | **Full-text mode (the live default)** | The scanned value is submitted as an ordinary search phrase (`?q=`) — identical to pre-VCST-2945 (VCST-2622) behaviour |
| 4b | **Exact-match mode (configured, not yet exercised on this env)** | The value navigates to `?barcode=<value>`; `category.vue` builds the virtual filter term `barcode:"<value>"`; the xCatalog `EvalBarcodeFilterMiddleware` expands it into an OR of the configured index fields, widens the document scope to include **variations**, and reports each expanded field as `isGenerated: true` so it never renders as a filter chip |
| 5 | **A single hit short-circuits straight to the product** | `shouldOpenSingleBarcodeHit` (a pure function, source-confirmed, not yet live-exercised): the code captured at request time must still be current, the request must be un-narrowed by facets/page/sort, exactly one product/variation must match, and it fires at most once per code |
| 6 | **The reverse edge — turning it off** | Both settings are simple, fully reversible toggles: `ScannerEnabled=false` hides the storefront button; an emptied `fields` array reverts to full-text. The two toggles are reversible, **but two edges are not symmetric**: (a)  hides the button yet leaves the expansion live for a hand-built `?barcode=` (§3 D2); (b) deleting or renaming a catalog property that is a configured field leaves the stale name in `BarcodeSearchFields` with no cleanup path — scans silently return 0 until the blade is reopened and changed (source-only, PR909 "only validating writer"; `UNVERIFIED` live, needs a mutation on a non-shared store — VCST-2945 1c) |

```mermaid
flowchart TD
  A["Category Manager fills GTIN / MPN / other\nshort-text product properties"] --> B{"Store admin: Search configuration\n> Barcode scanner"}
  B -->|"Enabled=false"| Z["Storefront: no scan icon rendered"]
  B -->|"Enabled=true, fields=[] (LIVE default on B2B-store)"| C["Full-text mode: scan == ordinary keyword search"]
  B -->|"Enabled=true, fields=[gtin,code,...] (not configured live)"| D["Exact-match mode: ?barcode= -> barcode:\"<v>\" term"]
  D --> E[["xCatalog EvalBarcodeFilterMiddleware:\nOR-expand configured fields, widen to variations,\nmark expanded terms isGenerated"]]
  E --> F{"Exactly 1 hit,\nrequest un-narrowed,\nfirst time this code?"}
  F -->|yes| G["router.replace straight to the product/variation page"]
  F -->|no| H["Ordinary results page (facets hidden while barcode active)"]
  C --> H
```

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Category Manager** (the ticket's named persona) | Fills GTIN/MPN/other short-text properties on a product so it becomes findable by scan. No dedicated UI beyond the ordinary product-property editor (§2d) | Source-confirmed (ticket description); no distinct blade exists for this role |
| **Store/Platform admin** | Configures Facets / Sorting / **Barcode scanner** per store (`catalog:BrowseFilters:{Read,Update}`); manages the search index (Search → Index management) | `CONFIRMED` live |
| **Anonymous storefront visitor** | Sees and can click the scanner button; full-text search and results page work identically to a signed-in user | `CONFIRMED` live |
| **Signed-in B2B org buyer** | Identical scanner button and behaviour to an anonymous visitor — no account-level gate found | `CONFIRMED` live 2026-09-28; the only gate is the shared store-level toggle, which is ON for everyone (§3 D1) |

---

## §2 — Surface inventory

### 2a. Storefront — search bar (desktop + mobile)

**Route:** none dedicated — the search bar is a header component present on every page.

| Element | What renders | Verdict |
|---|---|---|
| Barcode-scan icon | Sits immediately left of the red **Search** submit button, inside the search-box row, visible whenever the input is **empty** | `CONFIRMED` live, desktop 1920px |
| Icon → "X" swap | The instant text is typed, the scan icon is **replaced** by a clear/"X" button — the two are mutually exclusive, never both shown | `CONFIRMED` live |
| Barcode-scan modal | Title "Barcode scan"; body *"To proceed, enable your camera to scan the barcode on the product. This will help us quickly identify the item and provide you with the necessary information."*; an empty gray camera-preview box; **Cancel** button; a **second button with no visible label, only a loading spinner** | `CONFIRMED` live — the unlabeled second button is a UX signal worth carrying into §3 (D6), not a functional bug (never actuated with a real camera) |
| Mobile search overlay (375px) | Opened via the header "Toggle search bar" icon. Carries the **same** Barcode-scan icon, a "Cancel" link, a **HINTS** section listing prior search terms, empty-state *"Start typing to search"* + "Check all products" CTA | `CONFIRMED` live — structurally identical to desktop |
| Autocomplete dropdown | On typing: a CATEGORIES column + a product-preview grid + a "View all N results" link | `CONFIRMED` live (baseline only; suite 004 owns depth) |

### 2b. Storefront — search results page (`/search?q=`)

Baseline only (suites 004/005/003 own depth): heading *"Your search for `<term>` returned the following
N results"*, sidebar facets (observed live: Price / Function / Categories / Brand / Color / Origin),
Grid/List toggle, checkbox control chips (Purchased before / Show in stock — the latter pre-checked and
rendered as an active chip with its own Reset), Sort-by dropdown (default "Featured"). `CONFIRMED` live,
matches `BL-SRCH-001`/`BL-SRCH-002`'s declared shape.

**Barcode-active variant (source-confirmed, not yet live-exercisable — fields are empty on this env):**
per PR2501, a scan in exact-match mode is *"an identity lookup, not browsing"* — it ignores `?facets=`
and the in-stock/purchased-before/branch preferences, and the sidebar + control chips + browsing controls
stay **hidden** while a barcode is active (no control claims a filter that is not applied). Heading becomes
*"Your search for barcode `<value>` returned the following…"* / empty state *"No products found for
barcode `<value>`"*, with a Reset that clears both `barcode` and `q`.

### 2c. NOT manageable from the storefront

- The shopper cannot choose full-text vs exact-match mode, or which fields are matched — both are
  store-admin-only settings (§2d).
- The shopper cannot see whether a scan produced a "generated" filter — `isGenerated` fields are
  deliberately dropped from the filter-chip UI (by design, per PR2501).
- A scan is never written to search history (deliberate — PR2501), so it cannot be replayed from the
  HINTS section the way a typed query can.

### 2d. Admin SPA — Store → Search configuration

**Path:** Stores (sidebar) → `{store}` row → **"Search configuration"** widget tile on the store detail
blade. `CONFIRMED` live on B2B-store.

**Tile row:** exactly **3** tiles — **Facets** and **Sorting** on row 1, **Barcode scanner** alone
**wrapped to row 2** (not a horizontal scroll) — confirms PR909's described layout change. `CONFIRMED`
live.

**Facets tile** (pre-existing, not part of VCST-2945): per `PlatformUserGuide` §Configure facets
(verbatim, fetched this pass) — move properties left/right to control storefront visibility; set
aggregation type **Attribute** (with a sort: Name asc/desc, Numeric asc/desc, Priority, Score) or
**Range**. Owned in depth by suite 061 (`SRCHA-047/048`).

**Sorting tile** (pre-existing): drag-and-drop ordering of sort options, first visible = default; **Add**
creates a custom option. Owned in depth by suites 001 (`CAT-064..067`) and 005 (`SRCH-FSORT-*`).

**Barcode scanner tile** (VCST-2945, PR909, unmerged — see MID-CHANGE call-out): `CONFIRMED` live.

| Field | Control | Live state on B2B-store |
|---|---|---|
| "Enable barcode scanner in the storefront" | toggle | **ON** (matches `GET .../barcode-search/store/B2B-store` → `scannerEnabled:true`) |
| "Match scanned code by" | radio: Full-text search / Exact match on selected fields | **Full-text search selected** (matches `fields:[]`) |
| "Fields to match" (only visible in Exact-match mode) | flat, single-level checklist | ~180+ property codes + the 3 built-ins `code`("SKU")/`gtin`("GTIN")/`manufacturerPartNumber`("MPN"). Multi-value properties carry a **MULTI-VALUE** badge |
| Two hint blocks | static text | "How match modes work" / "How to fill barcode data" (GTIN/MPN/SKU/"any other code" + reindex + OR-matching notes) — this is the ticket's "clear instructions for filling Bar Code Product Properties" deliverable, and it lives here, not on the product-property editor itself |

**Live nuance worth recording (not a bug):** with nothing checked, the field picker sorts **alphabetically
by display label**, interleaving GTIN/MPN/SKU among ordinary properties rather than pinning the three
built-ins to the top. This is consistent with PR909's own description — "checked (saved selection) first,
then alphabetical" only applies once something IS checked — but a case asserting "built-ins render first"
against a **fresh, unconfigured** store would be wrong (§3 D5).

### 2e. Admin SPA — Search → Index management

**NOT live-browsed this pass** (§5 G5) — enumerated from `regression/suites/Backend/search/061-search-indexing-admin.csv` case titles (source) and `sitemap.md` §7 ("Search → Indexing / Configuration"):
full index build, blue-green build/swap/backup/cancel, per-entity indexing (Elastic Search module),
`Search Filters API` cases (single/multiple TermFilter). `UNVERIFIED` live this pass — suite 061 already
exercises it in depth (48 cases) but is written in a **legacy CSV header** (`Expected Result` instead of
`Assertions`/`Cross_Layer_Checks`), which is why `tc:scope`'s standard column scan could not confirm or
deny a barcode reference in it (§4).

### 2f. NOT manageable from Admin

- **Which search provider is active** — not surfaced on the Search-configuration or Index-management
  blades at all; it is an `appsettings.json`/deployment fact, invisible to any Admin user (§5 G7).
- **Whether a configured barcode field is also used as a facet, and the interaction between them** — PR113
  notes the barcode term is applied inside that facet's own aggregation too (so multi-select semantics
  stop applying to that facet while a barcode is active), but nothing on the Facets tile surfaces this
  cross-effect; it is only visible by reading the two settings together and reasoning about the
  middleware, or by observing storefront behaviour directly.
- **A per-product "does this have enough data to be scan-findable" check** — the Admin blade's two hint
  blocks are static instructional text (the ticket's actual deliverable), not a live validation against
  any specific product; there is no indicator anywhere in Admin that flags "this product has no GTIN/MPN
  and no configured field populated, so it cannot be found by scan."

### 2g. API / contract surface — xCatalog GraphQL

`products(storeId!, query, filter, facet, sort, fuzzy, …)` — **schema unchanged** by VCST-2945
(`.claude/knowledge/api/graphql-schema.md`, refreshed this run, confirms the same signature). The
barcode capability is **not a new field** — it is a virtual term recognised inside the existing `filter`
string:

| `filter` value | Server behaviour (source: PR113, unmerged) |
|---|---|
| `barcode:"<v>"`, store has no configured fields | left untouched — filters a literal field named `barcode`, normally no hits |
| `barcode:"<v>"`, one configured field e.g. `gtin` | rewritten to `gtin:"<v>"` |
| `barcode:"<v>"`, several configured fields | rewritten to `OrFilter(gtin:"<v>", code:"<v>")` |
| any `barcode:` term | widens the default `is:product` scope to `is:product,variation` (unless the caller sent an explicit `is:` term) |
| response `filters` | the `barcode` term is dropped from user-visible filters; every expanded field term carries `isGenerated:true` |

**Case sensitivity is provider-dependent** (source, PR113 body): Elasticsearch lowercases terms, Lucene
does not. **Which provider is ACTIVE on this environment was not determined this pass** (§5 G7) —
ElasticSearch, ElasticSearch8, Lucene and AzureSearch are all four *installed*, per the pre-flight module
probe.

### 2h. NOT manageable from the API layer alone

- A caller cannot discover which fields are configured for exact-match — that is Admin-only
  (`GET .../barcode-search/store/{storeId}` needs `catalog:BrowseFilters:Read`, not exposed to xAPI).
- A caller cannot tell, from the schema, that `barcode:` is special — it is ordinary `filter: String`;
  the expansion is entirely server-side middleware behaviour, invisible at introspection time.

---

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | **Deployed but dormant.** All three barcode PRs are live on this environment, and the Admin UI, the REST endpoints and the xCatalog middleware all function — but B2B-store's stored settings are the untouched defaults (`scannerEnabled:true`, `fields:[]`). Operationally, on THIS environment, a scan today behaves **identically** to pre-VCST-2945 (VCST-2622): full-text only. A case or a bug report that asserts "exact-match scanning works" without first checking `GET .../barcode-search/store/{storeId}` is asserting an unconfigured capability, not a live one | `CONFIRMED` live + REST probe |
| D2 | **The storefront toggle gates only the BUTTON, never the backend expansion.** Per PR113's own Breaking-changes note: `Catalog.Search.BarcodeScannerEnabled` only shows/hides the scanner icon; a hand-typed or bookmarked `?barcode=` URL (or a raw GraphQL `filter: barcode:"<v>"`) is still expanded server-side whenever fields are configured, scanner-enabled or not. This is a genuine "capability reachable by one path, hidden on another" shape | Source-only (PR113 body) — confirming it live needs `fields` configured on a **non-shared** store (§5 G1) |
| D3 | **Two write paths, two validation regimes, same setting.** The Admin blade's own `PUT /api/catalog/barcode-search/store/{storeId}` validates every field name against the live index schema (400 on an unknown name). The **generic** platform Settings REST API can write the identical setting value **unvalidated** — an unknown field name is silently accepted, matches nothing at query time, and the Admin blade only surfaces the mismatch reactively (renders it "missing from index", disabled+checked, and drops it from the selection at the next edit) | Source-only (PR909 body) |
| D4 | **Field-name reservation collision.** Per PR113's Breaking-changes note: once a store configures `fields`, the literal string `barcode` is reserved for the expansion on that store — a catalog property genuinely named `barcode` can no longer be filtered directly there (it can still be *selected* as one of the configured fields, just not queried by its own name) | Source-only (PR113 body) |
| D5 | **Admin field-picker's unconfigured sort order is straight alphabetical, not "built-ins first."** With nothing checked, GTIN/MPN/SKU render interleaved among ~180 ordinary properties by display label — consistent with PR909's own "checked first, then alphabetical" description (nothing is checked pre-save), but a case must not assert the three built-ins are pinned to the top on a fresh/unconfigured store | `CONFIRMED` live 2026-09-28 |
| D6 | **The barcode-scan modal's second action button carries no visible label** — only a loading-spinner glyph, next to a clearly-labelled "Cancel". This is a UX/accessibility signal (unclear affordance for a screen-reader or a sighted user unfamiliar with the icon), not a functional defect — never actuated with a real camera this pass | `CONFIRMED` live 2026-09-28 |
| D7 | **A published guide describes pre-VCST-2945 behaviour, and that is expected, not a defect.** `StorefrontUserGuide` §Barcode scanner ([docs.virtocommerce.org/storefront/user-guide/shopping/searching-for-products](https://docs.virtocommerce.org/storefront/user-guide/shopping/searching-for-products), verbatim): *"users can scan a product's barcode with their phone's camera to **instantly open the product page**."* The actual (new, unmerged) mechanism gates that on `shouldOpenSingleBarcodeHit` — exactly one hit, an un-narrowed request, at most once per code — which the guide does not mention. **This is staleness by timing, not by error**: VirtoOZ's corpus predates an unmerged PR by construction. Re-check this row once PR2501 merges; if the guide is still unchanged at that point, it becomes a real gap | Doc quote `CONFIRMED` fetched verbatim; the nuance is source-only from PR2501 (unmerged) |

---

## §4 — Coverage shape

**Shape, not an audit** — `/qa-review-tests` owns individual-case review. Counts re-derived by
`csv-parse` this pass (raw `wc -l` on these files overcounts — several columns embed newlines):

| Suite | File | Cases | Barcode/scanner-relevant |
|---|---|---|---|
| 004 — Search Core | `Frontend/search/004-search-core.csv` | 44 | **0** |
| 005 — Search Filters & Advanced | `Frontend/search/005-search-filters-advanced.csv` | 47 | **0** |
| 003 — Catalog Filters | `Frontend/catalog/003-catalog-filters.csv` | 30 | **0** |
| 061 — Search Indexing Admin | `Backend/search/061-search-indexing-admin.csv` | 48 | **0** |
| 050a — GraphQL xCatalog | `Backend/graphql/050a-graphql-xcatalog.csv` | 57 | **0** |
| 051 — Catalog Admin Products | `Backend/catalog/051-catalog-admin-products.csv` | 49 | **0** |

`tc:scope` (this run, terms "barcode"/"scanner" across suites `srch`+`cat`+`store` scope, 98 generic-term
hits total) confirms **zero** rows in any in-scope suite assert either term.

- **Zero coverage — a HOLE, not deliberate.** VCST-2945 is a brand-new, still-unmerged feature; nothing
  has been written against it yet. This is the expected state for a feature mid-flight, not a gap in an
  existing QA program.
- **Suite 061 is in a legacy CSV header shape** (`Expected Result`, no `Assertions`/`Cross_Layer_Checks`
  columns) — this is why the standard `tc:scope` column scan is a weaker instrument against it than
  against 004/005/003/050a/051; a manual read of its 48 rows (done this pass, §2e) was needed to confirm
  the zero.
- **ECL has zero sections for `srch`** — `ecl:extract --domain srch` matched no chapter at all. Not one
  edge-case pattern is filed against this domain, barcode or otherwise.
- **Test-data:** zero aliases or fixtures named `gtin`/`barcode`/`scanner` in `test-data/aliases.json`.
  Ad hoc candidates exist live (35 of 4749 products carry a GTIN, one with a non-numeric value `"QA-900"`;
  exactly 1 carries an MPN) but none is named, so a case would have to `live-discover` them.
- **Selection groups:** the `search` and `catalog` groups (per `regression.md`) resolve to exactly the
  suites above — neither carries any barcode content to select.

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Whether `BarcodeScannerEnabled=false` still allows a hand-typed/bookmarked `barcode:` filter to be expanded server-side (D2) | **OPEN** — needs `Catalog.Search.BarcodeSearchFields` configured on a store, and B2B-store is shared with every other runner (do not touch it); needs an isolated store or an approved mutation window |
| G2 | Whether the Admin blade's `PUT` genuinely rejects an unknown field name with `400` (PR909's own test suite claims it; not exercised live) | **OPEN** — needs a Save on a non-shared store |
| G3 | Whether GTIN-based exact-match scanning actually finds the 35 live GTIN-bearing products once `fields` is configured, including the non-numeric outlier `"QA-900"` | **OPEN** — blocked by the same shared-store-settings constraint as G1 |
| G4 | Whether a scan that hits exactly one **variation** (not a parent product) opens at `/product/<id>` per PR2501 | **OPEN** — no live variation+GTIN fixture identified this pass; needs `fields` configured too |
| G5 | Admin Search → Index management (build/rebuild/swap blue-green/backup/cancel, per-entity indexing) — not live-browsed this pass | **OPEN** — deferred breadth-first; suite 061 (§2e, §4) already covers it in depth from source |
| G6 | What the barcode-scan modal's unlabeled second (spinner) button does, and whether the flow completes when a real camera is granted | **OPEN** — needs a real camera grant, environment-dependent, out of scope for a read-only pass |
| G7 | Which search provider is ACTIVE on this environment (ElasticSearch / ElasticSearch8 / Lucene / AzureSearch — all four installed) | **OPEN** — matters because exact-match case-sensitivity differs by provider (Elastic lowercases, Lucene does not) |

## §6 — Prior-art verdicts

**None.** `reports/ba/**` holds no prior BA analysis and no prior test model for the search or barcode
surface — this map is the first written enumeration, so there is nothing here to contradict or supersede.

## §7 — Amendments

*(none yet — first build)*
