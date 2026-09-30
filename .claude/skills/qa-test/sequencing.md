# `/qa-test` sequencing — what may move, and what may run in parallel

Moved verbatim from [`SKILL.md`](SKILL.md) on 2026-09-28 (BUDGET-004). Read it before changing the step
order, or before batching or parallelising a step.

## Ordering — what may move, and the three things that may not

Restructured 2026-09-10 to cut time-to-first-test. The command carries the order; this is why it is that
order. Full record, including what the first design got wrong:
[`docs/decisions/qa-test-evolution.md`](../../../docs/decisions/qa-test-evolution.md) §Cutting
time-to-first-test.

**The graph, not the step numbers, decides what can move.** The checklist execution consumes exactly two
things — Artifact B and seeded data. It consumed **neither Artifact A nor the Step-3 verifier**, and yet
waited behind both. Removing that wait is most of the restructure; it is a re-reading, not an invention.

**Three things stay ahead of the checklist, and none of them is negotiable for speed:**

| Ahead of `B` | Because |
|---|---|
| **`1e` the Test Model** | a checklist written against an unnamed value chain produces per-screen field checks that are individually well-formed and collectively unable to notice the feature is broken — [`SKILL.md`](SKILL.md) §The two things, item 1, and the Loyalty Missions numbers behind it |
| **`3x` discovery** | its fifth routed output is *conditions the ACs never named*. A checklist written before it is written from the ACs and a guess; written after, every item has been **seen** or deliberately left a hypothesis. It also means the checklist does not need re-running when the model corrects itself |
| **`3a` seeded data** | a checklist cannot execute against fixtures that do not resolve. `3a` is browserless, so it runs *beside* `3x` for free — serialising it behind discovery would add the whole box and buy nothing |

**`3x` is itself a live read of the product** — *"nothing touches the feature until Step 4"* has not been
true here for some time: the browser is on it at `1r`, and in depth from `3x`.

**What moved: `A`, and only in the sense of what waits for it.** Authoring is the largest pre-execution
cost — alloc, the journey case, matrix assignment, per-layer packs, a 3–4-way fan-out, serial appends,
review. It still starts when `3x` closes and still waits for both `3a` and `3x` (§Concurrency, the
never-parallelise table). **What changed is that nothing waits for it to FINISH except `4c`** — which is
why the join back to it is an explicit step, not an assumption ([`qa-test.md`](../../commands/qa-test.md)
Step 4).

**An early checklist was tried first and rejected** — why: [`decisions`](../../../docs/decisions/qa-test-evolution.md) §Cutting time-to-first-test.

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

Total deterministic script time across a whole FULL run is well under a minute. So **squeezing script
wall-clock is not where the time is** — parallelising 2d's pair saves 1.8 s, and that is close to the
ceiling for this kind of win. Two things actually cost:

1. **Round-trips.** A numbered list of independent operations, walked one tool call per turn, spends a
   full model turn per item. `1b` has **seven** independent probes/reads; done one at a time that is
   seven turns to accomplish ~3 s of work. Batching them into one message is worth far more than every
   script optimisation in the table above, combined.
2. **Agent dispatches and regression runs**, which are minutes to tens of minutes each. The two largest
   structural wins in the pipeline are both about *what a long-running job overlaps*, not about making it
   faster: **3x runs inside 3a's wall-clock** (one browser lane against a browserless seeder), **the corpus
   step runs past `3-exec`** (its `2a` phase included), and the release-scoped Critical sweep is **no longer in this
   pipeline at all** — it was on the critical path to a verdict that discarded its result by its own
   provenance rules, so `5r`/C2 was removed (2026-09-10); cutting a release runs
   [`/qa-regression`](../../commands/qa-regression.md) deliberately.

   The pipeline already parallelises what it can — `1c ‖ 1d ‖ 2-load` in one message, the `3x ‖ 3a` pair,
   Step 3b one batch per execution surface, Step 4's agents inside the max-3 cap. That work is done; do
   not re-derive it.

**So the rule is: independent operations go out in ONE message; dependent ones state what they consume.**
This is the harness's own guidance applied per step, not a new mechanism.

### `1b` is two I/O waves, not nine steps

| Wave | Contains | Consumes |
|---|---|---|
| **A** — one message | item 1 env health · item 2 build/version (both GitHub reads + the `/api/platform/modules` probe) · item 2-release release-ledger read · item 2b's local reads (suite manifest, repo-router) · item 3 sprint resolve → item 4 duplicate check | only `1a`'s fetch |
| *(no I/O)* | derive **2b** `layer`, then **2c** `visual_surface` and **2e** `coverage_surface` — pure computation over what Wave A returned | Wave A |
| **B** — one message | **2d**'s two refreshers, concurrently ([`contract-refresh.md`](contract-refresh.md) §2) · **2e**'s `npm run tc:scope`, **scope + risk terms ONLY** ([`coverage-triage.md`](coverage-triage.md) §4) | `2b`'s token |

**Wave B's scan takes no `--cases`/`--also-ids`** — neither exists yet, and passing them would mark every
future Draft row `FILTERED_OUT`, the failure the `2a` phase exists to prevent (§4). Wave B **scans only** —
disposing those hits is Artifact A's `2a` phase at Step 3, same agent, before it authors a row (§2a-own).

Two more waves follow the same test, and both were serial for no reason anyone had measured:

| Wave | Contains | Consumes |
|---|---|---|
| **Step 1c/1d + 2-load** — one message | `1c` ‖ `1d` ‖ **`1r` reachability** (FULL, ~5 min) ‖ **`1c-map`** (only when 2g says `ABSENT` + all-layer, FULL) ‖ **the domain-keyed oracle text** (`BL-*` / `ECL-*` / `E2E-*` / `VC-*` / the UI + a11y set) | only `1a`'s domains + `1b`'s tokens — **nothing `1c` returns**, which is why waiting a full dispatch wave to open a markdown file was pure latency. `1c-map` is domain-scoped where `1c` is ticket-scoped: they share prior art and consume nothing of each other's, so the map costs the run a lane, not a wave. Only `2-topup` (the VirtoOZ gap fill) is genuinely downstream |
| **Step 3** — one message | `3a` test-data ‖ **`3x` discovery** ‖ `B` checklist | `1e` + Step 2. `3a` is browserless, `3x` takes exactly one lane, `B` is pure authoring — mutually independent. **Artifact A alone waits on all three** |

Items 3 → 4 stay ordered inside Wave A as the command states. They are both local globs costing
milliseconds, so splitting them buys nothing — **and that is the general test: parallelise where the
operations are independent *and* the cost is real.** Reordering something free to look concurrent is
churn.

### What must NOT be parallelised — each for a reason the repo paid for

Do not read the above as "parallelise everything." Every entry here is a place where concurrency has a
known cost, and three were measured:

| Never | Because |
|---|---|
| `2d` concurrently with `1c` / `1d` / `1e` / the 3b pack | they READ what it writes; a refresh that races its readers is a refresh that did nothing |
| Two writers on one suite CSV — the Step-3b append stays **serial**, `suites:sync` runs **once**, and the `2a` **`REPAIR` writes close before the same step's append opens** ([`coverage-triage.md`](coverage-triage.md) §2a-own) | `suites:lint`/`sync` hard-fail on a parse error anywhere in the corpus, so N parallel writers multiply a tree-wide outage by N and block every other author ([`regression.md` Suite inventory](../../rules/regression.md#suite-inventory) — measured: one mid-write invalid CSV blocked two sessions' gates ~15 min) |
| `suites:sync` ‖ `suites:lint` | lint reads what sync wrote |
| Artifact A ‖ 3a, or Artifact A ‖ 3x | cases are authored against fixtures that already resolve **and against the model 3x amended**. Authoring beside the discovery lane produces cases written from the guesses the lane exists to replace — the lane's value is entirely in the order ([`exploratory-lane.md`](exploratory-lane.md) §2) |
| `3x` ‖ Step 4's execution agents | **Artifact B is written from what `3x` returns** (2026-09-10) and `3-exec` gates on `B`, so execution cannot start while the lane is open — the cap still holds by construction on FULL. What changed is that `3x` now **outranks** execution in the priority order ([`qa-test.md`](../../commands/qa-test.md) Step 4): it is upstream of both `B` and `A`, so starving it stalls the whole run rather than one track |
| Two suites ‖ on one disposable fixture set | **measured**: `075d` lost 5 of 34 cases to fixtures suite `083d` had already consumed on the same accounts. Serialise with a re-seed between, or give each its own accounts (`.claude/knowledge/execution/test-data-authoring.md` §The scope of "isolated") |
| More than 3 browser agents, or two agents on one session | the lane cap is hard, and a shared session means agents fighting over navigation and cookies |
| `1c-map` ‖ `1c` **on the same lane** | both are `ba-system-analyzer` and `.claude/rules/agents.md` puts that agent on `playwright-firefox` — so the concurrency is fine and the *default lane* is not. Two instances of one agent definition inherit one lane unless told otherwise, which is a shared session by accident — pin `1c-map` to a different free lane **in its brief** |
| A verifier ‖ its own doer | the verifier re-derives evidence *after* the doer's write; concurrent, it verifies a half-finished step. The verifier gates are sequential by design |
| `--iterate` rounds | test → fix → deploy → re-test is inherently serial |
