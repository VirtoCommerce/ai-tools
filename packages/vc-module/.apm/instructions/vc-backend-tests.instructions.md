---
description: "backend tests (xunit.v3)."
applyTo: "tests/**"
---

# Backend tests

Follows the [MS unit-testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices).

- `T08 · platform` **xunit.v3** is the test framework.
- `T01 · platform` **Integration tests carry `[Trait("Category", "IntegrationTest")]`** — CI's `vc-build Test` runs `Category!=IntegrationTest`, so an integration test without it, or tagged otherwise, runs in CI.
- **Behavior through public interfaces**
  - Arrange-Act-Assert, one Act per test (split, or `[Theory]`).
  - `T02 · stricter` `Method_Scenario_ExpectedBehavior` names.
  - `T07 · stricter` Named constants over magic strings.
- **Test doubles by test kind**
  - `T04 · platform` A unit test isolates its unit: stub or mock its repositories and services, the module's own included. A class with few dependencies and no side effects (a validator) may be used as is. An integration test runs the real components together and replaces only the boundaries (external HTTP services, the clock).
  - `T09 · platform` A mock asserts an interaction, a stub just supplies data; both come from Moq.
  - `T10 · platform` An in-memory database (EF InMemory, SQLite in-memory) belongs to integration tests only.
- `T05 · platform` **Test logic, not values** — test code that consumes a constant, manifest or localization value, never the value itself.
- `T06 · stricter` **Set every required member** — through an object initializer; never weaken a class to keep a bare `new()` compiling.

## Common pitfalls

| Area                                  | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `T03 · platform` **Test body**        | Straight-line Arrange-Act-Assert                                    | Branching or loops in a test body                                    |
| **Test body**                         |                                                                     | Testing a private method (extract it instead)                        |
| `T01 · platform` **Integration tag**  | `[Trait("Category", "IntegrationTest")]`                            | `"Integration"` — vc-build doesn't exclude it, so it runs in CI      |
| `T04 · platform` **Test doubles**    | Unit: stub repositories and services, keep a real validator; integration: replace only external boundaries | A unit test that wires a real repository or service                  |
| `T05 · platform` **Targets**         | A test of the logic that reads `Permissions.Access`                 | `Assert.Equal("<permission-prefix>:access", Permissions.Access)` — fails only on a typo |
| `T06 · stricter` **Test objects**     | An object initializer setting every required member                 | `[SetsRequiredMembers]` or `= null!` added to keep `new()` compiling |
