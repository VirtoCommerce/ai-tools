# BUG: Admin Orders dashboard 500 — `InvalidCastException` (String→Boolean) on `GET /api/order/dashboardStatistics`

## Status: FIXED (code fix verified — supersedes the earlier env-data-only resolution)
**Tracker:** [VCST-5554](https://virtocommerce.atlassian.net/browse/VCST-5554) (Jira Bug, filed 2026-07-23)

## Resolution — code fix (2026-08-03, supersedes the env-data correction below)
- **Fixed in:** `vc-platform` PR [#3089](https://github.com/VirtoCommerce/vc-platform/pull/3089) "Safe setting value converter" — a new `SettingValueConverter` makes the registered descriptor the authority on a setting's type. `SettingEntity.ToModel` reconciles stored values against the descriptor (falling back to `DefaultValue` when unconvertible), `SettingsExtension.GetValueInternalAsync<T>` converts instead of casting, and `SettingsManager` logs one warning per cache load naming both types. No migration, no save-path self-healing — drifted rows are tolerated on read, not repaired.
- **Verified:** 2026-08-03 on vcst-qa @ platform image tag `3.1053.0-pr-3089-c16b-vcst-5554-c16b5029` (Orders `3.1013.0`). Deployed via `vc-deploy-dev` [#6274](https://github.com/VirtoCommerce/vc-deploy-dev/pull/6274) (merged 09:50 UTC, deploy Action `30803137555` green).
- **Method:** the drift was re-created deliberately — `POST /api/platform/settings` persists the posted `ValueType` verbatim (`SettingEntity.FromModel`), so no DB access was needed and the change was fully reversible. Four stored states were probed live:

  | Stored row | Descriptor | Resolves to | Endpoint |
  |---|---|---|---|
  | `ShortText "True"` (original corruption) | Boolean | `true` | **200**, 3/3 |
  | `ShortText "yes"` (unconvertible) | Boolean | `true` (descriptor default) | **200** |
  | `ShortText "False"` (convertible) | Boolean | `false` | **200**, disabled path (`revenue: null`) |
  | `Boolean true` (restored) | Boolean | `true` | **200**, 3/3 |

  The `"yes"` case proves the row really is `ShortText` (a `Boolean` write of `"yes"` throws at save, yet the POST returned `204`); the `"False"` case proves the stored string is genuinely read and converted, so none of the writes was a silent no-op. `GET /api/platform/settings/v2/global/values` additionally returned the setting as a JSON **boolean** `true` while the row was still `ShortText`.
- **Layer 2 (Admin SPA):** PASS 3/3 under the drifted row — all 6 KPI cards populated, both quarterly charts render, Orders list + order detail unaffected, no console errors, no 4xx/5xx on any `/api/` call (`qa-backend-expert`, `playwright-edge`).
- **Environment restored** to `Boolean` / `true` (row `c4476df4-238a-4071-a650-a098d259746d`); post-restore probe 200 3/3 populated.
- **Evidence:** `reports/tickets/Sprint26-15/VCST-5554/evidence.html` (+ `screenshots/`).
- **Outstanding:** PR #3089's `auto-tests` job is red on all 3 DBs — a seed-step page-builder DI 500, not the settings change (owned by the PR). The `WarnOnValueTypeDrift` log line was not captured (App Insights unreachable, expired MFA) — corroboration only. The vcst-qa deploy pin still needs reverting (it displaces VCST-5618's build).

## Earlier resolution — environment data correction (2026-07-23, superseded)
- **Fixed in:** environment data correction on vcst-qa (no code deployed). The mistyped persisted setting `Order.DashboardStatistics.Enable` was stored as the STRING `"True"` under a `Boolean` descriptor; re-saved via the Admin SPA Settings UI (Settings → Orders → General → "Enable dashboard statistics", toggled OFF→Save→ON→Save) to rewrite the value as a real boolean.
- **Verified:** 2026-07-23 (qa-backend-expert, Admin SPA, real-user interaction). `GET /api/order/dashboardStatistics` → **200** (was 500) with a populated `DashboardStatisticsResult` (orderCount 1677, customersCount 244, itemsPurchased 5174, lineItemsPerOrder ≈3.09, multi-currency revenue). All 6 KPI cards + both quarterly charts render. No `dashboardStatistics` console error remains. Evidence: `reports/bugs/screenshots/BUG-order-dashboard-statistics-FIXED-2026-07-23.png`.
- **`/qa-fix` verdict:** Gate 0 BAIL (env-data-drift) — correct. The live symptom was resolved by data correction, not code.
- **Open follow-up (separate, optional, NOT this env fix):** the latent code robustness gap remains — an unguarded `(bool)` cast in the platform `SettingsManager` lets a single type-mismatched setting row 500 an endpoint and leak the raw .NET exception to the client, plus no server-side `exceptions`/`traces` row is emitted. If wanted, scope a deliberate `vc-platform` `SettingsManager` hardening under human review; it is not required to keep vcst-qa working.

**Severity:** High (P1) — the Admin SPA landing dashboard is broken for every operator on login; order management itself still works.

**Env:** vcst-qa @ Platform `3.1046.0`, `VirtoCommerce.Orders` `3.1012.0` (source: `vc-deploy-dev@vcst-qa` `backend/packages.json`)

## Summary
The Admin **Home → "Your store at a glance"** dashboard calls `GET /api/order/dashboardStatistics`, which returns **500** with body `{"message":"Unable to cast object of type 'System.String' to type 'System.Boolean'."}`. All six KPI cards render value-less and the two chart widgets render blank. Reproducible on every fresh load (2/2). Detected via `/qa-monitoring` (sustained 500s in App Insights), confirmed live by qa-backend-expert.

## Steps to Reproduce
1. Log into the Admin SPA at `{BACK_URL}` as an operator with `order:dashboardstatistics:view` (e.g. `admin`).
2. Land on / reload the Home workspace ("Your store at a glance").
3. Observe the dashboard widget request `GET /api/order/dashboardStatistics`.

## Expected vs Actual
- **Expected:** `200` with a `DashboardStatisticsResult` (revenue, customers, AOV, items, lines-per-order) populating the six KPI cards + charts.
- **Actual:** `200`-wrapped tool? No — `500 application/json`, body `{"message":"Unable to cast object of type 'System.String' to type 'System.Boolean'.","stackTrace":null}`. Cards value-less, both widget panels blank.

## Evidence
- **Re-confirmed 2026-07-23 (qa-backend-expert, `playwright-edge`, admin login via real UI):** still reproduces on Platform `3.1046.0` / Orders `3.1012.0` (unchanged). `GET /api/order/dashboardStatistics` (no query params) → `500`, body `{"message":"Unable to cast object of type 'System.String' to type 'System.Boolean'.","stackTrace":null}` (251ms). All 6 KPI card **labels** render but every value is blank + 2 empty chart slots. Console: `Failed to load resource: the server responded with a status of 500 () @ /api/order/dashboardStatistics`. Screenshot: `reports/bugs/screenshots/BUG-order-dashboard-statistics-500-2026-07-23.png`. (An unrelated "license expired Jan 1, 2026" banner is also shown.)
- **Live repro (qa-backend-expert, 2/2):** `GET https://vcst-qa.govirto.com/api/order/dashboardStatistics` (no query params) → `500`, body above; console mirror `Failed to load resource: 500 @ /api/order/dashboardStatistics`.
- **Telemetry (App Insights `vcst-qa`, 24h):** 8× `500 GET OrderModule/GetDashboardStatistics`, 21-Jul 15:09 → 22-Jul 12:55 UTC, distinct `operation_Id`s, durations 3ms–1854ms. **No `exceptions`/`traces` row is emitted** — only the request 500 (the raw .NET message is surfaced to the client but not tracked server-side; observability gap).
- **Failing SQL behind the op:** reads `PlatformSetting` ⋈ `PlatformSettingValue` (`BooleanValue`, `ShortTextValue`, `ValueType`) `WHERE [Name] = N'Order.DashboardStatistics.Enable'` — i.e. the settings read below.
- **Cross-env check (does NOT reproduce on vcptcore-qa):** on `vcptcore-qa` (Platform `3.1046.0`, same Orders build) the endpoint returns **200** with a valid `DashboardStatisticsResult` (live 3/3 + 26× `200`/0 fails in App Insights over 7 days). Same code, healthy setting row ⇒ confirms the vcst-qa failure is **environment-data-specific** (a String-typed persisted setting row), not a defect that triggers on every deployment.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only feature; storefront does not call this endpoint |
| 2. Backend Admin (SPA) | FAIL | Home dashboard KPI cards + widgets blank on every load |
| 3. GraphQL xAPI | N/A | Plain Platform REST endpoint, not xAPI |
| 4. Platform REST API | FAIL | `GET /api/order/dashboardStatistics` → `500` `InvalidCastException` |

**Owning layer:** Layer 4 — Platform REST (`vc-module-order`).

## Root Cause Analysis
`OrderModuleController.GetDashboardStatisticsAsync` fails on its **first line**:
```csharp
// src/VirtoCommerce.OrdersModule.Web/Controllers/Api/OrderModuleController.cs
var dashboardEnabled = await settingsManager.GetValueAsync<bool>(
    ModuleConstants.Settings.General.DashboardStatisticsEnabled);   // ← InvalidCastException
```
The descriptor is correctly typed (`ModuleConstants.cs` → `DashboardStatisticsEnabled`: `ValueType = SettingValueType.Boolean, DefaultValue = true`). The exception therefore comes from a **persisted `PlatformSettingValue` row for `Order.DashboardStatistics.Enable` stored as a String** (value in `ShortTextValue` / `ValueType = ShortText`) instead of `BooleanValue`. `SettingsManager.GetValueAsync<bool>` casts the stored value to `bool` unguarded → `Unable to cast object of type 'System.String' to type 'System.Boolean'`. With no persisted row the descriptor default (`true`) is returned and the endpoint works — so this only fires where a mistyped row exists (consistent with the restored `vcst-qa-platform_restored` DB).

Two contributing factors:
1. **Data (immediate trigger):** the type-mismatched persisted setting row on vcst-qa. Correcting/deleting that `Order.DashboardStatistics.Enable` setting value (so it stores a Boolean, or falls back to the default) restores the dashboard without a code change.
2. **Code (latent robustness gap):** an unguarded `(bool)` conversion in the platform `SettingsManager` + no defensive handling in the module endpoint lets a single mistyped setting row 500 the whole dashboard and leak a raw .NET exception message to the client.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** `VirtoCommerce/vc-module-order` (endpoint + setting descriptor owner); durable hardening may also touch `VirtoCommerce/vc-platform` (`SettingsManager` value conversion)
- **repoKind:** module (secondary: platform)
- **Ownership hint:** platform
- **Component / module:** Orders — Admin dashboard statistics (`OrderModuleController.GetDashboardStatisticsAsync`)
- **RCA anchor:** `src/VirtoCommerce.OrdersModule.Web/Controllers/Api/OrderModuleController.cs` → `GetDashboardStatisticsAsync` first line `settingsManager.GetValueAsync<bool>(DashboardStatisticsEnabled)`; setting `Order.DashboardStatistics.Enable` in `src/VirtoCommerce.OrdersModule.Core/ModuleConstants.cs`
- **Routing confidence:** MEDIUM — the descriptor is correct, so the primary trigger is an **env-data-drift** setting row (a `/qa-fix` Gate-0 BAIL candidate: fix the data on vcst-qa first). The genuine *code* fix is a robustness guard against a type-mismatched stored setting and spans the platform `SettingsManager`; confirm scope before routing.
