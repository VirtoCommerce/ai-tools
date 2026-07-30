---
description: "Re-measure an operation after a change and emit a pass/fail verdict — the perf 'green'. Re-runs the same layer(s) with IDENTICAL knobs as the baseline and reports whether the finding improved (verdict improved / responsible frame gone / p95 down) or not. Used by /perf-fix step 4 and standalone."
argument-hint: "[operation or scenario, matching the baseline run]"
disable-model-invocation: true
---

# /perf-verify — prove a perf change (the "green")

Confirms that a change actually moved the axis it was supposed to. The perf analog of "tests go green".

## Rules
- **Identical knobs.** Compare only against a baseline run with the same `ITEMS`/`RATE`/scenario/filter
  and the same co-located setup. A different-knobs comparison is not a verdict.
- **Match the layer to the fix:**
  - Code-envelope change (allocation/CPU in managed logic) → `/perf-benchmark` A/B → `perf-verdict/1`
    (`improved` on the alloc axis, or on time if a measured job).
  - Save-path / cache / network / concurrency change → L1 is blind (mocked I/O); verify on **L2+L3**:
    re-run the k6 scenario and re-capture the trace, then confirm the responsible frame is gone /
    smaller and p95 / GC pressure improved.
- **Categorical beats statistical.** A responsible-caller frame that DISAPPEARED is a stronger pass
  than one that merely shrank; a shrink needs the same-session A/B.

## Output
A short verdict: PASS (improved, with the delta per responsible frame + which layer proved it) or
FAIL (flat / regressed → the change did nothing measurable, or made it worse). On PASS inside
`/perf-fix`, proceed to routing/review; standalone, just report. The verdict is advisory — never a CI gate.
