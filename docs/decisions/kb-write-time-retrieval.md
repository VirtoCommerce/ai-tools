# The knowledge base decides — write-time retrieval cards and a calibrated verdict

**Date:** 2026-09-30 · **Status:** M0–M3 done; M4 measured 2026-10-01 and **amended** (Decision 1a,
§M4 findings). Supersedes the agent-as-judge half of VCST-6087 (two-stage ask) for confident answers
only; the judge survives, on a much smaller payload, for everything else.

Never loaded by an agent. When this is built, the normative text will be `scripts/kb/**`, the MCP tool
descriptions in `scripts/kb/mcp.mjs`, and one line in `CLAUDE.md` §Essential Rules → *Product context*.
This file is the evidence behind the shape and the record of what was deliberately not taken.

---

## The question

`kb ask` must answer three different things: *this entry answers you*, *these two differ and you must
choose*, *the base holds nothing*. Today the base answers none of them. It returns ten candidates and
three bodies, and the calling agent decides (`two-stage-1`, VCST-6087 phase 2, PR #337 -- measured, but
not merged: `main` still ranks with `floor-1`). That is correct and
safe, and it is expensive: about 1.4k tokens per ask whatever the outcome, including the 27 of 40 asks
in the 2026-09-30 wave that ended in "none". Can the base decide by itself, cheaply, without losing the
property the judge bought — no confident wrong answer?

## What was already true before deciding anything

**The judge is safe.** Phase 1 bench on `vc-knowledge@818d478` (194 entries), re-run 2026-09-30 after
merging `main`: hybrid view at K=10 gives 9/11 targets, 8/8 controls, **0 wrong picks**; the 2026-09-29
run gave 10/11 — the difference is one split case (`T-cart-long`). Live wave `VCST-6087-wave1`
(40 asks over MCP): every ask got a verdict, 6/6 controls ended in `none`.

**The judge is not the bottleneck; the index is.** The same wave found five questions whose answer
exists in the base but never reached the candidate list — all paraphrases or vocabulary mismatches:

| ask | wording used | entry that answers | its wording |
|---|---|---|---|
| P1 | two promo codes on one basket | `KB-8264632C` | coupon, cart |
| P3 | company account admin invites a colleague | `KB-BAEBCDA7` | organization, invite |
| P6 | pay later on account | `KB-50EBEEE9` | Manual payment, purchase order |
| L1 | guest cart merged at sign-in | `KB-734A0813` | (not in top 10) |
| L6 | purchasing agent's orders visible to colleagues | `KB-D080C209` | sales rep |

The labelled set could not see this: none of its 19 rows is a paraphrase, which is why Stage 1 recall
measured 11/11.

**Entries are not atomic.** The README says one fact per entry; bodies say otherwise (median 874 chars,
p90 1,664). `KB-001183CF` holds two facts — coupon validation is case-insensitive, and
`/account/coupons` shows codes uppercased. Five of the wave's 13 picks were "partially holds".

**The metadata that would help is present but unusable.** Every entry carries `anchors` and
`appliesTo`, yet `scope` never reaches ranking, `surface` is spelled ten ways (`storefront-xapi`,
`xapi`, `graphql`, `graphql-xapi`, …), and anchor normalisation lowercases GraphQL names
(`Query.validateCoupon` → `query.validatecoupon`, `scripts/kb/core/anchors.mjs`). No synonym
expansion exists anywhere (`docs/decisions/kb-procedural-plane.md` accepted "no synonym recall" for
flows).

**Why one score failed.** `scripts/kb/core/rank.mjs` records it: no floor on one lexical score separates
answers from non-answers on this data. That is a statement about a *single magnitude*, and it matches
the literature (raw similarity is a poor abstention signal). It is not a statement about a decision
made over several *structural* signals, which is what the literature recommends instead.

## The prior art, and what it says for a corpus this size

- **FAQ retrieval** — question-to-question similarity is the strongest single signal when every
  document already states the question it answers, combined with question-to-answer relevance
  (Sakata et al., SIGIR 2019, arXiv 1905.02851). Our entries already carry `question`.
- **Document-side expansion at write time** — generating the queries a document answers, then
  **filtering** the ones that do not retrieve it, beats unfiltered expansion and shrinks the index
  (doc2query--, arXiv 2301.03266; Doc2Query++, arXiv 2510.09557).
- **Controlled vocabulary** — alias → concept normalisation, applied to both the query and the index,
  is deterministic and needs no model; it is the classic fix for exactly the mismatches measured above.
- **Abstention** — do not threshold one similarity; fit a small classifier over several signals
  (sufficiency, margin, agreement) and choose its threshold for a target precision on a held-out set
  (Sufficient Context, arXiv 2411.06037; selective prediction / conformal thresholds, arXiv 2404.04287).
- **Fusion** — RRF until labels exist, then a tuned convex combination (Bruch et al., arXiv 2210.11934).
- **Dense retrieval and cross-encoders** run locally in Node (`onnxruntime-node` ships Windows
  binaries; `bge-small-en-v1.5` int8 ≈ 34 MB, `ms-marco-MiniLM-L-6-v2` int8 ≈ 23 MB), but their raw
  scores are not calibrated, they add the first runtime dependency and a model download, and on
  200–5k atomic entries with a vocabulary most of their gain is already bought. Deferred behind a gate
  (Decision 7).

## Decision 1 — the base returns a verdict, not a list

`ask` returns exactly one of:

| verdict | payload | ≈ tokens |
|---|---|---|
| `answer` | one entry: claim, trust, anchors, provenance | ~250 |
| `ambiguous` | 2–3 headlines **and the concept that separates them** | ~150 |
| `none` | "nothing recorded" + the nearest concepts the base does hold | ~50 |

`kb_show` / `kb_none` survive only on `ambiguous`, which is the two-stage judge reduced to the one
case where a judgement is genuinely needed. `answer` and `none` are logged as the base's own verdict,
with the features that produced it, so every decision is auditable after the fact.

### Decision 1a — amended after M4 (operator, 2026-10-01): the base answers alone only when it is sure

M4 measured that the base cannot tell, from the question and the index, an entry that HOLDS the fact
from one that is merely ABOUT the same thing (§M4 findings). It can find the right entry -- it is in the
top 3 for 86% of targets -- but it cannot certify that a near-neighbour does not answer. So the three
verdicts keep their names and change their jobs:

| verdict | when | who decides |
|---|---|---|
| `answer` | the calibrated probability clears the threshold chosen for precision >= 0.95 | the base |
| `ambiguous` | anything else the channels found | the base finds; the agent judges, on a compact payload (headlines, the question each entry answers) and confirms on the body it opens with `kb_show` |
| `none` | no channel found anything | the base |

"The base decides" now holds for `answer` and for the empty case. Whether a near-neighbour answers is
the agent's call, as it was under `two-stage-1` -- the saving is the payload, not the judgement:
three headlines instead of ten candidates and three bodies.

## Decision 2 — one entry, one fact; multi-fact entries are split

A split entry keeps its file with `status: superseded` and a `supersededBy` list; its children are new
entries with new ids (the id rule is unchanged: a hash of the subject). `retrievable()` already drops
non-`active` rows while `show` still serves them (`scripts/kb/core/index-load.mjs:149`), so an old id in
a log, a report or a PR still resolves. Each child inherits the parent's `evidence` items verbatim,
with a `note` naming the parent, so trust is not reset by a migration nobody observed.

## Decision 3 — the capturing agent writes the retrieval card; the push checks it

At capture the agent that just established the fact supplies, beside `subject`, `question` and `claim`:

```yaml
questions:            # >= 3; how this fact will be asked for
  - text: Is a coupon code case-sensitive when applied?
  - text: Do "SAVE10" and "save10" both work as promo codes?
concepts:             # >= 1, ids from vocabulary.json
  - id: coupon
  - id: coupon.validation
```

Lists of flat objects, because the frontmatter subset allows nothing else
(`scripts/kb/core/frontmatter.mjs`). The agent is the cheapest author: it holds the context, and it
costs no API key and no infrastructure. The **push** runs the doc2query-- filter against the index it
is about to write: a question whose top-ranked entry is *another* entry is dropped from the card; a
card left with no question is refused with the entry it collides with — which is also a duplicate
detector stronger than today's exact-key identity.

**Amended by M4 (2026-10-01):** the rule as written is not usable on this corpus. A dry run on the
migrated base (`scripts/kb/bench/card-filter.mjs`, 1,489 card questions) drops **58%** and leaves **61**
entries with no question at all -- among them `KB-8264632C`, the answer to wave-1 miss P1. 621 of the
862 drops lose to an entry sharing a concept: on 334 entries in dense clusters, "top-1 of 334" is a far
stricter test than doc2query-- was designed for on a corpus of millions, and the verdict is mostly about
the ranker that judges, which was not yet calibrated. Deferred until after calibration, with a softer
rule to evaluate then: keep a question whose entry ranks in the top 3, and never empty a card
(measured on the uncalibrated ranker: 36% dropped, 24 cards emptied -- still too many).

Rejected: generating questions in the indexer with a model. It needs an API key on every machine that
pushes, and a push without one would fail or write a card-less entry.

## Decision 4 — a controlled vocabulary lives in the base

`vocabulary.json` beside `index.json`: `concept id → aliases[] + parent + typical anchors`. Seeded from
the concepts the migration assigns, the wave's misses and VirtoOZ terminology. At query time aliases
map to concept ids before any ranking; at capture an unknown concept id is refused with the nearest
existing ones (a new concept is a vocabulary edit, reviewed like an entry). The file is public: no
client names, no client jargon.

## Decision 5 — facets are closed and derived where possible

- `surface` becomes a closed set — `storefront-ui | xapi | rest | admin-ui | ucp | vendor-ui` — with a
  migration table for today's eighteen spellings (`background-jobs` → `rest`; `api` names UCP on some
  entries and REST on others, so M2 resolves it per entry). Six, not four: UCP and the vendor portal
  are surfaces of their own (operator, 2026-09-30). Other `appliesTo` axes stay as they are.
- Anchors keep their case and gain a `kind` (`graphql-op`, `graphql-field`, `rest`, `page`, `setting`,
  `blade`). The kind is **derived** by `scripts/kb/core/coordinates.mjs`, never typed by the agent.

## Decision 6 — the verdict is a calibrated decision over structural signals

Pipeline: parse the question (coordinates by kind, concepts via the vocabulary, surface hints) →
three candidate channels (BM25 over `questions` + `subject` + concept tokens; anchor postings; concept
postings) fused by RRF → a logistic regression over:

1. **concept coverage** — the share of the question's concepts the top entry carries (the sufficiency
   signal; it does not depend on question length, which is what broke floor-1);
2. margin between the first and second fused scores;
3. channel agreement (same top entry in two or more channels);
4. coordinate match, surface match;
5. **unmapped share** — content words of the question that map to no concept.

Its coefficients and the two thresholds live in the base (`ranker.json`, versioned by the `rank` name
on every ask line).

**Amended by M4 (2026-10-01).** Two parts of this decision did not survive measurement:
- **Fusion.** Equal-vote RRF put the right entry first for 17 of 37 dev targets; the words channel alone,
  24. The coarse concept channel outvoted the precise one. Replaced by a weighted sum of max-normalised
  channel scores (Bruch et al.), weights chosen on dev, with a fourth view of the words channel: BM25
  against each card question SEPARATELY, the entry scoring its best sentence (question-to-question, the
  FAQ-retrieval signal). Right entry first: 25/37 dev; in the top 3: 32/37; in the top 10: 37/37.
- **Features.** Leave-one-out cross-validation on dev: the eight signals listed above give AUC at most
  0.879; four length-independent sufficiency signals -- idf-weighted coverage, best-sentence strength,
  best-sentence margin, fused margin -- give 0.907. Concept coverage, coordinate and surface match add
  nothing on dev (which holds few coordinate questions, so that verdict is re-checked as the set grows).
  The unmapped share is not a model input; it acts through its own rule. `kb calibrate` fits them offline on the labelled set and picks the `answer`
threshold for **precision ≥ 0.95** on the held-out split. A high unmapped share pushes toward
`ambiguous`, never `none`: a vocabulary gap must not be reported as "the base holds nothing".

## Decision 7 — no new runtime dependency, no CI, no server; dense retrieval is gated

Everything above is Node built-ins, computed by the client's own push (which already rebuilds
`index.json`, `scripts/kb/core/push.mjs`). The base stays a public repo with no workflow (PLAN
decision 4). Embeddings — and with them `onnxruntime-node` and a ~34 MB model download — are added
only if, after Decisions 2–6, paraphrase recall@10 on the held-out set stays below 90%.

## Decision 8 — the client ships first, the data moves second

The entry writer's schema is closed: `stringifyFrontmatter` throws on an unknown field, and a push
that confirms or disputes an entry rewrites its frontmatter (`scripts/kb/core/push.mjs:400`). A client
from before this change would therefore **fail every confirm/dispute on a migrated entry**. Order:

1. release a client that reads, carries and writes the new fields, and reads index schema 2 while
   still reading schema 1; wait until the team has pulled it;
2. migrate the data in one reviewed PR to `vc-knowledge`;
3. only then make the new fields mandatory at capture.

Old fields stay in the index (`subject`, `question`, `anchors`, `scope`), so a stale reader still ranks
— worse, but it does not break.

## How this is measured

The labelled set grows from 19 to about 120 rows, **split by entry** so a question written for an
entry's card never appears in its test: the 19 existing rows; the 40 wave-1 asks labelled by a human;
paraphrases written by a different model than the one that writes cards; about 25% of rows with no
answer in the base, including near neighbours. M4 brings its own bench over that set with the verdict
metrics: selective precision and coverage, `none` precision on controls, `ambiguous` share, mean tokens
per ask. It needs no judge, because the base decides.

**M0, done 2026-09-30:** `scripts/kb/bench/rank-labelled-set.v2.json` -- 83 targets, 38 controls, 3
contested rows kept out of every metric, pinned to `vc-knowledge@8c8f844`. It carries the `two-stage-1`
baseline per split, measured with PR #337's benches (`eff4c333`) as a REFERENCE; the bar M4 replaces in
production is `floor-1`, which is what `main` runs.

## M4 findings (2026-10-01)

Measured with `scripts/kb/bench/verdict-bench.mjs` on the migrated base (`vcst-6122-schema2` @
`f188eb8`, 334 active entries), dev and calibration only -- the test split is opened once, at the gate.

**The production bar** (`baselineFloor1` in the labelled set): `floor-1` answers 16 dev questions and
11 of them wrongly, 7 on controls; 18 targets whose right entry it ranked FIRST are refused by its
coverage floor; 15 entries carry `/cart` and an anchor passes unconditionally.

**Finding is solved; deciding is not.**

| | floor-1 dev | M4 dev | floor-1 cal | M4 cal |
|---|---|---|---|---|
| paraphrase recall@10 | 20/24 | 24/24 | 8/14 | 13/14 |
| right entry in the top 3 | 7/37 | 32/37 | 2/22 | 19/22 |
| right entry first | 5/37 | 25/37 | 2/22 | 10/22 |

What cannot be decided from the question and the index is SUFFICIENCY: whether a near-neighbour entry
states the fact asked or only shares its topic. Separating controls from targets whose right entry is in
the top 3 reaches AUC ~0.73 on the four features above and ~0.70-0.79 when entry BODIES are added
(idf-weighted coverage over card + body, the rarest missing word). The words that give a control away
-- "filter", "csv", "captcha", "deleting" -- are visible to a reader and indistinguishable, by rarity, from
the words a genuine paraphrase also misses. Holding controls in `none` >= 0.90 then resolves about 41%
of targets; the opposite extreme resolves 86% and never says `none`. No threshold sits between them,
because the separating signal is semantic. Hence Decision 1a.

**The agent on the compact payload.** The 88 dev + calibration questions, the base's top 3 rendered
without labels, judged by subagents in one batch (scratch harness, not committed). "Resolved" counts a
labelled entry picked; "partial" targets are the 9 the set marks as held only in part.

| payload (mean tokens incl. the question) | judge | picks right / made | controls -> none | resolved, all | resolved, non-partial |
|---|---|---|---|---|---|
| v1: subject + the question each entry answers (~210) | Sonnet | 39/45 | 27/29 | 39/59 | 38/50 |
| v1, then confirmed on the opened body | Sonnet | 36/39 | 29/29 | 36/59 | 36/50 |
| v2: v1 + the first ~240 chars of the body (~390) | Sonnet | 43/48 | 27/29 | 43/59 | 41/50 |
| v2, then confirmed on the opened body | Sonnet | 36/37 | 29/29 | 36/59 | 36/50 |
| v1 | Haiku | 37/46 | 26/29 | 37/59 | 35/50 |
| v1, then confirmed on the opened body | Haiku | 36/42 | 28/29 | 36/59 | 35/50 |

Read: the right entry is SHOWN for 51 of 59 targets (46 of 50 non-partial); a Sonnet-class agent on v2
picks it for 41 of those 46 and is wrong 5 times, two of them on rows whose label is probably incomplete
(`P-6D5E2CD1-1/-2` pick entries that state the asked fact) and two on controls the set already calls
borderline (`W-L8`, `N-gift-untick`). Confirming on the body makes the agent safe and too strict at
once: it removes every control pick and also seven right ones. A Haiku-class agent picks more and is
wrong more -- 9 of 46 on v1, still 6 of 42 after its own body check, three of them in the price-list
cluster around `KB-6D5E2CD1`, where the labels are the first thing to review.

## What M4 ships, and what is still open

The production shape, in one line per tier:
1. **Find**: vocabulary-parsed question -> sentence BM25 + document BM25 + anchors (rarity-weighted) +
   concepts, linear fusion (weights in `ranker.json`).
2. **Answer alone** when the calibrated probability clears the precision-0.95 threshold.
3. **Otherwise show** the top candidates compactly; the agent picks with `kb_show` (which carries the
   body, trust and provenance) or ends with `kb_none`. **`none` alone** only when nothing was found.
4. **Learn from it**: every `ambiguous` that ends in `kb_show` or `kb_none` is a label the log already
   records; recalibrating on it is how the base's own `answer` share grows (M6).

Open, and measured before the gate: the payload (v1 vs v2, three vs four candidates) and the wording of
the agent's contract, which decides the strict-vs-safe balance above; the two probable label gaps; and
whether a body re-rank of the top 10 (dev: right entry in the top 3 32 -> 35 of 37; calibration
unchanged) is worth ten body reads per ask.

## M4 gate result (2026-10-01) -- FAIL by one row on two lines; `floor-1` stays

The frozen configuration (`scripts/kb/bench/ranker.m4-gate.json`: linear fusion, head re-rank by the
bodies, threshold for precision 0.95; the one-line agent contract in `render.mjs`) was measured end to
end on the test split, opened once (`.test-openings.jsonl`). Full record: `scripts/kb/bench/m4-gate-result.json`.

| AC line | dev + calibration | **test** | gate |
|---|---|---|---|
| picks precision (relied on, after the body check) | 42/44 | **18/19 (94.7%)** | >= 95% -- **fail** |
| a control answered by the base | 0 | 0 | 0 -- pass |
| controls end in `none` / `kb_none` | 28/29 | 9/9 | >= 90% -- pass |
| targets resolved, non-partial | 41/50 (82%) | **17/22 (77%)** | >= 80% -- **fail** |
| paraphrase recall@10 | 37/38 | 15/16 | >= 90% -- pass |
| mean `ask` payload, tokens | 380 | 387 | <= 400 -- pass |
| every pre-migration id resolves through `show` | -- | 289/289 | pass |

Read with the size of the split in mind: on test one row is 5 points of precision and 4.5 of
resolution, so the gate missed by ONE row on each line. The single wrong reliance (`P-4B889114-1` on
`KB-27B4CD10`, two entries about the storefront members list) may be a label gap; it is reported, not
relabelled -- the split is opened once. The pick step alone resolves 18/22 at precision 19/21; the body
check trades one resolution for one wrong pick. A Haiku-class agent on the same items (pick only): 14/17
precision, controls 8/9, resolved 13/22 -- the contract is not safe for a weak agent without the body check.

**What this means.** The base now finds what it holds (paraphrase recall 94-97% against floor-1's 57-83%)
at a quarter of `two-stage-1`'s payload, and never answers a control alone. Whether that clears a
precision bar of 0.95 cannot be settled on 33 rows; the next measurement needs a larger held-out set,
which the logged `kb_show` / `kb_none` of a live wave provide for free (M6).

## What this knowingly does not get

## What this knowingly does not get

- **Meaning beyond the vocabulary.** A synonym nobody added is a miss until M6 or until the report
  proposes it. The mitigation is the unmapped-share rule and a vocabulary queue in `kb-report`.
- **A tight confidence interval.** Precision estimated on ~120 rows is ±5 points; the threshold is
  re-fitted as labels accumulate.
- **Free capture.** A card costs the capturing agent a few more lines per entry.
- **Stable ids across the migration.** Split entries get new ids; `supersededBy` carries the link.

## Build order, and the stop condition at each stage

| stage | what | stop / pass |
|---|---|---|
| M0 | labelled set to ~120 rows, split by entry, human-approved | set approved |
| M1 | client: schema 2 read/write, derived anchor kinds, closed surface (no behaviour change) | released and pulled (Decision 8) |
| M2 | migration of all entries: split, cards, concepts, surface; reviewed PR to `vc-knowledge` | PR merged; every old id resolves |
| M3 | `vocabulary.json` seed | reviewed |
| M4 | query pipeline + `kb calibrate` + three verdicts | **2026-10-01: failed by one row on picks precision (18/19) and on resolution (17/22); see §M4 gate result.** As amended 2026-10-01, measured END TO END on the test split (the base's verdict, then a Sonnet-class agent's choice on `ambiguous`): picks precision ≥ 0.95; controls end in `none` / `kb_none` ≥ 0.90; no control gets `answer` from the base; targets resolved ≥ 0.80 of non-partial targets (partial reported); paraphrase recall@10 ≥ 0.90; `ask` payload ≤ 400 tokens mean. **Fail ⇒ keep what `main` runs (`floor-1`).** |
| M5 | capture v2: card mandatory, push-side filter | — |
| M6 | `kb-report`: verdict panels, vocabulary and label queues | — |
| M7 | dense channel | only if M4 misses paraphrase recall |

## Sources

VCST-6087 (Jira) and its phase-1/2 comment; bench run 2026-09-30 (`scripts/kb/bench-two-stage.mjs
--view hybrid --k 10`, `vc-knowledge@818d478`); wave `VCST-6087-wave1` (`npm run kb:report -- --run
VCST-6087-wave1 --days 1`); PLAN §3.5, §11, §14.4 (`_kbplan/PLAN.md`, outside the repo); arXiv
1905.02851, 2301.03266, 2510.09557, 2411.06037, 2404.04287, 2210.11934; Anthropic, *Contextual
Retrieval*.
