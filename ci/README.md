# ci/ — shared regression planning library and App Insights probes

This folder used to hold the headless Claude Agent SDK pipelines: `run-regression.ts`, `run-full-cycle.ts`,
`run-monitor.ts`, `run-suite-audit.ts`, `notify-teams.ts`, the Docker image and their GitHub workflows.
They were removed by VCST-6637 because they almost never ran. Why, and what to read before re-creating one:
[`docs/decisions/regression-history.md`](../docs/decisions/regression-history.md) §Headless pipelines removed.

Regression now runs interactively only: `/qa-regression`, `/qa-run`, `/qa-smoke`.

## What is left

| Path | What it is | Used by |
|---|---|---|
| `lib/suite-manifest.ts` | Manifest types, selection rules, multi-env filters | `scripts/regression/*` (`regression:plan`, `regression:select`, preflight), `verify:multi-env` |
| `lib/run-plan.ts`, `lib/scheduler.ts`, `lib/suite-caps.ts`, `lib/suite-batching.ts` | Batch and lane planning for a run | `scripts/regression/plan-run.ts`, `scripts/lib/suite-selection.ts` |
| `lib/lane-classifier.ts`, `lib/manifest-preflight.ts`, `lib/affected-suites.ts` | Lane routing, manifest preflight, change → suites | `scripts/regression/*`, `scripts/knowledge/bl-fresh.ts` |
| `monitoring/queries/*.kql` | App Insights probes | `/qa-monitoring`, `/qa-regression` Step 5.5, `/qa-smoke`, `/qa-test` triage |
| `agents/monitor-triage-agent.md` | Triage taxonomy for an App Insights signature | `/qa-test` triage, `/qa-monitoring` |
| `tsconfig.json` | Typecheck for `ci/lib`, `scripts/**` and `regression/**` TypeScript | `unit-tests.yml`, the post-edit typecheck hook |

The App Insights query helper moved to `scripts/lib/appinsights.ts` (suites 094 and 118 use it).

The folder name stays because `scripts/` imports `ci/lib/` by path. Moving the library is a separate change.
