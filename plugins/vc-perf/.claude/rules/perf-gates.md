# vc-perf advisory gate ladder

Perf work is a **parallel lifecycle** to vc-fix's bug lifecycle. It shares vc-fix's *invariants*
(reused via the vc-fix dependency — not restated here) but has its own proof of "done".

## The perf proof replaces red→green

vc-fix's G2 gate requires a failing unit test that reproduces the bug. A perf regression is not a
failing unit test, and an optimization is not a filed bug with steps-to-reproduce. The vc-perf
equivalent:

- **Reproduction** = a `perf-verdict/1` from `perf-benchmark` (L1), or an L2/L3 attribution slice
  showing the regression / optimization opportunity.
- **"Green"** = verdict `improved` (or the responsible-caller frame gone from the L3 attribution),
  not a passing unit test.

## Reused invariants (from vc-fix — do not restate, they live in vc-fix's rules)

- **No auto-merge** (triple guard). A perf PR ends at "open", never merged.
- **Client-code containment.** A fix lands in the client repo unless it is a platform issue, then it
  goes upstream — route via `vc-fix:qa-fix-routing`, do not re-implement routing.
- **Single repo per change**; a conventions pass before review (`vc-fix:backend-reviewer`).

## Advisory only

The `perf-verdict` NEVER gates CI. It informs a human/agent decision. (See `perf-benchmark`'s SKILL —
emphatic on this: allocations always gate the verdict, time only on a measured job; but the verdict
itself is advisory.)

## Layer applicability (declare per project in the profile)

- **L3** (`perf-trace` parsers): universal — any `.nettrace`, zero coupling.
- **L2** (`perf-loadtest`): needs a running backend + project-authored scenarios/queries.
- **L1** (`perf-benchmark`): needs the project to extend an XAPI module that has a benchmark engine
  (`VirtoCommerce.X{Cart,Order}.Benchmark.Core` today). L1 is blind to real I/O (mocked repo/DbContext),
  so a project whose hot path is network/cache (e.g. API/Redis-based validation) reads FLAT on L1 —
  measure that with L2+L3.
