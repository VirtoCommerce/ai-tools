# Visual Regression Testing Guide

> Reference file for ui-ux-expert agent. Read when performing visual regression testing.

## Test Case Template

```markdown
Test Case: TC_VISUAL_REGRESSION_001
Title: Visual regression test for [Component]

Using playwright MCP for visual testing:

1. CAPTURE BASELINE:
   [] Navigate to component in Storybook
   [] Capture screenshot of each story:
     - Default state
     - Hover state (trigger hover)
     - Focus state (trigger focus)
     - Error state
     - Loading state
   [] Save screenshots as baseline:
     - productcard-default-baseline.png
     - productcard-hover-baseline.png
     - etc.

2. AFTER CODE CHANGES:
   [] Navigate to component again
   [] Capture new screenshots (same stories)
   [] Compare new vs baseline:
     - Use visual diff tool (playwright built-in or external)
     - Highlight differences in pixels

3. ANALYZE DIFFERENCES:
   For each difference:
   [] Is change intentional?
     - YES: Update baseline (this is new design)
     - NO: Visual regression bug! Report it.

   [] Types of differences to watch for:
     - Color changed (unintended)
     - Spacing changed (padding, margin)
     - Font changed (size, weight, family)
     - Layout shifted
     - Element moved
     - Border/shadow changed
     - Opacity changed

4. REPORT VISUAL REGRESSIONS:
   If unintended change detected:

   Bug: "Visual Regression - ProductCard spacing changed"

   Description:
   - Expected: Padding 16px
   - Actual: Padding 12px
   - Diff screenshot: [Attach]
   - Likely cause: CSS refactor changed padding
   - Affects: All ProductCard instances

Visual Regression Tools (use via playwright):
- Percy (cloud visual testing)
- Chromatic (Storybook visual testing)
- Playwright visual comparison (built-in)
- BackstopJS
```
