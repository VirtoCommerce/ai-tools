# Responsive Component Testing Guide

> Reference file for ui-ux-expert agent. Read when testing responsive behavior.

## Test Case Template

```markdown
Test Case: TC_RESPONSIVE_COMPONENT_001
Title: Test component responsive behavior

Viewports to Test: the DERIVED sweep — never a transcribed list.
See "Where the widths come from" below the template.

For Each Viewport:

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

## Where the widths come from

**Do not hand-list the breakpoints.** They are derived. Sweep `AUDIT_VIEWPORTS_PX` from
[`scripts/lib/design-tokens.generated.ts`](../../../scripts/lib/design-tokens.generated.ts) — every real
ui-kit breakpoint edge, just below it, and the fluid midpoints. The named edges themselves are
`BREAKPOINTS_PX` (`xs` 480 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` **1500** — the ui-kit's
`2xl` is *not* Tailwind's 1536 default). Both are regenerated from vc-frontend by `npm run tokens:sync`
and drift-gated in CI by `npm run tokens:check`.

**Why this file no longer names widths.** It previously transcribed a five-width list
(375 / 768 / 1024 / 1280 / 1920) under the heading "from design system". That list omitted three real
breakpoints outright — `xs` 480, `sm` 640 and `2xl` 1500 — while including 375 and 1920, which are device
widths, not breakpoints. A sweep built from it samples *around* the bands where responsive bugs live and
still reports every viewport green, which is the silent-failure direction:
[`.claude/rules/test-data.md`](../../rules/test-data.md) §GOLDEN RULE. The same transcribed list was
already replaced by this same pointer in the edge-case oracle on 2026-08-27 — see the
"Overflow only in the fluid band between fixed breakpoints" row in
[`e-commerce-edge-cases-library.md`](../../knowledge/oracles/e-commerce-edge-cases-library.md);
this skill was missed in that pass.

When a finding is viewport-specific, cite the **width in px**, not a tier name — "overflow at 1500" is
reproducible, "overflow on desktop" is not.

## Testing Methods

```markdown
1. Browser DevTools Responsive Mode:
   [] Open component
   [] Open DevTools
   [] Click device toolbar (responsive mode)
   [] Test each viewport in the derived sweep
   [] Rotate device (portrait <-> landscape)

2. Real Device Testing:
   [] Test on actual iPhone
   [] Test on actual Android device
   [] Test on actual iPad
   [] Note: Real devices show issues emulators miss!

3. Use playwright for automated responsive screenshots:
   [] Capture component at each viewport in the derived sweep
   [] Review screenshots for issues
   [] Compare mobile vs tablet vs desktop layout
```
