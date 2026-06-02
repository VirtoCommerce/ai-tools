# BUG: Loyalty reward accepts and persists a negative points amount `[Medium]`

## Status: CONFIRMED

**Env:** vcst-qa @ Platform 3.1030.0, Loyalty `3.1002.0-pr-9-9fc4`, Theme `b2b-vue-2.50.0-pr-2296`
**Module:** `VirtoCommerce.Loyalty` · **Endpoint:** `PUT /api/loyalty-programs` (Admin SPA → Loyalty workspace)

## Summary
A loyalty program reward accepts a **negative** points value (`-5.00`). The save succeeds (`PUT` → 200) and the value persists (`amount: -5` on subsequent GET). There is no client-side input clamp and no server-side range validation. Found by test case LOY-018.

## Steps to Reproduce
1. Admin SPA → `#!/workspace/loyalty` → open a program.
2. Rewards section → add/edit a reward ("Earn fixed amount of points per order").
3. Enter points value **-5.00** → **Save**.

## Expected vs Actual
- **Expected:** Negative points rejected — input prevented client-side, or `400`/validation error server-side. Points must be ≥ 0.
- **Actual:** Value accepted; `PUT /api/loyalty-programs` returns **200**; GET confirms persisted `amount: -5`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only configuration |
| 2. Backend Admin (SPA) | FAIL | Field accepts `-5.00`, no clamp/validation |
| 3. GraphQL xAPI | N/A | Not exercised |
| 4. Platform REST API | **FAIL** | `PUT /api/loyalty-programs` (amount:-5) → 200; `GET /api/loyalty-programs/{id}` round-trips persisted `amount: -5` (SPA save of `-7` likewise persisted) |

**Owning layer:** Layer 4 → `vc-module-loyalty`.

## Root Cause Analysis
Same gap as the empty-Name defect: `LoyaltyProgramController.Update` ([controller](https://github.com/VirtoCommerce/vc-module-loyalty/blob/dev/src/VirtoCommerce.Loyalty.Web/Controllers/Api/LoyaltyProgramController.cs)) persists the model via `crudService.SaveChangesAsync([model])` with no validation. The reward amount is not range-checked. Fix: validate reward points ≥ 0 (server-side, with a matching client-side `min=0`).

## Severity
**Medium** — data-integrity / business-logic: a negative reward could subtract points on rule evaluation. No crash, but invalid config is silently persisted.
