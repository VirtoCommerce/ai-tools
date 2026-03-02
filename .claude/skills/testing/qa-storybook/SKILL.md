---
description: "[Testing] Storybook visual regression: baselines, responsive breakpoints, state variations, Atomic Design."
argument-hint: "component name | atoms | molecules | organisms | all"
disable-model-invocation: true
---

# /qa-storybook — Storybook Component Testing

Test Storybook components for visual regression, responsive behavior, and state completeness. Delegates to **ui-ux-expert** agent with Chrome DevTools MCP.

## Usage
```
/qa-storybook Button               # Test a specific component
/qa-storybook atoms                 # Test all atom-tier components
/qa-storybook molecules             # Test all molecule-tier components
/qa-storybook organisms             # Test all organism-tier components
/qa-storybook all                   # Full visual regression run
```

## Supporting Files

- **visual-regression-testing.md** — Test case template for visual regression: capture baselines, compare states (default/hover/focus/error/loading), pixel diff workflow
- **responsive-component-testing.md** — Responsive testing at 5 breakpoints (375px, 768px, 1024px, 1280px, 1920px): layout adaptation, touch targets, text reflow, image scaling

## Execution

1. **Resolve Storybook URL** from environment: `STORYBOOK_URL` (QA) or `STORYBOOK_DEV_URL` (dev)

2. **Identify target components:**
   - If component name: find matching stories in Storybook
   - If tier (atoms/molecules/organisms): test all components in that Atomic Design tier
   - Baselines stored in `storybook/{tier}/{component}/baselines/`

3. **Delegate to ui-ux-expert** via Task tool (`subagent_type: ui-ux-expert`):
   - Pass component name(s), Storybook URL, baseline directory
   - Agent uses Chrome DevTools MCP for screenshot capture
   - Agent reads supporting files from this skill folder for methodology

4. **For each component, test:**
   - All story variations (default, hover, focus, error, loading, disabled)
   - 5 responsive breakpoints (mobile 375px → desktop 1920px)
   - Compare against existing baselines if present
   - Flag pixel differences > threshold

5. **Output:**
   - Visual diff report with pass/fail per component/state/viewport
   - New baselines saved to `storybook/{tier}/{component}/baselines/`
   - Summary: X components tested, Y passed, Z regressions found

## Rules
- Always capture all documented states, not just the default
- Use naming convention: `{story-name}-{viewport}.png`
- Baseline directory structure follows Atomic Design: `storybook/atoms/`, `storybook/molecules/`, `storybook/organisms/`
- If no baseline exists, the first capture becomes the baseline
