# Responsive Component Testing Guide

> Reference file for ui-ux-expert agent. Read when testing responsive behavior.

## Test Case Template

```markdown
Test Case: TC_RESPONSIVE_COMPONENT_001
Title: Test component responsive behavior

Breakpoints to Test (from design system):
- Mobile: 375px (iPhone standard)
- Tablet Portrait: 768px (iPad portrait)
- Tablet Landscape: 1024px (iPad landscape)
- Desktop Small: 1280px
- Desktop Large: 1920px

For Each Breakpoint:

1. LAYOUT ADAPTATION
[] Component layout changes appropriately
  Mobile: Stacks vertically, full width
  Tablet: 2-column grid
  Desktop: 3-4 column grid

2. CONTENT READABILITY
[] Text readable at all sizes
  Mobile: No text smaller than 14px
  Tablet/Desktop: Comfortable reading size

[] No text cut off or truncated unexpectedly
[] Line length comfortable (45-75 characters ideal)

3. TOUCH TARGETS (Mobile)
[] All tappable elements minimum 44x44px
  Buttons: Min 44x44px
  Links: Min 44x44px (with padding)
  Checkboxes: Min 44x44px (with label)
  Radio buttons: Min 44x44px (with label)

[] Adequate spacing between touch targets (min 8px)

4. IMAGES
[] Images scale appropriately
  Desktop: High resolution (2x if retina)
  Mobile: Optimized, smaller file size

[] No image distortion (maintain aspect ratio)
[] No pixelation or blurriness

5. SPACING
[] Spacing adapts to screen size
  Mobile: Smaller margins/padding (comfortable but not cramped)
  Desktop: Larger spacing (not crowded)

6. OVERFLOW
[] No horizontal scrolling (unless intentional, like table)
[] Content doesn't overflow container
[] Long words break appropriately (word-break or overflow-wrap)

7. NAVIGATION
[] Mobile navigation appropriate (hamburger menu, etc.)
[] Desktop navigation visible
[] Navigation accessible at all sizes
```

## Testing Methods

```markdown
1. Browser DevTools Responsive Mode:
   [] Open component
   [] Open DevTools
   [] Click device toolbar (responsive mode)
   [] Test each breakpoint
   [] Rotate device (portrait <-> landscape)

2. Real Device Testing:
   [] Test on actual iPhone
   [] Test on actual Android device
   [] Test on actual iPad
   [] Note: Real devices show issues emulators miss!

3. Use playwright for automated responsive screenshots:
   [] Capture component at each breakpoint
   [] Review screenshots for issues
   [] Compare mobile vs tablet vs desktop layout
```
