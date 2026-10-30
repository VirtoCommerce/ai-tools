# Regression orchestrator — consolidated report template

> Cited by `.claude/agents/regression-orchestrator.md` Step 6. Read it when writing `reports/regression/regression-YYYY-MM-DD.md`. Moved verbatim from the agent on 2026-10-30 (VCST-6423).

## Step 6: Consolidate Report — the report template

```markdown
# Regression Test Report — {RUN_ID}
## Executive Summary
| Field | Value |
|-------|-------|
| Run ID / Date / Environment / Selection | ... |
| Total Suites / Passed / Failed | ... |
| Total Cases / Passed / Failed / Blocked / Skipped | ... |
| Overall Pass Rate | X% |
| Case filter (`--cases` runs only) | `<tier>` — N of M cases in scope; K excluded |

## Scope Exclusions   ← `--cases` / `--ids` runs only; omit the section entirely on a full run
Built from the `suite-{ID}-filter.json` sidecars in the run dir — **not** from scrollback. Report what
did NOT run, because a scoped run's silence is otherwise unreadable:
- per suite: `keptCases` of `sourceCases`, and the tier(s) asked for — or, on an ids-only run, that
  it was an exact set (an empty `tiers` in the sidecar means ids-only, NEVER unfiltered)
- suites that contributed **zero** cases, by ID
- any case whose `Priority` the filter could not read, by ID — it did not run and it is not a pass
- any suite refused as legacy 11-column and therefore **run whole**, by ID
- `--also-ids` / `--ids` entries that matched **no suite in the run** (an id missing from one suite is
  normal — the list is run-global and the filter is per suite; only a run-wide miss is a finding)

## Suite Results
| Suite | Name | Browser | Tests | Pass | Fail | Rate | Attempts |
## Bugs Found
| Bug ID | Suite | Severity | Title | Test Case |
## NOT_DEPLOYED — the gated suites with their module and state (BLOCKED-on-deploy, never FAIL)
| Suite | Module | State |
## Retry Log
| Suite | Attempt | Browser | Outcome | Error |
## Suite Details
(per-suite test case results from JSON files)
```
