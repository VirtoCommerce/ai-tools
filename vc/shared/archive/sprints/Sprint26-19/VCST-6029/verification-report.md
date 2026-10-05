# VCST-6029 — Fix Verification: compare-table long value overlays adjacent column

**Verdict: PASS** — 10/10 checklist items PASS, 0 FAIL, 0 BLOCKED. **STR pass count: 3/3 consecutive.**

**Fix under test:** PR #2495 — `client-app/shared/compare/components/compare-table.vue`, `.compare-table__row-value`: `overflow-wrap: break-word` → `overflow-wrap: anywhere`.
**Env:** `http://localhost` — local frontend-only build serving PR #2495's theme artifact, API proxied to `https://vcst-qa.govirto.com` (real catalog).
**Browser:** `playwright-chrome` / Chromium, no fallback needed. Anonymous session (compare is localStorage-backed).
**Date:** 2026-09-22 · **RED baseline:** `reports/bugs/open/medium/BUG-compare-table-long-value-overlays-adjacent-column-VCST-6029.md`

## Headline evidence — RED/GREEN discrimination in this same build

The shipped rule was toggled back to the pre-fix value on the live SKU cells and re-measured, then restored
(`@allow-eval` debug experiment per `hooks/enforce-real-user.mjs`; read-only Range/`getBoundingClientRect`
measurement either side). At 1920×1080:

| State | `overflow-wrap` | text rect W × H | `scrollW`/`clientW` | overruns cell by | text-rect overlap |
|---|---|---|---|---|---|
| **Simulated pre-fix** | `break-word` | 242.11 × 17 (1 line) | **254 / 239** | **+14.11px** | **+2.11px** |
| **As shipped (fix)** | `anywhere` | 208.31 × **35** (2 lines) | **239 / 239** | **−19.69px** | **−31.69px** (gap) |

The simulated-pre-fix numbers reproduce the RED baseline **exactly** (242.11 / 254÷239 / +14.11 / +2.11),
confirming the harness measures the same thing the bug report measured and that the GREEN result is caused by
the CSS change, not by a font or width coincidence in this build.

## Checklist

### Fix Confirmation

**1. Original bug scenario still triggered — PASS.**
Both products reach compare and the SKU row renders both values: `9fb9c34b95b24c6094cab9b7b991ff62` (32-char
unbroken hex, CHAMPAGNE COOLER) and `8041452` (CIF). The trigger condition is intact — the long unbroken token
is present and, under the pre-fix rule, still overflows (table above). The pre-fix build itself cannot be run
here; discrimination is established by the live rule toggle instead.

**2. Fix resolves the issue at 1920 / 1280 / 390 — PASS.** Text rects measured via Range over each value cell's
contents, same method as the bug report.

| Viewport | cell `scrollW`/`clientW` | SKU text-rect overlap | overruns own cell by | SKU lines | baseline (pre-fix) |
|---|---|---|---|---|---|
| 1920×1080 | 239 / 239 | **−31.69px** (gap) | −19.69px | 2 | +2.11px overlap, +14.11px overrun |
| 1280×900 | 239 / 239 | **−31.69px** | −19.69px | 2 | +2.11px overlap, +14.11px overrun |
| 390×844 | 111 / 111 | **−27.16px** | −15.16px | 3 | +130.11px overlap, +142.11px overrun |

Every value is wrapped inside its own column and attributable to exactly one product. `scrollWidth == clientWidth`
on every cell at every viewport (pre-fix: 254 vs 239 / 111).
Screenshots: `screenshots/01-compare-sku-row-1920-PASS.png`, `screenshots/02-compare-sku-row-390-PASS.png`.

**3. Root cause addressed — PASS.** Computed style on `.compare-table__row-value` reads
`overflow-wrap: anywhere` (was `break-word`), identically on all **14** value cells across all **7** rows.
Unchanged siblings: `display: flex`, `overflow: visible`, `white-space: normal`, `word-break: normal`,
`text-overflow: clip`; box `240px` desktop → `112px` mobile. So the cell still does not clip and still has no
`min-w-0` — the value now fits because `anywhere` reduces min-content width, which is precisely the mechanism
the RCA named. Not a visual coincidence: proven by the toggle in the headline table.

### Regression

**4. Short-value rows unaffected — PASS.** All 7 rows measured at every viewport; none overruns its cell and
none overlaps its neighbour. Worst case across the whole table is the SKU row itself.

| Row | overlap @1920 | overlap @390 |
|---|---|---|
| Price per unit | −164.45 | −36.45 |
| Availability | −173.19 | −45.19 |
| SKU | −31.69 | −27.16 |
| Min. order qty | −231.87 | −103.87 |
| Manufacture | −164.59 | −36.59 |
| brand | −210.25 | −82.25 |
| original_sku | −191.27 | −63.27 |

(All negative = clear gap between adjacent text rects.)

**5. Compare core flow intact — PASS.**
- *Add:* a third product from another category added → new **Tablets 1** tab appeared alongside **Everything for Kitchen 2**.
- *Tab switching:* Tablets → 1 column, 4 rows, `aria-pressed` toggled correctly; back to Kitchen → 2 columns, 7 rows restored.
- *All / Differences toggle:* Differences correctly reduced 7 → 5 rows (dropping the two identical rows, `Min. order qty` and `Manufacture`); SKU row still clean at −31.69px.
- *Remove:* removing the CIF column updated the counter `2 of 5` → `1 of 5` and the tab badge `2` → `1`; single-column layout intact, SKU still inside its cell.
- *Clear all:* opens a confirmation dialog ("All 2 products will be removed from comparison", Cancel / OK); OK clears. **Not a defect** — an earlier apparent no-op was this dialog being dismissed by navigation, verified before drawing a conclusion.

**6. No new console errors or failed requests — PASS.** Console across the whole session: **2 errors, 0 warnings**,
both `net::ERR_NAME_NOT_RESOLVED` on `starmarket-platform.demo.govirto.com/cms-content/assets/catalog/…jpg` —
catalog product images on an unrelated demo host, present from the first page load, environment/DNS, not the fix.
Zero Vue warnings, zero hydration warnings. Network: **0 4xx/5xx** across the run; all 7 `POST /graphql` returned
`200 OK` with no `errors[]` in the bodies inspected.

### Cross-Layer

**7. Storefront correct at 1920 and 390 — PASS.** Screenshots captured at both (see item 2), plus
`screenshots/03-compare-sku-row-768-PASS.png`. At 390px the SKU wraps to 3 lines inside its 111px column and
`8041452` is fully legible beside it — the baseline's "second value drawn entirely inside the first" is gone.

**8. Data layer unaffected — PASS.** `POST /graphql` response for the compare query carries
`"code":"9fb9c34b95b24c6094cab9b7b991ff62"` and `"name":"CHAMPAGNE COOLER STAINLESS STEEL MAT 20CM"`, no
`errors[]`. Identical to the value the RED baseline confirmed at both xAPI and Platform REST, and byte-identical
to what the storefront renders. Rendering-only change; no discrepancy introduced.

### Edge Cases

**9. BL-UI-004 content boundary — PASS.** No page-level horizontal scroll introduced at any supported viewport;
no compare-table element exceeds the viewport.

| Viewport | `documentElement` scrollW / clientW | page h-scroll | any cell `scrollW > clientW` |
|---|---|---|---|
| 375×812 | 360 / 360 | no | no |
| 390×844 | 375 / 375 | no | no |
| 768×1024 | 753 / 753 | no | no |
| 1024×900 | 1009 / 1009 | no | no |
| 1280×900 | 1265 / 1265 | no | no |
| 1920×1080 | 1905 / 1905 | no | no |

At 375px exactly two elements extend past the viewport (right edge 520 / 483.4) — both decorative background
`<svg>` inside `.vc-container__bg`, which has `overflow-x: hidden` (sw 520, cw 360). Intentionally clipped page
decoration, outside the table, pre-existing and unrelated to this change.

**10. Intermediate viewport 768px (not in the original report) — PASS.** Cell width 232px (a distinct breakpoint
from both 240px desktop and 112px mobile). SKU row: overlap **−31.81px**, overrun **−19.81px**, wraps to 2 lines;
all 7 rows clean; no page h-scroll. 1024px also checked (240px cells): overlap −31.69px, overrun −19.69px, clean.

## STR repeatability — 3/3

Each run started from an empty compare list (Clear all → OK), then re-ran steps 1–4 in full.

| Run | Overlap @1920 | Overrun @1920 | Overlap @390 | Overrun @390 | Verdict |
|---|---|---|---|---|---|
| 1 | −31.69 | −19.69 | −27.16 | −15.16 | PASS |
| 2 | −31.69 | −19.69 | −27.16 | −15.16 | PASS |
| 3 | −31.69 | −19.69 | −27.16 | −15.16 | PASS |

Identical to the hundredth of a pixel across all three runs — deterministic, no flake.

## Notes and residual risk

- The fix is CSS-only and class-wide, so it covers every value cell in all 7 rows, not just SKU — confirmed by
  the computed-style read on all 14 cells (item 3). Any future long unbroken value in `brand`, `original_sku`,
  `Manufacture` etc. is covered by the same rule.
- `.compare-table__row-value` still has `overflow: visible` and no `min-w-0`. `overflow-wrap: anywhere` removes
  the *cause* (inflated min-content width) rather than adding a *clip*, so the defence is single-layered: a value
  that cannot be broken at all — e.g. a very long unbroken run inside a cell narrowed further than 112px — would
  have no clipping fallback. Not reachable at any supported viewport with current catalog data (the next longest
  `code` in the catalog is 11 characters), so this is an observation, not a defect.
- Verified on Chromium only. `overflow-wrap: anywhere` is broadly supported; a Firefox/Edge spot-check on the
  compare page would close that gap cheaply if desired.
- Environment caveat: this is a local frontend build against a proxied backend, not the deployed `vcst-qa`
  theme artifact. Re-confirm on `vcst-qa` once PR #2495 is deployed there.
