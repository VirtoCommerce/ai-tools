# BUG: [Sales Rep][a11y] Focus drops to `<body>` after Mark as complete / Reopen, Edit task Save and Delete on the Tasks page

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6077 (first seen as SR-TK-024 in this run's regression REG-2026-10-07-1421)
**Severity:** Medium (P2): a keyboard or screen-reader user loses their place after every task action on the page.
**Provenance:** PRE-EXISTING. The pre-redesign baseline `/company/calendar` behaves the same way, and PR #2536 carried it over unchanged.
**Relates:** VCST-6077 (found during) · VCST-5732 (original Tasks feature) · BL-A11Y-001 · WCAG 2.4.3 Focus Order. File as a **standalone** ticket, not a Sub-task (`.claude/skills/qa-test/triage.md` §7a).
**Labels when filed:** `found-by-agent` + `found-in-testing`
**Tracker:** [VCST-6203](https://virtocommerce.atlassian.net/browse/VCST-6203) (filed 2026-10-07, Medium, Relates VCST-6077; auto-fix labels withheld)
**Superseded by:** [VCST-6220](https://virtocommerce.atlassian.net/browse/VCST-6220), the combined Sales Rep a11y bug (2026-10-08). VCST-6203 is linked as its duplicate.

## Environment
| | NEW (under test) | BASELINE (control) |
|---|---|---|
| Storefront | `http://localhost`, theme `2.59.0-pr-2536-c2de-c2de2cd2` | `https://vcst-qa-storefront.govirto.com`, theme `2.59.0` |
| Page | `/company/tasks` | `/company/calendar` (checkbox toggle) |
| Backend | vcst-qa (shared by both builds) | vcst-qa |
| Browser / user | Chrome + Edge 1920 · sales rep `@td(SR_REP_PRIMARY.email)` | Edge 1920 · same rep |

## Summary
On the Sales Rep Tasks page, completing, reopening, saving or deleting a task moves keyboard focus to `<body>`. The mutation and the list refetch both succeed. Focus does not stay on the row the user acted on. The next Tab starts again at the first row's title, so a keyboard user has to tab back through the list to find the task they just changed. A screen-reader user gets no announcement of where they are.

## Preconditions
- A signed-in sales rep with at least two of their own tasks in the list. The acted task should not be the first row.

## Steps to Reproduce
1. Open `/company/tasks`. Use the keyboard only.
2. Tab to a row's **Mark as complete** button and press Enter. Read `document.activeElement`.
3. On the same row, Tab to **Reopen** and press Enter. Read `document.activeElement`.
4. Press Enter on a task title to open **Edit task**, change a field and Save. Read `document.activeElement`.
5. Open **Edit task** again, choose **Delete**, then **OK**. Read `document.activeElement`.
6. After any of steps 2–5, press Tab once.

## Expected vs Actual
- **Expected** (BL-A11Y-001, WCAG 2.4.3): focus stays on, or returns to, a defined element: the same row's action or title, or for Delete the next row or the list heading. The next Tab continues from there.
- **Actual:** `document.activeElement` is `BODY` after steps 2, 3, 4 and 5 (4/4 on NEW, 4/4 on BASELINE). Step 6 lands on the **first** row's title. A mouse click gives the same result.
- **Control (works):** Escape from Edit task returns focus to the title that opened it, and creating a task returns focus to **New task**. Focus restoration is already in place for those two paths, but not after a mutation.

## Evidence
| Artifact | Path |
|---|---|
| Regression failure (SR-TK-024, Mark as complete) | `reports/regression/REG-2026-10-07-1421/screenshots/SR-TK-024-FAIL-focus-lost-after-complete.png` · trace `reports/regression/REG-2026-10-07-1421/traces/SR-TK-024-FAIL-trace.json` |
| Investigation package (repro on both builds + RCA) | `reports/tickets/Sprint26-20/VCST-6077/evidence-20261007T1322Z-F-2/` (`evidence-index.md`, `root-cause.md`) |
| NEW, after Edit task Save | `…/evidence-20261007T1322Z-F-2/screenshots/new-after-edit-save-focus-body.png` |
| BASELINE, after Delete → OK | `…/evidence-20261007T1322Z-F-2/screenshots/baseline-calendar-after-delete-focus-body.png` |
| Console | no errors |
| Knowledge base | KB-1AC3D57E (NEW, corroborated ×2) · KB-0404EB02 (BASELINE) |

| Stills (NEW, before / after Enter on Mark as complete) | `reports/tickets/Sprint26-20/VCST-6077/screenshots/4a-16-focus-before-enter.png` · `4a-17-focus-after-enter.png` |
| Motion (the focus ring disappears after the action) | `reports/tickets/Sprint26-20/VCST-6077/screenshots/4a-18-B24-focus-loss.gif` |

The defect is focus moving away as a result of the action, so the ticket carries the GIF in addition to the stills (`.claude/rules/reports.md` §5.2).

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **FAIL** | `activeElement = BODY` after every mutation (package table, SR-TK-024) |
| 2. Backend Admin | N/A | focus is client-only. The task state written is correct |
| 3. GraphQL xAPI | PASS | `Mutation.changeSalesRepTaskStatus` / `Mutation.updateSalesRepTask` / delete and the list refetch all return 200 with no `errors[]` |
| 4. Platform REST API | N/A | no REST call on this path |

**Owning layer:** Layer 1 (storefront, vc-frontend).

## Root Cause Analysis
(From source. Confidence: HIGH for the behaviour, MEDIUM-HIGH for the mechanism, which was not instrumented.)
- The task list passes `:loading` to `VcTable`. In `client-app/ui-kit/components/organisms/table/vc-table.vue`, `<tbody v-if="loading">` replaces the rows with a skeleton while the data refetches (L133 vs L196). That unmounts the focused row control.
- The row controls are also `:disabled="busy"` while the write runs: `SalesRepTaskAction` on the PR head, the checkbox on `dev`.
- After `toggleCompletion`, `onTaskSaved` and delete, the page neither saves nor restores focus. The Escape and create paths do restore focus, which shows the page can do it.
- **Not a regression of #2536:** the baseline `pages/calendar.vue` uses the same `VcTable` loading path and loses focus in the same way (KB-0404EB02).
- App Insights does not apply: there is no failing request and no exception.

**Fix direction (for the developer to decide):** after the refetch, move focus back to the acted row's control by its stable id, falling back to the next row or the list heading after Delete. Alternatively, keep the rows mounted during a background refetch instead of swapping in the skeleton. A change to `VcTable` would touch every table in the storefront, so a page-level fix is the smaller change.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend `client-app/modules/sales-rep/` (Tasks page + task list)
- **RCA anchor:** `client-app/modules/sales-rep/pages/sales-rep-tasks-page.vue` (`toggleCompletion`, `onTaskSaved`, delete handler: no focus restore) · `client-app/modules/sales-rep/components/sales-rep-task-list.vue` (`:loading` → `VcTable` skeleton `tbody`). Paths are as on PR #2536 head `c2de2cd2`. On `dev` before the merge, the page is `client-app/modules/sales-rep/pages/calendar.vue`.
- **Routing confidence:** HIGH. One repo and one module, and the defect reproduces deterministically (8/8). The mechanism comes from source. Land the fix on whichever page file is current once PR #2536 merges.
