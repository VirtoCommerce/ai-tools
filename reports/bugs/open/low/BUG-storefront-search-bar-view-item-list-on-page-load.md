# Search-bar `view_item_list` is pushed on page load for the URL keyword, with no dropdown shown `[Low]`

## Status: CONFIRMED — VCST-6100 · fix PR VirtoCommerce/vc-frontend#2529 (In review, 2026-10-01)

**Tracker:** VCST-6100 (Bug, relates to VCST-2945; labels vc-fix + qa-autofix)

**Severity:** Low (P3) · **Type:** Functional / analytics payload · **Archetype:** `SILENT`
**Found by:** /qa-test-fast VCST-2945 (2026-09-28) · **PRE-EXISTING** — outside VCST-2945 (same code on `master`)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` · Platform `3.1073.0-pr-3121-9965` · store `B2B-store` · Firefox 1920 px · anonymous

## Summary

The search-bar list impression (`view_item_list` with `item_list_id: "search_bar"`) is meant for the products
shown in the search dropdown after the shopper types. Opening a results URL with `?q=` pushes it on page
load although no dropdown is open, reporting impressions the shopper never saw. On
`/search?barcode=<v>&q=<t>` it reports products for `<t>`, a keyword the page is not even searching.
Non-visual claim: the evidence is the page's analytics data layer, not a screenshot.

## Steps to Reproduce

1. Open `{{FRONT_URL}}/search?q=tablet` in a fresh tab; do not click the search box.
2. Inspect `window.dataLayer` for a `view_item_list` event with `item_list_id: "search_bar"`.

## Expected vs Actual

- **Expected:** the `search_bar` impression fires only when the dropdown is visible with results.
- **Actual:** it is pushed on load (observed 18:11:42Z) with the dropdown closed.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | dataLayer read 18:11:42Z; HAR `test-results/firefox/har/session.har` |
| 2. Admin | N/A | — |
| 3. xAPI | N/A | a correct `searchResults` call; the defect is when its impression is reported |
| 4. REST | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

`client-app/shared/layout/components/header/_internal/search-dropdown.vue` (master): `watch(() => props.searchPhrase, …)`
(l.392) and `onMounted` (l.405) call `onSearchPhraseChanged()` whenever the phrase is set — including when the
header bar hydrates it from the URL `q` (`search-bar.vue` l.223). `searchAndShowDropdownResults()` then pushes
`analytics("viewItemList", …, searchBarListProperties)` (l.305) without checking `visible`.

**Suggested fix:** push the impression only when `visible` is true (or on the `visible` false→true transition).

## Evidence

- Session `reports/exploratory/SBTM-VCST-2945-2026-09-28-2.md` (candidate X2).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** header search dropdown analytics
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/search-dropdown.vue` l.305 (`analytics("viewItemList", …)`)
- **Routing confidence:** MEDIUM — the load path is confirmed in the data layer; the exact guard is inferred from source

Found by: /qa-test-fast VCST-2945 (2026-09-28)
