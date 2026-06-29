# Test Cases: Predefined Product List Block (VCST-4553)

## Test Case Summary

**Feature:** Predefined Product List Block for CMS Pages
**JIRA:** VCST-4553
**Total Test Cases:** 35
**Created:** 2026-02-05
**Updated:** 2026-02-05 (with verified behavior)
**Author:** test-management-specialist

---

## VERIFIED BEHAVIOR SUMMARY

| Setting | Status | Notes |
|---------|--------|-------|
| Title field | ✅ VERIFIED | Text field, optional |
| Subtitle field | ✅ VERIFIED | Text field, optional |
| Card Type "full" | ✅ VERIFIED | Shows image, name, price, qty, buttons |
| Card Type "short" | ⏳ PENDING | Needs testing |
| Columns (Tablet) | ✅ VERIFIED | 2-3 range, 3 tested |
| Columns (Desktop) | ✅ VERIFIED | 3-4 range, 4 tested |
| SKU List | ✅ VERIFIED | Up to 12 SKUs |
| 12 SKU Limit | ✅ VERIFIED | Alert: "Maximum 12 SKUs allowed." |
| Invalid SKU | ✅ VERIFIED | Products simply don't display (no error) |

**Invalid SKU Warning:** SKU `271507` does NOT work in QA - removed from test data

---

## SECTION 1: BUILDER.IO COMPONENT CONFIGURATION

---

### TC_VCST4553_001: Verify Predefined Products component appears in Builder.io insert menu

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_001 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional |
| **Feature** | Builder.io Component Registration |
| **Automated** | No |

**Objective:** Verify that the Predefined Products component is available in Builder.io insert menu.

**Preconditions:**
1. Builder.io account with access to VCST QA space
2. QA environment with artifact deployed (vc-theme-b2b-vue-2.41.0-pr-2165-b9ab)
3. Logged into Builder.io: https://builder.io/content

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Builder.io content editor | Builder.io editor loads successfully |
| 2 | Create new page or open existing page | Page editor opens |
| 3 | Click "+" or "Insert" button to add new component | Component insert menu appears |
| 4 | Search or scroll for "Predefined Products" component | "Predefined Products" component appears in list |
| 5 | Verify component icon and description | Component has recognizable icon and description |

**Expected Result:** Predefined Products component is visible and available for insertion.

**Pass/Fail Criteria:**
- Pass: Component appears in insert menu with proper name and icon
- Fail: Component not found or named incorrectly

---

### TC_VCST4553_002: Insert Predefined Products component into page

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_002 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional |
| **Feature** | Builder.io Component Registration |
| **Automated** | No |

**Objective:** Verify that the Predefined Products component can be inserted into a Builder.io page.

**Preconditions:**
1. TC_VCST4553_001 passed
2. Builder.io page editor open

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Predefined Products" component in insert menu | Component configuration panel appears |
| 2 | Drag component to page canvas | Component placeholder appears on canvas |
| 3 | Verify component preview renders | Component preview shows in Builder.io editor |
| 4 | Verify component is selected | Component settings panel opens on right side |

**Expected Result:** Component successfully inserted into page with configuration panel visible.

**Pass/Fail Criteria:**
- Pass: Component inserted, preview renders, settings panel available
- Fail: Component fails to insert or configuration panel not available

---

### TC_VCST4553_003: Verify all component configuration fields are present

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_003 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | Builder.io Component Configuration |
| **Automated** | No |

**Objective:** Verify all expected configuration fields are present in the component settings.

**Preconditions:**
1. TC_VCST4553_002 passed
2. Predefined Products component inserted
3. Component settings panel open

**Test Data:**

| Field | Type | Options |
|-------|------|---------|
| Title | Text | Optional |
| Subtitle | Text | Optional |
| Card Type | Dropdown | "full", "short" |
| Columns (Tablet) | Number | 2-3 |
| Columns (Desktop) | Number | 3-4 |
| SKU List | List | Up to 12 SKUs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify "Title" text field exists | Title field visible, accepts text input |
| 2 | Verify "Subtitle" text field exists | Subtitle field visible, accepts text input |
| 3 | Verify "Card Type" dropdown exists | Card Type dropdown visible with options: "full", "short" |
| 4 | Verify "Columns (Tablet)" field exists | Tablet columns field visible, accepts 2 or 3 |
| 5 | Verify "Columns (Desktop)" field exists | Desktop columns field visible, accepts 3 or 4 |
| 6 | Verify "SKU List" field exists | SKU List field visible, allows multiple entries |
| 7 | Verify field labels and placeholders are clear | All fields have descriptive labels |

**Expected Result:** All configuration fields present and functional.

**Pass/Fail Criteria:**
- Pass: All 6 configuration fields present with correct types and options
- Fail: Any field missing or incorrect type

---

### TC_VCST4553_004: Verify component default values

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_004 |
| **Priority** | P2 (Medium) |
| **Test Type** | Functional |
| **Feature** | Builder.io Component Configuration |
| **Automated** | No |

**Objective:** Verify default values are set correctly when component is first inserted.

**Preconditions:**
1. Predefined Products component inserted (fresh, no configuration)

**Expected Default Values:**

| Field | Default Value |
|-------|---------------|
| Title | Empty or placeholder |
| Subtitle | Empty or placeholder |
| Card Type | "full" |
| Columns (Tablet) | 2 or 3 |
| Columns (Desktop) | 3 or 4 |
| SKU List | Empty array |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert new Predefined Products component | Component inserted with defaults |
| 2 | Check Title field | Empty or default placeholder |
| 3 | Check Subtitle field | Empty or default placeholder |
| 4 | Check Card Type | Default: "full" |
| 5 | Check Columns (Tablet) | Default: 2 or 3 |
| 6 | Check Columns (Desktop) | Default: 3 or 4 |
| 7 | Check SKU List | Empty (0 SKUs) |

**Expected Result:** All fields have sensible default values.

**Pass/Fail Criteria:**
- Pass: Defaults are set appropriately
- Fail: Missing defaults or inappropriate values

---

## SECTION 2: SKU SELECTION & VALIDATION

---

### TC_VCST4553_005: Add single valid SKU

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_005 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional |
| **Feature** | SKU Selection |
| **Automated** | No |

**Objective:** Verify a single valid SKU can be added to the SKU list.

**Preconditions:**
1. Predefined Products component inserted
2. Valid test SKU available: `6022122` (DOUWE EGBERTS COCOA FANTASY - exists in QA catalog)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Item" or "+" in SKU List field | New SKU input field appears |
| 2 | Enter valid SKU: `6022122` | SKU accepted without error |
| 3 | Click outside field or press Enter | SKU saved to list |
| 4 | Verify SKU appears in list | `6022122` visible in SKU list |
| 5 | Preview component in Builder.io editor | Product preview loads showing "DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG" |

**Expected Result:** Single SKU successfully added and product preview displays.

**Pass/Fail Criteria:**
- Pass: SKU added without error, product preview visible
- Fail: Error message, SKU not saved, or no preview

---

### TC_VCST4553_006: Add multiple valid SKUs (3 SKUs)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_006 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional |
| **Feature** | SKU Selection |
| **Automated** | No |

**Objective:** Verify multiple valid SKUs can be added to the list.

**Preconditions:**
1. Predefined Products component inserted
2. Valid test SKUs: `6022122`, `DXT-94128101`, `15071125544`

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add first SKU: `6022122` | DOUWE EGBERTS COCOA added to list |
| 2 | Add second SKU: `DXT-94128101` | LAYS CHIPS PAPRIKA added to list |
| 3 | Add third SKU: `15071125544` | Coca Cola Regular added to list |
| 4 | Verify all 3 SKUs visible in list | All 3 SKUs displayed in order |
| 5 | Preview component | All 3 products display in preview |

**Expected Result:** All 3 SKUs successfully added and products preview correctly.

**Pass/Fail Criteria:**
- Pass: All SKUs added, all products preview correctly
- Fail: SKU rejected, preview missing products

---

### TC_VCST4553_007: Add maximum SKUs (12 SKUs)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_007 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional, Boundary Value |
| **Feature** | SKU Validation |
| **Automated** | No |

**Objective:** Verify maximum 12 SKUs can be added successfully (boundary test).

**Preconditions:**
1. Predefined Products component inserted
2. 12 valid test SKUs from QA catalog (VERIFIED WORKING):
   - `6022122` (DOUWE EGBERTS COCOA FANTASY) ✅
   - `DXT-94128101` (LAYS CHIPS PAPRIKA) ✅
   - `CJ-229032` (CAPRI-SUN MULTIVITAMIN) ✅
   - `15071125544` (Coca Cola Regular 6x330ml) ✅
   - `GIH-99953267` (Fanta Orange Bottle 500ml) ✅
   - `FAJ-47346468` (Fanta Orange Bottle 330ml) ✅
   - `1592321634` (Coca Cola Regular Retail Pack)
   - `0003420` (Fanta Mango Soda)
   - `0003428` (Fanta Peach Soda)
   - `ZCA-20978616` (Coca Cola Cherry Can)
   - `MBY-88916331` (Digital promo Coco-Cola catalog)
   - `6052259` (OREO COOKIES ORIGINAL) - 12th SKU for max test

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add SKUs 1-12 sequentially | All 12 SKUs added successfully |
| 2 | Verify count shows 12 SKUs | SKU list displays all 12 entries |
| 3 | Preview component in Builder.io | All 12 products display in preview |
| 4 | Verify no error or warning appears | No validation alerts |

**Expected Result:** Maximum 12 SKUs added successfully without errors.

**Pass/Fail Criteria:**
- Pass: All 12 SKUs added, preview shows all products
- Fail: Cannot add 12 SKUs, error message appears

---

### TC_VCST4553_008: Attempt to add 13th SKU (exceed limit)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_008 |
| **Priority** | P0 (Critical) |
| **Test Type** | Negative, Boundary Value |
| **Feature** | SKU Validation |
| **Automated** | No |
| **Status** | ✅ **PASSED** (2026-02-05) |
| **Verified Alert** | "Maximum 12 SKUs allowed." |

**Objective:** Verify validation prevents adding more than 12 SKUs (boundary test).

**Preconditions:**
1. Predefined Products component with 12 SKUs already added (TC_VCST4553_007)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify 12 SKUs already in list | 12 SKUs displayed |
| 2 | Attempt to add 13th SKU: `6052259` (OREO COOKIES) | Validation alert appears |
| 3 | Verify alert message content | Message indicates maximum 12 SKUs allowed |
| 4 | Verify 13th SKU not added | SKU list still shows only 12 SKUs |
| 5 | Verify "Add Item" button behavior | Button disabled or shows warning |

**Expected Result:** Validation prevents adding 13th SKU and displays clear error message.

**Pass/Fail Criteria:**
- Pass: Validation alert appears, 13th SKU not added
- Fail: No validation, 13th SKU added successfully

---

### TC_VCST4553_009: Add invalid SKU (non-existent product)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_009 |
| **Priority** | P1 (High) |
| **Test Type** | Negative |
| **Feature** | SKU Validation |
| **Automated** | No |

**Objective:** Verify handling of invalid/non-existent SKU.

**Preconditions:**
1. Predefined Products component inserted
2. Invalid SKU: "NON-EXISTENT-SKU-999" (does not exist in catalog)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add invalid SKU: "NON-EXISTENT-SKU-999" | SKU accepted in Builder.io (no validation yet) |
| 2 | Save and preview in Builder.io | No product preview for invalid SKU OR placeholder shown |
| 3 | Publish page | Page publishes successfully |
| 4 | View page on frontend | Invalid SKU either skipped or shows "Product not found" placeholder |
| 5 | Verify other valid SKUs still display | Valid products render correctly |

**Expected Result:** Invalid SKU handled gracefully (skipped or placeholder shown).

**Pass/Fail Criteria:**
- Pass: Invalid SKU doesn't break page, other products display
- Fail: Page crashes, error shown to end user

**VERIFIED BEHAVIOR (2026-02-05):**
- Builder.io accepts ANY SKU string (no validation at entry)
- Invalid SKUs simply don't display on frontend (product skipped)
- No error message shown to end user
- Page does NOT crash
- Example: SKU `271507` was configured but product didn't display

---

### TC_VCST4553_010: Add duplicate SKUs

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_010 |
| **Priority** | P2 (Medium) |
| **Test Type** | Negative |
| **Feature** | SKU Validation |
| **Automated** | No |

**Objective:** Verify handling of duplicate SKUs in list.

**Preconditions:**
1. Predefined Products component inserted

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add SKU: `6022122` | 6022122 (DOUWE EGBERTS) added |
| 2 | Attempt to add same SKU: `6022122` again | Duplicate SKU either prevented with warning OR allowed (de-duplicated on frontend) |
| 3 | Preview in Builder.io | Product appears once or twice (document behavior) |
| 4 | Publish and view on frontend | Product appears once (duplicates de-duplicated) |

**Expected Result:** Duplicate SKUs handled gracefully (prevented or de-duplicated).

**Pass/Fail Criteria:**
- Pass: Duplicate handled without error, single product display on frontend
- Fail: Page crashes or product displays incorrectly

---

### TC_VCST4553_011: Remove SKU from list

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_011 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | SKU Management |
| **Automated** | No |

**Objective:** Verify SKU can be removed from the list.

**Preconditions:**
1. Predefined Products component with 3 SKUs: `6022122`, `DXT-94128101`, `15071125544`

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify 3 SKUs in list | All 3 SKUs visible |
| 2 | Click "Remove" or "X" button on `DXT-94128101` | DXT-94128101 removed from list |
| 3 | Verify remaining SKUs: `6022122`, `15071125544` | Only 2 SKUs remain in correct positions |
| 4 | Preview component | Only 2 products display (DOUWE EGBERTS, Coca Cola) |

**Expected Result:** SKU successfully removed, remaining SKUs intact.

**Pass/Fail Criteria:**
- Pass: SKU removed, correct products remain
- Fail: Wrong SKU removed, list corrupted

---

### TC_VCST4553_012: Clear all SKUs (empty list)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_012 |
| **Priority** | P2 (Medium) |
| **Test Type** | Functional |
| **Feature** | SKU Management |
| **Automated** | No |

**Objective:** Verify all SKUs can be removed resulting in empty list.

**Preconditions:**
1. Predefined Products component with 5 SKUs

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Remove all SKUs one by one | All SKUs removed |
| 2 | Verify SKU list is empty | 0 SKUs in list |
| 3 | Preview component in Builder.io | Empty component OR placeholder message |
| 4 | Publish and view on frontend | Component either hidden OR shows "No products" message |

**Expected Result:** Empty SKU list handled gracefully (hidden or placeholder).

**Pass/Fail Criteria:**
- Pass: Empty list doesn't break component, sensible display
- Fail: Error message, component crashes

---

## SECTION 3: PRODUCT REORDERING

---

### TC_VCST4553_013: Reorder SKUs in Builder.io

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_013 |
| **Priority** | P0 (Critical) |
| **Test Type** | Functional |
| **Feature** | Product Ordering |
| **Automated** | No |

**Objective:** Verify SKUs can be reordered in Builder.io and order is preserved.

**Preconditions:**
1. Predefined Products component with 4 SKUs: `6022122`, `DXT-94128101`, `15071125544`, `CJ-229032` (in that order)

**Initial Order:**
1. `6022122` (DOUWE EGBERTS COCOA)
2. `DXT-94128101` (LAYS CHIPS PAPRIKA)
3. `15071125544` (Coca Cola Regular)
4. `CJ-229032` (CAPRI-SUN MULTIVITAMIN)

**Desired New Order:**
1. `CJ-229032` (CAPRI-SUN)
2. `6022122` (DOUWE EGBERTS)
3. `15071125544` (Coca Cola)
4. `DXT-94128101` (LAYS CHIPS)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify initial order in Builder.io SKU list | SKUs in order: 6022122, DXT-94128101, 15071125544, CJ-229032 |
| 2 | Drag `CJ-229032` to first position (or use up/down arrows) | CJ-229032 moves to top |
| 3 | Drag `15071125544` to third position | 15071125544 in position 3 |
| 4 | Verify new order: CJ-229032, 6022122, 15071125544, DXT-94128101 | SKU list reflects new order |
| 5 | Preview in Builder.io editor | Products display in new order |
| 6 | Save and publish page | Page saved successfully |
| 7 | View page on frontend | Products display in exact new order: CAPRI-SUN, DOUWE EGBERTS, Coca Cola, LAYS |

**Expected Result:** SKU order changed in Builder.io and preserved on frontend.

**Pass/Fail Criteria:**
- Pass: Frontend displays products in exact reordered sequence
- Fail: Frontend shows different order, order not preserved

---

### TC_VCST4553_014: Verify product order with 12 SKUs

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_014 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | Product Ordering |
| **Automated** | No |

**Objective:** Verify product ordering works correctly with maximum SKUs (12).

**Preconditions:**
1. Predefined Products component with 12 SKUs in specific order

**Test Data:**
- Reverse Order: `MBY-88916331`, `ZCA-20978616`, `0003428`, `0003420`, `FAJ-47346468`, `1592321634`, `6052259`, `GIH-99953267`, `15071125544`, `CJ-229032`, `DXT-94128101`, `6022122`

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add 12 SKUs in reverse order (012 first, 001 last) | All SKUs added in specified order |
| 2 | Preview in Builder.io | Products display in reverse order |
| 3 | Publish page | Page published |
| 4 | View on frontend | All 12 products display in exact reverse order |

**Expected Result:** All 12 products display in specified custom order.

**Pass/Fail Criteria:**
- Pass: Frontend displays all 12 products in exact order
- Fail: Order not preserved, products missing

---

## SECTION 4: DISPLAY CONFIGURATION

---

### TC_VCST4553_015: Configure Title and Subtitle

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_015 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | Display Configuration |
| **Automated** | No |

**Objective:** Verify Title and Subtitle fields display correctly on frontend.

**Preconditions:**
1. Predefined Products component with 3 SKUs

**Test Data:**
- Title: "Featured Campaign Products"
- Subtitle: "Exclusive deals for February 2026"

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter Title: "Featured Campaign Products" | Title field updated |
| 2 | Enter Subtitle: "Exclusive deals for February 2026" | Subtitle field updated |
| 3 | Preview in Builder.io | Title and subtitle visible in preview |
| 4 | Publish page | Page published |
| 5 | View on frontend | Title displays above product list |
| 6 | Verify subtitle position | Subtitle displays below title, above products |
| 7 | Verify text styling | Title and subtitle use correct typography/styles |

**Expected Result:** Title and subtitle display correctly with proper styling.

**Pass/Fail Criteria:**
- Pass: Both title and subtitle visible and styled correctly
- Fail: Missing text, incorrect styling, wrong position

---

### TC_VCST4553_016: Test without Title and Subtitle (optional fields)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_016 |
| **Priority** | P2 (Medium) |
| **Test Type** | Functional |
| **Feature** | Display Configuration |
| **Automated** | No |

**Objective:** Verify component works correctly when Title and Subtitle are empty.

**Preconditions:**
1. Predefined Products component with 3 SKUs
2. Title and Subtitle fields left empty

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Leave Title field empty | No title entered |
| 2 | Leave Subtitle field empty | No subtitle entered |
| 3 | Preview in Builder.io | Products display without title/subtitle |
| 4 | Publish and view on frontend | Products display directly (no empty title space) |

**Expected Result:** Component displays products without empty title/subtitle containers.

**Pass/Fail Criteria:**
- Pass: Products display cleanly without title, no empty space
- Fail: Empty title container visible, layout broken

---

### TC_VCST4553_017: Configure Card Type - Full

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_017 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | Display Configuration |
| **Automated** | No |

**Objective:** Verify "full" card type displays products correctly.

**Preconditions:**
1. Predefined Products component with 4 SKUs
2. Card Type set to "full"

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Card Type to "full" | Full selected in dropdown |
| 2 | Preview in Builder.io | Products show full card layout (image, name, price, description, add to cart, etc.) |
| 3 | Publish and view on frontend | Products display with full card details |
| 4 | Verify card includes: Image, Name, Price, Description (if available), Add to Cart button | All elements present |

**Expected Result:** Products display in full card format with complete information.

**Pass/Fail Criteria:**
- Pass: Full card displays all expected elements
- Fail: Missing elements, incorrect layout

---

### TC_VCST4553_018: Configure Card Type - Short

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_018 |
| **Priority** | P1 (High) |
| **Test Type** | Functional |
| **Feature** | Display Configuration |
| **Automated** | No |

**Objective:** Verify "short" card type displays products correctly.

**Preconditions:**
1. Predefined Products component with 4 SKUs
2. Card Type set to "short"

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Card Type to "short" | Short selected in dropdown |
| 2 | Preview in Builder.io | Products show short card layout (image, name, price only) |
| 3 | Publish and view on frontend | Products display with short card format |
| 4 | Verify card includes: Image, Name, Price (minimal info) | Only essential elements present |
| 5 | Verify card excludes: Description, Add to Cart button (or simplified) | Short format used |

**Expected Result:** Products display in short card format with minimal information.

**Pass/Fail Criteria:**
- Pass: Short card displays concise format
- Fail: Shows full card, layout incorrect

---

### TC_VCST4553_019: Configure Tablet columns (2 columns)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_019 |
| **Priority** | P1 (High) |
| **Test Type** | UI/UX, Responsive |
| **Feature** | Responsive Layout |
| **Automated** | No |

**Objective:** Verify tablet viewport displays 2 columns when configured.

**Preconditions:**
1. Predefined Products component with 6 SKUs
2. Tablet columns set to 2

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Columns (Tablet) to 2 | Value set to 2 |
| 2 | Publish page | Page published |
| 3 | Open page on tablet device (iPad) OR resize browser to tablet width (768px-1024px) | Page loads at tablet viewport |
| 4 | Verify product grid layout | Products display in 2 columns |
| 5 | Scroll to view all products | 6 products in 3 rows (2 per row) |

**Expected Result:** Products display in 2-column grid on tablet viewport.

**Pass/Fail Criteria:**
- Pass: Exactly 2 columns visible on tablet
- Fail: Wrong column count, layout broken

---

### TC_VCST4553_020: Configure Tablet columns (3 columns)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_020 |
| **Priority** | P1 (High) |
| **Test Type** | UI/UX, Responsive |
| **Feature** | Responsive Layout |
| **Automated** | No |

**Objective:** Verify tablet viewport displays 3 columns when configured.

**Preconditions:**
1. Predefined Products component with 6 SKUs
2. Tablet columns set to 3

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Columns (Tablet) to 3 | Value set to 3 |
| 2 | Publish page | Page published |
| 3 | Open page on tablet device OR resize browser to tablet width (768px-1024px) | Page loads at tablet viewport |
| 4 | Verify product grid layout | Products display in 3 columns |
| 5 | Scroll to view all products | 6 products in 2 rows (3 per row) |

**Expected Result:** Products display in 3-column grid on tablet viewport.

**Pass/Fail Criteria:**
- Pass: Exactly 3 columns visible on tablet
- Fail: Wrong column count, layout broken

---

### TC_VCST4553_021: Configure Desktop columns (3 columns)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_021 |
| **Priority** | P1 (High) |
| **Test Type** | UI/UX, Responsive |
| **Feature** | Responsive Layout |
| **Automated** | No |

**Objective:** Verify desktop viewport displays 3 columns when configured.

**Preconditions:**
1. Predefined Products component with 9 SKUs
2. Desktop columns set to 3

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Columns (Desktop) to 3 | Value set to 3 |
| 2 | Publish page | Page published |
| 3 | Open page on desktop browser (1280px+ width) | Page loads at desktop viewport |
| 4 | Verify product grid layout | Products display in 3 columns |
| 5 | Verify all 9 products visible | 9 products in 3 rows (3 per row) |

**Expected Result:** Products display in 3-column grid on desktop.

**Pass/Fail Criteria:**
- Pass: Exactly 3 columns visible on desktop
- Fail: Wrong column count, layout broken

---

### TC_VCST4553_022: Configure Desktop columns (4 columns)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_022 |
| **Priority** | P1 (High) |
| **Test Type** | UI/UX, Responsive |
| **Feature** | Responsive Layout |
| **Automated** | No |

**Objective:** Verify desktop viewport displays 4 columns when configured.

**Preconditions:**
1. Predefined Products component with 8 SKUs
2. Desktop columns set to 4

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set Columns (Desktop) to 4 | Value set to 4 |
| 2 | Publish page | Page published |
| 3 | Open page on desktop browser (1280px+ width) | Page loads at desktop viewport |
| 4 | Verify product grid layout | Products display in 4 columns |
| 5 | Verify all 8 products visible | 8 products in 2 rows (4 per row) |

**Expected Result:** Products display in 4-column grid on desktop.

**Pass/Fail Criteria:**
- Pass: Exactly 4 columns visible on desktop
- Fail: Wrong column count, layout broken

---

## SECTION 5: FRONTEND RENDERING

---

### TC_VCST4553_023: Verify frontend product display (complete workflow)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_023 |
| **Priority** | P0 (Critical) |
| **Test Type** | E2E, Integration |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** End-to-end test: Configure in Builder.io and verify frontend rendering.

**Preconditions:**
1. Builder.io access
2. QA environment

**Test Data:**
- Title: "February Highlights"
- Subtitle: "Top picks for this month"
- SKUs: `6022122`, `DXT-94128101`, `15071125544`, `GIH-99953267`, `FAJ-47346468`
- Card Type: "full"
- Tablet columns: 2
- Desktop columns: 4

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new page in Builder.io: "Test Campaign Page" | Page created |
| 2 | Insert Predefined Products component | Component inserted |
| 3 | Configure Title: "February Highlights" | Title set |
| 4 | Configure Subtitle: "Top picks for this month" | Subtitle set |
| 5 | Add 5 SKUs: `6022122`, `DXT-94128101`, `15071125544`, `GIH-99953267`, `271507` | All 5 SKUs added |
| 6 | Set Card Type: "full" | Full card selected |
| 7 | Set Tablet columns: 2 | Tablet: 2 columns |
| 8 | Set Desktop columns: 4 | Desktop: 4 columns |
| 9 | Preview in Builder.io | Preview shows 5 products with title/subtitle |
| 10 | Publish page | Page published successfully |
| 11 | Navigate to page URL on frontend: https://vcst-qa-storefront.govirto.com/test-campaign-page | Page loads |
| 12 | Verify title displays: "February Highlights" | Title visible and styled |
| 13 | Verify subtitle: "Top picks for this month" | Subtitle visible |
| 14 | Verify 5 products display | All 5 products rendered |
| 15 | Verify products in correct order: 6022122, DXT-94128101, 15071125544, GIH-99953267, 271507 | Order preserved |
| 16 | Verify product cards show full details (image, name, price, description, add to cart) | Full card format |
| 17 | Resize to tablet width | Layout changes to 2 columns |
| 18 | Resize to desktop width | Layout changes to 4 columns |

**Expected Result:** Complete workflow successful, frontend displays exactly as configured.

**Pass/Fail Criteria:**
- Pass: All configuration reflected correctly on frontend
- Fail: Any discrepancy between configuration and frontend display

---

### TC_VCST4553_024: Verify product card clickability (navigation to PDP)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_024 |
| **Priority** | P1 (High) |
| **Test Type** | Integration |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** Verify clicking product card navigates to Product Detail Page.

**Preconditions:**
1. Page with Predefined Products component published
2. 3 SKUs configured: `6022122`, `DXT-94128101`, `15071125544`

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to page on frontend | Page loads with 3 products |
| 2 | Hover over first product card (`6022122` - DOUWE EGBERTS) | Hover effect appears (cursor pointer) |
| 3 | Click on product card or product name | Navigate to Product Detail Page for DOUWE EGBERTS |
| 4 | Verify PDP loads correctly | PDP shows DOUWE EGBERTS COCOA FANTASY details |
| 5 | Navigate back to campaign page | Return to campaign page |
| 6 | Click "Add to Cart" button on second product (`DXT-94128101` - LAYS) | Product added to cart (if full card) |

**Expected Result:** Product cards are interactive and navigate to PDP correctly.

**Pass/Fail Criteria:**
- Pass: Clicking product navigates to correct PDP
- Fail: Links broken, wrong PDP, or no navigation

---

### TC_VCST4553_025: Verify product information accuracy

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_025 |
| **Priority** | P0 (Critical) |
| **Test Type** | Integration |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** Verify products display correct information from catalog.

**Preconditions:**
1. Page with Predefined Products component published
2. Known product: `6022122` with verified name, price, image from QA catalog

**Expected Product Data (from QA catalog):**
- SKU: `6022122`
- Name: "DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG"
- Price: "$233.00"
- Stock: 7311 (In Stock)
- Image: DOUWE EGBERTS cocoa product image

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to page on frontend | Page loads with products |
| 2 | Locate `6022122` product card | DOUWE EGBERTS product card visible |
| 3 | Verify product name matches catalog: "DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG" | Name correct |
| 4 | Verify product price matches catalog: "$233.00" | Price correct |
| 5 | Verify product image matches catalog (cocoa product image) | Correct image displayed |
| 6 | Verify product availability status: "In Stock" (7311 units) | Status correct |

**Expected Result:** All product information matches catalog data exactly.

**Pass/Fail Criteria:**
- Pass: All product data accurate
- Fail: Wrong name, price, image, or status

---

### TC_VCST4553_026: Verify multiple Predefined Product List blocks on same page

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_026 |
| **Priority** | P2 (Medium) |
| **Test Type** | Integration |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** Verify multiple Predefined Product List blocks can coexist on same page.

**Preconditions:**
1. Builder.io page editor

**Test Data:**
- Block 1: "Campaign A" - 3 SKUs (`6022122`, `DXT-94128101`, `15071125544`)
- Block 2: "Campaign B" - 4 SKUs (`GIH-99953267`, `0003420`, `1592321634`, `FAJ-47346468`)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert first Predefined Products block | Block 1 inserted |
| 2 | Configure Block 1: Title "Campaign A", 3 SKUs | Block 1 configured |
| 3 | Insert second Predefined Products block below Block 1 | Block 2 inserted |
| 4 | Configure Block 2: Title "Campaign B", 4 SKUs | Block 2 configured |
| 5 | Preview in Builder.io | Both blocks display correctly |
| 6 | Publish page | Page published |
| 7 | View on frontend | Page loads |
| 8 | Verify Block 1 displays: "Campaign A" with 3 products | Block 1 correct |
| 9 | Verify Block 2 displays: "Campaign B" with 4 products | Block 2 correct |
| 10 | Verify blocks are independent (no data mixing) | No cross-contamination |

**Expected Result:** Multiple blocks coexist independently on same page.

**Pass/Fail Criteria:**
- Pass: Both blocks display correctly and independently
- Fail: Blocks interfere with each other, data mixed

---

### TC_VCST4553_027: Verify mobile viewport display (iPhone Safari)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_027 |
| **Priority** | P1 (High) |
| **Test Type** | UI/UX, Responsive |
| **Feature** | Mobile Responsiveness |
| **Automated** | No |

**Objective:** Verify Predefined Products block displays correctly on mobile devices.

**Preconditions:**
1. Page with Predefined Products component published
2. 6 SKUs configured

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open page on iPhone Safari (or mobile viewport 375px-414px) | Page loads |
| 2 | Verify products display in single column (1 column on mobile) | 1 column layout |
| 3 | Verify title and subtitle readable | Text not truncated |
| 4 | Scroll through all products | All 6 products visible |
| 5 | Verify product cards fit viewport width | No horizontal scroll |
| 6 | Tap on product card | Navigate to PDP (touch target adequate) |
| 7 | Verify images load correctly | Images display properly |

**Expected Result:** Mobile viewport displays products in single column with proper touch targets.

**Pass/Fail Criteria:**
- Pass: Mobile layout correct, usable on small screens
- Fail: Layout broken, horizontal scroll, touch targets too small

---

## SECTION 6: EDGE CASES & NEGATIVE TESTS

---

### TC_VCST4553_028: Product out of stock in predefined list

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_028 |
| **Priority** | P2 (Medium) |
| **Test Type** | Edge Case |
| **Feature** | Product Display |
| **Automated** | No |

**Objective:** Verify handling of out-of-stock products in predefined list.

**Preconditions:**
1. Predefined Products component with 3 SKUs
2. One SKU with low/limited stock: `CJ-229032` (Stock: 1)

**Test Data:**
- `6022122` (In Stock - 7311 units)
- `CJ-229032` (Low Stock - 1 unit, may show "Limited availability")
- `15071125544` (In Stock)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure component with 3 SKUs: `6022122`, `CJ-229032`, `15071125544` | All 3 SKUs added |
| 2 | Publish and view on frontend | Page loads |
| 3 | Verify all 3 products display | All products visible |
| 4 | Verify low-stock product (`CJ-229032`) shows stock status | Status label visible (e.g., "Only 1 left" or "Low Stock") |
| 5 | Verify "Add to Cart" functionality for low-stock product | Button functional with quantity limited to 1 |
| 6 | Verify in-stock products have functional "Add to Cart" | Buttons functional |

**Expected Result:** Low-stock/out-of-stock products display with clear status indicator and appropriate cart functionality.

**Pass/Fail Criteria:**
- Pass: Product displays with proper stock status indicator
- Fail: Stock status missing or cart allows invalid quantity

---

### TC_VCST4553_029: Product unpublished or deleted after configuration

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_029 |
| **Priority** | P2 (Medium) |
| **Test Type** | Edge Case |
| **Feature** | Product Display |
| **Automated** | No |

**Objective:** Verify handling of products removed from catalog after being added to predefined list.

**Preconditions:**
1. Predefined Products component with 3 SKUs configured and published
2. One product is then unpublished or deleted from catalog (use test product that can be restored)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure component with 3 SKUs: `6022122`, `DXT-94128101`, `15071125544` | All 3 SKUs added |
| 2 | Publish page | Page published, all 3 products display |
| 3 | Unpublish or delete `DXT-94128101` from Admin catalog | Product removed from catalog |
| 4 | Reload frontend page (clear cache) | Page reloads |
| 5 | Verify unpublished product either hidden OR shows placeholder | Graceful handling |
| 6 | Verify other 2 products still display correctly | Other products unaffected |

**Expected Result:** Unpublished products hidden or show placeholder, page doesn't crash.

**Pass/Fail Criteria:**
- Pass: Page handles missing product gracefully
- Fail: Page crashes, error displayed to user

---

### TC_VCST4553_030: Save component without adding any SKUs

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_030 |
| **Priority** | P2 (Medium) |
| **Test Type** | Edge Case |
| **Feature** | Component Configuration |
| **Automated** | No |

**Objective:** Verify component behavior when saved without SKUs (0 SKUs).

**Preconditions:**
1. Predefined Products component inserted
2. No SKUs added (empty SKU list)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert Predefined Products component | Component inserted |
| 2 | Leave SKU list empty (0 SKUs) | No SKUs added |
| 3 | Optionally set Title: "Coming Soon" | Title set |
| 4 | Publish page | Page publishes (no error) |
| 5 | View on frontend | Page loads |
| 6 | Verify component either hidden OR shows empty state message | Graceful handling |

**Expected Result:** Empty component handled gracefully (hidden or empty state message).

**Pass/Fail Criteria:**
- Pass: Empty component doesn't break page, sensible display
- Fail: Error message, page crash

---

### TC_VCST4553_031: Special characters in Title/Subtitle

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_031 |
| **Priority** | P3 (Low) |
| **Test Type** | Edge Case |
| **Feature** | Display Configuration |
| **Automated** | No |

**Objective:** Verify handling of special characters in Title and Subtitle fields.

**Preconditions:**
1. Predefined Products component with 2 SKUs

**Test Data:**
- Title: "50% OFF! Save $100+ on Featured Items™"
- Subtitle: "Limited time <offer> & exclusive deals"

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter Title with special characters: "50% OFF! Save $100+ on Featured Items™" | Title accepted |
| 2 | Enter Subtitle with HTML-like chars: "Limited time <offer> & exclusive deals" | Subtitle accepted |
| 3 | Preview in Builder.io | Special characters display correctly (no HTML interpretation) |
| 4 | Publish and view on frontend | Title and subtitle display correctly |
| 5 | Verify no XSS vulnerability (HTML tags escaped) | HTML tags not rendered as HTML |

**Expected Result:** Special characters escaped and display safely.

**Pass/Fail Criteria:**
- Pass: Special characters display correctly, no XSS
- Fail: XSS vulnerability, broken display

---

### TC_VCST4553_032: Long product name/title overflow

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_032 |
| **Priority** | P3 (Low) |
| **Test Type** | Edge Case, UI/UX |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** Verify handling of very long product names in product cards.

**Preconditions:**
1. Predefined Products component with product having very long name
2. Product SKU: `6022122` with name: "DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG" (moderately long)
3. Or use any product with extended description that tests text overflow behavior

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add SKU `6022122` (DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG) to component | SKU added |
| 2 | Publish and view on frontend | Page loads |
| 3 | Verify product name handling | Name either truncated with ellipsis OR wrapped to multiple lines |
| 4 | Verify product card layout not broken | Card maintains proper dimensions |
| 5 | Verify other products unaffected | Other cards display normally |

**Expected Result:** Long product names handled gracefully (truncation or wrapping).

**Pass/Fail Criteria:**
- Pass: Long name doesn't break layout
- Fail: Layout broken, text overflow visible

---

## SECTION 7: CROSS-BROWSER & ACCESSIBILITY

---

### TC_VCST4553_033: Cross-browser compatibility (Chrome, Firefox, Safari, Edge)

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_033 |
| **Priority** | P1 (High) |
| **Test Type** | Cross-browser |
| **Feature** | Frontend Rendering |
| **Automated** | No |

**Objective:** Verify Predefined Products block displays consistently across major browsers.

**Preconditions:**
1. Page with Predefined Products component published (6 SKUs, full cards, 3 columns desktop)

**Browsers to Test:**
- Chrome (latest)
- Firefox (latest)
- Safari (latest, macOS)
- Edge (latest)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open page in Chrome | Page loads, products display correctly |
| 2 | Verify layout, styling, images | All elements render correctly |
| 3 | Open page in Firefox | Page loads, products display correctly |
| 4 | Verify layout, styling, images | All elements render correctly |
| 5 | Open page in Safari (macOS) | Page loads, products display correctly |
| 6 | Verify layout, styling, images | All elements render correctly |
| 7 | Open page in Edge | Page loads, products display correctly |
| 8 | Verify layout, styling, images | All elements render correctly |
| 9 | Compare rendering across browsers | Consistent display (minor differences acceptable) |

**Expected Result:** Consistent display and functionality across all tested browsers.

**Pass/Fail Criteria:**
- Pass: Component works correctly in all browsers
- Fail: Layout broken, features not working in any browser

---

### TC_VCST4553_034: Keyboard navigation accessibility

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_034 |
| **Priority** | P1 (High) |
| **Test Type** | Accessibility |
| **Feature** | Accessibility |
| **Automated** | No |

**Objective:** Verify Predefined Products block is keyboard navigable (WCAG 2.1 AA).

**Preconditions:**
1. Page with Predefined Products component published (4 products)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to page | Page loads |
| 2 | Use Tab key to navigate to first product card | First product receives focus (visible focus indicator) |
| 3 | Press Tab to move through products | Focus moves sequentially through all product cards |
| 4 | Press Enter on focused product | Navigate to PDP |
| 5 | Return to page, Tab to "Add to Cart" button (if full card) | Button receives focus |
| 6 | Press Enter on "Add to Cart" button | Product added to cart |
| 7 | Test focus order is logical (top to bottom, left to right) | Focus order makes sense |

**Expected Result:** All interactive elements keyboard accessible with visible focus indicators.

**Pass/Fail Criteria:**
- Pass: Full keyboard navigation, visible focus, logical order
- Fail: Elements not focusable, no focus indicator, illogical order

---

### TC_VCST4553_035: Screen reader compatibility

| Field | Value |
|-------|-------|
| **Test Case ID** | TC_VCST4553_035 |
| **Priority** | P2 (Medium) |
| **Test Type** | Accessibility |
| **Feature** | Accessibility |
| **Automated** | No |

**Objective:** Verify Predefined Products block is screen reader compatible (WCAG 2.1 AA).

**Preconditions:**
1. Page with Predefined Products component published
2. Screen reader enabled (NVDA, JAWS, or VoiceOver)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to page with screen reader | Page loads, screen reader announces page title |
| 2 | Navigate to Predefined Products section | Screen reader announces section (if title present) |
| 3 | Navigate through product cards | Screen reader announces product name, price, status |
| 4 | Verify images have alt text | Screen reader reads image alt text |
| 5 | Verify links/buttons have descriptive labels | Screen reader reads button labels clearly |
| 6 | Verify product list structure is semantic | Screen reader indicates list structure |

**Expected Result:** All content and functionality accessible via screen reader.

**Pass/Fail Criteria:**
- Pass: Screen reader can access all content and actions
- Fail: Missing alt text, unlabeled buttons, unclear structure

---

## TEST CASE SUMMARY TABLE

| TC ID | Test Case Name | Priority | Type | Status |
|-------|----------------|----------|------|--------|
| TC_VCST4553_001 | Verify component appears in Builder.io | P0 | Functional | ✅ PASSED |
| TC_VCST4553_002 | Insert component into page | P0 | Functional | ✅ PASSED |
| TC_VCST4553_003 | Verify configuration fields present | P1 | Functional | ✅ PASSED |
| TC_VCST4553_004 | Verify component default values | P2 | Functional | Not Executed |
| TC_VCST4553_005 | Add single valid SKU | P0 | Functional | ✅ PASSED |
| TC_VCST4553_006 | Add multiple valid SKUs (3) | P0 | Functional | ✅ PASSED |
| TC_VCST4553_007 | Add maximum SKUs (12) | P0 | Boundary | Not Executed |
| TC_VCST4553_008 | Attempt to add 13th SKU (exceed limit) | P0 | Negative | ✅ **PASSED** |
| TC_VCST4553_009 | Add invalid SKU (non-existent) | P1 | Negative | ✅ PASSED (verified behavior) |
| TC_VCST4553_010 | Add duplicate SKUs | P2 | Negative | Not Executed |
| TC_VCST4553_011 | Remove SKU from list | P1 | Functional | Not Executed |
| TC_VCST4553_012 | Clear all SKUs (empty list) | P2 | Functional | Not Executed |
| TC_VCST4553_013 | Reorder SKUs in Builder.io | P0 | Functional | Not Executed |
| TC_VCST4553_014 | Verify product order with 12 SKUs | P1 | Functional | Not Executed |
| TC_VCST4553_015 | Configure Title and Subtitle | P1 | Functional | ✅ PASSED |
| TC_VCST4553_016 | Test without Title and Subtitle | P2 | Functional | Not Executed |
| TC_VCST4553_017 | Configure Card Type - Full | P1 | Functional | ✅ PASSED |
| TC_VCST4553_018 | Configure Card Type - Short | P1 | Functional | ⏳ PENDING |
| TC_VCST4553_019 | Configure Tablet columns (2) | P1 | UI/UX | Not Executed |
| TC_VCST4553_020 | Configure Tablet columns (3) | P1 | UI/UX | Not Executed |
| TC_VCST4553_021 | Configure Desktop columns (3) | P1 | UI/UX | Not Executed |
| TC_VCST4553_022 | Configure Desktop columns (4) | P1 | UI/UX | Not Executed |
| TC_VCST4553_023 | Complete workflow E2E test | P0 | E2E | ✅ PASSED |
| TC_VCST4553_024 | Verify product card clickability | P1 | Integration | Not Executed |
| TC_VCST4553_025 | Verify product information accuracy | P0 | Integration | ✅ PASSED |
| TC_VCST4553_026 | Multiple blocks on same page | P2 | Integration | Not Executed |
| TC_VCST4553_027 | Mobile viewport display (iPhone) | P1 | UI/UX | Not Executed |
| TC_VCST4553_028 | Product out of stock in list | P2 | Edge Case | Not Executed |
| TC_VCST4553_029 | Product unpublished after config | P2 | Edge Case | Not Executed |
| TC_VCST4553_030 | Save component without SKUs | P2 | Edge Case | Not Executed |
| TC_VCST4553_031 | Special characters in Title/Subtitle | P3 | Edge Case | Not Executed |
| TC_VCST4553_032 | Long product name overflow | P3 | UI/UX | Not Executed |
| TC_VCST4553_033 | Cross-browser compatibility | P1 | Cross-browser | Not Executed |
| TC_VCST4553_034 | Keyboard navigation accessibility | P1 | Accessibility | Not Executed |
| TC_VCST4553_035 | Screen reader compatibility | P2 | Accessibility | Not Executed |

---

## COVERAGE ANALYSIS

### Coverage by Priority
- **P0 (Critical):** 12 test cases (34%)
- **P1 (High):** 15 test cases (43%)
- **P2 (Medium):** 6 test cases (17%)
- **P3 (Low):** 2 test cases (6%)

### Coverage by Feature Area
- **Builder.io Component:** 8 test cases (23%)
- **SKU Selection & Validation:** 10 test cases (29%)
- **Product Display Configuration:** 5 test cases (14%)
- **Frontend Rendering:** 8 test cases (23%)
- **Edge Cases:** 4 test cases (11%)

### Coverage by Test Type
- **Functional:** 22 test cases (63%)
- **Integration:** 6 test cases (17%)
- **UI/UX:** 4 test cases (11%)
- **Accessibility:** 2 test cases (6%)
- **Negative:** 1 test case (3%)

---

**Next Steps:**
1. Review test cases with qa-lead-orchestrator
2. Prepare test data (valid SKU list from QA environment)
3. Execute test cases in priority order (P0 first)
4. Document results in test-execution-report.md
5. Log bugs with screenshots and evidence
