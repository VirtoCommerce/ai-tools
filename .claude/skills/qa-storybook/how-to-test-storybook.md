

# What to test in storybook (per component)

**1) Rendering & Props**

* Renders with minimal required props.
* Applies className/style/size/variant/disabled/aria-\*.
* Controlled vs uncontrolled (inputs, toggles).
* Edge props: null/undefined/empty strings/long text/0 values.

**2) Accessibility**

* Correct roles, names, descriptions.
* Keyboard navigation (Tab/Shift+Tab), focus trap if modal/popover.
* ARIA states update on interaction.
* Color contrast (light/dark themes).
* RTL layout and screen-reader semantics.

**3) Interactions**

* Click, type, pointer, hover, blur, Escape/Enter/Space.
* Debounced/throttled handlers; async states (loading/spinner).
* Disabled states do **not** fire events.

**4) Visual**

* States: default/hover/active/focus/disabled/loading/error/success.
* Theming (light/dark/brand themes).
* Responsive breakpoints, container width changes.
* Long/overflowing strings; truncation/ellipsis; wrap.

**5) Composition**

* As child/with icon/with prefix-suffix slots.
* Inside common containers (cards, lists, forms).
* Portals (modals/tooltips) + z-index layering.

**6) Internationalization**

* RTL mirroring, long German/Russian/Hungarian strings.
* Locale-specific formatting (dates, numbers) where relevant.

**7) Error boundaries (if any)**

* Rendering failure fallbacks; prop validation warnings.

# Storybook best practices

* Use **Controls** to expose all important props; hide noisy/internal ones.
* Each distinct state is its own **Story**. Avoid “kitchen sink” stories.
* Add **`play`** functions (import from `storybook/test` — SB 9 dropped the `@` prefix) to encode interaction flows. See `play-function-patterns.md` for canonical examples.
* CI runner: **`@storybook/addon-vitest`** is the default in Storybook 9 — runs stories under Vitest browser mode + Playwright Chromium. The older `@storybook/test-runner` (Jest+Playwright) is still maintained but no longer the default. See `tooling-stack.md`.
* Addons to enable: **A11y** (`@storybook/addon-a11y`), **Vitest** (`@storybook/addon-vitest`), **MSW** (`msw-storybook-addon` — network stubs), **Viewport**, **Backgrounds**, **Outline**, **Measure**, **Interactions**, **Design tokens** (if you have them).
* Keep stories **deterministic** — without these, baselines flicker and CI flakes:
  * Await `document.fonts.ready` in a preview decorator (fonts).
  * `parameters.chromatic.pauseAnimationAtEnd: true` per story, or disable CSS transitions in the test preview.
  * Mock `Date.now()`, `Math.random()`, timers.
  * Stub network with MSW — never let stories hit a real backend.

# Hosted Storybook vs `npm run dev`

Hosted Storybook is a **production build** (`vite build`), so `import.meta.env.DEV === false`. DEV-only `console.warn` / debug-log gates are **dead code** there. Verify deprecation warnings via local `npm run dev` or a Vitest unit test that stubs `import.meta.env`, never via the hosted instance. (Project lesson: VCST-4892 NEW-4 was retracted over this.)


# Accessibility checklist (per story)

* Has semantic role (`button`, `link`, `dialog`, etc.).
* Has accessible name/description; visible label ↔ accessible name match.
* Focus order and focus ring visible; Escape/Enter work where expected.
* No axe violations; contrast ≥ WCAG AA (3:1 for UI icons, 4.5:1 for text).
* Works with keyboard **only** (no mouse).
* Screen reader announcements for dynamic states (loading, errors).

# Negative & edge scenarios (don’t skip)

* Disabled state blocks pointer/keyboard & doesn’t emit events.
* Very long text / zero-width / RTL / emoji.
* Empty lists, loading, error fallback UIs.
* Boundary sizes: 240px containers, min/max width, zoom 200%.
* Rapid repeated clicks / keypresses (debounce/throttle).
* Portals near viewport edges (tooltip positioning, collision handling).
* Timeouts/promises rejected; network mocks fail.
* Theme switch at runtime; dark mode + high contrast OS setting.
