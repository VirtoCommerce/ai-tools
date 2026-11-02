# VCST-6142 — Fix verification (pre-merge, vc-frontend PR #2590)

**Verdict: FIXED (PASS, 3/3 STR).** One limit on coverage, stated under item 4.
**Date:** 2026-10-20 · **Agent:** qa-frontend-expert · **Lane:** playwright-chrome (chromium)
**Account:** `@td(LOY_PERSONAL_NOORG)` · **Store:** B2B-store (vcst-qa API) · **Oracle:** BL-A11Y-003 (WCAG 2.2 SC 1.4.11, 3:1)
**Bug report:** `reports/bugs/open/medium/BUG-missions-completed-check-contrast-below-3-1.md`

## Environments
| Phase | URL | Theme build (footer) |
|---|---|---|
| A — pre-fix | remote vcst-qa storefront | `3.1.0-pr-11-d67b-d67b0e0a` |
| B — fixed | `http://localhost` (`X-VC-Local-Theme: fe-0fc03b75ae19`) | `2.61.0-pr-2590-0a4b-0a4bd8b3` |

**Discrepancy:** the Phase A baseline is a different theme line (3.1.0 with the new header), not the PR's 2.61 base.
Its scrim is already `success-600 @ 0.55`. The original report described `success-400 @ 0.75`.
The symptom still reproduces there. The "page otherwise unchanged" comparison (item 8) is therefore only approximate.

## Test data
This account has exactly **one** completed mission on vcst-qa: "Target number of orders" (Order count, 3 of 3, 100%), on pager page 2.
Its banner is light PNG art (`banner_null_1788864549212.png`).
`AGENT-TEST-MSN-ORDERVALUE` is at 0% for this account. No synthetic state was forced.

## Contrast numbers
| Theme | Pre-fix (icon on translucent scrim) | Fixed (icon vs opaque disc) |
|---|---|---|
| light | screenshot over real art: median **2.34**, p05 2.04 · analytic over white art **2.26** | **5.31** (computed) · pixel median = max = 5.31 |
| dark  | screenshot over this light art: median 9.65, min 1.93 · analytic over black art **2.31** | **7.17** (computed) · pixel p05 = median = 7.17 |

- Fixed, light: disc `color(srgb .2314 .4667 .3294)` (= success-600), alpha **1**, 64×64, radius 9999px. Icon white.
- Fixed, dark: disc `color(srgb .2 .6902 .4549)`, alpha **1**. Icon `#0a0a0a`.
- The 7.17 dark value matches the brief's `red.dark` figure, which means vcst-qa B2B-store runs the Red preset.
- The default/mercury dark value (3.74) cannot be observed on this store and was **not** verified live.
- Pixel ratios were sampled in the central 40×40 px of the disc from the element screenshots, using a PNG decode and the WCAG relative-luminance formula.
- The low "min" values are anti-aliased stroke-edge pixels, not background.

## STR tally — Phase B (fresh navigation each run)
| Run | Light | Dark | Structure `.mission-card__done > .mission-card__check > .vc-icon > svg.lucide-circle-check` |
|---|---|---|---|
| 1 | 5.31 | 7.17 | yes |
| 2 | 5.31 | 7.17 | yes |
| 3 | 5.31 | 7.17 | yes |
**3/3 PASS**

## Checklist
| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Original symptom on pre-fix | **PASS (reproduced)** | Icon is a direct child of `.mission-card__done`; no `.mission-card__check`. Light median 2.34:1 (<3). `A-prefix-completed-card-light-1440.png`, `A-prefix-completed-card-dark-1440.png` |
| 2 | Fixed: ≥3:1 light | **PASS** | 5.31:1 in all 3 runs; disc alpha 1, 64×64. `B-fixed-completed-card-light-1440.png` |
| 3 | Fixed: ≥3:1 dark | **PASS** (Red preset) | 7.17:1 in all 3 runs. `B-fixed-completed-card-dark-1440.png`. default/mercury 3.74 not observable here |
| 4 | Contrast independent of banner art | **PASS (mechanism)**, partial data | Disc alpha = 1. Disc pixels are uniform over art that holds both dark text and light background (median = max). Only one completed mission exists, so a dark banner and a placeholder banner were **not available** |
| 5 | Ring + check inside disc; overlay covers banner; scrim present | **PASS** | Icon 56×56 inside disc 64×64; disc centered (offset 0,0) and inside the overlay. Overlay rect = `.mission-card__image` rect (352×208). Scrim still at 0.55 alpha in both themes |
| 6 | `aria-hidden="true"` on overlay; footer "Mission completed" | **PASS** | Both present in every run |
| 7 | Incomplete cards: no overlay or disc | **PASS** | Page 1: 12 cards, 0 overlays. Page 2: 8 incomplete cards, 0 overlays |
| 8 | Page otherwise unchanged | **PASS** | 3-column grid at 1440; progress bars render; pager 1↔2 works; "Open mission" opens a modal ("Mission completed", 3 of 3, 100%) and Close works. `B-fixed-missions-page-{light,dark}-1440.png`, `B-fixed-mission-modal-dark-1440.png` |
| 9 | No new console errors | **PASS (env noise only)** | Pre-fix: 0 errors. Fixed: one repeated 404 per load, `/modules/$(VirtoCommerce.SalesRep)/plugins/vc-frontend/mf-manifest.json` (see below). Plus a WebSocket close warning (code 1000, clean) |
| 10 | Mobile 375px: disc centered and visible | **PASS** | Disc offset (0,0), inside the overlay and the viewport; no horizontal scroll. `B-fixed-completed-card-dark-375.png` |

**Item 9 detail:** the 404 comes from an unsubstituted module-path placeholder in the local container's plugin manifest.
It is an environment artifact of the local proxy setup and is not caused by the mission-card change.

## Console summary
- Pre-fix `/account/missions`: 0 errors, 0 warnings.
- Fixed: the SalesRep `mf-manifest.json` 404 (local env) and one clean WebSocket close. Nothing from mission-card, and no Vue warnings.

## Screenshots (`screenshots/`)
- `A-prefix-completed-card-light-1440.png`
- `A-prefix-completed-card-dark-1440.png`
- `B-fixed-completed-card-light-1440.png`
- `B-fixed-completed-card-dark-1440.png`
- `B-fixed-missions-page-light-1440.png`
- `B-fixed-missions-page-dark-1440.png`
- `B-fixed-mission-modal-dark-1440.png`
- `B-fixed-completed-card-dark-375.png`

## Residual risk / follow-ups
- Not covered live:
  - a completed card over dark art or over the placeholder banner (no such data);
  - the default/mercury dark presets (3.74, the lowest margin).
- The opaque disc makes the art irrelevant by construction. A recheck on a store running the Coffee or Mercury preset would close the preset gap.
- The Phase A baseline was a different theme line. A same-base A/B would need a 2.61 build without PR #2590.

## KB
- `kb_ask` returned no answering entry (closed with `kb_none`).
- Captured **KB-0ADAC454**: the pre-fix completed-card overlay structure and contrast, marked defect VCST-6142.
