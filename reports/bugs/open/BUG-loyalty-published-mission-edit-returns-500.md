# Editing a **Published** loyalty mission faults with **HTTP 500** instead of a 4xx — and logs **no exception telemetry** — **P2**

## Status: CONFIRMED (live, reproduced twice on a purpose-built fixture, with a Draft negative control)
**Found by:** regression run `REG-2026-09-01-2236` → suite `075d` `MSN-006` (asserted `HTTP 409`, observed `HTTP 500`)
**Archetype:** `CONTRACT` (error-mapping) + `OBSERVABILITY`

**Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty 3.1006.0-pr-14-da8a`

## Summary

`PUT /api/loyalty-missions` on a mission in `Published` state correctly refuses the edit, but returns **HTTP 500** carrying the platform's unhandled-exception envelope instead of a 4xx state-conflict response. The same full-body edit on a `Draft` mission returns **200**, and the allowed `Published → Archived` transition returns **200**, so the 500 is specific to the immutability guard rather than to the payload. The fault is additionally **invisible in telemetry**: the recorded 500 has no correlated `exceptions` record, while 181 of the other 182 recorded 500s on this component in the same 24 h do.

## Steps to reproduce

Start from an admin bearer token (`POST {BACK_URL}/connect/token`, `grant_type=password`). All calls are `Authorization: Bearer <token>`.

1. `POST {BACK_URL}/api/loyalty-missions` with a **valid** mission body — one condition, one goal, one reward:
   `{"id":null,"name":"AGENT-TEST-MSN-PUB","storeId":"{{STORE_ID}}","status":"Draft","public":true,"periodicity":"None","startDate":"2026-01-01T00:00:00Z","endDate":"2027-01-01T00:00:00Z","dynamicExpression":{"id":"LoyaltyMissionConditionAndRewardTree","children":[{"id":"BlockLoyaltyMissionCondition","children":[{"id":"AnyUserGroupCondition"}]},{"id":"BlockLoyaltyMissionGoals","children":[{"id":"OrderCountGoal","count":1}]},{"id":"BlockLoyaltyReward","children":[{"id":"FixedAmountReward","amount":10}]}]}}`
   → **200**, note the returned `id`.
2. `GET /api/loyalty-missions/{id}`, set `status: "Published"` on the **complete** body, `PUT /api/loyalty-missions` → **200**, `status: "Published"`.
3. `GET /api/loyalty-missions/{id}` again, change **only** `name` (append `-EDITED`) in the **complete** returned body, and `PUT /api/loyalty-missions` with that full body.
   → **HTTP 500**.
4. `GET /api/loyalty-missions/{id}` → 200, `name` unchanged, `status` still `Published` (nothing was persisted).

**A partial PUT does not reproduce this** — it is rejected earlier by ordinary model validation (`400`, *"Mission must have at least one condition"*) and never reaches the immutability guard. The GET-merge-PUT of the whole entity is required. (A partial body to this whole-entity `PUT` is separately unsafe — same class as `reference_store_required_defaults_null_breaks_frontend`.)

## Expected vs Actual

| # | Check | Expected | Actual |
|---|-------|----------|--------|
| 1 | Status code, edit of a `Published` mission | `4xx` (`409 Conflict` — a state conflict, deterministic and client-attributable) | **`500`** |
| 2 | Response envelope | Module validation envelope: `[{"propertyName":…,"errorMessage":…,"severity":"Error"}]` | Platform unhandled-exception envelope: `{"message":"Mission '<id>' is 'Published' and cannot be modified. Only the transition Published -> Archived is allowed.","stackTrace":null}` |
| 3 | Exception telemetry for the fault | An `exceptions` record correlated by `operation_Id` | **None** — the operation is unobservable |
| 4 | Persisted state after the refusal | unchanged | unchanged ✅ (the *outcome* is correct) |
| 5 | Control — same full-body edit on a `Draft` mission | `200`, change persisted | `200`, change persisted ✅ |
| 6 | Control — allowed `Published → Archived` transition | `200` | `200` ✅ |

Rows 5 and 6 are the negative controls: the payload and the endpoint are fine, so only the guard explains row 1.

## Telemetry evidence

The 500 recorded at `2026-09-01T20:37:32Z` (`operation_Id 6fb8f4951c396ea8013fa629085f38a1`, `PUT LoyaltyMission/Update`, `duration 4.0979s`, `itemCount 2` — sampled **in**) has **zero** correlated `exceptions` rows over 24 h. Component-wide over the same window:

| Request | 500s recorded | with correlated exception |
|---|---|---|
| `POST graphql/` | 180 | 180 |
| `POST graphql/AddOrUpdateCartShipment` | 1 | 1 |
| **`PUT LoyaltyMission/Update`** | **1** | **0** |

So exception collection is working on this component — this operation specifically emits none. (My own repro calls fell to adaptive sampling, `itemCount 8`, so they produced no rows at all; the quantified table above is what carries this finding.)

## Root cause

Not confirmed at source — `vc-module-loyalty` is not reachable via GitHub code search from this session, so this is inferred from the two response envelopes. The immutability guard (`EnsureMutableAsync`, per the message text) **throws** rather than failing validation. The module has a working 4xx path — FluentValidation returns `400` with a structured `propertyName`/`errorMessage` array — but the guard is not on it, so its exception falls through to the platform's generic unhandled-exception handler, which emits `{message, stackTrace}` at `500`. That handler apparently writes the response without a `TrackException`, which is the same single defect producing both symptoms.

The fix shape is to make the guard raise the module's validation/conflict failure (mapped to `409`) instead of an unmapped throw.

## Impact

Admin-only path with a **correct outcome** (the edit is refused, nothing persisted), so no data risk. The cost is contract and observability: a client cannot distinguish "your request conflicts with the entity's state" from "the server broke", retry logic will retry a permanently non-retryable request, the 500 contaminates 5xx error-rate alerting, and the missing exception record means nobody can diagnose it from telemetry.

## Related

- `reports/bugs/open/BUG-mission-save-validation-accepts-negative-reward.md` — quotes a dev comment claiming *"Add mission validation on saving on backend (currently none, can even edit a Published mission)"* is completed. This finding is evidence that whatever landed guards the *state* but does not surface the refusal correctly.
- Suite `075d` `MSN-006` asserts `409` and is expected to fail until this is mapped; `075e` `MSNA-013` covers the equivalent Admin-UI read-only guard.

## Cleanup

Four `AGENT-TEST-MSN-*` scratch missions were created and deleted; a search sweep of the store confirms 0 remaining. Note for anyone re-verifying: `GET /api/loyalty-missions/{id}` returns **`200` with a `null` body** for both a deleted and a never-existed id, so a status check alone will read a deleted mission as present.
