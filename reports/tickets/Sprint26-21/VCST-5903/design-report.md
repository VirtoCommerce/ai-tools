# Design report — VCST-5903 VcStatWidget (visual lane, Round 2)
**Build:** vc-frontend#2568 @ bfe0b259 (fix for VCST-6427) — QA Storybook image 2.61.0-alpha.2597-vcst-5903-vc-stat-widget-a6255676 · **Browser:** Chrome DevTools MCP, viewport 1280x900, Default preset (`--color-primary-500` #f99e24) · **Auth:** none (public Storybook) · **Data:** none created · Round 1 report is in git (commit 11509656).
**Scope:** checklist section B only (B1, B2). Contrast, overlay, locale, long-label alignment and V1/V2 are Round 1 results on unchanged code and were not re-run.

## Items
| # | Result | Measured | Evidence |
|---|---|---|---|
| B1 | **PASS** | Basic `value` `" "` vs `""`: card 256 x 155.5 both; every child rect identical (head 28, value 37.5, description 14, delta 24, same x/y); value class `vc-stat-widget__value--pending`, text "—", colour rgb(212,212,212) = `--color-neutral-300`; status text empty; PNG files byte-identical (md5 match). WithSuffix `errorText` `" "` vs none: card 256 x 155.5 both; head/value/description/delta rects identical; text "34 items", no error row; status empty; PNGs byte-identical | R2-B1-basic-value-space-1280.png, R2-B1-basic-value-empty-1280.png, R2-B1-withsuffix-errortext-space-1280.png, R2-B1-withsuffix-ready-1280.png |
| B2 | **PASS** | Basic + Colors (8 cards): 252 colour reads (color, background, visible borders, svg stroke/fill) all resolve to `--color-*` palette values (90 distinct palette colours from 232 tokens), 0 off-palette; 0 literal colour values in the 26 `.vc-stat-widget*` rules (the only `#0000` hit is Tailwind's transparent ring/shadow fallback); 0 off-grid padding/margin/gap against `SPACING_GRID_PX` (card padding 16, gap 6). Token chain unchanged from Round 1: bg `--vc-stat-widget-bg-color` -> `--color-additional-50` (#ffffff), border `--vc-stat-widget-border-color` -> `--color-neutral-200` (#ebebeb), radius `--vc-stat-widget-radius` -> `--vc-radius` (0.5rem = 8px); the three `--vc-stat-widget-*` props are unset on `:root`. Label/description = `--color-neutral-600`, figure `--color-neutral-900`, delta `--color-success-700`; bars/icons = each colour's `-500` token | R2-B2-colors-1280.png |

## Notes
- `""` was driven as `args=value:` (Storybook gives an empty arg); the result cannot tell `""` from `undefined`, both render the same dash card.
- Colors story at 1280: 4 columns, 8 cards all 300 x 155.5, `scrollWidth == clientWidth` (1280). No horizontal overflow.
- Visual review of the four B1 screenshots and the Colors shot: no clipping, overlap or misalignment; the dash sits on the figure baseline area with unchanged spacing. No extra visual findings.

## Axes
| Axis | Verdict | Note |
|---|---|---|
| vs. RULES (BL-UI) | PASS for the changed behaviour | BL-UI-003 (blank value / blank error shift nothing: 0 px delta, identical boxes), BL-UI-002 (0 off-grid), BL-UI-004 (no overflow at 1280). Round 1 V1 (lone card 155.5 / 105.5 / 92 loading and error heights) is untouched by this fix and stays open as a PO question |
| vs. SYSTEM (tokens) | PASS (B2) | 0 off-palette, 0 literals, chain unchanged |
| vs. WCAG | not re-run | contrast code unchanged since Round 1; Round 1 B1 (Black gold light, secondary delta 3.36:1) remains the open a11y finding |
| vs. DESIGN | **SKIPPED** — the ticket carries no Prototype / Claude Design link (mockups are PNG attachments only); never a PASS | |

## MANUAL, not verified (never PASS)
Screen-reader first-mount announcement of the status output; other presets (Coffee, Red, Black gold) and viewports 375 / 768 not re-run this round.

## Method notes
Read-only: `getComputedStyle` / `getBoundingClientRect` only, no DOM or prop injection; states driven by Storybook `args=` URLs. No entities created, no tracker or bug-folder writes.
