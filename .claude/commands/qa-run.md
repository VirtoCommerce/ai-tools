---
description: "Run any regression: a one-off selection (smoke, critical, full, suite ids), or one wave of a sprint or stable-bundle regression that several QA run in parallel (claim → known ground → run → triage into the ledger → PR). After every run it triages the failures automatically, and after triage ALWAYS asks whether to put the result in GitHub. Plans come from /qa-test-plan. The successor of /qa-regression, built to move into a plugin."
argument-hint: "smoke | critical | full | <ids> | sprint:<XX-YY> <wave> | stable:<N> <wave> [--claim|--continue|--triage|--publish|--handover] | sprint:<XX-YY> status | stable:<N> status [--cases <tier>] [--seed=…] [--teardown] [--run-blocked]"
disable-model-invocation: true
---

# /qa-run — Run any regression

One command runs every regression; `/qa-test-plan` plans it. Read the [`qa-run` skill](../skills/qa-run/SKILL.md),
then the file the argument needs, **whole**.

## Usage

```
/qa-run smoke                            # one-off: the smoke selection
/qa-run 042,078 --cases critical         # one-off: these suites, Critical cases only
/qa-run sprint:26-20 status              # who holds which wave of the sprint regression (/qa-test-plan 26-20 writes the plan)
/qa-run sprint:26-20 C-catalog --claim   # claim one wave of it and run it
/qa-run stable:17 status                 # who holds which wave of Stable 17 (/qa-test-plan stable 17 writes the plan)
/qa-run stable:17 C-purchase --claim     # claim one wave and run it
/qa-run stable:17 C-purchase --continue  # pick up a wave someone handed over
/qa-run 036 --run-blocked                # also run the cases the pre-flight predicts will BLOCK
```

Cases the pre-flight predicts will BLOCK (no persona, unseeded fixture, a setting off, a password nobody has) are
recorded BLOCKED with that reason and **not run** — no browser slot, no model tokens, no classifier call
([`preflight`](../skills/preflight/SKILL.md) §build-scoped). `--run-blocked` passes `--run-blocked` to `regression:plan`.

| Argument | Read | Then |
|---|---|---|
| a selection group, suite ids | [`run.md`](../skills/qa-run/run.md) | run → triage (automatic) → **ask: GitHub?** |
| `stable:<N> <wave> [flag]`, `stable:<N> status`, `sprint:<XX-YY> <wave> [flag]`, `sprint:<XX-YY> status` | [`run.md`](../skills/qa-run/run.md) + [`waves.md`](../skills/qa-run/waves.md) | claim → pre-flight → known ground → run → triage into the ledger (automatic) → **ask: file bugs?** → **ask: GitHub?** |
| bare `stable:<N>`; bare `sprint` / `sprint:<XX-YY>` whose plan has a release folder | — | refuse; show `npm run release:status -- <release>` (a release runs wave by wave) |
| bare `sprint` / `sprint:<XX-YY>` whose plan has no release folder (`--no-waves`, or planned before 2026-10-28) | [`run.md`](../skills/qa-run/run.md) | the whole plan as one run → triage → **ask: GitHub?** |

## Rules

- **Triage is not a question:** it starts as soon as a run with FAIL or BLOCKED cases ends. **"Put it in GitHub?" is
  never skipped** after triage — whatever flag resumed the run.
- **Outward-facing writes only on a yes:** tracker assignment, bug filing, push, PR. **Never merge.**
- **Parallel-safe on a shared environment:** own personas, no env-wide changes outside the exclusive wave, no re-seed
  under a running wave ([`release-folder.md`](../skills/qa-run/release-folder.md) §7).
- **Numbers from the run and the scripts**, never from memory or prose.
