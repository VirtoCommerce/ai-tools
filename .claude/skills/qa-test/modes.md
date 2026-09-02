# The two opt-in modes — `--epic` and `--iterate`

Both are thin orchestrations over the same five steps. Neither changes any step's internals, and most runs
use neither — which is why they live here rather than in the command.

---

## `--epic <EPIC-KEY>` — a series of sibling stories

A story is usually one slice whose value only appears in the A→B→C chain, so testing the slices
independently can leave every story green and the Epic broken.

1. **Resolve + order.** Fetch the Epic and its child stories (`getJiraIssue` on the Epic → children). Test
   only the **testable** ones (Done / Ready-for-test / in the deploy under test); note the rest as
   not-yet-testable. **Order by dependency** — the Epic's flow (A creates → B approves → C converts), read
   from the story order / links / the `1a` Epic-context analysis. **State the order chosen.**
2. **Run each story through the normal pipeline, in order** (each keeps its own FAST/FULL routing and its own
   gates), and **carry state forward**: story N's seeded exit state is story N+1's entry precondition — the
   quote `A` created is the one `B` approves. Seed once, cumulatively; don't reset between siblings. A story
   that FAILs or is BLOCKED **halts the chain at that point** — a downstream story that depends on it cannot
   be trusted — so report where it stopped. `--iterate` may be combined to try fixing the failing story
   before continuing.
3. **Cross-story E2E.** After the last story, run the **full Epic journey end-to-end** (A→B→C in one flow) as
   the integration proof — the thing no single-story run covers.
4. **Roll up (5e).** Per-story verdicts **plus an Epic verdict**: all child stories GO + the cross-story E2E
   clean + 0 open P0 across the Epic → the Epic's feature is releasable. Any child at NO-GO, a broken
   cross-story seam, or an open P0 anywhere in the Epic → the Epic is NO-GO (name the blocking story).
   Recommendation only; a human ships. Persist a per-story `summary.json` each, plus an Epic roll-up in
   `summary.json.epic`.

Human gates are unchanged — every per-story gate still fires, and merge/release stay the human's.

**Without `--epic`**, a single ticket still gets its **Epic context** (Step 1a) and integration coverage
against Done siblings — just not the serial multi-story chain.

---

## `--iterate` — the bounded test → fix → re-test loop (Step 5k)

With `--iterate` (default `--max-rounds 2`), a FAIL doesn't stop at the pointer: `/qa-test` drives the
fix-and-retest cycle itself, up to the cap, then hands to a human. **The initial run is round 1.**

**It does not choose the path, and it runs on both.** FAST/FULL is decided at `1a` from ticket type ×
status; `--iterate` only changes the Step-5 close-out. On **FAST** the loop is fully coherent — FAST files
bugs at 5d and runs a change-scoped regression, which is everything 5k needs — and since FAST *is* the
bug-fix / tweak path, it is the likelier place to want the loop. The only FAST differences inside the loop:
round N+1 re-runs the **failed checklist items** (there are no authored cases), and step 3's verifier
re-ratification does not fire, exactly as at every other FAST gate.

**Spelling.** `--iterate 2` and `--iterate=2` are read as `--iterate --max-rounds 2`; a bare
`--max-rounds N` implies `--iterate` (a round cap means nothing without the loop). There is no argv parser,
so state the resolution in one line before Step 1 rather than acting on a guess — full table in the
command's §Usage.

Per round, once the 5c verdict is in:

1. **PASS / PASS WITH NOTES** → exit the loop → the **exit round's close-out** (5e in full → 5f → 5g,
   §The exit round) → GO/NO-GO recommendation → **STOP for the human to merge + release** (never
   automated). Done.
2. **BLOCKED** → **STOP.** A fix cannot clear an env/data/dependency blocker. The exit round's close-out
   still runs — a BLOCKED run that persisted nothing is indistinguishable from a run that never happened.
3. **FAIL** → **Fix (auto):** for each **IN-SCOPE** bug 5a judged fixable, run `/qa-fix <ticket-key>`
   (autonomous triage→fix→PR, G0–G7, **never merges**). A bug that G0 BAILs (not-auto-fixable / too-complex /
   multi-repo) → **STOP**, hand that bug to a human; the loop cannot fix it. If no in-scope fixable bug
   remains, fall back to the pointer close-out.
   - **Deploy the prerelease (confirm):** `/qa-deploy-pr <ticket-key>` deploys the fix PR's **prerelease**
     build to the test env — **ask before deploying** (it opens its own gated deploy PR). No merge happens:
     the loop always re-tests an **unmerged prerelease**, so the never-auto-merge triple guard
     (`.claude/rules/quality-gates.md` §2) is never touched.
   - **Re-test (round N+1):** re-run **only the previously-FAILED cases (RED→GREEN) + the change-scoped
     regression (Artifact C)** against the redeployed env — Step 4 re-scoped (§The two tracks of round
     N+1), then Steps 5a–5c again (the full verdict gate; on FULL the independent verifier re-ratifies,
     1 round).
4. **Cap reached** — still FAIL after `--max-rounds` rounds → **STOP** with a per-round summary (what each
   round fixed, what still fails — read off `summary.json.iterations.per_round[]`, never narrated from
   memory) and hand to a human. **STOP at the cap is a success, not a failure.**

**Below-floor findings are outside the loop.** `/qa-fix` needs a filed ticket, and 5d does not file a `Low`,
so 5k only ever fixes what 5d filed.

The loop's brakes: a hard **round cap**, a **confirm on every prerelease deploy**, a **G0 BAIL → STOP**, and
the invariant that **merge + release are always the human's**. `/qa-test` still never merges and never
ships.

**Without `--iterate`, none of 5k runs** — the pointer close-out in
[`close-out.md`](close-out.md) §5f is the whole story.

### What each durable step does per round — the loop's other half

The re-test enumeration above says what re-**runs**; it says nothing about what re-**persists**, and
everything durable in Step 5 sits outside it. Read literally, round 2 files no bug (so the next round's
`/qa-fix` has no ticket to pick up), writes no verdict into the committed checklist, and never reaches
promotion. This table is the rest of the contract.

| Step | Runs | Because |
|---|---|---|
| `1e` Test Model | **ONCE** (round 1), **amended** per round | The model is a fault model of the FEATURE. A fix changes which hypotheses are live, not what the feature can be wrong about — so append a `## Round N` amendment to the **same** file (§Artifact refresh between rounds), never re-derive, and never a second dated file. |
| Step 4's in-testing hop | **ONCE** (round 1) | The ticket does not leave in-testing inside the loop — 5f is at exit — so every later round already satisfies the precondition. If round 1 skipped the hop (no such transition, tracker unconfigured), the **exit** round does it before 5f, exactly as [`close-out.md`](close-out.md) §5f already says. |
| `5a` · `5b` · `5c` | **PER ROUND** | Already in the enumeration: the verdict gate is what decides whether there is another round. On FULL the 5b verifier re-ratifies **once per round** (one REJECT→fix→re-verify round each). |
| `5d` file bugs | **PER ROUND**, new findings only | `/qa-fix` needs a filed ticket, so a round that files nothing cannot fix anything and the loop dead-ends at its own precondition. A finding this run already filed is **CARRIED**, not re-filed (§Three carve-outs). |
| `5e.1` Feature Release Gate | **AT LOOP EXIT** | There is one release, so there is one recommendation. A FAIL round is an automatic NO-GO the loop has *already acted on* by starting another round; ratifying per round emits N−1 recommendations about builds that no longer exist. |
| `5e.2` tracker comment | **PER ROUND** — a **round delta** in rounds 1…N−1, the **full template once**, at exit | The full template every round buries the ticket under near-identical comments. Nothing at all leaves a prerelease deployed to the shared test env with no trace on the ticket. The delta is the minimum that keeps a human able to see the env moved, and why. |
| `5e.3` persist `summary.json` | **PER ROUND** (rewritten in place; the round appended to `iterations.per_round[]`) | The loop can STOP at any round — G0 BAIL, BLOCKED, the cap, a dropped session — and a history persisted only on a clean exit is missing exactly when it is needed. It is also the only artifact that can support the cap-reached hand-off's per-round claims. |
| `5e.4` `testing-checklist.md` | **PER ROUND**, **append-only** | On FAST it is the run's ONLY durable record, and the RED→GREEN transition *is* the loop's deliverable: overwriting a round-1 FAIL with a round-2 PASS deletes the evidence that the defect was ever there. |
| Evidence screenshots | **PER ROUND**, round-stamped | Round N+1 re-runs the same case IDs into the same folder, so an unstamped `{TC-ID}-FAIL-{description}.png` lets the round-2 PASS **overwrite the round-1 FAIL** — and the checklist row that cites it then points at a green image. Every round stamps `-r{N}`, round 1 included (`.claude/rules/reports.md` §7). |
| `5f` tracker transition | **AT LOOP EXIT** | REOPEN is the human-handoff signal, and a loop about to start another round is not handing off. A per-round REOPEN would also flap the ticket out of in-testing — the precondition both closing transitions need — and fire N−1 false handoff notifications. |
| `5g` promotion | **AT LOOP EXIT, ONCE** | `tc:promote` reads `Draft` and writes `Automated`, **never a re-promotion** (`scripts/test-cases/promote-cases.ts`), so a round-1 promotion is irreversible and grounds `{OBSERVED}` in the build that was WRONG. Only the last round's evidence describes the code a human is being asked to ship. |

#### The exit round

**The exit round behaves exactly like a close-out without the flag.** Whatever ends the loop — PASS, the
cap, a G0 BAIL, BLOCKED — the final round runs 5e in full (gate ratification · the full comment ·
`summary.json` · the checklist), then 5f, then 5g. **A `--iterate` run posts ONE QA-Complete comment and
makes ONE transition**, the same as a run without it, whatever the round count.

#### Three carve-outs

**A bug this run already filed is CARRIED — not re-filed, and not PRE-EXISTING.** 5a item 6's dedup *will*
match it (it is in `reports/bugs/` and on the tracker), and the PRE-EXISTING row then says "link, don't
re-file, **don't fail this ticket**" — wrong twice over: the bug is this ticket's own Sub-task, and it is
still failing. So a finding whose dedup match is a bug **this run filed in an earlier round** takes a third
provenance, **CARRIED**: it keeps its original IN-SCOPE provenance and its original severity (so it still
fails 5c this round), files nothing, and gets **one** comment on its existing Sub-task naming the round it
is still failing at. Recorded in `iterations.per_round[].bugs_carried`. Severity still never moves (5a
item 5).

**A carried bug that goes GREEN is recorded and commented, and deliberately not transitioned.** Its
Sub-task gets `fixed in the round-N prerelease (<PR>) — cases <IDs> green (<RUN_ID>)`, and the round records
it in `bugs_fixed`. It does **not** reach Done or Cancelled — forbidden to `/qa-test` at any round (§5f) —
and it does not even reach TESTED, because the loop re-tests an **unmerged prerelease**: nothing has
shipped, so the only honest state is "green on a prerelease, awaiting merge". The human who merges closes
it. A green carried bug also stops failing 5c from that round on; that is the whole point.

**Below-floor findings stay outside the loop, per round.** 5d does not file a `Low` in round 2 either, so
5k still only ever fixes what 5d filed — and the round-delta comment carries the same mandatory
`Not filed` accounting in one line, `None` when there are none.

#### The two tracks of round N+1, in this order

Same order Step 4 already uses, for the same reason (the ticket verdict is the priority, and both draw on
the max-3-browser cap):

1. **RED→GREEN** — exactly the previously-FAILED case IDs, as its own
   `/qa-regression <suites> --ids <IDs>` run. Its pass rate answers **one** question — did the fix turn red
   green — and keeping it out of the Artifact-C run is what stops the release gate's ≥95% from blending two
   questions into one number. **FAST:** the failed **checklist items**, run by the one execution agent; no
   `RUN_ID`, no `--ids`.
2. **Artifact C, re-scoped to the FIX's diff** —
   `npm run regression:select -- --repo <name> --diff <fix-PR range> --target 40 --json`, then
   `--cases critical --also-ids <this run's new Draft ids>`. Round 1's selection was computed from the
   *ticket's* diff and cannot know what the fix touched.

**Both are real `/qa-regression` runs, never ad-hoc agent executions**, precisely so each produces a
canonical `RUN_ID`: `tc:promote` refuses a run that is not `completed` (PR-013) and the loop must never
reach for `--allow-incomplete`.

**Probe the round's build, don't assume it.** `/qa-deploy-pr --verify` is advisory by its own contract, so
the round records its own probed `GET {{BACK_URL}}/api/platform/modules` value in
`per_round[].build.deployed`. The loop's entire claim is that the code changed between rounds; unprobed,
that claim is unfalsifiable and a "still failing" round may be a deploy that never landed.

#### 5g at loop exit: promote per run, per case

A case's promotable evidence lives in the run that **executed** it: a case re-run in the final round is
green in the RED→GREEN run; a case untouched since round 1 is green only in round 1's Artifact-C run. So
run the promoter once per `RUN_ID`, each scoped to exactly the ids whose evidence that run carries:

```bash
npm run tc:promote -- <final RED-GREEN RUN_ID> --ids <re-run ids>            --stamp <ticket-key>
npm run tc:promote -- <final Artifact-C RUN_ID> --ids <ids only it executed> --stamp <ticket-key>
npm run tc:promote -- <round-1 RUN_ID>          --ids <ids no later run ran> --stamp <ticket-key>
```

Without `--ids` each invocation considers every `Draft` row in the suite and holds most of them with
PR-002 (absent from the run) — true, but it buries the handful of real decisions and makes "not executed
here" indistinguishable from "refused". `--suite` cannot express this: the same suite holds both sets.
Expect a **PR-014 warning** on any invocation keyed to an earlier run once the loop has authored a case
mid-loop (the CSV is then newer than that run) — **name it in the report and do not pass
`--strict-mtime`**, which would refuse the whole suite.

#### The round-delta comment (rounds 1…N−1)

```
QA re-test — round N of M. Prerelease: <fix PR> deployed to {ENV} (<module> <version>, probed).
RED-GREEN: [X] previously-failed cases re-run — [green]/[still red] (<RUN_ID>).
Change-scoped regression (re-scoped to the fix): [suite IDs] — [pass rate] (<RUN_ID>).
Round verdict: [verdict]. Bugs: filed [keys|None] · still failing [keys|None] · green this round [keys|None].
Not filed (below severity floor): [N] Low, or None.
Next: [round N+1 | STOP — cap reached | STOP — G0 BAIL on <key> | exit to the Feature Release Gate].
```

Markdown, outcome-first, evidence referenced not inlined — the same discipline as the full 5e comment.

### Artifact refresh between rounds

**Test Model — one file, amended; never a second dated file.** The path stays
`reports/ba/test-models/<TICKET>-<date>.md` with `<date>` = **round 1's** date (the run's `date` field). A
same-day round 2 would collide on that exact path, and a `-r2` sibling is worse than a collision: the model
is durable partly because the next ticket on that surface **reuses** it, and two files for one fault model
means the reuse picks one at random. The 80–160-line band is per model, not per round; an amendment is 5–15
lines. An amendment may do exactly three things — mark a hypothesis **CONFIRMED** with its filed bug key,
mark one **CLEARED-by-fix** with the round it went green, and **add rows for mechanisms the FIX's diff
introduces** (a fix is a change, and it earns the same fault-model treatment the original change got; this
is the loop's one genuinely new coverage obligation). It may **not** rewrite Part 0: the value chain does
not change because a bug was fixed, and if it would, the fix changed the mechanism and that is a new ticket,
not a round. The 9-clause gate re-fires **only on the amendment's new rows**, inline, no verifier.

**Authored cases (Artifact A) — never re-author, sometimes add.** Do **not** re-run Step 3 for round-1
rows: re-running `tc:scaffold` with round 1's `--id-block` makes the appender reject every row on ID
collision, and re-running `tc:alloc` first yields a fresh block, so the same logical rows land under new
IDs and the appender's only content dedup (exact `Title`+`Section` against the target suite) will not catch
a reworded title — silent duplication in permanent coverage. A **loop-confirmed defect does earn a new
case**, and it is the best-grounded row the KEEP gate ever sees: `plausible:` accepts a filed bug, and a
defect this run filed *and then watched go green* is that ground at full strength. Author it through the
normal path with a **fresh `tc:alloc` block**. But **prefer amending first** — grep the target suite for
the defect's observable; if an existing case covers the mechanism and asserted the wrong thing, the correct
move is `/qa-review-tests file <suite> --fix` on that row, not a new row. And author it **before** the round
that will execute it: a case authored after the final round is `Draft` with no evidence anywhere (PR-002 at
5g, held forever) — if that happens, record it in `promotion.blocked` with exactly that reason rather than
leaving it silently unpromoted.

**Evidence — round-stamped, never overwritten.** Screenshots go to the ticket folder as
`{TC-ID}-FAIL-r{N}-{description}.png` on every round including the first, because the round-2 re-run
targets the same case IDs and would otherwise replace the RED frame the checklist transition cites.
Naming rule: `.claude/rules/reports.md` §7.

**Checklist (Artifact B) — append-only, one section per round.** Round 1 writes the item table with
verdicts, as today. Round N **appends** `## Round N — re-test (<probed version>, prerelease <PR>)`
containing only the re-run items, each as a transition — `Round 1: FAIL → Round N: PASS` — plus the round's
still-failing items and any below-floor finding. **Never edit a round-1 verdict cell in place**: the
RED→GREEN transition is the loop's deliverable, overwriting the RED erases the proof, and on FAST there is
no other durable record of it. Keep each round section ≤15 lines; if a run would exceed the 120-line cap,
cut per-item prose, never the round sections.

### What the loop records

Every round appends one entry to `summary.json.iterations.per_round[]` (schema:
[`qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json)) — `rounds`, `max_rounds` and
`outcome` stay as the loop-level counters. The invariant is `per_round.length === rounds`. Round 1's own
verdict, counts and `regression.run_id` survive **only** there: every other field in `summary.json` is
single-valued and carries the **latest** round's value, so never reconstruct an earlier round from the top
level.
