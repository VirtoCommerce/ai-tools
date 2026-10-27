---
name: qa-run
description: "[QA Methodology] Methodology behind /qa-run — running any regression (one-off selection, a sprint plan, or one wave of a stable-bundle regression that several QA run in parallel) with the release folder, the triage ledger, triage that starts on its own after the run, and the always-asked GitHub question after triage. Kept self-contained so it can move into a plugin."
argument-hint: "smoke | critical | full | <suite ids> | sprint[:XX-YY] | stable:<N> <wave> [--claim|--continue|--triage|--publish|--handover] | stable:<N> status"
---

# qa-run — run any regression

The methodology behind [`/qa-run`](../../commands/qa-run.md). The plan comes from `/qa-test-plan` (sprint or
`stable <N>`); this skill runs it.

## Files

| File | Read when | Holds |
|---|---|---|
| [`run.md`](run.md) | every run | what each argument selects, the execution pipeline, the automatic triage and the GitHub question after the run |
| [`waves.md`](waves.md) | `stable:<N> <wave>` or `stable:<N> status` | claiming a wave, known ground, the tiered run, triage into the ledger, publishing, handover |
| [`release-folder.md`](release-folder.md) | any work on `regression/releases/<release>/` | the contract: layout, `release.json`, `state.json`, the ledger and its verdicts, parallel-run rules, claims |

## Scripts

| Script | Does |
|---|---|
| `npm run release:diff` | which bundle components changed code (used by the planner) |
| `npm run release:status` | overview, generated `PROGRESS.md`, ledger export for triage (`--ledger --suites … --with-baseline`) |
| `npm run release:report` | the tracker side: wave sub-tasks (`--subtasks --apply`), and per finished wave the release dashboard + the run dashboard as two new comments (`--wave <W> --post`) |
| `npm run release:check` | validates a release folder; CI runs `--all` |

They read and write `regression/releases/` under the project directory (`QA_RUN_HOME`, else the working
directory), never under their own install location.

## Moving into a plugin

Built to move into a distributed plugin later (`plugins/CLAUDE.md`: a plugin cannot reach `.claude/` files, so it carries
copies). The move is mechanical when it happens:

1. **Take the pipeline over.** `run.md` §2 runs the `/qa-regression` pipeline; the plugin carries that pipeline (its
   command body, `regression-orchestrator`, `test-runner-agent`, and the `scripts/regression/` + `ci/lib/` code it
   calls) instead of pointing at it.
2. **Copy what is cited.** Everything this skill links outside its own folder: `.claude/rules/{agents,regression,reports,test-data}.md`,
   `.claude/knowledge/execution/{regression-suites,tracker-ops,kb-capture-contract,regression-selection}.md`,
   `.claude/templates/agent-dispatch.md`, the `preflight` and `qa-review-tests` skills, `/qa-triage-results`, and the
   planner (`/qa-test-plan` with `knowledge/execution/test-plan/`).
3. **Scripts self-locate.** `release-status` / `release-diff` resolve the project from `QA_RUN_HOME` or the working
   directory already; their own data (`config/module-repo-map.json`) moves with them.

Until then, cite these files; do not copy them — two copies inside one repo drift (`CLAUDE.md` §Where the rules live).
