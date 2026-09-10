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

## Shared-tree losses

The measured incidents, 2026-08-28 and 2026-09-01. They were the evidence for the shared-tree **git
prohibition**, which was **RETIRED 2026-09-10** by operator decision and no longer exists in any tier;
the surviving rule is one-author-per-suite-CSV
([`.claude/knowledge/execution/regression-suites.md`](../../.claude/knowledge/execution/regression-suites.md)
§Working concurrently on suites). This is the only record of the incidents themselves.

**1. `git checkout --theirs -- .` reverted the whole tree (2026-08-28).** Reached for as "recovery"
after a `git stash` collision in the shared tree, it reached files it had no interest in and reverted
**every tracked file** to HEAD — destroying a completed 161-insertion suite re-pointing and 14 rule
edits belonging to other sessions. Single authorship would not have prevented it: the command was run
by the file's own author, and its blast radius was the whole tree — which is why the git prohibition
was stated *before* the one-author rule for as long as it existed.

**2. `commit all` published a second session's work (2026-08-28).** One session's user authorised a
tree-wide commit; it carried a second session's fixture work, suite fix, aliases and bug reports —
without that session's user being asked. It landed cleanly only because that half happened to be
gate-green at that minute; a patched assertion had landed moments earlier and the same command could
as easily have caught the file mid-edit. Treat the good outcome as luck, not as evidence the practice
is safe.

**2b. The calibration case (2026-09-01).** `reports/regression/test-run-status.json` was committed
mid-run and read as a repeat of incident 2, until checking showed it has been tracked for 100+ commits
and matches no ignore rule — so every commit touching that path has always recorded whatever state it
was in. That is untidiness, not the failure. The distinction has to stay sharp: a rule that flags
everything flags nothing.

**3. Two agents, one suite (2026-08-28).** Two `test-management-specialist` agents in two sessions
were given suite `083d` minutes apart. Combined with incident 1 the same day, that suite lost a
completed 161-insertion re-pointing twice over. Neither loss was a merge conflict; both were two
writers where the tree assumed one.

**4. One unparsable CSV blocked two sessions for ~15 minutes (2026-08-28).** A
`CSV_INVALID_CLOSING_QUOTE` at line 871 of one suite took `suites:sync` and `suites:lint` down for
every author in the tree. The author who caused it did not know it was blocking anything — it looked
like a local parse failure.

**5. Two coordination messages were dropped silently (2026-08-28).** Both carried load-bearing
environment facts to another session's subagent; both were treated as untrusted system-reminder
content and declined, and neither side saw a rejection.
