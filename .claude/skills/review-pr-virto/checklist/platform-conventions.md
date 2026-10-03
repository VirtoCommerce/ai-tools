# Platform conventions

- **`AbstractTypeFactory` pairing.** A new subclass of a platform model without its
  `AbstractTypeFactory<Base>.OverrideType<Base, Derived>()` registration is half a feature: items
  loaded from the database or built upstream come back as the base type, and a `x is Derived` check
  quietly fails. Overrides pair per model **and** per EF entity (without the entity pair, DB loads
  return the base) **and** per validator / search criteria / aggregate where those exist. Register at
  module initialization, once — never at request time, never conditionally on a setting. Two modules
  overriding the same **unregistered** base with *different* derived types is not fine either:
  `OverrideType` appends both, the lookup takes the first in module-initialization order, and the other
  override is dead with no log. Watch for it on a base several modules extend; the fix is a derived
  base per module.
- **Construction goes through the factory.** An overridable type is created with
  `AbstractTypeFactory<T>.TryCreateInstance()`; a direct `new T()` silently drops every registered
  override.
- **`RegisterType<X>()` of a concrete type as itself is cargo cult.** `TryCreateInstance()` falls back
  to `new X()` for a concrete type with a parameterless constructor, and `OverrideType` appends its
  entry whether or not the base was registered. Registration matters only for an **abstract** base,
  for a type that takes part in discriminator-based polymorphic JSON, or for a type constructed through
  the arguments overload of `TryCreateInstance` (unregistered, that overload drops the arguments). The
  meaningful half of such a change is the `new X()` → `TryCreateInstance()` switch.
- **Module layering.** Core holds contracts and models, Data holds EF and services, Web holds module
  initialization and controllers.
- **XAPI mutations are a triplet**: a Command (the request DTO, properties only), a CommandBuilder
  (schema wiring, authorization, the distributed lock), and a CommandHandler (loads the aggregate, calls
  one method, saves). Flag business logic in a builder, validation in `BeforeMediatorSend` (it runs
  outside the lock and bypasses every non-GraphQL caller), a subclassed handler to change behavior (the
  aggregate method is the seam), or a new `if (request.IsXyz)` branch in an existing handler (new
  behavior is a new command). Anonymous-access rejection, authorization and the distributed lock come
  from the domain builder base (`CartCommandBuilder`, `OrderCommandBuilder`, …): flag a new mutation
  builder that derives from `CommandBuilder<…>` directly — it gets no lock, no authorization driven by
  resolving the aggregate, and no `SetExpandedObjectGraph`.
- **Descriptors are declared once:** `SettingDescriptor`s as `static readonly` properties; permission
  names and other literal invariant strings as `const string` (`static readonly string` only when the
  value is computed at startup); property-name discriminators as `nameof()`. Flag
  `new SettingDescriptor` or a permission name built by concatenation inside a method body.
- **Cloning via `CloneTyped()`**, not `(T)x.Clone()` or `x.Clone() as T`. The `as` form turns a
  guaranteed-same-type clone into a nullable and invites an unreachable `?? fallback`. Caveat for the
  fix: `CloneTyped()` copies the `Id`; clear keys when cloning a persisted entity into another aggregate.
- **Collection type follows the member's job, and the three jobs disagree**: `IList<T>` on service
  parameters and returns (the `ICrudService<T>` shape — the caller owns the collection); the concrete
  `ImmutableArray<T>` on a `public static` immutable table (the guarantee lives in the signature, not
  in the initializer); `T[]` on an options POCO bound from configuration. Do not file "prefer
  `IReadOnlyList<T>`" against a public `ImmutableArray<T>`: `IReadOnlyList<T>` is an access interface,
  not a guarantee — a downcast to `IList<T>` writes through it on an array — so the suggestion removes
  enforcement instead of adding it. **This rule defends an `ImmutableArray<T>` a PR already declares;
  it is not a reason to file against the prevailing `public static string[]`.** At the last count that
  form was 32 of 32 `AllPermissions` tables and 37 of 37 static name tables in `ModuleConstants`, and
  `ImmutableArray<T>` appeared nowhere. A nit applying the rule was withdrawn on probing — after the
  author had turned a shipped member into a breaking change to satisfy it. Without a concrete write
  hazard, do not file it; count the convention before invoking it either way.
- **New classes take a file-scoped namespace** (`namespace X;`), in the platform and in every
  `vc-module-*`, whatever form the surrounding files use.
