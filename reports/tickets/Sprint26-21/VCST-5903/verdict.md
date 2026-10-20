# VCST-5903 — PASS WITH NOTES
The new UI-kit card `VcStatWidget` (vc-frontend PR #2568 @ 3f8af63a, QA Storybook on vcst) renders its anatomy, colours, states, tokens and locale strings as the mockups and the PR describe; two Minor (P3) defects — whitespace input and long-figure overflow — are filed as sub-tasks.
Page: https://claude.ai/artifact/BBb8pwBV6rSsm9LX8x2zhe

The ticket has no ACs ("No requirements."), so the conditions are the two mockups and the PR #2568 body.

| Condition | Result | Evidence |
|---|---|---|
| Card anatomy matches the mockups (bar, icon, label, figure, description, delta) | PASS | screenshots/A1-basic-mockup-card-1920.png |
| Colours: bar/icon -500, delta -700, unset = neutral, 8 colours | PASS | screenshots/A6-colors-1920.png |
| Unit suffix de-emphasised on the figure line | PASS | screenshots/A7-with-suffix.png |
| States: loading outranks error, label always visible, live changes repaint | PASS | screenshots/A9-error-after-loading-off.png |
| Empty value shows the dash; a blank figure never reads as a value | FAIL — whitespace (VCST-6427) | screenshots/A3-value-space-blank-figure-FAIL.png |
| Figure stays inside the card, never wraps mid-number (BL-UI-004) | FAIL — 9-digit figure @1024 (VCST-6428) | evidence-A11/screenshots/02-colors-1024-123M-past-border-REPRO.png |
| Long labels, equal row heights, alignment (BL-UI-005) | PASS | screenshots/A1-A13-row-1920.png |
| Tokens `--vc-stat-widget-*` and token audit | PASS | screenshots/V-b2-tokens-set-on-wrapper.png |
| Contrast, Coffee preset light + dark (WCAG 1.4.3) | PASS | design-report.md |
| Status strings in 13 locales | PASS | testing-checklist.md A14 |
| Sales Rep Hub dashboard 093, P0 cases, on the PR theme | PASS — 0 failures caused by the PR | reports/regression/REG-2026-10-19-1307/regression-2026-10-19.md |

## Bugs
- Low — VcStatWidget treats a whitespace-only value or errorText as real content — reports/bugs/open/low/BUG-VcStatWidget-Whitespace-Value-ErrorText-VCST-6427.md (VCST-6427)
- Low — VcStatWidget: a long figure paints past the card border in a narrow grid cell — reports/bugs/open/low/BUG-VcStatWidget-Long-Figure-Overflows-Card-VCST-6428.md (VCST-6428)

Needs review, not filed (questions for the PO / developer):
- V1 — a card on its own is 156 / 106 / 92 px in ready / loading / error, so content below it moves 50–64 px; the shipping Sales Rep Hub card behaves the same (evidence-V1/)
- X2 — the loading overlay blocks the pointer on a `prepend` control (keyboard still reaches it)
- S2 — the mockup draws an unchanged trend in blue (`deltaColor` info); the kit story uses neutral grey

## Not tested, and why
- Unknown `color` value falls back to neutral (A5) — Storybook rejects values outside the 8 options; source shows the neutral path
- Screen-reader announcement on first render (R6) — no screen reader in the toolkit; manual check needed
- Status strings live in a non-English locale — the Storybook has no locale switcher
- Contrast in presets other than Coffee — out of scope by the user's choice; Black gold light secondary measured 3.36:1 (pre-existing preset token)
- 10-suite cart/checkout/configurable regression (C1) — dropped by the user; replaced by Sales Rep Hub 093 P0 cases
- Pages using the card — none until the Sales Rep Hub follow-up
- A1, A4, A6, A9, A13 — candidate cases (passed here, no suite case covers the kit card)

## Data
Created 0 AGENT-TEST- entities · removed 0 · settings restored and re-read: none

## Context used
Strategy reports/tickets/Sprint26-21/VCST-5903/test-strategy.md · Round 1 · Model reports/ba/test-models/VCST-5903-2026-10-19.md · Checklist reports/tickets/Sprint26-21/VCST-5903/testing-checklist.md · Domain map ABSENT (`ui`, single-layer chain — not built) · Mind map SKIPPED: no domain map · Exploratory reports/exploratory/SBTM-VCST-5903-stat-widget-2026-10-19.md · PRs VirtoCommerce/vc-frontend#2568
