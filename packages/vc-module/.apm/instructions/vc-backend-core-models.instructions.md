---
description: "Core domain models and the extension methods that derive from them. Adds to the Models rules in backend-shared.md."
applyTo: "src/*.Core/Models/**/*.cs,src/*.Core/Extensions/**/*.cs"
---

# Core domain models (Core/Models)

The *Models* rules in `vc-backend-shared.md` apply; domain models add the ones below.

- `C01 · stricter` **One folder per entity** — an entity's model, child models, search criteria and enums share a folder named after it.
- **Folders are not namespaces**
  - `C02 · stricter` The namespace stays `VirtoCommerce.<ModuleName>.Core.Models`.
  - `C03 · stricter` Register each new folder in `NamespaceFoldersToSkip` in `VirtoCommerce.<ModuleName>.sln.DotSettings` (key `=models_005C<folder-lowercase>`), or `jb inspectcode` reports CheckNamespace per file.
- `C04 · platform` **Models carry data, not logic** — properties plus plumbing only: `ICloneable.Clone` / `GetCopy`, `ReduceDetails`, equality, cache keys. Exceptions by design: condition / reward trees (marketing, loyalty) and provider base classes. Logic goes elsewhere:
  - input validation → a validator (`vc-backend-validation.md`)
  - computed fields → a service (`vc-backend-services.md`)
  - `C05 · stricter` a pure derivation → an extension method in `Core/Extensions` on the model or enum it reads, called from an overridable service method, so a client project overrides the call (`vc-backend-services.md`)
- `C09 · platform` **Response groups** — a `[Flags]` enum `<ModelName>ResponseGroup` with one flag per optional part and `Full` combining them all.
- `C06 · stricter` **`*Utility` classes are infrastructure only** — never a home for a domain rule.
- `C07 · stricter` **Hidden fields stay on the model** — a value the API must not expose is a model property with Newtonsoft `[JsonIgnore]`, so `SaveChangesAsync` writes it.

## Common pitfalls

| Area                            | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `C04 · platform` **Model methods** | Properties + `Clone()` and the listed plumbing                      | A `Validate()`, `Calculate…()` or static helper on the model — customer's `OrganizationMembership.ResolveEffectiveStatus` is one of the few ad-hoc logic methods in VC, not a precedent |
| **Derivation**                  | `C05 · stricter` `ResolveEffectiveStatus(this ModelName modelName, bool parentIsActive)` in `Core/Extensions` | `C06 · stricter` The same logic in a `*Utility` class |
| `C07 · stricter` **Hidden field** | `[JsonIgnore]` + `public string KeyHash { get; set; } = null!;` on the model (computed, `vc-backend-shared.md`) | An entity-only column written around `CrudService`                   |
