# VCST-5957 — Visual lane (4v) design report

**Build:** footer `Ver. 2.59.0-pr-2524-3069-30691594` (confirmed) · vcst-qa · account `@td(LOY_PERSONAL_NOORG)` (Customer, no org) · lane `playwright-edge` (Chrome DevTools MCP not used: role-gated + data-bearing, no `--secrets`).
**Theme preset:** **Red** (`--color-primary-500` = `#e52121`; dark mode resolves `#d34247`) — a WCAG-gated preset (VC-UI-001). Coffee pass NOT run (store runs Red only; no preset switch exposed to the account). Theme cycled auto → dark → light → auto; restored to auto.
**Screenshots:** `screenshots/4v-*.png` (page light/dark 1440, page 375, SKU modal 1440/375, order modal in-progress + completed).

## Axis verdicts

| Axis | Verdict |
|---|---|
| a11y (axe 4.10.2, wcag2a/aa/21/22aa) | **0 violations** on page, SKU modal, order modals (light + dark). `incomplete`: color-contrast (8 on page, 3 in SKU modal: overlapping elements/images), aria-hidden-focus (2 HeadlessUI focus guards). Manual items below. |
| BL-A11Y-001 keyboard/focus | **PASS** — modal `role=dialog aria-modal=true`, labelled by its title, `#app` inert; Shift+Tab from first wraps to footer Close, Tab wraps back, Esc closes, focus returns to the originating "Open mission" button. Focus ring 2 px `#3b82f6` (>= 3:1 on white). |
| BL-A11Y-002 names | **FAIL (2 findings)** — A1, A2 |
| BL-A11Y-003 contrast | **FAIL (2 findings)** — A3 (dark), A4 (light, conditional). Chip/title/note/percent/banner text PASS. |
| BL-A11Y-004 role/state | **FAIL (1 finding)** — A2 (progress, no role) |
| BL-UI invariants | BL-UI-006 **FAIL** x2 (U1, U2, both in pre-existing shared components). No other BL-UI check was run at scale (see "Not run"). |
| design-system | **PASS with 2 advisories** (D1, D2) |
| `vs. DESIGN` (DESIGN-PROPERTY) | **DRIFT** (1 of 6 rows; 5 CONFIRMED). Axis cannot be PASS while 10 spec rows are `unresolved`. Token / icon-parity / full-geometry sub-axes: **SKIPPED** — no local copy of project 518d0b90 at `.design-source/518d0b90-03fa-4d3f-9183-f7e6a4033346/`. See section below. |

## vs. DESIGN — DESIGN-PROPERTY results (spec: Changes artifact ef9240f0, `design:extract` merged.changes, 6 rows)

Measured live at 1440 with `propertyAuditSnippet`, classified with `classifyPropertyChanges` (unresolved = 10).

| Row (spec label) | Element · metric | prod → design | Live | Verdict |
|---|---|---|---|---|
| Высота баннера | `.mission-card__banner` height | 144 → 210 | **208** | **DRIFT** — redesign applied (not prod 144), 2 px short of design (`h-52`); PR text says 208, design says 210 |
| Зазор сетки | `.missions__cards` row-gap | 16 → 20 | 20 | CONFIRMED |
| Кнопка перехода | `.mission-card__footer button` height | 44 → 38 | 38 (width 38, radius 8) | CONFIRMED |
| Обводка | `.missions-banner` border-left-width | 1 → 4 | 4 (top/right/bottom 0) | CONFIRMED* |
| Выполненная миссия | `.mission-card__done svg` width | — → 56 | 56 | CONFIRMED (size only; overlay is `success-400 @0.75` vs spec `success-600 @55 %`, see F04 / A3-A4) |
| Круг иконки | `.missions-banner__icon` width | — → 56 | 56 | CONFIRMED (fill `#e52121` solid) |

*the helper has no border-width metric; 4 px was read with `getComputedStyle` and hand-fed to the classifier as a `width` item.
Axis verdict: **DRIFT** (FAIL severity per helper; a 2 px delta, PO call on 208 vs 210). No row MISSING or SKIPPED. `unresolved` = 10: checklist requirements, not vs. DESIGN coverage; the axis can never read PASS while they exist.

## a11y_findings[] (feature ticket: file standalone, non-blocking)

| ID | WCAG SC / BL | Element | Measured | Sev. suggestion | Evidence |
|---|---|---|---|---|---|
| A1 | 4.1.2 / BL-A11Y-002 | 12 card CTAs `button.vc-button--icon` (arrow only) | every card's accessible name is exactly "Open mission" — 12 identical names, none carries the mission title (no `aria-label`/`describedby` linking to the `h3`). Heading list is the only disambiguator | Medium | 4v-missions-page-light-1440.png |
| A2 | 4.1.2 + 1.3.1 / BL-A11Y-002, -004 | `.mission-card__track/__bar` (card) and `.order-mission-modal__track/__bar` (modal) | no `role="progressbar"`, no `aria-valuenow/min/max`, not a `<progress>`; value exists only as adjacent text "0%". Completed `lucide-circle-check` svg (56 px) has no `aria-hidden`, no `<title>`, no `aria-label` and `role` unset: unnamed graphic (state IS also conveyed by the text "Mission completed", so no information is lost) | Medium (progress) / Low (check) | same + 4v-order-modal-completed-light.png |
| A3 | 1.4.11 / BL-A11Y-003 | `.mission-card__done svg` in **dark** theme | check is `#0a0a0a`; over overlay `success-400 @0.75` (`rgb(47,124,87)`) it measures **2.79:1 over dark-navy art, 2.56:1 over black**, 5.47 over light grey. The 4 completed cards' real DONE-15 art is dark navy => **< 3:1 FAIL**. Fallback placeholder in dark theme is light => 5.5 PASS | Medium | 4v-missions-page-dark-1440.png |
| A4 | 1.4.11 / BL-A11Y-003 | `.mission-card__done svg` in **light** theme | white check; overlay `rgb(91,175,127)@0.75`: **2.04:1 over white art**, 2.56-4.49 over the fallback placeholder (measured around the ring, min 2.56 where placeholder strokes are light), 4.16 over dark navy, 4.50 over black. Real artwork pixels could not be sampled (cross-origin canvas taint) => over real DONE-15 art **INCONCLUSIVE, bound 4.16 (dark navy) is PASS**; any banner image lighter than mid-grey (and the default placeholder image) **FAILs 3:1**. Matches discovery estimate (~2.1 / ~3.9). `success-400` is the cause (white/#0a0a0a flips with theme but the overlay does not) | Medium | 4v-missions-page-light-1440.png |

Other contrast (light): note `#737373` on white 4.74; percent/title/date text >= 7; chip text `#0a0a0a` on tonal chips (fill sits on a pseudo-layer, text vs `warning-100`/`info-100` ~17:1 est., not read from the computed fill); soft banner button `rgb(132,41,41)` on `rgb(255,228,230)` ~8:1; date dots 7.18 / 4.53 / 8.09 (>= 3:1); completed bar vs track 3.58 (>= 3:1). Dark: dots 4.64 / 13.31 / 4.64 on card; banner titles 17:1. Chip fill colours in dark were not measurable (transparent computed bg) => visual only.

## invariant_failures[]

| ID | BL | Where | Measured | Note |
|---|---|---|---|---|
| U1 | BL-UI-006 | Pagination page buttons "2..5" at 375 | 32x32 each, **0 px gap** between adjacent targets (needs >= 8 px) | Pre-existing `VcPagination`, not touched by PR #2524. 24 px size gate (WCAG 2.5.8) PASSES. |
| U2 | BL-UI-006 | Quantity stepper in SKU modal at 375 | 32x32 buttons, **1 px gap** to the 56x30 input on both sides | `VcQuantityStepper` reused in the new modal; size PASSES 2.5.8. |

Card CTA 38x38, banner button 38 px, Close 44 px: PASS. No horizontal scroll at 375 (scrollWidth 360 <= 375), modal fits 375 with 0 overflowing children.

## Design-system (live tokens vs generated set)

- Tokens resolve: `success-400 #5bae7e`, `warning-500 #fc9e00`, `danger-500 #de3131`, `info-500 #2b7ea8`, `primary-500 #e52121`. Overlay is `success-400` at 0.75 (token, not a literal). Card `shadow-md` equals Tailwind md (`0 4px 6px -1px / 0 2px 4px -2px` at 0.1). Grid gap 20 px (gap-5), body padding 16, radius 8, banner 208 px (h-52), start-edge accent `4px solid #e52121`, uppercase 14/800 title, solid icon circle `#e52121`.
- Controls reuse kit sizes: `vc-button--size--sm` (38 px), `vc-chip--size--sm` (12 px type), soft banner CTA and `outline` card CTA.
- **D1 (advisory)** Banner shadow is a bespoke two-layer `2px 4px 10px -1px / 0 0 3px` at 0.08, not on the Tailwind shadow scale. **D2 (advisory, needs dev confirmation)** Date dots resolve to `rgb(49,97,68)` / `rgb(171,102,14)` / `rgb(160,19,19)` in light — these are NOT the `-500` tokens (`#3e845b`, `#fc9e00`, `#de3131`); the PR text says "-500 fills". Dark: `rgb(39,134,89)` / `rgb(255,197,61)` / `rgb(211,66,71)`.

## advisory[]

- Observed geometry for DRIFT notes (not a vs-DESIGN verdict): card banner **208 px** (design 210); body order progress note -> bar -> title -> footer (date + CTA); banner heading 14/18 w800 uppercase; fallback art `object-cover` crop.
- SKU modal: "Cart subtotal" and "Total units" render a bare `0` (no currency format) — F08 confirmed on this build (BL-PRICE-003 candidate); first product row shows a raw GUID as title (fixture data, not UI).
- "Redeem your points" banner is a non-interactive block (no link/button) — F02 re-confirmed.
- Dark theme: the 56 px check flips to near-black; the placeholder image goes light grey, so completed cards look different between themes.
- HeadlessUI focus guards flagged by axe `aria-hidden-focus` (incomplete) — library artifact, not filed.
- Lists: mission grid and page list are not exposed as list/listitem (ECL-15.1 row 2, [OBSERVED]) — Low.

## Skipped / not run / manual

- vs. DESIGN token diff, icon parity and full control geometry: **SKIPPED** — no local copy of project 518d0b90 at `.design-source/518d0b90-03fa-4d3f-9183-f7e6a4033346/`. Only the 6 `changes` rows (above) were measured.
- **MANUAL, not PASSed:** screen-reader output (modal announce, "Open mission" disambiguation, check-circle), WCAG 2.2 2.4.11 / 2.5.7 / 3.2.6 / 3.3.7 / 3.3.8 (only 2.5.8 measured), 200 % zoom / 320 reflow, reduced-motion.
- Not run: Coffee preset pass; SKU modal for `@td(MSN_PERSKU_OOS)` (not on page 1 — the OOS row was exercised via `MSN_DL_SKU_NOAVAIL`); deadline cards DUE-01/15/16/30/31 and DONE-15 verified on page 1 only (dot colours and states measured, BL-UI-001/003/005 layout-shift/alignment sweeps and viewport sweep 375->1920 NOT run). No cart or order writes made.
