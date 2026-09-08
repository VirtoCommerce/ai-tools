# Regression — retired designs and incident record

> Rationale and history moved out of `.claude/rules/regression.md` on 2026-09-08. Never loaded into an agent context; read by humans deciding whether to re-create something.

### 3. ~~Autonomous Interactive Regression (Agent Teams)~~ — REMOVED 2026-08-26

There was a second interactive orchestrator (`autonomous-regression-orchestrator` +
`autonomous-test-runner`, ~500 lines, plus a private `scripts/regression/reporting.ts`). It is gone,
and this tombstone records why so it is not re-created:

- **Its output went where nothing reads.** It wrote `results/{RUN_ID}/`; every consumer reads
  `reports/regression/{RUN_ID}/`. So an autonomous run got no live HTML dashboard, no
  `/qa-triage-results`, no `history.json` flakiness feed, no `reap-stalled-run` backstop and no
  `compute-metrics` quality gate — it had a parallel reporting module instead.
- **It had drifted.** Its fallback chain was still `chrome → firefox → edge`; the manifest was
  reordered to put firefox LAST on 2026-08-05 precisely because firefox cannot click on this
  storefront, so firefox in second place burned a retry. It also named firefox the *preferred*
  browser for Smoke and Payment, and knew nothing of `clickDriven` or `regression:plan`.
- **Its one unique feature contradicted policy.** Auto-filing JIRA from a regression run, while
  `/qa-triage-results` and `/qa-monitoring` both deliberately stop at drafting.

What was kept: the graduated rate-limit guard and the 30/60s backoff ladder, now in
`.claude/agents/regression-orchestrator.md` Step 5. Mode 2 (headless CI) and mode 1 (interactive)
remain; the interactive one is the path in daily use.

