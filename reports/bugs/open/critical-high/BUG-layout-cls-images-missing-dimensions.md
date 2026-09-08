# Cumulative Layout Shift on home & catalog — late-landing `.features-block` displaces the page — P1

**Severity:** P1 · **Type:** Layout / Web Vitals (BL-UI-001)

**Env:** vcst-qa @ storefront build `index-CJ1Fcmg9.js` (2026-07-25). Measured by `npm run layout:run` (suite 048c, cases `LAYOUT-CLS-001` / `LAYOUT-CLS-002`), Chromium 1280×900, Fast-3G.

> **Root cause CORRECTED 2026-07-25 — this bug previously blamed hero-carousel images.** That is no longer the cause (and the numbers are worse than first recorded). See "Correction" below. The original P1 verdict stands.

## Summary
Home page CLS is **0.502** and catalog is **0.198** — home is 2× the 0.25 "poor" threshold. `LayoutShiftAttribution` shows two elements produce ~94% of the total: a Builder.io `.features-block` that lands late and jumps **887 px**, dragging `footer#footer` down with it. No image element appears anywhere in the top-10 contributors.

## Steps to Reproduce
1. `npm run layout:run -- --grep CLS-001` (or: fresh uncached session, throttle Fast 3G, load `{{FRONT_URL}}`).
2. Read accumulated CLS plus per-element attribution.

## Expected vs Actual
- **Expected:** CLS < 0.1 (BL-UI-001). Content blocks reserve their box before their content resolves.
- **Actual:** home CLS **0.502** across 10 shifts; catalog CLS **0.198** across 8.

Top contributors, home (full list in the trace):

| Impact | Max move | Element |
|---|---|---|
| 0.4713 | 887 px | `div#featurese7PU.features-block.py-10.lg:py-24` |
| 0.4624 | 741 px | `footer#footer` |
| 0.0221 | 0 px | `nav.grid.sm:grow.sm:grid-cols-2` |

Catalog is the same shape, led by `div.category__sort` (0.1283).

Evidence: `reports/regression/LAYOUT-VERIFY-03/traces/LAYOUT-CLS-001-FAIL-trace.json` · screenshot `.../screenshots/LAYOUT-CLS-001-FAIL.png`

## Root Cause
`.features-block` computes **`min-height: 0px`** and renders **573 px** tall once its content resolves. Until then it occupies no vertical space, so everything below it — most visibly the footer — sits ~887 px too high and then snaps down. It is a Builder.io-authored content block, so the fix is a reserved-space contract for CMS blocks rather than a per-image attribute.

## Correction — what this bug used to say, and why it was wrong
The earlier analysis (recorded against Theme 2.53.0-pr-2368, home CLS 0.268 / cart 0.314 @375) blamed hero-carousel images with no `width`/`height` and a 404 hero asset. Re-verified on the current build:

- **Hero slides DO reserve space.** `.vc-slider__image` still carries no `width`/`height` attributes and `aspect-ratio: auto`, but both slides compute an explicit `width: 1184px; height: 450px`, so a box *is* reserved before decode.
- **No broken hero asset.** Zero failed image requests (4xx/5xx) on load.
- **Images are not the driver.** `LAYOUT-IMG-001` scanned 69 images on home and found exactly **one** without reserved space — the header logo SVG — and it contributes **0** measured shift.
- **It got worse, not better:** 0.268 → 0.502.

So the image hypothesis was either always secondary or has since been fixed; either way the current 0.502 has a different owner. Kept as an amendment rather than a new ticket to avoid a duplicate.

## Fix Routing
- **Repo:** `vc-frontend` — **kind:** frontend
- Reserve height for CMS/Builder.io content blocks before their content resolves (`min-height` or an aspect-ratio box on `.features-block` and siblings), so the footer does not reflow.
- Secondary, low severity: give the header logo SVG explicit dimensions (`LAYOUT-IMG-001`).
- Not in scope: the hero carousel — currently compliant.

## Regression Coverage
Guarded by suite **048c** (`layout-stability`): `LAYOUT-CLS-001`, `LAYOUT-CLS-002`, `LAYOUT-IMG-001`, `LAYOUT-IMG-002`. Deterministic — CLS reproduced to 4 decimal places across runs.

---

## EXTENDED 2026-09-08 — the same footer-drag signature also hits `/account/missions`

Found by `/qa-test VCST-5910` (verify-fix flow), theme `2.57.0-pr-2471-6ed5-6ed5dc1b`. `PerformanceObserver('layout-shift')` installed pre-paint via `initScript`, measured at two viewports:

| Viewport | CLS | Shifts | Largest contributors |
|---|---|---|---|
| 375 px | **0.5624** | 2 | `footer#footer` moves **577 px**; an `svg` moves 289 px |
| 1280 px | **0.2046** | 3 | `svg` 523 px, `ul.mega-menu__nav`, `section.vc-widget`, `div#menu-item-155.account-navigation-item` |

**Same class as this report, third page.** The signature matches what the 2026-07-25 correction already established for home and catalog — a late-landing block displacing the page and dragging `footer#footer` down with it — so this is an extension of scope, not a new bug. Running total: home 0.502, catalog 0.198, **`/account/missions` 0.5624 at 375 px**. Mobile is the worse case here and sits **5.6× the 0.1 FAIL threshold** and above the 0.25 "poor" mark.

**Attribution checked, and it is NOT the missions feature.** No shift source is a mission-card or mission-modal element; the cause is the page shell reserving no space for the async mission list. PR #2471 (the missions fix under test that day) is styles-only inside the mission components and neither causes nor fixes this.

Still **unfiled** in the tracker — no ticket key on this report. Given three confirmed pages and a 0.56 mobile measurement, it is worth filing on its own.
