# Language selector: every option's flag `alt` is "English (United States)", so screen readers announce "English (United States) Deutsch" — **P3**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28) · incidental, outside the audited feature
**Tracker:** VCST-5840 (standalone Bug)
**Archetype:** `RENDER`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome. Site-wide header component — not missions code.

## Summary
Each language option in the header selector pairs a flag image with its language name, but every flag's `alt` carries the **current** language rather than the one it represents. So the German option announces as "English (United States) Deutsch", and each option's accessible name contradicts itself. The flag is decorative — the adjacent text already names the language — so the correct fix is an empty `alt`.

## STR
1. Open `{{FRONT_URL}}` in any locale.
2. Open the language selector in the header.
3. Inspect each option's `<img alt>`, or read the options with a screen reader / the accessibility tree.

## Expected vs Actual
- **Expected:** `alt=""` on a decorative flag beside its own label (WCAG 1.1.1), so each option announces as just its language.
- **Actual:** every flag's `alt` is "English (United States)", producing a contradictory accessible name per option (WCAG 4.1.2).

## Recommended fix
`alt=""` on the flag image. If the flag must be informative, set it to the language that option selects.

## Notes
Filed as its own ticket rather than against VCST-5346: it is a shared header component and unrelated to missions. Found while auditing locale fallback on `/account/missions`.

## Refs
`WCAG 1.1.1`, `WCAG 4.1.2` · `BL-A11Y-002` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (O1)
