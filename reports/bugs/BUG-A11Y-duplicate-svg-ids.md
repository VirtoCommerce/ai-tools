# BUG-A11Y-001: Duplicate `id="icon"` on SVG Elements Across All Pages

## Status: CONFIRMED

## Severity: Medium
## Category: Accessibility (A11y)
## WCAG Criterion: 4.1.1 Parsing (Level A)

## Environment
- **URL:** https://vcst-qa-storefront.govirto.com
- **Browser:** Firefox (Playwright)
- **Viewport:** 1920x1080 (desktop)
- **Date:** 2026-03-10

## Summary

All storefront pages contain dozens of SVG elements sharing the identical `id="icon"` attribute. The HTML specification requires `id` attributes to be unique within a document. Duplicate IDs violate WCAG 4.1.1 (Parsing) and can cause screen readers to malfunction when attempting to reference elements by ID.

## Reproduction Results

| Page | Count of `id="icon"` Elements | All SVGs? |
|------|-------------------------------|-----------|
| Homepage (`/`) | 49 | Yes (49/49) |
| Catalog (`/catalog`) | 44 | Yes (44/44) |
| Cart (`/cart`) | 49 | Yes (49/49) |

### Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Open browser DevTools console
3. Run: `document.querySelectorAll('[id="icon"]').length`
4. **Result:** 49

### Verification Script

```javascript
document.querySelectorAll('svg[id="icon"]').length // Returns 44-49 on every page
```

## Root Cause

The `vc-icon` Vue component renders inline SVGs with a hardcoded `id="icon"` attribute from the SVG source files. Every instance of the icon component produces another duplicate ID. Sample HTML:

```html
<span class="vc-icon vc-icon--size--xxs language-selector__arrow">
  <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" id="icon">
    <path fill-rule="evenodd" d="M0.584867 4.60935..."/>
  </svg>
</span>
```

The `id="icon"` is baked into the SVG asset files and not stripped or made unique during rendering.

## Expected Behavior

Each element's `id` attribute must be unique within the document, or the `id` attribute should be removed from inline SVGs (since they do not need an `id` for rendering).

## Actual Behavior

49 SVG elements on the homepage share `id="icon"`, and similar counts appear on every storefront page.

## Impact

- **Screen readers:** May skip, misread, or malfunction when encountering duplicate IDs. `aria-labelledby` or `aria-describedby` referencing "icon" would bind to the wrong element.
- **Automated testing:** `document.getElementById('icon')` returns only the first match, making test selectors unreliable.
- **HTML validation:** Fails W3C HTML validation.

## Recommended Fix

Strip the `id="icon"` attribute from all SVG source files or from the `vc-icon` component's render output. If an ID is needed for internal SVG references (e.g., `<use href="#icon">`), generate unique IDs per instance (e.g., `icon-{uuid}`).

## Evidence

- Screenshot: `reports/bugs/bug-a11y-001-homepage-desktop.png`

## Comparison to Original Report

The original finding reported "136+ duplicate `id="icon"`" elements. My independent reproduction found 44-49 per page, not 136+. The discrepancy likely stems from:
- The original count may have been taken on a page with more rendered products (scrolled/loaded more content)
- Or the original count was from a full-page scan including off-screen elements after infinite scroll

**Verdict:** The bug is real and confirmed. The exact count varies by page content, but 44-49 duplicates per page is already a clear WCAG 4.1.1 violation.
