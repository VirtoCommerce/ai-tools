# A-2 — dark-mode overdue link contrast 3.06:1 — evidence index

**Env / builds / user / raw artifacts / trace:** as in `../evidence-20261007T1320Z-F-1/evidence-index.md` header (NEW 2.59.0-pr-2536-c2de-c2de2cd2; BASELINE 2.59.0; client-side only).
**Theme switching:** header toggle `[data-test-id=dark-mode-toggle]` auto → dark (`html.dark`) on each origin; restored dark → light → auto afterwards and verified "Theme: auto" with an empty `html` class on both origins. No QA-badge interception at 1920.

| # | Artifact | Where |
|---|---|---|
| 1 | NEW /company/dashboard Tasks widget, dark | screenshots/new-en-dashboard-tasks-widget-dark-1920.png |
| 1 | BASELINE /company/dashboard Tasks widget, dark | screenshots/baseline-en-dashboard-tasks-widget-dark-1920.png |

## Measurements (1920, dark; axe-core 4.10.2 + getComputedStyle)

| Build | Node | text | color | bg | ratio |
|---|---|---|---|---|---|
| NEW | `a.vc-link.sales-rep-tasks__overdue` → /company/tasks?filter=overdue | "2 overdue tasks", 12px bold | #bb1616 (= `--color-danger-600`) | #0a090b | 3.06 |
| BASELINE | `a.vc-link.sales-rep-tasks__overdue` → /company/calendar?filter=overdue | "2 overdue tasks", 12px bold | #bb1616 | #0a090b | 3.06 |

Dark tokens (NEW): danger-500 #de3131 · danger-600 #bb1616 · danger-700 #f07c7c.
Incidental, same scan, both builds: dashboard stat-widget positive delta #3b7754 on #0a090b = 3.74:1.
