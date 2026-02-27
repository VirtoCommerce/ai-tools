# BUG: A11y — BOPIS Pickup Modal — Radio Buttons Have Empty `name` Attribute, Breaking Radio Group Semantics

**Bug ID:** BUG-WCAG-131-BOPIS-Pickup-Modal-Radio-Buttons-Missing-Name-Attribute
**Related Ticket:** VCST-4565
**Date Found:** 2026-02-27
**Found By:** ui-ux-expert agent (Chrome DevTools inspection)
**Severity:** Medium
**Priority:** P2
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, wcag-1.3.1, radio-button, radio-group, bopis, screen-reader, vc-radio-button

---

## Summary

All 50 radio button inputs in the BOPIS pickup location list have an empty `name=""` attribute. The `name` attribute is required for radio buttons to be recognized as a mutually exclusive group by browsers and screen readers. Without a shared `name` value, each radio button behaves as an independent input rather than a member of a selection set.

---

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com |
| Browser | Chrome (Chromium via Chrome DevTools MCP) |
| Viewport | 1920x1080 (Desktop) |
| Date | 2026-02-27 |
| Related Feature | VCST-4565 |
| Component | `vc-radio-button` (Vue.js) inside `select-address-map-list` |

---

## Steps to Reproduce

1. Log in to the QA storefront
2. Navigate to Cart and switch delivery mode to "Pickup"
3. Click the pencil/edit icon to open the "Pick points" modal
4. In DevTools, inspect any radio input in the location list:
   ```javascript
   document.querySelectorAll('[role="dialog"] input[type="radio"]')
     .forEach(r => console.log(r.name, r.id));
   // All print: "" (empty name)
   ```

---

## Expected Result

All radio buttons in the pickup location list share the same non-empty `name` attribute (e.g., `name="pickup-location"`). This groups them as a mutually exclusive set, enabling:
- Browsers to enforce single-selection behavior within the group
- Screen readers to announce "1 of 50 radio buttons" when navigating the group
- Arrow key navigation between radio buttons (standard browser behavior for named radio groups)

---

## Actual Result

All radio buttons have `name=""` (empty string):

```html
<input id="vc-radio-button-1409-input"
       class="vc-radio-button__input"
       type="radio"
       name=""           <!-- empty name -->
       checked=""
       aria-checked="true"
       value="35ed6a47-8d40-4acb-a0ba-468b07b69ee0">
```

This affects all 50 radio buttons in the list.

---

## Impact

### Functional Impact

- Browsers use the `name` attribute to enforce mutual exclusivity in radio groups. With `name=""`, all radios share the same empty name — in most browsers this means they ARE technically in the same group (empty string is treated as a group name). However, this is relying on undefined/implementation-specific behavior and is not reliable across all browsers.
- Arrow key navigation between radio buttons (Up/Down arrow to move selection) depends on the `name` group. Behavior with `name=""` is inconsistent.

### Screen Reader Impact

- NVDA, JAWS, and VoiceOver announce radio button context using the group name. With `name=""`, the group context is absent.
- Screen readers typically announce: "radio button, [label], [checked/unchecked], [position] of [total] in group [group-name]"
- With no group name, the position-in-group ("1 of 50") may not be announced
- Users lose the understanding that they are selecting one from a set of 50 options

### Keyboard Navigation Impact

- Standard browser behavior: within a named radio group, arrow keys (Up/Down) move focus AND selection between radios
- With `name=""`, keyboard navigation with arrow keys may not work as expected, forcing users to Tab through all 50 items

---

## Suggested Fix

Add a shared `name` attribute to all radio buttons in the pickup location list. The value should be consistent and descriptive:

```html
<input id="vc-radio-button-1409-input"
       type="radio"
       name="pickup-location"    <!-- Add this -->
       checked=""
       aria-checked="true"
       value="35ed6a47-8d40-4acb-a0ba-468b07b69ee0">
```

In the `vc-radio-button` Vue component, ensure the `name` prop is passed and applied to the underlying `<input>`:

```vue
<!-- Parent component (pickup location list) -->
<VcRadioButton
  v-for="location in locations"
  :key="location.id"
  name="pickup-location"      <!-- Pass this prop -->
  :value="location.id"
  v-model="selectedLocation"
/>
```

Additionally, wrapping the list in a `<fieldset>` with a `<legend>` would provide explicit grouping context:

```html
<fieldset>
  <legend class="visually-hidden">Select a pickup location</legend>
  <!-- radio button list -->
</fieldset>
```

---

## WCAG Reference

- **Criterion:** 1.3.1 Info and Relationships (Level A)
  - "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text."
  - Applies: The mutual-exclusivity relationship between radio buttons in a group must be programmatically determinable via the `name` attribute or equivalent grouping mechanism.
  - Source: https://www.w3.org/TR/WCAG21/#info-and-relationships

---

## Evidence

- **Report:** `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/test-execution-report.md` (Section: Inspection Point 3 — ARIA Attributes, Issue A)
