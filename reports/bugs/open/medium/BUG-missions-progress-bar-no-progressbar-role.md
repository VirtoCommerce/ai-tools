# Mission progress bars expose no `progressbar` role or value to assistive tech — **P2**

## Status: CONFIRMED (live, two lanes)
**Found by:** agent — testing VCST-5957 (`/qa-test` 3x + 4v, 2026-10-01)
**Tracker:** **VCST-6143** (Bug, Medium) · Relates VCST-5957 (standalone, BL-A11Y on a feature ticket)
**Archetype:** `RENDER` · **Oracle:** `BL-A11Y-002` / `BL-A11Y-004` (WCAG 2.2 SC 4.1.2 Name, Role, Value; 1.3.1 Info and Relationships)
**Provenance:** PRE-EXISTING. The bars predate PR #2524, which only recoloured them (info-500 / success-500). Dedup: no existing ticket. VCST-5827 (urgency by colour alone) is a different criterion.

**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` · preset Red · edge 1440 px, signed in as `@td(LOY_PERSONAL_NOORG)`.

## Summary
The mission card bar (`.mission-card__track` / `__bar`) and the order-modal bar (`.order-mission-modal__track` / `__bar`) are plain `div`s. They have no `role="progressbar"`, no `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, and they are not a `<progress>` element. The value appears only as the adjacent "N%" text, which is not programmatically tied to the bar. A screen-reader user hears a percentage with no indication of what it measures.

## STR
1. Sign in, open `/account/missions`.
2. Inspect any card's progress bar in the accessibility tree; open an order-value mission and inspect the modal bar.

## Expected vs Actual
- **Expected:** each bar exposes the progressbar role with its current, minimum and maximum values, labelled by the mission (`BL-A11Y-002/-004`).
- **Actual:** generic container, no role, no value.

## Evidence
- `reports/tickets/Sprint26-19/VCST-5957/screenshots/4v-missions-page-light-1440.png`, `4v-order-modal-completed-light.png`
- `reports/tickets/Sprint26-19/VCST-5957/design-report.md` row A2; discovery `reports/exploratory/SBTM-VCST-5957-2026-10-01.md`

## Fix Routing
- **Repo:** `VirtoCommerce/vc-frontend` · `client-app/modules/loyalty/components/mission-card.vue`, `order-mission-modal.vue`
- **Hint:** add `role="progressbar"`, `aria-valuenow="{percent}"`, `aria-valuemin="0"`, `aria-valuemax="100"` and `aria-labelledby` the mission title, or use the UI kit's progress primitive if one exists.
