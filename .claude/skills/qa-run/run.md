# `/qa-run` — resolving the selection and running it

Read by [`/qa-run`](../../commands/qa-run.md) for every run. A release wave reads [`waves.md`](waves.md) as well, which
calls this file for its execution step.

## 1. What the argument selects

| Argument | Scope | Where the suites come from | Ledger |
|---|---|---|---|
| `smoke`, `critical`, `full`, `frontend`, `backend`, a manifest selection group, `042,078` | a one-off run | `config/test-suites.json` `selections`, or the ids given | no — the triage report of the run is the record |
| `sprint`, `sprint:XX-YY` | the sprint plan | `docs/Sprint plans/sprint-{XX-YY}-summary.json` `suitesActivated[]` (resolution order: `regression-selection.md` §Plan-driven selection) | not yet — a sprint plan writes no release folder |
| `stable:<N> <wave>` · `stable:<N> status` | one wave of a stable-bundle regression | `regression/releases/stable-<N>/release.json` — that wave's `suites`, its `tier` as `--cases`, minus every other wave's `exclusive` | yes — [`waves.md`](waves.md) |
| bare `stable:<N>` | — | refused: a release runs wave by wave, so claims, tier order and the ledger hold. Show `npm run release:status -- stable-<N>` | — |

`--cases`, `--ids`, `--also-ids`, `--seed`, `--teardown`, `--promote` and the layer flags pass through to the
execution pipeline unchanged.

## 2. Run it

**The execution pipeline is the `/qa-regression` pipeline, unchanged** — [`../../commands/qa-regression.md`](../../commands/qa-regression.md)
Steps 0–8 (pre-flight, run id, `regression:plan`, dispatch on the browser lanes, retries, App Insights, consolidated
report, promotion, teardown), with the selection resolved in §1. Every rule of that pipeline applies: browser lanes,
`--secrets`, the runners' observed-behaviour steps, batches of 3.

This is the one dependency on the old command, and it is deliberate: `/qa-run` adds the planning, waves, ledger and
the automatic triage and the GitHub question around a pipeline that already works, and takes the pipeline over when it moves into a plugin
(SKILL.md §Moving into a plugin).

## 3. After the run — triage, then one question, for EVERY scope

1. **Triage runs automatically** as soon as the run has FAIL or BLOCKED cases — no question:
   [`/qa-triage-results`](../../commands/qa-triage-results.md) on the run id. A wave also feeds it the ledger
   (`waves.md` Step 5).
2. **"Put it in GitHub?"** — always asked after triage. What goes in
   depends on the scope:
   - one-off or sprint run: the case and fixture repairs the triage found, as one PR (repairs in their own commit),
     plus `reports/regression/history.json` if the run updated it;
   - release wave: the wave's `state.json`, `ledger.csv`, `report.md`, the regenerated `PROGRESS.md`, and the repairs
     ([`waves.md`](waves.md) Step 7).

   Branch from current `main`, the user's git identity, PR body in English, **never merge**.

Neither step is skipped because a flag resumed the run part-way: triage starts, and the question is asked, when the run reaches them.
