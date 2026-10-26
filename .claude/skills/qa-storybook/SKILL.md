---
name: qa-storybook
description: "[Testing] Storybook component testing: states, responsive breakpoints, interactions, in-story a11y, Atomic Design. Pixel regression is /qa-visual-regression."
argument-hint: "component name | atoms | molecules | organisms | all"

---

# /qa-storybook — Storybook Component Testing

Test Storybook components for responsive behavior, state completeness and in-story a11y. **Pixel regression is not done here:** it is the `PIXEL` instrument of [`/qa-visual-regression`](../qa-visual-regression/SKILL.md), a scripted base-vs-head comparison. Delegates to **ui-ux-expert** agent with Chrome DevTools MCP.

## Usage
```
/qa-storybook Button               # Test a specific component
/qa-storybook atoms                 # Test all atom-tier components
/qa-storybook molecules             # Test all molecule-tier components
/qa-storybook organisms             # Test all organism-tier components
/qa-storybook all                   # Every component
```

## Supporting Files

- **tooling-stack.md** — SB 9 package map (`storybook/test`, `@storybook/addon-vitest`, a11y addon, Chromatic), determinism rules, CI gating, hosted-vs-dev caveat, boundary with `/qa-accessibility`. **Read first.**
- **play-function-patterns.md** — Canonical interaction-test patterns using `storybook/test` (`expect`, `userEvent`, `fn`, `step`); when `play` is the wrong tool.
- **how-to-test-storybook.md** — What to test per component (rendering, a11y, interactions, visual, composition, i18n, error boundaries); negative/edge scenarios.
- **visual-regression-testing.md** — Pointer: pixel regression moved to `/qa-visual-regression`, and why the old by-eye baseline template was retired.
- **responsive-component-testing.md** — Responsive testing across the DERIVED viewport sweep (`AUDIT_VIEWPORTS_PX` from `scripts/lib/design-tokens.generated.ts`, never a transcribed width list): layout adaptation, touch targets, text reflow, image scaling.

## Execution

1. **Resolve Storybook URL** from environment: `STORYBOOK_URL` (QA) or `STORYBOOK_DEV_URL` (dev)

2. **Identify target components:**
   - If component name: find matching stories in Storybook
   - If tier (atoms/molecules/organisms): test all components in that Atomic Design tier

3. **Delegate to ui-ux-expert** via Task tool (`subagent_type: ui-ux-expert`):
   - Pass component name(s), Storybook URL
   - Agent uses Chrome DevTools MCP for screenshot capture
   - Agent reads supporting files from this skill folder for methodology

4. **For each component, test:**
   - All story variations (default, hover, focus, error, loading, disabled)
   - The derived viewport sweep (`AUDIT_VIEWPORTS_PX` — real ui-kit breakpoint edges, just-below, and fluid midpoints; see `responsive-component-testing.md` §Where the widths come from)
   - A pixel comparison is not part of this pass. When the risk needs one, run `/qa-visual-regression`

5. **Output:**
   - Findings per component/state/viewport; evidence under `{RUN_DIR}/screenshots/`
   - Summary: X components tested, Y passed, Z findings

## Rules
- Always capture all documented states, not just the default
- Use naming convention: `{story-name}-{viewport}.png`
- Hosted Storybook is a **production build** — `import.meta.env.DEV === false`. Don't verify DEV-only warnings here (see `tooling-stack.md`).
- A11y assertions: on the **Coffee** and **Red** presets (the two WCAG-gated themes); `/qa-visual-regression` may shoot any theme. Select via `?globals=themePreset:red;darkMode:light` and confirm the preset applied (async import) before asserting.

## Boundary with `/qa-accessibility`
- `/qa-storybook` — a11y addon **inside stories** (component-isolated, axe rules per component).
- `/qa-accessibility` — full-page audits on storefront/admin (keyboard journeys, landmarks, page-level contrast).
- If a finding reproduces in a story, it belongs here. If it only appears once composed into a page, it belongs to `/qa-accessibility`.
- When you need a **programmatic** axe run on a rendered story (outside the addon — e.g. asserting against a specific story iframe), use the shared `axeRunSnippet()` + `classifyAxeResults()` from `scripts/lib/axe-runner.ts` so severity mapping and the "axe-unavailable ⇒ inconclusive, not clean" rule stay identical to `/qa-accessibility`. Visual pixel-diff is `/qa-visual-regression` (`visual:snap` + `visual:diff`; its triage step owns the "intended change?" verdict).
