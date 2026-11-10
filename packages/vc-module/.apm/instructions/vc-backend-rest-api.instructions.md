---
description: "Web/Controllers — ASP.NET Core Web API controllers."
applyTo: "src/*.Web/Controllers/**/*.cs"
---

# REST API conventions

- `R23 · platform` **Location** — `Web/Controllers/Api/`.
- **Routes**
  - `R03 · platform` The prefix from the co-install table in `vc-backend-shared.md`.
  - `R24 · platform` Literal segments in lowercase kebab-case (`model-names/{modelNameId}/children`).
- **Protection**
  - `R02 · platform` Every action that isn't `[AllowAnonymous]`: a class-level `[Authorize]` or the action's own.
  - `R01 · platform` A class-level `[Authorize]` when it covers every action, otherwise the action's own; never repeat what the class grants.
- `R32 · platform` **Module permission** — `[Authorize(Permissions.<Name>)]`, with `using Permissions = VirtoCommerce.<ModuleName>.Core.ModuleConstants.Security.Permissions;`.
- `R04 · platform` **Swagger** — configured by the platform; `<GenerateDocumentationFile>` in `Web.csproj` feeds it the XML doc comments (warning 1591 suppressed via `NoWarn`).
- `R28 · stricter` **Doc comment on every action** — a `/// <summary>` Swagger shows as the operation summary: what the action does for the caller, plus any behavior the signature hides (`unknown ids are skipped`). `<param>` only when a parameter's name doesn't say it. 1591 is suppressed, so nothing enforces this but review.

## Action names

The method name is public API: Swagger's `operationId` is `{ControllerName}_{MethodName}`, and the vc-shell client generator makes it the client method — a rename breaks every generated client.

| Action on | Name | Example |
|-----------|------|---------|
| `R29 · platform` One item | verb + entity | `UpdateModelName` |
| `R29 · platform` Search or bulk | verb + entities | `DeleteModelNames` |
| `R25 · platform` Any | no `Async` suffix — ASP.NET Core trims it from routes only, `operationId` keeps it | |

## Access narrower than a permission

`[Authorize(Permissions.<Name>)]` grants every record of the area. When access depends on the record — a caller may reach only its own records, or a selected subset — the server checks it on the resource (dev guide *Scope-based Authorization*):

- `L10 · platform` **Scoped permission** — when an admin limits a role to selected records: a `PermissionScope` subclass, offered for the permission with `WithAvailabeScopesForPermissions` in `PostInitialize` (store `StoreSelectedScope`, order `OrderSelectedStoreScope`).
- `R20 · platform` **Authorization handler** — the check itself, for a scope or a rule read from the caller's claims (order `OnlyOrderResponsibleScope`): an `<Area>AuthorizationRequirement : PermissionAuthorizationRequirement` and a handler deriving `PermissionAuthorizationHandlerBase<TRequirement>`, both in `Data/Authorization` — a client project derives and reuses the handler, and the requirement needs no Core contract (its abstraction is `IAuthorizationRequirement`) — registered `AddTransient<IAuthorizationHandler, …>()`. The base succeeds on the global permission; the handler grants the scoped rest.
- `R30 · stricter` **Ownership handler** — when the route names the owner (`model-names/{modelNameId}/children`) and a record of another owner is refused even to a global permission holder: an `AuthorizationHandler<TRequirement, TResource>` whose plain `IAuthorizationRequirement` carries the route's owner id (shape: pagebuilder `PageBuilderAuthorizationHandler`), in `Data/Authorization`, registered the same way. Never `PermissionAuthorizationHandlerBase` — its global-permission success lets every owner's record through. Unknown ids are not its concern: update still returns `404`, delete skips them.
- `R21 · platform` **The action calls `IAuthorizationService.AuthorizeAsync(User, resource, requirement)`** — on the search criteria before searching (the handler narrows its ids) and on the loaded models before returning or changing them; `Forbid()` when it fails (order, store, catalog). Read and write use the same requirement, so a write never reaches a record the list hides.
- `R22 · stricter` **Negative test** — seed a record outside the caller's scope and assert the action neither returns nor changes it.

## Create vs update — permissions pick the shape

VC picks the endpoint shape by the area's permissions (split: store, customer, pricing, order, marketing, subscription, white-labeling, task-management):

- `R05 · platform` **Split** when the entity has its own `<area>:create` and `<area>:update`: `[HttpPost]` creates under `:create`, `[HttpPut]` updates under `:update`.
- `R05 · platform` **One save action** only when a single permission covers every write — a child saved under its parent's `:update`, or an edit-only area.
- `R06 · platform` Never gate a save with `:create` alone, and never define a `:create` no action checks.
- `R33 · platform` A server-initialized blank is `GET <area>/new` under `<area>:create`; it returns an unsaved object and never persists (marketing `promotions/new`).
- Both split actions may call the same service save: the platform's `CrudService.SaveChangesAsync` is an upsert (no id, or an id not in the database → insert).
  `R07 · stricter` So the update action checks that the item exists and returns `404` otherwise — the upsert would insert it under `:update` alone. Stricter than the platform on purpose: pricing `UpdatePriceList`, contract `UpdateContract`, catalog `UpdateCatalog` and store `UpdateStore` insert an unknown id, so `:update` there creates what `:create` guards.
- `R08 · stricter` Split create returns `409` when the body's `Id` already exists — the upsert would update it under `:create` alone. A single save action updates it instead, gated by `:update` (`403` without).
- `R09 · platform` State transitions and other actions on an existing item (`POST {id}/suspend`, `POST {id}/reactivate`) take `<area>:update` by default. One that needs a separate grant gets its own action permission (return `return:authorize`, order `order:refund`) — the developer's call (`vc-backend-permissions-settings.md`).

## Responses

The core modules (store, order, customer, pricing, marketing, quote) answer a write as follows.

| Action | Success | Precedent |
|--------|---------|-----------|
| `R10 · platform` Create | `Ok(reloaded)` — `200` with the model re-read by id, never `201` | store `CreateStore`, marketing `CreatePromotion` (reloads) |
| `R11 · platform` Update | `NoContent()`; `Ok(model)` only when the save computes values the caller needs back — the saved input, not a reload | store `UpdateStore`, order `UpdateOrder`; `Ok`: cart `UpdateShoppingCart` (totals recalculated in `BeforeSaveChanges`), subscription `UpdateSubscription` (`ActualizeAsync`) |
| `R15 · stricter` State transition, single (`POST {id}/suspend`) or bulk | `NoContent()` | sales-rep `Block`, news `Publish` |
| `R12 · platform` Delete | `NoContent()` | |

- **Create reloads**: `CrudService.SaveChangesAsync` writes back to the saved model only through `PrimaryKeyResolvingMap.ResolvePrimaryKeys` — the `Id` and the four audit stamps, and only when the body had no `Id`. Computed members (`HasChildren`) are never written back.
- **Update and transitions return no model**: the commit's `Updating` trigger stamps `ModifiedDate` / `ModifiedBy` on the entity only, so the saved model still holds the old ones (`changedEntry.NewEntry` is a fresh `ToModel` copy, for the event only).
- `R13 · platform` **Declare every status an action returns other than `200`** — `[ProducesResponseType(typeof(void), StatusCodes.Status204NoContent)]`, `…Status404NotFound)]`, `…Status409Conflict)]`. Swagger infers one bare `200`, and only while an action declares none, so once it declares any it declares its `200` too: `[ProducesResponseType(typeof(ModelName), StatusCodes.Status200OK)]` (store `UpdateStore` 204; quote `GetById` 200 + 404; background-jobs `Enqueue` 200 + 400 + 404). Bodiless codes take `typeof(void)`, the rest their body's type, a collection as an array — a validation `400` is `typeof(ValidationFailure[])` (platform `ModulesController` `ModuleDescriptor[]`). `401` / `403` from `[Authorize]` stay undeclared — the core modules never declare them.
- `R14 · platform` **Validation failure** → `BadRequest(validationResult.Errors)`: every failure, so the UI can mark each field by `PropertyName` (loyalty, white-labeling). Never `Errors.First()`.

## State transitions and bulk actions

`R15 · stricter` The controller runs them over the plain `ICrudService`; the service adds no transition method and no result type. A transition that other code — ours or a client project's — must reuse moves into a service method; the developer decides.

1. `GetAsync` the distinct ids; any id missing → `NotFound()`, nothing saved.
2. Skip every item already in the target state — transitions are idempotent, never `Conflict()` (news `ChangeIsPublishedAsync`, customer `SetLockState`). Skipping, not re-saving: `SaveChangesAsync` has no change detection, so a no-op save still stamps `ModifiedDate` and publishes `*ChangedEvent`.
3. Change the rest, then one `SaveChangesAsync` — never item by item, which leaves a partial update on failure; none left → no save. Return `NoContent()` either way.

## Request bodies

- `R16 · platform` Create and update bind the domain model, `[FromBody] ModelName modelName`. No `Create…Request` / `Update…Request` DTOs (subscription `CreateSubscription` / `UpdateSubscription` — a binding precedent only; their responses are the exception under *Responses*).
  `R17 · platform` Update is `PUT` on the collection route, with the id in the body.
- `R34 · platform` Actions take their parameters as action arguments: the route id plus `[FromQuery]` scalars (pagebuilder `PublishGroup`), or `[FromBody] string[] ids` for bulk (news `Publish`).
- `R26 · platform` **Search** is `POST {route}/search` with `[FromBody] <ModelName>SearchCriteria criteria`, never `GET` with query parameters.
- `R27 · platform` **Delete is bulk** — `[HttpDelete]` on the collection route with `[FromQuery] string[] ids` (order `DeleteOrdersByIds`); one id is a one-item list.
- `R31 · platform` **Delete skips unknown ids** — `CrudService.DeleteAsync` loads the ids itself and deletes only those it finds, so the action loads nothing and always returns `NoContent()`: no `404` for an unknown id, no `400` for an empty list (order `DeleteOrdersByIds`, customer `OrganizationMembershipController.Delete`, pricing `DeleteAssignments`, marketing `DeleteDynamicContents`). Update's `404` doesn't carry over — it exists only because the upsert would create. A delete loads only for a resource authorization check (*Access narrower than a permission*).
- `R35 · platform` A sub-resource whose writable fields are all scalars (`model-names/{modelNameId}/children`) takes them as action arguments, never a body — no body then carries its server-managed fields.
- `A06 · stricter` `required` is compile-time only: Newtonsoft binds an omitted member as `null`, so the validator or a null guard still checks a body's required members.
- `R18 · platform` **Server-managed fields are restored silently** from the stored model in the update action, before validating and saving — audit stamps, hashes, secrets, immutable keys, collections owned elsewhere, every `[JsonIgnore]` field, and fields another flow owns: status flags and ownership (`IsActive`, `ParentId`), changed only by their own action (`POST {id}/suspend`) or by registration. Platform `SecurityController` restores `PasswordHash`; return `KeepDecisions`.
- `R18 · platform` Nothing is rejected for differing — a missing bool binds `false`, so restoring is what keeps an omitted `IsActive` from suspending.
- `R19 · stricter` Mark every property a body can't change with `[SwaggerSchema(ReadOnly = true)]`, an input-only one with `WriteOnly = true` (Swashbuckle.AspNetCore.Annotations). Documentation only — the server still restores or drops the value.
