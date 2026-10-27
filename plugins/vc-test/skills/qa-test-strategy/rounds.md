# Rounds — re-testing after a FAIL (D6, D7)

## What a round is

A **round** is one QA verdict on one deployed build of the ticket's PRs. A re-run on the **same** build
amends the current round; a **new** build starts the next one — and gets a new tracker comment
([`reports.md`](../../../../.claude/rules/reports.md) §0, rule 5). Rounds count **per ticket, across
stands**: a round on another environment still counts.

**Counting.** A round is any of: a `summary.json` in a run folder of the ticket
(`npm run --silent run:dir -- --ticket <TICKET> --prior`: every env, wherever `QA_OUTPUT_DIR` puts them) or
under `reports/tickets/*/<TICKET>/` on any branch (`git log --all`), a round section in the ticket's `test-strategy.md`, or a QA verdict comment on the
ticket (a "QA Complete" / PASS / FAIL / PASS WITH NOTES heading), read from the `/vc-test:ticket-context` bundle's
`signals[]` — never from a tracker fetch of this skill's own. Count distinct builds, not comments: two
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

From round 2, `floors.mjs` still reads the whole PR diff in the bundle, so the floors err upward: the delta narrows the risks, never the floors. The model and the mind map are amended, never rebuilt.

## Storage — one file per ticket (D7)

`{RUN_DIR}/test-strategy.md` holds one `## Round N` section per round, each with
its own amendments and reconciliation. Round N cites round N−1 by section, not by path. When the run
folder changes between rounds (a new sprint, another env), the file moves with the newest round and the older folder keeps a one-line
pointer. Shape: [`template.md`](template.md).

## Round N in vc-test — scripts, not prose (P2-2)

Under vc-test each step above is a script over machine records; prose is never parsed (B3).

- **The record.** `rounds.mjs close` ends a round: `<RUN_DIR>/rounds/round-<N>.json` (build per PR, verdict, the
  bugs of `verdict.json`, the unresulted risks) and a copy of the round's bundle beside it, which round N+1 diffs the
  acceptance text against (the bundle itself is swept after 24 h). Every path in it is relative to the output root.
  It also archives the round into `<RUN_DIR>/rounds/round-<N>/`: the row files and `testing-checklist.md` move there,
  `verdict.md` and `verdict.json` are copied, so round N+1 in the same folder starts from none of round N's rows.
- **The delta.** `ticket-context prepare <KEY> --since <round record>` reads only what changed: each PR `unchanged`,
  `changed` (diffed from the recorded sha; a force-push reads the whole PR diff) or `new`, the comments posted after
  the round closed, whether the description or AC text changed, and the status of the round's out-of-scope bugs.
  `rounds.mjs delta` turns it into `delta.json`: the PRs, which analysts run (TICKET on a new comment or a changed AC,
  CHANGE per changed or new PR), the round recounted with the new comments as signals (a fourth round still STOPs).
- **The same build STOPs (P3).** No PR changed and none is new ⇒ round N−1 already tested this build; nothing runs.
  Amending a closed round stays manual (D7).
- **Prior bugs come from every round.** Each in-scope bug of every earlier record, once (by tracker key — a bug still
  failing is carried by the next record with its `priorBug` and original key), is a `PB-n` row of `### Prior bugs`
  and its own risk: "fixed, and nothing next to it broke", at its severity, re-run from its `.spec` or its package.
- **Out-of-scope bugs are listed, not re-run (B2).** The delta reports their tracker status; Out of scope names them.
- **The section is appended without asking (U15).** `rounds.mjs append` writes `## Round N` — the carried risks, the
  prior-bug risks and rows, round N−1's Artifacts — and leaves one `TBD — strategy agent` line per part the strategy
  agent writes (mission, inputs, data, out of scope, criteria, the floors). Round N−1's text is never touched; the gate's
  clause 14 fails while a `TBD` remains or a prior bug's risk sits below its severity.
