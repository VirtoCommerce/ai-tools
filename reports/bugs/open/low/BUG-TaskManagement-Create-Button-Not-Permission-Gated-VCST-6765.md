# Task management Admin: Create button shown to a user without task:create — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-09-1545-W7M
**Tracker:** [VCST-6765](https://virtocommerce.atlassian.net/browse/VCST-6765) — Low, labels vc-fix + qa-autofix, Need hotfixes not set (module in neither stable bundle v15/v16)
**Case:** TASK-016 (suite 085) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression · Platform 3.1076.13 · VirtoCommerce.TaskManagement 3.1005.0 · Admin SPA, Edge via Playwright · deterministic.

## Summary
A back-office user whose role grants only `task:access` + `task:read` sees an enabled **Create** button in Admin → Tasks. It opens the **Create new task** blade with no Save button; the server rejects the create (401). The user is offered a form that cannot be completed.

## Steps to reproduce
1. Back-office Manager (not administrator) with a role granting only `task:access`, `task:read` (`@td(RESTRICTED_USER.email)`).
2. Admin SPA → **Tasks** (`#!/workspace/embedded-app/tasks`) → **All tasks**.
3. Look at the list toolbar; click **Create**.

## Actual
- Create is visible and enabled; it opens the Create new task blade with an empty toolbar (no Save).
- `POST /api/task-management` answers 401 for this user (KB-8DA8F07F) — nothing is created.
- ![create](../../../regression/REG-2026-11-09-1545-W7M/screenshots/TASK-016-FAIL-create-button-visible.png)

## Expected
- Create hidden or disabled without `task:create`, like Finish/Update without their permissions.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | admin-only feature |
| 2. Backend Admin | FAIL | screenshot above |
| 3. GraphQL xAPI | N/A | not involved |
| 4. Platform REST API | PASS | create rejected (401) |

**Owning layer:** Layer 2 — Admin (vc-shell embedded app in vc-module-task-management)

## Root Cause Analysis
- `src/VirtoCommerce.TaskManagement.Web/App/src/modules/tasks/components/BaseWorkTasksList.vue` L216-223 (`3.1005.0`, unchanged on `dev`): the `create` toolbar item depends only on `showCreateButton` (default true).
- Same module gates Finish/Update with `hasAccess(TaskPermissions.*)` and the details Save with `TaskPermissions.Create` (`workTaskDetails.vue` ~L196).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-task-management
- **repoKind:** module (embedded Vue 3 sub-app `src/VirtoCommerce.TaskManagement.Web/App`)
- **Ownership hint:** platform
- **Component / module:** Tasks list toolbar (BaseWorkTasksList)
- **RCA anchor:** `BaseWorkTasksList.vue:216-223` — add `hasAccess(TaskPermissions.Create)` to the create item
- **Routing confidence:** HIGH
