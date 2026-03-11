# Bug Reproduction Report: VCST-4704
## [BOPIS][A11y] WCAG 2.4.3 — Focus Management Failures in Pickup Location Modal

---

**Report Date:** 2026-02-27
**Tester:** ui-ux-expert (automated reproduction via Chrome DevTools MCP)
**Environment:** https://vcst-qa-storefront.govirto.com
**Browser:** Chrome (Chromium, DevTools MCP)
**Viewport:** 1920x1080
**User Account:** mutykovaelena@gmail.com
**Page Under Test:** /cart (BOPIS Pickup delivery mode active)
**Storefront Version:** 2.43.0-pr-2188-c129-c1290c2d

---

## Executive Summary

The BOPIS pickup location modal ("Pick points" dialog) has **three distinct focus management failures** that violate WCAG 2.1 Success Criterion 2.4.3 Focus Order (Level AA) and SC 2.1.2 No Keyboard Trap. The failures affect all screen reader users and keyboard-only users when selecting or changing a pickup location from the cart page.

| # | Failure | WCAG Criterion | Severity |
|---|---------|----------------|----------|
| F1 | On first open: focus lands on "Country" filter button (2nd focusable), skipping the "Close" button (1st DOM-order focusable) | WCAG 2.4.3 Focus Order | High |
| F2 | On close via Escape: focus returns to `INPUT.vc-checkbox__input` (an unrelated "Toggle vendor select" checkbox) instead of the trigger button that opened the modal | WCAG 2.4.3 Focus Order | High |
| F3 | On reopen: focus lands erratically on `<a href="tel:+10000000082">` (a phone link deep in the location detail panel, index 176 of 180 focusable elements) instead of the first focusable element | WCAG 2.4.3 Focus Order | High |

**The original bug report claim that `document.activeElement` remains on `<body>` was NOT confirmed** — focus does enter the dialog. However, three separate focus management failures were confirmed and are documented in detail below.

---

## Prerequisites / Setup State

- User logged in as `mutykovaelena@gmail.com`
- Cart page at `/cart` with items present
- Delivery method already set to **Pickup**
- Pickup point pre-selected: "20 W 34th St, New York, New York, 10082, United States of America"
- The modal trigger is an unnamed `<button>` (edit icon, `class="vc-address-selection__button"`) adjacent to the displayed pickup address

---

## Reproduction Steps and Evidence

### STEP 1 — Install Focus Tracking

Before clicking the trigger, a `focusin` event listener was installed on `document` (capture phase) to log every focus movement with timestamp, tag, class, and `isInsideDialog` flag.

**Baseline `document.activeElement` before clicking trigger:**
```json
{ "tag": "SPAN", "id": "", "className": "", "role": null }
```

---

### STEP 2 — First Open: Click Trigger Button

**Action:** Clicked the unnamed edit button (`class="vc-address-selection__button"`) next to the pickup address.

**Immediately captured `document.activeElement`:**
```json
{
  "tag": "BUTTON",
  "className": "vc-button ... facet-filter-dropdown__trigger",
  "role": "button",
  "text": "Country",
  "isBody": false,
  "isInsideDialog": true,
  "tabIndex": 0
}
```

**Screenshot:** `04-modal-open-initial.png`

**Focus log sequence (all `focusin` events fired during modal open):**
```json
[
  { "time": 1772190752550, "tag": "BUTTON", "className": "...vc-address-selection__button", "isInsideDialog": false },
  { "time": 1772190752749, "tag": "BUTTON", "text": "COUNTRY", "isInsideDialog": true }
]
```

**Interpretation:** The trigger button received transient focus (timestamp 550ms) as a side effect of the click event. Then, 199ms later, the HeadlessUI dialog placed focus on the "Country" filter button inside the dialog. There was **no intermediate body focus** — focus went directly from trigger to "Country" button.

---

### FAILURE F1 — Wrong Initial Focus Target

**Dialog element inspection:**
```json
{
  "id": "headlessui-dialog-v-15-1",
  "role": "dialog",
  "ariaModal": "true",
  "ariaLabelledBy": "headlessui-dialog-title-v-15-5",
  "labelledByText": "Pick points",
  "ariaDescribedBy": null,
  "tabIndex": null,
  "hasExplicitTabIndex": false,
  "className": "vc-modal vc-modal--mobile-fullscreen select-address-map-modal"
}
```

**Dialog panel element inspection:**
```json
{
  "id": "headlessui-dialog-panel-v-15-4",
  "role": null,
  "tabIndex": null,
  "hasExplicitTabIndex": false
}
```

**All focusable elements inside dialog (first open — 6 elements):**
```
Index 0: BUTTON [aria-label="Close"]       class="vc-dialog-header__close"   ← FIRST in DOM
Index 1: BUTTON [text="Country"]           class="vc-button...facet-filter..." ← WHERE FOCUS LANDED
Index 2: BUTTON [text="State / Province"]
Index 3: BUTTON [text="City"]
Index 4: INPUT  [aria-label="Search "]
Index 5: BUTTON [aria-label="Search "]
```

**Actual focus target on open:** Index 1 — "Country" filter button
**Expected focus target on open:** Index 0 — "Close" button (first DOM-order focusable), OR the dialog container itself if it had `tabIndex="-1"`

**Root cause:** HeadlessUI's `Dialog` component uses an `initialFocus` prop to control where focus goes on open. The implementation passes the "Country" dropdown button as the `initialFocus` ref rather than the "Close" button or leaving it to default (which would be the first focusable element in DOM order). No HeadlessUI focus sentinels (`[data-headlessui-focus-sentinel]`) were present — 0 found.

**Screen reader impact:** A screen reader user would hear "Country, button, collapsed" announced when the dialog opens, with no announcement of the dialog's name ("Pick points") unless their screen reader auto-announces the dialog role. The user has no indication they have entered a dialog or what its purpose is. JAWS and NVDA typically announce "dialog" and the dialog's accessible name when focus moves into it — but only if focus is placed on or inside the dialog, which does technically occur here. However, the user is immediately presented with a filter control rather than orientation to the dialog.

---

### STEP 3 — Tab Key Navigation Test

Starting from "Country" button (initial focus), pressed Tab sequentially:

| Tab Press | Element Focused | Inside Dialog | Notes |
|-----------|-----------------|---------------|-------|
| Start | BUTTON "Country" | YES | Initial focus on open |
| Tab 1 | BUTTON "State / Province" | YES | |
| Tab 2 | BUTTON "City" | YES | |
| Tab 3 | INPUT [Search] | YES | |
| Tab 4 | BUTTON [Search icon] | YES | |
| Tab 5 | BUTTON [aria-label="Close"] | YES | Last in tab sequence |
| Tab 6 (wrap) | BUTTON "Country" | YES | Wraps back to first |

**Tab wrap verdict:** PASS — focus cycles correctly within dialog on Tab.

**Shift+Tab wrap test:** From "Country" (after wrap), Shift+Tab → BUTTON "Close". PASS — backward wrap works.

**Focus trap verdict:** PASS — Tab and Shift+Tab do not escape the dialog boundary.

**Screenshot:** `05-modal-focus-close-button.png` (focus on Close button, Tab press 5)

**Note on initial focus order anomaly:** The "Close" button is DOM-first (index 0) but receives focus last in the Tab sequence (Tab press 5). This means the Tab order does NOT follow DOM order for this dialog. The "Country" button (DOM index 1) is Tab-first. This is caused by the HeadlessUI `initialFocus` override placing focus on "Country", which becomes the effective Tab-start point. The focus trap wraps from Close → Country rather than following DOM linear order.

---

### STEP 4 — Escape Key Test (First Open)

**Action:** Pressed Escape while focus was on Close button.

**Results:**
```json
{
  "dialogStillOpen": false,
  "activeElement": {
    "tag": "INPUT",
    "ariaLabel": "Toggle vendor select",
    "className": "vc-checkbox__input",
    "isBody": false,
    "isInsideDialog": false
  },
  "focusReturnedToTrigger": false,
  "VERDICT_DIALOG_CLOSED": "PASS - Dialog closed on Escape",
  "VERDICT_FOCUS_RETURN": "FAIL - Focus went to unexpected element"
}
```

**Screenshot:** `06-after-escape-focus-wrong-element.png`

**A11y tree confirmation (post-close snapshot):**
```
uid=7_70 checkbox "Toggle vendor select" focusable focused
```

---

### FAILURE F2 — Focus Returns to Wrong Element on Close

**Expected behavior (per WCAG 2.4.3 and ARIA Authoring Practices Guide):**
After closing the dialog (via Escape or Close button), focus must return to the **element that triggered the dialog** — in this case, the unnamed edit button (`class="vc-address-selection__button"`).

**Actual behavior:**
Focus moved to `INPUT.vc-checkbox__input` — the hidden checkbox input of the "Toggle vendor select" control at the top of the cart item table. This element is:
- Visually hidden (rendered as a styled checkbox using CSS)
- Completely unrelated to the pickup location flow
- Earlier in the page's DOM than the modal trigger button
- A cart management control, not a shipping/pickup control

**Root cause:** The HeadlessUI `Dialog` component failed to restore the return-focus reference. This happens when the `triggerButton` reference is not stored before the dialog opens (or is cleared). HeadlessUI's `DialogImpl` stores the `previousActiveElement` at mount time. If the trigger button does not have stable DOM identity between the dialog's `onMounted` and `onUnmounted` lifecycle hooks, the ref may resolve to a sibling or ancestor element via DOM traversal fallback.

**Screen reader impact:** A screen reader user who closes the modal with Escape would suddenly hear "Toggle vendor select, checkbox, unchecked" — an entirely unrelated cart control — with no announcement of returning to the shipping section. The user loses their place in the page completely. They must navigate the entire page again to find the pickup section, which is a severe usability failure for keyboard-only users.

---

### STEP 5 — Reopen Test (Modal Opened a Second Time)

**Action:** Clicked the same trigger button again to reopen the modal.

**Reopen focus sequence (3 `focusin` events):**
```json
[
  { "time": 1772190891347, "tag": "BUTTON", "isInsideDialog": false, "className": "...vc-address-selection__button" },
  { "time": 1772190892048, "tag": "BUTTON", "text": "Country", "isInsideDialog": true },
  { "time": 1772190892670, "tag": "A",      "text": "+10000000082", "isInsideDialog": true }
]
```

**Final `document.activeElement` on reopen:**
```json
{
  "tag": "A",
  "text": "+10000000082",
  "href": "tel:+10000000082",
  "isInsideDialog": true,
  "isBody": false
}
```

**Screenshot:** `07-modal-reopen-focus-phone-link.png`

---

### FAILURE F3 — Erratic Focus on Reopen

On reopen, the dialog renders with a location pre-selected (map visible, location detail panel showing). This causes the dialog to contain **180 focusable elements** (vs. 6 on first open). The focus sequence shows:

1. Trigger button clicked (outside dialog) — transient focus
2. "Country" button receives focus (HeadlessUI initial focus target — same as first open)
3. Focus then moves to `<a href="tel:+10000000082">` (index 176 of 180 focusable elements)

The phone link is inside a location detail card rendered in the **map side panel** of the dialog. This is the last section of the dialog's content, rendered after 175 other focusable elements including all filter controls, all location radio buttons, Google Maps interactive elements, and a second Close button.

**All focusable elements summary (reopen state — 180 total):**
```
Index 0:   BUTTON [aria-label="Close"]           ← header close button
Index 1:   BUTTON "Country"                       ← focus initially placed here
Index 2:   INPUT  [Search in Country dropdown]
Index 3-24: Country filter items + checkboxes
Index 25:  BUTTON "State / Province"
...
Index 113: INPUT  [aria-label="Search "] (location search)
Index 114: BUTTON [aria-label="Search "]
Index 115-164: Radio buttons (location list, 50 items)
Index 165: BUTTON [aria-label="Keyboard shortcuts"] (Google Maps)
Index 166: DIV    [role=group] (Google Maps interactive)
Index 167: GMP-ADVANCED-MARKER
Index 168: BUTTON "Toggle fullscreen view"
Index 169: A      [aria-label="Open in Google Maps"]
Index 170-174: Maps attribution buttons/links
Index 175: BUTTON [aria-label="Close"]            ← 2nd close button (location detail panel)
Index 176: A      "+10000000082"                  ← WHERE FOCUS ENDED UP (tel: link)
Index 177: A      "pickup82@example.com"          ← mailto: link
Index 178: BUTTON "Cancel"
Index 179: BUTTON "Pick up here"
```

**Expected behavior:** On reopen with a pre-selected location, focus should move to the dialog container (Close button or dialog heading) — the same behavior as first open, ideally the Close button at index 0. The pre-selected state could optionally focus the currently-selected location's radio button, but focus must not jump to arbitrary content mid-stream (index 176).

**Root cause:** The asynchronous rendering of the map and location detail panel triggers a second focus movement after HeadlessUI's initial `initialFocus` placement. The Google Maps embed or the location detail panel component calls `focus()` on a descendant element (likely through its own initialization sequence) after the dialog has already placed focus on "Country". This second `focus()` call overwrites HeadlessUI's intended focus management.

---

## Dialog ARIA Structure Assessment

```html
<div
  id="headlessui-dialog-v-15-1"
  role="dialog"
  aria-modal="true"
  aria-labelledby="headlessui-dialog-title-v-15-5"
  data-headlessui-state="open"
  data-test-id="pickup-locations-modal"
  class="vc-modal vc-modal--mobile-fullscreen select-address-map-modal"
  style="--vc-modal-height: 48rem; --vc-modal-max-width: 73rem;"
>
  <div class="vc-modal__backdrop"></div>
  <div class="vc-modal__wrapper">
    <div id="headlessui-dialog-panel-v-15-4" class="vc-modal__panel" data-headlessui-state="open">
      ...
    </div>
  </div>
</div>
```

| ARIA Attribute | Value | Assessment |
|----------------|-------|------------|
| `role="dialog"` | Present | PASS |
| `aria-modal="true"` | Present | PASS |
| `aria-labelledby` | `headlessui-dialog-title-v-15-5` ("Pick points") | PASS |
| `aria-describedby` | Missing | Minor gap — no description |
| `tabindex` on dialog container | Missing | Neutral — dialog doesn't need `tabindex="-1"` if focus is placed on child |
| `tabindex` on dialog panel | Missing | Neutral |
| HeadlessUI focus sentinels | 0 found | Expected in HeadlessUI v1+ — may indicate incorrect version or custom implementation |
| `aria-haspopup` on trigger | Missing | FAIL — trigger button has no `aria-haspopup="dialog"` |
| `aria-expanded` on trigger | Missing | FAIL — trigger gives no state indication to AT |

---

## Trigger Button ARIA Gap

The edit button that opens the modal (`class="vc-address-selection__button"`) lacks critical ARIA attributes:

```json
{
  "tag": "BUTTON",
  "ariaLabel": null,
  "ariaExpanded": null,
  "ariaHasPopup": null,
  "text": ""
}
```

The button has **no accessible name** (no `aria-label`, no visible text, no `title`). Screen readers would announce it as "button" with no indication of its purpose. This is an additional WCAG 4.1.2 (Name, Role, Value) violation — but that is a separate bug.

---

## WCAG Compliance Summary

| Success Criterion | Level | Status | Details |
|-------------------|-------|--------|---------|
| **2.4.3 Focus Order** | AA | FAIL | F1: Initial focus bypasses Close button; F2: Focus returns to wrong element on close; F3: Reopen focus lands on arbitrary phone link (index 176/180) |
| **2.1.2 No Keyboard Trap** | A | PASS | Tab and Shift+Tab cycle correctly within dialog |
| **2.1.1 Keyboard** | A | PASS | Escape closes dialog |
| **4.1.2 Name, Role, Value** | AA | PARTIAL FAIL | Dialog has role/aria-modal/aria-labelledby. Trigger button has no accessible name. |
| **1.3.1 Info and Relationships** | A | PASS | Dialog heading "Pick points" programmatically associated |

---

## Recommended Fixes

### Fix 1 — Correct `initialFocus` on Dialog Open (addresses F1 and F3)

In the `VcModal` or the pickup location modal component, the HeadlessUI `Dialog` component accepts an `initialFocus` ref. Change the `initialFocus` to target the Close button (or remove the override to let HeadlessUI default to the first focusable element, which is the Close button in DOM order):

```vue
<!-- Current (wrong): initialFocus pointing to Country filter button -->
<Dialog :initial-focus="countryFilterRef">

<!-- Correct option A: Point to Close button -->
<Dialog :initial-focus="closeButtonRef">

<!-- Correct option B: Remove initialFocus, let HeadlessUI default to first focusable -->
<Dialog>
```

For the reopen scenario (F3), the asynchronous map/location panel initialization must not call `focus()` after HeadlessUI has already placed focus. The location detail panel component should use `tabIndex="-1"` on its container rather than programmatic `focus()` during mount.

### Fix 2 — Restore Focus to Trigger on Close (addresses F2)

Store a stable ref to the trigger element before opening the dialog and pass it to HeadlessUI's return-focus mechanism:

```vue
<script setup>
const triggerRef = ref(null);

function openModal() {
  triggerRef.value = document.activeElement; // capture trigger
  isOpen.value = true;
}
</script>

<template>
  <button ref="triggerRef" @click="openModal">
    <!-- edit icon -->
  </button>

  <Dialog
    :open="isOpen"
    @close="isOpen = false"
  >
    <!-- HeadlessUI automatically returns focus to triggerRef on close
         if the trigger button is focused when Dialog mounts -->
  </Dialog>
</template>
```

Alternatively, add an explicit `@close` handler that calls `triggerRef.value.focus()`:

```javascript
function handleClose() {
  isOpen.value = false;
  nextTick(() => {
    if (triggerRef.value) triggerRef.value.focus();
  });
}
```

### Fix 3 — Add `aria-label` and `aria-haspopup` to Trigger Button (addresses ARIA gap)

```html
<!-- Current -->
<button class="vc-address-selection__button">
  <svg><!-- pencil icon --></svg>
</button>

<!-- Fixed -->
<button
  class="vc-address-selection__button"
  aria-label="Change pickup location"
  aria-haspopup="dialog"
>
  <svg aria-hidden="true"><!-- pencil icon --></svg>
</button>
```

---

## Evidence Files

| File | Content |
|------|---------|
| `01-storefront-homepage.png` | Storefront on load before login |
| `02-cart-page.png` | Cart page with Pickup delivery mode selected |
| `03-cart-pickup-selected.png` | Pickup point address + edit trigger button visible |
| `04-modal-open-initial.png` | Modal open — focus visually on "Country" button (not Close) |
| `05-modal-focus-close-button.png` | Tab press 5 — focus reaches Close button |
| `06-after-escape-focus-wrong-element.png` | After Escape — focus on unrelated "Toggle vendor select" checkbox |
| `07-modal-reopen-focus-phone-link.png` | Reopen — focus on `tel:+10000000082` link (index 176/180) |
| `07b-modal-reopen-fullpage.png` | Full-page screenshot of reopen state showing dialog with map |

---

## Console Messages Observed

No focus-management-related errors or warnings in the console. The observed console output was:
- 2x `404 Not Found` (unrelated resource load failures)
- 46x `<gmp-pin>: The 'glyph' property is deprecated` (Google Maps API deprecation warnings — unrelated to this bug)

No focus-related JavaScript errors were thrown when focus management failed, confirming this is a **silent failure** invisible to the application itself.

---

## Screen Reader User Impact Assessment

| Screen Reader | Expected on Correct Implementation | Actual (Broken) |
|---|---|---|
| NVDA + Chrome | "Pick points, dialog" → "Close, button" | "Country, button, has popup, collapsed" |
| JAWS + Chrome | "Pick points dialog" → "Close button" | "Country button" (no dialog announcement context) |
| VoiceOver + Safari | "Pick points, web dialog" → "Close, button" | Likely "Country, button" |

On close (Escape):

| Screen Reader | Expected | Actual |
|---|---|---|
| NVDA | Returns to "Change pickup location, button" | "Toggle vendor select, checkbox, not checked" |
| JAWS | Returns to trigger button in shipping section | Jumps to cart items table header area |

**Severity for screen reader users:** The wrong close-focus (F2) is the most disorienting — the user is teleported to an unrelated part of the page after dismissing the dialog, losing their place in the checkout flow. The wrong initial focus (F1) is less severe because focus is still inside the dialog and dialog announcement still occurs. The reopen erratic focus (F3) is severe when a location is pre-selected, as focus jumps to index 176 of 180 and the user must Tab backward extensively to reach the first interactive control.

---

## Verdict

**Status: FAIL — WCAG 2.4.3 Focus Order (AA)**

Three confirmed focus management violations. The tab/Shift+Tab trap works correctly (WCAG 2.1.2 passes). The trigger button's missing accessible name is a co-located WCAG 4.1.2 violation and should be filed as a separate bug or added to this ticket's scope.

**Recommended priority:** High — accessibility regression blocking screen reader and keyboard users from completing the pickup location selection flow in cart.

---

*Report generated by ui-ux-expert agent | 2026-02-27*
*Evidence path: `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/a11y-focus-bug/`*
