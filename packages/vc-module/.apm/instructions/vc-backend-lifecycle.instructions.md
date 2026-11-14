---
description: "Web/Module.cs — the module composition root & load order."
applyTo: "src/*.Web/Module.cs"
---

# Module lifecycle (Module.cs — the load order matters)

`L05 · platform` `Module : IModule, IHasConfiguration` is invoked by the platform in this order:

1. **`Initialize(IServiceCollection)`** — register DI services. This is where `AddDbContext<ModuleNameDbContext>` chooses:
   - The EF provider via `Configuration.GetValue("DatabaseProvider", "SqlServer")`.
   - `D06 · platform` The connection string fallback `Configuration.GetConnectionString(ModuleInfo.Id) ?? Configuration.GetConnectionString("VirtoCommerce")`.
2. **`PostInitialize(IApplicationBuilder)`** — runtime wiring against built services:
   - `L01 · platform` Register settings: `ISettingsRegistrar.RegisterSettings(ModuleConstants.Settings.AllSettings, ModuleInfo.Id)`.
   - `L02 · platform` Register permissions: `IPermissionsRegistrar.RegisterPermissions(ModuleInfo.Id, "<display name>", ModuleConstants.Security.Permissions.AllPermissions)`.
   - `L10 · platform` Offer permission scopes: `IPermissionsRegistrar.WithAvailabeScopesForPermissions([...], new <Scope>())`, after registering the permissions (`vc-backend-rest-api.md` *Access narrower than a permission*).
   - `L03 · platform` Override another module's types: `AbstractTypeFactory<TBase>.OverrideType<TBase, TDerived>().MapToType<TEntity>()`. The owning module calls `RegisterType().MapToType()` in its own `PostInitialize`, which runs after every `Initialize` — an override placed in `Initialize` is silently overwritten.
   - `L11 · platform` Subscribe event handlers: `appBuilder.RegisterEventHandler<TEvent, THandler>()` (order `Module.PostInitialize`).
   - `L04 · platform` Apply EF migrations: `dbContext.Database.Migrate()` inside a scoped `serviceProvider.CreateScope()`.
3. `L06 · platform` **`Uninstall()`** — a no-op; only needed if the module owns external resources.

## DI lifetimes

Follow the .NET lifetime rules, as VC modules do:

- **Transient**
  - `L07 · platform` The default, including validators and every repository-bound service.
  - `L09 · stricter` The default for authorization handlers too (`AddTransient<IAuthorizationHandler, …>()`).
  - `V09 · platform` A service reaches the database through the `Func<TRepository>` factory, one repository per operation.
- `L07 · platform` **Scoped** — only per-request state or a framework-scoped type (`AddDbContext` registers the DbContext scoped).
- `L08 · platform` **Singleton** — only thread-safe shared state (caches) that never depends on a scoped service.

## Common pitfalls

| Area                                          | ✅ Do                                                                | ❌ Don't                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `L03 · platform` **Type extension**           | `AbstractTypeFactory<TBase>.OverrideType<TBase, TDerived>().MapToType<TEntity>()` in `PostInitialize` | The override in `Initialize`, or `new` up the override at the call site |
| `L07 · platform` **Repository-bound service** | `AddTransient<IModelNameService, ModelNameService>()`         | `AddScoped` for it                                                   |
| `V09 · platform` **Repository-bound service** | `Func<IModuleNameRepository>`                                |                                                                      |
| `L08 · platform` **Repository-bound service** |                                                                     | A singleton that captures a scoped dependency                        |
