# Design / a11y report: VCST-6255, Sales Rep Hub "Reporting" (/company/customer-sales)

qa-design skill: NOT loaded. vc-test:ui-ux-expert is not installed, so qa-testing-expert ran this lane as the fallback, following `visual-axis.md` and the qa-accessibility method.
Env vcptcore-qa · SalesRep 3.1017.0-pr-28-9f00 · theme 2.62.0-pr-2624-0539 · lane playwright-edge · 2026-11-04 08:13–08:21Z
Accounts: SR_REP_PRIMARY (agent-test-sr-primary, "Priya Rao", 7 customers) and SR_REP_PAGING (zero data, 15 customers). Plugin chunks loaded; no CDN-variant symptoms.

## Axis verdicts
| Axis | Verdict | Basis |
|---|---|---|
| vs. DESIGN | **SKIPPED: no design link.** The ticket names the "Paprika Front Design prototype" but has no Prototype link, so there was no `.design-source/<uuid>/` to extract from. The attachment `image-20261021-115641.png` is an early reference, not a spec. | `visual-axis.md` §3 |
| design-system | **SKIPPED** (fallback lane: no `tokens:check` / `design-system-consistency` pass) | — |
| BL-UI invariants (layout) | **PASS**, 1 Low advisory | see §BL-UI |
| a11y (WCAG 2.2 AA) | **FAIL (non-blocking)**: 2 confirmed findings plus advisories. axe found 0 violations in light and in dark. axe could not judge 36 SVG text nodes ("incomplete"), so those were measured by hand. | see §A11y |
| State stress | **PASS** for zero data, 375 / 768 / 1920, and dark mode. **Loading: carried, not re-observed** (see below). **Theme preset: not testable.** The storefront has only a light/dark/auto switch and no preset switch, so the result holds for Coffee only. | — |

## BL-UI (layout)
- BL-UI-003/001, period switch Current year → Q3 → 12 months: CLS 0.0001. The cards below move up 30 px when switching to a closed period, because the "month to date" tile and its progress bar drop out. That move follows a click and new content, so it is not a layout-shift defect.
- BL-UI-004, long customer name: "AGENT-TEST-Org-BuildRight-20260310" in a 216 px field (scrollWidth 299) is cut with `text-overflow: ellipsis`. **PASS.** In the open list, names wrap mid-token ("…-20260 / 310") but are not clipped.
- BL-UI-004, 375 / 768: no document overflow (scrollWidth 360 / 753). Month labels are single letters (J F M…). Toolbar tabs wrap to two rows. At 375 the table becomes a stacked list whose values stay inside the 330 px container. "Upcoming" is rotated vertically and not clipped. **PASS.** (4v-11, 4v-12, 4v-13)
- Badge and label overlap: none at the three widths.
- Advisory (Low, CONTENT): the last x-axis label reads **"Dec ·"** / **"D ·"**, a stray separator (a11y tree `Dec ·`). Same in both charts and at every width.

## A11y (WCAG 2.2 AA)
**Contrast, measured from computed style**

| Element | Light | Dark |
|---|---|---|
| y-axis ticks, "Upcoming" caption, "Dec" label | 7.81 | 10.01 |
| x-axis labels | 15.1 | 14.9 |
| Badge text (↑ up / ↓ down) | 9.21 / 7.85 | 7.8 / 6.95 |

**Non-text, 1.4.11, target 3:1**

| Element | Light | Dark |
|---|---|---|
| Soft closed-month sales bar | **1.33** | 14.97 |
| AOV closed-month bar | **1.48** | **1.92** |
| To-date fill and dashed outline (#F99E24) | **2.11** | 9.41 |
| "Upcoming" dashed outline | **1.48** | **1.92** |
| Legend swatches | same as the bars they stand for | same |

- Classification: **ADVISORY, not FAIL.** The page gives an equivalent text alternative ("Show as table": every month with Sales / Orders / AOV), so the bars are not the only carrier of the data. In dark mode the AOV series is the weakest: grey bars on near-black at 1.92:1, at grid-line strength (4v-15). This follows the inverted dark ramp: neutral-300 becomes a dark grey.
- Non-colour cues for up/down: **PASS.** The badges carry the ↑ / ↓ glyph plus the words "up" / "down".
- Keyboard walk, 1920: All orders → 6m / 12m / Current year / Q1–Q4 (aria-pressed exposed) → Customer combobox → Last-year switch → chart (roving tabindex, starts at Jan; Arrow keys / End reach Nov; Upcoming Dec is not focusable) → AOV switch → AOV chart → "Show as table". Focus ring is 1.6 px #1B789B at about 4.9:1 on white, visible on every stop. **PASS.**
- "Show as table" is a native `<details><summary>`, operable with Enter, and the browser exposes its expanded state natively. **The earlier SBTM note (#4, "generic, no role / expanded state") is a false positive** caused by the Playwright snapshot's role mapping.
- Escape closes a keyboard-focus tooltip. **PASS.**

**A11Y-1, 4.1.2 Name, Role, Value — FAIL.** Each "Last year" toggle is `<button class="vc-switch__bg">` with no `role="switch"` and no `aria-checked` / `aria-pressed`. After switching it ON, the attributes are still only `aria-label` and `type`, and the name stays "Show last year on …". A screen reader cannot tell on from off.
- Names do differ between the two charts ("…on Monthly sales · 2026" / "…on Average order value"). Each chart also has a second `button` with the same name: the label "Last year", which has tabindex -1.
- The component is the UI-kit `VcSwitch`, so this is probably a pre-existing kit defect. Ownership should be confirmed at triage.
- Track contrast: off 1.48 light / 1.92 dark; on 2.11 light (also kit-level).
- Evidence: 4v-06.

**A11Y-2, 1.4.13 Content on Hover or Focus (dismissible) — FAIL.** A tooltip opened by mouse hover over a bar does not close with Escape: the hover tooltip "Jul 2026 AOV $133" stayed visible after Escape. Escape only closes the keyboard-focus tooltip. With the mouse resting on one bar and keyboard focus on another, two tooltips show at once (4v-05).

**Advisories (Low)**
- Tooltip under the sticky header: when a focused tall bar sits near the top of the viewport, its tooltip renders underneath the header. The tooltip is at y 61–121, z-index 1; the header is z-index 2. Focus itself is still visible, so 2.4.11 passes (4v-03).
- Bar accessible names are the month only ("Oct"). The value comes through `aria-describedby` → tooltip, which works while focused.
- Opening the Customer combobox with Tab auto-expands the list. This is shared VcSelect behaviour.
- Touch targets at 375 px: switch 30×18, "All orders" 79×18. These pass on the 2.5.8 spacing exception, so WARN only. Chart hit areas use the equivalent-function exception (the table).
- Busy state (row 27 / B35): during a loaded transition no `aria-busy` exists anywhere and the tiles hold "$0 / 0 / —". Edge loaded too fast to catch the 2–10 s window the SBTM saw on firefox, so this is carried from there rather than re-proven here.

**Not concluded (manual):** screen-reader output (no NVDA/JAWS), WCAG 2.2 criteria 2.5.7, 3.2.6, 3.3.7 and 3.3.8, and non-Coffee presets.

## Zero-data rep (SR_REP_PAGING)
The layout holds with "All my customers (15)", $0 / 0 / —, a y-axis from $0 to $4 and no empty state, as the SBTM already noted (4v-16). The progress bar shows 13.3 % with "projected $0".

## Console
No application errors on the page. Two "404 when fetching the script" entries appeared around navigation and sign-out with no source URL. They look like the service-worker script, not a plugin chunk: the page rendered fully both times.
