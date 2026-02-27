# Design System Consistency Checklist

> Reference file for ui-ux-expert agent. Read when validating design system compliance.

## Test Case Template

```markdown
Test Case: TC_DESIGN_SYSTEM_001
Title: Validate design system consistency for [Component]

Access Design System Documentation:
- Design tokens file or
- Figma design system or
- Component library documentation

1. COLORS
[] Component uses design system colors (not arbitrary hex values)

  Design System Palette:
  - Primary: #0066CC
  - Secondary: #6C757D
  - Success: #28A745
  - Danger: #DC3545
  - Warning: #FFC107
  - Info: #17A2B8
  - Light: #F8F9FA
  - Dark: #343A40

  Check:
  [] Primary button uses $color-primary
  [] Secondary button uses $color-secondary
  [] Danger button uses $color-danger
  [] NO hardcoded colors like #1234AB

2. TYPOGRAPHY
[] Component uses design system fonts

  Design System Typography:
  - Font Family: 'Inter', sans-serif
  - Headings: 'Poppins', sans-serif
  - Font Sizes: 12px, 14px, 16px, 18px, 24px, 32px, 48px
  - Font Weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)
  - Line Heights: 1.2, 1.5, 1.8

  Check:
  [] Button text uses correct font-family
  [] Button text size matches design tokens
  [] Button text weight matches design system
  [] NO arbitrary font sizes like 15px or 19px

3. SPACING
[] Component uses design system spacing scale

  Design System Spacing (8px base unit):
  - xs: 4px (0.5 unit)
  - sm: 8px (1 unit)
  - md: 16px (2 units)
  - lg: 24px (3 units)
  - xl: 32px (4 units)
  - 2xl: 48px (6 units)

  Check:
  [] Padding follows spacing scale
  [] Margin follows spacing scale
  [] Gap between elements uses spacing scale
  [] NO arbitrary spacing like 13px or 27px

4. BORDERS & SHADOWS
[] Component uses design system border radius and shadows

  Design System:
  - Border Radius: 4px (small), 8px (medium), 12px (large), 9999px (full)
  - Border Width: 1px, 2px
  - Shadow: Various predefined shadows (sm, md, lg)

  Check:
  [] Button border-radius from design system
  [] Input border-width from design system
  [] Card shadow from design system
  [] NO arbitrary values like border-radius: 7px

5. COMPONENT PATTERNS
[] Component follows established patterns

  Examples:
  - All form inputs have same height
  - All cards have same padding
  - All buttons have same size variants (sm, md, lg)
  - All modals have same overlay opacity
  - All loading states use same spinner

  Check for consistency across components

6. ICONS
[] Component uses design system icon library

  Check:
  [] Icons from consistent library (not mixed)
  [] Icon sizes consistent (16px, 20px, 24px)
  [] Icon color uses design system colors
  [] Icon stroke width consistent

7. ANIMATIONS
[] Component uses design system animation durations and easings

  Design System:
  - Duration: 150ms (fast), 300ms (normal), 500ms (slow)
  - Easing: ease-in-out, ease-out, ease-in

  Check:
  [] Hover transitions use design system durations
  [] Modal fade-in uses standard easing
  [] NO arbitrary durations like 247ms
```

## Design Deviation Bug Report

```markdown
Summary: [Component] - Design System Violation - [Issue]
Example: "Button - Design System Violation - Uses arbitrary color"

Description:
**Component:** Button (Primary variant)
**Location:** Storybook > Button > Primary
**Issue Type:** Design System Inconsistency

**Issue:**
Primary button uses hardcoded color #0055DD instead of design system primary color.

**Design System Expectation:**
Color: $color-primary (#0066CC)
Source: design-tokens.scss, line 12

**Current Implementation:**
Color: #0055DD (hardcoded in button.css, line 45)

**Impact:**
- Inconsistent with brand colors
- Differs from other primary-colored elements
- Makes design system maintenance difficult
- Affects all primary buttons across storefront

**Screenshot:**
[Attach: button-wrong-color.png]
[Attach: design-system-primary-color.png]

**Suggested Fix:**
Replace:
  background-color: #0055DD;
With:
  background-color: var(--color-primary);
  OR
  background-color: $color-primary;

**Additional Notes:**
- Check if other components also use this hardcoded color
- May affect: primary links, primary badges, primary icons

Severity: Medium (visual inconsistency)
Priority: P2
Type: Design System Bug
Labels: design-system, ui, color, button
```
