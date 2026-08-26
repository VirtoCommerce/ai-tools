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

---

## Re-verification 2026-08-26 — STILL REPRODUCES, and the root cause is NOT "a single token choice"

Re-measured live on **vcst-qa @ Theme 2.56.0-pr-2451** (this report used vcptcore-qa @ 2.55.0-pr-2400), signed in as a Sales Rep, `/company/dashboard` → **Edit layout**, light mode.

**Independently reproduced, to within rounding of the original numbers:**

| | This report | Re-measured 2026-08-26 |
|---|---|---|
| Light, vs stripe A | 1.75:1 | **1.79:1** |
| Light, vs stripe B | 1.80:1 | **1.73:1** |

Computed from live `getComputedStyle` values rather than sampled pixels, which is why they land a hair apart — the conclusion is identical, and it independently corroborates the original pixel sampling.

**The mechanism is two-part, and this report attributes it to only one.** From the live DOM:
- hint text token: `rgb(163,163,163)`, `font-size: 14px` (so the 4.5:1 normal-text threshold applies)
- hatch stripes: `rgb(250,250,250)` / `rgb(245,245,245)`
- **and the container carries `opacity: 0.7`** — `layout-stats.vue`: `&__parked-zone { @apply opacity-70; … }`

Because the opacity applies to the *whole zone*, text and background are composited toward the page white **together**, which compresses the contrast between them. Effective rendered values are `rgb(191)` text on `rgb(252)`/`rgb(248)` stripes — and `rgb(189,189,189)` is exactly what this report sampled, confirming the mechanism.

**Why this matters for the fix:** this report concludes *"this is a single token choice, not a theme-inversion bug"* and implies re-picking the text token is sufficient. It is not. Removing the opacity alone yields **2.42:1 / 2.31:1** — still failing both 4.5:1 and the 3:1 large-text floor. The token alone, under `opacity-70`, cannot reach 4.5:1 without going nearly black. **Both must change**: darken the hint token *and* stop applying `opacity-70` to a container holding load-bearing instructional text (apply it to the hatch background instead, e.g. via a `::before` layer, so the text is not dimmed with it).

That reframing also answers the report's own observation that the hint is "load-bearing instructional text, not decoration" — the `opacity-70` is a decorative treatment applied to a non-decorative element.

Dark mode not re-measured (this run was light-only); the source is shared, and light was already the worse of the two.

**Verdict: still open, Medium — root cause enlarged.** VCST-5367 / vc-frontend PR #2400.
