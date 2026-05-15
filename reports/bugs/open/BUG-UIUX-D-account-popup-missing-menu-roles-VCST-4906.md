# BUG-UIUX-D: Account popup — `aria-haspopup="menu"` on trigger but popup has no `role="menu"` and items have no `role="menuitem"`

## Status: CONFIRMED

## Severity: Medium (P2)
## Category: Accessibility (A11y)
## WCAG Criterion: **4.1.2 Name, Role, Value** (Level A) — custom dropdown container and items do not expose the correct ARIA roles to match the trigger's `aria-haspopup="menu"` contract
## Suite / Case Mapping: VCST-4906 a11y audit / UIUX-BUG-D

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/ (header account button, any page when authenticated)
- **Browser:** Chrome DevTools MCP (Chromium 1280×800 desktop)
- **Theme:** Coffee, vc-frontend `2.49.0-pr-2280-8069-80690ef2`
- **Auth:** `test-john.mitchell-20260310@test-agent.com` impersonating `test-david.kim-20260310@test-agent.com`
- **Date:** 2026-05-14

## Summary

The account dropdown trigger in the header (`data-test-id="account-button"`, `aria-label="Account menu"`) declares `aria-haspopup="menu"`. However, the popup it opens (`data-test-id="account-menu"`) is a plain `<div>` with no ARIA role at all. None of the interactive items within the popup — the dashboard profile link, the "Back to John Mitchell" / Stop Impersonation button, or the Logout button — carry `role="menuitem"`.

This is a broken ARIA contract: the trigger promises a menu (`aria-haspopup="menu"`) but delivers an unmarked container. Screen readers that pre-announce "has popup menu" or switch to menu-navigation mode when entering the popup will receive no confirming structure.

## Reproduction Results

```javascript
// With the account popup open (click "David Kim" in header):
const trigger = document.querySelector('[data-test-id="account-button"]');
const menu = document.querySelector('[data-test-id="account-menu"]');
const backBtn = document.querySelector('[data-test-id="back-to-operator-row"]');
const signOutBtn = document.querySelector('[data-test-id="sign-out-button"]');
const dashLink = document.querySelector('[data-test-id="dashboard-link"]');

console.log({
  triggerHaspopup: trigger?.getAttribute('aria-haspopup'),   // "menu" (claims menu)
  menuRole: menu?.getAttribute('role'),                       // null (no role)
  backBtnRole: backBtn?.getAttribute('role'),                 // null
  signOutRole: signOutBtn?.getAttribute('role'),              // null
  dashLinkRole: dashLink?.getAttribute('role')                // null
});
```

**Result:**
- Trigger: `aria-haspopup="menu"` (WCAG expects popup to have `role="menu"`)
- Popup container `[data-test-id="account-menu"]`: `role=null` — **FAIL**
- All three interactive items: `role=null` — **FAIL**

### Popup container HTML (abbreviated)

```html
<div class="absolute right-0 top-full z-10 flex w-64 flex-col ..."
     data-test-id="account-menu">
  <div class="flex max-w-full items-center justify-between p-3">
    <a href="/account/dashboard" data-test-id="dashboard-link">David Kim</a>
    <button aria-label="Logout" data-test-id="sign-out-button">...</button>
  </div>
  <button data-test-id="back-to-operator-row">Back to John Mitchell</button>
</div>
```

No `role="menu"` on the container, no `role="menuitem"` on items.

### Expected vs Actual

| Element | Expected | Actual |
|---------|----------|--------|
| `[data-test-id="account-menu"]` container | `role="menu"` | no role |
| `[data-test-id="dashboard-link"]` | `role="menuitem"` | no role |
| `[data-test-id="back-to-operator-row"]` | `role="menuitem"` | no role |
| `[data-test-id="sign-out-button"]` | `role="menuitem"` | no role |

## Steps to Reproduce

1. Sign in as any authenticated user (impersonation session is not required).
2. Click the account button in the top header (shows username, e.g. "David Kim").
3. Confirm the dropdown opens showing Profile link, Back-to-operator (if impersonating), and Logout button.
4. In DevTools run the snippet above.
5. **Result:** `menuRole: null`, all item roles `null`.

## Impact

- Screen readers (NVDA + Chrome, VoiceOver + Safari, JAWS) announce the trigger as "Account menu, has popup menu" — users expect to enter a menu widget with keyboard arrow-key navigation. When they enter the popup, no menu structure is present, breaking the keyboard interaction model.
- The Back-to-operator and Logout buttons are the primary stop-impersonation / sign-out paths. Impersonation sessions left open due to inaccessible exit controls create a security exposure.
- WCAG 4.1.2 Level A failure — blocks AA conformance.

## Recommended Fix

1. Add `role="menu"` to `[data-test-id="account-menu"]` container.
2. Add `role="menuitem"` to each interactive item: dashboard link, Back to John Mitchell button, Logout button.
3. Ensure keyboard navigation inside the popup uses arrow keys (standard menu keyboard pattern — `roving tabindex` or `aria-activedescendant`).
4. Alternatively, if arrow-key navigation is not implemented, change `aria-haspopup` on the trigger from `"menu"` to `"dialog"` to match what is actually rendered — but this is a less accessible solution.

## Evidence

- Screenshot (account popup open): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-DEF-account-popup-open.png`
- Screenshot (desktop 1280 impersonated session, header showing operator chip): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-DEF-desktop-1280-home-impersonated.png`
- Audit report: `tests/Sprint-current/VCST-4906/uiux-report.md` (UIUX-BUG-D)

## Related

- [BUG-UIUX-CE-modal-focus-outline-contrast-VCST-4906.md](BUG-UIUX-CE-modal-focus-outline-contrast-VCST-4906.md) — focus outline contrast failures on Back to John Mitchell and Logout buttons inside this same popup.
- [BUG-A11Y-touchtargets-company-members-and-logout.md](BUG-A11Y-touchtargets-company-members-and-logout.md) — touch target size failure for the Logout icon button (32×32 px) in this same popup.
- VCST-4906 — A11y audit. UIUX-BUG-D.
