

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
* Add **`play`** functions to encode interaction flows (used by Test Runner).
* Addons to enable: **A11y**, **Viewport**, **Backgrounds**, **Outline**, **Measure**, **Interactions**, **Design tokens** (if you have them).
* Keep stories **deterministic**: mock dates, random, timers, network.


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
