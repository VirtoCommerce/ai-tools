# BUG: [Sales Rep][a11y] Dashboard "Tasks & due dates" widget: the "N overdue tasks" link is 3.06:1 in the Coffee dark preset

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6077
**Severity:** Medium (P2): the one warning in the widget fails AA contrast for dark-mode users.
**Provenance:** PRE-EXISTING. Same class and colour on the deployed 2.59.0 build; PR #2536 only changed the link target.
**Relates:** VCST-6077 (found during) · BL-A11Y-003 · WCAG 1.4.3 Contrast (Minimum). Standalone ticket, not a Sub-task.
**Labels when filed:** `found-by-agent` + `found-in-testing`
**Tracker:** [VCST-6204](https://virtocommerce.atlassian.net/browse/VCST-6204) (filed 2026-10-07, Medium, Relates VCST-6077; auto-fix labels withheld)

**Env:** vcst-qa backend · storefront theme 2.59.0 (deployed) and 2.59.0-pr-2536-c2de-c2de2cd2 (vc-frontend PR #2536, local build) · Coffee preset, dark mode · Edge 1920 and 1440 · sales rep `@td(SR_REP_PRIMARY.email)`

## Summary
On the Sales Rep Hub dashboard, the overdue notice under the calendar in the "Tasks & due dates" widget (`a.vc-link.sales-rep-tasks__overdue`, "2 overdue tasks", 12px bold) renders `#bb1616` on `#0a090b` in dark mode: 3.06:1, where 4.5:1 is required. Light mode passes. Identical on both builds.

## Steps to Reproduce
1. Sign in as a sales rep who has at least one overdue task.
2. Switch the header theme toggle to dark.
3. Open `/company/dashboard` and look at the "Tasks & due dates" widget, below the calendar.
4. Measure the "N overdue tasks" link against the widget background (axe `color-contrast` or `getComputedStyle`).

## Expected vs Actual
- **Expected** (BL-A11Y-003, WCAG 1.4.3): text contrast ≥ 4.5:1 in every shipped preset.
- **Actual:** `#bb1616` (`--color-danger-600`) on `#0a090b` = **3.06:1** in dark. In the Coffee dark palette the danger scale inverts, so the 600 step is the darker red.

## Evidence
| Artifact | Path |
|---|---|
| NEW, widget dark | `reports/tickets/Sprint26-20/VCST-6077/evidence-20261007T1320Z-A-2/screenshots/new-en-dashboard-tasks-widget-dark-1920.png` |
| BASELINE, widget dark | `…/evidence-20261007T1320Z-A-2/screenshots/baseline-en-dashboard-tasks-widget-dark-1920.png` |
| Page context, dark 1440 | `reports/tickets/Sprint26-20/VCST-6077/screenshots/4v-dashboard-1440-coffee-dark.png` |
| Package + RCA | `reports/tickets/Sprint26-20/VCST-6077/evidence-20261007T1320Z-A-2/` · `design-report.md` finding A-2 |

**Related observation (not filed separately):** in the same dashboard, the stat-widget positive delta (`#3b7754` on `#0a090b`) is 3.74:1 in dark, on both builds.

## Layer Validation
Layer 1 (storefront) FAIL; Layers 2–4 N/A (pure styling, no data path). **Owning layer:** Layer 1.

## Root Cause Analysis
`.sales-rep-tasks__overdue` resolves to `--color-danger-600`, which is `#bb1616` in the Coffee dark palette (dark tokens: danger-500 `#de3131`, danger-600 `#bb1616`, danger-700 `#f07c7c`). A dark-aware text token (danger-700 under `.dark`, or a semantic danger-text token that flips) fixes it. Whether the fix belongs in the widget or in the preset's danger scale is not settled.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend `client-app/modules/sales-rep/` dashboard Tasks widget (or the Coffee dark preset tokens)
- **RCA anchor:** class `sales-rep-tasks__overdue` → `--color-danger-600`
- **Routing confidence:** MEDIUM. One repo; widget-vs-preset ownership is open.
