# Bug Investigation: Configurable Products Required Section Bypass

**Date:** 2026-03-24
**Investigator:** qa-testing-expert (playwright-chrome)
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Storefront Version:** 2.44.0-pr-2212-9072-9072853e
**Browser:** Chromium (Playwright MCP)
**Account:** Agent Chrome (logged in)

---

## Summary

User reported that the `+` (add to cart / quantity increment) button is ALWAYS available on configurable products with required sections, even when those sections are not filled. Investigation confirmed a **UX-level issue** where the quantity counter increments locally despite validation preventing the actual add-to-cart. The item is NOT added to cart -- validation works correctly on the API side.

**Verdict: Not a validation bypass. UX/cosmetic issue -- Medium severity.**

---

## Per-Section-Type Behavior Matrix

| Test | Product | Section Type | Required? | Auto-selected? | `+` Button State | Counter Increments? | Toast Error? | Item Added to Cart? |
|------|---------|-------------|-----------|----------------|------------------|--------------------|--------------|--------------------|
| 1 | Hoodie Base (physical-1703) | File | Yes | N/A (no file uploaded) | **Enabled** | Yes (0->1->2) | Yes | **No** |
| 2 | Custom T-shirt | Product (radio) | Yes | **Yes** (first option) | Enabled | Yes (0->1) | No | **Yes** |
| 3 | Engraved Ring (seeded) | Text | Yes | N/A (empty text) | **Enabled** | Yes (0->1->2) | Yes | **No** |
| 4 | Checkout Bike (seeded) | Product (radio) | Yes | **Yes** (first option) | Enabled | Yes (0->1) | No | **Yes** |
| 5 | Laptop (seeded) | Product (radio, x2) | Yes (both) | **Yes** (both auto-select) | Enabled | Yes (0->1) | No | **Yes** |

---

## Detailed Findings

### Test 1: Required FILE Section -- `physical-1703`

**Product:** Hoodie Base product with only File req (SKU: OSW-31158373)
**URL:** `/products-with-options/configurable-caps-shirts/physical-1703`
**Section:** "only File req *" -- requires file upload (DOC, RTF, DOCX, TXT, PDF, XLS, XLSX, JPG, PNG, ODT; max 9.5MB, max 5 files)

**Initial state:**
- Section shows red warning: "Complete all required options to finalize your selection"
- Quantity counter: 0
- `+` button: **Enabled** (not disabled)
- `-` button: Disabled (at 0)
- No file uploaded

**After clicking `+` (no file uploaded):**
- Counter incremented: 0 -> 1
- Section warning changed to: **"Section is required"** (red text)
- Toast notification appeared: **"Sorry, this product cannot be added to cart. Check your product configuration"**
- Cart badge in header: **No change** (no count added)
- `-` button became enabled

**After clicking `+` again:**
- Counter incremented: 1 -> 2
- Same toast appeared again
- Cart still unchanged

**Cart page verification:** Cart is empty -- item was NOT added.

**After page revisit:** Counter resets to 0 (local state only, not persisted).

**Evidence:** Screenshots `test1-initial-state.png`, `test1-after-click-plus.png`, `test1-cart-empty.png`

---

### Test 2: Required PRODUCT Section (Radio) -- Custom T-shirt

**Product:** Custom T-shirt (SKU: AAW-59914334)
**URL:** `/products-with-options/configurable-caps-shirts/custom-t-shirt`
**Section:** "Choose basic T-short *" -- required Product section with 4 radio options

**Initial state:**
- First option **auto-selected**: "Red Basic Men T-shirt" ($10.00, qty 2)
- Section header shows product name (no "required" warning)
- Three optional sections visible: "Select print", "For couples", "Upload your picture"
- Price: $32.00 (base + selected option)

**After clicking `+`:**
- Counter: 0 -> 1
- **No error toast** -- item added successfully
- Cart badge updated to "1"
- "1 in Cart" indicator appeared in sidebar

**Conclusion:** Radio-based Product sections auto-select the first option, so the required constraint is always satisfied on page load. No validation issue possible.

---

### Test 3: Required TEXT Section -- Engraved Ring (seeded)

**Product:** AGENT-TEST-Config-Engraved-Ring-20260324 (SKU: AGENT-TEST-RING-TXT-CFG-20260324)
**URL:** `/products-with-options/configurations/agent-test-config-engraved-ring-20260324`
**Section:** "Engraving Text *" -- required Text section with text input

**Initial state:**
- Section shows red warning: "Complete all required options to finalize your selection"
- Text input empty: "Enter custom text" placeholder
- Quantity: 0, `+` enabled

**After clicking `+` (no text entered):**
- Counter: 0 -> 1
- Warning changed to: "Section is required"
- Toast: "Sorry, this product cannot be added to cart. Check your product configuration"
- Cart badge unchanged (still "1" from Test 2)

**After clicking `+` again:**
- Counter: 1 -> 2
- Same toast repeated
- Cart still unchanged

**Conclusion:** Same behavior as File-required. Validation blocks the add-to-cart API call, but the counter increments locally.

---

### Test 4: Required PRODUCT Section (Radio) -- Checkout Bike (seeded)

**Product:** AGENT-TEST-Config-Checkout-Bike-20260324 (SKU: AGENT-TEST-BIKE-CHK-CFG-20260324)
**URL:** `/products-with-options/configurations/agent-test-config-checkout-bike-20260324`
**Section:** "Wheels *" -- required Product section with 2 radio options

**Initial state:**
- First option **auto-selected**: "AGENT-TEST-Config-Checkout-Sport-Wheels-20260324" ($50.00)
- Second option available: "AGENT-TEST-Config-Checkout-Std-Wheels-20260324" ($0.00)
- No "required" warning (constraint already satisfied)

**After clicking `+`:**
- Item added to cart successfully
- Cart badge: 1 -> 2
- "1 in Cart" indicator appeared

**Deselection test:** Radio buttons cannot be deselected -- clicking one simply switches to another. Required Product sections with radio UI can never be "unfilled".

---

### Test 5: Multi-required PRODUCT Sections (Radio) -- Laptop (seeded)

**Product:** AGENT-TEST-Config-Laptop-20260324 (SKU: AGENT-TEST-LAPTOP-CFG-20260324)
**URL:** `/products-with-options/configurations/agent-test-config-laptop-20260324`
**Sections:** "RAM *" (3 options) and "Storage *" (auto-selected, collapsed)

**Initial state:**
- RAM: auto-selected "AGENT-TEST-Config-Laptop-16GB-20260324" ($100.00)
- Storage: auto-selected "AGENT-TEST-Config-Laptop-256GB-20260324" (collapsed, showing name in header)
- Price: $1,099.00

**After clicking `+`:**
- Item added to cart successfully
- Cart badge: 2 -> 3
- "1 in Cart" indicator appeared

**Conclusion:** Multiple radio-based Product required sections all auto-select, so the product is always in a valid state on load.

---

## Answers to Key Questions

### 1. Does the `+` button EVER get disabled for required sections?
**No.** The `+` button is always enabled regardless of section completion state. It is only disabled for the `-` button when quantity is 0. The `+` button does not consider configuration validity.

### 2. Is the "warning" a blocking dialog or just a toast notification?
**Toast notification only.** The message "Sorry, this product cannot be added to cart. Check your product configuration" appears as an auto-dismissible toast in the bottom-right corner. It is NOT a modal/blocking dialog. Users can keep clicking and keep incrementing the counter.

### 3. Does the cart counter actually increment before validation?
**Yes.** The local quantity spinner increments immediately on click, BEFORE the add-to-cart API validation. This is the core UX issue -- the counter shows a number that does not match reality.

### 4. Does an item end up in the cart even when required sections are unfilled?
**No.** Validation works correctly server-side. The add-to-cart mutation either fails or is not sent, and the cart is not modified. Verified by navigating to `/cart` -- only validly configured items appear.

### 5. Is there a difference between File-required, Text-required, and Product-required behavior?
**Yes, significant difference:**

| Section Type | Can Be "Unfilled" on Load? | Validation Blocks Add-to-Cart? | UX Counter Bug? |
|-------------|---------------------------|-------------------------------|-----------------|
| **File** (upload required) | Yes -- no file uploaded | Yes -- blocked correctly | **Yes** -- counter increments |
| **Text** (input required) | Yes -- empty text field | Yes -- blocked correctly | **Yes** -- counter increments |
| **Product** (radio required) | **No** -- first option auto-selected | N/A -- always valid | No bug (always adds) |

---

## Network Evidence

- All GraphQL requests returned HTTP 200 (GraphQL uses 200 even for errors)
- No `addConfiguredLineItem` or `addItemToCart` mutation was observed in the network log after clicking `+` on unfilled required sections
- The toast error appears to be a client-side validation response, preventing the API call from being made
- No console errors or warnings related to the validation flow
- One unrelated error: `Failed to load resource: the server responded with a status of 404` for a product image (BrownJeans_md.png)

---

## CFG-E2E-018 Test Case Reassessment

The earlier PASS verdict for CFG-E2E-018 needs qualification:

- If the test case acceptance criteria was "item should NOT be added to cart" -- **PASS is correct** (validation prevents cart addition)
- If the test case acceptance criteria was "the + button should be disabled when required sections are unfilled" -- **FAIL** (the button is always enabled)
- If the test case acceptance criteria was "the quantity counter should not increment when validation fails" -- **FAIL** (counter increments regardless)

**Recommendation:** Mark CFG-E2E-018 as requiring clarification of acceptance criteria. The functional validation (preventing cart addition) works, but the UX behavior (counter incrementing, button not disabled) is misleading.

---

## Severity Assessment

### Primary Bug: Quantity counter increments when add-to-cart is blocked by required section validation

**Category:** UX/Visual -- misleading UI state
**Severity:** **Medium (P2)**
**Priority:** Medium

**Rationale:**
- **Not P0/P1** because: No actual data corruption occurs. Items are not added to cart. No revenue impact. Server-side validation works correctly.
- **Medium rather than Low** because: The incrementing counter is actively misleading. Users may believe they have added items when they have not. The repeated toast notification without counter reset creates confusion. On repeated clicks, the counter can reach arbitrarily high numbers (tested up to 2), making the UX progressively more confusing.

### Secondary Issue: `+` button never disabled for incomplete required configuration

**Category:** UX/Visual -- missing disabled state
**Severity:** **Low (P3)**
**Priority:** Low

**Rationale:** While it would be better UX to disable the `+` button until all required sections are filled, the current behavior (enabled button + toast error) is a defensible design choice. Many e-commerce platforms use this "try and fail" pattern rather than preventive disabling.

---

## Recommendations

1. **Counter should not increment when validation fails.** When the add-to-cart is blocked by required section validation, the quantity spinner should remain at its previous value (0 or whatever it was).

2. **Consider disabling `+` button** when required sections are unfilled. This would follow the pattern already used for the `-` button (disabled at quantity 0) and the "Place Order" button (disabled until all required checkout fields are filled).

3. **Scroll to the first unfilled required section** when `+` is clicked with incomplete configuration, rather than only showing a toast. This would help users understand what they need to complete.

4. **Update CFG-E2E-018** to explicitly test both the functional validation (item not added) and the UX behavior (counter state, button state). Consider splitting into separate test cases.

---

## Teardown

- Cart cleared (confirmed empty)
- No test entities created that need deletion
- Browser session active (playwright-chrome)
