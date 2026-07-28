# BUG: `VcInput` adornment buttons are ~12–14 px wide — below the WCAG 2.2 AA 24×24 minimum — [Serious, SC 2.5.8]

**Env:** `@vc-shell/framework` 2.3.0 · Vendor Portal `https://vcmp-dev.govirto.com/apps/vendor-portal/` + hosted Storybook · axe-core 4.12.1 (tags incl. `wcag22aa`) · Chromium, Windows 11
**Found while testing:** VCST-5412 (`/qa-accessibility`, WCAG 2.2 AA gate)
**WCAG:** 2.5.8 Target Size (Minimum), Level **AA** — new in WCAG 2.2

## Summary

`VcInput`'s adornment buttons (`__clear`, `__showhide`) render ~**12–14 px wide** — roughly half the
24 px minimum — and every consuming component and blade inherits the failure. One fix in the shared
input component resolves the majority of instances.

## Steps to reproduce

1. Open `https://vc-shell-storybook.govirto.com/iframe.html?id=form-vcinputdropdown--currency-input&viewMode=story`
2. Measure `.vc-input__clear` (`getBoundingClientRect`), or run axe-core with the `wcag22aa` tag.

## Expected vs actual

**Expected:** every pointer target is at least **24×24 CSS px** (or exempt via spacing/inline/UA control).
**Actual** — measured, deduplicated by element:

| Element | Measured | Where |
|---|---|---|
| `.vc-input__clear` | **12×34** | Storybook `VcInputDropdown`; app item blade (×2) |
| `.vc-input__clear` | **12×30** | Storybook `VcDataTable` |
| `.vc-input__showhide` | **14×34** | app login ("Show password") |
| `.vc-color-input__color-square` | **20×20** | Storybook `VcColorInput` |
| `.sidebar-header__notification-bell` | **18×21** | app sidebar |
| `.sidebar-header__menu-button` | **18×21** | app sidebar |
| "Forgot password?" (`vc-button`) | **354×18** | app login — height fails |
| Blade header Restore / Close | **18×21** | app blade header — not axe-flagged (spacing exemption) but under the floor |

axe failure summary, verbatim: *"Target has insufficient size (12px by 34px, should be at least 24px by 24px)"*.
Lighthouse (desktop, login) independently flags `target-size` and scores accessibility **78/100**.

## Why this was not caught earlier

PR [vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) scoped its sweep to **WCAG 2.1**
(*"Eliminate WCAG 2.1 A/AA violations across components"*). **2.5.8 is new in WCAG 2.2**, so it was
outside that scope by definition — the PR did what it claimed. This is a gap against the 2026 baseline,
not a regression.

Correspondingly, an axe run tagged only `wcag2a wcag2aa wcag21a wcag21aa` reports these components as
**clean**; adding `wcag22a wcag22aa` surfaces 3 serious violations across `VcColorInput`,
`VcInputDropdown` and `VcDataTable`. Any CI a11y gate should include the 2.2 tags.

## Suggested fix

Raise the hit area of the shared input adornments to ≥24×24 (padding or a transparent
`::before` overlay — the visual glyph can stay small), then re-check `VcColorInput`'s swatch and the
18×21 sidebar/blade-header icon buttons. Fixing `.vc-input__clear` / `.vc-input__showhide` alone clears
the majority of instances across both surfaces.

## Impact

Affects every consumer of `@vc-shell/framework` 2.2.0/2.3.0 — pointer users with reduced dexterity, and
touch users in particular. Under **EN 301 549 / the EAA** this is an AA conformance failure for any
EU-reachable deployment.

Full audit: `reports/tickets/Sprint26-15/VCST-5412/wcag22-accessibility-audit.md`.
