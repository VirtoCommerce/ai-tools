# BUG-UIUX-B: Impersonation confirmation modal — `aria-describedby` not wired to body text

## Status: CONFIRMED

## Severity: Medium (P2)
## Category: Accessibility (A11y)
## WCAG Criterion: **4.1.2 Name, Role, Value** (Level A) — dialog body is not programmatically associated with the dialog element
## Suite / Case Mapping: VCST-4906 a11y audit / UIUX-BUG-B

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/company/members → click Login on behalf → confirmation modal
- **Browser:** Chrome DevTools MCP (Chromium 1280×800 desktop)
- **Theme:** Coffee, vc-frontend `2.49.0-pr-2280-8069-80690ef2`
- **Auth:** `test-john.mitchell-20260310@test-agent.com` (SUPPORT_AGENT, CanImpersonate)
- **Date:** 2026-05-14

## Summary

The "Login on behalf" confirmation modal (`VcModal` / `VcDialog` component backed by HeadlessUI) renders with `role="dialog"` and `aria-labelledby` pointing at the title element, but `aria-describedby` is null. The modal body paragraph — which describes the action and its consequences — has an `id` attribute assigned by HeadlessUI (e.g. `id="dialog-NNN"`) but this id is not referenced from the dialog element's `aria-describedby`.

As a result, when a screen reader focuses the dialog, the assistive technology announces the dialog role and title but does NOT read the body description. The user cannot determine the consequence of confirming the impersonation without manually navigating the modal content.

## Reproduction Results

```javascript
// With the impersonation confirmation modal open:
const dialog = document.querySelector('[role="dialog"]');
const bodyEl = document.querySelector('[id^="dialog-"]');

console.log({
  dialogAriaDescribedBy: dialog?.getAttribute('aria-describedby'),   // → null
  bodyElId: bodyEl?.id,                                               // → "dialog-NNN" (some number)
  bodyElText: bodyEl?.textContent.trim().slice(0, 80)                 // → "You are about to log in as..."
});
```

**Result:**
- `aria-describedby: null` — not wired
- `bodyElId: "dialog-510"` (example from audit session) — id exists but is unused
- Body text present and visible, but not programmatically linked

### Expected vs Actual

| Attribute on `[role="dialog"]` | Expected | Actual |
|-------------------------------|----------|--------|
| `aria-labelledby` | points at dialog title | present (PASS) |
| `aria-describedby` | points at body paragraph id | `null` (FAIL) |

## Steps to Reproduce

1. Sign in as `test-john.mitchell-20260310@test-agent.com`.
2. Navigate to `/company/members`.
3. Open the row actions for any member → click **Login on behalf**.
4. Confirm the confirmation modal appears with title and body text.
5. In DevTools, run the snippet above.
6. **Result:** `aria-describedby: null` despite the body element having an id.

## Impact

Screen reader users (VoiceOver, NVDA, JAWS) receive only the dialog title when the modal receives focus — they do not hear the explanatory body text. For a security-sensitive action (impersonating another user's session), failing to announce the consequence text is a significant UX and accessibility defect. This is a Level A WCAG failure that prevents AA conformance.

## Recommended Fix

In `VcModal` / `VcDialog` component, wire the `aria-describedby` attribute on the `[role="dialog"]` element to the id of the body content element:

```html
<div role="dialog" aria-labelledby="dialog-title-NNN" aria-describedby="dialog-body-NNN">
  <h2 id="dialog-title-NNN">{{ title }}</h2>
  <div id="dialog-body-NNN">{{ description }}</div>
  ...
</div>
```

HeadlessUI's `DialogDescription` component does this automatically when used. If the current implementation uses a custom slot, ensure the slot's wrapper element gets a stable id that is passed to `aria-describedby`.

## Evidence

- Screenshot (modal open, OK focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-C-modal-ok-focused.png`
- Screenshot (modal open, Close focused): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-C-modal-close-focused.png`
- Audit report: `tests/Sprint-current/VCST-4906/uiux-report.md` (UIUX-BUG-B)

## Related

- [BUG-UIUX-CE-modal-focus-outline-contrast-VCST-4906.md](BUG-UIUX-CE-modal-focus-outline-contrast-VCST-4906.md) — companion finding on the same modal: all three buttons fail WCAG 1.4.11 focus indicator contrast.
- VCST-4906 — A11y audit. UIUX-BUG-B.
