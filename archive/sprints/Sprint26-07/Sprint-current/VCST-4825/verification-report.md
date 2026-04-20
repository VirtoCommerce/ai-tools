# VCST-4825 Bug Fix Verification Report

**Bug:** [Configurable Products] File upload button remains active after max file limit (5) reached
**Fix:** PR VirtoCommerce/vc-frontend#2262 -- Added `:disabled="hasMaxFileCount"` prop to `vc-file-uploader` drop container
**Theme Build:** vc-theme-b2b-vue-2.46.0-pr-2262-2ec2 (confirmed deployed via footer version string)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Product Page:** /products-with-options/configurable-caps-shirts/physical ("Hoodie Base with Only File non required")
**Section Tested:** "Only File non required" (File-type configuration section, optional, max 5 files)
**Browser:** Chromium (Playwright MCP -- playwright-chrome)
**Tested By:** qa-frontend-expert agent
**Date:** 2026-04-16

---

## Verification Checklist

### Fix Confirmation

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Navigate to product page, expand "Only File non required" section, upload 5 files. Verify the max-files warning message appears. | **PASS** | Warning message: "You have uploaded the maximum number of files possible. Further uploads are not possible." -- confirmed in all 3 runs. Screenshot: `04-run1-full-upload-area-disabled.png` |
| 2 | Verify fix: After 5 files uploaded, the "Browse your files" button and drag-drop zone are DISABLED (not clickable) | **PASS** | DOM inspection: `button.disabled = true`, CSS class `vc-file-picker--disabled` applied to `vc-file-uploader__drop-container`. Button is grayed out in screenshots. |
| 3 | Confirm root cause is addressed: the upload area is properly disabled, not just visually hidden | **PASS** | The HTML `disabled` attribute is set on the button element AND the CSS class `vc-file-picker--disabled` is applied to the container. The button is rendered but non-interactive -- the correct implementation approach. The upload area remains visible (user can still see their files and the warning), just disabled. |

### STR -- 3 Consecutive Passes Required

| # | Run | Result | Evidence |
|---|-----|--------|----------|
| 4 | Run 1/3: Full page reload -> upload 5 files -> button disabled -> warning shown -> clicking disabled area does nothing | **PASS** | Screenshots: `03-run1-5files-disabled-button.png`, `04-run1-full-upload-area-disabled.png`. DOM confirmed `disabled=true`. |
| 5 | Run 2/3: Full page reload -> repeat same flow -> same result | **PASS** | Screenshot: `05-run2-5files-disabled-button.png`. DOM: `browseButtonDisabled: true`, `dropContainerHasDisabledClass: true`. |
| 6 | Run 3/3: Full page reload -> repeat same flow -> same result | **PASS** | Screenshot: `06-run3-5files-disabled-button.png`. DOM: `browseButtonDisabled: true`, `dropContainerHasDisabledClass: true`, `fileCount: 5`, warning text confirmed. |

**STR Result: 3/3 PASS**

### Re-enable After Deletion

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 7 | After run 3, delete one file (bringing count to 4) -> upload button RE-ENABLES -> upload a new file to confirm it works -> count returns to 5 -> button disables again | **PASS** | After deleting test-file-5.png: `browseButtonDisabled: false`, `dropContainerHasDisabledClass: false`, `warningVisible: false`, `fileCount: 4`. Screenshot: `07-after-delete-button-reenabled.png`. After uploading test-file-6.png: `browseButtonDisabled: true`, `fileCount: 5` (files 1-4 + 6). Cycle works correctly. |

### Regression

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 8 | Fresh page reload, upload only 2-3 files -> button remains active and functional (not prematurely disabled) | **PASS** | After uploading 3 files: `browseButtonDisabled: false`, `dropContainerHasDisabledClass: false`, `warningPresent: false`. Button successfully opened file chooser for each upload. No premature disabling. |
| 9 | BL-CAT-006: Overall configurable product page still works -- expand sections, verify "Add to Cart" button behavior | **PASS** | Product page renders correctly: title, image, SKU, properties (Color_multivalue: Chili red), price ($300.00), stock (9957). Add to Cart button present and enabled (section is optional). "Configure the parameters" section expands/collapses correctly. Screenshot: `08-product-page-overall.png`. |
| 10 | Open browser console and monitor: no new JavaScript errors or failed network requests during entire flow | **PASS** | Console: 1 error -- external image 404 on `images.netdirector.co.uk` (Off-Road Bike product image in "Customers bought together" section, pre-existing data issue, unrelated to fix). Network: All GraphQL calls returned 200. All file upload POSTs (`/api/files/product-configuration`) returned 200. No new JS errors. No failed API calls related to file upload functionality. |

---

## Console Errors

| Level | Message | Related to Fix? |
|-------|---------|----------------|
| ERROR | Failed to load resource: 404 -- `images.netdirector.co.uk/.../honda_crf450rx_1__md.jpg` | No -- pre-existing broken external product image in "Customers bought together" section |

## Network Failures

| URL | Status | Related to Fix? |
|-----|--------|----------------|
| `images.netdirector.co.uk/...honda_crf450rx_1__md.jpg` | 404 | No -- external image, pre-existing |
| `fossbytes.com/.../hindi-movie-sites-_md.jpg` | ERR_BLOCKED_BY_ORB | No -- cross-origin resource blocking on external image, pre-existing |
| GA4 / CDN-RUM `ERR_ABORTED` | Aborted | No -- typical page-navigation-interruption artifacts |

No network failures related to the file upload fix were observed.

## Screenshots Captured

| File | Description |
|------|-------------|
| `01-initial-page-load.png` | Product page after initial navigation |
| `02-file-upload-area-initial.png` | File upload area before any uploads |
| `03-run1-5files-disabled-button.png` | Run 1: Disabled button after 5 files (bottom view) |
| `04-run1-full-upload-area-disabled.png` | Run 1: Full upload area showing all 5 files, disabled button, and warning |
| `05-run2-5files-disabled-button.png` | Run 2: Same disabled state after fresh reload + 5 uploads |
| `06-run3-5files-disabled-button.png` | Run 3: Same disabled state after fresh reload + 5 uploads |
| `07-after-delete-button-reenabled.png` | After deleting 1 file: button re-enabled, 4 files listed, no warning |
| `08-product-page-overall.png` | Full product page regression check |

## DOM Verification Summary

The fix adds `:disabled="hasMaxFileCount"` which results in:
- **HTML attribute:** `disabled` set on the `<button>` element (class: `vc-file-picker__drop`)
- **CSS class:** `vc-file-picker--disabled` added to the container (class: `vc-file-uploader__drop-container`)
- **Behavior:** Button does not respond to clicks, no file chooser dialog opens
- **Reversibility:** Deleting a file (count < 5) removes both the disabled attribute and CSS class, re-enabling the button

---

## Overall Verdict

**VERIFIED**

The fix correctly addresses the root cause. The file upload button and drag-drop zone are properly disabled when the maximum file count (5) is reached. The behavior is:
- Consistent across 3 consecutive test runs (3/3 PASS)
- Properly reversible (re-enables when a file is deleted)
- Does not prematurely disable (works correctly with fewer than 5 files)
- No regression in the configurable product page
- No new console errors or network failures introduced
