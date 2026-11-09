# BUG: Task Management Admin — All tasks lists archived (Done/Canceled) tasks; the grid sends no isActive filter

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-1645-W7

**Severity:** Medium · **Priority:** Medium · **Type:** Functional (Admin UI filter)
**Cases:** suite 085 `TASK-005`, `TASK-006` (one root) · **Release:** Stable 16 (VCST-6042) · **Tracker:** [VCST-6728](https://virtocommerce.atlassian.net/browse/VCST-6728) (Relates VCST-6042, VCST-5227) · labels `found-by-agent`, `found-in-regression` · Need hotfixes: not set (module in neither stable bundle v15/v16) · auto-fix labels withheld

## Environment
- **Stand:** `vcptcore_regression` (Admin SPA → Tasks embedded app, route `tasks`), browser `playwright-chrome` (Chromium)
- **Versions:** Platform 3.1076.8 · VirtoCommerce.TaskManagement 3.1005.0 (matches vc-deploy-dev `vcptcore-regression` `backend/packages.json`)
- **Repro rate:** deterministic. Tasks #8 and #9 were made in this session (2 of 2) and the regression run gave the same result
- **Trace ID:** none. The stand sends neither `Request-Id` nor `traceparent`
- **App Insights:** N/A for this env (`APPINSIGHTS_APP_ID_*` not configured); no server error is involved, every response is 200
- **HAR:** `test-results/chrome/har/session.har` (lane session HAR)

## Summary
After a task is closed with **Complete** (Done) or **Reject** (Canceled), it shows in **Archive tasks** and also stays in **All tasks**. The user guide says All tasks holds only currently active tasks. The All tasks grid sends no `isActive: true` criterion, so the API returns every task, archived ones included.

## Steps to reproduce
1. Sign in to the Admin SPA as admin and open the Tasks app (embedded-app route `tasks`).
2. Create two active tasks (here over REST: `POST /api/task-management` with `isActive:true` → #8, #9).
3. Close #8 as completed (`POST /api/task-management/finish?id=…&completed=true`) and #9 as canceled (`completed=false`). These are the same calls the blade's **Complete** / **Reject** buttons send.
4. Open **All tasks**. The grid sends `POST /api/task-management/search` `{"take":20,"sort":"createdDate:DESC","skip":0}` with no `isActive`, and lists #8 and #9 ("1–2 of 2").
5. Open **Archive tasks**. The grid lists the same #8 and #9.

## Actual
- All tasks lists #8 (completed) and #9 (canceled), both `isActive:false` (package `network/failing-task-management-search.json`)
- Archive tasks lists the same two

![All tasks lists finished tasks](../../screenshots/Tasks-All-Tasks-Lists-Archived-Tasks/01-all-tasks-lists-finished-tasks.png)

## Expected
- All tasks lists only active tasks. vc-docs `platform/user-guide/docs/tasks/using-application.md` L5–8 says: "**All tasks** opens all currently active tasks. **Archive tasks** opens all completed tasks."
- A task closed with Complete or Reject leaves All tasks. L58–59 of the same page: "The task will be archived with the **Done** / **Canceled** status"

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | storefront not involved |
| 2. Backend Admin | **FAIL** | `screenshots/01-…png`, `02-…png`, `dom-all-tasks.txt`, `network/failing-task-management-search.json` |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | PASS | `network/rest-crosscheck-search.json`: `isActive:true` → 0, `false` → 2, absent → 2 (it filters exactly as asked) |

**Owning layer:** Layer 2 — Admin UI (Tasks embedded Vue / vc-shell app)

## Root Cause Analysis
Package: `reports/regression/REG-2026-11-05-1645-W7/evidence/TASK-005/` (`root-cause.md`, `source/findings.md`).
- `vc-module-task-management@3.1005.0` `src/VirtoCommerce.TaskManagement.Web/App/src/modules/tasks/pages/workTasksList.vue` L42 calls `useWorkTasksList({ pageSize: 20, sort: "createdDate:DESC" })` with no `defaultFilters`. Still the same at the latest tag 3.1006.0.
- The sibling views do set their scope. `archive-tasks/composables/useArchiveWorkTasks/index.ts` L14 passes `defaultFilters: { isActive: false }`, and `my-tasks/…/useMyWorkTasks` passes `{ onlyAssignedToMe: true }`.
- **Ruled out:** by design (the docs give All = active and define My tasks separately as "active and completed"); data drift / cache (fresh tasks, REST `isActive:true` → 0); index lag (the search is DB-backed).
- **Confidence:** HIGH on the mechanism. MEDIUM on which side is wrong, which is a product decision: if the product owner rules All = all, the docs need the fix instead.

## Regression
Not a regression. The history of `useWorkTasks/index.ts` (2025-05 → 2026-06) never had an `isActive` default for All.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin (Tasks embedded Vue app)
- **Suggested repo:** VirtoCommerce/vc-module-task-management
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Task Management — All tasks list (`modules/tasks`)
- **RCA anchor:** `src/VirtoCommerce.TaskManagement.Web/App/src/modules/tasks/pages/workTasksList.vue:42` (add `defaultFilters: { isActive: true }`)
- **Routing confidence:** MEDIUM. The mechanism is certain. Code vs docs is a product decision, and the module's Vue `App/` is not a declared `moduleFrontendSubApps` entry in `fix-repos.json`
