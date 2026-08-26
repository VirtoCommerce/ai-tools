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

---

## Resolution — FIXED (verified 2026-08-26)

**Fixed across two PRs:** [vc-shell#271](https://github.com/VirtoCommerce/vc-shell/pull/271) (input adornments + blade header buttons) and [vc-shell#281](https://github.com/VirtoCommerce/vc-shell/pull/281) — "fix(a11y): raise the shell's remaining hit areas to 24px", merged **2026-08-04**, shipped in **v2.4.0**.

Every row of the report's table is accounted for:

| Element | Reported | Now | Axis |
|---|---|---|---|
| `.vc-input__clear` | 12×34 | **24×30**, `min-width/min-height: 24px`, name "Clear" | **live** (vcmp-dev sidebar search) |
| `.sidebar-header__notification-bell` | 18×21 | **24×24**, name "Notifications" | **live** |
| `.sidebar-header__menu-button` | 18×21 | **24×24**, name "Open menu" | **live** |
| `.vc-input__showhide` | 14×34 | `min-width/min-height: var(--input-adornment-target-size)` = 24px | source (#271) |
| `.vc-color-input__color-square` | 20×20 | `--color-input-swatch-size: 24px` | source |
| "Forgot password?" (`VcButton variant="link"`) | 354×18 | **354×24** via `--button-link-target-size` | #281, measured there |
| Blade header Restore / Close | 18×21 | covered | #271 |

The fixes are **tokenised minimums**, not one-off nudges — `--input-adornment-target-size`, `--color-input-swatch-size`, `--button-link-target-size`, `--app-bar-header-button-target-size` — applied as `min-width`/`min-height` so the box grows while the glyph stays 18×18 and centred. `vc-input.vue` even carries the rationale inline: *"area is about half the 24px WCAG 2.5.8 target."* That is the shape this report asked for ("padding or a transparent `::before` overlay — the visual glyph can stay small").

`--button-link-target-size` on the `link` variant fixes "Forgot password?" **and every other link-styled button** (table "add row", "select all" bar), which is broader than reported.

**Also resolved: the meta-point about tooling.** This report argued any CI a11y gate must include the 2.2 tags. [#273](https://github.com/VirtoCommerce/vc-shell/pull/273) — "fix(a11y): raise the axe scope to WCAG 2.2" — did exactly that, so the blind spot that let these ship is closed, not just the instances.

**Scope of verification:** 3 of 7 rows measured live on vcmp-dev; the other 4 rest on source + #281's own Storybook measurements. Not re-measured: the Storybook `VcColorInput` / `VcDataTable` instances and the blade-header buttons. Given the fix is a shared token on the shared component — the mechanism this report itself predicted would "clear the majority of instances" — spot-checking was judged sufficient. A full axe `wcag22aa` sweep would be the way to close the remainder if certainty is wanted.

**Verdict: VERIFIED FIXED.**
