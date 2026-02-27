# BUG: A11y — BOPIS Pickup Modal — Unselected Radio Button Border Fails WCAG 1.4.11 Non-text Contrast

**Bug ID:** BUG-WCAG-1411-BOPIS-Pickup-Modal-Unselected-Radio-Contrast
**Related Ticket:** VCST-4565
**Date Found:** 2026-02-27
**Found By:** ui-ux-expert agent (Chrome DevTools inspection)
**Severity:** High
**Priority:** P1
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, contrast, wcag-1.4.11, bopis, radio-button, vc-radio-button

---

## Summary

In the BOPIS pickup location modal ("Pick points" dialog), the unselected radio button borders fail WCAG 2.1 AA Success Criterion 1.4.11 Non-text Contrast. The border color achieves only **2.52:1** contrast ratio against the white background, where **3:1 is required**.

All 50 unselected radio buttons in the pickup location list are affected.

---

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com |
| Browser | Chrome (Chromium via Chrome DevTools MCP) |
| Viewport | 1920x1080 (Desktop) |
| Date | 2026-02-27 |
| Related Feature | VCST-4565 — Show selected pick point on Pick Point popup window open |
| Component | `vc-radio-button` (Vue.js, used inside `select-address-map-list`) |

---

## Steps to Reproduce

1. Log in to the QA storefront (https://vcst-qa-storefront.govirto.com)
2. Add any item to cart
3. Navigate to Cart page
4. Switch delivery mode to "Pickup"
5. Click the pencil/edit icon next to the pickup point field to open the "Pick points" modal
6. Observe any **unselected** radio button in the pickup location list

---

## Expected Result

Unselected radio button border color provides at least **3:1** contrast ratio against the white background, per WCAG 2.1 SC 1.4.11 Non-text Contrast (Level AA).

---

## Actual Result

Unselected radio button border color is `rgb(163, 163, 163)` which achieves only **2.52:1** contrast ratio against white (`#ffffff`).

### Contrast Audit

| Element | Foreground | Background | Measured Ratio | Required | Result |
|---------|-----------|------------|----------------|----------|--------|
| Unselected radio border | `rgb(163, 163, 163)` = `#a3a3a3` | `#ffffff` (white) | **2.52:1** | >= 3.0:1 | **FAIL** |
| Selected radio border | `rgb(153, 108, 90)` = `#996c5a` | `#ffffff` (white) | 4.52:1 | >= 3.0:1 | PASS |
| Selected radio border on row bg | `rgb(153, 108, 90)` | `rgb(238, 240, 242)` | 3.96:1 | >= 3.0:1 | PASS |

Note: The selected state passes because the brand color `#996c5a` has sufficient contrast. Only the unselected/default border color fails.

### Computed CSS for Unselected Radio Input

```css
/* Inspected via evaluate_script in the Pick points dialog */
element: INPUT[type="radio"]
width: 16px
height: 16px
appearance: none
background-color: rgb(255, 255, 255)
border-color: rgb(163, 163, 163)   /* <-- FAILS 3:1 */
border-width: 1px
border-radius: 9999px (circular)
```

---

## Impact

- **Scale:** All 50 unselected radio buttons in the pickup location list are affected simultaneously
- **Users affected:** People with low vision, color blindness, or reduced contrast sensitivity cannot reliably identify the radio button control boundary
- **Functional impact:** The control boundary is not visually identifiable as a selectable input for affected users
- **Compliance:** This is a WCAG 2.1 Level AA violation that constitutes a legal compliance risk
- **Component scope:** The fix is needed in the `vc-radio-button` component — may affect all usages across the storefront

---

## Suggested Fix

Change the unselected radio button border color in the `vc-radio-button` component to meet the 3:1 minimum.

| Option | Color | Contrast vs White | Meets 3:1 |
|--------|-------|-------------------|-----------|
| **Current (failing)** | `rgb(163, 163, 163)` / `#a3a3a3` | 2.52:1 | No |
| Minimum fix | `rgb(117, 117, 117)` / `#757575` | 3.01:1 | Marginal |
| Recommended | `rgb(100, 100, 100)` / `#646464` | ~3.5:1 | Yes (safe margin) |
| Conservative | `rgb(80, 80, 80)` / `#505050` | ~4.5:1 | Yes (comfortable) |

The fix should be applied to the CSS variable or class controlling the default/unselected radio button border in the `vc-radio-button` Vue component.

**Targeted CSS location:**
```css
/* vc-radio-button component — unselected state */
.vc-radio-button__input {
  border-color: #a3a3a3;   /* current — change to #757575 or darker */
}
```

---

## WCAG Reference

- **Criterion:** 1.4.11 Non-text Contrast (Level AA)
- **Description:** The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s): User Interface Components — visual information required to identify user interface components and states.
- **Source:** https://www.w3.org/TR/WCAG21/#non-text-contrast
- **Applies to:** Radio button border (the visual boundary that identifies the control type)

---

## Evidence

- **Report:** `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/test-execution-report.md`
- **Screenshots:**
  - `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/screenshots/desktop/04-selected-radio-detail-desktop.png`
  - `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/screenshots/desktop/02-modal-list-selected-item-visible-desktop.png`

---

## Additional Notes

The selected radio button border (`rgb(153, 108, 90)`, brand brown) passes at 4.52:1. The issue is isolated to the unselected state only. Fixing this globally in `vc-radio-button` will benefit all radio group usages across the design system, not just the BOPIS modal.

The design system should audit all neutral/grey border colors used for unselected/inactive form controls to ensure they meet 3:1 against their backgrounds. Similar issues may exist in checkbox, select, and input component default borders. See also: `BUG-WCAG-Primary-Color-Contrast-Systemic-Failure.md` for related systemic contrast concerns.
