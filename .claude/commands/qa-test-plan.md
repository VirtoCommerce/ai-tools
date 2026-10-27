---
description: "Plan any regression: a SPRINT test plan (Jira Done items + merged PRs → risk → suites → charters, written to docs/Sprint plans/) or a STABLE-BUNDLE regression (bundles/v{N-1} → vN diff → classified scope → waves by priority tier × domain that several QA run in parallel, written to regression/releases/stable-N/). Plans only — the run is /qa-run (sprint or stable:N wave by wave); a sprint plan also runs on /qa-regression sprint."
argument-hint: "SprintXX-YY | XX-YY | current | last | stable <N> [--ref <branch>] [--env <TEST_ENV>] [--ticket <KEY>] [--update]"
disable-model-invocation: true
---

# /qa-test-plan — Plan a regression (sprint or stable bundle)

One command plans every regression; [`/qa-run`](qa-run.md) runs what it plans (a sprint plan also runs on `/qa-regression sprint`). Pick the mode from the argument, read that
mode's file **whole**, and follow it. Both modes share the sections in
[`plan-sections.md`](../knowledge/execution/test-plan/plan-sections.md) (risk, the specialist delegation, the checklist
gap-diff, exploratory charters, the rules).

## Usage

```
/qa-test-plan Sprint26-20            # sprint plan (also 26-20, current, last; --no-jira, --frontend, --from/--to, --draft, --no-suites, --no-sitemap)
/qa-test-plan stable 17              # stable-bundle regression: bundles/v16 → v17
/qa-test-plan stable 17 --ref feat/VCST-7000-stable-17-bundle --ticket VCST-7000
/qa-test-plan stable 17 --update     # the bundle moved after a hotfix; re-scope, keep wave state
```

| Argument | Mode | Read and follow | Writes | Run it with |
|---|---|---|---|---|
| `SprintXX-YY`, `XX-YY`, `current`, `last` | sprint | [`sprint-mode.md`](../knowledge/execution/test-plan/sprint-mode.md) | `docs/Sprint plans/sprint-{XX-YY}-test-plan.md` + `-summary.json` | `/qa-run sprint` · `/qa-exploratory sprint` |
| `stable <N>` | stable | [`stable-mode.md`](../knowledge/execution/test-plan/stable-mode.md) | `regression/releases/stable-<N>/` (plan, scope, waves, ledger) | `/qa-run stable:<N> <wave> --claim` |

An argument that is neither a sprint label nor `stable <N>`: ask the user which they mean, never guess.

## What the two modes have in common

- **Scope is derived, never invented:** every suite id exists in `config/test-suites.json`; every number comes from a
  script (`regression:plan`, `release:diff`, `suites:filter`), never transcribed.
- **Risk is scored per domain** and decides the order of execution and where exploratory charters go.
- **The plan is written for someone else to run** — a sprint plan for `/qa-run sprint`, a stable plan for
  several owners claiming waves in parallel ([`release-folder.md`](../skills/qa-run/release-folder.md)).
- **Plans only.** No suite runs, nothing is seeded, no env setting changes; outward-facing writes (a PR, tracker
  sub-tasks) only on the user's yes.
- **Delegation** to `test-management-specialist` follows [`../templates/agent-dispatch.md`](../templates/agent-dispatch.md).
