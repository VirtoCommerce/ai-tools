# The knowledge base's procedural plane (flows) — a separate QUESTION, not a separate folder

**Date:** 2026-09-21 · **Status:** proposed, nothing built. This fixes the shape before any code is written.

Never loaded by an agent. When this is built, the normative text will be `scripts/kb/**` plus one line
each in `CLAUDE.md` §Essential Rules → *Product context* and `.claude/rules/agents.md` §Agent Delegation.
This file is the evidence behind the shape and the record of what was deliberately not taken from the
prior art.

---

## The question

Agents derive **paths** and throw them away: how to place an order on this storefront, how to read that
order back in Admin, how to reach a module's Swagger JSON, which blade actually opens the Orders module.
None of it is a claim about behaviour, so none of it fits the base as it stands. Should the base hold
procedures, and in what shape?

## What was already true before deciding anything

**Demand, from the base's own logs** (`vc-knowledge/log/**/*.jsonl`, all 52 files, measured 2026-09-21):
110 `ask` calls, **32 non-answers (29%)**. Sixteen questions are phrased procedurally. Two misses are
procedures outright:

```
miss ← "vcst-qa storefront checkout flow — what steps and payment methods are available to place an order?"
miss ← "how do you search customer orders by order number via the Platform REST API"
```

**The status quo is worse than "not recorded".** Procedures *are* being written down today — into
per-engineer memory directories under `~/.claude/projects/<project>/memory/`. On one machine, **26 of 38
memory files are procedures** ("how to stand up a local stack", "how to reproduce a sample-data import
bug", "the transition ladder that closes a VP ticket"). That directory is untracked by construction, so
every one of them reaches exactly one laptop — the failure `CLAUDE.md` §What reaches a teammate already
names for rules.

**The cost of not having one is on record.** From a flow entry's own body: run 07 *"spent 78 calls between
reaching /cart and seeing the order in Admin, most of them rediscovering these steps."*

## The prior art, and why it is decisive here

`VirtoCommerce/vc-kb-lab` (public) **already built this plane** and ran it for eleven sessions; three live
flow entries survive in `vc-knowledge` on branch `archive/kb-v3-2026-09-18` under `flows/`. Everything
below that is attributed to "the lab" comes from `src/planes.mjs`, `src/resolve.mjs`, `src/capture.mjs`,
`docs/HISTORY.md` and the `measurements/` directories of that repo.

The single number that settles whether this is worth building — corpus utilisation, *ever served in any of
107 retrievals or ever anchored on a coordinate touched in any of 4,223 logged tool calls*
(`measurements/kb-utilization-2026-09/`):

| Entry shape | Ever in front of anybody |
|---|---|
| Generated GraphQL types | 11% |
| Generated GraphQL mutations | 15% |
| Generated REST endpoints | 29% |
| Facts written by agents | 69% |
| **Flows** | **100%** |

78.5% of that corpus had never been seen by anyone. Not one flow was unused. The lab's own summary: *"the
plane that is free to generate is the dead one; the plane that costs a run to write is the live one."*

---

## Decision 1 — a flow is not a fact, on four properties at once

| | fact (today's base) | flow |
|---|---|---|
| identity | `anchors + scope` | **`goal + scope`** |
| retrieval key | question words + a coordinate (`ANCHOR_BONUS = 10`) | the goal's verb and object; a procedural question names **no** coordinate |
| validation | somebody saw it again | somebody **walked it** and reached the terminal state |
| how it rots | wholesale — the behaviour changed | **partially and silently** — step 4 of 7 moved |

Anchors cannot identify a procedure: *"'place an order' and 'cancel an order' both touch `/cart` and
`/account/orders`, so an anchor rule would call two different procedures one procedure and refuse the
second"* (lab, `src/capture.mjs`).

## Decision 2 — the load-bearing one: a separate QUESTION, enforced in three places

**A flow in the fact corpus poisons retrieval, and it is not a size effect.** Measured by the lab on
2026-09-14: one flow entry — a route sequence for placing an order — written into the experiential plane
as an ordinary capture **cleared the relevance floor on 18 of 34 replay rows** and took rank 1 on *"which
endpoint lists the payment methods a store has enabled"*. Four comparably long **facts** cluster at 6–7
rows. It was retired the same day.

The cause is structural, not dimensional. A long *fact* accumulates specific terms (`OrderConfigurationItemType`,
`sectionId`); a *procedure* accumulates the generic nouns of a journey — cart, order, payment, product,
search, Admin — so it is a plausible answer to most questions asked in ordinary words. Token-frequency
damping is inapplicable: it removes the bias from *repeated* terms, and the problem here is *distinct* ones.

**A separate index does not fix this.** The lab had separate indexes for two planes and they still competed,
because `ask` concatenated both and sorted by raw score. Our v1 has the same property by construction:
`index-load.mjs:loadIndex` merges every declared index into one row list and `ask` ranks over the merge.
The lab's conclusion, adopted verbatim: *"the plane exists so that the question can."*

Three layers, all required:

1. **Disjoint corpora.** `kb_ask` never sees a flow; `kb_how` never sees a fact.
2. **A flow is served only when its GOAL is what was asked** — a strict majority of the question's content
   terms must land in `subject`/`question`, not in the steps:
   `aboutGoal = (goalTerms, queryTerms) => goalTerms.length > queryTerms.size / 2`.
   Without it, defect **D4** of the lab's 2026-09-16 review: with three flows in the plane,
   `how "cancel an order"` returned the order-**placement** flow and `how "log in to admin"` returned it
   plus a promotion flow — two words in a body clear a floor of two, and a flow's steps mention every noun
   of a journey. Validated afterwards against 88 real questions nobody wrote for it: **0 false hits,
   2 false misses, best of six candidate rules**. It also showed D4 was understated — before the rule, the
   flow plane answered **74 of 88** real questions.
3. **`ask` refuses a procedural question** rather than answering it out of the fact planes with whatever
   mentions the same journey. Same goal rule, applied on the question side.

On a miss, `ask` **points at** `kb_how` and names the flow; it never merges one into its results —
*"a pointer rather than a merged result, because merging is the thing this design exists to avoid."*

**The accepted cost: no synonym recall.** `how "checkout"` is a MISS, because no flow's goal says
"checkout". Taken deliberately — a miss costs a lookup, a confidently wrong procedure costs the run.

## Decision 3 — its own index, the same `entries/` folder, a `KBF-` id prefix

**Own index: yes, and it is half-built already.** `kb.json` carries a plane→index map that three of our
four layers already honour:

| Layer | Multi-index today |
|---|---|
| Read — `core/index-load.mjs:loadIndex` | **built** — reads every declared index, tags each row with its source index |
| Repair — `core/verbs.mjs:reindex` | **built** — inverts the manifest, buckets rows by plane, writes each file |
| `stat` | **built** — already reports `cat.indexes` |
| Write — `core/push.mjs` | **not built** — `index.json` is hardcoded: one read, one rebuild, one write |

So the work is: one line in `kb.json`, `index-flows.json` added to the containment allowlist in
`push.mjs:outsideBase`, and plane-aware index writing in `push.mjs`. That file holds the atomic commit, the
ref compare-and-swap and the write-containment guard — it is the most dangerous file in the base, and all
of the work is in it. The work is mechanical, not architectural.

**Separate folder: no**, against the lab, which has `flows/`. Three reasons:

- **The lab's own analysis does not credit the folder.** `src/planes.mjs` says in terms that *"a separate
  directory alone would not have fixed it… what removes the competition is a separate QUESTION."* The
  folder was adopted in a four-plane base where *"`entries/` and `derived/` were the same plane under two
  names"* and nothing else said which plane a file belonged to. In our v1 the plane is in the frontmatter
  **and** in the index row, so that reason does not transfer.
- **It is a second encoding of the plane that can disagree with the first.** `reindex` already treats a
  path that disagrees with its entry's id as unresolvable (*"two entries wearing one address"*); adding a
  third participant makes the repair verb weaker, and the repair verb is the last line of defence.
- **It buys browsing only,** and nothing browses this base — its own README says *"For the counts, run
  `kb stat`."*

**Instead: a `KBF-` id prefix.** `canonical.mjs:mintId(subject, namespace = 'KB')` already takes the
argument and nobody passes it. The plane then shows up everywhere a name appears — the log line, the commit
message, an `@kb(KBF-…)` citation, the served result, the filename — where a folder shows up only in
GitHub's file tree. Cost: the namespace argument, the `/^KB-[0-9A-F]{8}\.md$/` filter in `core/reader.mjs`,
and the `idRule` string in `kb.json`.

## Decision 4 — identity is `(goal, scope)`, and it must be plane-scoped

`findDuplicate` compares `anchors + scope` across **all** rows. A flow carries anchors too, so without a
plane filter the base refuses this pair as one fact:

```
fact  «on /checkout the payment step is locked until a delivery method is chosen»
      anchors: /checkout   scope: surface=storefront-ui
flow  «place an order on the storefront»
      anchors: /checkout   scope: surface=storefront-ui     ← identical key, capture refused
```

**This trade is UNMEASURED and is taken deliberately**, carried over from the lab with its reasoning: two
writers will phrase one goal differently and the base will hold that flow twice; that failure is visible
and consolidation can fix it. The opposite failure — refusing a legitimate second flow because it shares a
route with the first — is invisible, and the writer works around it by inventing an anchor, which is how a
guess enters a corpus. **Duplicate-but-visible beats refuse-legitimate** until somebody measures it.

## Decision 5 — steps stay prose; `amend` is the primary write verb, not `confirm` and not `ran`

Observed proportion on the lab's live flow `KB-AFB2D3C5` after five walks: **5 confirmations, 6 amendments.**
The dominant event is not *the flow broke* — it is *the flow works and is incomplete*.

Neither existing verb reaches it. From `src/planes.mjs`, found on the plane's first day:

- `dispute` is for a claim contradicted by an observation. **An omission contradicts nothing**, and the run
  was right not to reach for it.
- `supersede` mints the id from the subject, and **a flow's subject IS its goal**, which by definition does
  not change when a step is fixed. It refuses: *"id … is already held by a DIFFERENT fact."*

So run 08 had to choose between losing the improvement and fragmenting one procedure into two goals, and it
lost it. Run 09 hit the same wall, and `kb amend` was built. The principle: *"an anchor is an address rather
than a claim, so correcting it must not destroy the id; a flow's STEPS are not its identity either, its goal
is, so amending them must not destroy the id."*

Three properties of `amend`, each one earned:

- **An errata section, never an edit in place.** Rewriting a step would leave every evidence row above
  attesting to text its observer never walked.
- **Amending is not confirming.** Run 09 confirmed a flow and would have amended it in the same breath; one
  walk would then have counted twice. `amend` does not raise trust.
- **`--deployment` is required on the amendment itself.** It was not, for two days, and both amendments
  written in that window landed unstamped — a correction to a procedure that says nothing about where or on
  what version it was seen.

**Steps stay prose in the body.** This reverses an earlier proposal in this analysis to structure them as
frontmatter `steps[]`: the lab's flow bodies read well, and structuring them would make `amend` an
edit-in-place, which is the one thing it must not be.

### Three deviations from the lab

**5a — `--step` must be an integer, validated against the body.** The lab requires only that it be
non-empty, and its shipped data shows the consequence: one amendment on `KB-AFB2D3C5` has an entire
paragraph in the step field and renders as `**Step An order CAN be deleted once placed, as well as
cancelled. DELETE /api/order/customerOrders …**`. Validate `--step <n>` against the `STEP <n>` headings the
body already carries. No new frontmatter.

**5b — a REFUTING amendment must mark the step it refutes.** The lab appends errata and never touches the
step, which is right for an evidence trail and wrong for first-read correctness. On the live entry, the
steps say *"An order cannot be deleted once placed — only cancelled"*, and the sixth amendment, six
paragraphs below, says it *"is false and was false when written"*. A misread fact costs a wrong belief;
a misread **procedure** costs the run walking into a wall, and first-read correctness is the whole product
of a procedure. So: a completing amendment is errata as the lab has it; a refuting one additionally writes
an inline marker in the step (`STEP 6 — …  ⚠ disputed, see Amendments`). The step's text is not rewritten,
so the evidence-integrity argument still holds.

**5c — a rewrite rule.** The lab has no threshold at which a flow is reconsolidated rather than further
appended. Six errata over five walks is the signal to re-walk and `supersede` under the same goal (the
`ignoreId` exemption that makes same-fingerprint replacement possible already exists).

## Decision 6 — a flow's trust is a walk, not a sighting

`evidence[]` on a flow carries `method: replay` and `reached: terminal | failed-at-<n>`, and the entry is
read together with `canonical.mjs:deploymentPin` — the module-version fingerprint of the deployment the
last successful walk happened on. A flow served on a deployment whose pin differs says so. A `failed-at-N`
is the flow's form of dispute and must name the step.

---

## What this knowingly does not get

- **No cross-plane contradiction check.** The lab's gate compares a written claim that something *cannot*
  be done against a contract that publishes the operation doing it (1 flag over 70 active entries, real;
  3 of 3 planted contradictions caught; 0 of 2 legitimate impossibility claims falsely flagged). It caught
  the twelve-run "an order cannot be deleted" error, and **anchors cannot catch that class** — the flow was
  anchored on `/cart`, `/search` and `/account/orders`, never on the delete route. Our v1 has no derived
  contract plane, so this cannot be built. Decision 5b is the partial substitute. **This hole stays open
  and is the strongest argument that would ever be made for a contract plane.**
- **The goal rule is tuned at three flows.** 0 false hits / 2 false misses was measured with three flows in
  the plane against 88 questions. Its behaviour at fifty flows is unknown either way.
- **No synonym recall**, by Decision 2.

## Scope — what goes in this plane, and what already has a home

A procedure belongs in the base only when **all four** hold: it is about the deployed product, not our
tooling; it was derived by observation, not written from a spec; it is a **means, not an end** — nobody is
asserting anything about it, it is what you must do before you can assert something; and it is not already
executable.

| Already has a home | What lives there | Why it is not a flow |
|---|---|---|
| `regression/suites/**.csv` | `Preconditions / Steps / Assertions / Cleanup` | **If it asserts, it is a test case** |
| `.claude/skills/*` | how an agent performs a task type | our tooling, authored, reviewed in a PR |
| `scripts/seed-data/` | provisioning procedures | it is code |
| `.claude/knowledge/domain/*.md` | surface inventory | says *where things are*, not *how to traverse* |
| `.env.<env>` | stand and Swagger URLs | environment constants, not derived |

Worked example, because the same words route two ways: *"the steps for placing an order on the storefront"*
is a **suite case** when placing the order is what is being verified, and a **flow** when an order is merely
the precondition for verifying something else.

**The base is public.** A procedure carries stand URLs, account names and admin paths far more often than a
claim does, and `secret-gate` scans values rather than prose. Everything environment-specific goes in as a
`{{VAR}}` token under the existing GOLDEN RULE in `.claude/rules/test-data.md`, and the secret gate is
extended over step text. Note one schema divergence this creates: a menu path is refused in `anchors`
(`LOOKS_LIKE_A_MENU_PATH`) and is legitimate inside a step.

## Build order, and the stop condition at each stage

Ordered by dependency, not by size. The question split comes first because until it exists, adding flows
makes the base worse by a measured 18 rows in 34.

| Stage | What | Stop condition |
|---|---|---|
| 0 | Classify the existing 110 asks for procedural intent; count tool-calls-to-goal in `.claude/hooks/kb-harvest.mjs` | Under ~10% procedural misses — do not build |
| 1 | `aboutGoal`; plane filter in `ask`; `ask` refuses procedural questions; the pointer to `kb_how` | — |
| 2 | `push.mjs` multi-index; `kb.json` line; `outsideBase` allowlist | — |
| 3 | `kb_flow_capture`, `kb_how`, `KBF-` prefix | — |
| 4 | `kb_flow_amend` with 5a, 5b; `kb_flow_ran` | Build 5c when a flow passes six amendments |

**Acceptance is one number, measurable today:** tool calls from goal stated to goal reached, before and
after. `kb-harvest.mjs` already reads the transcript.

**Measurement hazard, from the lab, that applies directly to stage 0:** *"a held-out set taken from a COPY
of the corpus is not held out"* — `ask` and `how` write a demand row, so probing a copy appended the probe's
own questions to the set being measured; 88 became 93 and every score moved. **Freeze the question list in
a file before the first probe.**

---

## Sources

- `VirtoCommerce/vc-kb-lab` — `src/planes.mjs`, `src/resolve.mjs` (`how`, `aboutGoal`, `flowsMatching`),
  `src/capture.mjs` (`fingerprint`, `amend`), `docs/HISTORY.md`, and the measurement directories
  `kb-utilization-2026-09/`, `kb-flowmiss-2026-09/`, `kb-retrieval-2026-09/`, `kb-contradiction-2026-09/`
- `VirtoCommerce/vc-knowledge` — branch `archive/kb-v3-2026-09-18`, `flows/KB-AFB2D3C5.md` (the worked
  entry quoted throughout), `flows/KB-A54C919F.md`, `flows/KB-EB228603.md`
- This repo — `scripts/kb/core/{index-load,index-build,identity,rank,push,canonical,reader}.mjs`,
  `.claude/hooks/kb-harvest.mjs`; the demand figures from `vc-knowledge/log/**` as of 2026-09-21
- The kb v1 `PLAN.md` §2b (*"multiply indexes, never folders"*), §11 (*build it when the log shows*) —
  kept outside this repository, in the planning directory beside the checkout
