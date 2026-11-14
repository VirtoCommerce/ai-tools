---
description: "Core/ModuleConstants.cs — the canonical source for permissions & settings."
applyTo: "src/*.Core/ModuleConstants.cs,src/*.Web/Localizations/*.json"
---

# Permissions, settings, localizations — the three-source-of-truth pattern

`P01 · platform` Each module-defined permission must appear in **both** C# (`Core/ModuleConstants.cs`) **and** the localization JSON (`Web/Localizations/en.VirtoCommerce.<ModuleName>.json`).
`P02 · platform` Each module-defined setting must appear in **both** C# (`Core/ModuleConstants.cs`) **and** the localization JSON.
The UI consumes the i18n keys defined in that JSON.

| Concept     | C# (canonical)                                                       | i18n JSON key                                       | UI consumer                                        |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Permission  | `P08 · platform` `ModuleConstants.Security.Permissions.<Name>` + add to `AllPermissions` | `P01 · platform` `permissions["<perm-name>"]`       | `[Authorize(Permissions.Read)]` on Web API; `permission:` on menu items |
| Setting     | `P05 · platform` `SettingDescriptor` in `ModuleConstants.Settings.*` | `P02 · platform` `settings.<Group>.<Key>.title`     | `P04 · platform` Read via `ISettingsManager`       |
| Setting     | `P06 · platform` `GroupName = "<Area>\|<Subgroup>"` (order `"Orders\|General"`) | `P07 · platform` `settings.<Group>.<Key>.description` |                                                    |

## Permission naming

`P10 · platform` Permissions are kebab-case `<permission-prefix>:<area>:<action>`, plus an app-level `<permission-prefix>:access`.
`X03 · platform` The prefix follows the co-install table in `vc-backend-shared.md`.
`P03 · platform` Actions follow VC: `read` · `create` · `update` · `delete`, each one the area has. They aren't limited to these — an operation that needs its own grant gets a custom action permission (`order:capture_payment`, `search:index:rebuild`, `gdpr:anonymize`).
An area with both `create` and `update` gets split create / update endpoints (see [vc-backend-rest-api.md](vc-backend-rest-api.md)).
An area whose items are created by another path (e.g. by a registration flow) has no `create`.
`P09 · platform` The C# constants are PascalCase mirrors (`ModuleConstants.Security.Permissions.ModelNamesRead`).
`P01 · platform` When you add one, update **all three** of `ModuleConstants`, `AllPermissions`, and the `permissions` block in the localization JSON.

## Common pitfalls

| Area                             | ✅ Do                                                                | ❌ Don't                                                              |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `P01 · platform` **Permissions** | Update `ModuleConstants` + `AllPermissions` + the localization JSON | Add a permission only in C# (the UI shows its raw id, not a readable name) or only in JSON (a dangling key nothing registers) |
| `P04 · platform` **Settings**    | `ISettingsManager` via DI                                           | Read `IConfiguration` directly for module-owned settings             |
