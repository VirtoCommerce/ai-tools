---
description: "L1 BenchmarkDotNet before/after — did my code's allocation/time envelope regress? Runs a scoped A/B (own before/after, own vs upstream, or upstream before/after) and emits the machine-readable perf-verdict. Thin command over the perf-benchmark skill."
argument-hint: "[operation to scope, e.g. '*ChangeCartItemQuantity*']"
disable-model-invocation: true
---

# /perf-benchmark — L1 A/B verdict

Entry point for the "did my change regress this code path?" question. The **`perf-benchmark` skill**
carries the how (two-axis verdict — allocation always gates, time only on a measured job; job
economics; the three A/B scenarios; `compare-reports.cs`).

- Needs the project's benchmark runner projects and `perf.benchmark` in the profile (`BENCH_PREFIX` /
  `runnerDirs`) — set by `/perf-init`. Applies only where the project extends an XAPI module that has
  a benchmark engine.
- **Always scope** (`--filter` one op / `--categories` one area) — the full measured suite is ~13h.
- **L1 is blind to real I/O** (mocked repo/DbContext): a save-path / cache / network change reads flat
  here — diagnose those with `/perf-loop` (L2+L3).
- Default job is Dry (alloc verdict in seconds); ask before a measured run (minutes–hours).
