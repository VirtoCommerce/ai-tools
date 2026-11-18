---
description: "whole backend (.NET) — architecture & conventions that apply everywhere."
applyTo: "src/**/*.cs,src/**/*.csproj,tests/**,Directory.Build.props,.editorconfig"
---

# Backend rules — core

## Project dependency direction (do not reverse)

`S01 · platform`

```text
Core
▲
├── Data
│   ▲
│   ├── Data.SqlServer
│   ├── Data.MySql
│   ├── Data.PostgreSql
│   │   ▲
└───┴───┴── Web
```

Each layer has one role; where a type lives follows from it.

| Project | Role | Folders |
|---------|------|---------|
| `Core` | `S26 · platform` Contracts only: interfaces, models, events, constants. It implements none of its own `I*Service`s. | `Models/`, `S29 · platform` `Services/` (interfaces), `Extensions/`, `ModuleConstants.cs` at the root |
| `Core` | | `C08 · platform` `Events/` (`*ChangingEvent` / `*ChangedEvent`) |
| `Data` | The implementations | `Models/` (EF entities), `S29 · platform` `Repositories/`, `Services/`, `ExportImport/`, `Authorization/` (permission scopes) |
| `Data` | | `A05 · platform` `Validation/` (FluentValidation validators) |
| `Data` | | `V08 · platform` `Caching/` (cache regions) |
| `Data` | | `V13 · platform` `Handlers/` (event handlers) |
| `Data` | | `R20 · platform` `Authorization/` (requirements, their handlers) |
| `Data.<Provider>` | Provider-specific EF: migrations, design-time factory | `S29 · platform` `Migrations/` |
| `Web` | Wiring and the HTTP surface | `Module.cs`, `Controllers/Api/`, `S29 · platform` `Localizations/`, `Apps/` |

## Coding conventions

- **`.editorconfig`** sets formatting and C# code style; follow it as configured.
  - `S06 · platform` PascalCase / `I`-prefixed interfaces.
- `S08 · stricter` **Line endings are native** — `.gitattributes` `* text=auto`; no `end_of_line` in `.editorconfig`. A deliberate departure from VC's CRLF.
- **Errors**
  - `S10 · stricter` A service throws only for an unexpected state.
  - `S09 · stricter` Fail fast with a typed exception (platform domain exceptions where they exist, `ArgumentException` / `InvalidOperationException` otherwise).
  - `S10 · stricter` A predictable outcome (not found, validation, a business "no") returns `null` / `false` / empty collections.
  - `S10 · stricter` Controllers never throw — they answer with a status code (`NotFound()`, `BadRequest(errors)`, `Conflict()`).
  - `S11 · stricter` Reserve `try/catch` for infrastructure boundaries (controllers, EF).
- **Async-first**
  - `S28 · platform` Controllers, repositories, and services are async.
  - `S12 · platform` Suffix names with `Async`, except controller actions (`vc-backend-rest-api.md`).
  - `S13 · platform` Take a `CancellationToken` only where the operation can be cancelled — Hangfire jobs, export/import, long-running actions (search `SearchIndexationModuleController`); CRUD services and their callers take none (platform `ICrudService`).
- `S23 · platform` **Cached models are shared** — `ICrudService.GetAsync` and `ISearchService.SearchAsync` clone by default (`clone: true`); `clone: false` and the `*NoCloneAsync` variants return the cache's own instances: read them, never change them. To change one, `CloneTyped()` it — never `(T)model.Clone()` — and save the copy.
- **Search through the criteria**
  - `S27 · platform` A search's total count is `Take = 0`; statistics (counts from several angles or sources at once) may be a separate method.
  - `S27 · platform` A single item is a CRUD get (`GetAsync` / `GET`), never a search with `Take = 1`.
  - `S25 · platform` No `Search…By…` service method — add a field to the `<ModelName>SearchCriteria`.
- `S14 · stricter` **Full names in lambdas / LINQ** — `item`, `key`, `entity`, not `i`, `k`, `e` (per global preference).
- **Warnings are errors**
  - `S16 · stricter` Warnings are errors (`Directory.Build.props`).
  - `S15 · stricter` Don't silence with `#pragma warning disable` — fix the root cause or add to a project-local `<NoWarn>` only if the warning is structural (the default `1591` suppression in `Web` is for missing XML docs on auto-generated controller stubs).
- **Logging severity**
  - `S18 · stricter` Log at the severity the event warrants: an unexpected failure caught at an infrastructure boundary → `LogError` **with the exception object** (keep the stack); an expected-but-notable condition → `LogWarning`; routine diagnostics → `LogDebug` / `LogInformation`.
  - `S18 · stricter` Never log-and-swallow at `Error` for a predictable outcome.
  - `S17 · stricter` Never drop the exception when logging a caught throwable.
- **Follow nullable reference types (NRT)** — let the compiler's annotations drive null handling:
  - `S20 · stricter` **Don't** null-check a non-nullable reference (the type already guarantees it — a defensive check is dead code and NRT flags a null literal there). This subsumes the framework-managed cases (DI dependencies, framework context, an `Include`d EF navigation are non-nullable — don't guard them).
  - `S20 · stricter` **Do** handle a nullable (`T?`) one — guard, `?.`, or fail fast.
  - `S19 · stricter` NRT is enabled project-wide via `Directory.Build.props`.
- `S21 · stricter` **Precedents come from the layer they belong to** — REST, Core, Data and Web: vc-platform and the regular `vc-module-*` repos. Other VirtoCommerce code is a precedent for its own layer only:
  - xAPI (`vc-module-x-*`, `*.ExperienceApi` / `*.XApi` projects) — a GraphQL backend-for-frontend; GraphQL only.
  - `vc-module-marketplace-*`, `vc-module-state-machine`, `vc-module-catalog-quality` — a command/handler backend; a backend precedent only for a marketplace integration, and a vc-shell UI precedent.
  - `samples/` — how client projects extend modules; never module code.
- `S22 · stricter` **Single-path conditionals** — factor the invariant part out and branch only on what actually differs; don't duplicate a whole statement across `if`/`else` arms that vary by one sub-expression.
- `S30 · stricter` **No one-call wrappers** — a private helper that wraps a single call and saves a line or less (a `ValidateAsync` returning `BadRequest` or `null`, an `IsOwnAsync` around `AuthorizeAsync`) is inlined at each caller: the reader follows one method instead of two, and the call sites stay the platform's own idiom. A helper earns its place by holding several steps or a decision.

## Models

Applies to every class — Core models, EF entities, DTOs. Layer-specific rules: [vc-backend-core-models.md](vc-backend-core-models.md), [vc-backend-data-models.md](vc-backend-data-models.md).

- `M01 · stricter` **Required members** — non-nullable type, `required`, no initializer. EF navigations are the exception (`vc-backend-data-models.md`).
- `M02 · stricter` **Optional members** — nullable type, no default.
- `M03 · stricter` **Collections** — non-nullable, `= []`; never `required` or nullable. Platform input binding skips an explicit `null` (`NullValueHandling.Ignore`), so the initializer survives. EF collection navigations keep `NullCollection` (`vc-backend-data-models.md`).
- `M07 · stricter` **Empty means none** — an empty collection means none; in a search filter, all.
- `M04 · stricter` **Computed members** (server-set, never body-bound) — non-nullable, `= null!`, not `required`.
- `M06 · platform` **Instantiation** — create every type a client project may extend — domain models, child models, search criteria and results, EF entities — with `AbstractTypeFactory<T>.TryCreateInstance()`, never `new T()`: a module's `OverrideType` swaps in its subclass only where the factory is called (dev guide *Extend Domain Models*; platform `CrudService.FromModel`, `IDataEntityExtensions.ToModel`). The module's own types need no `RegisterType` — with nothing registered, the factory builds the base type. Assign members after the call; no object initializer means the compiler doesn't check `required` there. Exempt: test arrange data, types built with constructor arguments (events, exceptions), platform infrastructure (`PrimaryKeyResolvingMap`, `SortInfo`, `GenericChangedEntry<T>`), and the module's internal helper types.

## Co-install with any VC module

The module must install beside any VirtoCommerce module. Another module may already own the same names, so every name shared across modules carries the module's prefix:

| Surface | Name |
|---------|------|
| `X01 · stricter` DB tables (shared database) | `<table-prefix><ModelName>` |
| `X02 · platform` Settings | `<ModuleName>.<Key>` |
| `X03 · platform` Permissions | `<permission-prefix>:<area>:<action>` |
| `X04 · platform` REST routes | `api/<route-prefix>/<area>` |
| `X05 · platform` Any other string key (Hangfire job ids, options sections, policy names, operation-log `ObjectType`, Data Protection purposes) | `<ModuleName>.<Name>` or the type's `FullName` |

Each module sets its own `<table-prefix>`, `<permission-prefix>` and `<route-prefix>` in its own rules or CLAUDE.md.

`X06 · platform` C# type names stay unprefixed (`ModelName`, `ModelNameChangedEvent`): namespaces separate them, swagger docs are per-module (`PlatformUI` uses `FullName`), and the event bus keys by `FullName`. If a swagger schema id ever clashes, use `[SwaggerSchemaId("...")]` instead of renaming the type.

## Common pitfalls

| Area                                  | ✅ Do                                                                                         | ❌ Don't                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `G01 · platform` **Build tool**       | `vc-build Compile` / `Test` / `Compress`                                                     | Use `dotnet pack` to make a module artifact                                                                         |
| `M01 · stricter` **Required members** | `public required string Name { get; set; }`                                                  | A placeholder default (`= string.Empty`, `= null!`)                                                                 |
| `M05 · stricter` **Required members** |                                                                                              | `[Required]` on a model, entity or DTO                                                                              |
| `M02 · stricter` **Optional members** | `public string? Notes { get; set; }`                                                         | A non-nullable type with a default                                                                                  |
| `M03 · stricter` **Collections**      | `public IList<string> Statuses { get; set; } = [];`                                          | `required`, or a nullable collection the caller must null-check                                                     |
| `M04 · stricter` **Computed members** | `public string Hint { get; set; } = null!;`                                                  | `required` — every object initializer (tests, clients) must invent a value the server overwrites                    |
| `S23 · platform` **Cached models**    | `var model = (await service.GetNoCloneAsync(id)).CloneTyped();`, change and save `model`     | Changing a `GetNoCloneAsync` / `clone: false` result — every reader sees the unsaved values until the cache expires |
| `M06 · platform` **Instantiation**    | `var model = AbstractTypeFactory<ModelName>.TryCreateInstance();`, then assign members | `new ModelName { … }` — a subclass registered via `OverrideType` is never created                             |

## Gate

`G01 · platform` Never mark backend work complete until `dotnet build VirtoCommerce.<ModuleName>.sln -c Release` (warnings are errors) + `dotnet test tests/VirtoCommerce.<ModuleName>.Tests` + `jb cleanupcode` + `jb inspectcode` (`--severity=WARNING`) pass. Build, tests, and both ReSharper passes must be clean; `jb cleanupcode` reformats in place, so review its edits.
