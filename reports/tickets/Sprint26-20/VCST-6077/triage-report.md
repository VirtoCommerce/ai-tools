# VCST-6077 — 5-triage, ticket mode (`/qa-triage-results ticket VCST-6077 --verify`)

**Build under test:** `http://localhost` theme 2.59.0-pr-2536-c2de-c2de2cd2 → vcst-qa · **Baseline (pre-change):** `https://vcst-qa-storefront.govirto.com` theme 2.59.0 (`/company/calendar` route + checkbox column present) — same backend, same `@td(SR_REP_PRIMARY)` login
**Findings triaged:** F-1…F-6, A-1…A-3 (+ C1 run: `reports/regression/REG-2026-10-07-1421/triage-report.md`) · **`--fix` ignored in ticket mode** (nothing written to the checklist; bugs returned to 5-file)
**Join-gate:** `triage:collect --ticket` reports 41 `unresulted[]` rows — the B1…B38 verdicts were written onto **line 1** (title line) instead of each row's Verdict cell. Every verdict is recoverable in order and every non-PASS one maps to F-1…F-6 or a C1 case, so triage proceeded; the checklist writer must move them into the Verdict column.

## Confirmed real bugs (every candidate ran through `vc-fix:qa-investigate`, REPRODUCED)

| # | Finding | Provenance (baseline evidence) | Severity | Blocks 6077? | Dedup | Package · draft |
|---|---|---|---|---|---|---|
| F-1 | `pt` VcCalendar weekday headers overlap | **PRE-EXISTING** — identical md numbers on old `/pt/company/calendar`, dashboard widget, customer-orders picker (domingo 53/40…) | Low P3 | no | none | `evidence-20261007T1320Z-F-1/` · `reports/bugs/open/low/BUG-vc-calendar-pt-weekday-headers-overlap.md` |
| F-2 | Focus → `<body>` after row action / Edit Save / Delete | **PRE-EXISTING** — old checkbox Space/click, Edit Save, Delete all → BODY | Medium P2 (a11y, standalone) | no | none | `evidence-20261007T1322Z-F-2/` · `reports/bugs/open/medium/BUG-SalesRep-Tasks-Focus-Lost-After-Task-Action.md` |
| F-3 | es/ru "Mark as complete" wraps to 2 lines, icon detached (208px in fixed 224px column) | **IN-SCOPE** — new `sales-rep-task-action.vue`; baseline has a label-less checkbox | Low P3 | below floor | VCST-6133 related only (token TODO, not wrap) | `evidence-20261007T1320Z-F-3/` · draft at 5-file → `open/low/` |
| F-4 | ru status chip label truncated (80px label, 81–86 needed) at 1920 | **IN-SCOPE** — old pill (no icon) fits in the same 144px column (95/95…); PR added the icon | Low P3 | below floor | none | `evidence-20261007T1320Z-F-4/` · draft at 5-file → `open/low/` |
| F-5 | Hub pages keep `<title>` "Virto Commerce" (tasks/calendar, dashboard, my-customers) | **PRE-EXISTING** — baseline identical; customer-orders/profile call `usePageHead`, hub pages do not | Low P3 (a11y, standalone) | no | VCST-5988 (Cancelled, other page) related | `evidence-20261007T1322Z-F-5/` · draft at 5-file → `open/low/` |
| A-2 | Dashboard overdue link #bb1616 on #0a090b = 3.06:1 (coffee-dark) | **PRE-EXISTING** — baseline identical | Medium P2 (a11y, standalone) | no | none (VCST-6134 is table hover, not this) | `evidence-20261007T1320Z-A-2/` · draft at 5-file → `open/medium/` |

## Linked, not re-filed

| # | Class | Link |
|---|---|---|
| F-6 Notes textarea unnamed | KNOWN_ISSUE · PRE-EXISTING (baseline identical; `vc-textarea.vue` `:for` vs `forId`) | **VCST-5993** (In review) + `reports/bugs/open/critical-high/BUG-vc-textarea-has-no-accessible-name-shared-ui-kit.md` |
| A-1 coffee #f99e24 2.11:1 | KNOWN_ISSUE · PRE-EXISTING theme-wide (baseline `/company/calendar`, `/account/lists` identical) | **VCST-4665** (Cancelled) — a deliberate won't-fix; human decides whether to reopen |

## Dismissed

| # | Class | Reason |
|---|---|---|
| A-3 | BY_DESIGN (test heuristic) | 18px title buttons / 17px breadcrumbs are standalone targets, but pass the WCAG 2.5.8 spacing exception (nearest target 33–91px from centre) |
| DRIFT A3/A11/A14/M4, week-start UNSPEC | DESIGN-DRIFT (advisory) | never filed |

No tracker ticket filed, no fix triggered — human decides.
