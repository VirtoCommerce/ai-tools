# BUG: Pricing Export — "Select data to export" toolbar overlaps the grid column header

## Status: CONFIRMED — DUPLICATE of VCST-5276 (open fix PR #101 is INCOMPLETE)

**Env:** vcst-qa @ Platform 3.1038.0 (running PR #101 alpha artifact) · Admin SPA · Chrome DevTools MCP

## Summary
The generic Export data-picker blade ("Select data to export") renders the **Important!** note and the search/filter row stacked inside a fixed-height `blade-static`, so the search input + filter dropdown overflow **on top of** the ui-grid column header (40px overlap). This is the same defect already filed as **VCST-5276** (status: In Progress). The open auto-fix **PR #101** removed the absolute-positioning hacks but **deleted the height reservation without replacing it**, so the bug still reproduces on the deployed PR build — exactly the failure mode our own `css-layout-patterns.md` Recipe 2 warns about.

## Steps to Reproduce
1. Admin → **Pricing** → Price lists.
2. Toolbar → **Export** → "Export price lists" blade opens.
3. Click **Select data type** → pick **Catalog** category → choose the **Catalog** data type (a source with `restrictDataSelectivity = true`, which shows the Important! note).
4. Back on the Export blade, click **Select data for export**.
5. Observe the "Select data to export" picker blade.

## Expected vs Actual
- **Expected:** The Important! note, the search field + filter dropdown, and the ui-grid each occupy distinct vertical bands; nothing overlaps.
- **Actual:** The note renders as a 2-line band; the search/filter row is pushed below the `blade-static` box and lands on the grid's "Name"/"Pic" header row. Search placeholder visually overlaps "Name".

## Geometry Measurement (read-only `getBoundingClientRect()` — overlap is numeric, not a screenshot)
| Element | top | bottom | height | Note |
|---|---|---|---|---|
| `.blade-static` (container) | 187 | 257 | **70 (fixed)** | too small for note + searchrow |
| `p.text.__note` ("Important!…") | 197 | 239 | 42 | wraps to 2 lines |
| `.form-group.searchrow` | **255** | **323** | 68 | spills past the 257 box bottom |
| `.ui-grid` | **257** | 663 | 406 | starts where blade-static ends |
| `.ui-grid-header-cell-row` ("Name") | **258** | 298 | 40 | overlapped by searchrow |

**Overlap = searchrow (255–323) ∩ grid header (258–298) ≈ 40px.** Acceptance for the fix: `gridHeader.top >= searchRow.bottom` (`overlapPx === 0`).

Screenshot: `reports/bugs/screenshots/BUG-pricing-export-select-data-layout.png`
Console: clean — pure CSS/layout defect.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only feature |
| 2. Backend Admin (Admin SPA) | **FAIL** | screenshot + geometry table above |
| 3. GraphQL xAPI | N/A | no data layer involved |
| 4. Platform REST API | N/A | no data layer involved |

**Owning layer:** Layer 2 — Admin SPA (CSS/layout only).

## Root Cause Analysis
File: `vc-module-export` → `src/VirtoCommerce.ExportModule.Web/Scripts/blades/export-generic-viewer.tpl.html`.

`.blade-static` is a **fixed-height (70px)** platform container with `overflow: visible`; the grid (`.blade-content`) flows in immediately below it. **PR #101** (branch `claude/qa-autofix/VCST-5276`) correctly removed the old inline `position:absolute` / fixed-px offsets and migrated to `searchrow`/`column-half`/`filter-edit`, **but it also deleted the `ng-style="…{'height':'140px'}"` height reservation and left the `.inner-block` note stacked above `.searchrow` inside the still-70px `blade-static`.** When `restrictDataSelectivity = true` the note wraps to 2 lines (~68px), consuming the entire 70px budget, so the searchrow (another ~68px) overflows onto the grid header.

This is the documented "failed PR #101 attempt" in `.claude/skills/development/angular-admin/css-layout-patterns.md` Recipe 2: *"Do NOT just delete the height… removing `ng-style` collapsed blade-static back to 70px and re-broke it."*

## Remaining Fix (completes PR #101)
Keep PR #101's `searchrow`/`column-half` cleanup; additionally reserve room for the note. **Option A (cleanest):** move the `.inner-block` note OUT of `blade-static` into the `.blade-content` `.inner-block` above the grid, leaving `blade-static` a single 70px searchrow. **Option B:** keep the note pinned but reserve height with a class, not inline px — `<div class="blade-static" ng-class="{'__expanded': blade.exportDataRequest.restrictDataSelectivity}">`. No inline `position`/fixed-px/`ng-style`. Verify with the geometry script (`overlapPx === 0`) + render-harness red→green.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin SPA
- **Suggested repo:** VirtoCommerce/vc-module-export
- **repoKind:** module
- **Component / module:** Export (generic export data-picker blade)
- **RCA anchor:** `src/VirtoCommerce.ExportModule.Web/Scripts/blades/export-generic-viewer.tpl.html` (`blade-static` holding `.inner-block` note + `.form-group.searchrow`)
- **Routing confidence:** HIGH
- **Disposition:** Duplicate of **VCST-5276** (In Progress). Do not file a new ticket — PR #101 needs the height-reservation step above to actually close it. Recommend adding this evidence to VCST-5276 / requesting changes on PR #101.
