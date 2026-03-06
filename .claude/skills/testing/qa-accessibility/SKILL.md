---
description: "[Testing] WCAG 2.1 AA accessibility audit: POUR principles, keyboard nav, color contrast, ARIA."
argument-hint: "page URL | component name | full audit"
---

# /qa-accessibility — WCAG 2.1 AA Accessibility Audit

Run an accessibility audit using the WCAG 2.1 AA checklist. Covers all four POUR principles: Perceivable, Operable, Understandable, Robust.

## Usage
```
/qa-accessibility https://example.com/checkout    # Audit a specific page
/qa-accessibility ProductCard                      # Audit a Storybook component
/qa-accessibility full audit                       # Full site accessibility audit
```

## Supporting Files

- **wcag-accessibility-checklist.md** — Complete WCAG 2.1 AA checklist organized by POUR principles: text alternatives, time-based media, adaptable content, distinguishable, keyboard accessible, navigable, input assistance, compatible

## Execution

1. **Determine audit scope:**
   - Specific page URL → audit that page
   - Component name → find in Storybook and audit
   - Full audit → prioritize: homepage, login, catalog, checkout, account, cart

2. **Delegate to ui-ux-expert** via Task tool (`subagent_type: ui-ux-expert`):
   - Pass scope, URL(s), and reference to `wcag-accessibility-checklist.md`
   - Agent uses Chrome DevTools MCP for DOM inspection, ARIA checks, color analysis

3. **Audit checklist (per POUR):**
   - **Perceivable:** Alt text, color contrast ≥ 4.5:1 (AA), text resizing, audio/video captions
   - **Operable:** Keyboard navigation (Tab/Shift+Tab/Enter/Escape), focus indicators, no keyboard traps, skip links
   - **Understandable:** Language attributes, consistent navigation, error identification, labels
   - **Robust:** Valid HTML, ARIA roles/states/properties, name/role/value for custom controls

4. **Output:**
   - Accessibility audit report with pass/fail per criterion
   - Issues categorized by severity (Critical/Major/Minor) and WCAG criterion ID
   - Screenshots of violations with element highlighted
   - Save to test docs per qa-evidence output path conventions

## Rules
- Always test keyboard navigation, not just visual rendering
- Color contrast must be checked with actual computed CSS values, not eyeballing
- Custom interactive elements (dropdowns, modals, tabs) need full ARIA audit
- Test with both light and dark themes if available
