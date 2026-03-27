# Bug Reproduction Report: VCST-4703

**Title:** [BOPIS][A11y] WCAG 1.4.11 — Unselected radio button contrast ratio fails (2.52:1 vs required 3:1)
**Date:** 2026-03-26
**Tester:** ui-ux-expert (Claude Sonnet 4.6)
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Storybook:** https://vcst-qa-storybook.govirto.com
**Verdict:** REPRODUCED — FAIL

---

## Reproduction Result

**STATUS: CONFIRMED FAIL**

The bug is fully reproduced. The unselected `vc-radio-button__indicator` border renders at **2.52:1** contrast ratio against its white background, failing WCAG 1.4.11 (minimum 3:1 required for UI component boundaries). The failure is present in both the live storefront BOPIS modal and the Storybook component library under the Coffee theme.

---

## Steps Executed

### Step 1 — Navigate to storefront and confirm cart has items
- Navigated to `https://vcst-qa-storefront.govirto.com/cart`
- Cart contained 4 items (4 film cameras)
- Screenshot: `screenshots/02-cart-with-bopis-section.png`

### Step 2 — Open the BOPIS pickup location modal
- Identified the "SHIPPING DETAILS" section in the cart with "Pickup" delivery option active
- Pickup point displayed: "6900 Airport Road, Mississauga, Ontario" with a change button
- Clicked the change button (uid=14_162) adjacent to the pickup point address
- The "Pick points" dialog opened, displaying a list of 50 pickup locations with radio buttons
- Screenshot: `screenshots/03-bopis-modal-open.png`

### Step 3 — Inspect the unselected radio button border color via DOM/CSS
Queried computed styles on `.vc-radio-button__indicator` elements inside the dialog:

```
Element: SPAN.vc-radio-button__indicator
borderColorRaw:  color(srgb 0.639216 0.639216 0.639216)
borderColorHex:  #a3a3a3  (r=163, g=163, b=163)
backgroundColor: color(srgb 1 1 1)  →  #ffffff
borderWidth:     2px
borderStyle:     solid
dimensions:      16px × 16px
```

The CSS rule driving the border color was extracted from the stylesheet:

```css
.vc-radio-button__indicator {
  border-width: 2px;
  border-color: rgb(from var(--color-neutral-400) r g b / var(--tw-border-opacity, 1));
  background-color: rgb(from var(--color-additional-50) r g b / var(--tw-bg-opacity, 1));
}
```

The design token `--color-neutral-400` resolves to `#a3a3a3` in both the storefront and the Storybook iframe.

### Step 4 — Calculate and verify the contrast ratio

**WCAG 2.1 Relative Luminance (per IEC 61966-2-1):**

| Color | Hex | Luminance |
|-------|-----|-----------|
| Radio border (unselected) | `#a3a3a3` | 0.366253 |
| Background | `#ffffff` | 1.000000 |

**Contrast Ratio:**
```
(1.000000 + 0.05) / (0.366253 + 0.05) = 1.05 / 0.416253 = 2.52:1
```

**WCAG 1.4.11 Non-text Contrast requires: 3:1 minimum**

**Shortfall: 0.48 ratio points** (2.52 vs 3.00 required)

---

## Evidence

### Computed CSS — Storefront BOPIS modal (live)

```json
{
  "element": ".vc-radio-button__indicator",
  "isChecked": false,
  "borderColorRaw": "color(srgb 0.639216 0.639216 0.639216)",
  "borderColorHex": "#a3a3a3",
  "backgroundColor": "#ffffff",
  "borderWidth": "2px",
  "contrastRatio": "2.52:1",
  "passesWCAG_1_4_11": false
}
```

### Computed CSS — Storybook VcRadioButton Basic (Coffee theme)

```json
{
  "source": "Storybook iframe — VcRadioButton Basic — Coffee theme",
  "borderColorRaw": "color(srgb 0.639216 0.639216 0.639216)",
  "borderColorHex": "#a3a3a3",
  "bgColorHex": "#ffffff",
  "borderWidth": "2px",
  "contrastRatioVsWhiteBg": "2.52:1",
  "wcag141Pass": false,
  "designToken": { "--color-neutral-400": "#a3a3a3" }
}
```

### Checked state — passes (for comparison)

```json
{
  "isChecked": true,
  "borderColorHex": "#996c5a",
  "contrastRatioVsWhite": "4.52:1",
  "passesWCAG_1_4_11": true
}
```

The selected/checked state uses `--base-color` (`#996c5a`) which passes at 4.52:1. Only the unselected state fails.

### Axe-core Storybook Scan

The Storybook Accessibility tab (axe-core) reports **0 violations** for this story. This is a known limitation — axe-core does not automatically detect WCAG 1.4.11 failures on custom visual indicators (decorative `<span>` elements rendered via Tailwind CSS variables). Manual inspection is required for this criterion.

---

## Screenshots

| File | Description |
|------|-------------|
| `screenshots/01-storefront-home.png` | Storefront home on load |
| `screenshots/02-cart-with-bopis-section.png` | Cart page with BOPIS Shipping Details section |
| `screenshots/03-bopis-modal-open.png` | "Pick points" modal open, radio buttons visible |
| `screenshots/04-bopis-modal-radio-buttons.png` | Close-up of modal with unselected radio buttons |
| `screenshots/05-storybook-basic-coffee-theme.png` | VcRadioButton Basic story under Coffee theme in Storybook |
| `screenshots/06-storybook-a11y-tab-0-violations.png` | Storybook Accessibility tab — 0 violations (axe-core blind spot) |

---

## Classification

| Attribute | Value |
|-----------|-------|
| WCAG Criterion | 1.4.11 Non-text Contrast (Level AA) |
| Severity | P0 — A11y Critical (legal compliance risk) |
| Bug Category | A11y Critical |
| Component | `vc-radio-button` / `.vc-radio-button__indicator` |
| Theme | Coffee (and all themes sharing `--color-neutral-400: #a3a3a3`) |
| Context | BOPIS pickup location modal in cart, and component library |
| Affects | All unselected `VcRadioButton` instances with white background |

---

## Root Cause

The unselected state border color is hardcoded to the design token `--color-neutral-400` (`#a3a3a3`). This neutral-400 gray value achieves only 2.52:1 contrast against white (`#ffffff`), falling short of the 3:1 minimum required by WCAG 1.4.11.

CSS rule in `.vc-radio-button__indicator`:
```css
border-color: rgb(from var(--color-neutral-400) r g b / var(--tw-border-opacity, 1));
```

The checked state correctly uses `--base-color` which resolves to `#996c5a` (4.52:1 — passes). The disabled state uses `--color-neutral-300` which would be even lighter and also fail.

---

## Fix Recommendation

Replace `--color-neutral-400` with `--color-neutral-500` (`#737373`) for the unselected radio button indicator border. Verified:

| Color | Hex | Contrast vs #ffffff | Passes 3:1 |
|-------|-----|---------------------|------------|
| neutral-400 (current) | `#a3a3a3` | 2.52:1 | FAIL |
| neutral-500 | `#737373` | 4.48:1 | PASS |

The fix scope is the `.vc-radio-button__indicator` CSS rule (unselected state only). This is a single token swap in the component stylesheet.

---

## Scope of Impact

This failure affects every `VcRadioButton` in its unselected state rendered on a white background. Beyond the BOPIS modal, this includes:

- All `VcRadioButton` usage across the storefront (shipping method selectors, payment method selectors, filters, etc.)
- All Storybook stories using the Basic/unchecked state
- All themes that inherit `--color-neutral-400: #a3a3a3`

---

*Report generated by ui-ux-expert agent — VCST-4703 reproduction*
