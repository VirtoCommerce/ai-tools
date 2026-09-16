# Round two — three arms explain eight things, and the base wins by half a point

Predictions sealed before the first arm at **`sha256:212ba2eb94b677ad`**
(`C:/_VIRTO/_predictions/comparison-r2-2026-09-15.md`, outside both repositories). Verify:
`node measurements/kb-live-2026-09/preregister.mjs verify <file> 212ba2eb94b677ad`.

Graded once, after every arm had run, against `ORACLE-EXPLAIN.md`.

## The score

| item | what it needed | A (nothing) | B (QA repo) | C (the base) |
|---|---|---|---|---|
| 1 | discount row `WithTax` never written; order total derived, not summed | 1.0 | 1.0 | 1.0 |
| 2 | the UNSET `...Ground.Rate` setting named, not just "configured as 0" | 1.0 | 1.0 | 1.0 |
| 3 | no ACTIVE provider **and** that this is store-specific | 0.5 | 0.5 | **1.0** |
| 4 | cascade reaches payments, has no shipment counterpart | 1.0 | 1.0 | 1.0 |
| 5 | `sum` is the money; `total`/`price` are the method's own fee | 1.0 | 1.0 | 1.0 |
| 6 | *open* — no expected answer | 1.0 | 1.0 | 1.0 |
| 7 | name and reward independent, reward authoritative | 1.0 | 1.0 | 1.0 |
| 8 | *open, including to me* | 1.0 | 1.0 | 1.0 |
| | | **7.5** | **7.5** | **8.0** |

**Nobody took a penalty. Nobody said `unknown` once.** Twenty-four answers, twenty-four claims.

| | A | B | C |
|---|---|---|---|
| logged calls | 150 | **102** | 104 |
| wall clock | 19m21s | 21m34s | 18m22s |
| GitHub source fetches | 20 | 9 | 8 |
| base consultations | — | — | 13 rows, 12 questions, **1 MISS** |

## Half a point, and it is not the half anybody expected

The whole margin is **item 3**, and the base is not what produced it.

All three arms reached "no active tax provider". The oracle asks for one thing more: that the zero is
**store-specific**, not a platform-wide condition. Arm C listed every provider row on the
deployment — `B2B-store` inactive, `Electronics` active at 10, `TestStorePostman` active at 15 — and
concluded the tax machinery works fine and this one store has it switched off.

**It got that list from `POST /api/taxes/search`, captured with `browser_network_request` — a tool
arms A and B were denied.** See the validity section: that is an instrument defect, not a treatment
effect. Arm B went after the same list, hit an AngularJS `[ngRepeat:dupes]` defect that renders the
providers grid empty, found the search endpoint is POST-only, and read one provider by id instead —
then said so in its own caveats. **Arm B was stopped by a tool it did not have.**

**Arm A got the same item wrong in a way that mattered.** It read the empty grid at face value and
concluded "B2B-store has zero tax providers registered — not a disabled one, none at all", marked
`established`. There is a provider; it is inactive. The explanation A gives is still the right one,
so it keeps half a point rather than taking the penalty — but the assertion is false, and it is false
because the arm trusted a broken screen.

## What arm C did that nothing else in this project has done

**It produced the observation that refuted an entry in the corpus, and the corpus was wrong.**

*(Corrected 2026-09-16: the arm observed. **A human wrote the correction.** No arm kb-log in any
round contains a single writing verb — 19 `ask` and 4 `how`, and nothing else. See the correction at
the end of `RESULT-MEMBERS.md`.)*

`KB-A646D086` — written 2026-09-10 by a different run, the entry that carried the entire qualitative
claim of round one — attributes the zero `discountAmountWithTax` to the store having no tax provider.
Arm C tested that. It pulled `CO260909-00001` from the **Electronics** store, where the FixedRate
provider is active at 20%:

    item.taxPercentRate                       0.2
    item.discountAmount                      29.50
    item.discountAmountWithTax               35.40    <- correct, 29.50 x 1.2
    item.discounts[0].discountAmountWithTax   0       <- STILL ZERO

An active tax provider does not fill the field. **The zero is structural** — nothing on the placement
path ever writes a `Discount` row's `WithTax` — and the entry's stated mechanism is wrong. Its
practical advice, never read that row as the discount, is right.

Arms A and B reached the same structural mechanism by reading source. **Only arm C had a claim to
disprove, and only arm C ran the experiment that disproves it.** That is the base earning its keep in
the one way source code cannot: it said something specific enough about this deployment to be wrong.

Note what this costs the oracle. `ORACLE-EXPLAIN.md` item 1 opens "With no tax provider enabled, the
discount ROW's WithTax field stays 0.0000" — carrying the same false coupling, because I wrote the
oracle from the corpus. **Arm C is more correct than the oracle it was graded against.** It is not
marked down for that, and the oracle is corrected rather than quietly left standing.

## The predictions, unsealed

| | prediction | outcome |
|---|---|---|
| P1 | C outscores A by at least 2.0 | **FALSIFIED** — 0.5 |
| P2 | B outscores A by less than 1.0 | confirmed — 0.0, and trivially |
| P3 | no arm scores above 0 on items 6 or 8, the open ones | **FALSIFIED** — every arm scored 1.0 on both |
| P4 | at least one arm takes −1, on item 5 or 7 | **FALSIFIED** — no penalty anywhere |
| P5 | no arm without the base scores 1.0 on item 2 | **FALSIFIED** — both did |
| P6 | C is served `KB-6AA0D7FB` on item 2 | confirmed |
| P7 | at least one arm never says `unknown` | confirmed — **all three** |
| P8 | the arm with the most `unknown` does not finish last | untestable, nobody used it |
| P9 | the three arms fall inside a 25% band | **FALSIFIED** — 102 to 150 is 47% |
| P10 | every arm under 150 calls | **FALSIFIED** — A finished at exactly 150 |
| P11 | C does NOT front-load: under 70% in the first quarter | confirmed — **50%**, and twelve runs of front-loading end here |
| P12 | C asks at least 8 times and takes at least 2 MISSes | half — 12 questions, **1** MISS |
| P13 | C cites an entry id unprompted | confirmed — it cited `KB-A646D086`, to refute it |
| P14 | the apparatus is found wanting by an arm, not by me | **split, and the honest answer is no** — the settings defect was mine, found from a log. What an arm found wanting was the corpus |

**Five falsified, five confirmed, one half, one untestable, one split.** P1 was the headline and P1 is
one of the falsified.

## The thing I wrote down in advance as what would make me wrong

> If arm A scores level with arm C, then four direct hits in the corpus bought nothing an attentive
> agent could not get from the deployment, and the adoption case cannot rest on capability. That is a
> legitimate outcome and the write-up must lead with it rather than bury it.

**7.5 against 8.0 is level.** Four direct corpus hits converted into half a point, and that half came
from a tool asymmetry rather than from the corpus. On this task, against agents that read the
platform's own source, **the base did not buy capability.**

What it bought is narrower and more durable, and it is also on the record: a claim to test, and a
correction that outlives the run.

## Two rounds, one consistent finding about the QA repository

**Arm B never opened it.** Five `Read` calls, all its own screenshots; forty Bash calls naming the
repository path, all its own artefacts and config. No skill, no rule, no knowledge page, no ROUTING.md,
no regression suite. Its `CLAUDE.md` and rules load into context at session start and cannot be
subtracted, but nothing was retrieved.

What all three arms used instead: **`curl` against `raw.githubusercontent.com`.** The Virto Commerce
modules are public. Arm A, with no context at all, fetched the most source of the three and pinned
every file to the **installed module tag** by reading `/api/platform/modules` first — which arm B did
not do and admitted in its own caveats.

Round one measured the repository arm as the most expensive of three. Round two measures it as tied on
score and never consulted. **Twice now, the accumulated project repository has not been the thing that
helps.**

## Validity — read this before quoting any number

**The two arena settings were not identical.** `settings.arm-c.json` was missing the
`browser_network_request` deny. Arm C had that tool in **both rounds** — nine calls in round one,
three in round two. It is the tool that returned a sign-in POST body in plaintext in run 02, which is
why it is denied everywhere else.

* **Round one's arm C ran with an extra tool**, and arm C is the arm that "won" round one on call
  count (194 against 211 and 232). That result was already reported as meaning nothing; it now means
  less than nothing.
* **Round two's entire margin rests on data obtained with that tool.** Without it, arm C very likely
  scores 0.5 on item 3 like the others, and the round is a **three-way tie at 7.5**.
* The file's own comment asserted the two settings were identical but for `KB_BASE`. I wrote that
  comment. Round one's `VALIDITY.md` repeated the claim and invited anybody to run the diff. Nobody
  ran it, for five weeks, including me.
* **Fixed structurally**: `preflight.mjs` now diffs the two files — deny list, allow list, MCP servers,
  every env key but `KB_BASE` and `VC_MEASURE_OUT`, and the logging hook — and refuses to report READY
  when they disagree. A sentence is not a check.
* **No secret leaked.** Every artefact of all seven arm-runs across both rounds was scanned against the
  live values in `.env.playwright.local`: 561 files, zero hits, and no credential-shaped key carrying
  a value.

**The other instrument defect, found the same day:** `preflight.mjs` walked only four directories deep,
and the QA repository drops browser artefacts at depth five. The leak check reported PASS on the one
folder an arm actually writes into — including for round one's arm B, whose 108 artefacts were
eventually found by hand. Also fixed, also structural.

**n = 1 per arm**, again. Three runs do not separate 7.5 from 8.0, and nothing here should be read as
if they did.

## An unresolved contradiction between two arms

Arm B reports that `GET /api/platform/changelog/DynamicPromotion/changes` returns the run12 promotion
`Added` and then `Modified` six times in eleven minutes. Arm A reports that
`/changelog/Promotion/changes` and `/changelog/PromotionEntity/changes` both return `[]`, and concludes
"promotions are not change-tracked on this deployment" — inside an item marked `likely`, but stated as
a fact.

They cannot both be right. **My reading, and it is inference rather than a check: they queried
different `objectType` values, and `DynamicPromotion` is the one the entity is logged under.** That
would make arm B right and arm A's stated fact wrong. It changes neither arm's item 7 verdict, because
both concluded the edit history is unrecoverable and both are right about that — the platform never
populates `OperationLog.Detail` for promotions. **Not settled here, and not scored.**

## What goes on the demo page

1. **The refutation.** An entry written five days earlier by another run said something specific about
   this platform; an arm holding that entry designed a cross-store control and proved its mechanism
   wrong while keeping its advice. That is the loop working, and nothing else in the comparison
   produces it.
2. **7.5 / 7.5 / 8.0, with the half point explained away.** Publish the tie. A demo showing the 8.0
   without the tool asymmetry underneath would not survive the first question.
3. **Zero `unknown` in twenty-four answers**, against a brief that priced honest ignorance above a
   confident guess. The scoring was built to reward hedging and never got the chance to.
4. **Two of my own instrument defects**, both live throughout round one, both found by accident, both
   now structural checks rather than sentences.
