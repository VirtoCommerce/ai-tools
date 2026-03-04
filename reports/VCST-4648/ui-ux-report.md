# VCST-4648: Dark Mode (Coffee Theme) — UI/UX Accessibility & Design Review

**Date:** 2026-03-04
**Browser:** Chrome DevTools MCP
**Environment:** https://vcst-qa-storefront.govirto.com (ver. 2.43.0-pr-2200-cbd4-cbd47d7f)
**Scope:** Homepage, Catalog, Cart, Contacts pages

## Sign-Off Table

| Area | Status | Issues |
|------|--------|--------|
| Design Accuracy (dark palette tokens) | ⚠ WARN | 1 |
| Accessibility (WCAG AA) | ⚠ WARN | 3 |
| Component States (DarkModeToggle) | ⚠ WARN | 3 |
| Responsive | ✅ PASS | 0 |
| UX Evaluation | ⚠ WARN | 2 |

**Decision: CONDITIONS** — Dark mode is structurally sound. Two blocking issues prevent APPROVED status.

---

## BUG-1 (High) — Builder.io Content Blocks: Hardcoded Light Backgrounds in Dark Mode

**WCAG:** 1.4.3 Contrast (Minimum) + 1.4.11 Non-text Contrast
**Affected page:** Homepage (`/`)

Builder.io injects per-block CSS rules with hardcoded light RGB values outside the `html.dark` token system:

| Builder.io Block | Background | Dark Mode Text | Contrast Ratio | Required | Result |
|-----------------|-----------|---------------|---------------|----------|--------|
| `.builder-0289ed6d...` | rgb(253,252,249) near-white | rgb(238,226,221) near-white | ~1.02:1 | 4.5:1 | **FAIL** |
| `.builder-397ac5a1...` | rgb(225,225,225) light gray | rgb(238,226,221) near-white | 1.03:1 | 3:1 (H2) | **FAIL** |
| `.builder-b1d3f569...` | rgb(250,250,250) near-white | rgb(238,226,221) near-white | ~1.02:1 | 4.5:1 | **FAIL** |

**Root cause:** Builder.io generates dynamic rules like `background-color: rgb(225, 225, 225)` not scoped to `html.dark`. Homepage content bypasses `vc-container` entirely. Other pages (catalog, cart, contacts, PDP) work correctly.

**Fix:** Set Builder.io block backgrounds to CSS variables (`var(--color-body-bg)`) or add override: `.dark .builder-block { background-color: var(--color-body-bg); }`

---

## BUG-2 (High) — DarkModeToggle: No Explicit Focus-Visible Style

**WCAG:** 2.4.7 Focus Visible

`.dark-mode-toggle__button` has no `:focus`, `:focus-visible`, or `:focus-within` rule. Computed outline is `none 0px`.

**Fix:**
```css
.dark-mode-toggle__button:focus-visible {
  outline: 3px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: 4px;
}
```

---

## BUG-3 (Medium) — DarkModeToggle: Aria-label Communicates State, Not Action

**WCAG:** 4.1.2 Name, Role, Value (best practice)

`aria-label="Theme: dark"` doesn't communicate what pressing the button will do. Recommended: `aria-label="Switch to light mode (currently: dark)"`. Also: SVG icon lacks `aria-hidden="true"`.

---

## Dark Mode Token System — PASS

- **229 CSS custom properties** in `html.dark` selector
- All 8 color scales fully overridden (primary, secondary, accent, neutral, warning, danger, success, info)
- Semantic tokens complete: `--color-body-bg: #1c1c1c`, `--color-body-text: #eee2dd`
- Component overrides: button variants, badges, chips, alerts — all correctly mapped
- No ad-hoc hardcoded hex values in dark SCSS overrides

## FOUC Prevention — PASS

Inline `<head>` script reads localStorage and applies `dark` class synchronously before first paint.

## VC-Rendered Elements Contrast — PASS

21 elements measured across header, nav, body text, inputs, buttons, badges, breadcrumbs, footer, price display. Ratios range 4.53:1 to 17.53:1. Only Builder.io-injected elements fail.
