---
description: "EF persistence — entities, DbContext and repositories, per-provider projects, plus provider wiring in Web/Module.cs."
applyTo: "src/*.Data/Models/**/*.cs,src/*.Data/Repositories/**/*.cs,src/*.Data.SqlServer/**/*.cs,src/*.Data.MySql/**/*.cs,src/*.Data.PostgreSql/**/*.cs,src/*.Web/Module.cs"
---

# EF Core migrations (per provider)

`D01 · platform` Migrations live in **provider-specific** projects (`Data.SqlServer`, `Data.MySql`, `Data.PostgreSql`), **not** in `Data`.
`D11 · platform` So do the provider packages: `Data` stays provider-agnostic. (A module that supports only SQL Server keeps both in `Data`; one without a database has neither.)
The DbContext lives in `Data` and switches at runtime via `Database.ProviderName` (see `<ModuleName>DbContext.OnModelCreating` in `Data/Repositories/`).
`D02 · platform` When you add or change an entity, generate three migrations — one per provider — with the same name.

```bash
# From the repo root, for each provider — same migration name across all three.
dotnet ef migrations add <Name> \
  --project       src/VirtoCommerce.<ModuleName>.Data.SqlServer \
  --startup-project src/VirtoCommerce.<ModuleName>.Data.SqlServer \
  --context       VirtoCommerce.<ModuleName>.Data.Repositories.<ModuleName>DbContext \
  --output-dir    Migrations

# Repeat with .Data.MySql and .Data.PostgreSql.
```

- `D08 · platform` **Migration code is EF's** — an AI agent never hand-edits a migration: no refactoring, no added SQL or data steps. Formatting is fine (`jb cleanupcode` reflows it). Manual code in a new migration (a data backfill, raw SQL) is the user's decision — propose it, never add it unasked.
- `D13 · platform` **Committed migrations are immutable** — a committed migration is never changed or deleted; a schema fix is a new migration.
- **DbContext**
  - `E06 · platform` Derives `DbContextBase`, with a `protected` constructor taking the non-generic `DbContextOptions` so a client project can derive from it (EF Core's inheritance guidance).
  - `E12 · platform` `OnModelCreating` declares `OnDelete` on every `HasOne` / `HasMany`.
  - `D12 · platform` `OnModelCreating` then applies the provider's configurations in the `Database.ProviderName` switch: `ApplyConfigurationsFromAssembly(Assembly.Load("<provider project>"))`, by name, since `Data` can't reference a provider project.
- `V10 · platform` **Repository** — derives `DbContextRepositoryBase<TDbContext>`.

`D09 · platform` Each provider project has an empty `<Provider>DataAssemblyMarker` class (`SqlServerDataAssemblyMarker`) — the migrations-assembly type `Module.Initialize` passes to `Use<Provider>Database`.
`D03 · platform` Each provider project has a `DesignTimeDbContextFactory` so `dotnet ef` works without a host.
`L04 · platform` Migrations are applied automatically at platform startup by `Module.PostInitialize` (`Web/Module.cs`) — don't add a separate apply step.

Visual Studio Package Manager Console alternative is documented in `src/VirtoCommerce.<ModuleName>.Data.SqlServer/Readme.md`.

## Common pitfalls

| Area                            | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `D01 · platform` **Migrations** | Generate per-provider migrations in all three `Data.*` projects | Add migrations only to `Data.SqlServer` — MySQL/PostgreSQL deployments will fail at startup |
| `D02 · platform` **Migrations** | Generate per-provider migrations with the same name |  |
| `D08 · platform` **Migration code** | Regenerate, or ask the user before adding manual code to a new migration | Edit a committed migration, or refactor / extend generated code on your own |
| `D04 · platform` **DbContext provider** | Add cases in `OnModelCreating` and `Module.Initialize` together     | Add a new EF provider in one place only                              |
| `D10 · platform` **Provider registration** | `options.UseSqlServerDatabase(connectionString, typeof(SqlServerDataAssemblyMarker), Configuration)` — the platform extension, given the provider project's marker type as the migrations assembly | Raw `UseSqlServer` / `UseMySql` / `UseNpgsql` — skips the platform's provider defaults |
| `D05 · platform` **Entity tables** | `modelBuilder.Entity<ModelNameEntity>().ToAuditableEntityTable("<table-prefix>ModelName")` | Hardcode raw `ToTable(...)` — bypasses the platform's auditable conventions |
| `X01 · stricter` **Entity tables** | The `<table-prefix>` prefix (co-install, `vc-backend-shared.md`) | Unprefixed names that clash with other modules' tables |
| `E14 · platform` **Entity tables** | The entity name without `Entity` |  |
| **Connection string**           | `D06 · platform` Trust `GetConnectionString(ModuleInfo.Id) ?? GetConnectionString("VirtoCommerce")` | `D07 · platform` Hardcode a connection string outside `DesignTimeDbContextFactory` |
