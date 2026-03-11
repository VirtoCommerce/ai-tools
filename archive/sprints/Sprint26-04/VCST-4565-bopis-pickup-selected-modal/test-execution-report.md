# VCST-4565 — BOPIS Pickup Location Modal: Selected Pick Point Inspection Report

**Feature:** [BOPIS][Desktop] Show selected pick point on Pick Point popup window open
**Date:** 2026-02-27
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Browser:** Chrome DevTools (Chromium)
**Viewport:** 1920x1080 (Desktop)
**Tested By:** ui-ux-expert agent
**Storefront Version:** 2.43.0-pr-2188-c129-c1290c2d

---

## Test Setup

- Logged in as: mutykovaelena@gmail.com ([Cypress]-Corporate-1 Kft.)
- Cart was pre-populated with existing items
- Delivery mode switched to "Pickup"
- Existing pickup selection: **Empire State Building - Main_1; Transfer_1_2_3** (USA, New York, 20 W 34th St)
- Modal reopened via the pencil/edit icon next to the pickup point field

---

## Screenshots

| File | Description |
|------|-------------|
| `01-modal-open-with-selection-desktop.png` | Modal open showing info panel overlaid on map |
| `02-modal-list-selected-item-visible-desktop.png` | Modal with list showing selected item |
| `03-selected-item-scrolled-into-view-desktop.png` | Selected item visible after scroll |
| `04-selected-radio-detail-desktop.png` | Selected radio button detail |
| `05-info-panel-with-action-buttons-desktop.png` | Info panel with CANCEL / PICK UP HERE buttons |

---

## Inspection Point 1: Visual Indicator for Selected Location

### Findings

**Visual treatments applied to the selected list item ("Empire State Building"):**

| Treatment | Selected | Unselected | Difference |
|-----------|----------|------------|------------|
| Background | `rgb(238, 240, 242)` (light blue-grey) | `transparent` (white) | Background highlight applied |
| Radio button border color | `rgb(153, 108, 90)` (brand brown/orange) | `rgb(163, 163, 163)` (grey) | Distinct color change |
| Radio button border width | `4px` | `1px` | Thick inner border creates "filled dot" visual |
| Radio button background | `rgb(255, 255, 255)` (white) | `rgb(255, 255, 255)` (white) | Same |
| Item border | `1px solid rgb(163, 163, 163)` | `1px solid rgb(163, 163, 163)` | No change |
| Font weight | `400` | `400` | No change (no bold treatment) |
| Font color | `rgb(10, 10, 10)` | `rgb(10, 10, 10)` | No change |
| Box shadow | None | None | No change |

**CSS class added to selected radio button container:**
`vc-radio-button--checked` is added to the `.vc-radio-button` div.

**ARIA state on selected radio input:**
`aria-checked="true"` — correct.

### Assessment

The radio button approach is functional and meets basic visual requirements. The selected state is distinguishable through:
1. The orange/brown filled radio button (brand color `#996c5a`)
2. A subtle light blue-grey background highlight on the row

**Concern:** The background highlight (contrast ratio 1.14:1 against white) is too subtle to serve as a standalone selection indicator. Users with low-contrast perception may not notice it. The radio button itself is the primary discriminator. This is acceptable because the radio button indicator does pass WCAG 3:1 for graphical elements — but the combined effect relies heavily on that small 16x16px radio control.

**No bold text, no checkmark, no left-border accent** is applied to make the selected item more prominent in the list. This means only users who notice the radio fill will recognize the selection. Recommendation: Add a left-side accent border or slightly bolder text to reinforce the selection visually.

---

## Inspection Point 2: Color Contrast (WCAG 2.1 AA)

### Contrast Audit Results

| Test | Element | Foreground | Background | Ratio | WCAG AA | Result |
|------|---------|-----------|------------|-------|---------|--------|
| 1 | Normal text on selected row | `rgb(10,10,10)` | `rgb(238,240,242)` | **17.33:1** | >= 4.5:1 | **PASS** |
| 2 | Normal text on unselected row | `rgb(10,10,10)` | `white` | **19.80:1** | >= 4.5:1 | **PASS** |
| 3 | Selected radio indicator vs selected row bg | `rgb(153,108,90)` | `rgb(238,240,242)` | **3.96:1** | >= 3.0:1 | **PASS** |
| 4 | Selected radio indicator vs white | `rgb(153,108,90)` | `white` | **4.52:1** | >= 3.0:1 | **PASS** |
| 5 | **Unselected radio border vs white** | `rgb(163,163,163)` | `white` | **2.52:1** | >= 3.0:1 | **FAIL** |
| 6 | Selected row bg vs page bg (row distinction) | `rgb(238,240,242)` | `white` | **1.14:1** | N/A (informational) | LOW |

### Critical Finding — WCAG Violation

**Test 5 FAILS:** The unselected radio button border (`rgb(163, 163, 163)`) against the white background (`white`) achieves only **2.52:1** contrast ratio. WCAG 2.1 Success Criterion 1.4.11 (Non-text Contrast) requires a minimum of **3:1** for UI component boundaries.

This means:
- Users with low vision cannot reliably perceive the unselected radio button boundary
- The control is not visually identifiable as a selectable input
- The deficiency is on ALL unselected radio buttons (50 in total)

**Test 6 (Informational):** The row highlight contrast of 1.14:1 is too low for the background to serve as a reliable visual indicator. The selection state is communicated primarily via the radio button indicator, which passes when selected (3.96:1 on highlighted bg) but not when unselected (2.52:1 on white).

### Map Marker Contrast

| Marker | Color | vs White Map | WCAG 3:1 | Result |
|--------|-------|-------------|----------|--------|
| Selected (Empire State) | `rgb(62, 132, 91)` (success green, `#3e845b`) | **4.51:1** | >= 3.0:1 | **PASS** |
| Unselected (other locations) | `rgb(153, 108, 90)` (primary brown, `#996c5a`) | **4.52:1** | >= 3.0:1 | **PASS** |

Both map marker colors pass WCAG 1.4.11 Non-text Contrast against the light map background.

---

## Inspection Point 3: ARIA Attributes

### Dialog

| Attribute | Value | Assessment |
|-----------|-------|------------|
| `role="dialog"` | Present | PASS |
| `aria-modal="true"` | Present | PASS |
| `aria-labelledby` | `headlessui-dialog-title-v-15-5` (links to "Pick points" heading) | PASS |

### Radio Buttons (Location List Items)

| Attribute | Selected | Unselected | Assessment |
|-----------|----------|------------|------------|
| `aria-checked="true/false"` | `aria-checked="true"` | `aria-checked="false"` | PASS |
| `type="radio"` | Present | Present | PASS |
| `checked` (HTML) | Present | Absent | PASS |
| `name` attribute | Empty `""` | Empty `""` | **ISSUE** |
| Label association (`label[for]`) | Present via `<label for="...">` | Present | PASS |

### ARIA Issues Found

**Issue A — Missing radio group `name` attribute:**
All 50 radio buttons have `name=""` (empty string). This means they are not properly grouped as a radio group. Screen readers use the `name` attribute to group radio buttons so a user knows they are choosing one of a set. Without a shared `name`, a screen reader may treat them as independent inputs rather than a mutually exclusive selection set.

**Issue B — List container has no ARIA role:**
The `<ul>` containing location items has no `role="listbox"` and no `aria-label`. The list items (`<li>`) have no `role="option"`. For a selection list, this is an accessibility improvement opportunity. The current markup uses native radio buttons inside `<li>` elements which is acceptable, but labeling the list explicitly would help screen readers announce the context.

**Issue C — Delivery chip buttons have no accessible name:**
Each list item contains a button with `role="button"` and `aria-haspopup="dialog"` that triggers a delivery info tooltip. These buttons contain text "Today" or "Delivery 2-3 days..." which serves as their visible label. However, `aria-label` is not set, so screen readers will read the full chip text content. This is acceptable but could be improved by providing a more descriptive label like "See delivery details for [location name]".

**Issue D — Search input has no label:**
The search input (`id="input-858"`) has no associated `<label>` element and no `aria-label` or `aria-labelledby` attribute. The placeholder "Search Country" is not a substitute for a label as it disappears when typing. This is a WCAG 1.3.1 (Info and Relationships) and 3.3.2 (Labels or Instructions) violation.

### Focus Management

**Finding:** When the modal opens, focus goes to `<body>` and not to an element inside the dialog. The `document.activeElement` is `<body>` when the modal is open.

This violates WCAG 2.4.3 (Focus Order) and is a significant accessibility issue:
- Screen reader users will not automatically be aware the modal opened
- Keyboard-only users must Tab multiple times to find modal content
- Best practice: focus should go to the first interactive element (Close button or first list item) upon modal open

**No keyboard trap was observed** in the accessibility tree — however, proper focus trap verification requires live keyboard testing.

---

## Inspection Point 4: Scroll Behavior

### Findings

| Behavior | Observed | Value |
|----------|----------|-------|
| Auto-scroll to selected item | YES — scrolled | `scrollTop: 4213` px |
| Selected item position | 50 items in list, Empire State is item ~47 (4484px offset) | Near bottom of list |
| Selected item visible in viewport | YES | `isInView: true` |
| Scroll behavior type | Instant (no smooth animation detected) | — |
| CLS caused by scroll | Not observed | — |

**Assessment:** The auto-scroll to the selected item is working correctly. When the modal reopens, the list is scrolled to bring the previously selected item into view. The Empire State Building item (near position 47 of 50) is correctly visible in the scroll container. No layout shift (CLS) was observed.

**Minor concern:** The scroll is instant rather than smooth. `behavior: 'instant'` was used. Smooth scrolling would provide better spatial context for users (so they can see where in the list they land). This is a UX improvement, not an accessibility issue.

---

## Inspection Point 5: Map Marker Visual State

### Selected vs Unselected Markers

| Property | Selected (Empire State) | Unselected (All Others) |
|----------|------------------------|------------------------|
| Pin color | `var(--color-success-500)` = `#3e845b` (green) | `var(--color-primary-500)` = `#996c5a` (brown) |
| Pin border color | Same as background | Same as background |
| Scale / Size | `1.7` (larger) | `1.5` (standard) |
| Contrast vs light map bg | **4.51:1** (PASS) | **4.52:1** (PASS) |
| ARIA accessible name | `aria-label="Empire State Building - Main_1; Transfer_1_2_3"` | Named per location | PASS |
| Role | `role="button"` | `role="button"` | PASS |
| Tab index | `-1` (not in tab order) | Not verified | Note |

**Assessment:** The map marker provides a clear visual distinction:
1. **Color change**: Green (success) vs Brown (primary) — strongly differentiates selected from unselected
2. **Size increase**: Scale 1.7 vs 1.5 — the selected marker is 13% larger
3. Both colors pass WCAG 1.4.11 contrast against the map background

The combination of color + size is an effective approach and does not rely solely on color to convey selection state, which is important for WCAG 1.4.1 (Use of Color).

**Note on tab order:** The map markers have `tabindex="-1"` meaning they are not keyboard-accessible. Users cannot navigate to map markers via keyboard alone. This may be acceptable if the same action (selecting a pickup point) is available via the list, but it means keyboard users cannot interact with the map at all.

---

## Inspection Point 6: Layout Integrity

### Modal Layout at 1920x1080

| Check | Result | Notes |
|-------|--------|-------|
| Side-by-side layout (list + map) | CONFIRMED | List on left (~490px wide), map on right (~866px wide) |
| Overflow/clipping | None observed | |
| Z-index issues | None observed | |
| Modal covers viewport | YES — modal dimensions: 1920x1080 | Modal is full-screen at this viewport |
| Map rendered correctly | YES | Google Maps tiles visible, markers rendered |
| Info panel overlay | Opens on top of map correctly | No z-index conflicts |
| List scroll container | Works | Class: `vc-scrollbar vc-scrollbar--vertical select-address-map-list` |
| Total scrollable height | 4978px for 50 items | Each item ~92px height |

**Assessment:** Layout is structurally sound. The modal renders correctly at 1920x1080. The side-by-side layout of list and map is maintained. No overflow, clipping, or z-index issues were found.

---

## Summary of Issues Found

### Accessibility Issues (WCAG Violations)

| ID | Severity | WCAG Criterion | Description |
|----|----------|---------------|-------------|
| A-1 | **High** | 1.4.11 Non-text Contrast | Unselected radio button border: 2.52:1 vs white (required 3:1). Affects 50 radio buttons. |
| A-2 | **High** | 2.4.3 Focus Order | Focus does not move into the modal on open; `document.activeElement` is `<body>` |
| A-3 | **Medium** | 1.3.1 Info and Relationships | Search input has no label element, no `aria-label`, no `aria-labelledby` |
| A-4 | **Medium** | 1.3.1 Info and Relationships | Radio buttons have no `name` attribute — not grouped as a radio group |
| A-5 | **Low** | 2.1.1 Keyboard | Map markers have `tabindex="-1"` — not reachable by keyboard |

### Visual / UX Issues

| ID | Severity | Description |
|----|----------|-------------|
| V-1 | **Low** | Selected row background highlight (1.14:1 vs white) is very subtle — relies entirely on radio button to signal selection |
| V-2 | **Low** | No bold text / left-border accent on selected list item — visual emphasis is minimal |
| V-3 | **Low** | List scroll is instant, not smooth — reduces spatial orientation for users |

### Passing Criteria

| Check | Result |
|-------|--------|
| Selected location visually distinguished (radio button filled) | PASS |
| Selected map marker distinct from unselected (green, larger) | PASS |
| `aria-checked="true"` on selected radio | PASS |
| Label association (`label[for]`) on all radios | PASS |
| Auto-scroll to selected item on modal open | PASS |
| Selected item in view after modal opens | PASS |
| Modal has `aria-modal="true"` | PASS |
| Dialog labeled via `aria-labelledby` | PASS |
| Text contrast on all list items | PASS (17.33:1 selected, 19.80:1 unselected) |
| Map marker contrast vs map background | PASS (4.51:1 selected, 4.52:1 unselected) |
| Layout integrity at 1920x1080 | PASS |
| No overflow / z-index issues | PASS |
| No CLS on scroll | PASS |

---

## Recommendations

### Priority 1 (High — Accessibility Compliance)

1. **Fix unselected radio border contrast** (A-1): Change the unselected radio button border color from `rgb(163, 163, 163)` to at least `rgb(126, 126, 126)` or darker to achieve 3:1 contrast against white. This affects the `vc-radio-button` component globally.
   - Current: `rgb(163, 163, 163)` — 2.52:1 vs white
   - Suggested minimum: `rgb(117, 117, 117)` — 3.01:1 vs white

2. **Fix modal focus management** (A-2): On modal open, programmatically move focus to the Close button or the first focusable element inside the dialog. For the reopened modal with a selection, ideally focus the selected list item.

3. **Add label to search input** (A-3): Add `aria-label="Search pickup locations"` to the search input or wrap it in a `<label>`.

4. **Add `name` attribute to radio buttons** (A-4): Add a shared `name="pickup-location"` attribute to all radio inputs in the list to properly group them as a radio group.

### Priority 2 (Medium — UX Improvement)

5. **Enhance selected row visual treatment** (V-1, V-2): Consider adding a left-side accent border (e.g., `border-left: 3px solid #996c5a`) to the selected list item row to make the selection immediately obvious without relying only on the small radio button circle.

6. **Smooth scroll to selected item** (V-3): Use `behavior: 'smooth'` when auto-scrolling to the selected item on modal open to improve spatial orientation.

### Priority 3 (Low — Keyboard Access)

7. **Make map markers keyboard accessible** (A-5): While the list provides keyboard-accessible selection, consider adding `tabindex="0"` to map markers and ensuring keyboard users can navigate the map to select locations as an alternative interaction path.

---

## UI/UX SIGN-OFF

| Criteria | Status | Notes |
|----------|--------|-------|
| Selected location visually highlighted | PASS | Radio button fills with brand color + row bg highlight |
| Highlight immediately noticeable | PARTIAL | Radio button is subtle (16px); no bold text/left border accent |
| Color contrast >= 4.5:1 (text) | PASS | All text elements pass |
| Color contrast >= 3:1 (UI components selected) | PASS | Selected radio 3.96:1 on highlight bg |
| Color contrast >= 3:1 (UI components unselected) | **FAIL** | Unselected radio border 2.52:1 vs white — WCAG violation |
| ARIA `aria-checked` correct | PASS | Selected = true, Unselected = false |
| Radio buttons grouped with `name` | **FAIL** | `name=""` on all radios — not grouped |
| Search input has label | **FAIL** | No `<label>`, no `aria-label` |
| Modal focus management | **FAIL** | Focus stays on `<body>` after modal opens |
| Scroll to selected item | PASS | Auto-scrolled to Empire State Building item |
| Map marker distinct for selected | PASS | Green color + larger scale (1.7 vs 1.5) |
| Map marker accessible | PARTIAL | Has `aria-label` but `tabindex="-1"` (keyboard unreachable) |
| Layout integrity 1920x1080 | PASS | Side-by-side layout correct |
| No overflow / clipping | PASS | |
| No CLS from scroll | PASS | |

**Overall UI/UX Status: CONDITIONAL PASS**

The core feature requirement (selected location is highlighted when modal reopens) is implemented and working. The visual treatment uses a radio button fill + subtle row background — the feature works but has accessibility violations that must be addressed.

**Blocking Issues for Full Approval:**
- Unselected radio button border contrast failure (WCAG 1.4.11) — affects all 50 radio buttons, not just the selected one
- Modal focus not trapped/directed on open (WCAG 2.4.3)

| Role | Decision | Date |
|------|----------|------|
| UI/UX Expert | CONDITIONAL PASS — Feature works; 2 blocking a11y issues documented | 2026-02-27 |
