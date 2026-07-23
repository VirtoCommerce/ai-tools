# FIX run — VCST-5554 — Gate 0 BAIL (out of auto-fix scope)

**Ticket:** [VCST-5554](https://virtocommerce.atlassian.net/browse/VCST-5554) — Admin Orders dashboard 500, `InvalidCastException` (String→Boolean) on `GET /api/order/dashboardStatistics`
**Date:** 2026-07-23 · **Env:** vcst-qa @ Platform `3.1046.0`, Orders `3.1012.0`
**Outcome:** BAIL at Gate 0 — no repo cloned, no branch, no PR. Ticket left at To Do; BAIL rationale commented on the ticket.

## Gate results
- **Gate 0 (fix-eligibility triage): BAIL — `not-a-bug` (env-data-drift).** The immediate trigger is a mistyped persisted `PlatformSettingValue` row (`Order.DashboardStatistics.Enable` stored as String), not a code defect. Setting descriptor is correctly typed `Boolean`/default `true`; the same build returns 200 on vcptcore-qa. Fixing the setting-row data restores the dashboard with no code change. The durable robustness guard belongs in the platform `SettingsManager` (`vc-platform`) — platform-wide cast semantics, breaking-change/multi-repo risk — outside the auto-fix bar.
- Gates 1–7: not reached.

## RCA anchor (verified on `vc-module-order@dev`)
- `src/VirtoCommerce.OrdersModule.Web/Controllers/Api/OrderModuleController.cs` → `GetDashboardStatisticsAsync`, first line `settingsManager.GetValueAsync<bool>(DashboardStatisticsEnabled)`.
- Setting descriptor: `src/VirtoCommerce.OrdersModule.Core/ModuleConstants.cs`.

## Handoff
1. **Unblock now (no deploy):** correct/delete the `Order.DashboardStatistics.Enable` setting value on vcst-qa.
2. **Optional durable hardening:** scope a `vc-platform` `SettingsManager` guard against type-mismatched stored settings under human review (+ close the observability gap — raw exception leaked to client, no server-side `exceptions`/`traces` row).

Bug report: `reports/bugs/open/BUG-order-dashboard-statistics-500-invalidcast-VCST-5554.md`
