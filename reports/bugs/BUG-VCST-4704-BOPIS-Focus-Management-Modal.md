# BUG REPORT: VCST-4704
## [BOPIS][A11y] WCAG 2.4.3 — Focus Management Failures in Pickup Location Modal

---

**Summary:** BOPIS pickup location modal has three focus management violations: initial focus lands on wrong element (skips Close button), focus returns to wrong element on close (unrelated checkbox instead of trigger), and reopen focus jumps erratically to a phone link deep in dialog content.

**Date Reported:** 2026-02-27
**Severity:** High
**Priority:** P1
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, focus-management, bopis, modal, keyboard
**Component:** BOPIS Pickup Location Modal (cart page)
**WCAG Criterion:** 2.4.3 Focus Order (Level AA)
**Related:** WCAG 4.1.2 Name, Role, Value (trigger button has no accessible name — co-located issue)

---

## Environment

| Field | Value |
|-------|-------|
| **URL** | https://vcst-qa-storefront.govirto.com/cart |
| **Browser** | Chrome (Chromium) |
| **Viewport** | 1920x1080 |
| **Storefront Version** | 2.43.0-pr-2188-c129-c1290c2d |
| **Date** | 2026-02-27 |
| **User** | mutykovaelena@gmail.com |

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com and sign in
2. Navigate to the Cart page (`/cart`)
3. Ensure the "Pickup" delivery option is selected in the Shipping Details section
4. Note the displayed pickup address and the unnamed edit button beside it
5. **Do not use the mouse** — use keyboard only from this point
6. Tab to the edit/pencil button beside the pickup address and press Enter (or click it with the mouse)
7. Observe where focus lands when the "Pick points" dialog opens
8. Press Tab five times and observe focus on the Close button
9. Press Escape to close the dialog
10. Observe where focus returns after the dialog closes
11. Tab back to the edit button and activate it again (reopen)
12. Observe where focus lands on the second open (when a location is already selected)

---

## Expected Behavior (per WCAG 2.4.3 and ARIA Authoring Practices Guide)

**On modal open (Step 7):**
Focus must move to the first focusable element within the dialog in DOM order. The first focusable element by DOM order is the "Close" button (`class="vc-dialog-header__close"`). Alternatively, focus may move to the dialog container itself if it has `tabindex="-1"`, enabling a screen reader to announce the dialog name before any interactive element.

**On modal close via Escape (Step 9-10):**
Focus must return to the **element that triggered the dialog** — the edit/pencil button (`class="vc-address-selection__button"`) adjacent to the pickup address.

**On modal reopen (Step 11-12):**
Focus must again move to the first focusable element within the dialog (Close button) or the dialog container. It must not jump to arbitrary content mid-dialog.

---

## Actual Behavior

### Failure 1 — Wrong Initial Focus (First Open)

`document.activeElement` immediately after the dialog opens:
```json
{
  "tag": "BUTTON",
  "text": "Country",
  "className": "vc-button ... facet-filter-dropdown__trigger",
  "role": "button",
  "isInsideDialog": true,
  "tabIndex": 0
}
```

Focus lands on the **"Country" filter dropdown button** (the second focusable element by DOM order, index 1), skipping the **"Close" button** (the first focusable element by DOM order, index 0).

**Focus event log on open:**
```
1. [t=+0ms]    BUTTON.vc-address-selection__button  (trigger click — outside dialog)
2. [t=+199ms]  BUTTON "Country"                     (inside dialog — WRONG target)
```

### Failure 2 — Focus Returns to Wrong Element on Close

After pressing Escape, `document.activeElement`:
```json
{
  "tag": "INPUT",
  "ariaLabel": "Toggle vendor select",
  "className": "vc-checkbox__input",
  "isBody": false,
  "isInsideDialog": false
}
```

Focus moves to an unrelated **"Toggle vendor select" checkbox** in the cart items table header — completely unrelated to the pickup location section. The trigger button that opened the modal does NOT receive focus.

### Failure 3 — Erratic Focus on Reopen

On second open (location pre-selected, map rendered), `document.activeElement` ends at:
```json
{
  "tag": "A",
  "text": "+10000000082",
  "href": "tel:+10000000082",
  "isInsideDialog": true
}
```

Focus lands on a **phone number link** (`tel:+10000000082`) inside the location detail panel — this is focusable element **index 176 out of 180** in the fully-rendered dialog. The focus sequence shows an intermediate stop on "Country" (HeadlessUI's `initialFocus` target) followed by a second programmatic `focus()` call from the location detail panel's async rendering, which overwrites the intended focus placement.

**Focus event log on reopen:**
```
1. [t=+0ms]    BUTTON.vc-address-selection__button  (trigger click)
2. [t=+701ms]  BUTTON "Country"                     (HeadlessUI initialFocus)
3. [t=+1323ms] A "+10000000082"                     (async panel mount — OVERWRITES focus)
```

---

## Dialog ARIA Structure (Verified)

```html
<div
  id="headlessui-dialog-v-15-1"
  role="dialog"
  aria-modal="true"
  aria-labelledby="headlessui-dialog-title-v-15-5"
  data-headlessui-state="open"
  data-test-id="pickup-locations-modal"
  class="vc-modal vc-modal--mobile-fullscreen select-address-map-modal"
>
```

| Attribute | Status |
|-----------|--------|
| `role="dialog"` | PRESENT |
| `aria-modal="true"` | PRESENT |
| `aria-labelledby` → "Pick points" | PRESENT |
| `aria-describedby` | MISSING (minor gap) |
| HeadlessUI focus sentinels | ABSENT — 0 found |
| `tabindex` on dialog container | ABSENT |

**Tab trap:** PASS — Tab and Shift+Tab cycle within dialog correctly. Escape closes dialog. Focus trap mechanism works; only initial placement and return-focus are broken.

**Additional issue on trigger button:**
```json
{ "ariaLabel": null, "ariaHasPopup": null, "text": "" }
```
The trigger button has no accessible name and no `aria-haspopup="dialog"`. Screen readers announce it as "button" with no context. (Recommend filing as WCAG 4.1.2 violation or add to this ticket scope.)

---

## Root Cause Analysis

**F1 & F3 — Wrong initial focus:** HeadlessUI `Dialog` component is configured with an `initialFocus` ref pointing to the "Country" dropdown trigger rather than the Close button (or no override, which would default to the first focusable element). On reopen, the asynchronous map/location-detail panel rendering calls `focus()` on the phone link during its mount lifecycle, overwriting HeadlessUI's initial focus placement 622ms after the dialog opens.

**F2 — Wrong return focus:** HeadlessUI's `Dialog` component stores a reference to `document.activeElement` at mount time to restore focus on close. The trigger button (`vc-address-selection__button`) is not the active element when the dialog mounts — likely because the click event propagation or a Vue `nextTick` delay causes the stored reference to resolve to the next keyboard-focusable element in the DOM (the "Toggle vendor select" checkbox), not the intended trigger.

---

## Recommended Fixes

**Fix 1 — `initialFocus` prop (addresses F1):**
```vue
<!-- Remove the custom initialFocus pointing to Country filter.
     HeadlessUI will default to the first focusable element (Close button). -->
<Dialog :open="isOpen" @close="close">
```
Or explicitly set it to the Close button ref:
```vue
<Dialog :open="isOpen" :initial-focus="closeButtonRef" @close="close">
```

**Fix 2 — Return focus on close (addresses F2):**
```javascript
const triggerRef = ref(null);

function openModal(event) {
  triggerRef.value = event.currentTarget; // store trigger before opening
  isOpen.value = true;
}

function closeModal() {
  isOpen.value = false;
  nextTick(() => {
    if (triggerRef.value) triggerRef.value.focus();
  });
}
```

**Fix 3 — Prevent async focus theft (addresses F3):**
The location detail panel must not call `.focus()` during its mount lifecycle. If the panel needs to be focusable for scroll purposes, use `tabindex="-1"` on its container without calling `.focus()` programmatically after mount.

**Fix 4 — Trigger button accessible name:**
```html
<button
  class="vc-address-selection__button"
  aria-label="Change pickup location"
  aria-haspopup="dialog"
>
  <svg aria-hidden="true">...</svg>
</button>
```

---

## Evidence

**Evidence path:** `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/a11y-focus-bug/`

| Screenshot | Description |
|------------|-------------|
| `04-modal-open-initial.png` | Modal open — focus visually on "Country" filter (not Close button) |
| `05-modal-focus-close-button.png` | Tab×5 reaches Close button correctly |
| `06-after-escape-focus-wrong-element.png` | Post-Escape focus on unrelated "Toggle vendor select" checkbox |
| `07-modal-reopen-focus-phone-link.png` | Reopen — focus on `tel:+10000000082` link (element 176 of 180) |
| `07b-modal-reopen-fullpage.png` | Full reopen state with map and location detail panel visible |

**Detailed reproduction report:** `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/a11y-focus-bug/BUG-VCST-4704-focus-management-reproduction-report.md`

---

## Impact on Users

| User Group | Impact |
|------------|--------|
| Screen reader users (blind) | Cannot reliably navigate to/from the pickup location modal. After closing, they are disoriented on the page. On reopen, they land at a phone link and must Tab backward 176 times to reach the first control. |
| Keyboard-only users (motor impairment) | After closing modal, must re-navigate the page to return to the shipping section. Reopen drops them at the end of dialog content. |
| Low-vision users using screen magnification | Focus indicators may be off-screen when focus lands on the wrong element; they cannot see what happened. |
| Mouse users | Not affected — mouse users can click directly without relying on focus management. |

---

*Bug report generated by ui-ux-expert agent | 2026-02-27*
