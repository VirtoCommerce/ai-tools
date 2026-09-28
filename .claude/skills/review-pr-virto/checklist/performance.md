# Performance

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
