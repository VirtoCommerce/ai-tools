# Review dimensions

The checklist for a PR in `vc-platform` or a `vc-module-*` repository. Walk the dimensions **in
order** — they are ranked by expected severity for code that ships as NuGet packages. Each item says
what to flag and why; verify every claim against the code (Serena, per `SKILL.md` → Code navigation),
never from memory of how the platform "usually" looks.

**Why the order puts compatibility first:** a module is consumed by downstream projects that subclass
its services, override its `protected virtual` seams, register overrides of its models, and query its
GraphQL schema. A subtle break of that surface hits every consumer silently on their next package
bump; an internal logic bug hits one flow and is usually caught by a test.

## 1. Backward compatibility (highest)

- **Removed or renamed `public` members, changed signatures, changed return types.**
- **A `protected virtual` seam moved, removed, or bypassed.** Three shapes:
  - *The seam moves.* Logic moves off an overridable method. A `*Core` template split (the old method
    sealed, or turned into a wrapper that calls `*Core`) breaks every existing override outright.
    Relocation — a new pipeline step, DI resolution instead of `AbstractTypeFactory<T>` construction —
    is the silent form: the old override keeps compiling and stops firing, and an `OverrideType` on the
    abandoned path becomes dead weight with nothing warning about it.
  - *The base contribution dies.* A base `virtual` method carries cross-cutting work (a tracing span, a
    validation step, an event) that an override which does not call `base.` never runs. For a span, the
    sanctioned shape is one `protected virtual Start<Phase>Activity()` per phase (not a generic
    `StartActivity(name)`), returning the `Activity` null-safe; the base phase method and any override
    both call it, and the caller keeps the `using`. It adds a seam and moves none. If the PR — or a
    reviewer — proposes hoisting such work with a `*Core` template split, recommend the additive
    virtual instead.
  - *A base-class optimization fast-paths around a seam.* A shared base class starts implementing a
    new interface (or a new fast path) whose default code bypasses a `protected virtual` method that
    subclasses use to shape results — e.g. a new `CountAllAsync` / `ExistsAsync` that goes straight
    to the query and skips a post-query hook such as `ProcessSearchResultAsync`. Every subclass that
    shapes membership after the query now gets wrong answers, with no compile signal, across every
    module that inherits the base. Recognition: the PR says "no module changes required" / "every
    service gets it automatically", or its safety carve-out names one seam when another exists. The
    safe shape is **opt-in**: a service declares the interface consciously, after its author confirms
    membership is fully defined by the query; and new members keep a fallback path that goes through
    the existing seams.
- **New `public` methods on a service must be `virtual`.** Services are subclassed and DI-substituted
  downstream; a non-`virtual` public method silently closes an extension point the ecosystem assumes
  exists. Strongest signal: a new non-`virtual` public method next to `virtual` siblings on the same
  class. Not a signal for `private` / `internal` helpers, `static` methods, or sealed types.
- **Behavioral changes to an existing `virtual` method** that downstream overrides call via `base.`.
- **Serialization and contract changes:** renamed JSON properties, changed discriminators
  (`PolymorphJsonConverter`), removed or retyped GraphQL fields, a GraphQL field whose declared type is
  unchanged but whose returned data changed.
- **And is it declared?** Every break found above belongs under a `## Breaking changes` heading in the
  PR description. A consumer upgrades on the description, not the diff, so an undeclared break is a
  finding at the same severity as the break itself, and the reviewer is the last checkpoint before it
  ships in silence. Breaking changes come in three kinds, and the description should say which:
  1. *compile* — a signature change or removed member (a constructor parameter added, an interface
     method changed);
  2. *link / package upgrade* — a removed or renamed published member (deleted without an
     `[Obsolete]` overload), where the description should state the `[Obsolete]` decision;
  3. *runtime* — a behavior or runtime-type change with an unchanged signature.

  Watch the third kind hardest: a declared type that still compiles while the runtime value changed
  shape is invisible to the compiler, to schema diffs, to the tests, and to anyone reading a diff
  summary. The description's useful shape is the consumer's questions in the order they ask them —
  what changed; new or changed GraphQL; new public services; new protected methods; breaking changes;
  new dependencies — with an explicit `None` rather than a dropped section.

## 2. Platform conventions

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

## 3. Data and migrations

- **Any schema change ⇒ migrations for every provider the repository ships** (SqlServer, PostgreSql,
  MySql where present), plus updated model snapshots. A single-provider migration is a **blocker**.
- Migration content: data loss on column drops or renames, defaults for new non-nullable columns,
  indexes for new query paths.
- Entity ↔ model mapping updated in `ToModel` **and** `FromModel` (and `Patch`): a one-sided mapping
  silently zero-defaults the field on the round trip.

## 4. Performance

- **EF:** N+1 (a per-item query in a loop where a batch overload exists), client evaluation, missing
  no-tracking on read paths.
- **Lookup by identifier goes through CRUD, not search.** `GetAsync(ids)` / `GetByIdAsync(id)` /
  `GetByCodes(...)` / `GetByOuterIdsAsync(...)` when the caller already holds the key; a `Search*` call
  with `ObjectIds` (or known codes) in its criteria goes through the search path (possibly an index
  hop) and then re-hydrates, where a CRUD `Get*` goes straight to the store by key.
  Recognition: a `Search*` call followed by `.FirstOrDefault()` whose criteria carry one identifier.
- **`GetNoCloneAsync`** on a batch load when all three hold: the load is via `ICrudService<T>`, the
  next step clones anyway (building aggregates), and nothing mutates the loaded entities. The default
  `GetAsync` clones in the service layer and the aggregate repository clones again. Never for a path
  that mutates — that corrupts the cache.
- **Allocations:** `.ToArray()` / `.ToList()` immediately followed by a single-pass consumer (`foreach`,
  `Sum`, `Any`, `Count(predicate)`); `.ToList()` then `.Count`. Materialize only when the result is
  enumerated twice, the source may change, indexer access is needed, or an `IQueryable` leaves its EF
  scope. LINQ chains in hot paths.
- **`ValueObject` equality in hot loops.** Its cost on modern .NET is boxing of value-typed
  components, the iterator allocated per call, and LINQ enumerators — not reflection. A fix that caches
  a `Func<object, object>` getter still boxes. A fast path that re-enumerates properties must be gated
  on the type not overriding the virtual members it bypasses (`GetEqualityComponents`,
  `GetProperties`).
- **Caching:** cache-key completeness (every input that shapes the value is in the key); mutable state
  on cached instances shared by concurrent readers. The standing example is `CartAggregate`: it is
  registered transient, but the repository caches the constructed instance (keyed by cart id, language,
  response group and fields), so one instance is shared across concurrent requests. Writes are
  serialized per **user** by the command builder's distributed lock (when a lock key exists); reads are
  not serialized at all. The cache is keyed per cart and the lock per user, so two users working on one
  shared cart take different locks and can interleave on the same cached instance. A plain `List<T>`
  or `Dictionary<,>` on an aggregate that read paths enumerate will throw under a concurrent write — and
  a thread-safe type is necessary but not sufficient: a `ConcurrentDictionary` exposed as
  `IDictionary` cannot express `GetOrAdd`, so a populate path through it is still check-then-act.
- **GraphQL:** a per-row field resolver that calls a service per row without a batch / data loader.
- For diffs heavy in this dimension, see `SKILL.md` Step 4 on the `dotnet-diag` skill.

## 5. Correctness and error handling

- Null handling on external inputs and optional relations.
- Async hygiene: `async void`, a missing `await`, `.Result` / `.Wait()` on hot paths, fire-and-forget
  without error observation.
- Silent failures: swallowed exceptions, `catch` + log-only on state-mutating paths, fallbacks that
  mask data problems.
- **`FirstOrDefault()` / `Take = 1` on a composite key that no unique index backs**, feeding a
  boolean gate (locked, enabled, a permission). With two matching rows, which one comes back is
  arbitrary, so the decision flips with row order — invisible until a duplicate appears, then
  intermittent. Ask: is uniqueness enforced by the database, or only assumed? Fix by a unique index or
  by resolving deterministically over all matches.
- Thread safety of new mutable state on singleton or cached instances.

## 6. Tests

- Is the PR's new behavior covered by new or updated tests? Absence is a finding (usually **major**),
  not a shrug.
- Do the tests assert the behavior, or only "does not throw"?
- Edge cases: empty collections, null optionals, every database provider where behavior differs.
