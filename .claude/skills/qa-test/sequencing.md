# `/qa-test` sequencing — what may move, and what may run in parallel

Read it before changing the stage order, or before batching or parallelising a step.

## Ordering — what may move, and the three things that may not

The command carries the order; this is why it is that order. **The graph, not the stage numbers, decides
what can move**: a step waits only for what it reads.

**Three things stay ahead of the checklist, and none of them is negotiable for speed:**

| Ahead of the checklist | Because |
|---|---|
| **The approved strategy** | the checklist is built FROM it — every item names its `R-n`, and an item no risk reaches is either out of scope or a missed risk. A checklist written first is written from the ACs and a guess |
| **The test model, when a risk is `MODEL`** | a checklist written against an unnamed value chain produces per-screen field checks that are individually well-formed and collectively unable to notice the feature is broken — [`SKILL.md`](SKILL.md) §The two things, item 1 |
| **The contract refresh, when its row is `RUN`** | the model and the checklist READ the schema it writes; a refresh that races its readers did nothing ([`contract-refresh.md`](contract-refresh.md) §4) |

**What may move is the exploratory lane.** The strategy says **first** (a High/Critical risk on a
`{HYPOTHESIS}` oracle, or a new feature) or **alongside** the runners (D3). *First* buys checklist items
that were **seen**, not inferred, at the price of the box before the runners start; *alongside* buys time.
It is the strategy's call, recorded in its row — never the orchestrator's at run time.

**The domain map is joined before the strategy**, not after it: the strategy's Mind map row can only be
`RUN` on a domain's first run if the map exists when the strategy is written.

## Concurrency — the unit to save is a ROUND-TRIP, not a second

Measured on vcst-qa, 2026-09-02, so the optimisation is aimed at the right thing: **every deterministic
script in this pipeline costs 1–2 s except one.**

| Script | Wall clock |
|---|---|
| `schema:refresh` / `schema:check` (live introspection) | **~8.5 s** |
| `graphql:fixtures:validate:refresh` (74 documents) | ~1.8 s |
| `suites:lint` (corpus-wide) | ~1.9 s |
| `td:validate` | ~1.3 s |
| `regression:select` | ~1.2 s |

So **squeezing script wall-clock is not where the time is**. Two things actually cost:

1. **Round-trips.** A numbered list of independent operations, walked one tool call per turn, spends a
   full model turn per item. Batching them into one message is worth more than every script optimisation in
   the table above, combined.
2. **Agent dispatches and regression runs**, which are minutes to tens of minutes each. The wins are about
   *what a long-running job overlaps*, not about making it faster.

**So the rule is: independent operations go out in ONE message; dependent ones state what they consume.**
The flow's messages:

| Message | Contains | Consumes |
|---|---|---|
| **Stage 1** | `/vc-test:ticket-context` ‖ `/qa-domain-map` (only when the map is `ABSENT`/`unresolved`) | Stage 0's slug and kb hits. The map is domain-scoped and the bundle ticket-scoped: neither reads the other |
| **Stage 3** | contract refresh ‖ the staleness check ‖ the test model, then the mind map, then the checklist | the approved strategy. The model reads the refreshed schema; the mind map reads the model; the checklist reads all three |
| **Stage 4** | the runners ‖ exploratory ‖ visual ‖ regression, ≤3 browser lanes | the checklist and the stale list. A lane that does not fit waits for the first to return |

**The general test: parallelise where the operations are independent *and* the cost is real.**
Reordering something free to look concurrent is churn.

### What must NOT be parallelised — each for a reason the repo paid for

| Never | Because |
|---|---|
| The contract refresh concurrently with the model or the checklist | they READ what it writes; a refresh that races its readers is a refresh that did nothing |
| Two suites ‖ on one disposable fixture set | **measured**: `075d` lost 5 of 34 cases to fixtures suite `083d` had already consumed on the same accounts. Serialise with a re-seed between, or give each its own accounts (`.claude/knowledge/execution/test-data-authoring.md` §The scope of "isolated") |
| Two lanes acting as the same account in one message | the pool exists for that ([`execution.md`](execution.md) §Runner brief, *Account*) |
| More than 3 browser agents, or two agents on one session | the lane cap is hard, and a shared session means agents fighting over navigation and cookies |
| `/qa-domain-map` ‖ another `ba-system-analyzer` **on the same lane** | two instances of one agent definition inherit one lane unless told otherwise, which is a shared session by accident — pin the lane **in its brief** |
| `/vc-fix:qa-bug` calls ‖ each other | `qa-bug` may take a browser lane; the calls run sequentially |
| A verifier ‖ the step it checks | the strategy verifier re-derives the gate *after* the draft is written; concurrent, it verifies a half-finished strategy |
| Teardown ‖ triage or `qa-bug` | investigation reproduces on the ledger's entities and `qa-bug` is handed their ids; the ledger closes after the Bugs step |
