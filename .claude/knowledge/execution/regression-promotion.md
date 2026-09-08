# Regression — post-run promotion (Draft → Automated)

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Post-Run Promotion — `Draft → Automated`, derived from the run

A run produces the only evidence that can justify calling a case `Automated`, and until
2026-08-26 nothing consumed it. The promotion rule was written down three times (`/qa-test`
5g, `/qa-test-lifecycle` 6P, `test-case-template.md` §Automation_Status) and performed by
hand: an agent re-read a report, decided which cases "ran green", and edited the
`Automation_Status` cell. `suites:lint` S-006 only ever checked the **vocabulary** — that
`Automated` is a legal word, never that it is a justified one — so a promotion could not be
re-derived by anyone, including the person who made it. That matters more than an ordinary
bookkeeping error because promotion is **one-way in practice**: an `Automated` case is
regression-eligible forever, so a wrong flip is permanent coverage resting on a verdict that
was never recorded.

| Command | Does |
|---|---|
| `npm run tc:promote -- [RUN_ID\|latest] [--suite <ID>] [--ids <IDs>]` | dry run: print the per-case decision and the reason for every hold |
| `npm run tc:promote:apply -- <RUN_ID> [--suite <ID>] [--ids <IDs>]` | write the CSVs, then `suites:sync` + `suites:lint` |
| `… -- --ids <IDs>` | restrict to these case ids — a **scope, never a gate**: every `PR-*` rule still runs on what it leaves. A multi-round `--iterate` close-out needs it, because a case is promotable from the run that EXECUTED it, so it promotes once per RUN_ID |
| `… -- --min-green-runs <N>` | require N trailing green runs, not just this one |
| `… -- --stamp VCST-1234` | stamp `References` with a ticket key instead of the RUN_ID |
| `… -- --json` | machine-readable decisions, for a skill to relay |

Core `scripts/test-cases/promote-cases.ts`; unit tests `scripts/unit/promote-cases.test.ts`.
It **never demotes**, never touches a row that is not exactly `Draft`, and never invents a
verdict for a case the run did not report — the flip is the only write it can make.

**A case is promoted only when every one of these holds**, and each has a reason code so a
hold is attributable rather than narrated (`PR-002` absent from the run · `PR-003` verdict
is not PASS · `PR-004` non-executing lane · `PR-005` flaky · `PR-006` too few green runs ·
`PR-007` GRD-001 at the target status · `PR-008` a Critical structural finding · `PR-009`
the run reported the id twice · `PR-010`/`PR-011`/`PR-012` the row or file cannot be read ·
`PR-013` the run never completed · `PR-014` the CSV changed after the run finished).

Five decisions are worth stating, because each one was a live fork:

- **Fail-closed in one direction only.** Every doubt leaves the case at `Draft`, which is the
  status quo. A missed promotion costs one more run; a wrong one puts an ungrounded case into
  permanent coverage. Same asymmetry, and the same resolution, as `case-classifier.ts`
  routing doubt to the browser lane.
- **The row is linted at its TARGET status, not its current one.** `lint-test-cases.ts`
  GRD-001 escalates a `{HYPOTHESIS}` assertion to Blocker only in a **promoted** (past-`Draft`)
  case — that IS the rule "a hypothesis may not survive promotion", and asking it of the row
  as it stands always answers yes. So the promoter lints the row with `Automation_Status`
  already set to `Automated`, reusing the ONE declared gate. Restating the gate here is how
  two enforcers come to disagree; the worked example is `050m`'s `SR-GQL-056`, green in the
  run and correctly held on `[ERRORS label=main] errors[] empty {HYPOTHESIS}`.
- **A browser-lane PASS counts.** `Automated` means "MCP-executable by an agent"
  (`test-case-template.md` §Automation_Status), and the browser lane is an LLM agent driving
  Playwright MCP, not a human. A PASS on the `manual` or `deprecated` lane, by contrast, is
  **incoherent** rather than weak evidence — those lanes never dispatch — so it is refused
  (`PR-004`), not discounted.
- **The current run counts as one green run.** The fingerprint store is filled by a separate
  `triage:collect --record` that may not have run yet, so reading the streak off the store
  alone found zero and the default `--min-green-runs 1` held every case in an unrecorded run
  — a green run counting as no green runs. The canonical `suite-*-results.json` outranks the
  store for the run being read. Flakiness still comes from the store, folded **across
  environments on purpose**: `Automated` is a claim about the case, and a case that only holds
  on one environment is the kind that later reads as a product failure.
- **The CSV is edited surgically, not rewritten.** Re-serialising a suite renormalises the
  quoting of every untouched row (an unreviewable diff), and several suites carry inner-quote
  irregularities a strict re-write mangles. Each edited record is located by its own raw
  source text, only the bytes of the changed fields are replaced, and the result is re-parsed
  and compared field-by-field against the original — anything that moved where it should not
  aborts the whole write. Measured on `050m`: 39 promotions produced a 39-insertion /
  39-deletion diff and nothing else. `References` gains a `Promoted: <label> (<date>)` stamp
  appended beside the existing `Synced:` / `Audited:` ones, never clobbering them.

**It is a tool, not an automatic step.** Promotion out of `Draft` stays a human /
`qa-lead-orchestrator` decision — the promoter makes that decision *checkable* and its write
*safe*, which is the half that was missing. `/qa-test` 5g and `/qa-test-lifecycle` 6P remain
the flows that decide; they now call this instead of hand-editing the cell.

