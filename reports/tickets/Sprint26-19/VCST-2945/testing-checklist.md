# Testing checklist — VCST-2945 (Barcode scanner search setup)

**Run:** /qa-test FULL · 2026-09-28 · vcst-qa · Catalog 3.1046.0-pr-909-2839 · XCatalog 3.1022.0-pr-113-f4a8 · theme 2.59.0-pr-2501-7e0c
**Model:** `reports/ba/test-models/VCST-2945-2026-09-28.md` (incl. 3x amendments) · **Discovery:** `reports/exploratory/SBTM-VCST-2945-2026-09-28.md`
**Written by:** the orchestrator inline (deviation from test-management-specialist: it held the 1d + 3x context this list is built from).
**Data:** `npm run seed:barcode` (proven 2026-09-28) — `@td(BARCODE_*)`, `@td(BROWSEFILTERS_READ_ONLY|NONE)`, `@td(ORG_USER_DEFAULT)`, `{{ADMIN}}`. Images: `@td(<ALIAS>.image)`.

**Rules for every executor**
- **B2B-store is shared.** Only the storefront track may write its barcode settings, inside ONE window (§C), and it MUST restore `{"scannerEnabled":true,"fields":[]}` and re-GET to prove it. The backend track uses `@td(BARCODE_STORE.id)` only.
- **A scan cannot be dispatched in this env** (no camera ⇒ Browse stays disabled — 3x). Storefront exact-mode items enter at `/search?barcode=<value>`, the route the composable pushes; say so in the evidence.
- The SPA reads store settings at app load: after any settings write, **hard-reload** the storefront before observing.
- Case column: `PENDING-A:<plan>#<n>` = the Artifact-A row now being authored (plan order); `—` = checklist-only.

## A. Admin SPA + REST — `qa-backend-expert`, playwright-edge, store `@td(BARCODE_STORE.id)`

| # | Condition (AC) | Expected | Oracle | Case |
|---|---|---|---|---|
| A1 | Search configuration shows three tiles (Facets / Sorting / Barcode scanner) wrapping, no horizontal scroll (AC-2) | third tile opens the blade | {SPEC} pr909 | — |
| A2 | Blade content: switch, Full-text / Exact radios, field list only in Exact, two hint blocks (AC-2, AC-7) | as listed; quote the hints | {SPEC} pr909 | — |
| A3 | Save Exact + `gtin`,`code` → GET returns them; reopen shows them checked first (AC-2, AC-3) | 204; persisted; checked-first then alphabetical | {SPEC} | PENDING-A:admin#4 |
| A4 | Field order frozen while toggling; Exact + 0 fields ⇒ Save disabled; Reset restores; dirty close asks (AC-3, AC-5) | as stated | {SPEC} | PENDING-A:admin#4 |
| A5 | PUT unknown field → 400 naming it, nothing persisted; null body 400; unknown store 404; mixed case/dup normalised (AC-8) | as stated | {SPEC} pr909 | PENDING-A:admin#1 |
| A6 | GET unknown store → 200 defaults (3x) | `{"scannerEnabled":true,"fields":[]}` | {SPEC} pr909 | PENDING-A:admin#1 |
| A7 | Read-only role: blade read-only, no Save; PUT with own token → 403, unchanged (AC-6, G2) | as stated | {SPEC} Update gate | PENDING-A:admin#2 |
| A8 | No-permission role: GET, GET fields, PUT → 403; blade must NOT claim the scanner is off (G2, B3) | 403 ×3; access error, no false state | {SPEC} | PENDING-A:admin#3, admin#8 |
| A9 | Missing-from-index field: delete `@td(BARCODE_STALE_FIELD)` property ⇒ checked + disabled + badge; dropped on field toggle AND mode change; never re-saved (AC-4, RE1) | as stated | {SPEC} pr909 | PENDING-A:admin#5, admin#7 |
| A10 | Generic `PUT /api/stores/{id}` with an unknown field → stored as-is; blade shows it missing (G13, row 18) | 204 + badge; record xAPI effect | {SPEC} "only validating writer" | PENDING-A:admin#6 |
| A11 | Store independence: config on BARCODE_STORE ⇒ B2B-store GET unchanged and its `barcode:` term untouched (G10) | B2B-store defaults; 0 hits literal | {BL-STORE-001} | PENDING-A:graphql#4 |
| A12 | Localization: blade strings English, no raw keys (DoD) | no `catalog.*` keys visible | {SPEC} English-only convention | — |

**Restore** BARCODE_STORE to defaults at the end; `npm run seed:barcode` if A9 deleted the property.

## B. xAPI contract — `qa-backend-expert` (same agent, after §A), store `@td(BARCODE_STORE.id)`

| # | Condition | Expected | Oracle | Case |
|---|---|---|---|---|
| B1 | fields `[gtin]`: `barcode:"<GTIN_UNIQUE.gtin>"` → 1; filters report `gtin` with `isGenerated:true`, no `barcode` user filter (AC-9, AC-13) | 1 hit | {SPEC} pr113 | PENDING-A:graphql#2 |
| B2 | fields `[gtin,code]`: GTIN and `CODE_OR.sku` each → 1 (OR) (AC-9) | 1 + 1 | {SPEC} | PENDING-A:graphql#2 |
| B3 | fields `[<BARCODE_PROP.propertyName>]`: `PROP.value` → 1 (AC-9) | 1 | {SPEC} | PENDING-A:graphql#3 |
| B4 | fields `[manufacturerPartNumber]`: `VARIATION_MPN.mpn` → 1 variation (default scope widened); explicit `is:product` → 0 (AC-9) | 1 / 0 | {SPEC} pr113 | — (covered by storefront C5 + graphql plan) |
| B5 | Case: `CASE.value` lower/upper → 1; `CASE.prefix` → 0; leading/trailing space → record (row 4) | 1 / 1 / 0 | {SPEC} + {OBSERVED} insensitive | PENDING-A:graphql#1 |
| B6 | Wildcards: `*`, `<GTIN prefix>*`, `?` substitution → must NOT widen (row 25, B1 candidate) | 0 / 0 / 0 | {BL-SRCH-005} + {SPEC} "exactly" | PENDING-A:graphql#8 |
| B7 | Special value `SPECIAL.value` (quote + colon), escaped → 1; whitespace-only / empty → untouched, no error; a 600-char value → no 500 (AC-16, G3, G4) | 1; no errors[] | {BL-SRCH-005} | PENDING-A:graphql#6 |
| B8 | Shared GTIN → 3; term-facet counts sum consistent with totalCount (G6, BL-SRCH-001) | 3; counts follow | {BL-SRCH-001} | PENDING-A:graphql#7 |
| B9 | Reindex: change `REINDEX.gtin` → `newGtin`; after ≤120 s old → 0, new → 1 (row 11) | 0 / 1 | {BL-SRCH-003} | PENDING-A:graphql#5 |
| B10 | `scannerEnabled:false` + fields ⇒ `barcode:` still expands (RE2 — documented) | 1 hit | {SPEC} pr113 runtime note | PENDING-A:storefront#3 |
| B11 | Second `barcode:` term stays literal; comma values inside one term OR (3x) | 0 / N | {SPEC} pr113 | — |
| B12 | Store settings exposed publicly: `store { settings { modules } }` carries both keys (L4) | keys present, values = saved | {SPEC} pr2501 | — |

## C. Storefront — `qa-frontend-expert`, playwright-chrome — ONE serialised B2B-store window

Open the window: `PUT barcode-search/store/{{STORE_ID}}` `{"scannerEnabled":true,"fields":["gtin","code","manufacturerPartNumber","<BARCODE_PROP.propertyName>"]}` → re-GET → hard-reload. **Close it: restore defaults → re-GET (must equal defaults) → hard-reload.** Record both timestamps.

| # | Condition | Expected | Oracle | Case |
|---|---|---|---|---|
| C0 | Before the window (defaults): scanner button in desktop bar + 390 px mobile bar; `?q=<FULLTEXT_DISCRIM.gtin>` ≥2 hits; `?barcode=` → literal, 0 (AC-14 proxy, V5) | as stated | {SPEC} full-text unchanged | PENDING-A:storefront#2 |
| C1 | [JOURNEY] `/search?barcode=<GTIN_UNIQUE.gtin>` → replaced by `@td(BARCODE_GTIN_UNIQUE.url)`; Back does not loop; Add to cart → line appears (AC-10, L8) | PDP of QA-BC-2945-001; cart +1 | {SPEC} | PENDING-A:storefront#1 |
| C2 | Same code as `?barcode=` vs `?q=`: exact → 1 (opens), full-text → ≥2 list (mode discriminates) | as stated | {SPEC} | PENDING-A:storefront#2 |
| C3 | Shared GTIN → list of 3, heading `header_barcode`, no redirect (G6) | 3 cards | {SPEC} | PENDING-A:storefront#4 |
| C4 | Unknown code → `header_barcode_empty` with the code, VcEmptyView, Reset clears `barcode` and `q` (AC-12) | intact empty state | {BL-SRCH-002} | PENDING-A:storefront#6 |
| C5 | `VARIATION_MPN.mpn` → opens `/product/<variationId>` although out of stock, with in-stock preference ON (AC-10, ECL-8.2) | variation PDP | {SPEC} | PENDING-A:storefront#5 |
| C6 | Barcode result: no sidebar, no in-stock/purchased/branch controls, no chips; `&facets=` appended ignored; sort works and does not redirect (AC-11, AC-13) | as stated | {SPEC} | PENDING-A:storefront#10 |
| C7 | Property value and `CODE_OR.sku` open their products (AC-9 via UI) | PDPs | {SPEC} | — |
| C8 | Anonymous vs `@td(ORG_USER_DEFAULT.email)`: same resolution for C1 (G7) | identical | {BL-SRCH-004} | PENDING-A:storefront#8 |
| C9 | From a category page, `?barcode=` result is global; history dropdown gains no entry (AC-15) | as stated | {SPEC} | PENDING-A:storefront#9 |
| C10 | 390 px: C1 opens the PDP, overlay closed (G8) | as stated | {SPEC} | PENDING-A:storefront#7 |
| C11 | `scannerEnabled:false` (inside the window): button gone in desktop + mobile; `?barcode=` still resolves (AC-1, RE2) | as stated | {SPEC} | PENDING-A:storefront#3 |
| C12 | Special value (quote + colon) and `<code>*` via URL: one term, no 500; `*` must not open a product (G3, row 25) | exact only | {BL-SRCH-005} | — |
| C13 | Whitespace-only `?barcode=%20%20` → no crash, sensible heading (row 12) | empty state | {BL-SRCH-005} | — |
| C14 | HTML in the code (`?barcode=<b>x</b>`) rendered as text in the heading (BL-SRCH-005 XSS) | escaped | {BL-SRCH-005} | — |
| C15 | Camera denied → Browse usable or a message shown (B2 — pre-existing) | record | {HYPOTHESIS} — PO | — |
| C16 | Console / network: no new errors on every C item; GraphQL `errors[]` empty | clean | always-on | — |

## D. Visual + a11y — `ui-ux-expert` (4v), Chrome DevTools MCP — read-only against B2B-store

Barcode scanner blade (BARCODE_STORE), storefront search bar + scanner modal (desktop + 390 px), `?barcode=` result and empty headings. BL-UI-* layout invariants; BL-A11Y-001..004 (names/roles of switch, radios, checkbox rows, badge, Browse, overlay close — 3x B4/B5); design spec: **SKIPPED — ticket carries no Prototype link**.

## Uncovered / not executable this run
- G11 a catalog property literally named `barcode` (name reserved once fields are configured — pr113): no such property exists and none was seeded — WAIVED this run, documented runtime note.
- G12 a configured field that is also a facet (multi-select suspended inside its own aggregation): WAIVED — no barcode field is a facet in B2B-mixed; B8 checks counts follow.
- G1 blade error on a rejected save: not reachable through the blade (a missing field is dropped on the first change and Save stays disabled until then — 3x); the server half is A5/A9.
- Real scan dispatch (camera or upload): needs a fake-media lane — covered only by PR unit tests.
- AC-14 older backend: no lane. Lucene case-sensitive provider: not installed-active here.
- Story goal "clear instructions for filling barcode properties" on the PRODUCT edit surface: not implemented by these PRs (1d) — PO question.
- VCST-2622 AC "single match opens product" on the full-text path: never implemented (3x) — PO question.
