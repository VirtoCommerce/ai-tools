# VcTabSwitch default hover colour fails WCAG AA in BOTH themes — hovering makes the label less readable — P2

**Severity:** Medium / P2 · **Type:** Accessibility (WCAG 1.4.3 Contrast Minimum)

**Env:** vcptcore-qa @ Platform 3.1069.0, theme `2.58.0-pr-2474-62e6-62e635c6` · store `B2B-store` · chromium 1920, DPR 1

## Summary
`VcTabSwitch` defaults its hover colour to `--hover-color: var(--vc-tab-switch-hover-color, theme("colors.accent.500"))`. On an **unselected** tab the hovered label fails the 4.5:1 AA bar in **both** themes. In light mode hovering actually makes the label *less* readable than leaving it alone (resting 4.543:1 → hovered 3.524:1).

## Steps to Reproduce
1. Open `{{FRONT_URL}}/catalog` (no login needed) — the Grid/List switcher is `view-mode.vue`.
2. Hover the **unselected** tab; read the computed `color` of `button.vc-tab-switch__button` and sample the rendered backdrop.
3. Toggle dark via `[data-test-id="dark-mode-toggle"]`, confirm `<html class="dark">`, repeat.

## Expected vs Actual
**Expected:** ≥ 4.5:1. The label is 16px at weight 700 — below the 18.66px-bold large-text threshold, so the normal-text bar applies.

**Actual:**

| Theme | Hover colour | Backdrop | Ratio | Verdict |
|---|---|---|---|---|
| Light | `#3b82f6` | `#fafafa` | **3.524:1** | FAIL |
| Dark | `#00809d` | `#121212` | **4.081:1** | FAIL |

Resting state for comparison: light `#737373` on `#fafafa` = 4.543:1 (bare pass); dark `#9e9e9e` = 6.992:1. **So in light mode the hover state is the regression** — the control is more legible un-hovered.

Cross-checked on a second consumer (`pages/bulk-order.vue`, `/bulk-order`): identical numbers in both themes, confirming this is component-level, not page-level.

## Root Cause
`client-app/ui-kit/components/molecules/tab-switch/vc-tab-switch.vue` falls back to `accent-500` for `--hover-color`. On this storefront preset `--color-accent-500` **shifts between themes** (`#3b82f6` light → `#00809d` dark) — unlike Storybook's Default preset, where it is stable — and neither value clears 4.5:1 against its own theme's surface.

## Scope
Affects **every consumer that does not override `--vc-tab-switch-hover-color`**: `view-mode.vue`, `variations.vue`, `orders.vue`, `bulk-order.vue`, `shipping-details-section.vue`. The Sales Rep rule chips are **immune** — they override to `neutral-900` (17.18:1 light / 16.15:1 dark), which is exactly the workaround this defect makes necessary.

**Bounded to unselected tabs' text:** on a selected tab the label keeps its own colour, because `input:checked ~ .vc-tab-switch__button` (specificity 0,2,1) beats `.vc-tab-switch__button:hover` (0,2,0). The **icon** is *not* immune — `span.vc-tab-switch__icon` does take the hover colour on a selected tab (`#e52121` → `#3b82f6` / `#00809d`). That is a non-text element judged against the 3:1 bar and was **not measured**; no claim is made about it here.

## Provenance — PRE-EXISTING, not caused by PR #2474
PR #2474 changed only `aria-pressed`/`aria-checked`; it touched no colour, no CSS and no token. Found during the VCST-5890 `/qa-test` run.

## Measurement note
Backdrops were **pixel-decoded from device-scale PNGs taken while the hover was held**, not derived by walking ancestors — `button.vc-tab-switch__button` computes to `rgba(0,0,0,0)` on an unselected tab, so an ancestor walk falls through to the UA white default and fabricates a wrong backdrop. The antialias halo ramping toward the sampled hex is independent confirmation it is the real surface.

## Fix Routing
- **Repo:** `vc-frontend` · `client-app/ui-kit/components/molecules/tab-switch/vc-tab-switch.vue`
- **Kind:** frontend
- Change the default `--hover-color` fallback to a value that clears 4.5:1 in both themes (the Sales Rep override uses `neutral-900` and clears it comfortably), or drop the colour change on hover and signal hover some other way.
- Same class as VCST-5483 (VcButton secondary/outline label, 4.05:1) and VCST-5879 (Compare segmented control, 4.34:1).

## Evidence
`reports/tickets/Sprint26-15/VCST-5890/screenshots/` — `tabswitch-light-hover-list.png`, `tabswitch-dark-hover-list.png`, `bulkorder-light-hover-manually.png`, `bulkorder-dark-hover-manually.png`
