# BUG: Back office Manage profile — TypeError in console, empty Regional format, blade can stay stuck loading `[Medium]`

## Status: READY_TO_SUBMIT
**Tracker:** VCST-6807
**Found by:** agent — testing VCST-6632

**Env:** vcptcore_qa1 @ Platform 3.1096.0-pr-3061-c9bf · VirtoCommerce.AdminAngularJs 3.1096.0 · VirtoCommerce.AdminShell 3.1093.0 · role Administrator · Firefox (3 opens) + Edge (1 open)

## Summary
Opening **Manage profile** throws `TypeError: Cannot read properties of undefined (reading 'name')` every time, because `GET /api/platform/localization/regionalformats` returns `[]`. The **Regional format** field is empty with no options. In 2 of 3 opens the blade also stays under its loading overlay, so no profile setting can be changed. Regression from VCST-6338 (AngularJS admin moved into the Admin-AngularJS module).

## Steps to Reproduce
1. Sign in to the back office as an administrator (stored profile RegionalFormat = `en`).
2. Open the user menu (top right) → **Manage profile**.
3. Watch the console and the **Regional format** field; close the blade and reopen it 2 more times.

## Expected vs Actual
- **Expected:** the Regional format dropdown lists the available formats with `en` selected; no console error; the blade becomes usable (VirtoOZ: *Platform user guide → User profile*, Regional format is a standard setting).
- **Actual:**
  - console: `TypeError: Cannot read properties of undefined (reading 'name')` + `Possibly unhandled rejection` — **3/3** (Firefox serialises it as `Possibly unhandled rejection: {}`; Edge shows the text)
  - Regional format field empty, dropdown has zero options — **3/3**
  - blade stuck in its loading overlay (striped bar, greyed form, close icon hidden, clicks intercepted) — **2/3**; reopening is the only way out

![Empty Regional format](../../screenshots/Admin-Profile-Regional-Formats-Empty-TypeError/BUG-profile-regional-format-empty.png)
![Stuck loading](../../screenshots/Admin-Profile-Regional-Formats-Empty-TypeError/BUG-profile-blade-stuck-loading.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | back-office only |
| 2. Backend Admin | FAIL | TypeError 3/3, empty field 3/3, stuck 2/3 (screenshots above; HAR `session.har`) |
| 3. GraphQL xAPI | N/A | not used by the blade |
| 4. Platform REST API | FAIL | `GET /api/platform/localization/regionalformats` → 200 `[]` (admin token and anonymous); `locales` → 15 codes; no setting holds the format list, so not a data/config state |

**Owning layer:** Layer 4 — Platform REST (empty list); Layer 2 crashes on it.

## Root Cause Analysis
- `vc-platform` `src/VirtoCommerce.Platform.Web/Controllers/Api/LocalizationController.cs` `GetRegionalFormats()` (L67–80) builds the list only from `MapPath("~/")` + `js/i18n/angular/angular-locale_*.js` (L83–93). Commit `fa53dd3e` (VCST-6338, vc-platform#3152, 2026-11-01) moved those 398 files to `vc-module-admin-angular-js` `src/VirtoCommerce.AdminAngularJs.Web/Content/wwwroot/js/i18n/angular/`, so the directory no longer exists in the platform and the endpoint returns `[]`.
- `vc-module-admin-angular-js` `…/js/app/userProfile/blades/userProfile.js:23` `getNameByCode` does `_.find(entities, { id: entity }).name` with no guard; called from the `getRegionalFormats` callback (L48–51) it throws before `blade.isLoading` is recomputed. When `locales` returns before `regionalformats`, nothing clears `isLoading` → the stuck overlay (HAR timings match 3/3).
- Not in stable bundles: v15 (platform 3.1039.17) and v16 (3.1076.13) predate the extraction.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST (`GET /api/platform/localization/regionalformats`)
- **Suggested repo:** VirtoCommerce/vc-platform (make `GetRegionalFormats` find the locale files the admin module now ships); hardening: VirtoCommerce/vc-module-admin-angular-js `userProfile.js:23` null guard
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Platform localization API · Admin-AngularJS User profile blade
- **RCA anchor:** `LocalizationController.cs` `GetAllInternationalizationFiles` (`_hostingEnv.MapPath("~/")`); `userProfile.js:23` `_.find(entities, { id: entity }).name`
- **Routing confidence:** MEDIUM — where the fix belongs (platform scanning module content vs. the endpoint moving into the admin module) is a design choice for the VCST-6338 owners

