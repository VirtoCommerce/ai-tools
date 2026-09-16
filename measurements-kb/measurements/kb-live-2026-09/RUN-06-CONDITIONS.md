# Run 06 — conditions

Brief: `RUN-BRIEF-unprompted.md`. Task: `TASK-run-06.md`.

## The one thing this run is for

**The base has never been read on ground where it has coordinates and no experience.** That sounds
like every run so far and is not. Runs 01–03 worked fresh territory when the corpus was thin and
retrieval was pre-fix; runs 04 and 05 worked ground where seven and then nineteen experiential
entries already sat. Nobody has yet watched an agent work a subject the derived plane covers
completely and the experiential plane does not cover at all.

That is the exact shape of the conclusion two blind graders and run 05 reached independently:

> The derived plane answers *what is it called*, not *how does it work*. Every `ANSWERED` row is a
> literal lookup or an entry a previous run wrote.

It has been inferred from grades of old lists. It has never been put to a run on purpose. Wishlists
are the cleanest place to put it — 21 operations, `WishlistType`, `InputCreateWishlistType` with a
`scope` field documented as *"List scope (private or organization)"* and a `sharingKey` documented
as *"Sharing key (URL argument)"*, and **not one experiential entry anywhere near them.**

The contract names every coordinate the task turns on and says nothing whatever about what any of
them does.

## What changed since run 05

| | |
|---|---|
| `b389323` | the relevance floor went from one exact content term to `min(3, terms in the question)` |
| `7895ef7` · `1dd6270` | `kb validate` and `kb capture` now name anchors nothing can raise |

**The floor is the thing to read this run against.** Five of the 23 replayed rows changed and none
lost the entry that served it, but a replay only says that a list changed. Run 05 gave us the
subjective form of the defect in its own words — *"asked what a maintainer can do, served what the
states are"* — so there is now something to compare a report against. If run 06's misses still feel
like that, the floor did not reach it.

Retrieval is otherwise unchanged, and the loop, the arrival hook and the three protections are
exactly as run 05 had them.

## Three anchors are wrong in the base, and are being left wrong

`kb validate` now says so, and nothing has been corrected:

| anchor | what the contract has |
|---|---|
| `Mutations.deleteOrganizationContact` (KB-FA724D31) | `Mutations.deleteContact` |
| `Promotion.isActive` (KB-35A09C64) | `Promotion.description`, `.id`, `.name`, `.type` |
| `GET /api/platform/security/users/id` (KB-4A8606CA) | `GET /api/platform/security/users/id/{id}` |

Two of the three are somebody's guess at what a button called. Correcting a guess with my own guess
is how an observation becomes an assertion, and I have not seen any of those screens. The third is a
spelling fix against this base's own contract — and there is no verb for that: `supersede` mints a
new id, and another entry cites this one by the id it would destroy.

**Nothing in the brief or the task mentions any of this.** The run is not being sent to fix them.
If it happens to touch one, what it does is a finding; if it never goes near them, that is the
honest outcome of a defect that lives in territory this task does not visit.

## A note on what "no experiential coverage" costs

The run will probably get less from the base than runs 04 and 05 did, and that is the measurement,
not a failure of the task. The number that matters is not how often the base helped — it is
**whether the derived plane's coordinates were worth having at all** when no previous observation
existed. A run that says *"the base told me the field is called `scope` and nothing else, and that
saved me ten minutes of introspection"* has answered the question. So has one that says the
coordinates were noise.

## MEASUREMENT — unchanged, after an attempt to change it failed

The run shares `MEASUREMENT/` with the authoring session, whose hook recreates its log on every
tool call, so nothing can leave that folder empty from inside it. Two ground-truth logs make
`resolveSession` refuse to guess, by design, and the task therefore tells the run to put
`VC_MEASURE_SESSION` on every `kb` call. Exactly as run 05 was told, and run 05 complied 25 times
out of 25 — it worked out on its own that a shell `export` does not survive between tool calls.

**I tried to remove that instruction and could not.** Recorded because the attempt looked obviously
correct and is worth nobody repeating:

> Give each session its own directory. `settings.json` names this as the alternative to
> `VC_MEASURE_SESSION`, and `log-row.mjs` says in as many words that with a per-run
> `VC_MEASURE_OUT` "exactly one candidate exists by construction". Override it in
> `settings.local.json`, which is read at session start, so the authoring session keeps the value
> it started with and the new run picks up the new one.

The premise is false. **The `env` block is re-read on every hook invocation, not captured at session
start**, so the authoring session followed the new value within one tool call and promptly filed its
own logs in the run's folder. The two sessions cannot be separated by a setting they both read.

The instruction stays because the door cannot learn on its own which session it belongs to: it is a
child process of a shell, and the session id it would need lives in the harness. The one thing that
might close it is `CLAUDE_CODE_HOST_SESSION_ID` — genuinely per-session, and inherited by tool
children — but it is a *different* identifier from the transcript id the logs are named by, so the
hook would have to record both and the resolver match on it. That is a change to the log format, and
making it on the morning of a run is how a measurement gets broken by the instrument meant to
protect it. **Left for after run 06**, named here so it is not re-derived from scratch.

The instruction being in the task is belt and braces, not the mechanism: the door prints the same
refusal, naming the fix, on the first `kb` call that hits it. Run 05 read it there and complied
before the task's line mattered.

## What to read afterwards

1. Touches, largest silence, touches in the middle 60% — a third reading of the number runs 04 and
   05 made a finding.
2. **Every question the run asked, and what it was served.** These become new replay rows: the 23
   that exist are all from runs 01–03, and the floor was tuned on them. Rows from a run that never
   saw the old configuration are the only honest check on it.
3. Did the base's coordinates save any time, or cost it? In the run's own words.
