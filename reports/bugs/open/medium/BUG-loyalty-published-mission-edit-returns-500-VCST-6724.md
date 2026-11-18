# [Loyalty] PUT /api/loyalty-missions on a Published mission returns HTTP 500 instead of a 4xx (Medium)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-1645-W7
**Tracker:** [VCST-6724](https://virtocommerce.atlassian.net/browse/VCST-6724) (filed 2026-11-06) · Relates [VCST-6042](https://virtocommerce.atlassian.net/browse/VCST-6042)
**Archetype:** `CONTRACT` (error mapping) + `OBSERVABILITY`

**Env:** vcptcore_regression · Platform `3.1076.8` · `VirtoCommerce.Loyalty 3.1009.0` · `VirtoCommerce.Marketing 3.1009.0` · `VirtoCommerce.MarketingExperienceApi 3.1004.0`. These match `vc-deploy-dev@vcptcore-regression` `backend/packages.json`.
Repro rate: deterministic (2/2 live on 2026-11-06 on our own scratch mission, plus the W7 run on fixture `MSN_ORDERVALUE`).
The stand sends no trace id (neither `Request-Id` nor `traceparent`); the two 500s are dated 2026-11-06T10:38:18Z and 10:38:19Z. App Insights is N/A for this env, so the fallback is the vcst telemetry analysis below. No HAR and no screenshot: the bug is REST only, driven from Node.
First seen: vcst-qa, Platform `3.1061.0`, Loyalty `3.1006.0-pr-14` (REG-2026-09-01-2236, 2026-09-01).

## Summary

`PUT /api/loyalty-missions` on a **Published** mission correctly refuses the edit and saves nothing, but returns **HTTP 500** with the platform's unhandled-exception envelope instead of a 4xx state-conflict response. Even a no-op PUT of the unchanged GET body returns 500. The same body returns 200 on a Draft and on the allowed Published → Archived transition, so the 500 comes from the immutability guard, not from the payload.

## Steps to reproduce

1. Get an admin bearer token.
2. `POST /api/loyalty-missions`: our own Draft `AGENT-TEST-INV-PUB-<ts>` (`AnyUserGroupCondition`, `OrderCountGoal` 1, `FixedAmountReward` 50) → 200.
3. Control: GET, rename, and PUT the full body while it is Draft → 200, change saved.
4. GET, set `status:"Published"`, PUT → 200.
5. GET the full body, change only `name`, `PUT /api/loyalty-missions` → **500**.
6. PUT the unchanged GET body → **500**, same message.
7. GET → `name` and `status` unchanged. Control: a PUT with `status:"Archived"` → 200. The mission is deleted afterwards (204).

A partial body does not reproduce this: model validation rejects it first with 400 (*"Mission must have at least one condition"*).

## Expected vs Actual

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | Status, edit of a Published mission | 4xx (`409 Conflict`, or `400` like the other validation failures) | **500** |
| 2 | Status, no-op PUT of a Published mission | 4xx (or 200 no-op) | **500** |
| 3 | Envelope | module validation shape `[{propertyName, errorMessage}]` or a conflict body | `{"message":"Mission '<id>' is 'Published' and cannot be modified. Only the transition Published -> Archived is allowed.","stackTrace":null}` |
| 4 | Saved state | unchanged | unchanged ✅ |
| 5 | Control: Draft edit / Published → Archived | 200 / 200 | 200 / 200 ✅ |

Refusing the edit is by design: the source comment says "A published mission is immutable: the only allowed change is the transition to Archived", and the Admin UI says *"Only draft missions can be edited…"*. Only the status code is wrong.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | — |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | **FAIL** | `reports/regression/REG-2026-11-05-1645-W7/evidence/MSN-006/network/MSN-006-rest-exchange.json` |

**Owning layer:** Layer 4 — REST (module error mapping).

## Root Cause Analysis

Proven at source, tag 3.1009.0. The copies are in `reports/regression/REG-2026-11-05-1645-W7/evidence/_source/`.

- `LoyaltyMissionService.SaveChangesAsync` → `EnsureMutableAsync` (`LoyaltyMissionService.cs:41-79`) throws `InvalidOperationException` at **line 70** when the stored status is not Draft and the change is not Published → Archived.
- `LoyaltyMissionController.Update` (`LoyaltyMissionController.cs:41-51`) maps only FluentValidation failures to `BadRequest`. The exception reaches the platform global handler, which returns 500 with `{message, stackTrace:null}`.
- Still present at the latest tag `3.1010.0` (same line 70; the controller is unchanged).
- Ruled out: partial-body validation (a full body and a no-op body both give 500), payload problems (both controls give 200), by design (only the refusal is by design), data drift (our own scratch mission, deterministic). Detail: `reports/regression/REG-2026-11-05-1645-W7/evidence/MSN-006/root-cause.md`.

**Telemetry (prior, vcst-qa, 2026-09-01):** the recorded 500 (`operation_Id 6fb8f4951c396ea8013fa629085f38a1`, `PUT LoyaltyMission/Update`) had **zero** correlated `exceptions` rows over 24 h. In the same window, 181 of the other 182 recorded 500s on that component did have one. So the fault was also unobservable from App Insights there. This was not re-measured on vcptcore_regression (N/A for this env).

## Impact

Admin/API path with a correct outcome, so there is no data risk. The cost is the contract and observability: clients cannot tell a conflict from a crash, retry logic retries a request that can never succeed, and 5xx alerting gets noise. Severity: **Medium**.

## Hotfix decision

`VirtoCommerce.Loyalty` is pinned in **neither** of the two latest stable bundles (`vc-modules` `bundles/v15`, `bundles/v16`), so **Need hotfixes is not set**.

## Related

- Suite `075d` `MSN-006` asserts 409 and is expected to fail until this is fixed. `075e` `MSNA-013` covers the Admin-UI read-only guard.
- `reports/bugs/open/medium/BUG-mission-save-validation-accepts-negative-reward.md`: the same save path, a different symptom.
- Note for re-verification: `GET /api/loyalty-missions/{id}` returns 200 with a `null` body for both a deleted id and an id that never existed.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-loyalty
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Loyalty — missions (`LoyaltyMissionService`, `LoyaltyMissionController`)
- **RCA anchor:** `src/VirtoCommerce.Loyalty.Data/Services/LoyaltyMissionService.cs:70` (`throw new InvalidOperationException` in `EnsureMutableAsync`); `src/VirtoCommerce.Loyalty.Web/Controllers/Api/LoyaltyMissionController.cs:41-51`
- **Routing confidence:** HIGH
- **Fix direction (hint):** fail the guard through the validation path, or catch it in the controller, and return 409 (or 400) with the same message.
- **Auto-fix labels:** withheld. The repro is API-only, and changing the status code from 500 to 4xx is a public REST contract change (Gate-0 bails).
