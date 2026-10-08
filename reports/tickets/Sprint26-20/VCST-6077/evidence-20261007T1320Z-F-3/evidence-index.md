# F-3 — es/ru "Mark as complete" row action wraps to 2 lines — evidence index

**Env / builds / user / raw artifacts / trace:** as in `../evidence-20261007T1320Z-F-1/evidence-index.md` header (NEW 2.59.0-pr-2536-c2de-c2de2cd2 on `http://localhost`; BASELINE 2.59.0 on `{{FRONT_URL}}`; client-side only, no trace ID).

| # | Artifact | Where |
|---|---|---|
| 1 | NEW /es/company/tasks 1920 | screenshots/new-es-tasks-table-1920.png |
| 1 | NEW /es/company/tasks 1440 | screenshots/new-es-tasks-table-1440.png |
| 1 | NEW /ru/company/tasks 1440 | screenshots/new-ru-tasks-table-1440.png |
| 1 | NEW /ru/company/tasks 1920 | ../evidence-20261007T1320Z-F-4/screenshots/new-ru-tasks-all-1920.png |
| 1 | BASELINE /es/company/calendar 1920 (checkbox column) | screenshots/baseline-es-calendar-table-1920.png |
| 13 | Source | PR #2536 diff: new `modules/sales-rep/components/sales-rep-task-action.vue` (VcButton size sm, slotted VcIcon + label; `TODO(VCST-6133)` on the negative inline margin that relies on VcButton internals `--px` + 2px border); task list `&__actions-col { @apply w-56; }` (224px) |

## Measurements

| Build | URL | vw | Actions col | button w×h | label h / line-height | lines | icon offset x,y |
|---|---|---|---|---|---|---|---|
| NEW | /es/company/tasks | 1920 | 224 | 208×38 | 32 / 16 | 2 | 16, 11 |
| NEW | /es/company/tasks | 1440 | 224 | 208×38 | 32 / 16 | 2 | 16, 11 |
| NEW | /ru/company/tasks | 1440 | 224 | 208×38 | 32 / 16 | 2 | 16, 11 |
| NEW | /ru/company/tasks | 1920 | 224 | 208 (screenshot) | — | 2 | left |
| BASELINE | /es/company/calendar | 1920 | n/a — 40px "Completada" checkbox column, no label | — | — | — | — |

`text-align: center`, `white-space: normal` on the button → the 2 lines are centred, the check icon stays pinned 16px from the left edge, so icon and text read as separate. "Reabrir" / "Возобновить" fit on one line. Deterministic on every open row.
