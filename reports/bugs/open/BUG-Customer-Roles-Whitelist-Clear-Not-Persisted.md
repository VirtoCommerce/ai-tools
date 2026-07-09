# BUG — Platform dictionary setting cannot be cleared to empty; deleting all values + Save is a silent no-op `[Medium]`

## Status: CONFIRMED

**JIRA:** VCST-5441 (filed 2026-07-09, relates to VCST-5239)
**Env:** vcst-qa @ Platform 3.1043.0, Customer `3.1014.0-alpha.1002-vcst-5239`
**Repro feature:** VCST-5239 — Organization/Membership roles whitelist (Settings → Customer → Roles)
**Owning repo:** `VirtoCommerce/vc-platform` (settings framework) — confirmed at source

### Module Versions
- Platform: 3.1043.0
- VirtoCommerce.Customer: `3.1014.0-alpha.1002-vcst-5239` (declares the two `Customer|Roles` SettingDescriptors — PR #304)
- VirtoCommerce.ProfileExperienceApiModule: `3.1010.0-pr-137-5f46`

## Summary
Deleting all entries from a dictionary (`IsDictionary=true`) platform setting and clicking Save reports success (HTTP 204, no error, success toast) but does **not** persist the empty state — the removed entries reappear immediately and after a full reload. Adding entries persists; only the clear-to-empty direction fails. **This is a platform-wide defect** in `SaveObjectSettingsAsync` — it affects *any* dictionary setting; the VCST-5239 `Customer|Roles` whitelist is just the reproduction.

## Steps to Reproduce
1. Admin SPA → Settings → Customer module → Roles.
2. Open the **Organization roles whitelist** editor (it holds ≥1 entry, e.g. `Organization employee`, `Organization maintainer`).
3. Select all entries → Delete → Save.
4. Observe the editor grid; then reload the page and reopen the editor.

## Expected vs Actual
- **Expected:** after deleting all entries and saving, the setting is empty and stays empty after reload — symmetric with the add direction, which persists.
- **Actual:** Save returns 204 (no error, success toast) but the grid immediately re-populates with the deleted entries, and a full reload + reopen still shows them. The setting cannot be emptied via the UI.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin-only setting; no storefront path exercised |
| 2. Backend Admin (Admin SPA) | FAIL (symptom surfaces here) | Delete-all + Save shows success, grid re-fills. Admin UI faithfully POSTs an empty `allowedValues` — the UI itself is correct |
| 3. GraphQL xAPI | N/A | Platform settings are not served via xAPI |
| 4. Platform REST API | **FAIL (owning layer)** | `POST /api/platform/settings` (empty `allowedValues`) → 204, but follow-up GET returns the prior `allowedValues` → `ISettingsManager.SaveObjectSettingsAsync` |

**Owning layer:** Layer 4 — Platform REST API → `ISettingsManager.SaveObjectSettingsAsync`.

## Evidence (network)
`Customer.OrganizationRolesWhitelist` — before clear it held 2 entries (Organization employee, Organization maintainer):

```
POST /api/platform/settings
  body: [{ name: "Customer.OrganizationRolesWhitelist", value: null, allowedValues: [], isDictionary: true }]
  -> 204 No Content

GET  /api/platform/settings/Customer.OrganizationRolesWhitelist
  -> 200   value: null   allowedValues: ["Organization employee", "Organization maintainer"]   (both reappeared)
```

`Customer.MembershipRolesWhitelist` behaves identically.

![before clear](../screenshots/BUG-roles-whitelist-org-before-clear.png)
![reappeared after reload](../screenshots/BUG-roles-whitelist-org-after-reload-reappeared.png)

## Root Cause Analysis (confirmed at source)
The defect is in the **platform settings framework** (vc-platform), not the Customer module.

1. **`ObjectSettingEntry.ItHasValues`** (`src/VirtoCommerce.Platform.Core/Settings/ObjectSettingEntry.cs`) is a computed getter:
   ```csharp
   public bool ItHasValues => Value != null || !AllowedValues.IsNullOrEmpty();
   ```
   The client's `itHasValues` in the payload is ignored — the server recomputes it. For a dictionary setting cleared to empty (`Value == null`, `AllowedValues` empty) it is **false**.
2. **`SettingsManager.SaveObjectSettingsAsync`** (`src/VirtoCommerce.Platform.Data/Settings/SettingsManager.cs`) filters the incoming set:
   ```csharp
   // Ignore unregistered settings, fixed settings, and settings without values
   var settings = objectSettings
     .Where(x => _registeredSettingsByNameDict.ContainsKey(x.Name) &&
                 !_fixedSettingsDict.ContainsKey(x.Name) &&
                 x.ItHasValues)     // ← cleared dictionary setting dropped here
     .ToArray();
   ```
   The cleared setting is removed from the save set. The method then only **Adds/Modifies** the survivors — it has **no delete-on-clear path** — so the existing DB row (with the old `allowedValues`) is left untouched, and the follow-up GET returns it.
3. The Customer module's two SettingDescriptors declare `AllowedValues = []` (PR #304 `ModuleConstants.cs`) — they supply no default and are **not** the cause; the module is only a consumer registering a dictionary setting. Whitelist entries are DB-stored and round-tripped by the platform.

**Consequence:** any `IsDictionary` platform setting cannot be cleared to empty through `SaveObjectSettingsAsync` — generic platform behavior, surfaced by the VCST-5239 whitelist.

**Fix direction (platform team / /qa-fix):** handle the cleared-to-empty case for a *registered* dictionary setting — don't filter it out on `!ItHasValues` when a DB row exists (remove/empty that row instead), or route a clear through `RemoveObjectSettingsAsync`. Design decision for the platform owners.

## Impact / Notes
- Data-persistence correctness defect with a misleading success response; **confirmed to affect any `IsDictionary` setting**, not just this whitelist.
- The `allowedValues` drift observed across runs (4→2, 3→1) is accumulated manual test churn (partial add/remove), **not** server-side regeneration — the descriptor default is empty. Stable signal: entries reappear / setting non-empty after a full clear.
- Reproduced 2026-07-09 on Chrome (Edge/Firefox unstable on the Admin ui-grid this session). Non-destructive — `value` stays null.

## Coverage / Evidence
- Regression case: `ORGROLE-005` in `regression/suites/Backend/customer/027b-customer-org-roles.csv` (renamed from `ORGM-019b` during the VCST-5239 suite redesign)
- Screenshots: `reports/bugs/screenshots/BUG-roles-whitelist-*.png`

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — Platform REST API (`/api/platform/settings` → `ISettingsManager.SaveObjectSettingsAsync`)
- **Suggested repo:** `VirtoCommerce/vc-platform` (confirmed at source; **not** vc-module-customer)
- **repoKind:** platform
- **Ownership hint:** platform (native VirtoCommerce deployment; no client profile)
- **Component / module:** Platform settings framework — `SettingsManager.SaveObjectSettingsAsync` / `ObjectSettingEntry.ItHasValues`
- **RCA anchor:**
  - `src/VirtoCommerce.Platform.Data/Settings/SettingsManager.cs` → `SaveObjectSettingsAsync` → the `.Where(... && x.ItHasValues)` filter (+ no delete-on-clear path)
  - `src/VirtoCommerce.Platform.Core/Settings/ObjectSettingEntry.cs` → `ItHasValues => Value != null || !AllowedValues.IsNullOrEmpty()`
- **Routing confidence:** HIGH — confirmed at source; the Customer module descriptor (`AllowedValues = []`) supplies no default, so the module is not the owner.

**Relates to:** VCST-5239.
