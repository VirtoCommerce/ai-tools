# VCST-2945 — FAIL
All barcode setup and lookup behaviour was tested across the admin blade, REST, xAPI and storefront, on the same PR build as the earlier FULL run (Catalog 3.1046.0-pr-909-2839, XCatalog 3.1022.0-pr-113-f4a8, theme 2.59.0-pr-2501-7e0c). Every AC works live except one: exact match still treats `*` and `?` as wildcards, so a partial code opens a product (VCST-6094).
Page: https://claude.ai/artifact/AUiEMFz1aRUYKwPt3xiBTi

| AC | Result | Evidence |
|---|---|---|
| T1 Barcode scanner setting in Store search configuration; on/off hides the scan button | PASS | screenshots/fast-A1-blade-fulltext.png · fast-C11-desktop-disabled-no-scan-button.png |
| T2 Choose Full text or field(s): delivered as a mode plus a multi-field list (DRIFT against the one-field wording) | PASS | fast-A2-reopen-exact-gtin-code-checked-first.png |
| T3.1 Full text: scan runs `?q=`, unchanged | PASS | fast-C0-mobile-overlay-scan-button-defaults.png (C0, C2) |
| T3.2 MPN: exact on manufacturerPartNumber, variation included | PASS | fast-C5-variation-mpn-pdp.png (A16, C5) |
| T3.3 GTIN: exact on gtin (the AC says `mpn:` — a typo) | PASS | A13 transcript · C1 HAR |
| T3.4 SKU: exact on code | PASS | A14 transcript · C7 HAR |
| T3.5 Custom short-text property | PASS | A15 transcript · C7 HAR |
| AC-4 No match: "No products found for barcode", Reset | PASS | fast-C4-unknown-code-empty-state.png |
| PR spec: "Matching is exact" | **FAIL** | fast-C12-VCST-6094-prefix-wildcard-opens-pdp.png · A18 transcript |

## Bugs
- Medium — Exact match treats `*` / `?` as wildcards; a partial code opens a product — reports/bugs/open/medium/BUG-barcode-exact-match-honours-wildcards-partial-code-opens-product.md (VCST-6094, re-confirmed)
- Low — On a barcode lookup with a leftover `q`, the header box shows the ignored keyword and hides the scan button — reports/bugs/open/low/BUG-storefront-barcode-lookup-header-shows-ignored-q.md (VCST-6098)
- Low, pre-existing — On `/search`, results `view_item_list` is sent as `Category "undefined"` — reports/bugs/open/low/BUG-storefront-search-results-analytics-list-name-category-undefined.md (VCST-6099)
- Low, pre-existing — Search-bar `view_item_list` is pushed on page load with no dropdown open — reports/bugs/open/low/BUG-storefront-search-bar-view-item-list-on-page-load.md (VCST-6100)
- Low — Blade shows the scanner OFF when `/fields` fails; now also seen on a network error, not only a 403 — reports/bugs/open/low/BUG-barcode-blade-shows-scanner-off-without-browsefilters-read.md (not filed)
- Low — Whitespace-only `?barcode=` is not trimmed — reports/bugs/open/low/BUG-storefront-barcode-whitespace-value-not-trimmed.md (not filed)

## Not tested, and why
- C17 paging reset on a second barcode: no field value on B2B-store has more than one page (16) of hits. FIXTURE-GAP.
- C6 paging controls during a lookup: same data gap. Sort and grid/list were observed.
- The scan itself (camera or Browse upload): no fake-media lane, and Browse stays disabled without a camera. Entry was by the `?barcode=` URL.
- A11y re-check (VCST-6095/6096/6097): same build as the filing run and no fix deployed.
- Redirect/request race (r6): not deterministically drivable through MCP.
- Intent-search filters during a lookup: VirtoCommerce.IntentSearch is not installed on vcst.
- AC-14 older backend and the Lucene provider: no lane.
- Exploratory box: returned at about 25 of 45 minutes, under the 30-minute floor. Every charter source was covered or marked NOT REACHED with a reason.
- Candidate cases for a later `/qa-test-lifecycle`:
  - `?barcode&q` header state
  - currency without a price list ⇒ "not found"
  - analytics payloads for 0/1/N hits
  - a stale-only config also zeroes a valid GTIN

## Data
Created 2 AGENT-TEST- entities, removed 1: the cart line was removed; the search-history keyword `AGENT-TEST-hist-c9x` cannot be deleted from the storefront. The A9 property and the A21 GTIN were mutated and restored with `seed:barcode`. Settings restored and re-read: B2B-store barcode-search (18:20:17Z) and BARCODE_STORE barcode-search (18:27:40Z).

## Context used
Model reports/ba/test-models/VCST-2945-2026-09-28.md (Round 3) · Checklist reports/tickets/Sprint26-19/VCST-2945/testing-checklist.md · Domain map PRESENT (search.md rev 1) · Mind map .claude/knowledge/domain/search.mind-map.json (updated) · Exploratory reports/exploratory/SBTM-VCST-2945-2026-09-28-2.md · PRs vc-module-catalog#909, vc-module-x-catalog#113, vc-frontend#2501
