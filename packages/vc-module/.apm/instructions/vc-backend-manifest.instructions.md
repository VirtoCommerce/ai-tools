---
description: "module.manifest & the project files it must stay in lockstep with."
applyTo: "src/*.Web/module.manifest,src/**/*.csproj,Directory.Build.props"
---

# `module.manifest` is the runtime metadata source

`Web/module.manifest` declares:

- `<id>` — used as the connection-string key, settings key, permissions registry key, and the `Modules/$(...)/...` asset path token (e.g. the manifest `iconUrl`).
- `<version>`
  - `F01 · platform` Keep in lockstep with `Directory.Build.props` `<VersionPrefix>`.
  - `F07 · platform` `Directory.Build.props` `<VersionPrefix>` is the one place the version is set: no `.csproj` declares `Version` or `VersionPrefix`.
- `<platformVersion>` — the platform version this module is built against.
  - `F02 · platform` Must match the `VirtoCommerce.Platform.*` `PackageReference` versions in the `.csproj` files.
- `<dependencies>` — other VirtoCommerce modules + minimum versions.
  - `F04 · platform` Adding a `<dependency id="..." version="..."/>` here also requires referencing the corresponding NuGet package in the appropriate `.csproj`.
- `F05 · platform` `<moduleType>` — fully-qualified name of the `IModule` class. Don't rename `Web.Module` without updating this.
- `<assemblyFile>` — entry assembly the platform loads (`VirtoCommerce.<ModuleName>.Web.dll`).

When you bump platform compatibility, update **four** places in lockstep:

- `F02 · platform` `module.manifest <platformVersion>` and all `PackageReference` versions of `VirtoCommerce.Platform.*`.
- `F08 · platform` The `Microsoft.EntityFrameworkCore.Design` package in the provider projects, and the .NET TFM if Virto bumps it.

## Common pitfalls

| Area                                         | ✅ Do                                                                | ❌ Don't                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `F01 · platform` **Module.manifest version** | Bump in lockstep with `Directory.Build.props <VersionPrefix>` and `VirtoCommerce.Platform.*` `PackageReference`s | Ship a manifest version that drifts from the assembly version        |
| `F02 · platform` **`<platformVersion>`**     | Match exactly the `VirtoCommerce.Platform.*` `PackageReference`     | Bump only the manifest — the manifest's platform requirement then disagrees with the one the code is compiled against |
