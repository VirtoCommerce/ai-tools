# BUG: Systemic WCAG 1.4.3 Color Contrast Failure — Primary Brand Color

**Severity:** High (Legal/Compliance Risk) · **Priority:** P1 · **Type:** Accessibility · **WCAG:** 1.4.3 Contrast (Minimum), Level AA
**Scope:** Platform-level design token (`--color-primary-500`) — affects every component using primary color, every page sitewide.

**Env:** vcst-qa Storybook + Storefront (`https://vcst-qa-storybook.govirto.com`, `https://vcst-qa-storefront.govirto.com`) · Discovered 2026-02-23 · ui-ux-expert (playwright-firefox + axe-core).

## Summary

Primary brand color `--color-primary-500: #f99e24` against white text produces **2.112:1** contrast — WCAG 2.1 AA requires **4.5:1** for normal text. This is a single design-token defect that cascades through every component using primary in solid/outline/interactive variants, and through every storefront page (cart badge, search button, nav icons, add-to-cart "+", outline "X Variationen", 404 CTA). Fix at the token chain, not per component.

## Reproduction Steps

**Storybook (component layer):**
1. Open `https://vcst-qa-storybook.govirto.com` → Atoms > VcBadge → Basic story.
2. Open Accessibility tab (bottom panel).
3. Observe **Serious** `color-contrast` violation: bg `rgb(249,158,36)` / fg `rgb(255,255,255)` / ratio `2.11:1` / required `4.5:1`.
4. Repeat for: VcButton (Basic), VcChip (Basic), VcDialog (Basic), VcProductButton (Basic) — all FAIL with the same ratio.

**Storefront (production layer):**
1. Open `https://vcst-qa-storefront.govirto.com` (any page).
2. DevTools → inspect cart badge in header → Styles shows `color: rgb(249,158,36)` on `#ffffff`.
3. Calculated contrast: **2.112:1** — fails AA normal text threshold.

## Expected vs Actual

| | Expected (WCAG AA) | Actual |
|---|---|---|
| Primary solid (orange bg + white text) | ≥ 4.5:1 normal text | **2.112:1** FAIL |
| Primary outline (white bg + orange text) | ≥ 4.5:1 normal text | **2.112:1** FAIL |
| Primary hover (`primary-600` bg + white) | ≥ 4.5:1 | **4.158:1** FAIL (close) |
| Secondary solid (`#688198` + white) — related | ≥ 4.5:1 | **4.052:1** FAIL (borderline) |

## Root Cause

The component CSS rule selects white text (`--color-additional-50`) on a primary-500 background that is too light to support it:

```css
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-additional-50);  /* #ffffff — fails 4.5:1 */
}
```

The `warning` color already has the dark-text exception. Primary needs the same pattern (or token darkening / dual-token system).

## Evidence

- `reports/bugs/screenshots/storefront-header-orange-elements.png` — sitewide failing header elements
- `reports/bugs/screenshots/storefront-catalog-page.png` — outline + solid primary buttons on PLP
- `reports/bugs/screenshots/storefront-product-detail-chips.png` — stepper, pickup link, action icons

## Scope (count)

- **Components:** VcBadge, VcButton, VcChip, VcDialog, VcProductButton, VcAddToCart, VcQuantityStepper (icon-only — manual review needed).
- **Storybook stories affected:** ~30–40 (across 7 components).
- **Storefront pages affected:** all (cart badge + navigation are sitewide).

## Recommended Fix (one-liner)

**Option 1 (recommended, lowest risk):** change `--text-color` for all primary solid/outline rules from `var(--color-additional-50)` to `#171717` (or `var(--color-neutral-900)`). Brand orange preserved; ~8.5:1 contrast achieved. Same pattern already used for the `warning` color class.

See [BUG-WCAG-Primary-Color-Contrast-investigation.md](BUG-WCAG-Primary-Color-Contrast-investigation.md) for: full contrast tables across the primary-50…950 scale, three fix options with code samples and trade-offs, per-component CSS variant tables, per-page failing-element inventory, secondary-color analysis, severity/compliance assessment, recommended JIRA ticket text.

## BL / ECL Refs

- WCAG 2.1 SC 1.4.3 Contrast (Minimum), Level AA
- Legal: ADA (US), EN 301 549 (EU), AODA (Canada)
