---
description: "Data/Services — CRUD, search and domain service implementations."
applyTo: "src/*.Data/Services/**/*.cs"
---

# Data services — the CrudService write path

- `V02 · platform` **Derive from the platform base** — a CRUD service derives the platform `CrudService<…>`, a search service `SearchService<…>`.
- `V07 · platform` **Logic sits in overridable methods** — a client project derives a service to change one behaviour, so every `public` and `protected` method of a service is `virtual` (or `override`) and small enough to override alone (platform `CrudService`: `LoadEntities`, `BeforeSaveChanges`, `ProcessModels`). A `private` method or static helper may split such a method's code to reduce its complexity; it is called only from an overridable method of the same class. An extension method may hold logic when its caller is such a method (`vc-backend-core-models.md`).
- `V11 · platform` **`LoadEntities` loads the batch in one call** — the repository's `Get<ModelName>ByIdsAsync(ids, responseGroup)`, never a load per id.
- `V12 · platform` **Search services override `BuildSortExpression`** with a default sort for an empty `SortInfos` (`CreatedDate` descending in `ModelNameSearchService`).
- `V01 · platform` **Every write goes through `SaveChangesAsync`** — create, update, status change, key rotation: load the model, change it, `ICrudService.SaveChangesAsync`.
- `V01 · platform` **No manual commit or events** — `SaveChangesAsync` commits, publishes `*ChangingEvent` / `*ChangedEvent` (`Added`, or `Modified` old → new) and clears the cache.
- `V03 · platform` **No transition methods** — a status change or bulk action is the controller's (`vc-backend-rest-api.md`); the service adds no method and no result type for it.
- `V04 · stricter` **Computed fields** — set in the service's `GetByIdsNoCache` override, batched: one load of the source per batch (customer `OrganizationMembershipService`). Never a model method, never an entity's `ToModel` reading another aggregate.
- `V05 · platform` **Cross-aggregate cache** — when a computed field comes from another aggregate, the dependent's `ConfigureCache` adds the source's per-key change token (`GenericCachingRegion<TSource>.CreateChangeTokenForKey`), with `KeepsDefaultCacheToken => true`; the source's default `ClearCache` then expires it (catalog `ItemService`).
- `V06 · platform` **Last write wins** — add a `[Timestamp] RowVersion` only when a lost update must become a `409`.

## Common pitfalls

| Area                                  | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `V07 · platform` **Logic steps**      | `protected virtual Task<…> …Async(…)` on the service; `private` helpers called only from it | A non-virtual `public` / `protected` method — a client project can't override it |
| `V01 · platform` **Writes**           | `GetAsync` → change → `SaveChangesAsync`                            | `repository.UnitOfWork.CommitAsync()`, or publishing `*ChangedEvent` by hand |
| `V04 · stricter` **Computed fields** | Override `GetByIdsNoCache`, load the batch's sources once            | A model method, or `entity.ToModel(model, parent)`             |
| `V06 · platform` **Concurrency**     | Order's `RowVersion` + `OrderRepository.PatchRowVersion`, only for a required `409` | A `RowVersion` on every entity "just in case"                        |
