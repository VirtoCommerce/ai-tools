# Archive

Closed-sprint ticket evidence, moved out of `reports/tickets/` once its sprint is done, so the
per-ticket record (`summary.json`, `testing-checklist.md`, verification and design reports,
screenshots) survives without cluttering the active report tree. Kept for reference and audit trail.

## Contents

```
archive/sprints/
└── <Sprint>/<TICKET>/      # same shape as reports/tickets/<Sprint>/<TICKET>/
```

`ls archive/sprints` lists the sprints currently held. The older archive (sprint test cases from
Sprints 25-19 through 26-04) was removed from the working tree on 2026-07-28, as was the root `tests/`
tree it pointed to; `git log -- vc/shared/archive` recovers them.

## Retention Policy

- These directories are retained as historical records of completed sprint testing.
- Active ticket evidence lives in `reports/tickets/<Sprint>/<TICKET>/` (`.claude/rules/reports.md` §1);
  active test cases live in `regression/suites/`.
- Do not add new test work here — archive a sprint by moving its `reports/tickets/<Sprint>/` folder in whole.
