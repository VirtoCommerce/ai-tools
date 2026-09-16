# Independent review — how do we make the knowledge base actually speed up and improve agents?

**Written for a reviewer who has not seen this project.** Everything here is either a measurement or
is labelled as an opinion. The numbers are unflattering on purpose; a review built on a flattering
summary is worth nothing.

---

## The question

**How do we make the version with the knowledge base measurably faster and better than the version
without it?**

Three controlled comparisons say it currently is not. We want to know whether that is a property of
the idea, of this implementation, of the tasks we chose, or of how we measured. Tell us which, and
what to change.

---

## What the thing is

A knowledge base for QA agents working against Virto Commerce deployments. Three planes:

| plane | what it holds | how it is produced | size now |
|---|---|---|---|
| **derived-first** | the deployment's own contract — REST routes, GraphQL types — projected into entries | regenerated from a live deployment by `kb extract`, byte-compared by `kb check` | **590 entries, 3,630 anchors** |
| **experiential** | things learned by doing, that no contract states | written by agents through `kb capture`, every claim dated, placed and refutable | **67 active, 11 retired** |
| **flow** | procedures | `kb capture --flow`, served only by `kb how` | **3** |

Verbs: `ask · how · deliver · capture · consolidate · dispute · retire · confirm · supersede ·
reanchor · amend · demand · reindex · validate · check · extract · stat`.

Retrieval is MiniSearch BM25+ with `prefix: true, fuzzy: 0.2, combineWith: OR`, `bm25 {k:1.2, b:0.7,
d:0}`, and a relevance floor of `min(3, queryTerms.size)`. An uncovered question returns an explicit
**MISS** rather than a plausible non-answer.

Every consultation writes a row to `demand.jsonl` — currently **278 rows** — so questions asked with
nothing written back are visible as an open loop.

**Source: `C:/_VIRTO/vc-kb-lab` (43 commits, `src/` 276K, `bin/` 44K). Corpus:
`C:/_VIRTO/vc-knowledge`.**

---

## What has been measured, and what it says

### Phase one — twelve exploratory runs (runs 01–12)

One agent per run, against a live deployment, doing real QA work. These built the corpus and the
instrument. **2,590 logged tool calls.** Material: `MEASUREMENT-archive/run-01-promotions/` …
`run-12-cart-staleness/`, each with `tool-log-*.jsonl`, most with `kb-log-*.jsonl` and
`questions-*.csv`. Conditions in `measurements/kb-live-2026-09/RUN-0*-CONDITIONS.md`.

These are **not** a comparison. There is no control arm. They establish the noise band: comparable
work spanned **83 to 319 tool calls**.

### Phase two — three controlled comparisons, all on 2026-09-15

Same deployment, same instrument, arms differing only in context.

* **A** — an empty directory. No project files, no repository, no base.
* **B** — the full QA repository (`vc-mcp-testing-module`): skills, rules, knowledge pages, test data.
* **C** — the base only, reached through one sentence in the prompt.

**1,448 logged calls.** Predictions were sealed as a hash before each round, outside both
repositories, because a run once read `git log` during orientation and so read the predictions about
itself.

| | round 1 — place an order, verify 7 values | round 2 — explain 8 facts | round 3 — who can actually sign in |
|---|---|---|---|
| measure | tool calls | 8-item oracle | 7-item oracle |
| **A** | 211 | 7.5 | **7.0** |
| **B** | 232 | 7.5 | **7.0** |
| **C** | **194** | **8.0** | **7.0** |
| verdict | inside an 83–319 noise band — says nothing | the 0.5 came from a tool asymmetry, not the base | a tie at the ceiling |

**Three rounds, three null results on capability.** Write-ups: `RESULT.md`, `RESULT-EXPLAIN.md`,
`RESULT-MEMBERS.md`. Sealed predictions in `C:/_VIRTO/_predictions/` with verification hashes.

### What the base demonstrably DID do

**It corrected itself, twice out of two, and nothing else can.**

* Round 2: the arm holding the corpus was served an entry claiming a zero field was caused by a
  missing tax provider. It fetched an order from a store where tax is active at 20% and showed the
  field is still zero — **the entry's advice was right and its stated mechanism was wrong**, and so
  was the oracle I had written from it.
* Round 3: it was served a note claiming an account's `passwordHash` was null. It read the same
  account through a different endpoint and found it populated — **two endpoints on one platform
  redact differently**, which is now its own entry and probably a bug.

An arm with no corpus cannot do this. There is nothing to correct.

### Three things that are consistently true and that we did not expect

1. **The QA repository arm has never once opened the QA repository.** Three rounds out of three. In
   round 3 a partial answer key for that exact task sat in `test-data/b2b/users.csv`; the arm never
   looked. Its context loads at session start and is never retrieved from.
2. **Every arm reads platform source instead.** Rounds 1–2 by `curl` to `raw.githubusercontent.com`;
   round 3 through a machine-level source MCP (4, 7 and 6 calls). One arm read the **deployed** JS
   bundle rather than master and scoped its answer to that build — better than either other arm.
3. **Consultation is collapsing.** Twelve runs front-loaded the base — ~70% of consultations in the
   first quarter of a run. Round 2: 50%. Round 3: **two questions in the whole run**, both hits, then
   the arm verified everything itself anyway.

---

## The structural gap we already believe in (opinion, labelled)

**115 evidence rows in the corpus. Every single one is `method: observation`.** Exactly one entry
cites platform source, written on the day of round 2 from an arm's finding.

So the corpus carries mechanism only where the mechanism was visible from outside a running
deployment. For anything whose mechanism lives in C#, it can only ever return MISS — which is why
every arm goes to source and none of them goes to us.

`derived/pin.json` already holds `platformVersion` and a `releaseRegistry` URL that maps a platform
version to its module versions. **The base already knows which tags are installed on the deployment
it was extracted from, and does nothing with it.** Filed as VCST-5975.

**We may be wrong about this being the main gap. Say so if you think so.**

---

## Where we know the measurement is weak

State these back to us if they change your answer.

* **n = 1 per arm per round.** Three rounds, nine runs. Round 1's own noise band was 83–319.
* **The same person designed the tasks, wrote the oracles, ran the arms and graded them.** That is us.
* **Three instrument defects were found by accident rather than by the check that owned them**: a
  settings file that silently gave one arm an extra tool for two whole rounds; a leak check whose
  directory walk stopped one level above the only folder an arm writes into; a prediction that named
  the wrong channel and so measured nothing. All three are now structural checks — but the pattern
  is that our checks do not catch our own errors.
* **Round 3's design premise was falsified by all three arms in under fifteen minutes each.** We
  claimed the answers existed in no repository. They did.
* **Round 3 leaked a real password hash into seventeen saved artefacts** before anyone noticed.
  Redacted and verified; recorded because it is exactly the class of thing we want you looking for.

---

## What we are NOT asking

* Not "is the code good". Read it if it helps, but the question is about outcomes.
* Not "should we keep going". That is our call.
* Not for encouragement. If the honest answer is that a corpus of this shape cannot beat an agent
  with a browser and a source MCP, we would rather hear it now than after a fourth round.

---

## Everything you can read

| what | where |
|---|---|
| the tool | `C:/_VIRTO/vc-kb-lab` — `src/`, `bin/kb.mjs`, `README.md`, `docs/ADOPTION.md`, `docs/HISTORY.md` |
| the corpus | `C:/_VIRTO/vc-knowledge` — `captured/`, `flows/`, `derived/`, `demand.jsonl` |
| 12 exploratory runs | `measurements/kb-live-2026-09/RUN-0*-CONDITIONS.md` + `MEASUREMENT-archive/run-*/` |
| the three comparisons | `measurements/kb-comparison-2026-09/` — TASK / ORACLE / CONDITIONS / RESULT per round, `VALIDITY.md`, `preflight.mjs`, `arena-settings/` |
| every arm's own report, log and artefacts | `C:/_VIRTO/_comparison-logs/` — round 1 in `arm-{A,B,B2,C}/`, then `round2/`, `round3/`, `round3-prep/` |
| sealed predictions | `C:/_VIRTO/_predictions/` — verify with `node measurements/kb-live-2026-09/preregister.mjs verify <file> <hash>` |
| retrieval and regrade experiments | `measurements/kb-retrieval-2026-09/`, `kb-regrade-2026-09/`, `kb-arrival-2026-09/` |

### Two hard rules while you look

1. **`kb ask` and `kb how` WRITE** — they append a demand row. To probe the corpus without changing
   it, copy it and pass `--base <copy>`.
2. **Do not run anything against the deployment.** Every number here came from a live B2B stand that
   other people use.
