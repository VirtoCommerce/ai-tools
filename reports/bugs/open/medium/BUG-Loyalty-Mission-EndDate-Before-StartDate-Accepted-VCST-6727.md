# BUG: Loyalty missions — save accepts an End date before the Start date (REST + Admin blade)

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-1645-W7
**Severity:** Medium (P3) · **Tracker:** [VCST-6727](https://virtocommerce.atlassian.net/browse/VCST-6727) · **Relates:** VCST-6042, VCST-5855

## Env
- **Stand:** `vcptcore_regression` (Admin SPA + REST, admin user)
- **Versions (package = deployed):** Platform 3.1076.8 · VirtoCommerce.Loyalty 3.1009.0 · VirtoCommerce.Marketing 3.1009.0
- **Repro rate:** deterministic (REST 1/1, Admin 1/1 on 2026-11-06; both FAIL in W7)
- **Trace id:** none — the stand sends neither `Request-Id` nor `traceparent`
- **HAR:** none — the edge lane recorded no HAR this session
- **App Insights:** N/A for this env — fallback: response bodies in the package `network/`

## Summary
`POST /api/loyalty-missions` accepts and persists a mission whose `endDate` is earlier than its `startDate`
(200, read-back keeps the inverted window). The Admin mission blade has no client check either: **Save**
stays enabled, the mission is saved as Draft with no message, and **Publish** is then offered. Such a mission
can never be active. `LoyaltyMissionValidator` (3.1009.0) has no rule relating the two dates.
Cases: 075d **MSN-007** (REST) and 075e **MSNA-023** (Admin) — one root.

## Steps to reproduce
REST:
1. Get an admin bearer token.
2. `POST /api/loyalty-missions` — Draft, `startDate` 2027-01-01T00:00:00Z, `endDate` 2026-01-01T00:00:00Z, `AnyUserGroupCondition`, `OrderCountGoal` 1, `FixedAmountReward` 50 → **200**; `GET` read-back shows the inverted window.
3. Control: `startDate` = `endDate` (2026-06-01) → 200 (acceptable boundary).

Admin SPA:
4. `{{BACK_URL}}/#!/workspace/loyalty-missions` → **Add**.
5. Name, Store B2B-store, Start date **Dec 1, 2026 12:00:00 PM**, End date **Nov 1, 2026 12:00:00 PM**, condition Any User Group, goal "Reach 1 orders", reward 10 fixed points.
6. **Save** is enabled → click → `POST /api/loyalty-missions` **200**, blade re-titles to the saved Draft; read-back `startDate` 2026-12-01T20:00:00Z, `endDate` 2026-11-01T20:00:00Z.

## Actual
- REST and Admin both persist a mission with End date before Start date; no 400, no message.
- ![before save](../../screenshots/Loyalty-Mission-EndDate-Before-StartDate-Accepted/MSNA-023-1-end-before-start-save-enabled.png)
- ![after save](../../screenshots/Loyalty-Mission-EndDate-Before-StartDate-Accepted/MSNA-023-2-saved-as-draft-inverted-window.png)

## Expected
- The save is rejected with `400` and a validation message (same FluentValidation array as other invalid input, KB-D64B1613), nothing persisted; the Admin blade shows the message.
- `startDate` = `endDate` may stay valid (boundary). Docs (`managing-loyalty-missions.md`) state no date-order rule — inferred from the mission semantics and the validator's other authoring invariants; VirtoOZ unreachable at filing.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A — not probed by the investigation | — |
| 2. Backend Admin | FAIL | package `screenshots/MSNA-023-*.png`, `network/MSNA-023-admin-POST-loyalty-missions-response.json` |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | FAIL | package `network/MSN-007-rest-exchange.json`, `network/MSNA-023-GET-readback.json` |

**Owning layer:** Layer 4 — REST (the Admin blade is a client of the same POST).

## Root Cause Analysis
- Package: `reports/regression/REG-2026-11-05-1645-W7/evidence/MSN-007_MSNA-023/` (`root-cause.md`, `evidence-index.md`).
- `src/VirtoCommerce.Loyalty.Data/Validators/LoyaltyMissionValidator.cs` @3.1009.0 — rules for Name, StoreId, condition/goal/reward presence, negative reward/goal, OrderValue currency; **no StartDate/EndDate rule** (source copy `evidence/_source/LoyaltyMissionValidator.cs`).
- `src/VirtoCommerce.Loyalty.Web/Scripts/blades/loyalty-mission-details.js:135` — `canSave = isDirty && isDraft && form.$valid`, no date check (UX extra, not a second bug).
- Ruled out: time-zone artefact (gap is a month / a year), data drift (fresh scratch missions).
- Sibling: VCST-5855 (negative reward accepted, Done) — same validator, different missing rule.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-loyalty
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Loyalty — mission save validation
- **RCA anchor:** `src/VirtoCommerce.Loyalty.Data/Validators/LoyaltyMissionValidator.cs` (`LoyaltyMissionValidator` ctor — add `EndDate >= StartDate` when both set)
- **Routing confidence:** HIGH
