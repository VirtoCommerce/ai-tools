# The goal contract — goal, done-criterion, budget, stops (step 1), and the verdict (step 7)

The contract is what the person approves at S1, before research is paid for. It is short on purpose: a bad
framing is cheaper to reject here than after an hour of research. It is **not** the acceptance criteria — those
are derived at step 4 ([`derived-acs.md`](derived-acs.md)) and approved at S2.

## The file

`<dir>/in/contract.json` — exactly these four fields (`goal.mjs contract` refuses any other):

```json
{
  "goal": "<one sentence>",
  "done": "<a checkable criterion>",
  "budget": { "tokens": <budget.tokens>, "wallMin": <budget.minutes>, "researchShare": 0.4 },
  "stops": ["<stop 1>", "<stop 2>", "…"]
}
```

`node <plugin>/lib/goal.mjs contract --dir <dir> --file <dir>/in/contract.json`. Any later `contract --file` clears
the approval: the edited contract is not the one that was approved, so S1 is asked again.

## The goal — one sentence, a user-visible outcome

Name **who** can do **what**, and **where** it is observed — not the work item, not the code.

| Not a goal | A goal |
|---|---|
| "Test the MCP server ticket" | "A buyer's AI client, signed in as that buyer, can list and call only the tools the buyer's permissions allow, on the stand's MCP endpoint" |
| "Check the PR" | "An order placed from the storefront by an organisation member shows the member's organisation in the back office order list" |
| "Verify the fix works" | "A product with no price is no longer offered for checkout on the storefront" |

The ticket's own words where they name an outcome; never a client's names, hosts or data beyond what the ticket
itself says. One goal per run: two outcomes that do not share a path are two runs.

## The done-criterion — checkable from the journal

Default, and the floor — a person may add to it, never go under it:

> Every acceptance criterion is PASS or FAIL with evidence in the run folder, or GAP with a reason; every
> Medium-or-worse finding is reproduced twice; the verdict is judged by goal-judge.

It must be decidable from `goal.json` and the files it names, because the judge tests it as written. Words like
"thoroughly", "fully" or "looks good" are not checkable. An addition names something the journal can show
("…and the negative control of every permission criterion is a second account, not a missing token").
"GAPs are acceptable" is said only when the person says it — otherwise a done met by GAPs is not met.

## The budget

- `tokens` and `wallMin` — the budget in force from step 0.6: `run-cost.mjs … --budget qa` prints `budget.tokens`
  and `budget.minutes` (the profile's `test.budget.qa`, else the defaults; `minutes` is `wallMin` here). A person
  may lower either at S1; raising one later is a contract edit and S1 again. `tokens` is a whole number (round
  down); both must be at least 1.
- `researchShare` — the part of the budget research may spend before step 4: **default 0.4**. Research is over
  when a cost reading reaches `researchShare × tokens` or `researchShare × wallMin`
  ([`research-loop.md`](research-loop.md) §Exit).
- `goal.mjs check --before strategy` and `--before verdict` fail when a reading is over the budget; every check
  warns past 80 %. The budget is the profile's measure of one run — it is never stretched silently.

## The stop list

`stops[]` holds these four lines verbatim (a person may add one, never remove one). When one fires, stop, name it,
and ask the person with its options (AskUserQuestion):

1. **"Budget reached — a cost reading is over the tokens or wall minutes of the contract."**
   Options: raise it (a contract edit, then S1 again) · go to step 7 with every open AC set to GAP, reason
   "budget reached" · end the run (the abort close).
2. **"A write would be needed on a stand that is not writable."** (`capabilities.json` `stand.writable` false.)
   Options: the AC becomes GAP, reason "needs a write; `<env>` is read-only (`<stand.reason>`)" · end the run — a
   writable env is a new run, never a switch mid-run.
3. **"Live behaviour contradicts the docs."** Record it at once as a finding whose `docCheck` names the page.
   Options: the build is wrong (the finding stands) · the doc is wrong or outdated (the finding stays, re-titled as a
   documentation finding; the AC's expectation is NOT changed without the person's words, which go in the
   finding's evidence note) · not sure (it stays a finding; the verdict says so).
4. **"Not deployed — ticket-context returned a `NOT DEPLOYED:` blocker."** No option: the verdict is BLOCKED on
   deploy, quoting the blocker line; the abort close.

The three human stops S1, S2, S3 are not in this list: they are steps, not exceptions.

## What S1 shows

One AskUserQuestion: the goal; the done-criterion; the budget as numbers (tokens, wall minutes, research share,
and where they came from — `budget.source`); the stand, writable or read-only with `stand.reason`; the lanes this
session has; the stop list. Options: *Approve* · *Edit* (the person's words) · *Reject*.

## The verdict

`<dir>/verdict.md`, written from `goal.json` alone at step 7, ≤ 60 lines, in the order of
`<plugin>/skills/qa-test-strategy/verdict-rules.md` §Shape with these sections:

```markdown
# <KEY> — <VERDICT>
<one sentence: the goal, the build tested, the deciding fact>

| AC | Source | Result | Evidence |
|---|---|---|---|
| AC-1 <short> | pr:<repo>#<n> | PASS | evidence/<file> |

## Findings
- F-1 <severity> <title> — AC-n · reproduced <n> · in scope | noticed

## Not tested, and why
- AC-n — <gapReason>
- <what research left unknown>

## Data
Created <n> entities on <env> · teardown: <done | nothing to do | for a human: …> · or "none — read-only stand"

## Cost
<the budget: line of the last reading> (this session only, when resumed)

## Context used
Bundle <path> · Journal <dir>/goal.json · kb <read | not read (reason)> · PRs <repo#n list>
```

`## Judge` is appended after step 8, never before. The decision, per `verdict-rules.md` §Decide the verdict, mapped
to this journal (Critical/High stand for its P0/P1):

| Verdict | When |
|---|---|
| **FAIL** | an AC is FAIL or PARTIAL, or an in-scope Critical or High finding |
| **PASS** | every AC PASS, no in-scope Critical or High finding, no GAP |
| **PASS WITH NOTES** | no FAIL/PARTIAL and no in-scope Critical/High, but a GAP or an in-scope Medium/Low finding remains |
| **BLOCKED** | not deployed, every AC GAP, or (at close) a file outside the write zones |

An out-of-scope finding never moves the verdict; it is listed. "Deployment unverified" (a `DEPLOYMENT UNKNOWN:`
blocker) is said in the first sentence, never dropped.
