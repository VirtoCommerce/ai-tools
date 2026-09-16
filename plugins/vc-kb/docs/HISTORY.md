# How this was built, 10–14 September 2026

This project's git history was rewritten when the repositories were made public, so the 88 commits
that carried the work no longer exist as objects. They were the primary record: this project writes
its reasoning into commit messages, including measurements, reversals and pre-registered
predictions. They are preserved verbatim in `docs/history/` — `lab-commits-2026-09.txt` (55
commits, the workbench) and `base-commits-2026-09.txt` (33 commits, the corpus). **Where this page
and those files disagree, those files are right.** This is a reading of them, not a replacement.

Five days, two repositories, seven measured runs against a live deployment.

---

## What was built

A knowledge base for agents working on Virto Commerce, in two planes that never mix.

The **derived** plane is projected from a running deployment — `GET /docs/{ModuleId}/swagger.json`
per module and GraphQL introspection — and regenerated wholesale. Nothing in it is authored, and
`kb check` regenerates it in memory and byte-compares, so it cannot rot silently. 590 entries.

The **experiential** plane is written by agents through a door (`kb capture`) that enforces a
shape, refuses a fact the base already holds, and records what the writer was shown while they
wrote. It has a lifecycle: confirm, dispute, supersede, retire, reanchor. ~40 entries.

They live in separate directories with separate indexes, because a regenerated corpus that is
byte-gated and a written corpus that grows cannot share a file without one breaking the other's
gate on every change.

---

## The order it happened in

**Day 1 — the projection.** The derived plane extracted, first from a developer laptop, then
re-extracted from a release deployment when it became clear a dev stack's module mix matches no
shipped release. 409 entries became 287. Later, when every named GraphQL type got its own entry
rather than being copied into forty bodies, 287 became 590.

**Day 1 — the door.** Six verbs, and an identity rule that was measured rather than chosen: two
records are the same fact when their normalized anchors and scope axes agree, with the claim's
**wording deliberately excluded**. Over 19 labelled pairs, the wording-similarity range of pairs
that must collapse contained the range of pairs that must not, and one pair stating a single fact
scored 0.00. Coordinates raise the candidate; scope decides.

**Day 1 — the corpus that was thrown away.** 37 facts were seeded into the experiential plane from
earlier measurement rows. Then all of them were cleared. An independent review put it plainly: *"the
base answers 20 of 26"* means *"the seeder's corpus agrees with the seeder's reading of the seeder's
runs 20 of 26 times"*, and no amount of analysis separates those — only a different writer does.
The seeded corpus was tagged as a shadow corpus to compare against, and the plane started again at
zero. **Those tags — `seed-w0.5` and `seed-w0.5-corrected` — did not survive the history rewrite.**
They exist only in the full-history bundle kept outside this repository; nothing here resolves them.

**Days 2–4 — seven live runs.** Each an agent given a brief, a task, and a live deployment; each
writing back what it learned. Promotions, order discounts, organization roles, member state,
invitations, shared lists, order fields.

**Day 3 — the outside check.** 26 question rows blinded and handed to graders outside both
repositories.

**Day 5 — version stamping, and the first flow entry.**

---

## What the runs found, and what they cost

| run | subject | calls | consultations |
|---|---|---|---|
| 01 | promotions | 81 | 9 |
| 02 | order discount | 172 | 8 |
| 03 | organization roles | 319 | 4 |
| 04 | member state | 177 | 3 |
| 05 | invitation lifecycle | 217 | 4 |
| 06 | shared lists | 248 | 6 |
| 07 | order fields | 302 | 6 |

Milestones worth keeping:

* **Run 01** produced the first refusal the door ever gave a writer who was not its author. Four
  captures attempted, one refused on identical anchors and scope; the writer did not walk around it
  by inventing a coordinate.
* **Run 02** produced the base's first two confirmations — the first time anything moved from *one
  agent reported this* to *two runs have seen it*.
* **Run 03** was the first run never told to consult the base. It consulted it unprompted, and took
  its editorial guidance from `kb capture --help` rather than from its brief. It also caught itself
  believing it had found a privilege escalation, by re-reading after a reload; that entry is the one
  that stops the next agent spending the same hour.
* **Run 04** was the first to use the base *while* working rather than at the start. Two
  consultations changed the outcome: one turned *"the API cannot report lock state"* into *"the
  field exists and the page omits it"* — an excuse into a defect — and one stopped the run reporting
  a contact deleted on the strength of an empty search box that a prior entry said was index-backed.
* **Run 05** used every verb, and used `kb supersede` six hours after it existed, with nobody
  telling it the verb was there: it wrote an entry, disproved its own remedy twenty minutes later,
  and replaced it.
* **Run 06** worked ground the contract covers completely and experience did not cover at all, and
  found a `scope` value (`AnyoneAnonymous`) that appears in no doc string in the schema and serves a
  whole list to a caller with no account.
* **Run 07** placed an order with three kinds of product and reconciled every money field. The money
  reconciled exactly; the *payment* did not — `PaymentIn.sum` 172.49 against `PaymentIn.total` 0,
  both rendered on one Admin blade.

---

## The findings that outlived their commit

### Pin the source, not the value

Applied four times, each time after the copy had already drifted.

`RELEASE_LINE=stable-bundle-v14` was a transcription of something with a publisher, in a file that
would never notice it moving. Replaced by pinning the registry URL and *deriving* the
identification: read the registry, follow every bundle, compare against what the deployment reports.

Then one level in: the `latest` pointer's value was being written into a byte-compared artifact, and
`kb check` went red three times in one day for reasons that said nothing about the deployment. A
gate that fires for unrelated reasons is ignored within a week, which is worse than no gate.

Then again on day 5: 54 of 54 evidence rows carried a deployment *name* and no version, while
`derived/pin.json` in the same base held the platform version the whole time. The door now stamps
it. The README's own rule is that an environment's name is not evidence of anything — and the door
enforcing that rule was breaking it.

### A gate you have never seen fail is a gate you have not tested

Four corpus checks were each written against a corpus carrying exactly that defect. Three of the
four caught something already sitting in the live base. The axis-drift check counts a
*transposition* as one edit, because `grahpql` for `graphql` swaps two neighbours and plain edit
distance scores that as 2 — the commonest way a person misspells a word is the one shape a
distance-1 rule cannot see.

### Ids are eternal; an anchor is an address, not a claim

Three entries were filed under coordinates that resolve to nothing, and nothing could fix any of
them: `supersede` mints the id from the subject, so correcting an address meant destroying the
number other entries cite. `kb reanchor` exists because changing where a claim is filed alters
neither what it asserts nor who observed it. The fingerprint still moves, so a correction can
collide — refused by the same rule the door uses, naming the survivor.

### The instrument is the thing most likely to be wrong

* `reconcile.mjs` resolved logs with `files.find` — whichever name sorted first. Run 04's numbers
  were right by luck (`8df1fb2c` sorts before `c842f27b`); run 05's were not. *A measurement that is
  correct by the accident of a hex string is not a measurement.*
* The scrub-scan safety tool walked `.git`, matched a 40-hex token shape against every commit SHA in
  `.git/logs/HEAD`, and reported five files needing a scrub on every repository it was pointed at,
  with no secret among them.
* The blind-grading packet explained what was served *in the past* using entry files as they stand
  *today*, after four regenerations. Six of fourteen disagreements were this. Rebuilt at the commit
  that was HEAD when each run started: 18 of 47 cited entries differed from their current version.
* **The headline number of the whole measurement had no script.** "Touches, largest silence,
  touches in the middle 60%" decided that briefs do not fix front-loading, is why the loop and the
  arrival hook exist, and was quoted in three conditions pages and a memory — computed by hand each
  time, with "touch" never defined. Written down as a script, it did not reproduce: run 01 did not
  front-load, and the reported rise for runs 04–06 was counting `kb` calls, which are mostly
  *writing*.

### Served is not answered

The base was asked 23 questions across three runs and missed **zero** — `deliver` always found
something. So a MISS-only demand loop would have stayed empty through every run. Run 03 wrote down,
for a question the base "answered", that the values it needed *"are data and not contract, so the
derived plane structurally cannot hold them"*.

The blind graders then found the same thing from outside: on the seventeen rows where the comparison
was valid, nine agreed and eight did not, and all eight said a run had marked itself HELD on an
answer that named the right neighbourhood and stopped.

### A stale entry costs more than a missing one

A missing fact costs a lookup. A stale fact that reads as authoritative cost one run a lookup, a
confident wrong conclusion, and the climb back out — and the conclusion took the shape *"the thing
is not here"*, which a reader cannot distinguish from a true negative. This is why `refutableBy` is
a question the door *asks* rather than a field the schema merely owns.

### Two entries can both be right and still contradict

`KB-27B4CD10` and `KB-4D082C89`, written nine minutes apart by one run, disagree about what a
pending invitee looks like. The fingerprint gate was **right** to pass them: different anchors,
different scope, two distinct facts. The failure is one clause inside an otherwise-correct entry
going stale, and nothing in a text corpus will ever detect that — it takes reading two paragraphs
and noticing that a `because` in one is refuted by an observation in the other. Three mechanisms
now put the writer in front of it while the page is still open. The pair itself was still unresolved
after three adjacent runs.

---

## Things that were built and then rejected

The most useful half of this record. Each was measured, and the measurement said no.

| | why it was dropped |
|---|---|
| A reserved retrieval slot for the experiential plane | Refuted before building: that plane was 24 entries of 614 and already took 20 of 60 slots, leading 8 of 23 rows. A reserved slot would have made a bad case permanent. |
| Field boosts, and one extra slot | Built, scored, rejected. Every setting that fixed the third buried row sold a different one to buy it. |
| Serving an entry first when a question names its anchor | Checked before building. It fired only on a row that was already answered correctly, and matched nothing but the bare word `organization` on the broken one. |
| A flag for candidates whose every matched term is common | Did not fire on the one case it was written for. Removed rather than shipped. |
| Four mechanisms for the plane-balance problem | Every one buys a row and sells another, and every constant in them is underivable. The trend was recorded instead. |
| Per-run log folders via `VC_MEASURE_OUT` in `settings.local.json` | The premise was false: the `env` block is re-read on every hook invocation, not captured at session start, so the running session followed the new value within one tool call. |
| Host-id matching in `reconcile.mjs` | Wrong by construction — reconcile is run by an analyst pointing at someone else's directory, so the caller's own host id names the wrong log confidently. Reproduced the exact defect run 05 had caught. |
| The seven-value `kind` vocabulary | Two values empty across five task shapes, one value absorbing 58% of the corpus, a third of the corpus mapping to none. Cannot be ratified on author-side data. |
| `refutableBy: practice` for procedures | The ADR's own table says no automated executor exists for it. Such an entry could enter, accrue weight, and be contradicted by nothing, forever — in a base whose admission rule exists to prevent exactly that. |
| Blanket apply on `consolidate` | Agreeing scope proposed three merges and two were wrong: the password grant and the impersonation grant share a coordinate, a surface and a principal, and the axis that separates them is one neither entry records. The tool can detect a difference and cannot certify a sameness. |

---

## Open when the history was rewritten

* **The written plane is winning.** 39 experiential documents against 590 derived, leading 12 of 30
  replay rows. The planes are *not* on different scales — mean best score 323.5 against 344.8 — so
  the category error assumed at the outset is not there. What is disproportionate is the win rate,
  and each run adds ~8 documents. If it holds, the derived plane becomes unreachable for any
  question phrased in ordinary storefront words, without a single change to the code.
* **Flows collide with facts, and it is not a size effect.** The first flow entry — a route sequence
  for placing an order — cleared the relevance floor on **18 of 34** replay rows, where four
  comparably long *facts* cluster at 6–7. A procedure is about the generic nouns of a journey, so it
  is a candidate answer to more than half of all questions asked in ordinary words. `dedupeTokens`
  removes the bias from *repeated* terms and is structurally inapplicable here.
* `Mutations.deleteOrganizationContact` and `Promotion.isActive` — two anchors that are somebody's
  guess at what a button called. One `reanchor` each, once somebody observes them.
* Configurable products do not exist on this deployment; two demand rows stand open because of it.

---

## Conventions that were paid for

* **Predictions go in the commit message, never in the conditions page.** Run 07 read its own
  conditions page at call 2 — hypothesis and predicted answer included — and its verdict on the
  thing the run existed to test stopped being independent. A commit message is pre-registration a
  run does not read, verified: no `git log`, `git show` or archive access in 302 calls. *This
  convention is why the verbatim commit files matter more than this page does.*
* **A run gates the base before writing its report.** Run 07 left the corpus failing `kb validate`,
  correctly, having never been asked to check.
* **Never `git add -A`.** Under Git Bash, prefix any command passing a leading-slash argument with
  `MSYS_NO_PATHCONV=1` — and knowing about that trap does not save you: one correction of an
  MSYS-mangled anchor was mangled identically, one minute later, by someone who had just read the
  failure and diagnosed the cause.
