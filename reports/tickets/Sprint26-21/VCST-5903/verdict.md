# VCST-5903 — PASS WITH NOTES
Round 2 on vc-frontend PR #2568 @ bfe0b259 (QA Storybook on vcst): the VCST-6427 fix works (a blank value shows the dash, a blank errorText leaves the card ready, nothing next to it broke); VCST-6428 still reproduces and waits for the PO's Won't Fix decision; two new Low defects are filed as separate bugs to fix later.
Page: https://claude.ai/artifact/EohUW6f7x43C12AyMeDii6

Deployment unverified by the bundle ("DEPLOYMENT UNKNOWN: VirtoCommerce/vc-frontend#2568 — no CI artifact resolved for this PR" — the PR's CI fails on 8 sales-rep-tasks-page tests from the dev merge; all 11 vc-stat-widget tests pass); vc-deploy-dev pins theme bfe0b259 and Storybook a6255676, both confirmed live.

| Condition | Result | Evidence |
|---|---|---|
| Blank value (" ", "   ", tab, NBSP, "", undefined) shows the dash; "0" and real values show (VCST-6427) | PASS | screenshots/R2-A2-value-*.png |
| With Suffix: blank value hides the unit | PASS | screenshots/R2-A3-suffix-value-space.png |
| Blank errorText is not an error; "Boom" still is, status "<label>: Boom" (VCST-6427) | PASS | screenshots/R2-A4-errortext-*.png |
| Loading outranks a blank and a real error | PASS | screenshots/R2-A5-loading-*.png |
| Blank-value / blank-error card identical to the empty / ready card, 0 px shift (BL-UI-003) | PASS | screenshots/R2-B1-*.png |
| Token audit, spacing grid (BL-UI-002) | PASS | design-report.md |
| Card anatomy as the mockups | PASS | screenshots/R2-A1-basic-mockup.png |
| Long figure stays inside the card (BL-UI-004, VCST-6428) | FAIL — HOLDS, Won't Fix proposed, PO decides | screenshots/R2-A6-colors-1024-overflow-FAIL.png |
| Storefront boots on the PR theme | PASS | screenshots/R2-A7-storefront-home.png |

## Bugs
- Low (P3) VcStatWidget: a long unbreakable word in errorText, description or delta paints past the card border — reports/bugs/open/low/BUG-VcStatWidget-Unbreakable-Text-Overflows-Card-VCST-6448.md (VCST-6448, separate bug, fix later)
- Low (P4) VcStatWidget: a value or errorText of only zero-width characters still reads as content — reports/bugs/open/low/BUG-VcStatWidget-Zero-Width-Value-ErrorText-VCST-6449.md (VCST-6449, separate bug, fix later)
- Known: VCST-6428 — new evidence for the PO decision: at 480 the right column runs 17px past the viewport and the page scrolls sideways (X11); the kit's own Colors / Delta Colors stories use `lg:grid-cols-4`, the layout the new docs note warns against.

Needs review, not filed (questions for the dev / PO):
- X15 — delta, description, label, valueSuffix are not blank-checked: a blank delta shows the chevron alone
- X25 — a card with no value is silent to a screen reader (dash aria-hidden, status empty), so the description can pass for the metric
- X30 — the pending dash is below 3:1 in every mode (aria-hidden): decorative, or must it reach 3:1?

## Not tested, and why
- F5 regression of 10 storefront suites — dropped by the user at strategy approval; storefront boot (A7) only
- Screen-reader announcement on first mount — no screen reader in the toolkit; manual check needed
- Long figure in the Row (flex) story (X18) — the story ignores value args
- Contrast, overlay containment, locale strings, unknown colour — code unchanged since the Round 1 PASS
- Exploratory box ~28 of 30 min — a rate-limit stop cut the continuation; every charter item was covered
- A2, A3, A4, A5 — candidate cases (passed here, no suite case covers the kit card)

## Data
Created 0 AGENT-TEST- entities · removed 0 · settings restored and re-read: none

## Context used
Strategy reports/tickets/Sprint26-21/VCST-5903/test-strategy.md · Round 2 · Model reports/ba/test-models/VCST-5903-2026-10-19.md §Round 2 · Checklist reports/tickets/Sprint26-21/VCST-5903/testing-checklist.md · Domain map ABSENT (`ui`, single-layer chain — not built) · Mind map SKIPPED: no domain map · Exploratory reports/exploratory/SBTM-VCST-5903-stat-widget-2026-10-20.md · PRs VirtoCommerce/vc-frontend#2568 (VirtoCommerce/vc-frontend#2585 CI-only)
