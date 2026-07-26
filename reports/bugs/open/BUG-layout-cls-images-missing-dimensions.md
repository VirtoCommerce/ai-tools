# Cumulative Layout Shift on home & cart from images without reserved dimensions — P1

**Severity:** P1 · **Type:** Layout / Web Vitals (BL-UI-001)

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
On a fresh (uncached) load the home page shifts CLS = 0.268 and the cart shifts CLS = 0.314 @375px — both at or above the 0.25 "poor" threshold, and cart is a revenue surface. The primary driver is the hero carousel: `vc-slider__image` images ship with no `width`/`height` attributes and compute `aspect-ratio: auto`, so no box is reserved before the image decodes. A broken hero image (404 from a wrong asset host) adds further reflow.

## Steps to Reproduce
1. Clear cache / open a fresh session (no warm image cache).
2. Load the home page `{{FRONT_URL}}` and record layout-shift via the performance trace.
3. Observe the hero carousel images (`vc-slider__image`) reflow as they decode.
4. At a 375px viewport, add a seeded item and load `{{FRONT_URL}}/cart`; record CLS.

## Expected vs Actual
- **Expected:** CLS < 0.1 ("good"). Images reserve their intrinsic box before decode so surrounding content does not jump.
- **Actual:** Home CLS = 0.268; cart CLS = 0.314 @375px. Hero `vc-slider__image` imgs have no `width`/`height` and `aspect-ratio: auto`; one hero image 404s (wrong asset host) and reflows on failure.

Home:
![Home CLS](screenshots/LAYOUT-CLS-001-FAIL-home-cls.png)

Cart @375px:
![Cart CLS](screenshots/LAYOUT-CLS-003-FAIL-cart-cls.png)

_Note: PDP CLS was flagged in an earlier run but is NOT a defect on this build (measured 0.069) — excluded._

## Root Cause
Carousel/image components render `<img>` without intrinsic `width`/`height` (or an `aspect-ratio` box), so the browser cannot reserve space until the resource loads. The 404 hero asset compounds this by collapsing then re-expanding its slot.

## Fix Routing
- **Repo:** `vc-frontend` — reserve intrinsic dimensions in `VcCarousel` / `VcImage` (set `width`/`height` or a fixed `aspect-ratio` on hero slides); fix the broken hero asset URL/host.
- **Kind:** frontend
