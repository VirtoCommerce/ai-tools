# Backward compatibility

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
