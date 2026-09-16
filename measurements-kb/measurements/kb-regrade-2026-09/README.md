# kb-regrade-2026-09 — the outside check, finally run

Everything anyone knows about the quality of this base was decided by a party with an interest in
the answer:

| what | who judged it |
|---|---|
| 26 question rows — did the base answer? | **the run that asked**, in its own `held` column |
| 19 entries — mechanism or fixture, worth the next agent's time? | **the run that wrote it** |
| "all mechanisms, no fixtures" | **the author of the tooling**, reading the reports |

This is the independent reviewer's cheapest falsifier, proposed at the start of the rebuild and
still unrun. It asks one thing: does a party with no stake reach the same conclusions?

## How to run it

**1. Build the packet.**

```
node measurements/kb-regrade-2026-09/build-packet.mjs
```

Writes `packet/` — 26 blinded question rows, the 19 captured entries, and the 37 entries those rows
cite — and `truth.json` beside it, which is the answer key and **does not go in the packet**.

**2. Put the packet somewhere neither repository can be reached from.**

```powershell
Copy-Item -Recurse C:/_VIRTO/vc-kb-lab/measurements/kb-regrade-2026-09/packet C:/_VIRTO/_regrade
Copy-Item C:/_VIRTO/vc-kb-lab/measurements/kb-regrade-2026-09/GRADER-BRIEF.md C:/_VIRTO/_regrade
```

This is the whole blinding mechanism, and it replaces the plan this page originally carried.

The earlier plan was to run the grader in `vc-kb-lab` with `vendor/agent-log/memory-guard.mjs`
parking the project-memory entries that leak. That works, but it enforces the blinding by asking —
and the material to avoid is a `git log` away. Running from a directory outside both repositories
enforces it by construction instead: no `git log` whose commit messages state the author's
conclusions about exactly this material, no run reports, no measurement write-ups, no
`MEASUREMENT-archive/`, and — since Claude Code keys project memory to the working directory — none
of this project's memory either, with nothing to park and nothing to restore.

`memory-guard.mjs` remains the fallback if you would rather grade in place. Park at least
`agents-front-load-the-base` and `storefront-signin-vcptcore-stable`: the first states the
conclusions about run behaviour, the second holds platform facts that overlap what is being graded.
Park no more than that — over-removal takes away the ordinary knowledge a real reader would have
and quietly changes what is being measured.

**3. Start a session in that directory and give it one instruction.**

```
Read GRADER-BRIEF.md and do what it says.
```

Nothing else. Do not describe the material, do not say what you expect, and do not answer questions
about how it was made — if the grader asks, tell it to grade what is in front of it and note the
gap in its report.

**4. Score it.**

```
Copy-Item C:/_VIRTO/_regrade/verdicts.json C:/_VIRTO/vc-kb-lab/measurements/kb-regrade-2026-09/
node measurements/kb-regrade-2026-09/score.mjs
```

## What the score does and does not settle

It compares Part A against what the runs said about themselves. The two scales are not identical
and the script does not pretend they are: `held` is what the run *did* with the answer, the grader
was asked whether the base *answered*. They line up at the ends. `NOT-USED` lines up with nothing
and is reported as unscorable rather than forced.

Part B has no counterpart at all. Nobody has ever graded those entries but the agents that wrote
them, so there is nothing to compare against — and that absence is itself the finding the exercise
exists to remove.

Where the two disagree, the script names the row and stops. It does not decide who is right: the run
knew what it was trying to do, the grader read the entry cold as the next agent will, and both of
those are real advantages.

## What would make this worthless

**Agreement without per-item work.** A grader that returns "this all looks good" cannot be told
apart from one that did not look, so the brief demands a verdict per row and says that a report
without one is worse than no report.

**A grader that read the answer.** `verdicts.json` carries `sawSomethingIShouldNotHave`, and the
score script leads with it when set. Self-reported, which is weak — hence step 2, which is not.

And the standing limitation, worth saying plainly: **this is Claude grading Claude.** Shared priors,
shared blind spots, and no substitute for a human reviewer. The thing that makes it worth an hour is
that the original reviewer was also a session, and it found the defect that caused this entire
rebuild.

---

# Result — the first outside check, and the defect it exposed in this harness

Run 2026-09-12, from `C:/_VIRTO/_regrade`, blinded by location. The grader reported
`sawSomethingIShouldNotHave: false` and its scoping note is consistent with the packet it was given.

## Part A: it disagrees, and always in the same direction

| | |
|---|---|
| agree | 9 |
| disagree | **14** |
| not scorable (`NOT-USED`) | 3 |

Every one of the fourteen runs the same way: the run wrote `HELD`, the grader says `PARTLY`. Not
one goes the other way. A disagreement with no counter-examples is either a real bias or a
difference in what the two were asked, and both turned out to be present.

## Six of the fourteen are this harness's fault

The first packet copied **today's** entry files to explain what was served **in the past**, and the
derived plane has been regenerated four times since run 01.

Run 01 asked `Mutations.addItem InputAddItemType` and recorded the full field list as its answer.
The grader read today's `gql-mutations-additem`, found a pointer to the type's own entry instead of
a field table, and marked the row `PARTLY`. Both were right about different artifacts: the entry
run 01 was served was **5677 bytes and inlined the whole table**; the type restructure the next day
cut it to **1202** and moved that table into `gql-type-inputadditemtype`.

`build-packet.mjs` now resolves every cited entry at the commit that was HEAD when that run started,
and names the exact per-run file in Part A. Rebuilt, **18 of 47 cited entries differ from their
current version** — so this was not one stale file, it was a third of the evidence.

Suspect on those grounds: `r01.1`, `r01.2`, `r01.3`, `r01.5`, `r01.7`, `r03.2`. They need a re-grade
against the corrected packet before anyone counts them.

## Eight stand, and they are the finding

For these the grader read **byte-identical** text to what the run read, and still reached a
different verdict: `r02.1`, `r02.2`, `r02.5`, `r02.8`, `r02.9`, `r03.1`, `r03.3`, `r03.4`.

So on the seventeen rows where the comparison is valid: **nine agree, eight disagree, and all eight
say the run marked itself HELD on an answer that only pointed at the neighbourhood.** The grader's
rule — "naming the right operation without saying what it does is PARTLY" — is the one the runs
were not applying to themselves.

That is exactly the bias this exercise was built to detect, and it is the first evidence that
"the base answered 23 of 26" was ever generous.

## Part B: the entries hold up, with one real contradiction

18 of 19 `MECHANISM`, 17 `TRANSFERABLE`, 19 of 19 with the right refutation channel and not one
reaching for `practice`. The instruction in `kb capture --help` is landing.

The finding that earns the exercise: **`KB-27B4CD10` and `KB-4D082C89` contradict each other**,
written nine minutes apart by the same run. The first says a never-completed invitee has account
status `PendingApproval`, contact status `Approved`, and renders `Active`. The second says a real
pending invitee has an **empty** account status, contact status `Invited`, and renders `Invited`.

Run 04's own report has it right — it worked out mid-task that "Invited User" was a registered
account awaiting approval and not a pending invitation at all. It then wrote the correct entry and
never went back to the earlier one.

**No gate could catch this.** The fingerprint check compares coordinates and scope, and these two
differ in both; nothing compares claims. And the door has no verb for it: `dispute` is framed as
contradicting *someone else*, `retire --superseded-by` is heavy, and an agent that learns more
mid-run has no natural way to correct what it wrote twenty minutes earlier. That absence is the
thing to fix, not just this pair.

Settling the pair itself takes one re-observation, and it should be a run's, not mine: I have not
seen the invitee state and would be recording someone else's observation as my own.
