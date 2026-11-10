# Category page title does not break long words: an unbroken word in the category name makes the page 887px wide at 320px — **Low**

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-0023-W6R
**Tracker:** [VCST-6711](https://virtocommerce.atlassian.net/browse/VCST-6711) (Low; Relates VCST-6042, Stable 16) · labels found-by-agent, found-in-regression, vc-fix, qa-autofix · Need hotfixes: set (v15 2.51.1 / v16 2.59.0)
**kb:** KB-09A0A1F1 (suspected defect)

**Env:** `vcptcore_regression` (`{{FRONT_URL}}`, store B2B-store, "Stable V16") · Theme **2.59.0** (footer; storefront
`index.html` unchanged since 2026-10-07, so the tested build is the deployed one) · Chromium (layout-runner) · guest ·
320×700. Storefront-only: no failing request, 0 console errors; App Insights N/A; HAR on the playwright-edge lane
(`test-results/edge/har/session.har`, referenced, not copied).

## Summary
A category whose name contains one unbroken token (30–53 characters on the stand's test category) makes the catalog
page **887 px** wide at a 320 px viewport, with real data and no text stress. The H1 title cannot break the word, so
the whole page scrolls sideways. A long German compound word would take the same path. Found incidentally while
isolating LAYOUT-STR-001 (case ISO-UNBROKEN-DE, run REG-2026-11-05-0023-W6R-recheck-str-iso).

## Steps to reproduce
1. In the Admin, create a category in the store's catalog and name it with one long unbroken word (for example 50
   characters with no spaces).
2. On the storefront, open that category page as a guest at a 320×700 viewport and wait for network idle.
3. Measure `document.documentElement.scrollWidth` against `innerWidth`.

## Actual
- `scrollWidth` = **887** vs `innerWidth` = 320: the page scrolls sideways; the H1 runs past the right edge.
- The breadcrumb's last item (same name) is cut at the right edge as well (screenshot).
- ![320 px, unbroken category name](../../screenshots/Category-Title-Unbroken-Word-Overflows-320/de-unbroken-category-name-320-no-stress.png)

## Expected
The title wraps (breaks the long word) inside its container; the document never scrolls sideways at a supported width
`{BL}` (BL-UI-004 Content boundary).

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `isolation-results.json` ISO-UNBROKEN-DE (887 vs 320); the screenshot above |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — Storefront (CSS).

## Root Cause Analysis
Package `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-STR-001/` — `source/findings.md` item 3 and
`root-cause.md` §Incidental:
- `client-app/shared/catalog/components/category.vue:39` renders the title as `<VcTypography tag="h1" class="category__title">`;
  its style (`&__title`) only sets `--vc-typography-text-transform: none`.
- `client-app/ui-kit/components/molecules/typography/vc-typography.vue:1-13` adds only `vc-typography`,
  `vc-typography--variant--*` and an optional `--truncate`; no `overflow-wrap` / `break-words`.
- Same code in theme 2.51.1 (bundle v15; VcTypography then under `ui-kit/components/atoms/typography/`), not fixed in
  2.51.2.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend catalog category page title (`category__title`), VcTypography
- **RCA anchor:** `client-app/shared/catalog/components/category.vue:39` (+ `&__title` style); `client-app/ui-kit/components/molecules/typography/vc-typography.vue:1-13` — add `break-words` / `overflow-wrap:anywhere` to the category title (or to VcTypography headings)
- **Routing confidence:** HIGH
