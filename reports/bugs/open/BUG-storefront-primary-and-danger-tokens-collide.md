# A red-primary tenant collapses "in progress" and "expiring" into one colour — `--color-primary-500` == `--color-danger-500` — **P2**

## Status: CONFIRMED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5836 (standalone Bug)
**Archetype:** `CONVENTION`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, preset **Red**, chrome. Dark mode is where they become identical; light mode is where they become indistinguishable.

## Summary
The palette contract permits this by construction, which is why it is a design-system bug and not a missions one. `brand-palette.css` declares Primary / Secondary / Accent / Neutral **recolorable per brand and theme**, while `colors_and_type.css` declares the state colours Info / Success / Warning / Danger **static** — *"not touched by a recolor"*. Nothing reconciles the two: a tenant who recolors primary to red now has a red "primary" and a red, unchangeable "danger".

Measured on the Red preset:

| Token | Light | Dark |
|---|---|---|
| `--color-primary-500` | `#e52121` | `#d34247` |
| `--color-danger-500` | `#de3131` | `#d34247` |

Dark: **identical**. Light: **1.00:1** apart. On `/account/missions` the in-progress bar (`primary-500`) and the near-expiry date badge (`danger-500`) therefore carry the same colour, and colour is the badge's only channel — see the sibling report on the date ladder, where amber is the *only* other state a live mission can reach.

## STR
1. Open `{{FRONT_URL}}/account/missions` signed in as the loyalty-missions fixture account.
2. Note the progress-bar fill colour and the date-badge dot colour on a mission with < 10 days left.
3. Switch to dark mode (`html.dark`) and repeat.
4. Resolve `--color-primary-500` and `--color-danger-500` from `:root`.

## Expected vs Actual
- **Expected:** a semantic state colour is distinguishable from the brand accent under every shipped preset — a progress indicator must not read as an error.
- **Actual:** identical in dark, 1.00:1 apart in light.

## Recommended fix
Either (a) exclude a hue band around each static state colour from the recolorable primary range and validate it when a preset is authored, or (b) let a preset override the state scales too, so a red-primary tenant can move danger. Today the contract forbids (b) and does not check (a).

## Notes
Light-mode `danger` / `warning` / `success` match the declared spec **exactly** (`#de3131` / `#fc9e00` / `#3e845b`), so nothing has drifted — the declared values themselves collide with a sanctioned recolor. Dark-mode values are `UNSPEC` (the design project ships no dark artboards), so this rests on the WCAG criterion, not on the spec.

## Refs
`WCAG 1.4.1` (use of colour) · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N4)
