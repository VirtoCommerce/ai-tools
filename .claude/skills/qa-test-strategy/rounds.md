# Rounds — re-testing after a FAIL (D6, D7)

## What a round is

A **round** is one QA verdict on one deployed build of the ticket's PRs. A re-run on the **same** build
amends the current round; a **new** build starts the next one — and gets a new tracker comment
([`../../rules/reports.md`](../../rules/reports.md) §0, rule 5). Rounds count **per ticket, across
stands**: a round on another environment still counts.

**Counting.** A round is any of: a `summary.json` under `reports/tickets/*/<TICKET>/` on any branch
(`git log --all`), a round section in the ticket's `test-strategy.md`, or a QA verdict comment on the
ticket (a "QA Complete" / PASS / FAIL / PASS WITH NOTES heading). Count distinct builds, not comments: two
comments about the same build are one round. Record the rounds found and their builds in the section header.

## At most three (D6)

A fourth round is **refused before any work**: no context waves, no strategy, no browser. The run prints:

- the three verdicts, their builds and dates;
- what failed in each round, and what failed in more than one (the pattern a person needs);
- the escalation: the ticket goes back to the people who own it — the developer, the PO and the QA lead —
  never to another agent round.

Round 3 says in its mission line that it is the last one. Its out-of-scope list is read as the residual
risk of the **ticket**, not of the round, and anything still unresulted at its close goes into the
escalation, not into a carry-over.

## What round N reads from round N−1 (N = 2, 3)

So its strategy is the **delta**, not the ticket again:

| Input | Use |
|---|---|
| last tested commit of each PR | the diff is taken **from it**, not from the PR base |
| verdict and bugs (and their fix commits) | each bug becomes a risk: "fixed, and nothing next to it broke" |
| the previous reconciliation | every unresulted risk carries over automatically |
| PASS rows | a baseline: re-checked only where the code under them changed (via F5's regression) |
| defective cases, stale kb entries | cases → `/qa-test-lifecycle` (the staleness check); kb entries disputed after the check |
| fixtures | checked for survival — a migration or a renamed field can invalidate them; re-seed when in doubt |

The floors apply to the delta. The model and the mind map are amended, never rebuilt.

## Storage — one file per ticket (D7)

`reports/tickets/{SPRINT}/<TICKET>/test-strategy.md` holds one `## Round N` section per round, each with
its own amendments and reconciliation. Round N cites round N−1 by section, not by path. When the sprint
folder changes between rounds, the file moves with the newest round and the older folder keeps a one-line
pointer. Worked example (round 3, written before the round's build was deployed):
`reports/tickets/Sprint26-20/VCST-5884/test-strategy.md` on branch `qa/vcst-5884`.
