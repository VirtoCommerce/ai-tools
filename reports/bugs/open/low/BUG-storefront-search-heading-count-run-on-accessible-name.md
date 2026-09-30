# Search results heading reads as one run-on token to screen readers ("…returned the following3results") `[Low]`

## Status: READY_TO_SUBMIT

**Severity:** Low (P3) · **Type:** Accessibility, WCAG 1.3.1 / 4.1.2 (heading text) · **Archetype:** `RENDER`
**Found by:** /qa-test VCST-2945 (2026-09-28) · **pre-existing**, affects `?q=` and `?barcode=` alike (see Provenance)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · store `B2B-store` · Chromium 1920 px · anonymous

## Summary

The results heading looks correct on screen: "Your search for printer returned the following", followed by a
superscript "28 results". Both gaps come from CSS margins only. There is no whitespace in the DOM between the
heading text and the count, or between the count and the word "results". The accessible name is therefore
**"Your search for 2945300000016 returned the following3results"**. Screen readers read "following3results"
as one token, and search-in-page and copy-paste get the same run-on text.

## Steps to Reproduce

1. Open `{{FRONT_URL}}/search?q=@td(BARCODE_GTIN_SHARED.gtin)` (3 hits). Any search that returns a count works.
2. Read the `h1` in the accessibility tree, or copy the heading text.

## Expected vs Actual

- **Expected:** `Your search for 2945300000016 returned the following 3 results`
- **Actual (accessibility snapshot):**
  ```
  heading "Your search for 2945300000016 returned the following3results" [level=1]
    text: Your search for · strong: "2945300000016" · text: returned the following
    superscript: 3results
  ```
  The same happens on `?barcode=` lists (`…for barcode <code> returned the following3results`).

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | snapshot above; visual: ![heading](reports/bugs/screenshots/search-heading-count-run-on-name/search-heading-visual.png) |
| 2–4 | N/A | text assembly only |

**Owning layer:** Layer 1 — Storefront.

Also recorded as an advisory in `reports/tickets/Sprint26-19/VCST-2945/design-report.md`.

## Root Cause Analysis

`client-app/shared/catalog/components/category.vue` l.76–88 (PR branch; l.65–75 on `dev`). The heading `<span>` is
followed on a new line by `<sup class="category__products-count">`, and inside it `<b class="me-1">{{ count }}</b>` is
followed on a new line by the `<template>` holding `products_found_message`. The Vue compiler's default
`whitespace: 'condense'` drops whitespace-only text between elements when it contains a newline, so both
joins collapse. `me-1` and the `sup` margin add only visual space.

**Suggested fix:** put explicit text spaces in the template (`{{ " " }}` or `&#32;` before `<sup>` and after
`</b>`), or add an sr-only separator. Moving the spacing into the i18n message also works.

## Provenance

**PRE-EXISTING.** The markup is the same on `dev` and reproduces on plain full-text `?q=` searches. PR #2501
reuses it for the new barcode headings. The defect doesn't fail VCST-2945.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** catalog/search results heading (`category.vue`)
- **RCA anchor:** `client-app/shared/catalog/components/category.vue` `<sup v-if="showProductsCount" class="category__products-count">` / `data-test-id="products-count-label"`
- **Routing confidence:** HIGH

Found by: /qa-test VCST-2945 (2026-09-28)
