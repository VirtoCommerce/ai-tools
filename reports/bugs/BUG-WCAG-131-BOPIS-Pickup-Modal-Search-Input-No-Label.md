# BUG: A11y — BOPIS Pickup Modal — Search Input Has No Label, Violating WCAG 1.3.1 and 3.3.2

**Bug ID:** BUG-WCAG-131-BOPIS-Pickup-Modal-Search-Input-No-Label
**Related Ticket:** VCST-4565
**Date Found:** 2026-02-27
**Found By:** ui-ux-expert agent (Chrome DevTools inspection)
**Severity:** Medium
**Priority:** P2
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, wcag-1.3.1, wcag-3.3.2, form-label, bopis, screen-reader, input

---

## Summary

The search input field inside the BOPIS "Pick points" modal has no associated `<label>` element, no `aria-label`, and no `aria-labelledby` attribute. The placeholder text "Search Country" is the only identification, but placeholder text is not a substitute for a programmatic label and is not reliably announced by all screen readers.

---

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com |
| Browser | Chrome (Chromium via Chrome DevTools MCP) |
| Viewport | 1920x1080 (Desktop) |
| Date | 2026-02-27 |
| Related Feature | VCST-4565 |
| Component | `VcInput` (inside BOPIS pickup modal search) |

---

## Steps to Reproduce

1. Log in to the QA storefront
2. Navigate to Cart and switch delivery mode to "Pickup"
3. Click the pencil/edit icon to open the "Pick points" modal
4. Use a screen reader (VoiceOver, NVDA) and navigate to the search input, OR
5. Inspect the input in DevTools and check for a `<label>` element or ARIA label attributes

---

## Expected Result

The search input has a programmatically associated label via one of:
- `<label for="input-id">Search locations</label>` (preferred — always visible), OR
- `aria-label="Search pickup locations"` on the input element, OR
- `aria-labelledby="id-of-heading-or-label-element"`

---

## Actual Result

The search input (`id="input-858"`) has:
- No `<label>` element associated via `for` attribute
- No `aria-label` attribute
- No `aria-labelledby` attribute
- Only a `placeholder="Search Country"` attribute for identification

### Inspected DOM

```html
<input id="input-858"
       class="vc-input__input"
       type="text"
       placeholder="Search Country"
       aria-describedby=""
       value="">
<!-- No associated <label for="input-858"> -->
<!-- No aria-label on the input -->
```

---

## Impact

- Screen reader users (NVDA, VoiceOver, JAWS) will not have the input announced with a meaningful label
- When focus enters the input, the screen reader may announce only the input type ("edit text") or nothing meaningful
- Placeholder text "Search Country" is not announced reliably across all screen reader + browser combinations
- Users who rely on voice recognition software (Dragon NaturallySpeaking) cannot activate the field by name
- WCAG 1.3.1 violation: the input's purpose is not programmatically determinable

---

## Suggested Fix

Add an `aria-label` attribute to the search input (simplest fix):

```html
<input id="input-858"
       aria-label="Search pickup locations by country"
       placeholder="Search Country"
       ... />
```

Or if using the `VcInput` component, pass the `label` prop or configure it to render a visually-hidden label:

```vue
<VcInput
  v-model="searchQuery"
  placeholder="Search Country"
  label="Search pickup locations"
  :hide-label="true"  <!-- renders label as visually-hidden -->
/>
```

A visible label above the input is preferred over `aria-label` alone, as it helps all users (including those with cognitive disabilities) understand the field's purpose.

---

## WCAG References

- **Criterion:** 1.3.1 Info and Relationships (Level A)
  - "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text."
  - Applies: form inputs must have programmatically associated labels

- **Criterion:** 3.3.2 Labels or Instructions (Level A)
  - "Labels or instructions are provided when content requires user input."
  - Applies: search input requires a label to understand its purpose

- **Sources:**
  - https://www.w3.org/TR/WCAG21/#info-and-relationships
  - https://www.w3.org/TR/WCAG21/#labels-or-instructions

---

## Evidence

- **Report:** `tests/Sprint26-04/VCST-4565-bopis-pickup-selected-modal/test-execution-report.md` (Section: Inspection Point 3 — ARIA Attributes, Issue D)
