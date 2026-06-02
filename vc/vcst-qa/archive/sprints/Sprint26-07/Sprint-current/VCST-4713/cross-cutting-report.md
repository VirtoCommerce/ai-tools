# VCST-4713 Cross-Cutting Test Report

**Date:** 2026-04-13
**Tester:** qa-testing-expert (playwright-firefox)
**Environment:** QA | Browser: Firefox | Storefront: vcst-qa-storefront.govirto.com
**Theme:** 2.46.0-pr-2225-c823 | Catalog: 3.1017.0-pr-871 | xCart: 3.1006.0-pr-105

## Test Execution Summary

- Total: 2 | Pass: 2 | Fail: 0 | Blocked: 0 | Skipped: 0
- Pass Rate: 100%

## Results

| # | Test ID | Title | Result | Evidence |
|---|---------|-------|--------|----------|
| 1 | CFG-BACK-001-COND | Backward Compatibility -- Existing products with no dependsOnSectionId render all sections unconditionally | PASS | hat-all-sections-visible.png, bike-pdp-confirmed.png |
| 2 | CFG-GQL-010-COND | GraphQL: productConfiguration returns dependsOnSectionId field per section | PASS | GraphQL response inline below |

## CFG-BACK-001-COND Details

### Hat Product (CFG-001, 4 optional sections, all dependsOnSectionId=null)

- All 4 sections rendered simultaneously: "Select your fav color", "Select print-ready cap", "Customize text for your cap", "Add photo"
- First section expanded with radio options (Black $10, Beige $500, Green $18, Red $14, None)
- Selecting "Black hat" option: all 4 sections remain visible (no false conditional triggers)
- Price updated correctly ($10.00)
- Console: 0 errors

### Bike Product (CFG-009, 5 sections, all dependsOnSectionId=null)

- All 5 sections rendered: "Text", "Section with products", "Section with text", "Variation", "Test"
- Widget loaded correctly, no conditional hiding behavior observed
- Console: 0 errors

### GraphQL Cross-Verification (Hat)

All 4 Hat sections return `dependsOnSectionId: null`:
- f8004e62: "Select your fav color" -- null
- 45ab0a4b: "Select print-ready cap" -- null
- 333e4dc4: "Customize text for your cap" -- null
- 66941bf0: "Add photo" -- null

## CFG-GQL-010-COND Details

### GraphQL Response for CFG-022 (Conditional Product)

```json
{
  "configurationSections": [
    { "id": "a3ea3283-...", "name": "Frame Type", "isRequired": true, "dependsOnSectionId": null },
    { "id": "8ad69de5-...", "name": "Wheel Set", "isRequired": false, "dependsOnSectionId": "a3ea3283-..." },
    { "id": "b0b1692a-...", "name": "Frame Color", "isRequired": false, "dependsOnSectionId": "a3ea3283-..." },
    { "id": "12fbadbf-...", "name": "Tire Type", "isRequired": false, "dependsOnSectionId": "8ad69de5-..." }
  ]
}
```

- Section A (Frame Type): no dependency (root, REQUIRED) -- CORRECT
- Section B (Wheel Set): depends on A -- CORRECT
- Section D (Frame Color): depends on A (sibling of B) -- CORRECT
- Section C (Tire Type): depends on B (transitive from A) -- CORRECT
- errors[] empty, 4 sections returned

## Console/Network Summary

- JS Errors: 0 related to conditional sections
- Dynamic import errors (matcher, events, WebPush): pre-existing, unrelated to VCST-4713
- Network: No 4xx/5xx on productConfiguration queries
- Warnings: GA4 cookie overwrite (known), preload unused (known)

## Verdict

**PASS** -- No regression detected. Existing configurable products with dependsOnSectionId=null continue to render all sections unconditionally. GraphQL schema correctly returns the new field with expected dependency graph.
