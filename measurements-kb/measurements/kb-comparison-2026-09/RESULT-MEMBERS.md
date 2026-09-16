# Round three — a three-way tie at the ceiling, and a password hash nobody was looking for

Predictions sealed before the first arm at **`sha256:829b3d2a1538db96`**. Verify:
`node measurements/kb-live-2026-09/preregister.mjs verify <file> 829b3d2a1538db96`.
Graded once, after every arm had run, against `ORACLE-MEMBERS.md`.

## The score

| item | B (QA repo) | A (nothing) | C (the base) |
|---|---|---|---|
| 1 Blocked User cannot sign in | 1.0 | 1.0 | 1.0 |
| 2 David Kim can | 1.0 | 1.0 | 1.0 |
| 3 Emily Johnson can | 1.0 | 1.0 | 1.0 |
| 4 the Operator can | 1.0 | 1.0 | 1.0 |
| 5 Invited User cannot, and NOT because of a lock | 1.0 | 1.0 | 1.0 |
| 6 the Active column reports contact status | 1.0 | 1.0 | 1.0 |
| 7 one field is not enough | 1.0 | 1.0 | 1.0 |
| | **7.0** | **7.0** | **7.0** |

| | B | A | C |
|---|---|---|---|
| logged calls | 100 | 97 | **84** |
| wall clock | 14m38s | **11m26s** | 13m21s |
| `raw.githubusercontent.com` | 0 | 0 | 0 |
| VirtoOZ source-MCP calls | 4 | 7 | 6 |
| base consultations | — | — | **2 questions, 0 MISS** |

**Nobody missed anything. Nobody took a penalty. The trap did not fire on any arm.** Three rounds,
three null results on the score — and this is the cleanest of them, because the task was built
specifically around what the corpus covers and the arms still finished level.

## The thing that is not on the scoreboard

**A real password hash was readable, and all three arms read it.**

`GET /api/platform/security/users/{userName}` strips the hash — arm B found the reason in source:
`ReduceUserDetails` blanks it unless `ReturnPasswordHash` is set. **`GET /api/members/{id}` does
not strip it.** Arm C noticed and said so plainly: the invited account's `passwordHash` is set,
84 characters, readable over the members API.

So two arms reasoned about a field they believed was unreadable, and the third read it.

**Seventeen saved artefacts across all three arms carried a live ASP.NET Identity hash.** They have
been redacted in place and verified gone; nothing reached the lab, the corpus or any repository.
This is a defect I introduced by designing a task that walks agents onto `/api/members/{id}`, and it
is worth a bug of its own: two endpoints on one platform disagree about whether a password hash is
a secret.

## What the base did, and it is the same shape as round two

Arm C asked **two questions** and took **no MISS**:

1. *"What does the Active status column on the storefront Company Members page report?"* →
   `KB-27B4CD10`, `KB-4B889114`, `KB-FA724D31` — the direct hits, first call of the run.
2. *"Does PendingApproval or emailConfirmed false block storefront sign-in?"* → `KB-4D082C89`,
   `KB-27B4CD10`, `KB-DA14E8B7`.

Then it went and checked anyway — and **checked better than either other arm**. Arms A and B read
`Members.vue` from master. Arm C downloaded the **deployed** bundle, `members-Bw96BnJz.js` from
storefront v2.39.0, extracted the compiled query and the status switch out of it, and scoped its
answer to that build — noting that master already selects `isLockedInOrganization` and this build
does not. That is the difference between "the source says" and "your deployment does".

**And it produced the observation that refuted the corpus for the second round running** — a human
wrote the dispute, as below. The dispute note on `KB-4D082C89` states
the invited account "still has passwordHash null". Arm C read it as set and wrote: *"That is wrong on
the current deployment — I read it as set. Direct observation outranks the KB."*

Round two: it refuted `KB-A646D086` with a cross-store control. Round three: it refuted a dispute
note with a second endpoint. **Twice out of two, the arm holding the corpus is the one that produced the observation that
corrected it** — and twice out of two, a human wrote the correction. No arm without a corpus can
produce such an observation, because there is nothing to contradict; but the loop does not close by
itself, and this page originally implied it did.

## The predictions, unsealed

| | prediction | outcome |
|---|---|---|
| P1 | C outscores A by at least 1.5 | **FALSIFIED** — 0.0 |
| P2 | if any arm gets item 5 wrong it is C, because the base hands it `lockedState` | **did not fire** — no arm got it wrong, and C was the most explicit that `lockoutEnd` "would have missed Invited User entirely" |
| P3 | all three establish item 6 | confirmed |
| P4 | at least one arm answers `unknown` at least once | **confirmed** — A on which status field the badge reads, C on the mechanism. First `unknown`s in three rounds |
| P5 | every arm under 3 `raw.githubusercontent.com` calls | **confirmed in letter, falsified in spirit** — 0/0/0 there, 4/7/6 to the VirtoOZ source MCP. I predicted the wrong channel |
| P6 | A spends at least 20% more calls than C | **FALSIFIED** — 97 against 84, 15% |
| P7 | the three arms do NOT fall inside a 25% band | **FALSIFIED** — 84 to 100 is 19% |
| P8 | C asks at least 5 times, at most 1 MISS | **FALSIFIED on asks** — 2. Confirmed on MISS — 0 |
| P9 | C cites at least one entry id | **FALSIFIED** — it referred to "the knowledge base" and cited no id |
| P10 | C is served the disputed `KB-4D082C89` and does not repeat its contradicted specifics | **confirmed** — no trace of "Invite sent", "status Invited" or "Locked state Locked" in its report |
| P11 | no arm writes to the deployment | **confirmed**, checked after each of the three arms against `GROUND-TRUTH.md` |
| P12 | something in the apparatus is found wanting | **confirmed** — P5's channel, the oracle's premise, and the hash leak |

**Six falsified, five confirmed, one that did not fire.**

## Two things I got wrong in the design, stated plainly

**The premise.** `ORACLE-MEMBERS.md` claims "nothing in this task is answerable from backend source
... which fields a Vue page selects in its GraphQL query is emergent behaviour of a deployment."
Three arms falsified it in under fifteen minutes each. `Members.vue` is public, the deployed bundle
is downloadable, and the answer to the central item was in both.

**The channel.** I wrote P5 about `raw.githubusercontent.com` because that is what rounds one and two
used. A machine-level source MCP was available to every session the whole time and I did not think of
it. The prediction is technically confirmed and measures nothing.

## What goes on the demo page

1. **The corpus was corrected twice, because it was wrong out loud and an arm noticed.** Round two:
   an entry's mechanism disproved by a cross-store control. Round three: a dispute note's claim
   disproved by a second endpoint. Producing that observation is the only capability in three rounds
   that belongs to the arm with the base and to no other arm — **but the arm never wrote anything.**
   A human wrote every dispute and every supersede. Say it that way or not at all.
2. **7.0 / 7.0 / 7.0, published as a tie**, alongside round one's 194/211/232 and round two's
   7.5/7.5/8.0. Three rounds, three null results on capability. Anyone who asks "does it make the
   agent better at the task" gets: measured three times, no.
3. **Arm B has never once opened the QA repository** — three rounds, including this one, where a
   partial answer key sat in `test-data/`.
4. **The password hash.** Found because three agents were pointed at the same deployment and one of
   them read a field the other two believed was redacted.


---

# CORRECTION, 2026-09-16 — four defects found by the independent review

The review commissioned on 2026-09-15 (`measurements/REVIEW-BRIEF.md`) returned four instrument
defects. All four were verified against the logs before being accepted. Two of them correct claims
this project made and repeated.

**D1 — a recorded arm folder was still being written to.** `vc-mcp-testing-module`'s
`settings.local.json` still pointed `VC_MEASURE_OUT` at `round3/arm-B` after round three, so the
reviewer's own session logged 30 calls into arm B's folder; its first line is
`cat REVIEW-BRIEF.md`. The restore step existed in `RUNNING.md` and was not run — and the backup it
names was itself taken from an already-instrumented file, so running it would not have helped.
**Fixed:** the repository now logs to `C:/_VIRTO/_agent-logs/`, the stray log is quarantined in
`round3/CONTAMINATION/` as evidence rather than deleted, and `preflight.mjs` now fails when any
working directory other than the current arm's points `VC_MEASURE_OUT` at an arm folder.

**D2 — round one's central qualitative claim was false.** The completed arm C was never served
`KB-A646D086`; it was served to the aborted attempt. The completed arm called the zero field a
"REST-internal inconsistency" and wrote that the two figures "should equal" — the same false coupling
the entry carried. **`RESULT.md` is corrected in place and its headline withdrawn.** The
`KB-A646D086` story belongs to round two, where it is true and logged.

**D3 — "the corpus corrected itself" was never true.** Across every arm kb-log in all three rounds:
19 `ask`, 4 `how`, and **zero** writing verbs. An arm produced each observation; a human wrote each
dispute and supersede, minutes later. Corrected on this page and on `RESULT-EXPLAIN.md`.

**D4 — the MISS contract drifts as the corpus grows.** A question that returned an honest MISS in
round one now returns adjacent entries; `kb how "cancel an order"` returns the order-placement flow.
Not yet fixed; it belongs with the retrieval work.

**The pattern, for the third time:** every one of these is a check that existed or could have existed
and was not run, and none was found by the person who built the instrument. The review was worth
more than the round it reviewed.
