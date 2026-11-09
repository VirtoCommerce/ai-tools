# Task management: POST with an unknown priority returns 500 NullReferenceException — Low

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-09-0950-W7U
**Tracker:** [VCST-6759](https://virtocommerce.atlassian.net/browse/VCST-6759) — Low, auto-fix labels withheld (API-only repro), Need hotfixes not set (module in neither stable bundle v15/v16)
**Case:** side finding of the TASK-025 deep check (suite 085) · Stable 16 W7 (VCST-6411 / VCST-6042)

**Env:** vcptcore_regression · Platform 3.1076.8 · VirtoCommerce.TaskManagement 3.1005.0 · REST with an admin bearer token · deterministic. Non-visual defect: the evidence is the HTTP response.

## Summary
`POST /api/task-management` with a `priority` that is not a `TaskPriority` value answers 500 "Object reference not set to an instance of an object." instead of a 400 validation error.

## Steps to reproduce
1. Admin bearer token (`POST /connect/token`, password grant).
2. `POST /api/task-management` with `{"name":"AGENT-TEST-prio","priority":"Bogus"}`.

## Actual
- **500** `{"message":"Object reference not set to an instance of an object.","stackTrace":null}`; nothing is created.

## Expected
- **400** naming the field and the allowed priorities; nothing is created.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | not exposed |
| 2. Backend Admin | N/A | the Admin form offers only valid priorities |
| 3. GraphQL xAPI | N/A | not tested |
| 4. Platform REST API | FAIL | response above |

**Owning layer:** Layer 4 — REST

## Root Cause Analysis
- `WorkTask.Priority` is the enum `TaskPriority`; an unknown string fails model binding, so `Create([FromBody] WorkTask workTask)` gets `null`.
- `Create` passes the null model to `AuthorizeAsync` / `SaveChangesAsync` with no ModelState or null check.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-task-management
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** TaskManagementController.Create
- **RCA anchor:** `TaskManagementController.Create([FromBody] WorkTask workTask)` — no null/ModelState check
- **Routing confidence:** HIGH
