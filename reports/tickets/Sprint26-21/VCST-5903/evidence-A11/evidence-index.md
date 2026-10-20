# Evidence index: VCST-5903 A11, VcStatWidget figure overflow

**Verdict:** REPRODUCED at a supported viewport: **1024px**, story `components-organisms-vcstatwidget--colors` (and `--delta-colors`, the same grid).

## Environment
| Field | Value |
|---|---|
| TEST_ENV | `vcst` (ENV_RISK=test) |
| Surface | QA Storybook (`{{STORYBOOK_URL}}`), image `2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a` |
| Source | vc-frontend PR #2568 @ `3f8af63acad50d2e08a2298bfd99c8a1333f91b6` |
| Browser | playwright-edge (Chromium, msedge channel), DPR 2, Storybook manager in "full screen" mode so the preview iframe width equals the window width (confirmed: iframe `clientWidth` = window width) |
| Breakpoints | `client-app/ui-kit/constants/tailwind.ts`: xs 480, lg 1024. Colors grid: `grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4` (stories.ts:53) |
| Server layers | None. This is a pure CSS/layout defect in a UI-kit component, so there is no trace ID and no App Insights |
| Docs | Context7 `/virtocommerce/vc-docs`: no page for VcStatWidget (only vc-shell `VcWidget`, which is unrelated). NEW component, so the ground truth is `{SPEC}` + `{OBSERVED}` |

## Measurements
All values are read-only `getBoundingClientRect`. Ink is a Range over the value node. "Past border" is ink right minus card right.

| # | Story | Viewport | Value (typed in Controls) | Card W | Ink W | Past border | Doc scrollW | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Colors (4-col) | 1024 | `$12,345,678.90` | 236 | 211.7 | -4.3 (12.7 into padding) | 1024 | inside border |
| 2 | Colors (4-col) | **1024** | `$123,456,789.00` | 236 | 229.1 | **+13.1** (all 8 cards) | 1024 | **overflow** |
| 3 | Colors (4-col) | 1280 | `$123,456,789.00` | 300 | 229.1 | -50.9 | 1280 | fits |
| 4 | Colors (2-col) | 768 | `$123,456,789.00` | 360 | 229.1 | -110.9 | 768 | fits |
| 5 | Colors (4-col), re-check after a resize round-trip | **1024** | `$123,456,789.00` | 236 | 229.1 | **+13.1** | 1024 | **overflow** (repro 2) |
| 6 | DeltaColors (4-col), fresh navigation | **1024** | `$123,456,789.00` | 236 | n/m | visual: "00" over the border on all 4 cards | n/m | **overflow** (repro 3) |
| 7 | Basic (`max-w-64`) | 375 | `$123,456,789.00` | 256 | 229.1 | -6.9 (10.1 into padding) | 375 | inside border |
| 8 | Colors (2-col) | 480 | `$12,345,678.90` | 216 | 211.7 | **+15.7** (ends at 247.7, next card starts at 248; right card ends at 479.7 of 480) | 480 | **overflow** (480 is the xs breakpoint, not on the BL-UI-004 named list) |

Value computed style: `white-space: normal; overflow-wrap: normal; overflow: visible; 30px / 700`. Card `overflow: visible`.

**Derived bands.** Card = (vw - 32 - (cols-1)·16)/cols. The figure crosses the border when ink > card - 20 (4px start bar + 16px padding on the left; 16px padding + 1px border on the right):
- `$123,456,789.00` (229px): 4-col overflows at **1024–1075**, 2-col at 480–545, Basic never.
- `$12,345,678.90` (212px): 2-col overflows at 480–511, 4-col never (it would need vw < 1007).
- `$1,512,400.00` (194px): never at ≥ 375. This matches KB-2C889DD2: 2px inside the border at 480.

**Row story:** not re-tested. Its cards come from a fixed `cards` array that the value Control does not reach, and KB-527B0F06 shows the flex `grow basis-44` card grows to the figure's min-content width instead.

## Artifacts
| Kind | Path |
|---|---|
| Repro, 1024 Colors, 8 cards past border | `screenshots/02-colors-1024-123M-past-border-REPRO.png` |
| Repro, 1024 DeltaColors | `screenshots/04-deltacolors-1024-123M-past-border-REPRO.png` |
| Repro, 480 Colors, 8-digit figure | `screenshots/06-colors-480-12M-past-border-REPRO.png` |
| Control, 1024 Colors, 8-digit figure inside the border | `screenshots/01-colors-1024-12M-in-padding.png` |
| Control, 375 Basic, 9-digit figure inside the border | `screenshots/05-basic-375-123M.png` |
| DOM snapshot (manager + Controls with the typed value; the iframe subtree is not exposed by the snapshot, so the figure geometry comes from the measurements above) | `screenshots/dom-deltacolors-1024-manager.yml` |
| Console (0 errors; 3 unique warnings, all Storybook/Cloudflare preload + "Omitted potentially unsafe URL args", unrelated) | `console/console-warnings.log` |
| Network (non-static; all 2xx, no failures) | `network/requests.txt` |
| HAR, whole session (52 MB, embedded content; untracked, do not commit) | `har/A11-storybook-session.har` |
| Prior run (unsupported 208px, 38px past the edge) | `../screenshots/A11-176px-card-figure-overflow-FAIL.png`, `../screenshots/A11-colors-480-2col-figure-in-padding.png` |
