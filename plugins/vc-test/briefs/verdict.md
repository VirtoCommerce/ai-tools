# Brief — the verdict

You are a fresh agent that writes `{RUN_DIR}/verdict.md` from the run's result files (spec U30). You test
nothing and re-open no page. Dispatch description: `[vc-test:verdict] <KEY>`.

## Inputs (paths only)

- `STRATEGY` — `test-strategy.md`; `CHECKLIST` — `testing-checklist.md` with its results (the `C-n` AC rows and the
  scenarios' `SC-<n>.<m>` rows); `CHANGE_MAP` — `change-map.json`; `SCENARIOS` — `<WORK>/scenarios.json`
  (`selected`, `notSelected`, `rejected`); `RUN_PLAN` — `run-plan.json` (its `notRun`); `TRIAGE` —
  `triage-report.md` and the `evidence-*/` investigation packages; `design-report.md` when the visual lane ran;
  `RUN_COST` — the Markdown table `run-cost.mjs` printed.
- `BENCHMARK` — only in a benchmark run: the benchmark definition (`<plugin>/benchmarks/<KEY>.json`). You are the
  only agent of the run that reads it.

## Rules (cited, not restated)

- **Reconcile the strategy** first, per `.claude/skills/qa-test-strategy/SKILL.md` §Reconcile.
- **Verdict vocabulary and decision rules:** `.claude/skills/qa-test/close-out.md` §5-verdict.2. An in-scope
  Critical or High bug is FAIL; an in-scope Medium is PASS WITH NOTES; an out-of-scope bug never fails the ticket
  (spec B6).
- **Shape:** `.claude/skills/qa-test-fast/verdict.md` §Files, the `verdict.md` block, ≤ 60 lines, with these
  vc-test changes:
  1. The line under the heading starts with the count of Medium-or-worse bugs, in scope and out of it
     (`Significant bugs: 1 in scope, 2 outside`), then the one sentence (spec B16).
  2. **`## Noticed`** after Bugs — every Low or cosmetic finding as one line, with where it was seen; no
     screenshot, no bug (spec U25).
  3. **Not tested, and why** also lists every `notRun` row of `RUN_PLAN` with its reason — except `Exploratory`,
     which ran as the free class-3 scenario (U65) — every `SKIP` row of the strategy, every scenario not selected or
     struck at approval (U61), every scenario or row `BLOCKED` with its reason, and every AC row
     `BLOCKED — needs a look` or `BLOCKED — needs a global window` (U65, U68) — each with its residual risk.
  4. **Suspicions** — each layer-0 suspicion with `confirmed (<id>)`, `refuted (<id>)` or `not checked`, naming
     the `C-n` or `SC-<n>.<m>` row that decided it.
  5. **`## Cost`** at the end — the `RUN_COST` table as given, then **per scenario** one line — S-n · class ·
     its worst Result · significant bugs it found · the tokens and minutes of its `scenario:S-n` row; then the
     counts proposed (`selected` + `notSelected` + `rejected`) / selected / run (U66).
  6. **`## Benchmark`**, only with `BENCHMARK` (U67): that the run was a benchmark; what was hidden from every
     agent before you — the comments after the cutoff, the hidden issues, the moved-aside run folders, `known.kb`
     and `known.prior_runs`, the kb, `reports/bugs/` and the bug catalog; and each known bug `found (<row id>)` or
     `missed` — a miss against the control.

Return **only** the path and the verdict word.
