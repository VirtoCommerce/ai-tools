# /qa-design — Dark-mode sweep on critical components

**Date:** 2026-05-22 · **Type:** Visual + WCAG sweep, Storybook only
**Env:** https://vcst-qa-storybook.govirto.com · Dark mode (`globals=darkMode:dark`) · Default preset
**Method:** `evaluate_script` + canvas color resolver (handles `color(srgb …)` modern color space)
**Viewports:** 375 / 768 / 1280 px
**Verdict: FAIL** — 4 WCAG 2.1 AA violations confirmed (1 text-contrast, 3 non-text contrast). 1 pre-existing touch-target issue carried from both modes.

---

## Summary

| ID | Finding | Component(s) | WCAG | Severity |
|----|---------|--------------|------|----------|
| F1 | Primary button text 3.43:1 | VcButton | 1.4.3 | P1 |
| F2 | Systemic border token 2.80:1 | VcTable, VcDialog, VcLayout, VcProductCard, VcLineItem | 1.4.11 | P1 |
| F3 | VcDialog panel invisible — bg = page bg (1.00:1) | VcDialog | 1.4.11 | P1 |
| F4 | VcPopover panel invisible — bg = page bg (1.00:1), shadow 1.22:1 | VcPopover | 1.4.11 | P1 |
| F5 | `xxs` button touch targets 26 px height (threshold 44 px) | VcButton | BL-UI-006 | P2 (pre-existing, both modes) |

---

## F1 — VcButton primary: text contrast 3.43:1 (threshold 4.5:1)

**WCAG 1.4.3 Minimum Contrast — FAIL · all viewports · all button sizes**

- Foreground: `rgb(236, 234, 239)` (near-white label)
- Background: `rgb(170, 114, 14)` (dark amber — `--color-primary` dark-theme token)
- Ratio: **3.43:1** · Required: 4.5:1 (≈ 14 px / 700 weight = normal-text threshold)
- Fix: either lighten label to pure `rgb(255,255,255)` (~4.2:1 — still marginal) or darken amber bg to ≈ `rgb(115, 78, 9)` (gives 4.5:1)
- Other variants in Dark/default — Secondary 5.11:1 PASS · Success 5.74:1 PASS
- Note: distinct from the carried-over LIGHT-mode amber 2.8:1 issue from VCST-4839; this is the dark-theme token specifically.
- Evidence: `storybook/vcbutton/all-states-dark-1280.png`

## F2 — Systemic border token `rgb(88,88,90)`: 2.80:1 (threshold 3:1)

**WCAG 1.4.11 Non-text Contrast — FAIL · same CSS token across 5 components**

- Token computed value: `color(srgb 0.345098 0.345098 0.352941)` → `rgb(88, 88, 90)`
- Adjacent surface: `rgb(10, 9, 11)` (dark page / panel background)
- Ratio: **2.80:1** · Required: 3:1
- Surfaces affected: VcTable row dividers · VcDialog panel border · VcLayout sidebar divider · VcProductCard card border · VcLineItem row divider
- Fix: raise token to ≥ `rgb(96, 96, 98)` for a comfortable ≥ 3:1 margin
- Evidence: `storybook/vctable/sorting-dark-1280.png`, `storybook/vcdialog/basic-dark-375-border-below-threshold.png`

## F3 — VcDialog panel: no visual separation from page (1.00:1)

**WCAG 1.4.11 Non-text Contrast — FAIL**

- Dialog bg (`vc-dialog`): `color(srgb 0.0392157 0.0352941 0.0431373)` → `rgb(10, 9, 11)`
- Page bg: `rgb(10, 9, 11)`
- Panel-vs-page: **1.00:1** · Required: 3:1
- Border (the only boundary) fails at 2.80:1 — see F2
- Box-shadow: `color(srgb 0.92549 0.917647 0.937255 / 0.1)` — blended region `rgb(33,32,34)`, contrast **1.22:1** — imperceptible
- Net: dialog is indistinguishable from page background in Dark mode.
- Evidence: `storybook/vcdialog/basic-dark-1280.png`

## F4 — VcPopover panel: no visual separation from page (1.00:1)

**WCAG 1.4.11 Non-text Contrast — FAIL**

- Panel bg (`bg-additional-50`): `color(srgb 0.0392157 0.0352941 0.0431373)` → `rgb(10, 9, 11)`
- Page bg: same `rgb(10, 9, 11)` → **1.00:1**
- No border present; no arrow/tail element rendered
- Box-shadow at 10% opacity → blended ratio **1.22:1**
- Net: floating popover has zero visible boundary; users cannot tell it has appeared.
- Evidence: `storybook/vcpopover/basic-dark-1280.png`, `storybook/vcpopover/basic-dark-375-panel-invisible.png`

## F5 — VcButton `xxs` touch targets: 26 px (threshold 44 px) — pre-existing

**BL-UI-006 — FAIL at ≤ 768 px viewports · NOT dark-mode-specific**

- Measured at 375 px: **26 px** height, 102–115 px width
- Required: ≥ 44 × 44 px
- Same in Light mode — not introduced by VCST-4839. Note for completeness; consider routing to backlog rather than filing as a regression.

---

## Per-component results

| Component | Text contrast | Non-text (borders/panels) | Overall |
|-----------|---------------|---------------------------|---------|
| VcButton | Primary 3.43 FAIL · Secondary 5.11 · Success 5.74 | — | **FAIL** |
| VcProductCard | Title 7.73 PASS · Price PASS | Card border 2.80 FAIL | **FAIL** |
| VcLineItem | White-on-dark ~19.87 PASS | Row divider 2.80 FAIL | **FAIL** |
| VcTable | Header 19.87 · Cell 19.87 PASS | Row divider 2.80 FAIL | **FAIL** |
| VcDialog | Title 19.87 PASS | Panel 1.00 · Border 2.80 FAIL | **FAIL** |
| VcPopover | Content 19.87 PASS | Panel 1.00 · Shadow 1.22 FAIL | **FAIL** |
| VcLayout (sidebar) | Text 19.87 PASS | Divider 2.80 FAIL | **FAIL** |

## Cross-component patterns (root cause)

- **One token, five surfaces:** `color(srgb 0.345098 0.345098 0.352941)` is the universal border/divider. Fixing this one token resolves F2 across VcTable, VcDialog, VcLayout, VcProductCard, VcLineItem.
- **One surface token, two overlays:** `bg-additional-50` resolves to the *same* value as the page background in dark mode. Both `vc-dialog` and `vc-popover__body` use it; both lose all visual separation. Fixing the dark-mode value of `bg-additional-50` (e.g., raise to `rgb(20,18,22)`) recovers F3 + F4 simultaneously.
- **Shadow opacity is non-functional in dark:** the `bg-additional-50 / 0.1` shadow gives 1.22:1 against any dark bg. Either raise opacity to ≥ 0.4 OR add a 1 px border on dialog/popover (border value must satisfy F2 fix first).

## Notes

- **Known issue carried from VCST-4839** (not re-filed): VcButton primary amber `#d4a562` on white = 2.8:1 in **Light** mode. F1 above is a separate dark-mode amber value (3.43:1) — file as new.
- **Scope not covered (by design):** state-shift / CLS / spacing-audit per component matrix — those were validated in VCST-4839 dark-mode toggle testing. This sweep was visual + WCAG only.
- All issues are design-token values, not code defects. Fixes belong in the design-system token JSON (likely `default.dark.json` + the shared border-token rule), not in component code.

## Artifacts

- Screenshots: `tests/Sprint-current/qa-design/critical-components-darkmode-2026-05-22/storybook/{vcbutton,vcproductcard,vclineitem,vctable,vcdialog,vcpopover,vclayout}/`
- Report: this file
