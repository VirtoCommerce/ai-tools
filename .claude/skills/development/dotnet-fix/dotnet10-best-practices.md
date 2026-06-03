# .NET 10 / C# best practices — within a minimal diff

Apply these to the *change you make*, not as a license to refactor surrounding code. The fix must stay
minimal (Gate 0/G4); best practices guide how the new/edited lines look, matched to the repo's style.

## Language & style
- **Nullable reference types**: respect the repo's `<Nullable>` setting; annotate new params/returns;
  don't introduce `!` null-forgiving unless provably safe.
- **Primary constructors / `required` members**: use them only if the surrounding file already does.
- **Pattern matching / switch expressions**: prefer over long `if/else` for new branching, when it
  reads cleaner and matches neighbors.
- **Collection expressions** (`[]`, spreads) and `var` consistency: follow the file's existing choice.

## Async & DI
- **Async-all-the-way**: `await` everything; never `.Result` / `.Wait()` / `async void` (except event
  handlers). Pass `CancellationToken` through if the signature already carries one.
- **DI**: register/resolve via the module's `module.cs` `Initialize`/`PostInitialize`; constructor
  injection, no service-locator. Don't change a public ctor signature if it would break callers
  (that's a breaking change → Gate 0).

## VC platform conventions
- Domain **events** for cross-cutting side effects (indexation, cache, cascade) — don't inline.
- **EF migrations** are high-risk: avoid; if truly required, flag loudly (may warrant BAIL-back).
- **Settings keys / permissions**: defined in `*.Core`; reuse the existing constant, don't hardcode.
- **Error handling**: throw the platform's typed exceptions; no stack traces leaked to API responses.

## Do-not (breaking changes — STOP at Gate 0)
- Changing a public REST/GraphQL/DTO contract, a DB schema, a domain-event shape, or `module.manifest`.
- Bumping NuGet dependency versions.
- Touching another module's code (cross-module → human coordination).
