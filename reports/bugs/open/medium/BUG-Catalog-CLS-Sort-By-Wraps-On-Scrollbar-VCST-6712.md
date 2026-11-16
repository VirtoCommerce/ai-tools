# BUG: Catalog CLS 0.176 — "Sort by" wraps to a second row when the scrollbar appears and shifts the product grid 50px

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-0023-W6R

**Severity:** Medium (P2, Performance / layout stability) · **Tracker:** [VCST-6712](https://virtocommerce.atlassian.net/browse/VCST-6712) · **Related:** VCST-6042 (Stable 16), VCST-6710 (home-page CLS, separate mechanism)

## Env
- Stand: `vcptcore_regression` storefront, store `B2B-store`, guest
- Theme **2.59.0** (live bundle `assets/index-Cg7OMg95.js`, index.html last-modified 2026-10-07 20:23 GMT — matches the package); Platform 3.1076.8 (vc-deploy-dev `vcptcore-regression`)
- Browser: Chromium, viewport 1280x900, Fast-3G throttle
- Repro rate: 6/6 (3 original + 3 re-runs), CLS 0.1759 every time
- Not available from the env: trace id (stand sends no Request-Id/traceparent; client-side defect), HAR (lane HAR not exported; runner traces show `consoleErrors: []`, `networkFailures: []`), App Insights (no server call fails)

## Summary
On a fresh load of `/catalog` at 1280px, CLS is **0.176** (BL-UI-001 limit 0.1). The filters row `.category__filters` is `flex-wrap` and its items need ~954px. On first paint the page is shorter than the viewport, so there is no scrollbar and the row (956px) fits. When the category tree and products load the vertical scrollbar appears, the row shrinks to 941px, **"Sort by" wraps to a second row**, and `.active-filter-chips` + `.category__products` move down **50px** (38px row + 12px gap) in one frame (impact ~0.126). Smaller contributor: `.category__product-filters` moves 420px when the sidebar category tree resolves (impact 0.043).

## Steps to reproduce
1. Guest, fresh browser context, viewport 1280x900, Fast-3G.
2. Open `{{FRONT_URL}}/catalog`; wait for 4+ `.vc-product-card` and network idle.
3. Observe CLS (PerformanceObserver `layout-shift`) — 0.176; or deterministically: `TEST_ENV=vcptcore_regression npx tsx scripts/layout/layout-runner.ts --suite regression/suites/Frontend/cross-cutting/048c-layout-stability.csv --run-id <id> --grep LAYOUT-CLS-002`.

## Actual
- CLS 0.1759; `.category__sort`, `.active-filter-chips`, `.category__products` move 50px; `.category__product-filters` moves 420px.
- With scrollbar (content 1265): filters row w=941 h=88, chips y=385, grid y=425 — `screenshots/Catalog-CLS-Sort-By-Wraps-On-Scrollbar/catalog-after-sort-wrapped-1265.png`, `catalog-skeleton-sort-wrapped.png`, `LAYOUT-CLS-002-FAIL.png`.

## Expected
- CLS ≤ 0.1 (BL-UI-001); the filters row keeps one layout whether or not the scrollbar is present.
- Without scrollbar (content 1280): row w=956 h=38, chips y=335, grid y=375 — `catalog-before-equivalent-1280-content-one-row.png`.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package `screenshots/catalog-*.png`, `console/catalog-console.log` (0 errors), runner traces `traces/LAYOUT-CLS-002-FAIL-trace.json` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | all requests 2xx, no `errors[]` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
Package `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-CLS-001/root-cause.md` §Defect B (row geometry in `evidence-index.md` row 11). `client-app/shared/catalog/components/category.vue` (vc-frontend@2.59.0) `&__filters`: `md:flex-wrap justify-end`, `xl:gap-x-6`, `&__sort` `lg:order-last`; no `scrollbar-gutter` on the page, so a 15px scrollbar flips the row between 1 and 2 lines (2px margin at 1280). Ruled out: images without dimensions, data drift, test artefact, changed build.

## Need hotfixes
Same `&__filters` / `&__sort` CSS in vc-frontend 2.51.1 (bundle v15; also 2.51.2) and 2.59.0 (bundle v16) → set on VCST-6712.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend catalog page — `shared/catalog/components/category.vue` filters row
- **RCA anchor:** `client-app/shared/catalog/components/category.vue` `&__filters` (`flex-wrap justify-end`, ~L899–913 @2.59.0) + `&__sort` `order-last` (~L921–931); fix options: `scrollbar-gutter: stable` on root, or a filters layout that does not toggle 1↔2 rows near 1280
- **Routing confidence:** MEDIUM (wrap + 50px measured directly; scrollbar-as-trigger inferred from arithmetic, transient frame not filmed)
