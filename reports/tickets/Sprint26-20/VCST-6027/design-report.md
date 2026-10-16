# VCST-6027 — Step 4v design / a11y / UX report (Chrome DevTools MCP, anonymous)

Target: local storefront http://localhost, build `2.59.0-pr-2527-d089-d08928e7`. Pages: `agent-test-cfg-checklist-all-types` (CFG-034), `agent-test-wedding-cake-cond`, simple product PDP (baseline). Viewports 1920x1080 and 375x812 (mobile emulation). Theme: the build's default preset only — Coffee/Red preset toggle was NOT run (`INCONCLUSIVE` for per-preset contrast).

## Axis verdicts

| Axis | Verdict | Evidence |
|---|---|---|
| vs. DESIGN | `SKIPPED — no design link` (Figma only, no `.design-source/`) | — |
| BL-UI-001 layout stability | **FAIL** | CLS 0.128 on CFG-034 (simple PDP baseline 0.024); 0.093 on cond page. See F1 — **PRE-EXISTING (5-triage re-measure: identical CLS 0.112/0.147 on the deployed theme WITHOUT the checklist; not caused by PR #2527)** |
| BL-UI-002 spacing | PASS | ul padding 10, margin-top 16, row gap 8/14, label-to-link 2 — all on the Tailwind/vc-frontend scale |
| BL-UI-003 state shift | PASS (advisory note) | Typing in Text: Add to cart offset in sidebar 104 -> 104 (0 px). Checklist shrank 384 -> 370 (link line dropped), so the widget action bar below moves up 14 px (content-driven) |
| BL-UI-004 content boundary | PASS | 1920: 2-line clamp, every label scrollWidth = clientWidth (192/192, 82/82...); 375: 283/283, 231/231; no horizontal scroll (375/375). Row 1 clamps 42 -> 28 px with ellipsis as intended (full text only in `title`, not reachable by touch) |
| BL-UI-005 alignment | PASS (at limit) | icon centre vs first-line centre Δ = 1 px on every row (16 px icon, 14 px line-height) |
| BL-UI-006 touch targets | PASS by spacing exception, advisory | Links 39-67 x 14 px (< 24 px high); neighbour link gap 30-60 px (>= 8). Passes 2.5.8 only through the spacing exception |
| A11y — BL-A11Y-001 keyboard | PASS | Tab from "In stock" lands on "Fill it in" (rect 39x14) with 2px solid #1b789b ring, offset 2, `:focus-visible` true; Enter moves focus to the target section header (`button.vc-widget__header-container`) and scrolls it into view. Disabled Add to cart is skipped (native `disabled`); checklist follows it in DOM order |
| A11y — BL-A11Y-002 naming | PASS with note | Links named "Fill it in" / "Upload a file" / "Review" with `aria-describedby` -> row label (a11y tree shows `description="Text — required"`). Three identical "Review" names rely on description only (WCAG 2.4.4 passes, 2.4.9 AAA weak) |
| A11y — BL-A11Y-003 contrast | PASS (default preset) | on #fafafa: done label 11.6, required label 10.09, optional label 6.22; icons 6.88 / 7.75 / 4.34 (>= 3); link 6.82. Status not colour-only: done = check glyph + sr-only "(completed)"; required/optional carry the words "— required"/"— optional". Note required and optional share the same alert glyph (differ by colour + word) |
| A11y — BL-A11Y-004 status/live | **FAIL (advisory-to-medium)** | No `aria-live`/`role=status` inside the checklist (only the global Notifications region is live). Typing into Text flipped the row required -> done and a dependent reveal adds rows with nothing announced. See F3 |
| axe-core (wcag2a/aa/21/22aa) | checklist clean | 0 violations scoped to the checklist/price block |
| UX heuristics | see below | |

## Findings

**F1 — BL-UI-001 FAIL: the checklist pops in after first paint and pushes the widget footer.** _5-triage correction: re-measured ×3 per page against the deployed theme without the checklist — identical shift values (0.1033 @ ~1.7 s, 0.0677) ⇒ the CLS is PRE-EXISTING (configuration area loading), not attributable to the checklist._
`PerformanceObserver('layout-shift')`, cache disabled, 1920 px. CFG-034: total 0.128; the 0.1047 shift at t=1459 ms sources `vc-widget__footer-container` + page `FOOTER`. Cond page: total 0.093, shift 0.0686 at t=1945 ms where `vc-widget__footer-container` moves y 517 -> 627 = +110 px = checklist height 94 + margin-top 16. Baseline simple PDP: 0.024 (FOOTER only). Hence the checklist renders after the price block/action bar is already painted (reserve space or render with the block). n=1 per page, local dev build with cache disabled — repeat before filing. Severity Medium (CLS 0.1-0.25, revenue PDP).

**F2 — Mobile discoverability (UX, Nielsen #1/#9, sev 2-3).** At 375 px the checklist is in "Share & Actions" at page y=2210 of 3483; the sticky floating bar (y 668-812, 144 px) shows a disabled Add to cart with no reason and no link to the checklist or sections. The disabled button is native `disabled` with no `aria-describedby`. Desktop is fine (checklist directly under Add to cart, ~40 px away). While scrolling the floating bar covers the bottom of the checklist (the last "Review" link sat 4 px above the bar when focused — WCAG 2.4.11 borderline, not a confirmed failure; INCONCLUSIVE).

**F3 — No live announcement of status changes (BL-A11Y-004).** Row state changes are visual only. Medium. (Not verified with a screen reader: requires manual verification.)

## UX notes
- Redundancy: the old per-section red "Complete all required options to finalize your selection" (2 instances on CFG-034, colour #800f0f) still shows beside the new "— required" rows. Same information twice; the section prompt is contextual so it is tolerable, but the sentence adds noise once the checklist exists (sev 1-2, Nielsen #8).
- Optional rows use the same amber alert glyph as a warning, so four amber "!" read as problems although nothing blocks purchase (sev 2, Nielsen #2/#8). Optional rows are not grouped (matches ticket text; mockup differed).
- Done row for Text shows only "Text (completed)" while Layers/Filling show "Section — value": a typed value is not echoed (observation; check against the AC, not asserted as a bug).
- Link and label type is 12 px / 14 px line-height: smallest text in the widget.

## Incidental (not filed)
- axe full-page: `label` (critical) on two radio inputs `#vc-radio-button-637-input`, `#vc-radio-button-656-input` in the configuration sections (outside the checklist); `aria-prohibited-attr` incomplete on `div[aria-labelledby="title13"/"title17"]`. Likely pre-existing.
- Clicking a radio's product image on the cond page did not change the selection (only the product link responds) — possibly by design, not investigated.

## Screenshots (`screenshots/`)
`VCST-6027-4v-desktop-1920-all-types.png`, `-desktop-focus-link.png`, `-desktop-after-link-enter.png`, `-desktop-cond-initial.png`, `-mobile-375-top.png`, `-mobile-375-checklist.png`, `-mobile-focus-last-link.png`.

## Not run
Coffee/Red preset a11y toggle; Firefox/Edge; the dependent-section reveal live (red row appearing) was not driven; Lighthouse; skeleton/loading state under throttle.
