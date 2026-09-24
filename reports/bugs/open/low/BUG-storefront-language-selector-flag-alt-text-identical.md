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

---

## Update 2026-09-21 — reproduces on a second env and build, and there is a second, separate defect in the same list

Re-observed during the `/qa-test VCST-5732` re-test on **vcptcore-qa @ theme
`2.58.0-pr-2464-2971-2971a77b`** (the original was vcst-qa @ `2.57.0-pr-2396-5924`), so this is env- and
build-independent, as a shared header component should be expected to be. **Not re-filed — VCST-5840
owns it**, and the P3 grade recorded above stands; a re-test does not re-grade a finding to suit itself.

All **12** locale options carry the `English (United States)` flag image with that alt text, so each
option's accessible name is self-contradictory (`"English (United States) Deutsch"`, `"English (United
States) русский"`). Unchanged from the original description.

**New, and NOT covered by VCST-5840: the list contains two identical `Nederlands` entries.** That is a
data defect in the locale list rather than an `alt`-text defect, so fixing the `alt` will not remove it and
it will survive this ticket. `Low` — recorded here rather than filed, per the severity floor. Worth
folding into VCST-5840's scope as a one-line addition when someone touches that component, since the two
live in the same list.

**Also corrects a repo memory:** `reference_vcptcore_qa_locales_and_reviews` records vcptcore-qa as having
**no ru/pl locale**. That is now stale for `B2B-store`, which lists 12 locales including `русский` and
`polski` — so the plural/i18n checks that memory ruled out on this stand may in fact be runnable.
