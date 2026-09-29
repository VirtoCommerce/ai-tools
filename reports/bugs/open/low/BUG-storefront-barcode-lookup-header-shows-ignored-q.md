# Barcode lookup with a leftover `q`: the header search box shows the ignored keyword and hides the scan button `[Low]`

## Status: READY_TO_SUBMIT

**Tracker:** VCST-6098 (Subtask of VCST-2945; auto-fix labels withheld — defect is inside open PR #2501, the fix belongs to the PR author)

**Severity:** Low (P3) · **Type:** Functional / UI state consistency · **Archetype:** `PARITY`
**Found by:** /qa-test-fast VCST-2945 (2026-09-28) · **IN SCOPE** of VCST-2945 (new behaviour in PR #2501)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · Catalog `3.1046.0-pr-909-2839` · XCatalog `3.1022.0-pr-113-f4a8` · Platform `3.1073.0-pr-3121-9965` · store `B2B-store` in Exact mode · Firefox 1920 px and 390 px · anonymous

## Summary

When a results URL carries both `barcode` and `q`, the page correctly runs the barcode lookup and ignores
the keyword (PR #2501 review fix). The header search box does not follow: it still shows the ignored keyword.
Because the box is not empty, the Barcode scan button is hidden, and submitting the box runs a plain
`?q=` search that drops the barcode. The shopper sees a keyword that did not produce the results on screen
and cannot scan again without first clearing the box. Such a URL comes from a shared or hand-built link; a
scan itself pushes `barcode` only.

## Steps to Reproduce

1. Set the store to Exact match with at least `gtin` (Store → Search configuration → Barcode scanner), then hard-reload the storefront.
2. Open `{{FRONT_URL}}/search?barcode=@td(BARCODE_GTIN_UNIQUE.gtin)&q=tablet` (use a GTIN shared by several products, e.g. `@td(BARCODE_GTIN_SHARED.gtin)`, to stay on the results list).
3. Look at the header search box and the scan button, desktop and at 390 px (open the search overlay).
4. Press Enter in the box.

## Expected vs Actual

- **Expected:** while a barcode lookup is active the header box does not present the suppressed keyword as the current search (empty, or showing the barcode), so the scan button stays available and the box matches the results.
- **Actual:** the box shows `tablet`, the scan button is hidden (box not empty), the results are the barcode lookup's; Enter goes to `?q=tablet` and the barcode is dropped.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | screenshots below; HAR `test-results/firefox/har/session.har` (18:08–18:24Z) |
| 2. Admin | N/A | no admin surface for the header box |
| 3. xAPI | PASS | the `products` request carries an empty keyword and `barcode:"<v>"` only — `q` is not sent (checklist C15, HAR `reports/tickets/Sprint26-19/VCST-2945/screenshots/fast-C-lane-storefront-2026-09-28.har`) |
| 4. REST | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

- `client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue` l.115 reads `q` via
  `useRouteQueryParam(QueryParamName.SearchPhrase)`, and l.223–233 copy it into `searchPhrase` with no check
  for an active `barcode` param. l.52 renders the scan button only `v-if="!searchPhrase && isScannerEnabled"`.
- `mobile-search-bar.vue` has the same pattern (l.91, l.155; scan button l.28).
- The page-level suppression added in review (keyword ignored while `barcode` is present) lives in the results
  page (`category.vue` / `useProducts.ts`), not in the header bars.

**Suggested fix:** in both bars, do not hydrate `searchPhrase` from `q` while the `barcode` query param is set
(or clear it on entering a lookup), mirroring the page-level rule.

## Evidence

- ![desktop box shows ignored q](reports/bugs/screenshots/barcode-lookup-header-shows-ignored-q/fast-X-03-barcode-plus-q-searchbar.png)
- ![390 px overlay shows ignored q](reports/bugs/screenshots/barcode-lookup-header-shows-ignored-q/fast-X-05-mobile-overlay-shows-suppressed-q.png)
- Session: `reports/exploratory/SBTM-VCST-2945-2026-09-28-2.md` (candidate X3). Observed-behaviour entry `KB-68F7432D`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend (PR #2501)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** header search bar (desktop + mobile) — barcode lookup state
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/search-bar/search-bar.vue` l.223 (`watch(searchPhraseInUrl, …)`); `mobile-search-bar.vue` l.155
- **Routing confidence:** HIGH

Found by: /qa-test-fast VCST-2945 (2026-09-28)
