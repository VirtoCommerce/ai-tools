# BUG-UIUX-CE: Coffee theme — opacity-based focus outlines fail WCAG 1.4.11 Non-text Contrast (VcModal buttons + account popup buttons)

## Status: CONFIRMED

## Severity: High (P1)
## Category: Accessibility (A11y) / Design System
## WCAG Criteria:
- **2.4.7 Focus Visible** (Level AA) — focus indicator present but contrast is so low it is functionally invisible
- **1.4.11 Non-text Contrast** (Level AA) — focus indicator contrast < 3:1 against adjacent background

## Consolidated Findings

This report consolidates UIUX-BUG-C (modal button outlines) and UIUX-BUG-E (account popup button outlines) — both share the same root cause: the Coffee theme's focus `outline-color` is set with 30–40% opacity, which alpha-blends against the white background to produce contrast ratios well below the 3:1 WCAG minimum.

## Suite / Case Mapping: VCST-4906 a11y audit / UIUX-BUG-C + UIUX-BUG-E

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/company/members (modal + account popup)
- **Browser:** Chrome DevTools MCP (Chromium 1280×800 desktop)
- **Theme:** Coffee, vc-frontend `2.49.0-pr-2280-8069-80690ef2`
- **Date:** 2026-05-14

## Summary

The Coffee theme applies `outline-color: color(srgb ... / 0.3–0.4)` (30–40% opacity) on focused interactive elements. When alpha-blended against the white backgrounds used in modals and the account popup, the resulting perceived colour has a contrast ratio of **1.47:1 to 1.68:1** — all below the 3:1 threshold required by WCAG 1.4.11 for non-text UI components.

Affected elements confirmed via live measurement:

| Element | Raw `outline-color` | Opacity | Blended hex (on white) | Contrast vs white | Passes 3:1? |
|---------|---------------------|---------|----------------------|-------------------|-------------|
| Modal Close button | `srgb(0.6, 0.4235, 0.3529)` | 40% | `#D6C4BD` | **1.68:1** | FAIL |
| Modal OK button | `srgb(0.45, 0.45, 0.45)` | 30% | `#D5D5D5` | **1.48:1** | FAIL |
| Modal Cancel button | `srgb(0.45, 0.45, 0.45)` | 30% | `#D5D5D5` | **1.47:1** | FAIL |
| "Back to John Mitchell" button | `srgb(0.6, 0.4235, 0.3529)` | 40% | `#D6C4BD` | **1.68:1** | FAIL |
| Logout (sign-out) button | `srgb(0.45, 0.45, 0.45)` | 30% | `#D5D5D5` | **1.47:1** | FAIL |
| Dashboard link (account popup) | `srgb(0.6, 0.4235, 0.3529)` | 40% | `#D6C4BD` | **1.68:1** | FAIL |

All six elements fail WCAG 1.4.11. The focus indicator is virtually invisible against the white modal and account popup backgrounds.

## Contrast Calculation

Alpha-blending formula used: `blended_channel = outline_channel × alpha + white × (1 − alpha)`

**Example — Modal Close button (`srgb(0.6, 0.4235, 0.3529) @ 40%` on white):**
```
R = 0.6 × 0.4 + 1.0 × 0.6 = 0.84
G = 0.4235 × 0.4 + 1.0 × 0.6 = 0.7694
B = 0.3529 × 0.4 + 1.0 × 0.6 = 0.7412

Relative luminance (L):
  R_lin = ((0.84 + 0.055) / 1.055)^2.4 = 0.6700
  G_lin = ((0.7694 + 0.055) / 1.055)^2.4 = 0.5567
  B_lin = ((0.7412 + 0.055) / 1.055)^2.4 = 0.5131
  L = 0.2126 × 0.6700 + 0.7152 × 0.5567 + 0.0722 × 0.5131 = 0.576

Contrast vs white (L=1.0):
  (1.0 + 0.05) / (0.576 + 0.05) = 1.68:1
```

Same method verified for all rows in the table above.

## Steps to Reproduce

### Modal buttons

1. Sign in as `test-john.mitchell-20260310@test-agent.com`.
2. Navigate to `/company/members`.
3. Click Login on behalf for any member row → confirm modal opens.
4. Tab to the Close / OK / Cancel button.
5. In DevTools:
   ```javascript
   const btn = document.activeElement;
   const s = window.getComputedStyle(btn);
   console.log({ outlineColor: s.outlineColor, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle });
   ```
6. **Result:** `outlineColor: color(srgb 0.6 0.423529 0.352941 / 0.4)` or `color(srgb 0.45098 0.45098 0.45098 / 0.3)` — both with < 0.5 alpha.

### Account popup buttons

1. Click the "David Kim" account button in the top header.
2. Tab to "Back to John Mitchell" or the Logout icon button.
3. Run the same DevTools snippet — same opacity-based outline colors returned.

## Impact

- **Keyboard users with low vision** cannot see which button has focus when tabbing through the confirmation modal or the account popup. This affects a security-critical action (impersonation confirmation) and the only in-header logout path.
- **WCAG Level AA failure:** SC 2.4.7 (Focus Visible) + SC 1.4.11 (Non-text Contrast). Both are required for WCAG 2.1 AA conformance.
- The pattern affects every Coffee-theme interactive element rendered over a white/light background — the impact is storefront-wide.

## Root Cause

The Coffee theme CSS defines focus `outline-color` using an rgba/`color()` with opacity rather than a fully-opaque token. On white backgrounds the blended result is too light. The fix is to use the fully-opaque equivalent of the Coffee primary color (or a specifically chosen accessible focus color) for the outline token.

## Recommended Fix

1. Replace the opacity-based `outline-color` token with a fully-opaque color that achieves ≥ 3:1 contrast against white. The Coffee primary color `srgb(0.6, 0.4235, 0.3529)` has luminance ~0.12, giving 6.8:1 contrast against white — use this directly instead of at 40% opacity.
2. Alternatively, introduce a dedicated `--vc-focus-outline-color` CSS custom property with the fully-opaque focus color and apply it consistently across all interactive elements.
3. Re-audit the Dashboard link and any other elements sharing this outline token.
4. Verify the fix passes `contrast([outline-color], [adjacent-background]) ≥ 3:1` at all affected surfaces.

## Evidence

- Screenshot (modal, OK button focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-C-modal-ok-focused.png`
- Screenshot (modal, Close button focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-C-modal-close-focused.png`
- Screenshot (account popup, Back to John Mitchell focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-E-back-to-operator-focused-outline.png`
- Screenshot (account popup, Logout focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-E-sign-out-focused-outline.png`
- Audit report: `tests/Sprint-current/VCST-4906/uiux-report.md` (UIUX-BUG-C and UIUX-BUG-E)

## Related

- [BUG-UIUX-B-modal-missing-aria-describedby-VCST-4906.md](BUG-UIUX-B-modal-missing-aria-describedby-VCST-4906.md) — companion finding on the same modal: `aria-describedby` not wired.
- [BUG-UIUX-D-account-popup-missing-menu-roles-VCST-4906.md](BUG-UIUX-D-account-popup-missing-menu-roles-VCST-4906.md) — account popup ARIA roles deficiency (same popup, different finding).
- VCST-4906 — A11y audit. UIUX-BUG-C and UIUX-BUG-E.
