# Storybook workflow — how `vc-test:ui-ux-expert` audits a component in Storybook

Read by `vc-test:ui-ux-expert` before a Storybook pass (its body points here). Storybook is the vc-frontend UI kit's;
a customer with a different storefront codebase brings its own.

## Storybook Testing Workflow (10 steps)

> **Tooling baseline (Storybook 9):** `storybook/test` for interaction assertions (no `@` prefix in SB 9), `@storybook/addon-vitest` is the modern test runner (Vitest browser mode + Playwright Chromium), `@storybook/addon-a11y` for axe-core, MSW addon for network stubs. See `tooling-stack.md` and `play-function-patterns.md` for canonical patterns (in this repository: `.claude/skills/qa-storybook/tooling-stack.md`, `.claude/skills/qa-storybook/play-function-patterns.md`).

1. **CONTROLS TAB**: Document all props. Test each: default, all enum options, booleans, edge values (empty, very long, 0, negative)
2. **ACCESSIBILITY (axe-core via addon-a11y + programmatic re-run)**: Read the addon panel for violation count; then run axe programmatically against the story iframe (recipes in [`wcag-accessibility-checklist.md`](../../knowledge/wcag-accessibility-checklist.md)) — for each finding note WCAG 2.2 criterion ID, severity, affected element. Filter out `best-practice` tag results (advisory, not WCAG failures). Surface `incomplete` items as manual-verification needed.
3. **INTERACTIONS / ACTIONS**: For stories with `play` functions, verify expected events fire (`fn()` spies from `storybook/test`) and disabled state emits no events. See `play-function-patterns.md` for canonical patterns.
4. **THEME PRESET**: Capture **Default + Coffee + Red** for visual diff. **Run a11y assertions on Coffee AND Red** — those are the two WCAG-gated presets in this project; the rest are visual-only. In Storybook, select a preset via the `themePreset` global (`?globals=themePreset:red;darkMode:light`) and **confirm it actually applied before asserting** — the preset is loaded by an async dynamic import, so poll until `getComputedStyle(document.documentElement).getPropertyValue("--color-primary-500")` matches the preset (Red = `#e52121`). Theme switch must not break layout (no FOUC, no token drift).
5. **RESPONSIVE**: 375px (mobile), 768px (tablet), 1280px (desktop). Layout adapts, text readable. Touch targets: **≥ 24×24 CSS px (WCAG 2.5.8 AA gate)** for any viewport, ≥ 8 px gap on ≤ 768 px (`BL-UI-006`). 44×44 (AAA) is advisory, never a FAIL.
6. **INTERACTIVE STATES**: Hover, focus, active, disabled, loading, error — all render correctly. Focus indicator ≥ 3:1 against background (WCAG 1.4.11).
7. **CROSS-BROWSER**: Critical components (VcAddToCart, VcProductCard, VcButton, VcTable) in Chrome + Firefox + Edge. WebKit on Windows: NOT supported — use Edge.
8. **STATE STRESS**: drive each story through long-content (80-char title, 12-digit SKU, German-equivalent label), empty (0 items, no image), loading (skeleton), and error (validation message inserted). Capture each. No overflow, no collapsed dimensions, no skeleton→content shift.
9. **INTERACTION-SHIFT**: record `getBoundingClientRect()` of a neighbor sibling. Trigger hover / focus / badge update / skeleton-resolve. Re-record. Δposition must be 0 px (BL-UI-003).
10. **VIEWPORT SWEEP**: drag viewport 375 → 1920 in 50 px steps. Watch for horizontal scroll, sticky double-stack, text wrap-cliffs, mid-breakpoint dead zones at 1024 / 1280. Capture at every breakpoint boundary ±1 px.

**Determinism (mandatory for stable baselines):** Await `document.fonts.ready` before screenshotting, set `parameters.chromatic.pauseAnimationAtEnd: true` per story (or disable CSS transitions in the test preview), mock `Date`/`Math.random`/timers, stub network with MSW. Without these, baselines flicker and CI flakes. **Caveat — hosted Storybook is a production build (`vite build`), so `import.meta.env.DEV === false`**: never verify DEV-only `console.warn` gates against hosted Storybook (; lesson: VCST-4892 NEW-4 retraction).

## Component Library — 55 Components, Atomic Design

**ATOMS (18):** VcBadge (16 stories), VcCheckbox, VcDialog, VcIcon, VcPriceDisplay, VcRadioButton, VcSwitch, VcTypography, VcLabel, VcInputDetails, VcProperty, VcProductTitle, VcProductActions, VcScrollbar, VcMarkdownRender, VcCarouselPagination, VcVariantPickerGroup

**MOLECULES (30, 256 stories):** VcButton (22), VcAlert (17), VcChip (19), VcVariantPicker (19), VcWidget (19), VcRating (15), VcNavButton (14), VcProductActionsButton (12), VcMenuItem (10), VcSlider (10), VcWidgetSkeleton (9), VcLineItems/VcLineItem (15), VcInput (0 — **untested**), VcSelect (0 — **untested**)

**ORGANISMS (7, 75 stories):** VcProductCard (28), VcTable (19), VcPagination (11), VcAddToCart (6), VcQuantityStepper (6), VcProductImage (4), VcProductButton (1)

**Testing Priority:** High story count (>15): VcProductCard, VcButton, VcAlert, VcChip, VcVariantPicker, VcWidget, VcTable, VcBadge, VcRating. Revenue-critical: VcAddToCart, VcQuantityStepper, VcProductCard, VcLineItems, VcPagination.
