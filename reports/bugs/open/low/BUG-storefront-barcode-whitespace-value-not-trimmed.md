# Whitespace-only barcode is not trimmed: `/search?barcode=%20%20` sends `barcode:"  "` and shows "No products found for barcode" with a blank value `[Low]`

## Status: READY_TO_SUBMIT

**Severity:** Low (P3) · **Type:** Functional / input validation · **Archetype:** `INPUT`
**Found by:** /qa-test VCST-2945 (2026-09-28) · **IN SCOPE** of VCST-2945 (new code in PR #2501)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · XCatalog `3.1022.0-pr-113-f4a8` · store `B2B-store` · Chromium 1920 px · anonymous

## Summary

A barcode made only of whitespace counts as a real barcode lookup. The page sends the filter term
`barcode:"  "` to xAPI, hides the browsing controls, and renders the heading **"No products found for
barcode"** with nothing after it. It doesn't crash and Reset still works, but a blank code should never start
an exact lookup. The heading also reads as if the text were cut off. Surrounding whitespace on a real code,
such as a trailing space from a keyboard-wedge scanner or a copy-paste, is also sent as is. Exact matching is
whitespace-sensitive, so that code finds nothing.

## Steps to Reproduce

1. Open `{{FRONT_URL}}/search?barcode=%20%20` (two spaces).
2. Look at the heading and the products request in the network panel.
3. Optional, with the store in Exact mode: open `{{FRONT_URL}}/search?barcode=@td(BARCODE_GTIN_UNIQUE.gtin)%20`
   (trailing space) and compare it with the same URL without the space.

## Expected vs Actual

- **Expected:** the value is trimmed. A value that is empty after trimming isn't treated as a barcode lookup:
  it falls through to the normal search/catalog page, or goes to the empty state without sending a filter.
  A padded code resolves the same way as the bare code.
- **Actual:** heading `No products found for barcode` (level-1 heading, nothing after "barcode"). The
  `products` request carries `filter: … barcode:\"  \"` (HAR). Sidebar and browsing controls are hidden as
  for any barcode lookup.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | screenshot below; HAR `test-results/chrome/har/VCST-2945-4a-frontend-2026-09-28.har` (request with `barcode:\"  \"`) |
| 2. Admin | N/A | — |
| 3. xAPI | PASS (as designed) | receives a literal `"  "` term and returns 0 |
| 4. REST | N/A | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

- `client-app/shared/catalog/composables/useProducts.ts` l.133–134:
  `barcodeQueryParam = computed(() => toFirstString(rawBarcodeQueryParam.value))` and
  `isBarcodeLookup = computed(() => !!barcodeQueryParam.value)`. The value is never trimmed, so `"  "` is truthy.
- `client-app/shared/catalog/components/category.vue` l.570 passes it unchanged to
  `getFilterExpressionForBarcode(...)`, and the heading slot (l.46–47) renders it.
- The scan entry point has the same gap: `useBarcodeSearch.ts` `onBarcodeScanned` guards only
  `if (!value) return` (l.92).

**Suggested fix:** trim once in `barcodeQueryParam` (`toFirstString(...)?.trim()`), which covers the URL,
heading and filter, and trim in `onBarcodeScanned` before routing.

## Evidence

- ![blank heading](reports/bugs/screenshots/barcode-whitespace-not-trimmed/search-barcode-whitespace-blank-heading.png)
- Observed-behaviour base entry `KB-25829330` records the same untrimmed empty state.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend (PR #2501, branch `feat/VCST-2945-barcode-search-setup`)
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** catalog search — `useProducts` barcode query param; header `useBarcodeSearch`
- **RCA anchor:** `client-app/shared/catalog/composables/useProducts.ts` l.133 (`barcodeQueryParam`); `client-app/shared/layout/composables/useBarcodeSearch.ts` l.92
- **Routing confidence:** HIGH

Found by: /qa-test VCST-2945 (2026-09-28)
