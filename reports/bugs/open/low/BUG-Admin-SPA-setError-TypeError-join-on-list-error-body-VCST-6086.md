# [Platform][Admin SPA] `setError` throws `TypeError ... 'join'` when an error body has no `errors` list — View details comes up empty

## Status: READY_TO_SUBMIT — filed as VCST-6086 (https://virtocommerce.atlassian.net/browse/VCST-6086)

**Severity:** Low · **Env:** vcst-qa @ Platform `3.1073.0-pr-3121-9965`, `VirtoCommerce.Loyalty 3.1009.0-pr-18-4411` · seen 2026-09-25, 5/5 rejected saves (POST and PUT)

## Summary
When a module API returns an error whose JSON body carries none of `exceptionMessage`, `message` or an `errors` array, the platform's `bladeNavigationService.setError` throws `TypeError: Cannot read properties of undefined (reading 'join')`. The global `httpError` handler calls `setError` on every failed request, so the throw fires before the blade's own error callback runs. A blade that relies on the global handler is left with a generic "400: Bad Request" banner and an **empty** View details dialog. Found while verifying VCST-5855, where the loyalty mission API returns a FluentValidation list.

## Steps to reproduce
1. Admin → Loyalty missions → **Add**. Enter any name, store `B2B-store`, one condition, one goal, and a FixedAmountReward of **-1**. Click **Save**.
2. Open DevTools → Console.
3. Optional: open a Draft mission, set the reward to -1, and click **Save** (the PUT path).

## Expected vs Actual
**Expected:** a failed request with any body shape produces no script error. The blade error and View details show whatever message the body carries, or fall back to the status text.
**Actual:** each rejected save logs `TypeError: Cannot read properties of undefined (reading 'join') at Object.setError` (via `responseError`). The response is `400` with body `[{"propertyName":"DynamicExpression","errorMessage":"Mission reward amount cannot be negative",...}]`. On a blade without its own error callback (loyalty mission create, **before** PR #18's blade fix), View details opened empty:

![empty Error details dialog](../../screenshots/Admin-SPA-setError-TypeError-join-on-list-error-body/empty-error-details-dialog.png)

The console error itself is not visual; its evidence is the console text quoted above.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | N/A | admin-only |
| 2. Backend Admin | FAIL | console `TypeError` on each rejected save; empty View details when only the global handler runs |
| 3. GraphQL xAPI | N/A | not involved |
| 4. Platform REST API | PASS | returns 400 with a correct validation list |

**Owning layer:** Layer 2, the platform Admin SPA shell (not the module).

## Root Cause Analysis
`vc-platform` @ `dev` (`0cb1fed`), `src/VirtoCommerce.Platform.Web/wwwroot/js/app/navigation/blade/bladeNavigation.js:477`:
```js
blade.errorBody = response.data ? response.data.exceptionMessage || response.data.message || response.data.errors.join('<br>') : blade.errorBody || blade.error;
```
If `data` is truthy but has neither `exceptionMessage` nor `message`, the code dereferences `data.errors` unconditionally. For a bare list body, or any object without an `errors` array, `.join` fails on `undefined`, `errorBody` is never assigned, and the exception propagates out of the global `httpError` handler.
**Class width:** at least two module controllers return `BadRequest(validationResult.Errors)` as a bare list: `vc-module-loyalty` `LoyaltyMissionController.cs` and `vc-module-white-labeling` `WhiteLabelingController.cs`. Any save rejected by either hits this path.
**Mitigation already shipped:** the VCST-5855 blade fix (vc-module-loyalty PR #18) sets the message in its own error callback after the global handler runs, so the admin sees the right text there. The console throw remains.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin (platform shell)
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Admin SPA `bladeNavigationService.setError`
- **RCA anchor:** `src/VirtoCommerce.Platform.Web/wwwroot/js/app/navigation/blade/bladeNavigation.js:477` (`response.data.errors.join('<br>')`)
- **Routing confidence:** HIGH. The fix is a guard in one function: accept an array body by joining its `errorMessage` values, and treat a missing `errors` as no detail.
