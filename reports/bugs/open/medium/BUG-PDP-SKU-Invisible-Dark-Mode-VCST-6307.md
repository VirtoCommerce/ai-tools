# PDP: SKU under the product title is invisible in dark mode (1.03:1), Mercury dark preset

## Status: READY_TO_SUBMIT
**Found by:** human · **Tracker:** [VCST-6307](https://virtocommerce.atlassian.net/browse/VCST-6307)

**Severity:** Medium · **Type:** UI / visual (WCAG 1.4.3 contrast) · **Archetype:** design-token defect

## Environment
- vcst-qa storefront, theme `2.60.0-pr-2543-0127` (PR #2543 does not touch the SKU line or presets, so `dev` is affected too)
- Platform `3.1078.0`, WhiteLabeling `3.1005.0`, Catalog `3.1049.0`
- Preset Mercury (default). Anonymous user. Firefox and Edge at 1920×1080 show the same values.

## Steps to reproduce
1. Open any PDP of a product without variations, for example `/products-with-options/cfg-parents/agent-test-config-phone-case` (`@td` product `AGENT-TEST-CFG-020`).
2. In the header, click **Theme: auto** (`data-test-id="dark-mode-toggle"`) once. The page switches to dark and `html.dark` is set.
3. Look at the `SKU #<code>` line under the H1, next to the copy icon.

**Actual:** The SKU text renders `#0d1013` on the `#121317` background, a contrast of **1.03:1**, so it is effectively invisible. Only the copy button can be seen.
**Expected:** The SKU is readable in dark mode, at least 4.5:1 (WCAG 1.4.3), as it is in light mode (18.28:1).

![dark zoom](../../screenshots/PDP-SKU-Invisible-Dark-Mode/pdp-sku-dark-zoom.png)

Folder: `reports/bugs/screenshots/PDP-SKU-Invisible-Dark-Mode/` (`pdp-sku-dark.png`, `pdp-sku-light.png`, `pdp-sku-dark-zoom.png`).

## Measurements

| State | Element | Color | Background | Ratio |
|---|---|---|---|---|
| Dark | SKU label + value (16px, 400/900) | #0d1013 | #121317 | **1.03 FAIL** |
| Dark | Copy button icon | #e7eef3 | #0a090b | 16.96 |
| Light | SKU label + value | #0d1013 | #fafafa | 18.28 |

Console: 0 errors related to this bug. Edge shows one unrelated 404 for a catalog image.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | computed styles above + screenshots |
| 2. Backend Admin | N/A | pure CSS/token defect |
| 3. GraphQL xAPI | N/A | `product.code` is returned and rendered correctly |
| 4. Platform REST API | N/A | not involved |

**Owning layer:** Layer 1 — Storefront

## Root Cause Analysis
- `client-app/pages/product.vue` L33 (`dev`): `<span class="text-base text-secondary-900">`. This is the only `text-secondary-900` usage in vc-frontend.
- `client-app/assets/presets/mercury.dark.json` and `default.dark.json` only **partly invert** the secondary scale:
  - Inverted: 50, 100, 200, 600 and 700 (`#1e242c` … `#a9bccb`).
  - Left at the light values: 300, 400 and 500, and **800 `#242b34`, 900 `#0d1013`, 950 `#010202`**.
  - Result: the dark scale is out of order and `secondary-800..950` are near-black on a dark background.
- Every other `*.dark.json` preset (coffee, red, black-gold, watermelon, purple-pink) fully inverts the scale, for example coffee.dark `secondary_900 #cbdce3`. Only Mercury/default is affected.
- Introduced by VCST-4702 (#2202) and kept by VCST-5433/5452 (#2407, last change to `mercury.dark.json`).
- Latent risk: in `html.dark`, badge and button variants (`--soft`, `--surface`, `--ghost`, `--outline` secondary) fall back to `--color-secondary-900` wherever their `--color-vc-text-*` override is not set.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend PDP header (SKU line) + Mercury/default dark preset tokens
- **RCA anchor:** `client-app/assets/presets/mercury.dark.json` + `default.dark.json` `color_secondary_800/900/950` (and 300–500); `client-app/pages/product.vue:33` `text-secondary-900`
- **Routing confidence:** HIGH. Fix it in the preset (invert 300–950 the way coffee.dark does). The narrower option is to switch the SKU to a theme-aware token, for example `text-neutral-900`.
