# Design report — VCST-5903 VcStatWidget (visual lane, Run 1)
**Run:** VCST-5903-R1-2026-10-19 · **Build:** vc-frontend#2568 @ 3f8af63a (QA Storybook image 2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a) · **Browser:** Chrome DevTools MCP · **Auth:** none (public Storybook) · **Data:** none created
**Targets:** stories `Components/Organisms/VcStatWidget` (basic, colors, delta-colors, with-suffix, loading, error-state, prepend-slot, row) in isolation. Storefront half of the dual target: not applicable, no storefront page renders the card yet (checklist "Not covered").
**Matrix:** 7 presets (Default, Mercury, Purple pink, Watermelon, Coffee, Red, Black gold) x light/dark = 14 combos, each applied through the `themePreset` / `darkMode` globals and confirmed by the resolved `--color-primary-500` and card background; viewports 375 / 768 / 1280 / 1920.

## Items
| # | Result | One line | Evidence |
|---|---|---|---|
| B1 | **FAIL** | Black gold light, `deltaColor=secondary`: 3.36:1 (needs 4.5:1; axe-core independently 3.35, serious). Every other delta/error pair is >= 4.53:1 | V-b1-black-gold-light-secondary-delta-3.36.png, V-error-state-red-dark.png |
| B2 | PASS | Each of `--vc-stat-widget-bg-color`, `-border-color`, `-radius` set on the wrapper changes the card; unset gives bg #ffffff (= `--color-additional-50`), border #ebebeb (= `--color-neutral-200`), radius 8px (= `--vc-radius` 0.5rem) | V-b2-tokens-set-on-wrapper.png |
| B3 | PASS | 0 off-palette colours (every colour resolves to one of 90 `--color-*` token values); 0 literal colours in the 26 `.vc-stat-widget*` rules; card padding 16, gap 6, radius 8 all on the derived grid | measurements below |

## B1 detail (contrast of delta text -700 and error row on the card, light | dark)
Rendered values (Delta Colors story: success/warning/danger/neutral, plus Basic with success, primary, accent, secondary and the Error story) equalled the `--color-<c>-700` token in all 14 combos; primary/secondary/accent/info were taken from their token value on the measured card background and spot-rendered (secondary Black gold, primary + accent Watermelon).
| Preset | light: min (colour) | dark: min (colour) |
|---|---|---|
| Default / Mercury | 4.53 (warning) | 7.46 (danger) |
| Purple pink | 4.53 (warning) | 5.31 (danger) |
| Watermelon | 4.53 (warning) | 5.31 (danger) |
| Coffee | 4.53 (warning) | 5.17 (danger) |
| Red | 4.53 (warning) | 9.4 (danger) |
| **Black gold** | **3.36 (secondary) FAIL**; next lowest 4.53 | 5.61 (danger) |
Error row (`danger-700`): 8.09 light, 5.17 (Coffee dark) to 9.4 (Red dark) — all pass. Warning on light is a marginal pass (4.53 vs 4.5) in six presets.

## Other findings
| # | Condition | Source | Result |
|---|---|---|---|
| V1 | Standalone card, 256px, ready vs loading vs error (Basic: ready, `loading=true`, `errorText=Failed`) | BL-UI-003 / skeleton-content shift | **FAIL (Medium)**: height 155.5px ready, 105.5 loading (-50), 92 error (-63.5); loading/error hide description and delta, so a lone card shifts content below when data resolves. In the Row story the shift is masked by flex stretch (all 6 cards 155.5/173.5px equal). Product question for the PO: keep description/delta placeholders while loading? |
| V2 | 1.4.11 non-text contrast of the start bar and card icon, per `color` | WCAG 1.4.11 (decorative: label text carries the meaning) | ADVISORY: Default/Mercury light `primary` 2.11 and `warning` 2.09; Watermelon light `primary` 2.14; `warning` 2.09 in every light preset; Black gold light `secondary-500` 2.02. Bar/icon are redundant to the label and the icon is `aria-hidden`; if the PO treats them as meaningful, these fail 3:1. Dark: all >= 3.0 |
| V3 | Loading placeholder dash colour #d4d4d4 on white (1.48:1) | WCAG 1.4.3 | ADVISORY: dash is `aria-hidden` and the state is announced through the `<output>` status ("<label>: loading"); a visible placeholder, not content |
| V4 | axe-core 4.12 (wcag2a/2aa/21a/21aa/22aa) on Row (default light) | WCAG | 0 violations. `incomplete`: `color-contrast` on the loading card label ("overlapped by another element": the `vc-loader-overlay` is transparent; own measure 7.81:1, so not a defect), `bypass` (Storybook iframe, N/A) |
| V5 | Mercury preset vs Default | design system | ADVISORY: all 1090 stylesheet-declared custom properties identical to Default in dark (and all 16 measured colour tokens in light); Mercury adds no look of its own on this surface |
| V6 | BL-UI-005 alignment, 4 viewports | BL-UI-005 | PASS: icon/label centre diff 0.00px, delta icon/text 0.00px, error icon/text 0.00px, prepend/icon/label centres equal (47px); figure tops equal across cards (67px at 1920/1280/768; wrapped label reserves two lines); row heights equal at 1920 (155.5), 1280 (173.5), 768 and 375 per row |
| V7 | BL-UI-004 overflow | BL-UI-004 | PASS: `scrollWidth == clientWidth` at 375 (true 375px, mobile emulation), 768, 1280, 1920; no child outside its card; figure `scrollWidth == clientWidth`; Row stacks to one column at 375, 3 up at 768. Note: the Colors story is ONE column at 375 (and 500), not two as A11's premise says |
| V8 | BL-UI-002 spacing | BL-UI-002 | PASS: padding 16, gap 6, head gap 8, all on `SPACING_GRID_PX`. Two non-grid values are not spacing: `<output>` sr-only `margin:-1px`, and the error row's `mt-auto` resolving to 63.5px in a stretched Row. Icon sizes are mixed (15 card icon, 16 prepend/error, 14 delta) |
| V9 | Visual review of every state screenshot | visual | No clipping, overlap or misalignment seen; Row card widths differ at 1280 (192 vs 207px) because the unbreakable figure forces `grow basis-44` wider (story composition) |
| V10 | State semantics | WCAG 4.1.3 | PASS (automated only): status is a real `<output>` (implicit `role=status`, polite, atomic), error row `aria-hidden` so it is announced once |

## Axes
| Axis | Verdict | Note |
|---|---|---|
| vs. RULES (BL-UI) | FAIL (V1, BL-UI-003) · PASS BL-UI-002/004/005 · BL-UI-006 n/a (no interactive control, per checklist) | invariant_failures: V1 |
| vs. WCAG 2.2 AA | FAIL (B1) | a11y_findings: B1 (1.4.3). axe: 0 violations in Default light |
| vs. SYSTEM (tokens) | PASS (B2, B3) | |
| vs. DESIGN | **SKIPPED — no design link on the ticket** (mockups already compared by lane A1/A2) | skipped_reason as stated; never a PASS |
| Advisory | V2, V3, V5, V8 (icon sizes) | |

## MANUAL, not verified (never PASS)
Screen-reader output (NVDA/JAWS/VoiceOver) of the `<output>` status and its first-mount behaviour; WCAG 2.2 additions 2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8 (card has no interactive element; prepend slot control is the consumer's); 200% zoom / reflow, `prefers-reduced-motion` for the spinner; keyboard walk (nothing focusable in the card).

## Method notes
Colours resolved through a canvas parse of `getComputedStyle` values and composited over the effective background; thresholds 4.5 (text), 3.0 (large text 24px or 18.66px bold, non-text). B2 used one `@allow-eval` style edit on the wrapper in the story iframe, as the checklist directs, and was re-measured. Browser state cleaned (localStorage helper keys removed, emulation reset). No entities created, no tracker or bug-folder writes.
