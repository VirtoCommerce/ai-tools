# Evidence index — VCST-6077 F-2 (focus lost after a task row action, Edit Save or Delete)

**Env:** TEST_ENV=vcst · vcst-qa backend (shared by both builds) · NEW = `http://localhost`, theme `2.59.0-pr-2536-c2de-c2de2cd2` · BASELINE = deployed storefront, footer `Ver. 2.59.0.` (brief: 2.59.0-alpha.2548) · Edge (playwright-edge) · sales rep `@td(SR_REP_PRIMARY.email)` · 2026-10-07 13:20–13:32Z
**Trace ID:** n/a. Client-only: no failing request, and every mutation and refetch returned 200 with no `errors[]`. App Insights does not apply.

| Slot | Artifact |
|---|---|
| Failure screenshot (NEW) | screenshots/new-after-edit-save-focus-body.png |
| Baseline screenshot | screenshots/baseline-calendar-after-delete-focus-body.png |
| Active element | `document.activeElement` read after each action (table below) |
| Console | no errors (test-results/edge/console-2026-10-07T13-2*.log) |
| Source | vc-frontend `dev`: `pages/calendar.vue`, `components/sales-rep-task-list.vue`, `ui-kit/components/organisms/table/vc-table.vue`; PR #2536 head c2de2cd2: `pages/sales-rep-tasks-page.vue`, `components/sales-rep-task-list.vue`, `components/sales-rep-task-action.vue` |

| Action (own task AGENT-TEST-TRIAGE-F2*, due today) | NEW /company/tasks | BASELINE /company/calendar |
|---|---|---|
| Keyboard activation of the completion control (Enter on Mark as complete / Space on the checkbox) | BODY | BODY |
| Keyboard Reopen (NEW) / mouse click on the checkbox to reopen (BASELINE) | BODY | BODY |
| Edit task, then Save by keyboard | BODY | BODY |
| Edit task, then Delete, then OK | BODY | BODY |

Result: REPRODUCED on NEW (4/4) and on BASELINE (4/4). Both test tasks were deleted.
