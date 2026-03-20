# VCST-4702: Dark Mode (Mercury Theme) -- Retest After Fix

**Date:** 2026-03-17 | **Env:** https://vcst-qa-storefront.govirto.com | **Browser:** Chromium (playwright-chrome)
**Previous Build:** 2.44.0-pr-2202-2d84-2d84f2a4
**Current Build:** 2.44.0-pr-2202-0a40-0a40bdeb (NEW -- confirmed deployed)
**PR:** #2202
**Tester:** qa-frontend-expert (automated via MCP)

---

## Summary

New build `0a40bdeb` is deployed. **BUG-001 (SCSS button variants) is FIXED.** DM-033 (autofill override) is **partially fixed** -- the wrong dark-mode text color rule was removed and the autofill background now uses a variable that resolves correctly in both modes, but a residual issue remains for `.vc-textarea__input:autofill`. No regressions detected in theme toggle, homepage, catalog, or light-mode switchback.

---

## Task 1: Build Version Verification

| Property | Previous | Current | Status |
|----------|----------|---------|--------|
| Build | 2.44.0-pr-2202-2d84-2d84f2a4 | 2.44.0-pr-2202-0a40-0a40bdeb | **NEW BUILD CONFIRMED** |

The build version was extracted from the page footer: `Ver. 2.44.0-pr-2202-0a40-0a40bdeb`.

---

## Task 2: BUG-001 Fix Verification -- SCSS Button Variants (P1)

**Status: FIXED**

### What was broken (previous build)
The SCSS `@each` loop used `#{$colors}` (list variable) instead of `#{$color}` (iterator), producing invalid CSS selectors. Only `primary` color worked; the other 7 colors generated selectors like `.vc-button secondary` (missing `--outline--` prefix), and all got the last color's values (warning).

### What was verified (current build)

**All 5 button variants now have correct per-color selectors for all 8 colors:**

| Variant | Colors Found | Valid Format | Unique Values |
|---------|-------------|--------------|---------------|
| outline | 8/8 | `html.dark .vc-button--outline--{color}` | Each color references its own `--color-{color}-*` vars |
| no-border | 8/8 | `html.dark .vc-button--no-border--{color}` | Correct |
| no-background | 8/8 | `html.dark .vc-button--no-background--{color}` | Correct |
| solid-light | 8/8 | `html.dark .vc-button--solid-light--{color}` | Correct |
| solid | 8/8 | `html.dark .vc-button--solid--{color}` (+ hover) | Correct (was already working) |

**Invalid selectors found: 0** (previously there were 4 patterns of invalid comma-separated selectors)

**CSS property uniqueness confirmed** for outline variant (representative sample):
- `html.dark .vc-button--outline--primary`: `--text-color: var(--color-primary-900); --border-color: var(--color-primary-600)`
- `html.dark .vc-button--outline--secondary`: `--text-color: var(--color-secondary-900); --border-color: var(--color-secondary-600)`
- `html.dark .vc-button--outline--accent`: `--text-color: var(--color-accent-900); --border-color: var(--color-accent-600)`
- `html.dark .vc-button--outline--neutral`: `--text-color: var(--color-neutral-900); --border-color: var(--color-neutral-600)`
- `html.dark .vc-button--outline--success`: `--text-color: var(--color-success-900); --border-color: var(--color-success-600)`
- `html.dark .vc-button--outline--danger`: `--text-color: var(--color-danger-900); --border-color: var(--color-danger-600)`
- `html.dark .vc-button--outline--info`: `--text-color: var(--color-info-900); --border-color: var(--color-info-600)`
- `html.dark .vc-button--outline--warning`: `--text-color: var(--color-warning-900); --border-color: var(--color-warning-600)`

Previously, ALL colors were set to `--color-warning-*` (the last iteration value). Now each color correctly references its own color family.

**Pass criteria met:** Each button variant+color combination has its own valid CSS rule with proper `--variant--color` selector format.

---

## Task 3: DM-033 Fix Verification -- Autofill Override (P1)

**Status: PARTIALLY FIXED -- residual low-severity issue remains**

### What was broken (previous build)
1. `html.dark input:autofill, html.dark textarea:autofill` used `-webkit-text-fill-color: var(--color-neutral-100)` which resolves to `#2b2b2c` (dark text) in dark mode
2. No dark-mode `box-shadow` override for `.vc-input__input:autofill:not(:disabled)` -- autofill background stayed white (`rgb(255, 255, 255)`)

### What changed (current build)

| Aspect | Previous Build | Current Build | Assessment |
|--------|---------------|---------------|------------|
| `html.dark input:autofill` text-fill rule | Present with wrong `--color-neutral-100` | **REMOVED entirely** | FIXED -- wrong rule eliminated |
| `.vc-input__input:autofill:not(:disabled)` box-shadow | `rgb(255, 255, 255)` (hardcoded white) | `var(--color-additional-50)` = `#0a090b` in dark | FIXED -- dark background now used |
| `.vc-textarea__input:autofill` text-fill | `var(--color-neutral-100)` = `#2b2b2c` in dark | `var(--color-neutral-100)` = `#2b2b2c` in dark | **NOT FIXED** -- still dark text |
| `.vc-input__input:autofill` text-fill | N/A (relied on dark rule) | No explicit rule (inherits from input `color`) | OK -- input color is `rgb(233, 237, 242)` (light) |
| `.vc-input__input:autofill:disabled` box-shadow | `rgb(249, 250, 251)` (hardcoded light) | `var(--color-neutral-200)` = `#414143` in dark | IMPROVED |

### Detailed Analysis

**For input elements (`.vc-input__input`):**
- The autofill background now uses `var(--color-additional-50)` which resolves to `#0a090b` in dark mode -- a dark background. This eliminates the jarring white flash reported in the previous test.
- There is no explicit `-webkit-text-fill-color` for `.vc-input__input:autofill`, but the input's computed color is `rgb(233, 237, 242)` (light) in dark mode. When browser autofill activates, Chrome may override this, but the box-shadow trick should mask the browser's default blue/yellow background.
- The sign-in page renders correctly in dark mode with readable input fields.

**For textarea elements (`.vc-textarea__input`):**
- Still uses `var(--color-neutral-100)` for `-webkit-text-fill-color`, which resolves to `#2b2b2c` in dark mode.
- If a textarea receives autofill on a dark background, the text would be dark-on-dark (poor contrast).
- **Severity: Low** -- textarea autofill is uncommon in practice (browsers rarely autofill textarea elements).

### Residual Issue

**DM-033-R: `.vc-textarea__input:autofill` still uses `--color-neutral-100` for text color**
- **Severity:** Low (P3) -- textarea autofill is rare in real usage
- **Current CSS:** `.vc-textarea__input:autofill { -webkit-text-fill-color: var(--color-neutral-100); }` where `--color-neutral-100` = `#2b2b2c` in dark mode
- **Suggested fix:** Change to `var(--color-neutral-900)` (`#dfdfe3` in dark mode) or wrap in a dark-mode override
- **Impact:** Minimal -- no textareas on sign-in, sign-up, or checkout forms use browser autofill

### Pass criteria assessment
- Autofill text color for inputs: **PASS** -- wrong explicit rule removed; inherited color is light
- Autofill background override for dark mode: **PASS** -- uses `var(--color-additional-50)` which is dark
- Textarea autofill text color: **FAIL (Low severity)** -- unchanged from previous build

---

## Task 4: Regression Check

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Theme toggle cycles correctly | **PASS** | auto -> dark -> light -> auto (verified via click and localStorage inspection) |
| 2 | Homepage dark mode rendering | **PASS** | Header, hero, sign-in form, feature cards, subscribe section, footer all render correctly |
| 3 | Catalog page (/laptops) dark mode | **PASS** | Facet sidebar, product grid (24 results), prices, discount badges, stock indicators, quantity controls all readable |
| 4 | Light mode switchback | **PASS** | No visual artifacts after switching from dark to light on catalog page |
| 5 | Console errors | **PASS** | 0 errors across all tested pages |
| 6 | Network requests | **PASS** | All GraphQL calls returned 200. Only `cdn-cgi/rum` (Cloudflare RUM) had expected ERR_ABORTED |

**Note:** `/soft-drinks` returns 404 -- this appears to be a catalog data change (not present in current nav), not a dark mode regression. Used `/laptops` instead.

---

## Task 5: Evidence Screenshots

| File | Description |
|------|-------------|
| `screenshots/retest-01-build-version-new.png` | Homepage with new build version `0a40bdeb` in dark mode |
| `screenshots/retest-02-signin-dark-mode.png` | Sign-in page in dark mode -- input fields readable |
| `screenshots/retest-03-signin-light-mode.png` | Sign-in page after switching to light mode -- no artifacts |
| `screenshots/retest-04-homepage-dark-regression.png` | Homepage dark mode regression check |
| `screenshots/retest-05-catalog-dark-regression.png` | Catalog (/laptops) in dark mode -- 24 products, facets, prices |
| `screenshots/retest-06-catalog-light-regression.png` | Catalog after switching back to light mode -- clean |

---

## Console & Network Summary

**Console errors:** 0 across all pages (homepage, sign-in, catalog)
**Network failures:** 0 API failures. All GraphQL calls returned 200.
**Vue hydration warnings:** None observed.

---

## CSS Variable Resolution Reference (Dark Mode)

| Variable | Dark Mode Value | Used In |
|----------|----------------|---------|
| `--color-additional-50` | `#0a090b` | Autofill background (box-shadow) -- CORRECT |
| `--color-neutral-100` | `#2b2b2c` | Textarea autofill text -- WRONG for dark mode |
| `--color-neutral-200` | `#414143` | Disabled autofill background -- acceptable |
| `--color-neutral-500` | `#858587` | Disabled autofill text -- acceptable |
| `--color-neutral-900` | `#dfdfe3` | Should be used for dark mode text fill |
| `--color-neutral-50` | `#141415` | Input area background |

---

## Verdict

| Bug | Previous Status | Current Status | Severity |
|-----|----------------|----------------|----------|
| **BUG-001**: SCSS button variant selectors | FAIL (P1) | **FIXED** | Was P1 -- resolved |
| **DM-033**: Autofill dark-mode text color | FAIL (P1) | **PARTIALLY FIXED** | Input: fixed. Textarea residual: P3 |
| **DM-033-R**: Textarea autofill text color | N/A | **OPEN (new, low)** | P3 -- textarea autofill is rare |

### Recommendation

**PASS** -- The P1 blocker (BUG-001) is fully resolved. The autofill issue (DM-033) is substantially improved -- the jarring white background is gone and input text color is now correct. The textarea residual (DM-033-R) is P3 severity and should not block the PR.

The dark mode feature is now in a shippable state for PR #2202.

---

**QA Sign-off:** PASS | **Residual:** DM-033-R (P3, non-blocking)
**Agent:** qa-frontend-expert | **Date:** 2026-03-17
