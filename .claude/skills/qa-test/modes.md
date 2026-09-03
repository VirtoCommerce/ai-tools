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

1. **PASS / PASS WITH NOTES** → exit the loop → the **exit round's close-out** (5e in full → 5f → 5h → 5g,
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
   - **Probe the build, then re-read the board (`5k.0`):** record this round's own probed
     `GET {{BACK_URL}}/api/platform/modules` value, then fetch the ticket's sub-tasks and linked bugs and
     verify each fix-ready one **before** re-running anything (§Round entry). The order is not cosmetic:
     the transition gate at round entry is evaluated against the probed build.
   - **Re-test (round N+1):** re-run **only the previously-FAILED cases (C1 / RED→GREEN)** at Step 4
     against the redeployed env, then Steps 5a–5c again (the full verdict gate; on FULL the independent
     verifier re-ratifies, 1 round) — and **then** the round's **C2**, re-scoped to the fix's diff, at 5r
     (§The two tracks of round N+1). The order matters to the loop specifically: the round verdict is what
     decides whether there IS another round, so paying for a suite sweep before that decision buys an
     answer to a question already settled.
4. **Cap reached** — still FAIL after `--max-rounds` rounds → **STOP** with a per-round summary (what each
   round fixed, what still fails — read off `summary.json.iterations.per_round[]`, never narrated from
   memory) and hand to a human. **STOP at the cap is a success, not a failure.**

**Below-floor findings are outside the loop.** `/qa-fix` needs a filed ticket, and 5d does not file a `Low`,
so 5k only ever fixes what 5d filed.

The loop's brakes: a hard **round cap**, a **confirm on every prerelease deploy**, a **G0 BAIL → STOP**, and
the invariant that **merge + release are always the human's**. `/qa-test` still never merges and never
ships.

**Without `--iterate`, none of 5k runs** — the pointer close-out in
[`reporting.md`](reporting.md) §5f is the whole story.

### What each durable step does per round — the loop's other half

The re-test enumeration above says what re-**runs**; it says nothing about what re-**persists**, and
everything durable in Step 5 sits outside it. Read literally, round 2 files no bug (so the next round's
`/qa-fix` has no ticket to pick up), writes no verdict into the committed checklist, and never reaches
promotion. This table is the rest of the contract.

| Step | Runs | Because |
|---|---|---|
| `1e` Test Model | **ONCE** (round 1), **amended** per round | The model is a fault model of the FEATURE. A fix changes which hypotheses are live, not what the feature can be wrong about — so append a `## Round N` amendment to the **same** file (§Artifact refresh between rounds), never re-derive, and never a second dated file. |
| Step `3x` discovery lane | **ONCE** (round 1) | Its charter is derived from the fault model's own unknowns, and the model is amended rather than re-derived between rounds — so a round-2 session would explore a surface whose unknowns have not moved, on a build that only differs by the fix. The round's own re-test is what interrogates the fix ([`exploratory-lane.md`](exploratory-lane.md) §9). |
| Step 4's in-testing hop | **ONCE** (round 1) | The ticket does not leave in-testing inside the loop — 5f is at exit — so every later round already satisfies the precondition. If round 1 skipped the hop (no such transition, tracker unconfigured), the **exit** round does it before 5f, exactly as [`reporting.md`](reporting.md) §5f already says. |
| **`5k.0` round entry** | **PER ROUND (≥2)** — a baseline read only on round 1 | The board is the source of truth for what this run filed and for what has since been fixed, and it **moves between rounds without the loop being told**: a human merges and deploys a sub-task fix, a developer links a new bug. Verification is a full inline `/qa-verify-fix` per fix-ready bug, which is also the only way a bug with **no covering case** — every bug a FAST round files — can be verified at all (§Round entry). Its own hops are recorded in `status_transitions[]` against the BUG key, never the ticket. |
| `5a` · `5b` · `5c` | **PER ROUND** | Already in the enumeration: the verdict gate is what decides whether there is another round. On FULL the 5b verifier re-ratifies **once per round** (one REJECT→fix→re-verify round each). |
| `5d` file bugs | **PER ROUND**, new findings only | `/qa-fix` needs a filed ticket, so a round that files nothing cannot fix anything and the loop dead-ends at its own precondition. A finding this run already filed is **CARRIED**, not re-filed (§Three carve-outs). |
| `5r` release regression (C2) | **PER ROUND**, after that round's 5c | The round's fix changes what a sweep would find, so a single sweep at exit would describe only the last build — and the loop's own decision (is there another round?) comes from 5c, which is why C2 sits after it rather than before. Re-scoped to the FIX's diff each round (§The two tracks of round N+1). Its RUN_ID lands in `iterations.per_round[].regression.c2`; only the FINAL round's feeds 5e.1. |
| `5e.1` Feature Release Gate | **AT LOOP EXIT** | There is one release, so there is one recommendation. A FAIL round is an automatic NO-GO the loop has *already acted on* by starting another round; ratifying per round emits N−1 recommendations about builds that no longer exist. |
| `5e.2` tracker comment | **PER ROUND** — a **round delta** in rounds 1…N−1, the **full template once**, at exit | The full template every round buries the ticket under near-identical comments. Nothing at all leaves a prerelease deployed to the shared test env with no trace on the ticket. The delta is the minimum that keeps a human able to see the env moved, and why. |
| `5e.3` persist `summary.json` | **PER ROUND** (rewritten in place; the round appended to `iterations.per_round[]`) | The loop can STOP at any round — G0 BAIL, BLOCKED, the cap, a dropped session — and a history persisted only on a clean exit is missing exactly when it is needed. It is also the only artifact that can support the cap-reached hand-off's per-round claims. |
| `5e.4` `testing-checklist.md` | **PER ROUND**, **append-only** | On FAST it is the run's ONLY durable record, and the RED→GREEN transition *is* the loop's deliverable: overwriting a round-1 FAIL with a round-2 PASS deletes the evidence that the defect was ever there. |
| Evidence screenshots | **PER ROUND**, round-stamped | Round N+1 re-runs the same case IDs into the same folder, so an unstamped `{TC-ID}-FAIL-{description}.png` lets the round-2 PASS **overwrite the round-1 FAIL** — and the checklist row that cites it then points at a green image. Every round stamps `-r{N}`, round 1 included (`.claude/rules/reports.md` §7). |
| `5f` tracker transition | **AT LOOP EXIT** | REOPEN is the human-handoff signal, and a loop about to start another round is not handing off. A per-round REOPEN would also flap the ticket out of in-testing — the precondition both closing transitions need — and fire N−1 false handoff notifications. **Bug-level hops follow the same rule, with one exception:** a bug verified green on a **merged and deployed** fix hops to `TESTED` at round entry — that is monotonic, no later round can un-merge it — while a bug still failing keeps its in-testing state and takes its `REOPEN` at exit (§Which hop a verified bug takes). |
| `5h` documentation | **AT LOOP EXIT, ONCE** | The loop only ever re-tests an **unmerged prerelease**. Documenting a build that the next round replaces publishes instructions for something nobody can use yet, and a per-round comment buries the ticket under near-identical guides. One documentation comment per run, whatever the round count — same reasoning as `5f`. |
| `5g` promotion | **AT LOOP EXIT, ONCE** | `tc:promote` reads `Draft` and writes `Automated`, **never a re-promotion** (`scripts/test-cases/promote-cases.ts`), so a round-1 promotion is irreversible and grounds `{OBSERVED}` in the build that was WRONG. Only the last round's evidence describes the code a human is being asked to ship. |

#### Round entry (`5k.0`) — re-read the board before re-running anything

The loop's carried and fixed bug sets used to come from the run's own memory of what 5d filed, and its
RED→GREEN set from the previously-failed cases. Both are claims about the **tracker**, derived from
something that is not the tracker — the same failure the cap-reached hand-off rule already names one level
up (*read off `summary.json`, never narrated from memory*). Three things the loop could not see: a
sub-task a **human** fixed, merged and deployed between rounds (re-tested as *still failing*, or never
re-verified at all); a bug a developer **linked** to the ticket mid-run; and any bug with **no covering
case** — which is *every* bug a FAST round files, because a FAST finding comes off a checklist item and
carries no case id, so nothing in `red_green` can ever speak for it.

So each round **≥2** opens by reading the tracker, in this order — **after** the deploy and **after** the
build probe, because the transition gate below is evaluated against the probed build:

1. **Fetch the bug universe from the board.** The ticket's **sub-tasks** (where 5d files every IN-SCOPE
   bug) *and* its **linked / related issues** (Jira: the issue links + `getJiraIssueRemoteIssueLinks`;
   Azure Boards: the work item's `Child` / `Related` links). This set — not the run's memory — is what the
   round reasons about; a key present here and absent from `bugs_filed` is a mid-run arrival, and saying so
   is the point.
2. **Classify each by status role, resolved live**, exactly as `1a` does — `fix-ready` / `not-fixed` /
   `testable` ([`ticket-routing.md`](../../knowledge/execution/ticket-routing.md)). Only a **`fix-ready`**
   bug is verified: a `not-fixed` one has no fix to prove RED→GREEN against, so it stays **CARRIED** with
   no verification pass — the same fail-safe `1a` applies to a `fix-ready` Bug with no repro basis. A bug
   already at a terminal QA state (`TESTED`, or closed by a human) is **skipped as done**, which is what
   makes this step idempotent across rounds.
3. **Verify each fix-ready bug by running `/qa-verify-fix <bug-key>` inline** — its Steps 0–7 as written,
   the same inline execution `1a` uses for the `verify-fix` flow. Deliberately **not** an inference off the
   C1 result: a bug with no covering case cannot be verified that way at all, and a case going green proves
   *that case's assertion*, not the bug's own STR. Dispatch them **concurrently inside the max-3 browser
   cap**, on distinct lanes, and **never firefox** for a click-driven repro
   ([`.claude/rules/agents.md`](../../rules/agents.md)). Each writes its own category-6 artifacts under
   `reports/tickets/<Sprint>/<BUG-KEY>/`, so the round's per-bug evidence is a file rather than a claim.
4. **Then — and only then — re-run the round's failed scope**: C1 / the failed checklist items (item 3 of
   the enumeration above). A bug just verified VERIFIED does **not** drop its cases from C1: verify-fix
   proves the STR, and C1 is what produces the canonical `RUN_ID` that 5g's promotion refuses to work
   without (PR-013).

**Round 1 reads the same set and verifies nothing.** It has no prior round's filings and no redeploy, so
there is nothing of the loop's own to verify — but recording the set as the loop's **baseline** is what
makes a round-2 delta computable and a mid-run fix by someone else *attributable* instead of a surprise.
One tracker read, inside a step already holding the tracker open.

##### Which hop a verified bug takes — and the single gate on it

`TESTED` is the furthest anything QA runs may move
([`ticket-status-transitions.md`](../../knowledge/execution/ticket-status-transitions.md) §9 rule 5: never
`Done`, never `Cancelled`, never `Closed`, in any flow, on any tracker). Inside the loop exactly **one**
row of `/qa-verify-fix`'s own decision matrix takes its hop:

| Round-entry verdict | Hop on the BUG | Also |
|---|---|---|
| **VERIFIED** / **VERIFIED WITH NOTES**, and the fix is **merged AND present in this round's probed build** | → **`TESTED`** (ask first — the closing-hop confirmation rule applies to a bug exactly as it does to the ticket) | the local report moves `open/<severity>/` → `fixed/` **flat**, with its `## Resolution` block (`.claude/rules/reports.md` §1); recorded in `round_entry[]` **and** `bugs_fixed` |
| **VERIFIED**, but green only on the loop's own **unmerged prerelease** | **none** | comment only. Nothing has shipped, so `TESTED` would publish a QA verdict on a build nobody can obtain |
| merge state or build state **UNKNOWN** | **none** | fail safe — the same discipline `build.deployed` UNKNOWN already follows: a guess here closes a bug against a build that may never have landed |
| `FIX_INCOMPLETE` · `INTERMITTENT` · `NEW_REGRESSION` · `BLOCKED` | **none — deferred to loop exit** | stays **CARRIED**; one comment naming the round it is still failing at and that the loop is re-fixing it |

**The merged-AND-deployed gate is the whole rule.** The ban on transitioning a green carried bug was never
about the bug — it was about the **build**: the loop re-tests an *unmerged prerelease*, so nothing has
shipped and no QA state on that bug is honest. Once the fix is merged and the round's probed build carries
it, that reason is gone and `TESTED` is exactly right. Read it off evidence, never off intent: the bug's
fix PR is **`MERGED`**, **and** the owning component's version in `per_round[].build.deployed` is a release
rather than the loop's own `/qa-deploy-pr` prerelease blob for that PR. Either half unproven ⇒ `UNKNOWN` ⇒
no hop, and say which half.

**Verify-fix's opening hop on the bug is allowed; its closing hops are not.** On Jira `TESTED` is reachable
only from the in-testing status, so the inline run makes that (reversible, unconfirmed) move on the bug as
it always does. Taking its `REOPEN` hop mid-loop would flap the bug *out* of in-testing every round and
fire N−1 false handoff notifications — §5's reasoning for the ticket under test, applied to its sub-tasks.
A bug the loop therefore leaves in in-testing is the **BLOCKED shape** — in-testing plus a comment saying
why nobody is closing it — and it gets its honest closing hop at **loop exit**: still failing ⇒ `REOPEN`
with the failure list, which is the moment the loop actually hands off. Every such hop and skip appends to
`status_transitions[]` with the bug key, like any other (§8 of that file).

**And `/qa-verify-fix`'s own matrix stops at `TESTED` too.** Its all-pass row used to read
`TESTED (Finish test) → DONE (Move to Done)`, which no run may do — corrected in place; the standing
`feedback_verify_fix_stops_at_tested` guidance was already the operative rule.

#### The exit round

**The exit round behaves exactly like a close-out without the flag.** Whatever ends the loop — PASS, the
cap, a G0 BAIL, BLOCKED — the final round runs 5e in full (gate ratification · the full comment ·
`summary.json` · the checklist), then 5f, then 5h, then 5g. **A `--iterate` run posts ONE QA-Complete comment and
makes ONE transition on the ticket under test**, the same as a run without it, whatever the round count.

**5f at exit also closes out the bugs the loop left open.** Every bug round entry moved into in-testing and
did not hop (still failing, or green only on a prerelease) gets its honest closing hop **here**, where the
loop is actually handing off: still failing ⇒ `REOPEN` with the failure list; green on an unmerged
prerelease ⇒ **no hop**, and the comment says *green on prerelease `<PR>`, awaiting merge* — the same
verdict-shaped rule 5f applies to the ticket, one level down. Each is recorded in `status_transitions[]`
against the bug key, hops and skips alike.

#### Three carve-outs

**A bug this run already filed is CARRIED — not re-filed, and not PRE-EXISTING.** 5a item 6's dedup *will*
match it (it is in `reports/bugs/` and on the tracker), and the PRE-EXISTING row then says "link, don't
re-file, **don't fail this ticket**" — wrong twice over: the bug is this ticket's own Sub-task, and it is
still failing. So a finding whose dedup match is a bug **this run filed in an earlier round** takes a third
provenance, **CARRIED**: it keeps its original IN-SCOPE provenance and its original severity (so it still
fails 5c this round), files nothing, and gets **one** comment on its existing Sub-task naming the round it
is still failing at. Recorded in `iterations.per_round[].bugs_carried`. Severity still never moves (5a
item 5).

**A carried bug that goes GREEN is recorded and commented, and transitioned only when the fix has actually
shipped to the env.** Its Sub-task gets `fixed in the round-N prerelease (<PR>) — cases <IDs> green
(<RUN_ID>)`, and the round records it in `bugs_fixed`. It never reaches `Done` or `Cancelled` — forbidden to
`/qa-test` at any round (§5f) — and while it is green only on the loop's **unmerged prerelease** it does not
reach `TESTED` either: nothing has shipped, so the only honest state is "green on a prerelease, awaiting
merge", and the human who merges closes it. **The one case that does hop is a fix that got merged AND is
present in this round's probed build** — round entry verifies it with an inline `/qa-verify-fix` and moves
it to `TESTED` (§Which hop a verified bug takes). A green carried bug also stops failing 5c from that round
on; that is the whole point.

**Below-floor findings stay outside the loop, per round.** 5d does not file a `Low` in round 2 either, so
5k still only ever fixes what 5d filed — and the round-delta comment carries the same mandatory
`Not filed` accounting in one line, `None` when there are none.

#### The two tracks of round N+1, in this order

**These ARE C1 and C2** ([`authoring.md`](authoring.md) §Artifact C) — the loop reached this split first,
for the same reason Step 4 and 5r now apply it to round 1: the ticket verdict is the priority, the two runs
answer different questions, and both draw on the max-3-browser cap.

1. **C1 / RED→GREEN** — exactly the previously-FAILED case IDs, as its own
   `/qa-regression <suites> --ids <IDs>` run. Its pass rate answers **one** question — did the fix turn red
   green — and keeping it out of the C2 run is what stops the release gate's ≥80% floor from blending two
   questions into one number. **FAST:** the failed **checklist items**, run by the one execution agent; no
   `RUN_ID`, no `--ids`.
2. **C2, re-scoped to the FIX's diff, and run AFTER the round's verdict** (5r, same as round 1) —
   `npm run regression:select -- --repo <name> --diff <fix-PR range> --target 40 --json`, then
   `--cases critical --also-ids <this run's new Draft ids>`. Round 1's selection was computed from the
   *ticket's* diff and cannot know what the fix touched. Running it after the round verdict is what lets the
   loop decide whether there IS another round without first paying for a suite sweep — the round cap is the
   expensive resource here, and spending a C2 to learn a round failed is spending it on a question already
   answered.

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
Round entry: [N] sub-tasks + [N] linked bugs read; verified [keys|None] → TESTED [keys|None] (merged+deployed); carried [keys|None].
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
not a round. The 10-clause gate re-fires **only on the amendment's new rows**, inline, no verifier.

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
`outcome` stay as the loop-level counters, and each round's `round_entry[]` records one row per bug the
board handed it — key, source (`subtask`/`linked`), status role, the inline verify-fix verdict, and the hop
taken or the reason none was (a bug read and skipped as already-terminal is a row, not an absence: an empty
`round_entry` on a round ≥2 means the board was never read). The invariant is
`per_round.length === rounds`. Round 1's own
verdict, counts and `regression.run_id` survive **only** there: every other field in `summary.json` is
single-valued and carries the **latest** round's value, so never reconstruct an earlier round from the top
level.
