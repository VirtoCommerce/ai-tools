# Missions redesign polish — unnamed decorative check icon, points-chip colour differs card vs modal, 208 px banner crops baked-in artwork text — **P3**

## Status: CONFIRMED (live: 3x, 4a, 4v, C1 REG-2026-10-01-1243)
**Found by:** agent — testing VCST-5957 (`/qa-test`, 2026-10-01)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment.
**Provenance:** IN-SCOPE — all three come from vc-frontend PR #2524. Rolled up: same surface, same change, each cosmetic or assistive-tech polish.

**Env:** vcst-qa · theme `2.59.0-pr-2524-3069-30691594` · Red preset · `@td(LOY_PERSONAL_NOORG)`.

| # | What | Actual | Expected | Evidence |
|---|---|---|---|---|
| 1 | Completed-overlay `circle-check` (`.mission-card__done`) | an unnamed `img` in the a11y tree (no `aria-hidden`, no label); the state is also given as the text "Mission completed" | decorative, so `aria-hidden="true"` (`BL-A11Y-002`) | `reports/regression/REG-2026-10-01-1243/screenshots/MSNF-090-FAIL-completed-overlay-unnamed-img.png` |
| 2 | Points chip | card: warning-tonal (amber); order and SKU modals: primary-soft (red) | one chip style for the reward in both places (design annotation A2) | 4a row 3 · `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-chip-order-value.png` |
| 3 | Card banner `h-52` (208 px) with `object-cover` | 2048×768 artwork cropped to ~66 % width, cutting baked-in text ("urchase 5 specific KUs", "ake 3 orders"); at 144 px about 91 % survived | the artwork's text stays legible, or the art carries no text | `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-missions-page4-1920.png` · `3x-card-banner-artwork-text-cropped.png` |

## Fix Routing
`VirtoCommerce/vc-frontend` · `client-app/modules/loyalty/components/mission-card.vue` (#1, #3), `order-mission-modal.vue` / `sku-mission-modal.vue` (#2). #3 may instead be an artwork/content fix (design task VCDZ-897).
