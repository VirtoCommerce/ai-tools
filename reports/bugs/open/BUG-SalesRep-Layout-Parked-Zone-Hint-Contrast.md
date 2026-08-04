# BUG — Sales Rep saved layout: the "Hidden stats" parked-zone hint fails WCAG AA contrast in BOTH themes (worse in light)

**Severity:** Medium (P2) · A11y — WCAG 2.2 AA 1.4.3 Contrast (Minimum) · Storefront (Sales Rep hub dashboard + customer profile, layout edit mode)
**Env:** vcptcore-qa @ theme `vc-theme-b2b-vue-2.55.0-pr-2400-c6ca`, `VirtoCommerce.SalesRep 3.1001.0-pr-6-4f32` · Chrome 1920×1080
**Ticket:** VCST-5367 (vc-frontend PR #2400)

## Summary

The placeholder hint **"Drag a stat here to hide it"** inside the striped parked zone
(`div.layout-stats__parked-zone`) is rendered in a grey that is far too low-contrast against its own
hatch background. Measured from the rendered pixels it reaches only **2.02:1 in dark mode** and
**1.75:1 in light mode**, against a 4.5:1 requirement for normal text — it fails even the lenient
3:1 large-text threshold, so the verdict does not depend on the font size.

This corrects an earlier impression that the issue was dark-mode-specific: **light mode is the worse
of the two.** The dark palette is otherwise correctly inverted (per PR #2400's request for one visual
pass), so this is a single token choice, not a theme-inversion bug.

## Steps to reproduce

1. Sign in as a Sales Rep and open `/company/dashboard`.
2. Click **Edit layout**.
3. Look at the striped **"Hidden stats"** zone below the visible stats row (it is empty, so it shows
   its placeholder hint). Repeat with the header theme switcher set to `dark` and to `light`.

## Expected vs Actual

| | |
|---|---|
| **Expected** | The hint text meets WCAG 2.2 AA 1.4.3 — ≥ 4.5:1 against **both** hatch stripe tones, in both themes. |
| **Actual** | Dark: **2.02:1** / **2.40:1**. Light: **1.75:1** / **1.80:1**. Fails AA in every combination, and fails the 3:1 large-text floor too. |

Measured values (sampled from the element screenshots below, WCAG relative-luminance formula):

| Theme | Text | Hatch stripes | Ratio vs stripe A | Ratio vs stripe B |
|---|---|---|---|---|
| Dark | `rgb(83,83,85)` | `rgb(36,36,37)` / `rgb(20,20,21)` | **2.02:1** | **2.40:1** |
| Light | `rgb(189,189,189)` | `rgb(247,247,247)` / `rgb(250,250,250)` | **1.75:1** | **1.80:1** |

Because the background is a two-tone hatch, the text must clear 4.5:1 against the *worse* stripe, which
is the lighter one in dark mode and the darker one in light mode.

## Evidence

![Dark mode parked-zone hint](../../tickets/VCST-5367/screenshots/SR-HD-042-dark-parked-zone-hint.png)
![Light mode parked-zone hint](../../tickets/VCST-5367/screenshots/SR-HD-042-light-parked-zone-hint.png)

## Notes

- The hint is the **only** thing that explains what the striped zone is for when it is empty, so it is
  load-bearing instructional text, not decoration.
- Same component renders on the customer profile, so the fix covers both surfaces.
- Not reproducible via Lighthouse on this page — the Chrome DevTools MCP browser has no `--secrets`
  support and so cannot sign in to reach `/company/dashboard`; the ratios above were computed from
  captured pixels instead, which measures what a real user actually sees.
