# /qa-design — /account/missions

**Date:** 2026-10-01 · **Target type:** Page (off-matrix, Case C) · **Ticket context:** VCST-5957
**Build:** `Ver. 2.59.0-pr-2524-3069-30691594` · vcst-qa · `playwright-edge` · `@td(LOY_PERSONAL_NOORG)`
**Viewports:** 375 / 768 / 1280 · **Preset:** Red only (no preset picker; Coffee not possible) · theme restored to auto
**Method deviation:** helper snippets pasted as trimmed ports (`run_code_unsafe` blocked on the lane); `classifyPropertyChanges` / `summarizeDesignFindings` ran through the real helper; focus checked by one real Tab, not the full `focusIndicatorAudit` sweep.

## Invariant Results (1280 unless stated)

| Invariant | Result | Evidence |
|-----------|--------|----------|
| BL-UI-001 CLS | **FAIL** (viewport-dependent) | No card-grid skeleton; grid arrival shift 0.1008 on full load at 1920×1080. SPA-nav figure 0.115 superseded: input-exempt at normal latency (N1, see VCST-6145 evidence-2026-10-01-1701) |
| BL-UI-002 spacing | PASS | 39 elements, 0 off-grid at all 3 viewports; grid gap 20 |
| BL-UI-003 hover shift | PASS | CTA hover Δ0 on all cards |
| BL-UI-004 overflow | PASS | No h-scroll at 1280/768/375 |
| BL-UI-005 alignment | PASS | Row drift 0 at 3/2/1 columns |
| BL-UI-006 touch targets | PASS page / **FAIL** SKU modal 375 | Stepper 32×32 with 1 px gaps (U2) |
| PROPOSED-BL-UI-008 text contrast | PASS | Dark h1/intro flags are false positives (sibling backdrop) |
| WCAG 1.4.11 non-text contrast | **FAIL** (art-dependent) | Completed check over `success-400 @0.75`: ~2.55 dark / 2.04 light (VCST-6142) |
| PROPOSED-BL-UI-009 focus | PASS (partial) | 2 px `#3b82f6` ring on card CTA via real Tab |
| PROPOSED-BL-UI-010 image aspect | PASS | `object-fit: cover`; crop is a visual finding (V1) |
| PROPOSED-BL-UI-007 occlusion | PASS | No overlaps |
| WCAG 4.1.3 alert semantics | WARN | SKU modal estimate `vc-alert` has no live region (static; not filed) |
| DESIGN-STROKE mechanism | WARN | `vector-effect: none` on all 124 svgs (site-wide) |

## State-Stress Matrix

| State | Result |
|---|---|
| Default 1280 / 768 / 375 | As above |
| Dark 1280 | Check contrast FAIL (A3); rest PASS |
| SKU modal 1280 / 375 | U2 stepper gaps, N2 tab order ≠ visual order (375), F08 bare `0` subtotal |
| Order modal 1280 | No `role=progressbar` (A2, VCST-6143); points chip red vs amber on card |
| Loading | No grid skeleton (N1); transient, evidenced by observer log |
| Empty | **Skipped** — account has 12 missions, no way to reach zero |
| Coffee preset | **Skipped** — not exposed by the store |

## Sized Controls

| Control | Expected | Rendered | Aspect | Shot |
|---|---|---|---|---|
| Card CTA | 38 | 38×38, r 8 (×12) | square | `storefront/sized-cta-38-focused-1280.png` |
| Banner icon circle | 56 | 56×56 (×2) | circle | `storefront/sized-banner-icon-56-1280.png` |
| Completed check | 56 | 56×56 (×4) | square | `storefront/sized-done-check-56-light-1280.png` |

## Design Spec Diff — 518d0b90 / Changes artifact ef9240f0

**Axis verdict:** `DRIFT (1 failing, 4 advisory, 0 clean)` · **Unresolved spec entries:** 10 · **Source:** extractor output (6 change rows); token / icon-parity / geometry / stroke `SKIPPED — no local copy of project 518d0b90 at .design-source/518d0b90-03fa-4d3f-9183-f7e6a4033346/`

| Subject | Axis | Spec | Live | Verdict |
|---|---|---|---|---|
| Banner height | property | 210 | 208 | **DRIFT** |
| Grid gap | property | 20 | 20 | CONFIRMED |
| Card CTA | property | 38 | 38 | CONFIRMED |
| Top-banner accent border | property | 4 | 4 | CONFIRMED |
| Completed check | property | 56 | 56 | CONFIRMED (size only) |
| Banner icon circle | property | 56 | 56 | CONFIRMED |

**Hand-checked, not extractor-derived** (remain in the unresolved count):

| Spec row | Live | Verdict |
|---|---|---|
| Completed overlay `success-600 @55%` | `success-400 @0.75` | **DRIFT** — root of A3/A4 |
| Banner image 600×360 WebP, cover | `.svg` 1200×480 / `.png` 2048×768, cover | **DRIFT** (CMS fixtures) |
| Card shadow `0 4px 6px -1px / 0 2px 4px -2px @10%` | spread `0` on layer 1 | DRIFT (minor) |
| Banner title ls 0.02em | 0.025em (0.35 px) | DRIFT (minor) |
| Gradient off · type chip · points chip · progress label · banner modifiers · banner shadow · banner CTA | as spec | CONFIRMED (×7) |

## Visual Findings (caught by visual review, not invariant snippet)

- **V1** 208 px banner crop shows ~55% of artwork width at 1280; baked-in text cut mid-word.
- **V2** Completed check is a thin ring, hard to see over pale art — overlay does not adapt (confirms A3/A4).
- **V3** Points chip amber on card, red in both modals.
- **V5** Redeem banner looks like a card but is not clickable.

## Prior Findings (VCST-5957 design-report) — delta on this build

Still present: banner 208, A1 identical "Open mission" names, A2 no progressbar role (VCST-6143), A2 unnamed check svg, A3/A4 check contrast (VCST-6142), U2 stepper gaps, D1 bespoke shadow, F08 bare `0`, F02 non-clickable banner, polish #1–#3.
Not reproducible: U1 pagination gap (only 2 pages in current data). Not re-tested: D2, polish #4.

## New Findings

| ID | Cite | Sev. | Finding |
|---|---|---|---|
| N1 | BL-UI-001 | Medium | Card grid renders with no skeleton; footer jumps ~1.1k px, 0.1008 counted on full load at 1920×1080 (root-caused: VCST-6145 #5) |
| N2 | WCAG 2.4.3 | Low-Med | SKU modal 375: DOM order Close→Add to cart, visual order reversed (KB-CE2F9A45) |
| N3 | WCAG 4.1.3 | Low | Estimate alert not a live region — advisory, not filed |
| N4 | DESIGN | Low | Rollup of Changes-artifact deviations (overlay token, image format, shadow spread, tracking) |

## UX Heuristics (Nielsen 0–4)

Visibility 2 · Real-world match 1 · Consistency 2 · Recognition 1 · Aesthetic 2 · others 0 / n/a. None ≥ 3.

**Off-matrix note:** `/account/missions` is not in `critical-ui-scope.md`. Consider promoting it.
**KB:** captured KB-C4597892, KB-CE2F9A45.
