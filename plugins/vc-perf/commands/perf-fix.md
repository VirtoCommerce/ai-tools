---
description: "Optimization lifecycle for a Virto Commerce performance finding: diagnose → rank candidates → implement the minimal change → re-measure to a verdict → route → review → open PR. The perf analog of /qa-fix. Reuses vc-fix's developer/reviewer/routing agents (never duplicates them). Advisory; single repo; never auto-merges."
argument-hint: "[operation or finding, e.g. 'getFullCart p95' or a candidate id]"
disable-model-invocation: true
---

# /perf-fix — performance optimization lifecycle (interactive)

The perf sibling of vc-fix's `/qa-fix`. It orchestrates a fix but **owns almost no machinery** —
it reuses vc-fix (a declared dependency) for everything a bug fix and a perf fix share. The one
thing it replaces is the proof: a perf change is proven by a **verdict** (`regressed → improved`),
not by a red→green unit test. See `.claude/rules/perf-gates.md`.

## Preconditions
- `project-profile.json` exists with a `perf` block — if not, run `/perf-init` first (which reuses vc-fix's `/project-init`).

## Steps

1. **Diagnose → ranked candidates.** Run the measurement the finding calls for — `/perf-benchmark`
   (L1, "did my code regress?"), `/perf-loop` (L2+L3, "how does it behave / who is responsible?") —
   then hand the artifacts to the **`perf-analyst`** agent. It returns ranked optimization candidates.
2. **Pick one candidate** with the operator (highest ROI first). Confirm the axis, the fix shape, and
   where it lands (FE / client project / upstream module).
3. **Implement — reuse `vc-fix:fullstack-backend`.** Spawn the `vc-fix:fullstack-backend` agent to write the
   minimal, single-repo optimization diff (it uses the `dotnet-fix` skill). Pass it the candidate and
   the fix shape. **Tell it the perf proof is a verdict, not a unit test** — its "reproduction" gate is
   the baseline measurement, its "green" is the improved re-measurement (step 4), per `perf-gates.md`.
   Do NOT re-implement a developer agent here.
4. **Verify — `/perf-verify`.** Re-measure with IDENTICAL knobs against the change. The verdict must
   show `improved` (L1) or the responsible frame gone / p95 down (L2/L3). A flat verdict = the fix did
   nothing measurable → back to step 2. (Remember L1 is blind to real I/O — a save-path/cache/network
   fix reads flat on L1; verify it on L2+L3.)
5. **Route — reuse `vc-fix:qa-fix-routing`.** Use vc-fix's routing to decide client-repo vs upstream module.
   A platform-level fix measured as a local POC is reverted locally and promoted through an upstream PR.
6. **Review — reuse `vc-fix:backend-reviewer`.** Have `vc-fix:backend-reviewer` review the diff before the PR,
   and additionally apply the perf-PR review lenses in `$pluginRoot/knowledge/vc-perf-antipatterns.md`
   (`$pluginRoot` = this plugin's active install path, resolved once per task via
   `claude plugin list --json` — see `knowledge/plugin-root.md`; NOT a shell variable,
   `$CLAUDE_PLUGIN_ROOT` does not expand in the Bash tool shell)
   (cache-key completeness + concurrency on cached instances, thread-safety of mutable cached state).
7. **PR — open, never merge.** Open the PR on the routed repo via the same mechanics vc-fix uses.
   The no-auto-merge triple guard applies (`perf-gates.md`): a perf PR ends at "open".

## What this command does NOT do
- It does not file a bug (a pure optimization is not a defect). If diagnosis uncovers an actual
  functional bug, hand off to vc-fix's `/qa-bug` → `/qa-fix` instead.
- It does not gate CI. The verdict is advisory.
