---
description: "Data/Validation — FluentValidation validators and their contexts."
applyTo: "src/*.Data/Validation/**/*.cs"
---

# Validators (Data/Validation)

- **FluentValidation**
  - `A01 · platform` Validators are `AbstractValidator<T>`.
  - `L07 · platform` Validators are registered in `Module.cs` as a transient `IValidator<T>` (FluentValidation advises against singleton validators).
- `A03 · platform` **Business rules first** — status transitions, cross-field rules. Repeat a database constraint (length, NOT NULL) only when:
  - the validator is the field's user-facing check — a `400` instead of a database exception, or
  - the limit is owned by another store (an external service's name length).
- `A02 · stricter` **Repeated lengths reference the constant the entity's `[StringLength]` uses** — `MaximumLength(DbContextBase.Length256)`, never a literal: literal copies drift from the column.
- `A04 · platform` **Old-vs-new context** — VC's names: `New…` for the incoming model, `Old…` for the stored one (platform `GenericChangedEntry<T>.NewEntry` / `OldEntry`).

## Common pitfalls

| Area                                  | ✅ Do                                                                | ❌ Don't                                                              |
| ------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `L07 · platform` **Registration**     | `AddTransient<IValidator<ModelName>, ModelNameValidator>()`   | A singleton validator, or validation inlined in a service            |
| `A03 · platform` **Scope**           | Status transitions, cross-field rules; a column limit the user must see as `400` | Repeating every column constraint by default                         |
| `A02 · stricter` **Repeated limit**   | `MaximumLength(DbContextBase.Length256)`                            | `MaximumLength(256)` — a literal that drifts from `[StringLength]`   |
| `A06 · stricter` **Request-bound members**             | `RuleFor(modelName => modelName.Name).NotEmpty()`             | Trusting `required` to keep `null` out                               |
