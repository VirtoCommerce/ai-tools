# VCST-4839 — Testing Checklist (Storybook Dark Mode Preset Selector)

**PR:** [vc-frontend #2217](https://github.com/VirtoCommerce/vc-frontend/pull/2217) — `feat(VCST-4839): add storybook dark mode preset selector`
**JIRA:** [VCST-4839](https://virtocommerce.atlassian.net/browse/VCST-4839) — Status: Testing · Priority: Medium · Type: Task
**Author:** muller39 · Branch: `feat/storybook-dark-mode-preset` · Head SHA: `af85c1b9`
**Test environment:** https://vcst-qa-storybook.govirto.com (toolbar controls confirmed live)
**Scope:** Storybook tooling only. No storefront / Admin / API changes. **No JIRA components.**

## What changed (diff summary)

| File | Change |
|------|--------|
| `.storybook/preview.ts` | Adds `darkMode` global toolbar (Light/Dark, sun/moon icons). Imports `darkPresets` and `_dark.scss`. New `presetToCssVars()` + `applyDarkMode()` helpers. Restructures CSS injection so dark vars only apply under `html.dark` selector. Sets `html.dark` class based on `darkMode === 'dark'` or `system` + `prefers-color-scheme: dark`. `initialGlobals.darkMode = "light"`. |
| `.storybook/docs-page.ts` | New `DarkPresetMissingBanner` — shows orange warning banner in MDX docs when dark mode active and current preset has no entry in `darkPresets` map. Appended after `DeprecatedBanner` and before `Subtitle`. |
| `storybook-styles/preflight.scss` | `body` and `.docs-story` now get `background-color: var(--color-additional-50)` so preview surface follows the active preset (light or dark). |

## Domain / agents / rules

| Domain | Agents | Browser | Mandatory rules |
|---|---|---|---|
| Storybook · Design System · UI/UX · Visual regression | `ui-ux-expert` | Chrome DevTools MCP | BL-UI-001 (no layout shift across modes), BL-UI-007..010 (visual review) where contrast applies |

ECL patterns to cover: ECL-9.x (visual regression), ECL-2.x (theme/locale switching), ECL-12.x (state persistence across global change).

## Checklist (15 items)

### A. Toolbar controls (visibility & defaults)

| # | Check | Expected | Priority |
|---|-------|----------|----------|
| C1 | "Select color mode" button is present in the top toolbar of Storybook | Visible, default value = Light (sun icon, dynamic) | Critical |
| C2 | "Select color mode" dropdown shows two items: **Light** (sun) and **Dark** (moon) | Two items, icons match, no "System" entry exposed in UI | High |
| C3 | "Select theme preset" dropdown lists all 6 presets: default, black-gold, coffee, mercury, purple-pink, watermelon | All 6 enumerated; "Default" is initial selection | High |

### B. Light → Dark toggle behaviour

| # | Check | Expected | Priority |
|---|-------|----------|----------|
| C4 | Switch color mode to **Dark** with `themePreset = default` | `html.dark` class is added to `<html>`; preview surface (body + `.docs-story`) repaints to dark `--color-additional-50`; primary/text tokens match `default.dark.json` | Critical |
| C5 | Switch back to **Light** | `html.dark` class removed; surface returns to light tokens; no flicker or stale styles | High |
| C6 | Toolbar icon is dynamic — sun in Light, moon in Dark | Icon updates synchronously with selection | Medium |
| C7 | Selecting Dark across all 6 presets (default, coffee, watermelon, mercury, black-gold, purple-pink) | Each preset renders dark tokens (every preset has a dark variant in the registry — `DarkPresetMissingBanner` should NOT appear) | Critical |

### C. Banner — `DarkPresetMissingBanner`

| # | Check | Expected | Priority |
|---|-------|----------|----------|
| C8 | In MDX Docs view of any component, with Dark mode + a preset that **has** a dark variant, the orange "⚠ Dark preset missing" banner is NOT shown | Banner absent (all 6 current presets have dark variants) | High |
| C9 | Banner location in DOM order is between `DeprecatedBanner` and `Subtitle` (verify by inspecting MDX `.docs-story` parent or by reading code path) | Banner element appears AFTER the deprecated banner element if both render | Medium |

### D. Per-story rendering (Atoms, Molecules, Critical components)

| # | Check | Expected | Priority |
|---|-------|----------|----------|
| C10 | Open `VcButton` (Atoms) in Story view, switch Light↔Dark across all 6 presets | All button variants (primary/secondary/danger/link) render readable text and background; no transparent text on transparent bg | Critical |
| C11 | Open `VcProductCard` (Molecules) in Dark + each preset | Card surface, price, badges, secondary text all visible and within contrast budget; no broken images / missing icons | High |
| C12 | Open `VcDialog` in Story view, Dark mode | Backdrop dark, dialog surface uses dark tokens, focus ring visible (BL-A11Y focus ring) | High |

### E. State persistence & global behaviour

| # | Check | Expected | Priority |
|---|-------|----------|----------|
| C13 | Set Dark + a specific preset (e.g. coffee), refresh the page | Selection survives reload via Storybook globals; preview re-renders dark | Medium |
| C14 | Change preset while Dark is active | Each preset switch repaints dark tokens correctly; no light flash; no JS console error | High |
| C15 | Console — no errors / warnings during toggle | Capture console for full toggle cycle on at least 3 components (Button, Card, Dialog) | High |

## Business rules to verify

- **BL-UI-001** (Layout stability on initial render) — toggling Light↔Dark must NOT cause layout shift; element sizes/positions must be identical (only colors change).
- **BL-UI-003** (No state-induced layout shift) — same as above for the global toggle.
- **WCAG 2.1 AA contrast** — dark-mode buttons/text must meet 4.5:1 normal / 3:1 large (audit on at least VcButton primary + VcProductCard price in each preset, full audit out of scope — flag obvious violations as bugs).

## Edge cases

- **EC1** — `darkMode === "system"` is supported in code but not exposed in UI. Verify code path by setting `?globals=darkMode:system` in URL → behaviour should follow `prefers-color-scheme`.
- **EC2** — Rapid toggling (5× in <2s) should not desync `html.dark` class with style element.
- **EC3** — Switching presets while Dark is active should rewrite both `:root { … }` and `html.dark { … }` blocks in the injected `<style>` element (one style element per preset).
- **EC4** — Preflight `--color-additional-50` is the body background. Verify in both modes that body background visually follows the active preset (no white flash in Dark mode load).

## Evidence policy

Follow `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`:
- Screenshots: pairs (Light + Dark) for VcButton, VcProductCard, VcDialog per preset only when a finding exists; one summary collage of all 6 presets in Dark for VcButton.
- Console: capture only errors / warnings during toggle. Skip noise.
- HAR not required (no network changes).

## Output

- Report: `tests/Sprint-current/VCST-4839/test-execution-report.md`
- Screenshots: `tests/Sprint-current/VCST-4839/screenshots/`
- Summary: `tests/Sprint-current/VCST-4839/summary.json`
