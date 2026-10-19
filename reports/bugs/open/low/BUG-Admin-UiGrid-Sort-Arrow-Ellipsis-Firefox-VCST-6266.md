# Admin SPA on Firefox: a sorted ui-grid header shows "…" instead of the sort arrow, in every grid — **Low**

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-5884
**Severity:** Low (P3) · **Tracker:** VCST-6266 (Jira, filed 2026-10-10; labels found-by-agent, found-in-testing; relates to VCST-5884) · **Pre-existing** (vc-platform ≥ 3.913.0; not caused by vc-module-return #28)
**Investigation package:** `reports/tickets/Sprint26-20/VCST-5884/vcptcore_dev/evidence-V15/`

## Environment
vcptcore_dev Admin SPA · platform `3.1079.0-alpha.13411` · Return `3.1005.0-pr-28-fb4f` · Orders `3.1018.0-alpha.1451` · Firefox 151 (DPR 1), 1920×1080 and 1366×768; Edge/Chromium as control

## Summary
On Firefox every Admin SPA ui-grid header overflows its content box by about 2 px, so `text-overflow: ellipsis` replaces the visible sort arrow with "…": a sorted column reads "Organization …" / "Return number …" / Orders "Created …" and never shows ▲/▼. Sorting itself works (the request carries the sort, `aria-sort` is right). Edge and Chrome show the arrow. Column width does not matter ("Created …" with 130 px free).

## Steps to reproduce
1. Open the Admin SPA in current Firefox and sign in as an administrator.
2. Orders: the default-sorted "Created" header reads "Created …" with no ▼. Or More → Returns: click "Organization" → "Organization …".
3. Repeat in Edge or Chrome → the arrow is visible.

**Expected:** the sort direction arrow is visible on the sorted header (Firefox is a supported Platform Manager browser).
**Actual:** "…" in place of the arrow on every sorted header, both grids, both widths.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin only |
| 2. Backend Admin | FAIL | `evidence-V15/screenshots/V15-r2-inv-*.png`; header measurements `screenshots/dom-measure-headers-firefox.json` |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST API | PASS | `POST /api/return/search` 200 with `sort organizationName:desc` applied |

**Owning layer:** Layer 2 — Admin SPA platform shell.

## Root Cause Analysis
vc-platform `src/VirtoCommerce.Platform.Web/wwwroot/css/themes/main/sass/modules/_ui-grid.sass:90-97` styles every header `.ui-grid-cell-contents` as `display: inline-block; max-width: 100%`, so the box shrinks to its content; on Firefox the content ends ~2 px past the box (the space before ui-grid's hidden sort-priority `<sub>`, `margin-left: -8px`, `dist/style.css:9721`), and the ellipsis eats the arrow. A debug override back to `width: 100%` brought the ▼ back. Introduced by vc-platform ce9239ea7 (#2950, VCST-4161 "Fix Angular UI Grid double-click autosize", 2025-10-28; first in 3.913.0). vc-module-return #28's minWidths neither cause nor fix it.

## Evidence
![Return list, Organization ascending: "Organization …"](../../screenshots/Admin-UiGrid-Sort-Arrow-Ellipsis-Firefox/V15-r2-inv-organization-asc-1920.png)
![Orders list: "Created …" with 130 px free](../../screenshots/Admin-UiGrid-Sort-Arrow-Ellipsis-Firefox/V15-r2-inv-orders-list-created-desc-130px-slack-1920.png)
![Debug width:100% brings the arrow back](../../screenshots/Admin-UiGrid-Sort-Arrow-Ellipsis-Firefox/V15-r2-inv-orders-created-desc-debug-width100-arrow-back-1920.png)

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin (platform shell CSS)
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Admin SPA ui-grid header styles
- **RCA anchor:** `src/VirtoCommerce.Platform.Web/wwwroot/css/themes/main/sass/modules/_ui-grid.sass:90-97`
- **Routing confidence:** MEDIUM — fix forward without regressing VCST-4161 (a plain revert brings its autosize bug back); untested options: header-only padding-right, take the hidden priority `<sub>` out of layout, or `text-overflow: clip` on headers
