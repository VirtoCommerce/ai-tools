# German account-sidebar labels lowercase German nouns — "Aufgaben & **h**erausforderungen" — **P3**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5839 (standalone Bug)
**Archetype:** `CONVENTION`
**Status:** REJECTED

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, locale **de-DE**, chrome, signed in.

## Summary
German capitalises every noun. Several account-sidebar labels apply English title-case rules instead, lowercasing the second noun in a compound label:

| Renders as | Should be |
|---|---|
| Aufgaben & **h**erausforderungen | Aufgaben & **H**erausforderungen |
| Gutscheine & **a**ktionen | Gutscheine & **A**ktionen |
| Gespeicherte **k**reditkarten | Gespeicherte **K**reditkarten |

The missions page's own H1 renders "Herausforderungen" correctly, so the same word is right in one place and wrong in the sidebar — the defect is in the sidebar's locale strings, not in a text-transform.

## STR
1. Switch the storefront to **Deutsch**.
2. Sign in and open any `/account/*` page.
3. Read the sidebar navigation labels.

## Expected vs Actual
- **Expected:** all nouns capitalised, per German orthography.
- **Actual:** the second noun of each compound label is lowercase.

## Recommended fix
Correct the affected keys in the `de` locale files. Worth a sweep of the whole German sidebar namespace rather than only these three, since the pattern suggests the strings were title-cased from English.

## Notes
Localisation on this surface is otherwise good — the missions page localised fully, including card footers, chips and pagination, and the `16.630` thousands separator is correct for de-DE.

## Refs
Full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N12)
