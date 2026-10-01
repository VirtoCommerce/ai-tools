# Completed-mission check icon fails 3:1 non-text contrast over its overlay — 2.04:1 (light) / 2.56:1 (dark) — **P2**

## Status: CONFIRMED (live, two lanes)
**Found by:** agent — testing VCST-5957 (`/qa-test` 4a + 4v, 2026-10-01)
**Tracker:** **VCST-6142** (Bug, Medium) · Relates VCST-5957 (standalone, BL-A11Y on a feature ticket — never a Sub-task)
**Archetype:** `RENDER` · **Oracle:** `BL-A11Y-003` (WCAG 2.2 SC 1.4.11 Non-text Contrast, AA)
**Provenance:** introduced by vc-frontend PR #2524 (`mission-card.vue` `__done` overlay)

**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` · preset **Red** (WCAG-gated) · B2B-store · chrome + edge, 1440/1920 px, signed in as `@td(LOY_PERSONAL_NOORG)`.

## Summary
A completed mission is marked by a 56 px `circle-check` drawn over a `success-400 @ 0.75` scrim laid on the mission's banner art. The check does not reach 3:1 against what is actually behind it:

| Theme | Check colour | Measured against | Ratio |
|---|---|---|---|
| light | white | scrim over white / light art | **2.04:1** |
| light | white | scrim over the fallback placeholder | 2.56–4.49:1 |
| dark | `#0a0a0a` | scrim over dark-navy art | **2.79:1** |
| dark | `#0a0a0a` | scrim over black | **2.56:1** |

The design (Changes artifact item 4) specifies a darker, more transparent scrim, `success-600 @ 55 %`. The PR ships `success-400 @ 75 %`, which is lighter and more opaque. The completion icon is the redesign's main visual cue for "done", so the low contrast lands on the story's headline element.

## STR
1. Sign in, open `/account/missions`, find a completed mission (e.g. `@td(MSN_ORDERVALUE)`).
2. Measure the check glyph against the composited overlay where its ring crosses light banner pixels.
3. Switch the header theme to dark and repeat.

## Expected vs Actual
- **Expected:** the check ≥ 3:1 against adjacent colours in both themes (`BL-A11Y-003`).
- **Actual:** 2.04:1 (light, light art), 2.56–2.79:1 (dark).

## Evidence
- `reports/tickets/Sprint26-19/VCST-5957/screenshots/4v-missions-page-light-1440.png`, `4v-missions-page-dark-1440.png`, `4a-card-completed-placeholder.png`
- Measurements: `reports/tickets/Sprint26-19/VCST-5957/design-report.md` rows A3, A4
- Case holding the spec expectation: `MSNF-091` (083c, Draft)

## Notes
"Mission completed" is also shown as text in the card footer, so the state is not conveyed by the icon alone. This is a non-text-contrast failure, not a colour-only one.

## Fix Routing
- **Repo:** `VirtoCommerce/vc-frontend` · `client-app/modules/loyalty/components/mission-card.vue` (`.mission-card__done`)
- **Hint:** use the designed scrim (`success-600 @ 55 %`), or a solid disc behind the glyph, so the contrast doesn't depend on the banner art.
