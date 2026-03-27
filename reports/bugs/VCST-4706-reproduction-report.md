# Bug Reproduction Report — VCST-4706

**Title:** [BOPIS][A11y] WCAG 1.3.1 — Radio buttons in pickup modal missing name attribute
**Ticket:** VCST-4706
**Reproduced by:** ui-ux-expert
**Date:** 2026-03-26
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Theme:** Coffee
**Browser:** Chrome (Chrome DevTools MCP)
**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** High (A11y Critical — keyboard navigation broken for assistive technology users)

---

## Verdict: CONFIRMED REPRODUCED

The bug is fully confirmed. All 50 radio inputs inside the BOPIS pickup location modal have no `name` attribute — `getAttribute('name')` returns `null` (attribute entirely absent from the HTML). The browser's DOM property `r.name` therefore defaults to `""`. No `role="radiogroup"` wrapper is present. Arrow key navigation between pickup location options does not work.

---

## Steps Reproduced

### Step 1 — Navigate to storefront
Navigated to `https://vcst-qa-storefront.govirto.com`. Cart already contained 4 items.

Screenshot: `VCST-4706-step1-homepage.png`

### Step 2 — Navigate to cart
Navigated to `/cart`. Confirmed the BOPIS "SHIPPING DETAILS" section was visible for the "SHOT" vendor item, with "Pickup" and "Shipping" delivery option buttons and a currently selected pickup point ("30 Lafayette Ave, New York").

Screenshot: `VCST-4706-step2-cart-bopis-section.png`, `VCST-4706-step2b-cart-bopis-visible.png`

### Step 3 — Open the BOPIS pickup location modal
Clicked the edit button next to the pickup point address. The "Pick points" modal opened, displaying a list of 50 pickup location options as radio buttons.

Screenshot: `VCST-4706-step3-pickup-modal-open.png`

### Step 4 — Inspect radio input name attributes

Executed:
```js
document.querySelectorAll('input[type="radio"]')
```
Then the full detail script from the ticket:
```js
Array.from(document.querySelectorAll('input[type="radio"]')).map(r => ({name: r.name, id: r.id, value: r.value, checked: r.checked}))
```

**Result:** All 52 radio inputs on the page returned `name: ""`. The `getAttribute('name')` call returns `null` — the attribute is not set at all in the HTML markup. The `""` value seen via `r.name` is the browser's DOM default for a missing attribute.

Example entries:
| id | name | nameIsEmpty | getAttribute('name') |
|----|------|-------------|---------------------|
| vc-radio-button-1107-input | "" | true | null |
| vc-radio-button-1114-input | "" | true | null |
| vc-radio-button-1121-input | "" | true | null |
| ... (50 pickup modal radios, all identical) | | | |

Screenshot: `VCST-4706-step4-radio-inputs-in-modal.png`

### Step 5 — Verify arrow key navigation is broken

**radiogroup check:**
```js
document.querySelector('[role="radiogroup"]') // → null
document.querySelectorAll('[role="radiogroup"]').length // → 0
```
No `role="radiogroup"` wrapper exists. No `aria-label` on any group.

**Arrow key navigation simulation:**
Focused the first pickup radio (`vc-radio-button-1107-input`, currently checked), dispatched a native `ArrowDown` KeyboardEvent, then inspected which element held focus and which radio was checked.

```
Before: focus on vc-radio-button-1107-input (checked: true)
After ArrowDown: focus still on vc-radio-button-1107-input (unchanged)
vc-radio-button-1114-input (second option): checked = false (unchanged)
```

Focus did not move. No radio changed state. Arrow key navigation is completely non-functional.

**Why:** The browser groups `<input type="radio">` elements into a navigable set using the shared `name` attribute. With `name` absent (or `name=""`), every radio is its own isolated group of one. The browser has no set to navigate within, so ArrowDown/ArrowUp have no effect.

Screenshot: `VCST-4706-step5-arrow-nav-broken-evidence.png`

### Step 6 — Count of affected radio inputs

```js
// Total radios on page with name=""
document.querySelectorAll('input[type="radio"]').length // → 52 total
// Radios with empty name property
Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.name === '').length // → 52
// Radios with missing name attribute (getAttribute returns null)
Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.getAttribute('name') === null).length // → 52
// Pickup modal radios specifically (id prefix "vc-radio-button")
// Affected count: 50
// Non-affected: 2 (Pickup/Shipping delivery mode toggles — id="input-632", id="input-634")
```

**Affected:** 50 pickup location radio inputs inside the modal.
**Also affected:** The 2 Pickup/Shipping delivery toggle radios (`input-632`, `input-634`) on the cart page itself also have `name=""`, though these are fewer and may use click-only interaction.

---

## Evidence Summary

| Script | Expected | Actual |
|--------|----------|--------|
| `r.name` on all modal radios | `"pickup-location"` (or any non-empty shared value) | `""` (empty string — DOM default) |
| `r.getAttribute('name')` | Returns a non-null string | `null` — attribute entirely absent |
| `document.querySelector('[role="radiogroup"]')` | Element found | `null` — not present |
| Arrow key focus movement after ArrowDown | Focus moves to next radio | Focus stays on same radio |
| Arrow key state change after ArrowDown | Next radio becomes checked | No radio changes state |
| Radios with `name=""` in modal | 0 | 50 out of 50 |
| Radios with missing `name` attr on page | 0 | 52 out of 52 |

---

## WCAG Analysis

**Criterion 1.3.1 — Info and Relationships (Level A)**

The relationship between the radio buttons (that they form a mutually exclusive group of pickup location options) is not conveyed programmatically. Two mechanisms are available to convey this:

1. A shared non-empty `name` attribute on all `<input type="radio">` elements in the group — this is the standard HTML mechanism, and it is what drives browser-native arrow key navigation.
2. A wrapping element with `role="radiogroup"` and `aria-label` — this is the ARIA fallback.

Neither is present. Screen reader users and keyboard-only users cannot determine that these inputs are related options, and cannot navigate between them using the keyboard.

**Additional criterion breach:**
- **WCAG 2.1.1 — Keyboard (Level A):** Arrow key navigation between radio options (standard keyboard interaction for radio groups) does not function. Users relying on keyboard cannot efficiently select a pickup location.
- **WCAG 4.1.2 — Name, Role, Value (Level A):** The role relationship of the radio group is not exposed. Each radio is announced in isolation without group context.

---

## Root Cause (Observable)

The `VcRadioButton` component does not forward a `name` prop to the underlying `<input type="radio">` element, or the parent component rendering the pickup location list does not pass a shared `name` value to each `VcRadioButton` instance. The component IDs follow the pattern `vc-radio-button-{n}-input`, confirming the `VcRadioButton` atom is the rendering component.

---

## Fix Recommendation

**Option A (preferred):** Add a shared `name` prop to `VcRadioButton`. The parent component rendering the pickup list should pass the same name value to all radio instances in the group (e.g., `name="pickup-location"`).

**Option B (ARIA fallback):** Wrap the list of radio buttons in an element with `role="radiogroup"` and `aria-labelledby` pointing to the modal heading. This does not restore native browser arrow key navigation but satisfies WCAG 1.3.1.

**Option A + B together** is the complete fix — native grouping via `name` restores keyboard navigation; `role="radiogroup"` provides explicit semantic structure for screen readers.

---

## Screenshots

- `VCST-4706-step1-homepage.png` — Storefront homepage confirming environment
- `VCST-4706-step2-cart-bopis-section.png` — Cart page with BOPIS section
- `VCST-4706-step2b-cart-bopis-visible.png` — BOPIS shipping details scrolled into view
- `VCST-4706-step3-pickup-modal-open.png` — Pick points modal open showing radio list
- `VCST-4706-step4-radio-inputs-in-modal.png` — Modal with radio inputs visible for inspection
- `VCST-4706-step5-arrow-nav-broken-evidence.png` — Arrow key navigation failure state

All screenshots located in: `reports/bugs/`
