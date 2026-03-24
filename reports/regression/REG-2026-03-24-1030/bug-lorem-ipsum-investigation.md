# Bug Investigation Report: Lorem Ipsum Placeholder on File Section

**Date:** 2026-03-24
**Investigator:** qa-testing-expert (playwright-firefox)
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Browser:** Firefox via playwright-firefox MCP
**Verdict:** CONFIRMED -- Test Data Issue (not a code bug)

---

## Summary

The product "Base product EN" (slug: `111111`, SKU: NIR-24861764) displays Lorem Ipsum placeholder text in multiple locations on the storefront PDP:

1. **Configuration section "File req *"** -- The description field contains 4 copies of the standard Lorem Ipsum paragraph, fully visible to end users under the "CONFIGURE THE PARAMETERS" section.
2. **Product Description section** -- The main "DESCRIPTION" block also contains the standard Lorem Ipsum paragraph.
3. **Properties section** -- Custom1 and Custom2 property values contain Lorem Ipsum variants ("lorem ipsum long long..." and the "Contrary to popular belief..." passage).

## Severity Reassessment

- **Original severity:** Medium
- **Reassessed severity:** Low (Test Data Issue)
- **Rationale:** This is a QA test product with intentionally entered placeholder data, not a code defect. The product name itself ("Base product EN") and slug ("111111") indicate it is a test fixture. However, if this product is accessible to real users in a shared QA/demo environment, the Lorem Ipsum content looks unprofessional.

## Reproduction Steps

1. Navigate to `https://vcst-qa-storefront.govirto.com/products-with-options/configurable-caps-shirts/111111`
2. Observe the "PROPERTIES" section -- Custom1 shows "lorem ipsum long long...", Custom2 shows the full "Contrary to popular belief..." passage
3. Scroll to "DESCRIPTION" section -- full standard Lorem Ipsum paragraph
4. Scroll to "CONFIGURE THE PARAMETERS" section
5. Observe "FILE REQ *" section -- the description below the section header contains 4 repetitions of the standard Lorem Ipsum paragraph, prefixed with the word "description"
6. The validation message "Complete all required options to finalize your selection" appears in red below the Lorem Ipsum text

## Expected vs Actual

| Field | Expected | Actual |
|-------|----------|--------|
| File req description | Meaningful description of the file upload requirement (e.g., "Upload your design file") | 4x copies of "Lorem Ipsum is simply dummy text of the printing and typesetting industry..." (~1,600 characters total) |
| Product description | Real product description | Standard Lorem Ipsum paragraph |
| Custom properties | Real property values | Lorem Ipsum variants |

## Evidence

### Screenshots
- `bug1-initial-load.png` -- Initial page load showing empty content area during SPA hydration
- `bug1-lorem-ipsum-config-section.png` -- Full view showing Properties with Lorem Ipsum, Description with Lorem Ipsum, and the beginning of the config section
- `bug1-file-req-section.png` -- Configuration section "FILE REQ *" with the massive Lorem Ipsum description block and file upload widget below
- `bug1-admin-product-detail.png` -- Admin product detail blade for "Base product" (NIR-24861764)

### Admin Verification
- **Product ID:** de471c2c-eeb0-4367-9803-af5ffd75d8ba
- **SKU:** NIR-24861764
- **Admin product name:** "Base product" (localized en-US: "Base product EN", fr-FR: "Base product FR")
- **Admin URL:** `https://vcst-qa.govirto.com/#!/workspace/catalog?productId=de471c2c-eeb0-4367-9803-af5ffd75d8ba`
- **Descriptions count:** 1 (contains the Lorem Ipsum text)
- **Properties count:** 10
- **Configuration tab:** NOT present on this product -- the configuration sections (File req, Text required, Product not required) are likely inherited from a parent configurable product definition or category-level configuration
- **First listed:** Mar 31, 2025

### Console / Network
- No JS errors related to this issue
- No failed API requests
- Standard Vue/Playwright warnings only (attribute value issues, resource type mismatches)

## Root Cause Analysis

This is **test data, not a code defect**. The Lorem Ipsum text was entered by a QA tester or developer when creating this configurable product as a test fixture. The text exists in:

1. The product's Description field (admin-editable)
2. The product's custom property values (Custom1, Custom2)
3. The configuration section's "Description" field for the "File req" section (configured at the configurable product template level, not visible in this product's admin blade)

The configuration sections do not appear in this product's admin blade (no "Configuration" tab), suggesting they are inherited from a higher-level configurable product definition. The Lorem Ipsum in the File req section description would need to be edited at that parent/template level.

## Determination: Bug or By-Design / Test Data?

**Test Data Issue.** This is not a software defect. The product was created for QA testing purposes with placeholder Lorem Ipsum content. The code correctly renders whatever description text is configured for the product and its configuration sections.

**Recommendation:** If this QA environment is used for demos or shared access, the Lorem Ipsum content should be replaced with meaningful test content. The "File req" section description, in particular, is excessively long (4 repeated paragraphs) and degrades the user experience of the configuration UI.

## Action Items

- [ ] Replace Lorem Ipsum in the product Description with meaningful test content
- [ ] Replace Lorem Ipsum in Custom1/Custom2 property values
- [ ] Replace Lorem Ipsum in "File req" configuration section description (requires admin access to the configurable product template)
- [ ] Consider adding a "From" prefix to the configuration section description field (the word "description" currently renders as a raw label prefix)
