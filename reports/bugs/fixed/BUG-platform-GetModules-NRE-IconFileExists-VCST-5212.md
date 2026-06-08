# BUG — `GET /api/platform/modules` 500 NullReferenceException in `IconFileExists` (null local IconUrl)

## Status: FIXED — [VCST-5212](https://virtocommerce.atlassian.net/browse/VCST-5212)

## Resolution
- **Fixed in:** [vc-platform PR #3051](https://github.com/VirtoCommerce/vc-platform/pull/3051) — 3-line `if (string.IsNullOrEmpty(moduleIconUrl)) return false;` guard at the top of `ModulesController.IconFileExists` (the RCA anchor); + new xUnit test (ADD only) encoding the STR.
- **Verified:** 2026-06-08 on vcst-qa @ Platform `3.1035.0-pr-3051-23c3-vcst-5212` (PR build deployed). `GET /api/platform/modules` → 200 ×3 (83 modules, 14 `iconUrl: null` handled gracefully); Admin Modules blade renders "Installed (83)". Evidence: `tests/Sprint26-11/VCST-5212/`.
- **Method:** code review + live REST (3/3) + Admin SPA blade. JIRA → Tested. ⚠️ PR #3051 still **OPEN/unmerged** (`license/cla` pending) — DONE held until a human merges (Gate 7).

**Severity:** High — `/api/platform/modules` is a core platform endpoint; an intermittent 500 breaks the Admin Modules blade, deployment module-install checks, and any CI that boots the platform.

**Env:** Discovered in `VirtoCommerce/vc-module-search` dev Module CI — run [27132368661](https://github.com/VirtoCommerce/vc-module-search/actions/runs/27132368661), platform image `local-latest`, 48 modules loaded. Code present on `vc-platform` `dev`.

## Summary
`ModulesController.GetModules()` calls `IconFileExists(localModule)` after guarding only the *management-catalog* descriptor's IconUrl. When a module has a non-empty IconUrl in the management catalog but a **null IconUrl in the local catalog**, `IconFileExists` dereferences null and throws `NullReferenceException`, so the whole endpoint returns 500. The failure is **non-deterministic** across runs (depends on module load/discovery state).

## Steps to Reproduce
1. Boot the platform with the module set used in CI (48 modules).
2. Call `GET /api/platform/modules` (or `POST /api/platform/modules/reload` then `GET`).
3. Endpoint returns `500 {"message":"Object reference not set to an instance of an object."}`.

Observed twice in one matrix run:
- `auto-autotests (sqlserver)` — `tests/restapi/platform/test_modules.py::test_modules_reload` FAILED (`POST .../reload` → `GET .../modules` → 500). Suite: `1 failed, 42 passed`.
- `auto-autotests (mysql)` — failed earlier in the `Check Installed Modules` preflight on the same `GET .../modules` 500.
- `auto-autotests (postgres)` — **passed** (did not trip the NRE this run).

## Expected vs Actual
- **Expected:** `GET /api/platform/modules` returns `200` with the module list; a missing/null icon yields `IconUrl = null` for that entry.
- **Actual:** `500` NullReferenceException; entire response fails.

## Server stack trace
```
System.NullReferenceException: Object reference not set to an instance of an object.
   at VirtoCommerce.Platform.Web.Controllers.Api.ModulesController.IconFileExists(ManifestModuleInfo module)
   at VirtoCommerce.Platform.Web.Controllers.Api.ModulesController.GetModules()
```

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | platform admin/API endpoint, not storefront |
| 2. Backend Admin | FAIL (inherited) | Admin Modules blade consumes this endpoint |
| 3. GraphQL xAPI | N/A | not an xAPI call |
| 4. Platform REST API | **FAIL** | `GET /api/platform/modules` → 500 NRE, CI run 27132368661 |

**Owning layer:** Layer 4 — Platform REST API.

## Root Cause Analysis
[`ModulesController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/ModulesController.cs) — the null guard is on the wrong object:

```csharp
// GetModules() — line ~103
foreach (var module in allModules.Where(x => !string.IsNullOrEmpty(x.IconUrl)))   // guards `x` (management catalog)
{
    module.IconUrl = localModules.TryGetValue(module.Id, out var localModule) && IconFileExists(localModule)   // calls on `localModule`
        ? localModule.IconUrl : null;
}

// IconFileExists() — line ~540
private static bool IconFileExists(ManifestModuleInfo module)
{
    var moduleIconUrl = module.IconUrl;
    if (!moduleIconUrl.StartsWith('/'))   // line 543 — NRE when localModule.IconUrl is null
    ...
}
```

`allModules` (from `_moduleManagementService.GetModules()`) and `localModules` (from `_moduleService.GetModules()`) are **different collections**. A module can have a non-empty management IconUrl (passes the `Where`) but a null local IconUrl → `IconFileExists(localModule)` NREs at `moduleIconUrl.StartsWith('/')`.

**Suggested fix:** null-guard the *local* IconUrl — either at the top of `IconFileExists` (`if (string.IsNullOrEmpty(module.IconUrl)) return false;`) or test `localModule.IconUrl` in the predicate. One-line null guard, no behavioral branch.

## Notes
- **Not a `vc-module-search` defect.** The module's own `ci` (build + SonarCloud) and `deploy-cloud` jobs passed; only style warnings. The red is the platform image's latent NRE surfacing through the auto-tests that boot the platform.
- Re-running the failed `auto-tests` jobs will likely go green (as postgres did) — the bug is intermittent.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Component / module:** Platform — Modules API (`ModulesController`)
- **RCA anchor:** `ModulesController.IconFileExists` (`ModulesController.cs:543`, called from `GetModules()` `:105`)
- **Routing confidence:** HIGH
