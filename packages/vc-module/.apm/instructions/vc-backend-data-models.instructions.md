---
description: "EF entities — Data/Models. Adds to the Models rules in backend-shared.md."
applyTo: "src/*.Data/Models/**/*.cs"
---

# EF entities (Data/Models)

The *Models* rules in `vc-backend-shared.md` govern columns; navigations follow the rules below instead. They follow EF Core's NRT guidance — no VirtoCommerce repo has an NRT-enabled entity to copy.

- `E07 · platform` **Naming** — an entity is `<ModelName>Entity`, deriving `AuditableEntity`, or `Entity` when it has no audit stamps.
- **Mapping**
  - `E08 · platform` Every entity, child entities too, implements `IDataEntity<TEntity, TModel>`: `ToModel`, `FromModel(model, pkMap)`, `Patch`.
  - `E10 · platform` All three are `virtual`, so a client project's derived entity can map its own columns.
  - `E09 · platform` `FromModel` calls `pkMap.AddPair(model, this)`, so generated ids flow back to the model.
  - `E15 · platform` `ToModel` and `FromModel` copy `Id` and the four audit stamps; `Patch` doesn't (below).
- `E13 · platform` **String columns are bounded** — `[StringLength]` on every string column. Free text, serialized payloads and ciphertext stay unbounded and say why in a doc comment (`ModelNameEntity.SecretProtected`).
- **Required column**
  - `M01 · stricter` Non-nullable type with `required`.
  - `M05 · stricter` No `[Required]`: with NRT enabled, EF already maps a non-nullable property to a NOT NULL column, so the attribute states it twice.
- `M02 · stricter` **Optional column** — nullable type.
- `E01 · stricter` **Reference navigation to the principal, required relationship** (this entity holds the non-nullable FK) — non-nullable, initialized `= null!`, never `required`: code assigns the FK, EF sets the navigation on load, and reading it without `Include` is a programmer error.
- `E01 · stricter` **Reference navigation to an owned child** (one-to-one, built with the parent in `FromModel`) — `required`: the parent never exists without it, so the repository always loads them together.
- `E01 · stricter` **Reference navigation, optional relationship** (nullable FK) — nullable type.
- **Collection navigation**
  - `E02 · platform` Never null: `ObservableCollection<T>` initialized to `new NullCollection<T>()`, the platform convention.
  - `E11 · platform` `Patch` merges it only when loaded — `if (!Children.IsNullCollection())`; a collection the repository didn't load would otherwise read as empty and delete every child row.
- `E03 · platform` **`Patch` copies every field the model owns**, status included — it skips only collections owned by another aggregate.
- `E04 · stricter` **`Patch` never copies audit stamps** — the platform's `Triggers<IAuditable>.Updating` (`UseDbTriggers`) sets `ModifiedDate` / `ModifiedBy` and restores `CreatedDate` / `CreatedBy` from the stored row at commit, overwriting any copy (store `StoreEntity` has one, a dead write). `FromModel` still maps them: the `Inserting` trigger overwrites them too, and `ResolvePrimaryKeys` copies the entity's back to the model.
- `E05 · stricter` **Stored enums parse strictly** — `Enum.Parse<T>` plus `Enum.IsDefined` (`Enum.Parse` accepts any numeric string), throw otherwise; never `EnumUtility.SafeParse`, whose silent default can revive a suspended item.

## Common pitfalls

| Area                            | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Required column**             | `M01 · stricter` `public required string Name { get; set; }`        | `M05 · stricter` `[Required]` above it — NRT already makes the column NOT NULL |
| `E01 · stricter` **Navigation to the principal** | `public ModelNameEntity ModelName { get; set; } = null!;`     | `required` — every `new` must build the principal, which EF then inserts or rejects as a duplicate |
| `E01 · stricter` **Navigation to an owned child** | `public required ChildEntity Child { get; set; }`                   | `= null!` — hides a parent built without its child                   |
| `E02 · platform` **Collection navigation** | `public ObservableCollection<ChildEntity> Children { get; set; } = new NullCollection<ChildEntity>();` | `List<T>`, `= new()`, or a nullable collection                       |
| `E05 · stricter` **Stored enum** | `Enum.Parse<ModelNameState>(State)`, then throw unless `Enum.IsDefined` | `EnumUtility.SafeParse(State, ModelNameState.Active)` — a bad value silently becomes the default |
