# BA Analysis: Configurable Products — File-Type Configuration Sections
**Report:** REG-2026-03-24-1030
**Date:** 2026-03-24
**Environment:** QA — `https://vcst-qa-storefront.govirto.com`
**Storefront version:** 2.44.0-pr-2212-9072-9072853e
**Admin version:** 3.1009.0
**Analyst:** ba-system-analyzer
**Scope:** File-type configuration sections — storefront UX, upload behavior, admin configuration model

---

## 1. Product Inventory — File-Section Products

All five target products were located and verified. Four are in the `/products-with-options/configurable-caps-shirts/` category; one (`111111`) is in the parent `/products-with-options/` path.

| # | Product Name | SKU | URL Slug | Price | File Section Name | Required | None Radio |
|---|---|---|---|---|---|---|---|
| 1 | Hoodie Base with Only File non required | FLN-31875514 | `physical` | $300 | "Only File non required" | No | Yes (default checked) |
| 2 | Hoodie Base product with only File req | OSW-31158373 | `physical-1703` | $250 (sale, list $300, -17%) | "only File req *" | Yes | No |
| 3 | Configurable Hat | YER-80407217 | `configurable-hat` | $10 | "Add photo" (section 4 of 4) | No | Yes (default checked) |
| 4 | Custom T-shirt | AAW-59914334 | `custom-t-shirt` | $32 (list $12 on category) | "Upload your picture" (section 4 of 4) | No | Yes (default checked) |
| 5 | Base product EN | (no SKU visible) | `111111` | — (variation-based) | "File req *" (section 1 of 3) | Yes | No |

### File Section Constraints (all five products, observed in storefront UI)

All File sections across all products share identical constraints:

| Parameter | Value |
|---|---|
| Accepted file types | `.doc, .rtf, .docx, .txt, .pdf, .xls, .xlsx, .jpg, .png, .odt` |
| Maximum file size | 9.5 MB per file |
| Maximum files | 5 files per section |

These constraints appear to be platform-level defaults, not per-section settings (see Admin section below).

---

## 2. Category Inventory

### `/products-with-options/configurable-caps-shirts/`
8 products in "Configurable caps & shirts" category (admin: "Hats, caps and shirts" catalog > "Configurable caps & shirts" subcategory):

| Product Name | SKU | File Section? |
|---|---|---|
| Base product | NIR-24861764 | Not confirmed (not in test scope) |
| Configurable Hat | YER-80407217 | Yes — "Add photo" (optional) |
| Custom T-shirt | AAW-59914334 | Yes — "Upload your picture" (optional) |
| Hoodie Base product with only File req | OSW-31158373 | Yes — "only File req *" (required) |
| Hoodie Base with Only File non required | FLN-31875514 | Yes — "Only File non required" (optional) |
| Product No B2C Layout | NXU-15227254 | Not confirmed |
| Product No variations | XYX-53490597 | Not confirmed |
| Vintage Colorado Hoodie | BAJ-18974454 | Not confirmed |

### `/products-with-options/configurations/` (subcategory of parent)
Not separately confirmed during this session. The URL pattern suggests this maps to the admin "Options" subcategory (3rd sibling of "Configurable caps & shirts" within "Hats, caps and shirts").

---

## 3. File Upload Behavior — Tested on `physical-1703`

### 3.1 Add-to-cart Without File (Required Section Validation)

**Test:** Attempted to increment quantity on "Hoodie Base product with only File req" without uploading a file to the required "only File req *" section.

**Observed behavior:**
1. Clicking the quantity stepper increment button triggers validation immediately
2. The section label area changes to show "Section is required" in red text beneath the section name
3. A toast notification appears at the top of the page (exact text not captured but consistent with VC validation pattern)
4. The quantity does NOT increment — the add-to-cart action is blocked
5. The upload zone itself remains in its default state (no red border observed on the zone)

**Screenshot:** `screenshots/03-validation-no-file-uploaded.png`

### 3.2 File Upload — Logo1.png (203 kB PNG)

**Test file:** `C:/Users/mutyk/My Projects/vc-mcp-testing-module/test-data/uploads/Logo1.png` (203 kB PNG)

**Upload mechanism:**
- The File section renders a drag-and-drop zone with CSS class `vc-file-picker__drop`
- The actual input is `<input type="file" accept=".doc,.rtf,.docx,.txt,.pdf,.xls,.xlsx,.jpg,.png,.odt">` — hidden by default (`display:none`, `opacity:0`)
- Upload is triggered by revealing the hidden input via JS style manipulation and programmatically calling `.click()` to open the file chooser dialog
- Files are uploaded immediately on selection via `POST /api/files/{hash}` — NOT deferred to cart/checkout

**Upload flow steps:**
1. User clicks "Upload files" button (or drops files on the drop zone)
2. File chooser dialog opens
3. On file selection, immediate upload to `/api/files/{hash}` occurs
4. On success: file appears in a list below the drop zone showing filename + size (e.g., "Logo1.png · 203 kB")
5. A remove button (×) appears next to each uploaded file
6. The drop zone remains visible even after upload, allowing additional files to be added

**Post-upload state:** The "only File req *" label no longer shows the "Section is required" error. The quantity stepper becomes functional and add-to-cart proceeds normally.

**Screenshots:**
- `screenshots/04-upload-zone-scrolled.png` — upload zone before file upload
- `screenshots/05-upload-success-file-listed.png` — Logo1.png listed at 203 kB, remove button visible

---

## 4. UI/UX Findings — File Section Patterns

### 4.1 Upload Zone Appearance
- Default state: rectangular dashed-border drop zone with upload icon and "Upload files" text
- The drop zone uses the `vc-file-picker` component (Vue storefront component)
- Drop zone is always visible — it does not collapse after files are uploaded
- Layout: when files are uploaded, the file list appears on the left portion and the drop zone remains on the right

### 4.2 Required vs Optional Sections
- **Required sections** use an asterisk suffix in the section name (e.g., "only File req *", "File req *")
- **Optional sections** display a "None" radio button above the upload zone, defaulted to checked/selected
- Selecting "None" collapses the upload zone — the user explicitly opts out
- For required sections, there is no "None" option and no way to skip the section

### 4.3 Section Description Text
- Optional sections (e.g., "Only File non required", "Add photo", "Upload your picture") have short, clear descriptions or no description
- The "File req *" section on product `111111` (Base product EN) has an extremely long Lorem Ipsum placeholder as its description text — this is an unresolved test/placeholder content issue

### 4.4 File List Display
- Uploaded files are displayed in a list with: filename, file size in kB/MB
- Each file has a remove (×) button to delete it before cart submission
- Multiple files (up to 5) can be uploaded

### 4.5 Section Positioning
- On `physical` and `physical-1703` (single-section products), the Configure widget is immediately visible in the page
- On `configurable-hat` and `custom-t-shirt` (4-section products), the File section is the last (4th) section and requires scrolling to reach
- On `111111` (Base product EN), the File section is the FIRST section but the product uses a "Product variations" widget layout instead of a quantity stepper — this is a different product type

### 4.6 Add-to-cart Widget Behavior
- Standard products (physical, physical-1703, configurable-hat, custom-t-shirt): Show a quantity stepper and "Add to cart" button
- `111111` (Base product EN): Shows a "Product variations" section listing variants (Base product Blue $5, Base product EN FN ~$1,777, Base product Red $41) with individual add-to-cart buttons, and a "Variations in cart: 0 / View cart" counter in the sidebar — no top-level quantity stepper

---

## 5. Bugs and Inconsistencies

### BUG-1: Lorem Ipsum Placeholder Description on "File req *" Section (Severity: Medium)
**Product:** Base product EN (`/111111`)
**Section:** "File req *" (required File section, section 1 of 3)
**Issue:** The section Description field contains a very long Lorem Ipsum placeholder text that is displayed to end users in the storefront. This appears to be test/development data that was never replaced with real content.
**Impact:** Confusing to end users; breaks the professional appearance of the product page
**Screenshot:** `screenshots/07-base-product-en-file-req.png`
**Recommendation:** Replace placeholder text with meaningful description or leave blank.

### BUG-2: Price Discrepancy on Custom T-shirt (Severity: Low)
**Product:** Custom T-shirt (`/custom-t-shirt`)
**Issue:** Category listing shows $12; product detail page shows $32 (list price not observed, may be the effective price)
**Impact:** Price shown in search/browse differs from product detail — creates user confusion
**Recommendation:** Verify pricing configuration; ensure category card and PDP show consistent prices.

### BUG-3: No File Constraint Configuration in Admin (Severity: Medium / Test Coverage Risk)
**Location:** Admin > Catalog > Product > Configuration > Section detail blade
**Issue:** The section detail blade for File-type sections only exposes 4 fields: Section name, Description, Section is required toggle, Type of section dropdown. There are NO admin-configurable fields for: accepted file types, maximum file size, maximum number of files.
**Impact:** File constraints (`.doc,.rtf,.docx,.txt,.pdf,.xls,.xlsx,.jpg,.png,.odt`, 9.5 MB, 5 files max) appear to be hardcoded at the platform/module level. Merchants cannot customize these per-section.
**Test implication:** Test cases that assume admin-configurable constraints need to be updated to reflect that these are platform defaults, not admin settings.
**Screenshot:** `screenshots/10-admin-configuration-blade.png`

### INCONSISTENCY-1: "Enable configuration" Toggle is OFF for Active Products
**Products:** Hoodie Base with Only File non required (FLN-31875514)
**Issue:** In the Product configuration blade, the "Enable configuration" toggle is in the OFF (disabled/grey) state, yet the storefront correctly renders the Configure widget with the File section. This suggests the toggle state in admin does not accurately reflect the runtime behavior, OR the toggle is intentionally toggled off for testing purposes and the feature still works via another mechanism.
**Recommendation:** Verify whether the "Enable configuration" toggle is respected in the storefront rendering pipeline.

### INCONSISTENCY-2: Validation Only Triggers on Quantity Increment, Not "Add to Cart" Click
**Product:** Hoodie Base product with only File req (`/physical-1703`)
**Issue:** Validation is triggered by attempting to change the quantity (incrementing the stepper), not by clicking an "Add to Cart" button. The quantity stepper acts as a proxy for cart add. This means a user who changes quantity via keyboard (direct input) may bypass the validation in some edge cases.
**Recommendation:** Ensure validation is also triggered on direct quantity input entry.

---

## 6. Admin Configuration Model

### Navigation Path
Catalog > Hats, caps and shirts > Configurable caps & shirts > [Product] > (scroll to Configuration widget) > Configuration widget link > Product configuration blade > [Section row] > Section detail blade

### Section Detail Blade Fields (File type)
| Field | Type | Description |
|---|---|---|
| Section name | Text input | Display name shown in storefront (asterisk suffix indicates required in UI, but separate field controls it) |
| Description | Long text input | Optional instructional text shown under section name in storefront |
| Section is required | Toggle (on/off) | Controls whether a "None" radio button is shown (off = optional with None radio; on = required, no None) |
| Type of section | Dropdown | Options include: File, Text, Product. Selecting "File" is the only way to create a file upload section |

### File Constraints (Platform-Level, Not Admin-Configurable)
The following constraints are fixed at the platform/module level and cannot be changed per section:
- Accepted types: `.doc, .rtf, .docx, .txt, .pdf, .xls, .xlsx, .jpg, .png, .odt`
- Max file size: 9.5 MB
- Max files per section: 5

### Admin Screenshot
`screenshots/08-admin-hoodie-product-blade.png` — product list showing all 8 products in category
`screenshots/10-admin-configuration-blade.png` — Product configuration blade + Section detail blade for "Only File non required"

---

## 7. Test Coverage Recommendations for Suite 072b

### Critical Test Cases to Include

**TC-1: Required File Section — Cart Blocked Without Upload**
- Navigate to `physical-1703`
- Attempt to increment quantity without uploading a file
- Assert: "Section is required" validation message appears, quantity does not change

**TC-2: Optional File Section — Cart Works Without Upload (None Selected)**
- Navigate to `physical` (or `configurable-hat`, `custom-t-shirt`)
- Verify "None" radio is present and default-checked
- Attempt to add to cart without uploading — should succeed

**TC-3: Optional File Section — Upload Then Add to Cart**
- Navigate to `physical`
- Upload an accepted file (e.g., `.png`)
- Verify file appears in list with filename and size
- Add to cart — should succeed

**TC-4: Required File Section — Upload Clears Validation, Enables Cart**
- Navigate to `physical-1703`
- Trigger validation (attempt quantity increment without file)
- Upload Logo1.png
- Assert: validation message disappears, quantity increment succeeds

**TC-5: File Type Constraint Enforcement**
- Navigate to any File section product
- Attempt to upload a file with a non-accepted extension (e.g., `.exe`, `.mp4`, `.zip`)
- Assert: file is rejected with appropriate error message

**TC-6: File Size Limit Enforcement**
- Upload a file larger than 9.5 MB
- Assert: upload is rejected with size error message

**TC-7: Max Files Limit Enforcement**
- Upload 5 files to a single section
- Attempt to upload a 6th file
- Assert: upload is blocked with appropriate message

**TC-8: File Remove Functionality**
- Upload a file, then click the remove (×) button
- Assert: file is removed from the list, upload zone returns to empty state
- For required sections: verify that removing the only file re-triggers requirement state

**TC-9: Multi-Section Product — File Section is Last**
- Navigate to `configurable-hat` or `custom-t-shirt`
- Scroll to find the File section (4th section)
- Verify it renders correctly in context of other section types

**TC-10: Cross-Session File Persistence**
- Upload a file to a required section, navigate away, return to the product
- Assert: whether uploaded files persist across navigation (expected: they do NOT — file data is per-session)

### Known Gaps / Out-of-Scope
- File upload via drag-and-drop (not tested — drop API behavior not verified)
- Simultaneous multi-file upload
- File upload on mobile viewport
- File section behavior in B2B quote flow
- Behavior when `/api/files/{hash}` upload endpoint returns an error (network failure scenarios)

---

## 8. Screenshots Index

| # | Filename | Content |
|---|---|---|
| 01 | `01-physical-file-section.png` | Product "physical" — optional File section with None radio defaulted |
| 02 | `02-physical-1703-required-file.png` | Product "physical-1703" — required File section, no None option, -17% badge |
| 03 | `03-validation-no-file-uploaded.png` | Validation state: "Section is required" in red |
| 04 | `04-upload-zone-scrolled.png` | Upload zone before file upload on physical-1703 |
| 05 | `05-upload-success-file-listed.png` | After Logo1.png upload: file listed (203 kB), remove button, drop zone still visible |
| 06 | `06-configurable-hat-no-sections-visible.png` | Configurable Hat full page with "Add photo" File section (4th section) |
| 07 | `07-base-product-en-file-req.png` | Base product EN — Lorem Ipsum placeholder description bug on File section |
| 08 | `08-admin-hoodie-product-blade.png` | Admin: product list in Configurable caps & shirts category |
| 09 | `09-admin-product-blade-scrolled.png` | Admin: product detail blade (FLN-31875514) |
| 10 | `10-admin-configuration-blade.png` | Admin: Product configuration blade + "Only File non required" section detail showing only 4 configurable fields |

---

## 9. Architecture Notes

### File Upload API Flow
```
User selects file
    → storefront calls POST /api/files/{hash}
    → server returns file reference (URL/ID)
    → storefront stores file reference in component state
    → on cart add: file reference is included in the line item configuration data
```

Files are uploaded immediately on selection, not at cart/checkout time. This means:
- Partial uploads are possible (user uploads file, abandons session — file sits on server)
- If the upload API is slow, there is no visible progress indicator in the current implementation

### Component Architecture (Vue Storefront)
- Configure widget: wraps all sections for a configurable product
- `vc-file-picker` component: handles the drag-drop zone and file input
- Section validation: runs at the widget level before quantity increment is processed
- Section state: held in Vue component reactive data (not persisted to localStorage)
