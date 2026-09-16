# Run 05 — conditions

Brief: `RUN-BRIEF-unprompted.md`. Task: `TASK-run-05.md`.

## The two things this run is for

**1. Does the base help on ground it actually covers?** Every run so far worked fresh territory —
promotions, discounts, roles, member states — where the base had thin coverage, so what we measured
was what it gives on an empty subject. Run 05 works *next to* run 04, where the corpus holds 19
entries and seven of them are about this exact area. Whether real coverage helps, or misleads, has
never been observed.

**2. Do the three protections built after the blind re-grade get used?** None has been seen by a
live agent:

| | |
|---|---|
| `capture` lists experiential entries already anchored on your coordinates, **before** the write | the near-question check would not have caught run 04's pair — only the coordinate was shared |
| `kb supersede <id>` replaces an entry in one act, keeping the old id and the reason | correcting yourself took two verbs and nobody ever did it |
| `kb demand` and the brief's closing list name `kb consolidate` | that verb found run 04's pair unprompted, and had never been run |

## A defect is being left in the base on purpose

`KB-27B4CD10` is served right now carrying a clause the blind grader showed to be wrong: it
attributes an account status of `PendingApproval` to "the invitation was never completed", while
`KB-4D082C89` — written nine minutes later by the same run — shows a real never-completed invitation
has an **empty** account status and a contact status of `Invited`.

**It is deliberately not being fixed before this run.** Two reasons, and the second is the stronger:

* there would be nothing to test the three protections against, and a mechanism that has never met
  the case it was built for is an assumption;
* fixing it myself means recording someone else's observation as my own. I have not seen the
  invitee state. A run has, and can.

The cost is named rather than hidden: if the run leans on that clause it will lose time. It is
bounded — a test deployment, and a wrong causal attribution rather than a destructive instruction.
If the run does lean on it, that is the finding, and it says the protections are not enough.

**Nothing in the brief or the task says any of this.** Telling a run where to look would make
whatever it found uninterpretable, which is the defect the whole rebuild removed.

## What changed since run 04

`9c7e257` (the three protections), `91eb3ac` (the re-grade packet fix — no effect on a live run).
The corpus grew by seven entries, all from run 04. Retrieval, the loop and the arrival hook are
unchanged since run 04, so run 05 is the first repeat of run 04's conditions rather than another
step.

That matters: run 04's result — base touched fifteen times, nine of them in the middle 60% of the
work, against run 03's zero — is a single observation. Run 05 is what makes it a finding or an
accident.

## MEASUREMENT starts with a stale log in it

The authoring session writes to the same `VC_MEASURE_OUT` on every tool call, so
`MEASUREMENT/tool-log-c842f27b.jsonl` reappears the moment this file is written. Two ground-truth
logs make `resolveSession` refuse to guess — by design — and the run's question rows would silently
stop being written.

The task tells the run to set `VC_MEASURE_SESSION` to the id that is **not** `c842f27b`. That is
the documented way out, named in the refusal text itself. Recorded here as a condition because it
is one: run 05 starts with a directory that is not clean, and it is told so in one line rather than
left to hit it.

## What to read afterwards

The headline number, as for run 04: touches, largest silence, touches in the middle 60%.

Then: did anything get superseded, and did `consolidate` get read? A run that meets the pair and
leaves both served has told us the three protections do not reach far enough — which is a more
useful result than one that quietly worked.
