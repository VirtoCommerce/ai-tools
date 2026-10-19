# BUG: VcTileButton outline-warning icon is 2.09:1 on the tile surface

- **Severity:** Low (below the 5-file floor — not filed) · **Provenance:** IN-SCOPE (VCST-5906, vc-frontend PR #2575 @ `2024d7ad`)
- **Oracle:** `BL-A11Y-003` / WCAG 1.4.11 (non-text contrast ≥3:1) · **Found:** 2026-10-16, `/qa-test` 4v (ui-ux-expert, Chrome DevTools)
- **Env:** vcptcore-qa1 Storybook image `2.61.0-alpha.2589-vcst-5906-vc-tile-button-2024d7ad`

## Steps
1. Open `{STORYBOOK_URL}/iframe.html?id=components-molecules-vctilebutton--colors&viewMode=story&globals=themePreset:coffee;darkMode:light` (same on `red`).
2. Look at the **outline** row, `warning` tile.

## Expected
The coloured icon of an outline tile reaches ≥3:1 against the tile surface on the gated presets (Coffee, Red), like the other seven outline colours (3.68–4.83:1).

## Actual
Icon `#fc9e00` (`--color-warning-500`) on `#ffffff` (`--color-additional-50`) = **2.09:1** (two independent calculations agree: 2.0938 / 2.09). Light mode only — dark is 3.21 (Coffee) / 12.54 (Red).

## Why Low
The label is `neutral-700` at 10.37:1 and carries the meaning; the icon is supplementary. A tile whose icon is the only cue would make this Medium.

## Root cause
Token contract, not component code: `--vc-tile-button-outline-warning-icon: var(--color-warning-500)` over `--vc-tile-button-outline-warning-bg: var(--color-additional-50)` in `_ui-kit-tokens.scss`. The value matches the PR's declared outline rule (icon = `<color>-500`), so per `ui-kit-class.md` §10 the token is the defect — design-system owner decision (e.g. `warning-700` for the outline icon).

## Evidence
`reports/tickets/Sprint26-20/VCST-5906/screenshots/ux-colors-coffee-light.png`, `ux-colors-red-light.png`
