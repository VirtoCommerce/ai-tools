# WCAG 2.1 AA Accessibility Checklist

> Reference file for ui-ux-expert agent. Read when performing accessibility audits.

## Four WCAG Principles: POUR

**P - Perceivable** | **O - Operable** | **U - Understandable** | **R - Robust**

## Complete Accessibility Checklist

```markdown
Test Case: TC_A11Y_COMPONENT_001
Title: Accessibility audit for [ComponentName]

PRINCIPLE 1: PERCEIVABLE
Information and UI components must be presentable to users in ways they can perceive.

1.1 Text Alternatives:
[] All images have alt text
  - Decorative images: alt="" (empty)
  - Informative images: descriptive alt text
  - Product images: alt="[Product Name]"
[] Icons have accessible labels
  - aria-label or aria-labelledby
  - Or visible text label
[] SVG icons have <title> or aria-label

1.2 Time-based Media:
[] Videos have captions (if videos present)
[] Audio content has transcripts (if audio present)

1.3 Adaptable:
[] Content is presented in meaningful order (reading order)
[] Relationships are programmatically determined
  - Form labels associated with inputs (for/id)
  - Headings nest properly (h1 > h2 > h3, no skipping)
[] Instructions don't rely only on sensory characteristics
  - Bad: "Click the round button"
  - Good: "Click the 'Add to Cart' button"

1.4 Distinguishable:
[] Color Contrast (CRITICAL):
  Use Chrome DevTools contrast checker:
  - Normal text (< 24px): 4.5:1 minimum
  - Large text (>= 24px or >= 19px bold): 3:1 minimum
  - UI components (borders, icons, focus indicators): 3:1 minimum

  Test all combinations:
  - Text on background
  - Buttons (all states)
  - Links
  - Form inputs
  - Icons
  - Error messages
  - Success messages
  - Focus indicators

[] Color is not the ONLY way information is conveyed
  - Error: not just red color, also icon + text
  - Success: not just green, also icon + text
  - Required fields: not just red asterisk, also (required) text

[] Text can be resized to 200% without loss of content or functionality
  Test: Browser zoom to 200%, verify:
  - No text cut off
  - No overlapping content
  - Still functional

[] Images of text avoided (use actual text when possible)
  Exception: Logos

[] Reflow (responsive):
  At 320px width (mobile), no horizontal scrolling except:
  - Data tables
  - Images
  - Toolbars

PRINCIPLE 2: OPERABLE
UI components and navigation must be operable.

2.1 Keyboard Accessible:
[] ALL functionality available via keyboard
  Test: Use ONLY keyboard (no mouse):
  - Tab through all interactive elements
  - Enter/Space activates buttons/links
  - Arrow keys navigate (if applicable, e.g., dropdowns)
  - Escape closes modals/dropdowns

[] No keyboard trap
  - Can Tab into and OUT of every component
  - Can close modals with Escape + keyboard

[] Focus order is logical
  - Follows visual order (top to bottom, left to right)
  - Modal traps focus when open
  - Focus returns to trigger after modal closes

2.2 Enough Time:
[] No time limits (or adjustable/extendable)
[] Can pause/stop/hide moving content (carousels, animations)

2.3 Seizures and Physical Reactions:
[] No content flashes more than 3 times per second

2.4 Navigable:
[] Skip links available ("Skip to main content")
[] Page has descriptive title (<title>)
[] Focus order is logical
[] Link purpose clear from link text or context
[] Multiple ways to find pages (menu, search, sitemap)
[] Headings and labels are descriptive
[] Focus indicator visible (3:1 contrast ratio minimum)

2.5 Input Modalities:
[] Touch targets: minimum 44x44px on mobile
[] Functionality doesn't require specific hand movements
  (can be operated with single pointer)

PRINCIPLE 3: UNDERSTANDABLE
Information and operation of UI must be understandable.

3.1 Readable:
[] Language of page identified in HTML
  <html lang="en">
[] Language of parts identified if different
  <span lang="es">Hola</span>

3.2 Predictable:
[] Components don't change on focus
  (no automatic navigation when tabbing through)
[] Components don't change on input
  (no auto-submit unless user warned)
[] Consistent navigation across pages
[] Consistent identification (icons/labels same meaning throughout)

3.3 Input Assistance:
[] Error identification:
  - Errors clearly identified
  - Error descriptions provided

[] Labels or instructions:
  - Form fields have visible labels
  - Required fields clearly marked
  - Instructions provided when needed

[] Error suggestion:
  - Suggested corrections provided
  - Example: "Email must include @"

[] Error prevention (critical actions):
  - Confirmation step before submit (checkout, delete, etc.)
  - Can review/correct before final submission

PRINCIPLE 4: ROBUST
Content must be robust enough to be interpreted by a variety of user agents, including assistive technologies.

4.1 Compatible:
[] Valid HTML
  - No duplicate IDs
  - Proper nesting
  - Required attributes present

[] Name, Role, Value available:
  - Custom components have appropriate ARIA
  - aria-label, aria-labelledby when needed
  - aria-describedby for additional context
  - role attribute for custom components
  - State changes announced (aria-live, aria-expanded, etc.)
```

## Accessibility Testing Tools Usage

```markdown
1. Automated Scan (axe DevTools):
   [] Open component in browser
   [] Open axe DevTools
   [] Click "Scan ALL of my page"
   [] Review issues by category:
     - Critical
     - Serious
     - Moderate
     - Minor
   [] For each issue:
     - Understand the problem
     - Verify it's a real issue (false positives happen)
     - Document in bug report with WCAG criterion

2. Manual Keyboard Test:
   [] Use ONLY keyboard (unplug mouse if needed)
   [] Tab through component
   [] Verify:
     - Can reach all interactive elements
     - Focus indicator visible
     - Can activate all buttons (Enter/Space)
     - Can close modals (Escape)
     - No keyboard trap
   [] Document any issues

3. Screen Reader Test:
   Use VoiceOver (Mac) or NVDA (Windows):
   [] Activate screen reader
   [] Navigate through component
   [] Verify:
     - All content is announced
     - Labels are clear and descriptive
     - Images have appropriate alt text
     - Form fields have labels
     - Error messages are announced
     - State changes are announced
     - Headings announce correctly
     - Landmarks are identified
   [] Document issues

4. Color Contrast Check:
   [] Open Chrome DevTools
   [] Inspect element
   [] In Styles panel, find color values
   [] Use built-in contrast checker or external tool
   [] Check ALL color combinations:
     - Text on background
     - Hover states
     - Focus states
     - Disabled states
     - Error/success states
   [] Document any failures (< 4.5:1 or < 3:1)

5. Zoom Test:
   [] Zoom browser to 200% (Cmd/Ctrl + Plus)
   [] Verify:
     - All text readable
     - No content cut off
     - Layout doesn't break
     - Still functional
   [] Zoom to 400% (maximum WCAG requires)
   [] Verify still usable

6. Responsive Test:
   [] Resize to 320px width (smallest mobile)
   [] Verify:
     - No horizontal scrolling
     - Content reflows
     - Text readable
   [] Test touch targets on actual mobile device
     - All tappable areas minimum 44x44px
```

## Accessibility Bug Report Format

```markdown
Summary: [Component] - A11y: [WCAG Criterion] - [Issue]
Example: "ProductCard - A11y: WCAG 1.4.3 - Insufficient color contrast"

Description:
**Component:** ProductCard
**Location:** Storybook > ProductCard > Default
**WCAG Criterion:** 1.4.3 Contrast (Minimum) - Level AA
**WCAG Level:** AA

**Issue:**
Product price text has insufficient color contrast against background, failing WCAG 2.1 AA requirements.

**Impact:**
Users with low vision or color blindness may have difficulty reading product prices, potentially affecting purchasing decisions.

**How Detected:**
Tool: Chrome DevTools Contrast Checker
Location: Price element
Measured contrast: 2.8:1
Required contrast: 4.5:1 (for normal text)

**Current Implementation:**
- Text color: #999999
- Background color: #FFFFFF
- Font size: 16px (normal text)
- Contrast ratio: 2.8:1

**WCAG Requirement:**
- Normal text (< 24px): 4.5:1 minimum
- Large text (>= 24px or >= 19px bold): 3:1 minimum

**Suggested Fix:**
Change text color to #757575 or darker
- New contrast ratio: 4.52:1 (meets WCAG AA)

OR change text color to #666666
- New contrast ratio: 5.74:1 (exceeds WCAG AA)

**Affected Areas:**
- ProductCard component (Storybook)
- Product listing page (storefront)
- Search results page (storefront)
- Related products section

**Assistive Technology Impact:**
- Low vision users: Difficulty reading prices
- Color blind users: May not see price at all depending on type
- Screen reader users: Not affected (text still readable by screen readers)
- Screen magnification users: Contrast still inadequate when zoomed

**Severity:** High (affects accessibility compliance)
**Priority:** P1 (accessibility violations should be fixed)
**Type:** Accessibility Bug
**Labels:** accessibility, a11y, wcag-2.1-aa, contrast, ui
**WCAG Criterion:** 1.4.3
**Component:** ProductCard
```
