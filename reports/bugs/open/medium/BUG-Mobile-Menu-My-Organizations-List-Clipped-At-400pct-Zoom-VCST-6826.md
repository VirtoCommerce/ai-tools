# BUG: Mobile menu "My organizations" list collapses to ~2 px on short viewports (400% zoom) — organizations cannot be reached

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-12-1235-W5g

**Severity:** Medium (WCAG 2.2 SC 1.4.10 Reflow, loss of function) · **Tracker:** VCST-6826 · **Related:** VCST-6644 (Sprint 26-22 regression), VCST-4357 (introduced the fixed height)

## Environment
- Stand `vcst`, store `B2B-store`, Platform 3.1097.0, theme vc-frontend 2.62.0-alpha.2647 (storefront bundle string = `vc-deploy-dev@vcst-qa` `theme/artifact.json`); Edge/Chromium Playwright lane.
- Deterministic (2/2). Storefront-only CSS: no failing request, no console error (TRACE_ID: none).

## Summary
The organization list in the mobile menu (burger → **Corporate** → **My organizations**) has a fixed height of
`100vh − 224px`. The chrome above it is taller than 224 px, so on short viewports the list shrinks to almost nothing:
at 320×225 (400% zoom of a 1280×900 window) it is 1.6 px tall and no organization row is visible or clickable.

## Steps to reproduce
1. Sign in as a user who belongs to two or more organizations.
2. Set the viewport to 320×225 (or zoom a 1280×900 browser window to 400%).
3. Open the burger menu → **Corporate** → **My organizations**.
4. Try to see or select the second organization (scroll, PageDown/End, pointer).

## Actual
- The list container `.multi-organization-menu` is 1.6 px tall (clientHeight 2, scrollHeight 104); both rows sit outside it.
- The outer panel scrolls only 28 px; PageDown/End reveals no row. Pointer/touch: no target. Keyboard: ArrowDown switches the organization blind (the option is never visible).
- 320×256: list 32 px — one label line in its own nested scroller. 568×320 and 640×360: rows visible (2 orgs).

![320x225 menu open](../../screenshots/Mobile-Menu-My-Organizations-List-Clipped-At-400pct-Zoom/B2C-ORG-057-320x225-open.png)
![320x225 after End](../../screenshots/Mobile-Menu-My-Organizations-List-Clipped-At-400pct-Zoom/B2C-ORG-057-320x225-end.png)

## Expected
- WCAG 2.2 SC 1.4.10: at 320 CSS px width content reflows into one vertical scroll with no loss of function — every organization can be seen and selected by scrolling the panel.
- Storefront user guide (Company members → Switch between your companies): every company is listed and selectable; the mobile version keeps the same function.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | `screenshots/B2C-ORG-057-320x225-*.png`, `B2C-ORG-057-dom-320x225-end.yml` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | PASS (both organizations returned) | `network/requests.txt` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
- `client-app/shared/layout/components/header/_internal/mobile-menu/menus/multi-organisation-menu.vue:104` —
  `h-[calc(100vh-224px)] overflow-y-auto` on the list root, which is also the `VcInfinityScrollLoader` viewport (lines 2, 48–57).
- Introduced by `7e2a271f59` (VCST-4357, PR #2092, 2025-12-22); before it the list had no fixed height. Not new in Sprint 26-22.
- Present in both latest stable bundles: v16 → theme 2.59.0 (line 104), v15 → theme 2.51.2 (line 81); unchanged at 2.60.0, 2.61.0, dev.
- Package: `reports/regression/REG-2026-11-12-1235-W5g/evidence/B2C-ORG-057/` (`root-cause.md`, `source/findings.md`).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** header mobile menu — multi-organisation menu
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/mobile-menu/menus/multi-organisation-menu.vue:104` — drop the fixed `h-[calc(100vh-224px)]` (use the parent `section` as the loader viewport) or give the list a usable min-height
- **Routing confidence:** HIGH
- Separate observation (not investigated): Tab can move focus to page content behind the open mobile menu (no focus trap).
