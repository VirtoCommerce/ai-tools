# A-1 — coffee primary #f99e24 text contrast 2.11:1 — evidence index

**Env / builds / user / raw artifacts / trace:** as in `../evidence-20261007T1320Z-F-1/evidence-index.md` header (NEW 2.59.0-pr-2536-c2de-c2de2cd2; BASELINE 2.59.0; light mode; client-side only).
**Tool:** axe-core 4.10.2 `color-contrast` rule, injected read-only from cdnjs; plus `getComputedStyle` on primary buttons.

| # | Artifact | Where |
|---|---|---|
| 1 | NEW /company/tasks ("New task") | screenshots/new-en-tasks-1920.png |
| 1 | NEW /account/lists ("Create list") | screenshots/new-en-account-lists-create-list-1920.png |
| 1 | BASELINE /company/calendar ("New task") | screenshots/baseline-en-calendar-1920.png |
| 1 | BASELINE /account/lists ("Create list") | screenshots/baseline-en-account-lists-create-list-1920.png |

## axe results (1920, light)

| Build | Page | Node | fg / bg | ratio | text |
|---|---|---|---|---|---|
| NEW | /company/tasks | "New task" VcButton solid-primary md | #ffffff / #f99e24 | 2.11 | 16px bold |
| NEW | /account/lists | "Create list" outline-primary | #f99e24 / #ffffff | 2.11 | 14px bold |
| NEW | /catalog | no primary text button flagged (icon-only add-to-cart); only "Show in stock" chip #fff / #688198 = 4.05 | — | — | — |
| BASELINE | /company/calendar | "New task" VcButton solid-primary md | #ffffff / #f99e24 | 2.11 | 16px bold |
| BASELINE | /account/lists | "Create list" outline-primary | #f99e24 / #ffffff | 2.11 | 14px bold |

Baseline "Add task" (secondary outline) was not flagged.
