## Root-Cause Worksheet — ORDER-STATUS-L10N-500

### 1. Symptom (one line, observable)
On vcptcore, every save of the `Order.Status` dictionary's localized values (Admin Settings › Orders › Order statuses, or `POST /api/platform/localizable-settings/Order.Status/dictionary-items`) returns 500 "An item with the same key has already been added. Key: en-US" — even when the posted set is the unchanged GET output.

### 2. Lowest failing layer (lowest wins)
[ ] storefront-only  [ ] xAPI/GraphQL  [x] REST  [x] module/data  [ ] infra
Decided by: row 4 (REST 500 on an identity payload) + row 15 (same call returns 204 on vcst/virtostart) → the failure is in the platform's save of stored data, not in the client payload.
→ repoKind: platform → repo: vc-platform (`LocalizableSettingService.SaveAsync`) — env data on vcptcore is the trigger.

### 3. Evidence → claim chain (every claim cites evidence)
| # | claim | evidence (artifact in package + the exact value) |
|---|-------|--------------------------------------------------|
| 1 | Save fails deterministically on vcptcore, with an unchanged payload | `network/failing-saveDictionaryItems.json` → 3× `status: 500`, `responseBody.message = "An item with the same key has already been added. Key: en-US"`; payload has one `en-US` per alias |
| 2 | The endpoint itself works on vcptcore — only this dictionary fails | same file → `Shipment.Status` identity save `status: 204` |
| 3 | Same code saves fine elsewhere | `network/compare-vcst.json` / `compare-virtostart.json` → `saveStatus: 204`, `unchanged: true` |
| 4 | Code is identical across the three builds | `source/findings.md` §5 → `compare 3.1072.0...3.1075.0` touches no Settings/Localizations file |
| 5 | The throw is the per-alias `ToDictionary(x => x.LanguageCode)` over STORED rows grouped case-insensitively | `source/findings.md` §2 → `LocalizableSettingService.cs:146-150` |
| 6 | The duplicate is invisible to every read surface | `source/findings.md` §3 → `GetItems` groups case-sensitively (`:261`); `network/admin-localizable-settings.json` shows one `en-US` per alias |
| 7 | The schema allows it | `source/findings.md` §4 → `PlatformDbContext.cs:53-57`, index `(Name, Alias)` non-unique, no `LanguageCode` |
| 8 | A failing save changes nothing visible | `network/compare-vcptcore.json` → `unchanged: true` |
| 9 | Server corroborates the 500 at that operation | `network/appinsights-3b78ff3c9a089e40a9094332b8102e20.json` → request `resultCode 500`, `user_AuthenticatedId admin`; no exception tracked |

### 4. The "why" in one sentence
vcptcore's `PlatformLocalizedItem` table holds two `Order.Status` / `en-US` rows whose aliases differ only by letter case. `SaveAsync` groups stored rows case-insensitively and then builds a per-language dictionary, so it throws before writing anything. `GetItems` matches aliases case-sensitively, so the duplicate never appears in the API or the Admin editor and cannot be removed from there.

### 5. Alternatives ruled out (MANDATORY — at least 2)
| alternative hypothesis | how it was ruled out |
|------------------------|----------------------|
| By-design / config-gated | Row 15: `Order.Status` is `isLocalizable=true` on vcptcore (`network/admin-localizable-settings.json`); the same identity save returns 204 on vcst + virtostart (`compare-*.json`). A 500 on an unchanged payload is not a designed outcome |
| Bad client payload (the obvious one) | Identity payload = the GET output verbatim; one `en-US` per alias (`failing-saveDictionaryItems.json → payload`); the payload-side grouping (`:132-143`) cannot collide on it |
| Env data drift | This IS the cause (stored rows), not an alternative to it — confirmed by elimination (claims 1-4), exact rows still to be read from the DB (§8) |
| Flaky / timing | 4/4 deterministic on vcptcore across two different payloads; 0 failures on two other envs |
| Version skew (P1) | Platform 3.1072.0 vs 3.1075.0/3.1074.0: no Settings/Localizations change in between; Orders 3.1016.0 identical on vcptcore (fails) and vcst (works). vcptcore-only modules (`AI` manifest aggregator; PR builds of BackgroundJobs/FileExperienceApi/GoogleEcommerceAnalytics/PageBuilder) do not write `PlatformLocalizedItem` — only vc-platform does (`source/findings.md` §6) |

### 6. Regression archaeology (only if "used to work" / post-deploy / version skew)
- Not a code regression: the grouping block predates VCST-786 (2024-05-21) and is unchanged through `d2bb428d3` (2026-07-16) and 3.1075.0.
- When the duplicate rows were written is NOT established — `PlatformLocalizedItem` is an auditable entity, so `CreatedDate`/`CreatedBy` on the offending rows answer it (§8 query).
- Circumstantial: vcptcore's `Order.Status` carries hand-entered test values (`en-US=New en1`, `fr-FR=Processing fr`, `de/en/fr=Cancelled`) — the dictionary has been used for manual localization testing on this env.
- Diff explains symptom AND in window? [ ] n/a (data-triggered)

### 7. Confidence
[ ] HIGH  [x] MEDIUM  [ ] LOW
MEDIUM: reproduction, cross-env control, version comparison and the throw site are all proven. The one inferred link is the exact shape of the stored duplicate (which alias, which case variant). No REST route lists raw rows and no stack trace was tracked, so a DB read is needed to move this to HIGH.

### 8. Fix Routing handoff (for /qa-fix Gate 1)
- **Env unblock (data, vcptcore only):** a DBA runs
  `SELECT Id, Name, Alias, LanguageCode, Value, CreatedDate, CreatedBy FROM PlatformLocalizedItem WHERE Name = N'Order.Status' ORDER BY Alias, LanguageCode, CreatedDate;`
  and deletes the stray case-variant row(s). The save then works, and the merged 6×12 translations can be applied.
- **Product hardening (platform):** `vc-platform` · `src/VirtoCommerce.Platform.Data/Settings/LocalizableSettingService.cs:146-150` (the write path must tolerate stored duplicates, e.g. keep the first row per language and delete the rest, rather than throw), plus `:261` (the read and write paths disagree on alias case) and `PlatformDbContext.cs:53-57` (consider a unique `(Name, Alias, LanguageCode)` index, which needs a dedupe migration). Fix-forward; nothing to revert.
