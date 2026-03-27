# Bug Reproduction Report: VCST-4705
## BOPIS Modal — Search/Filter Inputs Missing Accessible Labels

**Date:** 2026-03-26
**Reporter:** ui-ux-expert agent
**Environment:** QA — https://vcst-qa-storefront.govirto.com
**Theme:** Coffee
**Browser:** Chrome DevTools MCP (Chromium)

---

## Bug Summary

The "Pick points" BOPIS modal, accessible from the cart page via the Pickup delivery option, contains search/filter input fields with no accessible name. Screen readers will announce these inputs as unlabelled, violating WCAG 2.1 AA Success Criteria 1.3.1, 3.3.2, and 4.1.2 (all Level A).

**Severity:** P0 — WCAG Level A violation (legal compliance risk)
**Component:** BOPIS "Pick points" modal — `facet-filter-dropdown__search` inputs
**WCAG Criteria Violated:**
- **1.3.1** Info and Relationships (Level A) — structure not conveyed programmatically
- **3.3.2** Labels or Instructions (Level A) — inputs have no labels
- **4.1.2** Name, Role, Value (Level A) — custom inputs expose no accessible name

---

## Steps to Reproduce (Exact Path: Cart)

### Step 1 — Navigate to storefront and add an item to the cart

1. Open https://vcst-qa-storefront.govirto.com
2. Browse to a product page (confirmed with: "2024 New KODAK EKTAR H35N Half Frame Camera", product ID: `09512f45-b950-478c-8a38-d1d51ddb39de`)
3. Click "Add to Cart" / increase quantity stepper
4. Confirm item appears in cart (cart badge increments)

**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step1-catalog-page.png`
**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step1-add-to-cart.png`

### Step 2 — In the cart, open the BOPIS pickup location modal

1. Navigate to https://vcst-qa-storefront.govirto.com/cart
2. Locate the delivery method tabs — select "Pickup" (button with `aria-label="Pickup"`)
3. The `.vc-address-selection` component renders with the currently selected pickup location and an edit/change button (icon-only button with no `aria-label` — secondary a11y issue)
4. Click the edit icon button inside `.vc-address-selection` to open the "Pick points" modal

**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step2-cart-page.png`
**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step2-pickup-tab-clicked.png`

### Step 3 — Inspect the search/filter input elements

1. The "Pick points" dialog opens (`role="dialog"`, `aria-labelledby="headlessui-dialog-title-v-16-5"`, heading text: "Pick points")
2. The modal contains filter dropdowns for Country, State/Province, and City, each with a search input inside a `facet-filter-dropdown__search` wrapper
3. Inspect each input element in browser DevTools

**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step3-bopis-modal-cart.png`
**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step3-pick-points-modal-inputs.png`
**Screenshot:** `tests/Sprint-current/VCST-4705/screenshots/step3-pick-points-modal-top.png`

### Step 4 — Verify no label, aria-label, or aria-labelledby on the inputs

DOM inspection of the three failing inputs:

```html
<!-- input-896: Search Country — FAIL: no accessible name -->
<input
  id="input-896"
  type="text"
  placeholder="Search Country"
  maxlength="30"
  title=""
  class="vc-input__input"
  tabindex="0"
>
<!-- No aria-label, no aria-labelledby, no <label for="input-896">, title="" (empty) -->

<!-- input-948: Search State / Province — FAIL: no accessible name -->
<input
  id="input-948"
  type="text"
  placeholder="Search State / Province"
  maxlength="30"
  title=""
  class="vc-input__input"
  tabindex="0"
>
<!-- No aria-label, no aria-labelledby, no <label for="input-948">, title="" (empty) -->

<!-- input-1000: Search City — FAIL: no accessible name -->
<input
  id="input-1000"
  type="text"
  placeholder="Search City"
  maxlength="30"
  title=""
  class="vc-input__input"
  tabindex="0"
>
<!-- No aria-label, no aria-labelledby, no <label for="input-1000">, title="" (empty) -->
```

Component ancestry for all three failing inputs:
```
INPUT.vc-input__input           ← no aria-label, no aria-labelledby
  DIV.vc-input__container       ← no aria labelling
    DIV.vc-input.vc-input--size--sm.vc-input--truncate   ← no aria labelling
      DIV.facet-filter-dropdown__search                  ← no aria labelling
        UL.vc-scrollbar.vc-dropdown-menu__list           ← no aria labelling
```

### Step 5 — Confirm screen readers announce with no name/label

Accessible name computation per ARIA specification (priority order):
1. `aria-labelledby` — NOT PRESENT
2. `aria-label` — NOT PRESENT
3. Associated `<label>` element (`for` attribute matching input `id`) — NOT PRESENT
4. Wrapping `<label>` element — NOT PRESENT
5. `title` attribute — PRESENT but empty string (`title=""`) — does NOT provide an accessible name
6. `placeholder` — "Search Country" / "Search State / Province" / "Search City" — **NOT a valid accessible name per ARIA spec**

**Result:** Accessible name = NONE for all three inputs.
A screen reader (NVDA, JAWS, VoiceOver) will announce each as: *"edit, blank"* with no contextual label.

---

## Additional Finding: Partial Fix with Quality Defect

The main keyword search input in the same modal has an `aria-label` but with a trailing space:

```html
<!-- input-1126: Main search — PARTIAL (aria-label has trailing space) -->
<input
  id="input-1126"
  type="text"
  placeholder="Search "
  aria-label="Search "
  title=""
  class="vc-input__input"
  tabindex="0"
  data-test-id="search-keyword-input"
>
```

`aria-label="Search "` (with trailing space) — technically provides a name, but the trailing space is a code quality defect suggesting copy-paste or template error. Screen readers may announce "Search" followed by a brief pause. The same trailing space appears in `placeholder="Search "`.

---

## Expected vs Actual Behavior

| Input | Expected | Actual |
|-------|----------|--------|
| Search Country | `aria-label="Search Country"` or `<label>` | No accessible name |
| Search State / Province | `aria-label="Search State / Province"` or `<label>` | No accessible name |
| Search City | `aria-label="Search City"` or `<label>` | No accessible name |
| Main keyword search | Clean `aria-label="Search"` | `aria-label="Search "` (trailing space) |

---

## WCAG Classification

| Criterion | Level | Status | Finding |
|-----------|-------|--------|---------|
| 1.3.1 Info and Relationships | A | FAIL | Filter inputs have no programmatic label — relationship between placeholder text and input is visual-only |
| 3.3.2 Labels or Instructions | A | FAIL | Three inputs have no labels or instructions presented to assistive technology |
| 4.1.2 Name, Role, Value | A | FAIL | Custom `vc-input` component exposes `name=""` (empty), `role="textbox"`, `value=""` — name is empty string |

All three are Level A violations — the minimum WCAG conformance level. This makes the feature inaccessible to screen reader users, which is a **legal compliance risk**.

---

## Affected Component

- **Component:** `VcInput` atom (Storybook: VcInput stories)
- **Usage context:** `facet-filter-dropdown__search` inside BOPIS "Pick points" modal
- **Modal trigger path:** Cart page → Pickup delivery tab → `.vc-address-selection` edit button
- **Dialog:** `role="dialog"` aria-labelled "Pick points"

---

## Recommended Fix

For each filter search input inside the BOPIS modal, add an explicit `aria-label` matching the placeholder text:

```html
<!-- Country filter search -->
<input aria-label="Search Country" placeholder="Search Country" ... />

<!-- State/Province filter search -->
<input aria-label="Search State / Province" placeholder="Search State / Province" ... />

<!-- City filter search -->
<input aria-label="Search City" placeholder="Search City" ... />

<!-- Main search — fix trailing space -->
<input aria-label="Search" placeholder="Search" ... />
```

The fix should be applied in the `VcInput` component or in the `facet-filter-dropdown` component that wraps it — whichever receives the `placeholder` prop. The `aria-label` value should be derived from the same prop as `placeholder` to keep them in sync.

---

## Evidence Files

| File | Description |
|------|-------------|
| `tests/Sprint-current/VCST-4705/screenshots/step1-catalog-page.png` | Storefront catalog page |
| `tests/Sprint-current/VCST-4705/screenshots/step1-add-to-cart.png` | Product added to cart |
| `tests/Sprint-current/VCST-4705/screenshots/step2-cart-page.png` | Cart page with Pickup tab |
| `tests/Sprint-current/VCST-4705/screenshots/step2-pickup-tab-clicked.png` | Pickup tab selected, address selection visible |
| `tests/Sprint-current/VCST-4705/screenshots/step3-bopis-modal-cart.png` | "Pick points" modal open from cart |
| `tests/Sprint-current/VCST-4705/screenshots/step3-pick-points-modal-inputs.png` | Filter inputs in modal |
| `tests/Sprint-current/VCST-4705/screenshots/step3-pick-points-modal-top.png` | Modal top / dialog heading |

---

## Verdict

FAIL — WCAG 2.1 Level A violation (3 criteria). Escalation required per accessibility policy (WCAG Critical — legal compliance risk). Bug confirmed reproduced via the cart BOPIS pickup modal path.
