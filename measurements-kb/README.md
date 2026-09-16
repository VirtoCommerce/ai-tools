# kb measurements — the record, kept off `main` on purpose

Everything the knowledge-base work measured between 2026-09-10 and 2026-09-16. Copied here from
`VirtoCommerce/vc-kb-lab` so the record lives in this repository as well as its own.

**This branch must never merge into `main`.** Comparison arms are launched in this repository, and
arm B runs on `main`. An oracle, a task page or a graded result reachable from `main` contaminates
every future comparison by construction — `plugins/vc-kb` on `claude/kb-tool` is the branch that is
meant for `main`; this one is not.

## What is here

| | |
|---|---|
| `measurements/kb-comparison-2026-09/` | the three controlled comparisons: TASK, ORACLE, CONDITIONS and RESULT per round, `VALIDITY.md`, `preflight.mjs`, `arena-settings/`, `REVIEW-BRIEF.md` |
| `measurements/kb-live-2026-09/` | conditions for the twelve exploratory runs, and `preregister.mjs` |
| `measurements/kb-arrival-2026-09/` | the arrival-hook replay and what it showed |
| `measurements/kb-retrieval-2026-09/`, `kb-regrade-2026-09/` | retrieval and outside-regrade experiments |
| `MEASUREMENT-archive/run-01..12/` | every exploratory run's tool log, kb journal and question CSV |
| `MEASUREMENT/` | the current session's logs |

## What is NOT here, and where it is

**Five tool logs of the authoring sessions were excluded.** Each one matched this project's own
credential-scan pattern — the bare prefixes of a GitHub token and a Jira token, with no token body
after them, echoed into the log by the scan command that was looking for them. A strict check for a
prefix followed by any token characters returns zero matches across all 187 files kept here, so
there is no credential in them. They are excluded anyway, because the cheap safe action was
available and inspecting them more closely was not. They remain in `VirtoCommerce/vc-kb-lab`,
which is already pushed.

(This paragraph originally quoted those prefixes literally, and so tripped the very scan that runs
before every commit here. That is the third time in this project a guard has caught its author.)

**Arm reports, arm artefacts and sealed predictions are not here either.** They live outside every
repository by design, in `C:/_VIRTO/_comparison-logs/` and `C:/_VIRTO/_predictions/`, because a run
must not be able to read the material of the run before it. The RESULT pages cite them by path.

## The honest summary of what it all says

Three controlled comparisons: 194/211/232 tool calls, then 7.5/7.5/8.0, then 7.0/7.0/7.0.
**Three null results on capability.** Round one's qualitative claim was withdrawn on 2026-09-16 after
an independent review found the log did not support it. `measurements/REVIEW-BRIEF.md` states the
question that follows, and the review's answer is in this repository's history, not in a file here.
