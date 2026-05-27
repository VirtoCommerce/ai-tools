# BUG: API `POST /api/loyalty-programs` with null Name silently persists an empty-named program (HTTP 200, no server-side validation) (API-only) `[Medium]`

## Status: CONFIRMED (re-tested 2026-05-27 — behavior changed since first report)

**Env:** vcst-qa @ Platform 3.1030.0, Loyalty `3.1002.0-pr-9-9fc4`, Theme `b2b-vue-2.50.0-pr-2296`
**Module:** `VirtoCommerce.Loyalty` · **Endpoint:** `POST /api/loyalty-programs`

## Summary
A direct authenticated `POST /api/loyalty-programs` with `name: null` is accepted: the API returns **HTTP 200** and **persists** a loyalty program with no Name. There is no server-side required-field validation. This is a **data-integrity / missing-validation** issue reachable only by calling the API directly.

> **Behavior change (2026-05-27):** This defect was originally filed as an unhandled **HTTP 500** that leaked the raw SQL error (DB + table name). On re-test against Loyalty `3.1002.0-pr-9-9fc4`, the 500 / SQL information-disclosure no longer reproduces — the insert now succeeds and an empty-named program is silently created. The root cause (no server-side validation in the controller) is unchanged; the symptom moved from *crash + info-disclosure* to *silent invalid-data persistence*.

**Important — not reachable via UI:** The Admin SPA Add-program blade **DOES enforce client-side required-field validation** — with Name empty the Name input is `ng-invalid-required` and the **Save button is disabled** (`__disabled`, `pointer-events:none`). A normal user cannot submit a null Name. This defect is therefore only reachable by calling the API directly (bypassing the UI).

## Steps to Reproduce (API)
1. Obtain an admin Bearer token (`POST {{BACK_URL}}/connect/token`).
2. `POST {{BACK_URL}}/api/loyalty-programs` with `name: null`, `storeId:"B2B-store"`, `priority:0`, a valid `startDate`, valid `dynamicExpression`.

## Expected vs Actual
- **Expected:** graceful `400` / validation problem ("Name is required"); the program is NOT persisted.
- **Actual:** **HTTP 200**; an empty-named loyalty program is created and persists (visible on subsequent search/GET).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only feature |
| 2. Backend Admin (SPA) | **PASS** | Required-field validation works: empty Name → input `ng-invalid-required`, **Save disabled**; not reachable via UI |
| 3. GraphQL xAPI | N/A | Not exercised |
| 4. Platform REST API | **FAIL** | `POST /api/loyalty-programs` (name:null) → **200**, empty-named program persisted (search/GET confirms) |

**Owning layer:** Layer 4 → `vc-module-loyalty` (server-side input validation).

## Root Cause Analysis
`LoyaltyProgramController.Update` ([`src/VirtoCommerce.Loyalty.Web/Controllers/Api/LoyaltyProgramController.cs`](https://github.com/VirtoCommerce/vc-module-loyalty/blob/dev/src/VirtoCommerce.Loyalty.Web/Controllers/Api/LoyaltyProgramController.cs)) forwards the model straight to `crudService.SaveChangesAsync([model])` with no validation; `Create` only nulls the Id and calls `Update`. With `Name` null there is no `400`/`ValidationProblem` guard, so the record is persisted as-is. Fix: validate required `Name` server-side (return `400`/`ValidationProblem`) before save. (Same missing-validation gap as the negative-reward-points defect, `BUG-loyalty-reward-negative-points-accepted-VCST-5100`.)

## Severity
**Medium** — server-side hardening / data-integrity: missing required-field validation lets an authenticated caller persist an invalid (empty-named) loyalty program by bypassing the UI. No longer a crash and no longer an information-disclosure issue (the earlier SQL-leak 500 no longer reproduces). The UI itself is safe (validated).
