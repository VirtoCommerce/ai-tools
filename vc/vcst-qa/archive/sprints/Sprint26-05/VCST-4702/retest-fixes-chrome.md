# VCST-4702 -- Targeted Retest of PR #2202 Fixes (Chrome)

**Date:** 2026-03-17
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Browser:** Chromium via playwright-chrome
**Build:** Ver. 2.44.0-pr-2202-0a40-0a40bdeb
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Test Account:** mutykovaelena@gmail.com / Org: Bence and Family

---

## Summary

| Fix | Description | Severity | Status | Notes |
|-----|-------------|----------|--------|-------|
| Fix 1 | Button Variant Dark Mode Selectors (BUG-001) | P1 | PASS | All 8 colors x 4 variants generate correct per-color CSS selectors |
| Fix 2 | Input Autofill Dark Mode (DM-033) | P1 | PASS | box-shadow uses `var(--color-additional-50)`, resolves to `#0a090b` in dark |
| Fix 3 | Textarea Autofill (Residual P3) | P3 | CONFIRMED RESIDUAL | Still uses `--color-neutral-100` (`#2b2b2c` in dark -- dark text on dark bg) |
| Fix 4 | VcMenuItem Background | P2 | PASS | Active = dark highlight, inactive = transparent (inherits dark bg), light mode no regression |
| Fix 5 | Mobile Menu Settings Text Color | P2 | PASS | Uses `--mobile-menu-text-color` = `#f2f7f7`, readable in dark mode |
| Fix 6 | Mega Menu Focus Ring Removal | P2 | PASS | No ring-primary-100 class; uses global outline at 0.8 opacity |

**Overall Verdict:** 5/5 targeted fixes verified as working. 1 residual issue (Fix 3) confirmed as expected and documented.

---

## Fix 1: Button Variant Dark Mode Selectors (BUG-001 -- P1)

### What was tested
Extracted all CSS rules from loaded stylesheets matching button variant dark mode selectors.

### Evidence: Per-Color Individual Selectors Exist
All 4 variants (outline, no-border, no-background, solid-light) x 8 colors (primary, secondary, accent, neutral, success, danger, info, warning) have individual `html.dark` selectors:

**Dark mode outline selectors (sample):**
- `html.dark .vc-button--outline--primary { --text-color: var(--color-primary-900); --border-color: var(--color-primary-600); }`
- `html.dark .vc-button--outline--secondary { --text-color: var(--color-secondary-900); --border-color: var(--color-secondary-600); }`
- `html.dark .vc-button--outline--accent { --text-color: var(--color-accent-900); --border-color: var(--color-accent-600); }`
- ... (all 8 colors verified)

**Dark mode no-border selectors (sample):**
- `html.dark .vc-button--no-border--primary { --bg-color: transparent; --border-color: transparent; --text-color: var(--color-primary-900); }`
- `html.dark .vc-button--no-border--secondary { ... --text-color: var(--color-secondary-900); }`
- ... (all 8 colors verified)

**Dark mode no-background selectors (sample):**
- `html.dark .vc-button--no-background--primary { --text-color: var(--color-primary-900); }`
- ... (all 8 colors verified)

**Dark mode solid-light selectors (sample):**
- `html.dark .vc-button--solid-light--primary { --bg-color: var(--color-primary-200); --text-color: var(--color-primary-900); }`
- ... (all 8 colors verified)

**Invalid selectors found:** 0 (no comma-separated or malformed selectors)

### Screenshot
- `screenshots/retest-fix1-homepage-dark.png` -- Homepage in dark mode

### Verdict: PASS

---

## Fix 2: Input Autofill Dark Mode (DM-033 -- P1)

### What was tested
Extracted CSS rules for `.vc-input__input:autofill` selectors and verified resolved variable values on the sign-in page in dark mode.

### Evidence: CSS Rules

| Rule | Expected | Actual | Status |
|------|----------|--------|--------|
| `.vc-input__input:autofill:not(:disabled)` box-shadow | `var(--color-additional-50)` | `box-shadow: 0 0 0 1000px var(--color-additional-50) inset` | PASS |
| `.vc-input__input:autofill:disabled` box-shadow | `var(--color-neutral-200)` with opacity 0.6 | `box-shadow: 0 0 0 1000px var(--color-neutral-200) inset; opacity: 0.6` | PASS |
| `.vc-input__input::placeholder` color | `text-neutral-500` | `color: rgb(from var(--color-neutral-500) r g b / ...)` | PASS |

### Evidence: Resolved Variable Values (Dark Mode)
- `--color-additional-50` = `#0a090b` (dark background -- correct for dark mode autofill)
- `--color-neutral-200` = `#414143`
- `--color-neutral-500` = `#858587` (placeholder text -- sufficient contrast)
- Input text color: `rgb(233, 237, 242)` (light text on dark bg -- readable)

### Screenshot
- `screenshots/retest-fix2-signin-dark.png` -- Sign-in page in dark mode

### Verdict: PASS

---

## Fix 3: Textarea Autofill (Residual P3 -- Verify Bug Exists)

### What was tested
Checked CSS rules for `.vc-textarea__input:autofill` to confirm the known residual issue.

### Evidence: CSS Rule
```
.vc-textarea__input:autofill {
  -webkit-text-fill-color: var(--color-neutral-100);
}
```

### Analysis
- `--color-neutral-100` resolves to `#2b2b2c` in dark mode
- This means autofilled textarea text would be dark colored (`#2b2b2c`) on a dark background
- The text would be nearly invisible in dark mode

### Verdict: CONFIRMED RESIDUAL -- The bug exists as documented. This was identified as P3 and not part of the PR #2202 fix scope.

---

## Fix 4: VcMenuItem Background (vc-menu-item.vue)

### What was tested
Verified sidebar menu item styling on the account dashboard in both dark and light modes.

### Evidence: Dark Mode CSS Rules
- `html.dark .vc-menu-item__inner:not(.vc-menu-item__inner--active) { background-color: inherit; }` -- Non-active items inherit dark background
- `html.dark .vc-menu-item__inner--color--secondary:hover, html.dark .vc-menu-item__inner--color--secondary.vc-menu-item__inner--active { background-color: var(--color-secondary-100); }` -- Active/hover gets subtle highlight
- All 8 colors have individual dark mode hover/active rules

### Evidence: Computed Styles (Dark Mode)

| Element | Background | Text Color | Status |
|---------|-----------|------------|--------|
| Dashboard (active) | `rgb(21, 27, 32)` (dark highlight) | `color(srgb 0.965 0.965 0.980)` (light) | PASS |
| Orders (inactive) | `rgba(0, 0, 0, 0)` (transparent) | `color(srgb 0.965 0.965 0.980)` (light) | PASS |
| Lists (inactive) | `rgba(0, 0, 0, 0)` (transparent) | `color(srgb 0.965 0.965 0.980)` (light) | PASS |

### Evidence: Light Mode (No Regression)
- Dashboard (active): Light purple/secondary highlight background
- Other items: White background
- All text dark and readable

### Screenshots
- `screenshots/retest-fix4-sidebar-dark-v2.png` -- Dashboard sidebar in dark mode
- `screenshots/retest-fix4-hover-dark.png` -- Hover on Orders in dark mode
- `screenshots/retest-fix4-sidebar-light.png` -- Dashboard sidebar in light mode (no regression)

### Verdict: PASS

---

## Fix 5: Mobile Menu Settings Text Color

### What was tested
Resized to 375x812 mobile viewport, opened mobile menu, navigated to Settings > Currency section, verified "Currency" header text readability in dark mode.

### Evidence: CSS Implementation
- Element class: `text-[--mobile-menu-text-color]` (dynamic variable, NOT hardcoded `text-additional-50`)
- CSS rule: `.text-\[--mobile-menu-text-color\] { color: var(--mobile-menu-text-color); }`
- Variable value: `--mobile-menu-text-color` = `#f2f7f7`
- Computed color: `rgb(242, 247, 247)` -- matches expected light color for dark mode

### Screenshot
- `screenshots/retest-fix5-mobile-menu-currency-dark.png` -- Currency settings in dark mobile menu

### Verdict: PASS

---

## Fix 6: Mega Menu Focus Ring Removal

### What was tested
Focused the "All products" mega menu button in dark mode and verified focus indicator styling.

### Evidence: Computed Styles on Focus

| Property | Expected | Actual | Status |
|----------|----------|--------|--------|
| outline-style | solid (global) | `solid` | PASS |
| outline-color | Global --outline-color at 0.8 opacity | `color(srgb 0.831 0.647 0.384 / 0.8)` (accent) | PASS |
| outline-width | 2px | `2px` | PASS |
| box-shadow | none (no ring) | `none` | PASS |
| ring class in className | absent | `false` | PASS |
| ring-primary elements on page | 0 | `0` | PASS |
| Mega-menu-specific focus CSS rules | none | `[]` (empty -- uses global) | PASS |

### Screenshot
- `screenshots/retest-fix6-megamenu-focus-dark.png` -- Focused mega menu button in dark mode

### Verdict: PASS

---

## Console Errors

No JavaScript errors detected during testing. Only 1 benign warning (WebSocket connection closed during viewport resize).

## Observations

1. **Dark mode toggle not visible initially after login with [E2E Test] Contoso Ltd. org** -- The `vc-dark-available` localStorage flag was set to `false` for that org context. After setting it to `true` and switching orgs (Bence and Family), the toggle appeared and persisted. This is likely a per-org or per-store configuration, not a bug in the PR.

2. **Theme cycles through light > auto > dark** -- Three clicks required to go from light to dark. This is expected behavior.

## Screenshots Index

| File | Description |
|------|-------------|
| `retest-fix1-homepage-dark.png` | Homepage dark mode baseline |
| `retest-fix2-signin-dark.png` | Sign-in page dark mode -- input fields |
| `retest-fix4-sidebar-dark-v2.png` | Account sidebar dark mode |
| `retest-fix4-hover-dark.png` | Menu item hover state dark mode |
| `retest-fix4-sidebar-light.png` | Account sidebar light mode (regression check) |
| `retest-fix5-mobile-menu-currency-dark.png` | Mobile menu currency settings dark mode |
| `retest-fix6-megamenu-focus-dark.png` | Mega menu focus ring dark mode |
