# "Points history" link is an **18 px-tall** touch target at every viewport — below the WCAG 2.2 AA minimum — **P3**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5834 (Subtask of VCST-5346)
**Archetype:** `RENDER`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome, measured at 375 / 768 / 1280 px, signed in.

## Summary
`missions-banner__link` ("Points history") in the balance banner measures **86.9 × 18 px**. WCAG 2.2 SC 2.5.8 (Level **AA**) requires 24 × 24 CSS px, so this is below the minimum — not merely below the 44 px enhanced bar. It is the same size at all three viewports, so mobile users get an 18 px tap target on the page's only secondary navigation link.

## STR
1. Sign in as the loyalty-missions fixture account, go to `/account/missions`.
2. Measure the bounding rect of the "Points history" link in the balance banner (`getBoundingClientRect`, padding included).
3. Repeat at 375, 768 and 1280 px.

## Expected vs Actual
- **Expected:** ≥ 24 × 24 px (AA); ideally 44 × 44 (`BL-UI-006`'s enhanced tier).
- **Actual:** 86.9 × 18 px at every viewport.

## Recommended fix
Give the link vertical padding (or a min-height) so its hit area reaches 24 px — padding counts toward the target, so no visual change to the text is needed.

## Notes
This is the **only** genuine below-AA target on the surface. The quantity steppers (32 × 32) and qty input (56 × 30) were checked and deliberately **not** filed: both clear the 24 px AA minimum, 32 px is a declared `UI_KIT_BUTTON_SIZES_PX` size, and design Frame 3 specifies `width:32px; height:32px` exactly — so they sit in `BL-UI-006`'s AA-to-AAA **WARN** tier, which the invariant explicitly says to cross-check before filing rather than treat as a failure.

## Refs
`WCAG 2.5.8` (AA) · `BL-UI-006` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N7, and N2 for the steppers that were not filed)
