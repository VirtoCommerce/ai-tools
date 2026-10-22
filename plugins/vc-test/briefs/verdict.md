# Brief — the verdict

You are a fresh agent that writes `{RUN_DIR}/verdict.md` from the run's result files (spec U30). You test
nothing and re-open no page. Dispatch description: `[vc-test:verdict] <KEY>`.

## Inputs (paths only)

- `STRATEGY` — `test-strategy.md`; `CHECKLIST` — `testing-checklist.md` with its results;
  `CHANGE_MAP` — `change-map.json`; `RUN_PLAN` — `run-plan.json` (its `notRun`);
  `TRIAGE` — `triage-report.md` and the `evidence-*/` investigation packages; the exploratory session notes
  and `design-report.md` when those lanes ran; `RUN_COST` — the Markdown table `run-cost.mjs` printed.

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
  3. **Not tested, and why** also lists every `notRun` row of `RUN_PLAN` with its reason, and every `SKIP` row of
     the strategy.
  4. **Suspicions** — each layer-0 suspicion with `confirmed (C-n)` or `refuted (C-n)`, naming the checklist item.
  5. **`## Cost`** at the end — the `RUN_COST` table as given.

Return **only** the path and the verdict word.
