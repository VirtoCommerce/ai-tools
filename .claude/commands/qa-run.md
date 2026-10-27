---
description: "Run any regression: a one-off selection (smoke, critical, full, suite ids), a sprint plan, or one wave of a stable-bundle regression that several QA run in parallel (claim → known ground → run → triage into the ledger → PR). After every run it triages the failures automatically, and after triage ALWAYS asks whether to put the result in GitHub. Plans come from /qa-test-plan. The successor of /qa-regression, built to move into a plugin."
argument-hint: "smoke | critical | full | <ids> | sprint[:XX-YY] | stable:<N> <wave> [--claim|--continue|--triage|--publish|--handover] | stable:<N> status [--cases <tier>] [--seed=…] [--teardown]"
disable-model-invocation: true
---

# /qa-run — Run any regression

One command runs every regression; `/qa-test-plan` plans it. Read the [`qa-run` skill](../skills/qa-run/SKILL.md),
then the file the argument needs, **whole**.

## Usage

```
/qa-run smoke                            # one-off: the smoke selection
/qa-run 042,078 --cases critical         # one-off: these suites, Critical cases only
/qa-run sprint                           # the latest sprint plan (/qa-test-plan 26-20 writes it)
/qa-run stable:17 status                 # who holds which wave of Stable 17 (/qa-test-plan stable 17 writes the plan)
/qa-run stable:17 C-purchase --claim     # claim one wave and run it
/qa-run stable:17 C-purchase --continue  # pick up a wave someone handed over
```

| Argument | Read | Then |
|---|---|---|
| a selection group, suite ids, `sprint`, `sprint:XX-YY` | [`run.md`](../skills/qa-run/run.md) | run → triage (automatic) → **ask: GitHub?** |
| `stable:<N> <wave> [flag]`, `stable:<N> status` | [`run.md`](../skills/qa-run/run.md) + [`waves.md`](../skills/qa-run/waves.md) | claim → pre-flight → known ground → run → triage into the ledger (automatic) → **ask: file bugs?** → **ask: GitHub?** |
| bare `stable:<N>` | — | refuse; show `npm run release:status -- stable-<N>` (a release runs wave by wave) |

## Rules

- **Triage is not a question:** it starts as soon as a run with FAIL or BLOCKED cases ends. **"Put it in GitHub?" is
  never skipped** after triage — whatever flag resumed the run.
- **Outward-facing writes only on a yes:** tracker assignment, bug filing, push, PR. **Never merge.**
- **Parallel-safe on a shared environment:** own personas, no env-wide changes outside the exclusive wave, no re-seed
  under a running wave ([`release-folder.md`](../skills/qa-run/release-folder.md) §7).
- **Numbers from the run and the scripts**, never from memory or prose.
