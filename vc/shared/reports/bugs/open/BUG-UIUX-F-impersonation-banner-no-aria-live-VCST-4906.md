# BUG-UIUX-F: Impersonation operator-identity chip — no `aria-live` / `role="status"`, screen readers not notified of session change

## Status: CONFIRMED

## Severity: Medium (P2)
## Category: Accessibility (A11y)
## WCAG Criteria:
- **4.1.3 Status Messages** (Level AA) — programmatically determinable status is not exposed without requiring focus
- **1.3.1 Info and Relationships** (Level A) — impersonation state conveyed only visually (plain `<span>` elements)
## Suite / Case Mapping: VCST-4906 a11y audit / UIUX-BUG-F

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/ (top header bar, any page in an impersonation session)
- **Browser:** Chrome DevTools MCP (Chromium 1280×800 desktop)
- **Theme:** Coffee, vc-frontend `2.49.0-pr-2280-8069-80690ef2`
- **Auth:** `test-john.mitchell-20260310@test-agent.com` impersonating `test-david.kim-20260310@test-agent.com`
- **Date:** 2026-05-14

## Summary

When a support agent starts an impersonation session (by clicking Login on behalf and confirming the modal), the storefront renders an operator identity chip in the top header bar: **"John Mitchell logged in as [Account menu / David Kim]"**. This chip is rendered as two plain `<SPAN>` elements inside an unsemantic `DIV` — no `role="status"`, no `aria-live`, no `aria-atomic`.

The only `aria-live` region in the entire page is an invisible empty `<SECTION>` (0×0 px), unrelated to the impersonation state.

As a result:
- A screen reader user who is already on the page when impersonation activates receives **no announcement** of the session change.
- The impersonation state is conveyed **only visually** through the chip text — a blind user must navigate to the header region and happen to read the chip to discover they are in an impersonated session.

For a security-sensitive session state (one user operating as another), failure to announce the change programmatically is a significant accessibility and security-UX risk.

## Reproduction Results

```javascript
// In an active impersonation session (JWT sub = target user, vc_operator_user_id = operator):
const operatorLabel = document.querySelector('[data-test-id="operator-name-label"]');

// Walk up to find aria-live on any ancestor
let el = operatorLabel;
const ariaLiveChain = [];
while (el) {
  ariaLiveChain.push({
    tag: el.tagName,
    role: el.getAttribute('role'),
    ariaLive: el.getAttribute('aria-live'),
    testId: el.getAttribute('data-test-id')
  });
  el = el.parentElement;
}

// Check for any aria-live region on the page
const allAriaLive = Array.from(document.querySelectorAll('[aria-live]')).map(el => ({
  tag: el.tagName,
  ariaLive: el.getAttribute('aria-live'),
  visible: el.getBoundingClientRect().width > 0,
  text: el.textContent.trim().slice(0, 40)
}));

console.log({ ariaLiveChain, allAriaLive });
```

**Result:**

`ariaLiveChain`:
```
SPAN (operator-name-label): ariaLive=null
DIV (parent): ariaLive=null
DIV (grandparent): ariaLive=null
HEADER (data-test-id="top-header"): ariaLive=null
```

`allAriaLive`: One `SECTION` with `aria-live="polite"` — but it is **invisible (0×0 px)** and contains no impersonation content.

### Chip DOM structure

```html
<header data-test-id="top-header" role="null" aria-live="null">
  ...
  <div class="relative flex flex-row items-center gap-x-1">
    <span class="whitespace-nowrap font-bold" data-test-id="operator-name-label">John Mitchell</span>
    <span class="whitespace-nowrap text-neutral-400">logged in as</span>
    <button aria-label="Account menu" aria-haspopup="true" data-test-id="account-button">
      David Kim
    </button>
  </div>
</header>
```

No `role="status"`, no `aria-live` anywhere in the chain.

## Steps to Reproduce

1. Sign in as `test-john.mitchell-20260310@test-agent.com`.
2. Navigate to `/company/members`.
3. Click Login on behalf for David Kim → confirm the modal.
4. Observe the header now shows "John Mitchell logged in as David Kim".
5. Run the snippet above.
6. **Result:** `ariaLive=null` throughout the entire ancestor chain. No live region announces the session change.

## Impact

- **Screen reader users** (support staff who are blind or low-vision) will not know their session has changed to an impersonated one unless they proactively navigate to the header. This is a security concern: the user may unknowingly take actions as the target customer without being aware of the session state.
- **WCAG 4.1.3 (Level AA):** status messages that do not require focus are required to be programmatically determinable — this is not.
- **WCAG 1.3.1 (Level A):** information conveyed through visual presentation alone without a semantic structure equivalent.

## Recommended Fix

1. Wrap the operator identity chip in a `<div role="status" aria-live="polite" aria-atomic="true">`:
   ```html
   <div role="status" aria-live="polite" aria-atomic="true"
        data-test-id="operator-identity-chip">
     <span data-test-id="operator-name-label">John Mitchell</span>
     <span>logged in as</span>
     <!-- account button -->
   </div>
   ```
2. When impersonation ends (Stop Impersonation clicked), clear or update the same live region so screen readers are notified the session has reverted.
3. On initial page load in an impersonation session, populate the live region — `aria-live="polite"` will announce on the next speech queue cycle.
4. Keep `aria-atomic="true"` so the full "John Mitchell logged in as David Kim" phrase is announced as a unit, not word-by-word.

## Evidence

- Screenshot (operator chip visible in header, no banner announcement): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-F-operator-chip-no-aria-live.png`
- Screenshot (impersonated home page state): `tests/Sprint-current/VCST-4906/evidence/bug-verification-a11y/BUG-F-impersonated-home-state.png`
- JWT confirmed active impersonation at time of audit: `sub=ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b` (David Kim), `vc_operator_user_id=143bc845-7ba3-4982-ae9a-a9446a399705` (John Mitchell)
- Audit report: `tests/Sprint-current/VCST-4906/uiux-report.md` (UIUX-BUG-F)

## Related

- [BUG-UIUX-D-account-popup-missing-menu-roles-VCST-4906.md](BUG-UIUX-D-account-popup-missing-menu-roles-VCST-4906.md) — the account popup that contains the "Back to John Mitchell" (Stop Impersonation) control also lacks ARIA roles.
- VCST-4905 — LoginOnBehalf UX. Impersonation banner persistence and stop-impersonation flow.
- VCST-4906 — A11y audit. UIUX-BUG-F.
