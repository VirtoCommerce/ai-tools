# VCST-4713: Wedding Cake Conditional Sections Investigation

**Product:** Sections with conditions Wedding cake (SKU: YOC-85609878)
**URL:** `https://vcst-qa-storefront.govirto.com/products-with-options/wedding-cakes/sections-with-conditions-wedding-cake`
**Configurable Product ID:** `f4f27033-d688-4d22-ade7-5106f4748add`
**Browser:** Firefox (playwright-firefox) | **Environment:** QA | **Date:** 2026-04-13

---

## Section Configuration (from GetProductConfigurations)

| # | Name | ID | Type | isRequired | dependsOnSectionId | Initially Visible? | Has Predefined Options? |
|---|------|-----|------|------------|-------------------|---------------------|------------------------|
| 1 | Base | `ef19c414-1172-4ad3-a6c6-1e5dec515474` | Product | true | null | Yes | Yes (2 products) |
| 2 | Creme | `5f93bee5-6913-4e63-9a60-14b3718029a8` | Product | false | `ef19c41...` (Base) | Yes (collapsed) | Yes (4 products + None) |
| 3 | Message | `19e27d3a-77e8-4b9e-b546-860f58b1a46a` | Product | false | `5f93bee...` (Creme) | No (appears after Creme selected) | Yes (2 products + None) |
| 4 | Custom text required | `a251777f-654b-43aa-8074-5b5820f48fb4` | Text | **true** | `19e27d3...` (Message) | No (appears after Message selected) | **No (text-only)** |
| 5 | Image | `7ebe866a-4385-40f2-8e22-d8257d0c87e6` | File | false | `19e27d3...` (Message) | No (appears after Message selected) | No (file upload) |

Dependency chain: Base -> Creme -> Message -> Custom text required / Image

---

## Per-Step Observations

### Step 1-2: Navigation & Authentication
- PDP loaded successfully. Already authenticated as "Agent Firefox" (Emily Johnson / TechFlow org).
- No console errors (0 errors, 4 warnings on load).

### Step 3: Initial State
- **Base** section expanded, "Top: White / Bottom: White" pre-selected (radio checked).
- **Creme** section visible but collapsed, no option selected (None by default).
- **Message**, **Custom text required**, **Image** sections NOT visible (conditional on parent).
- Price: $85.00 (sale) / $88.00 (list).
- `CreateConfiguredLineItem` mutation fires on page load with Base only (price preview).

### Step 4: Select Base through Creme
- Base: kept default "Top: White / Bottom: White" ($6.00).
- Clicked Creme section to expand. Selected "Buttercreme style: Peach and Blue" ($8.00).
- **Message** section appeared (conditional dependency satisfied).
- Price updated to $93.00 / $96.00 (+$8.00 from Creme).
- `CreateConfiguredLineItem` mutation fired with Base + Creme sections (price preview).

### Step 5: Add to Cart

**Mutation:** `AddItem`
```json
{
  "productId": "f4f27033-d688-4d22-ade7-5106f4748add",
  "quantity": 1,
  "configurationSections": [
    { "sectionId": "ef19c414-...", "type": "Product", "option": { "productId": "47038500-...", "quantity": 1 } },
    { "sectionId": "5f93bee5-...", "type": "Product", "option": { "productId": "15b9f199-...", "quantity": 1 } }
  ]
}
```
**Response:** HTTP 200, no errors. Cart lineItemId: `5d284520-518c-4874-88d4-845da29cd565`. itemsQuantity: 1.
**Cart badge:** Updated to "1".
**URL changed to:** `?lineItemId=5d284520-...` (edit mode).
**Button changed:** "Add to cart" -> "Update cart".
**Additional UI:** "in Cart: 1" indicator, "Create new configuration" link appeared.

### Step 6: Stayed on PDP (did not navigate)

### Step 7: Select Message option
- Expanded Message section. Selected "Standard Message Tag (max. 25 alphanumeric)" ($12.00) via radio click.
- **Custom text required** and **Image** sections appeared (conditional on Message).
- Price updated to $105.00 / $108.00 (+$12.00 from Message).
- Toast notification: "The product configuration has been changed. You can always save it later by clicking 'Update cart' button."
- `CreateConfiguredLineItem` price-preview mutation fired with Base + Creme + Message (3 sections).
- **"Custom text required" section showed validation error: "Section is required".**

### Step 8: Cleared mutation log

### Step 9: Click "Update cart"
- Clicked "Update cart" button.
- **No `ChangeCartConfiguredLineItem` or update mutation fired.**
- The button click appeared to trigger form validation which **blocked** the mutation because "Custom text required" (isRequired: true) section was empty.
- The page reloaded but the cart was NOT updated.

### Step 10: Cart Verification
- Navigated to `/cart` to verify.
- Cart shows 1 line item at $93.00 (original Base + Creme price, NO Message).
- Components list: "1. Buttercreme style: Peach and Blue, 2. Top: White / Bottom: White".
- Message is **NOT** in the cart -- confirming Update cart was blocked.

---

## Diagnosis

The "Update cart" button did NOT fire a `ChangeCartConfiguredLineItem` mutation or any cart-update mutation. The update was **blocked by client-side validation** because:

1. Selecting a **Message** option causes the **"Custom text required"** section to become visible.
2. That section has `isRequired: true` and `type: Text` with zero predefined options.
3. Since no custom text was entered, validation prevents the update.

**This is NOT a duplicate-line-item bug.** The `ChangeCartConfiguredLineItem` mutation was never fired (neither was `AddItem` or `CreateConfiguredLineItem` as a cart mutation). The validation correctly prevented an incomplete configuration from being saved.

---

## Findings

| # | Finding | Classification | Severity |
|---|---------|---------------|----------|
| 1 | Selecting Message triggers mandatory "Custom text required" section that blocks Update cart until text is entered | **Observation** | N/A -- by design |
| 2 | The `CreateConfiguredLineItem` mutation fires as a price-preview on every radio selection (client-side only, does not modify cart) | **Observation** | N/A |
| 3 | No `ChangeCartConfiguredLineItem` mutation fires when "Update cart" is clicked with incomplete required sections -- validation blocks it silently (no visible error toast/banner on the button area) | **Question** | Medium -- UX could be clearer |
| 4 | When "Update cart" is clicked with validation errors, the button does not show a clear error state or scroll to the problematic section | **Risk** | Low -- user might not realize why update failed |
| 5 | The conditional dependency chain (Base -> Creme -> Message -> Custom text/Image) works correctly -- sections appear/disappear as expected | **Observation** | N/A -- working as designed |
| 6 | Price updates are correct at each step: base $85, +Creme $93, +Message $105 | **Observation** | N/A -- correct |
| 7 | `AddItem` mutation (initial add) correctly includes only selected sections and omits unselected optional ones | **Observation** | N/A -- correct |

---

## Mutation Summary

| Step | Mutation | Sections Included | Cart Effect | HTTP |
|------|---------|-------------------|-------------|------|
| Page load | `CreateConfiguredLineItem` | Base only | None (preview) | 200 |
| Select Creme | `CreateConfiguredLineItem` | Base + Creme | None (preview) | 200 |
| Add to cart | `AddItem` | Base + Creme | Created lineItem `5d2845...` | 200 |
| Select Message | `CreateConfiguredLineItem` | Base + Creme + Message | None (preview) | 200 |
| Click Update cart | **None fired** | -- | **No change** | -- |

---

## Evidence

| File | Description |
|------|-------------|
| `evidence/wedding-cake/01-initial-pdp.png` | Initial PDP with Base section expanded |
| `evidence/wedding-cake/02-base-creme-selected.png` | After selecting Creme (Peach and Blue) |
| `evidence/wedding-cake/03-after-add-to-cart.png` | After Add to cart, showing Update cart button |
| `evidence/wedding-cake/04-message-selected-update-visible.png` | Message selected, Custom text required visible with validation error |
| `evidence/wedding-cake/05-validation-blocked.png` | Full page showing validation state blocking Update cart |
| `evidence/wedding-cake/06-cart-components-list.png` | Cart page with components list (Base + Creme only, no Message) |

---

## Toast-Save vs Main-Update-Cart Button Comparison

**Date:** 2026-04-13 | **Browser:** Firefox (playwright-firefox) | **Authenticated as:** Agent Firefox (Emily Johnson / TechFlow)

### Setup

Starting from a fresh PDP load, selected Base (White/White) + Creme (Peach and Blue), clicked Add to Cart (AddItem mutation, HTTP 200, lineItemId `faa0d3bd-...`). Then selected Message (Standard Message Tag $12) in edit mode. This triggered two things: (a) Custom text required and Image sections appeared, (b) a toast notification appeared.

### Toast Notification Content

> "The product configuration has been changed. You can always save it later by clicking 'Update cart' button."

The toast contains a **Save** button and a Close (X) button. Note: the toast text says "save it later by clicking 'Update cart' button" but paradoxically has its OWN Save button that does something different.

### Button A: Toast "Save" Button

**Action:** Clicked Save inside the toast notification.

**Mutation fired:** `ChangeCartConfiguredItem` (HTTP 200)
- `lineItemId`: `faa0d3bd-3d71-4507-83cc-778fbb8bf938`
- `configurationSections`: 3 sections -- Base (Product), Creme (Product), Message (Product)
- **Custom text required section was NOT included** (empty, but isRequired=true)
- The API accepted and persisted this partial configuration without server-side validation error.

**Post-click behavior:**
- URL changed FROM `?lineItemId=faa0d3bd-...` TO the base URL (no lineItemId) -- **edit mode was exited**
- Button reverted from "Update cart" to "Add to cart"
- Price reverted from $105/$108 to $85/$88 (base price, as if no sections selected)
- All section selections (Creme, Message) were visually cleared -- PDP reset to fresh "new configuration" state
- "in Cart: 1" indicator disappeared; cart badge still shows 1
- 0 console errors

**Cart verification:** Navigated to `/cart`. The line item was updated to $105.00 (including Message). Components list shows: Buttercreme style: Peach and Blue, Top: White / Bottom: White, Standard Message Tag. Warning displayed: **"Required sections are missing"**. Place order button is disabled.

### Button B: Main "Update cart" Button (from earlier run)

**Action:** Clicked Update cart button on the PDP (tested in earlier session, documented above in Steps 8-9).

**Mutation fired:** None. The click was blocked by client-side validation before any network request. The required "Custom text required" section was empty, so the frontend prevented the mutation from firing entirely.

**Post-click behavior:** No URL change, no navigation, no visible error toast/banner near the button. The page remained in edit mode. Cart was NOT updated.

### Comparative Analysis

| Aspect | Toast "Save" | Main "Update cart" |
|--------|-------------|-------------------|
| Mutation fired? | Yes -- `ChangeCartConfiguredItem` | No -- blocked by validation |
| Validation enforced? | NO -- bypasses required-section check | YES -- enforces required sections |
| HTTP response | 200 OK | N/A (no request) |
| Cart updated? | YES -- partial config persisted | NO |
| PDP after click | Reset to fresh state (exits edit mode) | Stays in edit mode |
| User feedback | None (no error, no success toast) | None (silent block) |
| Data integrity | VIOLATED -- required section missing in cart | Preserved |

### Classification

| # | Finding | Classification | Severity |
|---|---------|---------------|----------|
| 1 | **Toast Save bypasses client-side validation** and fires `ChangeCartConfiguredItem` without the required "Custom text required" section | **Bug** | **High (P1)** |
| 2 | **API accepts incomplete configuration** -- `ChangeCartConfiguredItem` returns 200 even when a required Text section is omitted | **Bug** | **High (P1)** -- server should reject or at minimum return a validation warning |
| 3 | **Toast Save exits edit mode and resets PDP** -- after saving, the user loses their lineItemId context and sees a fresh "Add to cart" form, with no indication the save succeeded | **Bug** | **Medium (P2)** -- confusing UX |
| 4 | **Cart enters invalid state** -- "Required sections are missing" warning on cart page, Place order disabled, "Something went wrong" message shown | **Bug consequence** | High -- blocks checkout |
| 5 | **Toast text is misleading** -- says "save it later by clicking 'Update cart' button" but has its own Save button that does something different (and more destructive) | **Bug** | **Medium (P2)** -- UX confusion |
| 6 | Main "Update cart" button correctly enforces validation but provides **no visible error feedback** when blocked | **Risk** | Low (P3) -- documented in earlier findings |

### Root Cause Hypothesis

The toast Save button calls `ChangeCartConfiguredItem` directly using the currently-selected sections without running the same validation logic that the main Update cart button uses. The validation gate (checking all required sections) only exists on the Update cart button's click handler, not on the toast Save handler. After the mutation completes, the frontend navigates to the base PDP URL (removing the lineItemId param), which causes a full PDP re-render in "new configuration" mode rather than staying in edit mode.

### Verdict

The **silent failure is NOT on the main Update cart button** (which correctly blocks the mutation). The bug is on the **toast Save button**, which:
1. Bypasses validation
2. Persists an incomplete/invalid configuration to the cart
3. Exits edit mode without feedback
4. Leaves the cart in a state where checkout is blocked

This is a distinct, reproducible bug isolated to the toast Save button's handler.

### Evidence

| File | Description |
|------|-------------|
| `evidence/toast-test/01-base-creme-selected.png` | PDP after selecting Base + Creme, before Add to cart |
| `evidence/toast-test/02-message-selected-full-page.png` | Full page after Message selected showing toast + Custom text required |
| `evidence/toast-test/03-toast-visible-with-save-button.png` | Viewport showing toast notification and Update cart button simultaneously |
| `evidence/toast-test/04-toast-closeup.png` | Closeup of toast: "configuration has been changed... Save" |
| `evidence/toast-test/05-network-after-toast-save.txt` | Full network log showing ChangeCartConfiguredItem mutation with 3 sections (no Custom text) |
| `evidence/toast-test/06-after-toast-save-reset.png` | PDP after toast Save -- reset to fresh state, "Add to cart" button |
| `evidence/toast-test/07-cart-after-toast-save.png` | Cart page showing $105 price, "Required sections are missing" warning |
| `evidence/toast-test/08-cart-components-expanded.png` | Components list: Base + Creme + Message saved, missing Custom text |
