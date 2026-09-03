# Missions UI diverges from the approved design in three places — missing order-modal banner, mobile grid instead of a carousel, 6 px card banner — **P3**

## Status: CONFIRMED (spec + live + source)
**Found by:** `/qa-design VCST-5346` (2026-08-28) · `vs. DESIGN` axis against project `e3742011-b4ef-4cd0-a419-722e09833d37`
**Tracker:** VCST-5833 (Subtask of VCST-5346)
**Archetype:** `PARITY`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, chrome, 375 / 768 / 1280 px, signed in.

## Summary
Rolled up because all three are the same violation class — implemented markup omits or substitutes an element the approved design specifies — and all three sit in the same feature.

| # | Design says | Ships as | Verdict |
|---|---|---|---|
| 1 | Order-value modal opens with a **170 px banner image** (Frame 2) | no banner; `order-mission-modal.vue` contains no `VcImage` and the live modal reports `imgs: []` | **MISSING** |
| 2 | Mobile missions is a **carousel**: one card, 3 dots (active 18×6 `primary-500`, inactive 6×6 `neutral-300`), a "1 / 3" counter (Frame 7) | `display:grid`, 1 column, `scroll-snap: none`, `scrollWidth == clientWidth`, numbered `vc-pagination` | **DRIFT** + **MISSING** (dots / swipe affordance) |
| 3 | Card banner **150 px** (Frames 1 and 7) | **144 px** — `mission-card.vue` declares `@apply … h-36` | **DRIFT** 6 px |

## STR
1. Sign in, go to `/account/missions`.
2. Open an order-value mission (`AGENT-TEST-MSN-ORDERVALUE`) → no banner above the title.
3. Set the viewport to 375 px → cards stack in a grid with numbered pagination; no dots, no horizontal swipe.
4. Measure any card banner → 144 px.

## Expected vs Actual
As tabulated above. Items 1 and 2 are the user-visible ones; item 3 is cosmetic.

## Recommended fix
1 and 2 are product decisions before they are code: confirm with the designer whether the banner and the carousel are in scope for this release, since the mobile pattern substitution is a deliberate-looking choice rather than an oversight.

**For item 3, fix the design, not the code.** 150 px is not a step on the Tailwind scale the design system itself documents (`h-36` = 144, next step 152), so `h-36` is the correct implementation of a spec value that cannot be expressed in the declared scale. Recommend the design adopt 144.

## Notes
Two further design-declared surfaces are **not** in this report because they are already tracked: the "Redeem products" CTA and the "Catalog" link are the two dead locale keys of finding F3 on VCST-5346 (`redeem_products`, `redeem_banner.catalog` — both strings ship in all 13 locale files, referenced by zero `.vue` files, and design Frames 1/2 declare both, so F3 now has a spec anchor). A **fourth**, design Frame 6's customer auto-registration preview, has no acceptance criterion on the ticket at all — that is a PO scope question, not a defect.

Card action buttons render 44×44 against a designed 40×40, and product thumbs / modal close / state dot all render slightly **larger** than spec — all improve touch compliance, all deliberately not filed.

## Refs
Full audit + the 23-row spec diff: `reports/tickets/Sprint26-17/VCST-5346/design-report.md`
