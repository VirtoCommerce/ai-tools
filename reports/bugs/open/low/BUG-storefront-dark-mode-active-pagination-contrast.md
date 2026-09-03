# Dark mode: the active pagination page number renders at **4.37:1** — just under the AA text minimum — **P3**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5838 (standalone Bug)
**Archetype:** `RENDER`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, preset **Red**, **dark mode** (`html.dark`), chrome. Shared `vc-pagination` — reproduces anywhere the component paginates, not only on missions.

## Summary
`vc-pagination__page--active` renders `#0a0a0a` text on a `#d34247` fill in dark mode: **4.37:1**, against the 4.5:1 WCAG 1.4.3 minimum for normal-size text. Light mode passes (4.59:1) — the dark fill is the regression, and it is the same `#d34247` that `--color-primary-500` and `--color-danger-500` both resolve to in dark (see the token-collision report).

## STR
1. Sign in, go to `/account/missions` (13 seeded missions ⇒ 2 pages).
2. Switch to dark mode.
3. Measure the contrast of the active page number against its own fill.

## Expected vs Actual
- **Expected:** ≥ 4.5:1 (normal text, AA).
- **Actual:** 4.37:1.

## Recommended fix
Lighten the active-page text to white, or darken the active fill in the dark palette. A white foreground on `#d34247` clears the criterion comfortably.

## Notes
Marginal but deterministic — it is a fixed token pair, not content-dependent, so it fails identically for every user in dark mode. Found while auditing missions; the owner is the shared UI kit.

Reaching dark mode required a keyboard workaround: the QA environment badge (`z-index 21`) sits over the 20 × 20 dark-mode toggle and intercepts the click. That is an environment-only affordance, reported separately in the audit, not a product defect.

## Refs
`WCAG 1.4.3` · `PROPOSED-BL-UI-008` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N8)
