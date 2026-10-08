# F-4 — ru status chips truncated on /company/tasks — evidence index

**Env / builds / user / raw artifacts / trace:** as in `../evidence-20261007T1320Z-F-1/evidence-index.md` header (NEW 2.59.0-pr-2536-c2de-c2de2cd2; BASELINE 2.59.0; client-side only).

| # | Artifact | Where |
|---|---|---|
| 1 | NEW /ru/company/tasks, All scope, 1920 | screenshots/new-ru-tasks-all-1920.png |
| 1 | BASELINE /ru/company/calendar?filter=upcoming, 1920 | screenshots/baseline-ru-calendar-upcoming-1920.png |
| 1 | BASELINE /ru/company/calendar?filter=overdue, 1920 | screenshots/baseline-ru-calendar-overdue-1920.png |
| 13 | Source | PR #2536 diff `modules/sales-rep/components/sales-rep-task-status.vue`: the `VcChip size="sm" rounded truncate` gains a leading `<VcIcon>` (process / circle-solid); task list `&__status-col { @apply w-36; }` is unchanged context (144px) |

## Measurements (1920px, ru-RU) — label scrollWidth / clientWidth

| Build | Status | chip w | label sw / cw | truncated |
|---|---|---|---|---|
| NEW | Предстоящая | 112 | 81 / 80 | yes ("Предстоящ…") |
| NEW | Выполненная | 112 | 83 / 80 | yes |
| NEW | Просроченная | 112 | 86 / 80 | yes |
| NEW | Отменённая | 105 | 73 / 73 | no |
| BASELINE | Предстоящая | — | 95 / 95 | no |
| BASELINE | Выполненная | — | 97 / 97 | no |
| BASELINE | Просроченная | 102 | 100 / 100 | no |
| BASELINE | Отменённая | — | 87 / 87 | no |

Columns NEW: Задача 237 · Статус 144 (td padding 16+16 → 112 for the chip) · Заметки 237 (longest note ≈205) · Действия 224.
Columns BASELINE: checkbox 40 · Задача 277 · Статус 144 · Заметки 277.
