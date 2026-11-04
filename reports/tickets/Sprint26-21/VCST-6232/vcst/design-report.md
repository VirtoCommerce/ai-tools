# Design report — VCST-6232 (visual lane, `ui-kit`)

**Lane:** `vc-test:ui-ux-expert` on playwright-edge · **Preset:** red (coffee derived, not run) · **Surfaces:** classic-PR (vcst, theme 2.62.0-pr-2600), classic-BASE (local build of base `dev@4ce61d0c`, same backend), soft-PR (local build of a4f29534 with `design: soft`, same backend), Storybook-PR (local, a4f29534).
**Method:** whole-DOM computed-style sampling (12 properties per element: font family/size/line height/weight/letter spacing, 4 corner radii, box-shadow, text-transform, font-style, `--tw-shadow-colored`), paired by DOM path with a tag+class fallback; read-only `getComputedStyle` / `getBoundingClientRect` / FontFaceSet / axe 4.10.2. Raw data: `test-results/edge/v6232/` (not committed).

## Axes

| Axis | Verdict | Basis |
|---|---|---|
| Classic regression (AC-1) | **PASS** | 0 differences classic-PR vs classic-BASE: home, category, PDP, `/cart` (checkout), `/account/orders`, `/account/dashboard` × light/dark — 34,421 samples. Gaps: no h4–h6 on any sampled page; no explicit `shadow-<colour>` utility in use |
| Soft rendering | **PASS** | Inter body / Geologica headings, faces `loaded`; `--vc-radius` 1rem → buttons, inputs, widgets, dialogs, cards 16px, in-input buttons 14px |
| Soft coverage of the Goal families (AC-2) | **NOT MET** | Soft changes radius (token consumers only), font family and footer-title case. Shadows, font size, line height, weight, letter spacing and italic are unchanged; no dark-mode value |
| Colour (AC-4) | **PASS** | 238 `--color-*` identical soft vs classic-BASE, light and dark; only 3 custom properties differ (`--vc-radius`, `--vc-base-font-family`, `--vc-heading-font-family`) |
| BL-UI-004 / 005 (soft, 375 + 1280) | **PASS** | No document overflow, 0 row-height violations; ellipsised labels pre-exist on classic |
| a11y (axe, home light/dark) | **PASS** | 0 soft-only violations; the one/three `color-contrast` hits on Builder text are identical on classic |
| Storybook (C-15) | **PASS** | Classic 8px Lato no link → Soft 16px Inter one link → Classic restores |
| design_system | **PASS WITH NOTES** | Literal 3–6px radii (inner input, checkbox, coupon card, menu items, table sort button) do not follow the token; heading-like text that is not h1–h6 (`vc-widget__title`, stat figures) stays Inter; Builder CMS blocks keep Lato |
| vs. DESIGN | SKIPPED | No design prototype linked on the ticket |

## Advisory (UNSPEC, not defects)

- Soft print keeps the h1 uppercase; only footer titles change case.
- Four 18px/700 uppercase section titles on order details render in Inter, not Geologica (not h1–h6).

## Incidental (not caused by the PR)

- vcst shows a version-mismatch notification on every page that overlays the header and intercepts clicks (environment).
- The QA env badge covers the header Theme toggle at 1280 px (stand only).
- At 375 px the notification-bell badge "10" wraps onto two lines; dark-mode Builder headings have low contrast — both identical on classic.
