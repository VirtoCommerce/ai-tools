# BUG-UIUX-A: Members table row-action trigger — missing accessible name, no tabindex, no ARIA menu roles

## Status: CONFIRMED

## Severity: High (P1)
## Category: Accessibility (A11y)
## WCAG Criteria:
- **4.1.2 Name, Role, Value** (Level A) — custom `DIV[role="button"]` has no accessible name and no `tabindex`
- **2.1.1 Keyboard** (Level A) — no `tabindex` on `role="button"` means keyboard users cannot reach it
- **2.5.8 Target Size Minimum** (Level AA, WCAG 2.2) — 20×20 px is less than 24×24 px minimum and far below the 44×44 target
## Suite / Case Mapping: VCST-4906 a11y audit / UIUX-BUG-A

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/company/members
- **Browser:** Chrome DevTools MCP (Chromium 1280×800 desktop)
- **Viewports tested:** 1280 (desktop), 500 (mobile — earlier session, 20×21 px)
- **Theme:** Coffee, vc-frontend `2.49.0-pr-2280-8069-80690ef2`
- **Build footer confirms:** `Ver. 2.49.0-pr-2280-8069-80690ef2. © 2026 Virto Commerce`
- **Auth:** `test-john.mitchell-20260310@test-agent.com` impersonating `test-david.kim-20260310@test-agent.com`
- **Date:** 2026-05-14

## Summary

The per-row action trigger on `/company/members` — the three-dot icon button that opens the member action menu (including **Login on behalf**) — is a `DIV[role="button"]` with three critical accessibility failures:

1. **No `tabindex` attribute** — keyboard users cannot tab to it at all (violates WCAG 2.1.1)
2. **No accessible name** — `aria-label` is null, inner text is empty, no `title` (violates WCAG 4.1.2)
3. **20×20 px hit area** — 54% smaller than the 44×44 px minimum target size (violates WCAG 2.5.8 AA)
4. **The popup has `aria-haspopup="dialog"` but opens a list menu** — semantic mismatch; the popup container has no `role="menu"` and items have no `role="menuitem"`

The impersonation entry point (**Login on behalf**) is behind this trigger. Any keyboard-only user or screen reader user — including support staff using a keyboard — cannot reach this control.

## Reproduction Results

### Desktop 1280×800 — all 10 row triggers

```javascript
const triggers = Array.from(document.querySelectorAll('main [role="button"][aria-haspopup="dialog"]'));
triggers.map((t, i) => ({
  index: i,
  tabindex: t.getAttribute('tabindex'),         // null for all 10
  ariaLabel: t.getAttribute('aria-label'),       // null for all 10
  rect: { w: Math.round(t.getBoundingClientRect().width),
          h: Math.round(t.getBoundingClientRect().height) }
}));
```

**Result (all 10 rows):**
- `tabindex: null` — not keyboard-reachable
- `ariaLabel: null` — no accessible name
- `rect: { w: 20, h: 20 }` or `{ w: 20, h: 21 }` — all below 44×44 and below 24×24 WCAG 2.2 minimum

### First trigger HTML snippet

```html
<div class="vc-popover__trigger" role="button" aria-haspopup="dialog" aria-expanded="false">
  <img src="data:image/svg+xml,..." />   <!-- three-dot icon, no alt text -->
</div>
```

### Expected vs Actual

| Attribute | Expected | Actual |
|-----------|----------|--------|
| `tabindex` | `"0"` | `null` |
| `aria-label` | `"Actions for [Member Name]"` | `null` |
| `role` on popup container | `"menu"` | none |
| items in popup | `role="menuitem"` | no role |
| Touch target | ≥ 44×44 px | 20×20 px |

## Steps to Reproduce

1. Sign in as `test-john.mitchell-20260310@test-agent.com` (SUPPORT_AGENT role with CanImpersonate permission).
2. Navigate to `/company/members`.
3. In DevTools, run:
   ```javascript
   const triggers = Array.from(document.querySelectorAll('main [role="button"][aria-haspopup="dialog"]'));
   triggers.forEach((t, i) => {
     const r = t.getBoundingClientRect();
     console.log(i, {
       tabindex: t.getAttribute('tabindex'),
       ariaLabel: t.getAttribute('aria-label'),
       w: Math.round(r.width), h: Math.round(r.height)
     });
   });
   ```
4. **Result:** All 10 row triggers return `tabindex: null`, `ariaLabel: null`, `w: 20, h: 20`.
5. Press Tab repeatedly — no row action trigger receives keyboard focus.

## Impact

- **Support staff using keyboard** cannot access Login on behalf (the impersonation entry point for VCST-4905 flows). The entire member management action menu is inaccessible via keyboard.
- **Screen reader users** receive no name for the control — they cannot know what it does.
- **WCAG 2.2 conformance:** SC 4.1.2 (Level A) and SC 2.1.1 (Level A) failures block Level AA conformance entirely.

## Recommended Fix

1. Replace `DIV[role="button"]` with a native `<button>` element — removes the tabindex omission automatically.
2. Add `aria-label="Actions for {{ member.name }}"` (dynamic per-row member name).
3. Change `aria-haspopup` from `"dialog"` to `"menu"` on the trigger.
4. Add `role="menu"` to the popup container.
5. Add `role="menuitem"` to each action item inside the popup.
6. Increase the hit area to ≥ 44×44 px via padding on the button wrapper.
7. Alternatively, if the icon remains visually 20 px, ensure the surrounding transparent clickable area extends to 44×44 px.

## Evidence

- Screenshot (desktop 1280, row trigger visible): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-A-row-trigger-20x20-desktop.png`
- Screenshot (members table overview): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-A-members-table-1280-desktop.png`
- Screenshot (dropdown open, login-on-behalf visible): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-A-dropdown-open-verify.png`
- Screenshot (Login on behalf item focused, no outline): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-A-login-on-behalf-focused-no-outline.png`

## Related

- VCST-4906 — A11y audit report: `tests/Sprint-current/VCST-4906/uiux-report.md` (UIUX-BUG-A)
- [BUG-A11Y-touchtargets-company-members-and-logout.md](BUG-A11Y-touchtargets-company-members-and-logout.md) — companion report covering the 32×32 px desktop touch-target failure (the "Actions" icon button surface exposed to authenticated non-keyboard users). This report covers the deeper keyboard / ARIA name / ARIA menu-role failures.
- VCST-4905 — LoginOnBehalf UX. This bug blocks keyboard access to the impersonation entry point.
