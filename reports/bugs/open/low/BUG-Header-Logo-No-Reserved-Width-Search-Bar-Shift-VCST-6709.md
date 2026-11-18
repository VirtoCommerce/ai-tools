# Header logo has no reserved width: on a cold desktop load the search bar and header links jump 182px right

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-0023-W6R

**Severity:** Low · **Type:** Layout / CLS (storefront) · **Tracker:** [VCST-6709](https://virtocommerce.atlassian.net/browse/VCST-6709) (Need hotfixes: set — v15 2.51.1 / v16 2.59.0; auto-fix labels withheld) · **Related:** VCST-6042 (Stable 16)

## Env
- Stand: `vcptcore_regression` (storefront "Stable V16", store B2B-store), guest, Chromium
- Theme vc-frontend **2.59.0** (package footer; deployed theme confirmed in `vc-deploy-dev@vcptcore-regression` `infra/environments.yml`). Platform 3.1076.8 not compared (frontend-only layer)
- Repro rate: deterministic on a cold load — 3/3 throttled desktop runs (Fast-3G, Slow-3G); unthrottled the shift is still in the CLS log but ends before the first sample; warm cache does not show it
- Not available from the package: trace ID / App Insights (no server request involved), HAR (lane HAR not exported, runner records none — network list in `network/home-1280-requests.txt`)

## Summary
The desktop header logo has a fixed height but no width, aspect-ratio or sized box. Until the logo file arrives it is 0 px wide; when it loads it grows to 182.17 px and the search bar and the right-hand header links are re-laid out 182 px to the right. Nothing moves at 375 px (the mobile row is `justify-between`). The CLS share is small (≤ 0.005); the home page's CLS is the footer, tracked separately in `BUG-layout-cls-images-missing-dimensions.md`.

## Steps to Reproduce
1. Guest, Chromium, fresh browser context (empty cache), viewport 1280x900 (also 1920x1080).
2. Throttle the network to Fast-3G (also Slow-3G).
3. Open `{{FRONT_URL}}/`.
4. When the header search input is visible, record the rects of the logo `img` and the search input.
5. Wait for network idle + 1.5 s and record the same rects again.

## Expected
- The logo slot keeps its box while the logo loads; the search bar and header links do not move.
- Same as 375 px today, where the header does not shift.

## Actual
- Logo width 0 → **182.17 px**; search input left **+182.17 px** (1280 and 1920, Fast-3G and Slow-3G).
- CLS attribution: `div.search-bar` 0.0046 (1280) / 0.0030 (1920); header links `ul.-mx-2.flex.items-center` 0.0013 / 0.0005.
- Screenshot (loaded state, 1280 Fast-3G): `reports/bugs/screenshots/Header-Logo-No-Reserved-Width-Search-Bar-Shift/header-1280-fast3g-loaded-runner.png`; 375: `.../home-375-fast3g-loaded-runner.png`

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `traces/ADHOC-LOGO-*-FAIL-trace.json`, `screenshots/dom-home-1280.txt`, `console/…log` (0 errors) |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation (all `/graphql` 200, row 3) | `network/home-1280-requests.txt` |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — storefront.

## Root Cause Analysis
Package: `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-IMG-001/` (`root-cause.md` §3–§5, `source/findings.md`).
- `client-app/shared/layout/components/header/_internal/bottom-header.vue:9` — `<VcImage :src="logoUrl" … class="h-8 xl:h-[2.8rem]" lazy />` sits first in a flex row before `<SearchBar/>`; height only.
- `client-app/ui-kit/components/atoms/image/vc-image.vue:2-10` — renders a bare `<img>` with no width/height.
- `client-app/core/composables/useWhiteLabeling.ts:47` — the logo is white-label configurable, so the ratio is unknown at build time: the fix is a sized slot (fixed/max-width box + `object-contain`) and/or dropping `lazy` on the above-the-fold logo, not hardcoded width/height.
- Ruled out: by-design (no doc accepts the jump), env data drift (theme's built-in `logo-BjTimKVl.svg`), flakiness (3/3).

## Regression
Not a regression: the same code is in vc-frontend 2.51.1/2.51.2 (bundle v15) and 2.59.0 (v16), and on `dev`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend desktop header (bottom-header logo slot)
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/bottom-header.vue:8-10`
- **Routing confidence:** HIGH
