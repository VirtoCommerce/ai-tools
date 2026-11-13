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
  may lower either at S1; raising one later is the budget stop's option (a). `tokens` is a whole number (round
  down); both must be at least 1.
- `researchShare` — the part of the budget research may spend before step 4: **default 0.4**. Research is over
  when a cost reading reaches `researchShare × tokens` or `researchShare × wallMin`
  ([`research-loop.md`](research-loop.md) §Exit).
- `goal.mjs check --before strategy` and `--before verdict` fail when a reading is over the budget; every check
  warns past 80 %. The budget is the profile's measure of one run — it is never stretched silently. Because the
  verdict gate enforces it (and the judge runs that gate), **no judged verdict exists past the budget**: over it,
  the only ways on are a raised budget or STOP AT BUDGET (§The stop list, 1).

## The stop list

`stops[]` holds these four lines verbatim (a person may add one, never remove one). When one fires, stop, name it,
and ask the person with its options (AskUserQuestion):

1. **"Budget reached — a cost reading is over the tokens or wall minutes of the contract."** Exactly two options:
   - **(a) Raise it** — the person names the new numbers. Write them into `<dir>/in/contract.json`, then
     `goal.mjs contract --dir <dir> --file <dir>/in/contract.json` (this clears the approval),
     `goal.mjs contract --dir <dir> --approve --who '<who>'`, and
     `goal.mjs checkpoint --dir <dir> --stop S1 --decision approved --who '<who>' --note 'budget raised'`. Re-run
     the gate that fired; carry on where the run was.
   - **(b) STOP AT BUDGET** — the abort close (SKILL.md §Stops): `verdict.md` headed
     `# <KEY> — STOPPED AT BUDGET — not judged`, one line per AC with its recorded state (`open` included) and the
     findings as recorded; then `oauth-code.mjs purge`, `write-zones.mjs check`, `teardown.mjs`, `goal.mjs close`.
     No judge, no knowledge write-back, no S3.
   Never set open ACs to GAP "budget reached" to reach a verdict: a verdict past the budget cannot be judged.
2. **"A write would be needed on a stand that is not writable."** (`capabilities.json` `stand.writable` false, or
   the ledger check of [`derived-acs.md`](derived-acs.md) §Before the first data write failed.)
   Options: the AC becomes GAP, reason "needs a write; `<env>` is read-only (`<stand.reason>` or the ledger check's
   reason)" · end the run (the abort close) — a writable env is a new run, never a switch mid-run.
3. **"Live behaviour contradicts the docs."** Record it at once as a finding whose `docCheck` names the page.
   Options: the build is wrong (the finding stands) · the doc is wrong or outdated (the finding stays, re-titled as a
   documentation finding; the AC's expectation is NOT changed without the person's words, which go in the
   finding's evidence note) · not sure (it stays a finding; the verdict says so).
4. **"Not deployed — ticket-context returned a `NOT DEPLOYED:` blocker."** No option: the verdict is BLOCKED on
   deploy, quoting the blocker line; the abort close.

The three human stops S1, S2, S3 are not in this list: they are steps, not exceptions.

## What S1 shows

One AskUserQuestion: the goal; the done-criterion; the budget as numbers (tokens, wall minutes, research share,
and where they came from — `budget.source`); the stand, writable or read-only with `stand.reason`; **the hosts the
run may touch** — the origins of `BACK_URL` and `FRONT_URL` ([`research-loop.md`](research-loop.md) §The hosts a
run may touch) and every **extra** host of the same stand research expects to need (a separately deployed app, an
MCP endpoint on its own host), each named; the lanes this session has; the stop list. Options: *Approve* · *Edit*
(the person's words) · *Reject*. The approved extra hosts go in the S1 checkpoint's note, host names only
(`[a-z0-9.-]` and an optional `:port`), single-quoted: `--note 'hosts: app.example.test,mcp.example.test'`, or
`--note 'hosts: none'`. A host needed later and not approved here is asked at S2 before it is touched.

## S3 — outward writes (step 9.8)

Each write is proposed on its own and done only on a yes. Its label is unique to it — `bug:F-<n>`, `comment:<n>`
(the n-th comment proposed) — because an approved S3 is never consumed: a reused label would pass on an old
approval.

1. AskUserQuestion with the exact proposal. For an in-scope Medium-or-worse finding: the bug — title, severity,
   evidence paths, `<KEY>` as the link. For the tracker: the comment text, paste-ready, ≤ 15 lines (verdict, the
   criteria table, findings, the judge result, the run id). A status change is never offered (out of scope).
2. **Yes** ⇒ `node <plugin>/lib/goal.mjs checkpoint --dir <dir> --stop S3 --decision approved --who '<who>' --note '<label>'`,
   then `node <plugin>/lib/goal.mjs check --dir <dir> --before write --what '<label>'`. Exit 0 ⇒
   - `bug:F-<n>` — `/vc-fix:qa-bug "<finding title> — evidence: <dir>/evidence/<files>" --link <KEY> --confirmed`
     (the person's yes at step 1 is the `--confirmed`);
   - `comment:<n>` — print the text for the person to paste. You never post it.
   Exit 2 ⇒ write nothing and say why.
3. **No** ⇒ `goal.mjs checkpoint --dir <dir> --stop S3 --decision rejected --who '<who>' --note '<label>'`.

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
blocker) is said in the first sentence, never dropped. A criterion reworded or dropped at S2 is listed under "Not
tested, and why" with its `gapReason`; an `UNCONFIRMED (seen once):` finding is listed under Findings as noticed.
A run that ends without a judged verdict uses an abort-close heading instead (SKILL.md §Stops): only BLOCKED (not
deployed) comes from this table; it never says PASS, PASS WITH NOTES or FAIL.
