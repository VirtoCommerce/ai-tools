# `/account/missions` scores **CLS 0.2195** — over twice the 0.1 threshold — and the shifting elements are shared account chrome, not the mission cards — **P2**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5837 (standalone Bug)
**Archetype:** `RACE`
**Status:** REJECTED

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome 1280 px, signed in, first load (cold).

## Summary
Cumulative Layout Shift on `/account/missions` measures **0.2195** across 2 shifts. `BL-UI-001` fails above 0.1, and 0.25 is the P0 line, so this sits just under it. The attribution matters more than the number: the shifting nodes are **`mega-menu__nav`, `account-navigation-item` and `vc-widget`** — shared header and account-sidebar chrome. The mission cards themselves are stable, and the rest of the missions surface measured clean (modal open Δtop/left/height = 0/0/0, paginate Δ0).

## STR
1. Sign in as the loyalty-missions fixture account.
2. Load `/account/missions` cold (fresh navigation, no warm cache) at 1280 px.
3. Record CLS with a `PerformanceObserver` on `layout-shift` (or `LAYOUT_SNIPPETS` / DevTools performance trace) and read the attributed sources.

## Expected vs Actual
- **Expected:** CLS ≤ 0.1 (`BL-UI-001`).
- **Actual:** 0.2195 over 2 shifts, attributed to shared chrome.

## Recommended fix
Reserve space for the mega-menu nav and the account-navigation items before their data resolves — a min-height or a skeleton at the same dimensions. The usual cause is a nav list rendering empty then filling.

## Notes — scope before fixing
Measured on **one** page. Because every attributed source is shared chrome rather than missions code, this is likely reproducible across other `/account/*` pages and possibly site-wide; confirm on a second account page before assigning, and treat the owner as the layout/nav components rather than the loyalty module. Filed against the page where it was measured so the evidence stays attached to a real measurement.

Not filed under VCST-5346 as an in-scope regression for the same reason — nothing in the missions PR is implicated.

## Refs
`BL-UI-001` (layout stability) · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N5)
