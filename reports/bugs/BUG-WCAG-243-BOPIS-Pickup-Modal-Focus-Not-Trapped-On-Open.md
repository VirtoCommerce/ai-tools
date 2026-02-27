# BUG: A11y — BOPIS Pickup Modal — Focus Not Moved Into Dialog On Open, Violating WCAG 2.4.3 Focus Order

**Bug ID:** BUG-WCAG-243-BOPIS-Pickup-Modal-Focus-Not-Trapped-On-Open
**Related Ticket:** VCST-4565
**Date Found:** 2026-02-27
**Found By:** ui-ux-expert agent (Chrome DevTools inspection)
**Severity:** High
**Priority:** P1
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, focus-management, wcag-2.4.3, bopis, modal, keyboard, screen-reader

---

## Summary

When the BOPIS "Pick points" modal opens, keyboard focus remains on `<body>` instead of being directed inside the dialog. This violates WCAG 2.1 SC 2.4.3 Focus Order and creates a significant barrier for keyboard-only and screen reader users who cannot efficiently navigate into or be aware of the opened dialog.

---

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com |
| Browser | Chrome (Chromium via Chrome DevTools MCP) |
| Viewport | 1920x1080 (Desktop) |
| Date | 2026-02-27 |
| Related Feature | VCST-4565 — Show selected pick point on Pick Point popup window open |
| Dialog Library | HeadlessUI Dialog (confirmed via `headlessui-dialog-title` CSS class in DOM) |

---

## Steps to Reproduce

1. Log in to the QA storefront (https://vcst-qa-storefront.govirto.com)
2. Add any item to cart
3. Navigate to Cart page
4. Switch delivery mode to "Pickup"
5. Click the pencil/edit icon next to the pickup point field to open the "Pick points" modal
6. Immediately after the modal opens, check keyboard focus position:
   - Press Tab once — note where focus lands
   - Or in DevTools console: `console.log(document.activeElement)`

---

## Expected Result

When the modal opens, focus is programmatically moved to a focusable element inside the dialog — either:
- The Close (X) button (first focusable element), OR
- The search input, OR
- The first location list item radio button

Per WCAG 2.4.3 and ARIA APG Dialog Pattern, focus must enter the modal when it opens so keyboard users and screen reader users are placed into the modal context without requiring excessive Tab presses.

---

## Actual Result

`document.activeElement` is `<body>` after the modal opens.

### Verified via JavaScript

```javascript
// Executed via evaluate_script while Pick points modal was open
document.activeElement.tagName  // returns: "BODY"
document.activeElement.id       // returns: ""
```

### Consequence for Keyboard Users

- User must press Tab many times starting from `<body>` to reach any element inside the modal
- Focus traversal order goes through potentially all elements in the page background before entering the modal
- No skip link or direct entry point is provided

### Consequence for Screen Reader Users

- Screen readers (NVDA, VoiceOver, JAWS) use the modal open event to announce the dialog
- Without focus entering the dialog, the screen reader does NOT announce "dialog" or "Pick points"
- A blind user pressing Tab will not know a modal has appeared
- The user may believe the page did nothing when they triggered the action

---

## Impact

| User Group | Impact |
|------------|--------|
| Keyboard-only users | Must Tab through many page elements before reaching modal content |
| Screen reader users (blind) | Modal opening is not announced; user unaware dialog appeared |
| Users with motor impairments | Extra keystrokes required to enter modal — exhausting with switch access |
| Low vision users using keyboard navigation | May miss the modal entirely if not watching screen |

---

## Modal ARIA Attributes (Verified as Correct)

The modal correctly has these ARIA attributes — only focus management is missing:

```html
<div role="dialog"
     aria-modal="true"
     aria-labelledby="headlessui-dialog-title-v-15-5">
  <h2 id="headlessui-dialog-title-v-15-5">Pick points</h2>
  ...
</div>
```

The dialog is properly marked up. The only missing piece is focus being moved into it on open.

---

## Suggested Fix

### Option 1: HeadlessUI `initialFocus` Prop (Recommended)

Since HeadlessUI Dialog is already in use, set the `initialFocus` prop to direct focus to the desired element:

```vue
<!-- In the component using HeadlessUI Dialog -->
<DialogRoot :initialFocus="closeButtonRef">
  ...
  <button ref="closeButtonRef">Close</button>
</DialogRoot>
```

HeadlessUI Dialog handles focus management automatically when `initialFocus` is configured correctly. If the default HeadlessUI focus behavior is not working, verify the Dialog component version and that the dialog panel is a direct child.

### Option 2: Manual Focus on Mount

```javascript
// In Vue component — onMounted or watch for dialog open state
import { nextTick } from 'vue';

watch(isOpen, async (open) => {
  if (open) {
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]');
    const closeBtn = dialog?.querySelector('button[aria-label*="close"], button[aria-label*="Close"]');
    if (closeBtn) closeBtn.focus();
  }
});
```

### Option 3: Focus Selected Item on Reopen (Feature-Specific Enhancement)

For the VCST-4565 use case (reopening modal with an existing selection), ideally focus the selected radio button to orient the user to their current selection:

```javascript
const selectedRadio = dialog.querySelector('input[type="radio"]:checked');
if (selectedRadio) {
  selectedRadio.focus();
  // Also ensure parent li is visible (auto-scroll is already working for this)
}
```

---

## WCAG Reference

- **Criterion:** 2.4.3 Focus Order (Level AA)
  - "If a Web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operation."
  - Source: https://www.w3.org/TR/WCAG21/#focus-order

- **Additional reference:** ARIA APG Dialog (Modal) Pattern
  - "When a dialog opens, focus moves to an element inside the dialog."
  - Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

---

## Evidence

- **Report:** `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/test-execution-report.md`
- **Screenshots:**
  - `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/screenshots/desktop/01-modal-open-with-selection-desktop.png`
  - `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/screenshots/desktop/03-selected-item-scrolled-into-view-desktop.png`

---

## Additional Notes

The `aria-modal="true"` attribute is correctly present, and the dialog is properly labeled. Focus management is the sole missing piece. This issue is likely a HeadlessUI configuration issue where `initialFocus` is not set, causing HeadlessUI to fall back to its default behavior (which may not work as expected with the dynamic list content).

Note: A proper keyboard focus trap test (verifying Tab does not escape the modal) was not completed and should be verified manually with a keyboard — only the initial focus-on-open behavior was confirmed to be failing.
