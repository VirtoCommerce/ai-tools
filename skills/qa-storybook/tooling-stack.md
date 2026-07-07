# Storybook Testing Tooling Stack (SB 9, 2025–2026)

> Reference file for ui-ux-expert + qa-testing-expert. Read before authoring stories or wiring CI. Source of truth for which package does what.

## Package map

| Concern | Package | Notes |
|---|---|---|
| Interaction assertions inside `play()` | **`storybook/test`** | Exports `expect`, `userEvent`, `screen`, `within`, `fn`, `waitFor`, `step`. SB 9 dropped the `@` prefix — old `@storybook/jest` / `@storybook/testing-library` / `@storybook/test` are deprecated. |
| Run all stories as tests in CI | **`@storybook/addon-vitest`** | Default in SB 9. Stories execute under Vitest browser mode + Playwright Chromium — real browser, not jsdom. Replaces `@storybook/test-runner` for most teams. |
| Legacy CLI runner | `@storybook/test-runner` | Maintained but no longer the default. Keep only if Vitest migration is blocked. |
| Accessibility | `@storybook/addon-a11y` | axe-core. Per-story config: `parameters.a11y.config.rules`. |
| Visual regression — default | **Chromatic** | First-party, deterministic browser pool, TurboSnap skips unchanged stories. |
| Visual regression — self-hosted fallback | Playwright `toHaveScreenshot()` driven via `test-storybook --index-json` | Pin a single Linux Chromium image; fonts/AA differ across OS and break baselines. |
| Network stubbing | `msw-storybook-addon` (+ `msw`) | The way to mock fetch/GraphQL inside stories. |
| Coverage | `vitest --coverage` | Free once stories run under Vitest. |
| Story format | **CSF3** | `args`, `play`, `tags`. Tag stories to opt out of autodocs or scope to test sets. |

## What NOT to use (in 2026)

- `@storybook/jest`, `@storybook/testing-library`, `@storybook/test` (old `@`-prefixed package) — replaced by `storybook/test`.
- HTML/DOM snapshot tests as a primary signal — brittle on whitespace/classnames and don't catch what visual snapshots do. Reserve for serializer-style stable output.
- BackstopJS — not actively recommended against SB 9.
- jsdom-based runners for stories that touch layout/media queries — they lie about viewport and `matchMedia`.

## Decision: Chromatic vs self-hosted Playwright snapshots

Pick Chromatic when: cross-PR baseline review UI matters, TurboSnap savings outweigh subscription cost, team is small enough that manual review is sustainable.

Pick self-hosted when: cost is prohibitive, baselines must live in the repo, or you already run Playwright in CI and want one fewer vendor. Trade-off: you own font/AA determinism — pin the image, preload fonts, pause animations.

## Determinism — the non-negotiables

Without these, baselines flicker and CI flakes:

- **Font loading** — add a preview decorator that awaits `document.fonts.ready` before rendering. Otherwise Arial-fallback ↔ real-font swaps cause diffs.
- **Animation/transition** — set `parameters.chromatic.pauseAnimationAtEnd: true` per story; for self-hosted, inject CSS to disable transitions in the test preview.
- **Time/random** — mock `Date.now()`, `Math.random()`, timers (`vi.useFakeTimers()` in Vitest setup).
- **Network** — MSW addon. Never let stories hit a real backend.
- **Viewport** — the Viewport addon resizes an iframe; some `window.matchMedia` reads need a real browser resize. Vitest addon (Playwright) handles this; legacy test-runner does not.

## Hosted Storybook ≠ dev build

Hosted Storybook is `vite build` (production), so `import.meta.env.DEV === false`. DEV-only `console.warn` gates are **dead code** there. Verify deprecation warnings via `npm run dev` or a Vitest unit test that stubs `import.meta.env` — never via hosted Storybook. (Project memory: `feedback_storybook_is_production_build`. False finding VCST-4892 NEW-4 was retracted over this.)

## CI gating — what to fail PRs on

Run `vitest --project=storybook --coverage` (or `test-storybook` if still on the legacy runner). Block merge on:

1. **Interaction test failures** — any `play()` assertion red.
2. **A11y violations of severity ≥ serious** — moderate as warning only. Silence design-system exceptions per-story with `parameters.a11y.config.rules`, never globally.
3. **Unaccepted Chromatic diffs** (or self-hosted pixel diff above threshold).

Parallelize via Vitest's pool (cheap) or Chromatic's TurboSnap. For self-hosted: pin one Linux Chromium runner.

## Boundary with `/qa-accessibility`

- `/qa-storybook` runs the a11y addon **inside stories** — component-level isolation, axe rules tuned per component.
- `/qa-accessibility` runs full-page audits against the storefront/admin — keyboard journeys, landmark structure, page-level contrast.

If a finding is reproducible in a story, it belongs to qa-storybook. If it only appears once the component is composed into a page (focus order across landmarks, modal portal escape, skip links), it belongs to qa-accessibility.

## Project context

- Storybook URLs: `STORYBOOK_URL` (QA), `STORYBOOK_DEV_URL` (dev).
- 55 components total, Atomic Design tiers (atoms / molecules / organisms).
- Coffee is the only A11y-compliant theme (memory: `feedback_a11y_coffee_only`) — gate a11y assertions on Coffee, treat other themes as visual-only.
- Critical UI scope (regression-enforced): VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar — see `knowledge/oracles/critical-ui-scope.md`.
