# BUG_082_001: ImpersonateForm.vue inputs and toggle below WCAG 44 × 44 minimum

## Status: CONFIRMED

## Severity: Medium
## Category: Accessibility (A11y) / Design System / Auth
## WCAG Criterion: 2.5.5 Target Size (Level AAA) / 2.5.8 Target Size Minimum (Level AA, WCAG 2.2)
## Suite / Case Mapping: regression suite 082 / IMP-001 (Security Verification form render)

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/account/impersonate/{userId}
- **Browser:** Chrome DevTools MCP (Chromium) — fresh incognito / no-auth context (anonymous session forces Form path)
- **Viewports tested:** 500 (clamped from 375) / 768 / 1280
- **Theme:** Coffee, vc-frontend pr-2280 (`2.49.0-pr-2280-80690ef2`)
- **Date:** 2026-05-14
- **Reported By:** `/qa-design /company/members LoginOnBehalf flow` form-path follow-up audit (Finding F-09)
- **Report:** `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/report.md`

## Summary

The Security Verification form rendered at `/account/impersonate/:userId` (when the user is anonymous OR lacks `platform:security:loginOnBehalf`) ships three interactive elements that fail WCAG 2.5.5 / 2.5.8's 44 × 44 px target minimum **at every viewport including 1280 px desktop**:

| Element | Dimensions (WxH) | Shortfall | Source |
|---------|------------------|-----------|--------|
| Email input | h = 36 px | −8 px | `VcInput size="md"` |
| Password input | h = 36 px | −8 px | `VcInput size="md"` |
| Show/hide password toggle | 38 × 38 px | −6 px / side | inside `VcInput` |

At mobile, the password input's right edge and the show/hide toggle's left edge are **1 pixel apart** — well below the recommended 8 px adjacent-target spacing (WCAG 2.5.5 NOTE on target spacing).

The `Verify and continue` and `Cancel` buttons both correctly meet 44 × 44 (PASS).

This is a shared `VcInput size="md"` defect — it ships into every form in the storefront, not only the impersonate form. The impersonation flow is where it surfaced because the design audit covered the form path specifically.

## Reproduction Results

### Steps to Reproduce

1. Open a fresh incognito browser window (no existing auth cookie).
2. Navigate directly to `/account/impersonate/ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (the target userId — any valid storefront userId works; David Kim's ID is used by VCST-4905 fixtures).
3. Confirm `ImpersonateForm.vue` rendered (page title "SECURITY VERIFICATION", Email + Password + Verify + Cancel). If you are auto-redirected to `/sign-in`, the build may have changed — this reproduction assumes the Form path renders for anonymous sessions, which is the documented PR #2279 behaviour.
4. Open DevTools at 1280 px viewport. Run:
   ```javascript
   const els = [
     document.querySelector('input[type="email"], input[name="email"]'),
     document.querySelector('input[type="password"]'),
     document.querySelector('button[aria-label*="password"], button[aria-label*="Show"], button[aria-label*="Hide"]')
   ];
   els.forEach(el => {
     if (!el) return;
     const r = el.getBoundingClientRect();
     console.log(el.outerHTML.slice(0, 60), '→', { w: Math.round(r.width), h: Math.round(r.height), fails44: r.width < 44 || r.height < 44 });
   });
   ```
5. **Result:** all three elements return `fails44: true` (36 / 36 / 38 px).
6. Resize to 768 and to 375 (or 500 px if Chrome DevTools MCP clamps the resize). Re-run the snippet — identical fail results.
7. At 500 / 375 px, additionally measure the gap between the password input's right edge and the toggle's left edge:
   ```javascript
   const p = document.querySelector('input[type="password"]').getBoundingClientRect();
   const t = document.querySelector('button[aria-label*="password"]').getBoundingClientRect();
   console.log({ gap: t.left - p.right });
   ```
   **Result:** `~1 px` — below the 8 px adjacent-target threshold.

## Expected Behavior

All form inputs and adjacent action affordances should meet WCAG 2.5.5 (Level AAA) / 2.5.8 (Level AA, WCAG 2.2) minimum target size of **44 × 44 CSS pixels**, with at least **8 px spacing** between adjacent independent targets (per WCAG 2.5.5 Target Size note).

## Actual Behavior

- `VcInput size="md"` renders inputs at 36 px height — 18 % short of WCAG minimum.
- Embedded show/hide password toggle is 38 × 38 px.
- Adjacent password-input ↔ toggle gap on mobile is 1 px (i.e., they share a near-shared edge), making accurate selection error-prone.

## Impact

- **A11y conformance:** fails WCAG 2.5.8 Level AA on every form in the storefront that uses `VcInput size="md"` (i.e., almost all of them). Tax / accessibility audit risk.
- **Security-sensitive context:** the impersonate form is a re-authentication gate before assuming another user's session. Mis-taps that submit invalid credentials trigger the F-07 push-layout (see related findings) — a 23 px form jump per failed attempt — and degrade error recovery.
- **Mobile retry rate:** support staff operating on tablets/phones from a customer site will fat-finger the show/hide toggle while typing the password, due to the 1 px gap.

## Recommended Fix

1. Update the `VcInput size="md"` token from 36 px to **44 px** target height. This is a single-token fix that ripples through every form in the storefront. Validate downstream rendering on forms with tight vertical spacing (sign-in, sign-up, address forms) before shipping.
2. Increase the embedded show/hide toggle tap area to 44 × 44 px — keep the icon visually at its current size (likely 16 px) and add padding to the wrapping `<button>`.
3. Reserve at least **8 px spacing** between the password input's right edge and the toggle's left edge — even at the smallest supported viewport. Likely a margin-right on the input wrapper or a margin-left on the toggle.
4. Re-run the form-path audit (`/qa-design /account/impersonate/{userId}` with anonymous session) to confirm the fix passes BL-UI-006 at 375 / 768 / 1280.

## Evidence

- Audit report: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/report.md` (Finding F-09, Stop 2 — Form path)
- Measurements: `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/02-impersonate-page/form-path/measurements.json`
- FAIL screenshot (mobile, undersized targets + 1 px gap): `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/02-impersonate-page/form-path/form-empty-500-BL-UI-006-FAIL.png`
- Companion FAIL (error-state push-layout, separate finding F-07): `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/02-impersonate-page/form-path/form-error-1280-BL-UI-003-FAIL.png`

## Related

- [BUG-A11Y-undersized-touch-targets.md](BUG-A11Y-undersized-touch-targets.md) — broader mobile-only sweep of storefront touch targets at 375×812.
- [BUG-A11Y-touchtargets-company-members-and-logout.md](BUG-A11Y-touchtargets-company-members-and-logout.md) — companion finding F-03 from the same LoginOnBehalf audit; same shared-token defect on `/company/members` row actions and account-dropdown Logout.
- [VCST-4905](https://virtocommerce.atlassian.net/browse/VCST-4905) — LoginOnBehalf UX. IMP-001 documents the Form-path render contract; this bug is the design-quality follow-up.
- Finding F-07 (`tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/report.md`) — same form, push-layout error insertion. Not filed yet pending decision on whether to bundle.
- Finding F-08 (same report) — `VcAlert` danger variant off-grid padding (5.008 / 7.008 / 10 px). Cross-cutting; not filed yet.
