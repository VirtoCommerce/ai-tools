---
description: "Plan any regression: a SPRINT test plan (Jira Done items + merged PRs → risk → suites → charters, written to docs/Sprint plans/, then split into waves in regression/releases/sprint-XX-YY/) or a STABLE-BUNDLE regression (bundles/v{N-1} → vN diff → classified scope → waves by priority tier × domain that several QA run in parallel, written to regression/releases/stable-N/). Both are split into waves that several QA claim and run in parallel. Plans only — the run is /qa-run sprint:XX-YY or stable:N, wave by wave."
argument-hint: "SprintXX-YY | XX-YY | current | last | stable <N> [--ref <branch>] [--env <TEST_ENV>] [--ticket <KEY>] [--update] [--no-waves]"
disable-model-invocation: true
---

# /qa-test-plan — Plan a regression (sprint or stable bundle)

One command plans every regression; [`/qa-run`](qa-run.md) runs what it plans, wave by wave (a sprint plan with `--no-waves` runs whole). Pick the mode from the argument, read that
mode's file **whole**, and follow it. Both modes share the sections in
[`plan-sections.md`](../knowledge/execution/test-plan/plan-sections.md) (risk, the specialist delegation, the checklist
gap-diff, exploratory charters, the rules).

## Usage

```
/qa-test-plan Sprint26-20 --ticket VCST-7100   # sprint plan + its waves (also 26-20, current, last; --no-jira, --frontend, --from/--to, --draft, --no-suites, --no-sitemap, --env, --update, --no-waves)
/qa-test-plan stable 17              # stable-bundle regression: bundles/v16 → v17
/qa-test-plan stable 17 --ref feat/VCST-7000-stable-17-bundle --ticket VCST-7000
/qa-test-plan stable 17 --update     # the bundle moved after a hotfix; re-scope, keep wave state
```

| Argument | Mode | Read and follow | Writes | Run it with |
|---|---|---|---|---|
| `SprintXX-YY`, `XX-YY`, `current`, `last` | sprint | [`sprint-mode.md`](../knowledge/execution/test-plan/sprint-mode.md) | `docs/Sprint plans/sprint-{XX-YY}-test-plan.md` + `-summary.json`, and `regression/releases/sprint-{XX-YY}/` (waves) | `/qa-run sprint:<XX-YY> <wave> --claim` · `/qa-exploratory sprint` |
| `stable <N>` | stable | [`stable-mode.md`](../knowledge/execution/test-plan/stable-mode.md) | `regression/releases/stable-<N>/` (plan, scope, waves, ledger) | `/qa-run stable:<N> <wave> --claim` |

An argument that is neither a sprint label nor `stable <N>`: ask the user which they mean, never guess.

## What the two modes have in common

- **Scope is derived, never invented:** every suite id exists in `config/test-suites.json`; every number comes from a
  script (`regression:plan`, `release:diff`, `suites:filter`), never transcribed.
- **Risk is scored per domain** and decides the order of execution and where exploratory charters go.
- **The plan is written for someone else to run** — both modes split it into waves that several owners claim in
  parallel ([`plan-sections.md`](../knowledge/execution/test-plan/plan-sections.md) §Waves,
  [`release-folder.md`](../skills/qa-run/release-folder.md)); a sprint plan with `--no-waves` runs as one person's run.
- **Plans only.** No suite runs, nothing is seeded, no env setting changes; outward-facing writes (a PR, tracker
  sub-tasks) only on the user's yes.
- **Delegation** to `test-management-specialist` follows [`../templates/agent-dispatch.md`](../templates/agent-dispatch.md).
