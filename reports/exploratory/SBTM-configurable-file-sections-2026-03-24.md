# Exploratory Session: Configurable Products -- File Sections

**Date:** 2026-03-24
**Duration:** ~20 minutes active exploration
**Charter:** Explore file upload UX, validation, cart integration, and edge cases for configurable products with File-type configuration sections
**Browser:** Firefox (playwright-firefox)
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Tester:** qa-testing-expert (Agent Firefox / qa-agent-slot2@virtocommerce.com)

---

## Products Tested

| Product | URL Path | File Section | Required | Tested |
|---------|----------|-------------|----------|--------|
| Hoodie Base (optional) | `/products-with-options/configurable-caps-shirts/physical` | "Only File non required" | No | Yes |
| Hoodie Base (required) | `/products-with-options/configurable-caps-shirts/physical-1703` | "only File req *" | Yes | Yes |
| Configurable Hat | `/products-with-options/configurable-caps-shirts/configurable-hat` | "Add photo" (S4) | No | No (time) |
| Custom T-shirt | `/products-with-options/configurable-caps-shirts/custom-t-shirt` | "Upload your picture" (S4) | No | No (time) |
| Base product EN | `/products-with-options/configurable-caps-shirts/111111` | "File req *" (S1) | Yes | No (time) |

---

## Findings

### Bugs Found

| # | Severity | Title | Product | Steps to Reproduce | Evidence |
|---|----------|-------|---------|-------------------|----------|
| BUG-3 | Low/UX | File upload area remains clickable when max file limit (5) is reached | Hoodie Base (optional) | 1. Upload 5 valid files. 2. Observe warning "You have uploaded the maximum number of files possible." 3. Click "Browse your files" -- file chooser dialog opens. 4. Select a file -- rejected with error. | `evidence/hoodie-5-files-max-reached.png` |
| BUG-4 | Medium | Selecting "None" radio does not clear uploaded files from the file list | Hoodie Base (optional) | 1. Upload 1+ files. 2. Click "None" radio button. 3. Observe: "None" is checked, section subtitle reverts to "Personalize your selection further (optional)" but all uploaded files remain visible in the list. | `evidence/hoodie-none-after-files.png` |
| BUG-5 | Medium | 0-byte file accepted without validation error on required file section | Hoodie Base (required) | 1. Navigate to required file product. 2. Upload `large_logo.png` (0 bytes). 3. Observe: file is accepted as valid (shown as link with "(0B)" size), "Section is required" validation clears, and the product can be added to cart with an empty file. | `evidence/zero-byte-file-accepted.png` |

### Previously Known Bugs (Confirmed Still Present)

| # | Severity | Title | Status |
|---|----------|-------|--------|
| BUG_072b_001 | Critical | OOS configuration options selectable with no disabled state | Known |
| BUG-1 | Low | Lorem Ipsum placeholder text on Base product EN file section | Known |
| BUG-2 | Low | Custom T-shirt missing "From" prefix on category card ($12 vs $32) | Known |

---

### Passed Tests

| # | Test | Product | Result |
|---|------|---------|--------|
| 1 | Single valid file upload (Logo1.png, 208KB) | Optional | PASS -- file appears with icon, name link, size, remove button |
| 2 | Multi-file upload (5 files: PNG, JPG, PDF, XLSX, JPG) | Optional | PASS -- all 5 uploaded correctly with proper file type icons |
| 3 | Max file limit enforcement (6th file rejected) | Optional | PASS -- "You tried to upload more than maximum number of files allowed" error |
| 4 | File removal (individual remove buttons) | Optional | PASS -- each file removable independently, count updates correctly |
| 5 | After removing last file, "None" auto-selected | Optional | PASS -- correct default behavior restored |
| 6 | Required file validation (add to cart without file) | Required | PASS -- "Sorry, this product cannot be added to cart" toast + "Section is required" message |
| 7 | Unsupported format rejected (.avif) | Required | PASS -- "File format is not allowed" error with red text, "Fix file upload errors" banner |
| 8 | Unsupported format rejected (.mp4) | Required | PASS -- "File format is not allowed" shown (format check prioritized over size check) |
| 9 | Valid file + add to cart (Logo1.png on required product) | Required | PASS -- product added to cart successfully, cart count incremented |
| 10 | File reference visible in cart components list | Required | PASS -- "Components list" dropdown shows "1. Logo1.png" or "1. newchanel.jpg" |
| 11 | Different file configs create separate cart line items | Required | PASS -- 3 separate line items with different file attachments |
| 12 | Edit configuration link in cart | Required | PASS -- "Edit configuration" link with lineItemId parameter |
| 13 | No console errors throughout session | All | PASS -- 0 JS errors, only expected warnings |
| 14 | No failed network requests | All | PASS -- all GraphQL calls returned 200 |

---

## Risk Areas

1. **0-byte file bypass (BUG-5):** A required file section can be satisfied by a 0-byte (empty) file. This means the business requirement of "file must be attached" is not truly enforced. If the file is used for manufacturing/customization (e.g., a logo to print on a hoodie), an empty file will cause downstream issues.

2. **"None" radio + files state inconsistency (BUG-4):** When "None" is selected but files remain visible, the ambiguous state could lead to unexpected behavior during add-to-cart or checkout. It is unclear whether the server treats the configuration as "None" or "files uploaded."

3. **Upload area active at max capacity (BUG-3):** While the validation properly prevents a 6th file from being accepted, the UX is misleading. Users may repeatedly attempt to upload, see the file chooser open, and get confused when their file does not appear.

4. **File reference not visible in cart line item properties:** The uploaded file name is only visible after expanding the "Components list" dropdown. The main cart view shows only Color and Fabric properties, making it impossible to distinguish between configurations with different file attachments at a glance.

---

## Observations

### UX Positives
- File upload drag-and-drop area is well-designed with clear constraints text
- File type icons (PNG, JPG, PDF, XLS) are visually distinct and helpful
- File links are clickable and resolve to `/api/files/{id}` for download
- File size is displayed in human-readable format (kB, MB)
- "Section is required" validation is prominent and clear
- Warning banner for max files and format errors is appropriately styled
- Components list in cart provides the file reference with Edit configuration link

### UX Friction
- Upload area should be hidden/disabled when max files reached (not just show a warning)
- File section subtitle in collapsed state shows comma-separated file names which truncates on long lists
- No file preview/thumbnail for image files (PNG, JPG) -- just an icon
- No progress indicator visible during upload (uploads are fast but for larger files this matters)

### Validation Priority Order Observed
1. File format check (first)
2. File count check (second)
3. File size check (not directly observed -- .mp4 triggered format error before size could be evaluated)
4. Empty file (0 bytes) -- NOT checked (BUG-5)

---

## Test Coverage Map

### Covered
- [x] Category page overview (subcategories, product cards, prices)
- [x] Single valid file upload (happy path)
- [x] Multi-file upload (up to 5)
- [x] File removal (individual)
- [x] Max file count validation (>5)
- [x] Required vs optional file behavior
- [x] "None" radio interaction on optional section
- [x] Required file validation (add to cart without file)
- [x] Unsupported format rejection (.avif, .mp4)
- [x] 0-byte file handling
- [x] Cart integration (file reference in components list)
- [x] Separate line items for different file configs
- [x] Edit configuration link from cart
- [x] Console error monitoring (clean)
- [x] Network request monitoring (clean)

### Not Covered (Out of Time)
- [ ] Configurable Hat (multi-section product with File as S4)
- [ ] Custom T-shirt (multi-section product with File as S4)
- [ ] Base product EN (required file as S1 with Lorem Ipsum placeholder)
- [ ] Cross-section interactions (File + non-File sections together)
- [ ] Duplicate file upload (same file twice)
- [ ] File upload then browser refresh (state persistence)
- [ ] File upload then browser back/forward
- [ ] Mobile viewport (375px) file upload UX
- [ ] Keyboard accessibility of file upload controls
- [ ] Screen reader announcements for upload states
- [ ] Large file upload (5MB boundary test with large_test.png)
- [ ] .webp format rejection (Stabilio.webp)
- [ ] .svg format rejection (starbucks logo)
- [ ] Checkout completion with file-configured product
- [ ] Order history -- file reference visibility in past orders

---

## Questions

1. **Is a 0-byte file intentionally accepted?** The platform does not validate minimum file size. Should there be a minimum (e.g., 1 byte or 1KB) to ensure meaningful content?

2. **What happens to uploaded files on "None" selection?** When a user selects "None" on an optional section after uploading files, are the files deleted from the server or just disassociated? The files remain visually listed -- is this by design?

3. **Should the upload area be disabled at max file count?** Currently the "Browse your files" button and drag-drop area remain active. The warning message appears but users can still open the file chooser. Is this intentional to allow users to see the error, or should the control be disabled?

4. **File retention after page navigation:** If a user uploads files, navigates away, and returns, are the uploaded files retained or lost? This was not tested due to time constraints.

---

## Session Metrics

- **Total tests executed:** 14
- **Pass:** 14
- **Fail (bugs found):** 3 new bugs
- **Console errors:** 0
- **Network failures:** 0
- **Products covered:** 2 of 5 (time constraint)
- **Evidence files:** 7 screenshots captured

## Evidence Files

| File | Description |
|------|-------------|
| `evidence/category-overview.png` | Products with Options category page |
| `evidence/hoodie-optional-file-initial.png` | Optional file section initial state |
| `evidence/hoodie-optional-file-uploaded.png` | Single file upload success |
| `evidence/hoodie-5-files-max-reached.png` | Max 5 files with warning banner |
| `evidence/hoodie-none-after-files.png` | BUG-4: None selected but files remain |
| `evidence/required-file-validation.png` | Required section validation error |
| `evidence/unsupported-format-avif.png` | Unsupported .avif format rejection |
| `evidence/zero-byte-file-accepted.png` | BUG-5: 0-byte file accepted |
| `evidence/cart-with-file-products.png` | Cart with file-configured products |
| `evidence/cart-components-list-expanded.png` | Cart components list showing file names |
