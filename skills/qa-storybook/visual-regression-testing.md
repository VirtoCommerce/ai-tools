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

Visual Regression Tools (in order of preference):
- **Chromatic** (default) — first-party Storybook integration, deterministic browser pool, TurboSnap skips unchanged stories, baseline review UI per PR.
- **Playwright `toHaveScreenshot()`** (self-hosted fallback) — drive with `test-storybook --index-json` if Chromatic cost is prohibitive. Pin a single Linux Chromium image; fonts and AA rendering differ across OS and will break baselines.
- Percy — viable alternative to Chromatic; pick whichever has the cheaper plan for the team size.
- *Avoid:* BackstopJS (not actively recommended against SB 9), HTML/DOM snapshot tests as a primary signal.
```

## Determinism — required for stable baselines

Without these, you'll fight flake instead of finding regressions:

- **Font loading** — preview decorator that awaits `document.fonts.ready` before rendering. Otherwise Arial-fallback ↔ real-font swaps cause diffs.
- **Animations/transitions** — set `parameters.chromatic.pauseAnimationAtEnd: true` per story, or inject CSS to disable transitions in the test preview.
- **Time/random** — mock `Date.now()`, `Math.random()`, timers (`vi.useFakeTimers()` in setup).
- **Network** — MSW addon (`msw-storybook-addon`). Stories must not call live backends.
- **Theme scope** — Coffee is the only A11y-compliant theme (memory: `feedback_a11y_coffee_only`); capture all themes for visual diff, but assert a11y only on Coffee.

See `tooling-stack.md` for the full package map and CI gating rules.
