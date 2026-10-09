# Admin Return list: "Item count" header clipped by the grid-options button and the Organization sort arrow is hidden — **P3**

## Status: CONFIRMED — BELOW SEVERITY FLOOR (Low/P3): draft kept, NOT filed in the tracker
**Found by:** agent — testing VCST-5884
**Tracker:** none (below the 5-file floor Critical/High/Medium); named in the VCST-5884 QA-Complete comment under "Not filed (below severity floor)"
**Oracle:** `BL-UI-004` (content boundary: text must not be clipped by `overflow:hidden` without an ellipsis, and a control must not cover content).
**Provenance:** IN-SCOPE — vc-module-return #28 added the 9th "Organization" column with no width
(`src/VirtoCommerce.ReturnModule.Web/Scripts/blades/return-list.tpl.html:28`).

## Environment
- Admin SPA: Platform 3.1076.0, Return `3.1005.0-pr-28-62f9` (vc-module-return PR #28 @ 62f9aae), env vcst, viewport 1920 px
- Storefront theme `2.60.0-pr-2523-9e4e-9e4e67ef` (not involved)
- Seen by four runs: discovery, lane B, lane V, C1 (`REG-2026-10-08-1840`, case RET-ORG-041 held at the BL-UI-004 expectation)

## Steps to reproduce
1. Sign in to the Admin SPA as `{{ADMIN_USER}}` at 1920 px.
2. More -> Return -> Return list. The blade stays ~940 px wide with nine columns.
3. Read the header row; sort by **Organization** (the request sends `sort: organizationName:asc`, empties first).

## Expected
Every header is readable and a visible sort glyph shows the sort direction.

## Actual (measured by the visual lane)
- The grid-options button (x 1138-1164, y 265-291) covers the last header "Item count" (cell x 1070-1169, ~68 px of text): it reads "Item cour".
- The Organization sort arrow (`ui-grid-icon-up-dir`, 20 px at x 665-685) sits inside a header whose content is `overflow:hidden` at x 670, so only ~5 px of it shows. `aria-sort=ascending` is present.
- All nine data columns are exactly 100 px wide; most headers are ellipsized ("Return num...", "Organizatio...", "Return statu...").

![Return list at 1920 px, nine columns, clipped headers](../../screenshots/admin-return-list-header-clipped-and-organization-sort-arrow-hidden-VCST-5884/V6-admin-returns-1920.png)
![Sorted by Organization: the sort arrow is almost fully hidden](../../screenshots/admin-return-list-header-clipped-and-organization-sort-arrow-hidden-VCST-5884/V6-admin-organization-sorted-1920.png)
![Nine-column grid, Organization sorted](../../screenshots/admin-return-list-header-clipped-and-organization-sort-arrow-hidden-VCST-5884/X1-admin-return-grid-9-columns-organization-sorted.png)
![C1 RET-ORG-041: Item count header clipped](../../screenshots/admin-return-list-header-clipped-and-organization-sort-arrow-hidden-VCST-5884/RET-ORG-041-FAIL-item-count-header-clipped-1920.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | Admin-only surface |
| 2. Backend Admin (Admin SPA) | **FAIL** | header clipping and hidden sort glyph, measured at 1920 px |
| 3. GraphQL xAPI | N/A | no xAPI involved |
| 4. Platform REST API | PASS | sorting itself works: `sort: organizationName:asc` is sent and applied |

**Owning layer:** 2 — Admin SPA, vc-module-return `return-list.tpl.html:28` (new column without a width).

## Impact / severity — P3, Low
A readable-header and sort-state cosmetic defect. No data loss; sorting works.

## Fix Routing
Repo `vc-module-return` (module Admin SPA). Give the new column a width / a `min-width` on the header row, or reserve space for the
grid-options button. Not a breaking change.
