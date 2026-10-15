# Correctness and error handling

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
