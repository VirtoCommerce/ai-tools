# Task management: POST with a Name over 256 characters returns 500 and the raw SQL error — Medium

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-09-0950-W7U
**Tracker:** [VCST-6758](https://virtocommerce.atlassian.net/browse/VCST-6758) — Medium, auto-fix labels withheld (API-only repro), Need hotfixes not set (module in neither stable bundle v15/v16)
**Case:** side finding of the TASK-025 deep check (suite 085) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression · Platform 3.1076.8 · VirtoCommerce.TaskManagement 3.1005.0 · REST with an admin bearer token · deterministic. Non-visual defect: the evidence is the HTTP response.

## Summary
`POST /api/task-management` does not validate the Name length. A 257-character name answers 500 with the SQL Server truncation message, which names the database, table `WorkTask` and column `Name`.

## Steps to reproduce
1. Admin bearer token (`POST /connect/token`, password grant).
2. `POST /api/task-management` with `{"name":"<257 characters>","priority":"Normal"}`.
3. Repeat with 256 characters.

## Actual
- 257: **500** `String or binary data would be truncated in table '<database>.dbo.WorkTask', column 'Name'. Truncated value: ...` (the real database name is in the body).
- 256: **200**, the task is created. (Probe task removed afterwards: DELETE 204.)

## Expected
- **400** with a validation message for 257+ characters; no SQL text in any response. Same pattern already filed for other modules: VCST-6698, VCST-6528, VCST-6389.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | not exposed |
| 2. Backend Admin | not probed | the Admin form was not exercised |
| 3. GraphQL xAPI | N/A | no task mutation in xAPI path tested |
| 4. Platform REST API | FAIL | response above |

**Owning layer:** Layer 4 — REST

## Root Cause Analysis
- `TaskManagementController.Create` (`POST ""`) saves the posted `WorkTask` with no validation.
- The limit exists only as `[StringLength(256)]` on `WorkTaskEntity.Name`, enforced by the database.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-task-management
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** TaskManagementController.Create / WorkTask validation
- **RCA anchor:** `WorkTaskEntity.cs` `[StringLength(256)] Name`; `TaskManagementController.Create`
- **Routing confidence:** HIGH
