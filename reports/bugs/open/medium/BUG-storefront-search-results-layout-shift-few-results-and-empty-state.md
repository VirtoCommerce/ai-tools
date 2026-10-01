# Search results page layout shift: CLS 0.25 on few-result searches and 0.65–0.73 on the empty state `[Medium]`

## Status: CONFIRMED

**Severity:** Medium (P2) · **Type:** Layout stability / Web Vitals (BL-UI-001) · **Archetype:** `RACE` (skeleton → content swap)
**Found by:** /qa-test VCST-2945 (2026-09-28) · **OUT OF SCOPE** for VCST-2945 — pre-existing (see Provenance)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · store `B2B-store` (barcode fields empty = full-text mode) · Chromium (Playwright) 1920 × 1080 · anonymous · fresh page per sample

## Summary

On `/search`, the page shifts after first paint when a query returns only a few products or none. CLS is
**0.25** on a 3-hit search and **0.65–0.73** on the "no products found" state. A query that fills the grid
scores **0.0007**. The node that moves is the footer, together with the products container above it. The
BL-UI-001 limit is 0.1. The barcode route shows the same numbers because it renders through the same page.

## Steps to Reproduce

1. Start a fresh page with a `PerformanceObserver({ type: "layout-shift", buffered: true })` installed before
   navigation (`LAYOUT_SNIPPETS.installClsObserver`), or record a DevTools performance trace.
2. Load each URL in its own fresh page and wait for load and idle:
   - few hits: `{{FRONT_URL}}/search?q=@td(BARCODE_GTIN_SHARED.gtin)` (3 products)
   - many hits: `{{FRONT_URL}}/search?q=printer`
   - no hits: `{{FRONT_URL}}/search?q=<random nonsense string>`
   - barcode, no hits: `{{FRONT_URL}}/search?barcode=<random unknown code>`
3. Sum `entry.value` where `!entry.hadRecentInput`, and read `entry.sources`.

## Expected vs Actual

**Expected:** CLS ≤ 0.1 on initial render (BL-UI-001). **Actual** (2026-09-28 14:15Z):

| URL | CLS | Largest shift / source |
|---|---|---|
| `?q=<3-hit GTIN>` (2 samples) | **0.2532**, **0.2532** | 4 shifts, footer moves |
| `?barcode=<GTIN hit page>` | **0.2567** | 3 shifts (separate measurement, same page) |
| `?q=printer` (fills the grid) | 0.0007 | none material |
| `?q=<nonsense>` (empty state) | **0.6469** | 0.628 on `vc-layout__content-container` / `FOOTER` |
| `?barcode=<unknown>` (empty state) | **0.7267** | 0.707 on `category-products` / `FOOTER` |

The fewer results a search returns, the larger the shift, and a full grid does not shift at all.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | measurements above; HAR `test-results/chrome/har/VCST-2945-4a-frontend-2026-09-28.har` |
| — | — | barcode-hit measurement: `reports/tickets/Sprint26-19/VCST-2945/design-report.md` finding 5 |
| 2–4. Admin / xAPI / REST | N/A | responses are correct; only the layout moves |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis (source-derived, MEDIUM confidence)

`client-app/shared/catalog/components/category/category-products.vue` l.24–25: while `fetchingProducts` is
true, the grid renders **`itemsPerPage`** skeleton cards (`v-for="i in itemsPerPage"`), which is a full page of
placeholders. When the response arrives, the grid shrinks to the real 3 cards, or is replaced by the much
shorter empty view. The block collapses and the footer jumps up. A full-page result (`printer`) keeps the same
height, which fits the ≈0 CLS measured for it. Reserving the final height isn't possible before the count is
known, so the likely fixes are one of these:
- keep the skeleton area's `min-height` until content paints, or
- render a single skeleton row and grow downward.

Growing downward reads as appended content rather than as a shift.

## Provenance

**PRE-EXISTING.** It reproduces on plain `?q=` full-text searches, a path PR #2501 leaves unchanged.
`category-products.vue` is not in the PR's file list. The barcode route inherits the shift and adds no
material amount of its own. The defect doesn't fail VCST-2945.

**Related, not duplicates:**
- `reports/bugs/open/medium/BUG-Search-Bar-Scope-Chip-Layout-Shift.md` (VCST-5817) — a horizontal shift of the
  search input caused by the scope chip. A different element and mechanism.
- `reports/bugs/open/critical-high/BUG-layout-cls-images-missing-dimensions.md` — home/catalog CLS from a
  late CMS `.features-block`. Also displaces the footer, but has a different cause.
- `reports/bugs/rejected/BUG-account-missions-cls-0219-from-shared-chrome.md` — header/sidebar chrome on
  `/account/missions`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** catalog/search results — `CategoryProducts` loading state inside `category.vue`
- **RCA anchor:** `client-app/shared/catalog/components/category/category-products.vue` l.24–25 (`v-for="i in itemsPerPage"` skeletons); consumer `client-app/shared/catalog/components/category.vue` `<CategoryProducts>` (l.200)
- **Routing confidence:** MEDIUM. The mechanism is inferred from source and fits the result-count pattern.
  Confirm it with a performance trace, which shows the shift frame, before fixing.

Found by: /qa-test VCST-2945 (2026-09-28)
