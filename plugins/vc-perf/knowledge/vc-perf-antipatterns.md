# VC-specific performance antipatterns

Recurring performance antipatterns in the Virto Commerce platform and its modules that the generic
.NET catalogs do **not** cover. `analyzing-dotnet-performance` targets language/BCL usage;
`optimizing-ef-core-queries` targets the EF *query* side. The entries below are specific to VC's
architecture — XAPI aggregates, `AbstractTypeFactory`, the EF **save** path with triggers,
search-index reads, and Identity/member resolution — and every one was found by running the
three-layer loop against a real backend under concurrent load.

**Why they need this doc:** most are invisible to L1 (BenchmarkDotNet mocks the repository/DbContext,
so the save path, search I/O, and lock convoys do not exist there) and invisible to single-request
profiling (they are concurrency/scale effects). They surface only at **L2 (load) + L3 (attribution)**.

**How to use it:** an L0 hypothesis list. When L3 attribution points at one of these frames, jump to
the fix shape instead of re-deriving. The loop still verifies — never trust the hypothesis alone.

Each entry: **recognition signal → which layer confirms → fix shape → where the fix lands**
(FE / client customization / upstream module).

---

## 1. EF save-path full-graph `DetectChanges` (triggers) — O(N²)

- **Signal:** allocation grows super-linearly with item count while p95 stays flat single-user;
  L3 `allocparse` shows `ChangeTracker.DetectChanges` / trigger infrastructure dominating on the
  save path. A trigger framework (`DbContextWithTriggers`-style) forces a full-graph `DetectChanges`
  multiple times per `SaveChanges`; combined with load-whole-aggregate-and-patch-per-item this is O(N²).
- **Confirms at:** L3 under an L2 build-up scenario (add N items). **L1 is structurally blind** — it mocks the repository.
- **Fix shape:** collapse the repeated detect to a single call at the unit-of-work commit chokepoint
  (`DbContextUnitOfWork.CommitAsync`); avoid re-loading the whole aggregate per item.
- **Lands:** upstream platform (the UoW / trigger chokepoint) — measure as a local POC, promote upstream.

## 2. `AsQueryable` expression-compile convoy (process-wide lock)

- **Signal:** a method composes LINQ operators on `.AsQueryable()` over an **in-memory** collection.
  Every enumeration of that `EnumerableQuery` rebuilds and compiles the expression tree
  (`LambdaCompiler` / `Reflection.Emit`), which takes process-wide runtime locks. Single-VU latency
  is fine (e.g. ~280 ms) but collapses under concurrency (seconds at 50 VU) — a scalability cliff
  invisible to single-request profiling. L3 CPU shows `EnumerableQuery`/`LambdaCompiler` frames.
- **Confirms at:** L2 (compare single-VU vs concurrent) + L3 CPU attribution.
- **Fix shape:** plain LINQ-to-objects (`Func` delegates, no expression trees); keep the `IQueryable`
  seam via a trailing `AsQueryable()` if the signature requires it.
- **Lands:** upstream modules. Observed in `TaxProviderSearchService.ProcessSearchResultAsync`
  (vc-module-tax) and `PricingEvaluatorService.PriceListAssignmentAsync` (vc-module-pricing).

## 3. Search read-amplification (per-item repeated catalog-global loads)

- **Signal:** one GraphQL request issues the *same* catalog-global search/load once per distinct
  product/section (e.g. 200+ Elasticsearch `_search` for one `getFullCart` on a distinct-product mix).
  The DataLoader dedups by product id but not by the invariant argument set that repeats across items.
- **Confirms at:** L2 (search-count per request) + L3 `dbparse`/span timing.
- **Fix shape:** a request-scoped dedup cache (`GetOrAddAsync(key, factory)`, scoped, keyed by the
  load's stable order-independent arguments). Deduplicates loads invariant across items but re-issued
  per item within one request. (An `IRequestScopedCache` primitive belongs at the x-api tier.)
- **Lands:** upstream x-api primitive + per-consumer keys (client customization or upstream module).

## 4. Per-request heavy-object construction (Identity / validators / meters)

- **Signal:** a Transient service constructs an expensive object per call for the same request —
  e.g. a fresh `UserManager<T>` per member resolution, whose ctor builds a `UserManagerMetrics` that
  hits `Meter.GetOrCreateInstrument` and locks the meter's instrument list unconditionally (a lock
  convoy under concurrency); or FluentValidation validators re-constructed per validation call. L3
  CPU shows `Meter.GetOrCreateInstrument` / a ctor frame dominating.
- **Confirms at:** L3 CPU under L2 load. (Single-user latency often unchanged — it is a CPU/scalability win.)
- **Fix shape:** a **per-request** cache (`HttpContext.Items`, keyed, `ConcurrentDictionary` + `Lazy`),
  not cross-request (cross-request risks staleness). Service stays Transient; background paths
  (no HttpContext) unchanged.
- **Lands:** consumer-side cache (client customization or the owning module). A full fix for the meter
  lock is upstream .NET (sealed `UserManager` ctor has no DI seam).

## 5. Property-expansion quadratic clone

- **Signal:** a product/property expansion re-clones the full property-value set for every value
  (quadratic waste), and re-expands per node. L3 `allocparse` shows the clone frame growing with
  property count.
- **Confirms at:** L3 allocation attribution under L2 read load.
- **Fix shape:** a values-free template clone + per-request memoization of the expansion.
- **Lands:** upstream. Observed in `ExpandByValues` (vc-module-x-catalog).

## 6. Per-user distributed-lock serialization on cart mutations

- **Signal:** mutation throughput collapses under concurrency for the *same* user while reads stay
  fast (e.g. steady `addItem` p95 in seconds vs read-path p95 in the low hundreds of ms). A per-UserId
  distributed lock serializes all of that user's mutations.
- **Confirms at:** L2 (mutation vs read scenario, multi-user pool vs single user).
- **Fix shape:** narrow the lock scope, or reconsider whether the whole mutation needs the lock; this
  is an architectural decision, not a local hack — discuss before changing.
- **Lands:** upstream x-cart / the aggregate command pipeline.

## 7. `Search*`-for-lookup-by-id / missing `GetNoCloneAsync`

- **Signal:** code calls `*SearchService.SearchAllAsync(criteria)` with `ObjectIds`/`Skus`/`Codes`
  embedded when it already has the primary key — search is for criteria queries, not identity lookup.
  Or a read-and-feed-downstream path uses a cloning `GetByIdAsync` where `GetNoCloneAsync` would avoid
  a double clone.
- **Confirms at:** L3 (allocation from clone; DB/search round-trips) — but often catchable statically.
- **Fix shape:** `GetByIdAsync`/`GetByCodes`/`GetNoCloneAsync` for lookup-by-identifier; reserve
  `Search*` for criteria-filtered queries. Do NOT use `GetNoCloneAsync` in a mutation path.
- **Lands:** client customization or upstream module (wherever the lookup lives).

---

## Perf-PR review lenses

When reviewing the *diff that implements* one of these fixes (before its PR), apply these dimensions
with a **blocker / major / minor / nit** severity scale (adopted from the upstream-PR review discipline):

- **Backward compatibility** — public/virtual surface, override seams, serialization contracts.
- **Performance** — EF N+1 / client-eval, missing `AsNoTracking`/`GetNoCloneAsync`, `Search*`-for-lookup,
  eager materialization, cache-key completeness + concurrency on cached instances, per-row GraphQL resolvers.
- **Correctness** — null/async hygiene, silent failures, thread-safety of any mutable cached state,
  non-unique-key nondeterminism.
- **Cache invariants** — a per-request cache must not leak across requests; a cross-request cache must
  have a correct invalidation story (staleness is the classic regression a cache reintroduces).

For the deep, general-purpose .NET recipe sets behind these, run the companion skills
(`analyzing-dotnet-performance`, `optimizing-ef-core-queries`) at the L0 step — see `perf-loop`.
